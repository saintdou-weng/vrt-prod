const fs=require('fs'),path=require('path'),assert=require('assert');
const {createGas,digest}=require('./gas_harness'),{createRuntime}=require('../v39/runtime_harness');
const root=path.resolve(__dirname,'../..'),url='https://script.google.com/macros/s/MOCK_PROD/exec',out=[];
async function test(name,fn){try{const detail=await fn();out.push({name,status:'PASS',detail});console.log('PASS',name)}catch(e){out.push({name,status:'FAIL',detail:e.stack});console.log('FAIL',name,e.message)}}
function client(gas,page='vrt_final_qc_v1.html',load=false){const r=createRuntime(path.join(root,page));r.ctx.fetch=gas.fetch;if(load)r.load();r.run(fs.readFileSync(root+'/vrt-smart-sync-v3.js','utf8'));return r}
const source=n=>{const b=fs.readFileSync(root+'/release_sources/'+n);return{name:n,size:b.length,lastModified:0,arrayBuffer:async()=>b}};
function prepare(gas,tool,rows,{uploadId='u'+Math.random().toString(36).slice(2),baseRevision,hash,meta={},bucket='m:2026-09'}={}){
  const wire=JSON.stringify(rows);hash??=digest(wire);baseRevision??=gas.get({action:'smartManifest',tool}).data.revision;
  const staged=gas.post({action:'smartBucket',tool,uploadId,bucket,hash,contentHash:digest(wire),count:rows.length,records:rows});assert(staged.ok,staged.error);
  return{action:'smartCommit',tool,uploadId,baseRevision,hashes:{[bucket]:hash},counts:{[bucket]:rows.length},contentHashes:{[bucket]:digest(wire)},recordCount:rows.length,deleted:[],meta};
}
function commit(gas,tool,rows,opt){const p=prepare(gas,tool,rows,opt),res=gas.post(p);assert(res.ok,res.error);return{p,res}}
const count=(gas,from,action,method)=>gas.calls.slice(from).filter(c=>c.p.action===action&&(!method||c.method===method)).length;
(async()=>{
await test('QC attachment → real frontend → actual GS → second device, no repeat transfers',async()=>{
  const g=createGas(),a=client(g,undefined,true),b=client(g,undefined,true);try{
    await Promise.all([a.ctx.VRT_LOCAL_READY,b.ctx.VRT_LOCAL_READY]);await a.ctx.QC.importFiles([source('Final_QC_20260917.xlsx')]);await a.ctx.QC.commit();
    a.ctx.VRTPlatform.setGasUrl(url);b.ctx.VRTPlatform.setGasUrl(url);
    const data=a.ctx.QC.getState(),rows=data.records.concat(data.sources.map(s=>({id:s.id,_vrtEntity:'qc.source',_vrtValue:s})));
    const p=await a.ctx.QC.sync('push');assert(p.ok);assert.deepEqual(p.warnings,[]);
    const snap=JSON.parse(g.props.get('snap_qc'));assert.equal(snap.recordCount,13);assert.equal(snap.summary.latest.inspected,4708);assert.equal(snap.summary.latest.rejected,199);assert.equal(snap.summary.latest.output,4509);assert.equal(snap.summary.latestDate,'2026-09-17');assert.equal(snap.summary.latest.activeLines,11);
    const pulled=await b.ctx.QC.sync('pull');assert(pulled.ok);const copied=b.ctx.QC.getState();assert.equal(copied.records.length,13);assert.deepEqual(copied.sources,data.sources);
    const start=g.calls.length;await a.ctx.QC.sync('push');const again=await b.ctx.QC.sync('pull');await b.ctx.QC.sync('push');
    assert.equal(again.downloaded,0);assert.equal(count(g,start,'smartBucket'),0);assert.equal(count(g,start,'smartCommit'),0);assert(g.calls.slice(start).every(c=>c.response.data.metaUnchanged));
    assert(g.ctx.qcSummaryTxt_().includes('4,708'));assert(g.sheets.get('同步狀態').rows.some(r=>r[0]==='Final QC'&&r[2]===13));
    return '13 reports; latest day 4708 / 199 / 4509, 11 active lines; second device intact; unchanged Push/Pull send zero buckets/commits';
  }finally{a.close();b.close()}
});
await test('Large unchanged metadata omitted from response and recovered from persistent IDB',async()=>{
  const g=createGas(),r=client(g);try{const meta={settings:{language:'zh'},eff:Array.from({length:300},(_,i)=>({id:i,smv:i/10}))},rows=[{id:'s1',date:'2026-09-01',qty:3}];await r.ctx.VRTSmartSync.push({url,tool:'sewing',records:rows,meta});
    await r.ctx.VRTSmartSync.pull({url,tool:'sewing',localRecords:rows,meta});const start=g.calls.length;r.ctx.VRTSmartSync=null;r.run(fs.readFileSync(root+'/vrt-smart-sync-v3.js','utf8'));
    const again=await r.ctx.VRTSmartSync.pull({url,tool:'sewing',localRecords:rows,meta});const response=g.calls[start].response.data;assert.equal(response.metaUnchanged,true);assert(!('meta'in response));assert.equal(again.meta.eff.length,300);assert(JSON.stringify(response).length<1800);
    return '300-entry side table restored from IDB after script reload; unchanged manifest response < 1800 bytes';
  }finally{r.close()}
});
await test('IE/OBD and official SMV use one cloud domain and retain approval separation',async()=>{
  const g=createGas(),a=client(g,'ie_smv_report_v2_1.html',true),b=client(g,'smv_manager_v5_final.html',true);try{
    const app=a.ctx.VRT_IE_SMV_APP;await app.ready;const weekly=await app.parseFile(source('IE_Weekly_20260919.xlsx')),obd=await app.parseFile(source('OBD_A2642K_pending.xls'));await app.importCandidates([...weekly,...obd]);
    await a.ctx.VRTDomain39.write('VRT_SMV_Manager_v52',{smv_snapshots:{rows:[{id:100,style:'OLD',testDate:'2026-08-01',smv:10,approval:'approved'}]}});
    const first=await a.ctx.VRTDomain39.readDomain('smv');assert((await a.ctx.VRTDomain39.sync('smv','push',url)).ok);
    assert((await b.ctx.VRTDomain39.sync('smv','pull',url)).ok);const copied=await b.ctx.VRTDomain39.readDomain('smv');assert.equal(copied.snaps.length,1);assert.equal(copied.ie.updates.length,first.ie.updates.length);assert.equal(copied.ie.operations.length,24);assert(copied.ie.styles.some(s=>s.approval==='pending'));
    const start=g.calls.length;await b.ctx.VRTDomain39.sync('smv','pull',url);assert.equal(count(g,start,'smartBucket'),0);assert(!g.files.some(f=>f.name.startsWith('smart_ie_smv')));
    return '60 weekly updates + 24 pending operations + existing official snapshot retained under smart_smv; no second master or repeat download';
  }finally{a.close();b.close()}
});
await test('Old nested spareparts payload migrates completely once without empty import display',async()=>{
  const g=createGas(),r=client(g,'vrt_spare_parts_v2.html',true);try{await r.ctx.VRT_LOCAL_READY;
    const payload={action:'push',tool:'spareparts',data:{parts:[{id:'p1',partNo:'NEEDLE',description:'Needle'},{id:'p2',partNo:'BLADE',description:'Blade'}],txns:[{id:'t1',date:'2026-09-01',partNo:'NEEDLE',qty:2,total:5}],versions:[{id:'v1',name:'Original'}],maintenance39:{needleChanges:[{id:'n1',date:'2026-09-01',qty:2}]}}};assert(g.post(payload).ok);
    const m=g.get({action:'smartManifest',tool:'spareparts'});assert(m.ok);assert(m.data.legacy);assert(!('data'in m.data.legacyMeta));assert(JSON.stringify(m).length<2000);
    const pulled=await r.ctx.VRTDomain39.sync('spareparts','pull',url);assert(pulled.migrated,JSON.stringify(pulled));const state=await r.ctx.VRTDomain39.readDomain('spareparts');assert.equal(state.parts.length,2);assert.equal(state.txns.length,1);assert.equal(state.versions.length,1);assert.equal(state.maintenance.needleChanges.length,1);
    await r.ctx.loadAll();assert.equal(r.ctx.VRTParts39.getState().txns.length,1);const start=g.calls.length;await r.ctx.VRTDomain39.sync('spareparts','pull',url);assert.equal(count(g,start,'pull'),0);assert.equal(count(g,start,'smartBucket'),0);
    return '2 parts, 1 purchase, 1 version and needle change retain IDs; legacy download only once and page reload contains purchases';
  }finally{r.close()}
});
await test('Legacy duplicate records may migrate to deduplicated baseline without endless redownload',async()=>{
  const g=createGas(),r=client(g);try{const rows=[{id:'a',date:'2026-09-01',qty:2},{id:'a',date:'2026-09-01',qty:2}];assert(g.post({tool:'shipping',records:rows,recordCount:2}).ok);let local=[];
    const p=await r.ctx.VRTSmartSync.pull({url,tool:'shipping',localRecords:[],apply:async x=>{local=x}});assert(p.migrated);assert.equal(local.length,1);const start=g.calls.length;await r.ctx.VRTSmartSync.pull({url,tool:'shipping',localRecords:local});assert.equal(count(g,start,'pull'),0);assert.equal(count(g,start,'smartBucket'),0);
    return 'complete legacy count 2 verified before dedup to 1; migration committed once';
  }finally{r.close()}
});
await test('Stale concurrent commit rejected; other staged uploads and current data retained',async()=>{
  const g=createGas();commit(g,'orders',[{id:'a',qty:1}]);const rev=g.get({action:'smartManifest',tool:'orders'}).data.revision;
  const a=prepare(g,'orders',[{id:'a',qty:2}],{baseRevision:rev,uploadId:'alice'}),b=prepare(g,'orders',[{id:'a',qty:3}],{baseRevision:rev,uploadId:'bob'});assert(g.post(a).ok);const failed=g.post(b);assert(!failed.ok);assert(failed.error.includes('SYNC_CONFLICT'));assert.equal(g.ctx.loadToolPayload('orders').records[0].qty,2);assert(g.raw('smart_orders_bob_m_2026-09.json'));assert(!g.events.some(e=>e.op==='trash'));assert(!g.locked);
  return 'Alice commits; Bob receives SYNC_CONFLICT; committed and staged files preserved, lock released';
});
await test('Reusing a committed upload ID cannot mutate published data before a new commit',async()=>{
  const g=createGas();const {p}=commit(g,'orders',[{id:'a',qty:1}]);const rows=[{id:'a',qty:99}],raw=JSON.stringify(rows);
  const r=g.post({action:'smartBucket',tool:'orders',uploadId:p.uploadId,bucket:'m:2026-09',hash:digest(raw),contentHash:digest(raw),count:1,records:rows});assert(!r.ok);assert.equal(g.ctx.loadToolPayload('orders').records[0].qty,1);return 'same upload ID + different bytes rejected; committed row stays 1';
});
await test('Missing staged data, incorrect checksums/counts and old protocol cannot replace manifest',async()=>{
  const g=createGas();commit(g,'orders',[{id:'a',qty:1}]);const initial=g.raw('smart_orders_manifest.json').content,p=prepare(g,'orders',[{id:'a',qty:2}]);
  for(const corrupt of [{...p,recordCount:2},{...p,counts:{'m:2026-09':2},recordCount:2},{...p,contentHashes:{'m:2026-09':'bad'}},{...p,uploadId:'missing'}]){assert(!g.post(corrupt).ok);assert.equal(g.raw('smart_orders_manifest.json').content,initial)}const old={...p};delete old.baseRevision;assert(!g.post(old).ok);assert.equal(g.raw('smart_orders_manifest.json').content,initial);
  assert(!g.post({action:'smartBucket',tool:'orders',uploadId:'bad',bucket:'x',hash:'x',count:3,records:[]}).ok);assert(!g.locked);return 'all malformed or pre-v4.1 commits rejected before pointer change';
});
await test('Shrink requires explicit deletion and announced removed buckets',async()=>{
  const g=createGas();commit(g,'orders',[{id:'a'},{id:'b'}]);const p=prepare(g,'orders',[{id:'a'}]);assert(!g.post(p).ok);assert(g.post({...p,allowShrink:true}).ok);
  const empty={action:'smartCommit',tool:'orders',uploadId:'empty',baseRevision:g.get({action:'smartManifest',tool:'orders'}).data.revision,hashes:{},counts:{},recordCount:0,meta:{},allowShrink:true};assert(!g.post(empty).ok);assert(g.post({...empty,deleted:['m:2026-09']}).ok);assert.equal(g.ctx.loadToolPayload('orders').records.length,0);
  return '2→1 blocked until allowShrink; 1→0 also requires explicit deleted bucket list';
});
await test('Pull cannot apply a different revision or corrupted cloud content with the same row count',async()=>{
  const g=createGas(),r=client(g);try{commit(g,'shipping',[{id:'a',qty:1}]);const old=g.get({action:'smartManifest',tool:'shipping'}).data;commit(g,'shipping',[{id:'a',qty:2}]);assert(!g.get({action:'smartBucket',tool:'shipping',bucket:'m:2026-09',hash:old.hashes['m:2026-09']}).ok);
    const m=g.ctx.readSmartManifest_('shipping'),b=m.buckets['m:2026-09'];g.raw(g.ctx.smartBucketName_('shipping',b.source,'m:2026-09')).setContent(JSON.stringify([{id:'a',qty:999}]));let applied=false;
    await assert.rejects(()=>r.ctx.VRTSmartSync.pull({url,tool:'shipping',localRecords:[],apply:()=>{applied=true}}),/content mismatch/);assert(!applied);return 'stale hash and same-count corruption rejected, local apply never called';
  }finally{r.close()}
});
await test('Legacy changed during migration conflicts, corrupt manifest never treated as empty cloud',async()=>{
  const g=createGas();g.post({tool:'orders',records:[{id:'a'}]});const p=prepare(g,'orders',[{id:'a'}]);g.post({tool:'orders',records:[{id:'a'},{id:'b'}]});assert(!g.post(p).ok);assert(!g.raw('smart_orders_manifest.json'));
  g.file('smart_shipping_manifest.json','{broken');const bad=g.get({action:'smartManifest',tool:'shipping'});assert(!bad.ok);return 'legacy file revision checked at commit; malformed pointer produces an error, not fresh empty state';
});
await test('Current summaries use Smart Sync, explicit QC status, no setup or automatic notifications',async()=>{
  const g=createGas();g.file('orders.json',JSON.stringify({tool:'orders',records:[{id:'stale'}]}));commit(g,'orders',[{id:'current'}]);assert.equal(g.ctx.loadToolPayload('orders').records[0].id,'current');
  g.file('bom2_meta.json',JSON.stringify({chunks:1,savedAt:'2020-01-01'}));g.file('bom2_chunk_0.json',JSON.stringify([{status:'ready'},{status:'ready'}]));commit(g,'bom',[{id:'new',status:'pending'}]);assert(g.ctx.bomTxt().includes('共 1 份 BOM'));
  assert('qc'in g.get({action:'status'}).data);assert.equal(g.get({action:'capabilities'}).data.backendVersion,'4.2.0');assert.equal(g.get({action:'auditStatus'}).data.disabled,true);assert.equal(g.ctx.maybeProdPendingReminder_(),false);
  const start=g.events.length,info=g.ctx.checkProductionV41();assert.equal(info.driveAccessible,true);assert.equal(info.automaticProdReminders,false);assert(!g.events.slice(start).some(e=>/create|write|property|forbidden/.test(e.op)));assert(!g.events.some(e=>e.op==='forbidden-network'));assert.equal(typeof g.ctx.initPlatformV2,'undefined');assert.equal(typeof g.ctx.setupPolling,'undefined');return 'QC status present; BOM/current summaries ignore legacy snapshots; optional check is read-only; zero Telegram calls or trigger creation';
});
await test('Busy lock and post-commit Sheets failure report correct outcome without destroying data',async()=>{
  const g=createGas(),r=client(g);try{const p=prepare(g,'orders',[{id:'a'}]);g.setBusy(true);assert(!g.post(p).ok);assert(!g.raw('smart_orders_manifest.json'));g.setBusy(false);
    g.ctx.updateSummarySheet=()=>{throw Error('Mock Sheets unavailable')};const res=await r.ctx.VRTSmartSync.push({url,tool:'shipping',records:[{id:'s',date:'2026-09-01'}],meta:{}});assert(res.ok);assert.equal(res.warnings.length,1);assert(g.raw('smart_shipping_manifest.json'));assert(!g.locked);return 'busy commit rejected safely; completed Drive save returns visible Sheets warning and retains cloud data';
  }finally{r.close()}
});
await test('Existing v3 QC cloud summary upgrades without uploading unchanged report buckets',async()=>{
  const g=createGas(),r=client(g);try{const rows=[{id:'old-qc',date:'2026-09-17',line:'1',inspected:50,rejected:3,output:47,attendanceMinutes:100,producedMinutes:40}],buckets=await r.ctx.VRTSmartSync.buildBuckets(rows),b=buckets['m:2026-09'];
    g.file('smart_qc_original_m_2026-09.json',JSON.stringify(rows));g.file('smart_qc_manifest.json',JSON.stringify({version:3,updatedAt:'2026-09-20T00:00:00Z',recordCount:1,buckets:{'m:2026-09':{hash:b.hash,count:1,source:'original'}},meta:{schemaVersion:40},summary:{}}));
    const start=g.calls.length,p=await r.ctx.VRTSmartSync.push({url,tool:'qc',records:rows,meta:{schemaVersion:40}});assert(p.ok);assert.equal(p.uploaded,0);assert.equal(count(g,start,'smartBucket','POST'),0);assert.equal(count(g,start,'smartCommit'),1);assert.equal(JSON.parse(g.props.get('snap_qc')).summary.latest.output,47);assert.equal(g.ctx.readSmartManifest_('qc').buckets['m:2026-09'].source,'original');return 'old updatedAt revision accepted; server QC summary refreshed once; original bucket pointer retained and zero bucket uploads';
  }finally{r.close()}
});
await test('Automatic offline/reconnect and reopen use actual QC callbacks and GS without duplicate transfers',async()=>{
  const g=createGas(),a=client(g,undefined,true),b=client(g,undefined,true);try{
    for(const r of [a,b]){await r.ctx.VRT_LOCAL_READY;r.ctx.VRTPlatform.setGasUrl(url);r.ctx.VRTProdAutoSync=null;r.run(fs.readFileSync(root+'/vrt-auto-sync-v3.js','utf8'));r.ctx.VRTProdAutoSync.install({key:'qc',watch:false,canSync:()=>true,pull:()=>r.ctx.QC.sync('pull'),push:()=>r.ctx.QC.sync('push')})}
    await a.ctx.QC.importFiles([source('Final_QC_20260917.xlsx')]);await a.ctx.QC.commit();assert(a.ctx.VRTProdAutoSync.pending('qc'));assert.equal(await a.ctx.VRTProdAutoSync.run('qc','save'),false);assert.equal(g.calls.length,0);
    a.ctx.navigator.onLine=true;assert(await a.ctx.VRTProdAutoSync.run('qc','network-restored'));assert(!a.ctx.VRTProdAutoSync.pending('qc'));b.ctx.navigator.onLine=true;assert(await b.ctx.VRTProdAutoSync.run('qc','startup-reconcile'));assert.equal(b.ctx.QC.getState().records.length,13);
    const start=g.calls.length;assert(await b.ctx.VRTProdAutoSync.run('qc','pageshow'));assert.equal(count(g,start,'smartBucket'),0);assert.equal(count(g,start,'smartCommit'),0);assert(!b.ctx.localStorage.getItem('vrt:prod:auto37:lock:qc'));return 'offline edits persist; automatic reconnect pushes, fresh device pulls 13 reports, unchanged resume checks manifest only and releases lease';
  }finally{a.close();b.close()}
});
await test('Checksum fallback clients can read verified server data without Web Crypto',async()=>{
  const g=createGas(),r=client(g);try{commit(g,'shipping',[{id:'a',date:'2026-09-01',qty:2}]);r.ctx.crypto=null;const p=await r.ctx.VRTSmartSync.pull({url,tool:'shipping',localRecords:[]});assert(p.ok);assert.equal(p.records[0].qty,2);return 'server verifies stored SHA; browser fallback checksum verifies received bytes';}finally{r.close()}
});
fs.writeFileSync(path.join(__dirname,'gas_integration_results.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({pass:out.filter(t=>t.status==='PASS').length,fail:out.filter(t=>t.status==='FAIL').length}));if(out.some(t=>t.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
