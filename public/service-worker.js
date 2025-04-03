const CACHE_NAME = "shopstr-cache-v1";

// Resources to pre-cache
const PRECACHE_RESOURCES = [
  "/",
  "/manifest.json",
  "/shopstr-144x144.png",
  "/shopstr-512x512.png",
  "/shopstr-2000x2000.png",
  "/offline",
  "/_next/static/css/app.css",
  "/_next/static/js/main.js"
];

self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing");
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        console.log("Service Worker: Caching Files");
        return cache.addAll(PRECACHE_RESOURCES);
      }),
      self.skipWaiting()
    ])
  );
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activated");
  // Clean up old caches and claim clients
  event.waitUntil(
    Promise.all([
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
      self.clients.claim()
    ])
  );
});

// Enhanced fetch handler with offline support
self.addEventListener("fetch", (event) => {
  // Skip non-HTTP(S) requests, chrome-extension URLs, and all development-related requests
  if (!event.request.url.startsWith('http') || 
      event.request.url.startsWith('chrome-extension://') ||
      event.request.url.includes('webpack') ||
      event.request.url.includes('hot-update') ||
      event.request.url.includes('on-demand-entries') ||
      event.request.url.includes('_next/static/webpack') ||
      event.request.url.includes('_next/static/development') ||
      event.request.url.includes('__webpack_hmr')) {
    return fetch(event.request);
  }

  // Handle only GET requests
  if (event.request.method !== 'GET') {
    return fetch(event.request);
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((response) => {
            // Check for valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Only cache same-origin responses
            if (new URL(event.request.url).origin === location.origin) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache)
                    .catch(error => console.error('Cache put error:', error));
                })
                .catch(error => console.error('Cache open error:', error));
            }

            return response;
          })
          .catch((error) => {
            console.error('Fetch error:', error);
            // Return cached homepage for navigation requests when offline
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }
            return null;
          });
      })
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
