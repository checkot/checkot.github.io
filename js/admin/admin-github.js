/* ==========================================================================
   ADMIN-GITHUB.JS - Base GitHub API & Token Operations for RPPF Admin Panel
   ========================================================================== */

function getGhToken() { try { return (localStorage.getItem(ADMIN_GH_TOKEN_KEY) || '').trim(); } catch (e) { return ''; } }
function setGhToken(t) {
try { if (t) localStorage.setItem(ADMIN_GH_TOKEN_KEY, t.trim()); else localStorage.removeItem(ADMIN_GH_TOKEN_KEY); } catch (e) {}
}

async function fetchJsonResource(filename) {
const urls = [];
if (location.protocol === 'http:' || location.protocol === 'https:') urls.push(new URL(filename, location.href).href);
const remoteUrl = REMOTE_BASE_URL + filename;
if (!urls.includes(remoteUrl)) urls.push(remoteUrl);
let lastErr = null;
for (const u of urls) {
try { const resp = await fetch(u, { cache: 'no-store' }); if (resp.ok) return await resp.json(); }
catch (e) { lastErr = e; }
}
throw lastErr || new Error('Failed to load ' + filename);
}

function utf8ToBase64(str) {
const bytes = new TextEncoder().encode(str);
let binary = '';
for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
return btoa(binary);
}
function arrayBufferToBase64(buffer) {
const bytes = new Uint8Array(buffer);
let binary = '';
const chunk = 0x8000;
for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
return btoa(binary);
}
async function githubGetSha(repoPath, headers) {
const base = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/`;
try { const r = await fetch(base + repoPath, { headers, cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j && j.sha) return j.sha; } } catch (e) {}
// Files over 1 MB cannot be read directly through this API, but the folder listing still gives their sha
try {
const i = repoPath.lastIndexOf('/'), dir = i >= 0 ? repoPath.slice(0, i) : '', name = repoPath.slice(i + 1);
const r = await fetch(base + dir, { headers, cache: 'no-store' });
if (r.ok) { const list = await r.json(); const f = Array.isArray(list) && list.find(x => x.name === name); if (f && f.sha) return f.sha; }
} catch (e) {}
return null;
}
async function githubPutFile(repoPath, base64Content, commitMessage) {
const token = getGhToken();
if (!token) { switchAdminTab('setup'); throw new Error('First go to the "Server setup" tab and save your Server Access Key there.'); }
const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${repoPath}`;
const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
const sha = await githubGetSha(repoPath, headers);
const bodyObj = { message: commitMessage || `Update ${repoPath} via RPPF Admin Panel`, content: base64Content };
if (sha) bodyObj.sha = sha;
const putResp = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(bodyObj) });
if (!putResp.ok) {
let errTxt = `HTTP ${putResp.status}`;
try { const errJson = await putResp.json(); if (errJson && errJson.message) errTxt = errJson.message; } catch (e) {}
throw new Error(errTxt);
}
return await putResp.json();
}
async function githubDeleteFile(repoPath, sha, commitMessage) {
const token = getGhToken();
if (!token) { switchAdminTab('setup'); throw new Error('First go to the "Server setup" tab and save your Server Access Key there.'); }
const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${repoPath}`;
const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
let fileSha = sha;
if (!fileSha) fileSha = await githubGetSha(repoPath, headers);
if (!fileSha) throw new Error('File reference was not found on the server.');
const delResp = await fetch(apiUrl, {
method: 'DELETE',
headers,
body: JSON.stringify({
message: commitMessage || `Delete ${repoPath} via RPPF Admin Panel`,
sha: fileSha
})
});
if (!delResp.ok) {
let errTxt = `HTTP ${delResp.status}`;
try { const errJson = await delResp.json(); if (errJson && errJson.message) errTxt = errJson.message; } catch (e) {}
throw new Error(errTxt);
}
return await delResp.json();
}
async function adminPushAreasToGithub() {
const btn = document.getElementById('adminPushAreasBtn');
const statusEl = document.getElementById('adminAreaPushStatus');
if (btn) btn.disabled = true;
if (statusEl) { statusEl.style.color = 'var(--brand-text)'; statusEl.textContent = 'Saving areas.json to RPPF Cloud Server...'; }
try {
const _x = await window.adminFreshAreasExtras(); // latest holidays + departments read from the repo right now
const jsonStr = JSON.stringify({ departments: _x.departments, areas: AREA_MAP, details: AREA_DETAILS, subsections: AREA_SUBS, designationRates: DESIG_RATES, rateTable: RATE_TABLE, holidays: _x.holidays }, null, 2);
await githubPutFile('areas.json', utf8ToBase64(jsonStr), `Update areas.json via RPPF Admin Panel`);
try { if (typeof adminAdoptHolidays === 'function') adminAdoptHolidays(_x.holidays); } catch (e) {}
try { Object.keys(localStorage).forEach(k => { const _ns = (typeof STORAGE_NAMESPACE !== 'undefined' ? STORAGE_NAMESPACE : ''); if (k.startsWith(_ns + 'renata_lb_') || k.startsWith(_ns + 'renata_mdata_')) localStorage.removeItem(k); }); } catch (e) {}
if (statusEl) { statusEl.style.color = 'var(--success)'; statusEl.textContent = 'areas.json was successfully updated on the RPPF Cloud Server. Holidays now on server: ' + ((_x.holidays.custom || []).join(', ') || 'none') + (((_x.holidays.cancelled || []).length) ? ' | cancelled: ' + _x.holidays.cancelled.join(', ') : ''); }
showToast('areas.json was successfully saved to the server', 'success');
} catch (err) {
if (statusEl) { statusEl.style.color = 'var(--danger)'; statusEl.textContent = `Problem: ${err.message}`; }
showToast(err.message, 'error');
} finally { if (btn) btn.disabled = false; }
}

async function adminSaveAndTestGhToken() {
const inp = document.getElementById('adminGhTokenInput');
const resEl = document.getElementById('adminGhTokenTestResult');
const statusTxt = document.getElementById('adminTokenStatusText');
const raw = (inp?.value || '').trim();
if (!raw) { showToast('Paste the Server Access Key', 'warn'); return; }
setGhToken(raw);
if (resEl) { resEl.style.color = 'var(--brand-text)'; resEl.textContent = 'Checking RPPF Cloud Server connection...'; }
try {
const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}`;
const resp = await fetch(apiUrl, { headers: { 'Authorization': `token ${raw}`, 'Accept': 'application/vnd.github.v3+json' }, cache: 'no-store' });
if (!resp.ok) throw new Error(`HTTP ${resp.status} - Server Access Key is incorrect or has expired`);
const repoInfo = await resp.json();
const canPush = repoInfo?.permissions?.push;
if (!canPush) throw new Error('This Server Access Key does not have Write permission.');
if (resEl) { resEl.style.color = 'var(--success)'; resEl.textContent = `Connection successful! (RPPF Cloud Server - Write Access Active)`; }
if (statusTxt) statusTxt.innerHTML = 'RPPF Cloud Server is connected - files and IDs can now be uploaded directly.';
showToast('RPPF Cloud Server connection is active', 'success');
} catch (err) {
if (resEl) { resEl.style.color = 'var(--danger)'; resEl.textContent = `Problem: ${err.message}`; }
showToast(err.message, 'error');
}
}
function adminClearGhToken() {
setGhToken('');
const inp = document.getElementById('adminGhTokenInput');
const resEl = document.getElementById('adminGhTokenTestResult');
if (inp) inp.value = '';
if (resEl) resEl.textContent = 'Server Access Key was removed.';
initAdminPage();
showToast('Server Access Key removed', 'info');
}

