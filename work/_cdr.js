function drCompactHtml_(f){
  var e=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};
  var n=function(v){return v==null||isNaN(v)?'—':Math.round(Number(v)).toLocaleString('en-US')};
  var p1=function(v){return v==null||isNaN(v)?'—':(Math.round(Number(v)*10)/10).toFixed(1)};
  var arrow=function(v){ if(v==null||isNaN(v))return ''; var r=Math.round(Number(v)); return r>0?' ▲'+r+'%':r<0?' ▼'+Math.abs(r)+'%':' ＝'; };
  var md=function(d){ d=String(d||''); return d.length>=10?Number(d.slice(5,7))+'/'+Number(d.slice(8,10)):d; };
  var light=function(eff){ if(eff==null||isNaN(eff))return ''; return eff>=35?'🟢':eff>=25?'🟡':'🔴'; };
  var s=f.sewing||{}, c=f.cutting||{}, w=f.wip||{}, pl=f.plan||{}, q=f.qc||{}, cmp=f.compare||{}, pv=f.prevDay||{};
  var L=[], HR='━━━━━━━━━━━━';
  L.push('📰 <b>VRT 生產日報</b>　'+md(f.date)+'（'+e(f.dow||'')+'）');
  L.push(HR);
  if(!f.hasData){ L.push('今天沒有車縫資料。'); }
  else{
    L.push('🧵 <b>車縫</b>　'+n(s.pieces)+' 件'+arrow(cmp.piecesVsPrev));
    var sub=[]; if(s.lines)sub.push(n(s.lines)+' 線'); if(s.manpower)sub.push(p1(s.manpower).replace(/\.0$/,'')+' 人');
    if(s.eff!=null)sub.push('效率 '+p1(s.eff)+'%'+(pv.eff!=null?'（昨 '+p1(pv.eff)+'%）':'')+' '+light(s.eff));
    if(sub.length)L.push('　'+sub.join('・'));
    if(f.mix&&f.mix.length>1)L.push('　'+f.mix.filter(function(m){return m.pieces>0}).map(function(m){return (m.product==='Apron'?'圍裙':m.product==='Garment'?'成衣':e(m.product))+' '+n(m.pieces)}).join('｜'));
  }
  if(c&&c.pieces!=null)L.push('✂️ <b>裁剪</b>　'+n(c.pieces)+' 件'+arrow(cmp.cutVsPrev)+(c.tables?'・'+n(c.tables)+' 床':''));
  if(w&&w.cutNotSewn)L.push('📦 <b>已裁未縫</b>　'+n(w.cutNotSewn)+' 件'+(w.daysOfOutput?'（約 '+p1(w.daysOfOutput).replace(/\.0$/,'')+' 天）':''));
  if(pl&&pl.planQty){
    L.push('📅 <b>'+Number(String(pl.month||'').slice(5,7))+' 月排單</b>　'+n(pl.mtd)+' / '+n(pl.planQty)+' 件（'+Math.round(pl.completion||0)+'%）');
    if(pl.workdaysLeft!=null)L.push('　剩 '+n(pl.workdaysLeft)+' 工作天・還要 '+n(pl.remaining)+' 件'+(pl.requiredPerDay?'（每天 '+n(pl.requiredPerDay)+'）':''));
  }
  if(q&&q.reports){ L.push('🔍 <b>QC</b>　退修率 '+(q.rate!=null?p1(q.rate)+'%':'—')+'・檢驗 '+n(q.inspected)+'・退修 '+n(q.rejected)); }
  else L.push('🔍 <b>QC</b>　今天沒有報告');
  var an=(f.anomalies||[]).slice().sort(function(a,b){return (b.sev||0)-(a.sev||0)});
  if(an.length){
    L.push(HR); L.push('⚠️ <b>要處理</b>');
    an.slice(0,4).forEach(function(a,i){
      var t=String(a.zh||'').replace(/（客戶統計 ?([\d-]+)）/,'（客統 $1）');
      if(t.length>90)t=t.slice(0,88)+'…';
      L.push((i+1)+'. '+e(t));
      var act=(f.actions||[])[i]; var req=act&&act.req?String(act.req).split(' / ')[0]:'';
      if(req&&req.length>60)req=req.slice(0,58)+'…';
      L.push('　→ '+e(a.who&&a.who.zh||act&&String(act.owner||'').split(' / ')[0]||'負責人')+(req?'：'+e(req):''));
    });
  }
  L.push(HR);
  var src=[]; src.push('車縫 '+(f.hasData?md(f.date):'—')); src.push('裁剪 '+(c&&c.pieces?md(f.date):'—')); src.push('QC '+(q&&q.reports&&q.date?md(q.date):'—')); if(f.fabric&&f.fabric.snapshotDate)src.push('布料 '+md(f.fabric.snapshotDate));
  L.push('<i>資料：'+src.join('・')+'</i>');
  return L.join('\n');
}
