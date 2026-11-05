/* v4.21 — 生產日報／週報 中文人性化版 (vrt-daily-report-v1.js 2.0, Paul 11/05):
   只要中文、排列整齊、數字正確；看行事曆（柬埔寨國定假日）、比較當月／上月／前月（每個生產日）、接下來的出貨與接單；
   至少十來種情境寫法；AI 提示詞只要中文、照 Paul 週報的語氣、不能改數字。Run: node qa/v421/test_story_report.js */
const path=require('path'),assert=require('assert');const ROOT=process.env.VRT_ROOT||path.resolve(__dirname,'../..');
require(ROOT+'/vrt-daily-report-v1.js');const R=globalThis.VRTDailyReport;const H=R.helpers;
const out=[];function test(name,fn){try{const d=fn();out.push({name,status:'PASS',detail:d});console.log('PASS',name,'·',d)}catch(e){out.push({name,status:'FAIL',detail:String(e.stack||e)});console.log('FAIL',name,'·',e.message)}}
/* synthetic factory: 11 lines, Aug–Nov 2026; knobs change one thing at a time */
function factory(o){o=o||{};const sew=[];const lines=o.lines||11;
  for(let d='2026-08-01';d<=(o.until||'2026-11-30');d=H.addDays(d,1)){if(!R.isWorkday(d))continue;if(o.skip&&o.skip.includes(d))continue;
    const ym=d.slice(0,7);const nL=o.partialOn===d?2:lines;
    for(let i=1;i<=nL;i++){let w=25,eff=30,smv=8;if(ym==='2026-08'){smv=4;eff=27}if(o.mpDropFrom&&d>=o.mpDropFrom)w=19;if(o.effDay&&o.effDay[d]!=null)eff=o.effDay[d];if(o.smvFrom&&d>=o.smvFrom)smv=o.smv;if(o.weak&&o.weak.includes(i)&&(!o.weakOn||o.weakOn===d))eff=12;
      const att=w*480,pm=att*eff/100,pcs=Math.round(pm/smv);sew.push({date:d,section:i>=9?'Apron':'Garment',lineNo:'Line '+i,styleNo:'S'+i,pieces:pcs,workers:w,efficiency:eff,producedMinutes:pm,attendedMinutes:att,smv})}}
  return {sewing:sew,cutting:[],shipping:o.shipping||[],custstats:o.custstats||{},prodplan:o.prodplan||[],qc:{records:o.qc||[],kpi:[]}}}
const ids=f=>f.scenarios.map(x=>x.id);
const seen=new Set();const run=(data,opts)=>{const f=R.compute(data,Object.assign({today:'2026-12-31'},opts));f.scenarios.forEach(x=>seen.add(x.id));return f};
const BANNED=[/不是[^。\n]{0,30}而是/,/與其說/,/值得注意/,/說白了/,/先說結論/,/——/,/賦能|抓手|閉環|底層邏輯/];
function checkText(f,label){const r=R.render(f,{lang:'zh'});const t=r.text;
  BANNED.forEach(rx=>assert(!rx.test(t),label+': banned phrase '+rx+'\n'+t));
  assert(!/[A-Za-z]{3,}(?:\s+[A-Za-z]{3,}){3,}/.test(t.replace(/PO\s*\S+/g,'')),label+': English sentence found\n'+t);
  const chk=R.checkAiText(t,f);assert(chk.ok,label+': numbers not from facts '+chk.bad.join(',')+'\n'+t);
  assert(r.html.startsWith('<b>'),label+': title not bold');return r}
