/* Worker integration tests. Run with: npm test  (uses tsx, no network, no real Firebase/Gemini/Patreon) */
import { createHash, createHmac } from 'node:crypto';
import { handleRequest } from '../src/index';
import { resetJwksCache } from '../src/auth';
import { UsageCounter } from '../src/usage';
import { hmacMd5Hex, b64url } from '../src/utils';
import { fromValue, toFields, toValue } from '../src/firestore';
import { FREE_MEMBERSHIP, type Membership, type Store, type UserRecord, type PatreonTokens } from '../src/store';
import type { Env } from '../src/env';

let passed = 0;
let failed = 0;
function check(name: string, cond: unknown, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}`, extra ?? '');
  }
}

// Cloudflare Workers supports crypto.subtle.digest('MD5'); Node's WebCrypto does not. Shim it for tests only.
const realDigest = crypto.subtle.digest.bind(crypto.subtle);
(crypto.subtle as any).digest = async (alg: any, data: any) => {
  if (alg === 'MD5') {
    const b = createHash('md5').update(new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength)).digest();
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  }
  return realDigest(alg, data);
};

// ---------- fakes ----------
class FakeStorage {
  data = new Map<string, unknown>();
  async get<T>(k: string) {
    return this.data.get(k) as T | undefined;
  }
  async put(k: string, v: unknown) {
    this.data.set(k, v);
  }
  async deleteAll() {
    this.data.clear();
  }
  async setAlarm() {}
}
const objects = new Map<string, UsageCounter>();
const USAGE = {
  idFromName: (n: string) => n,
  get: (id: unknown) => {
    const name = id as string;
    if (!objects.has(name)) objects.set(name, new UsageCounter({ storage: new FakeStorage() }));
    const obj = objects.get(name)!;
    return { fetch: (url: string, init?: RequestInit) => obj.fetch(new Request(url, init)) };
  },
};

class MemoryStore implements Store {
  users = new Map<string, UserRecord>();
  links = new Map<string, string>();
  tokens = new Map<string, PatreonTokens>();
  usage: Array<{ uid: string | null }> = [];
  guestSessions = 0;
  authDisabled = new Map<string, boolean>();
  async getUser(uid: string) {
    return this.users.get(uid) ?? null;
  }
  async ensureUser(p: { uid: string; email: string; displayName: string }) {
    let u = this.users.get(p.uid);
    if (!u) {
      u = { ...p, createdAt: 1, lastSeenAt: 1, disabled: false, membership: { ...FREE_MEMBERSHIP } };
      this.users.set(p.uid, u);
    }
    return u;
  }
  async updateUser(uid: string, patch: Partial<UserRecord>) {
    Object.assign(this.users.get(uid)!, patch);
  }
  async setMembership(uid: string, m: Membership) {
    this.users.get(uid)!.membership = m;
  }
  async listUsers() {
    return { users: [...this.users.values()] };
  }
  async countUsers(tier?: string) {
    return [...this.users.values()].filter((u) => !tier || u.membership.tier === tier).length;
  }
  async getPatreonLink(p: string) {
    return this.links.get(p) ?? null;
  }
  async setPatreonLink(p: string, uid: string) {
    this.links.set(p, uid);
  }
  async deletePatreonLink(p: string) {
    this.links.delete(p);
  }
  async getPatreonTokens(uid: string) {
    return this.tokens.get(uid) ?? null;
  }
  async savePatreonTokens(uid: string, t: PatreonTokens) {
    this.tokens.set(uid, t);
  }
  async deletePatreonTokens(uid: string) {
    this.tokens.delete(uid);
  }
  async recordUsage(e: { uid: string | null }) {
    this.usage.push(e);
  }
  async recordGuestSession() {
    this.guestSessions++;
  }
  async getUsageDays(_uid: string, days: string[]) {
    return days.map((day) => ({ day, requests: 0, inputTokens: 0, outputTokens: 0 }));
  }
  async getGlobalStats() {
    return { guestSessions: this.guestSessions, guestRequests: 0, userRequests: this.usage.length, inputTokens: 0, outputTokens: 0 };
  }
  async getDailyStats(days: string[]) {
    return days.map((day) => ({ day, guestRequests: 0, userRequests: 0 }));
  }
  async ping() {
    return true;
  }
  async setAuthDisabled(uid: string, d: boolean) {
    this.authDisabled.set(uid, d);
  }
}

// RSA key standing in for Google's Firebase signing key
const kp = (await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
)) as CryptoKeyPair;
const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'test-kid' };
const enc = new TextEncoder();

const PROJECT = 'airtrohp-test';
async function makeToken(over: Record<string, unknown> = {}, kid = 'test-kid') {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'user1',
    iat: now - 10,
    auth_time: now - 10,
    exp: now + 3600,
    email: 'u1@example.com',
    email_verified: true,
    name: 'User One',
    ...over,
  };
  const h = b64url(enc.encode(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
  const p = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, enc.encode(`${h}.${p}`))));
  return `${h}.${p}.${sig}`;
}

let geminiCalls = 0;
let geminiMode: 'ok' | 'fail' = 'ok';
const fakeFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('securetoken@system.gserviceaccount.com')) {
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=3600' } });
  }
  if (url.includes('generativelanguage.googleapis.com')) {
    geminiCalls++;
    // the API key must travel in a header, never in the URL
    if (url.includes('key=') || !(init?.headers as Record<string, string>)['x-goog-api-key']) return new Response('bad', { status: 400 });
    if (geminiMode === 'fail') return new Response('upstream boom', { status: 500 });
    const chunks = ['Hello ', 'from ', 'Airtrohp'].map((t, i, a) =>
      `data: ${JSON.stringify({
        candidates: [{ content: { parts: [{ text: t }] }, finishReason: i === a.length - 1 ? 'STOP' : undefined }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 },
      })}\n\n`,
    );
    return new Response(chunks.join(''), { headers: { 'Content-Type': 'text/event-stream' } });
  }
  return new Response('not mocked: ' + url, { status: 500 });
};

const baseEnv = (): Env => ({
  GEMINI_API_KEY: 'TEST_GEMINI_KEY_SHOULD_NEVER_LEAK',
  FIREBASE_SERVICE_ACCOUNT: '{}',
  APP_SECRET: 'x'.repeat(40),
  FIREBASE_PROJECT_ID: PROJECT,
  FRONTEND_URL: 'https://app.example.com',
  ALLOWED_ORIGINS: 'https://app.example.com',
  ADMIN_UIDS: 'adminuid',
  ADMIN_EMAILS: '',
  PATREON_CLIENT_ID: 'cid',
  PATREON_CLIENT_SECRET: 'csecret',
  PATREON_WEBHOOK_SECRET: 'whsecret',
  PATREON_CAMPAIGN_ID: 'camp1',
  PATREON_PRO_TIER_ID: 'tierPro',
  PATREON_REDIRECT_URI: 'https://api.example.com/api/patreon/callback',
  USAGE,
});

const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => undefined) };
const store = new MemoryStore();
let env = baseEnv();
const call = (path: string, init: RequestInit = {}, e: Env = env) =>
  handleRequest(new Request(`https://api.example.com${path}`, init), e, ctx, { fetch: fakeFetch, store });

