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

// Departments & Areas Configuration
const DEPT_PR = 'PR';
const DEPT_QA = 'QA';
const DEPT_ALL = 'ALL';

const OVERALL_AREA = 'Overall';
const QA_AREA = 'Quality Assurance';

const DEFAULT_DEPARTMENTS_CONFIG = {
  PR: {
    name: "Production",
    label: "RPPF Production",
    areas: ["Solid Production", "Softgel Production", "Packing Hall", "Overall"],
    rawPath: "raw/pr/",
    dataPath: "data/"
  },
  QA: {
    name: "Quality Assurance",
    label: "RPPF QA",
    areas: ["IPQC PR", "IPQC Pack", "Documentation", "Executives", "Unassigned"],
    rawPath: "raw/qa/",
    dataPath: "data/qa/"
  }
};

let AREA_DEPARTMENTS = null;

function getDepartmentsConfig() {
  if (typeof AREA_DEPARTMENTS === 'object' && AREA_DEPARTMENTS && Object.keys(AREA_DEPARTMENTS).length > 0) {
    return AREA_DEPARTMENTS;
  }
  if (typeof window !== 'undefined' && window.AREA_DEPARTMENTS && typeof window.AREA_DEPARTMENTS === 'object') {
    return window.AREA_DEPARTMENTS;
  }
  return DEFAULT_DEPARTMENTS_CONFIG;
}

function setDepartmentsConfig(cfg) {
  if (cfg && typeof cfg === 'object') {
    AREA_DEPARTMENTS = cfg;
    if (typeof window !== 'undefined') window.AREA_DEPARTMENTS = cfg;
  }
}

function getDepartmentForArea(area) {
  if (!area) return null;
  const a = String(area).trim();
  const depts = getDepartmentsConfig();
  for (const [code, d] of Object.entries(depts)) {
    if (Array.isArray(d.areas) && d.areas.includes(a)) {
      return code;
    }
  }
  // Robust fallback for QA areas & subsections
  if (a === 'Quality Assurance' || a.startsWith('IPQC') || a === 'Documentation' || a === 'Unassigned') return DEPT_QA;
  if (a.includes('Solid') || a.includes('Softgel') || a.includes('Packing') || a === 'Overall') return DEPT_PR;
  return DEPT_PR;
}

function getDeptForArea(area) {
  return getDepartmentForArea(area);
}

function getDeptForEmployeeId(id, areaMap) {
  if (!id) return null;
  const u = String(id).toUpperCase().trim();
  const ID_ALIASES = { 'CL6515': '556515', '556515': 'CL6515', 'CL6531': '556531', '556531': 'CL6531' };
  const cleanId = ID_ALIASES[u] || u;
  const map = areaMap || (typeof AREA_MAP !== 'undefined' ? AREA_MAP : {});
  const area = map[u] || map[cleanId];
  if (!area) return null;
  return getDepartmentForArea(area);
}

function getDepartmentAreas(deptCode) {
  const depts = getDepartmentsConfig();
  const d = depts[deptCode] || depts['PR'];
  return Array.isArray(d?.areas) ? d.areas : [];
}

function getDepartmentDataPath(deptCode) {
  const depts = getDepartmentsConfig();
  const d = depts[deptCode] || depts['PR'];
  return d?.dataPath || 'data/';
}

function getDepartmentRawPath(deptCode) {
  const depts = getDepartmentsConfig();
  const d = depts[deptCode] || depts['PR'];
  return d?.rawPath || 'raw/pr/';
}

function getAllConfiguredAreas() {
  const depts = getDepartmentsConfig();
  const list = [];
  for (const d of Object.values(depts)) {
    if (Array.isArray(d.areas)) list.push(...d.areas);
  }
  // Include backward compatibility areas
  list.push('Quality Assurance', 'Solid Production', 'Softgel Production', 'Packing Hall', 'Overall');
  return [...new Set(list)];
}

const PR_AREAS = DEFAULT_DEPARTMENTS_CONFIG.PR.areas;
const QA_AREAS = DEFAULT_DEPARTMENTS_CONFIG.QA.areas;
const QA_SUBSECTIONS = ['IPQC PR', 'IPQC Pack', 'Documentation', 'Executives'];

