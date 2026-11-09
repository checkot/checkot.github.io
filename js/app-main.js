/* Config, state, storage, and utility constants moved to js/core/ */
function didEmpWorkNightOnLastDay(emp, monthStr) {
if (!emp) return false;
if (typeof emp.lastDayNight === 'boolean') return emp.lastDayNight;
let lastCalDay = 0;
const mm = String(monthStr || emp._computedMonth || '').match(/^(\d{4})-(\d{2})$/);
if (mm) {
  lastCalDay = new Date(parseInt(mm[1], 10), parseInt(mm[2], 10), 0).getDate();
}
const daily = Array.isArray(emp.daily) ? emp.daily : [];
if (daily.length > 0) {
  if (!lastCalDay) {
    const s0 = String(daily[0][0] || '').trim();
    const qA = s0.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/i);
    if (qA) {
      const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      const mi = mons.indexOf(qA[2].toUpperCase()) + 1;
      if (mi > 0) lastCalDay = new Date(parseInt(qA[3], 10), mi, 0).getDate();
    }
  }
  if (lastCalDay > 0) {
    for (let i = 0; i < daily.length; i++) {
      const r = daily[i];
      if (r && _parseEmpDayNo(r[0]) === lastCalDay && (!!r[10] || String(r[11] || '').toUpperCase().includes('NIGHT') || String(r[11] || '').toUpperCase() === 'DN')) {
        emp.lastDayNight = true;
        return true;
      }
    }
  }
}
const nDays = Array.isArray(emp.nightDays) ? emp.nightDays : [];
if (nDays.length > 0 && lastCalDay > 0) {
  for (let i = 0; i < nDays.length; i++) {
    const nd = nDays[i];
    const k = _parseEmpDayNo(typeof nd === 'string' ? nd : nd?.date);
    if (k === lastCalDay) {
      emp.lastDayNight = true;
      return true;
    }
  }
}
emp.lastDayNight = false;
return false;
}

function getPrevMonthNightSet(targetMonthStr) {
const prevM = getPrevMonthStr(targetMonthStr);
if (!prevM) return new Set();
const prevList = (typeof monthIndexMemoryCache !== 'undefined' && monthIndexMemoryCache[prevM]) ? monthIndexMemoryCache[prevM] : null;
if (Array.isArray(prevList) && prevList.length > 0) {
  const set = new Set();
  prevList.forEach(e => {
    if (!e) return;
    if (didEmpWorkNightOnLastDay(e, prevM)) {
      const uid = String(e.id || '').trim().toUpperCase();
      if (uid) set.add(uid);
      const aid = resolveEmpAliasId(uid);
      if (aid) set.add(aid);
    }
  });
  _monthLastNightCache[prevM] = set;
  return set;
}
if (_monthLastNightCache[prevM]) return _monthLastNightCache[prevM];
return new Set();
}

function hasPrevMonthLastNight(empId, targetMonthStr, empObj) {
if (empObj && typeof empObj._prevMonthLastNight === 'boolean') return empObj._prevMonthLastNight;
const uid = String(empId || (empObj && empObj.id) || '').trim().toUpperCase();
if (!uid) return false;
const set = getPrevMonthNightSet(targetMonthStr);
return set.has(uid) || set.has(resolveEmpAliasId(uid));
}

function getMonthDatasetMeta(monthStr) {
if (!monthStr) return { maxActiveDay: 31, consensusHolidays: new Set() };
const list = (typeof monthIndexMemoryCache !== 'undefined' && monthIndexMemoryCache[monthStr]) ? monthIndexMemoryCache[monthStr] : null;
if (!Array.isArray(list) || list.length === 0) {
  return _monthDatasetMetaCache[monthStr] || { maxActiveDay: 31, consensusHolidays: new Set() };
}
if (_monthDatasetMetaCache[monthStr] && _monthDatasetMetaCache[monthStr]._len === list.length) {
  return _monthDatasetMetaCache[monthStr];
}
let maxActiveDay = 0;
const dayStats = {};
list.forEach(e => {
  if (!e || e.isRppf === false) return;
  const daily = Array.isArray(e.daily) ? e.daily : [];
  if (daily.length > 0) {
    daily.forEach(r => {
      if (!r) return;
      const k = _parseEmpDayNo(r[0]);
      if (!k || k < 1 || k > 31) return;
      const st = dayStats[k] || (dayStats[k] = { total: 0, reg: 0, hol: 0, active: 0 });
      st.total++;
      const regD = Number(r[4]) || 0;
      const doD = (Number(r[6]) || 0) + (Number(r[7]) || 0);
      const holD = (Number(r[8]) || 0) + (Number(r[9]) || 0);
      const dHrs = regD + (Number(r[5]) || 0) + doD + holD;
      const inStr = String(r[2] || '').trim();
      const outStr = String(r[3] || '').trim();
      const isNight = !!r[10];
      if (regD > 0) st.reg++;
      if (holD > 0 || doD > 0) st.hol++;
      if (dHrs > 0 || inStr || outStr || isNight) {
        st.active++;
        if (k > maxActiveDay) maxActiveDay = k;
      }
    });
  } else if (Array.isArray(e.activeDayNums)) {
    e.activeDayNums.forEach(k => {
      if (k > maxActiveDay) maxActiveDay = k;
    });
  }
});
const consensusHolidays = new Set();
Object.keys(dayStats).forEach(kStr => {
  const k = Number(kStr);
  const st = dayStats[k];
  if (st.total >= 15) {
    if (st.hol / st.total >= 0.25 || (st.reg / st.total < 0.25 && st.hol > 0)) {
      consensusHolidays.add(k);
    }
  }
});
const meta = {
  _len: list.length,
  maxActiveDay: maxActiveDay > 0 ? maxActiveDay : 31,
  consensusHolidays
};
_monthDatasetMetaCache[monthStr] = meta;
return meta;
}

function isPlantOrGovtHolidayDate(y, m, d, dn, consensusSet) {
const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const monName = (m >= 1 && m <= 12) ? mons[m - 1] : 'JAN';
const dStr = String(d).padStart(2, '0');
const fullDate = `${dStr}-${monName}-${y}`.toUpperCase();
const shortDate = `${dStr}-${monName}`.toUpperCase();

let cancelledHols = [];
let customHols = [];
try {
  let cfg = (typeof PLANT_HOLIDAYS !== 'undefined' && PLANT_HOLIDAYS) ? PLANT_HOLIDAYS : (typeof window !== 'undefined' && window.PLANT_HOLIDAYS);
  if (!cfg) {
    const raw = localStorage.getItem(typeof PLANT_HOLIDAYS_KEY !== 'undefined' ? PLANT_HOLIDAYS_KEY : 'rppf_plant_holidays_v1');
    if (raw) cfg = JSON.parse(raw);
  }
  if (cfg) {
    cancelledHols = (cfg.cancelled || []).map(x => String(x).toUpperCase().trim());
    customHols = (cfg.custom || []).concat(cfg.declared || []).map(x => String(x).toUpperCase().trim());
    if (cfg.byMonth && typeof cfg.byMonth === 'object') {
      const mKey = `${y}-${String(m).padStart(2, '0')}`;
      if (Array.isArray(cfg.byMonth[mKey])) {
        customHols.push(...cfg.byMonth[mKey].map(x => String(x).toUpperCase().trim()));
      }
    }
  }
} catch (e) {}

let dayTypeOv = {};
try {
  const rawOv = localStorage.getItem(typeof DAYTYPE_OV_KEY !== 'undefined' ? DAYTYPE_OV_KEY : 'rppf_daytype_ov_v1');
  if (rawOv) dayTypeOv = JSON.parse(rawOv) || {};
} catch (e) {}

if (dayTypeOv[fullDate] === 'R' || cancelledHols.includes(fullDate) || cancelledHols.includes(shortDate)) {
  return { isOffOrHol: false, isWeekend: false, isHoliday: false, label: '' };
}
if (dayTypeOv[fullDate] === 'H') {
  return { isOffOrHol: true, isWeekend: false, isHoliday: true, label: 'Plant / Govt Holiday' };
}
if (dayTypeOv[fullDate] === 'O') {
  return { isOffOrHol: true, isWeekend: true, isHoliday: false, label: 'Declared Off Day' };
}

const isWk = (dn === 'Thu' || dn === 'Fri');
if (isWk) {
  return { isOffOrHol: true, isWeekend: true, isHoliday: false, label: 'Weekend (Thu/Fri)' };
}

const baseGovtHols = {
  // February 2026
  '04-FEB-2026': 'Shab-e-Barat',
  '10-FEB-2026': 'National Parliamentary Election',
  '11-FEB-2026': 'National Parliamentary Election',
  '12-FEB-2026': 'National Parliamentary Election',
  '21-FEB': 'International Mother Language Day',
  '21-FEB-2026': 'International Mother Language Day',
  // March 2026
  '17-MAR-2026': 'Shab-e-Qadr',
  '18-MAR-2026': 'General Holiday',
  '19-MAR-2026': 'Eid-ul-Fitr',
  '20-MAR-2026': "Jumu'atul Wida & Eid-ul-Fitr",
  '21-MAR-2026': 'Eid-ul-Fitr',
  '22-MAR-2026': 'Eid-ul-Fitr',
  '23-MAR-2026': 'Eid-ul-Fitr',
  '26-MAR': 'Independence Day Holiday',
  '26-MAR-2026': 'Independence Day Holiday',
  // April 2026
  '14-APR': 'Bengali New Year Day (Pahela Baishakh)',
  '14-APR-2026': 'Bengali New Year Day (Pahela Baishakh)',
  // May 2026
  '01-MAY': 'May Day Holiday',
  '01-MAY-2026': 'May Day Holiday',
  '26-MAY-2026': 'Eid-ul-Azha',
  '27-MAY-2026': 'Eid-ul-Azha',
  '28-MAY-2026': 'Eid-ul-Azha',
  '29-MAY-2026': 'Eid-ul-Azha',
  '30-MAY-2026': 'Eid-ul-Azha',
  '31-MAY-2026': 'Eid-ul-Azha',
  // June 2026
  '26-JUN-2026': 'Ashura (Muharram)',
  // August 2026
  '05-AUG-2026': 'July Mass Uprising Day',
  // September 2026
  '04-SEP-2026': 'Janmashtami',
  // October 2026
  '20-OCT-2026': 'Durga Puja Holiday',
  '21-OCT-2026': 'Durga Puja Holiday',
  // December 2026
  '16-DEC': 'Victory Day Holiday',
  '16-DEC-2026': 'Victory Day Holiday',
  '25-DEC': 'Christmas Holiday',
  '25-DEC-2026': 'Christmas Holiday'
};

if (baseGovtHols[fullDate] || baseGovtHols[shortDate]) {
  return { isOffOrHol: true, isWeekend: false, isHoliday: true, label: baseGovtHols[fullDate] || baseGovtHols[shortDate] };
}
if (customHols.includes(fullDate) || customHols.includes(shortDate)) {
  return { isOffOrHol: true, isWeekend: false, isHoliday: true, label: 'Declared Plant Holiday' };
}
if (consensusSet && consensusSet.has(d)) {
  return { isOffOrHol: true, isWeekend: false, isHoliday: true, label: 'Plant Holiday / General Off' };
}
return { isOffOrHol: false, isWeekend: false, isHoliday: false, label: '' };
}
window.isPlantOrGovtHolidayDate = isPlantOrGovtHolidayDate;

function _buildEmpDayMap(e) {
const byDay = {};
if (!e) return { byDay, hasDaily: false, activeDays: 0 };
const daily = Array.isArray(e.daily) ? e.daily : [];
let activeDays = 0;
const activeNums = [];
daily.forEach(r => {
if (!r) return;
const k = _parseEmpDayNo(r[0]);
const dHrs = (Number(r[4])||0) + (Number(r[5])||0) + (Number(r[6])||0) + (Number(r[7])||0) + (Number(r[8])||0) + (Number(r[9])||0);
const inStr = String(r[2] || '').trim();
const outStr = String(r[3] || '').trim();
const isNight = !!r[10] || String(r[11] || '').toUpperCase().includes('NIGHT') || String(r[11] || '').toUpperCase() === 'DN';
if (dHrs > 0 || inStr || outStr || isNight) {
activeDays++;
if (k >= 1) {
  activeNums.push(k);
  byDay[k] = { inn: r[2], out: r[3], v: [r[4], r[5], r[6], r[7], r[8], r[9]], night: isNight, rec: true };
}
}
});
if (daily.length > 0) {
  e.activeDayNums = activeNums;
}
if (!daily.length) {
if (Array.isArray(e.activeDayNums)) {
  e.activeDayNums.forEach(k => {
    if (k >= 1) {
      byDay[k] = byDay[k] || { rec: true, inn: '08:00', out: '16:30', v: [8, 0, 0, 0, 0, 0], night: false };
      activeDays++;
    }
  });
}
(e.holidayDays || []).forEach(h => {
if (!h) return;
const k = _parseEmpDayNo(typeof h === 'string' ? h : h.date);
if (!k || k < 1) return;
byDay[k] = Object.assign(byDay[k] || { rec: true }, { v: [0, 0, h.doDuty, h.doExtra, h.holDuty, h.holExtra], inn: byDay[k]?.inn || '', out: byDay[k]?.out || '' });
});
(e.nightDays || []).forEach(n => {
if (!n) return;
const k = _parseEmpDayNo(typeof n === 'string' ? n : n.date);
if (!k || k < 1) return;
(byDay[k] = byDay[k] || { rec: true, inn: '', out: '', v: [8, 0, 0, 0, 0, 0] }).night = true;
});
(e.punchProblems || []).forEach(p => {
if (!p) return;
const k = _parseEmpDayNo(typeof p === 'string' ? p : p.date);
if (!k || k < 1) return;
(byDay[k] = byDay[k] || { rec: true, inn: '', out: '', v: [0, 0, 0, 0, 0, 0] }).forceMiss = true;
});
}
return { byDay, hasDaily: daily.length > 0 || Array.isArray(e.activeDayNums), activeDays };
}

function getNightRestDays(emp, targetMonthStr) {
if (!emp) return 0;
const { byDay, hasDaily } = _buildEmpDayMap(emp);
const dayKeys = Object.keys(byDay).map(Number).filter(k => k >= 1).sort((a, b) => a - b);
const mStr = targetMonthStr || emp._computedMonth || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
let lastCalDay = 31;
const mm = String(mStr || '').match(/^(\d{4})-(\d{2})$/);
if (mm) lastCalDay = new Date(parseInt(mm[1], 10), parseInt(mm[2], 10), 0).getDate();
if (dayKeys.length > 0) {
let restDays = 0;
if (!byDay[1] && hasPrevMonthLastNight(emp.id, mStr, emp)) {
  restDays++;
}
dayKeys.forEach(d => {
if (d < lastCalDay && byDay[d] && byDay[d].night && !byDay[d + 1]) restDays++;
});
return restDays;
}
if (!hasDaily && (!Array.isArray(emp.nightDays) || emp.nightDays.length === 0) && Number(emp.nightCount) > 0) {
return Math.max(0, Math.round(Number(emp.nightCount) || 0));
}
return 0;
}
window.NIGHT_REST_CREDIT_HOURS = NIGHT_REST_CREDIT_HOURS;
window.getNightRestDays = getNightRestDays;
let _lbView = false;
let currentFileName = "";
/* let currentSearchId = ""; declared in js/core/state.js */
/* let currentMonth = ""; declared in js/core/state.js */
/* let currentToken = 0; declared in js/core/state.js */
/* let currentResult = null; declared in js/core/state.js */
let isScanning = false;
let currentLeaderboardResult = null;
let currentLbTimeMode = 'monthly'; // 'monthly' | '3m' | '6m' | 'alltime'
let teamData = null;
let noticesData = null;
let currentLbListType = null;
let currentLbModalList = [];
/* let AREA_MAP = {}; declared in js/core/state.js */
/* let DESIG_RATES = {};   // { designation(lowercase): rateKey } declared in js/core/state.js */
/* let AREA_DETAILS = {};  // { ID: { g:"M"|"F", t:"CON"|"JO", s:"Sub-section" } } declared in js/core/state.js */
/* let AREA_SUBS = {};     // { "Area Name": ["Sub 1", "Sub 2"] } declared in js/core/state.js */
/* let AREA_MAP_LOADED = false; declared in js/core/state.js */
// Declared early on purpose: startup code (switchPage etc.) reads these before the ranking section is evaluated.
let activeIccCriterion = 'duty';
let iccDrillOpen = false;
let availableServerMonths = null;
let probingMonthsPromise = null;
let activeAdminRateBucket = 'CF';
let pendingErpMessage = '';
let pendingErpArea = '';
let pendingConfirmFn = null;
/* const monthIndexMemoryCache = {}; declared in js/core/state.js */
/* function esc moved to js/ */
/* function showSearchError moved to js/pages/ */

