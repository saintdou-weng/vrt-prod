# VRT PROD 4.0 executable checks

Run from the project directory with Node 20 or later:

```sh
node qa/v40/run_all.js
```

The runner uses only included source files and the bundled XLSX reader. It combines the inherited v3.9 suite with the v4.0 attachment, recovery, CRUD and final safety checks. It fails on a nonzero child exit or missing newly generated results. Detailed results are written to `RESULTS_v4.0.json`.

Environment: simulated DOM and IndexedDB in Node, with mocked cloud responses. Workbook parsing uses the uploaded originals in `release_sources`. EML checks wrap the unchanged originals in generated MIME messages. Monthly Shipping uses a generated layout fixture because the older uploaded original is unavailable locally.

These checks validate data logic and executed handlers. They do not certify browser layout, mobile gestures, actual IndexedDB quota behavior, production GS permissions or whether the deployed backend accepts `tool: qc`. Native MSG files, complex MIME structures, old OCR paths and the original September 3/4 sewing messages were not revalidated in this release.

`PRESERVATION_v4.0.json` lists added and changed files relative to v3.9. `PROD_MODULE_ACCEPTANCE_v4.0.csv` at the project root records what was and was not accepted per module.
