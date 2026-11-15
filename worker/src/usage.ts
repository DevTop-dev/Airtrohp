import type { DurableObjectNamespaceLike, DurableObjectStateLike } from './env';

/**
 * Durable Object used as an atomic counter. One object per key
 * (e.g. "guest:<id>", "u:<uid>:2026-11-15", "rl:<id>:<minute>").
 * Durable Objects serialize requests, so the read-modify-write below is race free.
 */
export class UsageCounter {
  constructor(private state: DurableObjectStateLike) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as { limit?: number; ttl?: number };
    const storage = this.state.storage;
    let count = (await storage.get<number>('count')) ?? 0;

    if (url.pathname === '/consume') {
      const limit = Math.max(0, Number(body.limit ?? 0));
      if (count >= limit) return Response.json({ allowed: false, count });
      count += 1;
      await storage.put('count', count);
      const ttl = Number(body.ttl ?? 0);
      if (ttl > 0 && (await storage.get<number>('exp')) === undefined) {
        const exp = Date.now() + ttl * 1000;
        await storage.put('exp', exp);
        await storage.setAlarm(exp);
      }
      return Response.json({ allowed: true, count });
    }
    if (url.pathname === '/refund') {
      count = Math.max(0, count - 1);
      await storage.put('count', count);
      return Response.json({ count });
    }
    if (url.pathname === '/reset') {
      await storage.put('count', 0);
      return Response.json({ count: 0 });
    }
    return Response.json({ count }); // /peek
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}

export class Counters {
  constructor(private ns: DurableObjectNamespaceLike) {}

  private stub(key: string) {
    return this.ns.get(this.ns.idFromName(key));
  }

  private async call<T>(key: string, path: string, body: unknown = {}): Promise<T> {
    const res = await this.stub(key).fetch(`https://counter${path}`, { method: 'POST', body: JSON.stringify(body) });
    return (await res.json()) as T;
  }

  /** Atomically add 1 if count < limit. `ttlSeconds` = lifetime of the counter (0 = forever). */
  consume(key: string, limit: number, ttlSeconds = 0) {
    return this.call<{ allowed: boolean; count: number }>(key, '/consume', { limit, ttl: ttlSeconds });
  }
  refund(key: string) {
    return this.call<{ count: number }>(key, '/refund');
  }
  reset(key: string) {
    return this.call<{ count: number }>(key, '/reset');
  }
  async peek(key: string): Promise<number> {
    return (await this.call<{ count: number }>(key, '/peek')).count;
  }
}
