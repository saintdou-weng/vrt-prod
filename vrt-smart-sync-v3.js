/* VRT Smart Sync v3.0 — incremental bucket sync + universal cloud status
   - Large/history datasets: upload/download only changed buckets.
   - Small/snapshot modules may keep their existing full snapshot protocol; the universal
     status strip still shows push/pull progress and result.
*/
(function(g){
  'use strict';
  if(g.VRTSmartSync) return;
  const DB_NAME='VRT_SmartSync_v3', STORE='sync_state', VERSION='3.0';
  const _nativeFetch=g.fetch.bind(g);
  const enc=s=>encodeURIComponent(String(s||''));
  const now=()=>new Date().toISOString();

  function stable(v){
    if(v===null||v===undefined)return 'null';
    if(typeof v==='number'||typeof v==='boolean')return JSON.stringify(v);
    if(typeof v==='string')return JSON.stringify(v);
    if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
    if(typeof v==='object')return '{'+Object.keys(v).sort().filter(k=>!/^_smart/.test(k)).map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
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
  const DATE_FIELDS=['date','recordDate','reportDate','testDate','effectiveDate','shipmentDate','receiveDate','useDate','snapshotDate','poDate','orderDate','etd','custShip','startDate','endDate','finishDate','as_of_date','updatedAt','createdAt','savedAt'];
  const KEY_FIELDS=['id','uuid','recordId','key','detailId','lineNo','line','section','customer','cust','po','orderNo','styleNo','style','item','itemCode','erpCode','partNo','code','color','size','lotNumber','invoiceNo','invoice','carton','sku','location','supplier','type','stockType'];
  function recordDate(r){for(const k of DATE_FIELDS){const d=normDate(r&&r[k]);if(d)return d}return''}
  function semanticKey(r){
    if(!r||typeof r!=='object')return stable(r);
    for(const k of ['id','uuid','recordId','detailId'])if(r[k]!=null&&r[k]!=='')return k+':'+String(r[k]);
    const parts=[];for(const k of KEY_FIELDS)if(r[k]!=null&&r[k]!=='')parts.push(k+'='+String(r[k]));
    return parts.length?parts.join('|'):stable(r);
  }
  function bucketKey(r){
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
  function sortRecords(rs){return [...(rs||[])].sort((a,b)=>{const ka=semanticKey(a),kb=semanticKey(b);return ka<kb?-1:ka>kb?1:stable(a)<stable(b)?-1:1})}
  async function buildBuckets(records){
    const m=new Map();for(const r of records||[]){const k=bucketKey(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r)}
    const out={};for(const [k,arr] of [...m.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){const rows=sortRecords(arr),text=stable(rows);out[k]={key:k,records:rows,count:rows.length,hash:await hashText(text)}}return out;
  }
  function openDB(){return new Promise((res,rej)=>{const q=indexedDB.open(DB_NAME,1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(STORE))q.result.createObjectStore(STORE)};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
  async function stateGet(tool){try{const d=await openDB();return await new Promise((res,rej)=>{const q=d.transaction(STORE,'readonly').objectStore(STORE).get(tool);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error)})}catch(_){return null}}
  async function statePut(tool,v){try{const d=await openDB();await new Promise((res,rej)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,tool);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(_){} }

  let ui=null, st={push:'待機',pull:'待機',pushType:'idle',pullType:'idle'};
  function ensureUI(){
    if(ui||!document.body)return ui;
    const style=document.createElement('style');style.textContent=`#vrtSmartSyncStatus{position:fixed;right:72px;bottom:12px;z-index:9996;display:flex;flex-direction:column;gap:3px;max-width:min(370px,calc(100vw - 92px));pointer-events:none;font:600 10.5px/1.25 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft JhengHei",sans-serif}#vrtSmartSyncStatus .vrtss{padding:4px 7px;border-radius:8px;background:rgba(15,23,42,.92);color:#cbd5e1;border:1px solid #334155;box-shadow:0 2px 10px #0003;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#vrtSmartSyncStatus .ok{color:#86efac;border-color:#166534}.vrtss.warn{color:#fcd34d;border-color:#92400e}.vrtss.err{color:#fca5a5;border-color:#991b1b}.vrtss.busy{color:#93c5fd;border-color:#1d4ed8}@media(max-width:700px){#vrtSmartSyncStatus{right:68px;bottom:9px;max-width:calc(100vw - 82px);font-size:9.5px}}`;
    document.head.appendChild(style);ui=document.createElement('div');ui.id='vrtSmartSyncStatus';ui.innerHTML='<div id="vrtssPush" class="vrtss">☁↑ 待機</div><div id="vrtssPull" class="vrtss">☁↓ 待機</div>';document.body.appendChild(ui);return ui;
  }
  function paint(){ensureUI();if(!ui)return;for(const dir of ['push','pull']){const e=document.getElementById('vrtss'+(dir==='push'?'Push':'Pull'));if(!e)continue;e.className='vrtss '+(st[dir+'Type']||'');e.textContent=(dir==='push'?'☁↑ ':'☁↓ ')+st[dir]}}
  function status(dir,text,type){st[dir]=String(text||'');st[dir+'Type']=type||'busy';paint();try{document.querySelectorAll('button,[role="button"]').forEach(b=>{const tx=(b.textContent||'')+' '+(b.id||'');if(/☁|cloud/i.test(tx))b.title='上傳：'+st.push+'\n拉取：'+st.pull})}catch(_){} }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureUI();paint()});else setTimeout(()=>{ensureUI();paint()},0);

  async function jsonFetch(url,opt){const r=await _nativeFetch(url,opt||{});const text=await r.text();let j;try{j=JSON.parse(text)}catch(e){throw new Error('Cloud returned non-JSON: '+text.slice(0,80))}if(!r.ok||j&&j.ok===false)throw new Error(j&&j.error||('HTTP '+r.status));return j}
  async function manifest(url,tool){const j=await jsonFetch(url+(url.includes('?')?'&':'?')+'action=smartManifest&tool='+enc(tool),{redirect:'follow'});return j.data||j}
  async function legacyPull(url,tool,onStatus){const mj=await jsonFetch(url+'?action=pull&meta=1&tool='+enc(tool),{redirect:'follow'}),env=mj.data;if(!env)return{records:[],meta:{}};let records=[],meta={};if(env.chunked&&env.meta){meta=env.meta;const tc=Number(meta.totalChunks)||0;for(let i=0;i<tc;i++){onStatus&&onStatus(`首次基準拉取 ${i+1}/${tc}`);const cj=await jsonFetch(url+'?action=pull&tool='+enc(tool)+'&chunk='+i+(meta.uploadId?'&uploadId='+enc(meta.uploadId):''),{redirect:'follow'});if(!cj.data||!Array.isArray(cj.data.records))throw new Error('Legacy chunk '+(i+1)+' incomplete');records=records.concat(cj.data.records)}}else{const p=env.data||env;meta=p||{};records=(p&&p.records)||(p&&p.idbStore&&p.idbStore.records)||(p&&p.idbData&&p.idbData.po_lines)||[];}return{records:Array.isArray(records)?records:[],meta}}

  async function push(opts){
    const url=(opts.url||'').trim(),tool=opts.tool,records=sortRecords(opts.records||[]),onStatus=opts.onStatus||(()=>{});if(!url)throw new Error('GAS URL missing');
    status('push','比對雲端差異…','busy');onStatus('智慧同步：比對雲端差異…');
    let rm=await manifest(url,tool),local=await buildBuckets(records),last=await stateGet(tool),lastH=(last&&last.hashes)||{},remoteH=(rm&&rm.hashes)||{},remoteC=(rm&&rm.counts)||{};
    if(!rm.exists&&rm.legacy){const legacyCount=Number(rm.legacyCount)||0;if(records.length<legacyCount){status('push',`停止：雲端 ${legacyCount} > 本機 ${records.length}，先拉取`,'warn');throw new Error(`雲端舊資料較多（${legacyCount} > ${records.length}），請先拉取一次再推送`)}remoteH={};lastH={};}
    let changed=[],deleted=[],remoteChanged=[],conflicts=[],sameCount=0;
    const keys=new Set([...Object.keys(local),...Object.keys(remoteH)]);
    for(const k of keys){const lh=local[k]&&local[k].hash,rh=remoteH[k]||'',bh=lastH[k]||'';if(lh&&rh&&lh===rh){sameCount+=local[k].count;continue}if(!bh){if(lh&&!rh){changed.push(k);continue}if(!lh&&rh){remoteChanged.push(k);continue}if(lh&&rh&&lh!==rh){conflicts.push(k);continue}}else{const lc=lh!==bh,rc=rh!==bh;if(lc&&!rc){if(lh)changed.push(k);else deleted.push(k)}else if(!lc&&rc){remoteChanged.push(k)}else if(lc&&rc&&lh!==rh){conflicts.push(k)}else if(lh===rh){sameCount+=local[k]?local[k].count:0}}}
    if(remoteChanged.length||conflicts.length){const msg=`雲端有新變更 ${remoteChanged.length} 區，衝突 ${conflicts.length} 區；請先拉取`;status('push',msg,'warn');onStatus(msg);return{ok:false,needsPull:true,remoteChanged,conflicts,recordCount:records.length}}
    const uploadId=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);let sent=0;
    for(let i=0;i<changed.length;i++){const k=changed[i],b=local[k];status('push',`上傳變更 ${i+1}/${changed.length} · ${k}`,'busy');onStatus(`上傳變更 ${i+1}/${changed.length} · ${b.count} 筆`);await jsonFetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'smartBucket',tool,uploadId,bucket:k,hash:b.hash,count:b.count,records:b.records}),redirect:'follow'});sent+=b.count}
    const hashes={},counts={};for(const k of Object.keys(local)){hashes[k]=local[k].hash;counts[k]=local[k].count}
    await jsonFetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'smartCommit',tool,uploadId,hashes,counts,deleted,recordCount:records.length,meta:opts.meta||{},summary:(opts.meta&&opts.meta.summary)||opts.summary||{}}),redirect:'follow'});
    await statePut(tool,{hashes,counts,updatedAt:now()});const delCount=deleted.reduce((s,k)=>s+(Number(remoteC[k])||0),0),unchanged=Math.max(0,records.length-sent);
    const msg=`完成｜本機 ${records.length.toLocaleString()}｜上傳範圍 ${sent.toLocaleString()}｜刪除 ${delCount.toLocaleString()}｜未變 ${unchanged.toLocaleString()}`;status('push',msg,'ok');onStatus(msg);return{ok:true,recordCount:records.length,uploaded:sent,deleted:delCount,unchanged,changedBuckets:changed.length};
  }

  async function pull(opts){
    const url=(opts.url||'').trim(),tool=opts.tool,localRecords=sortRecords(opts.localRecords||[]),onStatus=opts.onStatus||(()=>{});if(!url)throw new Error('GAS URL missing');
    status('pull','比對雲端差異…','busy');onStatus('智慧拉取：比對雲端差異…');let rm=await manifest(url,tool);
    if(!rm.exists&&rm.legacy){status('pull','首次升級：拉取舊雲端基準…','busy');const lp=await legacyPull(url,tool,m=>{status('pull',m,'busy');onStatus(m)}),merged=mergeRecords(localRecords,lp.records);onStatus(`首次基準合併：本機 ${localRecords.length} + 雲端 ${lp.records.length} → ${merged.length}`);if(opts.apply)await opts.apply(merged,lp.meta||{});const base=await push({url,tool,records:merged,meta:opts.metaBuilder?await opts.metaBuilder(merged,lp.meta):opts.meta||{},onStatus:m=>onStatus(m)});status('pull',`首次基準完成｜${merged.length.toLocaleString()} 筆`,'ok');return{ok:true,records:merged,meta:lp.meta||{},migrated:true,pushResult:base}}
    if(!rm.exists){status('pull','雲端尚無資料','warn');return{ok:false,noCloud:true,records:localRecords,meta:{}}}
    const local=await buildBuckets(localRecords),last=await stateGet(tool),lastH=(last&&last.hashes)||{},remoteH=rm.hashes||{},remoteC=rm.counts||{},outBuckets={},downloaded=0,same=0,pendingUpload=0,conflicts=0;
    const cloudKeys=Object.keys(remoteH);
    for(let i=0;i<cloudKeys.length;i++){const k=cloudKeys[i],lh=local[k]&&local[k].hash,rh=remoteH[k],bh=lastH[k]||'';if(lh===rh){outBuckets[k]=local[k].records;same+=local[k].count;continue}const localChanged=bh?lh!==bh:!!lh,cloudChanged=bh?rh!==bh:true;if(localChanged&&!cloudChanged&&local[k]){outBuckets[k]=local[k].records;pendingUpload+=local[k].count;continue}status('pull',`下載變更 ${i+1}/${cloudKeys.length} · ${k}`,'busy');onStatus(`下載變更 · ${k}`);const bj=await jsonFetch(url+'?action=smartBucket&tool='+enc(tool)+'&bucket='+enc(k),{redirect:'follow'}),remoteRows=(bj.data&&bj.data.records)||bj.records||[];downloaded+=remoteRows.length;if(localChanged&&cloudChanged&&local[k]){outBuckets[k]=mergeRecords(local[k].records,remoteRows);conflicts++;pendingUpload+=outBuckets[k].length}else outBuckets[k]=remoteRows}
    for(const k of Object.keys(local)){if(remoteH[k])continue;const bh=lastH[k]||'';if(bh&&local[k].hash===bh){/* cloud deleted unchanged local bucket => delete locally */}else{outBuckets[k]=local[k].records;pendingUpload+=local[k].count}}
    const merged=sortRecords(Object.values(outBuckets).flat());if(opts.apply)await opts.apply(merged,rm.meta||{});await statePut(tool,{hashes:remoteH,counts:remoteC,updatedAt:now()});let msg=`完成｜本機 ${merged.length.toLocaleString()}｜下載 ${downloaded.toLocaleString()}｜未變 ${same.toLocaleString()}`;if(pendingUpload)msg+=`｜待上傳 ${pendingUpload.toLocaleString()}`;if(conflicts)msg+=`｜合併衝突 ${conflicts}`;status('pull',msg,conflicts?'warn':'ok');onStatus(msg);return{ok:true,records:merged,meta:rm.meta||{},downloaded,unchanged:same,pendingUpload,conflicts};
  }

  // Universal status for legacy/full-snapshot modules. Skip smart protocol requests because
  // push()/pull() above provide richer messages themselves.
  g.fetch=async function(input,init){
    let url='',method='GET',action='',tool='';try{url=typeof input==='string'?input:input.url;method=String((init&&init.method)||'GET').toUpperCase();const u=new URL(url,location.href);action=u.searchParams.get('action')||'';tool=u.searchParams.get('tool')||'';if(method==='POST'&&init&&init.body){try{const p=JSON.parse(init.body);action=p.action||action;tool=p.tool||tool}catch(_){} }}catch(_){}
    const isGas=/script\.google\.com|script\.googleusercontent\.com/.test(url),smart=/^smart/.test(action);
    if(isGas&&!smart){const dir=method==='POST'?'push':(action==='pull'?'pull':'');if(dir)status(dir,(dir==='push'?'上傳中':'拉取中')+(tool?' · '+tool:''),'busy');try{const r=await _nativeFetch(input,init);if(dir&&r.ok)status(dir,(dir==='push'?'已送出':'已收到')+(tool?' · '+tool:''),'ok');else if(dir&&!r.ok)status(dir,'HTTP '+r.status,'err');return r}catch(e){if(dir)status(dir,'失敗 · '+e.message,'err');throw e}}
    return _nativeFetch(input,init);
  };

  g.VRTSmartSync={version:VERSION,status,push,pull,buildBuckets,semanticKey,bucketKey,mergeRecords,stable};
})(window);
