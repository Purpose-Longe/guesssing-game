import { useEffect, useState, useRef } from 'react';
import { sendMessage, getSessionMessages } from '../services/messageService';
import { subscribeToChannel } from '../lib/realtime';
import type { Message } from '../services/messageService';
import type { Player } from '../services/gameService';

interface ChatProps {
  sessionId: string;
  currentPlayer: Player;
}

export function Chat({ sessionId, currentPlayer }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const autoScrollTimerRef = useRef<number | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const msgs = await getSessionMessages(sessionId);
        const unique = Array.from(new Map((msgs || []).map((m: Message) => [m.id, m])).values());
        setMessages(unique);
      } catch (err) {
        console.error('Failed to load messages', err);
      } finally {
        setInitialLoaded(true);
      }
    })();
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

  // Keep track of user scroll position so we only auto-scroll when appropriate.
  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const NEAR_BOTTOM_PX = 120;
    const near = distanceFromBottom <= NEAR_BOTTOM_PX;
    setIsNearBottom(near);
    if (near && autoScrollTimerRef.current) {
      window.clearTimeout(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // If user is near bottom, always auto-scroll immediately on new messages.
    if (isNearBottom) {
      try {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } catch {
        try { el.scrollTo({ top: el.scrollHeight }); } catch (e) {}
      }
      return;
    }

    // If user is not near bottom, schedule a timed auto-scroll so they eventually catch up
    // after a grace period (e.g., 10s). This prevents permanent stuck unread messages.
    const AUTO_SCROLL_MS = 10000; // 10 seconds
    if (autoScrollTimerRef.current) window.clearTimeout(autoScrollTimerRef.current);
    autoScrollTimerRef.current = window.setTimeout(() => {
      try {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } catch {
        try { el.scrollTo({ top: el.scrollHeight }); } catch (e) {}
      }
      autoScrollTimerRef.current = null;
    }, AUTO_SCROLL_MS) as unknown as number;

    return () => {
      if (autoScrollTimerRef.current) {
        window.clearTimeout(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    };
  }, [messages, isNearBottom]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoScrollTimerRef.current) {
        window.clearTimeout(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    };
  }, []);

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
    <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-auto space-y-2 mb-3" style={{ maxHeight: '360px' }}>
        <div className="text-center mb-2">
          {!initialLoaded ? (
            <div className="text-xs text-gray-400">Loading messages...</div>
          ) : null}
        </div>
        {messages.map((m) => (
          <div key={m.id} className={`p-2 rounded max-w-[92%] md:max-w-[80%] break-words ${m.player_id === currentPlayer.id ? 'bg-blue-100 self-end ml-auto' : 'bg-gray-100'}`}>
            <div className="text-sm font-semibold">{m.player_id === currentPlayer.id ? 'You' : m.players?.username ?? m.player_id}</div>
              {/* let the list container handle scrolling; allow long messages to wrap */}
              <div className="text-sm whitespace-pre-wrap">{m.content}</div>
            <div className="text-xs text-gray-400 mt-1">{new Date(m.created_at).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="flex gap-2 items-center w-full">
        {/* allow the input to shrink on small screens */}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 border rounded"
          placeholder="Type a message..."
        />
        {/* keep the button from growing/shrinking and give it a small min width */}
        <button
          type="submit"
          className="flex-none px-3 py-2 bg-blue-600 text-white rounded min-w-[56px]"
        >
          Send
        </button>
      </form>
    </div>
  );
}
