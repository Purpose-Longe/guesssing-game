const SERVER_URL = import.meta.env.VITE_SERVER_URL ;
import { fetchJson } from '../lib/realtime';

export interface Player {
  id: string;
  session_id: string;
  username: string;
  score: number;
  is_active: boolean;
  joined_at: string;
  updated_at: string;
}

export interface GameSession {
  id: string;
  code: string;
  game_master_id: string | null;
  status: 'waiting' | 'in_progress' | 'ended';
  current_question: string | null;
  current_answer: string | null;
  game_started_at: string | null;
  game_ends_at: string | null;
  // timestamp the server sent when emitting this session payload; used to correct client clock skew
  server_now?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GameAttempt {
  id: string;
  session_id: string;
  player_id: string;
  guess: string;
  is_correct: boolean;
  attempt_number: number;
  created_at: string;
}

export async function generateSessionCode(): Promise<string> {
  // No-op: code is now generated server-side. Keep function for compatibility.
  // Return an empty string to indicate clients should not rely on this.
  return '';
}

export async function createGameSession(username: string): Promise<{ session: GameSession; player: Player }> {
  // request server to create a new session and generate a unique code
  const resp = await fetchJson(`${SERVER_URL}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
  const session = resp.data as GameSession;
  if (resp.server_now) session.server_now = resp.server_now;

  // Attach authenticated user's id to the player row when available
  // no auth in the local server shim; user_id will remain null if not provided

  const playerResp = await fetchJson(`${SERVER_URL}/api/players`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: session.id, username }) });
  const player = playerResp.data as Player;

  await fetch(`${SERVER_URL}/api/sessions/${session.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game_master_id: player.id }) });

  return { session: { ...session, game_master_id: player.id }, player };
}

export async function joinGameSession(code: string, username: string): Promise<{ session: GameSession; player: Player }> {
  const sessionResp = await fetchJson(`${SERVER_URL}/api/sessions/code/${encodeURIComponent(code.toUpperCase())}`);
  const session = sessionResp.data as GameSession;
  if (sessionResp.server_now) session.server_now = sessionResp.server_now;
  const sessionError = null;

  if (sessionError) throw sessionError;
  if (!session) throw new Error('Game session not found or already started');

  const existingListResp = await fetchJson(`${SERVER_URL}/api/players/${session.id}`);
  const existingList = existingListResp.data as Player[];
  const existingPlayer = existingList.find((p: Partial<Player>) => p.username === username) ?? null;

  if (existingPlayer) throw new Error('Username already taken in this session');

  const playerResp2 = await fetchJson(`${SERVER_URL}/api/players`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: session.id, username }) });
  const player = playerResp2.data as Player;

  return { session, player };
}

export async function getSessionPlayers(sessionId: string): Promise<Player[]> {
  const resp = await fetchJson(`${SERVER_URL}/api/players/${sessionId}`);
  return (resp.data as Player[]) || [];
}

export async function startGame(sessionId: string, question: string, answer: string, durationSeconds: number = 60): Promise<void> {
  // remove previous attempts from past rounds so this round starts clean
  const delResultResp = await fetchJson(`${SERVER_URL}/api/attempts/${sessionId}`, { method: 'DELETE' });
  if (!delResultResp.data?.ok) throw new Error('Failed to clear attempts');
  const resultResp = await fetchJson(`${SERVER_URL}/api/sessions/${sessionId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    status: 'in_progress',
    current_question: question,
    current_answer: answer.toLowerCase().trim(),
    duration: durationSeconds
  }) });
  if (!resultResp.data) throw new Error('Failed to start game');
}

export async function submitGuess(
  sessionId: string,
  playerId: string,
  guess: string
): Promise<{ isCorrect: boolean; attemptNumber: number; gameOver: boolean; attempt?: any }> {
  // Use server-side RPC to perform atomic submit: records attempt, checks correctness,
  // awards points and ends the round if necessary. This avoids race conditions.
  const rowResp = await fetchJson(`${SERVER_URL}/api/submit_guess`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, player_id: playerId, guess }) });
  const row = rowResp.data;
  return {
    isCorrect: !!row?.is_correct,
    attemptNumber: row?.attempt_number ?? 0,
    gameOver: !!row?.game_over,
    attempt: row?.attempt ?? row
  };
}

export async function endGame(sessionId: string, winnerId?: string): Promise<void> {
  const dataResp = await fetchJson(`${SERVER_URL}/api/end_round`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, winner_id: winnerId ?? null }) });
  if (!dataResp.data?.ok) throw new Error('Failed to end round');
}

export async function leaveSession(playerId: string, sessionId: string): Promise<void> {
  await fetchJson(`${SERVER_URL}/api/players/${playerId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_active: false }) });

  const playerList = await getSessionPlayers(sessionId);
  if (playerList.length === 0) {
  await fetchJson(`${SERVER_URL}/api/sessions/${sessionId}`, { method: 'DELETE' });
  } else {
  const sessionResp2 = await fetchJson(`${SERVER_URL}/api/sessions/${sessionId}`);
  const session = sessionResp2.data as GameSession;
  if (sessionResp2.server_now) session.server_now = sessionResp2.server_now;
    if (session?.game_master_id === playerId) {
  await fetchJson(`${SERVER_URL}/api/sessions/${sessionId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game_master_id: playerList[0].id }) });
    }
  }
}

export async function getPlayerAttempts(sessionId: string, playerId: string): Promise<GameAttempt[]> {
  const resp = await fetchJson(`${SERVER_URL}/api/attempts/${sessionId}/${playerId}`);
  return (resp.data as GameAttempt[]) || [];
}

export async function getSessionById(sessionId: string): Promise<GameSession | null> {
  try {
  const sessionResp3 = await fetchJson(`${SERVER_URL}/api/sessions/${sessionId}`);
  const session = sessionResp3.data as GameSession;
  if (sessionResp3.server_now) session.server_now = sessionResp3.server_now;
  return session;
  } catch {
    return null;
  }
}

// helpers for localStorage persistence
export function saveSessionLocally(sessionId: string, playerId: string) {
  try {
    localStorage.setItem('pg_session_id', sessionId);
    localStorage.setItem('pg_player_id', playerId);
  } catch (e) {
    console.debug('saveSessionLocally: localStorage not available', e);
  }
}

export function clearLocalSession() {
  try {
    localStorage.removeItem('pg_session_id');
    localStorage.removeItem('pg_player_id');
  } catch (e) {
    console.debug('clearLocalSession: localStorage not available', e);
  }
}
