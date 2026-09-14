globalThis.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification.data?.url ?? "/";

  event.waitUntil(
    globalThis.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existingWindow = windows[0];
      if (existingWindow) {
        return existingWindow.focus();
      }
      return globalThis.clients.openWindow(destination);
    }),
  );
});
