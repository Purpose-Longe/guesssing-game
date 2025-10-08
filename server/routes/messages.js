const express = require('express');
const router = express.Router();

module.exports = function makeMessagesRouter({ pool, sseManager, utils }) {
  const { isUuid, sendJson } = utils;

  // GET messages for a session (joins player username)
  router.get('/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const before = req.query.before ? String(req.query.before) : undefined;
    const messagesRepo = require('../repos/messagesRepo');
    const { messages, hasMore } = await messagesRepo.getMessagesForSession(pool, sessionId, { limit, before });
    const out = messages.map((r) => ({
      id: r.id,
      session_id: r.session_id,
      player_id: r.player_id,
      content: r.content,
      created_at: r.created_at,
      players: r.username ? { username: r.username } : undefined,
    }));
    sendJson(res, { messages: out, hasMore });
  });

  // POST new message
  router.post('/', async (req, res) => {
    const { session_id, player_id, content } = req.body;
    const now = new Date().toISOString();
    if (!isUuid(session_id))
      return res.status(400).json({ error: 'invalid or missing session_id' });
    if (player_id && !isUuid(player_id))
      return res.status(400).json({ error: 'invalid player_id' });

    const messagesRepo = require('../repos/messagesRepo');
    const dup = await messagesRepo.findRecentDuplicate(pool, session_id, player_id, content);
    if (dup) {
      const outDup = {
        id: dup.id,
        session_id: dup.session_id,
        player_id: dup.player_id,
        content: dup.content,
        created_at: dup.created_at,
      };
      if (dup.username) outDup.players = { username: dup.username };
      sseManager.broadcast(`messages-session-${session_id}`, 'message', outDup);
      return sendJson(res, outDup);
    }

    const jr = await messagesRepo.insertMessage(pool, session_id, player_id, content, now);
    const out = {
      id: jr.id,
      session_id: jr.session_id,
      player_id: jr.player_id,
      content: jr.content,
      created_at: jr.created_at,
      players: jr.username ? { username: jr.username } : undefined,
    };
    sseManager.broadcast(`messages-session-${session_id}`, 'message', out);
    sendJson(res, out);
  });

  return router;
};
