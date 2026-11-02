/* ==========================================================================
   HISTORY.JS - Search History Rendering & Replay Controller
   ========================================================================== */

function renderHistory() {
  const list = typeof getHistory === 'function' ? getHistory() : [];
  const box = document.getElementById('historyList');
  if (!box) return;
  if (list.length === 0) {
    box.innerHTML = '<div class="empty-msg">Nothing viewed yet. First enter your ID on the "Report" page.</div>';
    return;
  }
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
  const [year, mon] = String(month || '').split('-');
  const ySel = document.getElementById('yearSelect');
  const mSel = document.getElementById('monthSelect');
  if (ySel && year) ySel.value = year;
  if (mSel && mon) mSel.value = mon;
  const empInput = document.getElementById('employeeId');
  if (empInput && id) empInput.value = id;
  if (typeof toggleClearIdBtn === 'function') toggleClearIdBtn();
  if (typeof switchPage === 'function') switchPage('search');
  setTimeout(() => {
    if (typeof findReport === 'function') findReport();
  }, 200);
}

function clearHistory() {
  try {
    if (typeof HISTORY_KEY !== 'undefined') localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    if (typeof renderRecentSearchChips === 'function') renderRecentSearchChips();
    if (typeof showToast === 'function') showToast('History cleared', 'success');
  } catch (e) {}
}
