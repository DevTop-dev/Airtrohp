import type { Ctx, Env } from './env';
import { adminListUsers, adminStats, adminStatus, adminUserAction } from './admin';
import { isAdmin, issueGuestToken, requireUser, verifyGuestToken } from './auth';
import { handleChat, ipHash, type ChatDeps } from './chat';
import { getTiers, guestLimit } from './config';
import { FirestoreStore } from './firestore';
import { PatreonService, buildAuthorizeUrl, patreonConfigured, verifyState } from './patreon';
import { entitlement, type Store } from './store';
import { Counters } from './usage';
import { HttpError, json, lastDays, nextUtcMidnight, splitList, utcDay } from './utils';

export { UsageCounter } from './usage';

export interface Deps {
  fetch: typeof fetch;
  store: Store;
  now: () => number;
}

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  if (!origin) return {};
  const allowed = splitList(env.ALLOWED_ORIGINS);
  if (!allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Guest-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (text.length > 20_000) throw new Error('too large');
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Invalid JSON body');
  }
}

export async function handleRequest(request: Request, env: Env, ctx: Ctx, partial: Partial<Deps> = {}): Promise<Response> {
  const fetcher: typeof fetch = partial.fetch ?? ((input, init) => fetch(input, init));
  const deps: Deps = {
    fetch: fetcher,
    now: partial.now ?? Date.now,
    store: partial.store ?? new FirestoreStore(env, fetcher),
  };
  const counters = new Counters(env.USAGE);
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(env, origin);

  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;
    const now = deps.now();
    const day = utcDay(now);
    const patreon = new PatreonService(env, deps.store, fetcher, deps.now);
    let res: Response;

    if (path === '/' || (path === '/api/health' && method === 'GET')) {
      res = json({ ok: true, service: 'airtrohp-api' });
    } else if (path === '/api/config' && method === 'GET') {
      const tiers = getTiers(env);
      res = json({
        guestLimit: guestLimit(env),
        patreonEnabled: patreonConfigured(env),
        patreonJoinUrl: env.PATREON_JOIN_URL ?? null,
        tiers: Object.values(tiers).map((t) => ({
          id: t.id,
          name: t.name,
          priceUsd: t.priceUsd,
          dailyMessages: t.dailyMessages,
          maxContextChars: t.maxContextChars,
          enabled: t.enabled,
          features: t.features,
        })),
      });
    } else if (path === '/api/guest/session' && method === 'POST') {
      res = await guestSession(request, env, counters, deps);
    } else if (path === '/api/chat' && method === 'POST') {
      const chatDeps: ChatDeps = { fetch: fetcher, store: deps.store, counters, now: deps.now };
      res = await handleChat(request, env, ctx, chatDeps);
    } else if (path === '/api/me' && method === 'GET') {
      const p = await requireUser(request, env, fetcher);
      const user = await deps.store.ensureUser({ uid: p.uid, email: p.email, displayName: p.name });
      if (user.membership.source === 'patreon') await patreon.syncIfStale(p.uid);
      const fresh = (await deps.store.getUser(p.uid)) ?? user;
      const tier = entitlement(env, fresh, now);
      const used = await counters.peek(`u:${p.uid}:${day}`);
      res = json({
        uid: p.uid,
        email: p.email,
        emailVerified: p.emailVerified,
        displayName: fresh.displayName,
        disabled: fresh.disabled,
        isAdmin: isAdmin(env, p),
        tier: tier.id,
        tierName: tier.name,
        membership: {
          status: fresh.membership.status,
          source: fresh.membership.source,
          expiresAt: fresh.membership.expiresAt,
          patreonLinked: !!fresh.membership.patreonUserId,
        },
        limits: { dailyMessages: tier.dailyMessages, maxContextChars: tier.maxContextChars },
        usage: { usedToday: used, remainingToday: Math.max(0, tier.dailyMessages - used), resetsAt: nextUtcMidnight() },
      });
    } else if (path === '/api/usage' && method === 'GET') {
      const p = await requireUser(request, env, fetcher);
      const days = await deps.store.getUsageDays(p.uid, lastDays(14, now));
      res = json({ days });
    } else if (path === '/api/patreon/connect' && method === 'POST') {
      const p = await requireUser(request, env, fetcher);
      if (!p.emailVerified) throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before connecting Patreon.');
      res = json({ url: await buildAuthorizeUrl(env, p.uid, now) });
    } else if (path === '/api/patreon/callback' && method === 'GET') {
      res = await patreonCallback(url, env, patreon, deps);
    } else if (path === '/api/patreon/sync' && method === 'POST') {
      const p = await requireUser(request, env, fetcher);
      const m = await patreon.sync(p.uid);
      res = json({ ok: true, tier: m?.tier ?? 'free', status: m?.status ?? 'none' });
    } else if (path === '/api/patreon/disconnect' && method === 'POST') {
      const p = await requireUser(request, env, fetcher);
      await patreon.disconnect(p.uid);
      res = json({ ok: true });
    } else if (path === '/api/patreon/webhook' && method === 'POST') {
      const raw = await request.text();
      const out = await patreon.handleWebhook(raw, request.headers.get('X-Patreon-Signature'), request.headers.get('X-Patreon-Event'));
      res = json({ ok: true, ...out });
    } else if (path.startsWith('/api/admin/')) {
      const p = await requireUser(request, env, fetcher);
      if (!isAdmin(env, p)) throw new HttpError(403, 'FORBIDDEN', 'Administrator access required');
      if (path === '/api/admin/stats' && method === 'GET') res = json(await adminStats(deps.store, now));
      else if (path === '/api/admin/status' && method === 'GET') res = json(await adminStatus(env, deps.store));
      else if (path === '/api/admin/users' && method === 'GET') {
        res = json(await adminListUsers(deps.store, url.searchParams.get('pageToken') ?? undefined));
      } else if (/^\/api\/admin\/users\/[A-Za-z0-9_-]{1,128}$/.test(path) && method === 'POST') {
        const uid = path.split('/').pop() as string;
        res = json(await adminUserAction(env, deps.store, counters, uid, await readJson(request), now));
      } else throw new HttpError(404, 'NOT_FOUND', 'Not found');
    } else {
      throw new HttpError(404, 'NOT_FOUND', 'Not found');
    }

    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (e) {
    const headers = { ...cors };
    if (e instanceof HttpError) {
      return json({ error: { code: e.code, message: e.message, ...(e.extra ?? {}) } }, e.status, headers);
    }
    console.error('Unhandled error', e);
    const detail = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 220);
    return json({ error: { code: 'INTERNAL_ERROR', message: `Something went wrong on our side. (${detail})` } }, 500, headers);
  }
}

