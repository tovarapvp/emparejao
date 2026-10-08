import type { AdminIdentity } from "@/lib/admin-auth";

export const ADMIN_ROOM_ACTION = {
  EXTEND_EXPIRY: "extend_expiry",
  LOCK_JOINS: "lock_joins",
  UNLOCK_JOINS: "unlock_joins",
  RESET_DRAW: "reset_draw",
  REDRAW: "redraw",
  ARCHIVE: "archive",
} as const;

export type AdminRoomAction =
  (typeof ADMIN_ROOM_ACTION)[keyof typeof ADMIN_ROOM_ACTION];

export const ADMIN_PARTICIPANT_ACTION = {
  RENAME: "rename",
  DELETE: "delete",
  RESEND_RESULT: "resend_result",
  CONFIRM_PAIR: "confirm_pair",
  RESET_PAIR_CONFIRMATION: "reset_pair_confirmation",
} as const;

export type AdminParticipantAction =
  (typeof ADMIN_PARTICIPANT_ACTION)[keyof typeof ADMIN_PARTICIPANT_ACTION];

export const ADMIN_PRESENCE_WINDOW_MS = 90_000;

export function isRecentPresence(lastSeenAt: number | null, now = Date.now()) {
  return lastSeenAt !== null && lastSeenAt >= now - ADMIN_PRESENCE_WINDOW_MS;
}

export function auditStatement(
  database: D1Database,
  admin: AdminIdentity,
  action: string,
  roomId: string,
  details: Record<string, unknown>,
  now = Date.now(),
) {
  return database
    .prepare(
      `INSERT INTO admin_audit_logs
       (id, admin_user_id, action, room_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      admin.id,
      action,
      roomId,
      JSON.stringify(details),
      now,
    );
}
