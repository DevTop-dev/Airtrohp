// Minimal structural types so the Worker has zero npm dependencies
// and compiles with plain `tsc` (no @cloudflare/workers-types needed).

export type TierId = 'free' | 'pro' | 'ultimate';

export interface DurableObjectStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number): Promise<void>;
}

export interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
}

export interface DurableObjectStubLike {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Env {
  // ---- Secrets (wrangler secret put ...) ----
  GEMINI_API_KEY: string;
  FIREBASE_SERVICE_ACCOUNT: string; // JSON of a Firebase service account
  APP_SECRET: string; // random 32+ byte string: signs guest tokens, OAuth state, IP hashes
  PATREON_CLIENT_ID?: string;
  PATREON_CLIENT_SECRET?: string;
  PATREON_WEBHOOK_SECRET?: string;
  ADMIN_UIDS?: string; // comma separated Firebase UIDs
  ADMIN_EMAILS?: string; // comma separated, must also be email-verified

  // ---- Plain vars (wrangler.toml [vars]) ----
  FIREBASE_PROJECT_ID: string;
  FRONTEND_URL: string;
  ALLOWED_ORIGINS: string; // comma separated
  GEMINI_MODEL?: string;
  GEMINI_MODEL_PRO?: string;
  GUEST_MESSAGE_LIMIT?: string;
  GUEST_IP_DAILY_LIMIT?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  ENABLE_ULTIMATE?: string;
  TIER_CONFIG?: string; // optional JSON overrides per tier
  PATREON_CAMPAIGN_ID?: string;
  PATREON_PRO_TIER_ID?: string;
  PATREON_ULTIMATE_TIER_ID?: string;
  PATREON_REDIRECT_URI?: string; // https://<worker>/api/patreon/callback
  PATREON_JOIN_URL?: string; // public link to your Patreon page

  // ---- Bindings ----
  USAGE: DurableObjectNamespaceLike;
}