function stepVal(id, delta) {
const el = document.getElementById(id);
if (!el) return;
const v = (parseFloat(el.value) || 0) + delta;
el.value = Math.max(0, Math.round(v * 100) / 100);
recalculate();
}
function showToast(msg, type = 'info') {
const box = document.getElementById('toastContainer');
if (!box) return;
const el = document.createElement('div');
el.className = 'toast-msg ' + (type || 'info');
el.innerHTML = `<span style="flex:1">${esc(msg)}</span>`;
box.appendChild(el);
setTimeout(() => {
el.style.opacity = '0';
el.style.transition = 'opacity .25s ease';
setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
}, 3200);
}
/* const APP_MODE_KEY defined in js/core/config.js */
/* const INCHARGE_ROLE_KEY defined in js/core/config.js */
/* const INCHARGE_AREA_KEY defined in js/core/config.js */
const INCHARGE_PIN_CODE = '2026';
/* let _memAppMode = null; declared in js/core/state.js */
function getAppMode() {
try {
const m = localStorage.getItem(APP_MODE_KEY) || _memAppMode;
if (m === 'incharge' || m === 'employee') return m;
if (localStorage.getItem(PREFERRED_ID_KEY)) return 'employee';
return _memAppMode;
} catch (e) { return _memAppMode; }
}
function setAppMode(mode) {
_memAppMode = mode || null;
try {
if (mode) localStorage.setItem(APP_MODE_KEY, mode);
else localStorage.removeItem(APP_MODE_KEY);
} catch (e) {}
}
function getInchargeRoleLabel() {
try { return localStorage.getItem(INCHARGE_ROLE_KEY) || 'Floor In-Charge'; } catch (e) { return 'Floor In-Charge'; }
}
function getInchargeDefaultArea() {
try { return localStorage.getItem(INCHARGE_AREA_KEY) || 'all'; } catch (e) { return 'all'; }
}
/* getPreferredId cleanly provided by modular js/ */
/* setPreferredId cleanly provided by modular js/ */
function getMyId() {
if (getAppMode() === 'incharge') return '';
return getPreferredId() || '';
}
function getReportViewContext(searchedId) {
const mode = getAppMode();
const cleanSearch = String(searchedId || currentSearchId || '').trim().toUpperCase();
if (mode === 'incharge') return 'incharge';
const myId = getPreferredId();
if (myId && cleanSearch && myId === cleanSearch) return 'own';
if (myId && cleanSearch && myId !== cleanSearch) return 'other';
return 'own';
}
function updateModeUI() {
try { refreshTypeFilterOptions(); } catch (e) {}
const mode = getAppMode() || 'employee';
document.body.classList.toggle('incharge-mode-active', mode === 'incharge');
const vsSub = document.getElementById('vsPageSub');
if (vsSub) {
  vsSub.textContent = (mode === 'incharge') ? 'Compare overtime & duty hours' : 'Compare overtime & allowances';
}
const myId = getPreferredId();
const roleLabel = getInchargeRoleLabel();
const incArea = getInchargeDefaultArea();
const badges = [document.getElementById('headerModeBadge'), document.getElementById('headerModeBadgeLb'), document.getElementById('topnavModeBadge')];
badges.forEach(b => {
if (!b) return;
if (mode === 'incharge') { b.classList.add('incharge-active'); b.textContent = roleLabel; }
else { b.classList.remove('incharge-active'); b.textContent = myId ? myId : 'Set ID'; }
});
const searchBtn = document.getElementById('searchBtn');
const empIdLabel = document.querySelector('label[for="employeeId"]');
if (mode === 'incharge') {
if (empIdLabel) empIdLabel.textContent = 'Employee ID number (in-charge search)';
if (searchBtn) searchBtn.textContent = 'View employee overtime report';
} else {
if (empIdLabel) empIdLabel.textContent = myId ? `ID number (your permanent ID: ${myId})` : 'Your ID number';
if (searchBtn) searchBtn.textContent = 'View overtime report';
}
const incCard = document.getElementById('inchargeQuickCard');
const incTitle = document.getElementById('inchargeLbCardTitle');
const incBadge = document.getElementById('inchargeLbRoleBadge');
const lbMainTitle = document.getElementById('lbPageMainTitle');
if (incCard) incCard.classList.toggle('incharge-mode-highlight', mode === 'incharge');
if (incTitle) incTitle.textContent = mode === 'incharge' ? `${roleLabel} dashboard and quick search` : 'Quick search of any employee and month selection';
if (incBadge) incBadge.textContent = mode === 'incharge' ? `${roleLabel} • Active` : 'Leaderboard tool';
if (lbMainTitle) lbMainTitle.textContent = mode === 'incharge' ? `Ranking and punch monitoring` : 'Who is best this month?';
const myPosDuty = document.getElementById('myPosStripDuty');
const inlinePosStrips = document.querySelectorAll('.lb-mypos-inline');
if (mode === 'incharge') {
if (myPosDuty) myPosDuty.style.display = 'none';
inlinePosStrips.forEach(el => { el.style.display = 'none'; });
} else {
if (myPosDuty) myPosDuty.style.display = 'flex';
inlinePosStrips.forEach(el => { el.style.display = 'flex'; });
}
const setModeLbl = document.getElementById('settingsCurrentModeLabel');
const setRegIdLbl = document.getElementById('settingsRegisteredIdLabel');
const setIncAreaRow = document.getElementById('settingsInchargeAreaRow');
const setIncAreaLbl = document.getElementById('settingsInchargeAreaLabel');
const setNewIdInp = document.getElementById('settingsNewIdInput');
const setDelBtn = document.getElementById('settingsDeleteIdBtn');
const moreSummary = document.getElementById('moreModeSummaryText');
if (setModeLbl) setModeLbl.textContent = mode === 'incharge' ? `${roleLabel} mode (PIN protected)` : 'Employee mode';
if (setRegIdLbl) setRegIdLbl.textContent = myId ? myId : 'Not set';
if (setIncAreaRow && setIncAreaLbl) { setIncAreaRow.style.display = mode === 'incharge' ? 'flex' : 'none'; setIncAreaLbl.textContent = incArea === 'all' ? 'All areas' : (incArea === OVERALL_AREA ? 'Executives' : incArea); }
if (setNewIdInp && myId && !setNewIdInp.value) setNewIdInp.placeholder = `Current ID: ${myId} (enter new ID)`;
if (setDelBtn) setDelBtn.style.display = myId ? 'inline-flex' : 'none';
if (moreSummary) moreSummary.textContent = mode === 'incharge' ? `Current: ${roleLabel} mode` : (myId ? `Permanent ID: ${myId}` : 'Set your own ID');
}
function selectSetupTab(tab) {
const empBtn = document.getElementById('tabBtnEmployee');
const incBtn = document.getElementById('tabBtnIncharge');
const empPane = document.getElementById('modePaneEmployee');
const incPane = document.getElementById('modePaneIncharge');
const hero = document.getElementById('modeModalHero');
if (tab === 'incharge') {
empBtn?.classList.remove('active-emp'); incBtn?.classList.add('active-inc');
empPane?.classList.remove('active'); incPane?.classList.add('active');
hero?.classList.add('incharge-theme'); clearInchargePinError();
setTimeout(() => document.getElementById('inchargePinInput')?.focus(), 150);
} else {
incBtn?.classList.remove('active-inc'); empBtn?.classList.add('active-emp');
incPane?.classList.remove('active'); empPane?.classList.add('active');
hero?.classList.remove('incharge-theme');
setTimeout(() => document.getElementById('regEmpIdInput')?.focus(), 150);
}
}
function openModeSetupModal(defaultTab) {
const modal = document.getElementById('modeSetupModal');
if (!modal) return;
const curMode = getAppMode() || 'employee';
const myId = getPreferredId();
const regInp = document.getElementById('regEmpIdInput');
const hint = document.getElementById('regCurrentSavedHint');
const pinInp = document.getElementById('inchargePinInput');
const roleSel = document.getElementById('inchargeRoleSelect');
const areaSel = document.getElementById('inchargeDefaultAreaSelect');
if (regInp) regInp.value = myId || '';
if (hint) {
if (myId) { hint.style.display = 'block'; hint.textContent = `Your permanent ID "${myId}" is currently saved.`; }
else hint.style.display = 'none';
}
if (pinInp) { pinInp.value = ''; pinInp.type = 'password'; }
if (roleSel) roleSel.value = getInchargeRoleLabel();
if (areaSel) areaSel.value = getInchargeDefaultArea();
clearInchargePinError();
selectSetupTab(defaultTab || curMode);
modal.classList.add('open');
document.body.style.overflow = 'hidden';
}
function closeModeSetupModal() {
const modal = document.getElementById('modeSetupModal');
if (!modal) return;
modal.classList.remove('open');
document.body.style.overflow = '';
document.body.style.position = '';
document.body.style.width = '';
}
function modeModalBackdropClick(e) { if (e.target.id === 'modeSetupModal') closeModeSetupModal(); }
function togglePinVisibility() {
const inp = document.getElementById('inchargePinInput');
if (!inp) return;
inp.type = inp.type === 'password' ? 'text' : 'password';
}
function clearInchargePinError() {
const err = document.getElementById('inchargePinError');
if (err) err.classList.remove('show');
}
function saveEmployeeModeSetup() {
const inp = document.getElementById('regEmpIdInput');
const raw = (inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
if (!raw) { showToast('Please enter your own employee ID', 'warn'); if (inp) inp.focus(); return; }
setPreferredId(raw); setAppMode('employee'); updateModeUI(); closeModeSetupModal();
showToast(`Your permanent ID (${raw}) has been saved`, 'success');
const empInput = document.getElementById('employeeId');
if (empInput) { empInput.value = raw; toggleClearIdBtn(); }
switchPage('search');
findReport();
}
function saveInchargeModeSetup() {
const pinInp = document.getElementById('inchargePinInput');
const rawPin = String(pinInp ? pinInp.value : '').trim().replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
const err = document.getElementById('inchargePinError');
if (rawPin !== INCHARGE_PIN_CODE) {
if (err) err.classList.add('show');
showToast('Wrong PIN code! Enter the correct 4-digit in-charge PIN.', 'error');
if (pinInp) pinInp.focus();
return;
}
const roleVal = document.getElementById('inchargeRoleSelect')?.value || 'Floor In-Charge';
const areaVal = document.getElementById('inchargeDefaultAreaSelect')?.value || 'all';
try { localStorage.setItem(INCHARGE_ROLE_KEY, roleVal); localStorage.setItem(INCHARGE_AREA_KEY, areaVal); } catch (e) {}
setAppMode('incharge'); updateModeUI(); closeModeSetupModal();
showToast(`${roleVal} mode activated`, 'success');
switchPage('leaderboard');
}
/* function savePermanentIdFromSettings_1 moved to js/pages/ */

/* function deletePermanentIdFromSettings_1 moved to js/pages/ */

function loadMyOwnReport() {
const myId = getPreferredId();
if (!myId) { openModeSetupModal('employee'); return; }
const inp = document.getElementById('employeeId');
if (inp) { inp.value = myId; toggleClearIdBtn(); }
switchPage('search');
findReport();
}
function promptSearchColleague() {
expandSearchForm();
const inp = document.getElementById('employeeId');
if (inp) {
inp.value = '';
const myId = getPreferredId();
inp.placeholder = myId ? `Enter another colleague ID (your ${myId} will stay saved)` : 'Enter employee ID (e.g. CF8355)';
toggleClearIdBtn();
inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
setTimeout(() => inp.focus(), 200);
}
}
async function compareCurrentWithMe() {
const myId = getPreferredId();
const otherId = currentSearchId;
if (!myId || !otherId || myId === otherId) return;
switchPage('vs');
setVsMode(2);
const inp1 = document.getElementById('compareId1');
const inp2 = document.getElementById('compareId');
if (inp1) inp1.value = myId;
if (inp2) inp2.value = otherId;
setTimeout(() => runComparison(), 150);
}
/* function applyReportViewContext moved to js/pages/ */

function initAppModeOnStartup() {
updateModeUI();
const mode = getAppMode();
const myId = getPreferredId();
if (mode === 'employee' && myId) {
const inp = document.getElementById('employeeId');
if (inp) { inp.value = myId; toggleClearIdBtn(); }
setTimeout(() => { findReport(); }, 100);
} else if (mode === 'incharge') {
switchPage('leaderboard');
} else {
setTimeout(() => { openModeSetupModal('employee'); }, 350);
}
}
function checkAndShowWelcomeBack() {
const savedId = getPreferredId();
if (savedId) {
const modal = document.getElementById('welcomeBackModal');
const idBadge = document.getElementById('wbSavedId');
if (modal && idBadge) {
idBadge.textContent = savedId;
modal.classList.add('open');
document.body.style.overflow = 'hidden'; document.body.style.position = 'fixed'; document.body.style.width = '100%';
}
}
}
function closeWelcomeBackModal() {
const modal = document.getElementById('welcomeBackModal');
if (modal) { modal.classList.remove('open'); document.body.style.overflow = ''; document.body.style.position = ''; document.body.style.width = ''; }
}
function wbBackdropClick(e) { if (e.target.id === 'welcomeBackModal') closeWelcomeBackModal(); }
function handleWelcomeBackSearch() {
closeWelcomeBackModal();
const savedId = getPreferredId();
if (savedId) { const input = document.getElementById('employeeId'); if (input) { input.value = savedId; toggleClearIdBtn(); } findReport(); }
}
function handleWelcomeBackChange() {
closeWelcomeBackModal(); expandSearchForm();
setTimeout(() => { const input = document.getElementById('employeeId'); if (input) { input.value = ''; toggleClearIdBtn(); input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 300);
}
const PAY_FONT = '"Hind Siliguri","Noto Sans Bengali","Noto Sans","Segoe UI",Roboto,Arial,sans-serif';
const BN_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const money = (n) => '৳ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function handleSalaryInput(val) {
const clean = String(val).replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/[^0-9]/g, '').slice(0, 7);
const el = document.getElementById('inpSalary');
if (el && el.value !== clean) el.value = clean;
try { localStorage.setItem(SALARY_KEY, clean); } catch (e) {}
ensurePayslipFonts(); updatePayslipPreview();
}
function loadSavedSalary() {
try { const saved = localStorage.getItem(SALARY_KEY); const el = document.getElementById('inpSalary'); if (saved && el) el.value = saved; } catch (e) {}
}
function getPayslipTotals() {
const r = currentResult || {};
const salary = parseFloat(document.getElementById('inpSalary')?.value) || 0;
const ot = r.totalEarned || 0;
return { salary, ot, total: salary + ot };
}
function updatePayslipPreview() {
if (!currentResult) return;
const t = getPayslipTotals();
const preview = document.getElementById('payslipPreview');
const actions = document.getElementById('payslipActions');
if (!preview || !actions) return;
if (t.salary <= 0) { preview.style.display = 'none'; actions.style.display = 'none'; return; }
schedulePayslipPrebuild();
preview.style.display = 'block'; actions.style.display = 'grid';
preview.innerHTML = `
<div class="payslip-row"><span>Monthly salary (Regular Duty)</span><span>${money(t.salary)}</span></div>
<div class="payslip-row"><span>Total allowances (OT + Holiday + Night)</span><span>${money(t.ot)}</span></div>
<div class="payslip-row total"><span>Total take-home</span><span>${money(t.total)}</span></div>`;
}
let _payFonts = null;
function ensurePayslipFonts() {
if (_payFonts) return _payFonts;
if (!document.fonts || !document.fonts.load) return (_payFonts = Promise.resolve());
const sample = 'My overtime ৳ 0123456789 monthly salary RPPF 0123456789';
const loads = ['400', '600', '700'].map(w => document.fonts.load(`${w} 28px "Hind Siliguri"`, sample));
_payFonts = Promise.race([Promise.all(loads).then(() => document.fonts.ready), new Promise(r => setTimeout(r, 3000))]).catch(() => {});
return _payFonts;
}
function _rr(x, a, b, w, h, r) {
x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
function _warmCanvasFonts() {
const c = document.createElement('canvas').getContext('2d');
['400', '600', '700'].forEach(w => { c.font = `${w} 30px ${PAY_FONT}`; c.measureText('My overtime ৳ 0123456789'); });
}
function _txt(x, text, px, py, size, weight, color, align, maxW) {
text = String(text == null ? '' : text).normalize('NFC');
let s = size;
x.font = `${weight} ${s}px ${PAY_FONT}`;
while (maxW && s > 18 && x.measureText(text).width > maxW) { s -= 2; x.font = `${weight} ${s}px ${PAY_FONT}`; }
x.fillStyle = color; x.textAlign = align || 'left';
x.fillText(text, px, py);
}
let _payBlob = null, _payKey = '', _payTimer = null;
function _payKeyNow() { const t = getPayslipTotals(); return [currentSearchId, currentMonth, t.salary, t.ot].join('|'); }
async function getPayslipBlob() {
const k = _payKeyNow();
if (_payBlob && _payKey === k) return _payBlob;
const b = await _canvasToBlob(await generatePayslipCanvas());
_payBlob = b; _payKey = k;
return b;
}
function schedulePayslipPrebuild() {
clearTimeout(_payTimer);
_payTimer = setTimeout(() => { if (currentResult && getPayslipTotals().salary > 0) getPayslipBlob().catch(() => {}); }, 600);
}
async function generatePayslipCanvas() {
await ensurePayslipFonts();
const t = getPayslipTotals();
const r = currentResult || {};
_warmCanvasFonts();
const W = 1080, H = 1420, P = 72;
const c = document.createElement('canvas');
c.width = W; c.height = H;
const x = c.getContext('2d');
x.textBaseline = 'alphabetic'; x.direction = 'ltr'; try { x.letterSpacing = '0px'; } catch (e) {}
try { x.fontKerning = 'normal'; x.textRendering = 'optimizeLegibility'; } catch (e) {}
x.fillStyle = '#F3F6FB'; x.fillRect(0, 0, W, H);
x.save(); x.shadowColor = 'rgba(11,27,51,.12)'; x.shadowBlur = 30; x.shadowOffsetY = 12;
x.fillStyle = '#FFFFFF'; _rr(x, 40, 40, W - 80, H - 80, 36); x.fill(); x.restore();
x.save(); _rr(x, 40, 40, W - 80, H - 80, 36); x.clip();
const g = x.createLinearGradient(40, 40, W - 40, 290);
g.addColorStop(0, '#1E3A8A'); g.addColorStop(1, '#2563EB');
x.fillStyle = g; x.fillRect(40, 40, W - 80, 250); x.restore();
_txt(x, 'RPPF', P, 140, 56, 700, '#FFFFFF');
_txt(x, 'Overtime and allowance statement (estimated)', P, 204, 30, 400, 'rgba(255,255,255,.88)', 'left', W - 2 * P);
const [yy, mm] = String(currentMonth).split('-');
const monthLabel = `${BN_MONTHS[(parseInt(mm, 10) || 1) - 1]} ${bn(yy)}`;
_txt(x, r.name || 'Employee name', P, 380, 42, 700, '#0B1B33', 'left', W - 2 * P);
const isRppf = currentResult?.isRppf !== false;
const areaStr = isRppf ? getAreaForId(currentSearchId, true) : 'Other facility';
_txt(x, `ID: ${currentSearchId}   •   ${areaStr}`, P, 436, 28, 400, '#566783', 'left', W - 2 * P);
_txt(x, `${monthLabel}   •   ${RATE_TABLE[r.category]?.name || r.category || ''}`, P, 484, 28, 400, '#566783', 'left', W - 2 * P);
x.strokeStyle = '#DCE4F0'; x.lineWidth = 2;
x.beginPath(); x.moveTo(P, 526); x.lineTo(W - P, 526); x.stroke();
const rows = [
['Monthly salary (Regular Duty)', money(t.salary)],
[`OT Allowance (${r.otHours || 0} hours)`, money(r.otAmount)],
[`Holiday Allowance (${r.holiday || 0} days)`, money(r.holidayAmount)],
[`Night Allowance (${r.night || 0} nights)`, money(r.nightAmount)]
];
let y = 604;
rows.forEach((row, i) => {
_txt(x, row[0], P, y, 32, 600, '#33445F', 'left', 560);
_txt(x, row[1], W - P, y, 34, 700, '#0B1B33', 'right', 320);
if (i < rows.length - 1) { x.beginPath(); x.moveTo(P, y + 34); x.lineTo(W - P, y + 34); x.strokeStyle = '#EDF2F9'; x.stroke(); }
y += 96;
});
x.fillStyle = '#E8F0FF'; _rr(x, P - 12, 1010, W - 2 * P + 24, 220, 28); x.fill();
x.strokeStyle = '#BFD3FB'; x.lineWidth = 2; x.stroke();
_txt(x, 'Total take-home (estimated)', W / 2, 1080, 32, 700, '#1D4ED8', 'center', W - 2 * P - 40);
_txt(x, money(t.total), W / 2, 1180, 84, 700, '#1D4ED8', 'center', W - 2 * P - 40);
_txt(x, '* Estimate calculated from the report. This is not an official payslip.', W / 2, 1292, 26, 400, '#566783', 'center', W - 2 * P);
_txt(x, `Created: ${new Date().toLocaleDateString('en-GB')}  •  RPPF App`, W / 2, 1352, 22, 400, '#8EA0BC', 'center', W - 2 * P);
return c;
}
function _canvasToBlob(c) { return new Promise(res => c.toBlob(res, 'image/jpeg', 0.95)); }
async function downloadPayslipJPG() {
showToast('Creating image...', 'info');
const blob = await getPayslipBlob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = `Payslip_${currentSearchId}_${currentMonth}.jpg`;
document.body.appendChild(a); a.click(); a.remove();
setTimeout(() => URL.revokeObjectURL(url), 4000);
showToast('Image saved (check your Downloads folder)', 'success');
}
async function sharePayslip() {
const t = getPayslipTotals();
const blob = await getPayslipBlob();
const file = new File([blob], `Payslip_${currentSearchId}_${currentMonth}.jpg`, { type: 'image/jpeg' });
if (navigator.canShare && navigator.canShare({ files: [file] })) {
try { await navigator.share({ files: [file], title: 'RPPF', text: `My estimated total: ${money(t.total)}` }); }
catch (err) { if (err && err.name !== 'AbortError') await downloadPayslipJPG(); }
} else {
await downloadPayslipJPG();
showToast('Share option is not available, so the image was saved to your phone.', 'info');
}
}
const BANNER_SLIDE_COUNT = 4;
const BANNER_INTERVAL_MS = 8000;
let bannerCurrentIndex = 0;
let bannerTimer = null;
let bannerProgressTimer = null;
let bannerProgressStart = 0;
let bannerPaused = false;
let bannerTouchStartX = 0;
let bannerTouchEndX = 0;
function updateBannerUI() {
const track = document.getElementById('wsTrack');
if (!track) return;
track.style.transform = `translateX(-${bannerCurrentIndex * 100}%)`;
const dots = document.querySelectorAll('.ws-dot');
dots.forEach((d, idx) => d.classList.toggle('active', idx === bannerCurrentIndex));
}
function goToBannerSlide(index) { bannerCurrentIndex = (index + BANNER_SLIDE_COUNT) % BANNER_SLIDE_COUNT; updateBannerUI(); resetBannerAutoPlay(); }
function nextBannerSlide() { goToBannerSlide(bannerCurrentIndex + 1); }
function prevBannerSlide() { goToBannerSlide(bannerCurrentIndex - 1); }
function resetBannerAutoPlay() {
if (bannerTimer) clearInterval(bannerTimer);
if (bannerProgressTimer) clearInterval(bannerProgressTimer);
const fill = document.getElementById('bannerProgressFill');
if (fill) {
fill.style.transition = 'none';
fill.style.width = '0%';
requestAnimationFrame(() => {
fill.style.transition = `width ${BANNER_INTERVAL_MS}ms linear`;
fill.style.width = '100%';
});
}
bannerProgressTimer = setInterval(() => {
if (bannerPaused || document.visibilityState !== 'visible' || currentPermanentPage !== 'search' || currentSideDrawerPage || document.body.classList.contains('has-result')) {
return;
}
bannerCurrentIndex = (bannerCurrentIndex + 1) % BANNER_SLIDE_COUNT;
updateBannerUI();
if (fill) {
fill.style.transition = 'none';
fill.style.width = '0%';
requestAnimationFrame(() => {
fill.style.transition = `width ${BANNER_INTERVAL_MS}ms linear`;
fill.style.width = '100%';
});
}
}, BANNER_INTERVAL_MS);
}
function initWelcomeBanner() {
const slider = document.getElementById('welcomeBanner');
if (!slider) return;
slider.addEventListener('mouseenter', () => { bannerPaused = true; });
slider.addEventListener('mouseleave', () => { bannerPaused = false; });
slider.addEventListener('touchstart', e => { bannerPaused = true; bannerTouchStartX = e.changedTouches[0].screenX; }, { passive: true });
slider.addEventListener('touchend', e => {
bannerPaused = false; bannerTouchEndX = e.changedTouches[0].screenX;
const diff = bannerTouchStartX - bannerTouchEndX;
if (Math.abs(diff) > 40) { if (diff > 0) nextBannerSlide(); else prevBannerSlide(); }
}, { passive: true });
updateBannerUI(); resetBannerAutoPlay();
}
function focusSearchInput() {
expandSearchForm();
const inp = document.getElementById('employeeId');
if (inp) { inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => inp.focus(), 250); }
}
function syncRateDropdownOptions() {
const keys = Object.keys(RATE_TABLE).filter(k => !RATE_TABLE[k].noRate);
['inpCategory', 'qcCategory'].forEach(selId => {
const sel = document.getElementById(selId);
if (!sel) return;
const prev = sel.value;
sel.innerHTML = keys.map(k => {
const r = RATE_TABLE[k];
return `<option value="${esc(k)}">${esc(r.name || k)} (৳${r.otRate}/hr)</option>`;
}).join('');
if (keys.includes(prev)) sel.value = prev;
});
const tbody = document.getElementById('rateChartTableBody');
if (tbody) {
tbody.innerHTML = keys.map(k => {
const r = RATE_TABLE[k];
const holTxt = r.holidayType === 'hourly'
? `${r.holidayHours || 8} hours × ৳${r.otRate}<br><small style="color:var(--muted)">(৳ ${(r.holidayHours || 8) * r.otRate} / day)</small>`
: `<strong>৳ ${r.holidayFlat}</strong> / day<br><small style="color:var(--muted)">(Fixed)</small>`;
return `<tr><td><strong>${esc(k)}</strong><br><small style="color:var(--muted)">${esc(r.name || '')}</small></td><td><strong>৳ ${r.otRate}</strong> / hour</td><td>${holTxt}</td><td><strong>৳ ${r.nightRate}</strong> / night</td></tr>`;
}).join('');
}
}
function openRateChartModal() {
const modal = document.getElementById('rateChartModal');
if (!modal) return;
syncRateDropdownOptions();
runQuickModalCalc();
modal.classList.add('open');
document.body.style.overflow = 'hidden'; document.body.style.position = 'fixed'; document.body.style.width = '100%';
}
function closeRateChartModal() {
const modal = document.getElementById('rateChartModal');
if (!modal) return;
modal.classList.remove('open');
document.body.style.overflow = ''; document.body.style.position = ''; document.body.style.width = '';
}
function rateModalBackdropClick(e) { if (e.target.id === 'rateChartModal') closeRateChartModal(); }
function runQuickModalCalc() {
const cat = document.getElementById('qcCategory')?.value || 'JO';
const otHours = parseFloat(document.getElementById('qcOt')?.value) || 0;
const holiday = parseInt(document.getElementById('qcHol')?.value) || 0;
const night = parseInt(document.getElementById('qcNight')?.value) || 0;
const r = RATE_TABLE[cat] || RATE_TABLE.JO;
const otAmount = otHours * r.otRate;
const holidayAmount = r.holidayType === 'hourly' ? (holiday * r.holidayHours * r.otRate) : (holiday * r.holidayFlat);
const nightAmount = night * r.nightRate;
const total = otAmount + holidayAmount + nightAmount;
const bdEl = document.getElementById('qcBreakdownText');
const totEl = document.getElementById('qcTotalValue');
if (bdEl) bdEl.textContent = `OT Allowance ৳${otAmount.toFixed(2)} + Holiday Allowance ৳${holidayAmount.toFixed(2)} + Night Allowance ৳${nightAmount.toFixed(2)}`;
if (totEl) totEl.textContent = `৳ ${total.toFixed(2)}`;
}
async function fetchJsonResource(filename, timeoutMs) {
const urls = [];
if (location.protocol === 'http:' || location.protocol === 'https:') urls.push(new URL(filename, location.href).href);
const remoteUrl = REMOTE_BASE_URL + filename;
if (!urls.includes(remoteUrl)) urls.push(remoteUrl);
let lastErr = null;
const limit = timeoutMs || 12000;
for (const u of urls) {
// Without a timeout a stalled mobile connection leaves the fetch pending forever and the UI stuck on "Verifying data".
const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
const timer = ctrl ? setTimeout(() => ctrl.abort(), limit) : null;
try {
const resp = await fetch(u, ctrl ? { cache: 'no-store', signal: ctrl.signal } : { cache: 'no-store' });
if (resp.ok) return await resp.json();
lastErr = new Error('HTTP ' + resp.status + ' for ' + filename);
} catch (e) { lastErr = e; }
finally { if (timer) clearTimeout(timer); }
}
throw lastErr || new Error('Failed to load ' + filename);
}
/* const _monthInflight = {}; declared in js/core/state.js */
/* const _monthPersisted = {}; declared in js/core/state.js */
function fetchMonthPreIndexedData(month, forceFresh = false, persist = true) {
const key = month + (forceFresh ? '|fresh' : '');
if (_monthInflight[key]) return _monthInflight[key];
const p = _fetchMonthImpl(month, forceFresh, persist).finally(() => { delete _monthInflight[key]; });
_monthInflight[key] = p;
return p;
}
function persistMonthCache(month, employees) {
const run = () => {
try {
const mKeys = Object.keys(localStorage).filter(k => k.startsWith(MONTH_DATA_CACHE_PREFIX) && k !== MONTH_DATA_CACHE_PREFIX + month);
if (mKeys.length >= 2) mKeys.sort().slice(0, mKeys.length - 1).forEach(k => localStorage.removeItem(k));
// Pre-index activeDayNums, lastDayNight, and absent/requisition metrics before stripping daily for localStorage
const slim = employees.map(e => {
  if (!Array.isArray(e.activeDayNums) && Array.isArray(e.daily) && e.daily.length > 0) _buildEmpDayMap(e);
  didEmpWorkNightOnLastDay(e, month);
  const c = { ...e };
  delete c.daily;
  return c;
});
localStorage.setItem(MONTH_DATA_CACHE_PREFIX + month, JSON.stringify({ ts: Date.now(), employees: slim }));
} catch (e) {}
};
if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3000 }); else setTimeout(run, 400);
}
async function _fetchMonthImpl(month, forceFresh = false, persist = true) {
if (!forceFresh && monthIndexMemoryCache[month]) {
if (persist && !_monthPersisted[month]) { _monthPersisted[month] = true; persistMonthCache(month, monthIndexMemoryCache[month]); }
return monthIndexMemoryCache[month];
}
try {
const data = await fetchJsonResource(`data/${month}.json`);
const list = Array.isArray(data) ? data : (Array.isArray(data?.employees) ? data.employees : null);
if (list && list.length > 0) {
await loadAreaMap();
const normalized = list.map(e => {
const u = String(e.id || '').toUpperCase().trim();
const d = (typeof AREA_DETAILS !== 'undefined' && AREA_DETAILS && AREA_DETAILS[u]) || (typeof getEmpMeta === 'function' ? { s: getEmpMeta(u).sub } : {});
const subVal = e.sub || e.subsection || d.s || '';
const obj = {
...e,
id: u,
isRppf: e.isRppf !== false,
area: (typeof AREA_MAP !== 'undefined' && AREA_MAP && AREA_MAP[u]) ? AREA_MAP[u] : (e.area && e.area !== 'Not on the list' ? e.area : ((e.isRppf !== false) ? getAreaForId(u, true) : (e.area || 'Other facility'))),
sub: subVal,
subsection: subVal
};
if (Array.isArray(obj.daily) && obj.daily.length > 0) _buildEmpDayMap(obj);
getEmpOtDays(obj);
didEmpWorkNightOnLastDay(obj, month);
return obj;
});
normalized.forEach(applyTypeOverride);
monthIndexMemoryCache[month] = normalized;
getMonthDatasetMeta(month);
if (persist) { _monthPersisted[month] = true; persistMonthCache(month, normalized); }
return normalized;
}
} catch (e) {
try {
const raw = localStorage.getItem(MONTH_DATA_CACHE_PREFIX + month);
if (raw) {
const parsed = JSON.parse(raw);
if (parsed && Array.isArray(parsed.employees) && (Date.now() - (parsed.ts || 0) < CACHE_TTL_MS)) {
await loadAreaMap();
parsed.employees.forEach(e => {
  const u = String(e.id || '').toUpperCase().trim();
  const d = (typeof AREA_DETAILS !== 'undefined' && AREA_DETAILS && AREA_DETAILS[u]) || (typeof getEmpMeta === 'function' ? { s: getEmpMeta(u).sub } : {});
  if (!e.sub) { e.sub = d.s || ''; e.subsection = e.sub; }
  applyTypeOverride(e);
});
monthIndexMemoryCache[month] = parsed.employees;
return parsed.employees;
}
}
} catch (err) {}
}
return null;
}
function getRequisitionProblemCount(emp) {
  if (!emp) return 0;
  if (Array.isArray(emp.requisitionProblems)) return emp.requisitionProblems.length;
  if (emp.requisitionProblemCount != null) return Number(emp.requisitionProblemCount) || 0;
  const probs = typeof computeEmpRequisitionProblems === 'function' ? computeEmpRequisitionProblems(emp) : [];
  emp.requisitionProblems = probs;
  emp.requisitionProblemCount = probs.length;
  return probs.length;
}
function getPunchProblemCount(emp) {
if (!emp) return 0;
if (Array.isArray(emp.punchProblems)) return emp.punchProblems.length;
return Number(emp.punchProblems) || 0;
}
var LEGACY_DESIG_TAIL = /\s+((?:Junior\s+Officer\s+[A-F])|Helper|Casual|(?:Senior\s+)?(?:Deputy\s+|Assistant\s+|Additional\s+|Senior\s+Deputy\s+)?Manager\b.*|(?:Senior\s+)?Officer(?:\s+[A-F])?|Un-?Skilled\s+Worker(?:\s+[IVX]+)?|Skilled\s+Worker(?:\s+[IVX]+)?|Head\s+of\b.*|In-?Charge\b.*|Executive\b.*)$/i;
/* repairLegacyEmployee cleanly provided by modular js/ */
/* desigKey cleanly provided by modular js/ */
/* getDefaultRateCat is provided by js/calculations/rates.js?v=20261106b */
/* function getRateCategory moved to js/ */
/* function deriveEmpKind moved to js/ */
/* function applyTypeOverride moved to js/ */
function reapplyTypeOverrides() {
Object.keys(monthIndexMemoryCache).forEach(m => (monthIndexMemoryCache[m] || []).forEach(e => {
  const u = String(e.id || '').toUpperCase().trim();
  const d = (typeof AREA_DETAILS !== 'undefined' && AREA_DETAILS && AREA_DETAILS[u]) || (typeof getEmpMeta === 'function' ? { s: getEmpMeta(u).sub } : {});
  e.area = getAreaForId(e.id, true);
  e.sub = d.s || e.sub || e.subsection || '';
  e.subsection = e.sub;
  applyTypeOverride(e);
}));
}
function isExecHiddenFor(e) {
return Boolean(e) && getAppMode() !== 'incharge' && e.kind === 'EXEC' && e.valid === true;
}
function pickBestEmployee(a, b) {
const aPunch = getPunchProblemCount(a);
const bPunch = getPunchProblemCount(b);
if (aPunch !== bPunch) return aPunch < bPunch ? a : b;
if (a.totalDuty !== b.totalDuty) return a.totalDuty > b.totalDuty ? a : b;
if (a.otHours !== b.otHours) return a.otHours > b.otHours ? a : b;
if (a.nightCount !== b.nightCount) return a.nightCount > b.nightCount ? a : b;
if (a.holidayCount !== b.holidayCount) return a.holidayCount > b.holidayCount ? a : b;
return a;
}
/* const THEME_KEY defined in js/core/config.js */
function getThemePref() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
function resolveTheme(pref) {
if (pref === 'light' || pref === 'dark') return pref;
return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function applyTheme(pref) {
const t = resolveTheme(pref);
document.documentElement.setAttribute('data-theme', t);
const m = document.querySelector('meta[name="theme-color"]');
if (m) m.setAttribute('content', t === 'dark' ? '#0A1220' : '#F3F6FB');
document.querySelectorAll('[data-theme-opt]').forEach(b => b.classList.toggle('active', b.getAttribute('data-theme-opt') === pref));
}
function setTheme(pref) {
try { if (pref === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, pref); } catch (e) {}
applyTheme(pref);
}
function toggleTheme() {
const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
setTheme(cur === 'dark' ? 'light' : 'dark');
}
function initTheme() {
applyTheme(getThemePref());
if (window.matchMedia) {
const mq = matchMedia('(prefers-color-scheme: dark)');
const h = () => { if (getThemePref() === 'auto') applyTheme('auto'); };
if (mq.addEventListener) mq.addEventListener('change', h); else if (mq.addListener) mq.addListener(h);
}
}
function bn(str) { return String(str); }
function getDesignation(emp) {
if (!emp || !emp.id) return '';
const id = String(emp.id).toUpperCase();
const _t = (typeof getEmpMeta === 'function') ? getEmpMeta(id).type : '';
if (_t === 'CAS') return 'Casual';
if (_t === 'EXEC') return 'Executive/Above';
if (id.startsWith('CF')) return 'Contractual';
if (id.startsWith('RF')) return 'Junior Officer';
if (id.startsWith('CL')) return 'Casual';
if (emp.category === 'CF') return 'Contractual';
if (emp.category === 'JO' || emp.category === 'JO_B') return 'Junior Officer';
return '';
}
let _areaMapPromise = null;
let _areaMapLastFail = 0;
function loadAreaMap() {
if (AREA_MAP_LOADED && Object.keys(AREA_MAP).length > 0) return Promise.resolve(AREA_MAP);
if (_areaMapPromise) return _areaMapPromise;
// A just-failed load is not retried straight away, so one search never waits through several timeouts in a row.
if (_areaMapLastFail && Date.now() - _areaMapLastFail < 30000 && Object.keys(AREA_MAP).length > 0) return Promise.resolve(AREA_MAP);
_areaMapPromise = _loadAreaMapImpl().finally(() => { _areaMapPromise = null; });
return _areaMapPromise;
}
async function _loadAreaMapImpl() {
let hadCache = false;
try {
const cachedRaw = localStorage.getItem(AREA_MAP_CACHE_KEY);
if (cachedRaw) {
const parsed = JSON.parse(cachedRaw);
if (parsed && parsed.data && typeof parsed.data === 'object') {
AREA_MAP = parsed.data;
hadCache = true;
AREA_DETAILS = (parsed.details && typeof parsed.details === 'object') ? parsed.details : {};
AREA_SUBS = (parsed.subs && typeof parsed.subs === 'object') ? parsed.subs : {};
DESIG_RATES = (parsed.rates && typeof parsed.rates === 'object') ? parsed.rates : {};
if (parsed.rateTable && typeof parsed.rateTable === 'object') {
RATE_TABLE = Object.assign(JSON.parse(JSON.stringify(DEFAULT_RATE_TABLE)), parsed.rateTable);
}
if (parsed.holidays && typeof parsed.holidays === 'object') {
window.PLANT_HOLIDAYS = parsed.holidays;
}
}
}
} catch (e) {}
try {
const data = await fetchJsonResource('areas.json', hadCache ? 6000 : 10000);
AREA_MAP = (data && data.areas && typeof data.areas === 'object') ? data.areas : DEFAULT_FALLBACK_AREAS;
AREA_DETAILS = (data && data.details && typeof data.details === 'object') ? data.details : {};
AREA_SUBS = (data && data.subsections && typeof data.subsections === 'object') ? data.subsections : {};
DESIG_RATES = (data && data.designationRates && typeof data.designationRates === 'object') ? data.designationRates : {};
if (data && data.rateTable && typeof data.rateTable === 'object') {
RATE_TABLE = Object.assign(JSON.parse(JSON.stringify(DEFAULT_RATE_TABLE)), data.rateTable);
}
if (data && data.holidays && typeof data.holidays === 'object') {
window.PLANT_HOLIDAYS = data.holidays;
try {
  localStorage.setItem(typeof PLANT_HOLIDAYS_KEY !== 'undefined' ? PLANT_HOLIDAYS_KEY : 'rppf_plant_holidays_v1', JSON.stringify(data.holidays));
} catch (e) {}
}
AREA_MAP_LOADED = true;
saveAreaCache();
syncRateDropdownOptions();
updateSettingsAreaCount();
return AREA_MAP;
} catch (e) {
if (!AREA_MAP || Object.keys(AREA_MAP).length === 0) AREA_MAP = DEFAULT_FALLBACK_AREAS;
// Only treat the map as final if it came from a real cache; the one-entry fallback must be retried next time.
AREA_MAP_LOADED = hadCache;
if (!hadCache) _areaMapLastFail = Date.now();
syncRateDropdownOptions();
updateSettingsAreaCount();
return AREA_MAP;
}
}
/* isMappedAreaId cleanly provided by modular js/ */
function saveAreaCache() {
try {
localStorage.setItem(AREA_MAP_CACHE_KEY, JSON.stringify({
ts: Date.now(),
data: AREA_MAP,
details: AREA_DETAILS,
subs: AREA_SUBS,
rates: DESIG_RATES,
rateTable: RATE_TABLE,
holidays: (typeof PLANT_HOLIDAYS !== 'undefined' && PLANT_HOLIDAYS) ? PLANT_HOLIDAYS : (typeof window !== 'undefined' ? window.PLANT_HOLIDAYS : null)
}));
} catch (e) {}
}
const EMP_TYPE_LABELS = { CON: 'Contractual', JO: 'Junior Officer', CAS: 'Casual', EXEC: 'Executive/Above' };
const GENDER_LABELS = { M: 'Male', F: 'Female' };
/* getAutoEmpType cleanly provided by modular js/ */
const DEFAULT_CUSTOM_CATS = ['Shift A', 'Shift B', 'Shift C', 'Line Leader', 'Senior Operator', 'Special OT'];
function getMasterCustomCategories() {
if (!AREA_SUBS || typeof AREA_SUBS !== 'object') AREA_SUBS = {};
const saved = Array.isArray(AREA_SUBS.__custom_cats__) ? AREA_SUBS.__custom_cats__ : [];
const fromDetails = [];
if (AREA_DETAILS && typeof AREA_DETAILS === 'object') {
Object.values(AREA_DETAILS).forEach(d => {
if (d && Array.isArray(d.c)) d.c.forEach(c => { if (c) fromDetails.push(String(c).trim()); });
});
}
const merged = [...new Set([...DEFAULT_CUSTOM_CATS, ...saved, ...fromDetails].filter(Boolean))];
AREA_SUBS.__custom_cats__ = merged;
return merged;
}
function refreshCustomCatFilterOptions() {
const sel = document.getElementById('customCatFilter');
if (!sel) return;
const cats = getMasterCustomCategories();
const prev = sel.value || 'all';
sel.innerHTML = '<option value="all">All categories</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
sel.value = [...sel.options].some(o => o.value === prev) ? prev : 'all';
}
/* getEmpMeta cleanly provided by modular js/ */
/* function enrichLbEmployees moved to js/pages/leaderboard.js */

function pruneAreaMeta() {
Object.keys(AREA_DETAILS).forEach(id => {
const d = AREA_DETAILS[id];
const area = AREA_MAP[id];
if (!area || !d) { delete AREA_DETAILS[id]; return; }
if (d.s && !(AREA_SUBS[area] || []).includes(d.s)) delete d.s;
const hasCats = Array.isArray(d.c) && d.c.length > 0;
if (!d.g && !d.t && !d.s && !hasCats) delete AREA_DETAILS[id];
});
}
function getAreaForId(id, isRppf = true) {
if (!id) return "Not on the list";
const upperId = String(id).toUpperCase().trim();
if (AREA_MAP[upperId]) return AREA_MAP[upperId];
return isRppf ? "Not on the list" : "Other facility";
}
function populateAreaDropdown() {
const sel = document.getElementById('areaFilter');
if (!sel) return;
const standardAreas = ["Solid Production", "Softgel Production", "Packing Hall", OVERALL_AREA];
const jsonAreas = [...new Set(Object.values(AREA_MAP))].filter(Boolean);
const allAreas = [...new Set([...standardAreas, ...jsonAreas])].filter(a => a !== OVERALL_AREA || getAppMode() === 'incharge').sort((a, b) => a.localeCompare(b));
let html = '<option value="all">All areas</option>';
allAreas.forEach(a => {
const lbl = a === OVERALL_AREA ? 'Executives' : a;
html += `<option value="${esc(a)}">${esc(lbl)}</option>`;
});
const currentVal = sel.value || 'all';
sel.innerHTML = html;
if ([...sel.options].some(o => o.value === currentVal)) sel.value = currentVal;
}
/* function updateSettingsAreaCount moved to js/pages/ */

/* function initYearDropdown moved to js/pages/ */

/* function setDefaultMonth moved to js/pages/ */

function activateLbCriteriaTab(target) {
const tabs = document.querySelectorAll('.lb-tab');
const panels = document.querySelectorAll('.lb-panel');
tabs.forEach(t => {
const isMatch = t.getAttribute('data-lb-tab') === target;
t.classList.toggle('active', isMatch);
t.setAttribute('aria-selected', isMatch ? 'true' : 'false');
});
panels.forEach(p => {
p.classList.toggle('active', p.getAttribute('data-lb-panel') === target);
});
updateAreaHint(target);
}
/* function initLbTabs moved to js/pages/leaderboard.js */

function getCached(month, id) { try { const raw = localStorage.getItem(CACHE_PREFIX + month + "_" + id); if (!raw) return null; const d = JSON.parse(raw); if (Date.now() - d.ts > CACHE_TTL_MS) { localStorage.removeItem(CACHE_PREFIX + month + "_" + id); return null; } return d; } catch (e) { return null; } }
function setCache(month, id, payload) { try { localStorage.setItem(CACHE_PREFIX + month + "_" + id, JSON.stringify({ ts: Date.now(), ...payload })); } catch (e) {} }
/* getCompareCache cleanly provided by modular js/ */
/* setCompareCache cleanly provided by modular js/ */
function getLeaderboardCache(month) { try { const raw = localStorage.getItem(LEADERBOARD_PREFIX + month); if (!raw) return null; const d = JSON.parse(raw); if (Date.now() - d.ts > LEADERBOARD_TTL_MS || (Array.isArray(d.allEmployees) && d.allEmployees.length && d.allEmployees[0] && d.allEmployees[0].otDaysCount === undefined)) { localStorage.removeItem(LEADERBOARD_PREFIX + month); return null; } return d; } catch (e) { return null; } }
function setLeaderboardCache(month, payload) {
setTimeout(() => {
try {
const slimEmps = (payload.allEmployees || []).map(e => {
const copy = { ...e };
delete copy.daily;
return copy;
});
localStorage.setItem(LEADERBOARD_PREFIX + month, JSON.stringify({ ts: Date.now(), month: payload.month, allEmployees: slimEmps }));
} catch (e) {}
}, 120);
}
/* getHistory cleanly provided by modular js/ */
function addToHistory(id, month, name) {
try {
let list = getHistory();
list = list.filter(x => !(x.id === id && x.month === month));
list.unshift({ id, month, name: name || "", ts: Date.now() });
if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
renderRecentSearchChips();
} catch (e) {}
}
/* function clearHistory moved to js/pages/ */

/* function toggleClearIdBtn moved to js/pages/ */

/* function clearEmployeeInput moved to js/pages/ */

/* function renderRecentSearchChips moved to js/pages/ */

/* function quickSelectId moved to js/pages/ */

function openDrawer() {}
function closeDrawer() {}
const PERMANENT_PAGES = ['search', 'report', 'vs'];
const MORE_PAGES = ['history', 'team', 'settings', 'notices', 'assessment'];
/* let currentPermanentPage = 'search'; declared in js/core/state.js */
/* let currentSideDrawerPage = null; declared in js/core/state.js */
function initSideDrawerClasses() {
const lbPage = document.getElementById('page-leaderboard');
if (lbPage) lbPage.classList.add('side-drawer-page', 'side-drawer-left');
['more', ...MORE_PAGES].forEach(p => {
const el = document.getElementById('page-' + p);
if (el) el.classList.add('side-drawer-page', 'side-drawer-right');
});
}
function closeSideDrawer() {
currentSideDrawerPage = null;
document.body.classList.remove('drawer-open-left', 'drawer-open-right', 'drawer-fullscreen-active');
document.querySelectorAll('.page.side-drawer-page').forEach(p => p.classList.remove('drawer-active', 'active', 'full-screen-drawer'));
document.body.dataset.page = currentPermanentPage;
updateNavHighlights();
if (window.Router && typeof window.Router.onSideDrawerClosed === 'function') window.Router.onSideDrawerClosed();
}
function updateNavHighlights() {
const activeKey = currentSideDrawerPage
? (MORE_PAGES.includes(currentSideDrawerPage) ? 'more' : currentSideDrawerPage)
: currentPermanentPage;
document.querySelectorAll('.bn-item').forEach(item => {
const nav = item.getAttribute('data-nav');
const on = (nav === activeKey) || (!currentSideDrawerPage && nav === currentPermanentPage);
item.classList.toggle('active', on);
if (on) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
});
document.querySelectorAll('.topnav-item').forEach(item => {
const nav = item.getAttribute('data-nav');
const on = currentSideDrawerPage ? (nav === currentSideDrawerPage) : (nav === currentPermanentPage);
item.classList.toggle('active', on);
});
}
function switchPage(pageName, forceOpen = false, fromRouter = false) {
initSideDrawerClasses();
if (pageName !== 'leaderboard' && typeof iccDrillOpen !== 'undefined') iccDrillOpen = false;
if (typeof pushAppNavState === 'function') pushAppNavState(pageName);
document.body.classList.remove('nav-scroll-hidden');
if (!fromRouter && window.Router && typeof window.Router.onPageSwitched === 'function') {
  window.Router.onPageSwitched(pageName);
}
if (PERMANENT_PAGES.includes(pageName)) {
currentPermanentPage = pageName;
closeSideDrawer();
PERMANENT_PAGES.forEach(p => {
const el = document.getElementById('page-' + p);
if (el) el.classList.toggle('active', p === pageName);
});
document.body.dataset.page = pageName;
updateNavHighlights();
if (pageName === 'report') initReportPage();
if (pageName === 'vs') initVsPage();
window.scrollTo(0, 0);
return;
}
// Side drawer page ('leaderboard' on left, 'more' / MORE_PAGES on right)
const isLeft = (pageName === 'leaderboard');
const isSameToggle = !forceOpen && (
currentSideDrawerPage === pageName ||
(pageName === 'more' && MORE_PAGES.includes(currentSideDrawerPage))
);
if (isSameToggle) {
closeSideDrawer();
return;
}
// Ensure a permanent page stays rendered and visible underneath!
if (!PERMANENT_PAGES.includes(currentPermanentPage)) currentPermanentPage = 'search';
PERMANENT_PAGES.forEach(p => {
const el = document.getElementById('page-' + p);
if (el) el.classList.toggle('active', p === currentPermanentPage);
});
const isFullScreenAdv = (pageName === 'leaderboard' && typeof iccDrillOpen !== 'undefined' && iccDrillOpen);
document.querySelectorAll('.page.side-drawer-page').forEach(p => p.classList.remove('drawer-active', 'active', 'full-screen-drawer'));
const targetEl = document.getElementById('page-' + pageName);
if (targetEl) {
targetEl.classList.add('drawer-active', 'active');
if (isFullScreenAdv) targetEl.classList.add('full-screen-drawer');
targetEl.scrollTop = 0;
}
currentSideDrawerPage = pageName;
document.body.classList.toggle('drawer-open-left', isLeft);
document.body.classList.toggle('drawer-open-right', !isLeft);
document.body.classList.toggle('drawer-fullscreen-active', isFullScreenAdv);
updateNavHighlights();
requestAnimationFrame(() => {
if (pageName === 'history') renderHistory();
if (pageName === 'assessment' && typeof renderAssessmentPage === 'function') renderAssessmentPage();
if (pageName === 'leaderboard') initLeaderboardPage();
if (pageName === 'team') renderTeamPage();
if (pageName === 'notices') renderNoticesPage();
if (pageName === 'settings') { updateSettingsAreaCount(); updateModeUI(); }
});
}
/* function renderHistory moved to js/pages/ */

/* function replayHistory moved to js/pages/ */

function backToLeaderboard() {
document.getElementById('backToLbBtn').style.display = "none";
switchPage('leaderboard');
}
/* function enterCompactMode moved to js/pages/ */

/* function expandSearchForm moved to js/pages/ */

/* function toggleCollapse moved to js/pages/ */

function updateMonthNavBar(monthStr) {
const bar = document.getElementById('monthNavBar');
const lbl = document.getElementById('monthNavCurrentLabel');
if (!bar || !lbl || !monthStr) return;
const [yy, mm] = String(monthStr).split('-');
const mIdx = (parseInt(mm, 10) || 1) - 1;
lbl.textContent = `${BN_MONTHS[mIdx] || mm} ${bn(yy)}`;
bar.style.display = 'grid';
}
/* function navigateReportMonth moved to js/pages/ */

/* let _noticesInflight declared in js/pages/notices.js */
/* function loadNoticesData moved to js/pages/ */

/* function _loadNoticesDataImpl moved to js/pages/ */

/* let _teamInflight declared in js/pages/team.js */
/* function loadTeamData moved to js/pages/ */

/* function _loadTeamDataImpl moved to js/pages/ */

/* function getReadNotices moved to js/pages/ */

/* function markAllNoticesRead moved to js/pages/ */

/* function updateNoticesBadge moved to js/pages/ */

/* formatNoticeDate is provided by js/core/utils.js */
/* function renderNoticeItem moved to js/pages/ */

/* function renderNoticesHome moved to js/pages/ */

/* function renderNoticesPage moved to js/pages/ */

/* function renderTeamPage moved to js/pages/ */

/* function forceRefreshNotices moved to js/pages/ */

document.getElementById('employeeId').addEventListener('keydown', e => { if (e.key === 'Enter') findReport(); });
document.getElementById("compareId1")?.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const i2 = document.getElementById("compareId");
    if (i2 && !i2.value.trim()) i2.focus();
    else runComparison();
  }
});
document.getElementById('compareId').addEventListener('keydown', e => { if (e.key === 'Enter') runComparison(); });
document.getElementById('regEmpIdInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveEmployeeModeSetup(); });
document.getElementById('inchargePinInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveInchargeModeSetup(); });
document.getElementById('lbQuickSearchInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchEmployeeFromLbBar(); });
document.getElementById('settingsNewIdInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') savePermanentIdFromSettings(); });
document.addEventListener('keydown', e => {
if (e.key === 'Escape') {
if (document.getElementById('modeSetupModal')?.classList.contains('open')) { closeModeSetupModal(); return; }
if (document.getElementById('welcomeBackModal')?.classList.contains('open')) { closeWelcomeBackModal(); return; }
if (document.getElementById('rateChartModal')?.classList.contains('open')) { closeRateChartModal(); return; }
if (document.getElementById('erpSupportModal')?.classList.contains('open')) { closeErpSupportModal(); return; }
if (document.getElementById('confirmActionModal')?.classList.contains('open')) { closeConfirmModal(); return; }
if (document.getElementById('complianceModal')?.classList.contains('open')) { closeComplianceModal(); return; }
if (document.getElementById('lbFullListModal')?.classList.contains('open')) { closeLbFullList(); return; }
closeDrawer();
}
});
/* function renderInstantEmployeeRecord moved to js/pages/ */

/* function findReport moved to js/pages/ */

/* function applyExtraction moved to js/pages/ */

function resetCalcToOriginal() {
if (!currentResult || !currentResult.valid) { showToast("Original report values not found", "warn"); return; }
document.getElementById('inpCategory').value = currentResult.category;
document.getElementById('inpOtHours').value = currentResult.otHours;
document.getElementById('inpHoliday').value = currentResult.holiday;
document.getElementById('inpNight').value = currentResult.night;
recalculate();
showToast("Restored to the original report values", "success");
}
function copyCalcSummary() {
const cat = document.getElementById('inpCategory').value;
const otHours = parseFloat(document.getElementById('inpOtHours').value) || 0;
const holiday = parseInt(document.getElementById('inpHoliday').value) || 0;
const night = parseInt(document.getElementById('inpNight').value) || 0;
const totalTxt = document.getElementById('lblGrandTotal').innerText;
const summary = `RPPF — Overtime Summary\nID: ${currentSearchId || '—'} (${currentMonth || '—'})\nCategory: ${RATE_TABLE[cat]?.name || cat}\nOT Allowance: ${otHours} hr (${document.getElementById('lblOtAmount').innerText})\nHoliday Allowance: ${holiday} days (${document.getElementById('lblHolidayAmount').innerText})\nNight Allowance: ${night} nights (${document.getElementById('lblNightAmount').innerText})\nGrand Total: ${totalTxt}`;
try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(summary).then(() => showToast("Copied", "success")).catch(() => fallbackCopyText(summary)); } else { fallbackCopyText(summary); } }
catch (e) { fallbackCopyText(summary); }
}
function fallbackCopyText(text) {
try {
const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
showToast("Copied", "success");
} catch (e) { showToast("Could not copy", "error"); }
}
function showDaySummary(parsed) {
const grid = document.getElementById('daySummaryGrid');
if (!grid) return;
document.getElementById('dsRegularDays').innerText = bn(parsed.regularDaysCount || 0);
document.getElementById('dsHolidayDays').innerText = bn(parsed.holidayCount || 0);
document.getElementById('dsNightDays').innerText   = bn(parsed.nightCount || 0);
document.getElementById('dsPlainDays').innerText   = bn(parsed.plainDaysCount || 0);
grid.style.display = 'grid';
}
function detectCategory(gradeText, empId) {
const g = (gradeText || "").toUpperCase().trim();
const idUpper = (empId || "").toUpperCase().trim();
if (idUpper.startsWith("CF") || /\bHELPER\b/i.test(g)) return { category: "CF", valid: true, reason: "Contractual", gradeText: g || "CF" };
if (/\b(EXECUTIVE|SENIOR\s+OFFICER|ASSISTANT\s+MANAGER|MANAGER|DEPUTY|DIRECTOR|HEAD)\b/i.test(g) && !/JUNIOR\s+OFFICER/i.test(g)) return { category: null, valid: false, reason: "Management/Executive", gradeText: g };
const gradeMatch = g.match(/JUNIOR\s+OFFICER\s+([A-F])\b/i);
const levelMatch = g.match(/\bM(\d{2})\b/);
const gradeLetter = gradeMatch ? gradeMatch[1].toUpperCase() : null;
const levelNum = levelMatch ? parseInt(levelMatch[1]) : null;
if (gradeLetter) { if (gradeLetter === "A" || gradeLetter === "B") return { category: "JO_B", valid: true, reason: `Grade ${gradeLetter}`, gradeText: g }; if (["C","D","E","F"].includes(gradeLetter)) return { category: "JO", valid: true, reason: `Grade ${gradeLetter}`, gradeText: g }; }
if (levelNum !== null) { if (levelNum === 16 || levelNum === 17) return { category: "JO_B", valid: true, reason: `M${levelNum}`, gradeText: g }; if (levelNum >= 18 && levelNum <= 20) return { category: "JO", valid: true, reason: `M${levelNum}`, gradeText: g }; return { category: null, valid: false, reason: `M${levelNum} - out of scope`, gradeText: g }; }
if (g && /^(OFFICER|UN-?SKILLED|SKILLED|SEMI)/i.test(g)) return { category: null, valid: false, reason: "Out of grade (" + g + ")", gradeText: g };
if (idUpper.startsWith("RF") || idUpper.startsWith("CL")) return { category: "JO", valid: true, reason: "Junior Officer (Assumed)", gradeText: g };
return { category: null, valid: false, reason: "Grade could not be detected", gradeText: g || "—" };
}
function showHolidayList(list) {
const box = document.getElementById('holidayList');
const cnt = document.getElementById('holidayCount');
const countVal = Array.isArray(list) ? list.length : (currentResult?.holiday || 0);
cnt.textContent = bn(countVal);
if (!list || list.length === 0) {
box.innerText = countVal > 0 ? `Total ${bn(countVal)} days Holiday Allowance included` : "No duty on holidays or DO this month";
} else {
box.innerHTML = list.map((d, i) => {
if (typeof d === 'string') return `${i + 1}. ${esc(d)}`;
const parts = [];
if (d.doDuty > 0) parts.push(`DO Duty ${d.doDuty} hr`);
if (d.doExtra > 0) parts.push(`DO Extra ${d.doExtra} hr`);
if (d.holDuty > 0) parts.push(`Holiday ${d.holDuty} hr`);
if (d.holExtra > 0) parts.push(`Holiday Extra ${d.holExtra} hr`);
return `${i + 1}. ${esc(d.date)} — ${parts.join(", ")}`;
}).join("<br>");
}
}
function showNightList(list) {
const box = document.getElementById('nightList');
const cnt = document.getElementById('nightCount');
const countVal = Array.isArray(list) ? list.length : (currentResult?.night || 0);
cnt.textContent = bn(countVal);
if (!list || list.length === 0) {
box.innerText = countVal > 0 ? `Total ${bn(countVal)} nights Night Allowance included` : "No night duty this month";
} else {
box.innerHTML = list.map((d, i) => `${i + 1}. ${esc(d)}`).join("<br>");
}
}
function buildSingleEmployeeErpMessage(datesStr, issueType) {
const ctx = getReportViewContext(currentSearchId);
const empName = (currentResult && currentResult.name) ? currentResult.name : '';
const areaName = getAreaForId(currentSearchId, currentResult?.isRppf !== false);
if (ctx === 'incharge') {
if (issueType === 'punch') {
return `Hello, ${areaName} section employee ${empName || currentSearchId} (${currentSearchId}) - ${currentMonth} report: punch problems were found on the following dates: ${datesStr} (In/Out missing). Please check.`;
}
return `Hello, ${areaName} section employee ${empName || currentSearchId} (${currentSearchId}) - ${currentMonth} report: grade and punch (${datesStr}) need verification.`;
}
if (issueType === 'punch') {
return `Hello, my ID: ${currentSearchId}${empName ? ' (' + empName + ')' : ''}, area: ${areaName}. In my ${currentMonth} report, ${datesStr} show missing In/Out punches. Please check.`;
}
return `Hello, my ID: ${currentSearchId}${empName ? ' (' + empName + ')' : ''}, area: ${areaName}. In my ${currentMonth} report, I need help with grade/rate and punch (${datesStr}).`;
}
function buildSingleEmployeeReqErpMessage(empId, empName, reqProbs) {
  const lines = reqProbs.map(p => `• ${p.date}: In ${p.in || '—'} ➔ Out ${p.out || '—'} (${p.duty || p.elapsed}h duty) | ${p.expectedOt || 'OT Missing'}`);
  return `Dear ERP Team,\nEmployee ${empName || '—'} (${empId}) physically worked overtime on the following days, but Empress shows 0 OT (Requisition Missing):\n\n${lines.join('\n')}\n\nPlease allocate and approve the OT requisitions. Thank you!`;
}

