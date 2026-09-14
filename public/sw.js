const LANGUAGE_CACHE = "emparejao-preferences-v1";
const LANGUAGE_URL = "/__emparejao-language";

async function getLanguage() {
  const cache = await caches.open(LANGUAGE_CACHE);
  const response = await cache.match(LANGUAGE_URL);
  return response ? response.text() : "es";
}

globalThis.addEventListener("message", (event) => {
  if (event.data?.type !== "SET_LANGUAGE") return;
  const language = event.data.language === "en" ? "en" : "es";
  event.waitUntil(
    caches.open(LANGUAGE_CACHE).then((cache) =>
      cache.put(LANGUAGE_URL, new Response(language)),
    ),
  );
});

globalThis.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = { body: event.data?.text() };
  }

  event.waitUntil((async () => {
    const language = await getLanguage();
    const title = language === "en"
      ? message.titleEn ?? message.title ?? "Emparejao"
      : message.titleEs ?? message.title ?? "Emparejao";
    const body = language === "en"
      ? message.bodyEn ?? message.body ?? "Your draw has an update."
      : message.bodyEs ?? message.body ?? "Tu sorteo tiene una actualización.";
    const notification = globalThis.registration.showNotification(title, {
      body,
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

    await Promise.all([notification, updateOpenPages]);
  })());
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
