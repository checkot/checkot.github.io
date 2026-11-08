/* ==========================================================================
   SEARCH.JS - Home Search Form, Overtime Query & Result Presentation Controller
   ========================================================================== */

function toggleClearIdBtn() {
  const inp = document.getElementById('employeeId');
  const btn = document.getElementById('clearIdBtn');
  if (inp && btn) btn.classList.toggle('show', inp.value.trim().length > 0);
}

function clearEmployeeInput() {
  const inp = document.getElementById('employeeId');
  if (inp) { inp.value = ''; toggleClearIdBtn(); inp.focus(); }
}

function renderRecentSearchChips() {
  const wrap = document.getElementById('recentSearchChips');
  if (!wrap) return;
  const list = typeof getHistory === 'function' ? getHistory() : [];
  const uniqueIds = [...new Set(list.map(x => x.id))].slice(0, 4);
  if (uniqueIds.length === 0) { wrap.classList.remove('show'); wrap.innerHTML = ''; return; }
  wrap.classList.add('show');
  wrap.innerHTML = `<span class="recent-chips-label">Previous IDs:</span>` + uniqueIds.map(id => `<button type="button" class="id-chip" onclick="quickSelectId('${esc(id)}')">${esc(id)}</button>`).join('');
}

function quickSelectId(id) {
  const inp = document.getElementById('employeeId');
  if (!inp) return;
  inp.value = id;
  toggleClearIdBtn();
  findReport();
}

function enterCompactMode(empId, month) {
  document.getElementById('searchFormCard').style.display = "none";
  document.getElementById('welcomeBanner')?.classList.add('hidden-compact');
  document.getElementById('quickActionsGrid')?.classList.add('hidden-compact');
  document.getElementById('searchSummary').classList.add('show');
  document.getElementById('summaryId').textContent = empId;
  const [y, m] = String(month || '').split('-');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const isRppf = (typeof currentResult !== 'undefined' && currentResult?.isRppf !== false);
  const areaStr = isRppf ? getAreaForId(empId, true) : 'Other facility';
  document.getElementById('summaryMonth').textContent = (monthNames[parseInt(m, 10)-1] || m) + ' ' + y + ' • ' + areaStr;
  document.getElementById('mainHeader').classList.add('compact');
}

function expandSearchForm() {
  document.getElementById('searchFormCard').style.display = "block";
  document.getElementById('welcomeBanner')?.classList.remove('hidden-compact');
  document.getElementById('quickActionsGrid')?.classList.remove('hidden-compact');
  document.getElementById('searchSummary').classList.remove('show');
  document.getElementById('mainHeader').classList.remove('compact');
  document.getElementById('employeeId').focus();
}

function toggleCollapse(bodyId, headerEl) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const isOpen = body.classList.contains('show');
  if (isOpen) { body.classList.remove('show'); headerEl?.classList.remove('expanded'); }
  else { body.classList.add('show'); headerEl?.classList.add('expanded'); }
}

function showSearchError(msg) {
  if (window.CheckotLoader && typeof window.CheckotLoader.hide === 'function') {
    window.CheckotLoader.hide();
  }
  const s = document.getElementById('status');
  if (!s) return;
  const help = `Hello, the overtime report for ID ${currentSearchId || ''} (${currentMonth || ''}) cannot be found in the app. Please check.`;
  s.innerHTML = `<div class="err-box"><div>${esc(msg)}</div>
<button type="button" class="btn-primary" onclick="openErpSupportModal(${ esc(JSON.stringify(help)) })">Message the ERP team on WhatsApp</button></div>`;
}

function initYearDropdown() {
  const ySel = document.getElementById('yearSelect');
  if (!ySel) return;
  const now = new Date();
  const currYear = now.getFullYear();
  const defaultYear = (currYear >= 2020 && currYear <= 2032) ? currYear : 2026;
  ySel.innerHTML = '';
  for (let y = 2020; y <= 2032; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = typeof bn === 'function' ? bn(String(y)) : String(y);
    if (y === defaultYear) opt.selected = true;
    ySel.appendChild(opt);
  }
}

