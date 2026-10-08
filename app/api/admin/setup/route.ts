import { getRawDb } from "@/db";
import {
  adminSessionCookie,
  createAdminSession,
  createPasswordRecord,
  setupTokenConfigured,
  superAdminEmail,
  validateAdminPassword,
  verifySetupToken,
} from "@/lib/admin-auth";

interface SetupPayload {
  password?: unknown;
  setupToken?: unknown;
}

export async function POST(request: Request) {
  try {
    if (!setupTokenConfigured()) {
      return Response.json(
        { error: "Configura ADMIN_SETUP_TOKEN como secreto antes del primer acceso." },
        { status: 503 },
      );
    }

    const payload = (await request.json()) as SetupPayload;
    const password = typeof payload.password === "string" ? payload.password : "";
    const setupToken = typeof payload.setupToken === "string" ? payload.setupToken : "";
    const passwordError = validateAdminPassword(password);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
    if (!(await verifySetupToken(setupToken))) {
      return Response.json({ error: "La clave inicial no es válida." }, { status: 403 });
    }

    const database = getRawDb();
    const existing = await database
      .prepare("SELECT id FROM admin_users LIMIT 1")
      .first<{ id: string }>();
    if (existing) {
      return Response.json({ error: "El superadmin ya fue configurado." }, { status: 409 });
    }

    const adminId = crypto.randomUUID();
    const now = Date.now();
    const passwordRecord = await createPasswordRecord(password);
    await database.batch([
      database
        .prepare(
          `INSERT INTO admin_users
           (id, email, password_hash, password_salt, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          adminId,
          superAdminEmail(),
          passwordRecord.hash,
          passwordRecord.salt,
          now,
          now,
        ),
      database
        .prepare(
          `INSERT INTO admin_audit_logs
           (id, admin_user_id, action, room_id, details, created_at)
           VALUES (?, ?, 'admin_setup', NULL, ?, ?)`,
        )
        .bind(crypto.randomUUID(), adminId, JSON.stringify({ email: superAdminEmail() }), now),
    ]);

    const sessionToken = await createAdminSession(database, adminId);
    return Response.json(
      { authenticated: true, email: superAdminEmail() },
      { status: 201, headers: { "Set-Cookie": adminSessionCookie(sessionToken, request) } },
    );
  } catch (error) {
    console.error("Admin setup failed", error);
    return Response.json({ error: "No se pudo crear el superadmin." }, { status: 500 });
  }
}
