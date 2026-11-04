/* ==========================================================================
   ADMIN-TOOLS.JS - Excel Upload, Month Re-optimization & Data Tools
   ========================================================================== */

function cleanPunchValue(val) {
if (val === undefined || val === null) return "";
return String(val)
.replace(/[\s\u00A0\u1680\u2000-\u200F\u2028-\u202F\u205F\u3000\uFEFF]+/g, "")
.trim();
}
function isPunchMissing(val) {
const cleaned = cleanPunchValue(val).toUpperCase();
if (!cleaned) return true;
if (cleaned === "-" || cleaned === "--" || cleaned === "N/A" || cleaned === "NA" || cleaned === "NULL" || cleaned === "NONE" || cleaned === "MISSING") return true;
if (/^0{1,2}:00(:00)?$/.test(cleaned)) return true;
if (!/^\d{1,2}:\d{2}(:\d{2})?([AP]M)?$/i.test(cleaned)) return true;
return false;
}
function finalizeExcelEmployee(c, sourceName) {
const detection = detectCategory(c.designation, c.id);
const valid = Boolean(detection.valid && detection.category);
const category = valid ? detection.category : null;
const kind = /^\d{5,8}$/.test(String(c.id)) || /^CASUAL/i.test(c.designation || '') ? 'CAS' : (!valid && /^RF/i.test(String(c.id)) ? 'EXEC' : '');
const r = RATE_TABLE[category] || RATE_TABLE.JO;
const otHours = Number((c.totalRow ? c.totalRow.ot : c.dailyOt).toFixed(2));
const totalDuty = Number((c.totalRow ? c.totalRow.duty : c.dailyDuty).toFixed(2));
const holidayCount = c.holidayDays.length;
const nightCount = c.nightDays.length;
const otAmount = valid ? Number((otHours * r.otRate).toFixed(2)) : 0;
const holidayAmount = valid ? Number((r.holidayType === "hourly" ? holidayCount * r.holidayHours * r.otRate : holidayCount * r.holidayFlat).toFixed(2)) : 0;
const nightAmount = valid ? Number((nightCount * r.nightRate).toFixed(2)) : 0;
return {
valid,
id: c.id,
name: c.name.substring(0, 45),
grade: c.designation,
kind,
category,
area: getAreaForId(c.id, c.isRppf),
isRppf: c.isRppf,
totalDuty,
otHours,
holidayCount,
nightCount,
regularDaysCount: c.regularDaysCount,
plainDaysCount: c.plainDaysCount,
otDaysCount: computeOtDaysFromDaily(c.daily),
holidayDays: c.holidayDays,
nightDays: c.nightDays,
punchProblems: c.punchProblems,
requisitionProblems: c.requisitionProblems || [],
requisitionProblemCount: (c.requisitionProblems || []).length,
sub: (AREA_DETAILS[c.id] || {}).s || '',
daily: c.daily || [],
otAmount,
holidayAmount,
nightAmount,
totalEarned: Number((otAmount + holidayAmount + nightAmount).toFixed(2)),
fileName: sourceName || ''
};
}
function cleanEmpName(raw) {
let n = String(raw == null ? '' : raw).replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim();
let prev;
do { prev = n; n = n.replace(/^(Mr|Mrs|Ms|Miss)\.?\s+/i, ''); } while (n !== prev);
return n.trim();
}
function cleanDesignation(raw) {
return String(raw == null ? '' : raw).replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim();
}
function parseEmpHeader(col0, id) {
const rest = col0.substring(id.length).replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ').trim();
const parts = rest.split(',').map(x => x.trim());
let nameDesig = rest;
if (parts.length >= 3) nameDesig = parts.slice(0, parts.length - 2).join(', ');   // drop Department, Location
const m = nameDesig.match(/^(.*?)\s{2,}(.+)$/);                                    // name | designation (2+ spaces)
if (m) return { name: cleanEmpName(m[1]), designation: cleanDesignation(m[2]) };
const g = nameDesig.match(/^(.*?)\s+((?:Junior\s+Officer\s+[A-F]|Helper|Casual)\b.*)$/i);
if (g) return { name: cleanEmpName(g[1]), designation: cleanDesignation(g[2]) };
return { name: cleanEmpName(nameDesig), designation: '' };
}
function buildSummaryMap(workbook) {
const map = {};
const ws = workbook.Sheets && workbook.Sheets['Summary'];
if (!ws) return map;
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
let hi = -1, ci = {};
for (let i = 0; i < Math.min(rows.length, 15); i++) {
const low = (rows[i] || []).map(c => String(c).trim().toLowerCase());
if (low.includes('employee id')) { hi = i; ci = { id: low.indexOf('employee id'), name: low.indexOf('employee name'), desig: low.indexOf('designation') }; break; }
}
if (hi < 0) return map;
for (let i = hi + 1; i < rows.length; i++) {
const r = rows[i]; if (!r) continue;
const id = String(r[ci.id] == null ? '' : r[ci.id]).replace(/\s+/g, '').toUpperCase();
if (!id) continue;
map[id] = { name: cleanEmpName(ci.name >= 0 ? r[ci.name] : ''), designation: cleanDesignation(ci.desig >= 0 ? r[ci.desig] : '') };
}
return map;
}
function detectWorkLogColumns(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const r = rows[i];
    if (!r || !Array.isArray(r)) continue;
    const low = r.map(c => String(c == null ? '' : c).trim().toLowerCase());
    if (!low.includes('date')) continue;
    const hasClues = low.some(c => c === 'in' || c === 'out' || c.includes('duty') || c === 'day');
    if (!hasClues) continue;

    const ci = {
      date: 0, day: 1, shift: -1, in: 2, out: 3,
      regDuty: 4, regOT: 5, doDuty: 6, doOT: 7,
      holDuty: 8, holOT: 9, night: 10
    };

    low.forEach((val, idx) => {
      if (!val) return;
      if (val === 'date') ci.date = idx;
      else if (val === 'day') ci.day = idx;
      else if (val === 'shift' || val.includes('shift')) ci.shift = idx;
      else if (val === 'in' || val.startsWith('in ') || val.startsWith('in(')) ci.in = idx;
      else if (val === 'out' || val.startsWith('out ') || val.startsWith('out(')) ci.out = idx;
      else if (val.includes('day off') || val.includes('day-off') || val.includes('off day')) {
        if (val.includes('duty')) ci.doDuty = idx;
        else if (val.includes('ot') || val.includes('overtime')) ci.doOT = idx;
      }
      else if (val.includes('holiday')) {
        if (val.includes('duty')) ci.holDuty = idx;
        else if (val.includes('ot') || val.includes('overtime')) ci.holOT = idx;
      }
      else if (val.includes('night')) ci.night = idx;
      else if (val.includes('duty')) ci.regDuty = idx;
      else if (val.includes('ot') || val.includes('overtime')) ci.regOT = idx;
    });

    return ci;
  }

  return {
    date: 0, day: 1, shift: -1, in: 2, out: 3,
    regDuty: 4, regOT: 5, doDuty: 6, doOT: 7,
    holDuty: 8, holOT: 9, night: 10
  };
}

