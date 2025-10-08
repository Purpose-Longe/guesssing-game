async function listActivePlayers(db, sessionId) {
  const { rows } = await db.query(
    'SELECT id, session_id, username, score, is_active, joined_at, updated_at FROM players WHERE session_id=$1 AND is_active ORDER BY joined_at',
    [sessionId]
  );
  return rows;
}

async function createPlayer(db, id, sessionId, username) {
  const { rows } = await db.query(
    'INSERT INTO players (id, session_id, username, score, is_active, joined_at, updated_at) VALUES ($1,$2,$3,0,true,now(),now()) RETURNING id, session_id, username, score, is_active, joined_at, updated_at',
    [id, sessionId, username]
  );
  return rows[0];
}

async function getPlayerById(db, id) {
  const { rows } = await db.query(
    'SELECT id, session_id, username, score, is_active, joined_at, updated_at FROM players WHERE id=$1',
    [id]
  );
  return rows[0] || null;
}

async function updatePlayer(db, id, setsSql, values) {
  // setsSql should be a prepared SET clause like "username=$1, score=$2"
  await db.query(`UPDATE players SET ${setsSql}, updated_at=now() WHERE id=$${values.length + 1}`, [...values, id]);
  return getPlayerById(db, id);
}

async function countActivePlayers(db, sessionId) {
  const { rows } = await db.query('SELECT count(*)::int AS c FROM players WHERE session_id=$1 AND is_active', [sessionId]);
  return rows[0] ? rows[0].c : 0;
}

module.exports = { listActivePlayers, createPlayer, getPlayerById, updatePlayer, countActivePlayers };