test('行事曆：柬埔寨 2026 國定假日；11 月扣掉週日、獨立日、送水節 = 21 個工作天（Paul 11 月排單報告）；10 月有亡人節',()=>{
  let n=0;for(let d='2026-11-01';d<='2026-11-30';d=H.addDays(d,1))if(R.isWorkday(d))n++;assert.equal(n,21);
  assert(!R.isWorkday('2026-11-09')&&!R.isWorkday('2026-11-24')&&!R.isWorkday('2026-10-11')&&R.isWorkday('2026-11-10'));
  const runs=R.holidayRuns('2026-11-01','2026-11-30');assert.deepEqual(runs.map(r=>r.name+r.days),['獨立日1','送水節3']);return 'Nov workdays '+n+' · '+runs.map(r=>r.start+' '+r.name).join(', ')});
test('月度比較用每個生產日：本月到今天、上月、前月；標準工時＝件數×SMV（日報沒有 producedMinutes 時）',()=>{
  const d=factory();d.sewing.forEach(r=>{if(r.date<'2026-10-01'){r.producedMinutes=0;r.attendedMinutes=0}});const f=run(d,{date:'2026-11-04'});const M=f.months;
  assert.equal(M.cur.ym,'2026-11');assert.equal(M.prev.ym,'2026-10');assert.equal(M.prev2.ym,'2026-09');
  let oct=0;for(let x='2026-10-01';x<='2026-10-31';x=H.addDays(x,1))if(R.isWorkday(x))oct++;assert.equal(M.prev.days,oct,'Oct production days = workdays without holidays');
  const sep=d.sewing.filter(r=>r.date.slice(0,7)==='2026-09');const eh=Math.round(sep.reduce((s,r)=>s+r.pieces*r.smv,0)/60);assert.equal(M.prev2.earnedH,eh,'Sep earned hours from pcs×SMV');
  const t=checkText(f,'month').text;assert(/跟前幾個月比（以每個生產日計）/.test(t)&&/10月　\d+ 天｜日均/.test(t));return 'Oct '+M.prev.days+' days, '+M.prev.perDay+'/day · Sep earned '+eh+' h'});
test('月初：先回頭看上月（含和前月比）',()=>{const f=run(factory(),{date:'2026-11-02'});assert.equal(ids(f)[0],'monthStart',ids(f).join());assert(/10月/.test(f.scenarios[0].zh));checkText(f,'monthStart');return f.scenarios[0].zh.slice(0,60)});
test('節後復工：送水節後第一天',()=>{const f=run(factory(),{date:'2026-11-26'});assert(ids(f).includes('afterBreak'),ids(f).join());assert(/送水節/.test(f.scenarios.find(x=>x.id==='afterBreak').zh));checkText(f,'afterBreak');return f.scenarios.find(x=>x.id==='afterBreak').zh.slice(0,50)});
test('假前：獨立日前 3 個工作日內',()=>{const f=run(factory(),{date:'2026-11-06'});assert(ids(f).includes('beforeHoliday'),ids(f).join());assert(/獨立日/.test(f.scenarios.find(x=>x.id==='beforeHoliday').zh));const t=checkText(f,'beforeHoliday').text;assert(/假日　11\/9（一） 獨立日/.test(t),t);return 'ok'});
test('月底＋落後：月目標還差很多',()=>{const d=factory({prodplan:[{month:'2026-11',sewingQty:900000}]});const f=run(d,{date:'2026-11-28'});assert(ids(f).includes('monthEnd'),ids(f).join());assert.equal(f.plan.workdaysLeft,R.isWorkday('2026-11-30')?1:0);checkText(f,'monthEnd');
  const f2=run(d,{date:'2026-11-12'});assert(ids(f2).includes('behind'),ids(f2).join());checkText(f2,'behind');return 'monthEnd left '+f.plan.workdaysLeft+' · behind '+f2.plan.completion+'% vs '+f2.plan.elapsedShare+'%'});
