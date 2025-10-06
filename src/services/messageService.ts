import { fetchMessages, postMessage } from '../lib/realtime';

export interface Message {
  id: string;
  session_id: string;
  player_id: string;
  content: string;
  created_at: string;
  players?: { username: string };
}

export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  return fetchMessages(sessionId);
}

export async function sendMessage(sessionId: string, playerId: string, content: string): Promise<Message> {
  return postMessage(sessionId, playerId, content);
}
