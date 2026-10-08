import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    hostToken: text("host_token").notNull(),
    expectedParticipants: integer("expected_participants").notNull(),
    status: text("status").notNull().default("lobby"),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("rooms_code_unique").on(table.code),
    index("rooms_expires_at_idx").on(table.expiresAt),
  ],
);

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    accessToken: text("access_token").notNull(),
    redNumber: integer("red_number"),
    blueNumber: integer("blue_number"),
    joinedAt: integer("joined_at").notNull(),
  },
  (table) => [
    uniqueIndex("participants_access_token_unique").on(table.accessToken),
    index("participants_room_idx").on(table.roomId),
    index("participants_room_token_idx").on(table.roomId, table.accessToken),
  ],
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
    uniqueIndex("push_subscriptions_participant_unique").on(table.participantId),
    index("push_subscriptions_room_idx").on(table.roomId),
  ],
);

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("admin_users_email_unique").on(table.email)],
);

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("admin_sessions_token_hash_unique").on(table.tokenHash),
    index("admin_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
    details: text("details"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("admin_audit_logs_admin_idx").on(table.adminUserId),
    index("admin_audit_logs_room_idx").on(table.roomId),
  ],
);