async function chat(headers: Record<string, string>, text = 'hi', e: Env = env) {
  return call(
    '/api/chat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.example.com', ...headers },
      body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
    },
    e,
  );
}
async function readSse(res: Response) {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)));
}

// ---------- tests ----------
console.log('utils');
{
  const md5 = (d: Uint8Array) => Promise.resolve(createHash('md5').update(d).digest().buffer.slice(0) as ArrayBuffer);
  for (const [secret, body] of [['whsecret', '{"a":1}'], ['k'.repeat(100), 'x'], ['', '']]) {
    const mine = await hmacMd5Hex(secret, body, async (d) => {
      const b = createHash('md5').update(d).digest();
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;
    });
    check(`HMAC-MD5 matches node:crypto (key len ${secret.length})`, mine === createHmac('md5', secret).update(body).digest('hex'));
  }
  void md5;
  const rt = { a: 1, b: 'x', c: [1, 2.5, null], d: { e: true } };
  check('firestore value round trip', JSON.stringify(fromValue(toValue(rt))) === JSON.stringify(rt));
  check('firestore skips undefined', !('x' in toFields({ x: undefined, y: 1 })));
}

console.log('public endpoints & CORS');
{
  const r = await call('/api/config', { headers: { Origin: 'https://app.example.com' } });
  const j = await r.json();
  check('config returns tiers', j.tiers.length === 3 && j.guestLimit === 5);
  check('ultimate disabled by default', j.tiers.find((t: any) => t.id === 'ultimate').enabled === false);
  check('pro price is 9.99', j.tiers.find((t: any) => t.id === 'pro').priceUsd === 9.99);
  check('CORS allows configured origin', r.headers.get('Access-Control-Allow-Origin') === 'https://app.example.com');
  const r2 = await call('/api/config', { headers: { Origin: 'https://evil.example' } });
  check('CORS omitted for other origins', r2.headers.get('Access-Control-Allow-Origin') === null);
  const pre = await call('/api/chat', { method: 'OPTIONS', headers: { Origin: 'https://app.example.com' } });
  check('preflight 204', pre.status === 204);
  check('404 for unknown route', (await call('/nope')).status === 404);
}

