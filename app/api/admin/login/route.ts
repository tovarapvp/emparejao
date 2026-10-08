import { getRawDb } from "@/db";
import {
  adminSessionCookie,
  createAdminSession,
  superAdminEmail,
  verifyPassword,
} from "@/lib/admin-auth";

interface LoginPayload {
  email?: unknown;
  password?: unknown;
}

interface AdminLoginRecord {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as LoginPayload;
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    if (email !== superAdminEmail() || !password) {
      return Response.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
    }

    const database = getRawDb();
    const admin = await database
      .prepare(
        `SELECT id, email, password_hash, password_salt
         FROM admin_users WHERE email = ? LIMIT 1`,
      )
      .bind(email)
      .first<AdminLoginRecord>();
    if (!admin || !(await verifyPassword(password, admin.password_salt, admin.password_hash))) {
      return Response.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
    }

    await database
      .prepare("DELETE FROM admin_sessions WHERE expires_at <= ?")
      .bind(Date.now())
      .run();
    const sessionToken = await createAdminSession(database, admin.id);
    return Response.json(
      { authenticated: true, email: admin.email },
      { headers: { "Set-Cookie": adminSessionCookie(sessionToken, request) } },
    );
  } catch {
    return Response.json({ error: "No se pudo iniciar sesión." }, { status: 500 });
  }
}
