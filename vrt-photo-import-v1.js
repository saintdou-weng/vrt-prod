/* VRT 照片對照表匯入 v1.0（2026-11-14）
   Paul 11/14：同事把「瑕疵對照表／零件示意圖」做成 Excel、JPG 或 PDF（一列＝編號＋照片＋名稱），要能直接匯入，
   每一列的照片自動放到對應物品的 ⭐ 標準照（或本月異常）。
   ・Excel：直接讀檔案裡的圖片＋同一列的文字（不用另外裝程式；支援浮動圖片與「放在儲存格內」的圖片）。
   ・PDF：每頁畫出來 → 找表格線切出每一列 → 文字直接讀 PDF 的文字層（掃描檔才用 OCR）。
   ・JPG／PNG：找表格線切出每一列的照片 → 名稱用 OCR（Tesseract，第一次會下載，之後有快取）。
   匯入前一定先列出「每一列 → 對到哪個物品」給人確認，可改、可不勾；同一張照片不會重複存。 */
(function(g){
'use strict';
if(g.VRTPhotoImport)return;
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CDN={pdf:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',pdfw:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',ocr:'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js'};
const loaded={};function script(u){return loaded[u]||(loaded[u]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=u;s.onload=res;s.onerror=()=>{delete loaded[u];rej(new Error('下載元件失敗（要連網）：'+u.split('/').pop()))};document.head.appendChild(s)}))}

/* ── ZIP（xlsx）：瀏覽器內建解壓，不用外掛 ── */
async function unzip(buf){const dv=new DataView(buf);let eo=-1;for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-70000);i--){if(dv.getUint32(i,true)===0x06054b50){eo=i;break}}if(eo<0)throw new Error('不是 xlsx 檔');
  const n=dv.getUint16(eo+10,true);let p=dv.getUint32(eo+16,true);const F={};const td=new TextDecoder();
  for(let k=0;k<n;k++){if(dv.getUint32(p,true)!==0x02014b50)break;const m=dv.getUint16(p+10,true),cs=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);F[td.decode(new Uint8Array(buf,p+46,nl))]={m,cs,lo};p+=46+nl+el+cl}
  const get=async name=>{const f=F[name];if(!f)return null;const a=dv.getUint16(f.lo+26,true),b=dv.getUint16(f.lo+28,true);const d=new Uint8Array(buf,f.lo+30+a+b,f.cs);if(f.m===0)return d.slice();const out=await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();return new Uint8Array(out)};
  return {names:Object.keys(F),get,text:async n=>{const u=await get(n);return u?td.decode(u):''}}}
