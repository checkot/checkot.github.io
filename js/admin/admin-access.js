/* ==========================================================================
   admin-access.js - "Access" tab: create / assign / modify / delete the
   Manager & In-Charge accounts that unlock In-Charge mode in index.html.

   Data   : access.json (repo root)  { version, updatedAt, members:[...] }
   Secrets: only a salted PBKDF2 hash is stored (js/core/access-crypto.js).
            A newly set PIN is shown ONCE and never stored in readable form.
   Scope  : pradmin -> PR members only, qaadmin -> QA only, dev -> both.
            Enforced here AND in the save merge (members of a department the
            admin does not manage are always taken from the server copy, and
            only dev can grant/keep the isAdmin flag).
   ========================================================================== */
(function () {
  'use strict';
  var FILE = 'access.json';
  var POOLS = ['Unassigned', 'Unassigned PR'];
  var ROLES = ['Floor In-Charge', 'Section In-Charge', 'Production Manager', 'Assistant Manager', 'Manager', 'Executive Officer', 'Officer (Executive)', 'ERP Team Admin'];
  var S = { members: [], base: {}, loaded: false, loading: false, status: 'idle', msg: '', q: '', deptF: 'all', undo: null,
            modal: null, saving: false, again: false, timer: null, scopeLoaded: null, notice: null };
  var $ = function (id) { return document.getElementById(id); };
  var E = function (s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var toast = function (m, t) { try { showToast(m, t || 'info'); } catch (e) {} };
  var user = function () { try { return String(getAdminUser() || '').toLowerCase(); } catch (e) { return ''; } };
  var isDev = function () { return user() === 'dev'; };
  var scope = function () { try { return getActiveAdminScope(); } catch (e) { return 'PR'; } };
  var managed = function () { var s = scope(); return s === 'ALL' ? ['PR', 'QA'] : [s === 'QA' ? 'QA' : 'PR']; };
  var keyOf = function (m) { return m.dept + '|' + String(m.id).toUpperCase().trim(); };
  var up = function (x) { return String(x || '').toUpperCase().trim().replace(/\s+/g, ''); };
  var deptName = function (d) { return d === 'QA' ? 'Quality Assurance' : 'Production'; };
  function realAreas(d) {
    var l = []; try { l = getDepartmentAreas(d) || []; } catch (e) {}
    return l.filter(function (a) { return POOLS.indexOf(a) < 0; });
  }
  function snapshot(list) { var b = {}; list.forEach(function (m) { b[keyOf(m)] = JSON.stringify(m); }); return b; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------- data ------------------------------- */
  async function load(force) {
    if (S.loading) return;
    if (S.loaded && !force) return;
    S.loading = true; render();
    var doc = null;
    try { doc = await fetchJsonResource(FILE); } catch (e) { doc = null; }
    S.members = (doc && Array.isArray(doc.members)) ? doc.members : [];
    S.base = snapshot(S.members);
    S.loaded = true; S.loading = false; S.status = 'saved'; S.msg = '';
    render();
  }
  function setStatus(st, msg) { S.status = st; S.msg = msg || ''; paintStatus(); }
  function touch() { setStatus('unsaved'); clearTimeout(S.timer); S.timer = setTimeout(save, 900); }

  /* 3-way merge per member, restricted to the departments this admin manages */
  function mergeMembers(theirs, mine) {
    var mgd = managed();
    var tMap = new Map(theirs.map(function (m) { return [keyOf(m), m]; }));
    var mMap = new Map(mine.map(function (m) { return [keyOf(m), m]; }));
    var out = new Map(tMap);
    var keys = new Set(Object.keys(S.base).concat(Array.from(mMap.keys())));
    keys.forEach(function (k) {
      var dept = k.split('|')[0];
      if (mgd.indexOf(dept) < 0) return;                        // data-layer scope enforcement
      var m = mMap.get(k);
      var mStr = m ? JSON.stringify(m) : undefined;
      if (S.base[k] === mStr) return;                           // not touched by me -> keep server copy
      if (!m) { out.delete(k); return; }
      var rec = clone(m), t = tMap.get(k);
      if (!isDev()) rec.isAdmin = t ? !!t.isAdmin : false;      // only dev may grant admin
      out.set(k, rec);
    });
    return Array.from(out.values());
  }
  async function save() {
    clearTimeout(S.timer);
    if (S.saving) { S.again = true; return; }
    if (S.status !== 'unsaved' && S.status !== 'error') return;
    var tokenOk = false; try { tokenOk = !!getGhToken(); } catch (e) {}
    if (!tokenOk) { setStatus('error', 'Server Access Key is not set (Server & Deploy tab).'); return; }
    S.saving = true; setStatus('saving');
    try {
      var theirs = { members: [] };
      try { var t = await fetchJsonResource(FILE); if (t && Array.isArray(t.members)) theirs = t; } catch (e) {}
      var merged = mergeMembers(theirs.members, S.members);
      var doc = { version: 1, updatedAt: new Date().toISOString(), members: merged };
      await githubPutFile(FILE, utf8ToBase64(JSON.stringify(doc, null, 2) + '\n'), 'Update access.json via Admin Panel (' + scope() + ', ' + user() + ')');
      S.members = merged; S.base = snapshot(merged);
      setStatus('saved'); render();
    } catch (e) { setStatus('error', (e && e.message) || 'Save failed'); }
    S.saving = false;
    if (S.again) { S.again = false; if (S.status === 'unsaved') save(); }
  }

  /* ------------------------------- view ------------------------------- */
  function visible() {
    var mg = managed(), q = S.q.trim().toLowerCase();
    return S.members.filter(function (m) {
      if (mg.indexOf(m.dept) < 0) return false;
      if (S.deptF !== 'all' && scope() === 'ALL' && m.dept !== S.deptF) return false;
      if (q && !(m.id + ' ' + m.name + ' ' + m.role).toLowerCase().includes(q)) return false;
      return true;
    }).sort(function (a, b) { return a.dept.localeCompare(b.dept) || String(a.name || a.id).localeCompare(String(b.name || b.id)); });
  }
  function statusHtml() {
    var map = { saved: ['ok', 'Saved'], unsaved: ['warn', 'Unsaved changes'], saving: ['info', 'Saving…'], error: ['err', 'Not saved'], idle: ['info', ''] };
    var s = map[S.status] || map.idle;
    return '<span class="ac-status ' + s[0] + '" id="acStatus">' + E(s[1]) + (S.msg ? ' – ' + E(S.msg) : '') + '</span>';
  }
  function paintStatus() { var el = $('acStatus'); if (el) el.outerHTML = statusHtml(); }
  function areasText(m) { return (m.areas && m.areas.indexOf('all') >= 0) ? 'All areas' : (m.areas || []).join(', ') || '—'; }
  function card(m) {
    var weak = window.AccessCrypto && AccessCrypto.isWeakMember(m);
    var b = '<span class="ac-badge ' + (m.active === false ? 'off' : 'on') + '">' + (m.active === false ? 'Inactive' : 'Active') + '</span>';
    if (m.canViewExecutives) b += '<span class="ac-badge">Sees executives</span>';
    if (m.isAdmin) b += '<span class="ac-badge adm">Admin</span>';
    if (weak) b += '<span class="ac-badge warn">Legacy PIN – reset</span>';
    return '<article class="ac-card' + (m.active === false ? ' inactive' : '') + '" data-k="' + E(keyOf(m)) + '">' +
      '<div class="ac-card-top"><div class="ac-who"><div class="ac-name">' + E(m.name || m.id) + '</div><div class="ac-sub">' + E(m.id) + ' · ' + E(m.role || '') + '</div></div>' +
      '<span class="ac-dept ' + m.dept + '">' + m.dept + '</span></div>' +
      '<div class="ac-areas">' + E(areasText(m)) + '</div><div class="ac-badges">' + b + '</div>' +
      '<div class="ac-actions"><button type="button" class="em-btn" data-ac="edit">Edit</button><button type="button" class="em-btn" data-ac="pin">' + (weak ? 'Reset PIN' : 'Set PIN') + '</button>' +
      '<button type="button" class="em-btn" data-ac="toggle">' + (m.active === false ? 'Activate' : 'Deactivate') + '</button><button type="button" class="em-btn danger" data-ac="del">Delete</button></div></article>';
  }
  function render() {
    var root = $('accessMgmtRoot'); if (!root) return;
    if (S.loading && !S.loaded) { root.innerHTML = '<div class="ac-empty">Loading access list…</div>'; return; }
    var list = visible();
    var weakN = S.members.filter(function (m) { return managed().indexOf(m.dept) >= 0 && AccessCrypto.isWeakMember(m); }).length;
    var h = '<div class="ac-wrap"><div class="em-title">Access – Manager &amp; In-Charge</div>' +
      '<div class="em-meta"><span class="em-pill">' + (scope() === 'ALL' ? 'All departments' : E(deptName(scope())) + ' (' + scope() + ')') + '</span>' + statusHtml() + '<span class="em-spacer"></span>' +
      '<button type="button" class="em-link" data-ac="reload">↻ Reload</button><button type="button" class="em-btn primary" data-ac="add">+ Add</button></div>';
    h += '<div class="ac-note">This is a client-side gate on a static site. PINs are stored only as salted hashes, but short numeric PINs in a public file can still be guessed offline – use 6+ digits for Manager / Executive / Admin roles.</div>';
    if (weakN) h += '<div class="ac-warn">' + weakN + ' member(s) still use a legacy PIN carried over from the old table. Open <b>Reset PIN</b> on each and set a new 6-digit PIN.</div>';
    if (S.undo) h += '<div class="em-undo"><span>Deleted ' + E(S.undo.m.name || S.undo.m.id) + '</span><button type="button" class="em-btn" data-ac="undo">Undo</button></div>';
    h += '<div class="ac-filters"><input type="search" id="acSearch" placeholder="Search ID, name or role…" value="' + E(S.q) + '" autocomplete="off">';
    if (scope() === 'ALL') h += '<span class="em-seg">' + ['all', 'PR', 'QA'].map(function (d) { return '<button type="button" data-ac="deptf" data-v="' + d + '" class="' + (S.deptF === d ? 'on' : '') + '">' + (d === 'all' ? 'All' : d) + '</button>'; }).join('') + '</span>';
    h += '</div><div class="ac-count">' + list.length + ' member(s)</div>';
    h += list.length ? '<div class="ac-list">' + list.map(card).join('') + '</div>' : '<div class="ac-empty">No members yet. Tap <b>+ Add</b> to give someone In-Charge / Manager access.</div>';
    root.innerHTML = h + '</div>';
  }

  /* ------------------------------- modal ------------------------------- */
  function host() {
    var h = $('acModalHost');
    if (!h) { h = document.createElement('div'); h.id = 'acModalHost'; document.body.appendChild(h); h.addEventListener('click', onModalClick); h.addEventListener('input', onModalInput); h.addEventListener('change', onModalInput); }
    return h;
  }
  function closeModal() { S.modal = null; host().innerHTML = ''; document.body.classList.remove('ac-modal-open'); }
  function sheet(title, body, foot) {
    host().innerHTML = '<div class="ac-overlay" data-ac="close"><div class="ac-sheet"><div class="ac-sheet-head"><b>' + E(title) + '</b><button type="button" class="em-link" data-ac="close">✕</button></div><div class="ac-sheet-body">' + body + '</div><div class="ac-sheet-foot">' + foot + '</div></div></div>';
    document.body.classList.add('ac-modal-open');
  }
  function formHtml(F) {
    var d = F.dept, areas = realAreas(d), all = F.areas.indexOf('all') >= 0;
    var deptSel = scope() === 'ALL' && F.mode === 'add' ? '<label>Department</label><span class="em-seg">' + ['PR', 'QA'].map(function (x) { return '<button type="button" data-ac="fdept" data-v="' + x + '" class="' + (d === x ? 'on' : '') + '">' + x + '</button>'; }).join('') + '</span>' : '<div class="ac-fixed">' + E(deptName(d)) + ' (' + d + ')</div>';
    var roleOpts = ROLES.map(function (r) { return '<option' + (F.role === r ? ' selected' : '') + '>' + E(r) + '</option>'; }).join('');
    if (ROLES.indexOf(F.role) < 0 && F.role) roleOpts += '<option selected>' + E(F.role) + '</option>';
    return deptSel +
      '<label>Employee ID</label><input type="text" id="acfId" value="' + E(F.id) + '" ' + (F.mode === 'edit' ? 'readonly' : '') + ' autocapitalize="characters" autocomplete="off" placeholder="Search listed ID or name">' +
      '<div id="acSuggest" class="ac-suggest"></div>' +
      '<label>Name</label><input type="text" id="acfName" value="' + E(F.name) + '" autocomplete="off">' +
      '<label>Role</label><select id="acfRole">' + roleOpts + '</select>' +
      '<label>Areas this person can see</label><div class="ac-checks"><label class="ac-chk"><input type="checkbox" id="acfAll"' + (all ? ' checked' : '') + '> All areas</label>' +
      areas.map(function (a, i) { return '<label class="ac-chk"><input type="checkbox" class="acfArea" value="' + E(a) + '"' + (!all && F.areas.indexOf(a) >= 0 ? ' checked' : '') + (all ? ' disabled' : '') + '> ' + E(a) + '</label>'; }).join('') + '</div>' +
      '<label class="ac-chk"><input type="checkbox" id="acfExec"' + (F.canViewExecutives ? ' checked' : '') + '> Can view executive / above employees</label>' +
      '<label class="ac-chk"><input type="checkbox" id="acfActive"' + (F.active ? ' checked' : '') + '> Active</label>' +
      '<label class="ac-chk"><input type="checkbox" id="acfBypass"' + (F.allowNormalBypass ? ' checked' : '') + '> Allow “Continue as normal employee” (no PIN)</label>' +
      (isDev() ? '<label class="ac-chk"><input type="checkbox" id="acfAdmin"' + (F.isAdmin ? ' checked' : '') + '> App admin (category editing in index.html) – dev only</label>' : '') +
      (F.mode === 'add' ? '<label>PIN (min 4 digits, 6+ for Manager / Executive / Admin)</label><div class="ac-pinrow"><input type="text" id="acfPin" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="e.g. 482915"><button type="button" class="em-btn" data-ac="genpin">Generate</button></div>' : '<div class="ac-hint">To change the PIN use <b>Set PIN</b> on the card.</div>') +
      '<div class="ac-err" id="acfErr"></div>';
  }
  function openForm(mode, m) {
    var F = m ? { mode: mode, orig: keyOf(m), id: m.id, name: m.name || '', dept: m.dept, role: m.role || ROLES[0], areas: (m.areas || ['all']).slice(), canViewExecutives: !!m.canViewExecutives, active: m.active !== false, allowNormalBypass: m.allowNormalBypass !== false, isAdmin: !!m.isAdmin }
      : { mode: 'add', id: '', name: '', dept: managed()[0], role: ROLES[0], areas: ['all'], canViewExecutives: false, active: true, allowNormalBypass: true, isAdmin: false };
    S.modal = { type: 'form', F: F };
    sheet(mode === 'edit' ? 'Edit access' : 'Add access', formHtml(F), '<button type="button" class="em-btn" data-ac="close">Cancel</button><button type="button" class="em-btn primary" data-ac="saveform">' + (mode === 'edit' ? 'Save' : 'Add') + '</button>');
  }
  function readForm() {
    var F = S.modal.F;
    F.id = up(($('acfId') || {}).value); F.name = (($('acfName') || {}).value || '').trim(); F.role = ($('acfRole') || {}).value;
    var all = $('acfAll') && $('acfAll').checked;
    F.areas = all ? ['all'] : Array.prototype.map.call(document.querySelectorAll('.acfArea:checked'), function (c) { return c.value; });
    F.canViewExecutives = !!($('acfExec') || {}).checked; F.active = !!($('acfActive') || {}).checked; F.allowNormalBypass = !!($('acfBypass') || {}).checked;
    if ($('acfAdmin')) F.isAdmin = $('acfAdmin').checked;
    return F;
  }
  function fail(msg) { var e = $('acfErr'); if (e) e.textContent = msg; }
  function listedIn(id, d) {
    try { var a = AREA_MAP[id]; if (!a) return false; return realAreas(d).indexOf(a) >= 0 || POOLS.indexOf(a) >= 0 && getDepartmentForArea(a) === d || (d === 'PR' && a === 'Unassigned PR') || (d === 'QA' && a === 'Unassigned'); } catch (e) { return false; }
  }
  async function submitForm() {
    var F = readForm(), k = F.dept + '|' + F.id;
    if (!F.id) return fail('Enter the employee ID.');
    if (managed().indexOf(F.dept) < 0) return fail('You cannot manage this department.');
    if (!F.name) return fail('Enter the name.');
    if (!F.areas.length) return fail('Choose at least one area (or “All areas”).');
    if (F.mode === 'add') {
      if (S.members.some(function (m) { return keyOf(m) === k; })) return fail('This ID already has access in ' + F.dept + '. Edit it instead.');
      if (!listedIn(F.id, F.dept)) return fail('ID must be a listed ' + F.dept + ' employee (add it in the Employees tab first).');
      if (F.isAdmin && !isDev()) F.isAdmin = false;
      var pv = AccessCrypto.validatePin(($('acfPin') || {}).value, F.role, F.isAdmin);
      if (!pv.ok) return fail(pv.msg);
      var rec;
      try { rec = await AccessCrypto.makePinRecord(pv.pin, F.id, F.dept); } catch (e) { return fail(e.message); }
      var m = Object.assign({ id: F.id, name: F.name, dept: F.dept, role: F.role, areas: F.areas, canViewExecutives: F.canViewExecutives }, rec,
        { active: F.active, allowNormalBypass: F.allowNormalBypass, isAdmin: !!F.isAdmin, createdBy: user(), updatedAt: new Date().toISOString() });
      S.members.push(m); touch(); render();
      showPin(m, pv.pin, 'Access added');
    } else {
      var cur = S.members.find(function (x) { return keyOf(x) === F.orig; });
      if (!cur) return closeModal();
      cur.name = F.name; cur.role = F.role; cur.areas = F.areas; cur.canViewExecutives = F.canViewExecutives; cur.active = F.active; cur.allowNormalBypass = F.allowNormalBypass;
      if (isDev()) cur.isAdmin = !!F.isAdmin;
      cur.updatedAt = new Date().toISOString();
      touch(); closeModal(); render(); toast('Access updated', 'success');
    }
  }
  function showPin(m, pin, title) {
    S.modal = { type: 'pin-shown' };
    sheet(title, '<p>PIN for <b>' + E(m.name) + '</b> (' + E(m.id) + ', ' + m.dept + '):</p><div class="ac-pinshow" id="acPinShow">' + E(pin) + '</div><p class="ac-hint">Copy it now and share it privately. It is stored only as a hash and <b>cannot be shown again</b>.</p>',
      '<button type="button" class="em-btn" data-ac="copypin" data-v="' + E(pin) + '">Copy</button><button type="button" class="em-btn primary" data-ac="close">Done</button>');
  }
  function openPin(m) {
    S.modal = { type: 'pin', k: keyOf(m) };
    sheet('Set PIN – ' + (m.name || m.id), '<label>New PIN (min ' + AccessCrypto.minLenForRole(m.role, m.isAdmin) + ' digits)</label><div class="ac-pinrow"><input type="text" id="acfPin" inputmode="numeric" maxlength="12" autocomplete="off"><button type="button" class="em-btn" data-ac="genpin">Generate</button></div><div class="ac-err" id="acfErr"></div>',
      '<button type="button" class="em-btn" data-ac="close">Cancel</button><button type="button" class="em-btn primary" data-ac="savepin">Save PIN</button>');
  }
  async function submitPin() {
    var m = S.members.find(function (x) { return keyOf(x) === S.modal.k; }); if (!m) return closeModal();
    var pv = AccessCrypto.validatePin(($('acfPin') || {}).value, m.role, m.isAdmin);
    if (!pv.ok) return fail(pv.msg);
    try { Object.assign(m, await AccessCrypto.makePinRecord(pv.pin, m.id, m.dept)); } catch (e) { return fail(e.message); }
    delete m.weakPin; delete m.mustReset; m.updatedAt = new Date().toISOString();
    touch(); render(); showPin(m, pv.pin, 'PIN updated');
  }
  function openDelete(m) {
    S.modal = { type: 'del', k: keyOf(m) };
    sheet('Delete access?', '<p>Remove <b>' + E(m.name || m.id) + '</b> (' + E(m.id) + ', ' + m.dept + ') from In-Charge / Manager access? They will be able to use the app only as a normal employee. You can undo right after.</p>',
      '<button type="button" class="em-btn" data-ac="close">Cancel</button><button type="button" class="em-btn danger" data-ac="confirmdel">Delete</button>');
  }
  var sugTimer = null;
  function suggest() {
    var F = S.modal && S.modal.F; if (!F || F.mode !== 'add') return;
    var q = ($('acfId') || {}).value || ''; var box = $('acSuggest'); if (!box) return;
    if (q.trim().length < 2) { box.innerHTML = ''; return; }
    var res = []; try { res = searchEmployeeDirectory(q, 6, F.dept) || []; } catch (e) {}
    box.innerHTML = res.map(function (r) { return '<button type="button" class="ac-sug" data-ac="pick" data-id="' + E(r.id) + '" data-name="' + E(r.name || '') + '">' + E(r.id) + ' · ' + E(r.name || '') + ' <small>' + E(r.area || '') + '</small></button>'; }).join('');
  }
  function onModalInput(e) {
    var t = e.target;
    if (t.id === 'acfId') { clearTimeout(sugTimer); sugTimer = setTimeout(suggest, 120); }
    if (t.id === 'acfAll') { Array.prototype.forEach.call(document.querySelectorAll('.acfArea'), function (c) { c.disabled = t.checked; if (t.checked) c.checked = false; }); }
  }
  function onModalClick(e) {
    var b = e.target.closest('[data-ac]'); if (!b) return;
    var a = b.getAttribute('data-ac');
    if (a === 'close') { if (e.target.closest('.ac-sheet') && b.classList.contains('ac-overlay')) return; closeModal(); }
    else if (a === 'saveform') submitForm();
    else if (a === 'savepin') submitPin();
    else if (a === 'genpin') { var i = $('acfPin'); if (i) i.value = AccessCrypto.generatePin(6); }
    else if (a === 'fdept') { readForm(); S.modal.F.dept = b.getAttribute('data-v'); S.modal.F.areas = ['all']; var bd = host().querySelector('.ac-sheet-body'); if (bd) bd.innerHTML = formHtml(S.modal.F); }
    else if (a === 'pick') { $('acfId').value = b.getAttribute('data-id'); $('acfName').value = b.getAttribute('data-name'); $('acSuggest').innerHTML = ''; }
    else if (a === 'copypin') { try { navigator.clipboard.writeText(b.getAttribute('data-v')); toast('PIN copied', 'success'); } catch (x) { toast('Select and copy the PIN manually', 'info'); } }
    else if (a === 'confirmdel') {
      var i2 = S.members.findIndex(function (x) { return keyOf(x) === S.modal.k; });
      if (i2 >= 0) { S.undo = { m: S.members.splice(i2, 1)[0], i: i2 }; touch(); }
      closeModal(); render();
    }
  }
  function onRootClick(e) {
    var b = e.target.closest('[data-ac]'); if (!b) return;
    var a = b.getAttribute('data-ac'), c = b.closest('.ac-card'), m = c ? S.members.find(function (x) { return keyOf(x) === c.getAttribute('data-k'); }) : null;
    if (a === 'add') openForm('add');
    else if (a === 'edit' && m) openForm('edit', m);
    else if (a === 'pin' && m) openPin(m);
    else if (a === 'del' && m) openDelete(m);
    else if (a === 'toggle' && m) { m.active = m.active === false; m.updatedAt = new Date().toISOString(); touch(); render(); }
    else if (a === 'undo' && S.undo) { S.members.splice(Math.min(S.undo.i, S.members.length), 0, S.undo.m); S.undo = null; touch(); render(); toast('Restored', 'info'); }
    else if (a === 'deptf') { S.deptF = b.getAttribute('data-v'); render(); }
    else if (a === 'reload') { S.loaded = false; load(true); }
  }
  function show() {
    var root = $('accessMgmtRoot'); if (!root) return;
    if (!root.__acBound) { root.__acBound = true; root.addEventListener('click', onRootClick); root.addEventListener('input', function (e) { if (e.target.id === 'acSearch') { S.q = e.target.value; var pos = e.target.selectionStart; render(); var i = $('acSearch'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) {} } } }); }
    if (S.scopeLoaded !== scope()) { S.scopeLoaded = scope(); S.deptF = 'all'; }
    if (!S.loaded) load(); else render();
  }
  window.AccessAdmin = { _save: save, show: show, render: render, reload: function () { S.loaded = false; return load(true); }, _state: S };
})();
