/* VRT 機修零件：供應商對帳單（PDF／照片）讀取＋會計發票對照＋租機台／修理分析 v1.0（2026-11-21）
   Paul 11/21：「機修零件還有供應商的 pdf 列表，匯入後平台直接讀取，也可編輯刪減增加、也可匯出，跟其他一樣；
   裡面有分租機台跟修理機台，希望分開分析，也是日週月年；其他零件以後資料多時再依特性分；
   會計傳的 Excel 有 invoice：項目數量正確就不用重複，不一樣以供應商的表為準，但備註會計記錄的不同處」。
   - 對帳單：PDF（含 CamScanner 掃描）／照片 → 找表格格線 → 每一格各自辨識（品名用簡中＋英文，數字只認數字）→ 預覽可改、刪、加列 → 存成採購紀錄。
   - 會計 Excel（No./Voucher/SUPPLIER/Invoice/TOTAL AMOUNT/REMARKS/Month）→ 跟對帳單比：一樣只記「會計相符」；不同以對帳單為準、備註會計的數字；
     會計有但還沒有對帳單的先記一筆（之後對帳單來了自動換成明細）。
   - 類別：🏭 租機台／🛠️ 修理／🔩 零件／🪡 機針／🧴 耗材／🔧 工具（依品名自動分，可改）。新分頁「🛠️ 租機／修理」跟著上面的 日／週／月／年。 */
(function(g){
'use strict';
if(g.VRTPartsStmt)return;
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>{if(v==null||v==='')return null;const n=+String(v).replace(/[$,\s]/g,'');return isFinite(n)?n:null};
const M2=v=>v==null||!isFinite(v)?'—':'$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const L=(zh,en)=>{try{return _lang==='en'?en:zh}catch(_){return zh}};
const toastX=m=>{try{toast(m)}catch(_){console.log(m)}};
const hash=s=>{let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)};
const invK=v=>String(v==null?'':v).replace(/\D/g,'').replace(/^0+/,'');
const supK=v=>String(v||'').toUpperCase().replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,2).join(' ');
const TX=()=>{try{return TXNS}catch(_){return []}};
const setTX=a=>{try{TXNS=a}catch(_){}};

/* ── 類別 ── */
const CT=[['rental','🏭 租機台','Rental'],['repair','🛠️ 修理','Repair'],['parts','🔩 零件','Parts'],['needle','🪡 機針','Needles'],['supply','🧴 耗材','Supplies'],['tool','🔧 工具','Tools']];
const CTN=Object.fromEntries(CT.map(c=>[c[0],c]));
function classify(name,code){const s=String(name||''),c=String(code||'');
  if(/租|\brent(al)?\b/i.test(s)||/^5152/.test(c))return 'rental';
  if(/维修|維修|修理|\brepair(ed)?\b|\bfix(ed)?\b/i.test(s)||/^5157/.test(c))return 'repair';
  if(/^(机|機)针|機針|\bneedles\b|\bneedle\s*(#|no\.?|size)|\bDB ?x ?1\b|\bDP ?x ?5\b|\bTV ?x ?\d/i.test(s))return 'needle';
  if(/机油|機油|砂纸|砂紙|粘纸|黏紙|贴纸|貼紙|胶带|膠帶|\boil\b|sand ?paper|sticker|label|tape|numbering/i.test(s))return 'supply';
  if(/钳|鉗|剪刀|螺丝刀|螺絲起子|扳手|镊子|鑷子|\bpliers?\b|scissors?|screwdriver|wrench|\btools?\b/i.test(s))return 'tool';
  return 'parts'}
const typeOf=x=>x&&x.costType&&CTN[x.costType]?x.costType:classify(x&&(x.name||x.partNo),x&&x.erpCode);
const catOf=t=>({needle:'Needle',supply:'Consumable'}[t]||'Other');

/* ── 載入工具 ── */
const loadJs=src=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('載入失敗 '+src));document.head.appendChild(s)});
async function pdfLib(){if(!g.pdfjsLib)await loadJs('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');g.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';return g.pdfjsLib}
let WK=null,ORIG_OCR=null;
async function worker(onp){if(!g.Tesseract)await loadJs('https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js');
  if(!WK)WK=await g.Tesseract.createWorker(['chi_sim','eng'],1,{logger:m=>{if(onp&&m&&m.status)onp(m)}});return WK}

/* ── 頁面 → canvas ── */
async function pagesOf(file){const out=[];const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext==='pdf'){const lib=await pdfLib();const pdf=await lib.getDocument({data:await file.arrayBuffer()}).promise;
    for(let p=1;p<=Math.min(pdf.numPages,8);p++){const page=await pdf.getPage(p);const v1=page.getViewport({scale:1});const sc=Math.min(5,2500/v1.width);const vp=page.getViewport({scale:sc});
      const cv=document.createElement('canvas');cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);await page.render({canvasContext:x,viewport:vp}).promise;out.push(cv)}}
  else{const u=URL.createObjectURL(file);const im=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('不是圖片'));i.src=u});
    const sc=Math.min(3,Math.max(1,2500/im.naturalWidth));const cv=document.createElement('canvas');cv.width=Math.round(im.naturalWidth*sc);cv.height=Math.round(im.naturalHeight*sc);const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);x.drawImage(im,0,0,cv.width,cv.height);URL.revokeObjectURL(u);out.push(cv)}
  return out}

/* ── 找表格格線（掃描的歪一點也可以：每條線看上下 1px 一起算）── */
function grid(cv){const W=cv.width,H=cv.height,d=cv.getContext('2d').getImageData(0,0,W,H).data;const b=new Uint8Array(W*H);for(let i=0;i<W*H;i++){const l=.3*d[i*4]+.59*d[i*4+1]+.11*d[i*4+2];b[i]=l<160?1:0}
  const grp=(idx,gap)=>{const gs=[];idx.forEach(i=>{const l=gs[gs.length-1];if(l&&i-l[l.length-1]<=gap)l.push(i);else gs.push([i])});return gs.map(a=>Math.round(a.reduce((s,v)=>s+v,0)/a.length))};
  const rows=[];for(let y=1;y<H-1;y++){let n=0;const o=y*W;for(let x=0;x<W;x++)if(b[o+x]|b[o-W+x]|b[o+W+x])n++;if(n>W*.45)rows.push(y)}
  let hy=grp(rows,4);if(hy.length<4)return null;
  /* 取間距一致、最長的一段 */
  const gaps=hy.slice(1).map((v,i)=>v-hy[i]).sort((a,b)=>a-b),med=gaps[gaps.length>>1]||1;let best=[],cur=[hy[0]];
  for(let i=1;i<hy.length;i++){const gp=hy[i]-hy[i-1];if(gp>med*2.6||gp<med*.4){if(cur.length>best.length)best=cur;cur=[hy[i]]}else cur.push(hy[i])}if(cur.length>best.length)best=cur;hy=best;if(hy.length<4)return null;
  const top=hy[0],bot=hy[hy.length-1],cols=[];for(let x=1;x<W-1;x++){let n=0;for(let y=top;y<bot;y++){const o=y*W+x;if(b[o]|b[o-1]|b[o+1])n++}if(n>(bot-top)*.55)cols.push(x)}
  const vx=grp(cols,4);if(vx.length<5)return null;return {rows:hy,cols:vx,b,W,H}}
