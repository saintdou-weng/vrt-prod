/* VRT PROD · ERP link core v1.0 (2026-10-05) — pure logic for vrt_erp_link_v1.html (no DOM, no storage; runs in Node for tests)
   Scope = 規格書階段 1 最小可用連結:
     · parse / map / normalise manually imported ERP export files (orders W_COD700-style lines, shipments W_CBL300-style lines)
     · idempotent merge (same file / renamed file / partial file never inflates or deletes; corrections keep the old version)
     · read-only comparison ERP orders ↔ PROD orders / production plan / sewing / shipping schedule and ERP shipments ↔ PROD shipping
       with the six states of 規格書 §9 (相符 / 有差異 / 可能時間差 / 缺來源或未齊 / 無法唯一對應 / 不可直接比較)
     · fixed-period daily report draft (規格書 §10.3 / §11.3 template; missing sections stay "未取得／未齊／不適用")
   Nothing here writes to the ERP, to PROD module stores or to the cloud. Keys are matched, never guessed:
   confirmed crosswalk → ERP my_no ⇄ PROD selfKey (sewing.selfKey / shipping.erp) → unique PO+style+colour; anything else = 無法唯一對應. */
(function(g){'use strict';
  if(g.VRTErpLink)return;
  const VERSION='1.0.0',PARSER_VERSION='erplink-parser-1.0',MAPPING_VERSION=1;
  /* ── helpers ── */
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const N=n=>{const v=Number(n||0);return (Number.isInteger(v)?v:Math.round(v*10)/10).toLocaleString('en-US')};
  const pct=(v,d)=>v==null||!isFinite(v)?'—':Number(v).toFixed(d==null?1:d)+'%';
  const nk=s=>String(s==null?'':s).trim().replace(/\s+/g,' ').toUpperCase();          // reversible normalisation only (raw value is always kept)
  const raw=s=>s==null?'':String(s).replace(/\r?\n/g,' ').trim();
  function fnv(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return ('00000000'+(h>>>0).toString(16)).slice(-8)}
  function hash32(str){return fnv(str)+fnv(str.split('').reverse().join(''))}
  const MON={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
  const pad=n=>String(n).padStart(2,'0');
  const ymd=(y,m,d)=>{if(!(y>=1990&&y<=2100&&m>=1&&m<=12&&d>=1&&d<=31))return '';return y+'-'+pad(m)+'-'+pad(d)};
  /* parseDate(v, order): order = 'YMD' (default, also ISO / yyyy/mm/dd / yyyymmdd / ROC 1yy/mm/dd) | 'MDY' | 'DMY'; dd-MMM-yy always unambiguous.
     Returns {date:'yyyy-mm-dd', rule} or {date:'', rule:'ambiguous'|'unparsed'|'empty'} — never today, never a guess. */
  function parseDate(v,order){
    if(v instanceof Date&&!isNaN(v))return {date:ymd(v.getFullYear(),v.getMonth()+1,v.getDate()),rule:'date-object'};
    const s=raw(v);if(!s)return {date:'',rule:'empty'};
    let m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);if(m)return {date:ymd(+m[1],+m[2],+m[3]),rule:'ymd'};
    m=s.match(/^(\d{4})(\d{2})(\d{2})$/);if(m)return {date:ymd(+m[1],+m[2],+m[3]),rule:'yyyymmdd'};
    m=s.match(/^(\d{2,3})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);if(m&&+m[1]<1000&&+m[1]>=80)return {date:ymd(+m[1]+1911,+m[2],+m[3]),rule:'roc'};   // 民國年 115/10/05
    m=s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})$/);if(m){const mo=MON[m[2].toUpperCase()];if(mo)return {date:ymd(m[3].length===2?2000+Number(m[3]):Number(m[3]),mo,Number(m[1])),rule:'dd-mmm-yy'}}
    m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
    if(m){const a=+m[1],b=+m[2],y=m[3].length===2?2000+Number(m[3]):Number(m[3]);
      if(order==='MDY')return {date:ymd(y,a,b),rule:'mdy'};if(order==='DMY')return {date:ymd(y,b,a),rule:'dmy'};
      if(a>12&&b<=12)return {date:ymd(y,b,a),rule:'dmy-inferred'};if(b>12&&a<=12)return {date:ymd(y,a,b),rule:'mdy-inferred'};
      return {date:'',rule:'ambiguous'}}
    if(/^\d{5}$/.test(s)){const n=Number(s);if(n>30000&&n<60000){const d=new Date(Date.UTC(1899,11,30)+n*864e5);return {date:ymd(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate()),rule:'excel-serial'}}}
    return {date:'',rule:'unparsed'};
  }
  function parseQty(v){const s=raw(v).replace(/,/g,'');if(s==='')return {qty:null,ok:true,empty:true};const n=Number(s);if(!isFinite(n))return {qty:null,ok:false};return {qty:n,ok:true}}
  /* ── canonical datasets (規格書 §5.1 minimum fields + manual B1/B2 keys). required = must be mapped before commit. ── */
  const FIELDS={
    order_line:[
      {k:'od_no',zh:'ERP 訂單編號',en:'ERP order no.',req:true,alias:['od_no','odno','訂單編號','訂單號','訂單no','order no','order_no','orderno','erp order','製令','od']},
      {k:'od_seq',zh:'序號',en:'Line seq.',alias:['od_seq','odseq','序','序號','seq','line','項次','item']},
      {k:'my_no',zh:'自編單號',en:'Self key',alias:['my_no','myno','自編單號','自編','self key','self_key','selfkey','erp selfkey#','erp selfkey','selfkey#']},
      {k:'cust',zh:'客戶',en:'Customer',alias:['cust','cust_id','客戶','客戶代號','客戶名稱','customer','customer id','custid']},
      {k:'style',zh:'款式',en:'Style',alias:['style','style_id','款式','款號','款式編號','style no','style_no','styleno','品名','product']},
      {k:'clr',zh:'顏色／色號',en:'Colour',alias:['clr','clr_no','顏色','色號','色別','color','colour','color no']},
      {k:'size',zh:'尺寸',en:'Size',alias:['size','尺寸','尺碼','sz']},
      {k:'po_no',zh:'客戶 PO',en:'Customer PO',alias:['po_no','pono','po','客戶po','客戶 po','po no','po#','po number','customer po','訂單po']},
      {k:'order_date',zh:'接單日',en:'Order date',date:true,alias:['order_date','接單日','接單日期','訂單日期','order date','orderdate','日期']},
      {k:'delivery',zh:'交期',en:'Delivery',date:true,alias:['delivery','交期','交貨日','交貨日期','出貨日期','delivery date','due','due date','cancel date','cancel_date','ship date']},
      {k:'qty',zh:'數量',en:'Qty',num:true,req:true,alias:['qty','數量','訂單數量','訂單量','order qty','quantity','pcs','件數']},
      {k:'price',zh:'單價',en:'Unit price',num:true,sensitive:true,alias:['price','單價','unit price','unit_price']},
      {k:'currency',zh:'幣別',en:'Currency',alias:['currency','幣別','curr','幣']},
      {k:'closed',zh:'結案',en:'Closed',alias:['closed','結案','結案狀態','status','狀態','close']},
      {k:'cut_qty',zh:'裁剪累計（ERP）',en:'Cut qty (ERP)',num:true,alias:['cut_qty','裁剪量','裁剪數','cut qty','cutting']},
      {k:'fg_qty',zh:'入庫累計（ERP）',en:'FG in (ERP)',num:true,alias:['fg_qty','入庫量','入庫數','成品入庫','fg qty','stock in']},
      {k:'ship_qty',zh:'出貨累計（ERP）',en:'Shipped (ERP)',num:true,alias:['ship_qty','出貨量','已出貨','shipped','ship qty']},
    ],
    shipment_line:[
      {k:'bl_no',zh:'出貨單號',en:'Shipment no.',req:true,alias:['bl_no','blno','出貨單號','出貨單','shipment no','shipment_no','bl','bl no','invoice no','發票號碼','invoice']},
      {k:'bl_seq',zh:'序號',en:'Line seq.',alias:['bl_seq','blseq','序','序號','seq','line','項次','item']},
      {k:'od_no',zh:'ERP 訂單編號',en:'ERP order no.',alias:['od_no','odno','訂單編號','訂單號','order no','order_no','製令']},
      {k:'my_no',zh:'自編單號',en:'Self key',alias:['my_no','myno','自編單號','自編','self key','self_key','selfkey','erp selfkey#']},
      {k:'cust',zh:'客戶',en:'Customer',alias:['cust','cust_id','客戶','客戶代號','客戶名稱','customer']},
      {k:'po_no',zh:'客戶 PO',en:'Customer PO',alias:['po_no','pono','po','客戶po','po no','po#','customer po']},
      {k:'style',zh:'款式',en:'Style',alias:['style','style_id','款式','款號','style no','品名']},
      {k:'clr',zh:'顏色／色號',en:'Colour',alias:['clr','clr_no','顏色','色號','color','colour']},
      {k:'size',zh:'尺寸',en:'Size',alias:['size','尺寸','尺碼']},
      {k:'qty',zh:'出貨數量',en:'Shipped qty',num:true,req:true,alias:['qty','數量','出貨數量','出貨量','shipped','ship qty','quantity','pcs']},
      {k:'ship_date',zh:'出貨日',en:'Ship date',date:true,req:true,alias:['ship_date','出貨日','出貨日期','ship date','shipdate','etd','on board','日期','date']},
      {k:'invoice',zh:'發票',en:'Invoice',alias:['invoice','發票','發票號碼','inv','inv no']},
      {k:'container',zh:'櫃號',en:'Container',alias:['container','櫃號','貨櫃','cntr']},
      {k:'eta',zh:'ETA',en:'ETA',date:true,alias:['eta']},
      {k:'status',zh:'狀態',en:'Status',alias:['status','狀態']},
    ],
  };
  const DATASET_LABEL={order_line:{zh:'ERP 訂單明細',en:'ERP order lines'},shipment_line:{zh:'ERP 出貨明細',en:'ERP shipment lines'}};
  const KEY_OF={order_line:['od_no','od_seq'],shipment_line:['bl_no','bl_seq']};
  /* ── header signature + auto-suggested mapping (a suggestion only — the user confirms; nothing is committed on a guess) ── */
  function headerSignature(headers){return 'h_'+hash32((headers||[]).map(h=>nk(h)).join('\u0001'))}
  const aliasKey=s=>nk(s).replace(/[\s_\-#.:：／/()（）]/g,'');
  function suggestMapping(headers,dataset){
    const defs=FIELDS[dataset]||[];const out={};const used=new Set();
    const H=(headers||[]).map(h=>aliasKey(h));
    defs.forEach(f=>{let idx=-1;for(const a of f.alias){const ak=aliasKey(a);const i=H.findIndex((h,j)=>!used.has(j)&&h===ak);if(i>=0){idx=i;break}}
      if(idx<0)for(const a of f.alias){const ak=aliasKey(a);if(ak.length<3)continue;const i=H.findIndex((h,j)=>!used.has(j)&&h.includes(ak));if(i>=0){idx=i;break}}
      if(idx>=0){out[f.k]=idx;used.add(idx)}else out[f.k]=null});
    return out;
  }
  function detectDataset(headers){const H=(headers||[]).map(aliasKey).join('|');let o=0,s=0;
    for(const a of ['odno','訂單編號','orderno','製令','myno','自編單號','交期','delivery','訂單量'])if(H.includes(aliasKey(a)))o++;
    for(const a of ['blno','出貨單號','shipmentno','invoice','發票','container','櫃號','出貨日','shipdate','etd'])if(H.includes(aliasKey(a)))s++;
    if(!o&&!s)return {dataset:null,confidence:0,hints:{order:o,ship:s}};
    return {dataset:s>o?'shipment_line':'order_line',confidence:Math.min(1,Math.max(o,s)/4),hints:{order:o,ship:s}};
  }
  function missingRequired(dataset,map){return (FIELDS[dataset]||[]).filter(f=>f.req&&(map[f.k]==null||map[f.k]<0)).map(f=>f.k)}
  /* ── text parsing: CSV / TSV / ; with quotes; delimiter auto-detected from the header line ── */
  function splitLine(line,d){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(q){if(c==='"'){if(line[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}else if(c==='"')q=true;else if(c===d){out.push(cur);cur=''}else cur+=c}out.push(cur);return out}
  function parseText(text,opts){opts=opts||{};let t=String(text||'');if(t.charCodeAt(0)===0xFEFF)t=t.slice(1);const lines=t.split(/\r\n|\n|\r/).filter(l=>l.trim()!=='');if(!lines.length)return {headers:[],rows:[],delimiter:''};
    const first=lines[0];const d=opts.delimiter||[['\t',(first.match(/\t/g)||[]).length],[',',(first.match(/,/g)||[]).length],[';',(first.match(/;/g)||[]).length],['|',(first.match(/\|/g)||[]).length]].sort((a,b)=>b[1]-a[1])[0][0];
    const headers=splitLine(first,d).map(h=>raw(h));const rows=lines.slice(1).map(l=>splitLine(l,d).map(v=>raw(v)));return {headers,rows,delimiter:d};}
  /* decode an ArrayBuffer: BOM first, then strict UTF-8, then Big5 (clothes.exe exports are often Big5) — reported as `encoding` so the import log can say which rule was used */
  function decodeBytes(buf,forced){const u8=new Uint8Array(buf);const dec=(enc,fatal)=>{try{return new TextDecoder(enc,{fatal:!!fatal}).decode(u8)}catch(_){return null}};
    if(forced&&forced!=='auto'){const t=dec(forced,false);return {text:t==null?'':t,encoding:forced}}
    if(u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF)return {text:dec('utf-8',false),encoding:'utf-8-bom'};
    if(u8[0]===0xFF&&u8[1]===0xFE)return {text:dec('utf-16le',false),encoding:'utf-16le'};
    if(u8[0]===0xFE&&u8[1]===0xFF)return {text:dec('utf-16be',false),encoding:'utf-16be'};
    const t8=dec('utf-8',true);if(t8!=null)return {text:t8,encoding:'utf-8'};
    const b5=dec('big5',false);if(b5!=null)return {text:b5,encoding:'big5'};
    return {text:dec('utf-8',false)||'',encoding:'utf-8-lossy'};}
  /* ── normalise mapped rows into contract records (規格書 §5.1). Raw strings are kept (leading zeros, hyphens, width). ── */
  function normalizeRows(dataset,rows,map,ctx){
    ctx=ctx||{};const defs=FIELDS[dataset]||[];const keyFields=KEY_OF[dataset]||[];const out=[],errors=[];const dateOrder=ctx.dateOrder||'YMD';
    rows.forEach((r,ri)=>{if(!r||r.every(v=>raw(v)===''))return;const rec={source_system:ctx.source_system||'LEGACY_ERP',dataset,data_role:'DETAIL',is_demo:!!ctx.is_demo,parser_version:PARSER_VERSION,mapping_version:ctx.mapping_version||MAPPING_VERSION,mapping_id:ctx.mapping_id||'',source_file:ctx.source_file||'',source_sheet:ctx.source_sheet||'',source_row:ri+2,file_hash:ctx.file_hash||'',import_batch_id:ctx.import_batch_id||'',as_of:ctx.as_of||'',ingested_at:ctx.ingested_at||'',unit:ctx.unit||'pcs',quality:[]};
      const rawv={};defs.forEach(f=>{const i=map[f.k];const v=(i==null||i<0)?null:(r[i]==null?'':r[i]);if(v==null){rec[f.k]=null;return}rawv[f.k]=raw(v);
        if(f.date){const d=parseDate(v,dateOrder);rec[f.k]=d.date||null;rec[f.k+'_raw']=rawv[f.k];rec[f.k+'_rule']=d.rule;if(rawv[f.k]&&!d.date)rec.quality.push('date_'+f.k+'_'+d.rule)}
        else if(f.num){const q=parseQty(v);rec[f.k]=q.qty;rec[f.k+'_raw']=rawv[f.k];if(!q.ok)rec.quality.push('num_'+f.k+'_unparsed')}
        else rec[f.k]=rawv[f.k]});
      const missing=defs.filter(f=>f.req).filter(f=>f.num?rec[f.k]==null:!rec[f.k]);
      if(missing.length){errors.push({row:ri+2,reason:'missing_required:'+missing.map(f=>f.k).join(','),raw:r.slice(0,12)});return}
      if(dataset==='order_line'&&rec.qty!=null&&rec.qty<0)rec.quality.push('qty_negative');
      const kraw=keyFields.map(k=>rec[k]==null?'':String(rec[k]));const seqMissing=keyFields.length>1&&!kraw[1];
      rec.source_business_key=kraw.filter((v,i)=>i===0||v!=='').join('|');if(seqMissing)rec.quality.push('no_line_seq');
      rec.business_date=dataset==='order_line'?(rec.delivery||rec.order_date||null):(rec.ship_date||null);
      rec.canonical_key=rec.my_no?nk(rec.my_no):null;
      const content=defs.map(f=>f.k+'='+(rec[f.k]==null?'':String(rec[f.k]))).join('\u0001');
      rec.row_hash=hash32(content);
      rec.id=dataset+':'+hash32(nk(rec.source_business_key)+(seqMissing?'#'+rec.row_hash:''));   // no line seq → the row content itself is the identity (never collapses two different lines)
      rec.quality_status=rec.quality.length?'review':'ok';
      out.push(rec)});
    return {records:out,errors};
  }
  /* ── idempotent merge: same id + same row_hash = unchanged; changed content = new version (old kept); rows absent from the file are never deleted ── */
  function mergeImport(existing,incoming,ctx){
    ctx=ctx||{};const at=ctx.at||'';const batch=ctx.import_batch_id||'';const byId=new Map((existing||[]).map(r=>[r.id,r]));
    const seen=new Map();const stats={added:0,updated:0,same:0,skippedDup:0,conflict:0};const changes=[];const result=new Map(byId);
    for(const inc of incoming||[]){const prev=seen.get(inc.id);
      if(prev){if(prev.row_hash===inc.row_hash){stats.skippedDup++;continue}stats.conflict++;changes.push({id:inc.id,type:'conflict',key:inc.source_business_key,rows:[prev.source_row,inc.source_row]});continue}
      seen.set(inc.id,inc);const old=result.get(inc.id);
      if(!old){const rec=Object.assign({},inc,{first_batch:batch,first_seen:at,versions:[]});result.set(inc.id,rec);stats.added++;continue}
      if(old.row_hash===inc.row_hash){const rec=Object.assign({},old,{last_seen:at,last_batch:batch,source_file:inc.source_file||old.source_file,as_of:inc.as_of||old.as_of});result.set(inc.id,rec);stats.same++;continue}
      const diff={};for(const k of Object.keys(inc))if(!/^(versions|first_|last_|source_row|source_file|source_sheet|file_hash|import_batch_id|ingested_at|parser_version|mapping_version|mapping_id|quality|quality_status|as_of)/.test(k)&&String(inc[k]==null?'':inc[k])!==String(old[k]==null?'':old[k]))diff[k]={from:old[k]==null?null:old[k],to:inc[k]==null?null:inc[k]};
      const snapshot={};for(const k of Object.keys(diff))snapshot[k]=old[k];
      const rec=Object.assign({},old,inc,{first_batch:old.first_batch,first_seen:old.first_seen,last_seen:at,last_batch:batch,versions:(old.versions||[]).concat([{at,batch,row_hash:old.row_hash,fields:snapshot}])});
      result.set(inc.id,rec);stats.updated++;changes.push({id:inc.id,type:'update',key:inc.source_business_key,diff});}
    return {records:[...result.values()],stats,changes};
  }
  async function fileHash(data){let bytes;if(typeof data==='string')bytes=new TextEncoder().encode(data);else bytes=new Uint8Array(data);
    try{if(g.crypto&&g.crypto.subtle){const b=await g.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')}}catch(_){}
    let s='';for(let i=0;i<bytes.length;i+=1)s+=String.fromCharCode(bytes[i]);return 'fnv:'+hash32(s)+':'+bytes.length}
  /* ── states (規格書 §9) ── */
  const STATES={match:{zh:'相符',en:'Match',cls:'ok'},diff:{zh:'有差異',en:'Difference',cls:'bad'},timing:{zh:'可能時間差',en:'Possible timing gap',cls:'warn'},missing:{zh:'缺來源或未齊',en:'Source missing / incomplete',cls:'warn'},ambiguous:{zh:'無法唯一對應',en:'Not uniquely matched',cls:'na'},incomparable:{zh:'不可直接比較',en:'Not directly comparable',cls:'na'}};
  const ORDER=['diff','timing','missing','ambiguous','incomparable','match'];
  /* ── PROD side aggregation (same granularity on both sides before any join; never multiply) ── */
  const cko=(po,style,clr)=>nk(po)+'|'+nk(style)+'|'+nk(clr);
  function aggProd(prod){
    prod=prod||{};const bySelf={},byCombo={};const add=(m,k,fn)=>{if(!k||k==='||')return;const o=m[k]=m[k]||{sewn:0,sewnRows:0,sewnLatest:'',cutLatest:'',plan:{sewingQty:0,orderQty:new Set(),rows:0,cust:new Set(),lines:new Set()},po:{qty:0,lines:0,cust:new Set(),cancel:''},ship:{orig:0,shipped:0,open:0,rows:0,etd:'',saved:''},selfKeys:new Set()};fn(o)};
    (prod.sewing||[]).forEach(r=>{const p=Number(r.pieces)||0;const d=String(r.date||'').slice(0,10);const f=o=>{o.sewn+=p;o.sewnRows++;if(d>o.sewnLatest)o.sewnLatest=d;if(r.selfKey)o.selfKeys.add(nk(r.selfKey))};
      if(r.selfKey)add(bySelf,nk(r.selfKey),f);add(byCombo,cko(r.po,r.styleNo,r.color),f)});
    (prod.plan||[]).forEach(r=>{const f=o=>{o.plan.rows++;o.plan.sewingQty+=Number(r.sewingQty)||0;if(Number(r.orderQty)>0)o.plan.orderQty.add(Number(r.orderQty));if(r.customer)o.plan.cust.add(nk(r.customer));if(r.line)o.plan.lines.add(String(r.line))};add(byCombo,cko(r.po,r.style,r.color),f)});
    (prod.orders||[]).forEach(r=>{const f=o=>{o.po.qty+=Number(r.qty)||0;o.po.lines++;if(r.customer)o.po.cust.add(nk(r.customer));const c=parseDate(r.cancel_date||r.ship_date||'').date;if(c>o.po.cancel)o.po.cancel=c};add(byCombo,cko(r.po_number||r.po,r.style_code||r.sku,r.color),f)});
    (prod.shipping||[]).forEach(r=>{const f=o=>{o.ship.rows++;o.ship.orig+=Number(r.orig)||0;o.ship.shipped+=Number(r.shipped)||0;o.ship.open+=Number(r.open)||0;const e=String(r.etd||'').slice(0,10);if(e>o.ship.etd)o.ship.etd=e};
      if(r.erp)add(bySelf,nk(r.erp),f);add(byCombo,cko(r.po,r.style,r.color),f)});
    return {bySelf,byCombo};
  }
  function aggErp(records,dataset){
    const bySelf={},byCombo={},byOd={},byComboNoSelf={};const sum=(m,k,r)=>{if(!k||k==='||')return;const o=m[k]=m[k]||{qty:0,lines:0,od:new Set(),my:new Set(),bl:new Set(),cust:new Set(),po:new Set(),style:new Set(),clr:new Set(),delivery:'',ship:'',closed:new Set(),asOf:'',rows:[]};o.qty+=Number(r.qty)||0;o.lines++;if(r.od_no)o.od.add(r.od_no);if(r.bl_no)o.bl.add(r.bl_no);if(r.my_no)o.my.add(r.my_no);if(r.cust)o.cust.add(r.cust);if(r.po_no)o.po.add(r.po_no);if(r.style)o.style.add(r.style);if(r.clr)o.clr.add(r.clr);if(r.delivery&&r.delivery>o.delivery)o.delivery=r.delivery;if(r.ship_date&&r.ship_date>o.ship)o.ship=r.ship_date;if(r.closed!=null&&r.closed!=='')o.closed.add(String(r.closed));if(r.as_of&&r.as_of>o.asOf)o.asOf=r.as_of;o.rows.push(r.id)};
    (records||[]).forEach(r=>{if(r.my_no)sum(bySelf,nk(r.my_no),r);else sum(byComboNoSelf,cko(r.po_no,r.style,r.clr),r);sum(byCombo,cko(r.po_no,r.style,r.clr),r);if(r.od_no)sum(byOd,nk(r.od_no),r)});
    // groups to compare: one per self key, plus one per PO+style+colour for lines that carry no self key
    const groups=Object.assign({},byComboNoSelf,bySelf);
    return {bySelf,byCombo,byOd,byComboNoSelf,groups};
  }
  const setv=s=>[...s].join(' / ');
  /* resolve one ERP group to the PROD side: crosswalk > selfKey > unique PO+style+colour; returns {prod, via, candidates} */
  /* PO lines (orders module) and plan rows carry no self key, so a self-key match is completed with the PO+style+colour groups of the
     same ERP order (po/plan parts only — sewing and shipping rows are already in the self-key group and must not be counted twice). */
  function withCombo(p,grp,P){const combos=[];grp.po.forEach(po=>grp.style.forEach(st=>grp.clr.forEach(c=>{const k=cko(po,st,c);if(P.byCombo[k])combos.push(k)})));const uniq=[...new Set(combos)];if(!uniq.length)return p;
    const o={sewn:p.sewn,sewnRows:p.sewnRows,sewnLatest:p.sewnLatest,cutLatest:p.cutLatest,selfKeys:new Set(p.selfKeys),ship:Object.assign({},p.ship),po:{qty:0,lines:0,cust:new Set(),cancel:''},plan:{sewingQty:0,orderQty:new Set(),rows:0,cust:new Set(),lines:new Set()}};
    uniq.forEach(k=>{const c=P.byCombo[k];o.po.qty+=c.po.qty;o.po.lines+=c.po.lines;c.po.cust.forEach(x=>o.po.cust.add(x));if(c.po.cancel>o.po.cancel)o.po.cancel=c.po.cancel;o.plan.rows+=c.plan.rows;o.plan.sewingQty+=c.plan.sewingQty;c.plan.orderQty.forEach(x=>o.plan.orderQty.add(x));c.plan.cust.forEach(x=>o.plan.cust.add(x));c.plan.lines.forEach(x=>o.plan.lines.add(x))});
    return o}
  function resolve(key,grp,P,crosswalk,kind){
    const cw=(crosswalk||[]).find(c=>c.dataset===kind&&nk(c.erpKey)===key);
    if(cw){const p=P.bySelf[nk(cw.prodKey)]||P.byCombo[nk(cw.prodKey)];return {prod:p?(P.bySelf[nk(cw.prodKey)]?withCombo(p,grp,P):p):null,via:p?'crosswalk':'crosswalk-missing',candidates:[]}}
    if(P.bySelf[key])return {prod:withCombo(P.bySelf[key],grp,P),via:'selfKey',candidates:[]};
    const combos=[];grp.po.forEach(po=>grp.style.forEach(st=>grp.clr.forEach(c=>{const k=cko(po,st,c);if(P.byCombo[k])combos.push(k)})));
    const uniq=[...new Set(combos)];if(uniq.length===1)return {prod:P.byCombo[uniq[0]],via:'po+style+colour',candidates:uniq};
    if(uniq.length>1)return {prod:null,via:'multi',candidates:uniq};
    // PO only (several styles) → candidates listed, never auto-picked
    const poOnly=Object.keys(P.byCombo).filter(k=>[...grp.po].some(po=>po&&k.startsWith(nk(po)+'|')));
    return {prod:null,via:poOnly.length?'po-only':'none',candidates:poOnly.slice(0,8)};
  }
  /* ── ERP orders ↔ PROD orders / plan / sewing / shipping ── */
  function compareOrders(input){
    input=input||{};const E=aggErp(input.erp,'order_line'),P=aggProd(input.prod),asOf=input.asOf||{},tol=Number(input.tolerance)||0;const rows=[];
    const groups=E.groups;   // self key is the business key; lines without my_no are grouped by PO+style+colour
    for(const key of Object.keys(groups)){const grp=groups[key];const r=resolve(key,grp,P,input.crosswalk,'order_line');const reasons=[];let state='match';
      const prod=r.prod;const erpQty=grp.qty;const closed=[...grp.closed].some(c=>/^(y|yes|1|true|結案|closed|close)$/i.test(c));
      const row={key,erp:{od:setv(grp.od),my:setv(grp.my),cust:setv(grp.cust),po:setv(grp.po),style:setv(grp.style),clr:setv(grp.clr),qty:erpQty,lines:grp.lines,delivery:grp.delivery,closed,asOf:grp.asOf||asOf.erp||''},via:r.via,candidates:r.candidates,prod:null};
      if(!prod){if(r.via==='multi'||r.via==='po-only'){state='ambiguous';reasons.push(r.via==='multi'?'多個 PROD 候選 multiple PROD candidates':'只有 PO 相同，款／色未唯一 PO only — style/colour not unique')}
        else if(r.via==='crosswalk-missing'){state='missing';reasons.push('對照鍵在 PROD 找不到 crosswalk target not found in PROD')}
        else{state='missing';reasons.push(closed?'已結案，PROD 無資料 closed order, no PROD rows':'PROD 無此單（未排產／未匯入） not in PROD (not planned / not imported)')}
        row.state=state;row.reasons=reasons;rows.push(row);continue}
      const po=prod.po,pl=prod.plan,sh=prod.ship;const planOrder=[...pl.orderQty];
      row.prod={selfKeys:setv(prod.selfKeys),sewn:prod.sewn,sewnRows:prod.sewnRows,sewnLatest:prod.sewnLatest,poQty:po.lines?po.qty:null,poLines:po.lines,poCust:setv(po.cust),planSewing:pl.rows?pl.sewingQty:null,planOrder:planOrder.length===1?planOrder[0]:(planOrder.length?planOrder:null),planRows:pl.rows,planLines:setv(pl.lines),shipOrig:sh.rows?sh.orig:null,shipped:sh.rows?sh.shipped:null,shipOpen:sh.rows?sh.open:null,shipEtd:sh.etd,progress:erpQty>0?prod.sewn/erpQty*100:null};
      const hasAny=po.lines||pl.rows||prod.sewnRows||sh.rows;if(!hasAny){state='missing';reasons.push('PROD 無資料 no PROD rows')}
      else{
        if(po.lines&&Math.abs(po.qty-erpQty)>tol){reasons.push('訂單量 ERP '+N(erpQty)+' ≠ PROD PO '+N(po.qty)+'（差 '+N(po.qty-erpQty)+'）order qty differs');state='diff'}
        if(planOrder.length>1){reasons.push('排產表同單有多個訂單量 plan holds several order qty: '+planOrder.map(N).join(' / '));state=state==='match'?'incomparable':state}
        else if(planOrder.length===1&&Math.abs(planOrder[0]-erpQty)>tol){reasons.push('排產訂單量 '+N(planOrder[0])+' ≠ ERP '+N(erpQty)+' plan order qty differs');state='diff'}
        if(prod.sewn>erpQty+tol&&erpQty>0){reasons.push('車縫累計 '+N(prod.sewn)+' 超過 ERP 訂單量 sewn exceeds ERP order qty');state='diff'}
        if(sh.rows&&sh.orig&&Math.abs(sh.orig-erpQty)>tol){reasons.push('出貨排程 PO 量 '+N(sh.orig)+' ≠ ERP '+N(erpQty)+' shipping schedule PO qty differs');state=state==='match'?'diff':state}
        if(state==='diff'&&row.erp.asOf&&(prod.sewnLatest>row.erp.asOf||po.cancel&&po.cancel>row.erp.asOf)){state='timing';reasons.push('ERP 快照 '+row.erp.asOf+' 早於 PROD 資料 ERP snapshot older than PROD data')}
        if(pl.rows&&!po.lines&&!prod.sewnRows&&!sh.rows&&state==='match'){state='incomparable';reasons.push('只有排產計劃（計劃 vs 實績不比對數量）plan only — plan vs actual is not a quantity check')}
        if(pl.cust.size&&grp.cust.size&&![...pl.cust].some(c=>[...grp.cust].some(e=>nk(e)===c)))reasons.push('客戶名稱不同（需客戶對照表）customer names differ (needs customer mapping)');
      }
      row.state=state;row.reasons=reasons;rows.push(row);}
    // PROD side orders with no ERP counterpart (only those carrying a self key — the key that CAN be checked)
    const unmatchedProd=[];for(const k of Object.keys(P.bySelf)){if(groups[k])continue;const cw=(input.crosswalk||[]).find(c=>c.dataset==='order_line'&&nk(c.prodKey)===k);if(cw&&E.bySelf[nk(cw.erpKey)])continue;const p=P.bySelf[k];unmatchedProd.push({key:k,sewn:p.sewn,sewnLatest:p.sewnLatest,shipOrig:p.ship.orig,shipped:p.ship.shipped,reason:'ERP 檔沒有此自編單號 self key not in the ERP file'})}
    rows.sort((a,b)=>ORDER.indexOf(a.state)-ORDER.indexOf(b.state)||String(b.erp.delivery).localeCompare(String(a.erp.delivery)));
    const summary={};ORDER.forEach(s=>summary[s]=0);rows.forEach(r=>summary[r.state]++);summary.total=rows.length;summary.unmatchedProd=unmatchedProd.length;summary.erpQty=rows.reduce((s,r)=>s+r.erp.qty,0);
    return {rows,summary,unmatchedProd,asOf};
  }
  /* ── ERP shipments ↔ PROD shipping schedule (actual vs planned side by side; ETD / shipped / open never merged into one number) ── */
  function compareShipping(input){
    input=input||{};const E=aggErp(input.erpShip,'shipment_line'),P=aggProd({shipping:input.prodShip}),asOf=input.asOf||{},tol=Number(input.tolerance)||0;const rows=[];
    const groups=E.groups;
    for(const key of Object.keys(groups)){const grp=groups[key];const r=resolve(key,grp,P,input.crosswalk,'shipment_line');const reasons=[];let state='match';
      const row={key,erp:{bl:grp.bl.size,blList:setv(grp.bl),my:setv(grp.my),od:setv(grp.od),cust:setv(grp.cust),po:setv(grp.po),style:setv(grp.style),clr:setv(grp.clr),shipped:grp.qty,lines:grp.lines,lastShip:grp.ship,asOf:grp.asOf||asOf.erp||''},via:r.via,candidates:r.candidates,prod:null};
      const prod=r.prod;
      if(!prod||!prod.ship.rows){state=(r.via==='multi'||r.via==='po-only')?'ambiguous':'missing';reasons.push(state==='ambiguous'?'PROD 出貨排程有多個候選 several schedule candidates':'出貨排程沒有此單 not in the shipping schedule');row.state=state;row.reasons=reasons;rows.push(row);continue}
      const sh=prod.ship;row.prod={selfKeys:setv(prod.selfKeys),orig:sh.orig,shipped:sh.shipped,open:sh.open,rows:sh.rows,etd:sh.etd};
      const d=grp.qty-sh.shipped;
      if(Math.abs(d)>tol){if(d>0){state=(sh.etd&&sh.etd>=grp.ship)||(asOf.prod&&grp.ship>asOf.prod)?'timing':'diff';reasons.push('ERP 已出 '+N(grp.qty)+' > 排程已出 '+N(sh.shipped)+'（排程未更新？）ERP shipped more than the schedule shows')}
        else{state=row.erp.asOf&&sh.etd>row.erp.asOf?'timing':'diff';reasons.push('排程已出 '+N(sh.shipped)+' > ERP 已出 '+N(grp.qty)+'（ERP 尚未過帳？）schedule shows more than ERP')}}
      if(grp.qty>sh.orig+tol&&sh.orig>0){reasons.push('ERP 出貨 '+N(grp.qty)+' 超過排程 PO 量 '+N(sh.orig)+' shipped exceeds schedule PO qty');state='diff'}
      row.state=state;row.reasons=reasons;rows.push(row);}
    const unmatchedProd=[];for(const k of Object.keys(P.bySelf)){if(groups[k])continue;const p=P.bySelf[k];if(p.ship.shipped>0)unmatchedProd.push({key:k,shipped:p.ship.shipped,orig:p.ship.orig,etd:p.ship.etd,reason:'排程已出貨但 ERP 檔沒有 shipped in schedule, not in the ERP file'})}
    rows.sort((a,b)=>ORDER.indexOf(a.state)-ORDER.indexOf(b.state)||String(b.erp.lastShip).localeCompare(String(a.erp.lastShip)));
    const summary={};ORDER.forEach(s=>summary[s]=0);rows.forEach(r=>summary[r.state]++);summary.total=rows.length;summary.unmatchedProd=unmatchedProd.length;summary.erpShipped=rows.reduce((s,r)=>s+r.erp.shipped,0);
    return {rows,summary,unmatchedProd,asOf};
  }
  /* ── fixed-period daily report draft (規格書 §10.3 / §11.3). Every missing section stays explicit; no number is invented. ── */
  const isSun=d=>new Date(d+'T12:00:00Z').getUTCDay()===0;
  function nextWorkday(day,holidays){let d=day;for(let i=0;i<14;i++){d=addDays(d,1);if(!isSun(d)&&!(holidays||[]).includes(d))return d}return d}
  function prevWorkday(day,holidays){let d=day;for(let i=0;i<14;i++){const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()-1);d=t.toISOString().slice(0,10);if(!isSun(d)&&!(holidays||[]).includes(d))return d}return d}
  function dailyReport(input){
    input=input||{};const D=input.date,T=input.today||D,prod=input.prod||{},erp=input.erp||{},cmp=input.compare||{};const gaps=[],L=[];
    const sew=(prod.sewing||[]).filter(r=>String(r.date||'').slice(0,10)===D);const byDay={};sew.forEach(r=>{const src=r.tSrc==='target'?'target':r.tSrc==='dpo'?'dpo':'norm';(byDay[src]=byDay[src]||[]).push(r)});const use=byDay.norm||byDay.target||byDay.dpo||[];
    const sewn=use.reduce((s,r)=>s+(Number(r.pieces)||0),0),g=use.filter(r=>r.section==='Garment').reduce((s,r)=>s+(Number(r.pieces)||0),0),a=use.filter(r=>r.section==='Apron').reduce((s,r)=>s+(Number(r.pieces)||0),0);
    const lines=new Set(use.map(r=>r.lineNo).filter(Boolean));const sewLatest=(prod.sewing||[]).reduce((b,r)=>{const d=String(r.date||'').slice(0,10);return d>b&&d<=T?d:b},'');
    const planAct=(prod.plan||[]).filter(r=>{const s=String(r.startDate||'').slice(0,10),e=String(r.endDate||r.startDate||'').slice(0,10);return s&&s<=D&&e>=D});
    const planDaily=planAct.reduce((s,r)=>s+(Number(r.dailyOutput)||0),0);const planKnown=planAct.some(r=>Number(r.dailyOutput)>0);
    const cut=(prod.cutting||[]).filter(r=>String(r.date||'').slice(0,10)===D&&r.src!=='ref'&&r.src!=='summary'&&r.lineNo!=='Weekly Report'&&r.lineNo!=='Monthly Summary'&&r.lineNo!=='Summary');const cutPcs=cut.reduce((s,r)=>s+(Number(r.pieces)||0),0);
    const qc=(prod.qc||[]).filter(r=>!r.deleted&&String(r.date||'').slice(0,10)===D);const qcPick={};qc.forEach(r=>{const k=r.line,rank=r.reportKind==='manual'?3:r.reportKind==='weekly'?1:2;if(!qcPick[k]||rank>qcPick[k].rank)qcPick[k]={r,rank}});const qcRows=Object.values(qcPick).map(x=>x.r);
    const insp=qcRows.reduce((s,r)=>s+(Number(r.inspected)||0),0),rej=qcRows.reduce((s,r)=>s+(Number(r.rejected)||0),0);
    const tomorrow=nextWorkday(D,input.holidays);   // 「今日計劃」= 業務日之後的第一個工作日（跳過週日／廠休）
    const nextPlan=(prod.plan||[]).filter(r=>{const s=String(r.startDate||'').slice(0,10),e=String(r.endDate||r.startDate||'').slice(0,10);return s&&s<=tomorrow&&e>=tomorrow&&!r.finishDate});
    const risks=[];(prod.orders||[]).forEach(r=>{const c=String(r.cancel_date||'');const d=parseDate(c).date;if(d&&d>=D&&d<=addDays(D,7))risks.push({po:r.po_number||r.po,cust:r.customer,date:d,qty:Number(r.qty)||0})});
    const riskByPo={};risks.forEach(x=>{const k=String(x.cust||'')+' '+String(x.po||'');const o=riskByPo[k]=riskByPo[k]||{k,date:x.date,qty:0};o.qty+=x.qty;if(x.date<o.date)o.date=x.date});const riskTop=Object.values(riskByPo).sort((x,y)=>x.date.localeCompare(y.date)).slice(0,3);
    const co=cmp.orders&&cmp.orders.summary,cs=cmp.ship&&cmp.ship.summary;
    if(!sew.length)gaps.push('車縫日報 '+D+' 未收到 sewing report missing');if(!cut.length)gaps.push('裁剪日報 '+D+' 未收到 cutting report missing');if(!qc.length)gaps.push('Final QC '+D+' 未收到 QC report missing');
    if(!(erp.orders||0))gaps.push('ERP 訂單檔尚未匯入 ERP order file not imported');if(!(erp.ship||0))gaps.push('ERP 出貨檔尚未匯入 ERP shipment file not imported');
    const complete=['車縫 sewing:'+(sew.length?'齊':'缺'),'裁剪 cutting:'+(cut.length?'齊':'缺'),'QC:'+(qc.length?'齊':'缺'),'ERP:'+(erp.asOf?'快照 '+erp.asOf:'未匯入')].join(' · ');
    L.push('<b>VRT 生產早報 Morning report</b>｜'+esc(T)+'｜業務日 Business day <b>'+esc(D)+'</b>');
    L.push('資料 Data: PROD 至 '+esc(sewLatest||'—')+'；ERP 快照 snapshot '+esc(erp.asOf||'未匯入 not imported')+'；完整度 '+esc(complete));
    L.push('');
    L.push('🧵 車縫 Sewing: '+(sew.length?'<b>'+N(sewn)+'</b> pcs（Garment '+N(g)+' · Apron '+N(a)+' · '+N(lines.size)+' 線 lines）':'未齊 not received')+'；計劃 Plan: '+(planAct.length?(planKnown?N(planDaily)+' pcs/day（'+N(planAct.length)+' 筆排單）':N(planAct.length)+' 筆排單，無日目標 no daily target'):'無排程 no plan')+'；達成率 Achievement: '+(sew.length&&planKnown&&planDaily>0?pct(sewn/planDaily*100,0):'N/A'));
    L.push('✂️ 裁剪 Cutting: '+(cut.length?'<b>'+N(cutPcs)+'</b> pcs':'未齊 not received')+'；✅ QC: '+(qc.length?'檢驗 inspected '+N(insp)+' · 退修 reject '+N(rej)+'（'+pct(insp?rej/insp*100:null,2)+'）':'未齊 not received'));
    L.push('📅 今日計劃 Today\'s plan ('+esc(tomorrow)+'): '+(nextPlan.length?nextPlan.slice(0,6).map(r=>esc(String(r.line||''))+' '+esc(String(r.style||''))+' '+esc(String(r.customer||''))+' '+N(r.sewingQty||r.orderQty||0)).join('；')+(nextPlan.length>6?'；…共 '+N(nextPlan.length)+' 筆':''):'Production Plan 無排單 no confirmed plan'));
    L.push('⚠️ 交期及物料 Due / material: '+(riskTop.length?riskTop.map(x=>esc(x.k)+' '+esc(x.date)+' '+N(x.qty)+' pcs').join('；'):'7 天內無到期 PO（依訂單模組）no PO due within 7 days (orders module)'));
    L.push('🔗 跨平台核對 Cross-check: '+(co?'訂單 orders — 相符 '+N(co.match)+' · 差異 '+N(co.diff)+' · 時間差 '+N(co.timing)+' · 缺 '+N(co.missing)+' · 待對應 '+N(co.ambiguous+co.incomparable):'訂單未比對 orders not compared')+'；'+(cs?'出貨 ship — 相符 '+N(cs.match)+' · 差異 '+N(cs.diff)+' · 時間差 '+N(cs.timing)+' · 缺 '+N(cs.missing)+' · 待對應 '+N(cs.ambiguous):'出貨未比對 shipments not compared'));
    L.push('📌 需處理 To do: '+(gaps.length?gaps.map(esc).join('；'):'無缺報 nothing missing'));
    if(input.link)L.push('完整日報 Full report: '+esc(input.link));
    const text=L.join('\n');
    const report={report_id:'erplink-daily-'+D+'-'+hash32(text).slice(0,8),type:'daily',period:{start:D,end:D},generated_at:input.generatedAt||'',business_date:D,sources:{prodLatest:sewLatest,erpAsOf:erp.asOf||null,erpOrders:erp.orders||0,erpShip:erp.ship||0,sewingRows:sew.length,cuttingRows:cut.length,qcReports:qcRows.length},metrics:{sewn:sew.length?sewn:null,garment:g,apron:a,lines:lines.size,planDaily:planKnown?planDaily:null,planRows:planAct.length,achievement:sew.length&&planKnown&&planDaily>0?sewn/planDaily*100:null,cut:cut.length?cutPcs:null,inspected:qc.length?insp:null,rejected:qc.length?rej:null,rejectRate:insp?rej/insp*100:null},compare:{orders:co||null,ship:cs||null},risks:riskTop,gaps,version:1};
    return {report,text,plain:text.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')};
  }
  function addDays(d,n){const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)}
  /* ── isolated test data (never persisted, never pushed): marks every row is_demo so queries can exclude it ── */
  function sampleFiles(){
    const orders='od_no,od_seq,my_no,cust,style,clr,size,po_no,order_date,delivery,qty,closed\n'+
      'TEST-0001,1,T029671,TESTCUST,GO1543,L.BLUE,4XL,A029671,2026/08/01,2026/09/30,0960,N\n'+
      'TEST-0001,2,T029671,TESTCUST,GO1543,L.BLUE,3XL,A029671,2026/08/01,2026/09/30,480,N\n'+
      'TEST-0002,1,T000412,TESTCUST,412,WHITE,1SZ,5474,2026/06/15,2026/10/20,48600,N\n'+
      'TEST-0003,1,T090001,OTHERCUST,ZZ-9,BLACK,M,PO-9,2026/07/01,2026/08/15,1200,Y\n';
    const ship='bl_no,bl_seq,my_no,cust,po_no,style,clr,qty,ship_date,invoice\n'+
      'BL-TEST-1,1,T029671,TESTCUST,A029671,GO1543,L.BLUE,600,2026/09/20,INV-T1\n'+
      'BL-TEST-2,1,T029671,TESTCUST,A029671,GO1543,L.BLUE,300,2026/09/27,INV-T2\n';
    return {orders:{name:'TEST_erp_orders.csv',text:orders},ship:{name:'TEST_erp_shipments.csv',text:ship}};
  }
  g.VRTErpLink={version:VERSION,PARSER_VERSION,MAPPING_VERSION,FIELDS,DATASET_LABEL,KEY_OF,STATES,ORDER,nk,parseDate,parseQty,headerSignature,suggestMapping,detectDataset,missingRequired,parseText,decodeBytes,normalizeRows,mergeImport,fileHash,aggProd,aggErp,compareOrders,compareShipping,dailyReport,prevWorkday,nextWorkday,addDays,sampleFiles,hash32,esc,N,pct};
})(typeof window!=='undefined'?window:globalThis);
