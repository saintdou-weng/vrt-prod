/* VRT 生產平台入口頁 介面動效 v1.0（2026-11-22，Paul 指定 5 項）
   1 懸停回饋：按鈕上移 2px、陰影加深、背景暗 8%、150ms ease-out、手型。用 CSS「translate」屬性，不蓋掉元件原本的 transform；分頁列、表格內、停用的按鈕不動。
     入口頁裡每個分頁（同網站的 iframe）也注入同一段 CSS，原本頁面不用改。
   2 游標聚光燈：深色主題的卡片網格（一覽的 .cards）以滑鼠為中心畫 240px、15% 的徑向光圈，光圈內卡片邊框跟著亮；座標用 CSS 變數。
   3 3D 傾斜：卡片網格的卡片與 KPI 卡依滑鼠位置傾斜，最大 8°、透視 1000px、放大 1.02；離開 300ms 復位。卡片不套用規則 1（不會 transform 打架）。
   4 導覽列吸頂：分頁內容捲動超過 80px → 上方標頭收合（高度少 16px）、半透明（深色主題用深色半透明）＋12px 毛玻璃＋細陰影，200ms。手機原本「往下捲收起標頭」照舊。
   5 回到頂部：捲動超過一屏 → 右下角 24px 淡入 48px 圓形按鈕（遇到頁面自己右下角的浮動按鈕會自動往上讓），懸停上浮，點了 500ms 平滑回到頂端，到頂自動淡出。
   滑鼠追蹤與捲動都用 requestAnimationFrame 節流；系統設定「減少動態效果」或觸控裝置時只留必要部分。 */
