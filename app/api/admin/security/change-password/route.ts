import { getRawDb } from "@/db";
import {
  ADMIN_AUDIT_ACTION,
  adminIdentity,
  createPasswordRecord,
  validateAdminPassword,
  verifyPassword,
} from "@/lib/admin-auth";

interface ChangePasswordPayload {
  currentPassword?: unknown;
  newPassword?: unknown;
}

interface PasswordRecord {
  password_hash: string;
  password_salt: string;
}

interface SessionCountRecord {
  session_count: number;
}

export async function POST(request: Request) {
  try {
    const database = getRawDb();
    const admin = await adminIdentity(request, database);
    if (!admin) return Response.json({ error: "Acceso administrativo requerido." }, { status: 401 });

    const payload = (await request.json()) as ChangePasswordPayload;
    const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
    const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
    const passwordError = validateAdminPassword(newPassword);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });

    const password = await database
      .prepare(
        `SELECT password_hash, password_salt
         FROM admin_users WHERE id = ? LIMIT 1`,
      )
      .bind(admin.id)
      .first<PasswordRecord>();
    if (!password || !(await verifyPassword(currentPassword, password.password_salt, password.password_hash))) {
      return Response.json({ error: "La contraseña actual no es correcta." }, { status: 401 });
    }

    const [passwordRecord, sessionCount] = await Promise.all([
      createPasswordRecord(newPassword),
      database
        .prepare(
          `SELECT COUNT(*) AS session_count FROM admin_sessions
           WHERE admin_user_id = ? AND id <> ?`,
        )
        .bind(admin.id, admin.sessionId)
        .first<SessionCountRecord>(),
    ]);
    const revokedSessions = sessionCount?.session_count ?? 0;
    const now = Date.now();

    await database.batch([
      database
        .prepare(
          `UPDATE admin_users
           SET password_hash = ?, password_salt = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(passwordRecord.hash, passwordRecord.salt, now, admin.id),
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
          ADMIN_AUDIT_ACTION.PASSWORD_CHANGED,
          JSON.stringify({ revokedSessions }),
          now,
        ),
    ]);

    return Response.json({ changed: true, revokedSessions });
  } catch (error) {
    console.error("Admin password change failed", error);
    return Response.json({ error: "No se pudo cambiar la contraseña." }, { status: 500 });
  }
}
