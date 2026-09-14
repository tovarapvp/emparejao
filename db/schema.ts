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
