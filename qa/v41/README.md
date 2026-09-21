# v4.1 整合驗證

保留完整解壓縮目錄，在 `vrt-prod-main` 執行：

```sh
node qa/v41/run_all.js
```

需要 Node 20 以上。沿用 v4.0／v3.9 的實際附件與回歸測試，另將 `AppsScript/VRT_Production_v4.1.gs` 放進記憶體模擬 Google 服務，直接呼叫該檔的 `doGet`／`doPost`，再接上實際前端 Smart Sync、IE／SMV、機修零件及 QC 頁面。

GS 放在網站資料夾外的同層 `AppsScript`，不包含在網站公開部署內容。測試不連 Google Drive、Sheets、正式 GS 或 Telegram，也不建立真實觸發條件。

涵蓋 QC 實際附件的往返與統計、舊格式零件遷移、IE／正式 SMV 共用資料來源、重匯去重、未變不傳、metadata 快取、同時提交衝突、完整性檢查、明確刪除、防少覆多、既有 QC 格式升級及離線後自動同步。

`RESULTS_v4.1.json` 為本次機器可讀結果。此測試不是手機／桌面瀏覽器操作認證，Google 正式權限、部署、配額與網路效能也尚未驗證；模組驗收表對這些項目仍保留未驗證狀態。
