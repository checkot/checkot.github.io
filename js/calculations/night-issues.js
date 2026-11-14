/* ==========================================================================
   NIGHT-ISSUES.JS - "Night Issue" detection for the Ranking page
   --------------------------------------------------------------------------
   RULES (owner decisions, Nov 2026)
   1. A day is a NIGHT only when Empress says Night = YES. This file NEVER
      declares a night, never changes payroll numbers, never touches nightCount.
   2. Night-duty staff must punch OUT and IN once at the machine between
      09:30 PM and 10:15 PM. So a shift-DN day that has a punch in that window
      but is NOT Night=YES means: night-end Out punch missing, requisition not
      raised, or Empress server not synced.
   3. Such days are flagged as a "Night Issue" - a separate kind of issue that
      sits next to "OT Missing" in the Ranking > Requisition list. They carry
      isNightIssue:true so every screen can label them differently from OT.
   4. A day is judged only after it is CLOSED (next day 09:00 Bangladesh time),
      because the night-end Out punch arrives next morning.

   Pure functions, no DOM -> unit-testable from Node (tests/test_night_issues.js).
   ========================================================================== */
(function (root) {
  'use strict';

  var WINDOW_FROM = 21 * 60 + 30;   // 09:30 PM
  var WINDOW_TO = 22 * 60 + 15;     // 10:15 PM
  var LONG_DUTY_HOURS = 15;         // same threshold as scripts/to_json.py
  var MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

  function toMins(t) {
    var m = String(t == null ? '' : t).replace(/[^0-9:]/g, '').match(/^(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }
  function isBlankPunch(t) {
    var s = String(t == null ? '' : t).trim();
    return !s || s === '--:--' || s === '--';
  }
  function elapsedHours(inn, out) {
    var a = toMins(inn), b = toMins(out);
    if (a == null || b == null) return 0;
    return Math.round(((b < a ? 1440 - a + b : b - a) / 60) * 100) / 100;
  }
  function isShiftNight(shift) {
    var s = String(shift || '').toUpperCase();
    return s.indexOf('NIGHT') >= 0 || s === 'DN' || s === 'C';
  }
  function inNightWindow(mins) { return mins != null && mins >= WINDOW_FROM && mins <= WINDOW_TO; }

  /* Day is closed at 09:00 BD time on the next day (same rule as rptIsDayClosed). */
  function isDayClosed(dateStr, nowMs) {
    var m = String(dateStr || '').trim().toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{4})/);
    if (!m || !MONTHS[m[2]]) return true; // unknown format -> do not hide a real problem
    var closeUtc = Date.UTC(+m[3], MONTHS[m[2]] - 1, +m[1] + 1, 9, 0, 0) - 6 * 3600 * 1000;
    var now = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
    return now >= closeUtc;
  }

  /* Classify ONE not-YES day. Returns {kind, reason, fix} or null when it looks normal. */
  function classifyDay(row) {
    var shift = row.shift, inn = row.in, out = row.out;
    var tOut = toMins(out), tIn = toMins(inn);
    var el = (row.elapsed != null && isFinite(row.elapsed)) ? Number(row.elapsed) : elapsedHours(inn, out);
    var total = Number(row.duty) || 0;

    if (isShiftNight(shift)) {
      if (inNightWindow(tOut)) {
        return {
          kind: 'dn-window',
          reason: 'Shift ' + (shift || 'DN') + ': night punch (09:30-10:15 PM) found, but Empress Night is not YES',
          fix: 'Night-end Out punch missing / Empress not synced / requisition not raised'
        };
      }
      if (isBlankPunch(out) || isBlankPunch(inn)) {
        return {
          kind: 'dn-punch',
          reason: 'Shift ' + (shift || 'DN') + ' but In/Out punch is missing and Night is not YES',
          fix: 'Fix the missing punch, then ERP marks Night = YES'
        };
      }
      return {
        kind: 'dn-flag',
        reason: 'Shift ' + (shift || 'DN') + ' but Night is not marked YES in Empress',
        fix: 'ERP team to mark Night = YES (or correct the shift)'
      };
    }
    if (!isBlankPunch(out) && isBlankPunch(inn) && tOut != null && tOut >= 240 && tOut <= 435) {
      return {
        kind: 'morning-out',
        reason: 'Morning Out punch without In punch (possible night duty), Night is not YES',
        fix: 'Check the previous evening punch and Night flag'
      };
    }
    if (el >= LONG_DUTY_HOURS || total >= LONG_DUTY_HOURS) {
      return {
        kind: 'long-duty',
        reason: 'Very long duty (' + Math.max(el, total).toFixed(1) + 'h) but Night is not marked YES',
        fix: 'Check if this was a night duty; ERP marks Night = YES'
      };
    }
    return null;
  }

  /* Raw suspect rows: prefer the pipeline's nightSuspects, else derive from daily[]. */
  function suspectRows(e) {
    if (Array.isArray(e.nightSuspects)) return e.nightSuspects;
    var out = [];
    (Array.isArray(e.daily) ? e.daily : []).forEach(function (r) {
      if (!Array.isArray(r) || Number(r[10]) === 1) return;
      var duty = (Number(r[4]) || 0) + (Number(r[5]) || 0) + (Number(r[6]) || 0) + (Number(r[7]) || 0) + (Number(r[8]) || 0) + (Number(r[9]) || 0);
      var row = { date: r[0], day: r[1], in: r[2], out: r[3], duty: Math.round(duty * 100) / 100, shift: r[11] };
      if (classifyDay(row)) out.push(row);
    });
    return out;
  }

  /* Night issues of ONE employee-month, in the same item shape as requisitionProblems. */
  function computeEmpNightIssues(e, nowMs) {
    if (!e || e.isMultiMonth) return [];
    var res = [];
    suspectRows(e).forEach(function (s) {
      if (!s || !isDayClosed(s.date, nowMs)) return;
      var c = classifyDay(s);
      if (!c) return;
      res.push({
        date: String(s.date || '').toUpperCase(),
        day: s.day || '',
        in: s.in || '',
        out: s.out || '',
        duty: s.duty,
        elapsed: s.elapsed != null ? s.elapsed : elapsedHours(s.in, s.out),
        isNight: false,
        isNightIssue: true,
        kind: c.kind,
        expectedOt: 'Night = YES needed',
        reason: c.reason,
        fix: c.fix
      });
    });
    return res;
  }

  /* Merge OT-missing items + night issues. One row per date: if a day has both, the
     Night Issue wins (it is the root cause) and the OT hint is kept in the text. */
  function mergeRequisitionAndNight(otList, nightList) {
    var ot = (Array.isArray(otList) ? otList : []).filter(function (p) { return p && !p.isNightIssue; });
    if (!nightList || !nightList.length) return ot;
    var byDate = {};
    nightList.forEach(function (n) { byDate[n.date] = n; });
    var kept = ot.filter(function (p) {
      var n = byDate[String(p.date || '').toUpperCase()];
      if (n) { n.reason += ' (also: ' + (p.reason || p.expectedOt || 'OT missing') + ')'; return false; }
      return true;
    });
    return kept.concat(nightList);
  }

  function splitIssues(list) {
    var arr = Array.isArray(list) ? list : [];
    return {
      ot: arr.filter(function (p) { return !(p && p.isNightIssue); }),
      night: arr.filter(function (p) { return p && p.isNightIssue; })
    };
  }

  var api = {
    WINDOW_FROM: WINDOW_FROM, WINDOW_TO: WINDOW_TO,
    toMins: toMins, isDayClosed: isDayClosed, classifyDay: classifyDay,
    computeEmpNightIssues: computeEmpNightIssues,
    mergeRequisitionAndNight: mergeRequisitionAndNight,
    splitIssues: splitIssues
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.computeEmpNightIssues = computeEmpNightIssues;
    root.mergeRequisitionAndNight = mergeRequisitionAndNight;
    root.splitRequisitionIssues = splitIssues;
    root.NightIssues = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
