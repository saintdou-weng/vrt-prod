/* VRT 布料／副料 料號頁 v1.0（2026-11-20）
   Paul 11/20：布料資料要學 PSJHR 員工頁——點一列就開這個料號的頁：上面照片＋料號＋品名，一眼就知道是什麼；分頁（基本／庫存缸號／進出／照片／管理）；
   捲到底自動接下一個料號（連續往下滑），◀ ▶、左右滑照舊；表格裡料號旁邊放標準照小圖，沒照片顯示「📷 缺」；
   同一張照片不會重複放，以前的標準照收在「歷史照片」。原本的編輯／刪除、匯入、匯出都不動（在「✏️ 管理」分頁）。 */
(function(g){
'use strict';
if(g.VRTFabItem)return;
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{const n=+String(v==null?'':v).replace(/,/g,'');return isFinite(n)?n:0};
const F=(n,d)=>(n==null||n===''||!isFinite(+n))?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:d==null?1:d});
const DBX=()=>{try{return DB}catch(_){return g.DB||{}}};
const domOf=kind=>kind==='acc'?'accessory':'fabric';
const nk=v=>String(v==null?'':v).trim().toUpperCase();
function css(){if(document.getElementById('fiCss'))return;const s=document.createElement('style');s.id='fiCss';s.textContent=`
.fi-mask{position:fixed;inset:0;z-index:99970;background:rgba(2,6,23,.5);display:flex;padding:8px}
.fi-box{margin:auto;width:min(1000px,100%);height:100%;background:#f4f6fb;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;color:#0f172a;font:14px/1.45 system-ui,-apple-system,"Segoe UI","Noto Sans TC","Noto Sans Khmer",sans-serif}
.fi-hd{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border-bottom:1px solid #e2e8f0}
.fi-hd button{border:1px solid #e2e8f0;background:#fff;border-radius:10px;min-width:40px;height:38px;font-size:16px;cursor:pointer}.fi-hd button:disabled{opacity:.35}
.fi-pos{color:#64748b;font-size:12px;margin-right:auto}
.fi-top{display:flex;gap:12px;align-items:center;padding:10px 12px;background:#fff;border-bottom:1px solid #e2e8f0}
.fi-ph{width:76px;height:76px;flex:none;border-radius:12px;background:#f1f5f9 center/cover no-repeat;border:2px solid #f59e0b;cursor:pointer;display:grid;place-items:center;text-align:center;color:#94a3b8;font-size:11px;line-height:1.3}
.fi-ph.none{border:2px dashed #cbd5e1}
.fi-tt{min-width:0;flex:1}.fi-tt b{font-size:19px;display:block}.fi-tt span{color:#475569;font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fi-chips{margin-top:4px;display:flex;gap:5px;flex-wrap:wrap}.fi-chip{font-size:11px;font-weight:700;border-radius:99px;padding:2px 8px;background:#eef2ff;color:#3730a3}.fi-chip.ok{background:#dcfce7;color:#166534}.fi-chip.warn{background:#fef3c7;color:#92400e}.fi-chip.bad{background:#fee2e2;color:#991b1b}
.fi-tabs{display:flex;gap:2px;padding:4px 8px;background:#fff;border-bottom:1px solid #e2e8f0;overflow-x:auto}
.fi-tabs button{border:0;background:none;padding:8px 11px;font-size:13px;white-space:nowrap;cursor:pointer;color:#475569;border-bottom:2px solid transparent}.fi-tabs button.on{color:#4338ca;font-weight:700;border-bottom-color:#4338ca}
.fi-body{flex:1;overflow:auto;padding:10px 12px 26px}
.fi-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px}
.fi-kv div small{display:block;color:#64748b;font-size:11px}.fi-kv div b{font-weight:600;word-break:break-word}
.fi-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:8px 0}.fi-kpi{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:8px 10px}.fi-kpi b{display:block;font-size:18px}.fi-kpi small{color:#64748b;font-size:11px}
.fi-body h4{margin:14px 0 6px;font-size:14px}
.fi-tb{overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px}.fi-tb table{border-collapse:collapse;width:100%;font-size:12.5px}.fi-tb th,.fi-tb td{padding:6px 8px;border-bottom:1px solid #eef2f7;text-align:left;white-space:nowrap}.fi-tb th{background:#f8fafc;color:#64748b;font-size:11px;position:sticky;top:0}.fi-tb td.n{text-align:right}
.fi-bars{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:8px 10px}.fi-bar{display:flex;align-items:center;gap:8px;font-size:12px;margin:3px 0}.fi-bar span{width:70px;color:#64748b}.fi-bar i{flex:1;height:12px;background:#f1f5f9;border-radius:6px;overflow:hidden}.fi-bar i em{display:block;height:100%;background:#6366f1;border-radius:6px}.fi-bar b{width:70px;text-align:right}
.fi-sec{margin-top:20px;border-top:3px dashed #e2e8f0;padding-top:6px}
.fi-sh{display:flex;align-items:center;gap:10px;padding:8px;margin:8px 0;background:#fff;border:1px solid #e2e8f0;border-radius:12px;cursor:pointer}.fi-sh .fi-ph{width:56px;height:56px}.fi-sh b{font-size:16px}.fi-sh span{color:#64748b;font-size:12px}
.fi-more{margin-top:14px;padding:12px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:12px;cursor:pointer;font-size:13px}
.fi-btn{border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer;font-size:13px;margin:4px 6px 4px 0}
.fi-btn.r{border-color:#fecaca;background:#fef2f2;color:#b91c1c}
.fi-mini{width:30px;height:30px;border-radius:7px;object-fit:cover;vertical-align:middle;margin-right:6px;border:1px solid #e2e8f0}
.fi-miss{display:inline-block;font-size:10px;font-weight:700;color:#94a3b8;border:1px dashed #cbd5e1;border-radius:7px;padding:5px 4px;margin-right:6px;vertical-align:middle;line-height:1}
@media (max-width:640px){.fi-mask{padding:0}.fi-box{border-radius:0}.fi-ph{width:64px;height:64px}.fi-tt b{font-size:17px}}`;document.head.appendChild(s)}

