/* ==========================================================================
   LEADERBOARD.JS - Ranking Engine, Hub View & Section Filters Controller
   ========================================================================== */

function initLbTabs() {
const tabs = document.querySelectorAll('.lb-tab');
if (!tabs.length) return;
tabs.forEach(tab => {
tab.addEventListener('click', () => {
const target = tab.getAttribute('data-lb-tab');
if (!target) return;
activateLbCriteriaTab(target);
});
});
}

function syncLbMonthSelectors() {
const ySel = document.getElementById('yearSelect');
const mSel = document.getElementById('monthSelect');
const lbYSel = document.getElementById('lbYearSelect');
const lbMSel = document.getElementById('lbMonthSelect');
if (ySel && lbYSel) { if (lbYSel.options.length !== ySel.options.length) lbYSel.innerHTML = ySel.innerHTML; lbYSel.value = ySel.value; }
if (mSel && lbMSel) lbMSel.value = mSel.value;
}

function onLbMonthYearChange() {
const lbYSel = document.getElementById('lbYearSelect');
const lbMSel = document.getElementById('lbMonthSelect');
const ySel = document.getElementById('yearSelect');
const mSel = document.getElementById('monthSelect');
if (lbYSel && ySel) ySel.value = lbYSel.value;
if (lbMSel && mSel) mSel.value = lbMSel.value;
initLeaderboardPage();
}

