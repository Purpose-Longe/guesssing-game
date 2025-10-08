-- Add last_seen to players for heartbeat-based inactivity
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_seen timestamptz NULL;

-- Optional: index to help queries by last_seen
CREATE INDEX IF NOT EXISTS players_last_seen_idx ON players (last_seen);
