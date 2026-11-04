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
  const sub = document.getElementById('vsPageSub');
  if (sub) {
    if (p === 'current') {
      const ym = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
      sub.textContent = `Compare overtime & allowances (${ym})`;
    } else {
      const pText = document.getElementById('vsPeriodSelect')?.options[document.getElementById('vsPeriodSelect')?.selectedIndex]?.text || p;
      sub.textContent = `Compare overtime & allowances (${pText})`;
    }
  }
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
  if (!emp) return 0;
  if (emp.generalAbsentCount != null && Number(emp.generalAbsentCount) >= 0) {
    return Number(emp.generalAbsentCount);
  }
  if (Array.isArray(emp.generalAbsentDays) && emp.generalAbsentDays.length > 0) {
    return emp.generalAbsentDays.length;
  }
  if (typeof getGeneralAbsentCount === 'function') {
    try {
      const c = getGeneralAbsentCount(emp, monthStr);
      if (c != null && !isNaN(c)) return Number(c);
    } catch (e) {}
  }
  if (!Array.isArray(emp.daily) || !emp.daily.length) return 0;
  try {
    const ym = (monthStr || '2026-10').split('-');
    const yy = parseInt(ym[0], 10) || 2026;
    const mm = parseInt(ym[1], 10) || 10;
    const lastDay = (mm === 12) ? 31 : new Date(yy, mm, 0).getDate();
    const worked = new Set();
    const nights = new Set();
    let maxDay = 0;
    emp.daily.forEach(r => {
      if (!r || !r[0]) return;
      const parts = String(r[0]).split('-');
      if (parts.length >= 1 && !isNaN(parts[0])) {
        const d = parseInt(parts[0], 10);
        maxDay = Math.max(maxDay, d);
        const inStr = String(r[2] || '').trim();
        const outStr = String(r[3] || '').trim();
        const duty = Number(r[4]||0) + Number(r[6]||0) + Number(r[8]||0);
        const ot = Number(r[5]||0) + Number(r[7]||0) + Number(r[9]||0);
        const isNight = r[10] === 1 || String(r[11]||'').toUpperCase().includes('NIGHT') || String(r[11]||'').toUpperCase().includes('DN');
        if (duty > 0 || ot > 0 || (inStr && inStr !== '-') || (outStr && outStr !== '-')) {
          worked.add(d);
        }
        if (isNight) nights.add(d);
      }
    });

    const nowD = new Date();
    const isCurrentM = (yy === nowD.getFullYear() && mm === (nowD.getMonth() + 1));
    const cutoff = isCurrentM ? Math.min(lastDay, maxDay > 0 ? maxDay : nowD.getDate()) : lastDay;

    let absCnt = 0;
    for (let d = 1; d <= cutoff; d++) {
      const dt = new Date(yy, mm - 1, d);
      const dayName = dt.toLocaleString('en-US', { weekday: 'short' });
      if (dayName === 'Thu' || dayName === 'Fri') continue;
      if (d > 1 && nights.has(d - 1)) continue;
      if (!worked.has(d)) absCnt++;
    }
    return absCnt;
  } catch (err) {
    return 0;
  }
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
    const periodLabel = periodSelect?.options[periodSelect.selectedIndex]?.text || (periodMode === 'current' ? 'Selected Month' : periodMode);
    const month = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '') || '2026-11';
    
    const monthsToLoad = getVsMonthsForPeriod(periodMode, month);
    const loadedLists = await Promise.all(
      monthsToLoad.map(m => fetchMonthPreIndexedData(m, false, false).catch(() => []))
    );

    const records = [];
    for (const targetId of _cmpIds) {
      let baseFound = null;
      let totalDuty = 0;
      let otHours = 0;
      let holiday = 0;
      let night = 0;
      let plainDays = 0;
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
