#!/usr/bin/env python3
"""Assemble VRT_Production_v4.6.gs from the v4.2 base + the shared summary builders (vrt-tg-summary-v1.js) + the period-summary block.
v4.15 (2026-10-05): the base file and the output both hold the Telegram bot token, so they live OUTSIDE the repo:
  base   : $VRT_GAS_BASE  (default ../../gas/VRT_Production_v4.2.gs, i.e. next to the repo, never inside it)
  output : $VRT_GAS_OUT   (default ../../gas/out/VRT_Production_v4.6.gs)
v4.16 (2026-10-10): + vrt-daily-report-v1.js + daily_report_block.gs (D1 生產日報, Claude API hook, D2 aiSummary) + inbox_block.gs (C Telegram file intake)
Never copy a built .gs into the repo / GitHub / a public ZIP."""
import re,os,sys
HERE=os.path.dirname(os.path.abspath(__file__))
BASE=os.environ.get('VRT_GAS_BASE') or os.path.join(HERE,'..','..','gas','VRT_Production_v4.2.gs')
OUT=os.environ.get('VRT_GAS_OUT') or os.path.join(HERE,'..','..','gas','out','VRT_Production_v4.6.gs')
src=open(BASE,encoding='utf-8').read()
block=open(os.path.join(HERE,'period_summaries_block.gs'),encoding='utf-8').read()
shared=open(os.path.join(HERE,'..','vrt-tg-summary-v1.js'),encoding='utf-8').read()   # repo root
daily_js=open(os.path.join(HERE,'..','vrt-daily-report-v1.js'),encoding='utf-8').read()
daily_block=open(os.path.join(HERE,'daily_report_block.gs'),encoding='utf-8').read()
inbox_block=open(os.path.join(HERE,'inbox_block.gs'),encoding='utf-8').read() if os.path.exists(os.path.join(HERE,'inbox_block.gs')) else ''
def rep(old,new,count=1):
    global src
    assert src.count(old)==count,(src.count(old),old[:80])
    src=src.replace(old,new)

# 1. header
rep("""   VRT 生產系統 GAS 後端 v4.2 — QC 日／週報、半成品差額、同步版本核對；PROD 不自動提醒（2026-09-21）""",
"""   VRT 生產系統 GAS 後端 v4.4 — 每個模組網頁也能送同一份日週月年摘要（網頁與機器人共用 vrt-tg-summary-v1.js）；
     Telegram 代發：HTML 被拒自動改純文字；訂單新雲端格式（10/01）
   v4.3 — 雙語（中／英）日週月年摘要、/day /week /month /year、HTML 安全送出（2026-09-30）
   v4.2 — QC 日／週報、半成品差額、同步版本核對；PROD 不自動提醒（2026-09-21）
   ★ 部署方式：在既有專案貼上整份取代 → 部署 → 管理部署 → 編輯 → 版本「新版本」→ 部署。
     /exec 網址不變、pollTelegram 時間觸發不變、Drive 資料不動；只要執行一次 setupBotCommands() 讓「/」清單出現新指令。""")

# 2. capabilities + doGet banner
rep("function productionCapabilities_(){return {backendVersion:'4.2.0',qcWeekly:true,revisionCheck:true,contentCheck:true,qc:true,automaticProdReminders:false};}",
    "function productionCapabilities_(){return {backendVersion:'4.4.0',qcWeekly:true,revisionCheck:true,contentCheck:true,qc:true,automaticProdReminders:false,bilingualSummaries:true,periodSummaries:['day','week','month','year']};}")
rep("return okCors({ message: 'VRT Prod GAS v4.2 SMART SYNC + QC WEEKLY', time: new Date().toISOString() });",
    "return okCors({ message: 'VRT Prod GAS v4.4 SMART SYNC + QC WEEKLY + BILINGUAL PERIOD SUMMARIES', time: new Date().toISOString() });")

