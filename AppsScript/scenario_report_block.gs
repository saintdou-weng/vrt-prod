/* ═══ v4.13 (2026-11-11) 情境報告 — 日報／效率週報／排單週報 群組版 ═══
   貼法：把 vrt-report-scen-v1.js 整份貼在這段「前面」，合成一個 .gs 檔，放在專案最後一個檔（取代 v412_compact_daily_report 的內容）。
   同名函式會蓋掉前面的版本；主檔、Token、觸發器都不動。
   Paul 11/11：報告要能應付 10～40 種情境（放假、停工、加班、少人、加減組、料、代工、突發…），開頭一句結論要準，
   重點一眼看到，精實、數字精準、口氣像他，多用色條和圖。
   - 文字：VRTReportScen.render(facts)：標題 → 燈號＋一句結論 → 標籤 → 最要緊的一段排最前 → 其餘固定順序 → 要處理 → 資料日期。
   - 數字：DR.compute 的 facts ＋ VRTReportScen.extras（加班、目標達成、現場回報原因、停工日、代工），不經 AI 改寫。
   - 圖：Charts 服務畫一張 PNG（日報＝各組效率、效率週報＝每天件數、排單週報＝各組排單件數），文字訊息之後靜音送出。
     指令碼屬性 RS_CHART=0 可關掉圖。
   - 突發事件：指令碼屬性 RS_NOTE_<日期或週別>（例 RS_NOTE_2026-11-11、RS_NOTE_2026-W46、RS_NOTE_2026-W46-plan）＝一句話，
     會用 📌 放在結論上面；setReportNote('2026-11-11','10:00 停電 1.5 小時') 可寫入。 */
const RSCEN_ = VRTReportScen;
function rsProps_(){ return PropertiesService.getScriptProperties(); }
function rsNote_(key){ try{ return String(rsProps_().getProperty('RS_NOTE_'+key)||'').trim(); }catch(e){ return ''; } }
function setReportNote(key,text){ key=String(key||'').trim(); if(!key)throw new Error('key required: yyyy-MM-dd / yyyy-Www / yyyy-Www-plan'); if(text)rsProps_().setProperty('RS_NOTE_'+key,String(text)); else rsProps_().deleteProperty('RS_NOTE_'+key); return {key:key,note:rsNote_(key)}; }
function rsRender_(rep){ return RSCEN_.render(rep.facts,{note:rsNote_(rep.date)}); }
function rsHtml_(rep){ return rsRender_(rep).html; }