const _rppfAdminBroadcast = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('rppf_admin_sync') : null;
function broadcastAdminChange(targetPath) {
  try {
    localStorage.setItem(typeof LAST_ADMIN_SYNC_KEY !== 'undefined' ? LAST_ADMIN_SYNC_KEY : 'rppf_last_admin_sync_ts', String(Date.now()));
    if (_rppfAdminBroadcast) _rppfAdminBroadcast.postMessage({ path: targetPath || 'all', ts: Date.now() });
  } catch (e) {}
}
const _baseGhPut = githubPutFile;
githubPutFile = async function(repoPath, base64Content, commitMessage) {
  const res = await _baseGhPut(repoPath, base64Content, commitMessage);
  broadcastAdminChange(repoPath);
  return res;
};
const _baseGhDel = githubDeleteFile;
githubDeleteFile = async function(repoPath, sha, commitMessage) {
  const res = await _baseGhDel(repoPath, sha, commitMessage);
  broadcastAdminChange(repoPath);
  return res;
};


async function adminHandleZipUpload(files) {
  // Site deploy is restricted to the 'dev' super admin (UI is hidden for others; this is the real guard).
  const _adm = (typeof getAdminUser === 'function') ? String(getAdminUser() || '').toLowerCase() : '';
  if (_adm !== 'dev') {
    if (typeof showToast === 'function') showToast('Site deploy is available to the dev login only', 'warn');
    const _inp = document.getElementById('adminZipFileInput'); if (_inp) _inp.value = '';
    return;
  }
  if (!files || !files.length) return;
  const statusEl = document.getElementById('adminZipUploadStatus');
  if (!getGhToken()) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.background = 'var(--danger-bg)';
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = 'Please enter and save your Server Access Key first in the box above.';
    }
    if (typeof showToast === 'function') showToast('Save Server Access Key first', 'warn');
    return;
  }
  if (statusEl) statusEl.style.display = 'none';
  // Files are now QUEUED (js/admin/admin-deploy.js); each one is uploaded only after the previous deploy is LIVE.
  if (window.RppfDeployUI) window.RppfDeployUI.addFiles(files);
  else if (typeof showToast === 'function') showToast('Deploy tracker did not load - refresh the page', 'error');
  const inputEl = document.getElementById('adminZipFileInput');
  if (inputEl) setTimeout(function () { inputEl.value = ''; }, 0);
}

