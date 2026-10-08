import { getRawDb } from "@/db";
import { bearerToken, normalizeCode, roomError } from "@/lib/room-api";

const PARTICIPANT_STATUS_ACTION = {
  RESULT_VIEWED: "result_viewed",
  CONFIRM_PAIR: "confirm_pair",
} as const;

type ParticipantStatusAction =
  (typeof PARTICIPANT_STATUS_ACTION)[keyof typeof PARTICIPANT_STATUS_ACTION];

interface RouteContext {
  params: Promise<{ code: string }>;
}

interface StatusPayload {
  action?: unknown;
}

interface StatusParticipantRecord {
  id: string;
  red_number: number | null;
  blue_number: number | null;
}

function isParticipantStatusAction(value: unknown): value is ParticipantStatusAction {
  return Object.values(PARTICIPANT_STATUS_ACTION).some((action) => action === value);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const token = bearerToken(request);
    const payload = (await request.json()) as StatusPayload;
    if (code.length !== 6 || token.length < 20 || !isParticipantStatusAction(payload.action)) {
      return Response.json({ error: "Estado de participante inválido." }, { status: 400 });
    }

    const database = getRawDb();
    const participant = await database
      .prepare(
        `SELECT p.id, p.red_number, p.blue_number
         FROM participants p
         JOIN rooms r ON r.id = p.room_id
         WHERE r.code = ? AND r.expires_at > ? AND p.access_token = ? LIMIT 1`,
      )
      .bind(code, Date.now(), token)
      .first<StatusParticipantRecord>();
    if (!participant) {
      return Response.json({ error: "Tu acceso a la sala no es válido." }, { status: 401 });
    }
    if (participant.red_number === null || participant.blue_number === null) {
      return Response.json({ error: "El sorteo todavía no ha comenzado." }, { status: 409 });
    }

    const now = Date.now();
    if (payload.action === PARTICIPANT_STATUS_ACTION.RESULT_VIEWED) {
      await database
        .prepare(
          `UPDATE participants
           SET result_viewed_at = COALESCE(result_viewed_at, ?), last_seen_at = ?
           WHERE id = ?`,
        )
        .bind(now, now, participant.id)
        .run();
      return Response.json({ updated: true, resultViewedAt: now });
    }

    await database
      .prepare("UPDATE participants SET pair_confirmed_at = ?, last_seen_at = ? WHERE id = ?")
      .bind(now, now, participant.id)
      .run();
    return Response.json({ updated: true, pairConfirmedAt: now });
  } catch (error) {
    return roomError(error);
  }
}
