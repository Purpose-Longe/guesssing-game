export function subscribeToChannel(channel: string, onMessage: (event: unknown) => void) {
  const url = `${import.meta.env.VITE_SERVER_URL }/sse/${encodeURIComponent(channel)}`;
  const es = new EventSource(url);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data);
    } catch {
      // ignore parse errors
    }
  };
  return () => es.close();
}

export async function fetchMessages(sessionId: string) {
  const res = await fetch(`${import.meta.env.VITE_SERVER_URL }/api/messages/${sessionId}`);
  return res.json();
}

export async function postMessage(sessionId: string, playerId: string, content: string) {
  const res = await fetch(`${import.meta.env.VITE_SERVER_URL }/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, player_id: playerId, content })
  });
  return res.json();
}
