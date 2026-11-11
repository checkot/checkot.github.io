/* ==========================================================================
   SYNC CENTER  (reliable saving for the Admin Panel)
   - Every admin save now goes through ONE hardened uploader (retry, timeout,
     clear error messages, conflict-safe).
   - Live status bar: Unsaved / Saving / Saved / Failed (with Retry).
   - Auto-save for areas.json (IDs, sub-sections, gender, type, rates).
   - Unsaved edits survive a page reload (Restore / Discard).
   - Merges with newer server changes instead of overwriting them.
   - Save history with commit links + one-click restore of older areas.json.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__rppfSyncCenter) return;
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const LS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const LSset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const LSdel = k => { try { localStorage.removeItem(k); } catch (e) {} };
  let NS = '';
  let nsError = null;
  const isNonProd = (typeof REPO_NAME !== 'undefined' && REPO_NAME && REPO_NAME !== 'checkot.github.io');
  if (isNonProd) {
    if (typeof STORAGE_NAMESPACE === 'undefined' || STORAGE_NAMESPACE === null) {
      nsError = 'Storage namespace error: STORAGE_NAMESPACE is undefined on non-production repo. Auto-save disabled to protect production storage.';
      NS = '__BLOCKED_UNSAFE_NAMESPACE__';
    } else {
      NS = STORAGE_NAMESPACE;
    }
  } else {
    NS = (typeof STORAGE_NAMESPACE !== 'undefined' && STORAGE_NAMESPACE != null) ? STORAGE_NAMESPACE : '';
  }

  const PENDING_KEY = nsError ? '__BLOCKED__' : (NS + 'rppf_pending_areas_v1'),
        HIST_KEY = nsError ? '__BLOCKED__' : (NS + 'rppf_sync_hist_v2'),
        AUTO_KEY = nsError ? '__BLOCKED__' : (NS + 'rppf_autosave_v2'),
        LAST_SAVED_KEY = nsError ? '__BLOCKED__' : (NS + 'rppf_last_saved_ts');
  const ADMIN_FILES = ['areas.json', 'team.json', 'notices.json', 'absent.json', 'access.json'];
  const AUTOSAVE_DELAY = 4000;
  const esc2 = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const apiBase = () => `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/`;
  const encPath = p => p.split('/').map(encodeURIComponent).join('/');
  const hdr = extra => Object.assign({ 'Authorization': 'token ' + getGhToken(), 'Accept': 'application/vnd.github.v3+json' }, extra || {});

  /* ---------- friendly errors ---------- */
  function friendly(status, msg) {
    msg = msg || '';
    if (status === 401) return 'Server Access Key is wrong or expired. Make a new key and save it in the "Server setup" tab.';
    if (status === 403 && /rate limit/i.test(msg)) return 'GitHub rate limit reached. Wait a few minutes and try again.';
    if (status === 403) return 'This Server Access Key has no Write permission (needs "Contents: Read and write"). Make a new key.';
    if (status === 404) return 'File or repository not found, or the key cannot see this repository. Check the key in the "Server setup" tab.';
    if (status === 409 || (status === 422 && /sha/i.test(msg))) return 'The file was changed on the server at the same time. Retried but still conflicting.';
    if (status === 413) return 'File is too large for the server.';
    if (status >= 500) return 'GitHub server is having trouble (HTTP ' + status + '). Try again shortly.';
    return msg ? msg + ' (HTTP ' + status + ')' : 'HTTP ' + status;
  }

  /* ---------- history ---------- */
  function addHist(entry) {
    const l = LS(HIST_KEY, []);
    l.unshift(Object.assign({ t: new Date().toISOString() }, entry));
    LSset(HIST_KEY, l.slice(0, 40));
    renderPanel();
  }

  /* ---------- state + status bar ---------- */
  const S = { status: nsError ? 'error' : 'idle', msg: nsError || '', lastSaved: nsError ? 0 : LS(LAST_SAVED_KEY, 0), saving: 0, failed: new Map(), tokenOk: null };
  let autosave = nsError ? false : (LS(AUTO_KEY, true) !== false);
  function ago(ts) {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 10) return 'just now'; if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    return new Date(ts).toLocaleString();
  }
  function ensureBar() {
    if ($('rppfSyncBar')) return $('rppfSyncBar');
    const wrap = $('adminDashboardWrap');
    if (!wrap) return null;
    if (!$('rppfSyncCss')) {
      const st = document.createElement('style'); st.id = 'rppfSyncCss';
      st.textContent = `
#rppfSyncBar{position:sticky;top:0;z-index:60;margin:0 0 10px;border-radius:14px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-sm);overflow:hidden}
#rppfSyncBar .sb-row{display:flex;align-items:center;gap:10px;padding:10px 12px;flex-wrap:wrap}
#rppfSyncBar .sb-dot{width:12px;height:12px;border-radius:50%;background:var(--muted);flex:none}
#rppfSyncBar .sb-txt{flex:1;min-width:150px;font-weight:700;font-size:13.5px;color:var(--text);line-height:1.35}
#rppfSyncBar .sb-sub{display:block;font-weight:500;font-size:12px;color:var(--muted)}
#rppfSyncBar button{min-height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--border-strong);background:var(--surface-2);color:var(--text);font-weight:700;font-size:13px;cursor:pointer}
#rppfSyncBar button.sb-primary{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}
#rppfSyncBar button:disabled{opacity:.55;cursor:default}
#rppfSyncBar label.sb-auto{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--text-2);cursor:pointer}
#rppfSyncBar label.sb-auto input{width:20px;height:20px;min-height:0;padding:0;margin:0;flex:none;appearance:auto;-webkit-appearance:checkbox;accent-color:var(--brand)}
#rppfSyncBar.s-dirty{border-color:var(--warning-border);background:var(--warning-bg)} #rppfSyncBar.s-dirty .sb-dot{background:var(--warning)}
#rppfSyncBar.s-saving{border-color:var(--brand-soft-border);background:var(--brand-soft)} #rppfSyncBar.s-saving .sb-dot{background:var(--brand);animation:sbp 1s infinite}
#rppfSyncBar.s-saved .sb-dot{background:var(--success)}
#rppfSyncBar.s-error{border-color:var(--danger-border);background:var(--danger-bg)} #rppfSyncBar.s-error .sb-dot{background:var(--danger)}
@keyframes sbp{50%{opacity:.25}}
#rppfSyncPanel{display:none;border-top:1px solid var(--border);padding:10px 12px;max-height:50vh;overflow:auto;font-size:12.5px;background:var(--surface)}
#rppfSyncPanel.open{display:block}
#rppfSyncPanel .sp-h{font-weight:800;margin:8px 0 4px;color:var(--text)}
#rppfSyncPanel .sp-i{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border);color:var(--text-2)}
#rppfSyncPanel .sp-i b{color:var(--text)} #rppfSyncPanel a{color:var(--brand-text);font-weight:700}
#rppfSyncPanel .ok{color:var(--success);font-weight:800}#rppfSyncPanel .bad{color:var(--danger);font-weight:800}
#rppfSyncPanel button{min-height:34px;padding:0 10px;font-size:12px}`;
      document.head.appendChild(st);
    }
    const bar = document.createElement('div'); bar.id = 'rppfSyncBar'; bar.className = 's-saved';
    bar.innerHTML = `<div class="sb-row"><span class="sb-dot"></span><div class="sb-txt" id="rppfSbTxt"></div>
<button type="button" class="sb-primary" id="rppfSbSave" style="display:none">Save now</button>
<button type="button" id="rppfSbRetry" style="display:none">Retry</button>
<label class="sb-auto"><input type="checkbox" id="rppfSbAuto"> Auto-save</label>
<button type="button" id="rppfSbHist">History</button></div><div id="rppfSyncPanel"></div>`;
    wrap.insertBefore(bar, wrap.firstChild);
    $('rppfSbAuto').checked = autosave;
    $('rppfSbAuto').onchange = e => { autosave = e.target.checked; LSset(AUTO_KEY, autosave); if (autosave && S.status === 'dirty') schedule(500); render(); };
    $('rppfSbSave').onclick = () => saveAreasNow();
    $('rppfSbRetry').onclick = retryAll;
    $('rppfSbHist').onclick = () => { $('rppfSyncPanel').classList.toggle('open'); renderPanel(true); };
    return bar;
  }
  function setState(status, msg) { S.status = status; S.msg = msg || ''; render(); }
  function render() {
    const bar = ensureBar(); if (!bar) return;
    bar.className = 's-' + (S.status === 'idle' ? 'saved' : S.status);
    let t = '', sub = '';
    const hasKey = !!getGhToken();
    if (S.status === 'dirty') { t = 'Unsaved changes'; sub = !hasKey ? 'Server Access Key is not set - changes are only on this device.' : (autosave ? 'Saving automatically in a few seconds...' : 'Press "Save now" to send to the server.'); }
    else if (S.status === 'saving') { t = 'Saving to server...'; sub = S.msg; }
    else if (S.status === 'error') { t = 'Save failed'; sub = S.msg; }
    else { t = hasKey ? 'All changes saved' : 'Server Access Key not set'; sub = hasKey ? ('Last saved: ' + ago(S.lastSaved) + (S.tokenOk === false ? ' - but the key check failed' : '')) : 'Open "Server setup" tab and save your key.'; }
    if (S.msg && S.status === 'saved') sub = S.msg + ' - ' + sub;
    $('rppfSbTxt').innerHTML = esc2(t) + (sub ? '<span class="sb-sub">' + esc2(sub) + '</span>' : '');
    $('rppfSbSave').style.display = (S.status === 'dirty' || S.status === 'error') && !S.failed.size ? '' : 'none';
    $('rppfSbSave').disabled = S.status === 'saving';
    $('rppfSbRetry').style.display = S.failed.size ? '' : 'none';
    if (S.failed.size) $('rppfSbRetry').textContent = 'Retry (' + S.failed.size + ')';
  }

  /* ---------- hardened uploader ---------- */
  async function robustPut(path, b64, message) {
    if (!getGhToken()) { try { switchAdminTab('setup'); } catch (e) {} throw new Error('First go to the "Server setup" tab and save your Server Access Key there.'); }
    let lastErr;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const headers = hdr({ 'Content-Type': 'application/json' });
        const sha = await githubGetSha(path, headers);
        const body = { message: message || `Update ${path} via RPPF Admin Panel`, content: b64 };
        if (sha) body.sha = sha;
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), b64.length > 1e6 ? 240000 : 40000);
        let r;
        try { r = await fetch(apiBase() + 'contents/' + encPath(path), { method: 'PUT', headers, body: JSON.stringify(body), signal: ctl.signal }); }
        finally { clearTimeout(to); }
        if (r.ok) return await r.json();
        let m = ''; try { m = (await r.json()).message || ''; } catch (e) {}
        const er = new Error(friendly(r.status, m)); er.status = r.status;
        er.retry = r.status === 409 || (r.status === 422 && /sha/i.test(m)) || r.status >= 500 || (r.status === 403 && /secondary|abuse/i.test(m));
        throw er;
      } catch (e) {
        let er = e;
        if (e && e.name === 'AbortError') { er = new Error('Server took too long to reply (timeout).'); er.retry = true; }
        else if (!e.status) { er = new Error(navigator.onLine ? 'Network problem: ' + (e.message || e) : 'No internet connection.'); er.retry = navigator.onLine; }
        lastErr = er;
        if (!er.retry || attempt === 4) break;
        S.msg = `Retrying (${attempt}/3)...`; render();
        await sleep(700 * attempt * attempt);
      }
    }
    throw lastErr;
  }
  async function fetchRemoteRaw(path, ref) {
    const r = await fetch(apiBase() + 'contents/' + encPath(path) + (ref ? '?ref=' + encodeURIComponent(ref) : ''), { headers: hdr({ 'Accept': 'application/vnd.github.raw' }), cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (e) {} throw new Error(friendly(r.status, m)); }
    return await r.text();
  }
  const b64ToText = b64 => { try { return decodeURIComponent(escape(atob(b64))); } catch (e) { return null; } };

  const _origPut = githubPutFile;   // kept only for reference
  githubPutFile = async function (path, b64, message) {
    S.saving++; setState('saving', path);
    try {
      const res = await robustPut(path, b64, message);
      S.failed.delete(path);
      S.lastSaved = Date.now(); LSset(LAST_SAVED_KEY, S.lastSaved);
      const c = res && res.commit;
      addHist({ file: path, ok: true, msg: message || '', commit: c && c.sha ? c.sha.slice(0, 7) : '', url: c && c.html_url || '' });
      if (path === 'areas.json') { const txt = b64ToText(b64); try { remoteStr = JSON.stringify(JSON.parse(txt)); remoteObj = JSON.parse(txt); } catch (e) {} baseline = cur(); lastSeen = null; LSdel(PENDING_KEY); }
      try { broadcastAdminChange(path); } catch (e) {}
      S.saving--; settle(path.split('/').pop() + ' saved. Live site updates in 1-2 min.');
      return res;
    } catch (e) {
      S.saving--;
      if (path !== 'areas.json') S.failed.set(path, { b64, message });   // areas.json is retried through Save now (it re-merges first)
      addHist({ file: path, ok: false, msg: e.message });
      S.status = 'error'; S.msg = path + ': ' + e.message; render();
      throw e;
    }
  };
  function settle(okMsg) {
    if (S.saving > 0) return;
    if (S.failed.size) { S.status = 'error'; S.msg = [...S.failed.keys()].join(', ') + ' not saved'; render(); }
    else if (cur() !== baseline && baseline != null) { setState('dirty'); }
    else setState('saved', okMsg);
  }
  const _origDel = githubDeleteFile;
  githubDeleteFile = async function (path, sha, message) {
    S.saving++; setState('saving', 'Deleting ' + path);
    try { const r = await _origDel(path, sha, message); addHist({ file: path, ok: true, msg: 'Deleted' }); try { broadcastAdminChange(path); } catch (e) {} S.saving--; settle('Deleted ' + path); return r; }
    catch (e) { S.saving--; addHist({ file: path, ok: false, msg: 'Delete failed: ' + e.message }); S.status = 'error'; S.msg = 'Delete failed: ' + e.message; render(); throw e; }
  };
  async function retryAll() {
    const items = [...S.failed.entries()];
    for (const [p, v] of items) { try { await githubPutFile(p, v.b64, v.message); } catch (e) {} }
  }

  /* ---------- areas.json: dirty tracking, merge, save ---------- */
  let lastSeen = null, baseline = null, remoteStr = '', remoteObj = null, timer = null, loading = 0, saving = false;
  const payloadObj = () => ({
    departments: (typeof getDepartmentsConfig === 'function' ? getDepartmentsConfig() : ((typeof AREA_DEPARTMENTS !== 'undefined' && AREA_DEPARTMENTS) ? AREA_DEPARTMENTS : null)),
    areas: AREA_MAP,
    details: AREA_DETAILS,
    subsections: AREA_SUBS,
    designationRates: DESIG_RATES,
    rateTable: RATE_TABLE,
    holidays: (typeof PLANT_HOLIDAYS !== 'undefined' && PLANT_HOLIDAYS) ? PLANT_HOLIDAYS : ((typeof getPlantHolidaysConfig === 'function' && getPlantHolidaysConfig()) || {})
  });
  const cur = () => { try { return JSON.stringify(payloadObj()); } catch (e) { return ''; } };

  const _fjr = fetchJsonResource;
  fetchJsonResource = async function (filename) {
    let data = null;
    if (ADMIN_FILES.includes(filename) && getGhToken()) {            // always read the FRESH copy (the public site can be 10 min stale)
      try { const t = await fetchRemoteRaw(filename); if (t != null) data = JSON.parse(t); } catch (e) {}
    }
    if (data == null) data = await _fjr.apply(this, arguments);
    if (filename === 'areas.json') { try { remoteObj = JSON.parse(JSON.stringify(data)); remoteStr = JSON.stringify(data); } catch (e) {} }
    return data;
  };
  const _lam = loadAreaMap;
  loadAreaMap = async function () {
    loading++;
    try { return await _lam.apply(this, arguments); }
    finally { loading--; if (!loading && baseline == null) afterFirstLoad(); }
  };
  function finishInit() {
    baseline = cur();
    const p = LS(PENDING_KEY, null);
    if (p && p.payload && JSON.stringify(p.payload) !== baseline) offerRestore(p); else LSdel(PENDING_KEY);
    render();
  }
  function afterFirstLoad() { if (baseline == null) finishInit(); }
  // The public site can serve a copy that is up to ~10 min old. Read the live copy straight from the server instead,
  // so edits are never based on (and never push back) stale data.
  async function adoptFresh() {
    if (!getGhToken()) return;
    try {
      const t = await fetchRemoteRaw('areas.json'); if (t == null) return;
      const o = JSON.parse(t); remoteObj = JSON.parse(t); remoteStr = JSON.stringify(o);
      if (baseline == null || cur() === baseline) {            // no unsaved edits -> take the fresh server copy
        applyPayload({ areas: o.areas || {}, details: o.details || {}, subsections: o.subsections || {}, designationRates: o.designationRates || {}, rateTable: o.rateTable });
        if (baseline == null) finishInit(); else baseline = cur();
      }
    } catch (e) {}
  }
  function offerRestore(p) {
    const bar = ensureBar(); if (!bar) return;
    setState('dirty');
    $('rppfSbTxt').innerHTML = 'Unsaved changes from your last visit were found<span class="sb-sub">Saved on this device at ' + esc2(new Date(p.ts).toLocaleString()) + '. Restore them or discard.</span>';
    const sv = $('rppfSbSave'); sv.style.display = ''; sv.textContent = 'Restore'; sv.onclick = () => { applyPayload(p.payload); sv.textContent = 'Save now'; sv.onclick = () => saveAreasNow(); check(); };
    let d = $('rppfSbDiscard');
    if (!d) { d = document.createElement('button'); d.id = 'rppfSbDiscard'; d.type = 'button'; d.textContent = 'Discard'; sv.after(d); }
    d.style.display = ''; d.onclick = () => { LSdel(PENDING_KEY); d.style.display = 'none'; sv.textContent = 'Save now'; sv.onclick = () => saveAreasNow(); setState('saved'); };
  }
  function applyPayload(p) {
    AREA_MAP = p.areas || {}; AREA_DETAILS = p.details || {}; AREA_SUBS = p.subsections || {}; DESIG_RATES = p.designationRates || {};
    if (p.rateTable) RATE_TABLE = Object.assign(JSON.parse(JSON.stringify(DEFAULT_RATE_TABLE)), p.rateTable);
    try { saveAreaCache(); } catch (e) {}
    try { _masterDirLastBuildTs = 0; } catch (e) {}
    try { updateAdminAreaStats(); renderAdminAreaPreview(); } catch (e) {}
    try { adminFilterEmployeeTable(); adminRenderSubPills(); adminUpdateAllKpiCounters(); } catch (e) {}
  }
  function check() {
    if (baseline == null || loading || S.saving || saving) return;
    const c = cur();
    if (c === baseline) { if (S.status === 'dirty') { LSdel(PENDING_KEY); setState('saved'); } return; }
    if (S.status !== 'dirty' && S.status !== 'error') setState('dirty'); else if (S.status === 'error' && !S.failed.size) { /* keep error visible */ }
    try { LSset(PENDING_KEY, { ts: Date.now(), payload: JSON.parse(c) }); } catch (e) {}
    if (c !== lastSeen) { lastSeen = c; if (autosave && getGhToken() && S.status !== 'error') schedule(AUTOSAVE_DELAY); }   // debounce: restart the timer only when something really changed
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => saveAreasNow(true), ms); }
  setInterval(check, 1200);
  const _sac = saveAreaCache;
  saveAreaCache = function () { const r = _sac.apply(this, arguments); setTimeout(check, 0); return r; };

  function merge3(base, mine, theirs) {
    const out = Object.assign({}, theirs || {});
    const keys = new Set([...Object.keys(base || {}), ...Object.keys(mine || {})]);
    keys.forEach(k => {
      if (JSON.stringify(base && base[k]) !== JSON.stringify(mine && mine[k])) {
        if (mine && k in mine) out[k] = mine[k]; else delete out[k];
      }
    });
    return out;
  }
  function mergeDepartmentScoped(theirs, mine, scope) {
    if (!theirs || typeof theirs !== 'object') return mine;
    if (scope === 'ALL' || scope === 'dev') {
      // super admin working on both departments: 3-way merge per ID (never blindly overwrite what the other
      // department's admin saved meanwhile)
      const base = remoteObj || {};
      const out = Object.assign({}, theirs, mine);
      ['areas', 'details', 'subsections'].forEach(k => { out[k] = merge3(base[k], mine[k], theirs[k]); });
      return out;
    }
    const allowedAreas = new Set(typeof getDepartmentAreas === 'function' ? getDepartmentAreas(scope) : []);
    allowedAreas.add(scope === 'QA' ? 'Unassigned' : 'Unassigned PR');            // the department's own pool
    const otherAreas = new Set(typeof getDepartmentAreas === 'function' ? getDepartmentAreas(scope === 'QA' ? 'PR' : 'QA') : []);
    allowedAreas.forEach(a => otherAreas.delete(a));
    const resAreas = Object.assign({}, theirs.areas || {});
    const resDetails = Object.assign({}, theirs.details || {});
    const resSubs = Object.assign({}, theirs.subsections || {});

    // Scope rule: Only modify IDs belonging to current admin's department areas
    for (const [id, area] of Object.entries(mine.areas || {})) {
      const existingArea = theirs.areas ? theirs.areas[id] : null;
      if (existingArea && otherAreas.has(existingArea)) continue;                 // an ID that lives in the other department is not ours to move
      if (allowedAreas.has(area) || (existingArea && allowedAreas.has(existingArea))) {
        resAreas[id] = area;
      }
    }
    // Handle deletions in scoped areas
    for (const [id, area] of Object.entries(theirs.areas || {})) {
      if (allowedAreas.has(area) && mine.areas && !(id in mine.areas)) {
        delete resAreas[id];
      }
    }
    // Details
    for (const [id, det] of Object.entries(mine.details || {})) {
      const a = resAreas[id];
      if (a && allowedAreas.has(a)) resDetails[id] = det;
    }
    // Subsections
    for (const [aName, sList] of Object.entries(mine.subsections || {})) {
      if (allowedAreas.has(aName)) resSubs[aName] = sList;
    }

    return {
      departments: theirs.departments || mine.departments || (typeof getDepartmentsConfig === 'function' ? getDepartmentsConfig() : null),
      areas: resAreas,
      details: resDetails,
      subsections: resSubs,
      designationRates: mine.designationRates || theirs.designationRates,
      rateTable: mine.rateTable || theirs.rateTable,
      holidays: mine.holidays || theirs.holidays
    };
  }

  async function saveAreasNow(fromAuto) {
    if (saving || S.saving) { if (fromAuto) schedule(1500); return false; }
    clearTimeout(timer);
    if (!getGhToken()) { setState('error', 'Server Access Key is not set. Open the "Server setup" tab.'); return false; }
    if (cur() === baseline) { setState('saved'); return true; }
    saving = true; setState('saving', 'Checking server for newer changes...');
    try {
      const scope = (typeof getActiveAdminScope === 'function') ? getActiveAdminScope() : 'ALL';
      let merged = false;

      // Inner helper that performs merge + put with 409 conflict retry
      async function executeScopedSaveWithRetry(attempt = 1) {
        const t = await fetchRemoteRaw('areas.json');
        let theirs = null;
        if (t != null) {
          try { theirs = JSON.parse(t); } catch (e) {}
        }
        if (theirs) {
          const scopedMergedPayload = mergeDepartmentScoped(theirs, payloadObj(), scope);
          applyPayload(scopedMergedPayload);
          merged = true;
        }
        S.msg = attempt > 1 ? 'Retrying save after resolving conflict...' : 'Uploading areas.json...';
        render();
        const jsonStr = JSON.stringify(payloadObj(), null, 2);
        try {
          await githubPutFile('areas.json', utf8ToBase64(jsonStr), `Update areas.json via Admin Panel (${scope})`);
        } catch (putErr) {
          if (attempt === 1 && String(putErr.message || '').includes('409')) {
            console.warn('[SYNC] 409 Conflict detected on areas.json, refetching latest SHA and retrying...');
            return await executeScopedSaveWithRetry(2);
          }
          throw putErr;
        }
      }

      await executeScopedSaveWithRetry(1);
      try { Object.keys(localStorage).forEach(k => { if (k.startsWith(NS + 'renata_lb_') || k.startsWith(NS + 'renata_mdata_')) localStorage.removeItem(k); }); } catch (e) {}
      if (merged) { S.msg = 'Merged with latest server data and saved'; try { showToast('Saved with latest changes safely merged', 'info'); } catch (e) {} setState('saved', S.msg); }
      saving = false; return true;
    } catch (e) {
      saving = false;
      if (S.status !== 'error') { S.status = 'error'; S.msg = e.message; render(); }
      return false;
    }
  }
  // the existing "Save to server" buttons now use the same engine
  adminPushAreasToGithub = async function () {
    const statusEl = $('adminAreaPushStatus'), btn = $('adminPushAreasBtn');
    if (btn) btn.disabled = true;
    if (statusEl) { statusEl.style.color = 'var(--brand-text)'; statusEl.textContent = 'Saving areas.json to RPPF Cloud Server...'; }
    clearTimeout(timer);
    if (cur() === baseline) { try { await githubPutFile('areas.json', utf8ToBase64(JSON.stringify(payloadObj(), null, 2)), 'Update areas.json via RPPF Admin Panel'); } catch (e) { fin(false, e.message); return; } fin(true); return; }
    const ok = await saveAreasNow();
    fin(ok, S.msg);
    function fin(ok, m) {
      if (statusEl) { statusEl.style.color = ok ? 'var(--success)' : 'var(--danger)'; statusEl.textContent = ok ? 'areas.json was successfully updated on the RPPF Cloud Server.' : 'Problem: ' + m; }
      try { showToast(ok ? 'areas.json was successfully saved to the server' : (m || 'Save failed'), ok ? 'success' : 'error'); } catch (e) {}
      if (btn) btn.disabled = false;
    }
  };

  /* shared by notice / team / absent screens: tell the truth about failures */
  window.reportSyncFail = function (err, what) {
    const msg = getGhToken() ? `${what} was NOT saved to the server: ${err && err.message}` : `${what} is only on this device. Set the Server Access Key in "Server setup" to publish it.`;
    try { showToast(msg, getGhToken() ? 'error' : 'warn'); } catch (e) {}
  };

  /* ---------- history panel + version restore ---------- */
  let versions = null, versionsErr = '';
  async function loadVersions() {
    versions = null; versionsErr = ''; renderPanel();
    try {
      const r = await fetch(apiBase() + 'commits?path=areas.json&per_page=12', { headers: hdr(), cache: 'no-store' });
      if (!r.ok) throw new Error(friendly(r.status));
      versions = (await r.json()).map(c => ({ sha: c.sha, date: c.commit.author.date, msg: c.commit.message.split('\n')[0], url: c.html_url }));
    } catch (e) { versionsErr = e.message; versions = []; }
    renderPanel();
  }
  async function restoreVersion(sha) {
    if (!confirm('Load this older version of areas.json into the panel? Nothing is overwritten until it is saved (auto-save will send it).')) return;
    try {
      const t = await fetchRemoteRaw('areas.json', sha); const o = JSON.parse(t);
      applyPayload({ areas: o.areas, details: o.details, subsections: o.subsections, designationRates: o.designationRates, rateTable: o.rateTable });
      try { showToast('Older version loaded - saving...', 'info'); } catch (e) {}
      check();
    } catch (e) { try { showToast('Could not load that version: ' + e.message, 'error'); } catch (x) {} }
  }
  window.__rppfRestoreVersion = restoreVersion;
  window.__rppfLoadVersions = loadVersions;
  window.__rppfBackup = async function () {
    const out = { exportedAt: new Date().toISOString() };
    for (const f of ADMIN_FILES) { try { const t = getGhToken() ? await fetchRemoteRaw(f) : null; out[f] = t ? JSON.parse(t) : null; } catch (e) { out[f] = null; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    a.download = 'rppf-admin-backup-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
  };
  function renderPanel(reload) {
    const p = $('rppfSyncPanel'); if (!p || !p.classList.contains('open')) return;
    if (reload && versions === null && getGhToken()) loadVersions();
    const h = LS(HIST_KEY, []);
    let html = '<div class="sp-h">Recent saves</div>';
    html += h.length ? h.slice(0, 12).map(x => `<div class="sp-i"><span class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✓' : '✗'}</span><div style="flex:1"><b>${esc2(x.file)}</b> ${esc2(x.ok ? (x.msg || '') : x.msg)}<br><span style="color:var(--muted)">${esc2(new Date(x.t).toLocaleString())}${x.commit ? ' · <a target="_blank" rel="noopener" href="' + esc2(x.url) + '">commit ' + esc2(x.commit) + '</a>' : ''}</span></div></div>`).join('') : '<div style="color:var(--muted)">No saves yet in this browser.</div>';
    html += '<div class="sp-h">Older versions of areas.json (undo)</div>';
    if (!getGhToken()) html += '<div style="color:var(--muted)">Set the Server Access Key to see versions.</div>';
    else if (versions === null) html += '<div style="color:var(--muted)">Loading...</div>';
    else if (versionsErr) html += '<div class="bad">' + esc2(versionsErr) + '</div>';
    else html += versions.map(v => `<div class="sp-i"><div style="flex:1"><b>${esc2(new Date(v.date).toLocaleString())}</b><br><span style="color:var(--muted)">${esc2(v.msg)}</span></div><button type="button" onclick="__rppfRestoreVersion('${v.sha}')">Load</button></div>`).join('');
    html += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" onclick="__rppfBackup()">⬇ Download backup of all admin files</button><button type="button" onclick="__rppfLoadVersions()">↻ Refresh versions</button></div>';
    p.innerHTML = html;
  }

  /* ---------- key health check, leave-page guard, online ---------- */
  async function checkToken() {
    if (!getGhToken()) { S.tokenOk = null; render(); return; }
    try {
      const r = await fetch(apiBase().slice(0, -1), { headers: hdr(), cache: 'no-store' });
      if (!r.ok) { S.tokenOk = false; S.status = 'error'; S.msg = friendly(r.status); }
      else { const j = await r.json(); S.tokenOk = !!(j.permissions && j.permissions.push); if (!S.tokenOk) { S.status = 'error'; S.msg = friendly(403); } }
    } catch (e) { S.tokenOk = null; }
    render();
  }
  window.addEventListener('beforeunload', e => { if (S.status === 'dirty' || S.saving) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('online', () => { if (S.failed.size) retryAll(); else if (S.status === 'dirty' || S.status === 'error') saveAreasNow(true); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && S.status === 'dirty' && getGhToken()) saveAreasNow(true); });

  function boot() {
    ensureBar(); render(); checkToken(); setTimeout(adoptFresh, 600);
    const w = $('adminDashboardWrap');
    if (w) new MutationObserver(() => { ensureBar(); }).observe(w.parentNode || document.body, { childList: true });
    setInterval(() => { if (S.status === 'saved') render(); }, 30000);
  }
  window.__rppfSyncCenter = { saveNow: saveAreasNow, state: S, check, retryAll, checkToken };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // also re-check the key when it is saved from the Setup tab
  const _sg = adminSaveAndTestGhToken;
  adminSaveAndTestGhToken = async function () { const r = await _sg.apply(this, arguments); await checkToken(); if (S.tokenOk && S.status === 'error' && !S.failed.size) setState('saved'); return r; };
})();

