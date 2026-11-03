# v4.20.1 checks (2026-11-03) — sewing push/pull deadlock + 📁 掃描資料夾 in ⇧ 智慧匯入

Front-end only (vrt-smart-sync-v3.js 4.6.0, vrt-smart-import-v1.js 1.1.0, i18n +25 keys = 8,957). No GAS change: the live GAS v4.10.2
already has smartManifest / smartBucket / smartCommit(allowShrink). Run from the repo root with Node 20+ and a local server
(`python3 -m http.server 8765`). The GAS runs in memory through `qa/v41/gas_harness.js` (`$VRT_GS`, built file OUTSIDE the repo).

    node qa/v4201/test_sync_shrink.js   # real vrt-smart-sync-v3.js in Chromium, each device its own browser profile:
                                        # 1 device A pushes Jul–Oct (cloud baseline)
                                        # 2 device B re-imports Aug 1–10 (fewer rows per day) + adds Oct 17–31 → push recognises the
                                        #   cloud rows of the re-imported days as replaced (以本機為準) and succeeds (old code: blocked)
                                        # 3 device A (old rows) pulls → gets B's data, same count
                                        # 4 a device that LOST whole days is still blocked; Pull brings them back (補回 N) → push ok
                                        # 5 opening a page again (pull + push, nothing new) transfers nothing                         5/5
    node qa/v4201/test_folder_scan.js   # 📁 掃描資料夾 (File System Access API; OPFS handle passed with scanFolders({dirs})):
                                        # 1 reports anywhere under the folder found + routed by name (_to_delete skipped, .docx ignored)
                                        # 2 開始匯入 → modules; next scan finds 0 new and re-reads nothing (name/size/date cache)
                                        # 3 開頁時自動掃描並匯入: a new report is handed to its module when a page opens, no click
                                        # 4 the QC page imports the queued file · 5 no page errors                                    5/5

Regression on this build (GAS v4.9.1 and v4.9.1 + the v4.10.2 doPost guard): v419 core 6/6, inbox 4/4, deploy_url 3/3, browser 9/9 ·
v4191 6/6 + 2/2 · v418 core 5/5, gas 9/9, browser 7/7 · v417 ie_weekly 4/4, reports_v12 4/4, gas_v47 3/3, browser 4/4 · v416
daily_report 9/9, fixes_b 9/9, inbox 5/5, browser 7/7 · v415 11/11 + 10/10 · v414 tg_page 13/13, i18n 6/6.
Known, not caused by this build: v414 sync_fixes 9/10 (orders 4.13 migration needs the old baseline copy), portal_overview 4/5 (Paul's Production Plan file now has 875 rows, the test expects 705), v414 telegram 16/18 (expects GAS 4.5.0), v416
orders_weekly (June-15 sample not kept), v413 balancing (old IE sample folder moved).
