/* ==========================================================================
   REPORT.JS - Daily Work Log, Punch Verification & Report Presentation Controller
   ========================================================================== */

const _RMON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _RDAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const _rE = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _rN = v => { v = Number(v) || 0; return v ? String(Math.round(v * 100) / 100) : ''; };
const _rMin = t => { const q = String(t).match(/^(\d{1,2}):(\d{2})/); return q ? +q[1] * 60 + +q[2] : null; };

function _loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

function _rptRows(ctx) {
const e = ctx.emp, daily = Array.isArray(e.daily) ? e.daily : [];
let y = 0, m = 0;
const mm = String(ctx.month || e._computedMonth || '').match(/(\d{4})-(\d{2})/);
if (mm) { 
  y = +mm[1]; m = +mm[2]; 
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
const dsMeta = getMonthDatasetMeta(ymStr);
const maxDatasetDay = dsMeta.maxActiveDay || 31;
const consensusHols = dsMeta.consensusHolidays;
const prevMonthNight = (typeof ctx.prevNight === 'boolean')
  ? ctx.prevNight
  : (ctx.prevNight instanceof Set ? (ctx.prevNight.has(String(e.id || '').toUpperCase()) || ctx.prevNight.has(resolveEmpAliasId(e.id))) : hasPrevMonthLastNight(e.id, ymStr, e));

const rows = [], last = new Date(y, m, 0).getDate();
for (let d = 1; d <= last; d++) {
const dn = _RDAY[new Date(y, m - 1, d).getDay()], o = byDay[d];
const dStr = String(d).padStart(2, '0');
const isoDateStr = `${y}-${mNumStr}-${dStr}`;
const row = { date: dStr + '/' + mNumStr, dayNum: dStr, monthNum: mNumStr, day: dn, v: [0, 0, 0, 0, 0, 0], inn: '', out: '', night: false, tone: '', note: '' };
if (!o) {
const holCheck = isPlantOrGovtHolidayDate(y, m, d, dn, consensusHols);
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
} else {
  // True General Working Day Absent
  row.tone = 'absent';
  row.note = '🔴 Absent (General Working Day)';
  row.isGeneralAbsent = true;
}
}
else {
Object.assign(row, { v: [0, 1, 2, 3, 4, 5].map(i => Number(o.v[i]) || 0), night: o.night });
const mi = o.forceMiss || (daily.length && isPunchMissing(o.inn)), mo = o.forceMiss || (daily.length && isPunchMissing(o.out));
row.inn = mi ? 'MISSING' : o.inn; row.out = mo ? 'MISSING' : o.out; row.missIn = !!mi; row.missOut = !!mo;
if (mi || mo) { row.tone = 'bad'; row.note = mi && mo ? 'In & Out punch missing' : mi ? 'In punch missing' : 'Out punch missing'; }
else {
const a = _rMin(o.inn), b = _rMin(o.out);
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
rows.push(row);
}
return { rows, y, m };
}

function _rptHtml(ctx, forExport) {
  const e = ctx.emp, { rows, y, m } = _rptRows(ctx);
  const sum = [0, 0, 0, 0, 0, 0];
  let present = 0, nights = 0, issues = 0, offAfterNight = 0, reqIssues = 0, nightSus = 0;
  rows.forEach(r => {
    r.v.forEach((x, i) => sum[i] += x);
    if (r.inn || r.out) present++;
    if (r.night) nights++;
    if (r.afterNight) offAfterNight++;
    if (r.tone === 'bad') issues++;
    if (r.tone === 'req' && !r.nightSuspect) reqIssues++;
    if (r.nightSuspect) nightSus++;
  });
  const displayRows = (typeof _rptHideEmptyDays !== 'undefined' && _rptHideEmptyDays)
    ? rows.filter(r => r.inn || r.out || r.tone === 'bad' || r.v.some(x => x > 0) || r.night)
    : rows;
  const BG = { bad: '#fecaca', hol: '#fff6e6', do: '#f3effc', none: '#f8fafc', off: '#f1f5f9', offn: '#eef2ff', req: '#fef3c7', absent: '#fee2e2' };
  const fsCell = forExport ? '12.5px' : '11px';
  const fsSmall = forExport ? '11.5px' : '10.5px';
  const fsHead = forExport ? '11.5px' : '10px';
  const padCell = forExport ? '5px 3px' : '4px 2px';
  const tdBase = `padding:${padCell};border:1px solid #cbd5e1;font-size:${fsCell};line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;`;
  const thBase = `padding:7px 2px;border:1px solid #0f172a;background:#0f172a;color:#fff;font-size:${fsHead};font-weight:800;line-height:1.15;text-align:center;vertical-align:middle;word-break:normal;overflow-wrap:normal;`;
  const chip = (t, c, bg) => `<span style="display:inline-block;margin:0 4px 4px 0;padding:3px 8px;border-radius:99px;font-size:${forExport ? '12px' : '11px'};font-weight:800;color:${c};background:${bg};">${t}</span>`;
  const colHeaders = [
    { label: 'Date<br><span style="font-weight:600;opacity:.85;">Day</span>', w: '14.5%' },
    { label: 'In<br>Time', w: '8.5%' },
    { label: 'Out<br>Time', w: '8.5%' },
    { label: 'Reg<br>Duty', w: '8.0%' },
    { label: 'Reg<br>OT', w: '6.6%' },
    { label: 'DO<br>Duty', w: '8.0%' },
    { label: 'DO<br>OT', w: '6.6%' },
    { label: 'Hol<br>Duty', w: '8.0%' },
    { label: 'Hol<br>OT', w: '6.6%' },
    { label: 'Night', w: '6.2%' },
    { label: 'Status /<br>Remark', w: '18.5%' }
  ];
  const body = displayRows.map(r => {
    const bad = r.tone === 'bad', col = r.tone === 'none' || r.tone === 'off' || r.tone === 'offn' ? '#64748b' : '#0f172a';
    const cell = (v) => `<td style="${tdBase}text-align:center;font-weight:700;${v ? 'color:#0f172a;' : 'color:#94a3b8;'}">${_rN(v)}</td>`;
    const fmtT = (t) => String(t || '').replace(/^(\d{2}:\d{2}):\d{2}$/, '$1');
    const pc = (txt, miss) => `<td style="${tdBase}text-align:center;font-size:${fsSmall};font-weight:${miss ? '800' : '600'};${miss ? 'background:#f87171;color:#7f1d1d;' : ''}">${_rE(miss ? 'MISS' : fmtT(txt))}</td>`;
    const dayBadgeColor = (r.day === 'Thu' || r.day === 'Fri') ? '#dc2626' : '#475569';
    return `<tr style="background:${BG[r.tone] || '#fff'};color:${col};">
<td style="${tdBase}text-align:left;padding-left:4px;padding-right:3px;font-weight:800;font-size:${fsSmall};${bad ? 'color:#b91c1c;' : ''}"><div style="display:flex;justify-content:space-between;align-items:center;gap:2px;"><span>${r.date}</span><span style="font-size:10px;font-weight:700;color:${bad ? '#b91c1c' : dayBadgeColor};">${r.day}</span></div></td>
${pc(r.inn, r.missIn)}${pc(r.out, r.missOut)}${r.v.map(x => cell(x)).join('')}
<td style="${tdBase}text-align:center;font-weight:800;font-size:${fsSmall};color:#6d28d9;">${r.night ? 'Yes' : ''}</td>
<td style="${tdBase}white-space:normal;padding-left:4px;padding-right:3px;font-size:${fsSmall};line-height:1.15;${bad ? 'color:#b91c1c;font-weight:800;' : 'font-weight:600;'}">${_rE(r.note)}</td></tr>`;
  }).join('');
  const containerStyle = forExport
    ? 'background:#fff;color:#0f172a;font-family:"Hind Siliguri",Arial,Helvetica,sans-serif;padding:14px 12px;width:720px;box-sizing:border-box;'
    : 'background:#fff;color:#0f172a;font-family:"Hind Siliguri",Arial,Helvetica,sans-serif;padding:10px 6px;width:100%;min-width:540px;box-sizing:border-box;';
  return `<div style="${containerStyle}">
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;border-bottom:2px solid #0f172a;padding-bottom:7px;margin-bottom:7px;">
<div style="min-width:0;"><div style="font-size:${forExport ? '19px' : '16px'};font-weight:900;color:#0f172a;letter-spacing:-.01em;line-height:1.15;">RPPF</div><div style="font-size:${forExport ? '12.5px' : '11.5px'};font-weight:700;color:#475569;margin-top:2px;">Monthly Work Log • ${_RMON[m - 1]} ${y}${(typeof _rptHideEmptyDays !== 'undefined' && _rptHideEmptyDays) ? ' (Duty Days)' : ''}</div></div>
<div style="text-align:right;min-width:0;"><div style="font-size:${forExport ? '15px' : '13.5px'};font-weight:900;color:#0f172a;line-height:1.2;">${_rE(ctx.id)} — ${_rE(e.name || '')}</div><div style="font-size:${forExport ? '12px' : '11px'};font-weight:700;color:#475569;margin-top:1px;">${_rE([e.grade, e.area, e.designation].filter(Boolean).join(' | '))}</div></div></div>
<div style="margin-bottom:6px;">${chip('Present: ' + present + 'd', '#1d4ed8', '#dbeafe')}${chip('Total OT: ' + (Math.round((sum[1] + sum[3] + sum[5]) * 100) / 100) + 'h', '#15803d', '#dcfce7')}${chip('Night: ' + nights, '#6d28d9', '#ede9fe')}${offAfterNight ? chip('Day off after night: ' + offAfterNight, '#4338ca', '#e0e7ff') : ''}
${chip(issues ? 'Punch Fix: ' + issues + 'd' : 'Punch OK', issues ? '#b91c1c' : '#15803d', issues ? '#fee2e2' : '#dcfce7')}
${nightSus ? chip('Night Check: ' + nightSus + 'd', '#9a3412', '#ffedd5') : ''}
${chip(reqIssues ? 'Req Missing: ' + reqIssues + 'd' : 'Req OK', reqIssues ? '#b45309' : '#15803d', reqIssues ? '#fef3c7' : '#dcfce7')}
${rows.filter(r => r.isGeneralAbsent).length > 0 ? chip('General Absent: ' + rows.filter(r => r.isGeneralAbsent).length + 'd', '#b91c1c', '#fee2e2') : chip('Attendance: Full', '#15803d', '#dcfce7')}</div>
<table style="border-collapse:collapse;width:100%;table-layout:fixed;">
<colgroup>${colHeaders.map(c => `<col style="width:${c.w};">`).join('')}</colgroup>
<thead><tr style="height:40px;">${colHeaders.map(c => `<th style="${thBase}">${c.label}</th>`).join('')}</tr></thead>
<tbody>${body}</tbody>
<tfoot><tr style="background:#0f172a;color:#fff;font-weight:800;font-size:${fsSmall};text-align:center;">
<td style="${tdBase}background:#0f172a;color:#fff;text-align:left;padding-left:4px;">Total</td>
<td style="${tdBase}background:#0f172a;color:#fff;" colspan="2">${present} duty days</td>
<td style="${tdBase}background:#0f172a;color:#fff;">${_rN(sum[0])}</td>
<td style="${tdBase}background:#0f172a;color:#facc15;">${_rN(sum[1])}</td>
<td style="${tdBase}background:#0f172a;color:#fff;">${_rN(sum[2])}</td>
<td style="${tdBase}background:#0f172a;color:#facc15;">${_rN(sum[3])}</td>
<td style="${tdBase}background:#0f172a;color:#fff;">${_rN(sum[4])}</td>
<td style="${tdBase}background:#0f172a;color:#facc15;">${_rN(sum[5])}</td>
<td style="${tdBase}background:#0f172a;color:#c084fc;">${nights}</td>
<td style="${tdBase}background:#0f172a;color:#fff;font-size:10.5px;">OT: ${_rN(sum[1] + sum[3] + sum[5])}h</td>
</tr></tfoot></table>
<div style="margin-top:6px;font-size:10.5px;color:#64748b;line-height:1.25;">${issues ? `• Punch correction needed on ${issues} day(s): ${rows.filter(r => r.tone === 'bad').map(r => r.date).join(', ')}<br>` : ''}
${nightSus ? `<div style="margin-top:4px;font-size:12px;font-weight:800;color:#9a3412;background:#ffedd5;padding:4px 8px;border-radius:4px;border:1px solid #fb923c;">⚠️ আপনার নাইট ডিউটির সমস্যা আছে / Night duty issue on ${nightSus} day(s): ${rows.filter(r => r.nightSuspect).map(r => r.date).join(', ')} — আপনি হয়তো নাইট করেছেন কিন্তু Empress-এ নাইট ওঠেনি। ERP টিমের সাথে যোগাযোগ করুন। (Night is counted only when Empress shows YES)</div>` : ''}
${reqIssues ? `<div style="margin-top:4px;font-size:12px;font-weight:800;color:#b45309;background:#fef3c7;padding:4px 8px;border-radius:4px;border:1px solid #f59e0b;">⚠️ Overtime Requisition Pending on ${reqIssues} day(s): ${rows.filter(r => r.tone === 'req').map(r => r.date).join(', ')} (Worked OT but Empress shows 0 OT)</div>` : ''}
<div style="margin-top:2px;font-size:10.5px;font-weight:600;color:#64748b;">Generated from RPPF Overtime Report App</div></div>`;
}

function _rptReset() {
  const h = document.getElementById('rptPreviewHost');
  if (h) { h.style.display = 'none'; h.innerHTML = ''; }
  const b = document.getElementById('rptPreviewBtn');
  if (b) b.textContent = 'Preview daily report ▼';
}

function toggleReportPreview() {
  const h = document.getElementById('rptPreviewHost'), b = document.getElementById('rptPreviewBtn'), ctx = window._rptCtx;
  if (!ctx || !ctx.emp) { showToast('Search a report first', 'warn'); return; }
  if (h.style.display === 'block') { _rptReset(); return; }
  _rptZoomLevel = 1;
  const zoomBar = `<div class="rpt-zoom-bar" style="flex-wrap:wrap;gap:6px;">
<div class="rpt-zoom-btns">
<button type="button" class="rpt-zoom-btn rpt-filter-btn ${!_rptHideEmptyDays ? 'active' : ''}" data-hide-empty="0" onclick="toggleReportDutyFilter(false)">Full Month</button>
<button type="button" class="rpt-zoom-btn rpt-filter-btn ${_rptHideEmptyDays ? 'active' : ''}" data-hide-empty="1" onclick="toggleReportDutyFilter(true)">Duty Days Only</button>
</div>
<div class="rpt-zoom-btns">
<button type="button" class="rpt-zoom-btn" data-zoom="0.85" onclick="setReportZoom(0.85)">Fit</button>
<button type="button" class="rpt-zoom-btn active" data-zoom="1" onclick="setReportZoom(1)">100%</button>
<button type="button" class="rpt-zoom-btn" data-zoom="1.15" onclick="setReportZoom(1.15)">115%</button>
</div>
</div>`;
  h.innerHTML = zoomBar + '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:10px;background:#fff;"><div id="rptInnerScaleWrap">' + _rptHtml(ctx, false) + '</div></div>';
  h.style.display = 'block';
  if (b) b.textContent = 'Hide daily report ▲';
}

async function downloadReportPNG(share) {
  const ctx = window._rptCtx;
  if (!ctx || !ctx.emp) { showToast('Search a report first', 'warn'); return; }
  const btns = ['pngDlBtn', 'pngShareBtn'].map(i => document.getElementById(i)).filter(Boolean);
  btns.forEach(b => b.disabled = true);
  showToast('Creating PNG...', 'info');
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff;';
  box.innerHTML = _rptHtml(ctx, true);
  document.body.appendChild(box);
  try {
    if (!window.html2canvas) await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    const canvas = await html2canvas(box.firstElementChild, { scale: 2.5, backgroundColor: '#ffffff' });
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const { y, m } = _rptRows(ctx), name = `WorkLog_${ctx.id}_${y}-${String(m).padStart(2, '0')}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); } catch (err) { if (err && err.name !== 'AbortError') throw err; }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  } catch (err) {
    showToast('Could not create the PNG. Check your internet connection and try again.', 'error');
  } finally {
    box.remove();
    btns.forEach(b => b.disabled = false);
  }
}

function navigateReportMonth(delta) {
  const ySel = document.getElementById('yearSelect');
  const mSel = document.getElementById('monthSelect');
  if (!ySel || !mSel) return;
  let y = parseInt(ySel.value, 10) || new Date().getFullYear();
  let m = parseInt(mSel.value, 10) || 1;
  m += delta;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  if (y < 2020) { y = 2020; m = 1; }
  if (y > 2032) { y = 2032; m = 12; }
  const yStr = String(y);
  const mStr = String(m).padStart(2, '0');
  if (![...ySel.options].some(o => o.value === yStr)) {
    const opt = document.createElement('option');
    opt.value = yStr;
    opt.textContent = typeof bn === 'function' ? bn(yStr) : yStr;
    ySel.appendChild(opt);
  }
  ySel.value = yStr;
  mSel.value = mStr;
  if (currentSearchId) {
    const empInp = document.getElementById('employeeId');
    if (empInp) empInp.value = currentSearchId;
    if (typeof toggleClearIdBtn === 'function') toggleClearIdBtn();
    if (typeof findReport === 'function') findReport();
  }
}

function syncReportPageBanner() {
  const strip = document.getElementById('reportEmpStrip');
  const emptyCard = document.getElementById('reportEmptyCard');
  const step7 = document.getElementById('step7');
  if (!strip || !emptyCard || !step7) return;
  if (currentResult && currentSearchId) {
    strip.style.display = 'flex';
    emptyCard.style.display = 'none';
    step7.classList.add('show');
    step7.style.display = 'block';
    const idBadge = document.getElementById('reportEmpIdBadge');
    const nameLbl = document.getElementById('reportEmpNameLbl');
    const subLbl = document.getElementById('reportEmpSubLbl');
    const monthLbl = document.getElementById('reportStripMonthLbl');
    if (idBadge) idBadge.textContent = currentSearchId;
    if (nameLbl) nameLbl.textContent = currentResult.name || currentSearchId;
    const rawArea = currentResult.isRppf !== false ? getAreaForId(currentSearchId, true) : 'Other facility';
    const areaName = rawArea === OVERALL_AREA ? 'Executives' : rawArea;
    const ym = currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
    const [yy, mm] = String(ym).split('-');
    const mIdx = (parseInt(mm, 10) || 1) - 1;
    const niceMonth = `${BN_MONTHS[mIdx] || mm} ${yy}`;
    if (subLbl) subLbl.textContent = `${areaName}${currentResult.grade ? ' • ' + currentResult.grade : ''} • Total: ৳${currentResult.totalEarned.toFixed(2)}`;
    if (monthLbl) monthLbl.textContent = `${niceMonth} (${ym})`;
    if (currentPermanentPage === 'report' && window._rptCtx && window._rptCtx.emp) {
      const h = document.getElementById('rptPreviewHost');
      if (h && h.style.display !== 'block') toggleReportPreview();
      else if (h && h.style.display === 'block') {
        const wrap = document.getElementById('rptInnerScaleWrap');
        if (wrap) wrap.innerHTML = _rptHtml(window._rptCtx, false);
      }
    }
  } else {
    strip.style.display = 'none';
    emptyCard.style.display = 'block';
    step7.classList.remove('show');
    step7.style.display = 'none';
  }
}

function initReportPage() {
  syncReportPageBanner();
  if (window._rptCtx && window._rptCtx.emp) {
    const h = document.getElementById('rptPreviewHost');
    if (h && h.style.display !== 'block') {
      toggleReportPreview();
    }
  } else {
    const pref = typeof getPreferredId === 'function' ? getPreferredId() : '';
    const inp = document.getElementById('reportQuickIdInput');
    if (inp && pref && !inp.value) inp.value = pref;
  }
}

async function searchFromReportPage() {
  const inp = document.getElementById('reportQuickIdInput');
  const raw = (inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) {
    if (typeof showToast === 'function') showToast('Enter an employee ID number', 'warn');
    inp?.focus();
    return;
  }
  const empInput = document.getElementById('employeeId');
  if (empInput) {
    empInput.value = raw;
    if (typeof toggleClearIdBtn === 'function') toggleClearIdBtn();
  }
  if (typeof findReport === 'function') await findReport();
  if (typeof switchPage === 'function') switchPage('report');
}

function renderInstantEmployeeRecord(emp, month, searchId) {
  const prevNight = hasPrevMonthLastNight(searchId, month, emp);
  emp._prevMonthLastNight = prevNight;
  computeEmpGeneralAbsents(emp, month, prevNight);
  emp.requisitionProblems = computeEmpRequisitionProblems(emp);
  emp.requisitionProblemCount = emp.requisitionProblems.length;
  window._rptCtx = { emp, month, id: searchId, prevNight };
  if (window._rptReset) _rptReset();
  applyTypeOverride(emp);
  const rc = getRateCategory(emp);
  const cat = emp.category || rc.cat || 'JO';
  const r = RATE_TABLE[cat] || RATE_TABLE.JO;
  const otHours = Number(emp.otHours) || 0;
  const holidayCount = Number(emp.holidayCount != null ? emp.holidayCount : emp.holiday) || 0;
  const nightCount = Number(emp.nightCount != null ? emp.nightCount : emp.night) || 0;
  const otAmount = emp.otAmount != null ? Number(emp.otAmount) : (otHours * r.otRate);
  const holidayAmount = emp.holidayAmount != null ? Number(emp.holidayAmount) : (r.holidayType === "hourly" ? holidayCount * r.holidayHours * r.otRate : holidayCount * r.holidayFlat);
  const nightAmount = emp.nightAmount != null ? Number(emp.nightAmount) : (nightCount * r.nightRate);
  const totalEarned = emp.totalEarned != null ? Number(emp.totalEarned) : (otAmount + holidayAmount + nightAmount);
  const isRppf = emp.isRppf !== false;
  const valid = emp.valid !== false;
  currentResult = {
    category: cat,
    otHours,
    holiday: holidayCount,
    night: nightCount,
    plainDays: Number(emp.plainDaysCount || emp.plainDays || 0),
    otAmount,
    holidayAmount,
    nightAmount,
    totalEarned,
    grade: emp.grade || '',
    valid,
    name: emp.name || '',
    isRppf
  };
  const parsedObj = {
    otHours,
    nightCount,
    holidayCount,
    regularDaysCount: Number(emp.regularDaysCount || 0),
    plainDaysCount: Number(emp.plainDaysCount || emp.plainDays || 0),
    holidayDays: Array.isArray(emp.holidayDays) ? emp.holidayDays : [],
    nightDays: Array.isArray(emp.nightDays) ? emp.nightDays : [],
    punchProblems: Array.isArray(emp.punchProblems) ? emp.punchProblems : []
  };
  const detectObj = {
    category: valid ? cat : null,
    valid,
    reason: RATE_TABLE[cat]?.name || cat,
    gradeText: emp.grade || cat
  };
  if (typeof updateMonthNavBar === 'function') updateMonthNavBar(month);
  if (typeof applyExtraction === 'function') applyExtraction(parsedObj, detectObj);
  const viewCtx = getReportViewContext(currentSearchId);
  const myAmountDiv = document.getElementById('compareMyAmount');
  if (myAmountDiv) {
    myAmountDiv.style.display = "block";
    myAmountDiv.innerText = viewCtx === 'own'
      ? `Your earnings: ৳ ${currentResult.totalEarned.toFixed(2)}`
      : `${currentSearchId} earnings: ৳ ${currentResult.totalEarned.toFixed(2)}`;
  }
  ['step3','step4','step5','step7'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('show'); el.style.display = 'block'; }
  });
  if (typeof applyReportViewContext === 'function') applyReportViewContext(parsedObj, detectObj);
  try { syncReportPageBanner(); } catch (e) {}
  try { if (typeof renderInchargeEmployeeProfile === 'function') renderInchargeEmployeeProfile(emp, month, searchId); } catch (e) { console.warn(e); }
  document.body.classList.add('has-result');
  const nc = document.getElementById('noticesCard');
  if (nc) nc.style.display = 'block';
  if (typeof addToHistory === 'function') addToHistory(searchId, month, emp.name || '');
  if (typeof enterCompactMode === 'function') enterCompactMode(searchId, month);
  if (!getPreferredId() && getAppMode() !== 'incharge') {
    const isDl = Boolean(window.Router && (typeof window.Router.isDeepLink === 'function' ? window.Router.isDeepLink() : window.Router.isDeepLink));
    if (!isDl) {
      setPreferredId(searchId);
      setAppMode('employee');
    }
  }
  if (typeof updateModeUI === 'function') updateModeUI();
  if (window.Router && typeof window.Router.updateReportUrl === 'function') {
    window.Router.updateReportUrl(searchId, month);
  }
}