function cellCanvas(cv,G,x0,y0,x1,y1,money){const m=Math.max(4,Math.round((y1-y0)*.08));x0+=m;x1-=m;y0+=m;y1-=Math.max(3,m-1);if(x1-x0<6||y1-y0<6)return null;
  let ink=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)ink+=G.b[y*G.W+x];if(ink<(x1-x0)*(y1-y0)*.004)return null;
  if(money){/* 金額欄左邊的「$」單獨一塊 → 切掉，不然 $ 會被讀成 5、9、4 */const colInk=[];for(let x=x0;x<x1;x++){let n=0;for(let y=y0;y<y1;y++)n+=G.b[y*G.W+x];colInk.push(n>0)}
    const segs=[];let st=-1;colInk.forEach((v,i)=>{if(v&&st<0)st=i;if(!v&&st>=0){segs.push([st,i]);st=-1}});if(st>=0)segs.push([st,colInk.length]);
    const gapMin=(y1-y0)*.35;const grp=[];segs.forEach(sg=>{const l=grp[grp.length-1];if(l&&sg[0]-l[1]<gapMin)l[1]=sg[1];else grp.push(sg.slice())});
    if(grp.length>=2&&grp[0][1]<(x1-x0)*.4&&(grp[0][1]-grp[0][0])<(y1-y0)*1.1)x0+=grp[1][0]-4}
  const pad=20,c=document.createElement('canvas');c.width=x1-x0+pad*2;c.height=y1-y0+pad*2;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(cv,x0,y0,x1-x0,y1-y0,pad,pad,x1-x0,y1-y0);
  const id=x.getImageData(0,0,c.width,c.height),p=id.data;for(let i=0;i<p.length;i+=4){const v=.3*p[i]+.59*p[i+1]+.11*p[i+2]>150?255:0;p[i]=p[i+1]=p[i+2]=v}x.putImageData(id,0,0);return c}
