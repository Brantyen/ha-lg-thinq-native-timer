# LG ThinQ Native Timer
[![Checks](https://github.com/Brantyen/ha-lg-thinq-native-timer/actions/workflows/check.yaml/badge.svg)](https://github.com/Brantyen/ha-lg-thinq-native-timer/actions)

Home Assistant 的 LG 除濕機原生關機定時，搭配 ThinQ 風格儀表板卡片。
使用官方 **LG ThinQ** 整合已有的連線，不需輸入第二份 Token。

## 功能

- 圖形化選擇除濕機，避免手動填錯實體 ID。
- 下拉選擇 1–12 小時，提供 1、2、4、8 小時快捷選擇。
- 套用及取消 LG 原生定時，不以 HA 本地倒數關閉電源。
- 顯示 LG 原生狀態及預估剩餘時間；可手動重新整理。
- 卡片在前景開啟期間每 5 分鐘讀取一次。兩次讀取之間的剩餘時間是估計值，不會在前端發出到時關機指令。
- 電源按鈕沿用官方實體的電源控制。
- 配合 HA 主題的深淺色介面與手機版排版。
- 一個 HACS「整合」儲存庫包含後端與卡片，啟用後自動載入卡片 JavaScript。

## 安裝：HACS 自訂儲存庫

[在 HACS 開啟此儲存庫](https://my.home-assistant.io/redirect/hacs_repository/?owner=Brantyen&repository=ha-lg-thinq-native-timer&category=integration)

或手動操作：

1. HACS → 右上角選單 → 自訂儲存庫。
2. 儲存庫填入：
   `https://github.com/Brantyen/ha-lg-thinq-native-timer`
3. 類型選「Integration／整合」，不要選 Dashboard。
4. 找到 **LG ThinQ Native Timer**，下載。
5. 完整重新啟動 Home Assistant。
6. 設定 → 裝置與服務 → 新增整合 → **LG ThinQ Native Timer**。
   請先完成官方 LG ThinQ 整合的設定。
7. 重新整理 HA 網頁。到儀表板「新增卡片」，搜尋 **LG ThinQ 原生定時**。
8. 在卡片編輯器下拉選單選擇自己的 LG 除濕機電源 `switch` 或 `humidifier` 實體。

此儲存庫是 HACS 自訂儲存庫，不表示已收錄 HACS 預設清單。

### 已安裝 0.1.x 的使用者

既有 `configuration.yaml` 的設定可保留：
```yaml
lg_thinq_native_timer:
```
這樣不必再新增一次整合；下載新版本後仍需要完整重新啟動 HA。
不要同時手動搬移 HACS 管理中的檔案。

### 手動下載

[下載 GitHub 原始碼 ZIP](https://github.com/Brantyen/ha-lg-thinq-native-timer/archive/refs/heads/main.zip)

解壓縮後，將 `custom_components/lg_thinq_native_timer` 整個資料夾放到 HA 設定目錄：
```text
/homeassistant/custom_components/lg_thinq_native_timer/manifest.json
/homeassistant/custom_components/lg_thinq_native_timer/__init__.py
/homeassistant/custom_components/lg_thinq_native_timer/frontend/lg-thinq-timer-card.js
```
某些安裝的設定目錄顯示為 `/config`，使用實際放置 `configuration.yaml` 的那個目錄即可。
不要放成 `custom_components/custom_components`。
完整重啟後依上述步驟新增整合，或沿用 YAML 設定。

## 卡片 YAML（可選）

使用圖形編輯器即可；以下是手動設定範例，實體 ID 請換成自己的：

```yaml
type: custom:lg-thinq-timer-card
entity: humidifier.your_lg_dehumidifier
name: 客廳除濕機
```

如果卡片找不到：
1. 確認後端整合已啟用，且已完整重啟。
2. 瀏覽器重新整理／清除前端快取。
3. 如有需要，到儀表板資源新增 JavaScript module：
   `/lg_thinq_native_timer_card.js?v=0.2.5`
   同一網址不需重複新增。

## 原生動作仍可使用

```yaml
action: lg_thinq_native_timer.inspect_timer
data:
  entity_id: humidifier.your_lg_dehumidifier
```

```yaml
action: lg_thinq_native_timer.set_timer
data:
  entity_id: humidifier.your_lg_dehumidifier
  minutes: 120
```

```yaml
action: lg_thinq_native_timer.cancel_timer
data:
  entity_id: humidifier.your_lg_dehumidifier
```

`inspect_timer` 與 `cancel_timer` 不接受 `minutes` 欄位。
取消定時不會發出電源關機指令。

## 支援狀況與實際驗證

目前依 **DHUM_231006_WW** 實際 profile 編寫：
- `relativeHourToStop`：number，可讀可寫。
- `relativeMinuteToStop`：number，唯讀；本機型只能從公開欄位設定整數小時。
- `relativeStopTimer`：可寫入的列舉只有 `UNSET`，用於取消。
- 設定兩小時送出 `{"sleepTimer":{"relativeHourToStop":2}}`。
- 0.1.1 的原生設定與取消已由使用者實機確認可執行。
- 0.2.0 新增卡片與自動載入，尚待真實 HA 安裝與前端實機驗證。
- 1–12 小時是卡片選項範圍，並非已確認所有時數都由每台機型支援；設備若公布限制會套用，未公布時以 LG API 實際回應為準。
- API 接受指令和讀回吻合是不同結果；未讀回確認時，卡片明確顯示等待確認。
- 到時關機、HA 停機期間行為仍需依設備實測。
- 依 HA 2026.10 官方整合內部結構編寫，HACS 最低版本限制為 2026.2（官方加入 humidifier 實體之後）；未逐版驗證舊版 HA。

官方 LG SDK 的除濕機類別尚未映射 sleepTimer，本擴充使用同一官方連線存取原始 profile 與控制 API。
若 profile 不允許寫入，程式會拒絕送出，不假造控制能力。
沿用官方整合內部 `runtime_data.coordinators`，HA 更新後可能需要相容性修正。
不支援 Homebridge 或 HACS SmartThinQ LGE Sensors 的實體。

## 測試與開發

```sh
python -m unittest discover -s tests -v
node --check custom_components/lg_thinq_native_timer/frontend/lg-thinq-timer-card.js
node --test tests/card.test.cjs
```

包含 11 項定時邏輯測試與 12 項卡片測試：真實 profile、只寫可寫欄位、
取消參數、錯誤提示、未確認狀態、設備切換競態、電源控制與圖形編輯器。
卡片測試使用 DOM 與 HA API 模擬，不取代真實 HA 整合測試。

介面預覽：
```sh
python -m http.server 8768 --bind 127.0.0.1
```
開啟 `http://127.0.0.1:8768/dev/preview.html`。
預覽使用模擬資料，不連接真實設備。

GitHub Actions 的 **Publish installable ZIP** 工作流程可手動產生 Release 與整合 ZIP。
HACS 自訂儲存庫也可以直接從預設分支安裝，不要求先發佈 Release。

## 隱私與移除

不包含 LG Token、設備 ID、帳號或使用者家中設定。
不將資料傳送至其他服務；前端透過既有 HA 連線操作，後端只連線 LG API。
本專案是社群擴充，與 LG 官方 App 無隸屬關係，未使用 LG 標誌。

移除卡片、YAML 設定或 UI 整合後重新啟動 HA，再由 HACS 移除檔案。
移除擴充不會取消已設定的原生定時，請先在 ThinQ App 或 HA 取消。

## v0.2.3：分開定時與電源實體

卡片可為原生定時查詢／設定／取消，以及電源控制，分別指定實體。
留空 power_entity 時維持原有行為。編輯器同時提供下拉選單與可直接貼上 ID 的輸入欄位。

```yaml
type: custom:lg-thinq-timer-card
name: 客廳除濕機
entity: humidifier.living_room_dehumidifier
power_entity: humidifier.living_room_dehumidifier_power
grid_options:
  columns: 12
  rows: auto
```

這兩個 ID 是使用者的配置範例；請換成自己測試成功的實體。
若手動管理前端資源，更新為 JavaScript 模組：
`/lg_thinq_native_timer_card.js?v=0.2.3`，移除同卡片舊版資源並重新載入前端。
HACS 更新後完整重新啟動 HA。新增分開實體的測試，卡片測試共 16 項。
同一 LG 設備的不同官方實體，理論上會由後端解析至同一設備；此改動不代表已證實 ID 差異是未讀回定時的唯一原因。


### v0.2.4：送出後自動同步

設定或取消定時後，會立即查詢狀態，若尚未吻合，約在 2、5、10 秒再次查詢（另加 API 回應時間）。確認期間卡片顯示「等待確認」，讀回符合狀態後直接更新倒數或取消狀態。這些查詢不會重送控制指令。若仍未確認，保留提示，可稍後重新整理；後續查詢確認吻合時，也會清除先前的通知。

更新後請重新啟動 Home Assistant，並將已手動加入的卡片資源網址更新為 `/lg_thinq_native_timer_card.js?v=0.2.4`，再重新載入手機或瀏覽器頁面。


### v0.2.5：背景確認與卡片即時更新

指令只送出一次。服務完成首次讀取後便回傳，不再等待多次同步查詢。
若 LG 尚未回報新狀態，後端會在送出後約 5、15、30、60、120、180、300 秒讀取狀態
（API 回應與同設備操作可能使時間延後），最多進行七次背景查詢。
關閉卡片後仍會繼續確認；HA 停止時會取消背景工作，重新啟動不會重送指令。
等待紀錄保存在記憶體，不會跨 HA 重新啟動保留；設備已設定的原生定時不受影響。

- 確認時間會扣除指令送出後已經過的分鐘數，容許分鐘回報的取整差異，避免三分鐘後回報 57 分鐘卻無法確認一小時定時。
- 同設備的新指令會取代前一次背景追蹤。查詢與控制使用同一個鎖，避免競態。
- 卡片接收後端狀態事件自動讀取；等待期間在前景每 15 秒補查，正常狀態維持每 5 分鐘同步。
- 由 HA 動作或其他客戶端呼叫本整合的定時服務，也會啟動相同追蹤；一般 HA MCP 工具不會自動新增這些自訂動作。
- `set_timer`、`cancel_timer` 與 `inspect_timer` 回應增加 `confirmation`，其中 `status` 為
  `idle`、`pending`、`confirmed` 或 `unconfirmed`。確認是對最近一次指令的紀錄，當前設備狀態仍以 `observed` 為準。
- 等待期間不把舊的 `UNSET` 當成設定失敗。五分鐘後仍未確認會顯示「尚未確認」，並提供 HA 通知；後續查詢吻合時會清除通知。
- 背景確認只讀取狀態，不重送定時或發出電源關機指令。

更新後完整重新啟動 HA。若曾手動設定卡片資源，將網址改為
`/lg_thinq_native_timer_card.js?v=0.2.5`，再重新載入瀏覽器／手機頁面。卡片 YAML 不需要修改。

本版已以模擬延遲回報、查詢逾時、後續取消、設備鎖、卡片事件及清理流程測試；
尚未部署至真實 HA，仍需更新後確認實機同步效果。


### v0.2.6：自動清理重複的舊卡片資源

更新後完整重新啟動 HA，整合會先註冊新版卡片的自動載入網址，
再從儀表板的「資源」清單移除以下兩種本機網址的重複項目（含所有版本查詢參數）：

- `/lg_thinq_native_timer_card.js`
- `/lg_thinq_native_timer_static/lg-thinq-timer-card.js`

因此不必再手動新增、刪除或更換這兩種卡片資源。重新載入瀏覽器／手機頁面即可。
不會移除其他卡片、遠端網址、卡片設定或儀表板內容；目前版本的手動資源也會移除，
因為自動載入已經提供同一張卡片。重複啟動不會重複刪除。

刪除前，原始資源項目會備份至 HA 的 `.storage/lg_thinq_native_timer_resource_backup`，
並透過 HA 資源管理 API 刪除，不直接修改 `.storage/lovelace_resources`。
如備份或清理失敗，保留通知供使用者處理，設備控制仍可使用。
`frontend_status` 回應的 `resource_cleanup` 可檢查本次啟動的清理結果。

若資源透過 YAML 管理，整合不會改寫 YAML，而會顯示需手動移除的通知。
瀏覽器已經載入的舊 JavaScript 無法在執行中卸載，更新後仍需要重新載入頁面。
