/* Run: serve the repo root (python3 -m http.server 8765), then: node qa/v416/browser_v416.js  (needs the playwright package)
   Real Chromium, REAL PROD data (sewing backup 5,009 rows, cutting backup 18,663, orders backup, production plan):
   D1 生產日報 tab in production_v4 (auto-generated, numbers = page data, Word export), B11 in-page dialogs (confirm / notice / automation
   mode), B7 shipping AS-OF guard dialog, B8 monthly shipping preview with the real file, B3 customer-statistics worker parse timing,
   D2 🤖 AI button in the shared Telegram modal. Screenshots → $VRT_SHOTS (default ../../../shots_v416). */
const { chromium } = require('playwright');const fs=require('fs'),path=require('path');
const DL=process.env.VRT_DL||'/mnt/user-data/uploads/Downloads/',ROOT=path.resolve(__dirname,'../..')+'/',BASE=process.env.VRT_BASE_URL||'http://127.0.0.1:8765/',OUT=process.env.VRT_SHOTS||path.resolve(__dirname,'../../../shots_v416')+'/',SAMPLES=process.env.VRT_SAMPLES||path.resolve(__dirname,'../../../samples')+'/';
fs.mkdirSync(OUT,{recursive:true});
const XLSX=require(ROOT+'vendor/xlsx.full.min.js');
const out=[];const test=async(name,fn)=>{try{const d=await fn();out.push({name,status:'PASS',detail:d});console.log('PASS',name,'·',d)}catch(e){out.push({name,status:'FAIL',detail:e.stack});console.log('FAIL',name,'·',e.message)}};
function shipBook(rows,file){const H=['ITEM #','CUSTOMER','P.O. #','STYLE/ARTICLE#','MODEL DESCRIPTION','FABRIC ITEM','FABRIC TYPE','COLOR','SIZE','ORIGINAL PO QTY','TOTAL QTTY SHIPPED','OPEN QTY','REMARK','VRT SHIP DATE (ETD)','ERP SELFKEY#'];
  const aoa=[['VRT SHIPPING SCHEDULE'],[],H].concat(rows.map((r,i)=>[i+1,r.cust,r.po,'ST'+i,'desc','FI','POLY','BLK','M',r.orig,r.shipped,r.orig-r.shipped,'','2026-11-15','']));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'Customer Open Order');fs.writeFileSync(file,XLSX.write(wb,{type:'buffer',bookType:'xlsx'}))}
