/* Shared, deterministic parsers. Report dates come from the file, never today's date.
   v4.13 (2026-09-30): Daily Needle / Spare Part Change importer now detects the sheet schema
   from header text and numeric relationships (old J:U and new K:V layouts, Received column,
   reversed Opening/Closing headers) and classifies change reasons. */
(function(g){'use strict';const C=g.VRTData39,X=g.XLSX,n=C.number,txt=x=>String(x??'').trim(),norm=C.norm,hash=C.hash;
 const date=(y,m,d)=>{const v=new Date(Date.UTC(+y,+m-1,+d));return v.getUTCFullYear()===+y&&v.getUTCMonth()===+m-1&&v.getUTCDate()===+d?v.toISOString().slice(0,10):''};
 function aoa(s){return X.utils.sheet_to_json(s,{header:1,raw:true,defval:null,blankrows:true})}
 function reportDate(v){if(typeof v==='number'||v instanceof Date)return C.ymd(v);let m=txt(v).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|20\d{2})$/);if(m)return date(m[3].length===2?'20'+m[3]:m[3],m[2],m[1]);return C.ymd(v)}
 /* ── v4.13 Daily Needle / Spare Part Change importer ─────────────────────────────
    Schema detection by header text + numeric relationship, never fixed column indexes.
    Supports the old layout (Stock Left | Issued | Balance | Remark, lines J:U) and the
    new layout (Opening | Received | Issued | Closing | Remark, lines K:V), including
    sheets whose Opening/Closing header text is reversed. Source values are preserved;
    every doubt becomes a warning, never a silent correction. Same IDs as v4.0 so a
    re-import of the same source is idempotent. */
 const CHANGE_TITLE=/Daily\s*(Needles?|Spare\s*Parts?)\s*Change|ដូរម្ជុល|ដូរ​?បន្លាស់|每日备件更换|每日换针|換針日報|換零件日報/i;
 const cellText=v=>String(v??'').replace(/[​﻿]/g,' ').replace(/\s+/g,' ').trim();
 const cellNorm=v=>cellText(v).toUpperCase();
 function sheetTop(a,n){return a.slice(0,n||4).map(r=>r.map(cellText).join(' ')).join(' ')}
 // SheetJS cellDates:true builds local Dates a few seconds before midnight (e.g. 23:59:56 UTC+7); snap to the intended day.
 function cellYmd(v){if(v instanceof Date&&!isNaN(v))return C.ymd(new Date(v.getTime()+5*60000));return C.ymd(v)}
 function excelYear(v){const s=cellText(v);let m=s.match(/20\d{2}/);if(m)return +m[0];m=s.match(/[\/.-](\d{2})\s*$/);if(m)return 2000+ +m[1];return null}
 // Every candidate date in the rows above the header: Date objects, Excel serials, D/M/Y or Y-M-D text.
 function titleDates(a,hi){const out=[];for(let i=0;i<hi;i++)for(const v of a[i]||[]){if(v==null||v==='')continue;
   if(v instanceof Date||typeof v==='number'){const d=cellYmd(v);if(d)out.push({ymd:d,raw:d,year:+d.slice(0,4)});continue}
   const s=cellText(v);if(!s)continue;
   let m=s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2}|\d{2})\b/);if(m){const y=m[3].length===2?2000+ +m[3]:+m[3];out.push({ymd:date(y,m[2],m[1])||date(y,m[1],m[2]),raw:s,year:y,d:+m[1],m:+m[2]});continue}
   m=s.match(/(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})/);if(m){out.push({ymd:date(m[1],m[2],m[3]),raw:s,year:+m[1]});continue}
   m=s.match(/^\/?\s*(\d{1,2})\s*\/\s*(20\d{2})\s*$/);if(m)out.push({ymd:'',raw:s,year:+m[2],m:+m[1]});
 }return out}
 function findChangeHeader(a){for(let i=0;i<Math.min(a.length,8);i++){const r=(a[i]||[]).map(cellNorm),hasNo=r.some(v=>/^(លរ\s*)?NO\.?(\s|$)|^NO\.?\s*\d*$|^លរ/.test(v)),hasSize=r.some(v=>/SIZE|ទំហំ|尺寸/.test(v)),hasQty=r.some(v=>/ISSUED|BALANCE|STOCK\s*LEFT|OPENING|CLOSING|ផ្តល់|តុល្យភាព|នៅសល់/.test(v));if(hasNo&&hasSize&&hasQty)return i}return -1}
 function detectChangeColumns(a,hi){const head=(a[hi]||[]).map(cellNorm),find=re=>head.findIndex(v=>re.test(v)),ix={no:0,name:-1,size:-1,remark:-1,received:-1,issued:-1,lines:{}};
   ix.name=find(/NEEDLE\s*TYPE|SPARE\s*PARTS?\s*TYPE|PART\s*TYPE|ប្រភេទ|针型|备件类型/);if(ix.name<0)ix.name=1;
   ix.size=find(/\bSIZE\b|ទំហំ|尺寸/);if(ix.size<0)ix.size=ix.name+1;
   ix.remark=find(/REMARK|សំគាល់|评论|備註|备注/);
   ix.received=find(/RECEIVED|ទទួល|已收到|收貨|收货/);
   ix.issued=find(/ISSUED|ផ្តល់ជូន|已发放|發放|发放/);
   // Numeric stock columns between SIZE and REMARK that are neither Received nor Issued.
   const end=ix.remark>0?ix.remark:head.length,stock=[];for(let j=ix.size+1;j<end;j++){if(j===ix.received||j===ix.issued)continue;const h=head[j];if(/OPENING|CLOSING|STOCK\s*LEFT|BALANCE|តុល្យភាព|នៅសល់|余额|結存|库存|庫存/.test(h))stock.push(j)}
   ix.stock=stock;
   // Line columns: "# 1", "Line# 1", "LINE 1", "L1" in the header row or the row above it.
   for(const row of [hi,hi-1]){if(row<0)continue;(a[row]||[]).forEach((v,j)=>{const m=cellNorm(v).match(/^(?:LINE\s*#?\s*|#\s*|L)(\d{1,2})$/);if(m&&ix.lines[j]==null)ix.lines[j]=+m[1]})}
   return {head,ix}}
 function changeOrientation(rows,ix){
   // Decide which stock column is opening and which is closing from the numbers, not the label.
   const [L,R]=ix.stock,score={LR:0,RL:0,rule:{plain:0,recv:0}},close=(x,y)=>x!=null&&y!=null&&Math.abs(x-y)<1e-6;
   for(const r of rows){const l=n(r[L]),rt=n(r[R]),iss=n(r[ix.issued])||0,rcv=ix.received>=0?n(r[ix.received])||0:0;if(l==null||rt==null)continue;if(!iss&&!rcv)continue;
     if(close(l-iss,rt)){score.LR++;score.rule.plain++}else if(close(l+rcv-iss,rt)){score.LR++;score.rule.recv++}
     if(close(rt-iss,l)||close(rt+rcv-iss,l))score.RL++;}
   const reversed=score.RL>score.LR;return {opening:reversed?R:L,closing:reversed?L:R,evidence:score,reversed,decided:score.LR!==score.RL}}
 function reasonClass(text){const s=cellNorm(text);if(!s)return 'unknown';if(/CHANGE\s*STYLE|ប្តូរម៉ូដ|更改样式|換款|换款|CHANGEOVER/.test(s))return 'changeover';if(/BROKEN|បាក់|破碎|斷針|断针|BREAK/.test(s))return 'broken';if(/DAMAGE|ខូច|损害|損壞|损坏|BENT|彎針|弯针/.test(s))return 'damage';if(/LOST|បាត់|迷失|遺失|丢失/.test(s))return 'lost';return 'other'}
 function dailyChanges(wb,filename){const out={parts:[],txns:[],stockReports:[],needleChanges:[],partChanges:[],warnings:[],source:filename,schemaVersion:413};
  const sheets=wb.SheetNames.map(sn=>({sn,a:aoa(wb.Sheets[sn])})).map(x=>({...x,hi:findChangeHeader(x.a)})).filter(x=>x.hi>=0&&(CHANGE_TITLE.test(sheetTop(x.a,x.hi+1))||/NEEDLE\s*TYPE|SPARE\s*PARTS?\s*TYPE/i.test((x.a[x.hi]||[]).map(cellText).join(' '))));
  if(!sheets.length){// Native Needle/Part Change export (Record ID / Date / Part Type ... ) round-trip.
   for(const sn of wb.SheetNames){const rows=X.utils.sheet_to_json(wb.Sheets[sn],{defval:''});for(const r of rows){if(!r['Part Type']||!r.Date)continue;const rec={id:r['Record ID']||'PC-'+hash([r.Date,r['Part Type'],r.Size,r.Line]),date:reportDate(r.Date),partType:txt(r['Part Type']),size:txt(r.Size),line:txt(r.Line),qty:n(r.Qty),machine:txt(r.Machine),operator:txt(r.Operator),reason:txt(r.Reason),reasonClass:reasonClass(r.Reason),returned:n(r.Returned),remark:txt(r.Remark)};if(!rec.date||!(rec.qty>0)||!Number.isInteger(rec.qty))throw new Error('換零件需有效日期及正整數數量');out.partChanges.push(rec)}}return out.partChanges.length?out:null;}
  // Workbook calendar: sheet tabs named M-D plus any explicit year found in titles or the file name.
  const fileYear=excelYear(filename.replace(/\d{6,8}/g,m=>m.length===8?m.slice(0,4)+'-'+m.slice(4,6)+'-'+m.slice(6):m.slice(0,4)+'-'+m.slice(4)));
  const info=sheets.map(x=>{const m=x.sn.trim().match(/^(\d{1,2})[-\/.](\d{1,2})$/),dates=titleDates(x.a,x.hi);return {...x,tab:m?{m:+m[1],d:+m[2]}:null,dates,year:dates.map(d=>d.year).find(Boolean)||null}});
  const years=info.map(x=>x.year).filter(Boolean),yearVotes={};years.forEach(y=>yearVotes[y]=(yearVotes[y]||0)+1);const bookYear=+Object.keys(yearVotes).sort((p,q)=>yearVotes[q]-yearVotes[p])[0]||fileYear||null;
  const tabMonths={};info.forEach(x=>{if(x.tab)tabMonths[x.tab.m]=(tabMonths[x.tab.m]||0)+1});const bookMonth=+Object.keys(tabMonths).sort((p,q)=>tabMonths[q]-tabMonths[p])[0]||null;
  for(const x of info){const {sn,a,hi}=x,needle=/Needles?\s*Change|ដូរម្ជុល|NEEDLE\s*TYPE|换针|針型|针型/i.test(sheetTop(a,hi+1)),rawDate=x.dates[0]?.raw??'';
   // ── date ──────────────────────────────────────────────────────────────────
   let d='',year=x.year||bookYear||fileYear;if(!year){year=new Date().getFullYear();out.warnings.push(sn+'：原表與檔名都沒有年份，暫以今年 '+year+' 解讀，請核對')}
   const tabDate=x.tab?date(year,x.tab.m,x.tab.d):'',first=x.dates.find(t=>t.ymd);
   if(tabDate){d=tabDate;
     if(first&&first.ymd!==tabDate){const swapped=first.d!=null&&first.m!=null&&first.d===x.tab.m&&first.m===x.tab.d||(first.ymd&&+first.ymd.slice(5,7)===x.tab.d&&+first.ymd.slice(8)===x.tab.m);
       out.warnings.push(sn+'：原表日期 '+cellText(first.raw)+(swapped?'（日／月互換）':'')+' → 依分頁名稱採 '+tabDate)}}
   else if(tabDate&&!first&&x.dates.length&&x.dates[0].raw)out.warnings.push(sn+'：原表日期「'+cellText(x.dates[0].raw)+'」不完整，依分頁名稱採 '+tabDate);
   else if(first){d=first.ymd;if(bookMonth&&first.d!=null&&first.m!=null&&first.m!==bookMonth&&first.d===bookMonth){d=date(first.year||year,first.d,first.m)||d;out.warnings.push(sn+'：原表日期 '+cellText(first.raw)+' 依本簿月份解讀為 '+d)}}
   if(!d){out.warnings.push(sn+'：找不到報表日期，此分頁略過');continue}
   // ── columns ───────────────────────────────────────────────────────────────
   const {head,ix}=detectChangeColumns(a,hi);
   if(ix.issued<0)out.warnings.push(sn+'：表頭沒有 Issued／發放欄，發放數以 0 計，請核對原表');
   const dataRows=[];let totalsRow=null;for(let i=hi+1;i<a.length;i++){const r=a[i]||[];const hasNo=n(r[ix.no])!=null,name=cellText(r[ix.name]);if(!hasNo&&!name){if(r.some((v,j)=>j>ix.size&&n(v)!=null&&n(v)!==0)&&!totalsRow)totalsRow={row:r,index:i};continue}if(!name)continue;if(!hasNo&&![...ix.stock,ix.issued,ix.received].some(j=>j>=0&&n(r[j])!=null))continue;dataRows.push({r,i})}
   if(ix.stock.length<2){if(ix.stock.length===1)ix.stock.push(-1);else ix.stock=[-1,-1];out.warnings.push(sn+'：只辨識到 '+Math.max(0,ix.stock.filter(j=>j>=0).length)+' 個庫存欄，期初／結存可能不完整')}
   const orient=changeOrientation(dataRows.map(x=>x.r),ix),opCol=orient.opening,clCol=orient.closing;
   const opHead=cellText(head[opCol]),clHead=cellText(head[clCol]);
   // Header text is only a hint: when the numbers prove the labels are swapped, say so and keep every source value.
   const headerTextReversed=/CLOSING|期末|BALANCE(?!.*(OPENING|STOCK))/.test(cellNorm(opHead))&&/OPENING|STOCK\s*LEFT|期初|未结/.test(cellNorm(clHead));
   if(headerTextReversed&&orient.decided)out.warnings.push(sn+'：表頭「'+opHead+'」依數字關係（期初－發放＝結存）判定為期初、「'+clHead+'」為結存；原值保留未改，請通知製表人');
   else if(orient.reversed)out.warnings.push(sn+'：右側庫存欄「'+opHead+'」實為期初、左側「'+clHead+'」為結存（依數字關係判定），原值保留未改');
   const layout={header:hi+1,opening:opCol,received:ix.received,issued:ix.issued,closing:clCol,remark:ix.remark,lines:ix.lines,rule:orient.evidence.rule.recv>orient.evidence.rule.plain?'opening+received-issued':'opening-issued',headerTextReversed,columnsSwapped:orient.reversed,evidence:orient.evidence};
   if(!Object.keys(ix.lines).length)out.warnings.push(sn+'：找不到 # 1～# 12 線別欄，換件只記總數，未分線');
   const items=[],changes=[];let sumOpen=0,sumIssued=0,sumRecv=0,sumClose=0;
   for(const {r,i} of dataRows){const name=cellText(r[ix.name]),size=cellText(r[ix.size]),remark=ix.remark>=0?cellText(r[ix.remark]):'';
    const opening=opCol>=0?n(r[opCol]):null,received=ix.received>=0?n(r[ix.received]):null,issuedRaw=ix.issued>=0?n(r[ix.issued]):null,closing=clCol>=0?n(r[clCol]):null;
    if([opening,received,issuedRaw,closing].some(v=>v!=null&&v<0))out.warnings.push(sn+' 第 '+(i+1)+' 列有負數，保留原值供核對');
    const allocations=[];for(const [j,ln] of Object.entries(ix.lines)){const q=n(r[j]);if(q!=null&&q>0)allocations.push({line:'Line '+ln,qty:q})}
    const allocated=allocations.reduce((s,z)=>s+z.qty,0),issued=issuedRaw==null&&allocated>0?allocated:issuedRaw;
    if(issuedRaw==null&&allocated>0)out.warnings.push(sn+' '+name+'：發放欄空白，線別合計 '+allocated+' 視為發放數');
    let unassigned=0;if(issued!=null&&allocated>issued)out.warnings.push(sn+' '+name+'：線別合計 '+allocated+' 大於發放 '+issued+'，保留線別數量供核對');
    if(issued!=null&&issued>allocated){unassigned=issued-allocated;if(allocated>0||Object.keys(ix.lines).length)out.warnings.push(sn+' '+name+'：發放 '+issued+' 只分到 '+allocated+'，未分線 '+unassigned)}
    let arithmetic='n/a';if(opening!=null&&issued!=null&&closing!=null){const plain=Math.abs(opening-issued-closing)<1e-6,recv=received!=null&&Math.abs(opening+received-issued-closing)<1e-6;arithmetic=plain?'opening-issued':recv?'opening+received-issued':'mismatch';if(arithmetic==='mismatch')out.warnings.push(sn+' '+name+'：期初 '+opening+(received?' ＋收 '+received:'')+' － 發放 '+issued+' ≠ 結存 '+closing+'，原值保留')}
    sumOpen+=opening||0;sumIssued+=issued||0;sumRecv+=received||0;sumClose+=closing||0;
    // Same identity as v4.0 (raw trimmed text) so previously imported rows are updated, never duplicated.
    const rawName=txt(r[ix.name]),rawSize=txt(r[ix.size]),id='DS-'+hash([needle,rawName,rawSize,n(r[ix.no])]);
    items.push({id,no:r[ix.no],name:rawName,size:rawSize,machine:remark,stockLeft:opening,used:issued,balance:closing,orderQty:null,unitPrice:null,totalPrice:null,daily:[],raw:C.copy(r),sourceRow:i+1,
      itemName:name,needleType:needle?name:'',partType:needle?'':name,openingQty:opening,receivedQty:received,issuedQty:issued,closingQty:closing,reason:remark,reasonClass:reasonClass(remark),remark,lineAllocations:allocations,unassignedQty:unassigned,arithmetic});
    const recs=allocations.slice();if(unassigned>0)recs.push({line:'未分線 / Unassigned',qty:unassigned,unassigned:true});
    for(const z of recs){changes.push({id:(needle?'NC-':'PC-')+hash([d,id,z.line]),date:d,needleType:needle?rawName:undefined,partType:needle?undefined:rawName,size:rawSize,line:z.line,qty:z.qty,machine:'',operator:'',reason:remark,reasonClass:reasonClass(remark),returned:null,remark:'',unassigned:!!z.unassigned,sourceFile:filename,sourceSheet:sn,sourceRow:i+1,sourceDate:cellText(rawDate)})}
   }
   if(totalsRow){const t=totalsRow.row,chk=[[opCol,sumOpen,'期初'],[ix.issued,sumIssued,'發放'],[ix.received,sumRecv,'收貨'],[clCol,sumClose,'結存']];for(const [col,sum,label] of chk){if(col<0)continue;const v=n(t[col]);if(v!=null&&Math.abs(v-sum)>1e-6)out.warnings.push(sn+'：原表合計列 '+label+' '+v+' 與明細加總 '+sum+' 不同，採明細')}}
   out.stockReports.push({id:(needle?'NEEDLE-':'PARTS-')+d+'_'+d,kind:needle?'needle':'machine',start:d,end:d,sourceFile:filename,sourceSheet:sn,sourceDate:cellText(rawDate),layout,items,fingerprint:hash(items)});
   out[needle?'needleChanges':'partChanges'].push(...changes);
  }
  if(!out.stockReports.length)throw new Error('找不到可讀的換針／換零件分頁（需有 No.／SIZE／Issued 或 Balance 表頭）');
  return out;
 }
 function fabric(wb,filename){const out={current:[],old:[],accessory:[],warnings:[]};
  const fileDate=filename.match(/(\d{1,2})[._ -](JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[._ -](20\d{2})/i),fallback=fileDate?date(fileDate[3],1+['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(fileDate[2].toUpperCase()),fileDate[1]):reportDate(filename.match(/\d{1,2}[./-]\d{1,2}[./-]20\d{2}/)?.[0]||'');
  for(const sn of wb.SheetNames){const a=aoa(wb.Sheets[sn]),hi=a.findIndex(r=>r.some(v=>/^(ITEM CODE|ITEMCODE|料號)$/.test(norm(v))));if(hi<0)continue;const h=a[hi].map(v=>norm(v).replace(/[ _]/g,'')),ix=(...keys)=>h.findIndex(v=>keys.some(k=>v===norm(k).replace(/[ _]/g,''))),get=(r,...keys)=>r[ix(...keys)];
   const own=/Current Fabric Snapshots|Old Fabric Usage|Accessory Stock/i.test(sn)||ix('snapshotDate','useDate')>=0,old=/Old Fabric Usage/i.test(sn)||!!reportDate(sn),acc=ix('Balance','結存')>=0&&ix('Lot Number')<0,kind=old?'old':acc?'accessory':'current';
   // Annual sheets are summaries of Fabric Details. Import the detail once.
   if(!own&&!old&&!acc&&!/Fabric\s*Details?/i.test(sn))continue;
   for(let i=hi+1;i<a.length;i++){const r=a[i],itemCode=txt(get(r,'Item Code','料號'));if(!itemCode||/^(TOTAL|ITEM CODE|合計)/i.test(itemCode)||n(get(r,acc?'Balance':'Quantity',acc?'結存':'數量'))==null)continue;
    const d=reportDate(get(r,old?'useDate':'snapshotDate'))||(old?reportDate(sn):fallback);if(!d)throw new Error(filename+' 缺少庫存／使用日期，請在檔名或日期欄標明日期');
    const rec={itemCode,description:txt(get(r,'Description','料名')),erpCode:txt(get(r,'ERP Code')),lotNumber:txt(get(r,'Lot Number')),customer:txt(get(r,'Customer')),quantity:n(get(r,acc?'Balance':'Quantity',acc?'結存':'數量')),unit:txt(get(r,'Unit','單位'))||(acc?'PCS':'YARD'),quality:txt(get(r,'Quality')),location:txt(get(r,'Location')),comment:txt(get(r,'Comment')),sourceFile:filename,sourceSheet:sn,sourceRow:i+1,stockType:old?'old_usage':kind};
    rec[old?'useDate':'snapshotDate']=d;rec.stockYear=n(get(r,'Year','stockYear'))||+(rec.lotNumber.match(/^20\d{2}/)?.[0]||'')||'';
    if(old){rec.po=txt(get(r,'PO'));rec.style=txt(get(r,'Style'))}
    if(acc)for(const k of ['colorCode','colorName','size','category','opening','inbound','outbound','adjustment','balance'])rec[k]=/opening|inbound|outbound|adjustment|balance/.test(k)?n(get(r,k))||0:txt(get(r,k));
    rec.id=txt(get(r,'id'))||fabricId(rec);out[kind].push(rec);
   }
  }return out;
 }
 function fabricId(r){return 'FAB-'+hash([r.stockType||'current',r.snapshotDate||r.useDate,r.itemCode,r.erpCode,r.lotNumber,r.location,r.quality,r.unit,r.po,r.style,r.colorCode,r.colorName,r.size])}
 function mergeFabric(old,incoming){const m=new Map();for(const r of [...old,...incoming]){const id=r.id||fabricId(r),prior=m.get(id);m.set(id,{...prior,...r,id})}return [...m.values()]}
 function qc(wb,filename){const records=[],warnings=[];for(const sn of wb.SheetNames){const s=wb.Sheets[sn],v=k=>s[k]?.t==='e'?null:s[k]?.v,top=txt(v('A1'));if(!/Final QC Inspection Report By Line/i.test(top))continue;
   const date=reportDate(v('B3'));if(!date)throw new Error(sn+' 缺少有效檢驗日期');let line=txt(v('B2'));line=/^A\d+$/i.test(line)?'Line '+ +line.slice(1):line||sn.trim();
   const all=aoa(s),summary=all.findIndex(r=>/Inspection Quantity/i.test(txt(r[0])));if(summary<0)throw new Error(sn+' 缺少 Inspection Quantity');const row=summary+1,inspected=n(v('M'+row)),rejected=n(v('M'+(row+1)));if(inspected==null||rejected==null)throw new Error(sn+' 缺少有效檢驗／Reject 合計');
   const defects=[];for(let r=7;r<=all.length;r++){if(n(v('A'+r))==null||!txt(v('B'+r)))continue;const hourly=['G','I','K','M','N','O','P','Q','R','S'].map(c=>({time:txt(v(c+'4')),qty:n(v(c+r))||0}));defects.push({no:n(v('A'+r)),code:txt(v('E'+r)),name:txt(v('B'+r)),qty:n(v('T'+r))??hourly.reduce((n,x)=>n+x.qty,0),hourly})}
   const styleHead=all.findIndex(r=>norm(r[1])==='STYLE'&&norm(r[2])==='SMV'),styles=[];if(styleHead>=0)for(let r=styleHead+2;r<=all.length;r++){if(!txt(v('B'+r))||n(v('C'+r))==null||n(v('D'+r))==null)continue;if(/manufactured|approved/i.test(txt(v('B'+r))))break;styles.push({style:txt(v('B'+r)),smv:n(v('C'+r)),output:n(v('D'+r)),minutes:n(v('E'+r))??n(v('C'+r))*n(v('D'+r))})}
   const output=styles.reduce((s,x)=>s+x.output,0),attendance=n(v('P'+row)),minutes=styles.reduce((s,x)=>s+x.minutes,0),rec={id:'QC-'+hash([date,norm(line)]),date,line,customer:'',po:'',inspected,rejected,output,workers:n(v('N2'))??n(v('Q2')),totalWorkers:n(v('J2')),absent:n(v('N3')),normalMinutes:n(v('T2')),overtimeMinutes:n(v('T3')),overtimeWorkers:n(v('Q3')),attendanceMinutes:attendance,producedMinutes:minutes,styles,defects,intervals:['C','E','G','I','K'].map(c=>({time:txt(v(c+(row-1))),inspected:n(v(c+row))||0,rejected:n(v(c+(row+1)))||0})),sourceFile:filename,sourceSheet:sn,notes:'',history:[],issues:[]};
   const defectQty=defects.reduce((s,x)=>s+x.qty,0);if(defectQty!==rejected)rec.issues.push('缺點明細 '+defectQty+' 與 Reject '+rejected+' 不符');if(output!==inspected-rejected)rec.issues.push('Output '+output+' 與檢驗減 Reject '+(inspected-rejected)+' 不符');if(rejected>inspected)rec.issues.push('Reject 大於檢驗量');records.push(rec);warnings.push(...rec.issues.map(x=>sn+'：'+x));
  }
  if(records.length){const summaryName=wb.SheetNames.find(sn=>/^summary$/i.test(sn));if(summaryName){const s=wb.Sheets[summaryName],summaryDate=reportDate(s.B5?.v);for(const r of records)if(summaryDate&&r.date!==summaryDate){const warning=r.sourceSheet+' 日期 '+r.date+' 與 Summary '+summaryDate+' 不同，保留原表日期';warnings.push(warning);r.issues.push(warning)}const rate=s.O10?.t==='e'?null:n(s.O10?.v),t=qcTotals(records);if(rate!=null&&t.rejectRate!=null&&Math.abs(rate-t.rejectRate)>0.000001)warnings.push('Summary 快取 Reject % '+(rate*100).toFixed(4)+'% 與明細重算 '+(t.rejectRate*100).toFixed(4)+'% 不符；採明細合計。')}}
  // Native QC exports carry JSON detail, preserving all hourly and style fields.
  if(!records.length){const s=wb.Sheets['QC Records']||wb.Sheets[wb.SheetNames[0]],rows=X.utils.sheet_to_json(s,{defval:''});for(const r of rows){if(r['Record JSON']){const x=JSON.parse(r['Record JSON']);validateQC(x);records.push(x)}else if(r.Date&&r.Line){const x={id:r.ID||'QC-'+hash([reportDate(r.Date),norm(r.Line)]),date:reportDate(r.Date),line:txt(r.Line),customer:txt(r.Customer),po:txt(r.PO),inspected:n(r.Inspected),rejected:n(r.Rejected),output:n(r.Output),attendanceMinutes:n(r['Attendance Minutes']),producedMinutes:n(r['Produced Minutes']),styles:[],defects:[],intervals:[],history:[],notes:txt(r.Notes)};validateQC(x);records.push(x)}}}
  if(!records.length)throw new Error('未找到 Final QC 線別日報或 QC Records 匯出表');return{records,warnings};
 }
 function validateQC(r){if(!reportDate(r.date)||!txt(r.line))throw new Error('請填寫日期及線別');for(const k of ['inspected','rejected','output'])if(n(r[k])==null||r[k]<0||!Number.isInteger(+r[k]))throw new Error('數量須為零或正整數');if(r.rejected>r.inspected)throw new Error('Reject 不可大於檢驗量');for(const k of ['attendanceMinutes','producedMinutes','workers','totalWorkers','normalMinutes','overtimeMinutes','overtimeWorkers'])if(r[k]!=null&&(n(r[k])==null||+r[k]<0))throw new Error(k+' 須為有效非負數')}
 function qcTotals(rows){const active=rows.filter(r=>!r.deleted),sum=k=>active.reduce((s,r)=>s+(n(r[k])||0),0),a={records:active.length,lines:new Set(active.filter(r=>r.inspected>0).map(r=>r.line)).size,inspected:sum('inspected'),rejected:sum('rejected'),output:sum('output'),attendanceMinutes:sum('attendanceMinutes'),producedMinutes:sum('producedMinutes'),workers:sum('workers')};a.rejectRate=a.inspected?a.rejected/a.inspected:null;a.efficiency=a.attendanceMinutes?a.producedMinutes/a.attendanceMinutes:null;return a}
 function qcMerge(old,incoming){const m=new Map((old||[]).map(r=>[r.id,C.copy(r)]));let added=0,updated=0,unchanged=0;const content=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['updatedAt','createdAt','history','sourceFile','sourceSheet'].includes(k)));for(const raw of incoming){const r=C.copy(raw),prior=m.get(r.id);if(prior?.deleted){unchanged++;continue}if(prior&&C.stable(content(prior))===C.stable(content(r))){unchanged++;continue}if(prior){r.history=[...(prior.history||[]),{...prior,history:undefined}];updated++}else added++;r.updatedAt=new Date().toISOString();m.set(r.id,r)}return{records:[...m.values()],added,updated,unchanged}}
 g.VRTImport40={version:'4.13.0',dailyChanges,fabric,fabricId,mergeFabric,qc,validateQC,qcTotals,qcMerge,reportDate,reasonClass,detectChangeColumns,findChangeHeader};
})(typeof window!=='undefined'?window:globalThis);
