/* ==========================================================================
   ASSESSMENT.JS - Annual Increment Assessment (In-Charge only)
   Total 100 = Attendance/Overall Duty (30, auto from app data) + Job Knowledge (70, manual)
   Attendance: best employee = 30, worst = 0 (min-max scaling inside the selected group).
   Grade: A / B / C / D from total marks (thresholds editable).
   Marks are stored in this device's localStorage (+ CSV / JSON backup).
   ========================================================================== */

const ASSESS_STORE_KEY = 'rppf_assessment_v1';
const ASSESS_ATT_MAX = 30;
const ASSESS_JK_MAX = 70;
const ASSESS_DEFAULTS = { wDuty: 50, wAbsent: 30, wHoliday: 20, gA: 80, gB: 70, gC: 60 };

let _assessRows = [];
let _assessLoading = false;
let _assessCtx = { year: '', from: '', to: '' };

function assessLoadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(ASSESS_STORE_KEY) || '{}');
    return { marks: s.marks || {}, settings: Object.assign({}, ASSESS_DEFAULTS, s.settings || {}) };
  } catch (e) { return { marks: {}, settings: Object.assign({}, ASSESS_DEFAULTS) }; }
}
function assessSaveStore(st) {
  try { localStorage.setItem(ASSESS_STORE_KEY, JSON.stringify(st)); return true; }
  catch (e) { if (typeof showToast === 'function') showToast('Could not save on this device', 'error'); return false; }
}

function assessGrade(total, s) {
  if (total == null || isNaN(total)) return '—';
  if (total >= s.gA) return 'A';
  if (total >= s.gB) return 'B';
  if (total >= s.gC) return 'C';
  return 'D';
}

function assessMonthList(year, from, to) {
  const out = [];
  for (let m = parseInt(from, 10); m <= parseInt(to, 10); m++) out.push(`${year}-${String(m).padStart(2, '0')}`);
  return out;
}

/* Attendance performance index -> 0..30 (best 30, worst 0) */
function assessComputeAttendance(list, s) {
  const items = list.map(e => {
    const mc = Math.max(1, e.monthsCount || 1);
    return {
      e,
      duty: Number(e.adjustedDuty != null ? e.adjustedDuty : e.totalDuty || 0) / mc,
      absent: Number(e.generalAbsentCount || 0) / mc,
      holiday: Number(e.holidayCount || 0) / mc,
      months: mc
    };
  });
  const norm = (arr, higherBetter) => {
    const mn = Math.min(...arr), mx = Math.max(...arr);
    if (mx === mn) return arr.map(() => 1);
    return arr.map(v => higherBetter ? (v - mn) / (mx - mn) : (mx - v) / (mx - mn));
  };
  const nD = norm(items.map(i => i.duty), true);
  const nA = norm(items.map(i => i.absent), false);
  const nH = norm(items.map(i => i.holiday), true);
  const wSum = (s.wDuty + s.wAbsent + s.wHoliday) || 1;
  items.forEach((it, i) => { it.index = (s.wDuty * nD[i] + s.wAbsent * nA[i] + s.wHoliday * nH[i]) / wSum; });
  const mn = Math.min(...items.map(i => i.index)), mx = Math.max(...items.map(i => i.index));
  items.forEach(it => { it.att = (mx === mn) ? ASSESS_ATT_MAX : ASSESS_ATT_MAX * (it.index - mn) / (mx - mn); });
  return items;
}