# 3. menus: bilingual button texts + digest buttons
rep("""      { t:'🏭 生產入口',  f:'portal_v2.html', full:true },
      { t:'🧵 車縫',      f:'sewing_v5.html' },
      { t:'✂️ 裁剪',      f:'cutting_v3.html' },
      { t:'📅 裁剪計劃',  f:'cutting_plan_v2.html' },
      { t:'📦 訂單',      f:'orders_v3.html' },
      { t:'🚚 PO 交期',   f:'VRT_PO_Delivery_Control_Center.html' },
      { t:'🚢 出貨',      f:'shipping_v2.html' },
      { t:'📊 生產總覽',  f:'production_v4.html' },
      { t:'📏 正式 SMV',  f:'smv_manager_v5_final.html' },
      { t:'📐 IE／OBD', f:'ie_smv_report_v2_1.html' },
      { t:'✅ Final QC',f:'vrt_final_qc_v1.html' },""",
"""      { t:'🏭 生產入口 Portal',  f:'portal_v2.html', full:true },
      { t:'🧵 車縫 Sewing',      f:'sewing_v5.html' },
      { t:'✂️ 裁剪 Cutting',     f:'cutting_v3.html' },
      { t:'📅 裁剪計劃 Cut plan', f:'cutting_plan_v2.html' },
      { t:'📦 訂單 Orders',      f:'orders_v3.html' },
      { t:'🚚 PO 交期 PO delivery', f:'VRT_PO_Delivery_Control_Center.html' },
      { t:'🚢 出貨 Shipping',    f:'shipping_v2.html' },
      { t:'📊 生產總覽 Overview', f:'production_v4.html' },
      { t:'📏 正式 SMV',         f:'smv_manager_v5_final.html' },
      { t:'📐 IE／OBD／排線 Line balancing', f:'ie_smv_report_v2_1.html' },
      { t:'✅ Final QC',         f:'vrt_final_qc_v1.html' },""")
rep("""      { t:'🧵 BOM',       f:'VRT_BOM_Management_v2_AI.html' },
      { t:'📦 FG 庫存',   f:'VRT_FG_Inventory_Management_v1.html' },
      { t:'📊 客戶統計',  f:'vrt_customer_statistics_control_center_v1.html' },
      { t:'🗓 排產產能',  f:'production_plan_capacity_v1.html' },
      { t:'🧶 布料進倉',  f:'vrt_fabric_delivery_greige_center_v1.html' },
      { t:'🗓 月出貨',    f:'vrt_monthly_shipping_control_center_v1.html' },
      { t:'🔧 零件備品',  f:'vrt_spare_parts_v2.html' },
      { t:'🧶 布料庫存',  f:'vrt_fabric_stock_control_v1.html' },""",
"""      { t:'🧵 BOM',                    f:'VRT_BOM_Management_v2_AI.html' },
      { t:'📦 FG 庫存 FG stock',        f:'VRT_FG_Inventory_Management_v1.html' },
      { t:'📊 客戶統計 Customers',      f:'vrt_customer_statistics_control_center_v1.html' },
      { t:'🗓 排產產能 Plan & capacity', f:'production_plan_capacity_v1.html' },
      { t:'🧶 布料進倉 Fabric delivery', f:'vrt_fabric_delivery_greige_center_v1.html' },
      { t:'🗓 月出貨 Monthly shipping', f:'vrt_monthly_shipping_control_center_v1.html' },
      { t:'🔧 零件備品 Spare parts',    f:'vrt_spare_parts_v2.html' },
      { t:'🧶 布料庫存 Fabric stock',   f:'vrt_fabric_stock_control_v1.html' },""")
rep("""      { t:'🧵 車縫摘要',  cb:'sew' },
      { t:'✂️ 裁剪摘要',  cb:'cut' },
      { t:'📅 計劃摘要',  cb:'cutplan' },
      { t:'📦 訂單摘要',  cb:'ord' },
      { t:'🚚 PO 摘要',   cb:'pod' },
      { t:'🚢 出貨摘要',  cb:'ship' },
      { t:'🧵 BOM 摘要',  cb:'bom' },
      { t:'📦 FG 摘要',   cb:'fg' },
      { t:'🔧 零件摘要',  cb:'sp' },
      { t:'🧶 布料庫存摘要', cb:'fstock' },
      { t:'📐 SMV 摘要', cb:'smvsum' },
      { t:'📊 客戶統計摘要', cb:'custsum' },
      { t:'🗓 排產摘要', cb:'plansum' },
      { t:'🗓 月出貨摘要', cb:'mshipsum' },
      { t:'🚚 布料進倉摘要', cb:'fabdel' },
      { t:'✅ QC 摘要', cb:'qcsum' },
      { t:'🔄 同步狀態',  cb:'stat' },""",
"""      // v4.3：全部門 日／週／月／年 一頁摘要（中英雙語，按鈕可切期間、看上期）
      { t:'📆 今日 Day',   cb:'d:day' },
      { t:'📆 本週 Week',  cb:'d:week' },
      { t:'📆 本月 Month', cb:'d:month' },
      { t:'📆 本年 Year',  cb:'d:year' },
      // 單一部門（sew/cut/qcsum/sp/plansum 也有 日／週／月／年 按鈕）
      { t:'🧵 車縫 Sewing',        cb:'sew' },
      { t:'✂️ 裁剪 Cutting',       cb:'cut' },
      { t:'✅ QC ＋ 缺點 KPI',      cb:'qcsum' },
      { t:'🔧 機針零件 Needles/Parts', cb:'sp' },
      { t:'🗓 排產 Plan',          cb:'plansum' },
      { t:'📅 裁剪計劃 Cut plan',  cb:'cutplan' },
      { t:'📦 訂單 Orders',        cb:'ord' },
      { t:'🚚 PO 交期 PO',         cb:'pod' },
      { t:'🚢 出貨 Shipping',      cb:'ship' },
      { t:'🧵 BOM',                cb:'bom' },
      { t:'📦 FG',                 cb:'fg' },
      { t:'🧶 布料庫存 Fabric stock', cb:'fstock' },
      { t:'📐 SMV',                cb:'smvsum' },
      { t:'📊 客戶統計 Customers', cb:'custsum' },
      { t:'🗓 月出貨 Monthly ship', cb:'mshipsum' },
      { t:'🚚 布料進倉 Fabric in', cb:'fabdel' },
      { t:'🔄 同步狀態 Sync status', cb:'stat' },""")
