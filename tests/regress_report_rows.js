// Regression: new shared computeEmpMonthRows must equal the ORIGINAL report.js _rptRows on real data.
// usage: node tests/regress_report_rows.js <path-to-original-report.js>
const fs = require('fs'), path = require('path'), vm = require('vm');
const { makeContext, extractFn, ROOT } = require('./_harness');
const origSrc = fs.readFileSync(process.argv[2], 'utf8');
const origCode = 'const _RMON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];const _RDAY=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];const _rMin=t=>{const q=String(t).match(/^(\\d{1,2}):(\\d{2})/);return q?+q[1]*60+ +q[2]:null;};\n' + extractFn(origSrc, 'rptIsDayClosed') + '\n' + extractFn(origSrc, '_rptRows').replace('function _rptRows', 'function _origRptRows');
const leaves = [{ id: '556490', startDate: '2026-11-03', endDate: '2026-11-06', category: 'Maternity' }];
const ctx = makeContext({ files: ['js/calculations/early-exit.js', 'js/calculations/attendance.js'], longTermLeaves: leaves });
vm.runInContext(origCode, ctx);
// Fake "now" so closed/pending logic is exercised the same on both sides
const RealDate = Date; let checked = 0, diffs = 0; const tot = { absent: 0, pending: 0, offn: 0 };
const files = fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort();
for (const f of files) {
  const ym = f.slice(0, 7), j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
  ctx.monthIndexMemoryCache[ym] = j.employees; for (const k in ctx._monthDatasetMetaCache) delete ctx._monthDatasetMetaCache[k];
  const step = Math.max(1, Math.floor(j.employees.length / 150));
  for (let i = 0; i < j.employees.length; i += step) {
    const e = j.employees[i];
    const c = { emp: JSON.parse(JSON.stringify(e)), month: ym };
    const a = JSON.stringify(vm.runInContext('_origRptRows', ctx)(c));
    const c2 = { emp: JSON.parse(JSON.stringify(e)), month: ym };
    const b = JSON.stringify(ctx.computeEmpMonthRows(c2));
    const tt = JSON.parse(b).rows; tot.absent += tt.filter(x => x.isGeneralAbsent).length; tot.pending += tt.filter(x => x.fpPending).length; tot.offn += tt.filter(x => x.afterNight).length;
    checked++; if (a !== b) { diffs++; if (diffs < 4) console.log('DIFF', ym, e.id); }
  }
}
// leave employee, forced
const e = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/2026-11.json'), 'utf8')).employees.find(x => x.id === '556490');
if (e) { const a = JSON.stringify(vm.runInContext('_origRptRows', ctx)({ emp: JSON.parse(JSON.stringify(e)), month: '2026-11' })), b = JSON.stringify(ctx.computeEmpMonthRows({ emp: JSON.parse(JSON.stringify(e)), month: '2026-11' })); checked++; if (a !== b) diffs++;
  const r = ctx.computeEmpMonthRows({ emp: e, month: '2026-11' }).rows; console.log('556490 Nov leave rows:', r.filter(x => x.isApprovedLeave).length, 'absent:', r.filter(x => x.isGeneralAbsent).length); }
console.log('coverage (rows exercised):', JSON.stringify(tot));
console.log(`checked ${checked} employee-months, diffs ${diffs}`); process.exit(diffs ? 1 : 0);