const xml=s=>new DOMParser().parseFromString(s||'<x/>','application/xml');
const byLocal=(node,name)=>[...node.getElementsByTagNameNS('*',name)];
const resolve=(base,t)=>{if(t.startsWith('/'))return t.slice(1);const p=base.split('/');p.pop();t.split('/').forEach(s=>{if(s==='..')p.pop();else if(s!=='.')p.push(s)});return p.join('/')};
const relsOf=async(z,path)=>{const p=path.split('/'),f=p.pop();const doc=xml(await z.text(p.concat(['_rels',f+'.rels']).join('/')));const o={};byLocal(doc,'Relationship').forEach(r=>o[r.getAttribute('Id')]={t:resolve(path,r.getAttribute('Target')),type:r.getAttribute('Type')||''});return o};
const rAttr=el=>{for(const a of el.attributes)if(/(^|:)(embed|id)$/.test(a.name)&&/^rId/.test(a.value))return a.value;return ''};
const colNum=ref=>{const m=String(ref).match(/^([A-Z]+)(\d+)/);if(!m)return [0,0];let c=0;for(const ch of m[1])c=c*26+ch.charCodeAt(0)-64;return [c-1,+m[2]-1]};
const mimeOf=n=>/\.png$/i.test(n)?'image/png':/\.gif$/i.test(n)?'image/gif':/\.(jpe?g)$/i.test(n)?'image/jpeg':/\.bmp$/i.test(n)?'image/bmp':/\.webp$/i.test(n)?'image/webp':'';
async function readXlsx(file,log){const z=await unzip(await file.arrayBuffer());const out=[];
  const ss=[];const sdoc=xml(await z.text('xl/sharedStrings.xml'));byLocal(sdoc,'si').forEach(si=>ss.push(byLocal(si,'t').map(t=>t.textContent).join('')));
  const wb=xml(await z.text('xl/workbook.xml')),wrel=await relsOf(z,'xl/workbook.xml');
  /* 放在儲存格內的圖片（Excel 新功能）：vm → richValue → rel → media */
  let rvRel=[],rv=[];try{const rr=await relsOf(z,'xl/richData/richValueRel.xml');rvRel=byLocal(xml(await z.text('xl/richData/richValueRel.xml')),'rel').map(r=>(rr[rAttr(r)]||{}).t);rv=byLocal(xml(await z.text('xl/richData/rdrichvalue.xml')),'rv').map(x=>{const v=byLocal(x,'v')[0];return v?+v.textContent:-1})}catch(_){}
  for(const sh of byLocal(wb,'sheet')){const rel=wrel[rAttr(sh)];if(!rel)continue;const path=rel.t,doc=xml(await z.text(path));const rows=new Map();const inCell=[];
    byLocal(doc,'c').forEach(c=>{const [col,row]=colNum(c.getAttribute('r'));const t=c.getAttribute('t');let v='';if(t==='s'){const x=byLocal(c,'v')[0];v=x?ss[+x.textContent]||'':''}else if(t==='inlineStr'){v=byLocal(c,'t').map(x=>x.textContent).join('')}else{const x=byLocal(c,'v')[0];v=x?x.textContent:''}
      const vm=c.getAttribute('vm');if(vm&&rv.length){const ri=rv[+vm-1];const media=rvRel[ri];if(media)inCell.push({media,row,col});v=''}
      if(String(v).trim()){if(!rows.has(row))rows.set(row,[]);rows.get(row).push([col,String(v).trim()])}});
    const textRows=(r0,r1,skipCol)=>{const a=[];for(let r=r0;r<=r1;r++)(rows.get(r)||[]).filter(x=>x[0]!==skipCol).sort((x,y)=>x[0]-y[0]).forEach(x=>a.push(x[1]));return a};
    const imgs=[];const srel=await relsOf(z,path);
    for(const id of Object.keys(srel)){if(!/drawing$/.test(srel[id].type))continue;const dpath=srel[id].t,ddoc=xml(await z.text(dpath)),drel=await relsOf(z,dpath);
      [...byLocal(ddoc,'twoCellAnchor'),...byLocal(ddoc,'oneCellAnchor')].forEach(a=>{const fr=byLocal(a,'from')[0],to=byLocal(a,'to')[0];const blip=byLocal(a,'blip')[0];if(!fr||!blip)return;const rid=rAttr(blip);const m=drel[rid];if(!m)return;
        const num=(el,n)=>{const x=el&&byLocal(el,n)[0];return x?+x.textContent:null};const r0=num(fr,'row'),c0=num(fr,'col');let r1=to?num(to,'row'):r0;const rOff=to?num(to,'rowOff'):0;if(r1>r0&&rOff===0)r1--;imgs.push({media:m.t,row:r0,row2:Math.max(r0,r1),col:c0})})}
    inCell.forEach(x=>imgs.push({media:x.media,row:x.row,row2:x.row,col:x.col}));
    for(const im of imgs.sort((a,b)=>a.row-b.row)){const bytes=await z.get(im.media);if(!bytes)continue;const mime=mimeOf(im.media);if(!mime){log('略過（不支援的圖檔格式）'+im.media);continue}
      const texts=textRows(im.row,im.row2,im.col);out.push({blob:new Blob([bytes],{type:mime}),texts,src:file.name+' · '+sh.getAttribute('name')+' 第 '+(im.row+1)+' 列'})}}
  if(!out.length)log(file.name+'：沒有找到圖片（請確認照片是貼在 Excel 裡，不是連結）');return out}

