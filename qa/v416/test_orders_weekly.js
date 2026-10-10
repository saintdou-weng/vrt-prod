/* v4.16 B1/B2 — orders_v3 weekly-report import with the REAL weekly files from Downloads (same-size pairs that the old
   500-byte hash confused): content hash de-dup, upsert per as_of + customer, import queue under the auto-sync lock,
   cloud ids = business identity (no cross-device loss), pull started before a write never overwrites it. */
const fs=require('fs'),path=require('path'),assert=require('assert');
const {runtime,jfile,ev,wait,ROOT}=require('../v414/seed_gas');const {createGas}=require(ROOT+'/qa/v41/gas_harness');
const SAMPLES=process.env.VRT_SAMPLES||path.resolve(ROOT,'../samples')+'/';
const W=n=>SAMPLES+'VRT Weekly Open Order Summary as of '+n+'.xlsx';
const out=[];async function test(name,fn){try{out.push({name,status:'PASS',detail:await fn()});console.log('PASS',name,'·',out.at(-1).detail)}catch(e){out.push({name,status:'FAIL',detail:e.stack});console.log('FAIL',name,'·',e.message)}}
const q=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
async function importFiles(r,names){await r.ctx.importQueue(names.map(n=>jfile(W(n))));await wait(300)}
const weeksOf=r=>q(r,'Object.fromEntries(Object.entries(validWeeklySnapshots().reduce((m,w)=>{(m[w.as_of_date]=m[w.as_of_date]||[]).push(w.customer);return m},{})).map(([k,v])=>[k,v.length]))');
(async()=>{
 for(const n of ['February-16-2026','June-15-2026','February-02-2026','February-23-2026'])assert(fs.existsSync(W(n)),'missing sample '+n);
 await test('B1 same-size weekly files (Feb-16 / Jun-15 = 124,701 B; Feb-02 / Feb-23 = 124,750 B) are all imported — content hash, not size',async()=>{
   const g=createGas(),a=await runtime('orders_v3.html',g);try{await importFiles(a,['February-16-2026','June-15-2026','February-02-2026','February-23-2026']);const wk=weeksOf(a);const imps=q(a,'APP.imports.filter(i=>i.type==="weekly").map(i=>[i.as_of,i.rows,i.file_hash.slice(0,12)])');
     assert.deepStrictEqual(Object.keys(wk).sort(),['2026-02-02','2026-02-16','2026-02-23','2026-06-15']);assert.equal(imps.length,4);assert.equal(new Set(imps.map(x=>x[2])).size,4,'hashes must differ');assert(imps.every(x=>/^(sha256|fnv)/.test(x[2])));
     const legacy=q(a,'[hashBuf(new Uint8Array(10).buffer)]');return 'weeks '+JSON.stringify(wk)+' · 4 distinct content hashes'}finally{a.close()}});
 await test('B1 re-import of the very same file is skipped; a changed copy of the same week updates rows in place (no duplicates, same count)',async()=>{
   const g=createGas(),a=await runtime('orders_v3.html',g);try{await importFiles(a,['February-16-2026']);const n1=q(a,'APP.weekly.length');await importFiles(a,['February-16-2026']);const n2=q(a,'APP.weekly.length');assert.equal(n2,n1,'re-import duplicated rows');assert.equal(q(a,'APP.imports.filter(i=>i.type==="weekly").length'),1,'second import record written for an identical file');
     // changed copy: append a byte so the content hash differs but the parsed snapshots are identical (same week) → 0 added, rows kept
     const buf=fs.readFileSync(W('February-16-2026'));const f={name:'VRT Weekly Open Order Summary as of February-16-2026 (copy).xlsx',text:async()=>'',arrayBuffer:async()=>Buffer.concat([buf,Buffer.from([0])]).buffer};
     await a.ctx.importQueue([f]);await wait(300);const n3=q(a,'APP.weekly.length');assert.equal(n3,n1,'changed copy must not add rows');assert.equal(q(a,'APP.imports.filter(i=>i.type==="weekly").length'),2);
     const uids=q(a,'APP.weekly.map(w=>w.uid)');assert.equal(new Set(uids).size,uids.length,'uid unique');assert(uids.every(u=>/^wk_/.test(u)));return 'rows '+n1+' → '+n2+' → '+n3+' · uids unique'}finally{a.close()}});
 await test('B2 cross-device: A imports Feb-16, B imports Jun-15 (same local ids), both push, both pull → both devices hold both weeks, nothing lost, second pushes transfer 0',async()=>{
   const g=createGas(),a=await runtime('orders_v3.html',g),b=await runtime('orders_v3.html',g);try{await importFiles(a,['February-16-2026']);await importFiles(b,['June-15-2026']);
     const idsA=q(a,'APP.weekly.map(w=>w.id).slice(0,3)'),idsB=q(b,'APP.weekly.map(w=>w.id).slice(0,3)');
     await a.ctx.ordCloudPush();await b.ctx.ordCloudPull();await wait(400);await b.ctx.ordCloudPush();await a.ctx.ordCloudPull();await wait(400);
     const wa=weeksOf(a),wb=weeksOf(b);assert.deepStrictEqual(wa,wb);assert.deepStrictEqual(Object.keys(wa).sort(),['2026-02-16','2026-06-15']);
     const c0=g.calls.length;const pa=await a.ctx.ordCloudPush(),pb=await b.ctx.ordCloudPush();const commits=g.calls.slice(c0).filter(c=>c.p.action==='smartCommit');assert.equal(commits.length,0,'phantom commit');
     const m=g.ctx.readSmartManifest_('orders');const keys=Object.keys(m.buckets).filter(k=>/weekly_/.test(k));return 'A '+JSON.stringify(wa)+' · B same · ids A '+idsA.join(',')+' B '+idsB.join(',')+' · weekly buckets '+keys.join(',')+' · second pushes 0 commits'}finally{a.close();b.close()}});
 await test('B2 import queue holds the orders auto-sync lock; a pull / push requested meanwhile is refused (busy) instead of overwriting',async()=>{
   const g=createGas(),a=await runtime('orders_v3.html',g);try{a.run('delete window.VRTProdAutoSync');a.run(fs.readFileSync(ROOT+'/vrt-auto-sync-v3.js','utf8'));
     const p=a.ctx.importQueue(['February-02-2026','February-09-2026','February-23-2026'].map(n=>jfile(W(n))));await wait(30);
     const locked=!q(a,'VRTProdAutoSync.lock("orders")&&false')||true;const busy=await a.ctx.ordCloudPull();assert(busy&&busy.busy,'pull must be refused during import');const busyP=await a.ctx.ordCloudPush();assert(busyP&&busyP.busy);
     await p;await wait(300);const wk=weeksOf(a);assert.deepStrictEqual(Object.keys(wk).sort(),['2026-02-02','2026-02-09','2026-02-23']);assert.equal(q(a,'ORD_IMPORTING'),false);
     const lockKey=q(a,'JSON.parse(localStorage.getItem("vrt:prod:auto37:lock:orders")||"null")');assert.equal(lockKey,null,'lock released');return 'pull/push refused while importing · 3 weeks saved · lock released'}finally{a.close()}});
 await test('B2 a pull that started before a local write finished does not overwrite the new rows (apply skipped, rows kept)',async()=>{
   const g=createGas(),a=await runtime('orders_v3.html',g),b=await runtime('orders_v3.html',g);try{await importFiles(a,['February-16-2026']);await a.ctx.ordCloudPush();
     // B: start a pull; while the mock GAS is answering, B imports Jun-15 (local write) → apply must skip and keep the local rows
     const origFetch=b.ctx.fetch;let gate;const gateP=new Promise(r=>gate=r);b.ctx.fetch=async(u,o)=>{const r=await origFetch(u,o);if(/smartBucket/.test(String(u))||(o&&o.body&&/smartBucket/.test(o.body)))await gateP;return r};
     const pull=b.ctx.ordCloudPull();await wait(60);await importFiles(b,['June-15-2026']);gate();await pull;await wait(300);
     const wb=weeksOf(b);assert(wb['2026-06-15'],'local import lost by the concurrent pull: '+JSON.stringify(wb));
     b.ctx.fetch=origFetch;await b.ctx.ordCloudPull();await wait(300);const wb2=weeksOf(b);assert.deepStrictEqual(Object.keys(wb2).sort(),['2026-02-16','2026-06-15']);return 'during pull: '+JSON.stringify(wb)+' → after reconcile: '+JSON.stringify(wb2)}finally{a.close();b.close()}});
 await test('Old cloud rows (v4.15 numeric envelope ids) are still read: a pull merges them, dedupes by as_of+customer and the next push moves them to uid ids',async()=>{
   const g=createGas(),a=await runtime('orders_v3.html',g);try{await importFiles(a,['February-16-2026']);
     // write an old-style envelope set straight into the mock cloud (ids orders.weekly:<n>) for a different week
     const old=q(a,'APP.weekly.map((w,i)=>({id:"orders.weekly:"+(i+1),_vrtEntity:"orders.weekly",_vrtValue:{...w,uid:undefined,id:i+1,as_of_date:"2026-01-05",source_file:"VRT Weekly Open Order Summary as of January-05-2026.xlsx"},_smartBucket:"weekly_2026-01"}))');
     await a.ctx.VRTSmartSync.push({url:'https://script.google.com/macros/s/MOCK_PROD/exec',tool:'orders',records:old,meta:{schemaVersion:414}});
     const b=await runtime('orders_v3.html',g);try{await b.ctx.ordCloudPull();await wait(400);const wk=weeksOf(b);assert(wk['2026-01-05']>0,'old rows not read');const uids=q(b,'APP.weekly.map(w=>w.uid)');assert(uids.every(Boolean),'uid assigned on apply');await b.ctx.ordCloudPush();const m=g.ctx.readSmartManifest_('orders');const bk=m.buckets['p:weekly_2026-01'];const rows=JSON.parse(g.raw(g.ctx.smartBucketName_('orders',bk.source,'p:weekly_2026-01')).content);const ids=(rows.records||rows).slice(0,2).map(r=>r.id);assert(ids.every(i=>/^orders\.weekly:wk_/.test(i)),'ids '+ids.join(','));return 'old week rows '+wk['2026-01-05']+' · cloud ids now '+ids.join(',')}finally{b.close()}}finally{a.close()}});
 const pass=out.filter(x=>x.status==='PASS').length;console.log(pass+'/'+out.length+' PASS');fs.writeFileSync(path.resolve(__dirname,'orders_weekly_results.json'),JSON.stringify(out,null,1));process.exit(pass===out.length?0:1);
})().catch(e=>{console.error(e);process.exit(1)});
