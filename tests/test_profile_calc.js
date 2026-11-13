#!/usr/bin/env node
/**
 * Unit & Integration Tests for js/calculations/attendance.js and js/calculations/profile.js
 * Runs against real monthly data files (data/*.json, data/qa/*.json, absent.json).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const repoRoot = path.resolve(__dirname, '..');
const AttendanceCalc = require(path.join(repoRoot, 'js/calculations/attendance.js'));
const ProfileCalc = require(path.join(repoRoot, 'js/calculations/profile.js'));

const absentStore = JSON.parse(fs.readFileSync(path.join(repoRoot, 'absent.json'), 'utf8'));
const longTermLeaves = absentStore.longTermLeaves || [];

// Load all 2025-12 .. 2026-11 JSON files
const monthFiles = fs.readdirSync(path.join(repoRoot, 'data'))
  .filter(f => /^\d{4}-\d{2}\.json$/.test(f))
  .sort();

console.log(`[TEST] Loaded ${monthFiles.length} monthly data files: ${monthFiles.join(', ')}`);

const monthDataMap = {};
const datasetMetaByMonth = {};
for (const f of monthFiles) {
  const ym = f.replace('.json', '');
  const payload = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', f), 'utf8'));
  const emps = payload.employees || [];
  monthDataMap[ym] = emps;
  datasetMetaByMonth[ym] = AttendanceCalc.computeDatasetMetaFromEmployees(emps);
}

// Fixed reference timestamp: 2026-11-14T04:32:49+06:00
const TEST_NOW_MS = Date.parse('2026-11-14T04:32:49+06:00');

// 1. Test 556490 (Siratun Nabi, Casual, Packing Hall)
console.log('\n--- Test 1: Employee 556490 (Siratun Nabi) ---');
const emp556490ByMonth = {};
for (const ym of Object.keys(monthDataMap)) {
  emp556490ByMonth[ym] = monthDataMap[ym].find(e => e.id === '556490') || null;
}
const prof556490 = ProfileCalc.aggregateProfileData(emp556490ByMonth, {
  targetYear: 2026,
  latestMonth: '2026-11',
  selectedScope: 'this_month',
  datasetMetaByMonth,
  longTermLeaves,
  nowMs: TEST_NOW_MS
});

assert.strictEqual(prof556490.identityEmp.name, 'Siratun Nabi');
assert.strictEqual(prof556490.thisMonthSummary.otHours, 6.0);
assert.strictEqual(prof556490.thisMonthSummary.holidayCount, 1);
assert.strictEqual(prof556490.thisMonthSummary.totalEarned, 532.0);
assert.strictEqual(prof556490.thisMonthSummary.issues.counts.requisition, 5, '556490 Nov should have 5 requisition issues');
assert.strictEqual(prof556490.thisMonthSummary.issues.counts.punch, 2, '556490 Nov should have 2 punch issues');
console.log('[PASS] 556490 Nov summary:', {
  otHours: prof556490.thisMonthSummary.otHours,
  totalEarned: prof556490.thisMonthSummary.totalEarned,
  reqIssues: prof556490.thisMonthSummary.issues.counts.requisition,
  punchIssues: prof556490.thisMonthSummary.issues.counts.punch,
  presentPct: prof556490.thisMonthSummary.presentPct,
  absentCount: prof556490.thisMonthSummary.generalAbsentCount
});

// 2. Test Night Shift Punch Separation (Oct 2026 for 556490 & 556491)
console.log('\n--- Test 2: Night Shift Out Separation (Section H) ---');
const oct556490 = prof556490.summariesByYm['2026-10'];
assert(oct556490.exists, '556490 exists in 2026-10');
assert.strictEqual(oct556490.nightCount, 2, '556490 has 2 nights in Oct 2026');
assert.strictEqual(oct556490.punchStats.nightShiftCount, 2, '2 night shift punch rows separated');
assert(oct556490.punchStats.avgDayOutMins > 960, 'Day shift average Out should be afternoon/evening (>16:00), never pulled down by morning night-out');
assert(oct556490.punchStats.avgNightOutMins >= 300 && oct556490.punchStats.avgNightOutMins <= 500, 'Night shift average Out should be morning (05:00-08:20 AM)');
console.log('[PASS] 556490 Oct 2026 Punch Stats:', {
  avgIn12h: oct556490.punchStats.avgIn12h,
  avgDayOut12h: oct556490.punchStats.avgDayOut12h,
  avgNightOut12h: oct556490.punchStats.avgNightOut12h,
  avgDutyPerDay: oct556490.punchStats.avgDutyPerDay
});

// 3. Test Maternity Leave / Approved Long Leave (CF3028 - Sumaiya Akter Sukhy, ML 2026-06-01 to 2026-12-01)
console.log('\n--- Test 3: Approved Long Leave (CF3028 Maternity Leave) ---');
const empCF3028ByMonth = {};
for (const ym of Object.keys(monthDataMap)) {
  empCF3028ByMonth[ym] = monthDataMap[ym].find(e => e.id === 'CF3028') || null;
}
const profCF3028 = ProfileCalc.aggregateProfileData(empCF3028ByMonth, {
  targetYear: 2026,
  latestMonth: '2026-11',
  selectedScope: 'year',
  datasetMetaByMonth,
  longTermLeaves,
  nowMs: TEST_NOW_MS
});
assert(profCF3028.yearSummary.totalLeaveDays > 50, 'CF3028 should have >50 approved maternity leave days in 2026');
console.log('[PASS] CF3028 Approved Leave:', {
  totalLeaveDays: profCF3028.yearSummary.totalLeaveDays,
  leaveCategory: profCF3028.yearSummary.leaveCategory,
  totalAbsentDays: profCF3028.yearSummary.totalAbsentDays,
  avgPresentPct: profCF3028.yearSummary.avgPresentPct
});

// 4. Test Present % Identity: scheduledWorkingDays === presentOnScheduledDays + generalAbsentCount + approvedLeaveCount
console.log('\n--- Test 4: Mathematical Identity across all 2026 months ---');
for (const s of prof556490.yearMonthSummaries) {
  if (!s.exists) continue;
  assert.strictEqual(
    s.scheduledWorkingDays,
    s.presentOnScheduledDays + s.generalAbsentCount + s.approvedLeaveCount,
    `Scheduled days identity failed for ${s.ym}`
  );
  if (s.scheduledWorkingDays > 0) {
    const expectedPct = Math.round((s.presentOnScheduledDays / s.scheduledWorkingDays) * 1000) / 10;
    assert.strictEqual(s.presentPct, expectedPct, `Present % mismatch for ${s.ym}`);
  }
}
console.log('[PASS] Scheduled working days identity holds across all 11 months of 2026.');

// 5. Test Employee joined mid-year (missing in earlier months shows exists:false and presentPct:null, never 0%)
console.log('\n--- Test 5: Partial-year employee shows null presentPct (not 0%) for missing months ---');
const janIds = new Set(monthDataMap['2026-01'].map(e => e.id));
const novOnlyEmp = monthDataMap['2026-11'].find(e => !janIds.has(e.id));
if (novOnlyEmp) {
  const mapPartial = {};
  for (const ym of Object.keys(monthDataMap)) {
    mapPartial[ym] = monthDataMap[ym].find(e => e.id === novOnlyEmp.id) || null;
  }
  const profPartial = ProfileCalc.aggregateProfileData(mapPartial, {
    targetYear: 2026,
    latestMonth: '2026-11',
    selectedScope: 'year',
    datasetMetaByMonth,
    longTermLeaves,
    nowMs: TEST_NOW_MS
  });
  const janSummary = profPartial.summariesByYm['2026-01'];
  assert.strictEqual(janSummary.exists, false);
  assert.strictEqual(janSummary.presentPct, null, 'Missing month must have presentPct === null, never 0');
  console.log(`[PASS] Partial-year employee ${novOnlyEmp.id} (${novOnlyEmp.name}) active in ${profPartial.yearSummary.activeMonthsCount} months; Jan presentPct is null.`);
}

console.log('\n✅ ALL PROFILE & ATTENDANCE CALCULATION TESTS PASSED!');
