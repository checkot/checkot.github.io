/* ==========================================================================
   ADMIN-ONLINE.JS — "Online now" tab (who is active, by employee ID)
   Reads telemetry/presence_ids written by js/components/telemetry.js.
   Scope: PR admin sees PR, QA admin sees QA, dev/ALL sees everyone.
   Firebase SDK is lazy-loaded only when this tab is opened.
   If the DB rules require auth (recommended, see FIREBASE_RULES.md) the tab
   shows a small sign-in form; the password is never stored.
   ========================================================================== */
(function () {
  'use strict';
  const FB = 'https://www.gstatic.com/firebasejs/10.8.0/';
  const STALE_MS = 3 * 60 * 1000;
  let _db = null, _ref = null, _timer = null, _rows = {}, _offset = 0, _loading = null;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  function loadFirebase() {
    if (_loading) return _loading;
    _loading = (typeof firebase !== 'undefined' && firebase.database && firebase.auth)
      ? Promise.resolve()
      : loadScript(FB + 'firebase-app-compat.js')
        .then(() => loadScript(FB + 'firebase-database-compat.js'))
        .then(() => loadScript(FB + 'firebase-auth-compat.js'));
    return _loading;
  }

  function cfg() {
    try { const st = localStorage.getItem('renata_firebase_telemetry_cfg_v1'); if (st) return JSON.parse(st); } catch (e) {}
    if (window.FIREBASE_TELEMETRY_CONFIG) return window.FIREBASE_TELEMETRY_CONFIG;
    // admin.html does not load js/core/config.js; keep this in sync with FIREBASE_TELEMETRY_CONFIG there.
    return {
      apiKey: 'AIzaSyD-RPPF-Overtime-Firebase-Telemetry',
      authDomain: 'otchecker-2bfa1.firebaseapp.com',
      databaseURL: 'https://otchecker-2bfa1-default-rtdb.firebaseio.com',
      projectId: 'otchecker-2bfa1'
    };
  }
  function scope() {
    try { return (typeof getActiveAdminScope === 'function') ? getActiveAdminScope() : 'PR'; } catch (e) { return 'PR'; }
  }
  function nameFor(id) {
    try {
      const c = window.allEmpsDirectoryCache;
      const e = c && (c[id] || (Array.isArray(c) ? c.find((x) => x && x.id === id) : null));
      if (e && e.name) return e.name;
    } catch (e) {}
    return '';
  }
  function areaFor(id) {
    try { return (typeof AREA_MAP !== 'undefined' && AREA_MAP && AREA_MAP[id]) || ''; } catch (e) { return ''; }
  }
  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    return Math.round(s / 60) + 'm';
  }

  function mount() {
    if ($('admPaneOnline')) return;
    const anchor = $('admPaneAccess');
    if (!anchor || !anchor.parentNode) return;
    const pane = document.createElement('section');
    pane.className = 'admin-section-pane';
    pane.id = 'admPaneOnline';
    pane.innerHTML =
      '<div class="card" style="padding:14px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;">' +
      '<h3 style="margin:0;font-size:16px;">Online now <small style="color:var(--muted);font-weight:600;">/ এখন অনলাইনে</small></h3>' +
      '<span id="onlineCountBadge" class="badge info">—</span></div>' +
      '<p style="font-size:12px;color:var(--muted);margin:6px 0 10px;">Shows employee ID, section, mode and current page of devices active in the last 3 minutes. Everyone can also see this via the app board \u201cWho\u2019s active\u201d board. An employee who has not saved an ID in the app does not appear here.</p>' +
      '<div id="onlineAuthBox" style="display:none;"></div>' +
      '<div id="onlineStatus" style="font-size:12px;color:var(--muted);margin-bottom:8px;">Connecting…</div>' +
      '<div style="overflow-x:auto;"><table class="compare-table" style="width:100%;font-size:13px;"><thead><tr>' +
      '<th>ID</th><th>Name / Section</th><th>Dept</th><th>Mode</th><th>Page</th><th>Seen</th></tr></thead>' +
      '<tbody id="onlineTbody"></tbody></table></div></div>';
    anchor.parentNode.insertBefore(pane, anchor.nextSibling);

    const btnAnchor = $('admTabBtnAccess');
    if (btnAnchor && btnAnchor.parentNode) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'admin-tab-btn ax-item'; b.id = 'admTabBtnOnline';
      b.setAttribute('onclick', "switchAdminTab('online')");
      b.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M5 12a7 7 0 0 1 14 0M2 12a10 10 0 0 1 20 0"/></svg><span>Online now</span>';
      btnAnchor.parentNode.insertBefore(b, btnAnchor.nextSibling);
    }
  }

  function render() {
    const body = $('onlineTbody'); if (!body) return;
    const sc = scope();
    const now = Date.now() + _offset;
    const list = Object.keys(_rows).map((k) => _rows[k])
      .filter((r) => r && r.id && (now - (r.t || 0)) < STALE_MS)
      .filter((r) => sc === 'ALL' || !sc || String(r.dept || 'PR').toUpperCase() === sc)
      .sort((a, b) => (b.t || 0) - (a.t || 0));
    const badge = $('onlineCountBadge'); if (badge) badge.textContent = list.length + ' online';
    body.innerHTML = list.length ? list.map((r) => {
      const nm = nameFor(r.id), ar = areaFor(r.id);
      return '<tr><td><b>' + esc(r.id) + '</b></td><td>' + esc(nm || ar || '—') + (nm && ar ? '<div style="font-size:11px;color:var(--muted);">' + esc(ar) + '</div>' : '') +
        '</td><td>' + esc(r.dept || '') + '</td><td>' + esc(r.mode || '') + '</td><td>' + esc(r.page || '') + '</td><td>' + ago(now - (r.t || 0)) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:14px;">No identified users online right now.</td></tr>';
  }

  function status(msg) { const el = $('onlineStatus'); if (el) el.textContent = msg; }

  function showAuth(msg) {
    const box = $('onlineAuthBox'); if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<div style="padding:10px;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;">' +
      '<div style="font-size:12.5px;font-weight:700;margin-bottom:6px;">' + esc(msg) + '</div>' +
      '<input type="email" id="onlineAuthEmail" placeholder="Firebase admin email" autocomplete="username" style="margin-bottom:6px;">' +
      '<input type="password" id="onlineAuthPass" placeholder="Firebase admin password" autocomplete="current-password" style="margin-bottom:6px;">' +
      '<button type="button" class="btn-primary" id="onlineAuthBtn">Sign in &amp; view</button></div>';
    $('onlineAuthBtn').onclick = () => {
      const em = $('onlineAuthEmail').value.trim(), pw = $('onlineAuthPass').value;
      if (!em || !pw) return;
      firebase.auth().signInWithEmailAndPassword(em, pw)
        .then(() => { box.style.display = 'none'; $('onlineAuthPass').value = ''; listen(); })
        .catch((e) => showAuth('Sign-in failed: ' + (e && e.code ? e.code : 'error')));
    };
  }

  function listen() {
    if (_ref) { try { _ref.off(); } catch (e) {} }
    _ref = _db.ref('telemetry/presence_ids');
    status('Live');
    _ref.on('value', (snap) => { _rows = snap.val() || {}; status('Live • updated ' + new Date().toLocaleTimeString()); render(); },
      (err) => { _rows = {}; render(); showAuth('Permission denied. Sign in with the Firebase admin account to view.'); status('Not authorised'); });
  }

  function start() {
    mount();
    const c = cfg();
    if (!c || !c.databaseURL) { status('Firebase config missing (FIREBASE_TELEMETRY_CONFIG).'); return; }
    loadFirebase().then(() => {
      if (!firebase.apps.length) firebase.initializeApp(c);
      _db = firebase.database();
      _db.ref('.info/serverTimeOffset').on('value', (s) => { _offset = s.val() || 0; });
      listen();
      if (_timer) clearInterval(_timer);
      _timer = setInterval(render, 15000);
    }).catch((e) => status('Could not load Firebase: ' + (e && e.message ? e.message : e)));
  }
  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    if (_ref) { try { _ref.off(); } catch (e) {} _ref = null; }
  }

  function install() {
    mount();
    const orig = window.switchAdminTab;
    if (typeof orig !== 'function' || orig.__onlineWrapped) return;
    const wrapped = function (tab) {
      if (tab === 'online') {
        document.querySelectorAll('.admin-tab-btn, .ax-item').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.admin-section-pane').forEach((p) => p.classList.remove('active'));
        const b = $('admTabBtnOnline'), p = $('admPaneOnline');
        if (b) b.classList.add('active'); if (p) p.classList.add('active');
        start();
        return;
      }
      stop();
      return orig.apply(this, arguments);
    };
    wrapped.__onlineWrapped = true;
    window.switchAdminTab = wrapped;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
