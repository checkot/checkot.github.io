/* ==========================================================================
   VS.JS - 1v1 / 1v1v1 Overtime & Allowance Comparison Controller
   ========================================================================== */

let _vsCachedEmps = {};

async function getVsLoadedEmployees(monthStr) {
  const m = monthStr || document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '') || '2026-10';
  if (_vsCachedEmps[m] && Array.isArray(_vsCachedEmps[m]) && _vsCachedEmps[m].length > 0) return _vsCachedEmps[m];
  try {
    const list = await fetchMonthPreIndexedData(m, false, false);
    if (Array.isArray(list) && list.length > 0) {
      _vsCachedEmps[m] = list;
      return list;
    }
  } catch (e) {}
  return [];
}

function setVsMode(mode) {
  currentVsMode = mode === 3 ? 3 : mode === 'custom' ? 'custom' : 2;
  document.getElementById('vsModeBtn2')?.classList.toggle('active', currentVsMode === 2);
  document.getElementById('vsModeBtn3')?.classList.toggle('active', currentVsMode === 3);
  document.getElementById('vsModeBtnCustom')?.classList.toggle('active', currentVsMode === 'custom');
  const grid = document.getElementById('vsInputsGrid');
  const countBar = document.getElementById('vsCustomCountBar');
  const slot3 = document.getElementById('vsSlot3Wrap');
  const swapBtn = document.getElementById('vsSwapContainer');
  if (grid) {
    grid.style.display = 'grid';
    grid.classList.toggle('mode-2', currentVsMode === 2 || currentVsMode === 'custom');
    grid.classList.toggle('mode-3', currentVsMode === 3);
  }
  if (slot3) slot3.style.display = (currentVsMode === 3 || currentVsMode === 'custom') ? 'block' : 'none';
  if (swapBtn) swapBtn.style.display = currentVsMode === 2 ? 'flex' : 'none';
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
  box.innerHTML = `<span style="font-size:11px;color:var(--muted);font-weight:700;">🕒 Recent:</span>` + candidates.map(id => `<button type="button" class="vs-Quick-chip" onclick="fillVsCandidateId('${esc(id)}')">${esc(id)}</button>`).join('');
}

function fillVsCandidateId(id) {
  const inputs = [...document.querySelectorAll('#vsInputsGrid input.vs-emp-id-input')].filter(el => el.offsetParent !== null);
  for (let i = 1; i < inputs.length; i++) {
    if (!inputs[i].value.trim()) {
      inputs[i].value = id;
      updateVsSlotPreview(i === 1 ? 2 : (i + 1), id);
      return;
    }
  }
  if (inputs[1]) {
    inputs[1].value = id;
    updateVsSlotPreview(2, id);
  }
}

function onVsPeriodChange() {
  const p = document.getElementById('vsPeriodSelect')?.value || 'current';
  const mCol = document.getElementById('vsMonthCol');
  if (mCol) mCol.style.display = p === 'current' ? 'flex' : 'none';
  const sub = document.getElementById('vsPageSub');
  if (sub) {
    if (p === 'current') {
      const ym = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
      sub.textContent = `Compare overtime & allowances (${ym})`;
    } else {
      const pText = document.getElementById('vsPeriodSelect')?.selectedOptions?.[0]?.text || document.getElementById('vsPeriodSelect')?.options?.[document.getElementById('vsPeriodSelect')?.selectedIndex]?.text || p;
      sub.textContent = `Compare overtime & allowances (${pText})`;
    }
  }
}

function onVsMonthOverrideChange() {
  const sub = document.getElementById('vsPageSub');
  const ym = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  if (sub) sub.textContent = `Compare overtime & allowances (${ym})`;
  updateVsAllPreviews();
}

function swapVsSlots(slotA, slotB) {
  const inpA = slotA === 1 ? document.getElementById('compareId1') : document.getElementById(slotA === 2 ? 'compareId' : 'compareId' + slotA);
  const inpB = slotB === 1 ? document.getElementById('compareId1') : document.getElementById(slotB === 2 ? 'compareId' : 'compareId' + slotB);
  if (!inpA || !inpB) return;
  const temp = inpA.value;
  inpA.value = inpB.value;
  inpB.value = temp;
  updateVsSlotPreview(slotA, inpA.value);
  updateVsSlotPreview(slotB, inpB.value);
  if (typeof showToast === 'function') showToast('Swapped Colleague 1 & 2 ⇄', 'info');
  if (inpA.value.trim() && inpB.value.trim()) {
    runComparison();
  }
}

