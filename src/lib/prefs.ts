import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_PREFERENCES, type UserPreferences } from './types';

const KEY = 'airtrohp.prefs.v1';

export function getPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<UserPreferences>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFERENCES;
}

export function setPrefs(p: UserPreferences) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('airtrohp-prefs'));
}

/** Pull account preferences from Firestore so they follow the user across devices. */
export async function syncPrefsFromCloud(uid: string): Promise<void> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const p = snap.data()?.preferences as Partial<UserPreferences> | undefined;
    if (p && typeof p === 'object') setPrefs({ ...DEFAULT_PREFERENCES, ...p });
  } catch {
    /* offline or rules not deployed yet: keep local preferences */
  }
}
