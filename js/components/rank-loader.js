/**
 * RankLoader — "Milestone Climb" loading animation for the Ranking page.
 *
 * Three climbers scale rope ladders and swap the lead while wooden signposts
 * scroll past, one for every ranking category in the app. A small #1/#2/#3
 * badge above each climber always shows who is actually ahead.
 *
 * - Shown by startLeaderboardScan() (js/pages/leaderboard.js) and hidden when it ends.
 * - Mounts inside #lbScanCard (Rank hub) or just above #iccDrillListBody (full ranking view).
 * - Zero CPU when idle: the rAF loop only runs while the loader is on screen and the tab is visible.
 * - Short loads never flash it (120 ms show-delay); once visible it stays at least 650 ms.
 * - Respects prefers-reduced-motion (static frame) and the app's light/dark theme.
 *
 * Public API:  RankLoader.show({ label }) · RankLoader.hide() · RankLoader.relocate()
 */
(function () {
  'use strict';

  var SHOW_DELAY = 120;     // ms — don't flash for instant loads
  var MIN_VISIBLE = 650;    // ms — once shown, stay long enough to look intentional
  var FADE_MS = 220;
  var SLOW_MS = 15000;      // show a "slow connection" hint after this long

  var RUNG_GAP = 32;
  var CLIMB_CYCLES = 16;
  var CLIMB_SHIFT = RUNG_GAP * 2;
  var TOTAL_SCROLL = CLIMB_CYCLES * CLIMB_SHIFT;   // 1024px of seamless travel per loop
  var MILESTONE_GAP = TOTAL_SCROLL / 8;            // 128px between boards
  var LOOP_MS = 14400;
  var GRIP = 0.5;
  var LANES = [54, 140, 226];
  var BASE_Y = 145;
  var RANK_AMPLITUDE = 26;

  var NS = 'http://www.w3.org/2000/svg';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Same categories as the Rank hub, in the app's own wording.
  var MILESTONES = [
    { icon: '1',    title: 'Best Duty',    sub: 'Highest duty hours' },
    { icon: '2',    title: 'Best OT',      sub: 'Highest OT hours' },
    { icon: '4:30', title: 'Top 4:30pm',   sub: 'Most 4:30pm days' },
    { icon: 'OT',   title: 'Most OT Days', sub: 'Days with overtime' },
    { icon: 'H',    title: 'Holiday Duty', sub: 'Most holiday duty' },
    { icon: 'N',    title: 'Night Duty',   sub: 'Most night shifts' },
    { icon: '↓D',   title: 'Less Duty',    sub: 'Lowest duty hours' },
    { icon: '↓O',   title: 'Less OT',      sub: 'Lowest OT hours' }
  ];

  var CLIMBERS = [
    { x: LANES[0], phase: 0.00, lead: 0 / 3, shirt: '#0d9488', shirtDark: '#0f766e', skin: '#f0c9a0', skinDark: '#d9ab80', hair: '#2a1a08', pants: '#1e293b', pantsDark: '#0f172a', shoe: '#0a0e14' },
    { x: LANES[1], phase: 0.66, lead: 1 / 3, shirt: '#2563eb', shirtDark: '#1d4ed8', skin: '#d4a574', skinDark: '#b88a5c', hair: '#0a0a0a', pants: '#1f2937', pantsDark: '#0f172a', shoe: '#0f172a' },
    { x: LANES[2], phase: 0.33, lead: 2 / 3, shirt: '#ea580c', shirtDark: '#c2410c', skin: '#e8b88c', skinDark: '#c99a70', hair: '#1a0a05', pants: '#111827', pantsDark: '#0a0e14', shoe: '#1e1b4b' }
  ];

  // Gold / silver / bronze pills
  var PILL = [
    { fill: '#fbbf24', text: '#422006' },
    { fill: '#cbd5e1', text: '#1e293b' },
    { fill: '#b45309', text: '#ffffff' }
  ];

  var easeOutQuint = function (t) { return 1 - Math.pow(1 - t, 5); };

  /* ---------------- state ---------------- */
  var root = null, rungLayer = null, milestoneLayer = null, rigs = null;
  var titleEl = null, subEl = null;
  var mounted = false, want = false, mountedAt = 0;
  var showTimer = null, hideTimer = null, slowTimer = null;
  var label = '';
  var rafId = null, lastTime = null, phase = 0, frameNo = 0, visibleOnScreen = true;
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------------- helpers ---------------- */
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function prettyLabel(raw) {
    raw = String(raw || '').trim();
    var m = /^(\d{4})-(\d{2})$/.exec(raw);
    if (m && +m[2] >= 1 && +m[2] <= 12) return MONTHS[+m[2] - 1] + ' ' + m[1];
    return raw;
  }

  function currentLabel() {
    var s = document.getElementById('lbSubtitle');
    return prettyLabel(s ? s.textContent : '');
  }

  /* ---------------- build (once) ---------------- */
  function addBoard(m, y, parent) {
    var g = el('g', { transform: 'translate(342,' + y + ')' }, parent);
    // flat offset shadow (cheaper than an SVG blur filter on a scrolling element)
    el('rect', { x: -80, y: -20, width: 160, height: 46, rx: 5, fill: '#3b230d', opacity: 0.22 }, g);
    el('rect', { x: -80, y: -23, width: 160, height: 46, rx: 5, fill: 'url(#rl-plank)', stroke: '#5d3411', 'stroke-width': 1 }, g);
    el('line', { x1: -76, y1: -21.5, x2: 76, y2: -21.5, stroke: '#dca66c', 'stroke-width': 1.2, opacity: 0.7 }, g);
    el('line', { x1: -72, y1: -11, x2: 72, y2: -11, stroke: '#6b3e17', 'stroke-width': 0.8, opacity: 0.25 }, g);
    el('line', { x1: -64, y1: 12, x2: 68, y2: 12, stroke: '#6b3e17', 'stroke-width': 0.8, opacity: 0.25 }, g);
    [[-74, -17], [74, -17], [-74, 15], [74, 15]].forEach(function (p) {
      el('circle', { cx: p[0], cy: p[1], r: 2, fill: '#3f2a1d' }, g);
    });
    el('rect', { x: -69, y: -15, width: 30, height: 30, rx: 4, fill: '#5d3411', stroke: '#7c4b20', 'stroke-width': 1 }, g);
    el('text', { x: -54, y: 4, 'text-anchor': 'middle', 'font-weight': '700', 'font-size': '11', fill: '#fde68a' }, g).textContent = m.icon;
    el('text', { x: -34, y: -3, 'font-weight': '700', 'font-size': '12.5', fill: '#fff8eb' }, g).textContent = m.title;
    el('text', { x: -34, y: 10, 'font-weight': '500', 'font-size': '9.5', fill: '#f5dfc0' }, g).textContent = m.sub;
  }

  function buildClimber(cfg, parent) {
    var g = el('g', {}, parent), e = {};
    e.shadow = el('ellipse', { rx: 20, ry: 4, fill: 'rgba(0,0,0,0.10)' }, g);
    var limb = function (stroke, w) { return el('path', { fill: 'none', stroke: stroke, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g); };
    e.legL = limb(cfg.pantsDark, 7);
    e.legR = limb(cfg.pants, 7);
    e.footL = el('ellipse', { rx: 6, ry: 3.5, fill: cfg.shoe }, g);
    e.footR = el('ellipse', { rx: 6, ry: 3.5, fill: cfg.shoe }, g);
    e.armL = limb(cfg.shirtDark, 6.5);
    e.armR = limb(cfg.shirt, 6.5);
    e.handL = el('circle', { r: 4, fill: cfg.skin }, g);
    e.handR = el('circle', { r: 4, fill: cfg.skin }, g);
    e.torso = el('path', { fill: cfg.shirt }, g);
    e.torsoShade = el('path', { fill: cfg.shirtDark, opacity: 0.5 }, g);
    e.head = el('g', {}, g);
    el('circle', { r: 9.5, fill: cfg.skinDark }, e.head);
    el('circle', { r: 8.5, fill: cfg.skin, cy: -0.5 }, e.head);
    el('path', { fill: cfg.hair, d: 'M -9 -1 Q -9.5 -8 -3 -10 L 3 -10 Q 9.5 -8 9 -1 Q 10 3 8 6 L 8 2 Q 4 5 -4 5 L -8 2 L -8 6 Q -10 3 -9 -1 Z' }, e.head);
    // live rank pill
    e.pill = el('g', {}, g);
    e.pillBg = el('rect', { x: -13, y: -8, width: 26, height: 16, rx: 8, fill: PILL[0].fill, stroke: 'rgba(0,0,0,.18)', 'stroke-width': 0.8 }, e.pill);
    e.pillTx = el('text', { x: 0, y: 4, 'text-anchor': 'middle', 'font-weight': '800', 'font-size': '10.5', fill: PILL[0].text }, e.pill);
    e.pillTx.textContent = '#1';
    e.rank = 0;
    return { cfg: cfg, els: e };
  }

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'rl-loader';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');

    var stage = document.createElement('div');
    stage.className = 'rl-stage';
    root.appendChild(stage);

    var svg = el('svg', { viewBox: '0 0 430 240', 'aria-hidden': 'true', focusable: 'false', class: 'rl-svg' }, stage);

    var defs = el('defs', null, svg);
    var plank = el('linearGradient', { id: 'rl-plank', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    [['0%', '#b97f45'], ['55%', '#9e6631'], ['100%', '#845122']].forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, plank); });
    var post = el('linearGradient', { id: 'rl-post', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    [['0%', '#7c4b20'], ['45%', '#9c6430'], ['100%', '#6b3e17']].forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, post); });
    // top / bottom fades use the card colour so it works in light & dark
    var fTop = el('linearGradient', { id: 'rl-fade-t', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', style: 'stop-color:var(--rl-bg);stop-opacity:1' }, fTop);
    el('stop', { offset: '100%', style: 'stop-color:var(--rl-bg);stop-opacity:0' }, fTop);
    var fBot = el('linearGradient', { id: 'rl-fade-b', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', style: 'stop-color:var(--rl-bg);stop-opacity:0' }, fBot);
    el('stop', { offset: '100%', style: 'stop-color:var(--rl-bg);stop-opacity:1' }, fBot);

    var rung = el('g', { id: 'rl-rung' }, defs);
    el('rect', { x: -25, y: -3, width: 50, height: 6, rx: 3, fill: '#8c5a2b' }, rung);
    el('rect', { x: -25, y: -3, width: 50, height: 2, rx: 1, fill: '#b8895a', opacity: 0.7 }, rung);
    el('line', { x1: -20, y1: 0.5, x2: 20, y2: 0.5, stroke: '#6b4420', 'stroke-width': 0.8, opacity: 0.45 }, rung);
    [-25, 25].forEach(function (cx) {
      el('circle', { cx: cx, cy: 0, r: 3.4, fill: '#9b7038' }, rung);
      el('circle', { cx: cx, cy: 0, r: 1.4, fill: '#6b4420', opacity: 0.6 }, rung);
    });

    // side ropes
    var ropes = el('g', { stroke: '#c49556', 'stroke-width': 4.2, 'stroke-linecap': 'round' }, svg);
    [30, 78, 116, 164, 202, 250].forEach(function (x) { el('line', { x1: x, y1: -20, x2: x, y2: 260 }, ropes); });

    rungLayer = el('g', null, svg);
    for (var y = -RUNG_GAP; y <= 288; y += RUNG_GAP) {
      LANES.forEach(function (cx) {
        var u = el('use', { href: '#rl-rung', transform: 'translate(' + cx + ',' + y + ')' }, rungLayer);
        u.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#rl-rung');
      });
    }

    // signpost rail + boards
    el('rect', { x: 336, y: -20, width: 12, height: 280, rx: 3, fill: 'url(#rl-post)' }, svg);
    el('line', { x1: 339, y1: -20, x2: 339, y2: 260, stroke: '#b87e46', 'stroke-width': 1, opacity: 0.45 }, svg);
    milestoneLayer = el('g', null, svg);
    // 11 boards (j = -1..9) so every scroll position 0..1024 is fully populated: no pop at the loop seam
    for (var j = -1; j <= 9; j++) {
      addBoard(MILESTONES[((j % 8) + 8) % 8], 120 - j * MILESTONE_GAP, milestoneLayer);
    }

    // edge fades
    el('rect', { x: 0, y: 0, width: 430, height: 34, fill: 'url(#rl-fade-t)' }, svg);
    el('rect', { x: 0, y: 206, width: 430, height: 34, fill: 'url(#rl-fade-b)' }, svg);

    var climbLayer = el('g', null, svg);
    rigs = CLIMBERS.map(function (c) { return buildClimber(c, climbLayer); });

    titleEl = document.createElement('div');
    titleEl.className = 'rl-title';
    titleEl.textContent = 'Calculating live rankings';
    subEl = document.createElement('div');
    subEl.className = 'rl-sub';
    var dots = document.createElement('span');
    dots.className = 'rl-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = '<i>.</i><i>.</i><i>.</i>';
    root.appendChild(titleEl);
    root.appendChild(subEl);
    subEl._dots = dots;
  }

  function setSub(text) {
    if (!subEl) return;
    subEl.textContent = text;
    if (subEl._dots) subEl.appendChild(subEl._dots);
  }

  /* ---------------- animation ---------------- */
  function handY(lp) {
    var p = ((lp % 1) + 1) % 1;
    if (p < GRIP) return -50 + (p / GRIP) * RUNG_GAP;
    return (-50 + RUNG_GAP) - easeOutQuint((p - GRIP) / (1 - GRIP)) * RUNG_GAP;
  }
  function footY(lp) {
    var p = ((lp % 1) + 1) % 1;
    if (p < GRIP) return 14 + (p / GRIP) * RUNG_GAP;
    return (14 + RUNG_GAP) - easeOutQuint((p - GRIP) / (1 - GRIP)) * RUNG_GAP;
  }
  function limb(x1, y1, x2, y2, hint, mag) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    var s = hint >= 0 ? 1 : -1;
    return 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Q' + ((x1 + x2) / 2 + (-dy / len) * mag * s).toFixed(1) + ' ' + ((y1 + y2) / 2 + (dx / len) * mag * s).toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
  }
  function set(n, a, v) { n.setAttribute(a, v); }

  function renderClimber(rig, gp, surge) {
    var cfg = rig.cfg, e = rig.els, cx = cfg.x;
    var p = ((gp * CLIMB_CYCLES + cfg.phase) % 1 + 1) % 1;
    var bob = -1.5 * Math.abs(Math.sin(p * Math.PI * 4));
    var sway = 2.0 * Math.sin(p * Math.PI * 2);
    var baseY = BASE_Y + surge + bob;
    var hipX = cx + sway, shX = hipX + sway * 0.35, shY = baseY - 20;
    var headX = hipX + sway * 0.5, headY = baseY - 30;

    var hLx = cx - 18, hLy = baseY + handY(p);
    var hRx = cx + 18, hRy = baseY + handY(p + 0.5);
    var fLx = cx - 8,  fLy = baseY + footY(p + 0.5);
    var fRx = cx + 8,  fRy = baseY + footY(p);

    set(e.armL, 'd', limb(shX - 8, shY + 2, hLx, hLy, (cx - shX) * 0.15, 3));
    set(e.armR, 'd', limb(shX + 8, shY + 2, hRx, hRy, (cx - shX) * 0.15, 3));
    set(e.legL, 'd', limb(hipX - 5, baseY + 1, fLx, fLy, (cx - hipX) * 0.2, 3));
    set(e.legR, 'd', limb(hipX + 5, baseY + 1, fRx, fRy, (cx - hipX) * 0.2, 3));
    set(e.handL, 'cx', hLx); set(e.handL, 'cy', hLy);
    set(e.handR, 'cx', hRx); set(e.handR, 'cy', hRy);
    set(e.footL, 'cx', fLx); set(e.footL, 'cy', fLy);
    set(e.footR, 'cx', fRx); set(e.footR, 'cy', fRy);

    var tSL = shX - 9.5, tSR = shX + 9.5, tBL = hipX - 7.5, tBR = hipX + 7.5;
    set(e.torso, 'd', 'M' + tSL + ' ' + (shY - 3) + ' Q' + (tSL - 1) + ' ' + (shY + 5) + ' ' + tBL + ' ' + (baseY + 2) + ' L' + tBR + ' ' + (baseY + 2) + ' Q' + (tSR + 1) + ' ' + (shY + 5) + ' ' + tSR + ' ' + (shY - 3) + ' Z');
    set(e.torsoShade, 'd', 'M' + shX + ' ' + (shY - 3) + ' L' + tSR + ' ' + (shY - 3) + ' Q' + (tSR + 1) + ' ' + (shY + 5) + ' ' + tBR + ' ' + (baseY + 2) + ' L' + hipX + ' ' + (baseY + 2) + ' Z');
    set(e.head, 'transform', 'translate(' + headX.toFixed(1) + ',' + headY.toFixed(1) + ') rotate(' + (Math.sin(p * Math.PI * 2) * 6).toFixed(1) + ')');
    set(e.pill, 'transform', 'translate(' + headX.toFixed(1) + ',' + (headY - 23).toFixed(1) + ')');
    set(e.shadow, 'cx', cx); set(e.shadow, 'cy', baseY + footY(p) * 0.5 + 34);
  }

  function renderFrame(ph) {
    var totalY = ph * TOTAL_SCROLL;
    set(rungLayer, 'transform', 'translate(0,' + (totalY % RUNG_GAP).toFixed(2) + ')');
    set(milestoneLayer, 'transform', 'translate(0,' + totalY.toFixed(2) + ')');

    var surges = [], i, j;
    for (i = 0; i < rigs.length; i++) {
      var leadP = ((ph * 2 - rigs[i].cfg.lead) % 1 + 1) % 1;
      surges.push(-RANK_AMPLITUDE * Math.sin(2 * Math.PI * leadP));
    }
    for (i = 0; i < rigs.length; i++) {
      renderClimber(rigs[i], ph, surges[i]);
      var rank = 1;
      for (j = 0; j < rigs.length; j++) if (j !== i && surges[j] < surges[i]) rank++;   // higher on screen = better rank
      var e = rigs[i].els;
      if (e.rank !== rank) {
        e.rank = rank;
        e.pillTx.textContent = '#' + rank;
        set(e.pillBg, 'fill', PILL[rank - 1].fill);
        set(e.pillTx, 'fill', PILL[rank - 1].text);
      }
    }
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (lastTime === null) { lastTime = now; return; }
    var dt = Math.min(now - lastTime, 100);   // clamp so a stalled frame doesn't jump
    lastTime = now;
    // every ~15 frames check the loader is really on screen (e.g. Rank page may be hidden while a scan runs)
    if ((frameNo++ % 15) === 0) visibleOnScreen = !!(root && root.offsetParent !== null);
    if (!visibleOnScreen) return;
    phase = (phase + dt / LOOP_MS) % 1;
    renderFrame(phase);
  }

  function startLoop() {
    if (!rigs) return;
    if (reduced) { renderFrame(0.12); return; }   // single static frame
    if (rafId !== null || document.hidden) return;
    lastTime = null;
    rafId = requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null; lastTime = null;
  }
  document.addEventListener('visibilitychange', function () {
    if (!mounted) return;
    if (document.hidden) stopLoop(); else startLoop();
  });

  /* ---------------- mounting ---------------- */
  function unplace() {
    var list = document.getElementById('iccDrillListBody');
    var card = document.getElementById('lbScanCard');
    if (list) list.classList.remove('rl-busy');
    if (card) card.classList.remove('rl-host');
    if (root && root.parentNode) root.parentNode.removeChild(root);
  }

  function place() {
    unplace();
    var list = document.getElementById('iccDrillListBody');
    var card = document.getElementById('lbScanCard');
    var drill = typeof iccDrillOpen !== 'undefined' && iccDrillOpen && list && list.parentNode;
    if (drill) {
      list.parentNode.insertBefore(root, list);
      list.classList.add('rl-busy');
      root.classList.add('rl-in-drill');
      root.classList.remove('rl-in-card');
    } else if (card) {
      card.classList.add('rl-host');
      card.insertBefore(root, card.firstChild);
      root.classList.add('rl-in-card');
      root.classList.remove('rl-in-drill');
    } else {
      return false;
    }
    return true;
  }

  function applyLabel() {
    setSub(label ? label : 'Climbing through the latest scores');
  }

  function mount() {
    showTimer = null;
    if (!want) return;
    build();
    if (!place()) return;
    mounted = true;
    mountedAt = Date.now();
    root.classList.remove('rl-leaving');
    titleEl.textContent = 'Calculating live rankings';
    applyLabel();
    startLoop();
    clearTimeout(slowTimer);
    slowTimer = setTimeout(function () {
      if (mounted) { titleEl.textContent = 'Still working…'; setSub('Slow connection, please wait'); }
    }, SLOW_MS);
  }

  function leave() {
    hideTimer = null;
    if (!mounted || !root) return;
    root.classList.add('rl-leaving');
    hideTimer = setTimeout(unmount, FADE_MS);
  }

  function unmount() {
    hideTimer = null;
    stopLoop();
    clearTimeout(slowTimer); slowTimer = null;
    unplace();
    mounted = false;
  }

  /* ---------------- public API ---------------- */
  function show(opts) {
    want = true;
    label = prettyLabel(opts && opts.label) || currentLabel();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (mounted) {
      root.classList.remove('rl-leaving');
      applyLabel();
      place();
      startLoop();
      return;
    }
    if (!showTimer) showTimer = setTimeout(mount, SHOW_DELAY);
  }

  function hide() {
    want = false;
    if (showTimer) { clearTimeout(showTimer); showTimer = null; return; }
    if (!mounted || hideTimer) return;
    var wait = Math.max(0, MIN_VISIBLE - (Date.now() - mountedAt));
    hideTimer = setTimeout(leave, wait);
  }

  // Call when the surrounding view changes while a scan is running (e.g. the full ranking view opens).
  function relocate() {
    if (mounted && want) place();
  }

  window.RankLoader = { show: show, hide: hide, relocate: relocate };
})();
