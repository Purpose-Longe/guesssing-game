import { useState, useEffect, useCallback } from 'react';
import { subscribeToChannel, fetchJson } from '../lib/realtime';
import type { GameSession, Player, GameAttempt } from '../services/gameService';
import {
  createGameSession,
  joinGameSession,
  getSessionPlayers,
  startGame,
  submitGuess,
  endGame,
  leaveSession,
  getPlayerAttempts
} from '../services/gameService';
import { getSessionById, saveSessionLocally, clearLocalSession } from '../services/gameService';

export function useGameSession() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [attempts, setAttempts] = useState<GameAttempt[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(60);
  // server-client skew in ms (serverTime - clientTimeAtReceipt)
  const [serverSkewMs, setServerSkewMs] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleCreateSession = async (username: string) => {
    try {
      setLoading(true);
      setError('');
      const { session: newSession, player } = await createGameSession(username);
      setSession(newSession);
      setCurrentPlayer(player);
  saveSessionLocally(newSession.id, player.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async (code: string, username: string) => {
    try {
      setLoading(true);
      setError('');
      const { session: joinedSession, player } = await joinGameSession(code, username);
      setSession(joinedSession);
      setCurrentPlayer(player);
  saveSessionLocally(joinedSession.id, player.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to join session');
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = async (question: string, answer: string) => {
    if (!session) return;

    try {
      setError('');
      await startGame(session.id, question, answer);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start game');
    }
  };

  const handleSubmitGuess = async (guess: string) => {
    if (!session || !currentPlayer) return;

    try {
      setError('');
      const resp = await submitGuess(session.id, currentPlayer.id, guess);
      // If server returned the created attempt, optimistically add it so UI feels snappy.
      if (resp.attempt) {
        setAttempts(prev => {
          // avoid duplicates
          if (prev.some(a => a.id === resp.attempt.id)) return prev;
          return [...prev, resp.attempt];
        });
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to submit guess');
    }
  };

  const handleLeaveSession = async () => {
    if (!currentPlayer || !session) return;

    try {
      await leaveSession(currentPlayer.id, session.id);
      setSession(null);
      setCurrentPlayer(null);
      setPlayers([]);
      setAttempts([]);
  clearLocalSession();
    } catch (error) {
      console.error('Failed to leave session:', error);
    }
  };

  const loadPlayers = useCallback(async () => {
    if (!session) return;

    try {
      const loadedPlayers = await getSessionPlayers(session.id);
      setPlayers(loadedPlayers);
    } catch (error) {
      console.error('Failed to load players:', error);
    }
  }, [session]);

  type SSEPayload = { type: string; payload?: unknown };

  const loadAttempts = useCallback(async () => {
    if (!session || !currentPlayer) return;

    try {
      const loadedAttempts = await getPlayerAttempts(session.id, currentPlayer.id);
      setAttempts(loadedAttempts);
    } catch (error) {
      console.error('Failed to load attempts:', error);
    }
  }, [session, currentPlayer]);

  useEffect(() => {
    if (!session) return;

    loadPlayers();

    // subscribe via SSE helper
    const unsub1 = subscribeToChannel(`session-${session.id}`, (d: unknown) => {
      if (d && typeof d === 'object' && 'type' in d) {
        const dd = d as SSEPayload;
        if (dd.type === 'session_update') {
          const payload = dd.payload as GameSession & { server_now?: string };
          // compute skew = serverNow - clientNowAtReceipt and store for live countdown
          if (payload.server_now) {
            const serverNowMs = new Date(payload.server_now).getTime();
            const clientNowMs = Date.now();
            setServerSkewMs(serverNowMs - clientNowMs);
          }
          setSession(prev => ({ ...(payload), server_now: payload.server_now || prev?.server_now || null } as GameSession));
        }
        if (dd.type === 'player_join' || dd.type === 'player_update' || dd.type === 'player_leave' || dd.type === 'session_update') {
          // reload players list on any player-related events or when session updates
          loadPlayers();
        }
      }
    });

    const unsub2 = subscribeToChannel(`game-session-${session.id}`, (d: unknown) => {
      if (d && typeof d === 'object' && 'type' in d) {
        const dd = d as SSEPayload;
        if (dd.type === 'attempt_insert') {
          const attempt = dd.payload as GameAttempt;
          setAttempts(prev => {
            if (prev.some(a => a.id === attempt.id)) return prev;
            return [...prev, attempt];
          });
        }
      }
    });

    return () => { unsub1(); unsub2(); };
  }, [session, loadPlayers]);

  // send periodic heartbeat to mark player as active and update last_seen
  useEffect(() => {
    if (!currentPlayer) return;
  const HEARTBEAT_INTERVAL_MS = parseInt((import.meta.env.VITE_HEARTBEAT_MS as string) || '25000', 10);
    let stopped = false;
    const doHeartbeat = async () => {
      try {
        await fetchJson(`${(import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '') || ''}/api/players/${currentPlayer.id}/heartbeat`, { method: 'POST' });
      } catch (err) {
        // ignore heartbeat failures; it will retry on next interval
        console.debug('heartbeat failed', err);
      }
    };
    // initial fire
    doHeartbeat();
    const id = setInterval(() => { if (!stopped) doHeartbeat(); }, Math.max(5000, HEARTBEAT_INTERVAL_MS));
    return () => { stopped = true; clearInterval(id); };
  }, [currentPlayer]);

  // rehydrate from localStorage on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sid = localStorage.getItem('pg_session_id');
        const pid = localStorage.getItem('pg_player_id');
        if (!sid || !pid) return;
        const s = await getSessionById(sid);
        if (!s) { clearLocalSession(); return; }
        if (!mounted) return;
        setSession(s);
        // load player object
        const players = await getSessionPlayers(s.id);
        const p = players.find((x) => x.id === pid) ?? null;
        setCurrentPlayer(p);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!session || session.status !== 'in_progress' || !session.game_ends_at) {
      setTimeRemaining(60);
      return;
    }

    // Use server-client skew when provided to avoid relying on clients' clocks.
    const calculateTimeRemaining = () => {
      const endsAt = new Date(session.game_ends_at!).getTime();
      if (serverSkewMs !== null) {
        const serverNowEstimate = Date.now() + serverSkewMs;
        const remaining = Math.ceil((endsAt - serverNowEstimate) / 1000);
        return Math.max(0, remaining);
      }
      // fallback: use server_now embedded in session if present (best-effort)
      if (session.server_now) {
        const serverNow = new Date(session.server_now).getTime();
        const remaining = Math.ceil((endsAt - serverNow) / 1000);
        return Math.max(0, remaining);
      }
      // no server reference: best-effort local countdown
      const remainingLocal = Math.ceil((endsAt - Date.now()) / 1000);
      return Math.max(0, remainingLocal);
    };

    setTimeRemaining(calculateTimeRemaining());

    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining();
      setTimeRemaining(remaining);

      if (remaining <= 0 && session.status === 'in_progress') {
        endGame(session.id).catch(console.error);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (session && (session.status === 'in_progress' || session.status === 'ended')) {
      loadAttempts();
    } else {
      setAttempts([]);
    }
  }, [session, loadAttempts]);

  const currentPlayerAttemptCount = currentPlayer ? attempts.filter(a => a.player_id === currentPlayer.id).length : 0;
  const remainingAttemptsForCurrent = 3 - currentPlayerAttemptCount;

  return {
    session,
    currentPlayer,
    players,
    attempts,
    remainingAttemptsForCurrent,
    timeRemaining,
    error,
    loading,
    handleCreateSession,
    handleJoinSession,
    handleStartGame,
    handleSubmitGuess,
    handleLeaveSession
  };
}