window.adminHandleZipUpload = adminHandleZipUpload;


/* ==========================================================================
   EMPRESS AUTO-COLLECT WORKFLOW DISPATCH (PR DEPARTMENT ONLY)
   Triggers empress-daily-fetch.yml (This Month) or empress-prev-month-fetch.yml (Previous Month)
   ========================================================================== */
let _admEmpressPollTimer = null;

function syncAdminEmpressCardVisibility(dept) {
  const card = document.getElementById('admEmpressFetchCard');
  if (!card) return;
  const d = String(dept || document.getElementById('adminExcelDeptSelect')?.value || 'PR').toUpperCase();
  card.style.display = (d === 'QA') ? 'none' : '';
}
window.syncAdminEmpressCardVisibility = syncAdminEmpressCardVisibility;

function _setEmpressStatusHtml(html, color) {
  const el = document.getElementById('admEmpressFetchStatus');
  if (!el) return;
  el.style.color = color || 'var(--muted)';
  el.innerHTML = html || '';
}

async function adminTriggerEmpressWorkflow(mode) {
  const activeDept = String(document.getElementById('adminExcelDeptSelect')?.value || 'PR').toUpperCase();
  if (activeDept === 'QA') {
    if (typeof showToast === 'function') showToast('Empress auto-collect is only available for Production (PR) department.', 'warn');
    return;
  }

  const token = getGhToken();
  if (!token) {
    if (typeof switchAdminTab === 'function') switchAdminTab('setup');
    const msg = 'First go to "Server & Deploy" and save your Server Access Key (with workflow permission).';
    _setEmpressStatusHtml(msg, 'var(--danger)');
    if (typeof showToast === 'function') showToast(msg, 'warn');
    return;
  }

  const isPrev = mode === 'previous';
  const wfFile = isPrev ? 'empress-prev-month-fetch.yml' : 'empress-daily-fetch.yml';
  const label = isPrev ? 'Previous Month (PR)' : 'This Month (PR)';
  const btnCurr = document.getElementById('admTriggerCurrMonthBtn');
  const btnPrev = document.getElementById('admTriggerPrevMonthBtn');
  if (btnCurr) btnCurr.disabled = true;
  if (btnPrev) btnPrev.disabled = true;

  _setEmpressStatusHtml(`Triggering <strong>${label}</strong> workflow on GitHub Actions...`, 'var(--brand-text)');

  try {
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/actions/workflows/${wfFile}/dispatches`;
    const bodyObj = isPrev
      ? { ref: 'main', inputs: { force: 'true' } }
      : { ref: 'main' };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyObj)
    });

    if (!resp.ok) {
      let errTxt = `HTTP ${resp.status}`;
      try {
        const j = await resp.json();
        if (j && j.message) errTxt += ` — ${j.message}`;
      } catch (e) {}
      if (resp.status === 403 || resp.status === 401) {
        errTxt += ' (Ensure your GitHub token has both "repo" and "workflow" permissions.)';
      } else if (resp.status === 404) {
        errTxt += ` (Check that .github/workflows/${wfFile} exists on main branch.)`;
      }
      throw new Error(errTxt);
    }

    if (typeof showToast === 'function') showToast(`${label} fetch triggered!`, 'success');
    _setEmpressStatusHtml(`✓ <strong>${label}</strong> triggered! Waiting for GitHub Actions runner to start...`, 'var(--brand-text)');
    adminPollEmpressRun(wfFile, label, 0);
  } catch (err) {
    _setEmpressStatusHtml(`✕ Failed: ${err.message}`, 'var(--danger)');
    if (typeof showToast === 'function') showToast(err.message, 'error');
  } finally {
    if (btnCurr) btnCurr.disabled = false;
    if (btnPrev) btnPrev.disabled = false;
  }
}
window.adminTriggerEmpressWorkflow = adminTriggerEmpressWorkflow;

async function adminPollEmpressRun(wfFile, label, attempt) {
  if (_admEmpressPollTimer) { clearTimeout(_admEmpressPollTimer); _admEmpressPollTimer = null; }
  const token = getGhToken();
  if (!token) return;

  try {
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/actions/workflows/${wfFile}/runs?per_page=1`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' },
      cache: 'no-store'
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const run = Array.isArray(data?.workflow_runs) ? data.workflow_runs[0] : null;
    if (run) {
      const st = String(run.status || '').toLowerCase();
      const concl = String(run.conclusion || '').toLowerCase();
      const link = run.html_url ? ` <a href="${run.html_url}" target="_blank" rel="noopener" style="color:var(--brand-text);text-decoration:underline;">View run ↗</a>` : '';
      if (st === 'completed') {
        if (concl === 'success') {
          _setEmpressStatusHtml(`✓ <strong>${label}</strong> completed successfully!${link}`, 'var(--success)');
          if (typeof showToast === 'function') showToast(`${label} data updated!`, 'success');
          if (typeof adminCheckMonthData === 'function') adminCheckMonthData();
        } else {
          _setEmpressStatusHtml(`✕ <strong>${label}</strong> finished with status: <strong>${concl || 'failed'}</strong>.${link}`, 'var(--danger)');
        }
        return;
      }
      _setEmpressStatusHtml(`⏳ <strong>${label}</strong> is <strong>${st.replace('_', ' ')}</strong>...${link}`, 'var(--brand-text)');
    }
  } catch (e) {}

  if (attempt < 35) {
    _admEmpressPollTimer = setTimeout(() => adminPollEmpressRun(wfFile, label, attempt + 1), 8000);
  }
}