/* ── 這個 kind 的列（跟頁面點的順序一樣）→ 不重複的料號 ── */
function rowsOf(kind){if(kind==='cur')return g._curRows||[];if(kind==='old')return g._oldRows||[];return (g._accRows||[]).slice().sort((a,b)=>num(b.balance)-num(a.balance))}
function codesOf(kind){const seen=new Set(),out=[];rowsOf(kind).forEach(r=>{const c=String(r&&r.itemCode||'').trim();if(c&&!seen.has(nk(c))){seen.add(nk(c));out.push(c)}});return out}
function info(kind,code){const D=DBX(),K=nk(code);const cur=(D.current||[]).filter(r=>nk(r.itemCode)===K),old=(D.old||[]).filter(r=>nk(r.itemCode)===K),acc=(D.accessory||[]).filter(r=>nk(r.itemCode)===K);
  const snaps=[...new Set(cur.map(r=>r.snapshotDate).filter(Boolean))].sort();const lastSnap=snaps[snaps.length-1]||'';const lots=cur.filter(r=>r.snapshotDate===lastSnap);
  const any=lots[0]||cur[0]||acc[0]||old[0]||{};const unit=any.unit||'';const total=kind==='acc'?acc.reduce((s,r)=>s+num(r.balance),0):lots.reduce((s,r)=>s+num(r.quantity),0);
  const hist=snaps.map(d=>({d,v:cur.filter(r=>r.snapshotDate===d).reduce((s,r)=>s+num(r.quantity),0)}));
  const set=(a,k)=>[...new Set(a.map(r=>r[k]).filter(Boolean))];
  return {code,K,cur,old,acc,lots,lastSnap,any,unit,total,hist,locs:set(kind==='acc'?acc:lots,'location'),custs:set(cur.concat(old,acc),'customer'),pos:set(cur.concat(old),'po'),styles:set(old,'style'),desc:any.description||'',erp:any.erpCode||''}}
const photoSum=(kind,code)=>{try{return g.VRTPhotos?g.VRTPhotos.summary(domOf(kind),code):null}catch(_){return null}};