function searchEmployeeFromLbBar() {
const inp = document.getElementById('lbQuickSearchInput');
const raw = (inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
if (!raw) { showToast('Enter employee ID number (e.g. CF8355)', 'warn'); if (inp) inp.focus(); return; }
viewEmployeeFromLeaderboard(raw, true);
}

function computeEmpAvgDutyAndInOut(e) {
const daily = Array.isArray(e.daily) ? e.daily : [];
let inMinsSum = 0, inCnt = 0, outMinsSum = 0, outCnt = 0, activeDays = 0;
let nightOutSum = 0, nightOutCnt = 0, dayOutSum = 0, dayOutCnt = 0;
daily.forEach(r => {
if (!r) return;
const dHrs = (Number(r[4])||0) + (Number(r[5])||0) + (Number(r[6])||0) + (Number(r[7])||0) + (Number(r[8])||0) + (Number(r[9])||0);
const inStr = String(r[2] || '').trim();
const outStr = String(r[3] || '').trim();
if (dHrs > 0 || inStr || outStr) activeDays++;
const mIn = inStr.match(/^(\d{1,2}):(\d{2})/);
if (mIn) { inMinsSum += (+mIn[1]) * 60 + (+mIn[2]); inCnt++; }
const mOut = outStr.match(/^(\d{1,2}):(\d{2})/);
if (mOut) {
  // Shift-aware Out: a night shift (or an Out earlier than In in the morning) ends on the NEXT calendar day,
  // so it is placed on a continuous timeline (+24h). 05:00 after a night = 29:00, i.e. later than 19:00.
  const inM = mIn ? (+mIn[1]) * 60 + (+mIn[2]) : null;
  let om = (+mOut[1]) * 60 + (+mOut[2]);
  const isNightRow = !!r[10] || (inM != null && om <= inM && om < 720);
  if (isNightRow && inM != null && om <= inM) om += 1440;
  else if (isNightRow && inM == null) om += 1440;
  if (inM != null && om <= inM) return; // bad punch (Out before In, not a night) - skip from average
  outMinsSum += om; outCnt++;
  if (isNightRow) { nightOutSum += om; nightOutCnt++; } else { dayOutSum += om; dayOutCnt++; }
}
});
const presentDaysCount = (daily.length > 0 && activeDays > 0)
  ? activeDays
  : Math.max(1, Number(e.regularDaysCount || 0) + Number(e.holidayCount || 0), Math.round((Number(e.totalDuty || 0)) / 12));
const totalDutyNum = Number(e.totalDuty || 0);
const avgDutyPerDay = Number((totalDutyNum / presentDaysCount).toFixed(2));
const nightRestDays = getNightRestDays(e);
const nightRestCredit = Number((nightRestDays * NIGHT_REST_CREDIT_HOURS).toFixed(2));
const adjustedDuty = Number((totalDutyNum + nightRestCredit).toFixed(2));
const adjustedAvgDuty = Number((adjustedDuty / Math.max(1, presentDaysCount + nightRestDays)).toFixed(2));
const fmtM = (mins) => {
if (mins == null) return '—';
const norm = ((Math.round(mins) % 1440) + 1440) % 1440;
const hh = String(Math.floor(norm / 60)).padStart(2, '0');
const mm = String(norm % 60).padStart(2, '0');
return `${hh}:${mm}`;
};
const avgInMins = inCnt > 0 ? (inMinsSum / inCnt) : 480; // default 08:00 when daily log not embedded
const avgOutMins = outCnt > 0 ? (outMinsSum / outCnt) : Math.min(1380, Math.round(480 + avgDutyPerDay * 60));
const fmtOut = (mins) => (mins == null) ? '—' : (fmtM(mins) + (mins >= 1440 ? ' (+1)' : ''));
const avgDayOutMins = dayOutCnt ? dayOutSum / dayOutCnt : null;
const avgNightOutMins = nightOutCnt ? nightOutSum / nightOutCnt : null;
// Ranking score: average presence span (Out - In) on a continuous timeline. Night shifts are not penalised.
const avgSpanMins = Math.max(0, avgOutMins - avgInMins);
return {
presentDaysCount,
avgDutyPerDay,
nightRestDays,
nightRestCredit,
adjustedDuty,
adjustedAvgDuty,
avgInMins,
avgOutMins,
avgSpanMins,
avgDayOutMins,
avgNightOutMins,
nightOutCount: nightOutCnt,
dayOutCount: dayOutCnt,
avgInTimeStr: fmtM(avgInMins),
avgOutTimeStr: fmtOut(avgOutMins),
avgOutDetailStr: (nightOutCnt && dayOutCnt)
  ? `Day ${fmtM(avgDayOutMins)} ×${dayOutCnt} · Night ${fmtM(avgNightOutMins)} (+1) ×${nightOutCnt}`
  : (nightOutCnt ? `Night ${fmtM(avgNightOutMins)} (+1) ×${nightOutCnt}` : '')
};
}

async function initLeaderboardPage() {
syncLbMonthSelectors(); updateModeUI();
const month = getCurrentMonth();
const subLbl = document.getElementById('lbSubtitle');
if (subLbl) {
subLbl.innerText = currentLbTimeMode === 'monthly' ? month
: currentLbTimeMode === '3m' ? `Last 3 Months (upto ${month})`
: currentLbTimeMode === '6m' ? `Last 6 Months (upto ${month})`
: `All-Time Best (${month.split('-')[0]})`;
}
if (currentLeaderboardResult && currentLeaderboardResult.month === month && (currentLeaderboardResult.timeMode || 'monthly') === currentLbTimeMode) {
updateRankHubCards(currentLeaderboardResult.filtered ? currentLeaderboardResult.filtered.sortedByDuty : currentLeaderboardResult.allEmployees);
if (iccDrillOpen) renderIccDrillList();
return;
}
await startLeaderboardScan(false);
}

async function startLeaderboardScan(forceRescan = false) {
const month = getCurrentMonth();
if (isScanning) return;
isScanning = true;
document.getElementById('lbInitialCard').style.display = "none";
document.getElementById('lbScanCard').style.display = (typeof iccDrillOpen !== 'undefined' && iccDrillOpen) ? "none" : "block";
document.getElementById('lbResultCard').style.display = "none";
const counter = document.getElementById('lbScanCounter');
const fill = document.getElementById('lbScanFill');
const hint = document.getElementById('lbScanHint');
counter.innerText = "Verifying data, please wait...";
fill.style.width = "35%";
hint.innerText = "Verifying data, please wait...";
try {
await loadAreaMap();
populateAreaDropdown();
const subLbl = document.getElementById('lbSubtitle');
if (subLbl) {
subLbl.innerText = currentLbTimeMode === 'monthly' ? month
: currentLbTimeMode === '3m' ? `Last 3 Months (upto ${month})`
: currentLbTimeMode === '6m' ? `Last 6 Months (upto ${month})`
: `All-Time Best (${month.split('-')[0]})`;
}
if (currentLbTimeMode !== 'monthly') {
const monthsToLoad = currentLbTimeMode === '3m' ? getPreviousMonthStrings(month, 3)
: currentLbTimeMode === '6m' ? getPreviousMonthStrings(month, 6)
: currentLbTimeMode === 'ytd' ? getYearToDateMonths(month)
: currentLbTimeMode === '1y' ? getPreviousMonthStrings(month, 12)
: getAllTime2026Months(month);
const { merged } = await aggregateMultiMonthEmployees(monthsToLoad);
if (merged && merged.length > 0) {
const lbPayload = buildLeaderboardPayloadFromList(month, merged);
lbPayload.timeMode = currentLbTimeMode;
lbPayload.loadedMonths = monthsToLoad;
currentLeaderboardResult = lbPayload;
fill.style.width = "100%";
renderLeaderboardResult(lbPayload);
document.getElementById('lbScanCard').style.display = "none";
document.getElementById('lbResultCard').style.display = "none";
isScanning = false;
return;
}
}
const prevM = getPrevMonthStr(month);
const [fastList] = await Promise.all([
  fetchMonthPreIndexedData(month, forceRescan),
  prevM ? fetchMonthPreIndexedData(prevM, false, false).catch(() => null) : Promise.resolve(null)
]);
if (fastList && fastList.length > 0) {
const lbPayload = buildLeaderboardPayloadFromList(month, fastList);
lbPayload.timeMode = 'monthly';
setLeaderboardCache(month, lbPayload);
currentLeaderboardResult = lbPayload;
fill.style.width = "100%";
renderLeaderboardResult(lbPayload);
document.getElementById('lbScanCard').style.display = "none";
document.getElementById('lbResultCard').style.display = "none";
isScanning = false;
return;
}
if (!forceRescan) {
const cached = getLeaderboardCache(month);
if (cached && Array.isArray(cached.allEmployees)) {
const lbPayload = buildLeaderboardPayloadFromList(month, cached.allEmployees);
currentLeaderboardResult = lbPayload;
fill.style.width = "100%";
renderLeaderboardResult(lbPayload);
document.getElementById('lbScanCard').style.display = "none";
document.getElementById('lbResultCard').style.display = "none";
isScanning = false;
return;
}
}
throw new Error(`${month} data was not found on the server.`);
} catch (e) {
console.error(e);
hint.innerText = e.message;
isScanning = false;
setTimeout(() => {
document.getElementById('lbScanCard').style.display = "none";
if (!iccDrillOpen) document.getElementById('lbInitialCard').style.display = "block";
else { currentLeaderboardResult = null; renderIccDrillList(); }
}, 600);
}
}

function buildRankItemHTML(e, index, type, isMine, maxVal) {
let valueStr = "", metaStr = "", rawMetric = 0;
const pCount = getPunchProblemCount(e);
const punchTag = pCount > 0 ? ` • Punch: ${bn(pCount)}` : '';
const isMulti = currentLbTimeMode !== 'monthly' && (e.monthsCount || 1) >= 1 && e.avgOt !== undefined;
const commonMeta = isMulti
? `Duty ${e.totalDuty}h • OT ${e.otHours}h • Avg OT ${e.avgOt}h/m`
: `Duty: ${e.totalDuty}h | OT: ${e.otHours}h | Hol: ${e.holidayCount} | Night: ${e.nightCount}${punchTag}`;
const nRest = Number(e.nightRestDays || 0);
const nCred = Number(e.nightRestCredit != null ? e.nightRestCredit : nRest * NIGHT_REST_CREDIT_HOURS);
let creditLineHtml = '';
if (type === 'duty') {
valueStr = `${e.totalDuty} hrs`; metaStr = commonMeta; rawMetric = Number(e.adjustedDuty ?? e.totalDuty) || 0;
if (nRest > 0) creditLineHtml = `<div class="rank-meta" style="font-size:10px;opacity:0.85;">+${nCred}h night-rest credit (${nRest}d)</div>`;
}
else if (type === 'ot') { valueStr = `${e.otHours} hrs`; metaStr = commonMeta; rawMetric = Number(e.otHours) || 0; }
else if (type === 'earned') { valueStr = `৳ ${Number(e.totalEarned || 0).toFixed(0)}`; metaStr = commonMeta; rawMetric = Number(e.totalEarned) || 0; }
else if (type === 'punch') { valueStr = `${bn(pCount)} days missing`; metaStr = `Duty: ${e.totalDuty}h | OT: ${e.otHours}h` + (isNoRateCat(e.category) ? '' : ` | ৳${Math.round(e.totalEarned || 0)}`); rawMetric = pCount; }
const desig = getDesignation(e);
const desigClass = desig === 'Contractual' ? 'rank-desig cf' : 'rank-desig';
const areaBadge = e.area ? `<span class="rank-area">${esc(e.area)}</span>` : '';
const displayRank = e._rank != null ? e._rank : (index + 1);
const rowClass = type === 'punch' ? 'punch-issue-row' : (displayRank <= 3 ? 'rank-' + displayRank : '');
const pct = (maxVal && maxVal > 0 && type !== 'punch') ? Math.max(10, Math.min(100, Math.round((rawMetric / maxVal) * 100))) : 0;
const progHtml = pct > 0 ? `<div class="rank-progress-wrap"><div class="rank-progress-bar" style="width:${pct}%"></div></div>` : '';
return `<div class="rank-item ${rowClass} ${isMine ? 'mine' : ''}" onclick="viewEmployeeFromLeaderboard('${esc(e.id)}', false, '${type}')">
<div class="rank-number">${bn(displayRank)}</div>
<div class="rank-info">
<div class="rank-name">${esc(e.name || '—')}${isMine ? ' (you)' : ''}</div>
<div class="rank-id-line"><span class="rank-id">${esc(e.id)}</span>${desig ? `<span class="${desigClass}">${desig}</span>` : ''}${areaBadge}</div>
${progHtml}
</div>
<div><div class="rank-value">${valueStr}</div>${creditLineHtml}<div class="rank-meta">${metaStr}</div></div>
</div>`;
}

function renderLeaderboardResult(result) {
try {
currentLeaderboardResult = result;
const allEmpsGlobal = (result.allEmployees || []).filter(e => e.isRppf !== false && isMappedAreaId(e.id));
result.allEmployees = allEmpsGlobal;
result.sortedByPunch = [...allEmpsGlobal].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours));
result.sortedByRequisition = [...allEmpsGlobal].filter(e => getRequisitionProblemCount(e) > 0).sort((a,b) => (getRequisitionProblemCount(b) - getRequisitionProblemCount(a)) || (b.totalDuty - a.totalDuty));
result.sortedByAbsent = [...allEmpsGlobal].filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e, result.month) : 0) > 0).sort((a,b) => (getGeneralAbsentCount(b, result.month) - getGeneralAbsentCount(a, result.month)) || ((a.totalDuty || 0) - (b.totalDuty || 0)) || ((a.otHours || 0) - (b.otHours || 0)));
const areaFilter = document.getElementById('areaFilter');
if (areaFilter) {
const currentArea = areaFilter.value;
const preferredArea = getAppMode() === 'incharge' ? getInchargeDefaultArea() : (getMyId() ? getAreaForId(getMyId(), true) : 'all');
populateAreaDropdown();
const hasCurrentArea = currentArea && currentArea !== '' && [...areaFilter.options].some(o => o.value === currentArea);
const hasPrefArea = [...areaFilter.options].some(o => o.value === preferredArea);
areaFilter.value = hasCurrentArea ? currentArea : (hasPrefArea ? preferredArea : 'all');
document.querySelectorAll('.icc-area-btn').forEach(btn => {
  btn.classList.toggle('active', btn.getAttribute('data-icc-area') === areaFilter.value);
});
['genderFilter', 'typeFilter', 'customCatFilter'].forEach(id => { const el = document.getElementById(id); if (el) el.value = 'all'; });
enrichLbEmployees(allEmpsGlobal);
const gSel = document.getElementById('genderFilter');
if (gSel) gSel.style.display = allEmpsGlobal.some(e => e.gender) ? '' : 'none';
refreshSubFilter();
applyAreaFilter();
updateModeUI();
return;
}
updateLbSummaryMetrics(allEmpsGlobal);
renderTop3('lbTopDuty', result.sortedByDuty.slice(0, 3), 'duty');
renderTop3('lbTopOT', result.sortedByOT.slice(0, 3), 'ot');
renderTop3('lbTopEarned', result.sortedByEarned.slice(0, 3), 'earned');
updateMyRankNotes(); updateAreaFilterCount();
} catch (e) { console.error("renderLeaderboardResult error:", e); }
}

