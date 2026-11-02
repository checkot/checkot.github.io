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
