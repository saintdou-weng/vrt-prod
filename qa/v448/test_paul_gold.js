/* v4.48 — 照 Paul 7–11 月 24 封生產信校正報告引擎（11/24）。Run: node qa/v448/test_paul_gold.js [--show]
   ①工廠行事曆（9/24 調休上班、9/26 休、亡人節 10/9–15、10/29 照常上班、12/29→1/2）
   ②效率口徑：有人 0 產出的組進分母 → 和 Paul 週報數字一樣（用 DPO 原檔驗）
   ③產品別：餐巾／桌布／圍裙／成衣分開，同款分錯類自動校正（11/12 P050）
   ④週比較用每個生產日；上一期只有 1–3 天＝恢復；件數大變但標準工時差不多＝產品結構
   ⑤日報備註分類：補標（不是閒置）、舊半成品補標、缺輔料（快照不能相加）、SMV 重測
   ⑥寫法 lint 對 Paul 自己的信 0 錯；對錯誤寫法抓得到
   ⑦相似度分數（qa/v448/score_results.json）
   DPO 原檔不放 repo：預設讀 /mnt/user-data/attachments，或設 VRT_DPO_DIR。找不到就略過②③④⑦。 */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = process.env.VRT_ROOT || path.resolve(__dirname, '../..');
require(ROOT + '/vrt-daily-report-v1.js'); require(ROOT + '/vrt-report-scen-v1.js'); require(ROOT + '/vrt-report-style-v1.js'); require(__dirname + '/report_score.js');
const R = globalThis.VRTDailyReport, S = globalThis.VRTReportScen, ST = globalThis.VRTReportStyle, SC = globalThis.VRTReportScore;
const GOLD = require(__dirname + '/paul_gold_2026H2.json');
const SHOW = process.argv.includes('--show');
const out = []; function test(name, fn) { try { const d = fn(); out.push({ name, status: d === 'SKIP' ? 'SKIP' : 'PASS', detail: d }); console.log(d === 'SKIP' ? 'SKIP' : 'PASS', name, '·', d) } catch (e) { out.push({ name, status: 'FAIL', detail: String(e.stack || e) }); console.log('FAIL', name, '·', e.message) } }

