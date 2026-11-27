/* ==========================================================================
   PRESENCE-BOARD.JS — Strictly Developer/Admin Authenticated Presence &
   Historical Monthly Unique Users / OT-Check Tracker
   Tab 1: Online now (telemetry/presence_ids, live) — Developer/Admin only
   Tab 2: Checked in today (telemetry/checkins/<Dhaka date>) — Developer/Admin only
   Tab 3: Monthly History (telemetry/monthly_users/<YYYY-MM>) — Developer/Admin only
   ========================================================================== */
(function () {
  'use strict';
  const STALE_MS = 3 * 60 * 1000;
  const DEV_PRESENCE_ID = 'RF20850';
  let tab = 'online', deptFilter = 'mine', q = '', histMonth = '', histOtOnly = false;
  let online = {}, checkins = {}, monthlyUsers = {}, offset = 0, refs = [], timer = null, status = '';

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dhakaDay = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const dhakaMonth = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 7);
  const hhmm = (ms) => ms ? new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Dhaka' }) : '—';
  const ddmm = (ms) => ms ? new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Dhaka' }) : '—';
  function myDept() { try { return (typeof getClientDepartment === 'function' && getClientDepartment()) || 'PR'; } catch (e) { return 'PR'; } }
  function areaFor(id) { try { return (typeof AREA_MAP !== 'undefined' && AREA_MAP && AREA_MAP[id]) || ''; } catch (e) { return ''; } }
  function nameFor(id) {
    try { const c = window.allEmpsDirectoryCache; const e = c && (c[id] || (Array.isArray(c) ? c.find((x) => x && x.id === id) : null)); return (e && e.name) || ''; } catch (e) { return ''; }
  }
  function agoTxt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago'; }
  function fmtMonthLabel(ym) {
    if (ym === 'ALL') return 'All-Time (Unique)';
    const parts = String(ym || '').split('-');
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (parts.length === 2) return (mons[(parseInt(parts[1], 10) || 1) - 1] || parts[1]) + ' ' + parts[0];
    return ym || '—';
  }

  // Strictly require password-authenticated Developer/Admin session.
  // Never allow plain Normal Employee mode even when RF20850 is saved in localStorage!
  function isDeveloperPresenceAllowed() {
    try {
      const isAdm = (typeof window.isAdminLoggedIn === 'function' && window.isAdminLoggedIn());
      if (isAdm) return true;
      const mode = (typeof window.getAppMode === 'function') ? window.getAppMode() : 'employee';
      if (mode !== 'incharge') return false;
      if (window.RppfAccess && typeof window.RppfAccess.getSession === 'function') {
        const s = window.RppfAccess.getSession();
        if (s && String(s.id || '').trim().toUpperCase() === DEV_PRESENCE_ID) return true;
      }
    } catch (e) {}
    return false;
  }

  function ensureModal() {
    if ($('presenceBoardModal')) return;
    const m = document.createElement('div');
    m.id = 'presenceBoardModal'; m.className = 'lb-modal';
    m.setAttribute('onclick', 'closePresenceBoard()');
    m.innerHTML =
      '<div class="lb-modal-content pb-content" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="pbTitle">' +
      '<div class="lb-modal-header"><div class="lb-modal-title-wrap"><div class="lb-modal-title" id="pbTitle">Developer Activity <small>/ অ্যাক্টিভ ও হিস্টোরি</small></div>' +
      '<div class="lb-modal-subtitle" id="pbSub">Live status</div></div>' +
      '<button type="button" class="lb-modal-close" onclick="closePresenceBoard()" aria-label="Close">\u2715</button></div>' +
      '<div class="pb-tabs">' +
      '<button type="button" class="pb-tab active" data-pbtab="online">Online <span id="pbCntOnline">0</span></button>' +
      '<button type="button" class="pb-tab" data-pbtab="today">Today <span id="pbCntToday">0</span></button>' +
      '<button type="button" class="pb-tab" data-pbtab="history">Monthly <span id="pbCntHistory">0</span></button>' +
      '</div>' +
      '<div class="pb-tools"><div class="pb-chips"><button type="button" class="pb-chip active" data-pbdept="mine">My dept</button>' +
      '<button type="button" class="pb-chip" data-pbdept="all">All</button></div>' +
      '<input type="search" id="pbSearch" placeholder="Search ID" autocomplete="off" autocapitalize="characters"></div>' +
      '<div id="pbHistBar" style="display:none;padding:6px 12px;border-bottom:1px solid var(--border);background:var(--surface-2);gap:6px;align-items:center;flex-wrap:wrap;">' +
      '<select id="pbHistMonthSel" style="height:28px;min-height:28px;font-size:12px;padding:0 22px 0 8px;border-radius:4px;flex:1 1 120px;margin:0;"></select>' +
      '<button type="button" id="pbHistOtFilterBtn" class="pb-chip" style="height:28px;padding:0 10px;font-size:11.5px;">OT Checked Only</button>' +
      '<div id="pbHistSummary" style="width:100%;display:flex;gap:8px;flex-wrap:wrap;font-size:11.5px;font-weight:700;margin-top:2px;"></div>' +
      '</div>' +
      '<div id="pbList" class="pb-list"></div></div>';
    document.body.appendChild(m);
    m.querySelectorAll('.pb-tab').forEach((b) => b.addEventListener('click', () => {
      if (!isDeveloperPresenceAllowed()) return;
      tab = b.dataset.pbtab; sync(); render();
    }));
    m.querySelectorAll('.pb-chip[data-pbdept]').forEach((b) => b.addEventListener('click', () => { deptFilter = b.dataset.pbdept; sync(); render(); }));
    $('pbSearch').addEventListener('input', (e) => { q = e.target.value.trim().toUpperCase(); render(); });
    $('pbHistMonthSel').addEventListener('change', (e) => { histMonth = e.target.value; render(); });
    $('pbHistOtFilterBtn').addEventListener('click', () => { histOtOnly = !histOtOnly; sync(); render(); });
  }

  function sync() {
    document.querySelectorAll('#presenceBoardModal .pb-tab').forEach((b) => b.classList.toggle('active', b.dataset.pbtab === tab));
    document.querySelectorAll('#presenceBoardModal .pb-chip[data-pbdept]').forEach((b) => b.classList.toggle('active', b.dataset.pbdept === deptFilter));
    const hb = $('pbHistBar');
    if (hb) hb.style.display = (tab === 'history') ? 'flex' : 'none';
    const otBtn = $('pbHistOtFilterBtn');
    if (otBtn) otBtn.classList.toggle('active', histOtOnly);
  }

  function passDept(d) { return deptFilter === 'all' || String(d || 'PR').toUpperCase() === myDept(); }

  function buildHistoryRows(selectedMonth) {
    const months = Object.keys(monthlyUsers || {}).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort().reverse();
    const curM = dhakaMonth();
    if (!months.includes(curM)) months.unshift(curM);
    const sel = $('pbHistMonthSel');
    if (sel) {
      const target = selectedMonth || histMonth || curM;
      histMonth = (target === 'ALL' || months.includes(target)) ? target : curM;
      const opts = ['<option value="ALL">All-Time (Unique)</option>']
        .concat(months.map((m) => '<option value="' + esc(m) + '">' + esc(fmtMonthLabel(m)) + '</option>'));
      sel.innerHTML = opts.join('');
      sel.value = histMonth;
    }
    const map = {};
    const useMonths = (histMonth === 'ALL') ? months : [histMonth];
    useMonths.forEach((m) => {
      const bucket = monthlyUsers[m] || {};
      Object.keys(bucket).forEach((id) => {
        const rec = bucket[id];
        if (!rec || !passDept(rec.dept)) return;
        const checks = Number(rec.otChecks || (rec.checkedOt ? 1 : 0)) || 0;
        if (!map[id]) {
          map[id] = {
            id: id,
            dept: rec.dept || 'PR',
            first: rec.first || 0,
            last: rec.last || 0,
            otChecks: checks,
            checkedOt: Boolean(rec.checkedOt || checks > 0),
            lastOtCheck: rec.lastOtCheck || 0
          };
        } else {
          if (rec.first && (!map[id].first || rec.first < map[id].first)) map[id].first = rec.first;
          if (rec.last && rec.last > map[id].last) map[id].last = rec.last;
          map[id].otChecks += checks;
          if (rec.checkedOt || checks > 0) map[id].checkedOt = true;
          if (rec.lastOtCheck && rec.lastOtCheck > map[id].lastOtCheck) map[id].lastOtCheck = rec.lastOtCheck;
        }
      });
    });
    const allRows = Object.keys(map).map((k) => map[k]).sort((a, b) => (b.otChecks - a.otChecks) || ((b.last || 0) - (a.last || 0)));
    const otCheckedCount = allRows.filter((r) => r.checkedOt).length;
    return { allRows: allRows, otCheckedCount: otCheckedCount };
  }

  function render() {
    const list = $('pbList'); if (!list) return;
    if (!isDeveloperPresenceAllowed()) { window.closePresenceBoard(); return; }
    const now = Date.now() + offset;
    const on = Object.keys(online).map((k) => online[k]).filter((r) => r && r.id && (now - (r.t || 0)) < STALE_MS && passDept(r.dept));
    const byId = {}; on.forEach((r) => { if (!byId[r.id] || (r.t || 0) > (byId[r.id].t || 0)) byId[r.id] = r; });
    const onRows = Object.keys(byId).map((k) => byId[k]).sort((a, b) => (b.t || 0) - (a.t || 0));
    const toRows = Object.keys(checkins).map((id) => Object.assign({ id: id }, checkins[id])).filter((r) => passDept(r.dept)).sort((a, b) => (a.first || 0) - (b.first || 0));
    const hist = buildHistoryRows(histMonth);

    const sCnt = (id, n) => { const el = $(id); if (el) el.textContent = n; };
    sCnt('pbCntOnline', onRows.length);
    sCnt('pbCntToday', toRows.length);
    sCnt('pbCntHistory', hist.allRows.length);

    const histSum = $('pbHistSummary');
    if (histSum) {
      histSum.innerHTML =
        '<span style="color:#0f172a;background:#e2e8f0;padding:2px 8px;border-radius:4px;">Unique Entered: ' + hist.allRows.length + '</span>' +
        '<span style="color:#0f766e;background:#ccfbf1;padding:2px 8px;border-radius:4px;">OT Checked (\u22651\u00d7): ' + hist.otCheckedCount + '</span>';
    }

    const f = (rows) => q ? rows.filter((r) => r.id.indexOf(q) !== -1 || nameFor(r.id).toUpperCase().indexOf(q) !== -1) : rows;
    const sub = $('pbSub'); if (sub) sub.textContent = status || ('Live \u2022 ' + dhakaDay());

    let activeRows = onRows;
    if (tab === 'today') activeRows = toRows;
    else if (tab === 'history') activeRows = histOtOnly ? hist.allRows.filter((r) => r.checkedOt) : hist.allRows;

    const rows = f(activeRows);
    if (!rows.length) {
      list.innerHTML = '<div class="empty-msg" style="padding:18px;text-align:center;color:var(--muted);">' +
        (status && status.indexOf('Not') === 0 ? esc(status) : 'No records to show yet.') + '</div>';
      return;
    }
    list.innerHTML = rows.map((r) => {
      const nm = nameFor(r.id), ar = areaFor(r.id);
      let meta = '';
      if (tab === 'online') {
        meta = esc(r.page || '') + ' \u2022 ' + agoTxt(now - (r.t || 0));
      } else if (tab === 'today') {
        meta = 'First ' + hhmm(r.first) + ' \u2022 Last ' + hhmm(r.last);
      } else {
        const badge = r.checkedOt
          ? '<span style="background:#dcfce7;color:#15803d;font-weight:800;padding:1px 6px;border-radius:4px;margin-left:4px;">OT \u00d7' + r.otChecks + '</span>'
          : '<span style="background:#f1f5f9;color:#64748b;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:4px;">Visited</span>';
        meta = 'First ' + ddmm(r.first) + ' \u2022 Last ' + ddmm(r.last) + badge;
      }
      return '<div class="pb-row"><div class="pb-id">' + esc(r.id) + '</div><div class="pb-main"><div class="pb-name">' + esc(nm || ar || '\u2014') +
        '</div><div class="pb-meta">' + (nm && ar ? esc(ar) + ' \u2022 ' : '') + esc(r.dept || 'PR') + ' \u2022 ' + meta + '</div></div></div>';
    }).join('');
  }

  function stopListening() {
    refs.forEach((r) => { try { r.off(); } catch (e) {} }); refs = [];
    if (timer) { clearInterval(timer); timer = null; }
  }
  function startListening() {
    stopListening();
    if (!isDeveloperPresenceAllowed()) return;
    checkins = {}; monthlyUsers = {};
    try {
      if (typeof firebase === 'undefined' || !firebase.database) { status = 'Not connected (Firebase unavailable)'; render(); return; }
      if (!firebase.apps.length) {
        const c = window.FIREBASE_TELEMETRY_CONFIG; if (!c) { status = 'Not connected'; render(); return; }
        firebase.initializeApp(c);
      }
      const db = firebase.database();
      const off = db.ref('.info/serverTimeOffset'); off.on('value', (s) => { offset = s.val() || 0; }); refs.push(off);
      const a = db.ref('telemetry/presence_ids');
      a.on('value', (s) => { online = s.val() || {}; status = 'Live \u2022 ' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka' }); render(); },
        () => { online = {}; status = 'Not authorised (check Firebase rules)'; render(); });
      refs.push(a);
      const c2 = db.ref('telemetry/checkins/' + dhakaDay());
      c2.on('value', (s) => { checkins = s.val() || {}; render(); }, () => { checkins = {}; });
      refs.push(c2);
      const mRef = db.ref('telemetry/monthly_users');
      mRef.on('value', (s) => { monthlyUsers = s.val() || {}; render(); }, () => { monthlyUsers = {}; });
      refs.push(mRef);
      timer = setInterval(render, 15000);
    } catch (e) { status = 'Not connected'; render(); }
  }

  window.isDeveloperPresenceAllowed = isDeveloperPresenceAllowed;
  window.syncPresenceBoardVisibility = function () {
    const dev = isDeveloperPresenceAllowed();
    const card = $('settingsTelemetryCard');
    if (card) card.style.display = dev ? '' : 'none';
    const btn = $('settingsPresenceBoardBtn');
    if (btn) {
      btn.style.display = dev ? '' : 'none';
      btn.textContent = 'Developer activity & monthly history';
    }
    const pill = $('headerLiveActivePill');
    if (pill) {
      pill.style.cursor = dev ? 'pointer' : 'default';
      pill.setAttribute('aria-disabled', dev ? 'false' : 'true');
    }
    if (!dev && $('presenceBoardModal') && $('presenceBoardModal').classList.contains('open')) {
      window.closePresenceBoard();
    }
    if ($('presenceBoardModal')) sync();
  };

  window.openPresenceBoard = function () {
    if (!isDeveloperPresenceAllowed()) return;
    ensureModal(); tab = 'online'; deptFilter = 'mine'; q = ''; histMonth = dhakaMonth(); histOtOnly = false; status = 'Connecting\u2026';
    const s = $('pbSearch'); if (s) s.value = '';
    sync(); render();
    $('presenceBoardModal').classList.add('open');
    startListening();
  };
  window.closePresenceBoard = function () {
    const m = $('presenceBoardModal'); if (m) m.classList.remove('open');
    stopListening();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.syncPresenceBoardVisibility);
  } else {
    setTimeout(window.syncPresenceBoardVisibility, 0);
  }
  window.addEventListener('hashchange', window.syncPresenceBoardVisibility);
  window.addEventListener('storage', window.syncPresenceBoardVisibility);
})();
