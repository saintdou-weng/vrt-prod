/* One incremental transport for SMV/IE and Maintenance, with bulk objects in IDB. v4.13: multi-record cloud buckets for Spare Parts. */
(function(g){'use strict';
  const C=g.VRTData39;
  const defs={VRT_SMV_Manager_v52:{smv_snapshots:{keyPath:'id',autoIncrement:true}},vrt_ie_smv_integrated_v2:{state:null},vrt_spareparts:{parts:{keyPath:'id'},txns:{keyPath:'id'},versions:{keyPath:'id'},meta:{keyPath:'k'},suppliers:{keyPath:'id'},invoices:{keyPath:'id'},ocrhist:{keyPath:'id'},images:{keyPath:'id'}}};
  function open(name){return new Promise((resolve,reject)=>{const create=d=>Object.entries(defs[name]).forEach(([s,o])=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,o||undefined)});const q=indexedDB.open(name);q.onupgradeneeded=()=>create(q.result);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result;if(Object.keys(defs[name]).every(s=>d.objectStoreNames.contains(s))){d.onversionchange=()=>d.close();resolve(d);return}const v=d.version+1;d.close();const u=indexedDB.open(name,v);u.onupgradeneeded=()=>create(u.result);u.onerror=()=>reject(u.error);u.onblocked=()=>reject(new Error('請關閉其他舊版 PROD 分頁再試。'));u.onsuccess=()=>{u.result.onversionchange=()=>u.result.close();resolve(u.result)}}})}
  async function read(name,store,key){const d=await open(name);try{return await new Promise((res,rej)=>{const o=d.transaction(store).objectStore(store),q=key===undefined?o.getAll():o.get(key);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}finally{d.close()}}
  async function write(name,entries){const d=await open(name);try{await new Promise((res,rej)=>{const t=d.transaction(Object.keys(entries),'readwrite');for(const [s,data] of Object.entries(entries)){const o=t.objectStore(s);if(data.rows){o.clear();data.rows.forEach(r=>o.put(r))}else if(data.values){data.values.forEach(r=>o.put(r))}else if(data.key===undefined)o.put(data.value);else o.put(data.value,data.key)}t.oncomplete=res;t.onabort=t.onerror=()=>rej(t.error||new Error('IndexedDB save failed'))})}finally{d.close()}}
  const emptyMaintenance=()=>({schemaVersion:3,invoiceSummaries:[],stockReports:[],needleChanges:[],partChanges:[],sourceDocuments:[],tombstones:[],editHistory:[]});
  function mergeRows(a,b,key=r=>r.id){const map=new Map();[...(a||[]),...(b||[])].forEach(r=>{const k=key(r),old=map.get(k);if(!old||String(r.updatedAt||r.createdAt||'')>=String(old.updatedAt||old.createdAt||''))map.set(k,C.copy(r))});return [...map.values()]}
  function mergeMaintenance(a,b){const out=emptyMaintenance();for(const k of ['stockReports','needleChanges','partChanges','sourceDocuments','tombstones','editHistory','invoiceSummaries'])out[k]=mergeRows(a?.[k],b?.[k]);const reports=new Map((a?.stockReports||[]).map(r=>[r.id,r]));for(const r of b?.stockReports||[]){const old=reports.get(r.id);if(!old){reports.set(r.id,r);continue}const winner=String(r.updatedAt||'')>=String(old.updatedAt||'')?r:old,other=winner===r?old:r,dead=new Set([...(old.deletedItemIds||[]),...(r.deletedItemIds||[])]),items=mergeRows(other.items,winner.items).filter(x=>!dead.has(x.id));reports.set(r.id,{...winner,items,deletedItemIds:[...dead],fingerprint:C.hash(items),history:mergeRows(old.history,r.history,x=>x.fingerprint||C.hash(x))})}out.stockReports=[...reports.values()];const dead=new Set(out.tombstones.map(r=>r.id));out.stockReports=out.stockReports.filter(r=>!dead.has(r.id));out.needleChanges=out.needleChanges.filter(r=>!dead.has(r.id));out.partChanges=out.partChanges.filter(r=>!dead.has(r.id));return out}
  function syncPart43(v,n){v=String(v||'');let h=2166136261>>>0;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619)}return String((h>>>0)%Math.max(1,n)).padStart(2,'0')}
  function envelope(entity,value,id){
    const row={id:'v39:'+entity+':'+id,_vrtEntity:entity,_vrtValue:value,recordDate:value.testDate||value.date||value.end||value.reportDate||'',updatedAt:value.updatedAt||value.createdAt||''};
    // v4.7: deterministic multi-record buckets. This keeps the IE baseline small enough
    // to upload in tens of requests instead of one HTTP request per operation/style.
    if(entity==='ie.operations')row._smartBucket='ie_operations_'+syncPart43(id,16);
    else if(entity==='ie.styles')row._smartBucket='ie_styles_'+syncPart43(id,4);
    else if(entity==='ie.updates')row._smartBucket='ie_updates_'+syncPart43(id,4);
    else if(entity==='ie.importLog')row._smartBucket='ie_importlog_'+syncPart43(id,2);
    else if(entity==='ie.tombstones')row._smartBucket='ie_tombstones';
    else if(entity==='ie.sourceDocuments')row._smartBucket='ie_source_'+syncPart43(id,8);
    else if(entity==='ie.balancing')row._smartBucket='ie_balancing'; // v4.13: line-balancing settings / aliases / master / assignments / links
    // v4.13: the same for Spare Parts. Without these every change row, stock sheet, source Excel
    // and history entry was its own cloud bucket (one HTTP request each), which is why a spare
    // parts upload took minutes. Change rows and stock sheets follow the business date so a new
    // daily import only touches the current month / week bucket.
    else if(entity==='maintenance.needleChanges'||entity==='maintenance.partChanges'){const m=String(value.date||'').slice(0,7);row._smartBucket=(entity==='maintenance.needleChanges'?'maint_needle_':'maint_part_')+(/^20\d{2}-\d{2}$/.test(m)?m:'undated')}
    else if(entity==='maintenance.stockReports'){const d=String(value.start||value.end||'').slice(0,10),w=isoWeek49(d);row._smartBucket='maint_stock_'+(w||'undated')}
    else if(entity==='maintenance.sourceDocuments')row._smartBucket='maint_source_'+syncPart43(id,8);
    else if(entity==='maintenance.editHistory')row._smartBucket='maint_history_'+syncPart43(id,8);
    else if(entity==='maintenance.tombstones')row._smartBucket='maintenance_tombstones';
    else if(entity==='maintenance.invoiceSummaries')row._smartBucket='maint_invoice_'+syncPart43(id,4);
    else if(entity==='parts.parts')row._smartBucket='parts_master_'+syncPart43(id,4);
    else if(entity==='parts.versions')row._smartBucket='parts_versions_'+syncPart43(id,4);
    else if(/^parts\./.test(entity))row._smartBucket='parts_'+entity.slice(6)+'_'+syncPart43(id,2);
    return row
  }
  function isoWeek49(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return '';const x=new Date(d+'T00:00:00');x.setDate(x.getDate()+3-((x.getDay()+6)%7));const y=x.getFullYear(),w=1+Math.round((x-new Date(y,0,4)+(new Date(y,0,4).getDay()+6)%7*86400000)/604800000);return y+'-W'+String(w).padStart(2,'0')}
  function pack(tool,d){const rows=[];if(tool==='smv'){(d.snaps||[]).forEach(r=>rows.push(r));for(const k of ['updates','styles','operations','sourceDocuments','tombstones','importLog','balancing'])(d.ie?.[k]||[]).forEach(r=>rows.push(envelope('ie.'+k,r,r.id||C.hash(r))));}
    else{(d.txns||[]).forEach(r=>rows.push(r));for(const k of ['parts','versions','suppliers','invoices','ocrhist'])(d[k]||[]).forEach(r=>rows.push(envelope('parts.'+k,r,r.id||C.hash(r))));for(const k of ['stockReports','needleChanges','partChanges','sourceDocuments','tombstones','editHistory','invoiceSummaries'])(d.maintenance?.[k]||[]).forEach(r=>rows.push(envelope('maintenance.'+k,r,r.id||C.hash(r))));}return rows}
  function unpack(tool,rows,meta){const d=tool==='smv'?{snaps:[],ie:C.initIE({})}:{txns:[],parts:[],versions:[],suppliers:[],invoices:[],ocrhist:[],maintenance:emptyMaintenance()};
    if(tool==='smv'&&meta?.ieSmvState)d.ie=C.mergeIE(d.ie,meta.ieSmvState);
    if(tool==='spareparts'){const m=meta?.dataMeta||{};for(const k of ['parts','versions','suppliers','invoices','ocrhist'])d[k]=m[k]||[];if(m.maintenance39)d.maintenance={...emptyMaintenance(),...m.maintenance39}}
    (rows||[]).forEach(r=>{if(!r._vrtEntity){(tool==='smv'?d.snaps:d.txns).push(r);return}const [group,k]=r._vrtEntity.split('.');if(group==='ie'&&tool==='smv'&&Array.isArray(d.ie[k]))d.ie[k].push(r._vrtValue);if(group==='parts'&&tool==='spareparts'&&Array.isArray(d[k]))d[k].push(r._vrtValue);if(group==='maintenance'&&tool==='spareparts'&&Array.isArray(d.maintenance[k]))d.maintenance[k].push(r._vrtValue)});
    if(tool==='smv'){d.ie.settings=meta?.ieSettings||d.ie.settings||{};d.ie.integration=meta?.ieIntegration||d.ie.integration||{}}return d}
  async function readDomain(tool){if(tool==='smv')return {snaps:await read('VRT_SMV_Manager_v52','smv_snapshots')||[],ie:C.initIE(await read('vrt_ie_smv_integrated_v2','state','main')||{})};const d={};for(const k of ['parts','txns','versions','suppliers','invoices','ocrhist'])d[k]=await read('vrt_spareparts',k)||[];d.maintenance=(await read('vrt_spareparts','meta','maintenance39'))?.v||emptyMaintenance();return d}
  function metaFor(tool,d){return tool==='smv'?{domainVersion:39,ieSettings:d.ie.settings||{},ieIntegration:d.ie.integration||{}}:{domainVersion:39}}
  async function apply(tool,rows,meta){const local=await readDomain(tool),incoming=unpack(tool,rows,meta);
    if(tool==='smv'){const ie=C.mergeIE(local.ie,incoming.ie),dead=new Set(ie.tombstones.filter(t=>t.id.startsWith('snapshot:')).map(t=>t.id.slice(9))),snaps=mergeRows(local.snaps,incoming.snaps).filter(s=>!dead.has(String(s.id)));await write('VRT_SMV_Manager_v52',{smv_snapshots:{rows:snaps}});await write('vrt_ie_smv_integrated_v2',{state:{key:'main',value:ie}});return{snaps,ie}}
    const out={};for(const k of ['parts','txns','versions','suppliers','invoices','ocrhist'])out[k]=mergeRows(local[k],incoming[k],k==='parts'?r=>C.norm(r.partNo):r=>r.id);
    out.maintenance=mergeMaintenance(local.maintenance,incoming.maintenance);const dead=new Set(out.maintenance.tombstones.map(r=>r.id));const deadParts=new Set(out.maintenance.tombstones.filter(r=>r.partNo).map(r=>C.norm(r.partNo)));out.parts=out.parts.filter(r=>!dead.has(r.id)&&!deadParts.has(C.norm(r.partNo)));out.txns=out.txns.filter(r=>!dead.has(r.id));const entries={};for(const k of ['parts','txns','versions','suppliers','invoices','ocrhist'])entries[k]={rows:out[k]};entries.meta={value:{k:'maintenance39',v:out.maintenance}};await write('vrt_spareparts',entries);return out}
  async function sync(tool,direction,url,onStatus,opts){opts=opts||{};const d=await readDomain(tool),rs=pack(tool,d),meta=metaFor(tool,d),common={url,tool,meta,onStatus,...opts};if(direction==='push')return await g.VRTSmartSync.push({...common,records:rs});return await g.VRTSmartSync.pull({...common,localRecords:rs,apply:async(rows,m)=>apply(tool,rows,m)})}
  g.VRTDomain39={read,write,readDomain,pack,unpack,apply,sync,metaFor,emptyMaintenance,mergeMaintenance,mergeRows};
})(window);