function setDefaultMonth() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  month -= 1;
  if (month === 0) { month = 12; year -= 1; }
  const yStr = String(year);
  const mStr = String(month).padStart(2, '0');
  const ySel = document.getElementById('yearSelect');
  if (ySel) {
    let yearExists = false;
    for (const opt of ySel.options) if (opt.value === yStr) { yearExists = true; break; }
    if (!yearExists) {
      const opt = document.createElement('option');
      opt.value = yStr;
      opt.textContent = typeof bn === 'function' ? bn(yStr) : yStr;
      ySel.appendChild(opt);
    }
    ySel.value = yStr;
  }
  const mSel = document.getElementById('monthSelect');
  if (mSel) mSel.value = mStr;
}

async function findReport() {
  document.body.classList.remove('has-result');
  const yearEl = document.getElementById('yearSelect');
  const monEl = document.getElementById('monthSelect');
  const year = yearEl ? yearEl.value : '2026';
  const mon = monEl ? monEl.value : '10';
  const month = `${year}-${mon}`;
  const empInput = document.getElementById('employeeId');
  const rawId = empInput ? empInput.value.trim() : '';
  const statusDiv = document.getElementById('status');
  const progressDiv = document.getElementById('progress');
  const spinner = document.getElementById('spinner');
  const searchBtn = document.getElementById('searchBtn');

  if (!rawId) {
    if (typeof showToast === 'function') showToast("First enter your ID number", "warn");
    empInput?.focus();
    return;
  }
  const searchId = rawId.toUpperCase().replace(/\s+/g, '');
  currentSearchId = searchId;
  currentMonth = month;
  _lbView = false;
  if (window.CheckotLoader && typeof window.CheckotLoader.show === 'function') {
    window.CheckotLoader.show(month);
  }

  ['viewingContextBanner','monthNavBar','step3','step7','payslipCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = "none"; el.classList.remove('show'); }
  });
  const cmpRes = document.getElementById('compareResult');
  if (cmpRes) cmpRes.style.display = "none";
  const cmpInputArea = document.getElementById('compareInputArea');
  if (cmpInputArea) cmpInputArea.style.display = "block";
  const cmpId = document.getElementById('compareId');
  if (cmpId) cmpId.value = "";
  const daySum = document.getElementById('daySummaryGrid');
  if (daySum) daySum.style.display = "none";
  ['step5Body'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
  document.querySelectorAll('.collapse-header').forEach(h => h.classList.remove('expanded'));

  currentResult = null;
  currentToken++;
  const myToken = currentToken;

  if (statusDiv) {
    statusDiv.style.color = "var(--primary-blue)";
    statusDiv.innerText = "Verifying data, please wait...";
  }
  if (progressDiv) { progressDiv.style.display = "none"; progressDiv.innerText = ""; }
  if (spinner) spinner.style.display = "block";
  if (searchBtn) searchBtn.disabled = true;

  try {
    await loadAreaMap();
    if (!isListedEmployeeId(searchId)) {
      if (spinner) spinner.style.display = "none";
      if (searchBtn) searchBtn.disabled = false;
      if (typeof updateMonthNavBar === 'function') updateMonthNavBar(month);
      showSearchError(`"${rawId}" আইডিটি অনুমোদিত আরপিবিএফ সেকশন (সলিড, সফটজেল, প্যাকিং, এক্সিকিউটিভ)-এ তালিকাভুক্ত নয়। শুধুমাত্র তালিকাভুক্ত কর্মচারীদের হিসাব দেখা যাবে। অ্যাডমিন প্যানেল থেকে আইডি তালিকাভুক্ত করুন।`);
      return;
    }
    const prevMonth = getPrevMonthStr(month);
    const [fastList] = await Promise.all([
      fetchMonthPreIndexedData(month),
      prevMonth ? fetchMonthPreIndexedData(prevMonth, false, false).catch(() => null) : Promise.resolve(null)
    ]);
    if (myToken !== currentToken) return;
    if (!fastList || !Array.isArray(fastList) || fastList.length === 0) {
      if (spinner) spinner.style.display = "none";
      if (searchBtn) searchBtn.disabled = false;
      if (typeof updateMonthNavBar === 'function') updateMonthNavBar(month);
      showSearchError(`${month} overtime data has not been uploaded to the server yet.`);
      return;
    }
    const matchedEmp = fastList.find(e => String(e.id || '').toUpperCase() === searchId);
    if (matchedEmp && isExecHiddenFor(matchedEmp)) {
      if (spinner) spinner.style.display = "none";
      if (searchBtn) searchBtn.disabled = false;
      showSearchError('This ID calculation is visible only in in-charge mode.');
      return;
    }
    if (matchedEmp) {
      if (spinner) spinner.style.display = "none";
      if (searchBtn) searchBtn.disabled = false;
      if (statusDiv) { statusDiv.style.color = "var(--success)"; statusDiv.innerText = "Calculation ready"; }
      renderInstantEmployeeRecord(matchedEmp, month, searchId);
      return;
    }
    if (spinner) spinner.style.display = "none";
    if (searchBtn) searchBtn.disabled = false;
    if (typeof updateMonthNavBar === 'function') updateMonthNavBar(month);
    showSearchError(`"${rawId}" ID not found in the ${month} report. Check that the ID and month are correct.`);
  } catch (err) {
    console.error(err);
    if (spinner) spinner.style.display = "none";
    if (searchBtn) searchBtn.disabled = false;
    if (window.CheckotLoader && typeof window.CheckotLoader.hide === 'function') {
      window.CheckotLoader.hide();
    }
    showSearchError('Check your internet connection.');
  }
}

