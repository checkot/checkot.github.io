/* ==========================================================================
   VS.JS - 1v1 / 1v1v1 Overtime & Allowance Comparison Controller
   ========================================================================== */

function setVsMode(mode) {
  currentVsMode = mode === 3 ? 3 : mode === 'custom' ? 'custom' : 2;
  document.getElementById('vsModeBtn2')?.classList.toggle('active', currentVsMode === 2);
  document.getElementById('vsModeBtn3')?.classList.toggle('active', currentVsMode === 3);
  document.getElementById('vsModeBtnCustom')?.classList.toggle('active', currentVsMode === 'custom');
  const grid = document.getElementById('vsInputsGrid');
  const countBar = document.getElementById('vsCustomCountBar');
  const slot3 = document.getElementById('vsSlot3Wrap');
  if (grid) {
    grid.style.display = 'grid';
    grid.classList.toggle('mode-2', currentVsMode === 2 || currentVsMode === 'custom');
    grid.classList.toggle('mode-3', currentVsMode === 3);
  }
  if (slot3) slot3.style.display = (currentVsMode === 3 || currentVsMode === 'custom') ? 'block' : 'none';
  if (countBar) countBar.classList.toggle('show', currentVsMode === 'custom');
  if (typeof renderExtraVsSlots === 'function') renderExtraVsSlots();
}

function populateVsMonthSelect() {
  const sel = document.getElementById('vsMonthOverrideSelect');
  if (!sel) return;
  const curM = currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  const opts = (Array.isArray(availableServerMonths) && availableServerMonths.length > 0) ? [...availableServerMonths] : (typeof getPreviousMonthStrings === 'function' ? getPreviousMonthStrings(curM, 6).reverse() : [curM]);
  if (!opts.includes(curM)) opts.push(curM);
  opts.sort().reverse();
  sel.innerHTML = opts.map(ym => `<option value="${esc(ym)}" ${ym === curM ? 'selected' : ''}>${esc(ym)}</option>`).join('');
}

