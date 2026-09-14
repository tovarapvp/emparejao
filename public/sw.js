globalThis.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = { body: event.data?.text() };
  }

  const notification = globalThis.registration.showNotification(message.title ?? "Emparejao", {
    body: message.body ?? "Tu sorteo tiene una actualización.",
    icon: "/favicon.svg",
    tag: message.tag ?? "emparejao-push",
    data: { url: message.url ?? "/" },
  });
  const updateOpenPages = globalThis.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((windows) => {
      for (const client of windows) {
        client.postMessage({ type: "DRAW_STARTED", roomCode: message.roomCode ?? "" });
      }
    });

  event.waitUntil(Promise.all([notification, updateOpenPages]));
});

globalThis.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url ?? "/", globalThis.location.origin).href;

  event.waitUntil(
    globalThis.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existingWindow = windows.find((client) => client.url === destination) ?? windows[0];
      if (existingWindow) {
        return existingWindow.navigate(destination).then(() => existingWindow.focus());
      }
      return globalThis.clients.openWindow(destination);
    }),
  );
});