function applyExtraction(parsed, detection) {
  const gradeInfo = document.getElementById('gradeInfo');
  const calcInputs = document.getElementById('calcInputs');
  const categoryBadge = document.getElementById('categoryBadge');
  const isRppf = currentResult?.isRppf !== false;
  const areaName = isRppf ? getAreaForId(currentSearchId, true) : 'Other facility';
  const greetBox = document.getElementById('userGreeting');
  const greetNameEl = document.getElementById('greetName');
  if (greetBox && greetNameEl) {
    if (currentResult && currentResult.name) { greetNameEl.textContent = currentResult.name; greetBox.style.display = "none"; }
    else { greetNameEl.textContent = "User"; greetBox.style.display = "none"; }
  }
    // Update modern Worker Identity Card (+10% Height & Typography)
  try {
    const widEl = document.getElementById('workerIdCode');
    if (widEl) widEl.textContent = currentSearchId || '—';
    const wNameEl = document.getElementById('workerNameLine');
    if (wNameEl) wNameEl.textContent = (currentResult && currentResult.name) ? currentResult.name : (currentSearchId || 'User');
    const wAreaEl = document.getElementById('workerDeptArea');
    if (wAreaEl) wAreaEl.textContent = areaName;
    const wGradeEl = document.getElementById('workerDeptGrade');
    if (wGradeEl) wGradeEl.textContent = detection.gradeText || (currentResult && currentResult.grade) || 'Helper';
    const wMetaEl = document.getElementById('workerMetaTag');
    if (wMetaEl) {
      const catName = (detection.category && RATE_TABLE[detection.category]) ? RATE_TABLE[detection.category].name : (detection.reason || 'Contractual / CF');
      wMetaEl.textContent = catName;
    }
  } catch (e) {}

  if (typeof closeShiftDates === 'function') closeShiftDates();

  if (detection.gradeText || detection.reason) {
    if (gradeInfo) {
      gradeInfo.style.display = "none";
      gradeInfo.innerText = `Grade: ${detection.gradeText || "—"} | ${detection.reason} | Area: ${areaName}`;
    }
  }
  const _nr = Boolean(detection.valid && detection.category && isNoRateCat(detection.category));
  document.body.classList.toggle('norate-view', _nr);
  if (calcInputs) calcInputs.classList.toggle('norate', _nr);
  if (_nr) {
    document.getElementById('inpOtHours').value = parsed.otHours;
    document.getElementById('inpHoliday').value = parsed.holidayCount;
    document.getElementById('inpNight').value = parsed.nightCount;
    if (categoryBadge) { categoryBadge.className = "badge"; categoryBadge.innerText = RATE_TABLE[detection.category].name; }
    if (calcInputs) calcInputs.style.display = "block";
    const gl = document.getElementById('gtLabelText'); if (gl) gl.textContent = 'Hours calculation';
    const setT = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };
    setT('lblOtFormula', `${parsed.otHours} hours`); setT('lblHolidayFormula', `${parsed.holidayCount} days`); setT('lblNightFormula', `${parsed.nightCount} nights`);
    const gi = document.getElementById('gradeInfo'); if (gi) { gi.style.display = 'block'; gi.innerText = `Grade: ${detection.gradeText || '—'} | No fixed rate - only hours and days calculation | Area: ${areaName}`; }
  } else if (detection.valid && detection.category) {
    document.getElementById('inpCategory').value = detection.category;
    document.getElementById('inpOtHours').value = parsed.otHours;
    document.getElementById('inpHoliday').value = parsed.holidayCount;
    document.getElementById('inpNight').value = parsed.nightCount;
    if (categoryBadge) {
      categoryBadge.className = isRppf ? "badge" : "badge facility-warn";
      categoryBadge.innerText = isRppf ? RATE_TABLE[detection.category].name : `${RATE_TABLE[detection.category].name} (other facility)`;
    }
    if (calcInputs) calcInputs.style.display = "block";
    recalculate();
  } else {
    document.getElementById('inpCategory').value = "JO";
    document.getElementById('inpOtHours').value = 0;
    document.getElementById('inpHoliday').value = 0;
    document.getElementById('inpNight').value = 0;
    if (categoryBadge) { categoryBadge.className = "badge facility-warn"; categoryBadge.innerText = "Unidentified designation"; }
    if (calcInputs) calcInputs.style.display = "block";
    recalculate();
  }
  updatePayslipPreview();
  if (currentResult) {
    if (currentResult.otAmount != null) { const el = document.getElementById('lblOtAmount'); if (el) el.innerText = `৳ ${Number(currentResult.otAmount).toFixed(2)}`; }
    if (currentResult.holidayAmount != null) { const el = document.getElementById('lblHolidayAmount'); if (el) el.innerText = `৳ ${Number(currentResult.holidayAmount).toFixed(2)}`; }
    if (currentResult.nightAmount != null) { const el = document.getElementById('lblNightAmount'); if (el) el.innerText = `৳ ${Number(currentResult.nightAmount).toFixed(2)}`; }
    if (currentResult.totalEarned != null) { const el = document.getElementById('lblGrandTotal'); if (el) el.innerText = `৳ ${Number(currentResult.totalEarned).toFixed(2)}`; }
  }  if (typeof showDaySummary === 'function') showDaySummary(parsed);
  if (typeof showHolidayList === 'function') showHolidayList(parsed.holidayDays);
  if (typeof showNightList === 'function') showNightList(parsed.nightDays);
  if (typeof showRemarks === 'function') showRemarks(parsed.punchProblems, detection);
}

