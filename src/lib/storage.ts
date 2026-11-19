import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { RETENTION_MS } from './config';
import type { ChatMessage, ConversationMeta } from './types';

/** Conversation persistence. Guests use localStorage, signed-in users use Firestore (own data only). */
export interface ChatStorage {
  kind: 'guest' | 'user';
  subscribe(cb: (list: ConversationMeta[]) => void): () => void;
  create(title: string, projectId?: string | null): Promise<string>;
  load(id: string): Promise<{ meta: ConversationMeta | null; messages: ChatMessage[] }>;
  saveMessage(cid: string, m: ChatMessage): Promise<void>;
  deleteMessages(cid: string, ids: string[]): Promise<void>;
  patch(cid: string, patch: Partial<Pick<ConversationMeta, 'title' | 'projectId'>>): Promise<void>;
  remove(cid: string): Promise<void>;
}

const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** True once a conversation is older than the retention period (legacy entries without a start time never expire). */
export function isExpired(createdAt: number, now: number = Date.now()): boolean {
  return createdAt > 0 && now - createdAt > RETENTION_MS;
}

// ---------------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------------
export function firestoreStorage(uid: string): ChatStorage {
  const convs = collection(db, 'users', uid, 'conversations');
  const msgs = (cid: string) => collection(db, 'users', uid, 'conversations', cid, 'messages');

  return {
    kind: 'user',
    subscribe(cb) {
      const q = query(convs, orderBy('updatedAt', 'desc'), limit(300));
      return onSnapshot(
        q,
        (snap) =>
          cb(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                title: String(x.title ?? 'Untitled'),
                createdAt: Number(x.createdAt ?? 0),
                updatedAt: Number(x.updatedAt ?? 0),
                projectId: (x.projectId as string | null) ?? null,
              };
            }),
          ),
        (err) => {
          console.error('Could not load conversations', err);
          cb([]);
        },
      );
    },
    async create(title, projectId) {
      const now = Date.now();
      const ref = await addDoc(convs, { title, createdAt: now, updatedAt: now, projectId: projectId ?? null });
      return ref.id;
    },
    async load(id) {
      const metaSnap = await getDoc(doc(convs, id));
      if (!metaSnap.exists()) return { meta: null, messages: [] };
      const x = metaSnap.data();
      if (isExpired(Number(x.createdAt ?? 0))) {
        await this.remove(id).catch(() => undefined);
        return { meta: null, messages: [] };
      }
      const snap = await getDocs(query(msgs(id), orderBy('createdAt', 'asc')));
      return {
        meta: {
          id,
          title: String(x.title ?? 'Untitled'),
          createdAt: Number(x.createdAt ?? 0),
          updatedAt: Number(x.updatedAt ?? 0),
          projectId: (x.projectId as string | null) ?? null,
        },
        messages: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) })),
      };
    },
    async saveMessage(cid, m) {
      const { id, ...rest } = clean(m);
      await setDoc(doc(msgs(cid), id), rest);
      await updateDoc(doc(convs, cid), { updatedAt: Date.now() });
    },
    async deleteMessages(cid, ids) {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        for (const id of ids.slice(i, i + 400)) batch.delete(doc(msgs(cid), id));
        await batch.commit();
      }
    },
    async patch(cid, p) {
      await updateDoc(doc(convs, cid), { ...p, updatedAt: Date.now() });
    },
    async remove(cid) {
      const snap = await getDocs(msgs(cid));
      const ids = snap.docs.map((d) => d.id);
      await this.deleteMessages(cid, ids);
      await deleteDoc(doc(convs, cid));
    },
  };
}

/** Deletes every conversation of a user (used by Settings). */
export async function deleteAllConversations(uid: string): Promise<number> {
  const storage = firestoreStorage(uid);
  const snap = await getDocs(collection(db, 'users', uid, 'conversations'));
  for (const d of snap.docs) await storage.remove(d.id);
  return snap.size;
}

// ---------------------------------------------------------------------------
// Guest (localStorage)
// ---------------------------------------------------------------------------
const GUEST_KEY = 'airtrohp.guest.conversations.v1';

interface GuestData {
  conversations: Array<{ meta: ConversationMeta; messages: ChatMessage[] }>;
}

const listeners = new Set<() => void>();

function readGuest(): GuestData {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (raw) {
      const d = JSON.parse(raw) as GuestData;
      const now = Date.now();
      d.conversations = d.conversations.filter((c) => !isExpired(c.meta.createdAt, now));
      return d;
    }
  } catch {
    /* ignore */
  }
  return { conversations: [] };
}

function writeGuest(d: GuestData) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(d));
  } catch {
    /* quota exceeded or storage disabled: conversation stays in memory for this page only */
  }
  listeners.forEach((l) => l());
}

export function hasGuestConversations(): boolean {
  return readGuest().conversations.some((c) => c.messages.length > 0);
}

export function clearGuestConversations() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function readGuestForMigration(): GuestData['conversations'] {
  return readGuest().conversations;
}

export const guestStorage: ChatStorage = {
  kind: 'guest',
  subscribe(cb) {
    const emit = () =>
      cb(
        readGuest()
          .conversations.map((c) => c.meta)
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
    listeners.add(emit);
    emit();
    return () => listeners.delete(emit);
  },
  async create(title) {
    const d = readGuest();
    const now = Date.now();
    const id = `g${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    d.conversations.push({ meta: { id, title, createdAt: now, updatedAt: now, projectId: null }, messages: [] });
    writeGuest(d);
    return id;
  },
  async load(id) {
    const c = readGuest().conversations.find((x) => x.meta.id === id);
    return c ? { meta: c.meta, messages: c.messages } : { meta: null, messages: [] };
  },
  async saveMessage(cid, m) {
    const d = readGuest();
    const c = d.conversations.find((x) => x.meta.id === cid);
    if (!c) return;
    const i = c.messages.findIndex((x) => x.id === m.id);
    if (i >= 0) c.messages[i] = m;
    else c.messages.push(m);
    c.meta.updatedAt = Date.now();
    writeGuest(d);
  },
  async deleteMessages(cid, ids) {
    const d = readGuest();
    const c = d.conversations.find((x) => x.meta.id === cid);
    if (!c) return;
    c.messages = c.messages.filter((m) => !ids.includes(m.id));
    writeGuest(d);
  },
  async patch(cid, p) {
    const d = readGuest();
    const c = d.conversations.find((x) => x.meta.id === cid);
    if (!c) return;
    if (p.title !== undefined) c.meta.title = p.title;
    c.meta.updatedAt = Date.now();
    writeGuest(d);
  },
  async remove(cid) {
    const d = readGuest();
    d.conversations = d.conversations.filter((x) => x.meta.id !== cid);
    writeGuest(d);
  },
};

/** After a guest signs up, copy their local conversations into their account so nothing is lost. */
export async function migrateGuestConversations(uid: string): Promise<number> {
  const local = readGuestForMigration().filter((c) => c.messages.length > 0);
  if (!local.length) return 0;
  const target = firestoreStorage(uid);
  for (const c of local) {
    const id = await target.create(c.meta.title);
    for (const m of c.messages) await target.saveMessage(id, m);
  }
  clearGuestConversations();
  return local.length;
}
