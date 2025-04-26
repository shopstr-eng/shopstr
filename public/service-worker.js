const CACHE_NAME = "shopstr-cache-v1";

const STATIC_ASSETS = [
  "/",
  "/shopstr.ico",
  "/manifest.json",
  "/shopstr-144x144.png",
  "/shopstr-512x512.png",
  "/shopstr-2000x2000.png",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Intercept fetch requests
self.addEventListener("fetch", (event) => {
  // Skip _next resources to avoid caching development resources
  if (event.request.url.includes("/_next/")) {
    return;
  }

  // Cache strategy - network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        // Open cache and store response
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // If network fails, try to serve from cache
        return caches.match(event.request);
      })
  );
});

// Push notification handler
self.addEventListener("push", function (event) {
  if (!event.data) return;

  try {
    const data = JSON.parse(event.data.text());
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.message,
        icon: "/shopstr-144x144.png",
        data: {
          url: data.url ?? "/",
        },
      })
    );
  } catch (error) {
    console.error("Error processing push notification:", error);
  }
});

// Notification click handler
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        if (clientList.length > 0) {
          let client = clientList[0];
          for (let i = 0; i < clientList.length; i++) {
            if (clientList[i].focused) {
              client = clientList[i];
            }
          }
          if (event.notification.data?.url) {
            return client.navigate(event.notification.data.url);
          }
          return client.focus();
        }

        if (event.notification.data?.url) {
          return clients.openWindow(event.notification.data.url);
        }
        return clients.openWindow("/");
      })
  );
});
