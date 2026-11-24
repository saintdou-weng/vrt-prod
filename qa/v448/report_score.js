/* v4.48 報告相似度（對 Paul 標準答案 paul_gold_2026H2.json）
   score(text, gold, {scen:[ids]}) → {kpi, scen, sections, lint, total}
   kpi＝標準答案的關鍵數字有幾個出現在報告裡（千分位、小數、% 都容許）；scen＝情境重疊；sections＝段落關鍵字；lint＝寫法錯誤扣分。
   目標：總分 ≥95（Paul 11/24：AI 預排與報告要和他／Claude 的報告越來越接近，最終 95% 相似且無錯誤寫法）。 */
(function (g) {
  'use strict';
  /* 引擎的情境代號 ↔ 寫法模組（Paul 信）的情境代號：一樣意思的算同一個 */
  var ALIAS = { monthClose: 'workdayNormalise', relabel: 'relabelSupport', weakLines: 'weakLineCause', effRed: 'weakLineCause', shortWeek: 'workdayNormalise', stopDays: 'workdayNormalise', qcMissing: 'noQcData', fabric: 'fabricCoverage', concentration: 'concentration', smvMissing: 'smvReview', smvNo: 'smvReview', emptyLines: 'targetedIdle', idleAfter: 'targetedIdle', backlogLow: 'visibility', nextEmpty: 'visibility', attainLow: 'routingMismatch', dupStyle: 'routingMismatch', shipOverdue: 'shipHolidayConflict', dualRisk: 'dualRisk', mix: 'mixPcs', bigSwing: 'sourceConflict', partial: 'dataGap', nodata: 'dataGap', dataLag: 'dataGap' };
  function canon(id) { return ALIAS[id] || id; }
  function numVariants(v) {
    if (typeof v !== 'number') return [String(v)];
    var out = [], abs = Math.abs(v);
    out.push(abs.toLocaleString('en-US', { maximumFractionDigits: 2 }));
    if (abs % 1) { out.push(abs.toFixed(1)); out.push(String(Math.round(abs * 100) / 100)); }
    else out.push(String(abs));
    return out.filter(function (x, i, a) { return a.indexOf(x) === i; });
  }
  function hasNum(text, v) {
    var t = String(text).replace(/\s+/g, '');
    return numVariants(v).some(function (s) { var re = new RegExp('(^|[^\\d.,])' + s.replace(/[.,]/g, '\\$&') + '(?![\\d])'); return re.test(t); });
  }
  function score(text, gold, opt) {
    opt = opt || {};
    var S = g.VRTReportStyle;
    var keys = Object.keys(gold.kpi || {}).filter(function (k) { return typeof gold.kpi[k] === 'number'; });
    var hit = keys.filter(function (k) { return hasNum(text, gold.kpi[k]); });
    var gs = (gold.scen || []).map(canon), es = (opt.scen || []).map(canon);
    var sHit = gs.filter(function (id) { return es.indexOf(id) >= 0; });
    var secKw = (gold.sections || []).map(function (s) { return s.replace(/[A-Za-z0-9 ／\/–\-]/g, '').slice(0, 4); }).filter(Boolean);
    var secHit = secKw.filter(function (k) { return String(text).indexOf(k) >= 0; });
    var lint = S ? S.lint(text, { type: gold.type }) : [];
    var kpi = keys.length ? hit.length / keys.length : 1, scen = gs.length ? sHit.length / gs.length : 1, sec = secKw.length ? secHit.length / secKw.length : 1;
    var lintScore = Math.max(0, 1 - lint.length * 0.2);
    var total = Math.round((kpi * 0.45 + scen * 0.30 + sec * 0.15 + lintScore * 0.10) * 1000) / 10;
    return { total: total, kpi: Math.round(kpi * 100), kpiMissing: keys.filter(function (k) { return hit.indexOf(k) < 0; }), scen: Math.round(scen * 100), scenMissing: gs.filter(function (id) { return sHit.indexOf(id) < 0; }), sections: Math.round(sec * 100), lint: lint.map(function (x) { return x.id; }) };
  }
  g.VRTReportScore = { score: score, canon: canon, hasNum: hasNum };
  if (typeof module !== 'undefined') module.exports = g.VRTReportScore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
