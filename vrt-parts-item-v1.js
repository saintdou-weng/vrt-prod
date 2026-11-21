/* VRT 機修零件：點一列就開這個零件的物品頁 v1.0（2026-11-21）
   Paul 11/21：「機修零件按了還是沒出現卡片跟相關資訊」「列表要清楚整齊，手機秒懂」
   - 每個分頁（零件清單／採購記錄／機台零件庫存／機針庫存／換針／換零件／機台清冊）點一列 → 物品頁（照片、結存走勢、領用、換零件紀錄…，跟入口頁同一頁，可 ◀ ▶、往下連續滑）。
   - 手機（窄螢幕）預設改成「卡片清單」：左邊標準照小圖（沒照片顯示 📷缺），中間名稱（英文一行、柬／中一行），右邊大數字（結存／數量）。上面一個開關可切回原本的表格（編輯／刪除按鈕在表格）。
   - 不改任何資料、不改匯入；只是加點擊和顯示。 */
(function(g){
'use strict';
if(g.VRTPartsItem)return;
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nk=v=>String(v==null?'':v).replace(/[​﻿]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const F=v=>(v==null||v===''||!isFinite(+v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
const tab=()=>{try{return _curTab}catch(_){return ''}};
const lang=()=>{try{return _lang||'zh'}catch(_){return 'zh'}};
const L=(zh,en,km)=>{const l=lang();return l==='en'?en:l==='km'?(km||en):zh};
let M=null,mAt=0;
async function meta(){if(M&&Date.now()-mAt<4000)return M;try{const m=await idbGetMeta('maintenance39');M=m||{};mAt=Date.now()}catch(_){M=M||{}}return M}
function parts(){try{return PARTS||[]}catch(_){return []}}
function splitName(s){s=String(s||'').replace(/[​﻿]/g,'').trim();const en=(s.match(/[A-Za-z][A-Za-z0-9 ,.#\-\/()+]*/g)||[]).join(' ').replace(/\s+/g,' ').replace(/^[ ,]+|[ ,]+$/g,'').trim();
  const zh=(s.match(/[㐀-鿿（）、]+/g)||[]).join(' '),km=(s.match(/[ក-៿]+/g)||[]).join(' ');return {en:en||s,zh,km}}
const phS=(d,k)=>{try{return g.VRTPhotos?g.VRTPhotos.summary(d,k):null}catch(_){return null}};

/* ── 每個分頁：哪一欄是名稱、哪個數字放大、點了開哪一種物品頁 ── */
const idOf=(tr,re)=>{const b=tr.querySelector('[onclick*="'+re+'"]');const m=b&&String(b.getAttribute('onclick')).match(/'([^']+)'\s*\)\s*$/);return m?m[1]:''};
function itemFor(t,tr,td,M){
  if(t==='inventory'){const no=td[0]&&td[0].textContent.trim();if(!no)return null;const p=parts().find(x=>x.partNo===no)||{};const st=td[11]?td[11].innerHTML:'';
    return {kind:'parts',key:no,dom:'parts',pk:no,t1:no+(p.name?' · '+p.name:''),t2:[p.spec,p.category,p.location].filter(Boolean).join(' · '),big:F(p.qty),bigL:p.unit||L('庫存','Stock','ស្តុក'),tag:st}}
  if(t==='history'){const no=td[1]&&td[1].textContent.trim();if(!no)return null;
    return {kind:'parts',key:no,dom:'parts',pk:no,t1:no+(td[2]&&td[2].textContent.trim()?' · '+td[2].textContent.trim():''),t2:(td[0]?td[0].textContent:'')+' · '+(td[7]?td[7].textContent:''),big:td[4]?td[4].textContent:'',bigL:td[3]?td[3].textContent:'',tag:''}}
  if(t==='machine'||t==='needle'){const id=idOf(tr,'editStock');const reps=(M.stockReports||[]);let x=null;for(const r of reps){x=(r.items||[]).find(i=>i.id===id);if(x)break}
    const name=x?x.name:(td[1]?td[1].textContent:''),size=x?x.size:(td[2]?td[2].textContent:'');if(!String(name).trim())return null;const s=splitName(name);
    const close=x?(x.closingQty!=null?x.closingQty:x.balance):null,iss=x?(x.issuedQty!=null?x.issuedQty:x.used):null;
    const key=nk(name);/* 入口頁的「機台零件／機針（每日報表的品項）」用名稱當 key（機針日報也在裡面） */
    return {kind:'parts',key,dom:'parts',pk:key,t1:s.en+(String(size||'').trim()&&!/^[-—]$/.test(size)?' · '+size:''),t2:[s.km,s.zh].filter(Boolean).join(' · '),
      big:F(close),bigL:L('結存','Balance','នៅសល់'),tag:(iss?'<span class="pi-b">'+L('領用','Issued','ផ្តល់')+' '+F(iss)+'</span>':'')+(close!=null&&+close<=0?'<span class="pi-b bad">'+L('沒有庫存','Out of stock','អស់')+'</span>':'')}}
  if(t==='needlechange'||t==='partchange'){const id=idOf(tr,'editChange');const list=t==='needlechange'?(M.needleChanges||[]):(M.partChanges||[]);const r=list.find(x=>x.id===id);if(!r)return null;
    const nm=r.needleType||r.partType||'',s=splitName(nm);const key=t==='needlechange'?nk(nm)+(r.size?' · '+nk(r.size):''):nk(nm);
    return {kind:t==='needlechange'?'needle':'parts',key,dom:t==='needlechange'?'needle':'parts',pk:key,t1:s.en+(r.size?' · '+r.size:''),t2:[r.date,[r.line,r.machine].filter(Boolean).join(' / '),r.reason].filter(Boolean).join(' · '),big:F(r.qty),bigL:t==='needlechange'?L('支','pcs','ម្ជុល'):L('件','pcs','ដុំ'),tag:''}}
  if(t==='machines'){const a=td[0]&&td[0].textContent.trim();if(!a)return null;
    return {kind:'machine',key:nk(a),dom:'machine',pk:nk(a),t1:a+(td[2]?' · '+td[2].textContent.trim():''),t2:[td[4]&&td[4].textContent.trim(),td[5]&&td[5].textContent.trim()].filter(x=>x&&x!=='—').join(' · '),big:'',bigL:'',tag:''}}
  return null}
const TABS=['inventory','history','machine','needle','needlechange','partchange','machines'];

function css(){if(document.getElementById('piCss'))return;const s=document.createElement('style');s.id='piCss';s.textContent=`
#app tr.pi-row{cursor:pointer}#app tr.pi-row:hover td{background:#eef4ff}
.pi-mini{width:30px;height:30px;border-radius:7px;object-fit:cover;vertical-align:middle;margin-right:6px;border:1px solid #e2e8f0}
.pi-miss{display:inline-block;font-size:10px;font-weight:700;color:#94a3b8;border:1px dashed #cbd5e1;border-radius:7px;padding:5px 3px;margin-right:6px;vertical-align:middle;line-height:1}
.pi-sw{display:flex;gap:6px;align-items:center;margin:4px 0 8px;font-size:12px;color:var(--sub,#64748b)}.pi-sw button{white-space:nowrap;border:1px solid var(--line,#e2e8f0);background:var(--card,#fff);color:inherit;border-radius:99px;padding:5px 11px;font:inherit;cursor:pointer}.pi-sw button.on{background:#4f46e5;border-color:#4f46e5;color:#fff;font-weight:700}
.pi-list{display:flex;flex-direction:column;gap:6px}
.pi-it{display:flex;gap:10px;align-items:center;background:var(--card,#fff);border:1px solid var(--line,#e2e8f0);border-radius:12px;padding:8px 10px;cursor:pointer}
.pi-it:active{background:#eef4ff}
.pi-ph{width:52px;height:52px;flex:none;border-radius:10px;background:#f1f5f9 center/cover no-repeat;display:grid;place-items:center;color:#94a3b8;font-size:10px;text-align:center;line-height:1.2;border:1px dashed #cbd5e1}
.pi-ph.has{border:1px solid #e2e8f0}
.pi-tx{flex:1;min-width:0}.pi-tx b{display:block;font-size:14px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.pi-tx span{display:block;font-size:12px;color:var(--sub,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pi-n{text-align:right;flex:none;min-width:54px}.pi-n b{display:block;font-size:19px;line-height:1.1}.pi-n small{font-size:11px;color:var(--sub,#64748b)}
.pi-b{display:inline-block;font-size:11px;font-weight:700;border-radius:99px;padding:1px 7px;margin:3px 4px 0 0;background:#eef2ff;color:#3730a3}.pi-b.bad{background:#fee2e2;color:#991b1b}
.pi-go{color:#94a3b8;font-size:18px;flex:none}
.pi-hide{display:none!important}
@media (max-width:759px){.pi-sw span{display:none}body.pi-compact .toolbar{padding:6px 8px;gap:6px}body.pi-compact .toolbar .tb-group{gap:4px}body.pi-compact #partsGlobalPeriod43 .tb-lbl{display:none}
 body.pi-compact #partsGlobalPeriod43 .chip{padding:4px 8px;font-size:12px}
 body.pi-compact:not(.pi-more) #fStore,body.pi-compact:not(.pi-more) #fCat,body.pi-compact:not(.pi-more) #fBrand,body.pi-compact:not(.pi-more) .toolbar .tb-group.pi-imp{display:none!important}
 body.pi-compact #fSearch{flex:1;min-width:0}body.pi-compact .pi-morebtn{display:inline-flex}
 body.pi-embed .header{display:none!important}}
.pi-morebtn{display:none;border:1px solid var(--line,#e2e8f0);background:var(--card,#fff);color:inherit;border-radius:8px;padding:0 10px;min-height:38px;align-items:center;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}`;document.head.appendChild(s)}

function narrow(){return (g.innerWidth||1000)<760}
function mode(){let m='';try{m=localStorage.getItem('vrt_pi_mode')||''}catch(_){}return m||(narrow()?'card':'table')}
function setMode(m){try{localStorage.setItem('vrt_pi_mode',m)}catch(_){}deco(true)}

function open(it){if(!it)return;
  try{if(g.parent&&g.parent!==g&&typeof g.parent.VRTHubOpen==='function'){g.parent.VRTHubOpen(it.kind,it.key);return}}catch(_){}
  g.open('vrt_hub_v1.html#open='+encodeURIComponent(it.kind+'|'+it.key),'_blank')}

let busy=false;
async function deco(force){if(busy)return;busy=true;try{const t=tab();if(!TABS.includes(t))return;const app=document.getElementById('app');if(!app)return;css();const MM=await meta();
  app.querySelectorAll('table').forEach(tb=>{const body=tb.tBodies[0];if(!body)return;const rows=[...body.rows].filter(r=>r.cells.length>2);if(!rows.length)return;
    const wrap=tb.closest('.tw')||tb;let items=[];
    rows.forEach((tr,i)=>{const td=[...tr.cells];const it=itemFor(t,tr,td,MM);items.push(it);if(!it)return;tr.classList.add('pi-row');tr.dataset.pi=i;
      /* 名稱欄旁邊放小圖 */
      const ci=t==='history'?1:t==='inventory'||t==='machines'?0:1,c=td[ci];if(c){const ps=phS(it.dom,it.pk);const sig=ps&&ps.cover?ps.cover.slice(-32):'none';if(c.dataset.pi!==sig){c.dataset.pi=sig;c.querySelectorAll('.pi-mini,.pi-miss').forEach(x=>x.remove());c.insertAdjacentHTML('afterbegin',ps&&ps.cover?'<img class="pi-mini" src="'+ps.cover+'" alt="">':'<span class="pi-miss" title="'+L('還沒有標準照','No photo yet','គ្មានរូប')+'">📷缺</span>')}}});
    tb.__pi=items;
    if(!tb.__piClick){tb.__piClick=1;tb.addEventListener('click',e=>{if(e.target.closest('button,input,select,a,label,textarea'))return;const tr=e.target.closest('tr.pi-row');if(!tr)return;open((tb.__pi||[])[+tr.dataset.pi])})}
    /* 卡片清單（手機預設） */
    let sw=wrap.previousElementSibling&&wrap.previousElementSibling.classList.contains('pi-cards')?wrap.previousElementSibling:null;
    const m=mode();const ok=items.filter(Boolean);
    if(!ok.length){if(sw)sw.remove();wrap.classList.remove('pi-hide');return}
    const sig=m+'|'+ok.length+'|'+ok.map(x=>x.key+x.big).join('|').length+'|'+(g.VRTPhotos?ok.map(x=>{const p=phS(x.dom,x.pk);return p&&p.cover?1:0}).join(''):'');
    if(sw&&sw.dataset.sig===sig&&!force)return;
    if(!sw){sw=document.createElement('div');sw.className='pi-cards';wrap.parentNode.insertBefore(sw,wrap)}sw.dataset.sig=sig;
    const head='<div class="pi-sw">'+L('顯示方式','View','បង្ហាញ')+'：<button data-pm="card" class="'+(m==='card'?'on':'')+'">📇 '+L('卡片','Cards','កាត')+'</button><button data-pm="table" class="'+(m==='table'?'on':'')+'">📋 '+L('表格','Table','តារាង')+'</button><span style="margin-left:auto">'+L('點一下看照片、紀錄；要編輯切到表格','Tap for photo & history; edit in Table','ចុចមើល')+'</span></div>';
    if(m!=='card'){sw.innerHTML=head;wrap.classList.remove('pi-hide');return}
    wrap.classList.add('pi-hide');
    sw.innerHTML=head+'<div class="pi-list">'+items.map((x,i)=>{if(!x)return '';const ps=phS(x.dom,x.pk);
      return '<div class="pi-it" data-i="'+i+'"><div class="pi-ph'+(ps&&ps.cover?' has" style="background-image:url(\''+ps.cover+'\')">':'">📷<br>'+L('缺照片','No photo','គ្មាន'))+'</div><div class="pi-tx"><b>'+E(x.t1)+'</b>'+(x.t2?'<span>'+E(x.t2)+'</span>':'')+(x.tag?'<div>'+x.tag+'</div>':'')+'</div>'+(x.big!==''?'<div class="pi-n"><b>'+E(x.big)+'</b><small>'+E(x.bigL)+'</small></div>':'')+'<span class="pi-go">›</span></div>'}).join('')+'</div>';
    sw.onclick=e=>{const b=e.target.closest('[data-pm]');if(b){setMode(b.dataset.pm);return}const c=e.target.closest('.pi-it');if(c)open(items[+c.dataset.i])}})
  }catch(e){console.warn('[VRTPartsItem]',e)}finally{busy=false}}

let dt=0;const later=()=>{clearTimeout(dt);dt=setTimeout(()=>deco(false),180)};
function compact(){const b=document.body;b.classList.add('pi-compact');try{if(g.parent&&g.parent!==g&&g.parent.VRT_HUBS)b.classList.add('pi-embed')}catch(_){}
  const q=document.getElementById('fSearch');if(q&&!document.querySelector('.pi-morebtn')){q.placeholder='🔍 '+L('搜尋名稱／料號／機台','Search name / part / machine','ស្វែងរក');const bt=document.createElement('button');bt.type='button';bt.className='pi-morebtn';bt.textContent='⚙️ '+L('篩選／匯入','Filter / import','តម្រង');bt.onclick=()=>b.classList.toggle('pi-more');q.after(bt);
    const imp=document.getElementById('maintenanceImport');const grp=imp&&imp.closest('.tb-group');if(grp)grp.classList.add('pi-imp')}}
function init(){const app=document.getElementById('app');if(!app)return;css();try{compact()}catch(_){}
  new MutationObserver(ms=>{if(ms.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&!(n.classList&&(n.classList.contains('pi-cards')||n.classList.contains('pi-mini')||n.classList.contains('pi-miss')))&&!(n.closest&&n.closest('.pi-cards')))))later()}).observe(app,{childList:true,subtree:true});
  try{g.VRTPhotos&&g.VRTPhotos.on(()=>deco(true))}catch(_){}
  let w=narrow();g.addEventListener('resize',()=>{if(narrow()!==w){w=narrow();deco(true)}});later()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,200));else setTimeout(init,200);
g.VRTPartsItem={version:'1.0.0',deco,open,itemFor};
})(window);
