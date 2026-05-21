// Kill-switch SW (v2). Replaces an earlier custom service worker that
// cached every request (including HTML page navigations) and bricked
// custom-domain storefronts for up to 7 days after a bad deploy.
//
// On activation this worker:
//   1. Deletes every Cache Storage entry the old SW created.
//   2. Calls clients.claim() so existing open tabs are controlled by
//      this worker immediately.
//   3. Force-navigates every open tab once so they pick up the new
//      HTML from the network instead of the stale cached copy.
//
// While this SW is active it does NOT cache anything. The push +
// notificationclick handlers from the previous SW are preserved.
//
// On the next deploy the @ducanh2912/next-pwa-generated service worker
// (configured in next.config.mjs with safer runtimeCaching rules) will
// replace this file at /service-worker.js. skipWaiting + clientsClaim
// in that config ensure the handoff happens without another stale
// generation.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.clients.claim();
      const clientList = await self.clients.matchAll({ type: "window" });
      for (const client of clientList) {
        try {
          client.navigate(client.url);
        } catch {
          /* navigate may be unavailable in some contexts; ignore */
        }
      }
    })()
  );
});

// NetworkOnly for every request — never serve from cache. The next
// generated next-pwa SW will take over real caching on the next deploy.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", function (event) {
  if (!event.data) return;

  try {
    const data = JSON.parse(event.data.text());
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.message,
        icon: "/milk-market.png",
        data: {
          url: data.url ?? "/",
        },
      })
    );
  } catch (e) {
    console.error("Push notification error:", e);
  }
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
