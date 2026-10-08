ALTER TABLE rooms ADD COLUMN join_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN archived_at INTEGER;
ALTER TABLE participants ADD COLUMN last_seen_at INTEGER;
ALTER TABLE participants ADD COLUMN result_viewed_at INTEGER;
ALTER TABLE participants ADD COLUMN notification_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE participants ADD COLUMN pair_confirmed_at INTEGER;

CREATE INDEX IF NOT EXISTS rooms_archived_at_idx ON rooms (archived_at);
CREATE INDEX IF NOT EXISTS participants_room_last_seen_idx ON participants (room_id, last_seen_at);
