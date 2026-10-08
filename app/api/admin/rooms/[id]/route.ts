import { getRawDb } from "@/db";
import { env } from "cloudflare:workers";
import { adminIdentity } from "@/lib/admin-auth";
import { isRecentPresence } from "@/lib/admin-operations";

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
  join_locked: number;
  archived_at: number | null;
}

interface AdminParticipantRecord {
  id: string;
  name: string;
  red_number: number | null;
  blue_number: number | null;
  joined_at: number;
  last_seen_at: number | null;
  result_viewed_at: number | null;
  notification_enabled: number;
  pair_confirmed_at: number | null;
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
    duplicateNumbers: [...duplicateNumbers].sort((left, right) => left - right),
  };
}

function duplicateNames(participants: readonly AdminParticipantRecord[]) {
  const byName = new Map<string, AdminParticipantRecord[]>();
  for (const participant of participants) {
    const key = participant.name.trim().toLocaleLowerCase();
    const records = byName.get(key) ?? [];
    records.push(participant);
    byName.set(key, records);
  }
  return [...byName.values()]
    .filter((records) => records.length > 1)
    .map((records) => ({
      name: records[0]?.name ?? "",
      participantIds: records.map((participant) => participant.id),
    }));
}

async function connectedParticipantIds(roomCode: string) {
  const namespace = env.ROOM_HUB;
  if (!namespace) return null;
  try {
    const response = await namespace
      .getByName(roomCode)
      .fetch("https://room-hub.internal/presence");
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return null;
    const participantIds = (body as Record<string, unknown>).participantIds;
    if (!Array.isArray(participantIds) || !participantIds.every((id) => typeof id === "string")) {
      return null;
    }
    return new Set(participantIds);
  } catch {
    return null;
  }
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
          `SELECT id, code, expected_participants, status, join_locked, archived_at,
                  created_at, expires_at, version
           FROM rooms WHERE id = ? LIMIT 1`,
        )
        .bind(id)
        .first<AdminRoomDetailRecord>(),
      database
        .prepare(
          `SELECT id, name, red_number, blue_number, joined_at, last_seen_at,
                  result_viewed_at, notification_enabled, pair_confirmed_at
           FROM participants WHERE room_id = ? ORDER BY joined_at, id`,
        )
        .bind(id)
        .all<AdminParticipantRecord>(),
    ]);
    if (!room) return Response.json({ error: "La sala no existe." }, { status: 404 });

    const grouped = groupParticipants(roster.results);
    const now = Date.now();
    const connectedIds = await connectedParticipantIds(room.code);
    const duplicateNameGroups = duplicateNames(roster.results);
    const participants = roster.results.map((participant) => {
      const connected = connectedIds?.has(participant.id) ?? isRecentPresence(participant.last_seen_at, now);
      return {
        id: participant.id,
        name: participant.name,
        redNumber: participant.red_number,
        blueNumber: participant.blue_number,
        joinedAt: participant.joined_at,
        lastSeenAt: participant.last_seen_at,
        online: connected,
        resultViewedAt: participant.result_viewed_at,
        notificationEnabled: participant.notification_enabled === 1,
        pairConfirmedAt: participant.pair_confirmed_at,
      };
    });
    return Response.json(
      {
        room: {
          id: room.id,
          code: room.code,
          status: room.status,
          active: room.expires_at > now && room.archived_at === null,
          expectedParticipants: room.expected_participants,
          participantCount: roster.results.length,
          createdAt: room.created_at,
          expiresAt: room.expires_at,
          version: room.version,
          joinLocked: room.join_locked === 1,
          archivedAt: room.archived_at,
        },
        participants,
        presenceSource: connectedIds ? "socket" : "last_seen",
        duplicateNames: duplicateNameGroups,
        alerts: {
          archived: room.archived_at !== null,
          expired: room.expires_at <= now,
          joinsLocked: room.join_locked === 1,
          participantShortfall: Math.max(0, room.expected_participants - roster.results.length),
          duplicateNameCount: duplicateNameGroups.length,
          duplicateNumberCount: grouped.duplicateNumbers.length,
          unmatchedCount: grouped.unmatched.length,
          onlineParticipantCount: participants.filter((participant) => participant.online).length,
        },
        ...grouped,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "No se pudo cargar el detalle de la sala." }, { status: 500 });
  }
}
