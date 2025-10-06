-- Add session timestamp columns for game start/end
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS game_started_at timestamptz NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS game_ends_at timestamptz NULL;
