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
  const H=DR.helpers,TH=DR.TH,VERSION='1.1.0';
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
        items.push({style:r.style,customer:r.customer,qty:Math.round(q),uncut:r.cut<=0,end:r.end,cautious:d})});
      const busy={};rs.forEach(r=>wdList(r.start>from?r.start:from,r.end).forEach(d=>{busy[d]=1}));
      const emptyPre=preDays.filter(d=>!busy[d]).length,emptyPost=postDays.filter(d=>!busy[d]).length;
      slip+=late;remAll+=rem;hrsAll+=hrs;
      return {line:l,rem:Math.round(rem),hours:Math.round(hrs),planEnd,cautious,late:Math.round(late),items:items.slice(0,3),styles:items.length,emptyPre,emptyPost,noWork:!items.length,uncut:items.filter(z=>z.uncut).reduce((a,z)=>a+z.qty,0)}});
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
    x.v=VERSION;return x}

  /* ── 情境：今天（這週）是哪一種日子。w＝重要度（開頭只講最重的一件，其餘變標籤）；tone＝燈號；focus＝哪一段排最前面 ── */
  function scenarios(f){const S=[];const x=f.x||{};const s=f.sewing||{},c=f.compare||{},pv=f.prevDay||{},M=f.months||{},cal=f.cal||{},o=f.outlook||{},q=f.qc||{},fb=f.fabric||{},w=f.wip||{},sh=f.shipping||{},pl=f.plan,L=f.loading;
    const W=f.period==='week',PL=f.kind==='plan';const when=W?'這週':'今天',prevW=W?'上週':'昨天';
    /* 舊版存下來的報告沒有 stale 旗標：客戶統計快照超過 14 天一律當過期，不拿來判斷缺布 */
    if(fb.snapshotDate&&/^\d{4}-\d{2}-\d{2}$/.test(fb.snapshotDate)&&fb.stale==null){let age=0;for(let d=fb.snapshotDate;d<f.end&&age<400;d=addDays(d,1))age++;if(age>14)fb.stale=true}
    const add=(id,wt,tone,tag,head,focus,who,act)=>S.push({id,w:wt,tone,tag,head,focus:focus||'',who:who||'',act:act||''});
    const has=id=>(f.scenarios||[]).some(z=>z.id===id);
    const hol=(x.holidays||[]);const holTxt=hol.map(r=>r.name+(r.days>1?' '+r.days+' 天':'')).join('、');
    const weak=(f.lines||[]).filter(z=>z.verdict==='weak'&&z.eff!=null).sort((a,b)=>a.eff-b.eff);
    const weakTxt=weak.slice(0,3).map(z=>LS(z.line)+' '+P0(z.eff)+'%').join('、');
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
      if(wk.workdays>0&&wk.emptyLines.length)add('emptyLines',85,'R','空線 '+wk.emptyLines.length+' 組',lsList(wk.emptyLines)+' 這週完全沒排單，'+N(wk.emptyLines.length*wk.workdays)+' 組日空著。有布的單先補進去，真的沒料再按組提局部停工。','load',PMC,'有布的單補進空線；無料再提局部停工');
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
      if(c.piecesVsPrev!=null&&Math.abs(c.piecesVsPrev)>=50&&!x.offDayWork&&!cal.afterBreak&&!(x.stopDays&&x.stopDays.length)&&!(W&&hol.length)&&Math.abs(dLines)<2)add('bigSwing',78,'A','差 '+P0(Math.abs(c.piecesVsPrev))+'% 先查','件數和'+prevW+'差了 '+P0(Math.abs(c.piecesVsPrev))+'%（'+N(pv.pieces)+' → '+N(s.pieces)+'），先確認日報有沒有缺或重複，再看原因。','sew');
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
      const sub=[];if(s.lines)sub.push(N(s.lines)+' 線');if(s.manpower)sub.push(N(s.manpower)+' 人');if(W&&s.dayCount)sub.push(N(s.dayCount)+' 天');if(x.stdHours)sub.push('標準工時 '+N(x.stdHours)+' h');if(sub.length)o.push('　'+sub.join('・'));
      if(s.eff!=null)o.push('　效率 '+bar(s.eff/50,t)+' '+b(P1(s.eff)+'%')+(pv.eff!=null?'（'+(W?'上週':'昨')+' '+P1(pv.eff)+'%）':''));
      if(f.mix&&f.mix.filter(m=>m.pieces>0).length>1)o.push('　'+f.mix.filter(m=>m.pieces>0).map(m=>(m.product==='Apron'?'圍裙':m.product==='Garment'?'成衣':esc(m.product))+' '+N(m.pieces)).join('｜'));
      if(x.target&&x.target.ach!=null)o.push('　目標 '+N(x.target.target)+'・達成 '+P0(x.target.ach)+'%');
      if(x.ot&&x.ot.pcs)o.push('　加班 '+N(x.ot.pcs)+' 件'+(x.ot.workers?'・'+N(x.ot.workers)+' 人次':''));
      return o};
    /* 各組（色燈一排四組，省行數） */
    SEC.lines=()=>{const o=[];const ls=(f.lines||[]).filter(z=>z.eff!=null).slice().sort((a,b2)=>lno(a.line)-lno(b2.line));if(ls.length<2)return o;
      o.push('📊 '+b('各組效率')+'（🟢≥'+TH.lineOk+'　🟡≥'+TH.lineLow+'　🔴＜'+TH.lineLow+'）');
      const po=x.po,tb=x.target&&x.target.byLine;
      if(!W&&po&&po.lines.length){o[0]='📊 '+b('各組')+'（效率｜做／目標｜這張單剩多少・估哪天做完）';ls.forEach(z=>{const k=LS(z.line),pl2=po.lines.filter(q=>q.line===k)[0],t=tb&&tb[k];o.push('　'+light(lineTone(z.eff))+'<code>'+(k+'  ').slice(0,3)+'</code> '+P0(z.eff)+'%'+(t&&t.target?'｜'+N(t.actual)+'/'+N(t.target):'｜'+N(z.pieces))+(pl2&&!pl2.noWork?'｜剩 '+N(pl2.rem)+'・'+md(pl2.cautious)+(pl2.late>0?'🔴':''):pl2?'｜表上沒單':''))});return o}
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
      po.lines.forEach(z=>{const ic=z.noWork?'⚪':z.late>0?'🔴':z.cautious>z.planEnd?'🟡':'🟢';o.push('　<code>'+(z.line+'  ').slice(0,3)+'</code> '+(cells[z.line]?cells[z.line]+' ':'')+(z.noWork?'表上沒單 ⚪':md(z.planEnd)+' → '+md(z.cautious)+' '+ic+'・剩 '+N(z.rem)+(z.uncut?'（未裁 '+N(z.uncut)+'）':'')))});
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

  const CATALOG=['nodata','partial','otHoliday','shortWeek','stopDays','stopGap','afterBreak','beforeHoliday','lineCut','lineAdd','absent','manpower','bigSwing','effDown','effUp','effRed','weakLines','allGreen','dayHigh','dayLow','mix','overtime','floorIssue','targetMiss','dualRisk','qcHigh','qcMismatch','qcMissing','needle','wipPile','wipLow','noCut','monthStart','monthEnd','behind','ahead','shipOverdue','shipSoon','fabric','fabricStale','backlogHigh','backlogLow','backlogOk','cmt','noplan','emptyLines','nextEmpty','loadLow','loadFull','gap','attainLow','attainHigh','changeover','nextChange','undated','smvMissing','concentration','dataLag','overCap','underCap','slip','idleAfter','dueNoBox','unscheduled','dupStyle','finishedListed','steady'];
  g.VRTReportScen={version:VERSION,extras,scenarios,render,chart,todoLines,adjLoad,CATALOG};
})(typeof window!=='undefined'?window:globalThis);
