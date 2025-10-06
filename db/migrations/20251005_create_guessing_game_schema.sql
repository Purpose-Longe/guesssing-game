-- Create extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- sessions
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(16) NOT NULL UNIQUE,
  game_master_id uuid NULL,
  status text NOT NULL DEFAULT 'waiting',
  current_round_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- players
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  username text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS players_session_username_lower_uq ON players (session_id, (lower(username)));

-- rounds
CREATE TABLE IF NOT EXISTS rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer_normalized text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NULL,
  winner_player_id uuid NULL REFERENCES players(id),
  ended_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- attempts
CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id),
  guess text NOT NULL,
  guess_normalized text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  attempt_number integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attempts_round_player_idx ON attempts (round_id, player_id);
CREATE INDEX IF NOT EXISTS attempts_session_idx ON attempts (session_id);

-- messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id uuid NULL REFERENCES players(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_session_created_at_idx ON messages (session_id, created_at);
