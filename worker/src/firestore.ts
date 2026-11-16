import type { Env, TierId } from './env';
import type { DailyStat, GlobalStats, Membership, PatreonTokens, Store, UsageDay, UserRecord } from './store';
import { FREE_MEMBERSHIP } from './store';
import { HttpError, b64url, enc } from './utils';

// ---------- value conversion ----------

type FsValue = Record<string, unknown>;

export function toValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
  return { nullValue: null };
}

export function toFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = toValue(v);
  return out;
}

export function fromValue(v: FsValue): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Date.parse(String(v.timestampValue));
  if ('arrayValue' in v) return (((v.arrayValue as { values?: FsValue[] }).values) ?? []).map(fromValue);
  if ('mapValue' in v) return fromFields(((v.mapValue as { fields?: Record<string, FsValue> }).fields) ?? {});
  return null;
}

export function fromFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromValue(v);
  return out;
}

interface RawDoc {
  name: string;
  fields?: Record<string, FsValue>;
}

function docData(doc: RawDoc): Record<string, unknown> & { _id: string } {
  return { _id: doc.name.split('/').pop() as string, ...fromFields(doc.fields ?? {}) };
}

// ---------- service-account OAuth ----------

let tokenCache: { token: string; expires: number } | null = null;

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer as ArrayBuffer;
}

async function getAccessToken(env: Env, fetcher: typeof fetch): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expires > now + 60_000) return tokenCache.token;
  let sa: { client_email: string; private_key: string };
  try {
    sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  } catch {
    throw new HttpError(500, 'SERVER_MISCONFIGURED', 'Server configuration error');
  }
  const iat = Math.floor(now / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
        aud: 'https://oauth2.googleapis.com/token',
        iat,
        exp: iat + 3600,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claims}`)));
  const res = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${sig}`,
    }),
  });
  if (!res.ok) throw new HttpError(500, 'SERVER_MISCONFIGURED', 'Could not authenticate with Firebase');
  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: body.access_token, expires: now + body.expires_in * 1000 };
  return body.access_token;
}

// ---------- REST client ----------

export class FirestoreClient {
  constructor(
    private env: Env,
    private fetcher: typeof fetch,
  ) {}

  get dbPath() {
    return `projects/${this.env.FIREBASE_PROJECT_ID}/databases/(default)`;
  }
  private get base() {
    return `https://firestore.googleapis.com/v1/${this.dbPath}/documents`;
  }

  private async call(method: string, url: string, body?: unknown, okStatuses: number[] = []): Promise<Response> {
    const token = await getAccessToken(this.env, this.fetcher);
    const res = await this.fetcher(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok && !okStatuses.includes(res.status)) {
      const body = (await res.text()).replace(/\s+/g, ' ');
      console.error('Firestore error', res.status, body.slice(0, 300));
      throw new HttpError(502, 'DATABASE_ERROR', `Database request failed (Firestore ${res.status}: ${body.slice(0, 200)})`);
    }
    return res;
  }

  async getDoc(path: string) {
    const res = await this.call('GET', `${this.base}/${path}`, undefined, [404]);
    if (res.status === 404) return null;
    return docData((await res.json()) as RawDoc);
  }

  /** Replaces exactly the listed top-level fields (creates the doc if missing). */
  async setFields(path: string, data: Record<string, unknown>) {
    const mask = Object.keys(data)
      .filter((k) => data[k] !== undefined)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join('&');
    await this.call('PATCH', `${this.base}/${path}?${mask}`, { fields: toFields(data) });
  }

  async deleteDoc(path: string) {
    await this.call('DELETE', `${this.base}/${path}`, undefined, [404]);
  }

  /** Atomic increments (+ optional plain fields) in a single commit; creates the doc if needed. */
  async increment(path: string, incs: Record<string, number>, set: Record<string, unknown> = {}) {
    const name = `${this.dbPath}/documents/${path}`;
    await this.call('POST', `https://firestore.googleapis.com/v1/${this.dbPath}/documents:commit`, {
      writes: [
        {
          update: { name, fields: toFields(set) },
          updateMask: { fieldPaths: Object.keys(set) },
          updateTransforms: Object.entries(incs).map(([fieldPath, n]) => ({
            fieldPath,
            increment: { integerValue: String(Math.round(n)) },
          })),
        },
      ],
    });
  }

