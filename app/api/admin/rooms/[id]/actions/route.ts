import { getRawDb } from "@/db";
import { adminIdentity } from "@/lib/admin-auth";
import {
  ADMIN_ROOM_ACTION,
  auditStatement,
  type AdminRoomAction,
} from "@/lib/admin-operations";
import { createChangedPairAssignments } from "@/lib/draw";
import { publishRoomEvent } from "@/lib/room-events";

const MAX_EXTENSION_MINUTES = 7 * 24 * 60;
const MAX_PARTICIPANTS = 800;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ActionPayload {
  action?: unknown;
  minutes?: unknown;
  expectedParticipants?: unknown;
}

interface ActionRoomRecord {
  id: string;
  code: string;
  status: string;
  expected_participants: number;
  participant_count: number;
  expires_at: number;
  archived_at: number | null;
  join_locked: number;
}

interface DrawParticipantRecord {
  id: string;
  name: string;
  red_number: number | null;
  blue_number: number | null;
  joined_at: number;
}

function isRoomAction(value: unknown): value is AdminRoomAction {
  return Object.values(ADMIN_ROOM_ACTION).some((action) => action === value);
}

function validatedExtensionMinutes(value: unknown) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_EXTENSION_MINUTES
    ? minutes
    : null;
}

function hasCompletePairing(participants: readonly DrawParticipantRecord[]) {
  if (participants.length < 4 || participants.length % 2 !== 0) return false;
  const byRedNumber = new Map<number, DrawParticipantRecord>();
  for (const participant of participants) {
    if (participant.red_number === null || participant.blue_number === null) return false;
    if (byRedNumber.has(participant.red_number)) return false;
    byRedNumber.set(participant.red_number, participant);
  }
  return participants.every((participant) => {
    const partner = byRedNumber.get(participant.blue_number ?? -1);
    return partner?.id !== participant.id && partner?.blue_number === participant.red_number;
  });
}

