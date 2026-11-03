/* ==========================================================================
   MANAGER-UX.JS  (loaded LAST - wraps existing functions, edits nothing else)
   1. Stale body scroll-lock release (fixes Overview "stuck scroll")
   2. Full-width mobile drawers + Back bar (fixes half-open Rank / More)
   3. Info "?" buttons (Punch Problem / OT-Requisition Missing)
   4. Report: loading / "No data available" state + manager month/filter bar
   5. VS: multi-month / range / custom-month period + clean PNG export
   6. Slim busy bar + empty-ranking toast
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg, type) { try { if (typeof showToast === 'function') showToast(msg, type || 'info'); } catch (e) { } }
  function monthLabel(m) {
    var p = String(m || '').split('-');
    return p.length === 2 ? (MON[(parseInt(p[1], 10) || 1) - 1] + ' ' + p[0]) : String(m || '');
  }
  function curMonth() {
    try { return (typeof getCurrentMonth === 'function') ? getCurrentMonth() : ''; } catch (e) { return ''; }
  }
  function allMonths() {
    var a = [];
    try { if (typeof availableServerMonths !== 'undefined' && Array.isArray(availableServerMonths)) a = availableServerMonths.slice(); } catch (e) { }
    var c = curMonth();
    if (!a.length && typeof getPreviousMonthStrings === 'function' && c) {
      try { a = getPreviousMonthStrings(c, 12).slice(); } catch (e) { }
    }
    if (c && a.indexOf(c) < 0) a.push(c);
    return a.filter(function (v, i, s) { return /^\d{4}-\d{2}$/.test(v) && s.indexOf(v) === i; }).sort();
  }
  function isManager() {
    try { return typeof getAppMode === 'function' && getAppMode() === 'incharge'; } catch (e) { return false; }
  }

  /* ---------- 6. busy bar ---------- */
  var busyCount = 0;
  function busy(on) {
    var bar = $('mgrBusyBar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'mgrBusyBar'; document.body.appendChild(bar); }
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    bar.classList.toggle('on', busyCount > 0);
  }

  /* ---------- 1. stale scroll-lock release ---------- */
  function modalOpen() {
    return !!document.querySelector('.lb-modal.open, [id$="Modal"].open, .modal.open, [class*="overlay"].open, [class*="sheet"].open');
  }
  function releaseStaleLock() {
    var b = document.body;
    if (!b) return;
    if (b.style.overflow !== 'hidden' && b.style.position !== 'fixed') return;
    if (modalOpen()) return;
    b.style.overflow = '';
    b.style.position = '';
    b.style.width = '';
    b.style.top = '';
  }
  var lastTouchCheck = 0;
  document.addEventListener('touchstart', function () {
    var n = Date.now();
    if (n - lastTouchCheck < 400) return;
    lastTouchCheck = n;
    releaseStaleLock();
  }, { capture: true, passive: true });
  window.addEventListener('pageshow', releaseStaleLock);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) releaseStaleLock(); });

  function wrapGlobal(name, make) {
    try {
      var orig = window[name];
      if (typeof orig !== 'function' || orig.__mgrWrapped) return;
      var w = make(orig);
      w.__mgrWrapped = true;
      window[name] = w;
    } catch (e) { console.warn('manager-ux: cannot wrap', name, e); }
  }

  wrapGlobal('switchPage', function (orig) {
    return function () {
      releaseStaleLock();
      var r = orig.apply(this, arguments);
      setTimeout(releaseStaleLock, 350);
      return r;
    };
  });
  wrapGlobal('closeSideDrawer', function (orig) {
    return function () {
      var r = orig.apply(this, arguments);
      releaseStaleLock();
      return r;
    };
  });

  /* ---------- 2. drawer back bar ---------- */
  function injectDrawerBars() {
    var map = { leaderboard: 'Ranking', more: 'More', history: 'History', team: 'ERP Team', settings: 'Settings', notices: 'Notices' };
    Object.keys(map).forEach(function (k) {
      var p = $('page-' + k);
      if (!p || p.querySelector(':scope > .drawer-topbar')) return;
      var bar = document.createElement('div');
      bar.className = 'drawer-topbar';
      bar.innerHTML = '<button type="button" aria-label="Close">\u2039 Back</button><span>' + h(map[k]) + '</span>';
      bar.querySelector('button').addEventListener('click', function () {
        if (typeof closeSideDrawer === 'function') closeSideDrawer();
      });
      p.insertBefore(bar, p.firstChild);
    });
  }

  /* ---------- 3. info "?" ---------- */
  var INFO = {
    punch: {
      title: 'Punch Problem',
      html: '<p>Finds days where the <b>In</b> or <b>Out</b> punch is missing in the Empress work log.</p>' +
        '<h5>How it is detected</h5><ul>' +
        '<li>A punch counts as missing when it is blank, "-", "NA", "NULL", "MISSING" or "0000".</li>' +
        '<li>Valid night-shift carry-over days are handled separately.</li></ul>' +
        '<h5>Ranking</h5><p>Employees are listed by how many days have a missing punch in the selected period.</p>' +
        '<div class="mgr-note">Why it matters: a missing punch means duty hours and OT cannot be calculated correctly. Ask ERP to correct it.</div>'
    },
    req: {
      title: 'OT / Requisition Missing',
      html: '<p>Finds days where the punches show extra work, but Empress has <b>no OT or allowance</b> recorded.</p>' +
        '<h5>Checks (in order)</h5><ul>' +
        '<li><b>Govt holiday</b> worked, but booked as regular duty (holiday duty = 0).</li>' +
        '<li><b>Thu/Fri</b> worked, but booked as regular duty (day-off duty = 0).</li>' +
        '<li><b>Night shift</b> of 11h or more with 0 OT.</li>' +
        '<li><b>Day shift</b>, Out about 19:10-20:15 and 0 OT: 3h evening OT missing.</li>' +
        '<li><b>Day shift</b>, Out about 20:16-22:30 and 0 OT: 5h evening OT missing.</li>' +
        '<li><b>Early In</b> (07:15 or before) with 9.5h or more and 0 OT: morning OT missing.</li></ul>' +
        '<h5>Ranking</h5><p>Employees are listed by the number of flagged days. Days with a missing punch are skipped here (see Punch Problem).</p>' +
        '<div class="mgr-note">These are estimates from punch times. Please verify the requisition before taking action.</div>'
    }
  };
  INFO.both = {
    title: 'Report check',
    html: INFO.punch.html + '<hr style="border:0;border-top:1px solid var(--border);margin:12px 0">' + INFO.req.html
  };

  function openInfo(type) {
    var d = INFO[type] || INFO.both;
    var o = $('mgrInfoOverlay');
    if (!o) {
      o = document.createElement('div');
      o.id = 'mgrInfoOverlay';
      o.className = 'mgr-info-overlay';
      o.addEventListener('click', function (e) { if (e.target === o) o.classList.remove('open'); });
      document.body.appendChild(o);
    }
    o.innerHTML = '<div class="mgr-info-box" role="dialog" aria-modal="true"><button type="button" class="mgr-info-close" aria-label="Close">\u2715</button><h4>' +
      h(d.title) + '</h4>' + d.html + '</div>';
    o.querySelector('.mgr-info-close').addEventListener('click', function () { o.classList.remove('open'); });
    o.classList.add('open');
  }
  function qBadge(type) {
    var s = document.createElement('span');
    s.className = 'mgr-q';
    s.setAttribute('data-info', type);
    s.setAttribute('role', 'button');
    s.setAttribute('aria-label', 'How is this detected?');
    s.setAttribute('data-html2canvas-ignore', 'true');
    s.textContent = '?';
    return s;
  }
  document.addEventListener('click', function (e) {
    var q = e.target && e.target.closest ? e.target.closest('.mgr-q') : null;
    if (!q) return;
    e.preventDefault();
    e.stopPropagation();
    openInfo(q.getAttribute('data-info'));
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var o = $('mgrInfoOverlay'); if (o) o.classList.remove('open'); }
  });

  function injectInfoBadges() {
    document.querySelectorAll('.rank-hub-title').forEach(function (t) {
      if (t.querySelector('.mgr-q')) return;
      var txt = (t.textContent || '').trim();
      if (txt === 'Punch Problem') t.appendChild(qBadge('punch'));
      else if (txt === 'Requisition Problem') t.appendChild(qBadge('req'));
    });
    var lab = $('step7LabelText');
    if (lab && !lab.querySelector('.mgr-q')) lab.appendChild(qBadge('both'));
  }
  var rptObs = null, rptObsBusy = false;
  function decorateReportChips() {
    var host = $('rptPreviewHost');
    if (!host || rptObsBusy) return;
    rptObsBusy = true;
    try {
      host.querySelectorAll('span,div,b').forEach(function (el) {
        if (el.children.length || el.querySelector('.mgr-q')) return;
        var t = (el.textContent || '').trim();
        if (/^Req Missing/i.test(t)) el.appendChild(qBadge('req'));
        else if (/^Punch (OK|Miss|Problem)/i.test(t)) el.appendChild(qBadge('punch'));
      });
    } finally { rptObsBusy = false; }
  }
  function watchReportChips() {
    var host = $('rptPreviewHost');
    if (!host || rptObs || typeof MutationObserver === 'undefined') return;
    rptObs = new MutationObserver(function () { if (!rptObsBusy) decorateReportChips(); });
    rptObs.observe(host, { childList: true, subtree: true });
  }

  /* ---------- 4. report: state card + manager bar ---------- */
  var rptSeq = 0;
  function ensureStateCard() {
    var c = $('rptStateCard');
    if (c) return c;
    var anchor = $('reportEmptyCard');
    if (!anchor || !anchor.parentNode) return null;
    c = document.createElement('div');
    c.id = 'rptStateCard';
    c.className = 'card';
    anchor.parentNode.insertBefore(c, anchor);
    return c;
  }
  function setRptState(kind, month, msg) {
    var c = ensureStateCard();
    if (!c) return;
    if (kind === 'none') { c.classList.remove('show'); c.innerHTML = ''; return; }
    if (kind === 'loading') {
      c.innerHTML = '<div class="mgr-spin"></div><div class="st-title">Loading ' + h(monthLabel(month)) + '\u2026</div>';
    } else {
      c.innerHTML = '<div class="st-title">No data available</div>' +
        '<div class="st-sub">' + h(msg || ('No report found for ' + monthLabel(month) + '.')) + '</div>' +
        '<div class="st-nav"><button type="button" class="month-nav-btn" data-mgr-nav="-1">\u2039 Prev Month</button>' +
        '<button type="button" class="month-nav-btn" data-mgr-nav="1">Next Month \u203A</button></div>';
      c.querySelectorAll('[data-mgr-nav]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (typeof navigateReportMonth === 'function') navigateReportMonth(parseInt(b.getAttribute('data-mgr-nav'), 10));
        });
      });
    }
    c.classList.add('show');
  }
  function selMonth() {
    var y = $('yearSelect'), m = $('monthSelect');
    return (y && m) ? (y.value + '-' + m.value) : '';
  }

  wrapGlobal('findReport', function (orig) {
    return async function () {
      var my = ++rptSeq;
      var month = selMonth();
      var hasId = !!(($('employeeId') || {}).value || '').trim();
      if (hasId) setRptState('loading', month);
      busy(true);
      try { await orig.apply(this, arguments); } finally { busy(false); }
      if (my !== rptSeq) return;
      var ok = false;
      try { ok = (typeof currentResult !== 'undefined') && !!currentResult; } catch (e) { }
      if (ok || !hasId) { setRptState('none'); }
      else {
        var st = $('status');
        var msg = st ? String(st.innerText || '').split('\n')[0] : '';
        setRptState('nodata', month, msg);
      }
      syncMgrMonth();
    };
  });

  var pickMode = 'all';
  function buildMgrBar() {
    if ($('mgrReportBar')) return;
    var page = $('page-report');
    if (!page) return;
    var bar = document.createElement('div');
    bar.id = 'mgrReportBar';
    bar.className = 'card';
    bar.style.padding = '8px 10px';
    var OA = (typeof OVERALL_AREA !== 'undefined') ? OVERALL_AREA : 'Overall';
    bar.innerHTML =
      '<div class="mgr-row">' +
      '<select id="mgrMonthSel" aria-label="Month"></select>' +
      '<select id="mgrAreaSel" aria-label="Section"><option value="all">All sections</option>' +
      '<option value="Solid Production">Solid</option><option value="Softgel Production">Softgel</option>' +
      '<option value="Packing Hall">Packing</option><option value="' + h(OA) + '">Executives</option></select>' +
      '<button type="button" class="calc-mini-btn" id="mgrPickToggle">Browse \u25BE</button></div>' +
      '<div id="mgrPickPanel" style="display:none">' +
      '<div class="mgr-chips" id="mgrFilterChips">' +
      '<button type="button" class="mgr-chip active" data-mode="all">All</button>' +
      '<button type="button" class="mgr-chip" data-mode="punch">Punch problem</button>' +
      '<button type="button" class="mgr-chip" data-mode="req">OT missing</button></div>' +
      '<div class="mgr-row"><input type="text" id="mgrPickSearch" placeholder="Filter by ID or name" autocomplete="off"></div>' +
      '<div id="mgrPickList"></div></div>';
    var strip = $('reportEmpStrip');
    page.insertBefore(bar, strip || page.children[1] || null);

    $('mgrMonthSel').addEventListener('change', function () {
      var v = this.value.split('-');
      var ys = $('yearSelect'), ms = $('monthSelect');
      if (ys && ![].some.call(ys.options, function (o) { return o.value === v[0]; })) {
        var op = document.createElement('option'); op.value = v[0]; op.textContent = v[0]; ys.appendChild(op);
      }
      if (ys) ys.value = v[0];
      if (ms) ms.value = v[1];
      var id = '';
      try { id = (typeof currentSearchId !== 'undefined' && currentSearchId) ? currentSearchId : ''; } catch (e) { }
      if (id) {
        var ei = $('employeeId'); if (ei) ei.value = id;
        if (typeof findReport === 'function') findReport();
      }
      if ($('mgrPickPanel').style.display !== 'none') loadPick();
    });
    $('mgrAreaSel').addEventListener('change', function () { loadPick(); });
    $('mgrPickToggle').addEventListener('click', function () {
      var p = $('mgrPickPanel');
      var open = p.style.display === 'none';
      p.style.display = open ? 'block' : 'none';
      this.textContent = open ? 'Hide \u25B4' : 'Browse \u25BE';
      if (open) loadPick();
    });
    $('mgrFilterChips').addEventListener('click', function (e) {
      var b = e.target.closest('.mgr-chip');
      if (!b) return;
      pickMode = b.getAttribute('data-mode');
      this.querySelectorAll('.mgr-chip').forEach(function (x) { x.classList.toggle('active', x === b); });
      loadPick();
    });
    var t = null;
    $('mgrPickSearch').addEventListener('input', function () { clearTimeout(t); t = setTimeout(loadPick, 200); });
    $('mgrPickList').addEventListener('click', function (e) {
      var r = e.target.closest('.mgr-pick-row');
      if (r) pickEmployee(r.getAttribute('data-id'));
    });
    syncMgrMonth();
  }

  function syncMgrMonth() {
    var s = $('mgrMonthSel');
    if (!s) return;
    var opts = allMonths().slice().reverse();
    var cur = selMonth();
    if (cur && opts.indexOf(cur) < 0) opts.unshift(cur);
    var key = opts.join(',');
    if (s.getAttribute('data-key') !== key) {
      s.innerHTML = opts.map(function (m) { return '<option value="' + h(m) + '">' + h(monthLabel(m)) + '</option>'; }).join('');
      s.setAttribute('data-key', key);
    }
    if (cur) s.value = cur;
  }

  async function loadPick() {
    var list = $('mgrPickList');
    if (!list) return;
    var month = $('mgrMonthSel').value || selMonth();
    list.innerHTML = '<div class="mgr-pick-empty"><div class="mgr-spin"></div>Loading\u2026</div>';
    var data = null;
    busy(true);
    try {
      if (typeof loadAreaMap === 'function') await loadAreaMap();
      data = await fetchMonthPreIndexedData(month);
    } catch (e) { data = null; } finally { busy(false); }
    if (!Array.isArray(data) || !data.length) {
      list.innerHTML = '<div class="mgr-pick-empty">No data available for ' + h(monthLabel(month)) + '.</div>';
      return;
    }
    var area = $('mgrAreaSel').value;
    var q = ($('mgrPickSearch').value || '').trim().toLowerCase();
    var rows = [];
    data.forEach(function (e) {
      if (!e || !e.id) return;
      try { if (typeof isExecHiddenFor === 'function' && isExecHiddenFor(e)) return; } catch (x) { }
      if (area !== 'all') {
        var a = '';
        try { a = getAreaForId(e.id, true); } catch (x) { }
        if (a !== area) return;
      }
      if (q && String(e.id).toLowerCase().indexOf(q) < 0 && String(e.name || '').toLowerCase().indexOf(q) < 0) return;
      var tag = '', n = 0;
      if (pickMode === 'punch') {
        n = typeof getPunchProblemCount === 'function' ? getPunchProblemCount(e) : 0;
        if (n <= 0) return;
        tag = n + ' punch';
      } else if (pickMode === 'req') {
        try { n = computeEmpRequisitionProblems(e).length; } catch (x) { n = 0; }
        if (n <= 0) return;
        tag = n + ' OT miss';
      }
      rows.push({ id: String(e.id), name: e.name || '', n: n, tag: tag });
    });
    rows.sort(function (a, b) { return (b.n - a.n) || a.id.localeCompare(b.id); });
    if (!rows.length) {
      list.innerHTML = '<div class="mgr-pick-empty">Nothing found for this filter in ' + h(monthLabel(month)) + '.</div>';
      return;
    }
    var LIM = 60;
    list.innerHTML = rows.slice(0, LIM).map(function (r) {
      return '<button type="button" class="mgr-pick-row" data-id="' + h(r.id) + '"><b>' + h(r.id) + '</b><span class="n">' +
        h(r.name) + '</span>' + (r.tag ? '<span class="t">' + h(r.tag) + '</span>' : '') + '</button>';
    }).join('') + (rows.length > LIM ? '<div class="mgr-pick-empty">Showing first ' + LIM + ' of ' + rows.length + '. Use the filter box to narrow down.</div>' : '');
  }

  async function pickEmployee(id) {
    var v = ($('mgrMonthSel').value || selMonth()).split('-');
    var ys = $('yearSelect'), ms = $('monthSelect');
    if (ys && v[0]) {
      if (![].some.call(ys.options, function (o) { return o.value === v[0]; })) {
        var op = document.createElement('option'); op.value = v[0]; op.textContent = v[0]; ys.appendChild(op);
      }
      ys.value = v[0];
    }
    if (ms && v[1]) ms.value = v[1];
    var qi = $('reportQuickIdInput');
    if (qi) qi.value = id;
    if (typeof searchFromReportPage === 'function') await searchFromReportPage();
    var p = $('mgrPickPanel');
    if (p) { p.style.display = 'none'; var tgl = $('mgrPickToggle'); if (tgl) tgl.textContent = 'Browse \u25BE'; }
  }

  wrapGlobal('initReportPage', function (orig) {
    return function () {
      var r = orig.apply(this, arguments);
      syncMgrMonth();
      injectInfoBadges();
      watchReportChips();
      return r;
    };
  });
  wrapGlobal('syncReportPageBanner', function (orig) {
    return function () {
      var r = orig.apply(this, arguments);
      syncMgrMonth();
      return r;
    };
  });

  /* ---------- 5. VS: period handling ---------- */
  function vsEnd() { var s = $('vsMonthOverrideSelect'); return (s && s.value) || curMonth(); }
  function vsMonths() {
    var p = ($('vsPeriodSelect') || {}).value || 'current';
    var end = vsEnd();
    var all = allMonths();
    var upto = all.filter(function (m) { return m <= end; });
    if (p === 'current') return [end];
    if (p === '3m') return upto.slice(-3);
    if (p === '6m') return upto.slice(-6);
    if (p === '1y') return upto.slice(-12);
    if (p === 'ytd') return upto.filter(function (m) { return m.slice(0, 4) === end.slice(0, 4); });
    if (p === 'alltime') return all;
    if (p === 'custom') {
      var sel = [];
      document.querySelectorAll('#vsExtraPeriod .mgr-chip.active').forEach(function (b) { sel.push(b.getAttribute('data-m')); });
      return sel.sort();
    }
    if (p === 'range') {
      var f = ($('vsRangeFrom') || {}).value, t = ($('vsRangeTo') || {}).value;
      if (!f || !t) return [];
      if (f > t) { var x = f; f = t; t = x; }
      return all.filter(function (m) { return m >= f && m <= t; });
    }
    return [end];
  }
  function vsSub() {
    var sub = $('vsPageSub');
    if (!sub) return;
    var p = ($('vsPeriodSelect') || {}).value || 'current';
    if (p === 'current') { sub.textContent = 'Compare overtime & allowances (' + vsEnd() + ')'; return; }
    var ms = vsMonths();
    sub.textContent = ms.length ? ('Compare overtime & allowances (' + ms.length + ' month' + (ms.length > 1 ? 's' : '') + ')') : 'Compare overtime & allowances';
  }
  function buildVsExtra() {
    var sel = $('vsPeriodSelect');
    if (!sel) return;
    if (![].some.call(sel.options, function (o) { return o.value === 'custom'; })) {
      sel.insertAdjacentHTML('beforeend', '<option value="custom">Pick specific months</option><option value="range">Month range (from - to)</option>');
    }
    if (!$('vsExtraPeriod')) {
      var d = document.createElement('div');
      d.id = 'vsExtraPeriod';
      var row = sel.closest('.vs-bar-row');
      if (row && row.parentNode) row.parentNode.insertBefore(d, row.nextSibling);
      else if (sel.parentNode) sel.parentNode.appendChild(d);
    }
  }
  function renderVsExtra() {
    var box = $('vsExtraPeriod');
    if (!box) return;
    var p = ($('vsPeriodSelect') || {}).value || 'current';
    var all = allMonths();
    if (p === 'custom') {
      var prev = {};
      box.querySelectorAll('.mgr-chip.active').forEach(function (b) { prev[b.getAttribute('data-m')] = 1; });
      box.innerHTML = '<div class="mgr-chips">' + all.slice().reverse().map(function (m) {
        return '<button type="button" class="mgr-chip' + (prev[m] ? ' active' : '') + '" data-m="' + h(m) + '">' + h(monthLabel(m)) + '</button>';
      }).join('') + '</div>';
      box.querySelectorAll('.mgr-chip').forEach(function (b) {
        b.addEventListener('click', function () { b.classList.toggle('active'); vsSub(); });
      });
      box.classList.add('show');
    } else if (p === 'range') {
      var opts = all.map(function (m) { return '<option value="' + h(m) + '">' + h(monthLabel(m)) + '</option>'; }).join('');
      var oldF = ($('vsRangeFrom') || {}).value, oldT = ($('vsRangeTo') || {}).value;
      box.innerHTML = '<div class="mgr-row"><select id="vsRangeFrom" aria-label="From month">' + opts + '</select><span>to</span><select id="vsRangeTo" aria-label="To month">' + opts + '</select></div>';
      $('vsRangeFrom').value = oldF || all[Math.max(0, all.length - 3)] || '';
      $('vsRangeTo').value = oldT || all[all.length - 1] || '';
      $('vsRangeFrom').addEventListener('change', vsSub);
      $('vsRangeTo').addEventListener('change', vsSub);
      box.classList.add('show');
    } else {
      box.classList.remove('show');
      box.innerHTML = '';
    }
  }
  function applyVsPeriodUI() {
    var p = ($('vsPeriodSelect') || {}).value || 'current';
    var m = $('vsMonthOverrideSelect');
    if (m) m.style.display = (p === 'alltime' || p === 'custom' || p === 'range') ? 'none' : '';
    renderVsExtra();
    vsSub();
  }
  window.onVsPeriodChange = function () { applyVsPeriodUI(); };
  wrapGlobal('onVsMonthOverrideChange', function (orig) {
    return function () { var r = orig.apply(this, arguments); vsSub(); return r; };
  });
  wrapGlobal('initVsPage', function (orig) {
    return function () {
      var r = orig.apply(this, arguments);
      buildVsExtra();
      applyVsPeriodUI();
      return r;
    };
  });

  var SUM_KEYS = ['totalDuty', 'otHours', 'holidayCount', 'holiday', 'nightCount', 'night', 'plainDaysCount', 'plainDays',
    'otAmount', 'holidayAmount', 'nightAmount', 'totalEarned'];
  function numLike(v) { return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))); }
  function mergeLists(lists) {
    var map = {};
    lists.forEach(function (pair) {
      pair[1].forEach(function (e) {
        if (!e || !e.id) return;
        var id = String(e.id).toUpperCase();
        var cur = map[id];
        if (!cur) { map[id] = Object.assign({}, e); return; }
        SUM_KEYS.forEach(function (k) {
          if (numLike(e[k]) && numLike(cur[k])) cur[k] = Number(cur[k]) + Number(e[k]);
          else if (numLike(e[k]) && cur[k] == null) cur[k] = Number(e[k]);
        });
        ['name', 'grade', 'category', 'type'].forEach(function (k) { if (e[k]) cur[k] = e[k]; });
      });
    });
    return Object.keys(map).map(function (k) {
      var o = map[k];
      SUM_KEYS.forEach(function (key) { if (numLike(o[key])) o[key] = Math.round(Number(o[key]) * 100) / 100; });
      return o;
    });
  }
  function periodLabel(ms) {
    if (!ms.length) return '';
    var n = ms.length + ' month' + (ms.length > 1 ? 's' : '');
    if (ms.length === 1) return monthLabel(ms[0]);
    var contiguous = true;
    var all = allMonths();
    for (var i = 1; i < ms.length; i++) { if (all.indexOf(ms[i]) - all.indexOf(ms[i - 1]) !== 1) { contiguous = false; break; } }
    if (contiguous) return monthLabel(ms[0]) + ' \u2013 ' + monthLabel(ms[ms.length - 1]) + ' (' + n + ')';
    return ms.map(monthLabel).join(', ') + ' (' + n + ')';
  }

  wrapGlobal('runComparison', function (orig) {
    return async function () {
      var self = this, args = arguments;
      var p = ($('vsPeriodSelect') || {}).value || 'current';
      if (p === 'current') { window._vsPeriodLabel = ''; return orig.apply(self, args); }
      var ms = vsMonths();
      if (!ms.length) { toast('Select at least one month first', 'warn'); return; }
      var origFetch = window.fetchMonthPreIndexedData;
      busy(true);
      try {
        var lists = [];
        for (var i = 0; i < ms.length; i++) {
          try {
            var l = await origFetch(ms[i]);
            if (Array.isArray(l) && l.length) lists.push([ms[i], l]);
          } catch (e) { }
        }
        if (!lists.length) { toast('No data available for the selected period', 'warn'); return; }
        var merged = mergeLists(lists);
        var used = lists.map(function (x) { return x[0]; });
        window._vsPeriodLabel = periodLabel(used);
        window.fetchMonthPreIndexedData = async function () { return merged; };
        await orig.apply(self, args);
        var t = $('vsExportTarget');
        if (t && !t.querySelector('.vs-period-note')) {
          var miss = ms.length - used.length;
          t.insertAdjacentHTML('afterbegin', '<div class="vs-period-note">Period: ' + h(window._vsPeriodLabel) +
            (miss > 0 ? ' \u2022 ' + miss + ' month(s) had no data' : '') + '</div>');
        }
      } finally {
        window.fetchMonthPreIndexedData = origFetch;
        busy(false);
      }
    };
  });

  /* ----- VS PNG export: auto-sized columns, no overlapping text ----- */
  function fitText(g, text, maxW, weight, size, minSize, font) {
    var s = size;
    g.font = weight + ' ' + s + 'px ' + font;
    while (g.measureText(text).width > maxW && s > minSize) { s -= 1; g.font = weight + ' ' + s + 'px ' + font; }
    if (g.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && g.measureText(t + '\u2026').width > maxW) t = t.slice(0, -1);
    return t + '\u2026';
  }
  function wrapLines(g, text, maxW, maxLines) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var test = cur ? cur + ' ' + w : w;
      if (g.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    });
    if (cur) lines.push(cur);
    return lines.slice(0, maxLines || 3);
  }
  window.downloadVsComparisonPNG = async function (share) {
    var target = $('vsExportTarget');
    if (!target) return;
    var table = target.querySelector('table.compare-table');
    if (!table) return;
    try {
      toast(share ? 'Preparing comparison image...' : 'Downloading comparison PNG...', 'info');
      if (typeof ensurePayslipFonts === 'function') { try { await ensurePayslipFonts(); } catch (e) { } }
      var FONT = (typeof PAY_FONT !== 'undefined') ? PAY_FONT : 'Arial,sans-serif';
      var rows = [].map.call(table.querySelectorAll('tr'), function (tr) {
        return {
          total: tr.classList.contains('total-row'),
          cells: [].map.call(tr.children, function (td) {
            return {
              t: String(td.innerText || td.textContent || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
              win: td.classList.contains('win-cell')
            };
          })
        };
      });
      var cols = rows[0].cells.length;
      var m = document.createElement('canvas').getContext('2d');
      m.font = '600 18px ' + FONT;
      var labW = 0;
      rows.slice(1).forEach(function (r) { labW = Math.max(labW, m.measureText(r.cells[0].t.join(' ')).width); });
      var dataCols = Math.max(1, cols - 1);
      var colW = dataCols <= 2 ? 250 : dataCols === 3 ? 215 : 185;
      var firstW = Math.ceil(Math.max(240, labW + 36));
      var PAD = 32, W = PAD * 2 + firstW + colW * dataCols;
      var HEAD_H = 68, ROW_H = 48;
      var period = window._vsPeriodLabel || (typeof currentMonth !== 'undefined' && currentMonth ? currentMonth : curMonth());
      var diffEl = target.querySelector('.compare-diff');
      var diffText = diffEl ? diffEl.innerText.trim() : '';
      m.font = '800 19px ' + FONT;
      var diffLines = diffText ? wrapLines(m, diffText, W - PAD * 2, 3) : [];
      var TOP = 118;
      var H = TOP + HEAD_H + (rows.length - 1) * ROW_H + (diffLines.length ? diffLines.length * 28 + 34 : 20) + 14;

      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      var g = c.getContext('2d');
      g.fillStyle = '#F8FAFC'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1E3A8A'; g.fillRect(0, 0, W, 98);
      g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillStyle = '#FFFFFF';
      g.fillText(fitText(g, 'RPPF \u2014 VS Overtime Comparison', W - PAD * 2, 800, 28, 18, FONT), PAD, 36);
      g.fillStyle = '#BFDBFE';
      g.fillText(fitText(g, period, W - PAD * 2, 700, 19, 13, FONT), PAD, 70);

      var y = TOP;
      rows.forEach(function (r, ri) {
        var head = ri === 0;
        var rh = head ? HEAD_H : ROW_H;
        g.fillStyle = head ? '#0F172A' : r.total ? '#DCFCE7' : (ri % 2 === 0 ? '#FFFFFF' : '#F1F5F9');
        g.fillRect(PAD, y, W - PAD * 2, rh);
        var x = PAD;
        r.cells.forEach(function (cell, ci) {
          var cw = ci === 0 ? firstW : colW;
          g.strokeStyle = '#CBD5E1'; g.strokeRect(x, y, cw, rh);
          var inner = cw - 24;
          if (head && ci > 0) {
            g.textAlign = 'right';
            g.fillStyle = '#FFFFFF';
            g.fillText(fitText(g, cell.t[0] || '', inner, 800, 19, 12, FONT), x + cw - 12, y + (cell.t[1] ? 24 : rh / 2));
            if (cell.t[1]) {
              g.fillStyle = '#CBD5E1';
              g.fillText(fitText(g, cell.t[1], inner, 600, 14, 10, FONT), x + cw - 12, y + 48);
            }
          } else {
            var txt = cell.t.join(' ');
            g.fillStyle = head ? '#FFFFFF' : r.total ? '#15803D' : (cell.win ? '#1D4ED8' : '#0F172A');
            g.textAlign = ci === 0 ? 'left' : 'right';
            var wgt = (head || r.total || cell.win) ? 800 : 600;
            g.fillText(fitText(g, txt, inner, wgt, 18, 11, FONT), ci === 0 ? x + 12 : x + cw - 12, y + rh / 2);
          }
          x += cw;
        });
        y += rh;
      });
      if (diffLines.length) {
        g.fillStyle = '#0F172A'; g.textAlign = 'center';
        g.font = '800 19px ' + FONT;
        diffLines.forEach(function (ln, i) { g.fillText(ln, W / 2, y + 30 + i * 28); });
      }

      var blob = await new Promise(function (r) { c.toBlob(r, 'image/png'); });
      var tag = String(window._vsPeriodLabel || period).replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
      var fname = 'VS_Compare_' + tag + '.png';
      var file = new File([blob], fname, { type: 'image/png' });
      if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fname });
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('VS comparison PNG downloaded!', 'success');
    } catch (e) {
      if (e && e.name !== 'AbortError') toast('Could not export image', 'error');
    }
  };

  /* ---------- 6. ranking: busy + empty toast ---------- */
  wrapGlobal('startLeaderboardScan', function (orig) {
    return async function () {
      busy(true);
      try { return await orig.apply(this, arguments); }
      finally {
        busy(false);
        try {
          var r = (typeof currentLeaderboardResult !== 'undefined') ? currentLeaderboardResult : null;
          var mth = curMonth();
          var n = r && Array.isArray(r.allEmployees) ? r.allEmployees.length : 0;
          if (!r || !n || (r.month && (r.timeMode || 'monthly') === 'monthly' && r.month !== mth)) {
            toast('No data available for ' + monthLabel(mth), 'warn');
          }
        } catch (e) { }
      }
    };
  });

  /* ---------- boot ---------- */
  function boot() {
    injectDrawerBars();
    buildMgrBar();
    ensureStateCard();
    injectInfoBadges();
    watchReportChips();
    buildVsExtra();
    applyVsPeriodUI();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
