const clients = new Map(); // channel -> Set<res>

function subscribe(channel, res) {
  let subs = clients.get(channel);
  if (!subs) {
    subs = new Set();
    clients.set(channel, subs);
  }
  subs.add(res);
  return () => {
    const curr = clients.get(channel);
    if (!curr) return;
    curr.delete(res);
    if (curr.size === 0) clients.delete(channel);
  };
}

function safeWrite(res, payload) {
  try {
    res.write(payload);
    return true;
  } catch (e) {
    try { res.end(); } catch (e2) {}
    return false;
  }
}

function broadcast(channel, event, data) {
  const subs = clients.get(channel) || new Set();
  let payloadData = data;
  try {
    // attach server timestamp to payloads so clients can correct clock skew
    if (data && typeof data === 'object') {
      payloadData = { ...(data || {}), server_now: new Date().toISOString() };
    }
  } catch (err) {
    payloadData = data;
  }
  const payload = `data: ${JSON.stringify({ type: event, payload: payloadData })}\n\n`;
  subs.forEach((res) => {
    const ok = safeWrite(res, payload);
    if (!ok) {
      // remove dead connection
      const curr = clients.get(channel);
      if (curr) curr.delete(res);
    }
  });
}

// Optional: keepalive ping to avoid idle proxies dropping connections
const KEEPALIVE_INTERVAL_MS = parseInt(process.env.SSE_KEEPALIVE_MS || '0', 10);
if (KEEPALIVE_INTERVAL_MS > 0) {
  setInterval(() => {
    const now = new Date().toISOString();
    for (const [channel, subs] of clients.entries()) {
      const payload = `data: ${JSON.stringify({ type: 'ping', payload: { server_now: now } })}\n\n`;
      subs.forEach((res) => {
        const ok = safeWrite(res, payload);
        if (!ok) subs.delete(res);
      });
      if (subs.size === 0) clients.delete(channel);
    }
  }, KEEPALIVE_INTERVAL_MS);
}

module.exports = { subscribe, broadcast };
