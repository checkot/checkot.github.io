// node tests/test_night_issues.js  - back-test of Night Issue detection on real month files
const fs = require('fs'), path = require('path'), assert = require('assert');
const NI = require('../js/calculations/night-issues.js');
const T = (h, m) => h * 60 + m;
const NOW = Date.UTC(2026, 10, 14, 6, 0, 0); // 14-NOV-2026 12:00 BD

// --- unit rules
assert.strictEqual(NI.classifyDay({ shift: 'DN', in: '07:50', out: '21:48', duty: 14 }).kind, 'dn-window');
assert.strictEqual(NI.classifyDay({ shift: 'DN', in: '07:50', out: '21:29', duty: 13 }).kind, 'dn-flag');   // just before window
assert.strictEqual(NI.classifyDay({ shift: 'DN', in: '07:50', out: '22:15', duty: 14 }).kind, 'dn-window'); // window edge
assert.strictEqual(NI.classifyDay({ shift: 'DN', in: '07:50', out: '22:16', duty: 14 }).kind, 'dn-flag');
assert.strictEqual(NI.classifyDay({ shift: 'DN', in: '--:--', out: '--:--', duty: 0 }).kind, 'dn-punch');
assert.strictEqual(NI.classifyDay({ shift: 'G', in: '08:00', out: '17:00', duty: 8 }), null);               // normal day
assert.strictEqual(NI.classifyDay({ shift: 'G', in: '08:00', out: '23:30', duty: 15.5 }).kind, 'long-duty');
assert.strictEqual(NI.classifyDay({ shift: 'G', in: '', out: '06:10', duty: 0 }).kind, 'morning-out');
// day not closed yet -> not flagged (night-end punch arrives next morning)
const e1 = { nightSuspects: [{ date: '14-NOV-2026', in: '07:50', out: '21:48', duty: 14, shift: 'DN' }] };
assert.strictEqual(NI.computeEmpNightIssues(e1, Date.UTC(2026, 10, 14, 12, 0, 0)).length, 0);   // 18:00 BD same day
assert.strictEqual(NI.computeEmpNightIssues(e1, Date.UTC(2026, 10, 15, 4, 0, 0)).length, 1);    // 10:00 BD next day
// merge: one row per date, Night Issue wins, OT hint preserved; stored list never mutated
const ot = [{ date: '01-NOV-2026', reason: '5h Evening OT Missing' }, { date: '02-NOV-2026', reason: 'Morning OT Missing' }];
const ni = [{ date: '01-NOV-2026', isNightIssue: true, reason: 'x' }];
const m = NI.mergeRequisitionAndNight(ot, ni);
assert.strictEqual(m.length, 2); assert.ok(m.some(p => p.isNightIssue && /5h Evening/.test(p.reason)));
assert.strictEqual(ot.length, 2);
// idempotent re-merge
assert.strictEqual(NI.mergeRequisitionAndNight(m, NI.computeEmpNightIssues({ nightSuspects: [] }, NOW)).length, 1);
console.log('unit rules OK');

// --- back-test on real data: nothing paid changes, flags only
const dir = path.join(__dirname, '..', 'data');
['2026-09', '2026-10', '2026-11'].forEach(ym => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, ym + '.json'), 'utf8'));
  const emps = d.employees || d;
  let kinds = {}, issues = 0, empsHit = 0, nightYesTouched = 0, dup = 0;
  emps.forEach(e => {
    const before = JSON.stringify([e.nightCount, e.totalEarned, e.nightAmount]);
    const r = NI.computeEmpNightIssues(e, NOW);
    const dates = r.map(x => x.date); if (new Set(dates).size !== dates.length) dup++;
    r.forEach(x => { kinds[x.kind] = (kinds[x.kind] || 0) + 1; if (x.isNight) nightYesTouched++; });
    if (r.length) empsHit++; issues += r.length;
    assert.strictEqual(JSON.stringify([e.nightCount, e.totalEarned, e.nightAmount]), before);
    // every flagged day must really be Night != YES in daily[]
    const byDate = {}; (e.daily || []).forEach(x => byDate[String(x[0]).toUpperCase()] = x);
    r.forEach(x => { const row = byDate[x.date]; if (row) assert.strictEqual(Number(row[10]), 0, e.id + ' ' + x.date + ' is YES but flagged'); });
  });
  console.log(ym, 'employees', emps.length, '| with night issue', empsHit, '| issue days', issues, '|', JSON.stringify(kinds), '| dup', dup);
  assert.strictEqual(dup, 0); assert.strictEqual(nightYesTouched, 0);
});
console.log('back-test OK');