rep("""    sub   : '即時摘要 Summary',""","""    sub   : '日週月年摘要 Day / Week / Month / Year summaries',""")
rep("""  const text  = `${M.title} — ${today}\\n_${M.sub}_\\n選擇要開啟的工具：`;""",
    """  const text  = `${M.title} — ${today}\\n_${M.sub}_\\n選擇要開啟的工具 · Choose a tool：`;""")

# 4. handleMsg: period commands, bilingual status/help
rep("""  if (MENU_CMD[cmd]) { sendMenu(chatId, MENU_CMD[cmd], 0); return; }
  if (cmd === '/status') { tgSend(chatId, buildStatusText()); return; }

  if (cmd === '/help') {
    const lines = Object.keys(MENU_CMD)
      .filter(c => c !== '/menu')
      .map(c => `${c} — ${MENUS[MENU_CMD[c]].sub}`);
    tgSend(chatId, '🤖 *VRT 生產系統*\\n\\n' + lines.join('\\n') + '\\n/status — 同步狀態\\n/help — 說明');
  }""",
"""  if (MENU_CMD[cmd]) { sendMenu(chatId, MENU_CMD[cmd], 0); return; }
  // v4.3：/day /week /month /year（/today＝/day）→ 全部門雙語摘要，可再按部門看明細
  if (PERIOD_CMD[cmd]) { const m = digestSummary_(PERIOD_CMD[cmd], ''); tgSendHtml_(chatId, m.text, m.markup); return; }
  if (cmd === '/status') { tgSendHtml_(chatId, buildStatusText()); return; }

  if (cmd === '/help') {
    const lines = Object.keys(MENU_CMD)
      .filter(c => c !== '/menu')
      .map(c => `${c} — ${esc_(MENUS[MENU_CMD[c]].sub)}`);
    tgSendHtml_(chatId, '🤖 <b>VRT 生產系統 Production system</b>\\n\\n' + lines.join('\\n') + '\\n/day /week /month /year — 全部門摘要 Daily / weekly / monthly / yearly digest\\n/status — 同步狀態 Sync status\\n/help — 說明 Help');
  }""")

