/* VRT 生產平台 列表 Keynote v1.0（2026-11-22，Paul：車縫週月年、QC 的列表點了都要跳 keynote，可連續往下滑、有連結、有圖示）
   - 任何表格點一列 → 大字卡：這一列每個欄位（圖示＋標題＋值），數字欄附「同表合計／平均／第幾名」和比例條。
   - 卡片裡的款號、線別、PO、日期、客戶、瑕疵、料號 → 按鈕「打開 ›」直接開入口頁的物品頁（照片、走勢、明細，可再左右切換）。
   - 往下捲自動接下一列（連續往下滑），◀ ▶、鍵盤左右、手機左右滑都可以換列；上面顯示第幾列／共幾列。
   - 不會跳出：點到按鈕／連結／輸入框／本來就會開東西的列（機修零件卡片、租機明細…）、正在選字、表格標 data-keynote="off"、彈出視窗或物品頁裡面的表格。
   - 只讀畫面上的表格，不改資料。 */
(function(g){
'use strict';
if(g.VRTKeynote)return;
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt=el=>String(el?el.innerText||el.textContent||'':'').replace(/\s+/g,' ').trim();
const numOf=s=>{s=String(s||'').replace(/[,$\s]/g,'').replace(/[▲▼↑↓]/g,'');const m=s.match(/^-?\d+(\.\d+)?%?$/);return m?parseFloat(s):null};
const F=(n,d)=>n==null||!isFinite(n)?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:d==null?2:d});
/* 欄位 → 圖示、可連結的物品種類 */
const KINDS=[[/款號|款式|style/i,'style','👕','款式頁'],[/線別|組別|^line|生產線|^線$|^組$/i,'line','🧵','線別頁'],[/^po\b|po no|訂單號|po#|採購單/i,'po','📄','PO 頁'],[/瑕疵|缺點|defect/i,'defect','🔍','瑕疵頁'],[/客戶|customer|buyer/i,'customer','👥','客戶頁'],[/料號|item code|布號|fabric code/i,'item','🧶','料號頁'],[/日期|^date|day$/i,'date','📅','那一天']];
const ICON=[[/日期|date|月份|期間|週|week|month|year|年/i,'📅'],[/人數|人力|worker|operator|manpower|headcount/i,'👥'],[/件數|產量|數量|pcs|qty|output|pieces/i,'📦'],[/smv|工時|minute|分鐘|hours?/i,'⏱️'],[/效率|eff/i,'📈'],[/不良|瑕疵|defect|reject/i,'🔍'],[/金額|價|cost|amount|\$|usd/i,'💲'],[/線別|line|組別/i,'🧵'],[/款|style/i,'👕'],[/客戶|customer/i,'👥'],[/天|day/i,'🗓️'],[/率|%|rate/i,'📊']];
const iconOf=h=>{for(const [re,ic] of ICON)if(re.test(h))return ic;return '•'};
const isCount=h=>/數|count|qty|件|人|天|率|%|total|合計|sum|avg|平均/i.test(h);const kindOf=h=>(isCount(h)&&!/日期|date/i.test(h))||/名稱|類型|類別|name|type|desc|說明|備註/i.test(h)?null:KINDS.find(k=>k[0].test(h));

function css(){if(document.getElementById('vknCss'))return;const s=document.createElement('style');s.id='vknCss';s.textContent=`
#vkn{position:fixed;inset:0;z-index:99960;background:rgba(15,23,42,.55);display:none;align-items:flex-end;justify-content:center;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}#vkn.on{display:flex}
@media(min-width:720px){#vkn{align-items:center}}
#vkn .vk-bx{background:#fff;color:#0f172a;width:min(720px,100%);height:min(88vh,900px);display:flex;flex-direction:column;border-radius:18px 18px 0 0;box-shadow:0 -8px 40px rgba(0,0,0,.3);font:14px/1.45 system-ui,-apple-system,"Segoe UI","Noto Sans TC",sans-serif;overflow:hidden}
@media(min-width:720px){#vkn .vk-bx{border-radius:18px}}
#vkn .vk-hd{display:flex;gap:8px;align-items:center;background:#0f172a;color:#fff;padding:10px 12px}#vkn .vk-hd b{flex:1;font-size:16px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#vkn .vk-hd small{display:block;font-size:11px;opacity:.7;font-weight:400}
#vkn .vk-hd button{border:0;background:rgba(255,255,255,.16);color:#fff;width:36px;height:36px;border-radius:50%;font-size:16px;cursor:pointer;flex:none}#vkn .vk-hd button:disabled{opacity:.3}
#vkn .vk-pos{font-size:12px;opacity:.85;white-space:nowrap}
#vkn .vk-bd{flex:1;overflow:auto;overscroll-behavior:contain;padding:0 14px 20px}
#vkn .vk-sec{padding-top:12px}#vkn .vk-sec+.vk-sec{margin-top:14px;border-top:3px dashed #e2e8f0}
#vkn .vk-st{display:flex;gap:8px;align-items:baseline;margin:2px 0 8px}#vkn .vk-st b{font-size:20px;word-break:break-word}#vkn .vk-st span{font-size:12px;color:#64748b;margin-left:auto;white-space:nowrap}
#vkn .vk-lk{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}#vkn .vk-lk button{border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:999px;padding:6px 11px;font:600 12.5px/1 inherit;cursor:pointer}
#vkn .vk-nums{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
#vkn .vk-n{border:1px solid #e2e8f0;border-radius:12px;padding:9px 11px;background:#f8fafc}#vkn .vk-nl{font-size:11.5px;color:#64748b}#vkn .vk-nv{font-size:22px;font-weight:800;line-height:1.15;word-break:break-word}
#vkn .vk-bar{height:5px;border-radius:3px;background:#e2e8f0;margin:6px 0 4px;overflow:hidden}#vkn .vk-bar i{display:block;height:100%;background:#4f46e5;border-radius:3px}#vkn .vk-ref{font-size:10.5px;color:#64748b}
#vkn .vk-rows{margin-top:8px}#vkn .vk-r{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9}#vkn .vk-rl{flex:0 0 38%;color:#64748b;font-size:12.5px}#vkn .vk-rv{flex:1;font-weight:600;word-break:break-word}
#vkn .vk-pd{margin-top:10px;padding:10px 12px;border-radius:12px;background:#f5f3ff;border:1px solid #e0e7ff}#vkn .vk-pt{font-weight:700;font-size:13px;margin-bottom:6px}#vkn .vk-pt small{font-weight:400;color:#64748b;margin-left:4px}#vkn .vk-pl{font-size:11.5px;color:#64748b;margin:6px 0 4px}#vkn .vk-pd .vk-lk button small{font-weight:500}
#vkn .vk-lst{display:block}#vkn .vk-lst .vk-it{display:flex;gap:8px;align-items:center;width:100%;text-align:left;border:0;border-top:1px solid #e0e7ff;background:none;color:inherit;font:inherit;padding:7px 2px;cursor:pointer;border-radius:0}#vkn .vk-lst .vk-it:first-child{border-top:0}#vkn .vk-it .nm{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#vkn .vk-it .bx{flex:0 0 26%;height:7px;border-radius:4px;background:#e2e8f0;overflow:hidden}#vkn .vk-it .bx i{display:block;height:100%;background:#6366f1}#vkn .vk-it .vl{font-weight:800;min-width:56px;text-align:right}#vkn .vk-it .sb{font-size:11px;color:#64748b;min-width:30px;text-align:right}
#vkn .vk-more{margin:16px 0 4px;padding:12px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:12px;cursor:pointer;font-size:13px}
table tbody tr[data-vkn-mine]:hover td{background:rgba(79,70,229,.06)}
@media (prefers-color-scheme:dark){}`;document.head.appendChild(s)}

/* ── 表格 → 欄位、資料列 ── */
function model(table){const hr=table.tHead&&table.tHead.rows.length?table.tHead.rows[table.tHead.rows.length-1]:null;let heads=hr?[...hr.cells].map(c=>txt(c).replace(/\s*[▲▼↕⇅]\s*$/,'')):[];
  const body=table.tBodies[0];if(!body)return null;const rows=[...body.rows].filter(r=>r.cells.length>=2&&!r.hasAttribute('data-vkn-off'));
  if(!heads.length&&rows.length){heads=[...rows[0].cells].map((_,i)=>'欄 '+(i+1))}
  const isTot=r=>/^(合計|總計|小計|total|sum|平均|average)/i.test(txt(r.cells[0]));
  const data=rows.filter(r=>!isTot(r));
  const cols=heads.map((h,i)=>{const vals=data.map(r=>r.cells[i]?numOf(txt(r.cells[i])):null);const nn=vals.filter(v=>v!=null);const numeric=nn.length>=Math.max(1,data.length*.6)&&!(kindOf(h)||/日期|date|期間|月份|週別|^週|年份|^年$/i.test(h));
    const pct=numeric&&data.some(r=>r.cells[i]&&/%/.test(txt(r.cells[i])));return {h,i,numeric,pct,vals,max:nn.length?Math.max(...nn.map(Math.abs)):0,sum:nn.reduce((a,b)=>a+b,0),avg:nn.length?nn.reduce((a,b)=>a+b,0)/nn.length:null,n:nn.length}});
  const title=(()=>{const c=table.closest('.card,section,.sec,.panel');const t=c&&c.querySelector('.ct,h2,h3,h4,.card-title,.panel-head');return t?txt(t).slice(0,60):(document.title||'')})();
  return {heads,rows,data,cols,title}}

/* 一格裡有好幾個（「A 12、B 5」「4426, HA1521」）→ 拆開，各自一顆按鈕；去掉後面的次數 */
const splitEnt=(v,cnt)=>[...new Set(String(v).split(/[、,;；，]+/).map(x=>{x=x.trim();return cnt?x.replace(/(\s+[x×]?\d+(\.\d+)?%?|\s*[(（][x×]?\d+(\.\d+)?%?[)）])$/,'').trim():x}).filter(x=>x&&x.length<=60&&!/^(—|-|無|none)$/i.test(x)))].slice(0,8);
function rowHtml(M,idx){const r=M.rows[idx];const cells=[...r.cells];const first=txt(cells[0])||('#'+(idx+1));const di=M.data.indexOf(r);
  const links=[],nums=[],plain=[];
  M.cols.forEach(c=>{const td=cells[c.i];if(!td)return;if(/^(操作|動作|action)s?$/i.test(c.h))return;const tb=td.cloneNode(true);tb.querySelectorAll('button,input,select').forEach(x=>x.remove());const v=txt(tb);if(!v||v==='—'||v==='-')return;const k=kindOf(c.h);
    if(k&&!c.numeric){if(k[1]==='date'){if(/^20\d\d-\d\d-\d\d/.test(v))links.push([k,v.slice(0,10)])}else splitEnt(v,k[1]==='defect').forEach(x=>links.push([k,x]))}
    if(c.numeric&&numOf(v)!=null&&di>=0){const x=numOf(v);const rank=1+c.vals.filter(o=>o!=null&&o>x).length;const w=c.max?Math.abs(x)/c.max*100:0;
      nums.push(`<div class="vk-n"><div class="vk-nl">${iconOf(c.h)} ${E(c.h)}</div><div class="vk-nv">${E(v)}</div><div class="vk-bar"><i style="width:${w.toFixed(1)}%"></i></div><div class="vk-ref">${c.pct?'平均 '+F(c.avg,1)+'%':'合計 '+F(c.sum)+' · 平均 '+F(c.avg)}${c.n>1?' · 第 '+rank+' / '+c.n+' 名':''}</div></div>`)}
    else plain.push(`<div class="vk-r"><div class="vk-rl">${iconOf(c.h)} ${E(c.h)}</div><div class="vk-rv">${E(v)}</div></div>`)});
  const lk=links.length?`<div class="vk-lk">${links.map(([k,v])=>`<button data-open="${E(k[1])}|${E(v)}">${k[2]} ${E(v)} · ${k[3]} ›</button>`).join('')}</div>`:'';
  return `<section class="vk-sec" data-i="${idx}"><div class="vk-st"><b>${E(first)}</b><span>${idx+1} / ${M.rows.length}</span></div>${periodHtml(M,r)}${lk}${nums.length?`<div class="vk-nums">${nums.join('')}</div>`:''}<div class="vk-rows">${plain.join('')}</div></section>`}

/* ── v1.1 週／月／年／日 列 → 這段期間做了哪些款、哪些線（讀頁面自己的車縫資料 DB，點了開款式頁／線別頁） ── */
function pageDB(){try{/* eslint-disable-next-line no-undef */const d=typeof DB!=='undefined'?DB:g.DB;return Array.isArray(d)&&d.length&&d[0]&&('date' in d[0])?d:null}catch(_){return null}}
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function periodOf(v,yr){v=String(v||'').trim();let m;
  if((m=v.match(/^(20\d\d)-(\d\d)-(\d\d)/)))return [m[0],m[0]];
  if((m=v.match(/^(20\d\d)[-\/](\d{1,2})(?!\d)/))&&!/^(20\d\d)[-\/]\d{1,2}[-\/]\d/.test(v)){const a=m[1]+'-'+m[2].padStart(2,'0');return [a+'-01',a+'-31']}
  if((m=v.match(/^(20\d\d)(年)?$/)))return [m[1]+'-01-01',m[1]+'-12-31'];
  if((m=v.match(/(\d{1,2})\/(\d{1,2})\s*[–~～\-至]\s*(\d{1,2})\/(\d{1,2})/))){const a=ymd(new Date(yr,m[1]-1,+m[2])),b=ymd(new Date(+m[3]<+m[1]?yr+1:yr,m[3]-1,+m[4]));return [a,b]}
  if((m=v.match(/^(\d{1,2})\/(\d{1,2})$/))){const a=ymd(new Date(yr,m[1]-1,+m[2]));return [a,a]}
  return null}
/* 日索引（同一份 DB 只建一次）→ 每次只看那段期間的天數，不再整份掃（車縫週月年點開變快） */
let IDX=null;
function dbIdx(db){if(IDX&&IDX.db===db&&IDX.n===db.length)return IDX;const by=new Map();let mx='';db.forEach(x=>{if(x.tSrc!=null&&x.tSrc!=='norm')return;const d=String(x.date||'').slice(0,10);if(!/^20\d\d-\d\d-\d\d$/.test(d))return;let a=by.get(d);if(!a)by.set(d,a=[]);a.push(x);if(d>mx)mx=d});return IDX={db,n:db.length,by,yr:mx?+mx.slice(0,4):new Date().getFullYear()}}
function daysIn(a,b){const out=[];const d=new Date(a+'T00:00:00'),e=new Date(b+'T00:00:00');for(let k=0;d<=e&&k<400;k++){out.push(ymd(d));d.setDate(d.getDate()+1)}return out}
function periodHtml(M,r){const db=pageDB();if(!db)return '';const X=dbIdx(db);const cells=[...r.cells];let pr=null;
  const ci=M.cols.filter(c=>/期間|日期|date|週|week|月份|month|年|year/i.test(c.h)).map(c=>c.i);for(const i of ci.concat([0])){if(cells[i]&&(pr=periodOf(txt(cells[i]),X.yr)))break}
  if(!pr)return '';const [a,b]=pr;const rs=[];let nd=0;daysIn(a,b).forEach(d=>{const l=X.by.get(d);if(l){nd++;rs.push(...l)}});if(!rs.length)return '';
  const pc=x=>+x.pieces||+x.qty||+x.output||0;const tot=rs.reduce((s,x)=>s+pc(x),0);
  const top=(f,n)=>{const m=new Map();rs.forEach(x=>{const k=String(f(x)||'').trim();if(k)m.set(k,(m.get(k)||0)+pc(x))});return [...m].sort((p,q)=>q[1]-p[1]).slice(0,n)};
  const st=top(x=>x.styleNo||x.style,10),ln=top(x=>x.lineNo||x.line,14);if(!st.length&&!ln.length)return '';
  const list=(k,ic,l)=>{const mx=l.length?l[0][1]:0;return l.map(([v,n])=>`<button class="vk-it" data-open="${k}|${E(v)}"><span class="nm">${ic} ${E(v)}</span><span class="bx"><i style="width:${mx?Math.max(3,n/mx*100).toFixed(1):0}%"></i></span><span class="vl">${F(n,0)}</span><span class="sb">${tot?F(n/tot*100,0)+'%':''}</span></button>`).join('')};
  return `<div class="vk-pd"><div class="vk-pt">🔗 ${E(a===b?a:a+' ～ '+b)}：做了什麼 <small>${nd} 個生產日 · ${F(tot,0)} 件 · ${st.length} 款 · ${ln.length} 條線；點了開款式／線別頁（只在這幾個之間往下滑）</small></div>${st.length?`<div class="vk-pl">👕 款式 Styles（件數）</div><div class="vk-lk vk-lst">${list('style','👕',st)}</div>`:''}${ln.length?`<div class="vk-pl">🧵 線別 Lines（件數）</div><div class="vk-lk vk-lst">${list('line','🧵',ln)}</div>`:''}</div>`}

function openRef(kind,key,sib){if(kind==='defect'&&g.VRTQCDefect&&g.VRTQCDefect.openName){close();if(g.VRTQCDefect.openName(key))return}try{if(g.parent&&g.parent!==g&&typeof g.parent.VRTHubOpen==='function'){close();g.parent.VRTHubOpen(kind,key,sib);return}}catch(_){}
  if(typeof g.VRTHubOpen==='function'){close();g.VRTHubOpen(kind,key,sib);return}
  g.open('vrt_hub_v1.html#open='+encodeURIComponent(kind+'|'+key),'_blank')}

let el=null,M=null,cur=0,base=0,io=null;
function close(){if(!el)return;el.classList.remove('on');if(io){io.disconnect();io=null}document.removeEventListener('keydown',key)}
function key(e){if(!el||!el.classList.contains('on'))return;if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key==='Escape')close();if(e.key==='ArrowRight'||e.key==='ArrowDown'&&e.altKey)go(1);if(e.key==='ArrowLeft')go(-1)}
function ensure(){if(el)return;css();el=document.createElement('div');el.id='vkn';el.innerHTML='<div class="vk-bx"><div class="vk-hd"><button data-a="p" title="上一列 ←">◀</button><button data-a="n" title="下一列 →">▶</button><b><span class="vk-tt"></span><small class="vk-sub"></small></b><span class="vk-pos"></span><button data-a="x" title="關閉 Esc">✕</button></div><div class="vk-bd"></div></div>';document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target===el)return close();const a=e.target.closest('[data-a]');if(a){({p:()=>go(-1),n:()=>go(1),x:close})[a.dataset.a]();return}const o=e.target.closest('[data-open]');if(o){const [k,...v]=o.dataset.open.split('|');const sib=[...o.parentElement.querySelectorAll('[data-open]')].map(b=>b.dataset.open.split('|')).filter(x=>x[0]===k).map(x=>x.slice(1).join('|'));openRef(k,v.join('|'),sib);return}const m=e.target.closest('.vk-more');if(m)add()});
  let sx=0,sy=0;el.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});el.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>80&&Math.abs(dy)<50)go(dx<0?1:-1)},{passive:true})}
