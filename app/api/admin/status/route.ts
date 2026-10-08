import { getRawDb } from "@/db";
import {
  adminIdentity,
  setupTokenConfigured,
  superAdminEmail,
} from "@/lib/admin-auth";

export async function GET(request: Request) {
  try {
    const database = getRawDb();
    const [admin, identity] = await Promise.all([
      database.prepare("SELECT id FROM admin_users LIMIT 1").first<{ id: string }>(),
      adminIdentity(request, database),
    ]);

    return Response.json(
      {
        setupRequired: !admin,
        setupConfigured: setupTokenConfigured(),
        authenticated: Boolean(identity),
        email: superAdminEmail(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "No se pudo comprobar el acceso administrativo. Verifica la migración de D1." },
      { status: 500 },
    );
  }
}
