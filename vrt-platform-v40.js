/* VRT PROD v4.4 — one connection setting, unchanged IndexedDB names. */
(function(g){'use strict';
 const KEY='vrt_portal_gas_url',aliases=['vrt_prod_gas_url','vrt_gas_url','smv_gas_url','vrt_smv_gas_url','vrt_ie_gas_url'];
 const valid=v=>/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec(?:\?.*)?$/.test(String(v||'').trim());
 const read=k=>{try{return localStorage.getItem(k)||''}catch(_){return''}};
 function set(url){url=String(url||'').trim();if(!valid(url))throw new Error('請使用 Google Apps Script Web App 的 /exec 網址');try{localStorage.setItem(KEY,url);aliases.forEach(k=>localStorage.setItem(k,url))}catch(_){}g.dispatchEvent(new CustomEvent('vrt:connection',{detail:{url}}));return url}
 function get(){let url=read(KEY);if(valid(url))return url;for(const k of aliases){url=read(k);if(valid(url))return set(url)}for(const k of ['vrt_sp_set','vrt_smv_settings','vrt_ie_smv_settings'])try{const s=JSON.parse(read(k)||'{}');url=s.gasUrl||s.gasURL||s.cloudEndpoint;if(valid(url))return set(url)}catch(_){}url=g.VRT_DEPLOY_CONFIG?.gasUrl;if(valid(url))return set(url);return''}
 g.VRTPlatform={version:'4.4.0',getGasUrl:get,setGasUrl:set,validGasUrl:valid};get();
 addEventListener('storage',e=>{if(e.key===KEY&&valid(e.newValue))set(e.newValue)});
 function ready(){const badge=document.createElement('a');badge.href='portal_v2.html?v=4.4.0';badge.textContent='PROD v4.4';badge.title='本頁程式版本 · 返回平台';badge.style.cssText='position:fixed;right:8px;top:2px;z-index:9990;background:#14213d;color:#fff;font:11px system-ui;padding:3px 7px;border-radius:4px;text-decoration:none';document.body.appendChild(badge);const u=get();if(u)document.querySelectorAll('input').forEach(e=>{if(/gas|endpoint/i.test(e.id)&&!e.value)e.value=u});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})(window);
