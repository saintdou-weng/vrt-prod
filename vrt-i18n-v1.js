/* VRT PROD shared language layer v1.0 (2026-09-30)
   One language for every module: 中文 / English / ខ្មែរ.
   - One key (vrt_ui_lang). Before a page's own scripts run, the key is copied into that page's legacy key
     (vrt_lang, cut_lang, vrt_bom2_lang, vrt_pocc_lang, vrt_ie_smv_lang, vrt_fabric_lang, vrt_sp_lang, vrt-cost-lang …)
     so every module opens in the language chosen last anywhere. A page's own switch writes its key → picked up here.
   - Pages that already have a switch keep it; pages without one get a small 中 / EN / ខ្មែរ control.
   - Anything the page still renders in Chinese (hard-coded templates, toasts, alert/confirm, placeholders, titles,
     shared sync messages) is translated from one dictionary (vrt-i18n-en.js / vrt-i18n-km.js, loaded only when needed).
     Chinese mode loads nothing and changes nothing.
   - Mark any element with data-no-i18n to keep its text as is (data, message previews).
*/
(function(g){'use strict';
  if(g.VRTI18n)return;
  const KEY='vrt_ui_lang',LANGS=['zh','en','km'];
  const CJK=/[㐀-䶿一-鿿]/;
  const PAGE=(()=>{try{return decodeURIComponent((location.pathname||'').split('/').pop()||'')}catch(_){return ''}})();
  // legacy per-page keys; json=true stores JSON.stringify(lang)
  const LEGACY=[{k:'vrt_lang'},{k:'cut_lang'},{k:'vrt_bom2_lang'},{k:'vrt_pocc_lang'},{k:'vrt_ie_smv_lang'},{k:'vrt_fabric_lang'},{k:'vrt_sp_lang'},{k:'vrt-cost-lang',json:true},{k:'sew_lang'}];
  const LEGACY_KEYS=new Set(LEGACY.map(x=>x.k));
  const OWN_SWITCH={'sewing_v5.html':1,'cutting_plan_v2.html':1,'VRT_FG_Inventory_Management_v1.html':1,'VRT_BOM_Management_v2_AI.html':1,'VRT_PO_Delivery_Control_Center.html':1,'ie_smv_report_v2_1.html':1,'vrt_bom_costing_view_v39.html':1,'vrt_fabric_delivery_greige_center_v1.html':1,'vrt_fabric_stock_control_v1.html':1,'vrt_spare_parts_v2.html':1};
  let S=null;try{S=g.localStorage}catch(_){}
  const HAS_STORAGE=typeof Storage!=='undefined'&&S instanceof Storage;const rawSet=HAS_STORAGE?Storage.prototype.setItem:null,rawGet=HAS_STORAGE?Storage.prototype.getItem:null;
  const get=k=>{try{return rawGet?rawGet.call(S,k):S&&S.getItem(k)}catch(_){return null}},put=(k,v)=>{try{rawSet?rawSet.call(S,k,v):S&&S.setItem(k,v)}catch(_){}};
  const parseLang=(v,json)=>{if(v==null)return '';let s=String(v);if(json||/^"/.test(s)){try{s=JSON.parse(s)}catch(_){}}s=String(s||'').toLowerCase();return s==='kh'?'km':LANGS.indexOf(s)>=0?s:''};
  let lang=parseLang(get(KEY));
  if(!lang){for(const x of LEGACY){const v=parseLang(get(x.k),x.json);if(v&&v!=='zh'){lang=v;break}}}
  lang=lang||'zh';
  function writeLegacy(l){for(const x of LEGACY)put(x.k,x.json?JSON.stringify(l):l);
    try{const s=JSON.parse(get('vrt_pocc_settings')||'null');if(s&&typeof s==='object'&&s.lang!==l){s.lang=l;put('vrt_pocc_settings',JSON.stringify(s))}}catch(_){}}
  put(KEY,lang);writeLegacy(lang);
  try{document.documentElement.lang=lang==='zh'?'zh-Hant':lang}catch(_){}
  // a page's own switch writes its legacy key → follow it
  if(HAS_STORAGE)try{Storage.prototype.setItem=function(k,v){rawSet.call(this,k,v);if(this===S&&LEGACY_KEYS.has(k)){const x=LEGACY.find(y=>y.k===k),l=parseLang(v,x&&x.json);if(l&&l!==lang)setLang(l,{fromPage:true})}}}catch(_){}

  /* ── dictionary ── */
  const DICT={en:null,km:null},loading={};
  function scriptBase(){const s=[...document.getElementsByTagName('script')].find(x=>/vrt-i18n-v1\.js/.test(x.src||''));return s?s.src.replace(/vrt-i18n-v1\.js.*$/,''):''}
  function loadDict(l){if(l==='zh')return Promise.resolve(null);if(DICT[l])return Promise.resolve(DICT[l]);if(g['VRT_I18N_'+l.toUpperCase()]){DICT[l]=prep(g['VRT_I18N_'+l.toUpperCase()]);return Promise.resolve(DICT[l])}
    if(loading[l])return loading[l];loading[l]=new Promise(res=>{const s=document.createElement('script');s.src=scriptBase()+'vrt-i18n-'+l+'.js?v=4.14.0';s.onload=()=>{const d=g['VRT_I18N_'+l.toUpperCase()];DICT[l]=d?prep(d):null;res(DICT[l])};s.onerror=()=>res(null);(document.head||document.documentElement).appendChild(s)});return loading[l]}
  function prep(map){const exact=new Map(),pats=[];for(const k of Object.keys(map)){exact.set(k,map[k]);if(k.indexOf('{n}')>=0){const parts=k.split('{n}');const lit=parts.reduce((a,b)=>b.length>a.length?b:a,'');if(!CJK.test(lit)||lit.trim().length<2)continue;const re=new RegExp('^'+parts.map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('(.+?)')+'$');pats.push({lit,re,v:map[k],len:k.replace(/\{n\}/g,'').length})}}
    pats.sort((a,b)=>b.len-a.len);
    // reverse English → Khmer (km mode only; exact, words ≥ 4 chars with a lowercase letter, so codes like PO / ADI stay)
    return {exact,pats,cache:new Map()}}
  let REV=null;function buildRev(){if(REV||!DICT.en||!DICT.km)return REV;REV=new Map();for(const [k,en] of DICT.en.exact){const km=DICT.km.exact.get(k);if(!km||!en||en.length<4||!/[a-z]/.test(en)||/\{n\}/.test(en)||CJK.test(en))continue;if(!REV.has(en))REV.set(en,km)}return REV}

  /* ── translate one string ── */
  const NUM=/(?<![A-Za-z㐀-鿿])\d[\d,.:\/\-%]*/g;
  function numKey(s){const m=[...s.matchAll(NUM)];if(!m.length)return null;const groups=[];for(const x of m){const last=groups[groups.length-1];if(last&&/^\s*$/.test(s.slice(last.end,x.index))){last.end=x.index+x[0].length}else groups.push({start:x.index,end:x.index+x[0].length})}
    let key='',pos=0;const vals=[];for(const gp of groups){key+=s.slice(pos,gp.start)+'{n}';vals.push(s.slice(gp.start,gp.end));pos=gp.end}key+=s.slice(pos);return {key,vals}}
  const fill=(t,vals)=>{let i=0;return t.replace(/\{n\}/g,()=>vals[i++]!=null?vals[i-1]:'')};
  function lookup(D,s,depth){let v=D.exact.get(s);if(v!=null)return v;
    const nk=numKey(s);if(nk){v=D.exact.get(nk.key);if(v!=null)return fill(v,nk.vals)}
    for(const p of D.pats){if(s.indexOf(p.lit)<0)continue;const m=s.match(p.re);if(m){const vals=m.slice(1).map(x=>depth<2&&CJK.test(x)?(tr(x,depth+1)||x):x);return fill(p.v,vals)}}
    // leading emoji / symbols, or a bracketed prefix such as a log time "[12:44:21 AM] "
    const lead=s.match(/^(\[[^\]]{1,30}\]\s*)(.+)$/)||s.match(/^([^\p{L}\p{N}\[]+)(.+)$/u);if(lead&&CJK.test(lead[2])&&depth<3){const r=tr(lead[2].trim(),depth+1);if(r!=null)return lead[1]+r}
    return null}
  const cjkCount=x=>x==null?1e9:(String(x).match(/[\u3400-\u9fff]/g)||[]).length;
  const SPLIT=/(\s+[\/|·•]\s+|\s*[：:，,、；;（）()「」【】\[\]→＞>]\s*|\s+[—–-]\s+|\n)/;
  // last resort: translate each run of Chinese characters on its own (bilingual "中文 English" pairs first)
  const RUN=/[\u3400-\u9fff]+(?:[／・][\u3400-\u9fff]+)*/g;
  function runsSafe(D,s){// String.replace cannot consume the look-ahead English, so do it by hand
    let out='',i=0,changed=false;RUN.lastIndex=0;let m;while((m=RUN.exec(s))){out+=s.slice(i,m.index);const rest=s.slice(m.index+m[0].length);const lat=rest.match(/^\s+([A-Za-z][A-Za-z .&'\/()-]*[A-Za-z)])/);let rep=null,consumed=m[0].length;
      if(lat){const both=D.exact.get(m[0]+' '+lat[1]);if(both!=null){rep=both;consumed+=lat[0].length}}
      if(rep==null){const v=D.exact.get(m[0]);if(v!=null)rep=v}
      if(rep!=null){changed=true;out+=rep}else out+=m[0];i=m.index+consumed;RUN.lastIndex=i}
    out+=s.slice(i);return changed?out:null}
  function tr(text,depth){depth=depth||0;const D=DICT[lang];if(!D||!CJK.test(text))return null;const s=text.replace(/\s+/g,' ').trim();if(!s)return null;
    const ck=depth+'|'+s;if(D.cache.has(ck))return D.cache.get(ck);let r=lookup(D,s,depth);
    // a partial match (Chinese still left) competes with the segment and run fallbacks; the one with the least Chinese wins
    if((r==null||cjkCount(r)>0)&&depth<2){let seg=null;const parts=s.split(SPLIT);if(parts.length>1){let changed=false;const outp=parts.map(p=>{if(!CJK.test(p))return p;const t=p.trim();const q=lookup(D,t,depth+1)??runsSafe(D,t);if(q!=null){changed=true;return p.replace(t,q)}return p});if(changed)seg=outp.join('')}
      const run=runsSafe(D,s);for(const c of [seg,run])if(c!=null&&cjkCount(c)<cjkCount(r))r=c}
    D.cache.set(ck,r);return r}
  function trKm(text){if(lang!=='km')return null;const rev=buildRev();if(!rev)return null;const s=text.replace(/\s+/g,' ').trim();return rev.get(s)||null}
  // full-width punctuation left around translated pieces → normal spacing (only once no Chinese is left)
  const FW=[[/\s*：\s*/g,': '],[/\s*（\s*/g,' ('],[/\s*）/g,')'],[/\s*，\s*/g,', '],[/\s*；\s*/g,'; '],[/\s*、\s*/g,', '],[/\s*？/g,'?'],[/\s*！/g,'!'],[/。/g,'. ']];
  const tidy=r=>{if(CJK.test(r))return r;let x=r;for(const [re,v] of FW)x=x.replace(re,v);return x.replace(/\(\s+/g,'(').replace(/ {2,}/g,' ').replace(/\s+([,.;:!?)])/g,'$1').trim()};
  function translate(text){if(lang==='zh'||text==null)return null;const t=String(text);let r=CJK.test(t)?tr(t):trKm(t);if(r==null)return null;r=tidy(r);const lead=t.match(/^\s*/)[0],trail=t.match(/\s*$/)[0];return lead+r+trail}
  function translateLines(msg){if(lang==='zh'||msg==null)return msg;return String(msg).split('\n').map(l=>translate(l)||l).join('\n')}

  /* ── DOM ── */
  const ORIG=new WeakMap(),DONE=new Set(),ATTRS=['placeholder','title','aria-label','alt'];
  const SKIP_TAG={SCRIPT:1,STYLE:1,TEXTAREA:1,NOSCRIPT:1,CODE:1,PRE:1};
  function skipEl(el){for(let e=el;e&&e.nodeType===1;e=e.parentElement){if(SKIP_TAG[e.tagName]||e.hasAttribute('data-no-i18n')||e.isContentEditable)return true}return false}
  function doText(n){const v=n.nodeValue;if(!v||!v.trim())return;const prev=ORIG.get(n);if(prev&&prev.out===v)return;const r=translate(v);if(r==null||r===v)return;ORIG.set(n,{src:v,out:r});DONE.add(n);n.nodeValue=r}
  function doAttrs(el){for(const a of ATTRS){if(!el.hasAttribute(a))continue;const v=el.getAttribute(a);const key='a:'+a;const st=ORIG.get(el)||{};if(st[key]&&st[key].out===v)continue;const r=/\n/.test(v)?translateLines(v):translate(v);if(r==null||r===v)continue;st[key]={src:v,out:r};ORIG.set(el,st);DONE.add(el);el.setAttribute(a,r)}
    if(el.tagName==='INPUT'&&/^(button|submit|reset)$/i.test(el.type)&&el.value){const st=ORIG.get(el)||{};const v=el.value;if(!(st.val&&st.val.out===v)){const r=translate(v);if(r&&r!==v){st.val={src:v,out:r};ORIG.set(el,st);DONE.add(el);el.value=r}}}}
  function walk(root){if(!root||lang==='zh'||!DICT[lang])return;if(root.nodeType===3){if(!skipEl(root.parentElement))doText(root);return}if(root.nodeType!==1&&root.nodeType!==9&&root.nodeType!==11)return;if(root.nodeType===1&&skipEl(root))return;
    if(root.nodeType===1)doAttrs(root);const w=document.createTreeWalker(root,5/*ELEMENT|TEXT*/,{acceptNode:n=>n.nodeType===1&&(SKIP_TAG[n.tagName]||n.hasAttribute('data-no-i18n'))?2:1});let n;while((n=w.nextNode())){if(n.nodeType===3)doText(n);else doAttrs(n)}}
  function restore(){for(const n of DONE){const st=ORIG.get(n);if(!st)continue;if(n.nodeType===3){if(st.out===n.nodeValue)n.nodeValue=st.src}else{for(const a of ATTRS){const x=st['a:'+a];if(x&&n.getAttribute(a)===x.out)n.setAttribute(a,x.src)}if(st.val&&n.value===st.val.out)n.value=st.val.src}ORIG.delete(n)}DONE.clear()}
  let mo=null,queue=new Set(),qTimer=0;
  function flush(){qTimer=0;const items=[...queue];queue.clear();for(const n of items)if(n.isConnected!==false)walk(n);if(document.title&&CJK.test(document.title)){const r=translate(document.title);if(r)document.title=r}}
  function enqueue(n){queue.add(n);if(!qTimer)qTimer=setTimeout(flush,0)}
  function observe(){if(mo||typeof MutationObserver==='undefined')return;mo=new MutationObserver(list=>{if(lang==='zh')return;for(const m of list){if(m.type==='childList')m.addedNodes.forEach(enqueue);else if(m.type==='characterData')enqueue(m.target);else if(m.type==='attributes')enqueue(m.target)}});mo.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS})}
  function prune(){for(const n of DONE)if(!n.isConnected)DONE.delete(n)}
  setInterval(prune,60000);
  /* ── dialogs ── */
  const _alert=g.alert,_confirm=g.confirm,_prompt=g.prompt;
  try{g.alert=function(m){return _alert.call(g,translateLines(m))};g.confirm=function(m){return _confirm.call(g,translateLines(m))};g.prompt=function(m,d){return _prompt.call(g,translateLines(m),d)}}catch(_){}
  /* ── switch UI (pages without their own) ── */
  function mountSwitch(){if(OWN_SWITCH[PAGE]||document.getElementById('vrtLangSw'))return;const st=document.createElement('style');st.textContent='#vrtLangSw{position:fixed;top:2px;left:50%;transform:translateX(-50%);z-index:9991;opacity:.92;display:flex;gap:2px;background:#14213d;border-radius:5px;padding:2px;font:11px system-ui,-apple-system,"Segoe UI",sans-serif}#vrtLangSw button{border:0;background:none;color:#cbd5e1;padding:2px 7px;border-radius:4px;cursor:pointer;font:inherit}#vrtLangSw button.on{background:#f59e0b;color:#0f172a;font-weight:700}';document.head.appendChild(st);
    const box=document.createElement('div');box.id='vrtLangSw';box.setAttribute('data-no-i18n','');box.innerHTML=[['zh','中'],['en','EN'],['km','ខ្មែរ']].map(([l,t])=>'<button type="button" data-l="'+l+'" class="'+(l===lang?'on':'')+'">'+t+'</button>').join('');box.addEventListener('click',e=>{const b=e.target.closest('button[data-l]');if(b)setLang(b.dataset.l)});document.body.appendChild(box)}
  function paintSwitch(){const box=document.getElementById('vrtLangSw');if(box)[...box.children].forEach(b=>b.classList.toggle('on',b.dataset.l===lang))}
  /* ── page adapters: after the page has loaded, bring its own switch into line with the shared language ── */
  const ADAPT={
    'vrt_fabric_delivery_greige_center_v1.html':l=>{try{const S2=g.S||(0,eval)('typeof S!=="undefined"?S:null');if(S2&&S2.cfg&&S2.cfg.lang!==l&&typeof g.cycleLang==='function'){let i=0;while(S2.cfg.lang!==l&&i++<3)g.cycleLang()}}catch(_){}},
    'production_plan_capacity_v1.html':l=>{try{const b=document.getElementById('langBtn');if(b)b.textContent=l==='zh'?'中':l==='en'?'EN':'ខ្មែរ'}catch(_){}},
  };
  /* ── API ── */
  async function apply(){try{document.documentElement.lang=lang==='zh'?'zh-Hant':lang}catch(_){}paintSwitch();if(lang==='zh'){restore();return}await loadDict(lang);if(lang==='km')await loadDict('en');observe();walk(document.body);flush()}
  function setLang(l,opts){opts=opts||{};l=parseLang(l)||'zh';if(l===lang&&!opts.force)return lang;lang=l;put(KEY,l);if(!opts.fromPage)writeLegacy(l);const ad=ADAPT[PAGE];if(ad&&!opts.fromPage)try{ad(l)}catch(_){}
    // pages whose own i18n re-renders on reload only: nothing else to do; the observer translates what is left
    apply();try{g.dispatchEvent(new CustomEvent('vrt:lang',{detail:{lang:l}}))}catch(_){}return lang}
  function cycle(){return setLang(LANGS[(LANGS.indexOf(lang)+1)%LANGS.length])}
  function start(){try{mountSwitch()}catch(_){}const ad=ADAPT[PAGE];if(ad)setTimeout(()=>{try{ad(lang)}catch(_){}},400);apply().catch(()=>{})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  g.VRTI18n={version:'1.0',get lang(){return lang},set:setLang,cycle,t:s=>translate(s)||s,translate,load:loadDict,walk,apply,restore,LANGS};
})(typeof window!=='undefined'?window:globalThis);