function clearVsSlot(inputId) {
  const inp = document.getElementById(inputId);
  if (inp) {
    inp.value = '';
    inp.focus();
    const slotNum = inputId === 'compareId1' ? 1 : inputId === 'compareId' ? 2 : 3;
    updateVsSlotPreview(slotNum, '');
  }
}

let _vsInputTimers = {};
function onVsIdInput(slotNum, val) {
  clearTimeout(_vsInputTimers[slotNum]);
  _vsInputTimers[slotNum] = setTimeout(() => {
    updateVsSlotPreview(slotNum, val);
  }, 100);
}

async function updateVsSlotPreview(slotNum, rawId) {
  const el = document.getElementById(`vsPreviewId${slotNum}`);
  if (!el) return;
  const id = String(rawId || '').trim().toUpperCase();
  if (!id) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }
  
  const m = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '') || '2026-10';
  const list = await getVsLoadedEmployees(m);
  const targetId = (typeof resolveEmpAliasId === 'function') ? resolveEmpAliasId(id) : id;
  const found = list.find(e => {
    const eid = String(e && e.id || '').toUpperCase();
    return eid === id || eid === targetId;
  });
  
  if (found) {
    const name = found.name || id;
    const sub = found.sub || found.subsection || '';
    const area = found.area || '';
    const ot = Number(found.otHours || 0);
    const badgeTxt = sub ? sub : (area ? area : (found.grade || ''));
    el.innerHTML = `
      <span class="vs-preview-avatar">${esc(name.charAt(0))}</span>
      <div style="display:flex;flex-direction:column;min-width:0;flex:1;">
        <span class="vs-preview-name">${esc(name)}</span>
        <span class="vs-preview-sub">${esc(badgeTxt)}</span>
      </div>
      <span class="vs-preview-badge">${ot > 0 ? ot + 'h OT' : 'Active'}</span>
    `;
    el.style.display = 'flex';
  } else {
    if (typeof isListedEmployeeId === 'function' && !isListedEmployeeId(id)) {
      el.innerHTML = `<span style="color:var(--danger);font-weight:700;font-size:11px;">⚠️ ID not listed in RPPF sections</span>`;
    } else {
      el.innerHTML = `<span style="color:var(--muted);font-weight:600;font-size:11px;">ID: ${esc(id)}</span>`;
    }
    el.style.display = 'flex';
  }
}

async function updateVsAllPreviews() {
  const id1 = document.getElementById('compareId1')?.value || '';
  const id2 = document.getElementById('compareId')?.value || '';
  const id3 = document.getElementById('compareId3')?.value || '';
  if (id1) updateVsSlotPreview(1, id1);
  if (id2) updateVsSlotPreview(2, id2);
  if (id3) updateVsSlotPreview(3, id3);
}

/* ===== Solid Subsections Quick Comparison Shortcuts ===== */
async function quickCompareSolidSub(subName) {
  const statusDiv = document.getElementById('compareStatus');
  if (statusDiv) {
    statusDiv.style.color = 'var(--brand)';
    statusDiv.innerText = `Loading top operators from Solid → ${subName}...`;
  }
  
  const m = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '') || '2026-10';
  const list = await getVsLoadedEmployees(m);
  if (!list.length) {
    if (typeof showToast === 'function') showToast('Could not load data for ' + m, 'error');
    if (statusDiv) statusDiv.innerText = '';
    return;
  }
  
  const subLower = String(subName || '').trim().toLowerCase();
  const matched = list.filter(e => {
    if (!e || !e.id) return false;
    const a = String(e.area || '').toLowerCase();
    const s = String(e.sub || e.subsection || '').toLowerCase();
    const isSolid = a.includes('solid') || a === 'solid production';
    return isSolid && (s === subLower || s.includes(subLower));
  });
  
  if (matched.length < 2) {
    if (typeof showToast === 'function') showToast(`Found ${matched.length} employees in Solid → ${subName}. Minimum 2 needed to compare.`, 'warn');
    if (matched.length === 1) {
      const inp1 = document.getElementById('compareId1');
      if (inp1) { inp1.value = matched[0].id; updateVsSlotPreview(1, matched[0].id); }
    }
    if (statusDiv) statusDiv.innerText = '';
    return;
  }
  
  // Sort by OT hours descending, then duty descending
  matched.sort((a, b) => (Number(b.otHours || 0) - Number(a.otHours || 0)) || (Number(b.totalDuty || 0) - Number(a.totalDuty || 0)));
  
  const emp1 = matched[0];
  const emp2 = matched[1];
  
  const inp1 = document.getElementById('compareId1');
  const inp2 = document.getElementById('compareId');
  if (inp1) { inp1.value = emp1.id; updateVsSlotPreview(1, emp1.id); }
  if (inp2) { inp2.value = emp2.id; updateVsSlotPreview(2, emp2.id); }
  
  if (currentVsMode === 3 && matched.length >= 3) {
    const inp3 = document.getElementById('compareId3');
    if (inp3) { inp3.value = matched[2].id; updateVsSlotPreview(3, matched[2].id); }
  }
  
  // Mark active chip
  document.querySelectorAll('.vs-sub-chip').forEach(c => {
    c.classList.toggle('active', c.getAttribute('data-sub') === subName);
  });
  
  if (typeof showToast === 'function') {
    showToast(`Solid → ${subName}: Loaded top 2 (${emp1.id} vs ${emp2.id})`, 'success');
  }
  
  if (statusDiv) statusDiv.innerText = '';
  runComparison();
}