# 5. handleCbq: s: / d: routes, HTML summaries
rep("""  const map = { sew: sewTxt, cut: cutTxt, ord: ordTxt, ship: shipTxt, stat: buildStatusText,
                cutplan: cutplanTxt, pod: podTxt, bom: bomTxt, fg: fgTxt, sp: spTxt, fstock: fabricStockTxt,
                smvsum: smvSummaryTxt_, custsum: custSummaryTxt_, plansum: prodPlanSummaryTxt_, mshipsum: monthShipSummaryTxt_, fabdel: fabricDeliverySummaryTxt_,qcsum:qcSummaryTxt_ };
  const auditMap={sew:'sewing',cut:'cutting',ord:'orders',ship:'shipping',cutplan:'cuttingplan',pod:'podelivery',bom:'bom',fg:'fg',sp:'spareparts',fstock:'fabricstock',smvsum:'smv',custsum:'custstats',plansum:'prodplan',mshipsum:'monthship',fabdel:'fabricdelivery',qcsum:'qc'};
  const fn  = map[data];
  if (fn) { tgSend(chatId, fn() + '\\n\\n👆 /prod　/prod2　/sum'); if(auditMap[data])try{prodAuditMarkSent_(auditMap[data],'summary',null)}catch(_){} }""",
"""  const auditMap={sew:'sewing',cut:'cutting',ord:'orders',ship:'shipping',cutplan:'cuttingplan',pod:'podelivery',bom:'bom',fg:'fg',sp:'spareparts',fstock:'fabricstock',smvsum:'smv',custsum:'custstats',plansum:'prodplan',mshipsum:'monthship',fabdel:'fabricdelivery',qcsum:'qc'};
  // v4.3 期間切換：s:<key>:<period>:<anchor|latest> → 原地更新同一則訊息
  if (data.indexOf('s:') === 0) {
    const parts = data.split(':'), cb = parts[1], period = parts[2], anchor = parts[3] === 'latest' ? '' : (parts[3] || '');
    const m = periodSummary_(cb, period, anchor);
    if (m) { tgEditHtml_(chatId, cbq.message.message_id, m.text, m.markup); if(auditMap[cb])try{prodAuditMarkSent_(auditMap[cb],'summary',null)}catch(_){} }
    return;
  }
  // v4.3 全部門摘要：d:<period>[:<anchor|latest>]（來自 /sum 按鈕時沒有 anchor → 新訊息；來自摘要內按鈕 → 原地更新）
  if (data.indexOf('d:') === 0) {
    const parts = data.split(':'), period = parts[1], anchor = parts[2] === 'latest' ? '' : (parts[2] || '');
    const m = digestSummary_(period, anchor);
    if (parts.length >= 3) tgEditHtml_(chatId, cbq.message.message_id, m.text, m.markup); else tgSendHtml_(chatId, m.text, m.markup);
    return;
  }
  // 有日／週／月／年的部門：先送「日」摘要＋期間按鈕
  if (PERIOD_TOOLS[data]) {
    const m = periodSummary_(data, 'day', '');
    tgSendHtml_(chatId, m.text, m.markup); if(auditMap[data])try{prodAuditMarkSent_(auditMap[data],'summary',null)}catch(_){}
    return;
  }
  const map = { ord: ordTxt, ship: shipTxt, stat: buildStatusText,
                cutplan: cutplanTxt, pod: podTxt, bom: bomTxt, fg: fgTxt, fstock: fabricStockTxt,
                smvsum: smvSummaryTxt_, custsum: custSummaryTxt_, mshipsum: monthShipSummaryTxt_, fabdel: fabricDeliverySummaryTxt_ };
  const fn  = map[data];
  if (fn) { tgSendHtml_(chatId, fn() + '\\n\\n👆 /prod　/prod2　/sum', { inline_keyboard: [[{ text:'📋 摘要選單 Menu', callback_data:'m:sum:0' }]] }); if(auditMap[data])try{prodAuditMarkSent_(auditMap[data],'summary',null)}catch(_){} }""")

# 6. bot commands
rep("""  cmds.push({ command:'status', description:'同步狀態' });

  cmds.push({ command:'help',   description:'說明' });""",
"""  cmds.push({ command:'day',    description:'今日摘要 Daily digest' });
  cmds.push({ command:'week',   description:'本週摘要 Weekly digest' });
  cmds.push({ command:'month',  description:'本月摘要 Monthly digest' });
  cmds.push({ command:'year',   description:'本年摘要 Yearly digest' });
  cmds.push({ command:'status', description:'同步狀態 Sync status' });
  cmds.push({ command:'help',   description:'說明 Help' });""")

# 7. legacy summaries → bilingual HTML (all of them are sent with tgSendHtml_ now)
rep("""  return `📅 *裁剪計劃 Cutting Plan* ${fmtT(p.timestamp)}\\nPlan Qty：${N(plan)} pcs\\nFinished：${N(fin)} pcs\\nPending：${N(Math.max(plan - fin, 0))} pcs\\n共 ${N(recs.length)} 筆`;""",
    """  return `📅 <b>裁剪計劃 Cutting plan</b> ${fmtT(p.timestamp)}\\n計劃量 Plan qty：${N(plan)} pcs\\n已完成 Finished：${N(fin)} pcs\\n未完成 Pending：${N(Math.max(plan - fin, 0))} pcs\\n共 Rows：${N(recs.length)}`;""")
