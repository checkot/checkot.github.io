/* ==========================================================================
   ADMIN-CORE.JS - Core Admin State, Auth, Tab Switching & Area Directory
   ========================================================================== */

/* Proper definitions of persistAreaMap, persistAreaDetails, persistAreaSubs (Rule 4) */
function persistAreaMap() { try { saveAreaCache(); } catch (e) {} }
function persistAreaDetails() { try { saveAreaCache(); } catch (e) {} }
function persistAreaSubs() { try { saveAreaCache(); } catch (e) {} }
function persistAll() { persistAreaMap(); persistAreaDetails(); persistAreaSubs(); try { if (typeof _masterDirLastBuildTs !== "undefined") _masterDirLastBuildTs = 0; } catch (e) {} }
window.persistAreaMap = persistAreaMap;
window.persistAreaDetails = persistAreaDetails;
window.persistAreaSubs = persistAreaSubs;
window.persistAll = persistAll;

const FALLBACK_LOGO_URI = "data:image/svg+xml;utf8," + encodeURIComponent(
'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2563EB"/><path d="M18 46V18h14c6.6 0 11 4 11 9.8 0 4.5-2.6 7.8-6.8 9L44 46h-8l-6.8-8.4H25V46h-7zm7-14.2h6.2c2.9 0 4.8-1.6 4.8-4s-1.9-4-4.8-4H25v8z" fill="#FFFFFF"/></svg>'
);
function deriveRepoConfig(loc) {
  let owner = "checkot";
  let repo = "checkot.github.io";
  let base = "https://checkot.github.io/";
  try {
    const l = loc || (typeof window !== "undefined" ? (window.__customRepoLocation || window.location) : null);
    if (l) {
      const host = String(l.hostname || l.host || "").toLowerCase();
      const pathname = String(l.pathname || "");
      if (host.endsWith(".github.io")) {
        owner = host.replace(/\.github\.io$/, "");
        const parts = pathname.split("/").filter(Boolean);
        if (parts.length > 0 && !parts[0].includes(".") && parts[0] !== "admin" && parts[0] !== "index") {
          repo = parts[0];
          const origin = l.origin || ("https://" + host);
          base = `${origin}/${repo}/`;
        } else {
          repo = `${owner}.github.io`;
          const origin = l.origin || ("https://" + host);
          base = `${origin}/`;
        }
      }
    }
  } catch (e) {}
  return { owner, repo, base };
}

const _repoCfg = deriveRepoConfig();
var GITHUB_USERNAME = _repoCfg.owner;
var REPO_NAME = _repoCfg.repo;
var REMOTE_BASE_URL = _repoCfg.base;
if (typeof window !== 'undefined') {
  window.GITHUB_USERNAME = GITHUB_USERNAME;
  window.REPO_NAME = REPO_NAME;
  window.REMOTE_BASE_URL = REMOTE_BASE_URL;
  window.deriveRepoConfig = deriveRepoConfig;
}
const STORAGE_NAMESPACE = (typeof REPO_NAME !== 'undefined' && REPO_NAME && REPO_NAME !== 'checkot.github.io') ? `${REPO_NAME}_` : '';
const PLANT_HOLIDAYS_KEY = STORAGE_NAMESPACE + 'rppf_plant_holidays_v1';
const DAYTYPE_OV_KEY = STORAGE_NAMESPACE + 'rppf_daytype_ov_v1';
const ID_ALIAS_KEY = STORAGE_NAMESPACE + 'rppf_id_alias_v1';
const LAST_ADMIN_SYNC_KEY = STORAGE_NAMESPACE + 'rppf_last_admin_sync_ts';
const NOTICES_READ_KEY = STORAGE_NAMESPACE + 'renata_notices_read_v31';
const CLEANUP_KEY = STORAGE_NAMESPACE + 'renata_cleanup_v1';
if (typeof window !== 'undefined') {
  window.STORAGE_NAMESPACE = STORAGE_NAMESPACE;
  window.PLANT_HOLIDAYS_KEY = PLANT_HOLIDAYS_KEY;
  window.DAYTYPE_OV_KEY = DAYTYPE_OV_KEY;
  window.ID_ALIAS_KEY = ID_ALIAS_KEY;
  window.LAST_ADMIN_SYNC_KEY = LAST_ADMIN_SYNC_KEY;
  window.NOTICES_READ_KEY = NOTICES_READ_KEY;
  window.CLEANUP_KEY = CLEANUP_KEY;
}
const ERP_WA = "8801845873227";
function erpWaLink(text, phone) {
const num = String(phone || ERP_WA).replace(/[^0-9]/g, '') || ERP_WA;
return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
const OVERALL_AREA = 'Overall';
const DEFAULT_RATE_TABLE = {
CF:   { otRate: 38, nightRate: 300, holidayType: "hourly", holidayHours: 8, holidayFlat: 304, name: "৳38/hour package (Contractual / CF)" },
JO:   { otRate: 40, nightRate: 400, holidayType: "flat",   holidayHours: 8, holidayFlat: 300, name: "৳40/hour package (JO C–F)" },
JO_B: { otRate: 45, nightRate: 500, holidayType: "flat",   holidayHours: 8, holidayFlat: 350, name: "৳45/hour package (JO A/B)" },
UNSPEC: { otRate: 0, nightRate: 0, holidayType: "flat", holidayHours: 0, holidayFlat: 0, noRate: true, name: "Unspecified (no rate / hours only)" }
};
let RATE_TABLE = JSON.parse(JSON.stringify(DEFAULT_RATE_TABLE));
function isNoRateCat(c) { return Boolean(c && RATE_TABLE[c] && RATE_TABLE[c].noRate); }
const DEFAULT_FALLBACK_AREAS = {
"CF8355": "Solid Production"
};
const DEFAULT_FALLBACK_NOTICES = [
{
id: "n001",
title: "Monthly overtime report and auto calculator",
body: "View the monthly overtime report with your ID. Tell the ERP team if you have any problem with In/Out punch or grade.",
date: "2026-10-15",
priority: "normal"
}
];
const DEFAULT_FALLBACK_TEAM = [
{
name: "Md. Ariful Islam",
designation: "RPPF Production",
id: "RF20850",
area: "Solid Production",
whatsapp: "8801845873227",
photo: "https://checkot.github.io/icon.png"
}
];
const RPPF_FACILITY_REGEX = /RAJENDRAPUR\s*POTENT\s*PRODUCT\s*FACILITY/i;
const RPPF_FALLBACK_AREA = "Packing Hall";
function isRppfText(text) {
if (!text) return false;
return RPPF_FACILITY_REGEX.test(String(text).toUpperCase().replace(/\s+/g, ' '));
}
const CACHE_PREFIX = STORAGE_NAMESPACE + "renata_cache_v32_";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const COMPARE_CACHE_PREFIX = STORAGE_NAMESPACE + "renata_cmp_v32_";
const COMPARE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const HISTORY_KEY = STORAGE_NAMESPACE + "renata_history_v31";
const HISTORY_MAX = 5;
const LEADERBOARD_PREFIX = STORAGE_NAMESPACE + "renata_lb_v33_";
const LEADERBOARD_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MONTH_DATA_CACHE_PREFIX = STORAGE_NAMESPACE + "renata_mdata_v1_";
const NOTICES_CACHE_KEY = STORAGE_NAMESPACE + 'renata_notices_cache_v2';
const TEAM_CACHE_KEY = STORAGE_NAMESPACE + 'renata_team_cache_v2';
const AREA_MAP_CACHE_KEY = STORAGE_NAMESPACE + 'renata_area_map_v1';
const PREFERRED_ID_KEY = STORAGE_NAMESPACE + 'renata_preferred_id_v1';
const SALARY_KEY = STORAGE_NAMESPACE + 'renata_salary_v1';
const OFFLINE_FALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NIGHT_REST_CREDIT_HOURS = 8;
const _monthLastNightCache = {};
const _monthDatasetMetaCache = {};

function _parseEmpDayNo(d) {
if (typeof d === 'number') return Math.floor(d);
const s = String(d == null ? '' : d).trim();
const iso = s.match(/^\d{4}-\d{1,2}-(\d{1,2})$/);
if (iso) return parseInt(iso[1], 10);
return parseInt(s, 10);
}

function getPrevMonthStr(monthStr) {
const m = String(monthStr || '').match(/^(\d{4})-(\d{2})$/);
if (!m) return '';
let y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1;
if (mo < 1) { mo = 12; y -= 1; }
return `${y}-${String(mo).padStart(2, '0')}`;
}

function getNextMonthStr(monthStr) {
const m = String(monthStr || '').match(/^(\d{4})-(\d{2})$/);
if (!m) return '';
let y = parseInt(m[1], 10), mo = parseInt(m[2], 10) + 1;
if (mo > 12) { mo = 1; y += 1; }
return `${y}-${String(mo).padStart(2, '0')}`;
}

function resolveEmpAliasId(rawId) {
let x = String(rawId || '').trim().toUpperCase();
if (!x) return '';
try {
  const raw = localStorage.getItem(ID_ALIAS_KEY);
  if (raw) {
    const a = JSON.parse(raw);
    let n = 0;
    while (a && a[x] && n++ < 5) x = String(a[x]).trim().toUpperCase();
  }
} catch (e) {}
return x;
}

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
  const raw = localStorage.getItem(PLANT_HOLIDAYS_KEY);
  if (raw) {
    const cfg = JSON.parse(raw);
    cancelledHols = (cfg.cancelled || []).map(x => String(x).toUpperCase().trim());
    customHols = (cfg.custom || []).map(x => String(x).toUpperCase().trim());
  }
} catch (e) {}

let dayTypeOv = {};
try {
  const rawOv = localStorage.getItem(DAYTYPE_OV_KEY);
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
  '21-FEB': 'Govt Holiday (21 Feb)',
  '26-MAR': 'Independence Day Holiday',
  '14-APR': 'Pahela Baishakh Holiday',
  '01-MAY': 'May Day Holiday',
  '16-DEC': 'Victory Day Holiday',
  '25-DEC': 'Christmas Holiday',
  '20-OCT-2026': 'Durga Puja Holiday',
  '21-OCT-2026': 'Durga Puja Holiday'
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
let currentSearchId = "";
let currentMonth = "";
let currentToken = 0;
let currentResult = null;
let isScanning = false;
let currentLeaderboardResult = null;
let currentLbTimeMode = 'monthly'; // 'monthly' | '3m' | '6m' | 'alltime'
let teamData = null;
let noticesData = null;
let currentLbListType = null;
let currentLbModalList = [];
let AREA_MAP = {};
let DESIG_RATES = {};   // { designation(lowercase): rateKey }
let AREA_DETAILS = {};  // { ID: { g:"M"|"F", t:"CON"|"JO", s:"Sub-section" } }
let AREA_SUBS = {};     // { "Area Name": ["Sub 1", "Sub 2"] }
let AREA_MAP_LOADED = false;
let activeAdminRateBucket = 'CF';
let pendingErpMessage = '';
let pendingErpArea = '';
let pendingConfirmFn = null;
const monthIndexMemoryCache = {};
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function showSearchError(msg) {
const s = document.getElementById('status');
const help = `Hello, the overtime report for ID ${currentSearchId || ''} (${currentMonth || ''}) cannot be found in the app. Please check.`;
s.innerHTML = `<div class="err-box"><div>${esc(msg)}</div>
<button type="button" class="btn-primary" onclick="openErpSupportModal(${ esc(JSON.stringify(help)) })">Message the ERP team on WhatsApp</button></div>`;
}
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
const APP_MODE_KEY = STORAGE_NAMESPACE + 'renata_app_mode_v2';
const INCHARGE_ROLE_KEY = STORAGE_NAMESPACE + 'renata_incharge_role_v1';
const INCHARGE_AREA_KEY = STORAGE_NAMESPACE + 'renata_incharge_area_v1';
const INCHARGE_PIN_CODE = '2026';
let _memAppMode = null;
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
function getPreferredId() {
try { return (localStorage.getItem(PREFERRED_ID_KEY) || '').trim().toUpperCase() || null; } catch(e) { return null; }
}
function setPreferredId(id) {
try {
if (id) localStorage.setItem(PREFERRED_ID_KEY, String(id).trim().toUpperCase());
else localStorage.removeItem(PREFERRED_ID_KEY);
} catch(e) {}
}
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
function savePermanentIdFromSettings() {
const inp = document.getElementById('settingsNewIdInput');
const raw = (inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
if (!raw) { showToast('Enter a new permanent ID number', 'warn'); if (inp) inp.focus(); return; }
setPreferredId(raw); setAppMode('employee'); if (inp) inp.value = '';
updateModeUI(); showToast(`Permanent ID "${raw}" has been saved`, 'success');
const empInput = document.getElementById('employeeId');
if (empInput) { empInput.value = raw; toggleClearIdBtn(); }
switchPage('search');
findReport();
}
function deletePermanentIdFromSettings() {
const oldId = getPreferredId();
setPreferredId(null); updateModeUI(); resetAll();
showToast(oldId ? `Permanent ID (${oldId}) has been deleted.` : 'Permanent ID has been reset.', 'info');
openModeSetupModal('employee');
}
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
if (greetBox) { greetBox.style.display = 'block'; greetBox.innerHTML = `<div class="greet-text"><span id="greetName">${esc(empName || 'User')}</span>, your calculation is ready</div><div class="greet-sub" id="greetSubText">Check it once against your report.</div>`; }
if (gtLbl) gtLbl.textContent = 'Total overtime you will receive';
if (step7Lbl) step7Lbl.textContent = 'Is your report correct?';
} else if (ctx === 'other') {
if (step3H) step3H.textContent = `${empName || currentSearchId} overtime`;
if (greetBox) { greetBox.style.display = 'block'; greetBox.innerHTML = `<div class="greet-text">Colleague: <span id="greetName">${esc(empName || currentSearchId)}</span> (${esc(currentSearchId)})</div><div class="greet-sub" id="greetSubText">Showing another colleague overtime calculation (your permanent ID: ${esc(myId)})।</div>`; }
if (gtLbl) gtLbl.textContent = `${currentSearchId} total overtime allowance`;
if (step7Lbl) step7Lbl.textContent = `${currentSearchId} report and punch status`;
} else {
if (step3H) step3H.textContent = `Employee overtime (${currentSearchId})`;
if (greetBox) { greetBox.style.display = 'block'; greetBox.innerHTML = `<div class="greet-text">Employee: <span id="greetName">${esc(empName || currentSearchId)}</span> (${esc(currentSearchId)})</div><div class="greet-sub" id="greetSubText">${esc(roleLabel)} review • Area: ${esc(areaName)}</div>`; }
if (gtLbl) gtLbl.textContent = 'Employee total overtime allowance';
if (step7Lbl) step7Lbl.textContent = 'Employee report and punch verification';
}
const payslipCard = document.getElementById('payslipCard');
if (payslipCard) {
if (ctx === 'own') {
payslipCard.style.display = 'block'; payslipCard.classList.add('show');
loadSavedSalary(); updatePayslipPreview();
} else {
payslipCard.style.display = 'none'; payslipCard.classList.remove('show');
}
}
}
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

