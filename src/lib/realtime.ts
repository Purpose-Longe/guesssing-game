export function subscribeToChannel(channel: string, onMessage: (event: unknown) => void) {
  const envBase = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : '');
  const url = `${base}/sse/${encodeURIComponent(channel)}`;
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

export async function fetchJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  const serverNow = res.headers.get('X-Server-Now') || null;
  const data = await res.json();
  return { data, server_now: serverNow } as { data: any; server_now: string | null };
}

export async function fetchMessages(sessionId: string) {
  const envBase = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : '');
  const resp = await fetchJson(`${base}/api/messages/${encodeURIComponent(sessionId)}`);
  return resp.data as any;
}

export async function postMessage(sessionId: string, playerId: string, content: string) {
  const envBase = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : '');
  const resp = await fetchJson(`${base}/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, player_id: playerId, content })
  });
  return resp.data as any;
}
