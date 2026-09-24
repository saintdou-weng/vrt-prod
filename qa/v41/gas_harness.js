/* Executes the supplied, modified GS in memory. No Google or Telegram network access. */
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const gsPath=path.resolve(__dirname,'../../../AppsScript/VRT_Production_v4.2.gs');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,24);
function createGas(){
  let tick=Date.now(),seq=0,locked=false,busy=false;const files=[],props=new Map(),sheets=new Map(),events=[],calls=[];
  const iterator=a=>{let i=0;return{hasNext:()=>i<a.length,next:()=>a[i++]}};
  function file(name,content){const f={name,content:String(content),id:'f'+(++seq),modified:new Date(++tick),trashed:false,
    getName(){return this.name},getId(){return this.id},getSize(){return Buffer.byteLength(this.content)},getLastUpdated(){return this.modified},
    getBlob(){events.push({op:'read',name:this.name});return{getDataAsString:()=>this.content}},
    setContent(s){this.content=String(s);this.modified=new Date(++tick);events.push({op:'write',name:this.name});return this},
    setTrashed(v){this.trashed=v;events.push({op:'trash',name:this.name});return this},setSharing(){events.push({op:'sharing'});return this}};files.push(f);return f;}
  const folder={getId:()=> 'folder',getFilesByName:n=>iterator(files.filter(f=>!f.trashed&&f.name===n)),getFiles:()=>iterator(files.filter(f=>!f.trashed)),createFile(n,s){events.push({op:'create',name:n});return file(n,s)}};
  function sheet(name){const rows=[];return{name,rows,getLastRow:()=>rows.length,getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),appendRow(r){rows.push(r.slice());return this},setFrozenRows(){return this},autoResizeColumns(){return this},getRange(row,col,n=1,m=1){const range={setValues(a){for(let i=0;i<a.length;i++){rows[row-1+i]??=[];for(let j=0;j<a[i].length;j++)rows[row-1+i][col-1+j]=a[i][j]}return range},clearContent(){for(let i=0;i<n;i++){rows[row-1+i]??=[];for(let j=0;j<m;j++)rows[row-1+i][col-1+j]=''}return range}};for(const k of ['setFontWeight','setBackground','setFontColor','setNumberFormat'])range[k]=()=>range;return range}}}
  const ss={getId:()=> 'sheet',getUrl:()=> 'https://mock.local/spreadsheet',getSheetByName:n=>sheets.get(n),insertSheet(n){const s=sheet(n);sheets.set(n,s);return s}};
  const properties={getProperty:k=>props.get(k)||null,setProperty(k,v){props.set(k,String(v));events.push({op:'property',key:k});return this},deleteProperty(k){props.delete(k)},getProperties:()=>Object.fromEntries(props),getKeys:()=>[...props.keys()]};props.set('vrt_prod_folder_id','folder');props.set('vrt_sheets_id','sheet');
  const ctx={Date,Map,Set,JSON,Math,Number,String,Array,Object,RegExp,Error,encodeURIComponent,decodeURIComponent,
    console:{log(){},error(){events.push({op:'logged-error'})}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput(text){return{text,setMimeType(){return this},getContent(){return text}}}},MimeType:{PLAIN_TEXT:'text/plain'},
    PropertiesService:{getScriptProperties:()=>properties},
    DriveApp:{Access:{ANYONE_WITH_LINK:'link'},Permission:{VIEW:'view'},getFolderById(id){if(id!=='folder')throw Error('Unknown folder');return folder},getFoldersByName:()=>iterator([folder]),createFolder(){events.push({op:'create-folder'});return folder},getFileById:id=>id==='sheet'?{setSharing(){events.push({op:'sharing'})}}:files.find(f=>f.id===id)},
    SpreadsheetApp:{openById:()=>ss,create(){events.push({op:'create-sheet'});return ss},flush(){}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()],getUuid:()=>crypto.randomUUID(),sleep(){},formatDate(d,tz,format){return format==='MM/dd HH:mm'?d.toISOString().slice(5,16).replace('-','/').replace('T',' '):d.toISOString().slice(0,16).replace('T',' ')}},
    LockService:{getScriptLock:()=>({tryLock(){events.push({op:'lock'});if(busy||locked)return false;locked=true;return true},releaseLock(){locked=false;events.push({op:'unlock'})}})},
    UrlFetchApp:{fetch(){events.push({op:'forbidden-network'});throw Error('No external messages or network permitted in QA')}},
    ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/MOCK_PROD/exec'})}
  };vm.createContext(ctx);vm.runInContext(fs.readFileSync(gsPath,'utf8'),ctx,{filename:'VRT_Production_v4.2.gs'});
  const unwrap=r=>JSON.parse(r.getContent());
  function get(p){const j=unwrap(ctx.doGet({parameter:p}));calls.push({method:'GET',p:structuredClone(p),response:structuredClone(j)});return j}
  function post(p){const j=unwrap(ctx.doPost({postData:{contents:JSON.stringify(p)}}));calls.push({method:'POST',p:structuredClone(p),response:structuredClone(j)});return j}
  const fetch=async(url,options={})=>new Response(JSON.stringify(options.method==='POST'?post(JSON.parse(options.body)):get(Object.fromEntries(new URL(url).searchParams))),{status:200,headers:{'Content-Type':'application/json'}});
  const raw=n=>files.filter(f=>!f.trashed&&f.name===n).sort((a,b)=>b.modified-a.modified)[0];
  return{ctx,files,props,events,calls,sheets,fetch,get,post,raw,file,setBusy:v=>busy=v,get locked(){return locked}};
}
module.exports={createGas,digest,gsPath};