async function fetchMonthPreIndexedData(month, forceFresh = false) {
if (!forceFresh && monthIndexMemoryCache[month]) return monthIndexMemoryCache[month];
try {
const data = await fetchJsonResource(`data/${month}.json`);
const list = Array.isArray(data) ? data : (Array.isArray(data?.employees) ? data.employees : null);
if (list && list.length > 0) {
await loadAreaMap();
const normalized = list.map(e => {
const obj = {
...e,
id: String(e.id || '').toUpperCase().trim(),
isRppf: e.isRppf !== false,
area: (e.isRppf !== false) ? getAreaForId(e.id, true) : (e.area || 'Other facility')
};
if (Array.isArray(obj.daily) && obj.daily.length > 0) _buildEmpDayMap(obj);
didEmpWorkNightOnLastDay(obj, month);
return obj;
});
normalized.forEach(applyTypeOverride);
monthIndexMemoryCache[month] = normalized;
getMonthDatasetMeta(month);
setTimeout(() => {
try {
// Keep at most 2 recent month caches in localStorage to prevent QuotaExceeded & main-thread freeze
const mKeys = Object.keys(localStorage).filter(k => k.startsWith(MONTH_DATA_CACHE_PREFIX));
if (mKeys.length >= 2) {
mKeys.sort().slice(0, mKeys.length - 1).forEach(k => localStorage.removeItem(k));
}
localStorage.setItem(MONTH_DATA_CACHE_PREFIX + month, JSON.stringify({ ts: Date.now(), employees: normalized }));
} catch (e) {}
}, 80);
return normalized;
}
} catch (e) {
try {
const raw = localStorage.getItem(MONTH_DATA_CACHE_PREFIX + month);
if (raw) {
const parsed = JSON.parse(raw);
if (parsed && Array.isArray(parsed.employees) && (Date.now() - (parsed.ts || 0) < CACHE_TTL_MS)) {
await loadAreaMap();
parsed.employees.forEach(applyTypeOverride);
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
const LEGACY_DESIG_TAIL = /\s+((?:Junior\s+Officer\s+[A-F])|Helper|Casual|(?:Senior\s+)?(?:Deputy\s+|Assistant\s+|Additional\s+|Senior\s+Deputy\s+)?Manager\b.*|(?:Senior\s+)?Officer(?:\s+[A-F])?|Un-?Skilled\s+Worker(?:\s+[IVX]+)?|Skilled\s+Worker(?:\s+[IVX]+)?|Head\s+of\b.*|In-?Charge\b.*|Executive\b.*)$/i;
function repairLegacyEmployee(e) {
if (!/^(production|production department)$/i.test(String(e.grade || '').trim())) return;
const nm = String(e.name || '');
const m = nm.match(LEGACY_DESIG_TAIL);
if (m) { e.grade = m[1].trim(); e.name = nm.slice(0, m.index).trim(); }
}
function desigKey(d) { return String(d == null ? '' : d).replace(/\s+/g, ' ').trim().toLowerCase(); }
function getDefaultRateCat(e) {
const d = detectCategory(e.grade || '', e.id);
return (d.valid && d.category && RATE_TABLE[d.category] && !RATE_TABLE[d.category].noRate) ? d.category : 'UNSPEC';
}
function getRateCategory(e) {
const o = DESIG_RATES[desigKey(e.grade)];
if (o && RATE_TABLE[o]) return { cat: o, src: 'admin' };
return { cat: getDefaultRateCat(e), src: '' };
}
function deriveEmpKind(e) {
if (e.kind) return e.kind;
const id = String(e.id || '').toUpperCase();
if (/^\d{5,8}$/.test(id) || /^CASUAL/i.test(e.grade || '')) return 'CAS';
if (/^RF/.test(id) && !detectCategory(e.grade || '', id).valid) return 'EXEC';
return '';
}
function applyTypeOverride(e) {
if (!e) return e;
repairLegacyEmployee(e);
e.kind = deriveEmpKind(e);
const assigned = Boolean(AREA_MAP && AREA_MAP[e.id]);
const type = assigned ? getEmpMeta(e.id).type : '';
const kindActive = (e.kind === 'CAS' || e.kind === 'EXEC') && assigned && type === e.kind;
const rc = getRateCategory(e);
const active = e.kind === '' || kindActive || rc.cat !== 'UNSPEC';
if (!active) {
e.category = null; e.valid = false; e.rateSource = ''; e.otAmount = 0; e.holidayAmount = 0; e.nightAmount = 0; e.totalEarned = 0;
return e;
}
const r = RATE_TABLE[rc.cat];
const ot = Number(e.otHours) || 0, hc = Number(e.holidayCount) || 0, nc = Number(e.nightCount) || 0;
e.category = rc.cat; e.valid = true; e.rateSource = rc.src;
e.otAmount = Number((ot * r.otRate).toFixed(2));
e.holidayAmount = Number((r.holidayType === 'hourly' ? hc * r.holidayHours * r.otRate : hc * r.holidayFlat).toFixed(2));
e.nightAmount = Number((nc * r.nightRate).toFixed(2));
e.totalEarned = Number((e.otAmount + e.holidayAmount + e.nightAmount).toFixed(2));
return e;
}
function reapplyTypeOverrides() {
Object.keys(monthIndexMemoryCache).forEach(m => (monthIndexMemoryCache[m] || []).forEach(e => { e.area = getAreaForId(e.id, true); applyTypeOverride(e); }));
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
const THEME_KEY = STORAGE_NAMESPACE + 'renata_theme_v1';
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
async function loadAreaMap() {
if (AREA_MAP_LOADED && Object.keys(AREA_MAP).length > 0) return AREA_MAP;
try {
const cachedRaw = localStorage.getItem(AREA_MAP_CACHE_KEY);
if (cachedRaw) {
const parsed = JSON.parse(cachedRaw);
if (parsed && parsed.data && typeof parsed.data === 'object') {
AREA_MAP = parsed.data;
AREA_DETAILS = (parsed.details && typeof parsed.details === 'object') ? parsed.details : {};
AREA_SUBS = (parsed.subs && typeof parsed.subs === 'object') ? parsed.subs : {};
DESIG_RATES = (parsed.rates && typeof parsed.rates === 'object') ? parsed.rates : {};
if (parsed.rateTable && typeof parsed.rateTable === 'object') {
RATE_TABLE = Object.assign(JSON.parse(JSON.stringify(DEFAULT_RATE_TABLE)), parsed.rateTable);
}
}
}
} catch (e) {}
try {
const data = await fetchJsonResource('areas.json');
AREA_MAP = (data && data.areas && typeof data.areas === 'object') ? data.areas : DEFAULT_FALLBACK_AREAS;
AREA_DETAILS = (data && data.details && typeof data.details === 'object') ? data.details : {};
AREA_SUBS = (data && data.subsections && typeof data.subsections === 'object') ? data.subsections : {};
DESIG_RATES = (data && data.designationRates && typeof data.designationRates === 'object') ? data.designationRates : {};
if (data && data.rateTable && typeof data.rateTable === 'object') {
RATE_TABLE = Object.assign(JSON.parse(JSON.stringify(DEFAULT_RATE_TABLE)), data.rateTable);
}
AREA_MAP_LOADED = true;
saveAreaCache();
syncRateDropdownOptions();
updateSettingsAreaCount();
return AREA_MAP;
} catch (e) {
if (!AREA_MAP || Object.keys(AREA_MAP).length === 0) AREA_MAP = DEFAULT_FALLBACK_AREAS;
AREA_MAP_LOADED = true;
syncRateDropdownOptions();
updateSettingsAreaCount();
return AREA_MAP;
}
}
function isMappedAreaId(id) {
if (!id) return false;
const upperId = String(id).toUpperCase().trim();
return Boolean(AREA_MAP && AREA_MAP[upperId]);
}
function saveAreaCache() {
try {
localStorage.setItem(AREA_MAP_CACHE_KEY, JSON.stringify({
ts: Date.now(),
data: AREA_MAP,
details: AREA_DETAILS,
subs: AREA_SUBS,
rates: DESIG_RATES,
rateTable: RATE_TABLE
}));
} catch (e) {}
}
const EMP_TYPE_LABELS = { CON: 'Contractual', JO: 'Junior Officer', CAS: 'Casual', EXEC: 'Executive/Above' };
const GENDER_LABELS = { M: 'Male', F: 'Female' };
function getAutoEmpType(id) {
const u = String(id || '').toUpperCase();
if (u.startsWith('CF')) return 'CON';
if (u.startsWith('RF')) return 'JO';
if (/^\d{5,8}$/.test(u)) return 'CAS';
return '';
}
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
function getEmpMeta(id) {
const u = String(id || '').toUpperCase().trim();
const d = (AREA_DETAILS && AREA_DETAILS[u]) || {};
const cats = Array.isArray(d.c) ? d.c.filter(Boolean) : (typeof d.c === 'string' && d.c ? d.c.split(',').map(x => x.trim()).filter(Boolean) : []);
return { gender: d.g || '', type: d.t || getAutoEmpType(u), sub: d.s || '', cats };
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
function updateSettingsAreaCount() {
const el = document.getElementById('settingsAreaCount');
if (el) el.textContent = 'Active';
}
function initYearDropdown() {
const ySel = document.getElementById('yearSelect');
const now = new Date(); const currYear = now.getFullYear();
const defaultYear = (currYear >= 2020 && currYear <= 2032) ? currYear : 2026;
ySel.innerHTML = '';
for (let y = 2020; y <= 2032; y++) {
const opt = document.createElement('option');
opt.value = String(y);
opt.textContent = bn(y);
if (y === defaultYear) opt.selected = true;
ySel.appendChild(opt);
}
}
function setDefaultMonth() {
const now = new Date(); let year = now.getFullYear(); let month = now.getMonth() + 1;
month -= 1; if (month === 0) { month = 12; year -= 1; }
const yStr = String(year); const mStr = String(month).padStart(2, '0');
const ySel = document.getElementById('yearSelect');
let yearExists = false;
for (const opt of ySel.options) if (opt.value === yStr) { yearExists = true; break; }
if (!yearExists) { const opt = document.createElement('option'); opt.value = yStr; opt.textContent = bn(yStr); ySel.appendChild(opt); }
ySel.value = yStr;
document.getElementById('monthSelect').value = mStr;
}
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
function getCached(month, id) { try { const raw = localStorage.getItem(CACHE_PREFIX + month + "_" + id); if (!raw) return null; const d = JSON.parse(raw); if (Date.now() - d.ts > CACHE_TTL_MS) { localStorage.removeItem(CACHE_PREFIX + month + "_" + id); return null; } return d; } catch (e) { return null; } }
function setCache(month, id, payload) { try { localStorage.setItem(CACHE_PREFIX + month + "_" + id, JSON.stringify({ ts: Date.now(), ...payload })); } catch (e) {} }
function getCompareCache(month, id1, id2) { try { const key = COMPARE_CACHE_PREFIX + month + "_" + id1 + "_" + id2; const raw = localStorage.getItem(key); if (!raw) return null; const d = JSON.parse(raw); if (Date.now() - d.ts > COMPARE_TTL_MS) { localStorage.removeItem(key); return null; } return d; } catch (e) { return null; } }
function setCompareCache(month, id1, id2, payload) { try { localStorage.setItem(COMPARE_CACHE_PREFIX + month + "_" + id1 + "_" + id2, JSON.stringify({ ts: Date.now(), ...payload })); } catch (e) {} }
function getLeaderboardCache(month) { try { const raw = localStorage.getItem(LEADERBOARD_PREFIX + month); if (!raw) return null; const d = JSON.parse(raw); if (Date.now() - d.ts > LEADERBOARD_TTL_MS) { localStorage.removeItem(LEADERBOARD_PREFIX + month); return null; } return d; } catch (e) { return null; } }
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
function getHistory() { try { const raw = localStorage.getItem(HISTORY_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; } }
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
function clearHistory() {
try { localStorage.removeItem(HISTORY_KEY); renderHistory(); renderRecentSearchChips(); showToast("History cleared", "success"); } catch (e) {}
}
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
const list = getHistory();
const uniqueIds = [...new Set(list.map(x => x.id))].slice(0, 4);
if (uniqueIds.length === 0) { wrap.classList.remove('show'); wrap.innerHTML = ''; return; }
wrap.classList.add('show');
wrap.innerHTML = `<span class="recent-chips-label">Previous IDs:</span>` + uniqueIds.map(id => `<button type="button" class="id-chip" onclick="quickSelectId('${esc(id)}')">${esc(id)}</button>`).join('');
}
function quickSelectId(id) {
const inp = document.getElementById('employeeId');
if (!inp) return;
inp.value = id; toggleClearIdBtn(); findReport();
}
function openDrawer() {}
function closeDrawer() {}
const PERMANENT_PAGES = ['search', 'report', 'vs'];
const MORE_PAGES = ['history', 'team', 'settings', 'admin', 'notices'];
let currentPermanentPage = 'search';
let currentSideDrawerPage = null;
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
function switchPage(pageName, forceOpen = false) {
initSideDrawerClasses();
if (pageName !== 'leaderboard' && typeof iccDrillOpen !== 'undefined') iccDrillOpen = false;
if (typeof pushAppNavState === 'function') pushAppNavState(pageName);
document.body.classList.remove('nav-scroll-hidden');
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
const isFullScreenAdv = (pageName === 'admin') || (pageName === 'leaderboard' && typeof iccDrillOpen !== 'undefined' && iccDrillOpen);
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
if (pageName === 'leaderboard') initLeaderboardPage();
if (pageName === 'team') renderTeamPage();
if (pageName === 'notices') renderNoticesPage();
if (pageName === 'settings') { updateSettingsAreaCount(); updateModeUI(); }
if (pageName === 'admin') initAdminPage();
setTimeout(() => {
  adminSelectSectionCard('Solid Production');
  adminScanUnassignedMonthlyEmployees();
}, 60);
});
}
function renderHistory() {
const list = getHistory(); const box = document.getElementById('historyList');
if (list.length === 0) { box.innerHTML = '<div class="empty-msg">Nothing viewed yet. First enter your ID on the "Report" page.</div>'; return; }
box.innerHTML = list.map(h => {
const date = new Date(h.ts);
const timeStr = date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
return `<div class="history-item" data-id="${esc(h.id)}" data-month="${esc(h.month)}" onclick="replayHistory(this.dataset.id, this.dataset.month)">
<div><div class="id">${esc(h.id)}</div><div class="meta">${esc(h.month)}</div></div>
<div class="time">${timeStr}</div>
</div>`;
}).join('');
}
function replayHistory(id, month) {
const [year, mon] = month.split('-');
document.getElementById('yearSelect').value = year;
document.getElementById('monthSelect').value = mon;
document.getElementById('employeeId').value = id;
toggleClearIdBtn();
switchPage('search');
setTimeout(() => findReport(), 200);
}
function backToLeaderboard() {
document.getElementById('backToLbBtn').style.display = "none";
switchPage('leaderboard');
}
function enterCompactMode(empId, month) {
document.getElementById('searchFormCard').style.display = "none";
document.getElementById('welcomeBanner')?.classList.add('hidden-compact');
document.getElementById('quickActionsGrid')?.classList.add('hidden-compact');
document.getElementById('searchSummary').classList.add('show');
document.getElementById('summaryId').textContent = empId;
const [y, m] = month.split('-');
const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const isRppf = currentResult?.isRppf !== false;
const areaStr = isRppf ? getAreaForId(empId, true) : 'Other facility';
document.getElementById('summaryMonth').textContent = monthNames[parseInt(m)-1] + ' ' + y + ' • ' + areaStr;
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
const isOpen = body.classList.contains('show');
if (isOpen) { body.classList.remove('show'); headerEl.classList.remove('expanded'); }
else { body.classList.add('show'); headerEl.classList.add('expanded'); }
}
function updateMonthNavBar(monthStr) {
const bar = document.getElementById('monthNavBar');
const lbl = document.getElementById('monthNavCurrentLabel');
if (!bar || !lbl || !monthStr) return;
const [yy, mm] = String(monthStr).split('-');
const mIdx = (parseInt(mm, 10) || 1) - 1;
lbl.textContent = `${BN_MONTHS[mIdx] || mm} ${bn(yy)} (${monthStr})`;
bar.style.display = 'grid';
}
function navigateReportMonth(delta) {
const ySel = document.getElementById('yearSelect');
const mSel = document.getElementById('monthSelect');
if (!ySel || !mSel) return;
let y = parseInt(ySel.value, 10) || new Date().getFullYear();
let m = parseInt(mSel.value, 10) || 1;
m += delta;
if (m < 1) { m = 12; y -= 1; }
if (m > 12) { m = 1; y += 1; }
if (y < 2020) { y = 2020; m = 1; }
if (y > 2032) { y = 2032; m = 12; }
const yStr = String(y);
const mStr = String(m).padStart(2, '0');
if (![...ySel.options].some(o => o.value === yStr)) {
const opt = document.createElement('option');
opt.value = yStr;
opt.textContent = bn(yStr);
ySel.appendChild(opt);
}
ySel.value = yStr;
mSel.value = mStr;
if (currentSearchId) {
document.getElementById('employeeId').value = currentSearchId;
toggleClearIdBtn();
findReport();
}
}
async function loadNoticesData() {
let cachedData = null; let cachedTs = 0;
try {
const cachedRaw = localStorage.getItem(NOTICES_CACHE_KEY);
if (cachedRaw) { const cached = JSON.parse(cachedRaw); if (Array.isArray(cached.data)) { cachedData = cached.data; cachedTs = cached.ts || 0; } }
} catch (e) { try { localStorage.removeItem(NOTICES_CACHE_KEY); } catch (err) {} }
try {
const data = await fetchJsonResource('notices.json');
noticesData = Array.isArray(data.notices) ? data.notices : DEFAULT_FALLBACK_NOTICES;
try { localStorage.setItem(NOTICES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: noticesData })); } catch (e) {}
return noticesData;
} catch (e) {
const ageMs = Date.now() - cachedTs;
if (cachedData && ageMs < OFFLINE_FALLBACK_MAX_AGE_MS) { noticesData = cachedData; return noticesData; }
noticesData = noticesData || DEFAULT_FALLBACK_NOTICES;
return noticesData;
}
}
async function loadTeamData() {
let cachedData = null; let cachedTs = 0;
try {
const cachedRaw = localStorage.getItem(TEAM_CACHE_KEY);
if (cachedRaw) { const cached = JSON.parse(cachedRaw); if (Array.isArray(cached.data)) { cachedData = cached.data; cachedTs = cached.ts || 0; } }
} catch (e) { try { localStorage.removeItem(TEAM_CACHE_KEY); } catch (err) {} }
try {
const data = await fetchJsonResource('team.json');
teamData = Array.isArray(data.team) ? data.team : DEFAULT_FALLBACK_TEAM;
try { localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: teamData })); } catch (e) {}
return teamData;
} catch (e) {
const ageMs = Date.now() - cachedTs;
if (cachedData && ageMs < OFFLINE_FALLBACK_MAX_AGE_MS) { teamData = cachedData; return teamData; }
teamData = teamData || DEFAULT_FALLBACK_TEAM;
return teamData;
}
}
function getReadNotices() { try { const raw = localStorage.getItem(NOTICES_READ_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; } }
function markAllNoticesRead() { try { localStorage.setItem(NOTICES_READ_KEY, JSON.stringify((noticesData || []).map(n => n.id))); } catch (e) {} updateNoticesBadge(); }
function updateNoticesBadge() {
const badge = document.getElementById('noticesBadge');
if (!badge || !noticesData) return;
const read = getReadNotices();
const unreadCount = noticesData.filter(n => !read.includes(n.id)).length;
if (unreadCount > 0) { badge.style.display = 'inline-block'; badge.textContent = bn(unreadCount); }
else { badge.style.display = 'none'; }
}
function formatNoticeDate(dateStr) { try { const d = new Date(dateStr); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return dateStr; } }
function renderNoticeItem(n) {
const priority = (n.priority || 'normal').toLowerCase();
const priorityClass = priority === 'high' ? 'priority-high' : priority === 'low' ? 'priority-low' : '';
return `<div class="notice-item ${priorityClass}">
<div class="notice-title">${esc(n.title || '—')}</div>
<div class="notice-body">${esc(n.body || '').replace(/\n/g, '<br>')}</div>
<div class="notice-date">${esc(formatNoticeDate(n.date))}</div>
</div>`;
}
async function renderNoticesHome() {
try { loadNoticesData().then(renderNoticeTicker); } catch (e) {}
const box = document.getElementById('noticesHomeList');
if (!box) return;
box.innerHTML = '<div class="empty-msg" style="padding: 14px; font-size: 13px;">Loading...</div>';
const notices = await loadNoticesData();
if (!notices || notices.length === 0) { box.innerHTML = '<div class="empty-msg" style="padding: 14px; font-size: 13px;">There are no notices right now.</div>'; return; }
const recent = notices.slice(0, 3);
box.innerHTML = recent.map(renderNoticeItem).join('');
updateNoticesBadge();
}
async function renderNoticesPage() {
const box = document.getElementById('noticesFullList');
if (!box) return;
box.innerHTML = '<div class="empty-msg" style="padding: 20px;">Loading...</div>';
const notices = await loadNoticesData();
if (!notices || notices.length === 0) { box.innerHTML = '<div class="empty-msg">There are no notices right now.</div>'; return; }
box.innerHTML = notices.map(renderNoticeItem).join('');
markAllNoticesRead();
}
async function renderTeamPage() {
const box = document.getElementById('teamList');
if (!box) return;
box.innerHTML = '<div class="empty-msg" style="padding: 20px;">Loading...</div>';
const team = await loadTeamData();
if (!team || team.length === 0) { box.innerHTML = '<div class="empty-msg">ERP team information is not available right now.</div>'; return; }
box.innerHTML = team.map(m => {
const rawPhoto = m.photo || 'https://checkot.github.io/icon.png';
const photoUrl = rawPhoto === 'icon.png' ? 'https://checkot.github.io/icon.png' : rawPhoto;
return `
<div class="team-member">
<img class="team-photo" src="${esc(photoUrl)}" alt="${esc(m.name || 'Team')}" onerror="this.onerror=null;this.src=FALLBACK_LOGO_URI;">
<div class="team-info">
<div class="team-name">${esc(m.name || '—')}</div>
<div class="team-desig">${esc(m.designation || '—')} ${m.area ? `• <span class="admin-tag">${esc(m.area)}</span>` : ''}</div>
<div class="team-id">ID: ${esc(m.id || '—')}</div>
</div>
<a class="team-wa" href="https://wa.me/${(m.whatsapp || '').replace(/[^0-9]/g,'')}?text=${encodeURIComponent('RPPF Overtime App - Support needed')}" target="_blank" rel="noopener noreferrer" title="WhatsApp">
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 3C8.8 3 3 8.8 3 16c0 2.3 0.6 4.5 1.7 6.4L3 29l6.8-1.8c1.9 1 4 1.6 6.2 1.6 7.2 0 13-5.8 13-13S23.2 3 16 3zm0 23.5c-2 0-3.9-0.5-5.5-1.5l-0.4-0.2-4 1.1 1.1-3.9-0.3-0.4c-1.1-1.7-1.7-3.7-1.7-5.6 0-5.9 4.8-10.7 10.7-10.7s10.7 4.8 10.7 10.7-4.8 10.7-10.7 10.7z"/></svg>
<span>WhatsApp</span>
</a>
</div>`;
}).join('');
}
async function forceRefreshNotices() {
try { localStorage.removeItem(NOTICES_CACHE_KEY); localStorage.removeItem(TEAM_CACHE_KEY); } catch (e) {}
showToast("Updating notices...", "info");
await renderNoticesHome();
if (document.getElementById('page-notices')?.classList.contains('active')) await renderNoticesPage();
}
document.getElementById('employeeId').addEventListener('keydown', e => { if (e.key === 'Enter') findReport(); });
document.getElementById('compareId').addEventListener('keydown', e => { if (e.key === 'Enter') runComparison(); });
document.getElementById('regEmpIdInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveEmployeeModeSetup(); });
document.getElementById('inchargePinInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveInchargeModeSetup(); });
document.getElementById('lbQuickSearchInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchEmployeeFromLbBar(); });
document.getElementById('settingsNewIdInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') savePermanentIdFromSettings(); });
document.getElementById('adminPassInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleAdminLogin(); });
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
function renderInstantEmployeeRecord(emp, month, searchId) {
window._rptCtx = { emp, month, id: searchId };
if (window._rptReset) _rptReset();
applyTypeOverride(emp);
const rc = getRateCategory(emp);
const cat = emp.category || rc.cat || 'JO';
const r = RATE_TABLE[cat] || RATE_TABLE.JO;
const otHours = Number(emp.otHours) || 0;
const holidayCount = Number(emp.holidayCount != null ? emp.holidayCount : emp.holiday) || 0;
const nightCount = Number(emp.nightCount != null ? emp.nightCount : emp.night) || 0;
const otAmount = emp.otAmount != null ? Number(emp.otAmount) : (otHours * r.otRate);
const holidayAmount = emp.holidayAmount != null ? Number(emp.holidayAmount) : (r.holidayType === "hourly" ? holidayCount * r.holidayHours * r.otRate : holidayCount * r.holidayFlat);
const nightAmount = emp.nightAmount != null ? Number(emp.nightAmount) : (nightCount * r.nightRate);
const totalEarned = emp.totalEarned != null ? Number(emp.totalEarned) : (otAmount + holidayAmount + nightAmount);
const isRppf = emp.isRppf !== false;
const valid = emp.valid !== false;
currentResult = {
category: cat,
otHours,
holiday: holidayCount,
night: nightCount,
plainDays: Number(emp.plainDaysCount || emp.plainDays || 0),
otAmount,
holidayAmount,
nightAmount,
totalEarned,
grade: emp.grade || '',
valid,
name: emp.name || '',
isRppf
};
const parsedObj = {
otHours,
nightCount,
holidayCount,
regularDaysCount: Number(emp.regularDaysCount || 0),
plainDaysCount: Number(emp.plainDaysCount || emp.plainDays || 0),
holidayDays: Array.isArray(emp.holidayDays) ? emp.holidayDays : [],
nightDays: Array.isArray(emp.nightDays) ? emp.nightDays : [],
punchProblems: Array.isArray(emp.punchProblems) ? emp.punchProblems : []
};
const detectObj = {
category: valid ? cat : null,
valid,
reason: RATE_TABLE[cat]?.name || cat,
gradeText: emp.grade || cat
};
updateMonthNavBar(month);
applyExtraction(parsedObj, detectObj);
const viewCtx = getReportViewContext(currentSearchId);
const myAmountDiv = document.getElementById('compareMyAmount');
if (myAmountDiv) {
myAmountDiv.style.display = "block";
myAmountDiv.innerText = viewCtx === 'own'
? `Your earnings: ৳ ${currentResult.totalEarned.toFixed(2)}`
: `${currentSearchId} earnings: ৳ ${currentResult.totalEarned.toFixed(2)}`;
}
['step3','step4','step5','step7'].forEach(id => {
const el = document.getElementById(id);
if (el) { el.classList.add('show'); el.style.display = 'block'; }
});
applyReportViewContext(parsedObj, detectObj);
try { syncReportPageBanner(); } catch (e) {}
document.body.classList.add('has-result');
const nc = document.getElementById('noticesCard');
if (nc) nc.style.display = 'block';
addToHistory(searchId, month, emp.name || '');
enterCompactMode(searchId, month);
if (!getPreferredId() && getAppMode() !== 'incharge') {
setPreferredId(searchId);
setAppMode('employee');
}
updateModeUI();
setTimeout(() => { document.getElementById('step3')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
}
async function findReport() {
document.body.classList.remove('has-result');
const year = document.getElementById('yearSelect').value;
const mon = document.getElementById('monthSelect').value;
const month = `${year}-${mon}`;
const rawId = document.getElementById('employeeId').value.trim();
const statusDiv = document.getElementById('status');
const progressDiv = document.getElementById('progress');
const spinner = document.getElementById('spinner');
const searchBtn = document.getElementById('searchBtn');
if (!rawId) { showToast("First enter your ID number", "warn"); document.getElementById('employeeId').focus(); return; }
const searchId = rawId.toUpperCase().replace(/\s+/g, '');
currentSearchId = searchId; currentMonth = month;
_lbView = false;
['viewingContextBanner','monthNavBar','step3','step5','step7','payslipCard'].forEach(id => {
const el = document.getElementById(id);
if (el) { el.style.display = "none"; el.classList.remove('show'); }
});
document.getElementById('compareResult').style.display = "none";
document.getElementById('compareInputArea').style.display = "block";
document.getElementById('compareId').value = "";
document.getElementById('daySummaryGrid').style.display = "none";
['step5Body'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
document.querySelectorAll('.collapse-header').forEach(h => h.classList.remove('expanded'));
currentResult = null;
currentToken++;
const myToken = currentToken;
statusDiv.style.color = "var(--primary-blue)";
statusDiv.innerText = "Verifying data, please wait...";
progressDiv.style.display = "none";
progressDiv.innerText = "";
spinner.style.display = "block";
searchBtn.disabled = true;
try {
await loadAreaMap();
const fastList = await fetchMonthPreIndexedData(month);
if (myToken !== currentToken) return;
if (!fastList || !Array.isArray(fastList) || fastList.length === 0) {
spinner.style.display = "none"; searchBtn.disabled = false;
updateMonthNavBar(month);
showSearchError(`${month} overtime data has not been uploaded to the server yet.`);
return;
}
const matchedEmp = fastList.find(e => String(e.id || '').toUpperCase() === searchId);
if (matchedEmp && isExecHiddenFor(matchedEmp)) {
spinner.style.display = "none"; searchBtn.disabled = false;
showSearchError('This ID calculation is visible only in in-charge mode.');
return;
}
if (matchedEmp) {
spinner.style.display = "none"; searchBtn.disabled = false;
statusDiv.style.color = "var(--success)"; statusDiv.innerText = "Calculation ready";
renderInstantEmployeeRecord(matchedEmp, month, searchId);
return;
}
spinner.style.display = "none"; searchBtn.disabled = false;
updateMonthNavBar(month);
showSearchError(`"${rawId}" ID not found in the ${month} report. Check that the ID and month are correct.`);
} catch (err) {
console.error(err);
spinner.style.display = "none"; searchBtn.disabled = false;
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
if (currentResult && currentResult.name) { greetNameEl.textContent = currentResult.name; greetBox.style.display = "block"; }
else { greetNameEl.textContent = "User"; greetBox.style.display = "block"; }
}
if (detection.gradeText || detection.reason) {
gradeInfo.style.display = "block";
gradeInfo.innerText = `Grade: ${detection.gradeText || "—"} | ${detection.reason} | Area: ${areaName}`;
}
const _nr = Boolean(detection.valid && detection.category && isNoRateCat(detection.category));
document.body.classList.toggle('norate-view', _nr);
calcInputs.classList.toggle('norate', _nr);
if (_nr) {
document.getElementById('inpOtHours').value = parsed.otHours;
document.getElementById('inpHoliday').value = parsed.holidayCount;
document.getElementById('inpNight').value = parsed.nightCount;
categoryBadge.className = "badge"; categoryBadge.innerText = RATE_TABLE[detection.category].name;
calcInputs.style.display = "block";
const gl = document.getElementById('gtLabelText'); if (gl) gl.textContent = 'Hours calculation';
const setT = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };
setT('lblOtFormula', `${parsed.otHours} hours`); setT('lblHolidayFormula', `${parsed.holidayCount} days`); setT('lblNightFormula', `${parsed.nightCount} nights`);
const gi = document.getElementById('gradeInfo'); if (gi) { gi.style.display = 'block'; gi.innerText = `Grade: ${detection.gradeText || '—'} | No fixed rate - only hours and days calculation | Area: ${areaName}`; }
} else if (detection.valid && detection.category) {
document.getElementById('inpCategory').value = detection.category;
document.getElementById('inpOtHours').value = parsed.otHours;
document.getElementById('inpHoliday').value = parsed.holidayCount;
document.getElementById('inpNight').value = parsed.nightCount;
categoryBadge.className = isRppf ? "badge" : "badge facility-warn";
categoryBadge.innerText = isRppf ? RATE_TABLE[detection.category].name : `${RATE_TABLE[detection.category].name} (other facility)`;
calcInputs.style.display = "block"; recalculate();
} else {
document.getElementById('inpCategory').value = "JO";
document.getElementById('inpOtHours').value = 0;
document.getElementById('inpHoliday').value = 0;
document.getElementById('inpNight').value = 0;
categoryBadge.className = "badge warn"; categoryBadge.innerText = "Cannot calculate";
calcInputs.style.display = "none"; recalculate();
}
showDaySummary(parsed);
showHolidayList(parsed.holidayDays);
showNightList(parsed.nightDays);
showRemarks(parsed.punchProblems, detection);
}
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

if (detection.valid && !hasP && rawReqProbs.length === 0) {
box.className = "remarks-box remarks-ok";
box.innerHTML = `${subj}: all In/Out punches are correct.${facilityWarn}`;
} else if (detection.valid && !hasP && rawReqProbs.length > 0) {
box.className = "remarks-box remarks-warn";
box.innerHTML = `${subj}: all In/Out punches are correct, but <b>${rawReqProbs.length} Overtime Requisition(s)</b> are pending.${facilityWarn}${reqWarnHtml}`;
} else if (detection.valid && hasP) {
box.className = "remarks-box remarks-warn";
box.innerHTML = `${subj}: punch missing on <b>${esc(dates)}</b> (${bn(pCount)} days).${facilityWarn}` + waBtn(buildSingleEmployeeErpMessage(dates, 'punch'));
} else if (!detection.valid && !hasP) {
box.className = "remarks-box remarks-error";
box.innerHTML = `${subj}: the grade is outside this calculation, so the amount cannot be shown.${facilityWarn}` + waBtn(buildSingleEmployeeErpMessage('—', 'grade'));
} else {
box.className = "remarks-box remarks-error";
box.innerHTML = `${subj} has two problems:<ul><li>Grade is outside the calculation scope</li><li>Punch missing on ${esc(dates)}</li></ul>${facilityWarn}` + waBtn(buildSingleEmployeeErpMessage(dates, 'both'));
}
}
function recalculate() {
const cat = document.getElementById('inpCategory').value;
const otHours = parseFloat(document.getElementById('inpOtHours').value) || 0;
const holiday = parseInt(document.getElementById('inpHoliday').value) || 0;
const night = parseInt(document.getElementById('inpNight').value) || 0;
const r = RATE_TABLE[cat];
const otAmount = otHours * r.otRate;
let holidayAmount = 0;
if (r.holidayType === "hourly") holidayAmount = holiday * r.holidayHours * r.otRate;
else holidayAmount = holiday * r.holidayFlat;
const nightAmount = night * r.nightRate;
const grandTotal = otAmount + holidayAmount + nightAmount;
document.getElementById('lblRate').innerText = `৳ ${r.otRate}/hr`;
document.getElementById('lblOtAmount').innerText = `৳ ${otAmount.toFixed(2)}`;
document.getElementById('lblHolidayAmount').innerText = `৳ ${holidayAmount.toFixed(2)}`;
document.getElementById('lblNightAmount').innerText = `৳ ${nightAmount.toFixed(2)}`;
document.getElementById('lblGrandTotal').innerText = `৳ ${grandTotal.toFixed(2)}`;
const rateSub = document.getElementById('lblRateSub');
const otSub = document.getElementById('lblOtFormula');
const holSub = document.getElementById('lblHolidayFormula');
const nightSub = document.getElementById('lblNightFormula');
if (rateSub) rateSub.innerText = r.name;
if (otSub) otSub.innerText = `${otHours} hr × ৳${r.otRate}`;
if (holSub) holSub.innerText = r.holidayType === "hourly" ? `${holiday} days × 8 hr × ৳${r.otRate}` : `${holiday} days × ৳${r.holidayFlat}`;
if (nightSub) nightSub.innerText = `${night} nights × ৳${r.nightRate}`;
updatePayslipPreview();
}
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
renderExtraVsSlots();
}
function populateVsMonthSelect() {
const sel = document.getElementById('vsMonthOverrideSelect');
if (!sel) return;
const curM = currentMonth || getCurrentMonth();
const opts = (Array.isArray(availableServerMonths) && availableServerMonths.length > 0) ? [...availableServerMonths] : getPreviousMonthStrings(curM, 6).reverse();
if (!opts.includes(curM)) opts.push(curM);
opts.sort().reverse();
sel.innerHTML = opts.map(ym => `<option value="${esc(ym)}" ${ym === curM ? 'selected' : ''}>${esc(ym)}</option>`).join('');
}
function renderVsQuickPicks() {
const box = document.getElementById('vsQuickPicksRow');
if (!box) return;
const hist = getHistory().map(h => h.id);
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
const ym = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || getCurrentMonth();
if (sub) sub.textContent = `Compare overtime & allowances (${ym})`;
}
function initVsPage() {
const inp1 = document.getElementById('compareId1');
if (inp1 && !inp1.value.trim()) {
inp1.value = currentSearchId || getPreferredId() || '';
}
populateVsMonthSelect();
renderVsQuickPicks();
const sub = document.getElementById('vsPageSub');
const mStr = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || getCurrentMonth();
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
const id1 = (inp1El && inp1El.value.trim() ? inp1El.value.trim() : (currentSearchId || getPreferredId() || '')).toUpperCase().replace(/\s+/g, '');
const id2 = (document.getElementById('compareId')?.value || '').trim().toUpperCase().replace(/\s+/g, '');
if (!id1) { showToast("Enter 1st employee ID number", "warn"); inp1El?.focus(); return; }
if (!id2) { showToast("Enter 2nd employee ID number", "warn"); document.getElementById('compareId')?.focus(); return; }
let ids = [id1, id2];
if (currentVsMode === 3) {
const id3 = (document.getElementById('compareId3')?.value || '').trim().toUpperCase().replace(/\s+/g, '');
if (!id3) { showToast("Enter 3rd employee ID number for 1:1:1 mode", "warn"); document.getElementById('compareId3')?.focus(); return; }
ids.push(id3);
} else if (currentVsMode === 'custom') {
const id3 = (document.getElementById('compareId3')?.value || '').trim().toUpperCase().replace(/\s+/g, '');
if (id3) ids.push(id3);
for (let i = 4; i <= customVsTotalSlots; i++) {
const v = (document.getElementById('compareId' + i)?.value || '').trim().toUpperCase().replace(/\s+/g, '');
if (v) ids.push(v);
}
if (ids.length < 2) { showToast("Enter at least 2 employee IDs to compare", "warn"); return; }
}
if (new Set(ids).size !== ids.length) { showToast("Please enter different ID numbers to compare", "warn"); return; }
const periodMode = document.getElementById('vsPeriodSelect')?.value || 'current';
const month = document.getElementById('vsMonthOverrideSelect')?.value || currentMonth || getCurrentMonth();
compareBtn.disabled = true; resultDiv.style.display = "none";
statusDiv.style.color = "var(--primary-blue)"; statusDiv.innerText = "Verifying data, please wait...";
try {
let fastList = null;
if (periodMode === 'current') {
fastList = await fetchMonthPreIndexedData(month);
} else {
const mList = periodMode === '3m' ? getPreviousMonthStrings(month, 3) : periodMode === '6m' ? getPreviousMonthStrings(month, 6) : getAllTime2026Months(month);
const agg = await aggregateMultiMonthEmployees(mList);
fastList = agg.merged;
}
if (!fastList || !Array.isArray(fastList) || fastList.length === 0) {
statusDiv.style.color = "var(--danger)";
statusDiv.innerText = `${month} data is not available.`;
return;
}
const records = [];
for (const targetId of ids) {
const found = fastList.find(e => String(e.id || '').toUpperCase() === targetId);
if (!found && targetId === currentSearchId && currentResult && periodMode === 'current') {
records.push({
id: targetId,
name: currentResult.name || targetId,
category: currentResult.category,
categoryName: RATE_TABLE[currentResult.category]?.name || currentResult.category,
totalDuty: Number(currentResult.totalDuty || 0),
otHours: Number(currentResult.otHours || 0),
holiday: Number(currentResult.holiday || 0),
night: Number(currentResult.night || 0),
plainDays: Number(currentResult.plainDays || 0),
otAmount: Number(currentResult.otAmount || 0),
holidayAmount: Number(currentResult.holidayAmount || 0),
nightAmount: Number(currentResult.nightAmount || 0),
totalEarned: Number(currentResult.totalEarned || 0),
grade: currentResult.grade || ''
});
continue;
}
if (!found) {
statusDiv.style.color = "var(--danger)";
statusDiv.innerText = `"${targetId}" ID was not found in ${month} data.`;
return;
}
if (isExecHiddenFor(found)) {
showToast(`"${targetId}" calculation is visible only in in-charge mode`, 'warn');
return;
}
records.push(buildCompareRecord(found, targetId));
}
if (records.length === 2 && periodMode === 'current') {
setCompareCache(month, records[0].id, records[1].id, { other: records[1], otherId: records[1].id });
}
showComparison(records[0], records[1], records[1].id, records[2] || null, records);
statusDiv.style.color = "var(--success)"; statusDiv.innerText = "Comparison completed";
} catch (e) {
statusDiv.style.color = "var(--danger)";
statusDiv.innerText = "Problem while comparing: " + e.message;
} finally {
compareBtn.disabled = false;
}
}
function showComparison(mine, other, otherId, third, allRecords) {
const div = document.getElementById('compareResult');
const list = (Array.isArray(allRecords) && allRecords.length >= 2) ? allRecords : (third ? [mine, other, third] : [mine, other]);
const myPref = getPreferredId();
const labelFor = (r) => {
const base = r.id === myPref ? `You (${esc(r.id)})` : esc(r.id);
const nm = r.name && r.name !== r.id ? `<div style="font-size:11px;font-weight:600;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;margin-left:auto;">${esc(r.name)}</div>` : '';
return `<div>${base}</div>${nm}`;
};
const maxVal = (fn) => Math.max(...list.map(fn));
const maxDuty = maxVal(r => r.totalDuty || 0);
const maxOt = maxVal(r => r.otHours || 0);
const maxHol = maxVal(r => r.holiday || 0);
const maxNight = maxVal(r => r.night || 0);
const maxPlain = maxVal(r => r.plainDays || 0);
const maxTotal = maxVal(r => r.totalEarned || 0);
const tdCell = (valStr, numVal, maxNum) => `<td class="${numVal > 0 && numVal === maxNum ? 'win-cell' : ''}">${valStr}</td>`;
let diffText = '';
if (!third) {
const diff = mine.totalEarned - other.totalEarned;
const l1 = mine.id === myPref ? `You (${esc(mine.id)})` : esc(mine.id);
const l2 = other.id === myPref ? `You (${esc(other.id)})` : esc(other.id);
diffText = diff > 0 ? `${l1} received ৳ ${Math.abs(diff).toFixed(2)} more` : diff < 0 ? `${l2} received ৳ ${Math.abs(diff).toFixed(2)} more` : `Both received the same amount`;
} else {
const sorted = [...list].sort((a, b) => b.totalEarned - a.totalEarned);
const top = sorted[0];
const lead = top.totalEarned - sorted[1].totalEarned;
diffText = lead > 0 ? `Top in 1:1:1 is ${esc(top.name || top.id)} (${esc(top.id)}) with ৳ ${top.totalEarned.toFixed(2)} (+৳ ${lead.toFixed(2)} ahead of #2)` : `Tied at the top with ৳ ${top.totalEarned.toFixed(2)}`;
}
div.innerHTML = `
<div id="vsExportTarget">
<div class="compare-table-wrap">
<table class="compare-table">
<tr><th>Details</th>${list.map(r => `<th>${labelFor(r)}</th>`).join('')}</tr>
<tr><td>Category</td>${list.map(r => `<td>${esc(RATE_TABLE[r.category]?.name || r.categoryName || '—')}</td>`).join('')}</tr>
<tr><td>Total duty (hrs)</td>${list.map(r => tdCell(r.totalDuty || 0, r.totalDuty || 0, maxDuty)).join('')}</tr>
<tr><td>OT hours</td>${list.map(r => tdCell(r.otHours, r.otHours, maxOt)).join('')}</tr>
<tr><td>Holiday Allowance (days)</td>${list.map(r => tdCell(r.holiday, r.holiday, maxHol)).join('')}</tr>
<tr><td>Night Allowance (nights)</td>${list.map(r => tdCell(r.night, r.night, maxNight)).join('')}</tr>
<tr><td>4:30 pm (days)</td>${list.map(r => tdCell(r.plainDays || 0, r.plainDays || 0, maxPlain)).join('')}</tr>
<tr><td>OT Allowance</td>${list.map(r => `<td>৳ ${r.otAmount.toFixed(2)}</td>`).join('')}</tr>
<tr><td>Holiday Allowance</td>${list.map(r => `<td>৳ ${r.holidayAmount.toFixed(2)}</td>`).join('')}</tr>
<tr><td>Night Allowance</td>${list.map(r => `<td>৳ ${r.nightAmount.toFixed(2)}</td>`).join('')}</tr>
<tr class="total-row"><td>Total</td>${list.map(r => tdCell('৳ ' + r.totalEarned.toFixed(2), r.totalEarned, maxTotal)).join('')}</tr>
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
viewEmployeeFromLeaderboard(raw);
}
function buildLeaderboardPayloadFromList(month, allList) {
const rppfEmployees = (allList || []).filter(e => e && e.isRppf !== false && (e.valid !== false) && isMappedAreaId(e.id));
function computeEmpAvgDutyAndInOut(e) {
const daily = Array.isArray(e.daily) ? e.daily : [];
let inMinsSum = 0, inCnt = 0, outMinsSum = 0, outCnt = 0, activeDays = 0;
daily.forEach(r => {
if (!r) return;
const dHrs = (Number(r[4])||0) + (Number(r[5])||0) + (Number(r[6])||0) + (Number(r[7])||0) + (Number(r[8])||0) + (Number(r[9])||0);
const inStr = String(r[2] || '').trim();
const outStr = String(r[3] || '').trim();
if (dHrs > 0 || inStr || outStr) activeDays++;
const mIn = inStr.match(/^(\d{1,2}):(\d{2})/);
if (mIn) { inMinsSum += (+mIn[1]) * 60 + (+mIn[2]); inCnt++; }
const mOut = outStr.match(/^(\d{1,2}):(\d{2})/);
if (mOut) { outMinsSum += (+mOut[1]) * 60 + (+mOut[2]); outCnt++; }
});
const fallbackDays = Math.max(1, activeDays, Number(e.regularDaysCount || 0) + Number(e.holidayCount || 0), Math.round((Number(e.totalDuty || 0)) / 12));
const avgDutyPerDay = Number(((Number(e.totalDuty || 0)) / fallbackDays).toFixed(2));
const fmtM = (mins) => {
if (mins == null) return '—';
const norm = ((Math.round(mins) % 1440) + 1440) % 1440;
const hh = String(Math.floor(norm / 60)).padStart(2, '0');
const mm = String(norm % 60).padStart(2, '0');
return `${hh}:${mm}`;
};
const avgInMins = inCnt > 0 ? (inMinsSum / inCnt) : 480; // default 08:00 when daily log not embedded
const avgOutMins = outCnt > 0 ? (outMinsSum / outCnt) : Math.min(1380, Math.round(480 + avgDutyPerDay * 60));
return {
presentDaysCount: fallbackDays,
avgDutyPerDay,
avgInMins,
avgOutMins,
avgInTimeStr: fmtM(avgInMins),
avgOutTimeStr: fmtM(avgOutMins)
};
}
window.computeEmpAvgDutyAndInOut = computeEmpAvgDutyAndInOut;
function computeEmpRequisitionProblems(e) {
  if (!e) return [];
  if (Array.isArray(e.requisitionProblems) && e.requisitionProblems.length > 0) return e.requisitionProblems;
  const daily = Array.isArray(e.daily) ? e.daily : [];
  const reqProbs = [];

  const govtHols = ['20-OCT-2026', '21-OCT-2026', '21-FEB-2026', '26-MAR-2026', '14-APR-2026', '01-MAY-2026', '16-DEC-2026', '25-DEC-2026'];

  daily.forEach(r => {
    if (!r || !Array.isArray(r)) return;
    const dateStr = String(r[0] || '').trim().toUpperCase();
    const dayStr = String(r[1] || '').trim();
    const inStr = String(r[2] || '').trim();
    const outStr = String(r[3] || '').trim();

    const regD = Number(r[4]) || 0;
    const regO = Number(r[5]) || 0;
    const doD = Number(r[6]) || 0;
    const doO = Number(r[7]) || 0;
    const holD = Number(r[8]) || 0;
    const holO = Number(r[9]) || 0;
    const isNight = Number(r[10]) === 1 || String(r[11] || '').toUpperCase().includes('NIGHT') || String(r[11] || '').toUpperCase() === 'DN';

    const totOt = regO + doO + holO;
    const totDuty = regD + doD + holD;

    // 1. Govt Holiday Requisition Missing
    if (govtHols.includes(dateStr) && (regD > 0 || regO > 0) && (holD === 0 && holO === 0)) {
      reqProbs.push({
        date: dateStr, in: inStr, out: outStr, duty: totDuty, elapsed: totDuty, isNight,
        expectedOt: 'Govt Holiday Req Missing (Should be in Holiday Allowance)',
        reason: 'Govt Holiday Duty recorded as Regular Duty'
      });
      return;
    }

    // 2. Weekend Day Off (DO) Requisition Missing (Thu & Fri Only)
    if ((dayStr === 'Thu' || dayStr === 'Fri') && (regD > 0 || regO > 0) && (doD === 0 && doO === 0)) {
      reqProbs.push({
        date: dateStr, in: inStr, out: outStr, duty: totDuty, elapsed: totDuty, isNight,
        expectedOt: `Weekend (${dayStr}) DO Req Missing`,
        reason: 'Weekend Duty recorded as Regular Duty'
      });
      return;
    }

    if (typeof isPunchMissing === 'function' && (isPunchMissing(inStr) || isPunchMissing(outStr))) return;

    const mIn = inStr.match(/^(\d{1,2}):(\d{2})/);
    const mOut = outStr.match(/^(\d{1,2}):(\d{2})/);
    if (!mIn || !mOut) return;
    const ti = (+mIn[1]) * 60 + (+mIn[2]);
    const to = (+mOut[1]) * 60 + (+mOut[2]);
    const diff = to < ti ? (1440 - ti) + to : to - ti;
    const elHrs = Number((diff / 60).toFixed(2));

    if (totOt === 0) {
      if (isNight && (elHrs >= 11.0 || totDuty >= 11.0)) {
        const exp = Math.min(7, Math.max(4, Math.round(Math.max(elHrs, totDuty) - 8.5)));
        reqProbs.push({
          date: dateStr, in: inStr, out: outStr, duty: totDuty || elHrs, elapsed: elHrs, isNight: true,
          expectedOt: `${exp}.0h (Night Shift OT Error / Missing)`,
          reason: 'Night Shift OT Missing'
        });
      } else if (!isNight && to >= 1150 && to <= 1215) {
        reqProbs.push({
          date: dateStr, in: inStr, out: outStr, duty: totDuty || elHrs, elapsed: elHrs, isNight: false,
          expectedOt: '3.0h (04:30 - 07:30 PM)',
          reason: '3h Evening OT Missing'
        });
      } else if (!isNight && to >= 1216 && to <= 1350) {
        reqProbs.push({
          date: dateStr, in: inStr, out: outStr, duty: totDuty || elHrs, elapsed: elHrs, isNight: false,
          expectedOt: '5.0h (04:30 - 09:30 PM)',
          reason: '5h Evening OT Missing'
        });
      } else if (!isNight && ti <= 435 && elHrs >= 9.5) {
        const exp = ti <= 390 ? '2.5h Morning OT' : '1.0h Morning OT';
        reqProbs.push({
          date: dateStr, in: inStr, out: outStr, duty: totDuty || elHrs, elapsed: elHrs, isNight: false,
          expectedOt: exp,
          reason: 'Morning OT Missing'
        });
      }
    }
  });
  return reqProbs;
}

function computeEmpGeneralAbsents(e, targetMonthStr, prevNightSetOrBool) {
  if (!e) return { dates: [], shortDates: [], count: 0 };
  const isMulti = Boolean(e.isMultiMonth || (e.monthsCount && e.monthsCount > 1));
  if (isMulti && Array.isArray(e.generalAbsentDays)) {
    return {
      dates: e.generalAbsentDays,
      shortDates: Array.isArray(e.generalAbsentShortDates) ? e.generalAbsentShortDates : e.generalAbsentDays,
      count: e.generalAbsentCount != null ? Number(e.generalAbsentCount) : e.generalAbsentDays.length
    };
  }
  const mStr = targetMonthStr 
    || e._computedMonth
    || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month)
    || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');

  const hasDailyOrActive = (Array.isArray(e.daily) && e.daily.length > 0) || (Array.isArray(e.activeDayNums) && e.activeDayNums.length > 0);
  if (!hasDailyOrActive && Array.isArray(e.generalAbsentDays) && e._computedMonth === mStr) {
    return {
      dates: e.generalAbsentDays,
      shortDates: Array.isArray(e.generalAbsentShortDates) ? e.generalAbsentShortDates : e.generalAbsentDays,
      count: e.generalAbsentCount != null ? Number(e.generalAbsentCount) : e.generalAbsentDays.length
    };
  }

  if (typeof _rptRows === 'function') {
    const { rows, y, m } = _rptRows({ emp: e, month: mStr, prevNight: prevNightSetOrBool });
    const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const monName = (m >= 1 && m <= 12) ? mons[m - 1] : 'JAN';
    const mmPad = String(m >= 1 && m <= 12 ? m : 1).padStart(2, '0');
    const absentDates = [];
    const shortDates = [];
    (rows || []).forEach(r => {
      if (r && r.isGeneralAbsent) {
        const dStr = String(r.dayNum || (r.date ? r.date.split('/')[0] : '')).padStart(2, '0');
        absentDates.push(`${dStr}-${monName} (${r.day})`);
        shortDates.push(`${dStr}-${mmPad}`);
      }
    });
    e.generalAbsentDays = absentDates;
    e.generalAbsentShortDates = shortDates;
    e.generalAbsentCount = absentDates.length;
    e._computedMonth = mStr;
    return { dates: absentDates, shortDates, count: absentDates.length };
  }

  return { dates: [], shortDates: [], count: 0 };
}

function getGeneralAbsentCount(emp, targetMonth) {
  if (!emp) return 0;
  const isMulti = (typeof currentLbTimeMode !== 'undefined' && currentLbTimeMode !== 'monthly') || emp.isMultiMonth || (emp.monthsCount && emp.monthsCount > 1);
  if (isMulti) {
    return Number(emp.generalAbsentCount != null ? emp.generalAbsentCount : (Array.isArray(emp.generalAbsentDays) ? emp.generalAbsentDays.length : 0));
  }
  const mStr = targetMonth || emp._computedMonth || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  const prevSet = getPrevMonthNightSet(mStr);
  const prevHas = prevSet.has(String(emp.id || '').toUpperCase()) || prevSet.has(resolveEmpAliasId(emp.id));
  if (emp.generalAbsentCount != null && emp._computedMonth === mStr && emp._computedPrevNight === prevHas) {
    return Number(emp.generalAbsentCount) || 0;
  }
  const res = typeof computeEmpGeneralAbsents === 'function' ? computeEmpGeneralAbsents(emp, mStr, prevHas) : { count: Number(emp.generalAbsentCount) || 0 };
  emp._computedPrevNight = prevHas;
  return res.count;
}

function ensureEmpAvgStats(list, targetMonth) {
const isMulti = (typeof currentLbTimeMode !== 'undefined' && currentLbTimeMode !== 'monthly') || Boolean(list && list[0] && (list[0].isMultiMonth || (list[0].monthsCount && list[0].monthsCount > 1)));
const mStr = targetMonth || (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
const prevNightSet = !isMulti ? getPrevMonthNightSet(mStr) : new Set();
(list || []).forEach(e => {
  if (!e) return;
  if (!isMulti) {
    const uid = String(e.id || '').toUpperCase();
    const prevHas = prevNightSet.has(uid) || prevNightSet.has(resolveEmpAliasId(uid));
    e._prevMonthLastNight = prevHas;
    if (!e._metricsComputed || e._computedMonth !== mStr || e._computedPrevNight !== prevHas) {
      const rps = computeEmpRequisitionProblems(e);
      const abs = computeEmpGeneralAbsents(e, mStr, prevHas);
      e.requisitionProblems = rps;
      e.requisitionProblemCount = rps.length;
      e.generalAbsentDays = abs.dates;
      e.generalAbsentShortDates = abs.shortDates;
      e.generalAbsentCount = abs.count;
      e._metricsComputed = true;
      e._computedMonth = mStr;
      e._computedPrevNight = prevHas;
    }
  } else {
    if (e.generalAbsentCount == null) {
      e.generalAbsentCount = Array.isArray(e.generalAbsentDays) ? e.generalAbsentDays.length : 0;
    }
    if (e.requisitionProblemCount == null) {
      e.requisitionProblemCount = Array.isArray(e.requisitionProblems) ? e.requisitionProblems.length : 0;
    }
  }
});
(list || []).forEach(e => {
if (!e || (e._avgComputed && e.adjustedDuty != null && e.adjustedAvgDuty != null && e.nightRestDays != null)) return;
const st = computeEmpAvgDutyAndInOut(e);
Object.assign(e, st, { _avgComputed: true });
});
return list;
}
window.ensureEmpAvgStats = ensureEmpAvgStats;
const normalized = rppfEmployees.map(e => ({
...e,
plainDaysCount: Number(e.plainDaysCount != null ? e.plainDaysCount : e.plainDays || 0),
area: getAreaForId(e.id, true),
punchProblemsCount: getPunchProblemCount(e)
}));
ensureEmpAvgStats(normalized, month);
const sortedByDuty = [...normalized].sort((a,b) => b.totalDuty - a.totalDuty);
const sortedByOT = [...normalized].sort((a,b) => b.otHours - a.otHours);
const sortedByEarned = [...normalized].sort((a,b) => b.totalEarned - a.totalEarned);
const sortedByPlain = [...normalized].sort((a,b) => (b.plainDaysCount - a.plainDaysCount) || (b.totalDuty - a.totalDuty));
const sortedByLessDuty = [...normalized].sort((a,b) => (a.totalDuty - b.totalDuty) || (a.otHours - b.otHours));
const sortedByLessOT = [...normalized].sort((a,b) => (a.otHours - b.otHours) || (a.totalDuty - b.totalDuty));
const sortedByAvgDuty = [];
const sortedByAvgInOut = [];
const sortedByPunch = [...normalized].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours));
const sortedByRequisition = [...normalized].filter(e => (typeof getRequisitionProblemCount === 'function' ? getRequisitionProblemCount(e) : 0) > 0).sort((a,b) => (getRequisitionProblemCount(b) - getRequisitionProblemCount(a)) || ((b.totalDuty || 0) - (a.totalDuty || 0)));
const sortedByAbsent = [...normalized].filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e, month) : 0) > 0).sort((a,b) => (getGeneralAbsentCount(b, month) - getGeneralAbsentCount(a, month)) || ((a.totalDuty || 0) - (b.totalDuty || 0)) || ((a.otHours || 0) - (b.otHours || 0)));
return {
month,
allEmployees: normalized,
sortedByDuty,
sortedByOT,
sortedByEarned,
sortedByPlain,
sortedByLessDuty,
sortedByLessOT,
sortedByAvgDuty,
sortedByAvgInOut,
sortedByPunch,
sortedByRequisition,
sortedByAbsent
};
}
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
if (!e || e.isRppf === false || e.valid === false || !isMappedAreaId(e.id)) return;
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
function getCurrentMonth() { return `${document.getElementById('yearSelect').value}-${document.getElementById('monthSelect').value}`; }
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
  prevM ? fetchMonthPreIndexedData(prevM, false).catch(() => null) : Promise.resolve(null)
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
if (type === 'duty') { valueStr = `${e.totalDuty} hrs`; metaStr = commonMeta; rawMetric = Number(e.totalDuty) || 0; }
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
<div><div class="rank-value">${valueStr}</div><div class="rank-meta">${metaStr}</div></div>
</div>`;
}
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
const preferredArea = getAppMode() === 'incharge' ? getInchargeDefaultArea() : (getMyId() ? getAreaForId(getMyId(), true) : 'all');
populateAreaDropdown();
const hasPrefArea = [...areaFilter.options].some(o => o.value === preferredArea);
areaFilter.value = hasPrefArea ? preferredArea : 'all';
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
const maxVal = type === 'duty' ? (list[0]?.totalDuty || 1) : type === 'ot' ? (list[0]?.otHours || 1) : (list[0]?.totalEarned || 1);
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
function getLbFilterState() {
return {
area: document.getElementById('areaFilter')?.value || 'all',
sub: document.getElementById('subFilter')?.value || 'all',
gender: document.getElementById('genderFilter')?.value || 'all',
type: document.getElementById('typeFilter')?.value || 'all',
customCat: document.getElementById('customCatFilter')?.value || 'all'
};
}
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
const sortedByDuty = [...filtered].sort((a,b) => b.totalDuty - a.totalDuty);
const sortedByOT = [...filtered].sort((a,b) => b.otHours - a.otHours);
const sortedByEarned = [...filtered].filter(e => !isNoRateCat(e.category)).sort((a,b) => b.totalEarned - a.totalEarned);
const sortedByPlain = [...filtered].sort((a,b) => ((b.plainDaysCount || 0) - (a.plainDaysCount || 0)) || (b.totalDuty - a.totalDuty));
const sortedByLessDuty = [...filtered].sort((a,b) => (a.totalDuty - b.totalDuty) || (a.otHours - b.otHours));
const sortedByLessOT = [...filtered].sort((a,b) => (a.otHours - b.otHours) || (a.totalDuty - b.totalDuty));
let sortedByAvgDuty = [];
let sortedByAvgInOut = [];
if (typeof activeIccCriterion !== 'undefined' && (activeIccCriterion === 'avgDuty' || activeIccCriterion === 'avgInOut')) {
const curMonth = (currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
ensureEmpAvgStats(filtered, curMonth);
sortedByAvgDuty = [...filtered].sort((a,b) => ((b.avgDutyPerDay || 0) - (a.avgDutyPerDay || 0)) || (b.totalDuty - a.totalDuty));
sortedByAvgInOut = [...filtered].sort((a,b) => ((a.avgInMins || 480) - (b.avgInMins || 480)) || ((b.avgOutMins || 1020) - (a.avgOutMins || 1020)));
}
const sortedByPunch = [...filtered].filter(e => getPunchProblemCount(e) > 0).sort((a,b) => (getPunchProblemCount(b) - getPunchProblemCount(a)) || (b.otHours - a.otHours));
const sortedByRequisition = [...filtered].filter(e => getRequisitionProblemCount(e) > 0).sort((a,b) => (getRequisitionProblemCount(b) - getRequisitionProblemCount(a)) || (b.totalDuty - a.totalDuty));
const curMonth = (currentLeaderboardResult && currentLeaderboardResult.month) || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : ''); ensureEmpAvgStats(filtered, curMonth); const sortedByAbsent = [...filtered].filter(e => (typeof getGeneralAbsentCount === 'function' ? getGeneralAbsentCount(e, curMonth) : 0) > 0).sort((a,b) => (getGeneralAbsentCount(b, curMonth) - getGeneralAbsentCount(a, curMonth)) || ((a.totalDuty || 0) - (b.totalDuty || 0)) || ((a.otHours || 0) - (b.otHours || 0)));
currentLeaderboardResult.filtered = { _rawFiltered: filtered, sortedByDuty, sortedByOT, sortedByEarned, sortedByPlain, sortedByLessDuty, sortedByLessOT, sortedByAvgDuty, sortedByAvgInOut, sortedByPunch, sortedByRequisition, sortedByAbsent, area };
updateLbSummaryMetrics(filtered);
renderTop3('lbTopDuty', sortedByDuty.slice(0, 5), 'duty');
renderTop3('lbTopOT', sortedByOT.slice(0, 5), 'ot');
renderTop3('lbTopEarned', sortedByEarned.slice(0, 5), 'earned');
renderPunchIssueList(sortedByPunch);
updateMyRankNotes(); updateAreaFilterCount(); updateAreaHint();
}
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
function renderLbModalItems(list) {
const body = document.getElementById('lbFullListBody');
if (!body) return;
if (!list || list.length === 0) { body.innerHTML = '<div class="lb-modal-empty">No one found in this filter/month.</div>'; return; }
const t = currentLbListType || 'duty';
const first = currentLbModalList[0] || list[0];
const maxVal = t === 'duty' ? (first?.totalDuty || 1) : t === 'ot' ? (first?.otHours || 1) : (first?.totalEarned || 1);
body.innerHTML = list.map((e, i) => buildRankItemHTML(e, i, t, e.id === getMyId(), maxVal)).join('');
}
function filterLbModalList() {
const q = (document.getElementById('lbModalSearchInput')?.value || '').trim().toUpperCase();
if (!q) { renderLbModalItems(currentLbModalList); return; }
const matched = currentLbModalList.filter(e => (e.id && e.id.toUpperCase().includes(q)) || (e.name && e.name.toUpperCase().includes(q)) || (e.area && e.area.toUpperCase().includes(q)));
renderLbModalItems(matched);
}
function closeLbFullList() {
const modal = document.getElementById('lbFullListModal');
modal.classList.remove('open');
document.body.style.overflow = ''; document.body.style.position = ''; document.body.style.width = '';
currentLbListType = null;
}
function lbModalBackdropClick(e) { if (e.target.id === 'lbFullListModal') closeLbFullList(); }
async function viewEmployeeFromLeaderboard(empId) {
if (document.getElementById('lbFullListModal').classList.contains('open')) closeLbFullList();
const month = (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month) || getCurrentMonth();
const [year, mon] = month.split('-');
document.getElementById('yearSelect').value = year;
document.getElementById('monthSelect').value = mon;
document.getElementById('employeeId').value = empId;
toggleClearIdBtn();
document.getElementById('backToLbBtn').style.display = "block"; _lbView = true;
switchPage('search');
setTimeout(() => { findReport(); }, 100);
}
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
window.addEventListener('load', async () => {
try {
const swUrl = new URL('sw.js', window.location.href).href;
const registration = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' });
await registration.update();
registration.addEventListener('updatefound', () => {
const newWorker = registration.installing;
if (!newWorker) return;
newWorker.addEventListener('statechange', () => { if (newWorker.state === 'activated') console.log('[App] New SW activated'); });
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
function startNoticePolling() {
if (noticePollInterval) clearInterval(noticePollInterval);
noticePollCount = 0;
noticePollInterval = setInterval(async () => {
noticePollCount++;
const hasNoticesSection = document.getElementById('noticesHomeList') || document.getElementById('noticesFullList');
if (hasNoticesSection && document.visibilityState === 'visible') {
try {
await renderNoticesHome();
if (document.getElementById('page-notices') && document.getElementById('page-notices').classList.contains('active')) await renderNoticesPage();
} catch (e) {}
}
if (noticePollCount >= FAST_POLL_COUNT) {
clearInterval(noticePollInterval);
noticePollInterval = setInterval(async () => { if (document.visibilityState === 'visible') { try { await renderNoticesHome(); } catch (e) {} } }, SLOW_POLL_INTERVAL);
}
}, FAST_POLL_INTERVAL);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { renderNoticesHome(); } });
const ADMIN_PASS_KEY = STORAGE_NAMESPACE + 'renata_admin_pass_v1';
const ADMIN_SESSION_KEY = STORAGE_NAMESPACE + 'renata_admin_logged_in_v1';
const ADMIN_GH_TOKEN_KEY = STORAGE_NAMESPACE + 'renata_gh_pat_v1';
const DEFAULT_ADMIN_PASS = 'admin1234';
function getAdminPassword() { try { return localStorage.getItem(ADMIN_PASS_KEY) || DEFAULT_ADMIN_PASS; } catch (e) { return DEFAULT_ADMIN_PASS; } }
function isAdminLoggedIn() { try { return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1' || localStorage.getItem(ADMIN_SESSION_KEY) === '1'; } catch (e) { return false; } }
function setAdminLoggedIn(val) {
try {
if (val) { sessionStorage.setItem(ADMIN_SESSION_KEY, '1'); localStorage.setItem(ADMIN_SESSION_KEY, '1'); }
else { sessionStorage.removeItem(ADMIN_SESSION_KEY); localStorage.removeItem(ADMIN_SESSION_KEY); }
} catch (e) {}
}

function toggleAdminPassVis() { const inp = document.getElementById('adminPassInput'); if (inp) inp.type = inp.type === 'password' ? 'text' : 'password'; }
function toggleGhTokenVis() { const inp = document.getElementById('adminGhTokenInput'); if (inp) inp.type = inp.type === 'password' ? 'text' : 'password'; }
function clearAdminLoginError() { document.getElementById('adminLoginError')?.classList.remove('show'); }
function handleAdminLogin() {
const inp = document.getElementById('adminPassInput');
const raw = (inp ? inp.value : '').trim();
const expected = getAdminPassword();
if (raw !== expected && raw !== DEFAULT_ADMIN_PASS) {
document.getElementById('adminLoginError')?.classList.add('show');
showToast('Wrong admin password!', 'error');
if (inp) inp.focus();
return;
}
setAdminLoggedIn(true);
if (inp) inp.value = '';
clearAdminLoginError();
showToast('Welcome to the admin panel', 'success');
initAdminPage();
}
function handleAdminLogout() { setAdminLoggedIn(false); showToast('Logged out of the admin panel.', 'info'); initAdminPage(); }
function adminChangePassword() {
const inp = document.getElementById('adminNewPassInput');
const val = (inp ? inp.value : '').trim();
if (!val || val.length < 4) { showToast('Enter a new password of at least 4 characters', 'warn'); return; }
try { localStorage.setItem(ADMIN_PASS_KEY, val); } catch (e) {}
if (inp) inp.value = '';
showToast('New admin password saved', 'success');
}
function updateAdminRepoBanner() {
  const isNonProd = (REPO_NAME !== 'checkot.github.io' || GITHUB_USERNAME !== 'checkot');
  const targetName = `${GITHUB_USERNAME}/${REPO_NAME}`;
  const banner = document.getElementById('adminNonProdRepoBanner');
  const bannerLogin = document.getElementById('adminNonProdRepoBannerLogin');
  if (banner) {
    banner.style.display = isNonProd ? 'flex' : 'none';
    const nameEl = document.getElementById('adminNonProdRepoName');
    if (nameEl) nameEl.textContent = targetName;
  }
  if (bannerLogin) {
    bannerLogin.style.display = isNonProd ? 'flex' : 'none';
    const nameLoginEl = document.getElementById('adminNonProdRepoNameLogin');
    if (nameLoginEl) nameLoginEl.textContent = targetName;
  }
}
window.updateAdminRepoBanner = updateAdminRepoBanner;

function initAdminPage() {
updateAdminRepoBanner();
if (typeof XLSX === 'undefined' && typeof _loadScript === 'function') {
_loadScript('https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js').catch(() => {});
}
const loginCard = document.getElementById('adminLoginCard');
const dashWrap = document.getElementById('adminDashboardWrap');
if (!loginCard || !dashWrap) return;
if (!isAdminLoggedIn()) { loginCard.style.display = 'block'; dashWrap.style.display = 'none'; return; }
loginCard.style.display = 'none'; dashWrap.style.display = 'block';
const ySel = document.getElementById('yearSelect'); const mSel = document.getElementById('monthSelect');
const admY = document.getElementById('adminPdfYear'); const admM = document.getElementById('adminPdfMonth');
if (ySel && admY) { admY.innerHTML = ySel.innerHTML; admY.value = ySel.value; }
if (mSel && admM) admM.value = mSel.value;
const tok = getGhToken();
const tokInp = document.getElementById('adminGhTokenInput');
const statusTxt = document.getElementById('adminTokenStatusText');
if (tokInp) tokInp.value = tok;
if (statusTxt) statusTxt.innerHTML = tok ? 'RPPF Cloud Server is connected - files can be uploaded and optimized directly.' : 'Server Access Key has not been set yet.';
loadAreaMap().then(() => { updateAdminAreaStats(); renderAdminAreaPreview(); adminLoadExtraCandidates(false); });
renderAdminNoticesList();
}
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-nav-tabs .admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-section-pane').forEach(p => p.classList.remove('active'));

  const tabBtnMap = {
    'absent': 'admTabBtnAbsent',
    'areas': 'admTabBtnAreas',
    'unassigned': 'admTabBtnUnassigned',
    'rates': 'admTabBtnRates',
    'data': 'admTabBtnData',
    'team': 'admTabBtnTeam',
    'notices': 'admTabBtnNotices',
    'setup': 'admTabBtnSetup'
  };

  const paneMap = {
    'absent': 'admPaneAbsent',
    'areas': 'admPaneAreas',
    'unassigned': 'admPaneUnassigned',
    'rates': 'admPaneRates',
    'data': 'admPaneData',
    'team': 'admPaneTeam',
    'notices': 'admPaneNotices',
    'setup': 'admPaneSetup'
  };

  const btn = document.getElementById(tabBtnMap[tab]);
  const pane = document.getElementById(paneMap[tab]);
  if (btn) btn.classList.add('active');
  if (pane) pane.classList.add('active');

  if (tab === 'areas') {
    adminSelectSectionCard(_admCurrentActiveSection || 'Solid Production');
  } else if (tab === 'unassigned') {
    adminScanUnassignedMonthlyEmployees();
  } else if (tab === 'absent') {
    loadAbsentStore().then(() => renderAdminAbsentPane());
  } else if (tab === 'rates') {
    adminRenderDesigRates();
  } else if (tab === 'data') {
    adminCheckMonthData();
  } else if (tab === 'team') {
    renderAdminTeamManager();
  } else if (tab === 'notices') {
    renderAdminNoticesList();
  }
}
function onAdminAreaChange() {
renderAdminSubsList(); populateAdminSubSelect(); renderAdminAreaPreview();
}
function populateAdminSubSelect() {
const sel = document.getElementById('adminTargetSubSelect');
if (!sel) return;
const area = document.getElementById('adminTargetAreaSelect')?.value || 'Packing Hall';
const subs = AREA_SUBS[area] || [];
const prev = sel.value;
sel.innerHTML = '<option value="">Unchanged</option><option value="__none__">Not in any sub-section</option>' + subs.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}
function renderAdminSubsList() {
const box = document.getElementById('adminSubsList');
if (!box) return;
const area = document.getElementById('adminTargetAreaSelect')?.value || 'Packing Hall';
const subs = AREA_SUBS[area] || [];
if (!subs.length) { box.innerHTML = `<div style="padding:8px;color:var(--muted);font-size:12.5px;width:100%;text-align:center;">${esc(area)} has no sub-sections yet.</div>`; return; }
box.innerHTML = subs.map((name, i) => {
const n = Object.keys(AREA_MAP).filter(id => AREA_MAP[id] === area && (AREA_DETAILS[id] || {}).s === name).length;
return `<span class="admin-id-pill"><span>${esc(name)} (${bn(n)})</span><button type="button" onclick="adminRemoveSubsectionAt(${i})" title="Delete">✕</button></span>`;
}).join('');
}
function adminAddSubsection() {
const area = document.getElementById('adminTargetAreaSelect')?.value || 'Packing Hall';
const inp = document.getElementById('adminNewSubInput');
const name = (inp?.value || '').replace(/\s+/g, ' ').trim();
if (!name) { showToast('Enter a sub-section name', 'warn'); if (inp) inp.focus(); return; }
if (!AREA_SUBS[area]) AREA_SUBS[area] = [];
if (AREA_SUBS[area].some(x => x.toLowerCase() === name.toLowerCase())) { showToast('A sub-section with this name already exists', 'warn'); return; }
AREA_SUBS[area].push(name);
saveAreaCache();
if (inp) inp.value = '';
updateAdminAreaStats(); renderAdminAreaPreview();
showToast(`${area} → ${name} added (do not forget to save to the server)`, 'success');
}
function adminRemoveSubsectionAt(i) {
const area = document.getElementById('adminTargetAreaSelect')?.value || 'Packing Hall';
const list = AREA_SUBS[area] || [];
const name = list[i];
if (name === undefined) return;
openConfirmModal(`"${name}" sub-section - delete it? Its employees will stay in the area; only the sub-section will become empty.`, () => {
list.splice(i, 1);
if (!list.length) delete AREA_SUBS[area];
pruneAreaMeta(); saveAreaCache();
updateAdminAreaStats(); renderAdminAreaPreview();
showToast(`${name} has been deleted`, 'info');
});
}
function updateAdminAreaStats() {
pruneAreaMeta();
const vals = Object.values(AREA_MAP || {});
const solid = vals.filter(v => v === 'Solid Production').length;
const softgel = vals.filter(v => v === 'Softgel Production').length;
const packing = vals.filter(v => v === 'Packing Hall').length;
const total = vals.length;
const elS = document.getElementById('admCountSolid'); const elG = document.getElementById('admCountSoftgel');
const elP = document.getElementById('admCountPacking'); const elT = document.getElementById('admCountTotal');
if (elS) elS.textContent = bn(solid);
if (elG) elG.textContent = bn(softgel);
if (elP) elP.textContent = bn(packing);
if (elT) elT.textContent = bn(total);
const ids = Object.keys(AREA_MAP || {});
const metas = ids.map(getEmpMeta);
const setN = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = bn(n); };
setN('admCountMale', metas.filter(m => m.gender === 'M').length);
setN('admCountFemale', metas.filter(m => m.gender === 'F').length);
setN('admCountCon', metas.filter(m => m.type === 'CON').length);
setN('admCountJo', metas.filter(m => m.type === 'JO').length);
renderAdminSubsList(); populateAdminSubSelect();
updateSettingsAreaCount(); populateAreaDropdown();
}
function extractEmployeeIdsFromText(rawText) {
const upper = String(rawText || '').toUpperCase();
const regexMatches = upper.match(/\b(?:(?:CF|RF|CL)\d{2,6}|\d{5,8})\b/g) || [];
if (regexMatches.length > 0) return [...new Set(regexMatches)];
return [...new Set(upper.split(/[\s,;\n\r\t]+/).map(s => s.replace(/[^A-Z0-9]/g, '')).filter(s => s.length >= 3))];
}
function adminAddBulkAreaIds() {
const targetArea = document.getElementById('adminTargetAreaSelect')?.value || 'Packing Hall';
const inp = document.getElementById('adminBulkIdsInput');
const raw = inp ? inp.value : '';
const ids = extractEmployeeIdsFromText(raw);
if (ids.length === 0) { showToast('No valid ID (e.g. CF8355 or RF20850) found!', 'warn'); if (inp) inp.focus(); return; }
let added = 0, updated = 0;
const subVal = document.getElementById('adminTargetSubSelect')?.value || '';
const gVal = document.getElementById('adminTargetGenderSelect')?.value || '';
const tVal = document.getElementById('adminTargetTypeSelect')?.value || '';
ids.forEach(id => {
if (!AREA_MAP[id]) added++; else if (AREA_MAP[id] !== targetArea) updated++;
AREA_MAP[id] = targetArea;
const d = AREA_DETAILS[id] || (AREA_DETAILS[id] = {});
if (subVal === '__none__') delete d.s; else if (subVal) d.s = subVal;
if (gVal === '__none__') delete d.g; else if (gVal) d.g = gVal;
if (tVal === '__none__') delete d.t; else if (tVal) d.t = tVal;
});
saveAreaCache(); reapplyTypeOverrides();
if (inp) inp.value = '';
updateAdminAreaStats(); renderAdminAreaPreview();
showToast(`${targetArea}: ${bn(ids.length)} IDs updated (do not forget to save to the server)`, 'success');
}
function adminRemoveBulkAreaIds() {
const inp = document.getElementById('adminBulkIdsInput');
const raw = inp ? inp.value : '';
const ids = extractEmployeeIdsFromText(raw);
if (ids.length === 0) { showToast('Type the IDs you want to remove in the box', 'warn'); return; }
ids.forEach(id => { if (AREA_MAP[id]) delete AREA_MAP[id]; delete AREA_DETAILS[id]; });
saveAreaCache(); reapplyTypeOverrides();
if (inp) inp.value = '';
updateAdminAreaStats(); renderAdminAreaPreview();
showToast('IDs removed from the list.', 'info');
}
function adminRemoveSingleId(id) {
if (AREA_MAP && AREA_MAP[id]) {
delete AREA_MAP[id]; delete AREA_DETAILS[id];
saveAreaCache(); reapplyTypeOverrides();
updateAdminAreaStats(); renderAdminAreaPreview();
showToast(`${id} removed`, 'info');
}
}
function handleAdminAreaFileSelect(event) {
const file = event.target?.files?.[0];
if (!file) return;
const reader = new FileReader();
reader.onload = (e) => {
const content = String(e.target?.result || '');
try {
const parsed = JSON.parse(content);
if (parsed && parsed.areas && typeof parsed.areas === 'object') {
Object.assign(AREA_MAP, parsed.areas);
if (parsed.details && typeof parsed.details === 'object') Object.assign(AREA_DETAILS, parsed.details);
if (parsed.designationRates && typeof parsed.designationRates === 'object') Object.assign(DESIG_RATES, parsed.designationRates);
if (parsed.rateTable && typeof parsed.rateTable === 'object') Object.assign(RATE_TABLE, parsed.rateTable);
if (parsed.subsections && typeof parsed.subsections === 'object') Object.keys(parsed.subsections).forEach(a => { AREA_SUBS[a] = [...new Set([...(AREA_SUBS[a] || []), ...(parsed.subsections[a] || [])])]; });
saveAreaCache();
updateAdminAreaStats(); renderAdminAreaPreview();
showToast('IDs loaded from the JSON file', 'success');
return;
}
} catch (err) {}
const inp = document.getElementById('adminBulkIdsInput');
if (inp) {
inp.value = content;
showToast('IDs loaded from the file into the box.', 'info');
}
};
reader.readAsText(file);
}
function renderAdminAreaPreview() {
const targetArea = document.getElementById('adminTargetAreaSelect')?.value || 'Packing Hall';
const filterQ = (document.getElementById('admFilterIdsInput')?.value || '').trim().toUpperCase();
const box = document.getElementById('adminAreaIdsPreview');
const titleEl = document.getElementById('admPreviewHeaderTitle');
if (!box) return;
const idsInArea = Object.keys(AREA_MAP || {}).filter(id => AREA_MAP[id] === targetArea).filter(id => !filterQ || id.includes(filterQ)).sort();
if (titleEl) titleEl.textContent = `${targetArea}:`;
if (idsInArea.length === 0) { box.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;width:100%;text-align:center;">${targetArea} has no IDs added yet.</div>`; return; }
box.innerHTML = idsInArea.map(id => { const m = getEmpMeta(id); const tags = [m.sub, GENDER_LABELS[m.gender], EMP_TYPE_LABELS[m.type]].filter(Boolean).map(t => `<span class="admin-tag">${esc(t)}</span>`).join(''); return `<span class="admin-id-pill"><span>${esc(id)}</span>${tags}<button type="button" onclick="adminRemoveSingleId('${esc(id)}')" title="Delete">✕</button></span>`; }).join('');
}
let _admExtraList = [], _admExtraMonth = '', _admExtraChecked = new Set();
async function adminFindLatestMonthList(forceFresh) {
const now = new Date();
for (let i = 0; i < 8; i++) {
const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
try {
const list = await fetchMonthPreIndexedData(m, forceFresh);
if (list && list.length) return { month: m, list };
} catch (e) {}
}
return null;
}
async function adminLoadExtraCandidates(forceFresh) {
const lbl = document.getElementById('admExtraMonthLbl');
if (lbl) lbl.textContent = 'Looking for the list of the last uploaded month...';
await loadAreaMap();
const res = await adminFindLatestMonthList(Boolean(forceFresh));
if (!res) { _admExtraList = []; _admExtraMonth = ''; if (lbl) lbl.textContent = 'No monthly data found on the server. Upload Excel first.'; adminRenderExtraList(); adminRenderDesigRates(); return; }
_admExtraList = res.list; _admExtraMonth = res.month;
adminRenderExtraList(); adminRenderDesigRates();
}
function adminExtraCandidates() {
const cat = document.getElementById('admExtraCatSelect')?.value || 'CAS';
const q = (document.getElementById('admExtraSearch')?.value || '').trim().toUpperCase();
return _admExtraList.filter(e => e.kind === cat && (e.isRppf !== false) && (!q || String(e.id).includes(q) || String(e.name || '').toUpperCase().includes(q)))
.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}
function adminIsAssignedExtra(e, cat) { return Boolean(AREA_MAP[e.id]) && getEmpMeta(e.id).type === cat; }
function adminUpdateExtraCount() {
const el = document.getElementById('admExtraCount');
if (el) el.textContent = _admExtraChecked.size ? `${bn(_admExtraChecked.size)} selected` : 'No one selected';
}
function adminRenderExtraList() {
const box = document.getElementById('admExtraList'); const lbl = document.getElementById('admExtraMonthLbl'); const note = document.getElementById('admExtraNote');
if (!box) return;
const cat = document.getElementById('admExtraCatSelect')?.value || 'CAS';
if (note) note.textContent = cat === 'EXEC' ? 'All of them will go to the "Executives" area (whichever area is selected above) and will be visible only in in-charge mode. No amount will be calculated.' : 'They will be added to the area selected in "1. Area" above. No amount will be calculated; only hours and days are shown.';
const list = adminExtraCandidates();
const total = _admExtraList.filter(e => e.kind === cat && e.isRppf !== false).length;
if (lbl && _admExtraMonth) lbl.innerHTML = `Source: <b>${esc(_admExtraMonth)}</b> upload • total ${bn(total)} employees • showing ${bn(list.length)} employees`;
if (!list.length) {
box.innerHTML = `<div style="padding:14px;text-align:center;color:var(--muted);font-size:13px;">${_admExtraMonth ? 'No one found in this category.' + (cat === 'CAS' ? ' (Casual was not in the old upload - upload the Excel again)' : '') : 'No list.'}</div>`;
adminUpdateExtraCount(); return;
}
box.innerHTML = list.map(e => {
const assigned = adminIsAssignedExtra(e, cat);
const on = assigned || _admExtraChecked.has(e.id);
const tag = AREA_MAP[e.id] ? `<span class="admin-tag">${assigned ? '' : 'Other: '}${esc(AREA_MAP[e.id])}</span>` : '';
return `<div class="xrow ${on ? 'on' : ''} ${assigned ? 'locked' : ''}" data-id="${esc(e.id)}" data-locked="${assigned ? 1 : 0}" role="checkbox" aria-checked="${on}" tabindex="0">
<span class="xbox">${on ? '✓' : ''}</span>
<span style="flex:1;min-width:0;"><span style="display:block;font-size:13.5px;font-weight:700;">${esc(e.name || '—')}</span><span style="display:block;font-size:12px;color:var(--muted);">${esc(e.id)} • ${esc(e.grade || '')}</span></span>${tag}</div>`;
}).join('');
adminUpdateExtraCount();
}
function adminExtraRowToggle(row) {
if (!row || row.dataset.locked === '1') return;
const id = row.dataset.id;
const on = !_admExtraChecked.has(id);
if (on) _admExtraChecked.add(id); else _admExtraChecked.delete(id);
row.classList.toggle('on', on); row.setAttribute('aria-checked', on);
const bx = row.querySelector('.xbox'); if (bx) bx.textContent = on ? '✓' : '';
adminUpdateExtraCount();
}
document.addEventListener('click', e => { const row = e.target.closest && e.target.closest('#admExtraList .xrow'); if (row) adminExtraRowToggle(row); }, true);
document.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && e.target.classList && e.target.classList.contains('xrow') && e.target.closest('#admExtraList')) { e.preventDefault(); adminExtraRowToggle(e.target); } });
function adminToggleExtraAll() {
const cat = document.getElementById('admExtraCatSelect')?.value || 'CAS';
const list = adminExtraCandidates().filter(e => !adminIsAssignedExtra(e, cat));
const allOn = list.length > 0 && list.every(e => _admExtraChecked.has(e.id));
list.forEach(e => { if (allOn) _admExtraChecked.delete(e.id); else _admExtraChecked.add(e.id); });
adminRenderExtraList();
}
function adminAddExtraSelected() {
const cat = document.getElementById('admExtraCatSelect')?.value || 'CAS';
let targetArea = document.getElementById('adminTargetAreaSelect')?.value || 'Packing Hall';
if (cat === 'EXEC') targetArea = OVERALL_AREA;
else if (targetArea === OVERALL_AREA) { showToast('Select one area of Solid / Softgel / Packing for Casual', 'warn'); return; }
const subVal = cat === 'EXEC' ? '' : (document.getElementById('adminTargetSubSelect')?.value || '');
const gVal = document.getElementById('adminTargetGenderSelect')?.value || '';
const ids = _admExtraList.filter(e => e.kind === cat && _admExtraChecked.has(e.id)).map(e => e.id);
if (!ids.length) { showToast('First select employees from the list', 'warn'); return; }
ids.forEach(id => {
AREA_MAP[id] = targetArea;
const d = AREA_DETAILS[id] || (AREA_DETAILS[id] = {});
d.t = cat;
if (subVal === '__none__') delete d.s; else if (subVal) d.s = subVal;
if (gVal === '__none__') delete d.g; else if (gVal) d.g = gVal;
_admExtraChecked.delete(id);
});
saveAreaCache(); reapplyTypeOverrides();
updateAdminAreaStats(); renderAdminAreaPreview(); adminRenderExtraList();
showToast(`${targetArea}: ${bn(ids.length)} ${EMP_TYPE_LABELS[cat]} employee(s) added (do not forget to save to the server)`, 'success');
}
function admRateLabel(c) {
const r = RATE_TABLE[c]; if (!r) return c;
return r.noRate ? 'Unspecified (no rate)' : `৳${r.otRate}/hour (${c})`;
}
function adminDesigStats() {
const m = new Map();
const defaults = [
{ name: 'Contractual (CF) — All Contracts', grade: 'Helper', id: 'CF0001' },
{ name: 'Helper', grade: 'Helper', id: 'CF0002' },
{ name: 'Junior Officer F', grade: 'Junior Officer F', id: 'RF0001' },
{ name: 'Junior Officer E', grade: 'Junior Officer E', id: 'RF0002' },
{ name: 'Junior Officer D', grade: 'Junior Officer D', id: 'RF0003' },
{ name: 'Junior Officer C', grade: 'Junior Officer C', id: 'RF0004' },
{ name: 'Junior Officer B', grade: 'Junior Officer B', id: 'RF0005' },
{ name: 'Junior Officer A', grade: 'Junior Officer A', id: 'RF0006' },
{ name: 'Casual', grade: 'Casual', id: '100001' }
];
defaults.forEach(d => {
const k = desigKey(d.grade);
if (!m.has(k)) m.set(k, { key: k, name: d.grade, count: 0, sample: { id: d.id, grade: d.grade } });
});
_admExtraList.forEach(e => {
if (e.isRppf === false) return;
const g = String(e.grade || '').replace(/\s+/g, ' ').trim();
if (!g) return;
const k = desigKey(g);
const o = m.get(k) || { key: k, name: g, count: 0, sample: e };
o.count++; m.set(k, o);
});
return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
function getEffectiveDesigRateBucket(d) {
const cur = DESIG_RATES[d.key];
if (cur && RATE_TABLE[cur]) return cur;
return getDefaultRateCat(d.sample);
}
function selectAdminRateBucket(bucketKey) {
if (!RATE_TABLE[bucketKey]) bucketKey = 'CF';
activeAdminRateBucket = bucketKey;
adminRenderDesigRates();
}
function adminRenderDesigRates() {
const tabsBox = document.getElementById('adminRateBucketTabs');
const pkgWrap = document.getElementById('adminRatePkgEditorWrap');
const listBox = document.getElementById('admDesigRateList');
if (!tabsBox || !listBox) return;
if (!RATE_TABLE[activeAdminRateBucket]) activeAdminRateBucket = 'CF';
const allDesigs = adminDesigStats();
const bucketKeys = Object.keys(RATE_TABLE);
tabsBox.innerHTML = bucketKeys.map(k => {
const r = RATE_TABLE[k];
const assignedCount = allDesigs.filter(d => getEffectiveDesigRateBucket(d) === k).length;
const titleTxt = r.noRate ? `Unspecified (${bn(assignedCount)})` : `৳${bn(r.otRate)}/hour • ${k} (${bn(assignedCount)})`;
return `<button type="button" class="rate-bucket-tab ${k === activeAdminRateBucket ? 'active' : ''}" onclick="selectAdminRateBucket('${esc(k)}')">${titleTxt}</button>`;
}).join('');
const curRate = RATE_TABLE[activeAdminRateBucket];
if (pkgWrap) {
if (curRate && !curRate.noRate) {
pkgWrap.style.display = 'block';
const otInp = document.getElementById('pkgOtRateInp');
const nightInp = document.getElementById('pkgNightRateInp');
const holSel = document.getElementById('pkgHolTypeSel');
const holValInp = document.getElementById('pkgHolValInp');
const holValLbl = document.getElementById('pkgHolValLbl');
if (otInp) otInp.value = curRate.otRate || 0;
if (nightInp) nightInp.value = curRate.nightRate || 0;
if (holSel) holSel.value = curRate.holidayType || 'flat';
if (holValLbl) holValLbl.textContent = (curRate.holidayType === 'hourly') ? 'Holiday hours (× OT rate)' : 'Holiday fixed amount (৳)';
if (holValInp) holValInp.value = (curRate.holidayType === 'hourly') ? (curRate.holidayHours || 8) : (curRate.holidayFlat || 300);
} else {
pkgWrap.style.display = 'none';
}
}
const titleEl = document.getElementById('adminRateBucketDesigTitle');
if (titleEl) {
titleEl.textContent = curRate?.noRate
? 'Unspecified (only hours and days shown) - select designations:'
: `৳${curRate.otRate}/hour (${curRate.name || activeAdminRateBucket}) - designations/contracts that will be calculated at this rate:`;
}
listBox.innerHTML = allDesigs.map(d => {
const eff = getEffectiveDesigRateBucket(d);
const isChecked = (eff === activeAdminRateBucket);
const otherR = RATE_TABLE[eff];
const otherBadge = !isChecked ? `<span class="admin-tag">${otherR?.noRate ? 'Unspecified' : '৳' + (otherR?.otRate || 0)}</span>` : `<span class="admin-tag" style="background:var(--success-bg);color:var(--success);border-color:var(--success-border);">Active</span>`;
return `<div class="desig-check-item ${isChecked ? 'checked' : ''}" data-dkey="${esc(d.key)}" onclick="toggleDesigInActiveBucket(this.dataset.dkey)">
<span class="xbox" style="width:18px;height:18px;font-size:12px;${isChecked ? 'background:var(--brand);border-color:var(--brand);' : ''}">${isChecked ? '✓' : ''}</span>
<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.name)} ${d.count ? `(${bn(d.count)})` : ''}</span>
${otherBadge}
</div>`;
}).join('');
}
function onAdminPkgFieldChange() {
const curRate = RATE_TABLE[activeAdminRateBucket];
if (!curRate || curRate.noRate) return;
const otVal = parseFloat(document.getElementById('pkgOtRateInp')?.value) || 0;
const nightVal = parseFloat(document.getElementById('pkgNightRateInp')?.value) || 0;
const holType = document.getElementById('pkgHolTypeSel')?.value || 'flat';
const holVal = parseFloat(document.getElementById('pkgHolValInp')?.value) || 0;
curRate.otRate = otVal;
curRate.nightRate = nightVal;
curRate.holidayType = holType;
if (holType === 'hourly') curRate.holidayHours = holVal;
else curRate.holidayFlat = holVal;
const holValLbl = document.getElementById('pkgHolValLbl');
if (holValLbl) holValLbl.textContent = (holType === 'hourly') ? 'Holiday hours (× OT rate)' : 'Holiday fixed amount (৳)';
saveAreaCache();
syncRateDropdownOptions();
reapplyTypeOverrides();
}
function toggleDesigInActiveBucket(dkey) {
if (!dkey) return;
const allDesigs = adminDesigStats();
const item = allDesigs.find(x => x.key === dkey);
const currentBucket = item ? getEffectiveDesigRateBucket(item) : '';
if (currentBucket === activeAdminRateBucket) {
DESIG_RATES[dkey] = 'UNSPEC';
} else {
DESIG_RATES[dkey] = activeAdminRateBucket;
}
saveAreaCache();
reapplyTypeOverrides();
adminRenderDesigRates();
}
function adminBucketSelectAllDesigs(selectAll) {
const allDesigs = adminDesigStats();
allDesigs.forEach(d => {
if (selectAll) {
DESIG_RATES[d.key] = activeAdminRateBucket;
} else if (getEffectiveDesigRateBucket(d) === activeAdminRateBucket) {
DESIG_RATES[d.key] = 'UNSPEC';
}
});
saveAreaCache();
reapplyTypeOverrides();
adminRenderDesigRates();
showToast(selectAll ? 'All designations were added to this rate' : 'All designations of this rate were deselected', 'info');
}
function adminCreateNewRateBucket() {
const name = (document.getElementById('newRateNameInp')?.value || '').trim();
const otRate = parseFloat(document.getElementById('newRateOtInp')?.value) || 0;
const nightRate = parseFloat(document.getElementById('newRateNightInp')?.value) || 0;
const holFlat = parseFloat(document.getElementById('newRateHolInp')?.value) || 0;
if (!otRate || otRate <= 0) {
showToast('Enter a valid OT hourly rate', 'warn');
return;
}
const key = 'R_' + Math.round(otRate);
RATE_TABLE[key] = {
otRate,
nightRate,
holidayType: 'flat',
holidayHours: 8,
holidayFlat: holFlat,
name: name || `৳${otRate}/hour package`
};
activeAdminRateBucket = key;
saveAreaCache();
syncRateDropdownOptions();
reapplyTypeOverrides();
adminRenderDesigRates();
showToast(`৳${otRate}/hour rate package created`, 'success');
}
async function adminSaveRatesAndPush() {
onAdminPkgFieldChange();
await adminPushAreasToGithub();
}
function adminDownloadAreasJson() {
const jsonStr = JSON.stringify({
areas: AREA_MAP,
details: AREA_DETAILS,
subsections: AREA_SUBS,
designationRates: DESIG_RATES,
rateTable: RATE_TABLE
}, null, 2);
const blob = new Blob([jsonStr], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = 'areas.json';
document.body.appendChild(a); a.click(); a.remove();
setTimeout(() => URL.revokeObjectURL(url), 3000);
showToast('areas.json backup downloaded', 'success');
}

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
async function renderAdminTeamManager() {
const box = document.getElementById('adminTeamManagerList');
if (!box) return;
const list = await loadTeamData();
if (!list || list.length === 0) {
box.innerHTML = '<div style="color:var(--muted);font-size:13px;">No ERP members.</div>';
return;
}
box.innerHTML = list.map((m, idx) => `<div class="admin-file-item">
<div style="flex:1;min-width:0;">
<div style="font-weight:800;color:var(--text);">${esc(m.name)} <span class="admin-tag">${esc(m.area || 'All')}</span></div>
<div style="font-size:12px;color:var(--muted);">${esc(m.designation || '')} • ID: ${esc(m.id || '')} • WA: ${esc(m.whatsapp || '')}</div>
</div>
<div class="admin-file-actions">
<button type="button" class="btn-secondary" onclick="adminEditTeamMember(${idx})">Edit</button>
<button type="button" class="btn-secondary danger-btn" onclick="adminDeleteTeamMember(${idx})">Delete</button>
</div>
</div>`).join('');
}
function handleAdmTeamPhotoUpload(ev) {
const file = ev?.target?.files?.[0];
if (!file) return;
const reader = new FileReader();
reader.onload = function(e) {
const img = new Image();
img.onload = function() {
const canvas = document.createElement('canvas');
const size = 96;
canvas.width = size;
canvas.height = size;
const ctx = canvas.getContext('2d');
const minSide = Math.min(img.width, img.height);
const sx = (img.width - minSide) / 2;
const sy = (img.height - minSide) / 2;
ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
const inp = document.getElementById('admTeamPhoto');
if (inp) inp.value = dataUrl;
showToast('Profile photo ready to save', 'success');
};
img.src = e.target.result;
};
reader.readAsDataURL(file);
}
function adminEditTeamMember(idx) {
if (!teamData || !teamData[idx]) return;
const m = teamData[idx];
document.getElementById('admTeamEditIdx').value = String(idx);
document.getElementById('admTeamName').value = m.name || '';
document.getElementById('admTeamDesig').value = m.designation || '';
document.getElementById('admTeamId').value = m.id || '';
document.getElementById('admTeamArea').value = m.area || 'All';
document.getElementById('admTeamWa').value = m.whatsapp || '';
const photoInp = document.getElementById('admTeamPhoto');
if (photoInp) photoInp.value = (m.photo && m.photo !== 'https://checkot.github.io/icon.png' && m.photo !== 'icon.png') ? m.photo : '';
const btn = document.getElementById('admTeamSaveBtn');
if (btn) btn.textContent = 'Update and save to server';
}
function adminResetTeamForm() {
document.getElementById('admTeamEditIdx').value = '-1';
document.getElementById('admTeamName').value = '';
document.getElementById('admTeamDesig').value = '';
document.getElementById('admTeamId').value = '';
document.getElementById('admTeamArea').value = 'All';
document.getElementById('admTeamWa').value = '';
const photoInp = document.getElementById('admTeamPhoto');
if (photoInp) photoInp.value = '';
const photoFile = document.getElementById('admTeamPhotoFile');
if (photoFile) photoFile.value = '';
const btn = document.getElementById('admTeamSaveBtn');
if (btn) btn.textContent = 'Add and save ERP member';
}
async function adminSaveTeamMember() {
const name = (document.getElementById('admTeamName')?.value || '').trim();
const designation = (document.getElementById('admTeamDesig')?.value || '').trim();
const id = (document.getElementById('admTeamId')?.value || '').trim().toUpperCase();
const area = document.getElementById('admTeamArea')?.value || 'All';
const whatsapp = (document.getElementById('admTeamWa')?.value || '').replace(/[^0-9]/g, '');
const customPhoto = (document.getElementById('admTeamPhoto')?.value || '').trim();
if (!name || !whatsapp) {
showToast('Enter the ERP member name and WhatsApp number', 'warn');
return;
}
const list = [...(await loadTeamData())];
const editIdx = parseInt(document.getElementById('admTeamEditIdx')?.value || '-1', 10);
const prevPhoto = (editIdx >= 0 && list[editIdx] && list[editIdx].photo && list[editIdx].photo !== 'https://checkot.github.io/icon.png' && list[editIdx].photo !== 'icon.png')
? list[editIdx].photo
: (id && id !== '—' ? `https://checkot.github.io/photos/${id}.jpg` : 'https://checkot.github.io/icon.png');
const memberObj = {
name,
designation: designation || 'ERP Representative',
id: id || '—',
area,
whatsapp,
photo: customPhoto || prevPhoto || 'https://checkot.github.io/icon.png'
};
if (editIdx >= 0 && editIdx < list.length) list[editIdx] = memberObj;
else list.push(memberObj);
teamData = list;
try { localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: teamData })); } catch (e) {}
adminResetTeamForm();
renderAdminTeamManager();
try {
await githubPutFile('team.json', utf8ToBase64(JSON.stringify({ team: teamData }, null, 2)), `Update team.json via RPPF Admin Panel`);
showToast('ERP team list saved to the server', 'success');
} catch (err) {
reportSyncFail(err, 'The ERP team list');
}
}
function adminDeleteTeamMember(idx) {
if (!teamData || !teamData[idx]) return;
const m = teamData[idx];
openConfirmModal(`Are you sure you want to delete ERP member "${m.name}" from the list?`, async () => {
teamData.splice(idx, 1);
try { localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: teamData })); } catch (e) {}
renderAdminTeamManager();
try {
await githubPutFile('team.json', utf8ToBase64(JSON.stringify({ team: teamData }, null, 2)), `Delete ERP member ${m.name}`);
showToast('ERP member deleted', 'success');
} catch (err) {
reportSyncFail(err, 'The ERP member deletion');
}
});
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
const APP_LANG_KEY = STORAGE_NAMESPACE + 'renata_app_lang_v1';
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
if (prevB) prevB.textContent = d.prevMonth;
if (nextB) nextB.textContent = d.nextMonth;
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
async function renderAdminNoticesList() {
const box = document.getElementById('adminCurrentNoticesList');
if (!box) return;
const list = await loadNoticesData();
if (!list || list.length === 0) { box.innerHTML = '<div style="color:var(--muted);font-size:13px;">There are no notices.</div>'; return; }
box.innerHTML = list.map(n => `<div class="admin-file-item"><div style="flex:1;min-width:0;"><div style="font-weight:800;color:var(--text);">${esc(n.title)}</div><div style="font-size:12px;color:var(--muted);">${esc(n.date)} • ${esc(n.priority || 'normal')}</div></div><button type="button" class="calc-mini-btn danger-btn" style="min-height:32px!important;padding:0 10px!important;" onclick="adminDeleteNotice('${esc(n.id)}')">Delete</button></div>`).join('');
}
async function adminAddAndPushNotice() {
const titleEl = document.getElementById('adminNoticeTitle');
const bodyEl = document.getElementById('adminNoticeBody');
const prioEl = document.getElementById('adminNoticePriority');
const title = (titleEl?.value || '').trim();
const body = (bodyEl?.value || '').trim();
const priority = prioEl?.value || 'normal';
if (!title || !body) { showToast('Enter the notice title and details!', 'warn'); return; }
const list = [...(await loadNoticesData())];
const newNotice = { id: 'n' + Date.now(), title, body, date: new Date().toISOString().slice(0, 10), priority };
list.unshift(newNotice);
noticesData = list;
try { localStorage.setItem(NOTICES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: noticesData })); } catch (e) {}
if (titleEl) titleEl.value = '';
if (bodyEl) bodyEl.value = '';
renderAdminNoticesList(); renderNoticesHome();
try {
const jsonStr = JSON.stringify({ notices: noticesData }, null, 2);
await githubPutFile('notices.json', utf8ToBase64(jsonStr), `Publish notice: ${title}`);
showToast('New notice published on the RPPF Cloud Server', 'success');
} catch (err) { reportSyncFail(err, 'The notice'); }
}
async function adminDeleteNotice(noticeId) {
openConfirmModal('Are you sure you want to delete this notice?', async () => {
const list = (await loadNoticesData()).filter(n => n.id !== noticeId);
noticesData = list;
try { localStorage.setItem(NOTICES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: noticesData })); } catch (e) {}
renderAdminNoticesList(); renderNoticesHome();
try {
const jsonStr = JSON.stringify({ notices: noticesData }, null, 2);
await githubPutFile('notices.json', utf8ToBase64(jsonStr), `Delete notice ${noticeId}`);
showToast('Notice deleted', 'success');
} catch (err) { reportSyncFail(err, 'The notice deletion'); }
});
}

