import type { Env } from './env';

/**
 * Free fallback AI providers. They are tried in order only when Gemini is overloaded or unavailable.
 * Every provider is optional: one without a key (or binding) is skipped. Cloudflare Workers AI needs no key at all.
 * Each provider's answer is converted into Gemini-style SSE events, so the rest of the chat pipeline is unchanged.
 */

interface GeminiBodyLike {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
}

interface OpenAiProvider {
  name: string;
  url: string;
  key: string | undefined;
  model: string;
  extraHeaders?: Record<string, string>;
}

const FIRST_BYTE_TIMEOUT_MS = 6_000;
const enc = new TextEncoder();

export const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

function toMessages(body: GeminiBodyLike): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  const system = body.systemInstruction?.parts.map((p) => p.text).join('\n');
  if (system) out.push({ role: 'system', content: system });
  for (const c of body.contents) {
    out.push({ role: c.role === 'model' ? 'assistant' : 'user', content: c.parts.map((p) => p.text).join('\n\n') });
  }
  return out;
}

function openAiProviders(env: Env): OpenAiProvider[] {
  return [
    { name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: env.GROQ_API_KEY, model: env.GROQ_MODEL ?? 'llama-3.3-70b-versatile' },
    { name: 'cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', key: env.CEREBRAS_API_KEY, model: env.CEREBRAS_MODEL ?? 'llama-3.3-70b' },
    {
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL ?? 'openrouter/free',
      extraHeaders: { 'HTTP-Referer': env.FRONTEND_URL, 'X-Title': 'Airtrohp' },
    },
    { name: 'mistral', url: 'https://api.mistral.ai/v1/chat/completions', key: env.MISTRAL_API_KEY, model: env.MISTRAL_MODEL ?? 'mistral-small-latest' },
  ];
}

/** Returns the Gemini-style SSE event string for a piece of text / the end of the answer. */
function geminiEvent(text: string, finishReason?: string, usage?: { prompt?: number; output?: number }): string {
  const o: Record<string, unknown> = { candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] };
  if (usage && (usage.prompt || usage.output)) o.usageMetadata = { promptTokenCount: usage.prompt ?? 0, candidatesTokenCount: usage.output ?? 0 };
  return `data: ${JSON.stringify(o)}\n\n`;
}

/** Converts an OpenAI-style (or Workers AI) SSE body into a Gemini-style SSE body. */
function convertStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let finish: string | undefined;
  let usage: { prompt?: number; output?: number } | undefined;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(enc.encode(geminiEvent('', finish ?? 'STOP', usage)));
          controller.close();
          return;
        }
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        let emitted = false;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '');
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let j: any;
          try {
            j = JSON.parse(data);
          } catch {
            continue;
          }
          const text: string = j.choices?.[0]?.delta?.content ?? j.response ?? '';
          const fr: string | undefined = j.choices?.[0]?.finish_reason ?? undefined;
          if (fr) finish = fr === 'length' ? 'MAX_TOKENS' : 'STOP';
          const u = j.usage;
          if (u) usage = { prompt: u.prompt_tokens ?? u.input_tokens, output: u.completion_tokens ?? u.output_tokens };
          if (text) {
            controller.enqueue(enc.encode(geminiEvent(text)));
            emitted = true;
          }
        }
        if (emitted) return;
      }
    },
    cancel() {
      void reader.cancel().catch(() => undefined);
    },
  });
}

function sseResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(convertStream(body), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function withDeadline<T>(ms: number, outer: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  outer?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await run(ac.signal);
  } finally {
    clearTimeout(timer);
  }
}

export interface ProviderInfo {
  id: string; // public alias, e.g. "turbo"
  name: string; // Airtrohp-branded display name
  model: string; // short description shown in the picker
}

/** Public Airtrohp model names. The ids sent by the browser are these aliases, never the engine behind them. */
const ALIASES: Array<{ id: string; engine: string; name: string; desc: string }> = [
  { id: 'smart', engine: 'gemini', name: 'Airtrohp Smart', desc: 'Most capable. Best for hard questions and code' },
  { id: 'turbo', engine: 'groq', name: 'Airtrohp Turbo', desc: 'Extremely fast answers' },
  { id: 'swift', engine: 'cerebras', name: 'Airtrohp Swift', desc: 'Fast and balanced' },
  { id: 'flex', engine: 'openrouter', name: 'Airtrohp Flex', desc: 'Flexible, picks from many models' },
  { id: 'lite', engine: 'mistral', name: 'Airtrohp Lite', desc: 'Light and efficient for everyday chat' },
  { id: 'core', engine: 'workers-ai', name: 'Airtrohp Core', desc: 'Always-on backup, no limits to set up' },
];

/** Maps a public alias to the internal engine id ("gemini", "groq", ...). Unknown values give undefined. */
export function engineFor(alias: string | undefined): string | undefined {
  return ALIASES.find((a) => a.id === alias)?.engine;
}

/** Every AI the user can pick from: Gemini plus each free provider that is configured. */
export function listProviders(env: Env): ProviderInfo[] {
  const active = new Set<string>(['gemini', ...availableFallbacks(env)]);
  return ALIASES.filter((a) => active.has(a.engine)).map((a) => ({ id: a.id, name: a.name, model: a.desc }));
}

/** Names of the fallback providers that are currently usable (for diagnostics). */
export function availableFallbacks(env: Env): string[] {
  const names = openAiProviders(env)
    .filter((p) => p.key)
    .map((p) => p.name);
  if (env.AI) names.push('workers-ai');
  return names;
}

/** Tries each configured free provider in turn. Returns a Gemini-style SSE Response, or null if none worked. */
export async function callFallbackProviders(
  env: Env,
  fetcher: typeof fetch,
  body: unknown,
  signal?: AbortSignal,
  only?: string | string[],
): Promise<{ response: Response; provider: string } | null> {
  const messages = toMessages(body as GeminiBodyLike);
  if (!messages.some((m) => m.role === 'user')) return null;

  for (const p of openAiProviders(env)) {
    if (!p.key || signal?.aborted) continue;
    if (only && ![only].flat().includes(p.name)) continue;
    try {
      const res = await withDeadline(FIRST_BYTE_TIMEOUT_MS, signal, (s) =>
        fetcher(p.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}`, ...(p.extraHeaders ?? {}) },
          body: JSON.stringify({ model: p.model, messages, stream: true, max_tokens: 8192, stream_options: { include_usage: true } }),
          signal: s,
        }),
      );
      if (res.ok && res.body) return { response: sseResponse(res.body), provider: p.name };
      console.error('fallback provider failed', p.name, res.status, (await res.text().catch(() => '')).slice(0, 200));
    } catch (e) {
      console.error('fallback provider error', p.name, e);
    }
  }

  if (env.AI && !signal?.aborted && (!only || [only].flat().includes('workers-ai'))) {
    try {
      const out = await withDeadline(FIRST_BYTE_TIMEOUT_MS, signal, () =>
        (env.AI as NonNullable<Env['AI']>).run(env.WORKERS_AI_MODEL ?? WORKERS_AI_MODEL, { messages, stream: true, max_tokens: 4096 }),
      );
      if (out && typeof (out as ReadableStream).getReader === 'function') return { response: sseResponse(out as ReadableStream<Uint8Array>), provider: 'workers-ai' };
    } catch (e) {
      console.error('workers-ai error', e);
    }
  }
  return null;
}
