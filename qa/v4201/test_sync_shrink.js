/* v4.20.1 — sewing deadlock (Paul 11/03): "已阻擋少覆多｜雲端 75,437 > 本機 74,926｜先拉取核對" on every device, and Pull returned
   "下載 0｜待上傳 1,808". Cause: the push guard summed the baseline HASH map (always 0 = "no baseline") → any device with fewer rows than
   the cloud was blocked forever; Pull kept locally re-imported buckets as they were. Live cloud (read-only): 2026 = 11,367 rows vs the
   page's 10,856; the two buckets that differ are m:2026-08 and m:2026-10 (1,544 + 775 = 2,319 cloud vs 1,808 local).
   This test runs the real vrt-smart-sync-v3.js in Chromium (each device = its own browser profile) against the real GAS v4.9.1 in memory. */
const fs=require('fs'),path=require('path'),assert=require('assert');const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'../..');const {createGas}=require(ROOT+'/qa/v41/gas_harness');const BASE=process.env.VRT_BASE_URL||'http://127.0.0.1:8765/';
const URL_='https://script.google.com/macros/s/MOCK_PROD/exec';
const out=[];async function test(name,fn){try{out.push({name,status:'PASS',detail:await fn()});console.log('PASS',name,'·',out.at(-1).detail)}catch(e){out.push({name,status:'FAIL',detail:String(e&&e.stack||e)});console.log('FAIL',name,'·',e.message)}}
const day=(m,d)=>'2026-'+m+'-'+String(d).padStart(2,'0');
function month(m,days,perSection,prefix){const a=[];for(let d=1;d<=days;d++)for(const sec of ['Garment','Apron'])for(let i=0;i<perSection;i++)a.push({id:prefix+'_'+m+'_'+d+'_'+sec+'_'+i,date:day(m,d),section:sec,lineNo:'Line '+(i+1),styleNo:'S'+i,pieces:100+i});return a}
(async()=>{const g=createGas();const b=await chromium.launch({executablePath:process.env.VRT_CHROMIUM||'/opt/pw-browsers/chromium'});
  async function device(){const ctx=await b.newContext();await ctx.route('https://script.google.com/**',async route=>{const req=route.request();const r=await g.fetch(req.url(),{method:req.method(),body:req.postData()||undefined});await route.fulfill({status:200,contentType:'application/json',body:await r.text()})});const p=await ctx.newPage();await p.goto(BASE+'qa/v4201/sync_lab.html');await p.waitForFunction(()=>window.VRTSmartSync);return p}
  const push=(p,records,extra)=>p.evaluate(([u,records,extra])=>VRTSmartSync.push(Object.assign({url:u,tool:'sewlab',records,meta:{}},extra||{})),[URL_,records,extra||{}]);
  const pull=(p,local)=>p.evaluate(([u,local])=>VRTSmartSync.pull({url:u,tool:'sewlab',localRecords:local,meta:{}}).then(r=>({ok:r.ok,n:r.records.length,restored:r.restored||0,pending:r.pendingUpload||0,records:r.records})),[URL_,local]);
  const cloud=()=>{const m=g.ctx.readSmartManifest_('sewlab');return Object.values(m.counts||Object.fromEntries(Object.entries(m.buckets).map(([k,v])=>[k,v.count]))).reduce((a,c)=>a+c,0)};
  // device A: the old cloud — August has BOTH an old source and a newer one for days 1–10 (like a target + daily report), 4 rows/section
  const aug=month('08',26,4,'old').concat(month('08',10,2,'tgt')),sep=month('09',26,4,'sep'),octOld=month('10',16,4,'oct');
  const A=await device();await test('device A pushes Jul–Oct (cloud baseline)',async()=>{const r=await push(A,aug.concat(sep,octOld));assert(r.ok,JSON.stringify(r));return 'cloud '+cloud()});
  const B=await device();let local;
  await test('device B pulls, re-imports Aug days 1–10 (one source per day → fewer rows) and adds Oct 17–31 → before the fix push said "已阻擋少覆多"; now the cloud rows of the re-imported days are recognised as replaced and the push goes through',async()=>{
    const r=await pull(B,[]);local=r.records;assert.equal(local.length,cloud());
    // re-import: days 1–10 of August keep only the 'old' rows (the extra 'tgt' rows are gone), October grows to day 20 only, while August days 1–10 drop the tgt rows
    local=local.filter(x=>!/^tgt_/.test(x.id)).concat(month('10',20,4,'oct').filter(x=>Number(x.date.slice(8))>16));
    const before=cloud();assert(local.length<before,'scenario: local smaller than cloud ('+local.length+' vs '+before+')');
    const res=await push(B,local);assert(res.ok,'push blocked: '+JSON.stringify(res).slice(0,300));assert.equal(cloud(),local.length);
    return 'cloud '+before+' → '+cloud()+' (= device B) · uploaded '+res.uploaded});
  await test('device A (still holding the old rows) pulls → gets B\'s version; its own push then has nothing to send',async()=>{const r=await pull(A,aug.concat(sep,octOld));assert.equal(r.n,cloud(),'A '+r.n+' vs cloud '+cloud());const res=await push(A,r.records);assert(res.ok&&res.uploaded===0,JSON.stringify(res).slice(0,200));return 'A '+r.n+' · re-push uploaded 0'});
  const C=await device();
  await test('a device that LOST whole days (no re-import of those days) is still blocked from shrinking the cloud, and Pull brings the days back ("補回")',async()=>{
    let r=await pull(C,[]);let mine=r.records;const n0=mine.length;
    mine=mine.filter(x=>!(x.date===day('09','05')||x.date===day('09','06')))  // two September days gone on this device
      .concat([{id:'new_oct21',date:day('10','21'),section:'Garment',lineNo:'Line 1',styleNo:'S0',pieces:1}]);
    const res=await push(C,mine);assert(!res.ok&&res.shrinkBlocked,'must block: '+JSON.stringify(res).slice(0,200));assert.equal(res.missingRows,16);
    r=await pull(C,mine);assert.equal(r.restored,16,'restored '+r.restored);assert.equal(r.n,n0+1);
    const res2=await push(C,r.records);assert(res2.ok,JSON.stringify(res2).slice(0,200));assert.equal(cloud(),n0+1);
    return 'blocked (16 rows of 09-05/09-06 missing) → pull 補回 16 → push ok · cloud '+cloud()});
  await test('opening a page again (pull + push with nothing new) transfers nothing',async()=>{let r=await pull(B,local);await push(B,r.records);const calls0=g.calls.length;r=await pull(B,r.records);const res=await push(B,r.records);const moved=g.calls.slice(calls0).filter(c=>c.p&&/^smart(Bucket|Commit)$/.test(c.p.action)).length;assert.equal(moved,0,'POSTs '+moved);assert.equal(res.uploaded,0);return 'second open: manifest check only · 0 bucket uploads'});
  await b.close();const pass=out.filter(x=>x.status==='PASS').length;console.log(`\n${pass}/${out.length} passed`);fs.writeFileSync(path.join(__dirname,'sync_shrink_results.json'),JSON.stringify({at:new Date().toISOString(),pass,total:out.length,results:out},null,1));process.exit(pass===out.length?0:1)})();
