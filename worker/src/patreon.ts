import type { Env, TierId } from './env';
import { getTiers } from './config';
import { FREE_MEMBERSHIP, type Membership, type PatreonTokens, type Store } from './store';
import { HttpError, b64url, hmacMd5Hex, hmacSha256, timingSafeEqual } from './utils';

const AUTHORIZE_URL = 'https://www.patreon.com/oauth2/authorize';
const TOKEN_URL = 'https://www.patreon.com/api/oauth2/token';
const IDENTITY_URL =
  'https://www.patreon.com/api/oauth2/v2/identity' +
  '?include=memberships,memberships.currently_entitled_tiers,memberships.campaign' +
  '&fields%5Bmember%5D=patron_status,currently_entitled_amount_cents,next_charge_date,last_charge_status' +
  '&fields%5Buser%5D=full_name';

const STALE_AFTER_MS = 6 * 3600 * 1000;
const GRACE_MS = 3 * 86400 * 1000;

export function patreonConfigured(env: Env): boolean {
  return !!(env.PATREON_CLIENT_ID && env.PATREON_CLIENT_SECRET && env.PATREON_REDIRECT_URI);
}

// ---------- OAuth state (signed, short lived, bound to the Firebase uid) ----------

export async function signState(env: Env, uid: string, now: number): Promise<string> {
  const exp = now + 10 * 60 * 1000;
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ uid, exp })));
  const sig = b64url(await hmacSha256(env.APP_SECRET, `patreon-state:${payload}`));
  return `${payload}.${sig}`;
}

export async function verifyState(env: Env, state: string, now: number): Promise<string> {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) throw new HttpError(400, 'BAD_STATE', 'Invalid state');
  const expected = b64url(await hmacSha256(env.APP_SECRET, `patreon-state:${payload}`));
  if (!timingSafeEqual(expected, sig)) throw new HttpError(400, 'BAD_STATE', 'Invalid state');
  const { uid, exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { uid: string; exp: number };
  if (!uid || now > exp) throw new HttpError(400, 'BAD_STATE', 'This sign-in link expired. Please try again.');
  return uid;
}

export async function buildAuthorizeUrl(env: Env, uid: string, now: number): Promise<string> {
  if (!patreonConfigured(env)) throw new HttpError(503, 'PATREON_NOT_CONFIGURED', 'Patreon is not configured yet.');
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: env.PATREON_CLIENT_ID as string,
    redirect_uri: env.PATREON_REDIRECT_URI as string,
    scope: 'identity identity.memberships',
    state: await signState(env, uid, now),
  });
  return `${AUTHORIZE_URL}?${q}`;
}

// ---------- membership mapping ----------

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | Array<{ id: string; type: string }> | null }>;
}

function relIds(r: JsonApiResource, rel: string): string[] {
  const d = r.relationships?.[rel]?.data;
  if (!d) return [];
  return (Array.isArray(d) ? d : [d]).map((x) => x.id);
}

/** Pure mapping from a Patreon `member` resource to an Airtrohp membership. */
export function membershipFromMember(env: Env, member: JsonApiResource | null, patreonUserId: string, now: number): Membership {
  if (!member) return { ...FREE_MEMBERSHIP, source: 'patreon', status: 'former', patreonUserId, verifiedAt: now };
  const status = String(member.attributes?.patron_status ?? '');
  const cents = Number(member.attributes?.currently_entitled_amount_cents ?? 0);
  const tierIds = relIds(member, 'currently_entitled_tiers');
  const tiers = getTiers(env);

  let tier: TierId = 'free';
  if (status === 'active_patron') {
    const proId = env.PATREON_PRO_TIER_ID;
    const ultId = env.PATREON_ULTIMATE_TIER_ID;
    if (ultId && tierIds.includes(ultId) && tiers.ultimate.enabled) tier = 'ultimate';
    else if (proId && tierIds.includes(proId)) tier = 'pro';
    else if (!proId && !ultId) {
      // No tier IDs configured: fall back to the pledge amount.
      if (tiers.ultimate.enabled && cents >= Math.round(tiers.ultimate.priceUsd * 100)) tier = 'ultimate';
      else if (cents >= Math.round(tiers.pro.priceUsd * 100)) tier = 'pro';
    }
  }

  const next = member.attributes?.next_charge_date ? Date.parse(String(member.attributes.next_charge_date)) : NaN;
  return {
    tier,
    status: status === 'active_patron' ? 'active' : status === 'declined_patron' ? 'declined' : 'former',
    source: 'patreon',
    patreonUserId,
    expiresAt: tier !== 'free' && Number.isFinite(next) ? next + GRACE_MS : null,
    verifiedAt: now,
  };
}

function pickMember(env: Env, included: JsonApiResource[]): JsonApiResource | null {
  const members = included.filter((r) => r.type === 'member');
  const campaign = env.PATREON_CAMPAIGN_ID;
  if (campaign) return members.find((m) => relIds(m, 'campaign').includes(campaign)) ?? null;
  return members[0] ?? null;
}

// ---------- Patreon API calls ----------

async function tokenRequest(env: Env, fetcher: typeof fetch, params: Record<string, string>) {
  const res = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...params,
      client_id: env.PATREON_CLIENT_ID as string,
      client_secret: env.PATREON_CLIENT_SECRET as string,
    }),
  });
  return res;
}

async function parseTokens(res: Response, now: number): Promise<PatreonTokens> {
  const b = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: b.access_token, refreshToken: b.refresh_token, expiresAt: now + b.expires_in * 1000 };
}

