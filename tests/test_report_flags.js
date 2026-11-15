#!/usr/bin/env node
// node tests/test_report_flags.js  (run tests/dump_baseline.js on the ORIGINAL code first -> /tmp/baseline.json)
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const A = require(path.join(ROOT, 'js/calculations/attendance.js'));
const NI = require(path.join(ROOT, 'js/calculations/night-issues.js'));
const NOW = Date.UTC(2026, 10, 14, 6);
const leaves = (JSON.parse(fs.readFileSync(path.join(ROOT, 'absent.json'), 'utf8')).longTermLeaves) || [];
const baseline = fs.existsSync('/tmp/baseline.json') ? JSON.parse(fs.readFileSync('/tmp/baseline.json', 'utf8')) : null;

// Real Ranking function (ranking.js) in a vm, clock fixed to NOW
class FixedDate extends Date { static now() { return NOW; } }
const ctx = vm.createContext({ console, Date: FixedDate, Math, JSON, Set, Map, Array, Object, String, Number, RegExp, parseInt, parseFloat,
  setTimeout: () => 0, CustomEvent: function () {}, document: { readyState: 'complete', addEventListener() {} },
  fetch: () => Promise.reject(new Error('offline')),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
ctx.window = ctx;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/calculations/night-issues.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/calculations/early-exit.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/calculations/ranking.js'), 'utf8'), ctx);
const rankReq = e => ctx.computeEmpRequisitionProblems(e);

const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const dayOf = (it, ym) => { const m = String(it.date).toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{4})/); return (m && `${m[3]}-${String(MON[m[2]]).padStart(2, '0')}` === ym) ? +m[1] : 0; };
const days = (rows, f) => rows.filter(f).map(r => +r.dayNum).sort((a, b) => a - b).join(',');
const FIELDS = ['generalAbsentCount', 'offAfterNightCount', 'presentPct', 'punchIssueCount', 'reqIssueCount'];

