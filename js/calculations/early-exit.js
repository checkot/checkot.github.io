/* ==========================================================================
   EARLY-EXIT.JS - Early Exit / Gate Pass detection (In-Charge & Admin only)
   --------------------------------------------------------------------------
   A day counts as an Early Exit when ALL of these are true:
     - regular duty row (daily[4] > 0), not a Day-Off / Holiday duty row
     - not a night / DN shift, no OT booked that day
     - both In and Out punches exist (missing punches are Punch Problems)
     - Out punch is earlier than (shift end - grace minutes) for THAT date

   Shift end for a date comes from shift-rules.json (Admin -> Shift Hours):
     default  : normal duty hours (08:00 - 16:30, grace 10 min)
     periods[]: date ranges with their own hours (e.g. Ramadan 08:00 - 14:15)
   Rules are looked up per DATE (not per month), so Ramadan can start in
   February and end in March, and past months always keep their own rules.

   Public API (all on window):
     SHIFT_RULES, getShiftRules(), setShiftRules(obj), loadShiftRules(force)
     shiftRuleForDate('DD-MMM-YYYY', dept)  -> { start, end, graceMin, label, special }
     computeEmpEarlyExits(emp)              -> [ {date,day,in,out,shiftEnd,shortMin,...} ]
     getEarlyExitCount(emp)                 -> number
     suggestShiftPeriods(employeeLists)     -> proposed periods (for the Admin panel)
     isEarlyExitAllowedView()               -> true only for In-Charge / Admin
   ========================================================================== */
