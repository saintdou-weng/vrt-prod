/* v4.15 ERP link core — logic checks with clearly isolated synthetic data (規格書 §14: T03 T05 T06 T07 T10 T11 T29 T31 + states).
   These are NOT real-ERP acceptance runs: no real ERP export file was available (規格書 §2.2.10). Real-data comparison stays NOT TESTED. */
const path=require('path'),assert=require('assert'),fs=require('fs');
require(path.resolve(__dirname,'../../vrt-erp-link-core-v1.js'));const C=globalThis.VRTErpLink;
const out=[];async function test(name,fn){try{out.push({name,status:'PASS',detail:await fn()});console.log('PASS',name,'·',out.at(-1).detail)}catch(e){out.push({name,status:'FAIL',detail:e.stack});console.log('FAIL',name,'·',e.message)}}
const CSV=(h,rows)=>[h.join(','),...rows.map(r=>r.join(','))].join('\n');
function imp(dataset,text,existing,batch,opts){const p=C.parseText(text);const map=C.suggestMapping(p.headers,dataset);const n=C.normalizeRows(dataset,p.rows,map,Object.assign({as_of:'2026-10-03',import_batch_id:batch,source_file:batch+'.csv'},opts||{}));assert.equal(n.errors.length,(opts&&opts.expectErrors)||0,'errors '+JSON.stringify(n.errors));return C.mergeImport(existing,n.records,{at:'2026-10-05T08:00:00',import_batch_id:batch})}
const H=['od_no','od_seq','my_no','cust','style','clr','size','po_no','order_date','delivery','qty','closed'];
const big=[];for(let i=1;i<=1000;i++)big.push(['T-'+String(i).padStart(5,'0'),1,'K'+String(i).padStart(6,'0'),'CUST','S'+(i%37),'BLK','M','PO'+i,'2026/07/01','2026/10/'+String(1+i%28).padStart(2,'0'),100+i,'N']);
// PROD-shaped rows (same field names as the real modules: sewing selfKey/po/styleNo/color/pieces, plan po/style/color/orderQty/sewingQty, orders customer/po_number/style_code/color/qty, shipping cust/po/style/color/etd/orig/shipped/open/erp)
const prod={
  sewing:[{date:'2026-09-25',lineNo:'Line 16',selfKey:'T029671',po:'A029671',styleNo:'GO1543',color:'L.BLUE',pieces:500,section:'Garment'},{date:'2026-09-26',lineNo:'Line 16',selfKey:'T029671',po:'A029671',styleNo:'GO1543',color:'L.BLUE',pieces:400,section:'Garment'},{date:'2026-09-26',lineNo:'Line 2',selfKey:'T000412',po:'5474',styleNo:'412',color:'WHITE',pieces:3000,section:'Apron'},{date:'2026-09-26',lineNo:'Line 3',selfKey:'',po:'PO-9',styleNo:'ZZ-9',color:'BLACK',pieces:10}],
  plan:[{month:'2026-09',line:'Line 16',customer:'TESTCUST',po:'A029671',style:'GO1543',color:'L.BLUE',orderQty:1440,sewingQty:1440,dailyOutput:450,startDate:'2026-09-24',endDate:'2026-09-27'},{month:'2026-10',line:'Line 2',customer:'TESTCUST',po:'5474',style:'412',color:'WHITE',orderQty:48600,sewingQty:10800,dailyOutput:3000,startDate:'2026-09-20',endDate:'2026-10-16'}],
  orders:[{customer:'TESTCUST',po_number:'A029671',style_code:'GO1543',color:'L.BLUE',size:'4XL',qty:960,cancel_date:'30-SEP-26'},{customer:'TESTCUST',po_number:'A029671',style_code:'GO1543',color:'L.BLUE',size:'3XL',qty:480,cancel_date:'30-SEP-26'}],
  shipping:[{cust:'TESTCUST',po:'A029671',style:'GO1543',color:'L.BLUE',size:'',etd:'2026-09-20',orig:900,shipped:600,open:300,erp:'T029671'},{cust:'TESTCUST',po:'A029671',style:'GO1543',color:'L.BLUE',size:'',etd:'2026-09-27',orig:540,shipped:300,open:240,erp:'T029671'},{cust:'X',po:'PO-X',style:'SX',color:'RED',etd:'2026-09-10',orig:100,shipped:100,open:0,erp:'T777777'}],
  cutting:[{date:'2026-09-26',section:'Garment',lineNo:'Table 1',styleNo:'GO1543',pieces:420,src:'daily'},{date:'2026-09-26',section:'Garment',lineNo:'Weekly Report',pieces:9999,src:'ref'}],
  qc:[{date:'2026-09-26',line:'Line 16',reportKind:'daily',inspected:380,rejected:12},{date:'2026-09-26',line:'Line 16',reportKind:'weekly',inspected:999,rejected:99}],
};
(async()=>{
  await test('Parse + suggest + normalise keeps raw keys (leading zeros, hyphens), dates by rule, qty numeric; required fields enforced (T11)',async()=>{
    const f=C.sampleFiles();const p=C.parseText(f.orders.text);const m=C.suggestMapping(p.headers,'order_line');const n=C.normalizeRows('order_line',p.rows,m,{as_of:'2026-10-03'});
    assert.equal(n.records.length,4);assert.equal(n.records[0].qty_raw,'0960');assert.equal(n.records[0].qty,960);assert.equal(n.records[0].od_no,'TEST-0001');assert.equal(n.records[0].source_business_key,'TEST-0001|1');assert.equal(n.records[0].delivery,'2026-09-30');
    const bad=C.normalizeRows('order_line',[['','','','','','','','','','','12','']],m,{});assert.equal(bad.errors.length,1);assert(/missing_required:od_no/.test(bad.errors[0].reason));
    assert.equal(C.missingRequired('order_line',{od_no:0}).join(','),'qty');
    return 'ids '+n.records.map(r=>r.id.slice(-6)).join(',')+' · key sample '+n.records[0].source_business_key});
  await test('Dates: ISO / yyyy/mm/dd / yyyymmdd / dd-MMM-yy / ROC 民國 / excel serial parse; a/b/yyyy with both ≤12 is ambiguous unless the template says MDY or DMY (never today)',async()=>{
    const d=s=>C.parseDate(s).date;assert.equal(d('2026-09-05'),'2026-09-05');assert.equal(d('2026/9/5'),'2026-09-05');assert.equal(d('20260905'),'2026-09-05');assert.equal(d('5-SEP-26'),'2026-09-05');assert.equal(d('115/09/05'),'2026-09-05');assert.equal(d('46270'),'2026-09-05');
    assert.equal(C.parseDate('03/04/2026').rule,'ambiguous');assert.equal(C.parseDate('03/04/2026','MDY').date,'2026-03-04');assert.equal(C.parseDate('03/04/2026','DMY').date,'2026-04-03');assert.equal(C.parseDate('13/04/2026').date,'2026-04-13');assert.equal(C.parseDate('').rule,'empty');assert.equal(C.parseDate('n/a').rule,'unparsed');
    return 'roc 115/09/05 → 2026-09-05 · ambiguous flagged'});
  await test('T03 same file ×3 and renamed file: counts and quantities never grow; duplicates inside one file are skipped',async()=>{
    const text=CSV(H,big);let r=imp('order_line',text,[],'b1');assert.equal(r.stats.added,1000);const q=r.records.reduce((s,x)=>s+x.qty,0);
    r=imp('order_line',text,r.records,'b2');assert.equal(r.stats.added,0);assert.equal(r.stats.same,1000);r=imp('order_line',text,r.records,'b3');r=imp('order_line',text,r.records,'renamed_copy');
    assert.equal(r.records.length,1000);assert.equal(r.records.reduce((s,x)=>s+x.qty,0),q);
    const dup=imp('order_line',CSV(H,big.slice(0,3).concat(big.slice(0,3))),[],'dup');assert.equal(dup.stats.added,3);assert.equal(dup.stats.skippedDup,3);
    return '1000 rows · 4 imports · qty '+q+' unchanged · in-file dups skipped 3'});
  await test('T05 a corrected field updates the row, keeps the previous version, and re-running does not accumulate',async()=>{
    let r=imp('order_line',CSV(H,big),[],'b1');const fixed=big.map(x=>x.slice());fixed[9][10]=55;
    r=imp('order_line',CSV(H,fixed),r.records,'fix');assert.equal(r.stats.updated,1);assert.equal(r.stats.same,999);const rec=r.records.find(x=>x.od_no==='T-00010');assert.equal(rec.qty,55);assert.equal(rec.versions.length,1);assert.equal(rec.versions[0].fields.qty,110);
    r=imp('order_line',CSV(H,fixed),r.records,'fix2');assert.equal(r.stats.updated,0);assert.equal(r.records.find(x=>x.od_no==='T-00010').versions.length,1);assert.equal(r.records.length,1000);
    return 'T-00010 qty 110 → 55 · versions 1 · rerun adds nothing'});
  await test('T06 / T07 a partial file (10 rows) after 1,000 keeps the other 990; a legitimate reduction is reflected with history (never silently dropped)',async()=>{
    let r=imp('order_line',CSV(H,big),[],'b1');r=imp('order_line',CSV(H,big.slice(0,10)),r.records,'partial');assert.equal(r.records.length,1000);assert.equal(r.stats.same,10);assert.equal(r.stats.added,0);
    const less=big.slice(0,10).map(x=>x.slice());less[0][10]=1;r=imp('order_line',CSV(H,less),r.records,'reduce');const rec=r.records.find(x=>x.od_no==='T-00001');assert.equal(rec.qty,1);assert.equal(rec.versions[0].fields.qty,101);
    return '990 untouched · reduction 101 → 1 kept with version'});
  await test('Rows without a line seq are identified by content (two different lines never collapse into one)',async()=>{
    const H2=['od_no','my_no','cust','style','clr','po_no','delivery','qty'];const rows=[['A1','M1','C','S','BLK','P1','2026/10/01',10],['A1','M1','C','S','RED','P1','2026/10/01',20]];
    const r=imp('order_line',CSV(H2,rows),[],'noseq');assert.equal(r.stats.added,2);assert(r.records.every(x=>x.quality.includes('no_line_seq')));return '2 lines kept, flagged no_line_seq'});
  await test('compareOrders: crosswalk > self key > unique PO+style+colour; six states; nothing multiplied (T10)',async()=>{
    const f=C.sampleFiles();const r=imp('order_line',f.orders.text,[],'s1');const res=C.compareOrders({erp:r.records,prod,asOf:{erp:'2026-10-03',prod:'2026-09-26'}});
    const by={};res.rows.forEach(x=>by[x.key]=x);
    const a=by['T029671'];assert.equal(a.via,'selfKey');assert.equal(a.erp.qty,1440);assert.equal(a.prod.sewn,900);assert.equal(a.prod.poQty,1440);assert.equal(a.prod.planOrder,1440);assert.equal(a.prod.shipped,900);assert.equal(a.prod.shipOrig,1440);assert.equal(a.state,'match',JSON.stringify(a.reasons));
    const b=by['T000412'];assert.equal(b.state,'match');assert.equal(b.prod.sewn,3000);assert.equal(b.prod.planOrder,48600);
    const c=by['T090001'];assert.equal(c.via,'po+style+colour');assert.equal(c.state,'match');assert.equal(c.prod.sewn,10);   // no self key in PROD, but PO-9 / ZZ-9 / BLACK is unique → matched by the combo, qty only a progress figure
    const amb=C.compareOrders({erp:r.records,prod:{sewing:prod.sewing.concat([{date:'2026-09-26',lineNo:'Line 4',po:'PO-9',styleNo:'ZZ-9',color:'BLACK',size:'L',pieces:5},{date:'2026-09-26',lineNo:'Line 5',po:'PO-9',styleNo:'ZZ-9B',color:'BLACK',pieces:5}])}});const cc=amb.rows.find(x=>x.key==='T090001');assert.equal(cc.state,'match');   // same combo twice is still one PROD group
    const amb2=C.compareOrders({erp:r.records.map(x=>x.my_no==='T090001'?Object.assign({},x,{my_no:''}):x),prod:{sewing:[{date:'2026-09-26',po:'PO-9',styleNo:'ZZ-9',color:'BLACK',pieces:5}]}});assert(amb2.rows.some(x=>x.via==='po+style+colour'));
    assert.equal(res.summary.total,3);assert.equal(res.unmatchedProd.length,1);assert.equal(res.unmatchedProd[0].key,'T777777');
    return 'states '+JSON.stringify(res.summary)+' · T029671 via '+a.via+' progress '+Math.round(a.prod.progress)+'%'});
  await test('compareOrders difference / timing / incomparable: qty mismatch → diff; ERP snapshot older than PROD data → timing; plan only → incomparable (T29, T31)',async()=>{
    const f=C.sampleFiles();const r=imp('order_line',f.orders.text,[],'s1');
    const prod2=JSON.parse(JSON.stringify(prod));prod2.orders[0].qty=1000;   // PROD PO 1480 ≠ ERP 1440
    let res=C.compareOrders({erp:r.records,prod:prod2,asOf:{erp:'2026-10-03'}});let a=res.rows.find(x=>x.key==='T029671');assert.equal(a.state,'diff');assert(a.reasons[0].includes('≠'));
    res=C.compareOrders({erp:r.records.map(x=>Object.assign({},x,{as_of:'2026-09-01'})),prod:prod2});a=res.rows.find(x=>x.key==='T029671');assert.equal(a.state,'timing');
    const planOnly={plan:prod.plan};res=C.compareOrders({erp:r.records,prod:planOnly});a=res.rows.find(x=>x.key==='T029671');assert.equal(a.state,'incomparable');
    const none=C.compareOrders({erp:r.records,prod:{}});assert(none.rows.every(x=>x.state==='missing'));
    return 'diff ✓ timing ✓ incomparable ✓ missing ✓'});
  await test('compareShipping: ERP shipped vs schedule shipped side by side (ETD / shipped / open kept apart); multiple BLs per PO sum once (T10)',async()=>{
    const f=C.sampleFiles();const r=imp('shipment_line',f.ship.text,[],'sh1');assert.equal(r.records.length,2);const res=C.compareShipping({erpShip:r.records,prodShip:prod.shipping,asOf:{erp:'2026-10-03',prod:'2026-09-28'}});
    const a=res.rows[0];assert.equal(a.key,'T029671');assert.equal(a.erp.shipped,900);assert.equal(a.erp.bl,2);assert.equal(a.prod.shipped,900);assert.equal(a.prod.open,540);assert.equal(a.prod.orig,1440);assert.equal(a.state,'match');
    assert.equal(res.unmatchedProd.length,1);assert.equal(res.unmatchedProd[0].key,'T777777');
    const less=prod.shipping.map(x=>Object.assign({},x));less[1].shipped=0;less[1].open=540;const res2=C.compareShipping({erpShip:r.records,prodShip:less,asOf:{erp:'2026-10-03',prod:'2026-09-28'}});assert.notEqual(res2.rows[0].state,'match');assert(/ERP 已出/.test(res2.rows[0].reasons[0]));
    return 'ERP 900 (2 BL) = schedule 900 · open 540 shown separately · schedule lag → '+res2.rows[0].state});
  await test('dailyReport numbers trace to the rows: sewn = sum of that day, cutting excludes Weekly Report rows, QC picks one report per line',async()=>{
    const r=C.dailyReport({date:'2026-09-26',today:'2026-09-27',prod,erp:{orders:4,ship:2,asOf:'2026-10-03'},compare:{}});
    assert.equal(r.report.metrics.sewn,3410);assert.equal(r.report.metrics.cut,420);assert.equal(r.report.metrics.inspected,380);assert.equal(r.report.metrics.rejected,12);assert.equal(r.report.metrics.planDaily,3450);assert(r.text.includes('Garment 400 · Apron 3,000'));   // Line 3 row has no section → counted in the total onlyassert(r.text.includes('未齊')===false);
    const miss=C.dailyReport({date:'2026-09-30',today:'2026-10-01',prod,erp:{},compare:{}});assert(miss.text.includes('未齊 not received'));assert.equal(miss.report.metrics.sewn,null);assert(miss.report.gaps.length>=4);assert(/N\/A/.test(miss.text));
    assert(r.report.report_id.startsWith('erplink-daily-2026-09-26'));assert.equal(r.plain.includes('<b>'),false);
    return 'sewn 3410 · cut 420 · QC 380/12 · plan 3450/day → '+Math.round(r.report.metrics.achievement)+'% · empty day gaps '+miss.report.gaps.length});
  await test('prevWorkday skips Sunday and factory holidays',async()=>{assert.equal(C.prevWorkday('2026-10-05'),'2026-10-03');assert.equal(C.prevWorkday('2026-10-05',['2026-10-03']),'2026-10-02');return 'Mon 10-05 → Sat 10-03; with 10-03 closed → Fri 10-02'});
  const pass=out.filter(x=>x.status==='PASS').length;console.log(pass+'/'+out.length+' PASS');fs.writeFileSync(path.resolve(__dirname,'erp_link_core_results.json'),JSON.stringify(out,null,1));process.exit(pass===out.length?0:1);
})();
