/* VRT QC「🔍 品質瑕疵」分頁 v1.0（2026-11-14，取代原本的 SMV 情境比較）
   Paul 11/14：品質瑕疵也要一個像 PSJHR 員工頁的物品頁：每一種瑕疵一張卡（標準範例照封面），點開＝數字＋每月圖表＋哪幾線／哪幾款＋每天明細＋📷 照片；
   左右滑／◀ ▶ 換下一種。資料用 QC 頁本機已有的 Final QC 與車縫缺點 KPI，不另外下載。 */
(function(g){
'use strict';
if(g.VRTQCDefect)return;
const E=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const F=n=>(n==null||!isFinite(n))?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:0});
const P=n=>(n==null||!isFinite(n))?'—':(n*100).toFixed(1)+'%';
const nk=v=>String(v==null?'':v).replace(/\s+/g,' ').trim().toUpperCase();
const ln=v=>String(v||'').replace(/^Line\s*/i,'L');
function css(){if(document.getElementById('qdCss'))return;const s=document.createElement('style');s.id='qdCss';s.textContent=`
.qd-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0 10px}.qd-top input,.qd-top select{border:1px solid #d6dde8;border-radius:9px;padding:7px 10px;font:inherit;font-size:13px;background:#fff}
.qd-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.qd-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;cursor:pointer;transition:.12s}.qd-card:hover{border-color:#f59e0b;transform:translateY(-1px)}
.qd-ph{aspect-ratio:16/9;max-height:150px;width:100%;background:#f1f5f9 center/cover no-repeat;display:grid;place-items:center;font-size:30px;color:#94a3b8;position:relative}
.qd-ph i{position:absolute;right:6px;top:6px;font-style:normal;font-size:10.5px;font-weight:800;background:rgba(15,23,42,.75);color:#fff;border-radius:99px;padding:1px 7px}
.qd-tx{padding:9px 11px}.qd-tx b{display:block;font-size:14px}.qd-tx small{color:#64748b;font-size:11px}
.qd-m{display:flex;gap:10px;margin-top:6px;font-size:11px;color:#64748b}.qd-m b{display:block;font-size:16px;color:#0f172a}.qd-m .up{color:#dc2626}.qd-m .dn{color:#059669}
.qd-bar{height:6px;border-radius:99px;background:#f1f5f9;margin-top:7px;overflow:hidden}.qd-bar i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#ef4444)}
.qd-sheet{position:fixed;inset:0;z-index:9995;background:rgba(2,6,23,.55);display:flex;padding:10px}
.qd-box{margin:auto;width:min(1100px,100%);height:100%;background:#f4f6fb;border-radius:16px;display:flex;flex-direction:column;overflow:hidden}
.qd-hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-bottom:1px solid #e2e8f0}.qd-hd b{display:block;font-size:17px}.qd-hd small{color:#64748b;font-size:11px}
.qd-hd button{border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:6px 12px;font-size:15px;cursor:pointer}.qd-hd button:disabled{opacity:.3}
.qd-body{flex:1;overflow:auto;padding:12px 14px 24px}.qd-body h4{margin:16px 0 6px;font-size:14px}
.qd-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.qd-k div{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:9px 11px}.qd-k b{display:block;font-size:20px}.qd-k span{font-size:11px;color:#64748b}
.qd-h{display:flex;align-items:center;gap:8px;margin:3px 0;font-size:12px}.qd-h span:first-child{width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.qd-h em{flex:1;height:12px;border-radius:99px;background:#f1f5f9;overflow:hidden}.qd-h em i{display:block;height:100%;border-radius:99px}.qd-h b{width:44px;text-align:right}
.qd-tb{overflow:auto;max-height:380px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}.qd-tb table{border-collapse:collapse;width:100%;font-size:12px}.qd-tb th,.qd-tb td{padding:6px 8px;border-bottom:1px solid #eef2f7;text-align:left;white-space:nowrap}.qd-tb th{position:sticky;top:0;background:#f8fafc}
.qd-rel{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #e2e8f0;background:#fff;overflow-x:auto}.qd-rel button{border:1px solid #e2e8f0;background:#fff;border-radius:99px;padding:5px 10px;font-size:12px;white-space:nowrap;cursor:pointer}.qd-rel button.on{background:#f59e0b;border-color:#f59e0b;color:#fff}
`;document.head.appendChild(s)}
function build(all,kpi,range){const ev=[];const push=(r,src)=>(r.defects||[]).forEach(d=>{const q=+d.qty||0;if(q<=0)return;const nm=String(d.name||d.code||'').replace(/\s+/g,' ').trim();if(!nm)return;ev.push({k:nk(nm),name:nm,code:d.code||'',date:r.date,line:ln(r.line),qty:q,src,styles:(r.styles||[]).map(x=>typeof x==='string'?x:(x&&(x.style||x.styleNo))||'').filter(Boolean),customer:r.customer||'',po:r.po||'',insp:+r.inspected||0})});
  all.forEach(r=>push(r,'qc'));(kpi||[]).filter(r=>!r.deleted).forEach(r=>push(r,'kpi'));
  let rd=range.map(r=>r.date).filter(Boolean).sort();if(!rd.length){/* 選的期間沒有資料 → 改看資料裡最近 30 天 */const ds=ev.map(x=>x.date).filter(Boolean).sort();const last=ds[ds.length-1];if(last){const d=new Date(last+'T00:00:00');d.setDate(d.getDate()-29);rd=[d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),last]}}const r0=rd[0]||'',r1=rd[rd.length-1]||'';
  const G=new Map();ev.forEach(x=>{if(!G.has(x.k))G.set(x.k,[]);G.get(x.k).push(x)});
  const totR=ev.filter(x=>x.src==='qc'&&x.date>=r0&&x.date<=r1).reduce((s,x)=>s+x.qty,0)||1;
  return [...G].map(([k,a])=>{const nm=a[0].name,code=(a.find(x=>x.code)||{}).code||'';const inRange=a.filter(x=>x.src==='qc'&&x.date>=r0&&x.date<=r1);const n=inRange.reduce((s,x)=>s+x.qty,0);
    const days=r0&&r1?Math.max(1,Math.round((new Date(r1)-new Date(r0))/864e5)+1):30;const p0=new Date(new Date(r0||Date.now())-days*864e5);const pd=p0.getFullYear()+'-'+String(p0.getMonth()+1).padStart(2,'0')+'-'+String(p0.getDate()).padStart(2,'0');
    const prev=a.filter(x=>x.src==='qc'&&x.date>=pd&&x.date<r0).reduce((s,x)=>s+x.qty,0);
    return {k,name:nm,code,a,n,prev,share:n/totR,r0,r1}}).sort((x,y)=>y.n-x.n||y.a.length-x.a.length)}
