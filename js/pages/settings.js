/* ==========================================================================
   SETTINGS.JS - User Preferences, Saved Permanent ID & Area Mapping Setup
   ========================================================================== */

function updateSettingsAreaCount() {
  const el = document.getElementById('settingsAreaCount');
  if (el) el.textContent = 'Active';
  if (typeof refreshAppVersionDisplay === 'function') refreshAppVersionDisplay();
}

function savePermanentIdFromSettings() {
  const inp = document.getElementById('settingsNewIdInput');
  const raw = String(inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) {
    if (typeof showToast === 'function') showToast('Enter an ID number', 'warn');
    inp?.focus();
    return;
  }
  if (window.RppfIdGuard && RppfIdGuard.blocksSave(raw, inp)) return;
  const spec = typeof getSpecialRoleSpec === 'function' ? getSpecialRoleSpec(raw) : null;
  if (spec) {
    if (inp) inp.value = '';
    if (typeof openModeSetupModal === 'function') openModeSetupModal();
    const regInp = document.getElementById('regEmpIdInput');
    if (regInp) {
      regInp.value = raw;
      if (typeof onRegEmpIdInputChange === 'function') onRegEmpIdInputChange();
      setTimeout(() => document.getElementById('specialRolePassInput')?.focus(), 120);
    }
    return;
  }
  if (typeof setAdminLoggedIn === 'function') setAdminLoggedIn(false);
  if (typeof setPreferredId === 'function') setPreferredId(raw);
  if (typeof setAppMode === 'function') setAppMode('employee');
  if (inp) inp.value = '';
  if (typeof updateModeUI === 'function') updateModeUI();
  if (typeof showToast === 'function') showToast(`Saved ID "${raw}"`, 'success');
  const empInput = document.getElementById('employeeId');
  if (empInput) {
    empInput.value = raw;
    if (typeof toggleClearIdBtn === 'function') toggleClearIdBtn();
  }
}

function deletePermanentIdFromSettings() {
  if (typeof setAdminLoggedIn === 'function') setAdminLoggedIn(false);
  if (typeof window !== 'undefined') {
    window._memInchargeRole = null;
    window._memInchargeArea = null;
  }
  const oldId = typeof getPreferredId === 'function' ? getPreferredId() : null;
  if (typeof setPreferredId === 'function') setPreferredId(null);
  if (typeof updateModeUI === 'function') updateModeUI();
  if (typeof resetAll === 'function') resetAll();
  if (typeof showToast === 'function') {
    showToast(oldId ? `Permanent ID (${oldId}) has been deleted.` : 'Permanent ID has been reset.', 'info');
  }
  if (typeof openModeSetupModal === 'function') openModeSetupModal('employee');
  if (typeof syncPrivilegedUI === 'function') syncPrivilegedUI();
}

const APP_BASE_VERSION = 'v3.3';
const DEPLOY_INFO_CACHE_KEY = 'rppf_last_deploy_info_v1';

function _formatDeployBuildLabel(info) {
  if (!info || !info.deployedAt) return APP_BASE_VERSION + '.0';
  const dt = new Date(info.deployedAt);
  if (isNaN(dt.getTime())) return APP_BASE_VERSION + '.0';
  try {
    const dPart = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Dhaka' });
    const tPart = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' });
    return APP_BASE_VERSION + ' \u2022 ' + dPart + ', ' + tPart;
  } catch (e) {
    return APP_BASE_VERSION + ' \u2022 ' + String(info.deployedAt).slice(0, 10);
  }
}

function _applyDeployInfoToUi(info) {
  const el = document.getElementById('settingsAppVersionVal');
  if (!el || !info) return;
  el.textContent = _formatDeployBuildLabel(info);
  const sha = info.uploadSha ? String(info.uploadSha).slice(0, 7) : (info.id || '');
  el.title = 'Build ' + sha + (info.zip ? ' (' + info.zip + ')' : '');
}

let _lastVerFetchMs = 0;
async function refreshAppVersionDisplay(force) {
  try {
    const cached = localStorage.getItem(DEPLOY_INFO_CACHE_KEY);
    if (cached) _applyDeployInfoToUi(JSON.parse(cached));
  } catch (e) {}
  const now = Date.now();
  if (!force && now - _lastVerFetchMs < 30000) return;
  _lastVerFetchMs = now;
  try {
    const res = await fetch('./deploy-info.json?t=' + now, { cache: 'no-store' });
    if (!res.ok) return;
    const info = await res.json();
    if (info && info.deployedAt) {
      _applyDeployInfoToUi(info);
      try { localStorage.setItem(DEPLOY_INFO_CACHE_KEY, JSON.stringify(info)); } catch (e) {}
    }
  } catch (e) {}
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => refreshAppVersionDisplay(false));
  } else {
    setTimeout(() => refreshAppVersionDisplay(false), 0);
  }
}