const DEFAULT_RATE_TABLE = {
  CF:   { otRate: 38, nightRate: 300, holidayType: "hourly", holidayHours: 8, holidayFlat: 304, name: "Contractual (CF)" },
  JO:   { otRate: 40, nightRate: 400, holidayType: "flat",   holidayHours: 8, holidayFlat: 300, name: "Junior Officer (JO C–F)" },
  JO_B: { otRate: 45, nightRate: 500, holidayType: "flat",   holidayHours: 8, holidayFlat: 350, name: "Junior Officer (JO A/B)" },
  UNSPEC: { otRate: 0, nightRate: 0, holidayType: "flat", holidayHours: 0, holidayFlat: 0, noRate: true, name: "Unspecified (Hours Only / No Rate)" }
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
const ADMIN_USER_KEY = STORAGE_NAMESPACE + 'renata_admin_user_v2';
const ADMIN_SCOPE_KEY = STORAGE_NAMESPACE + 'renata_admin_scope_v2';
const CLIENT_DEPT_KEY = STORAGE_NAMESPACE + 'renata_client_dept_v1';
const ADMIN_GH_TOKEN_KEY = STORAGE_NAMESPACE + 'renata_gh_pat_v1';

// Role-based Multi-Admin Credentials (SHA-256 Hashed Passwords)
const AUTH_SALT = 'RENATA_RPPF_SECURE_SALT_2026_#$!';
const ADMIN_ACCOUNTS = {
  "pradmin": {
    hash: "a6b1cc0a9fc580c99a77a5041126061b047bf9a77842ce053b6d9ce366c5ad30",
    saltedHash: "605a7fe86f537bf67f1f46c2df8c43c1003c0cdf556af4d4f783ab310aab10fb",
    role: "pr_admin",
    scope: "PR",
    title: "Production Admin"
  },
  "qaadmin": {
    hash: "b98040b4284d882ed3234760b28b9e01e355b650bbedc97450b619872d317b41",
    saltedHash: "6280fe43813b7f17b1485c49e0a5cad47e58ae096c1a28a3f4ef19c40d15eb5e",
    role: "qa_admin",
    scope: "QA",
    title: "QA Admin"
  },
  "dev": {
    altHash: "a78f8128f2109434daf14d867c665d97a242909409b29bc0a965111d8a4a9f80", // dev1234
    adminHash: "ac9689e2272427085e35b9d3e3e8bed88cb3434828b43b86fc0596cad4c6e270", // admin1234
    hash: "b1898424d4aa6d7b94d04d87531fd05b62b828dee1bb31558219afb08ce79df5",
    saltedHash: "c0dd500f68d861e0f91b880d09163470b69607b1c4fc3a8310766cfc4cb5e9bc",
    role: "super_admin",
    scope: "ALL",
    title: "Developer / Super Admin"
  }
};
const DEFAULT_ADMIN_PASS = 'admin1234';

const OFFLINE_FALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NIGHT_REST_CREDIT_HOURS = 8;

// Firebase Realtime Database Telemetry Configuration (Free Spark Plan)
const FIREBASE_TELEMETRY_CONFIG = {
  apiKey: "AIzaSyD-RPPF-Overtime-Firebase-Telemetry",
  authDomain: "otchecker-2bfa1.firebaseapp.com",
  databaseURL: "https://otchecker-2bfa1-default-rtdb.firebaseio.com",
  projectId: "otchecker-2bfa1"
};

if (typeof window !== 'undefined') {
  window.FIREBASE_TELEMETRY_CONFIG = FIREBASE_TELEMETRY_CONFIG;
  window.DEPT_PR = DEPT_PR;
  window.DEPT_QA = DEPT_QA;
  window.DEPT_ALL = DEPT_ALL;
  window.OVERALL_AREA = OVERALL_AREA;
  window.QA_AREA = QA_AREA;
  window.PR_AREAS = PR_AREAS;
  window.QA_AREAS = QA_AREAS;
  window.QA_SUBSECTIONS = QA_SUBSECTIONS;
  window.getDeptForArea = getDeptForArea;
  window.getDeptForEmployeeId = getDeptForEmployeeId;
  window.ADMIN_ACCOUNTS = ADMIN_ACCOUNTS;
  window.ADMIN_USER_KEY = ADMIN_USER_KEY;
  window.ADMIN_SCOPE_KEY = ADMIN_SCOPE_KEY;
  window.CLIENT_DEPT_KEY = CLIENT_DEPT_KEY;
  window.AUTH_SALT = AUTH_SALT;
}