async function ocr(w,c,mode){if(!c)return '';await w.setParameters({tessedit_pageseg_mode:mode==='char'?'8':'7',tessedit_char_whitelist:mode==='num'?'0123456789.,-/':''});const r=await w.recognize(c);return String(r.data&&r.data.text||'').replace(/\s+/g,' ').trim()}
const ROLE=[['inv',/单号|單號|inv|no\b|號碼|号码/i],['date',/日期|date/i],['name',/品名|名称|名稱|desc|item|項目|项目/i],['qty',/^数|^數|qty|quantity|数量|數量/i],['unit',/量|单位|單位|unit\b/i],['price',/单价|單價|price/i],['amt',/总价|總價|金额|金額|amount|total/i]];
function parseDate(s){s=String(s||'').trim();let m=s.match(/(20\d\d)[-\/.](\d{1,2})[-\/.](\d{1,2})/);if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
  m=s.match(/(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{2,4})/);if(m){const y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0')}return ''}
const num1=t=>{t=String(t||'').replace(/,/g,'');const ms=t.match(/\d+(?:\.\d+)?/g);return ms?ms[ms.length-1]:''};
const cand=t=>{const v=num1(t);if(!v)return [null];const o=[+v];if(v.replace('.','').length>=2){const d=v.slice(1);if(d&&d[0]!=='.')o.push(+d)}return o};
let DICT={};try{DICT=JSON.parse(localStorage.getItem('vrt_stmt_dict')||'{}')}catch(_){}
const fixName=s=>DICT[s]||s;

async function readFile(file,onp){const pages=await pagesOf(file);const res={file:file.name,supplier:'',supplierZh:'',month:'',printedTotal:null,lines:[],image:'',ok:false,note:''};
  const w=await worker(m=>onp&&onp(m.status==='recognizing text'?null:m.status));let n=0;
  for(const cv of pages){const G=grid(cv);if(!res.image){const t=document.createElement('canvas');const sc=900/cv.width;t.width=900;t.height=Math.round(cv.height*sc);t.getContext('2d').drawImage(cv,0,0,t.width,t.height);res.image=t.toDataURL('image/jpeg',.7)}
    if(!G)continue;res.ok=true;
    /* 表頭上方：供應商、對帳月份 */
    if(!res.supplier){onp&&onp('讀抬頭…');const top=document.createElement('canvas');top.width=cv.width;top.height=G.rows[0];const tx=top.getContext('2d');tx.drawImage(cv,0,0);{const id=tx.getImageData(0,0,top.width,top.height),pp=id.data;for(let i=0;i<pp.length;i+=4){const v=.3*pp[i]+.59*pp[i+1]+.11*pp[i+2]>150?255:0;pp[i]=pp[i+1]=pp[i+2]=v}tx.putImageData(id,0,0)}
      await w.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});const r=await w.recognize(top);const txt=String(r.data&&r.data.text||'');
      const mm=txt.match(/STATEMENT\s*FOR\s*(20\d\d)\s*[-\/.]\s*(\d{1,2})/i)||txt.match(/(20\d\d)\s*[-\/.年]\s*(\d{1,2})\s*月?/);if(mm)res.month=mm[1]+'-'+mm[2].padStart(2,'0');
      const ls=txt.split('\n').map(s=>s.trim()).filter(Boolean);const en=ls.find(s=>/[A-Z]{3,}\s+[A-Z]{3,}/.test(s)&&!/ADD|TEL|EMAIL|STATEMENT|^TO\b|VANTAGE|STREET|SANGKAT/i.test(s));if(en)res.supplier=en.replace(/[^A-Za-z0-9 &.,()-]/g,'').trim();
      const zh=ls.map(s=>s.replace(/\s/g,'')).find(s=>/[一-鿿]{3,}/.test(s)&&!/[A-Za-z]{3}/.test(s));if(zh&&zh.length>=4&&!/一一/.test(zh))res.supplierZh=zh}
    /* 表頭格 → 欄位 */
    const C=G.cols,R=G.rows,role=[];for(let c=0;c<C.length-1;c++){const t=await ocr(w,cellCanvas(cv,G,C[c],R[0],C[c+1],R[1]),'txt');const f=ROLE.find(x=>x[1].test(t.replace(/\s/g,'')));role.push(f?f[0]:'')}
    {const def=['inv','date','name','qty','unit','price','amt'];if(C.length-1===7)for(let i=0;i<7;i++)if(!role[i]&&!role.includes(def[i]))role[i]=def[i]}
    res.debug={rows:R,cols:C,role};let inv='',date='';
    for(let r=1;r<R.length-1;r++){const cell={};let txtAll='';
      for(let c=0;c<C.length-1;c++){const rl=role[c]||'x';const mode=(rl==='qty'||rl==='price'||rl==='amt'||rl==='inv'||rl==='date')?'num':'txt';const cc=cellCanvas(cv,G,C[c],R[r],C[c+1],R[r+1],rl==='price'||rl==='amt');if(!cc)continue;
        const t=await ocr(w,cc,mode);cell[rl]=t;txtAll+=' '+t;n++;onp&&onp('讀第 '+r+' 列…')}
      if(!Object.keys(cell).length)continue;
      res.debug.cells=(res.debug.cells||[]).concat([[r,JSON.stringify(cell)]]);
      if(/TOTAL|合计|合計|总计|總計/i.test(txtAll)||(!cell.name&&!cell.qty&&(cell.amt||cell.price)&&r>=R.length-3&&res.lines.length)){const c2=cand(cell.amt||cell.price);const sum=res.lines.reduce((s,l)=>s+(l.amt||0),0);const a=c2.find(v=>v!=null&&Math.abs(v-sum)<.01)??c2[0];if(a!=null&&a>0)res.printedTotal=a;continue}
      if(!cell.name&&!cell.amt&&!cell.qty)continue;
      if(cell.inv&&invK(cell.inv).length>=3)inv=invK(cell.inv);const dd=parseDate(cell.date);if(dd)date=dd;
      let q=N(num1(cell.qty)),p=null,a=null;{const ps=cand(cell.price),as=cand(cell.amt);let best=null;for(const pp of ps)for(const aa of as){const e=q!=null&&pp!=null&&aa!=null?Math.abs(q*pp-aa):9e9;if(!best||e<best[0]-1e-9)best=[e,pp,aa]}p=best[1];a=best[2];if(best[0]>.011){p=ps[0];a=as[0]}}if(q==null&&p&&a)q=Math.round(a/p*100)/100;if(a==null&&q!=null&&p!=null)a=Math.round(q*p*100)/100;if(p==null&&q&&a)p=Math.round(a/q*100)/100;
      const raw=String(cell.name||'').replace(/[〈《]/g,'(').replace(/[〉》]/g,')').replace(/（/g,'(').replace(/）/g,')').replace(/\s+(?=[一-鿿)])/g,'').replace(/(?<=[一-鿿(])\s+/g,'').trim();const name=fixName(raw);
      const UN='个張张桶套台条條支包盒卷米码碼对對把瓶根箱件双雙打';const un=(()=>{const u=String(cell.unit||'').replace(/\s/g,'');const ch=[...u].find(c=>UN.includes(c));if(ch)return ch;const m=u.match(/pcs|set|roll|box|pair|kg|m\b/i);return m?m[0].toLowerCase():''})();
      res.lines.push({inv,date,name,raw,qty:q,unit:un,price:p,amt:a,type:classify(name),note:'',warn:q!=null&&p!=null&&a!=null&&Math.abs(q*p-a)>.011})}
    /* 表格下面的 TOTAL 框（只畫在最右兩欄，不算在格線裡）*/
    if(res.printedTotal==null&&res.lines.length){const rh=R[1]-R[0],y0=R[R.length-1]+2,y1=Math.min(cv.height,y0+Math.round(rh*2.2)),x0=C[Math.max(0,C.length-3)];if(y1-y0>10){const c=document.createElement('canvas');c.width=C[C.length-1]-x0+40;c.height=y1-y0+40;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(cv,x0,y0,c.width-40,y1-y0,20,20,c.width-40,y1-y0);
      await w.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});const r2=await w.recognize(c);const t2=String(r2.data&&r2.data.text||'').replace(/,/g,'');const sum=res.lines.reduce((s,l)=>s+(l.amt||0),0);
      const nums=(t2.match(/\d+\.\d\d/g)||[]).flatMap(v=>[+v,+(v.slice(1))]);const hit=nums.find(v=>Math.abs(v-sum)<.01);if(hit!=null)res.printedTotal=hit;else if(/TOTAL/i.test(t2)&&nums.length)res.printedTotal=nums[0];res.debug.totalText=t2}}
  }
  if(!res.month){const ds=res.lines.map(l=>l.date.slice(0,7)).filter(Boolean).sort();res.month=ds[ds.length>>1]||''}
  /* 單號離大家太遠（例：1442 讀成 4442）→ 標黃 */
  const ivs=res.lines.map(l=>+l.inv).filter(Boolean).sort((a,b)=>a-b),mid=ivs[ivs.length>>1];if(mid)res.lines.forEach(l=>{if(l.inv&&Math.abs(+l.inv-mid)>200)l.invWarn=true});
  return res}

