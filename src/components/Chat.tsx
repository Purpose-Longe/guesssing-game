import { useEffect, useState, useRef } from 'react';
import { sendMessage } from '../services/messageService';
import { DEFAULT_PAGE_SIZE } from '../config';
import { subscribeToChannel } from '../lib/realtime';
import type { Message } from '../services/messageService';
import type { Player } from '../services/gameService';

interface ChatProps {
  sessionId: string;
  currentPlayer: Player;
}

export function Chat({ sessionId, currentPlayer }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [hasLoadedEarlier, setHasLoadedEarlier] = useState(false);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    // initial load: latest 50 messages
    (async () => {
      try {
        const url = `/api/messages/${encodeURIComponent(sessionId)}?limit=${DEFAULT_PAGE_SIZE}`;
        const resp = await fetch(url);
        const data = await resp.json();
        const msgs = (data.messages || []) as Message[];
        const unique = Array.from(new Map(msgs.map((m: Message) => [m.id, m])).values());
        // Defensive: server should return at most DEFAULT_PAGE_SIZE, but trim to ensure UI shows only the page size
        if (!unique || unique.length <= DEFAULT_PAGE_SIZE) {
          setMessages(unique);
        } else {
          setMessages(unique.slice(-DEFAULT_PAGE_SIZE));
          setHasLoadedEarlier(true);
        }
        setHasMore(!!data.hasMore);
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
            const next = [...m, p];
            if (!hasLoadedEarlier && next.length > DEFAULT_PAGE_SIZE) {
              // keep only the most recent page when earlier pages haven't been loaded
              return next.slice(-DEFAULT_PAGE_SIZE);
            }
            return next;
          });
        }
      }
    });
    return () => unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const loadEarlier = async () => {
    if (!sessionId || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const earliest = messages[0];
  const cursor = `${earliest.created_at}|${earliest.id}`;
  const url = `/api/messages/${encodeURIComponent(sessionId)}?limit=${DEFAULT_PAGE_SIZE}&before=${encodeURIComponent(cursor)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      const older = data.messages || [];
      if (!older || older.length === 0) {
        setHasMore(false);
        return;
      }
      // preserve scroll position: record scroll height before prepend
      const el = listRef.current;
      const prevScrollHeight = el ? el.scrollHeight : 0;

      // prepend older messages
      setMessages((prev) => {
        const map = new Map<string, Message>();
        older.forEach((m: Message) => map.set(m.id, m));
        prev.forEach((m: Message) => map.set(m.id, m));
        return Array.from(map.values());
      });
      // user explicitly loaded earlier pages
      setHasLoadedEarlier(true);

      // after DOM updates, restore scroll position so view doesn't jump
      requestAnimationFrame(() => {
        if (!el) return;
        const newScrollHeight = el.scrollHeight;
        // set scrollTop so that content stays in the same visual position
        el.scrollTop = newScrollHeight - prevScrollHeight;
      });
      setHasMore(!!data.hasMore);
    } catch (err) {
      console.error('Failed to load earlier messages', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // infinite scroll: when scrolled to top, load earlier messages
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (el.scrollTop === 0 && initialLoaded && hasMore && !loadingMore) {
          loadEarlier().catch(console.error);
        }
        ticking = false;
      });
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [messages, hasMore, loadingMore]);

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
        <div className="text-center mb-2">
          {!initialLoaded ? (
            // initial load in progress; don't show pagination controls yet
            <div className="text-xs text-gray-400">Loading messages...</div>
          ) : messages.length < DEFAULT_PAGE_SIZE ? (
            // not enough messages to paginate yet — don't show pagination controls
            null
          ) : hasMore ? (
            <button onClick={loadEarlier} disabled={loadingMore} className="text-sm text-blue-600 underline">
              {loadingMore ? 'Loading...' : 'Load earlier messages'}
            </button>
          ) : (
            <div className="text-xs text-gray-400">No more messages</div>
          )}
        </div>
        {messages.map((m) => (
          <div key={m.id} className={`p-2 rounded max-w-[92%] md:max-w-[80%] break-words ${m.player_id === currentPlayer.id ? 'bg-blue-100 self-end ml-auto' : 'bg-gray-100'}`}>
            <div className="text-sm font-semibold">{m.player_id === currentPlayer.id ? 'You' : m.players?.username ?? m.player_id}</div>
            <div className="text-sm">{m.content}</div>
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
