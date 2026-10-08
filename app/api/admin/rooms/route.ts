import { getRawDb } from "@/db";
import { adminIdentity } from "@/lib/admin-auth";

interface AdminRoomRecord {
  id: string;
  code: string;
  expected_participants: number;
  status: string;
  created_at: number;
  expires_at: number;
  participant_count: number;
}

export async function GET(request: Request) {
  try {
    const database = getRawDb();
    const admin = await adminIdentity(request, database);
    if (!admin) return Response.json({ error: "Acceso administrativo requerido." }, { status: 401 });

    const rooms = await database
      .prepare(
        `SELECT r.id, r.code, r.expected_participants, r.status, r.created_at, r.expires_at,
                (SELECT COUNT(*) FROM participants p WHERE p.room_id = r.id) AS participant_count
         FROM rooms r
         ORDER BY r.created_at DESC
         LIMIT 100`,
      )
      .all<AdminRoomRecord>();
    const now = Date.now();

    return Response.json(
      {
        rooms: rooms.results.map((room) => ({
          id: room.id,
          code: room.code,
          status: room.status,
          active: room.expires_at > now,
          expectedParticipants: room.expected_participants,
          participantCount: room.participant_count,
          createdAt: room.created_at,
          expiresAt: room.expires_at,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "No se pudieron cargar las salas." }, { status: 500 });
  }
}
