require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());
// Respond to CORS preflight requests for all routes
app.options('*', cors());

const distPath = path.join(__dirname, "..", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // For SPA routes, fallback to index.html for GET requests not matching API/SSE
  app.get("*", (req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/sse"))
      return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = process.env.PORT || 4000;

// Postgres pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// simple UUID validator
function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

// SSE clients (in-memory)
const clients = new Map();

function sendEvent(channel, event, data) {
  const subs = clients.get(channel) || [];
  const payload = `data: ${JSON.stringify({ type: event, payload: data })}\n\n`;
  subs.forEach((res) => res.write(payload));
}

app.get("/sse/:channel", (req, res) => {
  const { channel } = req.params;
  res.set({
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  });
  res.flushHeaders();
  const subs = clients.get(channel) || [];
  subs.push(res);
  clients.set(channel, subs);

  req.on("close", () => {
    const curr = clients.get(channel) || [];
    clients.set(
      channel,
      curr.filter((r) => r !== res)
    );
  });
});

// Initialize tables if not present (simple idempotent DDL)
async function ensureSchema() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code varchar(16) NOT NULL UNIQUE,
      game_master_id uuid NULL,
      status text NOT NULL DEFAULT 'waiting',
      current_round_id uuid NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      username text NOT NULL,
      score integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      joined_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS players_session_username_lower_uq ON players (session_id, (lower(username)));`
  );

  await pool.query(`
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
    )
  `);

  await pool.query(`
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      player_id uuid NULL REFERENCES players(id),
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

// Helper to generate unique 6-char code
async function generateUniqueCode() {
  function gen() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  for (let i = 0; i < 20; i++) {
    const c = gen();
    const { rows } = await pool.query(
      "SELECT 1 FROM sessions WHERE code=$1 LIMIT 1",
      [c]
    );
    if (rows.length === 0) return c;
  }
  // fallback to larger loop
  while (true) {
    const c = gen();
    const { rows } = await pool.query(
      "SELECT 1 FROM sessions WHERE code=$1 LIMIT 1",
      [c]
    );
    if (rows.length === 0) return c;
  }
}

// Messages
app.get("/api/messages/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { rows } = await pool.query(
    "SELECT m.*, p.username FROM messages m LEFT JOIN players p ON p.id = m.player_id WHERE m.session_id = $1 ORDER BY m.created_at",
    [sessionId]
  );
  const out = rows.map((r) => ({
    id: r.id,
    session_id: r.session_id,
    player_id: r.player_id,
    content: r.content,
    created_at: r.created_at,
    players: r.username ? { username: r.username } : undefined,
  }));
  res.json(out);
});

app.post("/api/messages", async (req, res) => {
  const { session_id, player_id, content } = req.body;
  const now = new Date().toISOString();
  // validate ids
  if (!isUuid(session_id))
    return res.status(400).json({ error: "invalid or missing session_id" });
  if (player_id && !isUuid(player_id))
    return res.status(400).json({ error: "invalid player_id" });
  // simple duplicate guard: recent exact match (use proper INTERVAL syntax)
  const dup = await pool.query(
    "SELECT m.*, p.username FROM messages m LEFT JOIN players p ON p.id = m.player_id WHERE m.session_id=$1 AND m.player_id=$2 AND m.content=$3 AND (now() - m.created_at) < INTERVAL '3 seconds' LIMIT 1",
    [session_id, player_id, content]
  );
  if (dup.rows[0]) {
    const r = dup.rows[0];
    const outDup = {
      id: r.id,
      session_id: r.session_id,
      player_id: r.player_id,
      content: r.content,
      created_at: r.created_at,
    };
    // attach username when available so clients don't show UUIDs temporarily
    if (r.username) outDup.players = { username: r.username };
    sendEvent(`messages-session-${session_id}`, "message", outDup);
    return res.json(outDup);
  }

  const insert = await pool.query(
    "INSERT INTO messages (session_id, player_id, content, created_at) VALUES ($1,$2,$3,$4) RETURNING id, session_id, player_id, content, created_at",
    [session_id, player_id, content, now]
  );
  const row = insert.rows[0];
  // fetch the inserted message joined with player username in a single follow-up query
  const joined = await pool.query(
    "SELECT m.id, m.session_id, m.player_id, m.content, m.created_at, p.username FROM messages m LEFT JOIN players p ON p.id = m.player_id WHERE m.id=$1 LIMIT 1",
    [row.id]
  );
  const jr = joined.rows[0];
  const out = {
    id: jr.id,
    session_id: jr.session_id,
    player_id: jr.player_id,
    content: jr.content,
    created_at: jr.created_at,
    players: jr.username ? { username: jr.username } : undefined,
  };
  sendEvent(`messages-session-${session_id}`, "message", out);
  res.json(out);
});