function hbars(items,color){const mx=Math.max(1,...items.map(x=>x.v));return items.length?items.map(x=>`<div class="qd-h"><span title="${E(x.l)}">${E(x.l)}</span><em><i style="width:${x.v/mx*100}%;background:${color||'#f59e0b'}"></i></em><b>${F(x.v)}</b></div>`).join(''):'<p style="color:#64748b;font-size:12px">沒有資料</p>'}
function monthChart(a){const by=new Map();a.forEach(x=>{const m=String(x.date).slice(0,7);const o=by.get(m)||{qc:0,kpi:0};o[x.src]+=x.qty;by.set(m,o)});const ms=[...by.keys()].sort().slice(-12);if(!ms.length)return '';
  const mx=Math.max(1,...ms.map(m=>Math.max(by.get(m).qc,by.get(m).kpi))),W=Math.max(320,ms.length*48),H=170;const bw=(W-40)/ms.length;
  return `<div style="overflow-x:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:8px"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:${Math.min(W,520)}px">${ms.map((m,i)=>{const o=by.get(m),x=30+i*bw,h1=o.qc/mx*120,h2=o.kpi/mx*120;return `<rect x="${x+bw*.12}" y="${140-h1}" width="${bw*.36}" height="${h1}" rx="3" fill="#f59e0b"><title>${m} Final QC ${o.qc}</title></rect><rect x="${x+bw*.52}" y="${140-h2}" width="${bw*.36}" height="${h2}" rx="3" fill="#6366f1"><title>${m} 車縫 KPI ${o.kpi}</title></rect><text x="${x+bw/2}" y="${H-14}" font-size="10" text-anchor="middle" fill="#64748b">${m.slice(2)}</text><text x="${x+bw*.3}" y="${136-h1}" font-size="9" text-anchor="middle" fill="#b45309">${o.qc||''}</text>`}).join('')}</svg>
   <div style="font-size:11px;color:#64748b"><span style="color:#f59e0b">■</span> Final QC（成品抽驗） <span style="color:#6366f1">■</span> 車縫缺點 KPI（線上自檢）— 兩個來源分開算，不相加</div></div>`}
