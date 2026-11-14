/* ==========================================================================
   PROFILE.JS (PAGE) - Employee Profile ("Me") Controller & Renderer
   Implements Option A (per-employee JSON) + Option B (progressive month fallback),
   Scope Switcher, Amount Masking, and Sections A, B, C, D, E, F, G, H, I.
   ========================================================================== */

(function (root) {
  'use strict';

  const _profileMemCache = {};
  let _profileActiveScope = 'year'; // 'this_month' | 'last_month' | 'year' | 'YYYY-MM'
  let _profileViewingOtherId = '';  // non-empty when viewing a colleague's profile
  let _profileColleagueBarOpen = false;
  let _profileLoadingState = { loading: false, done: 0, total: 0, text: '' };
  let _profileLastData = null;

  function _nsKey(suffix) {
    const ns = (typeof STORAGE_NAMESPACE !== 'undefined' && STORAGE_NAMESPACE) ? STORAGE_NAMESPACE : '';
    return ns + suffix;
  }

  function isProfileAmountsHidden() {
    try {
      return localStorage.getItem(_nsKey('renata_profile_hide_amt_v1')) === '1';
    } catch (e) {
      return false;
    }
  }

  function toggleProfileHideAmounts() {
    const next = !isProfileAmountsHidden();
    try {
      localStorage.setItem(_nsKey('renata_profile_hide_amt_v1'), next ? '1' : '0');
    } catch (e) {}
    const rootEl = document.querySelector('#profileRoot .prof-root');
    if (rootEl) rootEl.classList.toggle('hide-amounts', next);
    document.querySelectorAll('.prof-hide-toggle-lbl').forEach(el => {
      el.textContent = next ? '👁 Show Taka' : '🙈 Hide Taka';
    });
    document.querySelectorAll('.prof-money-val').forEach(el => {
      const raw = el.getAttribute('data-bdt') || '৳ 0';
      el.textContent = next ? '৳ ••••' : raw;
    });
  }

  function fmtBdt(amount, decimals = 0) {
    const n = Number(amount || 0);
    const formatted = n.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    return `৳ ${formatted}`;
  }

  function moneySpan(amount, decimals = 0) {
    const full = fmtBdt(amount, decimals);
    const hidden = isProfileAmountsHidden();
    return `<span class="prof-money prof-money-val" data-bdt="${esc(full)}">${hidden ? '৳ ••••' : esc(full)}</span>`;
  }

  function fmtHrs(h) {
    const n = Number(h || 0);
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  }

  function getAvatarInitials(name, id) {
    const clean = String(name || '').replace(/^(Mr\.?|Mrs\.?|Ms\.?|Mst\.?|Md\.?|Dr\.?)\s+/i, '').trim();
    if (!clean) return String(id || 'ME').slice(0, 2).toUpperCase();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }

  function getTargetProfileId() {
    if (_profileViewingOtherId) return _profileViewingOtherId;
    const saved = typeof getPreferredId === 'function' ? getPreferredId() : '';
    return String(saved || '').trim().toUpperCase();
  }

  function _computeSecStatsFromList(list, targetEmp) {
    if (!Array.isArray(list) || !targetEmp) return null;
    const area = String(targetEmp.area || '').trim();
    if (!area) return null;
    const peers = list.filter(x => x && String(x.area || '').trim() === area);
    if (peers.length < 2) return null;
    const headcount = peers.length;
    const sumOt = peers.reduce((a, b) => a + (Number(b.otHours) || 0), 0);
    const sumDuty = peers.reduce((a, b) => a + (Number(b.totalDuty) || 0), 0);
    const myOt = Number(targetEmp.otHours) || 0;
    const myDuty = Number(targetEmp.totalDuty) || 0;
    const myEarned = Number(targetEmp.totalEarned) || 0;
    const otRank = 1 + peers.filter(x => (Number(x.otHours) || 0) > myOt).length;
    const dutyRank = 1 + peers.filter(x => (Number(x.totalDuty) || 0) > myDuty).length;
    const earnedRank = 1 + peers.filter(x => (Number(x.totalEarned) || 0) > myEarned).length;
    return {
      area,
      headcount,
      avgOt: Math.round((sumOt / headcount) * 10) / 10,
      avgDuty: Math.round((sumDuty / headcount) * 10) / 10,
      otRank,
      dutyRank,
      earnedRank
    };
  }

  function _normalizeEmpRecord(rec, dept, ym) {
    if (!rec) return null;
    const u = String(rec.id || '').toUpperCase().trim();
    const ID_ALIASES = { 'CL6515': '556515', '556515': 'CL6515', 'CL6531': '556531', '556531': 'CL6531' };
    const cleanId = ID_ALIASES[u] || u;
    const d = (typeof AREA_DETAILS !== 'undefined' && AREA_DETAILS && (AREA_DETAILS[u] || AREA_DETAILS[cleanId])) || (typeof getEmpMeta === 'function' ? { s: getEmpMeta(u).sub } : {});
    const subVal = rec.sub || rec.subsection || d.s || '';
    const mappedArea = (typeof AREA_MAP !== 'undefined' && AREA_MAP) ? (AREA_MAP[u] || AREA_MAP[cleanId]) : null;
    const fallbackArea = dept === 'QA' ? 'Quality Assurance' : ((rec.isRppf !== false) ? (typeof getAreaForId === 'function' ? getAreaForId(u, true) : (rec.area || 'Packing Hall')) : (rec.area || 'Other facility'));
    const copy = {
      ...rec,
      id: u,
      dept: rec.dept || dept,
      month: ym || rec.month || '',
      isRppf: rec.isRppf !== false,
      area: mappedArea || rec.area || fallbackArea,
      sub: subVal,
      subsection: subVal
    };
    if (copy.totalEarned == null && typeof applyTypeOverride === 'function') {
      applyTypeOverride(copy);
    }
    return copy;
  }

  function _readCachedMonthExtract(dept, empId, ym) {
    try {
      const raw = localStorage.getItem(_nsKey(`renata_emp_m_v1_${dept}_${empId}_${ym}`));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function _writeCachedMonthExtract(dept, empId, ym, extractObj) {
    try {
      localStorage.setItem(_nsKey(`renata_emp_m_v1_${dept}_${empId}_${ym}`), JSON.stringify(extractObj));
    } catch (e) {}
  }

  /**
   * Fetch all monthly records for one employee using:
   * 1. Current/selected month first via fetchMonthPreIndexedData (instant render)
   * 2. Option A: data/emp/<DEPT>/<ID>.json (~15-30 KB for all 12 months)
   * 3. Option B fallback: progressive month-by-month fetch with localStorage per-employee cache
   */
  async function fetchEmployeeProfileHistory(empId, dept, onPartialUpdate) {
    const cleanId = String(empId || '').trim().toUpperCase();
    const resolvedId = (typeof resolveEmpAliasId === 'function') ? resolveEmpAliasId(cleanId) : cleanId;
    const cacheKey = `${dept}_${cleanId}`;

    if (typeof loadAreaMap === 'function') {
      try { await loadAreaMap(); } catch (e) {}
    }
    if (typeof loadAbsentStore === 'function') {
      try { loadAbsentStore(false); } catch (e) {}
    }

    const latestYm = (typeof currentMonth !== 'undefined' && currentMonth)
      || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '2026-11')
      || '2026-11';

    // Step 1: Check if current/latest month is already in memory cache for instant first paint
    const monthRecordsMap = {};
    const datasetMetaByMonth = {};
    const sectionStatsByMonth = {};

    if (typeof monthIndexMemoryCache !== 'undefined' && Array.isArray(monthIndexMemoryCache[latestYm])) {
      const list = monthIndexMemoryCache[latestYm];
      const hit = list.find(x => {
        const xid = String(x && x.id || '').toUpperCase();
        return xid === cleanId || xid === resolvedId;
      });
      if (hit) {
        monthRecordsMap[latestYm] = _normalizeEmpRecord(hit, dept, latestYm);
        if (typeof getMonthDatasetMeta === 'function') {
          datasetMetaByMonth[latestYm] = getMonthDatasetMeta(latestYm);
        }
        if (typeof onPartialUpdate === 'function') {
          onPartialUpdate({ monthRecordsMap, datasetMetaByMonth, sectionStatsByMonth, isPartial: true });
        }
      }
    }

    // Step 2: Return in-memory full history if already loaded in this session
    if (_profileMemCache[cacheKey]) {
      return _profileMemCache[cacheKey];
    }

    // Step 3: Option A — Fetch compact per-employee history file data/emp/<DEPT>/<ID>.json
    const candidateIds = [...new Set([cleanId, resolvedId])];
    for (const cid of candidateIds) {
      try {
        const path = `data/emp/${dept}/${cid}.json`;
        const hist = (typeof fetchJsonResource === 'function')
          ? await fetchJsonResource(path, 8000)
          : await fetch(path, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });

        if (hist && hist.months && typeof hist.months === 'object') {
          const dsMeta = hist.datasetMeta || hist.meta || {};
          Object.keys(dsMeta).forEach(ym => {
            datasetMetaByMonth[ym] = {
              maxActiveDay: dsMeta[ym].maxActiveDay || 31,
              consensusHolidays: new Set(Array.isArray(dsMeta[ym].consensusHolidays) ? dsMeta[ym].consensusHolidays : [])
            };
          });
          Object.keys(hist.months).forEach(ym => {
            const rawM = hist.months[ym];
            if (rawM && rawM._prevMonthLastNight == null && dsMeta[ym] && dsMeta[ym].prevNight != null) {
              rawM._prevMonthLastNight = Boolean(dsMeta[ym].prevNight);
            }
            const norm = _normalizeEmpRecord(rawM, dept, ym);
            monthRecordsMap[ym] = norm;
            if (norm && norm._sectionStats) {
              sectionStatsByMonth[ym] = norm._sectionStats;
            } else if (norm && typeof monthIndexMemoryCache !== 'undefined' && Array.isArray(monthIndexMemoryCache[ym])) {
              const dynStats = _computeSecStatsFromList(monthIndexMemoryCache[ym], norm);
              if (dynStats) sectionStatsByMonth[ym] = dynStats;
            } else if (norm && ym === latestYm && typeof employees !== 'undefined' && Array.isArray(employees) && employees.length > 0) {
              const dynStats = _computeSecStatsFromList(employees, norm);
              if (dynStats) sectionStatsByMonth[ym] = dynStats;
            }
          });
          const result = {
            empId: cleanId,
            dept,
            latestMonth: hist.latestMonth || latestYm,
            monthRecordsMap,
            datasetMetaByMonth,
            sectionStatsByMonth,
            source: 'optionA'
          };
          _profileMemCache[cacheKey] = result;
          try {
            localStorage.setItem(_nsKey(`renata_emp_prof_v1_${cacheKey}`), JSON.stringify({
              ts: Date.now(),
              latestMonth: result.latestMonth,
              datasetMeta: dsMeta,
              months: hist.months
            }));
          } catch (e) {}
          return result;
        }
      } catch (errOptA) {
        // Check localStorage cached Option A payload before falling back to Option B
        try {
          const cachedRaw = localStorage.getItem(_nsKey(`renata_emp_prof_v1_${cacheKey}`));
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (cached && cached.months) {
              const dsMeta = cached.datasetMeta || {};
              Object.keys(dsMeta).forEach(ym => {
                datasetMetaByMonth[ym] = {
                  maxActiveDay: dsMeta[ym].maxActiveDay || 31,
                  consensusHolidays: new Set(Array.isArray(dsMeta[ym].consensusHolidays) ? dsMeta[ym].consensusHolidays : [])
                };
              });
              Object.keys(cached.months).forEach(ym => {
                const norm = _normalizeEmpRecord(cached.months[ym], dept, ym);
                monthRecordsMap[ym] = norm;
                if (norm && norm._sectionStats) sectionStatsByMonth[ym] = norm._sectionStats;
              });
              const result = {
                empId: cleanId,
                dept,
                latestMonth: cached.latestMonth || latestYm,
                monthRecordsMap,
                datasetMetaByMonth,
                sectionStatsByMonth,
                source: 'optionA-cache'
              };
              _profileMemCache[cacheKey] = result;
              return result;
            }
          }
        } catch (e2) {}
      }
    }

    // Step 4: Option B Fallback — Progressive loading of monthly JSON files newest-first
    const monthsToLoad = dept === 'QA'
      ? ['2026-11']
      : ['2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12'];

    const totalM = monthsToLoad.length;
    for (let i = 0; i < totalM; i++) {
      const ym = monthsToLoad[i];
      const isClosedMonth = (ym < latestYm);
      _profileLoadingState = {
        loading: true,
        done: i + 1,
        total: totalM,
        text: `Loading ${i + 1}/${totalM} months (${ym})…`
      };

      // Closed months are immutable: use localStorage per-employee extract if cached
      if (isClosedMonth) {
        const cachedExt = _readCachedMonthExtract(dept, cleanId, ym);
        if (cachedExt) {
          if (cachedExt.emp) {
            monthRecordsMap[ym] = _normalizeEmpRecord(cachedExt.emp, dept, ym);
          }
          if (cachedExt.dsMeta) {
            datasetMetaByMonth[ym] = {
              maxActiveDay: cachedExt.dsMeta.maxActiveDay || 31,
              consensusHolidays: new Set(cachedExt.dsMeta.consensusHolidays || [])
            };
          }
          if (cachedExt.sectionStats) {
            sectionStatsByMonth[ym] = cachedExt.sectionStats;
          }
          continue;
        }
      }

      try {
        const list = (typeof fetchMonthPreIndexedData === 'function')
          ? await fetchMonthPreIndexedData(ym, false, false)
          : null;
        if (Array.isArray(list) && list.length > 0) {
          const ds = (typeof getMonthDatasetMeta === 'function')
            ? getMonthDatasetMeta(ym)
            : (window.AttendanceCalc ? window.AttendanceCalc.computeDatasetMetaFromEmployees(list) : { maxActiveDay: 31, consensusHolidays: new Set() });
          datasetMetaByMonth[ym] = ds;

          const found = list.find(x => {
            const xid = String(x && x.id || '').toUpperCase();
            return xid === cleanId || xid === resolvedId;
          });
          if (found) {
            const norm = _normalizeEmpRecord(found, dept, ym);
            monthRecordsMap[ym] = norm;
            _writeCachedMonthExtract(dept, cleanId, ym, {
              ym,
              emp: norm,
              dsMeta: {
                maxActiveDay: ds.maxActiveDay || 31,
                consensusHolidays: Array.from(ds.consensusHolidays || [])
              }
            });
          } else if (isClosedMonth) {
            _writeCachedMonthExtract(dept, cleanId, ym, {
              ym,
              emp: null,
              dsMeta: {
                maxActiveDay: ds.maxActiveDay || 31,
                consensusHolidays: Array.from(ds.consensusHolidays || [])
              }
            });
          }
        }
      } catch (e) {}

      if (typeof onPartialUpdate === 'function' && (i === 0 || i % 3 === 0 || i === totalM - 1)) {
        onPartialUpdate({ monthRecordsMap, datasetMetaByMonth, sectionStatsByMonth, isPartial: i < totalM - 1 });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    _profileLoadingState = { loading: false, done: totalM, total: totalM, text: '' };
    const result = {
      empId: cleanId,
      dept,
      latestMonth: latestYm,
      monthRecordsMap,
      datasetMetaByMonth,
      sectionStatsByMonth,
      source: 'optionB'
    };
    _profileMemCache[cacheKey] = result;
    return result;
  }

  /* ==========================================================================
     UI RENDERING: Empty State, Header, and Sections A, B, C (Part 4)
     ========================================================================== */

  function renderProfileEmptyState(customErrorMsg, attemptedId) {
    const rootEl = document.getElementById('profileRoot');
    if (!rootEl) return;
    rootEl.innerHTML = `
      <div class="prof-empty-card">
        <div class="prof-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <h3 class="prof-empty-title">${customErrorMsg ? 'Employee ID Not Found' : 'Set Your Employee ID (আপনার আইডি দিন)'}</h3>
        <p class="prof-empty-desc">
          ${customErrorMsg
            ? esc(customErrorMsg)
            : 'Save your RPPF Employee ID once to see your yearly &amp; monthly overtime, attendance %, night/holiday duties, average punch times, and payroll requisition status.'}
        </p>
        <div class="prof-empty-form">
          <input type="text" id="profileEmptyIdInput" class="prof-empty-input" value="${esc(attemptedId || '')}" placeholder="e.g. 556490, CF8355, RF20850" autocomplete="off" autocapitalize="characters" inputmode="text" onkeydown="if(event.key==='Enter')saveProfileEmptyStateId()">
          <button type="button" class="btn-primary" style="margin:0;min-height:46px;" onclick="saveProfileEmptyStateId()">Save &amp; open my profile</button>
          <button type="button" class="btn-secondary" style="margin:0;min-height:44px;" onclick="openModeSetupModal('employee')">Open Mode &amp; Department Setup</button>
        </div>
      </div>
    `;
  }

  async function saveProfileEmptyStateId() {
    const inp = document.getElementById('profileEmptyIdInput');
    const raw = String(inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) {
      if (typeof showToast === 'function') showToast('Please enter your Employee ID number', 'warn');
      inp?.focus();
      return;
    }
    if (typeof loadAreaMap === 'function') {
      try { await loadAreaMap(); } catch (e) {}
    }
    const detectedDept = (typeof getDeptForEmployeeId === 'function' && getDeptForEmployeeId(raw)) || (typeof getClientDepartment === 'function' ? getClientDepartment() : 'PR');
    if (typeof setClientDepartment === 'function') setClientDepartment(detectedDept);

    const spec = typeof getSpecialRoleSpec === 'function' ? getSpecialRoleSpec(raw) : null;
    if (spec && !spec.allowNormalBypass) {
      if (typeof openModeSetupModal === 'function') openModeSetupModal('employee');
      const regInp = document.getElementById('regEmpIdInput');
      if (regInp) {
        regInp.value = raw;
        if (typeof onRegEmpIdInputChange === 'function') onRegEmpIdInputChange();
      }
      return;
    }

    _profileViewingOtherId = '';
    if (typeof setPreferredId === 'function') setPreferredId(raw);
    if (typeof setAppMode === 'function' && getAppMode() !== 'incharge') setAppMode('employee');
    if (typeof updateModeUI === 'function') updateModeUI();
    if (typeof showToast === 'function') showToast(`Saved ID: ${raw}`, 'success');
    const empInput = document.getElementById('employeeId');
    if (empInput) {
      empInput.value = raw;
      if (typeof toggleClearIdBtn === 'function') toggleClearIdBtn();
    }
    initProfilePage(true);
  }

  function toggleProfileColleagueBar() {
    _profileColleagueBarOpen = !_profileColleagueBarOpen;
    const bar = document.getElementById('profileColleagueBar');
    if (bar) {
      bar.classList.toggle('open', _profileColleagueBarOpen);
      if (_profileColleagueBarOpen) {
        setTimeout(() => document.getElementById('profileColleagueInput')?.focus(), 60);
      }
    }
  }

  function viewAnotherEmployeeProfile(rawId) {
    const id = String(rawId != null ? rawId : (document.getElementById('profileColleagueInput')?.value || '')).trim().toUpperCase().replace(/\s+/g, '');
    if (!id) {
      if (typeof showToast === 'function') showToast('Enter an employee ID to view', 'warn');
      return;
    }
    const myId = typeof getPreferredId === 'function' ? getPreferredId() : '';
    _profileViewingOtherId = (id === myId) ? '' : id;
    _profileColleagueBarOpen = false;
    initProfilePage(true);
  }

  function resetToMyOwnProfile() {
    _profileViewingOtherId = '';
    _profileColleagueBarOpen = false;
    initProfilePage(true);
  }

  function switchProfileScope(newScope) {
    if (!newScope) return;
    _profileActiveScope = newScope;
    if (_profileLastData) {
      renderProfileContent(_profileLastData);
    } else {
      initProfilePage(false);
    }
  }

  function renderSectionA_Hero(agg, emp, isYearScope) {
    const s = agg.scopeSummary;
    const hideAmt = isProfileAmountsHidden();
    const scopeBadgeText = agg.scopeType === 'year'
      ? `This Year (${agg.targetYear}) • ${s.activeMonthsCount} Months`
      : `${agg.scopeLabel}${agg.activeMonthSummary?.isSoFar ? ' (So Far)' : ''}`;

    const presentTxt = s.avgPresentPct != null ? `${s.avgPresentPct}%` : '—';
    const leaveCardHtml = s.totalLeaveDays > 0
      ? `<div class="prof-hero-stat">
           <div class="prof-hero-stat-v" style="color:#93C5FD;">${s.totalLeaveDays}d</div>
           <div class="prof-hero-stat-l">Approved Leave</div>
         </div>`
      : `<div class="prof-hero-stat">
           <div class="prof-hero-stat-v">${s.totalLeaveDays}d</div>
           <div class="prof-hero-stat-l">Leave Days</div>
         </div>`;

    return `
      <section class="prof-hero-card" id="profSecA" aria-label="Year at a glance">
        <div class="prof-hero-top">
          <span class="prof-hero-badge">📊 ${esc(scopeBadgeText)}</span>
          <button type="button" class="prof-hide-btn" onclick="toggleProfileHideAmounts()" aria-label="Toggle hide amounts">
            <span class="prof-hide-toggle-lbl">${hideAmt ? '👁 Show Taka' : '🙈 Hide Taka'}</span>
          </button>
        </div>
        <div class="prof-hero-main-row">
          <div class="prof-hero-big-box">
            <div class="prof-hero-lbl">Total OT Income</div>
            <div class="prof-hero-val gold">${moneySpan(s.totalEarned)}</div>
            <div class="prof-hero-sub">Avg ${moneySpan(s.avgMonthlyEarned)} / month</div>
          </div>
          <div class="prof-hero-big-box">
            <div class="prof-hero-lbl">Total OT Hours</div>
            <div class="prof-hero-val">${fmtHrs(s.totalOtHours)} <small style="font-size:13px;font-weight:700;">hrs</small></div>
            <div class="prof-hero-sub">${s.totalOtDays} OT days • ${fmtHrs(s.totalDuty)}h duty</div>
          </div>
        </div>
        <div class="prof-hero-grid">
          <div class="prof-hero-stat">
            <div class="prof-hero-stat-v" style="color:#4ADE80;">${presentTxt}</div>
            <div class="prof-hero-stat-l">Avg Present %</div>
          </div>
          <div class="prof-hero-stat">
            <div class="prof-hero-stat-v" style="color:#C4B5FD;">${s.totalNightDuties}</div>
            <div class="prof-hero-stat-l">Night Duties</div>
          </div>
          <div class="prof-hero-stat">
            <div class="prof-hero-stat-v" style="color:#FDE047;">${s.totalHolidayDuties}</div>
            <div class="prof-hero-stat-l">Holiday Duties</div>
          </div>
          ${leaveCardHtml}
          <div class="prof-hero-stat">
            <div class="prof-hero-stat-v" style="color:${s.totalAbsentDays > 0 ? '#FCA5A5' : '#4ADE80'};">${s.totalAbsentDays}d</div>
            <div class="prof-hero-stat-l">Absent Days</div>
          </div>
          <div class="prof-hero-stat">
            <div class="prof-hero-stat-v">${s.totalPresentDays}d</div>
            <div class="prof-hero-stat-l">Days Worked</div>
          </div>
        </div>
      </section>
    `;
  }

  function renderSectionB_Attendance(agg) {
    const sc = agg.scopeSummary;
    const rowsHtml = agg.yearMonthSummaries.map(ms => {
      const isSelected = (agg.scopeType !== 'year' && agg.activeSingleYm === ms.ym);
      if (!ms.exists) {
        return `
          <div class="prof-heat-row" style="opacity:0.62;" onclick="switchProfileScope('${esc(ms.ym)}')">
            <div class="prof-heat-month">${esc(ms.monthName)}</div>
            <div class="prof-heat-bar-track"><div class="prof-heat-bar-fill" style="width:0%;"></div></div>
            <div class="prof-heat-pct">—</div>
            <div class="prof-heat-meta">Not in file</div>
          </div>
        `;
      }
      const pct = ms.presentPct != null ? ms.presentPct : 0;
      const barColor = pct >= 95 ? 'var(--success)' : pct >= 85 ? 'var(--brand)' : pct >= 70 ? 'var(--warning)' : 'var(--danger)';
      const metaParts = [];
      if (ms.approvedLeaveCount > 0) metaParts.push(`Lv ${ms.approvedLeaveCount}d`);
      metaParts.push(`Abs ${ms.generalAbsentCount}d`);

      return `
        <div class="prof-heat-row ${isSelected ? 'active-row' : ''}" onclick="switchProfileScope('${esc(ms.ym)}')" title="Tap to view ${esc(ms.fullLabel)}">
          <div class="prof-heat-month">
            ${esc(ms.monthName)}
            ${ms.isSoFar ? '<small>so far</small>' : ''}
          </div>
          <div class="prof-heat-bar-track" aria-hidden="true">
            <div class="prof-heat-bar-fill" style="width:${Math.min(100, Math.max(0, pct))}%;background:${barColor};"></div>
          </div>
          <div class="prof-heat-pct">${ms.presentPct != null ? ms.presentPct + '%' : '—'}</div>
          <div class="prof-heat-meta" style="color:${ms.generalAbsentCount > 0 ? 'var(--danger)' : 'var(--muted)'};">${esc(metaParts.join(' · '))}</div>
        </div>
      `;
    }).join('');

    const approvedLeaveBanner = sc.totalLeaveDays > 0
      ? `<div style="margin-bottom:10px;padding:9px 12px;border-radius:10px;background:var(--brand-soft);border:1px solid var(--brand-soft-border);font-size:12px;color:var(--brand-text);font-weight:700;">
           🏥 Approved long leave (${esc(sc.leaveCategory || 'Long-Term Leave')}): <b>${sc.totalLeaveDays} working days</b> in selected scope (shown separately from Absent).
         </div>`
      : '';

    const absentDatesNote = (agg.scopeType !== 'year' && sc.absentDaysList.length > 0)
      ? `<div style="margin-bottom:10px;padding:8px 10px;border-radius:8px;background:var(--danger-bg);border:1px solid var(--danger-border);color:var(--danger);font-size:11.5px;font-weight:700;">
           🔴 Absent dates (${sc.absentDaysList.length}d): ${esc(sc.absentDaysList.map(x => x.date).join(', '))}
         </div>`
      : '';

    return `
      <section class="prof-card" id="profSecB" aria-label="Attendance — Leave and Absent">
        <div class="prof-card-head">
          <div>
            <h3 class="prof-card-title">B. Attendance — Leave / Absent (উপস্থিতি)</h3>
            <p class="prof-card-sub">Same calculation as Daily Report • Tap any month to inspect</p>
          </div>
          <span class="prof-tag ${sc.totalAbsentDays === 0 ? 'success' : ''}">${sc.avgPresentPct != null ? sc.avgPresentPct + '% Present' : '—'}</span>
        </div>

        <div class="prof-att-kpis">
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:var(--success);">${sc.avgPresentPct != null ? sc.avgPresentPct + '%' : '—'}</div>
            <div class="prof-kpi-l">Present % (${sc.presentOnScheduledDays}/${sc.scheduledWorkingDays}d)</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:${sc.totalAbsentDays > 0 ? 'var(--danger)' : 'var(--success)'};">${sc.totalAbsentDays}d</div>
            <div class="prof-kpi-l">General Absent</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:${sc.totalLeaveDays > 0 ? 'var(--brand-text)' : 'var(--muted)'};">${sc.totalLeaveDays > 0 ? sc.totalLeaveDays + 'd' : '0d'}</div>
            <div class="prof-kpi-l">Approved Long Leave</div>
          </div>
        </div>

        ${approvedLeaveBanner}
        ${absentDatesNote}

        <details class="prof-tooltip-details">
          <summary>ℹ️ How is Present % calculated? (কীভাবে হিসাব হয়?)</summary>
          <div class="prof-tooltip-body">
            <b>Formula:</b> <code>present days on scheduled working days ÷ scheduled working days</code>.<br>
            • <b>Scheduled working days</b> = closed general working days (<code>rptIsDayClosed</code>), excluding Thu/Fri weekly off, plant/govt holidays, and post-night rest days.<br>
            • <b>Approved long leave</b> (e.g. 6-month Maternity Leave in <code>absent.json</code>) counts as not present (lowering the %) and is shown separately from plain absence.<br>
            • Any working day without a punch (and not on approved long leave) is counted as <b>Absent</b>. Months before joining show <b>"—"</b>, never 0%.
          </div>
        </details>

        <div class="prof-heat-list">
          ${rowsHtml}
        </div>
      </section>
    `;
  }

  function renderSectionC_Income(agg) {
    const inc = agg.monthlyIncome;
    const hideAmt = isProfileAmountsHidden();
    const mom = inc.changeVsLastMonth;
    let momHtml = '—';
    if (mom && mom.diff != null) {
      const arrow = mom.dir === 'up' ? '▲' : mom.dir === 'down' ? '▼' : '•';
      const color = mom.dir === 'up' ? 'var(--success)' : mom.dir === 'down' ? 'var(--danger)' : 'var(--muted)';
      const sign = mom.diff > 0 ? '+' : '';
      const pctStr = mom.pct != null ? ` (${sign}${mom.pct}%)` : '';
      momHtml = `<span style="color:${color};font-weight:800;">${arrow} ${moneySpan(Math.abs(mom.diff))}${esc(pctStr)}</span>`;
    }

    const barsHtml = inc.bars.map(b => {
      if (!b.exists) {
        return `
          <div class="prof-bar-row" style="opacity:0.55;">
            <div class="prof-bar-lbl">${esc(b.shortLabel)}</div>
            <div class="prof-bar-track"></div>
            <div class="prof-bar-val">—</div>
          </div>
        `;
      }
      const w = Math.max(b.totalEarned > 0 ? 4 : 0, b.heightPct);
      return `
        <div class="prof-bar-row" onclick="switchProfileScope('${esc(b.ym)}')" style="cursor:pointer;" title="${esc(b.monthName)}: OT ৳${b.otAmount}, Hol ৳${b.holidayAmount}, Night ৳${b.nightAmount}">
          <div class="prof-bar-lbl">${esc(b.shortLabel)}${b.isSoFar ? '*' : ''}</div>
          <div class="prof-bar-track" aria-label="${esc(b.monthName)} earnings bar">
            <div style="width:${w}%;display:flex;height:100%;">
              <div class="prof-bar-seg-ot" style="width:${b.otShare}%;" title="OT Allowance"></div>
              <div class="prof-bar-seg-hol" style="width:${b.holShare}%;" title="Holiday Allowance"></div>
              <div class="prof-bar-seg-night" style="width:${b.nightShare}%;" title="Night Allowance"></div>
            </div>
          </div>
          <div class="prof-bar-val">${moneySpan(b.totalEarned)}</div>
        </div>
      `;
    }).join('');

    const s = agg.scopeSummary;

    return `
      <section class="prof-card" id="profSecC" aria-label="Monthly OT income status">
        <div class="prof-card-head">
          <div>
            <h3 class="prof-card-title">C. Monthly OT Income Status (মাসিক আয়)</h3>
            <p class="prof-card-sub">Stacked OT + Holiday + Night allowance (${agg.targetYear})</p>
          </div>
          <button type="button" class="prof-hide-btn surface" onclick="toggleProfileHideAmounts()" aria-label="Hide or show amounts">
            <span class="prof-hide-toggle-lbl">${hideAmt ? '👁 Show Taka' : '🙈 Hide Taka'}</span>
          </button>
        </div>

        <div class="prof-inc-summary-grid">
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${moneySpan(inc.yearTotal)}</div>
            <div class="prof-kpi-l">${agg.targetYear} Total OT Income</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${moneySpan(inc.avgMonthly)}</div>
            <div class="prof-kpi-l">Average / Month</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${inc.bestMonth ? `${esc(inc.bestMonth.shortLabel)} · ${moneySpan(inc.bestMonth.totalEarned)}` : '—'}</div>
            <div class="prof-kpi-l">Best Month (${agg.targetYear})</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${momHtml}</div>
            <div class="prof-kpi-l">Change vs Prev Month</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;">
          <div class="prof-mw-mini-cell">
            <span style="color:#2563EB;font-weight:800;">● OT Allow.</span>
            <b>${moneySpan(s.totalOtAmount)}</b>
          </div>
          <div class="prof-mw-mini-cell">
            <span style="color:#D97706;font-weight:800;">● Holiday</span>
            <b>${moneySpan(s.totalHolidayAmount)}</b>
          </div>
          <div class="prof-mw-mini-cell">
            <span style="color:#7C3AED;font-weight:800;">● Night</span>
            <b>${moneySpan(s.totalNightAmount)}</b>
          </div>
        </div>

        <div class="prof-inc-legend" aria-hidden="true">
          <span><i class="prof-leg-dot" style="background:#2563EB;"></i>OT Allowance</span>
          <span><i class="prof-leg-dot" style="background:#F59E0B;"></i>Holiday Allowance</span>
          <span><i class="prof-leg-dot" style="background:#7C3AED;"></i>Night Allowance</span>
        </div>

        <div class="prof-bars-wrap">
          ${barsHtml}
        </div>
      </section>
    `;
  }

  // Placeholders for Sections D..I (populated in Part 5 & Part 6)
  let _renderSectionsDEFH = function () { return ''; };
  let _renderSectionsGI = function () { return ''; };

  function renderProfileContent(agg) {
    _profileLastData = agg;
    const rootEl = document.getElementById('profileRoot');
    if (!rootEl) return;

    const emp = agg.identityEmp;
    if (!emp) {
      renderProfileEmptyState(`No overtime records found for ID "${getTargetProfileId()}" in ${agg.targetYear}.`, getTargetProfileId());
      return;
    }

    const mySavedId = typeof getPreferredId === 'function' ? getPreferredId() : '';
    const isViewingOther = Boolean(_profileViewingOtherId && _profileViewingOtherId !== mySavedId);
    const dept = emp.dept || (typeof getClientDepartment === 'function' ? getClientDepartment() : 'PR');
    const deptLabel = dept === 'QA' ? 'Quality Assurance (QA)' : 'RPPF Production';
    const areaName = emp.area === 'Overall' ? 'Executives' : (emp.area || 'Packing Hall');
    const subName = emp.sub || emp.subsection || '';
    const catLabel = emp.category ? ((typeof RATE_TABLE !== 'undefined' && RATE_TABLE[emp.category]?.name) || emp.category) : (emp.kind || 'Standard');
    const initials = getAvatarInitials(emp.name, emp.id);

    const pickerMonths = [...new Set([...agg.allAvailableYms, agg.latestMonth])].sort().reverse();
    const isCustomMonth = agg.scopeType === 'custom_month';

    const loadingBannerHtml = _profileLoadingState.loading
      ? `<div class="prof-load-banner" id="profileProgBanner">
           <div>⏳ ${esc(_profileLoadingState.text)}</div>
           <div class="prof-load-track"><div class="prof-load-fill" style="width:${Math.round((_profileLoadingState.done / Math.max(1, _profileLoadingState.total)) * 100)}%;"></div></div>
         </div>`
      : '';

    const viewingOtherBannerHtml = isViewingOther
      ? `<div class="prof-viewing-other-banner">
           <span>👁 Viewing colleague profile: <b>${esc(emp.name || emp.id)} (${esc(emp.id)})</b> (Read-only)</span>
           <button type="button" class="calc-mini-btn" onclick="resetToMyOwnProfile()">← Back to My Profile (${esc(mySavedId || 'Me')})</button>
         </div>`
      : '';

    rootEl.innerHTML = `
      <div class="prof-root ${isProfileAmountsHidden() ? 'hide-amounts' : ''}">
        ${loadingBannerHtml}
        ${viewingOtherBannerHtml}

        <div class="prof-colleague-bar ${_profileColleagueBarOpen ? 'open' : ''}" id="profileColleagueBar">
          <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:6px;">
            🔍 View another employee's profile (আরেকজন কর্মীর প্রোফাইল দেখুন):
          </div>
          <div class="prof-colleague-row">
            <input type="text" id="profileColleagueInput" placeholder="Enter ID (e.g. 556490, CF8355)" value="${esc(_profileViewingOtherId)}" autocomplete="off" autocapitalize="characters" onkeydown="if(event.key==='Enter')viewAnotherEmployeeProfile()">
            <button type="button" class="btn-primary" onclick="viewAnotherEmployeeProfile()">View</button>
            ${isViewingOther ? `<button type="button" class="btn-secondary" onclick="resetToMyOwnProfile()">My ID</button>` : ''}
          </div>
        </div>

        <!-- Identity Header Card -->
        <section class="prof-id-card" aria-label="Employee Identity">
          <div class="prof-id-top">
            <div class="prof-avatar" aria-hidden="true">${esc(initials)}</div>
            <div class="prof-id-meta">
              <div class="prof-name-row">
                <h3 class="prof-name">${esc(emp.name || emp.id)}</h3>
                <span class="prof-id-pill">${esc(emp.id)}</span>
              </div>
              <div class="prof-subline">
                ${esc(emp.grade || 'Employee')} • ${esc(areaName)}${subName ? ' (' + esc(subName) + ')' : ''}
              </div>
              <div class="prof-tags-row">
                <span class="prof-tag brand">${esc(deptLabel)}</span>
                <span class="prof-tag">${esc(String(catLabel).replace(/\s*\(.*?\)/g, ''))}</span>
                <button type="button" class="prof-tag" style="cursor:pointer;" onclick="openModeSetupModal('employee')" title="Change saved ID">⚙ Change Saved ID</button>
              </div>
            </div>
          </div>

          <!-- Scope Switcher Chips: This month | Last month | This year (2026) | [month picker] -->
          <div class="prof-scope-bar" role="tablist" aria-label="Profile Time Scope">
            <button type="button" class="prof-scope-chip ${agg.selectedScope === 'this_month' ? 'active' : ''}" onclick="switchProfileScope('this_month')">
              <span>This Month</span>
              <small>${esc(agg.thisMonthSummary.shortLabel)} ${agg.targetYear}</small>
            </button>
            <button type="button" class="prof-scope-chip ${agg.selectedScope === 'last_month' ? 'active' : ''}" onclick="switchProfileScope('last_month')">
              <span>Last Month</span>
              <small>${esc(agg.lastMonthSummary.shortLabel)} ${agg.lastMonthSummary.year}</small>
            </button>
            <button type="button" class="prof-scope-chip ${agg.selectedScope === 'year' ? 'active' : ''}" onclick="switchProfileScope('year')">
              <span>This Year</span>
              <small>${agg.targetYear} (${agg.yearSummary.activeMonthsCount}M)</small>
            </button>
            <div class="prof-month-picker-wrap">
              <select id="profileMonthPickerSelect" class="prof-month-picker-select ${isCustomMonth ? 'active' : ''}" aria-label="Pick Month" onchange="if(this.value)switchProfileScope(this.value)">
                <option value="" ${!isCustomMonth ? 'selected' : ''}>📅 Pick Month</option>
                ${pickerMonths.map(ym => `<option value="${esc(ym)}" ${isCustomMonth && agg.selectedScope === ym ? 'selected' : ''}>${esc(ym)}</option>`).join('')}
              </select>
              <span class="prof-month-picker-chev">▾</span>
            </div>
          </div>
        </section>

        ${renderSectionA_Hero(agg, emp)}
        ${renderSectionB_Attendance(agg)}
        ${renderSectionC_Income(agg)}
        ${_renderSectionsDEFH(agg, emp)}
        ${_renderSectionsGI(agg, emp)}
      </div>
    `;
  }

  async function initProfilePage(forceReload = false) {
    const rootEl = document.getElementById('profileRoot');
    if (!rootEl) return;

    // Consume route query parameters if navigated via #/profile?id=...&scope=...
    if (window._profileRouteParams) {
      const rp = window._profileRouteParams;
      window._profileRouteParams = null;
      if (rp.id) {
        const myId = typeof getPreferredId === 'function' ? getPreferredId() : '';
        const cleanRpId = String(rp.id).trim().toUpperCase();
        if (cleanRpId && cleanRpId !== myId) {
          _profileViewingOtherId = cleanRpId;
        }
      }
      if (rp.scope) _profileActiveScope = rp.scope;
      else if (rp.month) _profileActiveScope = rp.month;
    }

    const targetId = getTargetProfileId();
    if (!targetId) {
      renderProfileEmptyState();
      return;
    }

    if (typeof loadAreaMap === 'function') {
      try { await loadAreaMap(); } catch (e) {}
    }

    // Determine department for targetId
    let dept = (typeof getDeptForEmployeeId === 'function' && getDeptForEmployeeId(targetId))
      || (typeof getClientDepartment === 'function' ? getClientDepartment() : 'PR')
      || 'PR';

    // Show skeleton on first load if not cached
    const cacheKey = `${dept}_${targetId}`;
    if (!_profileMemCache[cacheKey] || forceReload) {
      rootEl.innerHTML = `
        <div class="prof-card" style="min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;">
          <div class="spinner" style="display:block;"></div>
          <div style="font-size:14px;font-weight:800;color:var(--text);">Loading profile for ${esc(targetId)}…</div>
          <div style="font-size:12px;color:var(--muted);">Preparing yearly &amp; monthly overtime, attendance and punch summary</div>
        </div>
      `;
    }

    const buildAndRender = (histPayload) => {
      const leaves = (typeof getActiveLongTermLeaves === 'function') ? getActiveLongTermLeaves() : [];
      const agg = window.ProfileCalc.aggregateProfileData(histPayload.monthRecordsMap, {
        targetYear: 2026,
        latestMonth: histPayload.latestMonth || '2026-11',
        selectedScope: _profileActiveScope,
        datasetMetaByMonth: histPayload.datasetMetaByMonth,
        sectionStatsByMonth: histPayload.sectionStatsByMonth,
        longTermLeaves: leaves,
        computeEmpEarlyExits: typeof computeEmpEarlyExits === 'function' ? computeEmpEarlyExits : null
      });

      // Executive visibility guard in normal mode
      if (agg.identityEmp && typeof isExecHiddenFor === 'function' && isExecHiddenFor(agg.identityEmp)) {
        renderProfileEmptyState(`"${targetId}" is an Executive record visible only in In-Charge mode.`, targetId);
        return;
      }
      renderProfileContent(agg);
    };

    try {
      let hist = await fetchEmployeeProfileHistory(targetId, dept, (partial) => {
        if (Object.keys(partial.monthRecordsMap).length > 0) {
          buildAndRender({
            latestMonth: '2026-11',
            monthRecordsMap: partial.monthRecordsMap,
            datasetMetaByMonth: partial.datasetMetaByMonth,
            sectionStatsByMonth: partial.sectionStatsByMonth
          });
        }
      });

      // If no records found in `dept`, try the other department (e.g. QA vs PR) automatically
      if (Object.keys(hist.monthRecordsMap).length === 0) {
        const altDept = dept === 'PR' ? 'QA' : 'PR';
        const altHist = await fetchEmployeeProfileHistory(targetId, altDept);
        if (Object.keys(altHist.monthRecordsMap).length > 0) {
          hist = altHist;
        }
      }

      buildAndRender(hist);
    } catch (err) {
      console.error('Profile load error:', err);
      renderProfileEmptyState(`Could not load profile data for "${targetId}". Please check the ID and try again.`, targetId);
    }
  }

  root._setProfileSectionRenderers = function (fnDEFH, fnGI) {
    if (typeof fnDEFH === 'function') _renderSectionsDEFH = fnDEFH;
    if (typeof fnGI === 'function') _renderSectionsGI = fnGI;
  };
  root._profileHelpers = {
    fmtBdt,
    moneySpan,
    fmtHrs,
    getTargetProfileId,
    isProfileAmountsHidden
  };

  root.initProfilePage = initProfilePage;
  root.switchProfileScope = switchProfileScope;
  root.toggleProfileHideAmounts = toggleProfileHideAmounts;
  root.saveProfileEmptyStateId = saveProfileEmptyStateId;
  root.toggleProfileColleagueBar = toggleProfileColleagueBar;
  root.viewAnotherEmployeeProfile = viewAnotherEmployeeProfile;
  root.resetToMyOwnProfile = resetToMyOwnProfile;
})(typeof window !== 'undefined' ? window : this);

/* ==========================================================================
   PART 5: UI Sections D (Total OT), E (Total Night), F (Holiday Duty), H (Average Punch)
   ========================================================================== */
(function (root) {
  'use strict';

  const H = root._profileHelpers || {};
  const fmtHrs = H.fmtHrs || (n => String(Math.round((Number(n) || 0) * 100) / 100));

  function buildOtSparklineSvg(points) {
    const validPts = Array.isArray(points) ? points : [];
    const n = validPts.length || 11;
    const width = 320;
    const height = 64;
    const padX = 14;
    const padY = 12;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;
    const maxVal = Math.max(1, ...validPts.map(p => (p.exists ? p.otHours : 0)));

    const coords = validPts.map((p, i) => {
      const x = Number((padX + (n > 1 ? (i / (n - 1)) * usableW : usableW / 2)).toFixed(1));
      const val = p.exists ? p.otHours : 0;
      const y = Number((padY + usableH - (val / maxVal) * usableH).toFixed(1));
      return { x, y, val, exists: p.exists, shortLabel: p.shortLabel, ym: p.ym };
    });

    const polyPoints = coords.map(c => `${c.x},${c.y}`).join(' ');
    const areaPoints = `${coords[0]?.x || padX},${height - 4} ${polyPoints} ${coords[coords.length - 1]?.x || (width - padX)},${height - 4}`;

    const dotsHtml = coords.map(c => {
      if (!c.exists) {
        return `<circle cx="${c.x}" cy="${height - 6}" r="2.2" fill="var(--muted)" opacity="0.4"><title>${esc(c.shortLabel)}: —</title></circle>`;
      }
      return `
        <g>
          <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="var(--brand)" stroke="var(--surface)" stroke-width="1.5">
            <title>${esc(c.shortLabel)}: ${c.val}h OT</title>
          </circle>
          <text x="${c.x}" y="${Math.max(9, c.y - 5)}" text-anchor="middle" font-size="8.5" font-weight="800" fill="var(--text-2)">${c.val > 0 ? Math.round(c.val) : '0'}</text>
        </g>
      `;
    }).join('');

    const labelsHtml = validPts.map(p => `
      <div onclick="switchProfileScope('${esc(p.ym)}')" style="cursor:pointer;" title="${esc(p.monthName)}: ${p.exists ? p.otHours + 'h' : '—'}">
        <div>${esc(p.shortLabel)}</div>
        <div style="font-size:9.5px;color:${p.exists ? 'var(--text)' : 'var(--muted)'};font-weight:800;">${p.exists ? fmtHrs(p.otHours) + 'h' : '—'}</div>
      </div>
    `).join('');

    return `
      <div class="prof-spark-box">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">
          <span>Month-wise OT Sparkline (hrs)</span>
          <span>Tap month to filter</span>
        </div>
        <svg class="prof-spark-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly overtime hours sparkline">
          <defs>
            <linearGradient id="profOtGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2563EB" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="#2563EB" stop-opacity="0.02"/>
            </linearGradient>
          </defs>
          <polygon points="${areaPoints}" fill="url(#profOtGrad)"></polygon>
          <polyline points="${polyPoints}" fill="none" stroke="var(--brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></polyline>
          ${dotsHtml}
        </svg>
        <div class="prof-spark-labels" style="grid-template-columns:repeat(${n}, 1fr);">
          ${labelsHtml}
        </div>
      </div>
    `;
  }

  function renderSectionD_OT(agg) {
    const ot = agg.otOverview;
    const act = agg.activeMonthSummary;
    const otDates = (act && Array.isArray(act.otDates)) ? act.otDates : [];

    const chipsHtml = otDates.length > 0
      ? `<div class="prof-chips-wrap">
           ${otDates.map(d => `<span class="prof-date-chip ot">${esc(d.date.slice(0, 6))}${d.day ? ' (' + esc(d.day) + ')' : ''} • <b>+${fmtHrs(d.otHours)}h</b>${d.isNight ? ' 🌙' : ''}</span>`).join('')}
         </div>`
      : `<div style="margin-top:8px;font-size:12px;color:var(--muted);font-weight:600;">No overtime shifts recorded in ${esc(act?.fullLabel || 'selected month')}.</div>`;

    return `
      <section class="prof-card" id="profSecD" aria-label="Total Overtime">
        <div class="prof-card-head">
          <div>
            <h3 class="prof-card-title">D. Total OT (ওভারটাইম ঘণ্টা)</h3>
            <p class="prof-card-sub">Monthly &amp; yearly overtime hours + sparkline</p>
          </div>
          <span class="prof-tag brand">${fmtHrs(agg.scopeSummary.totalOtHours)} hrs (${esc(agg.scopeLabel)})</span>
        </div>

        <div class="prof-att-kpis">
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:var(--brand-text);">${fmtHrs(ot.thisMonthOt)}h</div>
            <div class="prof-kpi-l">This Month (${esc(agg.thisMonthSummary.shortLabel)})</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${fmtHrs(ot.thisYearOt)}h</div>
            <div class="prof-kpi-l">This Year (${agg.targetYear})</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${fmtHrs(ot.avgMonthlyOt)}h</div>
            <div class="prof-kpi-l">Avg OT / Month</div>
          </div>
        </div>

        ${buildOtSparklineSvg(ot.sparkline)}

        <div style="margin-top:10px;font-size:12px;font-weight:800;color:var(--text);">
          Overtime Dates in ${esc(act?.fullLabel || agg.scopeLabel)} (${otDates.length} days):
        </div>
        ${chipsHtml}
      </section>
    `;
  }

  function renderSectionE_Night(agg) {
    const thisMonthN = agg.thisMonthSummary.exists ? agg.thisMonthSummary.nightCount : 0;
    const thisYearN = agg.yearSummary.totalNightDuties;
    const scopeN = agg.scopeSummary.totalNightDuties;

    const mwGridHtml = agg.yearMonthSummaries.map(s => `
      <div class="prof-mw-mini-cell" onclick="switchProfileScope('${esc(s.ym)}')" style="cursor:pointer;${s.nightCount > 0 ? 'border-color:var(--indigo-border);background:var(--indigo-soft);' : ''}">
        <span>${esc(s.shortLabel)}</span>
        <b style="color:${s.nightCount > 0 ? 'var(--indigo)' : 'var(--muted)'};">${s.exists ? s.nightCount + 'n' : '—'}</b>
      </div>
    `).join('');

    let dateChipsHtml = '';
    if (agg.scopeType === 'year') {
      const monthsWithNights = agg.yearMonthSummaries.filter(s => s.exists && s.nightDays && s.nightDays.length > 0).slice().reverse();
      if (monthsWithNights.length === 0) {
        dateChipsHtml = `<div style="margin-top:8px;font-size:12px;color:var(--muted);font-weight:600;">No night duty shifts recorded in ${agg.targetYear}.</div>`;
      } else {
        dateChipsHtml = monthsWithNights.map(s => `
          <div style="margin-top:8px;">
            <div style="font-size:11.5px;font-weight:800;color:var(--text-2);">${esc(s.fullLabel)} (${s.nightDays.length} nights):</div>
            <div class="prof-chips-wrap">
              ${s.nightDays.map((d, i) => {
                const ds = typeof d === 'string' ? d : (d?.date || '');
                return `<span class="prof-date-chip night">#${i + 1} • 🌙 ${esc(ds)}</span>`;
              }).join('')}
            </div>
          </div>
        `).join('');
      }
    } else {
      const act = agg.activeMonthSummary;
      const nDays = (act && Array.isArray(act.nightDays)) ? act.nightDays : [];
      dateChipsHtml = nDays.length > 0
        ? `<div style="margin-top:8px;font-size:12px;font-weight:800;color:var(--text);">Night Dates in ${esc(act.fullLabel)} (${nDays.length}):</div>
           <div class="prof-chips-wrap">
             ${nDays.map((d, i) => {
               const ds = typeof d === 'string' ? d : (d?.date || '');
               return `<span class="prof-date-chip night">#${i + 1} • 🌙 ${esc(ds)}</span>`;
             }).join('')}
           </div>`
        : `<div style="margin-top:8px;font-size:12px;color:var(--muted);font-weight:600;">No night duties recorded in ${esc(act?.fullLabel || agg.scopeLabel)}.</div>`;
    }

    return `
      <section class="prof-card" id="profSecE" aria-label="Total Night Duties">
        <div class="prof-card-head">
          <div>
            <h3 class="prof-card-title">E. Total Night Duty (নাইট ডিউটি)</h3>
            <p class="prof-card-sub">Empress confirmed night shifts &amp; date chips</p>
          </div>
          <span class="prof-tag">${scopeN} nights (${esc(agg.scopeLabel)})</span>
        </div>

        <div class="prof-att-kpis">
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:var(--indigo);">${thisMonthN}</div>
            <div class="prof-kpi-l">This Month (${esc(agg.thisMonthSummary.shortLabel)})</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${thisYearN}</div>
            <div class="prof-kpi-l">This Year (${agg.targetYear})</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${scopeN}</div>
            <div class="prof-kpi-l">Selected Scope</div>
          </div>
        </div>

        <div class="prof-mw-mini-grid">
          ${mwGridHtml}
        </div>

        ${dateChipsHtml}
      </section>
    `;
  }

  function renderSectionF_Holiday(agg) {
    const thisMonthH = agg.thisMonthSummary.exists ? agg.thisMonthSummary.holidayCount : 0;
    const thisYearH = agg.yearSummary.totalHolidayDuties;
    const scopeH = agg.scopeSummary.totalHolidayDuties;

    const mwGridHtml = agg.yearMonthSummaries.map(s => `
      <div class="prof-mw-mini-cell" onclick="switchProfileScope('${esc(s.ym)}')" style="cursor:pointer;${s.holidayCount > 0 ? 'border-color:var(--warning-border);background:var(--warning-bg);' : ''}">
        <span>${esc(s.shortLabel)}</span>
        <b style="color:${s.holidayCount > 0 ? 'var(--warning)' : 'var(--muted)'};">${s.exists ? s.holidayCount + 'd' : '—'}</b>
      </div>
    `).join('');

    const formatHolChip = (h, idx) => {
      if (typeof h === 'string') {
        return `<span class="prof-date-chip hol">#${idx + 1} • 📅 ${esc(h)}</span>`;
      }
      const parts = [];
      if (h.doDuty > 0) parts.push(`DO ${fmtHrs(h.doDuty)}h`);
      if (h.doExtra > 0) parts.push(`DO-OT ${fmtHrs(h.doExtra)}h`);
      if (h.holDuty > 0) parts.push(`Hol ${fmtHrs(h.holDuty)}h`);
      if (h.holExtra > 0) parts.push(`Hol-OT ${fmtHrs(h.holExtra)}h`);
      const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
      return `<span class="prof-date-chip hol">#${idx + 1} • ${esc(h.date || '')}${esc(detail)}</span>`;
    };

    let holChipsHtml = '';
    if (agg.scopeType === 'year') {
      const monthsWithHols = agg.yearMonthSummaries.filter(s => s.exists && s.holidayDays && s.holidayDays.length > 0).slice().reverse();
      if (monthsWithHols.length === 0) {
        holChipsHtml = `<div style="margin-top:8px;font-size:12px;color:var(--muted);font-weight:600;">No holiday or day-off duties recorded in ${agg.targetYear}.</div>`;
      } else {
        holChipsHtml = monthsWithHols.map(s => `
          <div style="margin-top:8px;">
            <div style="font-size:11.5px;font-weight:800;color:var(--text-2);">${esc(s.fullLabel)} (${s.holidayDays.length} days):</div>
            <div class="prof-chips-wrap">
              ${s.holidayDays.map((h, i) => formatHolChip(h, i)).join('')}
            </div>
          </div>
        `).join('');
      }
    } else {
      const act = agg.activeMonthSummary;
      const hDays = (act && Array.isArray(act.holidayDays)) ? act.holidayDays : [];
      holChipsHtml = hDays.length > 0
        ? `<div style="margin-top:8px;font-size:12px;font-weight:800;color:var(--text);">Holiday / DO Dates in ${esc(act.fullLabel)} (${hDays.length}):</div>
           <div class="prof-chips-wrap">
             ${hDays.map((h, i) => formatHolChip(h, i)).join('')}
           </div>`
        : `<div style="margin-top:8px;font-size:12px;color:var(--muted);font-weight:600;">No holiday or day-off duties in ${esc(act?.fullLabel || agg.scopeLabel)}.</div>`;
    }

    return `
      <section class="prof-card" id="profSecF" aria-label="Holiday Duty">
        <div class="prof-card-head">
          <div>
            <h3 class="prof-card-title">F. Holiday &amp; Day-Off Duty (হলিডে ডিউটি)</h3>
            <p class="prof-card-sub">Weekend (Thu/Fri) &amp; Govt/Plant holiday duty breakdown</p>
          </div>
          <span class="prof-tag">${scopeH} days (${esc(agg.scopeLabel)})</span>
        </div>

        <div class="prof-att-kpis">
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:var(--warning);">${thisMonthH}d</div>
            <div class="prof-kpi-l">This Month (${esc(agg.thisMonthSummary.shortLabel)})</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${thisYearH}d</div>
            <div class="prof-kpi-l">This Year (${agg.targetYear})</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${scopeH}d</div>
            <div class="prof-kpi-l">Selected Scope</div>
          </div>
        </div>

        <div class="prof-mw-mini-grid">
          ${mwGridHtml}
        </div>

        ${holChipsHtml}
      </section>
    `;
  }

  function renderSectionH_Punch(agg) {
    const pThis = agg.punchOverview.thisMonth;
    const pYear = agg.punchOverview.thisYear;
    const pScope = agg.punchOverview.scope;

    const rowsHtml = agg.punchOverview.monthWise.map(m => {
      if (!m.exists || m.workedDaysCount === 0) {
        return `
          <tr style="opacity:0.55;">
            <td>${esc(m.shortLabel)}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
          </tr>
        `;
      }
      const arrow = m.dutyTrend === 'up' ? ' <span style="color:var(--success);">▲</span>'
        : m.dutyTrend === 'down' ? ' <span style="color:var(--danger);">▼</span>'
        : '';
      return `
        <tr onclick="switchProfileScope('${esc(m.ym)}')" style="cursor:pointer;">
          <td>${esc(m.shortLabel)} <small style="color:var(--muted);">(${m.workedDaysCount}d)</small></td>
          <td>${esc(m.avgIn12h)}</td>
          <td>${esc(m.avgDayOut12h)}</td>
          <td style="color:var(--indigo);font-weight:700;">${esc(m.avgNightOut12h)}</td>
          <td><b>${fmtHrs(m.avgDutyPerDay)}h</b>${arrow}</td>
        </tr>
      `;
    }).join('');

    return `
      <section class="prof-card" id="profSecH" aria-label="My Average Punch">
        <div class="prof-card-head">
          <div>
            <h3 class="prof-card-title">H. My Average Punch (গড় পাঞ্চ ইন/আউট)</h3>
            <p class="prof-card-sub">Day-shift &amp; Night-shift Out separated • Missing punches excluded</p>
          </div>
          <span class="prof-tag">${fmtHrs(pScope.avgDutyPerDay)}h / day</span>
        </div>

        <div class="prof-inc-summary-grid">
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${esc(pScope.avgIn12h)}</div>
            <div class="prof-kpi-l">Avg In (${esc(agg.scopeLabel)})</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${esc(pScope.avgDayOut12h)}</div>
            <div class="prof-kpi-l">Avg Day Out (${pScope.dayShiftCount}d)</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:var(--indigo);">${esc(pScope.avgNightOut12h)}</div>
            <div class="prof-kpi-l">Avg Night Out (${pScope.nightShiftCount}n)</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:var(--brand-text);">${fmtHrs(pScope.avgDutyPerDay)} hrs/d</div>
            <div class="prof-kpi-l">Avg Duty / Worked Day</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:8px;font-size:11.5px;">
          <div class="prof-mw-mini-cell" style="text-align:left;padding:8px 10px;">
            <span style="color:var(--muted);font-weight:700;">This Month (${esc(agg.thisMonthSummary.shortLabel)}):</span>
            <b>In ${esc(pThis.avgIn12h)} · Out ${esc(pThis.avgDayOut12h)} (${fmtHrs(pThis.avgDutyPerDay)}h/d)</b>
          </div>
          <div class="prof-mw-mini-cell" style="text-align:left;padding:8px 10px;">
            <span style="color:var(--muted);font-weight:700;">This Year (${agg.targetYear}):</span>
            <b>In ${esc(pYear.avgIn12h)} · Out ${esc(pYear.avgDayOut12h)} (${fmtHrs(pYear.avgDutyPerDay)}h/d)</b>
          </div>
        </div>

        <div class="prof-table-wrap">
          <table class="prof-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Avg In</th>
                <th>Day Out</th>
                <th>Night Out</th>
                <th>Avg Duty/d</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  root._renderSecH = renderSectionH_Punch;
  root._setProfileSectionRenderers(function (agg, emp) {
    return (
      renderSectionD_OT(agg) +
      renderSectionE_Night(agg) +
      renderSectionF_Holiday(agg)
    );
  }, null);
})(typeof window !== 'undefined' ? window : this);

/* ==========================================================================
   PART 6: UI Section G (Payroll Issues + WhatsApp ERP) & Section I (Extras 1–7)
   ========================================================================== */
(function (root) {
  'use strict';

  const H = root._profileHelpers || {};
  const fmtHrs = H.fmtHrs || (n => String(Math.round((Number(n) || 0) * 100) / 100));
  const fmtBdt = H.fmtBdt || (n => `৳ ${Number(n || 0).toLocaleString('en-IN')}`);
  const moneySpan = H.moneySpan || (n => fmtBdt(n));

  function reportProfileIssueToErp(encodedMsg, areaName) {
    const msg = decodeURIComponent(encodedMsg || '');
    if (typeof openErpSupportModal === 'function') {
      openErpSupportModal(msg, areaName || 'Solid Production');
    } else if (typeof erpWaLink === 'function') {
      window.open(erpWaLink(msg), '_blank', 'noopener');
    }
  }

  function renderSectionG_Issues(agg, emp) {
    const iss = agg.issuesOverview;
    const c = iss.scopeCounts;
    const empMeta = {
      id: emp.id,
      name: emp.name || emp.id,
      area: emp.area || 'Packing Hall'
    };

    const topChipsHtml = `
      <div class="prof-issue-chips-bar">
        <span class="prof-iss-pill ${c.requisition > 0 ? 'req' : ''}">Requisition issues ${c.requisition}</span>
        <span class="prof-iss-pill ${c.nightSuspect > 0 ? 'req' : ''}">Night suspects ${c.nightSuspect}</span>
        <span class="prof-iss-pill ${c.punch > 0 ? 'punch' : ''}">Punch problems ${c.punch}</span>
      </div>
    `;

    let bodyHtml = '';
    if (iss.isAllClear) {
      const otherMonthsNote = (agg.scopeType !== 'year' && iss.yearTotalIssuesCount > 0)
        ? `<div style="margin-top:6px;font-size:11.5px;font-weight:700;color:var(--text-2);">
             (${iss.yearTotalIssuesCount} issue(s) found in other ${agg.targetYear} months — <span style="text-decoration:underline;cursor:pointer;color:var(--brand-text);" onclick="switchProfileScope('year')">tap to view full year</span>)
           </div>`
        : '';
      bodyHtml = `
        <div class="prof-all-clear">
          <div>All clear ✅ — No Requisition, Night, or Punch issues in ${esc(agg.scopeLabel)}!</div>
          ${otherMonthsNote}
        </div>
      `;
    } else {
      const allScopeIssues = [];
      iss.byMonth.forEach(mg => mg.items.forEach(it => allScopeIssues.push(it)));
      const bulkMsg = encodeURIComponent(window.ProfileCalc.buildErpWhatsAppBulkMessage(empMeta, allScopeIssues, agg.scopeLabel));

      const groupsHtml = iss.byMonth.map(mg => {
        const itemsHtml = mg.items.map(item => {
          const singleMsg = encodeURIComponent(window.ProfileCalc.buildErpWhatsAppIssueMessage(empMeta, item));
          const badgeTxt = item.type === 'requisition' ? '⚠️ Requisition Missing'
            : item.type === 'nightSuspect' ? '🌙 Night Suspect'
            : '🔴 Punch Problem';
          return `
            <div class="prof-issue-item ${esc(item.type)}">
              <div class="prof-issue-top">
                <span>${esc(item.date)}${item.day ? ' (' + esc(item.day) + ')' : ''}</span>
                <span class="prof-tag">${badgeTxt}</span>
              </div>
              <div class="prof-issue-meta">
                In: <b>${esc(item.in)}</b> ➔ Out: <b>${esc(item.out)}</b> • Duty: <b>${fmtHrs(item.duty)}h</b>
                ${item.expectedOt ? ` • Expected: <b>${esc(item.expectedOt)}</b>` : ''}
              </div>
              <div class="prof-issue-reason">${esc(item.reason)}</div>
              <button type="button" class="prof-wa-btn" onclick="reportProfileIssueToErp('${singleMsg}', '${esc(empMeta.area)}')">
                <span>💬 Report to ERP Team (WhatsApp)</span>
              </button>
            </div>
          `;
        }).join('');

        return `
          <div class="prof-issue-month-group">
            <div class="prof-issue-month-head">
              <span>📅 ${esc(mg.fullLabel)}</span>
              <span class="prof-tag">${mg.items.length} issue${mg.items.length > 1 ? 's' : ''}</span>
            </div>
            ${itemsHtml}
          </div>
        `;
      }).join('');

      bodyHtml = `
        ${allScopeIssues.length > 1 ? `
          <button type="button" class="prof-wa-btn" style="margin-top:0;margin-bottom:10px;background:var(--brand);" onclick="reportProfileIssueToErp('${bulkMsg}', '${esc(empMeta.area)}')">
            <span>📤 Forward All ${allScopeIssues.length} Issues to ERP Team</span>
          </button>
        ` : ''}
        ${groupsHtml}
      `;
    }

    return `
      <section class="prof-card" id="profSecG" aria-label="My Requisition, OT, and Night Issues">
        <div class="prof-card-head">
          <div>
            <h3 class="prof-card-title">G. Check Before Payroll (পে-রোল চেক)</h3>
            <p class="prof-card-sub" style="color:var(--warning);font-weight:700;">Issue দেখালে requisition/OT ERP team-কে জানান</p>
          </div>
          <span class="prof-tag ${iss.isAllClear ? 'success' : ''}">${iss.isAllClear ? 'All Clear ✅' : c.total + ' Issues'}</span>
        </div>
        ${topChipsHtml}
        ${bodyHtml}
      </section>
    `;
  }

  function renderSectionI_Extras(agg, emp) {
    const ex = agg.extras;
    const act = agg.activeMonthSummary;
    const calDays = (act && Array.isArray(act.miniCalendarDays)) ? act.miniCalendarDays : [];

    // 1. 7-column weekday-aligned (Su..Sa) calendar grid for active month + Perfect attendance streak badge
    const stateLabels = {
      present: 'P',
      absent: 'A',
      leave: 'L',
      night: 'N',
      holiday: 'H',
      bad: 'B',
      off: 'O',
      offn: 'O',
      pending: '·',
      upcoming: '·'
    };
    const wkHeaders = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    let leadingBlanks = 0;
    if (act && act.ym) {
      const [cy, cm] = String(act.ym).split('-').map(Number);
      if (cy && cm) leadingBlanks = new Date(cy, cm - 1, 1).getDay();
    }
    const blankCellsHtml = Array.from({ length: leadingBlanks }, () => `<div class="prof-cal-day is-empty" aria-hidden="true"></div>`).join('');

    const calHtml = calDays.length > 0
      ? `<div class="prof-cal-wk-head" aria-hidden="true">
           ${wkHeaders.map(w => `<span>${w}</span>`).join('')}
         </div>
         <div class="prof-cal-grid" role="list" aria-label="Days worked in ${esc(act.fullLabel)}">
           ${blankCellsHtml}
           ${calDays.map(d => `
             <div class="prof-cal-day ${esc(d.state)}" role="listitem" title="${esc(d.date)} (${esc(d.dayName)}): ${esc(d.note || d.state)}">
               <div>${Number(d.dayNum || d.dayStr)}</div>
               <small>${esc(stateLabels[d.state] || d.dayName)}</small>
             </div>
           `).join('')}
         </div>
         <div class="prof-cal-legend" aria-label="Calendar legend">
           <span><i class="prof-cal-dot present"></i><b>P</b> Present</span>
           <span><i class="prof-cal-dot absent"></i><b>A</b> Absent</span>
           <span><i class="prof-cal-dot leave"></i><b>L</b> Leave</span>
           <span><i class="prof-cal-dot off"></i><b>O</b> Off/Hol</span>
           <span><i class="prof-cal-dot night"></i><b>N</b> Night</span>
           <span><i class="prof-cal-dot bad"></i><b>B</b> Punch Issue</span>
         </div>`
      : '';

    // 2. Early-exit count per month
    const eeYearTotal = agg.yearSummary.totalEarlyExits;
    const eeScopeTotal = agg.scopeSummary.totalEarlyExits;
    const eeMonthsHtml = agg.yearMonthSummaries.map(s => `
      <div class="prof-mw-mini-cell" onclick="switchProfileScope('${esc(s.ym)}')" style="cursor:pointer;">
        <span>${esc(s.shortLabel)}</span>
        <b style="color:${s.earlyExitCount > 0 ? 'var(--warning)' : 'var(--success)'};">${s.exists ? s.earlyExitCount + 'd' : '—'}</b>
      </div>
    `).join('');

    // 3 & 4. My rank in section (with 3-month trend) + OT vs anonymous section average
    const secStats = ex.activeSecStats;
    const areaLabel = (secStats && secStats.area) || (emp.area === 'Overall' ? 'Executives' : (emp.area || 'Section'));
    const myOt = act && act.exists ? act.otHours : 0;
    const secAvgOt = secStats && secStats.avgOt != null ? secStats.avgOt : null;
    const otDiff = secAvgOt != null ? Number((myOt - secAvgOt).toFixed(1)) : null;
    const maxCompareOt = Math.max(1, myOt, secAvgOt || 0);
    const myBarW = Math.round((myOt / maxCompareOt) * 100);
    const avgBarW = secAvgOt != null ? Math.round((secAvgOt / maxCompareOt) * 100) : 0;

    const trend3mHtml = (ex.rankTrend3m || []).map(t => `
      <div class="prof-mw-mini-cell">
        <span>${esc(t.shortLabel)}</span>
        <b>${t.otRank ? '#' + t.otRank : '—'}</b>
        <small style="color:var(--muted);font-size:9.5px;">${t.headcount ? 'of ' + t.headcount : ''}</small>
      </div>
    `).join('');

    return `
      <section class="prof-card" id="profSecI1" aria-label="Attendance Streak and Mini Calendar">
        <div class="prof-card-head">
          <div>
            <h3 class="prof-card-title">I1. Streak &amp; Month Calendar (${esc(act?.shortLabel || '')})</h3>
            <p class="prof-card-sub">Perfect-attendance streak &amp; daily status strip</p>
          </div>
          <span class="prof-tag success">🔥 ${ex.perfectMonthsCount} Perfect Month${ex.perfectMonthsCount === 1 ? '' : 's'}</span>
        </div>

        <div class="prof-att-kpis">
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:var(--success);">${ex.currentPerfectStreak}M</div>
            <div class="prof-kpi-l">Current 100% Streak</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${ex.maxPerfectStreak}M</div>
            <div class="prof-kpi-l">Best 100% Streak</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:var(--brand-text);">${ex.bestOtMonth ? `${esc(ex.bestOtMonth.label)} (${fmtHrs(ex.bestOtMonth.otHours)}h)` : '—'}</div>
            <div class="prof-kpi-l">Best OT Month</div>
          </div>
        </div>

        <div class="prof-inc-legend" style="margin-top:4px;margin-bottom:4px;">
          <span><i class="prof-leg-dot" style="background:var(--success);"></i>Present (OK)</span>
          <span><i class="prof-leg-dot" style="background:var(--indigo);"></i>Night (NGT)</span>
          <span><i class="prof-leg-dot" style="background:var(--warning);"></i>Holiday (HOL)</span>
          <span><i class="prof-leg-dot" style="background:var(--danger);"></i>Absent/Fix</span>
          <span><i class="prof-leg-dot" style="background:var(--brand);"></i>Leave (LV)</span>
        </div>

        ${calHtml}
      </section>

      <section class="prof-card" id="profSecI2" aria-label="Early Exits, Section Rank, and Section Average">
        <div class="prof-card-head">
          <div>
            <h3 class="prof-card-title">I2–I4. Rank, Section Average &amp; Early Exits</h3>
            <p class="prof-card-sub">Anonymous ${esc(areaLabel)} comparison &amp; Gate Pass / Early Exit count</p>
          </div>
          <button type="button" class="calc-mini-btn" onclick="switchPage('leaderboard')">Open Rank ›</button>
        </div>

        <!-- I3: Section Rank & 3-Month Trend -->
        <div class="prof-att-kpis">
          <div class="prof-kpi-box">
            <div class="prof-kpi-v" style="color:var(--brand-text);">${secStats && secStats.otRank ? '#' + secStats.otRank : '—'}</div>
            <div class="prof-kpi-l">OT Rank (${secStats?.headcount || '—'} in ${esc(areaLabel)})</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${secStats && secStats.dutyRank ? '#' + secStats.dutyRank : '—'}</div>
            <div class="prof-kpi-l">Duty Rank (${esc(act?.shortLabel || '')})</div>
          </div>
          <div class="prof-kpi-box">
            <div class="prof-kpi-v">${eeScopeTotal}d <small style="font-size:11px;color:var(--muted);">(${eeYearTotal}d yr)</small></div>
            <div class="prof-kpi-l">Early Exits / Gate Pass</div>
          </div>
        </div>

        <div style="font-size:11.5px;font-weight:800;color:var(--text-2);margin-bottom:4px;">3-Month OT Rank Trend in ${esc(areaLabel)}:</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;">
          ${trend3mHtml}
        </div>

        <!-- I4: Anonymous OT vs Section Average -->
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:800;color:var(--text);margin-bottom:6px;">
            <span>OT vs ${esc(areaLabel)} Average (${esc(act?.shortLabel || '')})</span>
            <span style="color:${otDiff != null && otDiff >= 0 ? 'var(--success)' : 'var(--muted)'};">
              ${otDiff != null ? (otDiff >= 0 ? '+' + otDiff + 'h above avg' : otDiff + 'h vs avg') : '—'}
            </span>
          </div>
          <div class="prof-bar-row" style="grid-template-columns:82px 1fr 56px;min-height:24px;">
            <div class="prof-bar-lbl">My OT</div>
            <div class="prof-bar-track"><div class="prof-bar-seg-ot" style="width:${myBarW}%;"></div></div>
            <div class="prof-bar-val">${fmtHrs(myOt)}h</div>
          </div>
          <div class="prof-bar-row" style="grid-template-columns:82px 1fr 56px;min-height:24px;">
            <div class="prof-bar-lbl" style="color:var(--muted);">Section Avg</div>
            <div class="prof-bar-track"><div style="width:${avgBarW}%;height:100%;background:var(--silver);"></div></div>
            <div class="prof-bar-val" style="color:var(--muted);">${secAvgOt != null ? fmtHrs(secAvgOt) + 'h' : '—'}</div>
          </div>
        </div>

        <!-- I2: Month-wise Early Exit counts -->
        <div style="font-size:11.5px;font-weight:800;color:var(--text-2);margin-bottom:4px;">Early Exit / Gate Pass per Month (${agg.targetYear}):</div>
        <div class="prof-mw-mini-grid">
          ${eeMonthsHtml}
        </div>
      </section>

      <!-- I5, I6, I7 + VS Compare Shortcuts -->
      <section class="prof-card" id="profSecActions" aria-label="Quick Actions and Export">
        <div class="prof-card-head">
          <div>
            <h3 class="prof-card-title">I5–I7. Quick Actions &amp; Share (শর্টকাট)</h3>
            <p class="prof-card-sub">Open Daily Report, Payslip Estimator, 1v1 Compare, or Save Summary Image</p>
          </div>
        </div>
        <div class="prof-actions-grid">
          <button type="button" class="prof-action-btn primary" onclick="openProfileDailyReport('${esc(agg.activeSingleYm)}')">
            <span>📄 Open Daily Report</span>
          </button>
          <button type="button" class="prof-action-btn" onclick="openProfilePayslipShortcut('${esc(agg.activeSingleYm)}')">
            <span>🧮 Payslip Estimator</span>
          </button>
          <button type="button" class="prof-action-btn" onclick="openProfileVsShortcut()">
            <span>⚖️ Compare with Colleague</span>
          </button>
          <button type="button" class="prof-action-btn" onclick="downloadProfileSummaryPNG(false)">
            <span>📸 Share / Save Summary PNG</span>
          </button>
        </div>
      </section>
    `;
  }

  async function openProfileDailyReport(ym) {
    const targetId = H.getTargetProfileId ? H.getTargetProfileId() : (typeof getPreferredId === 'function' ? getPreferredId() : '');
    const targetYm = ym || '2026-11';
    if (!targetId) return;
    const [y, m] = targetYm.split('-');
    const ySel = document.getElementById('yearSelect');
    const mSel = document.getElementById('monthSelect');
    if (ySel && y) ySel.value = y;
    if (mSel && m) mSel.value = m;
    const empInp = document.getElementById('employeeId');
    if (empInp) {
      empInp.value = targetId;
      if (typeof toggleClearIdBtn === 'function') toggleClearIdBtn();
    }
    if (typeof findReport === 'function') {
      await findReport();
    }
    if (typeof switchPage === 'function') {
      switchPage('report');
    }
  }

  async function openProfilePayslipShortcut(ym) {
    const targetId = H.getTargetProfileId ? H.getTargetProfileId() : (typeof getPreferredId === 'function' ? getPreferredId() : '');
    const targetYm = ym || '2026-11';
    if (!targetId) return;
    const [y, m] = targetYm.split('-');
    const ySel = document.getElementById('yearSelect');
    const mSel = document.getElementById('monthSelect');
    if (ySel && y) ySel.value = y;
    if (mSel && m) mSel.value = m;
    const empInp = document.getElementById('employeeId');
    if (empInp) {
      empInp.value = targetId;
      if (typeof toggleClearIdBtn === 'function') toggleClearIdBtn();
    }
    if (typeof switchPage === 'function') {
      switchPage('search');
    }
    if (typeof findReport === 'function') {
      await findReport();
    }
    const payCard = document.getElementById('payslipCard');
    if (payCard) {
      payCard.style.display = 'block';
      payCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => document.getElementById('inpSalary')?.focus(), 200);
    }
  }

  function openProfileVsShortcut() {
    const targetId = H.getTargetProfileId ? H.getTargetProfileId() : (typeof getPreferredId === 'function' ? getPreferredId() : '');
    if (typeof switchPage === 'function') {
      switchPage('vs');
    }
    const inp1 = document.getElementById('compareId1');
    if (inp1 && targetId) {
      inp1.value = targetId;
      if (typeof updateVsSlotPreview === 'function') updateVsSlotPreview(1, targetId);
    }
    setTimeout(() => document.getElementById('compareId')?.focus(), 150);
  }

  /**
   * Generate and download/share a crisp PNG Summary Card using pure HTML5 2D Canvas
   * (works 100% offline with zero external CDN dependencies).
   */
  async function downloadProfileSummaryPNG(share = false) {
    const heroEl = document.getElementById('profSecA');
    const idCardEl = document.querySelector('#profileRoot .prof-id-card');
    if (!heroEl || !idCardEl) {
      if (typeof showToast === 'function') showToast('Open your profile first', 'warn');
      return;
    }
    try {
      if (typeof showToast === 'function') showToast('Creating profile summary PNG…', 'info');
      const canvas = document.createElement('canvas');
      canvas.width = 780;
      canvas.height = 520;
      const ctx = canvas.getContext('2d');

      // Background
      const grad = ctx.createLinearGradient(0, 0, 780, 520);
      grad.addColorStop(0, '#0F172A');
      grad.addColorStop(1, '#1E3A8A');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 780, 520);

      // Header text
      const nameTxt = document.querySelector('#profileRoot .prof-name')?.textContent || 'Employee';
      const idTxt = document.querySelector('#profileRoot .prof-id-pill')?.textContent || '';
      const subTxt = document.querySelector('#profileRoot .prof-subline')?.textContent || '';
      const scopeTxt = document.querySelector('#profSecA .prof-hero-badge')?.textContent || 'RPPF Profile Summary';

      ctx.fillStyle = '#93C5FD';
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText('RENATA PLC • RPPF EMPLOYEE PROFILE SUMMARY', 36, 48);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.fillText(`${nameTxt} (${idTxt})`, 36, 92);

      ctx.fillStyle = '#CBD5E1';
      ctx.font = '600 18px Arial, sans-serif';
      ctx.fillText(subTxt.trim(), 36, 122);

      ctx.fillStyle = '#FDE047';
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(scopeTxt.trim(), 36, 156);

      // Extract KPI boxes from #profSecA
      const bigVals = [...document.querySelectorAll('#profSecA .prof-hero-val')].map(el => el.textContent.trim());
      const bigLbls = [...document.querySelectorAll('#profSecA .prof-hero-lbl')].map(el => el.textContent.trim());
      const statVals = [...document.querySelectorAll('#profSecA .prof-hero-stat-v')].map(el => el.textContent.trim());
      const statLbls = [...document.querySelectorAll('#profSecA .prof-hero-stat-l')].map(el => el.textContent.trim());

      // Big boxes
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(36, 180, 340, 110);
      ctx.fillRect(404, 180, 340, 110);

      ctx.fillStyle = '#CBD5E1';
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.fillText(bigLbls[0] || 'TOTAL OT INCOME', 56, 212);
      ctx.fillText(bigLbls[1] || 'TOTAL OT HOURS', 424, 212);

      ctx.fillStyle = '#FDE047';
      ctx.font = 'bold 34px Arial, sans-serif';
      ctx.fillText(bigVals[0] || '—', 56, 260);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(bigVals[1] || '—', 424, 260);

      // 6 Stat cells
      for (let i = 0; i < Math.min(6, statVals.length); i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 36 + col * 240;
        const y = 312 + row * 82;
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.fillRect(x, y, 224, 68);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial, sans-serif';
        ctx.fillText(statVals[i], x + 18, y + 34);
        ctx.fillStyle = '#CBD5E1';
        ctx.font = '600 14px Arial, sans-serif';
        ctx.fillText(statLbls[i] || '', x + 18, y + 56);
      }

      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 13px Arial, sans-serif';
      ctx.fillText('Generated from RPPF Overtime & Allowance App (checkot.github.io)', 36, 502);

      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const fname = `RPPF_Profile_${idTxt || 'Me'}.png`;
      const file = new File([blob], fname, { type: 'image/png' });
      if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fname });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      if (typeof showToast === 'function') showToast('Profile summary PNG saved!', 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Could not create summary image', 'error');
    }
  }

  root._setProfileSectionRenderers(null, function (agg, emp) {
    const hHtml = typeof root._renderSecH === 'function' ? root._renderSecH(agg) : '';
    return renderSectionG_Issues(agg, emp) + hHtml + renderSectionI_Extras(agg, emp);
  });

  root.reportProfileIssueToErp = reportProfileIssueToErp;
  root.openProfileDailyReport = openProfileDailyReport;
  root.openProfilePayslipShortcut = openProfilePayslipShortcut;
  root.openProfileVsShortcut = openProfileVsShortcut;
  root.downloadProfileSummaryPNG = downloadProfileSummaryPNG;
})(typeof window !== 'undefined' ? window : this);