async function adminCheckEmpressStatus() {
  const token = getGhToken();
  if (!token) {
    _setEmpressStatusHtml('Save your Server Access Key in "Server & Deploy" first to check status.', 'var(--muted)');
    return;
  }
  _setEmpressStatusHtml('Checking latest PR workflow runs...', 'var(--brand-text)');
  try {
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' };
    const [rCurr, rPrev] = await Promise.all([
      fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/actions/workflows/empress-daily-fetch.yml/runs?per_page=1`, { headers, cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/actions/workflows/empress-prev-month-fetch.yml/runs?per_page=1`, { headers, cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    const fmtRun = (title, d) => {
      const run = Array.isArray(d?.workflow_runs) ? d.workflow_runs[0] : null;
      if (!run) return `${title}: no runs yet`;
      const st = run.status === 'completed' ? (run.conclusion || 'done') : run.status;
      const dt = run.updated_at ? new Date(run.updated_at).toLocaleString() : '';
      const link = run.html_url ? ` <a href="${run.html_url}" target="_blank" rel="noopener" style="color:var(--brand-text);text-decoration:underline;">View ↗</a>` : '';
      return `<strong>${title}:</strong> ${st}${dt ? ' (' + dt + ')' : ''}${link}`;
    };
    _setEmpressStatusHtml(`${fmtRun('This Month', rCurr)} &nbsp;·&nbsp; ${fmtRun('Prev Month', rPrev)}`, 'var(--text)');
  } catch (err) {
    _setEmpressStatusHtml(`Could not check status: ${err.message}`, 'var(--danger)');
  }
}
window.adminCheckEmpressStatus = adminCheckEmpressStatus;
