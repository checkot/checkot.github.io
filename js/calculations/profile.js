/* ==========================================================================
   PROFILE.JS (calculations) - Pure aggregation for the "Me" page. No DOM, no fetch.
   --------------------------------------------------------------------------
   Reads values already computed elsewhere (money fields come from the rates
   engine; absent/leave comes from computeEmpMonthRows in attendance.js).
   Nothing here recomputes amounts.

   Public (global) API:
     computeProfileMonth(emp, ym, opts) -> month summary (see below)
     aggregateProfile(monthSummaries)   -> scope totals + best month, deltas, streak
     profFmtTime12(minutes)             -> "07:52 AM"
     profFmtHours(h)                    -> "8.7"
   opts (all optional, for tests / per-employee files):
     dsMeta        : { maxActiveDay, consensusHolidays:Set|Array } for this month
     prevNight     : boolean - worked night on last day of previous month
     earlyExitFn   : emp -> array (defaults to global computeEmpEarlyExits)
     rowsFn        : ctx -> {rows} (defaults to global computeEmpMonthRows)

   PRESENT-% (final formula, decision D-4):
     scheduledDays = presentDays + absentDays + approvedLeaveDays
     present%      = presentDays / scheduledDays * 100          ("—" if scheduledDays = 0)
     - absentDays        : rows flagged isGeneralAbsent (closed general working day, no punch)
     - approvedLeaveDays : rows flagged isApprovedLeave, excluding Thu/Fri
     - presentDays       : day has In AND Out punches, is not pending, and is a regular
                           working day (regular duty > 0 or no day-off/holiday duty).
                           Work done on a day-off / holiday (duty only in dayoff/holiday
                           columns) is NOT counted - those days are not scheduled.
     - Thu/Fri, plant/govt holidays, post-night day-off, pending (not closed) and
       "upcoming" days are never scheduled.
     - Days with a missing In or Out punch are left out of both sides (they are punch problems).
   ========================================================================== */

const _PROF_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function _profNum(v) { v = Number(v); return isFinite(v) ? v : 0; }
function _profR2(v) { return Math.round(_profNum(v) * 100) / 100; }
function _profMin(t) {
  const q = String(t == null ? '' : t).replace(/[^0-9:]/g, '').match(/^(\d{1,2}):(\d{2})/);
  if (!q) return null;
  const h = +q[1], m = +q[2];
  return (h > 23 || m > 59) ? null : h * 60 + m;
}
function _profMissing(t) {
  if (typeof isPunchMissing === 'function') return isPunchMissing(t);
  return _profMin(t) == null || /^0{1,2}:00/.test(String(t).trim());
}
function _profDayNo(d) {
  const s = String(d == null ? '' : d).trim();
  const iso = s.match(/^\d{4}-\d{1,2}-(\d{1,2})$/);
  return iso ? +iso[1] : parseInt(s, 10);
}
function _profDate(d) { // always a "DD-MON-YYYY"-ish string or ''
  return typeof d === 'string' ? d : (d && d.date) || '';
}
function _profIsNightRow(r) {
  const sc = String(r[11] || '').toUpperCase();
  return !!r[10] || sc.indexOf('NIGHT') >= 0 || sc === 'DN';
}

function profFmtTime12(min) {
  if (min == null || !isFinite(min)) return '—';
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(min / 60), m = min % 60, ap = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return String(h12).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + ap;
}
function profFmtHours(h) {
  if (h == null || !isFinite(h)) return '—';
  return String(Math.round(h * 100) / 100);
}

/** Circular mean of minutes-since-midnight values (safe for Out times that cross midnight). */
function _profAvgClock(vals) {
  if (!vals.length) return null;
  let sx = 0, sy = 0;
  vals.forEach(v => { const a = v / 1440 * 2 * Math.PI; sx += Math.cos(a); sy += Math.sin(a); });
  let a = Math.atan2(sy / vals.length, sx / vals.length);
  if (a < 0) a += 2 * Math.PI;
  return a / (2 * Math.PI) * 1440;
}

/**
 * One employee-month -> summary. `emp` is an object in the same shape as employees[] of data/YYYY-MM.json.
 * Pass emp = null for months where the employee has no record -> { exists:false }.
 */
