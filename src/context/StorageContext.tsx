import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { firestoreStorage, guestStorage, isExpired, migrateGuestConversations, hasGuestConversations, type ChatStorage } from '../lib/storage';
import type { ConversationMeta } from '../lib/types';
import { useToast } from './ToastContext';
import { syncPrefsFromCloud } from '../lib/prefs';

interface StorageState {
  storage: ChatStorage;
  conversations: ConversationMeta[];
  ready: boolean;
}

const Ctx = createContext<StorageState | null>(null);

/** Chooses guest (localStorage) or per-user Firestore storage and exposes the live conversation list. */
export function StorageProvider({ children }: { children: ReactNode }) {
  const { user, me } = useAuth();
  const toast = useToast();
  const verified = !!user && !!me?.emailVerified && !me.disabled;
  const uid = verified ? user!.uid : null;
  const storage = useMemo<ChatStorage>(() => (uid ? firestoreStorage(uid) : guestStorage), [uid]);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [ready, setReady] = useState(false);
  const purging = useRef(new Set<string>());

  useEffect(() => {
    if (uid) void syncPrefsFromCloud(uid);
  }, [uid]);

  useEffect(() => {
    setReady(false);
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      if (uid && hasGuestConversations()) {
        try {
          const n = await migrateGuestConversations(uid);
          if (n > 0 && !cancelled) toast.success('Your guest conversation was saved to your account.');
        } catch {
          /* keep the local copy if the migration fails; it will retry on the next load */
        }
      }
      if (cancelled) return;
      unsub = storage.subscribe((list) => {
        const now = Date.now();
        // Conversations older than the retention period are hidden immediately and deleted in the background.
        for (const c of list) {
          if (isExpired(c.createdAt, now) && !purging.current.has(c.id)) {
            purging.current.add(c.id);
            void storage.remove(c.id).catch(() => purging.current.delete(c.id));
          }
        }
        setConversations(list.filter((c) => !isExpired(c.createdAt, now)));
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, uid]);

  const value = useMemo(() => ({ storage, conversations, ready }), [storage, conversations, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStorage(): StorageState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStorage must be used inside StorageProvider');
  return v;
}
