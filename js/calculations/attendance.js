/* ==========================================================================
   ATTENDANCE.JS - Shared Pure Attendance, Absence & Approved Leave Engine
   Used identically by Report (js/pages/report.js), Ranking (js/calculations/ranking.js),
   and Employee Profile (js/calculations/profile.js).
   ========================================================================== */

(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AttendanceCalc = api;
    root.rptIsDayClosed = api.rptIsDayClosed;
    root.computeEmpMonthAttendance = api.computeEmpMonthAttendance;
    root.computeDatasetMetaFromEmployees = api.computeDatasetMetaFromEmployees;
    root.didEmployeeWorkLastNightOfMonth = api.didEmployeeWorkLastNightOfMonth;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  const _RMON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const _RMON_UPPER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const _RDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const BASE_GOVT_HOLS = {
    // February 2026
    '04-FEB-2026': 'Shab-e-Barat',
    '10-FEB-2026': 'National Parliamentary Election',
    '11-FEB-2026': 'National Parliamentary Election',
    '12-FEB-2026': 'National Parliamentary Election',
    '21-FEB': 'International Mother Language Day',
    '21-FEB-2026': 'International Mother Language Day',
    // March 2026
    '17-MAR-2026': 'Shab-e-Qadr',
    '18-MAR-2026': 'General Holiday',
    '19-MAR-2026': 'Eid-ul-Fitr',
    '20-MAR-2026': "Jumu'atul Wida & Eid-ul-Fitr",
    '21-MAR-2026': 'Eid-ul-Fitr',
    '22-MAR-2026': 'Eid-ul-Fitr',
    '23-MAR-2026': 'Eid-ul-Fitr',
    '26-MAR': 'Independence Day Holiday',
    '26-MAR-2026': 'Independence Day Holiday',
    // April 2026
    '14-APR': 'Bengali New Year Day (Pahela Baishakh)',
    '14-APR-2026': 'Bengali New Year Day (Pahela Baishakh)',
    // May 2026
    '01-MAY': 'May Day Holiday',
    '01-MAY-2026': 'May Day Holiday',
    '26-MAY-2026': 'Eid-ul-Azha',
    '27-MAY-2026': 'Eid-ul-Azha',
    '28-MAY-2026': 'Eid-ul-Azha',
    '29-MAY-2026': 'Eid-ul-Azha',
    '30-MAY-2026': 'Eid-ul-Azha',
    '31-MAY-2026': 'Eid-ul-Azha',
    // June 2026
    '26-JUN-2026': 'Ashura (Muharram)',
    // August 2026
    '05-AUG-2026': 'July Mass Uprising Day',
    // September 2026
    '04-SEP-2026': 'Janmashtami',
    // October 2026
    '20-OCT-2026': 'Durga Puja Holiday',
    '21-OCT-2026': 'Durga Puja Holiday',
    // December 2026
    '16-DEC': 'Victory Day Holiday',
    '16-DEC-2026': 'Victory Day Holiday',
    '25-DEC': 'Christmas Holiday',
    '25-DEC-2026': 'Christmas Holiday'
  };

  function _parseDayNo(d) {
    if (typeof root._parseEmpDayNo === 'function') return root._parseEmpDayNo(d);
    if (typeof d === 'number') return Math.floor(d);
    const s = String(d == null ? '' : d).trim();
    const iso = s.match(/^\d{4}-\d{1,2}-(\d{1,2})$/);
    if (iso) return parseInt(iso[1], 10);
    return parseInt(s, 10);
  }

  function _isPunchMissing(val) {
    if (typeof root.isPunchMissing === 'function') return root.isPunchMissing(val);
    const cleaned = String(val == null ? '' : val).replace(/['"“”]/g, '').trim().toUpperCase();
    if (!cleaned) return true;
    if (cleaned === '-' || cleaned === '--' || cleaned === 'N/A' || cleaned === 'NA' || cleaned === 'NULL' || cleaned === 'NONE' || cleaned === 'MISSING') return true;
    if (/^0{1,2}:00(:00)?$/.test(cleaned)) return true;
    if (!/^\d{1,2}:\d{2}(:\d{2})?([AP]M)?$/i.test(cleaned)) return true;
    return false;
  }

  function _rMin(t) {
    const q = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    return q ? (+q[1]) * 60 + (+q[2]) : null;
  }

  // A work day is "closed" (absence can be confirmed) at 09:00 Bangladesh time the NEXT day.
  function rptIsDayClosed(y, m, d, nowMs) {
    const closeUtcMs = Date.UTC(y, m - 1, d + 1, 9, 0, 0) - 6 * 3600 * 1000;
    const now = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
    return now >= closeUtcMs;
  }

  function _fallbackBuildEmpDayMap(e) {
    if (typeof root._buildEmpDayMap === 'function') return root._buildEmpDayMap(e);
    const byDay = {};
    if (!e) return { byDay, hasDaily: false, activeDays: 0 };
    const daily = Array.isArray(e.daily) ? e.daily : [];
    let activeDays = 0;
    const activeNums = [];
    daily.forEach(r => {
      if (!r) return;
      const k = _parseDayNo(r[0]);
      const dHrs = (Number(r[4]) || 0) + (Number(r[5]) || 0) + (Number(r[6]) || 0) + (Number(r[7]) || 0) + (Number(r[8]) || 0) + (Number(r[9]) || 0);
      const inStr = String(r[2] || '').trim();
      const outStr = String(r[3] || '').trim();
      const isNight = !!r[10] || String(r[11] || '').toUpperCase().includes('NIGHT') || String(r[11] || '').toUpperCase() === 'DN';
      if (dHrs > 0 || inStr || outStr || isNight) {
        activeDays++;
        if (k >= 1) {
          activeNums.push(k);
          byDay[k] = { inn: r[2], out: r[3], v: [r[4], r[5], r[6], r[7], r[8], r[9]], night: isNight, shift: r[11] || '', rec: true };
        }
      }
    });
    if (daily.length > 0) {
      e.activeDayNums = activeNums;
    }
    if (!daily.length) {
      if (Array.isArray(e.activeDayNums)) {
        e.activeDayNums.forEach(k => {
          if (k >= 1) {
            byDay[k] = byDay[k] || { rec: true, inn: '08:00', out: '16:30', v: [8, 0, 0, 0, 0, 0], night: false };
            activeDays++;
          }
        });
      }
      (e.holidayDays || []).forEach(h => {
        if (!h) return;
        const k = _parseDayNo(typeof h === 'string' ? h : h.date);
        if (!k || k < 1) return;
        byDay[k] = Object.assign(byDay[k] || { rec: true }, { v: [0, 0, h.doDuty, h.doExtra, h.holDuty, h.holExtra], inn: byDay[k]?.inn || '', out: byDay[k]?.out || '' });
      });
      (e.nightDays || []).forEach(n => {
        if (!n) return;
        const k = _parseDayNo(typeof n === 'string' ? n : n.date);
        if (!k || k < 1) return;
        (byDay[k] = byDay[k] || { rec: true, inn: '', out: '', v: [8, 0, 0, 0, 0, 0] }).night = true;
      });
      (e.punchProblems || []).forEach(p => {
        if (!p) return;
        const k = _parseDayNo(typeof p === 'string' ? p : p.date);
        if (!k || k < 1) return;
        (byDay[k] = byDay[k] || { rec: true, inn: '', out: '', v: [0, 0, 0, 0, 0, 0] }).forceMiss = true;
      });
    }
    return { byDay, hasDaily: daily.length > 0 || Array.isArray(e.activeDayNums), activeDays };
  }

  function _fallbackIsPlantOrGovtHolidayDate(y, m, d, dn, consensusSet, ctx) {
    if (typeof root.isPlantOrGovtHolidayDate === 'function' && (!ctx || !ctx.ignoreGlobalHolidayFn)) {
      return root.isPlantOrGovtHolidayDate(y, m, d, dn, consensusSet);
    }
    const monName = (m >= 1 && m <= 12) ? _RMON_UPPER[m - 1] : 'JAN';
    const dStr = String(d).padStart(2, '0');
    const fullDate = `${dStr}-${monName}-${y}`.toUpperCase();
    const shortDate = `${dStr}-${monName}`.toUpperCase();

    const cfg = (ctx && ctx.holidaysConfig) || null;
    const cancelledHols = cfg && Array.isArray(cfg.cancelled) ? cfg.cancelled.map(x => String(x).toUpperCase().trim()) : [];
    const customHols = cfg ? [].concat(cfg.custom || [], cfg.declared || []).map(x => String(x).toUpperCase().trim()) : [];
    const dayTypeOv = (ctx && ctx.dayTypeOv) || {};

    if (dayTypeOv[fullDate] === 'R' || cancelledHols.includes(fullDate) || cancelledHols.includes(shortDate)) {
      return { isOffOrHol: false, isWeekend: false, isHoliday: false, label: '' };
    }
    if (dayTypeOv[fullDate] === 'H') {
      return { isOffOrHol: true, isWeekend: false, isHoliday: true, label: 'Plant / Govt Holiday' };
    }
    if (dayTypeOv[fullDate] === 'O') {
      return { isOffOrHol: true, isWeekend: true, isHoliday: false, label: 'Declared Off Day' };
    }

    const isWk = (dn === 'Thu' || dn === 'Fri');
    if (isWk) {
      return { isOffOrHol: true, isWeekend: true, isHoliday: false, label: 'Weekend (Thu/Fri)' };
    }
    if (BASE_GOVT_HOLS[fullDate] || BASE_GOVT_HOLS[shortDate]) {
      return { isOffOrHol: true, isWeekend: false, isHoliday: true, label: BASE_GOVT_HOLS[fullDate] || BASE_GOVT_HOLS[shortDate] };
    }
    if (customHols.includes(fullDate) || customHols.includes(shortDate)) {
      return { isOffOrHol: true, isWeekend: false, isHoliday: true, label: 'Declared Plant Holiday' };
    }
    if (consensusSet && (consensusSet instanceof Set ? consensusSet.has(d) : (Array.isArray(consensusSet) && consensusSet.includes(d)))) {
      return { isOffOrHol: true, isWeekend: false, isHoliday: true, label: 'Plant Holiday / General Off' };
    }
    return { isOffOrHol: false, isWeekend: false, isHoliday: false, label: '' };
  }

  function _fallbackIsEmployeeOnApprovedLeave(empId, targetDateStr, ctx) {
    if (ctx && Array.isArray(ctx.longTermLeaves)) {
      const uId = String(empId || '').trim().toUpperCase();
      if (!uId) return null;
      for (const item of ctx.longTermLeaves) {
        if (String(item.id || '').trim().toUpperCase() === uId) {
          if ((!item.startDate || item.startDate <= targetDateStr) && (!item.endDate || item.endDate >= targetDateStr)) {
            return item;
          }
        }
      }
      return null;
    }
    if (typeof root.isEmployeeOnApprovedLeave === 'function') {
      return root.isEmployeeOnApprovedLeave(empId, targetDateStr);
    }
    return null;
  }

  function computeDatasetMetaFromEmployees(list) {
    if (!Array.isArray(list) || list.length === 0) {
      return { maxActiveDay: 31, consensusHolidays: new Set() };
    }
    let maxActiveDay = 0;
    const dayStats = {};
    list.forEach(e => {
      if (!e || e.isRppf === false) return;
      const daily = Array.isArray(e.daily) ? e.daily : [];
      if (daily.length > 0) {
        daily.forEach(r => {
          if (!r) return;
          const k = _parseDayNo(r[0]);
          if (!k || k < 1 || k > 31) return;
          const st = dayStats[k] || (dayStats[k] = { total: 0, reg: 0, hol: 0, active: 0 });
          st.total++;
          const regD = Number(r[4]) || 0;
          const doD = (Number(r[6]) || 0) + (Number(r[7]) || 0);
          const holD = (Number(r[8]) || 0) + (Number(r[9]) || 0);
          const dHrs = regD + (Number(r[5]) || 0) + doD + holD;
          const inStr = String(r[2] || '').trim();
          const outStr = String(r[3] || '').trim();
          const isNight = !!r[10];
          if (regD > 0) st.reg++;
          if (holD > 0 || doD > 0) st.hol++;
          if (dHrs > 0 || inStr || outStr || isNight) {
            st.active++;
            if (k > maxActiveDay) maxActiveDay = k;
          }
        });
      } else if (Array.isArray(e.activeDayNums)) {
        e.activeDayNums.forEach(k => {
          if (k > maxActiveDay) maxActiveDay = k;
        });
      }
    });
    const consensusHolidays = new Set();
    Object.keys(dayStats).forEach(kStr => {
      const k = Number(kStr);
      const st = dayStats[k];
      if (st.total >= 15) {
        if (st.hol / st.total >= 0.25 || (st.reg / st.total < 0.25 && st.hol > 0)) {
          consensusHolidays.add(k);
        }
      }
    });
    return {
      _len: list.length,
      maxActiveDay: maxActiveDay > 0 ? maxActiveDay : 31,
      consensusHolidays
    };
  }

  function didEmployeeWorkLastNightOfMonth(emp, monthStr) {
    if (typeof root.didEmpWorkNightOnLastDay === 'function') {
      return root.didEmpWorkNightOnLastDay(emp, monthStr);
    }
    if (!emp) return false;
    if (typeof emp.lastDayNight === 'boolean') return emp.lastDayNight;
    let lastCalDay = 0;
    const mm = String(monthStr || emp._computedMonth || '').match(/^(\d{4})-(\d{2})$/);
    if (mm) {
      lastCalDay = new Date(parseInt(mm[1], 10), parseInt(mm[2], 10), 0).getDate();
    }
    const daily = Array.isArray(emp.daily) ? emp.daily : [];
    if (daily.length > 0 && lastCalDay > 0) {
      for (let i = 0; i < daily.length; i++) {
        const r = daily[i];
        if (r && _parseDayNo(r[0]) === lastCalDay && (!!r[10] || String(r[11] || '').toUpperCase().includes('NIGHT') || String(r[11] || '').toUpperCase() === 'DN')) {
          return true;
        }
      }
    }
    const nDays = Array.isArray(emp.nightDays) ? emp.nightDays : [];
    if (nDays.length > 0 && lastCalDay > 0) {
      for (let i = 0; i < nDays.length; i++) {
        const nd = nDays[i];
        const k = _parseDayNo(typeof nd === 'string' ? nd : nd?.date);
        if (k === lastCalDay) return true;
      }
    }
    return false;
  }

  function _resolveYearMonth(e, ymStr) {
    let y = 0, m = 0;
    const mm = String(ymStr || (e && e._computedMonth) || '').match(/(\d{4})-(\d{2})/);
    const daily = (e && Array.isArray(e.daily)) ? e.daily : [];
    if (mm) {
      y = +mm[1];
      m = +mm[2];
    } else if (daily.length > 0 && daily[0] && daily[0][0]) {
      const s0 = String(daily[0][0]).trim();
      const qAlpha = s0.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/i);
      if (qAlpha) {
        y = +qAlpha[3];
        m = _RMON.findIndex(x => x.toUpperCase() === qAlpha[2].toUpperCase()) + 1;
      } else {
        const qIso = s0.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (qIso) {
          y = +qIso[1];
          m = +qIso[2];
        } else {
          const qSlash = s0.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
          if (qSlash) {
            m = +qSlash[2];
            y = qSlash[3] ? +qSlash[3] : 2026;
          }
        }
      }
    }
    if (!y || m < 1 || m > 12) {
      const curM = (typeof root.currentLeaderboardResult !== 'undefined' && root.currentLeaderboardResult && root.currentLeaderboardResult.month)
        || (typeof root.getCurrentMonth === 'function' ? root.getCurrentMonth() : '');
      const curMatch = String(curM).match(/(\d{4})-(\d{2})/);
      if (curMatch) {
        y = +curMatch[1];
        m = +curMatch[2];
      } else {
        const n = new Date();
        y = n.getFullYear();
        m = n.getMonth() + 1;
      }
    }
    return { y, m };
  }

  /**
   * Shared single source of truth for employee monthly attendance, daily rows,
   * general absents, approved long-term leaves, and Present %.
   */
  function computeEmpMonthAttendance(emp, ymStr, ctx) {
    const options = ctx || {};
    const e = emp || options.emp || {};
    const daily = Array.isArray(e.daily) ? e.daily : [];
    const nowMs = (typeof options.nowMs === 'number' && isFinite(options.nowMs)) ? options.nowMs : Date.now();

    const earlyExitMap = new Map();
    try {
      const eeFn = options.computeEmpEarlyExits || (typeof root.computeEmpEarlyExits === 'function' ? root.computeEmpEarlyExits : null);
      if (eeFn) {
        eeFn(e).forEach(ex => {
          const dm = String(ex && ex.date || '').trim().match(/^(\d{1,2})-/);
          if (dm) earlyExitMap.set(parseInt(dm[1], 10), ex);
        });
      }
    } catch (_e) {}

    const { y, m } = _resolveYearMonth(e, ymStr || options.month);
    const mNumStr = String(m).padStart(2, '0');
    const resolvedYm = `${y}-${mNumStr}`;
    const monShortUpper = _RMON_UPPER[m - 1] || 'JAN';

    const { byDay, hasDaily } = _fallbackBuildEmpDayMap(e);

    // Dataset meta (maxActiveDay & consensusHolidays) can come from options.dsMeta, e._datasetMeta, or global getMonthDatasetMeta
    let dsMeta = options.dsMeta || e._datasetMeta || null;
    if (!dsMeta && typeof root.getMonthDatasetMeta === 'function') {
      dsMeta = root.getMonthDatasetMeta(resolvedYm);
    }
    if (!dsMeta) {
      dsMeta = { maxActiveDay: 31, consensusHolidays: new Set() };
    }
    const maxDatasetDay = dsMeta.maxActiveDay || 31;
    const consensusHols = dsMeta.consensusHolidays instanceof Set
      ? dsMeta.consensusHolidays
      : new Set(Array.isArray(dsMeta.consensusHolidays) ? dsMeta.consensusHolidays : []);

    // Resolve whether the employee worked a night shift on the last day of the previous month
    let prevMonthNight = false;
    if (typeof options.prevNight === 'boolean') {
      prevMonthNight = options.prevNight;
    } else if (options.prevNight instanceof Set) {
      const uid = String(e.id || '').toUpperCase();
      const aid = typeof root.resolveEmpAliasId === 'function' ? root.resolveEmpAliasId(uid) : uid;
      prevMonthNight = options.prevNight.has(uid) || options.prevNight.has(aid);
    } else if (typeof e._prevMonthLastNight === 'boolean') {
      prevMonthNight = e._prevMonthLastNight;
    } else if (typeof root.hasPrevMonthLastNight === 'function') {
      prevMonthNight = root.hasPrevMonthLastNight(e.id, resolvedYm, e);
    }

    const rows = [];
    const last = new Date(y, m, 0).getDate();

    let scheduledWorkingDays = 0;
    let presentOnScheduledDays = 0;
    let totalPresentDays = 0;
    let offAfterNightCount = 0;
    let weekendOrHolidayOffCount = 0;
    let holidayWorkedCount = 0;
    let nightsCount = 0;
    let punchIssues = 0;
    let reqIssues = 0;
    let nightSuspectsCount = 0;
    let earlyExitsCount = 0;
    let hasPendingOrUpcomingDay = !rptIsDayClosed(y, m, last, nowMs);

    const absentDates = [];
    const absentShortDates = [];
    const leaveDates = [];
    let leaveCategory = '';

    for (let d = 1; d <= last; d++) {
      const dn = _RDAY[new Date(y, m - 1, d).getDay()];
      const o = byDay[d];
      const dStr = String(d).padStart(2, '0');
      const isoDateStr = `${y}-${mNumStr}-${dStr}`;
      const holCheck = _fallbackIsPlantOrGovtHolidayDate(y, m, d, dn, consensusHols, options);
      const wk = holCheck.isWeekend;
      const afterPrevMonthNight = (d === 1 && prevMonthNight);
      const afterSameMonthNight = (d > 1 && byDay[d - 1] && byDay[d - 1].night);
      const afterNight = afterPrevMonthNight || afterSameMonthNight;
      const leaveRec = _fallbackIsEmployeeOnApprovedLeave(e.id, isoDateStr, options);
      const isDayClosed = rptIsDayClosed(y, m, d, nowMs);
      if (!isDayClosed && d <= maxDatasetDay) {
        hasPendingOrUpcomingDay = true;
      }

      const row = {
        date: dStr + '/' + mNumStr,
        dayNum: dStr,
        monthNum: mNumStr,
        isoDate: isoDateStr,
        day: dn,
        v: [0, 0, 0, 0, 0, 0],
        inn: '',
        out: '',
        night: false,
        tone: '',
        note: ''
      };

      if (!o) {
        if (afterNight) {
          row.tone = 'offn';
          row.note = (afterPrevMonthNight ? 'Day off after night (Prev Month)' : 'Day off after night') + (wk ? ' (Weekend)' : '');
          row.afterNight = true;
          if (afterPrevMonthNight) row.crossMonthAfterNight = true;
          offAfterNightCount++;
        } else if (leaveRec) {
          row.tone = 'off';
          row.note = `Approved Leave (${leaveRec.category || 'Leave'})`;
          row.isApprovedLeave = true;
          row.leaveCategory = leaveRec.category || 'Approved Leave';
          if (!leaveCategory) leaveCategory = row.leaveCategory;
          // Approved leave on a closed general working day counts as a scheduled working day (not present, lowers Present %)
          const isClosedGenWorkDay = !holCheck.isOffOrHol && d <= maxDatasetDay && isDayClosed;
          if (isClosedGenWorkDay) {
            scheduledWorkingDays++;
            leaveDates.push(`${dStr}-${monShortUpper} (${dn})`);
          } else if (holCheck.isOffOrHol) {
            weekendOrHolidayOffCount++;
          }
        } else if (holCheck.isOffOrHol) {
          row.tone = 'off';
          row.note = holCheck.label || (wk ? 'Weekend (Thu/Fri)' : 'Plant / Govt Holiday');
          row.isOffOrHol = true;
          weekendOrHolidayOffCount++;
        } else if (d > maxDatasetDay) {
          row.tone = 'none';
          row.note = 'Upcoming / Not recorded';
          row.isUpcoming = true;
        } else if (!hasDaily && Number(e.totalDuty || 0) > 0 && !Array.isArray(e.activeDayNums)) {
          row.tone = 'none';
          row.note = 'No daily log cached';
        } else if (!isDayClosed) {
          row.tone = 'none';
          row.note = '⏳ FP not yet (day pending)';
          row.fpPending = true;
        } else {
          // True General Working Day Absent
          row.tone = 'absent';
          row.note = '🔴 Absent (General Working Day)';
          row.isGeneralAbsent = true;
          scheduledWorkingDays++;
          absentDates.push(`${dStr}-${monShortUpper} (${dn})`);
          absentShortDates.push(`${dStr}-${mNumStr}`);
        }
      } else {
        Object.assign(row, { v: [0, 1, 2, 3, 4, 5].map(i => Number(o.v[i]) || 0), night: o.night });
        const _mi0 = o.forceMiss || (daily.length && _isPunchMissing(o.inn));
        const _mo0 = o.forceMiss || (daily.length && _isPunchMissing(o.out));
        const _fpPend = !o.forceMiss && !isDayClosed && !!(_mi0 || _mo0);
        const mi = _fpPend ? false : _mi0;
        const mo = _fpPend ? false : _mo0;
        row.inn = mi ? 'MISSING' : o.inn;
        row.out = mo ? 'MISSING' : o.out;
        row.missIn = !!mi;
        row.missOut = !!mo;

        if (row.inn || row.out || row.v.some(x => x > 0) || row.night) {
          totalPresentDays++;
        }
        if (o.night) nightsCount++;
        if (row.v[2] || row.v[3] || row.v[4] || row.v[5]) holidayWorkedCount++;

        // If this is a closed general working day (not weekend/govt holiday), working on it counts towards scheduledWorkingDays and presentOnScheduledDays
        if (!holCheck.isOffOrHol && d <= maxDatasetDay && isDayClosed) {
          scheduledWorkingDays++;
          presentOnScheduledDays++;
        }

        if (_fpPend) {
          row.fpPending = true;
          row.tone = 'none';
          row.inn = _mi0 ? '' : o.inn;
          row.out = '';
          row.note = _mi0 ? '⏳ FP not yet (day pending)' : '⏳ In ' + (o.inn || '') + ' — out pending';
        } else if (mi || mo) {
          row.tone = 'bad';
          row.note = mi && mo ? 'In & Out punch missing' : mi ? 'In punch missing' : 'Out punch missing';
        } else {
          const a = _rMin(o.inn), b = _rMin(o.out);
          if (a != null && b != null && b <= a && !o.night) {
            row.tone = 'bad';
            row.note = 'Out is before In';
            row.missOut = true;
          } else if (row.v[4] || row.v[5]) {
            row.tone = 'hol';
            row.note = 'Holiday duty';
          } else if (row.v[2] || row.v[3]) {
            row.tone = 'do';
            row.note = 'Day off duty';
          } else if (row.v[1]) {
            row.note = 'Overtime';
          }
          if (o.night) row.note += (row.note ? ' + ' : '') + 'Night';

          // REQUISITION PROBLEM DETECTION & HIGHLIGHT
          const parseM = (t) => {
            if (!t) return null;
            const mm = String(t).replace(/[^0-9:]/g, '').match(/^(\d{1,2}):(\d{2})/);
            return mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : null;
          };
          const ti = parseM(o.inn), to = parseM(o.out);
          const totOt = (Number(o.v[1]) || 0) + (Number(o.v[3]) || 0) + (Number(o.v[5]) || 0);
          const totDuty = (Number(o.v[0]) || 0) + (Number(o.v[2]) || 0) + (Number(o.v[4]) || 0);
          let elHrs = 0;
          if (ti !== null && to !== null) {
            const diff = to < ti ? (1440 - ti) + to : to - ti;
            elHrs = Number((diff / 60).toFixed(2));
          }

          if (totOt === 0 && !mi && !mo) {
            let isReq = false, reqNote = '';
            if (o.night && (elHrs >= 11.0 || totDuty >= 11.0)) {
              isReq = true;
              const exp = Math.min(7, Math.max(4, Math.round(Math.max(elHrs, totDuty) - 8.5)));
              reqNote = `⚠️ Night OT Missing (${exp}h OT)`;
            } else if (!o.night && to !== null && to >= 1150 && to <= 1215) {
              isReq = true;
              reqNote = '⚠️ 3h OT Missing (04:30-07:30 PM)';
            } else if (!o.night && to !== null && to >= 1216 && to <= 1350) {
              isReq = true;
              reqNote = '⚠️ 5h OT Missing (04:30-09:30 PM)';
            } else if (!o.night && ti !== null && ti <= 435 && elHrs >= 9.5) {
              isReq = true;
              reqNote = ti <= 390 ? '⚠️ 2.5h Morning OT Missing' : '⚠️ 1.0h Morning OT Missing';
            }

            if (isReq) {
              row.tone = 'req';
              row.reqProblem = true;
              row.note = reqNote + (row.note ? ' [' + row.note + ']' : '');
            }
          }
        }
      }

      // NIGHT SUSPECT FLAG (never declares a night; Night is ONLY when Empress says YES)
      if (o && !o.night) {
        const _m = (t) => {
          const mm = String(t || '').replace(/[^0-9:]/g, '').match(/^(\d{1,2}):(\d{2})/);
          return mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : null;
        };
        const _ti = _m(o.inn), _to = _m(o.out);
        let _el = 0;
        if (_ti !== null && _to !== null) _el = ((_to < _ti ? (1440 - _ti) + _to : _to - _ti) / 60);
        const _tot = o.v.reduce((a, x) => a + (Number(x) || 0), 0);
        const _sh = String(o.shift || '').toUpperCase();
        let _why = '';
        if (_sh.indexOf('NIGHT') >= 0 || _sh === 'DN' || _sh === 'C') _why = 'Shift shows night';
        else if (_to !== null && _ti === null && _to >= 240 && _to <= 435) _why = 'Morning out, no In';
        else if (_el >= 15 || _tot >= 15) _why = 'Very long duty';
        if (_why) {
          row.nightSuspect = true;
          if (!row.tone || row.tone === 'hol' || row.tone === 'do') row.tone = 'req';
          row.note = (row.note ? row.note + ' ' : '') + '⚠️ Night suspected (' + _why + ') but not marked in Empress — contact ERP team';
        }
      }

      // GATE PASS / EARLY EXIT REMARK
      if (o && !row.missIn && !row.missOut && !row.reqProblem && !row.nightSuspect) {
        const ex = earlyExitMap.get(d);
        if (ex) {
          row.earlyExit = ex;
          if (!row.tone) row.tone = 'ee';
          const sm = Math.max(0, Math.round(ex.shortMin || 0));
          const eeDur = sm >= 60 ? (Math.floor(sm / 60) + 'h ' + (sm % 60 ? (sm % 60) + 'm' : '')).trim() : (sm + 'm');
          const eeNote = '🚪 Gate Pass / Early Exit (-' + eeDur + ')';
          row.note = row.note ? (row.note + ' | ' + eeNote) : eeNote;
        }
      }

      if (row.tone === 'bad') punchIssues++;
      if (row.tone === 'req' && !row.nightSuspect) reqIssues++;
      if (row.nightSuspect) nightSuspectsCount++;
      if (row.earlyExit) earlyExitsCount++;

      rows.push(row);
    }

    const presentPct = scheduledWorkingDays > 0
      ? Math.round((presentOnScheduledDays / scheduledWorkingDays) * 1000) / 10
      : null;

    return {
      y,
      m,
      ym: resolvedYm,
      rows,
      lastDay: last,
      maxDatasetDay,
      isSoFar: hasPendingOrUpcomingDay,
      scheduledWorkingDays,
      presentOnScheduledDays,
      totalPresentDays,
      presentPct,
      generalAbsentCount: absentDates.length,
      generalAbsentDays: absentDates,
      generalAbsentShortDates: absentShortDates,
      approvedLeaveCount: leaveDates.length,
      approvedLeaveDays: leaveDates,
      approvedLeaveCategory: leaveCategory,
      offAfterNightCount,
      weekendOrHolidayOffCount,
      holidayWorkedCount,
      nightCount: nightsCount,
      punchIssueCount: punchIssues,
      reqIssueCount: reqIssues,
      nightSuspectCount: nightSuspectsCount,
      earlyExitCount: earlyExitsCount
    };
  }

  return {
    BASE_GOVT_HOLS,
    rptIsDayClosed,
    computeEmpMonthAttendance,
    computeDatasetMetaFromEmployees,
    didEmployeeWorkLastNightOfMonth
  };
});
