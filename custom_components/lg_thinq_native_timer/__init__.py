"""Experimental native timer actions using the installed official integration."""
import asyncio
from pathlib import Path
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
import voluptuous as vol
from aiohttp import ClientError
from thinqconnect import ThinQAPIException

from homeassistant.core import SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv, entity_registry as er

from .confirmation import confirm, matches
from .logic import TimerUnsupported, timer_profile, set_payload, cancel_payload, snapshot

DOMAIN = "lg_thinq_native_timer"
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({})}, extra=vol.ALLOW_EXTRA)
BASE_SCHEMA = vol.Schema({vol.Required("entity_id"): cv.entity_id})

def validate_minutes(value):
    if type(value) is not int or not 1 <= value <= 1440:
        raise vol.Invalid("minutes 必須是 1 到 1440 的整數")
    return value

def resolve_device(hass, entity_id):
    entity = er.async_get(hass).async_get(entity_id)
    if entity is None or entity.platform != "lg_thinq" or not entity.config_entry_id:
        raise ServiceValidationError("請選擇官方 LG ThinQ 整合的除濕機實體。")
    entry = hass.config_entries.async_get_entry(entity.config_entry_id)
    runtime = getattr(entry, "runtime_data", None)
    coordinators = getattr(runtime, "coordinators", {})
    for coordinator in coordinators.values():
        prefix = str(coordinator.unique_id) + "_"
        if entity.unique_id.startswith(prefix):
            device = coordinator.api.device
            if str(device.device_type) != "DEVICE_DEHUMIDIFIER":
                raise ServiceValidationError("此版本僅適用 LG 除濕機。")
            return device.thinq_api, device.device_id
    raise ServiceValidationError("官方 LG ThinQ 連線尚未就緒，或其內部介面已變更；請確認整合載入成功。")

async def async_setup(hass, config):
    locks = {}
    pending = {}
    await hass.http.async_register_static_paths([
        StaticPathConfig("/lg_thinq_native_timer_static",
                         str(Path(__file__).parent / "frontend"), False),
        StaticPathConfig("/lg_thinq_native_timer_card.js",
                         str(Path(__file__).parent / "frontend" / "lg-thinq-timer-card.js"), False)
    ])
    add_extra_js_url(hass, "/lg_thinq_native_timer_card.js?v=0.2.4")

    async def frontend_status(call):
        exists = await hass.async_add_executor_job(
            (Path(__file__).parent / "frontend" / "lg-thinq-timer-card.js").is_file)
        return {"loaded_version": "0.2.4", "frontend_file_exists": exists,
                "resource_url": "/lg_thinq_native_timer_card.js?v=0.2.4",
                "static_registration_completed": True}

    hass.services.async_register(DOMAIN, "frontend_status", frontend_status,
        schema=vol.Schema({}), supports_response=SupportsResponse.ONLY)

    async def handle(call):
        api, device_id = resolve_device(hass, call.data["entity_id"])
        lock = locks.setdefault(device_id, asyncio.Lock())
        async with lock:
            try:
                profile = await api.async_get_device_profile(device_id)
                if not isinstance(profile, dict):
                    raise HomeAssistantError("LG 未傳回有效設備設定檔。")
                if call.service == "inspect_timer":
                    state = await api.async_get_device_status(device_id)
                    if not isinstance(state, dict):
                        raise HomeAssistantError("LG 未傳回有效設備狀態。")
                    observed = snapshot(state)
                    if device_id in pending and matches(observed, *pending[device_id]):
                        from homeassistant.components import persistent_notification
                        persistent_notification.async_dismiss(hass, DOMAIN + "_" + device_id + "_unconfirmed")
                        pending.pop(device_id, None)
                    return {
                        "integration_version": "0.2.4",
                        "profile_sleepTimer": timer_profile(profile),
                        "observed": observed,
                        "note": "有狀態回報不等於允許寫入；請檢查 profile 的 mode 與 value.w。",
                    }
                try:
                    payload = (set_payload(profile, call.data["minutes"])
                               if call.service == "set_timer" else cancel_payload(profile))
                except TimerUnsupported as exc:
                    raise ServiceValidationError(
                        "LG API 未宣告允許此定時操作，未送出指令。"
                        "請執行 inspect_timer 並提供回應。 " + str(exc)
                    ) from exc

                # No local countdown and no power command: submit native timer only.
                await api.async_post_device_control(device_id, payload)
                async def read_status():
                    try:
                        state = await asyncio.wait_for(
                            api.async_get_device_status(device_id), timeout=5)
                        return snapshot(state) if isinstance(state, dict) else None
                    except (ThinQAPIException, ClientError, TimeoutError, asyncio.TimeoutError):
                        return None

                requested = call.data.get("minutes")
                observed, verified = await confirm(read_status, call.service, requested)
                if not verified:
                    pending[device_id] = (call.service, requested)
                    from homeassistant.components import persistent_notification
                    persistent_notification.async_create(
                        hass,
                        "LG API 已接受定時指令，但尚未讀回吻合狀態。"
                        "請用 inspect_timer 或 ThinQ App 確認；程式不會自動重送。",
                        title="LG 原生定時：等待確認",
                        notification_id=DOMAIN + "_" + device_id + "_unconfirmed",
                    )
                else:
                    pending.pop(device_id, None)
                    from homeassistant.components import persistent_notification
                    persistent_notification.async_dismiss(hass, DOMAIN + "_" + device_id + "_unconfirmed")
                return {"accepted_by_api": True, "verified_by_readback": verified,
                        "sent": payload, "observed": observed}
            except ThinQAPIException as exc:
                # Do not stringify exception headers or include credentials.
                raise HomeAssistantError(
                    "LG API 拒絕或無法完成操作（代碼 " + str(exc.code) + "）。"
                    "狀態回報並不保證有控制權限；請勿連續重送。"
                ) from exc
            except (ClientError, TimeoutError) as exc:
                raise HomeAssistantError(
                    "LG 連線失敗或逾時。若指令已送出，結果可能未知，請先在 ThinQ App 確認。"
                ) from exc

    hass.services.async_register(
        DOMAIN, "inspect_timer", handle, schema=BASE_SCHEMA,
        supports_response=SupportsResponse.ONLY)
    hass.services.async_register(
        DOMAIN, "set_timer", handle,
        schema=BASE_SCHEMA.extend({vol.Required("minutes"): validate_minutes}),
        supports_response=SupportsResponse.OPTIONAL)
    hass.services.async_register(
        DOMAIN, "cancel_timer", handle, schema=BASE_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL)
    return True

async def async_setup_entry(hass, entry):
    """Actions and frontend are initialized by async_setup for UI and YAML."""
    return True

async def async_unload_entry(hass, entry):
    """Actions are shared with existing YAML setups until the next restart."""
    return True
