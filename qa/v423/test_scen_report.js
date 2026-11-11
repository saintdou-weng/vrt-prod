/* v4.23 — 情境報告 vrt-report-scen-v1.js（Paul 11/11：10～40 種情境、結論先行、色條）。Run: node qa/v423/test_scen_report.js [--show] */
const path=require('path'),assert=require('assert');const ROOT=process.env.VRT_ROOT||path.resolve(__dirname,'../..');
require(ROOT+'/vrt-daily-report-v1.js');require(ROOT+'/vrt-report-scen-v1.js');
const R=globalThis.VRTDailyReport,S=globalThis.VRTReportScen,H=R.helpers;const SHOW=process.argv.includes('--show');
const out=[];function test(name,fn){try{const d=fn();out.push({name,status:'PASS',detail:d});console.log('PASS',name,'·',d)}catch(e){out.push({name,status:'FAIL',detail:String(e.stack||e)});console.log('FAIL',name,'·',e.message)}}
function factory(o){o=o||{};const sew=[];
  for(let d='2026-08-01';d<=(o.until||'2026-11-30');d=H.addDays(d,1)){const work=R.isWorkday(d)||(o.extra&&o.extra.includes(d));if(!work)continue;if(o.skip&&o.skip.includes(d))continue;
    const ym=d.slice(0,7);let nL=o.partialOn===d?2:(o.linesOn&&o.linesOn[d])||o.lines||11;
    for(let i=1;i<=nL;i++){let w=25,eff=31,smv=8;if(ym==='2026-08'){smv=4;eff=27}if(o.mpOn&&o.mpOn[d])w=o.mpOn[d];if(o.mpDropFrom&&d>=o.mpDropFrom)w=19;if(o.effDay&&o.effDay[d]!=null)eff=o.effDay[d];if(o.smvFrom&&d>=o.smvFrom)smv=o.smv;if(o.weak&&o.weak.includes(i)&&(!o.weakOn||o.weakOn===d))eff=12;
      const att=w*480,pm=att*eff/100,pcs=Math.round(pm/smv);const r={date:d,section:i>=9?'Apron':'Garment',lineNo:'Line '+i,styleNo:'S'+i,pieces:pcs,workers:w,efficiency:eff,producedMinutes:pm,attendedMinutes:att,smv};
      if(o.otOn===d&&i<=4){r.otPcs=120;r.workersOT=20;r.hoursOT=2}sew.push(r);
      if(o.targetOn===d){const iss={};if(i===3)iss.material=1;if(i===5||i===6)iss.machine=1;if(i===8)iss.manpower=1;sew.push({date:d,section:'Sewing',lineNo:'Line '+i,pieces:pcs,workers:w,efficiency:eff,tSrc:'target',target:Math.round(pcs*(i===3?1.6:1.05)),issue:iss,remark:i===3?'waiting fabric from warehouse 2 hours':i===5?'power cut 10:00-11:30':''})}}}
  return {sewing:sew,cutting:o.cutting||[],shipping:o.shipping||[],custstats:o.custstats||{},prodplan:o.prodplan||[],qc:{records:o.qc||[],kpi:[]},wipFallback:o.wip||null}}
const seen=new Set();const samples={};
function run(data,opts,label){const f=R.compute(data,Object.assign({today:'2026-12-31'},opts));f.x=S.extras(data,f);const r=S.render(f,opts&&opts.note?{note:opts.note}:{});r.scen.forEach(z=>seen.add(z.id));if(label)samples[label]=r.text;
  /* 每個數字都要找得到來源：facts（含 f.x）裡的數字，或 12 以內的計數／天數 */
  const chk=R.checkAiText(r.text.split('\n').filter(l=>!/^📌/.test(l)).join('\n').replace(/[🟩🟨🟥🟦⬜]/gu,''),f);const bad=chk.bad.filter(b=>{const n=Number(String(b).replace(/[^\d.]/g,''));return !(Number.isInteger(n)&&n<=66)});assert(!bad.length,(label||'')+' numbers without a source: '+bad.join(',')+'\n'+r.text);
  [/值得注意/,/綜上所述/,/不僅/,/管理判定/,/——/].forEach(rx=>assert(!rx.test(r.text),'banned phrase '+rx));
  assert(r.html.indexOf('<b>')>0);assert(r.scen.length>=1&&r.scen[0].head.length>6,'no headline');
  return {f,r,ids:r.scen.map(z=>z.id),top:r.scen[0].id}}