initYearDropdown();
setDefaultMonth();
initLbTabs();
initTheme();
syncRateDropdownOptions();
applyLanguageUI();
initWelcomeBanner();
renderRecentSearchChips();
loadSavedSalary();
ensurePayslipFonts();
loadAreaMap().then(() => { updateSettingsAreaCount(); populateAreaDropdown(); });
renderNoticesHome();
loadTeamData();
setTimeout(startNoticePolling, 2000);
initAppModeOnStartup();

/* ===== Report Page, Rank Hub & ICC Drill-Down, Interactive Swipe & Scroll-Hide ===== */
function syncReportPageBanner() {
const strip = document.getElementById('reportEmpStrip');
const emptyCard = document.getElementById('reportEmptyCard');
const step7 = document.getElementById('step7');
if (!strip || !emptyCard || !step7) return;
if (currentResult && currentSearchId) {
strip.style.display = 'flex';
emptyCard.style.display = 'none';
step7.classList.add('show');
step7.style.display = 'block';
const idBadge = document.getElementById('reportEmpIdBadge');
const nameLbl = document.getElementById('reportEmpNameLbl');
const subLbl = document.getElementById('reportEmpSubLbl');
const monthLbl = document.getElementById('reportStripMonthLbl');
if (idBadge) idBadge.textContent = currentSearchId;
if (nameLbl) nameLbl.textContent = currentResult.name || currentSearchId;
const rawArea = currentResult.isRppf !== false ? getAreaForId(currentSearchId, true) : 'Other facility';
const areaName = rawArea === OVERALL_AREA ? 'Executives' : rawArea;
const ym = currentMonth || getCurrentMonth();
const [yy, mm] = String(ym).split('-');
const mIdx = (parseInt(mm, 10) || 1) - 1;
const niceMonth = `${BN_MONTHS[mIdx] || mm} ${yy}`;
if (subLbl) subLbl.textContent = `${areaName}${currentResult.grade ? ' • ' + currentResult.grade : ''}`;
if (monthLbl) monthLbl.textContent = `${niceMonth} (${ym})`;
if (currentPermanentPage === 'report' && window._rptCtx && window._rptCtx.emp) {
const h = document.getElementById('rptPreviewHost');
if (h && h.style.display !== 'block') toggleReportPreview();
else if (h && h.style.display === 'block') {
const wrap = document.getElementById('rptInnerScaleWrap');
if (wrap) wrap.innerHTML = _rptHtml(window._rptCtx, false);
}
}
} else {
strip.style.display = 'none';
emptyCard.style.display = 'block';
step7.classList.remove('show');
step7.style.display = 'none';
}
}
function initReportPage() {
syncReportPageBanner();
if (window._rptCtx && window._rptCtx.emp) {
const h = document.getElementById('rptPreviewHost');
if (h && h.style.display !== 'block') {
toggleReportPreview();
}
} else {
const pref = getPreferredId();
const inp = document.getElementById('reportQuickIdInput');
if (inp && pref && !inp.value) inp.value = pref;
}
}
async function searchFromReportPage() {
const inp = document.getElementById('reportQuickIdInput');
const raw = (inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
if (!raw) { showToast('Enter an employee ID number', 'warn'); inp?.focus(); return; }
const empInput = document.getElementById('employeeId');
if (empInput) { empInput.value = raw; toggleClearIdBtn(); }
await findReport();
switchPage('report');
}
let activeIccCriterion = 'duty';
let iccDrillOpen = false;
let availableServerMonths = null;
let probingMonthsPromise = null;
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
setTxt('hubSubAvgInOut', 'Average In-Time & Out-Time');
if (iccDrillOpen) renderIccDrillList();
}
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
const [yy, mm] = String(baseMonthStr).split('-').map(x => parseInt(x, 10));
const year = (yy >= 2020 && yy <= 2032) ? yy : new Date().getFullYear();
const maxM = mm ? Math.min(12, Math.max(1, mm)) : 12;
const out = [];
for (let m = 1; m <= maxM; m++) {
out.push(`${year}-${String(m).padStart(2, '0')}`);
}
return out;
}
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
avgInOut: 'Avg In & Out Time RPPF',
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
avgInOut: 'Avg In / Out',
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
function getCriterionListFromSource(f, crit) {
if (!f) return [];
if (crit === 'duty') return f.sortedByDuty || [];
if (crit === 'ot') return f.sortedByOT || [];
if (crit === 'earned') return f.sortedByEarned || [];
if (crit === 'plain') return f.sortedByPlain || [];
if (crit === 'lessDuty') return f.sortedByLessDuty || [];
if (crit === 'lessOt') return f.sortedByLessOT || [];
if (crit === 'avgDuty') {
if (!f.sortedByAvgDuty || !f.sortedByAvgDuty.length) {
const base = f._rawFiltered || f.allEmployees || f.sortedByDuty || [];
ensureEmpAvgStats(base);
f.sortedByAvgDuty = [...base].sort((a,b) => ((b.avgDutyPerDay || 0) - (a.avgDutyPerDay || 0)) || (b.totalDuty - a.totalDuty));
}
return f.sortedByAvgDuty;
}
if (crit === 'avgInOut') {
if (!f.sortedByAvgInOut || !f.sortedByAvgInOut.length) {
const base = f._rawFiltered || f.allEmployees || f.sortedByDuty || [];
ensureEmpAvgStats(base);
f.sortedByAvgInOut = [...base].sort((a,b) => ((a.avgInMins || 480) - (b.avgInMins || 480)) || ((b.avgOutMins || 1020) - (a.avgOutMins || 1020)));
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
return f.sortedByDuty || [];
}
function formatIccMainMetric(e, crit) {
if (crit === 'duty' || crit === 'lessDuty') return `${e.totalDuty || 0} hrs`;
if (crit === 'ot' || crit === 'lessOt') return `${e.otHours || 0} hrs`;
if (crit === 'earned') return `৳ ${Math.round(e.totalEarned || 0).toLocaleString('en-IN')}`;
if (crit === 'plain') return `${e.plainDaysCount || 0}d`;
if (crit === 'avgDuty') return `${e.avgDutyPerDay || Number(((e.totalDuty || 0) / 26).toFixed(1))} h/d`;
if (crit === 'avgInOut') return `${e.avgInTimeStr || '08:00'}–${e.avgOutTimeStr || '17:00'}`;
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
const ICC_RENDER_BATCH_SIZE = 60;
let _iccCurrentFilteredList = [];
let _iccRenderedCount = 0;
function buildIccRowHtml(e, myId, adminActive) {
const areaShort = (a) => a === 'Packing Hall' ? 'Packing' : a === 'Solid Production' ? 'Solid' : a === 'Softgel Production' ? 'Softgel' : a === OVERALL_AREA ? 'Executives' : (a || 'RPPF');
const rk = e._iccRank;
const isMine = e.id === myId;
const initials = String(e.name || e.id || 'R').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || 'RP';
const mainVal = formatIccMainMetric(e, activeIccCriterion);
const otNum = Math.round((Number(e.otHours) || 0) * 10) / 10;
const holNum = Number(e.holidayCount || 0);
const ngtNum = Number(e.nightCount || 0);
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
const adminCatBtnHtml = adminActive ? `<button type="button" class="icc-emp-cat-btn" onclick="event.stopPropagation(); openEmpAdminCatModal('${esc(e.id)}', '${esc(e.name || e.id)}')" title="Assign additional categories">+Cat</button>` : '';
return `<div class="icc-row ${rkClass} ${isMine ? 'mine' : ''}" onclick="viewEmployeeFromLeaderboard('${esc(e.id)}')">
<div class="icc-rank-col"><span class="icc-rank-num">${rk}</span></div>
<div class="icc-emp-col">
<div class="icc-avatar">${esc(initials)}</div>
<div class="icc-emp-text">
<div class="icc-emp-name">${esc(e.name || e.id)}${isMine ? ' (You)' : ''}${catBadgesHtml}</div>
<div class="icc-emp-sub">${esc(e.id)} • ${esc(areaShort(e.area))}${desig ? ' • ' + esc(desig) : ''}</div>${reqMetaUnderName}${absMetaUnderName}
</div>
${adminCatBtnHtml}
</div>
<div class="icc-val-col">
<div class="icc-val-main">${mainVal}</div>
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
pins: ['2026', '8941', '1234', 'admin1234']
},
'RF20716': {
id: 'RF20716',
name: 'Milon Ahamed',
mode: 'incharge',
roleTitle: 'In-Charge (SG)',
defaultArea: 'Softgel Production',
isAdmin: false,
pins: ['2026', '20716', '1234', 'admin1234']
},
'RF5473': {
id: 'RF5473',
name: 'Rabiul Alam',
mode: 'incharge',
roleTitle: 'Production Manager',
defaultArea: 'all',
isAdmin: false,
pins: ['2026', '5473', '1234', 'admin1234']
},
'RF20850': {
id: 'RF20850',
name: 'Md. Ariful Islam',
mode: 'incharge',
roleTitle: 'System Admin',
defaultArea: 'all',
isAdmin: true,
allowNormalBypass: true,
pins: ['admin1234', '2026', '20850', '1234']
},
'RF22111': {
id: 'RF22111',
name: 'Mr. Md. Sohel Mia',
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: 'Solid Production',
isAdmin: true,
allowNormalBypass: true,
pins: ['admin1234', '2026', '22111', '1234']
},
'CF5242': {
id: 'CF5242',
name: 'Mr. Md. Shohidul Islam',
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: 'Solid Production',
isAdmin: true,
allowNormalBypass: true,
pins: ['admin1234', '2026', '5242', '1234']
},
'CF8355': {
id: 'CF8355',
name: 'Mr. Johirul Islam Porag',
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: 'Solid Production',
isAdmin: true,
allowNormalBypass: true,
pins: ['admin1234', '2026', '8355', '1234']
},
'RF21561': {
id: 'RF21561',
name: 'Mr. MD. Rahid Hossain',
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: 'Packing Hall',
isAdmin: true,
allowNormalBypass: true,
pins: ['admin1234', '2026', '21561', '1234']
},
'RF22849': {
id: 'RF22849',
name: 'Mr. Md. Ashraful Alam',
mode: 'incharge',
roleTitle: 'ERP Team Admin',
defaultArea: 'Softgel Production',
isAdmin: true,
allowNormalBypass: true,
pins: ['admin1234', '2026', '22849', '1234']
},
'ADMIN': {
id: 'ADMIN',
name: 'Md. Ariful Islam (Admin)',
mode: 'incharge',
roleTitle: 'System Admin',
defaultArea: 'all',
isAdmin: true,
pins: ['admin1234', '2026', '1234']
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
// Show Admin Panel links ONLY when Admin is logged in
['moreAdminItemBtn', 'topnavAdminBtn', 'settingsAdminBtnWrap'].forEach(id => {
const el = document.getElementById(id);
if (el) el.style.display = admin ? '' : 'none';
});
// Show ⚙ Cat button in Ranking ONLY for Admin / In-Charge / Manager
const catBtn = document.getElementById('iccAdminCatToggleBtn');
if (catBtn) catBtn.style.display = isPriv ? 'inline-flex' : 'none';
// Show Mode row & Area row in Settings ONLY for In-Charge / Manager / Admin
const modeRow = document.getElementById('settingsModeRow');
if (modeRow) modeRow.style.display = isPriv ? 'flex' : 'none';
const incAreaRow = document.getElementById('settingsInchargeAreaRow');
if (incAreaRow) incAreaRow.style.display = isPriv ? 'flex' : 'none';
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
const validPins = [...(spec.pins || []), getAdminPassword(), DEFAULT_ADMIN_PASS, INCHARGE_PIN_CODE];
if (!rawPass || !validPins.includes(rawPass)) {
document.getElementById('specialRolePinError')?.classList.add('show');
showToast('Enter the valid password/PIN for ' + spec.name, 'error');
passInp?.focus();
return;
}
// Authenticated for Special Role!
const savedId = spec.id === 'ADMIN' ? (getPreferredId() || 'CF8355') : spec.id;
setPreferredId(savedId);
setAppMode(spec.mode);
setAdminLoggedIn(Boolean(spec.isAdmin || rawPass === getAdminPassword() || rawPass === DEFAULT_ADMIN_PASS));
try {
localStorage.setItem(INCHARGE_ROLE_KEY, `${spec.roleTitle} • ${spec.name}`);
localStorage.setItem(INCHARGE_AREA_KEY, spec.defaultArea || 'all');
} catch (e) {}
window._memInchargeRole = `${spec.roleTitle} • ${spec.name}`;
window._memInchargeArea = spec.defaultArea || 'all';
updateModeUI();
closeModeSetupModal();
showToast(`Welcome ${spec.name} (${spec.roleTitle})`, 'success');
if (spec.isAdmin) {
switchPage('admin');
} else {
const areaFilter = document.getElementById('areaFilter');
if (areaFilter && spec.defaultArea) areaFilter.value = spec.defaultArea;
switchPage('leaderboard');
}
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
savePermanentIdFromSettings = function() {
const inp = document.getElementById('settingsNewIdInput');
const raw = String(inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
if (!raw) {
showToast('Enter an ID number', 'warn');
inp?.focus();
return;
}
const spec = getSpecialRoleSpec(raw);
if (spec) {
if (inp) inp.value = '';
openModeSetupModal();
const regInp = document.getElementById('regEmpIdInput');
if (regInp) {
regInp.value = raw;
onRegEmpIdInputChange();
setTimeout(() => document.getElementById('specialRolePassInput')?.focus(), 120);
}
return;
}
setAdminLoggedIn(false);
setPreferredId(raw);
setAppMode('employee');
if (inp) inp.value = '';
updateModeUI();
showToast(`Saved ID "${raw}"`, 'success');
const empInput = document.getElementById('employeeId');
if (empInput) { empInput.value = raw; toggleClearIdBtn(); }
};
const _origDeletePermanentId = deletePermanentIdFromSettings;
deletePermanentIdFromSettings = function() {
setAdminLoggedIn(false);
window._memInchargeRole = null;
window._memInchargeArea = null;
_origDeletePermanentId();
syncPrivilegedUI();
};
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
if (trimmed === getAdminPassword() || trimmed === DEFAULT_ADMIN_PASS || trimmed === '1234') {
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
} else if (activePage === 'admin') {
initAdminPage();
showToast('Admin panel refreshed', 'success');
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

/* ===== Hardware Back Button Prevention (History API popstate + Double-Back to Exit) ===== */
let _lastHardwareBackTs = 0;
let _suppressHistoryPush = false;
function pushAppNavState(label) {
// Zero-cost no-op: hardware back-button guard maintains a single startup history entry re-pushed only on popstate
}
(function initHardwareBackButtonGuard() {
try {
history.replaceState({ renataGuard: true, view: 'root', ts: Date.now() }, '');
history.pushState({ renataGuard: true, view: 'home', ts: Date.now() }, '');
} catch (e) {}
window.addEventListener('popstate', () => {
_suppressHistoryPush = true;
try {
// 1. Close any open modal first
const openModals = [
['adminCatAuthModal', closeAdminCatAuthModal],
['empAdminCatModal', closeEmpAdminCatModal],
['lbFullListModal', closeLbFullList],
['rateChartModal', closeRateChartModal],
['modeSetupModal', closeModeSetupModal],
['erpSupportModal', closeErpSupportModal],
['confirmActionModal', closeConfirmModal],
['complianceModal', closeComplianceModal],
['welcomeBackModal', () => closeWelcomeBackModal(true)]
];
for (const [mId, closeFn] of openModals) {
const el = document.getElementById(mId);
if (el && el.classList.contains('open')) {
closeFn();
try { history.pushState({ renataGuard: true, view: 'modal-closed', ts: Date.now() }, ''); } catch (e) {}
return;
}
}
// 2. If Ranking Full View (#iccRankDrillView) is open, return to Rank Hub
if (typeof iccDrillOpen !== 'undefined' && iccDrillOpen) {
closeRankDrillDown();
try { history.pushState({ renataGuard: true, view: 'rank-hub', ts: Date.now() }, ''); } catch (e) {}
return;
}
// 3. If a More sub-page (admin, notices, team, history, settings) is open, return to More drawer
if (currentSideDrawerPage && MORE_PAGES.includes(currentSideDrawerPage)) {
switchPage('more', true);
try { history.pushState({ renataGuard: true, view: 'more', ts: Date.now() }, ''); } catch (e) {}
return;
}
// 4. If a side drawer (Rank or More) is open, close the side drawer
if (currentSideDrawerPage) {
closeSideDrawer();
try { history.pushState({ renataGuard: true, view: currentPermanentPage, ts: Date.now() }, ''); } catch (e) {}
return;
}
// 5. If on Report or VS permanent tab, return to Home ('search')
if (currentPermanentPage !== 'search') {
switchPage('search', true);
try { history.pushState({ renataGuard: true, view: 'search', ts: Date.now() }, ''); } catch (e) {}
return;
}
// 6. Already on Home with nothing open: require double-back within 2.2s to exit
const now = Date.now();
if (now - _lastHardwareBackTs > 2200) {
_lastHardwareBackTs = now;
showToast('Press back again to exit app', 'info');
try { history.pushState({ renataGuard: true, view: 'home-guard', ts: now }, ''); } catch (e) {}
}
} finally {
_suppressHistoryPush = false;
}
});
})();

/* ===== Notice ticker (report page only) ===== */
function renderNoticeTicker(list) {
const bar = document.getElementById('noticeTicker'), track = document.getElementById('ntTrack');
if (!bar || !track) return;
const items = (Array.isArray(list) ? list : []).slice(0, 5);
if (!items.length) { bar.hidden = true; return; }
const one = '<div class="nt-half">' + items.map(n => `<span class="nt-item${n.priority === 'high' ? ' hi' : ''}"><b>${esc(n.title || '')}</b>${n.body ? ' — ' + esc(String(n.body).replace(/\s+/g, ' ').slice(0, 90)) : ''}</span>`).join('') + '</div>';
track.innerHTML = one + one;
const chars = items.reduce((s, n) => s + String(n.title || '').length + Math.min(90, String(n.body || '').length) + 6, 0);
track.style.animationDuration = Math.max(14, Math.round(chars * 0.22)) + 's';
bar.hidden = false;
}

/* ===== Daily report preview + PNG ===== */
function _loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
const _RMON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], _RDAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const _rE = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _rN = v => { v = Number(v) || 0; return v ? String(Math.round(v * 100) / 100) : ''; };
const _rMin = t => { const q = String(t).match(/^(\d{1,2}):(\d{2})/); return q ? +q[1] * 60 + +q[2] : null; };
function _rptRows(ctx) {
const e = ctx.emp, daily = Array.isArray(e.daily) ? e.daily : [];
let y = 0, m = 0;
const mm = String(ctx.month || e._computedMonth || '').match(/(\d{4})-(\d{2})/);
if (mm) { 
  y = +mm[1]; m = +mm[2]; 
} else if (daily.length > 0 && daily[0] && daily[0][0]) {
  const s0 = String(daily[0][0]).trim();
  const qAlpha = s0.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/i);
  if (qAlpha) {
    y = +qAlpha[3];
    m = _RMON.findIndex(x => x.toUpperCase() === qAlpha[2].toUpperCase()) + 1;
  } else {
    const qIso = s0.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (qIso) {
      y = +qIso[1];
      m = +qIso[2];
    } else {
      const qSlash = s0.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
      if (qSlash) {
        m = +qSlash[2];
        y = qSlash[3] ? +qSlash[3] : 2026;
      }
    }
  }
}
if (!y || m < 1 || m > 12) {
  const curM = (typeof currentLeaderboardResult !== 'undefined' && currentLeaderboardResult && currentLeaderboardResult.month)
    || (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
  const curMatch = String(curM).match(/(\d{4})-(\d{2})/);
  if (curMatch) {
    y = +curMatch[1];
    m = +curMatch[2];
  } else {
    const n = new Date(); y = n.getFullYear(); m = n.getMonth() + 1;
  }
}
const mNumStr = String(m).padStart(2, '0');
const ymStr = `${y}-${mNumStr}`;
const { byDay, hasDaily } = _buildEmpDayMap(e);
const dsMeta = getMonthDatasetMeta(ymStr);
const maxDatasetDay = dsMeta.maxActiveDay || 31;
const consensusHols = dsMeta.consensusHolidays;
const prevMonthNight = (typeof ctx.prevNight === 'boolean')
  ? ctx.prevNight
  : (ctx.prevNight instanceof Set ? (ctx.prevNight.has(String(e.id || '').toUpperCase()) || ctx.prevNight.has(resolveEmpAliasId(e.id))) : hasPrevMonthLastNight(e.id, ymStr, e));

const rows = [], last = new Date(y, m, 0).getDate();
for (let d = 1; d <= last; d++) {
const dn = _RDAY[new Date(y, m - 1, d).getDay()], o = byDay[d];
const dStr = String(d).padStart(2, '0');
const isoDateStr = `${y}-${mNumStr}-${dStr}`;
const row = { date: dStr + '/' + mNumStr, dayNum: dStr, monthNum: mNumStr, day: dn, v: [0, 0, 0, 0, 0, 0], inn: '', out: '', night: false, tone: '', note: '' };
if (!o) {
const holCheck = isPlantOrGovtHolidayDate(y, m, d, dn, consensusHols);
const wk = holCheck.isWeekend;
const afterPrevMonthNight = (d === 1 && prevMonthNight);
const afterSameMonthNight = (d > 1 && byDay[d - 1] && byDay[d - 1].night);
const afterNight = afterPrevMonthNight || afterSameMonthNight;
const leaveRec = (typeof isEmployeeOnApprovedLeave === 'function') ? isEmployeeOnApprovedLeave(e.id, isoDateStr) : null;

if (afterNight) {
  row.tone = 'offn';
  row.note = (afterPrevMonthNight ? 'Day off after night (Prev Month)' : 'Day off after night') + (wk ? ' (Weekend)' : '');
  row.afterNight = true;
  if (afterPrevMonthNight) row.crossMonthAfterNight = true;
} else if (leaveRec) {
  row.tone = 'off';
  row.note = `Approved Leave (${leaveRec.category || 'Leave'})`;
  row.isApprovedLeave = true;
} else if (holCheck.isOffOrHol) {
  row.tone = 'off';
  row.note = holCheck.label || (wk ? 'Weekend (Thu/Fri)' : 'Plant / Govt Holiday');
} else if (d > maxDatasetDay) {
  row.tone = 'none';
  row.note = 'Upcoming / Not recorded';
} else if (!hasDaily && Number(e.totalDuty || 0) > 0 && !Array.isArray(e.activeDayNums)) {
  row.tone = 'none';
  row.note = 'No daily log cached';
} else {
  // True General Working Day Absent
  row.tone = 'absent';
  row.note = '🔴 Absent (General Working Day)';
  row.isGeneralAbsent = true;
}
}
else {
Object.assign(row, { v: [0, 1, 2, 3, 4, 5].map(i => Number(o.v[i]) || 0), night: o.night });
const mi = o.forceMiss || (daily.length && isPunchMissing(o.inn)), mo = o.forceMiss || (daily.length && isPunchMissing(o.out));
row.inn = mi ? 'MISSING' : o.inn; row.out = mo ? 'MISSING' : o.out; row.missIn = !!mi; row.missOut = !!mo;
if (mi || mo) { row.tone = 'bad'; row.note = mi && mo ? 'In & Out punch missing' : mi ? 'In punch missing' : 'Out punch missing'; }
else {
const a = _rMin(o.inn), b = _rMin(o.out);
if (a != null && b != null && b <= a && !o.night) { row.tone = 'bad'; row.note = 'Out is before In'; row.missOut = true; }
else if (row.v[4] || row.v[5]) { row.tone = 'hol'; row.note = 'Holiday duty'; }
else if (row.v[2] || row.v[3]) { row.tone = 'do'; row.note = 'Day off duty'; }
else if (row.v[1]) row.note = 'Overtime';
if (o.night) row.note += (row.note ? ' + ' : '') + 'Night';

// REQUISITION PROBLEM DETECTION & HIGHLIGHT
const parseM = (t) => {
  if (!t) return null;
  const mm = String(t).replace(/[^0-9:]/g, '').match(/^(\d{1,2}):(\d{2})/);
  return mm ? parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) : null;
};
const ti = parseM(o.inn), to = parseM(o.out);
const totOt = (Number(o.v[1]) || 0) + (Number(o.v[3]) || 0) + (Number(o.v[5]) || 0);
const totDuty = (Number(o.v[0]) || 0) + (Number(o.v[2]) || 0) + (Number(o.v[4]) || 0);
let elHrs = 0;
if (ti !== null && to !== null) {
  const diff = to < ti ? (1440 - ti) + to : to - ti;
  elHrs = Number((diff / 60).toFixed(2));
}

if (totOt === 0 && !mi && !mo) {
  let isReq = false, reqNote = '';
  if (o.night && (elHrs >= 11.0 || totDuty >= 11.0)) {
    isReq = true;
    const exp = Math.min(7, Math.max(4, Math.round(Math.max(elHrs, totDuty) - 8.5)));
    reqNote = `⚠️ Night OT Missing (${exp}h OT)`;
  }
  else if (!o.night && to !== null && to >= 1150 && to <= 1215) {
    isReq = true; reqNote = '⚠️ 3h OT Missing (04:30-07:30 PM)';
  }
  else if (!o.night && to !== null && to >= 1216 && to <= 1350) {
    isReq = true; reqNote = '⚠️ 5h OT Missing (04:30-09:30 PM)';
  }
  else if (!o.night && ti !== null && ti <= 435 && elHrs >= 9.5) {
    isReq = true; reqNote = ti <= 390 ? '⚠️ 2.5h Morning OT Missing' : '⚠️ 1.0h Morning OT Missing';
  }

  if (isReq) {
    row.tone = 'req';
    row.reqProblem = true;
    row.note = reqNote + (row.note ? ' [' + row.note + ']' : '');
  }
}
}
}
rows.push(row);
}
return { rows, y, m };
}
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
function _rptHtml(ctx, forExport) {
const e = ctx.emp, { rows, y, m } = _rptRows(ctx);
const sum = [0, 0, 0, 0, 0, 0]; let present = 0, nights = 0, issues = 0;
rows.forEach(r => { r.v.forEach((x, i) => sum[i] += x); if (r.inn || r.out) present++; if (r.night) nights++; if (r.tone === 'bad') issues++; });
const displayRows = _rptHideEmptyDays
? rows.filter(r => r.inn || r.out || r.tone === 'bad' || r.v.some(x => x > 0) || r.night)
: rows;
const BG = { bad: '#fecaca', hol: '#fff6e6', do: '#f3effc', none: '#f8fafc', off: '#f1f5f9', req: '#fef3c7', absent: '#fee2e2' };
const fsCell = forExport ? '12.5px' : '11px';
const fsSmall = forExport ? '11.5px' : '10.5px';
const fsHead = forExport ? '11.5px' : '10px';
const padCell = forExport ? '5px 3px' : '4px 2px';
const tdBase = `padding:${padCell};border:1px solid #cbd5e1;font-size:${fsCell};line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;`;
const thBase = `padding:7px 2px;border:1px solid #0f172a;background:#0f172a;color:#fff;font-size:${fsHead};font-weight:800;line-height:1.15;text-align:center;vertical-align:middle;word-break:normal;overflow-wrap:normal;`;
const chip = (t, c, bg) => `<span style="display:inline-block;margin:0 4px 4px 0;padding:3px 8px;border-radius:99px;font-size:${forExport ? '12px' : '11px'};font-weight:800;color:${c};background:${bg};">${t}</span>`;
const colHeaders = [
{ label: 'Date<br><span style="font-weight:600;opacity:.85;">Day</span>', w: '14.5%' },
{ label: 'In<br>Time', w: '8.5%' },
{ label: 'Out<br>Time', w: '8.5%' },
{ label: 'Reg<br>Duty', w: '8.0%' },
{ label: 'Reg<br>OT', w: '6.6%' },
{ label: 'DO<br>Duty', w: '8.0%' },
{ label: 'DO<br>OT', w: '6.6%' },
{ label: 'Hol<br>Duty', w: '8.0%' },
{ label: 'Hol<br>OT', w: '6.6%' },
{ label: 'Night', w: '6.2%' },
{ label: 'Status /<br>Remark', w: '18.5%' }
];
const body = displayRows.map(r => {
const bad = r.tone === 'bad', col = r.tone === 'none' || r.tone === 'off' ? '#64748b' : '#0f172a';
const cell = (v) => `<td style="${tdBase}text-align:center;font-weight:700;${v ? 'color:#0f172a;' : 'color:#94a3b8;'}">${_rN(v)}</td>`;
const fmtTime = (t) => String(t || '').replace(/^(\d{2}:\d{2}):\d{2}$/, '$1');
const pc = (txt, miss) => `<td style="${tdBase}text-align:center;font-size:${fsSmall};font-weight:${miss ? '800' : '600'};${miss ? 'background:#f87171;color:#7f1d1d;' : ''}">${_rE(miss ? 'MISS' : fmtTime(txt))}</td>`;
const dayBadgeColor = (r.day === 'Thu' || r.day === 'Fri') ? '#dc2626' : '#475569';
return `<tr style="background:${BG[r.tone] || '#fff'};color:${col};">
<td style="${tdBase}text-align:left;padding-left:4px;padding-right:3px;font-weight:800;font-size:${fsSmall};${bad ? 'color:#b91c1c;' : ''}"><div style="display:flex;justify-content:space-between;align-items:center;gap:2px;"><span>${r.date}</span><span style="font-size:10px;font-weight:700;color:${bad ? '#b91c1c' : dayBadgeColor};">${r.day}</span></div></td>
${pc(r.inn, r.missIn)}${pc(r.out, r.missOut)}${r.v.map(x => cell(x)).join('')}
<td style="${tdBase}text-align:center;font-weight:800;font-size:${fsSmall};color:#6d28d9;">${r.night ? 'Yes' : ''}</td>
<td style="${tdBase}white-space:normal;padding-left:4px;padding-right:3px;font-size:${fsSmall};line-height:1.15;${bad ? 'color:#b91c1c;font-weight:800;' : 'font-weight:600;'}">${_rE(r.note)}</td></tr>`;
}).join('');
const issueDates = rows.filter(r => r.tone === 'bad').map(r => r.date);
const containerStyle = forExport
? 'background:#fff;color:#0f172a;font-family:"Hind Siliguri",Arial,Helvetica,sans-serif;padding:14px 12px;width:720px;box-sizing:border-box;'
: 'background:#fff;color:#0f172a;font-family:"Hind Siliguri",Arial,Helvetica,sans-serif;padding:10px 6px;width:100%;min-width:540px;box-sizing:border-box;';
return `<div style="${containerStyle}">
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;border-bottom:2px solid #0f172a;padding-bottom:7px;margin-bottom:7px;">
<div style="min-width:0;"><div style="font-size:${forExport ? '19px' : '16px'};font-weight:900;color:#0f172a;letter-spacing:-.01em;line-height:1.15;">RPPF</div><div style="font-size:${forExport ? '12.5px' : '11.5px'};font-weight:700;color:#475569;margin-top:2px;">Monthly Work Log • ${_RMON[m - 1]} ${y}${_rptHideEmptyDays ? ' (Duty Days)' : ''}</div></div>
<div style="text-align:right;min-width:0;"><div style="font-size:${forExport ? '15px' : '13.5px'};font-weight:900;color:#0f172a;line-height:1.2;">${_rE(ctx.id)} — ${_rE(e.name || '')}</div><div style="font-size:${forExport ? '12px' : '11px'};font-weight:700;color:#475569;margin-top:1px;">${_rE([e.grade, e.area, e.designation].filter(Boolean).join(' | '))}</div></div></div>
<div style="margin-bottom:6px;">${chip('Present: ' + present + 'd', '#1d4ed8', '#dbeafe')}${chip('Total OT: ' + (Math.round((sum[1] + sum[3] + sum[5]) * 100) / 100) + 'h', '#15803d', '#dcfce7')}${chip('Night: ' + nights, '#6d28d9', '#ede9fe')}${chip(issues ? 'Punch Fix: ' + issues : 'Punch OK', issues ? '#b91c1c' : '#15803d', issues ? '#fee2e2' : '#dcfce7')}</div>
<table style="border-collapse:collapse;width:100%;table-layout:fixed;">
<colgroup>${colHeaders.map(c => `<col style="width:${c.w};">`).join('')}</colgroup>
<thead><tr style="height:40px;">${colHeaders.map(c => `<th style="${thBase}">${c.label}</th>`).join('')}</tr></thead>
<tbody>${body}</tbody>
<tfoot><tr style="background:#0f172a;color:#fff;font-weight:900;height:30px;"><td colspan="3" style="${tdBase}padding-left:6px;font-size:${fsSmall};color:#fff;border-color:#0f172a;">Total (${present}d present)</td>${sum.map(x => `<td style="${tdBase}text-align:center;font-size:${fsSmall};color:#fff;border-color:#0f172a;">${_rN(x)}</td>`).join('')}<td style="${tdBase}text-align:center;font-size:${fsSmall};color:#fff;border-color:#0f172a;">${nights || ''}</td><td style="${tdBase}border-color:#0f172a;"></td></tr></tfoot></table>
<div style="margin-top:7px;font-size:12px;font-weight:800;color:${issues ? '#b91c1c' : '#15803d'};">${issues ? 'Punch problem on ' + issues + ' day(s): ' + issueDates.join(', ') : 'No missing In/Out punch found in this report.'}</div>
${reqIssues ? `<div style="margin-top:4px;font-size:12px;font-weight:800;color:#b45309;background:#fef3c7;padding:4px 8px;border-radius:4px;border:1px solid #f59e0b;">⚠️ Overtime Requisition Pending on ${reqIssues} day(s): ${rows.filter(r => r.tone === 'req').map(r => r.date).join(', ')} (Worked OT but Empress shows 0 OT)</div>` : ''}
<div style="margin-top:2px;font-size:10.5px;font-weight:600;color:#64748b;">Generated from RPPF Overtime Report App</div></div>`;
}
function _rptReset() { const h = document.getElementById('rptPreviewHost'); if (h) { h.style.display = 'none'; h.innerHTML = ''; } const b = document.getElementById('rptPreviewBtn'); if (b) b.textContent = 'Preview daily report ▼'; }
function toggleReportPreview() {
const h = document.getElementById('rptPreviewHost'), b = document.getElementById('rptPreviewBtn'), ctx = window._rptCtx;
if (!ctx || !ctx.emp) { showToast('Search a report first', 'warn'); return; }
if (h.style.display === 'block') { _rptReset(); return; }
_rptZoomLevel = 1;
const zoomBar = `<div class="rpt-zoom-bar" style="flex-wrap:wrap;gap:6px;">
<div class="rpt-zoom-btns">
<button type="button" class="rpt-zoom-btn rpt-filter-btn ${!_rptHideEmptyDays ? 'active' : ''}" data-hide-empty="0" onclick="toggleReportDutyFilter(false)">Full Month</button>
<button type="button" class="rpt-zoom-btn rpt-filter-btn ${_rptHideEmptyDays ? 'active' : ''}" data-hide-empty="1" onclick="toggleReportDutyFilter(true)">Duty Days Only</button>
</div>
<div class="rpt-zoom-btns">
<button type="button" class="rpt-zoom-btn" data-zoom="0.85" onclick="setReportZoom(0.85)">Fit</button>
<button type="button" class="rpt-zoom-btn active" data-zoom="1" onclick="setReportZoom(1)">100%</button>
<button type="button" class="rpt-zoom-btn" data-zoom="1.15" onclick="setReportZoom(1.15)">115%</button>
</div>
</div>`;
h.innerHTML = zoomBar + '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:10px;background:#fff;"><div id="rptInnerScaleWrap">' + _rptHtml(ctx, false) + '</div></div>';
h.style.display = 'block'; b.textContent = 'Hide daily report ▲';
}
async function downloadReportPNG(share) {
const ctx = window._rptCtx;
if (!ctx || !ctx.emp) { showToast('Search a report first', 'warn'); return; }
const btns = ['pngDlBtn', 'pngShareBtn'].map(i => document.getElementById(i)).filter(Boolean);
btns.forEach(b => b.disabled = true); showToast('Creating PNG...', 'info');
const box = document.createElement('div');
box.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff;'; box.innerHTML = _rptHtml(ctx, true); document.body.appendChild(box);
try {
if (!window.html2canvas) await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
const canvas = await html2canvas(box.firstElementChild, { scale: 2.5, backgroundColor: '#ffffff' });
const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
const { y, m } = _rptRows(ctx), name = `WorkLog_${ctx.id}_${y}-${String(m).padStart(2, '0')}.png`;
const file = new File([blob], name, { type: 'image/png' });
if (share && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); } catch (err) { if (err && err.name !== 'AbortError') throw err; } }
else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
} catch (err) {
showToast('Could not create the PNG. Check your internet connection and try again.', 'error');
} finally { box.remove(); btns.forEach(b => b.disabled = false); }
}
(function () { const b = document.getElementById('pngShareBtn'); if (b && typeof navigator.canShare === 'function') b.style.display = ''; })();


/* ===== Cross-Tab Live Sync with Standalone admin.html ===== */
function openStandaloneAdminFile() {
  const targetUrl = (location.protocol === 'http:' || location.protocol === 'https:')
    ? new URL('admin.html', location.href).href
    : (REMOTE_BASE_URL + 'admin.html');
  window.open(targetUrl, '_blank', 'noopener');
}
(function initCrossTabAdminSync() {
  const refreshFromAdminSync = () => {
    AREA_MAP_LOADED = false;
    Object.keys(monthIndexMemoryCache).forEach(k => delete monthIndexMemoryCache[k]);
    loadAreaMap().then(() => {
      updateSettingsAreaCount();
      populateAreaDropdown();
      if (currentSearchId) findReport();
      if (currentSideDrawerPage === 'leaderboard' || iccDrillOpen) startLeaderboardScan(true);
      renderNoticesHome();
    });
  };
  window.addEventListener('storage', (e) => {
    if (!e || !e.key) return;
    if (e.key === LAST_ADMIN_SYNC_KEY || e.key === AREA_MAP_CACHE_KEY || e.key === NOTICES_CACHE_KEY || e.key === TEAM_CACHE_KEY) {
      refreshFromAdminSync();
    }
  });
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const ch = new BroadcastChannel('rppf_admin_sync');
      ch.onmessage = () => refreshFromAdminSync();
    } catch (e) {}
  }
})();



