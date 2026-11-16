import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, streamChat, type ChatRequestMessage } from '../lib/api';
import { newId, titleFrom } from '../lib/format';
import type { ChatStorage } from '../lib/storage';
import type { AttachedFile, ChatMessage } from '../lib/types';

export interface ChatError {
  code: string;
  message: string;
  /** Epoch ms when a USAGE_LIMIT block ends. */
  resetsAt?: number;
}
export interface Quota {
  remaining: number;
  limit: number;
}

interface Args {
  storage: ChatStorage;
  conversationId: string | undefined;
  onConversationCreated: (id: string) => void;
  /** Maximum characters the server accepts for this identity (plan or guest). */
  maxChars: number;
  projectId: string | null;
  loadContext: () => Promise<{ name: string; content: string }[]>;
}

function sizeOf(m: ChatMessage): number {
  return m.content.length + (m.files ?? []).reduce((n, f) => n + f.content.length + f.name.length, 0);
}

/** Drops the oldest messages until the request fits the plan's context budget (always keeps the newest). */
export function trimHistory(history: ChatMessage[], budget: number): ChatMessage[] {
  let total = 0;
  const kept: ChatMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const s = sizeOf(history[i]);
    if (kept.length > 0 && total + s > budget) break;
    total += s;
    kept.unshift(history[i]);
  }
  while (kept.length > 1 && kept[0].role !== 'user') kept.shift();
  return kept;
}

const toApi = (m: ChatMessage): ChatRequestMessage => ({
  role: m.role,
  content: m.content,
  files: m.files?.map((f) => ({ name: f.name, content: f.content })),
});

export function useChat({ storage, conversationId, onConversationCreated, maxChars, projectId, loadContext }: Args) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const convRef = useRef<string | undefined>(conversationId);
  const createdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load a conversation when the route changes (skipped for one we just created ourselves).
  useEffect(() => {
    convRef.current = conversationId;
    setError(null);
    setNotFound(false);
    if (!conversationId) {
      setMessages([]);
      return;
    }
    if (createdRef.current === conversationId) {
      createdRef.current = null;
      return;
    }
    let alive = true;
    setLoading(true);
    storage
      .load(conversationId)
      .then((r) => {
        if (!alive) return;
        setMessages(r.messages);
        setNotFound(!r.meta);
      })
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, [conversationId, storage]);

  const run = useCallback(
    async (cid: string, history: ChatMessage[]) => {
      const placeholder: ChatMessage = { id: newId(), role: 'model', content: '', createdAt: Date.now() };
      setMessages([...history, placeholder]);
      setStreaming(true);
      setError(null);
      const ac = new AbortController();
      abortRef.current = ac;
      let acc = '';
      let timer: ReturnType<typeof setTimeout> | null = null;
      const st: { err: { code: string; message: string } | null } = { err: null };
      const visible = () => convRef.current === cid;
      const flush = () => {
        timer = null;
        if (visible()) setMessages((prev) => prev.map((m) => (m.id === placeholder.id ? { ...m, content: acc } : m)));
      };

      try {
        const context = await loadContext();
        const ctxChars = context.reduce((n, f) => n + f.content.length + f.name.length, 0);
        const payload = trimHistory(history, Math.max(5000, maxChars - ctxChars)).map(toApi);
        await streamChat(
          { messages: payload, context },
          {
            signal: ac.signal,
            onEvent: (ev) => {
              if (ev.type === 'delta') {
                acc += ev.text;
                if (!timer) timer = setTimeout(flush, 50);
              } else if (ev.type === 'meta') setQuota({ remaining: ev.remaining, limit: ev.limit });
              else if (ev.type === 'done') setQuota((q) => ({ remaining: ev.remaining, limit: q?.limit ?? ev.remaining }));
              else if (ev.type === 'error') {
                st.err = { code: ev.code, message: ev.message };
                if (typeof ev.remaining === 'number') setQuota((q) => ({ remaining: ev.remaining as number, limit: q?.limit ?? (ev.remaining as number) }));
              }
            },
          },
        );
        if (timer) clearTimeout(timer);
        flush();
        if (st.err) throw new ApiError(0, st.err.code, st.err.message);
        await storage.saveMessage(cid, { ...placeholder, content: acc }).catch(() => undefined);
      } catch (e) {
        if (timer) clearTimeout(timer);
        const aborted = (e as Error)?.name === 'AbortError';
        if (acc) {
          if (visible()) setMessages((prev) => prev.map((m) => (m.id === placeholder.id ? { ...m, content: acc } : m)));
          await storage.saveMessage(cid, { ...placeholder, content: acc }).catch(() => undefined);
        } else if (visible()) {
          setMessages((prev) => prev.filter((m) => m.id !== placeholder.id));
        }
        if (!aborted && visible()) {
          const err: ChatError =
            e instanceof ApiError
              ? { code: e.code, message: e.message, resetsAt: typeof e.data.resetsAt === 'number' ? e.data.resetsAt : undefined }
              : { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
          if (err.code === 'GUEST_LIMIT_REACHED') setQuota((q) => ({ remaining: 0, limit: q?.limit ?? 5 }));
          setError(err);
        }
      } finally {
        if (visible()) setStreaming(false);
        if (abortRef.current === ac) abortRef.current = null;
      }
    },
    [loadContext, maxChars, storage],
  );

  const send = useCallback(
    async (text: string, files: AttachedFile[]) => {
      if (streaming) return;
      const trimmed = text.trim();
      if (!trimmed && files.length === 0) return;
      let cid = convRef.current;
      if (!cid) {
        cid = await storage.create(titleFrom(trimmed || files[0].name), projectId);
        createdRef.current = cid;
        convRef.current = cid;
        onConversationCreated(cid);
      }
      const userMsg: ChatMessage = { id: newId(), role: 'user', content: trimmed, files: files.length ? files : undefined, createdAt: Date.now() };
      await storage.saveMessage(cid, userMsg).catch(() => undefined);
      await run(cid, [...messagesRef.current, userMsg]);
    },
    [onConversationCreated, projectId, run, storage, streaming],
  );

  const editMessage = useCallback(
    async (id: string, text: string) => {
      const cid = convRef.current;
      if (!cid || streaming) return;
      const list = messagesRef.current;
      const i = list.findIndex((m) => m.id === id);
      if (i < 0 || list[i].role !== 'user') return;
      await storage.deleteMessages(cid, list.slice(i).map((m) => m.id)).catch(() => undefined);
      const edited: ChatMessage = { ...list[i], id: newId(), content: text.trim(), createdAt: Date.now() };
      await storage.saveMessage(cid, edited).catch(() => undefined);
      await run(cid, [...list.slice(0, i), edited]);
    },
    [run, storage, streaming],
  );

  const regenerate = useCallback(async () => {
    const cid = convRef.current;
    if (!cid || streaming) return;
    const list = messagesRef.current;
    const last = list[list.length - 1];
    if (!last) return;
    if (last.role === 'model') {
      await storage.deleteMessages(cid, [last.id]).catch(() => undefined);
      await run(cid, list.slice(0, -1));
    } else {
      await run(cid, list); // last message is the user's (previous attempt failed)
    }
  }, [run, storage, streaming]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const clearError = useCallback(() => setError(null), []);

  return { messages, streaming, loading, notFound, error, quota, setQuota, send, editMessage, regenerate, stop, clearError };
}
