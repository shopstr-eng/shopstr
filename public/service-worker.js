self.addEventListener("install", () => {
  console.log("service worker installed");
});

self.addEventListener("activate", () => {
  console.log("service worker activated");
});

self.addEventListener("push", function (event) {
  const data = JSON.parse(event.data.text());
  event.waitUntil(
    registration.showNotification(data.title, {
      body: data.message,
      icon: "/shopstr-144x144.png",
      data: {
        url: data.url ?? "/",
      },
    }),
  );
});

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
          const outcome = clients.openWindow(event.notification.data.url);
          return outcome.navigate(event.notification.data.url);
        }
        return clients.openWindow("/");
      }),
  );
});
