/* ==========================================================================
   PROFILE.JS - "Me" / Employee Profile page (render layer)
   Part 4: header, scope chips, loader wiring, sections A (hero), B (attendance),
   C (monthly income + hide-amounts). Sections D-I arrive in later parts.
   Heavy maths lives in js/calculations/profile.js (no DOM); data loading in
   js/pages/profile-data.js. Privacy: shows only the saved ID's own data.
   No telemetry, no new writes (only a local "hide amounts" preference).
   ========================================================================== */

const _pE = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function _profMyId() {
  try { return String(typeof getPreferredId === 'function' ? getPreferredId() : '').trim().toUpperCase(); } catch (e) { return ''; }
}

/* ------------------------------ empty state ------------------------------ */
function _profRenderEmpty(root) {
  root.innerHTML = `
    <div class="prof-card prof-empty">
      <div class="prof-empty-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
      <h3>Set your ID to see your profile</h3>
      <p class="prof-muted">আপনার ID সেভ করলে এক জায়গায় আপনার OT, Night, Holiday, Absent ও আয়ের হিসাব দেখতে পাবেন।<br>Save your ID once to see all your numbers in one place.</p>
      <div class="prof-id-row">
        <input id="profIdInput" class="prof-id-input" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="14" placeholder="Employee ID" aria-label="Employee ID">
        <button type="button" class="prof-btn prof-btn-primary" id="profSaveIdBtn">Save &amp; open my profile</button>
        <button type="button" class="prof-btn prof-btn-ghost" id="profModeBtn">Mode &amp; ID settings</button>
      </div>
      <div class="prof-err" id="profIdErr" role="alert"></div>
    </div>`;
  const inp = root.querySelector('#profIdInput');
  const err = root.querySelector('#profIdErr');
  const save = () => {
    const id = String(inp.value || '').toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9]{3,14}$/.test(id)) { err.textContent = 'সঠিক ID দিন (Enter a valid ID, letters/numbers only).'; inp.focus(); return; }
    err.textContent = '';
    if (typeof setPreferredId === 'function') setPreferredId(id);
    if (typeof renderMorePage === 'function') { try { renderMorePage(); } catch (e) {} }
    initProfilePage();
  };
  root.querySelector('#profSaveIdBtn').addEventListener('click', save);
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
  root.querySelector('#profModeBtn').addEventListener('click', () => { if (typeof openModeSetupModal === 'function') openModeSetupModal(); });
}

/* ------------------------------ state ------------------------------ */
const _PF_MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const _PF_HIDE_KEY = (typeof STORAGE_NAMESPACE !== 'undefined' ? STORAGE_NAMESPACE : '') + 'rppf_prof_hide';
const _PF_STALE_MS = 30 * 60 * 1000;

const _pf = {
  id: '', dept: '', source: '',
  raw: {},          // ym -> { emp, meta }
  summ: {},         // ym -> computeProfileMonth() result
  queue: [],        // yms waiting for computeProfileMonth (one per task -> no long main-thread block)
  total: 0, done: 0, complete: false, failed: false,
  startedAt: 0, loadedAt: 0, token: 0,
  scope: 'month', ym: '',
  hide: false, bound: false, raf: 0, working: false
};

function _pfReadHide() { try { return localStorage.getItem(_PF_HIDE_KEY) === '1'; } catch (e) { return false; } }
function _pfWriteHide(v) { try { localStorage.setItem(_PF_HIDE_KEY, v ? '1' : '0'); } catch (e) { /* optional */ } }

