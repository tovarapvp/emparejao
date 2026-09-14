import app from "vinext/server/fetch-handler";
import { errorDetails, logEvent } from "../lib/observability";
import { runScheduledCleanup } from "./maintenance";
import {
  enforceRateLimit,
  healthResponse,
  sendOperationalAlert,
} from "./operations";
export { RoomHub } from "./room-hub";

const SOCKET_ROUTE = /^\/api\/rooms\/(\d{6})\/socket$/;
const JOIN_ROUTE = /^\/api\/rooms\/(\d{6})\/join$/;

function clientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

async function handleFetch(
  request: Request,
  env: Cloudflare.Env,
  context: ExecutionContext,
) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/health") {
    const response = await healthResponse(env);
    if (response.status >= 500) {
      context.waitUntil(
        sendOperationalAlert(
          env,
          "health_check_failed",
          "La verificación de salud no pudo acceder a D1.",
          { status: response.status },
        ),
      );
    }
    return response;
  }

  if (request.method === "POST" && /^\/api\/rooms\/?$/.test(url.pathname)) {
    const limited = await enforceRateLimit(
      env.ROOM_CREATE_LIMITER,
      `create:${clientKey(request)}`,
      "room_create",
    );
    if (limited) return limited;
  }

  const joinMatch = request.method === "POST" ? JOIN_ROUTE.exec(url.pathname) : null;
  if (joinMatch) {
    const limited = await enforceRateLimit(
      env.ROOM_JOIN_LIMITER,
      `join:${joinMatch[1]}`,
      "room_join",
    );
    if (limited) return limited;
  }

  const socketMatch = SOCKET_ROUTE.exec(url.pathname);
  if (socketMatch) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket requerido.", { status: 426 });
    }
    const limited = await enforceRateLimit(
      env.ROOM_SOCKET_LIMITER,
      `socket:${socketMatch[1]}`,
      "room_socket",
    );
    if (limited) return limited;
    if (!env.ROOM_HUB) {
      return new Response("Sincronización en vivo no disponible.", { status: 503 });
    }
    url.searchParams.set("room", socketMatch[1]);
    return env.ROOM_HUB.getByName(socketMatch[1]).fetch(new Request(url, request));
  }

  const response = await app.fetch(request, env, context);
  if (response.status >= 500) {
    context.waitUntil(
      sendOperationalAlert(
        env,
        "http_server_error",
        `La aplicación respondió ${response.status} en ${request.method} ${url.pathname}.`,
        { method: request.method, path: url.pathname, status: response.status },
      ),
    );
  }
  return response;
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, context: ExecutionContext) {
    try {
      return await handleFetch(request, env, context);
    } catch (error) {
      const url = new URL(request.url);
      logEvent("error", "worker_request_failed", {
        method: request.method,
        path: url.pathname,
        rayId: request.headers.get("cf-ray"),
        ...errorDetails(error),
      });
      context.waitUntil(
        sendOperationalAlert(
          env,
          "worker_request_failed",
          `Excepción en ${request.method} ${url.pathname}.`,
          { method: request.method, path: url.pathname },
        ),
      );
      throw error;
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Cloudflare.Env,
    context: ExecutionContext,
  ) {
    try {
      const result = await runScheduledCleanup(env);
      if (result.mayHaveMore) {
        context.waitUntil(
          sendOperationalAlert(
            env,
            "cleanup_backlog",
            "La limpieza alcanzó 500 salas; quedan más salas expiradas pendientes.",
            { deletedRooms: result.deletedRooms, cron: controller.cron },
          ),
        );
      }
    } catch (error) {
      context.waitUntil(
        sendOperationalAlert(
          env,
          "cleanup_failed",
          "Falló la limpieza automática de salas expiradas.",
          { cron: controller.cron, ...errorDetails(error) },
        ),
      );
      throw error;
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>;