const has=(x,id)=>assert(x.ids.includes(id),id+' missing: '+x.ids.join());
const PLAN=[];for(let i=1;i<=11;i++){if(i===9)continue;PLAN.push({month:'2026-11',line:'Line '+i,style:'ST'+i,customer:i===7?'ADI CMT':i<=8?'ADI':'WPL',product:'Garment',sewingQty:9000,startDate:i===4?'2026-11-12':'2026-11-10',endDate:i===4?'2026-11-12':'2026-11-14',dailyOutput:1800,manpower:25})}
PLAN.push({month:'2026-11',line:'Line 9',style:'ST9',customer:'WPL',sewingQty:5000,startDate:'2026-11-02',endDate:'2026-11-07'});PLAN.push({month:'2026-11',line:'Line 2',style:'NODATE',customer:'ADI',sewingQty:800});
test('平穩日：一句結論＋色條＋各組燈號；不超過 26 行',()=>{const x=run(factory({effDay:{'2026-11-12':28}}),{date:'2026-11-13'},'平穩日');assert.equal(x.top,'steady',x.ids.join());assert(/🟨|🟩/u.test(x.r.text)&&/各組效率/.test(x.r.text));assert(x.r.lines<=26,'lines '+x.r.lines);return x.r.lines+' 行'});
test('沒有資料／日報沒到齊',()=>{const n=run({sewing:[],cutting:[]},{date:'2026-11-12'},'沒有資料');assert.equal(n.top,'nodata');const p=run(factory({partialOn:'2026-11-05'}),{date:'2026-11-05'},'日報沒到齊');assert.equal(p.top,'partial');assert(!p.ids.includes('lineCut')&&!p.ids.includes('absent'));return 'ok'});
test('放假：假前、收假、假日加班、週內放假（短週）',()=>{has(run(factory(),{date:'2026-11-06'},'假前'),'beforeHoliday');const a=run(factory(),{date:'2026-11-26'},'收假');assert.equal(a.top,'afterBreak',a.ids.join());
  const o=run(factory({extra:['2026-11-09'],linesOn:{'2026-11-09':5}}),{date:'2026-11-09'},'假日加班');assert.equal(o.top,'otHoliday',o.ids.join());assert(/獨立日加班/.test(o.r.text));
  const w=run(factory(),{date:'2026-11-25',period:'week'},'短週（送水節）');assert.equal(w.top,'shortWeek',w.ids.join());assert(/🎌 送水節/.test(w.r.text));return 'ok'});
test('停工：日報（中間幾天沒日報）與週報（這週少做幾天）',()=>{const d=run(factory({skip:['2026-11-17','2026-11-18']}),{date:'2026-11-19'},'停工後復工');assert.equal(d.top,'stopGap',d.ids.join());assert(/11\/17、11\/18/.test(d.r.text));
  const w=run(factory({skip:['2026-11-17','2026-11-18']}),{date:'2026-11-19',period:'week'},'週報有停工');assert.equal(w.top,'stopDays',w.ids.join());assert(/⛔ 沒有生產/.test(w.r.text));return 'ok'});
test('加班、加減組、少人、人力比上月少',()=>{has(run(factory({otOn:'2026-11-12'}),{date:'2026-11-12'},'加班'),'overtime');
  const c=run(factory({linesOn:{'2026-11-12':9}}),{date:'2026-11-12'},'減組');assert.equal(c.top,'lineCut',c.ids.join());
  has(run(factory({linesOn:{'2026-11-11':9}}),{date:'2026-11-12'},'加組'),'lineAdd');
  const a=run(factory({mpOn:{'2026-11-12':21}}),{date:'2026-11-12'},'少人');has(a,'absent');
  has(run(factory({mpDropFrom:'2026-11-02'}),{date:'2026-11-05'},'人力比上月少'),'manpower');return 'ok'});
