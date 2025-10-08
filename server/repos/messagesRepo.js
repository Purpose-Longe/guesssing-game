const { DEFAULT_PAGE_SIZE } = require('../config');

async function getMessagesForSession(db, sessionId, opts = {}) {
  // opts: { limit, before } where before is an ISO timestamp or composite cursor; returns messages older than 'before'
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_PAGE_SIZE;
  const before = opts.before ? opts.before : null;

  // support composite cursor: either a timestamp string OR 'created_at|id'
  if (before) {
    const parts = String(before).split('|');
    if (parts.length === 2) {
      const ts = parts[0];
      const beforeId = parts[1];
      const { rows } = await db.query(
        `SELECT m.id, m.session_id, m.player_id, m.content, m.created_at, p.username
         FROM messages m
         LEFT JOIN players p ON p.id = m.player_id
         WHERE m.session_id = $1 AND (m.created_at < $2 OR (m.created_at = $2 AND m.id < $3))
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $4`,
        [sessionId, ts, beforeId, limit]
      );
      return rows.reverse();
    }
    // fallback: treat before as timestamp
    const { rows } = await db.query(
      `SELECT m.id, m.session_id, m.player_id, m.content, m.created_at, p.username
       FROM messages m
       LEFT JOIN players p ON p.id = m.player_id
       WHERE m.session_id = $1 AND m.created_at < $2
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $3`,
      [sessionId, before, limit]
    );
    const messages = rows.reverse();
    const hasMore = rows.length === limit;
    return { messages, hasMore };
  }

    const { rows } = await db.query(
    `SELECT m.id, m.session_id, m.player_id, m.content, m.created_at, p.username
     FROM messages m
     LEFT JOIN players p ON p.id = m.player_id
     WHERE m.session_id = $1
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $2`,
    [sessionId, limit]
  );
  const messages = rows.reverse();
  const hasMore = rows.length === limit;
  return { messages, hasMore };
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
