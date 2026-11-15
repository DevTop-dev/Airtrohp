import { api } from './api';

const KEY = 'airtrohp.guest.token';

export function getGuestToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearGuestToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function setGuestToken(t: string) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable: the server still enforces limits by IP */
  }
}

export interface GuestSession {
  token: string;
  limit: number;
  remaining: number;
}

let inflight: Promise<GuestSession> | null = null;

/**
 * Asks the server for (or re-validates) a signed guest session. The server is the source of truth
 * for how many of the free messages are left; local storage only remembers the opaque token.
 */
export function ensureGuestSession(): Promise<GuestSession> {
  if (!inflight) {
    inflight = (async () => {
      const existing = getGuestToken();
      const s = await api<GuestSession>('/api/guest/session', {
        method: 'POST',
        auth: 'none',
        headers: existing ? { 'X-Guest-Token': existing } : undefined,
      });
      setGuestToken(s.token);
      return s;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
