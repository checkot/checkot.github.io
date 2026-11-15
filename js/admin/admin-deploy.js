/* ==========================================================================
   ADMIN-DEPLOY.JS - Deploy tracker logic (state machine, polling, queue)
   UMD: works in the browser (window.RppfDeploy) and in Node (require).
   NO DOM here. All I/O comes in through `deps` so tests can mock it:
     deps.fetchFn(url, opts)      fetch-like (returns {ok,status,json()})
     deps.putFile(path,b64,msg)   Contents API PUT (githubPutFile), returns JSON with commit.sha
     deps.getZipB64(job)          async -> base64 of the zip for this job
     deps.token, deps.owner, deps.repo, deps.origin
     deps.now(), deps.sleep(ms)   clock (fake in tests)
     deps.store                   queue store {list,put,update,remove,getBlob}
     deps.saveJob(job)            optional (localStorage rppf_deploy_job_v1)
     deps.onUpdate(job)           optional UI hook
     deps.onPause(job)            optional, async -> 'skip' | 'stop'
   Job states: queued -> uploading -> extracting -> publishing -> live  (+ failed, slow)
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RppfDeploy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const T = {
    POLL_WF: 4000,          // workflow poll
    POLL_PUB: 5000,         // pages + live-stamp poll
    NO_RUN_MS: 60000,       // workflow must appear within 60 s
    SLOW_MS: 8 * 60000,     // give up (warning) after 8 min
    FREE_POLL: 5000,        // wait for an old deploy.zip to disappear
    FREE_MAX: 5 * 60000,
    PAGES_SLACK_MS: 120000  // clock-skew allowance when judging a Pages build
  };
  const PERM_MSG = 'Add Actions (read) and Pages (read) permission to your Server Access Key';
  const ACTIVE = { uploading: 1, extracting: 1, publishing: 1 };
  const STEP_OF = { queued: 0, uploading: 1, extracting: 2, publishing: 3, live: 4 };

  /* ---------- id / commit-message helpers ---------- */
  function makeJobId(nowMs, rnd) {
    const r = (typeof rnd === 'number' ? rnd : Math.random());
    return 'j' + Math.floor(nowMs).toString(36) + Math.floor(r * 46656).toString(36).padStart(3, '0');
  }
  function cleanId(s) { return String(s || '').replace(/[^A-Za-z0-9_-]/g, ''); }
  function buildCommitMessage(id, zipName) {
    const nm = String(zipName || 'deploy.zip').replace(/[\r\n\[\]]/g, ' ').slice(0, 80);
    return 'Auto-deploy site update via Admin Panel ZIP Uploader (' + nm + ') [job:' + cleanId(id) + ']';
  }
  function extractJobId(msg, fallbackSha) {
    const m = String(msg || '').match(/\[job:([A-Za-z0-9_-]+)\]/);
    return m ? m[1] : cleanId(fallbackSha);
  }
  function stepIndex(job) { return STEP_OF[job && job.state] || 0; }
  function isActive(job) { return !!(job && ACTIVE[job.state]); }

  /* ---------- tiny API helper (never throws) ---------- */
  async function api(deps, path) {
    const url = 'https://api.github.com/repos/' + deps.owner + '/' + deps.repo + '/' + path;
    try {
      const r = await deps.fetchFn(url, {
        headers: { 'Authorization': 'token ' + deps.token, 'Accept': 'application/vnd.github+json' },
        cache: 'no-store'
      });
      let json = null;
      if (r.ok) { try { json = await r.json(); } catch (_e) { json = null; } }
      return { ok: !!r.ok, status: r.status, json: json };
    } catch (_e) {
      return { ok: false, status: 0, json: null, network: true };
    }
  }
  async function readStamp(deps) {
    try {
      const r = await deps.fetchFn((deps.origin || '') + '/deploy-info.json?t=' + deps.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch (_e) { return null; }
  }

  /* ---------- job persistence ---------- */
  async function save(deps, job) {
    if (deps.store && deps.store.update) await deps.store.update(job);
    if (deps.saveJob) await deps.saveJob(job);
    if (deps.onUpdate) deps.onUpdate(job);
  }
  async function fail(deps, job, msg) {
    job.state = 'failed'; job.error = msg; job.finishedAt = deps.now();
    await save(deps, job); return job;
  }

  /* ---------- 0) wait until the server has no pending deploy.zip ---------- */
  async function waitServerFree(deps) {
    const t0 = deps.now();
    for (;;) {
      const r = await api(deps, 'contents/deploy.zip');
      if (r.status === 404) return { ok: true, waitedMs: deps.now() - t0 };
      if (r.status === 401 || r.status === 403) return { ok: false, reason: 'Server Access Key was refused (HTTP ' + r.status + ')' };
      if (deps.now() - t0 >= T.FREE_MAX) return { ok: false, reason: 'Another deploy.zip is still pending on the server (waited 5 minutes)' };
      await deps.sleep(T.FREE_POLL);
    }
  }

  /* ---------- 1) upload ---------- */
  async function stageUpload(deps, job) {
    job.state = 'uploading'; job.startedAt = job.startedAt || deps.now(); job.error = null;
    await save(deps, job);
    const free = await waitServerFree(deps);
    if (!free.ok) return fail(deps, job, free.reason);
    let res;
    try {
      const b64 = await deps.getZipB64(job);
      res = await deps.putFile('deploy.zip', b64, buildCommitMessage(job.id, job.name));
    } catch (e) {
      return fail(deps, job, 'Upload failed: ' + (e && e.message || e));
    }
    const sha = res && res.commit && res.commit.sha;
    if (!sha) return fail(deps, job, 'Upload finished but GitHub did not return a commit id');
    job.uploadSha = sha; job.state = 'extracting'; job.extractStartedAt = deps.now();
    await save(deps, job);
    return job;
  }

  /* ---------- 2) workflow run ---------- */
  async function stageExtract(deps, job) {
    job.state = 'extracting';
    if (!job.extractStartedAt) job.extractStartedAt = deps.now();
    await save(deps, job);
    if (job.statusApi === false) return stageDone(deps, job); // stamp-only mode
    for (;;) {
      const r = await api(deps, 'actions/workflows/deploy-zip.yml/runs?head_sha=' + encodeURIComponent(job.uploadSha) + '&per_page=1');
      if (r.status === 403 || r.status === 404) {
        job.statusApi = false; job.notice = PERM_MSG; return stageDone(deps, job);
      }
      let run = r.ok && r.json && r.json.workflow_runs && r.json.workflow_runs[0];
      let seen = r.ok && r.json ? (r.json.total_count || 0) : -1;
      if (!run && r.ok) {
        // second way: recent runs of the workflow, matched on the commit id here (the head_sha filter can miss)
        const r2 = await api(deps, 'actions/workflows/deploy-zip.yml/runs?per_page=10');
        if (r2.ok && r2.json && Array.isArray(r2.json.workflow_runs)) {
          run = r2.json.workflow_runs.find(x => x && x.head_sha === job.uploadSha) || null;
          seen = r2.json.workflow_runs.length;
        }
      }
      if (run) {
        job.runUrl = run.html_url || job.runUrl;
        if (run.status === 'completed') {
          if (run.conclusion === 'success') return stageDone(deps, job);
          const c = run.conclusion || 'unknown';
          return fail(deps, job, 'Workflow ' + c + (c === 'skipped' ? ' (the upload was probably not made by the repository owner)' : ''));
        }
      } else if (r.ok && deps.now() - job.extractStartedAt >= T.NO_RUN_MS) {
        // Could not SEE the run (usually a missing Actions-read permission). That is not proof of a failed deploy:
        // keep going and let the live stamp decide.
        job.statusApi = false;
        job.notice = 'Could not see the GitHub workflow run (HTTP ' + r.status + ', runs seen: ' + seen + '). ' + PERM_MSG + ' - waiting for the live stamp instead.';
        return stageDone(deps, job);
      }
      if (deps.now() - job.startedAt >= T.SLOW_MS) return slow(deps, job);
      await deps.sleep(T.POLL_WF);
    }
  }
  async function stageDone(deps, job) {
    job.extractDoneAt = deps.now();
    job.state = 'publishing'; job.pubStartedAt = deps.now();
    await save(deps, job);
    return job;
  }
  async function slow(deps, job) {
    job.state = 'slow'; job.error = 'Taking longer than usual - check later / open site'; job.finishedAt = deps.now();
    await save(deps, job); return job;
  }

  /* ---------- 3) pages build + live stamp ---------- */
  async function stagePublish(deps, job) {
    job.state = 'publishing';
    if (!job.pubStartedAt) job.pubStartedAt = deps.now();
    await save(deps, job);
    for (;;) {
      const st = await readStamp(deps);
      if (st && st.id === job.id) {
        job.state = 'live'; job.finishedAt = deps.now(); job.error = null;
        await save(deps, job); return job;
      }
      if (job.statusApi !== false) {
        const b = await api(deps, 'pages/builds/latest');
        if (b.status === 403 || b.status === 404) { job.statusApi = false; job.notice = PERM_MSG; await save(deps, job); }
        else if (b.ok && b.json) {
          job.pagesStatus = b.json.status;
          const created = Date.parse(b.json.created_at || b.json.updated_at || '');
          const relevant = isNaN(created) || created >= (job.extractDoneAt || 0) - T.PAGES_SLACK_MS;
          if (b.json.status === 'errored' && relevant) {
            return fail(deps, job, 'Pages build errored' + (b.json.error && b.json.error.message ? ': ' + b.json.error.message : ''));
          }
        }
      }
      if (deps.now() - job.pubStartedAt >= T.SLOW_MS) return slow(deps, job);
      await deps.sleep(T.POLL_PUB);
    }
  }

  /* ---------- run / resume one job from its saved state ---------- */
  async function runJob(deps, job) {
    if (job.state === 'queued' || job.state === 'failed' || job.state === 'slow' || (job.state === 'uploading' && !job.uploadSha)) {
      job.uploadSha = null; job.statusApi = undefined;
      const r = await stageUpload(deps, job); if (r.state === 'failed') return job;
    }
    if (job.state === 'extracting') { await stageExtract(deps, job); if (job.state === 'failed' || job.state === 'slow') return job; }
    if (job.state === 'publishing') { await stagePublish(deps, job); }
    return job;
  }

  /* ---------- queue ---------- */
  async function enqueue(store, file, nowMs, rnd) {
    const item = { id: makeJobId(nowMs, rnd), name: file.name, size: file.size || 0, addedAt: nowMs, state: 'queued' };
    await store.put(item, file.blob);
    return item;
  }
  async function removeWaiting(store, id) {
    const items = await store.list(); const it = items.find(x => x.id === id);
    if (!it || it.state !== 'queued') return false;
    await store.remove(id); return true;
  }
  function pickNext(items) {
    const sorted = items.slice().sort((a, b) => a.addedAt - b.addedAt);
    const active = sorted.find(isActive);
    if (active) return active;                       // resume an interrupted job first
    return sorted.find(x => x.state === 'queued' && !x.skipped) || null;
  }
  let _running = false;
  async function runQueue(deps) {
    if (_running) return { already: true };
    _running = true;
    const out = { ran: [], stopped: false };
    try {
      for (;;) {
        const item = pickNext(await deps.store.list());
        if (!item) break;
        await runJob(deps, item);
        out.ran.push({ id: item.id, state: item.state });
        if (item.state === 'live') continue;
        const choice = deps.onPause ? await deps.onPause(item) : 'stop';
        if (choice === 'skip') { item.skipped = true; await save(deps, item); continue; }
        out.stopped = true; break;
      }
    } finally { _running = false; }
    return out;
  }

  return {
    T, PERM_MSG,
    makeJobId, buildCommitMessage, extractJobId, stepIndex, isActive,
    waitServerFree, stageUpload, stageExtract, stagePublish, runJob,
    enqueue, removeWaiting, pickNext, runQueue
  };
});