function showRemarks(punchProblems, detection) {
const curEmp = typeof currentResult !== 'undefined' ? currentResult : {};
const rawReqProbs = Array.isArray(curEmp.requisitionProblems) ? curEmp.requisitionProblems : [];
const box = document.getElementById('remarksBox');
const pList = Array.isArray(punchProblems) ? punchProblems : [];
const pCount = Array.isArray(punchProblems) ? punchProblems.length : (Number(punchProblems) || 0);
const hasP = pCount > 0;
const dates = pList.length > 0 ? pList.map(p => (typeof p === 'string' ? p : p.date)).join(', ') : `${bn(pCount)} days`;
const areaName = getAreaForId(currentSearchId, currentResult?.isRppf !== false);
const waBtn = (msg) => `<button type="button" class="btn-secondary" style="margin-top:10px;" onclick="openErpSupportModal(${esc(JSON.stringify(msg))}, ${esc(JSON.stringify(areaName))})">Message the ERP team on WhatsApp (Select Representative)</button>`;
const ctx = getReportViewContext(currentSearchId);
const isOwn = (ctx === 'own');
const subj = isOwn ? 'Your report' : `Report of this employee (${esc(currentSearchId)})`;
const isRppf = currentResult?.isRppf !== false;
const facilityWarn = isRppf ? '' : '<div style="margin-top:8px;padding:8px 10px;background:var(--warning-bg);border:1px solid var(--border);border-radius:6px;color:var(--warning);font-weight:700;">This employee is not from RPPF - other facility</div>';
const reqWarnHtml = rawReqProbs.length > 0 ? `
<div style="margin-top:8px;padding:10px 12px;background:#fffbeb;border:1.5px solid #f59e0b;border-radius:8px;color:#92400e;font-size:12px;line-height:1.4;">
  <div style="font-weight:800;display:flex;align-items:center;gap:5px;color:#b45309;font-size:12.5px;">
    <span>⚠️</span> Overtime Requisition Alert (${rawReqProbs.length} day${rawReqProbs.length > 1 ? 's' : ''})
  </div>
  <div style="margin-top:3px;font-size:11.5px;">Worked overtime on floor, but Empress shows 0 OT (ERP Requisition Missing):</div>
  <div style="margin-top:4px;font-weight:700;">${rawReqProbs.map(p => `• ${p.date}: ${p.in || '—'} ➔ ${p.out || '—'} (${p.duty || p.elapsed}h) | ${p.expectedOt || 'OT'}`).join('<br>')}</div>
  <button type="button" class="btn-secondary" style="margin-top:8px;background:#d97706;color:#fff;border-color:#b45309;font-weight:700;padding:5px 10px;font-size:11.5px;" onclick="openErpSupportModal(${esc(JSON.stringify(buildSingleEmployeeReqErpMessage(currentSearchId, currentResult?.name, rawReqProbs)))}, ${esc(JSON.stringify(areaName))})">Forward Missing Requisitions to ERP Team (WhatsApp)</button>
</div>` : '';

const empObj = (window._rptCtx && window._rptCtx.emp) ? window._rptCtx.emp : curEmp;
if (empObj && (!Array.isArray(empObj.generalAbsentDays) || empObj._computedMonth !== currentMonth) && typeof computeEmpGeneralAbsents === 'function') {
  computeEmpGeneralAbsents(empObj, currentMonth);
}
const absDatesList = Array.isArray(empObj?.generalAbsentDays) ? empObj.generalAbsentDays : [];
const absWarnHtml = absDatesList.length > 0 ? `
<div style="margin-top:8px;padding:9px 12px;background:#fef2f2;border:1.5px solid #f87171;border-radius:8px;color:#991b1b;font-size:12px;line-height:1.45;">
  <div style="font-weight:800;display:flex;align-items:center;gap:5px;color:#dc2626;font-size:12.5px;">
    <span>🔴</span> General Working Day Absent (${absDatesList.length} day${absDatesList.length > 1 ? 's' : ''})
  </div>
  <div style="margin-top:3px;font-weight:700;">Dates: ${esc(absDatesList.join(', '))}</div>
</div>` : '';

if (detection.valid && !hasP && rawReqProbs.length === 0) {
box.className = absDatesList.length > 0 ? "remarks-box remarks-warn" : "remarks-box remarks-ok";
box.innerHTML = `${subj}: all In/Out punches are correct.${facilityWarn}${absWarnHtml}`;
} else if (detection.valid && !hasP && rawReqProbs.length > 0) {
box.className = "remarks-box remarks-warn";
box.innerHTML = `${subj}: all In/Out punches are correct, but <b>${rawReqProbs.length} Overtime Requisition(s)</b> are pending.${facilityWarn}${reqWarnHtml}${absWarnHtml}`;
} else if (detection.valid && hasP) {
box.className = "remarks-box remarks-warn";
box.innerHTML = `${subj}: punch missing on <b>${esc(dates)}</b> (${bn(pCount)} days).${facilityWarn}${reqWarnHtml}${absWarnHtml}` + waBtn(buildSingleEmployeeErpMessage(dates, 'punch'));
} else if (!detection.valid && !hasP) {
box.className = "remarks-box remarks-error";
box.innerHTML = `${subj}: the grade is outside this calculation, so the amount cannot be shown.${facilityWarn}` + waBtn(buildSingleEmployeeErpMessage('—', 'grade'));
} else {
box.className = "remarks-box remarks-error";
box.innerHTML = `${subj} has two problems:<ul><li>Grade is outside the calculation scope</li><li>Punch missing on ${esc(dates)}</li></ul>${facilityWarn}` + waBtn(buildSingleEmployeeErpMessage(dates, 'both'));
}
}
/* function recalculate moved to js/ */
let currentVsMode = 2;
let customVsTotalSlots = 4;
function renderExtraVsSlots() {
const container = document.getElementById('vsExtraSlotsContainer');
const lbl = document.getElementById('vsCustomCountLbl');
if (lbl) lbl.textContent = String(customVsTotalSlots);
if (!container) return;
if (currentVsMode !== 'custom') {
container.innerHTML = '';
return;
}
const existingVals = {};
container.querySelectorAll('input[data-slot-idx]').forEach(inp => {
existingVals[inp.getAttribute('data-slot-idx')] = inp.value;
});
let htmlStr = '';
for (let i = 4; i <= customVsTotalSlots; i++) {
const ord = i === 4 ? '4th' : i === 5 ? '5th' : i === 6 ? '6th' : `${i}th`;
const val = existingVals[String(i)] || '';
htmlStr += `<div class="vs-slot-box">
<label for="compareId${i}">${ord} Employee ID (VS)</label>
${i > 4 ? `<button type="button" class="vs-slot-remove-btn" onclick="changeCustomVsSlots(-1)" title="Remove slot">✕</button>` : ''}
<input type="text" id="compareId${i}" data-slot-idx="${i}" class="vs-emp-id-input" value="${esc(val)}" placeholder="e.g. CF83${50 + i}" autocomplete="off" autocapitalize="characters" inputmode="text">
</div>`;
}
container.innerHTML = htmlStr;
}
function changeCustomVsSlots(delta) {
customVsTotalSlots = Math.max(4, Math.min(10, customVsTotalSlots + delta));
renderExtraVsSlots();
}
/* function setVsMode moved to js/pages/ */

/* function populateVsMonthSelect moved to js/pages/ */

/* function renderVsQuickPicks moved to js/pages/ */

/* function fillVsCandidateId moved to js/pages/ */

/* function onVsPeriodChange moved to js/pages/ */

/* function onVsMonthOverrideChange moved to js/pages/ */

/* function initVsPage moved to js/pages/ */

/* function buildCompareRecord moved to js/pages/ */

/* function buildCustomSimRecord moved to js/pages/ */

/* function runComparison moved to js/pages/ */