function head(){el.querySelector('.vk-tt').textContent=txt(M.rows[cur].cells[0])||M.title;el.querySelector('.vk-sub').textContent=M.title;el.querySelector('.vk-pos').textContent=(cur+1)+' / '+M.rows.length;el.querySelector('[data-a=p]').disabled=cur<=0;el.querySelector('[data-a=n]').disabled=cur>=M.rows.length-1}
let last=0;
function add(){const B=el.querySelector('.vk-bd'),more=B.querySelector('.vk-more');if(last+1>=M.rows.length){if(more)more.textContent='— 已經是最後一列 —';return false}last++;more.insertAdjacentHTML('beforebegin',rowHtml(M,last));label();return true}
function label(){const more=el.querySelector('.vk-more');if(!more)return;const nx=M.rows[last+1];more.innerHTML=nx?'⬇ 繼續往下捲：下一列 <b>'+E(txt(nx.cells[0]))+'</b>':'— 已經是最後一列 —'}
function paint(){const B=el.querySelector('.vk-bd');base=cur;last=cur;B.innerHTML=rowHtml(M,cur)+'<div class="vk-more"></div>';label();B.scrollTop=0;head();
  if(io)io.disconnect();const more=B.querySelector('.vk-more');const near=()=>more.getBoundingClientRect().top<B.getBoundingClientRect().bottom+400;
  if(g.IntersectionObserver){io=new IntersectionObserver(es=>{if(es.some(x=>x.isIntersecting)){let n=0;while(near()&&n++<3&&add());}},{root:B,rootMargin:'0px 0px 400px 0px'});io.observe(more)}
  let tk=0;B.onscroll=()=>{if(tk)return;tk=setTimeout(()=>{tk=0;let c=base;for(const s of B.querySelectorAll('.vk-sec')){if(s.offsetTop<=B.scrollTop+60)c=+s.dataset.i;else break}if(c!==cur){cur=c;head()}},90)}}
