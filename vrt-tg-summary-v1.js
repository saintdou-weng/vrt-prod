/* VRT PROD shared Telegram summary builders v1.0 (2026-09-30)
   One source of truth for the 中文 / English 日／週／月／年 summaries:
   - the web pages (✈️ Telegram button in each module, via vrt-telegram-v1.js)
   - the GAS bot (/day /week /month /year and /sum buttons) — AppsScript/build_v43.py splices this file into the .gs
   Pure functions only: no DOM, no Drive, no network. Text is Telegram HTML (<b> only) with every data value escaped.
   Data shapes (plain rows as stored by each module; GAS unwraps its envelopes before calling):
     sewing      rows[]                      {date,section,lineNo,styleNo,pieces,workers,efficiency,tSrc,producedMinutes,attendedMinutes}
     cutting     rows[]                      {date,section,lineNo,styleNo,pieces,workers,efficiency,src,totalYds}
     qc          {records[],kpi[]}           records {date,line,reportKind,inspected,rejected,output,attendanceMinutes,producedMinutes,defects[]}; kpi {date,line,sewingOutput,totalDefect,defects[]}
     spareparts  {needle[],part[],txns[]}    changes {date,line,qty,reasonClass,needleType|partType,size}; txns {date,type,qty,unitPrice,amount,category,partNo}
     prodplan    rows[]                      {month,line,customer,po,style,product,sewingQty,orderQty,startDate,endDate,finishDate}
     monthship   rows[]                      {month,date,customer,mode,pieces,cartons,status}
     orders      {lines[],headers[],weekly[]} po_lines {po_number,customer,qty,ext_price,cancel_date,ship_date}
     shipping    rows[]                      {cust,po,style,orig,shipped,open,etd,status}
     custstats   {overall,customers[],products[],details[],snapshotDate}
     fabricstock {current[],old[],accessory[],movements[]}
     ie          {updates[],styles[]}        updates {style,testDate,effectiveDate,approval,previousSmv,currentSmv}
*/
(function(g){'use strict';
  if(g.VRTTgSummary)return;
  const PERIODS=['day','week','month','year'];
  const PERIOD_LABEL={day:{zh:'日',en:'Day'},week:{zh:'週',en:'Week'},month:{zh:'月',en:'Month'},year:{zh:'年',en:'Year'}};
  const KINDS={
    sewing     :{icon:'🧵',zh:'車縫',        en:'Sewing',                anchor:'latest',tool:'sewing'},
    cutting    :{icon:'✂️',zh:'裁剪',        en:'Cutting',               anchor:'latest',tool:'cutting'},
    qc         :{icon:'✅',zh:'Final QC',    en:'& sewing defect KPI',   anchor:'latest',tool:'qc'},
    spareparts :{icon:'🔧',zh:'機針／零件',  en:'Needles & spare parts', anchor:'latest',tool:'spareparts'},
    prodplan   :{icon:'🗓',zh:'生產排單',    en:'Production plan',       anchor:'today', tool:'prodplan'},
    monthship  :{icon:'🚢',zh:'月出貨',      en:'Monthly shipping',      anchor:'today', tool:'monthship'},
    orders     :{icon:'📦',zh:'訂單',        en:'Orders',                anchor:'today', tool:'orders'},
    shipping   :{icon:'🚚',zh:'出貨排程',    en:'Shipping schedule',     anchor:'today', tool:'shipping'},
    custstats  :{icon:'📊',zh:'客戶統計',    en:'Customer statistics',   anchor:'today', tool:'custstats'},
    fabricstock:{icon:'🧶',zh:'布料庫存',    en:'Fabric stock',          anchor:'today', tool:'fabricstock'},
    ie         :{icon:'📐',zh:'IE／SMV',     en:'IE / SMV updates',      anchor:'latest',tool:'smv'},
  };
  const REASON_ZH={changeover:'換款（計畫）',damage:'損壞',broken:'斷針／破損',lost:'遺失',other:'其他',unknown:'未填'};
  const REASON_EN={changeover:'Change style (planned)',damage:'Damaged',broken:'Broken',lost:'Lost',other:'Other',unknown:'Not filled'};

  /* ── text helpers ── */
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const N=n=>{const v=Number(n||0);return (Number.isInteger(v)?v:Math.round(v*100)/100).toLocaleString('en-US')};
  const pct=(v,dp)=>v==null||!isFinite(v)?'—':Number(v).toFixed(dp==null?1:dp)+'%';
  const delta=(cur,prev,unit)=>{if(prev==null||!isFinite(prev)||prev===0||cur==null)return '';const d=unit==='pt'?cur-prev:(cur-prev)/prev*100;return '　'+(d>=0?'+':'−')+Math.abs(d).toFixed(1)+(unit==='pt'?' pt':'%')+' vs 上期 prev'};
  const top=(obj,n,fmt)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>fmt?fmt(k,v):esc(k)+' '+N(v)).join('\n');
  const noData=P=>'（本期沒有資料 / No data in this period：'+esc(P.label)+'）';

  /* ── dates: yyyy-MM-dd strings + UTC arithmetic (no timezone drift) ── */
  const ymdParts=ymd=>{const m=String(ymd||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?[+m[1],+m[2],+m[3]]:null};
  const ymdUtc=(y,m,d)=>new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10);
  const addDays=(ymd,n)=>{const p=ymdParts(ymd);return p?ymdUtc(p[0],p[1],p[2]+n):''};
  const localToday=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const dowMon0=ymd=>{const p=ymdParts(ymd);return (new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay()+6)%7};
  const isoWeekKey=ymd=>{const p=ymdParts(ymd);const x=new Date(Date.UTC(p[0],p[1]-1,p[2]));x.setUTCDate(x.getUTCDate()+3-((x.getUTCDay()+6)%7));const y=x.getUTCFullYear();const ft=new Date(Date.UTC(y,0,4));ft.setUTCDate(ft.getUTCDate()+3-((ft.getUTCDay()+6)%7));return y+'-W'+String(1+Math.round((x-ft)/604800000)).padStart(2,'0')};
  const mmdd=ymd=>String(ymd||'').slice(5,7)+'/'+String(ymd||'').slice(8,10);
  const dowZh=ymd=>['一','二','三','四','五','六','日'][dowMon0(ymd)],dowEn=ymd=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dowMon0(ymd)];
  function periodOf(period,anchor,today){
    const p=ymdParts(anchor)||ymdParts(today||localToday()),y=p[0],m=p[1],d=p[2];anchor=ymdUtc(y,m,d);
    if(period==='week'){const start=addDays(anchor,-dowMon0(anchor)),end=addDays(start,6);return {period,anchor,start,end,key:isoWeekKey(anchor),label:isoWeekKey(anchor)+'（'+mmdd(start)+'–'+mmdd(end)+'）',prevAnchor:addDays(start,-7),nextAnchor:addDays(start,7)}}
    if(period==='month'){const start=ymdUtc(y,m,1),end=ymdUtc(y,m+1,0);return {period,anchor,start,end,key:start.slice(0,7),label:start.slice(0,7),prevAnchor:ymdUtc(y,m-1,1),nextAnchor:ymdUtc(y,m+1,1)}}
    if(period==='year'){const start=ymdUtc(y,1,1),end=ymdUtc(y,12,31);return {period,anchor,start,end,key:String(y),label:String(y),prevAnchor:ymdUtc(y-1,1,1),nextAnchor:ymdUtc(y+1,1,1)}}
    return {period:'day',anchor,start:anchor,end:anchor,key:anchor,label:anchor+'（'+dowZh(anchor)+' '+dowEn(anchor)+'）',prevAnchor:addDays(anchor,-1),nextAnchor:addDays(anchor,1)};
  }
  function monthsIn(P){const out=[];let cur=P.start.slice(0,7);const last=P.end.slice(0,7);let guard=0;while(cur<=last&&guard++<40){out.push(cur);const q=ymdParts(cur+'-01');cur=ymdUtc(q[0],q[1]+1,1).slice(0,7)}return out}
  const inP=(d,P)=>d>=P.start&&d<=P.end;
  const rowDate=r=>String((r&&(r.date||r.start||r.startDate))||'').slice(0,10);
  const dateOf=(r,fn)=>fn?String(fn(r)||'').slice(0,10):rowDate(r);
  function filterPeriod(rows,P,fn){return (rows||[]).filter(r=>{const d=dateOf(r,fn);return d&&inP(d,P)})}
  function latestDate(rows,fn,today){today=today||localToday();let best='';for(const r of rows||[]){const d=dateOf(r,fn);if(d&&d<=today&&d>best)best=d}return best}
  // period keys that actually hold rows, newest first: [{key,anchor,label,count}]
  function periodOptions(rows,period,fn,today){const m={};for(const r of rows||[]){const d=dateOf(r,fn);if(!d||!ymdParts(d))continue;const P=periodOf(period,d,today);const o=m[P.key]||(m[P.key]={key:P.key,anchor:P.start,label:P.label,count:0});o.count++}return Object.values(m).sort((a,b)=>b.anchor<a.anchor?-1:b.anchor>a.anchor?1:0)}

  /* ── 🧵 sewing: one source per day (norm > target > dpo), same as the sewing monthly report ── */
  function sewAgg(rows){
    const byDay={};rows.forEach(r=>{const src=r.tSrc==='target'?'target':r.tSrc==='dpo'?'dpo':'norm';const x=byDay[r.date]=byDay[r.date]||{norm:[],target:[],dpo:[]};x[src].push(r)});
    const use=[];Object.keys(byDay).forEach(d=>{const x=byDay[d];use.push(...(x.norm.length?x.norm:x.target.length?x.target:x.dpo))});
    const o={rows:use.length,pieces:0,g:0,a:0,other:0,days:{},lines:{},styles:{},w:0,effW:0,prodMin:0,attMin:0};
    use.forEach(r=>{const p=Number(r.pieces)||0,ln=String(r.lineNo||'—'),w=Number(r.workers)||0,e=Number(r.efficiency)||0;o.pieces+=p;if(r.section==='Garment')o.g+=p;else if(r.section==='Apron')o.a+=p;else o.other+=p;
      const dd=o.days[r.date]=o.days[r.date]||{};dd[ln]=Math.max(dd[ln]||0,w);const L=o.lines[ln]=o.lines[ln]||{pieces:0,w:0,effW:0};L.pieces+=p;if(w>0&&e>0){o.w+=w;o.effW+=w*e;L.w+=w;L.effW+=w*e}
      o.prodMin+=Number(r.producedMinutes)||0;o.attMin+=Number(r.attendedMinutes)||0;if(r.styleNo)o.styles[r.styleNo]=(o.styles[r.styleNo]||0)+p});
    o.dayCount=Object.keys(o.days).length;o.eff=o.attMin>0?o.prodMin/o.attMin*100:o.w>0?o.effW/o.w:null;o.effBasis=o.attMin>0?'分鐘 minutes':o.w>0?'人數加權 worker-weighted':'';
    const dayMan=Object.values(o.days).map(x=>Object.values(x).reduce((s,v)=>s+v,0));o.manpower=dayMan.length?dayMan.reduce((s,v)=>s+v,0)/dayMan.length:0;o.lineCount=Object.keys(o.lines).length;return o;
  }
  function sewing(rows,P,prev){
    const cur=filterPeriod(rows,P),pre=prev?filterPeriod(rows,prev):[];if(!cur.length)return {text:noData(P),empty:true};
    const c=sewAgg(cur),p=sewAgg(pre);const L=[];
    L.push('產出 Output: <b>'+N(c.pieces)+'</b> pcs'+(prev?esc(delta(c.pieces,p.pieces)):''));
    L.push('　Garment '+N(c.g)+' · Apron '+N(c.a)+(c.other?' · 其他 Other '+N(c.other):''));
    L.push('工作天 Working days: '+N(c.dayCount)+' · 線別 Lines: '+N(c.lineCount)+' · 日報列 Rows: '+N(c.rows));
    if(c.manpower)L.push('人力 Manpower (avg/day): '+N(Math.round(c.manpower))+' · 人均日產 Pcs/worker/day: '+(c.manpower&&c.dayCount?N(Math.round(c.pieces/c.dayCount/c.manpower)):'—'));
    L.push('效率 Efficiency: <b>'+pct(c.eff)+'</b>'+(c.effBasis?'（'+esc(c.effBasis)+'）':'')+(prev&&c.eff!=null&&p.eff!=null?esc(delta(c.eff,p.eff,'pt')):''));
    if(prev)L.push('上期 Previous '+esc(prev.label)+': '+N(p.pieces)+' pcs · '+pct(p.eff)+'（'+N(p.dayCount)+' 天 days）');
    L.push('');L.push('🏭 線別 By line (Top 5):');
    L.push(top(Object.fromEntries(Object.entries(c.lines).map(([k,v])=>[k,v.pieces])),5,(k,v)=>'• '+esc(k)+' — '+N(v)+' pcs'+(c.lines[k].w?' · '+pct(c.lines[k].effW/c.lines[k].w,0):''))||'—');
    const st=top(c.styles,3,(k,v)=>'• '+esc(k)+' '+N(v));if(st){L.push('');L.push('👕 款式 By style (Top 3):');L.push(st)}
    return {text:L.join('\n'),stats:c,prevStats:p};
  }
  /* ── ✂️ cutting: daily detail rows only; Weekly Report / Summary rows are reference totals (cutting_v3 isDailyRec) ── */
  const cutDaily=r=>r.src!=='ref'&&r.src!=='summary'&&r.lineNo!=='Weekly Report'&&r.lineNo!=='Monthly Summary'&&r.lineNo!=='Summary'&&(Number(r.pieces)||0)>0;
  function cutAgg(rows){
    const o={rows:0,pieces:0,sec:{},days:{},styles:{},lines:{},yds:0,w:0,effW:0,refPieces:0};
    rows.forEach(r=>{const p=Number(r.pieces)||0;if(!cutDaily(r)){if(r.src==='ref')o.refPieces+=p;return}o.rows++;o.pieces+=p;const s=String(r.section||'—');o.sec[s]=(o.sec[s]||0)+p;o.days[r.date]=1;if(r.styleNo)o.styles[r.styleNo]=(o.styles[r.styleNo]||0)+p;const ln=String(r.lineNo||'—');o.lines[ln]=(o.lines[ln]||0)+p;o.yds+=Number(r.totalYds)||0;const w=Number(r.workers)||0,e=Number(r.efficiency)||0;if(w>0&&e>0){o.w+=w;o.effW+=w*e}});
    o.dayCount=Object.keys(o.days).length;o.eff=o.w>0?o.effW/o.w:null;return o;
  }
  function cutting(rows,P,prev){
    const cur=filterPeriod(rows,P),pre=prev?filterPeriod(rows,prev):[];if(!cur.length)return {text:noData(P),empty:true};
    const c=cutAgg(cur),p=cutAgg(pre);const L=[];
    L.push('裁剪量 Cut pieces: <b>'+N(c.pieces)+'</b> pcs'+(prev?esc(delta(c.pieces,p.pieces)):''));
    L.push('　'+Object.entries(c.sec).sort((a,b)=>b[1]-a[1]).map(([k,v])=>esc(k)+' '+N(v)).join(' · '));
    L.push('工作天 Working days: '+N(c.dayCount)+' · 裁床 Tables: '+N(Object.keys(c.lines).length)+' · 明細列 Rows: '+N(c.rows)+(c.yds?' · 用布 Fabric: '+N(Math.round(c.yds))+' yd':''));
    if(c.eff!=null)L.push('效率 Efficiency: '+pct(c.eff)+'（人數加權 worker-weighted）');
    if(c.refPieces)L.push('週報／月報彙總列 Weekly/monthly reference rows: '+N(c.refPieces)+' pcs（不重複計 not double-counted）');
    if(prev)L.push('上期 Previous '+esc(prev.label)+': '+N(p.pieces)+' pcs（'+N(p.dayCount)+' 天 days）');
    const st=top(c.styles,5,(k,v)=>'• '+esc(k)+' — '+N(v)+' pcs');if(st){L.push('');L.push('👕 款式 By style (Top 5):');L.push(st)}
    return {text:L.join('\n'),stats:c,prevStats:p};
  }
  /* ── ✅ Final QC + sewing defect KPI (one report per date/line: manual > daily > weekly) ── */
  function qcPick(rows){const m={};(rows||[]).forEach(r=>{if(!r||r.deleted)return;const k=r.date+'|'+r.line,rank=r.reportKind==='manual'?3:r.reportKind==='weekly'?1:2;if(!m[k]||rank>m[k].rank)m[k]={r,rank}});return Object.values(m).map(x=>x.r)}
  function qcAgg(rows){const o={reports:rows.length,inspected:0,rejected:0,output:0,att:0,prod:0,effOk:true,lines:{},defects:{},days:{}};rows.forEach(r=>{o.inspected+=Number(r.inspected)||0;o.rejected+=Number(r.rejected)||0;o.output+=Number(r.output)||0;o.days[r.date]=1;const a=Number(r.attendanceMinutes)||0,pm=Number(r.producedMinutes)||0;if(a>0){o.att+=a;o.prod+=pm}else if((Number(r.inspected)||0)>0)o.effOk=false;const ln=String(r.line||'—');const L=o.lines[ln]=o.lines[ln]||{inspected:0,rejected:0};L.inspected+=Number(r.inspected)||0;L.rejected+=Number(r.rejected)||0;(r.defects||[]).forEach(d=>{const q=Number(d.qty)||0;if(q>0){const nm=String(d.name||d.code||'?');o.defects[nm]=(o.defects[nm]||0)+q}})});o.rate=o.inspected?o.rejected/o.inspected*100:null;o.eff=o.att>0?o.prod/o.att*100:null;return o}
  function kpiAgg(rows){const k={out:0,def:0,lines:{},defects:{},days:{}};rows.forEach(v=>{if(!v||v.deleted)return;k.out+=Number(v.sewingOutput)||0;k.def+=Number(v.totalDefect)||0;k.days[v.date]=1;const ln=String(v.line||'—');const L2=k.lines[ln]=k.lines[ln]||{out:0,def:0};L2.out+=Number(v.sewingOutput)||0;L2.def+=Number(v.totalDefect)||0;(v.defects||[]).forEach(d=>{const q=Number(d.qty)||0;if(q>0)k.defects[String(d.name||'?')]=(k.defects[String(d.name||'?')]||0)+q})});k.rate=k.out?k.def/k.out*100:null;return k}
  function qc(data,P,prev){
    data=data||{};const cur=qcPick(filterPeriod(data.records,P)),pre=prev?qcPick(filterPeriod(data.records,prev)):[],kc=filterPeriod(data.kpi,P).filter(v=>!v.deleted),kpv=prev?filterPeriod(data.kpi,prev).filter(v=>!v.deleted):[];
    if(!cur.length&&!kc.length)return {text:noData(P),empty:true};
    const c=qcAgg(cur),p=qcAgg(pre),k=kpiAgg(kc),kv=kpiAgg(kpv);const L=[];
    if(cur.length){L.push('<b>Final QC</b>（'+N(Object.keys(c.days).length)+' 天 days · '+N(c.reports)+' 份日報 reports）');
      L.push('檢驗 Inspected: <b>'+N(c.inspected)+'</b> · 退修 Reject: '+N(c.rejected)+'（<b>'+pct(c.rate,2)+'</b>'+(prev&&p.rate!=null?esc(delta(c.rate,p.rate,'pt')):'')+'）');
      L.push('實際產出 Output: '+N(c.output)+' pcs · 效率 Efficiency: '+(c.eff!=null?pct(c.eff)+(c.effOk?'':'（部分日報無工時 some reports lack minutes）'):'資料不足 Insufficient data'));
      const worst=Object.entries(c.lines).filter(([a,v])=>v.inspected>0).map(([a,v])=>[a,v.rejected/v.inspected*100]).sort((a,b)=>b[1]-a[1]).slice(0,3);if(worst.length)L.push('退修率最高線 Highest reject lines: '+worst.map(([a,v])=>esc(a)+' '+pct(v,1)).join(' · '));
      const td=top(c.defects,3,(a,v)=>'• '+esc(a)+' '+N(v));if(td){L.push('Top 3 缺點 Defects:');L.push(td)}}
    if(kc.length){if(L.length)L.push('');L.push('<b>車縫缺點 KPI Sewing defect KPI</b>（'+N(Object.keys(k.days).length)+' 天 days · '+N(Object.keys(k.lines).length)+' 線 lines）');
      L.push('車縫產出 Sewing output: '+N(k.out)+' · 缺點 Defects: '+N(k.def)+'（<b>'+pct(k.rate,2)+'</b>'+(prev&&kv.rate!=null?esc(delta(k.rate,kv.rate,'pt')):'')+'）');
      const worst=Object.entries(k.lines).filter(([a,v])=>v.out>0).map(([a,v])=>[a,v.def/v.out*100]).sort((a,b)=>b[1]-a[1]).slice(0,3);if(worst.length)L.push('缺點率最高線 Highest defect lines: '+worst.map(([a,v])=>esc(a)+' '+pct(v,1)).join(' · '));
      const td=top(k.defects,3,(a,v)=>'• '+esc(a)+' '+N(v));if(td){L.push('Top 3 缺點 Defects:');L.push(td)}}
    return {text:L.join('\n'),stats:{qc:c,kpi:k},prevStats:{qc:p,kpi:kv}};
  }
  /* ── 🔧 needle / spare-part changes + purchases ── */
  function chgAgg(rows){const o={qty:0,rows:0,reason:{},lines:{},items:{},days:{}};rows.forEach(v=>{if(!v||v.deleted)return;o.rows++;const q=Number(v.qty)||0;o.qty+=q;o.days[v.date]=1;const rc=v.reasonClass||'unknown';o.reason[rc]=(o.reason[rc]||0)+q;const ln=String(v.line||'—');o.lines[ln]=(o.lines[ln]||0)+q;const it=String((v.needleType||v.partType||'?')+(v.size?' '+v.size:'')).replace(/\s+/g,' ').trim();o.items[it]=(o.items[it]||0)+q});o.planned=o.reason.changeover||0;o.unplanned=(o.reason.damage||0)+(o.reason.broken||0)+(o.reason.lost||0);return o}
  const reasonLine=o=>Object.entries(o.reason).sort((a,b)=>b[1]-a[1]).map(([k,v])=>esc((REASON_ZH[k]||k)+' '+(REASON_EN[k]||''))+' '+N(v)).join(' · ');
  const isPurchase=x=>String(x.type||'PURCHASE').toUpperCase()!=='OUT'&&String(x.type||'').toUpperCase()!=='ISSUE'&&String(x.type||'').toUpperCase()!=='CONSUME';
  const amount=x=>Number(x.amount)||((Number(x.qty)||0)*(Number(x.unitPrice)||0));
  function spareparts(data,P,prev){
    data=data||{};const nc=chgAgg(filterPeriod(data.needle,P)),np=chgAgg(prev?filterPeriod(data.needle,prev):[]),pc=chgAgg(filterPeriod(data.part,P)),pp=chgAgg(prev?filterPeriod(data.part,prev):[]);
    const tx=filterPeriod(data.txns,P).filter(isPurchase),txp=prev?filterPeriod(data.txns,prev).filter(isPurchase):[];
    if(!nc.rows&&!pc.rows&&!tx.length)return {text:noData(P),empty:true};const L=[];
    if(nc.rows){L.push('<b>🪡 機針更換 Needle changes</b>: <b>'+N(nc.qty)+'</b> 支 pcs'+(prev&&np.qty?esc(delta(nc.qty,np.qty)):'')+'（'+N(Object.keys(nc.days).length)+' 天 days · '+N(nc.rows)+' 列 rows）');
      L.push('　換款 Planned: '+N(nc.planned)+'（'+pct(nc.qty?nc.planned/nc.qty*100:null,0)+'） · 非計畫 Unplanned (damage+broken): <b>'+N(nc.unplanned)+'</b>（'+pct(nc.qty?nc.unplanned/nc.qty*100:null,0)+'） · 其他／未填 Other/blank: '+N(nc.qty-nc.planned-nc.unplanned));
      L.push('　原因 Reasons: '+reasonLine(nc));
      L.push('　線別最多 Top lines: '+(top(nc.lines,3,(k,v)=>esc(k)+' '+N(v))||'—').replace(/\n/g,' · '));
      L.push('　針型最多 Top needles: '+(top(nc.items,3,(k,v)=>esc(k)+' '+N(v))||'—').replace(/\n/g,' · '))}
    if(pc.rows){if(L.length)L.push('');L.push('<b>🔩 零件更換 Spare-part changes</b>: <b>'+N(pc.qty)+'</b> 件 pcs'+(prev&&pp.qty?esc(delta(pc.qty,pp.qty)):'')+'（'+N(Object.keys(pc.days).length)+' 天 days）');
      L.push('　原因 Reasons: '+reasonLine(pc));
      L.push('　零件最多 Top parts: '+(top(pc.items,3,(k,v)=>esc(k.length>28?k.slice(0,28)+'…':k)+' '+N(v))||'—').replace(/\n/g,' · '));
      L.push('　線別最多 Top lines: '+(top(pc.lines,3,(k,v)=>esc(k)+' '+N(v))||'—').replace(/\n/g,' · '))}
    if(tx.length){const cat={},parts={};let amt=0,amtp=0;tx.forEach(x=>{const a=amount(x);amt+=a;cat[String(x.category||'—')]=(cat[String(x.category||'—')]||0)+a;if(x.partNo)parts[x.partNo]=1});txp.forEach(x=>{amtp+=amount(x)});
      if(L.length)L.push('');L.push('<b>🧾 採購 Purchases</b>: $'+amt.toFixed(2)+(prev&&txp.length?esc(delta(amt,amtp)):'')+' · '+N(tx.length)+' 筆 lines · '+N(Object.keys(parts).length)+' 品項 items');
      L.push('　類別 Top categories: '+(top(cat,3,(k,v)=>esc(k)+' $'+v.toFixed(0))||'—').replace(/\n/g,' · '))}
    return {text:L.join('\n'),stats:{needle:nc,part:pc,purchases:tx.length}};
  }
  /* ── 🗓 production plan: styles whose schedule overlaps the period (anchor = today) ── */
  function prodplan(rows,P,prev,today){
    today=today||localToday();const inPlan=(rows||[]).filter(r=>{const s=String(r.startDate||'').slice(0,10),e=String(r.endDate||r.startDate||'').slice(0,10);if(!s)return String(r.month||'')===P.key;return s<=P.end&&e>=P.start});
    if(!inPlan.length)return {text:noData(P),empty:true};
    const lines={},cust={},prod={};let qty=0,starts=0,ends=0,unfinished=0;inPlan.forEach(r=>{const q=Number(r.sewingQty)||Number(r.orderQty)||0;qty+=q;const ln=String(r.line||'—');lines[ln]=(lines[ln]||0)+q;cust[String(r.customer||'—')]=(cust[String(r.customer||'—')]||0)+q;prod[String(r.product||'—')]=(prod[String(r.product||'—')]||0)+q;const s=String(r.startDate||'').slice(0,10),e=String(r.endDate||'').slice(0,10);if(s>=P.start&&s<=P.end)starts++;if(e&&e>=P.start&&e<=P.end)ends++;if(e&&e<today&&!r.finishDate)unfinished++});
    const L=[];L.push('排程款數 Scheduled styles: <b>'+N(inPlan.length)+'</b> · 車縫量 Sewing qty: <b>'+N(qty)+'</b> pcs');
    L.push('本期開工 Starting: '+N(starts)+' · 本期完工 Ending: '+N(ends)+' · 線別 Lines: '+N(Object.keys(lines).length)+(unfinished?' · ⚠️ 逾期未填完工 Past end date, no finish date: '+N(unfinished):''));
    L.push('產品 Products: '+Object.entries(prod).sort((a,b)=>b[1]-a[1]).map(([k,v])=>esc(k)+' '+N(v)).join(' · '));
    L.push('');L.push('🏭 線別負荷 Load by line (Top 6):');L.push(top(lines,6,(k,v)=>'• '+esc(k)+' — '+N(v)+' pcs')||'—');
    L.push('');L.push('👤 客戶 Customers (Top 3): '+(top(cust,3,(k,v)=>esc(k)+' '+N(v))||'—').replace(/\n/g,' · '));
    if(P.period==='day'||P.period==='week'){const soon=inPlan.filter(r=>String(r.startDate||'').slice(0,10)>=P.start&&String(r.startDate||'').slice(0,10)<=P.end).slice(0,6);if(soon.length){L.push('');L.push('▶ 本期開工 Starting this period'+(starts>6?'（前 6 筆 first 6 of '+N(starts)+'）':'')+':');soon.forEach(r=>L.push('• '+esc(String(r.line||''))+' '+esc(String(r.style||''))+' '+esc(String(r.customer||''))+' '+N(r.sewingQty||r.orderQty||0)+' pcs '+esc(String(r.startDate||'').slice(5)+'→'+String(r.endDate||'').slice(5))))}}
    return {text:L.join('\n'),stats:{styles:inPlan.length,qty,starts,ends,unfinished}};
  }
  /* ── 🚢 monthly shipping schedule (date, or month when the row has no date) ── */
  const shipDate=r=>r.date||(r.month?String(r.month).slice(0,7)+'-01':'');
  function monthship(rows,P,prev){
    const cur=filterPeriod(rows,P,shipDate),pre=prev?filterPeriod(rows,prev,shipDate):[];if(!cur.length)return {text:noData(P),empty:true};
    const agg=rs=>{const o={pieces:0,cartons:0,rows:rs.length,cust:{},mode:{},status:{}};rs.forEach(r=>{const p=Number(r.pieces)||0;o.pieces+=p;o.cartons+=Number(r.cartons)||0;o.cust[String(r.customer||'—')]=(o.cust[String(r.customer||'—')]||0)+p;o.mode[String(r.mode||'—')]=(o.mode[String(r.mode||'—')]||0)+p;const s=String(r.status||'PLAN');o.status[s]=(o.status[s]||0)+p});return o};
    const c=agg(cur),p=agg(pre);const L=[];
    L.push('出貨量 Pieces: <b>'+N(c.pieces)+'</b>'+(prev?esc(delta(c.pieces,p.pieces)):'')+' · 箱數 Cartons: '+N(c.cartons)+' · 筆數 Rows: '+N(c.rows));
    L.push('狀態 Status: '+Object.entries(c.status).map(([k,v])=>esc(k)+' '+N(v)).join(' · '));
    L.push('方式 Mode: '+Object.entries(c.mode).sort((a,b)=>b[1]-a[1]).map(([k,v])=>esc(k)+' '+N(v)).join(' · '));
    if(prev)L.push('上期 Previous '+esc(prev.label)+': '+N(p.pieces)+' pcs');
    L.push('');L.push('👤 客戶 Customers (Top 5):');L.push(top(c.cust,5,(k,v)=>'• '+esc(k)+' — '+N(v)+' pcs')||'—');
    return {text:L.join('\n'),stats:c};
  }
  /* ── 📦 orders: status of the imported PO lines + due dates in the period ── */
  const MON={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
  function anyDate(s){s=String(s||'').trim();if(!s)return '';let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];m=s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);if(m){const y=m[3].length===2?2000+Number(m[3]):Number(m[3]),mo=MON[m[2].toUpperCase()];if(mo)return ymdUtc(y,mo,Number(m[1]))}m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)return ymdUtc(Number(m[3]),Number(m[1]),Number(m[2]));return ''}
  function orders(data,P,prev){
    data=data||{};const lines=data.lines||[];if(!lines.length)return {text:'（尚無訂單資料 / No order lines）',empty:true};
    const pos={},cust={};let qty=0,val=0;lines.forEach(r=>{pos[String(r.po_number||r.po||'')]=1;const q=Number(r.qty)||0;qty+=q;val+=Number(r.ext_price)||0;cust[String(r.customer||'—')]=(cust[String(r.customer||'—')]||0)+q});
    const due=lines.filter(r=>{const d=anyDate(r.cancel_date||r.ship_date);return d&&inP(d,P)}),dueQty=due.reduce((s,r)=>s+(Number(r.qty)||0),0),duePos=new Set(due.map(r=>String(r.po_number||r.po||'')));
    const L=[];L.push('訂單 PO: <b>'+N(Object.keys(pos).length)+'</b> · 明細 Lines: '+N(lines.length)+' · 數量 Qty: <b>'+N(qty)+'</b> pcs'+(val?' · 金額 Value: $'+N(Math.round(val)):''));
    L.push('本期到期 Due in period（cancel/ship date）: '+N(duePos.size)+' PO · '+N(dueQty)+' pcs');
    const snaps=data.weekly||[];if(snaps.length){const latest=snaps.map(s=>String(s.as_of_date||'')).sort().pop();L.push('週快照 Weekly snapshots: '+N(snaps.length)+(latest?' · 最新 latest '+esc(latest):''))}
    L.push('');L.push('👤 客戶 Customers (Top 5):');L.push(top(cust,5,(k,v)=>'• '+esc(k)+' — '+N(v)+' pcs')||'—');
    if(due.length){const byPo={};due.forEach(r=>{const k=String(r.po_number||r.po||'')+' '+String(r.customer||'');byPo[k]=(byPo[k]||0)+(Number(r.qty)||0)});L.push('');L.push('📅 本期到期 Due (Top 5):');L.push(top(byPo,5,(k,v)=>'• '+esc(k)+' — '+N(v)+' pcs'))}
    return {text:L.join('\n'),stats:{pos:Object.keys(pos).length,lines:lines.length,qty,dueQty}};
  }
  /* ── 🚚 shipping schedule (ETD in period) ── */
  function shipping(rows,P,prev){
    rows=rows||[];if(!rows.length)return {text:'（尚無出貨排程資料 / No shipping rows）',empty:true};
    const all={orig:0,shipped:0,open:0,status:{}};rows.forEach(r=>{all.orig+=Number(r.orig)||0;all.shipped+=Number(r.shipped)||0;all.open+=Number(r.open)||0;const s=String(r.status||'—');all.status[s]=(all.status[s]||0)+1});
    const cur=rows.filter(r=>{const d=anyDate(r.etd);return d&&inP(d,P)}),c={orig:0,shipped:0,open:0,cust:{},status:{}};cur.forEach(r=>{c.orig+=Number(r.orig)||0;c.shipped+=Number(r.shipped)||0;c.open+=Number(r.open)||0;c.cust[String(r.cust||'—')]=(c.cust[String(r.cust||'—')]||0)+(Number(r.open)||0);const s=String(r.status||'—');c.status[s]=(c.status[s]||0)+1});
    const L=[];L.push('全部 All: 訂單 Order '+N(all.orig)+' · 已出 Shipped '+N(all.shipped)+' · 未出 Open <b>'+N(all.open)+'</b> · '+Object.entries(all.status).map(([k,v])=>esc(k)+' '+N(v)).join(' · '));
    L.push('本期 ETD in period: '+N(cur.length)+' 列 rows · 訂單 '+N(c.orig)+' · 已出 '+N(c.shipped)+' · 未出 <b>'+N(c.open)+'</b>');
    if(cur.length){L.push('');L.push('👤 本期未出貨最多 Open by customer (Top 5):');L.push(top(c.cust,5,(k,v)=>'• '+esc(k)+' — '+N(v)+' pcs')||'—')}
    return {text:L.join('\n'),stats:{all,period:c,rows:cur.length},empty:false};
  }
  /* ── 📊 customer statistics snapshot ── */
  function custstats(data,P){
    data=data||{};const o=data.overall||{};if(!(data.details||[]).length&&!o.orderQty)return {text:'（尚無客戶統計資料 / No customer statistics）',empty:true};
    const L=[];L.push('快照 Snapshot: '+esc(data.snapshotDate||'—')+' · 明細 Rows: '+N((data.details||[]).length));
    L.push('訂單 Order: <b>'+N(o.orderQty)+'</b> pcs · 完成 Completed: '+N(o.completedQty)+' · 未完成 Balance: <b>'+N(o.balanceQty)+'</b>'+(o.completion!=null?'（完成率 completion '+pct(Number(o.completion)<=1?Number(o.completion)*100:Number(o.completion),1)+'）':''));
    L.push('裁剪 WIP Cutting WIP: '+N(o.cuttingWip)+' · FG: '+N(o.fgPcs)+' pcs / '+N(o.fgCtn)+' ctn · 未車 Not sewn: '+N(o.actualNotSewn)+' · 無布 No fabric: '+N(o.noFabric));
    const cust={};(data.customers||[]).forEach(c=>{cust[String(c.customer||'—')]=Number(c.balanceQty)||0});L.push('');L.push('👤 未完成最多 Balance by customer (Top 5):');L.push(top(cust,5,(k,v)=>'• '+esc(k)+' — '+N(v)+' pcs')||'—');
    return {text:L.join('\n'),stats:o};
  }
  /* ── 🧶 fabric stock: latest snapshot + old-stock use + movements in the period ── */
  function fabricstock(db,P,prev){
    db=db||{};const cur=db.current||[];if(!cur.length&&!(db.old||[]).length)return {text:'（尚無布料庫存資料 / No fabric stock）',empty:true};
    const latest=cur.map(r=>String(r.snapshotDate||'')).sort().pop()||'';const snap=cur.filter(r=>String(r.snapshotDate||'')===latest);const qty=snap.reduce((s,r)=>s+(Number(r.quantity)||0),0),items=new Set(snap.map(r=>r.itemCode)).size;
    const old=filterPeriod(db.old,P,r=>r.useDate),oldQty=old.reduce((s,r)=>s+(Number(r.quantity)||0),0);
    const mv=filterPeriod(db.movements,P,r=>r.date),mvIn=mv.filter(r=>/in|receipt|收/i.test(String(r.type||''))).reduce((s,r)=>s+(Number(r.quantity)||0),0),mvOut=mv.filter(r=>/out|issue|出/i.test(String(r.type||''))).reduce((s,r)=>s+(Number(r.quantity)||0),0);
    const L=[];L.push('現有庫存 Current stock（快照 snapshot '+esc(latest||'—')+'）: <b>'+N(Math.round(qty))+'</b> yd · 品項 Items: '+N(items)+' · 列 Rows: '+N(snap.length));
    L.push('本期舊布使用 Old stock used in period: '+N(Math.round(oldQty))+' yd（'+N(old.length)+' 筆 rows）');
    if(mv.length)L.push('本期收發 Movements: 入 In '+N(Math.round(mvIn))+' · 出 Out '+N(Math.round(mvOut))+'（'+N(mv.length)+' 筆 rows）');
    L.push('輔料 Accessories: '+N((db.accessory||[]).length)+' 筆 rows');
    const byItem={};snap.forEach(r=>{byItem[String(r.itemCode||'—')]=(byItem[String(r.itemCode||'—')]||0)+(Number(r.quantity)||0)});L.push('');L.push('🧵 庫存最多 Largest stock (Top 5):');L.push(top(byItem,5,(k,v)=>'• '+esc(k)+' — '+N(Math.round(v))+' yd')||'—');
    return {text:L.join('\n'),stats:{qty,items,oldQty,movements:mv.length}};
  }
  /* ── 📐 IE / SMV updates in the period (testDate or effectiveDate) ── */
  const ieDate=r=>r.effectiveDate||r.testDate||'';
  function ie(data,P,prev){
    data=data||{};const ups=(data.updates||[]).filter(r=>!r.deleted),cur=filterPeriod(ups,P,ieDate),pre=prev?filterPeriod(ups,prev,ieDate):[];
    if(!cur.length)return {text:noData(P),empty:true};
    const agg=rs=>{const o={n:rs.length,approved:0,pending:0,styles:{},up:0,down:0,same:0,cust:{}};rs.forEach(r=>{const ap=String(r.approval||'').toLowerCase()==='approved';if(ap)o.approved++;else o.pending++;o.styles[String(r.style||'')]=1;const a=Number(r.previousSmv),b=Number(r.currentSmv);if(isFinite(a)&&isFinite(b)){if(b>a)o.up++;else if(b<a)o.down++;else o.same++}if(r.customer)o.cust[String(r.customer)]=(o.cust[String(r.customer)]||0)+1});return o};
    const c=agg(cur),p=agg(pre);const L=[];
    L.push('SMV 更新 Updates: <b>'+N(c.n)+'</b>（'+N(Object.keys(c.styles).length)+' 款 styles）· 已核准 Approved: '+N(c.approved)+' · 待核准 Pending: <b>'+N(c.pending)+'</b>');
    L.push('SMV 變化 Change: 上升 up '+N(c.up)+' · 下降 down '+N(c.down)+' · 不變 same '+N(c.same));
    if(prev)L.push('上期 Previous '+esc(prev.label)+': '+N(p.n)+' 筆 · approved '+N(p.approved));
    const st=(data.styles||[]);if(st.length){const pend=st.filter(s=>String(s.approval||'').toLowerCase()!=='approved').length;L.push('款式庫 Styles: '+N(st.length)+'（待核准 pending '+N(pend)+'）')}
    if(Object.keys(c.cust).length){L.push('');L.push('👤 客戶 Customers: '+(top(c.cust,4,(k,v)=>esc(k)+' '+N(v))||'—').replace(/\n/g,' · '))}
    return {text:L.join('\n'),stats:c};
  }
  const BUILDERS={sewing,cutting,qc,spareparts,prodplan,monthship,orders,shipping,custstats,fabricstock,ie};
  // date accessor used by periodOptions / latestDate per kind (rows or shape)
  function rowsOf(kind,data){switch(kind){case 'qc':return (data&&data.records||[]).concat(data&&data.kpi||[]);case 'spareparts':return (data&&data.needle||[]).concat(data&&data.part||[],data&&data.txns||[]);case 'orders':return data&&data.lines||[];case 'custstats':return data&&data.details||[];case 'fabricstock':return (data&&data.old||[]).concat(data&&data.movements||[]);case 'ie':return data&&data.updates||[];default:return data||[]}}
  function dateFnOf(kind){switch(kind){case 'monthship':return shipDate;case 'orders':return r=>anyDate(r.cancel_date||r.ship_date);case 'shipping':return r=>anyDate(r.etd);case 'custstats':return r=>anyDate(r.etd||r.poDate);case 'fabricstock':return r=>r.useDate||r.date;case 'ie':return ieDate;default:return null}}
  function header(kind,P,meta){const K=KINDS[kind]||{icon:'',zh:kind,en:''};meta=meta||{};
    return K.icon+' <b>'+esc(K.zh)+' '+esc(K.en)+'</b> · '+esc(PERIOD_LABEL[P.period].zh+' '+PERIOD_LABEL[P.period].en)+' <b>'+esc(P.label)+'</b>'+(meta.line?'\n'+meta.line:'')}
  /* build(kind, data, period, anchor, opts) → {text (full HTML message), head, body, P, prev, empty} */
  function build(kind,data,period,anchor,opts){opts=opts||{};const K=KINDS[kind];if(!K||!BUILDERS[kind])throw new Error('Unknown summary kind: '+kind);period=PERIODS.indexOf(period)>=0?period:'day';const today=opts.today||localToday();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor||''))anchor=K.anchor==='today'?today:(latestDate(rowsOf(kind,data),dateFnOf(kind),today)||today);
    const P=periodOf(period,anchor,today),prev=opts.noPrev?null:periodOf(period,P.prevAnchor,today);
    let r;try{r=BUILDERS[kind](data,P,prev,today)}catch(e){r={text:'⚠️ 摘要計算失敗 Summary failed: '+esc(e&&e.message||e),empty:true}}
    const metaLine=[opts.metaLine,K.anchor==='today'?'':'資料至 data to: '+esc(anchor)].filter(Boolean).join(' · ');
    const head=header(kind,P,{line:metaLine});const foot=opts.footer==null?'\n\n👆 /prod　/prod2　/sum':opts.footer;
    return {kind,period,anchor,P,prev,head,body:r.text,stats:r.stats,empty:!!r.empty,text:head+'\n\n'+r.text+foot};
  }
  const clip=(text,max)=>{text=String(text||'');max=max||4000;if(text.length<=max)return text;let cut=text.lastIndexOf('\n',max-100);if(cut<1000)cut=max-100;return text.slice(0,cut)+'\n… ✂️ 訊息過長已截短 / message truncated（Telegram 4096 限制）'};
  const plain=html=>String(html||'').replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  g.VRTTgSummary={version:'1.0',PERIODS,PERIOD_LABEL,KINDS,REASON_ZH,REASON_EN,esc,N,pct,delta,top,periodOf,monthsIn,isoWeekKey,addDays,localToday,filterPeriod,latestDate,periodOptions,rowsOf,dateFnOf,build,header,clip,plain,anyDate,builders:BUILDERS,agg:{sewAgg,cutAgg,qcAgg,kpiAgg,chgAgg,qcPick,cutDaily}};
})(typeof globalThis!=='undefined'?globalThis:this);
