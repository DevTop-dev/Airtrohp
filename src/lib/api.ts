import { getSelectedProvider } from './models';
import { API_URL } from './config';
import { auth } from './firebase';
import { clearGuestToken, ensureGuestSession, getGuestToken } from './guest';
import type { AttachedFile, PublicConfig } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** 'user' attaches the Firebase ID token, 'none' sends no credentials */
  auth?: 'user' | 'none';
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function userHeaders(): Promise<Record<string, string>> {
  const u = auth.currentUser;
  if (!u) return {};
  return { Authorization: `Bearer ${await u.getIdToken()}` };
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = 'HTTP_ERROR';
  let message = `Request failed (${res.status})`;
  let data: Record<string, unknown> = {};
  try {
    const j = (await res.json()) as { error?: { code?: string; message?: string } & Record<string, unknown> };
    if (j.error) {
      const { code: c, message: m, ...rest } = j.error;
      code = c ?? code;
      message = m ?? message;
      data = rest;
    }
  } catch {
    /* non JSON error body */
  }
  return new ApiError(res.status, code, message, data);
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== 'none') Object.assign(headers, await userHeaders());
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the Airtrohp server. Check your connection and try again.');
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

let configCache: Promise<PublicConfig> | null = null;
export function getPublicConfig(): Promise<PublicConfig> {
  if (!configCache) {
    configCache = api<PublicConfig>('/api/config', { auth: 'none' }).catch((e) => {
      configCache = null;
      throw e;
    });
  }
  return configCache;
}

// ---------------------------------------------------------------------------
// Streaming chat
// ---------------------------------------------------------------------------

export interface ChatRequestMessage {
  role: 'user' | 'model';
  content: string;
  files?: Pick<AttachedFile, 'name' | 'content'>[];
}

export type StreamEvent =
  | { type: 'meta'; remaining: number; limit: number; tier: string; provider?: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; finishReason: string; usage: { promptTokens: number; outputTokens: number }; remaining: number }
  | { type: 'error'; code: string; message: string; remaining?: number };

export async function streamChat(
  payload: { messages: ChatRequestMessage[]; context?: { name: string; content: string }[] },
  handlers: { signal?: AbortSignal; onEvent: (e: StreamEvent) => void },
  retried = false,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.currentUser) {
    Object.assign(headers, await userHeaders());
  } else {
    const token = getGuestToken() ?? (await ensureGuestSession()).token;
    headers['X-Guest-Token'] = token;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: payload.messages, context: payload.context ?? [], provider: getSelectedProvider() }),
      signal: handlers.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the Airtrohp server. Check your connection and try again.');
  }
  if (!res.ok) {
    const err = await toApiError(res);
    if (err.code === 'INVALID_GUEST_TOKEN' && !auth.currentUser && !retried) {
      // The stored guest token is no longer valid (e.g. server secret rotated): start a fresh guest session once.
      clearGuestToken();
      return streamChat(payload, handlers, true);
    }
    throw err;
  }
  if (!res.body) throw new ApiError(0, 'NO_STREAM', 'Your browser did not provide a response stream.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          handlers.onEvent(JSON.parse(line.slice(5).trim()) as StreamEvent);
        } catch {
          /* ignore malformed event */
        }
      }
    }
  }
}