async function guestSession(request: Request, env: Env, counters: Counters, deps: Deps): Promise<Response> {
  const limit = guestLimit(env);
  const existing = request.headers.get('X-Guest-Token');
  if (existing) {
    try {
      const g = await verifyGuestToken(existing, env);
      const used = await counters.peek(`guest:${g.id}`);
      return json({ token: existing, limit, remaining: Math.max(0, limit - used) });
    } catch {
      /* invalid token: fall through and mint a new one */
    }
  }
  // Limit how many fresh guest sessions one network can mint per hour.
  const ip = await ipHash(env, request);
  const hour = Math.floor(deps.now() / 3_600_000);
  const mint = await counters.consume(`gmint:${ip}:${hour}`, 30, 7200);
  if (!mint.allowed) throw new HttpError(429, 'RATE_LIMITED', 'Too many new sessions from this network. Try again later.');
  const token = await issueGuestToken(env);
  await deps.store.recordGuestSession(utcDay(deps.now())).catch(() => undefined);
  return json({ token, limit, remaining: limit });
}

async function patreonCallback(url: URL, env: Env, patreon: PatreonService, deps: Deps): Promise<Response> {
  const front = (env.FRONTEND_URL || '').replace(/\/$/, '');
  const back = (status: string, reason?: string) =>
    new Response(null, {
      status: 302,
      headers: { Location: `${front}/dashboard?patreon=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}` },
    });
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (url.searchParams.get('error') || !code || !state) return back('error', 'cancelled');
  try {
    const uid = await verifyState(env, state, deps.now());
    await patreon.completeOAuth(code, uid);
    return back('connected');
  } catch (e) {
    console.error('patreon callback failed', e);
    return back('error', e instanceof HttpError ? e.code : 'failed');
  }
}

export default {
  fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
};
