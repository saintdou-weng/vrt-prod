/* VRT AI 排單比對 v1（2026-11-21）
   三方比對：🤖 AI 預排 ／ 📋 實際排單（Production Plan）／ 🧵 實際生產（車縫日報）
   相合度＝同一天（或同一期間）、同一組、同一款的件數重疊：Σmin(甲,乙) ÷ max(Σ甲,Σ乙)。
   純邏輯（build／range／text）不碰 DOM，瀏覽器與 GAS 都能跑；render 只在瀏覽器用。
   AI 預排只用「那一週週一以前」看得到的資料：前 5 週各組標準工時產能、各組最近做的款、排單表上的訂單與剩餘量、交期。 */
(function (g) {
  'use strict';
  var K = function (s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  var num = function (v) { v = Number(v); return isFinite(v) ? v : 0; };
  var HOL = { '2026-11-09': 1, '2026-11-23': 1, '2026-11-24': 1, '2026-11-25': 1, '2026-12-29': 1, '2027-01-01': 1, '2027-01-07': 1 };
  function addD(d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function dow(d) { return new Date(d + 'T00:00:00Z').getUTCDay(); }
  function monOf(d) { return addD(d, -((dow(d) + 6) % 7)); }
  function lineN(s) { var m = String(s || '').match(/(\d+)/); return m ? 'L' + Number(m[1]) : ''; }
  function median(a) { if (!a.length) return 0; a = a.slice().sort(function (x, y) { return x - y; }); var h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; }
  function put(M, d, l, k, q) { if (!(q > 0)) return; var a = M[d] || (M[d] = {}), b = a[l] || (a[l] = {}); b[k] = (b[k] || 0) + q; }

  function build(data) {
    var today = data.today, rs = data.resolveSk, skc = {};
    var sk = function (raw) { var k = K(raw); if (!k) return ''; if (skc[k] != null) return skc[k]; var v = ''; try { v = rs ? K(rs(raw)) : ''; } catch (e) { v = ''; } return (skc[k] = v || k); };
    var FROM = data.from || '2026-06-01';
    /* 同一款不同寫法併成一個（例：GCRCLS320ZF／GCRCLS320ZFWH）：長的款號開頭＝短的款號（短的 ≥5 碼、只多 ≤4 碼）就算同款 */
    var uni = {}, sk0 = sk; (data.sewing || []).forEach(function (r) { var d = String(r.date || '').slice(0, 10); if (d >= FROM) { var k = sk0(r.styleNo || r.style); if (k) uni[k] = 1; } }); (data.plan || []).forEach(function (r) { var k = sk0(r.style); if (k) uni[k] = 1; });
    var keys = Object.keys(uni).sort(function (a, b) { return a.length - b.length; }), canon = {};
    keys.forEach(function (k) { for (var i = 0; i < keys.length; i++) { var p = keys[i]; if (p.length >= k.length) break; if (p.length >= 5 && k.length - p.length <= 4 && k.indexOf(p) === 0) { canon[k] = canon[p] || p; return; } } });
    sk = function (raw) { var k = sk0(raw); return canon[k] || k; };
    /* ── 實績 ── */
    var act = {}, sewDays = {}, rows = [], lastSew = '', custOf = {}, smvOf = {};
    (data.sewing || []).forEach(function (r) {
      var d = String(r.date || '').slice(0, 10); if (d < FROM || d > today) return; var q = num(r.pieces); if (!(q > 0)) return;
      var l = lineN(r.lineNo || r.line); if (!l) return; var s = sk(r.styleNo || r.style); if (!s) return;
      var sv = num(r.smv) || 0; put(act, d, l, s, q); sewDays[d] = 1; if (d > lastSew) lastSew = d;
      rows.push({ d: d, l: l, s: s, po: K(r.po || r.selfKey), q: q, sm: q * (sv || 6), sec: /apron|nap/i.test(r.section || '') ? 'A' : 'G' });
      if (sv > 0) smvOf[s] = sv;
    });
    rows.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    var isWork = function (d) { if (d <= lastSew) return !!sewDays[d]; return dow(d) !== 0 && !HOL[d]; };
    var workIn = function (a, b) { var o = [], x = a, n = 0; while (x <= b && n++ < 400) { if (isWork(x)) o.push(x); x = addD(x, 1); } return o; };
    /* ── 實際排單 ── */
    var plan = {}, jobs = [], shipOf = {};
    (data.styles || []).forEach(function (s) { if (s && s.sk && s.shipDate) shipOf[K(s.sk)] = String(s.shipDate).slice(0, 10); if (s && s.sk && s.customer) custOf[K(s.sk)] = s.customer; });
    (data.plan || []).forEach(function (r) {
      var q = num(r.sewingQty) || num(r.orderQty), a = String(r.startDate || '').slice(0, 10), b = String(r.endDate || '').slice(0, 10);
      var l = lineN(r.line), s = sk(r.style); if (!(q > 0) || !a || !l || !s) return; if (!b || b < a) b = a; if (b < FROM) return;
      var ds = workIn(a, b); if (!ds.length) ds = [a];
      ds.forEach(function (d) { put(plan, d, l, s, q / ds.length); });
      if (r.customer) custOf[s] = r.customer; if (num(r.smv) > 0 && !smvOf[s]) smvOf[s] = num(r.smv);
      jobs.push({ l: l, s: s, po: K(r.po), q: q, a: a, b: b, smv: num(r.smv) || 0, kind: /apron|nap/i.test(r.product || '') ? 'A' : 'G', cust: r.customer || '', ready: /齐全|齊全|complete|ready/i.test(r.remark || ''), month: String(r.month || '').slice(0, 7) });
    });
    /* ── AI 預排（以 T＝週一為基準，只看 T 以前的實績）── */
    function aiPlan(T, horizonDays) {
      var w0 = addD(T, -35), hist = rows.filter(function (r) { return r.d >= w0 && r.d < T; });
      var dayMin = {}, secMin = {}, recent = {}, last = {}, lastD = {};
      hist.forEach(function (r) { var a = dayMin[r.l] || (dayMin[r.l] = {}); a[r.d] = (a[r.d] || 0) + r.sm; var b = secMin[r.l] || (secMin[r.l] = { G: 0, A: 0 }); b[r.sec] += r.sm; (recent[r.l] || (recent[r.l] = {}))[r.s] = r.d; if (!lastD[r.l] || r.d >= lastD[r.l]) { lastD[r.l] = r.d; last[r.l] = r.s; } });
      var liveFrom = addD(T, -12), L = {};
      Object.keys(dayMin).forEach(function (l) { if (!lastD[l] || lastD[l] < liveFrom) return; var v = Object.keys(dayMin[l]).map(function (d) { return dayMin[l][d]; }); L[l] = { cap: median(v) || 1, kind: secMin[l].A > secMin[l].G ? 'A' : 'G', t: 0, last: last[l], recent: recent[l] || {} }; });
      var lines = Object.keys(L); if (!lines.length) return { M: {}, blocks: [], lines: [] };
      /* 訂單池以「款」為單位（車縫日報和排產表的 PO 寫法常對不上）：剩餘＝排產件數 −（排產開工日到 T 之間已做的件數） */
      var m0 = T.slice(0, 7), m1 = addD(T.slice(0, 8) + '01', 35).slice(0, 7), pool = {}, stale = addD(T, -14);
      jobs.forEach(function (j) { if (j.month && j.month !== m0 && j.month !== m1 && !(j.a <= addD(T, 28) && j.b >= T)) return; if (j.b < stale) return; var k = j.s, p = pool[k] || (pool[k] = { k: k, s: j.s, po: j.po, q: 0, smv: j.smv, kind: j.kind, cust: j.cust, ready: false, a: j.a }); p.q += j.q; if (j.ready) p.ready = true; if (j.a < p.a) p.a = j.a; if (!p.smv) p.smv = j.smv; });
      var sewn = {}; rows.forEach(function (r) { var p = pool[r.s]; if (p && r.d < T && r.d >= p.a) sewn[r.s] = (sewn[r.s] || 0) + r.q; });
      var list = Object.keys(pool).map(function (k) { var p = pool[k]; p.rem = p.q - (sewn[k] || 0); p.due = shipOf[p.s] || ''; p.smv = p.smv || smvOf[p.s] || 6; return p; }).filter(function (p) { return p.rem > Math.max(10, p.q * 0.02); });
      var rate = {};
      var rateOf = function (l, s2) { var x = rate && rate[l + '|' + s2]; if (!x) return 0; var v = Object.keys(x).map(function (d) { return x[d]; }); return v.length >= 2 ? median(v) : 0; };
      var blocks = [], place = function (p, l, qty) { var Li = L[l], ch = Li.last === p.s ? 0 : (qty < 200 ? 0.08 : 0.25), st = Li.t + ch, rt = rateOf(l, p.s), dur = rt ? qty / rt : qty * p.smv / Li.cap; blocks.push({ l: l, s: p.s, po: p.po, cust: p.cust, q: qty, st: st, en: st + dur, due: p.due }); Li.t = st + dur; Li.last = p.s; Li.recent[p.s] = T; };
      /* 1) 正在做的款留在原組先做完；同一款幾組一起做的，照最近 4 天各組做的量分 */
      var d3 = addD(T, -4), done = {}, rec = {}; rate = {};
      hist.forEach(function (r) { var k = r.s; if (r.d >= d3) { var a = rec[k] || (rec[k] = {}); a[r.l] = (a[r.l] || 0) + r.q; } var x = rate[r.l + '|' + r.s] || (rate[r.l + '|' + r.s] = {}); x[r.d] = (x[r.d] || 0) + r.q; });
      Object.keys(rec).sort(function (x, y) { return (pool[y] ? pool[y].rem || 0 : 0) - (pool[x] ? pool[x].rem || 0 : 0); }).forEach(function (k) { var p = pool[k]; if (!p || !(p.rem > Math.max(10, p.q * 0.02))) return; var ls = Object.keys(rec[k]).filter(function (l) { return L[l]; }); if (!ls.length) return; var sum = ls.reduce(function (a, l) { return a + rec[k][l]; }, 0); ls.forEach(function (l) { place(p, l, p.rem * rec[k][l] / sum); }); done[k] = 1; });
      /* 2) 其餘：料齊的先、交期早的先、量大的先；挑「最早做完」的組，做過同款的組優先 */
      list.filter(function (p) { return !done[p.k]; }).sort(function (x, y) { return (y.ready - x.ready) || ((x.due || '9999') < (y.due || '9999') ? -1 : (x.due || '9999') > (y.due || '9999') ? 1 : 0) || (y.rem - x.rem); }).forEach(function (p) {
        var cand = lines.filter(function (l) { return L[l].kind === p.kind; }); if (!cand.length) cand = lines;
        var sc = function (l) { var Li = L[l]; return Li.t + (Li.last === p.s ? 0 : 0.25) + p.rem * p.smv / Li.cap - (Li.recent[p.s] ? 1.5 : 0); };
        cand.sort(function (a, b) { return sc(a) - sc(b); });
        var dur = p.rem * p.smv / L[cand[0]].cap;
        if (dur > 10 && cand.length > 1) { var h = Math.round(p.rem / 2); place(p, cand[0], h); place(p, cand[1], p.rem - h); } else place(p, cand[0], p.rem);
      });
      /* 展開成每天件數 */
      var days = workIn(T, addD(T, horizonDays || 27)), M = {};
      blocks.forEach(function (b) { var per = b.q / Math.max(b.en - b.st, 0.01); for (var i = Math.floor(b.st); i < days.length && i < b.en; i++) { var lo = Math.max(b.st, i), hi = Math.min(b.en, i + 1); if (hi > lo) put(M, days[i], b.l, b.s, per * (hi - lo)); } b.d0 = days[Math.min(Math.floor(b.st), days.length - 1)]; b.d1 = days[Math.min(Math.max(Math.ceil(b.en) - 1, 0), days.length - 1)]; });
      return { M: M, blocks: blocks, lines: lines, T: T };
    }
    /* 每週一重排一次，只取那一週的結果（＝當時的 AI 預排） */
    var firstPlan = Object.keys(plan).sort()[0] || today, wk = monOf(firstPlan < '2026-07-06' ? '2026-07-06' : firstPlan), curWk = monOf(today), ai = {}, weeks = [], fwd = null;
    for (var n = 0; wk <= curWk && n < 80; n++, wk = addD(wk, 7)) { var r = aiPlan(wk, wk === curWk ? 27 : 6); var end = addD(wk, 6); Object.keys(r.M).forEach(function (d) { if (d <= end) ai[d] = r.M[d]; }); if (wk === curWk) fwd = r; weeks.push(wk); }
    return { today: today, lastSew: lastSew, act: act, plan: plan, ai: ai, weeks: weeks, fwd: fwd, custOf: custOf, isWork: isWork, HOL: HOL };
  }

  /* 期間彙總＋相合度；dim: 'line' | 'style' | 'cust' */
  function range(B, a, b, opt) {
    opt = opt || {}; if (b > B.lastSew && !opt.future) b = B.lastSew;
    var cell = {}, tot = { ai: 0, plan: 0, act: 0 }, src = ['ai', 'plan', 'act'];
    src.forEach(function (sn) { var M = B[sn]; Object.keys(M).forEach(function (d) { if (d < a || d > b) return; Object.keys(M[d]).forEach(function (l) { if (opt.line && l !== opt.line) return; Object.keys(M[d][l]).forEach(function (s) { if (opt.cust && (B.custOf[s] || '') !== opt.cust) return; if (opt.style && s !== opt.style) return; var k = l + '|' + s, c = cell[k] || (cell[k] = { l: l, s: s, ai: 0, plan: 0, act: 0 }); c[sn] += M[d][l][s]; tot[sn] += M[d][l][s]; }); }); }); });
    var cells = Object.keys(cell).map(function (k) { return cell[k]; });
    var ov = function (x, y, keyf) { var A = {}, Bm = {}, sa = 0, sb = 0, mn = 0; cells.forEach(function (c) { var k = keyf ? keyf(c) : c.l + '|' + c.s; A[k] = (A[k] || 0) + c[x]; Bm[k] = (Bm[k] || 0) + c[y]; }); Object.keys(A).forEach(function (k) { sa += A[k]; sb += Bm[k]; mn += Math.min(A[k], Bm[k]); }); var mx = Math.max(sa, sb); return mx > 0 ? Math.round(mn / mx * 1000) / 10 : null; };
    var byS = function (c) { return c.s; };
    var dim = opt.dim || 'line', grp = {};
    cells.forEach(function (c) { var k = dim === 'style' ? c.s : dim === 'cust' ? (B.custOf[c.s] || '（未標客戶）') : c.l, G = grp[k] || (grp[k] = { k: k, ai: 0, plan: 0, act: 0, mAP: 0, mPA: 0, mAA: 0, cells: [] }); G.ai += c.ai; G.plan += c.plan; G.act += c.act; G.mAP += Math.min(c.ai, c.plan); G.mPA += Math.min(c.plan, c.act); G.mAA += Math.min(c.ai, c.act); G.cells.push(c); });
    var rows = Object.keys(grp).map(function (k) { var G = grp[k], p = function (m, x, y) { var mx = Math.max(x, y); return mx > 0 ? Math.round(m / mx * 100) : null; }; G.sAP = p(G.mAP, G.ai, G.plan); G.sPA = p(G.mPA, G.plan, G.act); G.sAA = p(G.mAA, G.ai, G.act); return G; });
    rows.sort(dim === 'line' ? function (x, y) { return Number(x.k.slice(1)) - Number(y.k.slice(1)); } : function (x, y) { return Math.max(y.plan, y.act, y.ai) - Math.max(x.plan, x.act, x.ai); });
    return { a: a, b: b, tot: tot, aiPlan: ov('ai', 'plan'), planAct: ov('plan', 'act'), aiAct: ov('ai', 'act'), aiPlanS: ov('ai', 'plan', byS), planActS: ov('plan', 'act', byS), aiActS: ov('ai', 'act', byS), rows: rows, cells: cells };
  }
  function trend(B) { return B.weeks.map(function (w) { var r = range(B, w, addD(w, 6)); return { w: w, aiPlan: r.aiPlan, planAct: r.planAct, aiAct: r.aiAct, act: r.tot.act }; }).filter(function (x) { return x.act > 0; }); }

  /* 報告用短文字（Telegram／日報週報共用） */
  function text(B, a, b, title) {
    var N = function (v) { return Math.round(v).toLocaleString('en-US'); }, P = function (v) { return v == null ? '—' : v + '%'; }, md = function (d) { return Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)); };
    var r = range(B, a, b), T = trend(B), prev = T.length > 1 ? T[T.length - 2] : null, L = [];
    L.push('🤖 <b>AI 排單比對</b>　' + (title || (a === r.b ? md(a) : md(a) + '–' + md(r.b))));
    L.push('　實排↔實績 ' + P(r.planAct) + '｜AI↔實績 ' + P(r.aiAct) + '｜AI↔實排 ' + P(r.aiPlan) + '（目標 90%）');
    L.push('　件數　AI ' + N(r.tot.ai) + '・實排 ' + N(r.tot.plan) + '・實績 ' + N(r.tot.act));
    var gaps = r.cells.map(function (c) { return { c: c, g: Math.abs(c.plan - c.act) }; }).filter(function (x) { return x.g >= 300; }).sort(function (x, y) { return y.g - x.g; }).slice(0, 3);
    gaps.forEach(function (x) { var c = x.c; L.push('　' + c.l + ' ' + c.s + '：排 ' + N(c.plan) + '／做 ' + N(c.act) + '／AI ' + N(c.ai)); });
    if (prev && T.length) { var cur = T[T.length - 1]; if (cur.aiAct != null && prev.aiAct != null) L.push('　AI↔實績 上週 ' + prev.aiAct + '% → 本週 ' + cur.aiAct + '%'); }
    return L.join('\n');
  }

  /* ── 畫面（瀏覽器）── */
  var ST = { view: 'week', dim: 'line', key: '', line: '', cust: '' }, BB = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function periods(B, view) {
    var last = B.lastSew, o = [];
    if (view === 'day') { Object.keys(B.act).sort().reverse().slice(0, 45).forEach(function (d) { o.push({ k: d, a: d, b: d, t: d }); }); }
    else if (view === 'month') { var seen = {}; Object.keys(B.act).sort().reverse().forEach(function (d) { var m = d.slice(0, 7); if (m < '2026-07' || seen[m]) return; seen[m] = 1; var e = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10); o.push({ k: m, a: m + '-01', b: e, t: m }); }); }
    else if (view === 'year') { o.push({ k: '2026', a: B.weeks[0] || '2026-07-06', b: last, t: '2026（7 月起）' }); }
    else { B.weeks.slice().reverse().forEach(function (w) { if (w > last) return; o.push({ k: w, a: w, b: addD(w, 6), t: w.slice(5).replace('-', '/') + '–' + addD(w, 5).slice(5).replace('-', '/') }); }); }
    return o;
  }
  function chart(T) {
    if (T.length < 2) return ''; var W = 760, H = 220, px = 40, py = 18, iw = W - px - 70, ih = H - py - 30, X = function (i) { return px + iw * i / (T.length - 1); }, Y = function (v) { return py + ih * (1 - v / 100); };
    var ser = [['planAct', '#2563eb', '實排↔實績'], ['aiAct', '#16a34a', 'AI↔實績'], ['aiPlan', '#f59e0b', 'AI↔實排']], s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:820px;height:auto;font-family:inherit">';
    [0, 50, 90, 100].forEach(function (v) { s += '<line x1="' + px + '" x2="' + (px + iw) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + (v === 90 ? '#dc2626' : '#e5e7eb') + '" stroke-dasharray="' + (v === 90 ? '5 4' : '') + '"/><text x="' + (px - 6) + '" y="' + (Y(v) + 4) + '" font-size="10" text-anchor="end" fill="' + (v === 90 ? '#dc2626' : '#6b7280') + '">' + v + '%</text>'; });
    s += '<text x="' + (px + iw + 4) + '" y="' + (Y(90) - 4) + '" font-size="10" fill="#dc2626">目標 90%</text>';
    T.forEach(function (t, i) { if (i % Math.ceil(T.length / 10) === 0 || i === T.length - 1) s += '<text x="' + X(i) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="#6b7280">' + Number(t.w.slice(5, 7)) + '/' + Number(t.w.slice(8, 10)) + '</text>'; });
    ser.forEach(function (S, si) { var pts = T.map(function (t, i) { return t[S[0]] == null ? null : X(i) + ',' + Y(t[S[0]]); }).filter(Boolean); s += '<polyline fill="none" stroke="' + S[1] + '" stroke-width="2.5" points="' + pts.join(' ') + '"/>'; var lt = T[T.length - 1][S[0]]; if (lt != null) s += '<circle cx="' + X(T.length - 1) + '" cy="' + Y(lt) + '" r="4" fill="' + S[1] + '"/><text x="' + (X(T.length - 1) + 8) + '" y="' + (Y(lt) + 4 + (si - 1) * 0) + '" font-size="11" font-weight="700" fill="' + S[1] + '">' + lt + '%</text>'; });
    s += '</svg><div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-top:4px">' + ser.map(function (S) { return '<span><span style="display:inline-block;width:14px;height:3px;background:' + S[1] + ';vertical-align:middle;margin-right:4px"></span>' + S[2] + '</span>'; }).join('') + '</div>';
    return s;
  }
  function render(el, B) {
    BB = B; var N = function (v) { return Math.round(v).toLocaleString('en-US'); }, P = function (v) { return v == null ? '—' : v + '%'; };
    var ps = periods(B, ST.view); if (!ps.some(function (p) { return p.k === ST.key; })) ST.key = ps.length ? ps[0].k : '';
    var p = ps.filter(function (x) { return x.k === ST.key; })[0]; if (!p) { el.innerHTML = '<div class="card" style="padding:16px">還沒有可以比對的資料（要有排產和車縫日報）。</div>'; return; }
    var r = range(B, p.a, p.b, { dim: ST.dim, line: ST.line, cust: ST.cust }), T = trend(B), cur = T[T.length - 1] || {}, prev = T[T.length - 2] || {};
    var col = function (v) { return v == null ? '#9ca3af' : v >= 90 ? '#16a34a' : v >= 70 ? '#f59e0b' : '#dc2626'; };
    var dl = function (a, b) { if (a == null || b == null) return ''; var d = Math.round((a - b) * 10) / 10; return d > 0 ? ' <span style="color:#16a34a;font-size:12px">▲' + d + '</span>' : d < 0 ? ' <span style="color:#dc2626;font-size:12px">▼' + Math.abs(d) + '</span>' : ''; };
    var card = function (t, v, sub, pv) { return '<div style="flex:1;min-width:170px;background:var(--card,#fff);border:1px solid var(--bd,#e5e7eb);border-left:5px solid ' + col(v) + ';border-radius:10px;padding:10px 14px"><div style="font-size:12px;color:var(--muted,#6b7280)">' + t + '</div><div style="font-size:26px;font-weight:800;color:' + col(v) + '">' + P(v) + (pv === undefined ? '' : dl(v, pv)) + '</div><div style="font-size:11px;color:var(--muted,#6b7280)">' + sub + '</div></div>'; };
    var lines = {}, custs = {}; ['ai', 'plan', 'act'].forEach(function (sn) { Object.keys(B[sn]).forEach(function (d) { Object.keys(B[sn][d]).forEach(function (l) { lines[l] = 1; Object.keys(B[sn][d][l]).forEach(function (s) { if (B.custOf[s]) custs[B.custOf[s]] = 1; }); }); }); });
    var seg = function (name, cur2, opts) { return opts.map(function (o) { return '<button class="fbtn" style="' + (cur2 === o[0] ? 'background:#2563eb;color:#fff;border-color:#2563eb' : '') + '" onclick="VRTAPS.set(\'' + name + '\',\'' + o[0] + '\')">' + o[1] + '</button>'; }).join(''); };
    var h = '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:13px;line-height:1.7"><b>怎麼看：</b>🤖 AI 預排＝每週一用「當時看得到的資料」自己排；📋 實排＝排產表；🧵 實績＝車縫日報。相合度＝同一期間、同一組、同一款的件數重疊（100%＝完全一樣）。目標 90% 以上。車縫日報到 <b>' + B.lastSew + '</b>。</div>';
    h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">' + card('📋 實排 ↔ 🧵 實績', r.planAct, '排單準不準・只看款不看組 ' + P(r.planActS), ST.view === 'week' && ST.key === cur.w ? prev.planAct : undefined) + card('🤖 AI ↔ 🧵 實績', r.aiAct, 'AI 準不準・只看款不看組 ' + P(r.aiActS), ST.view === 'week' && ST.key === cur.w ? prev.aiAct : undefined) + card('🤖 AI ↔ 📋 實排', r.aiPlan, 'AI 像不像生管・只看款不看組 ' + P(r.aiPlanS), ST.view === 'week' && ST.key === cur.w ? prev.aiPlan : undefined) + '</div>';
    h += '<div class="card" style="padding:12px 14px;margin-bottom:10px"><div class="ctit" style="margin-bottom:6px">每週相合度走勢（越高越好）</div>' + chart(T) + '</div>';
    h += '<div class="fbar" style="gap:6px;flex-wrap:wrap">' + seg('view', ST.view, [['day', '日'], ['week', '週'], ['month', '月'], ['year', '年']]) + '<select onchange="VRTAPS.set(\'key\',this.value)">' + ps.map(function (x) { return '<option value="' + x.k + '"' + (x.k === ST.key ? ' selected' : '') + '>' + x.t + '</option>'; }).join('') + '</select><span style="margin-left:8px;font-size:12px;color:var(--muted,#6b7280)">分組</span>' + seg('dim', ST.dim, [['line', '組別'], ['style', '款式'], ['cust', '客戶']]) + '<select onchange="VRTAPS.set(\'line\',this.value)"><option value="">全部組</option>' + Object.keys(lines).sort(function (a, b) { return a.slice(1) - b.slice(1); }).map(function (l) { return '<option' + (l === ST.line ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select><select onchange="VRTAPS.set(\'cust\',this.value)"><option value="">全部客戶</option>' + Object.keys(custs).sort().map(function (c) { return '<option' + (c === ST.cust ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>';
    var mx = Math.max.apply(null, r.rows.map(function (G) { return Math.max(G.ai, G.plan, G.act); }).concat([1]));
    var bar = function (v, c) { return '<div style="display:flex;align-items:center;gap:6px;height:15px"><div style="height:9px;border-radius:3px;background:' + c + ';width:' + Math.max(v > 0 ? 2 : 0, v / mx * 100) + '%;max-width:calc(100% - 60px)"></div><span style="font-size:11px">' + N(v) + '</span></div>'; };
    var topS = function (G, sn) { return G.cells.filter(function (c) { return c[sn] > 0; }).sort(function (x, y) { return y[sn] - x[sn]; }).slice(0, 3).map(function (c) { return (ST.dim === 'line' ? c.s : c.l) + ' ' + N(c[sn]); }).join('、') || '—'; };
    var chip = function (v) { return '<span style="display:inline-block;min-width:44px;text-align:center;padding:2px 6px;border-radius:10px;font-weight:700;font-size:12px;color:#fff;background:' + col(v) + '">' + P(v) + '</span>'; };
    h += '<div class="card"><div class="tw"><table class="dt"><thead><tr><th>' + (ST.dim === 'line' ? '組別' : ST.dim === 'style' ? '款式' : '客戶') + '</th><th style="min-width:230px">件數（🤖 AI／📋 實排／🧵 實績）</th><th>🤖 AI 排了什麼</th><th>📋 實排</th><th>🧵 實際做了</th><th>排↔做</th><th>AI↔做</th><th>AI↔排</th></tr></thead><tbody>';
    r.rows.slice(0, 80).forEach(function (G) { h += '<tr><td><b>' + esc(G.k) + '</b></td><td>' + bar(G.ai, '#f59e0b') + bar(G.plan, '#2563eb') + bar(G.act, '#16a34a') + '</td><td style="font-size:12px">' + esc(topS(G, 'ai')) + '</td><td style="font-size:12px">' + esc(topS(G, 'plan')) + '</td><td style="font-size:12px">' + esc(topS(G, 'act')) + '</td><td>' + chip(G.sPA) + '</td><td>' + chip(G.sAA) + '</td><td>' + chip(G.sAP) + '</td></tr>'; });
    h += '<tr style="font-weight:700;background:rgba(37,99,235,.06)"><td>合計</td><td>' + bar(r.tot.ai, '#f59e0b') + bar(r.tot.plan, '#2563eb') + bar(r.tot.act, '#16a34a') + '</td><td></td><td></td><td></td><td>' + chip(r.planAct) + '</td><td>' + chip(r.aiAct) + '</td><td>' + chip(r.aiPlan) + '</td></tr></tbody></table></div></div>';
    var gaps = r.cells.map(function (c) { return { c: c, g: Math.max(Math.abs(c.plan - c.act), Math.abs(c.ai - c.act)) }; }).sort(function (x, y) { return y.g - x.g; }).slice(0, 8).filter(function (x) { return x.g >= 200; });
    if (gaps.length) { h += '<div class="card" style="padding:12px 14px;margin-top:10px"><div class="ctit" style="margin-bottom:6px">差最多的地方（先看這裡）</div>' + gaps.map(function (x) { var c = x.c, why = c.act < 1 && c.plan > 0 ? '排了沒做' : c.plan < 1 && c.act > 0 ? '沒排但做了' : c.act < c.plan ? '做得比排的少' : '做得比排的多'; return '<div style="font-size:13px;padding:4px 0;border-bottom:1px dashed var(--bd,#e5e7eb)"><b>' + c.l + '・' + esc(c.s) + '</b>（' + esc(B.custOf[c.s] || '') + '）　🤖 ' + N(c.ai) + '｜📋 ' + N(c.plan) + '｜🧵 ' + N(c.act) + '　<span style="color:#dc2626">' + why + '</span></div>'; }).join('') + '</div>'; }
    if (B.fwd && B.fwd.blocks.length) { var bl = B.fwd.blocks.slice().sort(function (x, y) { return Number(x.l.slice(1)) - Number(y.l.slice(1)) || x.st - y.st; }); h += '<div class="card" style="padding:12px 14px;margin-top:10px"><div class="ctit" style="margin-bottom:6px">🤖 AI 本週起的預排（每週一重排，' + B.fwd.T + ' 版）</div><div class="tw"><table class="dt"><thead><tr><th>組</th><th>款</th><th>PO</th><th>客戶</th><th class="r">件數</th><th>開始</th><th>做完</th><th>交期</th></tr></thead><tbody>' + bl.filter(function (b) { return b.st < 24; }).slice(0, 120).map(function (b) { var late = b.due && b.d1 > b.due; return '<tr><td>' + b.l + '</td><td>' + esc(b.s) + '</td><td>' + esc(b.po) + '</td><td>' + esc(b.cust) + '</td><td class="r">' + N(b.q) + '</td><td>' + (b.d0 || '') + '</td><td>' + (b.d1 || '') + '</td><td style="' + (late ? 'color:#dc2626;font-weight:700' : '') + '">' + (b.due || '—') + (late ? ' ⚠️' : '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>'; }
    el.innerHTML = h;
  }
  g.VRTAPS = { build: build, range: range, trend: trend, text: text, render: render, addD: addD, monOf: monOf, set: function (k, v) { ST[k] = v; if (k === 'view') ST.key = ''; var el = document.getElementById('aps-root'); if (el && BB) render(el, BB); }, state: ST };
})(typeof window !== 'undefined' ? window : this);