/* ── 圖片表格：找表格線 → 每一列切出照片 ── */
function gridCut(canvas){const W=canvas.width,H=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true}),d=ctx.getImageData(0,0,W,H).data;const L=(x,y)=>{const i=(y*W+x)*4;return d[i]*.299+d[i+1]*.587+d[i+2]*.114};
  const step=Math.max(1,Math.floor(W/600));
  const rowDark=[];for(let y=0;y<H;y++){let n=0,t=0;for(let x=0;x<W;x+=step){t++;if(L(x,y)<95)n++}rowDark.push(n/t)}
  const bands=(arr,th,minGap)=>{const seps=[];let s=-1;arr.forEach((v,i)=>{if(v>=th){if(s<0)s=i}else if(s>=0){seps.push([s,i-1]);s=-1}});if(s>=0)seps.push([s,arr.length-1]);const cells=[];for(let k=0;k<seps.length-1;k++){const a=seps[k][1]+1,b=seps[k+1][0]-1;if(b-a>=minGap)cells.push([a,b])}return cells};
  const rows=bands(rowDark,.7,Math.max(24,H*.03));if(rows.length<2)return null;
  const y0=rows[0][0],y1=rows[rows.length-1][1];const colDark=[];for(let x=0;x<W;x++){let n=0,t=0;for(let y=y0;y<=y1;y+=step){t++;if(L(x,y)<95)n++}colDark.push(n/t)}
  let cols=bands(colDark,.6,Math.max(20,W*.04));if(!cols.length)cols=[[0,W-1]];
  /* 照片欄＝中間色調比例最高的那一欄 */
  const busy=(x0,x1,ya,yb)=>{let n=0,t=0;const ix=Math.max(2,Math.floor((x1-x0)*.06)),iy=Math.max(2,Math.floor((yb-ya)*.08));for(let y=ya+iy;y<=yb-iy;y+=step)for(let x=x0+ix;x<=x1-ix;x+=step){t++;const v=L(x,y);if(v>35&&v<215)n++}return t?n/t:0};
  const score=cols.map(c=>rows.reduce((s,r)=>s+busy(c[0],c[1],r[0],r[1]),0)/rows.length);const pc=score.indexOf(Math.max(...score));
  const navy=(x0,x1,ya,yb)=>{let n=0,t=0;for(let y=ya;y<=yb;y+=step*2)for(let x=x0;x<=x1;x+=step*2){const i=(y*W+x)*4;t++;if(d[i+2]>d[i]+35&&L(x,y)<120)n++}return t?n/t:0};
  const mean=(x0,x1,ya,yb)=>{let s2=0,t=0;for(let y=ya;y<=yb;y+=step*2)for(let x=x0;x<=x1;x+=step*2){s2+=L(x,y);t++}return t?s2/t:255};
  return rows.map(r=>({y0:r[0],y1:r[1],photo:cols[pc],busy:busy(cols[pc][0],cols[pc][1],r[0],r[1]),lum:mean(cols[pc][0],cols[pc][1],r[0],r[1]),nv:navy(cols[pc][0],cols[pc][1],r[0],r[1]),texts:cols.filter((_,i)=>i!==pc)})).filter(r=>r.busy>.12&&r.lum>75&&r.nv<.3)}/* 深色標題列（白字藍底）不是照片 */
function crop(canvas,x0,y0,x1,y1,pad){const c=document.createElement('canvas');const p=pad||0;c.width=Math.max(1,x1-x0-2*p);c.height=Math.max(1,y1-y0-2*p);c.getContext('2d').drawImage(canvas,x0+p,y0+p,c.width,c.height,0,0,c.width,c.height);return c}
const toBlob=c=>new Promise(r=>c.toBlob(r,'image/jpeg',.9));
let ocrWorker=null;
async function ocr(canvas,log){try{await script(CDN.ocr);if(!ocrWorker){log('⏳ 第一次用文字辨識，下載中（約 10 MB，之後有快取）…');ocrWorker=await g.Tesseract.createWorker('eng')}const big=document.createElement('canvas');big.width=canvas.width*2;big.height=canvas.height*2;big.getContext('2d').drawImage(canvas,0,0,big.width,big.height);const r=await ocrWorker.recognize(big);return String(r.data.text||'').replace(/\s+/g,' ').trim()}catch(e){log('⚠️ 文字辨識不能用：'+(e.message||e)+'（名稱請在下表自己選）');return ''}}
async function rowsFromCanvas(canvas,src,log,textAt){const g2=gridCut(canvas);if(!g2||!g2.length){return [{blob:await toBlob(canvas),texts:[],src:src+'（整張，找不到表格線）'}]}
  const out=[];for(const r of g2){const pc=crop(canvas,r.photo[0],r.y0,r.photo[1],r.y1,3);const texts=[];
    for(const tc of r.texts){let t=textAt?textAt(tc[0],r.y0,tc[1],r.y1):'';if(!t)t=await ocr(crop(canvas,tc[0],r.y0,tc[1],r.y1,2),log);if(t)texts.push(t)}
    out.push({blob:await toBlob(pc),texts,src:src+' 第 '+(out.length+1)+' 列'})}log(src+'：切出 '+out.length+' 列');return out}