function updateRankHubCards(filteredList) {
const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
const inc = getAppMode() === 'incharge' || isAdminLoggedIn();
const execBtn = document.getElementById('iccAreaExecBtn');
const segBar = document.getElementById('iccAreaSegBar');
if (execBtn) execBtn.style.display = inc ? 'inline-flex' : 'none';
if (segBar) segBar.classList.toggle('has-exec', inc);
['inchargeHubUpcomingDivider', 'hubBtnAvgDuty', 'hubBtnAvgInOut', 'iccCritTabAvgDuty', 'iccCritTabAvgInOut'].forEach(id => {
const el = document.getElementById(id);
if (el) el.style.display = inc ? '' : 'none';
});
// Keep Rank Hub cards clean by default (do not display #1 employee name on the hub)
setTxt('hubSubDuty', 'Highest Duty Hours');
setTxt('hubSubOt', 'Highest Overtime Hours');
setTxt('hubSubEarned', 'Highest OT Allowance');
setTxt('hubSubPlain', 'Most 4:30 pm Regular Days');
setTxt('hubSubLessDuty', 'Lowest Total Duty Hours');
setTxt('hubSubLessOt', 'Lowest Overtime Hours');
setTxt('hubSubPunch', 'Missing In/Out Punch List');
const rCount = (filteredList || []).filter(e => (typeof getRequisitionProblemCount === 'function' ? getRequisitionProblemCount(e) : 0) > 0).length;
setTxt('hubValReq', rCount > 0 ? `${rCount} pers` : 'None');
setTxt('hubSubReq', rCount > 0 ? `${rCount} employees with missing OT req` : 'All OT requisitions OK');
const absCount = (filteredList || []).filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e) : 0) > 0).length;
setTxt('hubValAbsent', absCount > 0 ? `${absCount} pers` : 'None');
setTxt('hubSubAbsent', absCount > 0 ? `${absCount} employees absent on general days` : 'No general day absents');
setTxt('hubSubAvgDuty', 'Daily Average Duty Hours');
setTxt('hubSubAvgInOut', 'Average In-Time (Punch In)');
if (iccDrillOpen) renderIccDrillList();
}