async function fetchIdentity(fetcher: typeof fetch, accessToken: string) {
  const res = await fetcher(IDENTITY_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new HttpError(502, 'PATREON_ERROR', 'Could not read your Patreon membership.');
  const body = (await res.json()) as { data: JsonApiResource; included?: JsonApiResource[] };
  return body;
}

export class PatreonService {
  constructor(
    private env: Env,
    private store: Store,
    private fetcher: typeof fetch,
    private now: () => number,
  ) {}

  /** OAuth callback: exchange the code, verify membership with Patreon, link to the uid. */
  async completeOAuth(code: string, uid: string): Promise<Membership> {
    const now = this.now();
    const res = await tokenRequest(this.env, this.fetcher, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.env.PATREON_REDIRECT_URI as string,
    });
    if (!res.ok) throw new HttpError(400, 'PATREON_OAUTH_FAILED', 'Patreon rejected the authorization.');
    const tokens = await parseTokens(res, now);
    const identity = await fetchIdentity(this.fetcher, tokens.accessToken);
    const patreonUserId = identity.data.id;

    const linkedTo = await this.store.getPatreonLink(patreonUserId);
    if (linkedTo && linkedTo !== uid) {
      throw new HttpError(409, 'PATREON_ALREADY_LINKED', 'That Patreon account is already linked to another Airtrohp account.');
    }
    const user = await this.store.getUser(uid);
    if (user?.membership.patreonUserId && user.membership.patreonUserId !== patreonUserId) {
      await this.store.deletePatreonLink(user.membership.patreonUserId);
    }
    const membership = membershipFromMember(this.env, pickMember(this.env, identity.included ?? []), patreonUserId, now);
    await this.store.setPatreonLink(patreonUserId, uid);
    await this.store.savePatreonTokens(uid, tokens);
    await this.store.setMembership(uid, membership);
    return membership;
  }

  /** Re-verify a linked user with Patreon (uses the stored refresh token). */
  async sync(uid: string): Promise<Membership | null> {
    const user = await this.store.getUser(uid);
    if (!user || user.membership.source !== 'patreon') return user?.membership ?? null;
    let tokens = await this.store.getPatreonTokens(uid);
    if (!tokens) return user.membership;
    const now = this.now();

    if (tokens.expiresAt < now + 60_000) {
      const res = await tokenRequest(this.env, this.fetcher, { grant_type: 'refresh_token', refresh_token: tokens.refreshToken });
      if (res.status === 400 || res.status === 401) {
        // The user revoked access or the token is dead: we can no longer verify them, so remove paid access.
        const m: Membership = { ...FREE_MEMBERSHIP, source: 'patreon', status: 'former', patreonUserId: user.membership.patreonUserId, verifiedAt: now };
        await this.store.setMembership(uid, m);
        return m;
      }
      if (!res.ok) return user.membership; // transient failure: keep the last verified state
      tokens = await parseTokens(res, now);
      await this.store.savePatreonTokens(uid, tokens);
    }

    const identity = await fetchIdentity(this.fetcher, tokens.accessToken);
    const m = membershipFromMember(this.env, pickMember(this.env, identity.included ?? []), identity.data.id, now);
    await this.store.setMembership(uid, m);
    return m;
  }

  async syncIfStale(uid: string): Promise<void> {
    const user = await this.store.getUser(uid);
    if (!user || user.membership.source !== 'patreon') return;
    if (user.membership.verifiedAt && this.now() - user.membership.verifiedAt < STALE_AFTER_MS) return;
    try {
      await this.sync(uid);
    } catch (e) {
      console.error('patreon sync failed', e);
    }
  }

  async disconnect(uid: string): Promise<void> {
    const user = await this.store.getUser(uid);
    if (!user) return;
    if (user.membership.patreonUserId) await this.store.deletePatreonLink(user.membership.patreonUserId);
    await this.store.deletePatreonTokens(uid);
    // Only drop the plan if it came from Patreon (keep admin-assigned plans).
    if (user.membership.source === 'patreon') await this.store.setMembership(uid, FREE_MEMBERSHIP);
  }

  /** Webhook: verify the HMAC-MD5 signature over the raw body, then apply the event. */
  async handleWebhook(rawBody: string, signature: string | null, event: string | null): Promise<{ applied: boolean }> {
    const secret = this.env.PATREON_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, 'PATREON_NOT_CONFIGURED', 'Webhook secret is not configured');
    const expected = await hmacMd5Hex(secret, rawBody);
    if (!signature || !timingSafeEqual(expected, signature.toLowerCase())) {
      throw new HttpError(401, 'BAD_SIGNATURE', 'Invalid signature');
    }

    const payload = JSON.parse(rawBody) as { data: JsonApiResource; included?: JsonApiResource[] };
    const member = payload.data;
    if (member?.type !== 'member') return { applied: false };
    const patreonUserId = relIds(member, 'user')[0];
    if (!patreonUserId) return { applied: false };
    const uid = await this.store.getPatreonLink(patreonUserId);
    if (!uid) return { applied: false }; // not linked to an Airtrohp account yet; OAuth link will verify later

    const current = await this.store.getUser(uid);
    if (current?.membership.source === 'admin') return { applied: false }; // manual grants are not overwritten

    const now = this.now();
    const deleted = event === 'members:delete' || event === 'members:pledge:delete';
    const m = deleted ? membershipFromMember(this.env, null, patreonUserId, now) : membershipFromMember(this.env, member, patreonUserId, now);
    await this.store.setMembership(uid, m);
    return { applied: true };
  }
}
