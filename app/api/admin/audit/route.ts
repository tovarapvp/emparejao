import { getRawDb } from "@/db";
import { adminIdentity } from "@/lib/admin-auth";

const AUDIT_PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  MAX_PAGE: 10_000,
} as const;

interface AuditRecord {
  id: string;
  action: string;
  room_id: string | null;
  room_code: string | null;
  details: string | null;
  created_at: number;
}

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: Request) {
  try {
    const database = getRawDb();
    const admin = await adminIdentity(request, database);
    if (!admin) return Response.json({ error: "Acceso administrativo requerido." }, { status: 401 });

    const url = new URL(request.url);
    const limit = positiveInteger(
      url.searchParams.get("limit"),
      AUDIT_PAGINATION.DEFAULT_LIMIT,
      AUDIT_PAGINATION.MAX_LIMIT,
    );
    const page = positiveInteger(url.searchParams.get("page"), 1, AUDIT_PAGINATION.MAX_PAGE);
    const offset = (page - 1) * limit;
    const records = await database
      .prepare(
        `SELECT a.id, a.action, a.room_id, r.code AS room_code, a.details, a.created_at
         FROM admin_audit_logs a
         LEFT JOIN rooms r ON r.id = a.room_id
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(limit + 1, offset)
      .all<AuditRecord>();
    const hasMore = records.results.length > limit;

    return Response.json(
      {
        entries: records.results.slice(0, limit).map((record) => ({
          id: record.id,
          action: record.action,
          roomId: record.room_id,
          roomCode: record.room_code,
          details: record.details,
          createdAt: record.created_at,
        })),
        page,
        limit,
        hasMore,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Admin audit history failed", error);
    return Response.json({ error: "No se pudo cargar el historial administrativo." }, { status: 500 });
  }
}
