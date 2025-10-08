async function countAttempts(client, roundId, playerId) {
  const res = await client.query('SELECT count(*)::int AS c FROM attempts WHERE round_id=$1 AND player_id=$2', [roundId, playerId]);
  return res.rows[0] ? res.rows[0].c : 0;
}

async function insertAttempt(client, roundId, sessionId, playerId, guess, guessNormalized, isCorrect, attemptNumber) {
  const res = await client.query(
    'INSERT INTO attempts (round_id, session_id, player_id, guess, guess_normalized, is_correct, attempt_number) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, round_id, session_id, player_id, guess, is_correct, attempt_number, created_at',
    [roundId, sessionId, playerId, guess, guessNormalized, isCorrect, attemptNumber]
  );
  return res.rows[0];
}

async function deleteAttemptsForSession(db, sessionId) {
  await db.query('DELETE FROM attempts WHERE session_id=$1', [sessionId]);
}

async function getAttemptsForRoundAndPlayer(db, roundId, playerId) {
  const { rows } = await db.query(
    'SELECT id, round_id, session_id, player_id, guess, guess_normalized, is_correct, attempt_number, created_at FROM attempts WHERE round_id=$1 AND player_id=$2 ORDER BY created_at',
    [roundId, playerId]
  );
  return rows;
}

module.exports = { countAttempts, insertAttempt, deleteAttemptsForSession, getAttemptsForRoundAndPlayer };