/* ------------------------------ formatters ------------------------------ */
function _pfYmLabel(ym, short) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/); if (!m) return ym || '';
  const name = _PF_MONTH_FULL[+m[2] - 1] || '';
  return (short ? name.slice(0, 3) : name) + ' ' + m[1];
}
function _pfMonName(ym, short) {
  const m = String(ym || '').match(/^\d{4}-(\d{2})$/); if (!m) return '';
  const n = _PF_MONTH_FULL[+m[1] - 1] || '';
  return short ? n.slice(0, 3) : n;
}
function _pfMoney(n) { return '৳ ' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
function _pfAmt(n) { return '<span class="prof-amt">' + _pE(_pfMoney(n)) + '</span>'; }
function _pfCompact(n) {
  n = Math.round(Number(n) || 0);
  if (n >= 100000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
function _pfPct(p) { return p == null ? '—' : (p % 1 === 0 ? String(p) : p.toFixed(1)) + '%'; }
function _pfHrs(h) { return typeof profFmtHours === 'function' ? profFmtHours(h) : String(h); }
function _pfInt(n) { return Math.round(Number(n) || 0).toLocaleString('en-IN'); }

/* ------------------------------ scope helpers ------------------------------ */
function _pfCur() { return profCurrentYm(); }
function _pfWanted() { return profMonthRange(PROF_FIRST_MONTH, _pfCur()); }
function _pfYearOf(ym) { return String(ym || '').slice(0, 4); }
function _pfScopeMonths() {      // months covered by the current scope
  if (_pf.scope === 'year') {
    const y = _pfYearOf(_pfCur());
    return _pfWanted().filter(m => _pfYearOf(m) === y);
  }
  return [_pf.ym];
}
function _pfListMonths() {       // month-wise lists / chart: the whole year of the scope
  const y = _pf.scope === 'year' ? _pfYearOf(_pfCur()) : _pfYearOf(_pf.ym);
  return _pfWanted().filter(m => _pfYearOf(m) === y);
}
function _pfIsOpenMonth(ym) { return ym === _pfCur(); } // current month still running -> "so far"

/* ------------------------------ data wiring ------------------------------ */
function _pfSchedule() {
  if (_pf.raf) return;
  _pf.raf = requestAnimationFrame(() => { _pf.raf = 0; _pfRenderDynamic(); });
}

function _pfPump() { // one month per task: keeps every task well under ~50 ms
  if (_pf.working) return;
  _pf.working = true;
  const step = () => {
    const ym = _pf.queue.shift();
    if (!ym) { _pf.working = false; _pfSchedule(); return; }
    const r = _pf.raw[ym];
    if (r) {
      try { _pf.summ[ym] = computeProfileMonth(r.emp, ym, { dsMeta: r.meta, prevNight: !!(r.meta && r.meta.prevNight) }); }
      catch (e) { _pf.summ[ym] = { ym: ym, exists: false, error: true }; }
    }
    _pfSchedule();
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

function _pfOnMonth(token, ym, emp, meta) {
  if (token !== _pf.token) return;
  _pf.raw[ym] = { emp: emp || null, meta: meta || { maxActiveDay: 31, consensusHolidays: [], prevNight: false } };
  if (_pf.queue.indexOf(ym) < 0) _pf.queue.push(ym);
  _pfPump();
}

function _pfStartLoad(id, quiet) {
  const token = ++_pf.token;
  _pf.id = id; _pf.complete = false; _pf.failed = false; _pf.done = 0; _pf.startedAt = Date.now();
  if (!quiet) { _pf.raw = {}; _pf.summ = {}; _pf.queue = []; }
  const wanted = _pfWanted();
  _pf.total = wanted.length;
  _pf.dept = typeof getClientDepartment === 'function' ? getClientDepartment() : 'PR';
  let p;
  try {
    p = profLoadHistory(id, {
      dept: _pf.dept, wantedMonths: wanted, primaryMonth: wanted[wanted.length - 1],
      onMonth: (ym, emp, meta) => _pfOnMonth(token, ym, emp, meta),
      onProgress: (d, t) => { if (token !== _pf.token) return; _pf.done = d; _pf.total = t; _pfRenderProgress(); }
    });
  } catch (e) { p = Promise.reject(e); }
  p.then(res => {
    if (token !== _pf.token) return;
    _pf.source = res.source; _pf.complete = true; _pf.loadedAt = Date.now(); _pfPump(); _pfSchedule(); _pfRenderProgress();
  }).catch(() => {
    if (token !== _pf.token) return;
    _pf.failed = true; _pf.complete = true; _pfSchedule(); _pfRenderProgress();
  });
}

/* ------------------------------ mount + events ------------------------------ */
function _pfMount(root) {
  root.innerHTML = '<div id="profHead"></div><div id="profChips"></div><div id="profProg"></div><div id="profBody"></div>';
  if (!_pf.bound || root.dataset.pfBound !== '1') {
    root.dataset.pfBound = '1'; _pf.bound = true;
    root.addEventListener('click', _pfOnClick);
    root.addEventListener('change', _pfOnChange);
  }
}

function _pfOnClick(ev) {
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const act = t.getAttribute('data-act');
  if (act === 'scope') {
    const v = t.getAttribute('data-val');
    if (v === 'year') { _pf.scope = 'year'; _pf.ym = _pfCur(); }
    else { _pf.scope = 'month'; _pf.ym = v === 'last' ? profPrevYm(_pfCur()) : _pfCur(); }
    _pfRenderChips(); _pfRenderDynamic();
  } else if (act === 'hide') {
    _pf.hide = !_pf.hide; _pfWriteHide(_pf.hide); _pfApplyHide();
  } else if (act === 'report') {
    _pfPrefillReport();
    if (typeof switchPage === 'function') switchPage('report');
  } else if (act === 'share') {
    _pfShareSummary(true);
  } else if (act === 'cmpload') {
    _pfLoadCompare(t.getAttribute('data-ym'));
  } else if (act === 'rank') {
    if (typeof switchPage === 'function') switchPage('leaderboard');
  } else if (act === 'erp') {
    _pfReportToErp(t.getAttribute('data-ym'), t.getAttribute('data-t'), t.getAttribute('data-i'));
  } else if (act === 'vs') {
    if (typeof switchPage === 'function') switchPage('vs');
  } else if (act === 'chid') {
    if (typeof openModeSetupModal === 'function') openModeSetupModal();
  } else if (act === 'retry') {
    _pfStartLoad(_pf.id, false); _pfRenderChips(); _pfRenderDynamic(); _pfRenderProgress();
  }
}
function _pfOnChange(ev) {
  const t = ev.target; if (!t || t.getAttribute('data-act') !== 'pick') return;
  if (!t.value) return;
  _pf.scope = 'month'; _pf.ym = t.value;
  _pfRenderChips(); _pfRenderDynamic();
}

function _pfApplyHide() {
  const root = document.getElementById('profileRoot'); if (!root) return;
  root.classList.toggle('prof-hide-amt', _pf.hide);
  const b = root.querySelector('[data-act="hide"]');
  if (b) { b.setAttribute('aria-pressed', _pf.hide ? 'true' : 'false'); b.innerHTML = _pfEyeIcon(_pf.hide); b.setAttribute('aria-label', _pf.hide ? 'Show amounts (টাকার অঙ্ক দেখান)' : 'Hide amounts (টাকার অঙ্ক লুকান)'); }
}
function _pfEyeIcon(off) {
  return off
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19.5C6.5 19.5 2.5 12 2.5 12a19 19 0 0 1 4.2-5.2M9.9 4.7A9.7 9.7 0 0 1 12 4.5c5.5 0 9.5 7.5 9.5 7.5a19 19 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6.5 4.5 12 4.5 21.5 12 21.5 12 17.5 19.5 12 19.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
}

/* ------------------------------ header + chips ------------------------------ */
function _pfInfo() { // newest month that has a record
  const yms = Object.keys(_pf.summ).filter(m => _pf.summ[m] && _pf.summ[m].exists).sort();
  for (let i = yms.length - 1; i >= 0; i--) { const s = _pf.summ[yms[i]]; if (s.profileInfo) return s.profileInfo; }
  return null;
}
function _pfInitials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w[0][0] + (w.length > 1 ? w[1][0] : '')).toUpperCase();
}

function _pfRenderHead() {
  const el = document.getElementById('profHead'); if (!el) return;
  const inf = _pfInfo();
  const name = inf && inf.name ? inf.name : '';
  const meta = inf ? [inf.grade, inf.kind, inf.category].filter(Boolean).join(' · ') : '';
  const area = inf ? [inf.area, inf.sub].filter(Boolean).join(' › ') : '';
  const deptTxt = _pf.dept === 'QA' ? 'QA' : 'PR';
  el.innerHTML = `
    <div class="prof-card prof-head">
      <div class="prof-avatar" aria-hidden="true">${_pE(name ? _pfInitials(name) : '…')}</div>
      <div class="prof-head-main">
        ${name ? `<div class="prof-name">${_pE(name)}</div>` : '<div class="prof-name prof-skel prof-skel-line" style="width:60%"></div>'}
        <div class="prof-idline"><span class="prof-chip-id">ID ${_pE(_pf.id)}</span><span class="prof-dept">${_pE(deptTxt)}</span></div>
        ${meta ? `<div class="prof-sub">${_pE(meta)}</div>` : ''}
        ${area ? `<div class="prof-sub">${_pE(area)}</div>` : ''}
      </div>
      <div class="prof-head-actions">
        <button type="button" class="prof-iconbtn" data-act="hide" aria-pressed="false" aria-label="Hide amounts (টাকার অঙ্ক লুকান)">${_pfEyeIcon(false)}</button>
        <button type="button" class="prof-iconbtn prof-iconbtn-txt" data-act="chid" aria-label="Change ID or mode">ID</button>
      </div>
    </div>`;
  _pfApplyHide();
}

function _pfRenderChips() {
  const el = document.getElementById('profChips'); if (!el) return;
  const cur = _pfCur(), prev = profPrevYm(cur), yr = _pfYearOf(cur);
  const isCur = _pf.scope === 'month' && _pf.ym === cur;
  const isPrev = _pf.scope === 'month' && _pf.ym === prev;
  const isYear = _pf.scope === 'year';
  const isPick = !isCur && !isPrev && !isYear;
  const opts = _pfWanted().slice().reverse().map(m => `<option value="${m}"${isPick && m === _pf.ym ? ' selected' : ''}>${_pE(_pfYmLabel(m, true))}</option>`).join('');
  el.innerHTML = `
    <div class="prof-chips" role="group" aria-label="Choose period (সময় বাছুন)">
      <button type="button" class="prof-chip${isCur ? ' on' : ''}" data-act="scope" data-val="cur" aria-pressed="${isCur}">This month</button>
      <button type="button" class="prof-chip${isPrev ? ' on' : ''}" data-act="scope" data-val="last" aria-pressed="${isPrev}">Last month</button>
      <button type="button" class="prof-chip${isYear ? ' on' : ''}" data-act="scope" data-val="year" aria-pressed="${isYear}">This year (${_pE(yr)})</button>
      <label class="prof-chip prof-chip-pick${isPick ? ' on' : ''}"><span class="prof-sr">Pick a month</span>
        <select data-act="pick" aria-label="Pick a month (মাস বাছুন)"><option value=""${isPick ? '' : ' selected'}>Pick month ▾</option>${opts}</select>
      </label>
    </div>`;
}

function _pfRenderProgress() {
  const el = document.getElementById('profProg'); if (!el) return;
  if (_pf.failed) {
    el.innerHTML = `<div class="prof-card prof-warn" role="alert"><b>Could not load your history.</b> ডেটা লোড করা যায়নি — ইন্টারনেট দেখে আবার চেষ্টা করুন.<div class="prof-links"><button type="button" class="prof-btn prof-btn-primary" data-act="retry">Retry</button></div></div>`;
    return;
  }
  const slow = Date.now() - _pf.startedAt > 350;
  if (_pf.complete || !slow || !_pf.total) { el.innerHTML = ''; return; }
  const pct = Math.max(4, Math.round(_pf.done / _pf.total * 100));
  el.innerHTML = `<div class="prof-prog"><div class="prof-prog-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${_pf.total}" aria-valuenow="${_pf.done}"><i style="width:${pct}%"></i></div><div class="prof-muted">Loading ${_pf.done}/${_pf.total} months… (মাস লোড হচ্ছে)</div></div>`;
  if (!_pf.complete) setTimeout(_pfRenderProgress, 400); // reveal the bar if the load stays slow
}

/* ------------------------------ sections ------------------------------ */
function _pfSkel(h) { return `<div class="prof-card prof-skel-card" style="height:${h}px" aria-hidden="true"><div class="prof-skel prof-skel-line" style="width:40%"></div><div class="prof-skel prof-skel-block"></div></div>`; }

function _pfPendingMonths(list) { return list.filter(m => _pf.summ[m] === undefined); }

function _pfScopeAgg() {
  const list = _pfScopeMonths().map(m => _pf.summ[m]).filter(Boolean);
  return aggregateProfile(list);
}

function _pfHeroTile(k, kb, val, sub, cls) {
  return `<div class="prof-tile${cls ? ' ' + cls : ''}"><div class="prof-tile-k">${k}<span>${kb}</span></div><div class="prof-tile-v">${val}</div>${sub ? `<div class="prof-tile-s">${sub}</div>` : ''}</div>`;
}

function _pfSectionA() {
  const months = _pfScopeMonths();
  const isYear = _pf.scope === 'year';
  const pend = _pfPendingMonths(months);
  const title = isYear ? 'Year at a glance' : 'Month at a glance';
  const bn_ = isYear ? 'বছরের সারসংক্ষেপ' : 'মাসের সারসংক্ষেপ';
  if (pend.length) return _pfSkel(236);
  const t = _pfScopeAgg();
  const scopeTxt = isYear
    ? `${_pE(_pfYearOf(_pfCur()))} · ${t.monthsWithData} month${t.monthsWithData === 1 ? '' : 's'} with data`
    : `${_pE(_pfYmLabel(_pf.ym))}${_pfIsOpenMonth(_pf.ym) ? ' · so far' : ''}`;
  if (!t.monthsWithData) {
    return `<div class="prof-card"><h3>${title} <span class="prof-bn">${bn_}</span></h3><p class="prof-muted">${scopeTxt}</p>
      <p class="prof-note">এই সময়ে আপনার কোনো রেকর্ড পাওয়া যায়নি। <br>No record found for you in this period yet.</p></div>`;
  }
  const tiles = [
    _pfHeroTile('Total OT', 'মোট OT', `${_pfHrs(t.otHours)}<small>h</small>`, isYear && t.avgOtPerMonth != null ? `avg ${_pfHrs(t.avgOtPerMonth)}h / month` : ''),
    _pfHeroTile('OT income', 'মোট আয়', _pfAmt(t.totalEarned), isYear && t.avgEarnedPerMonth != null ? `avg ${_pfAmt(t.avgEarnedPerMonth)} / month` : '', 'prof-tile-money'),
    _pfHeroTile('Night duties', 'রাতের ডিউটি', _pfInt(t.nightCount), ''),
    _pfHeroTile('Holiday duties', 'ছুটির ডিউটি', _pfInt(t.holidayCount), ''),
    _pfHeroTile('Absent days', 'অনুপস্থিত', _pfInt(t.absentDays), ''),
    _pfHeroTile('Avg present', 'গড় উপস্থিতি', _pfPct(t.presentPct), t.scheduledDays ? `${_pfInt(t.presentDays)} of ${_pfInt(t.scheduledDays)} days` : 'no scheduled days')
  ];
  if (t.leaveDays > 0) tiles.push(_pfHeroTile('Approved long leave', 'অনুমোদিত দীর্ঘ ছুটি', _pfInt(t.leaveDays) + '<small> days</small>', '', 'prof-tile-wide'));
  const partial = isYear && !_pf.complete;
  return `<div class="prof-card" id="profA"${partial ? ' aria-busy="true"' : ''}>
    <h3>${title} <span class="prof-bn">${bn_}</span></h3>
    <p class="prof-muted">${scopeTxt}</p>
    <div class="prof-hero-grid">${tiles.join('')}</div>
  </div>`;
}

function _pfSectionB() {
  const list = _pfListMonths();
  const isYear = _pf.scope === 'year';
  const pendScope = _pfPendingMonths(_pfScopeMonths());
  if (pendScope.length) return _pfSkel(300);
  const t = _pfScopeAgg();
  const rows = list.map(ym => {
    const s = _pf.summ[ym];
    const sel = !isYear && ym === _pf.ym;
    const name = _pE(_pfMonName(ym, false));
    const so = _pfIsOpenMonth(ym) ? ' <em class="prof-sofar">so far</em>' : '';
    if (s === undefined) return `<li class="prof-mrow prof-pend"><span class="prof-mname">${name}</span><span class="prof-mbar"><i style="width:0"></i></span><span class="prof-mval">…</span></li>`;
    if (!s.exists || s.presentPct == null) {
      return `<li class="prof-mrow prof-mempty${sel ? ' sel' : ''}"><span class="prof-mname">${name}${so}</span><span class="prof-mval">— <em>${s.exists ? 'no scheduled days' : 'no record'}</em></span></li>`;
    }
    const cnt = [`Absent ${s.absentDays}`].concat(s.leaveDays > 0 ? [`Leave ${s.leaveDays}`] : []).join(' · ');
    const lvl = s.presentPct >= 95 ? 'ok' : s.presentPct >= 85 ? 'mid' : 'low';
    return `<li class="prof-mrow${sel ? ' sel' : ''}"><span class="prof-mname">${name}${so}</span>
      <span class="prof-mbar ${lvl}" role="img" aria-label="${_pE(_pfMonName(ym))} present ${_pfPct(s.presentPct)}"><i style="width:${Math.max(0, Math.min(100, s.presentPct))}%"></i></span>
      <span class="prof-mval">${_pfPct(s.presentPct)}</span><span class="prof-mcnt">${cnt}</span></li>`;
  }).join('');
  const scopeLine = isYear ? `${_pE(_pfYearOf(_pfCur()))} total` : `${_pE(_pfYmLabel(_pf.ym))}${_pfIsOpenMonth(_pf.ym) ? ' · so far' : ''}`;
  const summary = t.monthsWithData ? `
    <div class="prof-att-sum">
      <div><b>${_pfInt(t.presentDays)}</b><span>Present · উপস্থিত</span></div>
      <div><b>${_pfInt(t.absentDays)}</b><span>Absent · অনুপস্থিত</span></div>
      ${t.leaveDays > 0 ? `<div><b>${_pfInt(t.leaveDays)}</b><span>Approved long leave · দীর্ঘ ছুটি</span></div>` : ''}
      <div><b>${_pfPct(t.presentPct)}</b><span>Present % · উপস্থিতি</span></div>
    </div>` : '<p class="prof-note">No attendance data in this period. / এই সময়ে উপস্থিতির ডেটা নেই।</p>';
  return `<div class="prof-card" id="profB">
    <h3>Attendance <span class="prof-bn">উপস্থিতি · Leave / Absent</span></h3>
    <p class="prof-muted">${scopeLine}</p>
    ${summary}
    <ul class="prof-mlist" aria-label="Month-wise present percentage">${rows}</ul>
    <details class="prof-how"><summary>How is this calculated? <span class="prof-bn">কীভাবে হিসাব হয়?</span></summary>
      <div class="prof-how-body">
        <p><b>Present % = present days ÷ scheduled working days × 100</b></p>
        <p>Scheduled = closed general working days. Thu/Fri weekly off, plant/government holidays, the day off after a night shift, and days not yet closed are <u>not</u> scheduled. Work done on a day off or holiday is counted in Holiday duty, not here.</p>
        <p>Any scheduled day with no punch is <b>Absent</b>. Approved long leave (only if the admin has recorded one) lowers the % but is shown separately. Days with only one punch are left out and appear under “Check before payroll”. The current month uses closed days only. Year % is total present ÷ total scheduled (not an average of monthly %).</p>
        <p class="prof-bn">কাজের দিনে punch না থাকলে Absent। চলতি মাসে শুধু শেষ হওয়া দিন ধরা হয়। “—” মানে ওই মাসে আপনার রেকর্ড নেই।</p>
      </div>
    </details>
  </div>`;
}

function _pfChartSvg(list, selYm, isYear) {
  const W = 340, H = 176, PL = 8, PR = 8, top = 22, bottom = 22, plotH = H - top - bottom;
  const n = list.length || 1;
  const slot = (W - PL - PR) / Math.max(n, 6);
  const off = PL + ((W - PL - PR) - slot * n) / 2;
  const bw = Math.min(30, slot * 0.64);
  let max = 0;
  list.forEach(ym => { const s = _pf.summ[ym]; if (s && s.exists) max = Math.max(max, s.totalEarned || 0); });
  if (max <= 0) max = 1;
  let g = '';
  list.forEach((ym, i) => {
    const s = _pf.summ[ym];
    const cx = off + slot * i + slot / 2, x = cx - bw / 2;
    const lab = _pfMonName(ym, true);
    const sel = !isYear && ym === selYm;
    let bars = '', val = '';
    if (s === undefined) { val = `<text x="${cx}" y="${top + plotH - 4}" class="pf-t pf-t-dim" text-anchor="middle">…</text>`; }
    else if (!s.exists) { val = `<text x="${cx}" y="${top + plotH - 4}" class="pf-t pf-t-dim" text-anchor="middle">—</text>`; }
    else {
      const parts = [['pf-seg-ot', s.otAmount], ['pf-seg-hol', s.holidayAmount], ['pf-seg-nt', s.nightAmount]];
      let y = top + plotH;
      parts.forEach(p => {
        const h = (p[1] || 0) / max * plotH; if (h <= 0) return;
        const hh = Math.max(h, 0.8); y -= hh;
        bars += `<rect class="${p[0]}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5"/>`;
      });
      if ((s.totalEarned || 0) > 0) val = `<text x="${cx.toFixed(1)}" y="${(y - 4).toFixed(1)}" class="pf-t prof-amt" text-anchor="middle">${_pfCompact(s.totalEarned)}</text>`;
      else val = `<text x="${cx.toFixed(1)}" y="${top + plotH - 4}" class="pf-t pf-t-dim" text-anchor="middle">0</text>`;
    }
    const dim = (!isYear && !sel) ? ' pf-dim' : '';
    g += `<g class="pf-col${dim}">${sel ? `<rect class="pf-sel" x="${(cx - slot / 2 + 1).toFixed(1)}" y="2" width="${(slot - 2).toFixed(1)}" height="${H - 4}" rx="6"/>` : ''}${bars}${val}<text x="${cx.toFixed(1)}" y="${H - 6}" class="pf-t pf-t-lab" text-anchor="middle">${_pE(lab)}</text></g>`;
  });
  return `<svg class="prof-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly income chart. Exact values are listed below." focusable="false"><line x1="${PL}" y1="${top + plotH}" x2="${W - PR}" y2="${top + plotH}" class="pf-axis"/>${g}</svg>`;
}

function _pfSectionC() {
  const list = _pfListMonths();
  const isYear = _pf.scope === 'year';
  const pendScope = _pfPendingMonths(_pfScopeMonths());
  if (pendScope.length) return _pfSkel(380);
  const t = _pfScopeAgg();
  const yearSumm = list.map(m => _pf.summ[m]).filter(s => s && s.exists);
  const yAgg = aggregateProfile(yearSumm);
  // headline numbers follow the scope; best / average always describe the year being charted
  let headLabel, headVal, change = null;
  if (isYear) { headLabel = `${_pE(_pfYearOf(_pfCur()))} total`; headVal = t.totalEarned; change = yAgg.lastChange; }
  else {
    headLabel = `${_pE(_pfYmLabel(_pf.ym))}${_pfIsOpenMonth(_pf.ym) ? ' · so far' : ''}`; headVal = t.totalEarned;
    const prevS = _pf.summ[profPrevYm(_pf.ym)];
    const curS = _pf.summ[_pf.ym];
    if (curS && curS.exists && prevS && prevS.exists) change = { ym: _pf.ym, prevYm: prevS.ym, earned: curS.totalEarned - prevS.totalEarned, earnedPct: prevS.totalEarned > 0 ? Math.round((curS.totalEarned - prevS.totalEarned) / prevS.totalEarned * 1000) / 10 : null };
  }
  if (!t.monthsWithData && !yAgg.monthsWithData) {
    return `<div class="prof-card" id="profC"><h3>Monthly OT income <span class="prof-bn">মাসিক আয়</span></h3><p class="prof-note">No income data yet. / এখনও কোনো আয়ের ডেটা নেই।</p></div>`;
  }
  const chg = change ? `<span class="prof-delta ${change.earned > 0 ? 'up' : change.earned < 0 ? 'down' : ''}">${change.earned > 0 ? '▲' : change.earned < 0 ? '▼' : '='} ${_pfAmt(Math.abs(change.earned))}${change.earnedPct != null ? ` (${Math.abs(change.earnedPct)}%)` : ''}<em> vs ${_pE(_pfMonName(change.prevYm, true))}${_pfIsOpenMonth(change.ym) ? ' · month still running' : ''}</em></span>` : '';
  const best = yAgg.bestMonth ? `${_pE(_pfMonName(yAgg.bestMonth.ym, false))}<br>${_pfAmt(yAgg.bestMonth.totalEarned)}` : '—';
  const avg = yAgg.avgEarnedPerMonth != null ? _pfAmt(yAgg.avgEarnedPerMonth) : '—';
  const rows = list.map(ym => {
    const s = _pf.summ[ym];
    if (!s || !s.exists) return `<tr><th scope="row">${_pE(_pfMonName(ym, true))}</th><td colspan="4" class="prof-dim">${s === undefined ? '…' : 'no record'}</td></tr>`;
    return `<tr${!isYear && ym === _pf.ym ? ' class="sel"' : ''}><th scope="row">${_pE(_pfMonName(ym, true))}</th><td>${_pfAmt(s.otAmount)}</td><td>${_pfAmt(s.holidayAmount)}</td><td>${_pfAmt(s.nightAmount)}</td><td><b>${_pfAmt(s.totalEarned)}</b></td></tr>`;
  }).join('');
  return `<div class="prof-card" id="profC">
    <div class="prof-card-head"><h3>Monthly OT income <span class="prof-bn">মাসিক আয়</span></h3>
      <button type="button" class="prof-iconbtn prof-iconbtn-sm" data-act="hide" aria-pressed="${_pf.hide}" aria-label="${_pf.hide ? 'Show amounts (টাকার অঙ্ক দেখান)' : 'Hide amounts (টাকার অঙ্ক লুকান)'}">${_pfEyeIcon(_pf.hide)}</button></div>
    <div class="prof-bigline"><div class="prof-big">${_pfAmt(headVal)}</div><div class="prof-muted">${headLabel}</div></div>
    ${chg ? `<div class="prof-deltaline">${chg}</div>` : ''}
    <div class="prof-chart-wrap">${_pfChartSvg(list, _pf.ym, isYear)}</div>
    <div class="prof-legend" aria-hidden="false"><span><i class="lg lg-ot"></i>OT</span><span><i class="lg lg-hol"></i>Holiday</span><span><i class="lg lg-nt"></i>Night</span></div>
    <div class="prof-kv"><div><span>Best month · সেরা মাস</span><b>${best}</b></div><div><span>Avg / month · মাসিক গড়</span><b>${avg}</b></div></div>
    <details class="prof-how"><summary>Month-wise amounts <span class="prof-bn">মাসওয়ারি টাকা</span></summary>
      <div class="prof-tablewrap"><table class="prof-table"><thead><tr><th></th><th>OT</th><th>Holiday</th><th>Night</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
    </details>
    <p class="prof-muted prof-foot">Amounts come from the payroll rates engine — nothing is recomputed here. / টাকার অঙ্ক সিস্টেমের হিসাব থেকে নেওয়া।</p>
  </div>`;
}

/* ---- shared helpers for D / E / F / H ---- */
function _pfDateParts(d) { // 'DD-MON-YYYY' or 'YYYY-MM-DD' -> { day, mon, key }
  const s = String(d || '');
  let m = s.match(/^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{4})$/);
  if (m) return { day: +m[1], mon: m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase() };
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { day: +m[3], mon: _PF_MONTH_FULL[+m[2] - 1].slice(0, 3) };
  return { day: 0, mon: s };
}
function _pfChips(dates, extraFn) {
  const arr = (dates || []).slice().sort((a, b) => _pfDateParts(_pfDateOf(a)).day - _pfDateParts(_pfDateOf(b)).day);
  if (!arr.length) return '<span class="prof-dim">—</span>';
  return '<div class="prof-dchips">' + arr.map(x => {
    const p = _pfDateParts(_pfDateOf(x)); const ex = extraFn ? extraFn(x) : '';
    return `<span class="prof-dchip"><b>${p.day || ''}</b> ${_pE(p.mon)}${ex ? `<em>${ex}</em>` : ''}</span>`;
  }).join('') + '</div>';
}
function _pfDateOf(x) { return typeof x === 'string' ? x : (x && x.date) || ''; }

function _pfMiniBars(list, valFn, fmt, selYm, isYear) {
  const W = 340, H = 110, top = 16, bottom = 18, plotH = H - top - bottom, PL = 8;
  const n = list.length || 1, slot = (W - 2 * PL) / Math.max(n, 6), off = PL + ((W - 2 * PL) - slot * n) / 2, bw = Math.min(26, slot * 0.6);
  let max = 0; list.forEach(ym => { const s = _pf.summ[ym]; if (s && s.exists) max = Math.max(max, valFn(s) || 0); });
  if (max <= 0) max = 1;
  let g = '';
  list.forEach((ym, i) => {
    const s = _pf.summ[ym], cx = off + slot * i + slot / 2, sel = !isYear && ym === selYm;
    let bar = '', val;
    if (!s || !s.exists) val = `<text x="${cx.toFixed(1)}" y="${top + plotH - 3}" class="pf-t pf-t-dim" text-anchor="middle">${s === undefined ? '…' : '—'}</text>`;
    else {
      const v = valFn(s) || 0, h = v / max * plotH;
      if (h > 0) bar = `<rect class="pf-seg-ot" x="${(cx - bw / 2).toFixed(1)}" y="${(top + plotH - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"/>`;
      val = `<text x="${cx.toFixed(1)}" y="${(top + plotH - h - 3).toFixed(1)}" class="pf-t" text-anchor="middle">${_pE(fmt(v))}</text>`;
    }
    g += `<g class="${(!isYear && !sel) ? 'pf-dim' : ''}">${sel ? `<rect class="pf-sel" x="${(cx - slot / 2 + 1).toFixed(1)}" y="1" width="${(slot - 2).toFixed(1)}" height="${H - 2}" rx="6"/>` : ''}${bar}${val}<text x="${cx.toFixed(1)}" y="${H - 4}" class="pf-t pf-t-lab" text-anchor="middle">${_pE(_pfMonName(ym, true))}</text></g>`;
  });
  return `<svg class="prof-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Month-wise chart. Exact values are shown as numbers on the chart." focusable="false"><line x1="${PL}" y1="${top + plotH}" x2="${W - PL}" y2="${top + plotH}" class="pf-axis"/>${g}</svg>`;
}

function _pfScopeHead() {
  return _pf.scope === 'year' ? `${_pE(_pfYearOf(_pfCur()))} total` : `${_pE(_pfYmLabel(_pf.ym))}${_pfIsOpenMonth(_pf.ym) ? ' · so far' : ''}`;
}
function _pfReady() { return _pfPendingMonths(_pfScopeMonths()).length === 0; }

function _pfSectionD() {
  if (!_pfReady()) return _pfSkel(300);
  const list = _pfListMonths(), isYear = _pf.scope === 'year';
  const t = _pfScopeAgg();
  const yAgg = aggregateProfile(list.map(m => _pf.summ[m]).filter(s => s && s.exists));
  if (!t.monthsWithData) return `<div class="prof-card" id="profD"><h3>Total OT <span class="prof-bn">মোট ওভারটাইম</span></h3><p class="prof-note">No OT data in this period. / এই সময়ে OT ডেটা নেই।</p></div>`;
  return `<div class="prof-card" id="profD">
    <h3>Total OT <span class="prof-bn">মোট ওভারটাইম</span></h3>
    <p class="prof-muted">${_pfScopeHead()}</p>
    <div class="prof-kv3">
      <div><span>${isYear ? 'This year' : 'This month'}</span><b>${_pfHrs(t.otHours)}h</b></div>
      <div><span>${isYear ? 'Last month' : 'This year'}</span><b>${isYear ? _pfOtOf(profPrevYm(_pfCur())) : _pfHrs(yAgg.otHours) + 'h'}</b></div>
      <div><span>Avg / month · গড়</span><b>${yAgg.avgOtPerMonth != null ? _pfHrs(yAgg.avgOtPerMonth) + 'h' : '—'}</b></div>
    </div>
    <div class="prof-chart-wrap">${_pfMiniBars(list, s => s.otHours, v => _pfHrs(v), _pf.ym, isYear)}</div>
  </div>`;
}
function _pfOtOf(ym) { const s = _pf.summ[ym]; return s && s.exists ? _pfHrs(s.otHours) + 'h' : '—'; }

function _pfDutySection(id, title, bn_, countKey, datesKey, extraFn, unitWord) {
  if (!_pfReady()) return _pfSkel(260);
  const list = _pfListMonths(), isYear = _pf.scope === 'year';
  const t = _pfScopeAgg();
  const yAgg = aggregateProfile(list.map(m => _pf.summ[m]).filter(s => s && s.exists));
  if (!t.monthsWithData) return `<div class="prof-card" id="${id}"><h3>${title} <span class="prof-bn">${bn_}</span></h3><p class="prof-note">No data in this period. / এই সময়ে ডেটা নেই।</p></div>`;
  const rows = list.filter(ym => { const s = _pf.summ[ym]; return s && s.exists && (s[countKey] > 0 || (!isYear && ym === _pf.ym)); }).reverse().map(ym => {
    const s = _pf.summ[ym];
    return `<li class="prof-drow${!isYear && ym === _pf.ym ? ' sel' : ''}"><div class="prof-drow-h"><b>${_pE(_pfMonName(ym, false))}</b><span>${_pfInt(s[countKey])} ${s[countKey] === 1 ? unitWord.replace(/s$/, '') : unitWord}</span></div>${_pfChips(s[datesKey], extraFn)}</li>`;
  }).join('');
  return `<div class="prof-card" id="${id}">
    <h3>${title} <span class="prof-bn">${bn_}</span></h3>
    <p class="prof-muted">${_pfScopeHead()}</p>
    <div class="prof-kv3">
      <div><span>${isYear ? 'This year' : 'This month'}</span><b>${_pfInt(t[countKey])}</b></div>
      <div><span>${isYear ? 'Last month' : 'This year'}</span><b>${isYear ? (_pf.summ[profPrevYm(_pfCur())] && _pf.summ[profPrevYm(_pfCur())].exists ? _pfInt(_pf.summ[profPrevYm(_pfCur())][countKey]) : '—') : _pfInt(yAgg[countKey])}</b></div>
      <div><span>Avg / month · গড়</span><b>${yAgg.monthsWithData ? (Math.round(yAgg[countKey] / yAgg.monthsWithData * 10) / 10) : '—'}</b></div>
    </div>
    <div class="prof-chart-wrap">${_pfMiniBars(list, s => s[countKey], v => String(v), _pf.ym, isYear)}</div>
    ${rows ? `<ul class="prof-dlist">${rows}</ul>` : '<p class="prof-note">No duties recorded. / কোনো ডিউটি নেই।</p>'}
  </div>`;
}
function _pfSectionE() { return _pfDutySection('profE', 'Night duty', 'রাতের ডিউটি', 'nightCount', 'nightDates', null, 'nights'); }
function _pfSectionF() {
  return _pfDutySection('profF', 'Holiday duty', 'ছুটির ডিউটি', 'holidayCount', 'holidayDates',
    h => (h && (h.duty || h.extra)) ? `${_pfHrs(h.duty)}h${h.extra ? ' +' + _pfHrs(h.extra) : ''}` : '', 'duties');
}

function _pfSectionH() {
  if (!_pfReady()) return _pfSkel(320);
  const list = _pfListMonths(), isYear = _pf.scope === 'year';
  const t = _pfScopeAgg(), P = t.punch || {};
  const tm = v => (typeof profFmtTime12 === 'function' ? profFmtTime12(v) : '—');
  if (!t.monthsWithData) return `<div class="prof-card" id="profH"><h3>My average punch <span class="prof-bn">গড় পাঞ্চ</span></h3><p class="prof-note">No punch data in this period. / এই সময়ে পাঞ্চ ডেটা নেই।</p></div>`;
  let prevS = null; // trend arrow on avg duty vs the previous month that has punches
  const rows = list.map(ym => {
    const s = _pf.summ[ym]; const sel = !isYear && ym === _pf.ym;
    if (s === undefined) return `<tr class="prof-pend"><th scope="row">${_pE(_pfMonName(ym, true))}</th><td colspan="3">…</td></tr>`;
    if (!s.exists || !s.punch || !s.punch.dayN) { return `<tr><th scope="row">${_pE(_pfMonName(ym, true))}</th><td colspan="3" class="prof-dim">${s.exists ? 'no punches' : 'no record'}</td></tr>`; }
    const p = s.punch; let arrow = '';
    if (prevS && prevS.avgDuty != null && p.avgDuty != null) { const d = p.avgDuty - prevS.avgDuty; arrow = Math.abs(d) >= 0.05 ? `<i class="prof-tr ${d > 0 ? 'up' : 'down'}" aria-label="${d > 0 ? 'more' : 'less'} than previous month">${d > 0 ? '▲' : '▼'}</i>` : ''; }
    prevS = p;
    return `<tr${sel ? ' class="sel"' : ''}><th scope="row">${_pE(_pfMonName(ym, true))}</th><td>${tm(p.avgIn)}</td><td>${tm(p.avgOut)}</td><td>${_pfHrs(Math.round(p.avgDuty * 10) / 10)}h ${arrow}</td></tr>`;
  }).join('');
  const night = P.nightN ? `<div class="prof-note">Night shifts (${P.nightN}) — avg In ${tm(P.nightAvgIn)} · avg Out ${tm(P.nightAvgOut)}<br><span class="prof-dim">রাতের শিফট আলাদা হিসাব; দিনের গড়ে ধরা হয়নি।</span></div>` : '';
  return `<div class="prof-card" id="profH">
    <h3>My average punch <span class="prof-bn">গড় পাঞ্চ</span></h3>
    <p class="prof-muted">${_pfScopeHead()} · day shift (${_pfInt(P.dayN || 0)} days)</p>
    <div class="prof-kv3">
      <div><span>Avg In · গড় ইন</span><b>${tm(P.avgIn)}</b></div>
      <div><span>Avg Out · গড় আউট</span><b>${tm(P.avgOut)}</b></div>
      <div><span>Avg duty / day</span><b>${P.avgDuty != null ? _pfHrs(Math.round(P.avgDuty * 10) / 10) + 'h' : '—'}</b></div>
    </div>
    ${night}
    <div class="prof-tablewrap"><table class="prof-table prof-ptable"><thead><tr><th></th><th>Avg In</th><th>Avg Out</th><th>Duty</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="prof-muted prof-foot">Days with a missing In/Out are left out (see “Check before payroll”). / In বা Out না থাকা দিন গড়ে ধরা হয় না।</p>
  </div>`;
}

function _pfSectionLinks() {
  return `<div class="prof-card"><div class="prof-links">
    <button type="button" class="prof-btn prof-btn-primary" data-act="report">Open daily report</button>
    <button type="button" class="prof-btn prof-btn-ghost" data-act="vs">Compare with a colleague</button>
    <button type="button" class="prof-btn prof-btn-ghost" data-act="share">Share my summary (image)</button>
  </div></div>`;
}

/* ---------------- G: Check before payroll (requisition / night / punch issues) ---------------- */
const _PF_ISSUE_T = {
  r: { key: 'requisition', label: 'Requisition', bn: 'রিকুইজিশন', tone: 'req' },
  n: { key: 'nightSuspects', label: 'Night suspect', bn: 'রাত সন্দেহ', tone: 'night' },
  p: { key: 'punchProblems', label: 'Punch problem', bn: 'পাঞ্চ সমস্যা', tone: 'punch' }
};
function _pfIssueItem(ym, t, i, it) {
  const T = _PF_ISSUE_T[t];
  const obj = (it && typeof it === 'object') ? it : { date: String(it || '') };
  const hasTimes = obj.in || obj.out;
  const duty = obj.duty != null ? obj.duty : obj.elapsed;
  const lines = [];
  if (hasTimes) lines.push(`<span>${_pE(obj.in || '—')} ➔ ${_pE(obj.out || '—')}${duty != null ? ' · ' + _pE(_pfHrs(duty)) + 'h duty' : ''}</span>`);
  if (obj.expectedOt) lines.push(`<span>Expected: ${_pE(obj.expectedOt)}</span>`);
  if (obj.reason) lines.push(`<span>${_pE(obj.reason)}</span>`);
  if (!hasTimes && !obj.reason) lines.push('<span>In/Out missing or unreadable · In/Out পাওয়া যায়নি</span>');
  return `<li class="prof-iss prof-iss-${T.tone}"><div class="prof-iss-top"><b>${_pE(obj.date || '—')}${obj.day ? ' · ' + _pE(obj.day) : ''}</b><span class="prof-iss-tag">${T.label}</span></div>
    <div class="prof-iss-det">${lines.join('')}</div>
    <button type="button" class="prof-btn prof-btn-ghost prof-iss-btn" data-act="erp" data-ym="${_pE(ym)}" data-t="${t}" data-i="${i}">Report to ERP Team</button></li>`;
}
function _pfSectionG() {
  if (!_pfReady()) return _pfSkel(220);
  const yms = _pfScopeMonths().filter(m => { const s = _pf.summ[m]; return s && s.exists; }).sort().reverse();
  const tot = { r: 0, n: 0, p: 0 };
  const groups = [];
  yms.forEach(ym => {
    const iss = _pf.summ[ym].issues || {};
    const c = { r: (iss.requisition || []).length, n: (iss.nightSuspects || []).length, p: (iss.punchProblems || []).length };
    tot.r += c.r; tot.n += c.n; tot.p += c.p;
    if (c.r + c.n + c.p) groups.push({ ym, iss, c });
  });
  const head = `<h3>Check before payroll <span class="prof-bn">পেরোলের আগে যাচাই</span></h3><p class="prof-muted">${_pfScopeHead()}</p>`;
  const explain = `<p class="prof-note">Issue দেখালে requisition/OT ERP team-কে জানান। / If an issue shows, tell the ERP team.</p>`;
  if (!groups.length) {
    return `<div class="prof-card prof-ok" id="profG">${head}<p class="prof-allclear">All clear ✅</p><p class="prof-note">No requisition, night or punch issues in this period. / এই সময়ে কোনো সমস্যা নেই।</p></div>`;
  }
  const chips = `<div class="prof-iss-sum"><span class="prof-iss-chip">Requisition issues <b>${_pfInt(tot.r)}</b></span><span class="prof-iss-chip">Night suspects <b>${_pfInt(tot.n)}</b></span><span class="prof-iss-chip">Punch problems <b>${_pfInt(tot.p)}</b></span></div>`;
  const body = groups.map((g, gi) => {
    const items = ['r', 'n', 'p'].map(t => (g.iss[_PF_ISSUE_T[t].key] || []).map((it, i) => _pfIssueItem(g.ym, t, i, it)).join('')).join('');
    const n = g.c.r + g.c.n + g.c.p;
    return `<details class="prof-iss-month"${gi === 0 ? ' open' : ''}><summary><b>${_pE(_pfYmLabel(g.ym))}${_pfIsOpenMonth(g.ym) ? ' · so far' : ''}</b><span>${_pfInt(n)} ${n === 1 ? 'issue' : 'issues'}</span></summary>
      <ul class="prof-iss-list">${items}</ul>
      <button type="button" class="prof-btn prof-btn-primary prof-iss-all" data-act="erp" data-ym="${_pE(g.ym)}" data-t="all">Report all ${_pfInt(n)} to ERP Team</button></details>`;
  }).join('');
  return `<div class="prof-card prof-warn" id="profG">${head}${chips}${explain}${body}</div>`;
}
function _pfIssueLine(t, it) {
  const o = (it && typeof it === 'object') ? it : { date: String(it || '') };
  const d = o.duty != null ? o.duty : o.elapsed;
  let l = `• ${o.date || '—'}`;
  if (o.in || o.out) l += `: In ${o.in || '—'} ➔ Out ${o.out || '—'}${d != null ? ' (' + d + 'h duty)' : ''}`;
  if (o.expectedOt) l += ` | ${o.expectedOt}`;
  if (o.reason) l += ` | ${o.reason}`;
  if (t === 'p' && !o.in && !o.out && !o.reason) l += ': punch missing/unreadable';
  return l;
}
function _pfBuildErpMessage(ym, t, i) {
  const info = _pfInfo() || {};
  const rows = [];
  ['r', 'n', 'p'].forEach(k => {
    if (t !== 'all' && t !== k) return;
    const arr = ((_pf.summ[ym] || {}).issues || {})[_PF_ISSUE_T[k].key] || [];
    arr.forEach((it, idx) => { if (t === 'all' || String(idx) === String(i)) rows.push({ k, line: _pfIssueLine(k, it) }); });
  });
  const parts = [];
  [['r', 'Requisition / OT missing in Empress'], ['n', 'Night duty not marked in Empress'], ['p', 'Punch problem (In/Out missing)']].forEach(([k, label]) => {
    const l = rows.filter(r => r.k === k).map(r => r.line);
    if (l.length) parts.push(`${label}:\n${l.join('\n')}`);
  });
  return `Dear ERP Team,\nEmployee ${info.name || '—'} (${_pf.id}) — ${_pfYmLabel(ym)}.\n\n${parts.join('\n\n')}\n\nPlease check and correct before payroll. Thank you!`;
}
function _pfReportToErp(ym, t, i) {
  const msg = _pfBuildErpMessage(ym, t, i);
  const info = _pfInfo() || {};
  const area = info.area || (typeof getAreaForId === 'function' ? getAreaForId(_pf.id, _pf.dept !== 'QA') : '') || '';
  if (typeof openErpSupportModal === 'function') openErpSupportModal(msg, area);
}

/* ---------------- I-1: streak / best month + mini calendar strip ---------------- */
const _PF_DAY = {
  P: { l: 'P', t: 'Present', cls: 'p' }, A: { l: 'A', t: 'Absent', cls: 'a' }, L: { l: 'L', t: 'Approved leave', cls: 'l' },
  O: { l: 'O', t: 'Off / holiday', cls: 'o' }, N: { l: 'N', t: 'Night', cls: 'n' }, B: { l: 'B', t: 'Punch problem', cls: 'b' }, X: { l: '·', t: 'Pending / no data', cls: 'x' }
};
function _pfStreakInfo() {
  const yms = Object.keys(_pf.summ).filter(m => { const s = _pf.summ[m]; return s && s.exists && s.scheduledDays > 0; }).sort();
  let best = null, perfect = 0;
  yms.forEach(m => { const s = _pf.summ[m]; if (s.presentPct === 100) perfect++; if (!best || s.presentPct >= best.pct) best = { ym: m, pct: s.presentPct }; });
  let streak = 0;
  for (let i = yms.length - 1; i >= 0; i--) { if (_pf.summ[yms[i]].presentPct === 100) streak++; else break; }
  return { best, perfect, streak, months: yms.length, latest: yms[yms.length - 1] || '' };
}
function _pfSectionI1() {
  if (!_pfReady()) return _pfSkel(300);
  const ym = _pf.scope === 'month' ? _pf.ym : (_pfStreakInfo().latest || _pf.ym);
  const s = _pf.summ[ym];
  const st = _pfStreakInfo();
  if (!st.months && !(s && s.exists)) return '';
  const badges = [];
  if (st.streak > 0) badges.push(`<span class="prof-badge prof-badge-ok">🔥 ${st.streak}-month perfect streak</span>`);
  if (st.perfect > 0) badges.push(`<span class="prof-badge">⭐ ${st.perfect} perfect ${st.perfect === 1 ? 'month' : 'months'}</span>`);
  if (st.best) badges.push(`<span class="prof-badge">🏅 Best: ${_pE(_pfMonName(st.best.ym, true))} ${_pfPct(st.best.pct)}</span>`);
  let cal = '<p class="prof-note">No record for this month. / এই মাসে রেকর্ড নেই।</p>';
  if (s && s.exists && Array.isArray(s.strip) && s.strip.length) {
    const byDay = {}; s.strip.forEach(x => { byDay[x.d] = x.s; });
    const first = new Date(s.y, s.m - 1, 1).getDay(), n = s.daysInMonth || 31;
    let todayD = 99; try { const t = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }); if (t.slice(0, 7) === ym) todayD = parseInt(t.slice(8, 10), 10); else if (t.slice(0, 7) < ym) todayD = 0; } catch (e) { /* keep all days */ }
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<span class="prof-cal-c prof-cal-empty" aria-hidden="true"></span>';
    for (let d = 1; d <= n; d++) {
      const k = d > todayD ? 'X' : (byDay[d] || 'X'), D = _PF_DAY[k] || _PF_DAY.X;
      cells += `<span class="prof-cal-c prof-cal-${D.cls}" title="${d}: ${D.t}" aria-label="${d}: ${D.t}"><i>${d}</i><b>${D.l}</b></span>`;
    }
    const wd = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(x => `<span class="prof-cal-wd">${x}</span>`).join('');
    const legend = Object.keys(_PF_DAY).map(k => `<span class="prof-cal-lg"><span class="prof-cal-c prof-cal-${_PF_DAY[k].cls} prof-cal-sm"><b>${_PF_DAY[k].l}</b></span>${_PF_DAY[k].t}</span>`).join('');
    cal = `<div class="prof-cal" role="img" aria-label="Daily status for ${_pE(_pfYmLabel(ym))}">${wd}${cells}</div><div class="prof-cal-legend">${legend}</div>`;
  }
  return `<div class="prof-card" id="profI1"><h3>Days at a glance <span class="prof-bn">দিনের চিত্র</span></h3>
    <p class="prof-muted">${_pE(_pfYmLabel(ym))}${_pfIsOpenMonth(ym) ? ' · so far' : ''}</p>
    ${badges.length ? `<div class="prof-badges">${badges.join('')}</div>` : '<p class="prof-note">No perfect month yet. / এখনও কোনো পারফেক্ট মাস নেই।</p>'}
    ${cal}</div>`;
}

