/* ==========================================================================
   REPORT-DIARY.JS - Employee Hisab Diary (Spiral Binding + Real-Time Page Turn)
   Modular add-on for #step7 / #rptPreviewHost.
   Does not alter table data, calculations, flags, or export/print output.
   ========================================================================== */

(function () {
  'use strict';

  const EN_MONTHS_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const EN_MONTHS_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const MIN_YEAR = 2020;
  const MAX_YEAR = 2032;
  const DIRECTION_LOCK_PX = 8;
  const COMMIT_RATIO = 0.25;
  const COMMIT_VELOCITY_PX_MS = 0.5;
  const RING_PITCH_PX = 24;

  let _isAnimating = false;
  let _resizeObserver = null;
  let _mutationObserver = null;
  let _lastRenderedHeight = 0;
  const _knownMissingMonths = new Set(); // key: `${DEPT}:${EMP_ID}:${YYYY-MM}` or `${DEPT}:GLOBAL:${YYYY-MM}`
  const _knownValidMonths = new Set();
  const _probedMonths = new Set();

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_e) {
      return false;
    }
  }

  function getActiveDept() {
    try {
      if (typeof getClientDepartment === 'function') return getClientDepartment() || 'PR';
    } catch (_e) {}
    return 'PR';
  }

  function getActiveEmpId() {
    try {
      if (window._rptCtx && window._rptCtx.id) return String(window._rptCtx.id).trim().toUpperCase();
      if (typeof currentSearchId !== 'undefined' && currentSearchId) return String(currentSearchId).trim().toUpperCase();
      const inp = document.getElementById('employeeId');
      if (inp && inp.value) return String(inp.value).trim().toUpperCase();
    } catch (_e) {}
    return '';
  }

  function getCurrentYm() {
    try {
      const ySel = document.getElementById('yearSelect');
      const mSel = document.getElementById('monthSelect');
      if (ySel && mSel && ySel.value && mSel.value) {
        return `${ySel.value}-${String(mSel.value).padStart(2, '0')}`;
      }
      if (window._rptCtx && window._rptCtx.month && /^\d{4}-\d{2}$/.test(window._rptCtx.month)) {
        return window._rptCtx.month;
      }
      if (typeof currentMonth !== 'undefined' && /^\d{4}-\d{2}$/.test(currentMonth)) {
        return currentMonth;
      }
    } catch (_e) {}
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function shiftYm(ymStr, delta) {
    const m = String(ymStr || '').match(/^(\d{4})-(\d{2})$/);
    let year = m ? parseInt(m[1], 10) : new Date().getFullYear();
    let month = m ? parseInt(m[2], 10) : (new Date().getMonth() + 1);
    month += delta;
    while (month < 1) { month += 12; year -= 1; }
    while (month > 12) { month -= 12; year += 1; }
    return {
      year,
      month,
      ym: `${year}-${String(month).padStart(2, '0')}`,
      monthName: EN_MONTHS_FULL[month - 1] || '',
      monthShort: EN_MONTHS_SHORT[month - 1] || ''
    };
  }

  function checkEmpInMonthList(list, empId) {
    if (!Array.isArray(list) || !empId) return false;
    const target = String(empId).toUpperCase();
    const alias = (typeof resolveEmpAliasId === 'function') ? String(resolveEmpAliasId(target) || target).toUpperCase() : target;
    return list.some(e => {
      if (!e || !e.id) return false;
      const id = String(e.id).toUpperCase();
      return id === target || id === alias;
    });
  }

  // Quietly probe adjacent months so boundary bounce works synchronously during drag
  function probeAdjacentMonths(centerYm, empId) {
    if (!centerYm || !empId) return;
    const dept = getActiveDept();
    [-1, 1].forEach(delta => {
      const t = shiftYm(centerYm, delta);
      if (t.year < MIN_YEAR || t.year > MAX_YEAR) return;
      const empKey = `${dept}:${empId}:${t.ym}`;
      const globKey = `${dept}:GLOBAL:${t.ym}`;
      if (_knownMissingMonths.has(empKey) || _knownMissingMonths.has(globKey) || _knownValidMonths.has(empKey)) return;

      try {
        if (typeof monthIndexMemoryCache !== 'undefined' && monthIndexMemoryCache && Array.isArray(monthIndexMemoryCache[t.ym])) {
          if (checkEmpInMonthList(monthIndexMemoryCache[t.ym], empId)) {
            _knownValidMonths.add(empKey);
          } else {
            _knownMissingMonths.add(empKey);
          }
          return;
        }
      } catch (_e) {}

      const probeKey = `${dept}:${t.ym}`;
      if (_probedMonths.has(probeKey)) return;
      _probedMonths.add(probeKey);

      const dataPath = dept === 'QA' ? `data/qa/${t.ym}.json` : `data/${t.ym}.json`;
      fetch(dataPath, { method: 'GET', credentials: 'same-origin' })
        .then(r => {
          if (!r.ok) {
            _knownMissingMonths.add(globKey);
            return null;
          }
          return r.json();
        })
        .then(json => {
          if (!json) return;
          const list = Array.isArray(json.employees) ? json.employees : [];
          try {
            if (typeof monthIndexMemoryCache !== 'undefined' && monthIndexMemoryCache && !monthIndexMemoryCache[t.ym]) {
              monthIndexMemoryCache[t.ym] = list;
            }
          } catch (_e) {}
          const curId = getActiveEmpId() || empId;
          const k = `${dept}:${curId}:${t.ym}`;
          if (checkEmpInMonthList(list, curId)) {
            _knownValidMonths.add(k);
          } else {
            _knownMissingMonths.add(k);
          }
          updatePeekLabels();
        })
        .catch(() => {
          _knownMissingMonths.add(globKey);
          updatePeekLabels();
        });
    });
  }

  function getAdjacentMonthInfo(delta) {
    const curYm = getCurrentYm();
    const target = shiftYm(curYm, delta);
    const dept = getActiveDept();
    const empId = getActiveEmpId();
    const empKey = `${dept}:${empId}:${target.ym}`;
    const globKey = `${dept}:GLOBAL:${target.ym}`;

    if (target.year < MIN_YEAR || target.year > MAX_YEAR) {
      return {
        ...target,
        canNavigate: false,
        reason: 'limit',
        reasonMsg: `Diary limit reached (${MIN_YEAR}–${MAX_YEAR})`
      };
    }

    try {
      if (typeof monthIndexMemoryCache !== 'undefined' && monthIndexMemoryCache && Array.isArray(monthIndexMemoryCache[target.ym])) {
        if (empId && !checkEmpInMonthList(monthIndexMemoryCache[target.ym], empId)) {
          _knownMissingMonths.add(empKey);
        } else if (empId) {
          _knownValidMonths.add(empKey);
        }
      }
    } catch (_e) {}

    if (_knownMissingMonths.has(globKey) || (empId && _knownMissingMonths.has(empKey))) {
      return {
        ...target,
        canNavigate: false,
        reason: 'nodata',
        reasonMsg: `No work log data for ${target.monthName} ${target.year}`
      };
    }

    return {
      ...target,
      canNavigate: true,
      reason: '',
      reasonMsg: ''
    };
  }

  function buildRingsSvg(heightPx, side) {
    const h = Math.max(180, Math.round(heightPx || 560));
    const count = Math.max(6, Math.floor((h - 16) / RING_PITCH_PX));
    const totalSpan = (count - 1) * RING_PITCH_PX;
    const startY = Math.max(12, Math.round((h - totalSpan) / 2));
    const uid = `diary-${side}`;

    let loops = '';
    for (let i = 0; i < count; i++) {
      const cy = startY + i * RING_PITCH_PX;
      if (side === 'left') {
        // Left rail: width 19px, placed at left: -17px (spans -17px..+2px relative to sheet edge).
        // Punch hole sits right on the outer paper margin (x=15.8), wire loops extend into the left gutter.
        loops += `<g transform="translate(0, ${cy})">
          <ellipse cx="16.0" cy="1.4" rx="2.7" ry="2.2" fill="var(--ring-shadow)"/>
          <circle cx="15.8" cy="0" r="2.35" fill="var(--ring-hole-bg)" stroke="var(--ring-hole-rim)" stroke-width="0.75"/>
          <path d="M 3.0 -3.2 C 7.2 -5.5, 13.0 -4.0, 15.8 -1.0" fill="none" stroke="var(--ring-metal-lo)" stroke-width="1.5" stroke-linecap="round" opacity="0.65"/>
          <path d="M 1.8 1.3 C 6.0 4.5, 12.2 4.1, 16.0 1.1" fill="none" stroke="var(--ring-shadow)" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M 1.6 -1.4 C 5.5 -4.2, 12.0 -3.6, 15.8 -0.8" fill="none" stroke="url(#${uid}-grad)" stroke-width="2.15" stroke-linecap="round"/>
          <path d="M 1.6 1.5 C 5.5 -1.1, 12.0 -0.5, 15.8 1.0" fill="none" stroke="url(#${uid}-grad)" stroke-width="2.0" stroke-linecap="round"/>
          <ellipse cx="1.9" cy="0.1" rx="1.35" ry="3.0" fill="var(--ring-metal-lo)" stroke="var(--ring-metal-edge)" stroke-width="0.45"/>
        </g>`;
      } else {
        // Right rail: width 19px, placed at right: -17px (spans -2px..+17px relative to right sheet edge).
        loops += `<g transform="translate(0, ${cy})">
          <ellipse cx="3.0" cy="1.4" rx="2.7" ry="2.2" fill="var(--ring-shadow)"/>
          <circle cx="3.2" cy="0" r="2.35" fill="var(--ring-hole-bg)" stroke="var(--ring-hole-rim)" stroke-width="0.75"/>
          <path d="M 16.0 -3.2 C 11.8 -5.5, 6.0 -4.0, 3.2 -1.0" fill="none" stroke="var(--ring-metal-lo)" stroke-width="1.5" stroke-linecap="round" opacity="0.65"/>
          <path d="M 17.2 1.3 C 13.0 4.5, 6.8 4.1, 3.0 1.1" fill="none" stroke="var(--ring-shadow)" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M 17.4 -1.4 C 13.5 -4.2, 7.0 -3.6, 3.2 -0.8" fill="none" stroke="url(#${uid}-grad)" stroke-width="2.15" stroke-linecap="round"/>
          <path d="M 17.4 1.5 C 13.5 -1.1, 7.0 -0.5, 3.2 1.0" fill="none" stroke="url(#${uid}-grad)" stroke-width="2.0" stroke-linecap="round"/>
          <ellipse cx="17.1" cy="0.1" rx="1.35" ry="3.0" fill="var(--ring-metal-lo)" stroke="var(--ring-metal-edge)" stroke-width="0.45"/>
        </g>`;
      }
    }

    return `<svg viewBox="0 0 19 ${h}" width="19" height="${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${uid}-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--ring-metal-lo)"/>
          <stop offset="35%" stop-color="var(--ring-metal-hi)"/>
          <stop offset="65%" stop-color="var(--ring-metal-mid)"/>
          <stop offset="100%" stop-color="var(--ring-metal-edge)"/>
        </linearGradient>
      </defs>
      ${loops}
    </svg>`;
  }

  function renderSpiralRings(force) {
    const stage = document.getElementById('rptDiaryStage');
    const leftRail = document.getElementById('rptDiaryRingsLeft');
    const rightRail = document.getElementById('rptDiaryRingsRight');
    if (!stage || !leftRail || !rightRail) return;

    const rect = stage.getBoundingClientRect();
    const h = Math.max(180, Math.round((rect && rect.height ? rect.height : stage.offsetHeight) - 12));
    if (!force && Math.abs(h - _lastRenderedHeight) < 8 && leftRail.firstElementChild) return;
    _lastRenderedHeight = h;

    leftRail.innerHTML = buildRingsSvg(h, 'left');
    rightRail.innerHTML = buildRingsSvg(h, 'right');
  }

  function updatePeekLabels() {
    const prevEl = document.getElementById('rptDiaryPeekPrev');
    const nextEl = document.getElementById('rptDiaryPeekNext');
    if (!prevEl || !nextEl) return;

    const prevInfo = getAdjacentMonthInfo(-1);
    const nextInfo = getAdjacentMonthInfo(1);

    prevEl.classList.toggle('is-boundary', !prevInfo.canNavigate);
    prevEl.innerHTML = `<div class="diary-peek-kicker" data-mgrq-done="1">${prevInfo.canNavigate ? '‹ Prev' : '‹ Limit'}</div>` +
      `<div class="diary-peek-month" data-mgrq-done="1">${prevInfo.monthName}</div>` +
      `<div class="diary-peek-sub" data-mgrq-done="1">${prevInfo.canNavigate ? prevInfo.year : 'No record'}</div>`;

    nextEl.classList.toggle('is-boundary', !nextInfo.canNavigate);
    nextEl.innerHTML = `<div class="diary-peek-kicker" data-mgrq-done="1">${nextInfo.canNavigate ? 'Next ›' : 'Limit ›'}</div>` +
      `<div class="diary-peek-month" data-mgrq-done="1">${nextInfo.monthName}</div>` +
      `<div class="diary-peek-sub" data-mgrq-done="1">${nextInfo.canNavigate ? nextInfo.year : 'No record'}</div>`;
  }

  function syncScrollBoxTouchAction() {
    const sb = document.querySelector('#rptDiaryStage > .rpt-scroll-box');
    if (!sb) return;
    const scrollable = (sb.scrollWidth - sb.clientWidth) > 4;
    sb.classList.toggle('diary-h-scrollable', scrollable);
    sb.style.touchAction = scrollable ? 'pan-x pan-y' : 'pan-y pinch-zoom';
  }

  function ensureDiaryShell() {
    const host = document.getElementById('rptPreviewHost');
    if (!host) return null;
    const scrollBox = host.querySelector('.rpt-scroll-box');
    if (!scrollBox) return null;

    let shell = document.getElementById('rptDiaryShell');
    if (!shell || !host.contains(shell)) {
      shell = document.createElement('div');
      shell.id = 'rptDiaryShell';
      shell.className = 'diary-shell';

      const stackBg = document.createElement('div');
      stackBg.className = 'diary-stack-bg';
      stackBg.setAttribute('aria-hidden', 'true');

      const peekPrev = document.createElement('div');
      peekPrev.id = 'rptDiaryPeekPrev';
      peekPrev.className = 'diary-peek diary-peek-prev';
      peekPrev.setAttribute('aria-hidden', 'true');

      const peekNext = document.createElement('div');
      peekNext.id = 'rptDiaryPeekNext';
      peekNext.className = 'diary-peek diary-peek-next';
      peekNext.setAttribute('aria-hidden', 'true');

      const stage = document.createElement('div');
      stage.id = 'rptDiaryStage';
      stage.className = 'diary-page-stage';

      const curl = document.createElement('div');
      curl.id = 'rptDiaryCurl';
      curl.className = 'diary-curl-overlay';
      curl.setAttribute('aria-hidden', 'true');

      const shimmer = document.createElement('div');
      shimmer.id = 'rptDiaryShimmer';
      shimmer.className = 'diary-shimmer';
      shimmer.setAttribute('aria-hidden', 'true');

      const ringsLeft = document.createElement('div');
      ringsLeft.id = 'rptDiaryRingsLeft';
      ringsLeft.className = 'diary-rings diary-rings-left';
      ringsLeft.setAttribute('aria-hidden', 'true');

      const ringsRight = document.createElement('div');
      ringsRight.id = 'rptDiaryRingsRight';
      ringsRight.className = 'diary-rings diary-rings-right';
      ringsRight.setAttribute('aria-hidden', 'true');

      scrollBox.parentNode.insertBefore(shell, scrollBox);
      stage.appendChild(scrollBox);
      stage.appendChild(curl);
      stage.appendChild(shimmer);

      shell.appendChild(stackBg);
      shell.appendChild(peekPrev);
      shell.appendChild(peekNext);
      shell.appendChild(stage);
      shell.appendChild(ringsLeft);
      shell.appendChild(ringsRight);

      bindStageGestures(stage, shell, scrollBox, curl);
      observeStageResize(stage);
    }

    const curYm = getCurrentYm();
    const empId = getActiveEmpId();
    if (curYm && empId && window._rptCtx && window._rptCtx.emp) {
      _knownValidMonths.add(`${getActiveDept()}:${empId}:${curYm}`);
      probeAdjacentMonths(curYm, empId);
    }

    syncScrollBoxTouchAction();
    updatePeekLabels();
    renderSpiralRings(false);
    return shell;
  }

  function observeStageResize(stage) {
    if (_resizeObserver) {
      try { _resizeObserver.disconnect(); } catch (_e) {}
    }
    if (typeof ResizeObserver === 'function') {
      _resizeObserver = new ResizeObserver(() => {
        renderSpiralRings(false);
      });
      _resizeObserver.observe(stage);
    }
  }

  function applyDragTransform(stage, shell, curl, dx, width, isBoundary) {
    const reduced = prefersReducedMotion();
    const dir = dx < 0 ? 'next' : 'prev';
    shell.classList.add('is-dragging');
    shell.classList.toggle('is-dragging-next', dir === 'next');
    shell.classList.toggle('is-dragging-prev', dir === 'prev');

    const effectiveDx = isBoundary
      ? Math.sign(dx) * Math.min(64, Math.pow(Math.abs(dx), 0.72) * 2.1)
      : dx;
    const progress = Math.min(1, Math.abs(effectiveDx) / Math.max(200, width));

    if (reduced) {
      stage.style.transform = 'none';
      stage.style.opacity = String(Math.max(0.55, 1 - progress * 0.4));
      if (curl) curl.style.opacity = '0';
      return;
    }

    const rotY = Math.max(-24, Math.min(24, (effectiveDx / Math.max(240, width)) * 20));
    const scale = 1 - Math.min(0.025, progress * 0.02);
    stage.style.transformOrigin = dx < 0 ? '0% 50%' : '100% 50%';
    stage.style.transform = `translate3d(${effectiveDx.toFixed(1)}px, 0px, 0px) rotateY(${rotY.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    if (curl) {
      curl.style.opacity = String(Math.min(0.95, progress * 1.4));
    }
  }

  function resetStageSpring(stage, shell, curl, durationMs) {
    const dur = typeof durationMs === 'number' ? durationMs : 260;
    const reduced = prefersReducedMotion();
    stage.style.transition = reduced
      ? `opacity ${Math.min(180, dur)}ms linear`
      : `transform ${dur}ms cubic-bezier(0.22, 1.28, 0.36, 1), opacity ${Math.min(200, dur)}ms ease`;
    stage.style.transform = 'translate3d(0px, 0px, 0px) rotateY(0deg) scale(1)';
    stage.style.opacity = '1';
    if (curl) curl.style.opacity = '0';

    setTimeout(() => {
      shell.classList.remove('is-dragging', 'is-dragging-next', 'is-dragging-prev', 'is-turning-next', 'is-turning-prev');
      if (!_isAnimating) {
        stage.style.transition = '';
      }
    }, dur + 20);
  }

  function bounceBoundary(stage, shell, curl, delta, info) {
    if (_isAnimating) return;
    _isAnimating = true;
    const msg = (info && info.reasonMsg) || 'No data available for that month';
    if (typeof showToast === 'function') {
      showToast(msg, 'warn');
    }
    const reduced = prefersReducedMotion();
    if (!reduced && (!stage.style.transform || stage.style.transform.includes('translate3d(0px'))) {
      const nudgeX = delta > 0 ? -34 : 34;
      shell.classList.add(delta > 0 ? 'is-turning-next' : 'is-turning-prev');
      stage.style.transition = 'transform 110ms ease-out';
      stage.style.transformOrigin = delta > 0 ? '0% 50%' : '100% 50%';
      stage.style.transform = `translate3d(${nudgeX}px, 0px, 0px) rotateY(${delta > 0 ? -6 : 6}deg)`;
      setTimeout(() => {
        resetStageSpring(stage, shell, curl, 280);
        setTimeout(() => { _isAnimating = false; }, 290);
      }, 115);
    } else {
      resetStageSpring(stage, shell, curl, 300);
      setTimeout(() => { _isAnimating = false; }, 310);
    }
  }

  function commitMonthTurn(delta, startFromDrag) {
    if (_isAnimating) return false;
    const shell = document.getElementById('rptDiaryShell');
    const stage = document.getElementById('rptDiaryStage');
    const curl = document.getElementById('rptDiaryCurl');
    if (!shell || !stage) return false;

    const adj = getAdjacentMonthInfo(delta);
    if (!adj.canNavigate) {
      bounceBoundary(stage, shell, curl, delta, adj);
      return false;
    }

    _isAnimating = true;
    const prevYm = getCurrentYm();
    const empId = getActiveEmpId();
    const dept = getActiveDept();

    try {
      if (navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(8);
      }
    } catch (_e) {}

    const reduced = prefersReducedMotion();
    const width = stage.offsetWidth || 340;
    const outX = delta > 0 ? -Math.round(width * 0.92) : Math.round(width * 0.92);
    const outRot = delta > 0 ? -22 : 22;

    shell.classList.remove('is-dragging', 'is-dragging-next', 'is-dragging-prev');
    shell.classList.add(delta > 0 ? 'is-turning-next' : 'is-turning-prev');

    const outDur = startFromDrag ? 165 : 195;
    if (reduced) {
      stage.style.transition = `opacity ${outDur}ms linear`;
      stage.style.opacity = '0.15';
    } else {
      stage.style.transition = `transform ${outDur}ms cubic-bezier(0.32, 0.04, 0.68, 0.96), opacity ${outDur}ms ease`;
      stage.style.transformOrigin = delta > 0 ? '0% 50%' : '100% 50%';
      stage.style.transform = `translate3d(${outX}px, 0px, 0px) rotateY(${outRot}deg) scale(0.97)`;
      stage.style.opacity = '0.18';
      if (curl) curl.style.opacity = '0.85';
    }

    setTimeout(async () => {
      shell.classList.add('is-loading');
      if (!reduced) {
        const inX = delta > 0 ? Math.round(width * 0.32) : -Math.round(width * 0.32);
        const inRot = delta > 0 ? 10 : -10;
        stage.style.transition = 'none';
        stage.style.transformOrigin = delta > 0 ? '100% 50%' : '0% 50%';
        stage.style.transform = `translate3d(${inX}px, 0px, 0px) rotateY(${inRot}deg) scale(0.985)`;
        stage.style.opacity = '0.72';
      }

      try {
        if (typeof navigateReportMonth === 'function') {
          navigateReportMonth(delta);
        }
      } catch (_e) {}

      await waitForReportSettled(3200);

      const hasData = !!(typeof currentResult !== 'undefined' && currentResult);
      if (!hasData && empId) {
        _knownMissingMonths.add(`${dept}:${empId}:${adj.ym}`);
        if (typeof showToast === 'function') {
          showToast(`No work log data for ${adj.monthName} ${adj.year}`, 'warn');
        }
        const ySel = document.getElementById('yearSelect');
        const mSel = document.getElementById('monthSelect');
        const pm = String(prevYm).match(/^(\d{4})-(\d{2})$/);
        if (pm && ySel && mSel) {
          ySel.value = pm[1];
          mSel.value = pm[2];
          if (typeof findReport === 'function') {
            try { await findReport(); } catch (_e) {}
          }
        }
      }

      const activeShell = document.getElementById('rptDiaryShell') || shell;
      const activeStage = document.getElementById('rptDiaryStage') || stage;
      const activeCurl = document.getElementById('rptDiaryCurl') || curl;

      activeShell.classList.remove('is-loading', 'is-turning-next', 'is-turning-prev');
      requestAnimationFrame(() => {
        if (reduced) {
          activeStage.style.transition = 'opacity 180ms linear';
          activeStage.style.opacity = '1';
          activeStage.style.transform = 'none';
        } else {
          activeStage.style.transition = 'transform 240ms cubic-bezier(0.22, 1.22, 0.36, 1), opacity 180ms ease';
          activeStage.style.transform = 'translate3d(0px, 0px, 0px) rotateY(0deg) scale(1)';
          activeStage.style.opacity = '1';
        }
        if (activeCurl) activeCurl.style.opacity = '0';
        updatePeekLabels();
        renderSpiralRings(true);

        setTimeout(() => {
          activeStage.style.transition = '';
          _isAnimating = false;
        }, 250);
      });
    }, outDur);

    return true;
  }

  function waitForReportSettled(maxWaitMs) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        const elapsed = Date.now() - start;
        const spinner = document.getElementById('spinner');
        const loader = document.getElementById('ckLoader');
        const busy = (spinner && getComputedStyle(spinner).display !== 'none') ||
                     (loader && loader.style.display !== 'none' && !loader.classList.contains('ck-hide') && elapsed < 450);
        if (!busy && elapsed >= 90) {
          resolve();
        } else if (elapsed >= maxWaitMs) {
          resolve();
        } else {
          setTimeout(check, 45);
        }
      };
      setTimeout(check, 60);
    });
  }

  function canScrollBoxScrollHorizontally(scrollBox, dx) {
    if (!scrollBox) return false;
    const maxScroll = scrollBox.scrollWidth - scrollBox.clientWidth;
    if (maxScroll <= 4) return false;
    if (dx < 0 && scrollBox.scrollLeft < maxScroll - 2) return true;
    if (dx > 0 && scrollBox.scrollLeft > 2) return true;
    return false;
  }

  function bindStageGestures(stage, shell, scrollBox, curl) {
    if (stage.__diaryBound) return;
    stage.__diaryBound = true;

    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let lockMode = null; // null | 'horizontal' | 'vertical'
    let rafId = 0;
    let pendingDx = 0;
    let trackSamples = [];
    const activePointers = new Set();

    function recordSample(x) {
      const now = performance.now();
      trackSamples.push({ x, t: now });
      while (trackSamples.length > 8 && now - trackSamples[0].t > 90) {
        trackSamples.shift();
      }
    }

    function computeReleaseVelocity(releaseX) {
      const now = performance.now();
      if (!trackSamples.length) return 0;
      const last = trackSamples[trackSamples.length - 1];
      // If finger stayed still for > 48ms before release, velocity is 0 (paused hold)
      if (now - last.t > 48 && Math.abs(releaseX - last.x) < 2) {
        return 0;
      }
      let anchor = trackSamples[0];
      for (let i = trackSamples.length - 1; i >= 0; i--) {
        if (now - trackSamples[i].t <= 80) {
          anchor = trackSamples[i];
        } else {
          break;
        }
      }
      const dt = Math.max(1, now - anchor.t);
      return (releaseX - anchor.x) / dt;
    }

    function onPointerDown(e) {
      activePointers.add(e.pointerId);
      if (_isAnimating) return;
      if (activePointers.size > 1 || e.isPrimary === false) {
        cancelDrag(false);
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      const target = e.target;
      if (target && target.closest && target.closest('button, a, input, select, textarea, .mgr-q')) {
        return;
      }

      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      lockMode = null;
      pendingDx = 0;
      trackSamples = [];
      recordSample(e.clientX);
      stage.style.transition = 'none';
      updatePeekLabels();
    }

    function onPointerMove(e) {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      if (_isAnimating || activePointers.size > 1) {
        cancelDrag(false);
        return;
      }

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!lockMode) {
        const dist = Math.hypot(dx, dy);
        if (dist < DIRECTION_LOCK_PX) return;

        if (Math.abs(dy) >= Math.abs(dx) * 0.85) {
          lockMode = 'vertical';
          activePointerId = null;
          return;
        }
        if (canScrollBoxScrollHorizontally(scrollBox, dx)) {
          lockMode = 'vertical';
          activePointerId = null;
          return;
        }
        lockMode = 'horizontal';
        try {
          if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
        } catch (_e) {}
      }

      if (lockMode !== 'horizontal') return;
      if (e.cancelable) e.preventDefault();

      recordSample(e.clientX);
      pendingDx = dx;
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          if (lockMode !== 'horizontal') return;
          const w = stage.offsetWidth || 340;
          const delta = pendingDx < 0 ? 1 : -1;
          const adj = getAdjacentMonthInfo(delta);
          applyDragTransform(stage, shell, curl, pendingDx, w, !adj.canNavigate);
        });
      }
    }

    function finishDrag(e, isCancel) {
      activePointers.delete(e.pointerId);
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      const wasHorizontal = (lockMode === 'horizontal');
      const dx = e.clientX - startX;
      const vx = computeReleaseVelocity(e.clientX);

      try {
        if (stage.hasPointerCapture && stage.hasPointerCapture(e.pointerId)) {
          stage.releasePointerCapture(e.pointerId);
        }
      } catch (_e) {}

      activePointerId = null;
      lockMode = null;
      trackSamples = [];
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }

      if (!wasHorizontal) return;
      if (isCancel) {
        resetStageSpring(stage, shell, curl, 240);
        return;
      }

      const width = stage.offsetWidth || 340;
      const delta = dx < 0 ? 1 : -1;
      const adj = getAdjacentMonthInfo(delta);

      if (!adj.canNavigate) {
        if (Math.abs(dx) > 16) {
          bounceBoundary(stage, shell, curl, delta, adj);
        } else {
          resetStageSpring(stage, shell, curl, 240);
        }
        return;
      }

      const distRatio = Math.abs(dx) / Math.max(200, width);
      const fastFlick = Math.abs(vx) > COMMIT_VELOCITY_PX_MS && Math.abs(dx) > 22 && Math.sign(vx) === Math.sign(dx);

      if (distRatio > COMMIT_RATIO || fastFlick) {
        commitMonthTurn(delta, true);
      } else {
        resetStageSpring(stage, shell, curl, 260);
      }
    }

    function cancelDrag(springBack) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      activePointerId = null;
      lockMode = null;
      trackSamples = [];
      if (springBack) {
        resetStageSpring(stage, shell, curl, 240);
      }
    }

    stage.addEventListener('pointerdown', onPointerDown, { passive: true });
    stage.addEventListener('pointermove', onPointerMove, { passive: false });
    stage.addEventListener('pointerup', e => finishDrag(e, false), { passive: true });
    stage.addEventListener('pointercancel', e => finishDrag(e, true), { passive: true });
  }

  function onKeyDown(e) {
    if (_isAnimating) return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) {
      return;
    }
    const openModal = document.querySelector('.modal.open, #iccRankDrillView.open, #iccRankDrillView.active');
    if (openModal) return;

    const step7 = document.getElementById('step7');
    const host = document.getElementById('rptPreviewHost');
    if (!step7 || !host || step7.style.display === 'none' || host.style.display === 'none') return;
    const rect = step7.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    commitMonthTurn(delta, false);
  }

  function installHooks() {
    const wrapFn = (name, afterFn) => {
      const orig = window[name];
      if (typeof orig !== 'function' || orig.__diaryWrapped) return;
      const wrapped = function () {
        const res = orig.apply(this, arguments);
        try { afterFn(); } catch (_e) {}
        return res;
      };
      wrapped.__diaryWrapped = true;
      window[name] = wrapped;
    };

    wrapFn('toggleReportPreview', () => {
      ensureDiaryShell();
    });
    wrapFn('syncReportPageBanner', () => {
      ensureDiaryShell();
    });
    wrapFn('setReportZoom', () => {
      setTimeout(() => { syncScrollBoxTouchAction(); renderSpiralRings(false); }, 30);
    });
    wrapFn('toggleReportDutyFilter', () => {
      setTimeout(() => { syncScrollBoxTouchAction(); renderSpiralRings(true); }, 30);
    });

    const host = document.getElementById('rptPreviewHost');
    if (host && typeof MutationObserver === 'function' && !_mutationObserver) {
      _mutationObserver = new MutationObserver(() => {
        const sb = host.querySelector('.rpt-scroll-box');
        if (sb && !sb.closest('#rptDiaryShell')) {
          ensureDiaryShell();
        } else if (sb) {
          updatePeekLabels();
          renderSpiralRings(false);
        }
      });
      _mutationObserver.observe(host, { childList: true });
    }

    document.addEventListener('keydown', onKeyDown);
    ensureDiaryShell();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installHooks);
  } else {
    installHooks();
  }

  window.ReportDiary = {
    sync: ensureDiaryShell,
    turnMonth: delta => commitMonthTurn(delta, false),
    getAdjacentMonthInfo,
    isAnimating: () => _isAnimating
  };
})();