rep("""  return `📦 *PO 交期 PO Delivery* ${fmtT(p.timestamp)}\\nOpen PO：${N(Object.keys(open).length)}\\nLate PO：${N(Object.keys(late).length)}\\nRisk PO：${N(Object.keys(risk).length)}\\n共 ${N(recs.length)} 筆`;""",
    """  return `🚚 <b>PO 交期 PO delivery</b> ${fmtT(p.timestamp)}\\n未結 Open PO：${N(Object.keys(open).length)}\\n逾期 Late PO：${N(Object.keys(late).length)}\\n風險 Risk PO：${N(Object.keys(risk).length)}\\n共 Rows：${N(recs.length)}`;""")
rep("""  return `🧵 *BOM 管理* ${fmtT(ts)}\\nReady：${N(ready)}\\nPending：${N(pending)}\\nMissing Material：${N(missing)}\\n共 ${N(boms.length)} 份 BOM`;""",
    """  return `🧵 <b>BOM 管理 BOM</b> ${fmtT(ts)}\\n齊料 Ready：${N(ready)}\\n待齊 Pending：${N(pending)}\\n缺料 Missing material：${N(missing)}\\n共 BOMs：${N(boms.length)}`;""")
rep("""  return `📦 *FG 成品庫存* ${fmtT(p.timestamp)}\\nFG Qty：${N(qty)} pcs\\nCartons：${N(cartons)}\\nReady To Ship：${N(ready)} pcs`;""",
    """  return `📦 <b>FG 成品庫存 FG stock</b> ${fmtT(p.timestamp)}\\n庫存量 FG qty：${N(qty)} pcs\\n箱數 Cartons：${N(cartons)}\\n可出貨 Ready to ship：${N(ready)} pcs`;""")
rep("""  return `🧶 *布料庫存 Fabric Stock* ${fmtT(p.timestamp)}\\nCurrent Stock：${N(s.currentQty)} yd\\nOld Stock Used：${N(s.oldUsed)} yd\\nFabric Items：${N(s.itemCount)}\\nCurrent Rows：${N(s.currentRows)} / Old-use Rows：${N(s.oldRows)}`;""",
    """  return `🧶 <b>布料庫存 Fabric stock</b> ${fmtT(p.timestamp)}\\n現有庫存 Current stock：${N(s.currentQty)} yd\\n舊布使用 Old stock used：${N(s.oldUsed)} yd\\n品項 Items：${N(s.itemCount)}\\n現有列 Current rows：${N(s.currentRows)} / 舊布列 Old-use rows：${N(s.oldRows)}`;""")
rep("""  return `📦 *訂單* ${fmtT(m.timestamp)}\\n${s.totalSets||0} 張 / ${s.totalPOs||0} PO\\n客戶：${(s.customerList||[]).join('、')}`;""",
    """  return `📦 <b>訂單 Orders</b> ${fmtT(m.timestamp)}\\n訂單 Sets：${N(s.totalSets||0)} · PO：${N(s.totalPOs||0)} · 週快照 Weekly snapshots：${N(s.weeklySnapshots||0)}\\n客戶 Customers：${esc_((s.customerList||[]).join('、')||'—')}`;""")
rep("""  return `🚢 *出貨* ${fmtT(m.timestamp)}\\n已出 ${s.shipped||0} / 未出 ${s.outstanding||0} / 異常 ${s.abnormal||0}`;""",
    """  return `🚢 <b>出貨 Shipping</b> ${fmtT(m.timestamp)}\\n已出 Shipped：${N(s.shipped||0)} · 未出 Outstanding：${N(s.outstanding||0)} · 異常 Abnormal：${N(s.abnormal||0)}`;""")
