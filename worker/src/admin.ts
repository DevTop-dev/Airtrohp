import type { Env, TierId } from './env';
import { getTiers } from './config';
import { FREE_MEMBERSHIP, type Membership, type Store } from './store';
import type { Counters } from './usage';
import { HttpError, lastDays, utcDay } from './utils';
import { patreonConfigured } from './patreon';
import { DEFAULT_MODEL, DEFAULT_MODEL_ADVANCED } from './gemini';

export async function adminStats(store: Store, now: number) {
  const [total, pro, ultimate, global, daily] = await Promise.all([
    store.countUsers(),
    store.countUsers('pro'),
    store.countUsers('ultimate'),
    store.getGlobalStats(),
    store.getDailyStats(lastDays(14, now)),
  ]);
  return {
    users: { total, free: Math.max(0, total - pro - ultimate), pro, ultimate },
    guests: { sessions: global.guestSessions, requests: global.guestRequests },
    requests: { total: global.guestRequests + global.userRequests, registered: global.userRequests, guest: global.guestRequests },
    tokens: { input: global.inputTokens, output: global.outputTokens },
    daily,
  };
}

export async function adminStatus(env: Env, store: Store) {
  const firestore = await store.ping();
  return {
    time: new Date().toISOString(),
    checks: {
      geminiKeyConfigured: !!env.GEMINI_API_KEY,
      firebaseServiceAccountConfigured: !!env.FIREBASE_SERVICE_ACCOUNT,
      appSecretConfigured: !!env.APP_SECRET && env.APP_SECRET.length >= 32,
      firestoreReachable: firestore,
      patreonOAuthConfigured: patreonConfigured(env),
      patreonWebhookConfigured: !!env.PATREON_WEBHOOK_SECRET,
      patreonCampaignConfigured: !!env.PATREON_CAMPAIGN_ID,
      adminConfigured: !!(env.ADMIN_UIDS || env.ADMIN_EMAILS),
    },
    models: { standard: env.GEMINI_MODEL ?? DEFAULT_MODEL, advanced: env.GEMINI_MODEL_PRO ?? DEFAULT_MODEL_ADVANCED },
  };
}

export async function adminListUsers(store: Store, pageToken?: string) {
  const { users, nextPageToken } = await store.listUsers(50, pageToken);
  return {
    nextPageToken,
    users: users.map((u) => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      disabled: u.disabled,
      tier: u.membership.tier,
      source: u.membership.source,
      status: u.membership.status,
    })),
  };
}

export async function adminUserAction(
  env: Env,
  store: Store,
  counters: Counters,
  uid: string,
  body: { action?: string; tier?: string },
  now: number,
) {
  const user = await store.getUser(uid);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  switch (body.action) {
    case 'set_tier': {
      const tiers = getTiers(env);
      const tier = body.tier as TierId;
      if (!tiers[tier]) throw new HttpError(400, 'BAD_REQUEST', 'Unknown tier');
      const m: Membership =
        tier === 'free'
          ? { ...FREE_MEMBERSHIP, patreonUserId: user.membership.patreonUserId }
          : { tier, status: 'manual', source: 'admin', patreonUserId: user.membership.patreonUserId, expiresAt: null, verifiedAt: now };
      await store.setMembership(uid, m);
      return { ok: true };
    }
    case 'disable':
    case 'enable': {
      const disabled = body.action === 'disable';
      await store.updateUser(uid, { disabled });
      await store.setAuthDisabled(uid, disabled).catch((e) => console.error('auth disable failed', e));
      return { ok: true };
    }
    case 'reset_usage':
      await counters.reset(`u:${uid}:${utcDay(now)}`);
      return { ok: true };
    default:
      throw new HttpError(400, 'BAD_REQUEST', 'Unknown action');
  }
}