/* ---------------- I-2: early exits ---------------- */
function _pfSectionI2() {
  if (!_pfReady()) return _pfSkel(160);
  const list = _pfListMonths(), isYear = _pf.scope === 'year';
  const t = _pfScopeAgg();
  if (!t.monthsWithData) return '';
  const rows = list.filter(ym => { const x = _pf.summ[ym]; return x && x.exists && x.earlyExits > 0; }).reverse()
    .map(ym => `<li class="prof-drow${!isYear && ym === _pf.ym ? ' sel' : ''}"><div class="prof-drow-h"><b>${_pE(_pfMonName(ym, false))}</b><span>${_pfInt(_pf.summ[ym].earlyExits)}</span></div></li>`).join('');
  return `<div class="prof-card" id="profI2"><h3>Early exits <span class="prof-bn">আগে বের হওয়া</span></h3>
    <p class="prof-muted">${_pfScopeHead()}</p>
    <div class="prof-kv3"><div><span>${isYear ? 'This year' : 'This month'}</span><b>${_pfInt(t.earlyExits)}</b></div></div>
    ${rows ? `<ul class="prof-dlist">${rows}</ul>` : '<p class="prof-note">No early exits. / আগে বের হওয়ার রেকর্ড নেই।</p>'}
  </div>`;
}