const TABS=[['basic','📋 基本 Basic'],['lots','📦 庫存 Stock'],['move','🔄 進出 In/Out'],['ph','📷 照片 Photos'],['edit','✏️ 管理 Edit']];
function bars(list){if(!list.length)return '<p style="color:#64748b">還沒有資料</p>';const mx=Math.max(1,...list.map(x=>x.v));return '<div class="fi-bars">'+list.slice(-12).map(x=>`<div class="fi-bar"><span>${E(String(x.d).slice(5)||x.d)}</span><i><em style="width:${Math.max(2,x.v/mx*100)}%"></em></i><b>${F(x.v)}</b></div>`).join('')+'</div>'}
function table(head,rows){return '<div class="fi-tb"><table><thead><tr>'+head.map(h=>`<th>${h}</th>`).join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):`<tr><td colspan="${head.length}" style="color:#64748b">沒有資料</td></tr>`)+'</tbody></table></div>'}
function body(kind,code,tab){const I=info(kind,code),u=E(I.unit);
  if(tab==='basic'){const a=I.any;const kv=[['料號 Item',code],['ERP 料號 ERP code',I.erp],['品名 Description',I.desc],['單位 Unit',I.unit],['幅寬 Width',a.width],['克重 Weight',a.weight],['顏色 Color',a.color||a.colorName||a.colorCode],['尺寸 Size',a.size],['供應商 Supplier',a.supplier],['儲位 Location',I.locs.join('、')],['客戶 Customer',I.custs.join('、')],['PO',I.pos.slice(0,6).join('、')]].filter(x=>x[1]!=null&&x[1]!=='');
    return `<div class="fi-kpis"><div class="fi-kpi"><b style="color:${I.total>0?'#059669':'#dc2626'}">${F(I.total)} ${u}</b><small>${kind==='acc'?'結存 Balance':'目前庫存 Stock'}${I.lastSnap?'（'+E(I.lastSnap.slice(5))+'）':''}</small></div><div class="fi-kpi"><b>${kind==='acc'?I.acc.length:I.lots.length}</b><small>${kind==='acc'?'筆 Rows':'缸號／批 Lots'}</small></div><div class="fi-kpi"><b>${F(I.old.reduce((s,r)=>s+num(r.quantity),0))}</b><small>領用 Used（全部）</small></div><div class="fi-kpi"><b>${I.hist.length}</b><small>次盤點 Counts</small></div></div>
      <div class="fi-kv">${kv.map(x=>`<div><small>${E(x[0])}</small><b>${E(x[1])}</b></div>`).join('')}</div>
      <p style="margin-top:10px"><button class="fi-btn" data-hub="1">🧶 入口頁看完整資料（裁剪用布、用在哪些款、出貨）↗</button></p>`}
  if(tab==='lots'){if(kind==='acc')return `<h4>🧷 副料每一筆 Rows</h4>`+table(['色號／顏色','尺寸','期初','進','出','結存','儲位'],I.acc.map(r=>`<tr><td>${E([r.colorCode,r.colorName].filter(Boolean).join(' '))}</td><td>${E(r.size)}</td><td class="n">${F(r.opening)}</td><td class="n">${F(r.inbound)}</td><td class="n">${F(r.outbound)}</td><td class="n"><b>${F(r.balance)}</b></td><td>${E(r.location)}</td></tr>`));
    return `<h4>📦 目前庫存（${E(I.lastSnap||'—')}）每個缸號 Lots</h4>`+table(['缸號／批號 Lot','數量 Qty','品質 Quality','儲位 Location','客戶 Customer','PO'],I.lots.slice().sort((a,b)=>num(b.quantity)-num(a.quantity)).map(r=>`<tr><td>${E(r.lotNumber)}</td><td class="n"><b>${F(r.quantity)}</b> ${E(r.unit)}</td><td>${E(r.quality)}</td><td>${E(r.location)}</td><td>${E(r.customer)}</td><td>${E(r.po)}</td></tr>`))+
      `<h4>📈 每次盤點的庫存 Stock at each count</h4>`+bars(I.hist)}
  if(tab==='move'){const us=I.old.slice().sort((a,b)=>String(b.useDate||'').localeCompare(String(a.useDate||'')));
    return `<h4>🔄 領用紀錄 Usage（新的在上面）</h4>`+table(['日期 Date','數量 Qty','款號 Style','客戶 Customer','PO','缸號 Lot'],us.slice(0,200).map(r=>`<tr><td>${E(r.useDate)}</td><td class="n"><b>${F(r.quantity)}</b> ${E(r.unit)}</td><td>${E(r.style)}</td><td>${E(r.customer)}</td><td>${E(r.po)}</td><td>${E(r.lotNumber)}</td></tr>`))+
      `<h4>📈 每次盤點的庫存 Stock at each count</h4>`+bars(I.hist)}
  if(tab==='ph')return '<div class="fi-phbox"></div>';
  if(tab==='edit'){const rows=kind==='acc'?I.acc:kind==='old'?I.old:I.lots;
    return `<h4>✏️ 編輯／刪除（原本的功能）</h4>`+table(['','日期','缸號／色號','數量','儲位'],rows.map(r=>`<tr><td><button class="fi-btn" data-ed="${E(r.id)}">編輯</button><button class="fi-btn r" data-del="${E(r.id)}">刪除</button></td><td>${E(r.snapshotDate||r.useDate||'')}</td><td>${E(r.lotNumber||r.colorCode||'')}</td><td class="n">${F(r.quantity!=null?r.quantity:r.balance)}</td><td>${E(r.location)}</td></tr>`))}
  return ''}