/* ── 預覽／編輯 ── */
function css(){if(document.getElementById('psCss'))return;const s=document.createElement('style');s.id='psCss';s.textContent=`
.ps-mask{position:fixed;inset:0;z-index:99980;background:rgba(2,6,23,.55);display:flex;padding:8px}
.ps-box{margin:auto;width:min(1180px,100%);height:100%;background:#f4f6fb;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;color:#0f172a;font:13px/1.45 system-ui,-apple-system,"Segoe UI","Noto Sans TC",sans-serif}
.ps-hd{display:flex;gap:8px;align-items:center;padding:10px 12px;background:#fff;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}.ps-hd b{font-size:16px;margin-right:auto}
.ps-bd{flex:1;overflow:auto;padding:10px 12px}
.ps-f{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.ps-f label{font-size:11px;color:#64748b;display:flex;flex-direction:column;gap:2px}.ps-f input{border:1px solid #cbd5e1;border-radius:8px;padding:6px 8px;font:inherit;min-width:120px}
.ps-img{float:right;width:220px;margin:0 0 8px 10px;border:1px solid #cbd5e1;border-radius:8px;cursor:zoom-in;background:#fff}.ps-img.big{float:none;width:100%;cursor:zoom-out}
.ps-tb{overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;clear:both}.ps-tb table{border-collapse:collapse;width:100%;min-width:880px}.ps-tb th{background:#f8fafc;color:#64748b;font-size:11px;text-align:left;padding:6px;position:sticky;top:0}
.ps-tb td{border-top:1px solid #eef2f7;padding:3px 4px}.ps-tb input,.ps-tb select{width:100%;border:1px solid transparent;background:transparent;border-radius:6px;padding:5px;font:inherit}.ps-tb input:focus,.ps-tb select:focus{border-color:#6366f1;background:#fff;outline:0}
.ps-tb tr.w td{background:#fffbeb}.ps-tb input.w{background:#fef3c7}.ps-tb .n{text-align:right}.ps-x{border:0;background:none;color:#dc2626;font-size:16px;cursor:pointer}
.ps-ft{display:flex;gap:8px;align-items:center;padding:10px 12px;background:#fff;border-top:1px solid #e2e8f0;flex-wrap:wrap}.ps-ft .sum{margin-right:auto;font-size:13px}
.ps-btn{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:8px 12px;font:inherit;font-weight:700;cursor:pointer}.ps-btn.y{background:#4f46e5;border-color:#4f46e5;color:#fff}.ps-btn:disabled{opacity:.5}
.ps-tag{display:inline-block;font-size:11px;font-weight:700;border-radius:99px;padding:1px 8px;background:#eef2ff;color:#3730a3;margin-right:4px}.ps-tag.ok{background:#dcfce7;color:#166534}.ps-tag.bad{background:#fee2e2;color:#991b1b}.ps-tag.warn{background:#fef3c7;color:#92400e}
.ps-prog{padding:30px;text-align:center;color:#475569}.ps-bar{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:10px auto;max-width:420px}.ps-bar i{display:block;height:100%;background:#6366f1;width:0;transition:width .2s}
.rr-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:8px 0}.rr-k div{background:var(--card,#fff);border:1px solid var(--line,#e2e8f0);border-radius:12px;padding:10px;cursor:pointer}.rr-k div.on{outline:2px solid #4f46e5}.rr-k b{display:block;font-size:20px}.rr-k small{color:var(--sub,#64748b)}
.rr-row{cursor:pointer}.rr-row:hover td{background:#eef4ff}
@media(max-width:640px){.ps-mask{padding:0}.ps-box{border-radius:0}.ps-img{float:none;width:100%}}`;document.head.appendChild(s)}
function modal(html){css();const el=document.createElement('div');el.className='ps-mask';el.innerHTML='<div class="ps-box">'+html+'</div>';document.body.appendChild(el);return el}

async function open(files){files=[...files||[]];if(!files.length)return;const el=modal('<div class="ps-hd"><b>🧾 '+L('供應商對帳單','Supplier statement')+'</b><button class="ps-btn" data-x>✕</button></div><div class="ps-bd"><div class="ps-prog"><div class="ps-msg">'+L('準備辨識（第一次要下載中文字庫，約 20 秒）…','Preparing OCR…')+'</div><div class="ps-bar"><i></i></div></div></div>');
  let stop=false;el.querySelector('[data-x]').onclick=()=>{stop=true;el.remove()};const msg=el.querySelector('.ps-msg'),bar=el.querySelector('.ps-bar i');
  const results=[];for(let i=0;i<files.length&&!stop;i++){try{let k=0;const r=await readFile(files[i],m=>{if(m){msg.textContent=files[i].name+'：'+m;k++;bar.style.width=Math.min(97,k*.9)+'%'}});results.push(r)}catch(e){results.push({file:files[i].name,ok:false,note:e.message,lines:[]})}}
  if(stop)return;const bad=results.filter(r=>!r.ok||!r.lines.length);el.remove();
  if(bad.length===results.length){toastX(L('找不到對帳單表格（要有格線的表），改用 🤖 智慧OCR','No table found, opening Smart OCR'));try{goTab('ocr',null);(ORIG_OCR||ocrFiles)(files)}catch(_){}return}
  for(const r of results.filter(r=>r.ok&&r.lines.length))await edit(r)}