console.log('guest limit (server side)');
let guestToken = '';
{
  const s = await call('/api/guest/session', { method: 'POST' });
  const sj = await s.json();
  guestToken = sj.token;
  check('guest session issued with 5 remaining', sj.remaining === 5 && guestToken.startsWith('g1.'));
  const again = await (await call('/api/guest/session', { method: 'POST', headers: { 'X-Guest-Token': guestToken } })).json();
  check('re-fetching session returns same token (refresh does not reset)', again.token === guestToken && again.remaining === 5);

  const noAuth = await chat({});
  check('chat without any identity is 401', noAuth.status === 401);
  const forged = await chat({ 'X-Guest-Token': guestToken.slice(0, -2) + 'AA' });
  check('forged guest token rejected', forged.status === 401);

  const remainingSeen: number[] = [];
  let leaked = false;
  for (let i = 1; i <= 5; i++) {
    const r = await chat({ 'X-Guest-Token': guestToken }, `msg ${i}`);
    const text = await r.clone().text();
    if (text.includes('TEST_GEMINI_KEY')) leaked = true;
    const ev = await readSse(r);
    check(`guest message ${i} succeeds`, r.status === 200 && ev.some((e) => e.type === 'done'));
    remainingSeen.push(ev.find((e) => e.type === 'meta').remaining);
    if (i === 1) check('streamed text assembled', ev.filter((e) => e.type === 'delta').map((e) => e.text).join('') === 'Hello from Airtrohp');
  }
  check('remaining counts 4,3,2,1,0', JSON.stringify(remainingSeen) === '[4,3,2,1,0]', remainingSeen);
  check('Gemini key never appears in responses', !leaked);
  const sixth = await chat({ 'X-Guest-Token': guestToken }, 'msg 6');
  const sj6 = await sixth.json();
  check('6th guest message blocked with GUEST_LIMIT_REACHED', sixth.status === 403 && sj6.error.code === 'GUEST_LIMIT_REACHED', sj6);
  check('Gemini not called for blocked message', geminiCalls === 5, geminiCalls);
  const status = await (await call('/api/guest/session', { method: 'POST', headers: { 'X-Guest-Token': guestToken } })).json();
  check('status after limit shows 0 remaining', status.remaining === 0);
}

console.log('guest IP cap (clearing storage)');
{
  const e2 = { ...baseEnv(), GUEST_IP_DAILY_LIMIT: '7' };
  let blockedAt = 0;
  let okCount = 0;
  for (let s = 0; s < 3 && !blockedAt; s++) {
    const t = (await (await call('/api/guest/session', { method: 'POST', headers: { 'CF-Connecting-IP': '9.9.9.9' } }, e2)).json()).token;
    for (let i = 0; i < 5; i++) {
      const r = await chat({ 'X-Guest-Token': t, 'CF-Connecting-IP': '9.9.9.9' }, 'x', e2);
      if (r.status === 200) {
        okCount++;
        await r.text();
      } else {
        blockedAt = okCount;
        break;
      }
    }
  }
  check('fresh guest tokens from the same IP stop at the IP cap', blockedAt === 7, { blockedAt });
}

