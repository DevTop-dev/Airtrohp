import type { Env } from './env';
import { HttpError, b64url, b64urlDecode, b64urlDecodeText, enc, hmacSha256, splitList, timingSafeEqual } from './utils';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export interface UserPrincipal {
  kind: 'user';
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
}
export interface GuestPrincipal {
  kind: 'guest';
  id: string;
}
export type Principal = UserPrincipal | GuestPrincipal;

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

let jwksCache: { keys: Jwk[]; expires: number } | null = null;

export function resetJwksCache() {
  jwksCache = null;
}

async function getJwks(fetcher: typeof fetch, now: number): Promise<Jwk[]> {
  if (jwksCache && jwksCache.expires > now) return jwksCache.keys;
  const res = await fetcher(JWKS_URL);
  if (!res.ok) throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Could not load Firebase public keys');
  const body = (await res.json()) as { keys: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  jwksCache = { keys: body.keys, expires: now + Math.min(maxAge, 21600) * 1000 };
  return body.keys;
}

/**
 * Verifies a Firebase ID token (RS256) against Google's public keys and checks
 * issuer, audience, expiry and subject. Does NOT check for revocation (see README).
 */
export async function verifyFirebaseIdToken(
  token: string,
  env: Env,
  fetcher: typeof fetch,
  now = Date.now(),
): Promise<UserPrincipal> {
  const bad = () => new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired sign-in token');
  const parts = token.split('.');
  if (parts.length !== 3) throw bad();
  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64urlDecodeText(parts[0]));
    payload = JSON.parse(b64urlDecodeText(parts[1]));
  } catch {
    throw bad();
  }
  if (header.alg !== 'RS256' || !header.kid) throw bad();

  let keys = await getJwks(fetcher, now);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    resetJwksCache(); // key rotation: refetch once
    keys = await getJwks(fetcher, now);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw bad();

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw bad();

  const nowSec = Math.floor(now / 1000);
  const exp = Number(payload.exp);
  const iat = Number(payload.iat);
  const authTime = Number(payload.auth_time ?? 0);
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!(exp > nowSec)) throw bad();
  if (!(iat <= nowSec + 60)) throw bad();
  if (authTime > nowSec + 60) throw bad();
  if (payload.aud !== projectId) throw bad();
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw bad();
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw bad();

  return {
    kind: 'user',
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : '',
  };
}

// ---------- guest tokens ----------

export async function issueGuestToken(env: Env): Promise<string> {
  const id = b64url(crypto.getRandomValues(new Uint8Array(18)));
  const sig = b64url(await hmacSha256(env.APP_SECRET, `guest:${id}`));
  return `g1.${id}.${sig}`;
}

export async function verifyGuestToken(token: string, env: Env): Promise<GuestPrincipal> {
  const parts = token.split('.');
  if (parts.length === 3 && parts[0] === 'g1' && /^[A-Za-z0-9_-]{20,40}$/.test(parts[1])) {
    const expected = b64url(await hmacSha256(env.APP_SECRET, `guest:${parts[1]}`));
    if (timingSafeEqual(expected, parts[2])) return { kind: 'guest', id: parts[1] };
  }
  throw new HttpError(401, 'INVALID_GUEST_TOKEN', 'Invalid guest session. Reload the page to start a new one.');
}

export async function authenticate(
  request: Request,
  env: Env,
  fetcher: typeof fetch,
  opts: { allowGuest: boolean },
): Promise<Principal> {
  const authz = request.headers.get('Authorization');
  if (authz?.startsWith('Bearer ')) return verifyFirebaseIdToken(authz.slice(7).trim(), env, fetcher);
  if (opts.allowGuest) {
    const g = request.headers.get('X-Guest-Token');
    if (g) return verifyGuestToken(g, env);
  }
  throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in required');
}

export async function requireUser(request: Request, env: Env, fetcher: typeof fetch): Promise<UserPrincipal> {
  return (await authenticate(request, env, fetcher, { allowGuest: false })) as UserPrincipal;
}

/** Admin rights come ONLY from Worker secrets, never from the database or the client. */
export function isAdmin(env: Env, p: UserPrincipal): boolean {
  if (splitList(env.ADMIN_UIDS).includes(p.uid)) return true;
  const emails = splitList(env.ADMIN_EMAILS).map((e) => e.toLowerCase());
  return !!p.email && p.emailVerified && emails.includes(p.email.toLowerCase());
}