function showComparison(mine, other, otherId, third, allRecords) {
const div = document.getElementById('compareResult');
const list = (Array.isArray(allRecords) && allRecords.length >= 2) ? allRecords : (third ? [mine, other, third] : [mine, other]);
const myPref = getPreferredId();
const isInc = (typeof getAppMode === 'function' && getAppMode() === 'incharge') || document.body.classList.contains('incharge-mode-active');
const labelFor = (r) => {
const base = (!isInc && r.id === myPref) ? `You (${esc(r.id)})` : esc(r.id);
const nm = r.name && r.name !== r.id ? `<div style="font-size:11px;font-weight:600;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;margin-left:auto;">${esc(r.name)}</div>` : '';
return `<div>${base}</div>${nm}`;
};
const maxVal = (fn) => Math.max(...list.map(fn));
const maxDuty = maxVal(r => r.totalDuty || 0);
const maxOt = maxVal(r => r.otHours || 0);
const maxOtDays = maxVal(r => r.otDays || 0);
const maxHol = maxVal(r => r.holiday || 0);
const maxNight = maxVal(r => r.night || 0);
const maxPlain = maxVal(r => r.plainDays || 0);
const maxTotal = maxVal(r => r.totalEarned || 0);
const minAbsent = Math.min(...list.map(r => Number(r.absentCount != null ? r.absentCount : 0)));
const tdCell = (valStr, numVal, maxNum) => `<td class="${numVal > 0 && numVal === maxNum ? 'win-cell' : ''}">${valStr}</td>`;
const tdCellAbsent = (valStr, numVal) => {
  const isBest = list.length > 1 && numVal === minAbsent && !list.every(x => Number(x.absentCount != null ? x.absentCount : 0) === minAbsent);
  return `<td class="${isBest ? 'win-cell' : ''}">${valStr}</td>`;
};

let diffText = '';
if (isInc) {
  // Manager View: compare OT hours and duty hours (strictly no money/taka)
  if (!third) {
    const otDiff = Number(((mine.otHours || 0) - (other.otHours || 0)).toFixed(2));
    const l1 = esc(mine.name ? `${mine.name} (${mine.id})` : mine.id);
    const l2 = esc(other.name ? `${other.name} (${other.id})` : other.id);
    if (otDiff > 0) {
      diffText = `${l1} completed ${otDiff.toFixed(1)} hrs more OT`;
    } else if (otDiff < 0) {
      diffText = `${l2} completed ${Math.abs(otDiff).toFixed(1)} hrs more OT`;
    } else {
      const dutyDiff = Number(((mine.totalDuty || 0) - (other.totalDuty || 0)).toFixed(2));
      if (dutyDiff > 0) {
        diffText = `Both worked ${mine.otHours || 0} hrs OT (${l1} completed ${dutyDiff.toFixed(1)} hrs more duty)`;
      } else if (dutyDiff < 0) {
        diffText = `Both worked ${mine.otHours || 0} hrs OT (${l2} completed ${Math.abs(dutyDiff).toFixed(1)} hrs more duty)`;
      } else {
        diffText = `Both worked equal OT (${mine.otHours || 0} hrs) and duty (${mine.totalDuty || 0} hrs)`;
      }
    }
  } else {
    const sorted = [...list].sort((a, b) => ((b.otHours || 0) - (a.otHours || 0)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
    const top = sorted[0];
    const second = sorted[1];
    const lead = Number(((top.otHours || 0) - (second.otHours || 0)).toFixed(2));
    const compTitle = list.length === 3 ? "Top in 1:1:1" : `Top among ${list.length} colleagues`;
    if (lead > 0) {
      diffText = `${compTitle} in OT is ${esc(top.name || top.id)} (${esc(top.id)}) with ${top.otHours || 0} hrs OT (+${lead.toFixed(1)} hrs ahead of #2)`;
    } else {
      diffText = `Tied at the top with ${top.otHours || 0} hrs OT`;
    }
  }
} else {
  // Normal Employee View: show taka/earnings comparison
  if (!third) {
    const diff = mine.totalEarned - other.totalEarned;
    const l1 = mine.id === myPref ? `You (${esc(mine.id)})` : esc(mine.id);
    const l2 = other.id === myPref ? `You (${esc(other.id)})` : esc(other.id);
    diffText = diff > 0 ? `${l1} received ৳ ${Math.abs(diff).toFixed(2)} more` : diff < 0 ? `${l2} received ৳ ${Math.abs(diff).toFixed(2)} more` : `Both received the same amount`;
  } else {
    const sorted = [...list].sort((a, b) => b.totalEarned - a.totalEarned);
    const top = sorted[0];
    const lead = top.totalEarned - sorted[1].totalEarned;
    const compTitle = list.length === 3 ? "Top in 1:1:1" : `Top among ${list.length} colleagues`;
    diffText = lead > 0 ? `${compTitle} is ${esc(top.name || top.id)} (${esc(top.id)}) with ৳ ${top.totalEarned.toFixed(2)} (+৳ ${lead.toFixed(2)} ahead of #2)` : `Tied at the top with ৳ ${top.totalEarned.toFixed(2)}`;
  }
}

div.innerHTML = `
<div id="vsExportTarget">
<div class="compare-table-wrap">
<table class="compare-table">
<tr><th>Details</th>${list.map(r => `<th>${labelFor(r)}</th>`).join('')}</tr>
<tr><td>Category</td>${list.map(r => {
  const cat = r.category || r.categoryName;
  if (!cat) return '<td>—</td>';
  if (isInc) {
    if (cat === 'CF') return '<td>CF</td>';
    if (cat === 'JO') return '<td>JO</td>';
    if (cat === 'JO_B') return '<td>JO-B</td>';
    if (cat === 'UNSPEC') return '<td>Unspecified</td>';
    const name = (typeof RATE_TABLE !== 'undefined' && RATE_TABLE[cat]?.name) || cat;
    return `<td>${esc(String(name).replace(/\s*\(.*?\)/g, ''))}</td>`;
  }
  if (cat === 'CF') return '<td>CF · ৳38/h</td>';
  if (cat === 'JO') return '<td>JO · ৳40/h</td>';
  if (cat === 'JO_B') return '<td>JO-B · ৳45/h</td>';
  if (cat === 'UNSPEC') return '<td>Unspecified</td>';
  const name = (typeof RATE_TABLE !== 'undefined' && RATE_TABLE[cat]?.name) || cat;
  return `<td>${esc(String(name).replace(/\s*\(.*?\)/g, ''))}</td>`;
}).join('')}</tr>
<tr><td>Total duty (hrs)</td>${list.map(r => tdCell(r.totalDuty || 0, r.totalDuty || 0, maxDuty)).join('')}</tr>
<tr><td>OT hours</td>${list.map(r => tdCell(r.otHours, r.otHours, maxOt)).join('')}</tr>
<tr><td>OT days (days)</td>${list.map(r => r.otDays == null ? '<td>—</td>' : tdCell(r.otDays, r.otDays, maxOtDays)).join('')}</tr>
<tr><td>Holiday duty (days)</td>${list.map(r => tdCell(r.holiday, r.holiday, maxHol)).join('')}</tr>
<tr><td>${isInc ? 'Night duty (nights)' : 'Night Allowance (nights)'}</td>${list.map(r => tdCell(r.night, r.night, maxNight)).join('')}</tr>
<tr><td>4:30 pm (days)</td>${list.map(r => tdCell(r.plainDays || 0, r.plainDays || 0, maxPlain)).join('')}</tr>
<tr><td>Total Absent (days)</td>${list.map(r => tdCellAbsent(r.absentCount != null ? r.absentCount : 0, Number(r.absentCount != null ? r.absentCount : 0))).join('')}</tr>
${!isInc ? `
<tr class="vs-money-row"><td>OT Allowance</td>${list.map(r => `<td>৳ ${r.otAmount.toFixed(2)}</td>`).join('')}</tr>
<tr class="vs-money-row"><td>Holiday Allowance</td>${list.map(r => `<td>৳ ${r.holidayAmount.toFixed(2)}</td>`).join('')}</tr>
<tr class="vs-money-row"><td>Night Allowance</td>${list.map(r => `<td>৳ ${r.nightAmount.toFixed(2)}</td>`).join('')}</tr>
<tr class="total-row vs-money-row"><td>Total</td>${list.map(r => tdCell('৳ ' + r.totalEarned.toFixed(2), r.totalEarned, maxTotal)).join('')}</tr>
` : ''}
</table>
</div>
<div class="compare-diff"><strong>${diffText}</strong></div>
</div>
<div class="btn-grid-2" style="margin-top:10px;">
<button type="button" class="btn-primary" onclick="downloadVsComparisonPNG(false)">⬇ Download</button>
<button type="button" class="btn-secondary" onclick="downloadVsComparisonPNG(true)">Share</button>
</div>
<button type="button" onclick="resetComparison()" class="reset-btn" style="margin-top:8px;">Compare Other IDs</button>`;
div.style.display = "block";
document.getElementById('compareInputArea').style.display = "none";
}
async function downloadVsComparisonPNG(share = false) {
const target = document.getElementById('vsExportTarget');
if (!target) return;
try {
showToast(share ? 'Preparing to share...' : 'Downloading...', 'info');
if (!window.html2canvas) await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
const canvas = await html2canvas(target, { scale: 2, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff' });
const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
const fname = `VS_Compare_${currentMonth || getCurrentMonth()}.png`;
const file = new File([blob], fname, { type: 'image/png' });
if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
await navigator.share({ files: [file], title: fname });
return;
}
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = fname;
document.body.appendChild(a); a.click(); a.remove();
setTimeout(() => URL.revokeObjectURL(url), 4000);
showToast('Downloaded successfully', 'success');
} catch (e) {
if (e && e.name !== 'AbortError') showToast('Could not export image', 'error');
}
}
function resetComparison() {
document.getElementById('compareResult').style.display = "none";
document.getElementById('compareInputArea').style.display = "block";
document.getElementById('compareId').value = "";
const c3 = document.getElementById('compareId3');
if (c3) c3.value = "";
document.getElementById('compareStatus').innerText = "";
}
/* function syncLbMonthSelectors moved to js/pages/leaderboard.js */

/* function onLbMonthYearChange moved to js/pages/leaderboard.js */

/* function searchEmployeeFromLbBar moved to js/pages/leaderboard.js */

/* function computeEmpAvgDutyAndInOut moved to js/pages/leaderboard.js */

window.computeEmpAvgDutyAndInOut = computeEmpAvgDutyAndInOut;
/* computeEmpRequisitionProblems cleanly provided by modular js/ */

/* computeEmpGeneralAbsents cleanly provided by modular js/ */
window.computeEmpGeneralAbsents = computeEmpGeneralAbsents;

/* Mode-independent absent count for ONE employee-month (used by VS compare / profile totals). */
function getEmpMonthAbsentSafe(emp, monthStr) {
  if (!emp) return 0;
  const mStr = monthStr || emp._computedMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  try {
    if (typeof computeEmpGeneralAbsents === 'function') {
      const uid = String(emp.id || '').trim().toUpperCase();
      let prevHas = false;
      try {
        const prevSet = getPrevMonthNightSet(mStr);
        prevHas = prevSet.has(uid) || prevSet.has(String(resolveEmpAliasId(uid) || '').toUpperCase());
      } catch (e) {}
      const res = computeEmpGeneralAbsents(emp, mStr, prevHas);
      if (res && res.count != null) return Number(res.count) || 0;
    }
  } catch (e) {}
  if (Array.isArray(emp.generalAbsentDays)) return emp.generalAbsentDays.length;
  return Number(emp.generalAbsentCount) || 0;
}
window.getEmpMonthAbsentSafe = getEmpMonthAbsentSafe;

function getGeneralAbsentCount(emp, targetMonth) {
  if (!emp) return 0;
  // Decide from the employee object itself (NOT the ranking screen's global time mode, which leaks into other pages like VS compare).
  const isMulti = Boolean(emp.isMultiMonth || (emp.monthsCount && emp.monthsCount > 1));
  if (isMulti) {
    return Number(emp.generalAbsentCount != null ? emp.generalAbsentCount : (Array.isArray(emp.generalAbsentDays) ? emp.generalAbsentDays.length : 0));
  }
  const mStr = targetMonth || emp._computedMonth || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  const prevSet = typeof getPrevMonthNightSet === 'function' ? getPrevMonthNightSet(mStr) : new Set();
  const prevHas = prevSet.has(String(emp.id || '').toUpperCase()) || prevSet.has(typeof resolveEmpAliasId === 'function' ? resolveEmpAliasId(emp.id) : String(emp.id || '').toUpperCase());
  if (emp.generalAbsentCount != null && emp._computedMonth === mStr && emp._computedPrevNight === prevHas) {
    return Number(emp.generalAbsentCount) || 0;
  }
  const res = typeof computeEmpGeneralAbsents === 'function' ? computeEmpGeneralAbsents(emp, mStr, prevHas) : { count: 0 };
  emp._computedPrevNight = prevHas;
  return res.count || 0;
}
window.getGeneralAbsentCount = getGeneralAbsentCount;

/* function ensureEmpAvgStats moved to js/ */
/* function buildLeaderboardPayloadFromList moved to js/ */
function getPreviousMonthStrings(baseMonthStr, count) {
const [yy, mm] = String(baseMonthStr).split('-').map(x => parseInt(x, 10));
const out = [];
let y = yy || new Date().getFullYear();
let m = mm || 1;
for (let i = 0; i < count; i++) {
out.push(`${y}-${String(m).padStart(2, '0')}`);
m -= 1;
if (m < 1) { m = 12; y -= 1; }
}
return out;
}
function getAllTime2026Months(baseMonthStr) {
const [yy, mm] = String(baseMonthStr).split('-').map(x => parseInt(x, 10));
const year = (yy >= 2020 && yy <= 2032) ? yy : new Date().getFullYear();
const maxM = mm ? Math.min(12, Math.max(1, mm)) : 12;
const out = [];
for (let m = 1; m <= maxM; m++) {
out.push(`${year}-${String(m).padStart(2, '0')}`);
}
if (Array.isArray(availableServerMonths)) {
availableServerMonths.forEach(ym => {
if (ym.startsWith(String(year) + '-') && !out.includes(ym)) out.push(ym);
});
}
return out.sort();
}
function switchLbTimeMode(mode) {
currentLbTimeMode = mode || 'monthly';
const btnM = document.getElementById('lbModeBtnMonthly');
const btnR = document.getElementById('lbModeBtnRange');
const btnA = document.getElementById('lbModeBtnAllTime');
const subRow = document.getElementById('lbRangeSubRow');
const sub3 = document.getElementById('lbSubBtn3m');
const sub6 = document.getElementById('lbSubBtn6m');
if (btnM) btnM.classList.toggle('active', currentLbTimeMode === 'monthly');
if (btnR) btnR.classList.toggle('active', currentLbTimeMode === '3m' || currentLbTimeMode === '6m');
if (btnA) btnA.classList.toggle('active', currentLbTimeMode === 'alltime');
if (subRow) subRow.classList.toggle('show', currentLbTimeMode === '3m' || currentLbTimeMode === '6m');
if (sub3) sub3.classList.toggle('active', currentLbTimeMode === '3m');
if (sub6) sub6.classList.toggle('active', currentLbTimeMode === '6m');
startLeaderboardScan(false);
}
async function aggregateMultiMonthEmployees(monthList) {
const map = new Map();
let loadedMonths = 0;
const chronoMonths = Array.from(new Set((monthList || []).filter(Boolean))).sort();
const earliestPrevMonth = chronoMonths.length > 0 ? getPrevMonthStr(chronoMonths[0]) : '';
const fetchTargets = earliestPrevMonth && !chronoMonths.includes(earliestPrevMonth)
  ? [earliestPrevMonth, ...chronoMonths]
  : [...chronoMonths];

await Promise.all(fetchTargets.map(m => fetchMonthPreIndexedData(m, false, false).catch(() => null)));

const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

chronoMonths.forEach((mStr) => {
const list = monthIndexMemoryCache[mStr];
if (!list || !list.length) return;
loadedMonths++;
const prevNightSet = getPrevMonthNightSet(mStr);
const mNum = parseInt(String(mStr).split('-')[1], 10) || 1;
const mShortLbl = shortMonths[mNum - 1] || mStr;

list.forEach(e => {
if (!e || e.isRppf === false || e.valid === false || !isMappedAreaId(e.id, e)) return;
const empKey = resolveEmpAliasId(e.id) || String(e.id || '').toUpperCase();
const cur = map.get(empKey);
const uid = String(e.id || '').toUpperCase();
const prevHas = prevNightSet.has(uid) || prevNightSet.has(empKey);
e._prevMonthLastNight = prevHas;

const pArr = Array.isArray(e.punchProblems) ? e.punchProblems : [];
const absObj = typeof computeEmpGeneralAbsents === 'function'
  ? computeEmpGeneralAbsents(e, mStr, prevHas)
  : { dates: (e.generalAbsentDays || []), shortDates: (e.generalAbsentShortDates || []), count: (e.generalAbsentCount || 0) };
const absArr = absObj.dates || [];
const absShortArr = absObj.shortDates || [];
const reqArr = Array.isArray(e.requisitionProblems) && e.requisitionProblems.length > 0
  ? e.requisitionProblems
  : (typeof computeEmpRequisitionProblems === 'function' ? computeEmpRequisitionProblems(e) : []);
const st = (typeof window.computeEmpAvgDutyAndInOut === 'function') ? window.computeEmpAvgDutyAndInOut(e) : {};

if (!cur) {
map.set(empKey, {
...e,
id: e.id,
monthsCount: 1,
totalDuty: Number(e.totalDuty || 0),
otHours: Number(e.otHours || 0),
holidayCount: Number(e.holidayCount || 0),
nightCount: Number(e.nightCount || 0),
plainDaysCount: Number(e.plainDaysCount != null ? e.plainDaysCount : e.plainDays || 0),
otDaysCount: getEmpOtDays(e),
totalEarned: Number(e.totalEarned || 0),
punchProblems: [...pArr],
generalAbsentDays: [...absArr],
generalAbsentShortDates: [...absShortArr],
generalAbsentCount: absArr.length,
absentByMonth: absArr.length > 0 ? [{ month: mStr, label: mShortLbl, count: absArr.length, dates: [...absShortArr] }] : [],
requisitionProblems: [...reqArr],
requisitionProblemCount: reqArr.length,
_sumPresentDays: st.presentDaysCount || 0,
_sumNightRestDays: st.nightRestDays || 0,
_sumInMins: (st.avgInMins != null ? st.avgInMins : 480)
});
} else {
cur.monthsCount += 1;
cur.totalDuty = Number((cur.totalDuty + Number(e.totalDuty || 0)).toFixed(2));
cur.otHours = Number((cur.otHours + Number(e.otHours || 0)).toFixed(2));
cur.holidayCount += Number(e.holidayCount || 0);
cur.nightCount += Number(e.nightCount || 0);
cur.plainDaysCount = (cur.plainDaysCount || 0) + Number(e.plainDaysCount != null ? e.plainDaysCount : e.plainDays || 0);
cur.otDaysCount = (cur.otDaysCount || 0) + getEmpOtDays(e);
cur.totalEarned = Number((cur.totalEarned + Number(e.totalEarned || 0)).toFixed(2));
cur.punchProblems.push(...pArr);
if (!Array.isArray(cur.generalAbsentDays)) cur.generalAbsentDays = [];
if (!Array.isArray(cur.generalAbsentShortDates)) cur.generalAbsentShortDates = [];
if (!Array.isArray(cur.absentByMonth)) cur.absentByMonth = [];
cur.generalAbsentDays.push(...absArr);
cur.generalAbsentShortDates.push(...absShortArr);
cur.generalAbsentCount = cur.generalAbsentDays.length;
if (absArr.length > 0) {
  cur.absentByMonth.push({ month: mStr, label: mShortLbl, count: absArr.length, dates: [...absShortArr] });
}
if (!Array.isArray(cur.requisitionProblems)) cur.requisitionProblems = [];
cur.requisitionProblems.push(...reqArr);
cur.requisitionProblemCount = cur.requisitionProblems.length;
cur._sumPresentDays = (cur._sumPresentDays || 0) + (st.presentDaysCount || 0);
cur._sumNightRestDays = (cur._sumNightRestDays || 0) + (st.nightRestDays || 0);
cur._sumInMins = (cur._sumInMins || 0) + (st.avgInMins != null ? st.avgInMins : 480);
if (e.name) cur.name = e.name;
if (e.grade) cur.grade = e.grade;
}
});
});
const merged = Array.from(map.values()).map(e => {
const mc = Math.max(1, e.monthsCount || 1);
e.isMultiMonth = true;
e.generalAbsentCount = (e.generalAbsentDays || []).length;
e.requisitionProblemCount = (e.requisitionProblems || []).length;
const presentDaysCount = Math.max(1, e._sumPresentDays || 1);
const nightRestDays = e._sumNightRestDays || 0;
const nightRestCredit = Number((nightRestDays * NIGHT_REST_CREDIT_HOURS).toFixed(2));
const adjustedDuty = Number((e.totalDuty + nightRestCredit).toFixed(2));
const avgDutyPerDay = Number((e.totalDuty / presentDaysCount).toFixed(2));
const adjustedAvgDuty = Number((adjustedDuty / Math.max(1, presentDaysCount + nightRestDays)).toFixed(2));
const avgInMins = (e._sumInMins || (480 * mc)) / mc;
const normIn = ((Math.round(avgInMins) % 1440) + 1440) % 1440;
const avgInTimeStr = `${String(Math.floor(normIn / 60)).padStart(2, '0')}:${String(normIn % 60).padStart(2, '0')}`;
return {
...e,
presentDaysCount,
avgDutyPerDay,
nightRestDays,
nightRestCredit,
adjustedDuty,
adjustedAvgDuty,
avgInMins,
avgInTimeStr,
_avgComputed: true,
avgDuty: Number((e.totalDuty / mc).toFixed(1)),
avgOt: Number((e.otHours / mc).toFixed(1)),
avgNight: Number((e.nightCount / mc).toFixed(1)),
avgEarned: Number((e.totalEarned / mc).toFixed(0)),
avgAbsent: Number((e.generalAbsentCount / mc).toFixed(1))
};
});
return { merged, loadedMonths };
}
/* function initLeaderboardPage moved to js/pages/leaderboard.js */

function getCurrentMonth() { return `${document.getElementById('yearSelect').value}-${document.getElementById('monthSelect').value}`; }
/* function startLeaderboardScan moved to js/pages/leaderboard.js */

/* function buildRankItemHTML moved to js/pages/leaderboard.js */

function updateLbSummaryMetrics(filteredList) {
const maxDutyEl = document.getElementById('kpiMaxDuty');
const avgOtEl = document.getElementById('kpiAvgOt');
const maxEarnedEl = document.getElementById('kpiMaxEarned');
const punchKpiEl = document.getElementById('kpiPunchIssues');
if (!maxDutyEl || !avgOtEl || !maxEarnedEl) return;
if (!filteredList || filteredList.length === 0) {
maxDutyEl.textContent = '—'; avgOtEl.textContent = '—'; maxEarnedEl.textContent = '—';
if (punchKpiEl) punchKpiEl.textContent = 'None';
return;
}
const maxDuty = Math.max(...filteredList.map(e => e.totalDuty || 0));
const avgOt = filteredList.reduce((acc, e) => acc + (e.otHours || 0), 0) / filteredList.length;
const maxEarned = Math.max(...filteredList.map(e => e.totalEarned || 0));
const hasPunch = filteredList.some(e => getPunchProblemCount(e) > 0);
maxDutyEl.textContent = `${maxDuty.toFixed(1)} hr`;
avgOtEl.textContent = `${avgOt.toFixed(1)} hr`;
maxEarnedEl.textContent = `৳ ${Math.round(maxEarned)}`;
if (punchKpiEl) punchKpiEl.textContent = hasPunch ? 'View list' : 'None';
try { updateRankHubCards(filteredList); } catch (e) {}
}
function renderPunchIssueList(punchList) {
const box = document.getElementById('lbTopPunch');
const badge = document.getElementById('lbPunchTabBadge');
const sub = document.getElementById('lbPunchPanelSub');
const btn = document.getElementById('punchExpandBtn');
const btnTxt = document.getElementById('punchBtnText');
const count = punchList ? punchList.length : 0;
if (badge) {
badge.style.display = count > 0 ? 'inline-block' : 'none';
badge.textContent = '!';
}
if (sub) sub.textContent = count > 0 ? 'Employees with missing In/Out punches in this area' : 'No one has punch problems in this area';
if (btnTxt) btnTxt.textContent = 'View everyone with punch problems';
if (btn) btn.style.display = count > 0 ? 'inline-flex' : 'none';
if (!box) return;
if (!punchList || count === 0) { box.innerHTML = '<div class="remarks-box remarks-ok" style="text-align:center;">No employee has missing In/Out punches in this area.</div>'; return; }
box.innerHTML = punchList.slice(0, 5).map((e, i) => buildRankItemHTML(e, i, 'punch', e.id === getMyId())).join('');
}
function switchToLbPunchTab() {
const btn = document.getElementById('lbTabPunchBtn');
if (btn) { btn.click(); btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
/* function renderLeaderboardResult moved to js/pages/leaderboard.js */

function buildPodiumShowcaseHTML(list, type) {
if (!list || list.length === 0) return '';
const top3 = [list[1], list[0], list[2]]; // 2nd, 1st, 3rd
const ranks = [2, 1, 3];
return top3.map((e, idx) => {
const rk = ranks[idx];
if (!e) return `<div class="podium-spot p-${rk}" style="opacity:.4;cursor:default;"><div class="podium-medal">${rk}</div><div class="podium-name">—</div></div>`;
const val = type === 'duty' ? `${e.totalDuty}h` : type === 'ot' ? `${e.otHours}h` : `৳${Math.round(e.totalEarned || 0).toLocaleString('en-IN')}`;
const crown = rk === 1 ? '👑 ' : '';
return `<div class="podium-spot p-${rk}" onclick="viewEmployeeFromLeaderboard('${esc(e.id)}')">
<div class="podium-medal">${rk}</div>
<div class="podium-name">${crown}${esc(e.name || e.id)}</div>
<div class="podium-id">${esc(e.id)}</div>
<div class="podium-val">${val}</div>
</div>`;
}).join('');
}
function renderTop3(elementId, list, type) {
const box = document.getElementById(elementId);
const podiumId = elementId === 'lbTopDuty' ? 'lbPodiumDuty' : elementId === 'lbTopOT' ? 'lbPodiumOT' : elementId === 'lbTopEarned' ? 'lbPodiumEarned' : '';
const podiumBox = podiumId ? document.getElementById(podiumId) : null;
if (!box) return;
if (!list || list.length === 0) {
if (podiumBox) podiumBox.style.display = 'none';
box.innerHTML = '<div class="empty-msg" style="padding: 15px 0;">No data found</div>';
return;
}
if (podiumBox) {
podiumBox.style.display = 'grid';
podiumBox.innerHTML = buildPodiumShowcaseHTML(list, type);
}
const maxVal = type === 'duty' ? (list[0]?.adjustedDuty || list[0]?.totalDuty || 1) : type === 'ot' ? (list[0]?.otHours || 1) : (list[0]?.totalEarned || 1);
const myId = getMyId();
box.innerHTML = list.slice(0, 5).map((e, i) => buildRankItemHTML(e, i, type, e.id === myId, maxVal)).join('');
}
function updateMyRankNotes() {
const myId = getMyId();
const mapping = { duty: 'Duty', ot: 'OT', earned: 'Earned' };
Object.keys(mapping).forEach(type => {
const suffix = mapping[type];
const idSpan = document.getElementById(`myRank${suffix}Id`);
const posSpan = document.getElementById(`myRank${suffix}Pos`);
if (!idSpan || !posSpan) return;
if (!currentLeaderboardResult || !myId) { idSpan.textContent = "ID not provided"; posSpan.textContent = "—"; return; }
const filtered = currentLeaderboardResult.filtered;
let sorted;
if (filtered) { sorted = type === 'duty' ? filtered.sortedByDuty : type === 'ot' ? filtered.sortedByOT : filtered.sortedByEarned; }
else { sorted = type === 'duty' ? currentLeaderboardResult.sortedByDuty : type === 'ot' ? currentLeaderboardResult.sortedByOT : currentLeaderboardResult.sortedByEarned; }
if (!sorted) { idSpan.textContent = myId; posSpan.textContent = "—"; return; }
const idx = sorted.findIndex(e => e.id === myId);
idSpan.textContent = myId;
if (idx === -1) posSpan.textContent = "Not on the list";
else {
const emp = sorted[idx];
const val = type === 'duty' ? `${emp.totalDuty} hours` : type === 'ot' ? `${emp.otHours} hours` : `৳ ${emp.totalEarned.toFixed(2)}`;
posSpan.textContent = `Rank ${bn(idx + 1)} (${val})`;
}
});
}
function onAreaFilterChange() {
refreshSubFilter();
applyAreaFilter();
}
function refreshSubFilter() {
const sel = document.getElementById('subFilter');
if (!sel) return;
const area = document.getElementById('areaFilter')?.value || 'all';
const subs = area !== 'all' ? (AREA_SUBS[area] || []) : [];
if (!subs.length) { sel.innerHTML = '<option value="all">All sub-sections</option>'; sel.value = 'all'; sel.style.display = 'none'; return; }
sel.innerHTML = '<option value="all">All sub-sections</option>' + subs.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
sel.value = 'all'; sel.style.display = '';
}
/* function getLbFilterState moved to js/pages/leaderboard.js */

function describeLbFilter() {
const st = getLbFilterState();
const parts = [st.area === 'all' ? 'All areas' : (st.area === OVERALL_AREA ? 'Executives' : st.area)];
if (st.area !== 'all' && st.sub !== 'all') parts.push(st.sub);
if (st.gender !== 'all') parts.push(GENDER_LABELS[st.gender] || st.gender);
if (st.type !== 'all') parts.push(EMP_TYPE_LABELS[st.type] || st.type);
if (st.customCat && st.customCat !== 'all') parts.push(st.customCat);
return parts.join(' • ');
}
let _lbTypeModeSeen = null;
function refreshTypeFilterOptions() {
const sel = document.getElementById('typeFilter');
if (!sel) return;
const inc = getAppMode() === 'incharge';
const prev = sel.value;
sel.innerHTML = '<option value="all">All types</option><option value="CON">Contractual</option><option value="JO">Junior Officer</option><option value="CAS">Casual</option>' + (inc ? '<option value="EXEC">Executive/Above</option>' : '');
sel.value = [...sel.options].some(o => o.value === prev) ? prev : 'all';
if (_lbTypeModeSeen !== null && _lbTypeModeSeen !== inc) { populateAreaDropdown(); _lbTypeModeSeen = inc; if (currentLeaderboardResult) applyAreaFilter(); }
_lbTypeModeSeen = inc;
}
/* function applyAreaFilter_1 moved to js/pages/leaderboard.js */

function updateAreaFilterCount() {
const el = document.getElementById('areaFilterCount');
if (!el) return;
const area = document.getElementById('areaFilter')?.value || 'all';
el.textContent = describeLbFilter();
}
function updateAreaHint(activeTab) {
const heroLabel = document.getElementById('lbHeroAreaLabel');
if (!currentLeaderboardResult || !heroLabel) return;
const area = document.getElementById('areaFilter')?.value || 'all';
const curTab = activeTab || document.querySelector('.lb-tab.active')?.getAttribute('data-lb-tab') || 'duty';
const critNames = { duty: 'Highest Duty Hours', ot: 'Highest OT Hours', earned: 'Highest Earnings', punch: 'Punch Monitoring' };
const critTxt = critNames[curTab] || 'Highest Duty Hours';
heroLabel.textContent = area === 'all' ? `All areas • ${critTxt}` : `${area} • ${critTxt}`;
}
function updateLbModalNavUI(type) {
const monthStr = (currentLeaderboardResult && currentLeaderboardResult.month) || getCurrentMonth();
const [yy, mm] = String(monthStr).split('-');
const mIdx = (parseInt(mm, 10) || 1) - 1;
const lbl = document.getElementById('lbModalMonthLabel');
if (lbl) {
const modeSuffix = currentLbTimeMode === '3m' ? ' (3M Avg)' : currentLbTimeMode === '6m' ? ' (6M Avg)' : currentLbTimeMode === 'alltime' ? ' (All-Time)' : '';
lbl.textContent = `${BN_MONTHS[mIdx] || mm} ${bn(yy)}${modeSuffix}`;
}
document.querySelectorAll('.lb-modal-crit-btn').forEach(btn => {
btn.classList.toggle('active', btn.getAttribute('data-modal-crit') === type);
});
}
function switchLbModalCriterion(type) {
if (!type) return;
activateLbCriteriaTab(type);
openLbFullList(type);
}
/* function navigateLbModalMonth moved to js/pages/leaderboard.js */

/* function openLbFullList moved to js/pages/leaderboard.js */

function renderLbModalItems(list) {
const body = document.getElementById('lbFullListBody');
if (!body) return;
if (!list || list.length === 0) { body.innerHTML = '<div class="lb-modal-empty">No one found in this filter/month.</div>'; return; }
const t = currentLbListType || 'duty';
const first = currentLbModalList[0] || list[0];
const maxVal = t === 'duty' ? (first?.adjustedDuty || first?.totalDuty || 1) : t === 'ot' ? (first?.otHours || 1) : (first?.totalEarned || 1);
body.innerHTML = list.map((e, i) => buildRankItemHTML(e, i, t, e.id === getMyId(), maxVal)).join('');
}
function filterLbModalList() {
const q = (document.getElementById('lbModalSearchInput')?.value || '').trim().toUpperCase();
if (!q) { renderLbModalItems(currentLbModalList); return; }
const matched = currentLbModalList.filter(e => (e.id && e.id.toUpperCase().includes(q)) || (e.name && e.name.toUpperCase().includes(q)) || (e.area && e.area.toUpperCase().includes(q)));
renderLbModalItems(matched);
}
/* function closeLbFullList moved to js/pages/leaderboard.js */

/* function lbModalBackdropClick moved to js/pages/leaderboard.js */

/* function viewEmployeeFromLeaderboard moved to js/pages/leaderboard.js */

function resetAll() {
document.body.classList.remove('has-result');
['viewingContextBanner','monthNavBar','step3','step5','step7','payslipCard'].forEach(id => {
const el = document.getElementById(id);
if (el) { el.style.display = "none"; el.classList.remove('show'); }
});
['step5Body'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
document.querySelectorAll('.collapse-header').forEach(h => h.classList.remove('expanded'));
document.getElementById('status').innerText = "";
document.getElementById('progress').style.display = "none";
document.getElementById('employeeId').value = '';
toggleClearIdBtn();
document.getElementById('inpOtHours').value = 0;
document.getElementById('inpHoliday').value = 0;
document.getElementById('inpNight').value = 0;
document.getElementById('compareId').value = "";
document.getElementById('compareResult').style.display = "none";
document.getElementById('compareInputArea').style.display = "block";
document.getElementById('compareStatus').innerText = "";
document.getElementById('daySummaryGrid').style.display = "none";
document.getElementById('backToLbBtn').style.display = "none";
const greetBox = document.getElementById('userGreeting');
if (greetBox) greetBox.style.display = "none";
currentResult = null;
document.getElementById('searchFormCard').style.display = "block";
document.getElementById('welcomeBanner')?.classList.remove('hidden-compact');
document.getElementById('quickActionsGrid')?.classList.remove('hidden-compact');
document.getElementById('searchSummary').classList.remove('show');
document.getElementById('mainHeader').classList.remove('compact');
try { syncReportPageBanner(); } catch (e) {}
setDefaultMonth();
window.scrollTo({ top: 0, behavior: 'smooth' });
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
let _swReloading = false;
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (_swReloading) return;
  _swReloading = true;
  window.location.reload();
});
window.addEventListener('load', async () => {
try {
const swUrl = new URL('sw.js', window.location.href).href;
const registration = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' });
await registration.update();
registration.addEventListener('updatefound', () => {
const newWorker = registration.installing;
if (!newWorker) return;
newWorker.addEventListener('statechange', () => {
  if (newWorker.state === 'activated') {
    console.log('[App] New SW activated');
  }
});
});
if (registration.waiting) { registration.waiting.postMessage({ type: 'SKIP_WAITING' }); }
} catch (e) { console.warn('[App] SW registration skipped/failed:', e); }
});
}
let noticePollInterval = null;
let noticePollCount = 0;
const FAST_POLL_INTERVAL = 60 * 1000;
const SLOW_POLL_INTERVAL = 5 * 60 * 1000;
const FAST_POLL_COUNT = 5;
/* function startNoticePolling moved to js/pages/ */

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { renderNoticesHome(); } });
/* const ADMIN_PASS_KEY defined in js/core/config.js */
/* const ADMIN_SESSION_KEY defined in js/core/config.js */
/* const ADMIN_GH_TOKEN_KEY defined in js/core/config.js */
const DEFAULT_ADMIN_PASS = 'admin1234';
function getAdminPassword() { try { return localStorage.getItem(ADMIN_PASS_KEY) || DEFAULT_ADMIN_PASS; } catch (e) { return DEFAULT_ADMIN_PASS; } }
function isAdminLoggedIn() { try { return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1' || localStorage.getItem(ADMIN_SESSION_KEY) === '1'; } catch (e) { return false; } }
function setAdminLoggedIn(val) {
try {
if (val) { sessionStorage.setItem(ADMIN_SESSION_KEY, '1'); localStorage.setItem(ADMIN_SESSION_KEY, '1'); }
else { sessionStorage.removeItem(ADMIN_SESSION_KEY); localStorage.removeItem(ADMIN_SESSION_KEY); }
} catch (e) {}
}
function getGhToken() { try { return (localStorage.getItem(ADMIN_GH_TOKEN_KEY) || '').trim(); } catch (e) { return ''; } }
function setGhToken(t) {
try { if (t) localStorage.setItem(ADMIN_GH_TOKEN_KEY, t.trim()); else localStorage.removeItem(ADMIN_GH_TOKEN_KEY); } catch (e) {}
}
function utf8ToBase64(str) {
const bytes = new TextEncoder().encode(str);
let binary = '';
for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
return btoa(binary);
}
function arrayBufferToBase64(buffer) {
const bytes = new Uint8Array(buffer);
let binary = '';
const chunk = 0x8000;
for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
return btoa(binary);
}
async function githubGetSha(repoPath, headers) {
const base = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/`;
try { const r = await fetch(base + repoPath, { headers, cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j && j.sha) return j.sha; } } catch (e) {}
// Files over 1 MB cannot be read directly through this API, but the folder listing still gives their sha
try {
const i = repoPath.lastIndexOf('/'), dir = i >= 0 ? repoPath.slice(0, i) : '', name = repoPath.slice(i + 1);
const r = await fetch(base + dir, { headers, cache: 'no-store' });
if (r.ok) { const list = await r.json(); const f = Array.isArray(list) && list.find(x => x.name === name); if (f && f.sha) return f.sha; }
} catch (e) {}
return null;
}
async function githubPutFile(repoPath, base64Content, commitMessage) {
const token = getGhToken();
if (!token) { throw new Error('Save your Server Access Key in admin.html first.'); }
const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${repoPath}`;
const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
const sha = await githubGetSha(repoPath, headers);
const bodyObj = { message: commitMessage || `Update ${repoPath} via RPPF Admin Panel`, content: base64Content };
if (sha) bodyObj.sha = sha;
const putResp = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(bodyObj) });
if (!putResp.ok) {
let errTxt = `HTTP ${putResp.status}`;
try { const errJson = await putResp.json(); if (errJson && errJson.message) errTxt = errJson.message; } catch (e) {}
throw new Error(errTxt);
}
return await putResp.json();
}
async function githubDeleteFile(repoPath, sha, commitMessage) {
const token = getGhToken();
if (!token) { throw new Error('Save your Server Access Key in admin.html first.'); }
const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${repoPath}`;
const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
let fileSha = sha;
if (!fileSha) fileSha = await githubGetSha(repoPath, headers);
if (!fileSha) throw new Error('File reference was not found on the server.');
const delResp = await fetch(apiUrl, {
method: 'DELETE',
headers,
body: JSON.stringify({
message: commitMessage || `Delete ${repoPath} via RPPF Admin Panel`,
sha: fileSha
})
});
if (!delResp.ok) {
let errTxt = `HTTP ${delResp.status}`;
try { const errJson = await delResp.json(); if (errJson && errJson.message) errTxt = errJson.message; } catch (e) {}
throw new Error(errTxt);
}
return await delResp.json();
}
async function adminPushAreasToGithub() {
try {
const hols = (typeof PLANT_HOLIDAYS !== 'undefined' && PLANT_HOLIDAYS) ? PLANT_HOLIDAYS : ((typeof getPlantHolidaysConfig === 'function' && getPlantHolidaysConfig()) || {});
const jsonStr = JSON.stringify({ areas: AREA_MAP, details: AREA_DETAILS, subsections: AREA_SUBS, designationRates: DESIG_RATES, rateTable: RATE_TABLE, holidays: hols }, null, 2);
await githubPutFile('areas.json', utf8ToBase64(jsonStr), `Update areas.json via RPPF Ranking Category Editor`);
try { Object.keys(localStorage).forEach(k => { const _ns = (typeof STORAGE_NAMESPACE !== 'undefined' ? STORAGE_NAMESPACE : ''); if (k.startsWith(_ns + 'renata_lb_') || k.startsWith(_ns + 'renata_mdata_')) localStorage.removeItem(k); }); } catch (e) {}
showToast('Saved to RPPF Cloud Server', 'success');
} catch (err) {
showToast(err.message, 'error');
}
}
/* cleanPunchValue cleanly provided by modular js/ */
/* isPunchMissing is provided by js/core/utils.js */
function openConfirmModal(message, onConfirm) {
pendingConfirmFn = onConfirm;
const msgEl = document.getElementById('confirmModalMsg');
const modal = document.getElementById('confirmActionModal');
if (msgEl) msgEl.textContent = message;
if (modal) modal.classList.add('open');
}
function closeConfirmModal() {
pendingConfirmFn = null;
document.getElementById('confirmActionModal')?.classList.remove('open');
}
function runConfirmedAction() {
const fn = pendingConfirmFn;
closeConfirmModal();
if (typeof fn === 'function') fn();
}
function openComplianceModal() {
document.getElementById('complianceModal')?.classList.add('open');
}
function closeComplianceModal() {
document.getElementById('complianceModal')?.classList.remove('open');
}
async function openErpSupportModal(customMsg, preferredArea) {
pendingErpMessage = customMsg || `Hello, support is needed from the RPPF Overtime App.`;
pendingErpArea = preferredArea || (currentSearchId ? getAreaForId(currentSearchId, true) : '');
const modal = document.getElementById('erpSupportModal');
const body = document.getElementById('erpModalListBody');
if (!modal || !body) return;
const list = await loadTeamData();
const sorted = [...(list || DEFAULT_FALLBACK_TEAM)].sort((a, b) => {
const aMatch = (a.area && pendingErpArea && a.area.toLowerCase() === pendingErpArea.toLowerCase()) ? 0 : 1;
const bMatch = (b.area && pendingErpArea && b.area.toLowerCase() === pendingErpArea.toLowerCase()) ? 0 : 1;
return aMatch - bMatch;
});
body.innerHTML = sorted.map((m, idx) => {
const isMatched = m.area && pendingErpArea && m.area.toLowerCase() === pendingErpArea.toLowerCase();
return `<div class="erp-select-item" onclick="sendErpWhatsAppToMember(${idx})">
<div>
<div style="font-weight:800;font-size:14px;color:var(--text);">${esc(m.name)} ${isMatched ? '<span class="admin-tag" style="background:var(--success-bg);color:var(--success);">Your area</span>' : ''}</div>
<div style="font-size:12px;color:var(--muted);">${esc(m.designation || '')} • ${esc(m.area || 'All Areas')}</div>
</div>
<span class="team-wa" style="min-height:34px;padding:6px 12px;font-size:12.5px;">WhatsApp</span>
</div>`;
}).join('');
window._currentErpSortedList = sorted;
modal.classList.add('open');
}
function closeErpSupportModal() {
document.getElementById('erpSupportModal')?.classList.remove('open');
}
function sendErpWhatsAppToMember(idx) {
const list = window._currentErpSortedList || teamData || DEFAULT_FALLBACK_TEAM;
const m = list[idx] || list[0];
if (!m) return;
const url = erpWaLink(pendingErpMessage, m.whatsapp);
closeErpSupportModal();
window.open(url, '_blank', 'noopener,noreferrer');
}
function openBulkAbsentForward() {
  if (!currentLeaderboardResult) {
    showToast('First load the leaderboard list', 'warn');
    return;
  }
  const f = currentLeaderboardResult.filtered;
  const list = f ? (f.sortedByAbsent || []) : (currentLeaderboardResult.sortedByAbsent || []);
  if (!list || list.length === 0) {
    showToast('No employees with general day absents in this selection', 'info');
    return;
  }
  const areaLabel = describeLbFilter();
  const monthStr = currentLeaderboardResult.month || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  const lines = list.map((e, i) => {
    const absDates = Array.isArray(e.generalAbsentDays) ? e.generalAbsentDays.join(', ') : `${getGeneralAbsentCount(e)} days`;
    return `${i + 1}. ${e.name || '—'} (${e.id}) [${e.sub || 'General'}] — Absent: ${getGeneralAbsentCount(e)} days\n   └ Dates: ${absDates}`;
  });
  const msg = `Dear Management & Floor In-Charge,\n${areaLabel} section, ${monthStr} General Working Days Absenteeism Report:\n\n${lines.join('\n\n')}\n\nPlease review attendance discipline. Thank you!`;
  const areaOnly = document.getElementById('areaFilter')?.value || 'All';
  if (typeof openErpSupportModal === 'function') {
    openErpSupportModal(msg, areaOnly === 'all' ? 'All' : areaOnly);
  } else if (typeof fallbackCopyText === 'function') {
    fallbackCopyText(msg);
    showToast('Copied Absentee list to clipboard!', 'success');
  }
}

function openBulkRequisitionErpForward() {
  if (!currentLeaderboardResult) {
    showToast('First load the leaderboard list', 'warn');
    return;
  }
  const f = currentLeaderboardResult.filtered;
  const list = f ? (f.sortedByRequisition || []) : (currentLeaderboardResult.sortedByRequisition || []);
  if (!list || list.length === 0) {
    showToast('No employees with OT requisition problems in this section', 'info');
    return;
  }
  const areaLabel = describeLbFilter();
  const monthStr = currentLeaderboardResult.month || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  const lines = list.map((e, i) => {
    let rDetails = `${getRequisitionProblemCount(e)} days`;
    if (Array.isArray(e.requisitionProblems) && e.requisitionProblems.length > 0) {
      rDetails = e.requisitionProblems.map(p => `${p.date} (In: ${p.in || '—'}, Out: ${p.out || '—'}, Expected: ${p.expectedOt || 'OT'})`).join('; ');
    }
    return `${i + 1}. ${e.name || '—'} (${e.id}) [${e.sub || 'General'}]:\n   └ ${rDetails}`;
  });
  const msg = `Dear ERP Team,\n${areaLabel} section, ${monthStr} Overtime Requisition Pending Report:\nThe following employees physically worked overtime (9.2h - 13.5h), but Empress shows 0 OT (Requisition Missing):\n\n${lines.join('\n\n')}\n\nPlease allocate and approve their OT requisitions before payroll cutoff. Thank you!`;
  const areaOnly = document.getElementById('areaFilter')?.value || 'All';
  if (typeof openErpSupportModal === 'function') {
    openErpSupportModal(msg, areaOnly === 'all' ? 'All' : areaOnly);
  } else if (typeof fallbackCopyText === 'function') {
    fallbackCopyText(msg);
    showToast('Copied ERP requisition message to clipboard!', 'success');
  }
}

function openBulkPunchErpForward() {
if (!currentLeaderboardResult) {
showToast('First load the leaderboard list', 'warn');
return;
}
const f = currentLeaderboardResult.filtered;
const punchList = f ? f.sortedByPunch : (currentLeaderboardResult.sortedByPunch || []);
if (!punchList || punchList.length === 0) {
showToast('No employees with punch problems in this section', 'info');
return;
}
const areaLabel = describeLbFilter();
const monthStr = currentLeaderboardResult.month || getCurrentMonth();
const lines = punchList.map((e, i) => {
const pDates = Array.isArray(e.punchProblems)
? e.punchProblems.map(p => (typeof p === 'string' ? p : p.date)).join(', ')
: `${getPunchProblemCount(e)} days`;
return `${i + 1}. ${e.name || '—'} (${e.id}) - missing: ${pDates}`;
});
const msg = `Hello,\n${areaLabel} section, ${monthStr} report: the following employees have missing In/Out punches:\n\n${lines.join('\n')}\n\nPlease verify.`;
const areaOnly = document.getElementById('areaFilter')?.value || 'All';
openErpSupportModal(msg, areaOnly === 'all' ? 'All' : areaOnly);
}
/* const APP_LANG_KEY defined in js/core/config.js */
const I18N_DICT = {
bn: {
navSearch: 'Report',
navLb: 'Leaderboard',
navHistory: 'History',
navNotices: 'Notices',
navTeam: 'ERP Team',
navSettings: 'Settings',
navMore: 'More',
headerSub: 'Overtime report and calculator',
lblWhichMonth: 'Which month of overtime do you want to see?',
lblYourId: 'Your ID number',
btnSeeOt: 'View my overtime',
prevMonth: '< Previous month',
nextMonth: 'Next month >',
payslipTitle: 'How much will you get in total?',
lblSalary: 'Monthly salary (Regular Duty)',
rateChartBtn: 'Rate chart',
gtLabel: 'Total overtime you will receive',
totalDays: 'Total duty days',
compareHeader: 'Compare with another colleague',
datesHeader: 'Holiday and night duty dates',
remarksHeader: 'Is your report correct?',
resetBtn: 'Search again',
noticeBoard: 'Notice board'
},
en: {
navSearch: 'Report',
navLb: 'Leaderboard',
navHistory: 'History',
navNotices: 'Notices',
navTeam: 'ERP Team',
navSettings: 'Settings',
navMore: 'More',
headerSub: 'Overtime Report & Calculator',
lblWhichMonth: 'Select Report Month',
lblYourId: 'Employee ID Number',
btnSeeOt: 'View Overtime Report',
prevMonth: '< Prev Month',
nextMonth: 'Next Month >',
payslipTitle: 'Estimated Total Payout (Salary + OT)',
lblSalary: 'Monthly Basic/Gross Salary (Regular Duty)',
rateChartBtn: 'Rate Chart',
gtLabel: 'Total Overtime Allowance',
totalDays: 'Total Duty Days',
compareHeader: 'Compare with a Colleague',
datesHeader: 'Holiday & Night Duty Dates',
remarksHeader: 'Report & Punch Verification Status',
resetBtn: 'Search Another Report',
noticeBoard: 'Notice Board'
}
};
function getAppLang() { return 'en'; }
function setLanguage(lang) {
const target = lang === 'en' ? 'en' : 'bn';
try { localStorage.setItem(APP_LANG_KEY, target); } catch (e) {}
applyLanguageUI();
}
function toggleLanguage() {
setLanguage(getAppLang() === 'bn' ? 'en' : 'bn');
}
function applyLanguageUI() {
const lang = getAppLang();
const d = I18N_DICT[lang] || I18N_DICT.bn;
document.documentElement.setAttribute('lang', lang);

document.querySelectorAll('.topnav-item[data-nav="search"], .bn-item[data-nav="search"] span').forEach(el => { el.textContent = 'Home'; });
document.querySelectorAll('.topnav-item[data-nav="leaderboard"], .bn-item[data-nav="leaderboard"] span').forEach(el => { el.textContent = 'Rank'; });
document.querySelectorAll('.topnav-item[data-nav="report"], .bn-item[data-nav="report"] span').forEach(el => { el.textContent = d.navSearch; });
document.querySelectorAll('.topnav-item[data-nav="history"]').forEach(el => { el.textContent = d.navHistory; });
document.querySelectorAll('.topnav-item[data-nav="notices"], .bn-item[data-nav="notices"] span:first-of-type').forEach(el => { el.textContent = d.navNotices; });
document.querySelectorAll('.topnav-item[data-nav="team"]').forEach(el => { el.textContent = d.navTeam; });
document.querySelectorAll('.topnav-item[data-nav="settings"]').forEach(el => { el.textContent = d.navSettings; });
document.querySelectorAll('.bn-item[data-nav="more"] span').forEach(el => { el.textContent = d.navMore; });
const hdrP = document.querySelector('#mainHeader p');
if (hdrP) hdrP.textContent = d.headerSub;
const mLbl = document.querySelector('label[for="monthSelect"]');
if (mLbl) mLbl.textContent = d.lblWhichMonth;
const sBtn = document.getElementById('searchBtn');
if (sBtn && getAppMode() !== 'incharge') sBtn.textContent = d.btnSeeOt;
const prevB = document.getElementById('prevMonthBtn');
const nextB = document.getElementById('nextMonthBtn');
const chevronL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const chevronR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
if (prevB) prevB.innerHTML = chevronL;
if (nextB) nextB.innerHTML = chevronR;
const payH = document.querySelector('#payslipCard .card-h');
if (payH) payH.textContent = d.payslipTitle;
const salL = document.getElementById('lblSalaryInput');
if (salL) salL.textContent = d.lblSalary;
const gtL = document.getElementById('gtLabelText');
if (gtL && getReportViewContext(currentSearchId) === 'own') gtL.textContent = d.gtLabel;
const step7L = document.getElementById('step7LabelText');
if (step7L && getReportViewContext(currentSearchId) === 'own') step7L.textContent = d.remarksHeader;
const step4T = document.querySelector('#step4 .collapse-header .title');
if (step4T) step4T.textContent = d.compareHeader;
const step5T = document.querySelector('#step5 .collapse-header .title');
if (step5T) step5T.textContent = d.datesHeader;
}
initYearDropdown();
setDefaultMonth();
initLbTabs();
initTheme();
syncRateDropdownOptions();
applyLanguageUI();
initWelcomeBanner();
(function cleanupDeadCaches() {
// CACHE_PREFIX / COMPARE_CACHE_PREFIX entries are never read anywhere in this app, so they only take up quota.
try {
const cleanupK = (typeof CLEANUP_KEY !== 'undefined' ? CLEANUP_KEY : 'renata_cleanup_v1');
if (localStorage.getItem(cleanupK)) return;
const dead = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX) || k.startsWith(COMPARE_CACHE_PREFIX));
dead.forEach(k => localStorage.removeItem(k));
localStorage.setItem(typeof CLEANUP_KEY !== 'undefined' ? CLEANUP_KEY : 'renata_cleanup_v1', '1');
} catch (e) {}
})();
renderRecentSearchChips();
loadSavedSalary();
ensurePayslipFonts();
loadAreaMap().then(() => { updateSettingsAreaCount(); populateAreaDropdown(); });
renderNoticesHome();
loadTeamData();
setTimeout(startNoticePolling, 2000);

/* ===== Report Page, Rank Hub & ICC Drill-Down, Interactive Swipe & Scroll-Hide ===== */
/* function syncReportPageBanner moved to js/pages/ */

/* function initReportPage moved to js/pages/ */

/* function searchFromReportPage moved to js/pages/ */

async function probeAvailableMonths() {
if (availableServerMonths) return availableServerMonths;
// Build clean 12-month continuity list for selected year without flooding 18 full JSON downloads!
const cur = getCurrentMonth();
const [cy, cm] = cur.split('-').map(Number);
const year = (cy >= 2020 && cy <= 2032) ? cy : new Date().getFullYear();
const found = new Set();
for (let m = 1; m <= 12; m++) {
found.add(`${year}-${String(m).padStart(2, '0')}`);
}
Object.keys(monthIndexMemoryCache).forEach(k => {
if (Array.isArray(monthIndexMemoryCache[k]) && monthIndexMemoryCache[k].length > 0) found.add(k);
});
availableServerMonths = Array.from(found).sort();
return availableServerMonths;
}
/* function updateRankHubCards moved to js/pages/leaderboard.js */

function toggleIccSearchInput() {
const row = document.getElementById('iccSearchRowWrap');
if (!row) return;
const isHidden = row.style.display === 'none';
row.style.display = isHidden ? 'flex' : 'none';
if (isHidden) {
document.getElementById('iccRankDrillView')?.classList.remove('filters-scroll-hidden');
setTimeout(() => document.getElementById('iccSearchInput')?.focus(), 80);
}
}
function getYearToDateMonths(baseMonthStr) {
// "This Year So Far" = January up to TODAY's month (current year) or December (past year).
// It must NOT stop at whichever month happens to be selected in the month dropdown.
const [yy] = String(baseMonthStr).split('-').map(x => parseInt(x, 10));
const now = new Date();
const year = (yy >= 2020 && yy <= 2032) ? yy : now.getFullYear();
const maxM = year === now.getFullYear() ? (now.getMonth() + 1) : 12;
const out = [];
for (let m = 1; m <= maxM; m++) {
out.push(`${year}-${String(m).padStart(2, '0')}`);
}
return out;
}
/* function getIccPeriodOptions moved to js/pages/leaderboard.js */

/* function onIccYearChange moved to js/pages/leaderboard.js */

/* function renderIccPeriodStrip moved to js/pages/leaderboard.js */

async function selectIccPeriodByIndex(idx, swipeDir = 0) {
const opts = getIccPeriodOptions();
if (idx < 0 || idx >= opts.length) return;
const target = opts[idx];
if (!target) return;
const body = document.getElementById('iccDrillListBody');
if (body && swipeDir !== 0) {
body.classList.remove('swiping');
body.style.transform = `translateX(${swipeDir > 0 ? '-36px' : '36px'})`;
body.style.opacity = '0.35';
}
if (target.mode === 'monthly') {
const ySel = document.getElementById('yearSelect');
const mSel = document.getElementById('monthSelect');
const lbYSel = document.getElementById('lbYearSelect');
const lbMSel = document.getElementById('lbMonthSelect');
[ySel, lbYSel].forEach(sel => {
if (!sel) return;
if (![...sel.options].some(o => o.value === target.year)) {
const opt = document.createElement('option');
opt.value = target.year; opt.textContent = bn(target.year);
sel.appendChild(opt);
}
sel.value = target.year;
});
if (mSel) mSel.value = target.month;
if (lbMSel) lbMSel.value = target.month;
currentLbTimeMode = 'monthly';
renderIccPeriodStrip();
await startLeaderboardScan(false);
renderIccDrillList();
} else {
currentLbTimeMode = target.mode;
renderIccPeriodStrip();
await startLeaderboardScan(false);
renderIccDrillList();
}
if (body && swipeDir !== 0) {
body.classList.add('swiping');
body.style.transform = `translateX(${swipeDir > 0 ? '28px' : '-28px'})`;
requestAnimationFrame(() => {
body.classList.remove('swiping');
body.style.transform = 'translateX(0)';
body.style.opacity = '1';
});
}
}
function selectIccArea(areaVal) {
const areaSel = document.getElementById('areaFilter');
if (areaSel) {
if (![...areaSel.options].some(o => o.value === areaVal)) {
const opt = document.createElement('option');
opt.value = areaVal;
opt.textContent = areaVal === OVERALL_AREA ? 'Executives' : areaVal;
areaSel.appendChild(opt);
}
areaSel.value = areaVal;
onAreaFilterChange();
}
document.querySelectorAll('.icc-area-btn').forEach(btn => {
btn.classList.toggle('active', btn.getAttribute('data-icc-area') === areaVal);
});
renderIccDrillList();
}
/* function openRankDrillDown_1 moved to js/pages/leaderboard.js */

/* function closeRankDrillDown moved to js/pages/leaderboard.js */

function getCriterionListFromSource(f, crit) {
if (!f) return [];
if (crit === 'duty') {
if (!f.sortedByDuty || !f.sortedByDuty.length) {
const base = f._rawFiltered || f.allEmployees || [];
ensureEmpAvgStats(base);
f.sortedByDuty = [...base].sort((a,b) => ((b.adjustedDuty ?? b.totalDuty) - (a.adjustedDuty ?? a.totalDuty)) || (b.totalDuty - a.totalDuty));
}
return f.sortedByDuty || [];
}
if (crit === 'ot') return f.sortedByOT || [];
if (crit === 'earned') return f.sortedByEarned || [];
if (crit === 'plain') return f.sortedByPlain || [];
if (crit === 'lessDuty') return f.sortedByLessDuty || [];
if (crit === 'lessOt') return f.sortedByLessOT || [];
if (crit === 'avgDuty') {
if (!f.sortedByAvgDuty || !f.sortedByAvgDuty.length) {
const base = f._rawFiltered || f.allEmployees || f.sortedByDuty || [];
ensureEmpAvgStats(base);
f.sortedByAvgDuty = [...base].sort((a,b) => ((b.adjustedAvgDuty ?? b.avgDutyPerDay ?? 0) - (a.adjustedAvgDuty ?? a.avgDutyPerDay ?? 0)) || (b.totalDuty - a.totalDuty));
}
return f.sortedByAvgDuty;
}
if (crit === 'avgInOut') {
if (!f.sortedByAvgInOut || !f.sortedByAvgInOut.length) {
const base = f._rawFiltered || f.allEmployees || f.sortedByDuty || [];
ensureEmpAvgStats(base);
f.sortedByAvgInOut = [...base].sort((a,b) => (((a.avgInMins && a.avgInMins > 0) ? a.avgInMins : 9999) - ((b.avgInMins && b.avgInMins > 0) ? b.avgInMins : 9999)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
}
return f.sortedByAvgInOut;
}
if (crit === 'punch') return f.sortedByPunch || [];
if (crit === 'absent') {
  if (Array.isArray(f.sortedByAbsent)) return f.sortedByAbsent;
  const mStr = (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  const base = f._rawFiltered || f.allEmployees || [];
  return [...base].filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e, mStr) : 0) > 0).sort((a,b) => (getGeneralAbsentCount(b, mStr) - getGeneralAbsentCount(a, mStr)) || ((a.totalDuty || 0) - (b.totalDuty || 0)) || ((a.otHours || 0) - (b.otHours || 0)));
}
if (crit === 'requisition') {
  if (Array.isArray(f.sortedByRequisition)) return f.sortedByRequisition;
  const base = f._rawFiltered || f.allEmployees || [];
  return [...base].filter(e => getRequisitionProblemCount(e) > 0).sort((a,b) => (getRequisitionProblemCount(b) - getRequisitionProblemCount(a)) || (b.totalDuty - a.totalDuty));
}
if (crit === 'otDays' || crit === 'holiday' || crit === 'night') {
  const cntOf = crit === 'otDays' ? (e => getEmpOtDays(e)) : crit === 'holiday' ? (e => Number(e.holidayCount || 0)) : (e => Number(e.nightCount || 0));
  const base = f._rawFiltered || f.allEmployees || f.sortedByDuty || [];
  return [...base].filter(e => cntOf(e) > 0).sort((a,b) => (cntOf(b) - cntOf(a)) || (crit === 'otDays' ? ((b.otHours || 0) - (a.otHours || 0)) : 0) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
}
return f.sortedByDuty || [];
}
function formatIccMainMetric(e, crit) {
if (crit === 'otDays') return `${getEmpOtDays(e)}d`;
if (crit === 'holiday') return `${Number(e.holidayCount || 0)}d`;
if (crit === 'night') return `${Number(e.nightCount || 0)}n`;
if (crit === 'duty' || crit === 'lessDuty') return `${e.totalDuty || 0} hrs`;
if (crit === 'ot' || crit === 'lessOt') return `${e.otHours || 0} hrs`;
if (crit === 'earned') return `৳ ${Math.round(e.totalEarned || 0).toLocaleString('en-IN')}`;
if (crit === 'plain') return `${e.plainDaysCount || 0}d`;
if (crit === 'avgDuty') {
const adj = e.adjustedAvgDuty != null ? e.adjustedAvgDuty : (e.avgDutyPerDay || Number(((e.totalDuty || 0) / 26).toFixed(1)));
return `${adj} h/d`;
}
if (crit === 'avgInOut') return `${e.avgInTimeStr || '08:00'}`;
if (crit === 'requisition') {
  const c = typeof getRequisitionProblemCount === 'function' ? getRequisitionProblemCount(e) : 0;
  return `${c}d req`;
}
if (crit === 'absent') {
  const c = typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e) : 0;
  return `${c}d`;
}
return `${getPunchProblemCount(e)}d miss`;
}
const ICC_RENDER_BATCH_SIZE = 25;
let _iccCurrentFilteredList = [];
let _iccRenderedCount = 0;
function onIccRowClick(rowEl, empId) {
if (getAppMode() === 'incharge') {
const alreadyOpen = rowEl && rowEl.classList.contains('show-details-open');
document.querySelectorAll('#iccDrillListBody .icc-row.show-details-open').forEach(r => r.classList.remove('show-details-open'));
if (!alreadyOpen && rowEl) {
rowEl.classList.add('show-details-open');
return;
}
}
viewEmployeeFromLeaderboard(empId);
}
function buildIccRowHtml(e, myId, adminActive) {
const areaShort = (a) => a === 'Packing Hall' ? 'Packing' : a === 'Solid Production' ? 'Solid' : a === 'Softgel Production' ? 'Softgel' : a === OVERALL_AREA ? 'Executives' : (a || 'RPPF');
const rk = e._iccRank;
const isMine = e.id === myId;
const initials = String(e.name || e.id || 'R').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || 'RP';
const mainVal = formatIccMainMetric(e, activeIccCriterion);
const dutyNum = Math.round((Number(e.totalDuty) || 0) * 10) / 10;
const otNum = Math.round((Number(e.otHours) || 0) * 10) / 10;
const holNum = Number(e.holidayCount || 0);
const ngtNum = Number(e.nightCount || 0);
const plainNum = Number(e.plainDaysCount || 0);
const subVal = `O:${otNum}|H:${holNum}|N:${ngtNum}|`;
const isReqCrit = activeIccCriterion === 'requisition';
const isAbsCrit = activeIccCriterion === 'absent';
const rkClass = activeIccCriterion === 'punch' ? 'icc-punch-row' : (isReqCrit ? 'icc-req-row' : (isAbsCrit ? 'icc-absent-row' : (rk <= 3 ? `icc-rank-${rk}` : '')));
let absMetaUnderName = '';
const isMultiTime = (typeof currentLbTimeMode !== 'undefined' && currentLbTimeMode !== 'monthly') || Boolean(e && (e.isMultiMonth || (e.monthsCount && e.monthsCount > 1)));
if (isAbsCrit) {
  if (!isMultiTime) {
    const curMonth = (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
    const absRes = typeof computeEmpGeneralAbsents === 'function' ? computeEmpGeneralAbsents(e, curMonth) : { dates: (e.generalAbsentDays || []), shortDates: (e.generalAbsentShortDates || []), count: (e.generalAbsentCount || 0) };
    const shortDates = (Array.isArray(absRes.shortDates) && absRes.shortDates.length > 0) ? absRes.shortDates : (absRes.dates || []).map(d => {
      const m1 = String(d).match(/^(\d{1,2})-([A-Za-z]{3})/i);
      if (m1) {
        const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        const mIdx = mons.findIndex(x => x === m1[2].toUpperCase()) + 1;
        const mm = String(mIdx > 0 ? mIdx : (curMonth.split('-')[1] || '01')).padStart(2, '0');
        return `${String(m1[1]).padStart(2, '0')}-${mm}`;
      }
      return String(d).split(' ')[0];
    });
    if (shortDates.length > 0) {
      absMetaUnderName = `<div style="font-size:11px;font-weight:700;color:#dc2626;margin-top:2px;">🔴 Absent (${shortDates.length}d): ${esc(shortDates.slice(0, 8).join(', '))}${shortDates.length > 8 ? ' +' + (shortDates.length - 8) + ' more' : ''}</div>`;
    }
  } else {
    const byM = Array.isArray(e.absentByMonth) ? e.absentByMonth : [];
    const shortDates = Array.isArray(e.generalAbsentShortDates) ? e.generalAbsentShortDates : (Array.isArray(e.generalAbsentDays) ? e.generalAbsentDays : []);
    const mSummary = byM.length > 0 ? byM.map(x => `${x.label}: ${x.count}d`).join(' • ') : `${shortDates.length}d total`;
    const dtPreview = shortDates.length > 0 ? ` (${shortDates.slice(0, 6).join(', ')}${shortDates.length > 6 ? ' +' + (shortDates.length - 6) : ''})` : '';
    absMetaUnderName = `<div style="font-size:11px;font-weight:700;color:#dc2626;margin-top:2px;">🔴 ${esc(mSummary)}${esc(dtPreview)}</div>`;
  }
}
let reqMetaUnderName = '';
if (isReqCrit) {
  const probs = Array.isArray(e.requisitionProblems) ? e.requisitionProblems : (typeof computeEmpRequisitionProblems === 'function' ? computeEmpRequisitionProblems(e) : []);
  if (probs.length > 0) {
    const pDates = probs.map(p => `${p.date}`).join(', ');
    reqMetaUnderName = `<div style="font-size:11px;font-weight:700;color:#d97706;margin-top:2px;">⚠️ Pending OT: ${esc(pDates)}</div>`;
  }
}
const desig = getDesignation(e);
const empCats = Array.isArray(e.customCats) ? e.customCats : (getEmpMeta(e.id).cats || []);
const catBadgesHtml = empCats.map(c => `<span class="icc-cat-badge">${esc(c)}</span>`).join('');
let detailsBtnText = 'Show Details →';
if (activeIccCriterion === 'absent') detailsBtnText = 'Absent Details →';
else if (activeIccCriterion === 'punch') detailsBtnText = 'Punch Details →';
else if (activeIccCriterion === 'requisition') detailsBtnText = 'Req Details →';
else if (activeIccCriterion === 'ot' || activeIccCriterion === 'lessOt') detailsBtnText = isMultiTime ? 'OT by Month →' : 'OT Details →';
else if (activeIccCriterion === 'duty' || activeIccCriterion === 'lessDuty' || activeIccCriterion === 'avgDuty') detailsBtnText = isMultiTime ? 'Duty by Month →' : 'Duty Details →';
else if (activeIccCriterion === 'earned') detailsBtnText = isMultiTime ? 'Earnings by Month →' : 'Earning Details →';
else if (activeIccCriterion === 'plain') detailsBtnText = '4:30pm Days →';
else if (activeIccCriterion === 'night') detailsBtnText = isMultiTime ? 'Nights by Month →' : 'Night Shifts →';
else if (activeIccCriterion === 'otDays') detailsBtnText = isMultiTime ? 'OT Days by Month →' : 'OT Days →';
else if (activeIccCriterion === 'holiday') detailsBtnText = isMultiTime ? 'Holidays by Month →' : 'Holiday Duty →';
else if (activeIccCriterion === 'avgInOut') detailsBtnText = 'Punch Times →';
else if (isMultiTime) detailsBtnText = 'Period Summary →';
const showDetailsBtnHtml = `<button type="button" class="icc-show-details-btn" onclick="event.stopPropagation(); viewEmployeeFromLeaderboard('${esc(e.id)}')">${detailsBtnText}</button>`;
const adminCatBtnHtml = adminActive ? `<button type="button" class="icc-emp-cat-btn" onclick="event.stopPropagation(); openEmpAdminCatModal('${esc(e.id)}', '${esc(e.name || e.id)}')" title="Assign additional categories">+Cat</button>` : '';
return `<div class="icc-row ${rkClass} ${isMine ? 'mine' : ''}" data-emp-id="${esc(e.id)}" onclick="onIccRowClick(this, '${esc(e.id)}')">
<div class="icc-rank-col"><span class="icc-rank-num">${rk}</span></div>
<div class="icc-emp-col">
<div class="icc-avatar">${esc(initials)}</div>
<div class="icc-emp-text">
<div class="icc-emp-name">${esc(e.name || e.id)}${isMine ? ' (You)' : ''}${catBadgesHtml}</div>
<div class="icc-emp-sub">${esc(e.id)} • ${esc(areaShort(e.area))}${desig ? ' • ' + esc(desig) : ''}</div>${reqMetaUnderName}${absMetaUnderName}
</div>
${showDetailsBtnHtml}${adminCatBtnHtml}
</div>
<div class="icc-desktop-mid">
<span class="icc-mid-pill">Duty <b>${dutyNum}h</b></span>
<span class="icc-mid-pill">OT <b>${otNum}h</b></span>
<span class="icc-mid-pill">Hol <b>${holNum}d</b></span>
<span class="icc-mid-pill">Night <b>${ngtNum}n</b></span>
<span class="icc-mid-pill">4:30pm <b>${plainNum}d</b></span>
</div>
<div class="icc-val-col">
<div class="icc-val-main">${mainVal}</div>
${activeIccCriterion === 'duty' && (e.nightRestDays || 0) > 0 ? `<div class="icc-val-sub" style="font-size:9.5px;opacity:0.85;">+${e.nightRestCredit || (e.nightRestDays * NIGHT_REST_CREDIT_HOURS)}h night-rest credit (${e.nightRestDays}d)</div>` : activeIccCriterion === 'avgDuty' ? `<div class="icc-val-sub" style="font-size:9.5px;opacity:0.85;">(raw ${Number(e.avgDutyPerDay || 0).toFixed(1)})</div>` : (activeIccCriterion === 'absent' && isMultiTime ? `<div class="icc-val-sub" style="font-size:9.5px;opacity:0.85;">Avg ${e.avgAbsent != null ? e.avgAbsent : Number(((e.generalAbsentCount || 0) / Math.max(1, e.monthsCount || 1)).toFixed(1))}d/m • ${e.monthsCount || 1}m</div>` : '')}
<div class="icc-val-sub">${subVal}</div>
</div>
</div>`;
}
function loadMoreIccRows() {
const body = document.getElementById('iccDrillListBody');
if (!body || _iccRenderedCount >= _iccCurrentFilteredList.length) return;
const moreBtn = document.getElementById('iccLoadMoreBtnWrap');
if (moreBtn) moreBtn.remove();
const myId = getMyId();
const adminActive = isIccAdminCatModeActive();
const nextBatch = _iccCurrentFilteredList.slice(_iccRenderedCount, _iccRenderedCount + ICC_RENDER_BATCH_SIZE);
_iccRenderedCount += nextBatch.length;
const chunkHtml = nextBatch.map(e => buildIccRowHtml(e, myId, adminActive)).join('');
const remaining = _iccCurrentFilteredList.length - _iccRenderedCount;
const moreHtml = remaining > 0
? `<div id="iccLoadMoreBtnWrap" style="padding:10px;text-align:center;"><button type="button" class="btn-secondary" style="min-height:34px;font-size:12px;" onclick="loadMoreIccRows()">Show more (${remaining} remaining)</button></div>`
: '';
body.insertAdjacentHTML('beforeend', chunkHtml + moreHtml);
}
/* function renderIccDrillList moved to js/pages/leaderboard.js */

/* Interactive Partial-Drag Swipe on ICC Drill-Down List & Freeze Header / Auto-Hide Filters on Scroll */
(function initIccSwipeAndScrollHide() {
let startX = 0, startY = 0, tracking = false, isHoriz = null;
document.addEventListener('touchstart', e => {
const drill = document.getElementById('iccRankDrillView');
if (!drill || !drill.classList.contains('active')) return;
if (e.target.closest('#iccPeriodStrip') || e.target.closest('#iccCritStrip') || e.target.closest('input, select, button')) return;
if (!e.touches || !e.touches[0]) return;
startX = e.touches[0].clientX;
startY = e.touches[0].clientY;
tracking = true;
isHoriz = null;
}, { passive: true });
document.addEventListener('touchmove', e => {
if (!tracking || !e.touches || !e.touches[0]) return;
const dx = e.touches[0].clientX - startX;
const dy = e.touches[0].clientY - startY;
if (isHoriz === null) {
if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
isHoriz = Math.abs(dx) > Math.abs(dy) * 1.25;
}
}
if (isHoriz === false) {
const drill = document.getElementById('iccRankDrillView');
if (drill && drill.classList.contains('active')) {
if (dy < -22) drill.classList.add('filters-scroll-hidden');
else if (dy > 16) drill.classList.remove('filters-scroll-hidden');
}
}
if (isHoriz) {
const body = document.getElementById('iccDrillListBody');
if (body) {
body.classList.add('swiping');
const damped = Math.max(-110, Math.min(110, dx * 0.42));
body.style.transform = `translateX(${damped}px)`;
body.style.opacity = String(Math.max(0.55, 1 - Math.abs(dx) / 420));
}
}
}, { passive: true });
const finishSwipe = (e) => {
if (!tracking) return;
tracking = false;
const body = document.getElementById('iccDrillListBody');
if (!isHoriz) {
if (body) { body.classList.remove('swiping'); body.style.transform = ''; body.style.opacity = ''; }
return;
}
const touch = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
const dx = touch ? (touch.clientX - startX) : 0;
const pills = Array.from(document.querySelectorAll('#iccPeriodStrip .icc-period-pill'));
const activeIdx = pills.findIndex(p => p.classList.contains('active'));
if (Math.abs(dx) > 48 && activeIdx !== -1) {
const dir = dx < 0 ? 1 : -1;
const nextIdx = Math.max(0, Math.min(pills.length - 1, activeIdx + dir));
if (nextIdx !== activeIdx) {
selectIccPeriodByIndex(nextIdx, dir);
return;
}
}
if (body) {
body.classList.remove('swiping');
body.style.transform = 'translateX(0)';
body.style.opacity = '1';
}
};
document.addEventListener('touchend', finishSwipe, { passive: true });
document.addEventListener('touchcancel', finishSwipe, { passive: true });

// Handle scroll on window and side-drawer #page-leaderboard + vertical touch-scroll inside #iccRankDrillView
const handleScrollDelta = (curY, lastY) => {
const delta = curY - lastY;
const drill = document.getElementById('iccRankDrillView');
if (curY <= 24 || delta < -4) {
document.body.classList.remove('nav-scroll-hidden');
if (drill) drill.classList.remove('filters-scroll-hidden');
} else if (delta > 8 && curY > 36) {
if (drill && drill.classList.contains('active')) {
drill.classList.add('filters-scroll-hidden');
}
if (curY > 75 && !currentSideDrawerPage) {
document.body.classList.add('nav-scroll-hidden');
}
}
};
let lastWinY = window.scrollY || 0;
window.addEventListener('scroll', () => {
const curY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
handleScrollDelta(curY, lastWinY);
lastWinY = curY;
}, { passive: true });

let lastLbY = 0;
function wireLeaderboardScroll() {
initSideDrawerClasses();
const lbPage = document.getElementById('page-leaderboard');
if (lbPage && !lbPage._scrollWired) {
lbPage._scrollWired = true;
lbPage.addEventListener('scroll', () => {
const curY = Math.max(0, lbPage.scrollTop || 0);
handleScrollDelta(curY, lastLbY);
lastLbY = curY;
if (iccDrillOpen && _iccRenderedCount < _iccCurrentFilteredList.length) {
if (lbPage.scrollTop + lbPage.clientHeight >= lbPage.scrollHeight - 260) {
loadMoreIccRows();
}
}
}, { passive: true });
}
}
wireLeaderboardScroll();
setTimeout(wireLeaderboardScroll, 120);
})();

/* ===== ROUND 4: Admin Categories on Ranking, Pull-to-Refresh & Back-Button / Miss-Touch Guard ===== */
/* ===== ROUND 5: Unified Single-ID Role Login (Hidden In-Charge, Manager & Admin Modes) ===== */
const SPECIAL_ROLE_IDS = {
'RF8941': {
id: 'RF8941',
name: 'Debashish Mitra',
mode: 'incharge',
roleTitle: 'In-Charge (Solid)',
defaultArea: 'Solid Production',
isAdmin: false,
allowNormalBypass: true,
pins: ['8941', '2026', '1234']
},
'RF20716': {
id: 'RF20716',
name: 'Milon Ahamed',
mode: 'incharge',
roleTitle: 'In-Charge (SG)',
defaultArea: 'Softgel Production',
isAdmin: false,
allowNormalBypass: true,
pins: ['20716', '2026', '1234']
},
'RF5473': {
id: 'RF5473',
name: 'Rabiul Alam',
mode: 'incharge',
roleTitle: 'Production Manager',
defaultArea: 'all',
isAdmin: false,
allowNormalBypass: true,
pins: ['5473', '2026', '1234']
},
'RF23849': {
id: 'RF23849',
name: 'Asrar Mahamud Neloy',
mode: 'incharge',
roleTitle: 'Officer (Executive)',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['23849', '2026', '1234']
},
'RF23848': {
id: 'RF23848',
name: 'Md Faysal Miah',
mode: 'incharge',
roleTitle: 'Officer (Executive)',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['23848', '2026', '1234']
},
'RF23810': {
id: 'RF23810',
name: 'Mehedi Hasan',
mode: 'incharge',
roleTitle: 'Officer (Executive)',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['23810', '2026', '1234']
},
'RF22690': {
id: 'RF22690',
name: 'Md. Mehdi Hasan',
mode: 'incharge',
roleTitle: 'Senior Officer (Executive)',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['22690', '2026', '1234']
},
'RF0364': {
id: 'RF0364',
name: 'Md. Mokaddesh Uddin Khan',
mode: 'incharge',
roleTitle: 'Officer (Executive)',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['0364', '364', '2026', '1234']
},
'RF364': {
id: 'RF0364',
name: 'Md. Mokaddesh Uddin Khan',
mode: 'incharge',
roleTitle: 'Officer (Executive)',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['0364', '364', '2026', '1234']
},
'RF23234': {
id: 'RF23234',
name: 'Sabbir Ahmed',
mode: 'incharge',
roleTitle: 'Officer (Executive)',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['23234', '2026', '1234']
},
'RF21291': {
id: 'RF21291',
name: 'Sabuj Karmoker',
mode: 'incharge',
roleTitle: 'Assistant Manager',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['21291', '2026', '1234']
},
'RF21062': {
id: 'RF21062',
name: 'Namita Rani Nath',
mode: 'incharge',
roleTitle: 'Assistant Manager',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['21062', '2026', '1234']
},
'RF20948': {
id: 'RF20948',
name: 'Hadia Farzana',
mode: 'incharge',
roleTitle: 'Assistant Manager',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['20948', '2026', '1234']
},
'RF21283': {
id: 'RF21283',
name: 'Tanzina Aktar',
mode: 'incharge',
roleTitle: 'Assistant Manager',
defaultArea: 'Overall',
isAdmin: false,
allowNormalBypass: true,
pins: ['21283', '2026', '1234']
},
'RF20850': {
id: 'RF20850',
name: 'Md. Ariful Islam',
mode: 'incharge',
roleTitle: 'System Admin',
defaultArea: 'all',
isAdmin: true,
allowNormalBypass: true,
pins: ['20850', 'admin1234', '2026']
},
'RF22111': {
id: 'RF22111',
name: 'Mr. Md. Sohel Mia',
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: 'Solid Production',
isAdmin: true,
allowNormalBypass: true,
pins: ['22111', 'admin1234', '2026']
},
'CF5242': {
id: 'CF5242',
name: 'Mr. Md. Shohidul Islam',
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: 'Solid Production',
isAdmin: true,
allowNormalBypass: true,
pins: ['5242', 'admin1234', '2026']
},
'CF8355': {
id: 'CF8355',
name: 'Mr. Johirul Islam Porag',
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: 'Solid Production',
isAdmin: true,
allowNormalBypass: true,
pins: ['8355', 'admin1234', '2026']
},
'RF21561': {
id: 'RF21561',
name: 'Mr. MD. Rahid Hossain',
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: 'Packing Hall',
isAdmin: true,
allowNormalBypass: true,
pins: ['21561', 'admin1234', '2026']
},
'RF22849': {
id: 'RF22849',
name: 'Mr. Md. Ashraful Alam',
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: 'Softgel Production',
isAdmin: true,
allowNormalBypass: true,
pins: ['22849', 'admin1234', '2026']
},
'ADMIN': {
id: 'ADMIN',
name: 'Md. Ariful Islam (Admin)',
mode: 'incharge',
roleTitle: 'System Admin',
defaultArea: 'all',
isAdmin: true,
pins: ['admin1234', '2026']
}
};
function getSpecialRoleSpec(rawId) {
const clean = String(rawId || '').trim().toUpperCase().replace(/\s+/g, '');
if (!clean) return null;
if (SPECIAL_ROLE_IDS[clean]) return SPECIAL_ROLE_IDS[clean];
// Also dynamically recognize any member added to ERP Team (team.json / teamData) as ERP Team Admin!
if (Array.isArray(teamData)) {
const tm = teamData.find(m => m && String(m.id || '').trim().toUpperCase() === clean);
if (tm && clean !== '—') {
const numPart = clean.replace(/[^0-9]/g, '');
return {
id: clean,
name: tm.name || clean,
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: (tm.area && tm.area !== 'All') ? tm.area : 'all',
isAdmin: true,
allowNormalBypass: true,
pins: ['admin1234', '2026', '1234', ...(numPart ? [numPart] : [])]
};
}
}
return null;
}
function syncPrivilegedUI() {
const mode = getAppMode();
const admin = isAdminLoggedIn();
const isPriv = (mode === 'incharge') || admin;
document.body.classList.toggle('incharge-mode-active', mode === 'incharge');
// Show ⚙ Cat button in Ranking ONLY for Admin / In-Charge / Manager
const catBtn = document.getElementById('iccAdminCatToggleBtn');
if (catBtn) catBtn.style.display = isPriv ? 'inline-flex' : 'none';
// Show Mode row & Area row in Settings ONLY for In-Charge / Manager / Admin
const modeRow = document.getElementById('settingsModeRow');
if (modeRow) modeRow.style.display = isPriv ? 'flex' : 'none';
const incAreaRow = document.getElementById('settingsInchargeAreaRow');
if (incAreaRow) incAreaRow.style.display = isPriv ? 'flex' : 'none';
// Show Executive Quick VS card ONLY for In-Charge / Manager / Admin
const execVsCard = document.getElementById('vsExecShortcutSection');
if (execVsCard) execVsCard.style.display = isPriv ? 'block' : 'none';
// Update Ranking Hub In-Charge items visibility
['inchargeHubUpcomingDivider', 'hubBtnAvgDuty', 'hubBtnAvgInOut', 'iccCritTabAvgDuty', 'iccCritTabAvgInOut'].forEach(id => {
const el = document.getElementById(id);
if (el) el.style.display = isPriv ? '' : 'none';
});
}
function onRegEmpIdInputChange() {
const inp = document.getElementById('regEmpIdInput');
const raw = String(inp?.value || '').trim().toUpperCase().replace(/\s+/g, '');
const spec = getSpecialRoleSpec(raw);
const authBox = document.getElementById('specialRoleAuthBox');
const badgeEl = document.getElementById('specialRoleBadgeText');
const personEl = document.getElementById('specialRolePersonName');
const skipBtn = document.getElementById('regSkipAdminNormalBtn');
const errEl = document.getElementById('specialRolePinError');
if (errEl) errEl.classList.remove('show');
if (spec) {
if (authBox) authBox.classList.add('show');
if (badgeEl) badgeEl.textContent = spec.roleTitle;
if (personEl) personEl.textContent = `${spec.name} (${spec.id})`;
if (skipBtn) skipBtn.style.display = spec.allowNormalBypass ? 'inline-flex' : 'none';
} else {
if (authBox) authBox.classList.remove('show');
if (skipBtn) skipBtn.style.display = 'none';
}
}
function saveNormalEmployeeBypass() {
const inp = document.getElementById('regEmpIdInput');
const raw = String(inp?.value || '').trim().toUpperCase().replace(/\s+/g, '');
if (!raw) return;
setAdminLoggedIn(false);
setPreferredId(raw);
setAppMode('employee');
updateModeUI();
syncPrivilegedUI();
closeModeSetupModal();
showToast(`Saved ID: ${raw}`, 'success');
const empInput = document.getElementById('employeeId');
if (empInput) { empInput.value = raw; toggleClearIdBtn(); }
switchPage('search');
findReport();
}
// Override openModeSetupModal, saveEmployeeModeSetup, savePermanentIdFromSettings, deletePermanentIdFromSettings, and updateModeUI
const _origUpdateModeUI = updateModeUI;
updateModeUI = function() {
_origUpdateModeUI();
syncPrivilegedUI();
};
openModeSetupModal = function() {
const modal = document.getElementById('modeSetupModal');
if (!modal) return;
if (typeof pushAppNavState === 'function') pushAppNavState('modal:modeSetup');
const myId = getPreferredId();
const regInp = document.getElementById('regEmpIdInput');
const hint = document.getElementById('regCurrentSavedHint');
const passInp = document.getElementById('specialRolePassInput');
if (regInp) regInp.value = myId || '';
if (passInp) passInp.value = '';
if (hint) {
if (myId) { hint.style.display = 'block'; hint.textContent = `Current saved ID: ${myId}`; }
else hint.style.display = 'none';
}
onRegEmpIdInputChange();
modal.classList.add('open');
document.body.style.overflow = 'hidden';
setTimeout(() => regInp?.focus(), 100);
};
saveEmployeeModeSetup = function() {
const inp = document.getElementById('regEmpIdInput');
const raw = String(inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
if (!raw) {
showToast('Please enter your ID number', 'warn');
inp?.focus();
return;
}
const spec = getSpecialRoleSpec(raw);
if (!spec) {
// Normal Employee: No password required!
setAdminLoggedIn(false);
setPreferredId(raw);
setAppMode('employee');
updateModeUI();
closeModeSetupModal();
showToast(`Saved ID (${raw})`, 'success');
const empInput = document.getElementById('employeeId');
if (empInput) { empInput.value = raw; toggleClearIdBtn(); }
switchPage('search');
findReport();
return;
}
// Special Role ID: Verify Password / PIN
const authBox = document.getElementById('specialRoleAuthBox');
if (authBox && !authBox.classList.contains('show')) {
onRegEmpIdInputChange();
document.getElementById('specialRolePassInput')?.focus();
return;
}
const passInp = document.getElementById('specialRolePassInput');
const rawPass = String(passInp ? passInp.value : '').trim().replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
// If this ID allows normal employee bypass (e.g. RF20850 or ERP Team member) and password was left blank, log in directly as Normal Employee!
if (!rawPass && spec.allowNormalBypass) {
saveNormalEmployeeBypass();
return;
}
const validPins = [...(spec.pins || []), getAdminPassword()];
if (!rawPass || !validPins.includes(rawPass)) {
document.getElementById('specialRolePinError')?.classList.add('show');
showToast('Enter the valid password/PIN for ' + spec.name, 'error');
passInp?.focus();
return;
}
// Authenticated for Special Role inside index.html (In-Charge / Manager / Admin Ranking privileges)
const savedId = spec.id === 'ADMIN' ? (getPreferredId() || 'RF20850') : spec.id;
setPreferredId(savedId);
setAppMode(spec.mode);
setAdminLoggedIn(Boolean(spec.isAdmin || rawPass === getAdminPassword()));
try {
localStorage.setItem(INCHARGE_ROLE_KEY, `${spec.roleTitle} • ${spec.name}`);
localStorage.setItem(INCHARGE_AREA_KEY, spec.defaultArea || 'all');
} catch (e) {}
window._memInchargeRole = `${spec.roleTitle} • ${spec.name}`;
window._memInchargeArea = spec.defaultArea || 'all';
updateModeUI();
closeModeSetupModal();
showToast(`Welcome ${spec.name} (${spec.roleTitle})`, 'success');
const areaFilter = document.getElementById('areaFilter');
if (areaFilter && spec.defaultArea) areaFilter.value = spec.defaultArea;
if (savedId && savedId !== 'ADMIN') {
const empInput = document.getElementById('employeeId');
if (empInput) { empInput.value = savedId; toggleClearIdBtn(); }
findReport();
}
switchPage('leaderboard', true);
};
const _origGetInchargeRoleLabel = getInchargeRoleLabel;
getInchargeRoleLabel = function() {
if (window._memInchargeRole) return window._memInchargeRole;
return _origGetInchargeRoleLabel();
};
const _origGetInchargeDefaultArea = getInchargeDefaultArea;
getInchargeDefaultArea = function() {
if (window._memInchargeArea) return window._memInchargeArea;
return _origGetInchargeDefaultArea();
};
/* function savePermanentIdFromSettings_override moved to js/pages/ */
;
const _origDeletePermanentId = deletePermanentIdFromSettings;
/* function deletePermanentIdFromSettings_override moved to js/pages/ */
;
document.getElementById('specialRolePassInput')?.addEventListener('keydown', e => {
if (e.key === 'Enter') saveEmployeeModeSetup();
});
setTimeout(syncPrivilegedUI, 50);

let _adminLoggedInMem = false;
const _origIsAdminLoggedIn = isAdminLoggedIn;
isAdminLoggedIn = function() {
if (_adminLoggedInMem) return true;
return _origIsAdminLoggedIn();
};
const _origSetAdminLoggedIn = setAdminLoggedIn;
setAdminLoggedIn = function(val) {
_adminLoggedInMem = Boolean(val);
_origSetAdminLoggedIn(val);
};
let _iccAdminCatModeManual = false;
function isIccAdminCatModeActive() {
if (window._iccAdminForceHide) return false;
if (getAppMode() !== 'incharge' && !isAdminLoggedIn()) return false;
return Boolean(_iccAdminCatModeManual || isAdminLoggedIn());
}
function syncIccAdminToggleBtn() {
const btn = document.getElementById('iccAdminCatToggleBtn');
if (!btn) return;
const act = isIccAdminCatModeActive();
btn.classList.toggle('active', act);
btn.textContent = act ? '⚙ Cat ✓' : '⚙ Cat';
}
function toggleIccAdminCatMode() {
if (isIccAdminCatModeActive()) {
_iccAdminCatModeManual = false;
if (isAdminLoggedIn()) {
window._iccAdminForceHide = true;
showToast('Admin category buttons hidden (tap ⚙ Cat to show again)', 'info');
}
syncIccAdminToggleBtn();
renderIccDrillList();
return;
}
if (isAdminLoggedIn()) {
window._iccAdminForceHide = false;
_iccAdminCatModeManual = true;
syncIccAdminToggleBtn();
renderIccDrillList();
showToast('Admin Category Mode enabled — tap +Cat on any employee!', 'success');
return;
}
if (getAppMode() === 'incharge') {
_iccAdminCatModeManual = true;
window._iccAdminForceHide = false;
syncIccAdminToggleBtn();
renderIccDrillList();
showToast('Admin Category Mode enabled — tap +Cat on any employee!', 'success');
return;
}
const m = document.getElementById('adminCatAuthModal');
const inp = document.getElementById('adminCatQuickPassInp');
if (inp) inp.value = '';
if (m) m.classList.add('open');
setTimeout(() => inp?.focus(), 80);
}
function closeAdminCatAuthModal() {
document.getElementById('adminCatAuthModal')?.classList.remove('open');
}
function confirmAdminCatQuickAuth() {
const inp = document.getElementById('adminCatQuickPassInp');
const trimmed = String(inp?.value || '').trim();
if (trimmed === getAdminPassword()) {
setAdminLoggedIn(true);
_iccAdminCatModeManual = true;
window._iccAdminForceHide = false;
closeAdminCatAuthModal();
syncIccAdminToggleBtn();
renderIccDrillList();
showToast('Admin Category Mode enabled — tap +Cat on any employee!', 'success');
} else {
showToast('Incorrect password/PIN', 'error');
}
}

let _modalTempSelectedCats = [];
function openEmpAdminCatModal(empId, empName) {
const u = String(empId || '').toUpperCase().trim();
if (!u) return;
if (typeof pushAppNavState === 'function') pushAppNavState('modal:empAdminCat');
const modal = document.getElementById('empAdminCatModal');
if (!modal) return;
document.getElementById('empAdminCatTargetId').value = u;
const titleEl = document.getElementById('empAdminCatModalTitle');
const subEl = document.getElementById('empAdminCatModalSub');
const area = getAreaForId(u, true);
if (titleEl) titleEl.textContent = `${empName || u} (${u})`;
if (subEl) subEl.textContent = `Current Area: ${area === OVERALL_AREA ? 'Executives' : area}`;
const meta = getEmpMeta(u);
_modalTempSelectedCats = [...(meta.cats || [])];
renderEmpAdminCatModalChips();
const areaSel = document.getElementById('empAdminAreaSelect');
if (areaSel) {
const normArea = ['Packing Hall', 'Solid Production', 'Softgel Production', 'Overall'].includes(area) ? area : 'Packing Hall';
areaSel.value = normArea;
}
onEmpAdminModalAreaChange(meta.sub || '');
const gSel = document.getElementById('empAdminGenderSelect');
if (gSel) gSel.value = meta.gender || '';
const tSel = document.getElementById('empAdminTypeSelect');
if (tSel) tSel.value = meta.type || getAutoEmpType(u) || 'CON';
modal.classList.add('open');
}
function closeEmpAdminCatModal() {
document.getElementById('empAdminCatModal')?.classList.remove('open');
}
function renderEmpAdminCatModalChips() {
const box = document.getElementById('empAdminCatChipsBox');
if (!box) return;
const allCats = getMasterCustomCategories();
box.innerHTML = allCats.map(cat => {
const sel = _modalTempSelectedCats.includes(cat);
return `<button type="button" class="emp-cat-chip ${sel ? 'selected' : ''}" data-cat="${esc(cat)}" onclick="toggleModalEmpCat(this.dataset.cat)">${sel ? '✓ ' : '+ '}${esc(cat)}</button>`;
}).join('');
}
function toggleModalEmpCat(cat) {
if (!cat) return;
const idx = _modalTempSelectedCats.indexOf(cat);
if (idx >= 0) _modalTempSelectedCats.splice(idx, 1);
else _modalTempSelectedCats.push(cat);
renderEmpAdminCatModalChips();
}
function addNewCustomCatFromModal() {
const inp = document.getElementById('newEmpCustomCatInp');
const val = (inp ? inp.value : '').trim();
if (!val) { showToast('Enter a category name first', 'warn'); return; }
const allCats = getMasterCustomCategories();
if (!allCats.includes(val)) {
allCats.push(val);
AREA_SUBS.__custom_cats__ = allCats;
}
if (!_modalTempSelectedCats.includes(val)) {
_modalTempSelectedCats.push(val);
}
if (inp) inp.value = '';
saveAreaCache();
refreshCustomCatFilterOptions();
renderEmpAdminCatModalChips();
showToast(`Category "${val}" added`, 'success');
}
function onEmpAdminModalAreaChange(prefSub = '') {
const area = document.getElementById('empAdminAreaSelect')?.value || 'Packing Hall';
const subSel = document.getElementById('empAdminSubSelect');
if (!subSel) return;
const subs = (AREA_SUBS && Array.isArray(AREA_SUBS[area])) ? AREA_SUBS[area] : [];
subSel.innerHTML = '<option value="">No sub-section</option>' + subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
if (prefSub && subs.includes(prefSub)) subSel.value = prefSub;
}
async function saveEmpAdminCatModal(syncToServer = false) {
const u = (document.getElementById('empAdminCatTargetId')?.value || '').trim().toUpperCase();
if (!u) return;
const newArea = document.getElementById('empAdminAreaSelect')?.value || 'Packing Hall';
const newSub = document.getElementById('empAdminSubSelect')?.value || '';
const newGender = document.getElementById('empAdminGenderSelect')?.value || '';
const newType = document.getElementById('empAdminTypeSelect')?.value || '';
AREA_MAP[u] = newArea;
if (!AREA_DETAILS[u]) AREA_DETAILS[u] = {};
if (newGender) AREA_DETAILS[u].g = newGender; else delete AREA_DETAILS[u].g;
if (newType) AREA_DETAILS[u].t = newType; else delete AREA_DETAILS[u].t;
if (newSub) AREA_DETAILS[u].s = newSub; else delete AREA_DETAILS[u].s;
if (_modalTempSelectedCats.length > 0) {
AREA_DETAILS[u].c = [..._modalTempSelectedCats];
} else {
delete AREA_DETAILS[u].c;
}
saveAreaCache();
reapplyTypeOverrides();
refreshCustomCatFilterOptions();
if (currentLeaderboardResult && Array.isArray(currentLeaderboardResult.allEmployees)) {
enrichLbEmployees(currentLeaderboardResult.allEmployees);
applyAreaFilter();
}
renderIccDrillList();
closeEmpAdminCatModal();
showToast(`Saved categories & metadata for ${u}`, 'success');
if (syncToServer) {
await adminPushAreasToGithub();
}
}

/* ===== Pull-to-Refresh (Force Scroll Down on Any Page = Reload/Refresh Same Page) ===== */
async function triggerCurrentPageRefresh() {
const ptr = document.getElementById('ptrIndicator');
const ptrTxt = document.getElementById('ptrText');
if (ptr) {
ptr.classList.add('visible', 'refreshing');
ptr.classList.remove('ready');
}
if (ptrTxt) ptrTxt.textContent = 'Refreshing page...';
try {
const activePage = currentSideDrawerPage || currentPermanentPage || 'search';
if (activePage === 'leaderboard') {
await startLeaderboardScan(true);
if (iccDrillOpen) renderIccDrillList();
showToast('Ranking data refreshed', 'success');
} else if (activePage === 'report') {
await findReport();
initReportPage();
showToast('Report refreshed', 'success');
} else if (activePage === 'vs') {
initVsPage();
const a = document.getElementById('compareId1')?.value;
const b = document.getElementById('compareId')?.value;
if (a && b) await runComparison();
showToast('VS comparison refreshed', 'success');
} else if (activePage === 'notices') {
await forceRefreshNotices();
} else if (activePage === 'team') {
await renderTeamPage();
showToast('ERP Team list refreshed', 'success');
} else if (activePage === 'history') {
renderHistory();
showToast('History refreshed', 'success');

} else if (activePage === 'settings' || activePage === 'more') {
await loadAreaMap();
updateSettingsAreaCount();
updateModeUI();
showToast('Settings refreshed', 'success');
} else {
if (document.getElementById('employeeId')?.value) {
await findReport();
} else {
await renderNoticesHome();
}
showToast('Home page refreshed', 'success');
}
} catch (err) {
console.warn('Refresh error:', err);
} finally {
setTimeout(() => {
if (ptr) {
ptr.classList.remove('visible', 'refreshing', 'ready');
ptr.style.transform = '';
}
}, 420);
}
}

(function initPullToRefreshAndTouchGuards() {
let ptrStartY = 0, ptrStartX = 0, ptrPulling = false, ptrDist = 0;
const PTR_THRESHOLD = 68;
function getActiveScrollTop() {
if (document.querySelector('.lb-modal.open')) return 999;
if (currentSideDrawerPage) {
const drawer = document.getElementById('page-' + currentSideDrawerPage);
if (drawer) return drawer.scrollTop || 0;
}
return window.scrollY || document.documentElement.scrollTop || 0;
}
document.addEventListener('touchstart', e => {
if (!e.touches || !e.touches[0]) return;
ptrStartX = e.touches[0].clientX;
ptrStartY = e.touches[0].clientY;
if (getActiveScrollTop() <= 2 && !e.target.closest('input, select, textarea, .icc-period-strip, .icc-crit-strip')) {
ptrPulling = true;
ptrDist = 0;
} else {
ptrPulling = false;
}
}, { passive: true });

document.addEventListener('touchmove', e => {
if (!e.touches || !e.touches[0]) return;
const dx = e.touches[0].clientX - ptrStartX;
const dy = e.touches[0].clientY - ptrStartY;
if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
window._lastTouchMoveTs = Date.now();
}
if (!ptrPulling) return;
if (getActiveScrollTop() > 4 || dy < 0 || Math.abs(dx) > Math.abs(dy) * 0.85) {
ptrPulling = false;
const ptr = document.getElementById('ptrIndicator');
if (ptr && !ptr.classList.contains('refreshing')) {
ptr.classList.remove('visible', 'ready');
ptr.style.transform = '';
}
return;
}
ptrDist = dy;
if (ptrDist > 18) {
const ptr = document.getElementById('ptrIndicator');
const ptrTxt = document.getElementById('ptrText');
if (ptr && !ptr.classList.contains('refreshing')) {
const pullY = Math.min(76, Math.round((ptrDist - 18) * 0.65));
ptr.classList.add('visible');
ptr.style.transform = `translate(-50%, ${pullY - 36}px)`;
const isReady = ptrDist >= PTR_THRESHOLD;
ptr.classList.toggle('ready', isReady);
if (ptrTxt) ptrTxt.textContent = isReady ? 'Release to refresh page' : 'Pull down to refresh...';
}
}
}, { passive: true });

const endPtr = () => {
if (!ptrPulling) return;
ptrPulling = false;
const ptr = document.getElementById('ptrIndicator');
if (ptrDist >= PTR_THRESHOLD) {
ptrDist = 0;
triggerCurrentPageRefresh();
} else if (ptr && !ptr.classList.contains('refreshing')) {
ptr.classList.remove('visible', 'ready');
ptr.style.transform = '';
}
ptrDist = 0;
};
document.addEventListener('touchend', endPtr, { passive: true });
document.addEventListener('touchcancel', endPtr, { passive: true });

// Miss-touch prevention: block accidental ghost clicks right after a touch drag/swipe
let lastNavClickTs = 0;
document.addEventListener('click', e => {
if (window._lastTouchMoveTs && (Date.now() - window._lastTouchMoveTs) < 210) {
const isInteractiveRow = e.target.closest('.icc-row, .rank-hub-item, .more-item');
if (isInteractiveRow) {
e.stopPropagation();
e.preventDefault();
return;
}
}
const navBtn = e.target.closest('.bn-item, .topnav-item');
if (navBtn) {
const now = Date.now();
if (now - lastNavClickTs < 190) {
e.stopPropagation();
e.preventDefault();
return;
}
lastNavClickTs = now;
}
}, true);
})();

/* ===== Hardware Back Button Prevention & Hash Routing (handled by js/components/router.js) ===== */
let _lastHardwareBackTs = 0;
let _suppressHistoryPush = false;
function pushAppNavState(label) {}

/* ===== Notice ticker (report page only) ===== */
/* function renderNoticeTicker moved to js/pages/ */


/* ===== Daily report preview + PNG ===== */
/* _loadScript cleanly provided by modular js/ */
/* const _RMON, _RDAY, _rE, _rN, _rMin moved to js/pages/report.js */
/* function _rptRows moved to js/pages/ */

let _rptZoomLevel = 1;
let _rptHideEmptyDays = false;
function setReportZoom(z) {
_rptZoomLevel = z;
const wrap = document.getElementById('rptInnerScaleWrap');
if (wrap) {
wrap.style.zoom = String(z);
}
document.querySelectorAll('.rpt-zoom-btn[data-zoom]').forEach(btn => {
btn.classList.toggle('active', parseFloat(btn.getAttribute('data-zoom')) === z);
});
}
function toggleReportDutyFilter(hideEmpty) {
_rptHideEmptyDays = Boolean(hideEmpty);
const ctx = window._rptCtx;
const wrap = document.getElementById('rptInnerScaleWrap');
if (ctx && ctx.emp && wrap) {
wrap.innerHTML = _rptHtml(ctx, false);
}
document.querySelectorAll('.rpt-filter-btn').forEach(btn => {
btn.classList.toggle('active', (btn.getAttribute('data-hide-empty') === '1') === _rptHideEmptyDays);
});
}
/* function _rptHtml moved to js/pages/ */

/* function _rptReset moved to js/pages/ */

/* function toggleReportPreview moved to js/pages/ */

/* function downloadReportPNG moved to js/pages/ */

(function () { const b = document.getElementById('pngShareBtn'); if (b && typeof navigator.canShare === 'function') b.style.display = ''; })();



/* ===== In-Charge / Manager Mode: Money-Free Employee Full Profile & Month-Wise Overview on Home ===== */
async function renderInchargeEmployeeProfile(emp, month, searchId) {
  const card = document.getElementById('inchargeEmpProfileCard');
  if (!card || !emp) return;
  const isInc = getAppMode() === 'incharge';
  document.body.classList.toggle('incharge-mode-active', isInc);
  if (!isInc) return;

  const avgStats = (typeof computeEmpAvgDutyAndInOut === 'function') ? computeEmpAvgDutyAndInOut(emp) : {};
  const presentDays = avgStats.presentDaysCount || Math.max(1, Number(emp.regularDaysCount || 0) + Number(emp.holidayCount || 0));
  const totalDuty = Number(emp.totalDuty || 0);
  const otHours = Number(emp.otHours || 0);
  const avgDutyDay = avgStats.avgDutyPerDay != null ? avgStats.avgDutyPerDay : Number((totalDuty / presentDays).toFixed(2));
  const avgOtDay = Number((otHours / presentDays).toFixed(2));
  const avgInStr = avgStats.avgInTimeStr || '08:00';
  const avgOutStr = avgStats.avgOutTimeStr || '17:00';
  const pCount = getPunchProblemCount(emp);
  const area = getAreaForId(searchId, emp.isRppf !== false);
  const meta = getEmpMeta(searchId);
  const desig = getDesignation(emp) || emp.grade || 'Employee';
  const cats = (meta.cats && meta.cats.length) ? ` • Tags: ${meta.cats.join(', ')}` : '';

  const setT = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  setT('incProfNameTitle', `${emp.name || searchId} (${searchId})`);
  setT('incProfSubMeta', `${desig}${meta.sub ? ' • ' + meta.sub : ''}${cats}`);
  setT('incProfAreaBadge', area === OVERALL_AREA ? 'Executives' : area);
  setT('incKpiDutyHrs', `${totalDuty} hrs`);
  setT('incKpiPresentDays', `${presentDays} Present Duty Days`);
  setT('incKpiAvgDuty', `${avgDutyDay} hrs/day`);
  setT('incKpiAvgInOut', `${avgInStr}`);
  setT('incKpiPunchStatus', pCount > 0 ? `⚠ ${pCount} day(s) punch missing` : '✓ All In/Out punches OK');
  setT('incKpiOtHrs', `${otHours} hrs`);
  setT('incKpiAvgOtDay', `Avg ${avgOtDay} hrs OT / day`);
  setT('incEmpKpiPlainDays', `${Number(emp.plainDaysCount || emp.plainDays || 0)} days`);
  setT('incKpiRegDays', `Regular duty: ${Number(emp.regularDaysCount || 0)} days`);
  setT('incKpiHolNight', `Hol: ${Number(emp.holidayCount || 0)}d • Night: ${Number(emp.nightCount || 0)}n`);
  const holSubEl = document.getElementById('incKpiHolNight')?.nextElementSibling;
  if (holSubEl) holSubEl.textContent = (avgStats.nightRestDays || 0) > 0 ? `Night rest days: ${avgStats.nightRestDays}` : 'Month Shift Summary';

  // Build Month-Wise History & This Year Totals for this Employee
  const [yrStr, curMStr] = String(month || getCurrentMonth()).split('-');
  const year = parseInt(yrStr, 10) || new Date().getFullYear();
  const _now = new Date();
  const maxM = (year === _now.getFullYear()) ? (_now.getMonth() + 1) : 12; // whole year up to today, not just up to the selected month
  setT('incMwYearLbl', String(year));
  setT('incYtdOtLbl', `${year} Total OT`);

  const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const ytdMonths = [];
  for (let m = 1; m <= 12; m++) {
    ytdMonths.push(`${year}-${String(m).padStart(2, '0')}`);
  }

  // Fetch cached/available months in parallel without blocking UI
  const monthRecords = [];
  await Promise.all(ytdMonths.map(async (ym) => {
    let list = monthIndexMemoryCache[ym];
    if (!list && parseInt(ym.split('-')[1], 10) <= maxM) {
      try { list = await fetchMonthPreIndexedData(ym, false, false); } catch (e) {}
    }
    if (Array.isArray(list)) {
      const found = list.find(x => String(x.id || '').toUpperCase() === searchId);
      if (found) monthRecords.push({ ym, emp: found });
    }
  }));

  if (!monthRecords.some(r => r.ym === month)) {
    monthRecords.push({ ym: month, emp });
  }
  monthRecords.sort((a, b) => a.ym.localeCompare(b.ym));

  let ytdOt = 0, ytdDuty = 0;
  monthRecords.forEach(r => {
    ytdOt += Number(r.emp.otHours || 0);
    ytdDuty += Number(r.emp.totalDuty || 0);
  });
  const mCnt = Math.max(1, monthRecords.length);
  setT('incYtdTotalOt', `${Math.round(ytdOt * 10) / 10} hrs`);
  setT('incYtdAvgMonthlyOt', `${(ytdOt / mCnt).toFixed(1)} hrs/m`);
  setT('incYtdTotalDuty', `${Math.round(ytdDuty * 10) / 10} hrs`);

  const tbody = document.getElementById('incEmpMonthWiseTbody');
  if (tbody) {
    tbody.innerHTML = monthRecords.map((r, rIdx) => {
      const e = r.emp;
      const prevRec = rIdx > 0 && monthRecords[rIdx - 1].ym === getPrevMonthStr(r.ym) ? monthRecords[rIdx - 1].emp : null;
      const prevNight = prevRec ? didEmpWorkNightOnLastDay(prevRec, monthRecords[rIdx - 1].ym) : hasPrevMonthLastNight(searchId, r.ym, e);
      e._prevMonthLastNight = prevNight;
      const absRes = computeEmpGeneralAbsents(e, r.ym, prevNight);
      const absCnt = absRes.count || 0;
      const st = (typeof computeEmpAvgDutyAndInOut === 'function') ? computeEmpAvgDutyAndInOut(e) : {};
      const [, mm] = r.ym.split('-');
      const mLabel = `${shortMonths[(parseInt(mm, 10) || 1) - 1]} ${year}`;
      const pIssues = getPunchProblemCount(e);
      const isCur = r.ym === month;
      return `<tr class="${isCur ? 'active-month-row' : ''}" onclick="switchInchargeEmpMonth('${esc(r.ym)}', '${esc(searchId)}')">
        <td style="text-align:left;font-weight:700;">${esc(mLabel)}</td>
        <td>${st.presentDaysCount || '—'}d</td>
        <td><b>${Number(e.totalDuty || 0)}h</b></td>
        <td style="color:var(--brand-text);font-weight:700;">${Number(e.otHours || 0)}h</td>
        <td>${st.avgDutyPerDay || '—'}h/d</td>
        <td>${st.avgInTimeStr || '08:00'}</td>
        <td>${Number(e.plainDaysCount || e.plainDays || 0)}d</td>
        <td>H:${Number(e.holidayCount || 0)} | N:${Number(e.nightCount || 0)}</td>
        <td style="color:${absCnt > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:700;" title="${esc((absRes.shortDates || []).join(', '))}">${absCnt > 0 ? absCnt + 'd abs' : '0d'}</td>
        <td style="color:${pIssues > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:700;">${pIssues > 0 ? pIssues + ' miss' : 'OK'}</td>
      </tr>`;
    }).join('');
  }
}
function switchInchargeEmpMonth(ym, empId) {
  const [y, m] = String(ym || '').split('-');
  const ySel = document.getElementById('yearSelect');
  const mSel = document.getElementById('monthSelect');
  if (ySel && y) ySel.value = y;
  if (mSel && m) mSel.value = m;
  const empInp = document.getElementById('employeeId');
  if (empInp && empId) { empInp.value = empId; toggleClearIdBtn(); }
  findReport();
}

/* ===== Cross-Tab Live Sync with Standalone admin.html ===== */
function openStandaloneAdminFile() {
  const targetUrl = (location.protocol === 'http:' || location.protocol === 'https:')
    ? new URL('admin.html', location.href).href
    : (REMOTE_BASE_URL + 'admin.html');
  window.open(targetUrl, '_blank', 'noopener');
}
(function initCrossTabAdminSync() {
  let refreshing = false, refreshTimer = null;
  const refreshFromAdminSync = () => {
    if (refreshing) return;
    refreshing = true;
    AREA_MAP_LOADED = false;
    Object.keys(monthIndexMemoryCache).forEach(k => delete monthIndexMemoryCache[k]);
    loadAreaMap().then(() => {
      updateSettingsAreaCount();
      populateAreaDropdown();
      if (currentSearchId) findReport();
      if (currentSideDrawerPage === 'leaderboard' || iccDrillOpen) startLeaderboardScan(true);
      renderNoticesHome();
    }).catch(() => {}).finally(() => { refreshing = false; });
  };
  window.scheduleAdminRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshFromAdminSync, 500); };
  // Our own cache writes carry a fresh `ts` every time. Reacting to the raw key change made two open tabs
  // re-fetch and re-write each other's cache forever, so only a change in the payload itself counts.
  const payloadSig = (raw) => {
    try { const o = JSON.parse(raw); if (o && typeof o === 'object') delete o.ts; return JSON.stringify(o); }
    catch (err) { return String(raw); }
  };
  window.addEventListener('storage', (e) => {
    if (!e || !e.key) return;
    if (e.key === (typeof LAST_ADMIN_SYNC_KEY !== 'undefined' ? LAST_ADMIN_SYNC_KEY : 'rppf_last_admin_sync_ts')) { scheduleAdminRefresh(); return; }
    if (e.key === AREA_MAP_CACHE_KEY || e.key === NOTICES_CACHE_KEY || e.key === TEAM_CACHE_KEY) {
      if (e.newValue == null) return;
      if (payloadSig(e.oldValue) === payloadSig(e.newValue)) return;
      scheduleAdminRefresh();
    }
  });
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const ch = new BroadcastChannel('rppf_admin_sync');
      ch.onmessage = () => scheduleAdminRefresh();
    } catch (e) {}
  }
})();


/* ==========================================================================
   ROUND 6 CORE MODULE:
   1. Default Sub-sections & Ranking Sub-section Filter (#subFilter)
   2. Daily Absent List Engine (absent.json + localStorage + ERP Admin Sync)
   3. In-Charge Home Default Overview (Active Counts, Absent List, Category Toppers)
   4. Earning Category Removal in In-Charge Ranking View
   5. Live Employee Autocomplete Suggestion Dropdown across all Search Inputs
   6. Native HTML5 Canvas 2D Report PNG & VS Comparison PNG Generator (Fixes Download Failure)
   ========================================================================== */

function _el(id) { return document['getElementById'](id); }

/* const ABSENT_CACHE_KEY defined in js/core/config.js */
const DEFAULT_AREA_SUBSECTIONS = {
  'Solid Production': ['Granulation', 'Compression', 'Coating', 'Capsule Filling', 'Dispensing', 'Inspection'],
  'Softgel Production': ['Encapsulation', 'Gelatin Prep', 'Medicament Prep', 'Tumble Drying', 'Sorting & Inspection'],
  'Packing Hall': ['Blister Packing', 'Strip & Alu-Alu', 'Bottle Line', 'Cartoning', 'Secondary Packing', 'Labeling'],
  'Overall': ['Production Management', 'Section In-Charge', 'QA / Compliance', 'ERP & Planning']
};

function ensureDefaultSubsections() {
  if (!AREA_SUBS || typeof AREA_SUBS !== 'object') AREA_SUBS = {};
  if (!Array.isArray(AREA_SUBS.__deleted_subs__)) AREA_SUBS.__deleted_subs__ = [];
  const deletedSet = new Set(AREA_SUBS.__deleted_subs__);

  Object.keys(DEFAULT_AREA_SUBSECTIONS).forEach(area => {
    if (!Array.isArray(AREA_SUBS[area])) {
      AREA_SUBS[area] = [...DEFAULT_AREA_SUBSECTIONS[area]].filter(s => !deletedSet.has(s));
    } else {
      AREA_SUBS[area] = AREA_SUBS[area].filter(s => !deletedSet.has(s));
    }
  });
}

function getAllSubsectionsForArea(area) {
  ensureDefaultSubsections();
  const deletedSet = new Set(AREA_SUBS.__deleted_subs__ || []);
  const fromDetails = [];
  Object.keys(AREA_DETAILS || {}).forEach(id => {
    const d = AREA_DETAILS[id];
    const empArea = AREA_MAP[id];
    if (d && d.s && !deletedSet.has(d.s) && (area === 'all' || empArea === area)) {
      fromDetails.push(String(d.s).trim());
    }
  });
  if (area === 'all') {
    const allSubs = [];
    Object.keys(AREA_SUBS).forEach(k => {
      if (k === '__custom_cats__' || k === '__deleted_subs__') return;
      if (Array.isArray(AREA_SUBS[k])) allSubs.push(...AREA_SUBS[k]);
    });
    return [...new Set([...allSubs, ...fromDetails].filter(s => Boolean(s) && !deletedSet.has(s)))];
  }
  return [...new Set([...(AREA_SUBS[area] || []), ...fromDetails].filter(s => Boolean(s) && !deletedSet.has(s)))];
}

// Override refreshSubFilter so Sub-section filter is ALWAYS visible in Ranking instead of Category
refreshSubFilter = function() {
  const sel = _el('subFilter');
  const catSel = _el('customCatFilter');
  if (catSel) catSel.style.display = 'none'; // Replaced by Sub-section per user request
  if (!sel) return;
  const area = _el('areaFilter')?.value || 'all';
  const subs = getAllSubsectionsForArea(area);
  const prev = sel.value || 'all';
  const defaultLbl = area === 'all' ? 'All sub-sections' : `${area === OVERALL_AREA ? 'Exec' : area.split(' ')[0]} sub-sections`;
  sel.innerHTML = `<option value="all">${esc(defaultLbl)}</option>` + subs.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === prev) ? prev : 'all';
  sel.style.display = '';
};

// Also allow sub-section filter even when area === 'all'
getLbFilterState = function() {
  return {
    area: _el('areaFilter')?.value || 'all',
    sub: _el('subFilter')?.value || 'all',
    gender: _el('genderFilter')?.value || 'all',
    type: _el('typeFilter')?.value || 'all',
    customCat: 'all'
  };
};

describeLbFilter = function() {
  const st = getLbFilterState();
  const parts = [st.area === 'all' ? 'All areas' : (st.area === OVERALL_AREA ? 'Executives' : st.area)];
  if (st.sub !== 'all') parts.push(`Sub: ${st.sub}`);
  if (st.gender !== 'all') parts.push(GENDER_LABELS[st.gender] || st.gender);
  if (st.type !== 'all') parts.push(EMP_TYPE_LABELS[st.type] || st.type);
  return parts.join(' • ');
};

// Update applyAreaFilter so st.sub works across all areas or specific area
// const _prevApplyAreaFilter moved to js/pages/leaderboard.js
/* function applyAreaFilter_override moved to js/pages/leaderboard.js */
;

// Block 'earned' criterion in In-Charge mode
// const _prevOpenRankDrillDown moved to js/pages/leaderboard.js
/* function openRankDrillDown_override moved to js/pages/leaderboard.js */
;

// Show Sub-section badge on ICC Ranking rows & update button label to "+Sub"
const _prevBuildIccRowHtml = buildIccRowHtml;
buildIccRowHtml = function(e, myId, adminActive) {
  let html = _prevBuildIccRowHtml(e, myId, adminActive);
  const subName = e.sub || getEmpMeta(e.id).sub || '';
  if (subName) {
    const subBadge = `<span class="icc-cat-badge" style="background:var(--brand-soft);color:var(--brand-text);border-color:var(--brand-soft-border);">${esc(subName)}</span>`;
    html = html.replace('<div class="icc-emp-sub">', `<div class="icc-emp-sub">${subBadge} `);
  }
  html = html.replace('>+Cat</button>', '>+Sub</button>');
  return html;
};

/* ==========================================================================
   DAILY ABSENT LIST ENGINE (ERP Admin <-> In-Charge Home Overview Sync)
   ========================================================================== */
/* ABSENT_STORE declared in js/core/state.js */
let _absentLoaded = false;
let _incAbsentAreaFilter = 'all';
let _incToppersAreaFilter = 'all';

function getTodayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function saveAbsentCache() {
  try {
    localStorage.setItem(ABSENT_CACHE_KEY, JSON.stringify({
      ts: Date.now(),
      store: ABSENT_STORE
    }));
  } catch (e) {}
}

async function loadAbsentStore(forceFresh = false) {
  if (_absentLoaded && !forceFresh) return ABSENT_STORE;
  if (!ABSENT_STORE.byDate || typeof ABSENT_STORE.byDate !== "object") ABSENT_STORE.byDate = {};
  if (!Array.isArray(ABSENT_STORE.longTermLeaves)) ABSENT_STORE.longTermLeaves = [];
  try {
    const raw = localStorage.getItem(ABSENT_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.store && typeof parsed.store === 'object') {
        ABSENT_STORE = Object.assign({ activeDate: getTodayDateStr(), byDate: {} }, parsed.store);
        if (!ABSENT_STORE.byDate || typeof ABSENT_STORE.byDate !== 'object') ABSENT_STORE.byDate = {};
      }
    }
  } catch (e) {}
  try {
    const remote = await fetchJsonResource('absent.json', 5000);
    if (remote && typeof remote === 'object') {
      const rStore = remote.byDate ? remote : { activeDate: remote.date || getTodayDateStr(), updatedAt: remote.updatedAt, byDate: { [remote.date || getTodayDateStr()]: Array.isArray(remote.list) ? remote.list : [] } };
      Object.keys(rStore.byDate || {}).forEach(dt => {
        if (!ABSENT_STORE.byDate[dt] || forceFresh) {
          ABSENT_STORE.byDate[dt] = rStore.byDate[dt];
        }
      });
      if (rStore.activeDate) ABSENT_STORE.activeDate = rStore.activeDate;
      if (rStore.updatedAt) ABSENT_STORE.updatedAt = rStore.updatedAt;
      if (Array.isArray(remote.longTermLeaves)) ABSENT_STORE.longTermLeaves = remote.longTermLeaves;
      if (!Array.isArray(ABSENT_STORE.longTermLeaves) || !ABSENT_STORE.longTermLeaves.length) {
        if (typeof AREA_DATA !== 'undefined' && Array.isArray(AREA_DATA?.longTermLeaves)) ABSENT_STORE.longTermLeaves = AREA_DATA.longTermLeaves;
      }
      saveAbsentCache();
    }
  } catch (e) {}
  _absentLoaded = true;
  if (!ABSENT_STORE.activeDate) ABSENT_STORE.activeDate = getTodayDateStr();
  return ABSENT_STORE;
}

function getSelectedAbsentDate() {
  const picker = _el('incAbsentDatePicker') || _el('admAbsentDateInput') || _el('qmAbsentDateInp');
  return (picker && picker.value) ? picker.value : (ABSENT_STORE.activeDate || getTodayDateStr());
}

function getAbsentListForDate(dateStr) {
  const dt = dateStr || getSelectedAbsentDate();
  if (!ABSENT_STORE.byDate) ABSENT_STORE.byDate = {};
  const list = ABSENT_STORE.byDate[dt];
  return Array.isArray(list) ? list : [];
}

function resolveEmployeeDirectoryRecord(rawIdOrQuery) {
  const clean = String(rawIdOrQuery || '').trim().toUpperCase();
  if (!clean) return null;
  const master = buildMasterEmployeeDirectory();
  let found = master.find(e => e.id === clean);
  if (!found) {
    const idToken = clean.split(/[\s—\-•(]+/)[0].trim();
    if (idToken) found = master.find(e => e.id === idToken);
  }
  if (!found) {
    found = master.find(e => e.name && e.name.toUpperCase() === clean);
  }
  if (found) return found;
  if (/^(?:CF|RF|CL)\d{2,6}$|^\d{5,8}$/.test(clean)) {
    const meta = getEmpMeta(clean);
    const area = getAreaForId(clean, true);
    return {
      id: clean,
      name: clean,
      area: area === 'Not on the list' ? 'Packing Hall' : area,
      sub: meta.sub || '',
      designation: EMP_TYPE_LABELS[meta.type] || getDesignation({ id: clean }) || 'Employee',
      type: meta.type || getAutoEmpType(clean)
    };
  }
  return null;
}

function upsertAbsentEmployee(dateStr, empInput, reason = 'Absent', note = '') {
  const rec = typeof empInput === 'string' ? resolveEmployeeDirectoryRecord(empInput) : empInput;
  if (!rec || !rec.id) return false;
  const dt = dateStr || getSelectedAbsentDate();
  if (!ABSENT_STORE.byDate) ABSENT_STORE.byDate = {};
  if (!Array.isArray(ABSENT_STORE.byDate[dt])) ABSENT_STORE.byDate[dt] = [];
  const list = ABSENT_STORE.byDate[dt];
  const existingIdx = list.findIndex(x => String(x.id).toUpperCase() === String(rec.id).toUpperCase());
  const meta = getEmpMeta(rec.id);
  const rawArea = rec.area && rec.area !== 'Not on the list' ? rec.area : getAreaForId(rec.id, true);
  const entry = {
    id: String(rec.id).toUpperCase(),
    name: rec.name && rec.name !== rec.id ? rec.name : (resolveEmployeeDirectoryRecord(rec.id)?.name || rec.id),
    area: rawArea === 'Not on the list' ? 'Packing Hall' : rawArea,
    sub: rec.sub || meta.sub || '',
    designation: rec.designation || rec.grade || EMP_TYPE_LABELS[meta.type] || 'Employee',
    reason: reason || 'Absent',
    note: note || '',
    addedAt: new Date().toISOString()
  };
  if (existingIdx >= 0) list[existingIdx] = entry;
  else list.unshift(entry);
  ABSENT_STORE.activeDate = dt;
  ABSENT_STORE.updatedAt = new Date().toISOString();
  saveAbsentCache();
  return true;
}

function removeAbsentEmployee(dateStr, empId) {
  const dt = dateStr || getSelectedAbsentDate();
  const cleanId = String(empId || '').trim().toUpperCase();
  if (!ABSENT_STORE.byDate || !Array.isArray(ABSENT_STORE.byDate[dt])) return;
  ABSENT_STORE.byDate[dt] = ABSENT_STORE.byDate[dt].filter(x => String(x.id).toUpperCase() !== cleanId);
  ABSENT_STORE.updatedAt = new Date().toISOString();
  saveAbsentCache();
  renderInchargeHomeAbsentList();
  renderQuickAbsentModalList();
  if (typeof renderAdminAbsentPane === 'function') renderAdminAbsentPane();
}

function clearDateAbsentList() {
  const dt = _el('admAbsentDateInput')?.value || _el('qmAbsentDateInp')?.value || getSelectedAbsentDate();
  if (!ABSENT_STORE.byDate) ABSENT_STORE.byDate = {};
  ABSENT_STORE.byDate[dt] = [];
  ABSENT_STORE.updatedAt = new Date().toISOString();
  saveAbsentCache();
  renderInchargeHomeAbsentList();
  renderQuickAbsentModalList();
  if (typeof renderAdminAbsentPane === 'function') renderAdminAbsentPane();
  showToast(`Cleared absent list for ${dt}`, 'info');
}

async function saveAbsentAndPushServer() {
  saveAbsentCache();
  renderInchargeHomeAbsentList();
  renderQuickAbsentModalList();
  if (typeof renderAdminAbsentPane === 'function') renderAdminAbsentPane();
  const statusEl = _el('admAbsentSyncStatus');
  if (statusEl) {
    statusEl.style.color = 'var(--brand-text)';
    statusEl.textContent = 'Saving absent.json to RPPF Cloud Server...';
  }
  try {
    if (getGhToken()) {
      const jsonStr = JSON.stringify(ABSENT_STORE, null, 2);
      await githubPutFile('absent.json', utf8ToBase64(jsonStr), `Update daily absent list (${ABSENT_STORE.activeDate}) via ERP Admin`);
      if (statusEl) {
        statusEl.style.color = 'var(--success)';
        statusEl.textContent = 'Daily absent list synced to RPPF Cloud Server (absent.json).';
      }
      showToast('Daily absent list saved & synced to server', 'success');
    } else {
      if (statusEl) {
        statusEl.style.color = 'var(--success)';
        statusEl.textContent = 'Saved locally in browser (set Server Access Key in Setup tab to push to cloud).';
      }
      showToast('Daily absent list updated & saved', 'success');
    }
    try {
      localStorage.setItem(typeof LAST_ADMIN_SYNC_KEY !== 'undefined' ? LAST_ADMIN_SYNC_KEY : 'rppf_last_admin_sync_ts', String(Date.now()));
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('rppf_admin_sync');
        ch.postMessage({ path: 'absent.json', ts: Date.now() });
      }
    } catch (e) {}
  } catch (err) {
    if (statusEl) {
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = `Saved locally; server sync error: ${err.message}`;
    }
    showToast(`Saved locally (${err.message})`, 'warn');
  }
}

/* ==========================================================================
   IN-CHARGE HOME OVERVIEW DASHBOARD
   ========================================================================== */

/* ==========================================================================
   APPROVED MATERNITY LEAVES CONTROLLER (IN-CHARGE HOME)
   ========================================================================== */
let _incLeavesAreaFilter = 'all';

function filterIncHomeLeaves(areaVal) {
  _incLeavesAreaFilter = areaVal || 'all';
  document.querySelectorAll('#incLeavesAreaBar .inc-leaves-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-leave-area') === _incLeavesAreaFilter);
  });
  renderInchargeHomeLeavesList();
}

function renderInchargeHomeLeavesList() {
  const container = _el('incHomeLeavesList');
  const countBadge = _el('incLeavesCountBadge');
  if (!container) return;

  const leaves = typeof getActiveLongTermLeaves === 'function' ? getActiveLongTermLeaves() : [];
  const todayStr = typeof getTodayDateStr === 'function' ? getTodayDateStr() : new Date().toISOString().slice(0, 10);
  const today = new Date(todayStr);

  const activeLeaves = leaves.filter(l => {
    if (!l.endDate) return true;
    const ed = new Date(l.endDate);
    return isNaN(ed.getTime()) || ed >= today;
  });
  if (countBadge) countBadge.textContent = `${activeLeaves.length} Active`;

  // Dynamically update area filter pill bar counts
  const areaCounts = {
    all: leaves.length,
    'Packing Hall': leaves.filter(l => l.area === 'Packing Hall').length,
    'Solid Production': leaves.filter(l => l.area === 'Solid Production').length,
    'Softgel Production': leaves.filter(l => l.area === 'Softgel Production').length,
    'Overall': leaves.filter(l => l.area === 'Overall').length
  };
  document.querySelectorAll('#incLeavesAreaBar .inc-leaves-filter-btn').forEach(btn => {
    const a = btn.getAttribute('data-leave-area');
    if (a === 'all') btn.textContent = `All Sections (${areaCounts.all})`;
    else if (a === 'Packing Hall') btn.textContent = `Packing Hall (${areaCounts['Packing Hall']})`;
    else if (a === 'Solid Production') btn.textContent = `Solid (${areaCounts['Solid Production']})`;
    else if (a === 'Softgel Production') btn.textContent = `Softgel (${areaCounts['Softgel Production']})`;
    else if (a === 'Overall') btn.textContent = `Executives (${areaCounts['Overall']})`;
  });

  const filtered = _incLeavesAreaFilter === 'all'
    ? leaves
    : leaves.filter(l => l.area === _incLeavesAreaFilter);

  if (!filtered || filtered.length === 0) {
    container.innerHTML = `<div class="empty-msg" style="padding:14px;grid-column:1/-1;">No approved long-term leaves recorded in ${_incLeavesAreaFilter === 'all' ? 'any section' : esc(_incLeavesAreaFilter)}.</div>`;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const endDt = item.endDate ? new Date(item.endDate) : null;
    let daysLeftTxt = '';
    let isExpired = false;
    if (endDt && !isNaN(endDt.getTime())) {
      const diffDays = Math.ceil((endDt - today) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        daysLeftTxt = 'Completed';
        isExpired = true;
      } else if (diffDays === 0) {
        daysLeftTxt = 'Ends today';
      } else {
        daysLeftTxt = `${diffDays} days remaining`;
      }
    }
    const duration = item.duration || '6 months';
    const sub = item.sub ? ` • ${item.sub}` : '';
    const badgeCls = isExpired ? 'badge neutral' : 'badge info';

    return `<div class="inc-leave-item" onclick="viewEmployeeFromLeaderboard('${esc(item.id)}')" title="Tap to view employee profile">
      <div class="inc-leave-icon-col">
        <div class="inc-leave-avatar">ML</div>
      </div>
      <div class="inc-leave-body">
        <div class="inc-leave-head">
          <span class="inc-leave-name">${esc(item.name || item.id)}</span>
          <span class="inc-leave-id">(${esc(item.id)})</span>
          <span class="${badgeCls}" style="margin-left:auto;font-size:10.5px;">${esc(item.category || item.type || 'Maternity Leave')}</span>
        </div>
        <div class="inc-leave-meta">
          <span>${esc(item.area || 'Packing Hall')}${esc(sub)}</span>
          <span>•</span>
          <span>${esc(item.startDate || '')} to ${esc(item.endDate || '')}</span>
          <span>(${esc(duration)})</span>
        </div>
        <div class="inc-leave-foot">
          <span class="inc-leave-status-dot ${isExpired ? 'expired' : 'active'}"></span>
          <span class="inc-leave-status-text">${isExpired ? 'Expired / Resumed' : 'Active Leave'} • ${esc(daysLeftTxt)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ==========================================================================
   HISTORICAL PRODUCTION & SHIFT ANALYTICS CONTROLLER (IN-CHARGE HOME)
   ========================================================================== */
let _incHistorySelectedMonth = '2026-10';

async function setIncHistoryMonth(mStr) {
  _incHistorySelectedMonth = mStr;
  document.querySelectorAll('#incHistoryTimelineBar .inc-history-month-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-hmonth') === mStr);
  });
  const badge = _el('incHistoryActiveMonthBadge');
  if (badge) badge.textContent = mStr;
  await renderInchargeHistoricalAnalytics(mStr);
  renderInchargeWatchlist();
}

async function renderInchargeHistoricalAnalytics(optMonth) {
  const card = _el('incHomeHistoryCard');
  if (!card) return;

  const mStr = optMonth || _incHistorySelectedMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '2026-10');
  _incHistorySelectedMonth = mStr;

  const bar = _el('incHistoryTimelineBar');
  if (bar && (!bar.children || bar.children.length === 0)) {
    const months = ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04'];
    const shortNames = {'2026-10':'Oct 26','2026-09':'Sep 26','2026-08':'Aug 26','2026-07':'Jul 26','2026-06':'Jun 26','2026-05':'May 26','2026-04':'Apr 26'};
    bar.innerHTML = months.map(m => `
      <button type="button" class="inc-history-month-btn ${m === _incHistorySelectedMonth ? 'active' : ''}" data-hmonth="${m}" onclick="setIncHistoryMonth('${m}')">
        ${shortNames[m] || m}
      </button>
    `).join('');
  }

  const badge = _el('incHistoryActiveMonthBadge');
  if (badge) badge.textContent = mStr;

  let list = monthIndexMemoryCache[mStr];
  if (!list && typeof fetchMonthPreIndexedData === 'function') {
    try {
      list = await fetchMonthPreIndexedData(mStr, false, true);
    } catch (e) {
      console.warn('Historical data load err:', e);
    }
  }

  const rppfActive = Array.isArray(list)
    ? list.filter(e => e && e.isRppf !== false && e.valid !== false && isMappedAreaId(e.id, e))
    : [];

  let totDuty = 0, totOt = 0, totNight = 0, totPlain = 0, totHoli = 0;
  const secStats = {
    'Packing Hall': { name: 'Packing Hall', active: 0, duty: 0, ot: 0, night: 0 },
    'Solid Production': { name: 'Solid Production', active: 0, duty: 0, ot: 0, night: 0 },
    'Softgel Production': { name: 'Softgel Production', active: 0, duty: 0, ot: 0, night: 0 },
    'Overall': { name: 'Executives / Staff', active: 0, duty: 0, ot: 0, night: 0 }
  };

  rppfActive.forEach(e => {
    const duty = Number(e.totalDuty || 0);
    const ot = Number(e.otHours || 0);
    const night = Number(e.nightCount || 0);
    const plain = Number(e.plainDaysCount || 0);
    const holi = Number(e.holidayCount || e.holidayDutyCount || 0);

    totDuty += duty;
    totOt += ot;
    totNight += night;
    totPlain += plain;
    totHoli += holi;

    const area = getAreaForId(e.id, true);
    let secKey = 'Overall';
    if (area === 'Solid Production') secKey = 'Solid Production';
    else if (area === 'Softgel Production') secKey = 'Softgel Production';
    else if (area === 'Packing Hall') secKey = 'Packing Hall';

    if (secStats[secKey]) {
      secStats[secKey].active++;
      secStats[secKey].duty += duty;
      secStats[secKey].ot += ot;
      secStats[secKey].night += night;
    }
  });

  const actCount = rppfActive.length || 1;
  const setT = (id, txt) => { const el = _el(id); if (el) el.textContent = txt; };

  setT('incKpiTotalDuty', `${Math.round(totDuty).toLocaleString()}h`);
  setT('incKpiDutyAvg', `${(totDuty / actCount).toFixed(1)}h / emp`);
  setT('incKpiTotalOt', `${Math.round(totOt).toLocaleString()}h`);
  setT('incKpiOtAvg', `${(totOt / actCount).toFixed(1)}h / emp`);
  setT('incKpiNightShifts', `${totNight.toLocaleString()}`);
  setT('incKpiPlainDays', `${totPlain.toLocaleString()}`);
  setT('incKpiHolidayDays', `${totHoli.toLocaleString()}`);
  setT('incKpiActiveCount', `${rppfActive.length} active`);

  const tbody = _el('incHistorySecTbody');
  if (tbody) {
    tbody.innerHTML = Object.keys(secStats).map(k => {
      const s = secStats[k];
      const avg = s.active > 0 ? (s.duty / s.active).toFixed(1) : '0';
      return `<tr onclick="openInchargeAreaRanking('${esc(k)}', '${esc(mStr)}')" style="cursor:pointer;" title="Tap to view ${esc(s.name)} ranking for ${esc(mStr)}">
        <td style="font-weight:700;display:flex;align-items:center;gap:6px;">
          <span>${esc(s.name)}</span>
          <span style="font-size:11px;color:var(--brand);">›</span>
        </td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${s.active}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:700;">${Math.round(s.duty).toLocaleString()}h</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--brand);font-weight:700;">${Math.round(s.ot).toLocaleString()}h</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;">${s.night}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--muted);">${avg}h</td>
      </tr>`;
    }).join('');
  }
}

