# 給 Codex：Outlook 分類漏掉 FABRIC PO／ADI Spreadsheet 等連續標題（2026-09-26）

## 問題
Och Chanmalen 寄的「FABRIC PO#052-26」「RE: PO#050-26」「ADI Spreadsheet as of September 19, 2026」等郵件，都停在 `Production_生產\Och Chanmalen_工廠往來\Correspondence 2026_年度往來`，沒有進到 `fabric_布料\fabric PO_布料採購單`、`order\adi spreadsheet` 這些原本的標題資料夾。

## 原因（已查證）
1. **舊規則被停用**：2026-09-10 啟用 Codex 每日分類時，停用了 117 條舊 Outlook 規則（`v2\daily-task-status.json` 的 OldRulesDisabled＝117）。停用前的內容備份在 `v2\outlook-rules-backup.json`，其中都是啟用中的規則：
   - #98「FABRIC PO」→ pc\fabric\fabric PO
   - #37「Och Chanmalen＋PO#」→ pc\fabric\fabric PO
   - #100「ADI Spreadsheet」→ pc\order\adi spreadsheet
   - #80 Vestis Spreadsheet、#46 FABRIC STANDARD、#63 LAB DIP、#99 VRT Shipping Schedule 等
2. **新分類器沒有接上這些標題**：`v2\outlook-classifier.mjs` 的 topics 只有 label po、lab dip、wow aprons 等約 20 項，沒有 FABRIC PO、ADI／Vestis Spreadsheet、FABRIC STANDARD、Shipping Schedule、Outstanding Order 等。
3. **人名優先**：`mail-people\core.mjs` 對 VRT 同仁的判斷，只有主旨符合 daily／weekly／monthly 時才算「連續報告」；其餘一律歸到人名下的 Correspondence 年度資料夾。
4. **結論**：不是規則「沒執行」，而是規則「沒移植」。排程本身正常：9/25 最後一次在 15:00 執行，9/26 是假日所以沒跑。

## 要做
1. **移植規則**：把 `outlook-rules-backup.json` 裡「主旨關鍵字 → 資料夾」的規則（Condition Type 2），移植成分類器的「連續標題」清單。
   - 優先順序：連續標題最先，人名其次，最後才是年度往來。這和 Paul 原本的習慣一致。
   - 規則用 FolderID 對應，因為資料夾改名後 ID 不變。
2. **不要直接重新啟用舊的 Outlook 原生規則**，避免和每日分類互相搶信。
3. **先試跑**：從 2026-09-10 到今天，列出應該改放的郵件（主旨、原位置、新位置），交給 Paul 確認，確認後才搬。只能移動，不能刪除。
4. **附件存放**：`NEW PO#0xx-26.xlsx` 等附件也要存到 `08_EMAIL_郵件附件\prd_生產郵件\fabric\fabric PO`，和 #036–#049 放在一起。
