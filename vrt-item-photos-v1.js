/* VRT 物品照片 v1.0（2026-11-14）
   Paul 11/14：布料、零件、針、瑕疵、客戶、款式／BOM、出貨、線別／組別…每個「物品頁」都能放參考照片：
   ⭐ 標準照（最正確的那張）＋ ⚠️ 每月不同／異常照（依月份分開、同一張不重複）。另有 📷 照片庫：依類別分頁看全部。
   存放：這台的 IndexedDB（看過就不再下載）＋ 雲端 PROD Smart Sync 的 item_photos（同一個 GAS，不用改後端）。
   雲端只「加」不「刪」：封存＝標記不顯示，雲端筆數不會變少（不會觸發少覆多，也不會沒經同意刪雲端資料）。 */
(function(g){
'use strict';
if(g.VRTPhotos&&g.VRTPhotos.version)return;
const VERSION='1.0.0',TOOL='item_photos',DBN='VRT_ItemPhotos';
const DOMAINS=[
 ['fabric','🧶','布料','Fabric'],['accessory','🧷','輔料','Accessories'],['parts','🔩','零件','Spare parts'],['needle','🪡','針','Needles'],['defect','🔍','瑕疵','Defects'],
 ['customer','👥','客戶','Customers'],['style','📐','款式／BOM','Styles / BOM'],['ship','🚢','成品／出貨','FG / Shipping'],
 ['line','🧵','線別／組別','Lines / Teams'],['machine','⚙️','機台','Machines'],['other','📦','其他','Other']];
const DOM=Object.fromEntries(DOMAINS.map(d=>[d[0],d]));
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normKey=k=>String(k==null?'':k).replace(/[​﻿]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const ymNow=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const isoLocal=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())};
const gasUrl=()=>{try{return String((g.VRTPlatform&&g.VRTPlatform.getGasUrl&&g.VRTPlatform.getGasUrl())||(g.VRT_DEPLOY_CONFIG&&g.VRT_DEPLOY_CONFIG.gasUrl)||'').trim()}catch(_){return ''}};

/* ── 與 Smart Sync 相同的雜湊規則（雲端核對 bucket 用）── */
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
const sortRows=rs=>[...rs].sort((a,b)=>{const ka='id:'+a.id,kb='id:'+b.id;return ka<kb?-1:ka>kb?1:0});
const bucketHash=rows=>hashText(stable(sortRows(rows)));
const clean=r=>{const o={};for(const k of Object.keys(r))if(k!=='_pend')o[k]=r[k];return o};

/* ── IndexedDB ── */
let dbp=null;
function db(){return dbp||(dbp=new Promise((res,rej)=>{const q=indexedDB.open(DBN,1);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains('idx'))d.createObjectStore('idx',{keyPath:'id'});if(!d.objectStoreNames.contains('img'))d.createObjectStore('img',{keyPath:'hash'});if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv')};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}))}
function tx(store,mode,fn){return db().then(d=>new Promise((res,rej)=>{const t=d.transaction(store,mode),s=t.objectStore(store);let out;const r=fn(s);if(r&&'onsuccess' in r)r.onsuccess=()=>{out=r.result};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)}))}
const idbAll=s=>tx(s,'readonly',st=>st.getAll());
const idbGet=(s,k)=>tx(s,'readonly',st=>st.get(k));
const idbPut=(s,v,k)=>tx(s,'readwrite',st=>k===undefined?st.put(v):st.put(v,k));
const idbPutMany=(s,arr)=>tx(s,'readwrite',st=>{arr.forEach(v=>st.put(v))});

/* ── 記憶體索引 ── */
let IDX=new Map();const listeners=new Set();
function emit(){listeners.forEach(f=>{try{f()}catch(_){}})}
const ready=(async()=>{try{(await idbAll('idx')).forEach(r=>IDX.set(r.id,r))}catch(e){console.warn('[VRTPhotos] IDB',e)}})();
function itemRows(domain,key){const K=normKey(key);return [...IDX.values()].filter(r=>r.domain===domain&&r.itemKey===K&&!r.retired)}
function summary(domain,key){const a=itemRows(domain,key),ref=a.filter(r=>r.slot==='ref').sort((x,y)=>String(y.at).localeCompare(String(x.at))),mon=a.filter(r=>r.slot==='month');const cover=(ref.find(r=>r.cover)||ref[0]||mon.slice().sort((x,y)=>String(y.at).localeCompare(String(x.at)))[0]||null);
  const months=[...new Set(mon.map(r=>r.month))].sort();return {ref:ref.length,month:mon.length,total:a.length,cover:cover&&cover.thumb||'',lastMonth:months[months.length-1]||'',thisMonth:mon.filter(r=>r.month===ymNow()).length}}

/* ── 影像壓縮＋指紋 ── */
function loadImg(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file),im=new Image();im.onload=()=>{res(im);setTimeout(()=>URL.revokeObjectURL(u),2000)};im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('不是可讀的圖片 Not an image：'+file.name))};im.src=u})}
function draw(im,max,q){const w0=im.naturalWidth||im.width,h0=im.naturalHeight||im.height,s=Math.min(1,max/Math.max(w0,h0)),w=Math.max(1,Math.round(w0*s)),h=Math.max(1,Math.round(h0*s));const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(im,0,0,w,h);return {data:c.toDataURL('image/jpeg',q),w,h,c}}
function aHash(im){const c=document.createElement('canvas');c.width=8;c.height=8;const x=c.getContext('2d');x.drawImage(im,0,0,8,8);const d=x.getImageData(0,0,8,8).data,v=[];for(let i=0;i<64;i++)v.push((d[i*4]*.299+d[i*4+1]*.587+d[i*4+2]*.114));const m=v.reduce((a,b)=>a+b,0)/64;return v.map(x=>x>=m?'1':'0').join('')}
const ham=(a,b)=>{if(!a||!b||a.length!==b.length)return 99;let n=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])n++;return n};
async function prepare(file){const im=await loadImg(file);const full=draw(im,1280,.72),th=draw(im,260,.62);return {data:full.data,thumb:th.data,w:full.w,h:full.h,bytes:Math.round(full.data.length*.75),hash:await hashText(full.data),ah:aHash(im)}}