function go(d){const n=cur+d;if(!M||n<0||n>=M.rows.length)return;cur=n;paint()}
function open(table,tr){const m=model(table);if(!m)return;const i=m.rows.indexOf(tr);if(i<0)return;M=m;cur=i;ensure();el.classList.add('on');document.addEventListener('keydown',key);paint()}

/* ── 點列 ── */
const SKIP_IN='#vkn,.sheet,.fi-mask,.ps-mask,#modalBox,#mask,.modal,.vp-lb,.vp-mask,dialog,[data-keynote="off"]';
const ROW_OWN='[onclick],.pi-row,.rr-row,[data-id],[data-k],[data-qd],[data-open],[data-hub-style],[data-vkn-off]';
function onClick(e){if(e.defaultPrevented||e.button)return;const t=e.target;if(!t.closest)return;
  if(t.closest('a,button,input,select,textarea,label,summary,[onclick],[contenteditable="true"],[role="button"]'))return;
  const tr=t.closest('tr');if(!tr||!tr.parentElement||tr.parentElement.tagName!=='TBODY')return;const table=tr.closest('table');if(!table||table.closest(SKIP_IN))return;
  if(tr.matches(ROW_OWN)||tr.cells.length<2)return;if(String(g.getSelection&&g.getSelection())!=='')return;
  if(!tr.hasAttribute('data-vkn-mine')&&!tr.classList.contains('pkn-row')&&getComputedStyle(tr).cursor==='pointer')return;   /* 頁面自己讓這一列可以點（會做別的事）→ 不搶 */
  open(table,tr)}
