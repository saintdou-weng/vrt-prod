# v4.15 checks (2026-10-05) — PROD ↔ ERP entry links + ERP 對照中心 (ERP link centre, 規格書 Phase 0/1)

Run from the repo root with Node 20+. No Google, Telegram or ERP traffic: the Apps Script runs in memory
(`qa/v41/gas_harness.js`, built GS under `../gas/out/`, which is OUTSIDE the repo because it holds the bot token).

    node qa/v415/test_erp_link_core.js     # vrt-erp-link-core-v1.js: parse / mapping / dates (ROC, dd-MMM-yy, ambiguous), T03 T05 T06 T07 T10 T11,
                                           # six comparison states, timing / incomparable / missing, daily report traceability, workday helpers   11/11
    node qa/v414/test_telegram.js          # GAS v4.5 (v4.4 + ERP buttons): /prod menu now has 🔗 ERP 對照 + 🏢 VRT ERP; everything else unchanged  18/18
    node qa/v414/test_tg_page.js           # unchanged pages still produce the bot's text                                                     13/13
    node qa/v414/test_sync_fixes.js        # v4.14 sync fixes still hold                                                                      10/10
    node qa/v414/test_portal_overview.js   # portal overview unchanged                                                                        5/5
    node qa/v414/test_i18n_layer.js        # dictionaries now 7,838 keys (new page + core + summary builder + portal cards)                     6/6

Browser check (needs the `playwright` package and a local server on the repo root, e.g. `python3 -m http.server 8765`):

    node qa/v415/browser_erp_link.js       # real Chromium, REAL PROD data (sewing backup 5,009 rows, plan 705, orders 549) + the page's own
                                           # isolated synthetic ERP files: read-only PROD reads (no new DBs), demo isolation (T01), import → mapping
                                           # → preview → commit, re-import idempotence (T03), compare tabs, daily draft, ✈️ modal, cloud push/pull
                                           # round trip through the real GAS code, EN / KM                                                   10/10

What is NOT covered — and stays **NOT TESTED** until the real files arrive: comparison against a real ERP export
(W_COD700 / W_CBL300 style files). The synthetic rows (`VRTErpLink.sampleFiles()`) exist only to exercise the mechanics and
are flagged `is_demo` when loaded through the page's 「載入隔離測試資料」 button (never stored, never pushed, excluded from
the daily report). Importing those same CSVs through the normal import path (as the browser check does) stores them like any
file; clear them with 「清除本頁資料庫」 before real use.

Results: `erp_link_core_results.json`, `browser_erp_link_results.json`. Screenshots: see the delivery's `screenshots_v415/`.
