# 生產平台持續優化清單（2026-11-26 起）

Paul 11/26 22:36：「生產平台持續優化各項功能，有缺的改掉，數據不對的調整，卡片連接數據不到位或該按的卡片沒得按、按了沒出相關資料或圖表，
手機擠／電腦散都調到最適，該有照片卻沒出現、點了員工沒相關資料等都要想辦法連接到 Admin OS 或 PSJ 系統補強，直到 100% 完整再跟我說。
分頁大概就這樣了；樣品組每日打樣／生產記錄（可 Excel 匯入）是之後可加的，現在不急。」

做法：每晚排程「生產平台每晚優化」（trig_01A5XfUpF23oTFGPUoeq45vz，週一～六 21:41，綁 Paul 筆電）用 Paul 筆電 Chrome 開真實頁面（雲端資料）檢查 → 在 repo 改 → 推上去 → 回真實頁面再驗。
一次做 1–3 項，做完在下面打勾並寫驗證方式。只有全部打勾（或卡在需要 Paul 的事）才通知他。

## 稽核方法（每晚先跑一次，結果記在「最新稽核」）
1. 入口 vrt_hub_v1.html：`VRT_REF` 每一種（parts, needle, defect, fabric, bom, po, machine, accessory, style, line, customer, date, popro, fabtype, sewer…）
   - 卡片數、前 10 張 detail() 有沒有錯／空、有照片欄的有幾張沒照片。
   - 用 `VRTHubOpen(kind,key)` 隨機開 5 張：KPI、圖表、分頁、相關項目能不能點、點了有沒有資料。
2. 每個分頁（VRT_HUBS 裡的 html）：載入有沒有 console error、表格裡款號／PO／線別／機台有沒有變成可點（.vl）、點了有沒有開卡片。
3. 版面：手機 390×844 與桌面 1440×900 各看一次（chrome resize_window 或 headless 對照）；太擠（文字被截、按鈕重疊、表格超出）或太散（一行一個大卡片、空白一大片）都要改。
4. 數字：和原始報表對（車縫日報件數、效率口徑 Σ標準分鐘÷Σ投入分鐘、裁剪件數、出貨箱數）；不對要找出原因再改，不能改數字湊。
5. 員工：車縫員工卡（sewer）讀 PSJHR（同網域 IndexedDB psjhr / db_v1 ＋ photo|id）；沒有資料時要提示「到 PSJHR 打開一次同步」，不要空白。

## 最新稽核（2026-11-26 22:5x，筆電 Chrome，雲端資料）
- 卡片數：parts 444、needle 15、defect 20、fabric 398、bom 90、po 1427、machine 976、accessory 1172、style 753、line 22、customer 13（其餘稽核當時逾時，下次續跑）。
- 照片：雲端 item_photos 只有 defect 15、fabric 186、parts 123、style 109、**machine 1**。B 店機台清冊 326 張照片之前沒進雲端 → 11/26 23:00 已在筆電分 3 批匯入、上傳中（下次先確認 machine 有 ~326）。
- 前 10 張沒照片：parts 10/10、bom 10/10、po 10/10、accessory 10/10、style 9/10、line、customer —— 要判斷是「真的沒照片」還是「key 對不上」（先查 parts／style：雲端有 123／109 張）。

## 待辦
- [ ] 查 B 店清冊 13 列照片沒對到機台（Machine ID 和清冊編號不同？）
- [x] B 店機台照片上雲端（11/26 23:23 確認：idx_machine 314＝原 1＋這次 313；清冊 326 列中 13 列沒對到機台編號，待查哪幾台）；機台清冊頁實際顯示照片 ✅
- [ ] parts／style 照片 key 對照（雲端有照片但卡片顯示沒有？）
- [ ] VRT_REF 其餘種類（date, popro, fabtype, sewer, shipcust, pdfpo…）跑完稽核
- [ ] 每個分頁 console error 掃一遍
- [ ] 車縫頁表格款號沒有變成可點（11/26 看到 vl 0）→ 查表頭判斷
- [ ] 員工卡（sewer）連 PSJHR：有沒有照片、職位、入職日、出勤；沒有資料的提示
- [ ] 機台卡連機修換針／換零件、機台照片、異常提醒（vrt-anomaly）
- [ ] 手機／桌面版面逐頁調整
- [ ] 🧪 樣品組打樣＋馬克排版圖頁（Paul 11/26 23:00 同意，放「款式」入口）：每日打樣／生產記錄、Excel 匯入（預覽再寫）、手動新增、每筆附排版圖／照片、款號連款式卡、款式卡顯示打樣與馬克；雲端工具 sample（分桶 p:sample_YYYY）
- [x] 異常報告（11/26）：雲端 9 筆、三語切換、智慧檢查、Excel 範本、款式卡提醒條（真實頁 T3539 已驗）

## 2026-11-27 新增：🧰 生產器具與工具（vrt_tools_v1.html ＋ vrt-tools-v1.js，hub 第 9 個入口 #tools）
- Paul 11/27 要求：棧板（木／塑膠／大塑膠）、料架、存放櫃、大組長鐵櫃、紙版架、桌椅、籃子、推車、鐵牛車、布尺、沙剪、機修喇叭與工具、裁桌、品管桌、實驗室設備；要照片、編號／QR、Excel／PDF 更新。
- 已做：13 類、A/B 廠＋13 區域、編號「類別-廠-流水號」、QR（vendor/qrcode.js，掃了開 ?c=編號）、A4 標籤列印、盤點（差異記錄 log）、依位置矩陣、Excel 範本／匯入／匯出、照片（VRTPhotos domain 'tool'）、PDF 轉照片、校正到期提醒。雲端 tool 'tools'，分桶 tools_<cat>。
- 決定：QC／實驗室設備放同一本（類別 QC），車縫機台留在機修零件 → 機台清冊；耗材（針、零件）留在機修零件。
- 待做：Paul 給現有清單後匯入；QC hub 加連到 ?cat=qc（目前未做）。
