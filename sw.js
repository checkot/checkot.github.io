// RENATA Overtime App — Service Worker (Offline PWA + Stale-While-Revalidate)
const CACHE_NAME = 'checkot-pwa-v20261106-09';

const PRECACHE_ASSETS = [
  './',
  'index.html',
  'admin.html',
  'manifest.json',
  'icon.png',
  'og-image.png',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/nav.css',
  'css/pages.css',
  'css/admin.css',
  'css/manager-ux.css',
  'css/rank-details.css',
  'js/core/config.js',
  'js/core/state.js',
  'js/core/storage.js',
  'js/core/utils.js',
  'js/calculations/rates.js',
  'js/calculations/ranking.js',
  'js/components/router.js',
  'js/pages/search.js',
  'js/pages/history.js',
  'js/pages/settings.js',
  'js/pages/report.js',
  'js/pages/vs.js',
  'js/pages/notices.js',
  'js/pages/more.js',
  'js/pages/team.js',
  'js/pages/leaderboard.js',
  'js/components/rank-details.js',
  'js/components/pwa-install.js',
  'js/components/telemetry.js',
  'js/patches/manager-ux.js',
  'js/admin/admin-core.js',
  'js/admin/admin-tools.js',
  'js/admin/admin-github.js',
  'js/admin/admin-sync-bar.js',
  'areas.json',
  'team.json',
  'notices.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First for HTML navigation & dynamic JSON, Cache-First/Stale-While-Revalidate for static assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // 1. HTML Navigation & Page Documents: Network-First (always fresh when online, offline fallback)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/') || url.pathname === '') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('index.html') || caches.match('./')))
    );
    return;
  }

  // 2. Dynamic JSON files
  if (url.pathname.includes('/data/') || url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell & static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
