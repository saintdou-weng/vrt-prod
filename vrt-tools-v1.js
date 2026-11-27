/* VRT 生產器具與工具 v1.0（2026-11-27）
   Paul 11/27：棧板（木／塑膠／大塑膠）、布架、輔料架、存放櫃、紙版架、大組長鐵櫃、桌椅、籃子、推車、鐵牛車、布尺、沙剪、
   機修喇叭與工具、裁桌、品管桌、實驗室測試設備……不像資產、是生產用的器具和物品，要登記、有照片、有編號／QR code，
   可用 Excel／PDF 更新。
   · 一筆＝一種東西放在一個地方（例：B 廠布倉・大塑膠棧板・120 片），或一台要個別管的設備（例：鐵牛車、色燈箱）。
   · 編號：類別代碼-廠-流水號，例 PL-B-003；QR code 掃了直接打開這一筆。
   · 車縫機台不放這裡（在「機修零件 → 機台清冊」）；機針、零件耗材也在機修零件頁。
   · 資料：雲端工具 'tools'（跟其他頁同一個 GAS，依類別分桶同步），本機 IndexedDB 快取；公開 repo 不放任何資料。
   · 照片：共用 VRTPhotos，類別 'tool'（標準照＋每月照片）。 */
(function(g){
'use strict';
if(g.VRTTools)return;
const TOOL='tools',IDB='vrt_tools_v1',CACHE='rows';
/* [代碼, 圖示, 中文, English, ខ្មែរ, 編號字首, 預設管理方式 qty=算數量 / unit=一台一筆, 常見細項] */
const CATS=[
 ['pallet','🟫','棧板','Pallets','បន្ទះទ្រ','PL','qty',['木棧板','塑膠棧板','大塑膠棧板']],
 ['rack','🗄️','料架','Racks & shelves','ធ្នើ','RK','qty',['布架','輔料架','成品架','裁片架','鐵架']],
 ['cabinet','🗃️','櫃子','Cabinets','ទូ','CB','unit',['存放櫃','鐵櫃（大組長）','工具櫃','檔案櫃','剪刀櫃（上鎖）']],
 ['table','🟦','桌子','Tables','តុ','TB','qty',['裁桌','品管桌','包裝桌','燙台','工作桌','辦公桌']],
 ['chair','💺','椅子','Chairs','កៅអី','CH','qty',['車縫椅','高腳椅','辦公椅','塑膠椅','長板凳']],
 ['basket','🧺','籃子／箱子','Baskets & bins','កន្ត្រក','BK','qty',['大籃（裝衣）','小籃（輔料）','可推籃車','輔料箱','塑膠箱']],
 ['cart','🛒','推車／搬運','Carts & trucks','រទេះ','TR','unit',['鐵牛車（油壓拖板車）','手推車','籠車','布捲推車']],
 ['cuttool','✂️','剪刀／量具','Scissors & measures','កន្ត្រៃ/ម៉ែត្រ','CT','qty',['布尺','沙剪（紗剪）','大剪刀','直尺／角尺','裁剪刀片']],
 ['attach','🎺','車縫附件（喇叭、壓腳）','Sewing attachments','គ្រឿងភ្ជាប់','FD','qty',['喇叭（捲邊器）','壓腳','導規','模板','針板']],
 ['mtool','🔧','機修工具','Maintenance tools','ឧបករណ៍ជួសជុល','MT','unit',['手工具','電動工具','量測工具','工具箱']],
 ['qc','🔬','QC／實驗室設備','QC & lab equipment','ឧបករណ៍ QC','QC','unit',['色燈箱','電子秤','驗針機','拉力計','縮水測試','驗布機','溫濕度計','色卡']],
 ['pattern','📐','紙版存放','Pattern storage','ទុកប៉ាតង់','PT','qty',['紙版架','紙版櫃','紙版掛桿']],
 ['other','📦','其他','Other','ផ្សេងៗ','OT','qty',[]]];
const CAT=Object.fromEntries(CATS.map(c=>[c[0],c]));
const SITES=[['A','A 廠','Factory A','រោងចក្រ A'],['B','B 廠','Factory B','រោងចក្រ B']];
const AREAS=[['sew','車間','Sewing floor','ផ្នែកដេរ'],['fg','成品倉','FG warehouse','ឃ្លាំងទំនិញ'],['cut','裁剪','Cutting','ផ្នែកកាត់'],['panel','裁片區','Cut-panel area','កន្លែងបន្ទះកាត់'],
 ['fabric','布倉','Fabric warehouse','ឃ្លាំងក្រណាត់'],['trim','輔料倉','Trim warehouse','ឃ្លាំងគ្រឿងបន្សំ'],['pack','包裝','Packing','វេចខ្ចប់'],['iron','整燙','Ironing','អ៊ុត'],
 ['qc','QC／實驗室','QC / Lab','QC / មន្ទីរពិសោធន៍'],['mnt','機修房','Maintenance room','បន្ទប់ជួសជុល'],['pattern','紙版房','Pattern room','បន្ទប់ប៉ាតង់'],['office','辦公室','Office','ការិយាល័យ'],['other','其他','Other','ផ្សេងៗ']];
const AREA=Object.fromEntries(AREAS.map(a=>[a[0],a]));
const STATUS=[['ok','良好','Good','ល្អ','#059669'],['repair','待修','Needs repair','ត្រូវជួសជុល','#d97706'],['scrap','報廢','Scrapped','បោះបង់','#64748b'],['lost','遺失','Missing','បាត់','#dc2626']];
const STA=Object.fromEntries(STATUS.map(s=>[s[0],s]));
let ROWS=[],LOADED=false,LOADING=null;const LIS=[];
function gas(){try{if(g.VRTPlatform&&g.VRTPlatform.getGasUrl){const u=g.VRTPlatform.getGasUrl();if(u)return u}}catch(_){}try{return (g.VRT_DEPLOY_CONFIG&&g.VRT_DEPLOY_CONFIG.gasUrl)||localStorage.getItem('vrt_portal_gas_url')||''}catch(_){return ''}}
function idb(){return new Promise((res,rej)=>{const q=indexedDB.open(IDB,1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function iget(k){const d=await idb();return new Promise(r=>{const t=d.transaction('kv').objectStore('kv').get(k);t.onsuccess=()=>r(t.result);t.onerror=()=>r(null)})}
async function iset(k,v){const d=await idb();return new Promise(r=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>r(true);t.onerror=()=>r(false)})}
function set(rows){ROWS=(rows||[]).filter(r=>r&&r.id);LOADED=true;LIS.forEach(f=>{try{f(ROWS)}catch(_){}})}
async function load(force){if(LOADING&&!force)return LOADING;
  return LOADING=(async()=>{const c=await iget(CACHE).catch(()=>null);if(c&&c.rows&&!LOADED)set(c.rows);const G=gas();if(!G){if(!LOADED)set([]);return ROWS}
    try{const m=await fetch(G+'?action=smartManifest&tool='+TOOL+'&t='+Date.now(),{redirect:'follow',cache:'no-store'}).then(r=>r.json());const d=m.data||m;const H=d.hashes||{};
      if(!d.exists&&!Object.keys(H).length){if(!LOADED)set([]);return ROWS}
      const ch=(c&&c.h)||{},cb=(c&&c.b)||{},b={},h={};
      await Promise.all(Object.keys(H).map(async k=>{if(ch[k]===H[k]&&cb[k]){b[k]=cb[k];h[k]=H[k];return}const j=await fetch(G+'?action=smartBucket&tool='+TOOL+'&bucket='+encodeURIComponent(k)+'&hash='+encodeURIComponent(H[k])+'&t='+Date.now(),{redirect:'follow',cache:'no-store'}).then(r=>r.json());const dd=j.data||j;b[k]=dd.records||dd.rows||[];h[k]=H[k]}));
      const rows=Object.values(b).flat();await iset(CACHE,{rows,h,b,at:new Date().toISOString()});set(rows)}catch(e){console.warn('[VRTTools] cloud',e);if(!LOADED)set(c&&c.rows||[])}
    return ROWS})()}
function smartSync(){return new Promise((res,rej)=>{if(g.VRTSmartSync)return res(g.VRTSmartSync);const s=document.createElement('script');s.src='vrt-smart-sync-v3.js?v=4.19.0';s.onload=()=>g.VRTSmartSync?res(g.VRTSmartSync):rej(new Error('Smart Sync 沒載入'));s.onerror=()=>rej(new Error('Smart Sync 沒載入'));document.head.appendChild(s)})}
/* 寫：整份上傳（依類別分桶 p:tools_pallet…，只傳有變的桶）；刪除＝標記 deleted，不真的刪 */
async function save(rows,onStatus){rows=rows.map(r=>Object.assign({},r,{_smartBucket:'tools_'+(CAT[r.cat]?r.cat:'other')}));const S=await smartSync();
  const res=await S.push({tool:TOOL,records:rows,meta:{kind:'tools',count:rows.length},onStatus:onStatus||(()=>{})});
  if(res&&res.ok===false)throw new Error(res.error||res.message||'上傳失敗');
  await iset(CACHE,{rows,h:{},b:{},at:new Date().toISOString()});set(rows);return res}
function nextCode(cat,site,rows){const p=(CAT[cat]||CAT.other)[5]+'-'+(site||'A')+'-';let n=0;(rows||ROWS).forEach(r=>{if(String(r.code||'').startsWith(p)){const x=parseInt(String(r.code).slice(p.length),10);if(x>n)n=x}});return p+String(n+1).padStart(3,'0')}
function upsert(rec,rows){rows=(rows||ROWS).slice();const now=new Date().toISOString();rec=Object.assign({},rec,{updatedAt:now});
  if(!rec.cat)rec.cat='other';if(!rec.track)rec.track=(CAT[rec.cat]||CAT.other)[6];if(!rec.status)rec.status='ok';
  if(!rec.code)rec.code=nextCode(rec.cat,rec.site,rows);if(!rec.id)rec.id='T'+rec.code.replace(/[^A-Z0-9]/gi,'')+'_'+Math.random().toString(36).slice(2,6);
  const i=rows.findIndex(r=>r.id===rec.id);if(i>=0)rows[i]=Object.assign({},rows[i],rec);else rows.push(Object.assign({createdAt:now},rec));return rows}
const byCode=c=>{c=String(c||'').trim().toUpperCase();return ROWS.find(r=>!r.deleted&&String(r.code||'').toUpperCase()===c)};
g.VRTTools={version:'1.0.0',CATS,CAT,SITES,AREAS,AREA,STATUS,STA,load,save,upsert,nextCode,byCode,rows:()=>ROWS.filter(r=>!r.deleted),all:()=>ROWS,on:f=>LIS.push(f)};
})(window);