async function roomAndAdmin(request: Request, roomId: string) {
  const database = getRawDb();
  const admin = await adminIdentity(request, database);
  if (!admin) return { database, admin: null, room: null };
  const room = await database
    .prepare(
      `SELECT r.id, r.code, r.status, r.expected_participants, r.expires_at,
              r.archived_at, r.join_locked,
              (SELECT COUNT(*) FROM participants p WHERE p.room_id = r.id) AS participant_count
       FROM rooms r WHERE r.id = ? LIMIT 1`,
    )
    .bind(roomId)
    .first<ActionRoomRecord>();
  return { database, admin, room };
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: roomId } = await context.params;
    const payload = (await request.json().catch(() => null)) as ActionPayload | null;
    const action = payload?.action;
    if (!isRoomAction(action)) {
      return Response.json({ error: "La acción administrativa no es válida." }, { status: 400 });
    }

    const { database, admin, room } = await roomAndAdmin(request, roomId);
    if (!admin) return Response.json({ error: "Acceso administrativo requerido." }, { status: 401 });
    if (!room) return Response.json({ error: "La sala no existe." }, { status: 404 });
    if (room.archived_at !== null) {
      return Response.json({ error: "La sala archivada no puede modificarse." }, { status: 409 });
    }
    if (
      room.status === "drawing" &&
      (action === ADMIN_ROOM_ACTION.RESET_DRAW ||
        action === ADMIN_ROOM_ACTION.INCREASE_CAPACITY ||
        action === ADMIN_ROOM_ACTION.REDRAW ||
        action === ADMIN_ROOM_ACTION.ARCHIVE)
    ) {
      return Response.json(
        { error: "Hay un sorteo en proceso. Espera a que termine antes de cambiar su estado." },
        { status: 409 },
      );
    }

    const now = Date.now();
    if (action === ADMIN_ROOM_ACTION.EXTEND_EXPIRY) {
      const minutes = validatedExtensionMinutes(payload?.minutes);
      if (minutes === null) {
        return Response.json(
          { error: `Indica una extensión entre 1 y ${MAX_EXTENSION_MINUTES} minutos.` },
          { status: 400 },
        );
      }
      const expiresAt = Math.max(room.expires_at, now) + minutes * 60_000;
      await database.batch([
        database.prepare("UPDATE rooms SET expires_at = ? WHERE id = ?").bind(expiresAt, room.id),
        auditStatement(database, admin, "extend_expiry", room.id, { minutes, expiresAt }, now),
      ]);
      return Response.json({ action, expiresAt });
    }

    if (action === ADMIN_ROOM_ACTION.INCREASE_CAPACITY) {
      const expectedParticipants = Number(payload?.expectedParticipants);
      if (
        !Number.isInteger(expectedParticipants) ||
        expectedParticipants < 2 ||
        expectedParticipants > MAX_PARTICIPANTS ||
        expectedParticipants % 2 !== 0
      ) {
        return Response.json(
          { error: `El nuevo cupo debe ser un número par entre 2 y ${MAX_PARTICIPANTS}.` },
          { status: 400 },
        );
      }
      if (expectedParticipants <= room.expected_participants) {
        return Response.json(
          { error: `El nuevo cupo debe ser mayor que ${room.expected_participants}.` },
          { status: 400 },
        );
      }
      if (room.expires_at <= now) {
        return Response.json(
          { error: "La sala ya venció. Extiende su vigencia antes de aumentar el cupo." },
          { status: 409 },
        );
      }

      const resetDraw = room.status === "drawn";
      await database.batch([
        database
          .prepare(
            `UPDATE participants
             SET red_number = NULL, blue_number = NULL, result_viewed_at = NULL,
                 pair_confirmed_at = NULL
             WHERE room_id = ? AND ? = 1`,
          )
          .bind(room.id, resetDraw ? 1 : 0),
        database
          .prepare(
            `UPDATE rooms
             SET expected_participants = ?, status = 'lobby', join_locked = 0,
                 version = version + 1
             WHERE id = ?`,
          )
          .bind(expectedParticipants, room.id),
        auditStatement(database, admin, action, room.id, {
          previousExpectedParticipants: room.expected_participants,
          expectedParticipants,
          resetDraw,
          participantCount: room.participant_count,
        }, now),
      ]);
      await publishRoomEvent(room.code, {
        type: "room_updated",
        participantCount: room.participant_count,
      });
      return Response.json({
        action,
        expectedParticipants,
        status: "lobby",
        joinLocked: false,
        resetDraw,
      });
    }

    if (action === ADMIN_ROOM_ACTION.LOCK_JOINS || action === ADMIN_ROOM_ACTION.UNLOCK_JOINS) {
      if (room.status !== "lobby") {
        return Response.json(
          {
            error:
              "Las entradas solo se pueden cambiar mientras la sala está en espera. Reinicia el sorteo si necesitas admitir más personas.",
          },
          { status: 409 },
        );
      }
      if (
        action === ADMIN_ROOM_ACTION.UNLOCK_JOINS &&
        room.participant_count >= room.expected_participants
      ) {
        return Response.json(
          { error: "La sala ya alcanzó su cupo máximo y no admite más personas." },
          { status: 409 },
        );
      }
      const joinLocked = action === ADMIN_ROOM_ACTION.LOCK_JOINS;
      await database.batch([
        database
          .prepare("UPDATE rooms SET join_locked = ? WHERE id = ?")
          .bind(joinLocked ? 1 : 0, room.id),
        auditStatement(database, admin, action, room.id, { joinLocked }, now),
      ]);
      return Response.json({ action, joinLocked });
    }

    if (action === ADMIN_ROOM_ACTION.ARCHIVE) {
      await database.batch([
        database
          .prepare("UPDATE rooms SET archived_at = ?, join_locked = 1 WHERE id = ?")
          .bind(now, room.id),
        auditStatement(database, admin, action, room.id, { archivedAt: now }, now),
      ]);
      return Response.json({ action, archivedAt: now, joinLocked: true });
    }

    const roster = await database
      .prepare(
        `SELECT id, name, red_number, blue_number, joined_at
         FROM participants WHERE room_id = ? ORDER BY joined_at, id`,
      )
      .bind(room.id)
      .all<DrawParticipantRecord>();

    if (action === ADMIN_ROOM_ACTION.RESET_DRAW) {
      await database.batch([
        database
          .prepare(
            `UPDATE participants
             SET red_number = NULL, blue_number = NULL, result_viewed_at = NULL,
                 pair_confirmed_at = NULL
             WHERE room_id = ?`,
          )
          .bind(room.id),
        database
          .prepare("UPDATE rooms SET status = 'lobby', version = version + 1 WHERE id = ?")
          .bind(room.id),
        auditStatement(
          database,
          admin,
          action,
          room.id,
          { previousStatus: room.status, participantCount: roster.results.length },
          now,
        ),
      ]);
      await publishRoomEvent(room.code, {
        type: "room_updated",
        participantCount: roster.results.length,
      });
      return Response.json({ action, status: "lobby", participantCount: roster.results.length });
    }

    if (room.status !== "drawn" || !hasCompletePairing(roster.results)) {
      return Response.json(
        { error: "Solo puedes rehacer un sorteo completo y válido. Restablécelo primero si hay incidencias." },
        { status: 409 },
      );
    }

    const claim = await database
      .prepare("UPDATE rooms SET status = 'drawing' WHERE id = ? AND status = 'drawn'")
      .bind(room.id)
      .run();
    if ((claim.meta.changes ?? 0) !== 1) {
      return Response.json({ error: "La sala está siendo modificada por otra operación." }, { status: 409 });
    }

    try {
      const participantByRedNumber = new Map<number, string>();
      for (const participant of roster.results) {
        if (participant.red_number !== null) {
          participantByRedNumber.set(participant.red_number, participant.id);
        }
      }
      const previousPartnerById = new Map<string, string>();
      for (const participant of roster.results) {
        if (participant.blue_number === null) continue;
        const partnerId = participantByRedNumber.get(participant.blue_number);
        if (partnerId) previousPartnerById.set(participant.id, partnerId);
      }
      const assignments = createChangedPairAssignments(roster.results, previousPartnerById);
      await database.batch([
        ...assignments.map((assignment) =>
          database
            .prepare(
              `UPDATE participants
               SET red_number = ?, blue_number = ?, result_viewed_at = NULL,
                   pair_confirmed_at = NULL
               WHERE id = ? AND room_id = ?`,
            )
            .bind(assignment.redNumber, assignment.blueNumber, assignment.participantId, room.id),
        ),
        database
          .prepare("UPDATE rooms SET status = 'drawn', version = version + 1 WHERE id = ? AND status = 'drawing'")
          .bind(room.id),
        auditStatement(database, admin, action, room.id, { participantCount: assignments.length }, now),
      ]);
      await publishRoomEvent(room.code, { type: "draw_started", redraw: true }, "participant");
      return Response.json({ action, status: "drawn", participantCount: assignments.length });
    } catch (error) {
      await database
        .prepare("UPDATE rooms SET status = 'drawn' WHERE id = ? AND status = 'drawing'")
        .bind(room.id)
        .run();
      throw error;
    }
  } catch {
    return Response.json({ error: "No se pudo completar la operación administrativa." }, { status: 500 });
  }
}
