/* ==========================================================================
   ADMIN-ACCESS.JS - Manager & In-Charge Access Management Tab
   Supports Create / Assign / Modify / Deactivate / Delete / PIN Reset
   Enforces Department Scoping (PR / QA / dev), Salted SHA-256 Hashing
   ========================================================================== */

(function () {
  'use strict';

  const S = {
    store: null,
    dept: null,        // 'PR' | 'QA' | null
    q: '',
    modal: null,       // null | { type: 'add'|'edit'|'pin', data: {...} }
    undo: null,        // { label: string, members: Array }
    saving: false
  };

  const $ = id => document.getElementById(id);
  const E = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toast = (msg, type) => { if (typeof showToast === 'function') showToast(msg, type); };

  function activeScope() {
    try {
      if (typeof getActiveAdminScope === 'function') return getActiveAdminScope();
    } catch (e) {}
    return 'PR';
  }

  function adminUser() {
    try {
      if (typeof getAdminUser === 'function') return getAdminUser().toLowerCase();
    } catch (e) {}
    return '';
  }

  function canManageDept(deptCode) {
    const user = adminUser();
    const sc = activeScope();
    if (user === 'dev' || sc === 'ALL') return true;
    return sc === deptCode;
  }

  function currentViewDept() {
    const sc = activeScope();
    if (sc === 'QA') return 'QA';
    if (sc === 'PR') return 'PR';
    return S.dept || 'PR';
  }

  function realAreasForDept(deptCode) {
    if (typeof getRealDepartmentAreas === 'function') return getRealDepartmentAreas(deptCode);
    return deptCode === 'QA' ? ['IPQC PR', 'IPQC Pack', 'Documentation', 'Executives'] : ['Solid Production', 'Softgel Production', 'Packing Hall', 'Overall'];
  }

  async function loadAccessData() {
    if (S.store) return S.store;
    try {
      const cached = localStorage.getItem(typeof ACCESS_CACHE_KEY !== 'undefined' ? ACCESS_CACHE_KEY : 'renata_access_cache_v1');
      if (cached) S.store = JSON.parse(cached);
    } catch (e) {}
    try {
      const res = await fetch('access.json?ts=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        S.store = await res.json();
        try {
          localStorage.setItem(typeof ACCESS_CACHE_KEY !== 'undefined' ? ACCESS_CACHE_KEY : 'renata_access_cache_v1', JSON.stringify(S.store));
        } catch (e) {}
      }
    } catch (e) {
      console.warn('Could not fetch access.json:', e);
    }
    if (!S.store) {
      S.store = {
        version: 1,
        updatedAt: new Date().toISOString(),
        departments: {
          PR: { fallbackPinHash: '6fc43dab19ade78399334b097c9bdf461446dc51f85a3b117dc62864100e30a9', fallbackPinSalt: 'RENATA_RPPF_SECURE_SALT_2026_#$!' },
          QA: { fallbackPinHash: '6fc43dab19ade78399334b097c9bdf461446dc51f85a3b117dc62864100e30a9', fallbackPinSalt: 'RENATA_RPPF_SECURE_SALT_2026_#$!' }
        },
        members: []
      };
    }
    return S.store;
  }

  async function persistAccessStore() {
    if (!S.store) return false;
    S.store.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(typeof ACCESS_CACHE_KEY !== 'undefined' ? ACCESS_CACHE_KEY : 'renata_access_cache_v1', JSON.stringify(S.store));
      localStorage.setItem(typeof LAST_ADMIN_SYNC_KEY !== 'undefined' ? LAST_ADMIN_SYNC_KEY : 'rppf_last_admin_sync_ts', String(Date.now()));
    } catch (e) {}

    // Save to GitHub if token available
    if (typeof adminSaveAccessNow === 'function') {
      return await adminSaveAccessNow(S.store);
    }
    return true;
  }

  function render() {
    const root = $('accessMgmtRoot');
    if (!root) return;
    if (!S.store) {
      root.innerHTML = '<div class="em-loading">Loading Access Management…</div>';
      loadAccessData().then(() => render());
      return;
    }

    const sc = activeScope();
    const d = currentViewDept();
    const isDev = (adminUser() === 'dev' || sc === 'ALL');

    let members = Array.isArray(S.store.members) ? S.store.members : [];
    if (!isDev || sc !== 'ALL') {
      members = members.filter(m => m.dept === d || (m.dept === 'ALL' && isDev));
    } else if (S.dept) {
      members = members.filter(m => m.dept === S.dept);
    }

    if (S.q.trim()) {
      const q = S.q.trim().toUpperCase();
      members = members.filter(m => {
        const hay = `${m.id} ${m.name || ''} ${m.role || ''} ${(m.areas || []).join(' ')} ${m.dept}`.toUpperCase();
        return hay.includes(q);
      });
    }

    let h = '<div class="em-wrap">';
    h += '<div class="em-title">Access Management (Manager &amp; In-Charge Roles)</div>';

    // Meta bar
    h += '<div class="em-meta">';
    h += '<span class="em-pill">' + (d === 'QA' ? 'Quality Assurance (QA)' : 'Production (PR)') + '</span>';
    h += '<span>' + members.length + ' authorized members</span>';
    h += '<span class="em-spacer"></span>';

    if (isDev) {
      h += '<span class="em-seg">';
      h += '<button type="button" class="' + (S.dept === 'PR' || (!S.dept && sc === 'PR') ? 'on' : '') + '" onclick="AccessMgmt.setDept(\'PR\')">PR</button>';
      h += '<button type="button" class="' + (S.dept === 'QA' || sc === 'QA' ? 'on' : '') + '" onclick="AccessMgmt.setDept(\'QA\')">QA</button>';
      h += '<button type="button" class="' + (!S.dept && sc === 'ALL' ? 'on' : '') + '" onclick="AccessMgmt.setDept(null)">All</button>';
      h += '</span>';
    }

    h += '<button type="button" class="ax-btn ax-btn--primary ax-btn--sm" onclick="AccessMgmt.openAddModal()">+ Add In-Charge / Manager</button>';
    h += '</div>';

    // Undo alert
    if (S.undo) {
      h += '<div class="em-undo"><span>Done: ' + E(S.undo.label) + '</span><button type="button" class="em-btn" onclick="AccessMgmt.doUndo()">Undo</button></div>';
    }

    // Notice info card
    h += '<div style="background:var(--brand-soft);border:1px solid var(--brand-soft-border);color:var(--brand-text);padding:10px 14px;border-radius:8px;font-size:12.5px;line-height:1.4;">' +
      '🛡️ <strong>Client-Side Gate:</strong> Passwords and PINs are stored as <strong>salted SHA-256 hashes</strong> only. Short numeric PINs can be brute-forced offline from public repository JSON; enforce <strong>&ge;6-digit PINs</strong> for Manager and Executive accounts.' +
      '</div>';

    // Search bar
    h += '<div style="display:flex;gap:8px;align-items:center;">';
    h += '<input type="text" id="accessSearchInput" class="ax-input" placeholder="Search by name, ID or role…" value="' + E(S.q) + '" oninput="AccessMgmt.onSearch(this.value)" style="flex:1;">';
    h += '</div>';

    // Members cards
    if (members.length === 0) {
      h += '<div class="em-card" style="padding:24px;text-align:center;color:var(--muted);font-weight:600;">No authorized members found' + (S.q ? ' matching filter' : '') + '. Click "+ Add In-Charge / Manager" to grant access.</div>';
    } else {
      h += '<div style="display:flex;flex-direction:column;gap:8px;">';
      members.forEach((m, idx) => {
        const canEdit = canManageDept(m.dept);
        const isActive = m.active !== false;
        const areasStr = Array.isArray(m.areas) ? (m.areas.includes('all') ? 'All areas' : m.areas.join(', ')) : 'All';
        h += '<div class="em-row' + (isActive ? '' : ' inactive') + '" style="background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">';
        
        // Col 1: Identity
        h += '<div style="flex:1;min-width:200px;">';
        h += '<div style="display:flex;align-items:center;gap:8px;">';
        h += '<strong style="font-size:15px;color:var(--text);">' + E(m.name || m.id) + '</strong>';
        h += '<span class="em-tag id">' + E(m.id) + '</span>';
        h += '<span class="em-pill" style="font-size:11px;padding:2px 8px;background:' + (m.dept === 'QA' ? '#10b98122;color:#10b981;border-color:#10b98144' : '#3b82f622;color:#3b82f6;border-color:#3b82f644') + '">' + E(m.dept) + '</span>';
        if (!isActive) {
          h += '<span class="em-tag" style="background:var(--danger-bg);color:var(--danger);border-color:var(--danger-border);">Deactivated</span>';
        }
        h += '</div>';
        
        // Col 2: Role and scopes
        h += '<div style="font-size:12.5px;color:var(--muted);margin-top:4px;">';
        h += '<span style="font-weight:700;color:var(--text-2);">' + E(m.role || 'Floor In-Charge') + '</span>';
        h += ' • Areas: <b>' + E(areasStr) + '</b>';
        if (m.canViewExecutives) {
          h += ' • <span style="color:var(--brand);font-weight:700;">👔 Can view executives</span>';
        }
        if (m.allowNormalBypass !== false) {
          h += ' • <span style="color:var(--muted);">Normal search bypass allowed</span>';
        }
        h += '</div>';
        h += '</div>';

        // Col 3: Actions
        if (canEdit) {
          h += '<div style="display:flex;gap:6px;align-items:center;margin-left:auto;">';
          h += '<button type="button" class="ax-btn ax-btn--ghost ax-btn--sm" onclick="AccessMgmt.openSetPinModal(\'' + E(m.id) + '\', \'' + E(m.dept) + '\')">🔑 Reset PIN</button>';
          h += '<button type="button" class="ax-btn ax-btn--ghost ax-btn--sm" onclick="AccessMgmt.openEditModal(\'' + E(m.id) + '\', \'' + E(m.dept) + '\')">✏️ Edit</button>';
          h += '<button type="button" class="ax-btn ax-btn--ghost ax-btn--sm" onclick="AccessMgmt.toggleActive(\'' + E(m.id) + '\', \'' + E(m.dept) + '\')">' + (isActive ? 'Deactivate' : 'Activate') + '</button>';
          h += '<button type="button" class="ax-btn ax-btn--ghost ax-btn--sm" style="color:var(--danger);" onclick="AccessMgmt.deleteMember(\'' + E(m.id) + '\', \'' + E(m.dept) + '\')">🗑️</button>';
          h += '</div>';
        }

        h += '</div>';
      });
      h += '</div>';
    }

    h += '</div>';

    // Render active modal if any
    if (S.modal) {
      h += renderModalHtml(S.modal);
    }

    root.innerHTML = h;
  }

  function renderModalHtml(m) {
    const isAdd = (m.type === 'add');
    const isPin = (m.type === 'pin');
    const isEdit = (m.type === 'edit');
    const mem = m.data || {};
    const d = mem.dept || currentViewDept();
    const realAreas = realAreasForDept(d);

    let h = '<div class="em-modal-wrap" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;">';
    h += '<div class="em-modal-card" style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow-lg);">';
    
    if (isPin) {
      h += '<h3 style="margin-top:0;font-size:18px;">Reset / Set PIN for ' + E(mem.name || mem.id) + '</h3>';
      h += '<p style="font-size:12.5px;color:var(--muted);">Enter a new numeric PIN (min 4 digits, recommended &ge;6 digits for security). The new PIN will be shown to you once and stored only as a salted SHA-256 hash.</p>';
      h += '<div style="margin:16px 0;">';
      h += '<label style="display:block;font-weight:700;font-size:13px;margin-bottom:6px;">New PIN</label>';
      h += '<input type="password" id="modalNewPinInput" class="ax-input" placeholder="e.g. 849201" minlength="4" style="width:100%;font-size:16px;letter-spacing:2px;">';
      h += '</div>';
      h += '<div style="display:flex;justify-content:flex-end;gap:8px;">';
      h += '<button type="button" class="ax-btn ax-btn--ghost" onclick="AccessMgmt.closeModal()">Cancel</button>';
      h += '<button type="button" class="ax-btn ax-btn--primary" onclick="AccessMgmt.saveNewPin(\'' + E(mem.id) + '\', \'' + E(mem.dept) + '\')">Save Hashed PIN</button>';
      h += '</div>';
    } else {
      h += '<h3 style="margin-top:0;font-size:18px;">' + (isAdd ? 'Add New In-Charge / Manager' : 'Edit Access: ' + E(mem.name || mem.id)) + '</h3>';

      // Department
      h += '<div style="margin-bottom:12px;">';
      h += '<label style="display:block;font-weight:700;font-size:12.5px;margin-bottom:4px;">Department</label>';
      if (isAdd && canManageDept('PR') && canManageDept('QA')) {
        h += '<select id="modalDeptSelect" class="ax-select" style="width:100%;" onchange="AccessMgmt.onModalDeptChange(this.value)">';
        h += '<option value="PR"' + (d === 'PR' ? ' selected' : '') + '>Production (PR)</option>';
        h += '<option value="QA"' + (d === 'QA' ? ' selected' : '') + '>Quality Assurance (QA)</option>';
        h += '</select>';
      } else {
        h += '<input type="text" class="ax-input" value="' + E(d) + '" disabled style="width:100%;opacity:0.7;">';
        h += '<input type="hidden" id="modalDeptSelect" value="' + E(d) + '">';
      }
      h += '</div>';

      // Employee Picker (from listed employees of dept)
      h += '<div style="margin-bottom:12px;">';
      h += '<label style="display:block;font-weight:700;font-size:12.5px;margin-bottom:4px;">Employee ID &amp; Name</label>';
      if (isAdd) {
        h += '<input type="text" id="modalEmpIdInput" class="ax-input" placeholder="Search ID or name (e.g. RF20716)…" oninput="AccessMgmt.onModalEmpSearch(this.value)" style="width:100%;" autocomplete="off">';
        h += '<div id="modalEmpSuggestBox" style="margin-top:4px;max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;display:none;background:var(--surface);"></div>';
        h += '<input type="hidden" id="modalSelectedId" value="">';
        h += '<input type="hidden" id="modalSelectedName" value="">';
      } else {
        h += '<input type="text" class="ax-input" value="' + E(mem.name) + ' (' + E(mem.id) + ')" disabled style="width:100%;opacity:0.7;">';
        h += '<input type="hidden" id="modalSelectedId" value="' + E(mem.id) + '">';
        h += '<input type="hidden" id="modalSelectedName" value="' + E(mem.name) + '">';
      }
      h += '</div>';

      // Role Title
      h += '<div style="margin-bottom:12px;">';
      h += '<label style="display:block;font-weight:700;font-size:12.5px;margin-bottom:4px;">Role Title</label>';
      h += '<input type="text" id="modalRoleInput" class="ax-input" placeholder="e.g. Floor In-Charge, Section In-Charge, Manager…" value="' + E(mem.role || 'Floor In-Charge') + '" style="width:100%;">';
      h += '</div>';

      // Areas (Multi-select)
      h += '<div style="margin-bottom:12px;">';
      h += '<label style="display:block;font-weight:700;font-size:12.5px;margin-bottom:4px;">Authorized Areas</label>';
      const currentAreas = new Set(mem.areas || ['all']);
      h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">';
      h += '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12.5px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;cursor:pointer;">';
      h += '<input type="checkbox" name="modalAreas" value="all"' + (currentAreas.has('all') ? ' checked' : '') + '> All areas';
      h += '</label>';
      realAreas.forEach(a => {
        h += '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12.5px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;cursor:pointer;">';
        h += '<input type="checkbox" name="modalAreas" value="' + E(a) + '"' + (currentAreas.has(a) ? ' checked' : '') + '> ' + E(a);
        h += '</label>';
      });
      h += '</div>';
      h += '</div>';

      // Executive Visibility Toggle
      h += '<div style="margin-bottom:12px;">';
      h += '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;cursor:pointer;">';
      h += '<input type="checkbox" id="modalCanViewExecInput"' + (mem.canViewExecutives ? ' checked' : '') + '>';
      h += '<span>Can view executive records (Overall / Executives section)</span>';
      h += '</label>';
      h += '</div>';

      // Normal Bypass Allowed Toggle
      h += '<div style="margin-bottom:12px;">';
      h += '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">';
      h += '<input type="checkbox" id="modalAllowBypassInput"' + (mem.allowNormalBypass !== false ? ' checked' : '') + '>';
      h += '<span>Allow normal employee bypass if password is blank</span>';
      h += '</label>';
      h += '</div>';

      // If Add: Require initial PIN
      if (isAdd) {
        h += '<div style="margin-bottom:16px;">';
        h += '<label style="display:block;font-weight:700;font-size:12.5px;margin-bottom:4px;">Initial PIN (min 4 digits, recommend &ge;6 digits)</label>';
        h += '<input type="password" id="modalInitialPinInput" class="ax-input" placeholder="e.g. 592810" minlength="4" style="width:100%;font-size:16px;letter-spacing:2px;">';
        h += '</div>';
      }

      // Buttons
      h += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">';
      h += '<button type="button" class="ax-btn ax-btn--ghost" onclick="AccessMgmt.closeModal()">Cancel</button>';
      h += '<button type="button" class="ax-btn ax-btn--primary" onclick="AccessMgmt.saveMemberModal(' + isAdd + ')">' + (isAdd ? 'Create Access' : 'Save Changes') + '</button>';
      h += '</div>';
    }

    h += '</div></div>';
    return h;
  }

  /* ---------------- Event & Action Handlers ---------------- */

  function setDept(d) {
    S.dept = d;
    render();
  }

  function onSearch(val) {
    S.q = val;
    render();
  }

  function openAddModal() {
    S.modal = {
      type: 'add',
      data: {
        dept: currentViewDept(),
        role: 'Floor In-Charge',
        areas: ['all'],
        canViewExecutives: false,
        allowNormalBypass: true
      }
    };
    render();
  }

  function openEditModal(id, dept) {
    if (!S.store || !Array.isArray(S.store.members)) return;
    const m = S.store.members.find(x => x.id === id && x.dept === dept);
    if (!m) return;
    S.modal = {
      type: 'edit',
      data: Object.assign({}, m)
    };
    render();
  }

  function openSetPinModal(id, dept) {
    if (!S.store || !Array.isArray(S.store.members)) return;
    const m = S.store.members.find(x => x.id === id && x.dept === dept);
    if (!m) return;
    S.modal = {
      type: 'pin',
      data: Object.assign({}, m)
    };
    render();
  }

  function closeModal() {
    S.modal = null;
    render();
  }

  function onModalDeptChange(val) {
    if (S.modal && S.modal.data) {
      S.modal.data.dept = val;
      render();
    }
  }

  function onModalEmpSearch(query) {
    const box = $('modalEmpSuggestBox');
    if (!box) return;
    const q = String(query || '').trim().toUpperCase();
    if (q.length < 1) {
      box.style.display = 'none';
      return;
    }
    const d = $('modalDeptSelect')?.value || currentViewDept();
    let emps = [];
    if (typeof searchEmployeeDirectory === 'function') {
      emps = searchEmployeeDirectory(q, 8, d);
    }
    if (!emps.length) {
      box.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--muted);">No matching employee found in ' + E(d) + '.</div>';
      box.style.display = 'block';
      return;
    }
    box.innerHTML = emps.map(e => `
      <div style="padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:12.5px;display:flex;justify-content:space-between;" onclick="AccessMgmt.selectEmpSuggestion('${E(e.id)}', '${E(e.name || e.id)}')">
        <span><strong>${E(e.name || e.id)}</strong> (${E(e.id)})</span>
        <span style="color:var(--muted);">${E(e.area)}</span>
      </div>
    `).join('');
    box.style.display = 'block';
  }

  function selectEmpSuggestion(id, name) {
    const inp = $('modalEmpIdInput');
    const sId = $('modalSelectedId');
    const sName = $('modalSelectedName');
    const box = $('modalEmpSuggestBox');
    if (inp) inp.value = `${name} (${id})`;
    if (sId) sId.value = id;
    if (sName) sName.value = name;
    if (box) box.style.display = 'none';
  }

  async function computeHash(text, salt) {
    if (typeof computeSha256 === 'function') {
      return await computeSha256(text + salt);
    }
    // Fallback: SHA-256 via Web Crypto
    const enc = new TextEncoder().encode(text + salt);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function randomSalt() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(16).slice(2, 10);
  }

  async function saveNewPin(id, dept) {
    const pinInp = $('modalNewPinInput');
    const pin = (pinInp?.value || '').trim();
    if (!pin || pin.length < 4) {
      toast('PIN must be at least 4 digits (recommend ≥6 digits)', 'warn');
      pinInp?.focus();
      return;
    }
    if (!S.store || !Array.isArray(S.store.members)) return;
    const m = S.store.members.find(x => x.id === id && x.dept === dept);
    if (!m) return;

    const salt = randomSalt();
    const hash = await computeHash(pin, salt);
    m.pinHash = hash;
    m.pinSalt = salt;
    m.updatedAt = new Date().toISOString();

    closeModal();
    await persistAccessStore();
    toast(`New PIN saved for ${m.name || m.id}: ${pin} (Make sure to note it down)`, 'success');
  }

  async function saveMemberModal(isAdd) {
    const id = ($('modalSelectedId')?.value || '').trim().toUpperCase();
    const name = ($('modalSelectedName')?.value || id).trim();
    const dept = $('modalDeptSelect')?.value || currentViewDept();
    const role = ($('modalRoleInput')?.value || 'Floor In-Charge').trim();
    const canViewExec = $('modalCanViewExecInput')?.checked || false;
    const allowBypass = $('modalAllowBypassInput')?.checked || false;

    if (!id) {
      toast('Please select an employee by ID or name', 'warn');
      $('modalEmpIdInput')?.focus();
      return;
    }

    // Areas
    const checkedAreas = [...document.querySelectorAll('input[name="modalAreas"]:checked')].map(el => el.value);
    const areas = checkedAreas.length ? (checkedAreas.includes('all') ? ['all'] : checkedAreas) : ['all'];

    if (!S.store) await loadAccessData();
    if (!Array.isArray(S.store.members)) S.store.members = [];

    if (isAdd) {
      // Check unique ID per dept
      if (S.store.members.some(x => x.id === id && x.dept === dept)) {
        toast(`Employee ${id} already has access granted in ${dept}`, 'error');
        return;
      }

      const pinInp = $('modalInitialPinInput');
      const pin = (pinInp?.value || '').trim();
      if (!pin || pin.length < 4) {
        toast('Initial PIN must be at least 4 digits (recommend ≥6 digits)', 'warn');
        pinInp?.focus();
        return;
      }

      const salt = randomSalt();
      const hash = await computeHash(pin, salt);

      const newRec = {
        id,
        name,
        dept,
        role,
        areas,
        canViewExecutives: canViewExec,
        pinHash: hash,
        pinSalt: salt,
        active: true,
        allowNormalBypass: allowBypass,
        createdBy: adminUser() || 'admin',
        updatedAt: new Date().toISOString()
      };
      S.store.members.push(newRec);
      closeModal();
      await persistAccessStore();
      toast(`Access created for ${name} (${id}) in ${dept}. PIN: ${pin}`, 'success');
    } else {
      // Edit
      const m = S.store.members.find(x => x.id === id && x.dept === dept);
      if (!m) return;
      m.role = role;
      m.areas = areas;
      m.canViewExecutives = canViewExec;
      m.allowNormalBypass = allowBypass;
      m.updatedAt = new Date().toISOString();
      closeModal();
      await persistAccessStore();
      toast(`Updated access for ${m.name || m.id}`, 'success');
    }
  }

  async function toggleActive(id, dept) {
    if (!S.store || !Array.isArray(S.store.members)) return;
    const m = S.store.members.find(x => x.id === id && x.dept === dept);
    if (!m) return;
    m.active = (m.active === false);
    m.updatedAt = new Date().toISOString();
    render();
    await persistAccessStore();
    toast(`${m.name || m.id} is now ${m.active ? 'Active' : 'Deactivated'}`, 'info');
  }

  async function deleteMember(id, dept) {
    if (!S.store || !Array.isArray(S.store.members)) return;
    const idx = S.store.members.findIndex(x => x.id === id && x.dept === dept);
    if (idx === -1) return;
    const m = S.store.members[idx];
    if (!confirm(`Revoke access for ${m.name || m.id} (${m.role} in ${m.dept})?`)) return;

    const backup = [...S.store.members];
    S.store.members.splice(idx, 1);
    S.undo = {
      label: `Revoked access for ${m.name || m.id}`,
      members: backup
    };
    render();
    await persistAccessStore();
    toast(`Access revoked for ${m.name || m.id}`, 'info');
  }

  async function doUndo() {
    if (!S.undo || !S.undo.members) return;
    S.store.members = S.undo.members;
    S.undo = null;
    render();
    await persistAccessStore();
    toast('Action undone successfully', 'success');
  }

  window.AccessMgmt = {
    load: loadAccessData,
    render,
    setDept,
    onSearch,
    openAddModal,
    openEditModal,
    openSetPinModal,
    closeModal,
    onModalDeptChange,
    onModalEmpSearch,
    selectEmpSuggestion,
    saveNewPin,
    saveMemberModal,
    toggleActive,
    deleteMember,
    doUndo
  };

})();
