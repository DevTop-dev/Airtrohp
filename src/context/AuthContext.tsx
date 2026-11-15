import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { api, ApiError } from '../lib/api';
import type { Me } from '../lib/types';

interface AuthState {
  user: User | null;
  /** True until Firebase has restored (or not) the persisted session. */
  loading: boolean;
  /** Server-verified profile, plan and usage. The only source of truth for plan/admin status. */
  me: Me | null;
  meError: string | null;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  /** Reloads the Firebase user and ID token (needed after email verification), then re-fetches /api/me. */
  refresh: () => Promise<Me | null>;
  setDisplayName: (name: string) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const seq = useRef(0);

  const loadMe = useCallback(async (): Promise<Me | null> => {
    const my = ++seq.current;
    try {
      const data = await api<Me>('/api/me');
      if (my === seq.current) {
        setMe(data);
        setMeError(null);
      }
      return data;
    } catch (e) {
      if (my === seq.current) {
        setMe(null);
        setMeError(e instanceof ApiError ? e.message : 'Could not load your account.');
      }
      return null;
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) await loadMe();
      else {
        seq.current++;
        setMe(null);
        setMeError(null);
      }
      setLoading(false);
    });
  }, [loadMe]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      me,
      meError,
      async signUp(email, password, name) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
        await sendEmailVerification(cred.user);
        await cred.user.getIdToken(true);
        await loadMe();
      },
      async signIn(email, password) {
        await signInWithEmailAndPassword(auth, email, password);
      },
      async signOut() {
        await fbSignOut(auth);
      },
      async resetPassword(email) {
        await sendPasswordResetEmail(auth, email);
      },
      async resendVerification() {
        if (auth.currentUser) await sendEmailVerification(auth.currentUser);
      },
      async refresh() {
        const u = auth.currentUser;
        if (!u) return null;
        await u.reload();
        await u.getIdToken(true);
        setUser(auth.currentUser);
        return loadMe();
      },
      async setDisplayName(name) {
        if (!auth.currentUser) return;
        await updateProfile(auth.currentUser, { displayName: name });
        setUser(auth.currentUser);
      },
    }),
    [user, loading, me, meError, loadMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
