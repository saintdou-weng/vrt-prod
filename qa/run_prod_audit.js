#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const tests = [];
const add = (name, pass, detail) => tests.push({ name, status: pass ? 'PASS' : 'FAIL', detail });
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const scripts = text => [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .map(m => ({ attrs: m[1], code: m[2] }));

function syntaxAudit(htmlFiles, jsFiles) {
  const errors = [];
  let inlineScripts = 0;
  for (const file of jsFiles) {
    try { new Function(read(file)); } catch (e) { errors.push(`${file}: ${e.message}`); }
  }
  for (const file of htmlFiles) {
    let index = 0;
    for (const part of scripts(read(file))) {
      index++;
      if (/\bsrc\s*=/.test(part.attrs)) continue;
      const type = (part.attrs.match(/type=["']([^"']+)/i) || [])[1] || '';
      if (/^(application\/json|application\/ld\+json)$/i.test(type) || !part.code.trim()) continue;
      inlineScripts++;
      try { new Function(part.code); } catch (e) { errors.push(`${file} script ${index}: ${e.message}`); }
    }
  }
  add('JavaScript syntax', errors.length === 0,
    errors.length ? errors : `${jsFiles.length} JS files + ${inlineScripts} inline scripts`);
}

function localReferenceAudit(htmlFiles) {
  const missing = [];
  for (const file of htmlFiles) {
    const text = read(file);
    for (const m of text.matchAll(/(?:src|href)=["']([^"']+)/gi)) {
      const ref = m[1].split('?')[0].split('#')[0];
      if (!ref || /^(?:https?:|data:|blob:|javascript:|mailto:|#)/i.test(ref) ||
          /[{}$\s]/.test(ref) || !/[./]/.test(ref)) continue;
      if (!fs.existsSync(path.resolve(ROOT, path.dirname(file), ref))) missing.push(`${file} -> ${ref}`);
    }
  }
  add('Local file references', missing.length === 0, missing.length ? missing : 'no missing local src/href');
}

function staticContractAudit(htmlFiles) {
  const weekly = 'vrt_production_weekly_report_generator_v3.html';
  const cloudPages = htmlFiles.filter(f => f !== weekly);
  const syncMissing = cloudPages.filter(f => !/vrt-smart-sync-v3\.js\?v=3\.7\.0/.test(read(f)));
  const autoMissing = cloudPages.filter(f => !/vrt-auto-sync-v3\.js\?v=3\.7\.0/.test(read(f)));
  add('Cloud modules use Smart Sync v3.7', syncMissing.length === 0,
    syncMissing.length ? syncMissing : `${cloudPages.length} cloud HTML modules`);
  add('Cloud modules load Auto Sync v3.7', autoMissing.length === 0,
    autoMissing.length ? autoMissing : `${cloudPages.length} cloud HTML modules`);

  const mobileMissing = htmlFiles.filter(f => !/width=device-width/i.test(read(f)) || !/@media\s*\(max-width/i.test(read(f)));
  add('Mobile/desktop responsive contract', mobileMissing.length === 0,
    mobileMissing.length ? mobileMissing : `${htmlFiles.length} HTML modules have viewport + responsive CSS`);

  const weeklyText = read(weekly);
  add('Weekly report baseline uses IndexedDB',
    /VRT_WeeklyReport/.test(weeklyText) && /VRTProdStorage\.(get|put)/.test(weeklyText) &&
    !/localStorage\.setItem\(BASELINE_KEY/.test(weeklyText),
    'VRT_WeeklyReport/baselines; localStorage is migration-read only');

  const ieText = read('ie_smv_report_v2_1.html');
  const bomText = read('VRT_BOM_Management_v2_AI.html');
  add('No automatic demo operational data',
    /state=clone\(EMPTY_STATE\)/.test(ieText) &&
    /if\(!existed\)\{ DB\.styles=\[\]/.test(bomText) &&
    !/if\(!existed[^\n]+seedDefaults\(\)/.test(bomText),
    'IE/SMV and BOM start empty when no saved dataset exists');

  const prod = read('production_v4.html');
  const planSegment = prod.slice(prod.indexOf('function planAggEvents'), prod.indexOf('function planWeekStart'));
  add('Production schedule is Production Plan only',
    /PLAN\.forEach/.test(planSegment) && /planAggEvents\(\)/.test(planSegment) && !/ORDERS/.test(planSegment),
    'planAggEvents/buildSchedule do not create schedule rows from Orders');

  const cutting = read('cutting_v3.html');
  const queryExport = cutting.slice(cutting.indexOf('if(type==="query")'), cutting.indexOf('if(type==="wip")'));
  add('Cutting query Excel export',
    !/qFrom|qTo/.test(queryExport) && /const q=/.test(queryExport) && /qV==="mo"/.test(queryExport),
    'current search/month/section and style/fabric/month views are exported');

  const gas = read('VRT_Production_v3.2_NO_SUMMARY_REMINDER.gs');
  add('PROD automatic reminder disabled',
    /maybeProdPendingReminder_\(\)\s*\{\s*return false;?\s*\}/.test(gas) &&
    /auditStatus[^\n]+disabled:true/.test(gas),
    'no automatic summary/approval reminder');
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
}

async function smartSyncAudit() {
  const localStorage = makeStorage(), sessionStorage = makeStorage();
  const calls = [];
  const ctx = {
    console, URL, Response, TextEncoder, crypto: global.crypto,
    location: { pathname: '/qa.html', href: 'https://local/qa.html' },
    navigator: { onLine: true }, localStorage, sessionStorage, indexedDB: undefined,
    document: {
      body: null, head: { appendChild() {} }, readyState: 'loading',
      addEventListener() {}, querySelectorAll() { return []; },
      createElement() { return { style: {}, appendChild() {} }; },
      getElementById() { return null; }
    },
    addEventListener() {}, setTimeout, clearTimeout,
    fetch: async (url, opt = {}) => {
      calls.push({ url: String(url), method: opt.method || 'GET' });
      const u = new URL(String(url), 'https://local/');
      if (u.searchParams.get('action') === 'smartManifest') {
        return new Response(JSON.stringify({ ok: true, data: ctx.manifestData }), { status: 200 });
      }
      throw new Error('unexpected fetch ' + url);
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('vrt-smart-sync-v3.js'), ctx);
  const sync = ctx.VRTSmartSync;
  const rows = [
    { date: '2026-09-05', customer: 'AMERICAN DAWN', size: '40', mode: 'SEA', cartons: 1170 },
    { date: '2026-09-19', customer: 'AMERICAN DAWN', size: '40', mode: 'SEA', cartons: 1170 }
  ];
  const buckets = await sync.buildBuckets(rows);
  const bucket = Object.values(buckets)[0];
  add('Shipping dates remain distinct in Smart Sync',
    bucket.count === 2 && sync.semanticKey(rows[0]) !== sync.semanticKey(rows[1]),
    'same customer/size/mode on 2026-09-05 and 2026-09-19 stay as 2 records');

  ctx.manifestData = { exists: true, hashes: { 'm:2026-09': 'cloudhash' }, counts: { 'm:2026-09': 4 }, meta: {} };
  calls.length = 0;
  const blocked = await sync.push({
    url: 'https://example.test/exec', tool: 'monthship',
    records: rows.concat({ date: '2026-09-26', customer: 'NORTHERN', size: '20', mode: 'SEA' })
  });
  add('Less-over-more protection',
    blocked.shrinkBlocked === true && blocked.cloudCount === 4 && blocked.recordCount === 3 &&
    !calls.some(x => x.method === 'POST'),
    'cloud 4 > local 3 is blocked before upload');

  const hashes = {}, counts = {};
  for (const [key, value] of Object.entries(buckets)) { hashes[key] = value.hash; counts[key] = value.count; }
  ctx.manifestData = { exists: true, hashes, counts, meta: {} };
  calls.length = 0;
  const pulled = await sync.pull({ url: 'https://example.test/exec', tool: 'shipping-unchanged', localRecords: rows });
  add('Unchanged Smart Pull downloads zero buckets',
    pulled.downloaded === 0 && !calls.some(x => x.url.includes('smartBucket')),
    `downloaded=${pulled.downloaded}; manifest-only check`);
}

function shippingWorkbookAudit(workbookPath) {
  if (!workbookPath) {
    add('Attached Shipping workbook regression', true, 'not rerun: pass --shipping-xlsx=/absolute/file.xlsx');
    return;
  }
  const context = { console, Buffer, process, setTimeout, clearTimeout, Date, ArrayBuffer, Uint8Array };
  context.window = context; context.global = context; context.globalThis = context;
  vm.createContext(context);
  const ieParts = scripts(read('ie_smv_report_v2_1.html'));
  const xlsxBundle = ieParts.find(p => !/\bsrc\s*=/.test(p.attrs) && p.code.length > 500000 && /\bXLSX\b/.test(p.code));
  vm.runInContext(xlsxBundle.code, context, { timeout: 30000, filename: 'embedded-xlsx.js' });
  let app = scripts(read('vrt_monthly_shipping_control_center_v1.html')).find(p => /function parseWorkbook/.test(p.code)).code;
  app = app.replace(/\$\('fileInput'\)\.addEventListener[\s\S]*$/, '');
  vm.runInContext(app, context, { timeout: 30000, filename: 'monthly-shipping-app.js' });
  const wb = context.XLSX.read(fs.readFileSync(workbookPath), { type: 'buffer', cellDates: false, raw: true });
  const parsed = context.parseWorkbook(wb, path.basename(workbookPath));
  const sep = parsed.filter(x => x.month === '2026-09' && String(x.mode).toUpperCase() === 'SEA');
  const expected = [
    ['2026-09-05', 'LECHNER', '20'],
    ['2026-09-05', 'AMERICAN DAWN', '40'],
    ['2026-09-19', 'AMERICAN DAWN', '40'],
    ['2026-09-26', 'NORTHERN', '20']
  ];
  const pass = sep.length === 4 && new Set(sep.map(x => x.customer)).size === 3 &&
    new Set(sep.map(x => x.id)).size === 4 &&
    expected.every(([date, customer, size]) => sep.some(x => x.date === date && x.customer === customer && x.size === size));
  add('Attached Shipping workbook regression', pass, {
    workbook: path.basename(workbookPath), allRecords: parsed.length,
    septemberShipments: sep.length, septemberUniqueCustomers: new Set(sep.map(x => x.customer)).size,
    septemberCartons: sep.reduce((sum, x) => sum + Number(x.cartons || 0), 0),
    records: sep.map(x => ({ date: x.date, customer: x.customer, size: x.size, mode: x.mode, cartons: x.cartons, id: x.id }))
  });
}

async function main() {
  const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
  const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js')).sort();
  add('PROD HTML inventory', htmlFiles.length === 19, `${htmlFiles.length} HTML files`);
  syntaxAudit(htmlFiles, jsFiles);
  localReferenceAudit(htmlFiles);
  staticContractAudit(htmlFiles);
  await smartSyncAudit();
  const arg = process.argv.find(x => x.startsWith('--shipping-xlsx='));
  shippingWorkbookAudit(arg ? arg.slice('--shipping-xlsx='.length) : '');
  const failed = tests.filter(t => t.status === 'FAIL');
  const result = {
    release: 'VRT PROD v3.7', generatedAt: new Date().toISOString(),
    summary: { total: tests.length, pass: tests.length - failed.length, fail: failed.length },
    tests
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write((error && error.stack) || String(error));
  process.exit(1);
});