/* ---------------- shared: prefill Home/Report for this profile (I-7) ---------------- */
function _pfPrefillReport() {
  const inp = document.getElementById('employeeId');
  if (inp) inp.value = _pf.id;
  try { // open the month the profile is showing
    const ym = _pf.scope === 'month' ? _pf.ym : _pfCur();
    const ys = document.getElementById('yearSelect'), ms = document.getElementById('monthSelect');
    if (ys && ms && /^\d{4}-\d{2}$/.test(ym)) {
      const y = ym.slice(0, 4), m = ym.slice(5, 7);
      if ([...ys.options].some(o => o.value === y)) ys.value = y;
      const mo = [...ms.options].find(o => o.value === m || o.value === String(+m));
      if (mo) ms.value = mo.value;
    }
  } catch (e) { /* keep default month */ }
  if (typeof findReport === 'function') { Promise.resolve(findReport()).catch(() => {}); }
}

/* ---------------- I-3 + I-4: my rank in section + anonymous section average ---------------- */
const _PF_CMP_MIN = 5; // never show a section average for fewer than this many people
function _pfCmpYm() { return _pf.scope === 'month' ? _pf.ym : _pfCur(); }
function _pfComputeCompare(ym) {
  const s = _pf.summ[ym];
  if (!s || !s.exists) return { state: 'none' };
  let list = null;
  try { list = (typeof monthIndexMemoryCache !== 'undefined') ? monthIndexMemoryCache[ym] : null; } catch (e) { list = null; }
  if (!Array.isArray(list) || !list.length) return { state: 'idle' };
  const area = (s.profileInfo && s.profileInfo.area) || '';
  const mine = Number(s.otHours) || 0;
  const peers = list.filter(e => e && e.area === area && (!e.dept || !_pf.dept || e.dept === _pf.dept));
  if (!area || peers.length < 2) return { state: 'small', area };
  let above = 0, sum = 0, n = 0;
  peers.forEach(e => { const h = Number(e.otHours) || 0; sum += h; n++; if (h > mine) above++; });
  return { state: 'done', area, mine, n, rank: above + 1, avg: n >= _PF_CMP_MIN ? Math.round(sum / n * 100) / 100 : null };
}
async function _pfLoadCompare(ym) {
  _pf.cmpBusy = ym; _pfRenderDynamic();
  try { await fetchMonthPreIndexedData(ym); _pf.cmpErr = ''; } catch (e) { _pf.cmpErr = ym; }
  _pf.cmpBusy = ''; _pfRenderDynamic();
}
function _pfSectionI3() {
  if (!_pfReady()) return _pfSkel(200);
  const ym = _pfCmpYm();
  const c = _pfComputeCompare(ym);
  const head = `<h3>My rank &amp; section average <span class="prof-bn">র‍্যাঙ্ক ও সেকশন গড়</span></h3><p class="prof-muted">${_pE(_pfYmLabel(ym))}${_pfIsOpenMonth(ym) ? ' · so far' : ''} · by OT hours</p>`;
  if (c.state === 'none') return '';
  if (c.state === 'idle') {
    const busy = _pf.cmpBusy === ym;
    return `<div class="prof-card" id="profI3">${head}<p class="prof-note">${_pf.cmpErr === ym ? 'Could not load. Try again. / লোড হয়নি, আবার চেষ্টা করুন।' : 'Loads the full month list once (large file). / পুরো মাসের তালিকা একবার লোড হবে।'}</p>
      <button type="button" class="prof-btn prof-btn-ghost prof-iss-btn" data-act="cmpload" data-ym="${_pE(ym)}"${busy ? ' disabled' : ''}>${busy ? 'Loading…' : 'Show my rank'}</button></div>`;
  }
  if (c.state === 'small') return `<div class="prof-card" id="profI3">${head}<p class="prof-note">Not enough people in your section to compare. / তুলনার জন্য সেকশনে পর্যাপ্ত কর্মী নেই।</p></div>`;
  const diff = c.avg != null ? Math.round((c.mine - c.avg) * 100) / 100 : null;
  return `<div class="prof-card" id="profI3">${head}
    <div class="prof-kv3">
      <div><span>My rank · র‍্যাঙ্ক</span><b>#${_pfInt(c.rank)}<small> / ${_pfInt(c.n)}</small></b></div>
      <div><span>My OT</span><b>${_pfHrs(c.mine)}h</b></div>
      <div><span>Section avg · গড়</span><b>${c.avg != null ? _pfHrs(c.avg) + 'h' : '—'}</b></div>
    </div>
    <p class="prof-note">${_pE(c.area)} · ${diff == null ? 'average hidden for small groups' : (diff >= 0 ? '▲ ' : '▼ ') + _pfHrs(Math.abs(diff)) + 'h vs section average'}. Only your own rank and an anonymous average are shown. / অন্যদের নাম বা ID দেখানো হয় না।</p>
    <div class="prof-links"><button type="button" class="prof-btn prof-btn-ghost" data-act="rank">Open Rank</button></div></div>`;
}