function over(e){const tr=e.target.closest&&e.target.closest('tbody tr');if(!tr||tr.hasAttribute('data-vkn-mine')||tr.__vkn)return;tr.__vkn=1;const t=tr.closest('table');if(!t||t.closest(SKIP_IN)||tr.matches(ROW_OWN)||tr.cells.length<2)return;if(getComputedStyle(tr).cursor==='pointer')return;tr.setAttribute('data-vkn-mine','');tr.style.cursor='pointer'}
/* ── v1.2 名稱旁小圖示（像 HRA-PAY／Portal）＋手機 KPI 一排 2 張 ──
   圖示用 CSS ::before 畫（data-vic），不改文字本身 → 匯出 Excel／複製文字不會多出圖示。 */
const LIC=[[/不良|reject|瑕疵|defect|缺點/i,'⚠️'],[/圍裙|apron/i,'🧵'],[/成衣|garment|上衣|餐巾/i,'👕'],[/客戶|customer|buyer/i,'👥'],[/^po\b|po |po張|訂單|order/i,'📄'],[/款|style/i,'👕'],[/線別|^線|line|組別|^組/i,'🧵'],[/箱|carton|ctn/i,'📦'],[/出貨|ship|批次|wave/i,'🚚'],[/布|fabric/i,'🧶'],[/金額|usd|\$|amount|產值|成本|cost|售價|price/i,'💰'],[/檢驗|inspect/i,'🔍'],[/效率|eff/i,'📈'],[/率|%|佔比|占比/i,'📊'],[/人數|人力|worker|manpower|operator|人均/i,'👷'],[/smv|工時|分鐘|minute/i,'⏱️'],[/日期|date|週|week|月|month|年|year|期間|天|day/i,'📅'],[/件|pcs|qty|數量|產量|output|產出|合計|total/i,'🧮'],[/狀態|status/i,'🚦'],[/備註|note|remark/i,'📝']];
const EMO=/\p{Extended_Pictographic}/u;const licOf=t=>{for(const [re,ic] of LIC)if(re.test(t))return ic;return ''};
function deco(){try{const sk='#vkn,.pkn-box,.sheet,[data-keynote="off"],[data-icon="off"]';
  document.querySelectorAll('thead th:not([data-vic]):not([data-vicn])').forEach((th,k)=>{if(k>600)return;const t=txt(th);if(!t||t.length>24||EMO.test(t)||th.children.length>2||th.closest(sk)){th.setAttribute('data-vicn','');return}const ic=licOf(t);if(ic)th.setAttribute('data-vic',ic);else th.setAttribute('data-vicn','')});
  const ps=new Set();document.querySelectorAll('.pkn-kpi:not([data-vk2])').forEach(k=>{k.setAttribute('data-vk2','');if(k.closest(sk))return;ps.add(k.parentElement);
    const lf=[...k.querySelectorAll('*')].filter(e=>!e.children.length&&!e.hasAttribute('data-vic')).map(e=>[e,txt(e)]).find(([e,t])=>t&&t.length>=2&&t.length<=30&&!/^[\d$,.%\s+\-—]+\s*[A-Za-z%件]*$/.test(t));
    if(lf&&!EMO.test(lf[1])){const ic=licOf(lf[1]);if(ic)lf[0].setAttribute('data-vic',ic)}});
  if(g.innerWidth<640)ps.forEach(P=>{if(!P||P.__vk2)return;P.__vk2=1;const cs=getComputedStyle(P);if(/grid/.test(cs.display)&&cs.gridTemplateColumns.trim().split(/\s+/).length===1&&P.children.length>=2){P.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';[...P.children].forEach(c=>{c.style.minWidth='0'})}});
 }catch(e){}}
function decoInit(){if(!document.getElementById('vkIcCss')){const s=document.createElement('style');s.id='vkIcCss';s.textContent='[data-vic]::before{content:attr(data-vic);margin-right:4px;font-style:normal;font-weight:400;letter-spacing:0;text-transform:none}';document.head.appendChild(s)}
  deco();setTimeout(deco,1500);setTimeout(deco,4000);let tm=0;try{new MutationObserver(()=>{if(!tm)tm=setTimeout(()=>{tm=0;deco()},700)}).observe(document.body,{childList:true,subtree:true})}catch(e){}}
function init(){if(g.VRT_HUBS)return;css();document.addEventListener('click',onClick);document.addEventListener('mouseover',over,{passive:true});decoInit();setTimeout(()=>{try{const d=pageDB();if(d)dbIdx(d)}catch(e){}},3500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
g.VRTKeynote={version:'1.2.1',open,close};
})(window);
