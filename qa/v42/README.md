# v4.2 QA

Run `node qa/v42/run_all.js` from the website folder, keeping `../AppsScript/VRT_Production_v4.2.gs`.

The runner executes the prior 69 checks plus 12 QC checks using the exact supplied daily and weekly workbooks. It exercises the real JavaScript and Production GS against simulated DOM, IndexedDB and Google services. It does not contact Google or Telegram.

Browser file-protocol preview was blocked by the environment, and no workaround was used. Responsive CSS and rendering callbacks were inspected/tested; no desktop or mobile visual certification is claimed.

Expected source facts: daily 5406/241/5165, weekly 28816/1312/26664, gap 840; combined 79 canonical rows, not 91. A Line 12 zero row remains August 1. Sunday September 20 template cells are excluded.
