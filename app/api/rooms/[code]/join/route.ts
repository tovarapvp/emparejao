import { getRawDb } from "@/db";
import {
  normalizeCode,
  normalizeName,
  type RoomRecord,
  roomError,
} from "@/lib/room-api";

interface RouteContext {
  params: Promise<{ code: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const body = (await request.json()) as { name?: unknown };
    const name = normalizeName(typeof body.name === "string" ? body.name : "");

    if (code.length !== 6 || name.length < 2) {
      return Response.json({ error: "Escribe un nombre y un PIN válidos." }, { status: 400 });
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
      return Response.json({ error: "Esa sala no existe o ya venció." }, { status: 404 });
    }
    if (room.status !== "lobby") {
      return Response.json({ error: "El sorteo de esta sala ya comenzó." }, { status: 409 });
    }

    const participantId = crypto.randomUUID();
    const participantToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const [insertResult] = await database.batch([
      database
        .prepare(
          `INSERT INTO participants (id, room_id, name, access_token, joined_at)
           SELECT ?, ?, ?, ?, ?
           WHERE (SELECT status FROM rooms WHERE id = ?) = 'lobby'
             AND (SELECT COUNT(*) FROM participants WHERE room_id = ?) < ?
             AND NOT EXISTS (
               SELECT 1 FROM participants WHERE room_id = ? AND lower(name) = lower(?)
             )`,
        )
        .bind(
          participantId,
          room.id,
          name,
          participantToken,
          Date.now(),
          room.id,
          room.id,
          room.expected_participants,
          room.id,
          name,
        ),
      database
        .prepare(
          `UPDATE rooms SET version = version + 1
           WHERE id = ? AND changes() > 0 AND status = 'lobby'`,
        )
        .bind(room.id),
    ]);

    if ((insertResult.meta.changes ?? 0) === 0) {
      return Response.json(
        { error: "La sala está completa, ya comenzó o ese nombre ya está registrado." },
        { status: 409 },
      );
    }

    return Response.json({ code, participantToken, name }, { status: 201 });
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      return Response.json({ error: "No se pudo reservar tu lugar. Intenta otra vez." }, { status: 409 });
    }
    return roomError(error);
  }
}
