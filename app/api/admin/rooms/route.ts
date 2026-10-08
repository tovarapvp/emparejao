import { getRawDb } from "@/db";
import { adminIdentity } from "@/lib/admin-auth";
import { ADMIN_PRESENCE_WINDOW_MS } from "@/lib/admin-operations";

interface AdminRoomRecord {
  id: string;
  code: string;
  expected_participants: number;
  status: string;
  created_at: number;
  expires_at: number;
  participant_count: number;
  join_locked: number;
  archived_at: number | null;
  live_participant_count: number;
  has_duplicate_name: number;
  has_duplicate_number: number;
}

export async function GET(request: Request) {
  try {
    const database = getRawDb();
    const admin = await adminIdentity(request, database);
    if (!admin) return Response.json({ error: "Acceso administrativo requerido." }, { status: 401 });

    const now = Date.now();
    const rooms = await database
      .prepare(
        `SELECT r.id, r.code, r.expected_participants, r.status, r.created_at, r.expires_at,
                r.join_locked, r.archived_at,
                (SELECT COUNT(*) FROM participants p WHERE p.room_id = r.id) AS participant_count,
                (SELECT COUNT(*) FROM participants p
                 WHERE p.room_id = r.id AND p.last_seen_at >= ?) AS live_participant_count,
                EXISTS(
                  SELECT 1 FROM participants p1
                  JOIN participants p2
                    ON p2.room_id = p1.room_id
                   AND lower(p2.name) = lower(p1.name)
                   AND p2.id > p1.id
                  WHERE p1.room_id = r.id
                ) AS has_duplicate_name,
                EXISTS(
                  SELECT 1 FROM participants p1
                  JOIN participants p2
                    ON p2.room_id = p1.room_id
                   AND p2.red_number = p1.red_number
                   AND p2.id > p1.id
                  WHERE p1.room_id = r.id AND p1.red_number IS NOT NULL
                ) AS has_duplicate_number
         FROM rooms r
         ORDER BY r.created_at DESC
         LIMIT 100`,
      )
      .bind(now - ADMIN_PRESENCE_WINDOW_MS)
      .all<AdminRoomRecord>();

    return Response.json(
      {
        rooms: rooms.results.map((room) => ({
          id: room.id,
          code: room.code,
          status: room.status,
          active: room.expires_at > now && room.archived_at === null,
          expectedParticipants: room.expected_participants,
          participantCount: room.participant_count,
          createdAt: room.created_at,
          expiresAt: room.expires_at,
          joinLocked: room.join_locked === 1,
          archivedAt: room.archived_at,
          liveParticipantCount: room.live_participant_count,
          alerts: {
            expired: room.expires_at <= now,
            archived: room.archived_at !== null,
            joinsLocked: room.join_locked === 1,
            participantShortfall: Math.max(0, room.expected_participants - room.participant_count),
            duplicateNames: room.has_duplicate_name === 1,
            duplicateNumbers: room.has_duplicate_number === 1,
          },
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "No se pudieron cargar las salas." }, { status: 500 });
  }
}