(function(g){
'use strict';
if(g.VRTUiFx)return;
const doc=document,RM=g.matchMedia&&g.matchMedia('(prefers-reduced-motion: reduce)').matches,FINE=g.matchMedia&&g.matchMedia('(hover: hover) and (pointer: fine)').matches;
const HOVER_CSS=`@media (hover:hover) and (pointer:fine){
:where(.btn,.ps-btn,.htool,.tool-btn,.fi-btn,.fi-hd button,.sh-hd .btn,button[class*="btn"],a.btn,#vrtSiBtn,.vtt-btn):not(:disabled):not([aria-disabled="true"]):not(.tabs *):not(.tab):not(.sh-tabs *):not(.fi-tabs *):not(td *):not(th *){cursor:pointer;transition:translate 150ms ease-out,box-shadow 150ms ease-out,filter 150ms ease-out,background-color 150ms ease-out,border-color 150ms ease-out}
:where(.btn,.ps-btn,.htool,.tool-btn,.fi-btn,.fi-hd button,.sh-hd .btn,button[class*="btn"],a.btn,#vrtSiBtn,.vtt-btn):not(:disabled):not([aria-disabled="true"]):not(.tabs *):not(.tab):not(.sh-tabs *):not(.fi-tabs *):not(td *):not(th *):hover{translate:0 -2px;box-shadow:0 6px 14px rgba(15,23,42,.18);filter:brightness(.92)}
}
@media (prefers-reduced-motion:reduce){:where(.btn,.ps-btn,.htool,.tool-btn,.fi-btn,button[class*="btn"]):hover{translate:none!important}}`;
function css(){if(doc.getElementById('uifxCss'))return;const s=doc.createElement('style');s.id='uifxCss';s.textContent=HOVER_CSS+`
/* 2 聚光燈（只在深色主題的卡片網格） */
[data-theme=dark] .cards.uifx-spot{position:relative}
[data-theme=dark] .cards.uifx-spot::before{content:"";position:absolute;inset:-40px;pointer-events:none;z-index:0;opacity:var(--spot-o,0);transition:opacity .25s;background:radial-gradient(240px circle at var(--mx,-999px) var(--my,-999px),rgba(255,255,255,.15),transparent 70%)}
[data-theme=dark] .cards.uifx-spot>.card{position:relative;z-index:1}
[data-theme=dark] .cards.uifx-spot>.card::after{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1px;pointer-events:none;opacity:var(--spot-o,0);transition:opacity .25s;
 background:radial-gradient(240px circle at var(--cx,-999px) var(--cy,-999px),rgba(165,180,252,.9),transparent 70%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
/* 3 傾斜：卡片不走一般懸停上移 */
.uifx-tilt{transform-style:preserve-3d;will-change:transform}
.cards .card.uifx-tilt:hover{transform:none}
.uifx-tilt.uifx-on{transition:transform 80ms linear,box-shadow .15s}
.uifx-tilt.uifx-off{transition:transform 300ms ease-out,box-shadow .3s}
/* 4 標頭吸頂收合 */
.hdr{transition:padding 200ms ease,background-color 200ms ease,box-shadow 200ms ease,backdrop-filter 200ms ease,margin-top .2s}
body.uifx-stick>.hdr{position:sticky;top:0;z-index:50;padding-top:max(0px,calc(var(--uifx-pad,8px) - 8px));padding-bottom:max(0px,calc(var(--uifx-pad,8px) - 8px));background:rgba(255,255,255,.72);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 1px 6px rgba(15,23,42,.10)}
[data-theme=dark] body.uifx-stick>.hdr,body.uifx-stick[data-theme=dark]>.hdr{background:rgba(15,23,42,.72);box-shadow:0 1px 6px rgba(0,0,0,.35)}
/* 5 回到頂部 */
.uifx-top{position:fixed;right:24px;bottom:24px;width:48px;height:48px;border-radius:50%;border:1px solid var(--line,#e2e8f0);background:var(--card,#fff);color:var(--ink,#0f172a);font-size:20px;line-height:1;cursor:pointer;z-index:9000;box-shadow:0 4px 14px rgba(15,23,42,.18);opacity:0;pointer-events:none;translate:0 8px;transition:opacity 200ms ease,translate 200ms ease,box-shadow 150ms ease-out}
.uifx-top.on{opacity:1;pointer-events:auto;translate:0 0}
.uifx-top.on:hover{translate:0 -3px;box-shadow:0 8px 20px rgba(15,23,42,.25)}
@media (prefers-reduced-motion:reduce){.uifx-top,.hdr,.uifx-tilt{transition:none!important}}`;doc.head.appendChild(s)}

/* ── rAF 節流 ── */
const raf=fn=>{let q=false,a;return function(...x){a=x;if(q)return;q=true;requestAnimationFrame(()=>{q=false;fn.apply(this,a)})}};

/* ── 1 懸停：注入同網站的分頁 ── */
function inject(f){try{const d=f.contentDocument;if(!d||!d.head||d.getElementById('uifxHover'))return;const s=d.createElement('style');s.id='uifxHover';s.textContent=HOVER_CSS;d.head.appendChild(s)}catch(_){}}

/* ── 2＋3 卡片網格聚光燈與傾斜（事件委派，卡片陸續載入也有效）── */
const isDark=()=>doc.documentElement.getAttribute('data-theme')==='dark';
let cur=null;
const move=raf((e)=>{const t=e.target;const grid=t&&t.closest&&t.closest('.cards');const card=t&&t.closest&&t.closest('.cards>.card,.pane .kpi');
  if(grid&&isDark()){grid.classList.add('uifx-spot');const r=grid.getBoundingClientRect();grid.style.setProperty('--mx',(e.clientX-r.left+40)+'px');grid.style.setProperty('--my',(e.clientY-r.top+40)+'px');grid.style.setProperty('--spot-o','1');
    for(const c of grid.children){const cr=c.getBoundingClientRect();if(cr.bottom<e.clientY-260||cr.top>e.clientY+260)continue;c.style.setProperty('--cx',(e.clientX-cr.left)+'px');c.style.setProperty('--cy',(e.clientY-cr.top)+'px')}}
  if(RM)return;
  if(card!==cur){if(cur)leave(cur);cur=card||null}
  if(card){const r=card.getBoundingClientRect();const px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5;card.classList.add('uifx-tilt','uifx-on');card.classList.remove('uifx-off');
    card.style.transform=`perspective(1000px) rotateX(${(-py*16).toFixed(2)}deg) rotateY(${(px*16).toFixed(2)}deg) scale(1.02)`}});
function leave(c){c.classList.remove('uifx-on');c.classList.add('uifx-off');c.style.transform='';setTimeout(()=>{if(c!==cur)c.classList.remove('uifx-off','uifx-tilt')},320)}
function outGrid(e){const grid=e.target.closest&&e.target.closest('.cards');if(grid&&!grid.contains(e.relatedTarget))grid.style.setProperty('--spot-o','0');const c=e.target.closest&&e.target.closest('.cards>.card,.pane .kpi');if(c&&!c.contains(e.relatedTarget)){if(cur===c)cur=null;leave(c)}}

/* ── 4＋5 捲動：分頁（iframe）或一覽面板，誰在捲就看誰 ── */
let scroller=null;
function active(){const st=doc.getElementById('stage');if(!st)return null;const p=st.querySelector('.pane.on');if(p)return {el:p,get y(){return p.scrollTop},h:()=>p.clientHeight,to:v=>{p.scrollTop=v}};
  const f=st.querySelector('iframe.on');if(!f)return null;try{const w=f.contentWindow,d=w.document;const se=d.scrollingElement||d.documentElement;let tgt=null;
    if(se.scrollHeight<=w.innerHeight+4){tgt=[...d.querySelectorAll('main,#app,.app,.content,.wrap,body>div')].find(x=>x.scrollHeight>x.clientHeight+200&&/auto|scroll/.test(getComputedStyle(x).overflowY))||null}
    if(tgt)return {el:tgt,frame:f,get y(){return tgt.scrollTop},h:()=>tgt.clientHeight,to:v=>{tgt.scrollTop=v}};
    return {el:w,frame:f,get y(){return w.scrollY||se.scrollTop||0},h:()=>w.innerHeight,to:v=>{w.scrollTo(0,v)}}}catch(_){return null}}
let btn=null,anim=0;
function onScroll(){const s=active();if(!s)return;const y=s.y;
  doc.body.classList.toggle('uifx-stick',y>80&&(g.innerWidth>900));
  const show=y>s.h();if(btn){if(show&&!btn.classList.contains('on'))place(s);btn.classList.toggle('on',show&&!doc.querySelector('.sheet.on,.fi-mask,.ps-mask'))}}
const tick=raf(onScroll);
/* 右下角如果頁面自己有浮動按鈕（例：聊天、Telegram）→ 往上讓開 */
function place(s){let b=24;try{const d=s.frame?s.frame.contentDocument:doc;const fr=s.frame?s.frame.getBoundingClientRect():{left:0,top:0};const vw=g.innerWidth,vh=g.innerHeight;
  for(const el of d.querySelectorAll('body *')){const cs=(el.ownerDocument.defaultView||g).getComputedStyle(el);if(cs.position!=='fixed'||cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)continue;const r=el.getBoundingClientRect();if(!r.width||!r.height||r.width>vw*.5)continue;
    const L=r.left+fr.left,T=r.top+fr.top,R=r.right+fr.left,B=r.bottom+fr.top;if(R>vw-24-48-4&&B>vh-b-48-4&&T<vh-20)b=Math.max(b,vh-T+12)}}catch(_){}btn.style.bottom=Math.min(b,g.innerHeight*.5)+'px'}
function toTop(){const s=active();if(!s)return;const y0=s.y;if(y0<=0)return;cancelAnimationFrame(anim);const t0=performance.now(),D=RM?1:500,ease=t=>1-Math.pow(1-t,3);
  const step=now=>{const k=Math.min(1,(now-t0)/D);s.to(Math.round(y0*(1-ease(k))));if(k<1)anim=requestAnimationFrame(step);else onScroll()};anim=requestAnimationFrame(step)}
const hooked=new WeakSet();
function hook(){const st=doc.getElementById('stage');if(!st)return;
  st.querySelectorAll('.pane').forEach(p=>{if(hooked.has(p))return;hooked.add(p);p.addEventListener('scroll',tick,{passive:true})});
  st.querySelectorAll('iframe').forEach(f=>{if(hooked.has(f))return;hooked.add(f);const att=()=>{inject(f);try{const w=f.contentWindow;w.addEventListener('scroll',tick,{passive:true});w.document.addEventListener('scroll',tick,{passive:true,capture:true})}catch(_){}};f.addEventListener('load',att);att()})}

function init(){css();
  if(FINE){doc.addEventListener('pointermove',move,{passive:true});doc.addEventListener('pointerout',outGrid,{passive:true})}
  btn=doc.createElement('button');btn.type='button';btn.className='uifx-top';btn.title='回到頂部 Back to top';btn.setAttribute('aria-label','回到頂部 Back to top');btn.textContent='↑';btn.onclick=toTop;doc.body.appendChild(btn);
  const st=doc.getElementById('stage');if(st)new MutationObserver(()=>{hook();tick()}).observe(st,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});hook();
  g.addEventListener('hashchange',()=>{doc.body.classList.remove('uifx-stick');setTimeout(tick,60)});g.addEventListener('resize',tick)}
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else init();
g.VRTUiFx={version:'1.0.0',toTop,refresh:tick};
})(window);
