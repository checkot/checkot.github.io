#!/usr/bin/env node
// node tests/test_deploy_tracker.js  - mocked GitHub + fake clock, no network
const assert = require('assert');
const path = require('path');
const D = require(path.resolve(__dirname, '../js/admin/admin-deploy.js'));
const E = Date.UTC(2026, 10, 14);

function makeSim(o) {
  o = o || {};
  const sim = { c: { t: 0 }, puts: 0, log: [], serverZip: !!o.serverZip, stampId: 'old', job: null,
    run: null, pages: { status: 'built', created_at: '2000-01-01T00:00:00Z' } };
  const rd = o.runDelay != null ? o.runDelay : 3000, dur = o.runDur != null ? o.runDur : 20000,
        pgDur = o.pagesDur != null ? o.pagesDur : 30000, stampDelay = o.stampDelay != null ? o.stampDelay : 40000;
  sim.now = () => E + sim.c.t;
  function advance() {
    const t = sim.c.t;
    if (o.serverFreeAt != null && t >= o.serverFreeAt) sim.serverZip = false;
    const j = sim.job; if (!j) return;
    if (!o.noRun && t >= j.t0 + rd && !sim.run) sim.run = { status: 'in_progress', conclusion: null, html_url: 'https://x/run', head_sha: j.sha };
    if (sim.run && sim.run.status !== 'completed' && t >= j.t0 + dur) {
      sim.run.status = 'completed'; sim.run.conclusion = o.conclusion || 'success';
      if (sim.run.conclusion === 'success') {
        sim.serverZip = false; j.doneAt = t;
        sim.pages = { status: 'building', created_at: new Date(sim.now()).toISOString() };
      }
    }
    if (j.doneAt != null) {
      if (t >= j.doneAt + pgDur) sim.pages.status = o.pagesErrored ? 'errored' : 'built';
      if (!o.pagesErrored && t >= j.doneAt + stampDelay && !o.neverStamp) sim.stampId = j.id;
      if (o.stampWrongFirst && t >= j.doneAt + 10000 && t < j.doneAt + stampDelay) sim.stampId = 'someone-else';
    }
  }
  sim.sleep = async ms => { sim.c.t += ms; advance(); };
  sim.putFile = async (p, b64, msg) => {
    sim.puts++; sim.serverZip = true; sim.run = null;
    const sha = 'sha' + sim.puts;
    sim.job = { id: D.extractJobId(msg, sha), sha, t0: sim.c.t, doneAt: null };
    sim.log.push({ ev: 'put', t: sim.c.t, id: sim.job.id });
    return { commit: { sha } };
  };
  const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  sim.fetchFn = async url => {
    advance();
    if (/\/contents\/deploy\.zip/.test(url)) return sim.serverZip ? resp(200, { sha: 'x' }) : resp(404, {});
    if (/\/actions\/workflows/.test(url)) {
      if (o.noStatusPerm) return resp(403, {});
      const m = url.match(/head_sha=([^&]+)/);
      if (o.hideRuns) return resp(200, { total_count: 0, workflow_runs: [] });
      if (m) return resp(200, { workflow_runs: (!o.headShaBroken && sim.job && sim.run && sim.job.sha === m[1]) ? [sim.run] : [] });
      return resp(200, { workflow_runs: sim.run ? [sim.run] : [] });
    }
    if (/\/pages\/builds\/latest/.test(url)) return o.noStatusPerm ? resp(404, {}) : resp(200, sim.pages);
    if (/deploy-info\.json/.test(url)) return resp(200, { id: sim.stampId });
    return resp(404, {});
  };
  return sim;
}
function makeStore() {
  const items = new Map(), blobs = new Map();
  return {
    async list() { return [...items.values()].map(x => JSON.parse(JSON.stringify(x))); },
    async put(it, blob) { items.set(it.id, JSON.parse(JSON.stringify(it))); blobs.set(it.id, blob); },
    async update(it) { items.set(it.id, JSON.parse(JSON.stringify(it))); },
    async remove(id) { items.delete(id); blobs.delete(id); },
    async getBlob(id) { return blobs.get(id); }
  };
}
function mkDeps(sim, extra) {
  return Object.assign({ fetchFn: sim.fetchFn, putFile: sim.putFile, getZipB64: async () => 'QUJD', token: 'tok', owner: 'o', repo: 'r',
    origin: 'https://site', now: sim.now, sleep: sim.sleep, store: makeStore() }, extra || {});
}
async function oneJob(sim, deps, name) {
  const it = await D.enqueue(deps.store, { name: name || 'a.zip', size: 10, blob: 'b' }, sim.now(), 0.5);
  const j = (await deps.store.list()).find(x => x.id === it.id);
  await D.runJob(deps, j); return j;
}
let pass = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);