/* ==========================================================================
   ATTENDANCE & OPERATIONAL RISK WATCHLIST CONTROLLER (IN-CHARGE HOME)
   ========================================================================== */
let _incWatchlistTab = 'absent';

function setIncWatchlistTab(tabVal) {
  _incWatchlistTab = tabVal || 'absent';
  document.querySelectorAll('#incWatchlistTabs .inc-watch-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-watch-tab') === _incWatchlistTab);
  });
  renderInchargeWatchlist();
}

function renderInchargeWatchlist() {
  const container = _el('incHomeWatchlistList');
  if (!container) return;

  const month = _incHistorySelectedMonth || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '2026-10');
  const list = monthIndexMemoryCache[month] || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.allEmployees) || [];
  const rppfActive = Array.isArray(list)
    ? list.filter(e => e && e.isRppf !== false && e.valid !== false && isMappedAreaId(e.id, e))
    : [];

  if (rppfActive.length === 0) {
    container.innerHTML = `<div class="empty-msg" style="padding:14px;">Loading watchlist data for ${esc(month)}...</div>`;
    return;
  }

  const areaShort = (a) => a === 'Packing Hall' ? 'Pack' : a === 'Solid Production' ? 'Solid' : a === 'Softgel Production' ? 'SG' : a === OVERALL_AREA ? 'Exec' : (a || 'RPPF');

  let items = [];
  if (_incWatchlistTab === 'absent') {
    items = [...rppfActive]
      .map(e => {
        let cnt = e.generalAbsentCount;
        if (cnt == null && typeof computeEmpGeneralAbsents === 'function') {
          const res = computeEmpGeneralAbsents(e, month);
          cnt = res.count || (res.dates ? res.dates.length : 0);
          e.generalAbsentCount = cnt;
        }
        return { emp: e, count: cnt || 0 };
      })
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(x => ({
        emp: x.emp,
        val: `${x.count} Days Absent`,
        sub: `Recurring absence • Tap to inspect dates`,
        crit: 'absent'
      }));
  } else if (_incWatchlistTab === 'punch') {
    items = [...rppfActive]
      .map(e => {
        const probs = Array.isArray(e.punchProblems) ? e.punchProblems.length : (e.punchAnomalyCount || e.missingPunchCount || 0);
        return { emp: e, count: probs };
      })
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(x => ({
        emp: x.emp,
        val: `${x.count} Punch Anomalies`,
        sub: `Missing punch-in/out • Tap to review punches`,
        crit: 'punch'
      }));
    if (items.length === 0) {
      items = [...rppfActive].slice(0, 6).map(e => ({
        emp: e,
        val: `Punches Verified`,
        sub: `Regular punch history • Tap to review`,
        crit: 'punch'
      }));
    }
  } else if (_incWatchlistTab === 'req') {
    items = [...rppfActive]
      .map(e => {
        const cnt = Number(e.requisitionProblemCount || (Array.isArray(e.requisitionProblems) ? e.requisitionProblems.length : 0)) || (e.unreqOtHours || 0);
        return { emp: e, count: cnt };
      })
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(x => ({
        emp: x.emp,
        val: `${x.count} Unreq OT Records`,
        sub: `Pending OT approval • Tap to inspect`,
        crit: 'requisition'
      }));
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-msg" style="padding:14px;">No anomalies flagged under this category for ${esc(month)}.</div>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const e = item.emp;
    const a = getAreaForId(e.id, true);
    const sub = e.sub ? ` • ${e.sub}` : '';
    return `<div class="inc-watch-item" onclick="openIccContextModal('${esc(e.id)}', '${esc(item.crit)}', '${esc(month)}')" title="Tap to inspect ${esc(item.crit)} context modal">
      <div class="inc-watch-info">
        <div class="inc-watch-name">${esc(e.name || e.id)} <span class="inc-watch-id">(${esc(e.id)})</span></div>
        <div class="inc-watch-sub">${esc(areaShort(a))}${esc(sub)} • ${esc(item.sub)}</div>
      </div>
      <div class="inc-watch-right">
        <span class="inc-watch-val">${esc(item.val)}</span>
        <span class="inc-watch-arrow">Inspect ›</span>
      </div>
    </div>`;
  }).join('');
}
function openInchargeAreaRanking(areaVal, optMonth) {
  if (optMonth) {
    const parts = optMonth.split('-');
    if (parts.length === 2) {
      const ySel = _el('yearSelect');
      const mSel = _el('monthSelect');
      if (ySel) ySel.value = parts[0];
      if (mSel) mSel.value = parts[1];
    }
  }
  const areaSel = _el('areaFilter');
  if (areaSel) {
    if (![...areaSel.options].some(o => o.value === areaVal)) {
      const opt = document.createElement('option');
      opt.value = areaVal;
      opt.textContent = areaVal === OVERALL_AREA ? 'Executives' : areaVal;
      areaSel.appendChild(opt);
    }
    areaSel.value = areaVal;
  }
  switchPage('leaderboard', true);
  setTimeout(() => {
    selectIccArea(areaVal);
    openRankDrillDown('duty');
  }, 80);
}

