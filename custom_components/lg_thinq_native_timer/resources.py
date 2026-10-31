"""Remove only redundant local resource entries owned by this integration."""
from urllib.parse import urlsplit

CARD_PATHS = frozenset({
    "/lg_thinq_native_timer_card.js",
    "/lg_thinq_native_timer_static/lg-thinq-timer-card.js",
})


def is_card_resource(item):
    """Match exact known local URLs, regardless of their version query."""
    if not isinstance(item, dict) or item.get("type") not in ("module", "js"):
        return False
    url = item.get("url")
    if (not isinstance(url, str) or not url.startswith("/")
            or url.startswith("//") or any(c in url for c in "\r\n\t")):
        return False
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    return not parts.scheme and not parts.netloc and parts.path in CARD_PATHS


async def cleanup_resources(lovelace, backup):
    """Use HA's collection API, saving a backup before the first deletion.

    YAML resources remain under the user's control; never rewrite YAML or
    edit HA's resource storage files directly. Automatic frontend loading
    must already be registered before this function is called.
    """
    collection = getattr(lovelace, "resources", None)
    if collection is None:
        return {"status": "unavailable", "removed": 0}
    await collection.async_get_info()  # Loads storage through the supported API.
    candidates = [dict(item) for item in collection.async_items() if is_card_resource(item)]
    if getattr(lovelace, "resource_mode", None) != "storage":
        return {"status": "yaml_manual" if candidates else "ok", "removed": 0,
                "remaining": len(candidates)}
    # Missing IDs must not turn a cleanup into deleting unrelated resources.
    candidates = [item for item in candidates if isinstance(item.get("id"), str)]
    if candidates:
        await backup(candidates)
    removed = 0
    for item in candidates:
        await collection.async_delete_item(item["id"])
        removed += 1
    return {"status": "ok", "removed": removed}
