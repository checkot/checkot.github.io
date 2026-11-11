/* ==========================================================================
   PRESENCE-BOARD.JS — "Who's active" for everyone
   Tab 1: Online now (telemetry/presence_ids, live)
   Tab 2: Checked in today (telemetry/checkins/<Dhaka date>)
   Shows ID + section (+ name if already known locally). Default filter =
   the viewer's own department; "All" shows both PR and QA.
   Opened by openPresenceBoard() (home live-count + More page button).
   ========================================================================== */
(function () {
  'use strict';
  const STALE_MS = 3 * 60 * 1000;
  let tab = 'online', deptFilter = 'mine', q = '';
  let online = {}, checkins = {}, offset = 0, refs = [], timer = null, status = '';

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dhakaDay = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const hhmm = (ms) => ms ? new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Dhaka' }) : '—';
  function myDept() { try { return (typeof getClientDepartment === 'function' && getClientDepartment()) || 'PR'; } catch (e) { return 'PR'; } }
  function areaFor(id) { try { return (typeof AREA_MAP !== 'undefined' && AREA_MAP && AREA_MAP[id]) || ''; } catch (e) { return ''; } }
  function nameFor(id) {
    try { const c = window.allEmpsDirectoryCache; const e = c && (c[id] || (Array.isArray(c) ? c.find((x) => x && x.id === id) : null)); return (e && e.name) || ''; } catch (e) { return ''; }
  }
  function agoTxt(ms) { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago'; }

  function ensureModal() {
    if ($('presenceBoardModal')) return;
    const m = document.createElement('div');
    m.id = 'presenceBoardModal'; m.className = 'lb-modal';
    m.setAttribute('onclick', 'closePresenceBoard()');
    m.innerHTML =
      '<div class="lb-modal-content pb-content" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="pbTitle">' +
      '<div class="lb-modal-header"><div class="lb-modal-title-wrap"><div class="lb-modal-title" id="pbTitle">Who\u2019s active <small>/ কে কে active</small></div>' +
      '<div class="lb-modal-subtitle" id="pbSub">Live status</div></div>' +
      '<button type="button" class="lb-modal-close" onclick="closePresenceBoard()" aria-label="Close">\u2715</button></div>' +
      '<div class="pb-tabs"><button type="button" class="pb-tab active" data-pbtab="online">Online now <span id="pbCntOnline">0</span></button>' +
      '<button type="button" class="pb-tab" data-pbtab="today">Checked in today <span id="pbCntToday">0</span></button></div>' +
      '<div class="pb-tools"><div class="pb-chips"><button type="button" class="pb-chip active" data-pbdept="mine">My dept</button>' +
      '<button type="button" class="pb-chip" data-pbdept="all">All</button></div>' +
      '<input type="search" id="pbSearch" placeholder="Search ID" autocomplete="off" autocapitalize="characters"></div>' +
      '<div id="pbList" class="pb-list"></div></div>';
    document.body.appendChild(m);
    m.querySelectorAll('.pb-tab').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.pbtab; sync(); render(); }));
    m.querySelectorAll('.pb-chip').forEach((b) => b.addEventListener('click', () => { deptFilter = b.dataset.pbdept; sync(); render(); }));
    $('pbSearch').addEventListener('input', (e) => { q = e.target.value.trim().toUpperCase(); render(); });
  }
  function sync() {
    document.querySelectorAll('#presenceBoardModal .pb-tab').forEach((b) => b.classList.toggle('active', b.dataset.pbtab === tab));
    document.querySelectorAll('#presenceBoardModal .pb-chip').forEach((b) => b.classList.toggle('active', b.dataset.pbdept === deptFilter));
  }
  function passDept(d) { return deptFilter === 'all' || String(d || 'PR').toUpperCase() === myDept(); }

  function render() {
    const list = $('pbList'); if (!list) return;
    const now = Date.now() + offset;
    const on = Object.keys(online).map((k) => online[k]).filter((r) => r && r.id && (now - (r.t || 0)) < STALE_MS && passDept(r.dept));
    // de-duplicate by ID (same person on two devices) keeping the freshest
    const byId = {}; on.forEach((r) => { if (!byId[r.id] || (r.t || 0) > (byId[r.id].t || 0)) byId[r.id] = r; });
    const onRows = Object.keys(byId).map((k) => byId[k]).sort((a, b) => (b.t || 0) - (a.t || 0));
    const toRows = Object.keys(checkins).map((id) => Object.assign({ id: id }, checkins[id])).filter((r) => passDept(r.dept))
      .sort((a, b) => (a.first || 0) - (b.first || 0));
    const f = (rows) => q ? rows.filter((r) => r.id.indexOf(q) !== -1) : rows;
    const sCnt = (id, n) => { const el = $(id); if (el) el.textContent = n; };
    sCnt('pbCntOnline', onRows.length); sCnt('pbCntToday', toRows.length);
    const sub = $('pbSub'); if (sub) sub.textContent = status || ('Today ' + dhakaDay());
    const rows = f(tab === 'online' ? onRows : toRows);
    if (!rows.length) { list.innerHTML = '<div class="empty-msg" style="padding:18px;text-align:center;color:var(--muted);">' + (status && status.indexOf('Not') === 0 ? esc(status) : 'Nobody to show yet.') + '</div>'; return; }
    list.innerHTML = rows.map((r) => {
      const nm = nameFor(r.id), ar = areaFor(r.id);
      const meta = tab === 'online'
        ? esc(r.page || '') + ' \u2022 ' + agoTxt(now - (r.t || 0))
        : 'First ' + hhmm(r.first) + ' \u2022 Last ' + hhmm(r.last);
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
      timer = setInterval(render, 15000);
    } catch (e) { status = 'Not connected'; render(); }
  }

  window.openPresenceBoard = function () {
    ensureModal(); tab = 'online'; deptFilter = 'mine'; q = ''; status = 'Connecting\u2026';
    const s = $('pbSearch'); if (s) s.value = '';
    sync(); render();
    $('presenceBoardModal').classList.add('open');
    startListening();
  };
  window.closePresenceBoard = function () {
    const m = $('presenceBoardModal'); if (m) m.classList.remove('open');
    stopListening();
  };
})();
