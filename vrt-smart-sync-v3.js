/* VRT Smart Sync v4.5.1 — persistent incremental sync + universal cloud status
   Core rules:
   - Only changed buckets are uploaded/downloaded.
   - Successful sync baseline persists across page reloads (IndexedDB + tiny localStorage fallback).
   - Reopening a page only checks the manifest; unchanged buckets are NOT downloaded again.
   - Upload does nothing when local data is unchanged.
   - All cloud pages show persistent push/pull status, including the previous successful result.
*/
(function(g){
  'use strict';
  if(g.VRTSmartSync && /^4\.5(?:\.|$)/.test(String(g.VRTSmartSync.version||''))) return;
  const DB_NAME='VRT_SmartSync_v3', STORE='sync_state', VERSION='4.5.1';
  const LS_PREFIX='vrt_smart_sync_v32_state_';
  const SHRINK_PREFIX='vrt_smart_sync_v37_shrink_';
  const RESUME_PREFIX='vrt_smart_sync_v42_resume_';
  const UI_KEY='vrt_smart_sync_v32_ui_'+location.pathname;
  const _nativeFetch=g.fetch.bind(g);
  const enc=s=>encodeURIComponent(String(s||''));
  const now=()=>new Date().toISOString();
  function limitWait(p,ms,label){return Promise.race([Promise.resolve(p),new Promise((_,rej)=>setTimeout(()=>rej(new Error((label||'operation')+' timeout')),Number(ms)||8000))])}

  function stable(v){
    if(v===null||v===undefined)return 'null';
    if(typeof v==='number'||typeof v==='boolean')return JSON.stringify(v);
    if(typeof v==='string')return JSON.stringify(v);
    if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
    if(typeof v==='object')return '{'+Object.keys(v).sort().filter(k=>!/^_smart/.test(k)&&!/^(updatedAt|createdAt|savedAt|timestamp|cloudUpdatedAt|lastCloudUpdatedAt|lastSync|lastSyncAt|syncedAt|syncAt|generatedAt|modifiedAt)$/i.test(k)).map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
    return JSON.stringify(String(v));
  }
  function fnv(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return ('00000000'+(h>>>0).toString(16)).slice(-8)}
  async function hashText(str){
    try{if(g.crypto&&crypto.subtle&&g.TextEncoder){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,24)}}catch(_){}
    return fnv(str)+'_'+str.length.toString(36);
  }
  function normDate(v){
    if(!v)return'';let s=String(v).trim();
    let m=s.match(/(20\d{2})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?/);if(m)return m[1]+'-'+String(+m[2]).padStart(2,'0')+(m[3]?'-'+String(+m[3]).padStart(2,'0'):'');
    m=s.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})/);if(m)return m[3]+'-'+String(+m[1]).padStart(2,'0')+'-'+String(+m[2]).padStart(2,'0');
    return'';
  }
  const DATE_FIELDS=['date','recordDate','reportDate','testDate','effectiveDate','shipmentDate','receiveDate','useDate','snapshotDate','poDate','orderDate','etd','custShip','startDate','endDate','finishDate','as_of_date','sourceDate','period','yearMonth','month'];
  // Business dates used by the server reminder/audit. Technical timestamps are excluded so
  // editing a June-2026 historical record in August does NOT turn it into an August reminder.
  const AUDIT_DATE_FIELDS=['date','recordDate','reportDate','testDate','effectiveDate','shipmentDate','receiveDate','useDate','snapshotDate','poDate','orderDate','etd','custShip','startDate','endDate','finishDate','as_of_date','sourceDate'];
  function auditPeriodsForRecords(rows){
    const out=new Set();
    for(const r of rows||[]){
      for(const k of AUDIT_DATE_FIELDS){const d=normDate(r&&r[k]);if(d)out.add(d.slice(0,7));}
    }
    return [...out].filter(x=>/^20\d{2}-\d{2}$/.test(x)).sort();
  }
  function auditApprovalForRecords(rows){
    const tracked=new Set(),pending=new Set();
    const statusKeys=['approval','approvalStatus','approval_status'];
    for(const r of rows||[]){
      if(!r||typeof r!=='object')continue;
      const key=statusKeys.find(k=>Object.prototype.hasOwnProperty.call(r,k));if(!key)continue;
      const periods=auditPeriodsForRecords([r]);if(!periods.length)continue;
      const v=String(r[key]??'').trim().toLowerCase(),approved=/^(approved|approve|ok|done|effective|signed|pass|passed|已核可|已簽核|核可|通過)$/.test(v)||!!(r.approvedAt||r.approvalDate||r.approvedDate);
      periods.forEach(p=>{tracked.add(p);if(!approved)pending.add(p)});
    }
    return{tracked:[...tracked].sort(),pending:[...pending].sort()};
  }
  const KEY_FIELDS=['id','uuid','recordId','key','detailId','lineNo','line','section','customer','cust','po','orderNo','styleNo','style','item','itemCode','erpCode','partNo','code','color','size','mode','shipmentMode','lotNumber','invoiceNo','invoice','carton','sku','location','supplier','type','stockType','syncType'];
  function recordDate(r){for(const k of DATE_FIELDS){const d=normDate(r&&r[k]);if(d)return d}return''}
  function semanticKey(r){
    if(!r||typeof r!=='object')return stable(r);
    for(const k of ['id','uuid','recordId','detailId'])if(r[k]!=null&&r[k]!=='')return k+':'+String(r[k]);
    // The business date is part of the identity.  Without it, two shipments for the
    // same customer/size/mode in different weeks collapse into one cloud row.
    const parts=[],d=recordDate(r);if(d)parts.push('businessDate='+d);
    for(const k of KEY_FIELDS)if(r[k]!=null&&r[k]!=='')parts.push(k+'='+String(r[k]));
    return parts.length?parts.join('|'):stable(r);
  }
  function bucketKey(r){
    if(r&&r._smartBucket)return 'p:'+String(r._smartBucket).replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,60);
    if(r&&r._vrtEntity)return 'h:'+fnv(semanticKey(r));
    const d=recordDate(r);if(d)return 'm:'+d.slice(0,7);
    const y=String((r&&r.stockYear)||'').match(/^20\d{2}$/);if(y)return 'y:'+y[0];
    return 'h:'+String(parseInt(fnv(semanticKey(r)),16)%32).padStart(2,'0');
  }
  function newer(a,b){
    const tf=x=>{for(const k of ['updatedAt','savedAt','modifiedAt','createdAt','timestamp','testDate','effectiveDate','date']){const d=x&&x[k]&&new Date(x[k]);if(d&&!isNaN(d))return +d}return 0};
    const ta=tf(a),tb=tf(b);if(ta!==tb)return ta>tb?a:b;
    return stable(a).length>=stable(b).length?a:b;
  }
  function mergeRecords(a,b){const m=new Map();for(const r of (a||[]).concat(b||[])){const k=semanticKey(r),old=m.get(k);m.set(k,old?newer(old,r):r)}return [...m.values()]}
  function sortRecords(rs){return [...(rs||[])].sort((a,b)=>{const ka=semanticKey(a),kb=semanticKey(b);if(ka<kb)return-1;if(ka>kb)return 1;const sa=stable(a),sb=stable(b);return sa<sb?-1:sa>sb?1:0})}
  async function buildBuckets(records){
    const m=new Map();for(const r of records||[]){const k=bucketKey(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r)}
    const out={};for(const [k,arr] of [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){const rows=sortRecords(arr),text=stable(rows);out[k]={key:k,records:rows,count:rows.length,hash:await hashText(text)}}return out;
  }
  function hashMap(buckets){const o={};for(const k of Object.keys(buckets||{}))o[k]=buckets[k].hash;return o}
  function countMap(buckets){const o={};for(const k of Object.keys(buckets||{}))o[k]=buckets[k].count;return o}
  function totalCount(m){return Object.values(m||{}).reduce((s,v)=>s+(Number(v)||0),0)}
  function authorizeShrink(tool,reason,ttl){try{sessionStorage.setItem(SHRINK_PREFIX+tool,JSON.stringify({at:Date.now(),until:Date.now()+(Number(ttl)||300000),reason:reason||'explicit-delete'}));return true}catch(_){return false}}
  function shrinkAuthorized(tool){try{const x=JSON.parse(sessionStorage.getItem(SHRINK_PREFIX+tool)||'null');return !!(x&&Number(x.until)>Date.now())}catch(_){return false}}
  function resumeKey(tool){return RESUME_PREFIX+String(tool||'tool')}
  function resumeGet(tool){try{return JSON.parse(localStorage.getItem(resumeKey(tool))||'null')}catch(_){return null}}
  function resumePut(tool,v){try{localStorage.setItem(resumeKey(tool),JSON.stringify(v||{}))}catch(_){}}
  function resumeClear(tool){try{localStorage.removeItem(resumeKey(tool))}catch(_){}}
  function mapsEqual(a,b){a=a||{};b=b||{};const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();if(ka.length!==kb.length)return false;for(let i=0;i<ka.length;i++)if(ka[i]!==kb[i]||String(a[ka[i]]||'')!==String(b[kb[i]]||''))return false;return true}
  function hasMeta(v){return !!(v&&typeof v==='object'&&Object.keys(v).length)}
  function mergeMetaDefault(local,remote){
    // Fresh/mobile devices often have an empty local side-dataset while Cloud already has data.
    // Never let an empty local array/object wipe a populated Cloud metadata set.
    if(local==null||local==='')return remote==null?local:remote;
    if(remote==null||remote==='')return local;
    if(Array.isArray(local)&&Array.isArray(remote)){
      if(!local.length)return remote.slice();if(!remote.length)return local.slice();
      return mergeRecords(remote,local); // union + semantic de-dup; newer row wins
    }
    if(typeof local==='object'&&typeof remote==='object'&&!Array.isArray(local)&&!Array.isArray(remote)){
      const out=Object.assign({},remote);
      for(const k of Object.keys(local))out[k]=Object.prototype.hasOwnProperty.call(remote,k)?mergeMetaDefault(local[k],remote[k]):local[k];
      return out;
    }
    return local;
  }
  async function metaHash(v){return await hashText(stable(v||{}))}

  function openDB(){return new Promise((res,rej)=>{const q=indexedDB.open(DB_NAME,1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(STORE))q.result.createObjectStore(STORE)};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
  function lsKey(tool){return LS_PREFIX+String(tool||'tool')}
  async function stateGet(tool){
    let v=null;
    try{const d=await openDB();try{v=await new Promise((res,rej)=>{const q=d.transaction(STORE,'readonly').objectStore(STORE).get(tool);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error)})}finally{d.close()}}catch(_){}
    if(v)return v;
    try{return JSON.parse(localStorage.getItem(lsKey(tool))||'null')}catch(_){return null}
  }
  async function statePut(tool,v){
    const data=Object.assign({version:VERSION,tool},v||{});
    let idbOk=false;
    try{const d=await openDB();try{await new Promise((res,rej)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(data,tool);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});idbOk=true}finally{d.close()}}catch(_){}
    try{localStorage.setItem(lsKey(tool),JSON.stringify(data))}catch(_){}
    return idbOk;
  }

  const CACHE_DB='VRT_SmartSync_Buckets';
  function cacheOpen(){return new Promise((res,rej)=>{const q=indexedDB.open(CACHE_DB,1);q.onupgradeneeded=()=>q.result.createObjectStore('buckets');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
  const cacheKey=(url,tool,key)=>url.split('?')[0]+'|'+tool+'|'+key;
  async function cacheRead(url,tool,key){const d=await cacheOpen();try{return await new Promise((res,rej)=>{const q=d.transaction('buckets').objectStore('buckets').get(cacheKey(url,tool,key));q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}finally{d.close()}}
  async function cacheSave(url,tool,key,hash,records){const d=await cacheOpen();try{await new Promise((res,rej)=>{const tx=d.transaction('buckets','readwrite');tx.objectStore('buckets').put({hash,records},cacheKey(url,tool,key));tx.oncomplete=res;tx.onabort=tx.onerror=()=>rej(tx.error)})}finally{d.close()}}
  const flights=new Map();
  async function guarded(kind,fn,opts){const key=String((g.VRTPlatform&&g.VRTPlatform.getGasUrl())||opts.url||'')+'|'+opts.tool;while(flights.has(key)){try{await flights.get(key)}catch(_){}}const work=fn(opts);flights.set(key,work);try{return await work}catch(e){status(kind,e.message,'err');throw e}finally{if(flights.get(key)===work)flights.delete(key)}}
  let ui=null;
  let st={push:'待機',pull:'待機',pushType:'idle',pullType:'idle'};
  try{const old=JSON.parse(localStorage.getItem(UI_KEY)||'null');if(old)st=Object.assign(st,old)}catch(_){}
  function persistUI(){try{localStorage.setItem(UI_KEY,JSON.stringify(st))}catch(_){} }
  function ensureUI(){
    if(ui||!document.body)return ui;
    const style=document.createElement('style');style.textContent=`#vrtSmartSyncStatus{position:fixed;right:72px;bottom:12px;z-index:9996;display:flex;flex-direction:column;gap:3px;max-width:min(420px,calc(100vw - 92px));pointer-events:none;font:600 10.5px/1.25 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft JhengHei",sans-serif}#vrtSmartSyncStatus .vrtss{padding:4px 7px;border-radius:8px;background:rgba(15,23,42,.92);color:#cbd5e1;border:1px solid #334155;box-shadow:0 2px 10px #0003;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#vrtSmartSyncStatus .ok{color:#86efac;border-color:#166534}.vrtss.warn{color:#fcd34d;border-color:#92400e}.vrtss.err{color:#fca5a5;border-color:#991b1b}.vrtss.busy{color:#93c5fd;border-color:#1d4ed8}@media(max-width:700px){#vrtSmartSyncStatus{right:68px;bottom:9px;max-width:calc(100vw - 82px);font-size:9.5px}}`;
    document.head.appendChild(style);ui=document.createElement('div');ui.id='vrtSmartSyncStatus';ui.innerHTML='<div id="vrtssPush" class="vrtss">☁↑ 待機</div><div id="vrtssPull" class="vrtss">☁↓ 待機</div>';document.body.appendChild(ui);return ui;
  }
  function paint(){ensureUI();if(!ui)return;for(const dir of ['push','pull']){const e=document.getElementById('vrtss'+(dir==='push'?'Push':'Pull'));if(!e)continue;e.className='vrtss '+(st[dir+'Type']||'');e.textContent=(dir==='push'?'☁↑ ':'☁↓ ')+st[dir]}}
  function status(dir,text,type){st[dir]=String(text||'');st[dir+'Type']=type||'busy';st[dir+'At']=now();persistUI();paint();try{document.querySelectorAll('button,[role="button"],.hicon,.cloud').forEach(b=>{const tx=(b.textContent||'')+' '+(b.id||'')+' '+(b.title||'');if(/☁|cloud|推送|拉取|上傳|下載/i.test(tx))b.title='上傳：'+st.push+'\n拉取：'+st.pull})}catch(_){} }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureUI();paint()});else setTimeout(()=>{ensureUI();paint()},0);

  async function jsonFetch(url,opt){opt=Object.assign({},opt||{});const timeoutMs=Number(opt.vrtTimeoutMs)||45000,retries=Array.isArray(opt.vrtRetryDelays)?opt.vrtRetryDelays:[],onRetry=opt.vrtOnRetry;delete opt.vrtTimeoutMs;delete opt.vrtRetryDelays;delete opt.vrtOnRetry;let attempt=0;for(;;){const controller=typeof AbortController!=='undefined'?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;let r,text;try{r=await _nativeFetch(url,Object.assign({},opt,controller?{signal:controller.signal}:{}));text=await r.text();let j;try{j=JSON.parse(text)}catch(e){const er=new Error(/^\s*</.test(text||'')?'Cloud returned HTML / service busy':'Cloud returned non-JSON');er.retryable=true;throw er}if(!r.ok||(j&&j.ok===false)){const er=new Error((j&&j.error)||(r.status===404?'GAS action/URL not found (HTTP 404)':('HTTP '+r.status)));er.retryable=[429,502,503,504].includes(r.status);throw er}return j}catch(e){const abort=e&&((e.name==='AbortError')||/aborted|timeout/i.test(e.message||''));const retryable=abort||e.retryable||/HTTP (429|502|503|504)|service busy|non-JSON|HTML/i.test(e.message||'');if(retryable&&attempt<retries.length){const delay=Number(retries[attempt++])||0;try{onRetry&&onRetry(attempt,delay,e)}catch(_){};if(delay)await new Promise(r=>setTimeout(r,delay));continue}throw e}finally{if(timer)clearTimeout(timer)}}}
  async function manifest(url,tool,net){
    let cached=null;try{cached=await cacheRead(url,tool,'_metadata')}catch(_){}
    const tag=cached&&cached.hash||'',q=url+(url.includes('?')?'&':'?')+'action=smartManifest&tool='+enc(tool)+(tag?'&metaHash='+enc(tag):'');
    let j;try{j=await jsonFetch(q,Object.assign({redirect:'follow'},net||{}))}catch(getErr){try{j=await jsonFetch(url,Object.assign({method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'smartManifest',tool,metaHash:tag}),redirect:'follow'},net||{}))}catch(postErr){throw new Error('Manifest check failed: '+postErr.message+' / '+getErr.message)}}
    const m=j.data||j;
    if(m.metaUnchanged){if(!cached||cached.hash!==m.metaHash||!Array.isArray(cached.records))throw new Error('本機設定快取不完整，請重試 Pull');m.meta=cached.records[0]||{}}
    if(m.exists&&!m.metaUnchanged){const hash=m.metaHash||await metaHash(m.meta||{});if(!cached||cached.hash!==hash)try{await cacheSave(url,tool,'_metadata',hash,[m.meta||{}])}catch(_){}}
    return m;
  }
  async function auditSent(opts){
    const url=String(opts&&opts.url||'').trim(),tool=String(opts&&opts.tool||'').trim();
    if(!url||!tool)return{ok:false,skipped:true};
    const p={action:'auditSent',tool,auditType:(opts&&opts.type)||'summary'};
    if(opts&&opts.period)p.period=opts.period;
    if(opts&&Array.isArray(opts.periods))p.periods=opts.periods;
    try{return await jsonFetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(p),redirect:'follow'})}
    catch(e){console.warn('VRT auditSent:',e);return{ok:false,error:e.message}}
  }
  async function legacyPull(url,tool,onStatus){
    const mj=await jsonFetch(url+(url.includes('?')?'&':'?')+'action=pull&meta=1&tool='+enc(tool),{redirect:'follow'}),env=mj.data;if(!env)return{records:[],meta:{}};
    let records=[],meta={};
    if(env.chunked&&env.meta){meta=env.meta;const tc=Number(meta.totalChunks)||0;for(let i=0;i<tc;i++){onStatus&&onStatus(`首次基準拉取 ${i+1}/${tc}`);const cj=await jsonFetch(url+(url.includes('?')?'&':'?')+'action=pull&tool='+enc(tool)+'&chunk='+i+(meta.uploadId?'&uploadId='+enc(meta.uploadId):''),{redirect:'follow'});if(!cj.data||!Array.isArray(cj.data.records))throw new Error('Legacy chunk '+(i+1)+' incomplete');records=records.concat(cj.data.records)}}
    else{const p=env.data||env;meta=p||{};records=(p&&p.records)||(p&&p.idbStore&&p.idbStore.records)||(p&&p.idbData&&p.idbData.po_lines)||[]}
    records=Array.isArray(records)?records:[];let sourceRecordCount=records.length;
    if((tool==='smv'||tool==='spareparts')&&g.VRTDomain39){
      const D=g.VRTDomain39,source=Object.assign({},meta.dataMeta||{},meta.data||{}),d=D.unpack(tool,records,Object.assign({},meta,{dataMeta:source}));
      if(tool==='spareparts'){
        sourceRecordCount=Math.max(sourceRecordCount,(source.txns||[]).length,(source.parts||[]).length);
        d.txns=D.mergeRows(d.txns,source.txns||[]);d.maintenance=D.mergeMaintenance(d.maintenance,source.maintenance||source.maintenance39||{});
      }
      records=D.pack(tool,d);sourceRecordCount=Math.max(sourceRecordCount,records.length);meta=D.metaFor(tool,d);
    }else{
      meta=Object.assign({},meta);delete meta.records;
      if(meta.idbStore){meta.idbStore=Object.assign({},meta.idbStore);delete meta.idbStore.records}
      if(meta.idbData&&Array.isArray(meta.idbData.po_lines)){meta.idbData=Object.assign({},meta.idbData);delete meta.idbData.po_lines}
    }
    return{records,meta,sourceRecordCount};
  }

  async function push(opts){
    opts=opts||{};
    const url=String((g.VRTPlatform&&g.VRTPlatform.getGasUrl())||opts.url||'').trim(),tool=opts.tool,records=sortRecords(opts.records||[]),onStatus=opts.onStatus||(()=>{});if(!url)throw new Error('GAS URL missing');
    const localMeta=JSON.parse(JSON.stringify(opts.meta||{}));
    status('push','比對雲端差異…','busy');onStatus('智慧同步：比對雲端差異…');
    const net=opts.network||{},rm=await manifest(url,tool,net),local=await buildBuckets(records),localH=hashMap(local),localC=countMap(local),localMH=await metaHash(localMeta),remoteMeta=(rm&&rm.meta)||{},remoteMH=await metaHash(remoteMeta),last=await stateGet(tool),lastRemote=(last&&last.remoteHashes)||(last&&last.hashes)||{},lastLocal=(last&&last.localHashes)||(last&&last.hashes)||{},lastRMH=(last&&last.remoteMetaHash)||'',lastLMH=(last&&last.localMetaHash)||'',remoteH=(rm&&rm.hashes)||{},remoteC=(rm&&rm.counts)||{};

    if(Object.prototype.hasOwnProperty.call(opts,'expectedLegacyRevision')&&String(opts.expectedLegacyRevision||'')!==String(rm.revision||''))throw new Error('舊雲端已更新，請重新 Pull；本機資料保留');
    if(!rm.exists&&rm.legacy){const legacyCount=Number(rm.legacyCount)||0;if(!Object.prototype.hasOwnProperty.call(opts,'expectedLegacyRevision')){status('push','舊雲端尚未核對｜請先 Pull，本機資料保留','warn');return{ok:false,needsPull:true,legacyBaselineRequired:true,uploaded:0}}if(records.length<legacyCount&&Number(opts.legacyBaselineCount||0)<legacyCount){const msg=`停止：雲端 ${legacyCount} > 本機 ${records.length}，先拉取`;status('push',msg,'warn');throw new Error(`雲端舊資料較多（${legacyCount} > ${records.length}），請先拉取一次再推送`)}}

    // Less-over-more protection. A first/stale client or a parser regression may
    // never replace a larger cloud dataset. Explicit UI delete/clear actions grant
    // a short authorization through Auto Sync; imports do not.
    if(rm.exists&&!opts.forceBaseline){const rt=totalCount(remoteC),bt=totalCount(lastLocal),localShrank=bt>records.length,noBaseline=!bt;if(rt>records.length&&(localShrank||noBaseline)&&!opts.allowShrink&&!shrinkAuthorized(tool)){const msg=`已阻擋少覆多｜雲端 ${rt.toLocaleString()} > 本機 ${records.length.toLocaleString()}｜先拉取核對`;status('push',msg,'warn');onStatus(msg);return{ok:false,needsPull:true,shrinkBlocked:true,cloudCount:rt,recordCount:records.length,uploaded:0}}}

    if(rm.exists&&mapsEqual(localH,remoteH)&&localMH===remoteMH&&!rm.summaryNeedsRefresh){
      await statePut(tool,{remoteHashes:remoteH,remoteCounts:remoteC,localHashes:localH,localCounts:localC,remoteMetaHash:remoteMH,localMetaHash:localMH,lastPushAt:now(),updatedAt:now()});
      const msg=`已是最新｜本機 ${records.length.toLocaleString()}｜上傳 0｜未變 ${records.length.toLocaleString()}`;status('push',msg,'ok');onStatus(msg);return{ok:true,recordCount:records.length,uploaded:0,deleted:0,unchanged:records.length,changedBuckets:0,metaUpdated:false,noChange:true};
    }

    let changed=[],deleted=[],remoteChanged=[],conflicts=[],sameCount=0;
    const keys=new Set([...Object.keys(localH),...Object.keys(remoteH),...Object.keys(lastLocal),...Object.keys(lastRemote)]);
    for(const k of keys){
      const lh=localH[k]||'',rh=remoteH[k]||'',bl=lastLocal[k]||'',br=lastRemote[k]||'';
      if(lh&&rh&&lh===rh){sameCount+=local[k]?local[k].count:0;continue}
      const haveBaseline=!!(bl||br);
      if(!haveBaseline){if(lh&&!rh)changed.push(k);else if(!lh&&rh)remoteChanged.push(k);else if(lh&&rh&&lh!==rh)conflicts.push(k);continue}
      const lc=lh!==bl,rc=rh!==br;
      if(lc&&!rc){if(lh)changed.push(k);else deleted.push(k)}
      else if(!lc&&rc)remoteChanged.push(k);
      else if(lc&&rc){if(lh===rh)sameCount+=local[k]?local[k].count:0;else conflicts.push(k)}
      else if(!lc&&!rc&&lh!==rh){if(lh)changed.push(k);else deleted.push(k)}
    }

    if(opts.forceBaseline){
      changed=Object.keys(localH).sort();
      deleted=Object.keys(remoteH).filter(k=>!localH[k]).sort();
      remoteChanged=[];conflicts=[];
    }
    if(Array.isArray(opts.repairBuckets)&&opts.repairBuckets.length){
      const wanted=new Set(opts.repairBuckets.map(String));
      changed=Object.keys(localH).filter(k=>wanted.has(k)).sort();
      deleted=[];remoteChanged=[];conflicts=[];
    }

    let metaChanged=!!rm.summaryNeedsRefresh||!!opts.forceBaseline||!!(Array.isArray(opts.repairBuckets)&&opts.repairBuckets.length),metaNeedsPull=false,metaConflict=false;
    if(localMH!==remoteMH&&!opts.forceBaseline){
      const haveMetaBaseline=!!(lastLMH||lastRMH);
      if(!haveMetaBaseline){
        if(hasMeta(remoteMeta)&&hasMeta(localMeta))metaNeedsPull=true;
        else if(hasMeta(remoteMeta)&&!hasMeta(localMeta))metaNeedsPull=true;
        else metaChanged=true;
      }else{
        const lc=localMH!==lastLMH,rc=remoteMH!==lastRMH;
        if(lc&&!rc)metaChanged=true;
        else if(!lc&&rc)metaNeedsPull=true;
        else if(lc&&rc){metaNeedsPull=true;metaConflict=true}
        else metaChanged=true;
      }
    }
    if(!opts.forceBaseline&&!opts.repairBuckets&&(remoteChanged.length||conflicts.length||metaNeedsPull)){const msg=`雲端有新變更 ${remoteChanged.length} 區${metaNeedsPull?' + 設定/總表':''}，衝突 ${conflicts.length+(metaConflict?1:0)}；先拉取差異`;status('push',msg,'warn');onStatus(msg);return{ok:false,needsPull:true,remoteChanged,conflicts,metaNeedsPull,recordCount:records.length}}
    if(!changed.length&&!deleted.length&&!metaChanged){
      await statePut(tool,{remoteHashes:remoteH,remoteCounts:remoteC,localHashes:localH,localCounts:localC,remoteMetaHash:remoteMH,localMetaHash:localMH,lastPushAt:now(),updatedAt:now()});
      const msg=`已是最新｜上傳 0｜未變 ${records.length.toLocaleString()}`;status('push',msg,'ok');onStatus(msg);return{ok:true,recordCount:records.length,uploaded:0,deleted:0,unchanged:records.length,metaUpdated:false,noChange:true};
    }

    /* Optional per-page upload resume. Successful smartBucket calls are staged by the same uploadId,
       so a later retry can continue from the failed bucket instead of resending bucket 1. */
    const priority=Array.isArray(opts.priorityBuckets)?opts.priorityBuckets:[];changed.sort((a,b)=>{const ai=priority.indexOf(a),bi=priority.indexOf(b);if(ai>=0||bi>=0)return(ai<0?9999:ai)-(bi<0?9999:bi);return a.localeCompare(b)});
    const contentHashes={};for(const k of changed)contentHashes[k]=await hashText(JSON.stringify(local[k].records));
    const baseRevision=rm.revision||rm.updatedAt||'',resumeSig=await hashText(stable({baseRevision,changed:changed.map(k=>[k,localH[k],localC[k],contentHashes[k]]),deleted,localMH}));
    let resume=opts.resumeBuckets?resumeGet(tool):null;
    if(!resume||resume.signature!==resumeSig||String(resume.baseRevision||'')!==String(baseRevision||'')){resume={uploadId:Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),signature:resumeSig,baseRevision,changed:changed.slice(),completed:{}};if(opts.resumeBuckets)resumePut(tool,resume)}
    const uploadId=resume.uploadId,completed=resume.completed||{};let sent=0;
    for(let i=0;i<changed.length;i++){
      const k=changed[i],b=local[k];sent+=b.count;
      if(opts.resumeBuckets&&completed[k]===contentHashes[k]){const pendingCount=changed.slice(i+1).reduce((n,key)=>n+Number(local[key]?.count||0),0);status('push',`沿用已完成 ${i+1}/${changed.length} · ${k}`,'busy');onStatus(`沿用已完成 ${i+1}/${changed.length} · 待上傳 ${pendingCount}`);continue}
      status('push',`上傳變更 ${i+1}/${changed.length} · ${k}`,'busy');onStatus(`上傳變更 ${i+1}/${changed.length} · ${b.count} 筆`);
      await jsonFetch(url,Object.assign({method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'smartBucket',tool,uploadId,bucket:k,hash:b.hash,contentHash:contentHashes[k],count:b.count,records:b.records}),redirect:'follow'},net));
      if(opts.resumeBuckets){completed[k]=contentHashes[k];resume.completed=completed;resume.changed=changed.slice();resumePut(tool,resume)}
      const pendingCount=changed.slice(i+1).reduce((n,key)=>n+Number(local[key]?.count||0),0);onStatus(`已完成 ${sent}｜待上傳 ${pendingCount}`);
    }
    // PROD cloud transport only: do not create summary/approval reminder ledger entries.
    status('push',`提交雲端索引／Manifest… · ${changed.length} 區`,'busy');onStatus(`提交雲端索引／Manifest… · ${changed.length} 區`);
    let commit;
    try{
      commit=await jsonFetch(url,Object.assign({method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'smartCommit',tool,uploadId,baseRevision,contentHashes,allowShrink:!!opts.forceBaseline||!!opts.allowShrink||shrinkAuthorized(tool),hashes:localH,counts:localC,deleted,changedBuckets:changed,recordCount:records.length,meta:localMeta,summary:(localMeta&&localMeta.summary)||opts.summary||{}}),redirect:'follow'},net));
    }catch(e){
      const msg=/PRIOR_WRITE_NEEDS_RECONCILIATION|single writer|protected/i.test(String(e&&e.message||''))?'受保護，需由 Windows 任務上傳；最後 Manifest 未提交':('Manifest 提交失敗：'+String(e&&e.message||e));
      status('push',msg,'err');onStatus(msg);throw e;
    }
    status('push','Manifest 已提交，正在記錄本機同步基準…','busy');onStatus('Manifest 已提交，正在記錄本機同步基準…');
    if(opts.resumeBuckets)resumeClear(tool);
    try{await limitWait(cacheSave(url,tool,'_metadata',localMH,[localMeta]),5000,'local cache save')}catch(e){console.warn('[VRT SmartSync] cache save skipped',e)}
    const statePayload={remoteHashes:localH,remoteCounts:localC,localHashes:localH,localCounts:localC,remoteMetaHash:localMH,localMetaHash:localMH,lastPushAt:now(),updatedAt:now(),bucketBaseline:true};
    try{await limitWait(statePut(tool,statePayload),5000,'local baseline save')}catch(e){try{localStorage.setItem(lsKey(tool),JSON.stringify(Object.assign({version:VERSION,tool},statePayload)))}catch(_){} status('push','雲端完成｜本機基準改用 localStorage 保存','warn');onStatus('雲端已完成；IndexedDB 較慢，已改用 localStorage 保存同步基準')}
    const warnings=(commit.data&&commit.data.warnings)||[];
    const delCount=deleted.reduce((sum,k)=>sum+(Number(remoteC[k])||0),0),unchanged=Math.max(0,records.length-sent);
    const msg=`完成｜本機 ${records.length.toLocaleString()}｜上傳 ${sent.toLocaleString()}${metaChanged?'｜設定/總表已更新':''}｜刪除 ${delCount.toLocaleString()}｜未變 ${unchanged.toLocaleString()}`;status('push',msg+(warnings.length?'｜'+warnings.join('；'):''),warnings.length?'warn':'ok');onStatus(msg);return{ok:true,warnings,recordCount:records.length,uploaded:sent,deleted:delCount,unchanged,changedBuckets:changed.length,metaUpdated:metaChanged};
  }

  async function pull(opts){
    opts=opts||{};
    const url=String((g.VRTPlatform&&g.VRTPlatform.getGasUrl())||opts.url||'').trim(),tool=opts.tool,localRecords=sortRecords(opts.localRecords||[]),onStatus=opts.onStatus||(()=>{});if(!url)throw new Error('GAS URL missing');
    const metaProvided=Object.prototype.hasOwnProperty.call(opts,'meta'),localMeta=metaProvided?(opts.meta||{}):{},mergeMeta=typeof opts.mergeMeta==='function'?opts.mergeMeta:mergeMetaDefault;
    status('pull','比對雲端差異…','busy');onStatus('智慧拉取：比對雲端差異…');
    const net=opts.network||{},rm=await manifest(url,tool,net);
    if(!rm.exists&&rm.legacy){
      // Never repeat the same legacy full download after a successful local baseline save.
      const lastLegacy=await stateGet(tool), lm=rm.legacyMeta||{}, legacyCount=Number(rm.legacyCount)||0;
      const legacySig=await hashText(stable({count:legacyCount,timestamp:lm.timestamp||lm.updatedAt||lm.uploadedAt||lm.savedAt||'',uploadId:lm.uploadId||'',fileName:lm.fileName||lm.source||'',summary:lm.summary||{}}));
      if(lastLegacy&&lastLegacy.legacySig===legacySig&&Math.max(localRecords.length,Number(lastLegacy.legacyBaselineCount||0))>=legacyCount&&Number(lastLegacy.legacyLocalCount||0)<=localRecords.length){
        status('pull','舊雲端基準未變｜下載 0｜正在升級同步格式…','busy');
        const targetMeta=metaProvided?localMeta:(opts.metaBuilder?await opts.metaBuilder(localRecords,lm):lm);
        try{
          const base=await push({url,tool,records:localRecords,meta:targetMeta,expectedLegacyRevision:rm.revision||'',legacyBaselineCount:lastLegacy.legacyBaselineCount||0,onStatus:m=>onStatus(m)});
          if(!base||base.ok===false)throw new Error('同步格式尚未升級，保留本機基準待重試');
          const mb=await buildBuckets(localRecords),mh=hashMap(mb),mc=countMap(mb),mmh=await metaHash(targetMeta);
          await statePut(tool,{remoteHashes:mh,remoteCounts:mc,localHashes:mh,localCounts:mc,remoteMetaHash:mmh,localMetaHash:mmh,lastPullAt:now(),updatedAt:now(),legacySig,legacyLocalCount:localRecords.length,legacyMigratedAt:now()});
          status('pull',`基準已升級｜下載 0｜未變 ${localRecords.length.toLocaleString()}`,'ok');
          return{ok:true,records:localRecords,meta:targetMeta,migrated:true,pushResult:base,downloaded:0,unchanged:localRecords.length,pendingUpload:0,noRepeatLegacy:true}
        }catch(e){
          await statePut(tool,Object.assign({},lastLegacy,{legacySig,legacyLocalCount:localRecords.length,legacyRetryAt:now(),updatedAt:now()}));
          status('pull','舊基準未變｜下載 0｜同步格式待重試','warn');
          return{ok:true,records:localRecords,meta:lm,downloaded:0,unchanged:localRecords.length,pendingUpload:0,legacyRetry:true}
        }
      }
      status('pull','首次升級：拉取舊雲端基準…','busy');
      const lp=await legacyPull(url,tool,m=>{status('pull',m,'busy');onStatus(m)}),merged=mergeRecords(localRecords,lp.records),legacyMeta=lp.meta||{};
      if(Number(rm.legacyCount||0)>Math.max(lp.sourceRecordCount||0,lp.records.length))throw new Error('舊雲端資料尚未完整下載，本機資料保留');
      if(opts.apply)await opts.apply(merged,legacyMeta);
      await statePut(tool,{legacySig,legacyBaselineCount:Math.max(lp.sourceRecordCount||0,lp.records.length),legacyLocalCount:merged.length,legacyBaselineAt:now(),lastPullAt:now(),updatedAt:now()});
      let base=null;
      try{
        const targetMeta=metaProvided?mergeMeta(localMeta,legacyMeta):(opts.metaBuilder?await opts.metaBuilder(merged,legacyMeta):legacyMeta);
        base=await push({url,tool,records:merged,meta:targetMeta,expectedLegacyRevision:rm.revision||'',legacyBaselineCount:Math.max(lp.sourceRecordCount||0,lp.records.length),onStatus:m=>onStatus(m)});
        if(!base||base.ok===false)throw new Error('同步格式尚未升級，保留本機基準待重試');
        const mb=await buildBuckets(merged),mh=hashMap(mb),mc=countMap(mb),mmh=await metaHash(targetMeta);
        await statePut(tool,{remoteHashes:mh,remoteCounts:mc,localHashes:mh,localCounts:mc,remoteMetaHash:mmh,localMetaHash:mmh,lastPullAt:now(),updatedAt:now(),legacySig,legacyBaselineCount:Math.max(lp.sourceRecordCount||0,lp.records.length),legacyLocalCount:merged.length,legacyMigratedAt:now()});
        status('pull',`首次基準完成｜${merged.length.toLocaleString()} 筆`,'ok');
      }catch(e){
        await statePut(tool,{legacySig,legacyBaselineCount:Math.max(lp.sourceRecordCount||0,lp.records.length),legacyLocalCount:merged.length,legacyBaselineAt:now(),legacyRetryAt:now(),lastPullAt:now(),updatedAt:now()});
        status('pull',`舊資料已保存本機｜${merged.length.toLocaleString()} 筆｜格式升級待重試`,'warn');
      }
      return{ok:true,records:merged,meta:legacyMeta,migrated:!!(base&&base.ok),legacyRetry:!base||base.ok===false,pushResult:base,downloaded:lp.records.length,unchanged:0,pendingUpload:0}
    }
    if(!rm.exists){status('pull','雲端尚無資料','warn');return{ok:false,noCloud:true,records:localRecords,meta:{}}}

    const local=await buildBuckets(localRecords),localH=hashMap(local),localC=countMap(local),last=await stateGet(tool),lastRemote=(last&&last.remoteHashes)||(last&&last.hashes)||{},lastLocal=(last&&last.localHashes)||(last&&last.hashes)||{},remoteH=rm.hashes||{},remoteC=rm.counts||{},remoteMeta=rm.meta||{},remoteMH=await metaHash(remoteMeta),localMH=metaProvided?await metaHash(localMeta):(last&&last.localMetaHash)||'',lastRMH=(last&&last.remoteMetaHash)||'',lastLMH=(last&&last.localMetaHash)||'';

    let effectiveMeta=remoteMeta,applyMeta=false,pendingMeta=false,metaConflict=false;
    if(metaProvided){
      if(localMH===remoteMH){effectiveMeta=localMeta}
      else{
        const have=!!(lastLMH||lastRMH);
        if(have){const lc=localMH!==lastLMH,rc=remoteMH!==lastRMH;if(lc&&!rc){effectiveMeta=localMeta;pendingMeta=true}else if(!lc&&rc){effectiveMeta=remoteMeta;applyMeta=true}else if(lc&&rc){effectiveMeta=mergeMeta(localMeta,remoteMeta);applyMeta=true;pendingMeta=true;metaConflict=true}else{effectiveMeta=localMeta;pendingMeta=true}}
        else{effectiveMeta=mergeMeta(localMeta,remoteMeta);applyMeta=true;pendingMeta=hasMeta(localMeta)&&localMH!==remoteMH;metaConflict=hasMeta(localMeta)&&hasMeta(remoteMeta)&&localMH!==remoteMH}
      }
    }else if(!lastRMH||remoteMH!==lastRMH){effectiveMeta=remoteMeta;applyMeta=true}

    if(mapsEqual(localH,remoteH)){
      if(applyMeta&&opts.apply)await opts.apply(localRecords,effectiveMeta);
      const effMH=await metaHash(effectiveMeta);
      await statePut(tool,{remoteHashes:remoteH,remoteCounts:remoteC,localHashes:localH,localCounts:localC,remoteMetaHash:remoteMH,localMetaHash:effMH,lastPullAt:now(),updatedAt:now()});
      const msg=pendingMeta?`已檢查｜下載 0｜資料未變 ${localRecords.length.toLocaleString()}｜設定待上傳`:`已是最新｜本機 ${localRecords.length.toLocaleString()}｜下載 0｜未變 ${localRecords.length.toLocaleString()}`;status('pull',msg,pendingMeta?'warn':'ok');onStatus(msg);return{ok:true,records:localRecords,meta:effectiveMeta,downloaded:0,unchanged:localRecords.length,pendingUpload:0,pendingMetaUpload:pendingMeta,conflicts:metaConflict?1:0,noChange:!applyMeta&&!pendingMeta};
    }
    if(last&&mapsEqual(remoteH,lastRemote)&&mapsEqual(localH,lastLocal)&&remoteMH===lastRMH&&(!metaProvided||localMH===lastLMH)){
      // v4.7: do not suppress a Pull merely because both manifests are unchanged since the
      // previous check. If a differing bucket has the same-or-more cloud rows, the cloud
      // can contain records this browser is missing (cutting had 42 such rows). Fetch it.
      let pending=0,cloudMayHaveMissing=false;
      const diffKeys=new Set([...Object.keys(localH),...Object.keys(remoteH)]);
      for(const k of diffKeys){
        if((localH[k]||'')===(remoteH[k]||''))continue;
        const lc=Number(localC[k]||0),rc=Number(remoteC[k]||0);
        if(rc>=lc&&rc>0)cloudMayHaveMissing=true;
        if(lc>rc)pending+=lc;
      }
      if(!cloudMayHaveMissing){
        const msg=pending?`已檢查｜沒有新下載｜下載 0｜待上傳 ${pending.toLocaleString()}`:`已同步｜沒有新資料｜下載 0｜本機 ${localRecords.length.toLocaleString()}`;status('pull',msg,pending?'warn':'ok');onStatus(msg);return{ok:true,records:localRecords,meta:effectiveMeta,downloaded:0,unchanged:Math.max(0,localRecords.length-pending),pendingUpload:pending,pendingMetaUpload:false,conflicts:0,noChange:true};
      }
      const msg='偵測到雲端可能有本機缺少資料｜重新核對差異';status('pull',msg,'busy');onStatus(msg);
    }

    const outBuckets={};let downloaded=0,same=0,pendingUpload=0,conflicts=metaConflict?1:0;const pendingBuckets=[],missingBuckets=[];
    const cloudKeys=Object.keys(remoteH).sort().reverse(); // recent periods first
    const needed=cloudKeys.filter(k=>{const lh=localH[k]||'',rh=remoteH[k]||'',bl=lastLocal[k]||'',br=lastRemote[k]||'';return !(lh===rh&&local[k])&&!((bl||br)&&rh===br&&local[k])});
    const ready=new Map();let cursor=0,done=0;
    async function fetchBucket(k){let cached=null;try{cached=await cacheRead(url,tool,k)}catch(_){}
      if(cached&&cached.hash===remoteH[k])return{rows:cached.records,cached:true};
      const bj=await jsonFetch(url+(url.includes('?')?'&':'?')+'action=smartBucket&tool='+enc(tool)+'&bucket='+enc(k)+'&hash='+enc(remoteH[k]),Object.assign({redirect:'follow'},net)),rows=(bj.data&&bj.data.records)||bj.records;
      if(!Array.isArray(rows))throw new Error('Cloud bucket 格式不完整：'+k);
      const response=bj.data||bj;if(response.hash&&response.hash!==remoteH[k])throw new Error('雲端此區已更新，請重試 Pull：'+k);
      if(response.contentHash){const verified=await hashText(JSON.stringify(rows));if(verified!==response.contentHash&&verified!==response.contentHashFallback)throw new Error('Cloud bucket 內容核對失敗：'+k)}
      if(remoteC[k]!=null&&rows.length!==Number(remoteC[k]))throw new Error('Cloud bucket 筆數不一致，保留本機資料：'+k);
      await cacheSave(url,tool,k,remoteH[k],rows);return{rows,cached:false};
    }
    // A maximum of three simultaneous read requests; every completed bucket survives interruption.
    await Promise.all(Array.from({length:Math.min(3,needed.length)},async()=>{while(cursor<needed.length){const k=needed[cursor++];try{ready.set(k,await fetchBucket(k));done++;status('pull',`已接收／快取 ${done}/${needed.length} 區 · 本機 ${localRecords.length.toLocaleString()} 筆`,'busy');onStatus(`增量下載 ${done}/${needed.length} 區`)}catch(e){missingBuckets.push({bucket:k,error:String(e&&e.message||e),cloudCount:Number(remoteC[k]||0),localCount:Number(localC[k]||0)});status('pull',`缺少／無法讀取 ${k}，其餘區塊繼續`,'warn');onStatus(`缺少下載區塊 ${k}｜其餘區塊繼續`)}}}));
    for(let i=0;i<cloudKeys.length;i++){
      const k=cloudKeys[i],lh=localH[k]||'',rh=remoteH[k]||'',bl=lastLocal[k]||'',br=lastRemote[k]||'';
      if(lh===rh&&local[k]){outBuckets[k]=local[k].records;same+=local[k].count;continue}
      const haveBaseline=!!(bl||br);
      if(haveBaseline){const localChanged=lh!==bl,cloudChanged=rh!==br;if(!cloudChanged&&localChanged&&local[k]){outBuckets[k]=local[k].records;pendingUpload+=local[k].count;pendingBuckets.push({bucket:k,count:local[k].count,reason:'local-changed'});continue}}
      status('pull',`下載變更 ${i+1}/${cloudKeys.length} · ${k}`,'busy');onStatus(`下載變更 · ${k}`);
      const received=ready.get(k);if(!received){
        // Manifest may reference a bucket whose staged content never committed. Preserve local rows
        // and continue reconciling every other bucket instead of failing the whole Pull.
        if(local[k]){outBuckets[k]=local[k].records;pendingBuckets.push({bucket:k,count:local[k].count,reason:'cloud-bucket-missing'});pendingUpload+=local[k].count;}
        continue;
      }
      const remoteRows=received.rows;if(received.cached)same+=remoteRows.length;else downloaded+=remoteRows.length;
      const localChanged=haveBaseline?(lh!==bl):!!lh,cloudChanged=haveBaseline?(rh!==br):true;
      if(haveBaseline&&!localChanged&&!cloudChanged&&local[k]&&lh!==rh){
        // A previous manifest-only check can leave a stale mismatch recorded as a baseline.
        // Reconcile the actual rows now instead of forever calling the whole local bucket "pending".
        const mergedRows=mergeRecords(local[k].records,remoteRows),mb=await buildBuckets(mergedRows),mh=(mb[k]&&mb[k].hash)||'';
        outBuckets[k]=mergedRows;if(mh!==rh){pendingUpload+=mergedRows.length;pendingBuckets.push({bucket:k,count:mergedRows.length,reason:'reconciled-local-extra'})}
      }else if(localChanged&&cloudChanged&&local[k]&&lh!==rh){outBuckets[k]=mergeRecords(local[k].records,remoteRows);conflicts++;pendingUpload+=outBuckets[k].length;pendingBuckets.push({bucket:k,count:outBuckets[k].length,reason:'both-changed'})}else outBuckets[k]=remoteRows;
    }
    for(const k of Object.keys(local)){
      if(remoteH[k])continue;const lh=localH[k]||'',bl=lastLocal[k]||'',br=lastRemote[k]||'',haveBaseline=!!(bl||br);
      if(haveBaseline&&bl&&lh===bl&&br){/* cloud deleted unchanged local bucket */}
      else{outBuckets[k]=local[k].records;pendingUpload+=local[k].count;pendingBuckets.push({bucket:k,count:local[k].count,reason:'local-only'})}
    }
    const merged=sortRecords(Object.values(outBuckets).flat());
    let actual=merged;if(opts.apply){const applied=await opts.apply(merged,effectiveMeta);if(Array.isArray(applied))actual=applied}
    const mb=await buildBuckets(actual),mergedH=hashMap(mb),mergedC=countMap(mb),effMH=await metaHash(effectiveMeta);
    await statePut(tool,{remoteHashes:remoteH,remoteCounts:remoteC,localHashes:mergedH,localCounts:mergedC,remoteMetaHash:remoteMH,localMetaHash:effMH,lastPullAt:now(),updatedAt:now()});
    const normalizedAway=Math.max(0,merged.length-actual.length);let msg=`完成｜本機 ${actual.length.toLocaleString()}｜下載 ${downloaded.toLocaleString()}｜未變 ${same.toLocaleString()}`;if(normalizedAway)msg+=`｜去重 ${normalizedAway.toLocaleString()}`;if(pendingUpload)msg+=`｜待上傳 ${pendingUpload.toLocaleString()}`;if(pendingMeta)msg+='｜設定待上傳';if(conflicts)msg+=`｜合併衝突 ${conflicts}`;if(missingBuckets.length)msg+=`｜雲端缺區 ${missingBuckets.length}`;status('pull',(missingBuckets.length?'⚠ ':'')+msg,(conflicts||missingBuckets.length)?'warn':(pendingUpload||pendingMeta?'warn':'ok'));onStatus(msg);return{ok:true,records:actual,rawMergedCount:merged.length,normalizedAway,meta:effectiveMeta,downloaded,unchanged:same,pendingUpload,pendingBuckets,pendingMetaUpload:pendingMeta,conflicts,missingBuckets,partial:missingBuckets.length>0};
  }

  // Universal status for legacy/non-smart requests. Smart requests are handled above.
  g.fetch=async function(input,init){
    let url='',method='GET',action='',tool='';try{url=typeof input==='string'?input:input.url;method=String((init&&init.method)||'GET').toUpperCase();const u=new URL(url,location.href);action=u.searchParams.get('action')||'';tool=u.searchParams.get('tool')||'';if(method==='POST'&&init&&init.body){try{const p=JSON.parse(init.body);action=p.action||action;tool=p.tool||tool}catch(_){} }}catch(_){}
    const isGas=/script\.google\.com|script\.googleusercontent\.com/.test(url),smart=/^smart/.test(action);
    if(isGas&&!smart){const dir=method==='POST'?'push':(action==='pull'||/get|download|fetch/i.test(action)?'pull':'');if(dir)status(dir,(dir==='push'?'上傳中':'拉取中')+(tool?' · '+tool:''),'busy');try{const r=await _nativeFetch(input,init);if(dir&&r.ok)status(dir,(dir==='push'?'已送出':'已收到')+(tool?' · '+tool:''),'ok');else if(dir&&!r.ok)status(dir,'HTTP '+r.status,'err');return r}catch(e){if(dir)status(dir,'失敗 · '+e.message,'err');throw e}}
    return _nativeFetch(input,init);
  };

  g.VRTSmartSync={version:VERSION,status,push:opts=>guarded('push',push,opts||{}),pull:opts=>guarded('pull',pull,opts||{}),auditSent,buildBuckets,semanticKey,bucketKey,mergeRecords,stable,stateGet,statePut,authorizeShrink,auditPeriodsForRecords,auditApprovalForRecords};
})(window);
