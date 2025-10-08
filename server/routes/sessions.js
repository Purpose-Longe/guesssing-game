const express = require('express');
const router = express.Router();

module.exports = function makeSessionsRouter({ pool, sseManager, utils }) {
  const { generateUniqueCode, sendJson } = utils;

  router.post('/', async (req, res) => {
    const code = await generateUniqueCode(pool);
    const id = require('uuid').v4();
    const { rows } = await pool.query(
      'INSERT INTO sessions (id, code, status, created_at, updated_at) VALUES ($1,$2,$3,now(),now()) RETURNING *',
      [id, code, 'waiting']
    );
    sendJson(res, rows[0]);
  });

  router.get('/code/:code', async (req, res) => {
    const code = req.params.code.toUpperCase();
    const { rows } = await pool.query('SELECT * FROM sessions WHERE code=$1 AND status=$2 LIMIT 1', [code, 'waiting']);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    sendJson(res, rows[0]);
  });

  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM sessions WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    sendJson(res, rows[0]);
  });

  router.put('/:id', async (req, res) => {
    const id = req.params.id;
    const body = { ...req.body };

    if (body.current_answer && typeof body.current_answer === 'string') {
      body.current_answer = body.current_answer.toLowerCase().trim();
    }

    if (body.status === 'in_progress' && body.current_question && body.current_answer) {
      const pc = await pool.query('SELECT count(*)::int AS c FROM players WHERE session_id=$1 AND is_active', [id]);
      const playerCount = pc.rows[0] ? pc.rows[0].c : 0;
      if (playerCount < 3) {
        return res.status(400).json({ error: 'At least 3 active players are required to start the game' });
      }

      const durationSeconds = typeof body.duration === 'number' && body.duration > 0 ? body.duration : 60;
      const insert = await pool.query('INSERT INTO rounds (session_id, question, answer_normalized, started_at, ends_at) VALUES ($1,$2,$3,now(),now() + ($4)::interval) RETURNING id, started_at, ends_at', [id, body.current_question, body.current_answer, `${durationSeconds} seconds`]);
      const roundId = insert.rows[0].id;
      const startedAt = insert.rows[0].started_at;
      const endsAt = insert.rows[0].ends_at;
      await pool.query('UPDATE sessions SET status=$1, current_round_id=$2, updated_at=now() WHERE id=$3', ['in_progress', roundId, id]);
      const sessRes = await pool.query('SELECT * FROM sessions WHERE id=$1', [id]);
      const updated = sessRes.rows[0];
      updated.current_question = body.current_question;
      updated.current_answer = body.current_answer;
      updated.game_started_at = startedAt;
      updated.game_ends_at = endsAt;
      sseManager.broadcast(`session-${id}`, 'session_update', updated);
      return sendJson(res, updated);
    }

    if (body.status === 'in_progress') {
      return res.status(400).json({ error: "To start a round, provide current_question, current_answer and duration (use the start game flow)" });
    }

    delete body.game_started_at;
    delete body.game_ends_at;
    delete body.current_round_id;
    delete body.current_question;
    delete body.current_answer;
    delete body.created_at;
    delete body.updated_at;
    delete body.code;

    const keys = Object.keys(body);
    const sets = keys.map((k, idx) => `${k}=$${idx + 1}`).join(', ');
    const vals = keys.map((k) => body[k]);
    if (keys.length > 0) {
      await pool.query(`UPDATE sessions SET ${sets}, updated_at=now() WHERE id=$${keys.length + 1}`, [...vals, id]);
    }
    const sel = await pool.query('SELECT * FROM sessions WHERE id=$1', [id]);
    sseManager.broadcast(`session-${id}`, 'session_update', sel.rows[0]);
    sendJson(res, sel.rows[0]);
  });

  router.delete('/:id', async (req, res) => {
    const id = req.params.id;
    await pool.query('DELETE FROM sessions WHERE id=$1', [id]);
    sendJson(res, { ok: true });
  });

  return router;
};
