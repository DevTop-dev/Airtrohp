import type { Env } from './env';
import type { TierConfig } from './config';

export interface ChatFile {
  name: string;
  content: string;
}
export interface ChatMessageIn {
  role: 'user' | 'model';
  content: string;
  files?: ChatFile[];
}
export interface ChatInput {
  messages: ChatMessageIn[];
  context: ChatFile[]; // project workspace files
}

export const SYSTEM_PROMPT = `You are Airtrohp, a professional AI coding assistant built by the Airtrohp team.
Always refer to yourself as Airtrohp. Never say you are Gemini or Google's model.

Scope: you help with practically all normal software development work in JavaScript, TypeScript, Python, HTML, CSS, C, C++, Java, C#, PHP, SQL, Go, Rust, Kotlin and Swift, and in frameworks and platforms such as React, Next.js, Node.js, Express, Vue, Angular, Tailwind CSS, Firebase, Supabase, Discord.js v14, REST APIs, databases and Cloudflare Workers. You write complete programs and websites, build Discord bots, debug, fix errors, refactor, optimize, explain code, design architecture, review uploaded files and generate multi-file projects.

Style:
- Be precise, technically accurate and direct. Prefer complete, working code over fragments. Do not pad answers.
- Use GitHub-flavoured Markdown. Put all code in fenced code blocks with a language tag.
- When you output a file that belongs in a project, put its path in the fence info string like this: \`\`\`ts file=src/index.ts   (the user can download these files). Use one fenced block per file and always include the full file content when you create or rewrite a file.
- If a request is ambiguous in a way that matters, state your assumption briefly and continue.
- Keep the conversation context in mind. Uploaded files appear as "Attached file" blocks or as project files.

Safety: do not help with genuinely harmful work such as credential theft, phishing pages or kits, malware, ransomware or botnets, unauthorized access to systems or accounts, token or password stealers, mass spam or raid tooling, or destructive attacks. Decline that part briefly and offer a legitimate alternative (for example defensive security, hardening, detection or moderation tooling). Normal programming help, security education at a conceptual level, and defensive work are fine.`;

function fence(content: string): string {
  let n = 3;
  const runs = content.match(/`{3,}/g);
  if (runs) n = Math.max(...runs.map((r) => r.length)) + 1;
  return '`'.repeat(n);
}

export function formatFiles(files: ChatFile[], heading: string): string {
  return files
    .map((f) => {
      const f3 = fence(f.content);
      return `[${heading}: ${f.name}]\n${f3}\n${f.content}\n${f3}`;
    })
    .join('\n\n');
}

export function chatInputSize(input: ChatInput): number {
  let n = 0;
  for (const m of input.messages) {
    n += m.content.length;
    for (const f of m.files ?? []) n += f.content.length + f.name.length;
  }
  for (const f of input.context) n += f.content.length + f.name.length;
  return n;
}

export function buildGeminiBody(input: ChatInput) {
  let system = SYSTEM_PROMPT;
  if (input.context.length) {
    system += `\n\nThe user selected a project workspace. Its files follow. Treat them as the current state of the project.\n\n${formatFiles(
      input.context,
      'Project file',
    )}`;
  }

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const m of input.messages) {
    let text = m.content;
    if (m.files?.length) text += `\n\n${formatFiles(m.files, 'Attached file')}`;
    if (!text.trim()) continue;
    const last = contents[contents.length - 1];
    if (last && last.role === m.role) last.parts.push({ text });
    else contents.push({ role: m.role, parts: [{ text }] });
  }
  while (contents.length && contents[0].role !== 'user') contents.shift();

  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    // Gemini 3 thinks at "high" by default, which delays the first token. "low" keeps chat fast.
    generationConfig: { maxOutputTokens: 16384, thinkingConfig: { thinkingLevel: 'low' } },
  };
}

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_MODEL_ADVANCED = 'gemini-3.8-flash';
export const DEFAULT_MODEL_FALLBACK = 'gemini-3.8-flash';

export function modelFor(env: Env, tier: Pick<TierConfig, 'model'>): string {
  return tier.model === 'advanced' ? (env.GEMINI_MODEL_PRO ?? DEFAULT_MODEL_ADVANCED) : (env.GEMINI_MODEL ?? DEFAULT_MODEL);
}

export async function callGemini(env: Env, fetcher: typeof fetch, model: string, body: unknown, signal?: AbortSignal) {
  return fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal,
    },
  );
}

export interface GeminiChunk {
  text: string;
  finishReason?: string;
  blockReason?: string;
  promptTokens?: number;
  outputTokens?: number;
}

export function parseGeminiEvent(data: string): GeminiChunk | null {
  let j: any;
  try {
    j = JSON.parse(data);
  } catch {
    return null;
  }
  const cand = j.candidates?.[0];
  const text = ((cand?.content?.parts ?? []) as Array<{ text?: string }>).map((p) => p.text ?? '').join('');
  return {
    text,
    finishReason: cand?.finishReason,
    blockReason: j.promptFeedback?.blockReason,
    promptTokens: j.usageMetadata?.promptTokenCount,
    outputTokens: j.usageMetadata?.candidatesTokenCount,
  };
}

const RETRYABLE = new Set([429, 500, 503, 504]);
/** How long Gemini may take to start answering before we give up on that attempt. */
const FIRST_BYTE_TIMEOUT_MS = 20_000;

function withoutThinking(body: unknown): unknown {
  const b = body as { generationConfig?: Record<string, unknown> };
  if (!b.generationConfig || !('thinkingConfig' in b.generationConfig)) return body;
  const { thinkingConfig: _drop, ...rest } = b.generationConfig;
  return { ...b, generationConfig: rest };
}

/** One call with a deadline for the response to start. The deadline is cleared once headers arrive, so long answers are never cut off. */
async function callWithDeadline(env: Env, fetcher: typeof fetch, model: string, body: unknown, outer?: AbortSignal): Promise<Response> {
  const ac = new AbortController();
  const onOuterAbort = () => ac.abort();
  outer?.addEventListener('abort', onOuterAbort, { once: true });
  const timer = setTimeout(() => ac.abort(), FIRST_BYTE_TIMEOUT_MS);
  try {
    return await callGemini(env, fetcher, model, body, ac.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls Gemini and keeps the chat responsive:
 *  - a slow or failing attempt is abandoned after a deadline,
 *  - transient overloads are retried once, then the next model in the list is used,
 *  - if a model rejects the thinking setting (HTTP 400), it is retried once without it.
 * Only runs before any bytes reach the client, so it is safe to repeat.
 */
export async function callGeminiResilient(
  env: Env,
  fetcher: typeof fetch,
  models: string[],
  body: unknown,
  signal?: AbortSignal,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<Response> {
  const unique = models.filter((m, i) => m && models.indexOf(m) === i);
  let current = body;
  let last: Response | undefined;
  let lastError: unknown;
  for (const model of unique) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw new Error('aborted');
      if (last) await last.body?.cancel().catch(() => undefined);
      last = undefined;
      try {
        last = await callWithDeadline(env, fetcher, model, current, signal);
      } catch (e) {
        if (signal?.aborted) throw e;
        lastError = e; // deadline hit or network error: try again / next model
        continue;
      }
      if (last.ok) return last;
      if (last.status === 400 && current !== withoutThinking(current)) {
        current = withoutThinking(current);
        attempt--; // same model again, without the thinking setting
        continue;
      }
      if (!RETRYABLE.has(last.status)) return last;
      if (attempt === 0) await sleep(400);
    }
  }
  if (last) return last;
  throw lastError ?? new Error('Gemini unreachable');
}
