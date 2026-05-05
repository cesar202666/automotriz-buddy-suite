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

// Notification click — focus or open the mobile CRM
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/#/crm-movil";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if ("focus" in client) {
          try {
            await client.focus();
            if ("navigate" in client) {
              try { await client.navigate(targetUrl); } catch (_) {}
            }
            return;
          } catch (_) {}
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