function computeProfileMonth(emp, ym, opts) {
  opts = opts || {};
  const mm = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  const out = { ym: ym, exists: !!emp, y: mm ? +mm[1] : 0, m: mm ? +mm[2] : 0 };
  if (!emp) return out;

  // ---- money / counts: read, never recompute ----
  out.otHours = _profR2(emp.otHours);
  out.totalDuty = _profR2(emp.totalDuty);
  out.nightCount = _profNum(emp.nightCount);
  out.holidayCount = _profNum(emp.holidayCount);
  out.otAmount = _profNum(emp.otAmount);
  out.holidayAmount = _profNum(emp.holidayAmount);
  out.nightAmount = _profNum(emp.nightAmount);
  out.totalEarned = _profNum(emp.totalEarned);

  const daily = Array.isArray(emp.daily) ? emp.daily : [];

  // ---- date chips ----
  out.nightDates = (Array.isArray(emp.nightDays) ? emp.nightDays : []).map(_profDate).filter(Boolean);
  out.holidayDates = (Array.isArray(emp.holidayDays) ? emp.holidayDays : []).map(h => (typeof h === 'string')
    ? { date: h, duty: 0, extra: 0 }
    : { date: h.date || '', duty: _profR2(_profNum(h.doDuty) + _profNum(h.holDuty)), extra: _profR2(_profNum(h.doExtra) + _profNum(h.holExtra)) });

  // ---- attendance via the ONE shared function ----
  const ctx = { emp: emp, month: ym };
  if (opts.dsMeta) {
    const cs = opts.dsMeta.consensusHolidays;
    ctx.dsMeta = { maxActiveDay: opts.dsMeta.maxActiveDay || 31, consensusHolidays: cs instanceof Set ? cs : new Set(cs || []) };
  }
  if (typeof opts.prevNight === 'boolean') ctx.prevNight = opts.prevNight;
  const rowsFn = opts.rowsFn || (typeof computeEmpMonthRows === 'function' ? computeEmpMonthRows : null);
  let rows = [];
  if (rowsFn) { try { rows = rowsFn(ctx).rows || []; } catch (_e) { rows = []; } }

  let present = 0, absent = 0, leave = 0, pending = 0, punchBad = 0;
  const strip = []; // per-day status for the mini calendar: P present, A absent, L leave, O off/holiday/dayoff, N night, X pending/none, B bad punch
  rows.forEach(r => {
    const dn = parseInt(r.dayNum, 10);
    let s = 'X';
    if (r.isGeneralAbsent) { absent++; s = 'A'; }
    else if (r.isApprovedLeave) {
      if (r.day === 'Thu' || r.day === 'Fri') s = 'O'; else { leave++; s = 'L'; }
    }
    else if (r.fpPending) { pending++; s = 'X'; }
    else if (r.missIn || r.missOut) { punchBad++; s = 'B'; }
    else if (r.tone === 'off' || r.tone === 'offn' || r.tone === 'none') s = 'O';
    else if (r.inn || r.out) {
      const v = r.v || [];
      const regular = _profNum(v[0]) > 0 || _profNum(v[1]) > 0;
      const offDuty = _profNum(v[2]) + _profNum(v[3]) + _profNum(v[4]) + _profNum(v[5]) > 0;
      if (regular || !offDuty) { present++; s = r.night ? 'N' : 'P'; }
      else s = r.night ? 'N' : 'O';
    }
    strip.push({ d: dn, s: s });
  });
  const scheduled = present + absent + leave;
  out.presentDays = present;
  out.absentDays = absent;
  out.leaveDays = leave;
  out.pendingDays = pending;
  out.badPunchDays = punchBad;
  out.scheduledDays = scheduled;
  out.presentPct = scheduled > 0 ? Math.round(present / scheduled * 1000) / 10 : null;
  out.strip = strip;
  out.daysInMonth = out.y && out.m ? new Date(out.y, out.m, 0).getDate() : strip.length;

  // ---- average punch (minutes since midnight; day vs night kept apart) ----
  const dIn = [], dOut = [], nIn = [], nOut = [];
  let dutySum = 0, dutyN = 0;
  daily.forEach(r => {
    if (!r || _profMissing(r[2]) || _profMissing(r[3])) return; // missing punch -> punch problem, not averaged
    const a = _profMin(r[2]), b = _profMin(r[3]);
    if (a == null || b == null) return;
    if (_profIsNightRow(r)) { nIn.push(a); nOut.push(b); return; }
    if (b <= a) return; // "Out before In" on a day shift = bad data, skip
    dIn.push(a); dOut.push(b);
    const duty = _profNum(r[4]) + _profNum(r[6]) + _profNum(r[8]);
    if (duty > 0) { dutySum += duty; dutyN++; }
  });
  out.punch = {
    dayN: dIn.length,
    dayInSum: dIn.reduce((x, y) => x + y, 0), dayOutSum: dOut.reduce((x, y) => x + y, 0),
    avgIn: dIn.length ? dIn.reduce((x, y) => x + y, 0) / dIn.length : null,
    avgOut: dOut.length ? dOut.reduce((x, y) => x + y, 0) / dOut.length : null,
    dutySum: dutySum, dutyN: dutyN,
    avgDuty: dutyN ? dutySum / dutyN : null,
    nightN: nIn.length,
    nightAvgIn: _profAvgClock(nIn), nightAvgOut: _profAvgClock(nOut)
  };

  // ---- issues (Check before payroll) ----
  const reqs = Array.isArray(emp.requisitionProblems) ? emp.requisitionProblems : [];
  const nsus = Array.isArray(emp.nightSuspects) ? emp.nightSuspects : [];
  const pps = Array.isArray(emp.punchProblems) ? emp.punchProblems : [];
  out.issues = {
    requisition: reqs, nightSuspects: nsus, punchProblems: pps,
    counts: { requisition: reqs.length, nightSuspects: nsus.length, punch: pps.length }
  };

  // ---- early exits ----
  let ee = 0;
  try {
    const fn = opts.earlyExitFn || (typeof computeEmpEarlyExits === 'function' ? computeEmpEarlyExits : null);
    if (fn) ee = (fn(emp) || []).length;
  } catch (_e) {}
  out.earlyExits = ee;

  out.profileInfo = { id: emp.id, name: emp.name, grade: emp.grade, kind: emp.kind, category: emp.category, area: emp.area, sub: emp.sub, dept: emp.dept };
  return out;
}

