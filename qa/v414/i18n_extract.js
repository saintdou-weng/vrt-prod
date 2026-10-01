/* Extract Chinese UI strings from the PROD pages + shared JS into normalized dictionary keys.
   Keys use the same normalization as the runtime (vrt-i18n-v1.js): whitespace collapsed, numbers → {n}. */
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const CJK=/[一-鿿㐀-䶿]/;
const PAGES=['sewing_v5.html','production_plan_capacity_v1.html','cutting_plan_v2.html','VRT_FG_Inventory_Management_v1.html','VRT_BOM_Management_v2_AI.html','VRT_PO_Delivery_Control_Center.html','ie_smv_report_v2_1.html','vrt_bom_costing_view_v39.html','vrt_fabric_delivery_greige_center_v1.html','vrt_fabric_stock_control_v1.html','vrt_spare_parts_v2.html','cutting_v3.html','orders_v3.html','shipping_v2.html','vrt_final_qc_v1.html','portal_v2.html','production_v4.html','smv_manager_v5_final.html','vrt_customer_statistics_control_center_v1.html','vrt_monthly_shipping_control_center_v1.html','vrt_production_weekly_report_generator_v3.html'];
const SHARED=['vrt-smart-sync-v3.js','vrt-auto-sync-v3.js','vrt-qc-v42.js','vrt-fabric-ui-v43.js','vrt-fabric-v40.js','vrt-platform-v40.js','vrt-io-v1.js','vrt-telegram-v1.js','vrt-portal-overview-v1.js','vrt-fabric-movement-v43.js','vrt-maintenance-v39.js','vrt-ie-balancing-v1.js','vrt-tg-summary-v1.js','vrt-i18n-v1.js'];
function norm(s){return String(s).replace(/&nbsp;/g,' ').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim().replace(/\{n\}(?:\s*[,.:\/\-%]\s*\{n\})*/g,'{n}').replace(/(?<![A-Za-z一-鿿])\d[\d,.:\/\-%]*/g,'{n}').replace(/\{n\}(\s*\{n\})+/g,'{n}')}
/* ── JS string scanner: yields string literal values (template ${} → {n}) and concat chains 'a'+x+'b' → 'a{n}b' ── */
function scanJs(src,out,file){
  let i=0,n=src.length;const lits=[];// {start,end,value,kind}
  while(i<n){const c=src[i];
    if(c==='/'&&src[i+1]==='/'){i=src.indexOf('\n',i);if(i<0)break;continue}
    if(c==='/'&&src[i+1]==='*'){const e=src.indexOf('*/',i+2);i=e<0?n:e+2;continue}
    if(c==='"'||c==="'"){let j=i+1,v='';while(j<n&&src[j]!==c){if(src[j]==='\\'){const nx=src[j+1];v+=nx==='n'?'\n':nx==='t'?'\t':nx;j+=2;continue}if(src[j]==='\n')break;v+=src[j];j++}lits.push({start:i,end:j+1,value:v});i=j+1;continue}
    if(c==='`'){let j=i+1,v='',depth=0;while(j<n){if(src[j]==='\\'){const nx=src[j+1];v+=nx==='n'?'\n':nx==='t'?'\t':nx;j+=2;continue}if(src[j]==='$'&&src[j+1]==='{'){let k=j+2,d=1;while(k<n&&d){if(src[k]==='{')d++;else if(src[k]==='}')d--;else if(src[k]==='`'){/* nested template: skip roughly */k=src.indexOf('`',k+1)}k++}v+='{n}';try{scanJs(src.slice(j+2,k-1),out,file)}catch(_){}j=k;continue}if(src[j]==='`')break;v+=src[j];j++}lits.push({start:i,end:j+1,value:v});i=j+1;continue}
    if(c==='/'){// regex literal heuristic: previous non-space char is one of ( , = : [ ! & | ? { } ; or start
      let k=i-1;while(k>=0&&/\s/.test(src[k]))k--;const p=k<0?'(':src[k];if(/[(,=:\[!&|?{};+\-*%<>~^]/.test(p)||p==='n'&&/return$/.test(src.slice(Math.max(0,k-5),k+1))){let j=i+1,cls=false;while(j<n){if(src[j]==='\\'){j+=2;continue}if(src[j]==='[')cls=true;else if(src[j]===']')cls=false;else if(src[j]==='/'&&!cls)break;else if(src[j]==='\n')break;j++}i=j+1;continue}}
    i++}
  // concat chains
  for(let a=0;a<lits.length;a++){const L=lits[a];pushValue(L.value,out,file);
    // look ahead: after literal, skip spaces, expect '+', then expression until next '+' followed by literal
    let chain=L.value,b=a,end=L.end,joined=false;
    while(true){let k=end;while(k<n&&/[ \t]/.test(src[k]))k++;if(src[k]!=='+')break;k++;// expression until the next literal at same depth
      let depth=0,m=k,found=null;while(m<n){const ch=src[m];if(ch==='('||ch==='['||ch==='{')depth++;else if(ch===')'||ch===']'||ch==='}'){if(depth===0)break;depth--}else if(depth===0&&(ch===';'||ch===','||ch==='\n'))break;else if(depth===0&&ch==='+'){const nx=lits.find(x=>x.start>m&&x.start<m+3&&/^\s*$/.test(src.slice(m+1,x.start)));if(nx){found=nx;break}}else if(depth===0&&(ch==='"'||ch==="'"||ch==='`')){const nx=lits.find(x=>x.start===m);if(nx&&/^\s*$/.test(src.slice(k,m))){found=nx;break}else break}m++}
      if(!found)break;const between=src.slice(k,found.start).replace(/\+\s*$/,'').trim();chain+=(between?'{n}':'')+found.value;end=found.end;b=lits.indexOf(found);joined=true}
    if(joined){pushValue(chain,out,file);for(let q=a+1;q<=b;q++)pushValue(lits[q].value,out,file)}a=b}
}
function pushValue(v,out,file){if(!CJK.test(v))return;
  // split on html tags → text fragments
  const frags=v.split(/<[^>]*>/g);for(const f of frags){const t=norm(f.replace(/&nbsp;/g,' '));if(t&&CJK.test(t)&&t.length<=400)add(t,out,file)}
  // also the whole literal without tags collapsed (toast/alert use)
  const whole=norm(v.replace(/<[^>]*>/g,' '));if(whole&&CJK.test(whole)&&whole.length<=400)add(whole,out,file);
  // attribute values inside html fragments
  for(const m of v.matchAll(/(?:placeholder|title|aria-label|alt|value)=["']([^"']*)["']/g)){const t=norm(m[1]);if(CJK.test(t))add(t,out,file)}}
function add(t,out,file){if(t.length>400)return;const t2=t.replace(/^(?:\{n\}\s*)+/,'').replace(/(?:\s*\{n\})+$/,'').trim();if(t2!==t&&t2&&CJK.test(t2))addOne(t2,out,file);addOne(t,out,file)}
function addOne(t,out,file){if(t.length>400)return;if(/\ufffd/.test(t))return;   // code-page tables of the bundled Excel library, not UI text
if(/^[\s\d{n}.,:%\-–—·•/\\|()（）「」]+$/.test(t))return;if(!out[t])out[t]=new Set();out[t].add(file)}
function scanHtml(src,out,file){
  // scripts
  for(const m of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(m[1])||/type=["']application\/(?:ld\+)?json/.test(m[1]))continue;scanJs(m[2],out,file)}
  // static html: strip scripts/styles then text nodes + attributes
  const html=src.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  for(const m of html.matchAll(/>([^<]+)</g)){const t=norm(m[1]);if(CJK.test(t))add(t,out,file)}
  for(const m of html.matchAll(/(?:placeholder|title|aria-label|alt|value|data-zh)=["']([^"']*)["']/g)){const t=norm(m[1]);if(CJK.test(t))add(t,out,file)}
}
const out={};
for(const f of PAGES){const p=path.join(ROOT,f);if(!fs.existsSync(p))continue;scanHtml(fs.readFileSync(p,'utf8'),out,f)}
for(const f of SHARED){const p=path.join(ROOT,f);if(!fs.existsSync(p))continue;scanJs(fs.readFileSync(p,'utf8'),out,f)}
const keys=Object.keys(out).sort((a,b)=>a.localeCompare(b,'zh-Hant'));
const byFile={};for(const k of keys)for(const f of out[k])byFile[f]=(byFile[f]||0)+1;
fs.writeFileSync(path.resolve(__dirname,'i18n_keys.json'),JSON.stringify(Object.fromEntries(keys.map(k=>[k,[...out[k]]])),null,0));
console.log('unique keys',keys.length);console.log(JSON.stringify(byFile,null,1));
