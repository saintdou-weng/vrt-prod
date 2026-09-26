# VRT v4.11 全平台期間列自檢

標準：`[日][週][月][年] ◀ 期間下拉 ▶ 最新`；週一～週六並顯示 ISO 年週；月為曆月；「全部」需與頁首 KPI 對帳。

| 頁面 | 日 | 週 | 月 | 年 | ◀▶ | 下拉 | 最新 | 狀態 / 說明 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `production_v4.html` | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | **PARTIAL** — Gantt/queue 有日週月＋◀期間下拉▶最新；年視圖刻意不做，因本頁是前瞻排產甘特。 |
| `shipping_v2.html` | — | — | ✅ | ✅ | ✅ | ✅ | — | **PARTIAL** — 趨勢頁採月/年彙總；逐筆明細保留實際日期。未做日/週趨勢。 |
| `vrt_fabric_delivery_greige_center_v1.html` | — | — | ✅ | ✅ | — | ✅ | — | **NEEDS_STANDARDIZATION** — 有年/月篩選，尚非統一 D/W/M/Y 期間列。 |
| `VRT_FG_Inventory_Management_v1.html` | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | **PARTIAL** — 日報有◀日期下拉▶今天；週/月為獨立彙總頁，尚無年報與統一期間列。 |
| `vrt_customer_statistics_control_center_v1.html` | — | — | ✅ | ✅ | — | — | — | **NEEDS_STANDARDIZATION** — 來源是週期性 Customer Statistics snapshot，目前只做月/年趨勢。 |
| `vrt_monthly_shipping_control_center_v1.html` | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | **PARTIAL** — 月排程有◀月▶最新＋下拉，另有月/年趨勢；來源本身是 Monthly Shipping，故未做日/週。 |
| `vrt_spare_parts_v2.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLIANT** — 已是統一 D/W/M/Y/All 期間列。 |
| `vrt_final_qc_v1.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | **NEAR_COMPLIANT** — D/W/M/Y/All＋◀日期▶皆有；只缺明確『最新』按鈕。 |
| `production_plan_capacity_v1.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLIANT** — periodToolbar 已完整；週分析另用 ISO 週且預設最近完整週。 |
| `VRT_PO_Delivery_Control_Center.html` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **COMPLIANT_v4.11** — 本版新增統一期間列與下單日/客戶交期/布到廠/完成日日期基準，含全部/未填日期。 |

## 本版實際修改
- `VRT_PO_Delivery_Control_Center.html`：完整 D/W/M/Y 期間列、◀▶、下拉、最新、未填日期/全部，以及四種日期基準。
- 其他頁面本輪只自檢，不改已通過的資料邏輯。