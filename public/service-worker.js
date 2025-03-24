const CACHE_NAME = "shopstr-cache-v1";

// Resources to pre-cache
const PRECACHE_RESOURCES = [
  "/",
  "/manifest.json",
  "/shopstr-144x144.png",
  "/shopstr-512x512.png",
  "/shopstr-2000x2000.png",
];

self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: Caching Files");
        return cache.addAll(PRECACHE_RESOURCES);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activated");
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Service Worker: Clearing Old Cache");
            return caches.delete(cache);
          }
        }),
      );
    }),
  );
});

// Enhanced fetch handler with offline support
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached response if found
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise, fetch from network
      return fetch(event.request)
        .then((response) => {
          // Check if we received a valid response
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic"
          ) {
            return response;
          }

          // Clone the response as it can only be consumed once
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Return fallback for HTML pages
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
        });
    }),
  );
});

// Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = JSON.parse(event.data.text());
    event.waitUntil(
      self.registration.showNotification(data.title || "Shopstr Notification", {
        body: data.message,
        icon: "/shopstr-144x144.png",
        badge: "/shopstr-144x144.png",
        vibrate: [100, 50, 100],
        data: {
          url: data.url || "/",
        },
      }),
    );
  } catch (error) {
    console.error("Error showing notification:", error);
  }
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // If a window exists, focus it; otherwise open new window
        if (clientList.length > 0) {
          const client = clientList[0];
          const url = event.notification.data?.url || "/";
          return client.navigate(url).then((client) => client.focus());
        }
        return clients.openWindow(event.notification.data?.url || "/");
      }),
  );
});

// Periodic sync for background updates
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "update-content") {
    event.waitUntil(
      // Implement your background sync logic here
      Promise.resolve(),
    );
  }
});
