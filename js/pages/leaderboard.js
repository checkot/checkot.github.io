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
clampLbMonthToCalendar();
}

function onLbMonthYearChange() {
const lbYSel = document.getElementById('lbYearSelect');
const lbMSel = document.getElementById('lbMonthSelect');
const ySel = document.getElementById('yearSelect');
const mSel = document.getElementById('monthSelect');
if (lbYSel && ySel) ySel.value = lbYSel.value;
if (lbMSel && mSel) mSel.value = lbMSel.value;
clampLbMonthToCalendar();
initLeaderboardPage();
}

function searchEmployeeFromLbBar() {
const inp = document.getElementById('lbQuickSearchInput');
const raw = (inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
if (!raw) { showToast('Enter employee ID number (e.g. CF8355)', 'warn'); if (inp) inp.focus(); return; }
viewEmployeeFromLeaderboard(raw);
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
: currentLbTimeMode === 'ytd' ? `This Year So Far (Jan – ${(typeof getYearToDateMonths === 'function' ? getYearToDateMonths(month).slice(-1)[0] : month)})`
: currentLbTimeMode === '1y' ? `Last 12 Months (upto ${month})`
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
if (isScanning) return;
const _rl = window.RankLoader;
if (_rl) _rl.show({ label: (document.getElementById('lbSubtitle') || {}).textContent });
try {
await _startLeaderboardScanCore(forceRescan);
} finally {
if (_rl) _rl.hide();
}
}

async function _startLeaderboardScanCore(forceRescan = false) {
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
: currentLbTimeMode === 'ytd' ? `This Year So Far (Jan – ${(typeof getYearToDateMonths === 'function' ? getYearToDateMonths(month).slice(-1)[0] : month)})`
: currentLbTimeMode === '1y' ? `Last 12 Months (upto ${month})`
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
// Drop the previous month's result right away. Otherwise the caller's renderIccDrillList() (which runs
// as soon as this function returns) paints the OLD month's data under the newly selected month's label.
currentLeaderboardResult = null;
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
return `<div class="rank-item ${rowClass} ${isMine ? 'mine' : ''}" onclick="viewEmployeeFromLeaderboard('${esc(e.id)}')">
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
const allEmpsGlobal = (result.allEmployees || []).filter(e => isRankableEmployee(e));
result.allEmployees = allEmpsGlobal;
result.sortedByPunch = [...allEmpsGlobal].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours));
result.sortedByRequisition = [...allEmpsGlobal].filter(e => getOtRequisitionCount(e) > 0).sort((a,b) => (getOtRequisitionCount(b) - getOtRequisitionCount(a)) || (b.totalDuty - a.totalDuty));
result.sortedByNightIssue = [...allEmpsGlobal].filter(e => getNightIssueCount(e) > 0).sort((a,b) => (getNightIssueCount(b) - getNightIssueCount(a)) || (b.totalDuty - a.totalDuty));
result.sortedByHolidayReq = [...allEmpsGlobal].filter(e => getHolidayReqCount(e) > 0).sort((a,b) => (getHolidayReqCount(b) - getHolidayReqCount(a)) || (b.totalDuty - a.totalDuty));
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
setTxt('hubSubPunch', 'Missing In/Out');
const pCount = (filteredList || []).filter(e => (typeof getPunchProblemCount === 'function' ? getPunchProblemCount(e) : 0) > 0).length;
setTxt('hubValPunch', pCount > 0 ? `${pCount} pers` : 'None');
const rCount = (filteredList || []).filter(e => (typeof getOtRequisitionCount === 'function' ? getOtRequisitionCount(e) : 0) > 0).length;
setTxt('hubValReq', rCount > 0 ? `${rCount} pers` : 'None');
setTxt('hubSubReq', rCount > 0 ? 'Worked, 0 OT' : 'All OK');
const nCount = (filteredList || []).filter(e => (typeof getNightIssueCount === 'function' ? getNightIssueCount(e) : 0) > 0).length;
setTxt('hubValNightIssue', nCount > 0 ? `${nCount} pers` : 'None');
setTxt('hubSubNightIssue', nCount > 0 ? 'DN / night punch, Night not YES' : 'All OK');
const hCount = (filteredList || []).filter(e => (typeof getHolidayReqCount === 'function' ? getHolidayReqCount(e) : 0) > 0).length;
setTxt('hubValHolidayReq', hCount > 0 ? `${hCount} pers` : 'None');
setTxt('hubSubHolidayReq', hCount > 0 ? 'Worked on holiday / off day, not booked' : 'All OK');
const absCount = (filteredList || []).filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e) : 0) > 0).length;
setTxt('hubValAbsent', absCount > 0 ? `${absCount} pers` : 'None');
setTxt('hubSubAbsent', absCount > 0 ? '≥1 absent day' : 'No absents');
setTxt('hubSubAvgDuty', 'Daily Average Duty Hours');
setTxt('hubSubAvgInOut', 'Average In-Time (Punch In)');
const eeCount = (filteredList || []).filter(e => (typeof getEarlyExitCount === 'function' ? getEarlyExitCount(e) : 0) > 0).length;
setTxt('hubValEarlyExit', eeCount > 0 ? `${eeCount} pers` : 'None');
setTxt('hubSubEarlyExit', eeCount > 0 ? 'Left before shift end' : 'No early exits');
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
const allEmps = enrichLbEmployees((currentLeaderboardResult.allEmployees || []).filter(e => isRankableEmployee(e) && isAreaVisibleToViewer(getAreaForId(e.id, true))));
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
const sortedByAvgInOut = [...filtered].sort((a,b) => (((a.avgInMins && a.avgInMins > 0) ? a.avgInMins : 9999) - ((b.avgInMins && b.avgInMins > 0) ? b.avgInMins : 9999)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
const sortedByPunch = [...filtered].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours));
const sortedByRequisition = [...filtered].filter(e => getOtRequisitionCount(e) > 0).sort((a,b) => (getOtRequisitionCount(b) - getOtRequisitionCount(a)) || (b.totalDuty - a.totalDuty));
const sortedByNightIssue = [...filtered].filter(e => getNightIssueCount(e) > 0).sort((a,b) => (getNightIssueCount(b) - getNightIssueCount(a)) || (b.totalDuty - a.totalDuty));
const sortedByHolidayReq = [...filtered].filter(e => getHolidayReqCount(e) > 0).sort((a,b) => (getHolidayReqCount(b) - getHolidayReqCount(a)) || (b.totalDuty - a.totalDuty));
const sortedByAbsent = [...filtered].filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e, curMonth) : 0) > 0).sort((a,b) => (getGeneralAbsentCount(b, curMonth) - getGeneralAbsentCount(a, curMonth)) || ((a.totalDuty || 0) - (b.totalDuty || 0)) || ((a.otHours || 0) - (b.otHours || 0)));
currentLeaderboardResult.filtered = { _rawFiltered: filtered, sortedByDuty, sortedByOT, sortedByEarned, sortedByPlain, sortedByLessDuty, sortedByLessOT, sortedByAvgDuty, sortedByAvgInOut, sortedByPunch, sortedByRequisition, sortedByNightIssue, sortedByHolidayReq, sortedByAbsent, area };
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

/* ==========================================================================
   CONTEXT-AWARE RANKING DETAILS MODAL ENGINE
   ========================================================================== */
function closeIccContextModal() {
  const modal = document.getElementById('iccContextModal');
  if (modal) modal.classList.remove('open');
  if (typeof iccDrillOpen === 'undefined' || !iccDrillOpen) {
    if (!document.getElementById('lbFullListModal')?.classList.contains('open')) {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
  }
}

function iccContextModalBackdropClick(e) {
  if (e && e.target && e.target.id === 'iccContextModal') {
    closeIccContextModal();
  }
}

async function openFullEmployeeReport(empId, targetMonth) {
  closeIccContextModal();
  if (document.getElementById('lbFullListModal')?.classList.contains('open')) closeLbFullList();
  const m = targetMonth || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  const mClean = String(m).includes(' - ') ? m.split(' - ')[1].trim() : String(m).split(' ')[0];
  const [year, mon] = (mClean.includes('-') ? mClean : (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '2026-10')).split('-');
  const ySel = document.getElementById('yearSelect');
  const mSel = document.getElementById('monthSelect');
  if (ySel) ySel.value = year;
  if (mSel) mSel.value = mon;
  const empInp = document.getElementById('employeeId');
  if (empInp) empInp.value = empId;
  if (typeof toggleClearIdBtn === 'function') toggleClearIdBtn();
  const backBtn = document.getElementById('backToLbBtn');
  if (backBtn) backBtn.style.display = "block";
  _lbView = true;
  if (typeof switchPage === 'function') switchPage('search');
  setTimeout(() => { if (typeof findReport === 'function') findReport(); }, 100);
}

function openIccContextModal(empId, optCrit, optMonth) {
  if (!empId) return;
  const modal = document.getElementById('iccContextModal');
  if (!modal) return;

  const curM = optMonth || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  const cleanM = String(curM).includes(' - ') ? curM.split(' - ')[1].trim() : String(curM).split(' ')[0];
  const crit = optCrit || (typeof activeIccCriterion !== 'undefined' && activeIccCriterion) || (typeof currentLbListType !== 'undefined' && currentLbListType) || 'duty';
  const isMultiTime = (typeof currentLbTimeMode !== 'undefined' && currentLbTimeMode !== 'monthly') || Boolean(typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.timeMode && currentLeaderboardResult.timeMode !== 'monthly');
  const incMode = typeof getAppMode === 'function' && getAppMode() === 'incharge';

  // Find employee in active result or cache
  let emp = null;
  if (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && Array.isArray(currentLeaderboardResult.allEmployees)) {
    emp = currentLeaderboardResult.allEmployees.find(e => e.id === empId || (typeof resolveEmpAliasId === 'function' && resolveEmpAliasId(e.id) === resolveEmpAliasId(empId)));
  }
  if (!emp && typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.filtered && Array.isArray(currentLeaderboardResult.filtered._rawFiltered)) {
    emp = currentLeaderboardResult.filtered._rawFiltered.find(e => e.id === empId || (typeof resolveEmpAliasId === 'function' && resolveEmpAliasId(e.id) === resolveEmpAliasId(empId)));
  }
  if (!emp && typeof monthIndexMemoryCache !== 'undefined') {
    const list = monthIndexMemoryCache[cleanM] || monthIndexMemoryCache[typeof getCurrentMonth === 'function' ? getCurrentMonth() : ''];
    if (Array.isArray(list)) {
      emp = list.find(e => e.id === empId || (typeof resolveEmpAliasId === 'function' && resolveEmpAliasId(e.id) === resolveEmpAliasId(empId)));
    }
  }
  if (!emp) {
    const meta = typeof getEmpMeta === 'function' ? getEmpMeta(empId) : {};
    emp = {
      id: empId,
      name: meta.name || empId,
      area: typeof getAreaForId === 'function' ? getAreaForId(empId, true) : 'RPPF',
      grade: meta.grade || '',
      sub: meta.sub || '',
      totalDuty: 0,
      otHours: 0,
      holidayCount: 0,
      nightCount: 0,
      plainDaysCount: 0,
      totalEarned: 0
    };
  }

  const titleEl = document.getElementById('iccCtxTitle');
  const subEl = document.getElementById('iccCtxSubtitle');
  const bodyEl = document.getElementById('iccCtxBody');
  const footerEl = document.getElementById('iccCtxFooter');
  if (!bodyEl || !footerEl) return;

  const areaShort = (a) => a === 'Packing Hall' ? 'Packing' : a === 'Solid Production' ? 'Solid' : a === 'Softgel Production' ? 'Softgel' : (typeof OVERALL_AREA !== 'undefined' && a === OVERALL_AREA) ? 'Executives' : (a || 'RPPF');
  const desig = typeof getDesignation === 'function' ? getDesignation(emp) : (emp.grade || '');
  const subName = emp.sub || (typeof getEmpMeta === 'function' ? getEmpMeta(emp.id).sub : '') || '';
  const areaName = typeof getAreaForId === 'function' ? getAreaForId(emp.id, true) : (emp.area || 'RPPF');

  let periodLabel = cleanM;
  if (isMultiTime) {
    const mc = emp.monthsCount || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.loadedMonths ? currentLeaderboardResult.loadedMonths.length : (typeof currentLbTimeMode !== 'undefined' && currentLbTimeMode === '3m' ? 3 : (typeof currentLbTimeMode !== 'undefined' && currentLbTimeMode === '6m' ? 6 : 'Multi')));
    const modeName = typeof currentLbTimeMode !== 'undefined' ? (currentLbTimeMode === '3m' ? '3 Months' : (currentLbTimeMode === '6m' ? '6 Months' : (currentLbTimeMode === 'ytd' ? 'YTD' : (currentLbTimeMode === '1y' ? '1 Year' : 'All-Time')))) : 'Multi-Month';
    periodLabel = `${modeName} (${mc}m)`;
  } else {
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const pts = cleanM.split('-');
    if (pts.length === 2) {
      const mi = parseInt(pts[1], 10) - 1;
      periodLabel = `${mons[mi] || pts[1]} ${pts[0]}`;
    }
  }

  if (titleEl) titleEl.innerHTML = `${esc(emp.name || emp.id)} <span style="font-weight:600;font-size:13px;opacity:0.85;">(${esc(emp.id)})</span>`;
  if (subEl) {
    const subBadge = subName ? `<span class="badge" style="background:var(--brand-soft);color:var(--brand-text);border:1px solid var(--brand-soft-border);font-size:11px;padding:2px 6px;border-radius:4px;margin-right:4px;">${esc(subName)}</span>` : '';
    subEl.innerHTML = `${subBadge}${esc(areaShort(areaName))}${desig ? ' • ' + esc(desig) : ''} • <span style="font-weight:700;color:var(--text);">${esc(periodLabel)}</span>`;
  }

  const prevSet = typeof getPrevMonthNightSet === 'function' ? getPrevMonthNightSet(cleanM) : new Set();
  const prevHas = prevSet.has(String(emp.id).toUpperCase()) || (typeof resolveEmpAliasId === 'function' && prevSet.has(resolveEmpAliasId(emp.id)));

  let loadedMonthsList = [];
  if (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && Array.isArray(currentLeaderboardResult.loadedMonths)) {
    loadedMonthsList = [...currentLeaderboardResult.loadedMonths];
  } else if (typeof monthIndexMemoryCache !== 'undefined') {
    loadedMonthsList = Object.keys(monthIndexMemoryCache).filter(m => Array.isArray(monthIndexMemoryCache[m]) && monthIndexMemoryCache[m].length > 0).sort();
  }
  if (!loadedMonthsList.length) loadedMonthsList = [cleanM];

  let bodyHtml = '';

  // -------------------------------------------------------------
  // CONTEXT 1: ABSENT CRITERION
  // -------------------------------------------------------------
  if (crit === 'absent') {
    let absCount = 0;
    if (isMultiTime) {
      absCount = emp.generalAbsentCount != null ? emp.generalAbsentCount : (Array.isArray(emp.generalAbsentDays) ? emp.generalAbsentDays.length : 0);
    } else {
      const absRes = typeof computeEmpGeneralAbsents === 'function' ? computeEmpGeneralAbsents(emp, cleanM, prevHas) : { count: emp.generalAbsentCount || 0, dates: emp.generalAbsentDays || [] };
      absCount = absRes.count || (absRes.dates ? absRes.dates.length : 0);
    }

    bodyHtml += `
      <div class="icc-ctx-banner absent">
        <div>
          <div class="icc-ctx-banner-title">
            <span>🔴</span><span>${isMultiTime ? 'Total Period Absent' : 'Monthly Absent'}: <b>${absCount} Days</b></span>
          </div>
          <div class="icc-ctx-banner-sub">General absent dates (excludes holidays & scheduled off-days)</div>
        </div>
        <div>
          <span class="badge" style="background:#fee2e2;color:#991b1b;font-weight:700;padding:4px 8px;border-radius:6px;font-size:11px;">${esc(periodLabel)}</span>
        </div>
      </div>
    `;

    if (!isMultiTime) {
      const absRes = typeof computeEmpGeneralAbsents === 'function' ? computeEmpGeneralAbsents(emp, cleanM, prevHas) : { dates: (emp.generalAbsentDays || []), count: (emp.generalAbsentCount || 0) };
      const dList = absRes.dates || [];
      if (!dList.length) {
        bodyHtml += `<div class="empty-msg" style="padding:20px;text-align:center;color:#059669;font-weight:700;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);">✓ আলহামদুলিল্লাহ, ${esc(periodLabel)} মাসে কোনো অ্যাবসেন্ট নেই (0 Days Absent - 100% Attendance).</div>`;
      } else {
        bodyHtml += `
          <div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">
            Specific Absent Calendar Dates (${dList.length} Days)
          </div>
          <div class="icc-ctx-date-grid">
            ${dList.map(d => `<div class="icc-ctx-date-item"><span>📅</span><span>${esc(d)}</span></div>`).join('')}
          </div>
        `;
      }

      bodyHtml += `
        <div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-top:14px;margin-bottom:8px;">
          Monthly Duty Summary
        </div>
        <div class="icc-ctx-grid">
          <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Duty Hours</span><span class="icc-ctx-kpi-val">${Math.round((Number(emp.totalDuty)||0)*10)/10}h</span></div>
          <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Overtime</span><span class="icc-ctx-kpi-val">${Math.round((Number(emp.otHours)||0)*10)/10}h</span></div>
          <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Holidays</span><span class="icc-ctx-kpi-val">${emp.holidayCount || 0}d</span></div>
          <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Nights</span><span class="icc-ctx-kpi-val">${emp.nightCount || 0}n</span></div>
          <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">4:30pm Days</span><span class="icc-ctx-kpi-val">${emp.plainDaysCount || 0}d</span></div>
          <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Punch Miss</span><span class="icc-ctx-kpi-val">${getPunchProblemCount(emp)}d</span></div>
        </div>
      `;
    } else {
      // Multi-month absent breakdown
      bodyHtml += `
        <div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">
          Month-by-Month Absent Breakdown
        </div>
      `;

      const monthBlocksHtml = loadedMonthsList.map(mStr => {
        const mEmp = (typeof monthIndexMemoryCache !== 'undefined' && monthIndexMemoryCache && monthIndexMemoryCache[mStr])
          ? monthIndexMemoryCache[mStr].find(x => x.id === emp.id || (typeof resolveEmpAliasId === 'function' && resolveEmpAliasId(x.id) === resolveEmpAliasId(emp.id)))
          : null;
        if (!mEmp) return '';
        const mPrevSet = typeof getPrevMonthNightSet === 'function' ? getPrevMonthNightSet(mStr) : new Set();
        const mPrevHas = mPrevSet.has(String(emp.id).toUpperCase()) || (typeof resolveEmpAliasId === 'function' && mPrevSet.has(resolveEmpAliasId(emp.id)));
        const mAbs = typeof computeEmpGeneralAbsents === 'function' ? computeEmpGeneralAbsents(mEmp, mStr, mPrevHas) : { dates: (mEmp.generalAbsentDays || []), count: (mEmp.generalAbsentCount || 0) };
        const dArr = mAbs.dates || [];

        const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const mParts = mStr.split('-');
        const mLbl = mParts.length === 2 ? `${mons[parseInt(mParts[1], 10)-1] || mParts[1]} ${mParts[0]}` : mStr;

        return `
          <div class="icc-ctx-month-card">
            <div class="icc-ctx-month-header">
              <div class="icc-ctx-month-title">${esc(mLbl)} <span style="font-size:12px;font-weight:700;color:${dArr.length > 0 ? '#dc2626' : '#059669'};">(${dArr.length} days absent)</span></div>
              <button type="button" class="btn-secondary" style="min-height:28px;padding:2px 8px;font-size:11px;" onclick="openFullEmployeeReport('${esc(emp.id)}', '${esc(mStr)}')">View ${esc(mLbl.split(' ')[0])} Report →</button>
            </div>
            ${dArr.length > 0
              ? `<div class="icc-ctx-date-grid" style="margin-bottom:0;">${dArr.map(d => `<div class="icc-ctx-date-item"><span>📅</span><span>${esc(d)}</span></div>`).join('')}</div>`
              : `<div style="font-size:11.5px;color:#059669;font-weight:600;">✓ 100% Attendance (0 days absent)</div>`
            }
          </div>
        `;
      }).filter(Boolean).join('');

      bodyHtml += monthBlocksHtml || `<div class="empty-msg" style="padding:16px;text-align:center;">No monthly records found.</div>`;
    }
  }

  // -------------------------------------------------------------
  // CONTEXT 2: PUNCH PROBLEM CRITERION
  // -------------------------------------------------------------
  else if (crit === 'punch') {
    const pCount = getPunchProblemCount(emp);
    bodyHtml += `
      <div class="icc-ctx-banner punch">
        <div>
          <div class="icc-ctx-banner-title">
            <span>⚠️</span><span>Missing In/Out Punches: <b>${pCount} Days</b></span>
          </div>
          <div class="icc-ctx-banner-sub">Punch missing dates requiring ERP attendance punch adjustment</div>
        </div>
        <div>
          <span class="badge" style="background:#fef3c7;color:#92400e;font-weight:700;padding:4px 8px;border-radius:6px;font-size:11px;">${esc(periodLabel)}</span>
        </div>
      </div>
    `;

    const punchRows = [];
    const monthsToScan = isMultiTime ? loadedMonthsList : [cleanM];
    monthsToScan.forEach(mStr => {
      const mEmp = (isMultiTime && typeof monthIndexMemoryCache !== 'undefined' && monthIndexMemoryCache && monthIndexMemoryCache[mStr])
        ? monthIndexMemoryCache[mStr].find(x => x.id === emp.id || (typeof resolveEmpAliasId === 'function' && resolveEmpAliasId(x.id) === resolveEmpAliasId(emp.id)))
        : emp;
      if (!mEmp || !Array.isArray(mEmp.daily)) return;
      mEmp.daily.forEach(row => {
        if (!Array.isArray(row) || row.length < 4) return;
        const [dt, day, inn, out] = row;
        // Day not closed yet (before D+1 09:00 BD): missing punch is pending, not a problem
        const _dm = String(dt || '').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
        if (_dm && typeof rptIsDayClosed === 'function') {
          const _mi = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(_dm[2].toUpperCase()) + 1;
          if (_mi > 0 && !rptIsDayClosed(+_dm[3], _mi, +_dm[1])) return;
        }
        const inMiss = typeof isPunchMissing === 'function' ? isPunchMissing(inn) : (!inn || inn === '--:--');
        const outMiss = typeof isPunchMissing === 'function' ? isPunchMissing(out) : (!out || out === '--:--');
        if (inMiss || outMiss) {
          punchRows.push({
            date: dt,
            day: day || '',
            in: inMiss ? '--:--' : inn,
            out: outMiss ? '--:--' : out,
            inMiss,
            outMiss,
            type: inMiss && outMiss ? 'In & Out Missing' : (inMiss ? 'In Punch Missing' : 'Out Punch Missing'),
            month: mStr
          });
        }
      });
    });

    if (!punchRows.length) {
      bodyHtml += `<div class="empty-msg" style="padding:20px;text-align:center;color:#059669;font-weight:700;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);">✓ আলহামদুলিল্লাহ, কোনো পাঞ্চ মিসিং সমস্যা নেই (All Punches OK).</div>`;
    } else {
      bodyHtml += `
        <div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">
          Missing Punch Records (${punchRows.length} Days)
        </div>
        <div class="icc-ctx-table-wrap">
          <table class="icc-ctx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>In Punch</th>
                <th>Out Punch</th>
                <th>Missing Type</th>
              </tr>
            </thead>
            <tbody>
              ${punchRows.map(p => `
                <tr>
                  <td style="font-weight:700;">${esc(p.date)}</td>
                  <td style="color:var(--muted);">${esc(p.day)}</td>
                  <td style="color:${p.inMiss ? '#dc2626' : 'var(--text)'};font-weight:${p.inMiss ? '800' : '600'};">${esc(p.in)}</td>
                  <td style="color:${p.outMiss ? '#dc2626' : 'var(--text)'};font-weight:${p.outMiss ? '800' : '600'};">${esc(p.out)}</td>
                  <td><span class="badge" style="background:#fee2e2;color:#991b1b;font-weight:700;padding:2px 6px;border-radius:4px;font-size:11px;">${esc(p.type)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // -------------------------------------------------------------
  // CONTEXT 3: REQUISITION CRITERION
  // -------------------------------------------------------------
  else if (crit === 'requisition' || crit === 'nightIssue' || crit === 'holidayReq') {
    const isNightView = crit === 'nightIssue';
    const isHolView = crit === 'holidayReq';
    const allReq = typeof computeEmpRequisitionProblems === 'function' ? computeEmpRequisitionProblems(emp) : (emp.requisitionProblems || []);
    const _sp = typeof splitRequisitionIssues === 'function' ? splitRequisitionIssues(allReq) : { ot: allReq.filter(p => !(p && (p.isNightIssue || p.isHolidayReq))), night: allReq.filter(p => p && p.isNightIssue), holiday: allReq.filter(p => p && !p.isNightIssue && p.isHolidayReq) };
    const reqProbs = isNightView ? _sp.night : (isHolView ? _sp.holiday : _sp.ot);
    const accent = isNightView ? '#4f46e5' : (isHolView ? '#0f766e' : '#d97706');
    const holType = p => p.kind === 'weekend-do' ? `Weekend DO${p.day ? ' (' + p.day + ')' : ''}` : 'Govt holiday';
    bodyHtml += `
      <div class="icc-ctx-banner req">
        <div>
          <div class="icc-ctx-banner-title">
            <span>${isNightView ? '🌙' : (isHolView ? '🏖️' : '📋')}</span><span>${isNightView ? 'Night Issue' : (isHolView ? 'Holiday Requisition' : 'OT Missing')}: <b>${reqProbs.length} Days</b></span>
          </div>
          <div class="icc-ctx-banner-sub">${isNightView
            ? 'Night Requisition = DN shift / night punch found but Empress Night is not YES (not counted as a night until ERP fixes it)'
            : (isHolView
              ? 'Holiday Requisition = worked on a Govt holiday / weekly off (Thu, Fri) but Empress booked it as Regular duty (holiday / DO duty missing)'
              : 'OT Requisition = worked overtime but Empress shows 0 OT (requisition pending)')}</div>
        </div>
        <div>
          <span class="badge" style="background:${isNightView ? '#e0e7ff' : (isHolView ? '#ccfbf1' : '#fef3c7')};color:${isNightView ? '#3730a3' : (isHolView ? '#115e59' : '#92400e')};font-weight:700;padding:4px 8px;border-radius:6px;font-size:11px;">${esc(periodLabel)}</span>
        </div>
      </div>
    `;

    if (!reqProbs.length) {
      bodyHtml += `<div class="empty-msg" style="padding:20px;text-align:center;color:#059669;font-weight:700;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);">${isNightView ? '✓ আলহামদুলিল্লাহ, কারো নাইট রিকুইজিশন সমস্যা নেই (All Night Requisitions OK).' : (isHolView ? '✓ আলহামদুলিল্লাহ, কারো হলিডে রিকুইজিশন সমস্যা নেই (All Holiday Requisitions OK).' : '✓ আলহামদুলিল্লাহ, কারো ওটি রিকুইজিশন পেন্ডিং নেই (All OT Requisitions OK).')}</div>`;
    } else {
      bodyHtml += `
        <div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">
          ${isNightView ? 'Night Issue Dates' : (isHolView ? 'Holiday Requisition Dates' : 'Pending Requisition Dates')} (${reqProbs.length} Days)
        </div>
        <div class="icc-ctx-table-wrap">
          <table class="icc-ctx-table">
            <thead>
              <tr>
                <th>Date</th>
                ${isHolView ? '<th>Day</th>' : ''}
                <th>Punch In/Out</th>
                <th>Duty</th>
                ${isNightView ? '' : (isHolView ? '<th>Type</th>' : '<th>Expected OT</th>')}
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${reqProbs.map(p => `
                <tr>
                  <td style="font-weight:700;">${esc(p.date)}</td>
                  ${isHolView ? `<td style="color:var(--muted);">${esc(p.day || '')}</td>` : ''}
                  <td style="color:var(--text-2);font-size:11.5px;">${esc(p.in)} - ${esc(p.out)}</td>
                  <td>${esc(p.duty || p.elapsed)}h</td>
                  ${isNightView ? '' : (isHolView ? `<td style="font-weight:800;color:${accent};">${esc(holType(p))}</td>` : `<td style="font-weight:800;color:${accent};">${esc(p.expectedOt)}</td>`)}
                  <td style="font-size:11.5px;color:var(--muted);">${isNightView ? '<b style="color:#4f46e5;">Night Issue:</b> ' : ''}${esc(p.reason || 'Pending Requisition')}${p.fix ? `<br><i>${esc(p.fix)}</i>` : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // -------------------------------------------------------------
  // CONTEXT 4: MULTI-MONTH PERFORMANCE (Duty / OT / Earned / Plain / etc.)
  // -------------------------------------------------------------
  else if (isMultiTime) {
    const mc = emp.monthsCount || loadedMonthsList.length || 1;
    bodyHtml += `
      <div class="icc-ctx-banner multi">
        <div>
          <div class="icc-ctx-banner-title">
            <span>📈</span><span>Multi-Month Performance Summary (<b>${mc} Months</b>)</span>
          </div>
          <div class="icc-ctx-banner-sub">Aggregated performance across ${esc(periodLabel)}</div>
        </div>
        <div>
          <span class="badge" style="background:var(--brand-soft);color:var(--brand-text);font-weight:700;padding:4px 8px;border-radius:6px;font-size:11px;">${esc(areaShort(areaName))}</span>
        </div>
      </div>

      <div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">
        Multi-Month Total KPIs
      </div>
      <div class="icc-ctx-grid">
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Total Duty</span><span class="icc-ctx-kpi-val">${Math.round((Number(emp.totalDuty)||0)*10)/10}h</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Total Overtime</span><span class="icc-ctx-kpi-val">${Math.round((Number(emp.otHours)||0)*10)/10}h</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Avg Duty/Day</span><span class="icc-ctx-kpi-val">${emp.avgDutyPerDay ? emp.avgDutyPerDay + 'h' : '—'}</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Avg In Time</span><span class="icc-ctx-kpi-val">${emp.avgInTimeStr || '08:00'}</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">4:30pm Days</span><span class="icc-ctx-kpi-val">${emp.plainDaysCount || 0}d</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Holiday Duty</span><span class="icc-ctx-kpi-val">${emp.holidayCount || 0}d</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Night Shifts</span><span class="icc-ctx-kpi-val">${emp.nightCount || 0}n</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Total Absent</span><span class="icc-ctx-kpi-val" style="color:#dc2626;">${emp.generalAbsentCount || 0}d</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Punch Miss</span><span class="icc-ctx-kpi-val" style="color:#d97706;">${getPunchProblemCount(emp)}d</span></div>
        ${!incMode ? `<div class="icc-ctx-kpi" style="border-color:var(--brand);"><span class="icc-ctx-kpi-label">Total Earned</span><span class="icc-ctx-kpi-val" style="color:var(--brand-text);">৳ ${Math.round(emp.totalEarned || 0)}</span></div>` : ''}
      </div>

      <div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-top:14px;margin-bottom:8px;">
        Month-by-Month Breakdown Table
      </div>
      <div class="icc-ctx-table-wrap">
        <table class="icc-ctx-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Duty</th>
              <th>OT</th>
              ${!incMode ? '<th>Earned</th>' : ''}
              <th>Absent</th>
              <th>Punch</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${loadedMonthsList.map(mStr => {
              const mEmp = (typeof monthIndexMemoryCache !== 'undefined' && monthIndexMemoryCache && monthIndexMemoryCache[mStr])
                ? monthIndexMemoryCache[mStr].find(x => x.id === emp.id || (typeof resolveEmpAliasId === 'function' && resolveEmpAliasId(x.id) === resolveEmpAliasId(emp.id)))
                : null;
              const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const mParts = mStr.split('-');
              const mLbl = mParts.length === 2 ? `${mons[parseInt(mParts[1], 10)-1] || mParts[1]} ${mParts[0]}` : mStr;

              if (!mEmp) {
                return `<tr><td style="font-weight:700;">${esc(mLbl)}</td><td colspan="${incMode ? 5 : 6}" style="color:var(--muted);text-align:center;">No work record in this month</td></tr>`;
              }
              const mDuty = Math.round((Number(mEmp.totalDuty)||0)*10)/10;
              const mOt = Math.round((Number(mEmp.otHours)||0)*10)/10;
              const mAbs = typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(mEmp, mStr) : 0;
              const mPunch = getPunchProblemCount(mEmp);
              const mEarn = Math.round(Number(mEmp.totalEarned || 0));

              return `
                <tr>
                  <td style="font-weight:700;">${esc(mLbl)}</td>
                  <td>${mDuty}h</td>
                  <td>${mOt}h</td>
                  ${!incMode ? `<td style="font-weight:700;color:var(--brand-text);">৳ ${mEarn}</td>` : ''}
                  <td style="color:${mAbs > 0 ? '#dc2626' : 'var(--text)'};font-weight:${mAbs > 0 ? '700' : '400'};">${mAbs}d</td>
                  <td style="color:${mPunch > 0 ? '#d97706' : 'var(--text)'};font-weight:${mPunch > 0 ? '700' : '400'};">${mPunch}d</td>
                  <td><button type="button" class="btn-secondary" style="min-height:26px;padding:2px 8px;font-size:11px;" onclick="openFullEmployeeReport('${esc(emp.id)}', '${esc(mStr)}')">View</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // CONTEXT 5: SINGLE MONTH STANDARD PERFORMANCE
  // -------------------------------------------------------------
  else {
    const absCount = typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(emp, cleanM) : 0;
    const punchCount = getPunchProblemCount(emp);
    bodyHtml += `
      <div class="icc-ctx-banner duty">
        <div>
          <div class="icc-ctx-banner-title">
            <span>⏱️</span><span>Monthly Performance Summary (<b>${esc(periodLabel)}</b>)</span>
          </div>
          <div class="icc-ctx-banner-sub">${esc(areaShort(areaName))} • Regular & Overtime Duty Summary</div>
        </div>
        <div>
          <span class="badge" style="background:var(--brand-soft);color:var(--brand-text);font-weight:700;padding:4px 8px;border-radius:6px;font-size:11px;">${esc(periodLabel)}</span>
        </div>
      </div>

      <div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">
        Monthly Key Indicators
      </div>
      <div class="icc-ctx-grid">
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Total Duty</span><span class="icc-ctx-kpi-val">${Math.round((Number(emp.totalDuty)||0)*10)/10}h</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Overtime</span><span class="icc-ctx-kpi-val">${Math.round((Number(emp.otHours)||0)*10)/10}h</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Avg In Time</span><span class="icc-ctx-kpi-val">${emp.avgInTimeStr || '08:00'}</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">4:30pm Days</span><span class="icc-ctx-kpi-val">${emp.plainDaysCount || 0}d</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Holiday Duty</span><span class="icc-ctx-kpi-val">${emp.holidayCount || 0}d</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Night Shifts</span><span class="icc-ctx-kpi-val">${emp.nightCount || 0}n</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Absent Days</span><span class="icc-ctx-kpi-val" style="color:${absCount > 0 ? '#dc2626' : 'var(--text)'};">${absCount}d</span></div>
        <div class="icc-ctx-kpi"><span class="icc-ctx-kpi-label">Punch Miss</span><span class="icc-ctx-kpi-val" style="color:${punchCount > 0 ? '#d97706' : 'var(--text)'};">${punchCount}d</span></div>
        ${!incMode ? `<div class="icc-ctx-kpi" style="border-color:var(--brand);"><span class="icc-ctx-kpi-label">Total Earned</span><span class="icc-ctx-kpi-val" style="color:var(--brand-text);">৳ ${Math.round(emp.totalEarned || 0)}</span></div>` : ''}
      </div>
    `;
  }

  bodyEl.innerHTML = bodyHtml;

  const targetReportMonth = isMultiTime && loadedMonthsList.length ? loadedMonthsList[loadedMonthsList.length - 1] : cleanM;
  let reportBtnText = '📊 Open Full Monthly Report';
  if (!incMode && (crit === 'duty' || crit === 'ot' || crit === 'earned' || crit === 'plain')) {
    reportBtnText = '💰 View Overtime Calculation & Payslip →';
  } else if (incMode) {
    reportBtnText = '📋 View Monthly Work Log →';
  }

  footerEl.innerHTML = `
    <button type="button" class="btn-secondary" onclick="closeIccContextModal()">✕ Close</button>
    <button type="button" class="btn-primary" onclick="openFullEmployeeReport('${esc(emp.id)}', '${esc(targetReportMonth)}')">${reportBtnText}</button>
  `;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

async function viewEmployeeFromLeaderboard(empId, forceReport = false) {
  if (forceReport) {
    return openFullEmployeeReport(empId);
  }
  return openIccContextModal(empId);
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

// Last month that has started in a given year: past year = 12, running year = this month, future year = 0.
function getMaxMonthForYear(year) {
const now = new Date();
const y = parseInt(year, 10);
if (!y || y < now.getFullYear()) return 12;
return y === now.getFullYear() ? now.getMonth() + 1 : 0;
}

// Keep the selected month inside what has actually started; disable not-yet-started months in the hub dropdown.
function clampLbMonthToCalendar() {
const ySel = document.getElementById('yearSelect');
const mSel = document.getElementById('monthSelect');
const lbYSel = document.getElementById('lbYearSelect');
const lbMSel = document.getElementById('lbMonthSelect');
const nowY = new Date().getFullYear();
let y = parseInt((lbYSel && lbYSel.value) || (ySel && ySel.value), 10) || nowY;
if (y > nowY) {
y = nowY;
[ySel, lbYSel].forEach(sel => { if (sel && [...sel.options].some(o => o.value === String(y))) sel.value = String(y); });
}
const max = getMaxMonthForYear(y);
if (lbMSel) [...lbMSel.options].forEach(o => { o.disabled = parseInt(o.value, 10) > max; });
const cur = parseInt((mSel && mSel.value) || (lbMSel && lbMSel.value), 10) || 1;
if (cur > max) {
const v = String(max).padStart(2, '0');
if (mSel) mSel.value = v;
if (lbMSel) lbMSel.value = v;
}
}

function isFutureYm(ym) {
const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
if (!m) return false;
const now = new Date();
return (+m[1] > now.getFullYear()) || (+m[1] === now.getFullYear() && +m[2] > now.getMonth() + 1);
}

function getIccPeriodOptions() {
const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const curYear = document.getElementById('yearSelect')?.value || '2026';
const opts = [];
const maxM = getMaxMonthForYear(curYear);   // running year: only months that have started
for (let m = 1; m <= maxM; m++) {
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
clampLbMonthToCalendar();   // e.g. Dec 2025 -> 2026 lands on the latest started month, not a future December
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
for (let y = 2020; y <= new Date().getFullYear(); y++) {
yearOptsHtml += `<option value="${y}" ${String(y) === String(curYear) ? 'selected' : ''}>${y}</option>`;
}
const yearSelHtml = `<select id="iccYearSelect" class="icc-year-select" aria-label="Ranking Year" onchange="onIccYearChange(this.value)">${yearOptsHtml}</select>`;
strip.innerHTML = yearSelHtml + opts.map((o, idx) => {
const isActive = (currentLbTimeMode === 'monthly' && o.mode === 'monthly' && o.month === curMonth && o.year === curYear) || (currentLbTimeMode !== 'monthly' && o.mode === currentLbTimeMode);
return `<button type="button" class="icc-period-pill ${isActive ? 'active' : ''}${(o.mode === 'monthly' && isFutureYm(o.ym)) ? ' icc-pill-future' : ''}" data-pidx="${idx}" onclick="selectIccPeriodByIndex(${idx})">${esc(o.label)}</button>`;
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
const _issCard = document.getElementById('lbIssuesCard');
if (_issCard) _issCard.style.setProperty('display', 'none', 'important');   // Issues card belongs to the Rank hub only, not the full ranking view
if (resCard) resCard.style.display = 'none';
if (quickCard) quickCard.style.display = 'none';
if (appHdr) appHdr.style.display = 'none';
if (initCard) initCard.style.display = 'none';
if (scanCard) scanCard.style.display = 'none';
if (window.RankLoader) window.RankLoader.relocate();
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
otDays: 'Most OT Days RPPF',
holiday: 'Most Holiday Duty RPPF',
night: 'Most Night Duty RPPF',
avgDuty: 'Average Duty Hour RPPF',
avgInOut: 'Avg In Time RPPF',
punch: 'Punch Problem RPPF',
requisition: 'OT Requisition RPPF',
nightIssue: 'Night Requisition (DN, Night not YES) RPPF',
holidayReq: 'Holiday Requisition RPPF',
earlyExit: 'Gate Pass / Early Exit RPPF',
absent: 'Highest Absent (General Days) RPPF'
};
const colHeaders = {
duty: 'Duty Hrs',
ot: 'OT Hrs',
earned: 'Earning',
plain: '4:30pm Days',
lessDuty: 'Duty Hrs',
lessOt: 'OT Hrs',
otDays: 'OT Days',
holiday: 'Holiday Days',
night: 'Night Shifts',
avgDuty: 'Avg Duty/Day',
avgInOut: 'Avg In',
punch: 'Missing',
requisition: 'OT Missing',
nightIssue: 'Night Issues',
holidayReq: 'Holiday Issues',
earlyExit: 'Early Exits',
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
if (reqBtn) {
  reqBtn.style.display = (activeIccCriterion === 'requisition' || activeIccCriterion === 'nightIssue' || activeIccCriterion === 'holidayReq') ? 'inline-flex' : 'none';
  reqBtn.textContent = activeIccCriterion === 'nightIssue' ? 'Forward Night Requisitions to ERP' : (activeIccCriterion === 'holidayReq' ? 'Forward Holiday Requisitions to ERP' : 'Forward OT Requisitions to ERP');
  reqBtn.style.background = reqBtn.style.borderColor = activeIccCriterion === 'nightIssue' ? '#4f46e5' : (activeIccCriterion === 'holidayReq' ? '#0f766e' : '#d97706');
}
if (sRow && (activeIccCriterion === 'punch' || activeIccCriterion === 'absent' || activeIccCriterion === 'requisition' || activeIccCriterion === 'nightIssue' || activeIccCriterion === 'holidayReq' || activeIccCriterion === 'earlyExit')) sRow.style.display = 'flex';
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
const _issCard2 = document.getElementById('lbIssuesCard');
if (_issCard2) _issCard2.style.removeProperty('display');
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
if (typeof isScanning !== 'undefined' && isScanning) return;   // loader is showing
const _ym = getCurrentMonth();
const _MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const _pm = /^(\d{4})-(\d{2})$/.exec(_ym);
const _nm = _pm ? (_MN[+_pm[2] - 1] + ' ' + _pm[1]) : _ym;
const _msg = (currentLbTimeMode === 'monthly' && isFutureYm(_ym))
? `${_nm} hasn't started yet, so there is no data. Tap an earlier month above.`
: (currentLbTimeMode === 'monthly' ? `No data found for ${_nm}. Tap another month above.` : 'No data found for this period. Tap another month above.');
body.innerHTML = '<div class="empty-msg" style="padding:16px;text-align:center;">' + _msg + '</div>';
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
const _okCrit = activeIccCriterion === 'requisition' || activeIccCriterion === 'nightIssue' || activeIccCriterion === 'holidayReq';
const emptyTxt = activeIccCriterion === 'punch' ? 'No missing In/Out punches in this selection.' : (activeIccCriterion === 'requisition' ? '✓ আলহামদুলিল্লাহ, এই সেকশনে কারো ওটি রিকুইজিশন পেন্ডিং নেই (All OT Requisitions OK).' : (activeIccCriterion === 'nightIssue' ? '✓ আলহামদুলিল্লাহ, এই সেকশনে কারো নাইট রিকুইজিশন সমস্যা নেই (All Night Requisitions OK).' : (activeIccCriterion === 'holidayReq' ? '✓ আলহামদুলিল্লাহ, এই সেকশনে কারো হলিডে রিকুইজিশন সমস্যা নেই (All Holiday Requisitions OK).' : 'No matching employees found.')));
body.innerHTML = `<div class="empty-msg" style="padding:16px;text-align:center;font-weight:700;color:${_okCrit ? '#059669' : '#64748b'};">${emptyTxt}</div>`;
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
  // Early Exit / Gate Pass is private: In-Charge and Admin only
  if (criterion === 'earlyExit' && !(typeof isEarlyExitAllowedView === 'function' && isEarlyExitAllowedView())) {
    criterion = 'duty';
  }
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
    currentLeaderboardResult.filtered.sortedByLessOT = [...base].sort((a,b) => (a.otHours - b.otHours) || (a.totalDuty - b.totalDuty));
    currentLeaderboardResult.filtered.sortedByAvgDuty = [...base].sort((a,b) => ((b.adjustedAvgDuty ?? b.avgDutyPerDay ?? 0) - (a.adjustedAvgDuty ?? a.avgDutyPerDay ?? 0)) || (b.totalDuty - a.totalDuty));
    currentLeaderboardResult.filtered.sortedByAvgInOut = [...base].sort((a,b) => (((a.avgInMins && a.avgInMins > 0) ? a.avgInMins : 9999) - ((b.avgInMins && b.avgInMins > 0) ? b.avgInMins : 9999)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
    currentLeaderboardResult.filtered.sortedByPunch = [...base].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours));
currentLeaderboardResult.filtered.sortedByRequisition = [...base].filter(e => getOtRequisitionCount(e) > 0).sort((a,b) => (getOtRequisitionCount(b) - getOtRequisitionCount(a)) || (b.totalDuty - a.totalDuty));
currentLeaderboardResult.filtered.sortedByNightIssue = [...base].filter(e => getNightIssueCount(e) > 0).sort((a,b) => (getNightIssueCount(b) - getNightIssueCount(a)) || (b.totalDuty - a.totalDuty));
currentLeaderboardResult.filtered.sortedByHolidayReq = [...base].filter(e => getHolidayReqCount(e) > 0).sort((a,b) => (getHolidayReqCount(b) - getHolidayReqCount(a)) || (b.totalDuty - a.totalDuty));
currentLeaderboardResult.filtered.sortedByAbsent = [...base].filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e) : 0) > 0).sort((a,b) => (getGeneralAbsentCount(b) - getGeneralAbsentCount(a)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
    updateLbSummaryMetrics(base);
  }
}
