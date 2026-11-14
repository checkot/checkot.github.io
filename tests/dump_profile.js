// node tests/dump_profile.js <ID> [<ID>...]  -> JSON {id:{months:[...], total:{...}}} computed with the REAL data + shared attendance logic
const fs = require('fs'), path = require('path');
const { makeContext, ROOT } = require('./_harness');
const ctx = makeContext({ files: ['js/calculations/early-exit.js', 'js/calculations/attendance.js', 'js/calculations/profile.js'] });
const dept = process.env.DEPT || 'PR';
const dir = dept === 'QA' ? path.join(ROOT, 'data/qa') : path.join(ROOT, 'data');
const files = fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort();
const byMonth = {};
files.forEach(f => { const ym = f.slice(0, 7); const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); ctx.monthIndexMemoryCache[ym] = j.employees; byMonth[ym] = j.employees; });
const res = {};
process.argv.slice(2).forEach(id => {
  const ms = Object.keys(byMonth).map(ym => {
    const e = byMonth[ym].find(x => String(x.id).toUpperCase() === id.toUpperCase());
    return ctx.computeProfileMonth(e ? JSON.parse(JSON.stringify(e)) : null, ym, {});
  });
  const agg = ctx.aggregateProfile(ms);
  res[id] = JSON.parse(JSON.stringify({ months: ms, total: Object.assign({}, agg, { months: undefined }) }));
});
console.log(JSON.stringify(res));
