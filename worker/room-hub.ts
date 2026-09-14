import { DurableObject } from "cloudflare:workers";
import {
  ROOM_EVENT_TARGET,
  type RoomEvent,
  type RoomEventTarget,
} from "@/lib/room-events";

const SOCKET_PROTOCOL = "emparejao";
const SOCKET_ROLE = {
  HOST: "host",
  PARTICIPANT: "participant",
} as const;

type SocketRole = (typeof SOCKET_ROLE)[keyof typeof SOCKET_ROLE];

interface BroadcastRequest {
  event: RoomEvent;
  target: RoomEventTarget;
}

interface SocketAccessRecord {
  host_token: string;
  participant_id: string | null;
  status: string;
  expected_participants: number;
  version: number;
}

function requestedProtocols(request: Request) {
  return (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isBroadcastRequest(value: unknown): value is BroadcastRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  const event = request.event;
  return (
    (request.target === ROOM_EVENT_TARGET.HOST ||
      request.target === ROOM_EVENT_TARGET.PARTICIPANT ||
      request.target === ROOM_EVENT_TARGET.ALL) &&
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    (event.type === "room_updated" || event.type === "draw_started")
  );
}

export class RoomHub extends DurableObject<Cloudflare.Env> {
  private pendingParticipantCount: number | null = null;
  private roomUpdateTimer: ReturnType<typeof setTimeout> | undefined;

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/broadcast" && request.method === "POST") {
      return this.broadcast(request);
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket requerido.", { status: 426 });
    }
    return this.openSocket(request, url);
  }

  private async openSocket(request: Request, url: URL) {
    const database = this.env.DB;
    if (!database) return new Response("Base de datos no disponible.", { status: 503 });

    const protocols = requestedProtocols(request);
    if (protocols[0] !== SOCKET_PROTOCOL || !protocols[1]) {
      return new Response("Acceso inválido.", { status: 401 });
    }

    const roomCode = url.searchParams.get("room")?.replace(/\D/g, "").slice(0, 6) ?? "";
    const token = protocols[1];
    const access = await database
      .prepare(
        `SELECT r.host_token, r.status, r.expected_participants, r.version,
                p.id AS participant_id
         FROM rooms r
         LEFT JOIN participants p ON p.room_id = r.id AND p.access_token = ?
         WHERE r.code = ? AND r.expires_at > ? LIMIT 1`,
      )
      .bind(token, roomCode, Date.now())
      .first<SocketAccessRecord>();

    const role: SocketRole | null = access
      ? token === access.host_token
        ? SOCKET_ROLE.HOST
        : access.participant_id
          ? SOCKET_ROLE.PARTICIPANT
          : null
      : null;
    if (!access || !role) return new Response("Acceso inválido.", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role });
    server.send(JSON.stringify({
      type: "room_snapshot",
      participantCount:
        access.status === "drawn"
          ? access.expected_participants
          : Math.max(0, access.version - 1),
      status: access.status === "drawn" ? "drawn" : "lobby",
    }));

    return new Response(null, {
      status: 101,
      headers: { "sec-websocket-protocol": SOCKET_PROTOCOL },
      webSocket: client,
    });
  }

  private async broadcast(request: Request) {
    const body: unknown = await request.json();
    if (!isBroadcastRequest(body)) {
      return new Response("Evento inválido.", { status: 400 });
    }

    if (body.event.type === "room_updated") {
      this.pendingParticipantCount = Math.max(
        this.pendingParticipantCount ?? 0,
        body.event.participantCount,
      );
      if (!this.roomUpdateTimer) {
        this.roomUpdateTimer = setTimeout(() => {
          const participantCount = this.pendingParticipantCount;
          this.pendingParticipantCount = null;
          this.roomUpdateTimer = undefined;
          if (participantCount !== null) {
            this.sendToSockets(
              { type: "room_updated", participantCount },
              ROOM_EVENT_TARGET.ALL,
            );
          }
        }, 500);
      }
      return Response.json({ queued: true });
    }

    const delivered = this.sendToSockets(body.event, body.target);
    return Response.json({ delivered });
  }

  private sendToSockets(event: RoomEvent, target: RoomEventTarget) {
    const sockets = target === ROOM_EVENT_TARGET.ALL
      ? this.ctx.getWebSockets()
      : this.ctx.getWebSockets(target);
    const payload = JSON.stringify(event);
    for (const socket of sockets) {
      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "No se pudo entregar el evento.");
      }
    }
    return sockets.length;
  }

  webSocketMessage(socket: WebSocket, message: ArrayBuffer | string) {
    if (message === "ping") socket.send("pong");
  }
}
