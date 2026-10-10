/* ═══════════════════════════════════════════════════════════════
   v4.6 生產日報 DAILY PRODUCTION REPORT（修改指令 D1）＋ AI 文字接點（D1 AI / D2，Claude API）
   - 數字全部由 vrt-daily-report-v1.js（build_gas.py 貼在這段前面）計算；AI 只改寫文字，回來的文字會用 checkAiText 逐個數字核對，
     有任何不在事實內的數字就整段不採用（保留規則版）。— 共同原則 4
   - 每個日期只產生一次：Drive 檔 daily_report_<date>.json（與網頁 production_v4.html「📰 生產日報」共用同一份）
   - 時間觸發：installDailyReportTrigger() 建 10:00 與 15:00 兩個觸發器（同一個冪等函式；網頁已產生就不重做，已發過就不重發）
   - Claude API：Script Properties → CLAUDE_API_KEY（必填）、CLAUDE_MODEL（可省略：第一次會呼叫 /v1/models 自動挑 sonnet 並記下）、
     CLAUDE_PRICE_IN / CLAUDE_PRICE_OUT（每百萬 token 美元，預設 2 / 10，只用來估算顯示）。金鑰只在 GAS，瀏覽器看不到。
   - 用量記錄：claude_usage_log.json（每次呼叫：時間、用途、模型、tokens、估算費用）；action dailyReportUsage 回傳本月／累計
   - 不動既有 doGet／doPost 行為、不動 pollTelegram、不動其他觸發器（規格書 11.2）
═══════════════════════════════════════════════════════════════ */
const DR = VRTDailyReport;
const DR_FILE_ = d => 'daily_report_' + String(d).replace(/[^0-9A-Za-z-]/g,'') + '.json';   // date yyyy-MM-dd or week yyyy-Www
const DR_INDEX_ = 'daily_report_index.json';
const CLAUDE_USAGE_ = 'claude_usage_log.json';
const CLAUDE_API_ = 'https://api.anthropic.com/v1';
const CLAUDE_VERSION_ = '2023-06-01';

/* ── storage (same Drive folder as the Smart Sync buckets) ── */
function dailyReportLoad_(date){ const raw=loadFromDrive(DR_FILE_(date)); if(!raw)return null; try{return JSON.parse(raw)}catch(_){return null} }
function dailyReportIndex_(){ const raw=loadFromDrive(DR_INDEX_); let idx=[]; try{idx=raw?JSON.parse(raw):[]}catch(_){idx=[]} return Array.isArray(idx)?idx:[] }
function dailyReportSave_(rep){
  rep.savedAt=new Date().toISOString(); saveToDrive(DR_FILE_(rep.date), JSON.stringify(rep));
  const idx=dailyReportIndex_().filter(x=>x.date!==rep.date);
  idx.push({date:rep.date,generatedAt:rep.generatedAt,source:rep.source,sentAt:rep.sentAt||'',ai:!!(rep.ai&&rep.ai.ok),zhChars:rep.zhChars||0,pieces:rep.facts&&rep.facts.sewing?rep.facts.sewing.pieces:null});
  idx.sort((a,b)=>a.date<b.date?1:-1); saveToDrive(DR_INDEX_, JSON.stringify(idx.slice(0,400))); return rep;
}