/* ── DPO 原檔 → 引擎的車縫列 ── */
function findDpo() {
  const dirs = [process.env.VRT_DPO_DIR, '/mnt/user-data/attachments', '/mnt/user-data/uploads'].filter(Boolean); const hits = [];
  const walk = (d, depth) => { let ls = []; try { ls = fs.readdirSync(d, { withFileTypes: true }) } catch (e) { return } ls.forEach(x => { const p = path.join(d, x.name); if (x.isDirectory() && depth < 3) walk(p, depth + 1); else if (/Daily Production Output Report as of (August|October|November)/i.test(x.name) && /\.xlsx$/i.test(x.name)) hits.push(p) }) };
  dirs.forEach(d => walk(d, 0)); const by = {}; hits.forEach(p => { const m = p.match(/(August|October|November)/i)[1].toLowerCase(); by[m] = by[m] || p }); return Object.values(by);
}
function loadDpo(files) {
  const XLSX = require(ROOT + '/vendor/xlsx.full.min.js'); const MON = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const sew = [];
  files.forEach(f => {
    const wb = XLSX.read(fs.readFileSync(f), { type: 'buffer', cellDates: true });
    wb.SheetNames.filter(n => /^\d{1,2}$/.test(n.trim())).forEach(n => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true }); let date = null;
      rows.slice(0, 4).forEach(r => (r || []).forEach(c => { const m = typeof c === 'string' && c.match(/As of (\w+)\s+(\d{1,2}),\s*(\d{4})/); if (m && MON[m[1].toLowerCase()]) date = m[3] + '-' + String(MON[m[1].toLowerCase()]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0') }));
      if (!date) { const fm = path.basename(f).match(/(August|October|November)/i); if (fm) date = '2026-' + String(MON[fm[1].toLowerCase()]).padStart(2, '0') + '-' + String(Number(n)).padStart(2, '0') }
      if (!date) return; let mode = 'det'; const det = [], sum = {};
      rows.slice(4).forEach(r => { if (!r || r.every(c => c == null)) return; const a = r[0];
        if (typeof a === 'string' && /^TOTAL/i.test(a.trim()) && mode === 'det') { mode = 'gap'; return } if (typeof a === 'string' && a.trim().toUpperCase() === 'SUMMARY') { mode = 'sum'; return }
        if (mode === 'det' && typeof a === 'string' && /line\s*\d+/i.test(a) && typeof r[7] === 'number' && r[7]) det.push({ line: a.match(/\d+/)[0], style: String(r[3]).trim(), po: String(r[2]), qty: r[7], ctns: typeof r[8] === 'number' ? r[8] : 0, prod: String(r[9] || '').toUpperCase(), smv: typeof r[10] === 'number' ? r[10] : 0 });
        else if (mode === 'sum' && typeof a === 'string' && /line\s*\d+/i.test(a)) { const op = typeof r[1] === 'number' ? r[1] : 0, hr = typeof r[2] === 'number' ? r[2] : 8; sum[a.match(/\d+/)[0]] = { op, hr, comment: r.slice(9).filter(c => typeof c === 'string').join(' ') } } });
      const seen = {}; det.forEach(x => { const s = sum[x.line] || { op: 0, hr: 8, comment: '' }; const first = !seen[x.line]; seen[x.line] = 1;
        sew.push({ date, section: /NAPKIN|TOP|APRON/.test(x.prod) ? 'Apron' : 'Garment', lineNo: 'Line ' + x.line, styleNo: x.style, po: x.po, pieces: x.qty, cartons: x.ctns, smv: x.smv, producedMinutes: x.qty * x.smv, workers: first ? s.op : 0, attendedMinutes: first ? s.op * s.hr * 60 : 0, productType: x.prod, remark: first ? s.comment : '' }) });
      Object.keys(sum).forEach(l => { if (!seen[l] && sum[l].op > 0) sew.push({ date, section: 'Garment', lineNo: 'Line ' + l, styleNo: '', pieces: 0, smv: 0, producedMinutes: 0, workers: sum[l].op, attendedMinutes: sum[l].op * sum[l].hr * 60, remark: sum[l].comment }) });
    });
  });
  return sew;
}
const files = findDpo(); const sew = files.length ? loadDpo(files) : null;
const run = (date) => { const data = { sewing: sew, cutting: [], shipping: [], custstats: {}, prodplan: [], qc: { records: [], kpi: [] } }; const f = R.compute(data, { date, period: 'week', today: '2026-11-24' }); f.x = S.extras(data, f); const r = S.render(f, {}); return { f, r, ids: r.scen.map(z => z.id) } };
if (process.env.DUMP && sew) { const x = run(process.env.DUMP); console.log(x.f.start, x.f.end, x.f.sewing.pieces, x.f.x.stopDays, '\n' + x.r.text); process.exit(0) }

test('①工廠行事曆：9/24 調休上班、9/26 休、10/9–15 亡人節全休、10/29 照常上班、12/29 上班、1/2 休', () => {
  const w = d => R.isWorkday(d); assert(w('2026-09-24') && !w('2026-09-26')); ['2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].forEach(d => assert(!w(d), d)); assert(w('2026-10-29'), '10/29'); assert(w('2026-12-29') && !w('2027-01-02')); assert(!w('2026-11-09') && !w('2026-11-24'));
  return 'ok' });

test('⑤日報備註分類（簡體原文）', () => {
  const c = S.classifyRemark;
  assert.deepStrictEqual(c('主要原因是,WPL客户临时要求增加2个商标，车间安排2条线人员处理已包装成品拆箱和商标更新，但没有形成正常生产产量，因此效率显示为0.').kinds, ['relabel']);
  assert(c('原因是，这个组产量看起来比较高，是用之前的半成品做的，（只是顶商标.）').kinds.includes('wipOnly'));
  const t = c('主要原因是，辅料短缺， 还有930是半成品 .由于短缺商标.'); assert(t.kinds.includes('trimHold') && t.qty === 930 && t.item === '商標', JSON.stringify(t));
  const h = c('主要原因是，辅料短缺， 有390件是半成品 .\n由于短缺热转印标'); assert(h.kinds.includes('trimHold') && !h.kinds.includes('relabel') && h.item === '熱轉印標', JSON.stringify(h));
  assert(c('主要原因是，还 有400条是半成品 .\n由于等待绣花片').kinds.includes('trimHold'));
  assert(c('W154款号就是新款 SMV 有问题 ，现在 我已经和IE 讲好要他帮忙重新测试').kinds.includes('smvReview'));
  assert(c('昨天打造车故障 1个半小时').kinds.includes('machine'));
  assert(c('由于这几天成衣裁片供应不足，车间为避免人员闲置，主动生产任务，安排人员转做围裙').kinds.includes('cutSupply'));
  return 'ok' });

const WEEKS = [
  { gold: '2026-10-27', date: '2026-10-24', pcs: 37961, eff: 30.83, must: ['recovery'] },
  { gold: '2026-11-03', date: '2026-10-31', pcs: 47263, eff: 35.28, must: ['relabel'] },
  { gold: '2026-11-10', date: '2026-11-07', pcs: 78286, eff: 34.84, must: ['relabel', 'mixPcs'], not: ['bigSwing'] },
  { gold: '2026-11-17', date: '2026-11-14', pcs: 71193, eff: 37.67, must: ['shortWeek', 'trimHold', 'weakLines'], not: ['effDown'] }];
test('②效率口徑＝Paul 週報（有人 0 產出的組進分母）', () => { if (!sew) return 'SKIP';
  return WEEKS.map(w => { const x = run(w.date); assert.equal(x.f.sewing.pieces, w.pcs, w.date + ' pcs'); assert(Math.abs(x.f.sewing.eff - w.eff) < 0.05, w.date + ' eff ' + x.f.sewing.eff); return w.date.slice(5) + ' ' + x.f.sewing.eff.toFixed(2) + '%' }).join('、') });

test('③產品別：W46 餐巾 38,300／成衣 20,508／桌布 6,825／GRS 5,500（P050 誤列 TOP 自動校正）', () => { if (!sew) return 'SKIP';
  const fam = {}; run('2026-11-14').f.sewing.fam.forEach(z => { fam[z.fam] = z.pieces }); assert.equal(fam.NAPKIN, 38300); assert.equal(fam.GARMENT, 20508); assert.equal(fam.TOP, 6825); assert.equal(run('2026-11-14').f.sewing.grs.pieces, 5500); return JSON.stringify(fam) });

test('④週比較與情境：恢復／產品結構／補標不是閒置／缺標快照', () => { if (!sew) return 'SKIP';
  return WEEKS.map(w => { const x = run(w.date); (w.must || []).forEach(id => assert(x.ids.includes(id), w.date + ' 缺 ' + id + '：' + x.ids.join())); (w.not || []).forEach(id => assert(!x.ids.includes(id), w.date + ' 不該有 ' + id)); if (SHOW) console.log('\n' + x.r.text + '\n'); return w.date.slice(5) + ':' + x.ids.slice(0, 3).join('/') }).join('  ') });

test('⑥寫法 lint：Paul 自己的信不被誤抓；錯誤寫法抓得到', () => {
  const bad = 'L6、L8 改標那幾天閒置。11/5 930＋400＋500 件半成品待補。排單負荷 48% 就是產能利用率。效率是各組平均 31%。件數下降 9%，效率變差。这个组产量很高。10/29 放假。Reject 1,789 件要從完工數扣除。值得注意的是產量。';
  const ids = ST.lint(bad).map(z => z.id); ['relabelIdle', 'wipSum', 'loadingAsUtil', 'avgPercent', 'piecesOnly', 'simplified', 'coronationOff', 'rejectAsScrap', 'aiFiller'].forEach(id => assert(ids.includes(id), '沒抓到 ' + id + '：' + ids.join()));
  const good = '10/31第6、8組新車縫數為0，不等於兩組沒有工作，補標不是閒置。以上是日報中的當日快照，不能把930＋400＋500直接相加。不良率為檢驗件次中的不良紀錄比例，並非最終報廢率，也不可直接從完工件數扣減。';
  assert.deepStrictEqual(ST.lint(good).map(z => z.id), []); return ids.length + ' 種' });

test('⑦相似度：引擎週報 vs Paul 同期週報（基準，往 95 走）', () => { if (!sew) return 'SKIP';
  const res = WEEKS.map(w => { const g = GOLD.reports.find(r => r.id === w.gold); const x = run(w.date); const s = SC.score(x.r.text, g, { scen: x.ids }); return Object.assign({ report: w.gold, week: w.date }, s) });
  fs.writeFileSync(__dirname + '/score_results.json', JSON.stringify({ at: new Date().toISOString(), engine: { daily: R.version, scen: S.version, style: ST.version }, res }, null, 1));
  return res.map(r => r.report.slice(5) + ' ' + r.total).join('、') });

fs.writeFileSync(__dirname + '/paul_gold_results.json', JSON.stringify(out, null, 1));
const pass = out.filter(x => x.status !== 'FAIL').length; console.log(pass + '/' + out.length + ' passed'); if (pass < out.length) process.exitCode = 1;