/* ---------------- I-5: share my summary as an image ---------------- */
function _pfShareHtml() {
  const t = _pfScopeAgg(), info = _pfInfo() || {}, isYear = _pf.scope === 'year';
  const label = isYear ? _pfYearOf(_pfCur()) + ' total' : _pfYmLabel(_pf.ym);
  const cell = (k, v) => `<div style="flex:1 1 45%;background:#f1f5f9;border-radius:12px;padding:12px 14px;margin:4px;"><div style="font-size:12px;color:#475569;font-weight:700;">${k}</div><div style="font-size:24px;font-weight:800;color:#0f172a;">${v}</div></div>`;
  const cells = [cell('Total OT', _pE(_pfHrs(t.otHours)) + 'h')];
  if (!_pf.hide) cells.push(cell('OT income', _pE(_pfMoney(t.totalEarned))));
  cells.push(cell('Night duties', _pfInt(t.nightCount)), cell('Holiday duties', _pfInt(t.holidayCount)), cell('Absent days', _pfInt(t.absentDays)), cell('Avg present', _pE(_pfPct(t.presentPct))));
  return `<div style="width:420px;padding:22px;background:#fff;font-family:'Hind Siliguri',system-ui,sans-serif;color:#0f172a;box-sizing:border-box;">
    <div style="font-size:13px;font-weight:700;color:#2563eb;">RPPF Overtime · My Summary</div>
    <div style="font-size:22px;font-weight:800;margin-top:4px;">${_pE(info.name || '')}</div>
    <div style="font-size:13px;color:#475569;">ID ${_pE(_pf.id)} · ${_pE(label)}${!isYear && _pfIsOpenMonth(_pf.ym) ? ' · so far' : ''}</div>
    <div style="display:flex;flex-wrap:wrap;margin:12px -4px 0;">${cells.join('')}</div></div>`;
}
async function _pfShareSummary(share) {
  if (!_pfReady() || !_pfScopeAgg().monthsWithData) { if (typeof showToast === 'function') showToast('No data to share yet', 'warn'); return; }
  const btn = document.querySelector('#profBody [data-act=share]'); if (btn) btn.disabled = true;
  if (typeof showToast === 'function') showToast('Creating image...', 'info');
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff;';
  box.innerHTML = _pfShareHtml();
  document.body.appendChild(box);
  try {
    if (!window.html2canvas && typeof _loadScript === 'function') await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    const canvas = await html2canvas(box.firstElementChild, { scale: 2.5, backgroundColor: '#ffffff' });
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const name = `MySummary_${_pf.id}_${_pf.scope === 'year' ? _pfYearOf(_pfCur()) : _pf.ym}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); } catch (err) { if (err && err.name !== 'AbortError') throw err; }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('Could not create the image. Check your internet connection and try again.', 'error');
  } finally { box.remove(); if (btn) btn.disabled = false; }
}

/* ------------------------------ body render ------------------------------ */
function _pfRenderDynamic() {
  const body = document.getElementById('profBody'); if (!body) return;
  _pfRenderHead();
  if (_pf.failed && !Object.keys(_pf.summ).length) { body.innerHTML = ''; return; }
  // the scope's own month(s) not here yet -> skeletons (reserved heights = no layout shift)
  const scopePending = _pfPendingMonths(_pfScopeMonths()).length > 0;
  const anyExists = Object.keys(_pf.summ).some(m => _pf.summ[m] && _pf.summ[m].exists);
  if (_pf.complete && !_pf.failed && !anyExists && Object.keys(_pf.summ).length >= _pf.total && !_pf.queue.length) {
    body.innerHTML = `<div class="prof-card prof-warn"><h3>ID ${_pE(_pf.id)} not found</h3>
      <p class="prof-muted">এই ID-এর কোনো রেকর্ড ${_pE(_pf.dept)} ডেটায় পাওয়া যায়নি। ID ঠিক আছে কিনা দেখুন।<br>No record for this ID in the ${_pE(_pf.dept)} data. Please check the ID.</p>
      <div class="prof-links"><button type="button" class="prof-btn prof-btn-primary" data-act="chid">Change ID</button></div></div>`;
    return;
  }
  body.setAttribute('aria-busy', scopePending ? 'true' : 'false');
  body.innerHTML = _pfSectionA() + _pfSectionB() + _pfSectionI1() + _pfSectionC() + _pfSectionD() + _pfSectionE() + _pfSectionF() + _pfSectionH() + _pfSectionI2() + _pfSectionI3() + _pfSectionG() + _pfSectionLinks();
  _pfApplyHide();
}

/* ------------------------------ entry point ------------------------------ */
function initProfilePage() {
  const root = document.getElementById('profileRoot');
  if (!root) return;
  const id = _profMyId();
  if (!id) { _pf.id = ''; _pf.token++; _profRenderEmpty(root); return; }
  _pf.hide = _pfReadHide();
  const cur = _pfCur();
  const sameId = _pf.id === id && (typeof getClientDepartment !== 'function' || _pf.dept === getClientDepartment());
  if (!_pf.ym || _pf.ym > cur) { _pf.scope = 'month'; _pf.ym = cur; }
  _pfMount(root);
  _pfRenderHead(); _pfRenderChips();
  if (sameId && (_pf.loadedAt || Object.keys(_pf.raw).length)) {
    _pfRenderDynamic();
    if (_pf.complete && Date.now() - _pf.loadedAt > _PF_STALE_MS) _pfStartLoad(id, true); // quiet refresh, old numbers stay on screen
    return;
  }
  _pf.scope = 'month'; _pf.ym = cur;
  _pfRenderChips();
  _pfRenderDynamic();           // skeletons straight away
  _pfStartLoad(id, false);
}

window.initProfilePage = initProfilePage;
