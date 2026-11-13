/* ==========================================================================
   ROUTER.JS - Hash Router & Browser History Controller for RPPF PWA
   Routes: #/search, #/report, #/profile, #/vs, #/leaderboard, #/notices,
           #/more, #/team, #/history, #/settings, #/assessment
   ========================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Router = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

  const VALID_PAGES = ['search', 'report', 'profile', 'vs', 'leaderboard', 'notices', 'more', 'team', 'history', 'settings', 'assessment'];
  let _isNavigating = false;
  let _lastExitBackTs = 0;
  let _hasInitialized = false;
  let _lastHandledHash = null;
  let _isDeepLink = false;

  function parseHash(hashStr) {
    let h = String(hashStr || '').trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.startsWith('/')) h = h.slice(1);
    const qIdx = h.indexOf('?');
    const path = (qIdx >= 0 ? h.slice(0, qIdx) : h).toLowerCase().replace(/\/+$/, '');
    const queryString = qIdx >= 0 ? h.slice(qIdx + 1) : '';

    const params = {};
    if (queryString) {
      const pairs = queryString.split('&');
      for (const pair of pairs) {
        if (!pair) continue;
        const eqIdx = pair.indexOf('=');
        if (eqIdx >= 0) {
          const k = decodeURIComponent(pair.slice(0, eqIdx)).trim();
          const v = decodeURIComponent(pair.slice(eqIdx + 1)).trim();
          params[k] = v;
        } else {
          params[decodeURIComponent(pair).trim()] = '';
        }
      }
    }

    const page = VALID_PAGES.includes(path) ? path : 'search';
    return { page, rawPath: path, params };
  }

  function getHashForPage(pageName, params) {
    const p = VALID_PAGES.includes(pageName) ? pageName : 'search';
    if (p === 'report') {
      const id = (params && params.id) || (typeof currentSearchId !== 'undefined' ? currentSearchId : '');
      const month = (params && params.month) || (typeof currentMonth !== 'undefined' ? currentMonth : '');
      if (id && month) {
        return `#/report?id=${encodeURIComponent(id)}&month=${encodeURIComponent(month)}`;
      }
      if (id) {
        return `#/report?id=${encodeURIComponent(id)}`;
      }
      return '#/report';
    }
    if (p === 'profile') {
      const q = [];
      if (params && params.id) q.push(`id=${encodeURIComponent(params.id)}`);
      if (params && params.scope) q.push(`scope=${encodeURIComponent(params.scope)}`);
      if (params && params.month) q.push(`month=${encodeURIComponent(params.month)}`);
      return q.length > 0 ? `#/profile?${q.join('&')}` : '#/profile';
    }
    return `#/${p}`;
  }

  function updateHashUrl(targetHash, replace = false) {
    if (typeof window === 'undefined' || !window.location) return;
    if (window.location.hash === targetHash) return;
    _isNavigating = true;
    _lastHandledHash = targetHash;
    try {
      if (replace && window.history && window.history.replaceState) {
        window.history.replaceState({ renataApp: true, hash: targetHash }, '', targetHash);
      } else if (window.history && window.history.pushState) {
        window.history.pushState({ renataApp: true, hash: targetHash }, '', targetHash);
      } else {
        window.location.hash = targetHash;
      }
    } catch (e) {
      try { window.location.hash = targetHash; } catch (err) {}
    }
    setTimeout(() => { _isNavigating = false; }, 60);
  }

  async function activateRoute(routeObj) {
    const { page, params } = routeObj;

    // Handle modals / drill-downs if any were open
    closeAnyOpenModal();

    if (page === 'profile') {
      if (typeof window !== 'undefined') {
        window._profileRouteParams = params || {};
      }
      if (typeof switchPage === 'function') {
        switchPage('profile', true, true);
      }
      return;
    }

    if (page === 'report') {
      if (params && params.id) { _isDeepLink = true; }
      if (params && params.id) {
        const targetId = params.id.toUpperCase().replace(/\s+/g, '');
        const targetMonth = params.month || '';

        const empInput = document.getElementById('employeeId');
        if (empInput) {
          empInput.value = targetId;
          if (typeof toggleClearIdBtn === 'function') toggleClearIdBtn();
        }
        if (targetMonth && /^\d{4}-\d{2}$/.test(targetMonth)) {
          const [y, m] = targetMonth.split('-');
          const ySel = document.getElementById('yearSelect');
          const mSel = document.getElementById('monthSelect');
          if (ySel) {
            if (![...ySel.options].some(o => o.value === y)) {
              const opt = document.createElement('option');
              opt.value = y;
              opt.textContent = typeof bn === 'function' ? bn(y) : y;
              ySel.appendChild(opt);
            }
            ySel.value = y;
          }
          if (mSel) mSel.value = m;
        }

        // If data is already loaded for this employee and month, switch directly
        const alreadyLoaded = (typeof currentResult !== 'undefined' && currentResult) &&
                              (typeof currentSearchId !== 'undefined' && currentSearchId === targetId) &&
                              (!targetMonth || (typeof currentMonth !== 'undefined' && currentMonth === targetMonth));
        if (!alreadyLoaded && typeof findReport === 'function') {
          try {
            await findReport();
          } catch (e) {
            console.error('Router findReport error:', e);
          }
        }

        if (typeof currentResult !== 'undefined' && currentResult) {
          if (typeof switchPage === 'function') {
            switchPage('report', true, true);
            setTimeout(closeAnyOpenModal, 400);
          }
        } else {
          // If blocked by access control (e.g. isExecHiddenFor) or ID error, keep on search page to show error
          if (typeof switchPage === 'function') {
            switchPage('search', true, true);
          }
          if (typeof showToast === 'function') {
            const st = document.getElementById('status');
            const msg = st && st.innerText ? st.innerText.split('\n')[0] : '';
            if (msg) showToast(msg, 'warn');
          }
        }
        return;
      }

      if (typeof switchPage === 'function') {
        switchPage('report', true, true);
      }
      return;
    }

    if (typeof switchPage === 'function') {
      switchPage(page, true, true);
    }
  }

  function closeAnyOpenModal() {
    if (document.getElementById('iccContextModal')?.classList.contains('open')) {
      if (typeof closeIccContextModal === 'function') closeIccContextModal();
      return true;
    }
    const openModals = [
      'adminCatAuthModal', 'empAdminCatModal', 'lbFullListModal',
      'rateChartModal', 'modeSetupModal', 'erpSupportModal',
      'confirmActionModal', 'complianceModal', 'welcomeBackModal', 'iccContextModal'
    ];
    for (const mId of openModals) {
      const el = document.getElementById(mId);
      if (el && el.classList.contains('open')) {
        el.classList.remove('open');
      }
    }
    if (typeof iccDrillOpen !== 'undefined' && iccDrillOpen && typeof closeRankDrillDown === 'function') {
      closeRankDrillDown();
    }
  }

  function onPageSwitched(pageName) {
    if (_isNavigating || typeof window === 'undefined' || !window.location) return;
    const targetHash = getHashForPage(pageName);
    updateHashUrl(targetHash, false);
  }

  function onSideDrawerClosed() {
    if (_isNavigating || typeof window === 'undefined' || !window.location) return;
    const permPage = typeof currentPermanentPage !== 'undefined' ? currentPermanentPage : 'search';
    const targetHash = getHashForPage(permPage);
    updateHashUrl(targetHash, false);
  }

  function updateReportUrl(id, month) {
    if (typeof window === 'undefined' || !window.location) return;
    const targetHash = getHashForPage('report', { id, month });
    updateHashUrl(targetHash, true);
  }

  function onLocationChange() {
    if (_isNavigating) return;
    const curHash = window.location.hash;
    if (curHash === _lastHandledHash) return;
    _lastHandledHash = curHash;
    const parsed = parseHash(curHash);
    activateRoute(parsed);
  }

  function init() {
    if (_hasInitialized || typeof window === 'undefined') return;
    _hasInitialized = true;

    // Check if initial hash exists
    const rawHash = window.location.hash;
    const initialRoute = parseHash(rawHash);
    _lastHandledHash = getHashForPage(initialRoute.page, initialRoute.params);

    // Setup base sentinel for back button double-press exit guard
    try {
      history.replaceState({ renataApp: true, isSentinel: true }, '');
      history.pushState({ renataApp: true, route: initialRoute.page }, '', _lastHandledHash);
    } catch (e) {}

    // Listen for hashchange and popstate
    window.addEventListener('hashchange', onLocationChange);

    window.addEventListener('popstate', (e) => {
      // If modal or drill down was open, close it
      const openModalEl = document.querySelector('.modal.open, #iccRankDrillView.open');
      if (openModalEl) {
        closeAnyOpenModal();
        try {
          const curRoute = parseHash(window.location.hash);
          history.pushState({ renataApp: true, route: curRoute.page }, '', getHashForPage(curRoute.page, curRoute.params));
        } catch (err) {}
        return;
      }

      // Check if user hit sentinel entry (pressing back from root page / search)
      if (e.state && e.state.isSentinel) {
        const curRoute = parseHash(window.location.hash);
        if (curRoute.page === 'search') {
          const now = Date.now();
          if (now - _lastExitBackTs > 2200) {
            _lastExitBackTs = now;
            if (typeof showToast === 'function') {
              showToast('Press back again to exit', 'info');
            }
            try {
              history.pushState({ renataApp: true, route: 'search' }, '', '#/search');
            } catch (err) {}
          } else {
            // Second back press within 2.2s: allow browser to exit
            history.back();
          }
          return;
        } else {
          // If sentinel was reached from a subpage, redirect smoothly to search
          if (typeof switchPage === 'function') {
            switchPage('search', true);
          }
          return;
        }
      }

      onLocationChange();
    });

    // Activate the initial route
    activateRoute(initialRoute);
  }

  return {
    parseHash,
    getHashForPage,
    activateRoute,
    onPageSwitched,
    onSideDrawerClosed,
    updateReportUrl,
    isDeepLink: () => _isDeepLink,
    init
  };
});
