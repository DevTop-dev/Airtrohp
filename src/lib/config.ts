export const APP_NAME = 'Airtrohp';

export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(API_URL && firebaseConfig.apiKey && firebaseConfig.projectId);

/** Names of required build-time variables that are empty. Vite inlines them at build time, so a redeploy is needed after changing them. */
export function missingEnv(): string[] {
  const required: Array<[string, string | undefined]> = [
    ['VITE_API_URL', API_URL],
    ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
    ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
    ['VITE_FIREBASE_APP_ID', firebaseConfig.appId],
  ];
  return required.filter(([, v]) => !v).map(([k]) => k);
}

/** Characters of attachments allowed on a single message (client side; the Worker enforces plan limits). */
export const MAX_ATTACH_CHARS = 250_000;
export const MAX_FILE_CHARS = 150_000;
export const MAX_ZIP_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 600;
export const MAX_ZIP_UNCOMPRESSED = 25 * 1024 * 1024;
export const MAX_PROJECT_FILES = 300;
export const GUEST_CONTEXT_CHARS = 60_000;

/** Conversations are kept for this many days after they were started, then deleted. */
export const RETENTION_DAYS = 7;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Where "Get Pro" sends people. Memberships are sold on Patreon. */
export const PATREON_URL = (import.meta.env.VITE_PATREON_URL as string | undefined) || 'https://www.patreon.com/17025245/join';

/** Plans whose daily allowance is at least this are shown as "Unlimited". */
export const UNLIMITED_FROM = 10_000;
export const isUnlimited = (dailyMessages: number): boolean => dailyMessages >= UNLIMITED_FROM;