  async batchGet(paths: string[]) {
    if (!paths.length) return [];
    const res = await this.call('POST', `https://firestore.googleapis.com/v1/${this.dbPath}/documents:batchGet`, {
      documents: paths.map((p) => `${this.dbPath}/documents/${p}`),
    });
    const rows = (await res.json()) as Array<{ found?: RawDoc }>;
    return rows.filter((r) => r.found).map((r) => docData(r.found as RawDoc));
  }

  async list(collection: string, pageSize: number, pageToken?: string) {
    const q = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) q.set('pageToken', pageToken);
    const res = await this.call('GET', `${this.base}/${collection}?${q}`);
    const body = (await res.json()) as { documents?: RawDoc[]; nextPageToken?: string };
    return { docs: (body.documents ?? []).map(docData), nextPageToken: body.nextPageToken };
  }

  async count(collection: string, where?: { field: string; value: string }): Promise<number> {
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId: collection }] };
    if (where) {
      structuredQuery.where = {
        fieldFilter: { field: { fieldPath: where.field }, op: 'EQUAL', value: { stringValue: where.value } },
      };
    }
    const res = await this.call('POST', `${this.base}:runAggregationQuery`, {
      structuredAggregationQuery: { structuredQuery, aggregations: [{ count: {}, alias: 'c' }] },
    });
    const rows = (await res.json()) as Array<{ result?: { aggregateFields?: Record<string, FsValue> } }>;
    const v = rows[0]?.result?.aggregateFields?.c;
    return v ? Number(fromValue(v)) : 0;
  }
}

// ---------- Store implementation ----------

function toUser(d: Record<string, unknown> & { _id: string }): UserRecord {
  const m = (d.membership ?? {}) as Partial<Membership>;
  return {
    uid: d._id,
    email: String(d.email ?? ''),
    displayName: String(d.displayName ?? ''),
    createdAt: Number(d.createdAt ?? 0),
    lastSeenAt: Number(d.lastSeenAt ?? 0),
    disabled: d.disabled === true,
    membership: { ...FREE_MEMBERSHIP, ...m } as Membership,
  };
}

export class FirestoreStore implements Store {
  private fs: FirestoreClient;
  constructor(
    private env: Env,
    private fetcher: typeof fetch,
  ) {
    this.fs = new FirestoreClient(env, fetcher);
  }

  async getUser(uid: string) {
    const d = await this.fs.getDoc(`users/${uid}`);
    return d ? toUser(d) : null;
  }

  async ensureUser(p: { uid: string; email: string; displayName: string }) {
    const existing = await this.getUser(p.uid);
    const now = Date.now();
    if (existing) {
      const patch: Partial<UserRecord> = { lastSeenAt: now };
      if (p.email && p.email !== existing.email) patch.email = p.email;
      await this.updateUser(p.uid, patch);
      return { ...existing, ...patch };
    }
    const user: UserRecord = {
      uid: p.uid,
      email: p.email,
      displayName: p.displayName,
      createdAt: now,
      lastSeenAt: now,
      disabled: false,
      membership: FREE_MEMBERSHIP,
    };
    await this.fs.setFields(`users/${p.uid}`, {
      email: user.email,
      displayName: user.displayName,
      createdAt: now,
      lastSeenAt: now,
      disabled: false,
      membership: user.membership,
      preferences: {},
    });
    return user;
  }

  async updateUser(uid: string, patch: Partial<Pick<UserRecord, 'disabled' | 'lastSeenAt' | 'email' | 'displayName'>>) {
    await this.fs.setFields(`users/${uid}`, patch);
  }

  async setMembership(uid: string, m: Membership) {
    await this.fs.setFields(`users/${uid}`, { membership: m });
  }

  async listUsers(pageSize: number, pageToken?: string) {
    const { docs, nextPageToken } = await this.fs.list('users', pageSize, pageToken);
    return { users: docs.map(toUser), nextPageToken };
  }

  countUsers(tier?: TierId) {
    return this.fs.count('users', tier ? { field: 'membership.tier', value: tier } : undefined);
  }

