/* VRT PROD per-page Telegram sender v1.0 (2026-09-30)
   Same pattern as AC-HRA-PAY: every module gets a "✈️ Telegram" button → modal with 期間類型 (日/週/月/年), 期間 (only periods
   that hold data, newest first, with counts), preview, ✈️ send. Text comes from vrt-tg-summary-v1.js, so a summary sent from
   the page is identical to the one the bot sends for /day /week /month /year.
   Sending goes through the shared GAS proxy (action:'sendMessage', HTML parse mode, chat_id blank = the default group).
   Usage (inline, after the page's own scripts):
     VRTTelegram.init({kind:'sewing', tool:'sewing', getData:()=>DB});
   Optional: mount (selector of a container for the button; default = floating button bottom-left), buttonClass, chatKey.
*/
(function(g){'use strict';
  if(g.VRTTelegram)return;
  const TGS=()=>g.VRTTgSummary;
  const CHAT_KEY='vrt_tg_chat';
  let cfg=null,state={period:'day',anchor:'',chat:''},els={};
  const L=(zh,en)=>{const I=g.VRTI18n,l=I&&I.lang;if(!l||l==='zh')return zh+' '+en;if(l==='en')return en;const k=I.translate(zh);return k?k.trim():en};   // v4.14: follows the shared language
  const css=`
  #vrtTgFab{position:fixed;left:16px;bottom:16px;z-index:9998;border:0;border-radius:999px;padding:10px 14px;background:#4f46e5;color:#fff;font:600 13px/1 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans TC",sans-serif;box-shadow:0 6px 20px rgba(79,70,229,.35);cursor:pointer;display:flex;align-items:center;gap:6px}
  #vrtTgFab:hover{background:#4338ca}
  #vrtTgModal{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans TC",sans-serif}
  #vrtTgModal.open{display:flex}
  #vrtTgModal .box{background:#fff;color:#0f172a;border-radius:16px;width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
  #vrtTgModal .hd{padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px}
  #vrtTgModal .hd b{font-size:15px}#vrtTgModal .hd small{display:block;color:#64748b;font-size:12px;margin-top:2px}
  #vrtTgModal .x{margin-left:auto;border:0;background:none;font-size:22px;color:#94a3b8;cursor:pointer}
  #vrtTgModal .bd{padding:14px 18px;overflow:auto;display:flex;flex-direction:column;gap:12px}
  #vrtTgModal label{display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px;letter-spacing:.02em}
  #vrtTgModal select,#vrtTgModal input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font-size:13px;background:#fff;color:#0f172a}
  #vrtTgModal .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  #vrtTgModal .seg{display:flex;background:#f1f5f9;border-radius:10px;padding:3px;gap:3px}
  #vrtTgModal .seg button{flex:1;border:0;background:none;border-radius:8px;padding:7px 4px;font-size:12px;font-weight:600;color:#475569;cursor:pointer}
  #vrtTgModal .seg button.on{background:#fff;color:#4f46e5;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  #vrtTgModal pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12.5px/1.55 ui-monospace,Menlo,Consolas,"Noto Sans TC",monospace;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;max-height:44vh;overflow:auto;color:#334155}
  #vrtTgModal .ft{padding:12px 18px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;gap:8px}
  #vrtTgModal .btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:9px;padding:9px 12px;font-size:13px;font-weight:600;cursor:pointer}
  #vrtTgModal .btn.p{flex:1;background:#4f46e5;border-color:#4f46e5;color:#fff}#vrtTgModal .btn.p:disabled{background:#cbd5e1;border-color:#cbd5e1;color:#64748b}
  #vrtTgModal .stat{margin-left:auto;font-size:11px;color:#64748b;align-self:center}
  #vrtTgModal .note{font-size:11px;color:#64748b}
  #vrtTgToast{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:100000;background:#0f172a;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.3);display:none;max-width:90vw}
  @media(max-width:520px){#vrtTgModal .row{grid-template-columns:1fr}}`;
  function toast(m,ms){let t=document.getElementById('vrtTgToast');if(!t){t=document.createElement('div');t.id='vrtTgToast';document.body.appendChild(t)}t.textContent=m;t.style.display='block';clearTimeout(t._h);t._h=setTimeout(()=>t.style.display='none',ms||3200)}
  function gasUrl(){try{return (g.VRTPlatform&&g.VRTPlatform.getGasUrl&&g.VRTPlatform.getGasUrl())||localStorage.getItem('vrt_portal_gas_url')||''}catch(_){return ''}}
  async function getData(){const d=cfg.getData?await cfg.getData():null;return d||(cfg.kind==='qc'||cfg.kind==='spareparts'||cfg.kind==='orders'||cfg.kind==='custstats'||cfg.kind==='fabricstock'||cfg.kind==='ie'?{}:[])}
  async function options(){const S=TGS();const data=await getData();const rows=S.rowsOf(cfg.kind,data),fn=S.dateFnOf(cfg.kind),today=S.localToday();let opts=S.periodOptions(rows,state.period,fn,today);
    const K=S.KINDS[cfg.kind];if(K.anchor==='today'){const P=S.periodOf(state.period,today,today);if(!opts.some(o=>o.key===P.key))opts.unshift({key:P.key,anchor:P.start,label:P.label,count:0});opts.sort((a,b)=>b.anchor<a.anchor?-1:b.anchor>a.anchor?1:0)}
    return {opts:opts.slice(0,60),data}}
  async function build(){const S=TGS();const data=await getData();return S.build(cfg.kind,data,state.period,state.anchor,{metaLine:cfg.metaLine?cfg.metaLine():'網頁送出 sent from web · '+S.esc(new Date().toISOString().slice(0,16).replace('T',' '))})}
  function ensureUI(){if(els.modal)return;const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
    const m=document.createElement('div');m.id='vrtTgModal';m.innerHTML='<div class="box"><div class="hd"><span style="font-size:20px">✈️</span><div><b>'+L('傳送至 Telegram 群組','Send to Telegram group')+'</b><small id="vrtTgKind"></small></div><button class="x" data-act="close">&times;</button></div>'+
      '<div class="bd"><div><label>'+L('期間類型','Period type')+'</label><div class="seg" id="vrtTgSeg"></div></div>'+
      '<div class="row"><div><label>'+L('期間（有資料的）','Period (with data)')+'</label><select id="vrtTgPeriod"></select></div><div><label>'+L('群組 ID（留空＝預設群組）','Chat ID (blank = default group)')+'</label><input id="vrtTgChat" placeholder="-100…"></div></div>'+
      '<div><label>'+L('訊息預覽','Preview')+' <span class="stat" id="vrtTgStat"></span></label><pre id="vrtTgPreview"></pre></div>'+
      '<div class="note">'+L('中文／English 同一則；與機器人 /day /week /month /year 的內容一致。','Bilingual; identical to what the bot sends for /day /week /month /year.')+'</div></div>'+
      '<div class="ft"><button class="btn" data-act="close">'+L('取消','Cancel')+'</button><button class="btn" data-act="copy">📋 '+L('複製','Copy')+'</button><button class="btn p" id="vrtTgSend" data-act="send">✈️ '+L('確認傳送','Send')+'</button></div></div>';
    document.body.appendChild(m);els.modal=m;els.seg=m.querySelector('#vrtTgSeg');els.period=m.querySelector('#vrtTgPeriod');els.chat=m.querySelector('#vrtTgChat');els.preview=m.querySelector('#vrtTgPreview');els.stat=m.querySelector('#vrtTgStat');els.send=m.querySelector('#vrtTgSend');els.kind=m.querySelector('#vrtTgKind');
    const S=TGS();els.seg.innerHTML=S.PERIODS.map(p=>'<button data-p="'+p+'">'+S.PERIOD_LABEL[p].zh+' '+S.PERIOD_LABEL[p].en+'</button>').join('');
    m.addEventListener('click',e=>{const t=e.target.closest('[data-act],[data-p]');if(!t)return;if(t.dataset.p){setPeriod(t.dataset.p);return}const a=t.dataset.act;if(a==='close')close();else if(a==='copy')copy();else if(a==='send')send()});
    m.addEventListener('click',e=>{if(e.target===m)close()});
    els.period.addEventListener('change',()=>{state.anchor=els.period.value;preview()});
    els.chat.addEventListener('input',()=>{state.chat=els.chat.value.trim();try{localStorage.setItem(CHAT_KEY,state.chat)}catch(_){}});
  }
  async function setPeriod(p){state.period=p;[...els.seg.children].forEach(b=>b.classList.toggle('on',b.dataset.p===p));const {opts}=await options();els.period.innerHTML=opts.length?opts.map(o=>'<option value="'+o.anchor+'">'+TGS().esc(o.label)+'　('+o.count+')</option>').join(''):'<option value="">'+L('沒有資料','No data')+'</option>';state.anchor=opts.length?opts[0].anchor:'';await preview()}
  async function preview(){const S=TGS();try{const b=await build();els._last=b;els.preview.textContent=S.plain(b.text);els.stat.textContent=b.text.length+' / 4096'+(b.empty?' · '+L('本期無資料','no data'):'');els.send.disabled=!!b.empty||!b.text}catch(e){els.preview.textContent='⚠️ '+e.message;els.send.disabled=true}}
  async function copy(){try{await navigator.clipboard.writeText(TGS().plain(els._last&&els._last.text||''));toast(L('已複製','Copied'))}catch(e){toast(L('無法複製','Copy failed'))}}
  async function sendText(text,chatId){const url=gasUrl();if(!url)throw new Error(L('尚未設定 GAS 網址，請先在平台設定','GAS URL not set; set it in the portal first'));
    const post=async body=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow'});let d=null;try{d=await r.json()}catch(_){}if(!d)throw new Error('GAS no JSON reply');return d};
    const base={action:'sendMessage',text:TGS().clip(text,4000),parse_mode:'HTML',disable_web_page_preview:true,auditTool:(cfg&&(cfg.tool||cfg.kind))||'portal',auditType:'summary'};if(chatId)base.chat_id=chatId;
    let d=await post(base);
    if(!d.ok){const plain=Object.assign({},base,{text:TGS().clip(TGS().plain(text),4000),parse_mode:'none',plain:true});const d2=await post(plain);if(!d2.ok)throw new Error(d2.error||d.error||'send failed');return {ok:true,plain:true,data:d2.data}}
    return {ok:true,plain:!!(d.data&&d.data.plainFallback),data:d.data}}
  async function send(){const b=els._last;if(!b||b.empty)return;els.send.disabled=true;els.send.textContent='⏳ '+L('傳送中','Sending');try{const r=await sendText(b.text,state.chat);toast('✅ '+L('已傳送至 Telegram 群組','Sent to Telegram')+(r.plain?'（純文字 plain text）':''));close()}catch(e){toast('❌ '+L('傳送失敗','Send failed')+': '+e.message,5000)}finally{els.send.disabled=false;els.send.textContent='✈️ '+L('確認傳送','Send')}}
  try{g.addEventListener('vrt:lang',()=>{if(els.modal){const wasOpen=els.modal.classList.contains('open');els.modal.remove();els={};if(wasOpen)open()}})}catch(_){}
  async function open(period){ensureUI();const S=TGS(),K=S.KINDS[cfg.kind];els.kind.textContent=K.icon+' '+K.zh+' '+K.en+' · '+(cfg.tool||cfg.kind);try{state.chat=localStorage.getItem(CHAT_KEY)||''}catch(_){}els.chat.value=state.chat;els.modal.classList.add('open');await setPeriod(period||state.period||'day')}
  function close(){if(els.modal)els.modal.classList.remove('open')}
  function mountButton(){if(document.getElementById('vrtTgFab'))return;const b=document.createElement('button');b.id='vrtTgFab';b.type='button';b.title=L('傳送本頁摘要到 Telegram（日／週／月／年）','Send this page\'s summary to Telegram (day/week/month/year)');b.addEventListener('mouseenter',()=>{b.title=L('傳送本頁摘要到 Telegram（日／週／月／年）','Send this page\'s summary to Telegram (day/week/month/year)')});b.innerHTML='✈️ <span>Telegram</span>';b.addEventListener('click',()=>open());
    const host=cfg.mount?(typeof cfg.mount==='string'?document.querySelector(cfg.mount):cfg.mount):null;if(host){b.style.position='static';b.style.boxShadow='none';if(cfg.buttonClass)b.className=cfg.buttonClass;host.appendChild(b)}else document.body.appendChild(b)}
  function init(c){cfg=Object.assign({},c||{});if(!cfg.kind)throw new Error('VRTTelegram.init needs kind');if(!TGS())throw new Error('vrt-tg-summary-v1.js must load before vrt-telegram-v1.js');if(document.body)mountButton();else document.addEventListener('DOMContentLoaded',mountButton);return api}
  const api={version:'1.0',init,open,close,send:sendText,text:async(period,anchor)=>{state.period=period||state.period;state.anchor=anchor||'';return build()},options:async period=>{state.period=period||state.period;return (await options()).opts},get state(){return state},get cfg(){return cfg}};
  g.VRTTelegram=api;
})(typeof window!=='undefined'?window:globalThis);
