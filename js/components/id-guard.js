/* ID guard (UI): digits-only suggestions with names, manager info card, one-time auto-logout of invalid saved IDs.
   Needs js/core/id-input.js. Add-only: does not replace any existing function. */
(function () {
  'use strict';
  var I = window.RppfIdInput;
  if (!I) return;
  var FLAG = 'renata_idguard_checked_v1';
  var _names = null, _namesP = null;

  function areaMap() { try { return (typeof AREA_MAP !== 'undefined' && AREA_MAP) ? AREA_MAP : {}; } catch (e) { return {}; } }
  function members() { try { var a = window.RppfAccess && RppfAccess.getSync && RppfAccess.getSync(); return (a && a.members) || []; } catch (e) { return []; } }
  function listReady() { return Object.keys(areaMap()).length >= 50; }
  function resolve(raw) { return I.resolveIdInput(raw, areaMap(), I.DEFAULT_ALIASES, members()); }
  function esc2(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m, t) { try { if (typeof showToast === 'function') showToast(m, t || 'warn'); } catch (e) {} }

  /* names: lazy, only when suggestions are needed, cached in memory; failures are harmless */
  function loadNames() {
    if (_names) return Promise.resolve(_names);
    if (_namesP) return _namesP;
    var one = function (p) { return fetch(p).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    _namesP = Promise.all([one('data/latest.json'), one('data/qa/latest.json')]).then(function (rs) {
      var m = {};
      rs.forEach(function (d) { ((d && d.employees) || []).forEach(function (e) { if (e && e.id && e.name && !m[String(e.id).toUpperCase()]) m[String(e.id).toUpperCase()] = e.name; }); });
      _names = m; return m;
    }).catch(function () { _names = {}; return _names; });
    return _namesP;
  }

  function boxFor(inp) {
    var id = 'idSuggest_' + inp.id, b = document.getElementById(id);
    if (!b) {
      b = document.createElement('div'); b.id = id; b.className = 'id-suggest'; b.setAttribute('role', 'listbox');
      var anchor = inp.closest('.input-clear-wrap') || inp;
      anchor.parentNode.insertBefore(b, anchor.nextSibling);
    }
    return b;
  }
  function hide(inp) { var b = document.getElementById('idSuggest_' + inp.id); if (b) { b.style.display = 'none'; b.innerHTML = ''; } }
  function pick(inp, id) {
    inp.value = id; hide(inp);
    try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    if (inp.id === 'employeeId' && typeof findReport === 'function') findReport();
    else if (inp.id === 'regEmpIdInput' && typeof onRegEmpIdInputChange === 'function') onRegEmpIdInputChange();
  }
  function showSuggestions(inp, res) {
    var b = boxFor(inp);
    if (res.status === 'too-short') {
      b.innerHTML = '<div class="id-suggest-hint">আপনার পূর্ণ আইডি নম্বর লিখুন (কমপক্ষে ৪ সংখ্যা) / Type your full ID number (at least 4 digits)</div>';
      b.style.display = 'block'; return;
    }
    var ms = res.matches || [], am = areaMap();
    var render = function (names) {
      var head = ms.length
        ? '<div class="id-suggest-head">এই আইডিগুলোর মধ্যে আপনারটি বেছে নিন / Pick your ID</div>'
        : '<div class="id-suggest-hint">"' + esc2(res.digits) + '" নম্বরের কোনো আইডি পাওয়া যায়নি। CF / RF সহ পূর্ণ আইডি লিখুন / No match. Type the full ID with CF / RF.</div>';
      b.innerHTML = head + ms.map(function (id) {
        var parts = [id]; if (names && names[id]) parts.push(names[id]); if (am[id]) parts.push(am[id]);
        return '<button type="button" class="id-suggest-row" role="option" data-id="' + esc2(id) + '">' + esc2(parts.join(' · ')) + '</button>';
      }).join('');
      b.style.display = 'block';
    };
    render(_names);
    if (ms.length && !_names) loadNames().then(function (n) { if (b.style.display !== 'none' && b.firstChild) render(n); });
    b.onclick = function (ev) { var t = ev.target.closest && ev.target.closest('.id-suggest-row'); if (t) pick(inp, t.getAttribute('data-id')); };
  }

  /* async: true when the typed value was handled (blocked / manager card) and the caller must stop */
  async function gate(raw, inp) {
    if (!listReady()) return false;
    var r = resolve(raw);
    if (r.status === 'ok') return false;
    if (r.status === 'unknown' && window.RppfAccess) { try { await RppfAccess.load(); } catch (e) {} r = resolve(raw); }
    if (r.status === 'role') { showRoleCard(r.id); return true; }
    if (r.status === 'suggest' || r.status === 'too-short') {
      var s = document.getElementById('status'); if (s) { s.style.color = ''; s.innerHTML = ''; }
      if (inp) { showSuggestions(inp, r); try { inp.focus(); } catch (e) {} }
      toast('আইডিতে CF / RF যোগ করুন, তালিকা থেকে বেছে নিন / Pick your ID from the list');
      return true;
    }
    return false;
  }
  /* sync check for save flows: true = do NOT save */
  function blocksSave(raw, inp) {
    if (!listReady()) return false;
    var r = resolve(raw);
    if (r.status === 'suggest' || r.status === 'too-short') {
      if (inp) { showSuggestions(inp, r); try { inp.focus(); } catch (e) {} }
      toast('আইডিতে CF / RF যোগ করুন, তালিকা থেকে বেছে নিন / Pick your ID from the list');
      return true;
    }
    return false;
  }

  function showRoleCard(id) {
    var s = document.getElementById('status'); if (!s) return;
    var m = null; try { m = RppfAccess.findMember(id); } catch (e) {}
    s.style.color = '';
    s.innerHTML = '<div class="id-role-card"><div><strong>' + esc2(m && m.role ? m.role : 'Manager / In-charge') + ' ID: ' + esc2(id) + '</strong></div>'
      + '<div>ম্যানেজার / ইনচার্জ আইডির ব্যক্তিগত ওভারটাইম রিপোর্ট নেই। র‍্যাঙ্কিং দেখুন। / A personal OT report is not available for this ID. Use Ranking.</div>'
      + '<button type="button" class="btn-primary" onclick="switchPage(\'leaderboard\')">Open Ranking</button></div>';
  }

  /* one-time auto-logout of invalid saved IDs */
  async function startupCheck() {
    try {
      if (sessionStorage.getItem(FLAG)) return false;
      if (typeof loadAreaMap === 'function') await loadAreaMap();
      if (window.RppfAccess) { try { await RppfAccess.load(); } catch (e) {} }
      var saved = (typeof getPreferredId === 'function') ? getPreferredId() : '';
      var am = areaMap(), cnt = Object.keys(am).length;
      if (cnt < 50 || !members().length) return false; /* lists not loaded properly: never log out */
      sessionStorage.setItem(FLAG, '1');
      var out = I.shouldAutoLogout({ savedId: saved, areaMap: am, aliases: I.DEFAULT_ALIASES, members: members(),
        isAdmin: (typeof isAdminLoggedIn === 'function') && isAdminLoggedIn(),
        mode: (typeof getAppMode === 'function') ? getAppMode() : '', areaMapCount: cnt });
      if (!out) return false;
      setPreferredId('');
      try { if (typeof window.telemetryRefreshIdentity === 'function') window.telemetryRefreshIdentity(); } catch (e) {}
      try { if (typeof closeWelcomeBackModal === 'function') closeWelcomeBackModal(); } catch (e) {}
      try { if (typeof updateModeUI === 'function') updateModeUI(); } catch (e) {}
      toast('আপনার সংরক্ষিত আইডি তালিকায় নেই, আবার লগইন করুন / Your saved ID is not in the list, please log in again', 'warn');
      var digits = I.normalizeIdInput(saved);
      setTimeout(function () {
        try { if (typeof openModeSetupModal === 'function') openModeSetupModal('employee'); } catch (e) {}
        var ri = document.getElementById('regEmpIdInput');
        if (ri && /^[0-9]+$/.test(digits)) { ri.value = digits; showSuggestions(ri, resolve(digits)); }
      }, 400);
      return true;
    } catch (e) { return false; }
  }

  /* live suggestions while typing (delegated; covers #employeeId, login modal, VS inputs incl. dynamic ones) */
  var LIVE = /^(employeeId|regEmpIdInput|compareId1|compareId|compareId3|compareId\d+|profileEmptyIdInput)$/;
  var _t = null;
  document.addEventListener('input', function (ev) {
    var inp = ev.target; if (!inp || !inp.id || !LIVE.test(inp.id) || ev.isTrusted === false && !inp._idgPick) return;
    clearTimeout(_t);
    _t = setTimeout(function () {
      var v = I.normalizeIdInput(inp.value);
      if (!v || !/^[0-9]+$/.test(v) || !listReady()) { hide(inp); return; }
      var r = resolve(v);
      if (r.status === 'suggest' || r.status === 'too-short') { if (v.length >= 2) showSuggestions(inp, r); else hide(inp); } else hide(inp);
    }, 200);
  });
  document.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('.id-suggest')) return;
    document.querySelectorAll('.id-suggest').forEach(function (b) { b.style.display = 'none'; });
  });

  window.RppfIdGuard = { gate: gate, blocksSave: blocksSave, startupCheck: startupCheck, showRoleCard: showRoleCard, resolve: resolve, loadNames: loadNames };
})();
