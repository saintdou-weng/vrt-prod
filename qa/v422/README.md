# v4.22 IE／SMV 改版測試

`node qa/v422/browser_ie_hub.js`（先在 repo 根目錄開 `python3 -m http.server 8765`）

測試資料都在測試裡產生：隨附的 OBD 範例（release_sources/OBD_A2642K_pending.xls、OBD_5209_pending.xls）＋合成的排產、車縫日報、50 台機台清冊。不用真實檔案。

14 項：
1. 零件備品 🏭 機台清冊：匯入預覽、存檔、分頁切換
2. 線別手動改（5 → Line 5）
3. 再匯入不重複、手動線別保留
4. IE 匯入 OBD（原檔保留）
5. 📅 排單看板：預設本週、排產條、車縫沒排的款、上方 IE 數字隱藏
6. 依日：未達計畫、日報 SMV 不同、排產沒排
7. 期間：日／週／月／年、◀ ▶、⦿ 今天
8. 👕 款式頁：OBD 圖、#style= 網址、每日產量圖、SMV 核對、機台需要 vs 現有
9. 款式頁旗標（OBD 未核准、SMV 差）
10. ⚖ 排線試算：帶同一款同一筆排產跳過去
11. 排線 → 機台需求讀機台清冊
12. 網址 #style=5209 直接開
13. 款式庫點款號 → 款式頁
14. 機台別名 DNC→鏈縫、DN→雙針

舊測試（qa/v39 qa_ie_runtime、qa_sync、qa_logic、qa_maintenance_runtime、qa/v413 test_balancing、test_i18n_parts、qa/v414 test_i18n_layer、qa/v43 regression）結果與 v4.21.1 相同（原本就失敗的項目是缺 /mnt/user-data/uploads 真實檔，與本版無關）。
