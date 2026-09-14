import { getRawDb } from "@/db";
import {
  bearerToken,
  normalizeCode,
  type ParticipantRecord,
  type RoomRecord,
  roomError,
} from "@/lib/room-api";

interface RouteContext {
  params: Promise<{ code: string }>;
}

interface SubscriptionPayload {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const token = bearerToken(request);
    const body = (await request.json()) as SubscriptionPayload;
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";

    if (
      code.length !== 6 ||
      token.length < 20 ||
      !endpoint.startsWith("https://") ||
      endpoint.length > 2048 ||
      p256dh.length < 40 ||
      p256dh.length > 256 ||
      auth.length < 10 ||
      auth.length > 128
    ) {
      return Response.json({ error: "La suscripción push no es válida." }, { status: 400 });
    }

    const database = getRawDb();
    const room = await database
      .prepare(
        `SELECT id, code, host_token, expected_participants, status, expires_at, version
         FROM rooms WHERE code = ? AND expires_at > ? LIMIT 1`,
      )
      .bind(code, Date.now())
      .first<RoomRecord>();
    if (!room) {
      return Response.json({ error: "La sala ya no está disponible." }, { status: 404 });
    }

    const participant = await database
      .prepare(
        `SELECT id, name, access_token, red_number, blue_number, joined_at
         FROM participants WHERE room_id = ? AND access_token = ? LIMIT 1`,
      )
      .bind(room.id, token)
      .first<ParticipantRecord>();
    if (!participant) {
      return Response.json({ error: "Tu acceso a la sala no es válido." }, { status: 401 });
    }

    const now = Date.now();
    await database.batch([
      database
        .prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND participant_id <> ?")
        .bind(endpoint, participant.id),
      database
        .prepare(
          `INSERT INTO push_subscriptions
             (id, room_id, participant_id, endpoint, p256dh, auth, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(participant_id) DO UPDATE SET
             endpoint = excluded.endpoint,
             p256dh = excluded.p256dh,
             auth = excluded.auth,
             updated_at = excluded.updated_at`,
        )
        .bind(
          crypto.randomUUID(),
          room.id,
          participant.id,
          endpoint,
          p256dh,
          auth,
          now,
          now,
        ),
    ]);

    return Response.json({ subscribed: true }, { status: 201 });
  } catch (error) {
    return roomError(error);
  }
}
