/* v4.20 — 生產日報／效率週報／排單週報 readable Telegram layout (vrt-daily-report-v1.js 1.3): one fact per line, verdict first, plain words,
   numbered 要處理 with owner, data-time footer. Numbers come from compute() unchanged. Run: node qa/v420/test_readable_report.js [zh|both] */
const path=require('path'),assert=require('assert');const ROOT=process.env.VRT_ROOT||path.resolve(__dirname,'../..');
require(ROOT+'/vrt-daily-report-v1.js');const R=globalThis.VRTDailyReport;
function synth(D){const prev=R.helpers.addDays(D,-1),lw=R.helpers.addDays(D,-7);const sew=[],cut=[],qc=[],needle=[],ship=[];
  const lines=['Line 1','Line 2','Line 3','Line 4'];const mk=(d,ln,p,pm,am,st)=>sew.push({date:d,section:'Garment',lineNo:ln,styleNo:st||'ST'+ln.slice(-1),pieces:p,workers:20,efficiency:Math.round(pm/am*100),producedMinutes:pm,attendedMinutes:am});
  lines.forEach((ln,i)=>{for(let k=0;k<14;k++){const d=R.helpers.addDays(D,-k);if(R.helpers.dowMon0(d)===6)continue;mk(d,ln,(1000+i*100)-k*10,((1000+i*100)-k*10)*5,(i===3?12000:7000))}});
  cut.push({date:D,section:'Garment',lineNo:'Table A',styleNo:'ST1',pieces:3000,src:'daily'},{date:D,section:'Garment',lineNo:'Weekly Report',styleNo:'ST1',pieces:99999,src:'ref'},{date:prev,section:'Garment',lineNo:'Table A',styleNo:'ST2',pieces:2500,src:'daily'});
  qc.push({date:D,line:'Line 1',reportKind:'daily',inspected:900,rejected:9,defects:[{name:'Skip stitch',qty:5},{name:'Dirty',qty:3},{name:'Broken',qty:1}]},{date:D,line:'Line 2',reportKind:'daily',inspected:900,rejected:9,defects:[{name:'Dirty',qty:9}]},{date:D,line:'Line 4',reportKind:'daily',inspected:800,rejected:96,defects:[{name:'Skip stitch',qty:60},{name:'Open seam',qty:36}]},{date:prev,line:'Line 1',reportKind:'daily',inspected:900,rejected:18,defects:[]});
  for(let k=1;k<=20;k++){const d=R.helpers.addDays(D,-k);needle.push({date:d,line:'Line 2',qty:1,reasonClass:'broken',needleType:'DB×1 14'},{date:d,line:'Line 1',qty:2,reasonClass:'changeover',needleType:'DB×1 14'})}
  needle.push({date:D,line:'Line 2',qty:6,reasonClass:'broken',needleType:'DB×1 14'},{date:D,line:'Line 1',qty:2,reasonClass:'changeover',needleType:'DB×1 11'});
  const ws=R.helpers.addDays(D,-R.helpers.dowMon0(D));ship.push({cust:'ACME',po:'PO-1',style:'ST1',orig:5000,shipped:5000,open:0,etd:ws,status:'shipped'},{cust:'ACME',po:'PO-2',style:'ST2',orig:3000,shipped:0,open:3000,etd:R.helpers.addDays(D,-1)<ws?ws:R.helpers.addDays(D,-1),status:'outstanding'},{cust:'BETA',po:'PO-3',style:'ST3',orig:2000,shipped:1000,open:1000,etd:R.helpers.addDays(ws,6),status:'outstanding'});
  const styles=[{sk:'ST1',customer:'ACME',qty:10000,cutPcs:8000,sewPcs:6000,status:'sew'},{sk:'ST2',customer:'ACME',qty:5000,cutPcs:5000,sewPcs:5000,status:'done'},{sk:'ST3',customer:'BETA',qty:3000,cutPcs:1500,sewPcs:0,status:'cut'}];
  const custstats={snapshotDate:R.helpers.addDays(D,-9),overall:{noFabric:303987,cuttingWip:80193,actualNotSewn:384180},details:[{customer:'BETA',po:'PO-3',style:'ST3',noFabric:1200},{customer:'ACME',po:'PO-2',style:'ST2',noFabric:0}]};
  const ym=D.slice(0,7);const prodplan=[];const addRun=(line,style,cust,st,en,qty)=>prodplan.push({month:ym,line,style,customer:cust,startDate:st,endDate:en,sewingQty:qty,orderQty:qty,po:'P'+style});
  addRun('Line 1','W154','ASL',R.helpers.addDays(ws,0),R.helpers.addDays(ws,5),12000);addRun('Line 2','W154','ASL',R.helpers.addDays(ws,0),R.helpers.addDays(ws,2),6000);addRun('Line 2','A200','ADI',R.helpers.addDays(ws,3),R.helpers.addDays(ws,12),9000);
  addRun('Line 5','B300','ADI',R.helpers.addDays(ws,0),R.helpers.addDays(ws,1),2000);addRun('Line 5','B301','ADI',R.helpers.addDays(ws,4),R.helpers.addDays(ws,5),2000);addRun('Line 6','C1','WPL',R.helpers.addDays(ws,-6),R.helpers.addDays(ws,5),8000);
  addRun('Line 3','X9','ASL',R.helpers.addDays(ws,-10),R.helpers.addDays(ws,-2),5000);addRun('Line 4','X8','ASL',R.helpers.addDays(ws,-10),R.helpers.addDays(ws,-2),5000);addRun('Line 9','N1','ASL',R.helpers.addDays(ws,8),R.helpers.addDays(ws,12),4000);
  prodplan.push({month:ym,line:'Line 7',style:'U1',customer:'ASL',startDate:'',endDate:'',sewingQty:3000,orderQty:3000});
  return {sewing:sew,cutting:cut,qc:{records:qc,kpi:[]},spareparts:{needle,part:[{date:D,line:'Line 3',qty:2,reasonClass:'damage',partType:'Looper'}]},shipping:ship,custstats,styles,prodplan}}