/**
 * Aggregate month summaries (any scope: one month, a year, ...). Months with exists=false are
 * skipped for totals/averages but stay in `months` as "—" rows.
 */
function aggregateProfile(months) {
  months = (months || []).slice().sort((a, b) => a.ym < b.ym ? -1 : 1);
  const have = months.filter(m => m.exists);
  const sum = k => have.reduce((a, m) => a + _profNum(m[k]), 0);
  const t = {
    months: months, monthsWithData: have.length,
    otHours: _profR2(sum('otHours')),
    nightCount: sum('nightCount'), holidayCount: sum('holidayCount'),
    otAmount: sum('otAmount'), holidayAmount: sum('holidayAmount'), nightAmount: sum('nightAmount'), totalEarned: sum('totalEarned'),
    presentDays: sum('presentDays'), absentDays: sum('absentDays'), leaveDays: sum('leaveDays'),
    scheduledDays: sum('scheduledDays'), earlyExits: sum('earlyExits')
  };
  t.presentPct = t.scheduledDays > 0 ? Math.round(t.presentDays / t.scheduledDays * 1000) / 10 : null; // pooled, not mean-of-means
  t.avgOtPerMonth = have.length ? _profR2(t.otHours / have.length) : null;
  t.avgEarnedPerMonth = have.length ? Math.round(t.totalEarned / have.length) : null;

  // best month by earnings
  let best = null;
  have.forEach(m => { if (!best || m.totalEarned > best.totalEarned) best = m; });
  t.bestMonth = best && best.totalEarned > 0 ? { ym: best.ym, totalEarned: best.totalEarned } : null;

  // change vs previous month (the last two months that have data)
  if (have.length >= 2) {
    const a = have[have.length - 1], b = have[have.length - 2];
    t.lastChange = { ym: a.ym, prevYm: b.ym, earned: a.totalEarned - b.totalEarned, ot: _profR2(a.otHours - b.otHours),
      earnedPct: b.totalEarned > 0 ? Math.round((a.totalEarned - b.totalEarned) / b.totalEarned * 1000) / 10 : null };
  } else t.lastChange = null;

  // perfect attendance: present% == 100 with at least 1 scheduled day; streak counted back from newest month
  t.perfectMonths = have.filter(m => m.scheduledDays > 0 && m.presentPct === 100).map(m => m.ym);
  let streak = 0;
  for (let i = have.length - 1; i >= 0; i--) {
    if (have[i].scheduledDays > 0 && have[i].presentPct === 100) streak++; else break;
  }
  t.perfectStreak = streak;

  // pooled average punch (day shift), weighted by days; night kept separate
  let n = 0, si = 0, so = 0, dN = 0, dS = 0;
  have.forEach(m => { const p = m.punch; if (!p) return; n += p.dayN; si += p.dayInSum; so += p.dayOutSum; dN += p.dutyN; dS += p.dutySum; });
  t.punch = { dayN: n, avgIn: n ? si / n : null, avgOut: n ? so / n : null, avgDuty: dN ? dS / dN : null };
  const nightIn = [], nightOut = [];
  have.forEach(m => { const p = m.punch; if (p && p.nightN) { for (let i = 0; i < p.nightN; i++) { nightIn.push(p.nightAvgIn); nightOut.push(p.nightAvgOut); } } });
  t.punch.nightN = nightIn.length;
  t.punch.nightAvgIn = _profAvgClock(nightIn);
  t.punch.nightAvgOut = _profAvgClock(nightOut);

  // issue totals
  t.issueCounts = have.reduce((a, m) => {
    a.requisition += m.issues.counts.requisition; a.nightSuspects += m.issues.counts.nightSuspects; a.punch += m.issues.counts.punch; return a;
  }, { requisition: 0, nightSuspects: 0, punch: 0 });
  return t;
}