/* ── data for the report, read from the cloud buckets (only the months the report needs) ── */
function drMonthsFor_(D){ return [...new Set([D.slice(0,7), DR.helpers.addDays(D,-7).slice(0,7), DR.helpers.addDays(D,-14).slice(0,7), DR.helpers.addDays(D,-28).slice(0,7)])].sort(); }
function drRowsMonths_(tool,prefixes,months){ const m=readSmartManifest_(tool); if(!m)return {rows:[],manifest:null}; const rows=[]; const keys=prefixes[0]==='all'?Object.keys(m.buckets):[].concat(...months.map(mm=>bucketKeysFor_(prefixes,mm))).filter(k=>m.buckets[k]); for(const k of keys){const b=m.buckets[k],raw=loadFromDrive(smartBucketName_(tool,b.source,k)); if(!raw)continue; for(const r of JSON.parse(raw))rows.push(r)} return {rows,manifest:m}; }
function dailyReportData_(dateOpt,today,period){
  let D=dateOpt||''; if(!D){ D=latestDataDate_('sewing',['m'])||DR.helpers.addDays(today,-1); }
  const months=drMonthsFor_(D);
  const sew=drRowsMonths_('sewing',['m'],months), cut=drRowsMonths_('cutting',['m'],months), qc=drRowsMonths_('qc',['m','p:kpi'],months), sp=drRowsMonths_('spareparts',['p:maint_needle','p:maint_part','m'],months), ship=drRowsMonths_('shipping',['all'],months), cs=drRowsMonths_('custstats',['all'],months), plan=drRowsMonths_('prodplan',['m'],months);
  const csMeta=(cs.manifest&&cs.manifest.meta&&cs.manifest.meta.summaryData)||{};
  return {
    date:D, period:period||'day', sewing:shapeRows_('sewing',sew.rows), cutting:shapeRows_('cutting',cut.rows), qc:shapeRows_('qc',qc.rows), spareparts:shapeRows_('spareparts',sp.rows),
    shipping:shapeRows_('shipping',ship.rows), prodplan:shapeRows_('prodplan',plan.rows),
    custstats:{overall:csMeta.overall||{},customers:csMeta.customers||[],snapshotDate:csMeta.snapshotDate||'',details:shapeRows_('custstats',cs.rows)},
    wipFallback:csMeta.overall&&csMeta.overall.cuttingWip!=null?{cutNotSewn:Number(csMeta.overall.cuttingWip)||0,basis:'custstats'}:null,
  };
}

/* ── generate (idempotent per date) ── */
function generateDailyReport(dateOpt, opts){
  opts=opts||{}; const today=todayYmd_(); const period=opts.period==='week'?'week':'day'; const data=dailyReportData_(dateOpt||'',today,period);
  const key=period==='week'?DR.helpers.isoWeekKey(data.date):data.date;
  const existing=dailyReportLoad_(key);
  if(existing&&!opts.force){ if(opts.send&&!existing.sentAt)return dailyReportSend_(existing); return existing; }
  const f=DR.compute(data,{date:data.date,today,period}); const r=DR.render(f);
  const rep={date:f.date,period,facts:f,text:r.text,html:r.html,zhChars:r.zhChars,generatedAt:f.generatedAt,source:'gas',version:DR.version,dataNote:'雲端桶 cloud buckets · WIP '+(f.wip&&f.wip.basis||'none'),doc:DR.docHtml(f,r.text)};
  if(opts.ai!==false&&claudeKey_()){ try{ const ai=dailyReportAi_(f,'daily:'+f.date); if(ai)rep.ai=ai; }catch(e){ rep.aiError=String(e&&e.message||e); } }
  dailyReportSave_(rep);
  if(opts.send)return dailyReportSend_(rep);
  return rep;
}
function dailyReportSend_(rep,chatId){
  const useAi=rep.ai&&rep.ai.ok&&rep.ai.html;
  const res=tgSendHtml_(chatId||CFG.CHAT_ID, useAi?rep.ai.html:rep.html, null);
  rep.sentAt=new Date().toISOString(); rep.sentAi=!!useAi; rep.sentMessageId=res&&res.result&&res.result.message_id||null; dailyReportSave_(rep); return rep;
}
// 時間觸發器用（10:00 / 15:00）：最近有車縫資料的那一天還沒有日報就產生並推到生產群組；已產生未推送就只推送；都做過就什麼都不做
function dailyReportTrigger(){ return generateDailyReport('',{send:true}); }
// 週報觸發器（週一 10:30）：上一個完整週（週一～週日）；同一週只產生一次
function weeklyReportTrigger(){ const anchor=DR.helpers.addDays(todayYmd_(),-7); return generateDailyReport(anchor,{period:'week',send:true}); }
function installDailyReportTrigger(){
  const fns=ScriptApp.getProjectTriggers().map(t=>t.getHandlerFunction()); const out=[];
  if(fns.indexOf('dailyReportTrigger')<0){ ScriptApp.newTrigger('dailyReportTrigger').timeBased().atHour(10).everyDays(1).inTimezone(CFG.TZ).create(); ScriptApp.newTrigger('dailyReportTrigger').timeBased().atHour(15).everyDays(1).inTimezone(CFG.TZ).create(); out.push('dailyReportTrigger 10:00 + 15:00'); } else out.push('dailyReportTrigger already installed');
  if(fns.indexOf('weeklyReportTrigger')<0){ ScriptApp.newTrigger('weeklyReportTrigger').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(10).nearMinute(30).inTimezone(CFG.TZ).create(); out.push('weeklyReportTrigger Monday 10:30'); } else out.push('weeklyReportTrigger already installed');
  return out.join(' · ')+' ('+CFG.TZ+')';
}
function removeDailyReportTrigger(){ let n=0; ScriptApp.getProjectTriggers().forEach(t=>{ if(t.getHandlerFunction()==='dailyReportTrigger'||t.getHandlerFunction()==='weeklyReportTrigger'){ScriptApp.deleteTrigger(t);n++} }); return 'removed '+n; }
// 手動測試：不發訊息，只把日報／週報文字印在記錄（previewDailyReport('2026-10-08') 或 previewDailyReport('2026-10-08','week')）
function previewDailyReport(dateOpt,period){ const today=todayYmd_(); const data=dailyReportData_(dateOpt||'',today,period); const f=DR.compute(data,{date:data.date,today,period:period==='week'?'week':'day'}); const r=DR.render(f); console.log(r.text); console.log('zhChars',r.zhChars,'anomalies',f.anomalies.length,'rag',JSON.stringify(f.rag),'source',JSON.stringify(f.source)); return r.text; }

