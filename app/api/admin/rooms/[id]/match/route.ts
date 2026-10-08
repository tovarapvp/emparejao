import { getRawDb } from "@/db";
import { adminIdentity } from "@/lib/admin-auth";
import { publishRoomEvent } from "@/lib/room-events";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface MatchPayload {
  firstParticipantId?: unknown;
  secondParticipantId?: unknown;
}

interface MatchRoomRecord {
  id: string;
  code: string;
  status: string;
  expires_at: number;
  archived_at: number | null;
}

interface MatchParticipantRecord {
  id: string;
  name: string;
  red_number: number | null;
  blue_number: number | null;
}

function reciprocalPartner(
  participant: MatchParticipantRecord,
  byRedNumber: ReadonlyMap<number, MatchParticipantRecord>,
) {
  if (participant.red_number === null || participant.blue_number === null) return null;
  const partner = byRedNumber.get(participant.blue_number);
  return partner && partner.id !== participant.id && partner.blue_number === participant.red_number
    ? partner
    : null;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const database = getRawDb();
    const admin = await adminIdentity(request, database);
    if (!admin) return Response.json({ error: "Acceso administrativo requerido." }, { status: 401 });

    const { id: roomId } = await context.params;
    const payload = (await request.json()) as MatchPayload;
    const firstId = typeof payload.firstParticipantId === "string" ? payload.firstParticipantId : "";
    const secondId = typeof payload.secondParticipantId === "string" ? payload.secondParticipantId : "";
    if (!firstId || !secondId || firstId === secondId) {
      return Response.json({ error: "Selecciona dos personas diferentes." }, { status: 400 });
    }

    const [room, roster] = await Promise.all([
      database
        .prepare("SELECT id, code, status, expires_at, archived_at FROM rooms WHERE id = ? LIMIT 1")
        .bind(roomId)
        .first<MatchRoomRecord>(),
      database
        .prepare(
          `SELECT id, name, red_number, blue_number
           FROM participants WHERE room_id = ? ORDER BY joined_at, id`,
        )
        .bind(roomId)
        .all<MatchParticipantRecord>(),
    ]);
    if (!room) return Response.json({ error: "La sala no existe." }, { status: 404 });
    if (room.archived_at !== null) {
      return Response.json({ error: "La sala archivada no puede modificarse." }, { status: 409 });
    }
    if (room.expires_at <= Date.now()) {
      return Response.json({ error: "La sala ya venció y no puede modificarse." }, { status: 409 });
    }
    if (room.status !== "drawn") {
      return Response.json(
        { error: "Espera a que el organizador complete el sorteo." },
        { status: 409 },
      );
    }

    const first = roster.results.find((participant) => participant.id === firstId);
    const second = roster.results.find((participant) => participant.id === secondId);
    if (!first || !second) {
      return Response.json({ error: "Una de las personas ya no está en la sala." }, { status: 404 });
    }

    const byRedNumber = new Map(
      roster.results.flatMap((participant) =>
        participant.red_number === null ? [] : [[participant.red_number, participant] as const],
      ),
    );
    if (reciprocalPartner(first, byRedNumber) || reciprocalPartner(second, byRedNumber)) {
      return Response.json(
        { error: "Solo puedes unir personas que estén realmente sin pareja." },
        { status: 409 },
      );
    }

    const selectedRedNumbers = new Set(
      [first.red_number, second.red_number].filter((number): number is number => number !== null),
    );
    const referencedByOthers = roster.results.some(
      (participant) =>
        participant.id !== first.id &&
        participant.id !== second.id &&
        participant.blue_number !== null &&
        selectedRedNumbers.has(participant.blue_number),
    );
    if (referencedByOthers) {
      return Response.json(
        { error: "La asignación está relacionada con otra persona. Usa Cambiar parejas desde el host." },
        { status: 409 },
      );
    }

    const usedNumbers = new Set(
      roster.results.flatMap((participant) =>
        participant.id === first.id || participant.id === second.id || participant.red_number === null
          ? []
          : [participant.red_number],
      ),
    );
    let nextNumber = Math.max(0, ...usedNumbers) + 1;
    function availableNumber(preferred: number | null) {
      if (preferred !== null && !usedNumbers.has(preferred)) {
        usedNumbers.add(preferred);
        return preferred;
      }
      while (usedNumbers.has(nextNumber)) nextNumber += 1;
      const assigned = nextNumber;
      usedNumbers.add(assigned);
      nextNumber += 1;
      return assigned;
    }
    const firstNumber = availableNumber(first.red_number);
    const secondNumber = availableNumber(second.red_number);
    const now = Date.now();

    await database.batch([
      database
        .prepare(
          `UPDATE participants
           SET red_number = ?, blue_number = ?, result_viewed_at = NULL, pair_confirmed_at = NULL
           WHERE id = ? AND room_id = ?`,
        )
        .bind(firstNumber, secondNumber, first.id, room.id),
      database
        .prepare(
          `UPDATE participants
           SET red_number = ?, blue_number = ?, result_viewed_at = NULL, pair_confirmed_at = NULL
           WHERE id = ? AND room_id = ?`,
        )
        .bind(secondNumber, firstNumber, second.id, room.id),
      database
        .prepare("UPDATE rooms SET status = 'drawn', version = version + 1 WHERE id = ?")
        .bind(room.id),
      database
        .prepare(
          `INSERT INTO admin_audit_logs
           (id, admin_user_id, action, room_id, details, created_at)
           VALUES (?, ?, 'manual_match', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          room.id,
          JSON.stringify({ firstParticipantId: first.id, secondParticipantId: second.id }),
          now,
        ),
    ]);

    await publishRoomEvent(room.code, { type: "draw_started", redraw: true }, "participant");
    return Response.json({
      matched: true,
      first: { id: first.id, name: first.name, number: firstNumber },
      second: { id: second.id, name: second.name, number: secondNumber },
    });
  } catch {
    return Response.json({ error: "No se pudo guardar la pareja manual." }, { status: 500 });
  }
}