function parseExcelWorkbook(workbook, sourceName) {
  const sheetName = workbook.SheetNames.includes('Work Log') ? 'Work Log' : workbook.SheetNames[0];
  const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
  const out = [];
  const summaryMap = buildSummaryMap(workbook);
  const ci = detectWorkLogColumns(json);
  let cur = null;

  // Auto-detect Empress recognized Government/Company Holidays for this month
  const detectedHolidays = new Set();
  for (let hi = 0; hi < json.length; hi++) {
    const hr = json[hi];
    if (!hr || !hr[0]) continue;
    const hc0 = String(hr[0]).trim().toUpperCase();
    if (/^\d{2}-[A-Z]{3}-\d{4}$/.test(hc0)) {
      const holD = (ci.holDuty >= 0 && ci.holDuty < hr.length) ? (Number(hr[ci.holDuty]) || 0) : 0;
      const holO = (ci.holOT >= 0 && ci.holOT < hr.length) ? (Number(hr[ci.holOT]) || 0) : 0;
      if (holD > 0 || holO > 0) detectedHolidays.add(hc0);
    }
  }
  const flush = () => { if (cur) out.push(finalizeExcelEmployee(cur, sourceName)); cur = null; };

  const getNum = (row, colIdx) => (colIdx >= 0 && colIdx < row.length ? (Number(row[colIdx]) || 0) : 0);
  const getVal = (row, colIdx) => (colIdx >= 0 && colIdx < row.length ? cleanPunchValue(row[colIdx]) : '');

  for (let i = 0; i < json.length; i++) {
    const row = json[i];
    if (!row || row.length === 0) continue;
    const col0 = row[0] === undefined || row[0] === null ? "" : String(row[0]).replace(/[ ​-‍﻿]/g, " ").trim();
    if (col0 && /^([A-Z]{2}\d{3,6}|\d{5,8})\s+/i.test(col0)) {
      flush();
      const idMatch = col0.match(/^([A-Z]{2}\d{3,6}|\d{5,8})/i);
      const id = idMatch ? idMatch[1].toUpperCase() : 'UNKNOWN';
      const hdr = parseEmpHeader(col0, id);
      const sm = summaryMap[id];                       // Summary sheet = source of truth
      const name = (sm && sm.name) || hdr.name;
      const designation = (sm && sm.designation) || hdr.designation;
      cur = {
        id, name, designation,
        isRppf: isRppfText(col0) || col0.toUpperCase().includes('RAJENDRAPUR'),
        totalRow: null, dailyDuty: 0, dailyOt: 0,
        regularDaysCount: 0, plainDaysCount: 0,
        holidayDays: [], nightDays: [], punchProblems: [], requisitionProblems: [], daily: []
      };
      continue;
    }
    if (!cur) continue;
    if (/^total$/i.test(col0)) {
      const regDuty = getNum(row, ci.regDuty);
      const regOT = getNum(row, ci.regOT);
      const doDuty = getNum(row, ci.doDuty);
      const doOT = getNum(row, ci.doOT);
      const holDuty = getNum(row, ci.holDuty);
      const holOT = getNum(row, ci.holOT);

      cur.totalRow = {
        duty: Number((regDuty + regOT + doDuty + doOT + holDuty + holOT).toFixed(2)),
        ot: Number((regOT + doOT + holOT).toFixed(2))
      };
      continue;
    }
    if (col0 && /^\d{2}-[A-Z]{3}-\d{4}$/i.test(col0)) {
      const date = col0.toUpperCase();
      const dayVal = getVal(row, ci.day);
      const inVal = getVal(row, ci.in);
      const outVal = getVal(row, ci.out);
      const shiftVal = getVal(row, ci.shift);

      const missIn = isPunchMissing(inVal);
      const missOut = isPunchMissing(outVal);
      const regDuty = getNum(row, ci.regDuty);
      const regOT = getNum(row, ci.regOT);
      const doDuty = getNum(row, ci.doDuty);
      const doOT = getNum(row, ci.doOT);
      const holDuty = getNum(row, ci.holDuty);
      const holOT = getNum(row, ci.holOT);

      const parseTimeMins = (val) => {
        if (!val) return null;
        const s = String(val).replace(/[^0-9:APM]/gi, '').toUpperCase().trim();
        const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/);
        if (m) {
          let hh = parseInt(m[1], 10), mm = parseInt(m[2], 10), ampm = m[3];
          if (ampm === 'PM' && hh < 12) hh += 12;
          else if (ampm === 'AM' && hh === 12) hh = 0;
          return hh * 60 + mm;
        }
        return null;
      };

      const calcElapsed = (iVal, oVal) => {
        const ti = parseTimeMins(iVal), to = parseTimeMins(oVal);
        if (ti === null || to === null) return 0;
        const diff = to < ti ? (1440 - ti) + to : to - ti;
        return Number((diff / 60).toFixed(2));
      };

      const elapsedHrs = calcElapsed(inVal, outVal);
      const tInMins = parseTimeMins(inVal);
      const tOutMins = parseTimeMins(outVal);
      const shiftUpper = String(shiftVal || '').toUpperCase();
      const nightRaw = getVal(row, ci.night).toLowerCase();

      // Robust Night Detection
      const isNight = ['yes', '1', 'true', 'y'].includes(nightRaw) || shiftUpper.includes('NIGHT') || shiftUpper === 'DN' || shiftUpper === 'C' || elapsedHrs >= 14.0 || (outVal && missIn && tOutMins !== null && tOutMins >= 240 && tOutMins <= 435);

      cur.daily.push([date, dayVal, inVal, outVal, regDuty, regOT, doDuty, doOT, holDuty, holOT, isNight ? 1 : 0, shiftVal]);
      cur.dailyDuty += regDuty + regOT + doDuty + doOT + holDuty + holOT;
      cur.dailyOt += regOT + doOT + holOT;
      if (regDuty > 0) cur.regularDaysCount++;
      if (doDuty > 0 || doOT > 0 || holDuty > 0 || holOT > 0) {
        cur.holidayDays.push({ date, doDuty, doExtra: doOT, holDuty, holExtra: holOT });
      }
      if (isNight) cur.nightDays.push(date);
      if (missIn || missOut) {
        cur.punchProblems.push(date);
      } else if ((regDuty + doDuty + holDuty) > 0 && !isNight && (regOT + doOT + holOT) === 0) {
        cur.plainDaysCount++;
      }

      // -------------------------------------------------------------
      // REQUISITION PROBLEM DETECTION (Client-side Manual Upload)
      // Synced with to_json.py Comprehensive Requisition Audit
      // -------------------------------------------------------------
      const totalOtToday = regOT + doOT + holOT;
      const totalDutyToday = regDuty + doDuty + holDuty;
      let isReqProb = false;
      let expectedOtStr = '';
      let probReason = '';

      // 1. Government Holiday Requisition Missing
      if (detectedHolidays.has(date) && (regDuty > 0 || regOT > 0) && holDuty === 0 && holOT === 0) {
        isReqProb = true;
        expectedOtStr = 'Govt Holiday Requisition Missing';
        probReason = 'Worked on Govt Holiday, but recorded as Regular Duty';
      }
      // 2. Weekend Day Off (DO) Requisition Missing (Thu & Fri Only)
      else if ((dayVal === 'Thu' || dayVal === 'Fri') && (regDuty > 0 || regOT > 0) && doDuty === 0 && doOT === 0) {
        isReqProb = true;
        expectedOtStr = `Weekend (${dayVal}) DO Req Missing`;
        probReason = 'Worked on Weekend (Thu/Fri), but recorded as Regular Duty';
      }
      // 3. Night Shift OT Missing
      else if (isNight && (elapsedHrs >= 11.0 || totalDutyToday >= 11.0) && totalOtToday === 0 && !missIn && !missOut) {
        isReqProb = true;
        const expHrs = Math.min(7.0, Math.max(4.0, Number((Math.max(elapsedHrs, totalDutyToday) - 8.5).toFixed(1))));
        expectedOtStr = `${expHrs}h (Night Shift OT Error / Missing)`;
        probReason = 'Night Shift OT Missing';
      }
      // 4. Standard Evening/Morning Overtime Missing
      else if (!isNight && totalOtToday === 0 && !missIn && !missOut) {
        if (tOutMins !== null && tOutMins >= 1150 && tOutMins <= 1215) {
          isReqProb = true; expectedOtStr = '3.0h (04:30 - 07:30 PM)'; probReason = '3h Evening OT Missing';
        } else if (tOutMins !== null && tOutMins >= 1216 && tOutMins <= 1350) {
          isReqProb = true; expectedOtStr = '5.0h (04:30 - 09:30 PM)'; probReason = '5h Evening OT Missing';
        } else if (tInMins !== null && tInMins <= 435) {
          isReqProb = true; expectedOtStr = tInMins <= 390 ? '2.5h Morning OT' : '1.0h Morning OT'; probReason = 'Morning OT Missing';
        } else if (elapsedHrs >= 9.5 && elapsedHrs <= 13.5 && (tOutMins !== null && tOutMins > 1035)) {
          isReqProb = true; expectedOtStr = `${(elapsedHrs - 8.5).toFixed(1)}h Extended OT`; probReason = 'Day OT Missing';
        }
      }

      if (isReqProb) {
        cur.requisitionProblems.push({
          date, day: dayVal, in: inVal, out: outVal,
          duty: Number(totalDutyToday.toFixed(2)),
          elapsed: elapsedHrs, isNight, expectedOt: expectedOtStr,
          reason: probReason || (isNight ? 'Night Shift OT Missing' : 'Day/Evening OT Missing')
        });
      }
    }
  }
  flush();
  return out;
}

async function processExcelUpload() {
const y = document.getElementById('adminPdfYear')?.value;
const m = document.getElementById('adminPdfMonth')?.value;
const fileInp = document.getElementById('adminExcelFileInput');
const files = fileInp?.files;
if (!files || files.length === 0) { showToast('Please select at least one Excel file', 'warn'); return; }
if (typeof XLSX === 'undefined') {
try {
showToast('Loading Excel engine...', 'info');
await _loadScript('https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js');
} catch (e) {
showToast('Excel library could not load. Check internet connection.', 'error');
return;
}
}
const monthFolder = `${y}-${m}`;
const btn = document.getElementById('adminUploadExcelBtn');
const progWrap = document.getElementById('adminPdfUploadProgress');
const progTxt = document.getElementById('adminPdfStatusText');
const progFill = document.getElementById('adminPdfProgressFill');
if (btn) btn.disabled = true;
if (progWrap) progWrap.style.display = 'block';
try {
await loadAreaMap();
const employeesMap = new Map();
for (let i = 0; i < files.length; i++) {
const file = files[i];
if (progTxt) progTxt.textContent = `Reading file: ${file.name}...`;
if (progFill) progFill.style.width = `${10 + Math.round((i / files.length) * 40)}%`;
const buf = await file.arrayBuffer();
const workbook = XLSX.read(new Uint8Array(buf), { type: 'array' });
const list = parseExcelWorkbook(workbook, file.name);
for (const e of list) {
const existing = employeesMap.get(e.id);
employeesMap.set(e.id, existing ? pickBestEmployee(existing, e) : e);
}
await new Promise(res => setTimeout(res, 10));
}
const allEmployees = Array.from(employeesMap.values());
if (allEmployees.length === 0) throw new Error('No employee data found in the file. Check that the Excel format is correct (existing server data is unchanged).');
if (progFill) progFill.style.width = '65%';
if (progTxt) progTxt.textContent = `${allEmployees.length} employee calculations created, saving to the server...`;
const payload = { month: monthFolder, updatedAt: new Date().toISOString(), employees: allEmployees };
await githubPutFile(`data/${monthFolder}.json`, utf8ToBase64(JSON.stringify(payload)), `Upload Excel data for ${monthFolder} via RPPF Admin Panel`);
monthIndexMemoryCache[monthFolder] = allEmployees;
try {
localStorage.setItem(MONTH_DATA_CACHE_PREFIX + monthFolder, JSON.stringify({ ts: Date.now(), employees: allEmployees }));
localStorage.removeItem(LEADERBOARD_PREFIX + monthFolder);
Object.keys(localStorage).forEach(k => {
if (k.startsWith(COMPARE_CACHE_PREFIX + monthFolder + '_') || k.startsWith(CACHE_PREFIX + monthFolder + '_')) localStorage.removeItem(k);
});
} catch (e) {}
const rppf = allEmployees.filter(e => e.isRppf !== false && e.valid !== false).length;
const skipped = allEmployees.filter(e => e.valid === false).length;
const punch = allEmployees.filter(e => getPunchProblemCount(e) > 0).length;
if (progFill) progFill.style.width = '100%';
if (progTxt) progTxt.textContent = `Done: total ${allEmployees.length} (RPPF ${rppf}, out of grade ${skipped}, punch problems ${punch})`;
if (fileInp) fileInp.value = '';
showToast(`${monthFolder} data was uploaded successfully`, 'success');
adminCheckMonthData();
} catch (err) {
console.error(err);
if (progTxt) progTxt.textContent = `Upload failed: ${err.message}`;
showToast(err.message, 'error');
} finally {
if (btn) btn.disabled = false;
}
}
async function adminCheckMonthData() {
  try { adminRenderPlantHolidays(); } catch (e) {}
const y = document.getElementById('adminPdfYear')?.value;
const m = document.getElementById('adminPdfMonth')?.value;
const box = document.getElementById('adminExistingDataStatus');
if (!y || !m || !box) return;
const monthFolder = `${y}-${m}`;
box.textContent = 'Verifying data, please wait...';
try {
const data = await fetchJsonResource(`data/${monthFolder}.json`);
const list = Array.isArray(data) ? data : (Array.isArray(data?.employees) ? data.employees : []);
const when = data && data.updatedAt ? new Date(data.updatedAt).toLocaleString('en-GB') : '—';
box.innerHTML = `<div class="admin-file-item">
<div>
<strong>data/${esc(monthFolder)}.json</strong>
<div style="font-size:12px;color:var(--muted);">Updated: ${esc(when)}</div>
</div>
<div class="admin-file-actions">
<button type="button" class="btn-secondary" onclick="document.getElementById('adminExcelFileInput')?.click()">Replace</button>
<button type="button" class="btn-secondary danger-btn" onclick="adminConfirmDeleteMonthData('${esc(monthFolder)}')">Delete</button>
</div>
</div>`;
} catch (e) {
box.innerHTML = `<span style="color:var(--muted);">No data for this month on the server yet.</span>`;
}
}
async function adminReoptimizeMonthData() {
const y = document.getElementById('adminPdfYear')?.value;
const m = document.getElementById('adminPdfMonth')?.value;
if (!y || !m) return;
const monthFolder = `${y}-${m}`;
showToast(`${monthFolder} data is being re-optimized...`, 'info');
try {
await loadAreaMap();
const list = await fetchMonthPreIndexedData(monthFolder, true);
if (!list || !list.length) throw new Error('No data for this month found on the server. Upload Excel first.');
list.forEach(e => { e.area = getAreaForId(e.id, e.isRppf !== false); applyTypeOverride(e); });
const payload = { month: monthFolder, updatedAt: new Date().toISOString(), employees: list };
await githubPutFile(`data/${monthFolder}.json`, utf8ToBase64(JSON.stringify(payload)), `Re-optimize ${monthFolder} data via RPPF Admin Panel`);
monthIndexMemoryCache[monthFolder] = list;
showToast(`${monthFolder} data was re-optimized according to the new rates and areas`, 'success');
adminCheckMonthData();
} catch (err) {
showToast(err.message, 'error');
}
}
function adminConfirmDeleteMonthData(monthFolder) {
openConfirmModal(`Are you sure you want to delete the optimized data for "${monthFolder}" (file data/${monthFolder}.json)?`, async () => {
try {
await githubDeleteFile(`data/${monthFolder}.json`, null, `Delete data/${monthFolder}.json via RPPF Admin Panel`);
delete monthIndexMemoryCache[monthFolder];
try {
localStorage.removeItem(MONTH_DATA_CACHE_PREFIX + monthFolder);
localStorage.removeItem(LEADERBOARD_PREFIX + monthFolder);
} catch (e) {}
showToast(`${monthFolder} data deleted`, 'success');
adminCheckMonthData();
} catch (err) {
showToast(`Problem while deleting: ${err.message}`, 'error');
}
});
}

