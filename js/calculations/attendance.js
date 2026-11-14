/* ==========================================================================
   ATTENDANCE.JS - Shared per-month day classification (Report + Profile)
   Moved verbatim from report.js `_rptRows`. Do not fork this logic: Report and
   Profile must always agree on Absent / Leave / Off / Pending days.
   ctx = { emp, month:'YYYY-MM', prevNight?:bool|Set, dsMeta?:{maxActiveDay,consensusHolidays} }
   ========================================================================== */

const _ATT_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _ATT_DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const _attMin = t => { const q = String(t).match(/^(\d{1,2}):(\d{2})/); return q ? +q[1] * 60 + +q[2] : null; };

// A work day is "closed" (absence can be confirmed) at 09:00 Bangladesh time the NEXT day.
// Covers regular duty, OT and the longest (up to 24h / night-OT) extended shift. Before that, no-punch = pending, not Absent.
function rptIsDayClosed(y, m, d) {
  const closeUtcMs = Date.UTC(y, m - 1, d + 1, 9, 0, 0) - 6 * 3600 * 1000; // 09:00 BD (UTC+6) as UTC epoch
  return Date.now() >= closeUtcMs;
}

function computeEmpMonthRows(ctx) {
const e = ctx.emp, daily = Array.isArray(e.daily) ? e.daily : [];
const earlyExitMap = new Map();
try {
  if (typeof computeEmpEarlyExits === 'function') {
    computeEmpEarlyExits(e).forEach(ex => {
      const dm = String(ex && ex.date || '').trim().match(/^(\d{1,2})-/);
      if (dm) earlyExitMap.set(parseInt(dm[1], 10), ex);
    });
  }
} catch (_e) {}
let y = 0, m = 0;
const mm = String(ctx.month || e._computedMonth || '').match(/(\d{4})-(\d{2})/);
if (mm) { 
  y = +mm[1]; m = +mm[2]; 
} else if (daily.length > 0 && daily[0] && daily[0][0]) {
  const s0 = String(daily[0][0]).trim();
  const qAlpha = s0.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/i);
  if (qAlpha) {
    y = +qAlpha[3];
    m = _ATT_MON.findIndex(x => x.toUpperCase() === qAlpha[2].toUpperCase()) + 1;
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
  const curM = (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month)
    || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  const curMatch = String(curM).match(/(\d{4})-(\d{2})/);
  if (curMatch) {
    y = +curMatch[1];
    m = +curMatch[2];
  } else {
    const n = new Date(); y = n.getFullYear(); m = n.getMonth() + 1;
  }
}
const mNumStr = String(m).padStart(2, '0');
const ymStr = `${y}-${mNumStr}`;
const { byDay, hasDaily } = _buildEmpDayMap(e);
const dsMeta = ctx.dsMeta || getMonthDatasetMeta(ymStr); // ctx.dsMeta lets per-employee history inject {maxActiveDay, consensusHolidays}
const maxDatasetDay = dsMeta.maxActiveDay || 31;
const consensusHols = dsMeta.consensusHolidays;
const prevMonthNight = (typeof ctx.prevNight === 'boolean')
  ? ctx.prevNight
  : (ctx.prevNight instanceof Set ? (ctx.prevNight.has(String(e.id || '').toUpperCase()) || ctx.prevNight.has(resolveEmpAliasId(e.id))) : hasPrevMonthLastNight(e.id, ymStr, e));

const rows = [], last = new Date(y, m, 0).getDate();
for (let d = 1; d <= last; d++) {
const dn = _ATT_DAY[new Date(y, m - 1, d).getDay()], o = byDay[d];
const dStr = String(d).padStart(2, '0');
const isoDateStr = `${y}-${mNumStr}-${dStr}`;
const row = { date: dStr + '/' + mNumStr, dayNum: dStr, monthNum: mNumStr, day: dn, v: [0, 0, 0, 0, 0, 0], inn: '', out: '', night: false, tone: '', note: '' };
if (!o) {
const holCheck = typeof isPlantOrGovtHolidayDate === 'function' ? isPlantOrGovtHolidayDate(y, m, d, dn, consensusHols) : { isOffOrHol: (dn === 'Thu' || dn === 'Fri'), isWeekend: (dn === 'Thu' || dn === 'Fri'), isHoliday: false, label: '' };
const wk = holCheck.isWeekend;
const afterPrevMonthNight = (d === 1 && prevMonthNight);
const afterSameMonthNight = (d > 1 && byDay[d - 1] && byDay[d - 1].night);
const afterNight = afterPrevMonthNight || afterSameMonthNight;
const leaveRec = (typeof isEmployeeOnApprovedLeave === 'function') ? isEmployeeOnApprovedLeave(e.id, isoDateStr) : null;

if (afterNight) {
  row.tone = 'offn';
  row.note = (afterPrevMonthNight ? 'Day off after night (Prev Month)' : 'Day off after night') + (wk ? ' (Weekend)' : '');
  row.afterNight = true;
  if (afterPrevMonthNight) row.crossMonthAfterNight = true;
} else if (leaveRec) {
  row.tone = 'off';
  row.note = `Approved Leave (${leaveRec.category || 'Leave'})`;
  row.isApprovedLeave = true;
} else if (holCheck.isOffOrHol) {
  row.tone = 'off';
  row.note = holCheck.label || (wk ? 'Weekend (Thu/Fri)' : 'Plant / Govt Holiday');
} else if (d > maxDatasetDay) {
  row.tone = 'none';
  row.note = 'Upcoming / Not recorded';
} else if (!hasDaily && Number(e.totalDuty || 0) > 0 && !Array.isArray(e.activeDayNums)) {
  row.tone = 'none';
  row.note = 'No daily log cached';
} else if (!rptIsDayClosed(y, m, d)) {
  // Day not closed yet (before D+1 09:00 BD): no FP so far is pending, NOT a confirmed Absent
  row.tone = 'none';
  row.note = '⏳ FP not yet (day pending)';
  row.fpPending = true;
} else {
  // True General Working Day Absent
  row.tone = 'absent';
  row.note = '🔴 Absent (General Working Day)';
  row.isGeneralAbsent = true;
}
}
else {
Object.assign(row, { v: [0, 1, 2, 3, 4, 5].map(i => Number(o.v[i]) || 0), night: o.night });
const _mi0 = o.forceMiss || (daily.length && isPunchMissing(o.inn)), _mo0 = o.forceMiss || (daily.length && isPunchMissing(o.out));
// Day not closed yet (before D+1 09:00 BD): a missing out/in punch is only "pending", not a punch problem or Absent.
const _fpPend = !o.forceMiss && !rptIsDayClosed(y, m, d) && !!(_mi0 || _mo0);
const mi = _fpPend ? false : _mi0, mo = _fpPend ? false : _mo0;
row.inn = mi ? 'MISSING' : o.inn; row.out = mo ? 'MISSING' : o.out; row.missIn = !!mi; row.missOut = !!mo;
if (_fpPend) {
  row.fpPending = true; row.tone = 'none';
  row.inn = _mi0 ? '' : o.inn; row.out = '';
  row.note = _mi0 ? '⏳ FP not yet (day pending)' : '⏳ In ' + (o.inn || '') + ' — out pending';
}
else if (mi || mo) { row.tone = 'bad'; row.note = mi && mo ? 'In & Out punch missing' : mi ? 'In punch missing' : 'Out punch missing'; }
else {
const a = _attMin(o.inn), b = _attMin(o.out);
if (a != null && b != null && b <= a && !o.night) { row.tone = 'bad'; row.note = 'Out is before In'; row.missOut = true; }
else if (row.v[4] || row.v[5]) { row.tone = 'hol'; row.note = 'Holiday duty'; }
else if (row.v[2] || row.v[3]) { row.tone = 'do'; row.note = 'Day off duty'; }
else if (row.v[1]) row.note = 'Overtime';
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
  }
  else if (!o.night && to !== null && to >= 1150 && to <= 1215) {
    isReq = true; reqNote = '⚠️ 3h OT Missing (04:30-07:30 PM)';
  }
  else if (!o.night && to !== null && to >= 1216 && to <= 1350) {
    isReq = true; reqNote = '⚠️ 5h OT Missing (04:30-09:30 PM)';
  }
  else if (!o.night && ti !== null && ti <= 435 && elHrs >= 9.5) {
    isReq = true; reqNote = ti <= 390 ? '⚠️ 2.5h Morning OT Missing' : '⚠️ 1.0h Morning OT Missing';
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
  const _m = (t) => { const mm = String(t || '').replace(/[^0-9:]/g, '').match(/^(\d{1,2}):(\d{2})/); return mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : null; };
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
rows.push(row);
}
return { rows, y, m };
}
