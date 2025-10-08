const express = require('express');

const gameService = require('../services/gameService');

module.exports = function makeAttemptsRouter({ pool, sseManager, utils }) {
  const router = express.Router();
  const { sendJson } = utils;

  // Submit guess - transactional (delegated to gameService)
  router.post('/submit_guess', async (req, res) => {
    const { session_id, player_id, guess } = req.body;
    try {
      const result = await gameService.submitGuess(pool, { session_id, player_id, guess });
      if (result && result.error) {
        return res.status(result.status || 400).json({ error: result.error, attempt_number: result.attempt_number });
      }

      const { attemptRow, isCorrect, attemptNumber, game_over, sessionUpdatedRow } = result;

      // broadcast attempt
      sseManager.broadcast(`game-session-${session_id}`, 'attempt_insert', attemptRow);

      if (game_over && sessionUpdatedRow) {
        sseManager.broadcast(`session-${session_id}`, 'session_update', sessionUpdatedRow);
      }

      // Return the attempt row so clients can optimistically update their UI without waiting for SSE
      sendJson(res, { is_correct: !!isCorrect, attempt_number: attemptNumber, game_over, winner_id: isCorrect ? player_id : null, attempt: attemptRow });
    } catch (err) {
      console.error('submit_guess transaction failed', err);
      res.status(500);
      sendJson(res, { error: 'internal error' });
    }
  });

  // Delete all attempts for a session
  router.delete('/attempts/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const attemptsRepo = require('../repos/attemptsRepo');
    await attemptsRepo.deleteAttemptsForSession(pool, sessionId);
    sendJson(res, { ok: true });
  });

  // Get attempts for a session + player
  router.get('/attempts/:sessionId/:playerId', async (req, res) => {
    const { sessionId, playerId } = req.params;
    const sessionRes = await pool.query('SELECT current_round_id FROM sessions WHERE id=$1', [sessionId]);
    if (sessionRes.rowCount === 0) return sendJson(res, []);
    const roundId = sessionRes.rows[0].current_round_id;
    if (!roundId) return sendJson(res, []);
    const attemptsRepo = require('../repos/attemptsRepo');
    const rows = await attemptsRepo.getAttemptsForRoundAndPlayer(pool, roundId, playerId);
    sendJson(res, rows);
  });

  // End round (broadcast answer then revert to waiting)
  router.post('/end_round', async (req, res) => {
    const { session_id, winner_id } = req.body;
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

      await client.query('UPDATE sessions SET status=$1, current_round_id=$2, updated_at=now() WHERE id=$3', ['ended', null, session_id]);

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

      sseManager.broadcast(`session-${session_id}`, 'session_update', broadcastPayload);

      setTimeout(async () => {
        try {
          await pool.query('UPDATE sessions SET status=$1, updated_at=now() WHERE id=$2', ['waiting', session_id]);
          const { rows: finalRows } = await pool.query('SELECT * FROM sessions WHERE id=$1', [session_id]);
          const finalSession = finalRows[0];
          sseManager.broadcast(`session-${session_id}`, 'session_update', finalSession);
        } catch (err) {
          console.error('failed to revert session to waiting after end_round', err);
        }
      }, 3000);

      sendJson(res, { ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('end_round failed', err);
      res.status(500).json({ error: 'internal error' });
    } finally {
      client.release();
    }
  });

  return router;
};
