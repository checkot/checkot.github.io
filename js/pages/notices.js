/* ==========================================================================
   NOTICES.JS - Notice Board, Carousel Ticker & Unread Badging Controller
   ========================================================================== */

let _noticesInflight = null;
function loadNoticesData() {
  if (_noticesInflight) return _noticesInflight;
  _noticesInflight = _loadNoticesDataImpl().finally(() => { _noticesInflight = null; });
  return _noticesInflight;
}

async function _loadNoticesDataImpl() {
  let cachedData = null;
  let cachedTs = 0;
  try {
    const cachedRaw = localStorage.getItem(NOTICES_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (Array.isArray(cached.data)) {
        cachedData = cached.data;
        cachedTs = cached.ts || 0;
      }
    }
  } catch (e) {
    try { localStorage.removeItem(NOTICES_CACHE_KEY); } catch (err) {}
  }

  try {
    const data = await fetchJsonResource('notices.json');
    noticesData = Array.isArray(data.notices) ? data.notices : DEFAULT_FALLBACK_NOTICES;
    try {
      localStorage.setItem(NOTICES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: noticesData }));
    } catch (e) {}
    updateNoticesBadge();
    return noticesData;
  } catch (e) {
    const ageMs = Date.now() - cachedTs;
    if (cachedData && ageMs < OFFLINE_FALLBACK_MAX_AGE_MS) {
      noticesData = cachedData;
      updateNoticesBadge();
      return noticesData;
    }
    noticesData = noticesData || DEFAULT_FALLBACK_NOTICES;
    updateNoticesBadge();
    return noticesData;
  }
}

function getReadNotices() {
  try {
    const raw = localStorage.getItem(typeof NOTICES_READ_KEY !== 'undefined' ? NOTICES_READ_KEY : 'renata_notices_read_v31');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function markAllNoticesRead() {
  try {
    localStorage.setItem(typeof NOTICES_READ_KEY !== 'undefined' ? NOTICES_READ_KEY : 'renata_notices_read_v31', JSON.stringify((noticesData || []).map(n => n.id)));
  } catch (e) {}
  updateNoticesBadge();
}

function updateNoticesBadge() {
  const badge = document.getElementById('noticesBadge');
  if (!badge || !noticesData) return;
  const dept = (typeof getClientDepartment === 'function') ? getClientDepartment() : 'PR';
  const scopedNotices = noticesData.filter(n => !n.dept || n.dept === 'ALL' || n.dept === dept);
  const read = getReadNotices();
  const unreadCount = scopedNotices.filter(n => !read.includes(n.id)).length;
  if (unreadCount > 0) {
    badge.style.display = 'inline-block';
    badge.textContent = typeof bn === 'function' ? bn(unreadCount) : unreadCount;
  } else {
    badge.style.display = 'none';
  }
}

function renderNoticeItem(n) {
  const priority = (n.priority || 'normal').toLowerCase();
  const priorityClass = priority === 'high' ? 'priority-high' : priority === 'low' ? 'priority-low' : '';
  return `<div class="notice-item ${priorityClass}">
<div class="notice-title">${esc(n.title || '—')}</div>
<div class="notice-body">${esc(n.body || '').replace(/\n/g, '<br>')}</div>
<div class="notice-date">${esc(typeof formatNoticeDate === 'function' ? formatNoticeDate(n.date) : (n.date || ''))}</div>
</div>`;
}

async function renderNoticesHome() {
  try { loadNoticesData().then(renderNoticeTicker); } catch (e) {}
  const box = document.getElementById('noticesHomeList');
  if (!box) return;
  const list = await loadNoticesData();
  if (!list || list.length === 0) {
    box.innerHTML = '<div class="empty-msg">No notices at the moment.</div>';
    return;
  }
  const dept = (typeof getClientDepartment === 'function') ? getClientDepartment() : 'PR';
  const scoped = list.filter(n => !n.dept || n.dept === 'ALL' || n.dept === dept);
  if (!scoped.length) {
    box.innerHTML = '<div class="empty-msg">No notices at the moment.</div>';
    return;
  }
  const topList = scoped.slice(0, 3);
  box.innerHTML = topList.map(renderNoticeItem).join('');
}

async function renderNoticesPage() {
  const box = document.getElementById('noticesFullList');
  if (!box) return;
  box.innerHTML = '<div class="empty-msg" style="padding: 20px;">Loading notices...</div>';
  const list = await loadNoticesData();
  const dept = (typeof getClientDepartment === 'function') ? getClientDepartment() : 'PR';
  const scoped = (list || []).filter(n => !n.dept || n.dept === 'ALL' || n.dept === dept);
  if (!scoped || scoped.length === 0) {
    box.innerHTML = '<div class="empty-msg">No notices at the moment.</div>';
    return;
  }
  box.innerHTML = scoped.map(renderNoticeItem).join('');
  markAllNoticesRead();
}

async function forceRefreshNotices() {
  try {
    localStorage.removeItem(NOTICES_CACHE_KEY);
  } catch (e) {}
  await loadNoticesData();
  renderNoticesPage();
  renderNoticeTicker(noticesData);
  if (typeof showToast === 'function') showToast("Notice list updated", "success");
}

function renderNoticeTicker(list) {
  const bar = document.getElementById('noticeTicker');
  const track = document.getElementById('ntTrack');
  if (!bar || !track) return;
  const items = (Array.isArray(list) ? list : []).slice(0, 5);
  if (!items.length) { bar.hidden = true; return; }
  const one = '<div class="nt-half">' + items.map(n => `<span class="nt-item${n.priority === 'high' ? ' hi' : ''}"><b>${esc(n.title || '')}</b>${n.body ? ' — ' + esc(String(n.body).replace(/\s+/g, ' ').slice(0, 90)) : ''}</span>`).join('') + '</div>';
  track.innerHTML = one + one;
  const chars = items.reduce((s, n) => s + String(n.title || '').length + Math.min(90, String(n.body || '').length) + 6, 0);
  track.style.animationDuration = Math.max(14, Math.round(chars * 0.22)) + 's';
  bar.hidden = false;
}

function startNoticePolling() {
  setInterval(async () => {
    try {
      const data = await fetchJsonResource('notices.json');
      if (Array.isArray(data.notices)) {
        noticesData = data.notices;
        try { localStorage.setItem(NOTICES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: noticesData })); } catch (e) {}
        updateNoticesBadge();
        renderNoticeTicker(noticesData);
      }
    } catch (e) {}
  }, 120000);
}
