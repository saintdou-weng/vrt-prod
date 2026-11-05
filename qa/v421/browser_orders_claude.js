/* v4.21 — 訂單 PDF：解析器讀不出來或總額對不上 → ClaudeParser（經 GAS aiParsePO，GAS 用 mock） */
const {chromium}=require('playwright');const assert=require('assert');const BASE=process.env.VRT_BASE_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({executablePath:process.env.VRT_CHROMIUM||'/opt/pw-browsers/chromium'});const ctx=await b.newContext();let calls=[];
  await ctx.addInitScript(()=>{try{localStorage.setItem('vrt_portal_gas_url','https://script.google.com/macros/s/MOCK/exec')}catch(_){}});
  await ctx.route('https://script.google.com/**',async route=>{const body=route.request().postData()||'';let j={};try{j=JSON.parse(body)}catch(_){}
    if(j.action==='aiParsePO'){calls.push(j);const total=/TOTAL 300\.00/.test(j.text);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{ok:true,costUsd:0.012,text:JSON.stringify({customer:'NEWCO',po:'NC-1',order_date:'2026-11-01',declared_total:total?300:0,lines:[{style:'A1',color:'WHITE',size:'M',qty:10,unitPrice:10,amount:100},{style:'A1',color:'WHITE',size:'L',qty:20,unitPrice:10,amount:200}]})}})})}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{}})})});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(BASE+'orders_v3.html');await p.waitForFunction(()=>window.MasterParser||typeof MasterParser!=='undefined');
  const r1=await p.evaluate(async()=>{const r=await MasterParser.parse('SOME UNKNOWN CUSTOMER PURCHASE ORDER\nstyle A1 white M 10 L 20\nTOTAL 300.00',{fileName:'x.pdf'});return {parser:r.parserId,n:r.records.length,qty:r.records.reduce((s,x)=>s+x.qty,0),review:r.records.some(x=>x.needsReview)}});
  assert.equal(r1.parser,'Claude');assert.equal(r1.n,2);assert.equal(r1.qty,30);assert(!r1.review);assert.equal(calls.length,1);
  console.log('PASS unknown format → Claude reads 2 lines, 30 pcs, total matches · calls',calls.length);
  assert(!errs.length,errs.join());console.log('2/2 passed');await b.close()})().catch(e=>{console.log('FAIL',e.message);process.exit(1)});