rep("""  const labels = { sewing:'🧵 車縫', cutting:'✂️ 裁剪', cuttingplan:'📅 裁剪計劃', orders:'📦 訂單',
                   podelivery:'🚚 PO交期', shipping:'🚢 出貨', smv:'⏱ SMV',
                   bom:'🧵 BOM', fg:'📦 FG成品', spareparts:'🔧 零件備品',
                   prodplan:'🗓 排產產能', custstats:'📊 客戶統計', fabric:'🧶 布料舊介面', fabricdelivery:'🚚 布料進倉', monthship:'🗓 月出貨', fabricstock:'🧶 布料庫存', ie_smv:'📐 IE SMV', vrt_acc:'💰 ACC成本',qc:'✅ Final QC' };
  return '🔄 *同步狀態*\\n\\n' + tools.map(t => {
    const m = getSnap(t);
    return `${labels[t]}：${m ? fmtT(m.timestamp) + ` (${N(m.recordCount)}筆)` : '未同步'}`;
  }).join('\\n');""",
"""  const labels = { sewing:'🧵 車縫 Sewing', cutting:'✂️ 裁剪 Cutting', cuttingplan:'📅 裁剪計劃 Cut plan', orders:'📦 訂單 Orders',
                   podelivery:'🚚 PO交期 PO delivery', shipping:'🚢 出貨 Shipping', smv:'⏱ SMV',
                   bom:'🧵 BOM', fg:'📦 FG成品 FG', spareparts:'🔧 零件備品 Spare parts',
                   prodplan:'🗓 排產產能 Plan', custstats:'📊 客戶統計 Customers', fabric:'🧶 布料舊介面 Fabric (old)', fabricdelivery:'🚚 布料進倉 Fabric delivery', monthship:'🗓 月出貨 Monthly shipping', fabricstock:'🧶 布料庫存 Fabric stock', ie_smv:'📐 IE SMV', vrt_acc:'💰 ACC成本 Costing',qc:'✅ Final QC' };
  return '🔄 <b>同步狀態 Sync status</b>\\n\\n' + tools.map(t => {
    const m = getSnap(t);
    return `${labels[t]}：${m ? esc_(fmtT(m.timestamp)) + ` (${N(m.recordCount)} 筆 rows)` : '未同步 not synced'}`;
  }).join('\\n');""")
rep("""function snapSummary_(tool,title){const s=getSnap(tool);if(!s)return '⚠️ '+title+' 尚未同步';return title+'\\n更新：'+fmtT(s.timestamp)+'\\n記錄：'+N(s.recordCount)+' 筆';}
function smvSummaryTxt_(){return snapSummary_('smv','📐 *SMV / IE 摘要*')}
function custSummaryTxt_(){const s=getSnap('custstats');if(!s)return '⚠️ 客戶統計尚未同步';const m=s.summary||{};return '📊 *客戶統計摘要*\\n更新：'+fmtT(s.timestamp)+'\\n明細：'+N(s.recordCount)+' 筆\\nOrder：'+N(m.orderQty||0)+' pcs\\nBalance：'+N(m.balanceQty||0)+' pcs'}
function prodPlanSummaryTxt_(){return snapSummary_('prodplan','🗓 *生產排單摘要*')}
function monthShipSummaryTxt_(){return snapSummary_('monthship','🗓 *月出貨摘要*')}
function fabricDeliverySummaryTxt_(){const s=getSnap('fabricdelivery');if(!s)return '⚠️ 布料進倉尚未同步';const m=s.summary||{};return '🚚 *布料進倉摘要*\\n更新：'+fmtT(s.timestamp)+'\\n資料：'+N(s.recordCount)+' 筆\\nOrders：'+N(m.orders||0)+' · Greige：'+N(m.greige||0)+' · Ta Chiang：'+N(m.tachiang||0)+' · Outsource：'+N(m.outsource||0)}""",
"""function snapSummary_(tool,title){const s=getSnap(tool);if(!s)return '⚠️ '+title+'\\n尚未同步 / Not synced';return title+'\\n更新 Updated：'+esc_(fmtT(s.timestamp))+'\\n記錄 Rows：'+N(s.recordCount);}
function smvSummaryTxt_(){return snapSummary_('smv','📐 <b>SMV / IE 摘要 SMV summary</b>')}
function custSummaryTxt_(){const s=getSnap('custstats');if(!s)return '⚠️ 客戶統計尚未同步 / Customer stats not synced';const m=s.summary||{};return '📊 <b>客戶統計 Customer statistics</b>\\n更新 Updated：'+esc_(fmtT(s.timestamp))+'\\n明細 Rows：'+N(s.recordCount)+'\\n訂單量 Order：'+N(m.orderQty||0)+' pcs\\n餘額 Balance：'+N(m.balanceQty||0)+' pcs'}
function prodPlanSummaryTxt_(){return snapSummary_('prodplan','🗓 <b>生產排單 Production plan</b>')}
function monthShipSummaryTxt_(){return snapSummary_('monthship','🗓 <b>月出貨 Monthly shipping</b>')}
function fabricDeliverySummaryTxt_(){const s=getSnap('fabricdelivery');if(!s)return '⚠️ 布料進倉尚未同步 / Fabric delivery not synced';const m=s.summary||{};return '🚚 <b>布料進倉 Fabric delivery</b>\\n更新 Updated：'+esc_(fmtT(s.timestamp))+'\\n資料 Rows：'+N(s.recordCount)+'\\n訂單 Orders：'+N(m.orders||0)+' · 胚布 Greige：'+N(m.greige||0)+' · 大江 Ta Chiang：'+N(m.tachiang||0)+' · 外發 Outsource：'+N(m.outsource||0)}""")

