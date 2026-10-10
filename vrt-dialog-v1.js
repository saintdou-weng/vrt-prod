/* VRT PROD in-page dialogs v1.0 (2026-10-10, B11) — replaces the browser's native alert / confirm / prompt.
   · alert(msg)            → non-blocking in-page notice (stacked, OK button, auto-dismiss); code after alert() continues at once.
   · VRTDialog.confirm(msg) / VRTDialog.prompt(msg, def) → in-page modal, returns a Promise (Enter = OK, Esc = cancel), queued.
   · window.confirm / window.prompt stay available for code not yet converted: in AUTOMATION MODE they answer immediately
     (confirm → true, prompt → default) and log the answer on the page, so automated imports never hang on a native dialog;
     in normal use they still show the native dialog.  Automation mode = ?auto=1 in the URL, localStorage vrt_auto_mode=1,
     navigator.webdriver, or VRTDialog.setAuto(true).
   Load this file BEFORE vrt-i18n-v1.js so the language layer wraps these functions (it translates the message first). */
(function(g){'use strict';
  if(g.VRTDialog)return;
  const VERSION='1.0.0',LOG=[];
  const nativeAlert=g.alert,nativeConfirm=g.confirm,nativePrompt=g.prompt;
  let forcedAuto=null;
  function auto(){if(forcedAuto!=null)return forcedAuto;try{if(/[?&]auto=1\b/.test(location.search))return true;if(localStorage.getItem('vrt_auto_mode')==='1')return true}catch(_){}try{return !!(g.navigator&&g.navigator.webdriver)}catch(_){return false}}
  const hasDom=()=>{try{return !!(g.document&&g.document.body&&typeof g.document.createElement==='function')}catch(_){return false}};
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // messages go through the shared language layer when it is loaded and not in 中文 (vrt-i18n-v1.js loads after this file)
  const tr=m=>{try{const I=g.VRTI18n;if(I&&I.lang&&I.lang!=='zh'){if(typeof I.translateLines==='function')return I.translateLines(String(m));if(typeof I.translate==='function')return I.translate(String(m))}}catch(_){}return m};
  const CSS=`#vrtNoticeHost{position:fixed;top:12px;right:12px;z-index:100000;display:flex;flex-direction:column;gap:8px;max-width:min(440px,calc(100vw - 24px));font:13px/1.5 "Microsoft JhengHei","Noto Sans TC","Noto Sans Khmer",system-ui,sans-serif;pointer-events:none}
#vrtNoticeHost .vn{pointer-events:auto;background:#1e2640;color:#fff;border-radius:10px;padding:10px 12px 10px 14px;box-shadow:0 8px 30px #0006;display:flex;gap:10px;align-items:flex-start;border-left:4px solid #60a5fa;animation:vnIn .18s ease-out}
#vrtNoticeHost .vn.warn{border-left-color:#f59e0b}#vrtNoticeHost .vn.err{border-left-color:#ef4444}#vrtNoticeHost .vn.ok{border-left-color:#10b981}#vrtNoticeHost .vn.auto{border-left-color:#a78bfa;background:#2a2348}
#vrtNoticeHost .vn .vm{flex:1;white-space:pre-wrap;word-break:break-word;max-height:40vh;overflow:auto}
#vrtNoticeHost .vn button{border:0;background:#334155;color:#fff;border-radius:6px;padding:4px 9px;cursor:pointer;font:inherit;font-size:12px;flex-shrink:0}
@keyframes vnIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
#vrtDlgHost{position:fixed;inset:0;z-index:100001;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;font:13px/1.5 "Microsoft JhengHei","Noto Sans TC","Noto Sans Khmer",system-ui,sans-serif}
#vrtDlgHost .vd{background:#fff;color:#1e2640;border-radius:14px;padding:18px 18px 14px;width:min(520px,100%);box-shadow:0 20px 60px #0007;animation:vnIn .15s ease-out}
#vrtDlgHost .vd .vt{font-weight:700;font-size:14px;margin-bottom:8px;color:#6b7a9e;letter-spacing:.04em}
#vrtDlgHost .vd .vm{white-space:pre-wrap;word-break:break-word;max-height:50vh;overflow:auto;font-size:13.5px}
#vrtDlgHost .vd input{width:100%;margin-top:10px;border:1px solid #c5c9d8;border-radius:8px;padding:8px 10px;font:inherit;box-sizing:border-box}
#vrtDlgHost .vd .vb{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
#vrtDlgHost .vd button{border:0;border-radius:8px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer;background:#e5e7eb;color:#374151}
#vrtDlgHost .vd button.ok{background:#2563eb;color:#fff}#vrtDlgHost .vd button.danger{background:#dc2626;color:#fff}
@media(max-width:600px){#vrtNoticeHost{left:12px;right:12px;max-width:none}#vrtDlgHost .vd{padding:14px}}`;
  let styled=false;function style(){if(styled||!hasDom())return;styled=true;const s=g.document.createElement('style');s.id='vrtDialogCss';s.textContent=CSS;(g.document.head||g.document.body).appendChild(s)}
  function host(id){style();let h=g.document.getElementById(id);if(!h){h=g.document.createElement('div');h.id=id;h.setAttribute('data-no-i18n','');g.document.body.appendChild(h)}return h}
  function record(kind,message,answer){const e={at:new Date().toISOString(),kind,message:String(message==null?'':message),answer,auto:auto()};LOG.push(e);if(LOG.length>200)LOG.shift();try{g.dispatchEvent(new CustomEvent('vrt:dialog',{detail:e}))}catch(_){}return e}
  /* ── notice (alert replacement) ── */
  function notice(message,type,ms){const msg=String(tr(message==null?'':message));record('alert',msg,null);if(!hasDom()){try{console.log('[alert]',msg)}catch(_){}return Promise.resolve()}
    try{return noticeDom(msg,type,ms)}catch(e){try{console.log('[alert]',msg)}catch(_){}return Promise.resolve()}}
  function noticeDom(msg,type,ms){const h=host('vrtNoticeHost');const n=g.document.createElement('div');n.className='vn '+(type||(/^(❌|✗|⚠|錯誤|失敗|Error|Failed)/i.test(msg)?'err':/^(⚠️|注意|警告|Warning)/i.test(msg)?'warn':/^(✅|✓|已|完成|成功|Saved|Done)/i.test(msg)?'ok':''));
    n.innerHTML='<div class="vm"></div><button type="button">OK</button>';n.querySelector('.vm').textContent=msg;
    return new Promise(res=>{let done=false;const close=()=>{if(done)return;done=true;try{n.remove()}catch(_){}res()};n.querySelector('button').onclick=close;
      const long=msg.length>160||/\n/.test(msg);setTimeout(close,ms||(long?12000:6000));while(h.children.length>5)h.firstChild.remove();h.appendChild(n)})}
  /* ── modal confirm / prompt, queued so two dialogs never overlap ── */
  let queue=Promise.resolve();
  function modal(opts){const run=()=>new Promise(res=>{const o=opts||{};const msg=String(tr(o.message==null?'':o.message));
    if(auto()||!hasDom()){const ans=o.type==='prompt'?(o.defaultValue==null?'':String(o.defaultValue)):true;record(o.type,msg,ans);if(hasDom())notice('（自動模式 auto）'+(o.type==='prompt'?'已自動填入 '+ans+'：':'已自動確認：')+msg,'auto',4000);return res(ans)}
    const fallback=()=>{const ans=o.type==='prompt'?(nativePrompt?nativePrompt.call(g,msg,o.defaultValue):(o.defaultValue==null?'':String(o.defaultValue))):(nativeConfirm?nativeConfirm.call(g,msg):true);record(o.type,msg,ans);return res(ans)};
    try{
    const h=host('vrtDlgHost');h.innerHTML='';const d=g.document.createElement('div');d.className='vd';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');
    const danger=/刪除|清除|清空|覆蓋|撤銷|delete|clear|remove|overwrite|revoke/i.test(msg);
    d.innerHTML='<div class="vt">'+esc(tr(o.title||(o.type==='prompt'?'請輸入':'請確認')))+'</div><div class="vm"></div>'+(o.type==='prompt'?'<input type="text">':'')+'<div class="vb"><button type="button" class="cancel">'+esc(tr(o.cancelText||'取消'))+'</button><button type="button" class="ok'+(danger?' danger':'')+'">'+esc(tr(o.okText||'確定'))+'</button></div>';
    const vm=d.querySelector('.vm'),okB=d.querySelector('.ok'),ccB=d.querySelector('.cancel'),inp=d.querySelector('input');if(!vm||!okB||!ccB)throw new Error('dialog DOM unavailable');
    vm.textContent=msg;if(inp)inp.value=o.defaultValue==null?'':String(o.defaultValue);
    h.appendChild(d);h.style.display='flex';const prev=g.document.activeElement;
    const finish=v=>{record(o.type,msg,v);h.style.display='none';h.innerHTML='';try{prev&&prev.focus&&prev.focus()}catch(_){}g.removeEventListener('keydown',onKey,true);res(v)};
    const ok=()=>finish(o.type==='prompt'?inp.value:true),cancel=()=>finish(o.type==='prompt'?null:false);
    const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel()}else if(e.key==='Enter'&&(o.type!=='prompt'||e.target===inp)){e.preventDefault();e.stopPropagation();ok()}};
    g.addEventListener('keydown',onKey,true);okB.onclick=ok;ccB.onclick=cancel;h.onclick=e=>{if(e.target===h)cancel()};
    setTimeout(()=>{try{(inp||okB).focus();if(inp)inp.select()}catch(_){}},0);
    }catch(e){fallback()}});
    const p=queue.then(run,run);queue=p.catch(()=>{});return p}
  const api={version:VERSION,alert:notice,notice,confirm:(m,o)=>modal(Object.assign({type:'confirm',message:m},o||{})),prompt:(m,d,o)=>modal(Object.assign({type:'prompt',message:m,defaultValue:d},o||{})),
    get auto(){return auto()},setAuto:v=>{forcedAuto=v==null?null:!!v},log:LOG,native:{alert:nativeAlert,confirm:nativeConfirm,prompt:nativePrompt}};
  g.VRTDialog=api;
  /* global replacements (kept callable from code that has not been converted to the Promise versions) */
  try{
    const customAlert=nativeAlert&&!/\[native code\]/.test(String(nativeAlert));   // a page / test harness that replaced alert() before us keeps receiving the messages
    g.alert=function(m){notice(m);if(customAlert){try{nativeAlert.call(g,m)}catch(_){}}};
    g.confirm=function(m){if(auto()||!hasDom()){record('confirm',m,true);if(hasDom())notice('（自動模式 auto）已自動確認：'+String(m==null?'':m),'auto',4000);return true}return nativeConfirm?nativeConfirm.call(g,m):true};
    g.prompt=function(m,d){if(auto()||!hasDom()){const v=d==null?'':String(d);record('prompt',m,v);return v}return nativePrompt?nativePrompt.call(g,m,d):(d==null?'':String(d))};
  }catch(_){}
})(typeof window!=='undefined'?window:globalThis);
