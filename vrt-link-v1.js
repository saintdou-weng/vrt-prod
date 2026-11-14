/* VRT 點了就連 v1.0（2026-11-14）
   Paul 11/14：「排單點第 11 組出現款式，款式也可以點了連接；裁剪計劃、哪天哪些款也一樣，按了就有相關裁／車等資料」。
   所有頁面（生產平台入口的每個分頁、物品頁裡的表格）裡的 款號／PO／線別／日期／客戶／布料・零件料號／機台 自動變成可點：
   點了在入口頁開那一個的資訊卡（物品頁：左右滑、↩ 回上一層），不用自己去找分頁。
   只加連結、不改原本資料與原本的點列功能；看表頭判斷欄位是什麼，看不出來的欄不動。 */
(function(g){
'use strict';
if(g.VRTLink)return;
const COLS=[
 ['date',/^(日期|DATE|生產日|出貨日|ETD|START|開始|結束|完成|裁剪日|車縫日)|日期$|DATE$|START\s*→?|→/i],
 ['po',/(^|\/|\s)(PO|P\.O\.|訂單號|SO)(\s|\/|#|$)|PO\s*#|PO號|CUSTOMER\s*\/\s*PO|客戶\s*\/\s*PO/i],
 ['style',/(^|\/|\s)(STYLE|款號|款式|STYLE\s*NO)|STYLE\s*\/\s*COLOR/i],
 ['line',/^(LINE|線別|線|組別|LINE\s*NO|生產線|車縫線)\b|^(LINE|線別)$/i],
 ['customer',/^(CUSTOMER|客戶|BUYER|CUST)(\s|$|\/)/i],
 ['item',/^(料號|ITEM|ITEM\s*CODE|FABRIC|布料|布號|PART\s*NO|零件|副料|輔料)/i],
 ['machine',/^(機台|MACHINE|ASSET)/i]];
const TOK={
 po:/\b(SORD\d{4,}|SFOR\d{3,}|PO[-\s]?\d{4,}|\d{5,9})\b/i,
 line:/\b(Apron\s*L\s*\d{1,2}|Line\s*\d{1,2}|L\d{1,2})\b/i,
 date:/\b(20\d\d-\d\d-\d\d)\b/,
 style:/^[A-Z0-9][A-Z0-9.\-\/]{2,30}/i,
 item:/^[A-Z0-9][A-Z0-9.\-\/#]{2,40}/i,
 machine:/^[A-Z0-9][A-Z0-9.\-\/]{1,30}/i,
 customer:/^[A-Z][A-Z0-9 .&'\-]{1,40}/i};
function css(){if(document.getElementById('vlCss'))return;const s=document.createElement('style');s.id='vlCss';s.textContent='.vl{cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;text-decoration-color:#6366f1}.vl:hover{color:#4f46e5;background:rgba(99,102,241,.08);border-radius:4px}';document.head.appendChild(s)}
function hubOpen(){try{if(g.VRTHubOpen)return g.VRTHubOpen;if(g.top!==g&&g.top.VRTHubOpen)return g.top.VRTHubOpen;if(g.parent!==g&&g.parent.VRTHubOpen)return g.parent.VRTHubOpen}catch(_){}return null}
function open(kind,key){const f=hubOpen();if(f){f(kind,key);return}const u='vrt_hub_v1.html#open='+encodeURIComponent(kind+'|'+key);try{g.open(u,'_blank')}catch(_){location.href=u}}
function kindOf(h){h=String(h||'').replace(/\s+/g,' ').trim();if(!h||h.length>40)return '';for(const [k,re] of COLS)if(re.test(h))return k;return ''}
function wrapFirst(node,re,kind){/* 只包住欄位裡第一個符合的字串（文字節點），不動其他內容 */
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT,{acceptNode:t=>t.parentElement&&t.parentElement.closest('.vl,a,button,input,select,textarea')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  let t,done=0;while((t=walker.nextNode())&&done<2){const s=t.nodeValue;const lead=s.match(/^\s*/)[0];const body=s.slice(lead.length);const m=(re.source.startsWith('^')?body.match(re):s.match(re));if(!m||!m[0].trim())continue;
    const val=(m[1]||m[0]).trim();if(kind!=='date'&&kind!=='line'&&kind!=='po'&&!/[A-Z]/i.test(val))continue;if(kind==='style'&&!/\d/.test(val))continue;
    const idx=re.source.startsWith('^')?lead.length:m.index+(m[0].indexOf(m[1]||m[0]));const before=s.slice(0,idx),after=s.slice(idx+val.length);
    const sp=document.createElement('span');sp.className='vl';sp.dataset.vk=kind;sp.dataset.vv=val;sp.textContent=val;sp.title='點一下看相關資料';
    const frag=document.createDocumentFragment();if(before)frag.appendChild(document.createTextNode(before));frag.appendChild(sp);if(after)frag.appendChild(document.createTextNode(after));t.parentNode.replaceChild(frag,t);done++;
    if(kind!=='po'&&kind!=='date')break}}
function scanTable(tb){if(tb.dataset.vlDone===String(tb.rows.length))return;let head=tb.tHead&&tb.tHead.rows[0];let start=0;if(!head){const r0=tb.rows[0];if(r0&&r0.querySelector('th')){head=r0;start=1}}if(!head)return;
  const kinds=[...head.cells].map(c=>kindOf(c.textContent));if(!kinds.some(Boolean)){tb.dataset.vlDone=String(tb.rows.length);return}
  const body=tb.tBodies.length?[...tb.tBodies].flatMap(b=>[...b.rows]):[...tb.rows].slice(start);
  body.forEach(tr=>{if(tr.dataset.vl)return;tr.dataset.vl='1';[...tr.cells].forEach((td,i)=>{const k=kinds[i];if(!k)return;const hd=String(head.cells[i]&&head.cells[i].textContent||'');
    if(k==='po'&&/CUSTOMER|客戶/i.test(hd)){wrapFirst(td,TOK.customer,'customer');wrapFirst(td,TOK.po,'po');return}
    if(k==='style'&&/COLOR|顏色/i.test(hd)){wrapFirst(td,TOK.style,'style');return}
    wrapFirst(td,TOK[k]||TOK.item,k)})});tb.dataset.vlDone=String(tb.rows.length)}
let tm=null;function scan(){clearTimeout(tm);tm=setTimeout(()=>{try{document.querySelectorAll('table').forEach(scanTable)}catch(e){console.warn('[VRTLink]',e)}},250)}
function start(){css();scan();new MutationObserver(ms=>{if(ms.some(m=>m.addedNodes.length))scan()}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',e=>{const s=e.target.closest&&e.target.closest('.vl');if(!s)return;e.preventDefault();e.stopPropagation();open(s.dataset.vk,s.dataset.vv)},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
g.VRTLink={version:'1.0.0',open,scan,kindOf};
})(window);
