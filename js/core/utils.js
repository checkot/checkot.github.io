/* ==========================================================================
   UTILS.JS - Timezone-Safe Date Formatting (Asia/Dhaka), Numbers & Helpers
   ========================================================================== */

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function desigKey(d) {
  return String(d || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

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
    const raw = localStorage.getItem(typeof ID_ALIAS_KEY !== 'undefined' ? ID_ALIAS_KEY : 'rppf_id_alias_v1');
    if (raw) {
      const a = JSON.parse(raw);
      let n = 0;
      while (a && a[x] && n++ < 5) x = String(a[x]).trim().toUpperCase();
    }
  } catch (e) {}
  return x;
}

// Timezone-safe notice date formatting (parses YYYY-MM-DD cleanly without UTC rollback)
function formatNoticeDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (parts) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = parseInt(parts[3], 10);
    const m = months[parseInt(parts[2], 10) - 1] || parts[2];
    const y = parts[1];
    return `${String(d).padStart(2, '0')} ${m} ${y}`;
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return String(dateStr || '');
  }
}

const fmtTime = (t) => String(t || '').replace(/^(\d{2}:\d{2}):\d{2}$/, '$1');
const setT = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = String(t); };

function cleanPunchValue(val) {
  return String(val == null ? '' : val)
    .replace(/['"“”]/g, '')
    .trim();
}

function isPunchMissing(val) {
  const cleaned = cleanPunchValue(val).toUpperCase();
  if (!cleaned) return true;
  if (cleaned === '-' || cleaned === '--' || cleaned === 'N/A' || cleaned === 'NA' || cleaned === 'NULL' || cleaned === 'NONE' || cleaned === 'MISSING') return true;
  if (/^0{1,2}:00(:00)?$/.test(cleaned)) return true;
  if (!/^\d{1,2}:\d{2}(:\d{2})?([AP]M)?$/i.test(cleaned)) return true;
  return false;
}

window.cleanPunchValue = cleanPunchValue;
window.isPunchMissing = isPunchMissing;

/* ==========================================================================
   OT-DAY RULES (used by ranking + comparison)
   - OT Day      : a day with OT hours > 0 that is NOT a night-duty day.
                   (Night duty days are counted only as Nights, even if they carry fixed OT.)
   - Holiday Duty: any day with Day-Off / Holiday duty or OT (same as holidayCount).
   - A holiday day with OT counts BOTH as an OT Day and as a Holiday Duty day.
   ========================================================================== */
function isNightDailyRow(r) {
  if (!Array.isArray(r)) return false;
  // Night = Empress Night column YES only (stored in r[10]). Shift code never declares a night.
  return Number(r[10]) === 1;
}
function computeOtDaysFromDaily(daily) {
  let n = 0;
  (Array.isArray(daily) ? daily : []).forEach(r => {
    if (!Array.isArray(r)) return;
    const ot = (Number(r[5]) || 0) + (Number(r[7]) || 0) + (Number(r[9]) || 0);
    if (ot > 0 && !isNightDailyRow(r)) n++;
  });
  return n;
}
function getEmpOtDays(e) {
  if (!e) return 0;
  if (typeof e.otDaysCount === 'number' && isFinite(e.otDaysCount)) return e.otDaysCount;
  if (Array.isArray(e.daily) && e.daily.length > 0) {
    const n = computeOtDaysFromDaily(e.daily);
    try { e.otDaysCount = n; } catch (err) {}
    return n;
  }
  return 0;
}
if (typeof window !== 'undefined') { window.computeOtDaysFromDaily = computeOtDaysFromDaily; window.getEmpOtDays = getEmpOtDays; window.isNightDailyRow = isNightDailyRow; }

/* ==========================================================================
   LEGACY EMPLOYEE REPAIR & METADATA HELPERS
   ========================================================================== */
var LEGACY_DESIG_TAIL = /\s+((?:Junior\s+Officer\s+[A-F])|Helper|Casual|(?:Senior\s+)?(?:Deputy\s+|Assistant\s+|Additional\s+|Senior\s+Deputy\s+)?Manager\b.*|(?:Senior\s+)?Officer(?:\s+[A-F])?|Un-?Skilled\s+Worker(?:\s+[IVX]+)?|Skilled\s+Worker(?:\s+[IVX]+)?|Head\s+of\b.*|In-?Charge\b.*|Executive\b.*)$/i;

function repairLegacyEmployee(e) {
  if (!e || !/^(production|production department)$/i.test(String(e.grade || '').trim())) return;
  const nm = String(e.name || '');
  const m = nm.match(LEGACY_DESIG_TAIL);
  if (m) { e.grade = m[1].trim(); e.name = nm.slice(0, m.index).trim(); }
}

function getAutoEmpType(id) {
  const u = String(id || '').toUpperCase().trim();
  if (/^CF\d+/i.test(u) || /^\d{5,8}$/.test(u)) return 'CON';
  if (/^RF\d+/i.test(u)) return 'JO';
  return '';
}

function getEmpMeta(id) {
  const u = String(id || '').toUpperCase().trim();
  const d = (typeof AREA_DETAILS !== 'undefined' && AREA_DETAILS && AREA_DETAILS[u]) || {};
  const cats = Array.isArray(d.c) ? d.c.filter(Boolean) : (typeof d.c === 'string' && d.c ? d.c.split(',').map(x => x.trim()).filter(Boolean) : []);
  return { gender: d.g || '', type: d.t || getAutoEmpType(u), sub: d.s || '', cats };
}

if (typeof window !== 'undefined') {
  window.repairLegacyEmployee = repairLegacyEmployee;
  window.getAutoEmpType = getAutoEmpType;
  window.getEmpMeta = getEmpMeta;
}

/* ==========================================================================
   ONE-LINE AUTO-SHRINK TYPOGRAPHY (SPEC V2)
   ========================================================================== */
function fitText(el) {
  if (!el || !el.dataset || !el.dataset.fit) return;
  const parts = el.dataset.fit.split(',').map(Number);
  const max = parts[0];
  const min = parts[1];
  if (!max || !min) return;
  let s = max;
  el.style.fontSize = s + 'px';
  while (el.scrollWidth > el.clientWidth && s > min) {
    s -= 0.5;
    el.style.fontSize = s + 'px';
  }
}

function fitIdBlock() {
  document.querySelectorAll('.idblock').forEach(block => {
    const top = block.querySelector('.idblock-top');
    const idEl = block.querySelector('.idblock-id');
    if (!top || !idEl) return;
    const topW = top.offsetWidth;
    if (!topW) return;
    idEl.style.letterSpacing = 'normal';
    const text = (idEl.textContent || '').trim();
    const len = text.length;
    if (len <= 1) return;
    const idW = idEl.offsetWidth;
    const diff = topW - idW;
    if (diff > 0) {
      const extra = diff / (len - 1);
      idEl.style.letterSpacing = extra.toFixed(1) + 'px';
    } else {
      idEl.style.letterSpacing = '0.04em';
    }
  });
}

function fitAll() {
  document.querySelectorAll('[data-fit]').forEach(fitText);
  fitIdBlock();
}

if (typeof window !== 'undefined') {
  window.fitText = fitText;
  window.fitIdBlock = fitIdBlock;
  window.fitAll = fitAll;
  window.addEventListener('resize', fitAll);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitAll);
  }
}
