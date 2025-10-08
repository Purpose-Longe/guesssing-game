-- Add session fields expected by the application
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_question text,
  ADD COLUMN IF NOT EXISTS current_answer text,
  ADD COLUMN IF NOT EXISTS game_started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS game_ends_at timestamptz NULL;

-- Optional: index to help queries by game_ends_at
CREATE INDEX IF NOT EXISTS sessions_game_ends_idx ON sessions (game_ends_at);
