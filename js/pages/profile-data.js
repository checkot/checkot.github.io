/* ==========================================================================
   PROFILE-DATA.JS - History loader for the "Me" page (fetch + localStorage; no DOM)
   --------------------------------------------------------------------------
   profLoadHistory(id, opts) -> Promise<{ id, dept, source, months, meta, complete }>

     Step 1  primary month  : fetchMonthPreIndexedData() (cached by the app) -> onMonth() at once
     Step 2  Option A       : data/emp/<DEPT>/<ID>.json  (one small file, all months + pre-computed meta)
     Step 3  Option B       : only if step 2 fails (404/offline/parse). Month files one at a time,
                              newest first, "Loading 4/11 months" via onProgress. Only the compact
                              per-employee extract is cached in localStorage (closed months are
                              immutable -> never refetched). The current month always comes from
                              fetchMonthPreIndexedData (fresh once per session).

   opts:
     dept          'PR' | 'QA'           (default getClientDepartment())
     wantedMonths  ['2026-01', ...]      months to cover (default: 2025-12 .. current month)
     primaryMonth  'YYYY-MM'             loaded first (default: newest wanted)
     onMonth(ym, emp|null, meta, info)   called as data arrives (info.revision=true when meta improved)
     onProgress(done, total, info)       progress for the "Loading n/m months" bar

   meta[ym] = { maxActiveDay, consensusHolidays:[days], prevNight:boolean }  (same as scripts/build_emp_history.py)
   Privacy: reads only; nothing is sent anywhere. Cache lives in this browser only.
   ========================================================================== */

const PROF_FIRST_MONTH = '2025-12';
const PROF_CACHE_PREFIX = (typeof STORAGE_NAMESPACE !== 'undefined' ? STORAGE_NAMESPACE : '') + 'rppf_prof_v1_';
const _PROF_ALIAS_PAIRS = { 'CL6515': '556515', '556515': 'CL6515', 'CL6531': '556531', '556531': 'CL6531' };