test('超前：月目標做得比時間快',()=>{const f=run(factory({prodplan:[{month:'2026-11',sewingQty:60000}]}),{date:'2026-11-12'});assert(ids(f).includes('ahead'),ids(f).join());checkText(f,'ahead');return f.plan.completion+'%'});
test('效率上升／下滑（下滑時點名低效組）',()=>{const up=run(factory({effDay:{'2026-10-20':28,'2026-10-21':36}}),{date:'2026-10-21'});assert(ids(up).includes('effUp'),ids(up).join());checkText(up,'effUp');
  const dn=run(factory({effDay:{'2026-10-21':24},weak:[3,8],weakOn:'2026-10-21'}),{date:'2026-10-21'});assert(ids(dn).includes('effDown'),ids(dn).join());assert(/L3|L8/.test(dn.scenarios.find(x=>x.id==='effDown').zh));checkText(dn,'effDown');return 'up '+up.compare.effVsPrevPt.toFixed(1)+' · down '+dn.compare.effVsPrevPt.toFixed(1)});
test('人力下降（比上月每天平均少 6% 以上）→ 請 HRA 盤缺員',()=>{const f=run(factory({mpDropFrom:'2026-11-02'}),{date:'2026-11-05'});assert(ids(f).includes('manpower'),ids(f).join());assert(/HRA/.test(f.scenarios.find(x=>x.id==='manpower').zh));checkText(f,'manpower');return f.manpowerTrend.vsMonthPct.toFixed(1)+'%'});
test('產品組合：本月款式工時短很多 → 件數多不代表做得多',()=>{const f=run(factory({smvFrom:'2026-11-02',smv:4}),{date:'2026-11-05'});assert(ids(f).includes('mix'),ids(f).join());checkText(f,'mix');return f.mixShift.toFixed(0)+'%'});
test('日報沒到齊：只有 2 條線 → 不拿來比，也不觸發人力／效率情境',()=>{const f=run(factory({partialOn:'2026-11-05'}),{date:'2026-11-05'});assert.equal(ids(f)[0],'partial');assert(!ids(f).includes('manpower')&&!ids(f).includes('effDown'),ids(f).join());checkText(f,'partial');return f.scenarios[0].zh.slice(0,40)});
test('品質：雙重風險線（低效＋高退修）',()=>{const qc=[{date:'2026-11-05',line:'Line 3',reportKind:'daily',inspected:500,rejected:80,output:500,defects:[{name:'Skip stitch',qty:50}]},{date:'2026-11-05',line:'Line 1',reportKind:'daily',inspected:800,rejected:16,output:800,defects:[]}];
  const f=run(factory({weak:[3],weakOn:'2026-11-05',qc}),{date:'2026-11-05'});assert(ids(f).includes('quality'),ids(f).join());checkText(f,'quality');return f.riskLines.dual.join()});
test('出貨：未來兩週的船期 + 逾期；缺布；已裁未縫堆積',()=>{const ship=[{cust:'ADI',po:'204400',style:'O1114K',orig:9000,shipped:0,open:9000,etd:'2026-11-07',status:'outstanding'},{cust:'WPL',po:'W1',style:'N1',orig:21600,shipped:0,open:21600,etd:'2026-11-03',status:'outstanding'}];
  const cs={overall:{actualNotSewn:300000,noFabric:180000,cuttingWip:80000},details:[{customer:'ADI',po:'204292',style:'X',noFabric:180000}],snapshotDate:'2026-11-03'};
  const d=factory({shipping:ship,custstats:cs});d.wipFallback={cutNotSewn:120000,basis:'custstats'};const f=run(d,{date:'2026-11-05'});
  ['shipping','fabric','wipPile'].forEach(x=>assert(ids(f).includes(x),x+' missing: '+ids(f).join()));const t=checkText(f,'shipping').text;assert(/出貨　11\/7 ADI 9,000 件/.test(t),t);assert(/逾期　WPL PO W1 21,600 件（ETD 11\/3）/.test(t),t);return 'next ship '+f.outlook.nextShip.length+' · overdue '+f.shipping.overdueRows});