test('料／機台／突發：現場回報原因與備註；手動備註置頂',()=>{const x=run(factory({targetOn:'2026-11-12'}),{date:'2026-11-12',note:'10:00 全廠停電 1.5 小時'},'現場回報＋突發備註');has(x,'floorIssue');assert(/現場回報/.test(x.r.text)&&/缺料 1 組/.test(x.r.text)&&/機台 2 組/.test(x.r.text)&&/power cut/.test(x.r.text)&&/📌 10:00 全廠停電/.test(x.r.text));assert.equal(x.f.x.target.rows,11);return 'ach '+x.f.x.target.ach+'%'});
test('效率：下滑（點名）、上升、全廠紅燈、全線綠燈、本月最高／最低、款式工時',()=>{const dn=run(factory({effDay:{'2026-10-21':24},weak:[3,8],weakOn:'2026-10-21'}),{date:'2026-10-21'},'效率下滑');assert.equal(dn.top,'effDown',dn.ids.join());assert(/L3|L8/.test(dn.r.scen[0].head));
  has(run(factory({effDay:{'2026-10-20':28,'2026-10-21':36}}),{date:'2026-10-21'},'效率上升'),'effUp');
  has(run(factory({effDay:{'2026-10-20':23,'2026-10-21':22}}),{date:'2026-10-21'},'全廠紅燈'),'effRed');
  has(run(factory(),{date:'2026-11-12'}),'allGreen');
  has(run(factory({effDay:{'2026-11-12':33}}),{date:'2026-11-12'}),'dayHigh');has(run(factory({effDay:{'2026-11-12':26}}),{date:'2026-11-12'},'本月最低'),'dayLow');
  has(run(factory({smvFrom:'2026-11-02',smv:4}),{date:'2026-11-05'}),'mix');return 'ok'});
test('品質、QC 對不上、沒 QC、裁片堆／快斷、沒裁剪、差太多先查',()=>{const qc=[{date:'2026-11-05',line:'Line 3',reportKind:'daily',inspected:500,rejected:80,output:500,defects:[{name:'Skip stitch',qty:50}]},{date:'2026-11-05',line:'Line 1',reportKind:'daily',inspected:800,rejected:16,output:800,defects:[]}];
  has(run(factory({weak:[3],weakOn:'2026-11-05',qc}),{date:'2026-11-05'},'低效＋退修'),'dualRisk');
  const hi=[{date:'2026-11-05',line:'Line 1',reportKind:'daily',inspected:1000,rejected:150,output:16000,defects:[{name:'Broken stitch',qty:90}]}];has(run(factory({qc:hi}),{date:'2026-11-05'},'退修高'),'qcHigh');
  const x=run(factory({wip:{cutNotSewn:300000,basis:'custstats'}}),{date:'2026-11-12'});has(x,'wipPile');has(x,'qcMissing');has(x,'noCut');
  has(run(factory({wip:{cutNotSewn:5000,basis:'custstats'}}),{date:'2026-11-12'},'裁片快斷'),'wipLow');
  has(run(factory({effDay:{'2026-11-12':12}}),{date:'2026-11-12'},'差太多先查'),'bigSwing');return 'ok'});
test('月初、月底、落後、超前、出貨逾期／兩週內出貨、缺布、客戶統計過期、代工',()=>{has(run(factory(),{date:'2026-11-02'},'月初'),'monthStart');
  const pl=[{month:'2026-11',sewingQty:900000}];has(run(factory({prodplan:pl}),{date:'2026-11-28'},'月底'),'monthEnd');has(run(factory({prodplan:pl}),{date:'2026-11-12'},'本月落後'),'behind');has(run(factory({prodplan:[{month:'2026-11',sewingQty:60000}]}),{date:'2026-11-12'}),'ahead');
  const ship=[{cust:'ADI',po:'204400',style:'O1114K',orig:9000,shipped:0,open:9000,etd:'2026-11-07',status:'outstanding'},{cust:'WPL',po:'W1',style:'N1',orig:21600,shipped:0,open:21600,etd:'2026-11-03',status:'outstanding'}];
  const cs={overall:{actualNotSewn:300000,noFabric:180000,cuttingWip:80000},details:[{customer:'ADI',po:'204292',style:'X',noFabric:180000}],snapshotDate:'2026-11-03'};
  const x=run(factory({shipping:ship,custstats:cs}),{date:'2026-11-05'},'逾期＋缺布');has(x,'shipOverdue');has(x,'fabric');
  has(run(factory({shipping:[ship[0]]}),{date:'2026-11-04'}),'shipSoon');
  has(run(factory({custstats:Object.assign({},cs,{snapshotDate:'2026-09-29'})}),{date:'2026-11-05'}),'fabricStale');
  has(run(factory({prodplan:PLAN}),{date:'2026-11-12'},'代工'),'cmt');return 'ok'});