async function quickCompareSolidCross(sub1, sub2) {
  const statusDiv = document.getElementById('compareStatus');
  if (statusDiv) {
    statusDiv.style.color = 'var(--brand)';
    statusDiv.innerText = `Loading top operators: ${sub1} vs ${sub2}...`;
  }
  
  const m = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '') || '2026-10';
  const list = await getVsLoadedEmployees(m);
  if (!list.length) {
    if (typeof showToast === 'function') showToast('Could not load data for ' + m, 'error');
    if (statusDiv) statusDiv.innerText = '';
    return;
  }
  
  const getTopInSub = (sName) => {
    const sl = String(sName).trim().toLowerCase();
    const emps = list.filter(e => {
      if (!e || !e.id) return false;
      const a = String(e.area || '').toLowerCase();
      const s = String(e.sub || e.subsection || '').toLowerCase();
      return (a.includes('solid') || a === 'solid production') && (s === sl || s.includes(sl));
    });
    emps.sort((a, b) => (Number(b.otHours || 0) - Number(a.otHours || 0)) || (Number(b.totalDuty || 0) - Number(a.totalDuty || 0)));
    return emps[0];
  };
  
  const emp1 = getTopInSub(sub1);
  const emp2 = getTopInSub(sub2);
  
  if (!emp1 || !emp2) {
    if (typeof showToast === 'function') showToast(`Could not find active operators in ${!emp1 ? sub1 : sub2}`, 'warn');
    if (statusDiv) statusDiv.innerText = '';
    return;
  }
  
  const inp1 = document.getElementById('compareId1');
  const inp2 = document.getElementById('compareId');
  if (inp1) { inp1.value = emp1.id; updateVsSlotPreview(1, emp1.id); }
  if (inp2) { inp2.value = emp2.id; updateVsSlotPreview(2, emp2.id); }
  
  document.querySelectorAll('.vs-sub-chip').forEach(c => c.classList.remove('active'));
  
  if (typeof showToast === 'function') {
    showToast(`${sub1} vs ${sub2}: Loaded #1 of each (${emp1.id} vs ${emp2.id})`, 'success');
  }
  
  if (statusDiv) statusDiv.innerText = '';
  runComparison();
}

function initVsPage() {
  const inp1 = document.getElementById('compareId1');
  if (inp1 && !inp1.value.trim()) {
    inp1.value = currentSearchId || (typeof getPreferredId === 'function' ? getPreferredId() : '') || '';
  }
  populateVsMonthSelect();
  renderVsQuickPicks();
  updateVsAllPreviews();
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
    otDays: getEmpOtDays(emp),
    holiday: holidayCount,
    night: nightCount,
    plainDays: Number(emp.plainDaysCount != null ? emp.plainDaysCount : emp.plainDays || 0),
    absentCount: Number(emp.absentCount != null ? emp.absentCount : (emp.generalAbsentCount != null ? emp.generalAbsentCount : (Array.isArray(emp.generalAbsentDays) ? emp.generalAbsentDays.length : 0))),
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
    otDays: null,
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

function getVsMonthsForPeriod(periodMode, baseMonth) {
  let base = baseMonth || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '') || '2026-11';
  // For YTD or All-Time, always default to the latest available month of the year
  if (periodMode === 'ytd' || periodMode === 'alltime') {
    const latest = (Array.isArray(window.availableServerMonths) && window.availableServerMonths.length)
      ? window.availableServerMonths.slice().sort().reverse()[0]
      : (currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '') || '2026-11');
    if (latest) base = latest;
  }
  if (periodMode === 'current') return [base];
  
  const getPrev = (count) => {
    if (typeof getPreviousMonthStrings === 'function') {
      return getPreviousMonthStrings(base, count);
    }
    const [yy, mm] = base.split('-').map(Number);
    const out = [];
    let y = yy || 2026, m = mm || 11;
    for (let i = 0; i < count; i++) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m -= 1;
      if (m < 1) { m = 12; y -= 1; }
    }
    return out;
  };

  if (periodMode === '3m') return getPrev(3);
  if (periodMode === '6m') return getPrev(6);
  if (periodMode === '1y') return getPrev(12);
  if (periodMode === 'ytd') {
    if (typeof getYearToDateMonths === 'function') return getYearToDateMonths(base);
    const [yy, mm] = base.split('-').map(Number);
    const out = [];
    for (let m = 1; m <= (mm || 12); m++) {
      out.push(`${yy || 2026}-${String(m).padStart(2, '0')}`);
    }
    return out;
  }
  if (periodMode === 'alltime') {
    if (typeof getAllTime2026Months === 'function') return getAllTime2026Months(base);
    if (Array.isArray(window.availableServerMonths) && window.availableServerMonths.length) {
      return [...window.availableServerMonths];
    }
    return getPrev(12);
  }
  return [base];
}


