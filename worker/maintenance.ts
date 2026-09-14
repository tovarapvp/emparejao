import { errorDetails, logEvent } from "../lib/observability";

const CLEANUP_BATCH_SIZE = 25;
const MAX_CLEANUP_BATCHES = 20;

export interface CleanupResult {
  batches: number;
  deletedRooms: number;
  mayHaveMore: boolean;
}

export async function cleanupExpiredRooms(
  database: D1Database,
  now = Date.now(),
): Promise<CleanupResult> {
  let batches = 0;
  let deletedRooms = 0;
  let lastBatchSize = 0;

  while (batches < MAX_CLEANUP_BATCHES) {
    const result = await database
      .prepare(
        `DELETE FROM rooms
         WHERE id IN (
           SELECT id FROM rooms
           WHERE expires_at <= ?
           ORDER BY expires_at
           LIMIT ?
         )`,
      )
      .bind(now, CLEANUP_BATCH_SIZE)
      .run();

    lastBatchSize = result.meta.changes ?? 0;
    deletedRooms += lastBatchSize;
    batches += 1;

    if (lastBatchSize < CLEANUP_BATCH_SIZE) break;
  }

  return {
    batches,
    deletedRooms,
    mayHaveMore:
      batches === MAX_CLEANUP_BATCHES && lastBatchSize === CLEANUP_BATCH_SIZE,
  };
}

export async function runScheduledCleanup(env: Cloudflare.Env) {
  if (!env.DB) {
    throw new Error("El binding D1 `DB` no está disponible para la limpieza.");
  }

  const startedAt = Date.now();

  try {
    const result = await cleanupExpiredRooms(env.DB);
    logEvent(result.mayHaveMore ? "warn" : "info", "expired_rooms_cleanup", {
      ...result,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    logEvent("error", "expired_rooms_cleanup_failed", {
      durationMs: Date.now() - startedAt,
      ...errorDetails(error),
    });
    throw error;
  }
}
