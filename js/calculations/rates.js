/* ==========================================================================
   RATES.JS - Overtime, Night & Holiday Allowance Calculation Engine
   ========================================================================== */

function getDefaultRateCat(e) {
  const kind = deriveEmpKind(e);
  if (kind === 'CAS') return 'CF';
  if (kind === 'EXEC') return 'UNSPEC';
  
  // 1. If already explicitly set to a valid rate category in pre-indexed data (e.g. JO_B)
  if (e.category && typeof RATE_TABLE !== 'undefined' && RATE_TABLE[e.category] && !RATE_TABLE[e.category].noRate) {
    return e.category;
  }
  
  // 2. Use detectCategory from grade/id if available
  if (typeof detectCategory === 'function') {
    const d = detectCategory(e.grade || '', e.id);
    if (d && d.valid && d.category && typeof RATE_TABLE !== 'undefined' && RATE_TABLE[d.category] && !RATE_TABLE[d.category].noRate) {
      return d.category;
    }
  }
  
  // 3. Direct regex check for Junior Officer A / B or JO_B
  const g = String(e.grade || '').toUpperCase().trim();
  if (/JUNIOR\s+OFFICER\s+[AB]\b/i.test(g) || /\bM(16|17)\b/.test(g) || g === 'JO_B' || g === 'JO B' || g === 'JO-B') {
    return 'JO_B';
  }
  
  const u = String(e.id || '').toUpperCase();
  if (u.startsWith('CF')) return 'CF';
  if (u.startsWith('RF')) return 'JO';
  return 'JO';
}

function getRateCategory(e) {
  if (typeof DESIG_RATES !== 'undefined' && DESIG_RATES && typeof desigKey === 'function') {
    const o = DESIG_RATES[desigKey(e.grade)];
    if (o && typeof RATE_TABLE !== 'undefined' && RATE_TABLE[o]) return { cat: o, src: 'admin' };
  }
  return { cat: getDefaultRateCat(e), src: '' };
}

function deriveEmpKind(e) {
  if (e.kind) return e.kind;
  const id = String(e.id || '').toUpperCase();
  if (/^\d{5,8}$/.test(id) || /^CASUAL/i.test(e.grade || '')) return 'CAS';
  if (/^RF/.test(id)) {
    if (typeof detectCategory === 'function') {
      try {
        if (!detectCategory(e.grade || '', id).valid) return 'EXEC';
      } catch (err) {}
    } else {
      const g = String(e.grade || '').toUpperCase().trim();
      if (!/JUNIOR\s+OFFICER/i.test(g) && /\b(EXECUTIVE|SENIOR\s+OFFICER|MANAGER)\b/i.test(g)) return 'EXEC';
    }
  }
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
  const r = RATE_TABLE[rc.cat] || RATE_TABLE.JO;
  const ot = Number(e.otHours) || 0, hc = Number(e.holidayCount) || 0, nc = Number(e.nightCount) || 0;
  e.category = rc.cat; e.valid = true; e.rateSource = rc.src;
  e.otAmount = Number((ot * r.otRate).toFixed(2));
  e.holidayAmount = Number((r.holidayType === 'hourly' ? hc * r.holidayHours * r.otRate : hc * r.holidayFlat).toFixed(2));
  e.nightAmount = Number((nc * r.nightRate).toFixed(2));
  e.totalEarned = Number((e.otAmount + e.holidayAmount + e.nightAmount).toFixed(2));
  return e;
}

function calculateEarnings(cat, otHours, holiday, night) {
  const r = RATE_TABLE[cat] || RATE_TABLE.JO;
  const otAmount = otHours * r.otRate;
  const holidayAmount = r.holidayType === 'hourly'
    ? (holiday * (r.holidayHours || 8) * r.otRate)
    : (holiday * (r.holidayFlat || 300));
  const nightAmount = night * r.nightRate;
  const total = otAmount + holidayAmount + nightAmount;
  return { otAmount, holidayAmount, nightAmount, total };
}

function recalculate() {
const cat = document.getElementById('inpCategory').value;
const otHours = parseFloat(document.getElementById('inpOtHours').value) || 0;
const holiday = parseInt(document.getElementById('inpHoliday').value) || 0;
const night = parseInt(document.getElementById('inpNight').value) || 0;
const r = (RATE_TABLE && RATE_TABLE[cat]) || (RATE_TABLE && RATE_TABLE['CF']) || { otRate: 0, nightRate: 0, holidayType: 'flat', holidayHours: 0, holidayFlat: 0, name: 'Unspecified' };
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
