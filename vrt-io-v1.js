/* VRT PROD shared import / export helper v1.0 (2026-09-30)
   One way to back up, restore and export in every module:
   - JSON backup  : VRTIO.backupJSON(tool, payload)  → VRT_<tool>_backup_<YYYY-MM-DD>.json  {tool, format:'vrt-backup', formatVersion:1, exportedAt, ...payload}
   - JSON restore : VRTIO.readJSON(file)             → parsed object; throws a readable error for non-JSON
   - CSV export   : VRTIO.csv(rows, name, columns?)  → UTF-8 with BOM (Excel-safe), quoted
   - CSV import   : VRTIO.parseCSV(text)             → array of objects keyed by the header row
   - Excel export : VRTIO.xlsx({SheetName:rows}, name)
   - Any table    : VRTIO.readTable(file)            → {sheets:{name:[rowObjects]}, aoa:{name:[[...]]}} for .xlsx/.xls/.csv/.json
   Existing modules keep their own file names; this helper only adds the missing pieces. */
(function(g){'use strict';
  if(g.VRTIO)return;
  const pad=n=>String(n).padStart(2,'0');
  function stamp(d){d=d||new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function fileName(tool,ext,extra){return 'VRT_'+String(tool||'data').replace(/[^\w-]+/g,'_')+(extra?'_'+String(extra).replace(/[^\w-]+/g,'_'):'')+'_'+stamp()+'.'+ext}
  function download(name,data,type){const blob=data instanceof Blob?data:new Blob([data],{type:type||'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body&&document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove&&a.remove()},1000);return name}
  function backupJSON(tool,payload,extra){const doc=Object.assign({tool,format:'vrt-backup',formatVersion:1,exportedAt:new Date().toISOString()},payload||{});const name=fileName(tool,'json',extra||'backup');download(name,JSON.stringify(doc),'application/json');return name}
  async function readJSON(file){const text=typeof file==='string'?file:await file.text();let d;try{d=JSON.parse(text.replace(/^﻿/,''))}catch(e){throw new Error('不是有效的 JSON 備份檔 / Not a valid JSON backup: '+e.message)}if(!d||typeof d!=='object')throw new Error('JSON 內容不是物件 / JSON is not an object');return d}
  function csvCell(v){if(v==null)return '';const s=v instanceof Date?stamp(v):String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  function csv(rows,name,columns){rows=rows||[];const cols=columns||[...new Set(rows.flatMap(r=>Object.keys(r||{})))];const text='﻿'+[cols,...rows.map(r=>cols.map(c=>r?r[c]:''))].map(r=>r.map(csvCell).join(',')).join('\r\n');return download(name||fileName('export','csv'),text,'text/csv;charset=utf-8')}
  function parseCSV(text){text=String(text||'').replace(/^﻿/,'');const rows=[];let row=[],cell='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}else if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(cell!==''||row.length){row.push(cell);rows.push(row)}
    const head=(rows.shift()||[]).map(h=>String(h).trim());return rows.filter(r=>r.some(v=>String(v).trim()!=='')).map(r=>{const o={};head.forEach((h,i)=>{if(h)o[h]=r[i]==null?'':r[i]});return o})}
  function xlsx(sheets,name){const X=g.XLSX;if(!X)throw new Error('XLSX library not loaded');const wb=X.utils.book_new();for(const [sn,rows] of Object.entries(sheets||{})){const ws=Array.isArray(rows)&&Array.isArray(rows[0])?X.utils.aoa_to_sheet(rows):X.utils.json_to_sheet(rows||[]);X.utils.book_append_sheet(wb,ws,String(sn).slice(0,31)||'Sheet1')}X.writeFile(wb,name||fileName('export','xlsx'));return name}
  async function readTable(file){const name=String(file.name||'').toLowerCase(),out={sheets:{},aoa:{},name:file.name||''};if(/\.json$/.test(name)){out.json=await readJSON(file);return out}
    if(/\.csv$/.test(name)){const text=await file.text();out.sheets.CSV=parseCSV(text);out.aoa.CSV=text.replace(/^﻿/,'').split(/\r?\n/).map(l=>l.split(','));return out}
    const X=g.XLSX;if(!X)throw new Error('XLSX library not loaded');const wb=X.read(await file.arrayBuffer(),{type:'array',raw:true,cellDates:false});for(const sn of wb.SheetNames){out.sheets[sn]=X.utils.sheet_to_json(wb.Sheets[sn],{defval:''});out.aoa[sn]=X.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null})}return out}
  // Normalise a header cell so 'Plan pcs', 'PLAN_PCS', 'plan pcs ' all match the same key.
  const key=s=>String(s??'').replace(/^﻿/,'').replace(/[\s_\-\/]+/g,' ').trim().toLowerCase();
  function pick(row,...names){const map=Object.keys(row||{}).reduce((m,k)=>(m[key(k)]=k,m),{});for(const n of names){const k=map[key(n)];if(k!=null)return row[k]}return undefined}
  function confirmText(zh,en){return zh+(en?'\n'+en:'')}
  g.VRTIO={version:'1.0',stamp,fileName,download,backupJSON,readJSON,csv,parseCSV,xlsx,readTable,pick,key,confirmText};
})(typeof window!=='undefined'?window:globalThis);