(function () {
'use strict';
const $ = id => document.getElementById(id);
const LS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const SV = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const AREAS = ['Solid Production', 'Softgel Production', 'Packing Hall', 'Overall'];
const NS = (typeof STORAGE_NAMESPACE !== 'undefined' ? STORAGE_NAMESPACE : '');
const K_ALIAS = (typeof ID_ALIAS_KEY !== 'undefined' ? ID_ALIAS_KEY : (NS + 'rppf_id_alias_v1')),
      K_OV = (typeof DAYTYPE_OV_KEY !== 'undefined' ? DAYTYPE_OV_KEY : (NS + 'rppf_daytype_ov_v1')),
      K_LOG = NS + 'rppf_admin_log_v1';
const alias = id => { const a = LS(K_ALIAS, {}); let x = id, n = 0; while (a[x] && n++ < 5) x = a[x]; return x; };
const dnum = s => parseInt(String(s).slice(0, 2), 10) || 0;
const sumDuty = r => [4, 5, 6, 7, 8, 9].reduce((t, i) => t + (Number(r[i]) || 0), 0);
const noPunch = r => { const m = typeof isPunchMissing === 'function' ? isPunchMissing : (v => !String(v || '').replace(/[-—:\s]/g, '')); return m(r[2]) && m(r[3]); };

/* ---------- pure calculation (testable, cross-month & holiday aware) ---------- */
function calcMonth(list, ov, allow, prevNight, skipN, ymStr) {
  prevNight = prevNight || new Set();
  ov = ov || {};
  let y = 2026, m = 1;
  const mm = String(ymStr || '').match(/^(\d{4})-(\d{2})$/);
  if (mm) { y = +mm[1]; m = +mm[2]; }
  const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const monName = mons[m - 1] || 'JAN';
  const lastCalDay = new Date(y, m, 0).getDate();
  const dsMeta = typeof getMonthDatasetMeta === 'function' ? getMonthDatasetMeta(`${y}-${String(m).padStart(2, '0')}`) : { maxActiveDay: lastCalDay, consensusHolidays: new Set() };
  const maxDay = Math.min(lastCalDay, dsMeta.maxActiveDay || lastCalDay);

  const type = {};
  const daysOfWeek = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  for (let d = 1; d <= maxDay; d++) {
    const dStr = String(d).padStart(2, '0');
    const fullDate = `${dStr}-${monName}-${y}`.toUpperCase();
    const dn = daysOfWeek[new Date(y, m - 1, d).getDay()];
    if (ov[fullDate]) {
      type[fullDate] = ov[fullDate];
    } else {
      const hc = typeof isPlantOrGovtHolidayDate === 'function' ? isPlantOrGovtHolidayDate(y, m, d, dn, dsMeta.consensusHolidays) : { isOffOrHol: (dn === 'Thu' || dn === 'Fri'), isHoliday: false };
      type[fullDate] = hc.isOffOrHol ? (hc.isHoliday ? 'H' : 'O') : 'R';
    }
  }

  const out = [];
  list.forEach(e => {
    if (!e || e.isRppf === false) return;
    const { byDay } = _buildEmpDayMap(e);
    const uid = String(e.id || '').toUpperCase();
    const aid = alias(uid);
    const hasPrevN = prevNight.has(uid) || prevNight.has(aid);
    const zeros = [];
    for (let d = 1; d <= maxDay; d++) {
      const dStr = String(d).padStart(2, '0');
      const fullDate = `${dStr}-${monName}-${y}`.toUpperCase();
      const isoDate = `${y}-${String(m).padStart(2, '0')}-${dStr}`;
      if (type[fullDate] !== 'R') continue;
      if (byDay[d]) continue;
      const isAfterN = (d === 1 && hasPrevN) || (d > 1 && byDay[d - 1] && byDay[d - 1].night);
      if (skipN && isAfterN) continue;
      if (typeof isEmployeeOnApprovedLeave === 'function' && isEmployeeOnApprovedLeave(uid, isoDate)) continue;
      zeros.push(fullDate);
    }
    const adj = Math.max(0, zeros.length - (Number(allow) || 0));
    out.push({ id: e.id, name: e.name, area: e.area, totalDuty: Number(e.totalDuty || 0), zeros, adj });
  });
  return { type, rows: out };
}
window.__rppfCalcMonth = calcMonth;

/* ---------- Absent Rank tab ---------- */
let _ar = { types: {} };
async function runRank() {
  const end = $('arMonth').value, spanVal = $('arSpan').value, allow = +$('arAllow').value || 0, skipN = $('arSkipNight').checked, ov = LS(K_OV, {});
  if (!end) return;
  $('arOut').innerHTML = '<div class="card-sub">Calculating...</div>';
  const [y, m] = end.split('-').map(Number), agg = {}; _ar.types = {};
  const span = spanVal === 'ytd' ? m : (+spanVal || 1);
  const chronoMonths = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    chronoMonths.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  const earliestPrev = chronoMonths.length ? getPrevMonthStr(chronoMonths[0]) : '';
  const toFetch = earliestPrev ? [earliestPrev, ...chronoMonths] : [...chronoMonths];
  await Promise.all(toFetch.map(ym => fetchMonthPreIndexedData(ym).catch(() => null)));

  let found = 0;
  for (let idx = 0; idx < chronoMonths.length; idx++) {
    const ym = chronoMonths[idx];
    let list = monthIndexMemoryCache[ym] || [];
    list = list.filter(e => e && e.isRppf !== false && isMappedAreaId(e.id));
    if (!list.length) continue;
    found++;
    const prevNight = skipN ? getPrevMonthNightSet(ym) : new Set();
    const r = calcMonth(list, ov, allow, prevNight, skipN, ym);
    Object.assign(_ar.types, r.type);
    const mShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(parseInt(ym.split('-')[1], 10) || 1) - 1];
    r.rows.forEach(x => {
      const k = alias(x.id), a = agg[k] || (agg[k] = { id: k, name: x.name, area: x.area, adj: 0, totalDuty: 0, zeros: [], byMonth: [] });
      a.adj += x.adj;
      a.totalDuty += Number(x.totalDuty || 0);
      a.zeros = a.zeros.concat(x.zeros);
      if (x.adj > 0) a.byMonth.push(`${mShort}: ${x.adj}d`);
      if (x.name) a.name = x.name;
      if (x.area) a.area = x.area;
    });
  }
  if (!found) { $('arOut').innerHTML = '<div class="card-sub" style="color:var(--danger)">No month data found for the selected period.</div>'; return; }
  _ar.agg = Object.values(agg); renderRank();
}
function renderRank() {
  const af = $('arArea').value, q = ($('arSearch').value || '').toLowerCase();
  const rows = (_ar.agg || []).filter(x => x.adj > 0 && (af === 'all' || x.area === af) && (!q || (x.id + ' ' + x.name).toLowerCase().includes(q)))
    .sort((a, b) => (b.adj - a.adj) || ((a.totalDuty || 0) - (b.totalDuty || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
  const tot = rows.reduce((t, x) => t + x.adj, 0);
  const T = Object.values(_ar.types), cnt = c => T.filter(t => t === c).length;
  const chips = Object.keys(_ar.types).sort((a, b) => dnum(a) - dnum(b) || a.localeCompare(b)).map(d => {
    const t = _ar.types[d], col = t === 'R' ? 'var(--success)' : t === 'H' ? 'var(--warning)' : 'var(--muted)';
    return `<button type="button" class="calc-mini-btn" style="margin:2px;color:${col}" onclick="__arToggleDay('${d}')">${esc(d.slice(0, 6))} ${t}</button>`;
  }).join('');
  $('arOut').innerHTML = `<div class="admin-stat-grid" style="margin:8px 0">
<div class="admin-stat-box"><span class="as-num">${rows.length}</span><span class="as-lbl">Employees with absence</span></div>
<div class="admin-stat-box"><span class="as-num">${tot}</span><span class="as-lbl">Total absent days</span></div>
<div class="admin-stat-box"><span class="as-num">${cnt('R')}</span><span class="as-lbl">General duty days</span></div>
<div class="admin-stat-box"><span class="as-num">${cnt('H') + cnt('O')}</span><span class="as-lbl">Holiday/Off days (excluded)</span></div></div>
<details style="margin:6px 0"><summary style="font-size:12.5px;font-weight:700;cursor:pointer">Day types (R = general duty, H = holiday, O = off). Tap a day to correct it</summary><div style="margin-top:6px">${chips}</div></details>
<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
<thead><tr style="text-align:left;border-bottom:1px solid var(--border-strong)"><th>#</th><th>Employee</th><th>Area</th><th>Absent</th><th>Dates</th></tr></thead><tbody>
${rows.slice(0, 150).map((x, i) => `<tr style="border-bottom:1px solid var(--border)"><td>${i + 1}</td><td><b>${esc(x.name)}</b><br><small style="color:var(--muted)">${esc(x.id)}${x.byMonth && x.byMonth.length > 1 ? ' • ' + esc(x.byMonth.join(', ')) : ''}</small></td><td>${esc(x.area || '')}</td><td><b style="color:var(--danger)">${x.adj}d</b></td><td style="font-size:11.5px;color:var(--text-2)">${x.zeros.map(d => esc(d.slice(0, 6))).join(', ')}</td></tr>`).join('') || '<tr><td colspan="5" style="padding:12px;color:var(--muted)">No absences found.</td></tr>'}
</tbody></table></div>`;
}
window.__arToggleDay = d => { const ov = LS(K_OV, {}), c = { R: 'H', H: 'O', O: 'R' }; ov[d] = c[_ar.types[d]] || 'R'; SV(K_OV, ov); runRank(); };

/* ---------- Change log + undo ---------- */
const snap = id => ({ id, area: AREA_MAP[id], det: AREA_DETAILS[id] ? JSON.parse(JSON.stringify(AREA_DETAILS[id])) : undefined });
const restore = s => { s.area === undefined ? delete AREA_MAP[s.id] : AREA_MAP[s.id] = s.area; s.det === undefined ? delete AREA_DETAILS[s.id] : AREA_DETAILS[s.id] = s.det; };
function persist() { persistAreaMap(); persistAreaDetails(); try { _masterDirLastBuildTs = 0; } catch (e) {} }
function logChange(desc, before, al) { const l = LS(K_LOG, []); l.unshift({ t: new Date().toISOString(), desc, before, al }); SV(K_LOG, l.slice(0, 100)); }
window.__inbUndo = i => {
  const l = LS(K_LOG, []), e = l[i]; if (!e) return;
  e.before.forEach(restore);
  if (e.al) { const a = LS(K_ALIAS, {}); delete a[e.al.old]; SV(K_ALIAS, a); }
  l.splice(i, 1); SV(K_LOG, l); persist(); showToast('Undone: ' + e.desc, 'info'); renderInbox(false);
};

/* ---------- Inbox ---------- */
let _inb = { latest: '', neu: [], missing: [], merge: [], pkg: [] };
const nk = s => String(s || '').toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]+/g, ' ').trim();
async function loadInbox() {
  const now = new Date(), got = [];
  for (let i = 0; i < 6 && got.length < 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1), ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    let l = []; try { l = await fetchMonthPreIndexedData(ym) || []; } catch (e) {}
    l = l.filter(e => e.isRppf !== false); if (l.length) got.push({ ym, l });
  }
  if (!got.length) { _inb = { latest: '', neu: [], missing: [], merge: [], pkg: [] }; return; }
  const cur = got[0].l, ids = new Set(cur.map(e => e.id));
  const neu = cur.filter(e => !isListedEmployeeId(e.id));
  const missing = Object.keys(AREA_MAP).filter(id => !ids.has(id));
  const names = {}; cur.forEach(e => names[nk(e.name)] = e);
  const prevName = {}; (got[1] ? got[1].l : []).forEach(e => prevName[e.id] = e);
  const merge = [];
  neu.forEach(n => { const old = missing.find(id => prevName[id] && nk(prevName[id].name) === nk(n.name)); if (old) merge.push({ old, neu: n }); });
  const mOld = new Set(merge.map(m => m.old)), mNew = new Set(merge.map(m => m.neu.id));
  const pkg = got[1] ? cur.filter(e => prevName[e.id] && prevName[e.id].category && e.category && prevName[e.id].category !== e.category).map(e => ({ e, from: prevName[e.id].category })) : [];
  _inb = { latest: got[0].ym, prev: got[1] && got[1].ym, neu: neu.filter(n => !mNew.has(n.id)), missing: missing.filter(id => !mOld.has(id)), merge, pkg };
}
function subOpts(area) { return '<option value="">(no sub-section)</option>' + ((typeof AREA_SUBS !== 'undefined' && AREA_SUBS[area]) || []).map(s => `<option>${esc(s)}</option>`).join(''); }
window.__inbArea = () => { $('inbSub').innerHTML = subOpts($('inbArea').value); };
window.__inbAssign = () => {
  const a = $('inbArea').value, s = $('inbSub').value, ids = [...document.querySelectorAll('.inbChk:checked')].map(c => c.value);
  if (!ids.length) return showToast('Select employees first', 'warn');
  const before = ids.map(snap);
  ids.forEach(id => { AREA_MAP[id] = a; AREA_DETAILS[id] = Object.assign(AREA_DETAILS[id] || {}, s ? { s } : {}); });
  logChange(`Assigned ${ids.length} new → ${a}${s ? ' / ' + s : ''}`, before); persist(); renderInbox(true);
};
window.__inbMerge = (old, nw) => {
  const before = [snap(old), snap(nw)], a = LS(K_ALIAS, {});
  AREA_MAP[nw] = AREA_MAP[old]; if (AREA_DETAILS[old]) AREA_DETAILS[nw] = JSON.parse(JSON.stringify(AREA_DETAILS[old]));
  delete AREA_MAP[old]; delete AREA_DETAILS[old]; a[old] = nw; SV(K_ALIAS, a);
  logChange(`ID changed ${old} → ${nw}`, before, { old, nw }); persist(); renderInbox(true);
};
window.__inbRemove = id => { logChange('Removed ' + id, [snap(id)]); delete AREA_MAP[id]; delete AREA_DETAILS[id]; persist(); renderInbox(true); };
async function renderInbox(reload) {
  const box = $('inbOut'); if (reload !== false) { box.innerHTML = '<div class="card-sub">Scanning uploaded months...</div>'; await loadInbox(); }
  const x = _inb, th = 'text-align:left;padding:4px 6px', td = 'padding:4px 6px';
  const nb = $('admNavInboxCount'); if (nb) nb.textContent = x.neu.length + x.merge.length + x.pkg.length;
  const sec = (t, n, body) => `<div style="margin-top:12px"><div style="font-weight:800;font-size:13.5px">${t} <span class="badge">${n}</span></div>${n ? body : '<div class="card-sub">Nothing to review.</div>'}</div>`;
  const log = LS(K_LOG, []).slice(0, 8);
  box.innerHTML = (x.latest ? `<div class="card-sub">Latest month: <b>${x.latest}</b>${x.prev ? ' (compared with ' + x.prev + ')' : ''}</div>` : '<div class="card-sub">No month data found.</div>') +
    sec('New employees (not in any area)', x.neu.length, `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0"><select id="inbArea" onchange="__inbArea()" style="width:auto">${AREAS.map(a => `<option>${a}</option>`).join('')}</select><select id="inbSub" style="width:auto">${subOpts(AREAS[0])}</select><button class="calc-mini-btn btn-success-solid" onclick="__inbAssign()">Assign selected</button><label style="font-size:12px"><input type="checkbox" onchange="document.querySelectorAll('.inbChk').forEach(c=>c.checked=this.checked)"> All</label></div>
<table style="width:100%;font-size:13px">${x.neu.map(e => `<tr><td style="${td}"><input type="checkbox" class="inbChk" value="${esc(e.id)}"></td><td style="${td}"><b>${esc(e.name)}</b><br><small style="color:var(--muted)">${esc(e.id)} · ${esc(e.grade || '')}</small></td></tr>`).join('')}</table>`) +
    sec('Possible ID change (same name, new ID)', x.merge.length, `<table style="width:100%;font-size:13px">${x.merge.map(m => `<tr><td style="${td}"><b>${esc(m.neu.name)}</b><br><small style="color:var(--muted)">${esc(m.old)} → ${esc(m.neu.id)}</small></td><td style="${td}"><button class="calc-mini-btn btn-success-solid" onclick="__inbMerge('${esc(m.old)}','${esc(m.neu.id)}')">Merge (keep area &amp; history)</button></td></tr>`).join('')}</table>`) +
    sec('Package/category changed vs previous month', x.pkg.length, `<table style="width:100%;font-size:13px">${x.pkg.map(p => `<tr><td style="${td}"><b>${esc(p.e.name)}</b> <small style="color:var(--muted)">${esc(p.e.id)}</small></td><td style="${td}">${esc(p.from)} → <b>${esc(p.e.category)}</b></td></tr>`).join('')}</table>`) +
    sec('Listed but missing from latest month', x.missing.length, `<table style="width:100%;font-size:13px">${x.missing.map(id => `<tr><td style="${td}"><b>${esc(id)}</b> <small style="color:var(--muted)">${esc(AREA_MAP[id] || '')}</small></td><td style="${td}"><button class="calc-mini-btn danger-btn" onclick="__inbRemove('${esc(id)}')">Remove from list</button></td></tr>`).join('')}</table>`) +
    `<div style="margin-top:14px;font-weight:800;font-size:13.5px">Change log</div>` + (log.length ? log.map((l, i) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px dashed var(--border);font-size:12.5px"><span>${esc(l.desc)}<br><small style="color:var(--muted)">${new Date(l.t).toLocaleString()}</small></span><button class="calc-mini-btn" onclick="__inbUndo(${i})">Undo</button></div>`).join('') : '<div class="card-sub">No changes yet.</div>');
}

/* ---------- inject UI + hook tab switching ---------- */
function init() {
  const nav = document.querySelector('.admin-nav-tabs'), wrap = $('adminDashboardWrap');
  if (!nav || !wrap || $('admTabBtnInbox')) return;
  nav.insertAdjacentHTML('afterbegin', '<button type="button" class="admin-tab-btn" id="admTabBtnInbox" onclick="switchAdminTab(\'inbox\')">Inbox (<span id="admNavInboxCount">0</span>)</button><button type="button" class="admin-tab-btn" id="admTabBtnARank" onclick="switchAdminTab(\'arank\')">Absent Rank (Beta)</button>');
  const cm = new Date(), ym = cm.getFullYear() + '-' + String(cm.getMonth() + 1).padStart(2, '0');
  wrap.insertAdjacentHTML('beforeend', `
<div class="admin-section-pane" id="admPaneInbox"><div class="card" style="padding:14px">
<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><div class="card-title">Inbox: review the latest upload</div><div class="card-sub" style="white-space:normal">Detects new employees, ID changes, package changes and missing staff from the uploaded month files. Every change is logged and can be undone.</div></div>
<div style="display:flex;gap:6px"><button class="calc-mini-btn" onclick="renderInboxRescan()">Rescan</button><button class="calc-mini-btn btn-success-solid" onclick="adminPushAreasToGithub()">Save to server</button></div></div>
<div id="inbOut"></div></div></div>
<div class="admin-section-pane" id="admPaneARank"><div class="card" style="padding:14px">
<div class="card-title">Absent Ranking (Beta): from existing monthly data</div>
<div class="card-sub" style="white-space:normal">A day counts as absent when it is a general-duty day (most staff worked regular duty), the employee has zero duty and no punch. Holiday/off days are never ranked. Needs month files with daily rows.</div>
<div class="admin-meta-grid" style="margin-top:8px">
<div><label style="font-size:12px;margin-top:0">Month (end)</label><input type="month" id="arMonth" value="${ym}" style="min-height:38px"></div>
<div><label style="font-size:12px;margin-top:0">Period</label><select id="arSpan" style="min-height:38px"><option value="1">This month (1M)</option><option value="3">Last 3 months (3M)</option><option value="6">Last 6 months (6M)</option><option value="ytd">This Year So Far (YTD)</option><option value="12">Last 12 months (1Y)</option></select></div>
<div><label style="font-size:12px;margin-top:0">Night shift</label><label style="font-size:12.5px;display:flex;gap:6px;align-items:center;min-height:38px"><input type="checkbox" id="arSkipNight" checked> Day after a night shift is not absent (also across months)</label></div>
<div><label style="font-size:12px;margin-top:0">Forgive N zero-days / month (assumed weekly off)</label><input type="number" id="arAllow" value="0" min="0" style="min-height:38px"></div></div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="btn-primary" style="width:auto" onclick="__arRun()">Calculate</button>
<select id="arArea" onchange="__arRender()" style="width:auto"><option value="all">All Areas</option>${AREAS.map(a => `<option>${a}</option>`).join('')}</select>
<input type="text" id="arSearch" placeholder="Search..." oninput="__arRender()" style="width:150px;margin:0"></div>
<div id="arOut" style="margin-top:8px"></div></div></div>`);
  window.__arRun = runRank; window.__arRender = renderRank; window.renderInboxRescan = () => renderInbox(true);
  const orig = window.switchAdminTab;
  window.switchAdminTab = function (t) {
    if (t !== 'inbox' && t !== 'arank') return orig.apply(this, arguments);
    document.querySelectorAll('.admin-nav-tabs .admin-tab-btn,.admin-section-pane').forEach(b => b.classList.remove('active'));
    $(t === 'inbox' ? 'admTabBtnInbox' : 'admTabBtnARank').classList.add('active');
    $(t === 'inbox' ? 'admPaneInbox' : 'admPaneARank').classList.add('active');
    if (t === 'inbox') (typeof loadAreaMap === 'function' ? loadAreaMap() : Promise.resolve()).then(() => renderInbox(true));
  };
}
init();
})();

(function () {
'use strict';
const $ = id => document.getElementById(id);
const LS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const K_LOG = (typeof STORAGE_NAMESPACE !== 'undefined' ? STORAGE_NAMESPACE : '') + 'rppf_admin_log_v1', ALLOWED = ['Solid Production', 'Softgel Production', 'Packing Hall', 'Overall'];
/* The page calls persistAreaMap/Details/Subs but they are not defined in this file; fall back to the area cache writer. */
['Map', 'Details', 'Subs'].forEach(n => { if (typeof window['persistArea' + n] !== 'function') window['persistArea' + n] = () => { try { saveAreaCache(); } catch (e) {} }; });
const persistAll = () => { persistAreaMap(); persistAreaDetails(); persistAreaSubs(); try { _masterDirLastBuildTs = 0; } catch (e) {} };
const snap = id => ({ id, area: AREA_MAP[id], det: AREA_DETAILS[id] ? JSON.parse(JSON.stringify(AREA_DETAILS[id])) : undefined });
const logChange = (desc, before) => { const l = LS(K_LOG, []); l.unshift({ t: new Date().toISOString(), desc, before }); try { localStorage.setItem(K_LOG, JSON.stringify(l.slice(0, 100))); } catch (e) {} };
const canon = (area, s) => { s = String(s || '').trim(); const f = (AREA_SUBS[area] || []).find(x => x.toLowerCase() === s.toLowerCase()); return f || s; };
let _areas = ALLOWED.slice(), _areasKey = '', _diag = '';
const areaOf = s => _areas.find(a => a.toLowerCase() === String(s || '').trim().toLowerCase());
let _dir = [], _groups = [], _imp = null;

function applySubs(changes, desc) {
  if (!changes.length) return showToast('Nothing to change', 'info');
  const before = changes.map(c => snap(c.id));
  changes.forEach(c => {
    const a = c.area || AREA_MAP[c.id], s = c.sub ? canon(a, c.sub) : '';
    AREA_MAP[c.id] = a; const d = AREA_DETAILS[c.id] = AREA_DETAILS[c.id] || {};
    if (s) { d.s = s; AREA_SUBS[a] = AREA_SUBS[a] || []; if (!AREA_SUBS[a].includes(s)) AREA_SUBS[a].push(s); } else delete d.s;
  });
  logChange(desc + ` (${changes.length})`, before); persistAll(); showToast(desc + ` (${changes.length})`, 'success'); render();
}
async function loadDir() {
  _diag = ''; const now = new Date();
  for (let i = 0; i < 4; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); let l = []; try { l = await fetchMonthPreIndexedData(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')) || []; } catch (e) {} if (l.length) break; }
  try { await loadAreaMap(); } catch (e) { _diag = 'Area list error: ' + e.message + '. '; }
  if (Object.keys(AREA_MAP).length < 2) {
    try {
      const r = await fetch(REMOTE_BASE_URL + 'areas.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json(); if (d && d.areas && Object.keys(d.areas).length) { AREA_MAP = d.areas; AREA_DETAILS = d.details || {}; AREA_SUBS = d.subsections || {}; }
    } catch (e) { _diag += 'Could not load areas.json from the server (' + e.message + '). Open the app from its website link instead of a saved file, and check the internet. '; }
  }
  const nm = {}; Object.values(monthIndexMemoryCache || {}).forEach(l => (l || []).forEach(e => { if (e && e.id) nm[String(e.id).toUpperCase()] = e; }));
  _dir = Object.keys(AREA_MAP).filter(id => AREA_MAP[id]).map(id => { const m = nm[id] || {}; return { id, name: m.name || id, designation: m.grade || '', area: AREA_MAP[id], sub: (AREA_DETAILS[id] || {}).s || '' }; });
}
const syncAreas = () => {
  const as = [...new Set(ALLOWED.concat(_dir.map(e => e.area)))], key = as.join('|'); if (key === _areasKey) return;
  _areasKey = key; _areas = as; const sel = $('subArea'), cur = sel.value; sel.innerHTML = as.map(a => `<option>${esc(a)}</option>`).join(''); if (as.includes(cur)) sel.value = cur;
};
const ensureXlsx = async () => { if (typeof XLSX === 'undefined') await _loadScript('https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js'); };

/* ---- export / import ---- */
const csvCell = v => { v = String(v == null ? '' : v); return /[",\n\t]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function csvParse(text) {
  text = String(text).replace(/^\uFEFF/, ''); const first = text.split(/\r?\n/)[0] || '';
  const d = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); } return rows;
}
window.__subCsvParse = csvParse;
async function sheetRows() {
  await loadDir(); if (!_dir.length) throw new Error('No employees found. Open this after month data / area list has loaded.');
  const rows = _dir.slice().sort((a, b) => a.area.localeCompare(b.area) || String(a.designation).localeCompare(String(b.designation)) || a.id.localeCompare(b.id));
  return [['ID', 'Name', 'Designation', 'Area', 'Sub-section']].concat(rows.map(e => [e.id, e.name, e.designation, e.area, e.sub]));
}
window.__subExport = async () => {
  try {
    const rows = await sheetRows(), csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = 'subsection_sheet.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast(`Sheet downloaded (${rows.length - 1} employees). If nothing saved, use "Copy for Excel".`, 'success');
  } catch (e) { showToast('Export failed: ' + e.message, 'error'); }
};
window.__subCopy = async () => {
  try {
    const t = (await sheetRows()).map(r => r.map(c => String(c == null ? '' : c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
    try { await navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    showToast('Copied. Paste into Excel / Google Sheets (cell A1).', 'success');
  } catch (e) { showToast('Copy failed: ' + e.message, 'error'); }
};
function parseRows(rows) {
  rows = rows.filter(r => r && r.some(c => String(c || '').trim()));
  let ci = { id: 0, area: -1, sub: 1 }, start = 0; const h = (rows[0] || []).map(c => String(c || '').trim().toLowerCase());
  if (h.some(c => /^(employee )?id$/.test(c))) {
    start = 1; ci = { id: h.findIndex(c => /^(employee )?id$/.test(c)), area: h.findIndex(c => /^(area|section)$/.test(c)), sub: h.findIndex(c => /sub/.test(c)) };
  } else if ((rows[0] || []).length >= 3) ci = { id: 0, area: 1, sub: 2 };
  const out = { changes: [], unknown: [], badArea: [], newSubs: new Set(), same: 0 };
  rows.slice(start).forEach(r => {
    const id = String(r[ci.id] || '').trim().toUpperCase(), sub = ci.sub >= 0 ? String(r[ci.sub] || '').trim() : '', rawA = ci.area >= 0 ? String(r[ci.area] || '').trim() : '';
    if (!id) return; if (!AREA_MAP[id]) return out.unknown.push(id);
    const area = rawA ? areaOf(rawA) : AREA_MAP[id]; if (!area) return out.badArea.push(id);
    const s = sub ? canon(area, sub) : ((AREA_DETAILS[id] || {}).s || '');
    if (area === AREA_MAP[id] && s === ((AREA_DETAILS[id] || {}).s || '')) return out.same++;
    if (s && !(AREA_SUBS[area] || []).includes(s)) out.newSubs.add(area + ' / ' + s);
    out.changes.push({ id, area, sub: s });
  });
  return out;
}
window.__subParse = parseRows;
function showPreview(p) {
  _imp = p;
  $('subImpOut').innerHTML = `<div class="card-sub" style="white-space:normal;margin-top:6px">To change: <b>${p.changes.length}</b> · unchanged: ${p.same} · unknown IDs: <b style="color:var(--warning)">${p.unknown.length}</b>${p.unknown.length ? ' (' + p.unknown.slice(0, 8).join(', ') + (p.unknown.length > 8 ? '…' : '') + ')' : ''} · invalid area: <b style="color:var(--danger)">${p.badArea.length}</b>${p.badArea.length ? ' (' + p.badArea.slice(0, 8).join(', ') + ')' : ''}<br>New sub-sections to create: ${p.newSubs.size ? [...p.newSubs].map(esc).join('; ') : 'none'}</div>
<button class="btn-primary" style="width:auto;margin-top:6px" onclick="__subApplyImport()" ${p.changes.length ? '' : 'disabled'}>Apply ${p.changes.length} changes</button>`;
}
window.__subApplyImport = () => { if (_imp) { applySubs(_imp.changes, 'Sheet import'); _imp = null; $('subImpOut').innerHTML = ''; } };
window.__subImportFile = async inp => {
  const f = inp.files[0]; if (!f) return;
  try {
    await loadDir(); let rows;
    if (/\.csv$|\.txt$/i.test(f.name)) rows = csvParse(await f.text());
    else { await ensureXlsx(); const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }); }
    showPreview(parseRows(rows));
  } catch (e) { showToast('Import failed: ' + e.message, 'error'); }
  inp.value = '';
};
window.__subImportPaste = async () => {
  await loadDir(); const t = $('subPaste').value;
  showPreview(parseRows(t.split(/\r?\n/).map(l => l.split(l.includes('\t') ? '\t' : ','))));
};

/* ---- group by designation / paste IDs / fill ---- */
const curArea = () => $('subArea').value;
window.__subGroupApply = (i, onlyEmpty) => {
  const g = _groups[i], sub = ($('subG' + i).value || '').trim(); if (!sub) return showToast('Type or pick a sub-section', 'warn');
  applySubs((onlyEmpty ? g.empty : g.all).map(id => ({ id, sub })), `${g.name} → ${curArea()} / ${sub}`);
};
window.__subPasteIds = () => {
  const ids = [...new Set(($('subIds').value.match(/[A-Za-z]{0,3}\d{3,8}/g) || []).map(x => x.toUpperCase()))].filter(id => AREA_MAP[id]);
  const sub = ($('subIdsSub').value || '').trim(); if (!sub || !ids.length) return showToast('Need a sub-section and at least one listed ID', 'warn');
  const mv = $('subMove').checked; applySubs(ids.map(id => ({ id, sub, area: mv ? curArea() : AREA_MAP[id] })), `IDs → ${sub}`); $('subIds').value = '';
};
window.__subFill = area => { const ids = _dir.filter(e => e.area === area && !e.sub).map(e => ({ id: e.id, sub: 'General' })); if (typeof openConfirmModal === 'function') openConfirmModal(`Put ${ids.length} employees of ${area} without a sub-section into "General"?`, () => applySubs(ids, area + ' → General')); else applySubs(ids, area + ' → General'); };
window.__subUndo = i => { window.__inbUndo ? window.__inbUndo(i) : 0; setTimeout(() => loadDir().then(render), 50); };

let _qsel = new Set(), _qshown = [], _qOpts = [], _qTot = 0, _qNoSub = 0;
function qmCount() { $('qmCount').textContent = `${_qshown.length} shown · ${_qsel.size} ticked · ${_qNoSub} without sub-section in ${curArea()}`; }
function renderQM() {
  if (!$('qmList')) return;
  const a = curArea(), f = $('qmFilter').value, q = ($('qmSearch').value || '').trim().toLowerCase();
  const all = _dir.filter(e => e.area === a).sort((x, y) => String(x.designation).localeCompare(String(y.designation)) || String(x.name).localeCompare(String(y.name)));
  _qsel.forEach(id => { if (!all.some(e => e.id === id)) _qsel.delete(id); });
  const shown = all.filter(e => (f === 'all' || !e.sub) && (!q || (e.id + ' ' + e.name + ' ' + e.designation).toLowerCase().includes(q)));
  _qshown = shown.map(e => e.id); _qNoSub = all.filter(e => !e.sub).length;
  $('qmList').innerHTML = shown.map(e => `<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer"><input type="checkbox" ${_qsel.has(e.id) ? 'checked' : ''} onchange="__qmToggle('${esc(e.id)}',this.checked)" style="width:20px;height:20px;margin:0"><span style="flex:1"><b>${esc(e.name)}</b> <small style="color:var(--muted)">${esc(e.id)}</small><br><small style="color:var(--muted)">${esc(e.designation || '')}${e.sub ? ' · ' + esc(e.sub) : ''}</small></span></label>`).join('') || `<div style="padding:12px;color:var(--muted)">${all.length ? 'Nobody matches this filter.' : 'No employees found in ' + esc(a) + '.'} Loaded: ${_dir.length} employees. Areas found: ${esc(_areas.join(', '))}. ${esc(_diag)}</div>`;
  const t = $('qmTarget'), cur = t.value; _qOpts = (AREA_SUBS[a] || []).concat(['__new__']);
  t.innerHTML = _qOpts.map(s => s === '__new__' ? '<option value="__new__">+ New sub-section…</option>' : `<option>${esc(s)}</option>`).join('');
  if (_qOpts.includes(cur)) t.value = cur; __qmTargetChange(); qmCount();
}
window.__qmRender = renderQM;
window.__qmReset = () => { _qsel.clear(); render(); };
window.__qmToggle = (id, on) => { on ? _qsel.add(id) : _qsel.delete(id); qmCount(); };
window.__qmAll = on => { if (on) _qshown.forEach(id => _qsel.add(id)); else _qsel.clear(); renderQM(); };
window.__qmTargetChange = () => { $('qmNew').style.display = $('qmTarget').value === '__new__' ? '' : 'none'; };
window.__qmMove = async () => {
  const a = curArea(), ids = [..._qsel].filter(id => AREA_MAP[id] === a), tv = $('qmTarget').value, sub = String(tv === '__new__' ? $('qmNew').value : tv || '').trim();
  const st = $('qmStatus'), btn = $('qmBtn');
  if (!ids.length) return showToast('Tick at least one employee', 'warn');
  if (!sub) return showToast('Choose or type a sub-section', 'warn');
  btn.disabled = true; st.style.color = 'var(--brand-text)'; st.textContent = 'Saving… please wait';
  applySubs(ids.map(id => ({ id, sub })), `Quick move → ${a} / ${sub}`); _qsel.clear(); $('qmNew').value = '';
  try {
    if (typeof getGhToken === 'function' && !getGhToken()) { st.style.color = 'var(--warning)'; st.textContent = `Done on this device (${ids.length} moved). Server key is not set, so it is not synced yet.`; }
    else {
      await githubPutFile('areas.json', utf8ToBase64(JSON.stringify({ areas: AREA_MAP, details: AREA_DETAILS, subsections: AREA_SUBS, designationRates: DESIG_RATES, rateTable: RATE_TABLE }, null, 2)), 'Update sub-sections via Quick Move');
      try { Object.keys(localStorage).forEach(k => { const _ns = (typeof STORAGE_NAMESPACE !== 'undefined' ? STORAGE_NAMESPACE : ''); if (k.startsWith(_ns + 'renata_lb_') || k.startsWith(_ns + 'renata_mdata_')) localStorage.removeItem(k); }); } catch (e) {}
      st.style.color = 'var(--success)'; st.textContent = `Done ✓ ${ids.length} moved to "${sub}" and saved to the server.`;
    }
  } catch (e) { st.style.color = 'var(--danger)'; st.textContent = 'Moved here, but the server save failed: ' + e.message; }
  btn.disabled = false;
};
async function render() {
  if (!$('subOut')) return; await loadDir(); syncAreas(); renderQM();
  const area = $('subArea') ? curArea() : ALLOWED[0], inA = _dir.filter(e => e.area === area), tot = _dir.length, done = _dir.filter(e => e.sub).length;
  const kpi = _areas.map(a => { const l = _dir.filter(e => e.area === a), d = l.filter(e => e.sub).length; return `<div class="admin-stat-box"><span class="as-num">${d}/${l.length}</span><span class="as-lbl">${a}${l.length > d ? ` <a href="#" onclick="__subFill('${a}');return false">fill General</a>` : ''}</span></div>`; }).join('');
  const gm = {}; inA.forEach(e => { const k = e.designation || '(none)', g = gm[k] || (gm[k] = { name: k, all: [], empty: [] }); g.all.push(e.id); if (!e.sub) g.empty.push(e.id); });
  _groups = Object.values(gm).sort((a, b) => b.all.length - a.all.length);
  $('subList').innerHTML = (AREA_SUBS[area] || []).map(s => `<option value="${esc(s)}">`).join('');
  const log = LS(K_LOG, []).slice(0, 3);
  $('subOut').innerHTML = `<div class="card-sub">With sub-section: <b>${done}</b> of ${tot} (${tot ? Math.round(done * 100 / tot) : 0}%)</div><div class="admin-stat-grid" style="margin:6px 0">${kpi}</div>
<div style="font-weight:800;font-size:13.5px;margin-top:10px">C. By designation in ${esc(area)}</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
${_groups.map((g, i) => `<tr style="border-bottom:1px solid var(--border)"><td style="padding:4px"><b>${esc(g.name)}</b><br><small style="color:var(--muted)">${g.all.length} people, ${g.empty.length} without sub</small></td><td><input id="subG${i}" list="subList" placeholder="Sub-section" style="min-width:130px;margin:0"></td><td style="white-space:nowrap"><button class="calc-mini-btn btn-success-solid" onclick="__subGroupApply(${i},true)">Unassigned only</button> <button class="calc-mini-btn" onclick="__subGroupApply(${i},false)">All</button></td></tr>`).join('') || '<tr><td style="padding:8px;color:var(--muted)">No employees in this area.</td></tr>'}</table></div>
<div style="font-weight:800;font-size:13.5px;margin-top:12px">Recent changes</div>${log.map((l, i) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:3px 0"><span>${esc(l.desc)}</span><button class="calc-mini-btn" onclick="__subUndo(${i})">Undo</button></div>`).join('') || '<div class="card-sub">None yet.</div>'}`;
}
window.__subRender = render;

function init() {
  const nav = document.querySelector('.admin-nav-tabs'), wrap = $('adminDashboardWrap'); if (!nav || !wrap || $('admTabBtnSub')) return;
  nav.insertAdjacentHTML('afterbegin', '<button type="button" class="admin-tab-btn" id="admTabBtnSub" onclick="switchAdminTab(\'subtool\')">Sub-sections (Easy)</button>');
  wrap.insertAdjacentHTML('beforeend', `<div class="admin-section-pane" id="admPaneSub"><div class="card" style="padding:14px">
<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><div class="card-title">Sub-section Easy Tools</div><div class="card-sub" style="white-space:normal">Sort everyone into sub-sections in minutes: fill an Excel sheet, group by designation, or paste ID lists. Every change is logged and can be undone.</div></div><button class="calc-mini-btn btn-success-solid" onclick="adminPushAreasToGithub()">Save to server</button></div>
<div style="margin-top:8px"><label style="font-size:12px;margin-top:0">Area</label><select id="subArea" onchange="__qmReset()" style="max-width:260px">${ALLOWED.map(a => `<option>${a}</option>`).join('')}</select></div><datalist id="subList"></datalist>
<div style="margin-top:10px;padding:10px;border:1px solid var(--border-strong);border-radius:12px">
<div style="font-weight:800;font-size:13.5px">Quick Move: tick employees, choose a sub-section, done</div>
<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px"><select id="qmFilter" onchange="__qmRender()" style="width:auto;margin:0"><option value="empty">Without sub-section</option><option value="all">All in area</option></select><input type="text" id="qmSearch" placeholder="Search name / ID / designation" oninput="__qmRender()" style="flex:1;min-width:140px;margin:0"><button class="calc-mini-btn" onclick="__qmAll(true)">Tick all shown</button><button class="calc-mini-btn" onclick="__qmAll(false)">Untick all</button></div>
<div id="qmCount" class="card-sub" style="margin:6px 0"></div>
<div id="qmList" style="max-height:360px;overflow-y:auto;border:1px solid var(--border);border-radius:10px"></div>
<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px"><b style="font-size:13px">Move to:</b><select id="qmTarget" onchange="__qmTargetChange()" style="width:auto;margin:0"></select><input type="text" id="qmNew" placeholder="New sub-section name" style="display:none;width:180px;margin:0"><button class="btn-primary" id="qmBtn" style="width:auto" onclick="__qmMove()">Move &amp; Save</button></div>
<div id="qmStatus" style="margin-top:6px;font-size:12.5px;font-weight:700"></div></div>
<div id="subOut" style="margin-top:10px"></div>
<div style="margin-top:12px;font-weight:800;font-size:13.5px">A. Excel sheet: export, fill the Sub-section column, import</div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;align-items:center"><button class="calc-mini-btn btn-success-solid" onclick="__subExport()">Download sheet (.csv)</button><button class="calc-mini-btn" onclick="__subCopy()">Copy for Excel</button><input type="file" accept=".xlsx,.xls,.csv" onchange="__subImportFile(this)" style="width:auto;margin:0"></div>
<textarea id="subPaste" class="admin-textarea" style="min-height:56px;margin-top:6px" placeholder="Or paste columns copied from Excel: ID, Sub-section (optionally ID, Area, Sub-section)"></textarea>
<button class="calc-mini-btn" style="margin-top:4px" onclick="__subImportPaste()">Preview pasted data</button><div id="subImpOut"></div>
<div style="margin-top:14px;font-weight:800;font-size:13.5px">D. Paste an ID list into one sub-section (e.g. a team list from an in-charge)</div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px"><input id="subIdsSub" list="subList" placeholder="Sub-section" style="max-width:220px;margin:0"><label style="font-size:12.5px;display:flex;gap:4px;align-items:center"><input type="checkbox" id="subMove"> also move them to the selected area</label></div>
<textarea id="subIds" class="admin-textarea" style="min-height:56px;margin-top:6px" placeholder="CF8355, RF20850, CF5242..."></textarea><button class="btn-primary" style="width:auto;margin-top:4px" onclick="__subPasteIds()">Assign</button></div></div>`);
  const orig = window.switchAdminTab;
  window.switchAdminTab = function (t) {
    if (t !== 'subtool') return orig.apply(this, arguments);
    document.querySelectorAll('.admin-nav-tabs .admin-tab-btn,.admin-section-pane').forEach(b => b.classList.remove('active'));
    $('admTabBtnSub').classList.add('active'); $('admPaneSub').classList.add('active'); render();
  };
}
init();
})();

/* ==========================================================================
   APPROVED LONG-TERM LEAVE & MATERNITY LEAVE JAVASCRIPT CONTROLLER
   ========================================================================== */

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

function onLtCategoryPresetChange(cat) {
  const startInp = document.getElementById('admLtStartDt');
  const endInp = document.getElementById('admLtEndDt');
  if (!startInp || !endInp) return;
  const startVal = startInp.value || getTodayDateStr();
  startInp.value = startVal;
  
  const d = new Date(startVal);
  if (isNaN(d.getTime())) return;

  if (cat.includes('Maternity')) {
    d.setMonth(d.getMonth() + 6);
    endInp.value = d.toISOString().split('T')[0];
  } else if (cat.includes('Medical') || cat.includes('Sick')) {
    d.setMonth(d.getMonth() + 1);
    endInp.value = d.toISOString().split('T')[0];
  }
}

function onLtStartDateChange() {
  const cat = document.getElementById('admLtCategory')?.value || '';
  if (cat.includes('Maternity') || cat.includes('Medical') || cat.includes('Sick')) {
    onLtCategoryPresetChange(cat);
  }
}

function admLtPopulateEmployeeDatalist() {
  const dl = document.getElementById('admLtEmpDataList');
  if (!dl) return;
  let html = '';
  const dir = typeof getDirectoryList === 'function' ? getDirectoryList() : [];
  if (dir.length) {
    dir.forEach(e => {
      html += `<option value="${esc(e.id)}">${esc(e.n || '')} (${esc(e.des || e.d || '')}) - ${esc(e.area || '')}</option>`;
    });
  } else {
    Object.keys(AREA_MAP || {}).forEach(id => {
      const d = AREA_DETAILS[id] || {};
      html += `<option value="${esc(id)}">${esc(d.n || '')} - ${esc(AREA_MAP[id] || '')}</option>`;
    });
  }
  dl.innerHTML = html;
}

function admLtAddLeaveRecord() {
  const empVal = (document.getElementById('admLtEmpSearch')?.value || '').trim();
  const cat = document.getElementById('admLtCategory')?.value || 'Maternity Leave (ML)';
  const startDt = document.getElementById('admLtStartDt')?.value || '';
  const endDt = document.getElementById('admLtEndDt')?.value || '';
  const remarks = (document.getElementById('admLtRemarks')?.value || '').trim();

  if (!empVal) {
    showToast('Please select or enter Employee ID', 'warn');
    return;
  }
  if (!startDt || !endDt) {
    showToast('Please select both Start Date and End Date', 'warn');
    return;
  }
  if (startDt > endDt) {
    showToast('Start Date cannot be after End Date', 'warn');
    return;
  }

  const rec = typeof resolveEmployeeDirectoryRecord === 'function' ? resolveEmployeeDirectoryRecord(empVal) : { id: empVal };
  const empId = rec.id || empVal.toUpperCase();
  const empName = rec.n || (AREA_DETAILS[empId] || {}).n || empId;
  const empArea = rec.area || AREA_MAP[empId] || 'Unassigned';
  const empSub = rec.sub || (AREA_DETAILS[empId] || {}).s || '';
  const empDes = rec.des || (AREA_DETAILS[empId] || {}).des || '';

  if (!ABSENT_STORE.longTermLeaves) ABSENT_STORE.longTermLeaves = [];
  
  const existingIdx = ABSENT_STORE.longTermLeaves.findIndex(x => String(x.id).toUpperCase() === empId.toUpperCase());
  if (existingIdx !== -1) {
    ABSENT_STORE.longTermLeaves.splice(existingIdx, 1);
  }

  ABSENT_STORE.longTermLeaves.push({
    id: empId,
    name: empName,
    area: empArea,
    sub: empSub,
    designation: empDes,
    category: cat,
    startDate: startDt,
    endDate: endDt,
    remarks: remarks,
    addedAt: new Date().toISOString()
  });

  ABSENT_STORE.updatedAt = new Date().toISOString();
  saveAbsentCache();
  
  const empInp = document.getElementById('admLtEmpSearch');
  if (empInp) empInp.value = '';
  const remInp = document.getElementById('admLtRemarks');
  if (remInp) remInp.value = '';

  renderAdminLongTermLeaves();
  renderAdminAbsentPane();
  showToast(`Added ${cat} for ${empName} (${empId})`, 'success');
}

function admLtDeleteLeaveRecord(empId) {
  const doRemove = () => {
    if (!ABSENT_STORE.longTermLeaves) return;
    ABSENT_STORE.longTermLeaves = ABSENT_STORE.longTermLeaves.filter(x => String(x.id).toUpperCase() !== String(empId).toUpperCase());
    ABSENT_STORE.updatedAt = new Date().toISOString();
    saveAbsentCache();
    renderAdminLongTermLeaves();
    renderAdminAbsentPane();
    showToast(`Removed leave entry for ${empId}`, 'info');
  };
  if (typeof openConfirmModal === 'function') {
    openConfirmModal(`Are you sure you want to remove long-term approved leave for Employee ${empId}?`, doRemove);
  } else {
    doRemove();
  }
}

function renderAdminLongTermLeaves() {
  const container = document.getElementById('admLtLeavesTableContainer');
  const countEl = document.getElementById('admLtLeaveCount');
  if (!container) return;

  const leaves = getActiveLongTermLeaves();
  const filterVal = (document.getElementById('admLtTableFilter')?.value || '').trim().toLowerCase();
  const today = getTodayDateStr();

  let filtered = leaves;
  if (filterVal) {
    filtered = leaves.filter(item => {
      const q = `${item.id} ${item.name} ${item.area} ${item.sub} ${item.category} ${item.remarks}`.toLowerCase();
      return q.includes(filterVal);
    });
  }

  if (countEl) countEl.textContent = leaves.length;

  if (!filtered.length) {
    container.innerHTML = `<div style="text-align:center;padding:18px;color:#64748b;font-size:12.5px;">No long-term approved leave records found. Add above.</div>`;
    return;
  }

  let html = `<table class="admin-data-table" style="width:100%;font-size:12px;border-collapse:collapse;">
    <thead>
      <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;text-align:left;">
        <th style="padding:6px 8px;">Employee</th>
        <th style="padding:6px 8px;">Area & Sub</th>
        <th style="padding:6px 8px;">Leave Type</th>
        <th style="padding:6px 8px;">Duration</th>
        <th style="padding:6px 8px;">Status</th>
        <th style="padding:6px 8px;">Remarks</th>
        <th style="padding:6px 8px;text-align:center;">Action</th>
      </tr>
    </thead>
    <tbody>`;

  filtered.forEach(item => {
    const isActiveNow = (!item.startDate || item.startDate <= today) && (!item.endDate || item.endDate >= today);
    const isFuture = item.startDate && item.startDate > today;
    const isExpired = item.endDate && item.endDate < today;

    let statusBadge = '<span style="background:#10b981;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">ACTIVE NOW</span>';
    if (isFuture) statusBadge = '<span style="background:#3b82f6;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">UPCOMING</span>';
    if (isExpired) statusBadge = '<span style="background:#94a3b8;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">EXPIRED</span>';

    html += `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:6px 8px;">
        <div style="font-weight:700;color:#0f172a;">${esc(item.name || item.id)}</div>
        <div style="font-size:11px;color:#64748b;">${esc(item.id)} ${item.designation ? '• ' + esc(item.designation) : ''}</div>
      </td>
      <td style="padding:6px 8px;">
        <div>${esc(item.area || '—')}</div>
        <div style="font-size:11px;color:#64748b;">${esc(item.sub || 'General')}</div>
      </td>
      <td style="padding:6px 8px;font-weight:600;color:#059669;">
        ${esc(item.category || 'Approved Leave')}
      </td>
      <td style="padding:6px 8px;white-space:nowrap;">
        <div>${esc(item.startDate)} ➔ ${esc(item.endDate)}</div>
      </td>
      <td style="padding:6px 8px;">
        ${statusBadge}
      </td>
      <td style="padding:6px 8px;font-size:11px;color:#475569;">
        ${esc(item.remarks || '—')}
      </td>
      <td style="padding:6px 8px;text-align:center;">
        <button type="button" class="calc-mini-btn" onclick="admLtDeleteLeaveRecord('${esc(item.id)}')" title="Delete this leave record" style="padding:2px 6px;font-size:11px;color:#ef4444;border-color:rgba(239,68,68,0.3);">Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}



/* ==========================================================================
   PLANT HOLIDAY & DUTY COORDINATION JAVASCRIPT CONTROLLER (TICK/UNTICK)
   ========================================================================== */

let PLANT_HOLIDAYS = {
  cancelled: [],
  custom: [],
  byMonth: {}
};

let _admHolidayViewMode = 'all'; // 'all' shows all 30/31 days; 'holidays' shows holidays only

function getPlantHolidaysConfig() {
  try {
    const raw = localStorage.getItem(typeof PLANT_HOLIDAYS_KEY !== 'undefined' ? PLANT_HOLIDAYS_KEY : 'rppf_plant_holidays_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        PLANT_HOLIDAYS = Object.assign(PLANT_HOLIDAYS, parsed);
      }
    }
  } catch (e) {}
  if (!Array.isArray(PLANT_HOLIDAYS.cancelled)) PLANT_HOLIDAYS.cancelled = [];
  if (!Array.isArray(PLANT_HOLIDAYS.custom)) PLANT_HOLIDAYS.custom = [];
  return PLANT_HOLIDAYS;
}

function adminSetHolidayFilterMode(mode) {
  _admHolidayViewMode = mode;
  adminRenderPlantHolidays();
}

function adminSavePlantHolidays() {
  try {
    localStorage.setItem(typeof PLANT_HOLIDAYS_KEY !== 'undefined' ? PLANT_HOLIDAYS_KEY : 'rppf_plant_holidays_v1', JSON.stringify(PLANT_HOLIDAYS));
    Object.keys(_monthDatasetMetaCache).forEach(k => delete _monthDatasetMetaCache[k]);
    Object.keys(monthIndexMemoryCache).forEach(m => {
      (monthIndexMemoryCache[m] || []).forEach(e => { if (e) e._metricsComputed = false; });
    });
  } catch (e) {}

  if (typeof saveAreaCache === 'function') {
    saveAreaCache();
  }

  showToast('Plant holidays and duty coordination saved successfully!', 'success');
  adminRenderPlantHolidays();
}

function adminToggleHoliday(dateStr, isChecked, isGeneralDay = false) {
  dateStr = String(dateStr).toUpperCase().trim();
  if (!Array.isArray(PLANT_HOLIDAYS.cancelled)) PLANT_HOLIDAYS.cancelled = [];
  if (!Array.isArray(PLANT_HOLIDAYS.custom)) PLANT_HOLIDAYS.custom = [];

  if (isChecked) {
    // Turning this date INTO a holiday!
    PLANT_HOLIDAYS.cancelled = PLANT_HOLIDAYS.cancelled.filter(d => d !== dateStr);
    if (isGeneralDay) {
      if (!PLANT_HOLIDAYS.custom.includes(dateStr)) {
        PLANT_HOLIDAYS.custom.push(dateStr);
      }
      showToast(`Made ${dateStr} an official Plant Holiday / Day Off!`, 'success');
    } else {
      showToast(`Restored holiday for ${dateStr}`, 'info');
    }
  } else {
    // Turning this date into a REGULAR working day!
    PLANT_HOLIDAYS.custom = PLANT_HOLIDAYS.custom.filter(d => d !== dateStr);
    if (!PLANT_HOLIDAYS.cancelled.includes(dateStr)) {
      PLANT_HOLIDAYS.cancelled.push(dateStr);
    }
    showToast(`Cancelled holiday on ${dateStr} (Now a Regular Working Day)`, 'info');
  }
  adminSavePlantHolidays();
}

function adminAddCustomHoliday() {
  const dInp = document.getElementById('admNewHolidayDateInp');
  const tInp = document.getElementById('admNewHolidayTitleInp');
  const dVal = (dInp?.value || '').trim();
  const title = (tInp?.value || '').trim() || 'Custom Plant Holiday';

  if (!dVal) {
    showToast('Please select a date', 'warn');
    return;
  }

  // Format to DD-MON-YYYY
  const p = dVal.split('-');
  if (p.length !== 3) return;
  const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const formatted = `${p[2]}-${mons[parseInt(p[1],10)-1]}-${p[0]}`.toUpperCase();

  if (!Array.isArray(PLANT_HOLIDAYS.custom)) PLANT_HOLIDAYS.custom = [];
  if (!PLANT_HOLIDAYS.custom.includes(formatted)) {
    PLANT_HOLIDAYS.custom.push(formatted);
  }
  if (!Array.isArray(PLANT_HOLIDAYS.cancelled)) PLANT_HOLIDAYS.cancelled = [];
  PLANT_HOLIDAYS.cancelled = PLANT_HOLIDAYS.cancelled.filter(d => d !== formatted);

  if (dInp) dInp.value = '';
  if (tInp) tInp.value = '';

  adminSavePlantHolidays();
  showToast(`Added holiday for ${formatted}`, 'success');
}

function adminRenderPlantHolidays() {
  const container = document.getElementById('admHolidayDatesContainer');
  const lbl = document.getElementById('admHolidaySelectedMonthLbl');
  if (!container) return;

  getPlantHolidaysConfig();

  const y = document.getElementById('adminPdfYear')?.value || new Date().getFullYear();
  const m = document.getElementById('adminPdfMonth')?.value || String(new Date().getMonth()+1).padStart(2, '0');
  const ymStr = `${y}-${m}`;
  if (lbl) lbl.textContent = ymStr;

  const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const monName = mons[parseInt(m,10)-1];
  const lastDay = new Date(parseInt(y,10), parseInt(m,10), 0).getDate();

  const baseHols = {
    '21-FEB': 'Shaheed Day & Mother Language Day',
    '26-MAR': 'Independence Day',
    '14-APR': 'Pahela Baishakh',
    '01-MAY': 'May Day (Workers Day)',
    '16-DEC': 'Victory Day',
    '25-DEC': 'Christmas Day',
    '20-OCT-2026': 'Durga Puja (Bijaya Dashami)',
    '21-OCT-2026': 'Durga Puja Holiday'
  };

  const daysOfWeek = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = '';
  let activeHolsCount = 0;

  // First pass: count active holidays
  for (let d = 1; d <= lastDay; d++) {
    const dStr = String(d).padStart(2, '0');
    const dtObj = new Date(parseInt(y,10), parseInt(m,10)-1, d);
    const dayName = daysOfWeek[dtObj.getDay()];
    const fullDate = `${dStr}-${monName}-${y}`.toUpperCase();
    const shortDate = `${dStr}-${monName}`;
    const isWeekend = (dayName === 'Thu' || dayName === 'Fri');
    const holTitle = baseHols[fullDate] || baseHols[shortDate] || (PLANT_HOLIDAYS.custom.includes(fullDate) ? 'Special Plant Holiday' : '');
    const isDefaultHoliday = isWeekend || Boolean(holTitle);
    const isCustom = PLANT_HOLIDAYS.custom.includes(fullDate);
    const isCancelled = (PLANT_HOLIDAYS.cancelled || []).includes(fullDate);
    if ((isDefaultHoliday || isCustom) && !isCancelled) activeHolsCount++;
  }

  // Filter toolbar
  const filterToolbar = `
  <div style="grid-column:1/-1;display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
    <button type="button" class="calc-mini-btn ${_admHolidayViewMode === 'all' ? 'active' : ''}" onclick="adminSetHolidayFilterMode('all')" style="${_admHolidayViewMode === 'all' ? 'background:#0f766e;color:#fff;border-color:#0f766e;font-weight:700;' : ''}">
      📅 Show All Days of Month (${lastDay})
    </button>
    <button type="button" class="calc-mini-btn ${_admHolidayViewMode === 'holidays' ? 'active' : ''}" onclick="adminSetHolidayFilterMode('holidays')" style="${_admHolidayViewMode === 'holidays' ? 'background:#0f766e;color:#fff;border-color:#0f766e;font-weight:700;' : ''}">
      🎯 Holidays &amp; Weekends Only (${activeHolsCount})
    </button>
  </div>`;

  html += filterToolbar;

  for (let d = 1; d <= lastDay; d++) {
    const dStr = String(d).padStart(2, '0');
    const dtObj = new Date(parseInt(y,10), parseInt(m,10)-1, d);
    const dayName = daysOfWeek[dtObj.getDay()];
    const fullDate = `${dStr}-${monName}-${y}`.toUpperCase();
    const shortDate = `${dStr}-${monName}`;

    const isWeekend = (dayName === 'Thu' || dayName === 'Fri');
    const holTitle = baseHols[fullDate] || baseHols[shortDate];
    const isCustom = PLANT_HOLIDAYS.custom.includes(fullDate);
    const isDefaultHoliday = isWeekend || Boolean(holTitle);
    const isCancelled = (PLANT_HOLIDAYS.cancelled || []).includes(fullDate);

    // If viewing holidays only, skip regular working days
    if (_admHolidayViewMode === 'holidays') {
      if (!isDefaultHoliday && !isCustom) continue;
      if (isCancelled) continue;
    }

    const isGeneralDay = !isDefaultHoliday;
    // Checked if: (it is default holiday and not cancelled) OR (it is custom holiday)
    const isChecked = (isDefaultHoliday && !isCancelled) || isCustom;

    let badgeText = '';
    let badgeColor = '#64748b';
    let cardBg = '#ffffff';
    let borderColor = '#e2e8f0';

    if (isChecked) {
      if (isCustom) {
        badgeText = '✓ Declared Plant Holiday (ছুটি ঘোষিত)';
        badgeColor = '#0d9488';
        cardBg = '#f0fdfa';
        borderColor = '#5eead4';
      } else if (isWeekend) {
        badgeText = `✓ Weekend (${dayName})`;
        badgeColor = '#4f46e5';
        cardBg = '#f8fafc';
        borderColor = '#cbd5e1';
      } else {
        badgeText = `✓ ${holTitle || 'Govt Holiday'}`;
        badgeColor = '#059669';
        cardBg = '#f0fdf4';
        borderColor = '#86efac';
      }
    } else {
      if (isDefaultHoliday) {
        badgeText = `❌ Cancelled / Regular Working Day`;
        badgeColor = '#dc2626';
        cardBg = '#fef2f2';
        borderColor = '#fca5a5';
      } else {
        badgeText = `Regular Working Day (${dayName})`;
        badgeColor = '#64748b';
        cardBg = '#ffffff';
        borderColor = '#e2e8f0';
      }
    }

    html += `
    <div style="background:${cardBg};border:1.5px solid ${borderColor};border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;transition:all 0.15s ease;">
      <div style="min-width:0;">
        <div style="font-size:12.5px;font-weight:800;color:${isChecked ? '#0f172a' : (isDefaultHoliday ? '#991b1b' : '#334155')};${!isChecked && isDefaultHoliday ? 'text-decoration:line-through;' : ''}">
          ${fullDate} (${dayName})
        </div>
        <div style="font-size:11px;font-weight:700;color:${badgeColor};margin-top:2px;">
          ${badgeText}
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="adminToggleHoliday('${fullDate}', this.checked, ${isGeneralDay})" style="width:20px;height:20px;cursor:pointer;accent-color:#0d9488;">
      </label>
    </div>`;
  }

  container.innerHTML = html;
}

