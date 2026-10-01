/* QC-specific report parsing (v4.9: + sewing-line Top-3 defect KPI workbook). Shared Sewing/IE/fabric parsers are unchanged. */
(function(g){'use strict';
  const I=g.VRTImport40,C=g.VRTData39,X=g.XLSX,n=C.number,baseQC=I.qc,baseValidate=I.validateQC,baseMerge=I.qcMerge;
  const text=v=>String(v??'').trim(),norm=v=>text(v).toUpperCase().replace(/[\s_-]+/g,''),copy=C.copy;
  function line(v){const s=norm(v),m=s.match(/^(?:LINE|A|L)?0*(\d+)$/);return m?'Line '+Number(m[1]):/^(SAMPLE|SAMPIE)LINE$/.test(s)?'SAMPLELINE':text(v)}
  const id=r=>'QC-'+C.hash([r.date,C.norm(line(r.line))]);
  function rows(sheet){return X.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,blankrows:true,range:0})}
  function validate(r){baseValidate(r);if(r.output>r.inspected-r.rejected)throw new Error('實際產出不可大於檢驗量減不良件數');const gap=r.inspected-r.rejected-r.output;
    if(r.reconciliationGap!=null&&n(r.reconciliationGap)!==gap)throw new Error('未完成產出差額與檢驗／不良／實際產出不一致');
  }
  function totals(rs){const active=rs.filter(r=>!r.deleted),sum=k=>active.reduce((s,r)=>s+(n(r[k])||0),0),needed=active.filter(r=>r.inspected>0||r.output>0||r.attendanceMinutes>0),known=needed.filter(r=>n(r.attendanceMinutes)>0&&n(r.producedMinutes)!=null),att=known.reduce((s,r)=>s+n(r.attendanceMinutes),0),mins=known.reduce((s,r)=>s+n(r.producedMinutes),0);
    return {records:active.length,lines:new Set(active.filter(r=>r.inspected>0).map(r=>line(r.line))).size,inspected:sum('inspected'),rejected:sum('rejected'),output:sum('output'),workers:sum('workers'),attendanceMinutes:att,producedMinutes:mins,reconciliationGap:active.reduce((s,r)=>s+r.inspected-r.rejected-r.output,0),rejectRate:sum('inspected')?sum('rejected')/sum('inspected'):null,efficiency:known.length===needed.length&&att?mins/att:null,knownEfficiency:att?mins/att:null,efficiencyKnown:known.length,efficiencyNeeded:needed.length};
  }
  function weekly(wb,filename){const sn=wb.SheetNames.find(s=>/weekly.*inspection report/i.test(s)&&!/summary/i.test(s));if(!sn)return null;
    const a=rows(wb.Sheets[sn]),hi=a.findIndex(r=>norm(r[0])==='LINE#'&&/defect/i.test(text(r[1])));if(hi<0)return null;
    const starts=a.map((r,i)=>({r,i})).filter(({r,i})=>i>hi&&/^(?:LINE\s*\d+|SAMP[IL]E\s*LINE)$/i.test(text(r[0])));
    if(!starts.length)throw new Error('週報中找不到線別區塊');
    const summaryName=wb.SheetNames.find(s=>/^weekly summary$/i.test(s)),summary=summaryName?rows(wb.Sheets[summaryName]):[],dh=summary.find(r=>/^date$/i.test(text(r[0]))),summaryDates=new Set((dh||[]).slice(1).map(v=>I.reportDate(v)).filter(Boolean));
    const dateCols=a[hi].map((v,c)=>({date:I.reportDate(v),c})).filter(x=>x.c>=3&&x.date),records=[],warnings=[];
    const blocks=starts.map(({r,i},b)=>{const end=starts[b+1]?.i??a.length,all=a.slice(i,end),find=re=>all.find(x=>re.test(text(x[1])));return {line:line(r[0]),start:i,all,inspected:find(/^Inspected\s*Qty/i),rejected:find(/^Total\s*Rejected/i),output:find(/^Actual\s*Output\s*Qty/i),eff:find(/^%\s*Efficiency/i),rate:find(/^%\s*Total\s*Reject/i)}});
    const dates=dateCols.filter(({date,c})=>summaryDates.size?summaryDates.has(date):blocks.some(b=>n(b.inspected?.[c])>0)||blocks.filter(b=>n(b.inspected?.[c])!=null).length>=Math.ceil(blocks.length/2));
    if(!dates.length)throw new Error('週報沒有可確認的報告日期');
    for(const b of blocks){if(!b.inspected||!b.rejected||!b.output)throw new Error(b.line+' 缺少檢驗／不良／產出合計列');
      const note=text(b.output[11]),fullDefects=b.all.filter(r=>text(r[1])&&text(r[2])&&!/^%|total|inspected|actual/i.test(text(r[1])));
      for(const {date,c} of dates){const inspected=n(b.inspected[c]),output=n(b.output[c]);if(inspected==null&&output==null)continue;
        const defects=fullDefects.map((r,j)=>({no:j+1,code:text(r[2]),name:text(r[1]),qty:n(r[c])||0,hourly:[]})),ds=defects.reduce((s,d)=>s+d.qty,0),rejected=n(b.rejected[c])??(inspected===0&&ds===0?0:null);
        const r={date,line:b.line,reportKind:'weekly',customer:'',po:'',inspected,rejected,output,reconciliationGap:inspected-rejected-output,reportedEfficiency:n(b.eff?.[c]),reportedRejectRate:n(b.rate?.[c]),workers:null,attendanceMinutes:null,producedMinutes:null,styles:[],defects,intervals:[],sourceFile:filename,sourceSheet:sn,sourceRow:b.start+1,sourcePeriod:[dates[0].date,dates.at(-1).date],notes:note,history:[],issues:[]};r.id=id(r);validate(r);
        if(ds!==rejected)r.issues.push('缺點次數 '+ds+' 與不良件數 '+rejected+' 不符，請核對原表');
        if(r.reconciliationGap)r.issues.push('尚未列為實際產出 '+r.reconciliationGap+' 件'+(note?'；原表有半成品備註':'；請核對原表'));
        records.push(r);
      }
      const expected=totals(records.filter(r=>r.line===b.line));for(const [k,r] of [['inspected',b.inspected],['rejected',b.rejected],['output',b.output]])if(n(r[10])!=null&&n(r[10])!==expected[k])warnings.push(b.line+'：週報合計欄 '+k+' '+r[10]+' 與每日加總 '+expected[k]+' 不同，採每日明細');
    }
    // Summary sheets cross-check the source, never add another set of quantities.
    const totalRow=summary.find(r=>/^total$/i.test(text(r[0])));if(dh&&totalRow)for(let c=1;c<dh.length;c++){const d=I.reportDate(dh[c]);if(!d)continue;const t=totals(records.filter(r=>r.date===d));for(const [offset,k] of [[0,'inspected'],[1,'output'],[2,'rejected']])if(n(totalRow[c+offset])!=null&&n(totalRow[c+offset])!==t[k])warnings.push(d+'：週摘要 '+k+' 與線別明細不符，採線別明細')}
    const t=totals(records);if(t.reconciliationGap)warnings.push('週報實際產出保留 '+t.output.toLocaleString()+' 件；檢驗扣除不良後另有 '+t.reconciliationGap+' 件尚未列為產出，請參照半成品備註。');
    warnings.push('週報未提供出勤／產出分鐘，保留各線原報效率；不將百分比平均值當作加權效率。');
    return {records,warnings,kind:'weekly',period:[dates[0].date,dates.at(-1).date]};
  }
  /* ── v4.9 Sewing-line Top-3 defect KPI workbook (QC 每周质量会议报告) ────────────────────────
     Sheets SEP21… hold a defect-kind × line matrix with Total Defect / Sewing Output / Percentage;
     sheet "week N" holds the weekly sum plus TOP 3. These are end-line sewing defects, not Final QC
     inspection, so they are stored as a separate kind (sewingkpi) and only compared with Final QC. */
  const MONTHS={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,SEPT:9,OCT:10,NOV:11,DEC:12};
  const kpiId=r=>'QK-'+C.hash([r.date,C.norm(line(r.line))]);
  function kpiCellDate(v){if(v instanceof Date&&!isNaN(v))return C.ymd(new Date(v.getTime()+5*60000));return I.reportDate(v)}
  function defectKpi(wb,filename){const daily=[],weekly=[],warnings=[];
    const fileRange=filename.match(/(\d{1,2})[_ -](\d{1,2})[_ -]([A-Z]{3,4})[_ -](20\d{2})/i),fileYear=(filename.match(/20\d{2}/)||[])[0]||'';
    for(const sn of wb.SheetNames){const a=rows(wb.Sheets[sn]);const hi=a.findIndex(r=>r.some(v=>/total\s*defect/i.test(text(v)))&&r.some(v=>/sewing\s*output/i.test(text(v))));if(hi<0)continue;
      const head=a[hi],cTotal=head.findIndex(v=>/total\s*defect/i.test(text(v))),cOut=head.findIndex(v=>/sewing\s*output/i.test(text(v))),cPct=head.findIndex(v=>/pe?r?centage|percent|%/i.test(text(v))),kinds=head.map((v,c)=>({name:text(v).replace(/\s+/g,' '),c})).filter(x=>x.c>0&&x.c<cTotal&&x.name);
      if(!kinds.length||cTotal<0||cOut<0){warnings.push(sn+'：找不到缺點種類欄');continue}
      // Date: a cell under a "DATE" label, else the sheet name (SEP21) with the workbook year.
      let date='';for(let i=0;i<hi;i++){const r=a[i];for(let c=0;c<r.length;c++){if(/^date$/i.test(text(r[c]))){for(let j=i+1;j<=hi;j++){const d=kpiCellDate(a[j]?.[c]);if(d){date=d;break}}}}if(date)break}
      const sm=sn.trim().match(/^([A-Z]{3,4})\s*(\d{1,2})$/i),isWeek=/^week\b/i.test(sn.trim());
      if(!date&&sm&&MONTHS[sm[1].toUpperCase()]){const y=fileYear||(fileRange&&fileRange[4])||String(new Date().getFullYear());date=y+'-'+String(MONTHS[sm[1].toUpperCase()]).padStart(2,'0')+'-'+String(+sm[2]).padStart(2,'0');warnings.push(sn+'：分頁沒有日期欄，依分頁名稱採 '+date)}
      if(!isWeek&&!date){warnings.push(sn+'：找不到報告日期，略過');continue}
      const recs=[];for(let i=hi+1;i<a.length;i++){const r=a[i],lab=text(r[0]);if(!lab)continue;if(/^(ttl|total)/i.test(lab))break;if(!/^(L|LINE|A)\s*\d+$/i.test(lab.replace(/\s+/g,'')))continue;
        const defects=kinds.map(k=>({name:k.name,qty:n(r[k.c])||0})).filter(d=>d.qty>0),totalDefect=n(r[cTotal]),output=n(r[cOut]),sumD=defects.reduce((s,d)=>s+d.qty,0);
        if(!(totalDefect>0||output>0||sumD>0))continue; // empty template rows (e.g. a blank SEP26 sheet) carry no information
        const rec={id:'',date,line:line(lab),reportKind:'sewingkpi',defects,totalDefect:totalDefect??sumD,sewingOutput:output??0,reportedRate:cPct>=0?n(r[cPct]):null,sourceFile:filename,sourceSheet:sn,sourceRow:i+1,issues:[],history:[]};
        if(totalDefect!=null&&sumD!==totalDefect)rec.issues.push('缺點加總 '+sumD+' 與 Total Defect '+totalDefect+' 不符，採 Total Defect');
        if(rec.sewingOutput>0&&rec.totalDefect>rec.sewingOutput)rec.issues.push('缺點數大於車縫產出，請核對');
        recs.push(rec)}
      if(isWeek){const top=[];for(const r of a.slice(hi+1)){const m=text(r[1]).match(/^TOP\s*(\d)/i);if(m&&n(r[2])!=null&&text(r[3]))top.push({rank:+m[1],qty:n(r[2]),name:text(r[3])})}weekly.push({sheet:sn,lines:recs,top,label:text(head[cTotal+0])});continue}
      recs.forEach(r=>{r.id=kpiId(r);warnings.push(...r.issues.map(x=>sn+' '+r.line+'：'+x))});daily.push(...recs)}
    if(!daily.length&&!weekly.length)return null;
    if(!daily.length)throw new Error('只有週彙總分頁，沒有每日分頁；請提供含 SEP21… 日分頁的檔案');
    // Weekly sheet is a cross-check only: it never adds a second set of quantities.
    for(const w of weekly){for(const wl of w.lines){const ds=daily.filter(r=>r.line===wl.line),d=ds.reduce((s,r)=>s+r.totalDefect,0),o=ds.reduce((s,r)=>s+r.sewingOutput,0);if(ds.length&&(d!==wl.totalDefect||o!==wl.sewingOutput))warnings.push(w.sheet+' '+wl.line+'：週表缺點／產出 '+wl.totalDefect+'／'+wl.sewingOutput+' 與日分頁加總 '+d+'／'+o+' 不同，採日分頁')}}
    const dates=[...new Set(daily.map(r=>r.date))].sort();
    return {records:[],kpi:daily,weeklyTop:weekly.map(w=>({sheet:w.sheet,top:w.top})),warnings,kind:'sewingkpi',period:[dates[0],dates.at(-1)]};
  }
  // KPI rows keep their own QK- identity (never rewritten to QC-), so cloud rows of the two kinds cannot collide.
  function kpiMerge(old,incoming){const fixed=(incoming||[]).map(r=>{const x=copy(r);x.line=line(x.line);x.reportKind='sewingkpi';if(!/^QK-/.test(String(x.id||'')))x.id=kpiId(x);return x});return baseMerge(old,fixed)}
  function kpiTotals(rs){const a=rs.filter(r=>!r.deleted),out=a.reduce((s,r)=>s+(n(r.sewingOutput)||0),0),def=a.reduce((s,r)=>s+(n(r.totalDefect)||0),0);return {records:a.length,lines:new Set(a.map(r=>r.line)).size,output:out,defects:def,rate:out?def/out:null,days:new Set(a.map(r=>r.date)).size}}
  function parse(wb,filename){const k=defectKpi(wb,filename);if(k)return k;const w=weekly(wb,filename);if(w)return w;const p=baseQC(wb,filename);
    for(const r of p.records){r.line=line(r.line);r.id=id(r);r.reportKind=r.reportKind||'daily';r.reconciliationGap=r.inspected-r.rejected-r.output;validate(r)}return {...p,kind:p.records.some(r=>r.reportKind==='weekly')?'export':'daily'};
  }
  const rank=r=>r.reportKind==='manual'?3:r.reportKind==='weekly'?1:2;
  const content=r=>Object.fromEntries(Object.entries(r).filter(([k,v])=>v!==undefined&&!['updatedAt','createdAt','history','sourceFile','sourceSheet','sourceRow','sourceComparisons'].includes(k)));
  function evidence(r){const v={kind:r.reportKind||'daily',inspected:r.inspected,rejected:r.rejected,output:r.output,reconciliationGap:r.inspected-r.rejected-r.output,reportedEfficiency:r.reportedEfficiency??null,sourceFile:r.sourceFile||'',sourceSheet:r.sourceSheet||''};v.fingerprint=C.hash({...v,sourceFile:undefined,sourceSheet:undefined});return v}
  function comparisons(...lists){return [...new Map(lists.flat().filter(Boolean).map(x=>[x.fingerprint,x])).values()].sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint))}
  function merge(old,incoming){const m=new Map((old||[]).map(r=>[r.id,copy(r)]));let added=0,updated=0,unchanged=0,protectedCount=0;
    for(const raw of incoming||[]){let r=copy(raw);r.line=line(r.line);r.id=id(r);const prior=m.get(r.id);if(prior?.deleted){unchanged++;protectedCount++;continue}
      if(prior&&rank(r)<rank(prior)){protectedCount++;const ev=comparisons(prior.sourceComparisons||[],evidence(r),r.sourceComparisons||[]);if(C.stable(ev)===C.stable(prior.sourceComparisons||[])){unchanged++;continue}r={...prior,sourceComparisons:ev};}
      else if(prior){r.sourceComparisons=comparisons(prior.sourceComparisons||[],r.sourceComparisons||[],rank(prior)<rank(r)?evidence(prior):null);if(!r.sourceComparisons.length)delete r.sourceComparisons;
        if(C.stable(content(prior))===C.stable(content(r))&&C.stable(prior.sourceComparisons||[])===C.stable(r.sourceComparisons||[])){unchanged++;continue}
      }
      if(prior){r.history=[...(prior.history||[]),{...prior,history:undefined}];updated++}else added++;
      r.updatedAt=new Date().toISOString();m.set(r.id,r);
    }return {records:[...m.values()],added,updated,unchanged,protected:protectedCount};
  }
  Object.assign(I,{qc:parse,validateQC:validate,qcTotals:totals,qcMerge:merge,qcLine:line,qcId:id,qcWeekly:weekly,qcDefectKpi:defectKpi,qcKpiId:kpiId,qcKpiTotals:kpiTotals,qcKpiMerge:kpiMerge});
})(typeof window!=='undefined'?window:globalThis);
