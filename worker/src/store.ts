import type { Env, TierId } from './env';
import { getTiers, type TierConfig } from './config';

export interface Membership {
  tier: TierId;
  status: 'none' | 'active' | 'declined' | 'former' | 'manual';
  source: 'none' | 'patreon' | 'admin';
  patreonUserId: string | null;
  expiresAt: number | null;
  verifiedAt: number | null;
}

export interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  createdAt: number;
  lastSeenAt: number;
  disabled: boolean;
  membership: Membership;
}

export interface PatreonTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface UsageDay {
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface GlobalStats {
  guestSessions: number;
  guestRequests: number;
  userRequests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface DailyStat {
  day: string;
  guestRequests: number;
  userRequests: number;
}

/** Persistence boundary. Production: Firestore REST (firestore.ts). Tests: in-memory. */
export interface Store {
  getUser(uid: string): Promise<UserRecord | null>;
  ensureUser(p: { uid: string; email: string; displayName: string }): Promise<UserRecord>;
  updateUser(uid: string, patch: Partial<Pick<UserRecord, 'disabled' | 'lastSeenAt' | 'email' | 'displayName'>>): Promise<void>;
  setMembership(uid: string, m: Membership): Promise<void>;
  listUsers(pageSize: number, pageToken?: string): Promise<{ users: UserRecord[]; nextPageToken?: string }>;
  countUsers(tier?: TierId): Promise<number>;
  getPatreonLink(patreonUserId: string): Promise<string | null>;
  setPatreonLink(patreonUserId: string, uid: string): Promise<void>;
  deletePatreonLink(patreonUserId: string): Promise<void>;
  getPatreonTokens(uid: string): Promise<PatreonTokens | null>;
  savePatreonTokens(uid: string, t: PatreonTokens): Promise<void>;
  deletePatreonTokens(uid: string): Promise<void>;
  recordUsage(e: { uid: string | null; day: string; inputTokens: number; outputTokens: number }): Promise<void>;
  recordGuestSession(day: string): Promise<void>;
  getUsageDays(uid: string, days: string[]): Promise<UsageDay[]>;
  getGlobalStats(): Promise<GlobalStats>;
  getDailyStats(days: string[]): Promise<DailyStat[]>;
  ping(): Promise<boolean>;
  setAuthDisabled(uid: string, disabled: boolean): Promise<void>;
}

export const FREE_MEMBERSHIP: Membership = {
  tier: 'free',
  status: 'none',
  source: 'none',
  patreonUserId: null,
  expiresAt: null,
  verifiedAt: null,
};

/** Resolve the tier a user is really entitled to right now (server-side only). */
export function entitlement(env: Env, user: UserRecord, now: number): TierConfig {
  const tiers = getTiers(env);
  const m = user.membership;
  let id: TierId = m.tier;
  if (id !== 'free' && m.source === 'patreon' && m.expiresAt && now > m.expiresAt) id = 'free';
  if (!tiers[id]?.enabled) id = 'free';
  return tiers[id];
}