// Submit guess - transactional
app.post("/api/submit_guess", async (req, res) => {
  const { session_id, player_id, guess } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sessionRes = await client.query(
      "SELECT id, game_master_id, status, current_round_id FROM sessions WHERE id=$1 FOR UPDATE",
      [session_id]
    );
    if (sessionRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "session not found" });
    }
    const session = sessionRes.rows[0];

    if (session.game_master_id && session.game_master_id === player_id) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Game master cannot submit guesses" });
    }
    if (session.status !== "in_progress" || !session.current_round_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No active round" });
    }

    const roundRes = await client.query(
      "SELECT id, answer_normalized FROM rounds WHERE id=$1 FOR UPDATE",
      [session.current_round_id]
    );
    if (roundRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Round not found" });
    }
    const round = roundRes.rows[0];

    const countRes = await client.query(
      "SELECT count(*)::int AS c FROM attempts WHERE round_id=$1 AND player_id=$2",
      [round.id, player_id]
    );
    const existingCount = countRes.rows[0].c;
    const attemptNumber = existingCount + 1;
    if (attemptNumber > 3) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "No attempts remaining",
        attempt_number: attemptNumber - 1,
      });
    }

    const guessNormalized = (guess || "").toLowerCase().trim();
    const isCorrect = guessNormalized === round.answer_normalized;

    const insertRes = await client.query(
      "INSERT INTO attempts (round_id, session_id, player_id, guess, guess_normalized, is_correct, attempt_number) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, round_id, session_id, player_id, guess, is_correct, attempt_number, created_at",
      [
        round.id,
        session_id,
        player_id,
        guess,
        guessNormalized,
        isCorrect,
        attemptNumber,
      ]
    );
    const attemptRow = insertRes.rows[0];

    let game_over = false;
    if (isCorrect) {
      // award points
      await client.query("UPDATE players SET score = score + 10 WHERE id=$1", [
        player_id,
      ]);
      await client.query(
        "UPDATE rounds SET winner_player_id=$1, ended_at=now() WHERE id=$2",
        [player_id, round.id]
      );
      // make the correct guesser the next game master and end the round
      await client.query(
        "UPDATE sessions SET status=$1, current_round_id=$2, game_master_id=$3, updated_at=now() WHERE id=$4",
        ["waiting", null, player_id, session_id]
      );
      game_over = true;
    }
    // if the game is over, fetch the updated session inside the transaction to avoid races
    let sessionUpdatedRow = null;
    if (game_over) {
      const sel = await client.query("SELECT * FROM sessions WHERE id=$1", [session_id]);
      sessionUpdatedRow = sel.rows[0];
    }

    await client.query("COMMIT");

    // broadcast attempt
    sendEvent(`game-session-${session_id}`, "attempt_insert", attemptRow);

    if (game_over && sessionUpdatedRow) {
      sendEvent(`session-${session_id}`, "session_update", sessionUpdatedRow);
    }

    res.json({
      is_correct: !!isCorrect,
      attempt_number: attemptNumber,
      game_over,
      winner_id: isCorrect ? player_id : null,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("submit_guess transaction failed", err);
    res.status(500).json({ error: "internal error" });
  } finally {
    client.release();
  }
});

