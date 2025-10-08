const express = require('express');
const router = express.Router();

module.exports = function makePlayersRouter({ pool, sseManager, utils }) {
  const { isUuid, sendJson } = utils;

  const playersRepo = require('../repos/playersRepo');

  // list active players for a session
  router.get('/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const rows = await playersRepo.listActivePlayers(pool, sessionId);
    sendJson(res, rows);
  });

  // create player
  router.post('/', async (req, res) => {
    const { session_id, username } = req.body;
    if (!isUuid(session_id)) return res.status(400).json({ error: 'invalid or missing session_id' });
    const id = require('uuid').v4();
    try {
      const p = await playersRepo.createPlayer(pool, id, session_id, username);
      sseManager.broadcast(`session-${session_id}`, 'player_join', p);
      sendJson(res, p);
    } catch (err) {
      if (err && err.constraint && err.constraint.includes('players_session_username_lower_uq')) {
        return res.status(400).json({ error: 'Username already taken in this session' });
      }
      console.error('create player failed', err);
      res.status(500).json({ error: 'internal error' });
    }
  });

  // update player - whitelist allowed fields to prevent unexpected/unsafe column updates
  router.put('/:id', async (req, res) => {
    const id = req.params.id;
    const body = { ...req.body };
    const allowed = new Set(['username', 'score', 'is_active']);
    const keys = Object.keys(body).filter((k) => allowed.has(k));
    if (keys.length > 0) {
      const sets = keys.map((k, idx) => `${k}=$${idx + 1}`).join(', ');
      const vals = keys.map((k) => body[k]);
      const updated = await playersRepo.updatePlayer(pool, id, sets, vals);
      // broadcast update so other clients see join/leave/username/score changes immediately
      if (updated && updated.session_id) {
        sseManager.broadcast(`session-${updated.session_id}`, 'player_update', updated);
        if (!updated.is_active) {
          sseManager.broadcast(`session-${updated.session_id}`, 'player_leave', updated);
        }
      }
      return sendJson(res, updated);
    }
    const existing = await playersRepo.getPlayerById(pool, id);
    sendJson(res, existing);
  });

  // heartbeat: mark player as active and update last_seen
  router.post('/:id/heartbeat', async (req, res) => {
    const id = req.params.id;
    try {
      await pool.query('UPDATE players SET is_active = true, last_seen = now(), updated_at = now() WHERE id=$1', [id]);
      const p = await playersRepo.getPlayerById(pool, id);
      // broadcast player update so other clients see activity
      if (p && p.session_id) sseManager.broadcast(`session-${p.session_id}`, 'player_update', p);
      return sendJson(res, p);
    } catch (err) {
      console.error('heartbeat failed', err);
      res.status(500);
      return sendJson(res, { error: 'internal error' });
    }
  });

  return router;
};
