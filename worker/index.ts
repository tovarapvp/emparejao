import app from "vinext/server/fetch-handler";
export { RoomHub } from "./room-hub";

const SOCKET_ROUTE = /^\/api\/rooms\/(\d{6})\/socket$/;

export default {
  async fetch(request: Request, env: Cloudflare.Env, context: ExecutionContext) {
    const url = new URL(request.url);
    const socketMatch = SOCKET_ROUTE.exec(url.pathname);
    if (socketMatch) {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket requerido.", { status: 426 });
      }
      if (!env.ROOM_HUB) {
        return new Response("Sincronización en vivo no disponible.", { status: 503 });
      }
      url.searchParams.set("room", socketMatch[1]);
      return env.ROOM_HUB.getByName(socketMatch[1]).fetch(new Request(url, request));
    }
    return app.fetch(request, env, context);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