/* ── 新增照片（同一物品同一張不重複；月份照同月不重複；幾乎一樣也略過）── */
async function add(files,ctx){await ready;const out={added:0,dup:0,err:[]};const K=normKey(ctx.key);if(!K||!DOM[ctx.domain])throw new Error('缺少物品 Missing item');
  for(const f of [...files]){try{const p=await prepare(f);const slot=ctx.slot==='month'?'month':'ref',month=slot==='month'?(ctx.month||ymNow()):ymNow();
    const same=itemRows(ctx.domain,K).filter(r=>r.slot===slot&&(slot==='ref'||r.month===month));
    if(same.some(r=>r.hash===p.hash||(ham(r.ah,p.ah)===0&&r.w===p.w&&r.h===p.h&&Math.abs((r.bytes||0)-p.bytes)<p.bytes*.04))){out.dup++;continue}
    const rec={id:'ix_'+p.hash.slice(0,16)+'_'+fnv(ctx.domain+'|'+K+'|'+slot+'|'+month),kind:'idx',domain:ctx.domain,itemKey:K,itemName:String(ctx.name||ctx.key||'').slice(0,120),slot,month,caption:String(ctx.caption||'').slice(0,200),hash:p.hash,ah:p.ah,thumb:p.thumb,w:p.w,h:p.h,bytes:p.bytes,file:String(f.name||'').slice(0,120),at:isoLocal(),by:String(ctx.by||'web').slice(0,60),retired:false,_smartBucket:'idx_'+ctx.domain,_pend:1};
    await idbPut('img',{hash:p.hash,id:'im_'+p.hash,kind:'img',data:p.data,_smartBucket:'img_'+p.hash.slice(0,24),_pend:1});
    await idbPut('idx',rec);IDX.set(rec.id,rec);out.added++}catch(e){out.err.push(e.message||String(e))}}
  emit();if(out.added)push().catch(()=>{});return out}
async function update(id,patch){const r=IDX.get(id);if(!r)return;const n=Object.assign({},r,patch,{_pend:1});await idbPut('idx',n);IDX.set(id,n);emit();push().catch(()=>{})}
async function setCover(id){const r=IDX.get(id);if(!r)return;for(const x of itemRows(r.domain,r.itemKey))if(x.cover&&x.id!==id)await update(x.id,{cover:false});await update(id,{slot:'ref',cover:true})}