function existingInv(sup,inv){return TX().filter(x=>x&&supK(x.supplier)===supK(sup)&&invK(x.invoiceNo)===invK(inv))}
function edit(r){return new Promise(done=>{const el=modal(`<div class="ps-hd"><b>🧾 ${L('供應商對帳單','Supplier statement')} · ${E(r.file)}</b><button class="ps-btn" data-xl>📤 ${L('匯出 Excel','Export')}</button><button class="ps-btn" data-x>✕</button></div>
   <div class="ps-bd"><img class="ps-img" src="${r.image}" alt="" title="${L('點一下放大／縮小','Tap to zoom')}"><div class="ps-f"><label>${L('供應商','Supplier')}<input data-h="supplier" value="${E(r.supplier||r.supplierZh)}"></label><label>${L('中文名','Chinese name')}<input data-h="supplierZh" value="${E(r.supplierZh)}"></label><label>${L('對帳月份','Statement month')}<input data-h="month" type="month" value="${E(r.month)}"></label><label>${L('單上的總額','Printed total')}<input data-h="printedTotal" value="${r.printedTotal==null?'':r.printedTotal}"></label></div>
   <p style="margin:4px 0 8px;color:#475569">${L('黃色＝數量×單價≠總價，或單號看起來讀錯，請對照右邊原圖修改。類別會自動分，可改。','Yellow = qty × price ≠ amount or invoice looks wrong; check against the image.')}</p>
   <div class="ps-tb"><table><thead><tr><th style="width:70px">${L('單號','Inv.')}</th><th style="width:118px">${L('日期','Date')}</th><th>${L('品名','Item')}</th><th style="width:62px">${L('數量','Qty')}</th><th style="width:52px">${L('單位','Unit')}</th><th style="width:76px">${L('單價','Price')}</th><th style="width:84px">${L('總價','Amount')}</th><th style="width:118px">${L('類別','Type')}</th><th style="width:150px">${L('備註','Note')}</th><th style="width:28px"></th></tr></thead><tbody></tbody></table></div>
   <button class="ps-btn" data-add style="margin-top:8px">＋ ${L('加一列','Add row')}</button></div>
   <div class="ps-ft"><span class="sum"></span><button class="ps-btn" data-x>${L('取消','Cancel')}</button><button class="ps-btn y" data-save>✅ ${L('存入採購紀錄','Save')}</button></div>`);
  const tb=el.querySelector('tbody');const H=k=>el.querySelector('[data-h="'+k+'"]').value.trim();
  const row=l=>`<tr class="${l.warn?'w':''}"><td><input data-k="inv" value="${E(l.inv)}" class="${l.invWarn?'w':''}"></td><td><input data-k="date" type="date" value="${E(l.date)}"></td><td><input data-k="name" value="${E(l.name)}" data-raw="${E(l.raw||'')}"></td><td><input data-k="qty" class="n" value="${l.qty==null?'':l.qty}"></td><td><input data-k="unit" value="${E(l.unit)}"></td><td><input data-k="price" class="n" value="${l.price==null?'':l.price}"></td><td><input data-k="amt" class="n" value="${l.amt==null?'':l.amt}"></td><td><select data-k="type">${CT.map(c=>`<option value="${c[0]}" ${c[0]===l.type?'selected':''}>${c[1]}</option>`).join('')}</select></td><td><input data-k="note" value="${E(l.note)}"></td><td><button class="ps-x" data-del title="${L('刪除這一列','Delete row')}">✕</button></td></tr>`;
  tb.innerHTML=r.lines.map(row).join('');
  const read=()=>[...tb.rows].map(tr=>{const v=k=>tr.querySelector('[data-k="'+k+'"]').value.trim();return {inv:invK(v('inv')),date:v('date'),name:v('name'),raw:tr.querySelector('[data-k="name"]').dataset.raw||'',qty:N(v('qty')),unit:v('unit'),price:N(v('price')),amt:N(v('amt')),type:v('type'),note:v('note')}}).filter(l=>l.name||l.amt);
  const sum=()=>{const ls=read();const t=ls.reduce((s,l)=>s+(l.amt!=null?l.amt:(l.qty||0)*(l.price||0)),0);const pt=N(H('printedTotal'));const dup=[...new Set(ls.map(l=>l.inv).filter(Boolean))].filter(i=>existingInv(H('supplier'),i).length);
    [...tb.rows].forEach(tr=>{const v=k=>N(tr.querySelector('[data-k="'+k+'"]').value);const q=v('qty'),p=v('price'),a=v('amt');tr.classList.toggle('w',q!=null&&p!=null&&a!=null&&Math.abs(q*p-a)>.011)});
    el.querySelector('.sum').innerHTML=`${ls.length} ${L('列','rows')} · ${L('合計','Total')} <b>${M2(t)}</b> `+(pt!=null?(Math.abs(pt-t)<.01?`<span class="ps-tag ok">✓ ${L('跟單上總額一樣','matches printed total')}</span>`:`<span class="ps-tag bad">≠ ${L('單上','printed')} ${M2(pt)}</span>`):'')+(dup.length?` <span class="ps-tag warn">${L('已有的單號會更新','existing invoices will be updated')}：${E(dup.join('、'))}</span>`:'')};
  el.addEventListener('input',sum);el.addEventListener('change',sum);sum();
  el.querySelector('.ps-img').onclick=e=>e.target.classList.toggle('big');
  el.querySelector('[data-add]').onclick=()=>{const ls=read(),last=ls[ls.length-1]||{};tb.insertAdjacentHTML('beforeend',row({inv:last.inv||'',date:last.date||'',name:'',qty:null,unit:'',price:null,amt:null,type:'parts',note:''}));sum()};
  tb.addEventListener('click',e=>{const d=e.target.closest('[data-del]');if(d){d.closest('tr').remove();sum()}});
  tb.addEventListener('change',e=>{if(e.target.dataset.k==='name'){const tr=e.target.closest('tr');const s=tr.querySelector('[data-k="type"]');s.value=classify(e.target.value)}});
  el.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{el.remove();done(false)});
  el.querySelector('[data-xl]').onclick=()=>exportRows(read().map(l=>({Type:CTN[l.type][2],Date:l.date,Month:H('month'),Supplier:H('supplier'),Invoice:l.inv,Item:l.name,Qty:l.qty,Unit:l.unit,'Unit Price':l.price,Amount:l.amt,Note:l.note})),'Statement_'+(H('month')||'')+'.xlsx');
  el.querySelector('[data-save]').onclick=async()=>{const ls=read();if(!ls.length)return toastX(L('沒有資料','Nothing to save'));const sup=H('supplier')||H('supplierZh');if(!sup)return toastX(L('請填供應商','Enter supplier'));
    ls.forEach(l=>{if(l.raw&&l.name&&l.raw!==l.name)DICT[l.raw]=l.name});try{localStorage.setItem('vrt_stmt_dict',JSON.stringify(DICT))}catch(_){}
    const n=saveStatement({supplier:sup,supplierZh:H('supplierZh'),month:H('month'),file:r.file,printedTotal:N(H('printedTotal'))},ls);el.remove();await persist();toastX(L('已存入 ','Saved ')+n+L(' 列（採購記錄、租機／修理）',' rows'));done(true)}})}

/* 存對帳單：同供應商＋同單號的舊資料（對帳單或會計先記的）換成這次的明細；會計記錄留在備註 */
function saveStatement(h,ls){const now=new Date().toISOString();let all=TX().slice();const invs=[...new Set(ls.map(l=>l.inv).filter(Boolean))];const accBy={};
  all=all.filter(x=>{if(!x||supK(x.supplier)!==supK(h.supplier)||!invs.includes(invK(x.invoiceNo)))return true;if(x.source!=='supplier'&&x.source!=='acc')return true;if(x.acc)accBy[invK(x.invoiceNo)]=x.acc;return false});
  const out=ls.map((l,i)=>{const amt=l.amt!=null?l.amt:Math.round((l.qty||0)*(l.price||0)*100)/100;return {id:'STMT-'+hash([supK(h.supplier),l.inv,l.name,l.qty,l.price,i].join('|')),type:'PURCHASE',source:'supplier',date:l.date||(h.month?h.month+'-01':''),invoiceDate:l.date||'',invoiceNo:l.inv,partNo:l.name,name:l.name,qty:l.qty||0,unit:l.unit,unitPrice:l.price||0,amount:amt,
    statementMonth:h.month||String(l.date||'').slice(0,7),supplier:h.supplier,supplierZh:h.supplierZh||'',costType:l.type,category:catOf(l.type),includeInMaster:l.type!=='rental'&&l.type!=='repair',remark:l.note||'',sourceFile:h.file,sourceSheet:'statement',sourceRow:i+1,createdAt:now,updatedAt:now}});
  /* 會計先記過的 → 比金額 */
  invs.forEach(iv=>{const a=accBy[iv];if(!a)return;const rows=out.filter(x=>invK(x.invoiceNo)===iv),t=rows.reduce((s,x)=>s+(+x.amount||0),0);rows.forEach(x=>x.acc=a);rows[0].accNote=Math.abs(t-(+a.amount||0))<.01?L('會計相符','Accounting matches')+'（'+(a.voucher||'')+'）':L('會計記 ','Accounting ')+M2(+a.amount)+'（'+(a.voucher||'')+' '+(a.remark||'')+'），'+L('對帳單 ','statement ')+M2(t)+L('，以對帳單為準',' — statement wins')});
  setTX(all.concat(out));return out.length}
