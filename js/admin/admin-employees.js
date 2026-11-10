/* ==========================================================================
   admin-employees.js - "Employee Management" tab (4-step flow)

   1. List to RPPF      - employees found in the LAST uploaded Excel of the department
                          that are not yet listed  ->  become "listed, not assigned"
   2. Assign to area    - from the listed (not assigned) employees
   3. Define sub-section- from the assigned employees of an area
   4. Manage employee   - delist (left the job / facility change), change area,
                          change sub-section

   Every list is a checkbox list (select one, many, or all filtered).

   Data model (unchanged - still areas.json):
     AREA_MAP[id]      = area name            (id present = listed in RPPF)
     AREA_DETAILS[id].s = sub-section
   "Listed but not assigned" = AREA_MAP[id] is the department's pool area:
     QA -> "Unassigned" (already existed)      PR -> "Unassigned PR" (new)
   Saving is done by the existing Sync Center (auto-save / Save now).
   ========================================================================== */
(function () {
  'use strict';

  const POOL_PR = 'Unassigned PR';
  const POOL_QA = 'Unassigned';
  const PAGE = 80;                       // rows rendered per "page" (keeps 1000+ lists fast)
  const $ = id => document.getElementById(id);
  const E = s => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (m, t) => { try { showToast(m, t || 'info'); } catch (e) {} };

  const S = {
    dept: null,                          // only used by the all-department (dev) login
    step: 1,
    excel: {},                           // dept -> { ok, month, list, byId } | { ok:false, err }
    loading: {},
    sel: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() },
    q: { 1: '', 2: '', 3: '', 4: '' },
    limit: { 1: PAGE, 2: PAGE, 3: PAGE, 4: PAGE },
    area3: null, show3: 'nosub',         // step 3: chosen area, "nosub" | "all"
    f4: { area: 'all', sub: 'all', notIn: false },
    undo: null,
    mapRef: null
  };

  /* ------------------------------ helpers ------------------------------ */
  function scope() { try { return getActiveAdminScope(); } catch (e) { return 'PR'; } }
  function dept() {
    const sc = scope();
    if (sc === 'QA') return 'QA';
    if (sc === 'PR') return 'PR';
    return S.dept || 'PR';
  }
  const poolOf = d => (d === 'QA' ? POOL_QA : POOL_PR);
  const isPool = a => a === POOL_PR || a === POOL_QA;
  function deptOfArea(a) {
    if (a === POOL_PR) return 'PR';
    if (a === POOL_QA) return 'QA';
    try { return getDepartmentForArea(a); } catch (e) { return 'PR'; }
  }
  function deptName(d) {
    try { const c = getDepartmentsConfig()[d]; return (c && c.name) || d; } catch (e) { return d; }
  }
  function realAreas(d) {
    let a = [];
    try { a = getDepartmentAreas(d) || []; } catch (e) {}
    return a.filter(x => x && !isPool(x) && x !== 'Quality Assurance');
  }
  /* Read-only: never writes to AREA_SUBS (just looking at a list must not mark the data "unsaved"). */
  function subsOf(area) {
    const out = [];
    const saved = AREA_SUBS && AREA_SUBS[area];
    if (Array.isArray(saved)) out.push(...saved);
    else if (typeof DEFAULT_AREA_SUBSECTIONS !== 'undefined' && DEFAULT_AREA_SUBSECTIONS[area]) out.push(...DEFAULT_AREA_SUBSECTIONS[area]);
    Object.keys(AREA_MAP || {}).forEach(id => {
      if (AREA_MAP[id] === area) { const d = AREA_DETAILS && AREA_DETAILS[id]; if (d && d.s) out.push(d.s); }
    });
    const deleted = new Set((AREA_SUBS && Array.isArray(AREA_SUBS.__deleted_subs__)) ? AREA_SUBS.__deleted_subs__ : []);
    return [...new Set(out.map(x => String(x).trim()).filter(x => x && !deleted.has(x)))];
  }
  function ensurePoolInConfig(d) {
    if (d !== 'PR') return;
    try {
      const cfg = getDepartmentsConfig();
      if (cfg && cfg.PR && Array.isArray(cfg.PR.areas) && !cfg.PR.areas.includes(POOL_PR)) {
        cfg.PR.areas.push(POOL_PR);
        if (typeof setDepartmentsConfig === 'function') setDepartmentsConfig(cfg);
      }
    } catch (e) {}
  }
  function persist() {
    try { if (typeof persistAll === 'function') persistAll(); else saveAreaCache(); } catch (e) {}
    try { _masterDirLastBuildTs = 0; } catch (e) {}
    try { adminUpdateAllKpiCounters(); } catch (e) {}
  }
  const initials = n => { const p = String(n || '').replace(/^(mr|mrs|ms|miss)\.?\s+/i, '').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };

  /* ------------------------------ data ------------------------------ */
  async function loadExcel(d, force) {
    if (!force && S.excel[d]) return S.excel[d];
    if (S.loading[d]) return S.loading[d];
    S.loading[d] = (async () => {
      let path = 'data/latest.json';
      try { const c = getDepartmentsConfig()[d]; if (c && c.dataPath) path = c.dataPath + 'latest.json'; else if (d === 'QA') path = 'data/qa/latest.json'; } catch (e) {}
      try {
        const j = await fetchJsonResource(path);
        const list = (Array.isArray(j && j.employees) ? j.employees : []).filter(e => e && e.id);
        const byId = new Map();
        list.forEach(e => { const id = String(e.id).toUpperCase().trim(); if (!byId.has(id)) byId.set(id, e); });
        S.excel[d] = { ok: true, month: j.month || '', updatedAt: j.updatedAt || '', byId };
      } catch (e) {
        S.excel[d] = { ok: false, err: (e && e.message) || 'failed' };
      }
      delete S.loading[d];
      return S.excel[d];
    })();
    return S.loading[d];
  }

  function rec(id, d) {
    const x = (S.excel[d] && S.excel[d].byId) ? S.excel[d].byId.get(id) : null;
    const area = (AREA_MAP && AREA_MAP[id]) || '';
    const det = (AREA_DETAILS && AREA_DETAILS[id]) || {};
    return {
      id,
      name: (x && x.name) || '',
      grade: (x && x.grade) || '',
      area,
      sub: det.s || '',
      inExcel: !!x,
      nonRppf: !!(x && x.isRppf === false)
    };
  }
  function allListed(d) {
    const out = [];
    Object.keys(AREA_MAP || {}).forEach(raw => {
      const a = AREA_MAP[raw];
      if (!a || deptOfArea(a) !== d) return;
      out.push(rec(String(raw).toUpperCase().trim(), d));
    });
    return out;
  }
  function candidates(d) {            // step 1
    const ex = S.excel[d];
    if (!ex || !ex.ok) return [];
    const out = [];
    ex.byId.forEach((x, id) => { if (!(AREA_MAP && AREA_MAP[id])) out.push(rec(id, d)); });
    return out;
  }
  function listFor(step, d) {
    if (step === 1) return candidates(d);
    const listed = allListed(d);
    if (step === 2) return listed.filter(r => r.area === poolOf(d));
    if (step === 3) return listed.filter(r => r.area === S.area3 && (S.show3 === 'all' || !r.sub));
    return listed;
  }
  function filtered(step, d) {
    let l = listFor(step, d);
    if (step === 4) {
      const f = S.f4;
      if (f.area === 'pool') l = l.filter(r => isPool(r.area));
      else if (f.area !== 'all') l = l.filter(r => r.area === f.area);
      if (f.sub === 'none') l = l.filter(r => !r.sub);
      else if (f.sub !== 'all') l = l.filter(r => r.sub === f.sub);
      if (f.notIn) l = l.filter(r => !r.inExcel);
    }
    const q = (S.q[step] || '').trim().toLowerCase();
    if (q) l = l.filter(r => (r.id + ' ' + r.name + ' ' + r.grade + ' ' + r.sub + ' ' + r.area).toLowerCase().includes(q));
    l.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, undefined, { numeric: true, sensitivity: 'base' }));
    return l;
  }

  /* ------------------------------ undo ------------------------------ */
  function snapshot(ids, label) {
    S.undo = {
      label,
      items: ids.map(id => ({
        id,
        area: Object.prototype.hasOwnProperty.call(AREA_MAP, id) ? AREA_MAP[id] : undefined,
        det: AREA_DETAILS[id] ? JSON.parse(JSON.stringify(AREA_DETAILS[id])) : undefined
      }))
    };
  }
  function doUndo() {
    if (!S.undo) return;
    S.undo.items.forEach(it => {
      if (it.area === undefined) delete AREA_MAP[it.id]; else AREA_MAP[it.id] = it.area;
      if (it.det === undefined) delete AREA_DETAILS[it.id]; else AREA_DETAILS[it.id] = it.det;
    });
    toast('Undone: ' + S.undo.label, 'info');
    S.undo = null;
    persist();
    render();
  }
  function done(msg) {
    persist();
    toast(msg, 'success');
    Object.keys(S.sel).forEach(k => S.sel[k].clear());
    render();
  }

  /* ------------------------------ actions ------------------------------ */
  function selIds(step) { return [...S.sel[step]]; }

  function actList() {
    const d = dept(), ids = selIds(1);
    if (!ids.length) return;
    ensurePoolInConfig(d);
    snapshot(ids, 'listed ' + ids.length + ' employee(s)');
    ids.forEach(id => { AREA_MAP[id] = poolOf(d); });
    done(ids.length + ' employee(s) listed to RPPF. Next: assign an area.');
    S.step = 2; render();
  }
  function actAssign() {
    const ids = selIds(2), area = ($('emAssignArea') || {}).value;
    if (!ids.length) return;
    if (!area) { toast('Choose an area first', 'warn'); return; }
    snapshot(ids, 'assigned ' + ids.length + ' to ' + area);
    ids.forEach(id => { AREA_MAP[id] = area; });
    done(ids.length + ' employee(s) assigned to ' + area);
    S.area3 = area; S.step = 3; render();
  }
  function addSub(area, name) {
    if (!Array.isArray(AREA_SUBS[area])) AREA_SUBS[area] = subsOf(area);   // keep the default sub-sections when creating the list
    if (Array.isArray(AREA_SUBS.__deleted_subs__)) AREA_SUBS.__deleted_subs__ = AREA_SUBS.__deleted_subs__.filter(x => x !== name);
    if (!AREA_SUBS[area].includes(name)) AREA_SUBS[area].push(name);
  }
  function setSub(id, area, sub) {
    if (!sub) { if (AREA_DETAILS[id]) { delete AREA_DETAILS[id].s; } return; }
    addSub(area, sub);
    AREA_DETAILS[id] = AREA_DETAILS[id] || {};
    AREA_DETAILS[id].s = sub;
  }
  function actSub3(clear) {
    const ids = selIds(3), area = S.area3;
    if (!ids.length || !area) return;
    let sub = '';
    if (!clear) {
      const sv = ($('emSub3') || {}).value;
      sub = sv === '__new__' ? (($('emSub3New') || {}).value || '').trim() : sv;
      if (!sub) { toast('Choose or type a sub-section', 'warn'); return; }
    }
    snapshot(ids, clear ? 'cleared sub-section' : 'set sub-section ' + sub);
    ids.forEach(id => setSub(id, area, sub));
    done(clear ? ids.length + ' sub-section(s) cleared' : ids.length + ' employee(s) → ' + area + ' / ' + sub);
  }
  function actMoveArea() {
    const ids = selIds(4), area = ($('emMoveArea') || {}).value;
    if (!ids.length) return;
    if (!area) { toast('Choose the new area', 'warn'); return; }
    snapshot(ids, 'moved ' + ids.length + ' to ' + area);
    const subs = subsOf(area);
    ids.forEach(id => {
      AREA_MAP[id] = area;
      const cur = AREA_DETAILS[id] && AREA_DETAILS[id].s;
      if (cur && !subs.includes(cur)) delete AREA_DETAILS[id].s;      // sub-section does not exist in the new area
    });
    done(ids.length + ' employee(s) moved to ' + area);
  }
  function actSub4(clear) {
    const ids = selIds(4);
    if (!ids.length) return;
    let sub = '';
    if (!clear) {
      const sv = ($('emSub4') || {}).value;
      sub = sv === '__new__' ? (($('emSub4New') || {}).value || '').trim() : sv;
      if (!sub) { toast('Choose or type a sub-section', 'warn'); return; }
    }
    snapshot(ids, clear ? 'cleared sub-section' : 'set sub-section ' + sub);
    let skipped = 0, n = 0;
    ids.forEach(id => {
      const area = AREA_MAP[id];
      if (isPool(area)) { skipped++; return; }
      if (sub && !subsOf(area).includes(sub) && !(($('emSub4') || {}).value === '__new__')) { skipped++; return; }
      setSub(id, area, sub); n++;
    });
    done((clear ? n + ' sub-section(s) cleared' : n + ' employee(s) → sub-section ' + sub) + (skipped ? ' (' + skipped + ' skipped: area has no such sub-section / not assigned)' : ''));
  }
  function actDelist() {
    const ids = selIds(4);
    if (!ids.length) return;
    const msg = 'Delist ' + ids.length + ' employee(s) from RPPF? Use this when they left the job or moved to another facility. Their area and sub-section are removed (you can Undo right after).';
    const run = () => {
      snapshot(ids, 'delisted ' + ids.length + ' employee(s)');
      ids.forEach(id => { delete AREA_MAP[id]; delete AREA_DETAILS[id]; });
      done(ids.length + ' employee(s) delisted from RPPF');
    };
    if (typeof openConfirmModal === 'function') openConfirmModal(msg, run); else run();
  }

  /* ------------------------------ rendering ------------------------------ */
  const ICON_CHEV = '<svg class="em-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  function tagsFor(r, step) {
    const t = [];
    if (r.grade) t.push('<span class="em-tag">' + E(r.grade) + '</span>');
    if (step >= 3 || step === 4 || (step === 2 && false)) {
      if (r.area) t.push('<span class="em-tag area">' + E(isPool(r.area) ? 'Not assigned' : r.area) + '</span>');
    }
    if (r.sub && step >= 3) t.push('<span class="em-tag sub">' + E(r.sub) + '</span>');
    if (!r.inExcel && step >= 3) t.push('<span class="em-tag warn">Not in last Excel</span>');
    if (r.nonRppf) t.push('<span class="em-tag warn">Other facility</span>');
    return t.join('');
  }
  function rowHtml(r, step) {
    const on = S.sel[step].has(r.id);
    return '<label class="em-row' + (on ? ' sel' : '') + '"><input type="checkbox" data-em="pick" data-id="' + E(r.id) + '"' + (on ? ' checked' : '') + '>' +
      '<span class="em-av">' + E(initials(r.name || r.id)) + '</span>' +
      '<span class="em-who"><span class="em-name">' + E(r.name || r.id) + '</span><span class="em-id">' + E(r.id) + '</span>' +
      '<span class="em-tags">' + tagsFor(r, step) + '</span></span></label>';
  }

  function listHtml(step, d) {
    const ex = S.excel[d];
    if (step === 1 && !ex) return '<div class="em-loading">Loading the last uploaded Excel…</div>';
    if (step === 1 && ex && !ex.ok) return '<div class="em-empty">Could not read the last uploaded Excel of ' + E(deptName(d)) + ' (' + E(ex.err) + ').<br>Upload an Excel in <b>Data</b> first, or check the connection.</div>';
    const l = filtered(step, d);
    const sel = S.sel[step];
    const allOn = l.length > 0 && l.every(r => sel.has(r.id));
    const shown = l.slice(0, S.limit[step]);
    let h = '<div class="em-selbar"><input type="checkbox" data-em="all" id="emAll' + step + '"' + (allOn ? ' checked' : '') + (l.length ? '' : ' disabled') + ' aria-label="Select all">' +
      '<label for="emAll' + step + '" style="margin:0;cursor:pointer;">Select all</label><span class="em-spacer"></span><span>' + l.length + ' shown</span></div>';
    if (!l.length) {
      const msgs = {
        1: 'Everyone in the last Excel is already listed in RPPF. 🎉',
        2: 'No employee is waiting for an area. List employees in step 1 first.',
        3: S.area3 ? 'Nobody to show here. Try “All employees” or pick another area.' : 'Pick an area above.',
        4: 'No employee matches this filter.'
      };
      return h + '<div class="em-list"><div class="em-empty">' + msgs[step] + '</div></div>';
    }
    h += '<div class="em-list">' + shown.map(r => rowHtml(r, step)).join('');
    if (l.length > shown.length) h += '<button type="button" class="em-more" data-em="more">Show more (' + (l.length - shown.length) + ' left)</button>';
    return h + '</div>';
  }

  function areaOptions(d, withEmpty, emptyLabel) {
    return (withEmpty ? '<option value="">' + E(emptyLabel || 'Choose area…') + '</option>' : '') +
      realAreas(d).map(a => '<option value="' + E(a) + '">' + E(a) + '</option>').join('');
  }
  function subOptions(list, emptyLabel) {
    return '<option value="">' + E(emptyLabel || 'Choose sub-section…') + '</option>' +
      list.map(s => '<option value="' + E(s) + '">' + E(s) + '</option>').join('') +
      '<option value="__new__">➕ New sub-section…</option>';
  }

  function actHtml(step, d) {
    const n = S.sel[step].size;
    const dis = n ? '' : ' disabled';
    const head = '<div class="em-count">' + n + ' selected</div>';
    if (step === 1) {
      return '<div class="em-act">' + head + '<div class="em-act-row"><button type="button" class="em-btn primary grow" data-em="list"' + dis + '>List ' + (n || '') + ' to RPPF (' + E(d) + ')</button></div></div>';
    }
    if (step === 2) {
      return '<div class="em-act">' + head + '<div class="em-act-row"><select id="emAssignArea" aria-label="Area">' + areaOptions(d, true, 'Assign to area…') + '</select>' +
        '<button type="button" class="em-btn primary" data-em="assign"' + dis + '>Assign</button></div></div>';
    }
    if (step === 3) {
      const subs = S.area3 ? subsOf(S.area3) : [];
      return '<div class="em-act">' + head + '<div class="em-act-row"><select id="emSub3" data-em="sub3sel" aria-label="Sub-section">' + subOptions(subs) + '</select></div>' +
        '<div class="em-act-row" id="emSub3NewRow" style="display:none"><input type="text" id="emSub3New" maxlength="40" placeholder="New sub-section name"></div>' +
        '<div class="em-act-row"><button type="button" class="em-btn primary grow" data-em="sub3"' + dis + '>Set sub-section</button>' +
        '<button type="button" class="em-btn" data-em="sub3clear"' + dis + '>Clear</button></div></div>';
    }
    const uniqSubs = [...new Set(realAreas(d).flatMap(a => subsOf(a)))].sort((a, b) => a.localeCompare(b));
    return '<div class="em-act">' + head +
      '<div class="em-act-row"><select id="emMoveArea" aria-label="New area">' + areaOptions(d, true, 'Change area to…') + '</select><button type="button" class="em-btn primary" data-em="move"' + dis + '>Move</button></div>' +
      '<div class="em-act-row"><select id="emSub4" data-em="sub4sel" aria-label="Sub-section">' + subOptions(uniqSubs, 'Change sub-section to…') + '</select><button type="button" class="em-btn primary" data-em="sub4"' + dis + '>Apply</button><button type="button" class="em-btn" data-em="sub4clear"' + dis + '>Clear</button></div>' +
      '<div class="em-act-row" id="emSub4NewRow" style="display:none"><input type="text" id="emSub4New" maxlength="40" placeholder="New sub-section name (applied to the selected employees’ areas)"></div>' +
      '<div class="em-act-row"><button type="button" class="em-btn danger grow" data-em="delist"' + dis + '>Delist from RPPF (left the job / facility change)</button></div></div>';
  }

  function toolsHtml(step, d) {
    const q = '<input type="search" data-em="q" placeholder="Search name or ID…" value="' + E(S.q[step]) + '" aria-label="Search">';
    if (step === 3) {
      const areas = realAreas(d);
      if (!S.area3 || !areas.includes(S.area3)) S.area3 = areas[0] || null;
      const listed = allListed(d);
      const chips = areas.map(a => '<button type="button" class="em-chip' + (S.area3 === a ? ' on' : '') + '" data-em="area3" data-v="' + E(a) + '">' + E(a) + ' <small>' + listed.filter(r => r.area === a).length + '</small></button>').join('');
      return '<div class="em-chips">' + chips + '</div><div class="em-tools">' + q +
        '<select data-em="show3" aria-label="Show"><option value="nosub"' + (S.show3 === 'nosub' ? ' selected' : '') + '>Without sub-section</option><option value="all"' + (S.show3 === 'all' ? ' selected' : '') + '>All employees of area</option></select></div>';
    }
    if (step === 4) {
      const f = S.f4, areas = realAreas(d);
      const subs = f.area !== 'all' && f.area !== 'pool' ? subsOf(f.area) : [...new Set(areas.flatMap(a => subsOf(a)))].sort((a, b) => a.localeCompare(b));
      const aOpt = '<option value="all">All areas</option><option value="pool"' + (f.area === 'pool' ? ' selected' : '') + '>Not assigned</option>' +
        areas.map(a => '<option value="' + E(a) + '"' + (f.area === a ? ' selected' : '') + '>' + E(a) + '</option>').join('');
      const sOpt = '<option value="all">All sub-sections</option><option value="none"' + (f.sub === 'none' ? ' selected' : '') + '>No sub-section</option>' +
        subs.map(s => '<option value="' + E(s) + '"' + (f.sub === s ? ' selected' : '') + '>' + E(s) + '</option>').join('');
      return '<div class="em-tools">' + q + '<select data-em="f4area" aria-label="Area">' + aOpt + '</select><select data-em="f4sub" aria-label="Sub-section">' + sOpt + '</select></div>' +
        '<div class="em-chips" style="padding-top:0"><button type="button" class="em-chip' + (f.notIn ? ' on' : '') + '" data-em="f4notin">Not in last Excel (may have left)</button></div>';
    }
    return '<div class="em-tools">' + q + '</div>';
  }

  const STEPS = [
    null,
    { name: 'List to RPPF', sub: d => 'Dept ' + d + ' · from the last uploaded Excel of the relevant department' },
    { name: 'Assign to area', sub: () => 'from listed employees' },
    { name: 'Define sub-section', sub: () => 'from assigned employees of an area' },
    { name: 'Manage employee', sub: () => 'Delist from RPPF (left the job / facility change) · sub-section change · area change' }
  ];
  function counts(d) {
    const listed = allListed(d);
    const ex = S.excel[d];
    return {
      1: ex && ex.ok ? candidates(d).length : null,
      2: listed.filter(r => r.area === poolOf(d)).length,
      3: listed.filter(r => !isPool(r.area) && !r.sub).length,
      4: listed.length
    };
  }
  function stepBody(step, d) {
    const hints = {
      1: 'Everyone in the last uploaded Excel who is not listed in RPPF yet. Tick the people who belong to RPPF and list them.',
      2: 'These employees are listed in RPPF but have no area yet. Tick them and assign an area.',
      3: 'Pick an area, tick the employees and set their sub-section (choose an existing one or type a new one).',
      4: 'Every listed employee. Tick one or more, then delist, change area or change sub-section.'
    };
    return '<p class="em-hint">' + hints[step] + '</p>' + toolsHtml(step, d) + '<div id="emListHost">' + listHtml(step, d) + '</div><div id="emActHost">' + actHtml(step, d) + '</div>';
  }

  function render() {
    const root = $('empMgmtRoot');
    if (!root) return;
    S.mapRef = AREA_MAP;
    const d = dept();
    ensureLoaded(d);
    const c = counts(d), ex = S.excel[d];
    let h = '<div class="em-wrap"><div class="em-title">Employee Management</div><div class="em-meta">' +
      '<span class="em-pill">' + E(deptName(d)) + ' (' + E(d) + ')</span>' +
      '<span>' + (ex ? (ex.ok ? 'Last Excel: ' + E(ex.month || '—') + ' · ' + ex.byId.size + ' employees' : 'Last Excel: not available') : 'Last Excel: loading…') + '</span><span class="em-spacer"></span>';
    if (scope() !== 'PR' && scope() !== 'QA') {
      h += '<span class="em-seg"><button type="button" data-em="dept" data-v="PR" class="' + (d === 'PR' ? 'on' : '') + '">PR</button><button type="button" data-em="dept" data-v="QA" class="' + (d === 'QA' ? 'on' : '') + '">QA</button></span>';
    }
    h += '<button type="button" class="em-link" data-em="refresh">↻ Reload Excel</button><button type="button" class="em-link" data-em="backup">Backup</button></div>';
    if (S.undo) h += '<div class="em-undo"><span>Done: ' + E(S.undo.label) + '</span><button type="button" class="em-btn" data-em="undo">Undo</button></div>';
    for (let i = 1; i <= 4; i++) {
      const open = S.step === i;
      const badgeCls = (i === 2 && c[2] > 0) ? ' warn' : '';
      h += '<section class="em-step' + (open ? ' open' : '') + '"><button type="button" class="em-step-head" data-em="step" data-v="' + i + '" aria-expanded="' + open + '">' +
        '<span class="em-step-no">' + i + '</span><span class="em-step-txt"><span class="em-step-name">' + STEPS[i].name + '</span><span class="em-step-sub">' + E(STEPS[i].sub(d)) + '</span></span>' +
        '<span class="em-badge' + badgeCls + '">' + (c[i] == null ? '…' : c[i]) + '</span>' + ICON_CHEV + '</button>' +
        '<div class="em-step-body">' + (open ? stepBody(i, d) : '') + '</div></section>';
    }
    root.innerHTML = h + '</div>';
  }
  function renderList() {                // search / checkbox changes: do not rebuild the inputs (keeps focus)
    const d = dept();
    const lh = $('emListHost'), ah = $('emActHost');
    if (!lh || !ah) return render();
    const keepArea = ($('emAssignArea') || {}).value, keepMove = ($('emMoveArea') || {}).value;
    lh.innerHTML = listHtml(S.step, d);
    refreshActBar(d, keepArea, keepMove);
    refreshBadges(d);
  }
  function refreshActBar(d, keepArea, keepMove) {
    const ah = $('emActHost'); if (!ah) return;
    const keep = {};
    ['emSub3', 'emSub3New', 'emSub4', 'emSub4New'].forEach(id => { const el = $(id); if (el) keep[id] = el.value; });
    ah.innerHTML = actHtml(S.step, d);
    Object.keys(keep).forEach(id => { const el = $(id); if (el) el.value = keep[id]; });
    if ($('emAssignArea') && keepArea) $('emAssignArea').value = keepArea;
    if ($('emMoveArea') && keepMove) $('emMoveArea').value = keepMove;
    ['3', '4'].forEach(k => { const s = $('emSub' + k), row = $('emSub' + k + 'NewRow'); if (s && row) row.style.display = s.value === '__new__' ? 'flex' : 'none'; });
  }
  function refreshBadges(d) {
    const c = counts(d);
    document.querySelectorAll('#empMgmtRoot .em-step-head').forEach(b => {
      const i = +b.getAttribute('data-v'), el = b.querySelector('.em-badge');
      if (el) el.textContent = c[i] == null ? '…' : c[i];
    });
  }
  function ensureLoaded(d) {
    if (S.excel[d] || S.loading[d]) return;
    loadExcel(d).then(() => { if ($('empMgmtRoot') && dept() === d) render(); });
  }

  /* ------------------------------ events ------------------------------ */
  function onClick(e) {
    const t = e.target.closest('[data-em]');
    if (!t) return;
    const a = t.getAttribute('data-em'), v = t.getAttribute('data-v');
    switch (a) {
      case 'step': S.step = (S.step === +v) ? 0 : +v; render(); break;
      case 'dept': if (typeof onAdminDevScopeChange === 'function' && typeof getAdminUser === 'function' && getAdminUser().toLowerCase() === 'dev') { onAdminDevScopeChange(v); } else { S.dept = v; S.area3 = null; Object.keys(S.sel).forEach(k => S.sel[k].clear()); S.f4 = { area: 'all', sub: 'all', notIn: false }; render(); } break;
      case 'refresh': delete S.excel[dept()]; render(); toast('Reloading the last Excel…', 'info'); break;
      case 'backup': try { adminDownloadAreasJson(); } catch (err) { toast('Backup not available', 'error'); } break;
      case 'undo': doUndo(); break;
      case 'area3': S.area3 = v; S.sel[3].clear(); S.limit[3] = PAGE; render(); break;
      case 'f4notin': S.f4.notIn = !S.f4.notIn; S.limit[4] = PAGE; render(); break;
      case 'more': S.limit[S.step] += 120; renderList(); break;
      case 'list': actList(); break;
      case 'assign': actAssign(); break;
      case 'sub3': actSub3(false); break;
      case 'sub3clear': actSub3(true); break;
      case 'move': actMoveArea(); break;
      case 'sub4': actSub4(false); break;
      case 'sub4clear': actSub4(true); break;
      case 'delist': actDelist(); break;
    }
  }
  function onChange(e) {
    const t = e.target.closest('[data-em]');
    if (!t) return;
    const a = t.getAttribute('data-em'), step = S.step;
    if (a === 'pick') {
      const id = t.getAttribute('data-id');
      if (t.checked) S.sel[step].add(id); else S.sel[step].delete(id);
      const row = t.closest('.em-row'); if (row) row.classList.toggle('sel', t.checked);
      const d = dept(), l = filtered(step, d), all = $('emAll' + step);
      if (all) all.checked = l.length > 0 && l.every(r => S.sel[step].has(r.id));
      refreshActBar(d);
    } else if (a === 'all') {
      const l = filtered(step, dept());
      l.forEach(r => { if (t.checked) S.sel[step].add(r.id); else S.sel[step].delete(r.id); });
      renderList();
    } else if (a === 'show3') { S.show3 = t.value; S.sel[3].clear(); renderList(); }
    else if (a === 'f4area') { S.f4.area = t.value; S.f4.sub = 'all'; S.sel[4].clear(); S.limit[4] = PAGE; render(); }
    else if (a === 'f4sub') { S.f4.sub = t.value; S.limit[4] = PAGE; renderList(); }
    else if (a === 'sub3sel' || a === 'sub4sel') {
      const k = a === 'sub3sel' ? '3' : '4', row = $('emSub' + k + 'NewRow');
      if (row) row.style.display = t.value === '__new__' ? 'flex' : 'none';
    }
  }
  function onInput(e) {
    const t = e.target.closest('[data-em="q"]');
    if (!t) return;
    S.q[S.step] = t.value; S.limit[S.step] = PAGE;
    renderList();
  }

  function bind() {
    const root = $('empMgmtRoot');
    if (!root || root.__emBound) return;
    root.__emBound = true;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
  }

  /* Re-draw if the Sync Center swapped in a fresher areas.json copy */
  setInterval(() => {
    const pane = $('admPaneEmployees');
    if (pane && pane.classList.contains('active') && S.mapRef && S.mapRef !== AREA_MAP) render();
  }, 1500);

  window.EmpMgmt = {
    show() { bind(); S.mapRef = null; render(); },
    render,
    setDept(d) { S.dept = d; S.area3 = null; Object.keys(S.sel).forEach(k => S.sel[k].clear()); S.f4 = { area: 'all', sub: 'all', notIn: false }; render(); },
    _state: S
  };
  bind();
})();
