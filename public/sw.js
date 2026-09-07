self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Notificación" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(clients.openWindow(url));
});
