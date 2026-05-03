// Minimal service worker for PWA installability (Egaña CRM).
// Network-first passthrough — no aggressive caching to avoid stale shells.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Required by Chrome to consider the app installable.
  // Just defer to the network without caching.
  event.respondWith(fetch(event.request).catch(() => Response.error()));
});
