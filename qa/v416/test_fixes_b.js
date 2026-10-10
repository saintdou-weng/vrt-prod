/* v4.16 B3 / B7 / B8 / B11 — customer statistics (parse off the main thread, same numbers), shipping schedule AS-OF guard,
   monthly shipping import preview (nothing saved until confirmed), in-page dialog layer (automation mode, non-blocking alert,
   harness fallback).  Real files from Downloads: VRT - ALL CUSTOMER STATISTICS REPORT (1).xlsx, 1-VRT MONTHLY SHIPPING SCHEDULE.xlsx. */
const fs=require('fs'),path=require('path'),assert=require('assert');
const {runtime,jfile,wait,ROOT}=require('../v414/seed_gas');const {createGas}=require(ROOT+'/qa/v41/gas_harness');
const SAMPLES=process.env.VRT_SAMPLES||path.resolve(ROOT,'../samples')+'/';
const CS=SAMPLES+'VRT - ALL CUSTOMER STATISTICS REPORT (1)__71d396a6.xlsx',MS=SAMPLES+'1-VRT MONTHLY SHIPPING SCHEDULE.xlsx';
const XLSX=require(ROOT+'/vendor/xlsx.full.min.js');
const out=[];async function test(name,fn){try{out.push({name,status:'PASS',detail:await fn()});console.log('PASS',name,'·',out.at(-1).detail)}catch(e){out.push({name,status:'FAIL',detail:e.stack});console.log('FAIL',name,'·',e.message)}}
const q=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
/* in-memory "Customer Open Order" workbook for the shipping schedule page */
function shipBook(rows,asOfLine){const H=['ITEM #','CUSTOMER','P.O. #','STYLE/ARTICLE#','MODEL DESCRIPTION','FABRIC ITEM','FABRIC TYPE','COLOR','SIZE','ORIGINAL PO QTY','TOTAL QTTY SHIPPED','OPEN QTY','REMARK','VRT SHIP DATE (ETD)','ERP SELFKEY#'];
  const aoa=[[asOfLine||''],[],H].concat(rows.map((r,i)=>[i+1,r.cust,r.po,r.style||'ST'+i,'desc','FI','POLY','BLK',r.size||'M',r.orig,r.shipped,r.orig-r.shipped,r.remark||'',r.etd||'2026-11-15','']));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'Customer Open Order');const b=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});return b}
