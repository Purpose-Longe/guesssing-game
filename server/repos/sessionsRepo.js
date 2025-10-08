// sessionsRepo: encapsulate SQL for sessions
async function getSessionForUpdate(client, sessionId) {
  const res = await client.query('SELECT id, game_master_id, status, current_round_id FROM sessions WHERE id=$1 FOR UPDATE', [sessionId]);
  return res.rows[0] || null;
}

async function getSessionById(db, sessionId) {
  const res = await db.query(
    'SELECT id, code, game_master_id, status, current_round_id, current_question, current_answer, game_started_at, game_ends_at, created_at, updated_at FROM sessions WHERE id=$1',
    [sessionId]
  );
  return res.rows[0] || null;
}

async function updateAfterWin(client, sessionId, winnerId) {
  await client.query('UPDATE sessions SET status=$1, current_round_id=$2, game_master_id=$3, updated_at=now() WHERE id=$4', ['waiting', null, winnerId, sessionId]);
}

async function setStatusAndCurrentRound(client, sessionId, status, currentRoundId) {
  await client.query('UPDATE sessions SET status=$1, current_round_id=$2, updated_at=now() WHERE id=$3', [status, currentRoundId, sessionId]);
}

module.exports = { getSessionForUpdate, getSessionById, updateAfterWin, setStatusAndCurrentRound };
