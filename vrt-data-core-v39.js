/* VRT 3.9: pure data rules shared by the existing PROD pages and regression tests. */
(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const norm=x=>String(x==null?'':x).replace(/[\u200b\uFEFF]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  const number=x=>x===null||x===undefined||String(x).trim()===''?null:(Number.isFinite(Number(String(x).replace(/,/g,'')))?Number(String(x).replace(/,/g,'')):null);
  const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((o,k)=>(o[k]=v[k],o),{}):v);
  function hash(x){const s=typeof x==='string'?x:stable(x);let a=2166136261,b=3339675911;for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b^s.charCodeAt(i),2246822519)}return(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0')}
  function ymd(v){if(v instanceof Date&&!isNaN(v))return [v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-');if(typeof v==='number'&&root.XLSX){const d=root.XLSX.SSF.parse_date_code(v);return d?[d.y,String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-'):''}const s=String(v||'').replace(/^date\s*:\s*/i,'');const m=s.match(/(20\d\d)[-/](\d{1,2})[-/](\d{1,2})/);if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');const d=new Date(s);return /[A-Za-z]{3}/.test(s)&&!isNaN(d)?ymd(d):''}
  const full=m=>!norm(m)||/^(FULL STYLE( SMV)?|WHOLE GARMENT|整款|全款)$/.test(norm(m));
  const family=r=>[norm(r.customer),norm(r.style),full(r.module)?'FULL':norm(r.module)].join('|');
  const fields=['customer','style','module','category','testDate','testedBy','previousSmv','currentSmv','approval','approvalDate','effectiveDate','notes','sourceType','progress','adjustedSmv','adjustmentRate'];
  function revision(r,ops){let o={};fields.forEach(k=>o[k]=['customer','style','module'].includes(k)?(k==='module'&&full(r[k])?'FULL':norm(r[k])):r[k]??'');if(ops)o.operations=ops.map(p=>({no:p.no,component:p.component||'',description:p.description||'',descriptionZh:p.descriptionZh||'',machine:p.machine||'',smv:number(p.smv),reference:p.reference||''}));return hash(o)}
  function initIE(s){['updates','styles','operations','importLog','sourceDocuments','tombstones'].forEach(k=>{if(!Array.isArray(s[k]))s[k]=[]});s.schemaVersion=Math.max(s.schemaVersion||2,3);return s}
  function sources(old,r){old.sourceFiles=[...new Set([...(old.sourceFiles||[]),...(r.sourceFiles||[])])];return old}
  function insertIE(s,c){
    initIE(s);const result={added:0,unchanged:0,versions:0,operations:0};
    const r=copy(c.record||c.style),ops=copy(c.operations||[]);if(!norm(r.style)||norm(r.style)==='TO-CONFIRM')throw new Error('款式不可空白 / Style is required');
    for(const k of ['previousSmv','currentSmv']){r[k]=number(r[k]);if(r[k]!=null&&r[k]<0)throw new Error('SMV 不可為負數')}
    if(c.kind==='style'){
      const u=s.updates.find(x=>family(x)===family(r)&&x.testDate===r.testDate&&x.approval===r.approval&&number(x.currentSmv)!=null&&Math.abs(x.currentSmv-r.currentSmv)<.001);if(u){if(r.previousSmv==null)r.previousSmv=u.previousSmv;if(!r.category||r.category==='other')r.category=u.category;}
      r.operationCount=ops.length;r.missingSmvCount=ops.filter(o=>number(o.smv)==null).length;
      r.operationTotal=ops.reduce((n,o)=>n+(number(o.smv)||0),0);
      r.totalMismatch=r.currentSmv!=null&&Math.abs(r.operationTotal-r.currentSmv)>0.001;
      r.dataStatus=r.missingSmvCount||r.totalMismatch?'needs_confirmation':'ready';
    }
    const list=c.kind==='style'?s.styles:s.updates,fp=revision(r,c.kind==='style'?ops:undefined);
    const same=list.find(x=>x.fingerprint===fp||revision(x,c.kind==='style'?s.operations.filter(o=>o.detailId===x.id):undefined)===fp);
    if(same){sources(same,r);result.unchanged++;return result}
    const id=(c.kind==='style'?'OBD-':'IE-')+fp;
    if(s.tombstones.some(x=>x.id===id)){result.unchanged++;return result}
    const prior=list.filter(x=>family(x)===family(r)).sort((a,b)=>String(b.testDate||'').localeCompare(a.testDate||'')||String(b.createdAt||'').localeCompare(a.createdAt||''))[0];
    delete r.publishedToSmvAt;delete r.publishedToSmvVersion;
    Object.assign(r,{id,fingerprint:fp,createdAt:new Date().toISOString(),supersedes:prior?.id||'',revision:(prior?.revision||0)+1});
    list.push(r);result.added++;if(prior)result.versions++;
    if(c.kind==='style'){
      ops.forEach((o,i)=>s.operations.push({...o,id:id+':'+i,sequence:i+1,detailId:id,style:r.style,module:r.module,sourceFile:c.file||r.sourceFiles?.[0]||''}));result.operations=ops.length;
      const linked=s.updates.find(x=>family(x)===family(r)&&x.testDate===r.testDate&&x.approval===r.approval&&number(x.currentSmv)!=null&&Math.abs(x.currentSmv-r.currentSmv)<0.001&&(!x.detailId||x.detailId===id||x.detailId===r.originalId));
      if(linked){linked.detailId=id;sources(linked,r)}
      else{const u={...copy(r),id:'IE-'+hash(id),detailId:id,styleType:c.styleType||r.styleType||'current_old',progress:c.progress||'test_complete'};delete u.fingerprint;u.fingerprint=revision(u);s.updates.push(u)}
    }else{
      const linked=s.styles.find(x=>family(x)===family(r)&&x.testDate===r.testDate&&x.approval===r.approval&&number(x.currentSmv)!=null&&Math.abs(x.currentSmv-r.currentSmv)<0.001);
      if(linked){r.detailId=linked.id;sources(r,linked)}
    }
    s.importLog.push({id:'LOG-'+id,timestamp:r.createdAt,file:c.file||'',detectedType:c.detectedType||c.kind,result:r.style+' · '+(prior?'新增版本，保留舊版':'新增')+(ops.length?' · '+ops.length+' operations':'')});
    return result;
  }
  function currentIE(s){const m=new Map();(s.updates||[]).forEach(r=>{if(r.deleted)return;const k=family(r),a=m.get(k);if(!a||String(r.testDate||'')>String(a.testDate||'')||(r.testDate===a.testDate&&String(r.createdAt||'')>=String(a.createdAt||'')))m.set(k,r)});return [...m.values()]}
  function eligibleIE(s,day){initIE(s);const m=new Map();s.updates.forEach(r=>{const st=s.styles.find(x=>x.id===r.detailId),date=r.effectiveDate||r.approvalDate||'';if(r.approval!=='approved'||!date||date>day||number(r.currentSmv)==null||r.currentSmv<=0||!full(r.module)||st&&(st.sourceType==='partial_obd'||st.missingSmvCount>0||st.totalMismatch||st.dataStatus==='needs_confirmation'))return;const k=family(r),old=m.get(k);if(!old||date>(old.effectiveDate||old.approvalDate)||date===(old.effectiveDate||old.approvalDate)&&String(r.createdAt||'')>String(old.createdAt||''))m.set(k,r)});return [...m.values()].filter(r=>!r.publishedToSmvAt)}
  function mergeIE(a,b){a=initIE(copy(a||{}));b=initIE(copy(b||{}));const out={...a};for(const k of ['updates','styles','operations','importLog','sourceDocuments','tombstones']){const m=new Map();[...a[k],...b[k]].forEach(r=>{const id=r.id||hash(r),old=m.get(id);if(!old)m.set(id,copy(r));else if(stable(old)!==stable(r))m.set(id,{...old,...r,sourceFiles:[...new Set([...(old.sourceFiles||[]),...(r.sourceFiles||[])])]} )});out[k]=[...m.values()]}
    const dead=new Set(out.tombstones.map(t=>t.id));out.updates=out.updates.filter(r=>!dead.has(r.id));out.styles=out.styles.filter(r=>!dead.has(r.id));out.operations=out.operations.filter(r=>!dead.has(r.id)&&!dead.has(r.detailId));out.settings={...a.settings,...b.settings};out.integration={...a.integration,...b.integration};out.schemaVersion=3;out.generatedAt=[a.generatedAt||'',b.generatedAt||''].sort().pop();return out}
  function officialRows(snaps,day){const m=new Map();(snaps||[]).forEach(s=>(s.items||[]).forEach((r,i)=>{if(s._vrtEntity||s.approval&&s.approval!=='approved'||r.approval&&r.approval!=='approved'||number(r.curSMV)==null||number(r.curSMV)<=0)return;const date=r.effectiveDate||s.effectiveDate||s.reportDate||'';if(date>day)return;const k=[norm(s.section),norm(r.cust),norm(r.style)].join('|'),old=m.get(k),rank=date+'|'+(/^(IE_SMV_APPROVED|MANUAL_APPROVED)$/.test(s.source||'')?'2':'1')+'|'+(s.importedAt||'');if(!old||rank>old.rank)m.set(k,{...r,section:s.section,date,rank,snapshotId:s.id,itemIndex:i,source:s.fileName})}));return [...m.values()]}

  function resolveOfficial(index,style,customer,section){let xs=index.filter(r=>norm(r.style)===norm(style)&&(!section||norm(r.section)===norm(section)));if(customer){const exact=xs.filter(r=>norm(r.cust)===norm(customer));if(exact.length===1)return exact[0];if(exact.length>1)return null;const known=xs.filter(r=>norm(r.cust));if(known.length)return null}return xs.length===1?xs[0]:null}
  function officialByStyle(snaps,day){const index=officialRows(snaps,day).filter(r=>norm(r.section)!=='CUTTING'),out={};for(const k of new Set(index.map(r=>norm(r.style)))){const r=resolveOfficial(index,k);if(r)out[k]=r}return out}
  function snapshotFingerprint(s){return hash({section:norm(s.section),date:s.effectiveDate||s.reportDate,items:(s.items||[]).map(r=>({style:norm(r.style),cust:norm(r.cust),type:norm(r.type),origSMV:number(r.origSMV),curSMV:number(r.curSMV),newSMV:number(r.newSMV),pcsBox:number(r.pcsBox),remark:r.remark||'',effectiveDate:r.effectiveDate||s.effectiveDate||s.reportDate})).sort((a,b)=>stable(a).localeCompare(stable(b)))})}

  function rows(wb,name){return root.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null,blankrows:true})}
  function column(h,terms){const exact=h.findIndex(v=>terms.some(t=>norm(v)===norm(t)));return exact>=0?exact:h.findIndex(v=>terms.some(t=>norm(v).includes(norm(t))))}
  function header(a,terms){return a.findIndex(r=>terms.every(t=>r.some(v=>norm(v).includes(norm(t)))))}
  function parsePartsWorkbook(wb,filename){
    const out={parts:[],txns:[],stockReports:[],needleChanges:[],warnings:[],source:filename};
    for(const name of wb.SheetNames){const a=rows(wb,name),top=a.slice(0,4).flat().join(' ');
      if(/Needles Stock Report|Spareparts Stock Report/i.test(top)){
        const needle=/Needles Stock Report/i.test(top),h=header(a,['Stock Left','SIZE']);if(h<0)continue;
        const head=a[h],ix={no:0,name:column(head,[needle?'Needle Type':'Sparepart Type']),size:column(head,['SIZE']),used:column(head,['Monthly Used']),stock:column(head,['Stock Left']),order:column(head,['Monthly Order']),price:column(head,['Unite Price','Unit Price']),total:column(head,['Total Price']),remark:column(head,['Remark'])};
        const p=top.match(/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/);if(!p)throw new Error(name+': 缺少報表期間');
        const start=p[4]+'-'+p[3].padStart(2,'0')+'-'+p[1].padStart(2,'0'),end=p[4]+'-'+p[3].padStart(2,'0')+'-'+p[2].padStart(2,'0');
        let lastName='';const items=[];
        for(let i=h+1;i<a.length;i++){const r=a[i];if(number(r[ix.no])==null||!String(r[ix.size]??'').trim()&&!String(r[ix.name]??'').trim())continue;const nm=String(r[ix.name]||lastName).trim();if(!nm)continue;lastName=nm;
          const size=String(r[ix.size]??'').trim(),remark=String(r[ix.remark]||'').trim();
          const item={id:'STOCK-'+hash([needle,nm,size,remark,number(r[0])]),sourceRow:i+1,no:r[0],name:nm,size,machine:remark,used:number(r[ix.used]),stockLeft:number(r[ix.stock]),orderQty:number(r[ix.order]),unitPrice:number(r[ix.price]),totalPrice:number(r[ix.total]),daily:[],raw:copy(r)};
          head.forEach((d,j)=>{const date=ymd(d);if(date&&number(r[j])!=null)item.daily.push({date,qty:number(r[j]),kind:'reported_order_receive'})});
          const stockCols=head.map((v,j)=>norm(v).includes('STOCK LEFT')?j:-1).filter(j=>j>=0),bal=column(head,['Balance','Closing','結存']);item.balance=bal>=0?number(r[bal]):stockCols.length>1?number(r[stockCols[stockCols.length-1]]):null;items.push(item);
        }
        out.stockReports.push({id:(needle?'NEEDLE-':'PARTS-')+start+'_'+end,kind:needle?'needle':'machine',start,end,sourceFile:filename,sourceSheet:name,items,headers:copy(head),fingerprint:hash(items),updatedAt:''});
      }else if(norm(name)==='STOCK SNAPSHOTS'||header(a,['Period Start','Period End','Stock Left'])>=0){
        const h=header(a,['Period Start','Period End']),head=a[h],groups=new Map();for(let i=h+1;i<a.length;i++){const row=a[i],get=t=>row[column(head,[t])],start=ymd(get('Period Start')),end=ymd(get('Period End')),nm=String(get('Name')||'');if(!start||!end||!nm)continue;const kind=String(get('Kind')||(/needle/i.test(filename)?'needle':'machine')),id=(kind==='needle'?'NEEDLE-':'PARTS-')+start+'_'+end;let r=groups.get(id);if(!r){r={id,kind,start,end,sourceFile:filename,sourceSheet:name,items:[]};groups.set(id,r)}const x={id:String(get('Item ID')||'STOCK-'+hash([kind==='needle',nm,String(get('Size')||''),String(get('Machine')||'')])),no:get('No'),name:nm,size:String(get('Size')||''),machine:String(get('Machine')||''),used:number(get('Monthly Used Quantity')),stockLeft:number(get('Stock Left')),orderQty:number(get('Monthly Order Quantity')),unitPrice:number(get('Unit Price')),totalPrice:number(get('Total Price')),balance:number(get('Balance')),daily:[]};head.forEach((d,j)=>{const date=ymd(d);if(date&&number(row[j])!=null)x.daily.push({date,qty:number(row[j]),kind:'reported_order_receive'})});r.items.push(x)}groups.forEach(r=>{r.fingerprint=hash(r.items);out.stockReports.push(r)});
      }else if(norm(name)==='TRANSACTION DETAIL'||header(a,['Invoice No','Part No','Calculated Amount'])>=0){
        const h=header(a,['Invoice No','Part No','Qty']);if(h<0)continue;const head=a[h],col=ts=>column(head,ts);
        for(let i=h+1;i<a.length;i++){const r=a[i],partNo=String(r[col(['Part No'])]||'').trim();if(!partNo)continue;
          const v=t=>r[col(t)],tx={type:String(v(['Type'])||'PURCHASE'),partNo,name:String(v(['Standard Name'])||v(['Raw Item Name'])||partNo),spec:String(v(['Spec'])||''),category:String(v(['Category'])||'Other'),brand:String(v(['Brand'])||''),machineType:String(v(['Machine / Use'])||''),qty:number(v(['Qty']))||0,unit:String(v(['Unit'])||''),unitPrice:number(v(['Unit Price']))||0,amount:number(v(['Calculated Amount']))??number(v(['Source Amount'])),invoiceNo:String(v(['Invoice No'])||''),invoiceDate:ymd(v(['Date'])),statementMonth:String(v(['Statement Month'])||''),supplier:String(v(['Supplier'])||''),sourceFile:String(v(['Source File'])||filename),sourceSheet:String(v(['Source Sheet'])||name),sourceRow:number(v(['Source Row']))||i+1,includeInMaster:norm(v(['Include in Master']))!=='NO',remark:String(v(['Notes'])||''),raw:copy(r)};
          tx.date=tx.invoiceDate;tx.id=String(v(['Record ID'])||'PUR-'+hash([tx.sourceFile,tx.invoiceNo,tx.partNo,i+1]));out.txns.push(tx);
        }
      }else if(header(a,['Needle Type','Qty'])<0&&(norm(name)==='HTML IMPORT'||norm(name)==='INVENTORY'||!wb.SheetNames.some(n=>norm(n)==='HTML IMPORT')&&header(a,['Part No','Qty'])>=0&&header(a,['Invoice No'])<0)){
        const h=a.findIndex(r=>r.some(v=>norm(v)==='PART NO'));if(h<0)continue;const head=a[h],get=(r,t)=>r[column(head,t)];
        for(let i=h+1;i<a.length;i++){const r=a[i],partNo=String(get(r,['Part No'])||'').trim();if(!partNo)continue;out.parts.push({partNo,name:String(get(r,['Part Name','Name'])||partNo),spec:String(get(r,['Spec'])||''),category:String(get(r,['Category'])||'Other'),brand:String(get(r,['Brand'])||''),machineType:String(get(r,['Machine Type'])||''),unit:String(get(r,['Unit'])||'PCS'),qty:number(get(r,['Qty'])),unitPrice:number(get(r,['Unit Price','Price'])),minStock:number(get(r,['Min'])),maxStock:number(get(r,['Max'])),remark:String(get(r,['Remark'])||''),catalogOnly:norm(name)==='HTML IMPORT'});}
      }else if(norm(name)==='NEEDLE CHANGE'||header(a,['Needle Type','Qty'])>=0){
        const h=header(a,['Date','Needle Type','Qty']);if(h<0)continue;const head=a[h],get=(r,t)=>r[column(head,t)];for(let i=h+1;i<a.length;i++){const r=a[i],date=ymd(get(r,['Date'])),needleType=String(get(r,['Needle Type'])||'');if(!date||!needleType)continue;const rec={date,needleType,size:String(get(r,['Size'])||''),qty:number(get(r,['Qty'])),line:String(get(r,['Line'])||''),machine:String(get(r,['Machine'])||''),operator:String(get(r,['Operator'])||''),reason:String(get(r,['Reason'])||''),returned:number(get(r,['Returned'])),remark:String(get(r,['Remark'])||'')};rec.id=String(get(r,['Record ID'])||'NC-'+hash(rec));out.needleChanges.push(rec);}
      }
    }
    if(!out.parts.length&&!out.txns.length&&!out.stockReports.length&&!out.needleChanges.length)throw new Error('未辨識有效資料。支援價格基準、零件庫存、機針庫存、Needle Change、Inventory / CSV。');return out;
  }
  function mergeReports(old,incoming){const m=new Map((old||[]).map(x=>[x.id,copy(x)]));let added=0,updated=0,unchanged=0;for(const r of incoming){const prior=m.get(r.id);if(prior?.fingerprint===r.fingerprint){unchanged++;continue}const merged=copy(r);if(prior){const items=new Map(prior.items.map(i=>[i.id,i]));r.items.forEach(i=>items.set(i.id,{...items.get(i.id),...i}));merged.deletedItemIds=prior.deletedItemIds||[];merged.items=[...items.values()].filter(i=>!merged.deletedItemIds.includes(i.id));if(hash(merged.items)===prior.fingerprint){unchanged++;continue}merged.history=[...(prior.history||[]),{fingerprint:prior.fingerprint,updatedAt:prior.updatedAt,items:prior.items,sourceDocumentId:prior.sourceDocumentId}];updated++}else added++;merged.fingerprint=hash(merged.items);merged.updatedAt=new Date().toISOString();m.set(r.id,merged)}return{records:[...m.values()],added,updated,unchanged}}
  root.VRTData39={copy,norm,number,stable,hash,ymd,family,revision,initIE,insertIE,currentIE,eligibleIE,mergeIE,officialRows,resolveOfficial,officialByStyle,snapshotFingerprint,parsePartsWorkbook,mergeReports};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.VRTData39;
})(typeof window!=='undefined'?window:globalThis);