function renderVsQuickPicks() {
  const box = document.getElementById('vsQuickPicksRow');
  if (!box) return;
  const hist = (typeof getHistory === 'function' ? getHistory() : []).map(h => h.id);
  const topLb = (currentLeaderboardResult?.sortedByDuty || []).slice(0, 4).map(e => e.id);
  const candidates = [...new Set([...hist, ...topLb])].filter(id => id && id !== (document.getElementById('compareId1')?.value || '')).slice(0, 5);
  if (!candidates.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<span style="font-size:11px;color:var(--muted);font-weight:600;">Quick pick:</span>` + candidates.map(id => `<button type="button" class="vs-Quick-chip" onclick="fillVsCandidateId('${esc(id)}')">${esc(id)}</button>`).join('');
}

function fillVsCandidateId(id) {
  const inputs = [...document.querySelectorAll('#vsInputsGrid input.vs-emp-id-input')].filter(el => el.offsetParent !== null);
  for (let i = 1; i < inputs.length; i++) {
    if (!inputs[i].value.trim()) { inputs[i].value = id; return; }
  }
  if (inputs[1]) inputs[1].value = id;
}

function onVsPeriodChange() {
  const p = document.getElementById('vsPeriodSelect')?.value || 'current';
  const mSel = document.getElementById('vsMonthOverrideSelect');
  if (mSel) mSel.style.display = p === 'current' ? '' : 'none';
}

function onVsMonthOverrideChange() {
  const sub = document.getElementById('vsPageSub');
  const ym = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  if (sub) sub.textContent = `Compare overtime & allowances (${ym})`;
}

function initVsPage() {
  const inp1 = document.getElementById('compareId1');
  if (inp1 && !inp1.value.trim()) {
    inp1.value = currentSearchId || (typeof getPreferredId === 'function' ? getPreferredId() : '') || '';
  }
  populateVsMonthSelect();
  renderVsQuickPicks();
  const sub = document.getElementById('vsPageSub');
  const mStr = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  if (sub && mStr) sub.textContent = `Compare overtime & allowances (${mStr})`;
}

function buildCompareRecord(emp, idStr) {
  applyTypeOverride(emp);
  const cat = emp.category || detectCategory(emp.grade || '', idStr).category || 'JO';
  const r = RATE_TABLE[cat] || RATE_TABLE.JO;
  const otHours = Number(emp.otHours || 0);
  const holidayCount = Number(emp.holidayCount != null ? emp.holidayCount : emp.holiday || 0);
  const nightCount = Number(emp.nightCount != null ? emp.nightCount : emp.night || 0);
  const otAmount = emp.otAmount != null ? Number(emp.otAmount) : (otHours * r.otRate);
  const holidayAmount = emp.holidayAmount != null ? Number(emp.holidayAmount) : (r.holidayType === "hourly" ? holidayCount * r.holidayHours * r.otRate : holidayCount * r.holidayFlat);
  const nightAmount = emp.nightAmount != null ? Number(emp.nightAmount) : (nightCount * r.nightRate);
  const totalDuty = Number(emp.totalDuty || 0);
  return {
    id: idStr,
    name: emp.name || idStr,
    category: cat,
    categoryName: r.name || cat,
    totalDuty,
    otHours,
    holiday: holidayCount,
    night: nightCount,
    plainDays: Number(emp.plainDaysCount != null ? emp.plainDaysCount : emp.plainDays || 0),
    otAmount,
    holidayAmount,
    nightAmount,
    totalEarned: emp.totalEarned != null ? Number(emp.totalEarned) : (otAmount + holidayAmount + nightAmount),
    grade: emp.grade || ''
  };
}

function buildCustomSimRecord(label, cat, otHours, holiday, night) {
  const r = RATE_TABLE[cat] || RATE_TABLE.JO;
  const otAmount = otHours * r.otRate;
  const holidayAmount = r.holidayType === 'hourly' ? holiday * r.holidayHours * r.otRate : holiday * r.holidayFlat;
  const nightAmount = night * r.nightRate;
  return {
    id: label,
    name: r.name || cat,
    category: cat,
    categoryName: r.name || cat,
    totalDuty: Number((otHours + holiday * 8).toFixed(1)),
    otHours,
    holiday,
    night,
    plainDays: 0,
    otAmount,
    holidayAmount,
    nightAmount,
    totalEarned: otAmount + holidayAmount + nightAmount,
    grade: cat
  };
}

async function runComparison() {
  const statusDiv = document.getElementById('compareStatus');
  const compareBtn = document.getElementById('compareBtn');
  const resultDiv = document.getElementById('compareResult');
  const inp1El = document.getElementById('compareId1');
  const id1 = (inp1El && inp1El.value.trim() ? inp1El.value.trim() : (currentSearchId || (typeof getPreferredId === 'function' ? getPreferredId() : '') || '')).toUpperCase().replace(/\s+/g, '');
  const id2 = (document.getElementById('compareId')?.value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!id1) { showToast("Enter 1st employee ID number", "warn"); inp1El?.focus(); return; }
  if (!id2) { showToast("Enter 2nd employee ID number", "warn"); document.getElementById('compareId')?.focus(); return; }
  const _cmpIds = [id1, id2];
  if (currentVsMode === 3) {
    const id3 = (document.getElementById('compareId3')?.value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (id3) _cmpIds.push(id3);
  }
  const _unlisted = _cmpIds.filter(id => !isListedEmployeeId(id));
  if (_unlisted.length > 0) {
    showToast(`ID ${_unlisted.join(', ')} is not listed in RPPF sections`, 'error');
    return;
  }
  if (id1 === id2) { showToast("Both ID numbers are the same. Enter a different ID.", "warn"); return; }
  
  if (statusDiv) { statusDiv.style.color = "var(--primary-blue)"; statusDiv.innerText = "Comparing..."; }
  if (compareBtn) compareBtn.disabled = true;

  try {
    const month = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
    const fastList = await fetchMonthPreIndexedData(month);
    const records = [];
    for (const targetId of _cmpIds) {
      const found = fastList.find(e => String(e.id || '').toUpperCase() === targetId);
      if (!found) {
        if (statusDiv) { statusDiv.style.color = "var(--danger)"; statusDiv.innerText = `"${targetId}" ID was not found in ${month} data.`; }
        if (compareBtn) compareBtn.disabled = false;
        return;
      }
      if (typeof isExecHiddenFor === 'function' && isExecHiddenFor(found)) {
        showToast(`"${targetId}" calculation is visible only in in-charge mode`, 'warn');
        if (compareBtn) compareBtn.disabled = false;
        return;
      }
      records.push(buildCompareRecord(found, targetId));
    }
    if (statusDiv) statusDiv.innerText = "";
    if (compareBtn) compareBtn.disabled = false;
    if (resultDiv) {
      resultDiv.style.display = "block";
      resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (typeof showComparison === "function") showComparison(records[0], records[1], records[1].id, records[2] || null, records);
  } catch (err) {
    console.error(err);
    if (statusDiv) { statusDiv.style.color = "var(--danger)"; statusDiv.innerText = "Failed to load comparison data."; }
    if (compareBtn) compareBtn.disabled = false;
  }
}
