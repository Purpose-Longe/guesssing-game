const DEFAULT_THRESHOLD_MINUTES = 60;

async function cleanupStaleSessions(pool, opts = {}) {
  const CLEANUP_THRESHOLD_MINUTES = parseInt(process.env.CLEANUP_THRESHOLD_MINUTES || String(opts.threshold || DEFAULT_THRESHOLD_MINUTES), 10);
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

module.exports = { cleanupStaleSessions };
