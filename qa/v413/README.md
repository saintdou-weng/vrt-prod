# v4.13 checks (2026-09-30)

Run from the repo root with Node 20+ (no npm packages, no network). Every check runs the real HTML modules in the
simulated browser (`qa/v39/runtime_harness.js`) and the real Apps Script in memory (`qa/v41/gas_harness.js`).

    node qa/v413/test_importer.js      # Daily Needle / Spare Part Change importer: old + new layouts, real files, edge cases   22/22
    node qa/v413/test_stageC.js        # real module pipeline, same file twice, restated source days                             8/8
    node qa/v413/test_qc_kpi.js        # Final QC: sewing-line Top-3 defect KPI, comparison, mock-GS roundtrip                   6/6
    node qa/v413/test_parts_cloud.js   # spare parts cloud buckets (571 → 9 requests), second device, v4.8 → v4.13 migration     5/5
    node qa/v413/test_i18n_parts.js    # EN / KM renders of the spare parts overlay contain no Chinese UI text                   16/16
    node qa/v413/test_realdata.js      # Paul's real backups: sewing 5,009 / cutting 18,663 / orders 549 / plan 705 → export, re-import, mock-GS roundtrip  12/12
    node qa/v413/test_plan_io.js       # Production plan: JSON backup/restore, CSV/XLSX own-export re-import, source xlsx        5/5
    node qa/v413/test_balancing.js     # IE 排線與機台 tab with real plan/sewing/needle data: math, simulation, changeover, needle KPIs, persistence, Excel A–H  12/12
    node qa/v413/test_io_modules.js    # unified 💾/📥 JSON backup+restore added to customer stats, monthly shipping, fabric stock, official SMV, shipping  5/5
    (the Telegram check moved to qa/v414/test_telegram.js — GAS v4.4)

Inputs:
- `test_stageC.js`, `test_parts_cloud.js`, `test_importer.js` compare against the untouched 4.8 baseline: unzip the
  original vrt-prod-main.zip to `../baseline/vrt-prod-main` (sibling of the repo root) before running them.
- `test_realdata.js`, `test_balancing.js`, `test_telegram.js`, `seed_gas.js` read the Downloads backups
  (`sewing_backup_2026-09-28.json`, `cutting_backup_2026-09-30.json`, `orders_v3_backup_2026-09-30.json`,
  `Production  Plan From July Until  Dec_2026 (1).xlsx`, IE weekly + pending OBD files) from `DL`; change that constant.
- The uploaded source workbooks are read from the Cowork uploads folder (`UP`); replace with your own path.
- The mock-GS tests execute `AppsScript/VRT_Production_v4.2.gs` (sync API); the Telegram checks use
  `AppsScript/VRT_Production_v4.4.gs` (qa/v414). No Google or Telegram network access happens: `UrlFetchApp` is stubbed and every message is captured.

`seed_gas.js` (run directly) fills one mock GAS with all real datasets through the real module upload paths and writes
`gas_seed_dump.json` with one sample row per bucket family — useful when writing new summaries.
