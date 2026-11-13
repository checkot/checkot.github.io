/* ==========================================================================
   ADMIN-SHIFT.JS - "Shift Hours" admin pane (Early Exit / Gate Pass rules)
   --------------------------------------------------------------------------
   Controls which Out time counts as "left early" for every date:
     - Normal hours (default 08:00 - 16:30, grace 10 min)
     - Special periods with their own hours (Ramadan, one-day early release, ...)
   Saved to shift-rules.json on the server (same Server Access Key as every other admin save).
   Engine: js/calculations/early-exit.js
   ========================================================================== */
(function () {
  'use strict';

  var D = null;            // draft rules being edited
  var saved = '';          // JSON string of the last saved / loaded rules
  var loading = false;

  function $(id) { return document.getElementById(id); }
  function E(s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function toast(m, t) { try { showToast(m, t || 'info'); } catch (e) { } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function setStatus(msg, color) { var el = $('admShiftStatus'); if (!el) return; el.textContent = msg || ''; el.style.color = color || ''; }
  function isDirty() { return D && JSON.stringify(window.normalizeShiftRules(D)) !== saved; }

  function load() {
    if (loading) return Promise.resolve();
    loading = true;
    setStatus('Loading shift rules from server…', 'var(--brand-text)');
    return fetchJsonResource('shift-rules.json').then(function (j) {
      D = clone(window.normalizeShiftRules(j));
      setStatus('', '');
    }).catch(function () {
      D = clone(window.getShiftRules());
      setStatus('shift-rules.json was not found on the server yet - showing the built-in rules. Press "Save to server" to create it.', 'var(--warning)');
    }).then(function () {
      saved = JSON.stringify(window.normalizeShiftRules(D));
      loading = false;
      render();
    });
  }

  /* ---------- render ---------- */
  function periodRow(p, i) {
    var depts = (p.depts && p.depts.length) ? p.depts[0] : '';
    return '<div class="admsh-row" data-i="' + i + '">' +
      '<label class="admsh-f admsh-f--wide"><span>Name</span><input type="text" value="' + E(p.label) + '" oninput="AdminShift.setP(' + i + ',\'label\',this.value)"></label>' +
      '<label class="admsh-f"><span>From</span><input type="date" value="' + E(p.from) + '" onchange="AdminShift.setP(' + i + ',\'from\',this.value)"></label>' +
      '<label class="admsh-f"><span>To</span><input type="date" value="' + E(p.to) + '" onchange="AdminShift.setP(' + i + ',\'to\',this.value)"></label>' +
      '<label class="admsh-f"><span>Duty starts</span><input type="time" value="' + E(p.start) + '" onchange="AdminShift.setP(' + i + ',\'start\',this.value)"></label>' +
      '<label class="admsh-f"><span>Duty ends</span><input type="time" value="' + E(p.end) + '" onchange="AdminShift.setP(' + i + ',\'end\',this.value)"></label>' +
      '<label class="admsh-f admsh-f--sm"><span>Grace (min)</span><input type="number" min="0" max="120" value="' + E(p.graceMin) + '" oninput="AdminShift.setP(' + i + ',\'graceMin\',this.value)"></label>' +
      '<label class="admsh-f admsh-f--sm"><span>Department</span><select onchange="AdminShift.setP(' + i + ',\'depts\',this.value)">' +
        '<option value=""' + (depts === '' ? ' selected' : '') + '>All</option><option value="PR"' + (depts === 'PR' ? ' selected' : '') + '>PR</option><option value="QA"' + (depts === 'QA' ? ' selected' : '') + '>QA</option></select></label>' +
      '<button type="button" class="ax-btn ax-btn--danger ax-btn--sm" onclick="AdminShift.removeP(' + i + ')">Delete</button>' +
      '</div>';
  }

  function render() {
    var root = $('admShiftRoot'); if (!root || !D) return;
    var d = D.default;
    root.innerHTML =
      '<div class="ax-card">' +
        '<h3 class="ax-card-title">Normal duty hours</h3>' +
        '<p class="ax-muted">A person who punches Out earlier than <b>Duty ends − Grace</b> on a regular day is counted as an Early Exit / Gate Pass. Weekly-off, holiday, OT, night and DN days are never counted.</p>' +
        '<div class="admsh-row">' +
          '<label class="admsh-f"><span>Duty starts</span><input type="time" value="' + E(d.start) + '" onchange="AdminShift.setD(\'start\',this.value)"></label>' +
          '<label class="admsh-f"><span>Duty ends</span><input type="time" value="' + E(d.end) + '" onchange="AdminShift.setD(\'end\',this.value)"></label>' +
          '<label class="admsh-f admsh-f--sm"><span>Grace (min)</span><input type="number" min="0" max="120" value="' + E(d.graceMin) + '" oninput="AdminShift.setD(\'graceMin\',this.value)"></label>' +
          '<label class="admsh-f admsh-f--sm"><span>Shift codes counted</span><input type="text" value="' + E((D.allowedShiftCodes || []).join(', ')) + '" oninput="AdminShift.setCodes(this.value)"></label>' +
        '</div>' +
      '</div>' +

      '<div class="ax-card">' +
        '<div class="ax-card-head"><h3 class="ax-card-title">Special shift periods</h3>' +
          '<button type="button" class="ax-btn ax-btn--ghost ax-btn--sm" onclick="AdminShift.addP()">+ Add period</button></div>' +
        '<p class="ax-muted">Use this for Ramadan (it can start in one month and end in the next), or a single day when the whole plant is released early. Inside a period, the period\'s hours replace the normal hours. If two periods overlap, the lower one wins. Real early exits <b>inside</b> a short Ramadan shift are still detected.</p>' +
        (D.periods.length ? D.periods.map(periodRow).join('') : '<div class="ax-muted" style="padding:8px 0;">No special period. Every day uses the normal hours.</div>') +
      '</div>' +

      '<div class="ax-card">' +
        '<div class="ax-card-head"><h3 class="ax-card-title">Suggest from punch data</h3>' +
          '<button type="button" class="ax-btn ax-btn--ghost ax-btn--sm" id="admShiftSuggestBtn" onclick="AdminShift.suggest()">Scan last 14 months</button></div>' +
        '<p class="ax-muted">Finds stretches of days where almost everyone left at a different time (Ramadan) and single days when many people left together (plant-wide early release). Nothing changes until you press Add.</p>' +
        '<div id="admShiftSuggestOut"></div>' +
      '</div>' +

      '<div class="ax-card">' +
        '<div class="ax-card-head"><h3 class="ax-card-title">Check a month (preview)</h3></div>' +
        '<div class="admsh-row">' +
          '<label class="admsh-f"><span>Month</span><input type="month" id="admShiftPreviewMonth" value="' + E(defaultPreviewMonth()) + '"></label>' +
          '<button type="button" class="ax-btn ax-btn--ghost ax-btn--sm" onclick="AdminShift.preview()">Count early exits</button>' +
        '</div>' +
        '<div id="admShiftPreviewOut" class="ax-muted"></div>' +
      '</div>';
    refreshDirty();
  }
  function defaultPreviewMonth() { var n = new Date(); n.setMonth(n.getMonth() - 1); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2); }
  function refreshDirty() {
    var b = $('admShiftSaveBtn'); if (b) b.textContent = isDirty() ? 'Save to server •' : 'Save to server';
  }

  /* ---------- edit handlers ---------- */
  var api = {
    show: function () { if (!D) load(); else render(); },
    setD: function (k, v) {
      if (k === 'graceMin') D.default.graceMin = Math.max(0, parseInt(v, 10) || 0); else D.default[k] = v;
      refreshDirty();
    },
    setCodes: function (v) { D.allowedShiftCodes = String(v).split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean); refreshDirty(); },
    setP: function (i, k, v) {
      var p = D.periods[i]; if (!p) return;
      if (k === 'graceMin') p.graceMin = Math.max(0, parseInt(v, 10) || 0);
      else if (k === 'depts') p.depts = v ? [v] : [];
      else p[k] = v;
      refreshDirty();
    },
    addP: function (preset) {
      var t = new Date().toISOString().slice(0, 10);
      D.periods.push(Object.assign({ id: 'p-' + Date.now(), label: 'New period', from: t, to: t, start: D.default.start, end: '14:15', graceMin: D.default.graceMin, depts: [] }, preset || {}));
      render();
    },
    removeP: function (i) { D.periods.splice(i, 1); render(); },

    suggest: function () {
      var btn = $('admShiftSuggestBtn'), out = $('admShiftSuggestOut');
      if (btn) btn.disabled = true;
      if (out) out.innerHTML = '<div class="ax-muted">Reading punch data… this can take a few seconds.</div>';
      var months = [], n = new Date();
      for (var i = 0; i < 14; i++) { var d = new Date(n.getFullYear(), n.getMonth() - i, 1); months.push(d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2)); }
      // Suggestions are computed against the NORMAL hours only, so temporarily ignore draft periods
      var prev = window.getShiftRules();
      Promise.all(months.map(function (m) { return fetchMonthPreIndexedData(m).catch(function () { return null; }); })).then(function (lists) {
        window.setShiftRules({ default: D.default, allowedShiftCodes: D.allowedShiftCodes, periods: [] }, { persist: false });
        var res = [];
        try { res = window.suggestShiftPeriods(lists.filter(Array.isArray)); } finally { window.setShiftRules(prev, { persist: false }); }
        window.__admShiftSuggest = res;
        if (!res.length) { out.innerHTML = '<div class="ax-muted">Nothing unusual found. All scanned days follow the normal hours.</div>'; return; }
        out.innerHTML = res.map(function (p, i) {
          var covered = D.periods.some(function (q) { return q.from === p.from && q.to === p.to; });
          return '<div class="admsh-sug"><div><b>' + E(p.label) + '</b> · ' + E(p.from) + (p.to !== p.from ? ' → ' + E(p.to) : '') + ' · ends <b>' + E(p.end) + '</b>' +
            '<div class="ax-muted">' + E(p.evidence) + '</div></div>' +
            '<button type="button" class="ax-btn ax-btn--ghost ax-btn--sm"' + (covered ? ' disabled' : '') + ' onclick="AdminShift.addSuggested(' + i + ')">' + (covered ? 'Added' : 'Add') + '</button></div>';
        }).join('');
      }).catch(function (e) {
        if (out) out.innerHTML = '<div style="color:var(--danger)">Could not read the data: ' + E(e && e.message || e) + '</div>';
      }).then(function () { if (btn) btn.disabled = false; });
    },
    addSuggested: function (i) {
      var p = (window.__admShiftSuggest || [])[i]; if (!p) return;
      D.periods.push({ id: p.id + '-' + Date.now(), label: p.label, from: p.from, to: p.to, start: p.start, end: p.end, graceMin: p.graceMin, depts: [] });
      render();
      toast('Period added. Review the name and times, then press "Save to server".', 'success');
    },

    preview: function () {
      var m = ($('admShiftPreviewMonth') || {}).value, out = $('admShiftPreviewOut');
      if (!m) { toast('Pick a month', 'warn'); return; }
      out.textContent = 'Counting…';
      fetchMonthPreIndexedData(m).then(function (list) {
        if (!Array.isArray(list)) { out.textContent = 'No data found for ' + m + '.'; return; }
        var prev = window.getShiftRules();
        var count = function (rules) {
          window.setShiftRules(rules, { persist: false });
          var days = 0, ppl = 0;
          list.forEach(function (e) { var x = window.computeEmpEarlyExits(e); if (x.length) { ppl++; days += x.length; } });
          return { days: days, ppl: ppl };
        };
        var withRules, without;
        try {
          withRules = count(D);
          without = count({ default: D.default, allowedShiftCodes: D.allowedShiftCodes, periods: [] });
        } finally { window.setShiftRules(prev, { persist: false }); }
        out.innerHTML = '<div><b>' + withRules.days + '</b> early-exit days by <b>' + withRules.ppl + '</b> people with these rules.</div>' +
          (without.days !== withRules.days ? '<div>Without the special periods it would have been ' + without.days + ' days by ' + without.ppl + ' people (' + (without.days - withRules.days) + ' false alarms avoided).</div>' : '<div>The special periods do not change this month.</div>');
      }).catch(function (e) { out.textContent = 'Problem: ' + (e && e.message || e); });
    },

    save: function () {
      var btn = $('admShiftSaveBtn');
      var norm = window.normalizeShiftRules(D);
      // validation
      for (var i = 0; i < D.periods.length; i++) {
        var p = D.periods[i];
        if (!p.from || !p.to || p.to < p.from) { setStatus('Period "' + (p.label || i + 1) + '": the To date must be on or after the From date.', 'var(--danger)'); return; }
        if (!p.end || !/^\d{1,2}:\d{2}$/.test(p.end)) { setStatus('Period "' + (p.label || i + 1) + '": set the Duty ends time.', 'var(--danger)'); return; }
      }
      if (norm.periods.length !== D.periods.length) { setStatus('One of the periods has an invalid date or time. Please check every row.', 'var(--danger)'); return; }
      if (norm.default.end <= norm.default.start) { setStatus('Normal Duty ends must be after Duty starts.', 'var(--danger)'); return; }
      norm.updatedAt = new Date().toISOString();
      if (btn) btn.disabled = true;
      setStatus('Saving shift-rules.json to RPPF Cloud Server…', 'var(--brand-text)');
      githubPutFile('shift-rules.json', utf8ToBase64(JSON.stringify(norm, null, 2) + '\n'), 'Update shift-rules.json via RPPF Admin Panel')
        .then(function () {
          window.setShiftRules(norm);
          D = clone(window.normalizeShiftRules(norm));
          saved = JSON.stringify(window.normalizeShiftRules(D));
          setStatus('Saved. Early Exit now uses these hours on every device (phones refresh within a few minutes).', 'var(--success)');
          toast('shift-rules.json was successfully saved to the server', 'success');
          render();
        }).catch(function (err) {
          setStatus('Problem: ' + (err && err.message || err), 'var(--danger)');
          toast(err && err.message || 'Save failed', 'error');
        }).then(function () { if (btn) btn.disabled = false; refreshDirty(); });
    },
    reload: function () { D = null; saved = ''; loading = false; load(); }
  };
  window.AdminShift = api;
})();
