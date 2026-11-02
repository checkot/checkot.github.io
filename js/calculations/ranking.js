function ensureEmpAvgStats(list, targetMonth) {
const isMulti = (typeof currentLbTimeMode !== 'undefined' && currentLbTimeMode !== 'monthly') || Boolean(list && list[0] && (list[0].isMultiMonth || (list[0].monthsCount && list[0].monthsCount > 1)));
const mStr = targetMonth || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
const prevNightSet = !isMulti ? getPrevMonthNightSet(mStr) : new Set();
(list || []).forEach(e => {
  if (!e) return;
  if (!isMulti) {
    const uid = String(e.id || '').toUpperCase();
    const prevHas = prevNightSet.has(uid) || prevNightSet.has(resolveEmpAliasId(uid));
    e._prevMonthLastNight = prevHas;
    if (!e._metricsComputed || e._computedMonth !== mStr || e._computedPrevNight !== prevHas) {
      const rps = computeEmpRequisitionProblems(e);
      const abs = computeEmpGeneralAbsents(e, mStr, prevHas);
      e.requisitionProblems = rps;
      e.requisitionProblemCount = rps.length;
      e.generalAbsentDays = abs.dates;
      e.generalAbsentShortDates = abs.shortDates;
      e.generalAbsentCount = abs.count;
      e._metricsComputed = true;
      e._computedMonth = mStr;
      e._computedPrevNight = prevHas;
    }
  } else {
    if (e.generalAbsentCount == null) {
      e.generalAbsentCount = Array.isArray(e.generalAbsentDays) ? e.generalAbsentDays.length : 0;
    }
    if (e.requisitionProblemCount == null) {
      e.requisitionProblemCount = Array.isArray(e.requisitionProblems) ? e.requisitionProblems.length : 0;
    }
  }
});
(list || []).forEach(e => {
if (!e || (e._avgComputed && e.adjustedDuty != null && e.adjustedAvgDuty != null && e.nightRestDays != null)) return;
const st = computeEmpAvgDutyAndInOut(e);
Object.assign(e, st, { _avgComputed: true });
});
return list;
}
window.ensureEmpAvgStats = ensureEmpAvgStats;

/* ==========================================================================
   RANKING.JS - Leaderboard Engine & Strict Area Mapping Enforcement
   ========================================================================== */

function isMappedAreaId(id) {
  if (!id) return false;
  const upperId = String(id).toUpperCase().trim();
  return Boolean(AREA_MAP && AREA_MAP[upperId]);
}

function buildLeaderboardPayloadFromList(month, allList) {
  // Business Rule: Ranking uses ONLY IDs listed in areas.json (no fallback)
  const rppfEmployees = (allList || []).filter(e => e && e.isRppf !== false && (e.valid !== false) && isMappedAreaId(e.id));
  const normalized = rppfEmployees.map(e => ({
    ...e,
    plainDaysCount: Number(e.plainDaysCount != null ? e.plainDaysCount : e.plainDays || 0),
    area: getAreaForId(e.id, true),
    punchProblemsCount: getPunchProblemCount(e)
  }));
  ensureEmpAvgStats(normalized, month);
  const sortedByDuty = [...normalized].sort((a,b) => ((b.adjustedDuty ?? b.totalDuty) - (a.adjustedDuty ?? a.totalDuty)) || (b.totalDuty - a.totalDuty));
  const sortedByOT = [...normalized].sort((a,b) => b.otHours - a.otHours);
  const sortedByEarned = [...normalized].sort((a,b) => b.totalEarned - a.totalEarned);
  const sortedByPlain = [...normalized].sort((a,b) => (b.plainDaysCount - a.plainDaysCount) || (b.totalDuty - a.totalDuty));
  const sortedByLessDuty = [...normalized].sort((a,b) => (a.totalDuty - b.totalDuty) || (a.otHours - b.otHours));
  const sortedByLessOT = [...normalized].sort((a,b) => (a.otHours - b.otHours) || (a.totalDuty - b.totalDuty));
  const sortedByAvgDuty = [...normalized].sort((a,b) => ((b.adjustedAvgDuty ?? b.avgDutyPerDay ?? 0) - (a.adjustedAvgDuty ?? a.avgDutyPerDay ?? 0)) || (b.totalDuty - a.totalDuty));
  const sortedByAvgInOut = [...normalized].sort((a,b) => ((a.avgInMins || 480) - (b.avgInMins || 480)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
  const sortedByPunch = [...normalized].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours));
  const sortedByRequisition = [...normalized].filter(e => (typeof getRequisitionProblemCount === 'function' ? getRequisitionProblemCount(e) : 0) > 0).sort((a,b) => (getRequisitionProblemCount(b) - getRequisitionProblemCount(a)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
  const sortedByAbsent = [...normalized].filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e, month) : 0) > 0).sort((a,b) => (getGeneralAbsentCount(b, month) - getGeneralAbsentCount(a, month)) || ((a.totalDuty || 0) - (b.totalDuty || 0)) || ((a.otHours || 0) - (b.otHours || 0)));
  return {
    month,
    allEmployees: normalized,
    sortedByDuty,
    sortedByOT,
    sortedByEarned,
    sortedByPlain,
    sortedByLessDuty,
    sortedByLessOT,
    sortedByAvgDuty,
    sortedByAvgInOut,
    sortedByPunch,
    sortedByRequisition,
    sortedByAbsent
  };
}