async function persist(){try{await saveAll()}catch(e){console.warn(e)}try{renderTab(_curTab)}catch(_){}}

/* ── 會計 Excel ── */
function accSheets(wb){const out=[];for(const name of wb.SheetNames){const a=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:''});
  const h=a.findIndex(r=>r.some(v=>/^voucher$/i.test(String(v).trim()))&&r.some(v=>/^invoice$/i.test(String(v).trim()))&&r.some(v=>/total\s*amount/i.test(String(v))));if(h<0)continue;
  const head=a[h].map(v=>String(v).trim().toUpperCase()),col=re=>head.findIndex(v=>re.test(v));const ci={v:col(/^VOUCHER$/),s:col(/^SUPPLIER/),i:col(/^INVOICE$/),e:col(/^ERP/),t:col(/TOTAL\s*AMOUNT/),r:col(/^REMARK/),m:col(/^MONTH$/)};
  for(let k=h+1;k<a.length;k++){const r=a[k],sup=String(r[ci.s]||'').trim(),iv=invK(r[ci.i]),amt=N(r[ci.t]);if(!sup||!iv||amt==null)continue;let mo=r[ci.m];
    if(typeof mo==='number'){const d=new Date(Math.round((mo-25569+.5)*864e5));mo=d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')}else if(mo instanceof Date){const d=new Date(mo.getTime()+12*36e5);mo=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}else mo=String(mo||'').slice(0,7);
    out.push({sheet:name,voucher:String(r[ci.v]||'').trim(),supplier:sup,inv:iv,erp:ci.e>=0?String(r[ci.e]||'').trim():'',amount:amt,remark:ci.r>=0?String(r[ci.r]||'').trim():'',month:mo})}}return out}
function accPlan(rows){return rows.map(a=>{const st=TX().filter(x=>x&&x.source==='supplier'&&supK(x.supplier)===supK(a.supplier)&&invK(x.invoiceNo)===a.inv);const t=st.reduce((s,x)=>s+(+x.amount||0),0);
  const prev=TX().find(x=>x&&x.source==='acc'&&supK(x.supplier)===supK(a.supplier)&&invK(x.invoiceNo)===a.inv);
  return Object.assign({},a,{stTotal:st.length?t:null,status:!st.length?(prev?'same-acc':'add'):(Math.abs(t-a.amount)<.01?'match':'diff'),type:classify(a.remark,a.erp)})})}
async function importAcc(file,rows){const plan=accPlan(rows);const months=[...new Set(plan.map(p=>p.month).filter(Boolean))];
  const miss=TX().filter(x=>x&&x.source==='supplier'&&months.includes(String(x.statementMonth||'').slice(0,7))&&plan.some(p=>supK(p.supplier)===supK(x.supplier))&&!plan.some(p=>supK(p.supplier)===supK(x.supplier)&&p.inv===invK(x.invoiceNo)));
  const missInv=[...new Set(miss.map(x=>invK(x.invoiceNo)))];
  const lab={match:['ok',L('相符','Match')],diff:['bad',L('不同（以對帳單為準）','Different — statement wins')],add:['warn',L('還沒有對帳單，先記會計這筆','No statement yet — add accounting row')],'same-acc':['',L('已記過','Already recorded')]};
  return new Promise(done=>{const el=modal(`<div class="ps-hd"><b>📒 ${L('會計發票對照','Accounting invoices')} · ${E(file.name)}</b><button class="ps-btn" data-x>✕</button></div><div class="ps-bd">
   <p style="margin:0 0 8px;color:#475569">${L('跟已匯入的供應商對帳單比：一樣的不重複；金額不同以對帳單為準，會計的數字寫在備註；會計有、對帳單還沒有的先記一筆（之後對帳單來了會自動換成明細）。','Compared with supplier statements.')}</p>
   <div class="ps-tb"><table><thead><tr><th>${L('月份','Month')}</th><th>${L('傳票','Voucher')}</th><th>${L('發票','Invoice')}</th><th>${L('會計說明','Accounting remark')}</th><th class="n">${L('會計金額','Accounting')}</th><th class="n">${L('對帳單','Statement')}</th><th>${L('類別','Type')}</th><th>${L('結果','Result')}</th></tr></thead><tbody>${plan.map(p=>`<tr><td>${E(p.month)}</td><td>${E(p.voucher)}</td><td>${E(p.inv)}</td><td>${E(p.remark)}</td><td class="n">${M2(p.amount)}</td><td class="n">${p.stTotal==null?'—':M2(p.stTotal)}</td><td>${CTN[p.type][1]}</td><td><span class="ps-tag ${lab[p.status][0]}">${lab[p.status][1]}</span></td></tr>`).join('')}</tbody></table></div>
   ${missInv.length?`<p style="margin-top:8px"><span class="ps-tag warn">${L('對帳單有、會計這幾個月沒有','In statement but not in accounting')}</span> ${E(missInv.join('、'))}</p>`:''}</div>
   <div class="ps-ft"><span class="sum">${L('相符','Match')} ${plan.filter(p=>p.status==='match').length} · ${L('不同','Different')} ${plan.filter(p=>p.status==='diff').length} · ${L('新增','Add')} ${plan.filter(p=>p.status==='add').length}</span><button class="ps-btn" data-x>${L('取消','Cancel')}</button><button class="ps-btn y" data-ok>✅ ${L('套用','Apply')}</button></div>`);
   el.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{el.remove();done(false)});
   el.querySelector('[data-ok]').onclick=async()=>{const now=new Date().toISOString();const all=TX().slice();
     plan.forEach(p=>{const acc={voucher:p.voucher,amount:p.amount,remark:p.remark,erp:p.erp,month:p.month,file:file.name};
       if(p.status==='match'||p.status==='diff'){const rows=all.filter(x=>x&&x.source==='supplier'&&supK(x.supplier)===supK(p.supplier)&&invK(x.invoiceNo)===p.inv);rows.forEach(x=>{x.acc=acc;x.updatedAt=now});if(rows[0])rows[0].accNote=p.status==='match'?L('會計相符','Accounting matches')+'（'+p.voucher+'）':L('會計記 ','Accounting ')+M2(p.amount)+'（'+p.voucher+' '+p.remark+'），'+L('對帳單 ','statement ')+M2(p.stTotal)+L('，以對帳單為準',' — statement wins')}
       else if(p.status==='add')all.push({id:'ACC-'+hash(supK(p.supplier)+'|'+p.inv),type:'PURCHASE',source:'acc',date:(p.month||'')+'-01',invoiceDate:'',invoiceNo:p.inv,partNo:p.remark||('INV '+p.inv),name:p.remark||('INV '+p.inv),qty:1,unit:'',unitPrice:p.amount,amount:p.amount,statementMonth:p.month,supplier:(all.find(x=>x&&x.source==='supplier'&&supK(x.supplier)===supK(p.supplier))||{}).supplier||p.supplier,costType:p.type,category:catOf(p.type),erpCode:p.erp,includeInMaster:false,acc,
         accNote:L('只有會計記錄（傳票 ','Accounting only (')+p.voucher+L('），還沒有對帳單明細',') — no statement yet'),remark:'',sourceFile:file.name,sourceSheet:p.sheet,createdAt:now,updatedAt:now})});
     miss.forEach(x=>{if(!x.accNote)x.accNote=L('會計 ','Not in accounting ')+String(x.statementMonth||'').slice(0,7)+L(' 的帳沒有這張單','')});
     setTX(all);el.remove();await persist();toastX(L('會計對照已套用','Accounting applied'));done(true)}})}

