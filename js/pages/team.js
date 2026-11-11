/* ==========================================================================
   TEAM.JS - ERP Support Team Directory & WhatsApp Routing Controller
   ========================================================================== */

/* ERP team membership: a member's `dept` field decides (PR or QA). No `dept` = PR (legacy entries). */
function getTeamMemberDept(m) {
  return String((m && m.dept) || 'PR').toUpperCase() === 'QA' ? 'QA' : 'PR';
}
function getErpTeamForDept(list, dept) {
  const d = String(dept || 'PR').toUpperCase() === 'QA' ? 'QA' : 'PR';
  return (Array.isArray(list) ? list : []).filter(m => getTeamMemberDept(m) === d);
}
function erpTeamEmptyMessage(dept) {
  return dept === 'QA'
    ? 'QA ERP team members will be added soon. Please contact your QA admin for now.'
    : 'ERP team information is not available right now.';
}

let _teamInflight = null;
function loadTeamData() {
  if (_teamInflight) return _teamInflight;
  _teamInflight = _loadTeamDataImpl().finally(() => { _teamInflight = null; });
  return _teamInflight;
}

async function _loadTeamDataImpl() {
  let cachedData = null;
  let cachedTs = 0;
  try {
    const cachedRaw = localStorage.getItem(TEAM_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (Array.isArray(cached.data)) {
        cachedData = cached.data;
        cachedTs = cached.ts || 0;
      }
    }
  } catch (e) {
    try { localStorage.removeItem(TEAM_CACHE_KEY); } catch (err) {}
  }

  try {
    const data = await fetchJsonResource('team.json');
    teamData = Array.isArray(data.team) ? data.team : DEFAULT_FALLBACK_TEAM;
    try {
      localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: teamData }));
    } catch (e) {}
    return teamData;
  } catch (e) {
    const ageMs = Date.now() - cachedTs;
    if (cachedData && ageMs < OFFLINE_FALLBACK_MAX_AGE_MS) {
      teamData = cachedData;
      return teamData;
    }
    teamData = teamData || DEFAULT_FALLBACK_TEAM;
    return teamData;
  }
}

async function renderTeamPage() {
  const box = document.getElementById('teamList');
  if (!box) return;
  box.innerHTML = '<div class="empty-msg" style="padding: 20px;">Loading...</div>';
  const _all = await loadTeamData();
  const _dept = (typeof getClientDepartment === 'function') ? getClientDepartment() : 'PR';
  const team = getErpTeamForDept(_all, _dept);
  if (!team || team.length === 0) {
    box.innerHTML = '<div class="empty-msg">' + erpTeamEmptyMessage(_dept) + '</div>';
    return;
  }
  box.innerHTML = team.map(m => {
    const rawPhoto = m.photo || 'https://checkot.github.io/icon.png';
    const photoUrl = rawPhoto === 'icon.png' ? 'https://checkot.github.io/icon.png' : rawPhoto;
    return `
<div class="team-member">
<img class="team-photo" src="${esc(photoUrl)}" alt="${esc(m.name || 'Team')}" onerror="this.onerror=null;this.src=FALLBACK_LOGO_URI;">
<div class="team-info">
<div class="team-name">${esc(m.name || '—')}</div>
<div class="team-desig">${esc(m.designation || '—')} ${m.area ? `• <span class="admin-tag">${esc(m.area)}</span>` : ''}</div>
<div class="team-id">ID: ${esc(m.id || '—')}</div>
</div>
<a class="team-wa" href="https://wa.me/${(m.whatsapp || '').replace(/[^0-9]/g,'')}?text=${encodeURIComponent('RPPF Overtime App - Support needed')}" target="_blank" rel="noopener noreferrer" title="WhatsApp">
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 3C8.8 3 3 8.8 3 16c0 2.3 0.6 4.5 1.7 6.4L3 29l6.8-1.8c1.9 1 4 1.6 6.2 1.6 7.2 0 13-5.8 13-13S23.2 3 16 3zm0 23.5c-2 0-3.9-0.5-5.5-1.5l-0.4-0.2-4 1.1 1.1-3.9-0.3-0.4c-1.1-1.7-1.7-3.7-1.7-5.6 0-5.9 4.8-10.7 10.7-10.7s10.7 4.8 10.7 10.7-4.8 10.7-10.7 10.7z"/></svg>
<span>WhatsApp</span>
</a>
</div>`;
  }).join('');
}