const D='2026-10-22';const d=synth(D);
for(const [period,kind] of [['day','day'],['week','eff'],['week','plan']]){
  const f=R.compute(d,{date:D,today:'2026-10-27',period,kind});const r=R.render(f,{lang:process.argv[2]||'zh'});
  console.log('==== '+period+' '+kind+' · zh '+r.zhChars+' chars · text '+r.text.length+' · html '+r.html.length);console.log(r.text);
  const chk=R.checkAiText(r.text,f);console.log('checkAiText own text:',chk.ok,chk.bad.join(','));
  assert(chk.ok,'own text must pass the number check');
  const t=r.text;assert(/^(📰|📋) /.test(t));assert(/^整體：/m.test(t));assert(/^要處理$/m.test(t));assert(/^ℹ️ 資料：/m.test(t));assert(!/│/.test(t),'no │ chains');assert(!/暴露量|核實餘量|組日＝/.test(t.split('\n').filter(l=>/^整體/.test(l)).join('')));
  assert(t.length<=3800,'fits one Telegram message');assert(/<b>/.test(r.html)&&!/<script/.test(r.html));
  if(kind==='plan'){assert(/本週負荷/.test(t)&&/下週 /.test(t)&&/客戶集中度/.test(t));assert(/L3、L4、L9/.test(t),'empty lines listed with 、');assert(/1\. 生管／PMC：/.test(t))}
  else{assert(/車縫/.test(t)&&/裁剪/.test(t)&&/品質/.test(t)&&/機修/.test(t));assert(/退修率 4\.38%/.test(t)||/退修率 3\.77%/.test(t))}
  if(period==='day')assert(/今天 4,600 件（4 條線、80 人）/.test(t),t);
}
/* both: every Chinese bullet has an English line under it */
{const f=R.compute(d,{date:D,today:'2026-10-27',period:'day'});const r=R.render(f,{lang:'both'});const ls=r.text.split('\n');let zhB=0,enL=0;ls.forEach(l=>{if(/^• /.test(l))zhB++;if(/^  \S/.test(l))enL++});assert(enL>=zhB,'English lines '+enL+' < bullets '+zhB);
 const c=R.renderCompact(f);assert(/1️⃣/.test(c.text),'compact layout still available for the Word export tests');console.log('both-language check ok ·',zhB,'bullets /',enL,'English lines · compact ok')}
console.log('ALL PASS');
