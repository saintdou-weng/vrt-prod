# v4.16 checks (2026-10-10) — 修改指令 B1 B2 B11 · B3 B7 B8 · C · D1 D2

Run from the repo root with Node 20+. No Google / Telegram / Claude traffic: the Apps Script runs in memory (`qa/v41/gas_harness.js`,
built GS under `../gas/out/VRT_Production_v4.6.gs`, OUTSIDE the repo because it holds the bot token; Telegram, Drive and the Claude
API are stubbed inside the tests). Real sample files come from `../samples/` (copied from the user's Downloads) and `DL`.

    node qa/v416/test_orders_weekly.js   # B1/B2 orders_v3 weekly import: same-size files (Feb-16 / Jun-15 = 124,701 B; Feb-02 / Feb-23 = 124,750 B) all
                                         # imported (SHA-256 content hash), re-import skipped, changed copy updates in place (uid = as_of + customer),
                                         # cross-device no loss + second push 0 commits, import queue refuses pull/push + releases the lock,
                                         # pull started before a write keeps rows, old v4.15 numeric-id cloud rows migrated                     6/6
    node qa/v416/test_fixes_b.js         # B7 shipping AS-OF guard (9 name spellings + sheet row; older file asks, cancel keeps, half-size asks),
                                         # B8 monthly shipping preview with the REAL 1-VRT MONTHLY SHIPPING SCHEDULE.xlsx (cancel saves nothing,
                                         # confirm saves, identical re-import skipped, revised copy = changed 1), B3 customer statistics worker/fallback
                                         # parse of the real 1.7 MB report (same numbers as a plain parse; DASHBOARD + ALL CUSTOMER only),
                                         # B11 dialog layer (auto mode, non-blocking alert, harness fallback) + 0 native confirm/prompt sites in 48 files  9/9
    node qa/v416/test_daily_report.js    # D1: compute (real sewing/cutting backups = shared builder numbers; synthetic full day checked by hand; anomaly
                                         # thresholds), render (fixed bilingual layout, HTML escaped, checkAiText rejects altered numbers), page tab
                                         # (auto once per date, WIP = page STYLES, regenerate, cloud copy, ✈️ proxy, AI not configured), GAS job
                                         # (reads cloud buckets, once per date, trigger reuses the page report, AI: wrong number rejected, cost logged,
                                         # D2 aiSummary number check); 1.1 management layout: RAG, line 判讀/risk class, plan position, QC
                                         # reconciliation, actions, 資料口徑, week mode (real backups + synthetic), Word doc sections                9/9
    node qa/v416/test_inbox.js           # C: pollTelegram document → getFile → Drive PROD_Inbox/<group>/<date>/ → inbox_queue.json + import_queue sheet
                                         # + 👍, duplicate ignored, >20 MB skipped, unknown name unrouted, /prod still answered; web actions
                                         # (list/file bytes/done/reroute/routes + INBOX_ROUTES_JSON); orders_v3 「☁ 待匯入」 → page importer → done;
                                         # auto-import leaves a questioned file pending with the question as note; multi-bot intake (GA PO bot's own
                                         # token, old updates skipped, per-bot offset, webhook-owned bot skipped, underscore names routed)        5/5
    node qa/v414/test_sync_fixes.js      # v4.14 fixes still hold (weekly expectation now 1,827 unique rows)                                      10/10
    node qa/v414/test_tg_page.js         # ✈️ button text unchanged (modal now also has 🤖 AI 摘要)                                               13/13
    node qa/v414/test_portal_overview.js # portal overview unchanged                                                                            5/5
    node qa/v414/test_telegram.js        # GAS v4.6 bot: menus / digests / polling unchanged                                                     18/18
    node qa/v415/test_erp_link_core.js   # ERP link centre unchanged                                                                            11/11
    node qa/v414/test_i18n_layer.js      # dictionaries 8,140 keys (+297: daily report tab, inbox, dialogs, AI buttons, B3/B7/B8 texts)            6/6

Browser check (needs the `playwright` package and a local server on the repo root, e.g. `python3 -m http.server 8765`):

    node qa/v416/browser_v416.js         # real Chromium, REAL PROD data: D1 tab auto-generates + Word download, B11 modal / notices / ?auto=1,
                                         # B7 AS-OF dialog, B8 preview with the real file, B3 worker import (main thread free: 34/34 timer ticks),
                                         # D2 🤖 button, C inbox panel through a mock GAS routed in the browser                                 7/7

NOT covered (needs the real services): Telegram getFile/download and setMessageReaction against api.telegram.org, Drive folder
creation, the Gmail poll (`inboxGmailPoll`), the Claude API itself (stubbed: the tests check the request shape, the model auto-pick
from /v1/models, the number check and the usage log). Also NOT reproduced: the 3-minute freeze reported for B3 — the 10-06 file
parses in ≈ 1.7 s here, in the worker and on the main thread.

Results: `orders_weekly_results.json`, `fixes_b_results.json`, `daily_report_results.json`, `inbox_results.json`,
`browser_v416_results.json`. Screenshots: delivery `screenshots_v416/`.
