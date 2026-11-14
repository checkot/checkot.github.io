// node tests/test_ranking_split.js - OT vs Night requisition split (Ranking Issues card)
// Loads the real calculation modules + the real helper functions from app-main.js (by name) and checks the split.
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function extract(src, name) {
  const m = new RegExp('(^|\\n)function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  let i = src.indexOf('{', m.index + m[0].length), depth = 0, j = i;
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { j++; break; } } }
  return src.slice(m.index + (m[1] ? m[1].length : 0), j);
}

const ctx = vm.createContext({ console, Date, Math, JSON, Set, Map, Array, Object, String, Number, RegExp });
ctx.window = ctx; // calculation modules attach their functions to window
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/calculations/night-issues.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/calculations/ranking.js'), 'utf8'), ctx);
const app = fs.readFileSync(path.join(ROOT, 'js/app-main.js'), 'utf8');
['_splitReqIssues', 'getOtRequisitionCount', 'getNightIssueCount', 'getHolidayReqCount', 'getRequisitionProblemCount'].forEach(n => vm.runInContext(extract(app, n), ctx));

const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/2026-10.json'), 'utf8'));
const emps = d.employees || d;
let total = 0, otTotal = 0, nightTotal = 0, holTotal = 0, empsNight = 0, empsOt = 0, both = 0;
emps.forEach(e => {
  const all = ctx.computeEmpRequisitionProblems(JSON.parse(JSON.stringify(e)));
  const sp = ctx.splitRequisitionIssues(all);
  assert.strictEqual(sp.ot.length + sp.night.length + sp.holiday.length, all.length, 'ot+night+holiday must equal total for ' + e.id);
  assert.ok(sp.holiday.every(p => p.isHolidayReq === true && !p.isNightIssue), 'holiday items must be tagged');
  assert.ok(sp.ot.every(p => !p.isHolidayReq), 'ot items must not be holiday');
  assert.ok(sp.night.every(p => p.isNightIssue === true), 'night items must be tagged');
  assert.ok(sp.ot.every(p => !p.isNightIssue), 'ot items must not be tagged');
  const nd = new Set(sp.night.map(p => p.date));
  assert.ok(!sp.ot.some(p => nd.has(p.date)), 'date in both lists for ' + e.id);
  assert.ok(!sp.holiday.some(p => nd.has(p.date)), 'holiday/night date overlap for ' + e.id);
  // helper functions (same code the UI uses)
  const emp = JSON.parse(JSON.stringify(e));
  assert.strictEqual(ctx.getOtRequisitionCount(emp), sp.ot.length);
  assert.strictEqual(ctx.getNightIssueCount(emp), sp.night.length);
  assert.strictEqual(ctx.getHolidayReqCount(emp), sp.holiday.length);
  assert.strictEqual(ctx.getRequisitionProblemCount(emp), all.length);
  // multi-month style employee: merged tagged list is split, not recomputed
  const mm = { isMultiMonth: true, requisitionProblems: [].concat(all, all.map(p => Object.assign({}, p, { date: '99-' + p.date }))) };
  assert.strictEqual(ctx.getOtRequisitionCount(mm), sp.ot.length * 2);
  assert.strictEqual(ctx.getNightIssueCount(mm), sp.night.length * 2);
  assert.strictEqual(ctx.getHolidayReqCount(mm), sp.holiday.length * 2);
  total += all.length; otTotal += sp.ot.length; nightTotal += sp.night.length; holTotal += sp.holiday.length;
  if (sp.night.length) empsNight++; if (sp.ot.length) empsOt++; if (sp.night.length && sp.ot.length) both++;
});
console.log('employees:', emps.length, '| total items:', total, '| OT items:', otTotal, '| Night items:', nightTotal, '| Holiday items:', holTotal);
console.log('employees with OT issues:', empsOt, '| with Night issues:', empsNight, '| with both:', both);
console.log('test_ranking_split OK');
