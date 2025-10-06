import { useEffect, useState, useRef } from 'react';
import { getSessionMessages, sendMessage } from '../services/messageService';
import { subscribeToChannel } from '../lib/realtime';
import type { Message } from '../services/messageService';
import type { Player } from '../services/gameService';

interface ChatProps {
  sessionId: string;
  currentPlayer: Player;
  players?: Player[];
}

export function Chat({ sessionId, currentPlayer, players = [] }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    getSessionMessages(sessionId)
      .then((msgs) => {
        // dedupe by id in case server contains duplicates
        const map = new Map<string, Message>();
        msgs.forEach((m) => map.set(m.id, m));
        setMessages(Array.from(map.values()));
      })
      .catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    type SSEPayload = { type: string; payload?: unknown };
    const unsubscribe = subscribeToChannel(`messages-session-${sessionId}`, (data: unknown) => {
      if (data && typeof data === 'object' && 'type' in data) {
        const d = data as SSEPayload;
        if (d.type === 'message' && d.payload) {
          const p = d.payload as Message;
          setMessages((m) => {
            // dedupe by id
            if (m.some((msg) => msg.id === p.id)) return m;
            // fallback dedupe: same player + content + exact timestamp
            if (m.some((msg) => msg.player_id === p.player_id && msg.content === p.content && msg.created_at === p.created_at)) return m;
            return [...m, p];
          });
        }
      }
    });
    return () => unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    if (isSending) return; // prevent duplicate submits
    try {
      setIsSending(true);
      const msg = await sendMessage(sessionId, currentPlayer.id, text.trim());
      setMessages((m) => {
        if (m.some((existing) => existing.id === msg.id)) return m;
        return [...m, msg];
      });
      setText('');
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white rounded-lg p-4 h-full flex flex-col">
      <div ref={listRef} className="flex-1 overflow-auto space-y-2 mb-3">
        {messages.map((m) => {
          const fromCurrent = m.player_id === currentPlayer.id;
          // try to resolve username from players list first
          const resolved = players.find((p) => p.id === m.player_id)?.username || m.players?.username || m.player_id;
          return (
          <div key={m.id} className={`p-2 rounded max-w-[80%] ${fromCurrent ? 'bg-blue-100 self-end ml-auto' : 'bg-gray-100'}`}>
            <div className="text-sm font-semibold">{fromCurrent ? 'You' : resolved}</div>
            <div className="text-sm">{m.content}</div>
            <div className="text-xs text-gray-400 mt-1">{new Date(m.created_at).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 px-3 py-2 border rounded" placeholder="Type a message..." />
        <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded">Send</button>
      </form>
    </div>
  );
}