// Delete all attempts for a session (used when starting a new round)
app.delete("/api/attempts/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  await pool.query("DELETE FROM attempts WHERE session_id=$1", [sessionId]);
  res.json({ ok: true });
});

// Get attempts for a session + player (for current round)
app.get("/api/attempts/:sessionId/:playerId", async (req, res) => {
  const { sessionId, playerId } = req.params;
  const sessionRes = await pool.query(
    "SELECT current_round_id FROM sessions WHERE id=$1",
    [sessionId]
  );
  if (sessionRes.rowCount === 0) return res.json([]);
  const roundId = sessionRes.rows[0].current_round_id;
  if (!roundId) return res.json([]);
  const { rows } = await pool.query(
    "SELECT * FROM attempts WHERE round_id=$1 AND player_id=$2 ORDER BY created_at",
    [roundId, playerId]
  );
  res.json(rows);
});

app.post("/api/end_round", async (req, res) => {
  const { session_id, winner_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE sessions SET status=$1, current_round_id=$2, updated_at=now() WHERE id=$3",
      ["ended", null, session_id]
    );
    if (winner_id) {
      await client.query("UPDATE players SET score = score + 10 WHERE id=$1", [
        winner_id,
      ]);
      // transfer game master to the winner when ending the round
      await client.query(
        "UPDATE sessions SET game_master_id=$1 WHERE id=$2",
        [winner_id, session_id]
      );
    }

    // fetch updated session inside transaction
    const sel = await client.query("SELECT * FROM sessions WHERE id=$1", [session_id]);
    const sessionUpdatedRow = sel.rows[0];

    await client.query("COMMIT");

    sendEvent(`session-${session_id}`, "session_update", sessionUpdatedRow);
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("end_round failed", err);
    res.status(500).json({ error: "internal error" });
  } finally {
    client.release();
  }
});

// Sessions (create, lookup by code, get by id, update)
app.post("/api/sessions", async (req, res) => {
  const code = await generateUniqueCode();
  const id = uuidv4();
  const { rows } = await pool.query(
    "INSERT INTO sessions (id, code, status, created_at, updated_at) VALUES ($1,$2,$3,now(),now()) RETURNING *",
    [id, code, "waiting"]
  );
  res.json(rows[0]);
});

