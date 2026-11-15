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

/** Characters of attachments allowed on a single message (client side; the Worker enforces plan limits). */
export const MAX_ATTACH_CHARS = 250_000;
export const MAX_FILE_CHARS = 150_000;
export const MAX_ZIP_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 600;
export const MAX_ZIP_UNCOMPRESSED = 25 * 1024 * 1024;
export const MAX_PROJECT_FILES = 300;
export const GUEST_CONTEXT_CHARS = 60_000;
