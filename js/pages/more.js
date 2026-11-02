/* ==========================================================================
   MORE.JS - More Menu Drawer Navigation & Options Controller
   ========================================================================== */

function renderMorePage() {
  const modeText = document.getElementById('moreModeSummaryText');
  if (modeText) {
    const curMode = typeof getAppMode === 'function' ? getAppMode() : 'employee';
    const myId = typeof getPreferredId === 'function' ? getPreferredId() : '';
    if (curMode === 'incharge') {
      const role = typeof getInchargeRoleLabel === 'function' ? getInchargeRoleLabel() : 'In-Charge';
      modeText.textContent = `${role} Mode active`;
    } else {
      modeText.textContent = myId ? `Saved ID: ${myId}` : 'Set or change your ID number';
    }
  }
}