async function readImage(file,log){const u=URL.createObjectURL(file);try{const im=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('圖片讀不到'));i.src=u});const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);return rowsFromCanvas(c,file.name,log)}finally{setTimeout(()=>URL.revokeObjectURL(u),3000)}}
async function readPdf(file,log){await script(CDN.pdf);const lib=g.pdfjsLib;lib.GlobalWorkerOptions.workerSrc=CDN.pdfw;const pdf=await lib.getDocument({data:await file.arrayBuffer()}).promise;const out=[];
  for(let p=1;p<=Math.min(pdf.numPages,30);p++){const page=await pdf.getPage(p);const vp=page.getViewport({scale:2});const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await page.render({canvasContext:x,viewport:vp}).promise;
    const tc=await page.getTextContent();const items=tc.items.map(it=>{const [a,b]=vp.convertToViewportPoint(it.transform[4],it.transform[5]);return {x:a,y:b,s:it.str}}).filter(i=>i.s.trim());
    const textAt=items.length?(x0,y0,x1,y1)=>items.filter(i=>i.x>=x0-2&&i.x<=x1&&i.y>=y0&&i.y<=y1+4).sort((a,b)=>a.y-b.y||a.x-b.x).map(i=>i.s).join(' ').replace(/\s+/g,' ').trim():null;
    (await rowsFromCanvas(c,file.name+' p'+p,log,textAt)).forEach(r=>out.push(r))}return out}

/* ── 名稱對物品（編號一樣最優先，再比英文字、中文字）── */
const words=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9㐀-鿿]+/g,' ').split(' ').filter(w=>w.length>1||/[㐀-鿿]/.test(w));
const cjk=s=>{const a=String(s||'').replace(/[^㐀-鿿]/g,'');const o=new Set();for(let i=0;i<a.length-1;i++)o.add(a.slice(i,i+2));return o};
function parseRow(texts){const all=texts.join(' | ');const no=(texts.map(t=>t.trim()).find(t=>/^\d{1,3}$/.test(t))||(all.match(/^\s*(\d{1,3})\b/)||[])[1]||'');
  const name=texts.filter(t=>!/^\d{1,3}$/.test(t.trim())).join(' ').replace(/\s+/g,' ').trim();return {no,name,all}}
const GENERIC=new Set(['STITCH','STITCHES','SEAM','NEEDLE','NEEDLES','FOR','THE','AND','OR','OF','PART','PARTS','SEWING','MACHINE','SINGLE','DOUBLE','DEFECT','FROM','WITH']);
function score(row,it){let s=0,dist=0;if(row.no&&it.code&&String(it.code).trim()===row.no)s+=3;const A=new Set(words(row.name)),B=words(it.name+' '+(it.alt||'')+' '+it.key);let hit=0;const AA=[...A],has=w=>A.has(w)||(w.length>=4&&AA.some(x=>x.length>=4&&(x.startsWith(w)||w.startsWith(x))));new Set(B).forEach(w=>{if(has(w)){hit++;if(!GENERIC.has(w))dist++}});s+=hit/Math.max(1,Math.min(A.size,new Set(B).size||1))*2;
  const ca=cjk(row.name),cb=cjk(it.name+' '+(it.alt||''));if(ca.size&&cb.size){let h=0;ca.forEach(x=>{if(cb.has(x))h++});s+=h/Math.min(ca.size,cb.size)*2;if(h)dist++}return dist||s>=3?s:0}
