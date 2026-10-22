/* VRT PROD 智慧匯入 v1.0 (2026-10-22, Paul 10/21) — one 「⇧ 智慧匯入」 for the whole platform.
   · A fixed button at the top of every page (and a big card on the portal). Drop / choose / photograph any file: Excel / CSV, Outlook
     .msg / .eml, PDF, photos, zip. Mails and zips are opened here; every file is fingerprinted (SHA-256) and routed to its module by
     file name → mail subject → the sheet headers → the choice remembered from last time; anything still unclear is asked once (pick the module).
   · Already imported = skipped by default (local ledger + the GAS inbox ledger, which also knows the files the bots collected from the
     Telegram groups / e-mail), the same file twice in one drop is taken once — like the cloud sync: only what is new is moved.
   · Files for THIS page go straight to the page's own importer (same parser, preview and questions as a manual upload). Files for other
     modules are handed over through this browser's IndexedDB (VRT_SmartImport) and imported as soon as that page opens (one tap per
     module, chained). Nothing is written into any module's data by this file — the module's own importer does that.
   · The 「☁ 群組／Email 已收到」 list shows what the bots collected and is not imported yet; one tap adds them to the same flow.
   · After a module has its files: ✈️ 發摘要 (the page's own Telegram summary) and ✅ 核可 where a page registers an approval step.
   Pure helpers (route / sniff / msg / eml / zip) are exported for the tests (Node: require this file, pass XLSX). */
