import type { Ctx, Env } from './env';
import { authenticate, type Principal } from './auth';
import { GUEST_MAX_CONTEXT_CHARS, getTiers, guestIpDailyLimit, guestLimit, rateLimitPerMinute, type TierConfig } from './config';
import {
  buildGeminiBody,
  callGeminiResilient,
  DEFAULT_MODEL_FALLBACK,
  chatInputSize,
  modelFor,
  parseGeminiEvent,
  type ChatFile,
  type ChatInput,
  type ChatMessageIn,
} from './gemini';
import { callFallbackProviders, engineFor, listProviders } from './providers';
import { entitlement, type Store } from './store';
import type { Counters } from './usage';
import { HttpError, nextUtcMidnight, enc, sha256Hex, utcDay } from './utils';

export interface ChatDeps {
  fetch: typeof fetch;
  store: Store;
  counters: Counters;
  now: () => number;
}

const MAX_BODY_BYTES = 2_000_000;
const MAX_MESSAGES = 80;
const MAX_FILES_PER_MESSAGE = 40;
const MAX_CONTEXT_FILES = 400;

function str(v: unknown, max: number, field: string): string {
  if (typeof v !== 'string') throw new HttpError(400, 'BAD_REQUEST', `Invalid ${field}`);
  if (v.length > max) throw new HttpError(413, 'MESSAGE_TOO_LARGE', `${field} is too large`);
  return v;
}

function parseFiles(v: unknown, limit: number): ChatFile[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > limit) throw new HttpError(400, 'BAD_REQUEST', 'Invalid files');
  return v.map((f) => {
    const o = f as Record<string, unknown>;
    return { name: str(o?.name, 300, 'file name'), content: str(o?.content, 900_000, 'file content') };
  });
}

export function validateChatBody(raw: unknown): ChatInput {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'BAD_REQUEST', 'Invalid request');
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) {
    throw new HttpError(400, 'BAD_REQUEST', 'Invalid messages');
  }
  const messages: ChatMessageIn[] = b.messages.map((m) => {
    const o = m as Record<string, unknown>;
    if (o?.role !== 'user' && o?.role !== 'model') throw new HttpError(400, 'BAD_REQUEST', 'Invalid role');
    return {
      role: o.role,
      content: str(o.content, 900_000, 'message'),
      files: parseFiles(o.files, MAX_FILES_PER_MESSAGE),
    };
  });
  const last = messages[messages.length - 1];
  if (last.role !== 'user' || !(last.content.trim() || last.files?.length)) {
    throw new HttpError(400, 'BAD_REQUEST', 'The last message must be a non-empty user message');
  }
  const provider = typeof b.provider === 'string' && /^[a-z0-9-]{1,30}$/.test(b.provider) ? b.provider : undefined;
  return { messages, context: parseFiles(b.context, MAX_CONTEXT_FILES), provider };
}

function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') ?? req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function ipHash(env: Env, req: Request): Promise<string> {
  return (await sha256Hex(`${env.APP_SECRET}|${clientIp(req)}`)).slice(0, 32);
}

function principalKey(p: Principal): string {
  return p.kind === 'user' ? `u-${p.uid}` : `g-${p.id}`;
}