/* ===== Standalone Admin Control Panel (admin.html) Boot & Live Broadcast Sync ===== */

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

const ABSENT_CACHE_KEY = STORAGE_NAMESPACE + 'renata_absent_data_v1';
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
};

// Block 'earned' criterion in In-Charge mode
const _prevOpenRankDrillDown = openRankDrillDown;
openRankDrillDown = function(criterion) {
  if (getAppMode() === 'incharge' && criterion === 'earned') {
    criterion = 'duty';
  }
  return _prevOpenRankDrillDown(criterion);
};

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
let ABSENT_STORE = {
  activeDate: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString(),
  updatedBy: 'ERP Team',
  byDate: {}
};
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
      localStorage.setItem(LAST_ADMIN_SYNC_KEY, String(Date.now()));
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
    showToast(`Absent list NOT saved to server: ${err.message}`, 'error');
  }
}

/* ==========================================================================
   IN-CHARGE HOME OVERVIEW DASHBOARD
   ========================================================================== */
function openInchargeAreaRanking(areaVal) {
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

  const rppfActive = list.filter(e => e && e.isRppf !== false && e.valid !== false && isMappedAreaId(e.id));
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
      valFn: e => `${e.nightCount || 0} nights`,
      drillKey: 'duty'
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
    ? monthList.filter(e => e && e.isRppf !== false && e.valid !== false && isMappedAreaId(e.id))
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

  renderInchargeHomeAbsentList();
  renderInchargeHomeToppers();
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
function onAdmAbsentDateChange(val) {
  if (!val) return;
  ABSENT_STORE.activeDate = val;
  renderAdminAbsentPane();
}

function admAddSingleAbsentEmployee() {
  const inp = _el('admAbsentSingleInp');
  const dt = _el('admAbsentDateInput')?.value || getTodayDateStr();
  const reason = _el('admAbsentReasonInput')?.value || 'Absent';
  const note = (_el('admAbsentShiftInput')?.value || '').trim();
  const raw = (inp?.value || '').trim();
  if (!raw) { showToast('Enter an employee ID or select from suggestions', 'warn'); inp?.focus(); return; }
  const ok = upsertAbsentEmployee(dt, raw, reason, note);
  if (!ok) {
    showToast('Employee ID not recognized. Enter a valid ID (e.g. CF8355)', 'warn');
    return;
  }
  if (inp) inp.value = '';
  renderAdminAbsentPane();
  renderInchargeHomeAbsentList();
  showToast(`Added to ${dt} absent list`, 'success');
}

function admAddBulkAbsentEmployees() {
  const ta = _el('admAbsentBulkTextarea');
  const dt = _el('admAbsentDateInput')?.value || getTodayDateStr();
  const reason = _el('admAbsentReasonInput')?.value || 'Absent';
  const note = (_el('admAbsentShiftInput')?.value || '').trim();
  const ids = extractEmployeeIdsFromText(ta?.value || '');
  if (!ids.length) { showToast('No valid employee IDs found in text box', 'warn'); ta?.focus(); return; }
  ids.forEach(id => upsertAbsentEmployee(dt, id, reason, note));
  if (ta) ta.value = '';
  renderAdminAbsentPane();
  renderInchargeHomeAbsentList();
  showToast(`${ids.length} employee(s) added to ${dt} absent list`, 'success');
}

function copyAbsentSummaryText() {
  const dt = _el('admAbsentDateInput')?.value || getSelectedAbsentDate();
  const list = getAbsentListForDate(dt);
  if (!list.length) { showToast('Absent list is empty for this date', 'warn'); return; }
  const lines = list.map((x, i) => `${i + 1}. ${x.name || x.id} (${x.id}) — ${x.area}${x.sub ? ' [' + x.sub + ']' : ''} — ${x.reason || 'Absent'}${x.note ? ' (' + x.note + ')' : ''}`);
  const txt = `RPPF Daily Absent Report (${dt})\nTotal Absent: ${list.length}\n\n${lines.join('\n')}`;
  fallbackCopyText(txt);
}

function renderAdminAbsentPane() {
  try { renderAdminLongTermLeaves(); admLtPopulateEmployeeDatalist(); } catch(e) {}
  const container = _el('admAbsentItemsContainer');
  const dtInp = _el('admAbsentDateInput');
  if (!container) return;
  const dt = (dtInp && dtInp.value) ? dtInp.value : (ABSENT_STORE.activeDate || getTodayDateStr());
  if (dtInp && !dtInp.value) dtInp.value = dt;

  const allList = getAbsentListForDate(dt);
  const solidCnt = allList.filter(x => x.area === 'Solid Production').length;
  const sgCnt = allList.filter(x => x.area === 'Softgel Production').length;
  const packCnt = allList.filter(x => x.area === 'Packing Hall').length;
  const setN = (id, v) => { const el = _el(id); if (el) el.textContent = String(v); };
  setN('admAbsCountTotal', allList.length);
  setN('admAbsCountSolid', solidCnt);
  setN('admAbsCountSg', sgCnt);
  setN('admAbsCountPack', packCnt);

  const hdr = _el('admAbsentListHeaderTitle');
  if (hdr) hdr.textContent = `Absent Employees on ${dt} (${allList.length}):`;

  const areaFilter = _el('admAbsentFilterArea')?.value || 'all';
  const q = (_el('admAbsentSearchFilter')?.value || '').trim().toUpperCase();
  const filtered = allList.filter(x => {
    if (areaFilter !== 'all' && x.area !== areaFilter) return false;
    if (q) {
      const hay = `${x.id} ${x.name || ''} ${x.area || ''} ${x.sub || ''} ${x.reason || ''} ${x.note || ''}`.toUpperCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-msg" style="padding:18px;">No absent employees listed for ${esc(dt)}${areaFilter !== 'all' || q ? ' matching filter' : ''}.</div>`;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const dirRec = resolveEmployeeDirectoryRecord(item.id);
    const dispName = (item.name && item.name !== item.id) ? item.name : (dirRec?.name || item.id);
    return `<div class="admin-absent-list-item">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;font-size:14px;color:var(--text);">${esc(dispName)} <span class="admin-tag">${esc(item.id)}</span> <span class="admin-tag" style="background:var(--danger-bg);color:var(--danger);border-color:var(--danger-border);">${esc(item.reason || 'Absent')}</span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">Area: <b>${esc(item.area || 'RPPF')}</b>${item.sub ? ' • Sub: <b>' + esc(item.sub) + '</b>' : ''} • ${esc(item.designation || 'Employee')}${item.note ? ' • Note: ' + esc(item.note) : ''}</div>
      </div>
      <button type="button" class="calc-mini-btn danger-btn" onclick="removeAbsentEmployee('${esc(dt)}', '${esc(item.id)}')">✕ Remove</button>
    </div>`;
  }).join('');
}


/* ==========================================================================
   STRICT PRODUCTION SECTION EMPLOYEE DIRECTORY & AUTOCOMPLETE
   ========================================================================== */
const ALLOWED_SECTIONS = ['Solid Production', 'Softgel Production', 'Packing Hall', 'Overall'];

function isListedEmployeeId(id) {
  if (!id) return false;
  const upper = String(id).toUpperCase().trim();
  const area = AREA_MAP[upper];
  return Boolean(area && ALLOWED_SECTIONS.includes(area));
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
            <span>${esc(dispName)}</span>
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
    const trs = Array.from(table.querySelectorAll('tr'));
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


/* ==========================================================================
   MODERN ADMIN ORGANIZER & UNASSIGNED QUEUE JAVASCRIPT CONTROLLERS
   ========================================================================== */
let _admCurrentActiveSection = 'Solid Production';
let _admCurrentActiveSub = ''; // '' means all
let _admTableSelectedIds = new Set();
let _admUnassignedList = [];
let _admUnassignedSelectedIds = new Set();

function adminSelectSectionCard(area) {
  _admCurrentActiveSection = area;
  _admCurrentActiveSub = '';
  _admTableSelectedIds.clear();

  document.querySelectorAll('.adm-sec-card-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === ('secCard' + (area === 'Solid Production' ? 'Solid' : area === 'Softgel Production' ? 'Softgel' : area === 'Packing Hall' ? 'Packing' : 'Overall')));
  });

  const titleEl = document.getElementById('admCurrentSecName');
  if (titleEl) titleEl.textContent = area === 'Overall' ? 'Executives' : area;

  // Also sync the legacy target area select so legacy handlers work
  const legAreaSel = document.getElementById('adminTargetAreaSelect');
  if (legAreaSel) {
    legAreaSel.value = area;
    populateAdminSubSelect();
  }

  adminRenderSubPills();
  adminFilterEmployeeTable();
  adminUpdateAllKpiCounters();
}

function adminRenderSubPills() {
  const container = document.getElementById('admSubPillsContainer');
  if (!container) return;

  const area = _admCurrentActiveSection;
  const subs = AREA_SUBS[area] || [];
  
  // Count total in section
  const sectionIds = Object.keys(AREA_MAP || {}).filter(id => AREA_MAP[id] === area);
  const totalCount = sectionIds.length;

  let html = `<button type="button" class="adm-sub-pill-btn ${_admCurrentActiveSub === '' ? 'active' : ''}" onclick="adminFilterSubPill('')">
    <span>All Sub-sections</span>
    <span class="adm-sub-pill-count">${totalCount}</span>
  </button>`;

  let unassignedSubCount = 0;
  sectionIds.forEach(id => {
    const s = (AREA_DETAILS[id] || {}).s;
    if (!s) unassignedSubCount++;
  });

  subs.forEach(subName => {
    const count = sectionIds.filter(id => (AREA_DETAILS[id] || {}).s === subName).length;
    html += `<button type="button" class="adm-sub-pill-btn ${_admCurrentActiveSub === subName ? 'active' : ''}" onclick="adminFilterSubPill('${esc(subName)}')">
      <span>${esc(subName)}</span>
      <span class="adm-sub-pill-count">${count}</span>
      <span onclick="event.stopPropagation();adminDeleteSubConfirm('${esc(subName)}')" title="Delete sub-section" style="margin-left:3px;opacity:0.6;font-size:10px;">✕</span>
    </button>`;
  });

  if (unassignedSubCount > 0) {
    html += `<button type="button" class="adm-sub-pill-btn ${_admCurrentActiveSub === '__none__' ? 'active' : ''}" onclick="adminFilterSubPill('__none__')">
      <span>General / Unassigned Sub</span>
      <span class="adm-sub-pill-count">${unassignedSubCount}</span>
    </button>`;
  }

  container.innerHTML = html;

  // Also populate batch sub-section dropdown
  const batchSubSel = document.getElementById('admBatchTargetSubSelect');
  if (batchSubSel) {
    batchSubSel.innerHTML = '<option value="">Move to Sub-section...</option><option value="__none__">Clear Sub-section</option>' +
      subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  }
}

function adminFilterSubPill(subName) {
  _admCurrentActiveSub = subName;
  adminRenderSubPills();
  adminFilterEmployeeTable();
}

function adminQuickAddSubsection() {
  const inp = document.getElementById('adminQuickNewSubInput');
  const val = (inp?.value || '').trim();
  if (!val) { showToast("Enter a sub-section name", "warn"); return; }
  const area = _admCurrentActiveSection;
  AREA_SUBS[area] = AREA_SUBS[area] || [];
  if (AREA_SUBS[area].includes(val)) {
    showToast("This sub-section already exists in " + area, "warn");
    return;
  }
  AREA_SUBS[area].push(val);
  persistAreaSubs();
  inp.value = '';
  showToast(`Added sub-section "${val}" to ${area}`, "success");
  adminRenderSubPills();
  populateAdminSubSelect();
}

function adminDeleteSubConfirm(subName) {
  const area = _admCurrentActiveSection;
  if (!AREA_SUBS || typeof AREA_SUBS !== 'object') AREA_SUBS = {};
  if (!Array.isArray(AREA_SUBS.__deleted_subs__)) AREA_SUBS.__deleted_subs__ = [];
  if (!AREA_SUBS.__deleted_subs__.includes(subName)) {
    AREA_SUBS.__deleted_subs__.push(subName);
  }
  if (Array.isArray(AREA_SUBS[area])) {
    AREA_SUBS[area] = AREA_SUBS[area].filter(s => s !== subName);
  }
  // Clear from employees
  let unassignedCount = 0;
  Object.keys(AREA_MAP || {}).forEach(id => {
    if ((area === 'all' || AREA_MAP[id] === area) && (AREA_DETAILS[id] || {}).s === subName) {
      delete AREA_DETAILS[id].s;
      unassignedCount++;
    }
  });
  persistAreaSubs();
  persistAreaDetails();
  showToast(`Permanently deleted sub-section "${subName}" (${unassignedCount} employee(s) reset)`, "success");
  if (_admCurrentActiveSub === subName) _admCurrentActiveSub = '';
  adminRenderSubPills();
  adminFilterEmployeeTable();
  populateAdminSubSelect();
}

function adminCleanUnusedSubsections() {
  const area = _admCurrentActiveSection;
  if (!area) return;
  const currentSubs = AREA_SUBS[area] || [];
  if (!currentSubs.length) {
    showToast('No subsections found in current section', 'info');
    return;
  }
  const sectionIds = Object.keys(AREA_MAP || {}).filter(id => AREA_MAP[id] === area);
  const counts = {};
  currentSubs.forEach(s => counts[s] = 0);
  sectionIds.forEach(id => {
    const s = (AREA_DETAILS[id] || {}).s;
    if (s && counts[s] !== undefined) counts[s]++;
  });
  const unused = currentSubs.filter(s => counts[s] === 0);
  if (!unused.length) {
    showToast('All subsections currently have active employees', 'info');
    return;
  }
  const doClean = () => {
    if (!Array.isArray(AREA_SUBS.__deleted_subs__)) AREA_SUBS.__deleted_subs__ = [];
    unused.forEach(s => {
      if (!AREA_SUBS.__deleted_subs__.includes(s)) AREA_SUBS.__deleted_subs__.push(s);
    });
    AREA_SUBS[area] = currentSubs.filter(s => !unused.includes(s));
    persistAreaSubs();
    adminRenderSubPills();
    populateAdminSubSelect();
    showToast(`Successfully removed ${unused.length} unused subsection(s)`, 'success');
  };
  if (typeof openConfirmModal === 'function') {
    openConfirmModal(`Found ${unused.length} unused subsection(s) with 0 employees (${unused.join(', ')}). Delete these unused subsections permanently?`, doClean);
  } else {
    doClean();
  }
}

function adminFilterEmployeeTable() {
  const tbody = document.getElementById('admModernEmpTableBody');
  const showingEl = document.getElementById('admTableShowingCount');
  if (!tbody) return;

  const area = _admCurrentActiveSection;
  const subFilter = _admCurrentActiveSub;
  const searchQ = (document.getElementById('admTableSearchInput')?.value || '').trim().toUpperCase();
  const genderFilter = document.getElementById('admTableGenderFilter')?.value || '';
  const typeFilter = document.getElementById('admTableTypeFilter')?.value || '';

  // Get all master directory employees or AREA_MAP IDs in this area
  const dir = buildMasterEmployeeDirectory();
  const dirMap = new Map();
  dir.forEach(e => dirMap.set(e.id, e));

  let idsInArea = Object.keys(AREA_MAP || {}).filter(id => AREA_MAP[id] === area);

  // Filter by sub-section
  if (subFilter === '__none__') {
    idsInArea = idsInArea.filter(id => !(AREA_DETAILS[id] || {}).s);
  } else if (subFilter) {
    idsInArea = idsInArea.filter(id => (AREA_DETAILS[id] || {}).s === subFilter);
  }

  // Filter by search query, gender, type
  const filtered = idsInArea.filter(id => {
    const meta = getEmpMeta(id);
    const empInfo = dirMap.get(id) || { id, name: id, designation: 'Employee' };
    
    if (genderFilter && meta.gender !== genderFilter) return false;
    if (typeFilter && meta.type !== typeFilter) return false;

    if (searchQ) {
      const matchId = id.includes(searchQ);
      const matchName = String(empInfo.name || '').toUpperCase().includes(searchQ);
      const matchSub = String(meta.sub || '').toUpperCase().includes(searchQ);
      const matchDesig = String(empInfo.designation || '').toUpperCase().includes(searchQ);
      if (!matchId && !matchName && !matchSub && !matchDesig) return false;
    }
    return true;
  }).sort();

  if (showingEl) showingEl.textContent = `Showing ${filtered.length} employees (filtered from ${idsInArea.length})`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted);">No matching employees found in ${area}.</td></tr>`;
    return;
  }

  const subsInCurrentArea = AREA_SUBS[area] || [];

  tbody.innerHTML = filtered.map(id => {
    const meta = getEmpMeta(id);
    const empInfo = dirMap.get(id) || { id, name: id, designation: 'Employee' };
    const dispName = (empInfo.name && empInfo.name !== id) ? empInfo.name : id;
    const isChecked = _admTableSelectedIds.has(id);
    const initials = dispName.slice(0, 2).toUpperCase();

    // Section dropdown
    const secSelect = `<select class="adm-table-select" onchange="adminTableChangeSection('${esc(id)}', this.value)">
      <option value="Solid Production" ${area === 'Solid Production' ? 'selected' : ''}>Solid</option>
      <option value="Softgel Production" ${area === 'Softgel Production' ? 'selected' : ''}>Softgel</option>
      <option value="Packing Hall" ${area === 'Packing Hall' ? 'selected' : ''}>Packing</option>
      <option value="Overall" ${area === 'Overall' ? 'selected' : ''}>Executives</option>
    </select>`;

    // Sub-section dropdown
    const curSub = meta.sub || '';
    const subSelect = `<select class="adm-table-select" onchange="adminTableChangeSub('${esc(id)}', this.value)">
      <option value="" ${!curSub ? 'selected' : ''}>(None / General)</option>` +
      subsInCurrentArea.map(s => `<option value="${esc(s)}" ${curSub === s ? 'selected' : ''}>${esc(s)}</option>`).join('') +
    `</select>`;

    const catBadge = meta.type ? `<span class="badge" style="font-size:10.5px;">${esc(EMP_TYPE_LABELS[meta.type] || meta.type)}</span>` : '';
    const genderBadge = meta.gender ? `<span class="badge" style="font-size:10px;margin-left:3px;">${meta.gender === 'M' ? '♂ M' : '♀ F'}</span>` : '';

    return `<tr>
      <td style="text-align:center;">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="adminToggleRowSelect('${esc(id)}', this.checked)" style="margin:0;cursor:pointer;">
      </td>
      <td>
        <div class="adm-emp-cell-id">
          <div class="adm-emp-avatar">${esc(initials)}</div>
          <div>
            <div class="adm-emp-meta-name">${esc(dispName)}</div>
            <div class="adm-emp-meta-id">${esc(id)}</div>
          </div>
        </div>
      </td>
      <td>${secSelect}</td>
      <td>${subSelect}</td>
      <td>${catBadge}${genderBadge}</td>
      <td style="text-align:right;">
        <button type="button" class="calc-mini-btn" onclick="openAdminEmpEditModal('${esc(id)}')" style="font-size:11px;">Edit</button>
        <button type="button" class="calc-mini-btn danger-btn" onclick="adminRemoveSingleId('${esc(id)}')" title="Remove" style="font-size:11px;margin-left:3px;">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function adminToggleRowSelect(id, isChecked) {
  if (isChecked) {
    _admTableSelectedIds.add(id);
  } else {
    _admTableSelectedIds.delete(id);
  }
  adminUpdateBatchToolbar();
}

function adminToggleSelectAllTable(masterCb) {
  const checked = masterCb.checked;
  const tbody = document.getElementById('admModernEmpTableBody');
  if (!tbody) return;
  tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = checked;
  });
  if (checked) {
    const area = _admCurrentActiveSection;
    Object.keys(AREA_MAP || {}).forEach(id => {
      if (AREA_MAP[id] === area) _admTableSelectedIds.add(id);
    });
  } else {
    _admTableSelectedIds.clear();
  }
  adminUpdateBatchToolbar();
}

function adminUpdateBatchToolbar() {
  const countEl = document.getElementById('admBatchSelectedCount');
  if (countEl) countEl.textContent = _admTableSelectedIds.size;
}

function adminTableChangeSection(empId, newArea) {
  if (!empId || !newArea) return;
  AREA_MAP[empId] = newArea;
  // If moved section, clear or adjust sub-section
  if (AREA_DETAILS[empId] && AREA_DETAILS[empId].s) {
    const targetSubs = AREA_SUBS[newArea] || [];
    if (!targetSubs.includes(AREA_DETAILS[empId].s)) {
      delete AREA_DETAILS[empId].s;
    }
  }
  persistAreaMap();
  persistAreaDetails();
  _masterDirLastBuildTs = 0; // invalidate cache
  showToast(`Moved ${empId} to ${newArea}`, "success");
  adminFilterEmployeeTable();
  adminRenderSubPills();
  adminUpdateAllKpiCounters();
}

function adminTableChangeSub(empId, newSub) {
  if (!empId) return;
  AREA_DETAILS[empId] = AREA_DETAILS[empId] || {};
  if (newSub && newSub !== '__none__') {
    AREA_DETAILS[empId].s = newSub;
  } else {
    delete AREA_DETAILS[empId].s;
  }
  persistAreaDetails();
  _masterDirLastBuildTs = 0;
  showToast(`Updated sub-section for ${empId}`, "success");
  adminRenderSubPills();
  adminFilterEmployeeTable();
}

function adminBatchApplySubMove() {
  const subSel = document.getElementById('admBatchTargetSubSelect');
  const targetSub = subSel?.value;
  if (!targetSub) { showToast("Select a sub-section to apply", "warn"); return; }
  if (_admTableSelectedIds.size === 0) { showToast("No employees selected", "warn"); return; }

  _admTableSelectedIds.forEach(id => {
    AREA_DETAILS[id] = AREA_DETAILS[id] || {};
    if (targetSub === '__none__') {
      delete AREA_DETAILS[id].s;
    } else {
      AREA_DETAILS[id].s = targetSub;
    }
  });

  persistAreaDetails();
  _masterDirLastBuildTs = 0;
  showToast(`Updated sub-section for ${_admTableSelectedIds.size} employees`, "success");
  _admTableSelectedIds.clear();
  adminUpdateBatchToolbar();
  adminRenderSubPills();
  adminFilterEmployeeTable();
}

function adminBatchApplyAreaMove() {
  const areaSel = document.getElementById('admBatchTargetAreaSelect');
  const targetArea = areaSel?.value;
  if (!targetArea) { showToast("Select a section to move to", "warn"); return; }
  if (_admTableSelectedIds.size === 0) { showToast("No employees selected", "warn"); return; }

  _admTableSelectedIds.forEach(id => {
    AREA_MAP[id] = targetArea;
    if (AREA_DETAILS[id] && AREA_DETAILS[id].s) {
      const targetSubs = AREA_SUBS[targetArea] || [];
      if (!targetSubs.includes(AREA_DETAILS[id].s)) {
        delete AREA_DETAILS[id].s;
      }
    }
  });

  persistAreaMap();
  persistAreaDetails();
  _masterDirLastBuildTs = 0;
  showToast(`Moved ${_admTableSelectedIds.size} employees to ${targetArea}`, "success");
  _admTableSelectedIds.clear();
  adminUpdateBatchToolbar();
  adminRenderSubPills();
  adminFilterEmployeeTable();
  adminUpdateAllKpiCounters();
}

function adminBatchRemoveSelected() {
  if (_admTableSelectedIds.size === 0) { showToast("No employees selected", "warn"); return; }
  // Canvas does not allow confirm(); proceed directly with toast confirmation
  _admTableSelectedIds.forEach(id => {
    delete AREA_MAP[id];
    delete AREA_DETAILS[id];
  });
  persistAreaMap();
  persistAreaDetails();
  _masterDirLastBuildTs = 0;
  showToast(`Removed ${_admTableSelectedIds.size} employees`, "success");
  _admTableSelectedIds.clear();
  adminUpdateBatchToolbar();
  adminRenderSubPills();
  adminFilterEmployeeTable();
  adminUpdateAllKpiCounters();
}

function adminUpdateAllKpiCounters() {
  const counts = getListedEmployeesCountBySection();
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl('admModTotalCount', counts['Total']);
  setEl('admModSolidCount', counts['Solid Production']);
  setEl('admModSoftgelCount', counts['Softgel Production']);
  setEl('admModPackingCount', counts['Packing Hall']);
  setEl('admModExecCount', counts['Overall']);

  setEl('secCardSolidCount', counts['Solid Production']);
  setEl('secCardSoftgelCount', counts['Softgel Production']);
  setEl('secCardPackingCount', counts['Packing Hall']);
  setEl('secCardOverallCount', counts['Overall']);

  // Sync legacy stat numbers
  setEl('admCountSolid', counts['Solid Production']);
  setEl('admCountSoftgel', counts['Softgel Production']);
  setEl('admCountPacking', counts['Packing Hall']);
  setEl('admCountTotal', counts['Total']);
}

/* --- Employee Edit Modal --- */
let _admEditingEmpId = null;

function openAdminEmpEditModal(empId) {
  _admEditingEmpId = empId;
  const modal = document.getElementById('adminEmpEditModal');
  if (!modal) return;

  const idInp = document.getElementById('adminEditEmpId');
  const nameInp = document.getElementById('adminEditEmpName');
  const areaSel = document.getElementById('adminEditEmpArea');
  const subSel = document.getElementById('adminEditEmpSub');
  const genderSel = document.getElementById('adminEditEmpGender');
  const typeSel = document.getElementById('adminEditEmpType');

  const meta = getEmpMeta(empId);
  const currentArea = AREA_MAP[empId] || 'Solid Production';

  if (idInp) idInp.value = empId;
  if (nameInp) {
    const all = buildMasterEmployeeDirectory();
    const item = all.find(x => x.id === empId);
    nameInp.value = (item && item.name !== empId) ? item.name : '';
  }
  if (areaSel) areaSel.value = currentArea;
  if (genderSel) genderSel.value = meta.gender || '';
  if (typeSel) typeSel.value = meta.type || '';

  onAdminEditAreaChange();
  if (subSel) subSel.value = meta.sub || '';

  modal.style.display = 'flex';
}

function closeAdminEmpEditModal() {
  const modal = document.getElementById('adminEmpEditModal');
  if (modal) modal.style.display = 'none';
  _admEditingEmpId = null;
}

function onAdminEditAreaChange() {
  const area = document.getElementById('adminEditEmpArea')?.value || 'Solid Production';
  const subSel = document.getElementById('adminEditEmpSub');
  if (!subSel) return;
  const subs = AREA_SUBS[area] || [];
  subSel.innerHTML = '<option value="">(None / General)</option>' + subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
}

function saveAdminEmpEdit() {
  const empId = _admEditingEmpId;
  if (!empId) return;

  const area = document.getElementById('adminEditEmpArea')?.value || 'Solid Production';
  const sub = document.getElementById('adminEditEmpSub')?.value || '';
  const gender = document.getElementById('adminEditEmpGender')?.value || '';
  const type = document.getElementById('adminEditEmpType')?.value || '';
  const name = (document.getElementById('adminEditEmpName')?.value || '').trim();

  AREA_MAP[empId] = area;
  AREA_DETAILS[empId] = AREA_DETAILS[empId] || {};
  if (sub) AREA_DETAILS[empId].s = sub; else delete AREA_DETAILS[empId].s;
  if (gender) AREA_DETAILS[empId].g = gender; else delete AREA_DETAILS[empId].g;
  if (type) AREA_DETAILS[empId].t = type; else delete AREA_DETAILS[empId].t;

  persistAreaMap();
  persistAreaDetails();
  _masterDirLastBuildTs = 0;

  showToast(`Updated employee ${empId}`, "success");
  closeAdminEmpEditModal();
  adminFilterEmployeeTable();
  adminRenderSubPills();
  adminUpdateAllKpiCounters();
}

/* --- Unassigned Employees Queue Manager --- */
async function adminScanUnassignedMonthlyEmployees(forceRescan = false) {
  const badge = document.getElementById('admUnassignedBadgeCount');
  const navBadge = document.getElementById('admNavUnassignedCount');
  const kpiBadge = document.getElementById('admModUnassignedCount');
  const statusLbl = document.getElementById('admUnassignedStatusLbl');

  if (statusLbl) statusLbl.textContent = 'Scanning monthly overtime records for unassigned employees...';

  // Gather all unique employees across month caches or latest month
  const unassignedMap = new Map();
  const cachedMonths = Object.keys(monthIndexMemoryCache || {});

  if (cachedMonths.length === 0 || forceRescan) {
    try {
      const now = new Date();
      for (let i = 0; i < 4; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const list = await fetchMonthPreIndexedData(m);
        if (Array.isArray(list) && list.length > 0) break;
      }
    } catch (e) {
      console.warn("Scan month data err:", e);
    }
  }

  Object.keys(monthIndexMemoryCache || {}).forEach(ym => {
    const list = monthIndexMemoryCache[ym];
    if (!Array.isArray(list)) return;
    list.forEach(e => {
      if (!e || !e.id) return;
      const id = String(e.id).toUpperCase().trim();
      if (!isListedEmployeeId(id)) {
        if (!unassignedMap.has(id)) {
          unassignedMap.set(id, {
            id,
            name: e.name || id,
            designation: e.grade || getDesignation(e) || 'Employee',
            totalDuty: e.totalDuty || 0,
            otHours: e.otHours || 0
          });
        }
      }
    });
  });

  _admUnassignedList = Array.from(unassignedMap.values()).sort((a,b) => a.id.localeCompare(b.id));
  const count = _admUnassignedList.length;

  if (badge) badge.textContent = `${count} Pending`;
  if (navBadge) navBadge.textContent = count;
  if (kpiBadge) kpiBadge.textContent = count;
  if (statusLbl) statusLbl.textContent = `Found ${count} unassigned employees in uploaded overtime data.`;

  adminRenderUnassignedTable();
}

function adminRenderUnassignedTable() {
  const tbody = document.getElementById('admUnassignedTableBody');
  if (!tbody) return;

  if (_admUnassignedList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--success);font-weight:700;">✓ All employees in uploaded monthly files are listed in RPPF sections!</td></tr>`;
    return;
  }

  tbody.innerHTML = _admUnassignedList.map(e => {
    const isChecked = _admUnassignedSelectedIds.has(e.id);
    return `<tr>
      <td style="text-align:center;">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="adminToggleUnassignedRow('${esc(e.id)}', this.checked)" style="margin:0;cursor:pointer;">
      </td>
      <td>
        <div style="font-weight:800;color:var(--text);">${esc(e.name)}</div>
        <div style="font-size:11px;color:var(--muted);font-family:monospace;">${esc(e.id)}</div>
      </td>
      <td>${esc(e.designation)}</td>
      <td>${e.totalDuty}h</td>
      <td>${e.otHours}h</td>
      <td style="text-align:right;">
        <div style="display:inline-flex;gap:4px;">
          <button type="button" class="calc-mini-btn" onclick="adminAssignSingleUnassigned('${esc(e.id)}', 'Solid Production')">+ Solid</button>
          <button type="button" class="calc-mini-btn" onclick="adminAssignSingleUnassigned('${esc(e.id)}', 'Softgel Production')">+ Softgel</button>
          <button type="button" class="calc-mini-btn" onclick="adminAssignSingleUnassigned('${esc(e.id)}', 'Packing Hall')">+ Packing</button>
          <button type="button" class="calc-mini-btn" onclick="adminAssignSingleUnassigned('${esc(e.id)}', 'Overall')">+ Exec</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function adminToggleUnassignedRow(id, isChecked) {
  if (isChecked) _admUnassignedSelectedIds.add(id); else _admUnassignedSelectedIds.delete(id);
  const countEl = document.getElementById('admUnassignedSelectedCount');
  if (countEl) countEl.textContent = _admUnassignedSelectedIds.size;
}

function adminToggleSelectAllUnassigned(masterCb) {
  const checked = masterCb.checked;
  _admUnassignedSelectedIds.clear();
  if (checked) {
    _admUnassignedList.forEach(e => _admUnassignedSelectedIds.add(e.id));
  }
  const countEl = document.getElementById('admUnassignedSelectedCount');
  if (countEl) countEl.textContent = _admUnassignedSelectedIds.size;
  adminRenderUnassignedTable();
}

function adminPopulateBatchAssignSubs() {
  const area = document.getElementById('admBatchAssignAreaSelect')?.value;
  const subSel = document.getElementById('admBatchAssignSubSelect');
  if (!subSel) return;
  if (!area) { subSel.innerHTML = '<option value="">Sub-section (Optional)...</option>'; return; }
  const subs = AREA_SUBS[area] || [];
  subSel.innerHTML = '<option value="">Sub-section (Optional)...</option>' + subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
}

function adminAssignSingleUnassigned(empId, targetArea, targetSub = '') {
  if (!empId || !targetArea) return;
  AREA_MAP[empId] = targetArea;
  if (targetSub) {
    AREA_DETAILS[empId] = AREA_DETAILS[empId] || {};
    AREA_DETAILS[empId].s = targetSub;
  }
  persistAreaMap();
  persistAreaDetails();
  _masterDirLastBuildTs = 0;
  _admUnassignedList = _admUnassignedList.filter(x => x.id !== empId);
  _admUnassignedSelectedIds.delete(empId);
  showToast(`Assigned ${empId} to ${targetArea}`, "success");
  adminRenderUnassignedTable();
  adminUpdateAllKpiCounters();
}

function adminBatchApplyAssignUnassigned() {
  const area = document.getElementById('admBatchAssignAreaSelect')?.value;
  const sub = document.getElementById('admBatchAssignSubSelect')?.value || '';
  if (!area) { showToast("Select a section to assign to", "warn"); return; }
  if (_admUnassignedSelectedIds.size === 0) { showToast("No employees selected", "warn"); return; }

  _admUnassignedSelectedIds.forEach(id => {
    AREA_MAP[id] = area;
    if (sub) {
      AREA_DETAILS[id] = AREA_DETAILS[id] || {};
      AREA_DETAILS[id].s = sub;
    }
  });

  persistAreaMap();
  persistAreaDetails();
  _masterDirLastBuildTs = 0;

  const count = _admUnassignedSelectedIds.size;
  showToast(`Assigned ${count} employees to ${area}`, "success");
  _admUnassignedList = _admUnassignedList.filter(x => !_admUnassignedSelectedIds.has(x.id));
  _admUnassignedSelectedIds.clear();

  const countEl = document.getElementById('admUnassignedSelectedCount');
  if (countEl) countEl.textContent = 0;

  adminRenderUnassignedTable();
  adminUpdateAllKpiCounters();
}


// Start directly on #page-admin in standalone admin.html