function applyReportViewContext(parsed, detection) {
  const ctx = getReportViewContext(currentSearchId);
  const myId = getPreferredId();
  const empName = (currentResult && currentResult.name) ? currentResult.name : '';
  const isRppf = currentResult?.isRppf !== false;
  const areaName = isRppf ? getAreaForId(currentSearchId, true) : 'Other facility';
  const roleLabel = getInchargeRoleLabel();
  const banner = document.getElementById('viewingContextBanner');
  const badge = document.getElementById('vcBadge');
  const rightMeta = document.getElementById('vcRightMeta');
  const title = document.getElementById('vcTitle');
  const sub = document.getElementById('vcSub');
  const actions = document.getElementById('vcActions');
  if (banner && badge && title && sub && actions) {
    banner.className = 'vc-banner show ' + (ctx === 'own' ? 'vc-own' : ctx === 'other' ? 'vc-other' : 'vc-incharge');
    if (ctx === 'own') {
      badge.textContent = 'Your own report';
      if (rightMeta) rightMeta.textContent = myId ? `Permanent ID: ${myId}` : '';
      title.textContent = empName ? `${empName} (${currentSearchId})` : `Your ID: ${currentSearchId}`;
      sub.textContent = `Area: ${areaName} • This is the current report of your own saved ID.`;
      actions.className = 'vc-actions single-col';
      actions.innerHTML = `<button type="button" class="vc-btn secondary" onclick="promptSearchColleague()">View another colleague report</button>`;
    } else if (ctx === 'other') {
      badge.textContent = 'Viewing another colleague report';
      if (rightMeta) rightMeta.textContent = myId ? `Your ID: ${myId}` : '';
      title.textContent = empName ? `${empName} (${currentSearchId}) report` : `Colleague ID: ${currentSearchId} report`;
      sub.textContent = `This is another colleague overtime statement. Your own permanent ID (${myId}) is safely kept in the app.`;
      actions.className = 'vc-actions';
      actions.innerHTML = `<button type="button" class="vc-btn primary" onclick="loadMyOwnReport()">Back to my report (${esc(myId)})</button>
<button type="button" class="vc-btn secondary" onclick="compareCurrentWithMe()">Compare with me</button>`;
    } else {
      badge.textContent = `${roleLabel} view`;
      if (rightMeta) rightMeta.textContent = `Area: ${areaName}`;
      title.textContent = empName ? `Employee report: ${empName} (${currentSearchId})` : `Employee ID: ${currentSearchId}`;
      sub.textContent = `${roleLabel} mode: viewing employee overtime and punch details.`;
      actions.className = 'vc-actions';
      actions.innerHTML = `<button type="button" class="vc-btn primary" onclick="backToLeaderboard()">Back to ranking and punch list</button>
<button type="button" class="vc-btn secondary" onclick="promptSearchColleague()">Search another employee ID</button>`;
    }
  }
  const step3H = document.getElementById('step3HeadingText');
  const greetBox = document.getElementById('userGreeting');
  const gtLbl = document.getElementById('gtLabelText');
  const step7Lbl = document.getElementById('step7LabelText');
  if (ctx === 'own') {
    if (step3H) step3H.textContent = 'Your overtime';
    if (greetBox) { greetBox.style.display = 'none'; greetBox.innerHTML = `<div class="greet-text"><span id="greetName">${esc(empName || 'User')}</span>, your calculation is ready</div><div class="greet-sub" id="greetSubText">Check it once against your report.</div>`; }
    if (gtLbl) gtLbl.textContent = 'Total Overtime Payable';
    if (step7Lbl) step7Lbl.textContent = 'Is your report correct?';
  } else if (ctx === 'other') {
    if (step3H) step3H.textContent = `${empName || currentSearchId} overtime`;
    if (greetBox) { greetBox.style.display = 'none'; greetBox.innerHTML = `<div class="greet-text">Colleague: <span id="greetName">${esc(empName || currentSearchId)}</span> (${esc(currentSearchId)})</div><div class="greet-sub" id="greetSubText">Showing another colleague overtime calculation (your permanent ID: ${esc(myId)})।</div>`; }
    if (gtLbl) gtLbl.textContent = `${currentSearchId} Total Overtime`;
    if (step7Lbl) step7Lbl.textContent = `${currentSearchId} report and punch status`;
  } else {
    if (step3H) step3H.textContent = `Employee overtime (${currentSearchId})`;
    if (greetBox) { greetBox.style.display = 'none'; greetBox.innerHTML = `<div class="greet-text">Employee: <span id="greetName">${esc(empName || currentSearchId)}</span> (${esc(currentSearchId)})</div><div class="greet-sub" id="greetSubText">${esc(roleLabel)} review • Area: ${esc(areaName)}</div>`; }
    if (gtLbl) gtLbl.textContent = 'Employee Total Overtime';
    if (step7Lbl) step7Lbl.textContent = 'Employee report and punch verification';
  }
}


