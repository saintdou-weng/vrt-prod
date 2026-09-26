/* UI and persistence for the warehouse movement ledger. */
const FM43=VRTFabricMovement43;
const movementLabels43={opening:'期初 / Opening',receipt:'收到 / Receipt',issue:'發出 / Issue'};
function movementRows43(){return DB.movements||[]}
function movementRender43(){const host=document.getElementById('sec-movements');if(!host)return;const state=FM43.ledger(movementRows43()),q=(document.getElementById('movementSearch43')?.value||'').trim().toUpperCase(),groups=state.groups.filter(r=>[r.itemCode,r.lotNumber,r.location].join(' ').toUpperCase().includes(q));host.innerHTML='<div class="card"><div class="ct">📦 布料收發與結餘 / Fabric Movement</div><p>依布號＋完整 Lot／Roll No.＋單位計帳。結餘＝期初＋收到－發出；每個批次只設一次期初，新批次可從零開始。現有庫存快照保留，完成核對後再更新原庫存檔。</p><div class="movement-tools"><button class="btn btn-y" onclick="movementEdit43()">＋ 新增收發</button><button class="btn btn-g" onclick="movementExport43()">↓ Excel</button><button class="btn btn-g" onclick="movementExport43(true)">↓ CSV</button><button class="btn btn-g" onclick="movementTemplate43()">空白匯入範本</button><button class="btn btn-g" onclick="movementRepairWarehouseUnits43()">修正 Warehouse Reference 單位為 YD</button><button class="btn btn-g" onclick="goTab(\'upload\',document.querySelector(\'[onclick*=upload]\'))">匯入 Excel／CSV</button></div><input id="movementSearch43" aria-label="布號、批號或庫位" placeholder="搜尋布號、完整 Lot／Roll No.、庫位" value="'+esc(q)+'" onchange="movementRender43()"><p>'+state.rows.length+' 筆收發 · '+state.groups.length+' 個批次</p>'+(state.errors.length?'<div class="al al-w">'+state.errors.map(esc).join('<br>')+'</div>':'')+'<div class="tw"><table><thead><tr><th>布號</th><th>完整 Lot／Roll No.</th><th>期初</th><th>收到</th><th>發出</th><th>剩餘數量</th><th>單位</th><th>最後異動</th></tr></thead><tbody>'+groups.map(r=>'<tr><td>'+esc(r.itemCode)+'</td><td>'+esc(r.lotNumber)+'</td><td>'+N(r.opening)+'</td><td>'+N(r.received)+'</td><td>'+N(r.issued)+'</td><td><b>'+N(r.balance)+'</b></td><td>'+esc(r.unit)+'</td><td>'+esc(r.lastDate)+'</td></tr>').join('')+'</tbody></table></div></div><div class="card"><h3>收發明細</h3><div class="tw"><table><thead><tr><th>日期</th><th>單據</th><th>異動</th><th>布號／批次</th><th>期初</th><th>收到</th><th>發出</th><th>剩餘</th><th>單位</th><th>庫位</th><th>客戶／訂單</th><th>領用／交貨人</th><th>記錄人</th><th>原因／核可</th><th>操作</th></tr></thead><tbody>'+state.rows.filter(r=>[r.itemCode,r.lotNumber,r.location].join(' ').toUpperCase().includes(q)).slice().reverse().map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.documentNo)+'</td><td>'+movementLabels43[r.movement]+'</td><td>'+esc(r.itemCode)+'<br>'+esc(r.lotNumber)+'</td><td>'+N(r.opening)+'</td><td>'+N(r.received)+'</td><td>'+N(r.issued)+'</td><td>'+N(r.balance)+'</td><td>'+esc(r.unit)+'</td><td>'+esc(r.location)+'</td><td>'+esc(r.customer)+' / '+esc(r.po)+'</td><td>'+esc(r.counterparty)+'</td><td>'+esc(r.recordedBy)+'</td><td>'+esc(r.reason)+'</td><td><button class="btn btn-g" onclick="movementEdit43(\''+r.id+'\')">編輯</button><button class="btn btn-r" onclick="movementDelete43(\''+r.id+'\')">刪除</button><button class="btn btn-g" onclick="movementHistory43(\''+r.id+'\')">歷史 '+(r.history||[]).length+'</button></td></tr>').join('')+'</tbody></table></div></div>'}
const movementFields43=[['date','日期 / Date','date'],['documentNo','單據編號 / Document','text'],['itemCode','布號 / Fabric Code','text'],['lotNumber','完整批號 / Lot・Roll No.','text'],['quantity','數量 / Quantity','number'],['unit','單位 / Unit','text'],['location','庫位 / Location','text'],['customer','客戶 / Buyer','text'],['po','訂單 / PO','text'],['counterparty','領用或交貨部門＋人員 / To・From','text'],['recordedBy','記錄人 / Recorded by','text'],['reason','原因或核可 / Reason・Approval','text']];
function movementEdit43(id){const r=movementRows43().find(r=>r.id===id)||{date:new Date().toISOString().slice(0,10),unit:'YARD',movement:'receipt'};detailTitle.textContent=id?'編輯布料收發':'新增布料收發';detailBody.innerHTML='<form id="movementForm43"><label>異動類型<select name="movement">'+Object.entries(movementLabels43).map(([k,v])=>'<option value="'+k+'" '+(r.movement===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label><div class="detailgrid">'+movementFields43.map(([k,label,type])=>'<label>'+label+'<input name="'+k+'" type="'+type+'" '+(type==='number'?'step="any" min="0"':'')+' value="'+esc(k==='quantity'?r.opening||r.received||r.issued||0:r[k]||'')+'"></label>').join('')+'</div><p id="movementError43" role="alert"></p><button class="btn btn-y" type="submit">儲存</button></form>';detailMask.classList.add('on');document.getElementById('movementForm43').onsubmit=async event=>{event.preventDefault();const v=Object.fromEntries(new FormData(event.target)),qty=VRTData39.number(v.quantity),x={...r,...v,id:id||'FM-'+crypto.randomUUID(),stockType:'fabric_movement',opening:v.movement==='opening'?qty:0,received:v.movement==='receipt'?qty:0,issued:v.movement==='issue'?qty:0};delete x.quantity;try{await movementSave43([x]);closeDetail();movementRender43()}catch(e){document.getElementById('movementError43').textContent=e.message}}}
async function movementSave43(rows){await window.VRT_LOCAL_READY;rows.forEach(FM43.validate);const before=VRTData39.copy(DB),merged=FM43.merge(movementRows43(),rows,DB.tombstones||[]),check=FM43.ledger(merged.records);if(check.errors.length)throw new Error(check.errors.join('；'));try{DB.movements=merged.records;if(!await save())throw new Error('儲存失敗，請重試；原資料保留');VRTProdAutoSync.markDirty('fabricstock','movement');return merged}catch(e){DB=before;throw e}}
async function movementDelete43(id){if(!confirm('刪除此收發紀錄？會重新計算結餘，並保留歷史。'))return;const before=VRTData39.copy(DB),r=movementRows43().find(r=>r.id===id);try{const remaining=movementRows43().filter(r=>r.id!==id),check=FM43.ledger(remaining);if(check.errors.length)throw new Error(check.errors.join('；'));DB.movements=remaining;DB.tombstones=[...(DB.tombstones||[]),{id,deletedAt:new Date().toISOString(),record:r}];if(!await save())throw new Error('儲存失敗');VRTProdAutoSync.markDirty('fabricstock','delete');movementRender43()}catch(e){DB=before;alert(e.message)}}
function movementHistory43(id){const r=movementRows43().find(r=>r.id===id);detailTitle.textContent='收發修改歷史';detailBody.innerHTML=(r?.history||[]).map(x=>'<p>'+esc(x.updatedAt)+' · '+esc(x.documentNo)+' · '+movementLabels43[x.movement]+' · '+N(x.opening||x.received||x.issued)+' '+esc(x.unit)+'</p>').join('')||'<p>尚無修改紀錄</p>';detailMask.classList.add('on')}
function movementExport43(csv=false){const rows=FM43.exportRows(movementRows43());if(csv){const ws=XLSX.utils.json_to_sheet(rows,{header:FM43.fields.map(x=>x[1])}),text='\ufeff'+XLSX.utils.sheet_to_csv(ws),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download='VRT_Fabric_Movements.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}else downloadWB([{name:'Daily Record',sheet:XLSX.utils.json_to_sheet(rows,{header:FM43.fields.map(x=>x[1])})}],'VRT_Fabric_Movements.xlsx')}
function movementTemplate43(){downloadWB([{name:'Daily Record',sheet:XLSX.utils.aoa_to_sheet([FM43.fields.map(x=>x[1])])}],'VRT_Fabric_Movement_Blank.xlsx')}
const goTabBase43=goTab;goTab=function(k,b){goTabBase43(k,b);if(k==='movements')movementRender43()};
const exportAllBase43=exportAll;exportAll=function(){downloadWB([aoaSheet(DB.current,'Current Snapshots'),aoaSheet(DB.old,'Old Stock Usage'),aoaSheet(DB.accessory,'Accessory Stock'),{name:'Daily Record',sheet:XLSX.utils.json_to_sheet(FM43.exportRows(movementRows43()),{header:FM43.fields.map(x=>x[1])})}],'VRT_Fabric_Stock_Combined.xlsx')};
const fabricLoad43=load;load=async function(){await fabricLoad43();DB.movements=DB.movements||[]};
let fabricImportBusy43=false,fabricImportPreview43=null;
function movementRepairWarehouseUnits43(){
  const rows=movementRows43(),targets=rows.filter(r=>/daily\s*record/i.test(String(r.sourceSheet||''))&&/fabric.*warehouse.*reference|warehouse.*reference/i.test(String(r.sourceFile||''))&&/^rolls?$/i.test(String(r.unit||'')));
  detailTitle.textContent='修正 Warehouse Reference 單位';
  detailBody.innerHTML='<p>找到 <b>'+targets.length+'</b> 筆由 Fabric Warehouse Reference／Daily Record 匯入、目前誤標為 ROLL 的收發紀錄。</p><p>只把單位改為 <b>YD</b>；數量、日期、布號、收發類型、來源列完全不改。</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-g" data-action="cancelFabricUnitRepair" onclick="closeDetail()">取消</button><button class="btn btn-y" data-action="confirmFabricUnitRepair" onclick="confirmFabricUnitRepair43()">確認修正</button></div>';
  detailMask.classList.add('on');
}
async function confirmFabricUnitRepair43(){
  const before=VRTData39.copy(DB),stamp=new Date().toISOString();let fixed=0;
  try{
    DB.movements=(DB.movements||[]).map(r=>{
      if(!/daily\s*record/i.test(String(r.sourceSheet||''))||!/fabric.*warehouse.*reference|warehouse.*reference/i.test(String(r.sourceFile||''))||!/^rolls?$/i.test(String(r.unit||'')))return r;
      fixed++;return {...r,unit:'YD',history:[...(r.history||[]),{...r,history:undefined}],updatedAt:stamp};
    });
    if(!fixed){closeDetail();return toast('沒有需要修正的 Warehouse Reference 單位')}
    const check=FM43.ledger(DB.movements||[]);if(check.errors.length)throw new Error(check.errors.join('；'));
    if(!await save())throw new Error('IndexedDB 儲存失敗');
    VRTProdAutoSync.markDirty('fabricstock','warehouse-unit-repair');closeDetail();movementRender43();toast('已修正 '+fixed+' 筆為 YD，數量未變');
  }catch(e){DB=before;toast('修正失敗：'+e.message)}
}
function fabricImportPreviewHtml43(p){
  const unitText=Object.entries(p.units||{}).map(([u,x])=>'<tr><td>'+esc((u||'未填').toUpperCase())+'</td><td>'+N(x.received)+'</td><td>'+N(x.issued)+'</td><td>'+N(x.balance)+'</td></tr>').join('')||'<tr><td colspan="4">無收發單位統計</td></tr>';
  const warn=(p.bad||[]).slice(0,20).map(x=>'<li>'+esc(x)+'</li>').join('');
  const diff=(p.diffs||[]).slice(0,20).map(x=>'<li>'+esc(x.file)+' · row '+esc(x.row)+' · '+esc(x.next.itemCode||x.id)+'</li>').join('');
  return '<div class="al al-i"><b>匯入預覽｜尚未寫入</b><br>新增 '+p.added+' 筆 · 重複略過 '+p.dupCount+' 筆 · 單位自動修正 '+p.unitFixes+' 筆 · 無法辨識/警告 '+p.bad.length+' 筆 · 差異 '+p.diffs.length+' 筆</div>'+
    '<div class="tw"><table><thead><tr><th>單位</th><th>收</th><th>發</th><th>原表結餘合計</th></tr></thead><tbody>'+unitText+'</tbody></table></div>'+
    (warn?'<details open><summary>警告 '+p.bad.length+'</summary><ul>'+warn+'</ul></details>':'')+
    (diff?'<details><summary>同鍵但內容不同 '+p.diffs.length+'（預設略過）</summary><ul>'+diff+'</ul><label><input id="fabricApplyDiff43" type="checkbox"> 套用這些差異（未勾選＝略過）</label></details>':'')+
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn btn-g" data-action="cancelFabricMovementImport" onclick="cancelFabricMovementImport43()">取消</button><button class="btn btn-y" data-action="confirmFabricMovementImport" onclick="confirmFabricMovementImport43()">確認匯入</button></div>';
}
function cancelFabricMovementImport43(){fabricImportPreview43=null;pending=[];showFiles();msg.textContent='已取消匯入，本機資料未變動。';closeDetail()}
async function confirmFabricMovementImport43(){
  const p=fabricImportPreview43;if(!p||fabricImportBusy43)return;fabricImportBusy43=true;
  try{
    const stage=VRTData39.copy(p.stage);
    if(document.getElementById('fabricApplyDiff43')?.checked&&p.diffs.length){const m=new Map((stage.movements||[]).map(r=>[r.id,r]));for(const d of p.diffs)m.set(d.id,{...d.old,...d.next,history:[...(d.old.history||[]),{...d.old,history:undefined}],updatedAt:new Date().toISOString()});stage.movements=[...m.values()]}
    const check=FM43.ledger(stage.movements||[]);if(check.errors.length)throw new Error(check.errors.join('；'));
    DB=stage;if(!await save())throw new Error('IndexedDB 儲存失敗，本次匯入已取消');
    initAnchors(true);renderDash();VRTProdAutoSync.markDirty('fabricstock','import');pending=[];showFiles();
    msg.textContent=p.notes.concat(p.bad.length?['警告 '+p.bad.length+' 筆，已保留可辨識資料']:[],p.unitFixes?['已自動修正 '+p.unitFixes+' 筆 Warehouse Reference 單位為 YD']:[]).join(' | ');
    fabricImportPreview43=null;closeDetail();
    if(p.hasMovements){goTab('movements',document.getElementById('movementTab43'));document.getElementById('sec-movements').insertAdjacentHTML('afterbegin','<div class="al al-i">'+esc(msg.textContent)+'</div>')}
  }catch(e){DB=VRTData39.copy(p.before);update();initAnchors(true);const box=document.getElementById('fabricImportError43');if(box)box.textContent='未儲存：'+e.message;msg.textContent='未儲存：'+e.message;toast('未儲存：'+e.message)}
  finally{fabricImportBusy43=false}
}
doImport=async function(){
  if(fabricImportBusy43)return;const files=Array.from(pending);if(!files.length)return;fabricImportBusy43=true;await window.VRT_LOCAL_READY;
  const before=VRTData39.copy(DB),stage=VRTData39.copy(DB),notes=[],bad=[],diffs=[];let hasMovements=false,unitFixes=0,dupCount=0;const units={};
  try{
    for(const file of files){try{
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array',raw:true,cellDates:false}),m=FM43.parse(wb,file.name),p=VRTImport40.fabric(wb,file.name);
      if(!p.current.length&&!p.old.length&&!p.accessory.length&&isAccessoryWorkbook(wb))p.accessory=parseAccessoryWorkbook(wb,file);
      const recognized=m.recognized||p.current.length||p.old.length||p.accessory.length;if(!recognized)throw new Error('未找到有效庫存或收發資料');
      if(m.warnings.length)bad.push(...m.warnings.map(x=>file.name+'：'+x));
      const dead=new Set((stage.tombstones||[]).map(r=>r.id));
      if(m.records.length){
        hasMovements=true;const byId=new Map((stage.movements||[]).map(r=>[r.id,r]));let add=0,dup=0,fileUnitFixes=0;
        for(const r of m.records){
          const u=String(r.unit||'').toLowerCase();units[u]=units[u]||{received:0,issued:0,balance:0};units[u].received+=r.received||r.opening||0;units[u].issued+=r.issued||0;if(r.sourceBalance!=null)units[u].balance+=Number(r.sourceBalance)||0;
          const prior=byId.get(r.id);
          if(!prior){stage.movements.push(r);byId.set(r.id,r);add++;continue}
          const clean=(x,excludeUnit=false)=>VRTData39.stable(Object.fromEntries(Object.entries(x).filter(([k])=>!['history','updatedAt','createdAt','balance'].includes(k)&&(!excludeUnit||k!=='unit'))));
          const warehouseUnitRepair=/daily\s*record/i.test(String(r.sourceSheet||''))&&/fabric.*warehouse.*reference|warehouse.*reference/i.test(String(r.sourceFile||''))&&/^rolls?$/i.test(String(prior.unit||''))&&/^yds?$|^yards?$/i.test(String(r.unit||''))&&clean(prior,true)===clean(r,true);
          if(warehouseUnitRepair){
            const fixed={...prior,unit:'YD',history:[...(prior.history||[]),{...prior,history:undefined}],updatedAt:new Date().toISOString()};const idx=stage.movements.findIndex(x=>x.id===prior.id);if(idx>=0)stage.movements[idx]=fixed;byId.set(fixed.id,fixed);unitFixes++;fileUnitFixes++;dup++;continue;
          }
          if(clean(prior)===clean(r))dup++;else{diffs.push({file:file.name,row:r.sourceRow,id:r.id,old:prior,next:r});dup++}
        }
        dupCount+=dup;notes.push(file.name+'：收發新增 '+add+'、重複略過 '+dup+(fileUnitFixes?'、單位修正 '+fileUnitFixes:'')+(m.examples?'、明確範例略過 '+m.examples:''));
      }
      for(const k of ['current','old','accessory'])if(p[k].length)stage[k]=VRTImport40.mergeFabric(stage[k],p[k]).filter(r=>!dead.has(r.id));
      if(p.current.length||p.old.length||p.accessory.length)notes.push(file.name+'：原庫存流程 布料 '+p.current.length+'、使用 '+p.old.length+'、輔料 '+p.accessory.length);
    }catch(e){bad.push(file.name+'：'+e.message)}}
    const added=Math.max(0,(stage.movements||[]).length-(DB.movements||[]).length);
    fabricImportPreview43={before,stage,notes,bad,diffs,hasMovements,units,added,dupCount,unitFixes};
    detailTitle.textContent='Fabric Warehouse / 收發匯入預覽';
    detailBody.innerHTML='<div id="fabricImportError43" role="alert"></div>'+fabricImportPreviewHtml43(fabricImportPreview43);
    detailMask.classList.add('on');
  }catch(e){DB=before;update();initAnchors(true);msg.textContent='未儲存：'+e.message}
  finally{fabricImportBusy43=false}
};

// Start local restoration before accepting imports; the later window load event reuses this promise.
window.VRT_LOCAL_READY=load();
