const express = require('express');

function makeAdminRouter({ pool, utils }) {
  const router = express.Router();
  const { sendJson } = utils;

  // simple token middleware
  router.use((req, res, next) => {
    const token = req.header('x-admin-token') || req.header('X-Admin-Token');
    const expected = process.env.ADMIN_CLEANUP_TOKEN || null;
    if (!expected || !token || token !== expected) {
      res.status(403);
      return sendJson(res, { error: 'forbidden' });
    }
    next();
  });

  async function cleanupStaleSessions() {
    const CLEANUP_THRESHOLD_MINUTES = parseInt(process.env.CLEANUP_THRESHOLD_MINUTES || '60', 10);
    try {
      const res = await pool.query(
        `DELETE FROM sessions s WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.session_id = s.id AND p.is_active) AND s.updated_at < (now() - ($1 || '0 minutes')::interval) RETURNING id, code`,
        [`${CLEANUP_THRESHOLD_MINUTES} minutes`]
      );
      return res.rows || [];
    } catch (err) {
      throw err;
    }
  }

  router.post('/cleanup_sessions', async (req, res) => {
    try {
      const rows = await cleanupStaleSessions();
      return sendJson(res, { ok: true, deleted: rows.length });
    } catch (err) {
      console.error('manual cleanup failed', err);
      res.status(500);
      return sendJson(res, { error: 'internal error' });
    }
  });

  return router;
}

module.exports = makeAdminRouter;
