import { getRawDb } from "@/db";
import { adminIdentity } from "@/lib/admin-auth";
import {
  ADMIN_PARTICIPANT_ACTION,
  auditStatement,
  type AdminParticipantAction,
} from "@/lib/admin-operations";
import { sendDrawPush, type PushSubscriptionRecord } from "@/lib/push";
import { normalizeName } from "@/lib/room-api";
import { publishParticipantRoomEvent, publishRoomEvent } from "@/lib/room-events";

interface RouteContext {
  params: Promise<{ id: string; participantId: string }>;
}

interface ParticipantActionPayload {
  action?: unknown;
  name?: unknown;
}

interface ParticipantActionRoomRecord {
  id: string;
  code: string;
  status: string;
  archived_at: number | null;
}

interface ParticipantActionRecord {
  id: string;
  name: string;
  red_number: number | null;
  blue_number: number | null;
}

function isParticipantAction(value: unknown): value is AdminParticipantAction {
  return Object.values(ADMIN_PARTICIPANT_ACTION).some((action) => action === value);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: roomId, participantId } = await context.params;
    const payload = (await request.json().catch(() => null)) as ParticipantActionPayload | null;
    if (!isParticipantAction(payload?.action)) {
      return Response.json({ error: "La acción de participante no es válida." }, { status: 400 });
    }
    const action = payload.action;
    const database = getRawDb();
    const admin = await adminIdentity(request, database);
    if (!admin) return Response.json({ error: "Acceso administrativo requerido." }, { status: 401 });

    const room = await database
      .prepare("SELECT id, code, status, archived_at FROM rooms WHERE id = ? LIMIT 1")
      .bind(roomId)
      .first<ParticipantActionRoomRecord>();
    if (!room) return Response.json({ error: "La sala no existe." }, { status: 404 });
    if (room.archived_at !== null) {
      return Response.json({ error: "La sala archivada no puede modificarse." }, { status: 409 });
    }

    const participant = await database
      .prepare(
        `SELECT id, name, red_number, blue_number
         FROM participants WHERE id = ? AND room_id = ? LIMIT 1`,
      )
      .bind(participantId, room.id)
      .first<ParticipantActionRecord>();
    if (!participant) return Response.json({ error: "La persona no está en esta sala." }, { status: 404 });

    const now = Date.now();
    if (action === ADMIN_PARTICIPANT_ACTION.RENAME) {
      const name = normalizeName(typeof payload?.name === "string" ? payload.name : "");
      if (name.length < 2) {
        return Response.json({ error: "El nombre debe tener al menos dos caracteres." }, { status: 400 });
      }
      const duplicate = await database
        .prepare(
          `SELECT id FROM participants
           WHERE room_id = ? AND lower(name) = lower(?) AND id <> ? LIMIT 1`,
        )
        .bind(room.id, name, participant.id)
        .first<{ id: string }>();
      if (duplicate) {
        return Response.json({ error: "Ya existe una persona con ese nombre en la sala." }, { status: 409 });
      }
      await database.batch([
        database.prepare("UPDATE participants SET name = ? WHERE id = ?").bind(name, participant.id),
        auditStatement(database, admin, action, room.id, {
          participantId: participant.id,
          previousName: participant.name,
          name,
        }, now),
      ]);
      return Response.json({ action, participant: { id: participant.id, name } });
    }

    if (action === ADMIN_PARTICIPANT_ACTION.DELETE) {
      if (room.status !== "lobby") {
        return Response.json(
          { error: "Solo puedes eliminar participantes antes del sorteo; restablece la sala primero." },
          { status: 409 },
        );
      }
      if (participant.red_number !== null || participant.blue_number !== null) {
        return Response.json({ error: "No puedes eliminar una persona que conserva una asignación." }, { status: 409 });
      }
      const references = await database
        .prepare(
          `SELECT id FROM participants
           WHERE room_id = ? AND blue_number IS NOT NULL AND blue_number = ? AND id <> ? LIMIT 1`,
        )
        .bind(room.id, participant.red_number, participant.id)
        .first<{ id: string }>();
      if (references) {
        return Response.json({ error: "No puedes eliminar una persona referenciada por una pareja." }, { status: 409 });
      }
      const participantCount = await database
        .prepare("SELECT COUNT(*) AS count FROM participants WHERE room_id = ?")
        .bind(room.id)
        .first<{ count: number }>();
      await database.batch([
        database.prepare("DELETE FROM participants WHERE id = ? AND room_id = ?").bind(participant.id, room.id),
        database.prepare("UPDATE rooms SET version = version + 1 WHERE id = ?").bind(room.id),
        auditStatement(database, admin, action, room.id, {
          participantId: participant.id,
          name: participant.name,
        }, now),
      ]);
      const remainingParticipants = Math.max(0, (participantCount?.count ?? 1) - 1);
      await publishRoomEvent(room.code, { type: "room_updated", participantCount: remainingParticipants });
      return Response.json({ action, deleted: true, participantCount: remainingParticipants });
    }

    if (action === ADMIN_PARTICIPANT_ACTION.RESEND_RESULT) {
      if (
        room.status !== "drawn" ||
        participant.red_number === null ||
        participant.blue_number === null
      ) {
        return Response.json({ error: "La persona todavía no tiene un resultado que reenviar." }, { status: 409 });
      }
      const subscription = await database
        .prepare(
          `SELECT id, endpoint, p256dh, auth
           FROM push_subscriptions WHERE participant_id = ? LIMIT 1`,
        )
        .bind(participant.id)
        .first<PushSubscriptionRecord>();
      const delivery = subscription
        ? await sendDrawPush(subscription, room.code).catch(() => ({ delivered: false, expired: false }))
        : null;
      const operations = [
        auditStatement(database, admin, action, room.id, {
          participantId: participant.id,
          pushAttempted: Boolean(subscription),
          pushDelivered: delivery?.delivered ?? false,
        }, now),
      ];
      if (subscription && delivery?.expired) {
        operations.unshift(
          database.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(subscription.id),
          database.prepare("UPDATE participants SET notification_enabled = 0 WHERE id = ?").bind(participant.id),
        );
      }
      await database.batch(operations);
      await publishParticipantRoomEvent(room.code, participant.id, { type: "draw_started" });
      return Response.json({
        action,
        eventDelivered: true,
        pushAttempted: Boolean(subscription),
        pushDelivered: delivery?.delivered ?? false,
      });
    }

    const confirm = action === ADMIN_PARTICIPANT_ACTION.CONFIRM_PAIR;
    if (
      confirm &&
      (room.status !== "drawn" || participant.red_number === null || participant.blue_number === null)
    ) {
      return Response.json({ error: "La persona todavía no tiene una pareja que confirmar." }, { status: 409 });
    }
    await database.batch([
      database
        .prepare("UPDATE participants SET pair_confirmed_at = ? WHERE id = ?")
        .bind(confirm ? now : null, participant.id),
      auditStatement(database, admin, action, room.id, {
        participantId: participant.id,
        confirmed: confirm,
      }, now),
    ]);
    return Response.json({ action, pairConfirmedAt: confirm ? now : null });
  } catch {
    return Response.json({ error: "No se pudo completar la acción de participante." }, { status: 500 });
  }
}
