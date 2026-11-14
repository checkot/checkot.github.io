#!/usr/bin/env node
// Phase 1 baseline: run BEFORE editing attendance.js. Saves 5 fields per employee/month to /tmp/baseline.json
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = require(path.join(ROOT, 'js/calculations/attendance.js'));
const NOW = Date.UTC(2026, 10, 14, 6);
const leaves = (JSON.parse(fs.readFileSync(path.join(ROOT, 'absent.json'), 'utf8')).longTermLeaves) || [];
const FIELDS = ['generalAbsentCount', 'offAfterNightCount', 'presentPct', 'punchIssueCount', 'reqIssueCount'];
const out = {};
for (const ym of ['2026-09', '2026-10', '2026-11']) {
  const emps = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', ym + '.json'), 'utf8')).employees || [];
  const dsMeta = A.computeDatasetMetaFromEmployees(emps);
  out[ym] = {};
  emps.forEach(e => {
    const s = A.computeEmpMonthAttendance(e, ym, { nowMs: NOW, dsMeta, longTermLeaves: leaves });
    const o = {}; FIELDS.forEach(f => o[f] = s[f]);
    out[ym][e.id] = o;
  });
  console.log(ym, Object.keys(out[ym]).length, 'employees');
}
fs.writeFileSync('/tmp/baseline.json', JSON.stringify(out));
