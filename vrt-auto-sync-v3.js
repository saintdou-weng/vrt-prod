/* VRT PROD Auto Sync v3.7 — local-first incremental PROD Smart Sync
 * Principles:
 * - local-first UI; cloud never blocks page startup
 * - background Pull -> Push reconcile
 * - pending state survives offline/reload
 * - startup/network restore/app resume/pageshow reconcile
 * - import/save/delete/approval/OCR actions schedule sync automatically
 * - manual cloud buttons and the fixed bottom ☁↑ / ☁↓ status remain untouched
 */
(function(g){
  'use strict';if(g.VRTProdAutoSync)return;
  const VERSION='4.0.0',PFX='vrt:prod:auto37:',LOCK='vrt:prod:auto37:lock:',C={};
  const TAB=Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const online=()=>{try{return !('onLine' in navigator)||navigator.onLine}catch(_){return true}};
  const read=k=>{try{return JSON.parse(localStorage.getItem(PFX+k)||'null')}catch(_){return null}};
  const write=(k,v)=>{try{localStorage.setItem(PFX+k,JSON.stringify(v))}catch(_){}};
  const clear=k=>{try{localStorage.removeItem(PFX+k)}catch(_){}};
  const merge=(a,b)=>Object.assign({},a||{},b||{});
  function status(dir,msg,type){try{g.VRTSmartSync&&VRTSmartSync.status(dir,msg,type)}catch(_){}}
  function reasonDelay(reason,requested){const r=String(reason||'').toLowerCase();let d=requested==null?1200:Number(requested);if(!isFinite(d)||d<0)d=1200;if(/approval|review|telegram|publish|restore|delete|remove/.test(r))return Math.min(d,350);if(/import|ocr|file/.test(r))return Math.min(d,1100);return d}
  function lockAcquire(k){try{const key=LOCK+k,old=JSON.parse(localStorage.getItem(key)||'null'),n=Date.now();if(old&&n-old.at<45000&&old.tab!==TAB)return false;localStorage.setItem(key,JSON.stringify({at:n,tab:TAB}));return true}catch(_){return true}}
  function lockRelease(k){try{const key=LOCK+k,old=JSON.parse(localStorage.getItem(key)||'null');if(!old||old.tab===TAB)localStorage.removeItem(key)}catch(_){}}
  function install(opts){
    opts=opts||{};const key=String(opts.key||'').trim();if(!key)throw new Error('VRTProdAutoSync key required');
    if(C[key]){C[key].opts=opts;return C[key]}
    const st=C[key]={key,lockKey:String(opts.lockKey||key),opts,busy:false,timer:null,queued:null,lastRun:0};
    const canSync=()=>{try{return typeof st.opts.canSync==='function'?!!st.opts.canSync():true}catch(_){return false}};
    async function run(reason,extra){
      reason=reason||'reconcile';extra=extra||{};if(st.busy){st.queued={reason,extra:merge(st.queued&&st.queued.extra,extra)};return false}
      const prior=read(key);if(g.VRT_LOCAL_READY)await g.VRT_LOCAL_READY;
      if(!online()||!canSync()){write(key,{reason,extra,at:Date.now()});status('push',online()?'雲端待重試':'離線待傳','warn');return false}
      if(!lockAcquire(st.lockKey)){status('pull','另一分頁正在同步 · 稍後重試','warn');schedule('tab-busy',extra,3000);return false}
      st.busy=true;const heartbeat=setInterval(()=>lockAcquire(st.lockKey),12000);st.lastRun=Date.now();status('pull','自動檢查更新…','busy');
      let pullOK=true,pushOK=true;
      try{
        if(typeof st.opts.pull==='function')try{const r=await st.opts.pull({silent:true,auto:true,reason});pullOK=(r!==false&&!(r&&r.ok===false&&!r.noCloud))}catch(e){pullOK=false;console.warn('[VRT Auto pull '+key+']',e)}
        if(pullOK&&typeof st.opts.push==='function')try{status('push','自動比對待上傳…','busy');const r=await st.opts.push(Object.assign({silent:true,auto:true,reason},extra));pushOK=(r!==false&&!(r&&r.ok===false))}catch(e){pushOK=false;console.warn('[VRT Auto push '+key+']',e)}
        if(pullOK&&pushOK){clear(key);return true}
        if(!prior&&/^(startup-reconcile|resume|pageshow|network-restored)$/.test(String(reason||''))){clear(key);return false}
        write(key,{reason,extra,at:Date.now()});status('push','雲端待重試','warn');return false
      }catch(e){write(key,{reason,extra,at:Date.now()});status('push','雲端待重試 · '+e.message,'err');console.warn('[VRT Auto '+key+']',e);return false}
      finally{clearInterval(heartbeat);st.busy=false;lockRelease(st.lockKey);if(st.queued){const q=st.queued;st.queued=null;schedule(q.reason,q.extra,350)}}
    }
    function schedule(reason,extra,delay){reason=reason||'change';extra=extra||{};const old=read(key)||{};write(key,{reason,extra:merge(old.extra,extra),at:Date.now()});status('push',online()?'待自動同步':'離線待傳','warn');if(st.timer)clearTimeout(st.timer);st.timer=setTimeout(()=>{st.timer=null;const p=read(key)||{};run(p.reason||reason,merge(p.extra,extra))},reasonDelay(reason,delay));return true}
    st.run=run;st.schedule=schedule;addEventListener('pagehide',()=>lockRelease(st.lockKey));
    const startup=()=>{const p=read(key)||{};setTimeout(()=>run(p.reason||'startup-reconcile',p.extra||{}),Number(opts.startDelay)||1200)};
    if(document.readyState==='complete'||document.readyState==='interactive')startup();else addEventListener('load',startup,{once:true});
    addEventListener('online',()=>{const p=read(key)||{};setTimeout(()=>run(p.reason||'network-restored',p.extra||{}),180)});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&online()){const p=read(key)||{};setTimeout(()=>run(p.reason||'resume',p.extra||{}),250)}});
    addEventListener('pageshow',e=>{if(e&&e.persisted&&online()){const p=read(key)||{};setTimeout(()=>run(p.reason||'pageshow',p.extra||{}),250)}});
    if(opts.watch!==false){
      const mut=/儲存|保存|確認|新增|修改|刪除|移除|清除|核可|簽核|approve|save|delete|remove|\bdel\w*|clear|commit|restore|還原|匯入|import|ocr|telegram|摘要|發送|send|publish|發布/i;
      const cloud=/雲端|cloud|推送|拉取|上傳|下載|push|pull|sync/i;
      document.addEventListener('change',e=>{const t=e.target;if(!t)return;if(t.matches&&t.matches('input[type=file]')){schedule('file-change',{},1500);setTimeout(()=>run('post-import-check',{}),9000)}},true);
      document.addEventListener('drop',e=>{if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){schedule('file-change',{},1500);setTimeout(()=>run('post-import-check',{}),9000)}},true);
      document.addEventListener('click',e=>{const b=e.target&&e.target.closest?e.target.closest('button,[role=button],a'):null;if(!b)return;const tx=((b.textContent||'')+' '+(b.id||'')+' '+(b.title||'')+' '+(b.getAttribute('onclick')||''));if(cloud.test(tx))return;if(mut.test(tx)){const deleting=/刪除|移除|清除|delete|remove|\bdel\w*|clear|🗑/i.test(tx);if(deleting)try{g.VRTSmartSync&&VRTSmartSync.authorizeShrink(key,'explicit-ui-delete')}catch(_){}const rs=/匯入|import|ocr/i.test(tx)?'import':(/核可|簽核|approve|publish|發布/i.test(tx)?'approval':'change');schedule(rs,{},rs==='change'?1300:900);setTimeout(()=>run('post-action-check',{}),6500)}},true);
    }
    return st;
  }
  g.VRTProdAutoSync={version:VERSION,install,schedule:(k,r,e,d)=>C[k]?C[k].schedule(r,e,d):false,markDirty:(k,r,e,d)=>C[k]&&!C[k].busy?C[k].schedule(r||'change',e,d):false,run:(k,r,e)=>C[k]?C[k].run(r,e):Promise.resolve(false),flush:(k,r,e)=>C[k]?C[k].run(r,e):Promise.resolve(false),pending:k=>read(k),state:k=>C[k]||null};
})(window);