  async getPatreonLink(pid: string) {
    const d = await this.fs.getDoc(`patreon_links/${pid}`);
    return d ? String(d.uid) : null;
  }
  setPatreonLink(pid: string, uid: string) {
    return this.fs.setFields(`patreon_links/${pid}`, { uid, linkedAt: Date.now() });
  }
  deletePatreonLink(pid: string) {
    return this.fs.deleteDoc(`patreon_links/${pid}`);
  }

  async getPatreonTokens(uid: string): Promise<PatreonTokens | null> {
    const d = await this.fs.getDoc(`private_tokens/${uid}`);
    if (!d || !d.refreshToken) return null;
    return { accessToken: String(d.accessToken), refreshToken: String(d.refreshToken), expiresAt: Number(d.expiresAt) };
  }
  savePatreonTokens(uid: string, t: PatreonTokens) {
    return this.fs.setFields(`private_tokens/${uid}`, { ...t });
  }
  deletePatreonTokens(uid: string) {
    return this.fs.deleteDoc(`private_tokens/${uid}`);
  }

  async recordUsage(e: { uid: string | null; day: string; inputTokens: number; outputTokens: number }) {
    const tokens = { inputTokens: e.inputTokens, outputTokens: e.outputTokens };
    const jobs: Promise<unknown>[] = [
      this.fs.increment('stats/global', {
        [e.uid ? 'userRequests' : 'guestRequests']: 1,
        ...tokens,
      }),
      this.fs.increment(`stats_daily/${e.day}`, { [e.uid ? 'userRequests' : 'guestRequests']: 1 }, { day: e.day }),
    ];
    if (e.uid) {
      jobs.push(this.fs.increment(`usage_daily/${e.uid}_${e.day}`, { requests: 1, ...tokens }, { uid: e.uid, day: e.day }));
    }
    await Promise.all(jobs);
  }

  async recordGuestSession(day: string) {
    await this.fs.increment('stats/global', { guestSessions: 1 });
    await this.fs.increment(`stats_daily/${day}`, { guestSessions: 1 }, { day });
  }

  async getUsageDays(uid: string, days: string[]): Promise<UsageDay[]> {
    const docs = await this.fs.batchGet(days.map((d) => `usage_daily/${uid}_${d}`));
    const byDay = new Map(docs.map((d) => [String(d.day), d]));
    return days.map((day) => {
      const d = byDay.get(day);
      return {
        day,
        requests: Number(d?.requests ?? 0),
        inputTokens: Number(d?.inputTokens ?? 0),
        outputTokens: Number(d?.outputTokens ?? 0),
      };
    });
  }

  async getGlobalStats(): Promise<GlobalStats> {
    const d = (await this.fs.getDoc('stats/global')) ?? {};
    const n = (k: string) => Number((d as Record<string, unknown>)[k] ?? 0);
    return {
      guestSessions: n('guestSessions'),
      guestRequests: n('guestRequests'),
      userRequests: n('userRequests'),
      inputTokens: n('inputTokens'),
      outputTokens: n('outputTokens'),
    };
  }

  async getDailyStats(days: string[]): Promise<DailyStat[]> {
    const docs = await this.fs.batchGet(days.map((d) => `stats_daily/${d}`));
    const byDay = new Map(docs.map((d) => [String(d.day), d]));
    return days.map((day) => ({
      day,
      guestRequests: Number(byDay.get(day)?.guestRequests ?? 0),
      userRequests: Number(byDay.get(day)?.userRequests ?? 0),
    }));
  }

  async ping() {
    try {
      await this.fs.getDoc('stats/global');
      return true;
    } catch {
      return false;
    }
  }

  /** Disable/enable the Firebase Auth account (blocks new sign-ins and token refresh). */
  async setAuthDisabled(uid: string, disabled: boolean) {
    const token = await getAccessToken(this.env, this.fetcher);
    const res = await this.fetcher(
      `https://identitytoolkit.googleapis.com/v1/projects/${this.env.FIREBASE_PROJECT_ID}/accounts:update`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: uid, disableUser: disabled }),
      },
    );
    if (!res.ok) throw new HttpError(502, 'AUTH_ADMIN_ERROR', 'Could not update the account');
  }
}