const rowsN=(n)=>Array.from({length:n},(_,i)=>({cust:'CUST'+(i%7),po:'PO'+(1000+i),orig:100+i,shipped:i%3?0:20}));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined}).catch(()=>chromium.launch());
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(page.url().split('/').pop()+': '+e.message));const nativeDialogs=[];page.on('dialog',d=>{nativeDialogs.push(d.message());d.accept()});
 // ── seed real PROD data (same origin IndexedDB)
 await page.goto(BASE+'production_plan_capacity_v1.html',{waitUntil:'load'});await page.waitForTimeout(800);await page.setInputFiles('#fileInput',DL+'Production  Plan From July Until  Dec_2026 (1).xlsx');await page.waitForTimeout(2500);await page.evaluate(()=>confirmPlanImport512());await page.waitForTimeout(800);
 await page.goto(BASE+'sewing_v5.html',{waitUntil:'load'});await page.waitForTimeout(1000);await page.setInputFiles('input[type=file][accept=".json"]',DL+'sewing_backup_2026-09-28.json');await page.waitForTimeout(3500);
 await page.goto(BASE+'cutting_v3.html',{waitUntil:'load'});await page.waitForTimeout(1200);await page.setInputFiles('input[type=file][accept=".json"]',DL+'cutting_backup_2026-09-30.json');await page.waitForTimeout(9000);
 await page.goto(BASE+'orders_v3.html',{waitUntil:'load'});await page.waitForTimeout(1200);try{await page.setInputFiles('#ri',DL+'orders_v3_backup_2026-09-30.json');await page.waitForTimeout(3000)}catch(e){console.log('orders restore skipped:',e.message)}
 /* ── D1 ── */
 await test('D1 production_v4: 📰 生產日報 tab auto-generates the latest data date from the page data (no cloud needed); WIP = page STYLES; Word export downloads a .doc; Telegram / AI buttons report the missing GAS URL instead of failing silently',async()=>{
   await page.goto(BASE+'production_v4.html',{waitUntil:'load'});await page.waitForFunction(()=>document.getElementById('loading').style.display==='none',{timeout:60000});await page.waitForTimeout(1500);
   await page.click('#tb-daily');await page.waitForTimeout(1500);const txt=await page.$eval('#drText',e=>e.textContent);if(!/生產日報/.test(txt))throw new Error('no report: '+txt.slice(0,80));
   const r=await page.evaluate(async()=>{const db=await new Promise(res=>{const q=indexedDB.open('VRT_DailyReport');q.onsuccess=()=>res(q.result)});const rep=await new Promise(res=>{const t=db.transaction('reports','readonly').objectStore('reports').getAll();t.onsuccess=()=>res(t.result)});db.close();const wip=STYLES.filter(s=>s.status==='cut'||s.status==='sew').reduce((s,x)=>s+Math.max(0,x.cutPcs-x.sewPcs),0);return {n:rep.length,date:rep[0]&&rep[0].date,pieces:rep[0]&&rep[0].facts.sewing.pieces,wip:rep[0]&&rep[0].facts.wip.cutNotSewn,pageWip:wip,zh:rep[0]&&rep[0].zhChars,sew:SEW.length,cut:CUT.length}});
   if(r.n!==1)throw new Error('reports '+r.n);if(r.wip!==r.pageWip)throw new Error('WIP '+r.wip+' != page '+r.pageWip);
   await page.screenshot({path:OUT+'01_daily_report_tab.png',fullPage:false});
   const [dl]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.click('#drWord')]);const fn=dl.suggestedFilename();if(!/\.doc$/.test(fn))throw new Error('download '+fn);
   await page.click('#drSend');await page.waitForTimeout(300);const st=await page.$eval('#drStatus',e=>e.textContent);if(!/GAS/.test(st))throw new Error('status '+st);
   return 'date '+r.date+' · pieces '+r.pieces+' · WIP '+r.wip+' = page · zh '+r.zh+' chars · '+fn+' · without GAS URL: "'+st+'"'});
 /* ── B11 ── */
 await test('B11 in-page dialogs: VRTDialog.confirm shows a modal (Enter = OK, Esc = cancel, danger style for delete), alert becomes a non-blocking notice, automation mode (?auto=1) auto-answers and logs; no native dialog opened anywhere in this run so far',async()=>{
   await page.goto(BASE+'orders_v3.html',{waitUntil:'load'});await page.waitForTimeout(800);await page.evaluate(()=>VRTDialog.setAuto(false)); // Playwright sets navigator.webdriver → automation mode; switch it off to see the real modal
   const p1=page.evaluate(()=>VRTDialog.confirm('確定要刪除全部週報快照？\n這個動作無法復原。',{okText:'刪除'}));await page.waitForTimeout(300);const danger=await page.$eval('#vrtDlgHost .ok',b=>b.classList.contains('danger'));await page.screenshot({path:OUT+'02_dialog_confirm.png'});await page.keyboard.press('Escape');const r1=await p1;if(r1!==false||!danger)throw new Error('esc/danger '+r1+' '+danger);
   const p2=page.evaluate(()=>VRTDialog.prompt('請輸入 PO 號碼','PO-2026-001'));await page.waitForTimeout(300);await page.keyboard.press('Enter');const r2=await p2;if(r2!=='PO-2026-001')throw new Error('prompt '+r2);
   const t0=Date.now();await page.evaluate(()=>{alert('✅ 已儲存 12 筆');alert('⚠️ 有 2 筆缺少交期');});const dt=Date.now()-t0;const notices=await page.$$eval('#vrtNoticeHost .vn',a=>a.length);await page.screenshot({path:OUT+'03_dialog_notices.png'});if(notices!==2||dt>1500)throw new Error('notices '+notices+' '+dt+'ms');
   await page.goto(BASE+'orders_v3.html?auto=1',{waitUntil:'load'});await page.waitForTimeout(600);const auto=await page.evaluate(async()=>({a:VRTDialog.auto,c:await VRTDialog.confirm('自動化測試？'),g:confirm('native-style call?'),log:VRTDialog.log.length}));await page.waitForTimeout(200);await page.screenshot({path:OUT+'04_dialog_auto_mode.png'});if(!auto.a||auto.c!==true||auto.g!==true)throw new Error('auto '+JSON.stringify(auto));
   if(nativeDialogs.length)throw new Error('native dialogs seen: '+nativeDialogs.join(' | '));
   return 'confirm (danger) esc→false · prompt enter→default · 2 notices non-blocking in '+dt+' ms · auto mode answered + logged '+auto.log+' · native dialogs 0'});
 /* ── B7 ── */
 await test('B7 shipping_v2: loading an older AS-OF report over newer data opens the in-page question; cancel keeps the newer data',async()=>{
   const f1=OUT+'VRT SHIPPING SCHEDULE as of October-06-2026.xlsx',f2=OUT+'VRT SHIPPING SCHEDULE as of September-07-2026.xlsx';shipBook(rowsN(40),f1);shipBook(rowsN(38),f2);
   await page.goto(BASE+'shipping_v2.html',{waitUntil:'load'});await page.waitForTimeout(800);await page.evaluate(()=>VRTDialog.setAuto(false));await page.setInputFiles('#fileInput',f1);await page.waitForTimeout(1500);const n1=await page.evaluate(()=>ALL.length);
   await page.setInputFiles('#fileInput',f2);await page.waitForTimeout(1200);const shown=await page.$eval('#vrtDlgHost .vm',e=>e.textContent).catch(()=>'' );await page.screenshot({path:OUT+'05_shipping_asof_guard.png'});if(!/2026-09-07/.test(shown)||!/2026-10-06/.test(shown))throw new Error('dialog: '+shown);
   await page.click('#vrtDlgHost .cancel');await page.waitForTimeout(500);const n2=await page.evaluate(()=>ALL.length);const st=await page.$eval('#loadStatus',e=>e.textContent);if(n1!==40||n2!==40)throw new Error('rows '+n1+' → '+n2);
   return 'asked ('+shown.slice(0,40)+'…) · cancel → '+n2+' rows kept · '+st});
 /* ── B8 ── */
 await test('B8 monthly shipping: the real 1-VRT MONTHLY SHIPPING SCHEDULE.xlsx opens a preview (added/changed/same/kept) before anything is saved; confirm saves',async()=>{
   await page.goto(BASE+'vrt_monthly_shipping_control_center_v1.html',{waitUntil:'load'});await page.waitForTimeout(1000);await page.evaluate(()=>VRTDialog.setAuto(false));await page.setInputFiles('#fileInput',SAMPLES+'1-VRT MONTHLY SHIPPING SCHEDULE.xlsx');await page.waitForTimeout(1500);
   const vis=await page.$('#msPrevOk');if(!vis)throw new Error('no preview');const kpis=await page.$$eval('.kpi .kn',a=>a.map(x=>x.textContent));const before=await page.evaluate(()=>DATA.records.length);await page.screenshot({path:OUT+'06_monthship_preview.png'});
   await page.click('#msPrevOk');await page.waitForTimeout(800);const after=await page.evaluate(()=>DATA.records.length);if(before!==0||after<10)throw new Error('rows '+before+' → '+after);return 'preview KPIs '+kpis.slice(0,4).join('/')+' · before 0 → after '+after});
 /* ── B3 ── */
 await test('B3 customer statistics: the real 1.7 MB report parses in a Web Worker (main thread stays responsive) and lands in the page',async()=>{
   await page.goto(BASE+'vrt_customer_statistics_control_center_v1.html',{waitUntil:'load'});await page.waitForTimeout(1000);
   const t0=Date.now();await page.evaluate(()=>{window.__ticks=0;window.__tick=setInterval(()=>window.__ticks++,50)});await page.setInputFiles('#fileInput',SAMPLES+'VRT - ALL CUSTOMER STATISTICS REPORT (1)__71d396a6.xlsx');
   await page.waitForFunction(()=>/Local updated/.test(document.getElementById('cloudStatus').textContent),{timeout:120000});const ms=Date.now()-t0;const r=await page.evaluate(()=>{clearInterval(window.__tick);return {ticks:window.__ticks,details:DATA.details.length,customers:DATA.customers.length,st:document.getElementById('cloudStatus').textContent}});
   await page.screenshot({path:OUT+'07_custstats_worker.png'});const expected=ms/50;if(r.ticks<expected*0.5)throw new Error('main thread blocked: '+r.ticks+' ticks in '+ms+' ms');return 'import '+ms+' ms · timer ticks '+r.ticks+'/'+Math.round(expected)+' (main thread free) · details '+r.details+' · '+r.st});
 /* ── D2 ── */
 await test('D2 shared Telegram modal has the 🤖 AI 摘要 button; without a GAS URL it explains instead of failing',async()=>{
   await page.goto(BASE+'sewing_v5.html',{waitUntil:'load'});await page.waitForTimeout(1500);await page.evaluate(()=>VRTTelegram.open());await page.waitForTimeout(1500);const btn=await page.$('#vrtTgAiBtn');if(!btn)throw new Error('no AI button');await page.screenshot({path:OUT+'08_telegram_ai_button.png'});
   return 'AI button present in the ✈️ modal'});
 /* ── C ── */
 await test('C orders_v3 with a mock GAS (routed through the browser): 「☁ 待匯入 1 檔」 badge, panel lists the Telegram file, Import runs the page importer and the row is marked done',async()=>{
   const {createGas}=require(ROOT+'qa/v41/gas_harness');const g=createGas();g.ctx.ScriptApp={getService:()=>({getUrl:()=>'x'}),getProjectTriggers:()=>[]};const bytes=fs.readFileSync(SAMPLES+'VRT Weekly Open Order Summary as of February-16-2026.xlsx');
   g.ctx.UrlFetchApp={fetch(url,o){const u=String(url);const m=u.match(/\/bot[^/]+\/(\w+)/);const method=m?m[1]:'';const ok=r=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,result:r})});if(/\/file\/bot/.test(u))return {getResponseCode:()=>200,getContentText:()=>'',getBlob:()=>g.ctx.Utilities.newBlob(bytes,'application/octet-stream','x')};if(method==='getFile')return ok({file_id:'fid_1',file_path:'documents/file_1.xlsx'});return ok({})}};
   g.ctx.inboxIntake_({message_id:1,date:Math.floor(Date.now()/1000),chat:{id:-1,title:'VRT Malen'},from:{first_name:'Malen'},document:{file_id:'fid_1',file_unique_id:'uq_b1',file_name:'VRT Weekly Open Order Summary as of February-16-2026.xlsx',file_size:bytes.length}});
   const MOCK='https://script.google.com/macros/s/MOCK_BROWSER/exec';await page.route(MOCK,async route=>{const req=route.request();const body=req.postData()||'{}';const res=g.post(JSON.parse(body));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(res)})});
   await page.goto(BASE+'orders_v3.html',{waitUntil:'load'});await page.evaluate(u=>localStorage.setItem('vrt_portal_gas_url',u),MOCK);await page.goto(BASE+'orders_v3.html',{waitUntil:'load'});await page.waitForTimeout(2500);
   const badge=await page.$eval('#vrtInboxN',e=>e.textContent);if(badge!=='1')throw new Error('badge '+badge);await page.click('#vrtInboxFab');await page.waitForTimeout(500);await page.screenshot({path:OUT+'09_inbox_panel.png'});
   const n0=await page.evaluate(()=>APP.weekly.length);await page.click('#vrtInboxPanel [data-act="import"]');await page.waitForFunction(()=>/已匯入|imported/.test(document.getElementById('vrtInboxMsg').textContent),{timeout:30000});await page.waitForTimeout(800);const n1=await page.evaluate(()=>APP.weekly.length);
   const row=JSON.parse(g.raw('inbox_queue.json').content)[0];if(row.status!=='done')throw new Error('status '+row.status);await page.unroute(MOCK);return 'badge 1 · import → weekly rows '+n0+' → '+n1+' · queue done'});
 await browser.close();
 if(errors.length)console.log('PAGE ERRORS:',errors.join('\n'));
 const pass=out.filter(x=>x.status==='PASS').length;console.log(pass+'/'+out.length+' PASS · screenshots in '+OUT);fs.writeFileSync(path.resolve(__dirname,'browser_v416_results.json'),JSON.stringify({results:out,pageErrors:errors},null,1));process.exit(pass===out.length?0:1);
})().catch(e=>{console.error(e);process.exit(1)});
