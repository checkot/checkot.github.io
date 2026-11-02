/* ==========================================================================
   STORAGE.JS - LocalStorage Safe Handlers & Data Isolation
   ========================================================================== */

function getPreferredId() {
  try { return localStorage.getItem(PREFERRED_ID_KEY) || ""; } catch (e) { return ""; }
}

function setPreferredId(id) {
  try {
    if (id) localStorage.setItem(PREFERRED_ID_KEY, String(id).toUpperCase().trim());
    else localStorage.removeItem(PREFERRED_ID_KEY);
  } catch (e) {}
}

// Business Rule: Salary entered in Payslip Estimator stays ONLY in localStorage (renata_salary_v1)
function getSavedSalary() {
  try { return localStorage.getItem(SALARY_KEY) || ""; } catch (e) { return ""; }
}

function saveSalary(salary) {
  try {
    if (salary != null && String(salary).trim() !== "") {
      localStorage.setItem(SALARY_KEY, String(salary).trim());
    } else {
      localStorage.removeItem(SALARY_KEY);
    }
  } catch (e) {}
}

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveHistory(historyList) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList.slice(0, HISTORY_MAX)));
  } catch (e) {}
}

function pushSearchHistory(id) {
  if (!id) return;
  const cleanId = String(id).toUpperCase().trim();
  const list = getHistory().filter(x => x !== cleanId);
  list.unshift(cleanId);
  saveHistory(list);
}

function clearSearchHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
}

function getCompareCache(month, id1, id2) {
  try {
    const key = COMPARE_CACHE_PREFIX + month + "_" + id1 + "_" + id2;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.time > COMPARE_TTL_MS) return null;
    return obj.data;
  } catch (e) { return null; }
}

function setCompareCache(month, id1, id2, data) {
  try {
    const key = COMPARE_CACHE_PREFIX + month + "_" + id1 + "_" + id2;
    localStorage.setItem(key, JSON.stringify({ time: Date.now(), data }));
  } catch (e) {}
}
