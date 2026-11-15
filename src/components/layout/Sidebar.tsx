import { useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { Check, FolderGit2, LayoutDashboard, LogOut, MessageSquare, Pencil, Plus, Settings, Shield, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { Logo } from '../ui/Logo';
import { useAuth } from '../../context/AuthContext';
import { useStorage } from '../../context/StorageContext';
import { useToast } from '../../context/ToastContext';
import type { ConversationMeta } from '../../lib/types';

function ConversationItem({ c, active, onNavigate }: { c: ConversationMeta; active: boolean; onNavigate: () => void }) {
  const { storage } = useStorage();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [title, setTitle] = useState(c.title);

  const saveRename = async () => {
    const t = title.trim().slice(0, 80);
    setMode('view');
    if (t && t !== c.title) await storage.patch(c.id, { title: t }).catch(() => toast.error('Could not rename the conversation.'));
  };
  const doDelete = async () => {
    setMode('view');
    try {
      await storage.remove(c.id);
      if (active) navigate('/chat', { replace: true });
    } catch {
      toast.error('Could not delete the conversation.');
    }
  };

  if (mode === 'rename') {
    return (
      <form
        className="flex items-center gap-1 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          void saveRename();
        }}
      >
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setMode('view')} className="input !py-1.5 text-xs" aria-label="Conversation title" />
        <button className="rounded p-1.5 text-ink-200 hover:bg-ink-700" type="submit" aria-label="Save title"><Check size={14} /></button>
        <button className="rounded p-1.5 text-ink-300 hover:bg-ink-700" type="button" onClick={() => setMode('view')} aria-label="Cancel"><X size={14} /></button>
      </form>
    );
  }
  if (mode === 'delete') {
    return (
      <div className="flex items-center justify-between rounded-lg bg-ink-800 px-3 py-2 text-xs text-ink-100">
        <span>Delete this chat?</span>
        <span className="flex gap-1">
          <button onClick={() => void doDelete()} className="rounded px-2 py-1 font-medium hover:bg-ink-600">Delete</button>
          <button onClick={() => setMode('view')} className="rounded px-2 py-1 text-ink-300 hover:bg-ink-600">Keep</button>
        </span>
      </div>
    );
  }
  return (
    <div className={clsx('group relative flex items-center rounded-lg transition', active ? 'bg-ink-700 text-ink-50' : 'text-ink-200 hover:bg-ink-800')}>
      <Link to={`/chat/${c.id}`} onClick={onNavigate} className="min-w-0 flex-1 truncate px-3 py-2 text-[13px]" title={c.title}>
        {c.title}
      </Link>
      <span className="absolute right-1 hidden items-center gap-0.5 rounded-md bg-inherit pl-3 group-hover:flex group-focus-within:flex">
        <button onClick={() => { setTitle(c.title); setMode('rename'); }} className="rounded p-1.5 text-ink-300 hover:bg-ink-600 hover:text-ink-50" aria-label={`Rename ${c.title}`}><Pencil size={13} /></button>
        <button onClick={() => setMode('delete')} className="rounded p-1.5 text-ink-300 hover:bg-ink-600 hover:text-ink-50" aria-label={`Delete ${c.title}`}><Trash2 size={13} /></button>
      </span>
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { user, me, signOut } = useAuth();
  const { conversations, ready } = useStorage();
  const { id: activeId } = useParams();
  const navigate = useNavigate();
  const signedIn = !!user;

  const nav = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/workspace', label: 'Workspace', icon: FolderGit2 },
    { to: '/settings', label: 'Settings', icon: Settings },
    ...(me?.isAdmin ? [{ to: '/admin', label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <Logo to="/" />
      </div>

      <div className="px-3">
        <button onClick={() => { navigate('/chat'); onNavigate(); }} className="btn-secondary w-full justify-start !px-3">
          <Plus size={16} /> New chat
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3">
        <div className="eyebrow mb-2 px-1">{signedIn ? 'History' : 'This session'}</div>
        {!ready ? (
          <div className="space-y-2 px-1" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className="h-7 animate-pulse rounded-md bg-ink-800" />)}
          </div>
        ) : conversations.length === 0 ? (
          <p className="flex items-center gap-2 px-1 text-xs text-ink-400"><MessageSquare size={13} /> No conversations yet</p>
        ) : (
          <div className="space-y-0.5 pb-3">
            {conversations.map((c) => (
              <ConversationItem key={c.id} c={c} active={c.id === activeId} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </div>

      {signedIn && (
        <nav className="border-t border-ink-800 px-3 py-3" aria-label="Account navigation">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition', isActive ? 'bg-ink-700 text-ink-50' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50')}
            >
              <n.icon size={16} /> {n.label}
            </NavLink>
          ))}
        </nav>
      )}

      <div className="border-t border-ink-800 p-3">
        {signedIn ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink-500 bg-ink-800 text-sm font-medium uppercase">
              {(user?.displayName || user?.email || '?').charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-ink-50">{user?.displayName || user?.email}</div>
              <div className="text-[11px] uppercase tracking-wider text-ink-300">{me?.tierName ?? 'Free'}</div>
            </div>
            <button onClick={() => void signOut().then(() => navigate('/'))} className="rounded-lg p-2 text-ink-300 hover:bg-ink-800 hover:text-ink-50" aria-label="Log out" title="Log out">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="px-1 text-xs leading-5 text-ink-300">Create a free account to save your history across devices.</p>
            <Link to="/register" onClick={onNavigate} className="btn-primary w-full">Create account</Link>
            <Link to="/login" onClick={onNavigate} className="btn-ghost w-full">Log in</Link>
          </div>
        )}
      </div>
    </div>
  );
}