function onIncAbsentDateChange(val) {
  if (!val) return;
  ABSENT_STORE.activeDate = val;
  renderInchargeHomeAbsentList();
}

function filterIncHomeAbsent(areaVal) {
  _incAbsentAreaFilter = areaVal || 'all';
  document.querySelectorAll('#incAbsentAreaFilterBar .inc-absent-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-abs-area') === _incAbsentAreaFilter);
  });
  renderInchargeHomeAbsentList();
}

function renderInchargeHomeAbsentList() {
  const listEl = _el('incHomeAbsentList');
  const badgeEl = _el('incAbsentCountBadge');
  const metaEl = _el('incAbsentDateMeta');
  const datePicker = _el('incAbsentDatePicker');
  const editBtn = _el('incQuickEditAbsentBtn');
  if (!listEl) return;

  const dt = (datePicker && datePicker.value) ? datePicker.value : (ABSENT_STORE.activeDate || getTodayDateStr());
  if (datePicker && !datePicker.value) datePicker.value = dt;
  if (editBtn) {
    editBtn.style.display = (getAppMode() === 'incharge' || isAdminLoggedIn()) ? 'inline-flex' : 'none';
  }

  const allDateList = getAbsentListForDate(dt);
  const filtered = _incAbsentAreaFilter === 'all'
    ? allDateList
    : allDateList.filter(x => x.area === _incAbsentAreaFilter);

  if (badgeEl) badgeEl.textContent = `${filtered.length} Absent`;
  if (metaEl) {
    const solidCnt = allDateList.filter(x => x.area === 'Solid Production').length;
    const sgCnt = allDateList.filter(x => x.area === 'Softgel Production').length;
    const packCnt = allDateList.filter(x => x.area === 'Packing Hall').length;
    const execCnt = allDateList.filter(x => x.area === OVERALL_AREA).length;
    metaEl.textContent = allDateList.length > 0
      ? `Date: ${dt} • Solid: ${solidCnt} | SG: ${sgCnt} | Pack: ${packCnt}${execCnt ? ' | Exec: ' + execCnt : ''}`
      : `Date: ${dt} • Updated from Admin Corner by ERP`;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-msg" style="padding:14px 8px;grid-column:1/-1;">No absent employees recorded for ${esc(dt)}${_incAbsentAreaFilter !== 'all' ? ' in this section' : ''}.</div>`;
    return;
  }

  const areaShort = (a) => a === 'Packing Hall' ? 'Pack' : a === 'Solid Production' ? 'Solid' : a === 'Softgel Production' ? 'SG' : a === OVERALL_AREA ? 'Exec' : (a || 'RPPF');
  listEl.innerHTML = filtered.map(item => {
    const dirRec = resolveEmployeeDirectoryRecord(item.id);
    const dispName = (item.name && item.name !== item.id) ? item.name : (dirRec?.name || item.id);
    const subTxt = item.sub || dirRec?.sub ? ` • ${item.sub || dirRec.sub}` : '';
    const noteTxt = item.note ? ` (${item.note})` : '';
    return `<div class="inc-absent-item" onclick="viewEmployeeFromLeaderboard('${esc(item.id)}')" title="Tap to view employee profile">
      <div class="inc-absent-emp">
        <div class="inc-absent-name">${esc(dispName)} <span style="color:var(--danger);font-size:12px;">(${esc(item.id)})</span></div>
        <div class="inc-absent-sub">${esc(areaShort(item.area))}${esc(subTxt)} • ${esc(item.designation || 'Employee')}</div>
      </div>
      <span class="inc-absent-tag">${esc((item.reason || 'Absent') + noteTxt)}</span>
    </div>`;
  }).join('');
}

