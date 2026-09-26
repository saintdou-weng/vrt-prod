# Codex Outlook 連續標題分類 — v4.11 交接

本 PROD ZIP 不含 `v2/outlook-classifier.mjs`、`v2/outlook-rules-backup.json`、`v2/daily-task-status.json` 或 `mail-people/core.mjs` 原始碼，因此本包**沒有假裝已修改 Outlook 分類器，也沒有搬動任何郵件**。

Codex 要做：
1. 將 `outlook-rules-backup.json` 中所有 Enabled 的 Condition Type 2「主旨關鍵字→Folder」移植成 continuous-title 規則。
2. 優先序固定：continuous-title > person > yearly correspondence；目的地用 FolderID。
3. 不重新啟用 Outlook 原生規則。
4. 先 dry-run 2026-09-10 至今，輸出時間、主旨、寄件人、現位置、建議新位置、命中規則、FolderID。
5. Paul 確認後才 move；只能移動，不能刪除。
6. `NEW PO#0xx-26.xlsx` 另存 `08_EMAIL_郵件附件\prd_生產郵件\fabric\fabric PO`。

必測標題：FABRIC PO#052-26、RE: PO#050-26、ADI Spreadsheet、Vestis Spreadsheet、FABRIC STANDARD、LAB DIP、VRT Shipping Schedule、Outstanding Order。

狀態：規格 READY；source patch / Outlook dry-run PENDING；mail move NOT STARTED。
