import { getRawDb } from "@/db";
import { ADMIN_AUDIT_ACTION, adminIdentity } from "@/lib/admin-auth";

interface SessionCountRecord {
  session_count: number;
}

export async function POST(request: Request) {
  try {
    const database = getRawDb();
    const admin = await adminIdentity(request, database);
    if (!admin) return Response.json({ error: "Acceso administrativo requerido." }, { status: 401 });

    const sessionCount = await database
      .prepare(
        `SELECT COUNT(*) AS session_count FROM admin_sessions
         WHERE admin_user_id = ? AND id <> ?`,
      )
      .bind(admin.id, admin.sessionId)
      .first<SessionCountRecord>();
    const revokedSessions = sessionCount?.session_count ?? 0;

    await database.batch([
      database
        .prepare("DELETE FROM admin_sessions WHERE admin_user_id = ? AND id <> ?")
        .bind(admin.id, admin.sessionId),
      database
        .prepare(
          `INSERT INTO admin_audit_logs
           (id, admin_user_id, action, room_id, details, created_at)
           VALUES (?, ?, ?, NULL, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          ADMIN_AUDIT_ACTION.SESSIONS_REVOKED,
          JSON.stringify({ revokedSessions }),
          Date.now(),
        ),
    ]);

    return Response.json({ revokedSessions });
  } catch (error) {
    console.error("Admin session revocation failed", error);
    return Response.json({ error: "No se pudieron revocar las sesiones." }, { status: 500 });
  }
}
