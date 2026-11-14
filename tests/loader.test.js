// Loader test: Option A, Option B (emp file 404), Option B second run (localStorage cache, zero month fetches)
const fs = require('fs'), path = require('path'), vm = require('vm');
const { makeContext, ROOT } = require('./_harness');
const canon = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {}) : v);
const IDS = ['556490', 'CF2170', 'CF1181', 'CF2193', 'CF2990'];
const PRIMARY = '2026-11';

function build(opts) {
  const ctx = makeContext({ files: ['js/calculations/early-exit.js', 'js/calculations/attendance.js', 'js/calculations/profile.js'], localStorage: opts.ls });
  const stats = { fetched: [], };
  ctx.fetchJsonResource = async (file) => { stats.fetched.push(file); const p = path.join(ROOT, file); if (!fs.existsSync(p) || (opts.noEmp && file.startsWith('data/emp/'))) throw new Error('HTTP 404 for ' + file); return JSON.parse(fs.readFileSync(p, 'utf8')); };
  ctx.fetchMonthPreIndexedData = async (ym) => { if (!ctx.monthIndexMemoryCache[ym]) ctx.monthIndexMemoryCache[ym] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', ym + '.json'), 'utf8')).employees; return ctx.monthIndexMemoryCache[ym]; };
  ctx.getClientDepartment = () => 'PR';
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/pages/profile-data.js'), 'utf8'), ctx, { filename: 'profile-data.js' });
  // freeze "now" inside the sandbox to Nov 14 2026 so 2026-11 is the current month
  vm.runInContext("const __RD = Date; Date = class extends __RD { constructor(...a){ if(!a.length) super(2026,10,14,12,0,0); else super(...a);} static now(){ return new __RD(2026,10,14,12,0,0).getTime(); } };", ctx);
  return { ctx, stats };
}
async function totals(ctx, id) {
  const ms = []; const progress = [];
  const res = await ctx.profLoadHistory(id, { wantedMonths: ctx.profMonthRange('2026-01', '2026-11'), primaryMonth: PRIMARY, onProgress: (d, t) => progress.push(d + '/' + t) });
  const months = Object.keys(res.months).sort().map(ym => ctx.computeProfileMonth(res.months[ym] ? JSON.parse(JSON.stringify(res.months[ym])) : null, ym, { dsMeta: res.meta[ym], prevNight: res.meta[ym].prevNight }));
  return { res, agg: JSON.parse(canon(Object.assign({}, ctx.aggregateProfile(months), { months: months.map(m => ({ ym: m.ym, p: m.presentPct, a: m.absentDays, e: m.totalEarned, o: m.otHours })) }))), progress };
}
(async () => {
  // reference = everything in memory (what the report page would see)
  const ref = makeContext({ files: ['js/calculations/early-exit.js', 'js/calculations/attendance.js', 'js/calculations/profile.js'] });
  const byMonth = {}; fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^2026-\d{2}\.json$/.test(f)).sort().forEach(f => { byMonth[f.slice(0, 7)] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')).employees; ref.monthIndexMemoryCache[f.slice(0, 7)] = byMonth[f.slice(0, 7)]; });
  ref.monthIndexMemoryCache['2025-12'] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/2025-12.json'), 'utf8')).employees;
  let bad = 0;
  for (const id of IDS) {
    const ms = Object.keys(byMonth).map(ym => ref.computeProfileMonth((byMonth[ym].find(x => x.id === id) || null) && JSON.parse(JSON.stringify(byMonth[ym].find(x => x.id === id))), ym, {}));
    const R = JSON.parse(canon(Object.assign({}, ref.aggregateProfile(ms), { months: ms.map(m => ({ ym: m.ym, p: m.presentPct, a: m.absentDays, e: m.totalEarned, o: m.otHours })) })));
    // A
    const A = build({}); const a = await totals(A.ctx, id);
    // B (fresh)
    const ls = {}; const B = build({ noEmp: true, ls }); const b = await totals(B.ctx, id);
    const monthFetches = B.stats.fetched.filter(f => /^data\/\d{4}-\d{2}\.json$/.test(f)).length;
    const ok = canon(a.agg) === canon(R) && canon(b.agg) === canon(R);
    if (!ok) { bad++; console.log('MISMATCH', id, canon(a.agg) === canon(R) ? 'B' : 'A'); }
    console.log((ok ? 'OK  ' : 'FAIL'), id, 'A src=' + a.res.source, 'files', A.stats.fetched.length, '| B src=' + b.res.source, 'month-file fetches', monthFetches, 'progress', b.progress.slice(-3).join(','));
  }
  // warm-cache check: same context, call twice
  const W = build({ noEmp: true, ls: {} });
  await totals(W.ctx, '556490'); const n1 = W.stats.fetched.filter(f => /^data\/\d{4}-\d{2}\.json$/.test(f)).length;
  W.stats.fetched.length = 0; W.ctx.monthIndexMemoryCache = {}; // new session: memory empty, localStorage kept
  await totals(W.ctx, '556490'); const n2 = W.stats.fetched.filter(f => /^data\/\d{4}-\d{2}\.json$/.test(f)).length;
  console.log('Option B month-file fetches: first run', n1, '| second run (cached closed months)', n2);
  if (n2 > 0) { console.log('FAIL warm cache'); bad++; }
  console.log(bad ? 'FAILED' : 'ALL PASS'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
