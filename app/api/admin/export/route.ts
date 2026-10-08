import { getRawDb } from "@/db";
import { adminIdentity } from "@/lib/admin-auth";

const ADMIN_EXPORT_KIND = {
  ROOMS: "rooms",
  PARTICIPANTS: "participants",
  PAIRS: "pairs",
} as const;

type AdminExportKind = (typeof ADMIN_EXPORT_KIND)[keyof typeof ADMIN_EXPORT_KIND];

interface ExportRoomRecord {
  id: string;
  code: string;
  expected_participants: number;
  status: string;
  created_at: number;
  expires_at: number;
  participant_count: number;
}

interface ExportParticipantRecord {
  room_id: string;
  room_code: string;
  participant_id: string;
  name: string;
  red_number: number | null;
  blue_number: number | null;
  joined_at: number;
}

interface ExportPairRecord {
  room_id: string;
  room_code: string;
  first_participant_id: string;
  first_name: string;
  first_number: number;
  second_participant_id: string;
  second_name: string;
  second_number: number;
}

function isAdminExportKind(value: string): value is AdminExportKind {
  return Object.values(ADMIN_EXPORT_KIND).some((kind) => kind === value);
}

function escapeCsv(value: string | number | null) {
  const text = value === null ? "" : String(value);
  const spreadsheetSafe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
}

function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly (string | number | null)[]>) {
  return `${headers.map(escapeCsv).join(",")}\r\n${rows
    .map((row) => row.map(escapeCsv).join(","))
    .join("\r\n")}\r\n`;
}

function exportResponse(kind: AdminExportKind, content: string) {
  const filename = `emparejao-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(content, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

export async function GET(request: Request) {
  try {
    const database = getRawDb();
    const admin = await adminIdentity(request, database);
    if (!admin) return Response.json({ error: "Acceso administrativo requerido." }, { status: 401 });

    const requestedKind = new URL(request.url).searchParams.get("type") ?? ADMIN_EXPORT_KIND.ROOMS;
    if (!isAdminExportKind(requestedKind)) {
      return Response.json({ error: "Tipo de exportación no válido." }, { status: 400 });
    }

    if (requestedKind === ADMIN_EXPORT_KIND.ROOMS) {
      const records = await database
        .prepare(
          `SELECT r.id, r.code, r.expected_participants, r.status, r.created_at, r.expires_at,
                  (SELECT COUNT(*) FROM participants p WHERE p.room_id = r.id) AS participant_count
           FROM rooms r ORDER BY r.created_at DESC LIMIT 10_000`,
        )
        .all<ExportRoomRecord>();
      return exportResponse(
        requestedKind,
        toCsv(
          ["room_id", "room_code", "expected_participants", "status", "created_at", "expires_at", "participant_count"],
          records.results.map((record) => [
            record.id,
            record.code,
            record.expected_participants,
            record.status,
            record.created_at,
            record.expires_at,
            record.participant_count,
          ]),
        ),
      );
    }

    if (requestedKind === ADMIN_EXPORT_KIND.PARTICIPANTS) {
      const records = await database
        .prepare(
          `SELECT r.id AS room_id, r.code AS room_code, p.id AS participant_id, p.name,
                  p.red_number, p.blue_number, p.joined_at
           FROM participants p JOIN rooms r ON r.id = p.room_id
           ORDER BY r.created_at DESC, p.joined_at ASC, p.id ASC LIMIT 20_000`,
        )
        .all<ExportParticipantRecord>();
      return exportResponse(
        requestedKind,
        toCsv(
          ["room_id", "room_code", "participant_id", "name", "red_number", "blue_number", "joined_at"],
          records.results.map((record) => [
            record.room_id,
            record.room_code,
            record.participant_id,
            record.name,
            record.red_number,
            record.blue_number,
            record.joined_at,
          ]),
        ),
      );
    }

    const records = await database
      .prepare(
        `SELECT r.id AS room_id, r.code AS room_code,
                p1.id AS first_participant_id, p1.name AS first_name, p1.red_number AS first_number,
                p2.id AS second_participant_id, p2.name AS second_name, p2.red_number AS second_number
         FROM participants p1
         JOIN participants p2
           ON p2.room_id = p1.room_id
          AND p1.red_number IS NOT NULL
          AND p1.blue_number = p2.red_number
          AND p2.blue_number = p1.red_number
          AND p1.red_number < p2.red_number
         JOIN rooms r ON r.id = p1.room_id
         ORDER BY r.created_at DESC, p1.red_number ASC LIMIT 10_000`,
      )
      .all<ExportPairRecord>();
    return exportResponse(
      requestedKind,
      toCsv(
        ["room_id", "room_code", "first_participant_id", "first_name", "first_number", "second_participant_id", "second_name", "second_number"],
        records.results.map((record) => [
          record.room_id,
          record.room_code,
          record.first_participant_id,
          record.first_name,
          record.first_number,
          record.second_participant_id,
          record.second_name,
          record.second_number,
        ]),
      ),
    );
  } catch (error) {
    console.error("Admin export failed", error);
    return Response.json({ error: "No se pudo generar la exportación." }, { status: 500 });
  }
}
