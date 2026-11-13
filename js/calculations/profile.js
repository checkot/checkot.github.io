/* ==========================================================================
   PROFILE.JS (CALCULATIONS) - Pure Aggregation Engine for Employee Profile ("Me")
   Zero DOM dependencies. Callable in Browser (window.ProfileCalc) and Node.js.
   ========================================================================== */

(function (root, factory) {
  let attApi = null;
  if (typeof module === 'object' && module.exports) {
    try { attApi = require('./attendance.js'); } catch (e) {}
  }
  if (!attApi && root && root.AttendanceCalc) {
    attApi = root.AttendanceCalc;
  }
  const api = factory(root, attApi);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ProfileCalc = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root, attApi) {
  'use strict';

  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function _getAttFn() {
    if (attApi && typeof attApi.computeEmpMonthAttendance === 'function') return attApi.computeEmpMonthAttendance;
    if (root && typeof root.computeEmpMonthAttendance === 'function') return root.computeEmpMonthAttendance;
    throw new Error('computeEmpMonthAttendance is not loaded');
  }

  function _didWorkLastNight(emp, ymStr) {
    if (attApi && typeof attApi.didEmployeeWorkLastNightOfMonth === 'function') {
      return attApi.didEmployeeWorkLastNightOfMonth(emp, ymStr);
    }
    if (root && typeof root.didEmpWorkNightOnLastDay === 'function') {
      return root.didEmpWorkNightOnLastDay(emp, ymStr);
    }
    return false;
  }

  function isPunchMissingVal(val) {
    if (root && typeof root.isPunchMissing === 'function') return root.isPunchMissing(val);
    const cleaned = String(val == null ? '' : val).replace(/['"“”]/g, '').trim().toUpperCase();
    if (!cleaned) return true;
    if (cleaned === '-' || cleaned === '--' || cleaned === 'N/A' || cleaned === 'NA' || cleaned === 'NULL' || cleaned === 'NONE' || cleaned === 'MISSING') return true;
    if (/^0{1,2}:00(:00)?$/.test(cleaned)) return true;
    if (!/^\d{1,2}:\d{2}(:\d{2})?([AP]M)?$/i.test(cleaned)) return true;
    return false;
  }

  /**
   * Parse HH:MM or HH:MM:SS (with optional AM/PM) into minutes since midnight (0..1439).
   */
  function parsePunchMinutes(val) {
    if (val == null || isPunchMissingVal(val)) return null;
    const s = String(val).replace(/['"“”]/g, '').trim().toUpperCase();
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
    if (!m) return null;
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ampm = m[3] ? m[3].toUpperCase() : '';
    if (hh > 24 || mm > 59) return null;
    if (ampm === 'PM' && hh < 12) hh += 12;
    else if (ampm === 'AM' && hh === 12) hh = 0;
    if (hh === 24) hh = 0;
    return hh * 60 + mm;
  }

  /**
   * Render minutes-since-midnight as 12-hour HH:MM AM/PM (e.g., "07:52 AM", "06:15 PM").
   */
  function formatMinutes12h(mins, nextDaySuffix) {
    if (mins == null || !isFinite(mins)) return '—';
    const norm = ((Math.round(mins) % 1440) + 1440) % 1440;
    const h24 = Math.floor(norm / 60);
    const mm = String(norm % 60).padStart(2, '0');
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const hh = String(h12).padStart(2, '0');
    return `${hh}:${mm} ${period}${nextDaySuffix ? ' (+1)' : ''}`;
  }

  function formatMinutes24h(mins, nextDaySuffix) {
    if (mins == null || !isFinite(mins)) return '—';
    const norm = ((Math.round(mins) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(norm / 60)).padStart(2, '0');
    const mm = String(norm % 60).padStart(2, '0');
    return `${hh}:${mm}${nextDaySuffix ? ' (+1)' : ''}`;
  }

  function isNightShiftRow(r) {
    if (!Array.isArray(r)) return false;
    if (Number(r[10]) === 1) return true;
    const sh = String(r[11] || '').trim().toUpperCase();
    return sh === 'DN' || sh === 'C' || sh.includes('NIGHT');
  }

  /**
   * Section H: Compute average In time, average Out time (day shift vs night shift separated),
   * and average duty hours per worked day for one employee-month.
   * Rules:
   * - Ignore days with missing In or Out (those belong to punchProblems).
   * - Separate night-shift days (r[10] === 1 or shift code DN/NIGHT/C) so next-morning 06:30 AM Out
   *   is never averaged into the day-shift Out time.
   */
  function computeEmpMonthPunchStats(emp) {
    if (!emp) {
      return {
        workedDaysCount: 0,
        validPunchDaysCount: 0,
        dayShiftCount: 0,
        nightShiftCount: 0,
        inSumMins: 0,
        inCount: 0,
        dayInSumMins: 0,
        dayOutSumMins: 0,
        nightInSumMins: 0,
        nightOutSumMins: 0,
        avgInMins: null,
        avgDayInMins: null,
        avgDayOutMins: null,
        avgNightInMins: null,
        avgNightOutMins: null,
        avgIn12h: '—',
        avgDayOut12h: '—',
        avgNightOut12h: '—',
        avgIn24h: '—',
        avgDayOut24h: '—',
        avgNightOut24h: '—',
        totalDuty: 0,
        avgDutyPerDay: 0
      };
    }

    const daily = Array.isArray(emp.daily) ? emp.daily : [];
    let workedDaysCount = 0;
    let validPunchDaysCount = 0;
    let dayShiftCount = 0;
    let nightShiftCount = 0;
    let inSumMins = 0;
    let inCount = 0;
    let dayInSumMins = 0;
    let dayOutSumMins = 0;
    let nightInSumMins = 0;
    let nightOutSumMins = 0;

    daily.forEach(r => {
      if (!Array.isArray(r)) return;
      const dHrs = (Number(r[4]) || 0) + (Number(r[5]) || 0) + (Number(r[6]) || 0) + (Number(r[7]) || 0) + (Number(r[8]) || 0) + (Number(r[9]) || 0);
      const inStr = String(r[2] || '').trim();
      const outStr = String(r[3] || '').trim();
      const isNight = isNightShiftRow(r);
      const missIn = isPunchMissingVal(inStr);
      const missOut = isPunchMissingVal(outStr);

      if (dHrs > 0 || !missIn || !missOut || isNight) {
        workedDaysCount++;
      }

      // Rule: ignore days with a missing In or Out
      if (missIn || missOut) return;

      const tin = parsePunchMinutes(inStr);
      const tout = parsePunchMinutes(outStr);
      if (tin == null || tout == null) return;

      if (isNight) {
        validPunchDaysCount++;
        nightShiftCount++;
        inSumMins += tin;
        inCount++;
        nightInSumMins += tin;
        // Night shift Out is after midnight (e.g. 05:45..07:45 AM = 345..465 mins).
        // If a night shift ended right before midnight (e.g. 23:30 = 1410 mins), normalize relative to midnight:
        const normNightOut = tout >= 1080 ? (tout - 1440) : tout;
        nightOutSumMins += normNightOut;
      } else {
        // Day shift: Out must be after In
        if (tout <= tin) return;
        validPunchDaysCount++;
        dayShiftCount++;
        inSumMins += tin;
        inCount++;
        dayInSumMins += tin;
        dayOutSumMins += tout;
      }
    });

    if (daily.length === 0 && workedDaysCount === 0) {
      workedDaysCount = Math.max(0, Number(emp.regularDaysCount || 0) + Number(emp.holidayCount || 0));
    }

    const totalDuty = Number(emp.totalDuty || 0);
    const avgDutyPerDay = workedDaysCount > 0 ? Number((totalDuty / workedDaysCount).toFixed(2)) : 0;

    const avgInMins = inCount > 0 ? (inSumMins / inCount) : null;
    const avgDayInMins = dayShiftCount > 0 ? (dayInSumMins / dayShiftCount) : null;
    const avgDayOutMins = dayShiftCount > 0 ? (dayOutSumMins / dayShiftCount) : null;
    const avgNightInMins = nightShiftCount > 0 ? (nightInSumMins / nightShiftCount) : null;
    const rawAvgNightOut = nightShiftCount > 0 ? (nightOutSumMins / nightShiftCount) : null;
    const avgNightOutMins = rawAvgNightOut != null ? ((rawAvgNightOut % 1440) + 1440) % 1440 : null;

    return {
      workedDaysCount,
      validPunchDaysCount,
      dayShiftCount,
      nightShiftCount,
      inSumMins,
      inCount,
      dayInSumMins,
      dayOutSumMins,
      nightInSumMins,
      nightOutSumMins,
      avgInMins,
      avgDayInMins,
      avgDayOutMins,
      avgNightInMins,
      avgNightOutMins,
      avgIn12h: formatMinutes12h(avgDayInMins != null ? avgDayInMins : avgInMins, false),
      avgDayOut12h: formatMinutes12h(avgDayOutMins, false),
      avgNightOut12h: formatMinutes12h(avgNightOutMins, true),
      avgIn24h: formatMinutes24h(avgDayInMins != null ? avgDayInMins : avgInMins, false),
      avgDayOut24h: formatMinutes24h(avgDayOutMins, false),
      avgNightOut24h: formatMinutes24h(avgNightOutMins, true),
      totalDuty,
      avgDutyPerDay
    };
  }

  /**
   * Section G: Extract all Requisition, Night Suspect, and Punch issues for one month.
   */
  function extractEmpMonthIssues(emp, ymStr, attSummary) {
    if (!emp) {
      return {
        requisitionIssues: [],
        nightSuspectIssues: [],
        punchProblemIssues: [],
        allIssues: [],
        counts: { requisition: 0, nightSuspect: 0, punch: 0, total: 0 }
      };
    }

    const daily = Array.isArray(emp.daily) ? emp.daily : [];
    const dailyByDayNum = {};
    daily.forEach(r => {
      if (!Array.isArray(r) || !r[0]) return;
      const m = String(r[0]).trim().match(/^(\d{1,2})/);
      if (m) dailyByDayNum[parseInt(m[1], 10)] = r;
    });

    // 1. Requisition Problems
    const rawReq = Array.isArray(emp.requisitionProblems)
      ? emp.requisitionProblems
      : (root && typeof root.computeEmpRequisitionProblems === 'function' ? root.computeEmpRequisitionProblems(emp) : []);

    const requisitionIssues = rawReq.map(p => ({
      type: 'requisition',
      typeLabel: 'Requisition Issue',
      month: ymStr,
      date: String(p.date || '').toUpperCase(),
      day: p.day || '',
      in: p.in || '—',
      out: p.out || '—',
      duty: Number(p.duty != null ? p.duty : p.elapsed || 0),
      elapsed: Number(p.elapsed || p.duty || 0),
      isNight: Boolean(p.isNight),
      expectedOt: p.expectedOt || 'OT Requisition Missing',
      reason: p.reason || 'Worked overtime on floor, but Empress shows 0 OT'
    }));

    // 2. Night Suspects
    const rawNightSus = Array.isArray(emp.nightSuspects) ? emp.nightSuspects : [];
    const nightSuspectIssues = rawNightSus.map(ns => ({
      type: 'nightSuspect',
      typeLabel: 'Night Suspect',
      month: ymStr,
      date: String(ns.date || '').toUpperCase(),
      day: ns.day || '',
      in: ns.in || '—',
      out: ns.out || '—',
      duty: Number(ns.duty || 0),
      elapsed: Number(ns.elapsed || 0),
      shift: ns.shift || '',
      expectedOt: 'Night Allowance (YES missing)',
      reason: ns.reason || 'Night suspected but Night column is not marked YES in Empress'
    }));

    // If attSummary found any nightSuspect row not in rawNightSus, include it
    if (attSummary && Array.isArray(attSummary.rows)) {
      const seenNsDays = new Set(nightSuspectIssues.map(x => parseInt(String(x.date).split('-')[0], 10)));
      attSummary.rows.forEach(r => {
        if (r && r.nightSuspect) {
          const dNo = parseInt(r.dayNum, 10);
          if (!seenNsDays.has(dNo)) {
            const dr = dailyByDayNum[dNo];
            nightSuspectIssues.push({
              type: 'nightSuspect',
              typeLabel: 'Night Suspect',
              month: ymStr,
              date: dr ? String(dr[0]).toUpperCase() : `${r.dayNum}-${ymStr}`,
              day: r.day || '',
              in: r.inn || '—',
              out: r.out || '—',
              duty: Number((r.v || []).reduce((a, b) => a + (Number(b) || 0), 0).toFixed(2)),
              elapsed: 0,
              shift: dr ? (dr[11] || '') : '',
              expectedOt: 'Night Allowance (YES missing)',
              reason: r.note || 'Night suspected but not marked YES in Empress'
            });
          }
        }
      });
    }

    // 3. Punch Problems (only confirmed closed-day punch problems)
    const punchProblemIssues = [];
    const seenPunchDays = new Set();
    if (attSummary && Array.isArray(attSummary.rows)) {
      attSummary.rows.forEach(r => {
        if (r && r.tone === 'bad') {
          const dNo = parseInt(r.dayNum, 10);
          seenPunchDays.add(dNo);
          const dr = dailyByDayNum[dNo];
          const [yy, mm] = String(ymStr || '').split('-');
          const monCode = MONTH_SHORT[(parseInt(mm, 10) || 1) - 1]?.toUpperCase() || 'JAN';
          const dateLabel = dr && dr[0] ? String(dr[0]).toUpperCase() : `${r.dayNum}-${monCode}-${yy}`;
          const dutyHrs = Number((r.v || []).reduce((a, b) => a + (Number(b) || 0), 0).toFixed(2));
          punchProblemIssues.push({
            type: 'punchProblem',
            typeLabel: 'Punch Problem',
            month: ymStr,
            date: dateLabel,
            day: r.day || '',
            in: r.missIn ? 'MISSING' : (r.inn || '—'),
            out: r.missOut ? 'MISSING' : (r.out || '—'),
            duty: dutyHrs,
            elapsed: dutyHrs,
            expectedOt: 'Punch Correction Needed',
            reason: r.note || 'In/Out punch missing'
          });
        }
      });
    } else if (Array.isArray(emp.punchProblems)) {
      emp.punchProblems.forEach(p => {
        const dStr = typeof p === 'string' ? p : (p && p.date) || '';
        if (!dStr) return;
        const m = String(dStr).match(/^(\d{1,2})/);
        const dNo = m ? parseInt(m[1], 10) : 0;
        const dr = dailyByDayNum[dNo];
        punchProblemIssues.push({
          type: 'punchProblem',
          typeLabel: 'Punch Problem',
          month: ymStr,
          date: String(dStr).toUpperCase(),
          day: dr ? (dr[1] || '') : '',
          in: dr ? (isPunchMissingVal(dr[2]) ? 'MISSING' : dr[2]) : 'MISSING',
          out: dr ? (isPunchMissingVal(dr[3]) ? 'MISSING' : dr[3]) : 'MISSING',
          duty: dr ? Number(((Number(dr[4]) || 0) + (Number(dr[6]) || 0) + (Number(dr[8]) || 0)).toFixed(2)) : 0,
          elapsed: 0,
          expectedOt: 'Punch Correction Needed',
          reason: 'In/Out punch missing'
        });
      });
    }

    const allIssues = [
      ...requisitionIssues,
      ...nightSuspectIssues,
      ...punchProblemIssues
    ];

    return {
      requisitionIssues,
      nightSuspectIssues,
      punchProblemIssues,
      allIssues,
      counts: {
        requisition: requisitionIssues.length,
        nightSuspect: nightSuspectIssues.length,
        punch: punchProblemIssues.length,
        total: allIssues.length
      }
    };
  }

  /**
   * Build pre-filled WhatsApp message for a single issue or all issues of an employee.
   */
  function buildErpWhatsAppIssueMessage(empMeta, issue) {
    const id = (empMeta && empMeta.id) || '—';
    const name = (empMeta && empMeta.name) || '';
    const area = (empMeta && empMeta.area) || 'RPPF';
    const dStr = issue.date || '—';
    const dayStr = issue.day ? ` (${issue.day})` : '';
    const inOut = `In: ${issue.in || '—'} ➔ Out: ${issue.out || '—'}`;
    const dutyStr = issue.duty ? ` | Duty: ${issue.duty}h` : '';
    const expStr = issue.expectedOt ? `\nExpected: ${issue.expectedOt}` : '';
    return `Dear ERP Team,\nEmployee: ${name ? name + ' (' + id + ')' : id}\nSection: ${area}\nDate: ${dStr}${dayStr}\nPunch: ${inOut}${dutyStr}\nIssue: ${issue.reason || issue.typeLabel}${expStr}\n\nPlease check and update in Empress. Thank you!`;
  }

  function buildErpWhatsAppBulkMessage(empMeta, issuesList, scopeLabel) {
    const id = (empMeta && empMeta.id) || '—';
    const name = (empMeta && empMeta.name) || '';
    const area = (empMeta && empMeta.area) || 'RPPF';
    const lines = (issuesList || []).map(iss => {
      return `• ${iss.date}${iss.day ? ' (' + iss.day + ')' : ''}: In ${iss.in || '—'} ➔ Out ${iss.out || '—'} (${iss.duty || 0}h) — ${iss.reason || iss.expectedOt || iss.typeLabel}`;
    });
    return `Dear ERP Team,\nEmployee: ${name ? name + ' (' + id + ')' : id} (${area})\nPeriod: ${scopeLabel || 'Payroll Check'}\nIssues found (${lines.length}):\n\n${lines.join('\n')}\n\nPlease verify and update before payroll. Thank you!`;
  }

  /**
   * Compute complete summary for a single employee-month.
   */
  function computeEmpMonthSummary(emp, ymStr, ctx) {
    const options = ctx || {};
    const [yStr, mStr] = String(ymStr || '').split('-');
    const year = parseInt(yStr, 10) || 2026;
    const monthNum = parseInt(mStr, 10) || 1;
    const shortLabel = MONTH_SHORT[monthNum - 1] || mStr;
    const fullLabel = `${MONTH_FULL[monthNum - 1] || mStr} ${year}`;

    if (!emp) {
      return {
        ym: ymStr,
        year,
        monthNum,
        shortLabel,
        monthName: MONTH_FULL[monthNum - 1] || mStr,
        fullLabel,
        exists: false,
        isSoFar: false,
        totalDuty: 0,
        otHours: 0,
        otDaysCount: 0,
        holidayCount: 0,
        nightCount: 0,
        regularDaysCount: 0,
        plainDaysCount: 0,
        otAmount: 0,
        holidayAmount: 0,
        nightAmount: 0,
        totalEarned: 0,
        scheduledWorkingDays: 0,
        presentOnScheduledDays: 0,
        totalPresentDays: 0,
        presentPct: null,
        generalAbsentCount: 0,
        generalAbsentDays: [],
        generalAbsentShortDates: [],
        approvedLeaveCount: 0,
        approvedLeaveDays: [],
        approvedLeaveCategory: '',
        offAfterNightCount: 0,
        earlyExits: [],
        earlyExitCount: 0,
        holidayDays: [],
        nightDays: [],
        otDates: [],
        punchStats: computeEmpMonthPunchStats(null),
        issues: extractEmpMonthIssues(null, ymStr, null),
        miniCalendarDays: [],
        sectionStats: null
      };
    }

    const computeAtt = _getAttFn();
    const att = computeAtt(emp, ymStr, options);
    const punchStats = computeEmpMonthPunchStats(emp);
    const issues = extractEmpMonthIssues(emp, ymStr, att);

    let earlyExits = [];
    try {
      const eeFn = options.computeEmpEarlyExits || (root && typeof root.computeEmpEarlyExits === 'function' ? root.computeEmpEarlyExits : null);
      if (eeFn) earlyExits = eeFn(emp) || [];
    } catch (e) {}

    const daily = Array.isArray(emp.daily) ? emp.daily : [];
    const otDates = [];
    daily.forEach(r => {
      if (!Array.isArray(r)) return;
      const ot = Number(((Number(r[5]) || 0) + (Number(r[7]) || 0) + (Number(r[9]) || 0)).toFixed(2));
      if (ot > 0) {
        otDates.push({
          date: String(r[0] || '').toUpperCase(),
          day: r[1] || '',
          in: r[2] || '',
          out: r[3] || '',
          otHours: ot,
          isNight: Number(r[10]) === 1
        });
      }
    });

    const otHours = Number(emp.otHours || 0);
    const totalDuty = Number(emp.totalDuty || 0);
    const holidayCount = Number(emp.holidayCount != null ? emp.holidayCount : (Array.isArray(emp.holidayDays) ? emp.holidayDays.length : 0));
    const nightCount = Number(emp.nightCount != null ? emp.nightCount : (Array.isArray(emp.nightDays) ? emp.nightDays.length : 0));
    const regularDaysCount = Number(emp.regularDaysCount || 0);
    const plainDaysCount = Number(emp.plainDaysCount != null ? emp.plainDaysCount : emp.plainDays || 0);

    // Never recompute amounts; read directly from employee record (already computed by rates.js / to_json.py)
    const otAmount = Number(emp.otAmount || 0);
    const holidayAmount = Number(emp.holidayAmount || 0);
    const nightAmount = Number(emp.nightAmount || 0);
    const totalEarned = Number(emp.totalEarned != null ? emp.totalEarned : (otAmount + holidayAmount + nightAmount));

    const otDaysCount = (root && typeof root.getEmpOtDays === 'function')
      ? root.getEmpOtDays(emp)
      : otDates.filter(d => !d.isNight).length;

    // Build mini calendar strip days
    const miniCalendarDays = (att.rows || []).map(r => {
      let state = 'off';
      if (r.isUpcoming) state = 'upcoming';
      else if (r.fpPending) state = 'pending';
      else if (r.isGeneralAbsent) state = 'absent';
      else if (r.isApprovedLeave) state = 'leave';
      else if (r.night) state = 'night';
      else if (r.tone === 'bad') state = 'bad';
      else if (r.tone === 'hol' || r.tone === 'do') state = 'holiday';
      else if (r.inn || r.out || (r.v && r.v.some(x => x > 0))) state = 'present';
      else if (r.afterNight) state = 'offn';
      else state = 'off';

      const dOt = r.v ? Number(((Number(r.v[1]) || 0) + (Number(r.v[3]) || 0) + (Number(r.v[5]) || 0)).toFixed(1)) : 0;
      const dDuty = r.v ? Number(((Number(r.v[0]) || 0) + (Number(r.v[2]) || 0) + (Number(r.v[4]) || 0)).toFixed(1)) : 0;
      return {
        dayNum: parseInt(r.dayNum, 10),
        dayStr: r.dayNum,
        dayName: r.day,
        date: r.date,
        state,
        in: r.inn || '',
        out: r.out || '',
        duty: dDuty,
        ot: dOt,
        night: Boolean(r.night),
        note: r.note || ''
      };
    });

    return {
      ym: ymStr,
      year,
      monthNum,
      shortLabel,
      monthName: MONTH_FULL[monthNum - 1] || mStr,
      fullLabel,
      exists: true,
      isSoFar: att.isSoFar,
      emp,
      totalDuty,
      otHours,
      otDaysCount,
      holidayCount,
      nightCount,
      regularDaysCount,
      plainDaysCount,
      otAmount,
      holidayAmount,
      nightAmount,
      totalEarned,
      scheduledWorkingDays: att.scheduledWorkingDays,
      presentOnScheduledDays: att.presentOnScheduledDays,
      totalPresentDays: att.totalPresentDays,
      presentPct: att.presentPct,
      generalAbsentCount: att.generalAbsentCount,
      generalAbsentDays: att.generalAbsentDays,
      generalAbsentShortDates: att.generalAbsentShortDates,
      approvedLeaveCount: att.approvedLeaveCount,
      approvedLeaveDays: att.approvedLeaveDays,
      approvedLeaveCategory: att.approvedLeaveCategory,
      offAfterNightCount: att.offAfterNightCount,
      earlyExits,
      earlyExitCount: earlyExits.length,
      holidayDays: Array.isArray(emp.holidayDays) ? emp.holidayDays : [],
      nightDays: Array.isArray(emp.nightDays) ? emp.nightDays : [],
      otDates,
      punchStats,
      issues,
      miniCalendarDays,
      sectionStats: emp._sectionStats || options.sectionStats || null
    };
  }

  /**
   * Aggregate multi-month profile data across a year and selected scope.
   *
   * @param {Object} monthRecordsMap - Map of { 'YYYY-MM': empObjOrNull }
   * @param {Object} options - {
   *   targetYear: 2026,
   *   latestMonth: '2026-11',
   *   selectedScope: 'this_month' | 'last_month' | 'year' | 'YYYY-MM',
   *   datasetMetaByMonth: { 'YYYY-MM': { maxActiveDay, consensusHolidays } },
   *   sectionStatsByMonth: { 'YYYY-MM': { area, avgOt, avgDuty, headcount, otRank, dutyRank, earnedRank } },
   *   longTermLeaves: [...],
   *   holidaysConfig: {...},
   *   dayTypeOv: {...},
   *   nowMs: number
   * }
   */
  function aggregateProfileData(monthRecordsMap, options) {
    const opts = options || {};
    const map = monthRecordsMap || {};
    const allKnownYms = Object.keys(map).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();

    const latestMonth = opts.latestMonth || (allKnownYms.length > 0 ? allKnownYms[allKnownYms.length - 1] : '2026-11');
    const [latestYStr, latestMStr] = String(latestMonth).split('-');
    const targetYear = opts.targetYear || parseInt(latestYStr, 10) || 2026;
    const maxMonthNumInYear = parseInt(latestYStr, 10) === targetYear ? (parseInt(latestMStr, 10) || 11) : 12;

    // Determine the previous month relative to latestMonth
    let prevY = parseInt(latestYStr, 10) || 2026;
    let prevM = (parseInt(latestMStr, 10) || 1) - 1;
    if (prevM < 1) { prevM = 12; prevY -= 1; }
    const lastMonthYm = `${prevY}-${String(prevM).padStart(2, '0')}`;

    // Build chronological list of months for targetYear (Jan .. maxMonthNumInYear)
    const yearMonthList = [];
    for (let m = 1; m <= maxMonthNumInYear; m++) {
      const ym = `${targetYear}-${String(m).padStart(2, '0')}`;
      yearMonthList.push(ym);
    }
    // Also include any other months present in map (e.g. 2025-12) for month-picker / last_month support
    const allEvalYms = [...new Set([...allKnownYms, ...yearMonthList, latestMonth, lastMonthYm])].sort();

    // Find any non-null employee record first so we know the employee's ID and metadata
    let baseIdentityEmp = opts.empMeta || null;
    for (let i = allEvalYms.length - 1; i >= 0; i--) {
      if (map[allEvalYms[i]]) {
        baseIdentityEmp = map[allEvalYms[i]];
        break;
      }
    }

    const leavesList = Array.isArray(opts.longTermLeaves)
      ? opts.longTermLeaves
      : (root && typeof root.getActiveLongTermLeaves === 'function' ? root.getActiveLongTermLeaves() : []);

    function hasApprovedLeaveInMonth(empId, ymStr) {
      if (!empId || !Array.isArray(leavesList) || !leavesList.length) return false;
      const uid = String(empId).trim().toUpperCase();
      const [yy, mm] = ymStr.split('-').map(Number);
      const lastD = new Date(yy, mm, 0).getDate();
      const mStart = `${ymStr}-01`;
      const mEnd = `${ymStr}-${String(lastD).padStart(2, '0')}`;
      return leavesList.some(item => {
        if (String(item.id || '').trim().toUpperCase() !== uid) return false;
        const s = item.startDate || '0000-01-01';
        const e = item.endDate || '9999-12-31';
        return s <= mEnd && e >= mStart;
      });
    }

    const summariesByYm = {};
    for (let i = 0; i < allEvalYms.length; i++) {
      const ym = allEvalYms[i];
      let emp = map[ym] || null;
      if (!emp && baseIdentityEmp && hasApprovedLeaveInMonth(baseIdentityEmp.id, ym)) {
        emp = {
          ...baseIdentityEmp,
          totalDuty: 0,
          otHours: 0,
          holidayCount: 0,
          nightCount: 0,
          regularDaysCount: 0,
          plainDaysCount: 0,
          otAmount: 0,
          holidayAmount: 0,
          nightAmount: 0,
          totalEarned: 0,
          daily: [],
          activeDayNums: [],
          holidayDays: [],
          nightDays: [],
          punchProblems: [],
          requisitionProblems: [],
          nightSuspects: [],
          _isLeaveOnlyMonth: true
        };
      }
      // Determine prevNight from the immediately preceding calendar month if available
      const [cy, cm] = ym.split('-').map(Number);
      let py = cy, pm = cm - 1;
      if (pm < 1) { pm = 12; py -= 1; }
      const prevYm = `${py}-${String(pm).padStart(2, '0')}`;
      const prevEmp = map[prevYm] || null;
      let prevNight = undefined;
      if (emp && typeof emp._prevMonthLastNight === 'boolean') {
        prevNight = emp._prevMonthLastNight;
      } else if (prevEmp) {
        prevNight = _didWorkLastNight(prevEmp, prevYm);
      }

      const dsMeta = (opts.datasetMetaByMonth && opts.datasetMetaByMonth[ym]) || (emp && emp._datasetMeta) || null;
      const secStats = (opts.sectionStatsByMonth && opts.sectionStatsByMonth[ym]) || (emp && emp._sectionStats) || null;

      summariesByYm[ym] = computeEmpMonthSummary(emp, ym, {
        prevNight,
        dsMeta,
        sectionStats: secStats,
        longTermLeaves: opts.longTermLeaves,
        holidaysConfig: opts.holidaysConfig,
        dayTypeOv: opts.dayTypeOv,
        computeEmpEarlyExits: opts.computeEmpEarlyExits,
        nowMs: opts.nowMs
      });
    }

    // Extract latest available employee identity metadata
    let identityEmp = null;
    for (let i = allEvalYms.length - 1; i >= 0; i--) {
      const s = summariesByYm[allEvalYms[i]];
      if (s && s.exists && s.emp) {
        identityEmp = s.emp;
        break;
      }
    }

    // Resolve active scope
    const rawScope = opts.selectedScope || 'this_month';
    let scopeType = rawScope;
    let scopeMonths = [];
    let scopeLabel = '';
    let activeSingleYm = latestMonth;

    if (rawScope === 'this_month') {
      scopeMonths = [latestMonth];
      activeSingleYm = latestMonth;
      scopeLabel = summariesByYm[latestMonth]?.fullLabel || latestMonth;
    } else if (rawScope === 'last_month') {
      scopeMonths = [lastMonthYm];
      activeSingleYm = lastMonthYm;
      scopeLabel = summariesByYm[lastMonthYm]?.fullLabel || lastMonthYm;
    } else if (rawScope === 'year') {
      scopeMonths = yearMonthList;
      activeSingleYm = latestMonth;
      scopeLabel = `This Year (${targetYear})`;
    } else if (/^\d{4}-\d{2}$/.test(rawScope)) {
      scopeType = 'custom_month';
      scopeMonths = [rawScope];
      activeSingleYm = rawScope;
      scopeLabel = summariesByYm[rawScope]?.fullLabel || rawScope;
    } else {
      scopeMonths = [latestMonth];
      activeSingleYm = latestMonth;
      scopeLabel = summariesByYm[latestMonth]?.fullLabel || latestMonth;
    }

    // Helper to aggregate a list of month summaries
    function summarizeRange(ymList) {
      let totalDuty = 0;
      let totalOtHours = 0;
      let totalOtDays = 0;
      let totalHolidayDuties = 0;
      let totalNightDuties = 0;
      let totalRegularDays = 0;
      let totalPlainDays = 0;
      let totalOtAmount = 0;
      let totalHolidayAmount = 0;
      let totalNightAmount = 0;
      let totalEarned = 0;
      let scheduledWorkingDays = 0;
      let presentOnScheduledDays = 0;
      let totalPresentDays = 0;
      let totalAbsentDays = 0;
      let totalLeaveDays = 0;
      let totalEarlyExits = 0;
      let activeMonthsCount = 0;
      let leaveCategory = '';

      let inSumMins = 0, inCount = 0;
      let dayInSumMins = 0, dayOutSumMins = 0, dayShiftCount = 0;
      let nightInSumMins = 0, nightOutSumMins = 0, nightShiftCount = 0;
      let workedDaysForPunch = 0;

      const absentDaysList = [];
      const leaveDaysList = [];
      const earlyExitsList = [];

      ymList.forEach(ym => {
        const s = summariesByYm[ym];
        if (!s || !s.exists) return;
        activeMonthsCount++;
        totalDuty += s.totalDuty;
        totalOtHours += s.otHours;
        totalOtDays += s.otDaysCount;
        totalHolidayDuties += s.holidayCount;
        totalNightDuties += s.nightCount;
        totalRegularDays += s.regularDaysCount;
        totalPlainDays += s.plainDaysCount;
        totalOtAmount += s.otAmount;
        totalHolidayAmount += s.holidayAmount;
        totalNightAmount += s.nightAmount;
        totalEarned += s.totalEarned;
        scheduledWorkingDays += s.scheduledWorkingDays;
        presentOnScheduledDays += s.presentOnScheduledDays;
        totalPresentDays += s.totalPresentDays;
        totalAbsentDays += s.generalAbsentCount;
        totalLeaveDays += s.approvedLeaveCount;
        totalEarlyExits += s.earlyExitCount;
        if (s.approvedLeaveCategory && !leaveCategory) leaveCategory = s.approvedLeaveCategory;

        s.generalAbsentDays.forEach(d => absentDaysList.push({ ym, date: d }));
        s.approvedLeaveDays.forEach(d => leaveDaysList.push({ ym, date: d }));
        s.earlyExits.forEach(ex => earlyExitsList.push({ ...ex, ym }));

        const ps = s.punchStats;
        if (ps) {
          workedDaysForPunch += ps.workedDaysCount;
          inSumMins += ps.inSumMins;
          inCount += ps.inCount;
          dayInSumMins += ps.dayInSumMins;
          dayOutSumMins += ps.dayOutSumMins;
          dayShiftCount += ps.dayShiftCount;
          nightInSumMins += ps.nightInSumMins;
          nightOutSumMins += ps.nightOutSumMins;
          nightShiftCount += ps.nightShiftCount;
        }
      });

      const avgPresentPct = scheduledWorkingDays > 0
        ? Math.round((presentOnScheduledDays / scheduledWorkingDays) * 1000) / 10
        : null;

      const avgDayInMins = dayShiftCount > 0 ? (dayInSumMins / dayShiftCount) : (inCount > 0 ? inSumMins / inCount : null);
      const avgDayOutMins = dayShiftCount > 0 ? (dayOutSumMins / dayShiftCount) : null;
      const rawNightOut = nightShiftCount > 0 ? (nightOutSumMins / nightShiftCount) : null;
      const avgNightOutMins = rawNightOut != null ? ((rawNightOut % 1440) + 1440) % 1440 : null;
      const avgDutyPerDay = workedDaysForPunch > 0 ? Number((totalDuty / workedDaysForPunch).toFixed(2)) : 0;

      return {
        activeMonthsCount,
        totalDuty: Number(totalDuty.toFixed(2)),
        totalOtHours: Number(totalOtHours.toFixed(2)),
        avgMonthlyOtHours: activeMonthsCount > 0 ? Number((totalOtHours / activeMonthsCount).toFixed(1)) : 0,
        totalOtDays,
        totalHolidayDuties,
        totalNightDuties,
        totalRegularDays,
        totalPlainDays,
        totalOtAmount: Number(totalOtAmount.toFixed(2)),
        totalHolidayAmount: Number(totalHolidayAmount.toFixed(2)),
        totalNightAmount: Number(totalNightAmount.toFixed(2)),
        totalEarned: Number(totalEarned.toFixed(2)),
        avgMonthlyEarned: activeMonthsCount > 0 ? Number((totalEarned / activeMonthsCount).toFixed(2)) : 0,
        scheduledWorkingDays,
        presentOnScheduledDays,
        totalPresentDays,
        avgPresentPct,
        totalAbsentDays,
        totalLeaveDays,
        leaveCategory,
        absentDaysList,
        leaveDaysList,
        totalEarlyExits,
        earlyExitsList,
        punch: {
          workedDaysCount: workedDaysForPunch,
          dayShiftCount,
          nightShiftCount,
          avgInMins: avgDayInMins,
          avgDayOutMins,
          avgNightOutMins,
          avgIn12h: formatMinutes12h(avgDayInMins, false),
          avgDayOut12h: formatMinutes12h(avgDayOutMins, false),
          avgNightOut12h: formatMinutes12h(avgNightOutMins, true),
          avgIn24h: formatMinutes24h(avgDayInMins, false),
          avgDayOut24h: formatMinutes24h(avgDayOutMins, false),
          avgNightOut24h: formatMinutes24h(avgNightOutMins, true),
          avgDutyPerDay
        }
      };
    }

    const yearSummary = summarizeRange(yearMonthList);
    const scopeSummary = summarizeRange(scopeMonths);
    const thisMonthSummary = summariesByYm[latestMonth] || computeEmpMonthSummary(null, latestMonth, opts);
    const lastMonthSummary = summariesByYm[lastMonthYm] || computeEmpMonthSummary(null, lastMonthYm, opts);
    const activeMonthSummary = summariesByYm[activeSingleYm] || thisMonthSummary;

    // Month-wise array for targetYear (Jan .. Nov/Dec)
    const yearMonthSummaries = yearMonthList.map(ym => summariesByYm[ym]);

    // Section C: Monthly OT Income bars, best month, MoM change
    const maxMonthlyEarned = Math.max(1, ...yearMonthSummaries.map(s => (s && s.exists ? s.totalEarned : 0)));
    let bestIncomeMonth = null;
    yearMonthSummaries.forEach(s => {
      if (s && s.exists && (!bestIncomeMonth || s.totalEarned > bestIncomeMonth.totalEarned)) {
        bestIncomeMonth = s;
      }
    });

    const monthlyIncomeBars = yearMonthSummaries.map((s, idx) => {
      const prevS = idx > 0 ? yearMonthSummaries[idx - 1] : (summariesByYm[`${targetYear - 1}-12`] || null);
      const tot = s.exists ? s.totalEarned : 0;
      const heightPct = s.exists && maxMonthlyEarned > 0 ? Math.round((tot / maxMonthlyEarned) * 100) : 0;
      const otShare = tot > 0 ? Math.round((s.otAmount / tot) * 100) : 0;
      const holShare = tot > 0 ? Math.round((s.holidayAmount / tot) * 100) : 0;
      const nightShare = tot > 0 ? Math.max(0, 100 - otShare - holShare) : 0;
      let momDiff = null, momDir = 'flat';
      if (s.exists && prevS && prevS.exists) {
        momDiff = Number((s.totalEarned - prevS.totalEarned).toFixed(2));
        momDir = momDiff > 0 ? 'up' : momDiff < 0 ? 'down' : 'flat';
      }
      return {
        ym: s.ym,
        shortLabel: s.shortLabel,
        monthName: s.monthName,
        exists: s.exists,
        isSoFar: s.isSoFar,
        totalEarned: tot,
        otAmount: s.otAmount,
        holidayAmount: s.holidayAmount,
        nightAmount: s.nightAmount,
        otHours: s.otHours,
        holidayCount: s.holidayCount,
        nightCount: s.nightCount,
        heightPct,
        otShare,
        holShare,
        nightShare,
        momDiff,
        momDir
      };
    });

    // Compare active month (or thisMonth) vs its previous month for income & punch trends
    const refIdx = allEvalYms.indexOf(activeSingleYm);
    const prevRefYm = refIdx > 0 ? allEvalYms[refIdx - 1] : lastMonthYm;
    const prevRefSummary = summariesByYm[prevRefYm] || null;

    let incomeMom = { diff: null, pct: null, dir: 'flat', curYm: activeSingleYm, prevYm: prevRefYm };
    if (activeMonthSummary && activeMonthSummary.exists && prevRefSummary && prevRefSummary.exists) {
      const diff = Number((activeMonthSummary.totalEarned - prevRefSummary.totalEarned).toFixed(2));
      const pct = prevRefSummary.totalEarned > 0 ? Number(((diff / prevRefSummary.totalEarned) * 100).toFixed(1)) : null;
      incomeMom = {
        diff,
        pct,
        dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
        curYm: activeSingleYm,
        prevYm: prevRefYm
      };
    }

    // Section D: OT Sparkline points
    const maxMonthlyOt = Math.max(1, ...yearMonthSummaries.map(s => (s && s.exists ? s.otHours : 0)));
    let bestOtMonth = null;
    yearMonthSummaries.forEach(s => {
      if (s && s.exists && (!bestOtMonth || s.otHours > bestOtMonth.otHours)) {
        bestOtMonth = s;
      }
    });
    const otSparkline = yearMonthSummaries.map((s, idx) => {
      const prevS = idx > 0 ? yearMonthSummaries[idx - 1] : null;
      const diff = (s.exists && prevS && prevS.exists) ? Number((s.otHours - prevS.otHours).toFixed(2)) : null;
      return {
        ym: s.ym,
        shortLabel: s.shortLabel,
        monthName: s.monthName,
        exists: s.exists,
        isSoFar: s.isSoFar,
        otHours: s.exists ? s.otHours : 0,
        otDaysCount: s.exists ? s.otDaysCount : 0,
        pctOfMax: s.exists ? Math.round((s.otHours / maxMonthlyOt) * 100) : 0,
        diff
      };
    });

    // Section G: Group issues by month, newest first
    const issueSourceYms = (rawScope === 'year') ? [...yearMonthList].reverse() : [...scopeMonths].reverse();
    const issuesByMonth = [];
    let totalReqIssues = 0, totalNightSusIssues = 0, totalPunchIssues = 0;
    issueSourceYms.forEach(ym => {
      const s = summariesByYm[ym];
      if (!s || !s.exists) return;
      totalReqIssues += s.issues.counts.requisition;
      totalNightSusIssues += s.issues.counts.nightSuspect;
      totalPunchIssues += s.issues.counts.punch;
      if (s.issues.counts.total > 0) {
        issuesByMonth.push({
          ym: s.ym,
          fullLabel: s.fullLabel,
          shortLabel: s.shortLabel,
          counts: s.issues.counts,
          items: s.issues.allIssues
        });
      }
    });

    // Also compute full-year issue totals so even on single-month scope we can inform the user if other months have issues
    let yearTotalIssuesCount = 0;
    yearMonthList.forEach(ym => {
      const s = summariesByYm[ym];
      if (s && s.exists) yearTotalIssuesCount += s.issues.counts.total;
    });

    // Section H: Month-wise punch table with trend arrow vs previous month
    const monthWisePunch = yearMonthSummaries.map((s, idx) => {
      const prevS = idx > 0 ? yearMonthSummaries[idx - 1] : (summariesByYm[`${targetYear - 1}-12`] || null);
      const ps = s.punchStats;
      const pps = prevS && prevS.exists ? prevS.punchStats : null;
      let dutyTrend = 'flat', dutyDiff = null;
      if (s.exists && pps && ps.workedDaysCount > 0 && pps.workedDaysCount > 0) {
        dutyDiff = Number((ps.avgDutyPerDay - pps.avgDutyPerDay).toFixed(2));
        dutyTrend = dutyDiff > 0.05 ? 'up' : dutyDiff < -0.05 ? 'down' : 'flat';
      }
      return {
        ym: s.ym,
        shortLabel: s.shortLabel,
        monthName: s.monthName,
        exists: s.exists,
        workedDaysCount: ps.workedDaysCount,
        dayShiftCount: ps.dayShiftCount,
        nightShiftCount: ps.nightShiftCount,
        avgIn12h: ps.avgIn12h,
        avgDayOut12h: ps.avgDayOut12h,
        avgNightOut12h: ps.avgNightOut12h,
        avgDutyPerDay: ps.avgDutyPerDay,
        dutyDiff,
        dutyTrend
      };
    });

    // Section I.1: Perfect-attendance streak & best month badge
    let perfectMonthsCount = 0;
    let currentPerfectStreak = 0;
    let maxPerfectStreak = 0;
    let runningStreak = 0;
    const perfectMonthLabels = [];
    yearMonthSummaries.forEach(s => {
      if (!s || !s.exists || s.scheduledWorkingDays === 0) return;
      if (s.generalAbsentCount === 0 && s.approvedLeaveCount === 0 && s.presentPct === 100) {
        perfectMonthsCount++;
        runningStreak++;
        perfectMonthLabels.push(s.shortLabel);
        if (runningStreak > maxPerfectStreak) maxPerfectStreak = runningStreak;
      } else {
        runningStreak = 0;
      }
    });
    currentPerfectStreak = runningStreak;

    // Section I.3 & I.4: Rank in section (with 3-month trend) & Anonymous OT vs section average
    const activeSecStats = activeMonthSummary?.sectionStats || null;
    const recent3Yms = yearMonthList.slice(-3);
    const rankTrend3m = recent3Yms.map(ym => {
      const s = summariesByYm[ym];
      const st = s && s.sectionStats ? s.sectionStats : null;
      return {
        ym,
        shortLabel: s ? s.shortLabel : ym,
        otRank: st ? st.otRank : null,
        dutyRank: st ? st.dutyRank : null,
        earnedRank: st ? st.earnedRank : null,
        headcount: st ? st.headcount : null,
        avgOt: st ? st.avgOt : null,
        myOt: s && s.exists ? s.otHours : null
      };
    });

    return {
      targetYear,
      latestMonth,
      lastMonthYm,
      selectedScope: rawScope,
      scopeType,
      scopeLabel,
      activeSingleYm,
      identityEmp,
      yearSummary,
      scopeSummary,
      thisMonthSummary,
      lastMonthSummary,
      activeMonthSummary,
      summariesByYm,
      yearMonthSummaries,
      allAvailableYms: allEvalYms.filter(ym => summariesByYm[ym] && summariesByYm[ym].exists),
      monthlyIncome: {
        bars: monthlyIncomeBars,
        yearTotal: yearSummary.totalEarned,
        avgMonthly: yearSummary.avgMonthlyEarned,
        bestMonth: bestIncomeMonth ? {
          ym: bestIncomeMonth.ym,
          label: bestIncomeMonth.fullLabel,
          shortLabel: bestIncomeMonth.shortLabel,
          totalEarned: bestIncomeMonth.totalEarned
        } : null,
        changeVsLastMonth: incomeMom
      },
      otOverview: {
        thisMonthOt: thisMonthSummary.exists ? thisMonthSummary.otHours : 0,
        thisYearOt: yearSummary.totalOtHours,
        scopeOt: scopeSummary.totalOtHours,
        avgMonthlyOt: yearSummary.avgMonthlyOtHours,
        bestOtMonth: bestOtMonth ? {
          ym: bestOtMonth.ym,
          label: bestOtMonth.fullLabel,
          shortLabel: bestOtMonth.shortLabel,
          otHours: bestOtMonth.otHours
        } : null,
        sparkline: otSparkline
      },
      issuesOverview: {
        scopeCounts: {
          requisition: totalReqIssues,
          nightSuspect: totalNightSusIssues,
          punch: totalPunchIssues,
          total: totalReqIssues + totalNightSusIssues + totalPunchIssues
        },
        yearTotalIssuesCount,
        isAllClear: (totalReqIssues + totalNightSusIssues + totalPunchIssues) === 0,
        byMonth: issuesByMonth
      },
      punchOverview: {
        thisMonth: thisMonthSummary.punchStats,
        thisYear: yearSummary.punch,
        scope: scopeSummary.punch,
        monthWise: monthWisePunch
      },
      extras: {
        perfectMonthsCount,
        currentPerfectStreak,
        maxPerfectStreak,
        perfectMonthLabels,
        bestIncomeMonth: bestIncomeMonth ? { ym: bestIncomeMonth.ym, label: bestIncomeMonth.shortLabel, totalEarned: bestIncomeMonth.totalEarned } : null,
        bestOtMonth: bestOtMonth ? { ym: bestOtMonth.ym, label: bestOtMonth.shortLabel, otHours: bestOtMonth.otHours } : null,
        miniCalendar: activeMonthSummary ? activeMonthSummary.miniCalendarDays : [],
        activeSecStats,
        rankTrend3m
      }
    };
  }

  return {
    MONTH_SHORT,
    MONTH_FULL,
    parsePunchMinutes,
    formatMinutes12h,
    formatMinutes24h,
    isNightShiftRow,
    computeEmpMonthPunchStats,
    extractEmpMonthIssues,
    buildErpWhatsAppIssueMessage,
    buildErpWhatsAppBulkMessage,
    computeEmpMonthSummary,
    aggregateProfileData
  };
});