function phBlock(kind,code,cls){const ps=photoSum(kind,code);return ps&&ps.cover?`<div class="fi-ph ${cls||''}" data-ph="1" style="background-image:url('${ps.cover}')"></div>`:`<div class="fi-ph none ${cls||''}" data-ph="1">📷<br>缺照片<br><small>No photo</small></div>`}

function open(kind,i){css();const rows=rowsOf(kind);const r=rows[i];if(!r)return false;const codes=codesOf(kind);let k=Math.max(0,codes.findIndex(c=>nk(c)===nk(r.itemCode)));let tab=g.__fiTab||'basic';let base=k,io=null;
  const el=document.createElement('div');el.className='fi-mask';document.body.appendChild(el);
  const focus=on=>{try{if(g.parent&&g.parent!==g&&g.parent.VRTHubFocus)g.parent.VRTHubFocus(on)}catch(_){}};focus(true);
  const close=()=>{if(io)io.disconnect();el.remove();document.removeEventListener('keydown',key);off&&off();focus(false)};
  const key=e=>{if(document.querySelector('.vp-lb')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key==='Escape')close();if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1)};document.addEventListener('keydown',key);
  const go=d=>{const n=k+d;if(n<0||n>=codes.length)return;k=n;paint()};
  function head(){const c=codes[k];const I=info(kind,c);const ps=photoSum(kind,c);
    el.querySelector('.fi-pos').textContent=(k+1)+' / '+codes.length;el.querySelector('[data-a=p]').disabled=k===0;el.querySelector('[data-a=n]').disabled=k===codes.length-1;
    el.querySelector('.fi-top').innerHTML=phBlock(kind,c)+`<div class="fi-tt"><b>${E(c)}</b><span>${E(I.desc||I.erp||'')}</span><div class="fi-chips"><span class="fi-chip ${I.total>0?'ok':'bad'}">${F(I.total)} ${E(I.unit)}</span>${I.locs.length?`<span class="fi-chip">📍 ${E(I.locs.slice(0,3).join('、'))}${I.locs.length>3?'…':''}</span>`:''}${ps&&ps.total?`<span class="fi-chip">📷 ${ps.total}</span>`:'<span class="fi-chip warn">📷 缺照片</span>'}</div></div>`}
  function paint(){base=k;head();el.querySelector('.fi-tabs').innerHTML=TABS.map(t=>`<button data-t="${t[0]}" class="${t[0]===tab?'on':''}">${t[1]}</button>`).join('');
    const B=el.querySelector('.fi-body');B.innerHTML=body(kind,codes[k],tab);B.scrollTop=0;mountPh(B,codes[k]);cont(B)}
  function mountPh(B,c){B.querySelectorAll('.fi-phbox').forEach(x=>{if(x.dataset.done)return;x.dataset.done=1;if(g.VRTPhotos)g.VRTPhotos.mount(x,{domain:domOf(kind),key:c,name:c+(info(kind,c).desc?' · '+info(kind,c).desc:''),tip:'放這個料號正確的樣子（布面、顏色、標籤）；收到不一樣的放每月異常。'});else x.innerHTML='<p>照片元件沒有載入</p>'})}
  /* 捲到底自動接下一個料號（同一個分頁），捲到誰上面就換成誰 */
  function cont(B){if(io)io.disconnect();if(tab==='ph'||tab==='edit'||codes.length<2)return;let last=k;B.insertAdjacentHTML('beforeend','<div class="fi-more"></div>');const more=B.querySelector('.fi-more');
    const label=()=>{const nx=codes[last+1];more.innerHTML=nx?`⬇ 繼續往下捲：下一個 <b>${E(nx)}</b>`:'— 已經是最後一個 —'};
    const add=()=>{if(!more.isConnected)return false;const nx=codes[last+1];if(!nx)return false;last++;const I=info(kind,nx);more.insertAdjacentHTML('beforebegin',`<section class="fi-sec" data-i="${last}"><div class="fi-sh" data-j="${last}">${phBlock(kind,nx)}<div><b>${E(nx)}</b><br><span>${E(I.desc||'')}</span></div><span style="margin-left:auto">${last+1} / ${codes.length}</span></div>${body(kind,nx,tab)}</section>`);label();return true};
    label();more.onclick=()=>add();const near=()=>more.getBoundingClientRect().top<B.getBoundingClientRect().bottom+500;const fill=()=>{let n=0;while(near()&&n++<3&&add());};
    if(g.IntersectionObserver){io=new IntersectionObserver(es=>{if(es.some(x=>x.isIntersecting))fill()},{root:B,rootMargin:'0px 0px 500px 0px'});io.observe(more)}
    let tk=0;B.onscroll=()=>{if(tk)return;tk=setTimeout(()=>{tk=0;if(!more.isConnected)return;fill();let cur=base;for(const s of B.querySelectorAll('.fi-sec')){if(s.offsetTop<=B.scrollTop+70)cur=+s.dataset.i;else break}if(cur!==k){k=cur;head()}},90)}}
  el.innerHTML=`<div class="fi-box"><div class="fi-hd"><button data-a="p" title="上一個 ←">◀</button><button data-a="n" title="下一個 →">▶</button><span class="fi-pos"></span><button data-a="x" title="關閉 Esc">✕</button></div><div class="fi-top"></div><div class="fi-tabs"></div><div class="fi-body"></div></div>`;
  el.addEventListener('click',e=>{if(e.target===el)return close();const a=e.target.closest('[data-a]');if(a){({p:()=>go(-1),n:()=>go(1),x:close})[a.dataset.a]();return}
    const t=e.target.closest('[data-t]');if(t){tab=t.dataset.t;g.__fiTab=tab;paint();return}
    const j=e.target.closest('[data-j]');if(j){k=+j.dataset.j;paint();return}
    if(e.target.closest('[data-ph]')){tab='ph';paint();return}
    if(e.target.closest('[data-hub]')){const c=codes[k];try{if(g.parent&&g.parent!==g&&g.parent.VRTHubOpen){g.parent.VRTHubOpen('fabric',nk(c));return}}catch(_){}g.open('vrt_hub_v1.html#open='+encodeURIComponent('fabric|'+nk(c)),'_blank');return}
    const ed=e.target.closest('[data-ed]');if(ed&&typeof g.fabricEdit==='function'){close();g.fabricEdit(kind,ed.dataset.ed);return}
    const dl=e.target.closest('[data-del]');if(dl&&typeof g.fabricDelete==='function'){close();g.fabricDelete(kind,dl.dataset.del);return}});
  let sx=0,sy=0;el.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
  el.addEventListener('touchend',e=>{if(e.target.closest('.fi-tb,.fi-tabs,.vp-grid,input'))return;const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>80&&Math.abs(dy)<50)go(dx<0?1:-1)},{passive:true});
  let off=null;try{off=g.VRTPhotos&&g.VRTPhotos.on(()=>{if(el.isConnected)head()})}catch(_){}
  paint();return true}

