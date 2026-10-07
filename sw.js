// RENATA Overtime App — Service Worker
// Strategy: Network-first for dynamic data, pass-through for static assets

const SW_VERSION = '2026-10-07-v1';

// ===== Install =====
self.addEventListener('install', (event) => {
    console.log('[SW] Installing version:', SW_VERSION);
    // Activate immediately — don't wait for old SW to release clients
    self.skipWaiting();
});

// ===== Activate =====
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            console.log('[SW] Activated version:', SW_VERSION);
            // Take control of all open pages
            await self.clients.claim();
        })()
    );
});

// ===== Fetch =====
// IMPORTANT: No caching in this SW.
// All requests pass through to network with browser default handling.
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Dynamic data — always network, never cache
    if (url.pathname.endsWith('/notices.json') ||
        url.pathname.endsWith('/team.json') ||
        url.pathname.endsWith('/index.html') ||
        url.pathname.endsWith('/sw.js')) {
        return;  // Browser default network handling
    }

    // All other requests — browser default handling
    return;
});
