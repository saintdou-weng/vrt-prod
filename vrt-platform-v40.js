/* VRT PROD v4.19 — one connection setting, unchanged IndexedDB names. */
(function(g){'use strict';
 const ERP_URL='https://saintdou-weng.github.io/PSJERP/';   // v4.18: repo renamed vrt-asset → PSJERP
 const KEY='vrt_portal_gas_url',aliases=['vrt_prod_gas_url','vrt_gas_url','smv_gas_url','vrt_smv_gas_url','vrt_ie_gas_url'];
 const valid=v=>/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec(?:\?.*)?$/.test(String(v||'').trim());
 const read=k=>{try{return localStorage.getItem(k)||''}catch(_){return''}};
 function set(url){url=String(url||'').trim();if(!valid(url))throw new Error('請使用 Google Apps Script Web App 的 /exec 網址');try{localStorage.setItem(KEY,url);aliases.forEach(k=>localStorage.setItem(k,url))}catch(_){}g.dispatchEvent(new CustomEvent('vrt:connection',{detail:{url}}));return url}
 function get(){let url=read(KEY);if(valid(url))return url;for(const k of aliases){url=read(k);if(valid(url))return set(url)}for(const k of ['vrt_sp_set','vrt_smv_settings','vrt_ie_smv_settings'])try{const s=JSON.parse(read(k)||'{}');url=s.gasUrl||s.gasURL||s.cloudEndpoint;if(valid(url))return set(url)}catch(_){}url=g.VRT_DEPLOY_CONFIG?.gasUrl;if(valid(url))return set(url);return''}
 g.VRTPlatform={version:'4.21.0',getGasUrl:get,setGasUrl:set,validGasUrl:valid,erpUrl:ERP_URL};get();
 addEventListener('storage',e=>{if(e.key===KEY&&valid(e.newValue))set(e.newValue)});
 /* v4.15: PROD ↔ ERP 互相入口 — every PROD page carries a small "VRT ERP ↗" link next to the version badge (ERP pages link back to the portal). */
 function ready(){/* v4.44：在生產平台入口頁的分頁裡（?embed=1）不再重複放「VRT ERP ↗／PROD」小標，入口頁上面已經有 */let emb=false;try{emb=!!window.VRT_HUBS||window.parent!==window&&(/[?&]embed=1/.test(location.search)||!!window.parent.VRTPlatform||!!window.parent.VRT_HUBS)}catch(_){}if(emb){const u0=get();if(u0)document.querySelectorAll('input').forEach(e=>{if(/gas|endpoint/i.test(e.id)&&!e.value)e.value=u0});return}const badge=document.createElement('a');badge.href='portal_v2.html?v=4.22.0';badge.textContent='PROD v4.22';badge.title='本頁程式版本 · 返回平台';badge.setAttribute('data-no-i18n','');badge.className='vrt-badge';badge.style.cssText='position:fixed;right:8px;top:2px;z-index:9990;background:#14213d;color:#fff;font:11px system-ui;padding:3px 7px;border-radius:4px;text-decoration:none';document.body.appendChild(badge);
  const erp=document.createElement('a');erp.href=ERP_URL;erp.target='_blank';erp.rel='noopener';erp.textContent='VRT ERP ↗';erp.title='VRT ERP（PSJERP）另開新分頁';erp.setAttribute('data-no-i18n','');erp.className='vrt-badge';erp.style.cssText='position:fixed;right:86px;top:2px;z-index:9990;background:#1d3557;color:#bfdbfe;font:11px system-ui;padding:3px 7px;border-radius:4px;text-decoration:none;border:1px solid #2a5298';document.body.appendChild(erp);
  const u=get();if(u)document.querySelectorAll('input').forEach(e=>{if(/gas|endpoint/i.test(e.id)&&!e.value)e.value=u});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
 /* v4.47（Paul 11/22「全部都要」）：模組頁「單獨打開」時也有介面動效——用行政中心共用的 ux_motion.js（HRA／Admin OS／GASCheck 同一支）。
    在入口頁的分頁裡（iframe）不載入：入口頁自己的 vrt-ui-fx 已經處理，避免按鈕上移兩次、兩顆回到頂部。網址加 ?fx=off 可關。 */
 function motion(){try{if(g.VRT_HUBS||g.top!==g.self||/[?&](fx=off|embed=1)/.test(location.search)||localStorage.getItem('ac_ui_fx')==='off'||document.getElementById('uxMotionCss'))return}catch(_){return}
  const s=document.createElement('script');s.src='https://saintdou-weng.github.io/ac-admin/shared/ux_motion.js?v=2';s.async=true;
  Object.assign(s.dataset,{cards:'.kpi,.metric,.kpi-card,.stat-card,.hstat,.mcard,.hra-kpi',grid:'.kpi-strip,.kpis,.metrics,.cards,.grid',nav:'.header,.topbar,header,.hdr',skip:'table,thead,.tabs,.tab,#tabBar,nav,.seg,[role=tablist],.vtt-tabs,.vp-grid,.pi-sw,.sty-per,.sty-cu'});document.head.appendChild(s)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',motion);else motion();
})(window);
/* ── 回平台選單（2026-11-22 Paul：每頁最上面一條，不用退出再進來；頁面最上面已經有回選單的連結就不加；放在平台框架裡面時不加）── */
(function(){var O={href:'vrt_hub_v1.html',name:'生產平台',skip:/^(vrt_hub_v1|portal_v2|index)\.html$/,alt:/\/(portal_v2|vrt_hub_v1)\.html$/};
 function run(){try{if(window.top!==window.self||document.getElementById('fx-home')||/[?&]embed=1/.test(location.search))return;
  var file=location.pathname.split('/').pop()||'index.html';if(O.skip.test(file))return;
  var target=new URL(O.href,location.href).pathname,ls=document.querySelectorAll('a[href]');
  for(var i=0;i<ls.length;i++){var a=ls[i];if(/^\s*PROD v/i.test(a.textContent||''))continue;var u;try{u=new URL(a.getAttribute('href'),location.href)}catch(e){continue}
   if(u.pathname===target||(O.alt&&O.alt.test(u.pathname))){var r=a.getBoundingClientRect();if(r.width>0&&r.height>0&&r.top<180)return}}
  var b=document.createElement('a');b.id='fx-home';b.href=O.href;b.setAttribute('data-fx','off');b.title='回 '+O.name+' 選單 Back to menu';
  b.innerHTML='<span style="font-size:15px">‹</span> 🏠 <b>'+O.name+'</b> 選單 Menu';
  b.style.cssText='font:600 13px/1 system-ui,"Noto Sans TC",sans-serif;color:#fff;background:#0f172a;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 14px;width:100%;box-sizing:border-box;position:relative;z-index:5';
  var bs=getComputedStyle(document.body);if((bs.display==='flex'&&!/column/.test(bs.flexDirection))||bs.display==='grid'){b.style.cssText+=';position:fixed;top:6px;left:50%;transform:translateX(-50%);width:auto;border-radius:999px;z-index:80;box-shadow:0 2px 10px rgba(15,23,42,.3);opacity:.94';document.body.appendChild(b)}
  else document.body.insertBefore(b,document.body.firstChild);
  /* 生產平台：右上小標與智慧匯入鈕原本貼在最上面，往下讓開這一條 */document.body.classList.add('fxhome');var st=document.createElement('style');st.textContent='body.fxhome .vrt-badge,body.fxhome #vrtSiBtn{top:'+(b.offsetHeight+3)+'px!important}';document.head.appendChild(st)}catch(e){}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(run,700)});else setTimeout(run,700)})();

/* v4.49（Paul 11/22）卡片互動微變色：滑鼠移入（電腦）或手指按下（手機）時，卡片背景與邊框柔和變色，看得出現在要按哪一張。
   用半透明色光（inset 陰影，可以平滑過渡）疊在原本底色上（淺色主題＝淺藍／淺綠／粉紅／粉橘；深色主題同色光約 12% 透明度，文字對比不變），四色輪替。只變色，不動位置（不跟 3D 傾斜打架）。 */
(function(){if(document.getElementById('vrtTintCss'))return;
 var C='.cards>.card,.sty-it,.pi-it,.mcard,.rr-k>div,.fi-sh,.sh-cont-hd,.card[onclick],.card[data-k],.sh-rel>button';
 var T=[['96,165,250','.55'],['74,222,128','.55'],['244,114,182','.5'],['251,146,60','.55']],cs='';
 function each(sel,fn){return sel.split(',').map(fn).join(',')}
 T.forEach(function(t,i){var nth=':nth-child(4n+'+(i+1)+')';
  var rule='{box-shadow:inset 0 0 0 2000px rgba('+t[0]+',.12),0 2px 8px rgba(15,23,42,.08)!important;border-color:rgba('+t[0]+','+t[1]+')!important}';
  cs+='@media (hover:hover){'+each(C,function(x){return x+nth+':hover'})+rule+'}';
  cs+='@media (hover:none){'+each(C,function(x){return x+nth+':active'})+rule+'}'});
 cs+='@media (hover:hover){'+C+'{transition:border-color 150ms ease-out,box-shadow 150ms ease-out,transform .2s}}'
   +'@media (hover:none){'+C+'{-webkit-tap-highlight-color:transparent;transition:none}}';
 var st=document.createElement('style');st.id='vrtTintCss';st.textContent=cs;(document.head||document.documentElement).appendChild(st);
 /* iPhone 要有 touchstart 監聽，:active 才會在按下時出現 */
 try{document.addEventListener('touchstart',function(){},{passive:true})}catch(e){}})();
/* v4.50（Paul 11/22）列表點一列跳 Keynote（大字卡、可連續往下滑、款號／線別／PO… 可直接開物品頁）。入口頁本身不載入（它有自己的物品頁）。 */
(function(){try{if(window.VRT_HUBS||window.VRTKeynote||document.getElementById('vrtKnJs'))return;var s=document.createElement('script');s.id='vrtKnJs';s.src='vrt-row-keynote-v1.js?v=4.51.7';s.async=true;(document.head||document.documentElement).appendChild(s)}catch(e){}})();
/* v4.51（Paul 11/22：各分頁上面的 KPI 小卡點了沒反應）→ KPI 卡交給共用 psj-keynote（大字卡＋同區明細：各期走勢、各客戶／款式／線別、最大幾筆，可連續往下滑）；列表的列仍由 VRTKeynote 負責 */
(function(){try{if(window.VRT_HUBS||window.PSJKN||document.getElementById('vrtPknJs'))return;window.__vrtKpiLoose=1;var s=document.createElement('script');s.id='vrtPknJs';s.src='https://saintdou-weng.github.io/ac-admin/shared/psj-keynote.js?v=25';s.defer=true;(document.head||document.documentElement).appendChild(s)}catch(e){}})();
