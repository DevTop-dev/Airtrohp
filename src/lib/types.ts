export type TierId = 'free' | 'pro' | 'ultimate';

export interface TierInfo {
  id: TierId;
  name: string;
  priceUsd: number;
  dailyMessages: number;
  maxContextChars: number;
  enabled: boolean;
  features: string[];
}

export interface PublicConfig {
  guestLimit: number;
  patreonEnabled: boolean;
  patreonJoinUrl: string | null;
  tiers: TierInfo[];
}

export interface Me {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  disabled: boolean;
  isAdmin: boolean;
  tier: TierId;
  tierName: string;
  membership: { status: string; source: string; expiresAt: number | null; patreonLinked: boolean };
  limits: { dailyMessages: number; maxContextChars: number };
  usage: { usedToday: number; remainingToday: number; /** epoch ms when the daily allowance resets (next UTC midnight) */ resetsAt?: number };
}

export interface UsageDay {
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AttachedFile {
  name: string;
  content: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  files?: AttachedFile[];
  createdAt: number;
  error?: string;
}

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  projectId?: string | null;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  fileCount: number;
}

export interface ProjectFile {
  id: string;
  path: string;
  content: string;
  size: number;
}

export interface UserPreferences {
  enterToSend: boolean;
  wrapCode: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = { enterToSend: true, wrapCode: false };