test('效率週報：每天色條、接單月數',()=>{const mk=n=>({overall:{actualNotSewn:n,noFabric:0},details:[],snapshotDate:'2026-11-03'});
  const a=run(factory({custstats:mk(900000)}),{date:'2026-11-04',period:'week'},'效率週報');has(a,'backlogHigh');assert(/🗓 每天/.test(a.r.text)&&/VRT 效率週報/.test(a.r.text));
  has(run(factory({custstats:mk(50000)}),{date:'2026-11-04',period:'week'}),'backlogLow');const f1=a.f;has(run(factory({custstats:mk(f1.months.prev.pieces*1.4)}),{date:'2026-11-04',period:'week'}),'backlogOk');return a.r.lines+' 行'});
test('排單週報：空線、中途空檔、下週未排、沒填日期、達成、集中度、負荷色條；沒有排單資料',()=>{const x=run(factory({prodplan:PLAN,until:'2026-11-12'}),{date:'2026-11-12',today:'2026-11-12',period:'week',kind:'plan'},'排單週報');
  ['emptyLines','nextEmpty','undated','concentration','shortWeek'].forEach(id=>has(x,id));assert.equal(x.top,'emptyLines',x.ids.join());assert(/L9.*沒排單/.test(x.r.text)&&/🟦/.test(x.r.text)&&/本週負荷/.test(x.r.text));
  const full=[];for(let i=1;i<=11;i++)full.push({month:'2026-11',line:'Line '+i,style:'ST'+i,customer:'C'+(i%4),sewingQty:9000,startDate:'2026-11-16',endDate:'2026-11-28'});
  const y=run(factory({prodplan:full,until:'2026-11-18'}),{date:'2026-11-18',today:'2026-11-18',period:'week',kind:'plan'},'排單週報（排滿）');has(y,'loadFull');
  const n=run(factory(),{date:'2026-11-12',period:'week',kind:'plan'});assert.equal(n.top,'noplan');
  const few=[];for(let i=1;i<=11;i++)few.push({month:'2026-11',line:'Line '+i,style:'ST'+i,customer:'C'+(i%4),sewingQty:900,startDate:'2026-11-16',endDate:'2026-11-17'});for(let k=0;k<4;k++)few.push({month:'2026-11',line:'Line 1',style:'CH'+k,customer:'C1',sewingQty:300,startDate:H.addDays('2026-11-18',k),endDate:H.addDays('2026-11-18',k)});
  const z=run(factory({prodplan:few,until:'2026-11-18'}),{date:'2026-11-18',today:'2026-11-18',period:'week',kind:'plan'},'排單週報（排不滿、換款多）');['loadLow','gap','changeover','attainHigh'].forEach(id=>has(z,id));return x.r.lines+' 行'});