/* ── 雲端 ── */
let st={text:'',type:'idle'};
function setStatus(text,type){st={text,type};emit()}
async function jget(q){const u=gasUrl();if(!u)throw new Error('這台還沒設定雲端（GAS URL）');const r=await fetch(u+(u.includes('?')?'&':'?')+q+'&t='+Date.now(),{redirect:'follow',cache:'no-store'});const j=await r.json();if(j&&j.ok===false&&j.error)throw new Error(j.error);return j}
async function jpost(body){const u=gasUrl();if(!u)throw new Error('這台還沒設定雲端（GAS URL）');const r=await fetch(u,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow'});const j=await r.json();if(!j||j.ok===false)throw new Error((j&&j.error)||'雲端沒有回應');return j}
async function manifest(){const j=await jget('action=smartManifest&tool='+TOOL);const m=j.data||j;return {exists:!!m.exists,hashes:m.hashes||{},counts:m.counts||{},revision:m.revision||m.updatedAt||'',meta:m.meta||{},legacy:!!m.legacy}}
async function bucket(k,h){const j=await jget('action=smartBucket&tool='+TOOL+'&bucket='+encodeURIComponent(k)+'&hash='+encodeURIComponent(h||''));const rows=(j.data&&j.data.records)||j.records||[];return rows.map(r=>r&&r._vrtValue?r._vrtValue:r)}
let pulling=null;
function pull(){return pulling||(pulling=(async()=>{await ready;if(!gasUrl())return;setStatus('☁↓ 比對雲端照片…','busy');
  try{const m=await manifest();if(!m.exists){setStatus('☁ 雲端還沒有照片','ok');return}
    const seen=(await idbGet('kv','bh'))||{};let n=0;
    for(const k of Object.keys(m.hashes).filter(k=>/^idx_/.test(k))){if(seen[k]===m.hashes[k])continue;const rows=await bucket(k,m.hashes[k]);
      const put=[];rows.forEach(r=>{if(!r||!r.id)return;const old=IDX.get(r.id);if(old&&old._pend)return;put.push(r);IDX.set(r.id,r);n++});if(put.length)await idbPutMany('idx',put);seen[k]=m.hashes[k]}
    await idbPut('kv',seen,'bh');setStatus(n?`☁↓ 已下載 ${n} 筆照片資料`:'☁ 照片已是最新','ok');emit();push().catch(()=>{})}
  catch(e){setStatus('☁↓ 照片雲端暫時讀不到：'+(e.message||e),'warn')}finally{pulling=null}})())}
async function image(hash){const loc=await idbGet('img',hash);if(loc&&loc.data)return loc.data;
  const m=await manifest();const k='img_'+hash.slice(0,24);if(!m.hashes[k])return '';const rows=await bucket(k,m.hashes[k]);const r=rows.find(x=>x.hash===hash);if(r&&r.data){await idbPut('img',{hash,id:r.id,kind:'img',data:r.data,_smartBucket:k});return r.data}return ''}
let pushing=null,again=false;
function push(){if(pushing){again=true;return pushing}return pushing=(async()=>{try{do{again=false;await pushOnce()}while(again)}finally{pushing=null}})()}
async function pushOnce(){await ready;const pend=[...IDX.values()].filter(r=>r._pend);if(!pend.length)return;if(!gasUrl()){setStatus(`⚠️ ${pend.length} 張只在這台（沒有雲端設定）`,'warn');return}
  setStatus(`☁↑ 上傳照片 ${pend.length} 張…`,'busy');
  try{for(let attempt=0;attempt<2;attempt++){const m=await manifest();if(!m.exists&&m.legacy)throw new Error('雲端格式不符');
      const buckets={};const domains=[...new Set(pend.map(r=>r.domain))];
      for(const d of domains){const k='idx_'+d;let cloudRows=[];if(m.hashes[k])cloudRows=await bucket(k,m.hashes[k]);const map=new Map(cloudRows.filter(r=>r&&r.id).map(r=>[r.id,r]));
        [...IDX.values()].filter(r=>r.domain===d).forEach(r=>{if(r._pend||!map.has(r.id))map.set(r.id,clean(r))});buckets[k]=[...map.values()].map(clean)}
      const hashes=[...new Set(pend.map(r=>r.hash))];
      for(const h of hashes){const k='img_'+h.slice(0,24);if(m.hashes[k])continue;const im=await idbGet('img',h);if(!im||!im.data)continue;buckets[k]=[clean(im)]}
      const uploadId=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),newH={},newC={},content={};const changed=Object.keys(buckets).sort();let i=0;
      for(const k of changed){const rows=sortRows(buckets[k]);newH[k]=await bucketHash(rows);newC[k]=rows.length;content[k]=await hashText(JSON.stringify(rows));
        if(m.hashes[k]===newH[k])continue;i++;setStatus(`☁↑ 上傳照片 ${i}/${changed.length}…`,'busy');
        await jpost({action:'smartBucket',tool:TOOL,uploadId,bucket:k,hash:newH[k],contentHash:content[k],count:rows.length,records:rows})}
      const H=Object.assign({},m.hashes,newH),C=Object.assign({},m.counts,newC),total=Object.values(C).reduce((s,v)=>s+(+v||0),0);
      try{await jpost({action:'smartCommit',tool:TOOL,uploadId,baseRevision:m.revision,contentHashes:content,allowShrink:false,hashes:H,counts:C,deleted:[],changedBuckets:changed,recordCount:total,meta:Object.assign({},m.meta,{kind:'VRT item photos',version:VERSION}),summary:{photos:Object.keys(H).filter(k=>/^img_/.test(k)).length}})}
      catch(e){if(attempt===0&&/revision|stale|changed|conflict/i.test(String(e.message)))continue;throw e}
      const done=[];for(const r of pend){const cur=IDX.get(r.id);if(cur&&cur._pend){const n=clean(cur);IDX.set(n.id,n);done.push(n)}}if(done.length)await idbPutMany('idx',done);
      for(const h of hashes){const im=await idbGet('img',h);if(im&&im._pend)await idbPut('img',clean(im))}
      const seen=(await idbGet('kv','bh'))||{};Object.keys(newH).filter(k=>/^idx_/.test(k)).forEach(k=>seen[k]=newH[k]);await idbPut('kv',seen,'bh');
      setStatus(`☁↑ 照片已上傳雲端（${pend.length} 筆）`,'ok');emit();return}}
  catch(e){setStatus(`⚠️ ${pend.length} 張照片還沒上傳：${e.message||e}（會自動重試）`,'warn');setTimeout(()=>push().catch(()=>{}),60000)}}

/* ── 樣式 ── */
function css(){if(document.getElementById('vrtPhotoCss'))return;const s=document.createElement('style');s.id='vrtPhotoCss';s.textContent=`
.vp{--vp-card:var(--card,#fff);--vp-line:var(--line,#e2e8f0);--vp-acc:var(--acc,#4f46e5);--vp-mut:var(--mut,#64748b);--vp-ink:var(--ink,#0f172a);color:var(--vp-ink);font-size:13px}
.vp-sec{background:var(--vp-card);border:1px solid var(--vp-line);border-radius:14px;padding:12px;margin-bottom:12px}
.vp-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}.vp-h b{font-size:14px}.vp-h .vp-n{font-size:11px;color:var(--vp-mut)}.vp-h .vp-sp{flex:1}
.vp-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--vp-acc);background:var(--vp-acc);color:#fff;border-radius:10px;padding:7px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
.vp-btn.ghost{background:transparent;color:var(--vp-acc)}.vp-btn input{display:none}
.vp-in{border:1px solid var(--vp-line);background:var(--vp-card);color:var(--vp-ink);border-radius:8px;padding:6px 8px;font:inherit;font-size:12px}
.vp-cover{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:8px}@media(max-width:640px){.vp-cover{grid-template-columns:1fr}}
.vp-big{position:relative;border-radius:12px;overflow:hidden;background:#0b1220;aspect-ratio:4/3;cursor:zoom-in}.vp-big img{width:100%;height:100%;object-fit:contain;display:block}
.vp-big i{position:absolute;left:8px;top:8px;background:#f59e0b;color:#fff;font-style:normal;font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px}
.vp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px}
.vp-th{position:relative;border-radius:10px;overflow:hidden;background:#0b1220;aspect-ratio:1/1;cursor:zoom-in;border:2px solid transparent}.vp-th.on{border-color:#f59e0b}
.vp-th img{width:100%;height:100%;object-fit:cover;display:block}.vp-th span{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(transparent,rgba(0,0,0,.75));color:#fff;font-size:10.5px;padding:10px 5px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vp-th em{position:absolute;right:4px;top:4px;font-style:normal;font-size:10px;background:rgba(220,38,38,.9);color:#fff;border-radius:6px;padding:0 5px}
.vp-empty{border:2px dashed var(--vp-line);border-radius:12px;padding:22px 12px;text-align:center;color:var(--vp-mut);line-height:1.7}
.vp-mh{display:flex;align-items:center;gap:8px;margin:12px 0 6px;font-weight:800}.vp-mh .vp-bar{flex:1;height:6px;border-radius:99px;background:var(--vp-line);overflow:hidden}.vp-mh .vp-bar i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#ef4444)}
.vp-mh.now{color:#dc2626}
.vp-st{font-size:11.5px;padding:6px 10px;border-radius:8px;margin-bottom:10px;background:#eef2ff;color:#3730a3}.vp-st.ok{background:#ecfdf5;color:#047857}.vp-st.warn{background:#fffbeb;color:#b45309}.vp-st.idle{display:none}
.vp-lb{position:fixed;inset:0;z-index:99990;background:rgba(2,6,23,.92);display:flex;flex-direction:column}
.vp-lb-h{display:flex;align-items:center;gap:8px;padding:10px 12px;color:#fff}.vp-lb-h b{flex:1;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vp-lb-h button,.vp-lb-f button{border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;border-radius:9px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer}
.vp-lb-m{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:6px}.vp-lb-m img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}
.vp-lb-f{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;padding:10px;color:#cbd5e1;font-size:12px;align-items:center}
.vp-lib{position:fixed;inset:0;z-index:9996;background:rgba(2,6,23,.55);display:flex;padding:10px}
.vp-lib-box{margin:auto;width:min(1180px,100%);height:100%;background:var(--bg,#f4f6fb);border:1px solid var(--vp-line);border-radius:16px;display:flex;flex-direction:column;overflow:hidden}
.vp-lib-hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--hdr,#fff);border-bottom:1px solid var(--vp-line)}.vp-lib-hd b{flex:1;font-size:17px}
.vp-lib-tabs{display:flex;gap:2px;padding:0 8px;background:var(--hdr,#fff);border-bottom:1px solid var(--vp-line);overflow-x:auto}
.vp-lib-tabs button{border:0;background:none;color:var(--vp-mut);font:inherit;font-size:13px;padding:9px 12px;border-bottom:3px solid transparent;cursor:pointer;white-space:nowrap}.vp-lib-tabs button.on{color:var(--vp-acc);border-bottom-color:var(--vp-acc);font-weight:700}
.vp-lib-tabs button i{font-style:normal;font-size:10.5px;background:var(--chip,#f1f5f9);border-radius:99px;padding:0 6px;margin-left:4px}
.vp-lib-body{flex:1;overflow:auto;padding:12px 14px 30px}
.vp-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.vp-card{background:var(--vp-card);border:1px solid var(--vp-line);border-radius:14px;overflow:hidden;cursor:pointer}.vp-card:hover{border-color:var(--vp-acc)}
.vp-card .ph{aspect-ratio:4/3;background:#0b1220 center/cover no-repeat;display:grid;place-items:center;color:#64748b;font-size:28px}
.vp-card .tx{padding:8px 10px}.vp-card .tx b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vp-card .tx span{font-size:11px;color:var(--vp-mut)}
.vp-chip{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;background:#fef3c7;color:#92400e;margin-left:6px;white-space:nowrap}.vp-chip.ref{background:#e0e7ff;color:#3730a3}
`;document.head.appendChild(s)}

/* ── 大圖檢視（左右滑／鍵盤左右）── */
function viewer(list,i,opt){css();opt=opt||{};let k=i;const el=document.createElement('div');el.className='vp-lb';document.body.appendChild(el);
  const close=()=>{el.remove();document.removeEventListener('keydown',key)};
  const key=e=>{if(e.key==='Escape')close();if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1)};document.addEventListener('keydown',key);
  const go=d=>{const n=k+d;if(n<0||n>=list.length)return;k=n;paint()};
  async function paint(){const r=list[k];el.innerHTML=`<div class="vp-lb-h"><button data-a="x">✕</button><b>${E(r.itemName||r.itemKey)} · ${r.slot==='ref'?'⭐ 標準照 Standard':'⚠️ '+E(r.month)+' 異常 Anomaly'}</b><span style="color:#cbd5e1;font-size:12px">${k+1} / ${list.length}</span></div>
    <div class="vp-lb-m"><img src="${r.thumb}" alt=""></div>
    <div class="vp-lb-f"><button data-a="p" ${k?'':'disabled'}>◀</button><span>${E(r.caption||'（沒有說明 no caption）')} · ${E(String(r.at||'').replace('T',' ').slice(0,16))}</span><button data-a="n" ${k<list.length-1?'':'disabled'}>▶</button></div>
    ${opt.edit?`<div class="vp-lb-f">${r.slot==='ref'&&r.cover?'<span>⭐ 目前封面 Cover</span>':`<button data-a="c">⭐ 設為標準照封面 Set as standard</button>`}${r.slot==='ref'?`<button data-a="m">⚠️ 改成本月異常 Move to this month</button>`:''}<button data-a="t">✏️ 說明 Caption</button><button data-a="r">🗄 封存 Archive</button></div>`:''}`;
    const img=el.querySelector('.vp-lb-m img');try{const full=await image(r.hash);if(full&&list[k]===r)img.src=full}catch(_){}}
  el.addEventListener('click',async e=>{const a=e.target.closest('[data-a]');if(!a){if(e.target===el)close();return}const r=list[k];
    ({x:close,p:()=>go(-1),n:()=>go(1),c:async()=>{await setCover(r.id);list[k]=IDX.get(r.id);paint()},m:async()=>{await update(r.id,{slot:'month',month:ymNow(),cover:false});close()},
      t:()=>{const f=el.querySelector('.vp-lb-f span');const inp=document.createElement('input');inp.className='vp-in';inp.value=r.caption||'';inp.placeholder='例如：色差、破洞、斷針 e.g. shade, hole';inp.style.minWidth='220px';f.replaceWith(inp);inp.focus();inp.onkeydown=async ev=>{if(ev.key==='Enter'){await update(r.id,{caption:inp.value.trim()});list[k]=IDX.get(r.id);paint()}};inp.onblur=async()=>{await update(r.id,{caption:inp.value.trim()});list[k]=IDX.get(r.id);paint()}},
      r:async()=>{if(a.dataset.sure!=='1'){a.dataset.sure='1';a.textContent='再按一次確定封存 Tap again';return}await update(r.id,{retired:true,cover:false});list.splice(k,1);if(!list.length)return close();k=Math.min(k,list.length-1);paint()}})[a.dataset.a]()});
  let sx=0,sy=0;el.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
  el.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>60&&Math.abs(dy)<60)go(dx<0?1:-1)},{passive:true});
  paint()}

