-- Add indexes to improve common read patterns

-- Partial index for active players per session (speeds COUNT and list queries)
CREATE INDEX IF NOT EXISTS players_session_active_idx ON players (session_id, joined_at) WHERE is_active;

-- Index on attempts by round + created_at to accelerate ORDER BY created_at
CREATE INDEX IF NOT EXISTS attempts_round_created_at_idx ON attempts (round_id, created_at);

-- Index to help message queries and recent-window scans by (session_id, player_id, created_at)
CREATE INDEX IF NOT EXISTS messages_session_player_created_idx ON messages (session_id, player_id, created_at);

-- Index on sessions.updated_at for cleanup queries that select old sessions
CREATE INDEX IF NOT EXISTS sessions_updated_at_idx ON sessions (updated_at);