# 7b. Telegram proxy: honour parse_mode:'none' / plain:true and retry as plain text when Telegram rejects the HTML entities
rep("""    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: p.parse_mode || 'HTML',
      disable_web_page_preview: true
    };
    const res = UrlFetchApp.fetch(TG() + '/sendMessage', {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload: JSON.stringify(payload)
    });
    const body = JSON.parse(res.getContentText() || '{}');
    if (!body.ok) throw new Error(body.description || ('Telegram HTTP '+res.getResponseCode()));""",
"""    const payload = { chat_id: chatId, text: text, disable_web_page_preview: true };
    const pm = p.plain === true || p.plain === 'true' ? '' : (p.parse_mode === undefined ? 'HTML' : String(p.parse_mode || ''));
    if (pm && pm.toLowerCase() !== 'none') payload.parse_mode = pm;
    let res = UrlFetchApp.fetch(TG() + '/sendMessage', {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload: JSON.stringify(payload)
    });
    let body = JSON.parse(res.getContentText() || '{}');
    let plainFallback = false;
    // v4.3: a page sent HTML that Telegram cannot parse → resend the same content as plain text so the message still goes out
    if (!body.ok && payload.parse_mode && /parse|entit|tag/i.test(String(body.description || ''))) {
      const plain = { chat_id: chatId, disable_web_page_preview: true, text: String(text).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') };
      res = UrlFetchApp.fetch(TG() + '/sendMessage', { method:'post', contentType:'application/json', muteHttpExceptions:true, payload: JSON.stringify(plain) });
      body = JSON.parse(res.getContentText() || '{}'); plainFallback = body.ok;
    }
    if (!body.ok) throw new Error(body.description || ('Telegram HTTP '+res.getResponseCode()));""")
rep("""    return okCors({sent:true,chat_id:chatId,message_id:body.result && body.result.message_id});""",
    """    return okCors({sent:true,chat_id:chatId,message_id:body.result && body.result.message_id,plainFallback:plainFallback});""")

# 8. diagnostics
rep("""function checkProductionV41(){ return checkProductionV42(); }""",
"""function checkProductionV41(){ return checkProductionV42(); }
function checkProductionV44(){ return checkProductionV43(); }
function checkProductionV43(){ const r=checkProductionV42(); r.periodSummaryTools=Object.keys(PERIOD_TOOLS); r.instructions='更新既有部署的新版本（/exec 不變）；執行一次 setupBotCommands() 讓 /day /week /month /year 出現在指令清單。'; console.log(JSON.stringify(r,null,2)); return r; }""")

# 9. v4.5 (2026-10-05): PROD ↔ ERP mutual entry — /prod menu gets the VRT ERP site + the new ERP link centre page
rep("""   VRT 生產系統 GAS 後端 v4.4 — 每個模組網頁也能送同一份日週月年摘要（網頁與機器人共用 vrt-tg-summary-v1.js）；""",
"""   VRT 生產系統 GAS 後端 v4.5 — /prod 選單多「🏢 VRT ERP」與「🔗 ERP 對照」入口（PROD ↔ ERP 互通，10/05）；GS 檔不再放進 repo
   v4.4 — 每個模組網頁也能送同一份日週月年摘要（網頁與機器人共用 vrt-tg-summary-v1.js）；""")
rep("backendVersion:'4.4.0',","backendVersion:'4.5.0',erpLink:true,")
rep("return okCors({ message: 'VRT Prod GAS v4.4 SMART SYNC + QC WEEKLY + BILINGUAL PERIOD SUMMARIES', time: new Date().toISOString() });",
    "return okCors({ message: 'VRT Prod GAS v4.5 SMART SYNC + QC WEEKLY + BILINGUAL PERIOD SUMMARIES + ERP LINK', time: new Date().toISOString() });")
rep("""      { t:'✅ Final QC',         f:'vrt_final_qc_v1.html' },
    ],
  },""",
"""      { t:'✅ Final QC',         f:'vrt_final_qc_v1.html' },
      // v4.5: PROD ↔ ERP 互相入口（ERP 機器人選單同樣有「🏭 VRT Prod」）
      { t:'🔗 ERP 對照 ERP link',  f:'vrt_erp_link_v1.html' },
      { t:'🏢 VRT ERP ↗',          url:'https://saintdou-weng.github.io/vrt-asset/' },
    ],
  },""")
