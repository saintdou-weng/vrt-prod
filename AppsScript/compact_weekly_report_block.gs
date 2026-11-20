/* ═══ v4.13 (2026-11-20) 效率週報／排單週報 精簡固定版面 — 新增一個 .gs 檔貼在專案「最後面」（要在 v412_compact_daily_report 之後），Token 不動 ═══
   照 REPORT_STANDARD.md：標題 → 數字（固定順序）→ 要處理（最多 4 條，誰：做什麼）→ 資料日期；≤ 20 行；數字全來自 DR.compute 的 facts，不經 AI。
   效率週報 kind=eff：車縫 → 裁剪 → 已裁未縫 → 機針零件 → QC → 出貨。
   排單週報 kind=plan：排單負荷 → 排單 vs 實績 → 下週 → 缺布 → 月排單 → 出貨。 */
function drCompactWeekHtml_(f){
  var e=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};
  var n=function(v){return v==null||isNaN(v)?'—':Math.round(Number(v)).toLocaleString('en-US')};
  var p1=function(v){return v==null||isNaN(v)?'—':(Math.round(Number(v)*10)/10).toFixed(1)};
  var p0=function(v){return v==null||isNaN(v)?'—':Math.round(Number(v))+'%'};
  var arrow=function(v){ if(v==null||isNaN(v))return ''; var r=Math.round(Number(v)); return r>0?' ▲'+r+'%':r<0?' ▼'+Math.abs(r)+'%':' ＝'; };
  var pt=function(v){ if(v==null||isNaN(v))return ''; var r=Math.round(Number(v)*10)/10; return r>0?' ▲'+r+' 點':r<0?' ▼'+Math.abs(r)+' 點':' ＝'; };
  var md=function(d){ d=String(d||''); return d.length>=10?Number(d.slice(5,7))+'/'+Number(d.slice(8,10)):d; };
  var light=function(x){ if(x==null||isNaN(x))return ''; return x>=35?'🟢':x>=25?'🟡':'🔴'; };
  var PL=f.kind==='plan';
  var s=f.sewing||{}, c=f.cutting||{}, w=f.wip||{}, pl=f.plan||{}, q=f.qc||{}, cmp=f.compare||{}, pv=f.prevDay||{}, sh=f.shipping||{}, ld=f.loading||null, fb=f.fabric||{}, mt=f.maint||{};
  var wk=String(f.week||'').replace(/^\d{4}-W0?/,'');
  var L=[], HR='━━━━━━━━━━━━';
  L.push((PL?'📋 <b>VRT 排單週報</b>':'📅 <b>VRT 效率週報</b>')+'　第 '+e(wk)+' 週（'+md(f.start)+'–'+md(f.end)+'）');
  L.push(HR);
  if(!PL){
    if(!f.hasData){ L.push('這週沒有車縫資料。'); }
    else{
      L.push('🧵 <b>車縫</b>　'+n(s.pieces)+' 件'+arrow(cmp.piecesVsPrev)+'（前週 '+n(pv.pieces)+'）');
      var sub=[]; if(s.dayCount)sub.push(n(s.dayCount)+' 天・日均 '+n(s.perDay)); if(s.manpower)sub.push('平均 '+p1(s.manpower).replace(/\.0$/,'')+' 人');
      if(s.eff!=null)sub.push('效率 '+p1(s.eff)+'%'+pt(cmp.effVsPrevPt)+light(s.eff));
      if(sub.length)L.push('　'+sub.join('・'));
      var weak=(f.lines||[]).filter(function(x){return x.eff!=null&&x.eff<25}).sort(function(a,b){return a.eff-b.eff}).slice(0,4);
      if(weak.length)L.push('　低效線　'+weak.map(function(x){return 'L'+String(x.line).replace(/^Line\s*/i,'')+' '+Math.round(x.eff)+'%'}).join('｜'));
    }
    if(c&&c.pieces!=null)L.push('✂️ <b>裁剪</b>　'+n(c.pieces)+' 件'+arrow(cmp.cutVsPrev)+(c.dayCount?'・'+n(c.dayCount)+' 天':''));
    if(w&&w.cutNotSewn)L.push('📦 <b>已裁未縫</b>　'+n(w.cutNotSewn)+' 件'+(w.daysOfOutput?'（約 '+p1(w.daysOfOutput).replace(/\.0$/,'')+' 天）':''));
    var nd=mt.needle||{}, pt2=mt.part||{};
    if(nd.qty!=null||pt2.rows)L.push('🔧 <b>機針零件</b>　換針 '+n(nd.qty)+' 支（非計畫 '+n(nd.unplanned)+(nd.unplannedShare!=null?'・'+p1(nd.unplannedShare)+'%':'')+'）・零件 '+n(pt2.qty)+' 個');
    if(q&&q.reports)L.push('🔍 <b>QC</b>　退修率 '+p1(q.rate)+'%'+pt(cmp.qcVsPrevPt)+'・檢驗 '+n(q.inspected)+'・退修 '+n(q.rejected));
    else L.push('🔍 <b>QC</b>　這週沒有報告');
  } else {
    if(!ld){ L.push('這週沒有排單資料（請先匯入排產）。'); }
    else{
      var wl=ld.week, nx=ld.next;
      L.push('📋 <b>排單負荷</b>　'+n(wl.scheduledLineDays)+' / '+n(wl.availableLineDays)+' 組日（'+p0(wl.loadingPct)+'）');
      var sb=[]; sb.push('換款 '+n(wl.changeovers)+' 次'); sb.push('空檔 '+n(wl.gapLineDays)+' 組日'); if(wl.emptyLines&&wl.emptyLines.length)sb.push('整週沒排：'+wl.emptyLines.join('、'));
      L.push('　'+sb.join('・'));
      L.push('🧵 <b>排單 vs 實績</b>　排 '+n(ld.exposure)+' ／ 縫 '+n(ld.actual)+' 件'+(ld.attainment!=null?'（'+p0(ld.attainment)+'）':''));
      L.push('📆 <b>下週</b>　排 '+n(nx.pieces)+' 件・'+n(nx.scheduledLineDays)+' / '+n(nx.availableLineDays)+' 組日（'+p0(nx.loadingPct)+'）'+(nx.emptyLines&&nx.emptyLines.length?'・未排：'+nx.emptyLines.join('、'):''));
    }
    if(fb&&fb.hasData&&fb.noFabricPcs)L.push('🧵 <b>缺布</b>　'+n(fb.noFabricPcs)+' 件'+(fb.byCust&&fb.byCust.length?'・'+fb.byCust.slice(0,3).map(function(x){return e(x.customer)+' '+n(x.noFabric)}).join('｜'):''));
    if(pl&&pl.planQty)L.push('📅 <b>'+Number(String(pl.month||'').slice(5,7))+' 月排單</b>　'+n(pl.mtd)+' / '+n(pl.planQty)+' 件（'+Math.round(pl.completion||0)+'%）・剩 '+n(pl.workdaysLeft)+' 工作天'+(pl.requiredPerDay?'・每天 '+n(pl.requiredPerDay):''));
  }
  if(sh&&sh.rows)L.push('🚢 <b>出貨</b>　'+(sh.pct!=null?p0(sh.pct):'—')+'（已出 '+n(sh.shipped)+' / 計畫 '+n(sh.orig)+'・未出 '+n(sh.open)+'）'+(sh.overdueRows?'・逾期 '+n(sh.overdueRows)+' 筆':''));
  var an=(f.anomalies||[]).slice().sort(function(a,b){return (b.sev||0)-(a.sev||0)});
  var SHORT={eff:'查換款、工序平衡、SMV、人員',fabric:'追到布日，回寫排單',quality:'查前三大缺點，當天回覆改善',capacity:'確認人力與排單',wip:'安排裁片上線，避免堆積',ship:'確認出貨日與裝箱',maint:'檢查機台與換針紀錄',needle:'查非計畫換針原因，檢查機台',empty:'補排訂單或確認停工',nextEmpty:'本週內填好下週排單，確認物料',gap:'補排或延長前後款',noplan:'匯入最新排產',dual:'查工序平衡與前三大缺點'};
  var shortText=function(a){ var t=String(a.zh||'');
    if(a.kind==='eff'){ var m=t.match(/L\d+\s*\d+%/g); if(m)return '低效線 '+m.map(function(x){return x.replace(/\s+/,' ')}).join('｜')+'（低於 25%）'; }
    if(a.kind==='fabric'){ var q2=t.match(/([\d,]+)\s*件/); return '缺布 '+(q2?q2[1]+' 件':'')+(a.ref?'・主要 PO '+String(a.ref).replace(/,\s*/g,'、'):''); }
    t=t.replace(/（客戶統計 ?[\d-]+）/,''); return t.length>60?t.slice(0,58)+'…':t; };
  if(an.length){
    L.push(HR); L.push('⚠️ <b>要處理</b>');
    an.slice(0,4).forEach(function(a,i){
      var act=(f.actions||[])[i]; var req=SHORT[a.kind]||(act&&act.req?String(act.req).split(' / ')[0]:'');
      if(req.length>40)req=req.slice(0,38)+'…';
      L.push((i+1)+'. '+e(shortText(a)));
      L.push('　→ '+e(a.who&&a.who.zh||act&&String(act.owner||'').split(' / ')[0]||'負責人')+(req?'：'+e(req):''));
    });
  }
  L.push(HR);
  var src=[]; src.push('車縫 '+(f.hasData?md(f.end):'—')); if(PL){ src.push('排產 '+(ld?'有':'—')); if(fb.snapshotDate)src.push('客戶統計 '+md(fb.snapshotDate)); } else { src.push('QC '+(q&&q.reports?md(f.end):'—')); }
  L.push('<i>資料：'+src.join('・')+'</i>');
  return L.join('\n');
}
function drHtmlZh_(rep){ var k=rep&&(rep.kind||rep.facts&&rep.facts.kind); if(rep&&rep.facts&&k==='day')return drCompactHtml_(rep.facts); if(rep&&rep.facts&&(k==='eff'||k==='plan'))return drCompactWeekHtml_(rep.facts); return rep.version===DR.version&&rep.htmlZh?rep.htmlZh:DR.render(rep.facts,{lang:'zh'}).html; }
function dailyReportSend_(rep,chatId,lang){
  lang=lang||drTgLang_(); var k=rep.kind||rep.facts&&rep.facts.kind; var compact=(k==='day'||k==='eff'||k==='plan'); var useAi=!compact&&rep.ai&&rep.ai.ok&&rep.ai.html;
  var html=k==='day'?drCompactHtml_(rep.facts):(k==='eff'||k==='plan')?drCompactWeekHtml_(rep.facts):(useAi?rep.ai.html:drText_(rep,lang).html);
  var res=tgSendHtml_(chatId||CFG.CHAT_ID, html, drKeyboard_(k||'day'));
  rep.sentAt=new Date().toISOString(); rep.sentAi=!!useAi; rep.sentCompact=compact; rep.sentLang=lang; rep.sentMessageId=res&&res.result&&res.result.message_id||null; dailyReportSave_(rep); return rep;
}
function checkCompactWeeklyReportV413(){ var idx=dailyReportIndex_().filter(function(x){return /-W\d{2}/.test(x.date)}); var out={ok:true,version:'4.13-compact-week',samples:[]}; idx.slice(0,2).forEach(function(x){ var r=dailyReportLoad_(x.date); if(r&&r.facts)out.samples.push(drCompactWeekHtml_(r.facts)); }); return out; }
