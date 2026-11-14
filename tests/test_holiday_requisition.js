// node tests/test_holiday_requisition.js - Holiday Requisition split (own list, not mixed into OT Requisition)
// Pure Node (no browser). Loads the real calculation modules + real helper functions from app-main.js.
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const NI = require('../js/calculations/night-issues.js');

function extract(src, name) {
  const m = new RegExp('(^|\\n)function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  let i = src.indexOf('{', m.index + m[0].length), depth = 0, j = i;
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(m.index + (m[1] ? m[1].length : 0), j);
}
// one vm context; localStorage is simulated and switchable per check
let lsStore = {};
const ctx = vm.createContext({
  console, Date, Math, JSON, Set, Map, Array, Object, String, Number, RegExp,
  localStorage: { getItem: k => (k in lsStore ? lsStore[k] : null), setItem: (k, v) => { lsStore[k] = String(v); }, removeItem: k => { delete lsStore[k]; } }
});
ctx.window = ctx;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/calculations/night-issues.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/calculations/ranking.js'), 'utf8'), ctx);
const app = fs.readFileSync(path.join(ROOT, 'js/app-main.js'), 'utf8');
['_splitReqIssues', 'getOtRequisitionCount', 'getNightIssueCount', 'getHolidayReqCount', 'getRequisitionProblemCount'].forEach(n => vm.runInContext(extract(app, n), ctx));
const clone = o => JSON.parse(JSON.stringify(o));
const HOL_KEY = 'rppf_plant_holidays_v1';

// ---------- 1. unit rules ----------
const govt = { date: '20-OCT-2026', day: 'Tue', in: '08:00', out: '17:00', duty: 8, expectedOt: 'Govt Holiday Requisition Missing', reason: 'Worked on Govt Holiday, but recorded as Regular Duty' };
const thu = { date: '08-OCT-2026', day: 'Thu', in: '08:00', out: '17:00', duty: 8, expectedOt: 'Weekend (Thu) DO Req Missing', reason: 'Worked on Weekend (Thu/Fri), but recorded as Regular Duty' };
const fri = { date: '09-OCT-2026', expectedOt: 'Weekend (Fri) DO Req Missing', reason: 'Weekend Duty recorded as Regular Duty' }; // client-fallback wording, no day field
const clientGovt = { date: '21-OCT-2026', expectedOt: 'Govt Holiday Req Missing (Should be in Holiday Allowance)', reason: 'Govt Holiday Duty recorded as Regular Duty' };
const otm = { date: '05-OCT-2026', expectedOt: '3.0h (04:30 - 07:30 PM)', reason: '3h Evening OT Missing' };
assert.strictEqual(NI.classifyHolidayItem(govt), 'govt-holiday');
assert.strictEqual(NI.classifyHolidayItem(thu), 'weekend-do');
assert.strictEqual(NI.classifyHolidayItem(fri), 'weekend-do');
assert.strictEqual(NI.classifyHolidayItem(clientGovt), 'govt-holiday');
assert.strictEqual(NI.classifyHolidayItem(otm), null);
assert.strictEqual(NI.classifyHolidayItem({ isNightIssue: true, reason: 'Govt Holiday' }), null);
assert.strictEqual(NI.weekdayOf('09-OCT-2026'), 'Fri');
const NOW = Date.UTC(2026, 10, 30, 6, 0, 0); // all Oct days closed
const input = [govt, thu, fri, otm, { date: '08-OCT-2026', expectedOt: '1.0h Morning OT', reason: 'Morning OT Missing' }];
const frozen = JSON.stringify(input);
const tg = NI.tagHolidayIssues(input, { nowMs: NOW });
assert.strictEqual(JSON.stringify(input), frozen, 'input must not be mutated');
assert.strictEqual(tg.filter(p => p.isHolidayReq).length, 3);
assert.strictEqual(tg.length, 4, 'same-date OT item folded into the holiday item');
assert.ok(/also: Morning OT Missing/.test(tg.find(p => p.date === '08-OCT-2026').reason), 'OT hint kept in text');
assert.strictEqual(tg.find(p => p.date === '09-OCT-2026').day, 'Fri', 'day derived from date');
assert.strictEqual(NI.tagHolidayIssues(input, { nowMs: NOW, cancelled: ['20-oct-2026'] }).filter(p => p.date === '20-OCT-2026').length, 0, 'cancelled date removed');
assert.strictEqual(NI.tagHolidayIssues([govt], { nowMs: Date.UTC(2026, 9, 21, 2, 0, 0) }).length, 0, 'day not closed yet -> not flagged');
const sp0 = NI.splitIssues(tg.concat([{ date: 'X', isNightIssue: true }]));
assert.deepStrictEqual([sp0.ot.length, sp0.night.length, sp0.holiday.length], [1, 1, 3]);
// night beats holiday on the same date
const nightSame = { date: '20-OCT-2026', isNightIssue: true, reason: 'night' };
const mg = NI.mergeRequisitionAndNight(NI.tagHolidayIssues([govt], { nowMs: NOW }), [nightSame]);
assert.strictEqual(mg.length, 1); assert.ok(mg[0].isNightIssue && /also: Worked on Govt Holiday/.test(mg[0].reason));
console.log('unit rules OK');

// ---------- 2. real data ----------
const MONTHS = ['2026-09', '2026-10', '2026-11'];
const perMonth = {};
MONTHS.forEach(ym => {
  lsStore = {};
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', ym + '.json'), 'utf8'));
  const emps = d.employees || d;
  let tot = 0, ot = 0, night = 0, hol = 0, govtN = 0, weekN = 0, empsHol = 0, empsOt = 0, expectHol = 0;
  const samples = [];
  emps.forEach(e => {
    // raw (untagged) source list: stored pipeline items, or the client fallback when the month file has none
    const stored = ctx._computeOtRequisitionProblems(clone(e));
    const all = ctx.computeEmpRequisitionProblems(clone(e));
    const sp = ctx.splitRequisitionIssues(all);
    assert.strictEqual(sp.ot.length + sp.night.length + sp.holiday.length, all.length, 'ot+night+holiday !== total for ' + e.id);
    // tags
    assert.ok(sp.night.every(p => p.isNightIssue === true && !p.isHolidayReq), 'night tag ' + e.id);
    assert.ok(sp.holiday.every(p => p.isHolidayReq === true && !p.isNightIssue && (p.kind === 'govt-holiday' || p.kind === 'weekend-do')), 'holiday tag ' + e.id);
    assert.ok(sp.ot.every(p => !p.isNightIssue && !p.isHolidayReq && !NI.classifyHolidayItem(p)), 'OT list must hold no holiday/weekend item ' + e.id);
    // no date in two lists / no duplicate date at all
    const dates = all.map(p => String(p.date).toUpperCase());
    assert.strictEqual(new Set(dates).size, dates.length, 'duplicate date for ' + e.id);
    // every raw Govt-holiday / Thu-Fri item (closed day) lands in holiday or (same date) night
    const nightDates = new Set(sp.night.map(p => String(p.date).toUpperCase()));
    const holDates = new Set(sp.holiday.map(p => String(p.date).toUpperCase()));
    stored.forEach(p => {
      if (!NI.classifyHolidayItem(p) || !NI.isDayClosed(p.date)) return;
      const D = String(p.date).toUpperCase();
      assert.ok(holDates.has(D) || nightDates.has(D), 'raw holiday item lost: ' + e.id + ' ' + D);
      if (!nightDates.has(D)) { expectHol++; const h = sp.holiday.find(x => String(x.date).toUpperCase() === D); assert.strictEqual(h.kind, NI.classifyHolidayItem(p)); }
      if (/Thu|Fri/.test(p.expectedOt) && /Weekend/.test(p.expectedOt) && !nightDates.has(D)) assert.strictEqual(sp.holiday.find(x => String(x.date).toUpperCase() === D).kind, 'weekend-do');
    });
    // helper counts == split
    const emp = clone(e);
    assert.strictEqual(ctx.getHolidayReqCount(emp), sp.holiday.length);
    assert.strictEqual(ctx.getOtRequisitionCount(emp), sp.ot.length);
    assert.strictEqual(ctx.getNightIssueCount(emp), sp.night.length);
    assert.strictEqual(ctx.getRequisitionProblemCount(emp), all.length);
    // multi-month style: tagged merged list is split, never recomputed
    const mm = { isMultiMonth: true, requisitionProblems: all.concat(all.map(p => Object.assign({}, p, { date: '99-' + p.date }))) };
    assert.strictEqual(ctx.getHolidayReqCount(mm), sp.holiday.length * 2);
    assert.strictEqual(ctx.getOtRequisitionCount(mm), sp.ot.length * 2);
    // second pass on the same object (stored list is now the merged list) must be stable
    assert.strictEqual(ctx.computeEmpRequisitionProblems(emp).length, all.length, 'not idempotent ' + e.id);
    tot += all.length; ot += sp.ot.length; night += sp.night.length; hol += sp.holiday.length;
    govtN += sp.holiday.filter(p => p.kind === 'govt-holiday').length; weekN += sp.holiday.filter(p => p.kind === 'weekend-do').length;
    if (sp.holiday.length) { empsHol++; if (samples.length < 3) samples.push(e.id + ' ' + JSON.stringify(sp.holiday[0])); }
    if (sp.ot.length) empsOt++;
  });
  assert.strictEqual(hol, expectHol, 'holiday total must equal classified raw items (closed, not night-overridden)');
  perMonth[ym] = { emps: emps.length, total: tot, ot, night, holiday: hol, govt: govtN, weekend: weekN, empsHol, empsOt };
  console.log(ym, JSON.stringify(perMonth[ym]));
  samples.forEach(s => console.log('   sample', s));
});

// ---------- 3. cancelled-holiday override (simulated localStorage) ----------
(function () {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/2026-10.json'), 'utf8')).employees;
  const e = d.find(x => (x.requisitionProblems || []).some(p => /Govt Holiday/.test(p.expectedOt || '')));
  assert.ok(e, 'need an employee with a Govt holiday item');
  const D = e.requisitionProblems.find(p => /Govt Holiday/.test(p.expectedOt || '')).date;
  lsStore = {};
  const before = ctx.splitRequisitionIssues(ctx.computeEmpRequisitionProblems(clone(e)));
  assert.ok(before.holiday.some(p => p.date === D));
  lsStore[HOL_KEY] = JSON.stringify({ cancelled: [D.toLowerCase()], custom: [] });
  const after = ctx.splitRequisitionIssues(ctx.computeEmpRequisitionProblems(clone(e)));
  assert.ok(!after.holiday.some(p => p.date === D) && !after.ot.some(p => p.date === D) && !after.night.some(p => p.date === D), 'cancelled date must vanish from every list');
  assert.strictEqual(after.holiday.length, before.holiday.length - 1);
  assert.strictEqual(after.ot.length, before.ot.length, 'OT list unchanged by the override');
  // same for a weekend item (cancelled = compensatory working day)
  const n = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/2026-11.json'), 'utf8')).employees;
  const e2 = n.find(x => (x.requisitionProblems || []).some(p => /Weekend/.test(p.expectedOt || '') && NI.isDayClosed(p.date)));
  const D2 = e2.requisitionProblems.find(p => /Weekend/.test(p.expectedOt || '') && NI.isDayClosed(p.date)).date;
  lsStore = {};
  const b2 = ctx.splitRequisitionIssues(ctx.computeEmpRequisitionProblems(clone(e2))).holiday.length;
  lsStore[HOL_KEY] = JSON.stringify({ cancelled: [D2] });
  const a2 = ctx.splitRequisitionIssues(ctx.computeEmpRequisitionProblems(clone(e2))).holiday.length;
  assert.strictEqual(a2, b2 - 1);
  lsStore = {};
  console.log('override check OK (cancelled', D, 'and', D2, 'each removed one holiday item)');
})();

console.log('test_holiday_requisition OK');
