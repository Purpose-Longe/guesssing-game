const { v4: uuidv4 } = require('uuid');

function isUuid(v) {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

async function generateUniqueCode(pool) {
  function gen() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  for (let i = 0; i < 20; i++) {
    const c = gen();
    const { rows } = await pool.query(
      "SELECT 1 FROM sessions WHERE code=$1 LIMIT 1",
      [c]
    );
    if (rows.length === 0) return c;
  }
  while (true) {
    const c = gen();
    const { rows } = await pool.query(
      "SELECT 1 FROM sessions WHERE code=$1 LIMIT 1",
      [c]
    );
    if (rows.length === 0) return c;
  }
}

function sendJson(resObj, data) {
  try {
    const now = new Date().toISOString();
    resObj.setHeader('X-Server-Now', now);
    return resObj.json(data);
  } catch (err) {
    try { resObj.setHeader('X-Server-Now', new Date().toISOString()); } catch(e) {}
    return resObj.json(data);
  }
}

module.exports = { isUuid, generateUniqueCode, sendJson };
