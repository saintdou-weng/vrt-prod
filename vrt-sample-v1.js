/* VRT 樣品組：每日打樣／生產記錄＋馬克排版 v1.0（2026-11-27）
   Paul 11/26 同意：樣品組每天的打樣、生產記錄（可 Excel 匯入，先預覽再寫入）、手動新增，每筆可附馬克（marker）排版圖／照片；
   款號點了開款式卡，款式卡也看得到這一款的打樣與馬克記錄。
   · 資料：雲端工具 'sample'（跟其他頁同一個 GAS，智慧分桶同步，一年一桶 p:sample_2026），本機 IndexedDB 快取；公開 repo 不放任何資料。
   · 照片：共用 VRTPhotos，類別 'sample'，key＝這一筆的編號（SP-20261127-xxxx）。
   · 刪除＝標記 deleted，不真的刪；雲端沒讀到時不准上傳（避免少覆多）。
   一筆：{id, date, kind(proto|fit|pp|sms|prod|marker), cust, style, color, size, qty, maker, status, fabric,
          mkLen, mkWidth, mkEff, mkRatio, mkLayers, mkPcs, hours, due, remarks, updatedAt} */
(function(g){
'use strict';
if(g.VRTSample)return;
const TOOL='sample',IDB='vrt_sample_v1',CACHE='rows';
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nk=s=>String(s==null?'':s).toUpperCase().replace(/[^A-Z0-9㐀-鿿]+/g,'');
/* [代碼, 圖示, 中文, English, 顏色] */
const KINDS=[['proto','🧪','打樣（初樣）','Proto sample','#7c3aed'],['fit','📏','尺寸樣／Fit','Fit / size sample','#2563eb'],['pp','✅','產前樣 PP','Pre-production (PP)','#059669'],
 ['sms','📦','船樣／銷售樣','Shipment / sales sample','#0891b2'],['prod','🏭','生產記錄','Production record','#d97706'],['marker','📐','馬克排版','Marker layout','#db2777'],['other','📎','其他','Other','#64748b']];
const KIND=Object.fromEntries(KINDS.map(k=>[k[0],k]));
const STATUS=[['doing','進行中','In progress','#d97706'],['done','完成','Done','#059669'],['sent','已寄客戶','Sent to buyer','#2563eb'],['ok','客戶核可','Approved','#047857'],['redo','要修改','Revise','#dc2626'],['hold','暫停','On hold','#64748b']];
const STA=Object.fromEntries(STATUS.map(s=>[s[0],s]));
let ROWS=[],LOADED=false,CLOUD=null,LOADING=null;const LIS=[];
function gas(){try{if(g.VRTPlatform&&g.VRTPlatform.getGasUrl){const u=g.VRTPlatform.getGasUrl();if(u)return u}}catch(_){}try{if(g.top!==g&&g.top.VRTPlatform)return g.top.VRTPlatform.getGasUrl()}catch(_){}
  try{return (g.VRT_DEPLOY_CONFIG&&g.VRT_DEPLOY_CONFIG.gasUrl)||localStorage.getItem('vrt_portal_gas_url')||''}catch(_){return ''}}
function idb(){return new Promise((res,rej)=>{const q=indexedDB.open(IDB,1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function iget(k){const d=await idb();return new Promise(r=>{const t=d.transaction('kv').objectStore('kv').get(k);t.onsuccess=()=>r(t.result);t.onerror=()=>r(null)})}
async function iset(k,v){const d=await idb();return new Promise(r=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>r(true);t.onerror=()=>r(false)})}
let IX=new Map();
function index(){IX=new Map();ROWS.filter(r=>!r.deleted).forEach(r=>String(r.style||'').split(/[,，、;；\/\n]+/).map(s=>nk(s)).filter(k=>k.length>=3).forEach(k=>{let a=IX.get(k);if(!a)IX.set(k,a=[]);a.push(r)}))}
function set(rows){ROWS=(rows||[]).filter(r=>r&&r.id);index();LOADED=true;LIS.forEach(f=>{try{f(ROWS)}catch(_){}})}
/* 讀：先本機快取，再看雲端；CLOUD=true 代表雲端已確認（才可以上傳） */
async function load(force){if(LOADING&&!force)return LOADING;
  return LOADING=(async()=>{const c=await iget(CACHE).catch(()=>null);if(c&&c.rows&&!LOADED)set(c.rows);const G=gas();if(!G){CLOUD=false;if(!LOADED)set([]);return ROWS}
    try{const m=await fetch(G+'?action=smartManifest&tool='+TOOL+'&t='+Date.now(),{redirect:'follow',cache:'no-store'}).then(r=>r.json());const d=m.data||m;const H=d.hashes||{};
      if(!d.exists&&!Object.keys(H).length){CLOUD=true;if(!LOADED)set([]);return ROWS}
      const ch=(c&&c.h)||{},cb=(c&&c.b)||{},b={},h={};
      await Promise.all(Object.keys(H).map(async k=>{if(ch[k]===H[k]&&cb[k]){b[k]=cb[k];h[k]=H[k];return}const j=await fetch(G+'?action=smartBucket&tool='+TOOL+'&bucket='+encodeURIComponent(k)+'&hash='+encodeURIComponent(H[k])+'&t='+Date.now(),{redirect:'follow',cache:'no-store'}).then(r=>r.json());const dd=j.data||j;b[k]=(dd.records||dd.rows||[]).map(r=>r&&r._vrtValue?r._vrtValue:r);h[k]=H[k]}));
      const rows=Object.values(b).flat();await iset(CACHE,{rows,h,b,at:new Date().toISOString()});CLOUD=true;set(rows)}catch(e){console.warn('[VRTSample] cloud',e);CLOUD=false;if(!LOADED)set(c&&c.rows||[])}
    return ROWS})()}
function smartSync(){return new Promise((res,rej)=>{if(g.VRTSmartSync)return res(g.VRTSmartSync);const s=document.createElement('script');s.src='vrt-smart-sync-v3.js?v=4.19.0';s.onload=()=>g.VRTSmartSync?res(g.VRTSmartSync):rej(new Error('Smart Sync 沒載入'));s.onerror=()=>rej(new Error('Smart Sync 沒載入'));document.head.appendChild(s)})}
/* 寫：整份上傳（一年一桶，只傳有變的桶）。雲端沒讀到就不上傳，免得少的蓋掉多的 */
async function save(rows,onStatus){if(CLOUD!==true){await load(true);if(CLOUD!==true)throw new Error('還沒讀到雲端資料，先不上傳（避免少覆多）。請確認網路後重新整理。')}
  if(rows.length<ROWS.length)throw new Error('筆數比雲端少，不上傳（少覆多保護）');
  rows=rows.map(r=>Object.assign({},r,{_smartBucket:'sample_'+(String(r.date||'').slice(0,4)||'x')}));const S=await smartSync();
  const res=await S.push({tool:TOOL,records:rows,meta:{kind:'sample',count:rows.length},onStatus:onStatus||(()=>{})});
  if(res&&res.ok===false)throw new Error(res.needsPull?'雲端有較新的資料，請先重新整理':(res.error||res.message||'上傳沒有成功'));
  await iset(CACHE,{rows,h:{},b:{},at:new Date().toISOString()});set(rows);return res}
const pad=n=>String(n).padStart(2,'0');const ymd=d=>{d=d||new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
function newId(date){return 'SP-'+String(date||ymd()).replace(/-/g,'').slice(0,8)+'-'+Math.random().toString(36).slice(2,6).toUpperCase()}
/* 同一天＋同種類＋同款號＋同顏色＋同尺寸＝同一筆（Excel 重匯不會重複） */
const sameKey=r=>[r.date,r.kind,nk(r.style),nk(r.color),nk(r.size)].join('|');
function upsert(rec,rows){rows=(rows||ROWS).slice();const now=new Date().toISOString();rec=Object.assign({},rec,{updatedAt:now});if(!rec.kind)rec.kind='proto';if(!rec.status)rec.status='done';if(!rec.date)rec.date=ymd();
  let i=rec.id?rows.findIndex(r=>r.id===rec.id):-1;if(i<0&&!rec.id){const k=sameKey(rec);i=rows.findIndex(r=>!r.deleted&&sameKey(r)===k)}
  if(i>=0){rec.id=rows[i].id;rows[i]=Object.assign({},rows[i],rec)}else{if(!rec.id)rec.id=newId(rec.date);rows.push(Object.assign({createdAt:now},rec))}return rows}
/* 查：某一款的記錄（款號前綴也算：W154-SP 對到 W154-SP-GN） */
function find(key,title){const out=new Map();[key,title].forEach(v=>{const k=nk(v);if(k.length<3)return;(IX.get(k)||[]).forEach(r=>out.set(r.id,r));
  if(k.length>=4)IX.forEach((a,kk)=>{if(kk.length>=4&&(kk.startsWith(k)||k.startsWith(kk)))a.forEach(r=>out.set(r.id,r))})});
  return [...out.values()].sort((a,b)=>String(b.date).localeCompare(String(a.date)))}
function phCount(id){try{const s=g.VRTPhotos&&g.VRTPhotos.summary?g.VRTPhotos.summary('sample',id):null;return s?s.total||0:0}catch(_){return 0}}
const mkLine=r=>[r.mkLen?'長 '+r.mkLen:'',r.mkWidth?'幅 '+r.mkWidth:'',r.mkEff?'利用率 '+String(r.mkEff).replace(/%$/,'')+'%':'',r.mkRatio?'配比 '+r.mkRatio:'',r.mkLayers?r.mkLayers+' 層':''].filter(Boolean).join(' · ');
/* 款式卡上的區塊 */
function block(key,title){if(!LOADED)return '';const a=find(key,title);if(!a.length)return '';const mk=a.filter(r=>r.kind==='marker'||r.mkLen||r.mkEff);const smp=a.filter(r=>r.kind!=='marker');
  const q=a.reduce((s,r)=>s+(+r.qty||0),0);
  return `<div class="vsb" style="background:#fdf4ff;border:1px solid #e879f9;border-left:6px solid #c026d3;border-radius:12px;padding:10px 12px;margin:8px 0;color:#4a044e;font-size:13px;line-height:1.5">
   <b style="font-size:14px">🧪 樣品組記錄 ${a.length} 筆（打樣 ${smp.length}${q?`、共 ${q} 件`:''}${mk.length?`、馬克 ${mk.length}`:''}）｜Sample room</b>
   ${a.slice(0,6).map(r=>{const k=KIND[r.kind]||KIND.other,s=STA[r.status],n=phCount(r.id);return `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #f0abfc"><span style="display:inline-block;background:${k[4]};color:#fff;border-radius:99px;padding:0 8px;font-size:11px;font-weight:800">${k[1]} ${E(k[2])}</span> <b>${E(r.date)}</b> ${E([r.color,r.size].filter(Boolean).join(' / '))}${r.qty?` · ${E(r.qty)} 件`:''}${r.maker?` · ${E(r.maker)}`:''}${s?` · <b style="color:${s[3]}">${E(s[1])}</b>`:''}${n?` · 📷 ${n}`:''}${mkLine(r)?`<br>📐 ${E(mkLine(r))}`:''}${r.remarks?`<br>${E(String(r.remarks).slice(0,90))}`:''}</div>`}).join('')}
   <div style="margin-top:6px"><a href="vrt_sample_v1.html#q=${encodeURIComponent(key||title||'')}" target="_blank" style="color:#a21caf;font-weight:700">看這一款全部打樣／馬克（含排版圖） ›</a></div></div>`}
function start(){load().catch(()=>{})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
g.VRTSample={version:'1.0.0',KINDS,KIND,STATUS,STA,load,save,upsert,find,block,mkLine,newId,ymd,nk,cloudOk:()=>CLOUD===true,rows:()=>ROWS.filter(r=>!r.deleted),all:()=>ROWS,on:f=>LIS.push(f)};
})(window);