/* ── 🛠️ 租機／修理 分頁（跟著上面的 日／週／月／年）── */
let rrType='';
function rows(){let a=[];try{a=purchaseTxns()}catch(_){a=TX()}return a.filter(x=>x&&x.date)}
function renderRR(){css();const all=rows(),cur=all.filter(x=>{try{return inDateRange(x.date)}catch(_){return true}});const by=t=>cur.filter(x=>typeOf(x)===t);const amt=xs=>xs.reduce((s,x)=>s+purchaseAmount(x),0);
  const per=(()=>{try{const m=partsDateMode(FILTER.date||'all');return m==='all'?L('全部期間','All'):(FILTER.periodKey||currentPeriodKey43(m))}catch(_){return ''}})();
  const months=[...new Set(all.map(x=>String(x.date).slice(0,7)))].sort().slice(-12);
  const tbl=(xs,title)=>`<div class="card"><div class="ct">${title} · ${xs.length} ${L('筆','rows')} · ${M2(amt(xs))}</div><div class="tw"><table><thead><tr><th>${L('日期','Date')}</th><th>${L('供應商','Supplier')}</th><th>${L('單號','Inv.')}</th><th>${L('品名／機台','Item / machine')}</th><th class="num">${L('數量','Qty')}</th><th class="num">${L('單價','Price')}</th><th class="num">${L('金額','Amount')}</th><th>${L('會計／備註','Accounting / note')}</th></tr></thead><tbody>${xs.sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>`<tr class="rr-row" data-id="${E(x.id)}"><td>${E(x.date)}</td><td>${E(x.supplier||'')}</td><td>${E(x.invoiceNo||'')}</td><td>${E(x.name||x.partNo)}</td><td class="num">${E(x.qty)} ${E(x.unit||'')}</td><td class="num">${M2(+x.unitPrice)}</td><td class="num"><b>${M2(purchaseAmount(x))}</b></td><td style="font-size:12px">${E([x.accNote,x.remark].filter(Boolean).join('；'))}</td></tr>`).join('')||`<tr><td colspan="8" style="color:#64748b">${L('這段期間沒有','Nothing in this period')}</td></tr>`}</tbody></table></div></div>`;
  let h=`<div class="sec on"><div class="card"><div class="ct" style="justify-content:space-between"><span>🛠️ ${L('租機台／修理／零件分類','Rental / repair / parts by type')} · ${E(per)}</span><span><button class="btn btn-y btn-sm" onclick="VRTPartsStmt.pick()">📄 ${L('匯入對帳單 PDF／照片','Import statement PDF / photo')}</button> <button class="btn btn-g btn-sm" onclick="VRTPartsStmt.add()">＋ ${L('手動新增','Add')}</button> <button class="btn btn-g btn-sm" onclick="VRTPartsStmt.exportPeriod()">📤 ${L('匯出 Excel','Export')}</button></span></div>
    <p class="small" style="margin:4px 0">${L('上面的 今天／本週／本月／今年 和 ◀ ▶ 決定期間。點一個類別只看那一類；點一列可以修改或刪除。','Use the period bar above. Tap a type to filter; tap a row to edit / delete.')}</p>
    <div class="rr-k">${CT.map(c=>`<div data-t="${c[0]}" class="${rrType===c[0]?'on':''}"><b>${M2(amt(by(c[0])))}</b><small>${c[1]} · ${by(c[0]).length} ${L('筆','rows')}</small></div>`).join('')}</div>
    <div class="tw"><table><thead><tr><th>${L('月份','Month')}</th>${CT.map(c=>`<th class="num">${c[1]}</th>`).join('')}<th class="num">${L('合計','Total')}</th></tr></thead><tbody>${months.reverse().map(m=>{const xs=all.filter(x=>String(x.date).startsWith(m));return `<tr><td><b>${m}</b></td>${CT.map(c=>`<td class="num">${M2(amt(xs.filter(x=>typeOf(x)===c[0])))}</td>`).join('')}<td class="num"><b>${M2(amt(xs))}</b></td></tr>`}).join('')}</tbody></table></div></div>`;
  if(rrType)h+=tbl(by(rrType),CTN[rrType][1]);else h+=tbl(by('rental'),CTN.rental[1])+tbl(by('repair'),CTN.repair[1]);
  h+='</div>';const app=document.getElementById('app');app.innerHTML=h;
  app.querySelectorAll('.rr-k [data-t]').forEach(d=>d.onclick=()=>{rrType=rrType===d.dataset.t?'':d.dataset.t;renderRR()});
  app.querySelectorAll('.rr-row').forEach(tr=>tr.onclick=()=>editTx(tr.dataset.id))}
