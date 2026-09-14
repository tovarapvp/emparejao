import { getRawDb } from "@/db";
import { sendDrawPush, type PushSubscriptionRecord } from "@/lib/push";
import { bearerToken, normalizeCode, type RoomRecord, roomError } from "@/lib/room-api";

const PUSH_BATCH_SIZE = 40;

interface RouteContext {
  params: Promise<{ code: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const hostToken = bearerToken(request);
    const payload = (await request.json().catch(() => ({}))) as { after?: unknown };
    const after = typeof payload.after === "string" ? payload.after : "";
    const database = getRawDb();
    const room = await database
      .prepare(
        `SELECT id, code, host_token, expected_participants, status, expires_at, version
         FROM rooms WHERE code = ? AND expires_at > ? LIMIT 1`,
      )
      .bind(code, Date.now())
      .first<RoomRecord>();

    if (!room || room.host_token !== hostToken) {
      return Response.json({ error: "Solo el organizador puede enviar los avisos." }, { status: 403 });
    }
    if (room.status !== "drawn") {
      return Response.json({ error: "El sorteo todavía no ha comenzado." }, { status: 409 });
    }

    const subscriptions = await database
      .prepare(
        `SELECT id, endpoint, p256dh, auth
         FROM push_subscriptions
         WHERE room_id = ? AND id > ?
         ORDER BY id
         LIMIT ?`,
      )
      .bind(room.id, after, PUSH_BATCH_SIZE)
      .all<PushSubscriptionRecord>();

    const deliveries = await Promise.all(
      subscriptions.results.map(async (subscription) => ({
        subscription,
        result: await sendDrawPush(subscription, room.code).catch(() => ({
          delivered: false,
          expired: false,
        })),
      })),
    );
    const expiredIds = deliveries
      .filter(({ result }) => result.expired)
      .map(({ subscription }) => subscription.id);
    if (expiredIds.length > 0) {
      await database.batch(
        expiredIds.map((id) =>
          database.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(id),
        ),
      );
    }

    const lastSubscription = subscriptions.results.at(-1);
    return Response.json({
      attempted: subscriptions.results.length,
      delivered: deliveries.filter(({ result }) => result.delivered).length,
      next: subscriptions.results.length === PUSH_BATCH_SIZE ? lastSubscription?.id ?? null : null,
    });
  } catch (error) {
    return roomError(error);
  }
}
