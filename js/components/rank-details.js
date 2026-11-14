/* ==========================================================================
   RANKING DETAILS ENGINE (context-aware "See Details")
   --------------------------------------------------------------------------
   Shared by index.html and admin.html. Depends only on globals that already
   exist in both bundles (esc, monthIndexMemoryCache, getEmpMeta, ...).

   openIccContextModal(empId, crit, month)
     crit  : ranking criterion the user was looking at
             duty | ot | earned | plain | lessDuty | lessOt | punch | absent |
             requisition | nightIssue | holidayReq | earlyExit | avgDuty | avgInOut | night | otDays | holiday
     month : optional 'YYYY-MM' (single-month ranking). Ignored in multi-month
             modes, where the loaded months of the ranking are used.

   Single month  -> that month's data for the topic (dates / days / amounts)
   Multi month   -> period total summary + month-by-month list (each month
                    expandable, with a "View report" shortcut)
   Normal mode   -> footer button opens the payslip / OT calculation
   In-charge     -> footer button opens the monthly work log
   ========================================================================== */
(function () {
  'use strict';

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CRIT_ALIAS = { lessOT: 'lessOt', less_ot: 'lessOt', less_duty: 'lessDuty', avgInTime: 'avgInOut', req: 'requisition', night_issue: 'nightIssue', nightReq: 'nightIssue', holiday_req: 'holidayReq', holidayReq: 'holidayReq', punchFix: 'punch', best_duty: 'duty', best_ot: 'ot' };
  var _ctx = null; // last opened context (used by month "View" buttons)

  /* ---------- tiny safe helpers ---------- */
  function g(name) { try { return (typeof window[name] !== 'undefined') ? window[name] : undefined; } catch (e) { return undefined; } }
  function E(s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r1(v) { return Math.round(num(v) * 10) / 10; }
  function r2(v) { return Math.round(num(v) * 100) / 100; }
  function taka(v) { return '৳ ' + Math.round(num(v)).toLocaleString('en-IN'); }
  function isIncharge() { try { return typeof getAppMode === 'function' && getAppMode() === 'incharge'; } catch (e) { return false; } }
  function normId(id) { var u = String(id == null ? '' : id).toUpperCase(); try { return (typeof resolveEmpAliasId === 'function' && resolveEmpAliasId(id)) || u; } catch (e) { return u; } }
  function sameEmp(a, b) { return a === b || normId(a) === normId(b); }
  function cleanMonth(m) { var x = String(m || '').match(/\d{4}-\d{2}/); return x ? x[0] : ''; }
  function curMonthStr() { try { return (typeof getCurrentMonth === 'function') ? getCurrentMonth() : ''; } catch (e) { return ''; } }
  function monthLabel(m) { var p = String(m).split('-'); return p.length === 2 ? ((MON[parseInt(p[1], 10) - 1] || p[1]) + ' ' + p[0]) : String(m); }
  function areaShort(a) {
    var OA; try { OA = (typeof OVERALL_AREA !== 'undefined') ? OVERALL_AREA : 'Overall'; } catch (e) { OA = 'Overall'; }
    return a === 'Packing Hall' ? 'Packing' : a === 'Solid Production' ? 'Solid' : a === 'Softgel Production' ? 'Softgel' : (OA && a === OA) ? 'Executives' : (a || 'RPPF');
  }
  function lockBody(on) {
    document.body.style.overflow = on ? 'hidden' : '';
    if (!on) { document.body.style.position = ''; document.body.style.width = ''; }
  }

  /* ---------- period & data lookup ---------- */
  function lbResult() { try { return (typeof currentLeaderboardResult !== 'undefined') ? currentLeaderboardResult : null; } catch (e) { return null; } }
  function timeMode() {
    var r = lbResult(), m = 'monthly';
    try { if (typeof currentLbTimeMode !== 'undefined' && currentLbTimeMode) m = currentLbTimeMode; } catch (e) { }
    if (m === 'monthly' && r && r.timeMode && r.timeMode !== 'monthly') m = r.timeMode;
    return m;
  }
  function timeModeName(m) { return m === '3m' ? 'Last 3 Months' : m === '6m' ? 'Last 6 Months' : m === 'ytd' ? 'Year to Date' : m === '1y' ? 'Last 12 Months' : 'All-Time'; }
  function activeCrit() { try { return (typeof activeIccCriterion !== 'undefined' && activeIccCriterion) ? activeIccCriterion : 'duty'; } catch (e) { return 'duty'; } }

  function findInList(list, empId) {
    if (!Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) { if (list[i] && sameEmp(list[i].id, empId)) return list[i]; }
    return null;
  }
  function monthRecord(mStr, empId) {
    var cache = null;
    try { cache = (typeof monthIndexMemoryCache !== 'undefined') ? monthIndexMemoryCache : null; } catch (e) { }
    return cache ? findInList(cache[mStr], empId) : null;
  }
  function findRankedEmp(empId) {
    var r = lbResult(), hit = null;
    if (r) {
      hit = findInList(r.allEmployees, empId);
      if (!hit && r.filtered && Array.isArray(r.filtered._rawFiltered)) hit = findInList(r.filtered._rawFiltered, empId);
    }
    return hit;
  }
  function fallbackEmp(empId) {
    var meta = {}; try { meta = (typeof getEmpMeta === 'function' ? getEmpMeta(empId) : {}) || {}; } catch (e) { }
    var area = 'RPPF'; try { if (typeof getAreaForId === 'function') area = getAreaForId(empId, true); } catch (e) { }
    return { id: empId, name: meta.name || empId, area: area, grade: meta.grade || '', sub: meta.sub || '', totalDuty: 0, otHours: 0, holidayCount: 0, nightCount: 0, plainDaysCount: 0, totalEarned: 0 };
  }

  /* ---------- per-month analysis of one employee ---------- */
  function parseDaily(rec) {
    var out = [];
    var daily = rec && Array.isArray(rec.daily) ? rec.daily : [];
    daily.forEach(function (r) {
      if (!Array.isArray(r) || r.length < 4) return;
      var duty = num(r[4]) + num(r[5]) + num(r[6]) + num(r[7]) + num(r[8]) + num(r[9]);
      var ot = num(r[5]) + num(r[7]) + num(r[9]);
      var base = num(r[4]) + num(r[6]) + num(r[8]);
      var hol = (num(r[8]) + num(r[9])) > 0, off = (num(r[6]) + num(r[7])) > 0;
      var code = String(r[11] || '').toUpperCase();
      var night = num(r[10]) === 1 || code.indexOf('NIGHT') >= 0 || code === 'DN';
      var pm = (typeof isPunchMissing === 'function') ? isPunchMissing : function (v) { return !v || String(v).trim() === '' || v === '--:--'; };
      var inMiss = !!pm(r[2]), outMiss = !!pm(r[3]);
      var type = night ? 'Night' : hol ? 'Holiday' : off ? 'Weekly Off' : 'Regular';
      out.push({
        date: String(r[0] || ''), day: String(r[1] || ''), inn: inMiss ? '--:--' : String(r[2]), out: outMiss ? '--:--' : String(r[3]),
        inMiss: inMiss, outMiss: outMiss, duty: duty, ot: ot, base: base, night: night, hol: hol, off: off, type: type,
        plain: !(inMiss || outMiss) && base > 0 && !night && ot === 0
      });
    });
    return out;
  }
  function fmtShort(mins) { mins = Math.round(num(mins)); var h = Math.floor(mins / 60), m = mins % 60; return (h ? h + 'h ' : '') + (m || !h ? m + 'm' : '').trim(); }
  function hhmmToMins(s) { var m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null; }
  function minsToHHMM(v) { if (v == null) return '—'; var n = ((Math.round(v) % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }

  function analyzeMonth(mStr, rec) {
    var A = { month: mStr, label: monthLabel(mStr), has: !!rec, rec: rec || null,
      days: [], worked: [], otDays: [], otDayList: [], plainDays: [], nightDays: [], holDays: [], punchRows: [], absent: [], req: [], night: [], holiday: [], early: [],
      duty: 0, ot: 0, earned: 0, otAmt: 0, holAmt: 0, nightAmt: 0, avgIn: null, earliestIn: null, latestIn: null, avgPerDay: 0 };
    if (!rec) return A;
    var days = parseDaily(rec);
    A.days = days;
    A.duty = num(rec.totalDuty); A.ot = num(rec.otHours);
    A.earned = num(rec.totalEarned);
    A.otAmt = num(rec.otAmount); A.holAmt = num(rec.holidayAmount); A.nightAmt = num(rec.nightAmount);
    A.holidayCount = num(rec.holidayCount); A.nightCount = num(rec.nightCount);
    A.plainCount = num(rec.plainDaysCount);
    A.worked = days.filter(function (d) { return d.duty > 0; });
    A.otDays = days.filter(function (d) { return d.ot > 0; });
    A.otDayList = days.filter(function (d) { return d.ot > 0 && !d.night; }); // OT Days rule: night days are counted as Nights only
    A.plainDays = days.filter(function (d) { return d.plain; });
    A.nightDays = days.filter(function (d) { return d.night; });
    A.holDays = days.filter(function (d) { return d.hol || d.off; });
    A.punchRows = days.filter(function (d) { return d.inMiss || d.outMiss; }).map(function (d) {
      d.pType = (d.inMiss && d.outMiss) ? 'In & Out Missing' : d.inMiss ? 'In Punch Missing' : 'Out Punch Missing'; return d;
    });
    if (!A.punchRows.length && Array.isArray(rec.punchProblems) && rec.punchProblems.length) {
      A.punchRows = rec.punchProblems.map(function (dt) { return { date: dt, day: '', inn: '--:--', out: '--:--', inMiss: true, outMiss: false, pType: 'Punch Missing' }; });
    }
    // absent
    try {
      var prevSet = (typeof getPrevMonthNightSet === 'function') ? getPrevMonthNightSet(mStr) : new Set();
      var prevHas = prevSet.has(String(rec.id).toUpperCase()) || prevSet.has(normId(rec.id));
      var ab = (typeof computeEmpGeneralAbsents === 'function') ? computeEmpGeneralAbsents(rec, mStr, prevHas) : { dates: rec.generalAbsentDays || [] };
      A.absent = (ab && ab.dates) ? ab.dates.slice() : [];
    } catch (e) { A.absent = Array.isArray(rec.generalAbsentDays) ? rec.generalAbsentDays.slice() : []; }
    // requisition
    try {
      A.req = (typeof computeEmpRequisitionProblems === 'function' && !rec.isMultiMonth) ? computeEmpRequisitionProblems(rec)
        : (Array.isArray(rec.requisitionProblems) ? rec.requisitionProblems : []);
    } catch (e) { A.req = []; }
    // Night Requisition = isNightIssue items; Holiday Requisition = isHolidayReq items; OT Requisition = the rest
    var _sp = (typeof splitRequisitionIssues === 'function') ? splitRequisitionIssues(A.req) : {
      night: A.req.filter(function (p) { return p && p.isNightIssue; }),
      holiday: A.req.filter(function (p) { return p && !p.isNightIssue && p.isHolidayReq; }),
      ot: A.req.filter(function (p) { return !(p && (p.isNightIssue || p.isHolidayReq)); })
    };
    A.night = _sp.night; A.holiday = _sp.holiday; A.req = _sp.ot;
    // early exit / gate pass (In-Charge & Admin only; rules come from shift-rules.json)
    try { A.early = (typeof computeEmpEarlyExits === 'function') ? computeEmpEarlyExits(rec) : []; } catch (e) { A.early = []; }
    // in / out averages
    var ins = [], outs = [];
    A.worked.forEach(function (d) {
      if (!d.inMiss) { var a = hhmmToMins(d.inn); if (a != null) ins.push(a); }
    });
    A.avgIn = ins.length ? ins.reduce(function (s, v) { return s + v; }, 0) / ins.length : null;
    A.earliestIn = ins.length ? Math.min.apply(null, ins) : null;
    A.latestIn = ins.length ? Math.max.apply(null, ins) : null;
    A.avgPerDay = A.worked.length ? A.duty / A.worked.length : 0;
    return A;
  }

  /* ---------- html building blocks ---------- */
  function secTitle(t) { return '<div class="icc-ctx-sec">' + E(t) + '</div>'; }
  function banner(cls, icon, title, sub, badge) {
    return '<div class="icc-ctx-banner ' + cls + '"><div><div class="icc-ctx-banner-title"><span>' + icon + '</span><span>' + title + '</span></div>' +
      '<div class="icc-ctx-banner-sub">' + E(sub) + '</div></div><div><span class="icc-ctx-pill ' + cls + '">' + E(badge) + '</span></div></div>';
  }
  function kpi(label, val, color, accent) {
    return '<div class="icc-ctx-kpi' + (accent ? ' accent' : '') + '"><span class="icc-ctx-kpi-label">' + E(label) + '</span><span class="icc-ctx-kpi-val"' + (color ? ' style="color:' + color + '"' : '') + '>' + val + '</span></div>';
  }
  function grid(items) { return '<div class="icc-ctx-grid">' + items.join('') + '</div>'; }
  function empty(msg) { return '<div class="icc-ctx-empty">' + msg + '</div>'; }
  function table(head, rows) {
    return '<div class="icc-ctx-table-wrap"><table class="icc-ctx-table"><thead><tr>' + head.map(function (h) { return '<th>' + E(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  function chips(list, cls) { return '<div class="icc-ctx-date-grid">' + list.map(function (d) { return '<div class="icc-ctx-date-item ' + (cls || '') + '"><span>📅</span><span>' + E(d) + '</span></div>'; }).join('') + '</div>'; }
  function typeBadge(t) { return '<span class="icc-ctx-tag t-' + String(t).replace(/\s+/g, '').toLowerCase() + '">' + E(t) + '</span>'; }

  /* ---------- topic definitions ----------
     metric(A) -> number for the month bar; fmt -> text; body(A) -> html of that month's list */
  function dayRows(list, withIn) {
    return list.map(function (d) {
      return '<tr><td class="b">' + E(d.date) + '</td><td class="m">' + E(d.day) + '</td>' +
        '<td' + (d.inMiss ? ' class="bad"' : '') + '>' + E(d.inn) + '</td><td' + (d.outMiss ? ' class="bad"' : '') + '>' + E(d.out) + '</td>' +
        '<td class="b">' + r1(d.duty) + 'h</td><td' + (d.ot > 0 ? ' class="warn b"' : ' class="m"') + '>' + (d.ot > 0 ? r1(d.ot) + 'h' : '—') + '</td><td>' + typeBadge(d.type) + '</td></tr>';
    });
  }
  var DAY_HEAD = ['Date', 'Day', 'In', 'Out', 'Duty', 'OT', 'Type'];

  var TOPICS = {
    absent: {
      icon: '🔴', cls: 'absent', color: 'var(--danger)', unit: 'd', title: 'Absent', bannerSub: 'General absent dates (holidays & scheduled off-days excluded)',
      metric: function (A) { return A.absent.length; }, fmt: function (v) { return v + 'd'; },
      body: function (A) { return A.absent.length ? chips(A.absent, 'red') : empty('✓ 100% Attendance — 0 days absent'); },
      total: function (as) { return grid([kpi('Total Absent', sum(as, 'absent', true) + 'd', 'var(--danger)', true), kpi('Months with Absent', as.filter(function (a) { return a.absent.length; }).length + ' / ' + as.length), kpi('Avg / Month', r1(sum(as, 'absent', true) / Math.max(1, as.length)) + 'd'), kpi('Worst Month', worst(as, function (a) { return a.absent.length; }, 'd'))]); },
      single: function (A) { return grid([kpi('Absent Days', A.absent.length + 'd', 'var(--danger)', true), kpi('Worked Days', A.worked.length + 'd'), kpi('Duty', r1(A.duty) + 'h'), kpi('Overtime', r1(A.ot) + 'h')]); },
      listTitle: function (A) { return 'Absent calendar dates (' + A.absent.length + ' days)'; }
    },
    punch: {
      icon: '⚠️', cls: 'punch', color: 'var(--warning)', title: 'Missing Punch', bannerSub: 'Days with a missing In / Out punch (needs ERP punch adjustment)',
      metric: function (A) { return A.punchRows.length; }, fmt: function (v) { return v + 'd'; },
      body: function (A) {
        return A.punchRows.length ? table(['Date', 'Day', 'In', 'Out', 'Problem'], A.punchRows.map(function (p) {
          return '<tr><td class="b">' + E(p.date) + '</td><td class="m">' + E(p.day) + '</td><td' + (p.inMiss ? ' class="bad b"' : '') + '>' + E(p.inn) + '</td><td' + (p.outMiss ? ' class="bad b"' : '') + '>' + E(p.out) + '</td><td><span class="icc-ctx-tag t-bad">' + E(p.pType) + '</span></td></tr>';
        })) : empty('✓ All punches OK');
      },
      total: function (as) { return grid([kpi('Total Missing', sum(as, 'punchRows', true) + 'd', 'var(--warning)', true), kpi('Months Affected', as.filter(function (a) { return a.punchRows.length; }).length + ' / ' + as.length), kpi('Worst Month', worst(as, function (a) { return a.punchRows.length; }, 'd'))]); },
      single: function (A) { return grid([kpi('Missing Punch', A.punchRows.length + 'd', 'var(--warning)', true), kpi('In Missing', A.punchRows.filter(function (p) { return p.inMiss; }).length + 'd'), kpi('Out Missing', A.punchRows.filter(function (p) { return p.outMiss; }).length + 'd'), kpi('Worked Days', A.worked.length + 'd')]); },
      listTitle: function (A) { return 'Missing punch records (' + A.punchRows.length + ' days)'; }
    },
    requisition: {
      icon: '📋', cls: 'req', color: 'var(--warning)', title: 'OT Requisition', bannerSub: 'Worked beyond duty hours but Empress shows 0 OT — requisition pending',
      metric: function (A) { return A.req.length; }, fmt: function (v) { return v + 'd'; },
      body: function (A) {
        return A.req.length ? table(['Date', 'In – Out', 'Duty', 'Expected OT', 'Reason'], A.req.map(function (p) {
          return '<tr><td class="b">' + E(p.date) + '</td><td>' + E(p.in) + ' – ' + E(p.out) + '</td><td>' + E(p.duty != null ? p.duty : p.elapsed) + 'h</td><td class="warn b">' + E(p.expectedOt) + '</td><td class="m s">' + E(p.reason || 'Pending Requisition') + (p.fix ? '<br><i>' + E(p.fix) + '</i>' : '') + '</td></tr>';
        })) : empty('✓ No pending OT requisition');
      },
      total: function (as) { return grid([kpi('Total Pending', sum(as, 'req', true) + 'd', 'var(--warning)', true), kpi('Months Affected', as.filter(function (a) { return a.req.length; }).length + ' / ' + as.length), kpi('Worst Month', worst(as, function (a) { return a.req.length; }, 'd'))]); },
      single: function (A) { return grid([kpi('Pending Days', A.req.length + 'd', 'var(--warning)', true), kpi('Overtime (paid)', r1(A.ot) + 'h'), kpi('Duty', r1(A.duty) + 'h')]); },
      listTitle: function (A) { return 'Pending requisition dates (' + A.req.length + ' days)'; }
    },
    nightIssue: {
      icon: '🌙', cls: 'req', color: '#4f46e5', title: 'Night Requisition', bannerSub: 'DN shift / night punch (09:30–10:15 PM) found but Empress Night is not YES — never counted as a night until ERP marks Night = YES',
      metric: function (A) { return A.night.length; }, fmt: function (v) { return v + 'd'; },
      body: function (A) {
        return A.night.length ? table(['Date', 'In – Out', 'Duty', 'Reason', 'Fix'], A.night.map(function (p) {
          return '<tr><td class="b">' + E(p.date) + '</td><td>' + E(p.in) + ' – ' + E(p.out) + '</td><td>' + E(p.duty != null ? p.duty : p.elapsed) + 'h</td><td class="m s"><b style="color:#4f46e5">🌙 Night Issue:</b> ' + E(p.reason || 'Night not YES') + '</td><td class="m s">' + (p.fix ? '<i>' + E(p.fix) + '</i>' : '—') + '</td></tr>';
        })) : empty('✓ No night requisition problem');
      },
      total: function (as) { return grid([kpi('Total Night Issues', sum(as, 'night', true) + 'd', '#4f46e5', true), kpi('Months Affected', as.filter(function (a) { return a.night.length; }).length + ' / ' + as.length), kpi('Worst Month', worst(as, function (a) { return a.night.length; }, 'd'))]); },
      single: function (A) { return grid([kpi('🌙 Night Issue', A.night.length + 'd', '#4f46e5', true), kpi('Nights (paid)', num(A.nightCount) + 'n'), kpi('Duty', r1(A.duty) + 'h')]); },
      listTitle: function (A) { return 'Night issue dates (' + A.night.length + ' days)'; }
    },
    holidayReq: {
      icon: '🏖️', cls: 'req', color: '#0f766e', title: 'Holiday Requisition', bannerSub: 'Worked on a Govt holiday or weekly off (Thu / Fri) but Empress booked it as Regular duty — holiday allowance / Day-Off duty missing',
      metric: function (A) { return A.holiday.length; }, fmt: function (v) { return v + 'd'; },
      body: function (A) {
        return A.holiday.length ? table(['Date', 'Day', 'In – Out', 'Duty', 'Type', 'Reason'], A.holiday.map(function (p) {
          var typ = p.kind === 'weekend-do' ? 'Weekend DO' : 'Govt holiday';
          return '<tr><td class="b">' + E(p.date) + '</td><td class="m">' + E(p.day || '') + '</td><td>' + E(p.in) + ' – ' + E(p.out) + '</td><td>' + E(p.duty != null ? p.duty : p.elapsed) + 'h</td><td><span class="icc-ctx-tag t-bad">' + E(typ) + '</span></td><td class="m s">' + E(p.reason || 'Holiday requisition missing') + '</td></tr>';
        })) : empty('✓ No holiday requisition problem');
      },
      total: function (as) { return grid([kpi('Total Holiday Issues', sum(as, 'holiday', true) + 'd', '#0f766e', true), kpi('Months Affected', as.filter(function (a) { return a.holiday.length; }).length + ' / ' + as.length), kpi('Worst Month', worst(as, function (a) { return a.holiday.length; }, 'd'))]); },
      single: function (A) { return grid([kpi('🏖️ Holiday Issue', A.holiday.length + 'd', '#0f766e', true), kpi('Govt holiday', A.holiday.filter(function (p) { return p.kind !== 'weekend-do'; }).length + 'd'), kpi('Weekend DO', A.holiday.filter(function (p) { return p.kind === 'weekend-do'; }).length + 'd'), kpi('Duty', r1(A.duty) + 'h')]); },
      listTitle: function (A) { return 'Holiday requisition dates (' + A.holiday.length + ' days)'; }
    },
    earlyExit: {
      icon: '🚪', cls: 'req', color: 'var(--warning)', title: 'Gate Pass / Early Exit', bannerSub: 'Regular days when the Out punch is before the shift end (Admin → Shift Hours decides the shift end for each date)',
      metric: function (A) { return A.early.length; }, fmt: function (v) { return v + 'd'; },
      body: function (A) {
        return A.early.length ? table(['Date', 'Day', 'In – Out', 'Shift end', 'Left early by'], A.early.map(function (x) {
          return '<tr><td class="b">' + E(x.date) + '</td><td class="m">' + E(x.day) + '</td><td>' + E(x.in) + ' – <b>' + E(x.out) + '</b></td><td class="m">' + E(x.shiftEnd) + (x.period ? ' <span class="icc-ctx-tag t-bad" style="font-size:9px;">' + E(x.period) + '</span>' : '') + '</td><td class="warn b">' + E(fmtShort(x.shortMin)) + '</td></tr>';
        })) : empty('✓ No early exit this period');
      },
      total: function (as) { return grid([kpi('Total Early Exits', sum(as, 'early', true) + 'd', 'var(--warning)', true), kpi('Months Affected', as.filter(function (a) { return a.early.length; }).length + ' / ' + as.length), kpi('Worst Month', worst(as, function (a) { return a.early.length; }, 'd'))]); },
      single: function (A) {
        var mx = A.early.reduce(function (m, x) { return Math.max(m, x.shortMin); }, 0);
        return grid([kpi('Early Exits', A.early.length + 'd', 'var(--warning)', true), kpi('Worked Days', A.worked.length + 'd'), kpi('Longest Short', A.early.length ? fmtShort(mx) : '—'), kpi('Duty', r1(A.duty) + 'h')]);
      },
      listTitle: function (A) { return 'Early exit dates (' + A.early.length + ' days)'; }
    },
    ot: {
      icon: '⏱️', cls: 'duty', color: 'var(--brand-text)', title: 'Overtime', bannerSub: 'Days on which overtime was recorded',
      metric: function (A) { return A.ot; }, fmt: function (v) { return r1(v) + 'h'; },
      body: function (A) { return A.otDays.length ? table(DAY_HEAD, dayRows(A.otDays)) : empty('No overtime recorded'); },
      total: function (as) {
        var t = sum(as, 'ot'), d = sumLen(as, 'otDays');
        return grid([kpi('Total OT', r1(t) + 'h', 'var(--brand-text)', true), kpi('Days with OT hrs', d + 'd'), kpi('Avg OT / Month', r1(t / Math.max(1, countHas(as))) + 'h'), kpi('Peak Month', best(as, function (a) { return a.ot; }, 'h'))]);
      },
      single: function (A) {
        var mx = A.otDays.reduce(function (m, d) { return Math.max(m, d.ot); }, 0);
        return grid([kpi('Total OT', r1(A.ot) + 'h', 'var(--brand-text)', true), kpi('Days with OT hrs', A.otDays.length + 'd'), kpi('Avg / OT Day', A.otDays.length ? r1(A.ot / A.otDays.length) + 'h' : '—'), kpi('Longest OT', r1(mx) + 'h')]);
      },
      listTitle: function (A) { return 'Overtime days (' + A.otDays.length + ')'; }
    },
    duty: {
      icon: '🕐', cls: 'duty', color: 'var(--brand-text)', title: 'Duty Hours', bannerSub: 'Day-by-day duty log',
      metric: function (A) { return A.duty; }, fmt: function (v) { return r1(v) + 'h'; },
      body: function (A) { return A.worked.length ? table(DAY_HEAD, dayRows(A.worked)) : empty('No duty recorded'); },
      total: function (as) {
        var t = sum(as, 'duty'), d = sumLen(as, 'worked');
        return grid([kpi('Total Duty', r1(t) + 'h', 'var(--brand-text)', true), kpi('Days Worked', d + 'd'), kpi('Avg / Day', d ? r1(t / d) + 'h' : '—'), kpi('Peak Month', best(as, function (a) { return a.duty; }, 'h'))]);
      },
      single: function (A) {
        var mx = A.worked.reduce(function (m, d) { return Math.max(m, d.duty); }, 0);
        return grid([kpi('Total Duty', r1(A.duty) + 'h', 'var(--brand-text)', true), kpi('Days Worked', A.worked.length + 'd'), kpi('Avg / Day', A.worked.length ? r1(A.duty / A.worked.length) + 'h' : '—'), kpi('Longest Day', r1(mx) + 'h')]);
      },
      listTitle: function (A) { return 'Daily duty log (' + A.worked.length + ' days)'; }
    },
    plain: {
      icon: '🕓', cls: 'duty', color: 'var(--brand-text)', title: '4:30 pm Regular Days', bannerSub: 'Regular days finished on time — no OT, no night, no punch problem',
      metric: function (A) { return A.plainDays.length; }, fmt: function (v) { return v + 'd'; },
      body: function (A) {
        return A.plainDays.length ? table(['Date', 'Day', 'In', 'Out', 'Duty'], A.plainDays.map(function (d) {
          return '<tr><td class="b">' + E(d.date) + '</td><td class="m">' + E(d.day) + '</td><td>' + E(d.inn) + '</td><td>' + E(d.out) + '</td><td class="b">' + r1(d.duty) + 'h</td></tr>';
        })) : empty('No 4:30 pm days');
      },
      total: function (as) { return grid([kpi('4:30pm Days', sumLen(as, 'plainDays') + 'd', 'var(--brand-text)', true), kpi('Worked Days', sumLen(as, 'worked') + 'd'), kpi('Total OT', r1(sum(as, 'ot')) + 'h'), kpi('Peak Month', best(as, function (a) { return a.plainDays.length; }, 'd'))]); },
      single: function (A) { return grid([kpi('4:30pm Days', A.plainDays.length + 'd', 'var(--brand-text)', true), kpi('Worked Days', A.worked.length + 'd'), kpi('OT Days', A.otDays.length + 'd'), kpi('Night Shifts', A.nightDays.length + 'n')]); },
      listTitle: function (A) { return '4:30 pm days (' + A.plainDays.length + ')'; }
    },
    earned: {
      icon: '💰', cls: 'duty', color: 'var(--brand-text)', title: 'Earnings', bannerSub: 'Where the earning came from — OT, holiday / weekly-off and night duty', money: true,
      metric: function (A) { return A.earned; }, fmt: function (v) { return taka(v); },
      body: function (A) {
        var parts = '<div class="icc-ctx-split">' +
          '<div><span>OT</span><b>' + taka(A.otAmt) + '</b></div><div><span>Holiday / Off</span><b>' + taka(A.holAmt) + '</b></div><div><span>Night</span><b>' + taka(A.nightAmt) + '</b></div></div>';
        if (A.holDays.length) parts += secTitle('Holiday / weekly-off duty (' + A.holDays.length + ' days)') + table(['Date', 'Day', 'Duty', 'OT'], A.holDays.map(function (d) { return '<tr><td class="b">' + E(d.date) + '</td><td class="m">' + E(d.day) + '</td><td>' + r1(d.duty) + 'h</td><td>' + (d.ot ? r1(d.ot) + 'h' : '—') + '</td></tr>'; }));
        if (A.nightDays.length) parts += secTitle('Night shifts (' + A.nightDays.length + ')') + chips(A.nightDays.map(function (d) { return d.date + (d.day ? ' (' + d.day + ')' : ''); }));
        return parts;
      },
      total: function (as) { return grid([kpi('Total Earned', taka(sum(as, 'earned')), 'var(--brand-text)', true), kpi('OT', taka(sum(as, 'otAmt'))), kpi('Holiday / Off', taka(sum(as, 'holAmt'))), kpi('Night', taka(sum(as, 'nightAmt'))), kpi('Avg / Month', taka(sum(as, 'earned') / Math.max(1, countHas(as))))]); },
      single: function (A) { return grid([kpi('Total Earned', taka(A.earned), 'var(--brand-text)', true), kpi('OT', taka(A.otAmt)), kpi('Holiday / Off', taka(A.holAmt)), kpi('Night', taka(A.nightAmt))]); },
      listTitle: function (A) { return 'Earning breakdown'; }
    },
    otDays: {
      icon: '📆', cls: 'duty', color: 'var(--brand-text)', title: 'OT Days', bannerSub: 'Days with overtime. Night-duty days count as Nights only; holiday OT counts here too.',
      metric: function (A) { return A.otDayList.length; }, fmt: function (v) { return v + 'd'; },
      body: function (A) { return A.otDayList.length ? table(DAY_HEAD, dayRows(A.otDayList)) : empty('No overtime days'); },
      total: function (as) {
        var d = sumLen(as, 'otDayList'), h = as.reduce(function (s, a) { return s + (a.has ? a.otDayList.reduce(function (x, y) { return x + y.ot; }, 0) : 0); }, 0);
        return grid([kpi('OT Days', d + 'd', 'var(--brand-text)', true), kpi('OT hrs on these days', r1(h) + 'h'), kpi('Avg OT / OT Day', d ? r1(h / d) + 'h' : '—'), kpi('Peak Month', best(as, function (a) { return a.otDayList.length; }, 'd'))]);
      },
      single: function (A) {
        var h = A.otDayList.reduce(function (x, y) { return x + y.ot; }, 0);
        return grid([kpi('OT Days', A.otDayList.length + 'd', 'var(--brand-text)', true), kpi('OT hrs on these days', r1(h) + 'h'), kpi('Of which holiday', A.otDayList.filter(function (d) { return d.hol || d.off; }).length + 'd'), kpi('Night Shifts', A.nightDays.length + 'n')]);
      },
      listTitle: function (A) { return 'Overtime days (' + A.otDayList.length + ')'; }
    },
    holiday: {
      icon: '🏖️', cls: 'duty', color: 'var(--brand-text)', title: 'Holiday Duty', bannerSub: 'Days worked on a holiday / weekly day-off (OT done on these days also counts under OT Days)',
      metric: function (A) { return A.holDays.length; }, fmt: function (v) { return v + 'd'; },
      body: function (A) { return A.holDays.length ? table(DAY_HEAD, dayRows(A.holDays)) : empty('No holiday duty'); },
      total: function (as) {
        var d = sumLen(as, 'holDays'), withOt = as.reduce(function (s, a) { return s + (a.has ? a.holDays.filter(function (x) { return x.ot > 0; }).length : 0); }, 0);
        return grid([kpi('Holiday Duty', d + 'd', 'var(--brand-text)', true), kpi('With OT', withOt + 'd'), kpi('Peak Month', best(as, function (a) { return a.holDays.length; }, 'd'))]);
      },
      single: function (A) { return grid([kpi('Holiday Duty', A.holDays.length + 'd', 'var(--brand-text)', true), kpi('With OT', A.holDays.filter(function (x) { return x.ot > 0; }).length + 'd'), kpi('Holiday hrs', r1(A.holDays.reduce(function (x, y) { return x + y.duty; }, 0)) + 'h'), kpi('Night Shifts', A.nightDays.length + 'n')]); },
      listTitle: function (A) { return 'Holiday / day-off duty (' + A.holDays.length + ' days)'; }
    },
    night: {      icon: '🌙', cls: 'duty', color: 'var(--brand-text)', title: 'Night Shifts', bannerSub: 'Dates of night shifts',
      metric: function (A) { return A.nightDays.length; }, fmt: function (v) { return v + 'n'; },
      body: function (A) {
        return A.nightDays.length ? table(['Date', 'Day', 'In', 'Out', 'Duty', 'OT'], A.nightDays.map(function (d) {
          return '<tr><td class="b">' + E(d.date) + '</td><td class="m">' + E(d.day) + '</td><td>' + E(d.inn) + '</td><td>' + E(d.out) + '</td><td>' + r1(d.duty) + 'h</td><td>' + (d.ot ? r1(d.ot) + 'h' : '—') + '</td></tr>';
        })) : empty('No night shifts');
      },
      total: function (as) { return grid([kpi('Night Shifts', sumLen(as, 'nightDays') + 'n', 'var(--brand-text)', true), kpi('Peak Month', best(as, function (a) { return a.nightDays.length; }, 'n'))]); },
      single: function (A) { return grid([kpi('Night Shifts', A.nightDays.length + 'n', 'var(--brand-text)', true), kpi('Duty', r1(A.duty) + 'h'), kpi('Overtime', r1(A.ot) + 'h')]); },
      listTitle: function (A) { return 'Night shifts (' + A.nightDays.length + ')'; }
    },
    avgInOut: {
      icon: '⏰', cls: 'duty', color: 'var(--brand-text)', title: 'Punch-In Time', bannerSub: 'Daily punch-in / punch-out times',
      metric: function (A) { return A.avgIn == null ? 0 : (1440 - A.avgIn); }, fmt: function (v, A) { return A && A.avgIn != null ? minsToHHMM(A.avgIn) : '—'; },
      noBar: true,
      body: function (A) {
        return A.worked.length ? table(['Date', 'Day', 'In', 'Out', 'Duty'], A.worked.map(function (d) {
          var late = !d.inMiss && hhmmToMins(d.inn) != null && hhmmToMins(d.inn) > 8 * 60 + 5;
          return '<tr><td class="b">' + E(d.date) + '</td><td class="m">' + E(d.day) + '</td><td' + (d.inMiss ? ' class="bad b"' : late ? ' class="warn b"' : '') + '>' + E(d.inn) + '</td><td' + (d.outMiss ? ' class="bad b"' : '') + '>' + E(d.out) + '</td><td>' + r1(d.duty) + 'h</td></tr>';
        })) : empty('No punch records');
      },
      total: function (as) {
        var ins = as.filter(function (a) { return a.avgIn != null; }).map(function (a) { return a.avgIn; });
        var av = ins.length ? ins.reduce(function (s, v) { return s + v; }, 0) / ins.length : null;
        return grid([kpi('Avg Punch-In', minsToHHMM(av), 'var(--brand-text)', true), kpi('Earliest-In Month', ins.length ? minsToHHMM(Math.min.apply(null, ins)) : '—'), kpi('Latest-In Month', ins.length ? minsToHHMM(Math.max.apply(null, ins)) : '—')]);
      },
      single: function (A) { return grid([kpi('Avg Punch-In', minsToHHMM(A.avgIn), 'var(--brand-text)', true), kpi('Earliest In', minsToHHMM(A.earliestIn)), kpi('Latest In', minsToHHMM(A.latestIn)), kpi('Days Worked', A.worked.length + 'd')]); },
      listTitle: function (A) { return 'Daily punch times (late after 08:05 highlighted)'; }
    }
  };
  // criteria that reuse another topic with a different headline
  TOPICS.lessDuty = Object.assign({}, TOPICS.duty, {
    icon: '📉', title: 'Duty Hours (lowest)', bannerSub: 'Day-by-day duty log with missed days',
    body: function (A) {
      var h = A.worked.length ? table(DAY_HEAD, dayRows(A.worked)) : empty('No duty recorded');
      if (A.absent.length) h += secTitle('Absent dates (' + A.absent.length + ')') + chips(A.absent, 'red');
      return h;
    }
  });
  TOPICS.lessOt = Object.assign({}, TOPICS.ot, {
    icon: '📉', title: 'Overtime (lowest)', bannerSub: 'Overtime days and days worked without OT',
    body: function (A) {
      var noOt = A.worked.length - A.otDays.length;
      var h = A.otDays.length ? table(DAY_HEAD, dayRows(A.otDays)) : empty('No overtime recorded this month');
      return h + '<div class="icc-ctx-note">' + noOt + ' of ' + A.worked.length + ' worked days had no overtime.</div>';
    }
  });
  TOPICS.avgDuty = Object.assign({}, TOPICS.duty, {
    title: 'Average Duty / Day', bannerSub: 'Average duty hours per worked day',
    metric: function (A) { return A.avgPerDay; }, fmt: function (v) { return r1(v) + ' h/d'; }
  });

  /* ---------- aggregate helpers ---------- */
  function sum(as, key, isLen) { return as.reduce(function (s, a) { return s + (a.has ? (isLen ? (a[key] || []).length : num(a[key])) : 0); }, 0); }
  function sumLen(as, key) { return sum(as, key, true); }
  function countHas(as) { return as.filter(function (a) { return a.has; }).length; }
  function best(as, fn, unit) {
    var top = null; as.forEach(function (a) { if (a.has && (top == null || fn(a) > fn(top))) top = a; });
    return top ? (top.label.split(' ')[0] + ' · ' + r1(fn(top)) + unit) : '—';
  }
  function worst(as, fn, unit) { var v = best(as, fn, unit); return v; }

  /* ---------- month rows (multi-month) ---------- */
  function monthBlocks(topic, as, empId) {
    var vals = as.map(function (a) { return a.has ? topic.metric(a) : 0; });
    var mx = Math.max.apply(null, vals.concat([0])) || 1;
    var many = as.length > 4;
    return '<div class="icc-ctx-months">' + as.map(function (a, i) {
      if (!a.has) {
        return '<div class="icc-ctx-mrow none"><div class="icc-ctx-mhead"><span class="icc-ctx-mname">' + E(a.label) + '</span><span class="icc-ctx-mnone">no work record</span></div></div>';
      }
      var v = vals[i], pct = topic.noBar ? 0 : Math.max(v > 0 ? 4 : 0, Math.round(v / mx * 100));
      var hasItems = v > 0 || topic === TOPICS.avgInOut;
      return '<details class="icc-ctx-mrow"' + ((!many && hasItems) ? ' open' : '') + '><summary class="icc-ctx-mhead">' +
        '<span class="icc-ctx-mname">' + E(a.label) + '</span>' +
        '<span class="icc-ctx-bar">' + (pct ? '<i style="width:' + pct + '%;background:' + topic.color + '"></i>' : '') + '</span>' +
        '<span class="icc-ctx-mval" style="color:' + (v > 0 ? topic.color : 'var(--muted)') + '">' + E(topic.fmt(v, a)) + '</span>' +
        '<button type="button" class="icc-ctx-view" onclick="event.preventDefault();event.stopPropagation();openFullEmployeeReport(\'' + E(empId) + '\',\'' + E(a.month) + '\')">View ›</button>' +
        '</summary><div class="icc-ctx-mbody">' + topic.body(a) + '</div></details>';
    }).join('') + '</div>';
  }

  /* ---------- other-indicators strip ---------- */
  function otherStrip(emp, As, multi, incMode) {
    var abs = multi ? sumLen(As, 'absent') : (As[0] ? As[0].absent.length : 0);
    var pun = multi ? sumLen(As, 'punchRows') : (As[0] ? As[0].punchRows.length : 0);
    var duty = multi ? num(emp.totalDuty) : (As[0] && As[0].has ? As[0].duty : num(emp.totalDuty));
    var ot = multi ? num(emp.otHours) : (As[0] && As[0].has ? As[0].ot : num(emp.otHours));
    var earned = multi ? num(emp.totalEarned) : (As[0] && As[0].has ? As[0].earned : num(emp.totalEarned));
    var items = [
      kpi('Duty', r1(duty) + 'h'), kpi('Overtime', r1(ot) + 'h'), kpi('OT Days', (multi ? sumLen(As, 'otDayList') : (As[0] ? As[0].otDayList.length : 0)) + 'd'), kpi('Holiday', num(emp.holidayCount) + 'd'), kpi('Night', num(emp.nightCount) + 'n'),
      kpi('4:30pm', num(emp.plainDaysCount) + 'd'), kpi('Absent', abs + 'd', abs > 0 ? 'var(--danger)' : ''), kpi('Punch Miss', pun + 'd', pun > 0 ? 'var(--warning)' : '')
    ];
    if (incMode) { var ee = multi ? sumLen(As, 'early') : (As[0] ? As[0].early.length : 0); items.push(kpi('Early Exit', ee + 'd', ee > 0 ? 'var(--warning)' : '')); }
    if (!incMode) items.push(kpi('Earned', taka(earned)));
    return secTitle(multi ? 'Period totals — other indicators' : 'Other indicators this month') + '<div class="icc-ctx-grid small">' + items.join('') + '</div>';
  }


  /* ---------- rank context: where this employee stands in the ranking the user was viewing ---------- */
  function rankContext(emp, crit, multi) {
    var list = null, rank = null, total = 0;
    try { if (typeof _iccCurrentFilteredList !== 'undefined' && Array.isArray(_iccCurrentFilteredList) && _iccCurrentFilteredList.length) list = _iccCurrentFilteredList; } catch (e) { }
    if (!list) return '';
    for (var i = 0; i < list.length; i++) { if (list[i] && sameEmp(list[i].id, emp.id)) { rank = list[i]._iccRank || (i + 1); break; } }
    if (rank == null) return '';
    total = list.length;
    var shown = '';
    try { if (typeof formatIccMainMetric === 'function') shown = String(formatIccMainMetric(emp, crit)).replace(/<[^>]*>/g, ''); } catch (e) { }
    var top = '';
    try { if (rank > 1 && typeof formatIccMainMetric === 'function') top = String(formatIccMainMetric(list[0], crit)).replace(/<[^>]*>/g, ''); } catch (e) { }
    var items = [kpi('Rank', '#' + rank + ' <span style="font-size:11px;font-weight:600;color:var(--muted)">of ' + total + '</span>', '', true)];
    if (shown) items.push(kpi('Ranking value', E(shown)));
    if (top) items.push(kpi('#1 value', E(top)));
    return secTitle('Ranking position') + grid(items);
  }
  function noDailyNote(As) {
    var missing = As.filter(function (a) { return a.has && !a.days.length && (a.duty > 0 || a.ot > 0); });
    if (!missing.length) return '';
    return '<div class="icc-ctx-note" style="color:var(--warning);font-weight:700;">⚠ ' + missing.map(function (a) { return a.label; }).join(', ') +
      ': daily log is not cached on this device (offline copy). Totals are shown; refresh online to load day-by-day details.</div>';
  }

  /* ==========================================================================
     PUBLIC API
     ========================================================================== */
  window.closeIccContextModal = function () {
    var modal = document.getElementById('iccContextModal');
    if (modal) modal.classList.remove('open');
    var drillOpen = false; try { drillOpen = (typeof iccDrillOpen !== 'undefined') && !!iccDrillOpen; } catch (e) { }
    var listOpen = document.getElementById('lbFullListModal') && document.getElementById('lbFullListModal').classList.contains('open');
    if (!drillOpen && !listOpen) lockBody(false);
  };
  window.iccContextModalBackdropClick = function (e) { if (e && e.target && e.target.id === 'iccContextModal') window.closeIccContextModal(); };

  window.openFullEmployeeReport = function (empId, targetMonth) {
    window.closeIccContextModal();
    var lf = document.getElementById('lbFullListModal');
    if (lf && lf.classList.contains('open') && typeof closeLbFullList === 'function') closeLbFullList();
    var r = lbResult();
    var m = cleanMonth(targetMonth) || cleanMonth(r && r.month) || curMonthStr();
    var parts = m.split('-');
    var ySel = document.getElementById('yearSelect'), mSel = document.getElementById('monthSelect'), inp = document.getElementById('employeeId');
    if (ySel && parts[0]) ySel.value = parts[0];
    if (mSel && parts[1]) mSel.value = parts[1];
    if (inp) inp.value = empId;
    if (typeof toggleClearIdBtn === 'function') toggleClearIdBtn();
    var back = document.getElementById('backToLbBtn'); if (back) back.style.display = 'block';
    try { _lbView = true; } catch (e) { }
    if (typeof switchPage === 'function') switchPage('search');
    setTimeout(function () { if (typeof findReport === 'function') findReport(); }, 100);
  };

  window.openIccContextModal = function (empId, optCrit, optMonth) {
    if (!empId) return;
    var modal = document.getElementById('iccContextModal'), bodyEl = document.getElementById('iccCtxBody'), footEl = document.getElementById('iccCtxFooter');
    if (!modal || !bodyEl || !footEl) return;

    var inc = isIncharge();
    var crit = CRIT_ALIAS[optCrit] || optCrit || CRIT_ALIAS[activeCrit()] || activeCrit();
    if (!TOPICS[crit]) crit = 'duty';
    
    if (TOPICS[crit].money && inc) crit = 'duty'; // in-charge mode never shows money
    var topic = TOPICS[crit];

    var mode = timeMode(), multi = mode !== 'monthly';
    var r = lbResult();
    var emp = findRankedEmp(empId) || fallbackEmp(empId);
    var months;
    if (multi) {
      months = (r && Array.isArray(r.loadedMonths) && r.loadedMonths.length) ? r.loadedMonths.slice() : [];
      if (!months.length) { try { months = Object.keys(monthIndexMemoryCache).filter(function (k) { return Array.isArray(monthIndexMemoryCache[k]) && monthIndexMemoryCache[k].length; }); } catch (e) { } }
      months = Array.from(new Set(months.map(cleanMonth).filter(Boolean))).sort();
    } else {
      months = [cleanMonth(optMonth) || cleanMonth(r && r.month) || curMonthStr()];
    }
    if (!months.length) months = [curMonthStr()];

    var As = months.map(function (m) { return analyzeMonth(m, monthRecord(m, empId) || (!multi ? emp : null)); });
    var withData = As.filter(function (a) { return a.has; });
    var periodLabel = multi ? (timeModeName(mode) + ' · ' + withData.length + ' mo') : As[0].label;

    // header
    var meta = {}; try { meta = (typeof getEmpMeta === 'function' ? getEmpMeta(emp.id) : {}) || {}; } catch (e) { }
    var desig = ''; try { desig = (typeof getDesignation === 'function') ? getDesignation(emp) : (emp.grade || ''); } catch (e) { }
    var subName = emp.sub || meta.sub || '';
    var areaName = emp.area || 'RPPF'; try { if (typeof getAreaForId === 'function') areaName = getAreaForId(emp.id, true) || areaName; } catch (e) { }
    var tEl = document.getElementById('iccCtxTitle'), sEl = document.getElementById('iccCtxSubtitle');
    if (tEl) tEl.innerHTML = E(emp.name || emp.id) + ' <span style="font-weight:600;font-size:13px;opacity:.85;">(' + E(emp.id) + ')</span>';
    if (sEl) sEl.innerHTML = (subName ? '<span class="icc-ctx-sub-badge">' + E(subName) + '</span>' : '') + E(areaShort(areaName)) + (desig ? ' • ' + E(desig) : '') + ' • <b style="color:var(--text)">' + E(periodLabel) + '</b>';

    // body
    var html = '';
    if (!multi) {
      var A = As[0];
      if (!A.has) {
        html += banner(topic.cls, topic.icon, E(topic.title), topic.bannerSub, periodLabel) + empty('এই মাসে এই কর্মীর কোনো রেকর্ড নেই (No work record in ' + E(periodLabel) + ').');
      } else {
        var big = topic.fmt(topic.metric(A), A);
        html += banner(topic.cls, topic.icon, E(topic.title) + ': <b>' + E(big) + '</b>', topic.bannerSub, periodLabel);
        html += rankContext(emp, crit, false);
        html += topic.single(A);
        html += secTitle(topic.listTitle(A)) + topic.body(A) + noDailyNote(As);
        html += otherStrip(emp, As, false, inc);
      }
    } else {
      var totalV = withData.reduce(function (s, a) { return s + topic.metric(a); }, 0);
      var bigT = (crit === 'avgInOut' || crit === 'avgDuty') ? '' : ': <b>' + E(topic.fmt(totalV, null)) + '</b>';
      html += banner(topic.cls, topic.icon, E(topic.title) + bigT, topic.bannerSub, periodLabel);
      html += rankContext(emp, crit, true);
      html += secTitle('Period summary (' + withData.length + ' months)') + topic.total(As);
      html += secTitle('Month by month — tap a month to expand') + monthBlocks(topic, As, emp.id) + noDailyNote(As);
      html += otherStrip(emp, As, true, inc);
    }
    bodyEl.innerHTML = html;

    // footer
    var targetMonth = (function () { var d = withData.length ? withData[withData.length - 1].month : months[months.length - 1]; return d; })();
    var reportTxt = inc ? '📋 Work Log' : '💰 Payslip';
    if (multi) reportTxt += ' · ' + monthLabel(targetMonth).split(' ')[0];
    footEl.innerHTML = '<button type="button" class="btn-secondary" onclick="closeIccContextModal()">✕ Close</button>' +
      '<button type="button" class="btn-primary" onclick="openFullEmployeeReport(\'' + E(emp.id) + '\',\'' + E(targetMonth) + '\')">' + reportTxt + ' →</button>';

    _ctx = { empId: emp.id, crit: crit };
    modal.classList.add('open');
    lockBody(true);
    var mb = document.getElementById('iccCtxBody'); if (mb) mb.scrollTop = 0;
  };
})();
