/* VRT 生產異常提醒 v1.0（2026-11-26）
   Paul 11/26：「異常報告已給就要先放進去，不是等到 12 月；系統可標示這款當初的異常當警惕——像車縫款式就要注意品質，或機台要小心。」
   · 資料：雲端工具 'anomaly'（跟其他頁同一個 GAS，智慧分桶同步），本機 IndexedDB 快取；公開 repo 裡不放任何異常資料。
   · 所有頁面：表格裡被「點了就連」變成可點的 款號／PO／機台／線別，只要有過異常，就在旁邊加 ⚠️，滑過／點開看是哪一筆、要注意什麼。
   · 物品頁（款式／PO／機台…）最上面出現黃色「曾有異常」提醒條。
   · 管理頁：vrt_anomaly_v1.html（清單、新增、修改、匯入）。
   一筆異常：{id, case, date, cust, style, po, machine, line, cat, dept, sev, title, issue, root, imm, ca, target, status, cost, watch, latest, remarks, updatedAt}
   style／po／machine／line 可以寫好幾個，用逗號、斜線或空白分開。 */
(function(g){
'use strict';
if(g.VRTAnomaly)return;
const TOOL='anomaly',IDB='vrt_anomaly_v1',CACHE='rows';
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nk=s=>String(s==null?'':s).toUpperCase().replace(/[^A-Z0-9㐀-鿿]+/g,'');
const SKIP=/^(MIXED|N\/?A|NA|ALL|NONE|多款|混款|—|-)$/i;
const toks=v=>String(v||'').split(/[,，、;；\n\/]+|\s{2,}/).map(s=>s.trim()).filter(s=>s&&!SKIP.test(s)&&!/^MIXED/i.test(s));
let ROWS=[],LOADED=false,LOADING=null,LISTENERS=[];
function gas(){try{if(g.VRTPlatform&&g.VRTPlatform.getGasUrl)return g.VRTPlatform.getGasUrl();if(g.top!==g&&g.top.VRTPlatform)return g.top.VRTPlatform.getGasUrl()}catch(_){}try{return localStorage.getItem('vrt_portal_gas_url')||localStorage.getItem('vrt_gas_url')||''}catch(_){return ''}}
function idb(){return new Promise((res,rej)=>{const q=indexedDB.open(IDB,1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function iget(k){const d=await idb();return new Promise(r=>{const t=d.transaction('kv').objectStore('kv').get(k);t.onsuccess=()=>r(t.result);t.onerror=()=>r(null)})}
async function iset(k,v){const d=await idb();return new Promise(r=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>r(true);t.onerror=()=>r(false)})}
function index(){const M={style:new Map(),po:new Map(),machine:new Map(),line:new Map()};
  ROWS.filter(r=>!r.deleted).forEach(r=>{['style','po','machine','line'].forEach(f=>toks(r[f]).forEach(t=>{const k=f==='line'?lineK(t):nk(t);if(k.length<2)return;let a=M[f].get(k);if(!a)M[f].set(k,a=[]);a.push(r)}))});return M}
const lineK=s=>{const m=String(s).match(/(APRON)?\s*L(?:INE)?\s*(\d{1,2})/i);return m?(m[1]?'A':'')+'L'+(+m[2]):nk(s)};
let IX=index();
function set(rows){ROWS=(rows||[]).filter(r=>r&&r.id);IX=index();LOADED=true;LISTENERS.forEach(f=>{try{f(ROWS)}catch(_){}});decorateAll()}
/* 讀：先本機快取，再看雲端有沒有新的 */
async function load(force){if(LOADING&&!force)return LOADING;
  return LOADING=(async()=>{const c=await iget(CACHE).catch(()=>null);if(c&&c.rows&&!LOADED)set(c.rows);
    const G=gas();if(!G)return ROWS;
    try{const m=await fetch(G+'?action=smartManifest&tool='+TOOL+'&t='+Date.now(),{redirect:'follow',cache:'no-store'}).then(r=>r.json());const d=m.data||m;const H=d.hashes||{};
      if(!d.exists&&!Object.keys(H).length){if(!c)set([]);return ROWS}
      const ch=(c&&c.h)||{},cb=(c&&c.b)||{};const b={},h={};
      await Promise.all(Object.keys(H).map(async k=>{if(ch[k]===H[k]&&cb[k]){b[k]=cb[k];h[k]=H[k];return}const j=await fetch(G+'?action=smartBucket&tool='+TOOL+'&bucket='+encodeURIComponent(k)+'&hash='+encodeURIComponent(H[k]),{redirect:'follow'}).then(r=>r.json());b[k]=((j.data&&j.data.records)||j.records||[]).map(r=>r._vrtValue||r);h[k]=H[k]}));
      const rows=Object.values(b).flat();await iset(CACHE,{rows,h,b,at:new Date().toISOString()});set(rows)}catch(e){console.warn('[VRTAnomaly] cloud',e);if(!LOADED)set(c&&c.rows||[])}
    return ROWS})()}
function smartSync(){return new Promise((res,rej)=>{if(g.VRTSmartSync)return res(g.VRTSmartSync);const s=document.createElement('script');s.src='vrt-smart-sync-v3.js?v=4.19.0';s.onload=()=>g.VRTSmartSync?res(g.VRTSmartSync):rej(new Error('smart sync missing'));s.onerror=()=>rej(new Error('smart sync load failed'));document.head.appendChild(s)})}
/* 寫：整份上傳（筆數少，一年一個分桶 p:anomaly_2026）；刪除＝標記 deleted，不真的刪 */
async function save(rows,onStatus){rows=rows.map(r=>Object.assign({},r,{date:r.date||'',_smartBucket:'anomaly_'+(String(r.date||'').slice(0,4)||'x')}));const S=await smartSync();
  const res=await S.push({tool:TOOL,records:rows,meta:{kind:'anomaly',count:rows.length},onStatus:onStatus||(()=>{})});
  if(res&&res.ok===false)throw new Error(res.needsPull?'請先重新整理（雲端有較新的資料）':'上傳沒有成功');
  await iset(CACHE,{rows,h:{},b:{},at:new Date().toISOString()});set(rows);return res}
function upsert(rec){const now=new Date().toISOString();rec=Object.assign({},rec,{updatedAt:now});if(!rec.id)rec.id='AR'+Date.now().toString(36).toUpperCase();
  const rows=ROWS.slice();const i=rows.findIndex(r=>r.id===rec.id);if(i>=0)rows[i]=Object.assign({},rows[i],rec);else rows.push(Object.assign({createdAt:now},rec));return rows}
/* 查：某個款號／PO／機台／線別 有哪些異常（款號用前綴也算：W154-SP 對到 W154-SP-GN-RC） */
function find(kind,key){if(!key)return [];const k=kind==='line'?lineK(key):nk(key);if(k.length<2)return [];const m=IX[kind];if(!m)return [];let a=m.get(k)||[];
  if(!a.length&&(kind==='style'||kind==='machine')&&k.length>=4){const out=new Set();m.forEach((v,kk)=>{if(kk.length>=4&&(kk.startsWith(k)||k.startsWith(kk)))v.forEach(r=>out.add(r))});a=[...out]}
  return a.slice().sort((x,y)=>String(y.date).localeCompare(String(x.date)))}
function findAny(key,title){const out=new Map();['style','po','machine','line'].forEach(kd=>[key,title].forEach(v=>find(kd,v).forEach(r=>out.set(r.id,r))));return [...out.values()].sort((x,y)=>String(y.date).localeCompare(String(x.date)))}
const isOpen=r=>!/^(closed|結案|已結案)/i.test(String(r.status||'').trim());
const SEVC=r=>/crit|極/i.test(r.sev)?'#dc2626':/high|高/i.test(r.sev)?'#ea580c':/med|中/i.test(r.sev)?'#d97706':'#64748b';
const ZH=s=>{s=String(s||'');const m=s.match(/中：([\s\S]*)/);return (m?m[1]:s).trim()};
const short=(s,n)=>{s=ZH(s).replace(/\s+/g,' ');return s.length>(n||70)?s.slice(0,n||70)+'…':s};
function tip(list){return list.map(r=>`${r.case||r.id} ${r.date||''}｜${short(r.title,40)}${r.watch?'\n⚠️ '+short(r.watch,80):''}`).join('\n')}
/* 物品頁上方的黃色提醒條 */
function banner(key,title){const a=findAny(key,title);if(!a.length)return '';const open=a.filter(isOpen).length;
  return `<div class="vab" style="background:#fffbeb;border:1px solid #f59e0b;border-left:6px solid #f59e0b;border-radius:12px;padding:10px 12px;margin:8px 0;color:#78350f;font-size:13px;line-height:1.5">
   <b style="font-size:14px">⚠️ 曾有異常 ${a.length} 筆${open?`（未結案 ${open}）`:''}｜Past anomalies — 生產前先看注意事項</b>
   ${a.slice(0,5).map(r=>`<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #fcd34d"><span style="display:inline-block;background:${SEVC(r)};color:#fff;border-radius:99px;padding:0 8px;font-size:11px;font-weight:800">${E(String(r.sev||'').split('/').pop().trim()||'—')}</span> <b>${E(r.case||r.id)}</b> ${E(r.date||'')} · ${E(r.cust||'')} · ${E(String(r.cat||'').split('/').pop().trim())} · ${isOpen(r)?'<b style="color:#dc2626">未結案</b>':'已結案'}<br>${E(short(r.title,90))}${r.watch?`<br>👉 <b>注意：</b>${E(ZH(r.watch))}`:''}</div>`).join('')}
   <div style="margin-top:6px"><a href="vrt_anomaly_v1.html#q=${encodeURIComponent(key||title||'')}" target="_blank" style="color:#b45309;font-weight:700">看全部異常報告 ›</a></div></div>`}
/* 表格裡的 ⚠️：跟著「點了就連」的 .vl 標記 */
function decorate(sp){if(!LOADED||!sp||sp.dataset.vab)return;const kd=sp.dataset.vk;if(!/^(style|po|machine|line)$/.test(kd))return;sp.dataset.vab='1';const a=find(kd,sp.dataset.vv);if(!a.length)return;
  const open=a.some(isOpen);const b=document.createElement('span');b.className='vab-ic';b.textContent='⚠️';b.title='曾有異常 Past anomaly：\n'+tip(a);
  b.style.cssText='cursor:help;margin-left:2px;font-size:11px;'+(open?'':'opacity:.75');b.onclick=e=>{e.stopPropagation();e.preventDefault();alertBox(sp.dataset.vv,a)};sp.after(b)}
function alertBox(key,a){let el=document.getElementById('vabBox');if(el)el.remove();el=document.createElement('div');el.id='vabBox';
  el.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(2,6,23,.45);display:flex;align-items:center;justify-content:center;padding:14px';
  el.innerHTML=`<div style="background:#fff;color:#1e293b;max-width:560px;width:100%;max-height:85vh;overflow:auto;border-radius:16px;padding:6px 14px 14px">${banner(key,'')}<button style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;font:inherit;cursor:pointer">關閉 Close</button></div>`;
  el.onclick=e=>{if(e.target===el||e.target.tagName==='BUTTON')el.remove()};document.body.appendChild(el)}
let dt=null;function decorateAll(){clearTimeout(dt);dt=setTimeout(()=>{try{document.querySelectorAll('.vl:not([data-vab])').forEach(decorate)}catch(_){}},300)}
function start(){load().catch(()=>{});try{new MutationObserver(ms=>{if(ms.some(m=>m.addedNodes.length))decorateAll()}).observe(document.body,{childList:true,subtree:true})}catch(_){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
g.VRTAnomaly={version:'1.0.0',load,save,upsert,find,findAny,banner,isOpen,rows:()=>ROWS.filter(r=>!r.deleted),all:()=>ROWS,on:f=>LISTENERS.push(f),ZH,short,toks};
})(window);
