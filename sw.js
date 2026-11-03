// RENATA Overtime App — Service Worker
// Strategy: Pure network pass-through (zero caching)
// Bumping SW_VERSION forces immediate activation on all clients

const SW_VERSION = '2026-11-03-v1';

// ===== Install =====
self.addEventListener('install', (event) => {
    // Activate immediately without waiting for existing clients to release
    self.skipWaiting();
});

// ===== Activate =====
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Take control of all open pages across origins
            await self.clients.claim();
        })()
    );
});

// ===== Fetch =====
// Pure network pass-through: All requests pass through directly to the network
// Dynamic JSON files and app HTML/CSS/JS are never served stale from an offline cache.
self.addEventListener('fetch', (event) => {
    // Browser default network handling
    return;
});