/* ==========================================================================
   BROWSER PART: IndexedDB queue + Admin UI (only runs when a DOM exists)
   ========================================================================== */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.RppfDeploy) return;
  const D = window.RppfDeploy;
  const JOB_KEY = 'rppf_deploy_job_v1';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let _db = null, _audio = null, _running = false, _tick = null, _pauseResolve = null, _baseTitle = null;

  /* ---------- IndexedDB store (zip blobs live here, never in localStorage) ---------- */
  function openDb() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const rq = indexedDB.open('rppf_deploy_queue_v1', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('items', { keyPath: 'id' });
      rq.onsuccess = () => { _db = rq.result; res(_db); };
      rq.onerror = () => rej(rq.error || new Error('IndexedDB unavailable'));
    });
  }
  function tx(mode, fn) {
    return openDb().then(db => new Promise((res, rej) => {
      const t = db.transaction('items', mode), s = t.objectStore('items'); let out;
      Promise.resolve(fn(s, v => { out = v; })).catch(rej);
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
  }
  const idbReq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const store = {
    list() { return openDb().then(db => idbReq(db.transaction('items').objectStore('items').getAll())).then(all =>
      all.map(x => { const c = Object.assign({}, x); delete c.blob; return c; }).sort((a, b) => a.addedAt - b.addedAt)); },
    put(item, blob) { return tx('readwrite', s => { s.put(Object.assign({}, item, { blob: blob })); }); },
    update(item) { return openDb().then(db => new Promise((res, rej) => {
      const t = db.transaction('items', 'readwrite'), s = t.objectStore('items'), g = s.get(item.id);
      g.onsuccess = () => { s.put(Object.assign({}, g.result || {}, item)); };
      t.oncomplete = () => res(); t.onerror = () => rej(t.error); })); },
    remove(id) { return tx('readwrite', s => { s.delete(id); }); },
    getBlob(id) { return openDb().then(db => idbReq(db.transaction('items').objectStore('items').get(id))).then(r => r && r.blob); }
  };

  async function blobToB64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer()); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /* ---------- sound / vibration / toast ---------- */
  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      if (!_audio) _audio = new AC();
      if (_audio.state === 'suspended') _audio.resume();
    } catch (_e) {}
  }
  function beep() {
    try {
      if (!_audio) return; const o = _audio.createOscillator(), g = _audio.createGain();
      o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(_audio.destination);
      const t = _audio.currentTime; o.start(t); g.gain.setValueAtTime(0.15, t + 0.18); o.frequency.setValueAtTime(1175, t + 0.18); o.stop(t + 0.4);
    } catch (_e) {}
  }
  function notifyLive() {
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_e) {}
    beep();
    if (typeof showToast === 'function') showToast('Site is live ✅', 'success');
    if (_baseTitle === null) _baseTitle = document.title;
    if (!/^✅ /.test(document.title)) document.title = '✅ ' + document.title;
  }
  function clearTitle() { if (_baseTitle !== null) { document.title = _baseTitle; _baseTitle = null; } }

  /* ---------- rendering ---------- */
  const STEPS = [
    ['Uploaded to GitHub', 'গিটহাবে আপলোড'], ['Extracting files', 'ফাইল খোলা হচ্ছে'],
    ['Publishing site', 'সাইট প্রকাশ হচ্ছে'], ['Live', 'সাইট চালু']
  ];
  function stepStates(job) {
    const r = [0, 0, 0, 0]; // 0 waiting, 1 running, 2 done, 3 failed
    if (!job) return r;
    const s = job.state;
    if (s === 'live') return [2, 2, 2, 2];
    if (s === 'queued') return r;
    let at = s === 'uploading' ? 0 : s === 'extracting' ? 1 : s === 'publishing' ? 2 : -1;
    if (s === 'failed') at = job.extractDoneAt ? 2 : job.uploadSha ? 1 : 0;
    if (s === 'slow') at = 2;
    for (let i = 0; i < at; i++) r[i] = 2;
    if (at >= 0) r[at] = (s === 'failed') ? 3 : 1;
    return r;
  }
  const mmss = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const LABEL = { queued: 'Waiting · অপেক্ষায়', uploading: 'Uploading…', extracting: 'Extracting…', publishing: 'Publishing…', live: 'Live ✅', failed: 'Failed ❌', slow: 'Slow ⚠️' };
  let _items = [], _note = '';

  function currentJob() {
    const act = _items.find(D.isActive); if (act) return act;
    const done = _items.filter(x => x.state === 'live' || x.state === 'failed' || x.state === 'slow');
    return done.length ? done[done.length - 1] : null;
  }
  function render() {
    const host = $('dplBox'); if (!host) return;
    const job = currentJob(), st = stepStates(job), ICON = ['○', '⏳', '✅', '❌'];
    $('dplSteps').innerHTML = STEPS.map((s, i) => '<li class="dpl-step dpl-s' + st[i] + '"><span class="dpl-ic">' + ICON[st[i]] + '</span><span><b>' + (i + 1) + ' ' + s[0] + '</b><small> · ' + s[1] + '</small></span></li>').join('');
    const el = job && job.startedAt ? (job.finishedAt || Date.now()) - job.startedAt : 0;
    $('dplTimer').textContent = job ? ('⏱ ' + mmss(el) + (job.state === 'live' ? ' total' : '')) : '';
    $('dplQueue').innerHTML = _items.length ? _items.map(it => '<div class="dpl-q"><div class="dpl-qn"><b>' + esc(it.name) + '</b><small>' + Math.round((it.size || 0) / 1024) + ' KB · ' + (LABEL[it.state] || it.state) + (it.skipped ? ' · skipped' : '') + '</small></div>' +
      (it.state === 'queued' ? '<button type="button" class="ax-btn dpl-rm" data-rm="' + esc(it.id) + '">Remove</button>' : '') + '</div>').join('') : '<div class="ax-muted" style="font-size:12px;">Queue is empty · কিউ খালি</div>';
    let msg = '', cls = '';
    if (job && job.state === 'failed') { msg = '✗ ' + esc(job.error || 'Deploy failed') + (job.runUrl ? ' · <a href="' + esc(job.runUrl) + '" target="_blank" rel="noopener">GitHub run</a>' : ''); cls = 'err'; }
    else if (job && job.state === 'slow') { msg = '⚠️ ' + esc(job.error); cls = 'warn'; }
    else if (_note) { msg = esc(_note); cls = 'warn'; }
    if (job && job.notice) msg += (msg ? '<br>' : '') + '⚠️ ' + esc(job.notice), cls = cls || 'warn';
    const pm = $('dplPause');
    const paused = !!_pauseResolve;
    pm.style.display = paused ? 'flex' : 'none';
    const m = $('dplMsg'); m.innerHTML = msg; m.style.display = msg ? 'block' : 'none'; m.className = 'dpl-msg ' + cls;
    $('dplOpen').style.display = (job && (job.state === 'live' || job.state === 'slow')) ? 'inline-flex' : 'none';
  }
  async function refresh() { try { _items = await store.list(); } catch (_e) { _items = []; } render(); }
  function startTick() {
    if (_tick) return; _tick = setInterval(() => { if (!_items.some(D.isActive) && !_running) { clearInterval(_tick); _tick = null; } render(); }, 1000);
  }

  /* ---------- wiring ---------- */
  function deps() {
    return {
      fetchFn: (u, o) => window.fetch(u, o), putFile: (p, b, m) => githubPutFile(p, b, m),
      getZipB64: async job => { const b = await store.getBlob(job.id); if (!b) throw new Error('Zip file is missing from the queue'); return blobToB64(b); },
      token: getGhToken(), owner: GITHUB_USERNAME, repo: REPO_NAME, origin: location.origin,
      now: () => Date.now(), sleep: ms => new Promise(r => setTimeout(r, ms)), store: store,
      saveJob: job => { try { localStorage.setItem(JOB_KEY, JSON.stringify(job)); } catch (_e) {} },
      onUpdate: job => {
        const i = _items.findIndex(x => x.id === job.id); if (i >= 0) _items[i] = Object.assign({}, job); else _items.push(Object.assign({}, job));
        if (job.state === 'live' && !job._notified) { job._notified = true; notifyLive(); }
        render();
      },
      onPause: job => new Promise(res => { _pauseResolve = c => { _pauseResolve = null; res(c); render(); }; render(); })
    };
  }
  async function start(resuming) {
    if (_running) return; _running = true; _note = resuming ? 'Resuming… · আবার শুরু হচ্ছে' : ''; clearTitle();
    await refresh(); startTick();
    try { await D.runQueue(deps()); } catch (e) { _note = 'Error: ' + (e && e.message || e); }
    _running = false; if (!_note.startsWith('Error')) _note = ''; await refresh();
  }
  async function addFiles(files) {
    const list = Array.prototype.slice.call(files || []).filter(f => /\.zip$/i.test(f.name));
    if (!list.length) { if (typeof showToast === 'function') showToast('Please choose a .zip file', 'warn'); return; }
    unlockAudio();
    for (const f of list) await D.enqueue(store, { name: f.name, size: f.size, blob: f }, Date.now(), Math.random());
    await refresh(); if (typeof showToast === 'function') showToast(list.length + ' file(s) added to the deploy queue', 'info');
    start(false);
  }
  async function init() {
    if (!$('dplBox')) return;
    $('dplQueue').addEventListener('click', async e => { const id = e.target && e.target.getAttribute && e.target.getAttribute('data-rm'); if (id) { await D.removeWaiting(store, id); refresh(); } });
    $('dplSkip').onclick = () => _pauseResolve && _pauseResolve('skip');
    $('dplStop').onclick = () => _pauseResolve && _pauseResolve('stop');
    $('dplOpen').onclick = () => window.open('/?v=' + Date.now(), '_blank');
    await refresh();
    const adm = (typeof getAdminUser === 'function') ? String(getAdminUser() || '').toLowerCase() : '';
    if (adm === 'dev' && getGhToken() && _items.some(x => D.isActive(x) || x.state === 'queued')) start(true);
  }
  window.RppfDeployUI = { addFiles: addFiles, unlockAudio: unlockAudio, refresh: refresh, store: store };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
