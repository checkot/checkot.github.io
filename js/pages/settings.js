/* ==========================================================================
   SETTINGS.JS - User Preferences, Saved Permanent ID & Area Mapping Setup
   ========================================================================== */

function updateSettingsAreaCount() {
  const el = document.getElementById('settingsAreaCount');
  if (el) el.textContent = 'Active';
}

function savePermanentIdFromSettings() {
  const inp = document.getElementById('settingsNewIdInput');
  const raw = String(inp ? inp.value : '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) {
    if (typeof showToast === 'function') showToast('Enter an ID number', 'warn');
    inp?.focus();
    return;
  }
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
