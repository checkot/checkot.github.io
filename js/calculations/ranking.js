function ensureEmpAvgStats(list, targetMonth) {
const isMulti = (typeof currentLbTimeMode !== 'undefined' && currentLbTimeMode !== 'monthly') || Boolean(list && list[0] && (list[0].isMultiMonth || (list[0].monthsCount && list[0].monthsCount > 1)));
const mStr = targetMonth || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
const prevNightSet = !isMulti ? (typeof getPrevMonthNightSet === 'function' ? getPrevMonthNightSet(mStr) : new Set()) : new Set();
(list || []).forEach(e => {
  if (!e) return;
  if (!isMulti) {
    const uid = String(e.id || '').toUpperCase();
    const prevHas = prevNightSet.has(uid) || prevNightSet.has(typeof resolveEmpAliasId === 'function' ? resolveEmpAliasId(uid) : uid);
    e._prevMonthLastNight = prevHas;
    if (!e._metricsComputed || e._computedMonth !== mStr || e._computedPrevNight !== prevHas) {
      const rps = typeof computeEmpRequisitionProblems === 'function' ? computeEmpRequisitionProblems(e) : [];
      const abs = typeof computeEmpGeneralAbsents === 'function' ? computeEmpGeneralAbsents(e, mStr, prevHas) : { dates: [], shortDates: [], count: 0 };
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

/* "Mapped" = present in the LIVE areas.json map AND in a real (non-pool) area of the current department.
   No fallback to e.area / cached month rows: those could re-admit unlisted people (data JSON can be stale). */
function isMappedAreaId(id, emp) {
  if (!id) return false;
  const upperId = String(id).toUpperCase().trim();
  const area = (typeof AREA_MAP !== "undefined" && AREA_MAP) ? AREA_MAP[upperId] : null;
  if (!area) return false;
  if (typeof isPoolArea === "function" && isPoolArea(area)) return false;
  if (typeof getRealAreasForDept === "function") {
    const dept = (typeof getClientDepartment === "function") ? getClientDepartment() : "PR";
    return getRealAreasForDept(dept).indexOf(area) >= 0;
  }
  return true;
}

function buildLeaderboardPayloadFromList(month, allList) {
  // Business Rule: Ranking uses ONLY IDs listed in areas.json (no fallback)
  const rppfEmployees = (allList || []).filter(e => isRankableEmployee(e));
  const normalized = rppfEmployees.map(e => ({
    ...e,
    plainDaysCount: Number(e.plainDaysCount != null ? e.plainDaysCount : e.plainDays || 0),
    otDaysCount: getEmpOtDays(e),
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
  const sortedByAvgInOut = [...normalized].sort((a,b) => (((a.avgInMins && a.avgInMins > 0) ? a.avgInMins : 9999) - ((b.avgInMins && b.avgInMins > 0) ? b.avgInMins : 9999)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
  const sortedByPunch = [...normalized].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours));
  const sortedByRequisition = [...normalized].filter(e => (typeof getOtRequisitionCount === 'function' ? getOtRequisitionCount(e) : 0) > 0).sort((a,b) => (getOtRequisitionCount(b) - getOtRequisitionCount(a)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
  const sortedByNightIssue = [...normalized].filter(e => (typeof getNightIssueCount === 'function' ? getNightIssueCount(e) : 0) > 0).sort((a,b) => (getNightIssueCount(b) - getNightIssueCount(a)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
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
    sortedByNightIssue,
    sortedByAbsent
  };
}

if (typeof getGeneralAbsentCount !== 'function') {
  window.getGeneralAbsentCount = function(emp, targetMonth) {
    if (!emp) return 0;
    const isMulti = Boolean(emp.isMultiMonth || (emp.monthsCount && emp.monthsCount > 1));
    if (isMulti) {
      return Number(emp.generalAbsentCount != null ? emp.generalAbsentCount : (Array.isArray(emp.generalAbsentDays) ? emp.generalAbsentDays.length : 0));
    }
    const mStr = targetMonth || emp._computedMonth || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
    const prevSet = typeof getPrevMonthNightSet === 'function' ? getPrevMonthNightSet(mStr) : new Set();
    const prevHas = prevSet.has(String(emp.id || '').toUpperCase()) || prevSet.has(typeof resolveEmpAliasId === 'function' ? resolveEmpAliasId(emp.id) : String(emp.id || '').toUpperCase());
    if (emp.generalAbsentCount != null && emp._computedMonth === mStr && emp._computedPrevNight === prevHas) {
      return Number(emp.generalAbsentCount) || 0;
    }
    const res = typeof computeEmpGeneralAbsents === 'function' ? computeEmpGeneralAbsents(emp, mStr, prevHas) : { count: 0 };
    emp._computedPrevNight = prevHas;
    return res.count || 0;
  };
}


/* ==========================================================================
   REQUISITION & ABSENT METRICS COMPUTATION
   ========================================================================== */
/* Public funnel used by Ranking: OT-missing items + Night Issues (DN without Night=YES).
   Night issues are tagged isNightIssue:true so every screen can label them separately. */
function computeEmpRequisitionProblems(e) {
  if (!e) return [];
  if (e.isMultiMonth) return Array.isArray(e.requisitionProblems) ? e.requisitionProblems : [];
  const ot = _computeOtRequisitionProblems(e);
  const nights = typeof computeEmpNightIssues === 'function' ? computeEmpNightIssues(e) : [];
  return typeof mergeRequisitionAndNight === 'function' ? mergeRequisitionAndNight(ot, nights) : ot;
}

function _computeOtRequisitionProblems(e) {
  if (!e) return [];
  if (Array.isArray(e.requisitionProblems) && e.requisitionProblems.some(p => p && !p.isNightIssue)) return e.requisitionProblems.filter(p => !p.isNightIssue);
  const daily = Array.isArray(e.daily) ? e.daily : [];
  const reqProbs = [];

  // Known / Detected Govt Holidays & Admin Tick/Untick Overrides
  let cancelledHols = [];
  let customHols = [];
  try {
    const raw = localStorage.getItem(typeof PLANT_HOLIDAYS_KEY !== 'undefined' ? PLANT_HOLIDAYS_KEY : 'rppf_plant_holidays_v1');
    if (raw) {
      const cfg = JSON.parse(raw);
      cancelledHols = (cfg.cancelled || []).map(x => String(x).toUpperCase());
      customHols = (cfg.custom || []).map(x => String(x).toUpperCase());
    }
  } catch (e) {}

  const baseGovtHols = ['20-OCT-2026', '21-OCT-2026', '21-FEB-2026', '26-MAR-2026', '14-APR-2026', '01-MAY-2026', '16-DEC-2026', '25-DEC-2026'];
  const activeGovtHols = [...new Set([...baseGovtHols, ...customHols])].filter(d => !cancelledHols.includes(d));

  daily.forEach(r => {
    if (!r || !Array.isArray(r)) return;
    const dateStr = String(r[0] || '').trim().toUpperCase();
    const dayStr = String(r[1] || '').trim();
    const inStr = String(r[2] || '').trim();
    const outStr = String(r[3] || '').trim();

    // If date is explicitly unticked/cancelled by admin, treat as normal working day!
    const isExplicitlyCancelled = cancelledHols.includes(dateStr);

    const regD = Number(r[4]) || 0;
    const regO = Number(r[5]) || 0;
    const doD = Number(r[6]) || 0;
    const doO = Number(r[7]) || 0;
    const holD = Number(r[8]) || 0;
    const holO = Number(r[9]) || 0;
    const isNight = Number(r[10]) === 1 || String(r[11] || '').toUpperCase().includes('NIGHT') || String(r[11] || '').toUpperCase() === 'DN';

    const totOt = regO + doO + holO;
    const totDuty = regD + doD + holD;

    // 1. Govt Holiday Requisition Missing (Active holidays only, unless cancelled)
    if (!isExplicitlyCancelled && activeGovtHols.includes(dateStr) && (regD > 0 || regO > 0) && (holD === 0 && holO === 0)) {
      reqProbs.push({
        date: dateStr, in: inStr, out: outStr, duty: totDuty, elapsed: totDuty, isNight,
        expectedOt: 'Govt Holiday Req Missing (Should be in Holiday Allowance)',
        reason: 'Govt Holiday Duty recorded as Regular Duty'
      });
      return;
    }

    // 2. Weekend Day Off (DO) Requisition Missing (Thu & Fri Only, unless cancelled as compensatory working day)
    if (!isExplicitlyCancelled && (dayStr === 'Thu' || dayStr === 'Fri') && (regD > 0 || regO > 0) && (doD === 0 && doO === 0)) {
      reqProbs.push({
        date: dateStr, in: inStr, out: outStr, duty: totDuty, elapsed: totDuty, isNight,
        expectedOt: `Weekend (${dayStr}) DO Req Missing`,
        reason: 'Weekend Duty recorded as Regular Duty'
      });
      return;
    }

    if (typeof isPunchMissing === 'function' && (isPunchMissing(inStr) || isPunchMissing(outStr))) return;

    const mIn = inStr.match(/^(\d{1,2}):(\d{2})/);
    const mOut = outStr.match(/^(\d{1,2}):(\d{2})/);
    if (!mIn || !mOut) return;
    const ti = (+mIn[1]) * 60 + (+mIn[2]);
    const to = (+mOut[1]) * 60 + (+mOut[2]);
    const diff = to < ti ? (1440 - ti) + to : to - ti;
    const elHrs = Number((diff / 60).toFixed(2));

    if (totOt === 0) {
      if (isNight && (elHrs >= 11.0 || totDuty >= 11.0)) {
        const exp = Math.min(7, Math.max(4, Math.round(Math.max(elHrs, totDuty) - 8.5)));
        reqProbs.push({
          date: dateStr, in: inStr, out: outStr, duty: totDuty || elHrs, elapsed: elHrs, isNight: true,
          expectedOt: `${exp}.0h (Night Shift OT Error / Missing)`,
          reason: 'Night Shift OT Missing'
        });
      } else if (!isNight && to >= 1150 && to <= 1215) {
        reqProbs.push({
          date: dateStr, in: inStr, out: outStr, duty: totDuty || elHrs, elapsed: elHrs, isNight: false,
          expectedOt: '3.0h (04:30 - 07:30 PM)',
          reason: '3h Evening OT Missing'
        });
      } else if (!isNight && to >= 1216 && to <= 1350) {
        reqProbs.push({
          date: dateStr, in: inStr, out: outStr, duty: totDuty || elHrs, elapsed: elHrs, isNight: false,
          expectedOt: '5.0h (04:30 - 09:30 PM)',
          reason: '5h Evening OT Missing'
        });
      } else if (!isNight && ti <= 435 && elHrs >= 9.5) {
        const exp = ti <= 390 ? '2.5h Morning OT' : '1.0h Morning OT';
        reqProbs.push({
          date: dateStr, in: inStr, out: outStr, duty: totDuty || elHrs, elapsed: elHrs, isNight: false,
          expectedOt: exp,
          reason: 'Morning OT Missing'
        });
      }
    }
  });
  return reqProbs;
}

function computeEmpGeneralAbsents(e, targetMonthStr, prevNightSetOrBool) {
  if (!e) return { dates: [], shortDates: [], count: 0 };
  const isMulti = Boolean(e.isMultiMonth || (e.monthsCount && e.monthsCount > 1));
  if (isMulti && Array.isArray(e.generalAbsentDays)) {
    return {
      dates: e.generalAbsentDays,
      shortDates: Array.isArray(e.generalAbsentShortDates) ? e.generalAbsentShortDates : e.generalAbsentDays,
      count: e.generalAbsentCount != null ? Number(e.generalAbsentCount) : e.generalAbsentDays.length
    };
  }
  const mStr = targetMonthStr 
    || e._computedMonth
    || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month)
    || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');

  // Dynamic live calculation using shared computeEmpMonthAttendance / _rptRows
  if (typeof computeEmpMonthAttendance === 'function') {
    const att = computeEmpMonthAttendance(e, mStr, { prevNight: prevNightSetOrBool });
    e.generalAbsentDays = att.generalAbsentDays;
    e.generalAbsentShortDates = att.generalAbsentShortDates;
    e.generalAbsentCount = att.generalAbsentCount;
    e.approvedLeaveDays = att.approvedLeaveDays;
    e.approvedLeaveCount = att.approvedLeaveCount;
    e._computedMonth = mStr;
    e._computedPrevNight = prevNightSetOrBool;
    return { dates: att.generalAbsentDays, shortDates: att.generalAbsentShortDates, count: att.generalAbsentCount };
  }
  if (typeof _rptRows === 'function') {
    const { rows, y, m } = _rptRows({ emp: e, month: mStr, prevNight: prevNightSetOrBool });
    const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const monName = (m >= 1 && m <= 12) ? mons[m - 1] : 'JAN';
    const mmPad = String(m >= 1 && m <= 12 ? m : 1).padStart(2, '0');
    const absentDates = [];
    const shortDates = [];
    (rows || []).forEach(r => {
      if (r && r.isGeneralAbsent) {
        const dStr = String(r.dayNum || (r.date ? r.date.split('/')[0] : '')).padStart(2, '0');
        absentDates.push(`${dStr}-${monName} (${r.day})`);
        shortDates.push(`${dStr}-${mmPad}`);
      }
    });
    e.generalAbsentDays = absentDates;
    e.generalAbsentShortDates = shortDates;
    e.generalAbsentCount = absentDates.length;
    e._computedMonth = mStr;
    e._computedPrevNight = prevNightSetOrBool;
    return { dates: absentDates, shortDates, count: absentDates.length };
  }

  // Self-contained in-memory fallback from e.daily and areas.json holiday rules if _rptRows is not available
  const daily = Array.isArray(e.daily) ? e.daily : [];
  let y = 0, m = 0;
  const mm = String(mStr || '').match(/(\d{4})-(\d{2})/);
  if (mm) { y = +mm[1]; m = +mm[2]; }
  else if (daily.length > 0 && daily[0] && daily[0][0]) {
    const s0 = String(daily[0][0]).trim();
    const qAlpha = s0.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/i);
    const _RMON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    if (qAlpha) {
      y = +qAlpha[3];
      m = _RMON.findIndex(x => x === qAlpha[2].toUpperCase()) + 1;
    }
  }
  if (!y || m < 1 || m > 12) {
    const n = new Date(); y = n.getFullYear(); m = n.getMonth() + 1;
  }
  const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const monName = mons[m - 1];
  const mmPad = String(m).padStart(2, '0');
  const lastDay = new Date(y, m, 0).getDate();
  const workedDays = new Set();
  const nightDays = new Set();
  let day1MorningOut = false;

  daily.forEach(r => {
    if (!r || !r[0]) return;
    const parts = String(r[0]).split('-');
    const dNum = parseInt(parts[0], 10);
    if (!dNum || dNum < 1 || dNum > 31) return;
    const inStr = String(r[2] || '').trim();
    const outStr = String(r[3] || '').trim();
    const dHrs = (Number(r[4])||0) + (Number(r[5])||0) + (Number(r[6])||0) + (Number(r[7])||0) + (Number(r[8])||0) + (Number(r[9])||0);
    const isNight = !!r[10] || String(r[11] || '').toUpperCase().includes('NIGHT') || String(r[11] || '').toUpperCase() === 'DN';
    if (dHrs > 0 || (inStr && inStr !== '-') || (outStr && outStr !== '-')) {
      workedDays.add(dNum);
    }
    if (isNight) nightDays.add(dNum);
    if (dNum === 1 && outStr && (!inStr || inStr === '-')) {
      const q = outStr.match(/^(\d{1,2}):(\d{2})/);
      if (q && (+q[1] * 60 + +q[2]) <= 435) day1MorningOut = true;
    }
  });

  const prevNight = (typeof prevNightSetOrBool === 'boolean')
    ? prevNightSetOrBool
    : (prevNightSetOrBool instanceof Set ? (prevNightSetOrBool.has(String(e.id || '').toUpperCase()) || prevNightSetOrBool.has(typeof resolveEmpAliasId === 'function' ? resolveEmpAliasId(e.id) : String(e.id || '').toUpperCase())) : false);

  const absentDates = [];
  const shortDates = [];
  const _RDAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  for (let d = 1; d <= lastDay; d++) {
    const dn = _RDAY[new Date(y, m - 1, d).getDay()];
    const dStr = String(d).padStart(2, '0');
    if (dn === 'Thu' || dn === 'Fri') continue;
    const holCheck = typeof isPlantOrGovtHolidayDate === 'function' ? isPlantOrGovtHolidayDate(y, m, d, dn) : { isOffOrHol: false };
    if (holCheck.isOffOrHol) continue;
    if (d === 1 && (prevNight || day1MorningOut)) continue;
    if (d > 1 && nightDays.has(d - 1)) continue;
    if (!workedDays.has(d)) {
      absentDates.push(`${dStr}-${monName} (${dn})`);
      shortDates.push(`${dStr}-${mmPad}`);
    }
  }

  e.generalAbsentDays = absentDates;
  e.generalAbsentShortDates = shortDates;
  e.generalAbsentCount = absentDates.length;
  e._computedMonth = mStr;
  e._computedPrevNight = prevNight;
  return { dates: absentDates, shortDates, count: absentDates.length };
}

if (typeof window !== "undefined") {
  window.computeEmpRequisitionProblems = computeEmpRequisitionProblems;
  window.computeEmpGeneralAbsents = computeEmpGeneralAbsents;
}
