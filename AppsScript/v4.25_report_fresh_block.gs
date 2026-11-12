
/* ── v4.15 (2026-11-12) 報告跟著資料更新（Paul 11/12：平台日／週報補了車縫裁剪還寫只到 11/3，要隨資料更新隨時變更、自動發群組，重複或沒資料不發）
   reportFreshTrigger 每小時跑（只在 08–17 點做事；一次只查一份免得超過 6 分鐘：雙數點查日報，單數點輪流查效率／排單週報）：
   · 日報：最新車縫日期沒有報告 → 產生並發群組；有報告但車縫／裁剪／QC 數字跟現在雲端算的不同 → 重算重發（同一份一天最多重發一次）；一樣 → 不發。
   · 上週效率／排單週報：週一 10:30 的排程產生後，之後補進來的資料讓數字變了 → 重算重發（同樣一天最多一次）；還沒產生的不在這裡產生。
   群組訊息底下：🏭 生產平台、🏢 PSJERP 並列，下一排 📰 日報／📋 排單週報／📅 效率週報。 */
function rfSig_(f){ f=f||{}; var pick=function(o){ if(!o||typeof o!=='object')return o==null?null:o; var r={}; Object.keys(o).sort().forEach(function(k){ var v=o[k]; if(typeof v==='number'||typeof v==='string')r[k]=v; }); return r; };
  return JSON.stringify({s:pick(f.sewing),c:pick(f.cutting),q:pick(f.qc),p:pick(f.plan||f.prodplan)}); }
function rfCheck_(anchor,period,kind,createIfMissing){
  var today=todayYmd_(); var data=dailyReportData_(anchor||'',today,period);
  var key=period==='week'?DR.helpers.isoWeekKey(data.date)+(kind==='plan'?'-plan':''):data.date;
  var ex=dailyReportLoad_(key);
  if(!ex){ if(!createIfMissing)return key+'：還沒有報告（等原排程產生）'; generateDailyReport(data.date,{period:period,kind:kind,send:true}); return key+'：新產生並發送'; }
  var f=DR.compute(data,{date:data.date,today:today,period:period,kind:kind});
  if(rfSig_(f)===rfSig_(ex.facts)){ if(!ex.sentAt&&period==='day'){ dailyReportSend_(ex); return key+'：補發'; } return key+'：資料沒變，不發'; }
  var p=rsProps_(), k='RF_SENT_'+key; if(p.getProperty(k)===today)return key+'：今天已重發過';
  generateDailyReport(data.date,{period:period,kind:kind,force:true,send:true}); p.setProperty(k,today); return key+'：資料有更新，已重算重發';
}
function reportFreshTrigger(){
  var h=Number(Utilities.formatDate(new Date(),CFG.TZ,'H')); if(h<8||h>17)return 'outside 08-17';
  var out=[], lastWeek=DR.helpers.addDays(todayYmd_(),-7);
  [['','day','day',true],[lastWeek,'week','eff',false],[lastWeek,'week','plan',false]].filter(function(a,i){ return i===(h%2===0?0:(h%4===1?1:2)); }).forEach(function(a){ try{ out.push(rfCheck_(a[0],a[1],a[2],a[3])); }catch(e){ out.push(a[1]+'/'+a[2]+' 錯誤：'+(e&&e.message||e)); } });
  console.log(out.join(' · ')); return out.join(' · ');
}
function installReportFreshTrigger(){ var has=ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='reportFreshTrigger'}); if(!has)ScriptApp.newTrigger('reportFreshTrigger').timeBased().everyHours(1).create(); return has?'reportFreshTrigger already installed':'reportFreshTrigger installed (hourly, works 08-17)'; }
function previewReportFresh(){ var lastWeek=DR.helpers.addDays(todayYmd_(),-7), today=todayYmd_(); return [['','day','day'],[lastWeek,'week','eff'],[lastWeek,'week','plan']].map(function(a){ var data=dailyReportData_(a[0],today,a[1]); var key=a[1]==='week'?DR.helpers.isoWeekKey(data.date)+(a[2]==='plan'?'-plan':''):data.date; var ex=dailyReportLoad_(key); if(!ex)return key+'：沒有報告'; var f=DR.compute(data,{date:data.date,today:today,period:a[1],kind:a[2]}); return key+'：'+(rfSig_(f)===rfSig_(ex.facts)?'一樣':'不同（會重發）')+' · 已發 '+(ex.sentAt||'否'); }).join('\n'); }
function drKeyboard_(mode){
  mode=mode==='plan'?'plan':mode==='eff'?'eff':'day';
  var page=mode==='plan'?'prodplan':mode==='eff'?'sewing':'overview';
  return { inline_keyboard: [ siteRow_(['portal','erp']), [{ text:'📰 日報', callback_data:'drday' },{ text:'📋 排單週報', callback_data:'drplan' },{ text:'📅 效率週報', callback_data:'dreff' }], siteRow_([page]) ] };
}