console.log('firebase auth + usage');
{
  resetJwksCache();
  const good = await makeToken();
  check('no token -> /api/me 401', (await call('/api/me')).status === 401);
  check('tampered token rejected', (await call('/api/me', { headers: { Authorization: `Bearer ${good.slice(0, -4)}AAAA` } })).status === 401);
  check('expired token rejected', (await call('/api/me', { headers: { Authorization: `Bearer ${await makeToken({ exp: Math.floor(Date.now() / 1000) - 5 })}` } })).status === 401);
  check('wrong audience rejected', (await call('/api/me', { headers: { Authorization: `Bearer ${await makeToken({ aud: 'other' })}` } })).status === 401);
  check('wrong issuer rejected', (await call('/api/me', { headers: { Authorization: `Bearer ${await makeToken({ iss: 'https://evil' })}` } })).status === 401);
  check('unknown kid rejected', (await call('/api/me', { headers: { Authorization: `Bearer ${await makeToken({}, 'nope')}` } })).status === 401);

  const me = await (await call('/api/me', { headers: { Authorization: `Bearer ${good}` } })).json();
  check('/api/me works for valid token (free, 50/day)', me.tier === 'free' && me.limits.dailyMessages === 50 && me.isAdmin === false, me);

  const unverified = await makeToken({ sub: 'user2', email_verified: false });
  const ur = await chat({ Authorization: `Bearer ${unverified}` });
  check('unverified email blocked from chat', ur.status === 403 && (await ur.json()).error.code === 'EMAIL_NOT_VERIFIED');

  const r = await chat({ Authorization: `Bearer ${good}` });
  const ev = await readSse(r);
  check('authenticated chat streams', r.status === 200 && ev.some((e) => e.type === 'done'));
  check('usage recorded in store', store.usage.length >= 1 && store.usage.at(-1)!.uid === 'user1');

  const small = { ...baseEnv(), TIER_CONFIG: JSON.stringify({ free: { dailyMessages: 2 } }) };
  const t3 = await makeToken({ sub: 'user3' });
  const a = await chat({ Authorization: `Bearer ${t3}` }, 'a', small);
  await a.text();
  const b = await chat({ Authorization: `Bearer ${t3}` }, 'b', small);
  await b.text();
  const c = await chat({ Authorization: `Bearer ${t3}` }, 'c', small);
  const cj = await c.json();
  check('daily limit enforced for free users', c.status === 429 && cj.error.code === 'USAGE_LIMIT', cj);

  geminiMode = 'fail';
  const t4 = await makeToken({ sub: 'user4' });
  const f = await chat({ Authorization: `Bearer ${t4}` });
  check('Gemini failure returns 502 without leaking details', f.status === 502 && !(await f.text()).includes('boom'));
  geminiMode = 'ok';
  const me4 = await (await call('/api/me', { headers: { Authorization: `Bearer ${t4}` } })).json();
  check('failed upstream call refunds the quota', me4.usage.usedToday === 0, me4.usage);

  const big = await call('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t4}` },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(150_000) }] }),
  });
  check('oversized context rejected for free tier', big.status === 413);
  const bad = await call('/api/chat', { method: 'POST', headers: { Authorization: `Bearer ${t4}` }, body: '{nope' });
  check('invalid JSON rejected', bad.status === 400);
  const badRole = await call('/api/chat', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t4}` },
    body: JSON.stringify({ messages: [{ role: 'system', content: 'x' }] }),
  });
  check('invalid role rejected', badRole.status === 400);
}

console.log('rate limiting');
{
  const e2 = { ...baseEnv(), RATE_LIMIT_PER_MINUTE: '3' };
  const t = await makeToken({ sub: 'rluser' });
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await chat({ Authorization: `Bearer ${t}` }, 'x', e2);
    codes.push(r.status);
    await r.text();
  }
  check('burst limit returns 429 after 3/min', JSON.stringify(codes) === '[200,200,200,429,429]', codes);
}

console.log('admin');
{
  const user = await makeToken({ sub: 'user1' });
  const admin = await makeToken({ sub: 'adminuid', email: 'a@example.com' });
  check('non-admin gets 403', (await call('/api/admin/stats', { headers: { Authorization: `Bearer ${user}` } })).status === 403);
  check('no token gets 401', (await call('/api/admin/stats')).status === 401);
  const st = await call('/api/admin/stats', { headers: { Authorization: `Bearer ${admin}` } });
  const sj = await st.json();
  check('admin gets stats', st.status === 200 && typeof sj.users.total === 'number', sj);
  const ss = await (await call('/api/admin/status', { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('admin status reports config booleans only', ss.checks.geminiKeyConfigured === true && !JSON.stringify(ss).includes('TEST_GEMINI'));
  const emailAdminEnv = { ...baseEnv(), ADMIN_UIDS: '', ADMIN_EMAILS: 'boss@example.com' };
  const spoof = await makeToken({ sub: 'z', email: 'boss@example.com', email_verified: false });
  check('admin by email requires verified email', (await call('/api/admin/stats', { headers: { Authorization: `Bearer ${spoof}` } }, emailAdminEnv)).status === 403);
  const real = await makeToken({ sub: 'z', email: 'boss@example.com', email_verified: true });
  check('admin by verified email allowed', (await call('/api/admin/stats', { headers: { Authorization: `Bearer ${real}` } }, emailAdminEnv)).status === 200);

  const set = await call('/api/admin/users/user1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set_tier', tier: 'pro' }),
  });
  check('admin can grant pro', set.status === 200 && store.users.get('user1')!.membership.tier === 'pro');
  const me = await (await call('/api/me', { headers: { Authorization: `Bearer ${user}` } })).json();
  check('user now has pro limits', me.tier === 'pro' && me.limits.dailyMessages === 300);
  await call('/api/admin/users/user1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'disable' }),
  });
  const dr = await chat({ Authorization: `Bearer ${user}` });
  check('disabled account cannot chat', dr.status === 403 && (await dr.json()).error.code === 'ACCOUNT_DISABLED' && store.authDisabled.get('user1') === true);
}

console.log('patreon webhook + membership');
{
  store.users.set('pu', { uid: 'pu', email: 'p@example.com', displayName: 'P', createdAt: 1, lastSeenAt: 1, disabled: false, membership: { ...FREE_MEMBERSHIP } });
  store.links.set('pat123', 'pu');
  const member = (status: string, tiers: string[]) => ({
    data: {
      id: 'm1',
      type: 'member',
      attributes: { patron_status: status, currently_entitled_amount_cents: 999, next_charge_date: new Date(Date.now() + 20 * 86400000).toISOString() },
      relationships: { user: { data: { id: 'pat123', type: 'user' } }, currently_entitled_tiers: { data: tiers.map((id) => ({ id, type: 'tier' })) } },
    },
  });
  const send = async (payload: unknown, event: string, secret = 'whsecret', sig?: string) => {
    const body = JSON.stringify(payload);
    const signature = sig ?? createHmac('md5', secret).update(body).digest('hex');
    return call('/api/patreon/webhook', { method: 'POST', headers: { 'X-Patreon-Signature': signature, 'X-Patreon-Event': event }, body });
  };
  check('webhook with bad signature -> 401', (await send(member('active_patron', ['tierPro']), 'members:pledge:create', 'wrong')).status === 401);
  check('webhook with missing signature -> 401', (await call('/api/patreon/webhook', { method: 'POST', body: '{}' })).status === 401);
  check('webhook activation -> 200', (await send(member('active_patron', ['tierPro']), 'members:pledge:create')).status === 200);
  check('Pro activated', store.users.get('pu')!.membership.tier === 'pro' && store.users.get('pu')!.membership.status === 'active');
  check('wrong tier id does not grant pro', (await send(member('active_patron', ['someOtherTier']), 'members:pledge:update')).status === 200 && store.users.get('pu')!.membership.tier === 'free');
  await send(member('active_patron', ['tierPro']), 'members:pledge:update');
  await send(member('declined_patron', ['tierPro']), 'members:pledge:update');
  check('declined payment removes Pro', store.users.get('pu')!.membership.tier === 'free' && store.users.get('pu')!.membership.status === 'declined');
  await send(member('active_patron', ['tierPro']), 'members:pledge:update');
  await send(member('former_patron', []), 'members:pledge:delete');
  check('cancellation removes Pro', store.users.get('pu')!.membership.tier === 'free' && store.users.get('pu')!.membership.status === 'former');
  const unlinked = { ...member('active_patron', ['tierPro']), data: { ...member('active_patron', ['tierPro']).data, relationships: { user: { data: { id: 'nobody', type: 'user' } } } } };
  const ur = await send(unlinked, 'members:pledge:create');
  check('webhook for unlinked patron is acknowledged but changes nothing', ur.status === 200 && (await ur.json()).applied === false);

  // expiry backstop
  store.users.get('pu')!.membership = { tier: 'pro', status: 'active', source: 'patreon', patreonUserId: 'pat123', expiresAt: Date.now() - 1000, verifiedAt: Date.now() };
  const tok = await makeToken({ sub: 'pu', email: 'p@example.com' });
  const me = await (await call('/api/me', { headers: { Authorization: `Bearer ${tok}` } })).json();
  check('expired membership falls back to free limits', me.tier === 'free', me.tier);

  // OAuth connect URL
  const c = await call('/api/patreon/connect', { method: 'POST', headers: { Authorization: `Bearer ${tok}` } });
  const cj = await c.json();
  check('connect returns Patreon authorize URL with signed state', c.status === 200 && cj.url.startsWith('https://www.patreon.com/oauth2/authorize?') && cj.url.includes('state='), cj);
  const cb = await call('/api/patreon/callback?code=abc&state=forged.state');
  check('callback with forged state redirects to error', cb.status === 302 && cb.headers.get('Location')!.includes('patreon=error'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