export async function handleChat(request: Request, env: Env, ctx: Ctx, deps: ChatDeps): Promise<Response> {
  const { store, counters } = deps;
  const now = deps.now();
  const day = utcDay(now);

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    throw new HttpError(413, 'REQUEST_TOO_LARGE', 'Request is too large');
  }
  const rawText = await request.text();
  if (rawText.length > MAX_BODY_BYTES) throw new HttpError(413, 'REQUEST_TOO_LARGE', 'Request is too large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Invalid JSON');
  }
  const input = validateChatBody(parsed);

  // 1. Who is calling? (Firebase ID token verified server-side, or signed guest token)
  const principal = await authenticate(request, env, deps.fetch, { allowGuest: true });

  // 2. Burst rate limit per principal
  const minute = Math.floor(now / 60000);
  const rl = await counters.consume(`rl:${principalKey(principal)}:${minute}`, rateLimitPerMinute(env), 120);
  if (!rl.allowed) throw new HttpError(429, 'RATE_LIMITED', 'You are sending messages too quickly. Wait a moment and try again.');

  // 3. Resolve limits (no quota consumed yet)
  let tier: TierConfig;
  let maxChars: number;
  let quotaKey: string;
  let quotaLimit: number;
  let quotaTtl: number;
  let uid: string | null = null;

  if (principal.kind === 'guest') {
    tier = getTiers(env).free;
    maxChars = GUEST_MAX_CONTEXT_CHARS;
    quotaKey = `guest:${principal.id}`;
    quotaLimit = guestLimit(env);
    quotaTtl = 0;
  } else {
    if (!principal.emailVerified) {
      throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email address to use Airtrohp.');
    }
    const user = await store.ensureUser({ uid: principal.uid, email: principal.email, displayName: principal.name });
    if (user.disabled) throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled.');
    tier = entitlement(env, user, now);
    maxChars = tier.maxContextChars;
    quotaKey = `u:${principal.uid}:${day}`;
    quotaLimit = tier.dailyMessages;
    quotaTtl = 172800;
    uid = principal.uid;
  }

  if (chatInputSize(input) > maxChars) {
    throw new HttpError(413, 'CONTEXT_TOO_LARGE', `This conversation plus attachments is larger than your plan allows (${maxChars.toLocaleString('en-US')} characters).`, {
      maxChars,
    });
  }

  // 4. Atomically consume quota BEFORE calling the model
  const q = await counters.consume(quotaKey, quotaLimit, quotaTtl);
  if (!q.allowed) {
    if (principal.kind === 'guest') {
      throw new HttpError(403, 'GUEST_LIMIT_REACHED', 'You have used all of your free guest messages. Create a free account to keep going.', {
        limit: quotaLimit,
        remaining: 0,
      });
    }
    throw new HttpError(429, 'USAGE_LIMIT', `You have reached today's limit for the ${tier.name} plan.`, {
      limit: quotaLimit,
      remaining: 0,
      tier: tier.id,
      resetsAt: nextUtcMidnight(),
    });
  }
  let remaining = quotaLimit - q.count;
  const refundKeys = [quotaKey];

  if (principal.kind === 'guest') {
    // Secondary, IP-based cap so clearing local storage does not hand out unlimited fresh guests.
    const ip = await ipHash(env, request);
    const ipKey = `gip:${ip}:${day}`;
    const ipRes = await counters.consume(ipKey, guestIpDailyLimit(env), 172800);
    if (!ipRes.allowed) {
      await counters.refund(quotaKey);
      throw new HttpError(403, 'GUEST_LIMIT_REACHED', 'Too many free guest messages from this network today. Create a free account to continue.', {
        limit: quotaLimit,
        remaining: 0,
      });
    }
    refundKeys.push(ipKey);
  }

  const refund = () => Promise.all(refundKeys.map((k) => counters.refund(k).catch(() => undefined)));

  // 5. Call Gemini, then the free fallback providers if Gemini is overloaded or unreachable
  const controller = new AbortController();
  const geminiBody = buildGeminiBody(input);
  let upstream: Response | undefined;
  let geminiError: unknown;
  let answeredBy = 'gemini';
  // If the user picked a specific non-Gemini AI that is available, try it first.
  const wanted = engineFor(input.provider);
  const userPick = wanted && wanted !== 'gemini' && listProviders(env).some((p) => p.id === input.provider) ? wanted : undefined;
  // "Auto" (or Smart): when very fast providers are configured, try them first for the quickest first token.
  const wantsGemini = wanted === 'gemini';
  const fastFirst = !wantsGemini && !userPick ? ['groq', 'cerebras'] : undefined;
  const picked: string | string[] | undefined = userPick ?? fastFirst;
  if (picked) {
    const first = await callFallbackProviders(env, deps.fetch, geminiBody, controller.signal, picked).catch(() => null);
    if (first) {
      upstream = first.response;
      answeredBy = first.provider;
    }
  }
  if (!upstream) {
    try {
      upstream = await callGeminiResilient(
        env,
        deps.fetch,
        [modelFor(env, tier), env.GEMINI_MODEL_FALLBACK ?? DEFAULT_MODEL_FALLBACK, 'gemini-3.6-flash'],
        geminiBody,
        controller.signal,
      );
    } catch (e) {
      geminiError = e;
      console.error('Gemini fetch failed', e);
    }
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    const fb = await callFallbackProviders(env, deps.fetch, geminiBody, controller.signal).catch(() => null);
    if (fb) {
      console.log('answered by fallback provider', fb.provider);
      upstream = fb.response;
      answeredBy = fb.provider;
    }
  }
  console.log('chat answered by', answeredBy);
  if (!upstream) {
    await refund();
    const why = (geminiError instanceof Error ? `${geminiError.name}: ${geminiError.message}` : String(geminiError)).replace(/\s+/g, ' ').slice(0, 160);
    throw new HttpError(502, 'AI_UPSTREAM_ERROR', `The AI service could not be reached. Please try again. (${why})`);
  }
  if (!upstream.ok || !upstream.body) {
    await refund();
    const detail = (await upstream.text().catch(() => '')).slice(0, 300);
    console.error('Gemini error', upstream.status, detail);
    const status = upstream.status === 429 ? 503 : 502;
    // Google's error enum (e.g. PERMISSION_DENIED, NOT_FOUND) is not secret and makes setup problems diagnosable.
    let reason = '';
    try {
      const g = (JSON.parse(detail) as { error?: { status?: unknown } }).error?.status;
      if (typeof g === 'string' && /^[A-Z_]{3,40}$/.test(g)) reason = `, ${g}`;
    } catch {
      /* detail was truncated or not JSON */
    }
    throw new HttpError(
      status,
      'AI_UPSTREAM_ERROR',
      `The AI service is busy or unavailable. Please try again shortly. (upstream ${upstream.status}${reason})`,
    );
  }

  // 6. Re-stream as our own SSE protocol
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controllerOut) {
      const send = (o: unknown) => controllerOut.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      let buf = '';
      let produced = 0;
      let promptTokens = 0;
      let outputTokens = 0;
      let finish: string | undefined;
      let blocked: string | undefined;
      try {
        send({ type: 'meta', remaining, limit: quotaLimit, tier: principal.kind === 'guest' ? 'guest' : tier.id });
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).replace(/\r$/, '');
            buf = buf.slice(idx + 1);
            if (!line.startsWith('data:')) continue;
            const chunk = parseGeminiEvent(line.slice(5).trim());
            if (!chunk) continue;
            if (chunk.promptTokens) promptTokens = chunk.promptTokens;
            if (chunk.outputTokens) outputTokens = chunk.outputTokens;
            if (chunk.finishReason) finish = chunk.finishReason;
            if (chunk.blockReason) blocked = chunk.blockReason;
            if (chunk.text) {
              produced += chunk.text.length;
              send({ type: 'delta', text: chunk.text });
            }
          }
        }
        if (produced === 0) {
          await refund();
          remaining += 1;
          send({
            type: 'error',
            code: blocked || finish === 'SAFETY' ? 'SAFETY_BLOCK' : 'EMPTY_RESPONSE',
            message:
              blocked || finish === 'SAFETY'
                ? 'This request was blocked by the AI safety filters. Try rephrasing it.'
                : 'The AI returned an empty response. Please try again.',
            remaining,
          });
        } else {
          send({ type: 'done', finishReason: finish ?? 'STOP', usage: { promptTokens, outputTokens }, remaining });
          ctx.waitUntil(
            store.recordUsage({ uid, day, inputTokens: promptTokens, outputTokens }).catch((e) => console.error('recordUsage failed', e)),
          );
        }
      } catch (e) {
        if (!cancelled) {
          console.error('stream error', e);
          if (produced === 0) {
            await refund();
            remaining += 1;
          }
          send({ type: 'error', code: 'STREAM_ERROR', message: 'The response was interrupted. Please try again.', remaining });
        }
      } finally {
        try {
          controllerOut.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      cancelled = true;
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
