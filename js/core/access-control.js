/* ==========================================================================
   access-control.js - ONE place for the rules that used to be copy-pasted:
     * department sections / real areas / pool areas
     * isRankableEmployee()   (who may appear in any ranking, count or picker)
     * isExecutiveRecord() / canViewExecutives()   (executive visibility)
     * access.json loading, PIN login (dept-scoped), lockout, session
   Loaded after config.js + access-crypto.js, before the page scripts.
   ========================================================================== */
(function (g) {
  'use strict';

  var NS = (typeof STORAGE_NAMESPACE !== 'undefined') ? STORAGE_NAMESPACE : '';
  var POOL = { PR: 'Unassigned PR', QA: 'Unassigned' };
  var EXEC = { PR: 'Overall', QA: 'Executives' };
  var META = {
    'Solid Production':   { short: 'Solid',    icon: '💊' },
    'Softgel Production': { short: 'Softgel',  icon: '🔴' },
    'Packing Hall':       { short: 'Packing',  icon: '📦' },
    'Overall':            { short: 'Exec',     icon: '👔', label: 'Executives / Staff', execLabel: 'Executives' },
    'IPQC PR':            { short: 'IPQC PR',  icon: '🔍' },
    'IPQC Pack':          { short: 'IPQC Pack',icon: '📦' },
    'Documentation':      { short: 'Docs',     icon: '📄' },
    'Executives':         { short: 'Exec',     icon: '👔', label: 'Executives', execLabel: 'Executives' }
  };
  var SESSION_KEY = NS + 'rppf_access_session_v1';
  var ACCESS_CACHE_KEY = NS + 'rppf_access_cache_v1';
  var ATTEMPT_KEY = NS + 'rppf_access_attempts_v1';
  var MAX_ATTEMPTS = 5;
  var LOCK_MS = 15 * 60 * 1000;

  function up(x) { return String(x == null ? '' : x).toUpperCase().trim(); }
  function curDept() {
    try { if (typeof getClientDepartment === 'function') return getClientDepartment() === 'QA' ? 'QA' : 'PR'; } catch (e) {}
    return 'PR';
  }
  function cfgAreas(dept) {
    try { if (typeof getDepartmentAreas === 'function') return getDepartmentAreas(dept) || []; } catch (e) {}
    return [];
  }

  /* ---------------------------- departments / areas ---------------------------- */
  function getPoolArea(dept) { return POOL[dept === 'QA' ? 'QA' : 'PR']; }
  function isPoolArea(a) { return a === POOL.PR || a === POOL.QA; }
  function getExecAreaForDept(dept) {
    try { var c = getDepartmentsConfig()[dept]; if (c && c.execArea) return c.execArea; } catch (e) {}
    return EXEC[dept === 'QA' ? 'QA' : 'PR'];
  }
  /* real (rankable) areas of a department, incl. its executive area, never the pool */
  function getRealAreasForDept(dept) {
    dept = dept === 'QA' ? 'QA' : 'PR';
    var list = cfgAreas(dept).filter(function (a) { return a && !isPoolArea(a); });
    var ex = getExecAreaForDept(dept);
    if (ex && list.indexOf(ex) < 0) list.push(ex);
    return list;
  }
  function areaOfId(id) {
    var u = up(id); if (!u) return '';
    try { if (typeof AREA_MAP !== 'undefined' && AREA_MAP && AREA_MAP[u]) return AREA_MAP[u]; } catch (e) {}
    return '';
  }
  function deptOfArea(a) {
    if (!a) return null;
    if (a === POOL.PR) return 'PR';
    if (a === POOL.QA) return 'QA';
    if (getRealAreasForDept('PR').indexOf(a) >= 0) return 'PR';
    if (getRealAreasForDept('QA').indexOf(a) >= 0) return 'QA';
    return null;
  }
  /* ONE list that every ranking / history / leave / absent / VS UI iterates */
  function getSectionsForDept(dept, opts) {
    dept = dept || curDept();
    opts = opts || {};
    var ex = getExecAreaForDept(dept);
    var showExec = opts.includeExec === true || (opts.includeExec !== false && canViewExecutives(dept));
    return getRealAreasForDept(dept).filter(function (a) { return a !== ex || showExec; }).map(function (a) {
      var m = META[a] || {};
      var isExec = a === ex;
      return { key: a, area: a, label: isExec ? (m.execLabel || 'Executives') : (m.label || a), short: m.short || a,
               icon: m.icon || '•', exec: isExec, subs: ((typeof AREA_SUBS !== 'undefined' && AREA_SUBS && AREA_SUBS[a]) || []).slice() };
    });
  }
  function areaLabel(area, dept) {
    var m = META[area]; if (!m) return area;
    return (area === getExecAreaForDept(dept || curDept()) ? (m.execLabel || m.label) : m.label) || area;
  }
  function areaShort(area) { return (META[area] && META[area].short) || area; }

  /* ------------------------------ executives ------------------------------ */
  function isExecutiveRecord(e, dept) {
    if (!e) return false;
    var id = up(e.id);
    var area = areaOfId(id) || e.area || '';
    var execAreas = dept ? [getExecAreaForDept(dept)] : [getExecAreaForDept('PR'), getExecAreaForDept('QA')];
    if (area && execAreas.indexOf(area) >= 0) return true;
    if (e.kind === 'EXEC' || e.type === 'EXEC') return true;
    try { var d = (typeof AREA_DETAILS !== 'undefined' && AREA_DETAILS && AREA_DETAILS[id]); if (d && d.t === 'EXEC') return true; } catch (x) {}
    return false;
  }

  /* ------------------------------ session / admin ------------------------------ */
  function getSession() {
    try { var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return s && s.id && s.dept ? s : null; } catch (e) { return null; }
  }
  function setSession(m) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        id: m.id, dept: m.dept, name: m.name, role: m.role, areas: m.areas || ['all'],
        canViewExecutives: !!m.canViewExecutives, isAdmin: !!m.isAdmin, ts: Date.now()
      }));
    } catch (e) {}
  }
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

  /* does the *admin panel* login (pradmin / qaadmin / dev) cover this department? */
  function adminPanelCovers(dept) {
    try {
      var uKey = (typeof ADMIN_USER_KEY !== 'undefined') ? ADMIN_USER_KEY : NS + 'renata_admin_user_v2';
      var sKey = (typeof ADMIN_SCOPE_KEY !== 'undefined') ? ADMIN_SCOPE_KEY : NS + 'renata_admin_scope_v2';
      var user = (sessionStorage.getItem(uKey) || '').toLowerCase();
      if (!user) return false;
      if (user === 'dev') return true;
      var scope = sessionStorage.getItem(sKey) || '';
      return scope === dept;
    } catch (e) { return false; }
  }
  function flagAdmin() {
    try { return typeof isAdminLoggedIn === 'function' && isAdminLoggedIn(); } catch (e) { return false; }
  }
  /* admin of this department: panel login that covers it, or an access.json member flagged isAdmin of that dept */
  function isAdminForDept(dept) {
    dept = dept || curDept();
    if (adminPanelCovers(dept)) return true;
    var s = getSession();
    return !!(s && s.isAdmin && s.dept === dept && flagAdmin());
  }
  function inchargeForDept(dept) {
    var s = getSession();
    var mode = (typeof getAppMode === 'function') ? getAppMode() : null;
    return !!(s && mode === 'incharge' && s.dept === dept) ? s : null;
  }
  function canViewExecutives(dept) {
    dept = dept || curDept();
    if (isAdminForDept(dept)) return true;
    var s = inchargeForDept(dept);
    return !!(s && s.canViewExecutives);
  }
  /* is the viewer a privileged (in-charge / manager / admin) user of this department? */
  function isPrivilegedFor(dept) {
    dept = dept || curDept();
    return isAdminForDept(dept) || !!inchargeForDept(dept);
  }
  /* areas the privileged viewer is limited to; null = unrestricted */
  function allowedAreasForViewer(dept) {
    dept = dept || curDept();
    if (isAdminForDept(dept)) return null;
    var s = inchargeForDept(dept);
    if (!s) return null;
    var a = s.areas || ['all'];
    if (a.indexOf('all') >= 0) return null;
    return a.slice();
  }
  function isAreaVisibleToViewer(area, dept) {
    dept = dept || curDept();
    var allowed = allowedAreasForViewer(dept);
    if (!allowed) return true;
    return allowed.indexOf(area) >= 0;
  }

  /* ------------------------------ ranking gate ------------------------------ */
  /* true ONLY if: valid, RPPF, present in the live AREA_MAP, in a REAL area of
     this department (pool areas excluded) and the executive rule passes.      */
  function isRankableEmployee(e, dept) {
    if (!e || !e.id) return false;
    dept = dept || curDept();
    if (e.valid === false || e.isRppf === false) return false;
    var area = '';
    try { area = (typeof getAreaForId === 'function') ? getAreaForId(e.id, true) : areaOfId(e.id); } catch (x) { area = areaOfId(e.id); }
    if (!area || area === 'Not on the list' || area === 'Other facility') return false;
    if (isPoolArea(area)) return false;
    if (getRealAreasForDept(dept).indexOf(area) < 0) return false;
    if (isExecutiveRecord(e, dept) && !canViewExecutives(dept)) return false;
    return true;
  }
  function filterRankable(list, dept) {
    dept = dept || curDept();
    return (list || []).filter(function (e) { return isRankableEmployee(e, dept); });
  }
  /* hidden from normal viewers everywhere (search, pickers, lists, exports) */
  function isExecHidden(e, dept) {
    dept = dept || curDept();
    return !!e && isExecutiveRecord(e, dept) && !canViewExecutives(dept);
  }

  /* ------------------------------ access.json ------------------------------ */
  var _access = null, _accessPromise = null;
  function loadAccess(force) {
    if (_access && !force) return Promise.resolve(_access);
    if (_accessPromise && !force) return _accessPromise;
    _accessPromise = fetch('access.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        _access = (j && Array.isArray(j.members)) ? j : { version: 1, members: [] };
        try { localStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify(_access)); } catch (e) {}
        return _access;
      })
      .catch(function () {
        try { _access = JSON.parse(localStorage.getItem(ACCESS_CACHE_KEY) || 'null'); } catch (e) { _access = null; }
        if (!_access || !Array.isArray(_access.members)) _access = { version: 1, members: [] };
        return _access;
      })
      .then(function (a) { _accessPromise = null; return a; });
    return _accessPromise;
  }
  function getAccessSync() { return _access; }
  function findMember(id, dept) {
    var u = up(id);
    var list = (_access && _access.members) || [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (up(m.id) === u && (!dept || m.dept === dept)) return m;
    }
    return null;
  }
  function membersForId(id) {
    var u = up(id);
    return ((_access && _access.members) || []).filter(function (m) { return up(m.id) === u && m.active !== false; });
  }

  /* lockout (per dept+id), same idea as the admin login */
  function attemptsMap() { try { return JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveAttempts(m) { try { localStorage.setItem(ATTEMPT_KEY, JSON.stringify(m)); } catch (e) {} }
  function lockoutSeconds(id, dept) {
    var rec = attemptsMap()[dept + '|' + up(id)];
    if (rec && rec.until && Date.now() < rec.until) return Math.ceil((rec.until - Date.now()) / 1000);
    return 0;
  }
  function registerFailure(id, dept) {
    var m = attemptsMap(), k = dept + '|' + up(id), r = m[k] || { n: 0 };
    if (r.until && Date.now() >= r.until) r = { n: 0 };
    r.n = (r.n || 0) + 1;
    if (r.n >= MAX_ATTEMPTS) { r.until = Date.now() + LOCK_MS; r.n = 0; }
    m[k] = r; saveAttempts(m);
    return { remaining: Math.max(0, MAX_ATTEMPTS - (r.n || 0)), locked: !!r.until && Date.now() < r.until };
  }
  function clearFailures(id, dept) { var m = attemptsMap(); delete m[dept + '|' + up(id)]; saveAttempts(m); }

  /* dept = the department MODE the person is entering. A member of another dept is rejected. */
  async function login(id, pin, dept) {
    dept = dept === 'QA' ? 'QA' : 'PR';
    await loadAccess();
    var lock = lockoutSeconds(id, dept);
    if (lock) return { ok: false, code: 'locked', lockSec: lock };
    var m = findMember(id, dept);
    if (!m) {
      var other = membersForId(id)[0];
      return { ok: false, code: other ? 'wrong_dept' : 'unknown', otherDept: other ? other.dept : null };
    }
    if (m.active === false) return { ok: false, code: 'inactive' };
    var ok = await g.AccessCrypto.verifyPin(pin, m);
    if (!ok) { var f = registerFailure(id, dept); return { ok: false, code: f.locked ? 'locked' : 'bad_pin', remaining: f.remaining, lockSec: f.locked ? Math.ceil(LOCK_MS / 1000) : 0 }; }
    clearFailures(id, dept);
    return { ok: true, member: m };
  }
  /* drop privileges of a stored session whose member was deactivated / deleted / moved */
  async function revalidateSession() {
    var s = getSession();
    if (!s) {
      try { if (typeof getAppMode === 'function' && getAppMode() === 'incharge' && !flagAdmin()) { setAppMode('employee'); if (typeof updateModeUI === 'function') updateModeUI(); } } catch (e) {}
      return;
    }
    await loadAccess();
    if (!_access || !(_access.members || []).length) return;     // nothing loaded -> keep (offline)
    var m = findMember(s.id, s.dept);
    if (!m || m.active === false) {
      clearSession();
      try { if (typeof setAppMode === 'function' && getAppMode() === 'incharge') { setAppMode('employee'); if (typeof setAdminLoggedIn === 'function') setAdminLoggedIn(false); if (typeof updateModeUI === 'function') updateModeUI(); } } catch (e) {}
      return;
    }
    setSession(m);        // refresh role / areas / flags from the live file
  }

  g.getPoolArea = getPoolArea; g.isPoolArea = isPoolArea; g.getExecAreaForDept = getExecAreaForDept;
  g.getRealAreasForDept = getRealAreasForDept; g.getSectionsForDept = getSectionsForDept;
  g.getAreaLabelForDept = areaLabel; g.getAreaShortLabel = areaShort; g.getDeptOfAreaStrict = deptOfArea;
  g.isExecutiveRecord = isExecutiveRecord; g.canViewExecutives = canViewExecutives; g.isExecHidden = isExecHidden;
  g.isRankableEmployee = isRankableEmployee; g.filterRankable = filterRankable;
  g.isPrivilegedFor = isPrivilegedFor; g.allowedAreasForViewer = allowedAreasForViewer; g.isAreaVisibleToViewer = isAreaVisibleToViewer;
  g.RppfAccess = { load: loadAccess, getSync: getAccessSync, findMember: findMember, membersForId: membersForId, login: login,
    getSession: getSession, setSession: setSession, clearSession: clearSession, lockoutSeconds: lockoutSeconds,
    revalidate: revalidateSession, MAX_ATTEMPTS: MAX_ATTEMPTS, adminPanelCovers: adminPanelCovers };
})(typeof window !== 'undefined' ? window : globalThis);