function editTx(id){const x=id?TX().find(t=>t&&t.id===id):null;const o=x||{date:new Date().toISOString().slice(0,10),supplier:'',invoiceNo:'',name:'',qty:1,unit:'',unitPrice:0,amount:0,costType:rrType||'repair',remark:''};
  const f=(k,lb,v,tp)=>`<label>${lb}<input data-k="${k}" type="${tp||'text'}" value="${E(v==null?'':v)}"></label>`;
  const el=modal(`<div class="ps-hd"><b>${x?'✎ '+L('修改','Edit'):'＋ '+L('新增','Add')}</b><button class="ps-btn" data-x>✕</button></div><div class="ps-bd"><div class="ps-f">${f('date',L('日期','Date'),o.date,'date')}${f('supplier',L('供應商','Supplier'),o.supplier)}${f('invoiceNo',L('單號','Invoice'),o.invoiceNo)}${f('name',L('品名／機台','Item / machine'),o.name||o.partNo)}${f('qty',L('數量','Qty'),o.qty,'number')}${f('unit',L('單位','Unit'),o.unit)}${f('unitPrice',L('單價','Unit price'),o.unitPrice,'number')}${f('amount',L('金額','Amount'),purchaseAmount(o),'number')}
   <label>${L('類別','Type')}<select data-k="costType">${CT.map(c=>`<option value="${c[0]}" ${c[0]===typeOf(o)?'selected':''}>${c[1]}</option>`).join('')}</select></label>${f('remark',L('備註','Note'),o.remark)}</div>${o.accNote?`<p><span class="ps-tag warn">${E(o.accNote)}</span></p>`:''}${o.sourceFile?`<p class="small">${L('來源','Source')}：${E(o.sourceFile)}</p>`:''}</div>
   <div class="ps-ft"><span class="sum"></span>${x?`<button class="ps-btn" data-del style="color:#b91c1c">🗑 ${L('刪除','Delete')}</button>`:''}<button class="ps-btn" data-x>${L('取消','Cancel')}</button><button class="ps-btn y" data-ok>✅ ${L('儲存','Save')}</button></div>`);
  const v=k=>el.querySelector('[data-k="'+k+'"]').value.trim();el.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>el.remove());
  el.querySelector('[data-k="name"]').addEventListener('change',e=>{el.querySelector('[data-k="costType"]').value=classify(e.target.value)});
  const del=el.querySelector('[data-del]');if(del)del.onclick=async()=>{let ok=true;try{ok=await VRTDialog.confirm(L('刪除這一筆？','Delete this row?'))}catch(_){ok=confirm('Delete?')}if(!ok)return;setTX(TX().filter(t=>t&&t.id!==id));el.remove();await persist()};
  el.querySelector('[data-ok]').onclick=async()=>{const now=new Date().toISOString(),t=v('costType');const n=Object.assign(x||{id:'MAN-'+hash(now+Math.random()),type:'PURCHASE',source:'manual',createdAt:now},{date:v('date'),invoiceDate:v('date'),statementMonth:v('date').slice(0,7),supplier:v('supplier'),invoiceNo:v('invoiceNo'),name:v('name'),partNo:v('name'),qty:N(v('qty'))||0,unit:v('unit'),unitPrice:N(v('unitPrice'))||0,amount:N(v('amount'))||0,costType:t,category:catOf(t),includeInMaster:t!=='rental'&&t!=='repair',remark:v('remark'),updatedAt:now});
    if(!x)setTX(TX().concat([n]));el.remove();await persist()}}
function exportRows(rows,name){if(!g.XLSX)return toastX('XLSX missing');const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{}]),'Purchases');XLSX.writeFile(wb,name)}
function exportPeriod(){const cur=rows().filter(x=>{try{return inDateRange(x.date)}catch(_){return true}}).filter(x=>!rrType||typeOf(x)===rrType);
  exportRows(cur.map(x=>({Type:CTN[typeOf(x)][2],'類別':CTN[typeOf(x)][1],Date:x.date,Month:x.statementMonth||String(x.date).slice(0,7),Supplier:x.supplier,Invoice:x.invoiceNo,Item:x.name||x.partNo,Qty:x.qty,Unit:x.unit,'Unit Price':x.unitPrice,Amount:purchaseAmount(x),'Accounting voucher':x.acc&&x.acc.voucher||'','Accounting amount':x.acc&&x.acc.amount!=null?x.acc.amount:'','Accounting note':x.accNote||'',Note:x.remark||'',Source:x.source||'',File:x.sourceFile||''})),'Rental_Repair_Parts_'+new Date().toISOString().slice(0,10)+'.xlsx')}
function fileInput(){let i=document.getElementById('psFile');if(!i){i=document.createElement('input');i.type='file';i.id='psFile';i.accept='.pdf,image/*';i.multiple=true;i.style.display='none';i.setAttribute('aria-label','對帳單 PDF／照片');i.onchange=()=>{const fs=[...i.files];i.value='';open(fs)};document.body.appendChild(i)}return i}
function pick(){fileInput().click()}

/* ── 掛到頁面上 ── */
function init(){css();fileInput();
  const bar=document.getElementById('tabBar');if(bar&&!bar.querySelector('[data-rr]')){const t=document.createElement('div');t.className='tab';t.dataset.rr='1';t.setAttribute('onclick',"goTab('rentrepair',this)");t.textContent='🛠️ '+L('租機／修理','Rental / repair');const ref=[...bar.children].find(x=>/'price'/.test(x.getAttribute('onclick')||''));if(ref)ref.after(t);else bar.appendChild(t)}
  try{const prev=renderTab;if(!prev.__rr){const fn=function(n){if(n==='rentrepair'){try{syncGlobalPeriodUi43()}catch(_){}return renderRR()}return prev.apply(this,arguments)};fn.__rr=1;renderTab=fn}}catch(e){console.warn('[VRTPartsStmt] renderTab',e)}
  /* 會計 Excel：匯入時先看是不是會計發票表 */
  try{const pi=importExcel;if(!pi.__acc){const fn=async function(file){try{if(file&&/\.(xlsx|xls|xlsm)$/i.test(file.name)&&g.XLSX){const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});const rs=accSheets(wb);if(rs.length)return importAcc(file,rs)}}catch(e){console.warn('[VRTPartsStmt] acc',e)}return pi.apply(this,arguments)};fn.__acc=1;importExcel=fn}}catch(e){console.warn('[VRTPartsStmt] importExcel',e)}
  /* PDF／照片：先當對帳單讀，讀不到表格才進 🤖 智慧OCR */
  try{const po=ocrFiles;if(!po.__st){ORIG_OCR=po;const fn=function(files){const fs=[...files||[]];if(fs.length)return open(fs);return po.apply(this,arguments)};fn.__st=1;ocrFiles=fn}}catch(e){console.warn('[VRTPartsStmt] ocrFiles',e)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,400));else setTimeout(init,400);
g.VRTPartsStmt={version:'1.0.0',open,readFile,grid,classify,importAcc,accSheets,renderRR,pick,add:()=>editTx(null),exportPeriod,saveStatement};
})(window);