test('接單可做幾個月（週報）：≥2 個月可考慮加班、<1 個月併組；以上月實做為一個月產能',()=>{const mk=n=>({overall:{actualNotSewn:n,noFabric:0},details:[],snapshotDate:'2026-11-03'});
  const f1=run(factory({custstats:mk(900000)}),{date:'2026-11-04',period:'week'});assert(ids(f1).includes('backlogHigh'),ids(f1).join());
  const f2=run(factory({custstats:mk(50000)}),{date:'2026-11-04',period:'week'});assert(ids(f2).includes('backlogLow'),ids(f2).join());
  const f3=run(factory({custstats:mk(f1.months.prev.pieces*1.4)}),{date:'2026-11-04',period:'week'});assert(ids(f3).includes('backlogOk'),ids(f3).join());
  [f1,f2,f3].forEach((f,i)=>checkText(f,'backlog'+i));return f1.outlook.backlogMonths+' / '+f2.outlook.backlogMonths+' / '+f3.outlook.backlogMonths+' months'});
test('平穩日與沒有資料的日子',()=>{const f=run(factory(),{date:'2026-11-12'});assert(ids(f).includes('steady'),ids(f).join());checkText(f,'steady');const n=run({sewing:[],cutting:[]},{date:'2026-11-12'});assert.equal(ids(n)[0],'nodata');checkText(n,'nodata');return 'ok'});
test('至少十來種情境都出現過；同一種情境換日期會換說法',()=>{assert(seen.size>=15,'only '+seen.size+': '+[...seen].join());
  const texts=new Set();['2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-16','2026-11-17'].forEach(d=>{const f=run(factory(),{date:d});const s=f.scenarios.find(x=>x.id==='steady');if(s)texts.add(s.zh.replace(/[\d,.%]+/g,'#'))});assert(texts.size>=2,'steady openings never vary');return seen.size+' scenarios: '+[...seen].join(' ')});
test('週報與排單週報：只有中文、整齊（・項目）、有每天、月比較、接下來；排單週報保留負荷段落',()=>{const d=factory({prodplan:[{month:'2026-11',sewingQty:130894,line:'Line 1',style:'A',start:'2026-11-02',end:'2026-11-07',qty:3000}]});
  const w=run(d,{date:'2026-11-04',period:'week'});const t=checkText(w,'week').text;assert(/^📅 生產週報｜11\/2–11\/8（第 45 週）/.test(t),t.split('\n')[0]);assert(/\n每天\n/.test(t)&&/\n跟前幾個月比/.test(t)&&/\n接下來\n/.test(t)&&/\n要處理\n/.test(t));
  const p=run(d,{date:'2026-11-04',period:'week',kind:'plan'});const tp=checkText(p,'plan').text;assert(/^📋 排單週報/.test(tp)&&/本週負荷/.test(tp),tp);return 'week '+t.length+' chars · plan '+tp.length+' chars'});
test('AI 提示詞：只要中文、照 Paul 週報語氣（範例）、禁用翻案句與破折號、數字只能來自事實；AI 結果標題加粗',()=>{const f=run(factory(),{date:'2026-11-05'});const p=R.aiPrompt(f,{lang:'zh'});
  assert(/只寫繁體中文/.test(p.system)&&/不是A，而是B/.test(p.system)&&/破折號/.test(p.system)&&/範例一/.test(p.system));assert(!/English/.test(p.user)&&/唯一的數字來源/.test(p.user)&&/情境/.test(p.user));
  const html=R.aiHtml('📰 生產日報｜11/5（四）\n\n今天做得順。\n\n今天的數字\n・車縫　1 件');assert(/^<b>📰/.test(html)&&/<b>今天的數字<\/b>/.test(html)&&!/<b>今天做得順/.test(html));return 'system '+p.system.length+' chars'});
const fails=out.filter(x=>x.status!=='PASS').length;try{require('fs').writeFileSync(path.join(__dirname,'story_report_results.json'),JSON.stringify(out,null,1))}catch(_){}
console.log((out.length-fails)+'/'+out.length+' passed');process.exit(fails?1:0);