function open(list,i){css();let k=i;const el=document.createElement('div');el.className='qd-sheet';document.body.appendChild(el);
  const close=()=>{el.remove();document.removeEventListener('keydown',key)};const key=e=>{if(document.querySelector('.vp-lb'))return;if(e.key==='Escape')close();if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1)};document.addEventListener('keydown',key);
  const go=d=>{const n=k+d;if(n<0||n>=list.length)return;k=n;paint()};
  function paint(){const d=list[k],a=d.a,qc=a.filter(x=>x.src==='qc'),kp=a.filter(x=>x.src==='kpi');const lines=new Map(),sty=new Map();d.a.filter(x=>x.src==='qc'&&x.date>=d.r0&&x.date<=d.r1).forEach(x=>{lines.set(x.line,(lines.get(x.line)||0)+x.qty);x.styles.forEach(s=>sty.set(s,(sty.get(s)||0)+x.qty))});
    const ch=d.prev?(d.n-d.prev)/d.prev:null;const lc=k>0,rc=k<list.length-1;
    el.innerHTML=`<div class="qd-box"><div class="qd-hd"><button data-a="p" ${lc?'':'disabled'}>◀</button><div style="flex:1;min-width:0"><b>🔍 ${E(d.name)}</b><small>${d.code?'代碼 '+E(d.code)+' · ':''}${E(d.r0)}～${E(d.r1)}</small></div><small>${k+1} / ${list.length}</small><button data-a="n" ${rc?'':'disabled'}>▶</button><button data-a="x">✕</button></div>
     <div class="qd-body"><div class="qd-k"><div><b style="color:${d.n?'#d97706':'#059669'}">${F(d.n)}</b><span>這段期間（Final QC）</span></div><div><b style="color:${ch==null?'#0f172a':ch>0?'#dc2626':'#059669'}">${ch==null?'—':(ch>0?'▲ ':'▼ ')+Math.abs(ch*100).toFixed(0)+'%'}</b><span>比前一段（${F(d.prev)}）</span></div><div><b>${P(d.share)}</b><span>佔這段全部缺點</span></div><div><b>${F(qc.reduce((s,x)=>s+x.qty,0))}</b><span>Final QC 全部</span></div><div><b>${F(kp.reduce((s,x)=>s+x.qty,0))}</b><span>車縫 KPI 全部</span></div></div>
      <h4>📈 每月件數</h4>${monthChart(a)}
      <h4>🧵 哪幾條線最多（這段期間）</h4>${hbars([...lines].map(([l,v])=>({l,v})).sort((x,y)=>y.v-x.v).slice(0,14),'#ef4444')}
      ${sty.size?`<h4>👕 哪幾款（這段期間）</h4>${hbars([...sty].map(([l,v])=>({l,v})).sort((x,y)=>y.v-x.v).slice(0,12),'#6366f1')}`:''}
      <h4>📷 照片：標準範例＋每月異常</h4><div id="qdPh"></div>
      <h4>📋 每天明細</h4><div class="qd-tb"><table><thead><tr><th>日期</th><th>來源</th><th>線別</th><th>件數</th><th>款號</th><th>客戶</th><th>PO</th></tr></thead><tbody>${a.slice().sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,300).map(x=>`<tr><td>${E(x.date)}</td><td>${x.src==='qc'?'Final QC':'車縫 KPI'}</td><td>${E(x.line)}</td><td><b>${F(x.qty)}</b></td><td>${E(x.styles.join(' '))}</td><td>${E(x.customer)}</td><td>${E(x.po)}</td></tr>`).join('')}</tbody></table></div>
      ${rc?`<button data-a="n" style="display:block;width:100%;margin-top:16px;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;font-size:14px;cursor:pointer">下一個：${E(list[k+1].name)} ▶</button>`:''}</div>
     <div class="qd-rel">${list.slice(Math.max(0,k-4),k+12).map((x,j)=>{const ix=Math.max(0,k-4)+j;return `<button data-j="${ix}" class="${ix===k?'on':''}">${E(x.name)} ${F(x.n)}</button>`}).join('')}</div></div>`;
    if(g.VRTPhotos)g.VRTPhotos.mount(el.querySelector('#qdPh'),{domain:'defect',key:d.k,name:d.name,tip:'放這種瑕疵的標準範例照，大家才知道什麼叫這個瑕疵。'});else el.querySelector('#qdPh').innerHTML='<p style="color:#64748b">照片元件沒有載入</p>';
    el.querySelector('.qd-body').scrollTop=0;const on=el.querySelector('.qd-rel .on');on&&on.scrollIntoView({block:'nearest',inline:'center'})}
  el.addEventListener('click',e=>{if(e.target===el)return close();const a=e.target.closest('[data-a]');if(a){({p:()=>go(-1),n:()=>go(1),x:close})[a.dataset.a]();return}const j=e.target.closest('[data-j]');if(j){k=+j.dataset.j;paint()}});
  let sx=0,sy=0;el.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
  el.addEventListener('touchend',e=>{if(e.target.closest('.qd-tb,.qd-rel,svg,.vp-grid,input'))return;const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>80&&Math.abs(dy)<50)go(dx<0?1:-1)},{passive:true});
  paint()}