/* ── 物品頁的「📷 照片」分頁 ── */
function mount(host,ctx){css();ready.then(()=>{if(!host.isConnected)return;draw2()});let month=ymNow(),cap='';
  const off=()=>listeners.delete(draw2);listeners.add(draw2);
  function draw2(){if(!host.isConnected){off();return}const ae=document.activeElement;if(ae&&host.contains(ae)&&ae.tagName==='INPUT'&&ae.type!=='file'){const sb=host.querySelector('.vp-st');if(sb){sb.className='vp-st '+st.type;sb.textContent=st.text}return}const a=itemRows(ctx.domain,ctx.key);const ref=a.filter(r=>r.slot==='ref').sort((x,y)=>(y.cover?1:0)-(x.cover?1:0)||String(y.at).localeCompare(String(x.at)));
    const mon=a.filter(r=>r.slot==='month').sort((x,y)=>String(y.at).localeCompare(String(x.at)));const byM=new Map();mon.forEach(r=>{if(!byM.has(r.month))byM.set(r.month,[]);byM.get(r.month).push(r)});const months=[...byM.keys()].sort().reverse();const mx=Math.max(1,...[...byM.values()].map(x=>x.length));
    const d=DOM[ctx.domain]||DOM.other;const tip=ctx.tip||'';
    host.innerHTML=`<div class="vp">
     <div class="vp-st ${st.type}">${E(st.text)}</div>
     <div class="vp-sec"><div class="vp-h"><b>⭐ 標準照（最正確的樣子）<small style="font-weight:400;color:var(--vp-mut)">Standard photo</small></b><span class="vp-n">${ref.length} 張</span><span class="vp-sp"></span>
       <label class="vp-btn">📷 上傳標準照 Upload<input type="file" accept="image/*" multiple data-slot="ref"></label></div>
       ${ref.length?`<div class="vp-cover"><div class="vp-big" data-v="ref:0"><img src="${ref[0].thumb}" alt=""><i>⭐ 標準 Standard</i></div><div class="vp-grid">${ref.map((r,i)=>`<div class="vp-th ${i===0?'on':''}" data-v="ref:${i}"><img src="${r.thumb}" alt="" loading="lazy"><span>${E(r.caption||r.file||'')}</span></div>`).join('')}</div></div>`
        :`<div class="vp-empty">${d[1]} 這個${E(d[2])}還沒有標準照<br><small>拍一張「正確」的樣子放這裡，大家對照就知道對不對。No standard photo yet.</small>${tip?'<br><small>'+E(tip)+'</small>':''}</div>`}</div>
     <div class="vp-sec"><div class="vp-h"><b>⚠️ 每月不同／異常照 <small style="font-weight:400;color:var(--vp-mut)">Monthly differences</small></b><span class="vp-n">${mon.length} 張 · ${months.length} 個月</span><span class="vp-sp"></span>
       <input class="vp-in" type="month" value="${E(month)}" data-k="month" title="哪個月 Month"><input class="vp-in" data-k="cap" value="${E(cap)}" placeholder="說明：色差／破洞／斷針… Caption" style="min-width:150px;flex:1;max-width:260px">
       <label class="vp-btn ghost">📷 上傳 Upload<input type="file" accept="image/*" multiple data-slot="month"></label></div>
       ${months.length?months.map(m=>{const rs=byM.get(m);return `<div class="vp-mh ${m===ymNow()?'now':''}"><span>${E(m)}${m===ymNow()?' 本月':''}</span><span class="vp-n" style="font-weight:400">${rs.length} 張</span><span class="vp-bar"><i style="width:${Math.round(rs.length/mx*100)}%"></i></span></div><div class="vp-grid">${rs.map(r=>`<div class="vp-th" data-v="m:${E(r.id)}"><img src="${r.thumb}" alt="" loading="lazy"><span>${E(r.caption||'')}</span>${r._pend?'<em>未上傳</em>':''}</div>`).join('')}</div>`}).join('')
        :`<div class="vp-empty">這個月收到不一樣的（顏色、規格、瑕疵、供應商換了…）就拍下來放這裡，<br>會依月份分開、同一張不會重複。<br><small>Same photo is never stored twice.</small></div>`}</div>
    </div>`;
    host.querySelectorAll('input[type=file]').forEach(inp=>inp.onchange=async()=>{const files=[...inp.files];if(!files.length)return;setStatus(`⏳ 處理 ${files.length} 張照片…`,'busy');
      try{const r=await add(files,{domain:ctx.domain,key:ctx.key,name:ctx.name,slot:inp.dataset.slot,month,caption:cap});setStatus(`✅ 新增 ${r.added} 張${r.dup?` · 重複略過 ${r.dup} 張`:''}${r.err.length?' · ⚠️ '+r.err[0]:''}`,r.err.length?'warn':'ok')}catch(e){setStatus('⚠️ '+(e.message||e),'warn')}});
    const mi=host.querySelector('[data-k=month]');mi&&(mi.onchange=()=>{month=mi.value||ymNow()});const ci=host.querySelector('[data-k=cap]');ci&&(ci.oninput=()=>{cap=ci.value});
    host.querySelectorAll('[data-v]').forEach(t=>t.onclick=()=>{const v=t.dataset.v;if(v.startsWith('ref:'))viewer(ref,+v.slice(4),{edit:true});else{const i=mon.findIndex(r=>'m:'+r.id===v);viewer(mon,Math.max(0,i),{edit:true})}})}
  pull().catch(()=>{});
}