rep("""function checkProductionV44(){ return checkProductionV43(); }""",
"""function checkProductionV45(){ const r=checkProductionV43(); r.erpLink=true; r.menuHasErp=buildMenu('prod',0).markup.inline_keyboard.some(row=>row.some(b=>/VRT ERP/.test(b.text||''))); return r; }
function checkProductionV44(){ return checkProductionV43(); }""")

# 10. v4.6 (2026-10-10): 生產日報 (D1) + Claude API hook (D1 AI / D2) + Telegram file intake (C)
rep("""   VRT 生產系統 GAS 後端 v4.5 — /prod 選單多「🏢 VRT ERP」與「🔗 ERP 對照」入口（PROD ↔ ERP 互通，10/05）；GS 檔不再放進 repo""",
"""   VRT 生產系統 GAS 後端 v4.6 — 📰 生產日報（每日 10:00／15:00 自動產生＋推送，數字由程式算、AI 只改寫文字並逐數核對）、
     Claude API 接點（金鑰只在指令碼屬性）、D2 各模組 AI 摘要、Telegram 群組檔案自動收進 PROD_Inbox／import_queue（10/10）
   v4.5 — /prod 選單多「🏢 VRT ERP」與「🔗 ERP 對照」入口（PROD ↔ ERP 互通，10/05）；GS 檔不再放進 repo""")
rep("backendVersion:'4.5.0',erpLink:true,","backendVersion:'4.6.0',erpLink:true,dailyReport:true,aiSummary:true,inbox:true,")
rep("return okCors({ message: 'VRT Prod GAS v4.5 SMART SYNC + QC WEEKLY + BILINGUAL PERIOD SUMMARIES + ERP LINK', time: new Date().toISOString() });",
    "return okCors({ message: 'VRT Prod GAS v4.6 SMART SYNC + QC WEEKLY + BILINGUAL PERIOD SUMMARIES + ERP LINK + DAILY REPORT + INBOX', time: new Date().toISOString() });")
rep("""function handleMsg(msg) {
  // 群組中指令會帶 @botname，一律去掉再比對""",
"""function handleMsg(msg) {
  // v4.6 (修改指令 C): a file posted in a group → PROD_Inbox + import_queue (polling kept; no webhook)
  if (msg && msg.document) { try { inboxIntake_(msg); } catch (e) { console.warn('inbox intake failed: ' + e); } return; }
  // 群組中指令會帶 @botname，一律去掉再比對""")
rep("""    if (payload && payload.action === 'auditSent') return handleProdAuditSent_(payload);""",
"""    if (payload && payload.action === 'auditSent') return handleProdAuditSent_(payload);
    // v4.6: 生產日報 / Claude 文字 / 群組檔案收件
    if (payload && /^(dailyReport|aiSummary)/.test(String(payload.action||''))) return handleDailyReport_(payload);
    if (payload && /^inbox/.test(String(payload.action||''))) return handleInbox_(payload);""")

# 11. extra intake bots (修改指令 C): tokens live OUTSIDE the repo in ../../gas/inbox_bots.json (or $VRT_INBOX_BOTS_FILE) and are
#     written into CFG.INBOX_BOTS of the built .gs only — the repo block reads CFG.INBOX_BOTS / Script Property INBOX_BOTS_JSON.
BOTS=os.environ.get('VRT_INBOX_BOTS_FILE') or os.path.join(HERE,'..','..','gas','inbox_bots.json')
if os.path.exists(BOTS):
    import json
    bots=json.load(open(BOTS,encoding='utf-8'))
    rep("""  FOLDER_NAME : 'VRT_Production_Data',
};""","""  FOLDER_NAME : 'VRT_Production_Data',
  INBOX_BOTS  : %s,   // v4.6 其他收件機器人（已在生產群組裡；這份 GS 只貼在 Apps Script，不進 repo）
};"""%json.dumps(bots,ensure_ascii=False))
    print('inbox bots injected:',', '.join(b.get('name','?') for b in bots))

out=src+'\n\n/* ═══ shared summary builders: copy of vrt-prod-main/vrt-tg-summary-v1.js (do not edit here; edit the .js and rebuild) ═══ */\n'+shared+block+'\n\n/* ═══ copy of vrt-prod-main/vrt-daily-report-v1.js (do not edit here) ═══ */\n'+daily_js+'\n'+daily_block+('\n'+inbox_block if inbox_block else '')
os.makedirs(os.path.dirname(OUT),exist_ok=True)
open(OUT,'w',encoding='utf-8').write(out)
print('output ->',OUT,'(contains the bot token: keep out of the repo)')
print('written',len(out.splitlines()),'lines')
