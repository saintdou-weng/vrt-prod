/* VRT 淡色／深色 v1.0（2026-11-12）Paul 11/12：背景色像 PSJERP 一樣可選淡色或深色。
   每一頁載入這支：讀 localStorage 'vrt_theme'（'light'／'dark'；沒設定＝照頁面原本的樣子）。
   舊頁面有的原本是深色、有的是淡色 → 量頁面底色，跟選的不一樣就整頁反相（圖片再反回來），不用改每一頁的 CSS。
   在入口或 8 個入口頁按 ☀️／🌙 切換，其他開著的頁面（包含入口頁裡的分頁）會跟著換。資料不動。 */
(function(){
  if(window.VRTTheme)return;
  var KEY='vrt_theme';
  function get(){try{return localStorage.getItem(KEY)||''}catch(e){return ''}}
  function set(v){try{localStorage.setItem(KEY,v)}catch(e){}apply()}
  var css='html.vrt-inv{filter:invert(1) hue-rotate(180deg);background:#fff!important}'+
          'html.vrt-inv img,html.vrt-inv video,html.vrt-inv picture,html.vrt-inv .vrt-noinv{filter:invert(1) hue-rotate(180deg)}';
  function lum(c){var m=String(c||'').match(/\d+(\.\d+)?/g);if(!m||m.length<3)return null;if(m.length>3&&+m[3]===0)return null;
    return (0.2126*m[0]+0.7152*m[1]+0.0722*m[2])/255}
  function nativeDark(){var h=document.documentElement;if(h.hasAttribute('data-vrt-native'))return h.getAttribute('data-vrt-native')==='dark';
    var was=h.classList.contains('vrt-inv');if(was)h.classList.remove('vrt-inv');
    var L=null;try{L=lum(getComputedStyle(document.body).backgroundColor);if(L==null)L=lum(getComputedStyle(h).backgroundColor)}catch(e){}
    if(was)h.classList.add('vrt-inv');if(L==null)L=1;if(document.readyState==='complete')h.setAttribute('data-vrt-native',L<0.45?'dark':'light');return L<0.45}
  function apply(){
    var h=document.documentElement;if(!document.body)return;
    if(h.hasAttribute('data-vrt-themed'))return; /* 自己有淡／深兩套樣式的頁（入口頁）不反相 */
    if(!document.getElementById('vrt-theme-css')){var s=document.createElement('style');s.id='vrt-theme-css';s.textContent=css;(document.head||h).appendChild(s)}
    var t=get(),dark=nativeDark();
    h.classList.toggle('vrt-inv',(t==='light'&&dark)||(t==='dark'&&!dark));
  }
  window.VRTTheme={get:get,set:set,apply:apply,toggle:function(){var t=get();if(!t){var d=nativeDark();t=d?'dark':'light'}set(t==='dark'?'light':'dark');return get()}};
  window.addEventListener('storage',function(e){if(e.key===KEY)apply()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){apply();setTimeout(apply,400)});else{apply();setTimeout(apply,400)}
})();
/* v4.34（Paul 11/14）每一頁都載入「點了就連」：表格裡的款號／PO／線別／日期／客戶／料號／機台可點，開相關資訊卡 */
(function(){try{if(window.VRTLink||document.querySelector('script[src*="vrt-link-v1.js"]'))return;var s=document.createElement('script');s.src='vrt-link-v1.js?v=4.34.0';(document.head||document.documentElement).appendChild(s)}catch(e){}})();
