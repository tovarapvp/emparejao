import { getRawDb } from "@/db";
import { createPairAssignments } from "@/lib/draw";
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

export async function POST(request: Request, context: RouteContext) {
  try {
    let closeWithPresent = false;
    let includeHost = false;
    try {
      const payload = (await request.json()) as {
        closeWithPresent?: unknown;
        includeHost?: unknown;
      };
      closeWithPresent = payload.closeWithPresent === true;
      includeHost = payload.includeHost === true;
    } catch {
      // Requests from older clients still start normally when the room is full.
    }

    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const hostToken = bearerToken(request);
    const database = getRawDb();
    const room = await database
      .prepare(
        `SELECT id, code, host_token, expected_participants, status, expires_at, version
         FROM rooms WHERE code = ? AND expires_at > ? LIMIT 1`,
      )
      .bind(code, Date.now())
      .first<RoomRecord>();

    if (!room || room.host_token !== hostToken) {
      return Response.json({ error: "Solo el organizador puede iniciar el sorteo." }, { status: 403 });
    }
    if (room.status !== "lobby") {
      return Response.json({ error: "Este sorteo ya fue realizado." }, { status: 409 });
    }

    const claim = await database
      .prepare("UPDATE rooms SET status = 'drawing' WHERE id = ? AND status = 'lobby'")
      .bind(room.id)
      .run();
    if ((claim.meta.changes ?? 0) === 0) {
      return Response.json({ error: "El sorteo ya está en proceso." }, { status: 409 });
    }

    const roster = await database
      .prepare("SELECT id, name, joined_at FROM participants WHERE room_id = ? ORDER BY joined_at, id")
      .bind(room.id)
      .all<Pick<ParticipantRecord, "id" | "name" | "joined_at">>();

    async function reopenLobby(message: string) {
      await database
        .prepare("UPDATE rooms SET status = 'lobby' WHERE id = ? AND status = 'drawing'")
        .bind(room.id)
        .run();
      return Response.json({ error: message }, { status: 409 });
    }

    let drawingRoster = roster.results;
    let hostParticipantId: string | null = null;

    if (drawingRoster.length % 2 !== 0) {
      if (!includeHost) {
        return reopenLobby("El grupo actual es impar. Espera una persona más o súmate como comodín.");
      }
      hostParticipantId = crypto.randomUUID();
      drawingRoster = [
        ...drawingRoster,
        { id: hostParticipantId, name: "Organizador (comodín)", joined_at: Date.now() },
      ];
    } else if (includeHost) {
      return reopenLobby("El organizador solo puede sumarse cuando el grupo es impar.");
    }

    if (drawingRoster.length < 2) {
      return reopenLobby("Necesitas al menos 2 personas para realizar el sorteo.");
    }
    if (!closeWithPresent && drawingRoster.length !== room.expected_participants) {
      return reopenLobby(`Faltan ${room.expected_participants - drawingRoster.length} personas por entrar.`);
    }

    const assignments = createPairAssignments(drawingRoster);
    const updates = [];
    if (hostParticipantId) {
      updates.push(
        database
          .prepare(
            `INSERT INTO participants (id, room_id, name, access_token, joined_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            hostParticipantId,
            room.id,
            "Organizador (comodín)",
            room.host_token,
            Date.now(),
          ),
      );
    }
    updates.push(...assignments.map((assignment) =>
      database
        .prepare(
          "UPDATE participants SET red_number = ?, blue_number = ? WHERE id = ? AND room_id = ?",
        )
        .bind(
          assignment.redNumber,
          assignment.blueNumber,
          assignment.participantId,
          room.id,
        ),
    ));
    updates.push(
      database
        .prepare(
          `UPDATE rooms
           SET status = 'drawn', expected_participants = ?, version = version + 1
           WHERE id = ? AND status = 'drawing'`,
        )
        .bind(assignments.length, room.id),
    );
    try {
      await database.batch(updates);
    } catch (error) {
      await database
        .prepare("UPDATE rooms SET status = 'lobby' WHERE id = ? AND status = 'drawing'")
        .bind(room.id)
        .run();
      throw error;
    }

    const hostAssignment = hostParticipantId
      ? assignments.find((assignment) => assignment.participantId === hostParticipantId)
      : undefined;
    return Response.json({
      status: "drawn",
      participantCount: assignments.length,
      hostResult: hostAssignment
        ? { redNumber: hostAssignment.redNumber, blueNumber: hostAssignment.blueNumber }
        : null,
    });
  } catch (error) {
    return roomError(error);
  }
}
