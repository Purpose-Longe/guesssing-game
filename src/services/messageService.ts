import { postMessage } from '../lib/realtime';

export interface Message {
  id: string;
  session_id: string;
  player_id: string;
  content: string;
  created_at: string;
  players?: { username: string };
}

export async function getSessionMessages(sessionId: string, opts?: { limit?: number; before?: string }): Promise<Message[]> {
  const q = new URLSearchParams();
  if (opts?.limit) q.set('limit', String(opts.limit));
  if (opts?.before) {
    // opts.before may be composite cursor like `${created_at}|${id}` or timestamp
    q.set('before', opts.before);
  }
  const url = `/api/messages/${encodeURIComponent(sessionId)}${q.toString() ? `?${q.toString()}` : ''}`;
  const resp = await fetch(url, { method: 'GET' });
  const data = await resp.json();
  // server returns { messages, hasMore }
  if (data && Array.isArray(data.messages)) {
    return data.messages as Message[];
  }
  return [];
}

export async function sendMessage(sessionId: string, playerId: string, content: string): Promise<Message> {
  return postMessage(sessionId, playerId, content);
}
