/* Spare parts overlay: EN / KM renders must not leak Chinese UI text (source data names are excluded). */
const path=require('path'),fs=require('fs'),assert=require('assert');
const ROOT=path.resolve(__dirname,'../..'),UP='/root/.claude/uploads/a1424a09-4f2e-5b2d-a6d0-9096ee09ab3e/';
const {createRuntime}=require(ROOT+'/qa/v39/runtime_harness');
const file=(p,name)=>{const bytes=fs.readFileSync(p);return {name,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}};
const CJK=/[一-鿿]/g;
(async()=>{
 const m=createRuntime(ROOT+'/vrt_spare_parts_v2.html');m.load();await new Promise(r=>setTimeout(r,120));
 const api=m.ctx.VRTParts39;
 await m.ctx.importExcel(file(UP+'91490ff4-Daily_Needles_Change_Report_24_to28_Sept.xlsx','Daily Needles Change Report 24 to28 Sept.xlsx'));await api.commit();
 await m.ctx.importExcel(file(UP+'2127d3e5-Daily_Spare_Part_Change_Report.xlsx','Daily Spare Part Change Report.xlsx'));await api.commit();
 const st=api.getState(),dataStrings=new Set();
 st.maintenance.stockReports.forEach(r=>r.items.forEach(x=>[x.name,x.size,x.machine,x.remark,x.reason].forEach(v=>v&&dataStrings.add(String(v)))));
 [...st.maintenance.needleChanges,...st.maintenance.partChanges].forEach(x=>[x.needleType,x.partType,x.size,x.reason,x.line].forEach(v=>v&&dataStrings.add(String(v))));
 const strip=html=>{let h=html;for(const s of [...dataStrings].sort((a,b)=>b.length-a.length))h=h.split(m.ctx.escapeHtml(s)).join('').split(s).join('');return h};
 let fails=0;
 for(const lang of ['en','km']){
  m.ctx.toggleLang();
  for(const tab of ['changeanalysis','needlechange','partchange','needle','machine','history','dashboard']){
   m.ctx.goTab(tab,null);const html=strip(m.ctx.document.getElementById('app').innerHTML);const hits=html.match(CJK)||[];
   const ctx=[];let mm;const re=/[^<>]{0,25}[一-鿿]+[^<>]{0,25}/g;while((mm=re.exec(html))&&ctx.length<6)ctx.push(mm[0].trim());
   console.log((hits.length?'FAIL':'PASS'),lang,tab,'CJK chars in UI:',hits.length,ctx.length?'· e.g. '+JSON.stringify(ctx):'');if(hits.length)fails++;
  }
  // header + tabs
  const tabs=[...m.ctx.document.querySelectorAll('#tabBar .tab')].map(t=>t.textContent).join(' | ');const tabHits=(tabs.match(CJK)||[]).length;console.log((tabHits?'FAIL':'PASS'),lang,'tabs:',tabs.slice(0,200));if(tabHits)fails++;
 }
 m.close();console.log(fails?fails+' FAIL':'ALL PASS');process.exitCode=fails?1:0;
})();
