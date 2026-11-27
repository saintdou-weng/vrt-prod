/* ═══ v4.48 GAS 檔 v412_compact_daily_report（2026-11-27 貼上）＝ vrt-daily-report-v1.js 2.1 ＋ vrt-report-scen-v1.js 1.2 ＋ scenario_report_block.gs
   日報模組新版放在這裡（主檔裡的舊版不動）：載入後用 Object.assign 把新函式蓋到主檔的 DR 上，所以主檔、Token、觸發器都不用改。 */
/* VRT PROD 生產日報／週報 Daily & weekly production report v1.3 (2026-10-27: Telegram 版改成人看得懂的寫法 — 一行一件事、先結論再數字、白話、「要處理」寫明誰做什麼、資料時間；數字不變；1.2 = 2026-10-17; 1.1 = 管理分析版式; 1.2 = 週報拆成 排單週報(kind plan, 無機修) 與 效率週報(kind eff, 含機修)、中文版 render(lang zh)、排單負荷／換款／空檔事實、敘述更貼近工廠既有報告)
   Pure logic — no DOM, no network, no Drive. Runs in the browser (production_v4.html 「📰 生產日報」), in Node (qa) and in the
   GAS bot (AppsScript/build_gas.py splices this file into the .gs next to vrt-tg-summary-v1.js).
   RULE (修改指令 共同原則 4): every number is computed HERE by code. The optional AI step (Claude API, GAS side) only rewrites the
   wording and is checked afterwards with checkAiText(): any number in the AI text that is not one of the computed facts is rejected.
   Layout follows the factory's management reports (VRT Weekly Production Capacity / Oct Production Update): KPI tiles with RAG
   status → 管理結論 (中文 + English) → numbered sections with tables and a 判讀 column → action table with owners → 資料口徑與限制.
   compute(data, opts)  → facts   data = {sewing[], cutting[], qc:{records[],kpi[]}, spareparts:{needle[],part[]}, shipping[], prodplan[],
                                  custstats:{overall,customers[],details[],snapshotDate}, styles[] (production_v4 STYLES) | wipFallback}
                                  opts = {date (anchor), today, period:'day'|'week', kind:'eff'|'plan' (week only; plan = 排單週報 without maintenance)}
   render(facts, {lang:'zh'|'both'}) → {text, html, zhChars}   Telegram version (compact, 中文一行＋English 一行; lang 'zh' = 只有中文)
   docHtml(facts, text) → full management report (Word-compatible HTML, .doc)   aiPrompt / checkAiText / checkNumbersAgainstText */
(function(g){'use strict';
  if(g.VRTDailyReport&&String(g.VRTDailyReport.version||'')>='2.1.0')return;   /* GAS：主檔先載入舊版 1.x，這裡要蓋過去 */
  const VERSION='2.1.0';
  /* ── small helpers (standalone so the file does not depend on vrt-tg-summary-v1.js) ── */
  const num=v=>{const n=Number(v);return isFinite(n)?n:0};
  const N=n=>{const v=Number(n||0);return (Number.isInteger(v)?v:Math.round(v*10)/10).toLocaleString('en-US')};
  const pct=(v,dp)=>v==null||!isFinite(v)?'—':Number(v).toFixed(dp==null?1:dp)+'%';
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const ymdParts=ymd=>{const m=String(ymd||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);return m?[+m[1],+m[2],+m[3]]:null};
  const ymdUtc=(y,m,d)=>new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10);
  const addDays=(ymd,n)=>{const p=ymdParts(ymd);return p?ymdUtc(p[0],p[1],p[2]+n):''};
  const dayKey=v=>{const p=ymdParts(v);return p?ymdUtc(p[0],p[1],p[2]):''};
  const localToday=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const dowMon0=ymd=>{const p=ymdParts(ymd);return p?(new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay()+6)%7:0};
  const isoWeekKey=ymd=>{const p=ymdParts(ymd);if(!p)return '';const x=new Date(Date.UTC(p[0],p[1]-1,p[2]));x.setUTCDate(x.getUTCDate()+3-((x.getUTCDay()+6)%7));const y=x.getUTCFullYear();const ft=new Date(Date.UTC(y,0,4));ft.setUTCDate(ft.getUTCDate()+3-((ft.getUTCDay()+6)%7));return y+'-W'+String(1+Math.round((x-ft)/604800000)).padStart(2,'0')};
  const mmdd=ymd=>String(ymd||'').slice(5,7)+'/'+String(ymd||'').slice(8,10);
  const DOW_ZH=['一','二','三','四','五','六','日'],DOW_EN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const MON={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
  function anyDate(s){s=String(s||'').trim();if(!s)return '';let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];m=s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);if(m){const y=m[3].length===2?2000+Number(m[3]):Number(m[3]),mo=MON[m[2].toUpperCase()];if(mo)return ymdUtc(y,mo,Number(m[1]))}m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)return ymdUtc(Number(m[3]),Number(m[1]),Number(m[2]));return ''}
  const delta=(cur,prev)=>prev==null||!isFinite(prev)||prev===0||cur==null?null:(cur-prev)/prev*100;
  const fmtDelta=d=>d==null?'—':(d>=0?'+':'−')+Math.abs(d).toFixed(1)+'%';
  const fmtPt=(cur,prev)=>cur==null||prev==null?'—':((cur-prev)>=0?'+':'−')+Math.abs(cur-prev).toFixed(1)+' pt';
  const top=(obj,n)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n);
  const lineName=l=>/^(line|l\d)/i.test(String(l||''))?String(l):'Line '+l;
  const WHO={sew:{zh:'車縫主管',en:'Sewing supervisor'},qc:{zh:'QC 主管',en:'QC supervisor'},plan:{zh:'生管／PMC',en:'Production planning / PMC'},ship:{zh:'出貨／船務',en:'Shipping'},wh:{zh:'倉庫／採購',en:'Warehouse / Purchasing'},mech:{zh:'機修',en:'Mechanic'},cut:{zh:'裁剪主管',en:'Cutting supervisor'},ie:{zh:'生產＋IE＋QC',en:'Production + IE + QC'}};
  /* thresholds used for every 判讀 / RAG (stated in the report's 資料口徑 section) */
  const TH={effG:35,effA:25,lineOk:30,lineLow:25,rejG:5,rejA:10,lineRejHigh:10,lineRejMid:8,wipA:5,wipR:10,planA:-5,planR:-15,shipA:20,loadG:85,loadA:60,fabG:30,fabA:50,chgHigh:3};
  const RAG_ZH={G:'GREEN',A:'AMBER',R:'RED'};const RAG_ICON={G:'🟢',A:'🟡',R:'🔴'};
  const rag=(v,g,a,higherIsBetter)=>v==null||!isFinite(v)?null:higherIsBetter?(v>=g?'G':v>=a?'A':'R'):(v<=g?'G':v<=a?'A':'R');

  /* ── sewing: same de-dup rule as sewing_v5 / production_v4 (one source per day: norm > target > dpo) ── */
  function sewPick(rows){const byDay={},zero={};(rows||[]).forEach(r=>{if(!r)return;const d=dayKey(r.date);if(!d)return;const src=r.tSrc==='target'?'target':r.tSrc==='dpo'?'dpo':'norm';
      /* v2.1（11/24 照 Paul 週報口徑）：有人上班但 0 產出的組（缺料、補標、換款）也要進分母；只收有人數／出勤分鐘的 0 件列 */
      if(num(r.pieces)<=0){if(num(r.workers)>0||num(r.attendedMinutes)>0){const z=zero[d]=zero[d]||{norm:[],target:[],dpo:[]};z[src].push(r)}return}
      const x=byDay[d]=byDay[d]||{norm:[],target:[],dpo:[]};x[src].push(r)});const out={};Object.keys(byDay).forEach(d=>{const x=byDay[d];const src=x.norm.length?'norm':x.target.length?'target':'dpo';const pick=x[src].slice();
      const z=zero[d]&&zero[d][src];if(z&&z.length){const has={};pick.forEach(r=>{has[String(r.lineNo||'').replace(/\D/g,'')]=1});const add={};z.forEach(r=>{const k=String(r.lineNo||'').replace(/\D/g,'');if(k&&!has[k]&&!add[k]){add[k]=1;pick.push(r)}})}out[d]=pick});return out}
  function famOf(r){const t=String(r.productType||r.product||r.typeOfProduct||'').toUpperCase();if(/NAPKIN|餐巾/.test(t))return 'NAPKIN';if(/TOP|TABLE|桌布|台布/.test(t))return 'TOP';if(/APRON|圍裙/.test(t))return 'APRON';if(/GARMENT|COVERALL|成衣|SHIRT|PANT/.test(t))return 'GARMENT';return r.section==='Garment'?'GARMENT':r.section==='Apron'?'APRON':'OTHER'}
  const isGRS=st=>/-RC\b|RC$|-RC-/i.test(String(st||''));
  function sewAgg(rows){const o={pieces:0,garment:0,apron:0,other:0,rows:0,prodMin:0,attMin:0,w:0,effW:0,cartons:0,lines:{},styles:{},days:{},fam:{},grs:{pieces:0,prodMin:0}};
    /* 同一款被日報分錯類（例：11/12 P050 餐巾寫成 TOP）→ 用這一款在期間內件數最多的類別 */
    const sf={};(rows||[]).forEach(r=>{const p=num(r.pieces);if(p<=0)return;const k=String(r.styleNo||r.style||'').toUpperCase();if(!k)return;const fk=famOf(r);const m=sf[k]=sf[k]||{};m[fk]=(m[fk]||0)+p});const famFix=r=>{const k=String(r.styleNo||r.style||'').toUpperCase();const m=sf[k];if(!m)return famOf(r);return Object.keys(m).sort((x,y)=>m[y]-m[x])[0]};
    (rows||[]).forEach(r=>{const p=num(r.pieces),ln=String(r.lineNo||'—').trim()||'—',w=num(r.workers),e=num(r.efficiency),d=dayKey(r.date);o.rows++;o.pieces+=p;o.cartons+=num(r.cartons);if(r.section==='Garment')o.garment+=p;else if(r.section==='Apron')o.apron+=p;else o.other+=p;
      if(p>0){const fk=famFix(r),F=o.fam[fk]=o.fam[fk]||{pieces:0,prodMin:0};const fm=num(r.producedMinutes)||num(r.smv)*p;F.pieces+=p;F.prodMin+=fm;o.famMin=(o.famMin||0)+fm;if(isGRS(r.styleNo||r.style)){o.grs.pieces+=p;o.grs.prodMin+=fm}}
      const L=o.lines[ln]=o.lines[ln]||{line:ln,pieces:0,prodMin:0,attMin:0,effW:0,_wsum:0,styles:{},dayW:{}};L.pieces+=p;const pm=num(r.producedMinutes),am=num(r.attendedMinutes);o.prodMin+=pm;o.attMin+=am;L.prodMin+=pm;L.attMin+=am;if(w>0&&e>0){o.w+=w;o.effW+=w*e;L.effW+=w*e;L._wsum+=w}if(w>0)L.dayW[d]=Math.max(L.dayW[d]||0,w);if(r.styleNo){o.styles[r.styleNo]=(o.styles[r.styleNo]||0)+p;L.styles[r.styleNo]=1}
      const D=o.days[d]=o.days[d]||{date:d,pieces:0,cartons:0,prodMin:0,attMin:0,w:0,effW:0,lineW:{}};D.pieces+=p;D.cartons+=num(r.cartons);D.prodMin+=pm;D.attMin+=am;if(w>0&&e>0){D.w+=w;D.effW+=w*e}if(w>0)D.lineW[ln]=Math.max(D.lineW[ln]||0,w)});
    o.eff=o.attMin>0?o.prodMin/o.attMin*100:o.w>0?o.effW/o.w:null;o.effBasis=o.attMin>0?'minutes':o.w>0?'workers':'';
    o.byDay=Object.values(o.days).sort((a,b)=>a.date<b.date?-1:1).map(D=>({date:D.date,dow:DOW_ZH[dowMon0(D.date)],dowEn:DOW_EN[dowMon0(D.date)],pieces:D.pieces,cartons:Math.round(D.cartons*10)/10,manpower:Object.values(D.lineW).reduce((s,v)=>s+v,0),eff:D.attMin>0?D.prodMin/D.attMin*100:D.w>0?D.effW/D.w:null}));
    o.dayCount=o.byDay.length;o.manpower=o.dayCount?o.byDay.reduce((s,d)=>s+d.manpower,0)/o.dayCount:0;
    o.byLine=Object.values(o.lines).map(L=>{const dws=Object.values(L.dayW);return {line:L.line,pieces:L.pieces,workers:dws.length?Math.round(dws.reduce((s,v)=>s+v,0)/dws.length*10)/10:0,eff:L.attMin>0?L.prodMin/L.attMin*100:L._wsum>0?L.effW/L._wsum:null,styles:Object.keys(L.styles).join(',')}}).sort((a,b)=>b.pieces-a.pieces);
    o.lineCount=o.byLine.length;delete o.lines;delete o.days;return o}
  const cutDaily=r=>r&&r.src!=='ref'&&r.src!=='summary'&&r.lineNo!=='Weekly Report'&&r.lineNo!=='Monthly Summary'&&r.lineNo!=='Summary'&&num(r.pieces)>0;
  function cutAgg(rows){const o={pieces:0,rows:0,tables:{},styles:{},yds:0,days:{}};(rows||[]).forEach(r=>{if(!cutDaily(r))return;const p=num(r.pieces);o.rows++;o.pieces+=p;o.tables[String(r.lineNo||'—')]=1;o.days[dayKey(r.date)]=1;if(r.styleNo)o.styles[r.styleNo]=(o.styles[r.styleNo]||0)+p;o.yds+=num(r.totalYds)});o.tableCount=Object.keys(o.tables).length;o.dayCount=Object.keys(o.days).length;delete o.tables;delete o.days;o.topStyles=top(o.styles,3).map(([k,v])=>({style:k,pieces:v}));delete o.styles;return o}
  function qcPick(rows){const m={};(rows||[]).forEach(r=>{if(!r||r.deleted)return;const k=dayKey(r.date)+'|'+r.line,rank=r.reportKind==='manual'?3:r.reportKind==='weekly'?1:2;if(!m[k]||rank>m[k].rank)m[k]={r,rank}});return Object.values(m).map(x=>x.r)}
  function qcAgg(rows){const o={reports:rows.length,inspected:0,rejected:0,output:0,lines:{},defects:{},days:{}};rows.forEach(r=>{const i=num(r.inspected),j=num(r.rejected);o.inspected+=i;o.rejected+=j;o.output+=num(r.output);o.days[dayKey(r.date)]=1;const ln=String(r.line||'—');const L=o.lines[ln]=o.lines[ln]||{inspected:0,rejected:0};L.inspected+=i;L.rejected+=j;(r.defects||[]).forEach(d=>{const q=num(d.qty);if(q>0){const nm=String(d.name||d.code||'?');o.defects[nm]=(o.defects[nm]||0)+q}})});
    o.rate=o.inspected?o.rejected/o.inspected*100:null;o.top=top(o.defects,6).map(([k,v])=>({name:k,qty:v}));o.defectTotal=Object.values(o.defects).reduce((s,v)=>s+v,0);o.dayCount=Object.keys(o.days).length;
    o.byLine=Object.entries(o.lines).filter(([a,v])=>v.inspected>0).map(([a,v])=>({line:a,rate:v.rejected/v.inspected*100,inspected:v.inspected,rejected:v.rejected})).sort((a,b)=>b.rate-a.rate);o.worstLines=o.byLine.slice(0,3);delete o.lines;delete o.defects;delete o.days;return o}
  function chgAgg(rows){const o={qty:0,rows:0,planned:0,unplanned:0,lines:{},items:{},reasons:{}};(rows||[]).forEach(v=>{if(!v||v.deleted)return;const q=num(v.qty);o.rows++;o.qty+=q;const rc=v.reasonClass||'unknown';o.reasons[rc]=(o.reasons[rc]||0)+q;if(rc==='changeover')o.planned+=q;else if(rc==='damage'||rc==='broken'||rc==='lost')o.unplanned+=q;const ln=String(v.line||'—');const L=o.lines[ln]=o.lines[ln]||{line:ln,qty:0,unplanned:0};L.qty+=q;if(rc==='damage'||rc==='broken'||rc==='lost')L.unplanned+=q;const it=String((v.needleType||v.partType||'?')+(v.size?' '+v.size:'')).replace(/\s+/g,' ').trim();o.items[it]=(o.items[it]||0)+q});
    o.byLine=Object.values(o.lines).sort((a,b)=>b.unplanned-a.unplanned||b.qty-a.qty);o.topItems=top(o.items,3).map(([k,v])=>({item:k,qty:v}));o.byReason=top(o.reasons,6).map(([k,v])=>({reason:k,qty:v}));delete o.lines;delete o.items;delete o.reasons;return o}
  const inRange=(d,a,b)=>d&&d>=a&&d<=b;
  const workdaysBetween=(a,b)=>{let n=0;for(let d=a;d&&d<=b;d=addDays(d,1))if(isWorkday(d))n++;return n};   // v2.0: Mon–Sat minus Cambodian public holidays (HOLIDAYS_KH / data.calendar)
  const monthEnd=ym=>{const p=ymdParts(ym+'-01');return ymdUtc(p[0],p[1]+1,0)};

  /* ── compute: every number of the report ── */
  function compute(data,opts){
    data=data||{};opts=opts||{};setCalendar(data.calendar||opts.calendar);const today=dayKey(opts.today)||localToday();const period=opts.period==='week'?'week':'day';const kind=period==='week'?(opts.kind==='plan'?'plan':'eff'):'day';
    const sewDays=sewPick(data.sewing);const sewDates=Object.keys(sewDays).filter(d=>d<=today).sort();
    let A=dayKey(opts.date)||'';if(!A){A=sewDates.length?sewDates[sewDates.length-1]:(opts.today?today:addDays(today,-1))}
    const P=period==='week'?{start:addDays(A,-dowMon0(A)),end:addDays(A,6-dowMon0(A))}:{start:A,end:A};
    P.key=period==='week'?isoWeekKey(A)+(kind==='plan'?'-plan':''):A;P.label=period==='week'?isoWeekKey(A)+'（'+mmdd(P.start)+'–'+mmdd(P.end)+'）':A+'（'+DOW_ZH[dowMon0(A)]+' '+DOW_EN[dowMon0(A)]+'）';P.labelEn=period==='week'?'week '+isoWeekKey(A)+' ('+mmdd(P.start)+'–'+mmdd(P.end)+')':A+' ('+DOW_EN[dowMon0(A)]+')';
    const prev=period==='week'?{start:addDays(P.start,-7),end:addDays(P.start,-1),label:'前週 prev week '+isoWeekKey(addDays(P.start,-7)),labelEn:'previous week'}:(()=>{const pd=sewDates.filter(d=>d<A).pop()||'';return {start:pd,end:pd,label:pd?'前日 prev '+mmdd(pd):'前日 prev —',labelEn:'previous day'}})();
    const lw=period==='day'?{start:addDays(A,-7),end:addDays(A,-7)}:null;
    const inP=d=>inRange(d,P.start,P.end),inPrev=d=>prev.start&&inRange(d,prev.start,prev.end),inLw=d=>lw&&inRange(d,lw.start,lw.end);
    const rowsIn=fn=>Object.keys(sewDays).filter(fn).sort().reduce((a,d)=>a.concat(sewDays[d]),[]);
    const f={version:VERSION,period,kind,week:period==='week'?isoWeekKey(A):'',date:P.key,anchor:A,start:P.start,end:P.end,label:P.label,labelEn:P.labelEn,dow:period==='day'?DOW_ZH[dowMon0(A)]:'',dowEn:period==='day'?DOW_EN[dowMon0(A)]:'',today,generatedAt:new Date().toISOString(),source:{},prevLabel:prev.label,prevLabelEn:prev.labelEn};
    /* sewing */
    const sc=sewAgg(rowsIn(inP)),sp=sewAgg(rowsIn(inPrev)),sw=sewAgg(rowsIn(inLw));
    f.sewing={pieces:sc.pieces,garment:sc.garment,apron:sc.apron,other:sc.other,lines:sc.lineCount,eff:sc.eff,effBasis:sc.effBasis,prodMin:sc.prodMin,attMin:sc.attMin,rows:sc.rows,cartons:Math.round(sc.cartons*10)/10,manpower:Math.round(sc.manpower*10)/10,dayCount:sc.dayCount,perDay:sc.dayCount?Math.round(sc.pieces/sc.dayCount):0,byLine:sc.byLine.slice(0,20),topStyles:top(sc.styles,5).map(([k,v])=>({style:k,pieces:v})),avgSmv:sc.pieces>0&&sc.prodMin>0?Math.round(sc.prodMin/sc.pieces*100)/100:null,stdHours:Math.round(sc.prodMin/60*10)/10,stdHoursPerDay:sc.dayCount?Math.round(sc.prodMin/60/sc.dayCount*10)/10:null,labourHours:Math.round(sc.attMin/60*10)/10,
      fam:Object.keys(sc.fam).map(k=>({fam:k,pieces:sc.fam[k].pieces,share:sc.pieces?Math.round(sc.fam[k].pieces/sc.pieces*1000)/10:0,stdHours:Math.round(sc.fam[k].prodMin/60*10)/10,hourShare:sc.famMin?Math.round(sc.fam[k].prodMin/sc.famMin*1000)/10:0})).sort((a,b)=>b.pieces-a.pieces),grs:sc.grs.pieces?{pieces:sc.grs.pieces,stdHours:Math.round(sc.grs.prodMin/60*10)/10}:null};
    f.days=sc.byDay;f.mix=[['Garment',sc.garment],['Apron',sc.apron],['Other',sc.other]].filter(x=>x[1]>0).map(([k,v])=>({product:k,pieces:v,share:sc.pieces?v/sc.pieces*100:0}));
    f.prevDay={date:prev.start,label:prev.label,pieces:sp.rows?sp.pieces:null,eff:sp.rows?sp.eff:null,lines:sp.rows?sp.lineCount:null,manpower:sp.rows?Math.round(sp.manpower*10)/10:null,dayCount:sp.dayCount,perDay:sp.dayCount?Math.round(sp.pieces/sp.dayCount):null,cartons:sp.rows?Math.round(sp.cartons*10)/10:null,stdHoursPerDay:sp.dayCount&&sp.prodMin?Math.round(sp.prodMin/60/sp.dayCount*10)/10:null};
    f.lastWeek={date:lw?lw.start:'',pieces:sw.rows?sw.pieces:null,eff:sw.rows?sw.eff:null,lines:sw.rows?sw.lineCount:null};
    f.source.sewing=(data.sewing||[]).length;f.source.sewingDates=sewDates.length;
    /* cutting */
    const cutAll=(data.cutting||[]).filter(r=>r);const cc=cutAgg(cutAll.filter(r=>inP(dayKey(r.date)))),cp=cutAgg(cutAll.filter(r=>inPrev(dayKey(r.date)))),cw=cutAgg(cutAll.filter(r=>inLw(dayKey(r.date))));
    f.cutting={pieces:cc.pieces,tables:cc.tableCount,rows:cc.rows,dayCount:cc.dayCount,yds:Math.round(cc.yds),topStyles:cc.topStyles,prevPieces:cp.rows?cp.pieces:null,lastWeekPieces:cw.rows?cw.pieces:null};f.source.cutting=cutAll.length;
    /* WIP 已裁未縫 */
    if(Array.isArray(data.styles)&&data.styles.length){const act=data.styles.filter(s=>s&&(s.status==='cut'||s.status==='sew'));let wip=0;const rows=[];act.forEach(s=>{const w=Math.max(0,num(s.cutPcs)-num(s.sewPcs));wip+=w;if(w>0)rows.push({style:s.sk,customer:s.customer||'',wip:w})});rows.sort((a,b)=>b.wip-a.wip);f.wip={cutNotSewn:wip,styles:rows.length,top:rows.slice(0,5),basis:'styles'}}
    else if(data.wipFallback&&data.wipFallback.cutNotSewn!=null)f.wip={cutNotSewn:num(data.wipFallback.cutNotSewn),styles:null,top:[],basis:data.wipFallback.basis||'custstats'};
    else f.wip={cutNotSewn:null,styles:null,top:[],basis:'none'};
    f.wip.daysOfOutput=f.wip.cutNotSewn!=null&&f.sewing.perDay>0?Math.round(f.wip.cutNotSewn/f.sewing.perDay*10)/10:null;
    /* Final QC: records in the period; for a day without a report use the latest ≤ 7 days (flagged asOf) */
    const qcAll=qcPick((data.qc&&data.qc.records)||[]);const qcDates=[...new Set(qcAll.map(r=>dayKey(r.date)).filter(d=>d&&d<=P.end))].sort();
    let qcStart=P.start,qcEnd=P.end,asOf=false;if(period==='day'&&!qcDates.includes(A)){const d=qcDates.filter(x=>x>=addDays(A,-7)).pop()||'';qcStart=qcEnd=d;asOf=!!d}
    const qcCur=qcAgg(qcAll.filter(r=>qcStart&&inRange(dayKey(r.date),qcStart,qcEnd)));const qcPrevD=period==='day'?(qcDates.filter(d=>d<qcStart).pop()||''):'';const qcP=qcAgg(period==='week'?qcAll.filter(r=>inPrev(dayKey(r.date))):qcAll.filter(r=>qcPrevD&&dayKey(r.date)===qcPrevD));const qcW=qcAgg(lw?qcAll.filter(r=>dayKey(r.date)===addDays(qcStart,-7)):[]);
    f.qc={date:qcStart,asOf,reports:qcCur.reports,dayCount:qcCur.dayCount,inspected:qcCur.inspected,rejected:qcCur.rejected,output:qcCur.output,rate:qcStart?qcCur.rate:null,top:qcCur.top,defectTotal:qcCur.defectTotal,byLine:qcCur.byLine,worstLines:qcCur.worstLines,prevDate:period==='week'?prev.start:qcPrevD,prevRate:qcP.reports?qcP.rate:null,prevRejected:qcP.reports?qcP.rejected:null,lastWeekRate:qcW.reports?qcW.rate:null};f.source.qc=qcAll.length;
    // reconciliation QC actual output vs sewing output on the QC dates
    {const qd=new Set(qcAll.filter(r=>qcStart&&inRange(dayKey(r.date),qcStart,qcEnd)).map(r=>dayKey(r.date)));let sewOnQcDays=0;qd.forEach(d=>{(sewDays[d]||[]).forEach(r=>{sewOnQcDays+=num(r.pieces)})});f.qcReconcile=qcCur.output>0&&sewOnQcDays>0?{qcOutput:qcCur.output,sewing:sewOnQcDays,diff:qcCur.output-sewOnQcDays,diffPct:Math.round((qcCur.output-sewOnQcDays)/sewOnQcDays*1000)/10,ok:Math.abs(qcCur.output-sewOnQcDays)<=Math.max(10,sewOnQcDays*0.02)}:null}
    /* shipping schedule: ISO week (Mon–Sun) containing the anchor */
    const ws=addDays(A,-dowMon0(A)),we=addDays(ws,6);const ship=(data.shipping||[]).filter(r=>r&&!r._demo);const inWeek=ship.filter(r=>{const d=anyDate(r.etd);return d&&d>=ws&&d<=we});
    const sh={orig:0,shipped:0,open:0,rows:inWeek.length,cust:{},overdueRows:0,overdueOpen:0,overdue:[]};inWeek.forEach(r=>{const o=num(r.orig),s=num(r.shipped),op=num(r.open);sh.orig+=o;sh.shipped+=s;sh.open+=op;const c=String(r.cust||r.customer||'—');sh.cust[c]=(sh.cust[c]||0)+op;const d=anyDate(r.etd);if(op>0&&d<P.end&&String(r.status||'')!=='shipped'&&String(r.status||'')!=='abnormal'){sh.overdueRows++;sh.overdueOpen+=op;sh.overdue.push({po:String(r.po||''),cust:c,style:String(r.style||''),open:op,etd:d})}});
    sh.overdue.sort((a,b)=>b.open-a.open);f.shipping={weekStart:ws,weekEnd:we,rows:sh.rows,orig:sh.orig,shipped:sh.shipped,open:sh.open,pct:sh.orig>0?Math.min(100,sh.shipped/sh.orig*100):null,byCust:top(sh.cust,3).map(([k,v])=>({cust:k,open:v})),overdueRows:sh.overdueRows,overdueOpen:sh.overdueOpen,overdue:sh.overdue.slice(0,5),allRows:ship.length};f.source.shipping=ship.length;
    /* fabric shortage risk: customer statistics snapshot (No Fabric Available) */
    const cs=data.custstats||{},det=(cs.details||[]).filter(r=>r&&num(r.noFabric)>0).map(r=>({customer:String(r.customer||''),po:String(r.po||''),style:String(r.style||''),noFabric:num(r.noFabric),etd:r.etd||''})).sort((a,b)=>b.noFabric-a.noFabric);
    const byCust={};det.forEach(r=>{byCust[r.customer]=(byCust[r.customer]||0)+r.noFabric});const ov=cs.overall||{};
    f.fabric={snapshotDate:dayKey(cs.snapshotDate)||String(cs.snapshotDate||''),noFabricPcs:ov.noFabric!=null?num(ov.noFabric):det.reduce((s,r)=>s+r.noFabric,0),notSewn:ov.actualNotSewn!=null?num(ov.actualNotSewn):null,cuttingWip:ov.cuttingWip!=null?num(ov.cuttingWip):null,balance:ov.balanceQty!=null?num(ov.balanceQty):null,fg:ov.fgPcs!=null?num(ov.fgPcs):null,pos:det.length,byCust:top(byCust,3).map(([k,v])=>({customer:k,noFabric:v})),top:det.slice(0,5),hasData:!!(cs.details&&cs.details.length)||ov.noFabric!=null};
    f.fabric.noFabricShare=f.fabric.notSewn>0&&f.fabric.noFabricPcs!=null?Math.round(f.fabric.noFabricPcs/f.fabric.notSewn*1000)/10:null;f.source.custstats=(cs.details||[]).length;
    /* needles & spare parts: period vs trailing 28-day per-line baseline */
    const spd=data.spareparts||{};const nd=(spd.needle||[]).filter(r=>r&&!r.deleted),pt=(spd.part||[]).filter(r=>r&&!r.deleted);
    const ndD=chgAgg(nd.filter(r=>inP(dayKey(r.date)))),ptD=chgAgg(pt.filter(r=>inP(dayKey(r.date))));const pDays=period==='week'?Math.max(1,new Set(nd.filter(r=>inP(dayKey(r.date))).map(r=>dayKey(r.date))).size):1;
    const base=nd.filter(r=>{const d=dayKey(r.date);return d&&d<P.start&&d>=addDays(P.start,-28)});const bAgg=chgAgg(base),bDays=new Set(base.map(r=>dayKey(r.date))).size||1;const bLine={};bAgg.byLine.forEach(L=>{bLine[L.line]=L.unplanned/bDays});
    const flag=ndD.byLine.filter(L=>L.unplanned/pDays>=3&&L.unplanned/pDays>=2*(bLine[L.line]||0)).map(L=>({line:L.line,unplanned:L.unplanned,perDay:Math.round(L.unplanned/pDays*10)/10,qty:L.qty,baseline:Math.round((bLine[L.line]||0)*10)/10}));
    const latestNd=[...new Set(nd.map(r=>dayKey(r.date)).filter(d=>d&&d<=P.end))].sort().pop()||'';
    f.maint={needle:{date:ndD.rows?P.key:latestNd,asOf:!ndD.rows&&!!latestNd,qty:ndD.qty,planned:ndD.planned,unplanned:ndD.unplanned,unplannedShare:ndD.qty?Math.round(ndD.unplanned/ndD.qty*1000)/10:null,lines:ndD.byLine.length,topLines:ndD.byLine.slice(0,3),topItems:ndD.topItems,byReason:ndD.byReason,flag,baselineDays:bDays,baselineUnplannedPerDay:Math.round(bAgg.unplanned/bDays*10)/10},part:{qty:ptD.qty,rows:ptD.rows,topLines:ptD.byLine.slice(0,3),topItems:ptD.topItems}};f.source.needle=nd.length;f.source.part=pt.length;
    /* month plan position (Production Plan month qty vs sewing month-to-date) */
    {const ym=P.end.slice(0,7);const plan=(data.prodplan||[]).filter(r=>r&&String(r.month||'').slice(0,7)===ym);const planQty=plan.reduce((s,r)=>s+(num(r.sewingQty)||num(r.orderQty)),0);
      if(planQty>0){let mtd=0;const mStart=ym+'-01';Object.keys(sewDays).forEach(d=>{if(d>=mStart&&d<=P.end)sewDays[d].forEach(r=>{mtd+=num(r.pieces)})});const mEnd=monthEnd(ym),elapsed=workdaysBetween(mStart,P.end),total=workdaysBetween(mStart,mEnd),left=Math.max(0,total-elapsed);const dataDays=Object.keys(sewDays).filter(d=>d>=mStart&&d<=P.end).length;
        f.plan={month:ym,planQty,mtd,remaining:Math.max(0,planQty-mtd),completion:Math.round(mtd/planQty*1000)/10,elapsedWorkdays:elapsed,totalWorkdays:total,workdaysLeft:left,elapsedShare:total?Math.round(elapsed/total*1000)/10:null,dataDays,mtdPerDay:dataDays?Math.round(mtd/dataDays):null,requiredPerDay:left?Math.round(Math.max(0,planQty-mtd)/left):null,styles:plan.length}}
      else f.plan=null}
    /* v1.2 排單負荷 (week): line-days, gaps, changeovers, next week, concentration — from the Production Plan rows */
    f.loading=period==='week'?loadingFacts(data,P,sewDays,prev,today):null;
    /* comparisons */
    f.compare={stdPerDayVsPrev:delta(f.sewing.stdHoursPerDay,f.prevDay.stdHoursPerDay),piecesVsPrev:delta(f.sewing.pieces,f.prevDay.pieces),piecesVsLastWeek:delta(f.sewing.pieces,f.lastWeek.pieces),perDayVsPrev:delta(f.sewing.perDay,f.prevDay.perDay),effVsPrevPt:f.sewing.eff!=null&&f.prevDay.eff!=null?f.sewing.eff-f.prevDay.eff:null,effVsLastWeekPt:f.sewing.eff!=null&&f.lastWeek.eff!=null?f.sewing.eff-f.lastWeek.eff:null,manpowerVsPrev:f.prevDay.manpower!=null?Math.round((f.sewing.manpower-f.prevDay.manpower)*10)/10:null,cutVsPrev:delta(f.cutting.pieces,f.cutting.prevPieces),cutVsLastWeek:delta(f.cutting.pieces,f.cutting.lastWeekPieces),qcVsPrevPt:f.qc.rate!=null&&f.qc.prevRate!=null?f.qc.rate-f.qc.prevRate:null,qcVsLastWeekPt:f.qc.rate!=null&&f.qc.lastWeekRate!=null?f.qc.rate-f.qc.lastWeekRate:null};
    /* line table with 判讀 (thresholds TH) and quality × capacity risk class */
    {const qcL={};f.qc.byLine.forEach(q=>{qcL[q.line]=q});f.lines=f.sewing.byLine.map(L=>{const q=qcL[L.line]||qcL[String(L.line).replace(/^Line\s*/i,'')]||qcL['Line '+L.line]||null;const rej=q?q.rate:null;
      const v=L.eff==null?null:L.eff>=TH.lineOk?'ok':L.eff>=TH.lineLow?'low':'weak';const r=rej==null?null:rej>=TH.lineRejHigh?'high':rej>=TH.lineRejMid?'mid':'normal';
      const risk=v==='weak'&&r==='high'?'dual':v!=='weak'&&v!=null&&r==='high'?'quality':v==='weak'&&r&&r!=='high'?'capacity':v==null&&r==='high'?'quality':'normal';
      return {line:L.line,pieces:L.pieces,workers:L.workers,eff:L.eff,styles:L.styles,rejectRate:rej,rejected:q?q.rejected:null,inspected:q?q.inspected:null,verdict:v,rejVerdict:r,risk}});
      f.riskLines={dual:f.lines.filter(x=>x.risk==='dual').map(x=>x.line),quality:f.lines.filter(x=>x.risk==='quality').map(x=>x.line),capacity:f.lines.filter(x=>x.risk==='capacity').map(x=>x.line),weak:f.lines.filter(x=>x.verdict==='weak').map(x=>x.line)}}
    /* RAG */
    f.rag={capacity:rag(f.sewing.eff,TH.effG,TH.effA,true),quality:rag(f.qc.rate,TH.rejG,TH.rejA,false),plan:f.plan?rag(f.plan.completion-f.plan.elapsedShare,TH.planA,TH.planR,true):null,shipping:f.shipping.rows?(f.shipping.overdueRows===0?'G':f.shipping.orig&&f.shipping.overdueOpen<=f.shipping.orig*TH.shipA/100?'A':'R'):null,wip:rag(f.wip.daysOfOutput,TH.wipA,TH.wipR,false)};
    if(kind==='plan'){f.rag.loading=f.loading?rag(f.loading.week.loadingPct,TH.loadG,TH.loadA,true):null;f.rag.ready=f.fabric.noFabricShare!=null?rag(f.fabric.noFabricShare,TH.fabG,TH.fabA,false):null;
      f.hasData=!!(f.loading||f.sewing.rows||f.shipping.rows);f.anomalies=planAnomalies(f);f.highlights=planHighlights(f);f.conclusion=planConclusion(f);f.actions=planActions(f);f.basis=planBasis(f)}
    else{f.anomalies=anomalies(f);f.highlights=highlights(f);f.hasData=f.sewing.rows>0||f.cutting.rows>0||f.qc.reports>0;f.conclusion=conclusion(f);f.actions=actions(f);f.basis=basis(f)}
    enrich(f,data,sewDays);
    return f;
  }
  /* ── v1.2 排單負荷 / loading facts (Production Plan rows only; same reading as the 排產甘特) ── */
  const lineNo=l=>{const m=String(l||'').match(/\d+/);return m?Number(m[0]):0};
  const lineShort=l=>{const n=lineNo(l);return n?'L'+n:String(l||'')};
  const workdays=(a,b)=>{const out=[];for(let d=a;d&&d<=b;d=addDays(d,1))if(dowMon0(d)<6)out.push(d);return out};   // Mon–Sat
  function planRuns(rows){
    /* one run = one style on one line over a continuous date range (POs merged); rows without a start date are listed separately */
    const runs=[],undated=[];(rows||[]).forEach(r=>{if(!r||!r.line||num(r.sewingQty)<=0)return;const st=dayKey(r.startDate),en=dayKey(r.endDate)||dayKey(r.finishDate)||st;const line=String(r.line).trim(),style=String(r.style||'').trim();if(!style)return;if(!st){undated.push({line,style,qty:num(r.sewingQty),po:String(r.po||'')});return}
      const x=runs.find(q=>q.line===line&&q.style===style&&!(st>addDays(q.end,1)||en<addDays(q.start,-1)));
      if(x){if(st<x.start)x.start=st;if(en>x.end)x.end=en;x.qty+=num(r.sewingQty);if(r.po)x.pos.add(String(r.po));x.daily=Math.max(x.daily,num(r.dailyOutput))}
      else runs.push({line,style,customer:String(r.customer||'').trim(),product:String(r.product||''),start:st,end:en<st?st:en,qty:num(r.sewingQty),pos:new Set(r.po?[String(r.po)]:[]),daily:num(r.dailyOutput),manpower:num(r.manpower)})});
    runs.forEach(r=>{r.days=workdays(r.start,r.end).length||1;r.pos=[...r.pos]});
    return {runs:runs.sort((a,b)=>lineNo(a.line)-lineNo(b.line)||a.start.localeCompare(b.start)),undated};
  }
  function weekLoading(runs,ws,we,lines){
    const days=workdays(ws,we);const byLine={};lines.forEach(l=>{byLine[l]={line:l,busy:new Set(),pieces:0,styles:new Set(),changes:[],gapDays:[]}});
    runs.forEach(r=>{const L=byLine[r.line];if(!L)return;const ds=workdays(r.start<ws?ws:r.start,r.end>we?we:r.end);if(!ds.length)return;ds.forEach(d=>L.busy.add(d));L.pieces+=Math.round(r.qty*ds.length/r.days);L.styles.add(r.style)});
    /* changeovers: a style starts on a day it was not running the day before and the line ran something earlier */
    runs.forEach(r=>{const L=byLine[r.line];if(!L||r.start<ws||r.start>we)return;const earlier=runs.some(x=>x!==r&&x.line===r.line&&x.start<r.start);const cont=runs.some(x=>x!==r&&x.line===r.line&&x.style===r.style&&x.start<r.start&&x.end>=addDays(r.start,-1));if(earlier&&!cont&&!L.changes.includes(r.start))L.changes.push(r.start)});
    const out=Object.values(byLine).map(L=>{const gap=days.filter(d=>!L.busy.has(d));const before=runs.some(r=>r.line===L.line&&r.end<ws),after=runs.some(r=>r.line===L.line&&r.start>we);
      return {line:L.line,short:lineShort(L.line),scheduledDays:L.busy.size,gapDays:gap.length,gaps:gap,pieces:L.pieces,styles:[...L.styles],changeovers:L.changes.length,changeDates:L.changes.sort(),planBefore:before,planAfter:after,empty:L.busy.size===0}}).sort((a,b)=>lineNo(a.line)-lineNo(b.line));
    const sched=out.reduce((s2,L)=>s2+L.scheduledDays,0),avail=days.length*out.length;
    return {start:ws,end:we,workdays:days.length,lines:out,lineCount:out.length,availableLineDays:avail,scheduledLineDays:sched,loadingPct:avail?Math.round(sched/avail*1000)/10:null,pieces:out.reduce((s2,L)=>s2+L.pieces,0),changeovers:out.reduce((s2,L)=>s2+L.changeovers,0),gapLineDays:out.reduce((s2,L)=>s2+L.gapDays,0),emptyLines:out.filter(L=>L.empty).map(L=>L.short),gapLines:out.filter(L=>!L.empty&&L.gapDays>0).map(L=>L.short+' '+L.gapDays+'天'),styles:[...new Set(out.flatMap(L=>L.styles))].length};
  }
  function loadingFacts(data,P,sewDays,prev,today){
    const rows=(data.prodplan||[]).filter(r=>r&&r.line);if(!rows.length)return null;
    const {runs,undated}=planRuns(rows);
    const ym=P.end.slice(0,7);const near=runs.filter(r=>r.end>=addDays(P.start,-31)&&r.start<=addDays(P.end,31));
    const lines=[...new Set(near.map(r=>r.line))].filter(l=>lineNo(l)!==12).sort((a,b)=>lineNo(a)-lineNo(b));
    if(!lines.length)return null;
    const week=weekLoading(runs,P.start,P.end,lines),prevW=weekLoading(runs,prev.start,prev.end,lines),next=weekLoading(runs,addDays(P.end,1),addDays(P.end,7),lines);
    /* plan vs actual by line for this week (schedule exposure, pro-rata by working days; NOT a verified balance) */
    const sewLine={};Object.keys(sewDays).filter(d=>d>=P.start&&d<=P.end).forEach(d=>sewDays[d].forEach(r=>{const l=String(r.lineNo||'');const k=lines.find(x=>lineNo(x)===lineNo(l))||l;sewLine[k]=(sewLine[k]||0)+num(r.pieces)}));
    week.lines.forEach(L=>{L.actual=sewLine[L.line]||0;L.attainment=L.pieces>0?Math.round(L.actual/L.pieces*1000)/10:null});
    const actual=Object.values(sewLine).reduce((s2,v)=>s2+v,0);
    /* month concentration */
    const month=rows.filter(r=>String(r.month||'').slice(0,7)===ym);const mq=month.reduce((s2,r)=>s2+num(r.sewingQty),0);const byCust={},bySty={};month.forEach(r=>{const c=String(r.customer||'—').trim();byCust[c]=(byCust[c]||0)+num(r.sewingQty);const st=String(r.style||'—').trim();bySty[st]=(bySty[st]||0)+num(r.sewingQty)});
    const conc={month:ym,qty:mq,customers:top(byCust,4).map(([k,v])=>({customer:k,qty:v,share:mq?Math.round(v/mq*1000)/10:0})),styles:top(bySty,5).map(([k,v])=>({style:k,qty:v,share:mq?Math.round(v/mq*1000)/10:0})),customerCount:Object.keys(byCust).length,styleCount:Object.keys(bySty).length};
    conc.top2Share=conc.customers.slice(0,2).reduce((s2,c)=>s2+c.share,0);
    /* SMV coverage for the styles scheduled this week (only when the page / GAS hands a map) */
    let smv=null;if(data.smvMap&&typeof data.smvMap==='object'&&Object.keys(data.smvMap).length){const styles=[...new Set(runs.filter(r=>r.end>=P.start&&r.start<=P.end).map(r=>r.style))];const key=x=>String(x||'').replace(/[\s\-_\/]/g,'').toUpperCase();const missing=styles.filter(st=>{const m=data.smvMap[key(st)]||data.smvMap[st];return !(m&&num(m.curSMV||m.smv)>0)});smv={styles:styles.length,missing:missing.length,missingStyles:missing.slice(0,8)}}
    const runsIn=runs.filter(r=>r.end>=P.start&&r.start<=P.end);
    return {week,prev:prevW,next,actual,exposure:week.pieces,attainment:week.pieces>0?Math.round(actual/week.pieces*1000)/10:null,undated:undated.length,undatedRows:undated.slice(0,6),conc,smv,runs:runsIn.length,topRuns:runsIn.slice().sort((a,b)=>b.qty-a.qty).slice(0,6).map(r=>({line:lineShort(r.line),style:r.style,customer:r.customer,qty:r.qty,start:r.start,end:r.end,pos:r.pos.length})),nextStarts:runs.filter(r=>r.start>P.end&&r.start<=addDays(P.end,7)).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,8).map(r=>({line:lineShort(r.line),style:r.style,customer:r.customer,qty:r.qty,start:r.start}))};
  }
  /* ── anomalies (code-decided, ranked, max 3 for Telegram; the doc lists all) ── */
  function anomalies(f){const A=[];const prevZh=f.period==='week'?'前週':'前日',prevEn=f.period==='week'?'previous week':'previous day';
    if(f.shipping.overdueRows)A.push({kind:'ship',sev:5,ref:f.shipping.overdue.map(o=>o.po).join(', '),who:WHO.ship,zh:'本週 ETD 已過仍未出貨 '+N(f.shipping.overdueRows)+' 筆／'+N(f.shipping.overdueOpen)+' 件（'+f.shipping.overdue.slice(0,3).map(o=>o.cust+' PO '+o.po+' '+N(o.open)).join('；')+'）',en:f.shipping.overdueRows+' line(s) past ETD this week still open, '+N(f.shipping.overdueOpen)+' pcs ('+f.shipping.overdue.slice(0,3).map(o=>o.cust+' PO '+o.po+' '+N(o.open)).join('; ')+')'});
    if(f.plan&&f.rag.plan==='R')A.push({kind:'plan',sev:5,ref:f.plan.month,who:WHO.plan,zh:f.plan.month+' 排單 '+N(f.plan.planQty)+' 件已完成 '+pct(f.plan.completion)+'（工作日已過 '+pct(f.plan.elapsedShare)+'），餘 '+N(f.plan.remaining)+' 件、剩 '+N(f.plan.workdaysLeft)+' 個工作日，需 '+N(f.plan.requiredPerDay)+' 件／日，高於本期日均 '+N(f.sewing.perDay),en:f.plan.month+' plan '+N(f.plan.planQty)+' pcs is '+pct(f.plan.completion)+' complete ('+pct(f.plan.elapsedShare)+' of working days elapsed); '+N(f.plan.remaining)+' pcs left over '+N(f.plan.workdaysLeft)+' working days = '+N(f.plan.requiredPerDay)+' pcs/day, above the current '+N(f.sewing.perDay)+'/day'});
    if(f.riskLines.dual.length)A.push({kind:'dual',sev:4,ref:f.riskLines.dual.join(', '),who:WHO.ie,zh:'雙重風險線（低效＋高退修）：'+f.riskLines.dual.map(l=>{const x=f.lines.find(y=>y.line===l);return l+'（效率 '+pct(x.eff,0)+'、退修 '+pct(x.rejectRate)+'）'}).join('、')+'，效率與品質要一起處理',en:'Dual-risk lines (weak efficiency + high reject): '+f.riskLines.dual.map(l=>{const x=f.lines.find(y=>y.line===l);return l+' ('+pct(x.eff,0)+' / '+pct(x.rejectRate)+')'}).join(', ')+' — manage efficiency and quality together'});
    const wl=f.qc.worstLines[0];if(!f.riskLines.dual.length&&f.qc.rate!=null&&wl&&wl.rate>=3&&wl.rate>=2*f.qc.rate&&wl.inspected>=50)A.push({kind:'qc',sev:4,ref:wl.line,who:WHO.qc,zh:lineName(wl.line)+' 退修率 '+pct(wl.rate)+'（全廠 '+pct(f.qc.rate)+'）'+(f.qc.top[0]?'，主要缺點 '+f.qc.top[0].name:''),en:lineName(wl.line)+' reject rate '+pct(wl.rate)+' (plant '+pct(f.qc.rate)+')'+(f.qc.top[0]?', main defect '+f.qc.top[0].name:'')});
    if(f.sewing.eff!=null){const low=f.lines.filter(L=>L.verdict==='weak'&&L.risk!=='dual').sort((a,b)=>a.eff-b.eff).slice(0,3);if(low.length)A.push({kind:'eff',sev:3,ref:low.map(L=>L.line).join(', '),who:WHO.sew,zh:'低效線：'+low.map(L=>lineShort(L.line)+' '+pct(L.eff,0)+'（'+(L.styles||'—')+'）').join('、')+'，低於 '+TH.lineLow+'%；全廠 '+pct(f.sewing.eff),en:'Weak lines: '+low.map(L=>lineShort(L.line)+' '+pct(L.eff,0)+' ('+(L.styles||'—')+')').join(', ')+', below '+TH.lineLow+'%; plant '+pct(f.sewing.eff)})}
    if(f.compare.piecesVsPrev!=null&&f.compare.piecesVsPrev<=-15)A.push({kind:'output',sev:3,ref:'',who:WHO.plan,zh:'產量較'+prevZh+' '+fmtDelta(f.compare.piecesVsPrev)+'（'+N(f.prevDay.pieces)+' → '+N(f.sewing.pieces)+' 件'+(f.compare.manpowerVsPrev!=null?'，人力 '+(f.compare.manpowerVsPrev>=0?'+':'')+N(f.compare.manpowerVsPrev):'')+'，線數 '+N(f.prevDay.lines)+' → '+N(f.sewing.lines)+'）'+(f.compare.manpowerVsPrev!=null&&f.compare.manpowerVsPrev>=0?'：人力沒有減少，問題在效率／款式組合，不是缺人':''),en:'Output '+fmtDelta(f.compare.piecesVsPrev)+' vs '+prevEn+' ('+N(f.prevDay.pieces)+' → '+N(f.sewing.pieces)+' pcs'+(f.compare.manpowerVsPrev!=null?', manpower '+(f.compare.manpowerVsPrev>=0?'+':'')+N(f.compare.manpowerVsPrev):'')+', lines '+N(f.prevDay.lines)+' → '+N(f.sewing.lines)+')'+(f.compare.manpowerVsPrev!=null&&f.compare.manpowerVsPrev>=0?': manpower did not fall, so the cause is efficiency / mix, not headcount':'')});
    if(f.qcReconcile&&!f.qcReconcile.ok)A.push({kind:'reconcile',sev:3,ref:'',who:WHO.qc,zh:'QC 實際產出 '+N(f.qcReconcile.qcOutput)+' 件與車縫日報 '+N(f.qcReconcile.sewing)+' 件對不上（差 '+N(f.qcReconcile.diff)+'，'+pct(f.qcReconcile.diffPct)+'）',en:'QC actual output '+N(f.qcReconcile.qcOutput)+' pcs does not reconcile with sewing output '+N(f.qcReconcile.sewing)+' pcs (diff '+N(f.qcReconcile.diff)+', '+pct(f.qcReconcile.diffPct)+')'});
    if(f.maint.needle.flag.length){const fl=f.maint.needle.flag.slice(0,2);A.push({kind:'needle',sev:2,ref:fl.map(x=>x.line).join(', '),who:WHO.mech,zh:fl.map(x=>lineName(x.line)+' 非計畫換針 '+N(x.unplanned)+' 支（'+(f.period==='week'?'日均 '+N(x.perDay)+'，':'')+'近 28 天平均 '+N(x.baseline)+'／日）').join('、'),en:fl.map(x=>lineName(x.line)+' unplanned needle changes '+N(x.unplanned)+' ('+(f.period==='week'?N(x.perDay)+'/day, ':'')+'28-day avg '+N(x.baseline)+'/day)').join(', ')})}
    if(f.fabric.noFabricPcs>0)A.push({kind:'fabric',sev:2,ref:f.fabric.top.slice(0,3).map(x=>x.po).join(', '),who:WHO.wh,zh:'缺布待裁 '+N(f.fabric.noFabricPcs)+' 件'+(f.fabric.noFabricShare!=null?'（占未車縫 '+pct(f.fabric.noFabricShare)+'）':'')+'（客戶統計 '+(f.fabric.snapshotDate||'—')+'）'+(f.fabric.top.length?'：'+f.fabric.top.slice(0,3).map(x=>x.customer+' PO '+x.po+' '+N(x.noFabric)).join('；'):''),en:'No fabric available for '+N(f.fabric.noFabricPcs)+' pcs'+(f.fabric.noFabricShare!=null?' ('+pct(f.fabric.noFabricShare)+' of not-sewn)':'')+' (customer statistics '+(f.fabric.snapshotDate||'—')+')'+(f.fabric.top.length?': '+f.fabric.top.slice(0,3).map(x=>x.customer+' PO '+x.po+' '+N(x.noFabric)).join('; '):'')});
    if(f.wip.daysOfOutput!=null&&f.wip.daysOfOutput>TH.wipA)A.push({kind:'wip',sev:1,ref:f.wip.top.map(x=>x.style).join(', '),who:WHO.plan,zh:'已裁未縫 '+N(f.wip.cutNotSewn)+' 件，約 '+N(f.wip.daysOfOutput)+' 天產量'+(f.wip.top.length?'（最多：'+f.wip.top.slice(0,3).map(x=>x.style+' '+N(x.wip)).join('、')+'）':''),en:'Cut-not-sewn WIP '+N(f.wip.cutNotSewn)+' pcs ≈ '+N(f.wip.daysOfOutput)+' days of output'+(f.wip.top.length?' (largest: '+f.wip.top.slice(0,3).map(x=>x.style+' '+N(x.wip)).join(', ')+')':'')});
    return A.sort((a,b)=>b.sev-a.sev)}
  function highlights(f){const H=[];const s=f.sewing;const W=f.period==='week';const prevZh=W?'前週':'前日',prevEn=W?'previous week':'previous day';
    H.push({zh:(W?'本週':'車縫')+' '+N(s.pieces)+' 件'+(W?'（'+N(s.dayCount)+' 個生產日，日均 '+N(s.perDay)+'，平均 '+N(s.manpower)+' 人）':'（'+N(s.lines)+' 條線，'+N(s.manpower)+' 人）')+(f.prevDay.pieces!=null?'，較'+prevZh+' '+fmtDelta(f.compare.piecesVsPrev):'')+(f.lastWeek.pieces!=null?'、上週同日 '+fmtDelta(f.compare.piecesVsLastWeek):''),en:(W?'This week':'Sewing')+' '+N(s.pieces)+' pcs'+(W?' ('+N(s.dayCount)+' production days, '+N(s.perDay)+'/day, avg '+N(s.manpower)+' operators)':' ('+N(s.lines)+' lines, '+N(s.manpower)+' operators)')+(f.prevDay.pieces!=null?', '+fmtDelta(f.compare.piecesVsPrev)+' vs '+prevEn:'')+(f.lastWeek.pieces!=null?', '+fmtDelta(f.compare.piecesVsLastWeek)+' vs same day last week':'')});
    const wipZh=f.wip.cutNotSewn!=null?'；已裁未縫 '+N(f.wip.cutNotSewn)+' 件':'',wipEn=f.wip.cutNotSewn!=null?'; cut-not-sewn WIP '+N(f.wip.cutNotSewn)+' pcs':'';
    H.push({zh:(s.eff!=null?'加權效率 '+pct(s.eff)+' '+RAG_ZH[f.rag.capacity]+(f.prevDay.eff!=null?'（'+prevZh+' '+pct(f.prevDay.eff)+'，'+fmtPt(s.eff,f.prevDay.eff)+(f.compare.manpowerVsPrev!=null&&f.compare.manpowerVsPrev>0&&f.compare.effVsPrevPt<0?'；人力反而增加，問題不在缺人':'')+'）':''):'加權效率 —（日報無工時／人數）')+'；裁剪 '+N(f.cutting.pieces)+' 件'+wipZh,en:(s.eff!=null?'Weighted efficiency '+pct(s.eff)+' '+RAG_ZH[f.rag.capacity]+(f.prevDay.eff!=null?' ('+prevEn+' '+pct(f.prevDay.eff)+', '+fmtPt(s.eff,f.prevDay.eff)+(f.compare.manpowerVsPrev!=null&&f.compare.manpowerVsPrev>0&&f.compare.effVsPrevPt<0?'; manpower rose, so headcount is not the issue':'')+')':''):'Weighted efficiency — (no minutes / workers in the reports)')+'; cutting '+N(f.cutting.pieces)+' pcs'+wipEn});
    if(f.plan)H.push({zh:f.plan.month+' 排單 '+N(f.plan.planQty)+' 件已完成 '+N(f.plan.mtd)+'（'+pct(f.plan.completion)+'）'+RAG_ZH[f.rag.plan]+'，餘 '+N(f.plan.remaining)+' 件／剩 '+N(f.plan.workdaysLeft)+' 個工作日（需 '+N(f.plan.requiredPerDay)+' 件／日）'+(f.qc.rate!=null?'；QC 退修率 '+pct(f.qc.rate,2)+' '+RAG_ZH[f.rag.quality]:''),en:f.plan.month+' plan '+N(f.plan.planQty)+' pcs: '+N(f.plan.mtd)+' done ('+pct(f.plan.completion)+') '+RAG_ZH[f.rag.plan]+', '+N(f.plan.remaining)+' pcs left over '+N(f.plan.workdaysLeft)+' working days ('+N(f.plan.requiredPerDay)+' pcs/day needed)'+(f.qc.rate!=null?'; QC reject '+pct(f.qc.rate,2)+' '+RAG_ZH[f.rag.quality]:'')});
    else if(f.shipping.pct!=null)H.push({zh:'本週出貨計畫完成 '+pct(f.shipping.pct,0)+' '+RAG_ZH[f.rag.shipping]+'（已出 '+N(f.shipping.shipped)+'／計畫 '+N(f.shipping.orig)+'，未出 '+N(f.shipping.open)+' 件）'+(f.qc.rate!=null?'；QC 退修率 '+pct(f.qc.rate,2)+' '+RAG_ZH[f.rag.quality]:''),en:'This week shipping plan '+pct(f.shipping.pct,0)+' '+RAG_ZH[f.rag.shipping]+' (shipped '+N(f.shipping.shipped)+' / planned '+N(f.shipping.orig)+', open '+N(f.shipping.open)+' pcs)'+(f.qc.rate!=null?'; QC reject '+pct(f.qc.rate,2)+' '+RAG_ZH[f.rag.quality]:'')});
    else if(f.qc.rate!=null)H.push({zh:'Final QC 退修率 '+pct(f.qc.rate,2)+' '+RAG_ZH[f.rag.quality]+'（檢驗 '+N(f.qc.inspected)+'，退修 '+N(f.qc.rejected)+'）'+(f.qc.top.length?'，前三缺點 '+f.qc.top.slice(0,3).map(x=>x.name+' '+N(x.qty)).join('、'):''),en:'Final QC reject rate '+pct(f.qc.rate,2)+' '+RAG_ZH[f.rag.quality]+' (inspected '+N(f.qc.inspected)+', rejected '+N(f.qc.rejected)+')'+(f.qc.top.length?', top defects '+f.qc.top.slice(0,3).map(x=>x.name+' '+N(x.qty)).join(', '):'')});
    else H.push({zh:'換針 '+N(f.maint.needle.qty)+' 支（非計畫 '+N(f.maint.needle.unplanned)+'）；換件 '+N(f.maint.part.qty)+' 件'+(f.fabric.noFabricPcs>0?'；缺布 '+N(f.fabric.noFabricPcs)+' 件':''),en:'Needle changes '+N(f.maint.needle.qty)+' (unplanned '+N(f.maint.needle.unplanned)+'); part changes '+N(f.maint.part.qty)+(f.fabric.noFabricPcs>0?'; no fabric '+N(f.fabric.noFabricPcs)+' pcs':'')});
    return H.slice(0,3)}
  /* ── 管理結論 (rule-generated, 中文 + English) — written the way the factory's own weekly report reads: facts first, then the judgement ── */
  const upDown=(d,zhUp,zhDown)=>d==null?'':d>0?zhUp:d<0?zhDown:'持平';
  function conclusion(f){const W=f.period==='week';const z=[],e=[];const s=f.sewing,c=f.compare,p=f.prevDay;const prevZh=W?'前週':'前日',prevEn=W?'the previous week':'the previous day';
    if(s.rows){
      z.push((W?'本週共完成 '+N(s.pieces)+' 件，'+N(s.dayCount)+' 個實際生產日，日均 '+N(s.perDay)+' 件，平均投入約 '+N(s.manpower)+' 人':'本日完成 '+N(s.pieces)+' 件，'+N(s.lines)+' 條線、約 '+N(s.manpower)+' 人')+(s.eff!=null?'；依車縫日報的'+(s.effBasis==='minutes'?'標準分鐘與可用工時':'人數加權')+'重算，加權效率約 '+pct(s.eff):'；本期日報沒有工時，無法算加權效率')+'。'+(p.pieces!=null?'相較'+prevZh+' '+N(p.pieces)+' 件'+(p.eff!=null?'、'+pct(p.eff):'')+'，'+(W?'本週':'本日')+'產量'+upDown(c.piecesVsPrev,'增加','下降')+' '+N(Math.abs(s.pieces-p.pieces))+' 件（'+fmtDelta(c.piecesVsPrev)+'）'+(c.effVsPrevPt!=null?'，效率'+upDown(c.effVsPrevPt,'上升','下降')+' '+Math.abs(c.effVsPrevPt).toFixed(1)+' pt':'')+(c.manpowerVsPrev!=null?'，人力 '+(c.manpowerVsPrev>=0?'+':'−')+N(Math.abs(c.manpowerVsPrev))+' 人':'')+'。':''));
      e.push((W?'The factory completed '+N(s.pieces)+' pieces over '+N(s.dayCount)+' actual production days, averaging '+N(s.perDay)+' pieces/day with about '+N(s.manpower)+' operators':'The day closed at '+N(s.pieces)+' pieces on '+N(s.lines)+' lines with about '+N(s.manpower)+' operators')+(s.eff!=null?'; weighted efficiency recalculated from '+(s.effBasis==='minutes'?'standard minutes and available labor time':'worker-weighted reports')+' was about '+pct(s.eff):'; the reports carry no minutes, so weighted efficiency cannot be computed')+'.'+(p.pieces!=null?' Compared with '+N(p.pieces)+' pieces'+(p.eff!=null?' and '+pct(p.eff):'')+' '+prevEn+', output '+(c.piecesVsPrev>=0?'rose':'fell')+' by '+N(Math.abs(s.pieces-p.pieces))+' pieces ('+fmtDelta(c.piecesVsPrev)+')'+(c.effVsPrevPt!=null?' and efficiency '+(c.effVsPrevPt>=0?'improved':'declined')+' by '+Math.abs(c.effVsPrevPt).toFixed(1)+' pt':'')+(c.manpowerVsPrev!=null?', with labor '+(c.manpowerVsPrev>=0?'+':'−')+N(Math.abs(c.manpowerVsPrev)):'')+'.':''));
      /* the judgement: what the week / day is and is not */
      const dual=f.riskLines.dual,qual=f.riskLines.quality,cap=f.riskLines.capacity;let jz='',je='';
      if(c.effVsPrevPt!=null&&c.effVsPrevPt<0&&c.manpowerVsPrev!=null&&c.manpowerVsPrev>=0){jz='管理判定：'+(W?'本週':'本日')+'不是「工廠沒有產能」，而是「總人力仍在，但效率下降'+(f.riskLines.weak.length?'、'+f.riskLines.weak.map(lineShort).join('、')+' 明顯偏低':'')+'」；產量下降不能主要歸因於缺人，較合理的解釋是款式／SMV 組合、轉線與個別組別低效'+(f.qc.rate!=null&&f.rag.quality!=='G'?'，加上品質重工的曝險':'')+'。';je='Management judgement: this is not a loss of capacity but a '+(W?'week':'day')+' of lower efficiency with the same labor'+(f.riskLines.weak.length?' and clearly weak lines ('+f.riskLines.weak.map(lineShort).join(', ')+')':'')+'; the output drop should not be attributed mainly to manpower — style/SMV mix, routing changes and weak individual lines'+(f.qc.rate!=null&&f.rag.quality!=='G'?', plus quality rework exposure,':'')+' are more relevant.'}
      else if(c.effVsPrevPt!=null&&c.effVsPrevPt>0&&c.piecesVsPrev!=null&&c.piecesVsPrev<0){jz='管理判定：產量下降但效率上升，表示'+(c.manpowerVsPrev!=null&&c.manpowerVsPrev<0?'少了 '+N(Math.abs(c.manpowerVsPrev))+' 人的影響大於效率改善':'件數下降來自款式組合（高 SMV 款件數本來就少）或生產日數')+'，件數與標準工時要分開判讀。';je='Management judgement: output fell while efficiency improved, which points to '+(c.manpowerVsPrev!=null&&c.manpowerVsPrev<0?'the '+N(Math.abs(c.manpowerVsPrev))+'-operator reduction outweighing the efficiency gain':'style mix (high-SMV styles carry fewer pieces) or fewer production days')+'; pieces and standard minutes must be read separately.'}
      else if(c.effVsPrevPt!=null&&c.effVsPrevPt>0){jz='管理判定：'+(W?'本週':'本日')+'產能改善主要來自效率'+(c.manpowerVsPrev!=null&&c.manpowerVsPrev>0?'與人力同時增加':'提升而不是加人')+'，但'+(f.rag.capacity==='G'?'仍要看各組是否同步':'全廠 '+pct(s.eff)+' 仍在 '+RAG_ZH[f.rag.capacity]+'，不能視為已達標')+'。';je='Management judgement: the improvement came from '+(c.manpowerVsPrev!=null&&c.manpowerVsPrev>0?'both efficiency and added labor':'efficiency rather than headcount')+', but '+(f.rag.capacity==='G'?'line-level consistency still needs checking':'the plant level of '+pct(s.eff)+' is still '+RAG_ZH[f.rag.capacity]+' and should not be read as on target')+'.'}
      else if(s.eff!=null){jz='管理判定：全廠加權效率 '+pct(s.eff)+'（'+RAG_ZH[f.rag.capacity]+'）'+(f.rag.capacity==='G'?'，產能面可接受，重點放在個別組別與品質。':f.rag.capacity==='A'?'，產能面偏低但不是全面停滯，問題集中在個別組別。':'，產能面明顯不足，須先處理低效組別與排線。');je='Management judgement: plant weighted efficiency '+pct(s.eff)+' ('+RAG_ZH[f.rag.capacity]+')'+(f.rag.capacity==='G'?' — capacity is acceptable; focus on individual lines and quality.':f.rag.capacity==='A'?' — capacity is below target but not stalled; the issue is concentrated in individual lines.':' — capacity is clearly short; weak lines and loading come first.')}
      if(dual.length){jz+=dual.map(lineShort).join('、')+' 同時低效且高退修，是真正的「產能＋品質」雙重風險，應合併處理而不是分成兩個問題。';je+=' '+dual.map(lineShort).join(', ')+' combine weak efficiency with high rejects — a genuine capacity-and-quality dual risk to be managed as one problem.'}
      if(qual.length){jz+=qual.map(lineShort).join('、')+' 產量好但退修高，高產量不等於有效出貨產能。';je+=' '+qual.map(lineShort).join(', ')+' deliver output but with high rejects; high output is not automatically shipment-ready capacity.'}
      if(cap.length&&!dual.length){jz+=cap.map(lineShort).join('、')+' 低效但退修不高，應先查換款、工序平衡、SMV 與人員配置，而不是先歸給 QC。';je+=' '+cap.map(lineShort).join(', ')+' are weak with acceptable rejects — check changeover, line balance, SMV and staffing before blaming QC.'}
      if(jz){z.push(jz);e.push(je)}
    }else{z.push((W?'本週':'本日')+'沒有車縫日報資料，無法判定產能。');e.push('No sewing report data for this '+(W?'week':'day')+'; capacity cannot be judged.')}
    if(f.plan){const req=f.plan.requiredPerDay,over=req!=null&&req>s.perDay;
      z.push((over?'更大的問題在月末：':'月排單方面：')+'截至 '+mmdd(f.end)+'，'+f.plan.month+' 計劃 '+N(f.plan.planQty)+' 件已完成 '+N(f.plan.mtd)+' 件（'+pct(f.plan.completion)+'，工作日已過 '+pct(f.plan.elapsedShare)+'），尚差 '+N(f.plan.remaining)+' 件；剩 '+N(f.plan.workdaysLeft)+' 個工作日，若全部餘量仍需在本月完成，平均需約 '+N(req)+' 件／日，'+(over?'明顯高於':'不高於')+(W?'本週':'本期')+'日均 '+N(s.perDay)+' 件'+(over?'，目前不能把本月排單判定為安全。':'，以目前節奏可以覆蓋，但仍要逐 PO 對帳。'));
      e.push((over?'The larger issue is month-end: ':'On the month plan: ')+'through '+mmdd(f.end)+', '+N(f.plan.mtd)+' of the '+N(f.plan.planQty)+' pieces planned for '+f.plan.month+' are done ('+pct(f.plan.completion)+', with '+pct(f.plan.elapsedShare)+' of working days elapsed), leaving '+N(f.plan.remaining)+' pieces over '+N(f.plan.workdaysLeft)+' working days — about '+N(req)+' pieces/day if the full balance is still due this month, '+(over?'well above':'within')+' the current '+N(s.perDay)+'/day pace'+(over?'; the month cannot be considered safely covered.':'; coverage is plausible but must still be reconciled per PO.'))}
    if(f.shipping.rows&&f.shipping.overdueRows){z.push('出貨方面，本週 ETD 已過仍未出 '+N(f.shipping.overdueRows)+' 筆／'+N(f.shipping.overdueOpen)+' 件（'+f.shipping.overdue.slice(0,2).map(o2=>o2.cust+' PO '+o2.po).join('、')+'），要以實際裝櫃資訊更新船期表，而不是讓逾期狀態留在表上。');e.push('On shipping, '+N(f.shipping.overdueRows)+' line(s) past ETD this week remain open ('+N(f.shipping.overdueOpen)+' pcs: '+f.shipping.overdue.slice(0,2).map(o2=>o2.cust+' PO '+o2.po).join(', ')+'); update the schedule from actual loading instead of leaving overdue status on the sheet.')}
    return {zh:z.join(''),en:e.join(' ')}}
  /* ── 排單週報 (kind plan): highlights / conclusion / anomalies / actions / basis — no maintenance by design ── */
  function planHighlights(f){const H=[];const L=f.loading;
    if(L){const w=L.week;H.push({zh:'本週 '+w.lines[0].short+'–'+w.lines[w.lines.length-1].short+' 可用 '+N(w.availableLineDays)+' 組日，主排單占 '+N(w.scheduledLineDays)+' 組日（負荷 '+pct(w.loadingPct,0)+' '+RAG_ZH[f.rag.loading]+(L.prev.availableLineDays?'，前週 '+pct(L.prev.loadingPct,0):'')+'）'+(w.emptyLines.length?'；全週沒有排單：'+w.emptyLines.join('、'):'')+(w.gapLines.length?'；中途空檔：'+w.gapLines.join('、'):'')+'；換款 '+N(w.changeovers)+' 次。',en:'This week '+w.lines[0].short+'–'+w.lines[w.lines.length-1].short+' provide '+N(w.availableLineDays)+' line-days; the master plan occupies '+N(w.scheduledLineDays)+' ('+pct(w.loadingPct,0)+' loading, '+RAG_ZH[f.rag.loading]+(L.prev.availableLineDays?', previous week '+pct(L.prev.loadingPct,0):'')+')'+(w.emptyLines.length?'; no plan all week: '+w.emptyLines.join(', '):'')+(w.gapLines.length?'; mid-week gaps: '+w.gapLines.join(', '):'')+'; '+N(w.changeovers)+' changeovers.'});
      H.push({zh:'本週排單 '+N(L.exposure)+' 件（'+N(L.runs)+' 段、'+N(w.styles)+' 款），車縫實績 '+N(L.actual)+' 件'+(L.attainment!=null?'（'+pct(L.attainment,0)+'）':'')+'；這是排程暴露量，不是核實的剩餘量，達成與否要逐 PO／Style／Line 對帳。'+(f.plan?f.plan.month+' 月排單 '+N(f.plan.planQty)+' 件已完成 '+pct(f.plan.completion)+'（工作日已過 '+pct(f.plan.elapsedShare)+'）'+RAG_ZH[f.rag.plan]+'。':''),en:'Scheduled this week: '+N(L.exposure)+' pcs ('+N(L.runs)+' runs, '+N(w.styles)+' styles) against '+N(L.actual)+' pcs sewn'+(L.attainment!=null?' ('+pct(L.attainment,0)+')':'')+'; this is schedule exposure, not a verified balance — attainment must be reconciled per PO/Style/Line.'+(f.plan?' '+f.plan.month+' plan '+N(f.plan.planQty)+' pcs is '+pct(f.plan.completion)+' complete ('+pct(f.plan.elapsedShare)+' of working days elapsed) '+RAG_ZH[f.rag.plan]+'.':'')});
      const n=L.next;H.push({zh:'下週排單 '+N(n.pieces)+' 件、'+N(n.scheduledLineDays)+'／'+N(n.availableLineDays)+' 組日（'+pct(n.loadingPct,0)+'）'+(n.emptyLines.length?'，尚未排：'+n.emptyLines.join('、'):'，各組都有排單')+(L.undated?'；未填上線日 '+N(L.undated)+' 筆':'')+'。'+(f.fabric.hasData?'客戶統計 '+(f.fabric.snapshotDate||'—')+'：未車縫 '+N(f.fabric.notSewn)+'、裁片 WIP '+N(f.fabric.cuttingWip)+'、無布 '+N(f.fabric.noFabricPcs)+(f.fabric.noFabricShare!=null?'（占 '+pct(f.fabric.noFabricShare,0)+'）':'')+' — 訂單很多，真正限制排線的是布／標／裁片是否到位。':''),en:'Next week: '+N(n.pieces)+' pcs over '+N(n.scheduledLineDays)+'/'+N(n.availableLineDays)+' line-days ('+pct(n.loadingPct,0)+')'+(n.emptyLines.length?', not yet planned: '+n.emptyLines.join(', '):', every line has work')+(L.undated?'; '+N(L.undated)+' rows without a start date':'')+'.'+(f.fabric.hasData?' Customer statistics '+(f.fabric.snapshotDate||'—')+': not sewn '+N(f.fabric.notSewn)+', cutting WIP '+N(f.fabric.cuttingWip)+', no fabric '+N(f.fabric.noFabricPcs)+(f.fabric.noFabricShare!=null?' ('+pct(f.fabric.noFabricShare,0)+')':'')+' — the order book is large; the real loading constraint is whether fabric, labels and cut panels are ready.':'')})}
    else H.push({zh:'本週沒有 Production Plan 排單資料可分析（請先在排產產能模組匯入）。',en:'No Production Plan rows available for this week (import the plan in the plan & capacity module first).'});
    if(H.length<3&&f.shipping.pct!=null)H.push({zh:'本週出貨計畫完成 '+pct(f.shipping.pct,0)+' '+RAG_ZH[f.rag.shipping]+'（已出 '+N(f.shipping.shipped)+'／計畫 '+N(f.shipping.orig)+'，未出 '+N(f.shipping.open)+' 件'+(f.shipping.overdueRows?'，逾期 '+N(f.shipping.overdueRows)+' 筆':'')+'）。',en:'Shipping this week '+pct(f.shipping.pct,0)+' '+RAG_ZH[f.rag.shipping]+' (shipped '+N(f.shipping.shipped)+' / planned '+N(f.shipping.orig)+', open '+N(f.shipping.open)+(f.shipping.overdueRows?', '+N(f.shipping.overdueRows)+' overdue':'')+').'});
    return H.slice(0,3)}
  function planConclusion(f){const z=[],e=[];const L=f.loading;
    if(L){const w=L.week,worst=w.lines.slice().sort((a,b)=>b.changeovers-a.changeovers)[0];
      z.push('管理判定：本週排單負荷 '+RAG_ZH[f.rag.loading]+'（'+N(w.scheduledLineDays)+'／'+N(w.availableLineDays)+' 組日＝'+pct(w.loadingPct,0)+'）。'+(w.emptyLines.length||w.gapLines.length?'問題不是「沒有訂單」，而是「'+(w.emptyLines.length?w.emptyLines.join('、')+' 全週沒有可執行的排單':'')+(w.emptyLines.length&&w.gapLines.length?'、':'')+(w.gapLines.length?w.gapLines.join('、')+' 中途有空檔':'')+'」；生管要在空檔前把可上線訂單、WIP 與已到布新單補進去，若確定無料可做再按組別／日期提出局部停工。':'各組整週都有排單，空檔只有 '+N(w.gapLineDays)+' 組日，重點轉到是否照排單上線與換款是否過多。')+'換款 '+N(w.changeovers)+' 次'+(worst&&worst.changeovers?'（最多 '+worst.short+' '+N(worst.changeovers)+' 次）':'')+'，每次換款都會先吃掉效率，排單時同款同色盡量連續。');
      e.push('Management judgement: loading this week is '+RAG_ZH[f.rag.loading]+' ('+N(w.scheduledLineDays)+' of '+N(w.availableLineDays)+' line-days = '+pct(w.loadingPct,0)+'). '+(w.emptyLines.length||w.gapLines.length?'The issue is not a lack of orders but executable work: '+(w.emptyLines.length?w.emptyLines.join(', ')+' have nothing scheduled all week':'')+(w.emptyLines.length&&w.gapLines.length?'; ':'')+(w.gapLines.length?w.gapLines.join(', ')+' have mid-week gaps':'')+'. PMC should load ready-to-sew orders, WIP and newly arrived fabric before the gaps, and request planned idle time by line and date only where no work exists.':'Every line has work all week with only '+N(w.gapLineDays)+' idle line-days; the focus moves to whether lines follow the plan and whether changeovers are excessive.')+' '+N(w.changeovers)+' changeovers'+(worst&&worst.changeovers?' (most on '+worst.short+', '+N(worst.changeovers)+')':'')+' — each one costs efficiency first, so keep the same style and colour consecutive when loading.');
      z.push('本週排單 '+N(L.exposure)+' 件對應車縫實績 '+N(L.actual)+' 件'+(L.attainment!=null?'（'+pct(L.attainment,0)+'）':'')+'，但排單是整段排程暴露量，不是已核實的剩餘未完成量，不能直接把實績除以排單宣稱週達成率；正確做法是逐 PO／Style／Line 對帳，再把臨時轉線寫回 Production Plan，否則月底總量看似完成，Line／PO 仍可能假性達成。');
      e.push('Scheduled volume this week is '+N(L.exposure)+' pcs against '+N(L.actual)+' pcs sewn'+(L.attainment!=null?' ('+pct(L.attainment,0)+')':'')+', but the schedule is full-run exposure, not a verified remaining balance, so actual ÷ scheduled should not be presented as weekly attainment; reconcile per PO/Style/Line and write approved routing changes back into the Production Plan, otherwise month totals can look complete while Line/PO completion is misleading.')}
    else{z.push('本週沒有 Production Plan 可比對，負荷與換款無法判定。');e.push('No Production Plan rows for this week; loading and changeovers cannot be judged.')}
    if(f.plan){const req=f.plan.requiredPerDay,over=req!=null&&req>f.sewing.perDay;z.push(f.plan.month+' 月排單 '+N(f.plan.planQty)+' 件，截至 '+mmdd(f.end)+' 已完成 '+N(f.plan.mtd)+' 件（'+pct(f.plan.completion)+'，工作日已過 '+pct(f.plan.elapsedShare)+'），餘 '+N(f.plan.remaining)+' 件、剩 '+N(f.plan.workdaysLeft)+' 個工作日，平均需 '+N(req)+' 件／日，'+(over?'高於':'不高於')+'本週日均 '+N(f.sewing.perDay)+' 件'+(over?'；月底壓力要靠補排與效率一起解。':'。'));e.push(f.plan.month+' plan '+N(f.plan.planQty)+' pcs: '+N(f.plan.mtd)+' done through '+mmdd(f.end)+' ('+pct(f.plan.completion)+', '+pct(f.plan.elapsedShare)+' of working days elapsed), '+N(f.plan.remaining)+' pcs left over '+N(f.plan.workdaysLeft)+' working days = '+N(req)+' pcs/day, '+(over?'above':'within')+' this week\'s '+N(f.sewing.perDay)+'/day'+(over?'; month-end pressure needs both reloading and efficiency.':'.'))}
    if(f.fabric.hasData&&f.fabric.noFabricShare!=null){z.push('訂單很多，但「可立即上線」仍是核心限制：客戶統計 '+(f.fabric.snapshotDate||'—')+' 未車縫 '+N(f.fabric.notSewn)+' 件中無布 '+N(f.fabric.noFabricPcs)+' 件（'+pct(f.fabric.noFabricShare,0)+'）'+RAG_ZH[f.rag.ready]+'，裁片 WIP '+N(f.fabric.cuttingWip)+' 件；補排要以布／標／繡花／裁片已到位的款為準。');e.push('The order book is large but ready-to-sew availability is the real constraint: of '+N(f.fabric.notSewn)+' pcs not yet sewn ('+(f.fabric.snapshotDate||'—')+'), '+N(f.fabric.noFabricPcs)+' ('+pct(f.fabric.noFabricShare,0)+') have no fabric '+RAG_ZH[f.rag.ready]+', cutting WIP is '+N(f.fabric.cuttingWip)+'; reload only styles whose fabric, labels, embroidery and cut panels are physically ready.')}
    return {zh:z.join(''),en:e.join(' ')}}
  function planAnomalies(f){const A=[];const L=f.loading;
    if(L){const w=L.week,n=L.next;
      if(w.emptyLines.length)A.push({kind:'empty',sev:5,ref:w.emptyLines.join(', '),who:WHO.plan,zh:w.emptyLines.join('、')+' 本週（'+mmdd(w.start)+'–'+mmdd(w.end)+'）沒有任何排單，'+N(w.emptyLines.length*w.workdays)+' 組日沒有可執行工作',en:w.emptyLines.join(', ')+' have nothing scheduled this week ('+mmdd(w.start)+'–'+mmdd(w.end)+'): '+N(w.emptyLines.length*w.workdays)+' line-days without executable work'});
      if(n.emptyLines.length)A.push({kind:'nextEmpty',sev:4,ref:n.emptyLines.join(', '),who:WHO.plan,zh:'下週（'+mmdd(n.start)+'–'+mmdd(n.end)+'）'+n.emptyLines.join('、')+' 尚未排單；下週負荷 '+pct(n.loadingPct,0),en:'Next week ('+mmdd(n.start)+'–'+mmdd(n.end)+') '+n.emptyLines.join(', ')+' are not yet loaded; next-week loading '+pct(n.loadingPct,0)});
      const gaps=w.lines.filter(x=>!x.empty&&x.gapDays>=2);if(gaps.length)A.push({kind:'gap',sev:3,ref:gaps.map(x=>x.short).join(', '),who:WHO.plan,zh:'中途空檔：'+gaps.map(x=>x.short+' '+x.gapDays+' 天（'+x.gaps.map(mmdd).join('、')+'）').join('；'),en:'Mid-week gaps: '+gaps.map(x=>x.short+' '+x.gapDays+' days ('+x.gaps.map(mmdd).join(', ')+')').join('; ')});
      if(L.attainment!=null&&L.exposure>0&&L.attainment<70)A.push({kind:'attain',sev:3,ref:'',who:WHO.plan,zh:'本週排單 '+N(L.exposure)+' 件、實績 '+N(L.actual)+' 件（'+pct(L.attainment,0)+'）；差距要逐 PO／Style／Line 對帳，不能把排單當核實餘量',en:'Scheduled '+N(L.exposure)+' vs sewn '+N(L.actual)+' pcs ('+pct(L.attainment,0)+'); reconcile the gap per PO/Style/Line — the schedule is not a verified balance'});
      const chg=w.lines.filter(x=>x.changeovers>=TH.chgHigh);if(chg.length)A.push({kind:'change',sev:2,ref:chg.map(x=>x.short).join(', '),who:WHO.plan,zh:'換款偏多：'+chg.map(x=>x.short+' '+x.changeovers+' 次（'+x.changeDates.map(mmdd).join('、')+'）').join('；')+'，每次換款先吃效率',en:'Frequent changeovers: '+chg.map(x=>x.short+' '+x.changeovers+' ('+x.changeDates.map(mmdd).join(', ')+')').join('; ')+' — each one costs efficiency first'});
      if(L.undated)A.push({kind:'undated',sev:3,ref:L.undatedRows.map(x=>x.style).join(', '),who:WHO.plan,zh:'Production Plan 有 '+N(L.undated)+' 筆沒填上線日／下線日（'+L.undatedRows.slice(0,3).map(x=>x.line+' '+x.style+' '+N(x.qty)).join('、')+'），不會進甘特與負荷',en:N(L.undated)+' plan rows have no start/finish date ('+L.undatedRows.slice(0,3).map(x=>x.line+' '+x.style+' '+N(x.qty)).join(', ')+') and are excluded from the Gantt and loading'});
      if(L.smv&&L.smv.missing)A.push({kind:'smv',sev:2,ref:L.smv.missingStyles.join(', '),who:WHO.ie,zh:'本週排單 '+N(L.smv.styles)+' 款中 '+N(L.smv.missing)+' 款沒有正式 SMV（'+L.smv.missingStyles.slice(0,5).join('、')+'），生管只能看件數與日產，容易把高件數低 SMV 與低件數高 SMV 混在一起',en:N(L.smv.missing)+' of '+N(L.smv.styles)+' scheduled styles have no official SMV ('+L.smv.missingStyles.slice(0,5).join(', ')+'); PMC can only see pieces and daily targets'});
      if(L.conc.customers.length&&L.conc.customers[0].share>=60)A.push({kind:'conc',sev:1,ref:L.conc.customers[0].customer,who:WHO.plan,zh:L.conc.month+' 排單 '+L.conc.customers[0].customer+' 一家占 '+pct(L.conc.customers[0].share,0)+(L.conc.styles[0]?'，'+L.conc.styles[0].style+' 單款占 '+pct(L.conc.styles[0].share,0):'')+'；客戶集中度高，能否順利不是看款式數量，而是看該客戶到布與補排是否同步',en:L.conc.customers[0].customer+' alone is '+pct(L.conc.customers[0].share,0)+' of the '+L.conc.month+' plan'+(L.conc.styles[0]?', '+L.conc.styles[0].style+' '+pct(L.conc.styles[0].share,0):'')+'; with this concentration, success depends on that customer\'s fabric readiness and reloading'})}
    else A.push({kind:'noplan',sev:4,ref:'',who:WHO.plan,zh:'本週沒有 Production Plan 排單資料',en:'No Production Plan rows for this week'});
    if(f.shipping.overdueRows)A.push({kind:'ship',sev:5,ref:f.shipping.overdue.map(o2=>o2.po).join(', '),who:WHO.ship,zh:'本週 ETD 已過仍未出貨 '+N(f.shipping.overdueRows)+' 筆／'+N(f.shipping.overdueOpen)+' 件（'+f.shipping.overdue.slice(0,3).map(o2=>o2.cust+' PO '+o2.po+' '+N(o2.open)).join('；')+'）',en:f.shipping.overdueRows+' line(s) past ETD still open, '+N(f.shipping.overdueOpen)+' pcs ('+f.shipping.overdue.slice(0,3).map(o2=>o2.cust+' PO '+o2.po+' '+N(o2.open)).join('; ')+')'});
    if(f.plan&&f.rag.plan==='R')A.push({kind:'plan',sev:5,ref:f.plan.month,who:WHO.plan,zh:f.plan.month+' 排單 '+N(f.plan.planQty)+' 件已完成 '+pct(f.plan.completion)+'（工作日已過 '+pct(f.plan.elapsedShare)+'），餘 '+N(f.plan.remaining)+' 件、剩 '+N(f.plan.workdaysLeft)+' 個工作日，需 '+N(f.plan.requiredPerDay)+' 件／日，高於本週日均 '+N(f.sewing.perDay),en:f.plan.month+' plan '+pct(f.plan.completion)+' complete with '+pct(f.plan.elapsedShare)+' of working days elapsed; '+N(f.plan.remaining)+' pcs over '+N(f.plan.workdaysLeft)+' days = '+N(f.plan.requiredPerDay)+'/day, above the current '+N(f.sewing.perDay)});
    if(f.fabric.noFabricPcs>0)A.push({kind:'fabric',sev:2,ref:f.fabric.top.slice(0,3).map(x=>x.po).join(', '),who:WHO.wh,zh:'無布可做 '+N(f.fabric.noFabricPcs)+' 件'+(f.fabric.noFabricShare!=null?'（占未車縫 '+pct(f.fabric.noFabricShare,0)+'）':'')+'（客戶統計 '+(f.fabric.snapshotDate||'—')+'）'+(f.fabric.top.length?'：'+f.fabric.top.slice(0,3).map(x=>x.customer+' PO '+x.po+' '+N(x.noFabric)).join('；'):''),en:'No fabric for '+N(f.fabric.noFabricPcs)+' pcs'+(f.fabric.noFabricShare!=null?' ('+pct(f.fabric.noFabricShare,0)+' of not-sewn)':'')+' (customer statistics '+(f.fabric.snapshotDate||'—')+')'+(f.fabric.top.length?': '+f.fabric.top.slice(0,3).map(x=>x.customer+' PO '+x.po+' '+N(x.noFabric)).join('; '):'')});
    return A.sort((a,b)=>b.sev-a.sev)}
  function planActions(f){const A=[];const add=(item,req,owner)=>{if(A.length<8)A.push({item,req,owner})};
    f.anomalies.forEach(a=>{const map={empty:['空線補排 Empty lines','把可上線訂單、WIP、已到布新單補進 '+a.ref+'；確定無料再按組別／日期提局部停工 / load ready-to-sew work into '+a.ref+'; request planned idle time only where nothing is executable'],nextEmpty:['下週排單 Next-week loading','本週內完成 '+a.ref+' 的下週排單並確認物料到位 / finish next-week loading for '+a.ref+' and confirm material readiness'],gap:['中途空檔 Mid-week gaps','把空檔天數補排或把相鄰款延伸，避免整組停等 / fill the gap days or extend adjacent runs'],attain:['排單對帳 Plan reconciliation','逐 PO／Style／Line 對帳本週排單與實績，臨時轉線寫回 Production Plan / reconcile per PO/Style/Line and write routing changes back'],change:['換款 Changeovers','同款同色連續排、換款前備好裁片與輔料 / sequence same style-colour together and stage panels and trims before each change'],undated:['補日期 Missing dates','回排產產能模組補上線日／下線日 / add start and finish dates in the plan module'],smv:['補 SMV Missing SMV','IE 補 '+a.ref+' 的正式 SMV，Master Plan 放 SMV 欄 / IE to add official SMV for '+a.ref],conc:['集中度 Concentration','追 '+a.ref+' 的到布與補排節奏 / track fabric arrival and reloading for '+a.ref],ship:['逾期出貨 Overdue shipments','逐 PO 確認 '+a.ref+' 實際裝櫃／船期並更新排程 / confirm actual loading and ETD per PO'],plan:['月末餘量 Month-end balance','逐 PO／Style／Line 重算 '+N(f.plan?f.plan.remaining:0)+' 件餘量並補排 / reconcile and reload the remaining pieces'],fabric:['缺布 No fabric','確認 '+a.ref+' 的布料到廠日並回寫排單 / confirm fabric arrival and write it back to the plan'],noplan:['排單資料 Plan data','匯入最新 Production Plan / import the latest Production Plan']}[a.kind];if(map)add(map[0],map[1],a.who.zh+' / '+a.who.en)});
    return A}
  function planBasis(f){const z=[],e=[];const L=f.loading;
    z.push('排單資料：Production Plan'+(L?'（本週 '+N(L.runs)+' 段排單；同一組同一款連續日期合併為一段，PO 合計）':'（本週無資料）')+'；一組工作一天＝1 組日（line-day）；負荷率＝有排單的組日 ÷ 可用組日（週一至週六，程式不知道假日，可用組日可能高估）。負荷不是 IE 效率。');e.push('Plan source: Production Plan'+(L?' ('+N(L.runs)+' runs this week; one run = one style on one line over consecutive dates, POs merged)':' (no rows this week)')+'; one line working one day = one line-day; loading = scheduled line-days ÷ available line-days (Mon–Sat; the code does not know holidays, so available line-days may be overstated). Loading is not IE efficiency.');
    z.push('本週排單件數＝各段數量按工作天比例攤到本週，是排程暴露量，不是核實餘量；實績＝車縫日報（同一天只認一種來源）。換款＝某款在前一天沒有在該組生產而當天開始；空檔＝該組該工作日沒有任何排單。未填上線日的列不計入。');e.push('Scheduled pieces this week are pro-rated by working days and are schedule exposure, not a verified balance; actual = sewing daily reports (one source per day). A changeover = a style starting on a line where it was not running the day before; a gap = a working day with nothing scheduled on that line. Rows without a start date are excluded.');
    z.push('可上線：客戶統計 '+(f.fabric.snapshotDate||'—')+' 的未車縫／Cutting WIP／No Fabric Available；出貨：出貨排程 ETD 落在本週的列。'+(L&&L.smv?'SMV 覆蓋以正式 SMV 對照本週排單款。':'本次沒有正式 SMV 對照表，不判定缺 SMV。'));e.push('Readiness: customer statistics '+(f.fabric.snapshotDate||'—')+' not-sewn / cutting WIP / No Fabric Available; shipping: schedule rows with ETD in this week.'+(L&&L.smv?' SMV coverage checks scheduled styles against the official SMV list.':' No official SMV list supplied, so SMV gaps are not judged.'));
    z.push('機修、換針與零件不在排單週報內（見效率週報）。所有數字由程式計算；AI（若啟用）只改寫文字，回傳的每個數字都與本表核對。');e.push('Maintenance, needle and part changes are not part of the loading report (see the efficiency weekly). All numbers are computed by code; the AI wording step, if enabled, only rephrases and every number it returns is checked.');
    return {zh:z,en:e}}
  /* ── action table (owners) ── */
  function actions(f){const A=[];const add=(item,req,owner)=>{if(A.length<8)A.push({item,req,owner})};
    f.anomalies.forEach(a=>{const map={ship:['逾期出貨 Overdue shipments','逐 PO 確認 '+a.ref+' 的實際裝櫃／船期，更新出貨排程狀態 / confirm actual loading and ETD per PO, update the schedule'],plan:['月末餘量 Month-end balance','逐 PO／Style／Line 重算 '+N(f.plan?f.plan.remaining:0)+' 件還有哪些未完成；不要把整批到期量當 WIP / reconcile the remaining pieces per PO/Style/Line'],dual:['雙重風險線 Dual-risk lines','把 '+a.ref+' 的效率、QC 退修、返工時間與換款原因放在同一張 Line Action 表 / one line-action sheet with efficiency, rejects, rework time and changeover reasons'],qc:['品質 Quality','追 '+a.ref+' 的 Top defects 與返工；確認是否影響出貨可用量 / follow the top defects and rework on '+a.ref],eff:['低效線 Weak lines','查 '+a.ref+' 的換款、工序平衡、SMV 與人員配置（退修率不高時先不歸給 QC）/ check changeover, line balance, SMV and staffing first'],output:['產量下降 Output drop','以 PO／Style／Line 核對是轉線、款式組合還是 WIP 清理造成 / identify routing, mix or WIP clearing causes'],reconcile:['QC 對帳 Reconciliation','核對 QC 實際產出與車縫日報的差異來源 / reconcile QC output with the sewing report'],needle:['換針異常 Needle anomaly','檢查 '+a.ref+' 的機台、針型與操作（非計畫換針偏高）/ check machines, needle type and handling on '+a.ref],fabric:['缺布 No fabric','確認 '+a.ref+' 的布料到廠日並回寫排單；缺布量 '+N(f.fabric.noFabricPcs)+' 件 / confirm fabric arrival and write it back to the plan'],wip:['WIP 已裁未縫 Cut-not-sewn','按 Line／Style／客戶拆分 '+N(f.wip.cutNotSewn)+' 件並排入車縫 / split by line/style/customer and schedule']}[a.kind];if(map)add(map[0],map[1],a.who.zh+' / '+a.who.en)});
    if(f.riskLines.quality.length&&!f.anomalies.some(a=>a.kind==='qc'))add('高產高退修 High output, high reject','追 '+f.riskLines.quality.join('、')+' 的退修來源，避免高產量變返工 / trace the rejects so output does not turn into rework',WHO.qc.zh+' / '+WHO.qc.en);
    if(!f.plan)add('排單資料 Plan data','本期沒有 Production Plan 月排單可比對；請確認排單已匯入 / no Production Plan month quantity available to compare',WHO.plan.zh+' / '+WHO.plan.en);
    if(f.wip.cutNotSewn==null)add('WIP 快照 WIP snapshot','本期沒有 WIP 數字（需本頁款式資料或客戶統計）/ no WIP figure available this period',WHO.plan.zh+' / '+WHO.plan.en);
    return A}
  /* ── 資料口徑與限制 ── */
  function basis(f){const W=f.period==='week';const z=[],e=[];
    z.push('生產資料：車縫日報 '+N(f.sewing.rows)+' 列（'+N(f.sewing.dayCount)+' 個生產日）；同一天只認日報／目標報表／Daily Output 其中一種來源（與車縫系統一致），沒有資料的日子視為未生產，不補數。');e.push('Production source: '+N(f.sewing.rows)+' sewing daily-report rows ('+N(f.sewing.dayCount)+' production days); one source per day (daily report > target > Daily Output), same rule as the sewing module; days without data are treated as no production, nothing is estimated.');
    z.push('效率公式：加權效率＝Σ標準分鐘 ÷ Σ可用人力分鐘'+(f.sewing.effBasis==='workers'?'（本期日報沒有分鐘數，改用人數加權效率）':'')+'；判讀門檻：全廠 ≥'+TH.effG+'% GREEN、'+TH.effA+'–'+TH.effG+'% AMBER、<'+TH.effA+'% RED；線別 ≥'+TH.lineOk+'% 可接受、'+TH.lineLow+'–'+TH.lineOk+'% 偏低、<'+TH.lineLow+'% 低效。');e.push('Efficiency: weighted efficiency = total standard minutes ÷ total available labor minutes'+(f.sewing.effBasis==='workers'?' (no minutes in this period\'s reports → worker-weighted efficiency)':'')+'; thresholds: plant ≥'+TH.effG+'% GREEN, '+TH.effA+'–'+TH.effG+'% AMBER, <'+TH.effA+'% RED; line ≥'+TH.lineOk+'% acceptable, '+TH.lineLow+'–'+TH.lineOk+'% low, <'+TH.lineLow+'% weak.');
    z.push('品質資料：Final QC '+N(f.qc.reports)+' 份報告'+(f.qc.asOf?'（本日無 QC 報告，採 '+f.qc.date+' 最近一份）':'')+'；退修率＝退修 ÷ 檢驗；退修不再從產量扣除；線別退修 ≥'+TH.lineRejHigh+'% 為高、'+TH.lineRejMid+'–'+TH.lineRejHigh+'% 偏高；雙重風險＝低效且高退修。'+(f.qcReconcile?'QC 實際產出 '+N(f.qcReconcile.qcOutput)+' 件 vs 車縫 '+N(f.qcReconcile.sewing)+' 件：'+(f.qcReconcile.ok?'對帳一致':'不一致，差 '+N(f.qcReconcile.diff))+'。':''));e.push('Quality source: '+N(f.qc.reports)+' Final QC reports'+(f.qc.asOf?' (no QC report on the day; latest report of '+f.qc.date+' used)':'')+'; reject rate = rejected ÷ inspected; rejects are not deducted from output a second time; line reject ≥'+TH.lineRejHigh+'% high, '+TH.lineRejMid+'–'+TH.lineRejHigh+'% elevated; dual risk = weak efficiency and high reject.'+(f.qcReconcile?' QC actual output '+N(f.qcReconcile.qcOutput)+' vs sewing '+N(f.qcReconcile.sewing)+': '+(f.qcReconcile.ok?'reconciles':'does not reconcile, diff '+N(f.qcReconcile.diff))+'.':''));
    z.push(f.plan?'排單：Production Plan '+f.plan.month+' 車縫量 '+N(f.plan.planQty)+' 件（'+N(f.plan.styles)+' 筆）；工作日以週一至週六計，程式不知道假日，剩餘工作日可能高估。':'排單：本期沒有可比對的 Production Plan 月排單。');e.push(f.plan?'Plan: Production Plan '+f.plan.month+' sewing qty '+N(f.plan.planQty)+' pcs ('+N(f.plan.styles)+' rows); working days are Mon–Sat, the code does not know holidays, so remaining working days may be overstated.':'Plan: no Production Plan month quantity available for this period.');
    z.push('出貨：出貨排程 ETD 落在本週（週一至週日）的列；完成率＝已出 ÷ 訂單量；逾期＝ETD 已過且未出。WIP：'+(f.wip.basis==='styles'?'本頁「裁剪中／車縫中」款的已裁－已縫':f.wip.basis==='custstats'?'客戶統計快照的 Cutting WIP':'本期沒有 WIP 快照，不宣稱數字')+'；缺布：客戶統計 '+(f.fabric.snapshotDate||'—')+' 的 No Fabric Available。換針基準＝前 28 天各線非計畫換針日均。');e.push('Shipping: schedule rows with ETD in this week (Mon–Sun); completion = shipped ÷ order qty; overdue = ETD passed and still open. WIP: '+(f.wip.basis==='styles'?'cut minus sewn of the styles in cutting/sewing on this page':f.wip.basis==='custstats'?'Cutting WIP from the customer-statistics snapshot':'no WIP snapshot this period, so no figure is asserted')+'; no-fabric: customer statistics '+(f.fabric.snapshotDate||'—')+' No Fabric Available. Needle baseline = per-line unplanned changes per day over the previous 28 days.');
    z.push('所有數字由程式計算；AI（若啟用）只改寫文字，回傳的每個數字都與本表核對，不符即不採用。');e.push('All numbers are computed by code; the AI wording step (if enabled) only rephrases, and every number it returns is checked against these facts.');
    return {zh:z,en:e}}

  /* ── renderCompact: v1.2 緊湊版（保留給舊測試；Telegram／網頁改用下面的 render v1.3）(compact, 中文一行＋English 一行; opts.lang='zh' → 只有中文) ── */
  function renderCompact(f,opts){opts=opts||{};const ZH=opts.lang==='zh';const L=[],H=[];const b=(s2)=>'<b>'+esc(s2)+'</b>';const W=f.period==='week',PL=f.kind==='plan';
    const bi=(zh,en)=>ZH||!en?zh:zh+' '+en;   // label helper: 中文 or 中文＋English
    const line=(t,html)=>{L.push(t);H.push(html==null?esc(t):html)};
    const pair=(zh,en,prefix)=>{line((prefix||'')+zh,(prefix||'')+esc(zh));if(!ZH){line('  '+en,'  <i>'+esc(en)+'</i>')}};
    const title=(PL?'📋 VRT ':'📰 VRT ')+(PL?bi('週排單與負荷更新','Weekly Loading & Plan Update'):W?bi('生產效率週報','Weekly Efficiency Report'):bi('生產日報','Daily Production Report'))+' · '+f.label;line(title,b(title));
    if(!f.hasData){const m='（'+f.label+(ZH?' 沒有資料）':' 沒有車縫／裁剪／QC／排單資料 · No data）');line(m);return {text:L.join('\n'),html:H.join('\n'),zhChars:0}}
    const R=(k,zh,en)=>bi(zh,en)+' '+(f.rag[k]?RAG_ICON[f.rag[k]]+' '+RAG_ZH[f.rag[k]]:'—');
    const verdict=bi('管理判定','Verdict')+': '+(PL?[R('loading','負荷','Loading'),R('plan','排單','Plan'),R('shipping','出貨','Shipping'),R('ready','可上線','Ready')]:[R('capacity','產能','Capacity'),R('quality','品質','Quality'),R('plan','排單','Plan'),R('shipping','出貨','Shipping'),R('wip','WIP','')]).join(' · ');line(verdict);
    line('1️⃣ '+(PL?bi('管理摘要','Executive summary'):W?bi('管理摘要','Executive summary'):bi('今日重點','Highlights')),b('1️⃣ '+(PL?bi('管理摘要','Executive summary'):W?bi('管理摘要','Executive summary'):bi('今日重點','Highlights'))));
    f.highlights.forEach(h=>pair(h.zh,h.en,'• '));
    if(PL){
      const Ld=f.loading;line('2️⃣ '+bi('關鍵數字','Key numbers'),b('2️⃣ '+bi('關鍵數字','Key numbers')));
      if(Ld){const w=Ld.week,n=Ld.next;
        line(bi('負荷','Loading')+': '+N(w.scheduledLineDays)+'/'+N(w.availableLineDays)+' '+bi('組日','line-days')+' = '+pct(w.loadingPct,0)+' │ '+bi('前週','prev')+' '+(Ld.prev.availableLineDays?pct(Ld.prev.loadingPct,0):'—')+' │ '+bi('下週','next')+' '+pct(n.loadingPct,0));
        line(bi('各組','By line')+': '+w.lines.map(x=>x.short+' '+(x.empty?(ZH?'無排單':'無排單 none'):N(x.scheduledDays)+(ZH?'天':'d')+(x.gapDays?' 空'+x.gapDays:'')+(x.changeovers?' 換'+x.changeovers:''))).join(' · '));
        line(bi('排單 vs 實績','Plan vs actual')+': '+N(Ld.exposure)+' │ '+N(Ld.actual)+' pcs'+(Ld.attainment!=null?' ('+pct(Ld.attainment,0)+(ZH?'，排程暴露量非核實餘量':', exposure not verified balance')+')':''));
        if(Ld.topRuns.length)line(bi('本週主要排單','Main runs')+': '+Ld.topRuns.slice(0,4).map(r=>r.line+' '+r.style+' '+N(r.qty)+(r.pos>1?'('+r.pos+'PO)':'')+' '+mmdd(r.start)+'–'+mmdd(r.end)).join(' · '));
        line(bi('下週','Next week')+' '+mmdd(n.start)+'–'+mmdd(n.end)+': '+N(n.pieces)+' pcs · '+N(n.scheduledLineDays)+'/'+N(n.availableLineDays)+' '+bi('組日','line-days')+(n.emptyLines.length?' · '+bi('尚未排','not loaded')+' '+n.emptyLines.join('、'):'')+(Ld.nextStarts.length?' · '+bi('開工款','starts')+' '+Ld.nextStarts.slice(0,4).map(r=>r.line+' '+r.style+' '+mmdd(r.start)).join('、'):''));
        if(Ld.conc.qty)line(bi('集中度','Concentration')+' '+Ld.conc.month+': '+Ld.conc.customers.slice(0,3).map(c=>c.customer+' '+pct(c.share,0)).join(' · ')+(Ld.conc.styles[0]?' · '+bi('最大款','top style')+' '+Ld.conc.styles[0].style+' '+pct(Ld.conc.styles[0].share,0):''));
        if(Ld.smv)line(bi('SMV 覆蓋','SMV coverage')+': '+N(Ld.smv.styles-Ld.smv.missing)+'/'+N(Ld.smv.styles)+(Ld.smv.missing?' · '+bi('缺','missing')+' '+Ld.smv.missingStyles.slice(0,5).join('、'):''));
        if(Ld.undated)line(bi('未填日期','Undated rows')+': '+N(Ld.undated))}
      if(f.plan)line(bi('月排單','Month plan')+' '+f.plan.month+': '+N(f.plan.mtd)+' / '+N(f.plan.planQty)+' = '+pct(f.plan.completion)+' · '+bi('餘','left')+' '+N(f.plan.remaining)+' · '+bi('剩','')+' '+N(f.plan.workdaysLeft)+' '+bi('工作日','workdays')+' → '+bi('需','need')+' '+N(f.plan.requiredPerDay)+'/'+bi('日','day'));
      line(bi('出貨','Shipping')+'（'+mmdd(f.shipping.weekStart)+'–'+mmdd(f.shipping.weekEnd)+'）: '+(f.shipping.pct!=null?pct(f.shipping.pct,0)+' · '+bi('已出','shipped')+' '+N(f.shipping.shipped)+' / '+bi('計畫','plan')+' '+N(f.shipping.orig)+' · '+bi('未出','open')+' '+N(f.shipping.open)+(f.shipping.overdueRows?' · '+bi('逾期','overdue')+' '+N(f.shipping.overdueRows)+' 筆 '+N(f.shipping.overdueOpen)+' pcs':''):(ZH?'無本週 ETD 資料':'無本週 ETD 資料 no ETD rows')));
      if(f.fabric.hasData)line(bi('可上線','Ready-to-sew')+'（'+(f.fabric.snapshotDate||'—')+'）: '+bi('未車縫','not sewn')+' '+N(f.fabric.notSewn)+' · '+bi('裁片 WIP','cutting WIP')+' '+N(f.fabric.cuttingWip)+' · '+bi('無布','no fabric')+' '+N(f.fabric.noFabricPcs)+(f.fabric.noFabricShare!=null?' ('+pct(f.fabric.noFabricShare,0)+')':''));
    }else{
      const hd='2️⃣ '+bi('關鍵數字','Key numbers')+'（'+(W?bi('本週','week')+' │ '+bi('前週','prev')+' '+(f.prevDay.date?isoWeekKey(f.prevDay.date):'—'):bi('本日','today')+' │ '+(ZH?f.prevDay.label.replace(/ prev /,' '):f.prevDay.label)+' │ '+bi('上週同日','last week')+' '+mmdd(f.lastWeek.date))+'）';line(hd,b('2️⃣ '+bi('關鍵數字','Key numbers'))+esc(hd.slice(hd.indexOf('（'))));
      const row=(zh,en,cur,prev,lw)=>{line(bi(zh,en)+': '+cur+' │ '+prev+(W?'':' │ '+lw))};
      row('產量','Output',N(f.sewing.pieces)+' pcs',f.prevDay.pieces!=null?N(f.prevDay.pieces)+' ('+fmtDelta(f.compare.piecesVsPrev)+')':'—',f.lastWeek.pieces!=null?N(f.lastWeek.pieces)+' ('+fmtDelta(f.compare.piecesVsLastWeek)+')':'—');
      if(W)row('日均','Daily avg',N(f.sewing.perDay)+' pcs ('+N(f.sewing.dayCount)+' '+bi('天','days')+')',f.prevDay.perDay!=null?N(f.prevDay.perDay)+' ('+fmtDelta(f.compare.perDayVsPrev)+')':'—','');
      row('人力','Manpower',N(f.sewing.manpower),f.prevDay.manpower!=null?N(f.prevDay.manpower)+' ('+(f.compare.manpowerVsPrev>=0?'+':'')+N(f.compare.manpowerVsPrev)+')':'—','—');
      row('效率','Efficiency',pct(f.sewing.eff),f.prevDay.eff!=null?pct(f.prevDay.eff)+(f.sewing.eff!=null?' ('+fmtPt(f.sewing.eff,f.prevDay.eff)+')':''):'—',f.lastWeek.eff!=null?pct(f.lastWeek.eff)+(f.sewing.eff!=null?' ('+fmtPt(f.sewing.eff,f.lastWeek.eff)+')':''):'—');
      row('退修率','Reject rate',f.qc.rate!=null?pct(f.qc.rate,2)+' ('+N(f.qc.rejected)+'/'+N(f.qc.inspected)+(f.qc.asOf?', QC '+mmdd(f.qc.date):'')+')':'—',f.qc.prevRate!=null?pct(f.qc.prevRate,2)+' ('+fmtPt(f.qc.rate,f.qc.prevRate)+')':'—',f.qc.lastWeekRate!=null?pct(f.qc.lastWeekRate,2)+' ('+fmtPt(f.qc.rate,f.qc.lastWeekRate)+')':'—');
      row('裁剪','Cutting',N(f.cutting.pieces)+' pcs',f.cutting.prevPieces!=null?N(f.cutting.prevPieces)+' ('+fmtDelta(f.compare.cutVsPrev)+')':'—',f.cutting.lastWeekPieces!=null?N(f.cutting.lastWeekPieces)+' ('+fmtDelta(f.compare.cutVsLastWeek)+')':'—');
      line(bi('WIP 已裁未縫','Cut-not-sewn')+': '+(f.wip.cutNotSewn!=null?N(f.wip.cutNotSewn)+' pcs':'—')+(f.wip.daysOfOutput?'（≈ '+N(f.wip.daysOfOutput)+' '+bi('天產量','days')+'）':'')+(f.wip.basis==='custstats'?(ZH?'（客戶統計 Cutting WIP）':'（客戶統計 Cutting WIP）'):''));
      if(f.plan)line(bi('排單','Plan')+' '+f.plan.month+': '+N(f.plan.mtd)+' / '+N(f.plan.planQty)+' = '+pct(f.plan.completion)+' · '+bi('餘','left')+' '+N(f.plan.remaining)+' · '+bi('剩','')+' '+N(f.plan.workdaysLeft)+' '+bi('工作日','workdays')+' → '+bi('需','need')+' '+N(f.plan.requiredPerDay)+'/'+bi('日','day'));
      line(bi('出貨','Shipping')+'（'+bi('本週','week')+' '+mmdd(f.shipping.weekStart)+'–'+mmdd(f.shipping.weekEnd)+'）: '+(f.shipping.pct!=null?pct(f.shipping.pct,0)+' · '+bi('已出','shipped')+' '+N(f.shipping.shipped)+' / '+bi('計畫','plan')+' '+N(f.shipping.orig)+' · '+bi('未出','open')+' '+N(f.shipping.open)+(f.shipping.overdueRows?' · '+bi('逾期','overdue')+' '+N(f.shipping.overdueRows)+' 筆 '+N(f.shipping.overdueOpen)+' pcs':''):(ZH?'無本週 ETD 資料':'無本週 ETD 資料 no ETD rows')));
      if(W&&f.days.length)line(bi('日別','By day')+': '+f.days.map(d=>mmdd(d.date)+' '+N(d.pieces)+(d.eff!=null?' ('+pct(d.eff,0)+')':'')).join(' · '));
      if(f.lines.length){const bad=f.lines.filter(x=>x.risk!=='normal').slice(0,6);if(bad.length)line(bi('線別風險','Line risks')+': '+bad.map(x=>lineShort(x.line)+' '+(x.eff!=null?pct(x.eff,0):'—')+'/'+(x.rejectRate!=null?pct(x.rejectRate,0):'—')+' '+({dual:bi('雙重','dual'),quality:bi('品質','quality'),capacity:bi('產能','capacity')})[x.risk]).join(' · '))}
      if(f.qc.top.length)line(bi('Top 缺點','Defects')+': '+f.qc.top.slice(0,3).map(x=>x.name+' '+N(x.qty)).join(' · '));
      if(W&&f.loading&&f.loading.week.changeovers)line(bi('換款','Changeovers')+': '+N(f.loading.week.changeovers)+(ZH?' 次':'')+' · '+bi('空檔','gaps')+' '+N(f.loading.week.gapLineDays)+' '+bi('組日','line-days'));
      if(W||f.maint.needle.qty||f.maint.part.qty)line(bi('換針','Needles')+': '+N(f.maint.needle.qty)+'（'+bi('非計畫','unplanned')+' '+N(f.maint.needle.unplanned)+(f.maint.needle.flag.length?'，'+bi('異常','flag')+' '+f.maint.needle.flag.map(x=>lineShort(x.line)).join('、'):'')+'）· '+bi('換件','parts')+' '+N(f.maint.part.qty));
    }
    line('3️⃣ '+bi('異常與建議','Issues & actions'),b('3️⃣ '+bi('異常與建議','Issues & actions')));
    const an=f.anomalies.slice(0,3);if(!an.length)line('• '+bi('無異常','No issues flagged'));
    an.forEach(a=>{line('• '+a.zh+' → 請 '+a.who.zh+' 處理','• '+esc(a.zh)+' → 請 '+esc(a.who.zh)+' 處理');if(!ZH)line('  '+a.en+' → '+a.who.en,'  <i>'+esc(a.en)+' → '+esc(a.who.en)+'</i>')});
    const foot=bi('資料','Data')+': '+(PL?bi('排單','plan')+' '+N(f.loading?f.loading.runs:0)+' '+bi('段','runs')+' · ':'')+bi('車縫','sewing')+' '+N(f.sewing.rows)+' '+bi('列','rows')+(PL?'':' · '+bi('裁剪','cutting')+' '+N(f.cutting.rows)+' · QC '+N(f.qc.reports)+' · '+bi('換針','needles')+' '+N(f.maint.needle.qty)+'（'+bi('非計畫','unplanned')+' '+N(f.maint.needle.unplanned)+'）· '+bi('換件','parts')+' '+N(f.maint.part.qty))+(f.fabric.hasData?' · '+bi('無布','no fabric')+' '+N(f.fabric.noFabricPcs):'')+' · '+bi('產生','generated')+' '+String(f.generatedAt||'').slice(0,16).replace('T',' ')+(f.ai?' · AI '+f.ai.model:'')+' · '+(ZH?'完整分析版見 Word':'完整分析版見 Word / full analysis in the Word export');
    line(foot,'<i>'+esc(foot)+'</i>');
    const text=L.join('\n');return {text,html:H.join('\n'),zhChars:zhCount(text)}}
  /* ── render v1.3 (2026-10-27): Telegram version, 人看得懂的寫法 ──
     原則：一行只講一件事、先結論再數字、術語換白話、「要處理」寫明誰做什麼、最後一行標明資料時間。
     opts.lang='zh' → 只有中文（Telegram 預設）；'both' → 每個重點下面多一行 English（網頁的中＋英切換）。
     數字全部來自 facts（compute），這裡不再計算。舊的緊湊版保留為 renderCompact（Word 匯出與測試仍可用）。 */
  const RAG_WORD={capacity:{G:'產能正常',A:'產能偏低',R:'產能不足'},quality:{G:'品質正常',A:'退修偏高',R:'退修超標'},plan:{G:'月目標正常',A:'月目標略落後',R:'月目標落後'},shipping:{G:'出貨正常',A:'出貨有逾期',R:'出貨逾期多'},wip:{G:'在製正常',A:'在製偏高',R:'在製過高'},loading:{G:'負荷充足',A:'負荷偏低',R:'負荷很低'},ready:{G:'可上線正常',A:'可上線受限',R:'嚴重缺布'}};
  const RAG_WORD_EN={capacity:{G:'capacity OK',A:'capacity low',R:'capacity short'},quality:{G:'quality OK',A:'rejects elevated',R:'rejects high'},plan:{G:'month plan on track',A:'month plan slightly behind',R:'month plan behind'},shipping:{G:'shipping OK',A:'some overdue',R:'many overdue'},wip:{G:'WIP OK',A:'WIP high',R:'WIP very high'},loading:{G:'loading good',A:'loading low',R:'loading very low'},ready:{G:'materials OK',A:'materials limited',R:'severe fabric shortage'}};
  const weekNo=w=>{const m=String(w||'').match(/^(\d{4})-W(\d{2})$/);return m?{y:m[1],n:String(Number(m[2]))}:null};
  const signed=(v,unit)=>v==null?'—':(v>=0?'+':'−')+N(Math.abs(v))+(unit||'');
  const cmpZh=(cur,prev,what)=>{const d=delta(cur,prev);if(d==null)return '';return d>=0?'比'+what+'多 '+Math.abs(d).toFixed(1)+'%':'比'+what+'少 '+Math.abs(d).toFixed(1)+'%'};
  const cmpEn=(cur,prev,what)=>{const d=delta(cur,prev);if(d==null)return '';return (d>=0?'+':'−')+Math.abs(d).toFixed(1)+'% vs '+what};
  function todoLine(a,f){const who=a.who||WHO.plan;const w=who.zh,we=who.en;const r=String(a.ref||'').replace(/, /g,'、');const map={
      empty:['這週沒有排單的 '+r+'，把可上線的訂單、WIP、已到布的新單補進去；真的沒料再按組別／日期提局部停工','load ready-to-sew orders, WIP and newly arrived fabric into '+r+'; request planned idle time only where nothing is executable'],
      nextEmpty:['這週內把下週 '+r+' 的排單填上，並確認物料到位','finish next-week loading for '+r+' this week and confirm materials are ready'],
      gap:[r+' 中途有空檔，補排或把前後的款延長','fill the mid-week gaps on '+r+' or extend the adjacent runs'],
      attain:['本週排單和實績差距大，逐 PO／款／線對帳，臨時轉線寫回排單表','reconcile plan vs actual per PO/style/line and write routing changes back into the plan'],
      change:[r+' 換款太多，同款同色連著排，換款前先備好裁片和輔料','too many changeovers on '+r+': sequence same style-colour together and stage panels and trims first'],
      undated:['排單表有 '+N(f.loading?f.loading.undated:0)+' 列沒填上線／下線日，請補上','add the missing start/finish dates to '+N(f.loading?f.loading.undated:0)+' plan rows'],
      smv:['補 '+r+' 的正式 SMV','add the official SMV for '+r],
      conc:[r+' 佔本月排單比例很高，盯緊它的到布和補排','track fabric arrival and reloading for '+r+' (high concentration)'],
      ship:[r+' 已過 ETD 還沒出，確認實際裝櫃／船期並更新出貨表','PO '+r+' past ETD: confirm actual loading / ETD and update the schedule'],
      plan:['月目標落後，逐 PO 確認餘量 '+N(f.plan?f.plan.remaining:0)+' 件哪些能提前、哪些要跟客戶改期','month plan behind: per PO, decide what can be pulled forward and what needs a new date'],
      fabric:['沒布的 '+N(f.fabric.noFabricPcs)+' 件（'+r+'），跟進到布日並回寫排單','no fabric for '+N(f.fabric.noFabricPcs)+' pcs ('+r+'): confirm fabric arrival and write it back to the plan'],
      noplan:['先把最新的排單表匯入排產產能模組','import the latest Production Plan in the plan & capacity module'],
      dual:[r+' 效率低又退修高，效率、退修、返工、換款原因放同一張表一起處理','treat '+r+' (weak efficiency + high rejects) as one problem: efficiency, rejects, rework and changeover on one sheet'],
      qc:['追 '+r+' 的主要缺點和返工，確認是否影響出貨','follow the top defects and rework on '+r+'; check the impact on shipment-ready output'],
      eff:[r+' 效率低，先查換款、工序平衡、SMV 和人員配置','check changeover, line balance, SMV and staffing on '+r+' first'],
      output:['產量掉了，用 PO／款／線核對是轉線、款式組合還是在清 WIP','identify whether the output drop is routing, style mix or WIP clearing (per PO/style/line)'],
      reconcile:['QC 產出和車縫日報對不上，查差異來源','QC output does not reconcile with the sewing report: find the source of the difference'],
      needle:[r+' 非計畫換針偏高，檢查機台、針型和操作','unplanned needle changes high on '+r+': check machines, needle type and handling'],
      wip:['已裁未縫 '+N(f.wip.cutNotSewn)+' 件，按線／款／客戶拆開排進車縫','split the '+N(f.wip.cutNotSewn)+' cut-not-sewn pcs by line/style/customer and schedule them']}[a.kind];
    if(!map)return {zh:w+'：'+a.zh,en:we+': '+a.en};return {zh:w+'：'+map[0],en:we+': '+map[1]}}
  function renderV13(f,opts){opts=opts||{};const ZH=opts.lang==='zh';const L=[],H=[];const W=f.period==='week',PL=f.kind==='plan';
    const b=s2=>'<b>'+esc(s2)+'</b>';
    const line=(t,html)=>{L.push(t);H.push(html==null?esc(t):html)};
    const P=(zh,en)=>{line('• '+zh);if(!ZH&&en)line('  '+en,'  <i>'+esc(en)+'</i>')};          // one bullet (+ English line)
    const S=(zh,en)=>{line('');line(zh,b(zh));if(!ZH&&en)line('  '+en,'  <i>'+esc(en)+'</i>')};  // section title
    const wk=weekNo(f.week);
    const title=PL?'📋 排單週報｜'+mmdd(f.start)+'–'+mmdd(f.end)+(wk?'（'+wk.y+' 第 '+wk.n+' 週）':''):W?'📰 生產效率週報｜'+mmdd(f.start)+'–'+mmdd(f.end)+(wk?'（'+wk.y+' 第 '+wk.n+' 週）':''):'📰 生產日報｜'+mmdd(f.anchor)+'（'+f.dow+'）';
    line(title,b(title));if(!ZH)line(PL?'Weekly loading & plan · '+f.labelEn:W?'Weekly efficiency report · '+f.labelEn:'Daily production report · '+f.labelEn,'<i>'+esc(PL?'Weekly loading & plan · '+f.labelEn:W?'Weekly efficiency report · '+f.labelEn:'Daily production report · '+f.labelEn)+'</i>');
    if(!f.hasData){line('');line(PL?'這週沒有排單、車縫或出貨資料。':'這'+(W?'週':'天')+'沒有車縫、裁剪、QC 或排單資料。');if(!ZH)line('  No data for this period.','  <i>No data for this period.</i>');return {text:L.join('\n'),html:H.join('\n'),zhChars:0}}
    /* overall line */
    const keys=PL?['loading','plan','shipping','ready']:['capacity','quality','plan','shipping','wip'];
    const ov=keys.filter(k=>f.rag[k]).map(k=>RAG_ICON[f.rag[k]]+' '+RAG_WORD[k][f.rag[k]]);
    line('整體：'+(ov.length?ov.join(' · '):'資料不足'));if(!ZH)line('  Overall: '+(ov.length?keys.filter(k=>f.rag[k]).map(k=>RAG_ICON[f.rag[k]]+' '+RAG_WORD_EN[k][f.rag[k]]).join(' · '):'insufficient data'),'  <i>'+esc('Overall: '+(ov.length?keys.filter(k=>f.rag[k]).map(k=>RAG_ICON[f.rag[k]]+' '+RAG_WORD_EN[k][f.rag[k]]).join(' · '):'insufficient data'))+'</i>');
    const s=f.sewing,c=f.compare,p=f.prevDay;
    if(PL){
      const Ld=f.loading;
      S('本週負荷','Loading this week');
      if(Ld){const w=Ld.week,n=Ld.next;
        P(w.lines[0].short+'–'+w.lines[w.lines.length-1].short+' 共 '+N(w.availableLineDays)+' 組日（'+N(w.lineCount)+' 條線 × '+N(w.workdays)+' 天），排了 '+N(w.scheduledLineDays)+' 組日 = '+pct(w.loadingPct,0)+(Ld.prev.availableLineDays?'（前週 '+pct(Ld.prev.loadingPct,0)+'）':''),w.lines[0].short+'–'+w.lines[w.lines.length-1].short+': '+N(w.scheduledLineDays)+' of '+N(w.availableLineDays)+' line-days scheduled = '+pct(w.loadingPct,0)+(Ld.prev.availableLineDays?' (previous week '+pct(Ld.prev.loadingPct,0)+')':''));
        if(w.emptyLines.length)P('整週沒排單：'+w.emptyLines.join('、')+'（空了 '+N(w.emptyLines.length*w.workdays)+' 個組日）','Nothing scheduled all week: '+w.emptyLines.join(', ')+' ('+N(w.emptyLines.length*w.workdays)+' idle line-days)');
        const gaps=w.lines.filter(x=>!x.empty&&x.gapDays>0);if(gaps.length)P('中途空檔：'+gaps.map(x=>x.short+' '+x.gapDays+' 天（'+x.gaps.map(mmdd).join('、')+'）').join('；'),'Mid-week gaps: '+gaps.map(x=>x.short+' '+x.gapDays+' d ('+x.gaps.map(mmdd).join(', ')+')').join('; '));
        const worst=w.lines.slice().sort((a2,b2)=>b2.changeovers-a2.changeovers)[0];P('換款 '+N(w.changeovers)+' 次'+(worst&&worst.changeovers?'（'+worst.short+' 最多，'+N(worst.changeovers)+' 次）':''),N(w.changeovers)+' changeovers'+(worst&&worst.changeovers?' (most on '+worst.short+': '+N(worst.changeovers)+')':''));
        if(Ld.topRuns.length)P('主要排單：'+Ld.topRuns.slice(0,4).map(r=>r.line+' '+r.style+' '+N(r.qty)+' 件（'+mmdd(r.start)+'–'+mmdd(r.end)+(r.pos>1?'，'+r.pos+' 張 PO':'')+'）').join('、'),'Main runs: '+Ld.topRuns.slice(0,4).map(r=>r.line+' '+r.style+' '+N(r.qty)+' ('+mmdd(r.start)+'–'+mmdd(r.end)+(r.pos>1?', '+r.pos+' POs':'')+')').join(', '));
        S('本週排單 vs 車縫實績','Plan vs actual this week');
        P('排了 '+N(Ld.exposure)+' 件，實際車縫 '+N(Ld.actual)+' 件'+(Ld.attainment!=null?'（'+pct(Ld.attainment,0)+'）':''),'Scheduled '+N(Ld.exposure)+' pcs, sewn '+N(Ld.actual)+' pcs'+(Ld.attainment!=null?' ('+pct(Ld.attainment,0)+')':''));
        P('排單量是整段攤到本週的數字，不是核實的餘量；差距要逐 PO 對帳','The scheduled figure is pro-rated exposure, not a verified balance; reconcile the gap per PO');
        S('下週 '+mmdd(n.start)+'–'+mmdd(n.end),'Next week '+mmdd(n.start)+'–'+mmdd(n.end));
        P((n.loadingPct!=null&&n.loadingPct<TH.loadA?'只排了 ':'排了 ')+pct(n.loadingPct,0)+'（'+N(n.scheduledLineDays)+'/'+N(n.availableLineDays)+' 組日，'+N(n.pieces)+' 件）','Loaded '+pct(n.loadingPct,0)+' ('+N(n.scheduledLineDays)+'/'+N(n.availableLineDays)+' line-days, '+N(n.pieces)+' pcs)');
        if(n.emptyLines.length)P('還沒排：'+n.emptyLines.join('、'),'Not yet loaded: '+n.emptyLines.join(', '));else P('每條線都有排單','Every line has work');
        if(Ld.nextStarts.length)P('開工款：'+Ld.nextStarts.slice(0,5).map(r=>r.line+' '+r.style+'（'+mmdd(r.start)+'）').join('、'),'Starts: '+Ld.nextStarts.slice(0,5).map(r=>r.line+' '+r.style+' ('+mmdd(r.start)+')').join(', '));
        if(Ld.smv&&Ld.smv.missing)P('本週排的 '+N(Ld.smv.styles)+' 款中有 '+N(Ld.smv.missing)+' 款沒有正式 SMV：'+Ld.smv.missingStyles.slice(0,5).join('、'),N(Ld.smv.missing)+' of '+N(Ld.smv.styles)+' scheduled styles have no official SMV: '+Ld.smv.missingStyles.slice(0,5).join(', '));
      }else{P('這週沒有排單表資料，請先在排產產能模組匯入','No Production Plan rows for this week; import the plan in the plan & capacity module first')}
    }else{
      S(W?'車縫（本週）':'車縫','Sewing');
      if(s.rows){
        if(W)P('本週 '+N(s.pieces)+' 件（'+N(s.dayCount)+' 個生產日，日均 '+N(s.perDay)+' 件，平均 '+N(s.manpower)+' 人）','This week '+N(s.pieces)+' pcs ('+N(s.dayCount)+' production days, '+N(s.perDay)+'/day, avg '+N(s.manpower)+' operators)');
        else P('今天 '+N(s.pieces)+' 件（'+N(s.lines)+' 條線、'+N(s.manpower)+' 人）','Today '+N(s.pieces)+' pcs ('+N(s.lines)+' lines, '+N(s.manpower)+' operators)');
        const cz=[],ce=[];if(p.pieces!=null){cz.push(cmpZh(s.pieces,p.pieces,W?'前週':'昨天')+'（'+N(p.pieces)+' 件）');ce.push(cmpEn(s.pieces,p.pieces,W?'previous week':'previous day')+' ('+N(p.pieces)+')')}if(!W&&f.lastWeek.pieces!=null){cz.push(cmpZh(s.pieces,f.lastWeek.pieces,'上週同一天')+'（'+N(f.lastWeek.pieces)+' 件）');ce.push(cmpEn(s.pieces,f.lastWeek.pieces,'same day last week')+' ('+N(f.lastWeek.pieces)+')')}
        if(cz.length)P(cz.join('；'),ce.join('; '));
        if(s.eff!=null){const noteZh=c.effVsPrevPt!=null&&c.effVsPrevPt<0&&c.manpowerVsPrev!=null&&c.manpowerVsPrev>=0?' → 人沒少，是效率掉了':'';const noteEn=noteZh?' → headcount did not fall; efficiency did':'';
          P('效率 '+pct(s.eff)+(p.eff!=null?'（'+(W?'前週':'昨天')+' '+pct(p.eff)+'，'+fmtPt(s.eff,p.eff)+'）':'')+(c.manpowerVsPrev?'；人力 '+signed(c.manpowerVsPrev,' 人'):'')+noteZh,'Efficiency '+pct(s.eff)+(p.eff!=null?' ('+(W?'previous week':'previous day')+' '+pct(p.eff)+', '+fmtPt(s.eff,p.eff)+')':'')+(c.manpowerVsPrev?'; manpower '+signed(c.manpowerVsPrev):'')+noteEn)}
        else P('效率 —（日報沒有工時／人數）','Efficiency — (no minutes / workers in the reports)');
        if(s.topStyles&&s.topStyles.length)P('做最多的款：'+s.topStyles.slice(0,3).map(x=>x.style+' '+N(x.pieces)).join('、'),'Top styles: '+s.topStyles.slice(0,3).map(x=>x.style+' '+N(x.pieces)).join(', '));
        if(W&&f.days&&f.days.length)P('每天：'+f.days.map(d=>mmdd(d.date)+'（'+d.dow+'）'+N(d.pieces)+(d.eff!=null?'／'+pct(d.eff,0):'')).join('、'),'By day: '+f.days.map(d=>mmdd(d.date)+' '+N(d.pieces)+(d.eff!=null?' ('+pct(d.eff,0)+')':'')).join(', '));
      }else P((W?'本週':'今天')+'沒有車縫日報資料','No sewing report data');
      S('裁剪','Cutting');
      if(f.cutting.rows){const cz=[],ce=[];if(f.cutting.prevPieces!=null){cz.push(cmpZh(f.cutting.pieces,f.cutting.prevPieces,W?'前週':'昨天'));ce.push(cmpEn(f.cutting.pieces,f.cutting.prevPieces,W?'previous week':'previous day'))}if(!W&&f.cutting.lastWeekPieces!=null){cz.push(cmpZh(f.cutting.pieces,f.cutting.lastWeekPieces,'上週同一天'));ce.push(cmpEn(f.cutting.pieces,f.cutting.lastWeekPieces,'same day last week'))}
        P((W?'本週':'今天')+' '+N(f.cutting.pieces)+' 件（'+N(f.cutting.tables)+' 張裁床'+(f.cutting.yds?'，用布 '+N(f.cutting.yds)+' 碼':'')+'）'+(cz.length?'；'+cz.join('、'):''),(W?'This week':'Today')+' '+N(f.cutting.pieces)+' pcs ('+N(f.cutting.tables)+' tables'+(f.cutting.yds?', '+N(f.cutting.yds)+' yd':'')+')'+(ce.length?'; '+ce.join(', '):''))}
      else P((W?'本週':'今天')+'沒有裁剪資料','No cutting data');
      if(f.wip.cutNotSewn!=null)P('已裁未縫 '+N(f.wip.cutNotSewn)+' 件'+(f.wip.daysOfOutput?'，約 '+N(f.wip.daysOfOutput)+' 天的車縫量':'')+(f.wip.top.length?'（最多：'+f.wip.top.slice(0,3).map(x=>x.style+' '+N(x.wip)).join('、')+'）':''),'Cut-not-sewn '+N(f.wip.cutNotSewn)+' pcs'+(f.wip.daysOfOutput?' ≈ '+N(f.wip.daysOfOutput)+' days of sewing':'')+(f.wip.top.length?' (largest: '+f.wip.top.slice(0,3).map(x=>x.style+' '+N(x.wip)).join(', ')+')':''));
      S('品質'+(f.qc.rate!=null?'（Final QC '+(W?mmdd(f.start)+'–'+mmdd(f.end):mmdd(f.qc.date))+'）':''),'Quality (Final QC)');
      if(f.qc.rate!=null){
        P('退修率 '+pct(f.qc.rate,2)+'（檢 '+N(f.qc.inspected)+'、退 '+N(f.qc.rejected)+'）'+(f.qc.prevRate!=null?'；'+(W?'前週':'前一次')+' '+pct(f.qc.prevRate,2)+'（'+fmtPt(f.qc.rate,f.qc.prevRate)+'）':'')+(f.qc.asOf?'（今天沒有 QC 報告，用 '+mmdd(f.qc.date)+' 的）':''),'Reject rate '+pct(f.qc.rate,2)+' (inspected '+N(f.qc.inspected)+', rejected '+N(f.qc.rejected)+')'+(f.qc.prevRate!=null?'; previous '+pct(f.qc.prevRate,2)+' ('+fmtPt(f.qc.rate,f.qc.prevRate)+')':'')+(f.qc.asOf?' (no QC report today; latest of '+mmdd(f.qc.date)+')':''));
        if(f.qc.top.length)P('主要缺點：'+f.qc.top.slice(0,3).map(x=>x.name+' '+N(x.qty)).join('、'),'Top defects: '+f.qc.top.slice(0,3).map(x=>x.name+' '+N(x.qty)).join(', '));
        if(f.qcReconcile&&!f.qcReconcile.ok)P('QC 產出 '+N(f.qcReconcile.qcOutput)+' 件和車縫日報 '+N(f.qcReconcile.sewing)+' 件對不上（差 '+N(f.qcReconcile.diff)+'）','QC output '+N(f.qcReconcile.qcOutput)+' does not match sewing '+N(f.qcReconcile.sewing)+' (diff '+N(f.qcReconcile.diff)+')');
      }else P('沒有 Final QC 報告','No Final QC report');
      const bad=f.lines.filter(x=>x.risk!=='normal').slice(0,6);
      if(bad.length)P('要注意的線：'+bad.map(x=>lineShort(x.line)+'（效率 '+(x.eff!=null?pct(x.eff,0):'—')+'／退修 '+(x.rejectRate!=null?pct(x.rejectRate,1):'—')+'，'+({dual:'低效又高退修',quality:'產量好但退修高',capacity:'效率低'})[x.risk]+'）').join('、'),'Lines to watch: '+bad.map(x=>lineShort(x.line)+' ('+(x.eff!=null?pct(x.eff,0):'—')+' / '+(x.rejectRate!=null?pct(x.rejectRate,1):'—')+', '+({dual:'weak + high rejects',quality:'high output, high rejects',capacity:'weak efficiency'})[x.risk]+')').join(', '));
    }
    /* month plan (both kinds) */
    if(f.plan){const pm=String(f.plan.month).slice(5,7).replace(/^0/,'');S(pm+' 月目標','Month plan '+f.plan.month);
      P('已做 '+N(f.plan.mtd)+' / '+N(f.plan.planQty)+' 件（'+pct(f.plan.completion)+'），工作日已過 '+pct(f.plan.elapsedShare),N(f.plan.mtd)+' of '+N(f.plan.planQty)+' pcs done ('+pct(f.plan.completion)+'), '+pct(f.plan.elapsedShare)+' of working days elapsed');
      const over=f.plan.requiredPerDay!=null&&s.perDay>0&&f.plan.requiredPerDay>s.perDay;
      P('剩 '+N(f.plan.workdaysLeft)+' 個工作日，每天要做 '+N(f.plan.requiredPerDay)+' 件'+(over?'才追得上':'就夠')+(s.perDay?'（'+(W?'本週':'目前')+'日均 '+N(s.perDay)+'）':''),N(f.plan.workdaysLeft)+' working days left → '+N(f.plan.requiredPerDay)+' pcs/day needed'+(s.perDay?' (current '+N(s.perDay)+'/day)':''))}
    /* shipping */
    S('出貨 '+mmdd(f.shipping.weekStart)+'–'+mmdd(f.shipping.weekEnd),'Shipping '+mmdd(f.shipping.weekStart)+'–'+mmdd(f.shipping.weekEnd));
    if(f.shipping.pct!=null){P('已出 '+N(f.shipping.shipped)+' / 計畫 '+N(f.shipping.orig)+' 件（'+pct(f.shipping.pct,0)+'），未出 '+N(f.shipping.open)+' 件'+(f.shipping.byCust.length?'：'+f.shipping.byCust.map(x=>x.cust+' '+N(x.open)).join('、'):''),'Shipped '+N(f.shipping.shipped)+' of '+N(f.shipping.orig)+' planned ('+pct(f.shipping.pct,0)+'), open '+N(f.shipping.open)+(f.shipping.byCust.length?': '+f.shipping.byCust.map(x=>x.cust+' '+N(x.open)).join(', '):''));
      if(f.shipping.overdueRows)P('已過 ETD 還沒出：'+N(f.shipping.overdueRows)+' 筆 '+N(f.shipping.overdueOpen)+' 件（'+f.shipping.overdue.slice(0,3).map(o=>o.cust+' PO '+o.po+' '+N(o.open)).join('、')+'）','Past ETD still open: '+N(f.shipping.overdueRows)+' lines, '+N(f.shipping.overdueOpen)+' pcs ('+f.shipping.overdue.slice(0,3).map(o=>o.cust+' PO '+o.po+' '+N(o.open)).join(', ')+')');else P('沒有逾期','No overdue shipments')}
    else P('這週出貨表沒有 ETD 的資料','No ETD rows for this week');
    /* fabric / readiness (plan report; day report only when short) */
    if(f.fabric.hasData&&!PL&&f.fabric.noFabricPcs>0){S('布料','Fabric');P('沒布的 '+N(f.fabric.noFabricPcs)+' 件'+(f.fabric.noFabricShare!=null?'（占未車縫 '+pct(f.fabric.noFabricShare,0)+'）':'')+'，客戶統計 '+(f.fabric.snapshotDate?mmdd(f.fabric.snapshotDate):'—')+(f.fabric.top.length?'；最多：'+f.fabric.top.slice(0,2).map(x=>x.customer+' PO '+x.po+' '+N(x.noFabric)).join('、'):''),'No fabric for '+N(f.fabric.noFabricPcs)+' pcs'+(f.fabric.noFabricShare!=null?' ('+pct(f.fabric.noFabricShare,0)+' of not-sewn)':'')+', customer statistics '+(f.fabric.snapshotDate||'—')+(f.fabric.top.length?'; largest: '+f.fabric.top.slice(0,2).map(x=>x.customer+' PO '+x.po+' '+N(x.noFabric)).join(', '):''))}
    if(f.fabric.hasData&&PL){S('布料與可上線（客戶統計 '+(f.fabric.snapshotDate?mmdd(f.fabric.snapshotDate):'—')+'）','Fabric & readiness (customer statistics '+(f.fabric.snapshotDate||'—')+')');
      if(f.fabric.notSewn!=null)P('未車縫 '+N(f.fabric.notSewn)+' 件，其中 '+N(f.fabric.noFabricPcs)+' 件'+(f.fabric.noFabricShare!=null?'（'+pct(f.fabric.noFabricShare,0)+'）':'')+'還沒有布','Not sewn '+N(f.fabric.notSewn)+' pcs, of which '+N(f.fabric.noFabricPcs)+(f.fabric.noFabricShare!=null?' ('+pct(f.fabric.noFabricShare,0)+')':'')+' have no fabric');
      else P('沒有布的 '+N(f.fabric.noFabricPcs)+' 件','No fabric for '+N(f.fabric.noFabricPcs)+' pcs');
      if(f.fabric.cuttingWip!=null)P('裁片在製 '+N(f.fabric.cuttingWip)+' 件','Cutting WIP '+N(f.fabric.cuttingWip)+' pcs');
      if(f.fabric.top.length)P('缺布最多：'+f.fabric.top.slice(0,3).map(x=>x.customer+' PO '+x.po+' '+N(x.noFabric)).join('、'),'Largest: '+f.fabric.top.slice(0,3).map(x=>x.customer+' PO '+x.po+' '+N(x.noFabric)).join(', '))}
    if(PL&&f.loading&&f.loading.conc.qty){const cc=f.loading.conc;const pm=String(cc.month).slice(5,7).replace(/^0/,'');S('客戶集中度（'+pm+' 月排單）','Customer concentration ('+cc.month+')');
      P(cc.customers.slice(0,3).map(x=>x.customer+' '+pct(x.share,0)).join('、')+(cc.styles[0]?'；最大單款 '+cc.styles[0].style+' 佔 '+pct(cc.styles[0].share,0):''),cc.customers.slice(0,3).map(x=>x.customer+' '+pct(x.share,0)).join(', ')+(cc.styles[0]?'; top style '+cc.styles[0].style+' '+pct(cc.styles[0].share,0):''))}
    /* maintenance (day / efficiency week only) */
    if(!PL&&(f.maint.needle.qty||f.maint.part.qty||W)){S('機修','Maintenance');
      P('換針 '+N(f.maint.needle.qty)+' 支（非計畫 '+N(f.maint.needle.unplanned)+'）、換零件 '+N(f.maint.part.qty)+' 件'+(f.maint.needle.asOf?'（'+(W?'本週':'今天')+'沒有換針紀錄，顯示 '+mmdd(f.maint.needle.date)+'）':''),'Needle changes '+N(f.maint.needle.qty)+' (unplanned '+N(f.maint.needle.unplanned)+'), part changes '+N(f.maint.part.qty));
      if(f.maint.needle.flag.length)P('異常：'+f.maint.needle.flag.slice(0,2).map(x=>lineShort(x.line)+' 非計畫換針 '+N(x.unplanned)+' 支（近 28 天平均 '+N(x.baseline)+' 支／天）').join('、'),'Flag: '+f.maint.needle.flag.slice(0,2).map(x=>lineShort(x.line)+' unplanned '+N(x.unplanned)+' (28-day avg '+N(x.baseline)+'/day)').join(', '))}
    /* to-do */
    S('要處理','To do');
    const an=f.anomalies.slice(0,5);if(!an.length){line('• 沒有需要特別處理的事');if(!ZH)line('  Nothing flagged','  <i>Nothing flagged</i>')}
    an.forEach((a,i)=>{const t=todoLine(a,f);line((i+1)+'. '+t.zh);if(!ZH)line('   '+t.en,'   <i>'+esc(t.en)+'</i>')});
    /* footer: what data this is built from */
    const srcZh=[PL?'排單 '+N(f.loading?f.loading.runs:0)+' 段':'','車縫 '+N(f.sewing.rows)+' 筆',PL?'':'裁剪 '+N(f.cutting.rows)+' 筆',PL?'':'QC '+N(f.qc.reports)+' 份',f.fabric.hasData?'客戶統計 '+(f.fabric.snapshotDate?mmdd(f.fabric.snapshotDate):'—'):''].filter(Boolean);
    const gen=String(f.generatedAt||'').slice(5,16).replace('T',' ').replace('-','/');
    line('');const foot='ℹ️ 資料：'+srcZh.join('、')+'；產生 '+gen+(f.ai?'；AI 改寫':'');line(foot,'<i>'+esc(foot)+'</i>');
    const text=L.join('\n');return {text,html:H.join('\n'),zhChars:zhCount(text)}}
  const zhCount=t=>(String(t||'').match(/[一-鿿]/g)||[]).length;
  /* ══ v2.0 (2026-11-05) 中文人性化版：行事曆、月度比較、接下來、情境寫法 ══
     Paul 11/05：只要中文；排列整齊、易懂；數據清楚正確；不要一套公式寫到完 —— 看行事曆、比較當月／上月／前月，
     考慮接單、出貨、人力與各類事件；至少十來種情境。寫法參考他自己的週報（W44 10 月月結、11 月排單）：
     先講發生什麼、為什麼，再給數字；比較要扣掉假日（用每個生產日來比）；件數和標準工時分開看；每件事寫明誰做什麼、到哪天。
     所有數字仍由這裡的程式算出（compute／enrich），AI 只改寫文字並經 checkAiText 核對。 */
  /* 柬埔寨國定假日（官方公告，2026；工廠臨時調班可用 data.calendar 覆寫：{off:{'yyyy-mm-dd':'名稱'}, on:['yyyy-mm-dd']}） */
  const HOLIDAYS_KH={'2026-01-01':'元旦','2026-01-07':'勝利日','2026-03-08':'婦女節','2026-04-14':'高棉新年','2026-04-15':'高棉新年','2026-04-16':'高棉新年','2026-05-01':'勞動節','2026-05-05':'御耕節','2026-05-14':'國王誕辰','2026-06-18':'太后誕辰','2026-09-24':'憲法日','2026-10-10':'亡人節','2026-10-11':'亡人節','2026-10-12':'亡人節','2026-10-15':'太皇紀念日','2026-10-29':'國王登基日','2026-11-09':'獨立日','2026-11-23':'送水節','2026-11-24':'送水節','2026-11-25':'送水節','2026-12-29':'和平日'};
  /* 工廠實際行事曆（和國定假日不同的地方，出處：Paul 9/29、9/30、10/22、11/18 生產信）。data.calendar 仍可再覆寫。 */
  const FACTORY_CAL={off:{'2026-09-26':'工廠休假（憲法日調休）','2026-10-09':'亡人節','2026-10-13':'亡人節','2026-10-14':'亡人節','2027-01-02':'和平日（調休）'},on:['2026-09-24','2026-10-29','2026-12-29']};
  const baseOff=()=>{const o=Object.assign({},HOLIDAYS_KH,FACTORY_CAL.off);FACTORY_CAL.on.forEach(d=>{delete o[d]});return o};
  let CAL={off:baseOff(),on:{}};
  function setCalendar(c){CAL={off:Object.assign(baseOff(),(c&&c.off)||{}),on:{}};((c&&c.on)||[]).forEach(d=>{CAL.on[d]=1;delete CAL.off[d]})}
  const holidayName=d=>CAL.off[d]||'';
  const isWorkday=d=>!!d&&(CAL.on[d]||(dowMon0(d)<6&&!CAL.off[d]));
  const workdaysCal=(a,b)=>{let n=0;for(let d=a;d&&d<=b;d=addDays(d,1))if(isWorkday(d))n++;return n};
  const zhNum=n=>['零','一','二','三','四','五','六','七','八','九','十'][n]||String(n);
  const md=d=>Number(String(d).slice(5,7))+'/'+Number(String(d).slice(8,10));
  const mdw=d=>md(d)+'（'+DOW_ZH[dowMon0(d)]+'）';
  const monLabel=ym=>Number(String(ym).slice(5,7))+'月';
  const prevYm=ym=>{const p=ymdParts(ym+'-01');return ymdUtc(p[0],p[1]-1,1).slice(0,7)};
  /* holiday runs: consecutive off days sharing a name → {name,start,end,days} */
  function holidayRuns(a,b){const out=[];for(let d=a;d&&d<=b;d=addDays(d,1)){const n=holidayName(d);if(!n||CAL.on[d])continue;const last=out[out.length-1];if(last&&last.name===n&&addDays(last.end,1)===d)last.end=d,last.days++;else out.push({name:n,start:d,end:d,days:1})}return out}
  const runLabel=r=>r.days>1?md(r.start)+'–'+md(r.end)+' '+r.name+'（'+zhNum(r.days)+'天）':mdw(r.start)+' '+r.name;
  function monthStats(sewDays,ym,upto){const rows=Object.keys(sewDays).filter(d=>d.slice(0,7)===ym&&(!upto||d<=upto)).sort().reduce((a,d)=>a.concat(sewDays[d]),[]);if(!rows.length)return null;const g2=sewAgg(rows);
    /* 完成標準工時：日報有 producedMinutes 就用；沒有就用 件數×SMV（和 Paul 週報同一個算法） */
    let em=0,emRows=0;rows.forEach(r=>{const pm=num(r.producedMinutes),sm=num(r.smv);if(pm>0){em+=pm;emRows++}else if(sm>0){em+=num(r.pieces)*sm;emRows++}});const prodMin=emRows>=rows.length*0.8?em:g2.prodMin;
    const earnedH=prodMin>0?Math.round(prodMin/60):null;g2.prodMin=prodMin;return {ym,label:monLabel(ym),pieces:g2.pieces,days:g2.dayCount,perDay:g2.dayCount?Math.round(g2.pieces/g2.dayCount):0,earnedH,earnedHPerDay:earnedH!=null&&g2.dayCount?Math.round(g2.prodMin/60/g2.dayCount):null,eff:g2.eff!=null?Math.round(g2.eff*10)/10:null,manpower:Math.round(g2.manpower),avgSmv:g2.pieces>0&&g2.prodMin>0?Math.round(g2.prodMin/g2.pieces*100)/100:null,garmentShare:g2.pieces?Math.round(g2.garment/g2.pieces*1000)/10:null}}
  function enrich(f,data,sewDays){const A=f.anchor;const W=f.period==='week';const ym=A.slice(0,7),ym1=prevYm(ym),ym2=prevYm(ym1);const upto=W?f.end:A;
    /* 月度比較：本月到今天 vs 上月 vs 前月（每個生產日來比，扣掉假日的影響） */
    const cur=monthStats(sewDays,ym,upto),m1=monthStats(sewDays,ym1),m2=monthStats(sewDays,ym2);
    f.months={cur,prev:m1,prev2:m2,perDayVsPrev:cur&&m1?delta(cur.perDay,m1.perDay):null,ehVsPrev:cur&&m1&&cur.earnedHPerDay!=null&&m1.earnedHPerDay!=null?delta(cur.earnedHPerDay,m1.earnedHPerDay):null,effVsPrevPt:cur&&m1&&cur.eff!=null&&m1.eff!=null?Math.round((cur.eff-m1.eff)*10)/10:null,prevVsPrev2:m1&&m2?{perDay:delta(m1.perDay,m2.perDay),earnedHPerDay:m1.earnedHPerDay!=null&&m2.earnedHPerDay!=null?delta(m1.earnedHPerDay,m2.earnedHPerDay):null,effPt:m1.eff!=null&&m2.eff!=null?Math.round((m1.eff-m2.eff)*10)/10:null,days:m1.days-m2.days}:null};
    /* 行事曆 */
    const mEnd=monthEnd(ym),endRef=W?f.end:A;const afterGap=(()=>{let d=addDays(f.start,-1),gap=[];while(d&&!isWorkday(d)&&gap.length<10){gap.push(d);d=addDays(d,-1)}return gap})();
    const breakNames=[...new Set(afterGap.map(holidayName).filter(Boolean))];
    const ahead=holidayRuns(addDays(endRef,1),addDays(endRef,W?14:10));const thisMonth=holidayRuns(ym+'-01',mEnd);
    const wdLeft=workdaysCal(addDays(endRef,1),mEnd),wdMonth=workdaysCal(ym+'-01',mEnd);
    const nextOff=ahead[0]||null;const wdToNextOff=nextOff?workdaysCal(addDays(endRef,1),addDays(nextOff.start,-1)):null;
    const sewDatesM=Object.keys(sewDays).filter(d=>d.slice(0,7)===ym&&d<=endRef).sort();
    f.cal={afterBreak:afterGap.length>=2||breakNames.length>0?{days:afterGap.length,names:breakNames}:null,ahead,nextOff,wdToNextOff,thisMonth,workdaysLeft:wdLeft,workdaysMonth:wdMonth,productionDaysSoFar:sewDatesM.length,monthStart:sewDatesM.length>0&&sewDatesM.length<=2&&!W,monthEnd:wdLeft<=3,monthLabel:monLabel(ym)};
    /* 用行事曆重算月目標剩餘工作日（排除國定假日） */
    if(f.plan){const left=wdLeft;f.plan.workdaysLeft=left;f.plan.totalWorkdays=wdMonth;f.plan.elapsedWorkdays=wdMonth-left;f.plan.elapsedShare=wdMonth?Math.round((wdMonth-left)/wdMonth*1000)/10:null;f.plan.requiredPerDay=left?Math.round(Math.max(0,f.plan.planQty-f.plan.mtd)/left):null;f.plan.calendar='holidays'}
    /* 接下來：未來 14 天的出貨（ETD）、接單可做幾個月 */
    const ship=(data.shipping||[]).filter(r=>r&&!r._demo);const s14=ship.filter(r=>{const d=anyDate(r.etd);return d&&d>endRef&&d<=addDays(endRef,14)&&num(r.open)>0&&String(r.status||'')!=='shipped'});
    const byKey={};s14.forEach(r=>{const d=anyDate(r.etd),c=String(r.cust||r.customer||'—'),k=d+'|'+c;const x=byKey[k]=byKey[k]||{etd:d,cust:c,open:0,pos:{}};x.open+=num(r.open);x.pos[String(r.po||'')]=1});
    const nextShip=Object.values(byKey).map(x=>({etd:x.etd,cust:x.cust,open:x.open,pos:Object.keys(x.pos).filter(Boolean).length})).sort((a,b)=>a.etd<b.etd?-1:a.etd>b.etd?1:b.open-a.open);
    const cap=m1&&m1.pieces?m1.pieces:null;const ready=f.fabric.notSewn!=null?Math.max(0,f.fabric.notSewn-(f.fabric.noFabricPcs||0)):null;
    f.outlook={nextShip:nextShip.slice(0,6),nextShipPcs:nextShip.reduce((s2,x)=>s2+x.open,0),capacityMonth:cap,capacityLabel:m1?m1.label:'',readyNotSewn:ready,backlogMonths:ready!=null&&cap?Math.round(ready/cap*10)/10:null,notSewnMonths:f.fabric.notSewn!=null&&cap?Math.round(f.fabric.notSewn/cap*10)/10:null};
    /* 客戶統計太舊（超過 14 天）就不拿來判斷缺布和接單月數，改成提醒更新 */
    {const sd=f.fabric.snapshotDate&&/^\d{4}-\d{2}-\d{2}$/.test(f.fabric.snapshotDate)?f.fabric.snapshotDate:'';let age=null;if(sd){age=0;for(let d=sd;d<endRef&&age<400;d=addDays(d,1))age++}
      f.fabric.ageDays=age;f.fabric.stale=age!=null&&age>14;if(f.fabric.stale){f.outlook.backlogMonths=null;f.outlook.readyNotSewn=null}}
    f.manpowerTrend={cur:f.sewing.manpower||null,monthAvg:m1?m1.manpower:null,vsMonthPct:f.sewing.manpower&&m1&&m1.manpower?delta(f.sewing.manpower,m1.manpower):null};
    f.mixShift=f.sewing.avgSmv!=null&&m1&&m1.avgSmv?delta(f.sewing.avgSmv,m1.avgSmv):null;
    /* 資料完整度：今天回報的線數和上個月平均每天的線數比 */
    const typLines=(()=>{const ds=Object.keys(sewDays).filter(d=>d.slice(0,7)===ym1);if(!ds.length)return null;const n=ds.map(d=>new Set(sewDays[d].map(r=>String(r.lineNo||''))).size).sort((a,b)=>a-b);return n[Math.floor(n.length/2)]})();
    f.coverage={lines:f.sewing.lines,typicalLines:typLines,partial:!W&&typLines&&f.sewing.rows?f.sewing.lines<typLines*0.6:false};
    f.scenarios=scenarios(f);f.version=VERSION;return f}
  /* ── 情境：從事實判斷今天是什麼樣的一天；每種情境有自己的開頭寫法（2–3 種說法輪替，不會每天同一句） ── */
  const seedOf=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))>>>0;return h};
  const pick=(arr,key)=>arr[seedOf(key)%arr.length];
  const pts=v=>(v>=0?'+':'−')+Math.abs(v).toFixed(1)+' 點';
  const pctTxt=v=>(v>=0?'多 ':'少 ')+Math.abs(v).toFixed(1)+'%';
  const lineList=ls=>ls.map(lineShort).join('、');
  function scenarios(f){const S=[];const s=f.sewing,c=f.compare,M=f.months||{},cal=f.cal||{},o=f.outlook||{},W=f.period==='week',PL=f.kind==='plan';const when=W?'這週':'今天',prevW=W?'上週':'昨天';const key=f.date;
    const add=(id,w,zh)=>S.push({id,w,zh});
    if(!f.hasData){add('nodata',100,pick([when+'系統裡還沒有車縫、裁剪或 QC 的資料，可能是報表還沒進來。下面先列已知的行事曆和出貨，資料到了會再補一份。',when+'還收不到生產報表，所以沒辦法看產量和效率。先把接下來的假日和出貨列出來，報表進來後系統會重算。'],key));return S}
    const partial=f.coverage&&f.coverage.partial;
    if(partial)add('partial',90,pick([when+'只收到 '+s.lines+' 條線的日報（平常每天 '+f.coverage.typicalLines+' 條），下面的件數、人力和效率都不完整，先不要拿來和昨天比。其他組的報表進來後會再重算。','日報還沒到齊：'+when+'只有 '+s.lines+' 條線（平常 '+f.coverage.typicalLines+' 條）。現在的 '+N(s.pieces)+' 件只是部分數字，等其他組補進來再看。'],key));
    if(cal.afterBreak&&!PL){const nm=cal.afterBreak.names.join('、');add('afterBreak',80,pick([(nm?'剛放完'+nm:'剛休了 '+cal.afterBreak.days+' 天')+'回來，'+when+'是復工'+(W?'週':'第一天')+'。'+(s.rows?'做了 '+N(s.pieces)+' 件'+(s.eff!=null?'，效率 '+pct(s.eff):'')+'。':'')+'假後頭一兩天人到不齊、機台和節奏都要暖，數字先不用和假前硬比。',(nm?nm:'假期')+'結束後'+(W?'這一週':'第一天')+(s.rows?'出了 '+N(s.pieces)+' 件':'')+'。復工通常要一兩天才回到假前的節奏，今天先看出勤和缺料，效率明天再一起看。'],key))}
    if(cal.nextOff&&cal.wdToNextOff!=null&&cal.wdToNextOff<=3){const r=cal.nextOff;add('beforeHoliday',70,pick([runLabel(r)+'要放假，'+(cal.wdToNextOff===0?'明天就放。':'放假前只剩 '+cal.wdToNextOff+' 個工作日。')+'假前要先把裁片、輔料和要出的櫃收好，放假那幾天的產量排單上要扣掉。','再過 '+cal.wdToNextOff+' 個工作日就是'+r.name+'（'+md(r.start)+(r.days>1?'–'+md(r.end):'')+'），各組手上的款最好在假前收尾，別讓半成品放過假。'],key))}
    if(cal.monthStart&&M.prev&&!PL){const p1=M.prev,p2=M.prev2;add('monthStart',75,pick([monLabel(f.anchor.slice(0,7))+'剛開始，先回頭看'+p1.label+'：'+N(p1.pieces)+' 件、'+p1.days+' 個生產日，每天 '+N(p1.perDay)+' 件'+(p1.eff!=null?'，效率 '+pct(p1.eff):'')+(p2&&M.prevVsPrev2&&M.prevVsPrev2.earnedHPerDay!=null?'。和'+p2.label+'比，每個生產日的標準工時'+pctTxt(M.prevVsPrev2.earnedHPerDay)+(M.prevVsPrev2.days?'（生產日'+(M.prevVsPrev2.days>0?'多':'少')+' '+Math.abs(M.prevVsPrev2.days)+' 天）':''):'')+'。',p1.label+'結算 '+N(p1.pieces)+' 件、'+p1.days+' 個生產日'+(p1.earnedH!=null?'，完成標準工時 '+N(p1.earnedH)+' 小時':'')+'。月份天數不同時，用每個生產日來比比較公平'+(p2?'：'+p1.label+'每天 '+N(p1.perDay)+' 件，'+p2.label+' '+N(p2.perDay)+' 件':'')+'。'],key))}
    if(f.plan&&cal.monthEnd&&!PL){const req=f.plan.requiredPerDay;add('monthEnd',65,pick([monLabel(f.plan.month)+'只剩 '+f.plan.workdaysLeft+' 個工作日。目標 '+N(f.plan.planQty)+' 件已做 '+N(f.plan.mtd)+'（'+pct(f.plan.completion)+'）'+(f.plan.remaining?'，還差 '+N(f.plan.remaining)+' 件，每天要 '+N(req)+' 件'+(s.perDay&&req>s.perDay*1.15?'，比現在的日均 '+N(s.perDay)+' 高不少，月底前要先講清楚哪些 PO 會跨月':''):'，已經做到')+'。','月底了，'+monLabel(f.plan.month)+'目標還差 '+N(f.plan.remaining)+' 件、剩 '+f.plan.workdaysLeft+' 個工作日。做不完的部分要按 PO 列出來，和客人、船務先對好交期，不要等到最後一天。'],key))}
    if(f.plan&&f.plan.elapsedShare!=null&&!cal.monthEnd){const gap=f.plan.completion-f.plan.elapsedShare;if(gap<=-10)add('behind',60,pick(['這個月進度落後：時間過了 '+pct(f.plan.elapsedShare,0)+'，目標只做到 '+pct(f.plan.completion,0)+'。剩下 '+f.plan.workdaysLeft+' 個工作日每天要 '+N(f.plan.requiredPerDay)+' 件'+(s.perDay?'，現在日均 '+N(s.perDay):'')+'。',monLabel(f.plan.month)+'目標做到 '+pct(f.plan.completion,0)+'，但工作日已經過了 '+pct(f.plan.elapsedShare,0)+'，差距要靠後面每天多做 '+N(Math.max(0,(f.plan.requiredPerDay||0)-(s.perDay||0)))+' 件來補，或把部分 PO 移到下個月。'],key));else if(gap>=8)add('ahead',30,monLabel(f.plan.month)+'進度比時間快：工作日過了 '+pct(f.plan.elapsedShare,0)+'，目標已做到 '+pct(f.plan.completion,0)+'。後面可以把有布的單提前排，或安排該做的保養。')}
    const mpLow=f.manpowerTrend&&f.manpowerTrend.vsMonthPct!=null&&f.manpowerTrend.vsMonthPct<=-6;
    if(c.effVsPrevPt!=null&&s.eff!=null&&!PL&&!partial){if(c.effVsPrevPt>=3)add('effUp',45,pick([when+'效率 '+pct(s.eff)+'，比'+prevW+' '+pts(c.effVsPrevPt)+'。'+(c.manpowerVsPrev!=null&&c.manpowerVsPrev<=0?'人沒有增加，是做得順了。':'')+(f.lines.length?'表現最好的是 '+f.lines.filter(x=>x.eff!=null).sort((a,b)=>b.eff-a.eff).slice(0,2).map(x=>lineShort(x.line)+' '+pct(x.eff,0)).join('、')+'。':''),'效率回到 '+pct(s.eff)+'（'+prevW+' '+pct(f.prevDay.eff)+'）。'+(f.mixShift!=null&&f.mixShift<=-15?'這次做的款平均工時比上個月短，件數會好看一點，標準工時要一起看。':'各組大致都有跟上。')],key));
      else if(c.effVsPrevPt<=-3){const mpDown=c.manpowerVsPrev!=null&&c.manpowerVsPrev<-5&&!mpLow;const weak=f.lines.filter(x=>x.verdict==='weak'&&x.eff!=null).sort((a,b2)=>a.eff-b2.eff).map(x=>x.line);add('effDown',55,pick([when+'效率 '+pct(s.eff)+'，比'+prevW+'低了 '+Math.abs(c.effVsPrevPt).toFixed(1)+' 點。'+(mpDown?'人少了 '+N(Math.abs(c.manpowerVsPrev))+' 位，先看是請假還是離職。':mpLow?'':'人數差不多，要看是哪幾組拖住。')+(weak.length?'偏低的是 '+lineList(weak.slice(0,3))+'。':''),'效率掉到 '+pct(s.eff)+'。'+(weak.length?lineList(weak.slice(0,3))+' 明顯偏低'+(mpLow?'。':'，'):'')+(mpDown?'出勤也少了 '+N(Math.abs(c.manpowerVsPrev))+' 人。':mpLow?'':'人力沒有少，比較可能是換款、缺料或工序沒排順。')],key))}}
    if(mpLow&&!PL&&!partial)add('manpower',50,'車縫人力 '+N(f.sewing.manpower)+' 人，比'+(M.prev?M.prev.label:'上個月')+'每天平均 '+N(f.manpowerTrend.monthAvg)+' 人'+pctTxt(f.manpowerTrend.vsMonthPct)+'。人少了排單還照原本的件數排，後面每一天都會追得很辛苦，要請 HRA 盤一下缺員和補人進度。');
    if(f.mixShift!=null&&Math.abs(f.mixShift)>=20&&s.rows&&!PL&&!partial)add('mix',35,(f.mixShift<0?'這'+(W?'週':'天')+'做的款比較短工時（平均每件 '+N(s.avgSmv)+' 分，'+(M.prev?M.prev.label:'上月')+' '+N(M.prev.avgSmv)+' 分），件數多不代表做得多，要看標準工時。':'這'+(W?'週':'天')+'做的款工時比較長（平均每件 '+N(s.avgSmv)+' 分，'+(M.prev?M.prev.label:'上月')+' '+N(M.prev.avgSmv)+' 分），件數少一點是正常的，效率才是重點。'));
    if(!PL&&(f.riskLines.dual.length||(f.qc.rate!=null&&f.rag.quality==='R')))add('quality',58,f.riskLines.dual.length?lineList(f.riskLines.dual)+' 效率低、退修又高，同一組兩個問題一起處理，先找出主要缺點是哪一道工序做出來的。':'Final QC 退修率 '+pct(f.qc.rate,1)+'，偏高。'+(f.qc.top.length?'最多的是'+f.qc.top.slice(0,2).map(x=>x.name).join('、')+'。':'')+'退修會吃掉後段的人和時間，要先壓下來。');
    if(f.fabric.noFabricShare!=null&&f.fabric.noFabricShare>=40&&!f.fabric.stale)add('fabric',40,'還沒車縫的單裡，有 '+pct(f.fabric.noFabricShare,0)+'（'+N(f.fabric.noFabricPcs)+' 件）還沒有布。訂單看起來很多，真正能上線的要扣掉這一塊，排單要跟著到布日走。');
    if(f.wip.daysOfOutput!=null&&f.wip.daysOfOutput>=TH.wipR&&!PL)add('wipPile',38,'已裁未縫 '+N(f.wip.cutNotSewn)+' 件，夠車縫做 '+N(f.wip.daysOfOutput)+' 天。裁得比縫得快，裁片放久了容易掉片、混批，裁剪可以先放慢，把人力讓給車縫或後段。');
    if(o.nextShip&&o.nextShip.length)add('shipping',f.shipping.overdueRows?57:42,(f.shipping.overdueRows?'有 '+f.shipping.overdueRows+' 筆已過 ETD 還沒出（'+N(f.shipping.overdueOpen)+' 件），':'')+'接下來兩週要出 '+o.nextShip.length+' 批：'+o.nextShip.slice(0,3).map(x=>md(x.etd)+' '+x.cust+' '+N(x.open)+' 件').join('、')+'。生產順序要跟著船期排。');
    else if(f.shipping.overdueRows)add('shipping',57,'有 '+f.shipping.overdueRows+' 筆已過 ETD 還沒出（'+N(f.shipping.overdueOpen)+' 件），要和船務確認實際裝櫃日，出貨表也要更新。');
    if(o.backlogMonths!=null&&(W||PL)){const b=o.backlogMonths;if(b>=2)add('backlogHigh',44,'有布可做的單 '+N(o.readyNotSewn)+' 件，約等於 '+o.capacityLabel+'實做量的 '+b+' 個月。單已經排到兩個月以後，'+(b>=3?'可以開始考慮加組、招人':'可以考慮加班')+'。');else if(b<1)add('backlogLow',44,'有布可做的單只剩 '+N(o.readyNotSewn)+' 件，不到 '+o.capacityLabel+'一個月的量（'+b+' 個月）。後面要盯接單和到布，排不滿的組先併組，真的沒單再提局部停工。');else add('backlogOk',20,'有布可做的單約 '+b+' 個月的量，屬於正常排的範圍，先補人、不用加班。')}
    if(!S.length||S.every(x=>x.w<40))add('steady',25,pick([when+(s.rows?'做了 '+N(s.pieces)+' 件'+(s.eff!=null?'，效率 '+pct(s.eff):''):'')+'，'+(c.piecesVsPrev!=null?'和'+prevW+'差不多（'+fmtDelta(c.piecesVsPrev)+'）':'沒有特別的狀況')+'。整體平穩，下面只列要盯的幾件事。',when+'沒有大起大落'+(s.rows?'：'+N(s.pieces)+' 件'+(s.eff!=null?'、效率 '+pct(s.eff):''):'')+'。照計畫走就好，留意下面幾條。'],key));
    return S.sort((a,b)=>b.w-a.w)}
  /* ── 中文版（Telegram 預設）：開頭用情境寫一段話，接著整齊的數字，再看月度、各組、接下來、要處理 ── */
  function renderStory(f){const L=[],H=[];const W=f.period==='week',PL=f.kind==='plan';const b=s2=>'<b>'+esc(s2)+'</b>';
    const line=(t,html)=>{L.push(t);H.push(html==null?esc(t):html)};const gap=()=>{if(L.length&&L[L.length-1]!=='')line('')};
    const sec=t=>{gap();line(t,b(t))};const item=(label,val)=>line('・'+label+'　'+val,'・'+b(label)+'　'+esc(val));const bullet=t=>line('・'+t);
    const wk=weekNo(f.week);
    const title=PL?'📋 排單週報｜'+md(f.start)+'–'+md(f.end)+(wk?'（第 '+wk.n+' 週）':''):W?'📅 生產週報｜'+md(f.start)+'–'+md(f.end)+(wk?'（第 '+wk.n+' 週）':''):'📰 生產日報｜'+mdw(f.anchor);
    line(title,b(title));gap();
    const sc=f.scenarios||[];const lead=sc.slice(0,2).map(x=>x.zh);
    /* 開頭沒講到車縫時，先用一句話交代今天的產量 */
    const PROD_IDS=['effUp','effDown','steady','afterBreak','partial','monthEnd','behind','manpower','nodata'];
    if(f.hasData&&!PL&&f.sewing.rows&&!sc.slice(0,2).some(x=>PROD_IDS.includes(x.id))){const s0=f.sewing,p0=f.prevDay;lead.unshift((W?'這週':'今天')+'車縫 '+N(s0.pieces)+' 件'+(s0.eff!=null?'，效率 '+pct(s0.eff):'')+(p0.eff!=null&&s0.eff!=null?'（'+(W?'上週':'昨天')+' '+pct(p0.eff)+'）':'')+'。')}
    line(lead.join(''));
    if(!f.hasData){if(f.cal&&f.cal.ahead.length){sec('接下來');f.cal.ahead.forEach(r=>bullet(runLabel(r)+'放假'))}return finish()}
    const s=f.sewing,c=f.compare,p=f.prevDay,M=f.months||{};
    if(PL){
      /* 排單週報：沿用 v1.3 的負荷段落（數字不變），前面換成情境開頭 */
      const old=renderV13(f,{lang:'zh'});const ol=old.text.split('\n'),oh=old.html.split('\n');let start=ol.findIndex(t=>t.startsWith('整體：'));let end=ol.findIndex(t=>t==='要處理');if(end<0)end=ol.length;
      for(let i=start+1;i<end;i++){const t=ol[i];if(t===''){gap();continue}L.push(t.replace(/^• /,'・'));H.push(oh[i].replace(/^• /,'・'))}
    }else{
      sec(W?'這週的數字':'今天的數字');
      if(s.rows){item('車縫',N(s.pieces)+' 件｜'+N(s.lines)+' 條線｜'+N(s.manpower)+' 人'+(W?'｜'+s.dayCount+' 個生產日，日均 '+N(s.perDay):''));
        if(p.pieces!=null||f.lastWeek.pieces!=null)item('比較',[p.pieces!=null?(W?'上週 ':'昨天 ')+N(p.pieces)+'（'+fmtDelta(c.piecesVsPrev)+'）':'',!W&&f.lastWeek.pieces!=null?'上週同一天 '+N(f.lastWeek.pieces)+'（'+fmtDelta(c.piecesVsLastWeek)+'）':''].filter(Boolean).join('｜'));
        item('效率',s.eff!=null?pct(s.eff)+(p.eff!=null?'（'+(W?'上週':'昨天')+' '+pct(p.eff)+'，'+pts(s.eff-p.eff)+'）':''):'日報沒有工時，算不出來')}
      else item('車縫','還沒有日報');
      if(f.cutting.rows)item('裁剪',N(f.cutting.pieces)+' 件'+(f.cutting.prevPieces!=null?'（'+(W?'上週':'昨天')+' '+N(f.cutting.prevPieces)+'）':''));
      if(f.wip.cutNotSewn!=null)item('已裁未縫',N(f.wip.cutNotSewn)+' 件'+(f.wip.daysOfOutput?'，約 '+N(f.wip.daysOfOutput)+' 天的車縫量':''));
      if(f.qc.rate!=null)item('品質','退修率 '+pct(f.qc.rate,1)+'（檢 '+N(f.qc.inspected)+'、退 '+N(f.qc.rejected)+(f.qc.asOf?'，'+md(f.qc.date)+' 的報告':'')+'）'+(f.qc.top.length?'，最多：'+f.qc.top.slice(0,2).map(x=>x.name+' '+N(x.qty)).join('、'):''));
      else item('品質','沒有 Final QC 報告');
      if(W&&f.days&&f.days.length){sec('每天');f.days.forEach(d=>bullet(md(d.date)+'（'+d.dow+'）　'+N(d.pieces)+' 件'+(d.eff!=null?'　'+pct(d.eff,0):'')+(d.manpower?'　'+N(d.manpower)+' 人':'')))}
      /* 月度比較 */
      if(M.cur||M.prev){sec('跟前幾個月比（以每個生產日計）');const row=m=>m?bullet(m.label+(m===M.cur?'到'+(W?md(f.end):'今天'):'')+'　'+m.days+' 天｜日均 '+N(m.perDay)+' 件'+(m.earnedHPerDay!=null?'｜每天標準工時 '+N(m.earnedHPerDay)+' 小時':'')+(m.eff!=null?'｜效率 '+pct(m.eff):'')):null;
        row(M.cur);row(M.prev);row(M.prev2);
        if(M.cur&&M.prev&&M.ehVsPrev!=null)bullet('本月每天的標準工時比'+M.prev.label+pctTxt(M.ehVsPrev)+(M.effVsPrevPt!=null?'，效率 '+pts(M.effVsPrevPt):'')+(M.cur.days<=3?'（才 '+M.cur.days+' 天，先參考）':''))}
      /* 各組 */
      const withEff=f.lines.filter(x=>x.eff!=null);if(withEff.length>=3){sec('各組');const best=withEff.slice().sort((a,b2)=>b2.eff-a.eff).slice(0,3);const watch=f.lines.filter(x=>x.risk!=='normal'||x.verdict==='weak').slice(0,4);
        bullet('做得好　'+best.map(x=>lineShort(x.line)+' '+pct(x.eff,0)).join('、'));
        if(watch.length)bullet('要盯　'+watch.map(x=>lineShort(x.line)+' '+(x.eff!=null?pct(x.eff,0):'—')+(x.rejectRate!=null&&x.rejVerdict!=='normal'?'（退修 '+pct(x.rejectRate,0)+'）':'')).join('、'))}
    }
    /* 接下來：月目標、假日、出貨、接單 */
    sec('接下來');
    if(f.plan)bullet(monLabel(f.plan.month)+'目標　已做 '+N(f.plan.mtd)+' / '+N(f.plan.planQty)+' 件（'+pct(f.plan.completion,0)+'），剩 '+f.plan.workdaysLeft+' 個工作日'+(f.plan.remaining?'，每天要 '+N(f.plan.requiredPerDay)+' 件'+(s.perDay?'（目前日均 '+N(s.perDay)+'）':''):''));
    if(f.cal){const hs=f.cal.ahead;if(hs.length)bullet('假日　'+hs.map(runLabel).join('；'));else if(f.cal.thisMonth.length)bullet('假日　'+f.cal.monthLabel+'的假（'+f.cal.thisMonth.map(r=>md(r.start)+(r.days>1?'–'+md(r.end):'')+' '+r.name).join('、')+'）都已經過了')}
    const o=f.outlook||{};if(o.nextShip&&o.nextShip.length)bullet('出貨　'+o.nextShip.slice(0,4).map(x=>md(x.etd)+' '+x.cust+' '+N(x.open)+' 件').join('；'));else if(f.shipping.rows)bullet('出貨　這週 '+N(f.shipping.shipped)+' / '+N(f.shipping.orig)+' 件已出'+(f.shipping.overdueRows?'，逾期 '+f.shipping.overdueRows+' 筆':''));
    if(f.shipping.overdueRows)bullet('逾期　'+f.shipping.overdue.slice(0,3).map(x=>x.cust+' PO '+x.po+' '+N(x.open)+' 件（ETD '+md(x.etd)+'）').join('；'));
    if(o.backlogMonths!=null&&(W||PL))bullet('接單　有布可做 '+N(o.readyNotSewn)+' 件 ≈ '+o.backlogMonths+' 個月（以'+o.capacityLabel+'實做 '+N(o.capacityMonth)+' 件計）');
    if(f.fabric.stale&&f.fabric.hasData)bullet('缺布　客戶統計停在 '+md(f.fabric.snapshotDate)+'（已 '+f.fabric.ageDays+' 天），缺布和接單數字先不看，請匯入最新的客戶統計');
    else if(f.fabric.noFabricPcs>0)bullet('缺布　'+N(f.fabric.noFabricPcs)+' 件'+(f.fabric.top.length?'（'+f.fabric.top.slice(0,2).map(x=>x.customer+' '+x.po).join('、')+'）':''));
    /* 要處理 */
    sec('要處理');const an=f.anomalies.filter(a=>!(f.fabric.stale&&a.kind==='fabric')).slice(0,5);if(f.fabric.stale&&f.fabric.hasData)an.push({kind:'_stale',who:WHO.plan,zh:'客戶統計停在 '+md(f.fabric.snapshotDate)+'，請匯入最新的客戶統計（缺布、未車縫、接單月數才會準）',en:''});if(!an.length)bullet('沒有特別要處理的事');an.forEach((a,i)=>{const t=todoLine(a,f);line((i+1)+'. '+t.zh)});
    return finish();
    function finish(){const srcZh=[f.sewing.rows?'車縫 '+N(f.sewing.rows)+' 筆':'',f.cutting.rows?'裁剪 '+N(f.cutting.rows)+' 筆':'',f.qc.reports?'QC '+N(f.qc.reports)+' 份':'',f.fabric.hasData&&f.fabric.snapshotDate?'客戶統計 '+md(f.fabric.snapshotDate):''].filter(Boolean);
      const gen=String(f.generatedAt||'').slice(5,16).replace('T',' ').replace('-','/');gap();const foot='資料：'+(srcZh.join('、')||'—')+'；產生 '+gen;line(foot,'<i>'+esc(foot)+'</i>');
      const text=L.join('\n');return {text,html:H.join('\n'),zhChars:zhCount(text)}}
  }
  /* ── 寫作規則（給 AI；程式版也照這個寫）：取自 Paul 的週報與 human-writing 的五條規則 ── */
  const STYLE_ZH=[
    '你在幫 VRT 成衣廠的廠協理寫每天發到生產群組的報告。讀的人是組長、生管、QC、倉庫和台北的主管，要一眼看懂今天發生什麼、為什麼、誰要做什麼。',
    '只寫繁體中文，不要英文句子（客戶名、款號、PO、Line 照原樣）。',
    '先講發生了什麼和原因，再給數字。判斷直接說，依據放在旁邊。',
    '不要用「不是A，而是B」「與其說」「真正的問題是」「值得注意的是」「說白了」「先說結論」這類翻案或套話；不要三項以上的整齊排比；不要用破折號；不要黑話（賦能、抓手、閉環、底層邏輯）。',
    '句子先交出主幹：誰、做了什麼、多少，再補原因。長短句交錯，平常的地方用平常的句子結束，不要每段都用一句口號收尾。',
    '月份之間比較要用每個生產日來比（假日會讓月總量自然變少）；件數和標準工時分開看（短工時的款件數多、工時少）；退修率是檢驗紀錄，不能直接從產量扣。',
    '要處理的事寫明哪一組／哪張 PO、誰負責（車縫主管、生管、QC、倉庫、船務、HRA、IE）。日期只能用事實裡已經有的日期（假日、出貨日、資料日期），不要自己訂期限。',
    '不要用「不是…」來對比解釋原因，直接說原因。',
    '資料沒有的不要猜，不知道就說「資料還沒進來」。數字一個都不能改，也不能自己算新的數字。',
    /* v2.1（11/24，照 Paul 7–11 月 24 封生產信，完整規則在 PSJERP/PROD_REPORT_PLAYBOOK.md、vrt-report-style-v1.js） */
    '補標／改標／拆箱換標的組，新車縫 0 件不是閒置，寫「補標支援」，效率另看；舊半成品只補商標的件數會讓效率偏高，不和完整車縫比。',
    '日報每天的半成品（缺商標、缺鈕扣）是當天快照，不同天不能相加；QC 檢驗－完成－不良的差額也不是期末 WIP。',
    '排單負荷（組日）不是效率、也不是產能利用率；排單和實際做的款或組別不同，先寫「要回寫排單」，不寫成生產做錯；大單分批出貨就用分批目標判斷。',
    '有人上班但 0 產出的組也算在效率分母裡（程式已經這樣算）；效率週報的百分比照程式給的兩位小數。'
  ].join('\n');
  /* 參考：Paul 自己寫的報告片段（只學語氣，不抄數字） */
  const STYLE_SAMPLES='範例一（月結）：10月有亡人節假期，生產日由9月25天降至21天，月完成標準工時少了是合理的；但每日完成標準工時由645增至661小時，效率由29.6%升至30.8%，按工作日看反而小幅改善。\n範例二（線別）：10/31第6、8組新車縫數為0，兩組其實在做既有成品拆包、換標和熱轉印，應記入補標工序，不能算成車縫閒置。\n範例三（排單）：前半月合理，11個組都有物料齊全的單；後半月靠11/13那櫃布，到廠當天驗布、11/14裁、11/16上線比較實際。\n範例四（行動）：HRA核實車縫缺員，第5組26、第6組23、第7組27人，先補到28–29人。';
  function aiPromptZh(f,opts){opts=opts||{};const base=renderStory(f);const W=f.period==='week',PL=f.kind==='plan';const nameZh=PL?'排單週報':W?'生產週報':'生產日報';
    const sc=(f.scenarios||[]).slice(0,4).map(x=>'• '+x.id+'：'+x.zh).join('\n');
    const system='你是 VRT 成衣廠的生產助理。'+STYLE_ZH+'\n\n'+STYLE_SAMPLES+'\n\n只輸出報告本文。';
    const user='【今天的情境（程式判斷，依重要度排序）】\n'+(sc||'• 平穩')+'\n\n【事實 JSON（唯一的數字來源）】\n'+JSON.stringify(slim(f))+'\n\n【程式版'+nameZh+'（版面與數字照用）】\n'+base.text+'\n\n【要求】\n1. 第一行照用標題「'+base.text.split('\n')[0]+'」。\n2. 標題下寫一段 2–4 句的開頭，用情境的角度講今天（或這週）是怎樣的一天，像廠協理在群組裡跟大家說話。\n3. 接著保留程式版的各段標題與「・」數字行（可以刪掉不重要的行，但不能改數字、不能加新數字）。\n4. 「要處理」最多 4 點，寫明誰做什麼。\n5. 最後一行照用「資料：…」那一行。\n6. 全文約 '+(W||PL?'500':'300')+' 個中文字以內。';
    return {system,user,maxTokens:opts.maxTokens||(W||PL?2200:1400)}}

  /* v2.0: lang 'zh' (Telegram default, 網頁中文) → 人性化中文版；'both' → v1.3 中＋英 */
  function render(f,opts){opts=opts||{};return opts.lang==='zh'&&f.scenarios?renderStory(f):renderV13(f,opts)}
  /* AI 文字 → Telegram HTML：標題與段落標題加粗 */
  function aiHtml(text){return esc(text).split('\n').map((t,i)=>{const plain=t.trim();return plain&&(i===0||(!/^[・•\d]/.test(plain)&&plain.length<=24&&!/[。，；：]/.test(plain)))?'<b>'+t+'</b>':t}).join('\n')}

  /* ── AI wording step (optional): prompt + number check ── */
  function factNumbers(f){const set=new Set();const add=v=>{if(v==null||!isFinite(v))return;const n=Number(v);[n,Math.round(n),Math.round(n*10)/10,Math.round(n*100)/100].forEach(x=>{set.add(String(x));set.add(x.toLocaleString('en-US'));set.add(Math.abs(x).toFixed(1));set.add(Math.abs(x).toFixed(2));set.add(Math.abs(x).toFixed(0));set.add(String(Math.abs(x)))})};
    (function walk(o){if(o==null)return;if(typeof o==='number')add(o);else if(typeof o==='string'){for(const m of o.matchAll(/\d[\d,]*(?:\.\d+)?/g)){const raw=m[0].replace(/,/g,'');set.add(raw);const n=Number(raw);if(isFinite(n))set.add(String(n))}}else if(Array.isArray(o))o.forEach(walk);else if(typeof o==='object')Object.keys(o).forEach(k=>{if(k==='generatedAt'||k==='version')return;walk(o[k])})})(f);   // strings: style / PO / line codes are facts too
    Object.values(f.compare||{}).forEach(add);Object.values(TH).forEach(add);[1,2,3,7,15,28].forEach(add);return set}
  function checkAiText(text,f){const allowed=factNumbers(f);const bad=[];
    const scrub=String(text||'').replace(/\d{4}-W\d{2}/g,' ').replace(/\d{4}-\d{2}-\d{2}/g,' ').replace(/\d{4}-\d{2}\b/g,' ').replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g,' ').replace(/\b(?:19|20)\d{2}\b/g,' ').replace(/\b\d{1,2}[\/\-]\d{1,2}\b/g,' ').replace(/\bPO\s*#?\s*[A-Za-z0-9\-]+/gi,' ').replace(/\bLine\s*[A-Za-z0-9\-]+/gi,' ').replace(/\bL\d{1,2}\b/g,' ').replace(/\b[A-Z]{1,4}\d{2,}[A-Z0-9\-]*\b/g,' ').replace(/[1-9]️⃣/g,' ');
    for(const m of scrub.matchAll(/[-−+]?\d[\d,]*(?:\.\d+)?/g)){const raw=m[0].replace(/[−+\-]/g,'').replace(/,/g,'');if(raw===''||/^0+$/.test(raw))continue;const n=Number(raw);if(!isFinite(n))continue;if(allowed.has(raw)||allowed.has(String(n))||allowed.has(n.toLocaleString('en-US')))continue;bad.push(m[0])}
    /* v2.1：有載寫法模組（vrt-report-style-v1.js）就順便列出寫法問題（不擋發送，只給檢查用） */
    let style=[];try{if(g.VRTReportStyle)style=g.VRTReportStyle.lint(text).map(z=>({id:z.id,msg:z.msg,text:z.text}))}catch(e){}
    return {ok:bad.length===0,bad:[...new Set(bad)],style}}
  // generic check for the per-module AI summaries (D2): every number in the AI text must already appear in the computed input text
  function checkNumbersAgainstText(out,inText){const have=new Set();const plainIn=String(inText||'').replace(/<[^>]+>/g,'');for(const m of plainIn.matchAll(/\d[\d,]*(?:\.\d+)?/g)){const raw=m[0].replace(/,/g,'');have.add(raw);const n=Number(raw);if(isFinite(n)){have.add(String(n));have.add(n.toLocaleString('en-US'))}}
    const scrub=String(out||'').replace(/\d{4}-\d{2}-\d{2}/g,' ').replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g,' ').replace(/[1-9]️⃣/g,' ');const bad=[];
    for(const m of scrub.matchAll(/\d[\d,]*(?:\.\d+)?/g)){const raw=m[0].replace(/,/g,'');if(/^0+$/.test(raw)||raw==='1'||raw==='2'||raw==='3')continue;const n=Number(raw);if(have.has(raw)||have.has(String(n))||have.has(n.toLocaleString('en-US')))continue;bad.push(m[0])}
    return {ok:bad.length===0,bad:[...new Set(bad)]}}
  const STYLE_GUIDE='寫法照工廠既有的管理報告（VRT 生產產能週報／10 月排單更新）：先講事實再下管理判定（「本週不是…，而是…」「更大的問題在月末」「真正需要控制的是」），再給數據；段落式敘述而不是制式條列；明確區分概念（排單負荷≠效率、件數≠標準工時、退修不再從產量扣除、排單是暴露量不是核實餘量）；指出線別的雙重風險（低效＋高退修）與「高產但高退修」；該說「不能據此斷定」就說，資料沒有的不猜；每個異常寫明線別／PO／日期與建議負責人。\nFollow the factory\'s management-report style (VRT weekly capacity report / October loading update): verdict and conclusion first, then the numbers; every point one Chinese line + one English line; keep concepts apart (loading ≠ efficiency, piece count ≠ standard minutes, rejects are not deducted from output twice); call out dual-risk lines (weak efficiency + high reject) and high-output/high-reject lines; say when the data does not support a claim and never guess missing data; name the line / PO and the owner for every issue.';
  function aiPrompt(f,opts){opts=opts||{};if(opts.lang==='zh'&&f.scenarios)return aiPromptZh(f,opts);const base=renderV13(f,{lang:opts.lang});const W=f.period==='week',PL=f.kind==='plan',ZH=opts.lang==='zh';const nameZh=PL?'排單週報':W?'效率週報':'日報';
    const system='你是 VRT 成衣廠的生產助理。你只能改寫文字，絕對不能自己計算、推算、四捨五入或補充任何數字；所有數字必須逐字沿用「事實 JSON」與「規則版」中已出現的數字（含百分比、件數、天數、線別、PO）。不得新增事實 JSON 沒有的結論。只輸出報告本文，不要加說明。\nYou are the production assistant of VRT garment factory. You only rephrase; you must never compute, derive, round or add any number — copy every number verbatim from the facts JSON / rule-based report. No claims beyond the facts. Output the report body only.\n'+STYLE_GUIDE;
    const user='【事實 JSON Facts】\n'+JSON.stringify(slim(f))+'\n\n【規則版'+nameZh+' Rule-based report（格式與數字都要沿用 keep layout and numbers）】\n'+base.text+'\n\n【要求 Requirements】\n1. 保持段落：管理判定一行、1️⃣ '+(W?'管理摘要':'今日重點')+' 3 點、2️⃣ 關鍵數字（逐行照抄 copy the table lines verbatim）、3️⃣ 異常與建議 最多 3 點（每點寫明線別或 PO、建議找誰 who）。'+(ZH?'只寫中文，不要英文。':'每點中文一行＋English 一行。')+'\n2. 中文總字數約 '+(W?'450':'250')+' 字以內 (about '+(W?'450':'250')+' Chinese characters max)。\n3. 語氣照工廠既有報告：先講事實再講判定，用「不是…而是…」「不能據此斷定」「真正要控制的是」這類句子說明因果與限制；'+(PL?'排單負荷≠效率、排單是暴露量不是核實餘量、空檔與換款要點名組別與日期；不提機修。':'件數≠標準工時、退修不再從產量扣除、雙重風險線要點名；')+'避免制式條列腔，但數字一個都不能改 — numbers must stay identical.';
    return {system,user,maxTokens:opts.maxTokens||(W?2000:1200)}}
  function slim(f){const c=JSON.parse(JSON.stringify(f));delete c.generatedAt;delete c.basis;if(c.sewing)c.sewing.byLine=(c.sewing.byLine||[]).slice(0,12);if(c.lines)c.lines=c.lines.slice(0,12);return c}

  /* ── Word export: full management report (HTML that Word opens as a document, .doc) ── */
  function docHtml(f,text,opts){opts=opts||{};const W=f.period==='week';const tgText=String(text||'');
    const ragCell=(r,label)=>'<td style="background:'+(r==='G'?'#dcfce7':r==='A'?'#fef3c7':r==='R'?'#fee2e2':'#f1f5f9')+';border:1px solid #cbd5e1;padding:8px;text-align:center;font-size:10pt"><b>'+esc(label)+'</b><br>'+(r?RAG_ZH[r]:'—')+'</td>';
    const tile=(zh,en,val)=>'<td style="border:1px solid #cbd5e1;padding:8px;text-align:center;font-size:10pt;background:#f8fafc"><b>'+esc(zh)+'</b><br><span style="color:#64748b">'+esc(en)+'</span><br><span style="font-size:13pt;font-weight:bold">'+esc(val)+'</span></td>';
    const para=(zh,en)=>'<p style="margin:4pt 0 2pt 0;font-size:10.5pt">'+esc(zh)+'</p><p style="margin:0 0 8pt 0;font-size:10pt;color:#475569"><i>'+esc(en)+'</i></p>';
    const h=(t)=>'<h2 style="font-size:12.5pt;margin:14pt 0 6pt 0;color:#1e3a8a;border-bottom:1px solid #cbd5e1;padding-bottom:2pt">'+esc(t)+'</h2>';
    const tbl=(head,rows)=>'<table border="1" cellpadding="4" style="border-collapse:collapse;font-size:9.5pt;width:100%;margin:4pt 0 8pt 0"><tr style="background:#e2e8f0">'+head.map(x=>'<th style="text-align:left">'+esc(x)+'</th>').join('')+'</tr>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c==null?'—':c)+'</td>').join('')+'</tr>').join('')+'</table>';
    const VZH={ok:'可接受 / Acceptable',low:'偏低 / Low',weak:'低效 / Weak'},RZH={dual:'雙重風險 / Dual risk',quality:'品質風險 / Quality risk',capacity:'產能風險 / Capacity risk',normal:'一般 / Normal'};
    const shell=(body,titleZh,titleEn)=>'<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>VRT '+esc(titleZh)+' '+esc(f.label)+'</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]--><style>body{font-family:"Microsoft JhengHei","Noto Sans TC",Calibri,sans-serif;font-size:10.5pt}td,th{vertical-align:top}</style></head><body>'+body+'</body></html>';
    const footer=()=>(tgText?h('附：Telegram 摘要版 | Appendix: Telegram summary')+'<pre style="font-size:9pt;white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:8px">'+esc(tgText)+'</pre>':'')+'<p style="font-size:9pt;color:#777;margin-top:10pt">VRT Internal Management Report | '+esc(f.label)+' | 數字由程式計算 Numbers computed by code · '+esc(String(f.generatedAt||'').slice(0,16).replace('T',' '))+'</p>';
    if(f.kind==='plan'){
      /* ── 排單週報 Word version (照 10 月排單更新的寫法) ── */
      const Ld=f.loading;let n=0;const sec=t=>h(['一','二','三','四','五','六','七','八','九','十','十一','十二'][n]+'、'+t.zh+' | '+(++n)+'. '+t.en);let s='';
      s+='<p style="font-size:15pt;font-weight:bold;margin:0">VRT 週排單、負荷與出貨更新</p><p style="font-size:12pt;font-weight:bold;margin:0 0 4pt 0;color:#334155">VRT Weekly Production Loading, Plan Change & Shipping Update</p>';
      s+='<p style="font-size:9.5pt;color:#64748b;margin:0 0 10pt 0">分析週期 / Reporting period: '+esc(f.label)+' | 資料截至 data through '+esc(f.end)+' | 來源 Production Plan / Daily Output / Shipping / Customer Statistics | 產生 generated '+esc(String(f.generatedAt||'').slice(0,16).replace('T',' '))+'</p>';
      const w=Ld?Ld.week:null,nx=Ld?Ld.next:null;
      s+='<table style="border-collapse:collapse;width:100%"><tr>'+tile('本週負荷','Week loading',w?pct(w.loadingPct,0)+' ('+N(w.scheduledLineDays)+'/'+N(w.availableLineDays)+' 組日)':'—')+tile('本週排單','Scheduled pcs',Ld?N(Ld.exposure)+' pcs':'—')+tile('車縫實績','Sewn',N(f.sewing.pieces)+' pcs')+tile('換款／空檔','Changeovers / gaps',w?N(w.changeovers)+' / '+N(w.gapLineDays)+' 組日':'—')+tile('下週負荷','Next week',nx?pct(nx.loadingPct,0):'—')+tile('月排單完成','Month plan',f.plan?pct(f.plan.completion)+' ('+N(f.plan.mtd)+'/'+N(f.plan.planQty)+')':'—')+'</tr><tr>'+ragCell(f.rag.loading,'負荷 Loading')+ragCell(f.rag.plan,'排單 Plan')+ragCell(f.rag.shipping,'出貨 Shipping')+ragCell(f.rag.ready,'可上線 Ready')+ragCell(nx?rag(nx.loadingPct,TH.loadG,TH.loadA,true):null,'下週 Next week')+ragCell(null,'機修 → 效率週報')+'</tr></table>';
      s+='<table style="border-collapse:collapse;width:100%;margin-top:8pt"><tr><td style="border:1px solid #94a3b8;background:#f8fafc;padding:8px"><b>管理結論 Management Conclusion</b><br>'+esc(f.conclusion.zh)+'<br><i style="color:#475569">'+esc(f.conclusion.en)+'</i></td></tr></table>';
      s+=sec({zh:'本週排單負荷：組日怎麼算',en:'Week Loading in Line-days'});
      if(w){s+=para('一個組工作一天＝1 個組日（line-day）；負荷率＝已排款式占用的組日 ÷ 可用組日，它不是 IE 效率。本週 '+w.lines[0].short+'–'+w.lines[w.lines.length-1].short+' 共 '+N(w.lineCount)+' 組、'+N(w.workdays)+' 個工作日，可用 '+N(w.availableLineDays)+' 組日；主排單占 '+N(w.scheduledLineDays)+' 組日，負荷 '+pct(w.loadingPct,0)+'（前週 '+(Ld.prev.availableLineDays?pct(Ld.prev.loadingPct,0):'—')+'）。','One line working one day = one line-day; loading = scheduled line-days ÷ available line-days, which is not IE efficiency. This week '+w.lines[0].short+'–'+w.lines[w.lines.length-1].short+' ('+N(w.lineCount)+' lines × '+N(w.workdays)+' working days) provide '+N(w.availableLineDays)+' line-days; the master plan occupies '+N(w.scheduledLineDays)+', or '+pct(w.loadingPct,0)+' (previous week '+(Ld.prev.availableLineDays?pct(Ld.prev.loadingPct,0):'—')+').');
        s+=tbl(['組別 Line','排單天 Days','空檔 Gap days','換款 Changeovers','排單件 Scheduled','實績 Sewn','達成 Attain.','款式 Styles','判讀 Reading'],w.lines.map(x=>[x.short,N(x.scheduledDays),x.gapDays?N(x.gapDays)+(x.gaps.length?'（'+x.gaps.map(mmdd).join('、')+'）':''):'0',x.changeovers?N(x.changeovers)+'（'+x.changeDates.map(mmdd).join('、')+'）':'0',N(x.pieces),N(x.actual),x.attainment!=null?pct(x.attainment,0):'—',x.styles.join(', ')||'—',x.empty?'全週無排單 Nothing scheduled':x.gapDays>=2?'中途空檔 Gap':x.changeovers>=TH.chgHigh?'換款偏多 Frequent changeovers':'正常 Normal']));
        s+=para((w.emptyLines.length?w.emptyLines.join('、')+' 整週沒有排單；':'')+(w.gapLines.length?'有中途空檔的組別：'+w.gapLines.join('、')+'；':'')+'空檔不一定是現場沒事做（可能臨時轉線或清 WIP），但只要沒寫回 Production Plan，負荷就會被低估、換款也追不到。達成率只是本週排單暴露量對實績的比例，不是核實餘量。',(w.emptyLines.length?w.emptyLines.join(', ')+' have nothing scheduled all week; ':'')+(w.gapLines.length?'lines with mid-week gaps: '+w.gapLines.join(', ')+'; ':'')+'a gap does not necessarily mean the line was idle (temporary routing or WIP clearing may have happened), but unless it is written back into the Production Plan, loading is understated and changeovers cannot be tracked. Attainment is schedule exposure vs sewn pieces, not a verified balance.')}
      else s+=para('本週沒有 Production Plan 排單資料。','No Production Plan rows for this week.');
      s+=sec({zh:'本週主要排單段與換款',en:'Main Runs & Changeovers'});
      if(Ld&&Ld.topRuns.length)s+=tbl(['組別 Line','款式 Style','客戶 Customer','數量 Qty','PO 數','期間 Period'],Ld.topRuns.map(r=>[r.line,r.style,r.customer,N(r.qty),N(r.pos),r.start+' → '+r.end]));
      if(w&&w.changeovers)s+=para('本週換款 '+N(w.changeovers)+' 次：'+w.lines.filter(x=>x.changeovers).map(x=>x.short+' '+N(x.changeovers)+' 次（'+x.changeDates.map(mmdd).join('、')+'）').join('；')+'。每次換款前要先備好裁片與輔料，同款同色盡量連續；換款當天的效率下降要跟低效組別分開看。','Changeovers this week: '+N(w.changeovers)+' — '+w.lines.filter(x=>x.changeovers).map(x=>x.short+' '+N(x.changeovers)+' ('+x.changeDates.map(mmdd).join(', ')+')').join('; ')+'. Stage panels and trims before each change and keep the same style-colour consecutive; efficiency loss on changeover days should be read separately from structurally weak lines.');
      s+=sec({zh:'生產計劃 vs 實績：總量與線別必須分開看',en:'Production Plan vs Actual'});
      if(f.plan)s+=tbl(['項目 Item','數值 Value','說明 Note'],[[f.plan.month+' 排單 Plan',N(f.plan.planQty)+' pcs',N(f.plan.styles)+' 筆 rows'],['累計實績 MTD actual',N(f.plan.mtd)+' pcs','截至 through '+f.end+'（'+N(f.plan.dataDays)+' 個生產日）'],['完成率 Completion',pct(f.plan.completion),'工作日已過 '+N(f.plan.elapsedWorkdays)+'/'+N(f.plan.totalWorkdays)+' = '+pct(f.plan.elapsedShare)],['餘量 Remaining',N(f.plan.remaining)+' pcs','剩 '+N(f.plan.workdaysLeft)+' 個工作日 (Mon–Sat)'],['需日均 Required/day',N(f.plan.requiredPerDay)+' pcs','本週日均 '+N(f.sewing.perDay)+' → '+(f.plan.requiredPerDay>f.sewing.perDay?'高於目前 above run-rate':'目前可達 within run-rate')],['判定 Verdict',f.rag.plan?RAG_ZH[f.rag.plan]:'—','完成率－工作日比例 = '+(f.plan.completion-f.plan.elapsedShare).toFixed(1)+' pt']]);
      s+=para((Ld?'本週排單 '+N(Ld.exposure)+' 件、實績 '+N(Ld.actual)+' 件'+(Ld.attainment!=null?'（'+pct(Ld.attainment,0)+'）':'')+'。':'')+'到期批次是整批排單，不是已核實的剩餘未完成量，不能直接把實績除以排單宣稱週計劃完成率；正確做法是用它作為排程暴露量，再用實際 PO／Style／Line 完成情況逐項對帳，並把核准的轉線同步回 Production Plan。',(Ld?'Scheduled '+N(Ld.exposure)+' vs sewn '+N(Ld.actual)+' pcs'+(Ld.attainment!=null?' ('+pct(Ld.attainment,0)+')':'')+'. ':'')+'Scheduled batches are full planned quantities, not verified remaining balances, so actual ÷ scheduled must not be presented as weekly plan attainment; treat it as schedule exposure, reconcile per PO/Style/Line, and write approved routing changes back into the Production Plan.');
      s+=sec({zh:'下週排單預覽',en:'Next Week Preview'});
      if(nx)s+=tbl(['項目 Item','數值 Value'],[['期間 Period',mmdd(nx.start)+'–'+mmdd(nx.end)],['排單件 Scheduled pcs',N(nx.pieces)],['組日 Line-days',N(nx.scheduledLineDays)+' / '+N(nx.availableLineDays)+' = '+pct(nx.loadingPct,0)],['尚未排 Not loaded',nx.emptyLines.length?nx.emptyLines.join('、'):'無 none'],['開工款 Starts',Ld.nextStarts.length?Ld.nextStarts.map(r=>r.line+' '+r.style+' '+N(r.qty)+' ('+mmdd(r.start)+')').join('；'):'—']])+para(nx.emptyLines.length?'下週 '+nx.emptyLines.join('、')+' 還沒有排單；要在本週內把可上線訂單、WIP 與已到布新單補進去，若確定無料可做，再按組別／日期提出局部停工，而不是整廠停。':'下週各組都有排單，重點放在開工款的物料是否到位與換款準備。',nx.emptyLines.length?nx.emptyLines.join(', ')+' are not loaded next week; load ready-to-sew orders, WIP and newly arrived fabric this week, and request planned idle time by line and date only where nothing is executable.':'Every line has work next week; the focus is material readiness for the starting styles and changeover preparation.');
      s+=sec({zh:'客戶與款式集中度、SMV 覆蓋',en:'Customer & Style Concentration, SMV Coverage'});
      if(Ld&&Ld.conc.qty){s+=tbl(['客戶 Customer','排單 Qty','占比 Share'],Ld.conc.customers.map(c=>[c.customer,N(c.qty),pct(c.share)]))+tbl(['款式 Style','排單 Qty','占比 Share'],Ld.conc.styles.map(c=>[c.style,N(c.qty),pct(c.share)]));
        s+=para(Ld.conc.month+' 排單 '+N(Ld.conc.qty)+' 件、'+N(Ld.conc.customerCount)+' 個客戶、'+N(Ld.conc.styleCount)+' 款；前兩大客戶合計 '+pct(Ld.conc.top2Share,0)+(Ld.conc.styles[0]?'，'+Ld.conc.styles[0].style+' 單款占 '+pct(Ld.conc.styles[0].share,0):'')+'。集中度高時，月份能否順利不是看款式數量，而是看主要客戶的到布、繡花回廠與補排是否同步。',Ld.conc.month+' plan '+N(Ld.conc.qty)+' pcs across '+N(Ld.conc.customerCount)+' customers and '+N(Ld.conc.styleCount)+' styles; the top two customers are '+pct(Ld.conc.top2Share,0)+(Ld.conc.styles[0]?', '+Ld.conc.styles[0].style+' alone '+pct(Ld.conc.styles[0].share,0):'')+'. With this concentration, the month depends on the main customers\' fabric readiness, embroidery return and reloading rather than on style count.')}
      if(Ld&&Ld.smv)s+=para('本週排單 '+N(Ld.smv.styles)+' 款中 '+N(Ld.smv.styles-Ld.smv.missing)+' 款有正式 SMV'+(Ld.smv.missing?'，缺 '+N(Ld.smv.missing)+' 款：'+Ld.smv.missingStyles.join('、')+'。Master Plan 不放 SMV，生管只能看件數與日產，很容易把「高件數低 SMV」和「低件數高 SMV」混在一起。':'。'),N(Ld.smv.styles-Ld.smv.missing)+' of '+N(Ld.smv.styles)+' scheduled styles have an official SMV'+(Ld.smv.missing?'; missing '+N(Ld.smv.missing)+': '+Ld.smv.missingStyles.join(', ')+'. Without SMV in the master plan, PMC can only see pieces and daily targets, which confuses high-volume/low-minute with low-volume/high-minute work.':'.'));
      s+=sec({zh:'出貨排程（本週 ETD）',en:'Shipping Schedule (ETD this week)'});
      s+=f.shipping.rows?tbl(['項目 Item','數值 Value'],[['本週 ETD 列 Rows',N(f.shipping.rows)],['訂單量 Order qty',N(f.shipping.orig)],['已出 Shipped',N(f.shipping.shipped)+' ('+pct(f.shipping.pct,0)+')'],['未出 Open',N(f.shipping.open)],['逾期 Overdue',N(f.shipping.overdueRows)+' 筆 / '+N(f.shipping.overdueOpen)+' pcs'],['判定 Verdict',f.rag.shipping?RAG_ZH[f.rag.shipping]:'—']])+(f.shipping.overdue.length?tbl(['客戶 Customer','PO','款 Style','未出 Open','ETD'],f.shipping.overdue.map(o2=>[o2.cust,o2.po,o2.style,N(o2.open),o2.etd]))+para('實際裝櫃資訊應優先於船期表狀態；逾期列要以實際出櫃更新，而不是留在表上。','Actual loading takes precedence over schedule status; overdue rows must be updated from actual container loading rather than left on the sheet.'):''):para('出貨排程沒有落在本週的 ETD 列。','No shipping-schedule rows with ETD in this week.');
      s+=sec({zh:'訂單很多，但「可立即上線」仍是核心問題',en:'Order Book vs Ready-to-Sew Availability'});
      s+=tbl(['指標 Metric','數值 Value','來源 Source'],[['未車縫 Not sewn',f.fabric.notSewn!=null?N(f.fabric.notSewn):'—','客戶統計 '+(f.fabric.snapshotDate||'—')],['裁片 WIP Cutting WIP',f.fabric.cuttingWip!=null?N(f.fabric.cuttingWip):'—','客戶統計'],['無布可做 No fabric',f.fabric.hasData?N(f.fabric.noFabricPcs)+(f.fabric.noFabricShare!=null?'（占未車縫 '+pct(f.fabric.noFabricShare,0)+'）':''):'—','客戶統計 No Fabric Available'],['未出貨餘量 Balance',f.fabric.balance!=null?N(f.fabric.balance):'—','客戶統計'],['判定 Verdict',f.rag.ready?RAG_ZH[f.rag.ready]:'—','無布占比 ≤'+TH.fabG+'% GREEN、≤'+TH.fabA+'% AMBER']])+(f.fabric.top.length?tbl(['客戶 Customer','PO','款 Style','缺布 No fabric'],f.fabric.top.map(x=>[x.customer,x.po,x.style,N(x.noFabric)])):'')+para('總訂單很大，真正限制排線的仍是「布／標／繡花／裁片是否已到位」；補排要以可立即上線的款為準，不要把帳面訂單量當成可排產能。','The order book is large; the real line-loading constraint remains whether fabric, labels, embroidery and cut panels are physically ready. Reload from ready-to-sew styles, not from the gross order book.');
      s+=sec({zh:'管理結論與行動',en:'Management Conclusion & Next Actions'});
      s+=para(f.conclusion.zh,f.conclusion.en);
      s+=f.actions.length?tbl(['#','項目 Item','要求 Required action','Owner'],f.actions.map((a,i)=>[String(i+1),a.item,a.req,a.owner])):para('本週沒有需要指派的行動。','No action items this week.');
      s+=sec({zh:'資料口徑與分析限制',en:'Data Basis & Analytical Limitations'});
      f.basis.zh.forEach((z,i)=>{s+=para(z,f.basis.en[i]||'')});
      s+=footer();return shell(s,'週排單與負荷更新','Weekly Loading & Plan Update');
    }
    let s='';
    s+='<p style="font-size:15pt;font-weight:bold;margin:0">VRT '+(W?'生產效率、產能與品質關聯週報':'生產日報 — 產能、計劃執行與品質')+'</p><p style="font-size:12pt;font-weight:bold;margin:0 0 4pt 0;color:#334155">VRT '+(W?'Weekly Production Capacity, Plan Execution & Quality Correlation Report':'Daily Production Report — Capacity, Plan Execution & Quality')+'</p>';
    s+='<p style="font-size:9.5pt;color:#64748b;margin:0 0 10pt 0">'+(W?'分析週期 / Reporting period: ':'日期 / Date: ')+esc(f.label)+' | 資料截至 data through '+esc(f.end)+' | 產生 generated '+esc(String(f.generatedAt||'').slice(0,16).replace('T',' '))+'</p>';
    s+='<table style="border-collapse:collapse;width:100%"><tr>'+tile((W?'本週產量':'本日產量'),'Output',N(f.sewing.pieces)+' pcs'+(W?' · '+N(f.sewing.perDay)+'/day':''))+tile('加權效率','Weighted efficiency',pct(f.sewing.eff))+tile('退修率','Reject rate',f.qc.rate!=null?pct(f.qc.rate,2):'—')+tile('排單完成','Plan position',f.plan?pct(f.plan.completion)+' ('+N(f.plan.mtd)+'/'+N(f.plan.planQty)+')':'—')+tile('本週出貨','Shipping (week)',f.shipping.pct!=null?pct(f.shipping.pct,0):'—')+tile('已裁未縫 WIP','Cut-not-sewn',f.wip.cutNotSewn!=null?N(f.wip.cutNotSewn):'—')+'</tr><tr>'+ragCell(f.rag.capacity,'產能 Capacity')+ragCell(f.rag.capacity,'效率 Efficiency')+ragCell(f.rag.quality,'品質 Quality')+ragCell(f.rag.plan,'排單 Plan')+ragCell(f.rag.shipping,'出貨 Shipping')+ragCell(f.rag.wip,'WIP')+'</tr></table>';
    s+='<table style="border-collapse:collapse;width:100%;margin-top:8pt"><tr><td style="border:1px solid #94a3b8;background:#f8fafc;padding:8px"><b>管理結論 Management Conclusion</b><br>'+esc(f.conclusion.zh)+'<br><i style="color:#475569">'+esc(f.conclusion.en)+'</i></td></tr></table>';
    let n=0;const sec=t=>h(['一','二','三','四','五','六','七','八','九','十','十一','十二'][n]+'、'+t.zh+' | '+(++n)+'. '+t.en);
    // 1 capacity
    s+=sec({zh:(W?'本週每日產能':'本日產能與前期比較'),en:(W?'Daily Capacity':'Capacity vs Previous Periods')});
    if(W)s+=tbl(['日期 Date','產量 Output','箱數 Ctns','平均人力 Avg labor','效率 Eff.'],f.days.map(d=>[mmdd(d.date)+'（'+d.dow+' '+d.dowEn+'）',N(d.pieces),N(d.cartons),N(d.manpower),pct(d.eff)]));
    s+=tbl(['指標 Metric',W?'前週 Prev week':'前日 Prev day',W?'本週 This week':'本日 Today','變化 Change','判讀 Interpretation'],[
      ['產量 Output',f.prevDay.pieces!=null?N(f.prevDay.pieces):'—',N(f.sewing.pieces),f.prevDay.pieces!=null?N(f.sewing.pieces-f.prevDay.pieces)+' ('+fmtDelta(f.compare.piecesVsPrev)+')':'—',f.compare.piecesVsPrev==null?'—':f.compare.piecesVsPrev<-5?'下降 Down':f.compare.piecesVsPrev>5?'上升 Up':'持平 Flat'],
      W?['日均 Daily avg',f.prevDay.perDay!=null?N(f.prevDay.perDay):'—',N(f.sewing.perDay),f.prevDay.perDay!=null?N(f.sewing.perDay-f.prevDay.perDay):'—',f.compare.perDayVsPrev==null?'—':f.compare.perDayVsPrev<-5?'下降 Down':f.compare.perDayVsPrev>5?'上升 Up':'略變 Slight']:null,
      ['平均人力 Avg operators',f.prevDay.manpower!=null?N(f.prevDay.manpower):'—',N(f.sewing.manpower),f.compare.manpowerVsPrev!=null?(f.compare.manpowerVsPrev>=0?'+':'')+N(f.compare.manpowerVsPrev):'—',f.compare.manpowerVsPrev==null?'—':f.compare.manpowerVsPrev>0?'反而增加 Increased':f.compare.manpowerVsPrev<0?'減少 Decreased':'持平 Flat'],
      ['加權效率 Weighted eff.',pct(f.prevDay.eff),pct(f.sewing.eff),fmtPt(f.sewing.eff,f.prevDay.eff),f.rag.capacity?RAG_ZH[f.rag.capacity]:'—'],
      ['箱數 Cartons',f.prevDay.cartons!=null?N(f.prevDay.cartons):'—',N(f.sewing.cartons),f.prevDay.cartons!=null?N(Math.round((f.sewing.cartons-f.prevDay.cartons)*10)/10):'—','—'],
      ['裁剪 Cutting',f.cutting.prevPieces!=null?N(f.cutting.prevPieces):'—',N(f.cutting.pieces),f.cutting.prevPieces!=null?fmtDelta(f.compare.cutVsPrev):'—','—']].filter(Boolean));
    s+=para((f.compare.effVsPrevPt!=null&&f.compare.effVsPrevPt<0&&f.compare.manpowerVsPrev!=null&&f.compare.manpowerVsPrev>=0)?'人力沒有減少，但加權效率下降 '+Math.abs(f.compare.effVsPrevPt).toFixed(1)+' pt，因此產量變化不能主要歸因於缺人；較合理的解釋是款式／SMV 組合、轉線、部分組別低效率與品質重工。':'效率與人力的關係：本期加權效率 '+pct(f.sewing.eff)+'、平均 '+N(f.sewing.manpower)+' 人；件數與標準工時要分開看（低 SMV 產品會拉高件數但不代表同等產能）。',(f.compare.effVsPrevPt!=null&&f.compare.effVsPrevPt<0&&f.compare.manpowerVsPrev!=null&&f.compare.manpowerVsPrev>=0)?'Labor did not fall while weighted efficiency dropped '+Math.abs(f.compare.effVsPrevPt).toFixed(1)+' pt, so the output change should not be attributed mainly to manpower; style/SMV mix, routing changes, weak lines and quality rework are more relevant.':'Efficiency vs labor: weighted efficiency '+pct(f.sewing.eff)+' with about '+N(f.sewing.manpower)+' operators; pieces and standard minutes must be read separately (low-SMV products inflate piece counts without equal capacity).');
    if(W&&f.loading&&f.loading.week)s+=para('本週排單換款 '+N(f.loading.week.changeovers)+' 次、空檔 '+N(f.loading.week.gapLineDays)+' 組日（排單負荷 '+pct(f.loading.week.loadingPct,0)+'）；換款當天的效率下降要與結構性低效分開看，負荷與空檔的檢討見排單週報。','Scheduled changeovers this week: '+N(f.loading.week.changeovers)+', idle line-days '+N(f.loading.week.gapLineDays)+' (loading '+pct(f.loading.week.loadingPct,0)+'); efficiency loss on changeover days should be read separately from structural weakness — loading and gaps are reviewed in the loading weekly.');
    if(f.mix.length)s+=tbl(['產品 Product','件數 Pieces','占比 Share'],f.mix.map(m=>[m.product,N(m.pieces),pct(m.share)]))+(f.sewing.avgSmv!=null?para('本期平均 SMV 約 '+N(f.sewing.avgSmv)+' 分鐘／件（Σ標準分鐘 ÷ 件數）。','Average SMV about '+N(f.sewing.avgSmv)+' min/pc (standard minutes ÷ pieces).'):'');
    // 2 plan
    s+=sec({zh:'生產計劃 vs 實績',en:'Production Plan vs Actual'});
    if(f.plan)s+=tbl(['項目 Item','數值 Value','說明 Note'],[[f.plan.month+' 排單 Plan',N(f.plan.planQty)+' pcs',N(f.plan.styles)+' 筆 rows (Production Plan)'],['累計實績 MTD actual',N(f.plan.mtd)+' pcs','截至 through '+f.end+'（'+N(f.plan.dataDays)+' 個生產日 production days）'],['完成率 Completion',pct(f.plan.completion),'工作日已過 working days elapsed '+N(f.plan.elapsedWorkdays)+'/'+N(f.plan.totalWorkdays)+' = '+pct(f.plan.elapsedShare)],['餘量 Remaining',N(f.plan.remaining)+' pcs','剩 '+N(f.plan.workdaysLeft)+' 個工作日 working days left (Mon–Sat)'],['需日均 Required/day',N(f.plan.requiredPerDay)+' pcs','本期日均 current '+N(f.sewing.perDay)+' pcs/day → '+(f.plan.requiredPerDay>f.sewing.perDay?'高於目前 above run-rate':'目前可達 within run-rate')],['判定 Verdict',f.rag.plan?RAG_ZH[f.rag.plan]:'—','完成率－工作日比例 completion − elapsed share = '+(f.plan.completion-f.plan.elapsedShare).toFixed(1)+' pt']])+para(f.conclusion.zh.split('。').filter(x=>/排單/.test(x)).join('。')+'。注意：到期批次是整批排單，不是已核實的剩餘未完成量，真正的對帳要以 PO／Style／Line 為準。','Note: scheduled batches are full planned quantities, not verified remaining balances; true reconciliation must be at PO/Style/Line level.');
    else s+=para('本期沒有可比對的 Production Plan 月排單（請確認排單已匯入排單產能模組）。','No Production Plan month quantity is available for comparison (check that the plan has been imported into the plan & capacity module).');
    // 3 lines
    s+=sec({zh:'各組產能與品質：問題集中在哪裡',en:'Line Capacity & Quality Performance'});
    if(f.lines.length)s+=tbl(['組別 Line','產量 Output','效率 Eff.','平均人力 Labor','退修率 Reject','退修 Qty','判讀 Reading','風險 Risk'],f.lines.map(x=>[x.line,N(x.pieces),pct(x.eff),N(x.workers),x.rejectRate!=null?pct(x.rejectRate):'—',x.rejected!=null?N(x.rejected):'—',x.verdict?VZH[x.verdict]:'—',RZH[x.risk]]))+para((f.riskLines.dual.length?'雙重風險線：'+f.riskLines.dual.join('、')+'（低效＋高退修），應把效率、QC 退修與 IE 線平衡一起處理，而不是分成兩個問題。':'本期沒有同時低效且高退修的組別。')+(f.riskLines.quality.length?'高產但高退修：'+f.riskLines.quality.join('、')+'，高產量不等於有效出貨產能。':'')+(f.riskLines.capacity.length?'產能風險（低效但退修不高）：'+f.riskLines.capacity.join('、')+'，應先查換款、工序平衡、SMV 與人員配置，而不是先歸給 QC。':''),(f.riskLines.dual.length?'Dual-risk lines: '+f.riskLines.dual.join(', ')+' (weak efficiency and high reject) should be managed as one combined capacity-and-quality problem.':'No line is both weak and high-reject this period.')+(f.riskLines.quality.length?' High output but high reject: '+f.riskLines.quality.join(', ')+' — high output is not automatically effective shipment capacity.':'')+(f.riskLines.capacity.length?' Capacity risk (weak efficiency, acceptable reject): '+f.riskLines.capacity.join(', ')+' — check changeover, process balance, SMV and staffing before assuming QC.':''));
    else s+=para('本期沒有線別資料。','No line-level data this period.');
    // 4 quality
    s+=sec({zh:'品質：是否影響可出貨量',en:'Quality Impact'});
    if(f.qc.reports)s+=tbl(['指標 Metric','數量 Qty','比率 Rate','解讀 Interpretation'],[['Inspected 檢驗',N(f.qc.inspected),'100% base','Final QC '+N(f.qc.reports)+' 份報告 reports'+(f.qc.asOf?'（'+f.qc.date+'）':'')],['Actual output 實際產出',N(f.qc.output),f.qc.inspected?pct(f.qc.output/f.qc.inspected*100):'—',f.qcReconcile?(f.qcReconcile.ok?'與車縫日報 '+N(f.qcReconcile.sewing)+' 件對帳一致 reconciles with sewing output':'與車縫日報 '+N(f.qcReconcile.sewing)+' 件不一致（差 '+N(f.qcReconcile.diff)+'）does not reconcile'):'—'],['Rejected 退修',N(f.qc.rejected),pct(f.qc.rate,2)+' '+(f.rag.quality?RAG_ZH[f.rag.quality]:''),'需重工／處置；不再從產量扣除 rework/disposition; not deducted from output again']])+(f.qc.top.length?tbl(['缺點 Defect','數量 Qty','占退修 Share of rejects'],f.qc.top.map(d=>[d.name,N(d.qty),f.qc.defectTotal?pct(d.qty/f.qc.defectTotal*100):'—']))+para('前 '+N(Math.min(6,f.qc.top.length))+' 大缺點合計 '+N(f.qc.top.slice(0,6).reduce((s2,d)=>s2+d.qty,0))+' 件'+(f.qc.defectTotal?'，約占缺點總數 '+pct(f.qc.top.slice(0,6).reduce((s2,d)=>s2+d.qty,0)/f.qc.defectTotal*100):'')+'。','The top '+N(Math.min(6,f.qc.top.length))+' defects total '+N(f.qc.top.slice(0,6).reduce((s2,d)=>s2+d.qty,0))+(f.qc.defectTotal?', about '+pct(f.qc.top.slice(0,6).reduce((s2,d)=>s2+d.qty,0)/f.qc.defectTotal*100)+' of all recorded defects':'')+'.'):'');
    else s+=para('本期沒有 Final QC 報告。','No Final QC report this period.');
    // 5 shipping
    s+=sec({zh:'出貨排程（本週 ETD）',en:'Shipping Schedule (ETD this week)'});
    s+=f.shipping.rows?tbl(['項目 Item','數值 Value'],[['本週 ETD 列 Rows',N(f.shipping.rows)],['訂單量 Order qty',N(f.shipping.orig)],['已出 Shipped',N(f.shipping.shipped)+' ('+pct(f.shipping.pct,0)+')'],['未出 Open',N(f.shipping.open)],['逾期 Overdue',N(f.shipping.overdueRows)+' 筆 / '+N(f.shipping.overdueOpen)+' pcs'],['判定 Verdict',f.rag.shipping?RAG_ZH[f.rag.shipping]:'—']])+(f.shipping.overdue.length?tbl(['客戶 Customer','PO','款 Style','未出 Open','ETD'],f.shipping.overdue.map(o=>[o.cust,o.po,o.style,N(o.open),o.etd])):''):para('出貨排程沒有落在本週的 ETD 列。','No shipping-schedule rows with ETD in this week.');
    // 6 WIP / fabric
    s+=sec({zh:'WIP 與物料：訂單很多，「可立即上線」才是限制',en:'WIP & Material Readiness'});
    s+=tbl(['指標 Metric','數值 Value','來源 / 說明 Source'],[['已裁未縫 Cut-not-sewn WIP',f.wip.cutNotSewn!=null?N(f.wip.cutNotSewn)+' pcs'+(f.wip.daysOfOutput!=null?'（≈ '+N(f.wip.daysOfOutput)+' 天產量 days）':''):'—',f.wip.basis==='styles'?'本頁款式進度 page styles':f.wip.basis==='custstats'?'客戶統計 Cutting WIP':'無快照 no snapshot'],['未出貨餘量 Balance not shipped',f.fabric.balance!=null?N(f.fabric.balance):'—','客戶統計 '+(f.fabric.snapshotDate||'—')],['未車縫 Not sewn',f.fabric.notSewn!=null?N(f.fabric.notSewn):'—','客戶統計 customer statistics'],['無布可做 No fabric',f.fabric.hasData?N(f.fabric.noFabricPcs)+(f.fabric.noFabricShare!=null?'（占未車縫 '+pct(f.fabric.noFabricShare)+'）':''):'—','客戶統計 No Fabric Available'],['成品庫存 FG',f.fabric.fg!=null?N(f.fabric.fg):'—','客戶統計 customer statistics']])+(f.fabric.top.length?tbl(['客戶 Customer','PO','款 Style','缺布 No fabric'],f.fabric.top.map(x=>[x.customer,x.po,x.style,N(x.noFabric)])):'')+(f.wip.top.length?tbl(['款 Style','客戶 Customer','已裁未縫 WIP'],f.wip.top.map(x=>[x.style,x.customer,N(x.wip)])):'');
    // 7 maintenance
    s+=sec({zh:'換針與零件',en:'Needles & Spare Parts'});
    s+=tbl(['指標 Metric','數值 Value','說明 Note'],[['換針 Needle changes',N(f.maint.needle.qty)+' 支','非計畫 unplanned '+N(f.maint.needle.unplanned)+(f.maint.needle.unplannedShare!=null?'（'+pct(f.maint.needle.unplannedShare)+'）':'')+'；基準 baseline '+N(f.maint.needle.baselineUnplannedPerDay)+'／日 (28 天 days)'],['異常線 Flagged lines',f.maint.needle.flag.length?f.maint.needle.flag.map(x=>x.line+' '+N(x.unplanned)).join('、'):'無 none','非計畫換針 ≥3／日且 ≥2× 基準 unplanned ≥3/day and ≥2× baseline'],['換件 Part changes',N(f.maint.part.qty)+' 件',f.maint.part.topItems.length?f.maint.part.topItems.map(x=>x.item+' '+N(x.qty)).join('、'):'—']]);
    // 8 actions
    s+=sec({zh:'管理結論與行動',en:'Management Conclusion & Next Actions'});
    s+=para(f.conclusion.zh,f.conclusion.en);
    s+=f.actions.length?tbl(['#','項目 Item','要求 Required action','Owner'],f.actions.map((a,i)=>[String(i+1),a.item,a.req,a.owner])):para('本期沒有需要指派的行動。','No action items this period.');
    // 9 basis
    s+=sec({zh:'資料口徑與分析限制',en:'Data Basis & Analytical Limitations'});
    f.basis.zh.forEach((z,i)=>{s+=para(z,f.basis.en[i]||'')});
    s+=footer();return shell(s,W?'生產效率週報':'生產日報','')}

  g.VRTDailyReport={version:VERSION,TH,STYLE_GUIDE,STYLE_ZH,HOLIDAYS_KH,FACTORY_CAL,famOf,compute,render,renderStory,renderV13,aiHtml,holidayRuns,isWorkday,renderCompact,aiPrompt,checkAiText,checkNumbersAgainstText,docHtml,zhCount,helpers:{sewPick,sewAgg,cutAgg,qcPick,qcAgg,chgAgg,anyDate,addDays,dayKey,dowMon0,isoWeekKey,N,pct,esc,planRuns,weekLoading,lineShort}};
})(typeof window!=='undefined'?window:globalThis);
/* 把 2.1 的函式蓋到主檔的 DR（const DR = VRTDailyReport 在主檔，綁的是舊物件） */
try{ if(typeof DR!=='undefined'&&DR!==VRTDailyReport)Object.assign(DR,VRTDailyReport); }catch(e){}
/* VRT 情境報告 v1.1 (2026-11-11 下午：照 11/11 生產與出貨報告第六節的六點改善，加 planOutlook)
   v1.0 (2026-11-11) — 日報／效率週報／排單週報的「情境開頭＋色條」版面
   Paul 11/11：日報、週報、月報至少要 10～40 種情境（放假、停工、加班、少人、加減組、料有問題、接代工、突發事件…）；
   不一定每天從同一個地方寫起，但開頭結論要準、重點一眼看到；精實不囉嗦、數字精準、口氣像他自己；多用色條、圖表。
   純邏輯（無 DOM／網路／Drive）：瀏覽器、Node（qa/v423）、GAS 都能跑。數字全部來自 VRTDailyReport.compute 的 facts
   與 extras()（從原始日報列算出的加班、目標達成、現場回報原因、停工日、代工）；這裡不產生任何新數字以外的推測。
   extras(data,f) → f.x      scenarios(f) → [{id,w,tone,tag,head,focus}]      render(f,{note}) → {html,text,lines,scen}
   chart(f) → {title,labels[],values[],tones[],unit}（給 GAS Charts 畫圖用） */
(function(g){'use strict';
  const DR=g.VRTDailyReport;if(!DR){return}
  const H=DR.helpers,TH=DR.TH,VERSION='1.2.0';
  const num=v=>{const n=Number(v);return isFinite(n)?n:0};
  const N=v=>v==null||isNaN(v)?'—':Math.round(Number(v)).toLocaleString('en-US');
  const P1=v=>v==null||isNaN(v)?'—':(Math.round(Number(v)*10)/10).toFixed(1);
  const P0=v=>v==null||isNaN(v)?'—':String(Math.round(Number(v)));
  const esc=H.esc,addDays=H.addDays,dayKey=H.dayKey,dowMon0=H.dowMon0;
  const DOW=['一','二','三','四','五','六','日'];
  const md=d=>{d=String(d||'');return d.length>=10?Number(d.slice(5,7))+'/'+Number(d.slice(8,10)):d};
  const mon=ym=>Number(String(ym||'').slice(5,7))+' 月';
  const lno=l=>{const m=String(l||'').match(/\d+/);return m?Number(m[0]):0};
  const LS=l=>{const n=lno(l);return n?'L'+n:String(l||'')};
  const arrow=v=>{if(v==null||isNaN(v))return '';const r=Math.round(Number(v));return r>0?' ▲'+r+'%':r<0?' ▼'+Math.abs(r)+'%':' ＝'};
  const light=t=>t==='G'?'🟢':t==='A'?'🟡':t==='R'?'🔴':'🔵';
  const effTone=e=>e==null||isNaN(e)?null:e>=TH.effG?'G':e>=TH.effA?'A':'R';
  const lineTone=e=>e==null||isNaN(e)?null:e>=TH.lineOk?'G':e>=TH.lineLow?'A':'R';
  const SQ={G:'🟩',A:'🟨',R:'🟥',B:'🟦',I:'🟦'};
  const bar=(share,tone,cells)=>{cells=cells||10;const n=Math.max(0,Math.min(cells,Math.round(num(share)*cells)));return (SQ[tone]||'🟩').repeat(n)+'⬜'.repeat(cells-n)};
  const cut=(s,n)=>{s=String(s||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s};
  const ISSUE_ZH={material:'缺料',machine:'機台',manpower:'缺人',changeover:'換款',quality:'品質',others:'其他'};
  const ISSUE_KEYS=['material','machine','manpower','changeover','quality','others'];
  /* v1.2：現場備註分類（照 Paul 10–11 月週報怎麼讀 DPO 備註）。relabel＝改標／補標支援，不是閒置；wipOnly＝舊半成品只補標，效率不可和完整車縫比；
     trimHold＝缺輔料半成品（件數是當天快照，不同天不能相加）；changeover＝換款／新款不熟；cutSupply＝裁片不足轉做別款；smvMissing＝沒有 IE 工時；machine＝機台 */
  function classifyRemark(t){t=String(t||'');const k=[];if(!t.trim())return {kinds:k,qty:0,item:''};
    if(/改标|改標|拆箱|商标更新|商標更新|补标|補標|加标|加標|relabel/i.test(t)&&!/只是顶|只是頂|只是上|之前的半成品/.test(t))k.push('relabel');
    if(/之前的半成品|只是顶|只是頂|只是上商标|只是上商標|补钉|補釘|old WIP/i.test(t))k.push('wipOnly');
    const m=t.match(/(\d[\d,]*)\s*(?:件|条|條|pcs)?\s*(?:就)?是?半成品/);let qty=m?Number(m[1].replace(/,/g,'')):0;if(!qty){const m2=t.match(/半成品[^\d]{0,6}(\d[\d,]*)/);if(m2)qty=Number(m2[1].replace(/,/g,''))}
    let item='';const addI=v=>{if(item.indexOf(v)<0)item=item?item+'＋'+v:v};if(/热转印|熱轉印/.test(t))addI('熱轉印標');else if(/商标|商標|label/i.test(t))addI('商標');if(/螺纹|羅紋|罗纹/.test(t))addI('袖口羅紋');if(/纽扣|鈕扣|钮扣|扣子|button/i.test(t))addI('鈕扣');if(/织带|織帶|tape/i.test(t))addI('織帶');if(/绣花|繡花|embroid/i.test(t))addI('繡花片');
    if((/辅料短缺|輔料短缺|短缺|缺料|缺|等待/.test(t)&&(qty||item))&&k.indexOf('wipOnly')<0&&k.indexOf('relabel')<0)k.push('trimHold');
    if(/换款|換款|新款|不熟|熟手|学习|學習|changeover/i.test(t))k.push('changeover');
    if(/裁片供应不足|裁片供應不足|裁片不足|裁片跟不上|转做|轉做/.test(t))k.push('cutSupply');
    if(/没有\s*IE|沒有\s*IE|无法算效率|無法算效率/i.test(t))k.push('smvMissing');else if(/SMV.{0,8}(有问题|有問題|不正确|不正確|重新测|重新測)|重新测试|重新測試/i.test(t))k.push('smvReview');
    if(/机器|機器|机台|機台|设备|設備|故障|调顺|調順|machine/i.test(t))k.push('machine');
    return {kinds:k,qty,item}}

  const lsList=arr=>{if(arr.length<=5)return arr.join('、');const n=arr.map(lno),contig=n.every((v,i)=>i===0||v===n[i-1]+1);return contig?arr[0]+'–'+arr[arr.length-1]+' 共 '+arr.length+' 組':arr.slice(0,5).join('、')+' 等 '+arr.length+' 組'};
  /* 排單負荷扣掉國定假日（函式庫的週負荷是週一到週六，不扣假日）：每組每天一格 🟦 有排／⬜ 空檔／🎌 放假 */
  function adjLoad(wk){if(!wk||!wk.lines)return null;const days=[];for(let d=wk.start;d&&d<=wk.end;d=addDays(d,1))if(dowMon0(d)<6)days.push(d);const real=days.filter(d=>DR.isWorkday(d));
    const lines=wk.lines.map(z=>{const gapSet={};(z.gaps||[]).forEach(d=>{gapSet[d]=1});const cells=days.map(d=>!DR.isWorkday(d)?'🎌':gapSet[d]?'⬜':'🟦');const sched=real.filter(d=>!gapSet[d]).length,gap=real.length-sched;return {short:z.short,cells:cells.join(''),sched,gap,empty:sched===0,pieces:z.pieces,changeovers:z.changeovers,attainment:z.attainment}});
    const avail=real.length*lines.length,sched=lines.reduce((a,z)=>a+z.sched,0);
    return {start:wk.start,end:wk.end,workdays:real.length,holidays:days.length-real.length,lines,lineCount:lines.length,avail,sched,pct:avail?Math.round(sched/avail*1000)/10:null,emptyLines:lines.filter(z=>z.empty).map(z=>z.short),gaps:lines.filter(z=>!z.empty&&z.gap>=2),pieces:wk.pieces,styles:wk.styles,changeovers:wk.changeovers}}

  /* ── planOutlook（11/11 報告第六節的規格）：各組剩多少、照表與保守估兩個完工日（扣假期）、件數＋標準工時、
        假期前後空檔、交期對出櫃、排單表資料檢查。全部由排單列、車縫實績、客戶統計、出貨表算出。 ── */
  const normSty=v=>String(v||'').replace(/[\s\-_\/]/g,'').toUpperCase();
  const wdList=(a,b)=>{const o=[];for(let d=a;d&&d<=b&&o.length<400;d=addDays(d,1))if(DR.isWorkday(d))o.push(d);return o};
  const nextWd=d=>{let x=d;for(let i=0;i<40&&!DR.isWorkday(x);i++)x=addDays(x,1);return x};
  function planOutlook(data,f){const rows=(data.prodplan||[]).filter(r=>r&&r.line&&num(r.sewingQty)>0&&String(r.style||'').trim());if(!rows.length)return null;
    const sewAll=(data.sewing||[]).filter(r=>r),days=H.sewPick(sewAll);const dataDates=Object.keys(days).sort();const lastData=dataDates[dataDates.length-1]||'';
    const T=f.today||f.end;const from=nextWd(T);const ym=from.slice(0,7);const mEnd=(()=>{let d=ym+'-28';while(addDays(d,1).slice(0,7)===ym)d=addDays(d,1);return d})();
    const lineKey=l=>'L'+lno(l);
    /* 一列一筆（同組同款同色連續的合併） */
    const runs=[];rows.forEach(r=>{const st=dayKey(r.startDate),en=dayKey(r.endDate)||dayKey(r.finishDate)||st;if(!st)return;const k=lineKey(r.line)+'|'+normSty(r.style)+'|'+String(r.color||'').trim().toUpperCase();
      const x=runs.find(q=>q.k===k&&!(st>addDays(q.end,3)||en<addDays(q.start,-3)));const smv=num(r.smv);
      if(x){if(st<x.start)x.start=st;if(en>x.end)x.end=en;x.qty+=num(r.sewingQty);x.cut+=num(r.cutQty);x.daily=Math.max(x.daily,num(r.dailyOutput));if(!x.smv&&smv)x.smv=smv;if(r.po&&x.pos.indexOf(String(r.po))<0)x.pos.push(String(r.po))}
      else runs.push({k,line:lineKey(r.line),style:String(r.style).trim(),color:String(r.color||'').trim(),customer:String(r.customer||'').trim(),start:st,end:en<st?st:en,qty:num(r.sewingQty),cut:num(r.cutQty),daily:num(r.dailyOutput),smv,ship:dayKey(r.shipmentDate)||'',pos:r.po?[String(r.po)]:[],remark:String(r.remark||'')})});
    /* 排單表整欄都沒填已裁數時（新版排單表常這樣），不能把每張單都當成「未裁」 */
    const anyCut=runs.some(r=>r.cut>0);
    /* 實績：每組每款從上線日起已車多少（款號去空白比對） */
    const done=(line,style,start)=>{let q=0,hit=false;dataDates.forEach(d=>{if(d<addDays(start,-2))return;days[d].forEach(r=>{if(lineKey(r.lineNo)!==line)return;const a=normSty(r.styleNo||r.style),b=normSty(style);if(a&&b&&(a===b||a.indexOf(b)>=0||b.indexOf(a)>=0)){q+=num(r.pieces);hit=true}})});return hit?q:null};
    /* 實際速度：最近 20 個有資料的工作天，各組實做 ÷ 當天排單日產目標 */
    let aSum=0,tSum=0;dataDates.slice(-20).forEach(d=>{const by={};days[d].forEach(r=>{const l=lineKey(r.lineNo);by[l]=(by[l]||0)+num(r.pieces)});Object.keys(by).forEach(l=>{const tg=runs.filter(r=>r.line===l&&r.start<=d&&r.end>=d&&r.daily>0).reduce((m,r)=>Math.max(m,r.daily),0);if(tg>0){aSum+=by[l];tSum+=tg}})});
    let pace=tSum>0?aSum/tSum:null;const paceBasis=pace!=null?'actual':'default';if(pace==null)pace=0.75;pace=Math.max(0.5,Math.min(1,pace));
    const lines=[...new Set(runs.filter(r=>r.end>=addDays(from,-31)).map(r=>r.line))].filter(l=>lno(l)!==12).sort((a,b)=>lno(a)-lno(b));
    const hol=(f.cal&&f.cal.nextOff&&f.cal.nextOff.start<=mEnd&&f.cal.nextOff.start>=from)?f.cal.nextOff:null;
    const preDays=hol?wdList(from,addDays(hol.start,-1)):wdList(from,mEnd),postDays=hol?wdList(addDays(hol.end,1),mEnd):[];
    let slip=0,remAll=0,hrsAll=0,smvMiss=new Set();const out=lines.map(l=>{const rs=runs.filter(r=>r.line===l&&r.end>=from).sort((a,b)=>a.start.localeCompare(b.start));
      let cur=from,cautious='',planEnd='',rem=0,hrs=0,late=0;const items=[];
      rs.forEach(r=>{const d0=done(l,r.style,r.start);const total=wdList(r.start,r.end).length||1,left=wdList(r.start>from?r.start:from,r.end).length;let q=r.start>=from?r.qty:(d0!=null?Math.max(0,r.qty-d0):Math.round(r.qty*left/total));if(q<=0)return;
        const rate=(r.daily>0?r.daily:r.qty/total)*pace;const st=nextWd(r.start>cur?r.start:cur);const need=Math.max(1,Math.ceil(q/Math.max(rate,1)));let d=st,n=1;while(n<need){d=addDays(d,1);if(DR.isWorkday(d))n++}
        cur=addDays(d,1);cautious=d;if(r.end>planEnd)planEnd=r.end;rem+=q;if(r.smv>0)hrs+=q*r.smv/60;else smvMiss.add(r.style);
        if(d>mEnd){const over=wdList(addDays(mEnd,1),d).length;late+=Math.min(q,Math.round(over*rate))}
        items.push({style:r.style,customer:r.customer,qty:Math.round(q),uncut:anyCut&&r.cut<=0,end:r.end,cautious:d})});
      const busy={};rs.forEach(r=>wdList(r.start>from?r.start:from,r.end).forEach(d=>{busy[d]=1}));
      const emptyPre=preDays.filter(d=>!busy[d]).length,emptyPost=postDays.filter(d=>!busy[d]).length;
      slip+=late;remAll+=rem;hrsAll+=hrs;
      return {line:l,rem:Math.round(rem),hours:Math.round(hrs),planEnd,cautious,late:Math.round(late),items:items.slice(0,3),styles:items.length,emptyPre,emptyPost,noWork:!items.length,lastEnd:runs.filter(r=>r.line===l).reduce((m,r)=>r.end>m?r.end:m,''),uncut:items.filter(z=>z.uncut).reduce((a,z)=>a+z.qty,0)}});
    /* 月排單：件數與標準工時；可用工時＝目前人數×8×剩餘工作天×上月效率 */
    const month=rows.filter(r=>String(r.month||'').slice(0,7)===ym);const mQty=month.reduce((a,r)=>a+num(r.sewingQty),0),mHrs=month.reduce((a,r)=>a+num(r.sewingQty)*num(r.smv)/60,0);
    const eff=(f.months&&f.months.prev&&f.months.prev.eff)||(f.sewing&&f.sewing.eff)||null,mp=(f.sewing&&f.sewing.manpower)||(f.months&&f.months.prev&&f.months.prev.manpower)||0;const wdLeft=preDays.length+postDays.length;
    const availH=eff&&mp?Math.round(mp*8*wdLeft*eff/100):null;
    /* 排單表資料檢查 */
    const dupMap={};runs.filter(r=>r.end>=from).forEach(r=>{const k=normSty(r.style)+'|'+r.color.toUpperCase()+'|'+r.pos.join('/');(dupMap[k]=dupMap[k]||[]).push(r)});
    const dups=Object.values(dupMap).filter(a=>new Set(a.map(r=>r.line)).size>1).map(a=>({style:a[0].style,lines:[...new Set(a.map(r=>r.line))]})).slice(0,5);
    const finished=runs.filter(r=>r.end>=from&&r.start<from).filter(r=>{const d0=done(r.line,r.style,r.start);return d0!=null&&d0>=r.qty}).map(r=>({style:r.style,line:r.line})).slice(0,5);
    const undated=rows.filter(r=>!dayKey(r.startDate)&&String(r.month||'').slice(0,7)>=ym).length;
    /* 交期（客戶統計 ETD）到月底＋7 天內、還沒做完的：依客戶列未完成、已入成品倉、未車；排單表找不到的款另列；對不到櫃的客戶標出 */
    const det=(data.custstats&&data.custstats.details)||[];const planSty=new Set(rows.filter(r=>String(r.month||'').slice(0,7)>=ym).map(r=>normSty(r.style)));
    const due=det.filter(d=>{const e=dayKey(d.etd);return e&&e<=addDays(mEnd,7)&&num(d.balanceQty||d.openOrder)>0});const byCust={};const missing=[];
    due.forEach(d=>{const c=String(d.customer||'—').trim();const o=byCust[c]=byCust[c]||{customer:c,open:0,fg:0,notSewn:0,noFabric:0,overdue:0};const bal=num(d.balanceQty||d.openOrder);o.open+=bal;o.fg+=num(d.fgPcs);o.notSewn+=num(d.actualNotSewn);o.noFabric+=num(d.noFabric);if(dayKey(d.etd)<from)o.overdue+=bal;
      if(num(d.actualNotSewn)>0&&!planSty.has(normSty(d.style)))missing.push({style:String(d.style||''),customer:c,qty:num(d.actualNotSewn),etd:dayKey(d.etd)})});
    const ships=(data.shipping||[]).filter(z=>z&&num(z.open)>0&&dayKey(z.etd)>=from);const hasBox=c=>ships.some(z=>String(z.cust||z.customer||'').toUpperCase().indexOf(c.toUpperCase().slice(0,3))>=0);
    const dueList=Object.values(byCust).sort((a,b)=>b.open-a.open).slice(0,5).map(o=>Object.assign(o,{open:Math.round(o.open),fg:Math.round(o.fg),notSewn:Math.round(o.notSewn),noFabric:Math.round(o.noFabric),overdue:Math.round(o.overdue),container:hasBox(o.customer)}));
    const missAgg={};missing.forEach(m=>{const k=normSty(m.style);const o=missAgg[k]=missAgg[k]||{style:m.style,customer:m.customer,qty:0,etd:m.etd};o.qty+=m.qty;if(m.etd<o.etd)o.etd=m.etd});
    return {from,monthEnd:mEnd,month:ym,lastData,dataLagDays:lastData?wdList(addDays(lastData,1),addDays(from,-1)).length:null,pace:Math.round(pace*100),paceBasis,holiday:hol?{name:hol.name,start:hol.start,end:hol.end,days:hol.days}:null,preDays:preDays.length,postDays:postDays.length,
      lines:out,remaining:Math.round(remAll),hours:Math.round(hrsAll),slip:Math.round(slip),slipShare:remAll>0?Math.round(slip/remAll*1000)/10:0,slipLines:out.filter(z=>z.late>0).map(z=>z.line),
      monthQty:Math.round(mQty),monthHours:Math.round(mHrs),availHours:availH,useShare:availH&&hrsAll?Math.round(hrsAll/availH*100):null,
      emptyPre:out.reduce((a,z)=>a+z.emptyPre,0),emptyPost:out.reduce((a,z)=>a+z.emptyPost,0),idleAfter:out.filter(z=>postDays.length&&z.emptyPost===postDays.length).map(z=>z.line),lineDaysPre:preDays.length*out.length,lineDaysPost:postDays.length*out.length,
      check:{smvMissing:[...smvMiss].slice(0,6),smvMissingCount:smvMiss.size,dups,finished,undated,unscheduled:Object.values(missAgg).sort((a,b)=>b.qty-a.qty).slice(0,5).map(z=>Object.assign(z,{qty:Math.round(z.qty)})),unscheduledQty:Math.round(Object.values(missAgg).reduce((a,z)=>a+z.qty,0))},
      due:dueList}}

  /* ── extras：facts 裡沒有、要從原始列補的事實（加班、目標達成與現場回報、停工日、假日、本月排名、代工） ── */
  function extras(data,f){data=data||{};const x={};const sewAll=(data.sewing||[]).filter(r=>r);const days=H.sewPick(sewAll);
    const inP=d=>d&&d>=f.start&&d<=f.end;const W=f.period==='week';
    /* 加班：每條線每天取最大加班人數／時數，加班件數加總（Daily Sewing Output 的 OT 欄） */
    {let pcs=0,w=0,hrs=0;const lines={};Object.keys(days).filter(inP).forEach(d=>{const by={};days[d].forEach(r=>{pcs+=num(r.otPcs);const k=String(r.lineNo||'');const o=by[k]=by[k]||{w:0,h:0};o.w=Math.max(o.w,num(r.workersOT));o.h=Math.max(o.h,num(r.hoursOT))});Object.keys(by).forEach(k=>{if(by[k].w>0){w+=by[k].w;hrs+=by[k].w*by[k].h;lines[k]=1}})});
      x.ot=pcs>0||w>0?{pcs:Math.round(pcs),workers:Math.round(w),manHours:Math.round(hrs),lines:Object.keys(lines).length,share:f.sewing.pieces>0&&pcs>0?Math.round(pcs/f.sewing.pieces*1000)/10:null}:null}
    /* 目標達成與現場回報的掉量原因（Daily Production Output Report：tSrc target） */
    {const t=sewAll.filter(r=>r.tSrc==='target'&&inP(dayKey(r.date))&&num(r.target)>0);let tg=0,ac=0;const iss={},rem=[],low=[];
      t.forEach(r=>{tg+=num(r.target);ac+=num(r.pieces);const is=r.issue||{};const hit=ISSUE_KEYS.filter(k=>is[k]);hit.forEach(k=>{(iss[k]=iss[k]||{}),iss[k][LS(r.lineNo)]=1});const a=num(r.target)>0?num(r.pieces)/num(r.target)*100:null;if(r.remark&&String(r.remark).trim())rem.push({line:LS(r.lineNo),date:dayKey(r.date),text:String(r.remark).trim(),ach:a});if(a!=null&&a<80)low.push({line:LS(r.lineNo),ach:Math.round(a),why:hit.map(k=>ISSUE_ZH[k])})});
      const issues=ISSUE_KEYS.filter(k=>iss[k]).map(k=>({key:k,zh:ISSUE_ZH[k],lines:Object.keys(iss[k]).sort((a,b)=>lno(a)-lno(b))})).sort((a,b)=>b.lines.length-a.lines.length);
      const byLineT={};t.forEach(r=>{const o=byLineT[LS(r.lineNo)]=byLineT[LS(r.lineNo)]||{target:0,actual:0};o.target+=num(r.target);o.actual+=num(r.pieces)});
      x.target=t.length?{byLine:byLineT,target:Math.round(tg),actual:Math.round(ac),ach:tg>0?Math.round(ac/tg*1000)/10:null,rows:t.length,issues,remarks:rem.sort((a,b)=>(a.ach==null?999:a.ach)-(b.ach==null?999:b.ach)).slice(0,4),low:low.sort((a,b)=>a.ach-b.ach).slice(0,4)}:null}
    /* 停工／沒生產的工作天：週報＝這週內（到今天為止）；日報＝上一個有資料的日子到今天中間 */
    {const from=W?f.start:(f.prevDay&&f.prevDay.date?addDays(f.prevDay.date,1):''),to=W?(f.end<f.today?f.end:f.today):addDays(f.anchor,-1);const stop=[];if(from)for(let d=from;d&&d<=to&&stop.length<31;d=addDays(d,1))if(DR.isWorkday(d)&&!days[d])stop.push(d);x.stopDays=stop;
      x.holidays=DR.holidayRuns(f.start,f.end).map(r=>({name:r.name,start:r.start,end:r.end,days:r.days}));
      x.offDayWork=!W&&!DR.isWorkday(f.anchor)&&f.sewing.rows>0?{name:(DR.holidayRuns(f.anchor,f.anchor)[0]||{}).name||(dowMon0(f.anchor)===6?'週日':'休息日')}:null;
      x.workdaysInPeriod=(()=>{let n=0;for(let d=f.start;d&&d<=f.end;d=addDays(d,1))if(DR.isWorkday(d))n++;return n})()}
    /* 本月每天的件數（日報用來看今天是不是本月最高／最低） */
    if(!W&&f.sewing.rows){const ym=f.anchor.slice(0,7);const arr=Object.keys(days).filter(d=>d.slice(0,7)===ym&&d<=f.anchor).map(d=>({date:d,pieces:days[d].reduce((s,r)=>s+num(r.pieces),0)}));const sorted=arr.slice().sort((a,b)=>b.pieces-a.pieces);const others=arr.filter(z=>z.date!==f.anchor).map(z=>z.pieces),cur=(arr.filter(z=>z.date===f.anchor)[0]||{}).pieces||0,avg=others.length?others.reduce((u,v)=>u+v,0)/others.length:0;x.month={days:arr.length,isHigh:others.length>=3&&cur>Math.max.apply(null,others)&&cur>=avg*1.05,isLow:others.length>=3&&cur<Math.min.apply(null,others)&&cur<=avg*0.9&&DR.isWorkday(f.anchor)}}
    /* 代工（CMT）：本月排單裡客戶或產品欄寫 CMT／代工 的量 */
    {const ym=f.end.slice(0,7);const rows=(data.prodplan||[]).filter(r=>r&&String(r.month||'').slice(0,7)===ym);const tot=rows.reduce((s,r)=>s+(num(r.sewingQty)||num(r.orderQty)),0);const c=rows.filter(r=>/CMT|代工/i.test(String(r.customer||'')+' '+String(r.product||'')+' '+String(r.remark||'')));const q=c.reduce((s,r)=>s+(num(r.sewingQty)||num(r.orderQty)),0);
      x.cmt=q>0?{qty:Math.round(q),share:tot>0?Math.round(q/tot*1000)/10:null,customers:[...new Set(c.map(r=>String(r.customer||'').trim()).filter(Boolean))].slice(0,3)}:null}
    if(f.loading){x.load={week:adjLoad(f.loading.week),next:adjLoad(f.loading.next)}}
    try{x.po=planOutlook(data,f)}catch(e){x.poError=String(e&&e.message||e)}
    x.stdHours=f.sewing&&f.sewing.prodMin?Math.round(f.sewing.prodMin/60):null;
    /* 現場備註（任何來源的 remark／comment），一組一天只記一次 */
    {const fl={relabel:[],wipOnly:[],trimHold:[],changeover:[],cutSupply:[],smvMissing:[],smvReview:[],machine:[]},seen={};
      sewAll.forEach(r=>{const d=dayKey(r.date);if(!inP(d))return;const t=r.remark||r.comment||r.comments||'';if(!String(t).trim())return;const key=d+'|'+LS(r.lineNo)+'|'+t;if(seen[key])return;seen[key]=1;const c=classifyRemark(t);
        c.kinds.forEach(k=>{if(fl[k].some(z=>z.date===d&&z.line===LS(r.lineNo)))return;fl[k].push({date:d,line:LS(r.lineNo),qty:k==='trimHold'?c.qty:0,item:c.item})})});
      x.floor=Object.keys(fl).some(k=>fl[k].length)?fl:null}
    x.v=VERSION;return x}

  /* ── 情境：今天（這週）是哪一種日子。w＝重要度（開頭只講最重的一件，其餘變標籤）；tone＝燈號；focus＝哪一段排最前面 ── */
  /* 週報那一週含月底最後一個工作天 → 月結（Paul 11/3：少做幾天不代表效率變差，用每工作日標準工時＋加權效率比） */
  function monthCloseOf(f){if(f.period!=='week'||!f.months)return null;const M=f.months;let ym=null;for(let d=f.start;d&&d<=f.end;d=addDays(d,1)){if(addDays(d,1).slice(0,7)!==d.slice(0,7)){ym=d.slice(0,7);break}}if(!ym)return null;
    const list=[M.cur,M.prev,M.prev2].filter(Boolean);const i=list.findIndex(m=>m.ym===ym);if(i<0)return null;const cur=list[i],prev=list[i+1]||null;if(!cur||!cur.days)return null;
    return {cur,prev,daysChg:prev&&prev.days?Math.round((cur.days-prev.days)/prev.days*1000)/10:null,ehChg:prev&&prev.earnedH?Math.round((cur.earnedH-prev.earnedH)/prev.earnedH*1000)/10:null}}
  function scenarios(f){const S=[];const x=f.x||{};const s=f.sewing||{},c=f.compare||{},pv=f.prevDay||{},M=f.months||{},cal=f.cal||{},o=f.outlook||{},q=f.qc||{},fb=f.fabric||{},w=f.wip||{},sh=f.shipping||{},pl=f.plan,L=f.loading;
    const W=f.period==='week',PL=f.kind==='plan';const when=W?'這週':'今天',prevW=W?'上週':'昨天';
    /* 舊版存下來的報告沒有 stale 旗標：客戶統計快照超過 14 天一律當過期，不拿來判斷缺布 */
    if(fb.snapshotDate&&/^\d{4}-\d{2}-\d{2}$/.test(fb.snapshotDate)&&fb.stale==null){let age=0;for(let d=fb.snapshotDate;d<f.end&&age<400;d=addDays(d,1))age++;if(age>14)fb.stale=true}
    const add=(id,wt,tone,tag,head,focus,who,act)=>S.push({id,w:wt,tone,tag,head,focus:focus||'',who:who||'',act:act||''});
    const has=id=>(f.scenarios||[]).some(z=>z.id===id);
    const hol=(x.holidays||[]);const holTxt=hol.map(r=>r.name+(r.days>1?' '+r.days+' 天':'')).join('、');
    const FL=x.floor||{};const relabelLines=[...new Set((FL.relabel||[]).map(z=>z.line))];
    const weak=(f.lines||[]).filter(z=>z.verdict==='weak'&&z.eff!=null&&relabelLines.indexOf(LS(z.line))<0).sort((a,b)=>a.eff-b.eff);
    const RZ={trimHold:'缺輔料',changeover:'換款',cutSupply:'裁片不足',smvReview:'SMV 重測',smvMissing:'沒 SMV',machine:'機台'};const why=l=>{const r=Object.keys(RZ).filter(k=>(FL[k]||[]).some(z=>z.line===l)).map(k=>{const n=(FL[k]||[]).filter(z=>z.line===l).length;return RZ[k]+(n>1?' '+n+' 天':'')});return r.length?'（'+r.join('、')+'）':''};
    const weakTxt=weak.slice(0,3).map(z=>LS(z.line)+' '+P0(z.eff)+'%'+(W&&z.pieces?'・'+N(z.pieces)+' 件':'')+why(LS(z.line))).join('、');
    /* ── 共用：行事曆、出貨、料、月進度、接單 ── */
    if(cal.nextOff&&cal.wdToNextOff!=null&&cal.wdToNextOff<=3){const r=cal.nextOff;const rng=md(r.start)+(r.days>1?'–'+md(r.end):'');
      if(W||PL)add('beforeHoliday',PL?72:70,'A','下週放 '+r.days+' 天','接下來放'+r.name+'（'+rng+'，'+r.days+' 天）'+(PL?'，那 '+r.days+' 天排單要扣掉':'')+'，手上的款和要出的櫃假前先收乾淨。','plan');
      else add('beforeHoliday',70,'A','假前 '+cal.wdToNextOff+' 天',r.name+'（'+rng+'）'+(cal.wdToNextOff===0?'明天就放':'前只剩 '+cal.wdToNextOff+' 個工作天')+'，手上的款、要出的櫃先收乾淨。','plan')}
    if(sh.overdueRows)add('shipOverdue',69,'R','逾期未出',N(sh.overdueRows)+' 筆過了 ETD 還沒出（'+N(sh.overdueOpen)+' 件），先跟船務對實際裝櫃日。','ship','出貨／船務','確認裝櫃日，更新出貨表');
    else if(o.nextShip&&o.nextShip.length){const n0=o.nextShip[0];add('shipSoon',43,'I','兩週內出 '+o.nextShip.length+' 批','兩週內要出 '+o.nextShip.length+' 批，最近的是 '+md(n0.etd)+' '+n0.cust+' '+N(n0.open)+' 件，生產順序跟著船期走。','ship')}
    if(fb.stale)add('fabricStale',22,'I','客戶統計過期','客戶統計停在 '+md(fb.snapshotDate)+'，缺布數字先不看，要更新。','');
    else if(fb.noFabricShare!=null&&fb.noFabricShare>=TH.fabG)add('fabric',fb.noFabricShare>=TH.fabA?(PL?80:62):(PL?58:46),fb.noFabricShare>=TH.fabA?'R':'A','缺布 '+P0(fb.noFabricShare)+'%','還沒車縫的單有 '+P0(fb.noFabricShare)+'%（'+N(fb.noFabricPcs)+' 件）沒布'+(fb.byCust&&fb.byCust[0]?'，最多是 '+fb.byCust[0].customer:'')+'。單看起來多，能上線的要扣掉這塊，排單跟著到布日走。','','倉庫／採購','追到布日，回寫排單');
    if(pl&&cal.monthEnd)add('monthEnd',65,pl.remaining>0?'A':'G','月底',pl.remaining>0?mon(pl.month)+'只剩 '+N(pl.workdaysLeft)+' 個工作天，還差 '+N(pl.remaining)+' 件'+(pl.requiredPerDay?'，每天要 '+N(pl.requiredPerDay)+(s.perDay?'（現在日均 '+N(s.perDay)+'）':''):'')+'。做不完的 PO 現在就列出來。':mon(pl.month)+'排單已做到 '+P0(pl.completion)+'%，月底前收尾。','plan');
    else if(pl&&pl.elapsedShare!=null){const gap=pl.completion-pl.elapsedShare;if(gap<=-10)add('behind',gap<=-15?73:63,gap<=-15?'R':'A','本月落後',mon(pl.month)+'落後：時間過了 '+P0(pl.elapsedShare)+'%，只做到 '+P0(pl.completion)+'%。剩 '+N(pl.workdaysLeft)+' 個工作天，每天要 '+N(pl.requiredPerDay)+' 件'+(s.perDay?'（現在日均 '+N(s.perDay)+'）':'')+'。','plan','生管／PMC','列出會跨月的 PO，先對交期');else if(gap>=8)add('ahead',28,'G','本月超前',mon(pl.month)+'超前：時間過了 '+P0(pl.elapsedShare)+'%，已做到 '+P0(pl.completion)+'%。有布的單可以往前拉。','plan')}
    if(o.backlogMonths!=null&&(W||PL)){const b=o.backlogMonths;if(b>=2)add('backlogHigh',44,'A','接單 '+b+' 個月','有布可做的單 '+N(o.readyNotSewn)+' 件，約 '+b+' 個月的量，'+(b>=3?'可以開始談加組、招人。':'可以考慮加班。'),'');else if(b<1)add('backlogLow',52,'A','接單不到 1 個月','有布可做的單只剩 '+N(o.readyNotSewn)+' 件，不到一個月（'+b+' 個月）。盯接單和到布，排不滿的組先併，真沒單再提局部停工。','');else add('backlogOk',18,'G','接單 '+b+' 個月','有布可做的單約 '+b+' 個月，正常。','')}
    if(x.cmt)add('cmt',32,'I','代工 '+(x.cmt.share!=null?P0(x.cmt.share)+'%':N(x.cmt.qty)),mon(f.end.slice(0,7))+'排單含代工（CMT）'+N(x.cmt.qty)+' 件'+(x.cmt.share!=null?'，占 '+P0(x.cmt.share)+'%':'')+'。代工和自家單分開看，不混在一起算。','plan');

    if(PL){ /* ── 排單週報 ── */
      if(!L){add('noplan',95,'R','沒有排單','這週系統裡沒有 Production Plan 的排單資料，先把排產表匯進來。','load','生管／PMC','匯入最新排產表');return S.sort((a,b)=>b.w-a.w)}
      const AL=x.load||{week:adjLoad(L.week),next:adjLoad(L.next)};const wk=AL.week,nx=AL.next;const PMC='生管／PMC';
      if(hol.length)add('shortWeek',74,'I','放假 '+hol.reduce((a,r)=>a+r.days,0)+' 天','這週放'+holTxt+'，只有 '+N(wk.workdays)+' 個工作天，排單量要照天數看。','load');
      if(wk.workdays>0&&wk.emptyLines.length)add('emptyLines',85,'R','空線 '+wk.emptyLines.length+' 組',lsList(wk.emptyLines)+(f.today&&f.end<f.today?' 那一週表上沒排單（那週已經過了，只供檢討；現在的空檔看最新排單），':' 這週完全沒排單，')+N(wk.emptyLines.length*wk.workdays)+' 組日空著。有布的單先補進去，真的沒料再按組提局部停工。','load',PMC,'有布的單補進空線；無料再提局部停工');
      if(nx&&nx.workdays>0&&nx.emptyLines.length)add('nextEmpty',75,'A','下週未排 '+nx.emptyLines.length+' 組','下週（'+md(nx.start)+'–'+md(nx.end)+'）'+(nx.emptyLines.length===nx.lineCount&&nx.lineCount>1?N(nx.lineCount)+' 組都還沒排':lsList(nx.emptyLines)+' 還沒排，負荷只有 '+P0(nx.pct)+'%')+'，這週內要排完。','load',PMC,'本週內排完下週並確認物料');
      if(wk.pct!=null&&wk.workdays>0){if(wk.pct<TH.loadA&&!wk.emptyLines.length)add('loadLow',82,'R','負荷 '+P0(wk.pct)+'%','這週負荷只有 '+P0(wk.pct)+'%（'+N(wk.sched)+'/'+N(wk.avail)+' 組日），排不滿。','load',PMC,'把有布的單往前拉，補滿空檔');else if(wk.pct>=TH.loadG)add('loadFull',26,'G','負荷 '+P0(wk.pct)+'%','這週排滿：負荷 '+P0(wk.pct)+'%，'+N(wk.lineCount)+' 組、'+N(wk.styles)+' 款、約 '+N(wk.pieces)+' 件。','load')}
      if(wk.gaps.length)add('gap',60,'A','中途空檔','中途空檔：'+(wk.gaps.length>4?N(wk.gaps.length)+' 組（'+wk.gaps.slice(0,3).map(z=>z.short).join('、')+'…）各空 2 天以上':wk.gaps.map(z=>z.short+' '+z.gap+' 天').join('、'))+'，補排或把前後款拉長，不要整組等。','load',PMC,'補排或延伸前後款');
      const po=x.po;if(po){const hn=po.holiday?po.holiday.name:'';
        if(po.dataLagDays>=2)add('dataLag',90,'A','日報停在 '+md(po.lastData),'車縫日報只進到 '+md(po.lastData)+'（少 '+po.dataLagDays+' 個工作天），各組「已做多少」是照排單推的，先把日報補進來再看進度。','outlook','AI／生管','補匯 '+md(addDays(po.lastData,1))+' 以後的車縫日報');
        if(po.useShare!=null&&po.useShare>100)add('overCap',84,'R','超過產能','到月底還要 '+N(po.hours)+' 工時，照上月效率只做得出 '+N(po.availHours)+' 工時（'+P0(po.useShare)+'%），做不完，要排加班或往後移。','now','生管／PMC','列出往後移的款，或提加班');
        else if(po.useShare!=null&&po.useShare<70)add('underCap',68,'I','產能用 '+P0(po.useShare)+'%','到月底還要 '+N(po.hours)+' 工時，照上月效率可做 '+N(po.availHours)+' 工時，只用到 '+P0(po.useShare)+'%。產能夠，問題在布什麼時候能用、單放在哪一組。','now');
        if(po.slip>0)add('slip',83,'A','拖到下月 '+N(po.slip),'照最近的實際速度（目標的 '+po.pace+'%），約 '+N(po.slip)+' 件（'+P0(po.slipShare)+'%）會拖到下個月，在 '+lsList(po.slipLines)+'。','outlook','生管／PMC','把會拖的款分給 '+(po.idleAfter.length?po.idleAfter.slice(0,3).join('、'):'有空檔的組'));
        if(po.holiday&&po.idleAfter.length)add('idleAfter',79,'A',hn+'後 '+po.idleAfter.length+' 組沒單',hn+'後到月底 '+po.postDays+' 天，'+lsList(po.idleAfter)+' 表上沒單。先把別組做不完的單調過來，不用為這幾天停工。','outlook','生管／PMC','假前排好節後調單');
        const nb=po.due.filter(z=>!z.container&&z.open>0);if(nb.length)add('dueNoBox',67,'A','有交期沒櫃',nb.slice(0,2).map(z=>z.customer+' '+N(z.open)+' 件').join('、')+' 交期在月底前後，出貨表上沒有對應的櫃。','due','出貨／船務','跟客戶確認櫃期，更新出貨表');
        if(po.check.unscheduled.length)add('unscheduled',64,'A','有交期沒排 '+N(po.check.unscheduledQty),'交期到了但排單表找不到：'+po.check.unscheduled.slice(0,3).map(z=>z.style+' '+N(z.qty)).join('、')+'（共 '+N(po.check.unscheduledQty)+' 件）。確認是漏排還是已在做。','check','生管／PMC','確認漏排的款在哪一組');
        if(po.check.dups.length)add('dupStyle',42,'A','重複排 '+po.check.dups.length+' 款','同一款排在兩組：'+po.check.dups.slice(0,2).map(z=>z.style+'（'+z.lines.join('／')+'）').join('、')+'，確認是分單還是重複。','check','生管／PMC','確認重複排的款');
        if(po.check.finished.length)add('finishedListed',41,'I','做完還在表上','已做完還留在排單表：'+po.check.finished.slice(0,3).map(z=>z.style+'（'+z.line+'）').join('、')+'。','check','生管／PMC','排單表刪掉已完成的款')}
      if(L.attainment!=null&&L.exposure>0){if(L.attainment<70)add('attainLow',66,'A','達成 '+P0(L.attainment)+'%','這週排 '+N(L.exposure)+' 件、實際做 '+N(L.actual)+' 件（'+P0(L.attainment)+'%）。差的要逐 PO、逐組對，臨時轉線寫回排產表。','load',PMC,'逐 PO／組對帳，轉線寫回排產表');else if(L.attainment>=100)add('attainHigh',30,'G','達成 '+P0(L.attainment)+'%','這週排 '+N(L.exposure)+' 件、做了 '+N(L.actual)+' 件（'+P0(L.attainment)+'%），有照排單走。','load')}
      const chg=wk.lines.filter(z=>z.changeovers>=TH.chgHigh);if(chg.length)add('changeover',50,'A','換款多','換款偏多：'+chg.map(z=>z.short+' '+z.changeovers+' 次').join('、')+'。每換一次先吃效率，同款同色連著排。','load',PMC,'同款同色連排，換款前備好裁片輔料');
      else if(nx&&nx.changeovers>=Math.max(4,nx.lineCount/2))add('nextChange',38,'I','下週換款 '+nx.changeovers+' 次','下週有 '+N(nx.changeovers)+' 次換款，裁片和輔料要在換款前到線邊。','load');
      if(L.undated)add('undated',48,'A','沒填日期 '+L.undated+' 筆','排產表有 '+N(L.undated)+' 筆沒填上線日／下線日，不會進甘特和負荷，要補。','load',PMC,'補上線日／下線日');
      if(L.smv&&L.smv.missing)add('smvMissing',40,'A','缺 SMV '+L.smv.missing+' 款','這週排的 '+N(L.smv.styles)+' 款裡有 '+N(L.smv.missing)+' 款沒有正式 SMV（'+L.smv.missingStyles.slice(0,3).join('、')+'），IE 要補。','load','IE','補正式 SMV');
      if(L.conc&&L.conc.customers.length&&L.conc.customers[0].share>=60)add('concentration',35,'I',L.conc.customers[0].customer+' 占 '+P0(L.conc.customers[0].share)+'%',mon(L.conc.month)+'排單 '+L.conc.customers[0].customer+' 一家占 '+P0(L.conc.customers[0].share)+'%，順不順看這家的到布。','load');
      if(!S.some(z=>z.w>=40))add('steady',25,'G','平穩','這週排單平穩：負荷 '+P0(wk.pct)+'%，'+N(wk.lineCount)+' 組、'+N(wk.styles)+' 款，沒有空線。','load');
      return S.sort((a,b)=>b.w-a.w)}

    /* ── 日報／效率週報 ── */
    if(!f.hasData||!s.rows){add('nodata',100,'I','沒有資料',when+'還沒收到車縫日報，產量和效率先空著，報表進來會重算。','');return S.sort((a,b)=>b.w-a.w)}
    const partial=f.coverage&&f.coverage.partial&&!x.offDayWork;
    if(partial)add('partial',95,'A','日報沒到齊','日報沒到齊：只收到 '+N(s.lines)+' 條線（平常 '+N(f.coverage.typicalLines)+' 條），下面數字先不要拿去比。','sew');
    if(x.offDayWork)add('otHoliday',88,'I',x.offDayWork.name+'加班',x.offDayWork.name+'加班：開 '+N(s.lines)+' 條線、'+N(s.manpower)+' 人，做了 '+N(s.pieces)+' 件'+(s.eff!=null?'，效率 '+P1(s.eff)+'%':'')+'。','sew');
    if(W){
      if(hol.length)add('shortWeek',82,'I','放假 '+hol.reduce((a,r)=>a+r.days,0)+' 天','這週放'+holTxt+'，只做 '+N(s.dayCount)+' 天，總量少是正常的。看日均：'+N(s.perDay)+' 件'+(pv.perDay?'（上週 '+N(pv.perDay)+'）':'')+(s.eff!=null?'，效率 '+P1(s.eff)+'%':'')+'。','days');
      if(x.stopDays&&x.stopDays.length)add('stopDays',86,'A','停工 '+x.stopDays.length+' 天','這週有 '+x.stopDays.length+' 個工作天沒有生產（'+x.stopDays.map(md).join('、')+'）：停工或日報沒進來，要確認。實際做 '+N(s.dayCount)+' 天、'+N(s.pieces)+' 件。','days')}
    else{
      if(cal.afterBreak)add('afterBreak',84,'I','收假',(cal.afterBreak.names.length?cal.afterBreak.names.join('、')+'收假':'休 '+cal.afterBreak.days+' 天後')+'第一天：'+N(s.pieces)+' 件'+(s.eff!=null?'、效率 '+P1(s.eff)+'%':'')+'。人和節奏還在回來，今天先看出勤和缺料，效率明天再比。','sew');
      else if(x.stopDays&&x.stopDays.length)add('stopGap',86,'A','停 '+x.stopDays.length+' 天後復工',x.stopDays.map(md).join('、')+' 沒有車縫日報（停工或漏報），今天是復工第一天：'+N(s.pieces)+' 件'+(s.eff!=null?'、效率 '+P1(s.eff)+'%':'')+'。','sew')}
    if(!partial){
      const dLines=pv.lines!=null?s.lines-pv.lines:0;const mpPct=pv.manpower?(s.manpower-pv.manpower)/pv.manpower*100:null;
      if(!W&&dLines<=-1&&!x.offDayWork)add('lineCut',76,'A','減 '+Math.abs(dLines)+' 組','今天少開 '+Math.abs(dLines)+' 條線（'+N(pv.lines)+' → '+N(s.lines)+'），件數 '+N(s.pieces)+arrow(c.piecesVsPrev).trim()+'。','lines');
      if(!W&&dLines>=1&&!x.offDayWork&&!cal.afterBreak)add('lineAdd',60,'G','加 '+dLines+' 組','今天多開 '+dLines+' 條線（'+N(pv.lines)+' → '+N(s.lines)+'），件數 '+N(s.pieces)+arrow(c.piecesVsPrev).trim()+'。新開的組頭幾天效率會低，先看出勤和料。','lines');
      if(x.offDayWork){}
      else if(mpPct!=null&&mpPct<=-5&&dLines>=0)add('absent',74,'A','少 '+N(Math.abs(c.manpowerVsPrev))+' 人',when+'車縫少了 '+N(Math.abs(c.manpowerVsPrev))+' 人（'+N(pv.manpower)+' → '+N(s.manpower)+'），件數 '+N(s.pieces)+arrow(c.piecesVsPrev).trim()+'。先分清楚是請假還是離職。','sew');
      else if(f.manpowerTrend&&f.manpowerTrend.vsMonthPct!=null&&f.manpowerTrend.vsMonthPct<=-6)add('manpower',66,'A','人力少 '+P0(Math.abs(f.manpowerTrend.vsMonthPct))+'%','車縫人力 '+N(s.manpower)+' 人，比'+(M.prev?M.prev.label:'上月')+'每天平均 '+N(f.manpowerTrend.monthAvg)+' 人少 '+P0(Math.abs(f.manpowerTrend.vsMonthPct))+'%。排單件數要跟著人數調，HRA 盤缺員和補人進度。','sew');
      /* v1.2（11/24，照 Paul 7–11 月週報）：週報一律用「每個生產日」比；上一期只有 1–3 天（收假、停工後）不跳「先查」，改寫「恢復」；
         件數大漲大跌但每日標準工時差不多＝產品結構（餐巾、桌布、圍裙），不是產能變了 */
      const pvShort=W&&pv.dayCount!=null&&pv.dayCount<=3;const swing=W?c.perDayVsPrev:c.piecesVsPrev;const stdSw=c.stdPerDayVsPrev;
      const famTop=(s.fam||[]).filter(z=>z.fam!=='GARMENT').sort((a,b)=>b.share-a.share)[0];const FZ={NAPKIN:'餐巾',TOP:'桌布',APRON:'圍裙',OTHER:'其他'};
      if(W&&pvShort&&s.perDay&&pv.perDay)add('recovery',80,'I','恢復','上週只做 '+N(pv.dayCount)+' 天（收假或停工後），這週 '+N(s.dayCount)+' 天、日均 '+N(s.perDay)+' 件（上週 '+N(pv.perDay)+'）'+(s.eff!=null?'，效率 '+P1(s.eff)+'%':'')+'。用每天平均和標準工時比，不拿總件數比。','sew');
      else if(swing!=null&&Math.abs(swing)>=25&&stdSw!=null&&Math.abs(stdSw)<=12&&famTop&&famTop.share>=20)add('mixPcs',79,'I',(swing>0?'件數多是':'件數少是')+FZ[famTop.fam]+'帶的',(W?'日均':'件數')+'件數'+(swing>0?'多了 ':'少了 ')+P0(Math.abs(swing))+'%，但每天標準工時只'+(stdSw>=0?'多 ':'少 ')+P0(Math.abs(stdSw))+'%（'+N(pv.stdHoursPerDay)+' → '+N(s.stdHoursPerDay)+' 小時）：'+FZ[famTop.fam]+'占 '+P0(famTop.share)+'% 件數、只占 '+P0(famTop.hourShare)+'% 工時。產能沒有跟著件數變，看效率和標準工時。','sew');
      else if(swing!=null&&Math.abs(swing)>=50&&!x.offDayWork&&!cal.afterBreak&&!(x.stopDays&&x.stopDays.length)&&!(W&&hol.length)&&Math.abs(dLines)<2)add('bigSwing',78,'A','差 '+P0(Math.abs(swing))+'% 先查',(W?'日均':'件數')+'和'+prevW+'差了 '+P0(Math.abs(swing))+'%（'+N(W?pv.perDay:pv.pieces)+' → '+N(W?s.perDay:s.pieces)+'），先確認日報有沒有缺或重複，再看原因。','sew');
      if(c.effVsPrevPt!=null&&s.eff!=null){
        if(c.effVsPrevPt<=-3){const mpDown=mpPct!=null&&mpPct<=-5;add('effDown',s.eff<TH.effA?77:72,s.eff<TH.effA?'R':'A','效率 ▼'+P1(Math.abs(c.effVsPrevPt)),'效率掉到 '+P1(s.eff)+'%（'+prevW+' '+P1(pv.eff)+'%）'+(mpDown?'，人也少了 '+N(Math.abs(c.manpowerVsPrev))+' 位':'，人沒少')+(weakTxt?'，拖住的是 '+weakTxt:'')+'。','lines')}
        else if(c.effVsPrevPt>=3){const best=(f.lines||[]).filter(z=>z.eff!=null).sort((a,b)=>b.eff-a.eff).slice(0,2).map(z=>LS(z.line)+' '+P0(z.eff)+'%').join('、');add('effUp',48,'G','效率 ▲'+P1(c.effVsPrevPt),'效率 '+P1(s.eff)+'%，比'+prevW+'高 '+P1(c.effVsPrevPt)+' 點'+(best?'，'+best+' 帶頭':'')+'。','lines')}}
      if(s.eff!=null&&s.eff<TH.effA&&!S.some(z=>z.id==='effDown'))add('effRed',62,'R','效率 '+P1(s.eff)+'%','全廠效率只有 '+P1(s.eff)+'%，低於 '+TH.effA+'%'+(weak.length?'；'+weak.length+' 條線在 '+TH.lineLow+'% 以下：'+weakTxt:'')+'。','lines');
      if(weak.length&&!S.some(z=>z.id==='effDown'||z.id==='effRed'))add('weakLines',66,'A','低效 '+weak.length+' 組',weakTxt+' 低於 '+TH.lineLow+'%'+(weak.length<=2?'，其他組正常，問題在這'+(weak.length===1?'一':'兩')+'組':'')+'。先看換款、缺料、工序平衡。','lines');
      const effLines=(f.lines||[]).filter(z=>z.eff!=null);if(effLines.length>=6&&effLines.every(z=>z.eff>=TH.lineOk))add('allGreen',30,'G','全線 '+TH.lineOk+'% 以上',N(effLines.length)+' 條線全部 '+TH.lineOk+'% 以上，'+when+'沒有拖後腿的組。','lines');
      if(x.month&&x.month.isHigh)add('dayHigh',46,'G','本月最高','今天 '+N(s.pieces)+' 件，是'+mon(f.anchor.slice(0,7))+'到目前最高的一天'+(s.eff!=null?'，效率 '+P1(s.eff)+'%':'')+'。','sew');
      else if(x.month&&x.month.isLow&&!cal.afterBreak)add('dayLow',58,'A','本月最低','今天 '+N(s.pieces)+' 件，是'+mon(f.anchor.slice(0,7))+'到目前最低的一天'+(M.cur&&M.cur.perDay?'（本月日均 '+N(M.cur.perDay)+'）':'')+'。','sew');
      if(f.mixShift!=null&&Math.abs(f.mixShift)>=20&&M.prev&&M.prev.avgSmv)add('mix',40,'I',f.mixShift<0?'短工時款':'長工時款',when+'做的款'+(f.mixShift<0?'工時短':'工時長')+'（每件 '+P1(s.avgSmv)+' 分，'+M.prev.label+' '+P1(M.prev.avgSmv)+' 分），'+(f.mixShift<0?'件數多不代表做得多':'件數少一點正常')+'，看效率和標準工時。','sew');
      if(x.ot)add('overtime',64,'I','加班',when+'有加班：'+(x.ot.lines?N(x.ot.lines)+' 條線、':'')+(x.ot.workers?N(x.ot.workers)+' 人次':'')+(x.ot.manHours?'、'+N(x.ot.manHours)+' 工時':'')+(x.ot.pcs?'，加班做 '+N(x.ot.pcs)+' 件'+(x.ot.share!=null?'（占 '+P0(x.ot.share)+'%）':''):'')+'。','sew');
      if(x.target&&x.target.issues.length){const top=x.target.issues.slice(0,3);const worst=top[0];add('floorIssue',worst.key==='material'||worst.key==='machine'?71:61,'A','現場：'+top.map(z=>z.zh).join('、'),'現場回報掉量原因：'+top.map(z=>z.zh+' '+z.lines.length+' 組（'+z.lines.slice(0,4).join('、')+'）').join('；')+(x.target.ach!=null?'。目標達成 '+P0(x.target.ach)+'%':'')+'。','floor')}
      else if(x.target&&x.target.ach!=null&&x.target.ach<85)add('targetMiss',59,'A','目標 '+P0(x.target.ach)+'%',when+'目標 '+N(x.target.target)+' 件、做 '+N(x.target.actual)+' 件（'+P0(x.target.ach)+'%）'+(x.target.low.length?'，差最多的是 '+x.target.low.slice(0,3).map(z=>z.line+' '+z.ach+'%').join('、'):'')+'。','floor');
      if((f.riskLines&&f.riskLines.dual.length))add('dualRisk',68,'R','低效＋退修',f.riskLines.dual.map(LS).join('、')+' 效率低、退修又高，兩個問題一起處理，先找是哪道工序做出來的。','qc');
      else if(q.rate!=null&&f.rag&&f.rag.quality==='R')add('qcHigh',67,'R','退修 '+P1(q.rate)+'%','Final QC 退修率 '+P1(q.rate)+'%，偏高'+(q.top&&q.top.length?'，最多是 '+q.top.slice(0,2).map(z=>z.name).join('、'):'')+'。退修吃後段的人和時間，先壓下來。','qc');
      if(f.qcReconcile&&!f.qcReconcile.ok)add('qcMismatch',36,'A','QC 對不上','QC 產出 '+N(f.qcReconcile.qcOutput)+' 件和車縫日報 '+N(f.qcReconcile.sewing)+' 件對不上（差 '+N(Math.abs(f.qcReconcile.diff))+' 件）。','qc');
      if(!q.reports)add('qcMissing',20,'I','',when+'沒有 Final QC 報告。','qc');
      if(f.maint&&f.maint.needle&&f.maint.needle.flag.length)add('needle',34,'A','換針異常',f.maint.needle.flag.slice(0,2).map(z=>LS(z.line)+' 非計畫換針 '+N(z.unplanned)+' 支').join('、')+'，比平常多，機修去看機台。','');
      if(w.daysOfOutput!=null){if(w.daysOfOutput>=TH.wipR)add('wipPile',44,'A','裁片堆 '+P0(w.daysOfOutput)+' 天','已裁未縫 '+N(w.cutNotSewn)+' 件，夠縫 '+P1(w.daysOfOutput).replace(/\.0$/,'')+' 天。裁得比縫快，裁剪可以放慢。','cut');else if(w.daysOfOutput<1.5&&w.cutNotSewn!=null)add('wipLow',54,'A','裁片快斷','已裁未縫只剩 '+N(w.cutNotSewn)+' 件（'+P1(w.daysOfOutput)+' 天），裁片快接不上，裁剪要先趕。','cut')}
      if(!W&&f.cutting&&!f.cutting.rows)add('noCut',24,'I','','今天沒有裁剪報告（沒排裁或等布）。','cut');
      if(cal.monthStart&&M.prev)add('monthStart',50,'I','月初',mon(f.anchor.slice(0,7))+'剛開始。'+M.prev.label+'結算 '+N(M.prev.pieces)+' 件／'+N(M.prev.days)+' 天，日均 '+N(M.prev.perDay)+(M.prev.eff!=null?'，效率 '+P1(M.prev.eff)+'%':'')+'。','sew')}
    const MC=monthCloseOf(f);if(MC){const c0=MC.cur,p0=MC.prev;if(p0&&p0.days&&c0.days<p0.days&&c0.earnedHPerDay!=null&&p0.earnedHPerDay!=null&&c0.earnedHPerDay>=p0.earnedHPerDay)add('monthClose',84,'G',c0.label+'月結',c0.label+'少做幾天，不代表效率變差：'+N(c0.days)+' 天（'+p0.label+' '+N(p0.days)+' 天），月總標準工時少 '+P0(Math.abs(MC.ehChg))+'%、比工作日少的 '+P0(Math.abs(MC.daysChg))+'% 還小；每工作日標準工時 '+N(p0.earnedHPerDay)+' → '+N(c0.earnedHPerDay)+' h'+(c0.eff!=null&&p0.eff!=null?'，效率 '+P1(p0.eff)+'% → '+P1(c0.eff)+'%':'')+'。','sew');
      else add('monthClose',58,'I',c0.label+'月結',c0.label+'月結 '+N(c0.pieces)+' 件、'+N(c0.days)+' 天、日均 '+N(c0.perDay)+(c0.eff!=null?'、效率 '+P1(c0.eff)+'%':'')+(p0?'（'+p0.label+' '+N(p0.pieces)+' 件、'+N(p0.days)+' 天'+(p0.eff!=null?'、'+P1(p0.eff)+'%':'')+'）':'')+'。','sew')}
    if(FL.relabel&&FL.relabel.length){const ls=relabelLines.sort((a,b)=>lno(a)-lno(b));const dd=[...new Set(FL.relabel.map(z=>z.date))].sort();add('relabel',81,'I',ls.join('、')+' 補標',ls.join('、')+' '+(dd.length>1?md(dd[0])+'–'+md(dd[dd.length-1])+'（'+dd.length+' 天）':md(dd[0]))+'做成品改標／補標，新車縫件數低或 0 不是閒置。這幾組的效率另看，補標完成數和用了多少人時要另外記。','lines','車縫主管／IE','補標另記完成數與人時')}
    if(FL.wipOnly&&FL.wipOnly.length)add('wipOnly',47,'I','舊半成品補標',FL.wipOnly.slice(0,3).map(z=>z.line+' '+md(z.date)).join('、')+' 的件數是舊半成品補標（只差商標／鈕扣），效率會偏高，不和完整車縫比。','lines');
    if(FL.trimHold&&FL.trimHold.length){const by={};FL.trimHold.forEach(z=>{const o=by[z.line]=by[z.line]||{line:z.line,days:0,max:0,items:{}};o.days++;o.max=Math.max(o.max,z.qty||0);if(z.item)z.item.split('＋').forEach(i=>{o.items[i]=1})});
      const arr=Object.values(by).sort((a,b)=>b.days-a.days||b.max-a.max);const items=[...new Set(FL.trimHold.map(z=>z.item).filter(Boolean).join('＋').split('＋'))].filter(Boolean).join('、')||'輔料';
      add('trimHold',arr.length>=3||arr.some(o=>o.days>=3)?70:56,'A','缺'+items,'缺'+items+'反覆卡住：'+arr.slice(0,4).map(o=>o.line+(o.days>1?' '+o.days+' 天':'')+(o.max?'（最多 '+N(o.max)+' 件）':'')).join('、')+'，車好了不能結成品。每天的半成品數是當天快照，不能相加。','floor','倉庫／採購','D-1 確認商標／鈕扣到線邊')}
    if(FL.cutSupply&&FL.cutSupply.length)add('cutSupply',52,'A','裁片不足轉款',[...new Set(FL.cutSupply.map(z=>z.line))].join('、')+' 裁片不夠，轉做別款（例如圍裙）撐著，那幾天效率要分開看。','cut','裁剪','裁片先供原排款');
    if(FL.smvReview&&FL.smvReview.length)add('smvReview',46,'A','SMV 重測',[...new Set(FL.smvReview.map(z=>z.line))].join('、')+' 的款 SMV 有問題、IE 在重測，這幾組效率先不拿來評現場（分母不對）。','lines','IE','重測 SMV 並公告');
    if(FL.smvMissing&&FL.smvMissing.length)add('smvNo',44,'A','沒有 IE 工時',[...new Set(FL.smvMissing.map(z=>z.line))].join('、')+' 的款還沒有 IE 工時，效率算不出來，IE 要補。','lines','IE','補 SMV');
    if(!S.some(z=>z.w>=45))add('steady',45,'G','平穩',when+'平穩：'+N(s.pieces)+' 件'+(s.eff!=null?'、效率 '+P1(s.eff)+'%':'')+(c.piecesVsPrev!=null?'，和'+prevW+'差不多':'')+'。','sew');
    return S.sort((a,b)=>b.w-a.w)}

  /* ── 「要處理」：沿用 facts.anomalies（程式算的），寫成兩行「問題」＋「→ 誰：做什麼」 ── */
  const SHORT={eff:'查換款、工序平衡、SMV、人員',fabric:'追到布日，回寫排單',qc:'查前三大缺點，當天回覆改善',dual:'效率和品質一起查，先找工序',output:'找出掉量的組和原因，今天回覆',wip:'安排裁片上線，避免堆積',ship:'確認裝櫃日，更新出貨表',needle:'檢查機台與換針紀錄',plan:'列出會跨月的 PO，先對交期',reconcile:'對 QC 產出與車縫日報',empty:'有布的單補進空線；無料再提局部停工',nextEmpty:'本週內排完並確認物料',gap:'補排或延伸前後款',attain:'逐 PO／組對帳，轉線寫回排產表',change:'同款同色連排，換款前備好裁片輔料',undated:'補上線日／下線日',smv:'IE 補正式 SMV',conc:'追該客戶到布與補排',noplan:'匯入最新排產表'};
  function todoLines(f,sc){sc=sc||scenarios(f);const ids=sc.map(z=>z.id);
    if(f.kind==='plan')return sc.filter(z=>z.act).slice(0,5).map(z=>({q:(f.x&&f.x.po)?z.tag:cut(z.head.replace(/。.*$/,''),62),who:z.who,act:z.act,one:!!(f.x&&f.x.po)}));
    const explained=['otHoliday','shortWeek','stopDays','stopGap','afterBreak','lineCut','partial'].some(id=>ids.indexOf(id)>=0);
    const an=(f.anomalies||[]).slice().sort((a,b)=>(b.sev||0)-(a.sev||0));const out=[];
    const short=a=>{let t=String(a.zh||'');
      if(a.kind==='eff'){const m=t.match(/L\d+\s*\d+%/g);if(m)return '低效線 '+m.map(z=>z.replace(/\s+/,' ')).join('｜')+'（低於 '+TH.lineLow+'%）'}
      if(a.kind==='output'){if(explained)return '';return '件數比'+(f.period==='week'?'上週':'昨天')+'少 '+P0(Math.abs(f.compare.piecesVsPrev))+'%（'+N(f.prevDay.pieces)+' → '+N(f.sewing.pieces)+'）'+(f.compare.manpowerVsPrev!=null&&f.compare.manpowerVsPrev>=0?'，人沒少':'')}
      if(a.kind==='fabric'){if(f.fabric&&f.fabric.stale)return '';const m=t.match(/([\d,]+)\s*件/);return '缺布 '+(m?m[1]+' 件':'')+(a.ref?'・主要 PO '+String(a.ref).replace(/,\s*/g,'、'):'')}
      t=t.replace(/（客戶統計 ?[\d-]+）/,'').replace(/；[^；]*不能把排單當核實餘量/,'').replace(/，每次換款先吃效率/,'');return cut(t,60)};
    an.forEach(a=>{if(out.length>=4)return;const t=short(a);if(!t)return;out.push({q:t,who:(a.who&&a.who.zh)||'負責人',act:SHORT[a.kind]||''})});return out}

  /* ── 版面：標題 → 一句結論（燈號）→ 標籤 → 最要緊的那一段 → 其餘固定順序 → 要處理 → 資料日期 ── */
  function render(f,opts){opts=opts||{};const W=f.period==='week',PL=f.kind==='plan';const sc=scenarios(f);const top=sc[0]||{tone:'I',head:'',focus:''};
    const s=f.sewing||{},c=f.cutting||{},w=f.wip||{},pl=f.plan,q=f.qc||{},cmp=f.compare||{},pv=f.prevDay||{},x=f.x||{},L=f.loading;
    const b=t=>'<b>'+t+'</b>';const HR='━━━━━━━━━━━━';const out=[];const push=t=>out.push(t);
    const title=PL?'📋 '+b('VRT 排單週報')+'　'+md(f.start)+'–'+md(f.end):W?'📅 '+b('VRT 效率週報')+'　'+md(f.start)+'–'+md(f.end):'📰 '+b('VRT 生產日報')+'　'+md(f.anchor||f.date)+'（'+esc(f.dow||DOW[dowMon0(f.anchor||f.date)])+'）';
    push(title);
    if(opts.note)push('📌 '+b(esc(cut(opts.note,80))));
    let nHead=1;
    if(PL&&x.po){const hs=sc.filter(z=>z.id!=='steady'&&z.id!=='backlogOk').slice(0,3);nHead=hs.length||1;if(hs.length>1){push(b('三句話結論'));hs.forEach((z,i)=>push('①②③'.charAt(i)+' '+light(z.tone)+' '+(i===0?b(esc(z.head)):esc(z.head))))}else push(light(top.tone)+' '+b(esc(top.head)))}
    else push(light(top.tone)+' '+b(esc(top.head)));
    const second=(PL&&x.po)?null:sc.slice(1).filter(z=>z.w>=60&&z.id!=='steady')[0];if(second){push(light(second.tone)+' '+esc(second.head));nHead=2}
    const tags=sc.slice(nHead).filter(z=>z.tag&&z.id!=='steady'&&z.id!=='backlogOk').slice(0,4).map(z=>light(z.tone)+z.tag);if(tags.length)push('🏷 '+esc(tags.join('　')));
    push(HR);
    const SEC={};
    /* 車縫 */
    SEC.sew=()=>{const o=[];if(!s.rows)return o;const t=effTone(s.eff);
      o.push('🧵 '+b('車縫')+'　'+N(s.pieces)+' 件'+arrow(cmp.piecesVsPrev)+(W&&s.perDay?'・日均 '+N(s.perDay):''));
      const sub=[];if(s.lines)sub.push(N(s.lines)+' 線');if(s.manpower)sub.push(N(s.manpower)+' 人');if(W&&s.dayCount)sub.push(N(s.dayCount)+' 天');if(x.stdHours)sub.push('標準工時 '+(W&&s.stdHours!=null?s.stdHours.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}):N(x.stdHours))+' h'+(W&&s.labourHours?'／投入 '+s.labourHours.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})+' h':''));if(sub.length)o.push('　'+sub.join('・'));
      const P2=v=>(Math.round(Number(v)*100)/100).toFixed(2);if(s.eff!=null)o.push('　效率 '+bar(s.eff/50,t)+' '+b((W?P2(s.eff):P1(s.eff))+'%')+(pv.eff!=null?'（'+(W?'上週':'昨')+' '+(W?P2(pv.eff):P1(pv.eff))+'%'+(W?'，'+(s.eff-pv.eff>=0?'+':'')+P2(s.eff-pv.eff)+' 個百分點':'')+'）':''));
      const MC=monthCloseOf(f);if(MC)o.push('📆 '+b(MC.cur.label+'月結')+'　'+N(MC.cur.pieces)+' 件・'+N(MC.cur.days)+' 天・日均 '+N(MC.cur.perDay)+(MC.cur.eff!=null?'・效率 '+P1(MC.cur.eff)+'%':'')+(MC.cur.earnedH?'・標準工時 '+N(MC.cur.earnedH)+' h（每工作日 '+N(MC.cur.earnedHPerDay)+(MC.prev&&MC.prev.earnedHPerDay?'，'+MC.prev.label+' '+N(MC.prev.earnedHPerDay):'')+'）':''));
      if(s.fam&&s.fam.length>1){const FZ={GARMENT:'成衣',APRON:'圍裙',NAPKIN:'餐巾',TOP:'桌布',OTHER:'其他'};const hasH=s.fam.some(m=>m.hourShare>0);o.push('　'+s.fam.map(m=>FZ[m.fam]+' '+N(m.pieces)+(hasH?'（件 '+P1(m.share)+'%／工時 '+P1(m.hourShare)+'%）':'（'+P1(m.share)+'%）')).join('｜')+(s.grs?'｜GRS '+N(s.grs.pieces):''))}
      else if(f.mix&&f.mix.filter(m=>m.pieces>0).length>1)o.push('　'+f.mix.filter(m=>m.pieces>0).map(m=>(m.product==='Apron'?'圍裙':m.product==='Garment'?'成衣':esc(m.product))+' '+N(m.pieces)).join('｜'));
      if(x.target&&x.target.ach!=null)o.push('　目標 '+N(x.target.target)+'・達成 '+P0(x.target.ach)+'%');
      if(x.ot&&x.ot.pcs)o.push('　加班 '+N(x.ot.pcs)+' 件'+(x.ot.workers?'・'+N(x.ot.workers)+' 人次':''));
      return o};
    /* 各組（色燈一排四組，省行數） */
    SEC.lines=()=>{const o=[];const ls=(f.lines||[]).filter(z=>z.eff!=null).slice().sort((a,b2)=>lno(a.line)-lno(b2.line));if(ls.length<2)return o;
      o.push('📊 '+b('各組效率')+'（🟢≥'+TH.lineOk+'　🟡≥'+TH.lineLow+'　🔴＜'+TH.lineLow+'）');
      const po=x.po,tb=x.target&&x.target.byLine;
      if(!W&&po&&po.lines.length){o[0]='📊 '+b('各組')+'（效率｜做／目標｜這張單剩多少・估哪天做完）';ls.forEach(z=>{const k=LS(z.line),pl2=po.lines.filter(q=>q.line===k)[0],t=tb&&tb[k];o.push('　'+light(lineTone(z.eff))+'<code>'+(k+'  ').slice(0,3)+'</code> '+P0(z.eff)+'%'+(t&&t.target?'｜'+N(t.actual)+'/'+N(t.target):'｜'+N(z.pieces))+(pl2&&!pl2.noWork?'｜剩 '+N(pl2.rem)+'・'+md(pl2.cautious)+(pl2.late>0?'🔴':''):pl2?'｜'+(pl2.lastEnd?'排單只排到 '+md(pl2.lastEnd)+'，之後沒排':'排單表上沒有這組'):''))});return o}
      for(let i=0;i<ls.length;i+=4)o.push('　'+ls.slice(i,i+4).map(z=>light(lineTone(z.eff))+LS(z.line)+' '+P0(z.eff)).join('　'));return o};
    /* 每天（週報）：色條＝當天件數相對本週最高；顏色＝當天效率 */
    SEC.days=()=>{const o=[];if(!W||!f.days||!f.days.length)return o;const mx=Math.max.apply(null,f.days.map(d=>d.pieces))||1;const by={};f.days.forEach(d=>{by[d.date]=d});const hol={};(x.holidays||[]).forEach(r=>{for(let d=r.start;d<=r.end;d=addDays(d,1))hol[d]=r.name});
      o.push('🗓 '+b('每天'));for(let d=f.start;d&&d<=f.end;d=addDays(d,1)){const k=DOW[dowMon0(d)],r=by[d];if(r)o.push('　'+k+' '+bar(r.pieces/mx,effTone(r.eff)||'B',8)+' '+N(r.pieces)+(r.eff!=null?'・'+P0(r.eff)+'%':'')+(hol[d]||dowMon0(d)===6?'（加班）':''));else if(hol[d])o.push('　'+k+' 🎌 '+esc(hol[d]));else if(dowMon0(d)===6)continue;else if(d<=f.today)o.push('　'+k+' ⛔ 沒有生產')}return o};
    /* 現場回報 */
    SEC.floor=()=>{const o=[];if(!x.target||(!x.target.issues.length&&!x.target.remarks.length))return o;o.push('🗣 '+b('現場回報'));
      if(x.target.issues.length)o.push('　'+x.target.issues.slice(0,4).map(z=>esc(z.zh)+' '+z.lines.length+' 組').join('・'));
      x.target.remarks.slice(0,2).forEach(r=>o.push('　'+esc(r.line)+'：'+esc(cut(r.text,46))));return o};
    /* 裁剪／在製 */
    SEC.cut=()=>{const o=[];if(c&&c.rows)o.push('✂️ '+b('裁剪')+'　'+N(c.pieces)+' 件'+arrow(cmp.cutVsPrev)+(c.tables?'・'+N(c.tables)+' 床':''));else if(s.rows&&!W)o.push('✂️ '+b('裁剪')+'　今天沒有報告');
      if(w&&w.cutNotSewn)o.push('📦 '+b('已裁未縫')+'　'+N(w.cutNotSewn)+' 件'+(w.daysOfOutput!=null?'（約 '+P1(w.daysOfOutput).replace(/\.0$/,'')+' 天）':''));return o};
    /* 月排單進度：色條＝完成率，旁邊寫時間過了多少 */
    SEC.plan=()=>{const o=[];if(!pl||!pl.planQty)return o;const t=(f.rag&&f.rag.plan)||'G';
      o.push('📅 '+b(mon(pl.month)+'排單')+'　'+N(pl.mtd)+' / '+N(pl.planQty)+' 件');
      o.push('　'+bar(pl.completion/100,t)+' '+b(P0(pl.completion)+'%')+(pl.elapsedShare!=null?'（時間過 '+P0(pl.elapsedShare)+'%）':''));
      if(pl.workdaysLeft!=null&&pl.remaining>0)o.push('　剩 '+N(pl.workdaysLeft)+' 工作天・還要 '+N(pl.remaining)+' 件'+(pl.requiredPerDay?'（每天 '+N(pl.requiredPerDay)+'）':''));return o};
    SEC.qc=()=>{if(PL)return [];if(q&&q.reports)return ['🔍 '+b('QC')+'　退修率 '+(q.rate!=null?P1(q.rate)+'%'+light((f.rag&&f.rag.quality)||'G'):'—')+'・檢驗 '+N(q.inspected)+'・退修 '+N(q.rejected)+(q.asOf&&q.date?'（'+md(q.date)+'）':'')];return s.rows?['🔍 '+b('QC')+'　'+(W?'這週':'今天')+'沒有報告']:[]};
    SEC.ship=()=>{const o=[];const sh=f.shipping||{},ol=f.outlook||{};if(sh.overdueRows)o.push('🚢 '+b('逾期未出')+'　'+N(sh.overdueRows)+' 筆・'+N(sh.overdueOpen)+' 件'+(sh.overdue&&sh.overdue[0]?'（'+esc(sh.overdue[0].cust)+' PO '+esc(sh.overdue[0].po)+'）':''));
      if(ol.nextShip&&ol.nextShip.length)o.push('🚢 '+b('接下來出貨')+'　'+ol.nextShip.slice(0,3).map(z=>md(z.etd)+' '+esc(z.cust)+' '+N(z.open)).join('｜'));return o};
    /* 排單負荷（排單週報）：每組一條，🟦＝有排、⬜＝空檔 */
    SEC.load=()=>{const o=[];if(!L)return o;const AL=x.load||{week:adjLoad(L.week),next:adjLoad(L.next)};const wk=AL.week,nx=AL.next;const t=wk.pct==null?'G':wk.pct>=TH.loadG?'G':wk.pct>=TH.loadA?'A':'R';
      o.push('📋 '+b('本週負荷')+'　'+bar(wk.pct/100,t)+' '+b(P0(wk.pct)+'%'));
      o.push('　'+N(wk.sched)+'/'+N(wk.avail)+' 組日・'+N(wk.styles)+' 款・約 '+N(wk.pieces)+' 件・換款 '+N(wk.changeovers)+' 次');
      if(L.attainment!=null&&L.exposure>0)o.push('　實做 '+N(L.actual)+' 件・達成 '+P0(L.attainment)+'%');
      wk.lines.forEach(z=>{o.push('　<code>'+(z.short+'  ').slice(0,3)+'</code> '+z.cells+' '+(z.empty?'沒排單 🔴':N(z.pieces)+' 件'+(z.changeovers?'・換 '+z.changeovers:'')+(z.attainment!=null&&z.pieces>0?'・做 '+P0(z.attainment)+'%':'')))});
      if(nx)o.push('➡️ '+b('下週')+'　'+(nx.workdays?'負荷 '+P0(nx.pct)+'%'+(nx.emptyLines.length?'・未排 '+(nx.emptyLines.length===nx.lineCount?'全部 '+nx.lineCount+' 組':lsList(nx.emptyLines)):'')+'・換款 '+N(nx.changeovers)+' 次':'整週放假')+(nx.holidays&&nx.workdays?'・放假 '+nx.holidays+' 天':''));return o};
    SEC.now=()=>{const o=[],po=x.po;if(!po)return o;o.push('📊 '+b('現在的位置'));
      o.push('　'+mon(po.month)+'排單 '+N(po.monthQty)+' 件'+(po.monthHours?'・'+N(po.monthHours)+' 工時':''));
      o.push('　到月底還要做 '+N(po.remaining)+' 件'+(po.hours?'・'+N(po.hours)+' 工時':''));
      if(po.useShare!=null)o.push('　產能 '+bar(po.useShare/100,po.useShare>100?'R':po.useShare>=70?'G':'B')+' 用到 '+b(P0(po.useShare)+'%')+'（可做 '+N(po.availHours)+' 工時）');
      o.push('　剩 '+(po.holiday?po.holiday.name+'前 '+po.preDays+' 天＋後 '+po.postDays+' 天':po.preDays+' 個工作天')+'・實際速度＝目標的 '+po.pace+'%'+(po.paceBasis==='default'?'（沒有實績，先用七五折）':''));
      if(po.slip>0)o.push('　保守估拖到下月 '+b(N(po.slip)+' 件')+'（'+P0(po.slipShare)+'%）');return o};
    SEC.outlook=()=>{const o=[],po=x.po;if(!po)return o;const AL=x.load&&x.load.week;const cells={};if(AL)AL.lines.forEach(z=>{cells[z.short]=z.cells});
      o.push('📍 '+b('各組做到哪')+'（本週排單｜照表 → 保守估｜剩多少）');
      po.lines.forEach(z=>{const ic=z.noWork?'⚪':z.late>0?'🔴':z.cautious>z.planEnd?'🟡':'🟢';o.push('　<code>'+(z.line+'  ').slice(0,3)+'</code> '+(cells[z.line]?cells[z.line]+' ':'')+(z.noWork?(z.lastEnd?'只排到 '+md(z.lastEnd)+'，之後沒排 ⚪':'表上沒單 ⚪'):md(z.planEnd)+' → '+md(z.cautious)+' '+ic+'・剩 '+N(z.rem)+(z.uncut?'（未裁 '+N(z.uncut)+'）':'')))});
      if(po.holiday)o.push('⛱ '+b('空檔')+'　'+po.holiday.name+'前 '+N(po.emptyPre)+'/'+N(po.lineDaysPre)+' 組日・後 '+N(po.emptyPost)+'/'+N(po.lineDaysPost)+' 組日'+(po.idleAfter.length?'・節後沒單 '+lsList(po.idleAfter):''));
      else if(po.emptyPre)o.push('⛱ '+b('空檔')+'　到月底 '+N(po.emptyPre)+'/'+N(po.lineDaysPre)+' 組日沒排');return o};
    SEC.due=()=>{const o=[],po=x.po;if(!po||!po.due.length)return o;o.push('🚢 '+b('月底前後交期')+'（未完成｜已入成品倉｜未車）');
      po.due.slice(0,4).forEach(z=>o.push('　'+esc(cut(z.customer,10))+' '+N(z.open)+'｜'+N(z.fg)+'｜'+N(z.notSewn)+(z.overdue?'・逾期 '+N(z.overdue):'')+(z.container?'':' ⚠️沒櫃')));return o};
    SEC.check=()=>{const o=[],po=x.po;if(!po)return o;const c=po.check,it=[];if(c.smvMissingCount)it.push('缺 SMV '+c.smvMissingCount+' 款（'+c.smvMissing.slice(0,3).join('、')+'）');if(c.dups.length)it.push('重複排 '+c.dups.slice(0,2).map(z=>z.style+' '+z.lines.join('／')).join('、'));if(c.finished.length)it.push('做完還在表上 '+c.finished.slice(0,3).map(z=>z.style).join('、'));if(c.undated)it.push('沒填日期 '+c.undated+' 筆');if(c.unscheduled.length)it.push('有交期沒排 '+c.unscheduled.slice(0,3).map(z=>z.style+' '+N(z.qty)).join('、'));
      if(!it.length)return o;o.push('🧹 '+b('排單表要修'));it.forEach(t=>o.push('　・'+esc(t)));return o};
    SEC.load2=()=>{const o=[];if(!L)return o;const AL=x.load||{week:adjLoad(L.week),next:adjLoad(L.next)};const wk=AL.week,nx=AL.next;const t=wk.pct==null?'G':wk.pct>=TH.loadG?'G':wk.pct>=TH.loadA?'A':'R';
      o.push('📋 '+b('本週負荷')+'　'+bar(wk.pct/100,t)+' '+b(P0(wk.pct)+'%')+'・'+N(wk.styles)+' 款・換款 '+N(wk.changeovers)+' 次'+(L.attainment!=null&&L.exposure>0?'・達成 '+P0(L.attainment)+'%':''));
      if(nx)o.push('➡️ '+b('下週')+'　'+(nx.workdays?'負荷 '+P0(nx.pct)+'%'+(nx.emptyLines.length?'・未排 '+(nx.emptyLines.length===nx.lineCount?'全部 '+nx.lineCount+' 組':lsList(nx.emptyLines)):''):'整週放假')+(nx.holidays&&nx.workdays?'・放假 '+nx.holidays+' 天':''));return o};
    const order=PL?(x.po?['now','outlook','due','check','load2','ship']:['load','plan','ship']):W?['sew','days','lines','floor','cut','plan','qc','ship']:['sew','lines','floor','cut','plan','qc','ship'];
    const focus=(PL&&x.po)?'':(top.focus&&order.indexOf(top.focus)>0?top.focus:'');const seq=focus?[focus].concat(order.filter(k=>k!==focus)):order;
    seq.forEach(k=>{(SEC[k]?SEC[k]():[]).forEach(push)});
    const todo=todoLines(f,sc);if(todo.length){push(HR);push('⚠️ '+b('要處理'));todo.forEach((t,i)=>{if(t.one){push((i+1)+'. '+esc(t.who)+'：'+esc(t.act)+'（'+esc(t.q)+'）');return}push((i+1)+'. '+esc(t.q));push('　→ '+esc(t.who)+(t.act?'：'+esc(t.act):''))})}
    push(HR);const src=[];src.push('車縫 '+(s.rows?md(W?f.days[f.days.length-1].date:f.anchor):'—'));src.push('裁剪 '+(c&&c.rows?md(f.end<=f.today?f.end:f.today):'—'));if(!PL)src.push('QC '+(q&&q.reports&&q.date?md(q.date):'—'));if(f.fabric&&f.fabric.snapshotDate)src.push('布料 '+md(f.fabric.snapshotDate));if(PL&&L)src.push('排單 '+md(f.start)+'–'+md(f.end));if(PL&&x.po&&x.po.lastData)src[0]='車縫 '+md(x.po.lastData);
    push('<i>資料：'+src.join('・')+'</i>');
    const html=out.join('\n');return {html,text:html.replace(/<[^>]+>/g,''),lines:out.length,scen:sc,focus:focus||order[0]}}

  /* ── 圖：日報＝各組效率；效率週報＝每天件數；排單週報＝各組排單件數（GAS 用 Charts 畫成 PNG） ── */
  function chart(f){const W=f.period==='week',PL=f.kind==='plan';
    if(PL&&f.loading){const ls=adjLoad(f.loading.week).lines;return {title:'本週各組排單件數（'+md(f.start)+'–'+md(f.end)+'）',labels:ls.map(z=>z.short),values:ls.map(z=>z.pieces),tones:ls.map(z=>z.empty?'R':z.gap>=2?'A':'B'),unit:'件'}}
    if(W&&f.days&&f.days.length)return {title:'本週每天車縫件數（顏色＝效率）',labels:f.days.map(d=>md(d.date)+'('+d.dow+')'),values:f.days.map(d=>d.pieces),tones:f.days.map(d=>effTone(d.eff)||'B'),unit:'件'};
    const ls=(f.lines||[]).filter(z=>z.eff!=null).slice().sort((a,b)=>lno(a.line)-lno(b.line));if(ls.length<2)return null;
    return {title:md(f.anchor)+' 各組效率 %（綠≥'+TH.lineOk+'　黃≥'+TH.lineLow+'　紅＜'+TH.lineLow+'）',labels:ls.map(z=>LS(z.line)),values:ls.map(z=>Math.round(z.eff*10)/10),tones:ls.map(z=>lineTone(z.eff)),unit:'%'}}

  const CATALOG=['monthClose','recovery','mixPcs','relabel','wipOnly','trimHold','cutSupply','smvNo','smvReview','nodata','partial','otHoliday','shortWeek','stopDays','stopGap','afterBreak','beforeHoliday','lineCut','lineAdd','absent','manpower','bigSwing','effDown','effUp','effRed','weakLines','allGreen','dayHigh','dayLow','mix','overtime','floorIssue','targetMiss','dualRisk','qcHigh','qcMismatch','qcMissing','needle','wipPile','wipLow','noCut','monthStart','monthEnd','behind','ahead','shipOverdue','shipSoon','fabric','fabricStale','backlogHigh','backlogLow','backlogOk','cmt','noplan','emptyLines','nextEmpty','loadLow','loadFull','gap','attainLow','attainHigh','changeover','nextChange','undated','smvMissing','concentration','dataLag','overCap','underCap','slip','idleAfter','dueNoBox','unscheduled','dupStyle','finishedListed','steady'];
  g.VRTReportScen={version:VERSION,extras,scenarios,render,chart,todoLines,adjLoad,CATALOG,classifyRemark};
})(typeof window!=='undefined'?window:globalThis);
/* ═══ v4.14 (2026-11-11) 情境報告（v4.13 ＋ 11/11 報告第六節：件數＋工時、各組剩餘與兩個完工日、假期前後空檔、交期對櫃、排單表檢查） — 日報／效率週報／排單週報 群組版 ═══
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
  const reps={day:pick(/^\d{4}-\d{2}-\d{2}$/),eff:pick(/-W\d{2}$/),plan:pick(/-W\d{2}-plan$/)}; const out={ok:true,version:'4.14-scenario',scen:RSCEN_.version,catalog:RSCEN_.CATALOG.length,chart:String(rsProps_().getProperty('RS_CHART')||'1')!=='0'};
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
/* 免參數預覽（編輯器下拉選單直接跑；不存、不發） */
function previewPlanWeekly(){ return previewScenarioReport(todayYmd_(),'week','plan'); }
function previewEffWeekly(){ return previewScenarioReport(todayYmd_(),'week','eff'); }

/* v4.48：上週效率週報預覽（只印不發） */
function previewEffLastWeekV448(){ return previewScenarioReport(DR.helpers.addDays(todayYmd_(),-7),'week','eff'); }

function checkDrV448(){ console.log('DR', DR.version, 'global', VRTDailyReport.version, 'same', DR===VRTDailyReport, 'famOf', typeof DR.famOf, 'FACTORY_CAL', !!DR.FACTORY_CAL, 'isWorkday 10/29', DR.isWorkday&&DR.isWorkday('2026-10-29')); }
