/* (headless Chromium crashes when an OPFS handle is read back from IndexedDB, so the handle is passed to scanFolders({dirs}) directly;
   with a real picked folder the page keeps it in IndexedDB store "dirs".)
   v4.20.1 — 📁 掃描資料夾 in ⇧ 智慧匯入 (Paul 11/03: "直接到下載資料夾把已捉好的跟生產相關的檔案匯入及更新…符合及尚未匯入的就直接進").
   The folder is a real FileSystemDirectoryHandle (the browser's private file system stands in for the picked Downloads folder; the
   scan code is the same). GAS v4.9.1 in memory. Files are copies of release_sources reports under the names they arrive with. */
const fs=require('fs'),path=require('path'),assert=require('assert');const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'../..');const {createGas}=require(ROOT+'/qa/v41/gas_harness');const BASE=process.env.VRT_BASE_URL||'http://127.0.0.1:8765/';
const out=[];async function test(name,fn){try{out.push({name,status:'PASS',detail:await fn()});console.log('PASS',name,'·',out.at(-1).detail)}catch(e){out.push({name,status:'FAIL',detail:String(e&&e.stack||e)});console.log('FAIL',name,'·',e.message)}}
const b64=f=>fs.readFileSync(path.join(ROOT,'release_sources',f)).toString('base64');
const FILES=[['Final Qc Inspection Report by Line as of 31-October - 2026.xlsx',b64('Final_QC_20260922.xlsx')],['VRT_Daily_Needles_1-29 Oct2026_REVISED.xlsx',b64('Needle_Change_202609.xlsx')],['sub/VRT_Daily_Spare_Part_1-29 Oct2026_REVISED.xlsx',b64('Parts_Change_202609.xlsx')],['VRT_NSSF_Contribution_Adjustment.docx',Buffer.from('not a report').toString('base64')],['_to_delete/Final Qc Inspection Report old copy.xlsx',b64('Final_QC_20260917.xlsx')]];
(async()=>{const g=createGas();const b=await chromium.launch({executablePath:process.env.VRT_CHROMIUM||'/opt/pw-browsers/chromium'});const ctx=await b.newContext({viewport:{width:1400,height:900}});
  await ctx.route('https://script.google.com/**',async route=>{const req=route.request();const r=await g.fetch(req.url(),{method:req.method(),body:req.postData()||undefined});await route.fulfill({status:200,contentType:'application/json',body:await r.text()})});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+'portal_v2.html');await p.evaluate(()=>VRTPlatform.setGasUrl('https://script.google.com/macros/s/MOCK_PROD/exec'));await p.reload();await p.waitForFunction(()=>window.VRTSmartImport&&VRTSmartImport.scanFolders);
  const write=list=>p.evaluate(async list=>{const root=await navigator.storage.getDirectory();const dl=await root.getDirectoryHandle('Downloads',{create:true});
    for(const [name,data] of list){const parts=name.split('/');let d=dl;for(const sub of parts.slice(0,-1))d=await d.getDirectoryHandle(sub,{create:true});const fh=await d.getFileHandle(parts.at(-1),{create:true});const w=await fh.createWritable();await w.write(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));await w.close()}
},list);
  await test('first scan: report files anywhere under the folder (sub-folders too, _to_delete skipped) are found and routed by name; an unrelated .docx is ignored',async()=>{
    await write(FILES);await p.evaluate(()=>VRTSmartImport.open());const r=await p.evaluate(async o=>{const root=await navigator.storage.getDirectory();const dl=await root.getDirectoryHandle('Downloads');return VRTSmartImport.scanFolders(Object.assign({dirs:[{name:'Downloads',handle:dl}]},o))},{manual:true});
    const rows=await p.evaluate(()=>VRTSmartImport.rows.map(x=>[x.name,x.module,x.status]));assert.equal(r.found,3,JSON.stringify(rows));
    assert.deepEqual(rows.map(x=>x[1]).sort(),['qc','spareparts','spareparts']);assert(!rows.some(x=>/NSSF|old copy/.test(x[0])));
    const bar=await p.$eval('#vrtSiDirs',e=>e.textContent);assert(/加資料夾/.test(bar),bar);return rows.map(x=>x[1]+' ← '+x[0]).join(' · ')});
  await test('開始匯入 → the files go to their modules; the next scan finds 0 new ("已匯入過"), and reads nothing again (name/size/date cache)',async()=>{
    await p.evaluate(()=>{VRTSmartImport.rows.forEach(r=>r.include=true)});await p.evaluate(async()=>{const b=[...document.querySelectorAll('#vrtSiGo')][0];b.disabled=false;b.click()});await p.waitForTimeout(2500);
    await p.goto(BASE+'portal_v2.html');await p.waitForFunction(()=>window.VRTSmartImport&&VRTSmartImport.scanFolders);
    const r=await p.evaluate(async o=>{const root=await navigator.storage.getDirectory();const dl=await root.getDirectoryHandle('Downloads');return VRTSmartImport.scanFolders(Object.assign({dirs:[{name:'Downloads',handle:dl}]},o))},{manual:true});assert.equal(r.found,0,JSON.stringify(r));assert(r.seen>=3,'seen '+r.seen);
    const r2=await p.evaluate(async o=>{const root=await navigator.storage.getDirectory();const dl=await root.getDirectoryHandle('Downloads');return VRTSmartImport.scanFolders(Object.assign({dirs:[{name:'Downloads',handle:dl}]},o))},{manual:true});assert.equal(r2.found,0);return 'scan 2: new 0 · imported before '+r.seen+' · scan 3 from cache: '+r2.seen});
  await test('「開頁時自動掃描並匯入」: a new report dropped into the folder is handed to its module by itself when a page opens — no click, no page change',async()=>{
    await p.evaluate(()=>localStorage.setItem('vrt_si_scan_auto','1'));
    await write([['Final Qc Inspection Report by Line as of 01-November - 2026.xlsx',b64('Final_QC_20260919.xlsx')]]);
    const before=await p.evaluate(async()=>(await VRTSmartImport.pending()).length);
    await p.goto(BASE+'portal_v2.html');await p.waitForFunction(()=>window.VRTSmartImport&&VRTSmartImport.scanFolders);const ra=await p.evaluate(async o=>{const root=await navigator.storage.getDirectory();const dl=await root.getDirectoryHandle('Downloads');return VRTSmartImport.scanFolders(Object.assign({dirs:[{name:'Downloads',handle:dl}]},o))},{auto:true});await p.waitForTimeout(1500);
    const st=await p.evaluate(async()=>({pend:(await VRTSmartImport.pending()).map(h=>[h.module,h.name]),url:location.pathname,chip:(document.getElementById('vrtSiChip')||{}).textContent||''}));
    const add=st.pend.length-before;assert.equal(add,1,JSON.stringify(st));assert(/portal_v2/.test(st.url),'navigated away');assert(/資料夾自動匯入/.test(st.chip),st.chip);
    return 'queued: '+st.pend.filter(x=>/November/.test(x[1])).map(x=>x[0]+' ← '+x[1]).join('')+' · chip "'+st.chip.replace(/\s+/g,' ').slice(0,60)+'"'});
  await test('the queued file is imported when that module is opened (QC page receives it from the handoff)',async()=>{
    await p.goto(BASE+'vrt_final_qc_v1.html#smartimport');await p.waitForTimeout(9000);const left=await p.evaluate(async()=>(await VRTSmartImport.pending()).filter(h=>h.module==='qc').length);assert.equal(left,0,'still queued '+left);return 'qc queue emptied by the page'});
  await test('no page errors',async()=>{const e=errs.filter(x=>!/ResizeObserver/.test(x));if(e.length)throw new Error(e.slice(0,3).join(' | '));return '0'});
  await b.close();const pass=out.filter(x=>x.status==='PASS').length;console.log(`\n${pass}/${out.length} passed`);fs.writeFileSync(path.join(__dirname,'folder_scan_results.json'),JSON.stringify({at:new Date().toISOString(),pass,total:out.length,results:out},null,1));process.exit(pass===out.length?0:1)})();
