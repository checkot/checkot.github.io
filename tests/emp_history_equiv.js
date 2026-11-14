// Option A (per-employee file + injected meta) must give IDENTICAL profile numbers to Option B (full month files in memory).
const fs = require('fs'), path = require('path');
const { makeContext, ROOT } = require('./_harness');
const canon = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {}) : v); // key order is irrelevant (files use sort_keys)
const ctx = makeContext({ files: ['js/calculations/early-exit.js', 'js/calculations/attendance.js', 'js/calculations/profile.js'] });
const byMonth = {};
fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort().forEach(f => { const ym = f.slice(0, 7); byMonth[ym] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')).employees; ctx.monthIndexMemoryCache[ym] = byMonth[ym]; });
// meta cross-check: python vs real getMonthDatasetMeta
let metaBad = 0, ids = fs.readdirSync(path.join(ROOT, 'data/emp/PR')).map(f => f.slice(0, -5));
const sample = ids.filter((_, i) => i % 9 === 0);
const first = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/emp/PR', sample[0] + '.json'), 'utf8'));
Object.keys(byMonth).forEach(ym => {
  const js = ctx.getMonthDatasetMeta(ym);
  // find any employee file containing this month
  for (const id of sample) { const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/emp/PR', id + '.json'), 'utf8')); const m = f.meta[ym]; if (!m) continue;
    const a = JSON.stringify({ d: js.maxActiveDay, h: [...js.consensusHolidays].sort((x, y) => x - y) }), b = JSON.stringify({ d: m.maxActiveDay, h: m.consensusHolidays }); if (a !== b) { metaBad++; console.log('META DIFF', ym, a, b); } break; }
});
let n = 0, bad = 0, prevTrue = 0;
for (const id of sample) {
  const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/emp/PR', id + '.json'), 'utf8'));
  for (const ym of Object.keys(byMonth)) {
    const eB = byMonth[ym].find(x => String(x.id).toUpperCase() === id);
    const eA = f.months[ym] || null; if (!!eB !== !!eA) { bad++; console.log('exists mismatch', id, ym); continue; }
    if (!eA) continue;
    const B = ctx.computeProfileMonth(JSON.parse(JSON.stringify(eB)), ym, {});
    const m = f.meta[ym]; if (m.prevNight) prevTrue++;
    const A = ctx.computeProfileMonth(JSON.parse(JSON.stringify(eA)), ym, { dsMeta: m, prevNight: m.prevNight });
    n++; if (canon(A) !== canon(B)) { bad++; if (bad < 4) { console.log('DIFF', id, ym); for (const k of Object.keys(A)) if (canon(A[k]) !== canon(B[k])) console.log('  field', k, JSON.stringify(A[k]).slice(0, 160), '|', JSON.stringify(B[k]).slice(0, 160)); } }
  }
}
console.log(`employees ${sample.length}, employee-months ${n}, prevNight=true cases ${prevTrue}, meta diffs ${metaBad}, profile diffs ${bad}`);
process.exit(bad || metaBad ? 1 : 0);