test('目標沒達成（現場沒勾原因）',()=>{const d=factory({targetOn:'2026-11-12'});d.sewing.forEach(r=>{if(r.tSrc==='target'){r.issue={};r.remark='';r.target=Math.round(r.pieces*1.4)}});const x=run(d,{date:'2026-11-12'},'目標沒達成');has(x,'targetMiss');return x.f.x.target.ach+'%'});
test('排單週報新版（11/11 報告第六節）：三句結論、件數＋工時、兩個完工日、節前節後空檔、交期對櫃、排單表檢查、日報停更提醒',()=>{
  const P=[];const mk=(l,style,qty,st,en,daily,smv,cust,extra)=>P.push(Object.assign({month:'2026-11',line:'Line '+l,style,customer:cust||'ADI',product:'Garment',sewingQty:qty,startDate:st,endDate:en,dailyOutput:daily,smv:smv,cutQty:qty,po:'P'+l},extra||{}));
  mk(1,'CHEF',2000,'2026-11-16','2026-11-26',250,24,'ALSCO',{cutQty:0});mk(2,'HA1521',1272,'2026-11-10','2026-11-18',300,12);mk(3,'A1544G',5904,'2026-11-17','2026-11-30',600,10,'ADI',{cutQty:0});mk(2,'A1544G',500,'2026-11-17','2026-11-18',600,10,'ADI',{po:'P3'});
  mk(5,'CS127',3732,'2026-11-10','2026-11-20',500,9,'MAGNUS');mk(9,'A050',60000,'2026-11-13','2026-11-21',8000,0.4,'ASL');mk(9,'P050',20000,'2026-11-26','2026-11-28',8000,0,'ASL',{cutQty:0});mk(11,'TC1',6340,'2026-11-10','2026-11-30',400,6,'ASL');
  const cs={overall:{actualNotSewn:90000,noFabric:9000,cuttingWip:20000},snapshotDate:'2026-11-10',details:[{customer:'ADI',po:'204400',style:'T3539',etd:'2026-11-28',orderQty:1380,balanceQty:1380,fgPcs:0,actualNotSewn:1380,noFabric:0},{customer:'ADI',po:'204292',style:'A1544G',etd:'2026-11-28',orderQty:5904,balanceQty:5904,fgPcs:2000,actualNotSewn:3904,noFabric:0},{customer:'ASL',po:'S1',style:'A050',etd:'2026-11-21',orderQty:60000,balanceQty:60000,fgPcs:10000,actualNotSewn:50000,noFabric:0}]};
  const ship=[{cust:'ASL',po:'S1',style:'A050',orig:60000,shipped:0,open:60000,etd:'2026-11-21',status:'outstanding'}];
  const x=run(factory({prodplan:P,custstats:cs,shipping:ship,until:'2026-11-13'}),{date:'2026-11-17',today:'2026-11-17',period:'week',kind:'plan'},'排單週報新版');const po=x.f.x.po;assert(po,'no plan outlook: '+x.f.x.poError);
  ['dataLag','slip','idleAfter','unscheduled','dupStyle','dueNoBox'].forEach(id=>has(x,id));assert.equal(x.top,'dataLag',x.ids.join());
  assert.equal(po.holiday.name,'送水節');assert.equal(po.preDays,5);assert.equal(po.postDays,4);assert(po.slipLines.includes('L3'),'L3 should slip: '+JSON.stringify(po.lines.filter(z=>z.line==='L3')));
  const l3=po.lines.filter(z=>z.line==='L3')[0];assert(l3.cautious>'2026-11-30'&&l3.planEnd==='2026-11-30');assert(po.idleAfter.includes('L2')&&po.idleAfter.includes('L5'));
  assert(po.check.smvMissing.includes('P050'));assert(po.check.unscheduled[0].style==='T3539'&&po.check.unscheduled[0].qty===1380);assert(po.check.dups[0].style==='A1544G');
  const adi=po.due.filter(z=>z.customer==='ADI')[0],asl=po.due.filter(z=>z.customer==='ASL')[0];assert(adi.open===7284&&!adi.container&&asl.container);
  ['三句話結論','現在的位置','工時','各組做到哪','送水節前','月底前後交期','排單表要修','⚠️沒櫃'].forEach(k=>assert(x.r.text.indexOf(k)>=0,'missing '+k+'\n'+x.r.text));assert(x.r.lines<=48,'lines '+x.r.lines);
  const d=run(factory({prodplan:P,until:'2026-11-17',targetOn:'2026-11-17'}),{date:'2026-11-17',today:'2026-11-17'},'日報（各組明細）');assert(/這張單剩多少/.test(d.r.text)&&/標準工時/.test(d.r.text)&&/剩 [\d,]+・\d+\/\d+/.test(d.r.text),d.r.text);
  return x.r.lines+' 行；pace '+po.pace+'%；slip '+po.slip});
test('情境至少 40 種都被測到；圖表資料',()=>{assert(seen.size>=40,'only '+seen.size+': '+[...seen].join(' '));const f=R.compute(factory(),{date:'2026-11-12',today:'2026-12-31'});const c=S.chart(f);assert(c.labels.length===11&&c.values.every(v=>v>0)&&c.tones.every(t=>/[GAR]/.test(t)));
  const miss=S.CATALOG.filter(id=>!seen.has(id));return seen.size+' 種；未測到：'+(miss.join(' ')||'無')});
const fails=out.filter(x=>x.status!=='PASS').length;try{require('fs').writeFileSync(path.join(__dirname,'scen_report_results.json'),JSON.stringify(out,null,1));require('fs').writeFileSync(path.join(__dirname,'scen_report_samples.txt'),Object.keys(samples).map(k=>'【'+k+'】\n'+samples[k]).join('\n\n\n'))}catch(_){}
if(SHOW)Object.keys(samples).forEach(k=>console.log('\n【'+k+'】\n'+samples[k]));
console.log((out.length-fails)+'/'+out.length+' passed');process.exit(fails?1:0);