/* ── 📷 照片庫：依類別分頁；每個物品一張卡（標準照封面＋張數）；最上面「本月異常」；可批次上傳（檔名＝料號）── */
function library(opt){css();opt=opt||{};let dom=opt.domain&&DOM[opt.domain]?opt.domain:'fabric',q='';const el=document.createElement('div');el.className='vp-lib';document.body.appendChild(el);
  el.innerHTML=`<div class="vp-lib-box"><div class="vp-lib-hd"><span style="font-size:20px">📷</span><b>照片庫 Photo library</b><button class="vp-btn ghost" data-a="x">✕</button></div><div class="vp-lib-tabs"></div><div class="vp-lib-body"></div></div>`;
  const close=()=>{listeners.delete(paint);el.remove()};el.addEventListener('click',e=>{if(e.target===el)close();const a=e.target.closest('[data-a=x]');if(a)close()});
  function paint(){if(!el.isConnected)return;const all=[...IDX.values()].filter(r=>!r.retired);const cnt=d=>new Set(all.filter(r=>r.domain===d).map(r=>r.itemKey)).size;
    el.querySelector('.vp-lib-tabs').innerHTML=DOMAINS.map(d=>`<button data-d="${d[0]}" class="${d[0]===dom?'on':''}">${d[1]} ${E(d[2])}<i>${cnt(d[0])}</i></button>`).join('');
    el.querySelectorAll('.vp-lib-tabs button').forEach(b=>b.onclick=()=>{dom=b.dataset.d;paint()});
    const rows=all.filter(r=>r.domain===dom);const items=new Map();rows.forEach(r=>{if(!items.has(r.itemKey))items.set(r.itemKey,{key:r.itemKey,name:r.itemName||r.itemKey});});
    const list=[...items.values()].map(x=>Object.assign(x,summary(dom,x.key))).filter(x=>!q||(x.key+' '+x.name).toUpperCase().includes(q)).sort((a,b)=>b.thisMonth-a.thisMonth||String(b.lastMonth).localeCompare(String(a.lastMonth))||a.key.localeCompare(b.key,'en',{numeric:true}));
    const now=rows.filter(r=>r.slot==='month'&&r.month===ymNow()).sort((a,b)=>String(b.at).localeCompare(String(a.at)));const d=DOM[dom];
    el.querySelector('.vp-lib-body').innerHTML=`<div class="vp"><div class="vp-st ${st.type}">${E(st.text)}</div>
      <div class="vp-h"><input class="vp-in" placeholder="🔍 搜尋料號／名稱 Search" value="${E(q)}" data-k="q" style="flex:1;max-width:320px"><span class="vp-sp"></span>
        <button class="vp-btn" data-imp="1" title="同事做的對照表：Excel／PDF／JPG，一列＝編號＋照片＋名稱">📥 匯入對照表 Excel／PDF／JPG</button><label class="vp-btn ghost" title="檔名就是料號，例如 TCF0487.jpg、TCF0487_2.jpg">📁 批次上傳（檔名＝料號）Batch<input type="file" accept="image/*" multiple data-b="ref"></label>
        <label class="vp-btn ghost">📁 批次＝本月異常 Batch (this month)<input type="file" accept="image/*" multiple data-b="month"></label></div>
      ${now.length?`<div class="vp-sec"><div class="vp-h"><b>⚠️ ${E(ymNow())} 本月異常／不同</b><span class="vp-n">${now.length} 張</span></div><div class="vp-grid">${now.map((r,i)=>`<div class="vp-th" data-now="${i}"><img src="${r.thumb}" alt="" loading="lazy"><span>${E(r.itemName||r.itemKey)} ${E(r.caption||'')}</span></div>`).join('')}</div></div>`:''}
      ${list.length?`<div class="vp-cards">${list.map(x=>`<div class="vp-card" data-key="${E(x.key)}"><div class="ph" style="${x.cover?`background-image:url('${x.cover}')`:''}">${x.cover?'':d[1]}</div><div class="tx"><b>${E(x.name)}</b><span>${E(x.key!==normKey(x.name)?x.key:'')}</span><div style="margin-top:4px">${x.ref?`<span class="vp-chip ref" style="margin-left:0">⭐ ${x.ref}</span>`:''}${x.month?`<span class="vp-chip">⚠️ ${x.month}${x.lastMonth?' · '+E(x.lastMonth.slice(2)):''}</span>`:''}</div></div></div>`).join('')}</div>`
        :`<div class="vp-empty">${d[1]} ${E(d[2])}還沒有照片。<br>在物品頁的「📷 照片」分頁上傳，或用上面的「批次上傳」：檔名就是料號／瑕疵名稱（例如 TCF0487.jpg）。</div>`}</div>`;
    const qi=el.querySelector('[data-k=q]');let tm;qi.oninput=()=>{clearTimeout(tm);tm=setTimeout(()=>{q=qi.value.trim().toUpperCase();paint();const n=el.querySelector('[data-k=q]');n.focus();n.setSelectionRange(n.value.length,n.value.length)},250)};
    el.querySelectorAll('[data-b]').forEach(inp=>inp.onchange=async()=>{const files=[...inp.files];let add2=0,dup=0;setStatus(`⏳ 批次處理 ${files.length} 張…`,'busy');
      for(const f of files){const key=String(f.name).replace(/\.[^.]+$/,'').replace(/[\s_-]*(\(\d+\)|[_-]\d{1,2})$/,'').trim();if(!key)continue;try{const r=await add([f],{domain:dom,key,name:key,slot:inp.dataset.b,month:ymNow()});add2+=r.added;dup+=r.dup}catch(_){}}
      setStatus(`✅ 批次新增 ${add2} 張${dup?` · 重複略過 ${dup}`:''}`,'ok')});
    const ib=el.querySelector('[data-imp]');ib&&(ib.onclick=()=>{if(g.VRTPhotoImport)g.VRTPhotoImport.open({domain:dom,items:opt.items,onDone:paint});else setStatus('⚠️ 這一頁沒有載入匯入元件','warn')});
    el.querySelectorAll('[data-now]').forEach(t=>t.onclick=()=>viewer(now,+t.dataset.now,{edit:true}));
    el.querySelectorAll('.vp-card').forEach(c=>c.onclick=()=>{const k=c.dataset.key;if(opt.onOpen&&opt.onOpen(dom,k)!==false){close();return}
      const box=document.createElement('div');box.className='vp-lib';box.innerHTML=`<div class="vp-lib-box"><div class="vp-lib-hd"><span style="font-size:20px">${d[1]}</span><b>${E((items.get(k)||{}).name||k)}</b><button class="vp-btn ghost" data-a="x">✕</button></div><div class="vp-lib-body"></div></div>`;document.body.appendChild(box);
      box.addEventListener('click',e=>{if(e.target===box||e.target.closest('[data-a=x]'))box.remove()});mount(box.querySelector('.vp-lib-body'),{domain:dom,key:k,name:(items.get(k)||{}).name||k})})}
  listeners.add(paint);ready.then(paint);pull().catch(()=>{})}

g.VRTPhotos={version:VERSION,DOMAINS,ready,mount,library,viewer,summary,add,pull,push,normKey,status:()=>st,on:f=>{listeners.add(f);return()=>listeners.delete(f)}};
})(window);
