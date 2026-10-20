/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   v4.8 (2026-10-18) PSJERP 雲端唯讀橋接 — ERP 對照中心直接讀 PSJERP 的雲端資料（訂單 W_COD700、出貨 W_CBL300、BOM W_COD550），
   不必再手動丟匯出檔。
   · 只讀：只呼叫 PSJERP 的 erp_manifest / erp_get；不寫回 PSJERP、不碰舊 ERP（clothes.exe / SQL）。
   · 讀取密碼只放在本專案的「指令碼屬性」PSJERP_READ_KEY；程式碼、GitHub、網頁、記錄、回應裡都沒有它（錯誤訊息會先把 k= 遮掉）。
   · 每批資料（manifest 的 key）比對 version，沒變就不重抓；PSJERP 每週一、四 09:00 更新，本專案週一、四 10 點與 12 點各檢查一次。
   · 抓下來的資料只存在 PROD 的 Drive 快取（erp_bridge_*.json），依日期排序後切成 5,000 列一頁給網頁讀。
   · 只留近幾年：訂單／出貨近 ERP_BRIDGE_YEARS 年（預設 3；未結案且有未交量的舊訂單照留），BOM 近 ERP_BRIDGE_BOM_YEARS 年（預設 2），
     不把 2014 年起的全部資料搬進來。一批太大、時間不夠時，抓到哪裡先存起來，下次接著抓。
   · 不用 LockService 的腳本鎖（避免卡住各模組的雲端同步），改用指令碼屬性的軟鎖（6 分鐘逾時）。
   · PROD 的 /exec 是公開網址，所以 ERP 資料不能因為過了這座橋就變成不用密碼：網頁讀資料（erpBridgePage）與要求同步
     （erpBridgePull）都要在 POST 內容帶 pass（預設就是 PSJERP 讀取密碼；想給同事另一組，就設指令碼屬性 ERP_BRIDGE_VIEW_KEY）。
     密碼不放網址；同一小時錯 20 次先鎖一小時。erpBridgeStatus 只回筆數／時間，沒有業務資料，不用密碼。
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
const ERPB_DEFAULT_URL_='https://script.google.com/macros/s/AKfycbzyAaaKlMGdot9YtYAlBp-dktm2xRr_aHbOcQ-TNfouERMjuq4iCfRhCY0_3LsPa2mL/exec';
const ERPB_REPS_={
  cod700:{sheet:'ORDERS',date:'order_date',zh:'ERP 訂單明細',en:'ERP order lines'},
  cbl300:{sheet:'SHIP',date:'ship_date',zh:'ERP 出貨明細',en:'ERP shipment lines'},
  cod550:{sheet:'BOM',date:'order_date',zh:'ERP 訂單用料（BOM）',en:'ERP BOM lines'},
};
const ERPB_STATE_='erp_bridge_state.json', ERPB_PAGE_=5000, ERPB_LIMIT_=3000, ERPB_BUDGET_MS_=270000, ERPB_HARD_MS_=300000;
function erpbProps_(){ return PropertiesService.getScriptProperties(); }
function erpbUrl_(){ return String(erpbProps_().getProperty('PSJERP_URL')||ERPB_DEFAULT_URL_).trim(); }
function erpbKey_(){ return String(erpbProps_().getProperty('PSJERP_READ_KEY')||'').trim(); }
function erpbMask_(s){ return String(s==null?'':s).replace(/([?&]k=)[^&\s"']+/g,'$1***').replace(new RegExp(erpbKey_()?erpbKey_().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'):'(?!)','g'),'***'); }
function erpbHash_(s){ s=String(s); let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return ('00000000'+(h>>>0).toString(16)).slice(-8); }
function erpbFile_(key){ return 'erp_bridge_b_'+String(key).replace(/[^0-9A-Za-z_-]/g,'_').slice(0,60)+'_'+erpbHash_(key)+'.json'; }
function erpbPageFile_(rep,n){ return 'erp_bridge_p_'+rep+'_'+n+'.json'; }
const erpbPJ_=v=>{ if(v==null||v==='')return null; if(typeof v!=='string')return v; try{ return JSON.parse(v); }catch(_){ return v; } };
function erpbState_(){ const raw=loadFromDrive(ERPB_STATE_); let st=null; try{ st=raw?JSON.parse(raw):null; }catch(_){ st=null; } st=st||{}; st.files=st.files||{}; st.reps=st.reps||{}; return st; }
function erpbSaveState_(st){ saveToDrive(ERPB_STATE_, JSON.stringify(st)); return st; }
function erpbSince_(prop,def){ const y=Number(erpbProps_().getProperty(prop)||def)||def; const d=new Date(); d.setFullYear(d.getFullYear()-y); return Utilities.formatDate(d,CFG.TZ,'yyyy-MM-dd'); }
function erpbBomSince_(){ return erpbSince_('ERP_BRIDGE_BOM_YEARS',2); }
function erpbSinceAll_(){ return {cod700:erpbSince_('ERP_BRIDGE_YEARS',3),cbl300:erpbSince_('ERP_BRIDGE_YEARS',3),cod550:erpbBomSince_()}; }
/* keep a row? orders: recent OR still open (no closed_date and open_qty > 0) · shipments / BOM: recent */
function erpbKeep_(rep,cols,since){
  const di=cols.indexOf(ERPB_REPS_[rep].date); if(di<0)return null;
  if(rep==='cod700'){ const ci=cols.indexOf('closed_date'), oi=cols.indexOf('open_qty'); return r=>!r[di]||String(r[di])>=since||(ci>=0&&!r[ci]&&oi>=0&&Number(r[oi])>0); }
  return r=>!r[di]||String(r[di])>=since;
}
function erpbPartFile_(key){ return erpbFile_(key).replace(/\.json$/,'.part.json'); }

/* GET on the PSJERP web app. withKey adds k=<PSJERP_READ_KEY>; every error text is masked before it leaves this function. */
function erpbGet_(params,withKey){
  const q=Object.keys(params).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(params[k])).join('&');
  const url=erpbUrl_()+'?'+q+(withKey?'&k='+encodeURIComponent(erpbKey_()):'');
  let r; try{ r=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true}); }catch(e){ throw new Error('連不到 PSJERP：'+erpbMask_(e&&e.message||e)); }
  const code=r.getResponseCode(), txt=r.getContentText(); let j=null; try{ j=JSON.parse(txt); }catch(_){ throw new Error('PSJERP 回應不是 JSON（HTTP '+code+'）'); }
  if(j&&j.ok===false){ const e=new Error(j.error==='BAD_KEY'?'PSJERP 讀取密碼不對：請檢查指令碼屬性 PSJERP_READ_KEY':'PSJERP：'+erpbMask_(j.msg||j.error||'error')); e.code=j.error||'ERR'; throw e; }
  return j;
}
function erpbManifest_(){ const j=erpbGet_({action:'erp_manifest'},true); const files=Array.isArray(j)?j:(j.files||j.manifest||j.batches||[]); return files.filter(m=>m&&m.key).map(m=>Object.assign({},m,{rep:String(m.rep||'').toLowerCase(),cols:erpbPJ_(m.cols),types:erpbPJ_(m.types),range:erpbPJ_(m.range),totals:erpbPJ_(m.totals)})); }
/* one batch, all pages (limit 3000). cols come from erp_get when it sends them, else from the manifest.
   deadline: when the time runs out mid-batch the rows so far are parked in <batch>.part.json and null is returned; the next run resumes at
   that offset (same version only). */