function getLbFilterState() {
return {
area: document.getElementById('areaFilter')?.value || 'all',
sub: document.getElementById('subFilter')?.value || 'all',
gender: document.getElementById('genderFilter')?.value || 'all',
type: document.getElementById('typeFilter')?.value || 'all',
customCat: document.getElementById('customCatFilter')?.value || 'all'
};
}

function enrichLbEmployees(list) {
(list || []).forEach(e => {
if (!e) return;
const m = getEmpMeta(e.id);
e.gender = m.gender; e.empType = m.type; e.sub = m.sub; e.customCats = m.cats || [];
e.area = getAreaForId(e.id, true);
});
refreshCustomCatFilterOptions();
return list;
}

function applyAreaFilter() {
if (!currentLeaderboardResult) return;
const st = getLbFilterState();
const area = st.area;
if (getAppMode() === 'incharge') { try { localStorage.setItem(INCHARGE_AREA_KEY, area); } catch (e) {} }
const allEmps = enrichLbEmployees((currentLeaderboardResult.allEmployees || []).filter(e => e.isRppf !== false && isMappedAreaId(e.id)));
const filtered = allEmps.filter(e =>
!isExecHiddenFor(e) &&
(area === 'all' || e.area === area) &&
(area === 'all' || st.sub === 'all' || e.sub === st.sub) &&
(st.gender === 'all' || e.gender === st.gender) &&
(st.type === 'all' || e.empType === st.type) &&
(!st.customCat || st.customCat === 'all' || (Array.isArray(e.customCats) && e.customCats.includes(st.customCat))));
const curMonth = (currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
ensureEmpAvgStats(filtered, curMonth);
const sortedByDuty = [...filtered].sort((a,b) => ((b.adjustedDuty ?? b.totalDuty) - (a.adjustedDuty ?? a.totalDuty)) || (b.totalDuty - a.totalDuty));
const sortedByOT = [...filtered].sort((a,b) => b.otHours - a.otHours);
const sortedByEarned = [...filtered].filter(e => !isNoRateCat(e.category)).sort((a,b) => b.totalEarned - a.totalEarned);
const sortedByPlain = [...filtered].sort((a,b) => ((b.plainDaysCount || 0) - (a.plainDaysCount || 0)) || (b.totalDuty - a.totalDuty));
const sortedByLessDuty = [...filtered].sort((a,b) => (a.totalDuty - b.totalDuty) || (a.otHours - b.otHours));
const sortedByLessOT = [...filtered].sort((a,b) => (a.otHours - b.otHours) || (a.totalDuty - b.totalDuty));
const sortedByAvgDuty = [...filtered].sort((a,b) => ((b.adjustedAvgDuty ?? b.avgDutyPerDay ?? 0) - (a.adjustedAvgDuty ?? a.avgDutyPerDay ?? 0)) || (b.totalDuty - a.totalDuty));
const sortedByAvgInOut = [...filtered].sort((a,b) => ((a.avgInMins || 480) - (b.avgInMins || 480)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
const sortedByPunch = [...filtered].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours));
const sortedByRequisition = [...filtered].filter(e => getRequisitionProblemCount(e) > 0).sort((a,b) => (getRequisitionProblemCount(b) - getRequisitionProblemCount(a)) || (b.totalDuty - a.totalDuty));
const sortedByAbsent = [...filtered].filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e, curMonth) : 0) > 0).sort((a,b) => (getGeneralAbsentCount(b, curMonth) - getGeneralAbsentCount(a, curMonth)) || ((a.totalDuty || 0) - (b.totalDuty || 0)) || ((a.otHours || 0) - (b.otHours || 0)));
currentLeaderboardResult.filtered = { _rawFiltered: filtered, sortedByDuty, sortedByOT, sortedByEarned, sortedByPlain, sortedByLessDuty, sortedByLessOT, sortedByAvgDuty, sortedByAvgInOut, sortedByPunch, sortedByRequisition, sortedByAbsent, area };
updateLbSummaryMetrics(filtered);
renderTop3('lbTopDuty', sortedByDuty.slice(0, 5), 'duty');
renderTop3('lbTopOT', sortedByOT.slice(0, 5), 'ot');
renderTop3('lbTopEarned', sortedByEarned.slice(0, 5), 'earned');
renderPunchIssueList(sortedByPunch);
updateMyRankNotes(); updateAreaFilterCount(); updateAreaHint();
}

