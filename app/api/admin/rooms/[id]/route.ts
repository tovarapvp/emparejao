import { getRawDb } from "@/db";
import { adminIdentity } from "@/lib/admin-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface AdminRoomDetailRecord {
  id: string;
  code: string;
  expected_participants: number;
  status: string;
  created_at: number;
  expires_at: number;
  version: number;
}

interface AdminParticipantRecord {
  id: string;
  name: string;
  red_number: number | null;
  blue_number: number | null;
  joined_at: number;
}

interface AdminPairParticipant {
  id: string;
  name: string;
  number: number;
}

interface AdminPair {
  id: string;
  first: AdminPairParticipant;
  second: AdminPairParticipant;
}

function groupParticipants(participants: AdminParticipantRecord[]) {
  const byRedNumber = new Map<number, AdminParticipantRecord>();
  const duplicateNumbers = new Set<number>();
  for (const participant of participants) {
    if (participant.red_number === null) continue;
    if (byRedNumber.has(participant.red_number)) duplicateNumbers.add(participant.red_number);
    byRedNumber.set(participant.red_number, participant);
  }

  const pairedIds = new Set<string>();
  const pairs: AdminPair[] = [];
  for (const participant of participants) {
    if (
      pairedIds.has(participant.id) ||
      participant.red_number === null ||
      participant.blue_number === null ||
      duplicateNumbers.has(participant.red_number)
    ) continue;
    const partner = byRedNumber.get(participant.blue_number);
    if (
      !partner ||
      partner.id === participant.id ||
      partner.red_number === null ||
      partner.blue_number !== participant.red_number ||
      duplicateNumbers.has(partner.red_number)
    ) continue;

    pairedIds.add(participant.id);
    pairedIds.add(partner.id);
    const ordered = [participant, partner].sort((left, right) =>
      (left.red_number ?? 0) - (right.red_number ?? 0),
    );
    pairs.push({
      id: `${ordered[0].id}:${ordered[1].id}`,
      first: {
        id: ordered[0].id,
        name: ordered[0].name,
        number: ordered[0].red_number ?? 0,
      },
      second: {
        id: ordered[1].id,
        name: ordered[1].name,
        number: ordered[1].red_number ?? 0,
      },
    });
  }

  return {
    pairs: pairs.sort((left, right) => left.first.number - right.first.number),
    unmatched: participants
      .filter((participant) => !pairedIds.has(participant.id))
      .map((participant) => ({
        id: participant.id,
        name: participant.name,
        redNumber: participant.red_number,
        blueNumber: participant.blue_number,
        joinedAt: participant.joined_at,
      })),
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const database = getRawDb();
    const admin = await adminIdentity(request, database);
    if (!admin) return Response.json({ error: "Acceso administrativo requerido." }, { status: 401 });

    const { id } = await context.params;
    const [room, roster] = await Promise.all([
      database
        .prepare(
          `SELECT id, code, expected_participants, status, created_at, expires_at, version
           FROM rooms WHERE id = ? LIMIT 1`,
        )
        .bind(id)
        .first<AdminRoomDetailRecord>(),
      database
        .prepare(
          `SELECT id, name, red_number, blue_number, joined_at
           FROM participants WHERE room_id = ? ORDER BY joined_at, id`,
        )
        .bind(id)
        .all<AdminParticipantRecord>(),
    ]);
    if (!room) return Response.json({ error: "La sala no existe." }, { status: 404 });

    const grouped = groupParticipants(roster.results);
    return Response.json(
      {
        room: {
          id: room.id,
          code: room.code,
          status: room.status,
          active: room.expires_at > Date.now(),
          expectedParticipants: room.expected_participants,
          participantCount: roster.results.length,
          createdAt: room.created_at,
          expiresAt: room.expires_at,
          version: room.version,
        },
        participants: roster.results.map((participant) => ({
          id: participant.id,
          name: participant.name,
          redNumber: participant.red_number,
          blueNumber: participant.blue_number,
          joinedAt: participant.joined_at,
        })),
        ...grouped,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "No se pudo cargar el detalle de la sala." }, { status: 500 });
  }
}
