# Apps Script — 不要把 .gs 放進這個 repo

從 v4.15（2026-10-05）起，所有 Google Apps Script 檔都**不放進 vrt-prod 儲存庫**，因為 PROD 的 GS 內含 Telegram Bot Token
（`CFG.BOT_TOKEN`，承接自原本的 v4.2），ERP 的 GS 內含另一支 Bot 的 Token 與群組 Chat ID。GitHub Pages 是公開網站，
放進 repo 等於公開 Token。

| 專案 | 檔案（單獨交付，只貼在 Apps Script） | 說明 |
|---|---|---|
| VRT Production（PROD 機器人、Smart Sync 後端） | `VRT_Production_v4.6.gs` | 整份貼上取代既有專案 → 部署 → 管理部署 → 編輯 → 版本「新版本」。`/exec` 不變、`pollTelegram` 觸發器不變、Drive 資料不動。v4.6 新增：📰 生產日報／週報（`installDailyReportTrigger()` 執行一次，建 10:00／15:00 日報與週一 10:30 週報觸發器；管理分析版式）、Claude API（指令碼屬性 `CLAUDE_API_KEY`，可選 `CLAUDE_MODEL`）、群組檔案收件（PROD 機器人走 `pollTelegram`；生產群組裡已有的 @ga_po_adminpw_bot 走 `inboxPollBots`，`installInboxBotsTrigger()` 執行一次建 30 分鐘觸發器；都不用 webhook；機器人要在群組並關 privacy mode）、Email 附件（`installInboxGmailTrigger()`，可選）。 |
| PSJERP（ERP 機器人、每日 15:30 排程、唯讀 API） | `PSJERP_AppsScript專用_v0.4.4.gs`（v4.15 交付，本次不變） | 整份貼上取代 0.4.3 → 儲存 → 執行一次 `ADD_PROD_MENU()`。 |

兩個專案**分開維護**：不能把兩份 GS 貼進同一個專案（`doGet` / `doPost` / 觸發器會互相覆蓋），也不能用 PROD 的 GS 取代 ERP 的 GS。
PROD 機器人用 polling（`pollTelegram` 每分鐘），ERP 機器人用 webhook；兩種接收方式各自保留，不可同一支 Bot 同時用兩種。
v4.6 的檔案收件也是輪詢（PROD 機器人在 `pollTelegram`、其他收件機器人在 `inboxPollBots`，規格書 11.2），沒有加 `setWebhook`。

這個資料夾只留：

- `build_gas.py` — 從 repo 外的 v4.2 基底（`../../gas/VRT_Production_v4.2.gs`，或環境變數 `VRT_GAS_BASE`）＋ `vrt-tg-summary-v1.js`
  ＋ `period_summaries_block.gs` ＋ `vrt-daily-report-v1.js` ＋ `daily_report_block.gs` ＋ `inbox_block.gs` 組出 `VRT_Production_v4.6.gs`，
  輸出到 repo 外（`../../gas/out/`，或 `VRT_GAS_OUT`）。
- `period_summaries_block.gs` — 日／週／月／年摘要的 GS 片段（不含任何憑證）。
- `daily_report_block.gs` — v4.6 生產日報：Drive `daily_report_<date>.json`、觸發器、Claude API 呼叫（金鑰只從 Script Properties 讀）、用量記錄、`aiSummary`（D2）。
- `inbox_block.gs` — v4.6 群組檔案收件：`inboxIntake_`（由 `handleMsg` 呼叫）、`PROD_Inbox` Drive 資料夾、`inbox_queue.json`、`import_queue` 工作表、分流表 `INBOX_ROUTES`、Gmail poll、網頁 action。

Script Properties（Apps Script → 專案設定 → 指令碼屬性）v4.6 會用到的鍵：

| 鍵 | 必填 | 說明 |
|---|---|---|
| `CLAUDE_API_KEY` | AI 文字版才要 | Claude API 金鑰。沒填：日報照常產生（規則版），🤖 按鈕會說明未設定。 |
| `CLAUDE_MODEL` | 否 | 不填時第一次呼叫會用 `/v1/models` 自動挑 sonnet 並記下；可在編輯器執行 `claudeListModels()` 看可用 id。 |
| `CLAUDE_PRICE_IN` / `CLAUDE_PRICE_OUT` | 否 | 每百萬 token 美元，預設 2 / 10（只用來估算顯示）。 |
| `INBOX_ROUTES_JSON` | 否 | 追加檔名分流：`[{"re":"regex","module":"fg","zh":"說明"}]`（比對前檔名的 `_`／`-` 會先換成空白）。 |
| `INBOX_BOTS_JSON` | 否 | 其他收件機器人 `[{"id":"gapo","name":"…","token":"…"}]`；交付的 GS 已把 @ga_po_adminpw_bot 寫在 `CFG.INBOX_BOTS`，不用再填。同一支機器人只能有一個接收者：有 webhook 的會被跳過（不會 deleteWebhook），仍被別的 GAS 輪詢的會互搶更新。 |
| `INBOX_MAX_AGE_DAYS` | 否 | 其他機器人第一次輪詢時只收這幾天內的檔（預設 3），避免把舊檔全倒進來。 |
| `INBOX_REPLY` | 否 | `1` = 收到檔案時在群組回一句「已收到 → 模組」（預設只按 👍）。 |
| `INBOX_GMAIL_QUERY` | 否 | Gmail 搜尋，預設 `label:PROD_Inbox has:attachment newer_than:3d`。 |

若曾把舊版本（v4.14 交付包）的 `AppsScript/*.gs` 推上 GitHub，請到 @BotFather 用 `/revoke` 換新 Token 後填回 Apps Script。