(function(g){'use strict';
  if(g.VRTSmartImport&&g.VRTSmartImport.version)return;
  const VERSION='1.0.0';
  /* ── modules: page + file types each page's own importer takes; msgWhole = the page reads .msg/.eml itself (keeps the mail name / date) ── */
  const MODULES={
    sewing:{zh:'🧵 車縫',en:'🧵 Sewing',page:'sewing_v5.html',ext:'xlsx xls csv eml msg',msgWhole:true},
    cutting:{zh:'✂️ 裁剪',en:'✂️ Cutting',page:'cutting_v3.html',ext:'xlsx xls csv eml msg json',msgWhole:true},
    cuttingplan:{zh:'📅 裁剪計劃',en:'📅 Cutting plan',page:'cutting_plan_v2.html',ext:'xlsx xls csv'},
    prodplan:{zh:'🗓 排單產能',en:'🗓 Production plan',page:'production_plan_capacity_v1.html',ext:'xlsx xls csv json'},
    orders:{zh:'📦 訂單週報／客戶 PO',en:'📦 Orders / customer POs',page:'orders_v3.html',ext:'xlsx xls pdf msg',msgWhole:true},
    shipping:{zh:'🚚 出貨排程',en:'🚚 Shipping schedule',page:'shipping_v2.html',ext:'xlsx xlsb xls'},
    monthship:{zh:'🚢 月出貨',en:'🚢 Monthly shipping',page:'vrt_monthly_shipping_control_center_v1.html',ext:'xlsx xls csv'},
    custstats:{zh:'📊 客戶統計',en:'📊 Customer statistics',page:'vrt_customer_statistics_control_center_v1.html',ext:'xlsx xls'},
    qc:{zh:'✅ Final QC',en:'✅ Final QC',page:'vrt_final_qc_v1.html',ext:'xlsx xls csv msg eml',msgWhole:true},
    spareparts:{zh:'🔧 機修零件',en:'🔧 Spare parts',page:'vrt_spare_parts_v2.html',ext:'xlsx xls csv jpg jpeg png heic heif webp pdf'},
    ie:{zh:'📐 IE／SMV 週報',en:'📐 IE / SMV weekly',page:'ie_smv_report_v2_1.html',ext:'xlsx xls csv json'},
    smv:{zh:'⏱ SMV 管理（新款估算）',en:'⏱ SMV manager (new styles)',page:'smv_manager_v5_final.html',ext:'msg eml xlsx xls csv',msgWhole:true},
    fabricstock:{zh:'🧶 布料庫存',en:'🧶 Fabric stock',page:'vrt_fabric_stock_control_v1.html',ext:'xlsx xls csv'},
    fabricdelivery:{zh:'🧶 胚布中心',en:'🧶 Greige / fabric delivery',page:'vrt_fabric_delivery_greige_center_v1.html',ext:'pdf xlsx xls csv txt'},
    fg:{zh:'📦 FG 成品',en:'📦 FG stock',page:'VRT_FG_Inventory_Management_v1.html',ext:'xlsx xls csv eml msg',msgWhole:true},
    podelivery:{zh:'🚚 採購單交期',en:'🚚 PO delivery',page:'VRT_PO_Delivery_Control_Center.html',ext:'xlsx xls csv'},
    bom:{zh:'🧵 BOM',en:'🧵 BOM',page:'VRT_BOM_Management_v2_AI.html',ext:'pdf xlsx xls csv'},
    erplink:{zh:'🔗 ERP 對照（手動 ERP 檔）',en:'🔗 ERP link (manual ERP file)',page:'vrt_erp_link_v1.html',ext:'csv txt tsv xlsx xls json'},
  };
  /* ── file-name routes (same order and patterns as the GAS inbox INBOX_ROUTES, v4.9; cutting is checked BEFORE the generic 'daily output') ── */
  const ROUTES=[
    {re:/daily\s*needles?|needles?\s*change|換針/i,module:'spareparts'},
    {re:/spare\s*parts?|part\s*change|換件|machine\s*parts?\s*stock/i,module:'spareparts'},
    {re:/final\s*qc|end-?line|top\s*\d?\s*defect|qc\s*inspection/i,module:'qc'},
    {re:/weekly\s*open\s*order/i,module:'orders'},
    {re:/monthly\s*shipping\s*schedule/i,module:'monthship'},
    {re:/all\s*customer\s*statistics/i,module:'custstats'},
    {re:/shipping\s*schedule/i,module:'shipping'},
    {re:/fabric\s*stock|stock\s*accessor|fabric\s*warehouse/i,module:'fabricstock'},
    {re:/greige/i,module:'fabricdelivery'},
    {re:/cutting\s*plan/i,module:'cuttingplan'},
    {re:/production\s*plan/i,module:'prodplan'},
    {re:/month(?:l)?y?\s*fg\s*stock|fg\s*stock|fg\s*inventory/i,module:'fg'},
    {re:/cutting\s*(?:output|report|daily|eff)|daily\s*cutting/i,module:'cutting'},
    {re:/daily\s*(?:production\s*)?(?:sewing\s*)?output|garment|apron|sewing\s*output/i,module:'sewing'},
    {re:/obd|smv\s*update|approved|time\s*study|line\s*balanc/i,module:'ie'},
    {re:/\bsmv\b|\bsam\b|工時/i,module:'smv'},
    {re:/\bbom\b|bill\s*of\s*materials?|用料/i,module:'bom'},
    {re:/\bpo\s*#?\s*\d{5,}|purchase\s*orders?/i,module:'podelivery',ext:{pdf:'orders',msg:'orders',eml:'orders'}},
    {re:/statement|invoice|對帳|receipt|收據/i,module:'spareparts'},
  ];
  const extOf=n=>{const m=String(n||'').toLowerCase().match(/\.([a-z0-9]{1,5})$/);return m?m[1]:''};
  const normName=n=>String(n||'').replace(/\.[a-z0-9]{1,5}$/i,'').replace(/[_\-]+/g,' ').replace(/%20/g,' ');
  function routeName(name,extra){const n=normName(name),e=extOf(name);for(const r of (extra||[]).concat(ROUTES)){if(r.re.test(n)){const m=r.ext&&r.ext[e]||r.module;return m}}return ''}
  /* a remembered choice: the file name without dates / numbers / copies, e.g. 'vrt daily needles # oct# revised' */
  const MONTHS='january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
  function learnKey(name){return normName(name).toLowerCase().replace(/\(\d+\)/g,' ').replace(new RegExp('\\b('+MONTHS+')\\b','g'),' ').replace(/\d+/g,'#').replace(/[^a-z\u0080-￿#]+/g,' ').replace(/(#\s*)+/g,'# ').replace(/\s+/g,' ').trim()+'.'+extOf(name)}
  /* ── header sniffing for spreadsheets whose names say nothing ── */
  const SNIFF={
    spareparts:[['NEEDLE',2],['SPARE PART',3],['PART NO',2],['MACHINE NO',2],['CHANGE REASON',3],['BROKEN',1]],
    qc:[['FINAL QC',4],['INSPECTED',2],['DEFECT',2],['REJECT',1],['AQL',2]],
    orders:[['OPEN ORDER',4],['CANCEL DATE',3],['ORDER QTY',1],['PO#',1]],
    monthship:[['MONTHLY SHIPPING',5]],
    shipping:[['SHIPPING SCHEDULE',4],['ETD',2],['VESSEL',2],['CONTAINER',1]],
    custstats:[['CUSTOMER STATISTICS',5],['COMPLETION',2],['CHAPTER',1]],
    fabricstock:[['FABRIC DETAILS',4],['ITEM CODE',2],['WAREHOUSE',2],['ROLL',1]],
    fabricdelivery:[['GREIGE',5]],
    cuttingplan:[['CUTTING PLAN',5],['MARKER',1]],
    prodplan:[['PRODUCTION PLAN',5],['SEWING QTY',2],['DAILY OUTPUT',1]],
    fg:[['FINISHED GOOD',4],['FG STOCK',4],['CARTON',1],['CTN',1]],
    cutting:[['CUTTING',3],['CUT QTY',2],['YDS',1],['LAY',1]],
    sewing:[['SEWING',3],['DAILY PRODUCTION OUTPUT',4],['OPERATOR',1],['SEWER',2],['OUTPUT',1]],
    ie:[['SMV',3],['OBD',3],['OPERATION',1],['SAM',1]],
    podelivery:[['PURCHASE ORDER',3],['SUPPLIER',2],['DELIVERY DATE',1]],
    bom:[['BILL OF MATERIAL',5],['CONSUMPTION',2],['TRIM',1]],
  };
  function sniffText(text){const T=String(text||'').toUpperCase();const sc={};Object.keys(SNIFF).forEach(m=>{let s=0;SNIFF[m].forEach(([k,w])=>{if(T.indexOf(k)>=0)s+=w});if(s)sc[m]=s});
    const best=Object.entries(sc).sort((a,b)=>b[1]-a[1]);if(!best.length||best[0][1]<3)return {module:'',scores:sc};if(best[1]&&best[1][1]*1.5>best[0][1])return {module:'',scores:sc,close:[best[0][0],best[1][0]]};return {module:best[0][0],scores:sc}}
  function sniffWorkbook(XLSX,u8){try{const wb=XLSX.read(u8,{type:'array',sheetRows:40,cellDates:false,raw:true,bookVBA:false});let t=wb.SheetNames.join(' | ')+'\n';wb.SheetNames.slice(0,6).forEach(sn=>{const a=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true});t+=a.slice(0,40).map(r=>r.join(' ')).join('\n')+'\n'});return sniffText(t)}catch(e){return {module:'',error:String(e.message||e)}}}
  /* ── Outlook .msg (a CFB container; SheetJS reads it) → subject, sender, date, attachments (inline signature images left out) ── */
  const u16=b=>{if(!b||!b.length)return '';let s='';for(let i=0;i+1<b.length;i+=2)s+=String.fromCharCode(b[i]|(b[i+1]<<8));return s.replace(/\0+$/,'')};
  const rd32=(b,o)=>(b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0;
  function parseMsg(XLSX,u8){const c=XLSX.CFB.read(u8,{type:'array'});const get=p=>{const e=XLSX.CFB.find(c,p);return e&&e.content&&e.content.length?new Uint8Array(e.content):null};
    const out={subject:u16(get('/__substg1.0_0037001F')),from:u16(get('/__substg1.0_0C1A001F'))||u16(get('/__substg1.0_0042001F')),date:'',attachments:[]};
    const props=get('/__properties_version1.0');if(props)for(let o=32;o+16<=props.length;o+=16){const tag=rd32(props,o);if(tag===0x00390040||tag===0x0E060040){const ft=rd32(props,o+12)*4294967296+rd32(props,o+8);const d=new Date(ft/1e4-11644473600000);if(!isNaN(d)&&(!out.date||tag===0x00390040))out.date=d.toISOString()}}
    const dirs=[...new Set(c.FullPaths.map(p=>{const m=p.match(/^(?:Root Entry\/)?(__attach_version1\.0_#[0-9A-Fa-f]{8})\//);return m?m[1]:''}).filter(Boolean))].sort();
    dirs.forEach(dn=>{const r='/'+dn+'/';const name=u16(get(r+'__substg1.0_3707001F'))||u16(get(r+'__substg1.0_3704001F'))||u16(get(r+'__substg1.0_3001001F'));const data=get(r+'__substg1.0_37010102');
      const mime=u16(get(r+'__substg1.0_370E001F')),cid=u16(get(r+'__substg1.0_3712001F'));if(!data||!name)return;   // embedded messages (method 5) carry no 37010102 → not offered
      const inline=!!cid&&/^image\//i.test(mime||'')&&/^image\d{3}\./i.test(name);out.attachments.push({name,data,mime,inline})});
    return out}
  /* ── .eml (MIME) → subject, from, date, attachments ── */
  const latin1=u8=>{let s='';for(let i=0;i<u8.length;i+=8192)s+=String.fromCharCode.apply(null,u8.subarray(i,i+8192));return s};
  const utf8=u8=>{try{return new TextDecoder('utf-8').decode(u8)}catch(_){return latin1(u8)}};
  const b64bytes=s=>{const bin=(typeof atob==='function'?atob:(x=>Buffer.from(x,'base64').toString('latin1')))(String(s).replace(/[^A-Za-z0-9+/=]/g,''));const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u};
  const qpbytes=s=>{s=String(s).replace(/=\r?\n/g,'');const out=[];for(let i=0;i<s.length;i++){if(s[i]==='='&&/^[0-9A-F]{2}$/i.test(s.substr(i+1,2))){out.push(parseInt(s.substr(i+1,2),16));i+=2}else out.push(s.charCodeAt(i)&255)}return new Uint8Array(out)};
  function decodeWords(v){return String(v||'').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=\s*/g,(m,cs,enc,txt)=>{const by=/b/i.test(enc)?b64bytes(txt):qpbytes(txt.replace(/_/g,' '));try{return new TextDecoder(cs).decode(by)}catch(_){return latin1(by)}})}
  function headers(block){const H={};String(block).replace(/\r?\n[ \t]+/g,' ').split(/\r?\n/).forEach(l=>{const i=l.indexOf(':');if(i>0){const k=l.slice(0,i).trim().toLowerCase();if(!(k in H))H[k]=l.slice(i+1).trim()}});return H}
  const param=(h,p)=>{const m=String(h||'').match(new RegExp(p+'\\*=([^;]+)','i'));if(m){const v=m[1].trim().replace(/^"|"$/g,'');const mm=v.match(/^([^']*)'[^']*'(.*)$/);if(mm){try{return decodeURIComponent(mm[2])}catch(_){return mm[2]}}return v}
    const m2=String(h||'').match(new RegExp(p+'="([^"]*)"','i'))||String(h||'').match(new RegExp(p+'=([^;\\s]+)','i'));return m2?decodeWords(m2[1]):''};
  function parseEml(u8){const raw=latin1(u8);const out={subject:'',from:'',date:'',attachments:[]};
    const walk=(part,depth)=>{const i=part.search(/\r?\n\r?\n/);const H=headers(i<0?part:part.slice(0,i));const body=i<0?'':part.slice(i).replace(/^\r?\n\r?\n/,'');if(depth===0){out.subject=decodeWords(H.subject||'');out.from=decodeWords(H.from||'');const d=Date.parse(H.date||'');if(!isNaN(d))out.date=new Date(d).toISOString()}
      const ct=H['content-type']||'text/plain';const bd=param(ct,'boundary');
      if(/^multipart\//i.test(ct)&&bd&&depth<6){body.split('--'+bd).slice(1).forEach(p=>{if(/^--/.test(p))return;walk(p.replace(/^\r?\n/,'').replace(/\r?\n$/,''),depth+1)});return}
      const cd=H['content-disposition']||'';const name=param(cd,'filename')||param(ct,'name');if(!name)return;
      const enc=(H['content-transfer-encoding']||'').toLowerCase();const data=enc==='base64'?b64bytes(body):enc==='quoted-printable'?qpbytes(body):Uint8Array.from(body,c=>c.charCodeAt(0)&255);
      const inline=/^inline/i.test(cd)&&!!H['content-id']&&/^image\//i.test(ct);out.attachments.push({name,data,mime:ct.split(';')[0].trim(),inline})};
    walk(raw,0);return out}
  /* ── zip → entries (folders, __MACOSX, desktop junk dropped) ── */
  /* zip names arrive as the raw bytes; UTF-8 names (Windows / macOS zips with Chinese or Khmer names) are decoded, others kept as they are */
  const zipName=s=>{if(!/[\u0080-\u00ff]/.test(s)||/[^\u0000-\u00ff]/.test(s))return s;try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(s,ch=>ch.charCodeAt(0)))}catch(_){return s}};
  function parseZip(XLSX,u8){const c=XLSX.CFB.read(u8,{type:'array'});const out=[];c.FileIndex.forEach((f,i)=>{const p=zipName(String(c.FullPaths[i]||'').replace(/^Root Entry\//,''));if(f.type!==2||!f.content||!f.content.length)return;if(/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)|\u0001Sh33tJ5/i.test(p))return;out.push({name:p.split('/').pop(),path:p,data:new Uint8Array(f.content)})});return out}
  async function sha256(u8){const s=g.crypto&&g.crypto.subtle;if(!s)throw new Error('no WebCrypto');const h=await s.digest('SHA-256',u8);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')}
  const pure={MODULES,ROUTES,routeName,learnKey,sniffText,sniffWorkbook,parseMsg,parseEml,parseZip,sha256,extOf,normName};
  if(typeof document==='undefined'){g.VRTSmartImport=Object.assign({version:VERSION},pure);if(typeof module!=='undefined')module.exports=g.VRTSmartImport;return}

  /* ═════════════════════════════════════════ browser part ═════════════════════════════════════════ */
  const L=(zh,en)=>{const I=g.VRTI18n,l=I&&I.lang;if(!l||l==='zh')return zh;if(l==='en')return en;const k=I.translate?I.translate(zh):'';return k?String(k).trim():en};
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const kb=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B';
  const ls=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(_){return null}};
  const mz=m=>{const x=MODULES[m];return x?L(x.zh,x.en):m||'—'};
  const VQ=(()=>{const s=document.querySelector('script[src*="vrt-smart-import-v1.js"]');const m=s&&s.src.match(/[?&]v=([\w.]+)/);return m?'?v='+m[1]:''})();
  const gasUrl=()=>{try{return (g.VRTPlatform&&g.VRTPlatform.getGasUrl&&g.VRTPlatform.getGasUrl())||ls('vrt_portal_gas_url')||''}catch(_){return ''}};
  const who=()=>ls('vrt_user_name')||ls('vrt_operator')||'web';
  async function gas(body){const url=gasUrl();if(!url)throw new Error(L('尚未設定 GAS 網址','GAS URL not set'));const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow'});let d=null;try{d=await r.json()}catch(_){}if(!d)throw new Error('GAS no JSON');if(d.ok===false)throw new Error(d.error||'GAS error');const x=d.data||{};if(x.ok===false)throw new Error(x.error||'error');return x}
  /* ── IndexedDB VRT_SmartImport: handoff (files waiting for their page) + ledger (sha256 → imported where / when) ── */
  const DBN='VRT_SmartImport';let dbp=null;
  function db(){if(dbp)return dbp;dbp=new Promise((res,rej)=>{const q=indexedDB.open(DBN,1);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains('handoff'))d.createObjectStore('handoff',{keyPath:'id'});if(!d.objectStoreNames.contains('ledger'))d.createObjectStore('ledger',{keyPath:'hash'})};q.onsuccess=()=>{q.result.onversionchange=()=>{try{q.result.close()}catch(_){}dbp=null};res(q.result)};q.onerror=()=>{dbp=null;rej(q.error)}});return dbp}
  /* an IDBRequest from this or another realm (test shims) → its result */
  const isReq=o=>!!o&&typeof o==='object'&&((typeof IDBRequest!=='undefined'&&o instanceof IDBRequest)||('readyState' in o&&'result' in o&&'onsuccess' in o));
  async function tx(store,mode,fn){const d=await db();return new Promise((res,rej)=>{const t=d.transaction(store,mode),s=t.objectStore(store);let out;try{out=fn(s)}catch(e){rej(e);return}t.oncomplete=()=>res(isReq(out)?out.result:out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}
  const idb={all:store=>tx(store,'readonly',s=>s.getAll()),get:(store,k)=>tx(store,'readonly',s=>s.get(k)),put:(store,v)=>tx(store,'readwrite',s=>s.put(v)),del:(store,k)=>tx(store,'readwrite',s=>s.delete(k))};
  /* ── this page: VRTSmartImport.init({module, feed, input, inputs, commit}) or the page's VRTInbox config ── */
  let REG=null;const HOOKS={};
  function reg(){if(REG)return REG;const I=g.VRTInbox&&g.VRTInbox.cfg;return I&&I.module?{module:I.module,feed:I.feed,feedAll:I.feedAll,input:I.input,commit:I.commit,next:I.next,multi:I.multi||I.autoDone}:null}
  const pageFile=()=>decodeURIComponent((location.pathname.split('/').pop()||'').toLowerCase());
  function pageModule(){const r=reg();if(r)return r.module;const f=pageFile();const k=Object.keys(MODULES).find(m=>MODULES[m].page.toLowerCase()===f);return k||''}
  const isPortal=()=>/portal_v2\.html$/i.test(location.pathname)||/\/$/.test(location.pathname);
  /* ── XLSX on demand (portal / overview pages do not load it) ── */
  let xp=null;function needX(){if(g.XLSX&&g.XLSX.CFB)return Promise.resolve(g.XLSX);if(xp)return xp;xp=new Promise((res,rej)=>{const s=document.createElement('script');s.src='vendor/xlsx.full.min.js';s.onload=()=>g.XLSX?res(g.XLSX):rej(new Error('XLSX'));s.onerror=()=>{xp=null;rej(new Error(L('Excel 元件載入失敗','Excel reader failed to load')))};document.head.appendChild(s)});return xp}
  /* ── state ── */
  let rows=[],seq=0,els={},busy=false,inboxRows=[],inboxLoaded=false,lastResult=null;
  const learned=()=>{try{return JSON.parse(ls('vrt_si_learned')||'{}')}catch(_){return {}}};
  function learn(name,module){const k=learnKey(name);const o=learned();if(module)o[k]=module;else delete o[k];ls('vrt_si_learned',JSON.stringify(o))}
  const uploadOn=()=>ls('vrt_si_upload')!=='0';
  function accepts(m,name){const x=MODULES[m];return !!x&&(' '+x.ext+' ').indexOf(' '+extOf(name)+' ')>=0}
  async function classify(name,u8,ctx){ctx=ctx||{};const e=extOf(name);const lk=learned()[learnKey(name)];if(lk&&MODULES[lk])return {module:lk,reason:L('記住的選擇','remembered')};
    let m=routeName(name);if(m)return {module:m,reason:L('檔名','file name')};
    if(ctx.subject){m=routeName(ctx.subject+'.'+e);if(m)return {module:m,reason:L('信件主旨','mail subject')}}
    if(/^(xlsx|xlsm|xls|xlsb|csv)$/.test(e)&&u8){try{const X=await needX();const s=sniffWorkbook(X,u8);if(s.module)return {module:s.module,reason:L('表頭','sheet headers')};if(s.close)return {module:'',reason:L('表頭像 ','headers look like ')+s.close.map(mz).join(' / '),guess:s.close}}catch(_){}}
    if(ctx.module)return {module:ctx.module,reason:L('群組收件分類','inbox route')};
    return {module:'',reason:/^(jpe?g|png|heic|heif|webp)$/.test(e)?L('照片：請選模組','photo: pick the module'):L('判斷不出來：請選模組','not recognised: pick the module')}}
  function addRow(r){r.id='r'+(++seq);r.include=r.include!==false;rows.push(r);return r}
  /* expand one dropped file into rows (mails and zips opened) */
  async function ingest(file,from){const name=file.name||'file';const e=extOf(name);const u8=new Uint8Array(await file.arrayBuffer());const hash=await sha256(u8);
    const base={name,size:u8.length,u8,hash,type:file.type||'',lastModified:file.lastModified||Date.now(),from:from||null};
    if(e==='zip'){let ents=[];try{ents=parseZip(await needX(),u8)}catch(err){addRow(Object.assign(base,{module:'',reason:L('zip 打不開：','zip not readable: ')+err.message,status:'bad',include:false}));return}
      for(const z of ents){const f=new File([z.data],z.name,{lastModified:base.lastModified});await ingest(f,Object.assign({},from||{},{parent:name,parentKind:'zip'}))}if(!ents.length)addRow(Object.assign(base,{module:'',reason:L('zip 是空的','empty zip'),status:'bad',include:false}));return}
    if(e==='msg'||e==='eml'){let M=null;try{M=e==='msg'?parseMsg(await needX(),u8):parseEml(u8)}catch(err){M=null}
      if(M){const atts=M.attachments.filter(a=>!a.inline);const subj=M.subject||'';const kids=[];
        for(const a of atts){const h=await sha256(a.data);const c=await classify(a.name,a.data,{subject:subj});kids.push({name:a.name,size:a.data.length,u8:a.data,hash:h,module:c.module,reason:c.reason,guess:c.guess,type:a.mime||''})}
        const mods=[...new Set(kids.map(k=>k.module))];const subjM=routeName(subj+'.'+e);const whole=kids.length&&mods.length===1&&mods[0]&&MODULES[mods[0]].msgWhole&&accepts(mods[0],name);
        if(whole||(!kids.length&&subjM&&MODULES[subjM].msgWhole)){const m=whole?mods[0]:subjM;addRow(Object.assign(base,{module:m,reason:L('整封信（','whole mail (')+kids.length+L(' 個附件）',' attachments)'),subject:subj,mailDate:M.date,mailFrom:M.from,kids:kids.map(k=>({name:k.name,hash:k.hash,size:k.size}))}));return}
        if(!kids.length){addRow(Object.assign(base,{module:subjM||'',reason:L('信裡沒有附件','no attachments in this mail'),subject:subj,status:subjM?'':'bad',include:!!subjM}));return}
        kids.forEach(k=>addRow(Object.assign({},k,{lastModified:base.lastModified,from:{parent:name,parentKind:e,subject:subj,date:M.date}})));return}
    }
    const c=await classify(name,u8,from||{});addRow(Object.assign(base,{module:c.module,reason:c.reason,guess:c.guess}))}
  /* ledger: local first, then the GAS inbox ledger (files the bots collected count too) */
  async function check(){const hs=[...new Set(rows.flatMap(r=>[r.hash].concat((r.kids||[]).map(k=>k.hash))))];const loc={};for(const h of hs){try{const x=await idb.get('ledger',h);if(x)loc[h]=x}catch(_){}}
    let remote={};if(gasUrl()&&hs.length){try{const d=await gas({action:'inboxLedger',hashes:hs});remote=d.found||{}}catch(_){remote={}}}
    const seenH={};rows.forEach(r=>{if(r.status==='bad')return;const own=[r.hash].concat((r.kids||[]).map(k=>k.hash));
      if(seenH[r.hash]){r.status='dup';r.include=false;r.note=L('同一個檔這次已經有了','same file already in this drop');return}seenH[r.hash]=1;
      const l=own.map(h=>loc[h]).find(Boolean),x=own.map(h=>remote[h]).find(Boolean);
      if(l&&l.status==='queued'){r.status='queued';r.include=false;r.note=L('已交給 ','already handed to ')+mz(l.module)+L('，等著匯入（上面「前往匯入」）',', waiting (Go and import above)');return}
      if(l&&l.status!=='dropped'){r.status='seen';r.include=false;r.note=L('已匯入過','imported before')+' · '+String(l.at||'').slice(0,16).replace('T',' ')+' · '+mz(l.module);return}
      if(x&&x.status==='done'){r.status='seen';r.include=false;r.note=L('已匯入過（雲端紀錄）','imported before (cloud record)')+' · '+String(x.doneAt||x.receivedAt||'').slice(0,16).replace('T',' ')+' · '+mz(x.module)+(x.source?' · '+x.source:'');return}
      if(x&&x.status==='pending'){r.status='inbox';r.inboxId=r.inboxId||x.id;r.note=L('群組／Email 已收到、還沒匯入','collected by the bot, not imported yet');if(!r.module&&x.module&&MODULES[x.module])r.module=x.module}
      if(!r.module){r.include=false;r.status=r.status||'ask'}else if(!accepts(r.module,r.name)){r.status='type';r.include=false;r.note=mz(r.module)+L(' 不收這種檔',' does not take this file type')}else if(!r.status)r.status='new'});}
  /* ── UI ── */
  const css=`#vrtSiBtn{position:fixed;right:178px;top:2px;z-index:9991;border:0;border-radius:4px;background:#ea580c;color:#fff;font:700 11.5px/1 system-ui,-apple-system,"Segoe UI","Noto Sans TC",sans-serif;padding:4px 9px;cursor:pointer;box-shadow:0 2px 8px rgba(234,88,12,.35);display:flex;gap:5px;align-items:center}
  #vrtSiBtn:hover{background:#c2410c}#vrtSiBtn .n{background:#fff;color:#c2410c;border-radius:999px;padding:1px 6px;font-size:10px;display:none}#vrtSiBtn .n.on{display:inline}
  #vrtSiMask{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99990;display:none;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto}#vrtSiMask.open{display:flex}
  #vrtSiBox{width:min(980px,100%);background:#fff;color:#0f172a;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.35);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans TC","Noto Sans Khmer",sans-serif;overflow:hidden}
  #vrtSiBox .hd{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#fff7ed;border-bottom:1px solid #fed7aa}#vrtSiBox .hd b{font-size:16px}#vrtSiBox .hd small{display:block;color:#9a3412;font-size:11px}#vrtSiBox .hd .x{margin-left:auto;border:0;background:none;font-size:24px;color:#94a3b8;cursor:pointer}
  #vrtSiBox .bd{padding:12px 16px}#vrtSiDrop{border:2px dashed #fdba74;border-radius:12px;background:#fffbf5;padding:22px 14px;text-align:center;cursor:pointer}#vrtSiDrop.drag{background:#ffedd5;border-color:#ea580c}#vrtSiDrop .big{font-size:15px;font-weight:700;color:#9a3412}#vrtSiDrop .sm{font-size:11.5px;color:#7c2d12;margin-top:4px}
  #vrtSiBox .bt{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:10px}#vrtSiBox button.b{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:9px;padding:8px 13px;font-weight:700;font-size:12.5px;cursor:pointer}#vrtSiBox button.p{background:#ea580c;border-color:#ea580c;color:#fff}#vrtSiBox button.g{background:#0e7490;border-color:#0e7490;color:#fff}#vrtSiBox button:disabled{opacity:.45;cursor:not-allowed}
  #vrtSiBox table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}#vrtSiBox th{background:#f8fafc;color:#64748b;font-size:10.5px;text-align:left;padding:6px 7px;border-bottom:2px solid #e2e8f0}#vrtSiBox td{padding:6px 7px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  #vrtSiBox .nm{font-weight:600;word-break:break-all}#vrtSiBox .sub{font-size:10.5px;color:#64748b}#vrtSiBox select{border:1px solid #cbd5e1;border-radius:6px;padding:4px 6px;font-size:12px;max-width:190px}
  #vrtSiBox .tag{display:inline-block;border-radius:999px;padding:1px 8px;font-size:10.5px;font-weight:700;white-space:nowrap}.si-new{background:#dcfce7;color:#166534}.si-seen{background:#e5e7eb;color:#374151}.si-inbox{background:#cffafe;color:#155e75}.si-ask{background:#fef3c7;color:#92400e}.si-bad,.si-type{background:#fee2e2;color:#991b1b}.si-dup{background:#f1f5f9;color:#64748b}
  #vrtSiBox .ft{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 16px;border-top:1px solid #e2e8f0;background:#f8fafc}#vrtSiBox .ft .msg{flex:1;min-width:200px;font-size:12px;color:#334155}
  #vrtSiBox .sec{margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px}#vrtSiBox .sec h4{margin:0 0 6px;font-size:12.5px;color:#155e75;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  #vrtSiBox .res{margin-top:10px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:10px;padding:10px 12px}#vrtSiBox .res .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:4px 0}
  #vrtSiChip{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99980;display:none;align-items:center;gap:8px;flex-wrap:wrap;max-width:calc(100vw - 24px);background:#1f2937;color:#fff;border-radius:12px;padding:8px 10px 8px 14px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:600 12.5px/1.4 system-ui,-apple-system,"Segoe UI","Noto Sans TC","Noto Sans Khmer",sans-serif}
  #vrtSiChip.on{display:flex}#vrtSiChip button,#vrtSiBox button,#vrtSiBox select,#vrtSiBox input{font-family:inherit;letter-spacing:normal;text-transform:none}#vrtSiChip .t{flex:1;min-width:180px}#vrtSiChip button.b{border:1px solid #475569;background:#334155;color:#fff;border-radius:8px;padding:6px 10px;font-weight:700;font-size:12px;cursor:pointer}#vrtSiChip button.p{background:#ea580c;border-color:#ea580c}#vrtSiChip button.g{background:#0e7490;border-color:#0e7490}#vrtSiChip .x{border:0;background:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:0 4px}
  @media(max-width:700px){#vrtSiBtn{right:auto;left:6px;top:2px}#vrtSiMask{padding:0}#vrtSiBox{border-radius:0;min-height:100vh}#vrtSiBox table thead{display:none}#vrtSiBox table tr{display:block;border-bottom:1px solid #e2e8f0;padding:6px 0}#vrtSiBox table td{display:block;border:0;padding:2px 4px}#vrtSiBox select{max-width:100%;width:100%}}`;
  function ui(){if(els.box)return;if(!document.getElementById('vrtSiCss')){const st=document.createElement('style');st.id='vrtSiCss';st.textContent=css;document.head.appendChild(st)}
    const b=document.createElement('button');b.id='vrtSiBtn';b.type='button';b.setAttribute('data-no-i18n','');b.title=L('智慧匯入：Excel／msg／PDF／照片／zip 丟進來，自動判斷模組','Smart import: drop Excel / msg / PDF / photo / zip, the module is detected');b.innerHTML='⇧ '+esc(L('智慧匯入','Smart import'))+' <span class="n" id="vrtSiN">0</span>';b.onclick=()=>open();document.body.appendChild(b);els.btn=b;
    const m=document.createElement('div');m.id='vrtSiMask';m.setAttribute('data-no-i18n','');m.innerHTML='<div id="vrtSiBox" role="dialog" aria-modal="true"><div class="hd"><span style="font-size:22px">⇧</span><div><b>'+esc(L('智慧匯入','Smart import'))+'</b><small>'+esc(L('Excel／CSV、Outlook 信（.msg／.eml）、PDF、照片、zip 都丟這裡 · 自動判斷模組 · 已匯入過的自動略過','Excel / CSV, Outlook mail (.msg / .eml), PDF, photos, zip · module detected · already imported = skipped'))+'</small></div><button class="x" type="button" data-act="close">&times;</button></div>'+
      '<div class="bd"><div id="vrtSiDrop"><div class="big">📂 '+esc(L('把檔案拖到這裡，或點這裡選檔','Drop files here, or tap to choose'))+'</div><div class="sm">'+esc(L('可以一次很多檔；信件與 zip 會自動打開取附件','many files at once; mails and zips are opened for their attachments'))+'</div></div>'+
      '<div class="bt"><button class="b" type="button" data-act="pick">📂 '+esc(L('選檔案','Choose files'))+'</button><button class="b" type="button" data-act="cam">📷 '+esc(L('拍照','Take photo'))+'</button><button class="b" type="button" data-act="inbox">☁ '+esc(L('群組／Email 已收到的','Collected by the bots'))+' <span id="vrtSiInN"></span></button></div>'+
      '<input type="file" id="vrtSiFile" multiple hidden><input type="file" id="vrtSiCam" accept="image/*" capture="environment" hidden>'+
      '<div id="vrtSiPend"></div><div id="vrtSiList"></div><div id="vrtSiInbox"></div><div id="vrtSiRes"></div></div>'+
      '<div class="ft"><label style="font-size:11.5px;color:#475569;display:flex;gap:5px;align-items:center"><input type="checkbox" id="vrtSiUp"> '+esc(L('同時存一份到雲端收件匣（備份、換電腦也知道已匯入）','also keep a copy in the cloud inbox (backup; other devices know it was imported)'))+'</label><span class="msg" id="vrtSiMsg"></span><button class="b" type="button" data-act="clear">'+esc(L('清空','Clear'))+'</button><button class="b p" type="button" data-act="go" id="vrtSiGo" disabled>⇧ '+esc(L('開始匯入','Import'))+'</button></div></div>';
    document.body.appendChild(m);els.mask=m;els.box=m.querySelector('#vrtSiBox');const $=id=>m.querySelector('#'+id);Object.assign(els,{drop:$('vrtSiDrop'),file:$('vrtSiFile'),cam:$('vrtSiCam'),list:$('vrtSiList'),inbox:$('vrtSiInbox'),res:$('vrtSiRes'),pend:$('vrtSiPend'),msg:$('vrtSiMsg'),go:$('vrtSiGo'),up:$('vrtSiUp'),inN:$('vrtSiInN'),n:document.getElementById('vrtSiN')});
    els.up.checked=uploadOn();els.up.onchange=()=>ls('vrt_si_upload',els.up.checked?'1':'0');
    m.addEventListener('click',e=>{if(e.target===m){close();return}const t=e.target.closest('[data-act]');if(!t)return;const a=t.dataset.act;
      if(a==='close')close();else if(a==='pick')els.file.click();else if(a==='cam')els.cam.click();else if(a==='go')go();else if(a==='clear'){rows=[];lastResult=null;paint()}else if(a==='inbox')loadInbox(true);
      else if(a==='inadd')addInbox(t.dataset.id);else if(a==='inall')addInbox('*');else if(a==='nav')location.href=t.dataset.href;else if(a==='tg')summary();else if(a==='ap')approve(t.dataset.m);else if(a==='recv')receive(true);else if(a==='drophand')dropHandoff(t.dataset.m);else if(a==='rm'){rows=rows.filter(r=>r.id!==t.dataset.id);paint()}});
    m.addEventListener('change',e=>{const t=e.target;if(t.dataset&&t.dataset.act==='mod'){const r=rows.find(x=>x.id===t.dataset.id);if(r){r.module=t.value;r.reason=L('手動','chosen');learn(r.name,t.value);r.status=r.status==='seen'?'seen':(t.value?(accepts(t.value,r.name)?(r.status==='inbox'?'inbox':'new'):'type'):'ask');r.include=r.status==='new'||r.status==='inbox';r.note=r.status==='type'?mz(r.module)+L(' 不收這種檔',' does not take this file type'):r.note;paint()}}
      else if(t.dataset&&t.dataset.act==='inc'){const r=rows.find(x=>x.id===t.dataset.id);if(r){r.include=t.checked;paint()}}});
    els.file.onchange=()=>{const f=[...els.file.files];els.file.value='';add(f)};els.cam.onchange=()=>{const f=[...els.cam.files];els.cam.value='';add(f)};
    els.drop.onclick=()=>els.file.click();['dragenter','dragover'].forEach(k=>els.drop.addEventListener(k,e=>{e.preventDefault();els.drop.classList.add('drag')}));['dragleave','drop'].forEach(k=>els.drop.addEventListener(k,e=>{e.preventDefault();els.drop.classList.remove('drag')}));els.drop.addEventListener('drop',e=>add([...(e.dataTransfer&&e.dataTransfer.files||[])]));
    if(!keyOn){keyOn=true;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&els.mask&&els.mask.classList.contains('open'))close()})}}
  /* the window is data-no-i18n (its text comes from L), so rebuild it once the Khmer dictionary has arrived or the language is switched */
  let keyOn=false;function relabel(){if(!els.box)return;const wasOpen=els.mask.classList.contains('open');const chipEl=els.chip;try{els.btn.remove();els.mask.remove()}catch(_){}for(const k of Object.keys(els))delete els[k];if(chipEl)els.chip=chipEl;ui();paintPending();if(wasOpen)open()}
  function open(){ui();els.mask.classList.add('open');paint();paintPending();if(!inboxLoaded)loadInbox(false)}
  function close(){if(els.mask)els.mask.classList.remove('open')}
  function msg(t){if(els.msg)els.msg.textContent=t||''}
  async function add(files){if(!files.length)return;if(busy)return;busy=true;lastResult=null;msg('⏳ '+L('讀取 ','reading ')+files.length+L(' 個檔…',' file(s)…'));
    try{for(const f of files){try{await ingest(f)}catch(err){addRow({name:f.name,size:f.size||0,hash:'x'+(++seq),module:'',status:'bad',include:false,reason:String(err.message||err)})}}await check()}finally{busy=false}paint();msg('')}
  function plan(){const sel=rows.filter(r=>r.include&&r.module&&r.status!=='seen'&&r.status!=='dup'&&r.status!=='bad'&&r.status!=='type');const by={};sel.forEach(r=>(by[r.module]=by[r.module]||[]).push(r));return {sel,by}}
  const STAT={queued:['si-ask','等著匯入','waiting'],new:['si-new','新檔','new'],seen:['si-seen','已匯入過','imported before'],inbox:['si-inbox','群組已收到','collected'],ask:['si-ask','請選模組','pick module'],bad:['si-bad','打不開','unreadable'],type:['si-type','模組不收','wrong type'],dup:['si-dup','重複','duplicate']};
  function paint(){ui();const opts=m=>'<option value="">— '+esc(L('選模組','module'))+' —</option>'+Object.keys(MODULES).map(k=>'<option value="'+k+'"'+(k===m?' selected':'')+'>'+esc(mz(k))+'</option>').join('');
    els.list.innerHTML=rows.length?'<table><thead><tr><th style="width:26px"></th><th>'+esc(L('檔案','File'))+'</th><th>'+esc(L('匯入到','Goes to'))+'</th><th style="min-width:96px">'+esc(L('判斷依據','Because'))+'</th><th style="min-width:110px">'+esc(L('狀態','Status'))+'</th><th></th></tr></thead><tbody>'+rows.map(r=>{const s=STAT[r.status]||STAT.new;
      return '<tr><td><input type="checkbox" data-act="inc" data-id="'+r.id+'"'+(r.include?' checked':'')+(r.status==='bad'||r.status==='dup'?' disabled':'')+'></td><td><div class="nm">'+esc(r.name)+'</div><div class="sub">'+kb(r.size||0)+(r.from&&r.from.parent?' · '+esc(L('來自 ','from '))+esc(r.from.parent):'')+(r.subject||r.from&&r.from.subject?' · 「'+esc((r.subject||r.from.subject).slice(0,70))+'」':'')+(r.kids&&r.kids.length?' · '+esc(r.kids.map(k=>k.name).join('、')):'')+'</div></td>'+
        '<td><select data-act="mod" data-id="'+r.id+'">'+opts(r.module)+'</select></td><td class="sub">'+esc(r.reason||'')+'</td><td><span class="tag '+s[0]+'">'+esc(L(s[1],s[2]))+'</span>'+(r.note?'<div class="sub">'+esc(r.note)+'</div>':'')+'</td><td><button class="b" type="button" data-act="rm" data-id="'+r.id+'" title="'+esc(L('移除','remove'))+'" style="padding:2px 8px">✕</button></td></tr>'}).join('')+'</tbody></table>':'';
    const P=plan();const skip=rows.length-P.sel.length;els.go.disabled=!P.sel.length||busy;
    if(rows.length)msg(P.sel.length?P.sel.length+L(' 檔要匯入 → ',' file(s) → ')+Object.keys(P.by).map(m=>mz(m)+' '+P.by[m].length).join('、')+(skip?' · '+L('略過 ','skipped ')+skip:''):L('沒有要匯入的檔（都已匯入過、重複或還沒選模組）','nothing to import (imported before, duplicates or no module chosen)'));
    if(lastResult)paintResult()}
  /* ── the bots' inbox (Telegram groups / e-mail), all modules ── */
  async function loadInbox(verbose){ui();if(!gasUrl()){els.inbox.innerHTML=verbose?'<div class="sec"><h4>☁ '+esc(L('群組／Email 已收到的','Collected by the bots'))+'</h4><div class="sub">'+esc(L('尚未設定 GAS 網址（入口頁設定）','GAS URL not set (portal settings)'))+'</div></div>':'';return}
    try{const d=await gas({action:'inboxList',status:'pending',limit:150});inboxRows=(d.rows||[]).filter(r=>r.driveId);inboxLoaded=true}catch(e){if(verbose)els.inbox.innerHTML='<div class="sec"><div class="sub">❌ '+esc(e.message)+'</div></div>';return}
    els.inN.textContent=inboxRows.length?'('+inboxRows.length+')':'';
    if(!verbose&&!inboxRows.length){els.inbox.innerHTML='';return}
    els.inbox.innerHTML='<div class="sec"><h4>☁ '+esc(L('群組／Email 已收到、還沒匯入','Collected by the bots, not imported yet'))+' · '+inboxRows.length+(inboxRows.length?' <button class="b g" type="button" data-act="inall">＋ '+esc(L('全部加入','Add all'))+'</button>':'')+'</h4>'+(inboxRows.length?'<table><tbody>'+inboxRows.map(r=>'<tr><td><div class="nm">'+esc(r.fileName)+'</div><div class="sub">'+esc(String(r.receivedAt||'').replace('T',' '))+' · '+esc(r.group||'')+(r.sender?' · '+esc(r.sender):'')+'</div></td><td class="sub">'+esc(mz(r.module))+'</td><td><button class="b" type="button" data-act="inadd" data-id="'+esc(r.id)+'">＋ '+esc(L('加入','Add'))+'</button></td></tr>').join('')+'</tbody></table>':'<div class="sub">'+esc(L('目前沒有','nothing pending'))+'</div>')+'</div>'}
  async function addInbox(id){const list=id==='*'?inboxRows.slice():inboxRows.filter(r=>r.id===id);if(!list.length||busy)return;busy=true;lastResult=null;
    try{for(const r of list){msg('⏳ '+L('下載 ','downloading ')+r.fileName);try{const d=await gas({action:'inboxFile',id:r.id});const u8=b64bytes(d.base64||'');const f=new File([u8],d.fileName||r.fileName,{type:d.mime||r.mime||''});const n0=rows.length;await ingest(f,{module:MODULES[r.module]?r.module:'',inboxId:r.id,group:r.group});rows.slice(n0).forEach(x=>{x.inboxId=r.id;if(!x.module&&MODULES[r.module]){x.module=r.module;x.reason=L('群組收件分類','inbox route')}});inboxRows=inboxRows.filter(x=>x.id!==r.id)}catch(e){msg('❌ '+r.fileName+'：'+e.message)}}
      await check();rows.forEach(x=>{if(x.inboxId&&x.status==='new')x.status='inbox'})}finally{busy=false}paint();loadInbox(true)}
  /* ── import: this page now, the others through the handoff store ── */
  async function go(){const P=plan();if(!P.sel.length||busy)return;busy=true;els.go.disabled=true;const here=pageModule();const batch='b'+Date.now().toString(36);const result={here:null,away:{},at:new Date().toISOString()};
    try{for(const m of Object.keys(P.by)){const list=P.by[m];
        if(m===here&&reg()){close();await feedHere(list.map(toFile));result.here={module:m,n:list.length};}
        else{for(const r of list)await idb.put('handoff',{id:batch+'_'+r.id,batch,module:m,name:r.name,type:r.type||'',lastModified:r.lastModified||Date.now(),data:r.u8,hash:r.hash,kids:(r.kids||[]).map(k=>k.hash),inboxId:r.inboxId||'',from:pageFile(),subject:r.subject||(r.from&&r.from.subject)||'',createdAt:new Date().toISOString()});result.away[m]=list.length}
        for(const r of list)await record(r,m,m===here?'handed':'queued')}
      rows=rows.filter(r=>!P.sel.includes(r));lastResult=result;await paintPending();paint();
      const aw=Object.keys(result.away);if(result.here)await chipDone(result.here.module,result.here.n);else if(aw.length===1){msg('→ '+mz(aw[0]));setTimeout(()=>{location.href=MODULES[aw[0]].page+VQ+'#smartimport'},700)}
    }catch(e){msg('❌ '+e.message)}finally{busy=false;paint()}
    upload(P.sel)}
  const toFile=r=>new File([r.u8||r.data],r.name,{type:r.type||'',lastModified:r.lastModified||Date.now()});
  async function record(r,m,status){const at=new Date().toISOString();const base={module:m,at,status,name:r.name,page:pageFile()};
    await idb.put('ledger',Object.assign({hash:r.hash},base));for(const k of (r.kids||[]))await idb.put('ledger',Object.assign({hash:k.hash||k},base,{name:k.name||r.name,parent:r.name}));
    if(r.inboxId&&gasUrl()){try{await gas({action:'inboxDone',id:r.inboxId,status:'done',by:who(),note:'智慧匯入 smart import → '+m})}catch(_){}}}
  async function upload(list){if(!uploadOn()||!gasUrl())return;for(const r of list){if(r.inboxId||!r.u8||r.u8.length>15*1048576)continue;try{await gas({action:'inboxUpload',fileName:r.name,mime:r.type||'',module:r.module,contentHash:r.hash,alsoHashes:(r.kids||[]).map(k=>k.hash),base64:b64(r.u8),status:'done',by:who(),note:'智慧匯入 smart import'+(r.from&&r.from.parent?' · '+r.from.parent:'')})}catch(_){}}}
  const b64=u8=>{let s='';for(let i=0;i<u8.length;i+=32768)s+=String.fromCharCode.apply(null,u8.subarray(i,i+32768));return btoa(s)};
  /* page's own importer. feedAll(files) when the page takes several at once; otherwise one file at a time — pages whose importer
     appends / saves (multi) get them back to back, pages with ONE preview at a time get the next file when the page says so (next())
     or when the user taps 「下一檔」 on the chip. commit() once at the end (sewing / cutting: the page's own parse + preview step). */
  async function feedOne(R,f){if(R.feed)return await R.feed(f);const sel=R.inputs?Object.keys(R.inputs).find(k=>k.split(/[\s,]+/).includes(extOf(f.name))):'';const inp=document.querySelector(sel?R.inputs[sel]:R.input);if(!inp)throw new Error(L('本頁找不到檔案欄位','file input not found'));const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;inp.dispatchEvent(new Event('change',{bubbles:true}))}
  async function feedHere(files){const R=reg();if(!R)throw new Error(L('本頁沒有匯入器','this page has no importer'));
    if(R.feedAll)await R.feedAll(files);
    else for(let i=0;i<files.length;i++){chip('⏳ '+mz(R.module)+' · '+(i+1)+'／'+files.length+'：'+esc(files[i].name));const res=await feedOne(R,files[i]);if(res===false)break;
      if(i<files.length-1&&!R.multi){if(R.next)await R.next();else await chipWait(i+1,files.length,files[i+1].name)}}
    if(R.commit){await new Promise(r=>setTimeout(r,150));await R.commit()}}
  /* wait until a page element is gone (the page's own preview closed) — used by page registrations */
  function waitGone(sel,maxMs){const t0=Date.now();return new Promise(res=>{const tick=()=>{const el=typeof sel==='function'?sel():document.querySelector(sel);if(!el||Date.now()-t0>(maxMs||45*60000))return res(true);setTimeout(tick,300)};setTimeout(tick,300)})}
  /* ── the chip: non-modal status bar while the page's own preview is on screen ── */
  function chip(html,buttons){ui();if(!els.chip){const c=document.createElement('div');c.id='vrtSiChip';c.setAttribute('data-no-i18n','');document.body.appendChild(c);els.chip=c;
      c.addEventListener('click',e=>{const t=e.target.closest('[data-act]');if(!t)return;const a=t.dataset.act;if(a==='x')chipHide();else if(a==='nav')location.href=t.dataset.href;else if(a==='tg'){chipHide();summary()}else if(a==='ap')approve(t.dataset.m);else if(a==='next'&&els.chipNext){const f=els.chipNext;els.chipNext=null;f()}else if(a==='stop'&&els.chipStop){const f=els.chipStop;els.chipStop=null;f()}})}
    els.chip.innerHTML='<span class="t">⇧ '+html+'</span>'+(buttons||'')+'<button type="button" class="x" data-act="x" title="'+esc(L('關閉','close'))+'">×</button>';els.chip.classList.add('on')}
  function chipHide(){if(els.chip)els.chip.classList.remove('on')}
  function chipWait(i,n,next){return new Promise(res=>{els.chipNext=()=>res(true);els.chipStop=()=>res(false);chip(esc(L('第 ','file '))+i+'／'+n+esc(L(' 檔已交給本頁 — 在頁面上確認後，按「下一檔」',' handed to the page — confirm on the page, then tap Next')),'<button type="button" class="b p" data-act="next">'+esc(L('下一檔 →','Next →'))+' '+esc(next.slice(0,40))+'</button>')})}
  async function chipDone(m,n){const all=await pending();const by={};all.forEach(h=>(by[h.module]=by[h.module]||[]).push(h));const H=HOOKS[m]||{};
    chip('✓ '+esc(mz(m))+' · '+n+esc(L(' 檔已交給本頁 — 請在頁面上確認匯入',' file(s) handed over — confirm on the page')),(g.VRTTelegram&&g.VRTTelegram.open?'<button type="button" class="b g" data-act="tg">✈️ '+esc(L('發摘要','Send summary'))+'</button>':'')+(H.approve?'<button type="button" class="b p" data-act="ap" data-m="'+m+'">✅ '+esc(H.approveLabel||L('核可','Approve'))+'</button>':'')+
      Object.keys(by).filter(k=>k!==m).map(k=>'<button type="button" class="b" data-act="nav" data-href="'+esc(MODULES[k].page+VQ+'#smartimport')+'">→ '+esc(mz(k))+' '+by[k].length+'</button>').join(''))}
  /* ── handoff: files waiting for another page ── */
  async function pending(){try{const a=await idb.all('handoff');return Array.isArray(a)?a:[]}catch(_){return []}}
  function paintPending(){return paintPending0().catch(e=>{try{console.warn('[smart import]',e&&e.message||e)}catch(_){}})}
  async function paintPending0(){const all=await pending();const by={};all.forEach(h=>(by[h.module]=by[h.module]||[]).push(h));const here=pageModule();const mods=Object.keys(by);
    if(els.n){els.n.textContent=all.length;els.n.classList.toggle('on',all.length>0)}if(!els.pend)return;
    els.pend.innerHTML=mods.length?'<div class="sec" style="border-color:#fdba74;background:#fff7ed"><h4 style="color:#9a3412">⏳ '+esc(L('等著匯入的檔（已交給模組，打開該頁就會自動匯入）','Waiting for their page (opens and imports automatically)'))+'</h4>'+mods.map(m=>'<div class="row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:3px 0"><b>'+esc(mz(m))+'</b> · '+by[m].length+L(' 檔',' file(s)')+' <span class="sub">'+esc(by[m].map(h=>h.name).join('、').slice(0,140))+'</span>'+(m===here?'<button class="b p" type="button" data-act="recv">⇧ '+esc(L('在本頁匯入','Import here'))+'</button>':'<button class="b p" type="button" data-act="nav" data-href="'+esc(MODULES[m].page+VQ+'#smartimport')+'">→ '+esc(L('前往匯入','Go and import'))+'</button>')+'<button class="b" type="button" data-act="drophand" data-m="'+m+'">'+esc(L('不要了','Discard'))+'</button></div>').join('')+'</div>':''}
  async function dropHandoff(m){const all=await pending();for(const h of all.filter(x=>x.module===m)){await idb.del('handoff',h.id);try{const l=await idb.get('ledger',h.hash);if(l&&l.status==='queued')await idb.put('ledger',Object.assign(l,{status:'dropped'}))}catch(_){}}await paintPending()}
  async function pageReady(){const t0=Date.now();while(!reg()&&Date.now()-t0<8000)await new Promise(r=>setTimeout(r,200));try{if(g.VRT_LOCAL_READY)await Promise.race([g.VRT_LOCAL_READY,new Promise(r=>setTimeout(r,15000))])}catch(_){}await new Promise(r=>setTimeout(r,500));return !!reg()}
  async function receive(manual){const here=pageModule();if(!here)return;const mine=(await pending()).filter(h=>h.module===here).sort((a,b)=>String(a.id).localeCompare(String(b.id)));if(!mine.length)return;
    close();chip('⏳ '+esc(mz(here))+'：'+esc(L('從智慧匯入帶來 ','from smart import: '))+mine.length+esc(L(' 檔，交給本頁…',' file(s), handing over…')));
    if(!await pageReady()){chip('❌ '+esc(L('本頁匯入器沒有準備好，請重新整理再按「⇧ 智慧匯入」','the page importer is not ready — reload and open ⇧ Smart import')));return}
    try{await feedHere(mine.map(h=>new File([h.data],h.name,{type:h.type||'',lastModified:h.lastModified||Date.now()})));
      for(const h of mine){await idb.del('handoff',h.id);await idb.put('ledger',{hash:h.hash,module:here,at:new Date().toISOString(),status:'handed',name:h.name,page:pageFile()});for(const k of (h.kids||[]))await idb.put('ledger',{hash:k,module:here,at:new Date().toISOString(),status:'handed',name:h.name,page:pageFile(),parent:h.name})}
      lastResult={here:{module:here,n:mine.length},away:{},at:new Date().toISOString(),received:true};await paintPending();await chipDone(here,mine.length)}catch(e){chip('❌ '+esc(e.message))}}
  /* ── after import: summary / approval ── */
  function paintResult(){const R=lastResult;if(!R||!els.res)return;const here=pageModule();const H=R.here?HOOKS[R.here.module]||{}:{};
    els.res.innerHTML='<div class="res"><b>✓ '+esc(L('完成','Done'))+'</b>'+(R.here?'<div class="row">'+esc(mz(R.here.module))+' · '+R.here.n+L(' 檔已交給本頁（請在頁面上確認匯入）',' file(s) handed to this page (confirm on the page)')+
      (g.VRTTelegram&&g.VRTTelegram.open?' <button class="b g" type="button" data-act="tg">✈️ '+esc(L('發摘要','Send summary'))+'</button>':'')+(H.approve?' <button class="b p" type="button" data-act="ap" data-m="'+R.here.module+'">✅ '+esc(H.approveLabel||L('核可','Approve'))+'</button>':'')+'</div>':'')+
      Object.keys(R.away).map(m=>'<div class="row">'+esc(mz(m))+' · '+R.away[m]+L(' 檔等著匯入',' file(s) waiting')+' <button class="b p" type="button" data-act="nav" data-href="'+esc(MODULES[m].page+VQ+'#smartimport')+'">→ '+esc(L('前往匯入','Go and import'))+'</button></div>').join('')+'</div>'}
  function summary(){try{close();g.VRTTelegram.open()}catch(e){msg('❌ '+e.message)}}
  async function approve(m){const H=HOOKS[m];if(!H||!H.approve)return;try{close();await H.approve()}catch(e){msg('❌ '+e.message)}}
  /* ── API ── */
  function init(c){REG=Object.assign({},c||{});if(!REG.module)throw new Error('VRTSmartImport.init: module required');return api}
  function hook(m,h){HOOKS[m]=Object.assign(HOOKS[m]||{},h||{});return api}
  const api=Object.assign({version:VERSION,init,hook,open,close,add,receive,waitGone,chipHide,get rows(){return rows},get reg(){return reg()},pageModule,pending,ledger:()=>idb.all('ledger'),forget:h=>idb.del('ledger',h),learned,learn},pure);
  g.VRTSmartImport=api;
  function start(){ui();paintPending();try{const I=g.VRTI18n;if(I&&I.lang&&I.lang!=='zh'&&I.lang!=='en'&&I.load)I.load(I.lang).then(d=>{if(d)relabel()});g.addEventListener('vrt:lang',e=>{const l=e&&e.detail&&e.detail.lang;const I2=g.VRTI18n;if(l&&l!=='zh'&&l!=='en'&&I2&&I2.load)I2.load(l).then(()=>relabel());else relabel()})}catch(_){}const here=pageModule();if(here){pending().then(all=>{const mine=all.filter(h=>h.module===here);if(!mine.length)return;const fresh=mine.some(h=>Date.now()-Date.parse(h.createdAt||0)<30*60000);if(/smartimport/.test(location.hash)||fresh)receive(false).catch(e=>{try{console.warn('[smart import]',e&&e.message||e)}catch(_){}});else{open()}}).catch(()=>{})}
    if(/#smartimport-open/.test(location.hash))open()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,50));else setTimeout(start,50);
})(typeof window!=='undefined'?window:globalThis);