(function () {
  'use strict';

  var MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

  /* Built-in fallback: used when shift-rules.json is missing / offline.
     Ramadan 2026 values were measured from the Feb-Mar 2026 punch data
     (median Out 14:18 from 19 Feb to 16 Mar, normal again from 23 Mar). */
  var BUILTIN_RULES = {
    version: 1,
    default: { start: '08:00', end: '16:30', graceMin: 30 },
    allowedShiftCodes: ['G'],
    periods: [
      { id: 'ramadan-2026', label: 'Ramadan 2026', from: '2026-02-19', to: '2026-03-19', start: '08:00', end: '14:15', graceMin: 30, depts: [] }
    ]
  };

  var _rules = null;
  var _ver = 1;          // bumped whenever rules change; invalidates cached per-employee results
  var LS_KEY = 'rppf_shift_rules_v1';

  function lsKey() {
    var ns = '';
    try { if (typeof STORAGE_NAMESPACE !== 'undefined' && STORAGE_NAMESPACE != null) ns = STORAGE_NAMESPACE; } catch (e) { }
    return ns + LS_KEY;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- time helpers ---------- */
  function hmToMin(s) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(s == null ? '' : s).trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 29 || mi > 59) return null;
    return h * 60 + mi;
  }
  function minToHm(v) {
    v = Math.max(0, Math.round(v));
    return ('0' + Math.floor(v / 60)).slice(-2) + ':' + ('0' + (v % 60)).slice(-2);
  }
  function dateToIso(dstr) {            // '19-FEB-2026' -> '2026-02-19'
    var m = /^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{4})$/.exec(String(dstr || '').trim());
    if (!m) return '';
    var mo = MONTHS[m[2].toUpperCase()];
    if (!mo) return '';
    return m[3] + '-' + ('0' + mo).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }

  /* ---------- rules: normalise / get / set ---------- */
  function normalizeRules(raw) {
    var base = clone(BUILTIN_RULES);
    if (!raw || typeof raw !== 'object') return base;
    var d = raw.default || {};
    var out = {
      version: 1,
      default: {
        start: hmToMin(d.start) != null ? minToHm(hmToMin(d.start)) : base.default.start,
        end: hmToMin(d.end) != null ? minToHm(hmToMin(d.end)) : base.default.end,
        graceMin: isFinite(+d.graceMin) && +d.graceMin >= 0 ? Math.round(+d.graceMin) : base.default.graceMin
      },
      allowedShiftCodes: Array.isArray(raw.allowedShiftCodes) && raw.allowedShiftCodes.length
        ? raw.allowedShiftCodes.map(function (s) { return String(s).toUpperCase(); }) : base.allowedShiftCodes,
      periods: []
    };
    (Array.isArray(raw.periods) ? raw.periods : []).forEach(function (p, i) {
      if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(p.to || '')) return;
      if (hmToMin(p.end) == null) return;
      if (p.to < p.from) return;
      out.periods.push({
        id: String(p.id || ('period-' + (i + 1))),
        label: String(p.label || 'Special shift'),
        from: p.from, to: p.to,
        start: hmToMin(p.start) != null ? minToHm(hmToMin(p.start)) : out.default.start,
        end: minToHm(hmToMin(p.end)),
        graceMin: isFinite(+p.graceMin) && +p.graceMin >= 0 ? Math.round(+p.graceMin) : out.default.graceMin,
        depts: Array.isArray(p.depts) ? p.depts.map(function (s) { return String(s).toUpperCase(); }) : []
      });
    });
    return out;
  }

  function getShiftRules() {
    if (!_rules) {
      var fromLs = null;
      try { var raw = localStorage.getItem(lsKey()); if (raw) fromLs = JSON.parse(raw); } catch (e) { }
      _rules = normalizeRules(fromLs);
    }
    return _rules;
  }
  function setShiftRules(obj, opts) {
    _rules = normalizeRules(obj);
    _ver++;
    window.SHIFT_RULES = _rules;
    if (!opts || opts.persist !== false) {
      try { localStorage.setItem(lsKey(), JSON.stringify(_rules)); } catch (e) { }
    }
    return _rules;
  }

  /* Fetch shift-rules.json (no-store). Falls back silently to the saved / built-in rules. */
  function loadShiftRules(force) {
    var run = function () {
      var p;
      if (typeof fetchJsonResource === 'function') p = fetchJsonResource('shift-rules.json', 6000);
      else p = fetch('shift-rules.json?ts=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      return Promise.resolve(p).then(function (json) {
        var before = JSON.stringify(getShiftRules());
        var next = normalizeRules(json);
        if (JSON.stringify(next) !== before || force) {
          setShiftRules(json);
          try { if (typeof iccDrillOpen !== 'undefined' && iccDrillOpen && typeof renderIccDrillList === 'function') renderIccDrillList(); } catch (e) { }
          try { window.dispatchEvent(new CustomEvent('shiftrules:changed')); } catch (e) { }
        }
        return true;
      }).catch(function () { return false; });
    };
    return run();
  }

  /* ---------- rule lookup for one date ---------- */
  function shiftRuleForDate(dateStr, dept) {
    var rules = getShiftRules();
    var iso = dateToIso(dateStr);
    var dp = String(dept || '').toUpperCase();
    var hit = null;
    if (iso) {
      for (var i = 0; i < rules.periods.length; i++) {
        var p = rules.periods[i];
        if (iso < p.from || iso > p.to) continue;
        if (p.depts.length && dp && p.depts.indexOf(dp) < 0) continue;
        hit = p;            // later periods override earlier ones
      }
    }
    if (hit) return { start: hit.start, end: hit.end, graceMin: hit.graceMin, label: hit.label, special: true };
    return { start: rules.default.start, end: rules.default.end, graceMin: rules.default.graceMin, label: '', special: false };
  }

  function empDept(emp) {
    var d = emp && emp.dept;
    if (!d) { try { if (typeof getClientDepartment === 'function') d = getClientDepartment(); } catch (e) { } }
    return String(d || 'PR').toUpperCase();
  }

  /* ---------- detection ---------- */
  function computeEmpEarlyExits(emp) {
    var out = [];
    if (!emp || !Array.isArray(emp.daily)) return out;
    var rules = getShiftRules();
    var dept = empDept(emp);
    var allowed = rules.allowedShiftCodes;
    emp.daily.forEach(function (r) {
      if (!Array.isArray(r)) return;
      var regDuty = Number(r[4]) || 0;
      var regOt = Number(r[5]) || 0;
      if (regDuty <= 0 || regOt > 0) return;                       // regular duty day without OT only
      if ((Number(r[6]) || 0) > 0 || (Number(r[8]) || 0) > 0) return; // Day-Off / Holiday duty rows
      if (Number(r[10]) === 1) return;                              // night flag
      var code = String(r[11] == null ? '' : r[11]).toUpperCase();
      if (code && allowed.indexOf(code) < 0) return;                // DN / other shift codes
      var tin = hmToMin(r[2]), tout = hmToMin(r[3]);
      if (tin == null || tout == null) return;                      // missing punch = Punch Problem, not Early Exit
      if (tout < tin) return;                                       // crossed midnight
      var rule = shiftRuleForDate(r[0], dept);
      var endMin = hmToMin(rule.end);
      if (tin >= endMin) return;                                    // arrived after shift end: not an early exit
      if (tout < endMin - rule.graceMin) {
        out.push({
          date: String(r[0] || '').toUpperCase(), day: r[1] || '',
          in: r[2], out: r[3], shiftEnd: rule.end,
          shortMin: endMin - tout, duty: regDuty,
          period: rule.special ? rule.label : ''
        });
      }
    });
    return out;
  }

  /* Count with per-employee cache. Multi-month merged people carry their own merged
     `earlyExits` array (set when months are combined) and are never recomputed. */
  function getEarlyExitCount(emp) {
    if (!emp) return 0;
    if (emp.isMultiMonth && Array.isArray(emp.earlyExits)) return emp.earlyExits.length;
    if (Array.isArray(emp.earlyExits) && emp._eeVer === _ver) return emp.earlyExits.length;
    var list = computeEmpEarlyExits(emp);
    try { emp.earlyExits = list; emp._eeVer = _ver; } catch (e) { }
    return list.length;
  }

  function isEarlyExitAllowedView() {
    try { if (typeof getAppMode === 'function' && getAppMode() === 'incharge') return true; } catch (e) { }
    try { if (typeof isAdminLoggedIn === 'function' && isAdminLoggedIn()) return true; } catch (e) { }
    return false;
  }

  /* ---------- Admin helper: propose special-shift periods from real punch data ----------
     lists: array of employee arrays (one per loaded month). Looks at the median Out time of
     regular, no-OT, day-shift rows for every date. A run of dates whose median Out is far from
     the normal shift end becomes a proposed period. Dates with too few people (Eid, holidays)
     are skipped and do not break a run. */
  function suggestShiftPeriods(lists) {
    var rules = getShiftRules();
    var normalEnd = hmToMin(rules.default.end);
    var byDate = {};
    (lists || []).forEach(function (list) {
      (list || []).forEach(function (e) {
        (e && e.daily || []).forEach(function (r) {
          if (!Array.isArray(r) || (Number(r[4]) || 0) <= 0 || (Number(r[5]) || 0) > 0) return;
          if (Number(r[10]) === 1) return;
          var code = String(r[11] == null ? '' : r[11]).toUpperCase();
          if (code && rules.allowedShiftCodes.indexOf(code) < 0) return;
          var tin = hmToMin(r[2]), tout = hmToMin(r[3]);
          if (tin == null || tout == null || tout < tin || tout < 12 * 60 || tout > 18 * 60 + 30) return;
          var iso = dateToIso(r[0]);
          if (!iso) return;
          (byDate[iso] = byDate[iso] || []).push(tout);
        });
      });
    });
    var days = Object.keys(byDate).sort().filter(function (d) { return byDate[d].length >= 30; }).map(function (d) {
      var a = byDate[d].sort(function (x, y) { return x - y; });
      return { iso: d, n: a.length, med: a[Math.floor(a.length / 2)] };
    });
    var runs = [], cur = null;
    days.forEach(function (d) {
      var special = Math.abs(d.med - normalEnd) > 45;
      if (special) {
        // different special end time (> 30 min apart) starts a new run
        if (cur && Math.abs(cur.medSum / cur.count - d.med) <= 30 && daysBetween(cur.to, d.iso) <= 10) {
          cur.to = d.iso; cur.medSum += d.med; cur.count++;
        } else {
          if (cur) runs.push(cur);
          cur = { from: d.iso, to: d.iso, medSum: d.med, count: 1 };
        }
      }
    });
    if (cur) runs.push(cur);
    var proposed = runs.filter(function (r) { return r.count >= 3; }).map(function (r, i) {
      var med = r.medSum / r.count;
      return { id: 'suggested-' + (i + 1), label: 'Special shift', from: r.from, to: r.to,
        start: rules.default.start, end: minToHm(Math.floor(med / 5) * 5), graceMin: rules.default.graceMin, depts: [],
        evidence: 'Median Out ' + minToHm(med) + ' on ' + r.count + ' working days' };
    });

    /* Pass 2: single "mass early release" days (e.g. the day before Eid). On such a day a big
       share of ALL people leave before the effective shift end, which is a plant decision, not
       hundreds of personal gate passes. Proposed as one-day periods, appended last (later wins). */
    var grace = rules.default.graceMin;
    days.forEach(function (d) {
      var eff = normalEnd, inRun = null;
      proposed.forEach(function (p) { if (d.iso >= p.from && d.iso <= p.to) inRun = p; });
      if (inRun) eff = hmToMin(inRun.end);
      var arr = byDate[d.iso];
      var early = arr.filter(function (v) { return v < eff - grace; });
      if (early.length / arr.length >= 0.12 && early.length >= 25) {
        early.sort(function (x, y) { return x - y; });
        // densest 20-minute window of exits = the release time; propose its start as the shift end
        var bestA = early[0], bestN = 0, j = 0;
        for (var i = 0; i < early.length; i++) {
          while (early[i] - early[j] > 20) j++;
          if (i - j + 1 > bestN) { bestN = i - j + 1; bestA = early[j]; }
        }
        proposed.push({ id: 'suggested-day-' + d.iso, label: 'Early release day', from: d.iso, to: d.iso,
          start: rules.default.start, end: minToHm(Math.floor(bestA / 5) * 5), graceMin: grace, depts: [],
          evidence: bestN + ' people left together around ' + minToHm(bestA) + ' (' + early.length + ' of ' + arr.length + ' left before ' + minToHm(eff - grace) + ') - plant-wide early release?' });
      }
    });
    return proposed;
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

  /* ---------- exports ---------- */
  window.SHIFT_RULES = getShiftRules();
  window.getShiftRules = getShiftRules;
  window.setShiftRules = setShiftRules;
  window.loadShiftRules = loadShiftRules;
  window.normalizeShiftRules = normalizeRules;
  window.shiftRuleForDate = shiftRuleForDate;
  window.computeEmpEarlyExits = computeEmpEarlyExits;
  window.getEarlyExitCount = getEarlyExitCount;
  window.suggestShiftPeriods = suggestShiftPeriods;
  window.isEarlyExitAllowedView = isEarlyExitAllowedView;
  window.BUILTIN_SHIFT_RULES = BUILTIN_RULES;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { loadShiftRules(false); });
  else setTimeout(function () { loadShiftRules(false); }, 0);
})();