/* 產生（每個日期／週別只做一次）：和原本一樣，多一步 facts.x = extras(原始列) */
function generateDailyReport(dateOpt, opts){
  opts=opts||{}; const today=todayYmd_(); const period=opts.period==='week'?'week':'day'; const kind=period==='week'?(opts.kind==='plan'?'plan':'eff'):'day'; const data=dailyReportData_(dateOpt||'',today,period);
  const key=period==='week'?DR.helpers.isoWeekKey(data.date)+(kind==='plan'?'-plan':''):data.date;
  const existing=dailyReportLoad_(key);
  if(existing&&!opts.force){ if(opts.send&&!existing.sentAt)return dailyReportSend_(existing); return existing; }
  const f=DR.compute(data,{date:data.date,today,period,kind});
  try{ f.x=RSCEN_.extras(data,f); }catch(e){ f.xError=String(e&&e.message||e); }
  const r=DR.render(f), rz=DR.render(f,{lang:'zh'});
  const rep={date:f.date,period,kind:f.kind,facts:f,text:r.text,html:r.html,textZh:rz.text,htmlZh:rz.html,zhChars:r.zhChars,generatedAt:f.generatedAt,source:'gas',version:DR.version,scen:RSCEN_.version,dataNote:'雲端桶 cloud buckets · WIP '+(f.wip&&f.wip.basis||'none'),doc:DR.docHtml(f,r.text)};
  if(opts.ai!==false&&claudeKey_()){ try{ const ai=dailyReportAi_(f,'daily:'+f.date,opts.lang||drTgLang_()); if(ai)rep.ai=ai; }catch(e){ rep.aiError=String(e&&e.message||e); } }
  dailyReportSave_(rep);
  if(opts.send)return dailyReportSend_(rep);
  return rep;
}
/* 群組／選單顯示的文字：一律情境版（舊報告沒有 facts.x 也能顯示，只是少了加班／現場回報那幾行） */
function drHtmlZh_(rep){ if(rep&&rep.facts){ try{ return rsHtml_(rep); }catch(e){ console.warn('scenario render failed: '+e); } } return rep.version===DR.version&&rep.htmlZh?rep.htmlZh:DR.render(rep.facts,{lang:'zh'}).html; }
function dailyReportSend_(rep,chatId,lang){
  lang=lang||drTgLang_(); let html='',scen=null;
  try{ const r=rsRender_(rep); html=r.html; scen=r.scen.slice(0,5).map(function(z){return z.id}); }catch(e){ console.warn('scenario render failed, fallback: '+e); html=drText_(rep,lang).html; }
  const to=chatId||CFG.CHAT_ID;
  const res=tgSendHtml_(to, html, drKeyboard_(rep.kind||'day'));
  rep.sentAt=new Date().toISOString(); rep.sentAi=false; rep.sentScen=scen; rep.sentLang=lang; rep.sentMessageId=res&&res.result&&res.result.message_id||null;
  if(String(rsProps_().getProperty('RS_CHART')||'1')!=='0'){ try{ const pr=rsSendChart_(to,rep.facts); rep.sentChart=!!(pr&&pr.ok); if(pr&&!pr.ok)rep.chartError=String(pr.description||''); }catch(e){ rep.sentChart=false; rep.chartError=String(e&&e.message||e); } }
  dailyReportSave_(rep); return rep;
}
/* 圖：三組堆疊長條各放一種顏色（綠＝達標、黃＝偏低、紅＝要處理、藍＝一般），一根柱子只會有一種顏色 */
function rsChartBlob_(f){
  const c=RSCEN_.chart(f); if(!c||!c.values||!c.values.length)return null;
  const dt=Charts.newDataTable().addColumn(Charts.ColumnType.STRING,'').addColumn(Charts.ColumnType.NUMBER,'OK').addColumn(Charts.ColumnType.NUMBER,'Low').addColumn(Charts.ColumnType.NUMBER,'Act').addColumn(Charts.ColumnType.NUMBER,'Plan');
  c.labels.forEach(function(l,i){ const t=c.tones[i], v=Number(c.values[i])||0; dt.addRow([String(l), t==='G'?v:0, t==='A'?v:0, t==='R'?v:0, (t!=='G'&&t!=='A'&&t!=='R')?v:0]); });
  const chart=Charts.newColumnChart().setDataTable(dt.build()).setStacked().setColors(['#2E9E5B','#E6A700','#D64545','#3B82C4']).setTitle(c.title).setDimensions(900,480).setLegendPosition(Charts.Position.NONE).setOption('chartArea',{left:70,top:60,width:'88%',height:'70%'}).setOption('titleTextStyle',{fontSize:20,bold:true}).setOption('hAxis',{textStyle:{fontSize:16}}).setOption('vAxis',{textStyle:{fontSize:14},minValue:0}).setOption('bar',{groupWidth:'70%'}).build();
  return chart.getAs('image/png').setName('vrt_report_'+String(f.date||'')+'.png');
}
function rsSendChart_(chatId,f){
  const blob=rsChartBlob_(f); if(!blob)return null;
  const res=UrlFetchApp.fetch(TG()+'/sendPhoto',{method:'post',muteHttpExceptions:true,payload:{chat_id:String(chatId),photo:blob,disable_notification:'true'}});
  let body={}; try{ body=JSON.parse(res.getContentText()||'{}'); }catch(_){ } return body;
}
/* 檢查用（不發訊息）：最新一份日報／效率週報／排單週報的情境版文字、情境代號、行數、圖檔大小 */
function checkScenarioReportV413(){
  const idx=dailyReportIndex_(); const pick=function(rx,not){ const x=idx.filter(function(e){return rx.test(e.date)&&!(not&&not.test(e.date))})[0]; return x?dailyReportLoad_(x.date):null; };
  const reps={day:pick(/^\d{4}-\d{2}-\d{2}$/),eff:pick(/-W\d{2}$/),plan:pick(/-W\d{2}-plan$/)}; const out={ok:true,version:'4.13-scenario',scen:RSCEN_.version,catalog:RSCEN_.CATALOG.length,chart:String(rsProps_().getProperty('RS_CHART')||'1')!=='0'};
  Object.keys(reps).forEach(function(k){ const rep=reps[k]; if(!rep||!rep.facts){ out[k]='(no report)'; return; } try{ const r=rsRender_(rep); let png=0; try{ const b=rsChartBlob_(rep.facts); png=b?b.getBytes().length:0; }catch(e){ png='ERR '+e; } out[k]={date:rep.date,lines:r.lines,scen:r.scen.map(function(z){return z.id}),hasX:!!rep.facts.x,chartBytes:png,text:r.text}; }catch(e){ out[k]='ERR '+e; out.ok=false; } });
  console.log(JSON.stringify(out,null,2)); return out;
}
/* 預覽（不存、不發）：用雲端最新資料重算一份，看情境和版面。previewScenarioReport('2026-11-10') / ('2026-11-03','week','eff') / ('2026-11-03','week','plan') */
function previewScenarioReport(dateOpt,period,kind){
  const today=todayYmd_(); period=period==='week'?'week':'day'; const data=dailyReportData_(dateOpt||'',today,period);
  const f=DR.compute(data,{date:data.date,today,period,kind:period==='week'?(kind==='plan'?'plan':'eff'):'day'}); f.x=RSCEN_.extras(data,f);
  const r=RSCEN_.render(f,{note:rsNote_(f.date)}); console.log(r.text); console.log('lines',r.lines,'scen',r.scen.map(function(z){return z.id+':'+z.w}).join(' ')); return {text:r.text,lines:r.lines,scen:r.scen.map(function(z){return z.id}),x:f.x};
}
/* 把圖存到雲端硬碟看一眼（不發訊息） */
function previewScenarioChart(dateOpt,period,kind){
  const today=todayYmd_(); period=period==='week'?'week':'day'; const data=dailyReportData_(dateOpt||'',today,period);
  const f=DR.compute(data,{date:data.date,today,period,kind:period==='week'?(kind==='plan'?'plan':'eff'):'day'}); const b=rsChartBlob_(f); if(!b)return '(no chart)';
  const file=getOrCreateFolder().createFile(b.setName('preview_'+b.getName())); return file.getUrl();
}