const guessDomain=t=>{const s=String(t).toUpperCase();if(/STITCH|SEAM|PUCKER|TRIM|RAW EDGE|LABEL|STAIN|HOLE|SHADE|瑕疵|跳針|漏針/.test(s))return 'defect';if(/NEEDLE\b|機針|縫紉機針/.test(s)&&!/PLATE|針板/.test(s))return 'needle';if(/HOOK|FEED DOG|PLATE|KNIFE|BLADE|LOOPER|SPRING|旋梭|送布牙|針板|刀/.test(s))return 'parts';if(/FABRIC|TWILL|JERSEY|布/.test(s))return 'fabric';return ''};

/* ── 畫面 ── */
function open(opt){opt=opt||{};const P=g.VRTPhotos;if(!P)return;const DOMS=P.DOMAINS;let dom=opt.domain||'defect',rows=[],items=[],slot='ref';
  const el=document.createElement('div');el.className='vp-lib';el.style.zIndex=9997;document.body.appendChild(el);
  el.innerHTML=`<div class="vp-lib-box"><div class="vp-lib-hd"><span style="font-size:20px">📥</span><b>匯入照片對照表 Import photo chart</b><button class="vp-btn ghost" data-a="x">✕</button></div><div class="vp-lib-body"><div class="vp" id="piBody"></div></div></div>`;
  el.addEventListener('click',e=>{if(e.target===el||e.target.closest('[data-a=x]'))el.remove()});const B=el.querySelector('#piBody');let logs=[];const log=m=>{logs.push(m);const l=B.querySelector('#piLog');if(l)l.innerHTML=logs.slice(-6).map(E).join('<br>')};
  const loadItems=async()=>{items=[];try{items=opt.items?await opt.items(dom)||[]:[]}catch(_){items=[]}};
  function best(r){let b=null,bs=0;items.forEach(it=>{const s=score(r,it);if(s>bs){bs=s;b=it}});return bs>=1.2?b:null}
  function paint(){const dsel=DOMS.map(d=>`<option value="${d[0]}" ${d[0]===dom?'selected':''}>${d[1]} ${E(d[2])}</option>`).join('');
    B.innerHTML=`<div class="vp-sec"><div class="vp-h"><b>1️⃣ 選檔案</b><span class="vp-n">Excel／PDF／JPG／PNG，一列＝編號＋照片＋名稱（像瑕疵對照表、零件示意圖）</span></div>
      <div class="vp-h"><label class="vp-btn">📂 選檔案 Choose files<input type="file" multiple accept=".xlsx,.xlsm,.pdf,image/*" id="piFile"></label>
       <span>放到：</span><select class="vp-in" id="piDom">${dsel}</select>
       <select class="vp-in" id="piSlot"><option value="ref" ${slot==='ref'?'selected':''}>⭐ 標準照 Standard</option><option value="month" ${slot==='month'?'selected':''}>⚠️ 本月異常 This month</option></select></div>
      <div class="vp-st busy" id="piLog" style="${logs.length?'':'display:none'}">${logs.slice(-6).map(E).join('<br>')}</div></div>
     ${rows.length?`<div class="vp-sec"><div class="vp-h"><b>2️⃣ 核對：每一列對到哪個${E((DOMS.find(d=>d[0]===dom)||[])[2]||'')}</b><span class="vp-n">${rows.filter(r=>r.on&&(r.match||r.newName)).length}／${rows.length} 列會匯入 · 綠＝自動對到，黃＝新的名稱，紅＝還沒有名稱（不會匯入）</span><span class="vp-sp"></span><button class="vp-btn" id="piGo">✅ 匯入 ${rows.filter(r=>r.on&&(r.match||r.newName)).length} 張</button></div>
      <div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:12px">${rows.map((r,i)=>`<tr style="border-top:1px solid var(--vp-line);background:${!r.on?'transparent':r.match?'rgba(16,185,129,.08)':r.newName?'rgba(245,158,11,.10)':'rgba(239,68,68,.10)'}">
        <td style="padding:6px"><input type="checkbox" data-on="${i}" ${r.on?'checked':''}></td><td style="padding:6px"><img src="${r.url}" style="width:88px;height:66px;object-fit:cover;border-radius:8px;display:block"></td>
        <td style="padding:6px;min-width:150px"><b>${E(r.p.no?'#'+r.p.no+' ':'')}${E(r.p.name||'（沒讀到文字）')}</b><div style="color:var(--vp-mut);font-size:10.5px">${E(r.src)}</div></td>
        <td style="padding:6px;min-width:200px"><select class="vp-in" data-m="${i}" style="max-width:260px"><option value="">${r.newName?'🆕 新的：'+E(r.newName):'👉 請選一個，或在下面打名稱'}</option>${items.map((it,k)=>`<option value="${k}" ${r.match===it?'selected':''}>${E(it.name)}${it.key!==it.name?' · '+E(it.key):''}</option>`).join('')}</select>
         ${r.match?'':`<input class="vp-in" data-n="${i}" value="${E(r.newName||'')}" placeholder="打名稱 Type a name" style="display:block;margin-top:4px;width:100%;max-width:260px">`}</td></tr>`).join('')}</table></div></div>`:''}`;
    B.querySelector('#piDom').onchange=async e=>{dom=e.target.value;await loadItems();rows.forEach(r=>{r.match=best(r.p)});paint()};
    B.querySelector('#piSlot').onchange=e=>{slot=e.target.value};
    B.querySelector('#piFile').onchange=async e=>{const files=[...e.target.files];if(!files.length)return;logs=[];rows=[];paint();
      for(const f of files){log('⏳ 讀取 '+f.name+' …');try{const rs=/\.xls[xm]$/i.test(f.name)?await readXlsx(f,log):/\.pdf$/i.test(f.name)||f.type==='application/pdf'?await readPdf(f,log):await readImage(f,log);
        rs.forEach(r=>{const p=parseRow(r.texts);rows.push({blob:r.blob,url:URL.createObjectURL(r.blob),p,src:r.src,on:true,newName:p.name||''})})}catch(err){log('⚠️ '+f.name+'：'+(err.message||err))}}
      {const gd=guessDomain(rows.map(r=>r.p.all).join(' '));if(gd&&gd!==dom){dom=gd;log('自動判斷是「'+(DOMS.find(d=>d[0]===gd)||[])[2]+'」，可在上面改')}}
      await loadItems();rows.forEach(r=>{r.match=best(r.p)});log('✅ 共 '+rows.length+' 列，自動對到 '+rows.filter(r=>r.match).length+' 列，請核對後按匯入');paint()};
    B.querySelectorAll('[data-on]').forEach(c=>c.onchange=()=>{rows[+c.dataset.on].on=c.checked;paint()});
    B.querySelectorAll('[data-m]').forEach(s=>s.onchange=()=>{const r=rows[+s.dataset.m];r.match=s.value===''?null:items[+s.value];paint()});
    B.querySelectorAll('[data-n]').forEach(t=>{t.oninput=()=>{rows[+t.dataset.n].newName=t.value};t.onchange=()=>paint()});
    const go=B.querySelector('#piGo');go&&(go.onclick=async()=>{go.disabled=true;let add=0,dup=0,skip=0;
      for(const r of rows.filter(x=>x.on)){const key=r.match?r.match.key:String(r.newName||'').trim();if(!key){skip++;continue}const name=r.match?r.match.name:key;
        const f=new File([r.blob],(key.replace(/[^\w.-]+/g,'_')||'photo')+'.jpg',{type:r.blob.type||'image/jpeg'});
        try{const x=await P.add([f],{domain:dom,key,name,slot,caption:[r.p.no?'#'+r.p.no:'',r.p.name].filter(Boolean).join(' ').slice(0,200)});add+=x.added;dup+=x.dup}catch(_){skip++}}
      logs=[`✅ 匯入 ${add} 張${dup?` · 重複略過 ${dup}`:''}${skip?` · 沒名稱略過 ${skip}`:''}；照片會自動上傳雲端。`];rows=[];paint();opt.onDone&&opt.onDone()})}
  paint();loadItems()}
g.VRTPhotoImport={version:'1.0.0',open,readXlsx,gridCut,parseRow,score};
})(window);
