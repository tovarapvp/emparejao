import { getRawDb } from "@/db";
import {
  createChangedPairAssignments,
  createPairAssignments,
  type DrawAssignment,
} from "@/lib/draw";
import {
  bearerToken,
  normalizeCode,
  type ParticipantRecord,
  type RoomRecord,
  roomError,
} from "@/lib/room-api";
import { publishRoomEvent } from "@/lib/room-events";

interface RouteContext {
  params: Promise<{ code: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    let closeWithPresent = false;
    let includeHost = false;
    let redraw = false;
    try {
      const payload = (await request.json()) as {
        closeWithPresent?: unknown;
        includeHost?: unknown;
        redraw?: unknown;
      };
      closeWithPresent = payload.closeWithPresent === true;
      includeHost = payload.includeHost === true;
      redraw = payload.redraw === true;
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
    if (!redraw && room.status !== "lobby") {
      return Response.json({ error: "Este sorteo ya fue realizado." }, { status: 409 });
    }
    if (redraw && room.status !== "drawn") {
      return Response.json({ error: "Primero debes completar el sorteo inicial." }, { status: 409 });
    }

    const previousStatus = redraw ? "drawn" : "lobby";
    const claim = await database
      .prepare("UPDATE rooms SET status = 'drawing' WHERE id = ? AND status = ?")
      .bind(room.id, previousStatus)
      .run();
    if ((claim.meta.changes ?? 0) === 0) {
      return Response.json({ error: "El sorteo ya está en proceso." }, { status: 409 });
    }
    const roomId = room.id;

    const roster = await database
      .prepare(
        `SELECT id, name, red_number, blue_number, joined_at
         FROM participants WHERE room_id = ? ORDER BY joined_at, id`,
      )
      .bind(roomId)
      .all<Pick<ParticipantRecord, "id" | "name" | "red_number" | "blue_number" | "joined_at">>();

    async function restoreRoom(message: string) {
      await database
        .prepare("UPDATE rooms SET status = ? WHERE id = ? AND status = 'drawing'")
        .bind(previousStatus, roomId)
        .run();
      return Response.json({ error: message }, { status: 409 });
    }

    let drawingRoster = roster.results;
    let hostParticipantId: string | null = null;

    if (drawingRoster.length % 2 !== 0) {
      if (!includeHost) {
        return restoreRoom("El grupo actual es impar. Espera una persona más o súmate como comodín.");
      }
      hostParticipantId = crypto.randomUUID();
      drawingRoster = [
        ...drawingRoster,
        {
          id: hostParticipantId,
          name: "Organizador (comodín)",
          red_number: null,
          blue_number: null,
          joined_at: Date.now(),
        },
      ];
    } else if (includeHost) {
      return restoreRoom("El organizador solo puede sumarse cuando el grupo es impar.");
    }

    if (drawingRoster.length < 2) {
      return restoreRoom("Necesitas al menos 2 personas para realizar el sorteo.");
    }
    if (!closeWithPresent && drawingRoster.length !== room.expected_participants) {
      return restoreRoom(`Faltan ${room.expected_participants - drawingRoster.length} personas por entrar.`);
    }

    let assignments: DrawAssignment[];
    if (redraw) {
      if (drawingRoster.length < 4) {
        return restoreRoom("Se necesitan al menos 4 participantes para cambiar las parejas.");
      }
      const participantByRedNumber = new Map(
        drawingRoster
          .filter((participant) => participant.red_number !== null)
          .map((participant) => [participant.red_number, participant.id]),
      );
      const previousPartnerById = new Map<string, string>();
      for (const participant of drawingRoster) {
        if (participant.blue_number === null) {
          return restoreRoom("No se pudo reconstruir el sorteo anterior.");
        }
        const partnerId = participantByRedNumber.get(participant.blue_number);
        if (!partnerId) return restoreRoom("No se pudo reconstruir el sorteo anterior.");
        previousPartnerById.set(participant.id, partnerId);
      }
      assignments = createChangedPairAssignments(drawingRoster, previousPartnerById);
    } else {
      assignments = createPairAssignments(drawingRoster);
    }
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
        .prepare("UPDATE rooms SET status = ? WHERE id = ? AND status = 'drawing'")
        .bind(previousStatus, room.id)
        .run();
      throw error;
    }

    const hostAssignment = hostParticipantId
      ? assignments.find((assignment) => assignment.participantId === hostParticipantId)
      : undefined;
    await publishRoomEvent(code, { type: "draw_started", redraw }, "participant");
    return Response.json({
      status: "drawn",
      participantCount: assignments.length,
      redraw,
      hostResult: hostAssignment
        ? { redNumber: hostAssignment.redNumber, blueNumber: hostAssignment.blueNumber }
        : null,
    });
  } catch (error) {
    return roomError(error);
  }
}