/* ── Claude API (key stays in Script Properties) ── */
function claudeProps_(){ return PropertiesService.getScriptProperties(); }
function claudeKey_(){ return String(claudeProps_().getProperty('CLAUDE_API_KEY')||'').trim(); }
function claudePrice_(){ const p=claudeProps_(); return {inM:Number(p.getProperty('CLAUDE_PRICE_IN')||2), outM:Number(p.getProperty('CLAUDE_PRICE_OUT')||10)}; }
function claudeHeaders_(){ return {'x-api-key':claudeKey_(),'anthropic-version':CLAUDE_VERSION_}; }
// 列出帳號可用的模型（在編輯器執行一次，看正確的 model id）
function claudeListModels(){ if(!claudeKey_())throw new Error('Script Property CLAUDE_API_KEY 未設定'); const r=UrlFetchApp.fetch(CLAUDE_API_+'/models?limit=100',{headers:claudeHeaders_(),muteHttpExceptions:true}); const b=JSON.parse(r.getContentText()||'{}'); if(r.getResponseCode()>=300)throw new Error('models: HTTP '+r.getResponseCode()+' '+(b.error&&b.error.message||'')); const ids=(b.data||[]).map(x=>x.id); console.log(ids.join('\n')); return ids; }
function claudeModel_(){ const p=claudeProps_(); const set=String(p.getProperty('CLAUDE_MODEL')||'').trim(); if(set)return set;
  const ids=claudeListModels(); const pick=ids.find(i=>/sonnet/i.test(i))||ids.find(i=>/haiku/i.test(i))||ids[0]; if(!pick)throw new Error('no Claude model available for this key'); p.setProperty('CLAUDE_MODEL',pick); return pick; }