function openLbFullList(type) {
const modal = document.getElementById('lbFullListModal');
const titleEl = document.getElementById('lbFullListTitle');
const subEl = document.getElementById('lbFullListSubtitle');
const body = document.getElementById('lbFullListBody');
const searchInp = document.getElementById('lbModalSearchInput');
if (searchInp) searchInp.value = '';
currentLbListType = type || 'duty';
updateLbModalNavUI(currentLbListType);
if (!currentLeaderboardResult) {
body.innerHTML = '<div class="lb-modal-empty">No data available for this month. Use Prev/Next Month above to switch months.</div>';
titleEl.textContent = 'Full list'; subEl.textContent = '—';
modal.classList.add('open');
document.body.style.overflow = 'hidden'; document.body.style.position = 'fixed'; document.body.style.width = '100%';
return;
}
const useFiltered = Boolean(currentLeaderboardResult.filtered);
let sorted;
if (useFiltered) {
sorted = type === 'duty' ? currentLeaderboardResult.filtered.sortedByDuty
: type === 'ot' ? currentLeaderboardResult.filtered.sortedByOT
: type === 'punch' ? currentLeaderboardResult.filtered.sortedByPunch
: currentLeaderboardResult.filtered.sortedByEarned;
} else {
sorted = type === 'duty' ? currentLeaderboardResult.sortedByDuty
: type === 'ot' ? currentLeaderboardResult.sortedByOT
: type === 'punch' ? (currentLeaderboardResult.sortedByPunch || (currentLeaderboardResult.allEmployees || []).filter(e => getPunchProblemCount(e) > 0))
: currentLeaderboardResult.sortedByEarned;
}
const typeLabels = {
duty: { title: 'Duty Hours — Full Ranking', sub: 'Highest Duty Hours' },
ot: { title: 'OT Hours — Full Ranking', sub: 'Highest OT Hours' },
earned: { title: 'Total Earning — Full Ranking', sub: 'Highest Earnings' },
punch: { title: 'Punch Problems — Full List', sub: 'Missing In/Out Punches' }
};
const meta = typeLabels[type] || { title: 'Full list', sub: '—' };
titleEl.textContent = meta.title;
const areaLabel = describeLbFilter();
subEl.textContent = `${meta.sub} • ${areaLabel} • Total ${(sorted || []).length} employees`;
currentLbModalList = (sorted || []).map((e, i) => ({ ...e, _rank: i + 1 }));
renderLbModalItems(currentLbModalList);
modal.classList.add('open');
document.body.style.overflow = 'hidden'; document.body.style.position = 'fixed'; document.body.style.width = '100%';
setTimeout(() => { const myRow = body.querySelector('.rank-item.mine'); if (myRow) myRow.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
}

function closeLbFullList() {
const modal = document.getElementById('lbFullListModal');
modal.classList.remove('open');
document.body.style.overflow = ''; document.body.style.position = ''; document.body.style.width = '';
currentLbListType = null;
}

/* Ranking "See Details": handled by js/components/rank-details.js (context-aware).
   crit = ranking criterion (duty/ot/earned/plain/lessDuty/lessOt/punch/absent/requisition/avgDuty/avgInOut/night)
   forceReport = true -> skip the details popup and open the full report page directly */
async function viewEmployeeFromLeaderboard(empId, forceReport = false, crit = null) {
  if (forceReport) return openFullEmployeeReport(empId);
  return openIccContextModal(empId, crit || undefined);
}

async function navigateLbModalMonth(delta) {
const lbYSel = document.getElementById('lbYearSelect');
const lbMSel = document.getElementById('lbMonthSelect');
const ySel = document.getElementById('yearSelect');
const mSel = document.getElementById('monthSelect');
if (!ySel || !mSel) return;
let y = parseInt((lbYSel && lbYSel.value) || ySel.value, 10) || new Date().getFullYear();
let m = parseInt((lbMSel && lbMSel.value) || mSel.value, 10) || 1;
m += delta;
if (m < 1) { m = 12; y -= 1; }
if (m > 12) { m = 1; y += 1; }
const yStr = String(y);
const mStr = String(m).padStart(2, '0');
[ySel, lbYSel].forEach(sel => {
if (!sel) return;
if (![...sel.options].some(o => o.value === yStr)) {
const opt = document.createElement('option');
opt.value = yStr;
opt.textContent = bn(yStr);
sel.appendChild(opt);
}
sel.value = yStr;
});
if (mSel) mSel.value = mStr;
if (lbMSel) lbMSel.value = mStr;
const body = document.getElementById('lbFullListBody');
const lbl = document.getElementById('lbModalMonthLabel');
if (lbl) lbl.textContent = `Loading ${BN_MONTHS[m - 1]} ${yStr}...`;
if (body) body.innerHTML = '<div class="lb-modal-empty">Loading month ranking...</div>';
const savedType = currentLbListType || 'duty';
await startLeaderboardScan(false);
openLbFullList(savedType);
}

function lbModalBackdropClick(e) { if (e.target.id === 'lbFullListModal') closeLbFullList(); }

function getIccPeriodOptions() {
const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const curYear = document.getElementById('yearSelect')?.value || '2026';
const opts = [];
for (let m = 1; m <= 12; m++) {
const mStr = String(m).padStart(2, '0');
opts.push({ key: `month:${curYear}-${mStr}`, label: shortMonths[m - 1], mode: 'monthly', month: mStr, year: curYear, ym: `${curYear}-${mStr}` });
}
opts.push({ key: 'mode:3m', label: 'Last 3M', mode: '3m' });
opts.push({ key: 'mode:6m', label: 'Last 6M', mode: '6m' });
opts.push({ key: 'mode:ytd', label: 'This Year So Far', mode: 'ytd' });
opts.push({ key: 'mode:1y', label: 'Last 1Y (12M)', mode: '1y' });
opts.push({ key: 'mode:alltime', label: 'All-Time', mode: 'alltime' });
return opts;
}

function onIccYearChange(newYear) {
const ySel = document.getElementById('yearSelect');
const lbYSel = document.getElementById('lbYearSelect');
[ySel, lbYSel].forEach(sel => {
if (!sel) return;
if (![...sel.options].some(o => o.value === String(newYear))) {
const opt = document.createElement('option');
opt.value = String(newYear); opt.textContent = bn(newYear);
sel.appendChild(opt);
}
sel.value = String(newYear);
});
currentLbTimeMode = 'monthly';
renderIccPeriodStrip();
startLeaderboardScan(false).then(() => renderIccDrillList());
}

function renderIccPeriodStrip() {
const strip = document.getElementById('iccPeriodStrip');
if (!strip) return;
const curMonth = document.getElementById('monthSelect')?.value || '10';
const curYear = document.getElementById('yearSelect')?.value || '2026';
const opts = getIccPeriodOptions();
let yearOptsHtml = '';
for (let y = 2020; y <= 2032; y++) {
yearOptsHtml += `<option value="${y}" ${String(y) === String(curYear) ? 'selected' : ''}>${y}</option>`;
}
const yearSelHtml = `<select id="iccYearSelect" class="icc-year-select" aria-label="Ranking Year (2020-2032)" onchange="onIccYearChange(this.value)">${yearOptsHtml}</select>`;
strip.innerHTML = yearSelHtml + opts.map((o, idx) => {
const isActive = (currentLbTimeMode === 'monthly' && o.mode === 'monthly' && o.month === curMonth && o.year === curYear) || (currentLbTimeMode !== 'monthly' && o.mode === currentLbTimeMode);
return `<button type="button" class="icc-period-pill ${isActive ? 'active' : ''}" data-pidx="${idx}" onclick="selectIccPeriodByIndex(${idx})">${esc(o.label)}</button>`;
}).join('');
setTimeout(() => {
const activePill = strip.querySelector('.icc-period-pill.active');
if (activePill && typeof activePill.scrollIntoView === 'function') {
try { activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (e) {}
}
}, 30);
}

function openRankDrillDown(criterion) {
const wasAlreadyOpen = iccDrillOpen;
activeIccCriterion = criterion || 'duty';
iccDrillOpen = true;
if (currentSideDrawerPage !== 'leaderboard') {
initSideDrawerClasses();
currentSideDrawerPage = 'leaderboard';
}
document.body.classList.remove('nav-scroll-hidden', 'drawer-open-right');
document.body.classList.add('drawer-open-left', 'drawer-fullscreen-active');
const lbPage = document.getElementById('page-leaderboard');
if (lbPage) {
lbPage.classList.add('drawer-active', 'active', 'full-screen-drawer');
if (!wasAlreadyOpen) lbPage.scrollTop = 0;
}
syncIccAdminToggleBtn();
probeAvailableMonths();
activateLbCriteriaTab(activeIccCriterion);
const view = document.getElementById('iccRankDrillView');
const hub = document.getElementById('lbHubMenuWrap');
const resCard = document.getElementById('lbResultCard');
const quickCard = document.getElementById('inchargeQuickCard');
const appHdr = document.getElementById('lbMainAppHeader');
const initCard = document.getElementById('lbInitialCard');
const scanCard = document.getElementById('lbScanCard');
if (view) {
view.classList.add('active');
view.classList.remove('filters-scroll-hidden');
}
if (hub) hub.style.display = 'none';
if (resCard) resCard.style.display = 'none';
if (quickCard) quickCard.style.display = 'none';
if (appHdr) appHdr.style.display = 'none';
if (initCard) initCard.style.display = 'none';
if (scanCard) scanCard.style.display = 'none';
const inc = getAppMode() === 'incharge';
const execBtn = document.getElementById('iccAreaExecBtn');
const segBar = document.getElementById('iccAreaSegBar');
if (execBtn) execBtn.style.display = inc ? 'inline-flex' : 'none';
if (segBar) segBar.classList.toggle('has-exec', inc);
const titles = {
duty: 'Best Duty RPPF',
ot: 'Best OT RPPF',
earned: 'Best Earning RPPF',
plain: 'Top 4:30pm RPPF',
lessDuty: 'Less Duty RPPF',
lessOt: 'Less OT RPPF',
avgDuty: 'Average Duty Hour RPPF',
avgInOut: 'Avg In Time RPPF',
punch: 'Punch Problem RPPF',
requisition: 'OT Requisition Missing RPPF',
absent: 'Highest Absent (General Days) RPPF'
};
const colHeaders = {
duty: 'Duty Hrs',
ot: 'OT Hrs',
earned: 'Earning',
plain: '4:30pm Days',
lessDuty: 'Duty Hrs',
lessOt: 'OT Hrs',
avgDuty: 'Avg Duty/Day',
avgInOut: 'Avg In',
punch: 'Missing',
requisition: 'Missing OT',
absent: 'Absent Days'
};
const titleEl = document.getElementById('iccDrillTitle');
if (titleEl) titleEl.textContent = titles[activeIccCriterion] || 'Best Duty RPPF';
const colEl = document.getElementById('iccMetricColHeader');
if (colEl) colEl.textContent = colHeaders[activeIccCriterion] || 'Duty Hrs';
document.querySelectorAll('.icc-crit-tab').forEach(btn => {
const isAct = btn.getAttribute('data-icc-crit') === activeIccCriterion;
btn.classList.toggle('active', isAct);
if (isAct && typeof btn.scrollIntoView === 'function') {
try { btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (e) {}
}
});
const waBtn = document.getElementById('iccPunchWaBtn');
const absBtn = document.getElementById('iccAbsentErpBtn');
const reqBtn = document.getElementById('iccReqErpBtn');
const sRow = document.getElementById('iccSearchRowWrap');
if (waBtn) waBtn.style.display = activeIccCriterion === 'punch' ? 'inline-flex' : 'none';
if (absBtn) absBtn.style.display = activeIccCriterion === 'absent' ? 'inline-flex' : 'none';
if (reqBtn) reqBtn.style.display = activeIccCriterion === 'requisition' ? 'inline-flex' : 'none';
if (sRow && (activeIccCriterion === 'punch' || activeIccCriterion === 'absent' || activeIccCriterion === 'requisition')) sRow.style.display = 'flex';
const curArea = document.getElementById('areaFilter')?.value || 'all';
document.querySelectorAll('.icc-area-btn').forEach(btn => {
btn.classList.toggle('active', btn.getAttribute('data-icc-area') === curArea);
});
if (!wasAlreadyOpen || !document.getElementById('iccYearSelect')) renderIccPeriodStrip();
renderIccDrillList();
}

function closeRankDrillDown() {
iccDrillOpen = false;
document.body.classList.remove('nav-scroll-hidden', 'drawer-fullscreen-active');
const lbPage = document.getElementById('page-leaderboard');
if (lbPage) lbPage.classList.remove('full-screen-drawer');
const view = document.getElementById('iccRankDrillView');
const hub = document.getElementById('lbHubMenuWrap');
const resCard = document.getElementById('lbResultCard');
const quickCard = document.getElementById('inchargeQuickCard');
const appHdr = document.getElementById('lbMainAppHeader');
if (view) {
view.classList.remove('active', 'filters-scroll-hidden');
}
if (hub) hub.style.display = 'flex';
if (resCard) resCard.style.display = 'none';
if (quickCard) quickCard.style.display = 'block';
if (appHdr) appHdr.style.display = 'flex';
}

function renderIccDrillList() {
const body = document.getElementById('iccDrillListBody');
const myBanner = document.getElementById('iccMyPosBanner');
if (!body) return;
if (!currentLeaderboardResult) {
if (myBanner) myBanner.style.display = 'none';
body.innerHTML = '<div class="empty-msg">No data found for this period. Tap another month above.</div>';
return;
}
const f = currentLeaderboardResult.filtered || currentLeaderboardResult;
const list = getCriterionListFromSource(f, activeIccCriterion);
const myId = getMyId();
if (myBanner) {
if (myId && activeIccCriterion !== 'punch' && getAppMode() !== 'incharge') {
const myIdx = list.findIndex(e => e.id === myId);
if (myIdx !== -1) {
const me = list[myIdx];
const myVal = formatIccMainMetric(me, activeIccCriterion);
myBanner.style.display = 'flex';
myBanner.innerHTML = `<span>Your Position (${esc(myId)})</span><span>Rank #${myIdx + 1} • ${myVal}</span>`;
} else {
myBanner.style.display = 'none';
}
} else {
myBanner.style.display = 'none';
}
}
const q = (document.getElementById('iccSearchInput')?.value || '').trim().toUpperCase();
const indexed = list.map((e, idx) => ({ ...e, _iccRank: idx + 1 }));
const filtered = q ? indexed.filter(e => String(e.id || '').toUpperCase().includes(q) || String(e.name || '').toUpperCase().includes(q)) : indexed;
if (!filtered.length) {
_iccCurrentFilteredList = [];
_iccRenderedCount = 0;
const emptyTxt = activeIccCriterion === 'punch' ? 'No missing In/Out punches in this selection.' : (activeIccCriterion === 'requisition' ? '✓ আলহামদুলিল্লাহ, এই সেকশনে কারো ওটি রিকুইজিশন পেন্ডিং নেই (All OT Requisitions OK).' : 'No matching employees found.');
body.innerHTML = `<div class="empty-msg" style="padding:16px;text-align:center;font-weight:700;color:${activeIccCriterion === 'requisition' ? '#059669' : '#64748b'};">${emptyTxt}</div>`;
return;
}
const adminActive = isIccAdminCatModeActive();
syncIccAdminToggleBtn();
_iccCurrentFilteredList = filtered;
const firstBatch = filtered.slice(0, ICC_RENDER_BATCH_SIZE);
_iccRenderedCount = firstBatch.length;
const remaining = filtered.length - _iccRenderedCount;
const moreHtml = remaining > 0
? `<div id="iccLoadMoreBtnWrap" style="padding:10px;text-align:center;"><button type="button" class="btn-secondary" style="min-height:34px;font-size:12px;" onclick="loadMoreIccRows()">Show more (${remaining} remaining)</button></div>`
: '';
body.innerHTML = firstBatch.map(e => buildIccRowHtml(e, myId, adminActive)).join('') + moreHtml;
}

const _prevOpenRankDrillDown = openRankDrillDown;
openRankDrillDown = function(criterion) {
  if (getAppMode() === 'incharge' && criterion === 'earned') {
    criterion = 'duty';
  }
  return _prevOpenRankDrillDown(criterion);
}

const _prevApplyAreaFilter = applyAreaFilter;
applyAreaFilter = function() {
  if (!currentLeaderboardResult) return;
  _prevApplyAreaFilter();
  const st = getLbFilterState();
  if (st.sub !== 'all' && st.area === 'all' && currentLeaderboardResult.filtered) {
    const base = (currentLeaderboardResult.filtered._rawFiltered || []).filter(e => e.sub === st.sub);
    ensureEmpAvgStats(base);
    currentLeaderboardResult.filtered._rawFiltered = base;
    currentLeaderboardResult.filtered.sortedByDuty = [...base].sort((a,b) => ((b.adjustedDuty ?? b.totalDuty) - (a.adjustedDuty ?? a.totalDuty)) || (b.totalDuty - a.totalDuty));
    currentLeaderboardResult.filtered.sortedByOT = [...base].sort((a,b) => b.otHours - a.otHours);
    currentLeaderboardResult.filtered.sortedByEarned = [...base].filter(e => !isNoRateCat(e.category)).sort((a,b) => b.totalEarned - a.totalEarned);
    currentLeaderboardResult.filtered.sortedByPlain = [...base].sort((a,b) => ((b.plainDaysCount || 0) - (a.plainDaysCount || 0)) || (b.totalDuty - a.totalDuty));
    currentLeaderboardResult.filtered.sortedByLessDuty = [...base].sort((a,b) => (a.totalDuty - b.totalDuty) || (a.otHours - b.otHours));
    currentLeaderboardResult.filtered.sortedByLessOT = [...base].sort((a,b) => (a.otHours - b.otHours) || (a.totalDuty - a.totalDuty));
    currentLeaderboardResult.filtered.sortedByAvgDuty = [...base].sort((a,b) => ((b.adjustedAvgDuty ?? b.avgDutyPerDay ?? 0) - (a.adjustedAvgDuty ?? a.avgDutyPerDay ?? 0)) || (b.totalDuty - a.totalDuty));
    currentLeaderboardResult.filtered.sortedByAvgInOut = [...base].sort((a,b) => ((a.avgInMins || 480) - (b.avgInMins || 480)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
    currentLeaderboardResult.filtered.sortedByPunch = [...base].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours));
currentLeaderboardResult.filtered.sortedByRequisition = [...base].filter(e => getRequisitionProblemCount(e) > 0).sort((a,b) => (getRequisitionProblemCount(b) - getRequisitionProblemCount(a)) || (b.totalDuty - a.totalDuty));
currentLeaderboardResult.filtered.sortedByAbsent = [...base].filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e) : 0) > 0).sort((a,b) => (getGeneralAbsentCount(b) - getGeneralAbsentCount(a)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
    updateLbSummaryMetrics(base);
  }
}
