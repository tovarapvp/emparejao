import { getRawDb } from "@/db";
import { roomError } from "@/lib/room-api";

const ROOM_LIFETIME_MS = 6 * 60 * 60 * 1000;

function roomCode() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(100_000 + (value[0] % 900_000));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { expectedParticipants?: unknown };
    const expectedParticipants = Number(body.expectedParticipants);

    if (
      !Number.isInteger(expectedParticipants) ||
      expectedParticipants < 2 ||
      expectedParticipants > 800 ||
      expectedParticipants % 2 !== 0
    ) {
      return Response.json(
        { error: "Elige una cantidad par válida para la sala." },
        { status: 400 },
      );
    }

    const database = getRawDb();
    const now = Date.now();
    const id = crypto.randomUUID();
    const hostToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = roomCode();
      try {
        await database
          .prepare(
            `INSERT INTO rooms
              (id, code, host_token, expected_participants, status, created_at, expires_at, version)
             VALUES (?, ?, ?, ?, 'lobby', ?, ?, 1)`,
          )
          .bind(id, code, hostToken, expectedParticipants, now, now + ROOM_LIFETIME_MS)
          .run();

        return Response.json({ code, hostToken, expectedParticipants }, { status: 201 });
      } catch (error) {
        if (String(error).includes("UNIQUE")) continue;
        throw error;
      }
    }

    return Response.json({ error: "No pudimos crear el PIN. Intenta de nuevo." }, { status: 503 });
  } catch (error) {
    return roomError(error);
  }
}