/* ── 表格裡料號旁邊放標準照小圖；沒照片顯示「📷 缺」── */
function deco(){const bodies=[['cur','curBody'],['old','oldBody'],['acc','accBody']];for(const [kind,id] of bodies){const tb=document.getElementById(id);if(!tb)continue;const rows=rowsOf(kind);
  tb.querySelectorAll('tr[onclick*="openRowDetail"]').forEach(tr=>{const m=String(tr.getAttribute('onclick')).match(/,\s*(\d+)\)/);if(!m)return;const r=rows[+m[1]];if(!r||!r.itemCode)return;const td=tr.querySelector('td');if(!td)return;
    const ps=photoSum(kind,r.itemCode);const sig=ps&&ps.cover?ps.cover.slice(-40):'none';if(td.dataset.fi===sig)return;td.dataset.fi=sig;td.querySelectorAll('.fi-mini,.fi-miss').forEach(x=>x.remove());
    td.insertAdjacentHTML('afterbegin',ps&&ps.cover?`<img class="fi-mini" src="${ps.cover}" alt="">`:'<span class="fi-miss" title="還沒有標準照 No photo">📷缺</span>')})}}
let dt=0;const later=()=>{clearTimeout(dt);dt=setTimeout(()=>{try{css();deco()}catch(_){}},250)};
function init(){css();const ob=new MutationObserver(later);['curBody','oldBody','accBody'].forEach(id=>{const t=document.getElementById(id);if(t)ob.observe(t,{childList:true})});later();try{g.VRTPhotos&&g.VRTPhotos.on(later)}catch(_){}
  /* 點一列 → 料號頁（找不到資料就照原本的明細） */
  const prev=g.openRowDetail;if(typeof prev==='function'&&!prev.__fi){const fn=function(kind,i){try{if(open(kind,i))return}catch(e){console.warn('[VRTFabItem]',e)}return prev.apply(this,arguments)};fn.__fi=1;fn.orig=prev;g.openRowDetail=fn}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,300));else setTimeout(init,300);
g.VRTFabItem={version:'1.1.0',open,deco};
})(window);
