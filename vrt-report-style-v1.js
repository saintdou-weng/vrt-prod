/* VRT 生產報告寫法模組 v1.0（2026-11-24）
   來源：Paul 2026/6/27–11/17 寄台北的 24 封生產信（停工方案、排單與船期週更新、產能與計劃執行週報、月結、GRS 首單、11/21 簽呈的寫法）。
   用途：①給 AI（Claude／ChatGPT 週報草稿、平台 AI 報告）照著寫：報告類型、段落順序、情境→開頭→圖表→顏色；②lint(text) 送出前抓 Paul 改過的錯誤寫法；
        ③口徑（METRICS）讓程式和 AI 算出同一個數。全部純資料／純函式，瀏覽器、Node、GAS 都能跑。
   詳細說明：PSJERP/PROD_REPORT_PLAYBOOK.md（同一份規則的人看版）。 */
(function (g) {
  'use strict';
  var VERSION = '1.0.0';

  /* ── 1. 報告類型：什麼時候寄、標題怎麼下、段落順序 ── */
  var TYPES = {
    capacityWeekly: {
      zh: '生產產能與計劃執行週報', en: 'Weekly Production Capacity & Plan Execution Report', when: '每週二（週一沒有日報就週二）上午，涵蓋上週一～六',
      to: '生管 Malen、Isay、阿凌；cc 副總、Nancy、Audrey、Dillard、Tina',
      title: 'RE: VRT 生產產能與計劃執行週報 WEEKLY PRODUCTION CAPACITY & PLAN EXECUTION REPORT {yyyy}年{m}月{d1}–{d2}日 / {DD1}–{DD2} {MONTH} {yyyy} | 第{W}週 / Week {W} {yyyy.mm.dd}',
      sections: ['kpiCards', 'verdict', 'compareDays', 'mix', 'lines', 'planVsActual', 'grsSpecial', 'wip', 'quality', 'maint', 'conclusion'],
      kpiCards: ['週件數', '日均', '加權效率', '人均或標準工時', '計畫達成或特殊單進度', '缺標 WIP／不良率'],
      verdictQ: '本週算不算OK？（整體＋不能放過的落差）'
    },
    monthClose: {
      zh: '週報＋月結', en: 'Weekly report with Month Close', when: '月底那一週的週報',
      sections: ['verdict', 'definitions', 'monthsCompare', 'holidayEffect', 'week', 'mix', 'linesPlan', 'planReshuffle', 'grsSpecial', 'rushInsert', 'quality', 'conclusion'],
      verdictQ: '少做幾天不代表效率變差（每工作日標準產出＋加權效率）'
    },
    planUpdate: {
      zh: '生產排單與船期週更新', en: 'Production and Shipping Schedule / Planning Update', when: '每週三（新版排單出來）',
      to: '生管、阿凌、副總、Tina、Lydia、David、Nancy、Audrey、Dillard、Phary、Isay、Sokha、Sophea',
      title: 'RE: VRT {yyyy}年{m}月生產排單進度報告 / VRT {Month} Production Planning Update {yyyy.mm.dd}',
      sections: ['oneLiner', 'atAGlance', 'conclusionsNumbered', 'versionDelta', 'customerMix', 'lineLoad', 'weeksOfCover', 'planVsSewing', 'specialOrder', 'shipments', 'contingency', 'ordersFabric', 'actions'],
      verdictQ: '排單夠不夠（≥2 週）、要不要停工、哪張單有風險'
    },
    shutdownProposal: {
      zh: '生產風險評估暨計畫性停工方案', en: 'Production Risk Assessment & Planned Shutdown Proposal', when: '確定缺料／缺單時，至少提前 2 週',
      sections: ['preface', 'execSummary', 'factoryStatus', 'materialAssessment', 'utilisation', 'financial', 'proposalPhases', 'scenarios', 'plannedVsUnplanned', 'qa', 'recommendation', 'conclusion'],
      verdictQ: '為什麼要停（不是效率問題是料／單）、怎麼停（哪幾組、幾天、半薪）、方案二'
    },
    midMonthEff: {
      zh: '產能與效率分析（月中）', en: 'Production Capacity & Efficiency Analysis', when: '月中（1–15 日）',
      sections: ['preface', 'numberedFindings', 'daily', 'wipByLine', 'weeks', 'overall', 'lineLights', 'threeLines', 'noQtyIssues', 'monthsCompare', 'wipExplained', 'next'],
      verdictQ: '產能是被卡住還是消失了'
    },
    specialOrder: {
      zh: '特殊訂單管控（GRS 首單等）', en: 'Special Order Control', when: '第一次做的認證單、急單、分批單',
      sections: ['preface', 'conclusions', 'workflowOverlay', 'releaseGates', 'paceLine', 'risks', 'actions', 'zhNotes'],
      verdictQ: '第一次就做對：交期、品質、追溯三樣都要過'
    },
    proposal: {
      zh: '簽呈／建議（人事、組織）', en: 'Management proposal', when: '要台北核示的事',
      sections: ['address', 'context', 'quotedSource', 'options', 'recommendation', 'fallback'],
      verdictQ: '請台北核示什麼、不核准的話怎麼辦'
    }
  };

  /* ── 2. 口徑（程式和 AI 都照這個算；11/24 用 8、10、11 月 DPO 原檔驗算，W44 35.28%、10 月 30.8%、W46 37.67% 完全對上） ── */
  var METRICS = {
    weightedEff: { zh: '加權效率', formula: 'Σ(各款完成件數×當日 SMV) ÷ Σ(各組實到車工×工時×60)', rule: '有人上班但 0 產出的組（缺料、補標、換款）也進分母；不平均各組或各天的百分比；SMV 用日報當天值', check: 'W44 4,518.9 標準小時÷12,808.5 投入小時＝35.28%' },
    stdHours: { zh: '完成標準工時', formula: 'Σ(件數×SMV)÷60', rule: '件數和標準工時一起看；產品結構變了先看標準工時' },
    stdHoursPerDay: { zh: '每工作日標準產出', formula: '完成標準工時÷實際生產日', rule: '跨月份有長假時用它比，不用月總量' },
    perDay: { zh: '日均件數', formula: '件數÷實際生產日', rule: '週報一律用每個生產日比；上一期只有 1–3 天（收假、停工後）不用總量比' },
    pcsPerHead: { zh: '人均', formula: '件數÷人日', rule: '低 SMV 餐巾會讓人均暴增，和車縫技術分開看' },
    loadingPct: { zh: '排單負荷（組日）', formula: '已排件數÷各款日產＝等效組日；÷可用組日（扣假日）', rule: '不是效率、也不是產能利用率；要同時列件數／日、標準工時／日、物料' },
    weeksOfCover: { zh: '可做週數', formula: '10/20 起還沒做完的排單÷各組實際日產（不是排單日產）÷6', rule: '分「物料齊全」和「等到布」兩段；<2 週要提停工預案、2–3 週正常偏緊、3–4 週安全' },
    requiredPerDay: { zh: '剩餘每日需求', formula: '(月排單－已完成)÷剩餘工作日', rule: '和最近日均比；超過太多就寫會拖到下月多少件' },
    volumeRatio: { zh: '量體比', formula: '實際件數÷原排件數', rule: '不是 PO 交貨達成率；轉線、分批、插單要另外說' },
    rejectRate: { zh: '加權不良率', formula: 'Σ不良記錄÷Σ檢驗件次', rule: '不是報廢率，不從完工數再扣；樣品線要對帳；單日檔不當整週' },
    qcFlowGap: { zh: 'QC 流程差額', formula: '檢驗－完成－不良', rule: '不是期末 WIP；不同天不能相加；只有現場按 PO／款／站別盤點才是 WIP' },
    wipSnapshot: { zh: '日報半成品', formula: '日報備註當天的待補件數', rule: '每天是快照，930＋400＋500 不能加總' },
    fabricCover: { zh: '到布覆蓋率', formula: '已到碼÷訂購碼', rule: '另列「已下單但沒有到廠日」的筆數占比；收發台帳≠可裁量' },
    readyToSew: { zh: '可立即上線', formula: '有布、有標、有裁片、外發已回', rule: '未完成訂單≠可上線；停工判斷只看 ready-to-sew' },
    lineDayCost: { zh: '每組每天成本', formula: '車工＋間接＋製造費用分攤（10/20 報告 $893.63）', rule: '合法半薪停 1 組 1 天約省 $192–233；有單有料停線反而少賺 $280–320；沒經勞動監察核准＝全薪' },
    breakeven: { zh: '人工損平參考效率', formula: '32–33%', rule: '歷史參考，不是每一款的標準' },
    capacity10Line: { zh: '10 組核心產能', formula: '300 人×26 天×480 分×效率×94% 出勤', rule: '40% 效率≈1.41M 標準分鐘≈23–24 萬件（6.01 SMV）；旺季 11 組要 12 週負荷 110–120% 連 8 週' }
  };

  /* ── 3. 情境：資料怎麼判斷 → 開頭怎麼講 → 該放什麼表／圖 → 燈號。zh/en 是 Paul 的句型（{} 由程式填數字） ── */
  var SCEN = [
    { id: 'materialNotEfficiency', cat: '料', when: '缺料停線日占可用工時 ≥30% 或主輔料到料只夠 <60% 產能', zh: '瓶頸不是人力、也不是設備，是料。{x}% 的工時是在缺料狀態下過的。', en: 'The bottleneck is material, not manpower or machines.', chart: 'stackedBlockedWip', tone: 'R' },
    { id: 'ordersNotScarce', cat: '料', when: '未完成訂單大、可立即上線 <30%', zh: '訂單並不短缺——帳上有 {open} 件；短缺的是「沒卡點、可以馬上做」的單：只有 {ready}（{pct}%）。', en: 'Orders are not scarce; what is scarce is unblocked work.', chart: 'openOrderWaterfall', tone: 'A' },
    { id: 'plannedShutdown', cat: '停工', when: '料或單撐不到 2 週', zh: '建議計畫性停工，不要天天非計畫停線：集中有限物料，讓開工日跑在最高效率。', en: 'Recommend a planned shutdown rather than repeated unplanned stoppages.', chart: 'phaseTable', tone: 'A', note: '提前 2 週通知；每月只申請一次；先 1–3 天／週，最多半個月～1 個月；組長／助理照上班；要先向勞動監察申請才適用半薪' },
    { id: 'noShutdownYet', cat: '停工', when: '排單 ≥2 週', zh: '排單量已超過 2 週，不必啟動停工，但後段要靠 {date} 那櫃布。', en: 'Loading exceeds two weeks, so no shutdown is needed now.', chart: 'weeksOfCover', tone: 'G' },
    { id: 'targetedIdle', cat: '停工', when: '節後部分組沒 ready-to-sew', zh: '不直接申請全廠停工；先補排，{date} 前確認哪幾組哪幾天真的沒單，再按組別／日期提局部停工。', en: 'Reload first; request targeted idle time by line and date only.', tone: 'A' },
    { id: 'attritionAfterShutdown', cat: '人力', when: '停工後一個月內離職增加、組數減少', zh: '{m} 月停工後離職增加，車縫組由 {a} 組減為 {b} 組。人力持續流失會直接壓縮後面的產能。', en: 'The shutdown drove resignations.', tone: 'A' },
    { id: 'noExpansion', cat: '人力', when: '排單 OK、效率接近目標', zh: '現階段不建議增加人力；只補離職缺口，靠穩定訂單＋穩定人力＋逐步提升效率取得產能。', en: 'Replacement hiring only.', tone: 'G' },
    { id: 'visibility', cat: '排單', when: '下月排單 <2 週或只排到月中', zh: '真正要關注的是 {m} 月排單能見度不足：只排到 {date}，{lines} 還沒有正式日期。正常要維持 6–8 週。', en: 'Maintain 6–8 weeks of production visibility.', chart: 'monthWeeks', tone: 'A' },
    { id: 'weeksCover', cat: '排單', when: '各組可做週數', zh: '只算物料已齊的部分，{ok} 約 2–2.9 週，{short} 只有 1.5–1.8 週，約 {date} 就沒有齊料的單可做。', en: 'On ready material alone ...', chart: 'weeksOfCoverBar', tone: 'A' },
    { id: 'frontLoaded', cat: '排單', when: '月排單 ≥70% 在前半月', zh: '{pct}% 集中在 {range}，{after} 後只剩 {qty} 件。', en: 'The plan is front-loaded.', chart: 'weeklyPacing', tone: 'A' },
    { id: 'versionDelta', cat: '排單', when: '新版排單', zh: '排單由 {old} 件{up}至 {new} 件（{d}，{pct}%），{who} 增加、{who2} 減少。', en: 'The plan moved from {old} to {new}.', chart: 'deltaTable', tone: 'I' },
    { id: 'pullForward', cat: '排單', when: '下月款提前做', zh: '{qty} 件 {m} 月款已提前在上月完成，仍留在表上要標 Done／Plan Change，不重複計入待做。', en: 'Pulled-forward work must not be double counted.', tone: 'A' },
    { id: 'routingMismatch', cat: '排單', when: '實際款式／組別和排單不同', zh: '最大的計劃問題不是沒做計劃上的產品，而是多條線實際轉線沒有回寫排單；否則月底看起來完成，PO 層級是假性達成。', en: 'Routing changes must be written back to the plan.', chart: 'planVsActualTable', tone: 'A' },
    { id: 'resequence', cat: '排單', when: '急單／分批改排', zh: '這是交期優先重排，不是照舊表逐列完成；合理換序和真正未達標要分開。', en: 'Valid resequencing is not underperformance.', tone: 'I' },
    { id: 'splitShipment', cat: '特殊單', when: '大單分批出', zh: '{style} 採分批：{d1} 先出 {q1} 件，不能再用全單 {q} 件月底完成來判斷延誤。', en: 'Measure against the staged target.', chart: 'paceLine', tone: 'A' },
    { id: 'paceLine', cat: '特殊單', when: '單一大款有交期', zh: '進度線：{d1} 累計約 {q1}、{d2} 約 {q2}。每天對一次，落後先查 SMV、熟手配置、機台、裁片供應。', en: 'Check the pace line daily.', chart: 'paceLine', tone: 'A' },
    { id: 'grsFirst', cat: '特殊單', when: '第一次 GRS／認證單', zh: '這是第一次做 GRS；第一次出貨交期、品質、追溯都沒問題，客人才會繼續下單。GRS 從布進倉第一刻開始管，不是出貨前補文件。', en: 'GRS control begins when fabric enters the factory.', chart: 'releaseGates', tone: 'A', note: '分線整段做、清線、專用籃、投入＝產出＋損耗、補料只能用 GRS 料、內部完成日比船期早 3 天' },
    { id: 'relabelSupport', cat: '人力', when: '日報備註：改標／拆箱／商標更新', zh: '{lines} 的人去做成品補標，新車縫 0 件不是閒置；補標完成數和人時另外記，不放進車縫效率比。', en: 'Relabeling labour is not idle capacity.', tone: 'I' },
    { id: 'wipOnly', cat: '效率', when: '日報備註：之前的半成品／只是上商標', zh: '{line} {date} 的 {qty} 件是舊半成品補標，效率會偏高，不和完整車縫比。這是正確的清 WIP 作法。', en: 'Label-only WIP is not full-cycle sewing.', tone: 'I' },
    { id: 'trimHold', cat: '料', when: '日報備註：缺商標／鈕扣／繡花片', zh: '缺{item}反覆卡住：{lines}，車好了不能結成品。每天的數字是當天快照，不能相加。', en: 'Repeated trim holds; daily snapshots are not additive.', chart: 'dailyHeldBar', tone: 'A' },
    { id: 'smvReview', cat: '效率', when: '日報備註：SMV 有問題／IE 重測', zh: '在 SMV 確定之前，{line} 的效率不能用來評價現場——分母是錯的。', en: 'Until the SMV is settled the denominator is wrong.', tone: 'A' },
    { id: 'mixPcs', cat: '效率', when: '件數 ±25% 以上但每日標準工時 ±12% 以內', zh: '件數增加 {p}% 但{fam}占 {s}%、SMV 低，「件數增加」不等於真正產能提高；完成標準工時反而 {h}。', en: 'Higher piece count is not proof of stronger capacity.', chart: 'piecesVsHours', tone: 'I' },
    { id: 'workdayNormalise', cat: '效率', when: '比較期間工作日不同（長假、少一天）', zh: '少做幾天不代表效率變差：月總標準工時少 {a}%，比工作日少 {b}% 還小；每工作日標準產出 {x}→{y} 小時。', en: 'Fewer operating days ≠ lower efficiency.', chart: 'monthsTable', tone: 'G' },
    { id: 'recovery', cat: '效率', when: '上一期只有 1–3 天（收假、停工後）', zh: '較節後首兩日日均 {a} 件回升至 {b}；但恢復含產品結構影響，不能全部視為成衣效率改善。', en: 'Recovery partly reflects product mix.', tone: 'I' },
    { id: 'effNearTarget', cat: '效率', when: '效率在目標 ±1 點', zh: '{e}% 距離 {t}% 目標只差 {d} 個百分點，重點是穩定各組、降低換款與設備停機，而不是增加總人力。', en: 'Stabilise lines rather than expand headcount.', tone: 'G' },
    { id: 'weakLineCause', cat: '效率', when: '個別組 <25%', zh: '最大問題是第 {n} 組：{days} 天只完成 {q} 件、加權效率 {e}%；{causes} 均有日報記錄。', en: 'The key exception is Line {n}.', chart: 'lineEffBar', tone: 'A' },
    { id: 'dualRisk', cat: '品質', when: '效率 <25% 且不良率 ≥10%', zh: '{lines} 同時低效率＋高不良，應把品質與 IE／線平衡一起處理，不是兩個獨立問題。', en: 'Combined quality-and-capacity risk.', chart: 'effVsReject', tone: 'R' },
    { id: 'goodCapBadQc', cat: '品質', when: '效率高但不良率高', zh: '{line} 效率 {e}% 很好但不良 {r}%：高產量不等於有效產能，大量返工最後仍會拖累出貨。', en: 'High output is not effective capacity if it enters rework.', tone: 'A' },
    { id: 'noQcData', cat: '品質', when: '沒有 QC 週報', zh: '本週沒收到 QC 週報，不估算不良率或品質造成多少效率損失；只用日報記錄的事實。', en: 'No QC report, so quality loss is not estimated.', tone: 'I' },
    { id: 'upstreamDefect', cat: '品質', when: '前幾大缺陷含染色髒污', zh: '染色來源髒污屬上游布料／染整風險，和車縫產生的髒污、針線不良分開統計，才能分派改善責任。', en: 'Separate fabric-origin from sewing-origin defects.', tone: 'A' },
    { id: 'maintNoProof', cat: '機修', when: '換針／零件有紀錄但沒有停機分鐘', zh: '換針 {n} 支、零件 {p} 件，但沒有停機起訖時間，不把領用數換算成產能損失；主因先按日報記錄的缺料／換款處理。', en: 'No downtime basis, so no capacity loss is imputed.', tone: 'I' },
    { id: 'holidayCompression', cat: '假期', when: '假期壓縮月底或船期', zh: '{h} 放假真正的影響在 {range}：月末餘量被壓縮到 {n} 個工作天，需要約 {e}% 效率才做得完。', en: 'The holiday compresses the month-end window.', tone: 'A' },
    { id: 'shipHolidayConflict', cat: '出貨', when: '船期改到假期', zh: '原排 {d1} 的 {c} 已移至 {d2}，但那幾天是 {h} 休假，出貨衝突沒有解除，只是日期往後移。', en: 'The shipping conflict has only been moved.', tone: 'A' },
    { id: 'shipSummaryMismatch', cat: '出貨', when: 'Summary 箱數≠明細箱數', zh: '船期 Summary {a} 箱、明細 {b} 箱，差 {d} 箱（{why}），對外確認前要先修正。', en: 'Resolve the carton discrepancy before external confirmation.', chart: 'shipTable', tone: 'A' },
    { id: 'fabricCoverage', cat: '料', when: '到布覆蓋率 <80% 或沒有到廠日的布單 >30%', zh: '已到的布只佔已下單的 {p}%；{n} 筆布單沒有預計到廠日（{s}%），沒有日期就不能排產、也不能承諾交期。', en: 'Without a date nothing can be scheduled or promised.', chart: 'fabricLayers', tone: 'R' },
    { id: 'concentration', cat: '接單', when: '單一客戶／單一款 ≥40%', zh: '{c} 一家占 {p}%、{s} 單一款占 {q}%，能否順利看這張單，不看款式數量。', en: 'High concentration.', tone: 'I' },
    { id: 'intakeDown', cat: '接單', when: '年接單量低於去年同期', zh: '{y} 年 1–{m} 月接單 {a} 件，比去年同期少 {p}%；後面的訂單要持續追，避免排單不足。', en: 'Order intake below last year.', tone: 'A' },
    { id: 'rushInsert', cat: '排單', when: '客戶急件／加標／改包', zh: '這次要改善的不是「不該插單」，而是補標完成多少、用了多少人時、要不要另設工序 SMV。', en: 'Account for the rush job fairly.', tone: 'I' },
    { id: 'customerHold', cat: '接單', when: '客戶要求 hold（樣品、chip、技術）', zh: '{c} 開口單 {q} 件全數 hold，等 {why}；這是技術／客戶確認，不是產能問題。', en: 'Customer hold, not capacity.', tone: 'A' },
    { id: 'tariffExternal', cat: '外部', when: '關稅、匯率、政策、時事（手動 📌）', zh: '{event}：影響 {who} 的下單／出貨時點；工廠端先看哪些單延後、哪些組空出來、要不要調船期。', en: 'External event impact.', tone: 'A', note: '2025/4 美國對等關稅（4/9 起暫實施 10%）讓 ADI、WPL、Aramark 4–9 月下單少 52%、10–12 月補回；2026/7/24 起 Section 301 柬埔寨 10%' },
    { id: 'dataGap', cat: '資料', when: '日報沒到、缺日、QC 只有單日檔', zh: '{d} 的日報還沒進來，不能說是停工或沒產量；{x} 先標「預估」，不改寫成實績。', en: 'Missing data is not zero output.', tone: 'I' },
    { id: 'sourceConflict', cat: '資料', when: '兩份資料對不上', zh: '{a} 和 {b} 差 {d}，正好等於 {why}；不影響總量，但要核對。', en: 'Reconcile the two sources.', tone: 'I' }
  ];

  /* ── 4. Paul 的句型（開頭、轉折、結尾） ── */
  var PHRASES = {
    open: ['結論是「整體OK，但不能放過各組落差」。', '本週算不算OK？', '先說結論：', '管理判斷：{x}，不代表{y}。', '一頁看懂'],
    contrast: ['但{x}不等於{y}。', '不能只看件數。', '這不是員工變慢，而是每件產品的標準工作內容不同。', '也不能因{x}就認定全廠沒有問題。', '問題不是「沒有訂單」，而是可立即上線的物料。'],
    evidence: ['日報明寫：「{quote}」', '{a}＋{b}＝{c}，四項可完整對帳。', '按{x}計算：{a}÷{b}≈{c}。'],
    action: ['先把這四點處理好。', '每天對一次進度線。', '觸發點：{date} 確認{x}；準時就不用停工。', '{who}：{what}（{when} 前）'],
    preface: ['如果覺得報告太長或難懂，直接看附件即可，或看前言跟圖表就好。', '看完的覺得有問題或有錯誤，歡迎隨時提出以便即時改善。'],
    en: { open: 'The overall verdict is satisfactory, but line-level gaps remain.', notEqual: '{x} is not proof of {y}.', judge: 'Judge by efficiency, not pieces.', notIdle: 'did not mean idle labour', snapshot: 'These are daily remarks/snapshots, not a reconciled stock balance.' }
  };

  /* ── 5. 顏色／燈號／圖 ── */
  var VISUAL = {
    lights: { G: { zh: 'GREEN 達成', hex: '#2E7D32' }, A: { zh: 'AMBER 達成但有風險／要核對', hex: '#F9A825' }, R: { zh: 'RED 未達成／要處理', hex: '#C62828' }, I: { zh: '說明', hex: '#1565C0' } },
    lineEff: { G: '≥30%', A: '25–30%', R: '<25%', B: '≥40%（藍燈，表現好）' },
    stopRatio: { G: '≤5%', A: '5–10%', R: '>10%' },
    charts: { piecesVsHours: '兩組長條：件數占比 vs 標準工時占比（產品別）', weeksOfCoverBar: '每組橫條：齊料週數＋等布週數，2 週紅線', paceLine: '累計線：進度線 vs 爬坡預估（多方案）', lineEffBar: '各組效率長條＋33% 損平線', dailyHeldBar: '每天缺標待處理件數（快照）', effVsReject: '散點：效率×不良率，右上為雙重風險', monthsTable: '月份×件數／工作日／日均／標準工時／每日標準工時／效率', fabricLayers: '三層：到貨率、沒到廠日、可裁', openOrderWaterfall: '開口箱數→可出→各卡點' }
  };

  /* ── 6. lint：Paul 改過、不能再出現的寫法 ── */
  var LINT = [
    { id: 'relabelIdle', re: /(補標|改標|補商標|加標|relabel)[^。\n]{0,30}(閒置|idle|沒事做|空轉)|(閒置|idle)[^。\n]{0,30}(補標|改標|relabel)/i, ok: /不是閒置|不等於閒置|not idle|not mean idle|not as idle|misclassif/i, msg: '補標／改標是支援作業，不是閒置（11/3、11/10）', fix: '寫「新車縫 0 件不是閒置，補標另記完成數和人時」' },
    { id: 'wipSum', re: /\d[\d,]*\s*[+＋]\s*\d[\d,]*\s*[+＋]?\s*\d*[\d,]*\s*件?(?:的)?半成品/, ok: /不能相加|不可.{0,4}相加|not additive|never sum/i, msg: '不同天的日報半成品是快照，不能相加（11/10）', fix: '分日列出，寫「當天快照，不能相加」' },
    { id: 'loadingAsUtil', re: /(排單負荷|組日負荷|負荷)[^。\n]{0,20}產能利用率|產能利用率[^。\n]{0,10}48/, ok: /不是|不再/, msg: '排單負荷（組日）不是產能利用率，也不是效率（10/8）', fix: '同時列件數／日、標準工時／日、物料可用性' },
    { id: 'rejectAsScrap', re: /(不良|Reject)[^。\n]{0,20}(視為報廢|當作報廢|當成報廢|扣除|扣掉|再扣)/i, ok: /不是|不可|不能|not/i, msg: '不良記錄不是報廢件，不能從完工數再扣（9/29、11/3）', fix: '寫「不良記錄率」，返工另計' },
    { id: 'avgPercent', re: /(效率|不良率)[^。\n]{0,8}(簡單平均|平均各組|各組平均)/, ok: /不是|不可|不採|不同於|而是|日報的|avoid|not the unweighted/i, msg: '效率／不良率要加權，不平均百分比（10/20、11/17）', fix: 'Σ標準分鐘÷Σ投入分鐘；Σ不良÷Σ檢驗' },
    { id: 'piecesOnly', re: /(件數|產量)(下降|減少|少了|掉)[^。\n]{0,12}(效率變差|退步|產能下降|產能不足)/, ok: /不代表|不等於|不能|not/i, msg: '件數變化先查工作天與產品結構（SMV），不能直接說效率變差（8/18、11/3、11/17）', fix: '用每工作日標準產出＋加權效率判斷' },
    { id: 'ratioAsPo', re: /(量體比|帳面量比)[^。\n]{0,15}(PO|交貨)達成/, ok: /不是|不可|not/i, msg: '量體比不是 PO 交貨達成率（10/27、11/3）', fix: '寫「量體比（僅量的比較）」' },
    { id: 'promiseDate', re: /(保證|一定會|一定能)[^。\n]{0,6}(交期|出貨|準時)|保證準時/, msg: '報告不承諾交期（週報規範）', fix: '寫條件：「前提是 X 準時到」' },
    { id: 'noDataAsStop', re: /(沒有|無)(日報|資料)[^。\n]{0,10}(停工|沒生產|零產出)(?!.{0,6}確認)/, msg: '日報還沒進來不等於停工或沒生產（11/13）', fix: '寫「日報還沒匯入」' },
    { id: 'blameProduction', re: /(生產|生管|PMC)[^。\n]{0,6}(寫錯|填錯|搞錯)|請生產(說明|解釋)/, msg: '寄台北的報告用生產團隊自己的口氣，不寫「生產寫錯／請生產解釋」，錯的直接改（11/24 停工規則）', fix: '直接寫正確的組別、日期' },
    { id: 'aiFiller', re: /值得注意的是|綜上所述|總而言之|不僅.{1,12}更|至關重要|賦能|助力|全方位|顯著提升|有效提升|持續改善中|整體表現良好/, msg: '套話（REPORT_STANDARD §4）', fix: '直接講數字和結論' },
    { id: 'simplified', re: /[这们为还时后发设备产线组单将对应与关质应该]{2,}/, ok: /「[^」]*」/, msg: '正文出現簡體字（日報備註原文要放在「」裡引用）', fix: '轉繁體，或用「」引用原文' },
    { id: 'enSuspension', re: /work suspension|suspend(ed)? operations|production suspension/i, msg: '英文的停工用 shutdown（Paul 指定）', fix: 'shutdown / planned shutdown / rotating shutdown' },
    { id: 'coronationOff', re: /10\/29[^。\n]{0,10}(放假|休假|停工)/, ok: /照常|對調|上班/, msg: '2026/10/29 加冕日已與亡人節對調、照常上班（10/22）', fix: '寫「10/29 照常上班」' },
    { id: 'lineDaysToTaipei', re: /組日/, types: ['shutdownProposal'], msg: '停工報告給台北不要用「組日」講（11/24 規則），改講幾組、幾天、多少人', fix: '例：L2、L5、L6、L9、L10 停 12/1–12/5，約 140 人' },
    { id: 'forecastAsActual', re: /(預估|預計)[^。\n]{0,6}(即為|當作|就是)實績/, msg: '預估值不冒充實績（10/6）', fix: '標「當時預估」，正式日報補齊後再月結' }
  ];

  function lint(text, opt) {
    opt = opt || {}; var t = String(text || ''), out = [];
    LINT.forEach(function (r) {
      if (r.types && opt.type && r.types.indexOf(opt.type) < 0) return;
      if (r.types && !opt.type) return;
      var re = new RegExp(r.re.source, r.re.flags.indexOf('g') >= 0 ? r.re.flags : r.re.flags + 'g'), m;
      while ((m = re.exec(t))) {
        var a = Math.max(0, m.index - 30), b = Math.min(t.length, m.index + m[0].length + 30), ctx = t.slice(a, b);
        var sentence = t.slice(t.lastIndexOf('。', m.index) + 1, (t.indexOf('。', m.index) + 1 || t.length + 1) - 1);
        if (r.ok && (r.ok.test(ctx) || r.ok.test(sentence))) continue;
        if (r.id === 'simplified' && /「[^」]*$/.test(t.slice(0, m.index))) continue;
        out.push({ id: r.id, at: m.index, text: m[0], msg: r.msg, fix: r.fix });
        if (out.length > 60) break;
      }
    });
    return out;
  }

  /* ── 7. 看資料決定要用哪些情境（給 AI 草稿提示詞用：哪幾個必寫） ── */
  function pick(facts) {
    var f = facts || {}, out = [];
    function on(id, why) { out.push({ id: id, why: why }); }
    if (f.prevDays != null && f.prevDays <= 3) on('recovery', '上一期只有 ' + f.prevDays + ' 天');
    if (f.days != null && f.prevDays != null && f.days !== f.prevDays) on('workdayNormalise', '工作日 ' + f.prevDays + '→' + f.days);
    if (f.piecesPerDayChg != null && f.stdPerDayChg != null && Math.abs(f.piecesPerDayChg) >= 25 && Math.abs(f.stdPerDayChg) <= 12) on('mixPcs', '件數 ' + f.piecesPerDayChg + '%、標準工時 ' + f.stdPerDayChg + '%');
    if (f.relabelLines && f.relabelLines.length) on('relabelSupport', f.relabelLines.join('、'));
    if (f.trimHoldDays) on('trimHold', f.trimHoldDays + ' 組日缺輔料');
    if (f.weakLines && f.weakLines.length) on('weakLineCause', f.weakLines.join('、'));
    if (f.coverWeeks != null) on(f.coverWeeks >= 2 ? 'noShutdownYet' : 'plannedShutdown', '可做 ' + f.coverWeeks + ' 週');
    if (f.nextMonthPlannedTo) on('visibility', '下月只排到 ' + f.nextMonthPlannedTo);
    if (f.qcMissing) on('noQcData', '沒有 QC 週報');
    if (f.shipMismatch) on('shipSummaryMismatch', '差 ' + f.shipMismatch + ' 箱');
    if (f.splitOrder) on('splitShipment', f.splitOrder);
    if (f.external) on('tariffExternal', f.external);
    return out;
  }

  g.VRTReportStyle = { version: VERSION, TYPES: TYPES, METRICS: METRICS, SCEN: SCEN, PHRASES: PHRASES, VISUAL: VISUAL, LINT: LINT, lint: lint, pick: pick };
})(typeof globalThis !== 'undefined' ? globalThis : this);
