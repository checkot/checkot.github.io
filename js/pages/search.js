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
  wrap.innerHTML = `<span class="recent-chips-label">Recent:</span>` + uniqueIds.map(id => `<button type="button" class="id-chip" onclick="quickSelectId('${esc(id)}')">${esc(id)}</button>`).join('');
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
  const s = document.getElementById('status');
  if (!s) return;
  const help = `Hello, the overtime report for ID ${currentSearchId || ''} (${currentMonth || ''}) cannot be found in the app. Please check.`;
  s.innerHTML = `<div class="err-box"><div>${esc(msg)}</div>
<button type="button" class="btn-primary" onclick="openErpSupportModal(${ esc(JSON.stringify(help)) })">Message ERP Team on WhatsApp</button></div>`;
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

  ['viewingContextBanner','monthNavBar','step3','step5','step7','payslipCard'].forEach(id => {
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
      showSearchError(`"${rawId}" আইডিটি অনুমোদিত আরপিপিএফ সেকশনে তালিকাভুক্ত নয়। শুধুমাত্র তালিকাভুক্ত কর্মচারীদের হিসাব দেখা যাবে।`);
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
      showSearchError(`${month} overtime data has not been uploaded yet.`);
      return;
    }
    const matchedEmp = fastList.find(e => String(e.id || '').toUpperCase() === searchId);
    if (matchedEmp && isExecHiddenFor(matchedEmp)) {
      if (spinner) spinner.style.display = "none";
      if (searchBtn) searchBtn.disabled = false;
      showSearchError('This ID calculation is visible only in In-Charge mode.');
      return;
    }
    if (matchedEmp) {
      if (spinner) spinner.style.display = "none";
      if (searchBtn) searchBtn.disabled = false;
      if (statusDiv) { statusDiv.style.color = "var(--success)"; statusDiv.innerText = ""; }
      renderInstantEmployeeRecord(matchedEmp, month, searchId);
      return;
    }
    if (spinner) spinner.style.display = "none";
    if (searchBtn) searchBtn.disabled = false;
    if (typeof updateMonthNavBar === 'function') updateMonthNavBar(month);
    showSearchError(`"${rawId}" ID not found in the ${month} report.`);
  } catch (err) {
    console.error(err);
    if (spinner) spinner.style.display = "none";
    if (searchBtn) searchBtn.disabled = false;
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
    greetNameEl.textContent = (currentResult && currentResult.name) ? currentResult.name : "User";
    greetBox.style.display = "block";
  }
  if (detection.gradeText || detection.reason) {
    if (gradeInfo) {
      gradeInfo.style.display = "block";
      gradeInfo.innerText = `Grade: ${detection.gradeText || "—"} • ${areaName}`;
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
    const gi = document.getElementById('gradeInfo'); if (gi) { gi.style.display = 'block'; gi.innerText = `Grade: ${detection.gradeText || '—'} • Hours & days only`; }
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
  }
  if (typeof showDaySummary === 'function') showDaySummary(parsed);
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
      badge.textContent = 'Your report';
      if (rightMeta) rightMeta.textContent = myId ? `ID: ${myId}` : '';
      title.textContent = empName ? `${empName} (${currentSearchId})` : `ID: ${currentSearchId}`;
      sub.textContent = `Area: ${areaName}`;
      actions.className = 'vc-actions single-col';
      actions.innerHTML = `<button type="button" class="vc-btn secondary" onclick="promptSearchColleague()">Search colleague ID</button>`;
    } else if (ctx === 'other') {
      badge.textContent = 'Colleague report';
      if (rightMeta) rightMeta.textContent = myId ? `Saved ID: ${myId}` : '';
      title.textContent = empName ? `${empName} (${currentSearchId})` : `Colleague: ${currentSearchId}`;
      sub.textContent = `Area: ${areaName}`;
      actions.className = 'vc-actions';
      actions.innerHTML = `<button type="button" class="vc-btn secondary" onclick="compareCurrentWithMe()">Compare 1v1</button>
<button type="button" class="vc-btn primary" onclick="loadMyOwnReport()">My report (${esc(myId)})</button>`;
    } else {
      badge.textContent = `${roleLabel}`;
      if (rightMeta) rightMeta.textContent = areaName;
      title.textContent = empName ? `${empName} (${currentSearchId})` : `ID: ${currentSearchId}`;
      sub.textContent = `Employee overtime & punch summary`;
      actions.className = 'vc-actions';
      actions.innerHTML = `<button type="button" class="vc-btn secondary" onclick="promptSearchColleague()">Search ID</button>
<button type="button" class="vc-btn primary" onclick="backToLeaderboard()">‹ Ranking list</button>`;
    }
  }
  const step3H = document.getElementById('step3HeadingText');
  const greetBox = document.getElementById('userGreeting');
  const gtLbl = document.getElementById('gtLabelText');
  const step7Lbl = document.getElementById('step7LabelText');
  const gradeTxt = detection?.gradeText ? ` • ${detection.gradeText}` : '';
  if (ctx === 'own') {
    if (step3H) step3H.textContent = 'Your overtime';
    if (greetBox) { greetBox.style.display = 'block'; greetBox.innerHTML = `<div class="greet-text"><span id="greetName">${esc(empName || 'User')}</span></div><div class="greet-sub" id="greetSubText">${esc(areaName)}${esc(gradeTxt)}</div>`; }
    if (gtLbl) gtLbl.textContent = 'Total overtime allowance';
    if (step7Lbl) step7Lbl.textContent = 'Report & punch status';
  } else if (ctx === 'other') {
    if (step3H) step3H.textContent = `Overtime (${currentSearchId})`;
    if (greetBox) { greetBox.style.display = 'block'; greetBox.innerHTML = `<div class="greet-text"><span id="greetName">${esc(empName || currentSearchId)}</span></div><div class="greet-sub" id="greetSubText">${esc(areaName)}${esc(gradeTxt)}</div>`; }
    if (gtLbl) gtLbl.textContent = `Total overtime allowance`;
    if (step7Lbl) step7Lbl.textContent = `Report & punch status`;
  } else {
    if (step3H) step3H.textContent = `Overtime (${currentSearchId})`;
    if (greetBox) { greetBox.style.display = 'block'; greetBox.innerHTML = `<div class="greet-text"><span id="greetName">${esc(empName || currentSearchId)}</span></div><div class="greet-sub" id="greetSubText">${esc(areaName)}${esc(gradeTxt)}</div>`; }
    if (gtLbl) gtLbl.textContent = 'Total overtime allowance';
    if (step7Lbl) step7Lbl.textContent = 'Report & punch verification';
  }
}