function profCurrentYm() { // current month in Bangladesh time (UTC+6)
  const d = new Date(Date.now() + 6 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
function profPrevYm(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/); if (!m) return '';
  let y = +m[1], mo = +m[2] - 1; if (mo < 1) { mo = 12; y--; }
  return y + '-' + String(mo).padStart(2, '0');
}
function profMonthRange(first, last) { // inclusive, ascending
  const out = []; let cur = last, guard = 0;
  while (cur && cur >= first && guard++ < 120) { out.unshift(cur); cur = profPrevYm(cur); }
  return out;
}
function profIdVariants(id) {
  const u = String(id || '').trim().toUpperCase(); const set = [u];
  try { if (typeof resolveEmpAliasId === 'function') { const a = resolveEmpAliasId(u); if (a && set.indexOf(a) < 0) set.push(a); } } catch (_e) {}
  if (_PROF_ALIAS_PAIRS[u] && set.indexOf(_PROF_ALIAS_PAIRS[u]) < 0) set.push(_PROF_ALIAS_PAIRS[u]);
  return set;
}
function _profSafeFile(id) { return String(id).replace(/[^A-Za-z0-9_-]/g, '_'); }
function _profDayNo(d) {
  if (typeof d === 'number') return Math.floor(d);
  const s = String(d == null ? '' : d).trim(); const iso = s.match(/^\d{4}-\d{1,2}-(\d{1,2})$/);
  return iso ? +iso[1] : parseInt(s, 10);
}
function _profN(v) { v = Number(v); return isFinite(v) ? v : 0; }

/** Port of getMonthDatasetMeta() (js/app-main.js) that does NOT touch global caches. */
function profComputeDatasetMeta(list) {
  let maxActive = 0; const st = {};
  (list || []).forEach(e => {
    if (!e || e.isRppf === false) return;
    (Array.isArray(e.daily) ? e.daily : []).forEach(r => {
      if (!r) return; const k = _profDayNo(r[0]); if (!k || k < 1 || k > 31) return;
      const s = st[k] || (st[k] = { total: 0, reg: 0, hol: 0 }); s.total++;
      const reg = _profN(r[4]), doD = _profN(r[6]) + _profN(r[7]), hol = _profN(r[8]) + _profN(r[9]);
      const hrs = reg + _profN(r[5]) + doD + hol;
      if (reg > 0) s.reg++; if (hol > 0 || doD > 0) s.hol++;
      if (hrs > 0 || String(r[2] || '').trim() || String(r[3] || '').trim() || !!r[10]) { if (k > maxActive) maxActive = k; }
    });
  });
  const cons = [];
  Object.keys(st).forEach(ks => { const s = st[ks]; if (s.total >= 15 && (s.hol / s.total >= 0.25 || (s.reg / s.total < 0.25 && s.hol > 0))) cons.push(+ks); });
  return { maxActiveDay: maxActive > 0 ? maxActive : 31, consensusHolidays: cons.sort((a, b) => a - b) };
}

function _profFindEmp(list, variants) {
  if (!Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i++) {
    const e = list[i]; if (e && variants.indexOf(String(e.id || '').trim().toUpperCase()) >= 0) return e;
  }
  return null;
}

/* ---- localStorage (compact per-employee extract only) ---- */
function _profCacheKey(dept, id) { return PROF_CACHE_PREFIX + dept + '_' + id; }
function _profCacheRead(dept, id) {
  try { const raw = localStorage.getItem(_profCacheKey(dept, id)); if (!raw) return { v: 1, months: {} }; const o = JSON.parse(raw); return (o && o.v === 1 && o.months) ? o : { v: 1, months: {} }; }
  catch (_e) { return { v: 1, months: {} }; }
}
function _profCacheWrite(dept, id, obj) {
  try { obj.ts = Date.now(); localStorage.setItem(_profCacheKey(dept, id), JSON.stringify(obj)); } catch (_e) { /* quota / private mode: cache is optional */ }
}

function _profMetaFromMemory(ym) {
  try {
    if (typeof getMonthDatasetMeta === 'function') {
      const m = getMonthDatasetMeta(ym);
      return { maxActiveDay: m.maxActiveDay || 31, consensusHolidays: Array.from(m.consensusHolidays || []).sort((a, b) => a - b) };
    }
  } catch (_e) {}
  return { maxActiveDay: 31, consensusHolidays: [] };
}
function _profLastNight(emp, ym) {
  try { return !!(emp && typeof didEmpWorkNightOnLastDay === 'function' && didEmpWorkNightOnLastDay(emp, ym)); } catch (_e) { return false; }
}

async function profLoadHistory(id, opts) {
  opts = opts || {};
  const dept = opts.dept || (typeof getClientDepartment === 'function' ? getClientDepartment() : 'PR');
  const cur = profCurrentYm();
  const wanted = (opts.wantedMonths && opts.wantedMonths.length ? opts.wantedMonths.slice() : profMonthRange(PROF_FIRST_MONTH, cur)).filter(m => m <= cur).sort();
  const primary = opts.primaryMonth && wanted.indexOf(opts.primaryMonth) >= 0 ? opts.primaryMonth : wanted[wanted.length - 1];
  const variants = profIdVariants(id);
  const res = { id: variants[0], dept: dept, source: '', months: {}, meta: {}, complete: false };
  const lastNight = {}; // ym -> bool (Option B bookkeeping)
  const onMonth = typeof opts.onMonth === 'function' ? opts.onMonth : function () {};
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
  const total = wanted.length;
  let done = 0;
  const emit = (ym, emp, meta, info) => { res.months[ym] = emp || null; res.meta[ym] = meta; try { onMonth(ym, emp || null, meta, info || {}); } catch (_e) {} };

  // ---- Step 1: primary month from the app's own cache/fetch ----
  if (primary && typeof fetchMonthPreIndexedData === 'function') {
    try {
      const list = await fetchMonthPreIndexedData(primary);
      const emp = _profFindEmp(list, variants);
      let prevNight = false;
      try { const pl = monthIndexMemoryCache[profPrevYm(primary)]; if (Array.isArray(pl)) prevNight = _profLastNight(_profFindEmp(pl, variants), profPrevYm(primary)); } catch (_e) {}
      const meta = Object.assign(_profMetaFromMemory(primary), { prevNight: prevNight, _prevKnown: false });
      emit(primary, emp, meta, { primary: true });
      done++; onProgress(done, total, { ym: primary, source: 'primary' });
    } catch (_e) { /* fall through; Option A/B will cover it */ }
  }

  // ---- Step 2: Option A (single small file) ----
  let optionA = null;
  for (let i = 0; i < variants.length && !optionA; i++) {
    try {
      const j = await fetchJsonResource('data/emp/' + dept + '/' + _profSafeFile(variants[i]) + '.json', 10000);
      if (j && j.months && typeof j.months === 'object') optionA = j;
    } catch (_e) { /* 404 / offline -> next variant, then Option B */ }
  }
  if (optionA) {
    res.source = 'emp-file';
    wanted.slice().reverse().forEach(ym => {
      const m = (optionA.meta && optionA.meta[ym]) || { maxActiveDay: 31, consensusHolidays: [], prevNight: false };
      if (ym === primary && res.months[ym] === null && optionA.months[ym]) { // primary list lacked the employee (e.g. memory cache of another department): the dept-specific emp file is authoritative
        emit(ym, optionA.months[ym], { maxActiveDay: m.maxActiveDay, consensusHolidays: m.consensusHolidays || [], prevNight: !!m.prevNight, _prevKnown: true }, { revision: true });
        return;
      }
      if (ym === primary && res.months[ym] !== undefined) { // keep the fresh month; only improve prevNight (needs the previous month)
        const mm = Object.assign({}, res.meta[ym], { prevNight: !!m.prevNight, _prevKnown: true });
        const changed = mm.prevNight !== res.meta[ym].prevNight; res.meta[ym] = mm;
        if (changed) { try { onMonth(ym, res.months[ym], mm, { revision: true }); } catch (_e) {} }
        return;
      }
      emit(ym, optionA.months[ym] || null, { maxActiveDay: m.maxActiveDay, consensusHolidays: m.consensusHolidays || [], prevNight: !!m.prevNight, _prevKnown: true }, {});
      done++; onProgress(Math.min(done, total), total, { ym: ym, source: 'emp-file' });
    });
    res.complete = true; onProgress(total, total, { source: 'emp-file', final: true });
    return res;
  }

  // ---- Step 3: Option B (progressive, newest first) ----
  res.source = 'months';
  const cache = _profCacheRead(dept, variants[0]);
  const order = wanted.slice().reverse().filter(ym => ym !== primary);
  const oldest = wanted[0], aux = profPrevYm(oldest); // one extra older month only for prevNight of the oldest wanted month
  const seq = order.concat(aux ? [aux] : []);
  let dirty = false;
  const prevFor = ym => { const p = profPrevYm(ym); return (p in lastNight) ? !!lastNight[p] : null; };
  if (primary && res.months[primary] !== undefined) { lastNight[primary] = _profLastNight(res.months[primary], primary); }
  for (const ym of seq) {
    const isAux = ym === aux && wanted.indexOf(ym) < 0;
    const closed = ym < cur;
    let emp = null, meta = null, ln = false, got = false;
    const memList = (typeof monthIndexMemoryCache !== 'undefined') ? monthIndexMemoryCache[ym] : null;
    if (Array.isArray(memList) && memList.length) {
      emp = _profFindEmp(memList, variants); meta = _profMetaFromMemory(ym); ln = _profLastNight(emp, ym); got = true;
    } else if (closed && cache.months[ym]) {
      const c = cache.months[ym]; emp = c.e || null; meta = c.m; ln = !!c.ln; got = true;
    } else if (!closed && typeof fetchMonthPreIndexedData === 'function') {
      try { const list = await fetchMonthPreIndexedData(ym); if (Array.isArray(list)) { emp = _profFindEmp(list, variants); meta = _profMetaFromMemory(ym); ln = _profLastNight(emp, ym); got = true; } } catch (_e) {}
    }
    if (!got) {
      try {
        const j = await fetchJsonResource((dept === 'QA' ? 'data/qa/' : 'data/') + ym + '.json', 30000);
        const list = Array.isArray(j) ? j : (j && j.employees);
        if (Array.isArray(list)) {
          emp = _profFindEmp(list, variants); meta = profComputeDatasetMeta(list); ln = _profLastNight(emp, ym); got = true;
          if (closed) { cache.months[ym] = { e: emp, m: meta, ln: ln }; dirty = true; } // immutable -> cache the compact extract only
        }
      } catch (_e) { /* month file missing for this dept (e.g. QA before launch) -> treat as "no record" */
        got = true; emp = null; meta = { maxActiveDay: 31, consensusHolidays: [] }; ln = false;
        if (closed) { cache.months[ym] = { e: null, m: meta, ln: false }; dirty = true; }
      }
    }
    lastNight[ym] = ln;
    if (!isAux) {
      const pn = prevFor(ym);
      emit(ym, emp, Object.assign({}, meta, { prevNight: pn === true, _prevKnown: pn !== null }), {});
      done++; onProgress(Math.min(done, total), total, { ym: ym, source: 'months' });
    }
    // an older neighbour just arrived: refine prevNight of the next-newer month if it flips
    const nxt = (function () { const m = String(ym).match(/^(\d{4})-(\d{2})$/); if (!m) return ''; let y = +m[1], mo = +m[2] + 1; if (mo > 12) { mo = 1; y++; } return y + '-' + String(mo).padStart(2, '0'); })();
    if (nxt && res.meta[nxt] && res.meta[nxt].prevNight !== !!ln) {
      const mm = Object.assign({}, res.meta[nxt], { prevNight: !!ln, _prevKnown: true }); res.meta[nxt] = mm;
      try { onMonth(nxt, res.months[nxt] || null, mm, { revision: true }); } catch (_e) {}
    }
  }
  if (dirty) _profCacheWrite(dept, variants[0], cache);
  res.complete = true; onProgress(total, total, { source: 'months', final: true });
  return res;
}