function getEmpMonthAbsentCount(emp, monthStr) {
  // Always compute from this employee's own month data. Never depend on the ranking screen's time mode.
  if (typeof getEmpMonthAbsentSafe === 'function') return getEmpMonthAbsentSafe(emp, monthStr);
  if (!emp) return 0;
  if (Array.isArray(emp.generalAbsentDays)) return emp.generalAbsentDays.length;
  return Number(emp.generalAbsentCount) || 0;
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
  
  let _cmpIds = [id1, id2];
  if (currentVsMode === 3) {
    const id3 = (document.getElementById('compareId3')?.value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (id3) _cmpIds.push(id3);
  } else if (currentVsMode === 'custom') {
    const id3 = (document.getElementById('compareId3')?.value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (id3) _cmpIds.push(id3);
    const extraInputs = document.querySelectorAll('#vsExtraSlotsContainer input.vs-emp-id-input');
    extraInputs.forEach(inp => {
      const v = (inp.value || '').trim().toUpperCase().replace(/\s+/g, '');
      if (v) _cmpIds.push(v);
    });
  }

  const _unlisted = _cmpIds.filter(id => !isListedEmployeeId(id));
  if (_unlisted.length > 0) {
    showToast(`ID ${_unlisted.join(', ')} is not listed in RPPF sections`, 'error');
    return;
  }
  if (new Set(_cmpIds).size !== _cmpIds.length) {
    showToast("Duplicate ID numbers entered. Enter different IDs.", "warn");
    return;
  }
  
  if (statusDiv) { statusDiv.style.color = "var(--primary-blue)"; statusDiv.innerText = "Comparing..."; }
  if (compareBtn) compareBtn.disabled = true;

  try {
    const periodSelect = document.getElementById('vsPeriodSelect');
    const periodMode = periodSelect?.value || 'current';
    const periodLabel = (periodSelect?.options && periodSelect.selectedIndex >= 0 && periodSelect.options[periodSelect.selectedIndex]) ? periodSelect.options[periodSelect.selectedIndex].text : "" || (periodMode === 'current' ? 'Selected Month' : periodMode);
    const month = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '') || '2026-11';
    
    const monthsToLoad = getVsMonthsForPeriod(periodMode, month);
    const loadedLists = await Promise.all(
      monthsToLoad.map(m => fetchMonthPreIndexedData(m, false, false).catch(() => []))
    );
    // Previous months are needed to know who worked the last night (affects first-day absent logic)
    try { await Promise.all(monthsToLoad.map(m => getPrevMonthStr(m)).filter(pm => pm && !monthsToLoad.includes(pm)).map(pm => fetchMonthPreIndexedData(pm, false, false).catch(() => null))); } catch (e) {}

    const records = [];
    for (const targetId of _cmpIds) {
      let baseFound = null;
      let totalDuty = 0;
      let otHours = 0;
      let holiday = 0;
      let night = 0;
      let plainDays = 0;
      let otDays = 0;
      let totalAbsent = 0;
      let otAmount = 0;
      let holidayAmount = 0;
      let nightAmount = 0;
      let totalEarned = 0;
      let monthsHit = 0;

      for (let i = 0; i < monthsToLoad.length; i++) {
        const list = loadedLists[i];
        if (!Array.isArray(list) || !list.length) continue;
        const found = list.find(e => {
          const u = String(e && e.id || '').toUpperCase();
          if (u === targetId) return true;
          if (typeof resolveEmpAliasId === 'function' && String(resolveEmpAliasId(u) || '').toUpperCase() === targetId) return true;
          return false;
        });

        if (found) {
          monthsHit++;
          if (!baseFound) baseFound = found;
          totalDuty += Number(found.totalDuty || 0);
          otHours += Number(found.otHours || 0);
          holiday += Number(found.holidayCount != null ? found.holidayCount : found.holiday || 0);
          night += Number(found.nightCount != null ? found.nightCount : found.night || 0);
          plainDays += Number(found.plainDaysCount != null ? found.plainDaysCount : found.plainDays || 0);
          otDays += getEmpOtDays(found);
          totalAbsent += getEmpMonthAbsentCount(found, monthsToLoad[i]);
          if (found.totalEarned != null) {
            totalEarned += Number(found.totalEarned || 0);
            otAmount += Number(found.otAmount || 0);
            holidayAmount += Number(found.holidayAmount || 0);
            nightAmount += Number(found.nightAmount || 0);
          }
        }
      }

      // Fallback: If not in any loaded month list, check master directory
      if (!baseFound) {
        if (typeof searchEmployeeDirectory === 'function') {
          const dirMatch = searchEmployeeDirectory(targetId, 1);
          if (dirMatch && dirMatch[0] && String(dirMatch[0].id || '').toUpperCase() === targetId) {
            baseFound = dirMatch[0];
          }
        }
      }

      // If employee has no data in ANY of the period months AND not in directory
      if (!baseFound && monthsHit === 0) {
        if (statusDiv) {
          statusDiv.style.color = "var(--danger)";
          statusDiv.innerText = `"${targetId}" ID was not found in ${periodMode === 'current' ? month : periodLabel} data.`;
        }
        if (compareBtn) compareBtn.disabled = false;
        return;
      }

      if (baseFound && typeof isExecHiddenFor === 'function' && isExecHiddenFor(baseFound)) {
        showToast(`"${targetId}" calculation is visible only in in-charge mode`, 'warn');
        if (compareBtn) compareBtn.disabled = false;
        return;
      }

      // Build synthetic record for multi-month or single month
      const syntheticEmp = {
        ...(baseFound || {}),
        id: targetId,
        name: baseFound?.name || targetId,
        grade: baseFound?.grade || baseFound?.designation || '',
        category: baseFound?.category,
        totalDuty: Number(totalDuty.toFixed(2)),
        otHours: Number(otHours.toFixed(2)),
        holiday: holiday,
        holidayCount: holiday,
        night: night,
        nightCount: night,
        plainDays: plainDays,
        plainDaysCount: plainDays,
        otDaysCount: otDays,
        absentCount: totalAbsent,
        generalAbsentCount: totalAbsent
      };

      if (monthsToLoad.length > 1 && totalEarned > 0) {
        syntheticEmp.otAmount = Number(otAmount.toFixed(2));
        syntheticEmp.holidayAmount = Number(holidayAmount.toFixed(2));
        syntheticEmp.nightAmount = Number(nightAmount.toFixed(2));
        syntheticEmp.totalEarned = Number(totalEarned.toFixed(2));
      }

      records.push(buildCompareRecord(syntheticEmp, targetId));
    }

    if (statusDiv) statusDiv.innerText = "";
    if (compareBtn) compareBtn.disabled = false;
    if (resultDiv) {
      resultDiv.style.display = "block";
      resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (typeof showComparison === "function") {
      showComparison(records[0], records[1], records[1].id, records[2] || null, records);
      // Insert period note if multi-month
      if (periodMode !== 'current') {
        const target = document.getElementById('vsExportTarget');
        if (target && !target.querySelector('.vs-period-note')) {
          const note = document.createElement('div');
          note.className = 'vs-period-note';
          note.style.cssText = 'padding:6px 10px;margin-bottom:8px;border-radius:6px;background:var(--brand-soft);color:var(--brand-text);font-size:11.5px;font-weight:700;text-align:center;';
          const chrono = monthsToLoad.slice().sort();
          note.textContent = `Period: ${periodLabel} (${chrono[0]} to ${chrono[chrono.length - 1]})`;
          target.insertBefore(note, target.firstChild);
        }
      }
    }
  } catch (err) {
    console.error(err);
    if (statusDiv) { statusDiv.style.color = "var(--danger)"; statusDiv.innerText = "Failed to load comparison data."; }
    if (compareBtn) compareBtn.disabled = false;
  }
}