// ==========================================================================
// DYNAMIC SHIFT DATES DRILLDOWN (OT, Holiday, Night, 4:30 PM Normal Out)
// ==========================================================================
let _currentActiveShiftDrill = null;

function toggleShiftDates(type) {
  const drawer = document.getElementById('shiftDatesDrawer');
  const titleEl = document.getElementById('drawerTitleText');
  const iconEl = document.getElementById('drawerIcon');
  const contentEl = document.getElementById('drawerContent');
  if (!drawer || !contentEl) return;

  // Toggle closed if already open for this type
  if (_currentActiveShiftDrill === type && drawer.style.display !== 'none') {
    closeShiftDates();
    return;
  }

  _currentActiveShiftDrill = type;

  // Remove active class from all drillable rows and cells
  document.querySelectorAll('.clickable-drill').forEach(el => el.classList.remove('drill-active'));

  // Highlight corresponding blocks
  if (type === 'night') {
    document.getElementById('billRowNight')?.classList.add('drill-active');
    document.getElementById('dsCellNight')?.classList.add('drill-active');
  } else if (type === 'holiday') {
    document.getElementById('billRowHol')?.classList.add('drill-active');
    document.getElementById('dsCellHoliday')?.classList.add('drill-active');
  } else if (type === 'ot') {
    document.getElementById('billRowOt')?.classList.add('drill-active');
    document.getElementById('dsCellTotal')?.classList.add('drill-active');
  } else if (type === 'plain') {
    document.getElementById('dsCellPlain')?.classList.add('drill-active');
  }

  // Retrieve current employee record
  const emp = (typeof window !== 'undefined' && (window.currentEmployee || window.currentResult || (window._rptCtx && window._rptCtx.emp))) || null;
  const daily = (emp && Array.isArray(emp.daily)) ? emp.daily : [];

  let html = '';
  if (type === 'night') {
    const rawNights = (emp && Array.isArray(emp.nightDays) && emp.nightDays.length > 0) 
      ? emp.nightDays 
      : daily.filter(r => Array.isArray(r) && Number(r[10]) === 1).map(r => r[0]);
    
    titleEl.textContent = `Night Duty Dates (${rawNights.length} nights)`;
    iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#4F46E5"><path d="M12.3 2a10 10 0 00-1.9 19.8 10 10 0 0011.6-11.6A10 10 0 0112.3 2z"/></svg>`;
    
    if (rawNights.length === 0) {
      html = '<div class="drawer-empty-msg">No night duty shifts recorded this month.</div>';
    } else {
      html = rawNights.map((d, i) => {
        const str = typeof d === 'string' ? d : (d?.date || '');
        return `<div class="date-chip night"><span class="chip-num">${i + 1}</span><span class="chip-date">${esc(str)}</span></div>`;
      }).join('');
    }
  } else if (type === 'holiday') {
    const rawHols = (emp && Array.isArray(emp.holidayDays) && emp.holidayDays.length > 0)
      ? emp.holidayDays
      : [];
    
    titleEl.textContent = `Holiday Duty Dates (${rawHols.length} days)`;
    iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#D97706"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>`;
    
    if (rawHols.length === 0) {
      html = '<div class="drawer-empty-msg">No holiday or day-off duties recorded this month.</div>';
    } else {
      html = rawHols.map((d, i) => {
        if (typeof d === 'string') {
          return `<div class="date-chip hol"><span class="chip-num">${i + 1}</span><span class="chip-date">${esc(d)}</span></div>`;
        }
        const parts = [];
        if (d.doDuty > 0) parts.push(`DO ${d.doDuty}h`);
        if (d.doExtra > 0) parts.push(`DO-OT ${d.doExtra}h`);
        if (d.holDuty > 0) parts.push(`Hol ${d.holDuty}h`);
        if (d.holExtra > 0) parts.push(`Hol-OT ${d.holExtra}h`);
        const detailStr = parts.length > 0 ? ` (${parts.join(', ')})` : '';
        return `<div class="date-chip hol"><span class="chip-num">${i + 1}</span><span class="chip-date">${esc(d.date || '')}</span><span class="chip-sub">${esc(detailStr)}</span></div>`;
      }).join('');
    }
  } else if (type === 'ot') {
    // Clean chronological OT days list (with N badge if night duty)
    const otRows = daily.filter(r => {
      if (!Array.isArray(r)) return false;
      const ot = (Number(r[5]) || 0) + (Number(r[7]) || 0) + (Number(r[9]) || 0);
      return ot > 0;
    });

    const totalOtHours = otRows.reduce((sum, r) => sum + (Number(r[5]) || 0) + (Number(r[7]) || 0) + (Number(r[9]) || 0), 0);

    titleEl.textContent = `Overtime Dates (${otRows.length} days • ${totalOtHours.toFixed(1)} hrs)`;
    iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#2563EB"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`;

    if (otRows.length === 0) {
      html = '<div class="drawer-empty-msg">No overtime shifts recorded this month.</div>';
    } else {
      html = otRows.map((r, i) => {
        const dateStr = r[0] || '';
        const dayStr = r[1] ? ` (${r[1]})` : '';
        const otHrs = ((Number(r[5]) || 0) + (Number(r[7]) || 0) + (Number(r[9]) || 0)).toFixed(1);
        const isNight = Number(r[10]) === 1;
        const nightBadge = isNight ? ' <span class="chip-n-badge" title="Night Shift">N</span>' : '';
        return `<div class="date-chip ot"><span class="chip-num">${i + 1}</span><span class="chip-date">${esc(dateStr)}${esc(dayStr)}</span><span class="chip-hrs">+${otHrs}h${nightBadge}</span></div>`;
      }).join('');
    }
  } else if (type === 'plain') {
    const plainRows = daily.filter(r => {
      if (!Array.isArray(r)) return false;
      const isNight = Number(r[10]) === 1;
      const totalOt = (Number(r[5]) || 0) + (Number(r[7]) || 0) + (Number(r[9]) || 0);
      const totalDuty = (Number(r[4]) || 0) + (Number(r[6]) || 0) + (Number(r[8]) || 0);
      const missPunch = !r[2] || !r[3] || String(r[2]).trim() === '' || String(r[3]).trim() === '';
      return !missPunch && totalDuty > 0 && !isNight && totalOt === 0;
    });

    titleEl.textContent = `4:30 PM Normal Out Dates (${plainRows.length} days)`;
    iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#0284C7"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`;

    if (plainRows.length === 0) {
      html = '<div class="drawer-empty-msg">No 4:30 PM regular out shifts recorded this month.</div>';
    } else {
      html = plainRows.map((r, i) => {
        const dateStr = r[0] || '';
        const dayStr = r[1] ? ` (${r[1]})` : '';
        const timeStr = (r[2] && r[3]) ? ` ${r[2]} - ${r[3]}` : '';
        return `<div class="date-chip plain"><span class="chip-num">${i + 1}</span><span class="chip-date">${esc(dateStr)}${esc(dayStr)}</span><span class="chip-sub">${esc(timeStr)}</span></div>`;
      }).join('');
    }
  }

  contentEl.innerHTML = html;
  drawer.style.display = 'block';
  try { drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
}

function closeShiftDates() {
  _currentActiveShiftDrill = null;
  const drawer = document.getElementById('shiftDatesDrawer');
  if (drawer) drawer.style.display = 'none';
  document.querySelectorAll('.clickable-drill').forEach(el => el.classList.remove('drill-active'));
}

if (typeof window !== 'undefined') {
  window.toggleShiftDates = toggleShiftDates;
  window.closeShiftDates = closeShiftDates;
}