function setIncToppersArea(areaVal) {
  _incToppersAreaFilter = areaVal || 'all';
  document.querySelectorAll('#incToppersAreaBar .inc-topper-area-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-top-area') === _incToppersAreaFilter);
  });
  renderInchargeHomeToppers();
}

function renderInchargeHomeToppers() {
  const grid = _el('incHomeToppersGrid');
  const subEl = _el('incToppersMonthSub');
  if (!grid) return;

  const month = getCurrentMonth();
  const list = monthIndexMemoryCache[month] || (currentLeaderboardResult && currentLeaderboardResult.allEmployees) || [];
  if (!list || list.length === 0) {
    grid.innerHTML = `<div class="empty-msg" style="padding:14px;grid-column:1/-1;">Loading ${esc(month)} toppers...</div>`;
    return;
  }

  const rppfActive = list.filter(e => e && e.isRppf !== false && e.valid !== false && isMappedAreaId(e.id, e));
  enrichLbEmployees(rppfActive);
  ensureEmpAvgStats(rppfActive);

  const areaFiltered = _incToppersAreaFilter === 'all'
    ? rppfActive
    : rppfActive.filter(e => e.area === _incToppersAreaFilter);

  if (subEl) {
    const areaLbl = _incToppersAreaFilter === 'all' ? 'All RPPF Sections' : (_incToppersAreaFilter === OVERALL_AREA ? 'Executives' : _incToppersAreaFilter);
    subEl.textContent = `${month} • ${areaLbl} (${areaFiltered.length} active employees)`;
  }

  if (areaFiltered.length === 0) {
    grid.innerHTML = `<div class="empty-msg" style="padding:14px;grid-column:1/-1;">No employee records found in this section for ${esc(month)}.</div>`;
    return;
  }

  // Categories for In-Charge Toppers (Strictly NO Earning categories!)
  const topperCategories = [
    {
      key: 'duty',
      title: 'Best Duty Hours',
      sortFn: (a, b) => ((b.adjustedDuty ?? b.totalDuty) - (a.adjustedDuty ?? a.totalDuty)) || (b.totalDuty - a.totalDuty),
      valFn: e => `${e.totalDuty || 0}h`
    },
    {
      key: 'ot',
      title: 'Highest Overtime (OT)',
      sortFn: (a, b) => (b.otHours || 0) - (a.otHours || 0),
      valFn: e => `${e.otHours || 0}h OT`
    },
    {
      key: 'avgDuty',
      title: 'Best Avg Duty / Day',
      sortFn: (a, b) => ((b.adjustedAvgDuty ?? b.avgDutyPerDay ?? 0) - (a.adjustedAvgDuty ?? a.avgDutyPerDay ?? 0)) || (b.totalDuty - a.totalDuty),
      valFn: e => `${e.adjustedAvgDuty ?? e.avgDutyPerDay ?? 0}h/d`
    },
    {
      key: 'plain',
      title: 'Top 4:30pm Regular Days',
      sortFn: (a, b) => ((b.plainDaysCount || 0) - (a.plainDaysCount || 0)) || (b.totalDuty - a.totalDuty),
      valFn: e => `${e.plainDaysCount || 0} days`
    },
    {
      key: 'avgInOut',
      title: 'Earliest Avg Punch-In',
      sortFn: (a, b) => ((a.avgInMins || 480) - (b.avgInMins || 480)) || ((b.totalDuty || 0) - (a.totalDuty || 0)),
      valFn: e => `${e.avgInTimeStr || '08:00'}`
    },
    {
      key: 'night',
      title: 'Most Night Shifts',
      sortFn: (a, b) => ((b.nightCount || 0) - (a.nightCount || 0)) || (b.totalDuty - a.totalDuty),
      valFn: e => `${e.nightCount || 0} nights`
    }
  ];

  const areaShort = (a) => a === 'Packing Hall' ? 'Pack' : a === 'Solid Production' ? 'Solid' : a === 'Softgel Production' ? 'SG' : a === OVERALL_AREA ? 'Exec' : (a || 'RPPF');

  grid.innerHTML = topperCategories.map(cat => {
    const top3 = [...areaFiltered].sort(cat.sortFn).slice(0, 3);
    const rowsHtml = top3.map((e, idx) => {
      const subBadge = e.sub ? ` • ${e.sub}` : '';
      return `<div class="inc-topper-row" onclick="viewEmployeeFromLeaderboard('${esc(e.id)}')">
        <span class="inc-topper-medal m-${idx + 1}">${idx + 1}</span>
        <div class="inc-topper-info">
          <div class="inc-topper-name">${esc(e.name || e.id)}</div>
          <div class="inc-topper-meta">${esc(e.id)} • ${esc(areaShort(e.area))}${esc(subBadge)}</div>
        </div>
        <span class="inc-topper-val">${esc(cat.valFn(e))}</span>
      </div>`;
    }).join('');
    const targetCrit = cat.drillKey || cat.key;
    return `<div class="inc-topper-cat-box">
      <div class="inc-topper-cat-head">
        <span class="inc-topper-cat-title">${esc(cat.title)}</span>
        <button type="button" class="inc-topper-more-btn" onclick="switchPage('leaderboard', true); setTimeout(()=>openRankDrillDown('${esc(targetCrit)}'), 60);">All ›</button>
      </div>
      ${rowsHtml}
    </div>`;
  }).join('');
}

async function renderInchargeHomeOverview() {
  const box = _el('inchargeHomeOverview');
  if (!box) return;
  const isInc = getAppMode() === 'incharge';
  document.body.classList.toggle('incharge-mode-active', isInc);
  if (!isInc) return;

  await loadAreaMap();
  await loadAbsentStore();

  const roleLabel = getInchargeRoleLabel();
  const badgeEl = _el('incOvRoleBadge');
  if (badgeEl) badgeEl.textContent = `${roleLabel} • Overview`;

  const month = getCurrentMonth();
  let monthList = monthIndexMemoryCache[month];
  if (!monthList) {
    monthList = await fetchMonthPreIndexedData(month, false, true);
  }
  const activeRppf = Array.isArray(monthList)
    ? monthList.filter(e => e && e.isRppf !== false && e.valid !== false && isMappedAreaId(e.id, e))
    : [];

  const useMonth = activeRppf.length > 0;
  let solidCnt = 0, sgCnt = 0, packCnt = 0, execCnt = 0;

  if (useMonth) {
    activeRppf.forEach(e => {
      const a = getAreaForId(e.id, true);
      const m = getEmpMeta(e.id);
      if (a === 'Solid Production') solidCnt++;
      else if (a === 'Softgel Production') sgCnt++;
      else if (a === 'Packing Hall') packCnt++;
      else if (a === OVERALL_AREA || e.kind === 'EXEC' || m.type === 'EXEC') execCnt++;
    });
  } else {
    Object.keys(AREA_MAP || {}).forEach(id => {
      const a = AREA_MAP[id];
      const m = getEmpMeta(id);
      if (a === 'Solid Production') solidCnt++;
      else if (a === 'Softgel Production') sgCnt++;
      else if (a === 'Packing Hall') packCnt++;
      else if (a === OVERALL_AREA || m.type === 'EXEC') execCnt++;
    });
  }

  const totalActive = solidCnt + sgCnt + packCnt + execCnt;
  const setT = (id, t) => { const el = _el(id); if (el) el.textContent = String(t); };
  setT('incOvTotalActive', totalActive);
  setT('incCountSolid', solidCnt);
  setT('incCountSg', sgCnt);
  setT('incCountPack', packCnt);
  setT('incCountExec', execCnt);
  setT('incMetaSolid', `${(AREA_SUBS['Solid Production'] || []).length} sub-sections • Active`);
  setT('incMetaSg', `${(AREA_SUBS['Softgel Production'] || []).length} sub-sections • Active`);
  setT('incMetaPack', `${(AREA_SUBS['Packing Hall'] || []).length} sub-sections • Active`);
  setT('incMetaExec', `Management & Officers`);

  renderInchargeHomeLeavesList();
  renderInchargeHomeAbsentList();
  renderInchargeHistoricalAnalytics();
  renderInchargeHomeToppers();
  renderInchargeWatchlist();
}

/* Quick Absent Modal Handlers */
function openQuickAbsentModal() {
  const modal = _el('quickAbsentModal');
  if (!modal) return;
  const dtInp = _el('qmAbsentDateInp');
  const homePicker = _el('incAbsentDatePicker');
  if (dtInp) dtInp.value = (homePicker && homePicker.value) ? homePicker.value : (ABSENT_STORE.activeDate || getTodayDateStr());
  renderQuickAbsentModalList();
  modal.classList.add('open');
}

function closeQuickAbsentModal() {
  _el('quickAbsentModal')?.classList.remove('open');
}

function addAbsentFromQuickModal() {
  const inp = _el('qmAbsentEmpInput');
  const dt = _el('qmAbsentDateInp')?.value || getTodayDateStr();
  const reason = _el('qmAbsentReasonSel')?.value || 'Absent';
  const raw = (inp?.value || '').trim();
  if (!raw) { showToast('Enter an employee ID or name', 'warn'); inp?.focus(); return; }
  const ok = upsertAbsentEmployee(dt, raw, reason, '');
  if (!ok) {
    showToast('Could not find matching employee ID', 'warn');
    return;
  }
  if (inp) inp.value = '';
  const homePicker = _el('incAbsentDatePicker');
  if (homePicker) homePicker.value = dt;
  renderQuickAbsentModalList();
  renderInchargeHomeAbsentList();
  showToast('Added to absent list', 'success');
}

function addBulkAbsentFromQuickModal() {
  const inp = _el('qmAbsentBulkInput');
  const dt = _el('qmAbsentDateInp')?.value || getTodayDateStr();
  const reason = _el('qmAbsentReasonSel')?.value || 'Absent';
  const ids = extractEmployeeIdsFromText(inp?.value || '');
  if (!ids.length) { showToast('Paste valid employee IDs', 'warn'); return; }
  ids.forEach(id => upsertAbsentEmployee(dt, id, reason, ''));
  if (inp) inp.value = '';
  const homePicker = _el('incAbsentDatePicker');
  if (homePicker) homePicker.value = dt;
  renderQuickAbsentModalList();
  renderInchargeHomeAbsentList();
  showToast(`${ids.length} employee(s) added to absent list`, 'success');
}

