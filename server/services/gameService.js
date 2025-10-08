const sessionsRepo = require('../repos/sessionsRepo');
const roundsRepo = require('../repos/roundsRepo');
const attemptsRepo = require('../repos/attemptsRepo');
const playersRepo = require('../repos/playersRepo');

// Service layer for game operations using repository modules
async function submitGuess(pool, { session_id, player_id, guess }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const session = await sessionsRepo.getSessionForUpdate(client, session_id);
    if (!session) { await client.query('ROLLBACK'); return { error: 'session not found', status: 404 }; }

    if (session.game_master_id && session.game_master_id === player_id) {
      await client.query('ROLLBACK');
      return { error: 'Game master cannot submit guesses', status: 400 };
    }
    if (session.status !== 'in_progress' || !session.current_round_id) {
      await client.query('ROLLBACK');
      return { error: 'No active round', status: 400 };
    }

    const round = await roundsRepo.getRoundForUpdate(client, session.current_round_id);
    if (!round) { await client.query('ROLLBACK'); return { error: 'Round not found', status: 400 }; }

    const existingCount = await attemptsRepo.countAttempts(client, round.id, player_id);
    const attemptNumber = existingCount + 1;
    if (attemptNumber > 3) { await client.query('ROLLBACK'); return { error: 'No attempts remaining', attempt_number: attemptNumber - 1, status: 400 }; }

    const guessNormalized = (guess || '').toLowerCase().trim();
    const isCorrect = guessNormalized === round.answer_normalized;

    const attemptRow = await attemptsRepo.insertAttempt(client, round.id, session_id, player_id, guess, guessNormalized, isCorrect, attemptNumber);

    let game_over = false;
    let sessionUpdatedRow = null;
    if (isCorrect) {
      await client.query('UPDATE players SET score = score + 10 WHERE id=$1', [player_id]);
      await roundsRepo.setRoundWinner(client, round.id, player_id);
      await sessionsRepo.updateAfterWin(client, session_id, player_id);
      // fetch the updated session row
      const sel = await sessionsRepo.getSessionById(client, session_id);
      sessionUpdatedRow = sel;

      // also include round details (question/answer/timestamps) so callers can broadcast them
      try {
        const rdet = await client.query('SELECT id, question, answer_normalized, started_at, ends_at FROM rounds WHERE id=$1', [round.id]);
        if (rdet.rowCount > 0) {
          const rd = rdet.rows[0];
          sessionUpdatedRow.current_question = rd.question;
          sessionUpdatedRow.current_answer = rd.answer_normalized;
          sessionUpdatedRow.game_started_at = rd.started_at;
          sessionUpdatedRow.game_ends_at = rd.ends_at;
        }
      } catch (e) {
        // non-fatal: if we can't fetch round details, continue without them
        console.error('failed to fetch round details for broadcast', e);
      }
      game_over = true;
    }

    await client.query('COMMIT');
    return { attemptRow, isCorrect, attemptNumber, game_over, sessionUpdatedRow };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { submitGuess };
// Start a new round for a session
// opts: { durationMs, question, answer_normalized }
async function startRound(pool, { session_id, question, answer_normalized, durationMs = 30000 }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await sessionsRepo.getSessionForUpdate(client, session_id);
    if (!session) { await client.query('ROLLBACK'); return { error: 'session not found', status: 404 }; }
  // minimal players check: count active players
  const numPlayers = await playersRepo.countActivePlayers(client, session_id);
  if (numPlayers < 3) { await client.query('ROLLBACK'); return { error: 'not enough players', status: 400 }; }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + durationMs);

    const roundRes = await client.query(
      'INSERT INTO rounds (session_id, question, answer_normalized, started_at, ends_at, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING *',
      [session_id, question, answer_normalized, startedAt.toISOString(), endsAt.toISOString()]
    );
    const round = roundRes.rows[0];

    await sessionsRepo.setStatusAndCurrentRound(client, session_id, 'in_progress', round.id);

    const updatedSession = await sessionsRepo.getSessionById(client, session_id);
    await client.query('COMMIT');
    return { round, session: updatedSession };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    throw err;
  } finally {
    client.release();
  }
}

// End the current round for a session; optionally pass winner_id
async function endRound(pool, { session_id, winner_id = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT current_round_id FROM sessions WHERE id=$1 FOR UPDATE', [session_id]);
    const currentRoundId = cur.rows[0] ? cur.rows[0].current_round_id : null;
    let roundDetails = null;
    if (currentRoundId) {
      const r = await client.query('SELECT id, question, answer_normalized, started_at, ends_at FROM rounds WHERE id=$1', [currentRoundId]);
      if (r.rowCount > 0) roundDetails = r.rows[0];
    }

    await sessionsRepo.setStatusAndCurrentRound(client, session_id, 'ended', null);

    if (winner_id) {
      await client.query('UPDATE players SET score = score + 10 WHERE id=$1', [winner_id]);
      await client.query('UPDATE sessions SET game_master_id=$1 WHERE id=$2', [winner_id, session_id]);
    }

    const sel = await client.query('SELECT * FROM sessions WHERE id=$1', [session_id]);
    const sessionUpdatedRow = sel.rows[0];

    await client.query('COMMIT');

    const broadcastPayload = { ...sessionUpdatedRow };
    if (roundDetails) {
      broadcastPayload.current_question = roundDetails.question;
      broadcastPayload.current_answer = roundDetails.answer_normalized;
      broadcastPayload.game_started_at = roundDetails.started_at;
      broadcastPayload.game_ends_at = roundDetails.ends_at;
    }

    return { session: sessionUpdatedRow, broadcastPayload };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { submitGuess, startRound, endRound };