function render(host,ctx){if(!host)return;css();const list=build(ctx.all||[],ctx.kpi||[],ctx.range||[]);let q='',sort='n';
  function draw(){const sumN=list.reduce((s,x)=>s+x.n,0)||1;let l=list.filter(x=>!q||(x.name+' '+x.code).toUpperCase().includes(q));
    if(sort==='up')l=l.slice().sort((a,b)=>((b.n-b.prev)-(a.n-a.prev)));if(sort==='name')l=l.slice().sort((a,b)=>a.name.localeCompare(b.name));if(sort==='photo')l=l.slice().sort((a,b)=>(g.VRTPhotos?g.VRTPhotos.summary('defect',a.k).total:0)-(g.VRTPhotos?g.VRTPhotos.summary('defect',b.k).total:0));
    const mx=Math.max(1,...l.map(x=>x.n));
    host.innerHTML=`<section class="card"><div class="section-heading"><h2>🔍 品質瑕疵（每一種一頁）</h2></div>
     <p class="muted">${list[0]?'期間 '+E(list[0].r0)+'～'+E(list[0].r1)+'。':''}每張卡＝一種瑕疵：這段期間 Final QC 件數、比前一段多或少、標準範例照。點卡片看每月圖表、哪幾線／哪幾款、每天明細，並可上傳照片；左右滑換下一種。</p>
     <div class="qd-top"><input placeholder="🔍 搜尋瑕疵名稱／代碼" value="${E(q)}" id="qdQ"><select id="qdS"><option value="n" ${sort==='n'?'selected':''}>件數多→少</option><option value="up" ${sort==='up'?'selected':''}>增加最多</option><option value="photo" ${sort==='photo'?'selected':''}>還沒有照片的先</option><option value="name" ${sort==='name'?'selected':''}>名稱</option></select>
      ${g.VRTPhotos?'<button class="primary" id="qdLib">📷 照片庫／📥 匯入對照表</button>':''}</div>
     ${l.length?`<div class="qd-cards">${l.map(x=>{const ps=g.VRTPhotos?g.VRTPhotos.summary('defect',x.k):null;const ch=x.prev?(x.n-x.prev)/x.prev:null;return `<div class="qd-card" data-k="${E(x.k)}"><div class="qd-ph" style="${ps&&ps.cover?`background-image:url('${ps.cover}')`:'aspect-ratio:5/1'}">${ps&&ps.cover?'':'🔍'}${ps&&ps.total?`<i>📷 ${ps.total}</i>`:''}</div><div class="qd-tx"><b>${E(x.name)}</b><small>${x.code?'代碼 '+E(x.code):'&nbsp;'}</small>
       <div class="qd-m"><div><b>${F(x.n)}</b>這段期間</div><div><b class="${ch==null?'':ch>0?'up':'dn'}">${ch==null?'—':(ch>0?'▲':'▼')+Math.abs(ch*100).toFixed(0)+'%'}</b>比前段</div><div><b>${P(x.n/sumN)}</b>佔比</div></div><div class="qd-bar"><i style="width:${x.n/mx*100}%"></i></div></div></div>`}).join('')}</div>`:'<p class="muted">這段期間沒有缺點資料。</p>'}</section>`;
    const qi=host.querySelector('#qdQ');let tm;qi.oninput=()=>{clearTimeout(tm);tm=setTimeout(()=>{q=qi.value.trim().toUpperCase();draw();const n=host.querySelector('#qdQ');n.focus();n.setSelectionRange(n.value.length,n.value.length)},250)};
    host.querySelector('#qdS').onchange=e=>{sort=e.target.value;draw()};
    const lb=host.querySelector('#qdLib');lb&&(lb.onclick=()=>g.VRTPhotos.library({domain:'defect',items:()=>Promise.resolve(list.map(x=>({key:x.k,name:x.name,code:x.code,alt:''}))),onOpen:(d,key)=>{if(d!=='defect')return false;const i=list.findIndex(x=>x.k===key);if(i<0)return false;open(list,i);return true}}));
    host.querySelectorAll('.qd-card').forEach(c=>c.onclick=()=>{const i=l.findIndex(x=>x.k===c.dataset.k);if(i>=0)open(l,i)})}
  draw();if(g.VRTPhotos){g.VRTPhotos.ready.then(()=>host.isConnected&&draw());g.VRTPhotos.pull().then(()=>host.isConnected&&draw()).catch(()=>{})}}
g.VRTQCDefect={version:'1.0.0',render,build};
})(window);