test('helpers: job id / commit message round trip', async () => {
  const id = D.makeJobId(E, 0.123);
  assert(/^[A-Za-z0-9_-]+$/.test(id));
  assert.strictEqual(D.extractJobId(D.buildCommitMessage(id, 'my [x] deploy.zip'), 'zzz'), id);
  assert.strictEqual(D.extractJobId('no id here', 'abc$%123'), 'abc123');
  assert.strictEqual(D.extractJobId('x [job:a b] y', 'sha1'), 'sha1');
});
test('normal run -> live (states in order, stamp decides)', async () => {
  const sim = makeSim(), deps = mkDeps(sim), seen = [];
  deps.onUpdate = j => { if (seen[seen.length - 1] !== j.state) seen.push(j.state); };
  const j = await oneJob(sim, deps);
  assert.strictEqual(j.state, 'live');
  assert.deepStrictEqual(seen, ['uploading', 'extracting', 'publishing', 'live']);
  assert(j.finishedAt - j.startedAt >= 40000, 'live only after stamp (~40s)');
  assert.strictEqual(sim.puts, 1);
});
test('workflow failure -> failed', async () => {
  const sim = makeSim({ conclusion: 'failure' }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'failed'); assert(/failure/.test(j.error));
});
test('workflow skipped -> failed with owner hint', async () => {
  const sim = makeSim({ conclusion: 'skipped' }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'failed'); assert(/owner/.test(j.error));
});
test('workflow never visible + no stamp -> NOT failed: stamp-only after 60 s, ends slow with notice', async () => {
  const sim = makeSim({ noRun: true }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'slow'); assert(/live stamp/.test(j.notice)); assert.strictEqual(j.statusApi, false);
});
test('workflow runs invisible (permission) but deploy works -> live via stamp, with notice', async () => {
  const sim = makeSim({ hideRuns: true }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'live'); assert(/Could not see the GitHub workflow run/.test(j.notice));
});
test('head_sha filter misses but recent-runs list has it -> detected normally', async () => {
  const sim = makeSim({ headShaBroken: true }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'live'); assert(!j.notice); assert(j.runUrl);
});
test('Pages build errored -> failed', async () => {
  const sim = makeSim({ pagesErrored: true }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'failed'); assert(/Pages build errored/.test(j.error));
});
test('stale errored Pages build (older than this deploy) is ignored', async () => {
  const sim = makeSim(); sim.pages = { status: 'errored', created_at: '2000-01-01T00:00:00Z' };
  const j = await oneJob(sim, mkDeps(sim)); assert.strictEqual(j.state, 'live');
});
test('live-stamp mismatch then match -> live only on match', async () => {
  const sim = makeSim({ stampWrongFirst: true, pagesDur: 5000 }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'live'); assert.strictEqual(sim.stampId, j.id);
  assert(j.finishedAt - j.startedAt >= 40000);
});
test('403/404 on status APIs -> stamp-only fallback, still live, clear message', async () => {
  const sim = makeSim({ noStatusPerm: true }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'live'); assert.strictEqual(j.statusApi, false);
  assert(/Actions \(read\) and Pages \(read\)/.test(j.notice));
});
test('stamp never matches -> slow (warning) after 8 min, not failed', async () => {
  const sim = makeSim({ neverStamp: true }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'slow'); assert(/longer than usual/.test(j.error));
});
test('server already has deploy.zip -> waits, then uploads', async () => {
  const sim = makeSim({ serverZip: true, serverFreeAt: 20000 }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'live'); assert(sim.log[0].t >= 20000, 'put at ' + sim.log[0].t);
});
test('server deploy.zip never disappears -> failed after 5 min, nothing uploaded', async () => {
  const sim = makeSim({ serverZip: true }), j = await oneJob(sim, mkDeps(sim));
  assert.strictEqual(j.state, 'failed'); assert.strictEqual(sim.puts, 0);
});
test('network errors are retried silently', async () => {
  const sim = makeSim(); let n = 0; const real = sim.fetchFn;
  sim.fetchFn = async (u, o) => { if (/actions\/workflows|deploy-info/.test(u) && (n++ % 3 === 0)) throw new Error('net'); return real(u, o); };
  const j = await oneJob(sim, mkDeps(sim)); assert.strictEqual(j.state, 'live');
});
test('queue: item 2 uploads only after item 1 is live', async () => {
  const sim = makeSim(), deps = mkDeps(sim);
  await D.enqueue(deps.store, { name: '1.zip', blob: 'a' }, sim.now(), 0.1);
  await D.enqueue(deps.store, { name: '2.zip', blob: 'b' }, sim.now() + 1, 0.2);
  let liveAt1 = null; deps.onUpdate = j => { if (j.state === 'live' && liveAt1 === null) liveAt1 = sim.c.t; };
  const r = await D.runQueue(deps);
  assert.strictEqual(sim.puts, 2); assert(sim.log[1].t >= liveAt1, 'put2 ' + sim.log[1].t + ' live1 ' + liveAt1);
  assert.deepStrictEqual(r.ran.map(x => x.state), ['live', 'live']);
});
test('queue: failed job pauses; "stop" leaves item 2 waiting', async () => {
  const sim = makeSim({ conclusion: 'failure' }), deps = mkDeps(sim); let asked = 0;
  deps.onPause = async () => { asked++; return 'stop'; };
  await D.enqueue(deps.store, { name: '1.zip', blob: 'a' }, sim.now(), 0.1);
  await D.enqueue(deps.store, { name: '2.zip', blob: 'b' }, sim.now() + 1, 0.2);
  const r = await D.runQueue(deps);
  assert.strictEqual(asked, 1); assert(r.stopped); assert.strictEqual(sim.puts, 1);
  assert.deepStrictEqual((await deps.store.list()).map(x => x.state), ['failed', 'queued']);
});
test('queue: failed job + "skip" continues with item 2', async () => {
  let call = 0; const sim = makeSim();
  const realPut = sim.putFile; sim.putFile = async (...a) => { call++; if (call === 1) { const r = await realPut(...a); sim.run = null; sim.job = null; sim.serverZip = false; return r; } return realPut(...a); };
  const deps = mkDeps(sim);
  deps.onPause = async () => 'skip';
  await D.enqueue(deps.store, { name: '1.zip', blob: 'a' }, sim.now(), 0.1);
  await D.enqueue(deps.store, { name: '2.zip', blob: 'b' }, sim.now() + 1, 0.2);
  const r = await D.runQueue(deps);
  assert.deepStrictEqual(r.ran.map(x => x.state), ['slow', 'live']); // unseen workflow + no stamp pauses the queue like a failure
});
test('queue: Remove works only for waiting items', async () => {
  const sim = makeSim(), deps = mkDeps(sim);
  const a = await D.enqueue(deps.store, { name: '1.zip', blob: 'a' }, 1, 0.1);
  assert.strictEqual(await D.removeWaiting(deps.store, a.id), true);
  const b = await D.enqueue(deps.store, { name: '2.zip', blob: 'b' }, 2, 0.2);
  const it = (await deps.store.list())[0]; it.state = 'extracting'; await deps.store.update(it);
  assert.strictEqual(await D.removeWaiting(deps.store, b.id), false);
});
test('reload/resume: extracting job continues without re-upload', async () => {
  const sim = makeSim(), deps = mkDeps(sim);
  await D.enqueue(deps.store, { name: '1.zip', blob: 'a' }, sim.now(), 0.1);
  let stopAfterExtract = false; const realSleep = sim.sleep;
  // first "page session": run until upload is done, then simulate reload by abandoning
  const d1 = Object.assign({}, deps, { onUpdate: j => { if (j.state === 'extracting') stopAfterExtract = true; } });
  d1.sleep = async ms => { if (stopAfterExtract) throw new Error('page closed'); return realSleep(ms); };
  await assert.rejects(D.runQueue(d1), /page closed/);
  assert.strictEqual(sim.puts, 1);
  const saved = (await deps.store.list())[0]; assert.strictEqual(saved.state, 'extracting'); assert(saved.uploadSha);
  const r = await D.runQueue(deps);               // second session
  assert.strictEqual(sim.puts, 1, 'no second upload'); assert.strictEqual(r.ran[0].state, 'live');
});

(async () => {
  for (const [n, f] of tests) {
    try { await f(); pass++; console.log('  ok  -', n); }
    catch (e) { console.log('FAIL  -', n, '\n      ', e.message); process.exitCode = 1; }
  }
  console.log(pass + '/' + tests.length + ' passed');
  if (pass !== tests.length) process.exit(1);
})();
