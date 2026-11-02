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
const jsonStr = JSON.stringify({ areas: AREA_MAP, details: AREA_DETAILS, subsections: AREA_SUBS, designationRates: DESIG_RATES, rateTable: RATE_TABLE }, null, 2);
await githubPutFile('areas.json', utf8ToBase64(jsonStr), `Update areas.json via RPPF Admin Panel`);
try { Object.keys(localStorage).forEach(k => { const _ns = (typeof STORAGE_NAMESPACE !== 'undefined' ? STORAGE_NAMESPACE : ''); if (k.startsWith(_ns + 'renata_lb_') || k.startsWith(_ns + 'renata_mdata_')) localStorage.removeItem(k); }); } catch (e) {}
if (statusEl) { statusEl.style.color = 'var(--success)'; statusEl.textContent = 'areas.json was successfully updated on the RPPF Cloud Server.'; }
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
  const file = files && files[0];
  if (!file) return;
  const statusEl = document.getElementById('adminZipUploadStatus');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'var(--brand-soft)';
    statusEl.style.color = 'var(--brand-text)';
    statusEl.textContent = 'Reading ' + file.name + ' (' + Math.round(file.size / 1024) + ' KB)...';
  }
  const token = getGhToken();
  if (!token) {
    if (statusEl) {
      statusEl.style.background = 'var(--danger-bg)';
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = 'Please enter and save your Server Access Key first in the box above.';
    }
    if (typeof showToast === 'function') showToast('Save Server Access Key first', 'warn');
    return;
  }
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      if (statusEl) {
        statusEl.textContent = 'Uploading deploy.zip to GitHub via API, please wait...';
      }
      const bytes = new Uint8Array(e.target.result);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(binary);

      await githubPutFile('deploy.zip', b64, 'Auto-deploy site update via Admin Panel ZIP Uploader (' + file.name + ')');
      if (statusEl) {
        statusEl.style.background = 'var(--success-bg)';
        statusEl.style.color = 'var(--success)';
        statusEl.textContent = '✓ deploy.zip uploaded successfully! GitHub Actions is now extracting and publishing your site. The updated site will be live in ~30 seconds.';
      }
      if (typeof showToast === 'function') showToast('Site update initiated! Live in ~30 seconds.', 'success');
      const inputEl = document.getElementById('adminZipFileInput');
      if (inputEl) inputEl.value = '';
    } catch (err) {
      if (statusEl) {
        statusEl.style.background = 'var(--danger-bg)';
        statusEl.style.color = 'var(--danger)';
        statusEl.textContent = '✗ Error uploading zip: ' + err.message;
      }
      if (typeof showToast === 'function') showToast('Upload failed: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

window.adminHandleZipUpload = adminHandleZipUpload;
