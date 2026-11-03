/**
 * js/patches/manager-ux.js
 * Manager-UX patch for RENATA OT Checker (checkot.github.io)
 * Implements:
 * 1. Mobile drawers (100vw) with sticky back bar
 * 2. Stale scroll lock release
 * 3. Info '?' popups for Punch & Requisition logic
 * 4. Report tab loading/empty state + In-charge quick browse bar
 * 5. Multi-month VS comparison & clean PNG export
 * 6. Global busy progress bar
 */
(function() {
  'use strict';

  // Helper to wrap global functions without editing core files
  function wrapGlobal(name, make) {
    const orig = window[name];
    if (typeof orig === 'function') {
      window[name] = make(orig);
    }
  }

  /* ==========================================================================
     1. BUSY PROGRESS BAR CONTROLLER
     ========================================================================== */
  let _busyEl = null;
  function ensureBusyBar() {
    if (!_busyEl) {
      _busyEl = document.getElementById('mgrBusyBar');
      if (!_busyEl) {
        _busyEl = document.createElement('div');
        _busyEl.id = 'mgrBusyBar';
        document.body.appendChild(_busyEl);
      }
    }
    return _busyEl;
  }
  function setBusy(active) {
    const el = ensureBusyBar();
    if (el) el.classList.toggle('active', Boolean(active));
  }

  /* ==========================================================================
     2. STALE SCROLL LOCK RELEASE (#3.2)
     ========================================================================== */
  function releaseStaleLock() {
    const hasOpenModal = Boolean(document.querySelector(
      '.lb-modal.open, .modal.open, #iccContextModal.open, #mgrInfoOverlay.open, #mgrPickerModal.open, #quickAbsentModal.open'
    ));
    if (!hasOpenModal) {
      document.body.style.position = '';
      document.body.style.overflow = '';
      document.body.style.width = '';
      document.body.style.top = '';
    }
  }

  window.addEventListener('pageshow', releaseStaleLock);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) releaseStaleLock();
  });
  let _lastTouchRelease = 0;
  document.addEventListener('touchstart', () => {
    const now = Date.now();
    if (now - _lastTouchRelease > 1200) {
      _lastTouchRelease = now;
      releaseStaleLock();
    }
  }, { capture: true, passive: true });

  wrapGlobal('closeSideDrawer', (orig) => function() {
    const res = orig.apply(this, arguments);
    setTimeout(releaseStaleLock, 80);
    return res;
  });

  wrapGlobal('switchPage', (orig) => function(pageName) {
    releaseStaleLock();
    const res = orig.apply(this, arguments);
    setTimeout(releaseStaleLock, 350);
    return res;
  });

  /* ==========================================================================
     3. STICKY DRAWER TOPBAR ON MOBILE (#3.1)
     ========================================================================== */
  const DRAWER_PAGES = [
    { id: 'page-leaderboard', title: 'Ranking' },
    { id: 'page-more', title: 'More' },
    { id: 'page-history', title: 'History' },
    { id: 'page-team', title: 'ERP Team' },
    { id: 'page-settings', title: 'Settings' },
    { id: 'page-notices', title: 'Notice Board' }
  ];

  function injectDrawerTopbars() {
    DRAWER_PAGES.forEach(dp => {
      const pageEl = document.getElementById(dp.id);
      if (pageEl && !pageEl.querySelector('.drawer-topbar')) {
        const tb = document.createElement('div');
        tb.className = 'drawer-topbar';
        tb.innerHTML = `
          <button type="button" class="drawer-back-btn" onclick="closeSideDrawer()">‹ Back</button>
          <span class="drawer-topbar-title">${dp.title}</span>
        `;
        pageEl.insertBefore(tb, pageEl.firstChild);
      }
    });
  }

  /* ==========================================================================
     4. INFO '?' BUTTONS & OVERLAY (#3.4)
     ========================================================================== */
  const INFO_TEXTS = {
    punch: {
      title: 'Missing / Problem Punch Rules',
      body: `
        <p>A punch is flagged as a <b>Problem Punch</b> when:</p>
        <ul>
          <li><b>Missing Out:</b> Employee punched In, but Out punch is blank, '-', 'NA', 'NULL', or 'MISSING'.</li>
          <li><b>Missing In:</b> Employee punched Out, but In punch is missing or '0000'.</li>
          <li><b>Irregular Punch:</b> Total punch count on that day is odd or contains erroneous timestamps.</li>
        </ul>
        <p><i>Resolution:</i> Contact ERP Team to rectify punches in Empress system.</p>
      `
    },
    req: {
      title: 'Overtime Requisition Rules',
      body: `
        <p>An OT discrepancy is flagged under <b>Requisition Problem</b> when:</p>
        <ul>
          <li><b>Physical Duty 9–13.5h:</b> Worked on standard days but recorded 0 OT in Empress without an approved OT requisition.</li>
          <li><b>Night Shift 11h+:</b> Worked night shift with zero recorded OT.</li>
          <li><b>Evening OT:</b> Shift ending between 19:10–20:15 expects 3h OT; ending 20:16–22:30 expects 5h OT.</li>
          <li><b>Early Morning OT:</b> Punch-in by 07:15 with 9.5h+ total duty expects 1.0h morning OT.</li>
          <li><b>Holiday Duty:</b> Worked Friday or public holiday booked as regular duty instead of Holiday duty.</li>
        </ul>
      `
    },
    both: {
      title: 'Attendance & OT Audit Rules',
      body: `
        <p>Combines Empress physical punch matching with verified HR overtime allowances.</p>
      `
    }
  };

  let _infoOverlay = null;
  function ensureInfoOverlay() {
    if (!_infoOverlay) {
      _infoOverlay = document.getElementById('mgrInfoOverlay');
      if (!_infoOverlay) {
        _infoOverlay = document.createElement('div');
        _infoOverlay.id = 'mgrInfoOverlay';
        _infoOverlay.className = 'mgr-info-overlay';
        _infoOverlay.onclick = (e) => {
          if (e.target === _infoOverlay) closeMgrInfoOverlay();
        };
        _infoOverlay.innerHTML = `
          <div class="mgr-info-card" onclick="event.stopPropagation()">
            <div class="mgr-info-title">
              <span id="mgrInfoTitle">Rules &amp; Explanations</span>
              <button type="button" class="calc-mini-btn" onclick="closeMgrInfoOverlay()">✕</button>
            </div>
            <div class="mgr-info-body" id="mgrInfoBody"></div>
            <button type="button" class="btn-primary mgr-info-close-btn" onclick="closeMgrInfoOverlay()">Got it</button>
          </div>
        `;
        document.body.appendChild(_infoOverlay);
      }
    }
    return _infoOverlay;
  }

  function openMgrInfo(type) {
    const overlay = ensureInfoOverlay();
    const data = INFO_TEXTS[type] || INFO_TEXTS.both;
    const titleEl = document.getElementById('mgrInfoTitle');
    const bodyEl = document.getElementById('mgrInfoBody');
    if (titleEl) titleEl.textContent = data.title;
    if (bodyEl) bodyEl.innerHTML = data.body;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  window.openMgrInfo = openMgrInfo;

  function closeMgrInfoOverlay() {
    const overlay = document.getElementById('mgrInfoOverlay');
    if (overlay) overlay.classList.remove('open');
    releaseStaleLock();
  }
  window.closeMgrInfoOverlay = closeMgrInfoOverlay;

  function injectInfoBadges() {
    // 1. Rank Hub titles
    document.querySelectorAll('.rank-hub-item').forEach(item => {
      const title = item.querySelector('.rank-hub-title');
      if (title && !title.querySelector('.mgr-q')) {
        const txt = title.textContent.trim().toLowerCase();
        if (txt.includes('punch')) {
          title.appendChild(createQBtn('punch'));
        } else if (txt.includes('requisition')) {
          title.appendChild(createQBtn('req'));
        }
      }
    });

    // 2. Report Step 7 Label
    const step7Lbl = document.getElementById('step7LabelText');
    if (step7Lbl && !step7Lbl.querySelector('.mgr-q')) {
      step7Lbl.appendChild(createQBtn('req'));
    }

    // 3. Observer for dynamically rendered report chips
    const host = document.getElementById('rptPreviewHost');
    if (host && !host.__mgrObserved) {
      host.__mgrObserved = true;
      const obs = new MutationObserver(() => {
        host.querySelectorAll('.chip, span, div').forEach(el => {
          if (!el.querySelector('.mgr-q')) {
            const t = el.textContent.trim();
            if (t.startsWith('Req Missing') || t.startsWith('Req Problem')) {
              el.appendChild(createQBtn('req'));
            } else if (t.startsWith('Punch Problem') || t.startsWith('Punch Missing')) {
              el.appendChild(createQBtn('punch'));
            }
          }
        });
      });
      obs.observe(host, { childList: true, subtree: true });
    }
  }

  function createQBtn(type) {
    const q = document.createElement('span');
    q.className = 'mgr-q';
    q.textContent = '?';
    q.title = 'View explanation rules';
    q.setAttribute('data-html2canvas-ignore', 'true');
    q.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      openMgrInfo(type);
    };
    return q;
  }

  /* ==========================================================================
     5. REPORT TAB: LOADING & EMPTY STATE (#3.5)
     ========================================================================== */
  let _reportSeq = 0;
  function ensureReportStateCard() {
    let card = document.getElementById('rptStateCard');
    if (!card) {
      card = document.createElement('div');
      card.id = 'rptStateCard';
      card.className = 'rpt-state-card';
      card.style.display = 'none';

      const emptyCard = document.getElementById('reportEmptyCard');
      if (emptyCard && emptyCard.parentNode) {
        emptyCard.parentNode.insertBefore(card, emptyCard);
      }
    }
    return card;
  }

  wrapGlobal('findReport', (orig) => async function() {
    const seq = ++_reportSeq;
    const card = ensureReportStateCard();
    const curM = typeof getCurrentMonth === 'function' ? getCurrentMonth() : '';

    if (card) {
      card.innerHTML = `
        <div class="rpt-state-spinner"></div>
        <div class="rpt-state-msg">Loading Overtime Report for ${curM}…</div>
        <div class="rpt-state-sub">Verifying employee logs &amp; ERP data</div>
      `;
      card.style.display = 'block';
    }
    setBusy(true);

    try {
      await orig.apply(this, arguments);
    } finally {
      setBusy(false);
      if (seq === _reportSeq && card) {
        if (!window.currentResult) {
          const st = document.getElementById('status');
          const firstErr = st && st.innerText ? st.innerText.split('\n')[0] : 'No record found';
          card.innerHTML = `
            <div class="rpt-state-msg" style="color:var(--danger);">⚠️ No data available for ${curM}</div>
            <div class="rpt-state-sub">${firstErr}</div>
            <div class="rpt-state-nav">
              <button type="button" class="month-nav-btn" onclick="navigateReportMonth(-1)">‹ Prev Month</button>
              <button type="button" class="month-nav-btn" onclick="navigateReportMonth(1)">Next Month ›</button>
            </div>
          `;
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      }
    }
  });

  /* ==========================================================================
     6. REPORT TAB: MANAGER BAR & BROWSE PICKER (#3.6)
     ========================================================================== */
  function ensureMgrReportBar() {
    let bar = document.getElementById('mgrReportBar');
    if (!bar) {
      const page = document.getElementById('page-report');
      if (!page) return null;
      bar = document.createElement('div');
      bar.id = 'mgrReportBar';
      bar.className = 'mgr-report-bar';
      bar.innerHTML = `
        <span style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;">In-Charge View:</span>
        <select id="mgrMonthSel" aria-label="Select month" onchange="onMgrMonthSelChange(this.value)"></select>
        <select id="mgrAreaSel" aria-label="Select section" onchange="onMgrAreaSelChange(this.value)">
          <option value="all">All Sections</option>
          <option value="Solid Production">Solid Production</option>
          <option value="Softgel Production">Softgel Production</option>
          <option value="Packing Hall">Packing Hall</option>
          <option value="Overall">Executives</option>
        </select>
        <button type="button" class="calc-mini-btn" onclick="openMgrPickerModal()">Browse ▾</button>
      `;
      const strip = document.getElementById('reportEmpStrip');
      if (strip && strip.parentNode) {
        strip.parentNode.insertBefore(bar, strip.nextSibling);
      }
    }
    syncMgrReportBar();
    return bar;
  }

  function syncMgrReportBar() {
    const sel = document.getElementById('mgrMonthSel');
    if (sel && typeof availableServerMonths !== 'undefined' && Array.isArray(availableServerMonths)) {
      const curM = typeof getCurrentMonth === 'function' ? getCurrentMonth() : '';
      sel.innerHTML = availableServerMonths.map(m => `
        <option value="${m}" ${m === curM ? 'selected' : ''}>${m}</option>
      `).join('');
    }
  }

  window.onMgrMonthSelChange = function(mVal) {
    if (!mVal) return;
    const parts = mVal.split('-');
    if (parts.length === 2) {
      const ySel = document.getElementById('yearSelect');
      const mSel = document.getElementById('monthSelect');
      if (ySel) ySel.value = parts[0];
      if (mSel) mSel.value = parts[1];
      if (typeof findReport === 'function') findReport();
    }
  };

  window.onMgrAreaSelChange = function(aVal) {
    // Area filter state stored for browse modal
    window._mgrSelectedArea = aVal || 'all';
  };

  /* Manager Employee Browse Picker Modal */
  let _mgrPickerFilter = 'all';
  function ensureMgrPickerModal() {
    let modal = document.getElementById('mgrPickerModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mgrPickerModal';
      modal.className = 'mgr-picker-modal';
      modal.onclick = (e) => { if (e.target === modal) closeMgrPickerModal(); };
      modal.innerHTML = `
        <div class="mgr-picker-content" onclick="event.stopPropagation()">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="font-size:15px;font-weight:800;color:var(--text);">Browse Section Employees</div>
            <button type="button" class="calc-mini-btn" onclick="closeMgrPickerModal()">✕</button>
          </div>
          <div class="mgr-picker-chips" id="mgrPickerChips">
            <button type="button" class="mgr-picker-chip active" data-mgr-crit="all" onclick="setMgrPickerFilter('all')">All</button>
            <button type="button" class="mgr-picker-chip" data-mgr-crit="punch" onclick="setMgrPickerFilter('punch')">Punch Problem</button>
            <button type="button" class="mgr-picker-chip" data-mgr-crit="req" onclick="setMgrPickerFilter('req')">OT Missing</button>
          </div>
          <input type="text" id="mgrPickerSearchInp" placeholder="Search by name or ID..." oninput="renderMgrPickerList()" style="min-height:34px;font-size:12.5px;padding:4px 8px;margin:0 0 6px 0;width:100%;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface-2);color:var(--text);">
          <div class="mgr-picker-list" id="mgrPickerList"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    return modal;
  }

  window.setMgrPickerFilter = function(crit) {
    _mgrPickerFilter = crit || 'all';
    document.querySelectorAll('#mgrPickerChips .mgr-picker-chip').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mgr-crit') === _mgrPickerFilter);
    });
    renderMgrPickerList();
  };

  window.openMgrPickerModal = async function() {
    const modal = ensureMgrPickerModal();
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    await renderMgrPickerList();
  };

  window.closeMgrPickerModal = function() {
    const modal = document.getElementById('mgrPickerModal');
    if (modal) modal.classList.remove('open');
    releaseStaleLock();
  };

  async function renderMgrPickerList() {
    const listEl = document.getElementById('mgrPickerList');
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px;">Loading employees...</div>';

    const month = typeof getCurrentMonth === 'function' ? getCurrentMonth() : '';
    let emps = (typeof monthIndexMemoryCache !== 'undefined' && monthIndexMemoryCache[month]);
    if (!emps && typeof fetchMonthPreIndexedData === 'function') {
      try {
        emps = await fetchMonthPreIndexedData(month, false, true);
      } catch (e) {}
    }
    if (!Array.isArray(emps) || !emps.length) {
      listEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px;">No employee data available.</div>';
      return;
    }

    const selArea = window._mgrSelectedArea || 'all';
    let filtered = emps.filter(e => {
      if (typeof isMappedAreaId === 'function' && !isMappedAreaId(e.id)) return false;
      if (selArea !== 'all') {
        const a = typeof getAreaForId === 'function' ? getAreaForId(e.id, true) : '';
        if (selArea === 'Overall') {
          if (a !== 'Overall' && e.kind !== 'EXEC') return false;
        } else if (a !== selArea) {
          return false;
        }
      }
      return true;
    });

    if (_mgrPickerFilter === 'punch') {
      filtered = filtered.filter(e => {
        const c = typeof getPunchProblemCount === 'function' ? getPunchProblemCount(e) : 0;
        return c > 0 || (Array.isArray(e.punchProblems) && e.punchProblems.length > 0);
      });
    } else if (_mgrPickerFilter === 'req') {
      filtered = filtered.filter(e => {
        return (Number(e.requisitionProblemCount) || 0) > 0 || (Array.isArray(e.requisitionProblems) && e.requisitionProblems.length > 0);
      });
    }

    const q = (document.getElementById('mgrPickerSearchInp')?.value || '').trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(e => `${e.id} ${e.name}`.toLowerCase().includes(q));
    }

    const top60 = filtered.slice(0, 60);
    if (!top60.length) {
      listEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px;">No matching employees.</div>';
      return;
    }

    listEl.innerHTML = top60.map(e => `
      <div class="mgr-picker-row" onclick="selectMgrPickedEmp('${e.id}')">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text);">${e.name || e.id} <span style="font-size:11.5px;color:var(--muted);">(${e.id})</span></div>
          <div style="font-size:11px;color:var(--text-2);">${e.area || ''} • ${e.designation || 'Staff'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12.5px;font-weight:700;color:var(--brand);">${e.totalDuty || 0}h</div>
          <div style="font-size:10.5px;color:var(--muted);">${e.otHours || 0}h OT</div>
        </div>
      </div>
    `).join('');
  }

  window.selectMgrPickedEmp = function(empId) {
    closeMgrPickerModal();
    const qInp = document.getElementById('reportQuickIdInput');
    const empInp = document.getElementById('employeeId');
    if (qInp) qInp.value = empId;
    if (empInp) empInp.value = empId;
    if (typeof searchFromReportPage === 'function') searchFromReportPage();
    else if (typeof findReport === 'function') findReport();
  };

  /* ==========================================================================
     7. VS MODE: WORKING MULTI-MONTH COMPARISON (#3.7 & #3.8)
     ========================================================================== */
  function ensureVsPeriodExtras() {
    const pSel = document.getElementById('vsPeriodSelect');
    if (!pSel) return;

    // Add 'custom' and 'range' options if not present
    if (![...pSel.options].some(o => o.value === 'custom')) {
      const opt = document.createElement('option');
      opt.value = 'custom';
      opt.textContent = 'Pick specific months (Custom)';
      pSel.appendChild(opt);
    }
    if (![...pSel.options].some(o => o.value === 'range')) {
      const opt = document.createElement('option');
      opt.value = 'range';
      opt.textContent = 'Month range (From/To)';
      pSel.appendChild(opt);
    }

    let extra = document.getElementById('vsExtraPeriod');
    if (!extra) {
      extra = document.createElement('div');
      extra.id = 'vsExtraPeriod';
      extra.className = 'vs-extra-period';
      pSel.parentNode.insertBefore(extra, pSel.nextSibling);
    }
  }

  window.onVsPeriodChange = function() {
    const pSel = document.getElementById('vsPeriodSelect');
    const extra = document.getElementById('vsExtraPeriod');
    if (!pSel || !extra) return;

    const val = pSel.value;
    if (val === 'custom') {
      extra.style.display = 'block';
      const months = (typeof availableServerMonths !== 'undefined' && Array.isArray(availableServerMonths))
        ? availableServerMonths : ['2026-10', '2026-09', '2026-08', '2026-07'];
      extra.innerHTML = `
        <div style="font-size:11.5px;font-weight:700;color:var(--text);">Select Months to Aggregate:</div>
        <div class="vs-period-chips" id="vsCustomMonthChips">
          ${months.map(m => `
            <button type="button" class="vs-chip-btn ${m === '2026-10' ? 'active' : ''}" data-vsm="${m}" onclick="this.classList.toggle('active')">${m}</button>
          `).join('')}
        </div>
      `;
    } else if (val === 'range') {
      extra.style.display = 'block';
      const months = (typeof availableServerMonths !== 'undefined' && Array.isArray(availableServerMonths))
        ? availableServerMonths : ['2026-10', '2026-09', '2026-08', '2026-07'];
      extra.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;">
          <div>
            <label style="font-size:11px;font-weight:700;color:var(--muted);">From:</label>
            <select id="vsRangeFrom" style="min-height:30px;font-size:12px;">
              ${months.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:var(--muted);">To:</label>
            <select id="vsRangeTo" style="min-height:30px;font-size:12px;">
              ${months.map((m, idx) => `<option value="${m}" ${idx === months.length - 1 ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
      `;
    } else {
      extra.style.display = 'none';
    }
  };

  function getVsTargetMonths(curMonth) {
    const pSel = document.getElementById('vsPeriodSelect');
    const val = pSel ? pSel.value : 'current';
    if (val === 'current') return [curMonth];

    if (val === '3m') return (typeof getPreviousMonthStrings === 'function') ? getPreviousMonthStrings(curMonth, 3) : [curMonth];
    if (val === '6m') return (typeof getPreviousMonthStrings === 'function') ? getPreviousMonthStrings(curMonth, 6) : [curMonth];
    if (val === '1y') return (typeof getPreviousMonthStrings === 'function') ? getPreviousMonthStrings(curMonth, 12) : [curMonth];
    if (val === 'ytd') return (typeof getYearToDateMonths === 'function') ? getYearToDateMonths(curMonth) : [curMonth];
    if (val === 'alltime') return (typeof getAllTime2026Months === 'function') ? getAllTime2026Months(curMonth) : [curMonth];

    if (val === 'custom') {
      const active = [...document.querySelectorAll('#vsCustomMonthChips .vs-chip-btn.active')].map(b => b.getAttribute('data-vsm'));
      return active.length ? active : [curMonth];
    }
    if (val === 'range') {
      const from = document.getElementById('vsRangeFrom')?.value || curMonth;
      const to = document.getElementById('vsRangeTo')?.value || curMonth;
      const all = (typeof availableServerMonths !== 'undefined' && Array.isArray(availableServerMonths)) ? availableServerMonths : [curMonth];
      const s = all.indexOf(from);
      const e = all.indexOf(to);
      if (s !== -1 && e !== -1) {
        return all.slice(Math.min(s, e), Math.max(s, e) + 1);
      }
      return [curMonth];
    }
    return [curMonth];
  }

  wrapGlobal('runComparison', (orig) => async function() {
    const curMonth = (document.getElementById('vsMonthOverrideSelect')?.value) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
    const months = getVsTargetMonths(curMonth);
    const pSel = document.getElementById('vsPeriodSelect');
    const pVal = pSel ? pSel.value : 'current';

    if (pVal === 'current' || months.length <= 1) {
      window._vsPeriodLabel = curMonth;
      return orig.apply(this, arguments);
    }

    setBusy(true);
    const origFetch = window.fetchMonthPreIndexedData;
    window._vsPeriodLabel = `${months[0]} – ${months[months.length - 1]} (${months.length} months)`;

    try {
      // 1. Load all target months in parallel
      const monthDataArrays = await Promise.all(months.map(async m => {
        let list = typeof monthIndexMemoryCache !== 'undefined' ? monthIndexMemoryCache[m] : null;
        if (!list && typeof origFetch === 'function') {
          try { list = await origFetch(m, false, false); } catch (e) {}
        }
        return Array.isArray(list) ? list : [];
      }));

      // 2. Merge employees by ID
      const mergedMap = {};
      monthDataArrays.forEach(arr => {
        arr.forEach(emp => {
          if (!emp || !emp.id) return;
          const uId = emp.id.toUpperCase();
          if (!mergedMap[uId]) {
            mergedMap[uId] = Object.assign({}, emp);
          } else {
            const tgt = mergedMap[uId];
            ['totalDuty', 'otHours', 'holidayCount', 'holiday', 'nightCount', 'night', 'plainDaysCount', 'plainDays', 'otAmount', 'holidayAmount', 'nightAmount', 'totalEarned'].forEach(k => {
              if (typeof emp[k] === 'number') tgt[k] = (tgt[k] || 0) + emp[k];
            });
            // Update latest meta
            if (emp.name && emp.name !== emp.id) tgt.name = emp.name;
            if (emp.designation) tgt.designation = emp.designation;
            if (emp.category) tgt.category = emp.category;
            if (emp.type) tgt.type = emp.type;
          }
        });
      });

      const mergedList = Object.values(mergedMap);

      // 3. Temporarily swap fetchMonthPreIndexedData
      window.fetchMonthPreIndexedData = async () => mergedList;

      // 4. Run comparison
      await orig.apply(this, arguments);

      // 5. Inject period note inside #vsExportTarget
      const exportTarget = document.getElementById('vsExportTarget');
      if (exportTarget) {
        let note = exportTarget.querySelector('.vs-period-note');
        if (!note) {
          note = document.createElement('div');
          note.className = 'vs-period-note';
          exportTarget.insertBefore(note, exportTarget.firstChild);
        }
        note.textContent = `Period: ${window._vsPeriodLabel}`;
      }
    } finally {
      window.fetchMonthPreIndexedData = origFetch;
      setBusy(false);
    }
  });

  /* Canvas PNG Re-implementation for Clean Layout (#3.8) */
  window.downloadVsComparisonPNG = function() {
    const table = document.querySelector('table.compare-table');
    if (!table) {
      if (typeof showToast === 'function') showToast('No comparison table to export', 'warn');
      return;
    }

    const rows = [...table.querySelectorAll('tr')];
    if (!rows.length) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const numCols = rows[0].children.length;
    const dataCols = Math.max(1, numCols - 1);
    const colW = dataCols === 2 ? 250 : (dataCols === 3 ? 215 : 185);
    const labelW = 220;
    const totalW = labelW + (dataCols * colW) + 40;
    const rowH = 40;
    const headerH = 130;
    const totalH = headerH + (rows.length * rowH) + 60;

    canvas.width = totalW * 2;
    canvas.height = totalH * 2;
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, totalW, totalH);

    // Title banner
    ctx.fillStyle = '#1E3A8A';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('RENATA PLC • RPPF Production Overtime Comparison', 20, 36);

    ctx.fillStyle = '#64748B';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const periodTxt = window._vsPeriodLabel ? `Period: ${window._vsPeriodLabel}` : `Exported: ${new Date().toLocaleDateString()}`;
    ctx.fillText(periodTxt, 20, 58);

    // Draw table
    let y = 84;
    rows.forEach((tr, rIdx) => {
      const isHeader = rIdx === 0;
      const isTotal = tr.classList.contains('total-row');

      if (isHeader) {
        ctx.fillStyle = '#F1F5F9';
        ctx.fillRect(20, y, totalW - 40, rowH + 10);
      } else if (isTotal) {
        ctx.fillStyle = '#ECFDF5';
        ctx.fillRect(20, y, totalW - 40, rowH);
      } else if (rIdx % 2 === 1) {
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(20, y, totalW - 40, rowH);
      }

      ctx.fillStyle = isHeader ? '#0F172A' : (isTotal ? '#15803D' : '#334155');
      ctx.font = (isHeader || isTotal) ? 'bold 13px sans-serif' : '12.5px sans-serif';

      let x = 28;
      [...tr.children].forEach((td, cIdx) => {
        const txt = td.innerText.replace(/[\n\r]+/g, ' ').trim();
        const curW = cIdx === 0 ? labelW : colW;
        ctx.fillText(txt.slice(0, 30), x, y + 25);
        x += curW;
      });

      y += isHeader ? (rowH + 10) : rowH;
    });

    // Save
    const fname = `VS_Compare_${(window._vsPeriodLabel || 'Export').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    canvas.toBlob(blob => {
      if (!blob) return;
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], fname, { type: 'image/png' })] })) {
        navigator.share({
          files: [new File([blob], fname, { type: 'image/png' })],
          title: 'RENATA OT Comparison'
        }).catch(() => {});
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        a.click();
      }
    }, 'image/png');
  };

  /* ==========================================================================
     8. RANKING MONTH SWITCH TOAST (#3.9)
     ========================================================================== */
  wrapGlobal('startLeaderboardScan', (orig) => async function() {
    setBusy(true);
    try {
      const res = await orig.apply(this, arguments);
      const curM = typeof getCurrentMonth === 'function' ? getCurrentMonth() : '';
      if (!window.currentLeaderboardResult || !window.currentLeaderboardResult.allEmployees || !window.currentLeaderboardResult.allEmployees.length) {
        if (typeof showToast === 'function') showToast(`No data available for ${curM}`, 'info');
      }
      return res;
    } finally {
      setBusy(false);
    }
  });

  /* ==========================================================================
     INIT PATCH HOOKS
     ========================================================================== */
  function initManagerUxPatches() {
    injectDrawerTopbars();
    injectInfoBadges();
    ensureReportStateCard();
    ensureMgrReportBar();
    ensureVsPeriodExtras();
    releaseStaleLock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initManagerUxPatches);
  } else {
    initManagerUxPatches();
  }

  // Periodic DOM poll for dynamic elements
  setInterval(() => {
    injectInfoBadges();
    ensureMgrReportBar();
    ensureVsPeriodExtras();
  }, 1200);

})();
