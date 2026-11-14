/**
 * js/patches/manager-ux.js  (v2 · 2026-11-03)
 * Manager / power-user UX layer for RENATA OT Checker.
 *
 *  1. Busy bar (global progress line)
 *  2. Scroll-lock guard  – no more "stuck" page after modals/drawers
 *  3. Full-width mobile drawers with sticky Back bar
 *  4. "?" info buttons  – OT Missing, Punch, Absent, Ranking (short English)
 *  5. Compact manager Overview (tabs instead of one very long page)
 *  6. Report tab: manager finder (month, section, issue, search) + loading / no-data states
 *  7. VS mode: multi-month, month range, custom dates, 1:1 / 1:1:1 / Custom (up to 10) + clean PNG export
 *  8. Ranking month-switch feedback
 *
 * NOTE: currentResult, currentLeaderboardResult, currentMonth … are top-level `let`
 * variables, so they are NOT on `window`. Always reference them by bare name.
 */
(function () {
  'use strict';
  if (window.__mgrUxV2) return;
  window.__mgrUxV2 = true;

  /* ------------------------------------------------------------------ helpers */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { v = Number(v); return isFinite(v) ? v : 0; };
  const r2 = (v) => Math.round(num(v) * 100) / 100;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_UP = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const isInc = () => { try { return getAppMode() === 'incharge'; } catch (e) { return false; } };
  const curMonth = () => {
    try {
      const m = (typeof getCurrentMonth === "function" ? getCurrentMonth() : "") || (typeof currentMonth !== "undefined" ? currentMonth : "");
      if (/^\d{4}-\d{2}$/.test(m)) return m;
    } catch (e) { /* ignore */ }
    return "2026-11";
  };
  const toast = (m, t) => { try { showToast(m, t || 'info'); } catch (e) { /* ignore */ } };
  const monLabel = (ym) => { const p = String(ym).split('-'); return p.length === 2 ? `${MON[(parseInt(p[1], 10) || 1) - 1] || p[1]} ${p[0]}` : String(ym); };
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const debounce = (fn, ms) => { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); }; };

  function wrap(name, make) {
    const orig = window[name];
    if (typeof orig !== 'function' || orig.__mgrWrapped) return;
    const w = make(orig);
    w.__mgrWrapped = true;
    window[name] = w;
  }

  /* ------------------------------------------------------------ 1. busy bar */
  let busyN = 0;
  function setBusy(on) {
    busyN = Math.max(0, busyN + (on ? 1 : -1));
    let el = $('mgrBusyBar');
    if (!el) { el = document.createElement('div'); el.id = 'mgrBusyBar'; document.body.appendChild(el); }
    el.classList.toggle('active', busyN > 0);
  }

  /* ------------------------------------------------------ 2. scroll-lock guard */
  const OVERLAY_SEL = '.lb-modal.open, .modal.open, .mgr-ov.open';
  function drillOpen() { try { return typeof iccDrillOpen !== 'undefined' && !!iccDrillOpen; } catch (e) { return false; } }
  function drawerOpen() { try { return !!currentSideDrawerPage; } catch (e) { return false; } }
  function releaseLock(force) {
    if (!force && (document.querySelector(OVERLAY_SEL) || drawerOpen() || drillOpen())) return;
    const b = document.body.style, h = document.documentElement.style;
    if (b.overflow || b.position || b.width || b.top || b.height || h.overflow || h.position) {
      b.overflow = ''; b.position = ''; b.width = ''; b.top = ''; b.height = '';
      h.overflow = ''; h.position = '';
    }
  }
  const releaseSoon = () => { setTimeout(releaseLock, 60); setTimeout(releaseLock, 420); };

  window.addEventListener('pageshow', () => releaseLock());
  window.addEventListener('popstate', releaseSoon);
  window.addEventListener('hashchange', releaseSoon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) releaseLock(); });
  document.addEventListener('touchstart', () => releaseLock(), { capture: true, passive: true });
  document.addEventListener('click', () => releaseSoon(), true);

  ['switchPage', 'closeSideDrawer', 'closeRankDrillDown', 'closeLbFullList', 'closeIccContextModal', 'closeQuickAbsentModal', 'closeRateChartModal', 'closeConfirmModal'].forEach((n) => {
    wrap(n, (orig) => function () {
      const res = orig.apply(this, arguments);
      releaseSoon();
      return res;
    });
  });

  /* --------------------------------------------- 3. drawer top bars (mobile) */
  const DRAWER_PAGES = [
    { id: 'page-leaderboard', title: 'Ranking', help: 'ranking' },
    { id: 'page-more', title: 'More' },
    { id: 'page-history', title: 'History' },
    { id: 'page-team', title: 'ERP Team' },
    { id: 'page-settings', title: 'Settings' },
    { id: 'page-notices', title: 'Notice Board' }
  ];
  function injectDrawerTopbars() {
    DRAWER_PAGES.forEach((dp) => {
      const pg = $(dp.id);
      if (!pg || pg.querySelector(':scope > .drawer-topbar')) return;
      const tb = document.createElement('div');
      tb.className = 'drawer-topbar';
      tb.innerHTML = '<button type="button" class="drawer-back-btn" onclick="closeSideDrawer()">‹ Back</button>' +
        `<span class="drawer-topbar-title">${esc(dp.title)}</span>`;
      if (dp.help) tb.appendChild(makeQ(dp.help, 'mgr-q-lg'));
      pg.insertBefore(tb, pg.firstChild);
    });
  }

  /* ----------------------------------------------------- 4. "?" info buttons */
  const INFO = {
    ot_missing: {
      title: 'OT Requisition (OT Missing)',
      html: `
        <p><b>What it means:</b> the person's <u>physical punches</u> show overtime-length duty, but <u>Empress shows 0 OT</u> for that day (no approved OT requisition).</p>
        <p><b>How it is detected</b> (day-by-day, only when recorded OT = 0 and both punches are valid):</p>
        <ul>
          <li><b>Evening 3h:</b> punch-out 19:10 – 20:15 → expected 3.0h OT (4:30 – 7:30 PM)</li>
          <li><b>Evening 5h:</b> punch-out 20:16 – 22:30 → expected 5.0h OT (4:30 – 9:30 PM)</li>
          <li><b>Morning:</b> punch-in by 07:15 and 9.5h+ on site → 1.0h OT (in by 06:30 → 2.5h)</li>
          <li><b>Night shift:</b> 11h+ with 0 OT → 4–7h OT expected</li>
        </ul>
        <p><i>Holiday / Thu-Fri problems now have their own list: see “Holiday Requisition”.</i></p>
        <p><b>Ranking:</b> highest number of flagged days first. Tap a name to see each date, in/out time and the expected OT, then use <i>Forward OT Requisitions to ERP</i>.</p>
        <p class="mgr-note">A flag means “please verify”, not a final verdict.</p>`
    },
    holiday_req: {
      title: 'Holiday Requisition',
      html: `
        <p><b>What it means:</b> the person <u>physically worked</u> on a holiday or weekly off day, but Empress booked the hours as <b>Regular duty</b> – so the <u>holiday allowance / Day-Off (DO) duty is missing</u>.</p>
        <p><b>The 2 rules:</b></p>
        <ul>
          <li><b>Govt / plant holiday:</b> worked on a Govt holiday, but hours went to Regular duty / OT instead of Holiday duty.</li>
          <li><b>Weekly off (Thu / Fri):</b> worked on Thursday or Friday, but hours went to Regular duty instead of Day-Off (DO) duty.</li>
        </ul>
        <p>Admin holiday settings are respected: a date the admin <b>cancelled</b> is treated as a normal working day (not flagged); a date the admin added counts as a holiday. A day is judged only after it closes (next day 09:00). If one date is flagged by several rules, only one list shows it (Night &gt; Holiday &gt; OT).</p>
        <p><b>Ranking:</b> highest number of flagged days first. Tap a name to see each date, in/out time and type (Govt holiday / Weekend DO), then use <i>Forward Holiday Requisitions to ERP</i>.</p>
        <p class="mgr-note">A flag means “please verify”, not a final verdict. Payroll numbers are not changed by this list.</p>`
    },
    night_issue: {
      title: 'Night Requisition (Night Issue)',
      html: `
        <p><b>What it means:</b> the shift is <b>DN</b> (or a night punch / very long duty is seen) but Empress <b>Night is not YES</b>.</p>
        <p>Night-duty staff must punch Out and In once between <b>09:30 – 10:15 PM</b>. If that punch exists but Night ≠ YES, the night-end Out punch is missing, the requisition is missing or Empress is not synced. It is judged only after the day closes (next day 09:00) and it is <u>never counted as a night</u> until ERP marks Night = YES.</p>
        <p><b>Ranking:</b> highest number of flagged days first. Tap a name to see each date, in/out time and the fix, then use <i>Forward Night Requisitions to ERP</i>.</p>
        <p class="mgr-note">A flag means “please verify”, not a final verdict. Payroll numbers are not changed by this list.</p>`
    },
    punch: {
      title: 'Punch Problem',
      html: `
        <p>A day is flagged when the <b>In</b> or <b>Out</b> punch is blank, “-”, NA / NULL, 00:00 or unreadable.</p>
        <ul>
          <li>These days cannot be counted for OT, 4:30 pm days or averages.</li>
          <li>Fix: the ERP team corrects the punch in Empress, then the next data upload clears the flag.</li>
        </ul>
        <p><b>Ranking:</b> most flagged days first.</p>`
    },
    absent: {
      title: 'Highest Absent',
      html: `
        <p>Counts <b>general working days</b> with no punch.</p>
        <ul>
          <li>Weekends / Day-Off, plant &amp; govt holidays, approved long leaves (e.g. maternity) and the rest day after a night shift are <b>not</b> counted.</li>
          <li>Days after the last uploaded date are not counted.</li>
        </ul>
        <p><b>Ranking:</b> most absent days first.</p>`
    },
    plain: {
      title: 'Top 4:30 pm Days',
      html: `<p>A <b>4:30 pm day</b> = duty &gt; 0, valid punches, <b>no OT</b> and not a night shift (a normal on-time day). Ranking shows who left on time most often.</p>`
    },
    ranking: {
      title: 'How Ranking Works',
      html: `
        <p>Only IDs listed in this department's section list are ranked.</p>
        <ul>
          <li><b>Best Duty / OT / Earning:</b> highest totals for the selected month or period.</li>
          <li><b>Less Duty / Less OT:</b> lowest totals (follow-up list).</li>
          <li><b>Punch Problem, OT Missing, Absent:</b> data-quality lists – tap the “?” beside each one for the exact rule.</li>
          <li><b>Avg Duty / Avg In:</b> manager analytics, per present day.</li>
        </ul>
        <p>Use the month strip for single months or “Last 3M / 6M / Year / All-Time” for totals.</p>`
    }
  };

  function ensureInfoOverlay() {
    let ov = $('mgrInfoOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'mgrInfoOverlay';
    ov.className = 'mgr-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="mgr-ov-card">' +
      '<div class="mgr-ov-head"><span id="mgrInfoTitle"></span><button type="button" class="mgr-ibtn" aria-label="Close" onclick="closeMgrInfoOverlay()">✕</button></div>' +
      '<div class="mgr-ov-body" id="mgrInfoBody"></div>' +
      '<button type="button" class="btn-primary mgr-ov-ok" onclick="closeMgrInfoOverlay()">Got it</button></div>';
    ov.addEventListener('click', (e) => { if (e.target === ov) closeMgrInfoOverlay(); });
    document.body.appendChild(ov);
    return ov;
  }
  window.openMgrInfo = function (type) {
    const d = INFO[type] || INFO.ranking;
    const ov = ensureInfoOverlay();
    $('mgrInfoTitle').textContent = d.title;
    $('mgrInfoBody').innerHTML = d.html;
    ov.classList.add('open');
  };
  window.closeMgrInfoOverlay = function () {
    const ov = $('mgrInfoOverlay');
    if (ov) ov.classList.remove('open');
    releaseSoon();
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.closeMgrInfoOverlay(); });

  function makeQ(type, extra) {
    const q = document.createElement('span');
    q.className = 'mgr-q' + (extra ? ' ' + extra : '');
    q.textContent = '?';
    q.dataset.mgrq = type;
    q.setAttribute('role', 'button');
    q.setAttribute('tabindex', '0');
    q.setAttribute('aria-label', 'Explain: ' + (INFO[type] ? INFO[type].title : type));
    q.setAttribute('data-html2canvas-ignore', 'true');
    const open = (e) => { e.stopPropagation(); e.preventDefault(); window.openMgrInfo(type); };
    q.addEventListener('click', open);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
    return q;
  }

  function critToInfo(c) {
    return c === 'requisition' ? 'ot_missing' : c === 'nightIssue' ? 'night_issue' : c === 'holidayReq' ? 'holiday_req' : c === 'punch' ? 'punch' : c === 'absent' ? 'absent' : c === 'plain' ? 'plain' : 'ranking';
  }

  function injectInfoBadges() {
    // Rank hub tiles
    document.querySelectorAll('.rank-hub-item .rank-hub-title').forEach((t) => {
      if (t.querySelector('.mgr-q')) return;
      const x = t.textContent.trim().toLowerCase();
      const type = x.includes('punch') ? 'punch' : x.includes('night req') ? 'night_issue' : x.includes('holiday req') ? 'holiday_req' : x.includes('requisition') ? 'ot_missing' : x.includes('absent') ? 'absent' : x.includes('4:30') ? 'plain' : '';
      if (type) t.appendChild(makeQ(type));
    });
    // Report label
    const s7 = $('step7LabelText');
    if (s7 && !s7.querySelector('.mgr-q')) s7.appendChild(makeQ('ot_missing'));
    // Rank drill top bar: one "?" that follows the active criterion
    const bar = document.querySelector('#iccRankDrillView .icc-topbar');
    if (bar) {
      let q = bar.querySelector('.mgr-q-drill');
      let crit = 'duty';
      try { crit = (typeof activeIccCriterion !== 'undefined' && activeIccCriterion) || 'duty'; } catch (e) { /* ignore */ }
      const type = critToInfo(crit);
      if (!q) {
        q = makeQ(type, 'mgr-q-drill mgr-q-lg');
        const title = bar.querySelector('.icc-topbar-title');
        if (title && title.nextSibling) bar.insertBefore(q, title.nextSibling); else bar.appendChild(q);
      }
      if (q.dataset.mgrq !== type) {
        const n = makeQ(type, 'mgr-q-drill mgr-q-lg');
        q.replaceWith(n);
      }
    }
    decorateReportChips();
  }

  function decorateReportChips() {
    const host = $('rptPreviewHost');
    if (!host) return;
    host.querySelectorAll('span').forEach((sp) => {
      if (sp.dataset.mgrqDone || sp.children.length) return;
      const t = sp.textContent.trim();
      const type = /^Req (Missing|Problem)/.test(t) ? 'ot_missing' : /^Punch (Fix|Problem|Missing)/.test(t) ? 'punch' : /^General Absent/.test(t) ? 'absent' : '';
      if (type) { sp.dataset.mgrqDone = '1'; sp.appendChild(makeQ(type)); }
    });
  }
  const decorateReportChipsSoon = debounce(decorateReportChips, 120);

  /* ------------------------------------------------ 5. compact manager overview */
  const OV_TABS = [
    { k: 'summary', t: 'Summary', sel: ['.inc-ov-hero', '#incActionCenter', '#incHomeHistoryCard'] },
    { k: 'absent', t: 'Absent', sel: ['#incHomeAbsentCard'], badge: 'incAbsentCountBadge' },
    { k: 'leaves', t: 'Leaves', sel: ['#incHomeLeavesCard'], badge: 'incLeavesCountBadge' },
    { k: 'toppers', t: 'Toppers', sel: ['#incHomeToppersCard'] },
    { k: 'risk', t: 'Risk', sel: ['#incHomeWatchlistCard'] }
  ];
  function setupOverview() {
    const ov = $('inchargeHomeOverview');
    if (!ov || ov.__mgrTabs) return;
    ov.__mgrTabs = true;
    OV_TABS.forEach((tab) => tab.sel.forEach((s) => { const el = ov.querySelector(s); if (el) el.setAttribute('data-ov-panel', tab.k); }));
    const bar = document.createElement('div');
    bar.id = 'mgrOvTabs';
    bar.className = 'mgr-ov-tabs';
    bar.setAttribute('role', 'tablist');
    bar.innerHTML = OV_TABS.map((t) => `<button type="button" role="tab" class="mgr-ov-tab" data-ovtab="${t.k}">${t.t}${t.badge ? `<span class="mgr-ov-cnt" data-ovcnt="${t.k}"></span>` : ''}</button>`).join('');
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ovtab]');
      if (b) setOvTab(b.dataset.ovtab);
    });
    ov.insertBefore(bar, ov.firstChild);
    const saved = lsGet('mgr_ov_tab', 'summary');
    setOvTab(OV_TABS.some((t) => t.k === saved) ? saved : 'summary', true);
    // banner on the absent tab: tap to expand
    const ban = ov.querySelector('.inc-absent-exemption-banner');
    if (ban) ban.addEventListener('click', () => ban.classList.toggle('open'));
  }
  function setOvTab(k, silent) {
    const ov = $('inchargeHomeOverview');
    if (!ov) return;
    ov.setAttribute('data-tab', k);
    document.querySelectorAll('#mgrOvTabs .mgr-ov-tab').forEach((b) => {
      const on = b.dataset.ovtab === k;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (!silent) lsSet('mgr_ov_tab', k);
  }
  function updateOvCounts() {
    OV_TABS.forEach((t) => {
      if (!t.badge) return;
      const src = $(t.badge), dst = document.querySelector(`[data-ovcnt="${t.k}"]`);
      if (!src || !dst) return;
      const m = String(src.textContent).match(/\d+/);
      const v = m ? m[0] : '';
      if (dst.textContent !== v) dst.textContent = v;
      dst.style.display = v && v !== '0' ? '' : 'none';
    });
  }

  /* ------------------------------------------------ 6. REPORT: loading / no data */
  let rptSeq = 0;
  function ensureStateCard() {
    let card = $('rptStateCard');
    if (card) return card;
    const page = $('page-report');
    if (!page) return null;
    card = document.createElement('div');
    card.id = 'rptStateCard';
    card.className = 'rpt-state-card';
    card.style.display = 'none';
    const anchor = $('step7');
    if (anchor) page.insertBefore(card, anchor); else page.appendChild(card);
    return card;
  }
  wrap('findReport', (orig) => async function () {
    const seq = ++rptSeq;
    const card = ensureStateCard();
    const month = curMonth();
    if (card) {
      card.className = 'rpt-state-card';
      card.innerHTML = `<div class="rpt-state-spinner"></div><div class="rpt-state-msg">Loading ${esc(monLabel(month))}…</div><div class="rpt-state-sub">Checking punches &amp; OT data</div>`;
      card.style.display = 'block';
    }
    setBusy(true);
    try {
      return await orig.apply(this, arguments);
    } finally {
      setBusy(false);
      if (seq === rptSeq && card) {
        let ok = false;
        try { ok = !!currentResult; } catch (e) { /* ignore */ }
        if (ok) {
          card.style.display = 'none';
        } else {
          const st = $('status');
          let msg = st && st.innerText ? st.innerText.trim().split('\n')[0] : '';
          if (/verifying data/i.test(msg) || /calculation ready/i.test(msg)) msg = '';
          card.className = 'rpt-state-card is-empty';
          card.innerHTML = `<div class="rpt-state-icon">📭</div><div class="rpt-state-msg">No data available for ${esc(monLabel(month))}</div>` +
            `<div class="rpt-state-sub">${esc(msg || 'This employee has no record in this month, or the month has not been uploaded yet.')}</div>` +
            '<div class="rpt-state-nav"><button type="button" class="month-nav-btn" onclick="navigateReportMonth(-1)">‹ Prev month</button>' +
            '<button type="button" class="month-nav-btn" onclick="navigateReportMonth(1)">Next month ›</button></div>' +
            (isInc() ? '<button type="button" class="btn-secondary rpt-state-find" onclick="mgrRfOpen()">Choose another employee</button>' : '');
          card.style.display = 'block';
        }
      }
      syncFinderMonth();
    }
  });

  /* ------------------------------------------------ 6b. REPORT: manager finder */
  const RF = { month: '', area: '', issue: 'all', q: '', sort: 'name', list: null, shown: 40, seq: 0, collapsed: false, loading: false };
  const knownEmpty = new Set();
  const deptNow = () => { try { return getClientDepartment(); } catch (e) { return 'PR'; } };
  const getAreas = () => [['', 'All']].concat(getSectionsForDept(deptNow()).filter((x) => isAreaVisibleToViewer(x.area, deptNow())).map((x) => [x.area, x.short]));
  const ISSUES = [['all', 'All'], ['punch', 'Punch'], ['req', 'OT Missing'], ['absent', 'Absent']];

  function monthChoices() {
    const set = new Set();
    try { if (Array.isArray(availableServerMonths)) availableServerMonths.forEach((m) => set.add(m)); } catch (e) { /* ignore */ }
    try { getPreviousMonthStrings(curMonth() || ymNow(), 14).forEach((m) => set.add(m)); } catch (e) { /* ignore */ }
    if (curMonth()) set.add(curMonth());
    return [...set].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
  }

  function ensureFinder() {
    let f = $('mgrRf');
    if (f) return f;
    const page = $('page-report');
    if (!page) return null;
    f = document.createElement('section');
    f.id = 'mgrRf';
    f.className = 'mgr-rf';
    f.innerHTML = `
      <button type="button" class="mgr-rf-head" id="mgrRfHead" aria-expanded="true">
        <span class="mgr-rf-title">Find employee report<small id="mgrRfSummary"></small></span>
        <span class="mgr-rf-caret">▾</span>
      </button>
      <div class="mgr-rf-body" id="mgrRfBody">
        <div class="mgr-rf-monthrow">
          <button type="button" class="mgr-ibtn" data-rf="prev" aria-label="Previous month">‹</button>
          <select id="mgrRfMonth" aria-label="Month"></select>
          <button type="button" class="mgr-ibtn" data-rf="next" aria-label="Next month">›</button>
        </div>
        <div class="mgr-chips" id="mgrRfArea" role="group" aria-label="Section"></div>
        <div class="mgr-chips" id="mgrRfIssue" role="group" aria-label="Issue filter"></div>
        <div class="mgr-rf-searchrow">
          <input type="text" id="mgrRfSearch" placeholder="Search name or ID…" autocomplete="off" autocapitalize="characters" enterkeyhint="search">
          <select id="mgrRfSort" aria-label="Sort">
            <option value="name">A–Z</option><option value="duty">Duty ↓</option><option value="ot">OT ↓</option><option value="issues">Issues ↓</option>
          </select>
        </div>
        <div class="mgr-rf-status" id="mgrRfStatus"></div>
        <div class="mgr-rf-list" id="mgrRfList"></div>
      </div>`;
    const anchor = $('reportEmpStrip');
    if (anchor) page.insertBefore(f, anchor); else page.appendChild(f);

    $('mgrRfArea').innerHTML = getAreas().map((a) => `<button type="button" class="mgr-chip" data-area="${esc(a[0])}">${a[1]}</button>`).join('');
    $('mgrRfIssue').innerHTML = ISSUES.map((a) => `<button type="button" class="mgr-chip" data-issue="${a[0]}">${a[1]}${a[0] === 'req' ? '<span class="mgr-q" data-q="ot_missing" role="button" tabindex="0" aria-label="Explain OT Missing">?</span>' : a[0] === 'punch' ? '<span class="mgr-q" data-q="punch" role="button" tabindex="0" aria-label="Explain punch problem">?</span>' : ''}</button>`).join('');

    $('mgrRfHead').addEventListener('click', () => { RF.collapsed = !RF.collapsed; applyCollapse(); });
    f.addEventListener('click', (e) => {
      const q = e.target.closest('.mgr-q[data-q]');
      if (q) { e.stopPropagation(); e.preventDefault(); window.openMgrInfo(q.dataset.q); return; }
      const nav = e.target.closest('[data-rf]');
      if (nav) { stepMonth(nav.dataset.rf === 'next' ? 1 : -1); return; }
      const ar = e.target.closest('[data-area]');
      if (ar) { RF.area = ar.dataset.area; RF.shown = 40; renderFinder(); return; }
      const is = e.target.closest('[data-issue]');
      if (is) { RF.issue = is.dataset.issue; RF.shown = 40; renderFinder(); return; }
      const more = e.target.closest('[data-more]');
      if (more) { RF.shown += 40; renderFinder(); return; }
      const idBtn = e.target.closest('[data-id]');
      if (idBtn) { pickEmployee(idBtn.dataset.id); }
    });
    $('mgrRfMonth').addEventListener('change', (e) => setFinderMonth(e.target.value));
    $('mgrRfSort').addEventListener('change', (e) => { RF.sort = e.target.value; renderFinder(); });
    $('mgrRfSearch').addEventListener('input', debounce((e) => { RF.q = e.target.value; RF.shown = 40; renderFinder(); }, 120));
    $('mgrRfSearch').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = e.target.value.trim().toUpperCase().replace(/\s+/g, '');
      if (!q) return;
      const rows = filteredFinderList();
      const exact = rows.find((x) => String(x.id).toUpperCase() === q);
      pickEmployee(exact ? exact.id : (rows.length === 1 ? rows[0].id : q));
    });
    return f;
  }

  function applyCollapse() {
    const f = $('mgrRf');
    if (!f) return;
    f.classList.toggle('collapsed', RF.collapsed);
    const h = $('mgrRfHead');
    if (h) h.setAttribute('aria-expanded', RF.collapsed ? 'false' : 'true');
  }
  window.mgrRfOpen = function () {
    ensureFinder();
    RF.collapsed = false;
    applyCollapse();
    const f = $('mgrRf');
    if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function stepMonth(d) {
    const list = monthChoices().slice().reverse(); // ascending
    let i = list.indexOf(RF.month);
    if (i < 0) i = list.length - 1;
    const n = list[i + d];
    if (n) setFinderMonth(n);
  }
  function setFinderMonth(m) {
    if (!m || m === RF.month) { renderFinder(); return; }
    RF.month = m;
    RF.list = null;
    RF.shown = 40;
    renderFinder();
    loadFinderList();
  }
  function syncFinderMonth() {
    if (!$('mgrRf')) return;
    const m = curMonth();
    if (m && m !== RF.month) setFinderMonth(m);
  }

  async function loadFinderList() {
    const seq = ++RF.seq;
    const month = RF.month;
    RF.loading = true;
    renderFinder();
    setBusy(true);
    let list = null;
    try {
      if (typeof loadAreaMap === 'function') await loadAreaMap();
      try { list = monthIndexMemoryCache[month]; } catch (e) { list = null; }
      if (!Array.isArray(list) || !list.length) list = await fetchMonthPreIndexedData(month, false, true);
    } catch (e) {
      list = [];
    } finally {
      setBusy(false);
    }
    if (seq !== RF.seq) return;
    RF.loading = false;
    RF.list = decorateFinderList(Array.isArray(list) ? list : [], month);
    if (!RF.list.length) knownEmpty.add(month); else knownEmpty.delete(month);
    renderFinder();
  }

  function decorateFinderList(list, month) {
    const out = [];
    list.forEach((e) => {
      if (!e || !e.id) return;
      try { if (!isRankableEmployee(e)) return; } catch (x) { /* ignore */ }
      let area = e.area || '';
      try { area = getAreaForId(e.id, true) || area; } catch (x) { /* ignore */ }
      let pp = 0, rq = 0, ab = 0;
      try { pp = getPunchProblemCount(e); } catch (x) { /* ignore */ }
      try { rq = (typeof getRequisitionProblemCount === 'function' && getRequisitionProblemCount(e)) || computeEmpRequisitionProblems(e).length; } catch (x) { /* ignore */ }
      try { ab = typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e, month) : (typeof computeEmpGeneralAbsents === 'function' ? computeEmpGeneralAbsents(e, month).count : (num(e.generalAbsentCount) || 0)); } catch (x) { ab = (num(e.generalAbsentCount) || 0); }
      out.push({ id: String(e.id), name: e.name || e.id, area: area, grade: e.grade || e.designation || '', kind: e.kind || '', duty: num(e.totalDuty), ot: num(e.otHours), pp: num(pp), rq: num(rq), ab: num(ab) });
    });
    return out;
  }

  function filteredFinderList() {
    if (!Array.isArray(RF.list)) return [];
    const q = RF.q.trim().toLowerCase();
    let rows = RF.list.filter((e) => {
      if (RF.area) {
        const exA = getExecAreaForDept(deptNow());
        if (RF.area === exA) { if (e.area !== exA && e.kind !== 'EXEC') return false; } else if (e.area !== RF.area) return false;
      }
      if (RF.issue === 'punch' && !(e.pp > 0)) return false;
      if (RF.issue === 'req' && !(e.rq > 0)) return false;
      if (RF.issue === 'absent' && !(e.ab > 0)) return false;
      if (q && !(`${e.id} ${e.name}`.toLowerCase().includes(q))) return false;
      return true;
    });
    const by = RF.sort;
    rows = rows.slice().sort((a, b) => {
      if (by === 'duty') return b.duty - a.duty;
      if (by === 'ot') return b.ot - a.ot;
      if (by === 'issues') return (b.pp + b.rq + b.ab) - (a.pp + a.rq + a.ab) || String(a.name).localeCompare(String(b.name));
      return String(a.name).localeCompare(String(b.name));
    });
    return rows;
  }

  function initials(n) { const p = String(n || '?').trim().split(/\s+/).filter((x) => !/^(md\.?|mst\.?|mr\.?|mrs\.?)$/i.test(x)); return ((p[0] || '?')[0] + ((p[1] || '')[0] || '')).toUpperCase(); }

  function renderFinder() {
    const f = ensureFinder();
    if (!f) return;
    // month select
    const sel = $('mgrRfMonth');
    const ms = monthChoices();
    if (RF.month && !ms.includes(RF.month)) ms.unshift(RF.month);
    const html = ms.map((m) => `<option value="${m}"${m === RF.month ? ' selected' : ''}>${monLabel(m)}${knownEmpty.has(m) ? ' · no data' : ''}</option>`).join('');
    if (sel.__html !== html) { sel.innerHTML = html; sel.__html = html; }
    sel.value = RF.month;
    $('mgrRfArea').querySelectorAll('[data-area]').forEach((b) => b.classList.toggle('active', b.dataset.area === RF.area));
    $('mgrRfIssue').querySelectorAll('[data-issue]').forEach((b) => b.classList.toggle('active', b.dataset.issue === RF.issue));
    if ($('mgrRfSort').value !== RF.sort) $('mgrRfSort').value = RF.sort;

    const status = $('mgrRfStatus'), list = $('mgrRfList');
    const areaName = (getAreas().find((a) => a[0] === RF.area) || ['', 'All'])[1];
    if (RF.loading || RF.list === null) {
      status.innerHTML = `<span class="mgr-spin"></span> Loading ${esc(monLabel(RF.month))}…`;
      list.innerHTML = '<div class="mgr-skel"></div><div class="mgr-skel"></div><div class="mgr-skel"></div>';
      $('mgrRfSummary').textContent = `${monLabel(RF.month)} · loading`;
      return;
    }
    if (!RF.list.length) {
      status.innerHTML = '';
      list.innerHTML = `<div class="mgr-empty"><div class="mgr-empty-ic">📭</div><b>No data available for ${esc(monLabel(RF.month))}</b><span>This month has not been uploaded yet. Try the previous month.</span></div>`;
      $('mgrRfSummary').textContent = `${monLabel(RF.month)} · no data`;
      return;
    }
    const rows = filteredFinderList();
    status.textContent = `${rows.length} employee${rows.length === 1 ? '' : 's'}${RF.issue !== 'all' || RF.area || RF.q ? ' match' : ''}`;
    $('mgrRfSummary').textContent = `${monLabel(RF.month)} · ${areaName} · ${rows.length}`;
    if (!rows.length) {
      const typed = RF.q.trim().toUpperCase().replace(/\s+/g, '');
      list.innerHTML = '<div class="mgr-empty"><b>No matching employee</b><span>Change the filters or search text.</span></div>' +
        (typed ? `<button type="button" class="mgr-rf-item" data-id="${esc(typed)}"><span class="mgr-av">ID</span><span class="mgr-rf-info"><b>Open report for “${esc(typed)}”</b><small>Try this ID directly</small></span><span class="mgr-rf-go">›</span></button>` : '');
      return;
    }
    const part = rows.slice(0, RF.shown);
    list.innerHTML = part.map((e) => {
      const badges = "";
      return `<button type="button" class="mgr-rf-item" data-id="${esc(e.id)}"><span class="mgr-av">${esc(initials(e.name))}</span>` +
        `<span class="mgr-rf-info"><b>${esc(e.name)}</b><small>${esc(e.id)} · ${esc(areaShort(e.area))}${e.grade ? ' · ' + esc(e.grade) : ''}</small></span>` +
        `<span class="mgr-rf-meta"><span class="mgr-rf-nums">${r2(e.duty)}h<small>${r2(e.ot)}h OT</small></span></span></button>`;
    }).join('') + (rows.length > part.length ? `<button type="button" class="mgr-more" data-more="1">Show ${Math.min(40, rows.length - part.length)} more (${rows.length - part.length} left)</button>` : '');
  }
  function areaShort(a) { return a === 'Packing Hall' ? 'Packing' : a === 'Solid Production' ? 'Solid' : a === 'Softgel Production' ? 'Softgel' : a === 'Overall' ? 'Exec' : (a || 'RPPF'); }

  function pickEmployee(id) {
    id = String(id || '').toUpperCase().replace(/\s+/g, '');
    if (!id) return;
    const parts = String(RF.month || curMonth()).split('-');
    if (parts.length === 2) {
      const ySel = $('yearSelect'), mSel = $('monthSelect');
      if (ySel) {
        if (![...ySel.options].some((o) => o.value === parts[0])) { const o = document.createElement('option'); o.value = parts[0]; o.textContent = parts[0]; ySel.appendChild(o); }
        ySel.value = parts[0];
      }
      if (mSel) mSel.value = parts[1];
    }
    const a = $('employeeId'), b = $('reportQuickIdInput');
    if (a) a.value = id;
    if (b) b.value = id;
    try { toggleClearIdBtn(); } catch (e) { /* ignore */ }
    RF.collapsed = true;
    applyCollapse();
    if (typeof searchFromReportPage === 'function') searchFromReportPage(); else if (typeof findReport === 'function') findReport();
  }

  function onReportShown() {
    if (!isInc()) return;
    const f = ensureFinder();
    if (!f) return;
    const m = curMonth() || ymNow();
    if (RF.list === null || !RF.month) { RF.month = m; loadFinderList(); }
    let has = false;
    try { has = !!currentResult; } catch (e) { /* ignore */ }
    if (has && !RF.__seenResult) { RF.collapsed = true; }
    RF.__seenResult = has;
    applyCollapse();
    renderFinder();
    // "Change ID" opens the finder (manager) instead of jumping to Home
    const btn = document.querySelector('#reportEmpStrip .calc-mini-btn');
    if (btn && !btn.__mgrBound) {
      btn.__mgrBound = true;
      const old = btn.onclick;
      btn.onclick = function (ev) {
        if (isInc()) { window.mgrRfOpen(); return false; }
        return old ? old.call(this, ev) : undefined;
      };
    }
  }
  wrap('initReportPage', (orig) => function () {
    const r = orig.apply(this, arguments);
    try { onReportShown(); } catch (e) { console.error(e); }
    return r;
  });
  wrap('navigateReportMonth', (orig) => function () {
    const r = orig.apply(this, arguments);
    setTimeout(syncFinderMonth, 60);
    return r;
  });

  /* ---------------------------------------------------------- 7. VS MODE */
  const SUM_KEYS = ['totalDuty', 'otHours', 'holidayCount', 'nightCount', 'plainDaysCount', 'otDaysCount'];

  function vsMonthChoices() {
    const set = new Set(monthChoices());
    const sel = $('vsMonthOverrideSelect');
    if (sel) [...sel.options].forEach((o) => set.add(o.value));
    return [...set].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
  }

  function ensureVsUi() {
    const p = $('vsPeriodSelect');
    if (!p) return;
    const add = (v, t) => { if (![...p.options].some((o) => o.value === v)) { const o = document.createElement('option'); o.value = v; o.textContent = t; p.appendChild(o); } };
    add('multi', 'Pick months (multi-select)');
    add('dates', 'Custom date range');
    p.setAttribute('aria-label', 'Comparison period');
    let ex = $('vsExtraPeriod');
    if (!ex) {
      ex = document.createElement('div');
      ex.id = 'vsExtraPeriod';
      ex.className = 'mgr-vs-extra';
      ex.style.display = 'none';
      const row = p.closest('.vs-bar-row') || p.parentNode;
      row.parentNode.insertBefore(ex, row.nextSibling);
      ex.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-vsm]');
        if (chip) { chip.classList.toggle('active'); updateVsHint(); return; }
        const all = e.target.closest('[data-vsall]');
        if (all) { const on = all.dataset.vsall === '1'; ex.querySelectorAll('[data-vsm]').forEach((c) => c.classList.toggle('active', on)); updateVsHint(); return; }
        const pre = e.target.closest('[data-vspre]');
        if (pre) applyDatePreset(pre.dataset.vspre);
      });
      ex.addEventListener('change', (e) => { if (e.target.matches('input[type=date]')) updateVsHint(); });
    }
  }

  const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  function monthBounds(ym) {
    const [y, m] = ym.split('-').map(Number);
    return { first: new Date(y, m - 1, 1), last: new Date(y, m, 0) };
  }
  function applyDatePreset(p) {
    const f = $('vsDateFrom'), t = $('vsDateTo');
    if (!f || !t) return;
    const today = new Date();
    let from, to;
    if (p === '7' || p === '15') { to = today; from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (Number(p) - 1)); }
    else if (p === 'month') { const b = monthBounds(ymNow()); from = b.first; to = today < b.last ? today : b.last; }
    else { const d = new Date(today.getFullYear(), today.getMonth() - 1, 1); const b = monthBounds(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`); from = b.first; to = b.last; }
    f.value = iso(from); t.value = iso(to);
    updateVsHint();
  }

  window.onVsPeriodChange = function () {
    ensureVsUi();
    const p = $('vsPeriodSelect'), ex = $('vsExtraPeriod'), msel = $('vsMonthOverrideSelect');
    if (!p || !ex) return;
    const v = p.value;
    if (msel) msel.style.display = (v === 'multi' || v === 'dates') ? 'none' : '';
    if (v === 'multi') {
      const base = (msel && msel.value) || curMonth();
      ex.style.display = 'block';
      ex.innerHTML = '<div class="mgr-vs-note">Tap the months to include — totals are added together.</div>' +
        '<div class="mgr-chips mgr-wrap" id="vsMultiChips">' + vsMonthChoices().map((m) => `<button type="button" class="mgr-chip${m === base ? ' active' : ''}" data-vsm="${m}">${monLabel(m)}</button>`).join('') + '</div>' +
        '<div class="mgr-vs-tools"><button type="button" class="calc-mini-btn" data-vsall="1">Select all</button><button type="button" class="calc-mini-btn" data-vsall="0">Clear</button><span class="mgr-vs-hint" id="vsHint"></span></div>';
    } else if (v === 'dates') {
      ex.style.display = 'block';
      ex.innerHTML = '<div class="mgr-vs-dates"><label>From<input type="date" id="vsDateFrom"></label><label>To<input type="date" id="vsDateTo"></label></div>' +
        '<div class="mgr-chips"><button type="button" class="mgr-chip" data-vspre="7">Last 7 days</button><button type="button" class="mgr-chip" data-vspre="15">Last 15 days</button><button type="button" class="mgr-chip" data-vspre="month">This month</button><button type="button" class="mgr-chip" data-vspre="last">Last month</button></div>' +
        '<div class="mgr-vs-note" id="vsHint">Day-wise totals from daily punch logs (max 366 days).</div>';
      const base = (msel && msel.value) || curMonth() || ymNow();
      const b = monthBounds(base), today = new Date();
      $('vsDateFrom').value = iso(b.first);
      $('vsDateTo').value = iso(b.last > today ? today : b.last);
      updateVsHint();
    } else {
      ex.style.display = 'none';
      ex.innerHTML = '';
    }
    updateVsHint();
    try { onVsMonthOverrideChange(); } catch (e) { /* ignore */ }
  };

  const dayKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  function parseRowDate(s) {
    const m = String(s || '').trim().toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/);
    if (!m) return null;
    const mi = MON_UP.indexOf(m[2]);
    return mi < 0 ? null : (+m[3]) * 10000 + (mi + 1) * 100 + (+m[1]);
  }

  function getVsPeriod() {
    const type = ($('vsPeriodSelect') && $('vsPeriodSelect').value) || 'current';
    let base = ($('vsMonthOverrideSelect') && $('vsMonthOverrideSelect').value) || curMonth() || ymNow() || "2026-11";
    if (!/^\d{4}-\d{2}$/.test(base)) base = curMonth() || "2026-11";
    if (type === 'ytd' || type === 'alltime') {
      const latest = (Array.isArray(window.availableServerMonths) && window.availableServerMonths.length)
        ? window.availableServerMonths.slice().sort().reverse()[0]
        : (curMonth() || ymNow());
      if (latest) base = latest;
    }
    const prev = (n) => { try { return getPreviousMonthStrings(base, n).slice().reverse(); } catch (e) { return [base]; } };
    let months = [base], from = null, to = null, label = monLabel(base), error = '';
    if (type === '3m') months = prev(3);
    else if (type === '6m') months = prev(6);
    else if (type === '1y') months = prev(12);
    else if (type === 'ytd') { try { months = getYearToDateMonths(base); } catch (e) { months = [base]; } }
    else if (type === 'alltime') { try { months = getAllTime2026Months(base); } catch (e) { months = [base]; } }
    else if (type === 'multi') {
      months = [...document.querySelectorAll('#vsMultiChips [data-vsm].active')].map((c) => c.dataset.vsm);
      if (!months.length) error = 'Select at least one month.';
    } else if (type === 'dates') {
      const f = $('vsDateFrom') && $('vsDateFrom').value, t = $('vsDateTo') && $('vsDateTo').value;
      if (!f || !t) error = 'Choose both From and To dates.';
      else {
        const fd = new Date(f + 'T00:00:00'), td = new Date(t + 'T00:00:00');
        if (fd > td) error = '“From” date must be before “To” date.';
        else if ((td - fd) / 86400000 > 366) error = 'Date range is limited to 366 days.';
        else {
          from = dayKey(fd); to = dayKey(td);
          months = [];
          const c = new Date(fd.getFullYear(), fd.getMonth(), 1);
          while (c <= td) { months.push(`${c.getFullYear()}-${pad2(c.getMonth() + 1)}`); c.setMonth(c.getMonth() + 1); }
        }
      }
    }
    months = [...new Set(months)].sort();
    if (type === 'dates' && from) {
      const fmt = (k) => `${pad2(k % 100)} ${MON[Math.floor(k / 100) % 100 - 1]} ${Math.floor(k / 10000)}`;
      label = `${fmt(from)} – ${fmt(to)}`;
    } else if (months.length > 1) {
      const contiguous = months.every((m, i) => i === 0 || monthIndex(m) - monthIndex(months[i - 1]) === 1);
      label = contiguous ? `${monLabel(months[0])} – ${monLabel(months[months.length - 1])} (${months.length} months)` : months.map(monLabel).join(', ');
    } else if (months.length === 1) label = monLabel(months[0]);
    return { type, months, from, to, label, error };
  }
  const monthIndex = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + m; };

  function updateVsHint() {
    const h = $('vsHint');
    if (!h) return;
    const p = getVsPeriod();
    if (p.error) h.textContent = p.error;
    else if (p.type === 'multi') h.textContent = `${p.months.length} month${p.months.length === 1 ? '' : 's'} selected`;
    else if (p.type === 'dates') h.textContent = `${p.label} · ${Math.round((new Date(String($('vsDateTo').value) + 'T00:00:00') - new Date(String($('vsDateFrom').value) + 'T00:00:00')) / 86400000) + 1} days`;
  }

  /** Day-wise aggregate of one employee-month between from/to (inclusive) */
  function aggregateDays(emp, from, to) {
    const out = { totalDuty: 0, otHours: 0, holidayCount: 0, nightCount: 0, plainDaysCount: 0, otDaysCount: 0 };
    const daily = Array.isArray(emp.daily) ? emp.daily : [];
    daily.forEach((r) => {
      if (!Array.isArray(r)) return;
      const k = parseRowDate(r[0]);
      if (k == null || k < from || k > to) return;
      const regD = num(r[4]), regO = num(r[5]), doD = num(r[6]), doO = num(r[7]), holD = num(r[8]), holO = num(r[9]);
      const ot = regO + doO + holO;
      const isNight = num(r[10]) === 1 || /NIGHT/i.test(String(r[11] || ''));
      out.totalDuty += regD + regO + doD + doO + holD + holO;
      out.otHours += ot;
      if (doD > 0 || doO > 0 || holD > 0 || holO > 0) out.holidayCount += 1;
      if (isNight) out.nightCount += 1;
      if (ot > 0 && !isNight) out.otDaysCount += 1;
      let missing = false;
      try { missing = isPunchMissing(r[2]) || isPunchMissing(r[3]); } catch (e) { missing = !r[2] || !r[3]; }
      if (!missing && (regD + doD + holD) > 0 && !isNight && ot === 0) out.plainDaysCount += 1;
    });
    out.totalDuty = r2(out.totalDuty);
    out.otHours = r2(out.otHours);
    return out;
  }

  /** Absent days of one employee-month that fall inside [from,to] (date-range VS) */
  function absentInRange(emp, m, from, to) {
    try {
      const uid = String(emp.id || '').trim().toUpperCase();
      let prevHas = false;
      try { const ps = getPrevMonthNightSet(m); prevHas = ps.has(uid) || ps.has(String(resolveEmpAliasId(uid) || '').toUpperCase()); } catch (e) { /* ignore */ }
      const res = computeEmpGeneralAbsents(emp, m, prevHas);
      const y = parseInt(String(m).split('-')[0], 10), mo = parseInt(String(m).split('-')[1], 10);
      let n = 0;
      (res.shortDates || []).forEach((sd) => {
        const dd = parseInt(String(sd).split('-')[0], 10);
        if (!dd) return;
        const k = y * 10000 + mo * 100 + dd;
        if (k >= from && k <= to) n++;
      });
      return n;
    } catch (e) { return 0; }
  }

  async function loadMonthList(m) {
    let list = null;
    try { list = monthIndexMemoryCache[m]; } catch (e) { list = null; }
    if (!Array.isArray(list) || !list.length) {
      try { list = await fetchMonthPreIndexedData(m, false, false); } catch (e) { list = null; }
    }
    return Array.isArray(list) ? list : [];
  }

  function findEmp(list, id) {
    let alias = '';
    try { alias = String(resolveEmpAliasId(id) || '').toUpperCase(); } catch (e) { /* ignore */ }
    return list.find((e) => { const u = String(e && e.id || '').toUpperCase(); return u === id || (alias && u === alias); }) || null;
  }

  function collectVsIds() {
    let mode = 2;
    try { mode = currentVsMode; } catch (e) { /* ignore */ }
    const id1 = ($("compareId1")?.value || "").trim().toUpperCase().replace(/\s+/g, "");
    const id2 = ($("compareId")?.value || "").trim().toUpperCase().replace(/\s+/g, "");
    let ids = [id1, id2];
    if (mode === 3 || mode === "custom") {
      const id3 = ($("compareId3")?.value || "").trim().toUpperCase().replace(/\s+/g, "");
      if (id3) ids.push(id3);
    }
    if (mode === "custom") {
      const extra = [...document.querySelectorAll("#vsExtraSlotsContainer input.vs-emp-id-input")]
        .map((el) => el.value.trim().toUpperCase().replace(/\s+/g, ""))
        .filter(Boolean);
      ids.push(...extra);
    }
    return ids;
  }

  window.runComparison = async function (customIdsList, customHeaderNote) {
    const statusDiv = $('compareStatus'), btn = $('compareBtn');
    const setStatus = (msg, bad) => { if (statusDiv) { statusDiv.style.color = bad ? 'var(--danger)' : 'var(--primary-blue)'; statusDiv.innerText = msg || ''; } };
    
    // Ensure area map is loaded upfront so section checks have actual data
    if (typeof loadAreaMap === "function") {
      try { await loadAreaMap(); } catch (e) { /* ignore */ }
    }

    let ids = [];
    if (Array.isArray(customIdsList) && customIdsList.length >= 2) {
      ids = customIdsList.map(x => String(x || '').trim().toUpperCase().replace(/\s+/g, '')).filter(Boolean);
    } else {
      const inp1 = $('compareId1');
      if (inp1 && !inp1.value.trim()) {
        let pref = '';
        try { pref = currentSearchId || getPreferredId() || ''; } catch (e) { /* ignore */ }
        if (pref) inp1.value = pref;
      }
      ids = collectVsIds();
      const filled = ids.filter(Boolean);
      if (!ids[0]) { toast('Enter the 1st employee ID', 'warn'); inp1 && inp1.focus(); return; }
      if (!ids[1]) { toast('Enter the 2nd employee ID', 'warn'); const i2 = $('compareId'); i2 && i2.focus(); return; }
      ids = filled;
    }
    if (new Set(ids).size !== ids.length) { toast('Some ID numbers are repeated. Use different IDs.', 'warn'); return; }
    const unlisted = ids.filter((id) => {
      try {
        if (typeof isListedEmployeeId === "function") return !isListedEmployeeId(id);
        return false;
      } catch (e) { return false; }
    });
    if (unlisted.length) { toast(`ID ${unlisted.join(', ')} is not listed in RPPF sections`, 'error'); return; }
    const period = getVsPeriod();
    if (period.error) { toast(period.error, 'warn'); setStatus(period.error, true); return; }

    setStatus('Comparing…');
    if (btn) btn.disabled = true;
    setBusy(true);
    try {
      if (typeof loadAreaMap === 'function') { try { await loadAreaMap(); } catch (e) { /* ignore */ } }
      const lists = await Promise.all(period.months.map(loadMonthList));
      // Previous months are needed to know who worked the last night (affects first-day absent logic)
      try { await Promise.all(period.months.map((m) => getPrevMonthStr(m)).filter((pm, i, arr) => pm && !period.months.includes(pm) && arr.indexOf(pm) === i).map(loadMonthList)); } catch (e) { /* ignore */ }
      const missing = period.months.filter((m, i) => !lists[i].length);
      if (missing.length === period.months.length) {
        setStatus(`No data available for ${period.label}.`, true);
        return;
      }
      const records = [];
      for (const id of ids) {
        let base = null;
        const agg = { totalDuty: 0, otHours: 0, holidayCount: 0, nightCount: 0, plainDaysCount: 0, otDaysCount: 0, absentCount: 0 };
        let hits = 0;
        period.months.forEach((m, i) => {
          const emp = findEmp(lists[i], id);
          if (!emp) return;
          hits++;
          base = emp;
          if (period.type === 'dates') {
            const a = aggregateDays(emp, period.from, period.to);
            SUM_KEYS.forEach((k) => { agg[k] += a[k]; });
            agg.absentCount += absentInRange(emp, m, period.from, period.to);
          } else {
            agg.totalDuty += num(emp.totalDuty);
            agg.otHours += num(emp.otHours);
            agg.holidayCount += num(emp.holidayCount != null ? emp.holidayCount : emp.holiday);
            agg.nightCount += num(emp.nightCount != null ? emp.nightCount : emp.night);
            agg.plainDaysCount += num(emp.plainDaysCount != null ? emp.plainDaysCount : emp.plainDays);
            agg.otDaysCount += getEmpOtDays(emp);
            // Always computed per month from the employee's own daily data (independent of the ranking screen's mode).
            let aCnt = 0;
            try { aCnt = getEmpMonthAbsentSafe(emp, m); } catch (e) { aCnt = num(emp.generalAbsentCount); }
            agg.absentCount += aCnt;
          }
        });
        if (!base) {
          if (typeof searchEmployeeDirectory === 'function') {
            const dirMatch = searchEmployeeDirectory(id, 1);
            if (dirMatch && dirMatch[0] && String(dirMatch[0].id || '').toUpperCase() === id) {
              base = dirMatch[0];
            }
          }
        }
        if (!base && hits === 0) { setStatus(`"${id}" was not found in ${period.label} data.`, true); return; }
        try {
          if (typeof isExecHiddenFor === 'function' && isExecHiddenFor(base)) {
            toast(`"${id}" calculation is visible only in in-charge mode`, 'warn');
            setStatus('', false);
            return;
          }
        } catch (e) { /* ignore */ }
        const merged = Object.assign({}, base, { totalDuty: r2(agg.totalDuty), otHours: r2(agg.otHours), holidayCount: agg.holidayCount, nightCount: agg.nightCount, plainDaysCount: agg.plainDaysCount, otDaysCount: agg.otDaysCount, absentCount: agg.absentCount, generalAbsentCount: agg.absentCount });
        delete merged.holiday; delete merged.night; delete merged.plainDays;
        delete merged.otAmount; delete merged.holidayAmount; delete merged.nightAmount; delete merged.totalEarned;
        delete merged.daily;
        records.push(buildCompareRecord(merged, id));
      }
      window._vsPeriodLabel = period.label + (missing.length ? ` · no data: ${missing.map(monLabel).join(', ')}` : '');
      setStatus('');
      const res = $('compareResult');
      if (res) res.style.display = 'block';
      showComparison(records[0], records[1], records[1].id, records[2] || null, records);
      const target = $('vsExportTarget');
      if (target) {
        if (customHeaderNote) {
          const subNote = document.createElement('div');
          subNote.className = 'vs-subsection-header-badge';
          subNote.style.cssText = 'padding:8px 12px;margin-bottom:8px;border-radius:8px;background:var(--surface-2);color:var(--brand-text);border:1px solid var(--brand-soft-border);font-size:13px;font-weight:800;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px;';
          subNote.innerHTML = `<span>🏭</span> <span>${esc(customHeaderNote)}</span> <span style="font-size:11px;font-weight:600;color:var(--muted);">(All Subsection Staff)</span>`;
          if (typeof target.prepend === 'function') target.prepend(subNote);
          else target.insertBefore(subNote, target.firstChild);
        }
        const note = document.createElement('div');
        note.className = 'vs-period-note';
        note.textContent = 'Period: ' + window._vsPeriodLabel;
        if (typeof target.prepend === 'function') target.prepend(note);
        else target.insertBefore(note, target.firstChild);
      }
      if (res) res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      console.error(err);
      setStatus('Could not load comparison data. Check your connection.', true);
    } finally {
      setBusy(false);
      if (btn) btn.disabled = false;
    }
  };

  /* ------------------------------------------ VS: clean PNG (no overlapping text) */
  function fitText(ctx, text, maxW) {
    text = String(text == null ? '' : text);
    if (ctx.measureText(text).width <= maxW) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1; }
    return text.slice(0, Math.max(1, lo)) + '…';
  }
  function wrapLines(ctx, text, maxW) {
    const words = String(text || '').split(/\s+/), lines = [];
    let line = '';
    words.forEach((w) => {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }

  window.downloadVsComparisonPNG = async function (share) {
    const table = document.querySelector('#vsExportTarget table.compare-table');
    if (!table) { toast('No comparison to save', 'warn'); return; }
    try {
      toast(share ? 'Preparing image…' : 'Creating image…', 'info');
      if (typeof ensurePayslipFonts === 'function') { try { await ensurePayslipFonts(); } catch (e) { /* ignore */ } }
      let FONT = '"Hind Siliguri","Noto Sans Bengali","Noto Sans","Segoe UI",Roboto,Arial,sans-serif';
      try { if (typeof PAY_FONT !== 'undefined') FONT = PAY_FONT; } catch (e) { /* ignore */ }

      const trs = [...table.querySelectorAll('tr')].filter(tr => !tr.classList.contains('vs-money-row') && tr.style.display !== 'none');
      const data = trs.map((tr, ri) => ({
        head: ri === 0,
        total: tr.classList.contains('total-row'),
        cells: [...tr.children].map((td) => ({
          text: (td.children[0] && ri === 0 ? td.children[0].textContent : td.textContent).replace(/\s+/g, ' ').trim(),
          sub: ri === 0 && td.children[1] ? td.children[1].textContent.replace(/\s+/g, ' ').trim() : '',
          win: td.classList.contains('win-cell')
        }))
      }));
      const nCols = data[0].cells.length, nData = Math.max(1, nCols - 1);

      const SC = 2, PAD = 28;
      const m = document.createElement('canvas').getContext('2d');
      const font = (w, s) => `${w} ${s}px ${FONT}`;
      m.font = font(600, 15);
      let labelW = 190;
      data.forEach((r) => { if (!r.head) labelW = Math.max(labelW, m.measureText(r.cells[0].text).width + 32); });
      labelW = Math.min(labelW, 300);
      const colW0 = [];
      for (let c = 1; c < nCols; c++) {
        let w = 150;
        data.forEach((r) => {
          const cell = r.cells[c]; if (!cell) return;
          m.font = font(r.head || r.total || cell.win ? 800 : 600, 15);
          w = Math.max(w, m.measureText(cell.text).width + 30);
          if (cell.sub) { m.font = font(600, 12.5); w = Math.max(w, m.measureText(cell.sub).width + 30); }
        });
        colW0.push(Math.min(w, 260));
      }
      let W = PAD * 2 + labelW + colW0.reduce((a, b) => a + b, 0);
      const MINW = 720;
      let colW = colW0.slice();
      if (W < MINW) { const extra = (MINW - W) / nData; colW = colW0.map((w) => w + extra); W = MINW; }
      const tableW = W - PAD * 2;

      const title = isInc() ? 'RPPF • VS Overtime & Duty Comparison' : 'RPPF • VS Overtime Comparison';
      const period = window._vsPeriodLabel || curMonth();
      m.font = font(600, 14);
      const subLines = wrapLines(m, `Period: ${period}`, W - PAD * 2);
      const diffEl = document.querySelector('#vsExportTarget .compare-diff');
      const diffText = diffEl ? diffEl.textContent.replace(/\s+/g, ' ').trim() : '';
      m.font = font(800, 17);
      const diffLines = diffText ? wrapLines(m, diffText, W - PAD * 2 - 24) : [];

      const BANNER = 66 + subLines.length * 20, HEAD_H = 64, ROW_H = 44, FOOT = 40;
      const bodyRows = data.length - 1;
      const H = BANNER + 14 + HEAD_H + bodyRows * ROW_H + (diffLines.length ? 20 + diffLines.length * 26 + 14 : 0) + FOOT;

      const cv = document.createElement('canvas');
      cv.width = Math.round(W * SC); cv.height = Math.round(H * SC);
      const g = cv.getContext('2d');
      g.scale(SC, SC);
      g.textBaseline = 'middle';

      g.fillStyle = '#F8FAFC'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1E3A8A'; g.fillRect(0, 0, W, BANNER);
      g.fillStyle = '#FFFFFF'; g.textAlign = 'left';
      g.font = font(800, 24); g.fillText(fitText(g, title, W - PAD * 2), PAD, 30);
      g.font = font(600, 14); g.fillStyle = '#DBEAFE';
      subLines.forEach((ln, i) => g.fillText(ln, PAD, 56 + i * 20));

      let y = BANNER + 14;
      data.forEach((row, ri) => {
        const h = row.head ? HEAD_H : ROW_H;
        let x = PAD;
        row.cells.forEach((cell, ci) => {
          const cw = ci === 0 ? labelW : colW[ci - 1];
          // background
          if (row.head) g.fillStyle = '#0F172A';
          else if (row.total) g.fillStyle = cell.win ? '#BBF7D0' : '#DCFCE7';
          else if (cell.win) g.fillStyle = '#DBEAFE';
          else g.fillStyle = (ri % 2 === 0) ? '#F1F5F9' : '#FFFFFF';
          g.fillRect(x, y, cw, h);
          g.strokeStyle = row.head ? '#1E293B' : '#E2E8F0'; g.lineWidth = 1;
          g.strokeRect(x + 0.5, y + 0.5, cw - 1, h - 1);
          // text
          const inner = cw - 24;
          if (row.head) {
            g.fillStyle = '#FFFFFF';
            g.font = font(800, ci === 0 ? 15 : 16);
            g.textAlign = ci === 0 ? 'left' : 'center';
            const cx = ci === 0 ? x + 14 : x + cw / 2;
            if (cell.sub) {
              g.fillText(fitText(g, cell.text, inner), cx, y + 22);
              g.font = font(600, 12.5); g.fillStyle = '#CBD5E1';
              g.fillText(fitText(g, cell.sub, inner), cx, y + 43);
            } else g.fillText(fitText(g, cell.text, inner), cx, y + h / 2);
          } else {
            const bold = row.total || cell.win;
            g.fillStyle = row.total ? '#166534' : cell.win ? '#1D4ED8' : '#0F172A';
            g.font = font(bold ? 800 : 600, 15);
            g.textAlign = ci === 0 ? 'left' : 'center';
            g.fillText(fitText(g, cell.text, inner), ci === 0 ? x + 14 : x + cw / 2, y + h / 2);
          }
          x += cw;
        });
        y += h;
      });

      if (diffLines.length) {
        y += 20;
        g.textAlign = 'center'; g.fillStyle = '#0F172A'; g.font = font(800, 17);
        diffLines.forEach((ln, i) => g.fillText(ln, W / 2, y + 13 + i * 26));
        y += diffLines.length * 26 + 14;
      }
      g.textAlign = 'center'; g.fillStyle = '#64748B'; g.font = font(600, 12);
      g.fillText(`Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} • RENATA PLC RPPF OT Checker`, W / 2, H - 20);

      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      const fname = `VS_Compare_${String(period).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48)}.png`;
      const file = new File([blob], fname, { type: 'image/png' });
      if (share && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: fname }); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Comparison image saved', 'success');
    } catch (e) {
      if (e && e.name !== 'AbortError') { console.error(e); toast('Could not create image', 'error'); }
    }
  };

  wrap('initVsPage', (orig) => function () {
    const r = orig.apply(this, arguments);
    try { ensureVsUi(); window.onVsPeriodChange(); } catch (e) { console.error(e); }
    return r;
  });

  /* ------------------------------------------------- 8. ranking month switch */
  wrap('startLeaderboardScan', (orig) => async function () {
    setBusy(true);
    try {
      const res = await orig.apply(this, arguments);
      let has = false;
      try { has = !!(currentLeaderboardResult && currentLeaderboardResult.allEmployees && currentLeaderboardResult.allEmployees.length); } catch (e) { /* ignore */ }
      if (!has) toast(`No data available for ${monLabel(curMonth())}`, 'info');
      return res;
    } finally {
      setBusy(false);
    }
  });

  /* ------------------------------------------------------------------- init */
  function tick() {
    injectDrawerTopbars();
    injectInfoBadges();
    if (isInc()) { setupOverview(); updateOvCounts(); }
    ensureVsUi();
    const host = $('rptPreviewHost');
    if (host && !host.__mgrObs) {
      host.__mgrObs = true;
      new MutationObserver(decorateReportChipsSoon).observe(host, { childList: true, subtree: true });
    }
    releaseLock();
  }
  function init() {
    ensureInfoOverlay();
    ensureStateCard();
    tick();
    if (isInc() && currentPermanentPageSafe() === 'report') onReportShown();
  }
  function currentPermanentPageSafe() { try { return currentPermanentPage; } catch (e) { return ''; } }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  setInterval(tick, 1200);
})();
