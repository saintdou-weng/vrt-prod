/* Functional checks for the final data-loss and Email-routing fixes. */
const fs=require('fs'),path=require('path'),assert=require('assert');
const {createRuntime}=require('../v39/runtime_harness');
const root=path.resolve(__dirname,'../..'),out=[];
async function test(name,fn){try{out.push({name,status:'PASS',detail:await fn()});console.log('PASS',name)}catch(e){out.push({name,status:'FAIL',detail:e.stack});console.log('FAIL',name,e.message)}}
function mail(name,source){const bytes=fs.readFileSync(path.join(root,'release_sources',source)),text='MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="qa-boundary"\r\n\r\n--qa-boundary\r\nContent-Type: application/vnd.ms-excel\r\nContent-Disposition: attachment; filename="'+name+'"\r\nContent-Transfer-Encoding: base64\r\n\r\n'+bytes.toString('base64')+'\r\n--qa-boundary--\r\n';return{name:'test.eml',text:async()=>text,arrayBuffer:async()=>Buffer.from(text)}}
(async()=>{
await test('IE binary XLS and QC XLSX route correctly from EML attachments',async()=>{
  const smv=createRuntime(root+'/smv_manager_v5_final.html'),qc=createRuntime(root+'/vrt_final_qc_v1.html');
  try{smv.load();await new Promise(r=>setTimeout(r,60));await smv.ctx.handleMsg([mail('Pending - OBD-A2642K.xls','OBD_A2642K_pending.xls')]);
    assert.equal(smv.ctx.location.href,'ie_smv_report_v2_1.html?import=queued');
    const queued=await smv.ctx.VRTDomain39.read('vrt_ie_smv_integrated_v2','state','import-handoff-v40');
    assert.equal(queued.length,1);assert.equal(queued[0].bytes.length,fs.statSync(root+'/release_sources/OBD_A2642K_pending.xls').size);
    qc.load();await qc.ctx.VRT_LOCAL_READY;await qc.ctx.QC.importFiles([mail('Final_QC.xlsx','Final_QC_20260917.xlsx')]);await qc.ctx.QC.commit();
    assert.equal(qc.ctx.QC.getState().records.length,13);
    return 'Generated MIME fixtures containing the unchanged attached workbooks; OLE XLS handed to IE and QC imports 13 reports';
  }finally{smv.close();qc.close()}
});
await test('Fabric clear preserves tombstones/history; cancel or storage failure keeps data',async()=>{
  const r=createRuntime(root+'/vrt_fabric_stock_control_v1.html');
  try{r.load();await r.ctx.load();r.run("DB.current=[{id:'A',snapshotDate:'2026-09-15',itemCode:'A',quantity:1}];DB.accessory=[{id:'B',snapshotDate:'2026-09-15',itemCode:'B',quantity:2}]");await r.ctx.save();
    r.ctx.confirm=()=>false;await r.ctx.clearData();assert.equal(r.run('DB.current.length'),1);
    r.ctx.confirm=()=>true;const put=r.ctx.fabricIDBPut;r.ctx.fabricIDBPut=async()=>false;await r.ctx.clearData();assert.equal(r.run('DB.current.length'),1);assert.equal(r.run('DB.accessory.length'),1);
    r.ctx.fabricIDBPut=put;await r.ctx.clearData();assert.equal(r.run('DB.current.length+DB.accessory.length'),0);assert.equal(r.run('DB.tombstones.length'),2);assert.equal(r.run('DB.editHistory.length'),2);await r.ctx.load();assert.equal(r.run('DB.tombstones.length'),2);
    return 'Confirmed clear persists both deletions; cancelled and failed writes preserve all rows';
  }finally{r.close()}
});
await test('Legacy cloud migration does not mark a blocked push as successfully upgraded',async()=>{
  const r=createRuntime(root+'/vrt_final_qc_v1.html');
  try{let manifests=0,applied=[];r.ctx.fetch=async(url)=>{const p=new URL(url).searchParams,a=p.get('action');if(a==='smartManifest'){manifests++;return new Response(JSON.stringify({ok:true,data:manifests===1?{exists:false,legacy:true,legacyCount:1,legacyMeta:{timestamp:'old'}}:{exists:true,hashes:{'m:2026-09':'other'},counts:{'m:2026-09':2},meta:{}}}))}if(a==='pull')return new Response(JSON.stringify({ok:true,data:{records:[{id:'A',date:'2026-09-17'}]}}));throw new Error(a)};
    r.run(fs.readFileSync(root+'/vrt-smart-sync-v3.js','utf8'));const result=await r.ctx.VRTSmartSync.pull({url:'https://mock.local',tool:'qc',localRecords:[],apply:async rows=>applied=rows});
    assert.equal(applied.length,1);assert.equal(result.migrated,false);assert.equal(result.legacyRetry,true);assert.equal(result.pushResult.ok,false);
    return 'Local legacy data remains saved; cloud format migration remains pending after less-over-more guard';
  }finally{r.close()}
});
await test('Monthly Shipping keeps pending quantities, missing summary rows and canonical Excel/CSV roundtrips',async()=>{
  const r=createRuntime(root+'/vrt_monthly_shipping_control_center_v1.html');
  try{r.load();await r.ctx.VRT_LOCAL_READY;const X=r.ctx.XLSX,w=X.utils.book_new();
    X.utils.book_append_sheet(w,X.utils.aoa_to_sheet([['Week','Customer','Size','Mode','Total Pieces','Total Carton','Remark'],['WEEK 1 SEP-05-2026','LECHNER',20,'SEA',100,10,''],['','AMERICAN DAWN',40,'SEA',200,20,''],['WEEK 3 SEP-19-2026','ALSCO SINGPORE','','LCL','','','Pending quantity'],['OTHER','WHITE PLAIN LINEN','','','','','Date pending']]),'SEP-2026');
    X.utils.book_append_sheet(w,X.utils.aoa_to_sheet([['Month','Shipping Date','Customer','Size','Mode','Total Pieces','Total Carton'],['2026-09','2026-09-05','LECHNER',20,'SEA',100,10],['2026-09','2026-09-05','AMERICAN DAWN',40,'SEA',200,20]]),'SUMMARY');
    const bytes=X.write(w,{type:'array',bookType:'xlsx'}),f={name:'Shipping.xlsx',arrayBuffer:async()=>bytes};await r.ctx.importFile(f);
    assert.equal(r.run('DATA.records.length'),4);assert.equal(r.run('DATA.records.find(x=>x.customer==="WHITE PLAIN LINEN").date'),'');assert.equal(r.run('sum(DATA.records,"pieces")'),300);
    const saved=r.run('DATA.savedAt'),versions=r.run('VERS.length');await r.ctx.importFile(f);assert.equal(r.run('DATA.records.length'),4);assert.equal(r.run('DATA.savedAt'),saved);assert.equal(r.run('VERS.length'),versions);let ex;X.writeFile=x=>ex=x;r.ctx.exportXlsx();let parsed=r.ctx.parseWorkbook(ex,'export.xlsx');assert.equal(parsed.length,4);assert.equal(parsed.find(x=>x.customer==='WHITE PLAIN LINEN').date,'');
    let blob;const create=r.ctx.URL.createObjectURL;r.ctx.URL.createObjectURL=b=>(blob=b,'blob:csv');try{r.ctx.exportCsv()}finally{r.ctx.URL.createObjectURL=create}
    parsed=r.ctx.parseWorkbook(X.read(await blob.arrayBuffer(),{type:'array',raw:true}),'export.csv');assert.equal(parsed.length,4);
    const partial=X.utils.book_new();X.utils.book_append_sheet(partial,X.utils.json_to_sheet([{'Shipping Date':'2026-09-05',Month:'2026-09',Customer:'LECHNER',Size:20,Mode:'SEA','Total Pieces':110,'Total Carton':11}]),'SHIPPING');const part=X.write(partial,{type:'array',bookType:'xlsx'});await r.ctx.importFile({name:'partial.xlsx',arrayBuffer:async()=>part});assert.equal(r.run('DATA.records.length'),4);assert.equal(r.run('sum(DATA.records,"pieces")'),310);await r.ctx.load();assert.equal(r.run('DATA.records.length'),4);
    return 'Generated layout fixture: 4 schedules retained including 2 without quantities; 300 pieces; Excel/CSV, partial correction and IndexedDB reload pass';
  }finally{r.close()}
});
fs.writeFileSync(path.join(__dirname,'final_safety_results.json'),JSON.stringify(out,null,2));if(out.some(x=>x.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
