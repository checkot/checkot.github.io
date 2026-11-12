/**
 * RankLoader — "Milestone Climb" loader for the Ranking page (#lbScanCard).
 * Three climbers scale rope ladders beside a post of wooden ranking boards.
 * API: window.RankLoader = { mount(el), start(), stop() }
 * - Pure inline SVG + rAF, no external fonts/CDN (offline PWA safe).
 * - Self-pauses when the card is hidden or the tab is in the background.
 * - Static frame when prefers-reduced-motion is set.
 */
(function () {
  'use strict';

  var RUNG_GAP = 32;
  var CLIMB_CYCLES = 16;
  var CLIMB_SHIFT = RUNG_GAP * 2;
  var TOTAL_SCROLL = CLIMB_CYCLES * CLIMB_SHIFT;      // 1024px seamless travel
  var BASE_DURATION_MS = 14400;
  var GRIP = 0.5;
  var LANES = [54, 140, 226];
  var BASE_Y = 145;
  var RANK_AMPLITUDE = 26;
  var SLOW_MSG_AFTER = 15000;
  var STEP_MS = 2400;
  var STEPS = ['Verifying data…', 'Computing ranks…', 'Sorting positions…'];

  // Same names as the Rank hub boards in index.html (+ Best Earning)
  var MILESTONES = [
    { icon: '1',    title: 'Best Duty',    sub: 'Highest duty hours' },
    { icon: '2',    title: 'Best OT',      sub: 'Highest overtime hours' },
    { icon: 'Tk',   title: 'Best Earning', sub: 'Highest OT allowance' },
    { icon: '4:30', title: 'Top 4:30pm',   sub: 'Most 4:30 pm days' },
    { icon: 'OT',   title: 'Most OT Days', sub: 'Most days with overtime' },
    { icon: 'H',    title: 'Holiday Duty', sub: 'Most day-off duty days' },
    { icon: 'N',    title: 'Night Duty',   sub: 'Most night shifts' },
    { icon: '↓D',   title: 'Less Duty',    sub: 'Lowest duty hours' },
    { icon: '↓O',   title: 'Less OT',      sub: 'Lowest overtime hours' }
  ];
  var MILESTONE_GAP = TOTAL_SCROLL / MILESTONES.length;

  var CLIMBERS = [
    { x: LANES[0], phase: 0.00, lead: 0 / 3, shirt: '#0d9488', shirtDark: '#0f766e', skin: '#f0c9a0', skinDark: '#d9ab80', hair: '#2a1a08', pants: '#1e293b', pantsDark: '#0f172a', shoe: '#0a0e14' },
    { x: LANES[1], phase: 0.66, lead: 1 / 3, shirt: '#2563eb', shirtDark: '#1d4ed8', skin: '#d4a574', skinDark: '#b88a5c', hair: '#0a0a0a', pants: '#1f2937', pantsDark: '#0f172a', shoe: '#0f172a' },
    { x: LANES[2], phase: 0.33, lead: 2 / 3, shirt: '#ea580c', shirtDark: '#c2410c', skin: '#e8b88c', skinDark: '#c99a70', hair: '#1a0a05', pants: '#111827', pantsDark: '#0a0e14', shoe: '#1e1b4b' }
  ];

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var FONT = "'Hind Siliguri','Inter','Noto Sans Bengali',sans-serif";
  var uid = 0;

  var root = null, rungLayer, milestoneLayer, rigs = [];
  var rafId = null, lastTime = null, phase = 0, startedAt = 0, stepIdx = -1, slowShown = false;
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }

  function el(tag, attrs, parent) {
    var n = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function addMilestoneCard(m, y, id) {
    var g = el('g', { transform: 'translate(342,' + y + ')' }, milestoneLayer);
    el('rect', { x: -76, y: -21, width: 152, height: 46, rx: 5, fill: '#6b3e17', filter: 'url(#' + id + '-sh)' }, g);
    el('rect', { x: -76, y: -23, width: 152, height: 44, rx: 5, fill: 'url(#' + id + '-pl)', stroke: '#5d3411', 'stroke-width': 1 }, g);
    el('line', { x1: -72, y1: -21.5, x2: 72, y2: -21.5, stroke: '#dca66c', 'stroke-width': 1.2, opacity: 0.7 }, g);
    el('line', { x1: -68, y1: -11, x2: 68, y2: -11, stroke: '#6b3e17', 'stroke-width': 0.8, opacity: 0.25 }, g);
    el('line', { x1: -60, y1: 12, x2: 64, y2: 12, stroke: '#6b3e17', 'stroke-width': 0.8, opacity: 0.25 }, g);
    [[-70, -16], [70, -16], [-70, 14], [70, 14]].forEach(function (p) {
      el('circle', { cx: p[0], cy: p[1], r: 2, fill: '#3f2a1d' }, g);
    });
    el('rect', { x: -65, y: -15, width: 28, height: 28, rx: 4, fill: '#5d3411', stroke: '#7c4b20', 'stroke-width': 1 }, g);
    el('text', { x: -51, y: 3.5, 'text-anchor': 'middle', 'font-family': FONT, 'font-weight': '700', 'font-size': m.icon.length > 2 ? '10px' : '12px', fill: '#fde68a' }, g).textContent = m.icon;
    el('text', { x: -31, y: -3, 'font-family': FONT, 'font-weight': '700', 'font-size': '12.5px', fill: '#fff8eb' }, g).textContent = m.title;
    el('text', { x: -31, y: 10, 'font-family': FONT, 'font-weight': '500', 'font-size': '9px', fill: '#f5dfc0' }, g).textContent = m.sub;
  }

  function buildClimber(cfg, layer) {
    var g = el('g', {}, layer), e = {};
    var lim = function (c, w) { return { fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }; };
    e.shadow = el('ellipse', { rx: 20, ry: 4, fill: 'rgba(0,0,0,0.10)' }, g);
    e.legL = el('path', lim(cfg.pantsDark, 7), g);
    e.legR = el('path', lim(cfg.pants, 7), g);
    e.footL = el('ellipse', { rx: 6, ry: 3.5, fill: cfg.shoe }, g);
    e.footR = el('ellipse', { rx: 6, ry: 3.5, fill: cfg.shoe }, g);
    e.armL = el('path', lim(cfg.shirtDark, 6.5), g);
    e.armR = el('path', lim(cfg.shirt, 6.5), g);
    e.handL = el('circle', { r: 4, fill: cfg.skin }, g);
    e.handR = el('circle', { r: 4, fill: cfg.skin }, g);
    e.torso = el('path', { fill: cfg.shirt }, g);
    e.torsoShade = el('path', { fill: cfg.shirtDark, opacity: 0.5 }, g);
    e.head = el('g', {}, g);
    el('circle', { r: 9.5, fill: cfg.skinDark }, e.head);
    el('circle', { r: 8.5, fill: cfg.skin, cy: -0.5 }, e.head);
    el('path', { fill: cfg.hair, d: 'M -9 -1 Q -9.5 -8 -3 -10 L 3 -10 Q 9.5 -8 9 -1 Q 10 3 8 6 L 8 2 Q 4 5 -4 5 L -8 2 L -8 6 Q -10 3 -9 -1 Z' }, e.head);
    return { cfg: cfg, els: e };
  }

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
    return 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Q ' + ((x1 + x2) / 2 + (-dy / len) * mag * s).toFixed(1) + ' ' + ((y1 + y2) / 2 + (dx / len) * mag * s).toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
  }
  function set(n, a, v) { n.setAttribute(a, v); }

  function renderClimber(rig, gp) {
    var cfg = rig.cfg, e = rig.els, cx = cfg.x;
    var p = ((gp * CLIMB_CYCLES + cfg.phase) % 1 + 1) % 1;
    var leadP = ((gp * 2 - cfg.lead) % 1 + 1) % 1;
    var surge = -RANK_AMPLITUDE * Math.sin(2 * Math.PI * leadP);
    var bob = -1.5 * Math.abs(Math.sin(p * Math.PI * 4));
    var sway = 2.0 * Math.sin(p * Math.PI * 2);
    var baseY = BASE_Y + surge + bob, hipX = cx + sway, shX = hipX + sway * 0.35, shY = baseY - 20;
    var hLx = cx - 18, hLy = baseY + handY(p), hRx = cx + 18, hRy = baseY + handY(p + 0.5);
    var fLx = cx - 8, fLy = baseY + footY(p + 0.5), fRx = cx + 8, fRy = baseY + footY(p);
    set(e.armL, 'd', limb(shX - 8, shY + 2, hLx, hLy, (cx - shX) * 0.15, 3));
    set(e.armR, 'd', limb(shX + 8, shY + 2, hRx, hRy, (cx - shX) * 0.15, 3));
    set(e.legL, 'd', limb(hipX - 5, baseY + 1, fLx, fLy, (cx - hipX) * 0.2, 3));
    set(e.legR, 'd', limb(hipX + 5, baseY + 1, fRx, fRy, (cx - hipX) * 0.2, 3));
    set(e.handL, 'cx', hLx); set(e.handL, 'cy', hLy); set(e.handR, 'cx', hRx); set(e.handR, 'cy', hRy);
    set(e.footL, 'cx', fLx); set(e.footL, 'cy', fLy); set(e.footR, 'cx', fRx); set(e.footR, 'cy', fRy);
    var sL = shX - 9.5, sR = shX + 9.5, bL = hipX - 7.5, bR = hipX + 7.5;
    set(e.torso, 'd', 'M ' + sL + ' ' + (shY - 3) + ' Q ' + (sL - 1) + ' ' + (shY + 5) + ' ' + bL + ' ' + (baseY + 2) + ' L ' + bR + ' ' + (baseY + 2) + ' Q ' + (sR + 1) + ' ' + (shY + 5) + ' ' + sR + ' ' + (shY - 3) + ' Z');
    set(e.torsoShade, 'd', 'M ' + shX + ' ' + (shY - 3) + ' L ' + sR + ' ' + (shY - 3) + ' Q ' + (sR + 1) + ' ' + (shY + 5) + ' ' + bR + ' ' + (baseY + 2) + ' L ' + hipX + ' ' + (baseY + 2) + ' Z');
    set(e.head, 'transform', 'translate(' + (hipX + sway * 0.5) + ',' + (baseY - 30) + ') rotate(' + (Math.sin(p * Math.PI * 2) * 6) + ')');
    set(e.shadow, 'cx', cx); set(e.shadow, 'cy', baseY + footY(p) * 0.5 + 34);
  }

  function renderFrame(ph) {
    var ty = ph * TOTAL_SCROLL;
    set(rungLayer, 'transform', 'translate(0,' + (ty % RUNG_GAP).toFixed(2) + ')');
    set(milestoneLayer, 'transform', 'translate(0,' + ty.toFixed(2) + ')');
    for (var i = 0; i < rigs.length; i++) renderClimber(rigs[i], ph);
  }

  function mount(host) {
    if (root || !host) return;
    var id = 'rkl' + (++uid);
    var svg = el('svg', { viewBox: '0 0 430 240', class: 'rkl-svg', role: 'img', 'aria-label': 'Climbers scaling rope ladders beside ranking milestone boards' });
    var defs = el('defs', null, svg);
    var fg = el('linearGradient', { id: id + '-fg', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    [['0%', 0], ['12%', 1], ['88%', 1], ['100%', 0]].forEach(function (s) {
      el('stop', { offset: s[0], 'stop-color': '#fff', 'stop-opacity': s[1] }, fg);
    });
    var mask = el('mask', { id: id + '-mk' }, defs);
    el('rect', { x: 0, y: 0, width: 430, height: 240, fill: 'url(#' + id + '-fg)' }, mask);
    var pl = el('linearGradient', { id: id + '-pl', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    [['0%', '#b97f45'], ['55%', '#9e6631'], ['100%', '#845122']].forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, pl); });
    var po = el('linearGradient', { id: id + '-po', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    [['0%', '#7c4b20'], ['45%', '#9c6430'], ['100%', '#6b3e17']].forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, po); });
    var rung = el('g', { id: id + '-rg' }, defs);
    el('rect', { x: -25, y: -3, width: 50, height: 6, rx: 3, fill: '#8c5a2b' }, rung);
    el('rect', { x: -25, y: -3, width: 50, height: 2, rx: 1, fill: '#b8895a', opacity: 0.7 }, rung);
    el('line', { x1: -20, y1: 0.5, x2: 20, y2: 0.5, stroke: '#6b4420', 'stroke-width': 0.8, opacity: 0.45 }, rung);
    [-25, 25].forEach(function (x) {
      el('circle', { cx: x, cy: 0, r: 3.4, fill: '#9b7038' }, rung);
      el('circle', { cx: x, cy: 0, r: 1.4, fill: '#6b4420', opacity: 0.6 }, rung);
    });
    var f = el('filter', { id: id + '-sh', x: '-10%', y: '-15%', width: '125%', height: '135%' }, defs);
    el('feDropShadow', { dx: 0, dy: 2.5, stdDeviation: 2.5, 'flood-color': '#3b230d', 'flood-opacity': 0.22 }, f);

    var ticks = el('g', {}, svg);
    [[8, 60], [11, 100], [8, 140], [11, 180]].forEach(function (t) {
      el('line', { x1: t[0], y1: t[1], x2: 16, y2: t[1], class: 'rkl-tick' }, ticks);
    });

    var scene = el('g', { mask: 'url(#' + id + '-mk)' }, svg);
    var ropes = el('g', { stroke: '#c49556', 'stroke-width': 4.2, 'stroke-linecap': 'round' }, scene);
    [30, 78, 116, 164, 202, 250].forEach(function (x) { el('line', { x1: x, y1: -20, x2: x, y2: 260 }, ropes); });
    rungLayer = el('g', {}, scene);
    for (var y = -RUNG_GAP; y <= 288; y += RUNG_GAP) {
      LANES.forEach(function (cx) {
        var u = el('use', { href: '#' + id + '-rg', transform: 'translate(' + cx + ',' + y + ')' }, rungLayer);
        u.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + id + '-rg');
      });
    }
    el('rect', { x: 336, y: -20, width: 12, height: 280, rx: 3, fill: 'url(#' + id + '-po)' }, scene);
    el('line', { x1: 339, y1: -20, x2: 339, y2: 260, stroke: '#b87e46', 'stroke-width': 1, opacity: 0.45 }, scene);
    milestoneLayer = el('g', {}, scene);
    MILESTONES.forEach(function (m, i) {
      var my = 120 - i * MILESTONE_GAP;
      addMilestoneCard(m, my, id);
      addMilestoneCard(m, my - TOTAL_SCROLL, id);
      if (my + TOTAL_SCROLL < 320) addMilestoneCard(m, my + TOTAL_SCROLL, id);
    });
    var climbers = el('g', {}, svg);
    rigs = CLIMBERS.map(function (c) { return buildClimber(c, climbers); });

    host.appendChild(svg);
    root = host;
    renderFrame(phase);
  }

  function isVisible() {
    return !!(root && root.isConnected && root.getClientRects().length > 0 && !document.hidden);
  }

  function setText(id, t) { var n = document.getElementById(id); if (n && n.innerText !== t) n.innerText = t; }

  function updateText(now) {
    var el_ = now - startedAt;
    var i = Math.min(STEPS.length - 1, Math.floor(el_ / STEP_MS));
    if (i !== stepIdx) { stepIdx = i; setText('lbScanCounter', STEPS[i]); }
    if (!slowShown && el_ > SLOW_MSG_AFTER) { slowShown = true; setText('lbScanHint', 'Slow connection, please wait…'); }
  }

  function tick(now) {
    rafId = null;
    if (!isVisible()) { lastTime = null; return; }   // self-pause (card hidden / tab in background)
    if (lastTime !== null) {
      phase = (phase + ((now - lastTime) / BASE_DURATION_MS)) % 1;
      renderFrame(phase);
    }
    lastTime = now;
    updateText(now);
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (!root) mount(document.getElementById('rklStage'));
    if (!root) return;
    startedAt = performance.now(); stepIdx = -1; slowShown = false; lastTime = null;
    setText('lbScanCounter', STEPS[0]);
    setText('lbScanHint', 'Please wait a moment');
    if (reduced) { renderFrame(0.12); return; }
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    lastTime = null;
  }

  // Resume after tab returns to foreground while the card is still showing
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && root && !reduced && rafId === null && root.getClientRects().length > 0) rafId = requestAnimationFrame(tick);
  });

  window.RankLoader = { mount: mount, start: start, stop: stop };
})();
