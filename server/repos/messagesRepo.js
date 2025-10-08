const { DEFAULT_PAGE_SIZE } = require('../config');

async function getMessagesForSession(db, sessionId) {
  // Return the full message history for the session (chronological order)
  const { rows } = await db.query(
    `SELECT m.id, m.session_id, m.player_id, m.content, m.created_at, p.username
     FROM messages m
     LEFT JOIN players p ON p.id = m.player_id
     WHERE m.session_id = $1
     ORDER BY m.created_at ASC, m.id ASC`,
    [sessionId]
  );
  return { messages: rows };
}

async function findRecentDuplicate(db, sessionId, playerId, content) {
  const { rows } = await db.query(
    "SELECT m.id, m.session_id, m.player_id, m.content, m.created_at, p.username FROM messages m LEFT JOIN players p ON p.id = m.player_id WHERE m.session_id=$1 AND m.player_id=$2 AND m.content=$3 AND (now() - m.created_at) < INTERVAL '3 seconds' LIMIT 1",
    [sessionId, playerId, content]
  );
  return rows[0] || null;
}

async function insertMessage(db, sessionId, playerId, content, createdAt) {
  const { rows } = await db.query(
    "INSERT INTO messages (session_id, player_id, content, created_at) VALUES ($1,$2,$3,$4) RETURNING id, session_id, player_id, content, created_at",
    [sessionId, playerId, content, createdAt]
  );
  const id = rows[0].id;
  const joined = await db.query(
    "SELECT m.id, m.session_id, m.player_id, m.content, m.created_at, p.username FROM messages m LEFT JOIN players p ON p.id = m.player_id WHERE m.id=$1 LIMIT 1",
    [id]
  );
  return joined.rows[0];
}

module.exports = { getMessagesForSession, findRecentDuplicate, insertMessage };
