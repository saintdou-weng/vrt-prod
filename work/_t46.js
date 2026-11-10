var SK_KNOWN=null;
function knownStyles(){ if(SK_KNOWN)return SK_KNOWN; const k=new Set(); const add=v=>{const x=nsk(v);if(x&&x.length>=3)k.add(x)};
  (CUT||[]).forEach(r=>add(r.styleNo)); (SEW||[]).forEach(r=>add(r.styleNo)); (PLAN||[]).forEach(r=>add(r.style)); Object.keys(SMV_MAP||{}).forEach(add); SK_KNOWN=k; return k }
function resolveSk(raw){ const k=nsk(raw); if(!k)return ''; const K=knownStyles(); if(K.has(k))return k; for(let n=k.length-1;n>=3;n--){ const p=k.slice(0,n); if(K.has(p))return p } return k }
function buildStyles(){
  SK_KNOWN=null;
  // Orders
  const oM = {};
  ORDERS.forEach(o=>{
    const sk = resolveSk(o.style_code||o.sku); if(!sk) return;
    if(!oM[sk]) oM[sk]={qty:0,pos:new Set(),custs:new Set(),oDs:[],sDs:[]};
    oM[sk].qty += parseFloat(o.qty)||0;
    if(o.po_number) oM[sk].pos.add(o.po_number);
    if(o.customer)  oM[sk].custs.add(o.customer);
    const od=pd(o.order_date), sd=pd(o.ship_date)||pd(o.cancel_date);
    if(od) oM[sk].oDs.push(od);
    if(sd) oM[sk].sDs.push(sd);
  });

  // 排產表的款（目前與未來，近 60 天內還在做的）也納入；客戶 PO 沒有的款用排產量
  const PLAN_EV=(typeof planAggEvents==='function')?planAggEvents():[]; const recent=addDays(TODAY,-60); const planStart={};
  PLAN_EV.forEach(e=>{ if(!e.sk)return; if(e.start&&(!planStart[e.sk]||e.start<planStart[e.sk]))planStart[e.sk]=e.start;
    if((e.end||e.start||'')<recent)return;
    if(!oM[e.sk]) oM[e.sk]={qty:0,pos:new Set(),custs:new Set(),oDs:[],sDs:[],planOnly:true,planQty:0};
    const x=oM[e.sk]; if(x.planOnly){ x.planQty+=e.qty||0; x.qty=x.planQty; if(e.po&&e.po!=='Mixed')x.pos.add(e.po); if(e.customer)x.custs.add(e.customer); if(e.shipDate)x.sDs.push(e.shipDate) } });
  const fromDate={}; Object.keys(oM).forEach(sk=>{ const c=[...(oM[sk].oDs||[])]; if(planStart[sk])c.push(planStart[sk]); c.sort(); fromDate[sk]=c.length?addDays(c[0],-14):addDays(TODAY,-120) });
  const orderKeys=new Set(Object.keys(oM));
  // Cutting — only current order styles; historical orphan styles are ignored in this overview.
  const cM = {};
  CUT.filter(r=>r.src!=='ref'&&r.pieces>0).forEach(r=>{
    const sk = nsk(r.styleNo); if(!sk||!orderKeys.has(sk)) return; if(r.date&&r.date<fromDate[sk]) return;
    if(!cM[sk]) cM[sk]={pcs:0,dates:[],secs:new Set()};
    cM[sk].pcs += r.pieces;
    if(r.date)    cM[sk].dates.push(r.date);
    if(r.section) cM[sk].secs.add(r.section);
  });

  // Sewing
  // ★ v4.2 修正：車縫 DB 現含三種來源（日報 norm / 目標報表 target / Daily Output dpo），
  //   同一天同一條線會有重複記錄。直接加總會膨脹（曾出現 26,393,951 件）。
  //   規則與車縫/裁剪系統一致：同一天只認 norm > target > dpo 其中一種來源。
  const _sewDedup=(()=>{
    const byDay={};
    SEW.forEach(r=>{
      const d=String(r.date||''); if(!byDay[d]) byDay[d]={norm:0,target:0,dpo:0};
      const src=(r.tSrc==='target')?'target':(r.tSrc==='dpo')?'dpo':'norm';
      byDay[d][src]++;
    });
    const pick={};
    Object.keys(byDay).forEach(d=>{
      const v=byDay[d];
      pick[d]= v.norm>0?'norm' : v.target>0?'target' : 'dpo';
    });
    return SEW.filter(r=>{
      const src=(r.tSrc==='target')?'target':(r.tSrc==='dpo')?'dpo':'norm';
      return src===pick[String(r.date||'')];
    });
  })();
  const sM = {};
  _sewDedup.filter(r=>r.pieces>0).forEach(r=>{
    const sk = nsk(r.styleNo); if(!sk||!orderKeys.has(sk)) return; if(r.date&&r.date<fromDate[sk]) return;
    if(!sM[sk]) sM[sk]={pcs:0,dates:[],secs:new Set(),lines:new Set()};
    sM[sk].pcs += r.pieces;
    if(r.date)   sM[sk].dates.push(r.date);
    if(r.section) sM[sk].secs.add(r.section);
    if(r.lineNo)  sM[sk].lines.add(r.lineNo);
  });

  const all = new Set(Object.keys(oM));
  STYLES = [];
  all.forEach(sk=>{
    const o=oM[sk]||{qty:0,pos:new Set(),custs:new Set(),oDs:[],sDs:[]};
    const c=cM[sk]||{pcs:0,dates:[],secs:new Set()};
    const s=sM[sk]||{pcs:0,dates:[],secs:new Set(),lines:new Set()};
    const qty=o.qty, cutPcs=c.pcs, sewPcs=s.pcs;
    const cutPct = qty>0 ? Math.min(100,Math.round(cutPcs/qty*100)) : (cutPcs>0?100:0);
    const sewPct = qty>0 ? Math.min(100,Math.round(sewPcs/qty*100)) : (sewPcs>0?100:0);
    const allSecs = new Set([...c.secs,...s.secs]);
    const actDs = [...c.dates,...s.dates].sort();
    STYLES.push({
      sk, customer:[...o.custs].join(', ')||'—', custs:o.custs, pos:o.pos,
      qty, cutPcs, sewPcs, balance:Math.max(0,qty-sewPcs),
      cutPct, sewPct,
      orderDate: o.oDs.sort()[0]||'', shipDate: o.sDs.sort()[0]||'',
      status: calcSt(cutPcs,sewPcs,qty), src: o.planOnly?'plan':'po', fromDate: fromDate[sk]||'',
      secs: allSecs, lines: s.lines,
      latestAct: actDs[actDs.length-1]||'',
    });
  });

  // ★ v4.2 效能：建立款號索引，取代迴圈內的 STYLES.find()（2400+ 款時是 O(n²) 主因）
  STYLE_IX = new Map(STYLES.map(r=>[r.sk,r]));
  const tO = STYLES.reduce((s,r)=>s+r.qty,0);
  const tS = STYLES.reduce((s,r)=>s+r.sewPcs,0);
  document.getElementById('h-styles').textContent = STYLES.length.toLocaleString();
  document.getElementById('h-ord').textContent    = fmt(tO);
  document.getElementById('h-sew').textContent    = fmt(tS);
}