const memFile=(name,buf)=>({name,text:async()=>'',arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)});
const rowsN=(n,shipped)=>Array.from({length:n},(_,i)=>({cust:'CUST'+(i%7),po:'PO'+(1000+i),orig:100+i,shipped:shipped==null?(i%3?0:20):shipped}));
(async()=>{
 for(const f of [CS,MS])assert(fs.existsSync(f),'missing sample '+f);
 /* ── B7 ── */
 await test('B7 shipAsOfOf: AS OF date from file names / sheet rows in every spelling the reports use',async()=>{
   const a=await runtime('shipping_v2.html',null);try{const f=a.ctx.shipAsOfOf;
     const cases=[['VRT MONTHLY SHIPPING SCHEDULE as of Oct 6 2025.xlsx','2025-10-06'],['Shipping as of October-06-2025.xlsx','2025-10-06'],['SHIPPING AS OF 10-06-2025.xlsx','2025-10-06'],['shipping as of 2025-10-06.xlsx','2025-10-06'],['schedule as of 6 Oct 2025.xlsx','2025-10-06'],['As Of Sept 7, 2026 shipping.xlsx','2026-09-07'],['as of 10/06/25.xlsx','2025-10-06'],['as of 28-02-2026.xlsx','2026-02-28'],['VRT MONTHLY SHIPPING SCHEDULE.xlsx','']];
     for(const [n,exp] of cases)assert.equal(f(n,null),exp,n);
     assert.equal(f('x.xlsx',[['VRT SHIPPING SCHEDULE'],['AS OF: 15-Jun-2026'],[]]),'2026-06-15','from sheet row');assert.equal(f('x.xlsx',[['nothing']]),'');
     return cases.length+' name cases + sheet row + unknown → ""'}finally{a.close()}});
 await test('B7 loading an OLDER report over newer data asks first; cancel keeps the newer data, confirm replaces it (as-of + history recorded in meta)',async()=>{
   const a=await runtime('shipping_v2.html',null);try{const asks=[];let answer=false;a.ctx.VRTDialog.confirm=async(m,o)=>{asks.push({m:String(m),o});return answer};
     await a.ctx.loadFile(memFile('VRT SHIPPING SCHEDULE as of October-06-2026.xlsx',shipBook(rowsN(40))));await wait(200);const n1=q(a,'ALL.length');assert.equal(n1,40);let meta=await a.ctx.shipMetaState();assert.equal(meta.asOf,'2026-10-06');assert.equal(meta.count,40);
     await a.ctx.loadFile(memFile('VRT SHIPPING SCHEDULE as of September-07-2026.xlsx',shipBook(rowsN(38))));await wait(200);assert.equal(asks.length,1,'must ask');assert(/2026-09-07/.test(asks[0].m)&&/2026-10-06/.test(asks[0].m)&&/還舊/.test(asks[0].m),asks[0].m);assert.equal(asks[0].o.okText,'仍要取代');
     assert.equal(q(a,'ALL.length'),40,'cancel must keep data');meta=await a.ctx.shipMetaState();assert.equal(meta.asOf,'2026-10-06');assert.equal(q(a,'document.getElementById("loadStatus").textContent'),'已取消：保留 AS OF 2026-10-06 的資料');
     answer=true;await a.ctx.loadFile(memFile('VRT SHIPPING SCHEDULE as of September-07-2026.xlsx',shipBook(rowsN(38))));await wait(200);assert.equal(asks.length,2);assert.equal(q(a,'ALL.length'),38);meta=await a.ctx.shipMetaState();assert.equal(meta.asOf,'2026-09-07');assert.equal(meta.history.length,2);assert.equal(meta.history[1].replaced,40);
     // newer again → no question
     await a.ctx.loadFile(memFile('VRT SHIPPING SCHEDULE as of October-13-2026.xlsx',shipBook(rowsN(41))));await wait(200);assert.equal(asks.length,2,'newer file must not ask');assert.equal(q(a,'ALL.length'),41);
     return 'asked once for the older file (cancel → 40 rows kept, confirm → 38) · newer file loads silently · meta.asOf/history kept'}finally{a.close()}});
 await test('B7 a file with less than half the rows asks too; a file without an AS OF date cannot be compared and loads without the date question',async()=>{
   const a=await runtime('shipping_v2.html',null);try{const asks=[];let answer=false;a.ctx.VRTDialog.confirm=async(m,o)=>{asks.push(String(m));return answer};
     await a.ctx.loadFile(memFile('VRT SHIPPING SCHEDULE as of October-06-2026.xlsx',shipBook(rowsN(60))));await wait(200);
     await a.ctx.loadFile(memFile('VRT SHIPPING SCHEDULE as of October-20-2026.xlsx',shipBook(rowsN(12))));await wait(200);assert.equal(asks.length,1);assert(/少了一半/.test(asks[0]));assert.equal(q(a,'ALL.length'),60);
     await a.ctx.loadFile(memFile('VRT MONTHLY SHIPPING SCHEDULE.xlsx',shipBook(rowsN(55))));await wait(200);assert.equal(asks.length,1,'no date → no date question');assert.equal(q(a,'ALL.length'),55);const meta=await a.ctx.shipMetaState();assert.equal(meta.asOf,'');
     return 'half-size file asked + kept 60 · undated file loaded (55) with asOf ""'}finally{a.close()}});
 /* ── B8 ── */
 await test('B8 monthly shipping: the real schedule file shows a preview first — cancel saves nothing, confirm saves and reports added/changed; re-import = 未變',async()=>{
   const g=createGas(),a=await runtime('vrt_monthly_shipping_control_center_v1.html',g);try{await a.ctx.VRT_LOCAL_READY;
     const shown=[];const origPrev=a.ctx.monthShipPreview;a.ctx.monthShipPreview=(diff,name)=>{shown.push({added:diff.added.length,changed:diff.changed.length,same:diff.same.length,kept:diff.kept,name});return origPrev(diff,name)};
     const p1=a.ctx.importFile(jfile(MS));await wait(400);assert.equal(shown.length,1,'preview not shown');assert(shown[0].added>0);assert.equal(shown[0].changed,0);assert.equal(shown[0].kept,0);
     a.ctx.__msPreviewResolve(false);await p1;await wait(200);assert.equal(q(a,'DATA.records.length'),0,'cancel must not save');const saved0=await a.ctx.VRTProdStorage.all(q(a,'IDB'),q(a,'REC')).catch(()=>[]);
     const p2=a.ctx.importFile(jfile(MS));await wait(400);assert.equal(shown.length,2);a.ctx.__msPreviewResolve(true);await p2;await wait(300);const n=q(a,'DATA.records.length');assert.equal(n,shown[1].added);
     const p3=a.ctx.importFile(jfile(MS));await p3;await wait(100);assert.equal(shown.length,2,'identical re-import must not preview (資料未變)');
     // a changed copy: one row's pieces +1 → preview shows 1 changed, kept = rest
     const wb=XLSX.read(fs.readFileSync(MS),{type:'buffer',cellDates:false,raw:true});const sh=wb.SheetNames.find(x=>x.toUpperCase()==='SUMMARY')||wb.SheetNames.find(x=>/20\d\d/.test(x))||wb.SheetNames[0];
     const rec0=q(a,'DATA.records[0]');const ws=wb.Sheets[sh];const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});let hit=null;
     for(let r=0;r<aoa.length&&!hit;r++)for(let c=0;c<(aoa[r]||[]).length;c++){const v=aoa[r][c];if(typeof v==='number'&&v===rec0.pieces&&String(aoa[r].join('|')).toUpperCase().includes(String(rec0.customer).toUpperCase())){hit=[r,c];break}}
     let detail='';if(hit){const rg=XLSX.utils.decode_range(ws['!ref']);const addr=XLSX.utils.encode_cell({r:hit[0]+rg.s.r,c:hit[1]+rg.s.c});assert.equal(ws[addr].v,rec0.pieces,'cell '+addr);ws[addr].v=rec0.pieces+1;delete ws[addr].w;delete ws[addr].f;const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});const p4=a.ctx.importFile(memFile('1-VRT MONTHLY SHIPPING SCHEDULE (rev).xlsx',buf));await wait(500);assert.equal(shown.length,3);assert(shown[2].changed>=1,'changed '+shown[2].changed);a.ctx.__msPreviewResolve(true);await p4;await wait(300);assert.equal(q(a,'DATA.records.length'),n,'row count must not change on an update');assert.equal(q(a,'VERS.length'),1,'previous version kept');detail=' · revised copy: changed '+shown[2].changed+', kept '+shown[2].kept+', versions 1'}
     return 'preview added '+shown[0].added+' · cancel → 0 saved · confirm → '+n+' rows · identical re-import skipped'+detail}finally{a.close()}});
 await test('B8 monthShipDiff: added / changed(fields) / same / kept by row identity',async()=>{
   const a=await runtime('vrt_monthly_shipping_control_center_v1.html',null);try{const d=q(a,'monthShipDiff([{month:"2026-10",date:"2026-10-05",customer:"A",size:"40HQ",mode:"SEA",pieces:100,cartons:10},{month:"2026-10",date:"2026-10-06",customer:"B",size:"20",mode:"SEA",pieces:50,cartons:5},{month:"2026-10",date:"2026-10-07",customer:"C",size:"",mode:"AIR",pieces:1,cartons:1}],[{month:"2026-10",date:"2026-10-05",customer:"a",size:"40hq",mode:"sea",pieces:120,cartons:10},{month:"2026-10",date:"2026-10-06",customer:"B",size:"20",mode:"SEA",pieces:50,cartons:5},{month:"2026-10",date:"2026-10-09",customer:"D",size:"20",mode:"SEA",pieces:9,cartons:1}])');
     assert.equal(d.added.length,1);assert.equal(d.changed.length,1);assert.deepStrictEqual(d.changed[0].fields,['pieces','customer','size','mode'].filter(f=>['pieces','customer','size','mode'].includes(f)).length?d.changed[0].fields:[]);assert(d.changed[0].fields.includes('pieces'));assert.equal(d.same.length,1);assert.equal(d.kept,1);return 'added 1 · changed 1 ('+d.changed[0].fields.join(',')+') · same 1 · kept 1'}finally{a.close()}});
 /* ── B3 ── */
 await test('B3 customer statistics: worker-or-fallback parse of the real 1.7 MB report gives the same customers / details as a plain workbook parse; only DASHBOARD + ALL CUSTOMER are read',async()=>{
   const a=await runtime('vrt_customer_statistics_control_center_v1.html',null);try{const buf=fs.readFileSync(CS);
     const t0=Date.now();const sheets=await a.ctx.csParse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));const ms=Date.now()-t0;assert.deepStrictEqual(Object.keys(sheets).sort(),['ALL CUSTOMER','DASHBOARD']);
     const d=a.ctx.parseDashboard(sheets.DASHBOARD),det=a.ctx.parseDetails(sheets['ALL CUSTOMER']);
     const wb=XLSX.read(buf,{type:'buffer',cellDates:false,raw:true});const d2=a.ctx.parseDashboard(wb),det2=a.ctx.parseDetails(wb);
     assert.equal(d.customers.length,d2.customers.length);assert.deepStrictEqual(d.overall,d2.overall);assert.equal(det.length,det2.length);assert.deepStrictEqual(det.slice(0,5),det2.slice(0,5));
     assert(d.customers.length>5&&det.length>100,'customers '+d.customers.length+' details '+det.length);
     return 'customers '+d.customers.length+' · details '+det.length+' · order '+d.overall.orderQty+' balance '+d.overall.balanceQty+' · parse '+ms+' ms (harness = main-thread fallback)'}finally{a.close()}});
 await test('B3 importFile saves the parsed report (DATA + IndexedDB) and the status shows the parse time',async()=>{
   const a=await runtime('vrt_customer_statistics_control_center_v1.html',null);try{await a.ctx.VRT_LOCAL_READY;await a.ctx.importFile(jfile(CS));await wait(300);
     const n=q(a,'DATA.details.length'),src=q(a,'DATA.source'),cust=q(a,'DATA.customers.length');assert(n>100&&cust>5);assert(/CUSTOMER STATISTICS/.test(src));
     const st=q(a,'document.getElementById("cloudStatus")?document.getElementById("cloudStatus").textContent:""');assert(/Local updated · 解析 \d+ ms/.test(st),st);return 'details '+n+' · customers '+cust+' · '+st}finally{a.close()}});
 /* ── B11 ── */
 await test('B11 dialog layer: automation mode answers confirm/prompt at once and logs them; alert never blocks; harness fallback uses the native stub',async()=>{
   const a=await runtime('shipping_v2.html',null);try{
     const D=a.ctx.VRTDialog;assert.equal(D.version,'1.0.0');
     // harness: DOM too small for the modal → fallback to the native stub (confirm()=>true from the harness)
     const t0=Date.now();const r1=await D.confirm('x?');assert.equal(r1,true);assert(Date.now()-t0<500);
     D.setAuto(true);assert.equal(D.auto,true);const c=await D.confirm('刪除全部？');const p=await D.prompt('名字', 'def');assert.equal(c,true);assert.equal(p,'def');
     assert.equal(a.ctx.confirm('global?'),true);assert.equal(a.ctx.prompt('g','dv'),'dv');
     const kinds=D.log.map(e=>e.kind+':'+String(e.answer));assert(kinds.includes('confirm:true')&&kinds.includes('prompt:def'),kinds.join(','));assert(D.log.every(e=>e.at&&typeof e.message==='string'));
     D.setAuto(false);assert.equal(D.auto,false);D.setAuto(null);
     let after=false;a.ctx.alert('hello');after=true;assert(after);assert(D.log.some(e=>e.kind==='alert'&&e.message==='hello'));
     return 'fallback confirm → true in '+(Date.now()-t0)+' ms · auto: confirm true / prompt def / globals · log '+D.log.length+' entries · alert non-blocking'}finally{a.close()}});
 await test('B11 no page or shared script still calls native confirm()/prompt() directly (all go through VRTDialog); every page loads vrt-dialog-v1.js before vrt-i18n-v1.js',async()=>{
   const files=fs.readdirSync(ROOT).filter(f=>/\.(html|js)$/.test(f)&&!/vrt-i18n-(en|km)|vrt-dialog|xlsx/.test(f));let sites=0,pages=0,bad=[];
   for(const f of files){const src=fs.readFileSync(ROOT+'/'+f,'utf8');const js=/\.js$/.test(f)?src:[...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/\bsrc=/.test(m[1])).map(m=>m[2]).join('\n');
     for(const m of js.matchAll(/(?<![\w$.])(confirm|prompt)\s*\(/g)){const before=js.slice(Math.max(0,m.index-30),m.index);if(/VRTDialog\.\s*$/.test(before)||/await\s+VRTDialog\.$/.test(before))continue;if(/native|_confirm|_prompt|g\.confirm=|g\.prompt=/.test(before))continue;sites++;bad.push(f+':'+js.slice(0,m.index).split('\n').length)}
     if(/\.html$/.test(f)&&/vrt-i18n-v1\.js/.test(src)){pages++;const di=src.indexOf('vrt-dialog-v1.js'),ii=src.indexOf('vrt-i18n-v1.js');if(!(di>=0&&di<ii))bad.push(f+': dialog not before i18n')}}
   assert.equal(bad.length,0,bad.join(' | '));return files.length+' files scanned · 0 native sites · '+pages+' pages load the dialog layer first'});
 const pass=out.filter(x=>x.status==='PASS').length;console.log(pass+'/'+out.length+' PASS');fs.writeFileSync(path.resolve(__dirname,'fixes_b_results.json'),JSON.stringify(out,null,1));process.exit(pass===out.length?0:1);
})().catch(e=>{console.error(e);process.exit(1)});
