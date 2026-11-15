import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { PageShell } from '../components/layout/AppLayout';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Feedback';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import { friendlyAuthError } from '../lib/format';
import { getPrefs, setPrefs } from '../lib/prefs';
import { deleteAllConversations } from '../lib/storage';
import { useDocTitle } from '../hooks/useMisc';
import type { UserPreferences } from '../lib/types';

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div>
        <div className="text-sm text-ink-50">{label}</div>
        <div className="mt-0.5 text-xs text-ink-300">{hint}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition ${checked ? 'border-ink-100 bg-ink-100' : 'border-ink-500 bg-ink-800'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${checked ? 'left-[22px] bg-ink-950' : 'left-1 bg-ink-300'}`} />
      </button>
    </div>
  );
}

export default function Settings() {
  useDocTitle('Settings');
  const { user, me, setDisplayName, resetPassword } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [prefs, setPrefsState] = useState<UserPreferences>(getPrefs());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setName(user?.displayName ?? ''), [user?.displayName]);

  const saveName = async () => {
    if (!user) return;
    const n = name.trim().slice(0, 60);
    if (!n) return;
    setSavingName(true);
    try {
      await setDisplayName(n);
      await updateDoc(doc(db, 'users', user.uid), { displayName: n });
      toast.success('Profile updated.');
    } catch {
      toast.error('Could not update your profile.');
    } finally {
      setSavingName(false);
    }
  };

  const updatePref = async (patch: Partial<UserPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefsState(next);
    setPrefs(next);
    if (user) await updateDoc(doc(db, 'users', user.uid), { preferences: next }).catch(() => toast.error('Saved on this device only; could not sync to your account.'));
  };

  const sendReset = async () => {
    if (!user?.email) return;
    try {
      await resetPassword(user.email);
      toast.success(`Password reset email sent to ${user.email}.`);
    } catch (e) {
      toast.error(friendlyAuthError((e as { code?: string }).code ?? ''));
    }
  };

  const wipe = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const n = await deleteAllConversations(user.uid);
      toast.success(`Deleted ${n} conversation${n === 1 ? '' : 's'}.`);
      setConfirmDelete(false);
    } catch {
      toast.error('Could not delete your conversations.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageShell title="Settings" subtitle="Manage your profile, preferences and data.">
      <div className="max-w-2xl space-y-6">
        <section className="card p-6">
          <h2 className="text-sm font-medium text-ink-50">Profile</h2>
          <div className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="name">Display name</label>
              <div className="flex gap-2">
                <input id="name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
                <button className="btn-primary shrink-0" onClick={() => void saveName()} disabled={savingName || !name.trim() || name.trim() === user?.displayName}>
                  {savingName ? <Spinner /> : 'Save'}
                </button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input opacity-70" value={user?.email ?? ''} readOnly />
              <p className="mt-1.5 text-xs text-ink-400">{me?.emailVerified ? 'Verified.' : 'Not verified.'}</p>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-sm font-medium text-ink-50">Preferences</h2>
          <div className="mt-2 divide-y divide-ink-700">
            <Toggle checked={prefs.enterToSend} onChange={(v) => void updatePref({ enterToSend: v })} label="Press Enter to send" hint="When off, use Ctrl or Cmd + Enter to send and Enter for a new line." />
            <Toggle checked={prefs.wrapCode} onChange={(v) => void updatePref({ wrapCode: v })} label="Wrap long code lines" hint="Wrap lines inside code blocks instead of scrolling horizontally." />
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-sm font-medium text-ink-50">Security</h2>
          <p className="mt-2 text-sm text-ink-300">Change your password with a secure email link.</p>
          <button className="btn-secondary mt-4" onClick={() => void sendReset()}>Send password reset email</button>
        </section>

        <section className="card border-ink-500 p-6">
          <h2 className="text-sm font-medium text-ink-50">Data</h2>
          <p className="mt-2 text-sm text-ink-300">Permanently delete every conversation in your account. Workspace projects are not affected.</p>
          <button className="btn-danger mt-4" onClick={() => setConfirmDelete(true)}>Delete all conversations</button>
        </section>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete all conversations?">
        <p className="text-sm leading-6 text-ink-200">This removes your entire chat history and cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button className="btn-primary" onClick={() => void wipe()} disabled={deleting}>{deleting ? <Spinner /> : 'Delete everything'}</button>
        </div>
      </Modal>
    </PageShell>
  );
}
