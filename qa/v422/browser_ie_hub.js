/* v4.22 — IE／SMV：日週月年期間、📅 排單看板、👕 款式頁（OBD 圖、SMV 核對、機台 vs 清冊）、零件備品 🏭 機台清冊匯入。
   測試資料全部在這裡產生（隨附的 OBD 範例 release_sources/OBD_*.xls ＋ 合成的排產／車縫／機台清冊），不用真實檔案。 */
const {chromium}=require('playwright');const assert=require('assert');const BASE=process.env.VRT_BASE_URL||'http://127.0.0.1:8765/';
const SHOTS=process.env.VRT_SHOTS||'';
(async()=>{const b=await chromium.launch({executablePath:process.env.VRT_CHROMIUM||undefined});const ctx=await b.newContext({viewport:{width:1360,height:900}});
  await ctx.route('https://script.google.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"data":{}}'}));
  const errs=[];let pass=0;const ok=m=>{pass++;console.log('PASS',m)};
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());
  /* 1. 零件備品：匯入合成機台清冊 */
  await p.goto(BASE+'vrt_spare_parts_v2.html');await p.waitForFunction(()=>window.VRTParts39&&window.VRTMachineRegister&&typeof importExcel==='function');await p.waitForTimeout(800);
  const reg=await p.evaluate(async()=>{const rows=[['VRT Simple Machine ID Register'],[],['note'],[],['No','Asset No.','Machine ID','Machine Type','Brand','Model','Serial No. (Optional)','Year','Location / Place','Condition','Remark']];let n=1;
    const add=(k,type,cnt,loc,cond)=>{for(let i=0;i<cnt;i++){rows.push([n,'VRT-T-'+String(n).padStart(4,'0'),k+'-'+n,type,'Juki','','','2020',loc,cond(i),''] );n++}};
    add('SN','Single Needle Machine 平車',30,'Line 5',i=>i<2?'Damaged 損壞':'Good 正常');add('OL','Overlock Machine 拷克機(5针)',12,'B SHOP B店',()=>'');add('BT','Bartack Machine 打棗機',3,'A SHOP B店',()=>'Good 正常');add('SA','Snap machine-small, automatic 小型自动快照机',4,'',()=>'');add('AC','Air Compressor 空壓機',1,'',()=>'');
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Machine ID');const u8=XLSX.write(wb,{type:'array',bookType:'xlsx'});
    await importExcel(new File([u8],'Machine_Register_TEST.xlsx'));await new Promise(r=>setTimeout(r,300));const preview=document.getElementById('modalBox').innerText;await VRTParts39.commitMachines();await new Promise(r=>setTimeout(r,500));
    return {preview,app:document.getElementById('app').innerText,ms:VRTParts39.getState().maintenance.machines.length,tab:document.querySelector('.tab.on')?.innerText}});
  assert(/50\s*台|50 machines/.test(reg.preview),reg.preview);assert.equal(reg.ms,50);assert(/機台清冊/.test(reg.tab));assert(/單針平車/.test(reg.app)&&/損壞/.test(reg.app));ok('機台清冊匯入：50 台、預覽、存檔、分頁 🏭 機台清冊');
  if(SHOTS)await p.screenshot({path:SHOTS+'/spare_register.png',fullPage:false});
  // 手動填線別：拷克前 4 台 → L5
  await p.evaluate(async()=>{const ms=VRTParts39.getState().maintenance.machines.filter(m=>m.family==='5-thread Overlock').slice(0,4);for(const m of ms)await VRTParts39.machineEdit(m.assetNo,'line','5')});
  const lineCnt=await p.evaluate(()=>VRTParts39.getState().maintenance.machines.filter(m=>m.line==='Line 5').length);assert.equal(lineCnt,34);ok('線別可手動改（5 → Line 5）');
  // 重新匯入同一份：不新增、手動線別保留
  const again=await p.evaluate(async()=>{const before=VRTParts39.getState().maintenance.machines.length;const R=VRTMachineRegister;const st=VRTParts39.getState().maintenance.machines;const m=R.merge(st,st.map(x=>({...x,line:'',fingerprint:'changed'})));return {before,after:m.machines.length,keep:m.machines.filter(x=>x.line==='Line 5').length}});
  assert.equal(again.after,again.before);assert.equal(again.keep,34);ok('再匯入：不重複、手動線別保留');
  /* 2. 排產與車縫：合成資料 */
  const T=new Date();const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const mon=new Date(T);mon.setDate(T.getDate()-((T.getDay()+6)%7));const day=i=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return ymd(d)};
  await p.goto(BASE+'ie_smv_report_v2_1.html');await p.waitForFunction(()=>window.VRT_IE_SMV_APP&&window.VRTIEHub&&window.VRTProdStorage);await p.evaluate(()=>VRT_IE_SMV_APP.ready);
  const days=[0,1,2,3,4,5,6].map(day);
  await p.evaluate(async(days)=>{const day=i=>days[i];const plan=[{id:'P1',month:day(0).slice(0,7),line:'Line 5',customer:'ADI',po:'PO-1',style:'A2642K',sewingQty:3000,dailyOutput:500,manpower:28,smv:6.9,startDate:day(0),endDate:day(5)},{id:'P2',month:day(0).slice(0,7),line:'Line 2',customer:'NORTHERN',po:'PO-2',style:'5209',sewingQty:1200,dailyOutput:300,manpower:26,smv:0,startDate:day(1),endDate:day(4)},{id:'P3',month:day(0).slice(0,7),line:'Line 9',customer:'X',po:'PO-3',style:'ZZ999',sewingQty:800,dailyOutput:400,manpower:20,smv:5,startDate:day(2),endDate:day(3)}];
    await VRTProdStorage.replaceAll('VRT_ProductionPlan','plan_records',plan,{keyPath:'id'});
    const sew=[];for(let i=0;i<3;i++)sew.push({id:'S5'+i,date:day(i),lineNo:'Line 5',styleNo:'A2642K',pieces:[380,450,520][i],workers:28,efficiency:40,smv:7.5,hours:8});sew.push({id:'S21',date:day(1),lineNo:'Line 2',styleNo:'5209',pieces:260,workers:26,efficiency:38,smv:0,hours:8});sew.push({id:'S71',date:day(1),lineNo:'Line 7',styleNo:'NOPLAN1',pieces:100,workers:20,efficiency:20,smv:4,hours:8});
    await VRTProdStorage.replaceAll('VRT_SewingProduction','daily_records',sew,{keyPath:'id'})},days);
  /* 3. 匯入隨附的 OBD（A2642K、5209 範例） */
  await p.evaluate(async()=>{const files=[];for(const [path,name] of [['OBD_A2642K_pending.xls','Pending - OBD-A2642K (1).xls'],['OBD_5209_pending.xls','Pending - OBD-5209.xls']]){const r=await fetch('release_sources/'+path);files.push(new File([await r.arrayBuffer()],name))}await VRT_IE_SMV_APP.handleFiles(files)});
  await p.waitForTimeout(800);await p.evaluate(async()=>{if(VRT_IE_SMV_APP.getPending().length)await VRT_IE_SMV_APP.confirmImport()});await p.waitForTimeout(800);
  const st=await p.evaluate(()=>{const s=VRT_IE_SMV_APP.getState();return {styles:s.styles.map(x=>x.style),docs:(s.sourceDocuments||[]).map(d=>d.name)}});
  assert(st.styles.some(x=>/A2642K/.test(x)),JSON.stringify(st));ok('OBD 匯入：'+st.styles.join(', ')+' · 原檔 '+st.docs.length);
  /* 4. 看板：預設本週、第一個分頁 */
  // 匯入後主頁會切到「全部」讓剛匯入的看得到；看板在「全部」時顯示本週（有提示），這裡切回週
  await p.evaluate(async()=>{await VRTIEHub.data(true);VRT_IE_SMV_APP.setTab('board')});await p.waitForTimeout(500);const fb=await p.evaluate(()=>document.getElementById('content').innerText);assert(/上方選「全部」時看板顯示本週/.test(fb));await p.click('[data-period="week"]');await p.waitForTimeout(700);
  const board=await p.evaluate(()=>({txt:document.getElementById('content').innerText,label:document.getElementById('periodLabel').textContent,active:document.querySelector('.tab-btn.active').getAttribute('data-tab'),bars:document.querySelectorAll('#content [data-hub-plan]').length,metricsHidden:document.getElementById('metrics').style.display}));
  assert.equal(board.active,'board');assert(/W\d\d/.test(board.label),board.label);assert.equal(board.bars,3);assert(/Line 5/.test(board.txt)&&/Line 2/.test(board.txt));assert(/NOPLAN1/.test(board.txt),'unplanned');assert.equal(board.metricsHidden,'none');
  ok('看板：本週 '+board.label+'、3 條排產、車縫沒排的款有提示、上方 IE 數字隱藏');
  if(SHOTS)await p.screenshot({path:SHOTS+'/board_line.png',fullPage:true});
  for(const v of ['day','style']){await p.click('[data-hub-view="'+v+'"]');await p.waitForTimeout(400);if(SHOTS)await p.screenshot({path:SHOTS+'/board_'+v+'.png',fullPage:true})}
  const dayTxt=await p.evaluate(()=>document.getElementById('content').innerText);assert(/A2642K/.test(dayTxt));
  await p.click('[data-hub-view="day"]');await p.waitForTimeout(300);const dv=await p.evaluate(()=>document.getElementById('content').innerText);assert(/未達計畫|below plan/.test(dv)&&/SMV 不同|SMV differs/.test(dv)&&/排產沒排|not planned/.test(dv),dv.slice(0,400));ok('依日：未達計畫、日報 SMV 不同、排產沒排 都標出來');
  await p.click('[data-hub-view="line"]');
  /* 5. 期間：月／年／◀ ▶ */
  await p.click('[data-period="month"]');await p.waitForTimeout(300);let lab=await p.textContent('#periodLabel');assert(/月|\d{4}-\d\d/.test(lab),lab);
  await p.click('[data-period-nav="-1"]');await p.waitForTimeout(300);const lab2=await p.textContent('#periodLabel');assert.notEqual(lab,lab2);
  await p.click('[data-period="year"]');await p.waitForTimeout(300);const lab3=await p.textContent('#periodLabel');assert(/年|^\d{4}$/.test(lab3),lab3);
  await p.click('[data-period="day"]');await p.click('[data-period-nav="0"]');await p.waitForTimeout(300);const lab4=await p.textContent('#periodLabel');assert(/\d{4}-\d\d-\d\d/.test(lab4),lab4);
  await p.click('[data-period="week"]');await p.waitForTimeout(500);ok('期間：日 '+lab4+' · 月 '+lab+' → ◀ '+lab2+' · 年 '+lab3);
  /* 6. 款式頁 */
  await p.click('#content a[data-hub-plan="P1"]');await p.waitForSelector('#ieHubStyle');await p.waitForTimeout(500);
  const sp=await p.evaluate(()=>{const el=document.getElementById('ieHubStyle');return {txt:el.innerText,img:[...el.querySelectorAll('img')].map(i=>({w:i.naturalWidth,src:i.src.slice(0,5)})),hash:location.hash,svg:el.querySelectorAll('svg rect').length}});
  assert(/A2642K/.test(sp.txt));assert(sp.img.length>=1&&sp.img[0].w>500,JSON.stringify(sp.img));assert.equal(sp.hash,'#style=A2642K');assert(sp.svg>=3);
  assert(/排產表 SMV/.test(sp.txt)&&/車縫日報用的 SMV/.test(sp.txt));assert(/需要/.test(sp.txt)&&/L5 有|全廠/.test(sp.txt),sp.txt.slice(sp.txt.indexOf('機台'),sp.txt.indexOf('機台')+300));
  ok('款式頁：OBD 圖 '+sp.img[0].w+'px、#style= 連結、每日產量圖、SMV 核對、機台需要 vs L5 現有');
  if(SHOTS)await p.screenshot({path:SHOTS+'/style_page.png',fullPage:false});
  if(SHOTS){await p.evaluate(()=>document.getElementById('ieHubStyle').scrollTo(0,900));await p.waitForTimeout(200);await p.screenshot({path:SHOTS+'/style_page2.png'})}
  /* 6b. 像 PSJERP：往下捲接下一款、上方標題跟著換、◀ ▶ 在右邊；排線摘要在款式頁 */
  const lb=await p.evaluate(()=>document.getElementById('ieHubStyle').innerText);assert(/排線摘要/.test(lb)&&/需要人數/.test(lb)&&/最忙的 5 道工序/.test(lb),'line balance section');
  const navPos=await p.evaluate(()=>{const hd=document.getElementById('hubHead'),b=hd.querySelector('[data-hub-nav]:not([disabled])'),r=b.getBoundingClientRect();return {x:r.left,w:hd.getBoundingClientRect().width,txt:hd.innerText}});assert(navPos.x>navPos.w*0.55,'nav on right '+navPos.x);assert(/下一款/.test(navPos.txt)&&/1 \/ 3/.test(navPos.txt),navPos.txt);
  const sc=await p.evaluate(async()=>{const el=document.getElementById('ieHubStyle');for(let i=0;i<6;i++){el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));await new Promise(r=>setTimeout(r,250))}await new Promise(r=>setTimeout(r,300));return {cards:el.querySelectorAll('.hub-card').length,head:document.getElementById('hubHead').innerText.split('\n')[1]||document.getElementById('hubHead').innerText}});
  assert(sc.cards>=2,'cards '+sc.cards);ok('款式頁一直往下捲：接到 '+sc.cards+' 款；上方標題換成 '+sc.head.slice(0,30)+'；◀ ▶ 在右邊；有排線摘要');
  if(SHOTS){await p.evaluate(()=>document.getElementById('ieHubStyle').scrollTo(0,0));await p.waitForTimeout(300);await p.screenshot({path:SHOTS+'/style_head.png'})}
  const pending=await p.evaluate(()=>document.getElementById('ieHubStyle').innerText.match(/OBD 未核准|排產用[^\n]*|日報用[^\n]*/g));assert(pending&&pending.length,'flags');ok('款式頁旗標：'+pending.join(' / '));
  await p.click('[data-hub-act="balance"]');await p.waitForTimeout(600);const bal=await p.evaluate(()=>({tab:document.querySelector('.tab-btn.active').getAttribute('data-tab'),txt:document.getElementById('content').innerText}));assert.equal(bal.tab,'balancing');assert(/工序平衡表/.test(bal.txt));ok('⚖ 排線試算：帶著同一款同一筆排產跳到排線');
  await p.evaluate(()=>{const b=[...document.querySelectorAll('[data-bal-view]')].find(x=>x.getAttribute('data-bal-view')==='machine');b.click()});await p.waitForTimeout(400);const mt=await p.evaluate(()=>document.getElementById('content').innerText);assert(/機台清冊 50/.test(mt)&&/全廠可用/.test(mt),mt.slice(0,600));ok('排線 → 機台需求：讀到機台清冊、顯示全廠可用與本線');
  if(SHOTS)await p.screenshot({path:SHOTS+'/balance_machine.png',fullPage:true});
  /* 7. 深連結 + 款式庫點名 */
  const p2=await ctx.newPage();p2.on('pageerror',e=>errs.push(e.message));await p2.goto(BASE+'ie_smv_report_v2_1.html#style=5209');await p2.waitForSelector('#ieHubStyle',{timeout:15000});const t2=await p2.evaluate(()=>document.getElementById('ieHubStyle').innerText);assert(/5209/.test(t2));ok('網址 #style=5209 直接開款式頁');
  await p2.keyboard.press('Escape');await p2.evaluate(()=>VRT_IE_SMV_APP.setTab('library'));await p2.waitForTimeout(300);await p2.click('#content .style-name a');await p2.waitForSelector('#ieHubStyle');ok('款式庫點款號 → 款式頁');
  /* 7b. 生產用 SMV 規則（IE 週報 Cut off 欄，11/05 週報 111 款逐一相符）＋款式頁「排產還用舊 −35%」 */
  const cuts=await p.evaluate(()=>[[1.188,1.615],[10,9.492],[12.23,11.434],[11,9.273],[13.5,11.042],[11.428571,9.055],[37.5,27.215931],[10.5,10.151]].map(([a,b])=>VRTIEHub.cutRule(a,b)));
  assert.deepEqual(cuts,[0,0.05,0.05,0.1,0.1,0.15,0.15,0.05]);
  await p.evaluate(async()=>{const s=VRT_IE_SMV_APP.getState();s.updates.push({id:'UPD-T-HA',style:'A2642K',customer:'ADI',previousSmv:10.5,currentSmv:10.151,approval:'approved',testDate:'2026-09-10',effectiveDate:'2026-09-16',styleType:'current_old'});await VRT_IE_SMV_APP.setState(s);await VRTIEHub.data(true);VRTIEHub.openStyle('A2642K')});await p.waitForTimeout(600);
  const sp2=await p.evaluate(()=>document.getElementById('ieHubStyle').innerText);
  assert(/9\.643/.test(sp2)&&/扣 5%/.test(sp2),sp2.slice(0,800));assert(/排產還用舊 SMV −35%|還用舊 SMV −35%/.test(sp2)||/排產用 6\.9，應為 9\.643/.test(sp2),'plan flag');ok('生產用 SMV：10.5→10.151（−3.3%）扣 5% = 9.643；規則 8 個例子都對');
  await p.keyboard.press('Escape');
  /* 8. DNC 不再被當雙針 */
  const fam=await p.evaluate(()=>[VRTIEBalancing.familyOf('DNC'),VRTIEBalancing.familyOf('DN'),VRTIEBalancing.familyOf('5ovl'),VRTIEBalancing.familyOf('Bt')]);assert.deepEqual(fam,['Chainstitch','Double Needle','5-thread Overlock','Bartack']);ok('機台別名：DNC→鏈縫、DN→雙針');
  assert(!errs.length,errs.join(' | '));console.log(pass+'/'+pass+' passed');await b.close()})().catch(e=>{console.log('FAIL',e.stack||e.message);process.exit(1)});
