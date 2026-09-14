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

export async function GET(request: Request, context: RouteContext) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const token = bearerToken(request);
    if (code.length !== 6 || token.length < 20) {
      return Response.json({ error: "Acceso inválido." }, { status: 401 });
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

    if (token === room.host_token) {
      const [roster, hostParticipant] = await Promise.all([
        database
          .prepare(
            "SELECT id, name, joined_at FROM participants WHERE room_id = ? ORDER BY joined_at, id",
          )
          .bind(room.id)
          .all<Pick<ParticipantRecord, "id" | "name" | "joined_at">>(),
        database
          .prepare(
            `SELECT red_number, blue_number
             FROM participants WHERE room_id = ? AND access_token = ? LIMIT 1`,
          )
          .bind(room.id, room.host_token)
          .first<Pick<ParticipantRecord, "red_number" | "blue_number">>(),
      ]);

      return Response.json({
        role: "host",
        code: room.code,
        status: room.status === "drawn" ? "drawn" : "lobby",
        expectedParticipants: room.expected_participants,
        version: room.version,
        participants: roster.results,
        result:
          room.status === "drawn" &&
          hostParticipant?.red_number !== null &&
          hostParticipant?.red_number !== undefined &&
          hostParticipant.blue_number !== null
            ? {
                redNumber: hostParticipant.red_number,
                blueNumber: hostParticipant.blue_number,
              }
            : null,
      });
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

    return Response.json({
      role: "participant",
      code: room.code,
      name: participant.name,
      status: room.status === "drawn" ? "drawn" : "lobby",
      expectedParticipants: room.expected_participants,
      participantCount:
        room.status === "drawn"
          ? room.expected_participants
          : Math.max(0, room.version - 1),
      version: room.version,
      result:
        room.status === "drawn" && participant.red_number && participant.blue_number
          ? { redNumber: participant.red_number, blueNumber: participant.blue_number }
          : null,
    });
  } catch (error) {
    return roomError(error);
  }
}
