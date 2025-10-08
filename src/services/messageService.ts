import { postMessage, fetchMessages } from '../lib/realtime';

export interface Message {
  id: string;
  session_id: string;
  player_id: string;
  content: string;
  created_at: string;
  players?: { username: string };
}

export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  const resp = await fetchMessages(sessionId);
  if (resp && Array.isArray(resp.messages)) return resp.messages as Message[];
  return [];
}

export async function sendMessage(sessionId: string, playerId: string, content: string): Promise<Message> {
  return postMessage(sessionId, playerId, content);
}
