/* Shared, deterministic parsers. Report dates come from the file, never today's date. */
(function(g){'use strict';const C=g.VRTData39,X=g.XLSX,n=C.number,txt=x=>String(x??'').trim(),norm=C.norm,hash=C.hash;
 const date=(y,m,d)=>{const v=new Date(Date.UTC(+y,+m-1,+d));return v.getUTCFullYear()===+y&&v.getUTCMonth()===+m-1&&v.getUTCDate()===+d?v.toISOString().slice(0,10):''};
 function aoa(s){return X.utils.sheet_to_json(s,{header:1,raw:true,defval:null,blankrows:true})}
 function reportDate(v){if(typeof v==='number'||v instanceof Date)return C.ymd(v);let m=txt(v).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|20\d{2})$/);if(m)return date(m[3].length===2?'20'+m[3]:m[3],m[2],m[1]);return C.ymd(v)}
 function dailyChanges(wb,filename){const out={parts:[],txns:[],stockReports:[],needleChanges:[],partChanges:[],warnings:[],source:filename};
  const names=wb.SheetNames.filter(sn=>/Daily (Needles|Spare Part) Change/i.test(aoa(wb.Sheets[sn]).slice(0,2).flat().join(' ')));
  if(!names.length){for(const sn of wb.SheetNames){const rows=X.utils.sheet_to_json(wb.Sheets[sn],{defval:''});for(const r of rows){if(!r['Part Type']||!r.Date)continue;const rec={id:r['Record ID']||'PC-'+hash([r.Date,r['Part Type'],r.Size,r.Line]),date:reportDate(r.Date),partType:txt(r['Part Type']),size:txt(r.Size),line:txt(r.Line),qty:n(r.Qty),machine:txt(r.Machine),operator:txt(r.Operator),reason:txt(r.Reason),returned:n(r.Returned),remark:txt(r.Remark)};if(!rec.date||!(rec.qty>0)||!Number.isInteger(rec.qty))throw new Error('換零件需有效日期及正整數數量');out.partChanges.push(rec)}}return out.partChanges.length?out:null;}
  // Repeated M-D tabs plus explicit D/M/Y text establish the workbook's reporting calendar.
  const corroboration=names.map(sn=>{let m=sn.trim().match(/^(\d{1,2})-(\d{1,2})$/),a=aoa(wb.Sheets[sn]),d=reportDate(a[0]?.[6]);return {m,d}});
  const verifiedMonths=new Set(corroboration.filter(x=>x.m&&x.d&&+x.d.slice(5,7)===+x.m[1]&&+x.d.slice(8)===+x.m[2]&&+x.m[2]>12).map(x=>+x.m[1]));
  for(const sn of names){const a=aoa(wb.Sheets[sn]),needle=/Daily Needles/i.test(a.slice(0,2).flat().join(' ')),raw=a[0]?.[6],m=sn.trim().match(/^(\d{1,2})-(\d{1,2})$/);let d=reportDate(raw),year=(d||txt(raw)).match(/20\d{2}/)?.[0]||(/\/(\d{2})$/.exec(txt(raw))?.[1]?2000+ +/\/(\d{2})$/.exec(txt(raw))[1]:null);
   if(!year)year=corroboration.find(x=>x.d)?.d.slice(0,4);const sheetDate=m&&year?date(year,m[1],m[2]):'';
   if(sheetDate&&d!==sheetDate&&verifiedMonths.has(+m[1])){out.warnings.push(sn+'：原日期 '+txt(raw)+' → '+sheetDate+'（依本簿連續日報分頁及明確日期校正）');d=sheetDate}
   if(!d||sheetDate&&d!==sheetDate)throw new Error(sn+' 日期與分頁不一致，請先在 Excel 確認日期');
   const items=[],changes=[];
   for(let i=2;i<a.length;i++){const r=a[i];if(n(r[0])==null||!txt(r[1]))continue;const name=txt(r[1]),size=txt(r[2]),issued=n(r[4]),opening=n(r[3]),balance=n(r[5]);
    if([issued,opening,balance].some(x=>x!=null&&x<0))out.warnings.push(sn+' 第 '+(i+1)+' 列有負數，保留原值供核對');
    const id='DS-'+hash([needle,name,size,n(r[0])]);items.push({id,no:r[0],name,size,machine:txt(r[6]),stockLeft:opening,used:issued,balance,orderQty:null,unitPrice:null,totalPrice:null,daily:[],raw:C.copy(r),sourceRow:i+1});
    const allocations=[];for(let j=9;j<=20;j++){const qty=n(r[j]);if(qty>0)allocations.push({line:'Line '+(j-8),qty})}
    const sum=allocations.reduce((s,x)=>s+x.qty,0);if(issued>sum)allocations.push({line:'未分線 / Unassigned',qty:issued-sum});
    if(issued!=null&&sum>issued)out.warnings.push(sn+' '+name+'：線別 '+sum+' 大於發放 '+issued+'，保留線別數量供核對');
    if(opening!=null&&issued!=null&&balance!=null&&Math.abs(opening-issued-balance)>1e-8)out.warnings.push(sn+' '+name+'：期初－發放與結存不符');
    for(const x of allocations){const rec={id:(needle?'NC-':'PC-')+hash([d,id,x.line]),date:d,needleType:needle?name:undefined,partType:needle?undefined:name,size,line:x.line,qty:x.qty,machine:'',operator:'',reason:txt(r[6]),returned:null,remark:'',sourceFile:filename,sourceSheet:sn,sourceRow:i+1,sourceDate:txt(raw)};changes.push(rec)}
   }
   out.stockReports.push({id:(needle?'NEEDLE-':'PARTS-')+d+'_'+d,kind:needle?'needle':'machine',start:d,end:d,sourceFile:filename,sourceSheet:sn,sourceDate:txt(raw),items,fingerprint:hash(items)});
   out[needle?'needleChanges':'partChanges'].push(...changes);
  }return out;
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
 g.VRTImport40={dailyChanges,fabric,fabricId,mergeFabric,qc,validateQC,qcTotals,qcMerge,reportDate};
})(typeof window!=='undefined'?window:globalThis);