function claudeMessage_(system,user,maxTokens,purpose){
  const key=claudeKey_(); if(!key)throw new Error('CLAUDE_API_KEY 未設定（Apps Script → 專案設定 → 指令碼屬性）');
  const model=claudeModel_();
  const res=UrlFetchApp.fetch(CLAUDE_API_+'/messages',{method:'post',contentType:'application/json',headers:claudeHeaders_(),muteHttpExceptions:true,payload:JSON.stringify({model:model,max_tokens:maxTokens||1200,temperature:0.2,system:system,messages:[{role:'user',content:user}]})});
  const code=res.getResponseCode(); let body={}; try{body=JSON.parse(res.getContentText()||'{}')}catch(_){}
  if(code>=300)throw new Error('Claude API HTTP '+code+': '+(body.error&&body.error.message||res.getContentText().slice(0,200)));
  const text=(body.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('').trim();
  const u=body.usage||{}; const price=claudePrice_(); const cost=(Number(u.input_tokens||0)*price.inM+Number(u.output_tokens||0)*price.outM)/1e6;
  claudeUsageLog_({at:new Date().toISOString(),purpose:purpose||'',model:model,inTokens:Number(u.input_tokens||0),outTokens:Number(u.output_tokens||0),costUsd:Math.round(cost*1e5)/1e5});
  return {text:text,model:model,usage:{inTokens:Number(u.input_tokens||0),outTokens:Number(u.output_tokens||0)},costUsd:Math.round(cost*1e5)/1e5,priceM:price};
}
function claudeUsageLog_(entry){ let log=[]; try{const raw=loadFromDrive(CLAUDE_USAGE_);log=raw?JSON.parse(raw):[]}catch(_){log=[]} if(!Array.isArray(log))log=[]; log.push(entry); if(log.length>3000)log=log.slice(-3000); saveToDrive(CLAUDE_USAGE_,JSON.stringify(log)); }
function claudeUsageSummary_(){ let log=[]; try{const raw=loadFromDrive(CLAUDE_USAGE_);log=raw?JSON.parse(raw):[]}catch(_){log=[]} const month=todayYmd_().slice(0,7); const sum=rows=>rows.reduce((o,e)=>{o.calls++;o.inTokens+=Number(e.inTokens||0);o.outTokens+=Number(e.outTokens||0);o.costUsd+=Number(e.costUsd||0);return o},{calls:0,inTokens:0,outTokens:0,costUsd:0}); const m=sum(log.filter(e=>String(e.at||'').slice(0,7)===month)),all=sum(log); m.costUsd=Math.round(m.costUsd*1000)/1000; all.costUsd=Math.round(all.costUsd*1000)/1000; return {month:month,thisMonth:m,total:all,configured:!!claudeKey_(),model:String(claudeProps_().getProperty('CLAUDE_MODEL')||''),priceM:claudePrice_(),last:log.slice(-5)}; }

/* ── D1 AI wording: rewrite only; every number is checked against the facts ── */
function dailyReportAi_(facts,purpose){
  const p=DR.aiPrompt(facts); const r=claudeMessage_(p.system,p.user,p.maxTokens,purpose||'daily');
  const chk=DR.checkAiText(r.text,facts);
  const out={ok:chk.ok,text:r.text,html:chk.ok?DR.helpers.esc(r.text).replace(/^(📰.*|[123]️⃣.*)$/mg,'<b>$1</b>'):'',model:r.model,usage:r.usage,costUsd:r.costUsd,at:new Date().toISOString(),badNumbers:chk.bad};
  return out;
}
/* ── D2 per-module AI summary: rewrite a computed summary (vrt-tg-summary text); numbers must all come from the input text ── */
const AI_FOCUS_={
  spareparts:'機修零件（照 VRT Maintenance Data Review 的寫法）：非計畫換針比例高的線與機台、異常高耗的線別、待評估的舊機型（損壞集中的機型）、換針原因分布；若摘要裡有未填原因或欄位錯置的列要提醒檢查 Excel 欄位；先給整體判定再給明細。',
  ie:'IE／SMV（照 IE/SMV 11 款分析的寫法）：本期 SMV 差異最大的款與方向（+/−%）、對產能與排線的影響、正式核准狀態；數字不夠時說明「正式值未確認、不自行推算」。',
  qc:'Final QC（照週報第七、八節的寫法）：退修率與趨勢、前幾大缺點占退修的比例、問題線別、效率×品質的雙重風險線；退修不再從產量扣除。',
  fabricdelivery:'胚布中心：缺料與交期風險、哪些布種／PO 要先追；資料沒有的日期不要推算。',
  fabricstock:'布料庫存（照布倉收發紀錄檢查報告的寫法）：現有庫存與舊布使用、缺料風險、紀錄品質問題（日期／單號空白、欄位錯置）要點名。',
  orders:'訂單：未出貨量變化、到期 PO、客戶集中度；區分「整批到期量」與「已核實未完成量」。',
  prodplan:'排單（照 10 月排單更新的寫法）：排單負荷≠效率；各組負荷鬆緊、逾期未完工、下週開工款、可立即上線的物料才是限制。',
  shipping:'出貨：本期未出貨最多的客戶／PO、逾期與風險、整櫃與 LCL 分開看。',
  sewing:'車縫：產量、日均、人力與加權效率要分開判讀（人力沒降而效率降＝不是缺人）；件數≠標準工時。',
  cutting:'裁剪：裁剪量與車縫節奏是否同步、已裁未縫累積風險。',
  monthship:'月出貨：本月已出／計畫、整櫃數、風險船期。',
  custstats:'客戶統計：未出貨餘量、未車縫、無布可做占比；訂單很多但可立即上線才是限制。',
};
function aiSummary_(kind,text,period,lang){
  const focus=AI_FOCUS_[kind]||'依資料內容整理重點與建議。';
  const system='你是 VRT 成衣廠的生產助理。你只能根據提供的「程式摘要」改寫成管理層看的中英對照摘要，絕對不能自己計算、推算、四捨五入或補充任何數字；所有數字必須逐字沿用摘要裡的數字。沒有的事不要寫。格式：每一點「中文一行＋English 一行」，最多約 200 個中文字；只輸出摘要本文。\nYou only rephrase the given computed summary into a bilingual management brief (one Chinese line + one English line per point, about 200 Chinese characters max). Never compute, derive, round or add numbers — copy them verbatim. Output the brief only.\n'+DR.STYLE_GUIDE;
  const user='【模組 Module】'+kind+'（期間 period: '+(period||'')+'）\n【重點方向 Focus】'+focus+'\n\n【程式摘要 Computed summary — 唯一的數字來源 the only source of numbers】\n'+String(text||'').replace(/<[^>]+>/g,'');
  const r=claudeMessage_(system,user,900,'summary:'+kind);
  const chk=DR.checkNumbersAgainstText(r.text,String(text||''));
  return {ok:chk.ok,text:r.text,html:chk.ok?DR.helpers.esc(r.text):'',model:r.model,usage:r.usage,costUsd:r.costUsd,badNumbers:chk.bad,at:new Date().toISOString()};
}

/* ── web actions (doPost): dailyReportList / dailyReportGet / dailyReportSave / dailyReportSend / dailyReportAi / dailyReportUsage / aiSummary ── */
function handleDailyReport_(p){
  const a=String(p.action||'');
  if(a==='dailyReportList')return okCors({ok:true,index:dailyReportIndex_().slice(0,Number(p.limit||90))});
  if(a==='dailyReportGet'){const rep=dailyReportLoad_(p.date);return okCors({ok:!!rep,report:rep})}
  if(a==='dailyReportSave'){const rep=p.report;if(!rep||!rep.date||!rep.facts)return okCors({ok:false,error:'report.date / report.facts required'});
    const ex=dailyReportLoad_(rep.date); if(ex&&!p.force){ // keep the first generation; only merge sent / ai flags
      if(rep.sentAt&&!ex.sentAt){ex.sentAt=rep.sentAt;ex.sentAi=!!rep.sentAi} if(rep.ai&&rep.ai.ok&&!(ex.ai&&ex.ai.ok))ex.ai=rep.ai; dailyReportSave_(ex); return okCors({ok:true,kept:true,report:ex}); }
    rep.source=rep.source||'page'; dailyReportSave_(rep); return okCors({ok:true,report:rep})}
  if(a==='dailyReportSend'){let rep=dailyReportLoad_(p.date); if(!rep&&p.report)rep=p.report; if(!rep)return okCors({ok:false,error:'no report for '+p.date}); if(p.useAi===false||p.useAi==='false'){const t=rep.ai;rep.ai=null;dailyReportSend_(rep,p.chat_id);rep.ai=t;dailyReportSave_(rep)}else dailyReportSend_(rep,p.chat_id); return okCors({ok:true,sentAt:rep.sentAt,sentAi:rep.sentAi})}
  if(a==='dailyReportAi'){if(!claudeKey_())return okCors({ok:false,error:'CLAUDE_API_KEY 未設定（GAS 指令碼屬性）',notConfigured:true}); const facts=p.facts||(dailyReportLoad_(p.date)||{}).facts; if(!facts)return okCors({ok:false,error:'facts required'});
    try{const ai=dailyReportAi_(facts,'daily:'+(facts.date||p.date||'')); const rep=dailyReportLoad_(facts.date); if(rep&&ai.ok){rep.ai=ai;dailyReportSave_(rep)} return okCors({ok:ai.ok,ai:ai,usage:claudeUsageSummary_()})}catch(e){return okCors({ok:false,error:String(e&&e.message||e)})}}
  if(a==='dailyReportUsage')return okCors({ok:true,usage:claudeUsageSummary_()});
  if(a==='aiSummary'){if(!claudeKey_())return okCors({ok:false,error:'CLAUDE_API_KEY 未設定（GAS 指令碼屬性）',notConfigured:true}); try{const ai=aiSummary_(String(p.kind||''),String(p.text||''),p.period,p.lang); return okCors({ok:ai.ok,ai:ai,usage:claudeUsageSummary_()})}catch(e){return okCors({ok:false,error:String(e&&e.message||e)})}}
  return okCors({ok:false,error:'unknown daily report action '+a});
}
function checkProductionV46(){ const r=checkProductionV45(); r.dailyReport=true; r.weeklyReport=true; r.claudeConfigured=!!claudeKey_(); r.claudeModel=String(claudeProps_().getProperty('CLAUDE_MODEL')||'(auto)'); r.dailyReportTriggers=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='dailyReportTrigger').length; r.reports=dailyReportIndex_().slice(0,5); console.log(JSON.stringify(r,null,2)); return r; }
