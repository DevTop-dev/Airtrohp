import type { Env, TierId } from './env';
import { intVar } from './utils';

export interface TierConfig {
  id: TierId;
  name: string;
  priceUsd: number;
  dailyMessages: number; // AI requests per UTC day
  maxContextChars: number; // total characters accepted per request
  model: 'standard' | 'advanced';
  enabled: boolean;
  features: string[];
}

const DEFAULT_TIERS: Record<TierId, TierConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    dailyMessages: 20,
    maxContextChars: 100_000,
    model: 'standard',
    enabled: true,
    features: [
      'Basic AI coding assistance',
      '20 AI messages per day',
      'Conversation history',
      'File uploads up to 100k characters of context',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Airtrohp Pro',
    priceUsd: 9.99,
    dailyMessages: 300,
    maxContextChars: 500_000,
    model: 'advanced',
    enabled: true,
    features: [
      'Higher AI usage limits (300 messages per day)',
      'Advanced coding assistance and debugging',
      'Multi-file project assistance',
      'Up to 500k characters of project context',
      'Priority access to new features',
    ],
  },
  ultimate: {
    id: 'ultimate',
    name: 'Airtrohp Ultimate',
    priceUsd: 24.99,
    dailyMessages: 1000,
    maxContextChars: 900_000,
    model: 'advanced',
    enabled: false, // flip with ENABLE_ULTIMATE=true once the Patreon tier exists
    features: ['Highest usage limits', 'Largest project context', 'Everything in Pro'],
  },
};

export const GUEST_MAX_CONTEXT_CHARS = 60_000;

export function getTiers(env: Env): Record<TierId, TierConfig> {
  const tiers: Record<TierId, TierConfig> = JSON.parse(JSON.stringify(DEFAULT_TIERS));
  if (env.TIER_CONFIG) {
    try {
      const overrides = JSON.parse(env.TIER_CONFIG) as Partial<Record<TierId, Partial<TierConfig>>>;
      for (const id of Object.keys(tiers) as TierId[]) {
        const o = overrides[id];
        if (o && typeof o === 'object') tiers[id] = { ...tiers[id], ...o, id };
      }
    } catch {
      /* ignore malformed override, keep defaults */
    }
  }
  if (env.ENABLE_ULTIMATE === 'true') tiers.ultimate.enabled = true;
  return tiers;
}

export function guestLimit(env: Env): number {
  return intVar(env.GUEST_MESSAGE_LIMIT, 5);
}
export function guestIpDailyLimit(env: Env): number {
  return intVar(env.GUEST_IP_DAILY_LIMIT, 15);
}
export function rateLimitPerMinute(env: Env): number {
  return intVar(env.RATE_LIMIT_PER_MINUTE, 12);
}
