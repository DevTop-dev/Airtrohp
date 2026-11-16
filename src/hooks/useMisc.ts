import { useEffect, useState } from 'react';
import { getPublicConfig } from '../lib/api';
import type { PublicConfig } from '../lib/types';
import { PATREON_URL } from '../lib/config';

export function useDocTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | Airtrohp` : 'Airtrohp | AI Coding Assistant';
  }, [title]);
}

/** Public plan/limit configuration served by the Worker (single source of truth). */
export const FALLBACK_CONFIG: PublicConfig = {
  guestLimit: 5,
  patreonEnabled: false,
  patreonJoinUrl: PATREON_URL,
  tiers: [
    { id: 'free', name: 'Free', priceUsd: 0, dailyMessages: 50, maxContextChars: 100000, enabled: true, features: ['Basic AI coding assistance', '50 AI messages per day across all chats', 'Conversation history (kept for 7 days)'] },
    { id: 'pro', name: 'Airtrohp Pro', priceUsd: 9.99, dailyMessages: 100000, maxContextChars: 500000, enabled: true, features: ['Unlimited AI messages (fair-use rate limit applies)', 'Advanced coding assistance', 'Multi-file project assistance', 'Priority access to new features'] },
    { id: 'ultimate', name: 'Airtrohp Ultimate', priceUsd: 0, dailyMessages: 0, maxContextChars: 0, enabled: false, features: ['Coming soon'] },
  ],
};

export function usePublicConfig(): { config: PublicConfig; live: boolean } {
  const [state, setState] = useState<{ config: PublicConfig; live: boolean }>({ config: FALLBACK_CONFIG, live: false });
  useEffect(() => {
    let alive = true;
    getPublicConfig()
      .then((c) => alive && setState({ config: c, live: true }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function useCopy(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return [copied, copy];
}
