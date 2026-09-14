globalThis.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = { body: event.data?.text() };
  }

  event.waitUntil(
    globalThis.registration.showNotification(message.title ?? "Emparejao", {
      body: message.body ?? "Tu sorteo tiene una actualización.",
      icon: "/favicon.svg",
      tag: message.tag ?? "emparejao-push",
      data: { url: message.url ?? "/" },
    }),
  );
});

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