function assessEnsureControls() {
  const root = document.getElementById('assessmentRoot');
  if (!root || root.dataset.built === '1') return;
  root.dataset.built = '1';
  const now = new Date();
  const yNow = now.getFullYear();
  const years = [yNow - 1, yNow, yNow + 1].filter(y => y >= 2025);
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mOpt = (sel) => months.map((m, i) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${mNames[i]}</option>`).join('');
  const curM = String(now.getMonth() + 1).padStart(2, '0');
  const st = assessLoadStore().settings;
  root.innerHTML = `
  <div class="card assess-card">
    <div class="card-title">Assessment period (মূল্যায়নের সময়কাল)</div>
    <div class="card-sub" style="white-space:normal;margin-bottom:8px;">RF-ID Officers &amp; Executives • Attendance (30) + Job Knowledge (70)</div>
    <div class="assess-grid3">
      <div><label for="assessYear">Year</label><select id="assessYear">${years.map(y => `<option value="${y}" ${y === yNow ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
      <div><label for="assessFrom">From</label><select id="assessFrom">${mOpt('01')}</select></div>
      <div><label for="assessTo">To</label><select id="assessTo">${mOpt(curM)}</select></div>
    </div>
    <div class="assess-grid2" style="margin-top:8px;">
      <div><label for="assessArea">Area</label><select id="assessArea"><option value="all">All areas</option></select></div>
      <div><label for="assessSearch">Search</label><input type="text" id="assessSearch" placeholder="Name or ID" autocomplete="off"></div>
    </div>
    <button type="button" class="btn-primary assess-run" id="assessRunBtn" onclick="runAssessment()">Calculate / Refresh</button>
    <details class="assess-details">
      <summary>Formula &amp; grade settings (হিসাবের নিয়ম)</summary>
      <div class="card-sub" style="white-space:normal;margin:6px 0;">Attendance (30) is auto-calculated from duty hours, absent days and holiday duty. Weights (auto-normalised):</div>
      <div class="assess-grid3">
        <div><label for="assessWDuty">Avg duty/mo</label><input type="number" id="assessWDuty" min="0" max="100" value="${st.wDuty}"></div>
        <div><label for="assessWAbsent">Absent days</label><input type="number" id="assessWAbsent" min="0" max="100" value="${st.wAbsent}"></div>
        <div><label for="assessWHoliday">Holiday duty</label><input type="number" id="assessWHoliday" min="0" max="100" value="${st.wHoliday}"></div>
      </div>
      <div class="card-sub" style="white-space:normal;margin:8px 0 4px;">Grade cut-off (total out of 100):</div>
      <div class="assess-grid3">
        <div><label for="assessGA">A ≥</label><input type="number" id="assessGA" min="0" max="100" value="${st.gA}"></div>
        <div><label for="assessGB">B ≥</label><input type="number" id="assessGB" min="0" max="100" value="${st.gB}"></div>
        <div><label for="assessGC">C ≥</label><input type="number" id="assessGC" min="0" max="100" value="${st.gC}"></div>
      </div>
      <button type="button" class="reset-btn" onclick="assessSaveSettings()">Save settings</button>
    </details>
  </div>
  <div id="assessSummary" class="assess-summary" style="display:none;"></div>
  <div id="assessList"></div>
  <div class="card assess-card" id="assessToolsCard" style="display:none;">
    <div class="card-title">Export / Backup</div>
    <div class="btn-grid-2" style="margin-top:8px;">
      <button type="button" class="btn-primary" onclick="assessExportCsv()">Download CSV (Excel)</button>
      <button type="button" class="reset-btn" style="margin-top:0;" onclick="assessBackupJson()">Backup marks (JSON)</button>
    </div>
    <label class="reset-btn assess-restore">Restore marks from backup<input type="file" accept="application/json" style="display:none;" onchange="assessRestoreJson(this)"></label>
    <div class="card-sub" style="white-space:normal;margin-top:6px;">Marks are saved on this device only. Download a backup regularly.</div>
  </div>`;
  ['assessSearch', 'assessArea'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === 'assessSearch' ? 'input' : 'change', assessRenderList);
  });
}

function assessSaveSettings() {
  const g = id => Number(document.getElementById(id).value);
  const s = { wDuty: g('assessWDuty'), wAbsent: g('assessWAbsent'), wHoliday: g('assessWHoliday'), gA: g('assessGA'), gB: g('assessGB'), gC: g('assessGC') };
  if ([s.wDuty, s.wAbsent, s.wHoliday].some(v => isNaN(v) || v < 0) || (s.wDuty + s.wAbsent + s.wHoliday) <= 0) {
    showToast('Weights must be 0 or more, and not all zero', 'error'); return;
  }
  if (!(s.gA > s.gB && s.gB > s.gC && s.gC >= 0)) { showToast('Grade cut-offs must be A > B > C', 'error'); return; }
  const st = assessLoadStore(); st.settings = s; assessSaveStore(st);
  showToast('Settings saved', 'success');
  if (_assessRows.length) runAssessment();
}

async function renderAssessmentPage() {
  const root = document.getElementById('assessmentRoot');
  if (!root) return;
  const inch = typeof getAppMode === 'function' && getAppMode() === 'incharge';
  if (!inch) {
    root.dataset.built = '0';
    root.innerHTML = `<div class="card assess-card assess-lock">
      <div class="card-title">🔒 In-Charge only</div>
      <div class="card-sub" style="white-space:normal;margin:6px 0 12px;">Assessment is available only in Floor / Production In-Charge mode (PIN required).</div>
      <button type="button" class="btn-primary" onclick="openModeSetupModal()">Enter In-Charge mode</button></div>`;
    return;
  }
  assessEnsureControls();
  if (!_assessRows.length && !_assessLoading) runAssessment();
}

async function runAssessment() {
  if (_assessLoading) return;
  const year = document.getElementById('assessYear').value;
  const from = document.getElementById('assessFrom').value;
  const to = document.getElementById('assessTo').value;
  if (parseInt(from, 10) > parseInt(to, 10)) { showToast('"From" month must be before "To" month', 'error'); return; }
  _assessLoading = true;
  const btn = document.getElementById('assessRunBtn');
  const listEl = document.getElementById('assessList');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading data...'; }
  listEl.innerHTML = '<div class="empty-msg">Loading attendance data, please wait...</div>';
  try {
    await loadAreaMap();
    const monthList = assessMonthList(year, from, to);
    const { merged, loadedMonths } = await aggregateMultiMonthEmployees(monthList);
    const rfOnly = (merged || []).filter(e => /^RF/i.test(String(e.id || '').trim()));
    if (!rfOnly.length) throw new Error('No data found for the selected months.');
    const s = assessLoadStore().settings;
    _assessRows = assessComputeAttendance(rfOnly, s).map(it => {
      it.id = String(it.e.id || '').toUpperCase();
      it.name = it.e.name || it.id;
      it.area = (typeof getAreaForId === 'function' ? getAreaForId(it.e.id, true) : it.e.area) || it.e.area || '';
      return it;
    });
    _assessCtx = { year, from, to, loadedMonths, requested: monthList.length };
    const areas = Array.from(new Set(_assessRows.map(r => r.area).filter(Boolean))).sort();
    const aSel = document.getElementById('assessArea');
    const prev = aSel.value;
    aSel.innerHTML = '<option value="all">All areas</option>' + areas.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    if (areas.includes(prev)) aSel.value = prev;
    document.getElementById('assessToolsCard').style.display = 'block';
    assessRenderList();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="empty-msg">${esc(e.message || 'Failed to load data')}</div>`;
  } finally {
    _assessLoading = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Calculate / Refresh'; }
  }
}

function assessCurrentMarks() {
  const st = assessLoadStore();
  return { st, marks: st.marks[_assessCtx.year] || {} };
}

function assessBuildView() {
  const { st, marks } = assessCurrentMarks();
  const s = st.settings;
  return _assessRows.map(r => {
    const jk = marks[r.id];
    const hasJk = jk !== undefined && jk !== '' && !isNaN(Number(jk));
    const total = hasJk ? Number((r.att + Number(jk)).toFixed(2)) : null;
    return Object.assign({}, r, { jk: hasJk ? Number(jk) : null, total, grade: assessGrade(total, s) });
  }).sort((a, b) => {
    if ((b.total != null) - (a.total != null)) return (b.total != null) - (a.total != null);
    if (a.total != null && b.total != null && b.total !== a.total) return b.total - a.total;
    return b.att - a.att;
  });
}

function assessRenderList() {
  const listEl = document.getElementById('assessList');
  const sumEl = document.getElementById('assessSummary');
  if (!listEl) return;
  const area = document.getElementById('assessArea').value;
  const q = document.getElementById('assessSearch').value.trim().toLowerCase();
  const all = assessBuildView();
  const rows = all.filter(r => (area === 'all' || r.area === area) && (!q || r.id.toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q)));
  const done = all.filter(r => r.total != null).length;
  const gradeCount = { A: 0, B: 0, C: 0, D: 0 };
  all.forEach(r => { if (gradeCount[r.grade] != null) gradeCount[r.grade]++; });
  sumEl.style.display = 'flex';
  sumEl.innerHTML = `<span>👥 ${all.length}</span><span>✍️ Scored: ${done}/${all.length}</span>
    <span>A:${gradeCount.A} B:${gradeCount.B} C:${gradeCount.C} D:${gradeCount.D}</span>
    <span>Months: ${_assessCtx.loadedMonths}/${_assessCtx.requested}</span>`;
  if (!rows.length) { listEl.innerHTML = '<div class="empty-msg">No employee found.</div>'; return; }
  listEl.innerHTML = rows.map(r => {
    const rank = all.indexOf(r) + 1;
    const mc = r.months;
    return `<div class="card assess-row" data-id="${esc(r.id)}">
      <div class="assess-row-top">
        <span class="assess-rank">#${rank}</span>
        <div class="assess-who"><div class="assess-name">${esc(r.name)}</div><div class="assess-sub">${esc(r.id)} • ${esc(r.area)}</div></div>
        <span class="assess-grade g-${r.grade === '—' ? 'none' : r.grade}" data-role="grade">${r.grade}</span>
      </div>
      <div class="assess-chips">
        <span>Duty ${r.duty.toFixed(1)}h/m</span>
        <span>Absent ${r.e.generalAbsentCount || 0}d</span>
        <span>Holiday ${r.e.holidayCount || 0}d</span>
        <span>${mc}m</span>
      </div>
      <div class="assess-scores">
        <div class="assess-cell"><small>Attendance /30</small><b data-role="att" data-att="${r.att}">${r.att.toFixed(2)}</b></div>
        <div class="assess-cell"><small>Job Knowledge /70</small>
          <input type="number" inputmode="decimal" min="0" max="${ASSESS_JK_MAX}" step="0.5" class="assess-jk" value="${r.jk != null ? r.jk : ''}" placeholder="0-70"
            oninput="assessOnJkInput(this)" onchange="assessOnJkCommit(this)"></div>
        <div class="assess-cell"><small>Total /100</small><b data-role="total">${r.total != null ? r.total.toFixed(2) : '—'}</b></div>
      </div>
    </div>`;
  }).join('');
}

function assessOnJkInput(inp) {
  const card = inp.closest('.assess-row');
  const att = Number(card.querySelector('[data-role="att"]').dataset.att);
  const s = assessLoadStore().settings;
  let v = inp.value === '' ? null : Number(inp.value);
  if (v != null && (isNaN(v) || v < 0 || v > ASSESS_JK_MAX)) { inp.classList.add('invalid'); v = null; } else inp.classList.remove('invalid');
  const total = v == null ? null : Number((att + v).toFixed(2));
  card.querySelector('[data-role="total"]').textContent = total == null ? '—' : total.toFixed(2);
  const g = assessGrade(total, s);
  const gEl = card.querySelector('[data-role="grade"]');
  gEl.textContent = g; gEl.className = 'assess-grade g-' + (g === '—' ? 'none' : g);
}

function assessOnJkCommit(inp) {
  const card = inp.closest('.assess-row');
  const id = card.dataset.id;
  const st = assessLoadStore();
  const y = _assessCtx.year;
  st.marks[y] = st.marks[y] || {};
  if (inp.value === '') delete st.marks[y][id];
  else {
    let v = Number(inp.value);
    if (isNaN(v) || v < 0 || v > ASSESS_JK_MAX) { showToast(`Job Knowledge must be between 0 and ${ASSESS_JK_MAX}`, 'error'); inp.value = st.marks[y][id] != null ? st.marks[y][id] : ''; inp.classList.remove('invalid'); assessOnJkInput(inp); return; }
    st.marks[y][id] = v;
  }
  assessSaveStore(st);
  assessRenderList();
}

function assessDownload(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function assessExportCsv() {
  const rows = assessBuildView();
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const head = ['Rank','ID','Name','Area','Months','Avg Duty/Month','Absent Days','Holiday Duty Days','Attendance (30)','Job Knowledge (70)','Total (100)','Grade'];
  const lines = [head.map(q).join(',')];
  rows.forEach((r, i) => lines.push([
    i + 1, r.id, r.name, r.area, r.months, r.duty.toFixed(2), r.e.generalAbsentCount || 0, r.e.holidayCount || 0,
    r.att.toFixed(2), r.jk != null ? r.jk : '', r.total != null ? r.total.toFixed(2) : '', r.grade
  ].map(q).join(',')));
  assessDownload(`assessment-${_assessCtx.year}-${_assessCtx.from}-${_assessCtx.to}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

function assessBackupJson() {
  const st = assessLoadStore();
  assessDownload(`assessment-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(st, null, 2), 'application/json');
}

function assessRestoreJson(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!d || typeof d.marks !== 'object') throw new Error('bad');
      const st = assessLoadStore();
      Object.keys(d.marks).forEach(y => { st.marks[y] = Object.assign({}, st.marks[y] || {}, d.marks[y]); });
      if (d.settings) st.settings = Object.assign({}, st.settings, d.settings);
      assessSaveStore(st);
      showToast('Backup restored', 'success');
      if (_assessRows.length) assessRenderList();
    } catch (e) { showToast('Invalid backup file', 'error'); }
    input.value = '';
  };
  rd.readAsText(f);
}

window.renderAssessmentPage = renderAssessmentPage;
window.runAssessment = runAssessment;