function renderQuickAbsentModalList() {
  const box = _el('qmAbsentCurrentList');
  const titleEl = _el('qmAbsentCountTitle');
  const dt = _el('qmAbsentDateInp')?.value || getSelectedAbsentDate();
  if (!box) return;
  const list = getAbsentListForDate(dt);
  if (titleEl) titleEl.textContent = `Absent List for ${dt} (${list.length})`;
  if (!list.length) {
    box.innerHTML = '<div class="empty-msg" style="padding:12px;">No absent employees on this date.</div>';
    return;
  }
  box.innerHTML = list.map(item => `<div class="admin-absent-list-item">
    <div style="min-width:0;flex:1;">
      <div style="font-weight:800;font-size:13px;color:var(--text);">${esc(item.name || item.id)} <span class="admin-tag">${esc(item.id)}</span></div>
      <div style="font-size:11.5px;color:var(--muted);">${esc(item.area || '')}${item.sub ? ' • ' + esc(item.sub) : ''} • ${esc(item.reason || 'Absent')}</div>
    </div>
    <button type="button" class="calc-mini-btn danger-btn" onclick="removeAbsentEmployee('${esc(dt)}', '${esc(item.id)}')">Remove</button>
  </div>`).join('');
}

/* ==========================================================================
   ADMIN PANEL ABSENT TAB HANDLERS (for admin.html)
   ========================================================================== */
/* onAdmAbsentDateChange cleanly provided by modular js/ */

/* admAddSingleAbsentEmployee cleanly provided by modular js/ */

/* admAddBulkAbsentEmployees cleanly provided by modular js/ */

/* copyAbsentSummaryText cleanly provided by modular js/ */

/* renderAdminAbsentPane cleanly provided by modular js/ */


/* ==========================================================================
   STRICT PRODUCTION SECTION EMPLOYEE DIRECTORY & AUTOCOMPLETE
   ========================================================================== */
const ALLOWED_SECTIONS = ['Solid Production', 'Softgel Production', 'Packing Hall', 'Overall'];

function isListedEmployeeId(id) {
  if (!id) return false;
  const upper = String(id).toUpperCase().trim();
  const area = (typeof AREA_MAP !== "undefined" && AREA_MAP) ? AREA_MAP[upper] : null;
  if (area && ALLOWED_SECTIONS.includes(area)) return true;
  // Check loaded month data
  for (const m of Object.keys(monthIndexMemoryCache || {})) {
    const list = monthIndexMemoryCache[m];
    if (Array.isArray(list)) {
      const found = list.find(x => String(x && x.id || "").toUpperCase() === upper);
      if (found) {
        if (!found.area || found.area === "Not on the list" || ALLOWED_SECTIONS.includes(found.area)) return true;
      }
    }
  }
  // If AREA_MAP is empty or unpopulated, or ID matches standard employee pattern:
  if (!area || ALLOWED_SECTIONS.includes(area)) {
    if (/^[CR]F\d+$/i.test(upper) || /^CL\d+$/i.test(upper) || /^\d{5,8}$/.test(upper)) {
      return true;
    }
  }
  return false;
}

function getListedEmployeesCountBySection() {
  const counts = {
    'Solid Production': 0,
    'Softgel Production': 0,
    'Packing Hall': 0,
    'Overall': 0,
    'Total': 0
  };
  Object.keys(AREA_MAP || {}).forEach(rawId => {
    const area = AREA_MAP[rawId];
    if (area && ALLOWED_SECTIONS.includes(area)) {
      counts[area] = (counts[area] || 0) + 1;
      counts['Total']++;
    }
  });
  return counts;
}

let _masterDirectoryCache = [];
let _masterDirLastBuildTs = 0;

function buildMasterEmployeeDirectory() {
  const now = Date.now();
  if (_masterDirectoryCache.length > 0 && (now - _masterDirLastBuildTs < 5000)) {
    return _masterDirectoryCache;
  }
  const map = new Map();

  // ONLY seed from AREA_MAP where area is in ALLOWED_SECTIONS
  Object.keys(AREA_MAP || {}).forEach(rawId => {
    const id = String(rawId).toUpperCase().trim();
    const area = AREA_MAP[rawId];
    if (area && ALLOWED_SECTIONS.includes(area)) {
      const meta = getEmpMeta(id);
      map.set(id, {
        id,
        name: id,
        area,
        sub: meta.sub || '',
        designation: EMP_TYPE_LABELS[meta.type] || getDesignation({ id }) || 'Employee',
        type: meta.type || getAutoEmpType(id),
        gender: meta.gender || '',
        totalDuty: 0,
        otHours: 0
      });
    }
  });

  // Enrich names, duties, OT and designations from monthly caches ONLY for already listed employees
  Object.keys(monthIndexMemoryCache || {}).forEach(ym => {
    const list = monthIndexMemoryCache[ym];
    if (!Array.isArray(list)) return;
    list.forEach(e => {
      if (!e || !e.id) return;
      const id = String(e.id).toUpperCase().trim();
      if (map.has(id)) {
        const item = map.get(id);
        if (e.name && (item.name === id || !item.name)) {
          item.name = e.name;
        }
        if (e.grade && (!item.designation || item.designation === 'Employee')) {
          item.designation = e.grade;
        }
        if (e.totalDuty) item.totalDuty = Math.max(item.totalDuty || 0, e.totalDuty);
        if (e.otHours) item.otHours = Math.max(item.otHours || 0, e.otHours);
      }
    });
  });

  // Team data enrichment for listed members
  if (Array.isArray(teamData)) {
    teamData.forEach(t => {
      if (t && t.id && t.id !== '—') {
        const id = String(t.id).toUpperCase().trim();
        if (map.has(id)) {
          const cur = map.get(id);
          if (t.name && cur.name === id) cur.name = t.name;
          if (t.designation) cur.designation = t.designation;
        }
      }
    });
  }

  _masterDirectoryCache = Array.from(map.values());
  _masterDirLastBuildTs = now;
  return _masterDirectoryCache;
}

function searchEmployeeDirectory(query, limit = 10) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return [];
  const all = buildMasterEmployeeDirectory();
  const scored = [];
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!isListedEmployeeId(e.id)) continue;
    if (getAppMode() !== 'incharge' && !isAdminLoggedIn() && e.type === 'EXEC') continue;
    const idU = e.id.toUpperCase();
    const nameU = String(e.name || '').toUpperCase();
    const areaU = String(e.area || '').toUpperCase();
    const subU = String(e.sub || '').toUpperCase();
    const desigU = String(e.designation || '').toUpperCase();

    let score = 0;
    if (idU === q) score = 1000;
    else if (idU.startsWith(q)) score = 800;
    else if (idU.includes(q)) score = 650;
    else if (nameU.startsWith(q)) score = 600;
    else if (nameU.includes(q)) score = 480;
    else if (subU && subU.includes(q)) score = 350;
    else if (areaU.includes(q)) score = 260;
    else if (desigU.includes(q)) score = 200;

    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => (b.score - a.score) || a.e.id.localeCompare(b.e.id));
  return scored.slice(0, limit).map(x => x.e);
}


let _activeSuggestMenu = null;
let _activeSuggestInput = null;

function closeAllEmpSuggestMenus() {
  document.querySelectorAll('.emp-suggest-menu.open').forEach(m => m.classList.remove('open'));
  _activeSuggestMenu = null;
}

function attachEmployeeAutocompleteToInput(inputEl, onSelectCallback) {
  if (!inputEl || inputEl._empSuggestWired) return;
  inputEl._empSuggestWired = true;

  const parent = inputEl.parentElement;
  if (!parent) return;
  if (getComputedStyle(parent).position === 'static') {
    parent.classList.add('emp-suggest-host');
  }

  const menu = document.createElement('div');
  menu.className = 'emp-suggest-menu';
  parent.appendChild(menu);

  const renderSuggestions = () => {
    const rawVal = inputEl.value || '';
    const q = rawVal.trim();
    if (q.length < 1) {
      menu.classList.remove('open');
      return;
    }
    const matches = searchEmployeeDirectory(q, 10);
    if (!matches.length) {
      menu.classList.remove('open');
      return;
    }
    const areaShort = (a) => a === 'Packing Hall' ? 'Packing' : a === 'Solid Production' ? 'Solid' : a === 'Softgel Production' ? 'SG' : a === OVERALL_AREA ? 'Executives' : (a || 'RPPF');
    menu.innerHTML = `<div class="emp-suggest-header">
      <span>Matching Employees (${matches.length})</span>
      <span>Tap to select</span>
    </div>` + matches.map(emp => {
      const dispName = (emp.name && emp.name !== emp.id) ? emp.name : 'Listed Employee';
      const subBadge = emp.sub ? `<span class="emp-suggest-tag sub-tag">${esc(emp.sub)}</span>` : '';
      const areaBadge = emp.area ? `<span class="emp-suggest-tag">${esc(areaShort(emp.area))}</span>` : '';
      const desigBadge = emp.designation ? `<span class="emp-suggest-tag">${esc(emp.designation)}</span>` : '';
      const rightStat = emp.totalDuty > 0 ? `Duty: ${emp.totalDuty}h<br><span style="color:var(--muted);font-weight:600;">OT: ${emp.otHours || 0}h</span>` : `<span style="color:var(--muted);">Select</span>`;
      return `<div class="emp-suggest-item" data-emp-id="${esc(emp.id)}" data-emp-name="${esc(emp.name || emp.id)}">
        <div class="emp-suggest-left">
          <div class="emp-suggest-name">
            <span class="emp-suggest-id-pill">${esc(emp.id)}</span>
            <span class="emp-suggest-label">${esc(dispName)}</span>
          </div>
          <div class="emp-suggest-meta">${areaBadge}${subBadge}${desigBadge}</div>
        </div>
        <div class="emp-suggest-right">${rightStat}</div>
      </div>`;
    }).join('');

    menu.querySelectorAll('.emp-suggest-item').forEach(item => {
      item.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        const chosenId = item.getAttribute('data-emp-id');
        inputEl.value = chosenId;
        menu.classList.remove('open');
        if (typeof onSelectCallback === 'function') {
          onSelectCallback(chosenId, item.getAttribute('data-emp-name'));
        } else {
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      item.addEventListener('touchstart', (ev) => {
        ev.stopPropagation();
      }, { passive: true });
      item.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const chosenId = item.getAttribute('data-emp-id');
        inputEl.value = chosenId;
        menu.classList.remove('open');
        if (typeof onSelectCallback === 'function') {
          onSelectCallback(chosenId, item.getAttribute('data-emp-name'));
        } else {
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    closeAllEmpSuggestMenus();
    menu.classList.add('open');
    _activeSuggestMenu = menu;
    _activeSuggestInput = inputEl;
  };

  inputEl.addEventListener('input', renderSuggestions);
  inputEl.addEventListener('focus', () => {
    if ((inputEl.value || '').trim().length >= 1) renderSuggestions();
  });
}

function wireAllAutocompleteSearchInputs() {
  attachEmployeeAutocompleteToInput(_el('employeeId'), (id) => {
    toggleClearIdBtn();
    findReport();
  });
  attachEmployeeAutocompleteToInput(_el('lbQuickSearchInput'), (id) => {
    viewEmployeeFromLeaderboard(id);
  });
  attachEmployeeAutocompleteToInput(_el('iccSearchInput'), () => {
    renderIccDrillList();
  });
  attachEmployeeAutocompleteToInput(_el('lbModalSearchInput'), () => {
    filterLbModalList();
  });
  attachEmployeeAutocompleteToInput(_el('reportQuickIdInput'), () => {
    searchFromReportPage();
  });
  attachEmployeeAutocompleteToInput(_el('regEmpIdInput'), () => {
    onRegEmpIdInputChange();
  });
  attachEmployeeAutocompleteToInput(_el('settingsNewIdInput'));
  attachEmployeeAutocompleteToInput(_el('qmAbsentEmpInput'));
  attachEmployeeAutocompleteToInput(_el('admAbsentSingleInp'));
  attachEmployeeAutocompleteToInput(_el('admFilterIdsInput'), () => {
    if (typeof renderAdminAreaPreview === 'function') renderAdminAreaPreview();
  });
  attachEmployeeAutocompleteToInput(_el('admTeamId'));

  document.querySelectorAll('#vsInputsGrid input.vs-emp-id-input').forEach(inp => {
    attachEmployeeAutocompleteToInput(inp);
  });
}

const _prevRenderExtraVsSlots = renderExtraVsSlots;
renderExtraVsSlots = function() {
  _prevRenderExtraVsSlots();
  setTimeout(wireAllAutocompleteSearchInputs, 30);
};

document.addEventListener('click', (e) => {
  if (_activeSuggestMenu && !e.target.closest('.emp-suggest-menu') && e.target !== _activeSuggestInput) {
    closeAllEmpSuggestMenus();
  }
});

/* ==========================================================================
   NATIVE HTML5 CANVAS 2D REPORT PNG & VS COMPARISON PNG GENERATOR
   (100% Reliable Offline & Mobile — Fixes html2canvas PNG Download Failure)
   ========================================================================== */
async function generateWorkLogCanvas2D(ctx) {
  await ensurePayslipFonts();
  const e = ctx.emp || {};
  const { rows, y, m } = _rptRows(ctx);
  const sum = [0, 0, 0, 0, 0, 0];
  let present = 0, nights = 0, issues = 0, offAfterNight = 0;
  rows.forEach(r => {
    r.v.forEach((x, i) => sum[i] += x);
    if (r.inn || r.out) present++;
    if (r.night) nights++;
    if (r.afterNight) offAfterNight++;
    if (r.tone === 'bad') issues++;
  });

  const displayRows = _rptHideEmptyDays
    ? rows.filter(r => r.inn || r.out || r.tone === 'bad' || r.v.some(x => x > 0) || r.night)
    : rows;

  const W = 1440;
  const PAD = 36;
  const TABLE_W = W - PAD * 2;
  const HEADER_H = 152;
  const TABLE_HEAD_H = 54;
  const ROW_H = 38;
  const FOOT_H = 44;
  const BOTTOM_NOTE_H = 86;
  const H = HEADER_H + TABLE_HEAD_H + (displayRows.length * ROW_H) + FOOT_H + BOTTOM_NOTE_H;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.textBaseline = 'middle';

  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, W, H);

  g.fillStyle = '#0F172A';
  g.fillRect(PAD, 24, TABLE_W, 4);

  g.fillStyle = '#0F172A';
  g.font = `900 32px ${PAY_FONT}`;
  g.textAlign = 'left';
  g.fillText('RPPF — Monthly Work Log', PAD, 54);

  const subTitle = `${_RMON[m - 1]} ${y}${_rptHideEmptyDays ? ' (Duty Days Only)' : ' (Full Month)'}`;
  g.fillStyle = '#475569';
  g.font = `700 20px ${PAY_FONT}`;
  g.fillText(subTitle, PAD, 86);

  g.textAlign = 'right';
  g.fillStyle = '#0F172A';
  g.font = `800 26px ${PAY_FONT}`;
  g.fillText(`${ctx.id} — ${e.name || ctx.id}`, W - PAD, 54);

  const metaLine = [e.grade, e.area === OVERALL_AREA ? 'Executives' : e.area, getEmpMeta(ctx.id).sub].filter(Boolean).join('  •  ');
  g.fillStyle = '#475569';
  g.font = `700 18px ${PAY_FONT}`;
  g.fillText(metaLine || 'RPPF Production', W - PAD, 86);

  const totalOt = Math.round((sum[1] + sum[3] + sum[5]) * 100) / 100;
  const pills = [
    { text: `Present: ${present}d`, fg: '#1D4ED8', bg: '#DBEAFE' },
    { text: `Total OT: ${totalOt}h`, fg: '#15803D', bg: '#DCFCE7' },
    { text: `Night: ${nights}`, fg: '#6D28D9', bg: '#EDE9FE' }
  ];
  if (offAfterNight > 0) pills.push({ text: `Day off after night: ${offAfterNight}`, fg: '#4338CA', bg: '#E0E7FF' });
  pills.push({
    text: issues > 0 ? `Punch Fix: ${issues}d` : 'Punch OK',
    fg: issues > 0 ? '#B91C1C' : '#15803D',
    bg: issues > 0 ? '#FEE2E2' : '#DCFCE7'
  });

  let pillX = PAD;
  const pillY = 110;
  g.font = `800 17px ${PAY_FONT}`;
  g.textAlign = 'left';
  pills.forEach(p => {
    const tw = g.measureText(p.text).width;
    const pw = tw + 24;
    g.fillStyle = p.bg;
    _rr(g, pillX, pillY, pw, 30, 15);
    g.fill();
    g.fillStyle = p.fg;
    g.fillText(p.text, pillX + 12, pillY + 15);
    pillX += pw + 10;
  });

  const cols = [
    { label1: 'Date / Day', w: 0.135, align: 'left' },
    { label1: 'In Time', w: 0.085, align: 'center' },
    { label1: 'Out Time', w: 0.085, align: 'center' },
    { label1: 'Reg Duty', w: 0.078, align: 'center' },
    { label1: 'Reg OT', w: 0.068, align: 'center' },
    { label1: 'DO Duty', w: 0.078, align: 'center' },
    { label1: 'DO OT', w: 0.068, align: 'center' },
    { label1: 'Hol Duty', w: 0.078, align: 'center' },
    { label1: 'Hol OT', w: 0.068, align: 'center' },
    { label1: 'Night', w: 0.062, align: 'center' },
    { label1: 'Status / Remark', w: 0.195, align: 'left' }
  ];

  let curY = HEADER_H;
  g.fillStyle = '#0F172A';
  g.fillRect(PAD, curY, TABLE_W, TABLE_HEAD_H);

  let colX = PAD;
  cols.forEach(c => {
    const cw = Math.round(c.w * TABLE_W);
    c._x = colX;
    c._w = cw;
    g.fillStyle = '#FFFFFF';
    g.font = `800 16px ${PAY_FONT}`;
    g.textAlign = 'center';
    g.fillText(c.label1, colX + cw / 2, curY + TABLE_HEAD_H / 2);
    g.strokeStyle = '#334155';
    g.lineWidth = 1;
    g.strokeRect(colX, curY, cw, TABLE_HEAD_H);
    colX += cw;
  });
  curY += TABLE_HEAD_H;

  const BG_MAP = { bad: '#FECACA', hol: '#FFF6E6', do: '#F3EFFC', none: '#F8FAFC', off: '#F1F5F9', offn: '#EEF2FF' };
  const fmtTime = (t) => String(t || '').replace(/^(\d{2}:\d{2}):\d{2}$/, '$1');

  displayRows.forEach(r => {
    const bg = BG_MAP[r.tone] || '#FFFFFF';
    g.fillStyle = bg;
    g.fillRect(PAD, curY, TABLE_W, ROW_H);

    const isBad = r.tone === 'bad';
    const isMuted = r.tone === 'none' || r.tone === 'off' || r.tone === 'offn';
    const baseFg = isBad ? '#B91C1C' : (isMuted ? '#64748B' : '#0F172A');

    const c0 = cols[0];
    g.font = `800 16px ${PAY_FONT}`;
    g.fillStyle = baseFg;
    g.textAlign = 'left';
    g.fillText(r.date, c0._x + 10, curY + ROW_H / 2);
    g.font = `700 15px ${PAY_FONT}`;
    g.fillStyle = isBad ? '#B91C1C' : ((r.day === 'Thu' || r.day === 'Fri') ? '#DC2626' : '#475569');
    g.textAlign = 'right';
    g.fillText(r.day, c0._x + c0._w - 10, curY + ROW_H / 2);

    [[r.inn, r.missIn, cols[1]], [r.out, r.missOut, cols[2]]].forEach(([val, miss, col]) => {
      if (miss) {
        g.fillStyle = '#F87171';
        g.fillRect(col._x + 1, curY + 1, col._w - 2, ROW_H - 2);
        g.fillStyle = '#7F1D1D';
        g.font = `800 15px ${PAY_FONT}`;
        g.textAlign = 'center';
        g.fillText('MISS', col._x + col._w / 2, curY + ROW_H / 2);
      } else {
        g.fillStyle = baseFg;
        g.font = `600 15.5px ${PAY_FONT}`;
        g.textAlign = 'center';
        g.fillText(fmtTime(val), col._x + col._w / 2, curY + ROW_H / 2);
      }
    });

    for (let i = 0; i < 6; i++) {
      const col = cols[3 + i];
      const v = r.v[i];
      const txt = _rN(v);
      if (txt) {
        g.fillStyle = '#0F172A';
        g.font = `700 16px ${PAY_FONT}`;
        g.textAlign = 'center';
        g.fillText(txt, col._x + col._w / 2, curY + ROW_H / 2);
      }
    }

    const c9 = cols[9];
    if (r.night) {
      g.fillStyle = '#6D28D9';
      g.font = `800 15.5px ${PAY_FONT}`;
      g.textAlign = 'center';
      g.fillText('Yes', c9._x + c9._w / 2, curY + ROW_H / 2);
    }

    const c10 = cols[10];
    if (r.note) {
      g.fillStyle = isBad ? '#B91C1C' : '#334155';
      g.font = `${isBad ? 800 : 600} 15px ${PAY_FONT}`;
      g.textAlign = 'left';
      g.fillText(String(r.note).slice(0, 32), c10._x + 10, curY + ROW_H / 2);
    }

    cols.forEach(c => {
      g.strokeStyle = '#CBD5E1';
      g.lineWidth = 1;
      g.strokeRect(c._x, curY, c._w, ROW_H);
    });

    curY += ROW_H;
  });

  g.fillStyle = '#0F172A';
  g.fillRect(PAD, curY, TABLE_W, FOOT_H);
  g.fillStyle = '#FFFFFF';
  g.font = `800 16.5px ${PAY_FONT}`;
  g.textAlign = 'left';
  g.fillText(`Total (${present}d present)`, PAD + 12, curY + FOOT_H / 2);

  for (let i = 0; i < 6; i++) {
    const col = cols[3 + i];
    const txt = _rN(sum[i]);
    g.textAlign = 'center';
    g.fillText(txt || '0', col._x + col._w / 2, curY + FOOT_H / 2);
  }
  if (nights > 0) {
    const c9 = cols[9];
    g.textAlign = 'center';
    g.fillText(String(nights), c9._x + c9._w / 2, curY + FOOT_H / 2);
  }
  curY += FOOT_H;

  const issueDates = rows.filter(r => r.tone === 'bad').map(r => r.date);
  g.textAlign = 'left';
  g.font = `800 18px ${PAY_FONT}`;
  g.fillStyle = issues > 0 ? '#B91C1C' : '#15803D';
  g.fillText(
    issues > 0 ? `Punch problem on ${issues} day(s): ${issueDates.join(', ')}` : 'All In/Out punches verified OK in this report.',
    PAD,
    curY + 28
  );

  g.font = `600 15px ${PAY_FONT}`;
  g.fillStyle = '#64748B';
  g.fillText(`Generated from RPPF Overtime Report App  •  ${new Date().toLocaleDateString('en-GB')}`, PAD, curY + 58);

  return canvas;
}

downloadReportPNG = async function(share) {
  const ctx = window._rptCtx;
  if (!ctx || !ctx.emp) {
    showToast('Search a report first', 'warn');
    return;
  }
  const btns = ['pngDlBtn', 'pngShareBtn'].map(i => _el(i)).filter(Boolean);
  btns.forEach(b => b.disabled = true);
  showToast(share ? 'Preparing report image...' : 'Creating PNG...', 'info');
  try {
    const canvas = await generateWorkLogCanvas2D(ctx);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas blob failed')), 'image/png');
    });
    const { y, m } = _rptRows(ctx);
    const name = `WorkLog_${ctx.id}_${y}-${String(m).padStart(2, '0')}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        showToast('Report shared', 'success');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('Report PNG downloaded!', 'success');
  } catch (err) {
    console.error('PNG generation error:', err);
    showToast('Could not create PNG: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    btns.forEach(b => b.disabled = false);
  }
};

const _origDownloadVsPNG = downloadVsComparisonPNG;
downloadVsComparisonPNG = async function(share = false) {
  const target = _el('vsExportTarget');
  if (!target) return;
  try {
    showToast(share ? 'Preparing comparison image...' : 'Downloading comparison PNG...', 'info');
    const table = target.querySelector('table.compare-table');
    if (!table) return _origDownloadVsPNG(share);
    await ensurePayslipFonts();
    const trs = Array.from(table.querySelectorAll('tr')).filter(tr => !tr.classList.contains('vs-money-row') && tr.style.display !== 'none');
    const colCount = Math.max(2, trs[0] ? trs[0].children.length : 2);
    const W = Math.max(960, colCount * 260);
    const PAD = 40;
    const ROW_H = 54;
    const H = 150 + trs.length * ROW_H + 90;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#F8FAFC';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1E3A8A';
    g.fillRect(0, 0, W, 96);
    g.fillStyle = '#FFFFFF';
    g.font = `800 30px ${PAY_FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(`RPPF — VS Overtime Comparison (${currentMonth || getCurrentMonth()})`, PAD, 48);

    const tableW = W - PAD * 2;
    const firstColW = Math.round(tableW * 0.28);
    const otherColW = Math.floor((tableW - firstColW) / Math.max(1, colCount - 1));
    let curY = 120;

    trs.forEach((tr, rIdx) => {
      const isHead = rIdx === 0;
      const isTotal = tr.classList.contains('total-row');
      g.fillStyle = isHead ? '#0F172A' : isTotal ? '#DCFCE7' : (rIdx % 2 === 0 ? '#FFFFFF' : '#F1F5F9');
      g.fillRect(PAD, curY, tableW, ROW_H);
      const cells = Array.from(tr.children);
      let cx = PAD;
      cells.forEach((td, cIdx) => {
        const cw = cIdx === 0 ? firstColW : otherColW;
        const txt = String(td.innerText || td.textContent || '').replace(/\s+/g, ' ').trim();
        g.fillStyle = isHead ? '#FFFFFF' : isTotal ? '#15803D' : (td.classList.contains('win-cell') ? '#1D4ED8' : '#0F172A');
        g.font = `${(isHead || isTotal || td.classList.contains('win-cell')) ? 800 : 600} 18px ${PAY_FONT}`;
        g.textAlign = cIdx === 0 ? 'left' : 'right';
        g.fillText(txt.slice(0, 32), cIdx === 0 ? cx + 14 : cx + cw - 14, curY + ROW_H / 2);
        g.strokeStyle = '#CBD5E1';
        g.strokeRect(cx, curY, cw, ROW_H);
        cx += cw;
      });
      curY += ROW_H;
    });

    const diffEl = target.querySelector('.compare-diff');
    if (diffEl) {
      g.fillStyle = '#0F172A';
      g.font = `800 20px ${PAY_FONT}`;
      g.textAlign = 'center';
      g.fillText(diffEl.innerText.trim(), W / 2, curY + 42);
    }

    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const fname = `VS_Compare_${currentMonth || getCurrentMonth()}.png`;
    const file = new File([blob], fname, { type: 'image/png' });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: fname });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('VS comparison PNG downloaded!', 'success');
  } catch (e) {
    if (e && e.name !== 'AbortError') showToast('Could not export image', 'error');
  }
};

/* ==========================================================================
   STARTUP & MODE ROUTING OVERRIDES
   (In-Charge Mode opens Home Overview by default instead of jumping to Ranking)
   ========================================================================== */
const _prevSyncPrivilegedUI = syncPrivilegedUI;
syncPrivilegedUI = function() {
  _prevSyncPrivilegedUI();
  const isInc = getAppMode() === 'incharge';
  document.body.classList.toggle('incharge-mode-active', isInc);
  if (isInc) {
    renderInchargeHomeOverview();
  }
};

initAppModeOnStartup = function() {
  ensureDefaultSubsections();
  updateModeUI();
  wireAllAutocompleteSearchInputs();
  loadAbsentStore().then(() => {
    renderInchargeHomeAbsentList();
    if (typeof renderAdminAbsentPane === 'function') renderAdminAbsentPane();
  });
  const mode = getAppMode();
  const myId = getPreferredId();
  if (mode === 'incharge') {
    switchPage('search');
    renderInchargeHomeOverview();
    startLeaderboardScan(false);
  } else if (mode === 'employee' && myId) {
    const inp = _el('employeeId');
    if (inp) { inp.value = myId; toggleClearIdBtn(); }
    setTimeout(() => { findReport(); }, 100);
  } else {
    setTimeout(() => { openModeSetupModal('employee'); }, 350);
  }
};

const _prevSaveInchargeModeSetup = saveInchargeModeSetup;
saveInchargeModeSetup = function() {
  _prevSaveInchargeModeSetup();
  if (getAppMode() === 'incharge') {
    switchPage('search');
    renderInchargeHomeOverview();
  }
};

const _prevSaveEmployeeModeSetup = saveEmployeeModeSetup;
saveEmployeeModeSetup = function() {
  const inp = _el('regEmpIdInput');
  const raw = String(inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
  const spec = getSpecialRoleSpec(raw);
  _prevSaveEmployeeModeSetup();
  if (spec && getAppMode() === 'incharge') {
    resetAll();
    switchPage('search');
    renderInchargeHomeOverview();
    startLeaderboardScan(false);
  }
};

_el('yearSelect')?.addEventListener('change', () => {
  if (getAppMode() === 'incharge' && !document.body.classList.contains('has-result')) {
    renderInchargeHomeOverview();
  }
});
_el('monthSelect')?.addEventListener('change', () => {
  if (getAppMode() === 'incharge' && !document.body.classList.contains('has-result')) {
    renderInchargeHomeOverview();
  }
});

if (typeof switchAdminTab === 'function') {
  const _origSwitchAdminTab = switchAdminTab;
  switchAdminTab = function(tab) {
    _origSwitchAdminTab(tab);
    const absBtn = _el('admTabBtnAbsent');
    const absPane = _el('admPaneAbsent');
    if (absBtn) absBtn.classList.toggle('active', tab === 'absent');
    if (absPane) absPane.classList.toggle('active', tab === 'absent');
    if (tab === 'absent') {
      loadAbsentStore().then(() => renderAdminAbsentPane());
      setTimeout(wireAllAutocompleteSearchInputs, 50);
    }
  };
}

/* Startup runs last, after every top-level declaration and override above has been evaluated. */
initAppModeOnStartup();


/* ===== Daily Automated Empress JSON Auto-Load Module ===== */
async function autoLoad() {
  try {
    const r = await fetch('data/latest.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (!j || !j.month) return;
    console.log('[AutoLoad] Latest month data found:', j.month, 'Updated:', j.updatedAt);

    const list = Array.isArray(j.employees) ? j.employees : [];
    if (list.length > 0) {
      await loadAreaMap();
      const normalized = list.map(e => ({
        ...e,
        id: String(e.id || '').toUpperCase().trim(),
        isRppf: e.isRppf !== false,
        area: (typeof AREA_MAP !== 'undefined' && AREA_MAP && AREA_MAP[String(e.id || '').toUpperCase().trim()]) ? AREA_MAP[String(e.id || '').toUpperCase().trim()] : (e.area && e.area !== 'Not on the list' ? e.area : ((e.isRppf !== false) ? getAreaForId(e.id, true) : (e.area || 'Other facility')))
      }));
      normalized.forEach(applyTypeOverride);
      normalized.forEach(e => { getEmpOtDays(e); });
      monthIndexMemoryCache[j.month] = normalized;

      // Persist slim data (strip daily) to prevent QuotaExceededError in mobile localStorage
      try {
        const slim = normalized.map(e => {
          if (!Array.isArray(e.activeDayNums) && Array.isArray(e.daily) && e.daily.length > 0) _buildEmpDayMap(e);
          didEmpWorkNightOnLastDay(e, j.month);
          const c = { ...e };
          delete c.daily;
          return c;
        });
        localStorage.setItem(MONTH_DATA_CACHE_PREFIX + j.month, JSON.stringify({ ts: Date.now(), employees: slim }));
      } catch (e) {
        console.warn('[AutoLoad] Cache store quota exceeded or failed:', e);
      }

      // Update dropdowns to the latest month if available (unless arriving on a deep-linked report)
      const hasRouteReport = typeof window !== 'undefined' && window.location && window.location.hash && window.location.hash.includes('id=');
      if (!hasRouteReport) {
        const [y, m] = j.month.split('-');
        const ySel = document.getElementById('yearSelect');
        const mSel = document.getElementById('monthSelect');
        if (ySel && mSel) {
          if (![...ySel.options].some(o => o.value === y)) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = bn(y);
            ySel.appendChild(opt);
          }
          ySel.value = y;
          mSel.value = m;
        }

        const lbY = document.getElementById('lbYearSelect');
        const lbM = document.getElementById('lbMonthSelect');
        if (lbY && lbM) {
          // If the latest month is early in the month (e.g. <= 7 days active), default leaderboard to the previous complete month
          let targetLbY = y, targetLbM = m;
          const dsMeta = typeof getMonthDatasetMeta === 'function' ? getMonthDatasetMeta(j.month) : null;
          const maxDay = dsMeta ? (dsMeta.maxActiveDay || 0) : 0;
          if (maxDay > 0 && maxDay <= 7 && typeof getPreviousMonthStrings === 'function') {
            const prevMonths = getPreviousMonthStrings(j.month, 2);
            if (prevMonths.length >= 2 && prevMonths[1]) {
              const [py, pm] = prevMonths[1].split('-');
              targetLbY = py; targetLbM = pm;
            }
          }
          if (![...lbY.options].some(o => o.value === targetLbY)) {
            const opt = document.createElement('option');
            opt.value = targetLbY; opt.textContent = bn(targetLbY);
            lbY.appendChild(opt);
          }
          lbY.value = targetLbY;
          lbM.value = targetLbM;
        }
      }

      // Automatically refresh active views with the latest data
      const curMode = getAppMode();
      const prefId = getPreferredId();
      if (curMode === 'incharge') {
        renderInchargeHomeOverview();
        if (typeof currentSideDrawerPage !== 'undefined' && currentSideDrawerPage === 'leaderboard') {
          startLeaderboardScan(false);
        }
      } else if (!hasRouteReport && prefId && !document.body.classList.contains('has-result')) {
        const empInp = document.getElementById('employeeId');
        if (empInp && !empInp.value) {
          empInp.value = prefId;
          toggleClearIdBtn();
        }
        findReport();
      } else if (!hasRouteReport && document.body.classList.contains('has-result') && currentSearchId) {
        findReport();
      }
    }
  } catch (e) {
    console.warn('[AutoLoad] Auto-load failed:', e);
  }
}

autoLoad();
if (window.Router && typeof window.Router.init === "function") window.Router.init();


function getActiveLongTermLeaves() {
  if (ABSENT_STORE && Array.isArray(ABSENT_STORE.longTermLeaves) && ABSENT_STORE.longTermLeaves.length > 0) {
    return ABSENT_STORE.longTermLeaves;
  }
  if (typeof AREA_DATA !== 'undefined' && Array.isArray(AREA_DATA?.longTermLeaves)) {
    return AREA_DATA.longTermLeaves;
  }
  return [];
}

function isEmployeeOnApprovedLeave(empId, targetDateStr) {
  const dt = targetDateStr || getTodayDateStr();
  const uId = String(empId || '').trim().toUpperCase();
  if (!uId) return null;
  const list = getActiveLongTermLeaves();
  for (const item of list) {
    if (String(item.id || '').trim().toUpperCase() === uId) {
      if ((!item.startDate || item.startDate <= dt) && (!item.endDate || item.endDate >= dt)) {
        return item;
      }
    }
  }
  return null;
}