function erpbPullBatch_(m,deadline){
  let cols=Array.isArray(m.cols)?m.cols.slice():[], types=Array.isArray(m.types)?m.types.slice():[]; let rows=[], off=0, total=Number(m.rows)||0, guard=0;
  const ver=String(m.version==null?'':m.version), pf=erpbPartFile_(m.key); let resumed=false;
  try{ const raw=loadFromDrive(pf); const p=raw?JSON.parse(raw):null; if(p&&p.version===ver&&p.off>0&&Array.isArray(p.rows)){ rows=p.rows; off=p.off; total=p.total||total; if(p.cols&&p.cols.length)cols=p.cols; if(p.types&&p.types.length)types=p.types; resumed=true; } }catch(_){}
  do{ if(deadline&&Date.now()>deadline){ saveToDrive(pf,JSON.stringify({version:ver,off,total,cols,types,rows})); return null; }
    const j=erpbGet_({action:'erp_get',sheet:m.sheet||ERPB_REPS_[m.rep].sheet,key:m.key,offset:off,limit:ERPB_LIMIT_},true);
    const page=j.rows||[]; if(Array.isArray(j.cols)&&j.cols.length)cols=j.cols; if(Array.isArray(j.types)&&j.types.length)types=j.types;
    rows=rows.concat(page); total=j.total!=null?Number(j.total):Math.max(total,rows.length); off+=ERPB_LIMIT_; if(!page.length)break; }while(off<total&&++guard<400);
  if(rows.length&&!Array.isArray(rows[0])){ const keys=cols.length?cols:Object.keys(rows[0]); rows=rows.map(o=>Array.isArray(o)?o:keys.map(c=>o[c]==null?null:o[c])); if(!cols.length)cols=keys; }
  if(resumed){ try{ saveToDrive(pf,'{}'); }catch(_){} }
  return {key:m.key,resumed,rep:m.rep,sheet:m.sheet,version:String(m.version==null?'':m.version),cols,types,rows,total:rows.length,label:m.label||'',range:m.range||null,asof:m.asof||'',at:m.at||''};
}
/* rebuild the per-rep pages: union of live batches → identical rows from two DIFFERENT batches counted once → date-sorted → 5,000 per page */
function erpbBuildRep_(st,rep){
  const keys=Object.keys(st.files).filter(k=>st.files[k].rep===rep&&!st.files[k].gone);const R=ERPB_REPS_[rep];
  const colSet=[];const batches=keys.map(k=>{ const raw=loadFromDrive(st.files[k].file); let b=null; try{ b=raw?JSON.parse(raw):null; }catch(_){} if(b)(b.cols||[]).forEach(c=>{ if(colSet.indexOf(c)<0)colSet.push(c); }); return b; }).filter(Boolean);
  const seen={}; let dup=0; const rows=[];
  batches.forEach(b=>{ const idx=colSet.map(c=>(b.cols||[]).indexOf(c)); const local={};
    (b.rows||[]).forEach(r=>{ const row=idx.map(i=>i<0?null:(r[i]==null?null:r[i])); const h=JSON.stringify(row); if(seen[h]&&seen[h]!==b.key){ dup++; return; } seen[h]=seen[h]||b.key; local[h]=1; rows.push(row); }); });
  const di=R.date?colSet.indexOf(R.date):-1; if(di>=0)rows.sort((a,b)=>String(a[di]||'').localeCompare(String(b[di]||'')));
  const prev=st.reps[rep]||{}; const pages=[];
  for(let n=0;n*ERPB_PAGE_<rows.length;n++){ const part=rows.slice(n*ERPB_PAGE_,(n+1)*ERPB_PAGE_); const file=erpbPageFile_(rep,n); saveToDrive(file,JSON.stringify(part));
    pages.push({n,rows:part.length,min:di>=0?String(part[0][di]||''):'',max:di>=0?String(part[part.length-1][di]||''):''}); }
  for(let n=pages.length;n<(prev.pages||[]).length;n++){ try{ saveToDrive(erpbPageFile_(rep,n),'[]'); }catch(_){} }   // shrink: leftover pages emptied
  const versions={}; keys.forEach(k=>versions[k]=st.files[k].version);
  st.reps[rep]={rep,sheet:R.sheet,cols:colSet,total:rows.length,pages,dupAcrossBatches:dup,versions,builtAt:new Date().toISOString(),dateCol:R.date||'',sig:erpbHash_(JSON.stringify(versions))};
  return st.reps[rep];
}
function erpbRunning_(on){ const p=erpbProps_(); if(on===undefined){ const t=Number(p.getProperty('erp_bridge_running')||0); return t&&Date.now()-t<6*60000; } if(on)p.setProperty('erp_bridge_running',String(Date.now())); else p.deleteProperty('erp_bridge_running'); }
/* sync: manifest → changed batches only (version) → rebuild the reps that changed. Resumes on the next run when it runs out of time. */
function erpBridgeSync(force){
  if(!erpbKey_())return {ok:false,notConfigured:true,error:'尚未設定指令碼屬性 PSJERP_READ_KEY（PSJERP 讀取密碼）'};
  if(erpbRunning_())return {ok:false,busy:true,error:'PSJERP 同步正在進行，請稍後再試'};
  erpbRunning_(true); const t0=Date.now();
  try{
    const st=erpbState_(); const man=erpbManifest_().filter(m=>ERPB_REPS_[m.rep]); const since=erpbSinceAll_();
    const out={ok:true,checked:man.length,pulled:[],same:0,skippedOld:0,partial:false,changedReps:[]};
    const live={}; man.forEach(m=>live[m.key]=1); const touch=rep=>{ if(out.changedReps.indexOf(rep)<0)out.changedReps.push(rep); };
    // newest batches first, so a partial run already has this year's data
    man.sort((a,b)=>String((Array.isArray(b.range)&&b.range[1])||'').localeCompare(String((Array.isArray(a.range)&&a.range[1])||'')));
    for(const m of man){
      if(Date.now()-t0>ERPB_BUDGET_MS_){ out.partial=true; break; }
      const prev=st.files[m.key]; const ver=String(m.version==null?'':m.version);
      // a shipment / BOM batch that ends before the window is not fetched at all (orders are: an old order may still be open)
      if(m.rep!=='cod700'){ const rg=Array.isArray(m.range)?m.range:[]; if(rg[1]&&String(rg[1])<since[m.rep]){ out.skippedOld++; if(prev&&!prev.gone){ prev.gone=true; touch(m.rep); } continue; } }
      if(!force&&prev&&prev.version===ver&&!prev.gone){ out.same++; continue; }
      const b=erpbPullBatch_(m,t0+ERPB_HARD_MS_); if(!b){ out.partial=true; out.parked=m.key; break; }
      const keep=erpbKeep_(m.rep,b.cols,since[m.rep]); const n0=b.rows.length; if(keep)b.rows=b.rows.filter(keep); b.total=b.rows.length; b.droppedOld=n0-b.rows.length;
      const file=erpbFile_(m.key); saveToDrive(file,JSON.stringify(b));
      st.files[m.key]={key:m.key,rep:m.rep,sheet:b.sheet||ERPB_REPS_[m.rep].sheet,version:ver,rows:b.rows.length,droppedOld:b.droppedOld,file,label:m.label||'',range:m.range||null,asof:m.asof||'',at:m.at||'',fetchedAt:new Date().toISOString(),gone:false};
      out.pulled.push({key:m.key,rep:m.rep,rows:b.rows.length,droppedOld:b.droppedOld,resumed:!!b.resumed}); touch(m.rep);
    }
    if(!out.partial)Object.keys(st.files).forEach(k=>{ if(!live[k]&&!st.files[k].gone){ st.files[k].gone=true; touch(st.files[k].rep); } });
    Object.keys(ERPB_REPS_).forEach(rep=>{ if(out.changedReps.indexOf(rep)>=0||!st.reps[rep]&&Object.keys(st.files).some(k=>st.files[k].rep===rep))erpbBuildRep_(st,rep); });
    st.lastSync=new Date().toISOString(); st.lastResult={pulled:out.pulled.length,same:out.same,skippedOld:out.skippedOld,partial:out.partial,parked:out.parked||'',changedReps:out.changedReps,ms:Date.now()-t0};
    erpbSaveState_(st); out.status=erpbStatus_(st); return out;
  }catch(e){ return {ok:false,error:erpbMask_(e&&e.message||e),code:e&&e.code||''}; }
  finally{ erpbRunning_(false); }
}
function erpbStatus_(st){
  st=st||erpbState_(); const reps={}; Object.keys(st.reps).forEach(r=>{ const x=st.reps[r]; reps[r]={rep:r,sheet:x.sheet,zh:(ERPB_REPS_[r]||{}).zh||r,cols:x.cols,total:x.total,pages:(x.pages||[]).map(p=>({n:p.n,rows:p.rows,min:p.min,max:p.max})),dupAcrossBatches:x.dupAcrossBatches||0,sig:x.sig,builtAt:x.builtAt,dateCol:x.dateCol}; });
  const files=Object.keys(st.files).map(k=>{ const f=st.files[k]; return {key:k,rep:f.rep,rows:f.rows,droppedOld:f.droppedOld||0,version:f.version,label:f.label,range:f.range,asof:f.asof,at:f.at,fetchedAt:f.fetchedAt,gone:!!f.gone}; }).sort((a,b)=>String(a.rep+a.key).localeCompare(String(b.rep+b.key)));
  const since=erpbSinceAll_();
  return {configured:!!erpbKey_(),url:erpbUrl_(),lastSync:st.lastSync||'',lastResult:st.lastResult||null,reps,files,bomSince:since.cod550,since,running:!!erpbRunning_()};
}
/* triggers: PSJERP refreshes Monday / Thursday 09:00 → check at 10:xx and 12:xx (catch-up); version check makes the second run cheap */
function erpBridgeTrigger(){
  const r=erpBridgeSync(false); console.log(JSON.stringify(Object.assign({},r,{status:undefined})));
  // not finished (big first load): continue in a few minutes with a one-off trigger, at most 12 times a day
  if(r&&r.ok&&r.partial){ const p=erpbProps_(), day=Utilities.formatDate(new Date(),CFG.TZ,'yyyy-MM-dd'); let c={}; try{ c=JSON.parse(p.getProperty('erp_bridge_cont')||'{}'); }catch(_){}
    if(c.day!==day)c={day,n:0}; const have=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='erpBridgeContinue');
    if(!have&&c.n<12){ ScriptApp.newTrigger('erpBridgeContinue').timeBased().after(3*60000).create(); c.n++; p.setProperty('erp_bridge_cont',JSON.stringify(c)); r.continueScheduled=true; } }
  return r;
}
function erpBridgeContinue(){ ScriptApp.getProjectTriggers().forEach(t=>{ if(t.getHandlerFunction()==='erpBridgeContinue')ScriptApp.deleteTrigger(t); }); return erpBridgeTrigger(); }
function installErpBridgeTrigger(){
  const have=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='erpBridgeTrigger').length; if(have)return 'erpBridgeTrigger already installed ('+have+')';
  [ScriptApp.WeekDay.MONDAY,ScriptApp.WeekDay.THURSDAY].forEach(d=>[10,12].forEach(h=>ScriptApp.newTrigger('erpBridgeTrigger').timeBased().onWeekDay(d).atHour(h).inTimezone(CFG.TZ).create()));
  return 'erpBridgeTrigger Mon + Thu 10:xx and 12:xx ('+CFG.TZ+')';
}
function removeErpBridgeTrigger(){ let n=0; ScriptApp.getProjectTriggers().forEach(t=>{ if(/^erpBridge(Trigger|Continue)$/.test(t.getHandlerFunction())){ ScriptApp.deleteTrigger(t); n++; } }); return 'removed '+n; }
/* editor check: ping (no key) + manifest (with key) — prints counts only, never the key */
function checkErpBridge(){
  const r={url:erpbUrl_(),configured:!!erpbKey_()};
  try{ r.ping=erpbGet_({action:'ping'},false); }catch(e){ r.pingError=erpbMask_(e.message); }
  if(r.configured){ try{ const man=erpbManifest_(); const by={}; man.forEach(m=>{ by[m.rep]=by[m.rep]||{batches:0,rows:0}; by[m.rep].batches++; by[m.rep].rows+=Number(m.rows)||0; }); r.manifest=by; }catch(e){ r.manifestError=erpbMask_(e.message); } }
  const st=erpbState_(); r.lastSync=st.lastSync||''; r.reps=Object.keys(st.reps).map(k=>k+' '+st.reps[k].total+' rows / '+(st.reps[k].pages||[]).length+' pages');
  r.triggers=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='erpBridgeTrigger').length;
  console.log(JSON.stringify(r,null,2)); return r;
}
/* viewer check for the data actions: pass (POST body, never the URL) = ERP_BRIDGE_VIEW_KEY, or PSJERP_READ_KEY when that is not set */
function erpbViewKey_(){ return String(erpbProps_().getProperty('ERP_BRIDGE_VIEW_KEY')||erpbKey_()||'').trim(); }
function erpbAuth_(p){
  const want=erpbViewKey_(); if(!want)return {ok:false,notConfigured:true,error:'尚未設定指令碼屬性 PSJERP_READ_KEY（PSJERP 讀取密碼）'};
  const pr=erpbProps_(), hour=Utilities.formatDate(new Date(),CFG.TZ,'yyyy-MM-dd HH'); let f={}; try{ f=JSON.parse(pr.getProperty('erp_bridge_fail')||'{}'); }catch(_){ f={}; }
  if(f.h===hour&&f.n>=20)return {ok:false,locked:true,error:'ERP 對照密碼錯太多次，請一小時後再試'};
  const got=String(p.pass==null?'':p.pass).trim(); if(got&&got===want)return null;
  if(got){ if(f.h!==hour)f={h:hour,n:0}; f.n++; pr.setProperty('erp_bridge_fail',JSON.stringify(f)); }
  return {ok:false,needPass:true,error:got?'ERP 對照密碼不對':'請輸入 ERP 對照密碼（PSJERP 讀取密碼）'};
}
/* web actions (POST JSON from vrt_erp_link_v1.html through the PROD /exec): the key / pass is never part of a response */
function handleErpBridge_(p){
  const a=String(p.action||'');
  if(a==='erpBridgeStatus')return okCors(Object.assign({ok:true,viewKeySeparate:!!erpbProps_().getProperty('ERP_BRIDGE_VIEW_KEY')},erpbStatus_()));
  if(a==='erpBridgePull'||a==='erpBridgePage'){ const no=erpbAuth_(p); if(no)return okCors(no); }
  if(a==='erpBridgePull'){ const r=erpBridgeSync(p.force===true||p.force==='true'); return okCors(Object.assign({},r,{status:r.status||erpbStatus_()})); }
  if(a==='erpBridgePage'){ const rep=String(p.rep||'').toLowerCase(), n=Number(p.page)||0; const st=erpbState_(); const x=st.reps[rep]; if(!x)return okCors({ok:false,error:'沒有 '+rep+' 的快取，請先同步'});
    if(n<0||n>=(x.pages||[]).length)return okCors({ok:false,error:'page out of range'}); const raw=loadFromDrive(erpbPageFile_(rep,n)); let rows=[]; try{ rows=raw?JSON.parse(raw):[]; }catch(_){ rows=[]; }
    return okCors({ok:true,rep,page:n,pages:x.pages.length,cols:x.cols,rows,sig:x.sig}); }
  return okCors({ok:false,error:'unknown erp bridge action '+a});
}
function checkProductionV48(){ const r=checkProductionV47(); r.erpBridge=checkErpBridge(); return r; }
