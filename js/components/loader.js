/**
 * CheckotLoader — Interactive Fullscreen Month & Search Loader
 * Exactly matching user reference checkot-loader.html
 * - Fullscreen calendar card with animated date blinking
 * - Circular orbiting & floating vintage solar calculator (Model 77)
 * - Safe for infinite month switches & zero CPU overhead when idle
 */
(function () {
  'use strict';

  var COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
  var WEEK_START = 6;   // Saturday
  var STEP = 110;      // ms between dates
  var BLINK = 1400;    // date blink duration
  var GAP = 350;       // pause between groups
  var SLOW_MSG_AFTER = 15000; // slow internet warning threshold
  var KEY_MS = 240;    // calculator key press interval

  var timers = [];
  var isRunning = false;
  var g = 0;
  var colorIdx = 0;
  var cells = [];
  var groups = [];
  var keysInited = false;

  function clearAllTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function later(fn, ms) {
    if (!isRunning) return;
    timers.push(setTimeout(fn, ms));
  }

  function blink(el) {
    if (!el) return;
    el.style.setProperty('--c', COLORS[(colorIdx++) % COLORS.length]);
    el.classList.remove('blink');
    void el.offsetWidth;
    el.classList.add('blink');
    later(function () {
      if (el) el.classList.remove('blink');
    }, BLINK);
  }

  function setupCalendar(monthStr) {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();

    if (monthStr && typeof monthStr === 'string' && monthStr.includes('-')) {
      var parts = monthStr.split('-');
      var py = parseInt(parts[0], 10);
      var pm = parseInt(parts[1], 10) - 1;
      if (!isNaN(py) && !isNaN(pm) && pm >= 0 && pm <= 11) {
        y = py;
        m = pm;
      }
    }

    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var offset = (new Date(y, m, 1).getDay() - WEEK_START + 7) % 7;

    var title = '';
    try {
      title = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch (e) {
      title = (m + 1) + '/' + y;
    }

    var titleEl = document.getElementById('ckTitle');
    if (titleEl) titleEl.textContent = title;

    var grid = document.getElementById('ckGrid');
    if (!grid) return [];

    var html = '';
    for (var i = 0; i < 7; i++) {
      var wd = '';
      try {
        wd = new Date(2023, 0, 1 + ((WEEK_START + i) % 7)).toLocaleDateString('en-US', { weekday: 'short' });
      } catch (e) {
        wd = '';
      }
      html += '<span class="ck-wd">' + wd + '</span>';
    }
    for (var j = 0; j < offset; j++) {
      html += '<span></span>';
    }
    for (var d = 1; d <= daysInMonth; d++) {
      html += '<span class="ck-day">' + d + '</span>';
    }
    grid.innerHTML = html;

    // Distribute rows evenly across available screen height
    var weeks = Math.ceil((offset + daysInMonth) / 7);
    grid.style.gridTemplateRows = 'auto repeat(' + weeks + ', 1fr)';

    return Array.prototype.slice.call(grid.querySelectorAll('.ck-day'));
  }

  function initCalculatorKeys() {
    if (keysInited) return;
    keysInited = true;
    var keysEl = document.getElementById('ckKeys');
    if (!keysEl) return;
    var layout = [
      ['7', '8', '9', '÷', '×', 'C'],
      ['4', '5', '6', '−', '+', '='],
      ['1', '2', '3', '0', '.', '±']
    ];
    var kh = '';
    layout.forEach(function (row) {
      row.forEach(function (k) {
        var cls = 'ck-key';
        if ('÷×−+'.indexOf(k) > -1) cls += ' op';
        else if (k === 'C') cls += ' clr';
        else if (k === '=') cls += ' eq';
        kh += '<span class="' + cls + '" data-k="' + k + '">' + k + '</span>';
      });
    });
    keysEl.innerHTML = kh;
  }

  function pressKey(k) {
    var keysEl = document.getElementById('ckKeys');
    if (!keysEl) return;
    var el = keysEl.querySelector('[data-k="' + k + '"]');
    if (!el) return;
    el.classList.add('pressed');
    later(function () {
      el.classList.remove('pressed');
    }, 130);
  }

  function rnd(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function revealLcd(text) {
    var lcd = document.getElementById('ckLcd');
    if (!lcd) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      lcd.textContent = text;
      return;
    }
    var f = 0;
    var total = 6 + text.length * 3;
    (function frame() {
      if (!isRunning) return;
      var out = '';
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        out += (f >= 6 + i * 3 || ch === '.' || ch === '-') ? ch : rnd(0, 9);
      }
      lcd.textContent = out;
      if (f < total) {
        f++;
        later(frame, 45);
      }
    })();
  }

  function calcRound() {
    var lcd = document.getElementById('ckLcd');
    if (!lcd) return;
    var op = ['+', '−', '×', '÷'][rnd(0, 3)];
    var a = rnd(12, 999);
    var b = rnd(2, 99);
    var res = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b;
    var text = String(Math.round(res * 100) / 100);
    var t = 0;

    function key(k, show) {
      later(function () {
        pressKey(k);
        if (show !== undefined && lcd) lcd.textContent = show;
      }, t);
      t += KEY_MS;
    }

    var s = String(a);
    for (var i = 0; i < s.length; i++) key(s.charAt(i), s.slice(0, i + 1));
    key(op);
    s = String(b);
    for (var j = 0; j < s.length; j++) key(s.charAt(j), s.slice(0, j + 1));

    later(function () {
      pressKey('=');
      revealLcd(text);
    }, t);

    t += KEY_MS + 1300;
    later(function () {
      pressKey('C');
      if (lcd) lcd.textContent = '0';
    }, t);

    t += 600;
    later(calcRound, t);
  }

  function startGroupAnimation() {
    if (!cells.length || !groups.length) return;
    var r = groups[g];
    var n = r[1] - r[0] + 1;

    cells.forEach(function (c, idx) {
      var d = idx + 1;
      c.classList.toggle('dim', d < r[0] || d > r[1]);
    });

    for (var k = 0; k < n; k++) {
      (function (k) {
        later(function () {
          if (cells[r[0] - 1 + k]) blink(cells[r[0] - 1 + k]);
        }, k * STEP);
      })(k);
    }

    later(function () {
      g = (g + 1) % groups.length;
      startGroupAnimation();
    }, (n - 1) * STEP + BLINK + GAP);
  }

  function show(monthStr) {
    var root = document.getElementById('ckLoader');
    if (!root) return;

    clearAllTimers();
    isRunning = true;
    g = 0;
    colorIdx = 0;

    initCalculatorKeys();
    cells = setupCalendar(monthStr || (typeof currentMonth !== 'undefined' ? currentMonth : null));
    var daysInMonth = cells.length;
    groups = [
      [1, Math.min(10, daysInMonth)],
      [11, Math.min(20, daysInMonth)],
      [21, daysInMonth]
    ];

    var statusEl = document.getElementById('ckStatus');
    if (statusEl) statusEl.innerHTML = 'Calculating<span class="ck-dots"><i>.</i><i>.</i><i>.</i></span>';

    var lcd = document.getElementById('ckLcd');
    if (lcd) lcd.textContent = '0';

    root.style.display = 'flex';
    void root.offsetWidth;
    root.classList.remove('ck-hide');

    startGroupAnimation();
    calcRound();

    later(function () {
      if (statusEl) statusEl.textContent = 'Slow connection, please wait…';
    }, SLOW_MSG_AFTER);
  }

  function hide() {
    var root = document.getElementById('ckLoader');
    if (!root) return;
    if (!isRunning && root.classList.contains('ck-hide')) return;

    isRunning = false;
    clearAllTimers();
    root.classList.add('ck-hide');

    setTimeout(function () {
      if (!isRunning) {
        root.style.display = 'none';
      }
    }, 460);
  }

  window.CheckotLoader = {
    show: show,
    hide: hide
  };
})();
