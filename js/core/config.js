/* ==========================================================================
   CONFIG.JS - Shared Application Constants, Keys, Endpoints & Rate Defaults
   ========================================================================== */

const FALLBACK_LOGO_URI = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0052CC"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="Arial,sans-serif" font-weight="900" font-size="34">R</text></svg>'
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
  CF:   { otRate: 38, nightRate: 300, holidayType: "hourly", holidayHours: 8, holidayFlat: 304, name: "৳৩৮/ঘণ্টা প্যাকেজ (Contractual / CF)" },
  JO:   { otRate: 40, nightRate: 400, holidayType: "flat",   holidayHours: 8, holidayFlat: 300, name: "৳৪০/ঘণ্টা প্যাকেজ (JO C–F)" },
  JO_B: { otRate: 45, nightRate: 500, holidayType: "flat",   holidayHours: 8, holidayFlat: 350, name: "৳৪৫/ঘণ্টা প্যাকেজ (JO A/B)" },
  UNSPEC: { otRate: 0, nightRate: 0, holidayType: "flat", holidayHours: 0, holidayFlat: 0, noRate: true, name: "Unspecified (রেটবিহীন / ঘণ্টা হিসাব)" }
};

function isNoRateCat(c) {
  return Boolean(c && (typeof RATE_TABLE !== 'undefined' ? RATE_TABLE[c] : DEFAULT_RATE_TABLE[c])?.noRate);
}

const DEFAULT_FALLBACK_AREAS = {
  "CF8355": "Solid Production"
};

const DEFAULT_FALLBACK_NOTICES = [
  {
    id: "n001",
    title: "Monthly overtime report and auto calculator",
    body: "View the monthly overtime report with your ID. Tell the ERP team if you have any problem with your attendance.",
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

// Storage Keys
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
const THEME_KEY = STORAGE_NAMESPACE + 'renata_theme_v1';
const APP_LANG_KEY = STORAGE_NAMESPACE + 'renata_app_lang_v1';
const APP_MODE_KEY = STORAGE_NAMESPACE + 'renata_app_mode_v2';
const INCHARGE_ROLE_KEY = STORAGE_NAMESPACE + 'renata_incharge_role_v1';
const INCHARGE_AREA_KEY = STORAGE_NAMESPACE + 'renata_incharge_area_v1';
const ABSENT_CACHE_KEY = STORAGE_NAMESPACE + 'renata_absent_data_v1';
const ADMIN_PASS_KEY = STORAGE_NAMESPACE + 'renata_admin_pass_v1';
const ADMIN_SESSION_KEY = STORAGE_NAMESPACE + 'renata_admin_logged_in_v1';
const ADMIN_GH_TOKEN_KEY = STORAGE_NAMESPACE + 'renata_gh_pat_v1';


const OFFLINE_FALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NIGHT_REST_CREDIT_HOURS = 8;