let gateHol = 0; const tot = {}; const samples = []; let checked = 0, bad = 0;
const fail = (m) => { bad++; if (bad <= 10) console.log('FAIL', m); };
for (const ym of ['2026-07', '2026-09', '2026-10', '2026-11'].filter(y => fs.existsSync(path.join(ROOT, 'data', y + '.json')))) {
  const emps = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', ym + '.json'), 'utf8')).employees || [];
  const dsMeta = A.computeDatasetMetaFromEmployees(emps);
  const t = tot[ym] = { emps: emps.length, holRows: 0, nightRows: 0, nightYes: 0 };
  for (const e of emps) {
    const base = { nowMs: NOW, dsMeta, longTermLeaves: leaves };
    const s = A.computeEmpMonthAttendance(e, ym, Object.assign({ computeEmpRequisitionProblems: rankReq, computeEmpEarlyExits: ctx.computeEmpEarlyExits }, base));
    const rows = s.rows; checked++;
    // (a) holiday rows == Ranking holiday dates
    const rankHol = NI.splitIssues(rankReq(e)).holiday.map(it => dayOf(it, ym)).filter(Boolean).sort((a, b) => a - b).join(',');
    if (days(rows, r => r.holidayReq) !== rankHol) fail(`(a) ${ym} ${e.id} rows=${days(rows, r => r.holidayReq)} ranking=${rankHol}`);
    // (b) night rows == computeEmpNightIssues
    const nIss = NI.computeEmpNightIssues(e, NOW).map(it => dayOf(it, ym)).filter(Boolean).sort((a, b) => a - b).join(',');
    if (days(rows, r => r.nightIssue) !== nIss) fail(`(b) ${ym} ${e.id} rows=${days(rows, r => r.nightIssue)} night=${nIss}`);
    // (c) one primary flag per date
    rows.forEach(r => { if (r.holidayReq && r.nightIssue) fail(`(c) ${ym} ${e.id} ${r.date}`); });
    // (d) Night Yes only when daily[10] === 1
    const yesDaily = (e.daily || []).filter(r => Array.isArray(r) && r[10] === 1).length;
    const yesRows = rows.filter(r => r.nightYes).length;
    if (yesRows !== yesDaily || s.nightYesCount !== yesDaily) fail(`(d) ${ym} ${e.id} rows=${yesRows} daily=${yesDaily} sum=${s.nightYesCount}`);
    if (rows.some(r => r.nightYes && /Night Missing/.test(r.note))) fail(`(d2) ${ym} ${e.id}`);
    // (e) baseline fields unchanged
    if (baseline) { const b = baseline[ym][e.id]; FIELDS.forEach(f => { if (b[f] !== s[f]) fail(`(e) ${ym} ${e.id} ${f} ${b[f]} -> ${s[f]}`); }); }
    // (g) not-yet-closed day never flagged
    rows.forEach(r => { if ((r.holidayReq || r.nightIssue) && !A.rptIsDayClosed(s.y, s.m, +r.dayNum, NOW)) fail(`(g) ${ym} ${e.id} ${r.date}`); });
    // (h) every holiday flag is a FULL duty day (Reg Duty >= threshold); short duty never flagged
    rows.filter(r => r.holidayReq).forEach(r => {
      const reg = NI.regDutyOnDate(e.daily, r.date);
      if (reg != null && reg > 0 && reg < NI.HOLIDAY_FULL_DUTY_MIN_HOURS) fail(`(h) ${ym} ${e.id} ${r.date} reg=${reg}`);
    });
    // (h2) a short-duty off-day with an early exit shows the gate pass flag, never both flags
    rows.forEach(r => { if (r.holidayReq && r.earlyExit) fail(`(h2) ${ym} ${e.id} ${r.date}`); if (r.earlyExitHoliday) { gateHol++; if (!/Gate Pass \(holiday\)/.test(r.note)) fail(`(h3) ${ym} ${e.id} ${r.date} ${r.note}`); } });
    // summary counters
    if (s.holidayReqCount !== rows.filter(r => r.holidayReq).length || s.nightIssueCount !== rows.filter(r => r.nightIssue).length || s.nightSuspectCount !== s.nightIssueCount) fail(`(sum) ${ym} ${e.id}`);
    t.holRows += s.holidayReqCount; t.nightRows += s.nightIssueCount; t.nightYes += yesDaily;
    if (samples.length < 3 && (s.holidayReqCount || s.nightIssueCount) && ym !== '2026-09') { const r = rows.find(x => x.holidayReq || x.nightIssue); samples.push({ id: e.id, ym, date: r.date, tone: r.tone, night: r.nightYes, note: r.note }); }
  }
}
// (f) cancelled-holiday override removes the flag (shared fallback path, same helper as Ranking)
{
  const emps = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/2026-10.json'), 'utf8')).employees;
  const dsMeta = A.computeDatasetMetaFromEmployees(emps);
  const e = emps.find(x => x.id === '556491');
  const on = A.computeEmpMonthAttendance(e, '2026-10', { nowMs: NOW, dsMeta, longTermLeaves: leaves, cancelledHolidays: [] });
  const off = A.computeEmpMonthAttendance(e, '2026-10', { nowMs: NOW, dsMeta, longTermLeaves: leaves, cancelledHolidays: ['04-OCT-2026'] });
  const r4on = on.rows.find(r => r.dayNum === '04'), r4off = off.rows.find(r => r.dayNum === '04');
  assert(r4on.holidayReq && r4on.holidayReq.kind === 'govt-holiday', '(f) 556491 04-OCT should be flagged');
  assert(!r4off.holidayReq, '(f) cancelled 04-OCT must not be flagged');
  assert.strictEqual(on.holidayReqCount - off.holidayReqCount, 1);
  // (g) explicit: clock before 04-OCT closes (05-OCT 09:00 BD) -> no flag
  const early = A.computeEmpMonthAttendance(e, '2026-10', { nowMs: Date.UTC(2026, 9, 4, 12), dsMeta, longTermLeaves: leaves, cancelledHolidays: [] });
  assert(!early.rows.find(r => r.dayNum === '04').holidayReq, '(g) open day must not be flagged');
  // CF4178 31-OCT: DN not YES -> Night column empty + flag
  const cf = A.computeEmpMonthAttendance(emps.find(x => x.id === 'CF4178'), '2026-10', { nowMs: NOW, dsMeta, longTermLeaves: leaves });
  const r31 = cf.rows.find(r => r.dayNum === '31');
  assert(r31.nightIssue && !r31.nightYes && !/\+ Night/.test(r31.note) && /Night Missing/.test(r31.note), '(CF4178 31-OCT)');
  console.log('CF4178 31-OCT:', r31.note, '| nightYes =', r31.nightYes);
}
// (i) the three real false-flag examples (2026-07) + full-duty days that must STILL be flagged
{
  const get = (ym, id) => { const emps = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', ym + '.json'), 'utf8')).employees; const dsMeta = A.computeDatasetMetaFromEmployees(emps); const e = emps.find(x => x.id === id); return { e, s: A.computeEmpMonthAttendance(e, ym, { nowMs: NOW, dsMeta, longTermLeaves: leaves, computeEmpRequisitionProblems: rankReq, computeEmpEarlyExits: ctx.computeEmpEarlyExits }) }; };
  [['RF20851', '23'], ['CF8356', '23'], ['CF2751', '30']].forEach(([id, dd]) => {
    const { e, s } = get('2026-07', id); const r = s.rows.find(x => x.dayNum === dd);
    assert(!r.holidayReq, `(i) ${id} ${dd}/07 must NOT be holidayReq`);
    assert(r.earlyExit && r.earlyExitHoliday && /Gate Pass \(holiday\)/.test(r.note), `(i) ${id} ${dd}/07 must show gate pass: ${r.note}`);
    assert(!NI.splitIssues(rankReq(e)).holiday.some(it => +String(it.date).slice(0, 2) === +dd), `(i) Ranking must not list ${id} ${dd}/07 as holiday`);
    console.log(id, dd + '/07:', r.note);
  });
  [['2026-10', '556491', '04'], ['2026-10', '556491', '15'], ['2026-11', '556490', '06']].forEach(([ym, id, dd]) => {
    const { s } = get(ym, id); const r = s.rows.find(x => x.dayNum === dd);
    assert(r.holidayReq && !r.earlyExit && /Holiday Req Missing/.test(r.note), `(j) ${id} ${dd} ${ym} must stay flagged: ${r.note}`);
  });
  // (k) tagHolidayIssues without daily keeps the old behaviour (nothing hidden when unmeasurable)
  const item = { date: '23-JUL-2026', day: 'Thu', kind: 'weekend-do', reason: 'x', expectedOt: 'Weekend (Thu) DO Req Missing' };
  assert.strictEqual(NI.tagHolidayIssues([item], { nowMs: NOW }).length, 1, '(k) no daily -> still flagged');
  assert.strictEqual(NI.tagHolidayIssues([item], { nowMs: NOW, daily: [['23-JUL-2026', 'Thu', '08:00', '11:48', 3.8, 0, 0, 0, 0, 0, 0, 'G']] }).length, 0, '(k) 3.8h -> dropped');
  assert.strictEqual(NI.tagHolidayIssues([item], { nowMs: NOW, daily: [['23-JUL-2026', 'Thu', '08:00', '16:48', 8, 0, 0, 0, 0, 0, 0, 'G']] }).length, 1, '(k) 8h -> kept');
  // (l) Ramadan / special shift: full duty there is ~6.3 h and must STILL be flagged; a 3 h day is dropped
  const ram = { date: '12-MAR-2026', day: 'Thu', kind: 'weekend-do', reason: 'x', expectedOt: 'Weekend (Thu) DO Req Missing' };
  const rowR = h => [['12-MAR-2026', 'Thu', '07:59', '14:22', h, 0, 0, 0, 0, 0, 0, 'G']];
  const rf = ctx.shiftRuleForDate;
  assert.strictEqual(NI.tagHolidayIssues([ram], { nowMs: NOW, daily: rowR(6.38), shiftRuleForDate: rf }).length, 1, '(l) Ramadan full duty 6.38h must stay flagged');
  assert.strictEqual(NI.tagHolidayIssues([ram], { nowMs: NOW, daily: rowR(2.9), shiftRuleForDate: rf }).length, 0, '(l) Ramadan 2.9h dropped');
  assert.strictEqual(NI.tagHolidayIssues([ram], { nowMs: NOW, daily: rowR(5.0), shiftRuleForDate: rf }).length, 0, '(l) Ramadan 5.0h (< 5.75) dropped');
  assert.strictEqual(NI.fullDutyMinFor('12-MAR-2026', rf), 5.75); assert.strictEqual(NI.fullDutyMinFor('23-JUL-2026', rf), 8);
  { const emps = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/2026-03.json'), 'utf8')).employees; let kept = 0;
    emps.forEach(e => { (ctx.computeEmpRequisitionProblems(e) || []).forEach(p => { if (NI.isHolidayItem(p)) kept++; }); });
    assert(kept >= 30, '(l) Mar-2026 Ramadan holiday flags must survive, got ' + kept); console.log('Mar-2026 holiday flags kept:', kept); }
  console.log('new gate-pass rows on holiday/off days (all months):', gateHol);
}
console.log('employee-months checked:', checked, '| failures:', bad);
console.log('counts per month:', JSON.stringify(tot));
console.log('samples:', JSON.stringify(samples, null, 1));
if (bad) { console.error('FAILED'); process.exit(1); }
console.log('✅ test_report_flags OK');
