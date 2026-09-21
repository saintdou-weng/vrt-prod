# v3.9 regression checks

Run from any directory using Node 20 or newer:

```sh
node qa/v39/run_all.js
```

No npm packages, browser downloads or live cloud calls are required. The six Excel fixtures are the exact uploaded workbooks in `release_sources`.

`runtime_harness.js` deliberately simulates the DOM and IndexedDB. These checks execute the actual application parsers, import/commit/render functions and shared sync client. They do not prove browser layout, browser-specific IndexedDB behavior, network permissions, Apps Script quotas, or the live server's implementation.

`qa_logic.js`: all HTML/JS syntax, actual maintenance workbook parsing and cost math.
`qa_ie_runtime.js`: actual IE/OBD files, repeated imports, publication, Excel/CSV round trips.
`qa_smv_runtime.js`: formal input routing, deduplication, effective dates, customer ambiguity and history.
`qa_bom_runtime.js`: one authoritative BOM, quotation saves and stale-save rejection.
`qa_import_roundtrip.js`: more than 180 BOM styles, variants, partial import, CSV, stock CRUD, Needle Change updates.
`qa_maintenance_runtime.js`: actual three source workbooks, rendering, IDB and exports.
`qa_sync.js`: mock manifest/bucket/commit, no-change transfers, changed-part increment, no less-over-more.

The older `../run_prod_audit.js` and v3.7/v3.8 result files are retained from the uploaded ZIP for history. They are not v3.9 results; the old runner references a GS file that was not included in the latest uploaded ZIP.