app.get("/api/sessions/code/:code", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { rows } = await pool.query(
    "SELECT * FROM sessions WHERE code=$1 AND status=$2 LIMIT 1",
    [code, "waiting"]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

app.get("/api/sessions/:id", async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query("SELECT * FROM sessions WHERE id=$1", [id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

app.put("/api/sessions/:id", async (req, res) => {
  const id = req.params.id;
  const body = { ...req.body };
  if (body.current_answer && typeof body.current_answer === "string") {
    body.current_answer = body.current_answer.toLowerCase().trim();
  }
  // map startGame behavior: if status=in_progress and current_question/answer provided, create a round
  if (
    body.status === "in_progress" &&
    body.current_question &&
    body.current_answer
  ) {
    // enforce minimum players on the server to match frontend (require 3 active players)
    const pc = await pool.query(
      "SELECT count(*)::int AS c FROM players WHERE session_id=$1 AND is_active",
      [id]
    );
    const playerCount = pc.rows[0] ? pc.rows[0].c : 0;
    if (playerCount < 3) {
      return res
        .status(400)
        .json({ error: "At least 3 active players are required to start the game" });
    }
    // compute server-side timing
    const durationSeconds = typeof body.duration === 'number' && body.duration > 0 ? body.duration : 60;
    // insert round and set current_round_id; use now() for started_at and now() + duration for ends_at
    const insert = await pool.query(
      "INSERT INTO rounds (session_id, question, answer_normalized, started_at, ends_at) VALUES ($1,$2,$3,now(), now() + COALESCE($4, '0 seconds')::interval) RETURNING id, started_at, ends_at",
      [
        id,
        body.current_question,
        body.current_answer,
        `${durationSeconds} seconds`,
      ]
    );
    const roundId = insert.rows[0].id;
    const startedAt = insert.rows[0].started_at;
    const endsAt = insert.rows[0].ends_at;
    await pool.query(
      "UPDATE sessions SET status=$1, current_round_id=$2, updated_at=now() WHERE id=$3",
      ["in_progress", roundId, id]
    );
    const { rows } = await pool.query("SELECT * FROM sessions WHERE id=$1", [
      id,
    ]);
    const updated = rows[0];
    // include current question/answer and server timing info in the session payload
    updated.current_question = body.current_question;
    updated.current_answer = body.current_answer;
    updated.game_started_at = startedAt;
    updated.game_ends_at = endsAt;
    sendEvent(`session-${id}`, "session_update", updated);
    return res.json(updated);
  }

  // generic update
  // Prevent clients from setting server-managed timing/round fields directly.
  // Enforce that starting a game (status === 'in_progress') must go through the start-game path above.
  if (body.status === 'in_progress') {
    return res.status(400).json({ error: "To start a round, provide current_question, current_answer and duration (use the start game flow)" });
  }

  // Drop any server-managed fields which must not be set by clients
  delete body.game_started_at;
  delete body.game_ends_at;
  delete body.current_round_id;
  delete body.current_question;
  delete body.current_answer;
  delete body.created_at;
  delete body.updated_at;
  delete body.code;

  const keys = Object.keys(body);
  const sets = keys.map((k, idx) => `${k}=$${idx + 1}`).join(", ");
  const vals = keys.map((k) => body[k]);
  if (keys.length > 0) {
    await pool.query(
      `UPDATE sessions SET ${sets}, updated_at=now() WHERE id=$${
        keys.length + 1
      }`,
      [...vals, id]
    );
  }
  const { rows } = await pool.query("SELECT * FROM sessions WHERE id=$1", [id]);
  sendEvent(`session-${id}`, "session_update", rows[0]);
  res.json(rows[0]);
});

// Players
app.get("/api/players/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { rows } = await pool.query(
    "SELECT * FROM players WHERE session_id=$1 AND is_active ORDER BY joined_at",
    [sessionId]
  );
  res.json(rows);
});

app.post("/api/players", async (req, res) => {
  const { session_id, username } = req.body;
  if (!isUuid(session_id)) return res.status(400).json({ error: 'invalid or missing session_id' });
  const id = uuidv4();
  try {
    const { rows } = await pool.query(
      "INSERT INTO players (id, session_id, username, score, is_active, joined_at, updated_at) VALUES ($1,$2,$3,0,true,now(),now()) RETURNING *",
      [id, session_id, username]
    );
    const p = rows[0];
    sendEvent(`session-${session_id}`, "player_join", p);
    res.json(p);
  } catch (err) {
    if (
      err &&
      err.constraint &&
      err.constraint.includes("players_session_username_lower_uq")
    ) {
      return res
        .status(400)
        .json({ error: "Username already taken in this session" });
    }
    console.error("create player failed", err);
    res.status(500).json({ error: "internal error" });
  }
});

app.put("/api/players/:id", async (req, res) => {
  const id = req.params.id;
  const body = { ...req.body };
  const keys = Object.keys(body);
  const sets = keys.map((k, idx) => `${k}=$${idx + 1}`).join(", ");
  const vals = keys.map((k) => body[k]);
  if (keys.length > 0) {
    await pool.query(
      `UPDATE players SET ${sets}, updated_at=now() WHERE id=$${
        keys.length + 1
      }`,
      [...vals, id]
    );
  }
  const { rows } = await pool.query("SELECT * FROM players WHERE id=$1", [id]);
  res.json(rows[0]);
});

app.delete("/api/sessions/:id", async (req, res) => {
  const id = req.params.id;
  await pool.query("DELETE FROM sessions WHERE id=$1", [id]);
  res.json({ ok: true });
});

// Start server after ensuring schema
ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to initialize schema", err);
    process.exit(1);
  });
