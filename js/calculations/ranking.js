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

function attachLazyCriterionGetters(targetObj, getBaseList, monthStr, opts) {
  const filterEarned = Boolean(opts && opts.filterNoRateEarned);
  const cache = Object.create(null);
  targetObj._lazySortCache = cache;
  const defs = {
    sortedByDuty: () => {
      const base = getBaseList();
      ensureEmpAvgStats(base, monthStr);
      return [...base].sort((a,b) => ((b.adjustedDuty ?? b.totalDuty) - (a.adjustedDuty ?? a.totalDuty)) || (b.totalDuty - a.totalDuty));
    },
    sortedByOT: () => [...getBaseList()].sort((a,b) => b.otHours - a.otHours),
    sortedByEarned: () => {
      const base = getBaseList();
      const src = (filterEarned && typeof isNoRateCat === 'function') ? base.filter(e => !isNoRateCat(e.category)) : base;
      return [...src].sort((a,b) => b.totalEarned - a.totalEarned);
    },
    sortedByPlain: () => [...getBaseList()].sort((a,b) => ((b.plainDaysCount || 0) - (a.plainDaysCount || 0)) || (b.totalDuty - a.totalDuty)),
    sortedByLessDuty: () => [...getBaseList()].sort((a,b) => (a.totalDuty - b.totalDuty) || (a.otHours - b.otHours)),
    sortedByLessOT: () => [...getBaseList()].sort((a,b) => (a.otHours - b.otHours) || (a.totalDuty - b.totalDuty)),
    sortedByAvgDuty: () => {
      const base = getBaseList();
      ensureEmpAvgStats(base, monthStr);
      return [...base].sort((a,b) => ((b.adjustedAvgDuty ?? b.avgDutyPerDay ?? 0) - (a.adjustedAvgDuty ?? a.avgDutyPerDay ?? 0)) || (b.totalDuty - a.totalDuty));
    },
    sortedByAvgInOut: () => {
      const base = getBaseList();
      ensureEmpAvgStats(base, monthStr);
      return [...base].sort((a,b) => (((a.avgInMins && a.avgInMins > 0) ? a.avgInMins : 9999) - ((b.avgInMins && b.avgInMins > 0) ? b.avgInMins : 9999)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
    },
    sortedByPunch: () => [...getBaseList()].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours)),
    sortedByRequisition: () => {
      const base = getBaseList();
      ensureEmpAvgStats(base, monthStr);
      return [...base].filter(e => (typeof getOtRequisitionCount === 'function' ? getOtRequisitionCount(e) : 0) > 0).sort((a,b) => (getOtRequisitionCount(b) - getOtRequisitionCount(a)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
    },
    sortedByNightIssue: () => {
      const base = getBaseList();
      ensureEmpAvgStats(base, monthStr);
      return [...base].filter(e => (typeof getNightIssueCount === 'function' ? getNightIssueCount(e) : 0) > 0).sort((a,b) => (getNightIssueCount(b) - getNightIssueCount(a)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
    },
    sortedByHolidayReq: () => {
      const base = getBaseList();
      ensureEmpAvgStats(base, monthStr);
      return [...base].filter(e => (typeof getHolidayReqCount === 'function' ? getHolidayReqCount(e) : 0) > 0).sort((a,b) => (getHolidayReqCount(b) - getHolidayReqCount(a)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
    },
    sortedByAbsent: () => {
      const base = getBaseList();
      ensureEmpAvgStats(base, monthStr);
      return [...base].filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e, monthStr) : 0) > 0).sort((a,b) => (getGeneralAbsentCount(b, monthStr) - getGeneralAbsentCount(a, monthStr)) || ((a.totalDuty || 0) - (b.totalDuty || 0)) || ((a.otHours || 0) - (b.otHours || 0)));
    }
  };
  Object.keys(defs).forEach(prop => {
    Object.defineProperty(targetObj, prop, {
      enumerable: true,
      configurable: true,
      get() {
        if (!cache[prop]) cache[prop] = defs[prop]();
        return cache[prop];
      },
      set(val) {
        cache[prop] = val;
      }
    });
  });
  return targetObj;
}
if (typeof window !== 'undefined') window.attachLazyCriterionGetters = attachLazyCriterionGetters;

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
  const dept = (typeof getClientDepartment === 'function') ? getClientDepartment() : 'PR';
  const payload = { month, dept, allEmployees: normalized };
  return attachLazyCriterionGetters(payload, () => payload.allEmployees || [], month, { filterNoRateEarned: false });
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
/* Admin holiday overrides (localStorage PLANT_HOLIDAYS_KEY): cancelled date = normal working day. */
function _readCancelledHolidays() {
  try {
    const raw = localStorage.getItem(typeof PLANT_HOLIDAYS_KEY !== 'undefined' ? PLANT_HOLIDAYS_KEY : 'rppf_plant_holidays_v1');
    if (raw) return (JSON.parse(raw).cancelled || []).map(x => String(x).toUpperCase());
  } catch (err) {}
  return [];
}

/* Public funnel used by Ranking: OT-missing items + Holiday Requisition items + Night Issues.
   Every item is tagged: isNightIssue:true (Night), isHolidayReq:true (Holiday), neither (OT).
   One row per date, priority Night > Holiday > OT. */
function computeEmpRequisitionProblems(e) {
  if (!e) return [];
  if (e.isMultiMonth) return Array.isArray(e.requisitionProblems) ? e.requisitionProblems : [];
  let ot = _computeOtRequisitionProblems(e);
  if (typeof tagHolidayIssues === 'function') ot = tagHolidayIssues(ot, { cancelled: _readCancelledHolidays(), emp: e });
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


/* ==========================================================================
   CUSTOM DATE RANGE SLICING HELPERS (Shared by Ranking & My Profile)
   ========================================================================== */
const _DR_MON_MAP = { JAN:1, FEB:2, MAR:3, APR:4, MAY:5, JUN:6, JUL:7, AUG:8, SEP:9, OCT:10, NOV:11, DEC:12 };
const _DR_MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseEmpDailyDateToISO(rawDate, fallbackYm) {
  const s = String(rawDate || '').trim().toUpperCase();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})/);
  if (m && _DR_MON_MAP[m[2]]) {
    return `${m[3]}-${String(_DR_MON_MAP[m[2]]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})-([A-Z]{3})/);
  if (m && _DR_MON_MAP[m[2]] && fallbackYm) {
    const yy = String(fallbackYm).split('-')[0];
    if (/^\d{4}$/.test(yy)) return `${yy}-${String(_DR_MON_MAP[m[2]]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})-(\d{2})$/);
  if (m && fallbackYm) {
    const yy = String(fallbackYm).split('-')[0];
    if (/^\d{4}$/.test(yy)) return `${yy}-${m[2]}-${String(+m[1]).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})$/);
  if (m && fallbackYm && /^\d{4}-\d{2}$/.test(fallbackYm)) {
    return `${fallbackYm}-${String(+m[1]).padStart(2, '0')}`;
  }
  return '';
}

function getMonthsBetweenISO(startIso, endIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endIso || '')) return [];
  if (startIso > endIso) return [];
  const [sy, sm] = startIso.split('-').map(Number);
  const [ey, em] = endIso.split('-').map(Number);
  const out = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    if (!(typeof isFutureYm === 'function' && isFutureYm(ym))) out.push(ym);
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 60) break;
  }
  return out;
}

function formatShortDateRangeLabel(startIso, endIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endIso || '')) return 'Select Date';
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const sMon = _DR_MON_SHORT[sm - 1] || String(sm);
  const eMon = _DR_MON_SHORT[em - 1] || String(em);
  if (sy !== ey) {
    return `${sd} ${sMon} ${String(sy).slice(-2)} – ${ed} ${eMon} ${String(ey).slice(-2)}`;
  }
  return `${sd} ${sMon} – ${ed} ${eMon}`;
}

function sliceEmpMonthForDateRange(emp, mStr, startIso, endIso, prevHas) {
  if (!emp) return null;
  const daily = Array.isArray(emp.daily) ? emp.daily : [];
  const slicedDaily = daily.filter(r => {
    if (!r || !r[0]) return false;
    const iso = parseEmpDailyDateToISO(r[0], mStr);
    return iso && iso >= startIso && iso <= endIso;
  });

  let totalDuty = 0, otHours = 0, otDaysCount = 0, holidayCount = 0, nightCount = 0, regularDaysCount = 0, plainDaysCount = 0;
  const holidayDays = [], nightDays = [];

  slicedDaily.forEach(r => {
    const regDuty = Number(r[4]) || 0;
    const regOt = Number(r[5]) || 0;
    const doDuty = Number(r[6]) || 0;
    const doOt = Number(r[7]) || 0;
    const holDuty = Number(r[8]) || 0;
    const holOt = Number(r[9]) || 0;
    const isNight = Number(r[10]) === 1;
    const dayDuty = regDuty + regOt + doDuty + doOt + holDuty + holOt;
    const dayOt = regOt + doOt + holOt;

    totalDuty += dayDuty;
    otHours += dayOt;
    if (regDuty > 0) regularDaysCount++;
    if (doDuty > 0 || doOt > 0 || holDuty > 0 || holOt > 0) {
      holidayCount++;
      holidayDays.push(String(r[0]));
    }
    if (isNight) {
      nightCount++;
      nightDays.push(String(r[0]));
    }
    if (!isNight && dayOt > 0) otDaysCount++;
    if (regDuty > 0 && dayOt === 0 && doDuty === 0 && holDuty === 0 && !isNight) plainDaysCount++;
  });

  // Compute full-month absents first (preserves Day-1 & day-before night-rest exemption + holidays + leaves), then filter to [startIso, endIso]
  const fullAbs = (typeof computeEmpGeneralAbsents === 'function')
    ? computeEmpGeneralAbsents(emp, mStr, prevHas)
    : { dates: (emp.generalAbsentDays || []), shortDates: (emp.generalAbsentShortDates || []), count: (emp.generalAbsentCount || 0) };
  const absDates = [], absShortDates = [];
  const rawAbs = fullAbs.dates || [];
  const rawShort = fullAbs.shortDates || [];
  for (let i = 0; i < rawAbs.length; i++) {
    const iso = parseEmpDailyDateToISO(rawAbs[i], mStr) || parseEmpDailyDateToISO(rawShort[i], mStr);
    if (iso && iso >= startIso && iso <= endIso) {
      absDates.push(rawAbs[i]);
      if (rawShort[i]) absShortDates.push(rawShort[i]);
    }
  }

  // Filter punchProblems to [startIso, endIso]
  const rawPunch = Array.isArray(emp.punchProblems) ? emp.punchProblems : [];
  const slicedPunch = rawPunch.filter(p => {
    const dStr = typeof p === 'string' ? p : (p && (p.date || p.d || p[0]));
    const iso = parseEmpDailyDateToISO(dStr, mStr);
    return iso && iso >= startIso && iso <= endIso;
  });

  const slicedEmp = {
    ...emp,
    daily: slicedDaily,
    totalDuty: Number(totalDuty.toFixed(2)),
    otHours: Number(otHours.toFixed(2)),
    otDaysCount,
    holidayCount,
    nightCount,
    regularDaysCount,
    plainDaysCount,
    holidayDays,
    nightDays,
    punchProblems: slicedPunch,
    punchProblemsCount: slicedPunch.length,
    generalAbsentDays: absDates,
    generalAbsentShortDates: absShortDates,
    generalAbsentCount: absDates.length,
    requisitionProblems: null,
    earlyExits: null,
    _metricsComputed: false,
    _avgComputed: false,
    isMultiMonth: false
  };

  if (typeof applyTypeOverride === 'function') {
    applyTypeOverride(slicedEmp);
  }
  const reqArr = (typeof computeEmpRequisitionProblems === 'function') ? computeEmpRequisitionProblems(slicedEmp) : [];
  slicedEmp.requisitionProblems = reqArr;
  slicedEmp.requisitionProblemCount = reqArr.length;
  const eeArr = (typeof computeEmpEarlyExits === 'function') ? computeEmpEarlyExits(slicedEmp) : [];
  slicedEmp.earlyExits = eeArr;
  return slicedEmp;
}

if (typeof window !== "undefined") {
  window.parseEmpDailyDateToISO = parseEmpDailyDateToISO;
  window.getMonthsBetweenISO = getMonthsBetweenISO;
  window.formatShortDateRangeLabel = formatShortDateRangeLabel;
  window.sliceEmpMonthForDateRange = sliceEmpMonthForDateRange;
  window.computeEmpRequisitionProblems = computeEmpRequisitionProblems;
  window.computeEmpGeneralAbsents = computeEmpGeneralAbsents;
}
