import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, Bug, Clock, FolderOpen, Hammer, Lock, MailCheck, Sparkles, Wand2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStorage } from '../../context/StorageContext';
import { useToast } from '../../context/ToastContext';
import { useChat } from '../../hooks/useChat';
import { ensureGuestSession } from '../../lib/guest';
import { listFiles, listProjects, putFiles } from '../../lib/workspace';
import { GUEST_CONTEXT_CHARS, MAX_ATTACH_CHARS, PATREON_URL, isUnlimited } from '../../lib/config';
import type { Project } from '../../lib/types';
import { LogoMark } from '../ui/Logo';
import { Notice, Spinner } from '../ui/Feedback';
import { Composer } from './Composer';
import { FileViewerProvider } from './FileViewer';
import { formatCountdown, useCountdown } from '../../hooks/useCountdown';
import { nextUtcMidnight } from '../../lib/format';
import { MessageItem } from './MessageItem';

const SUGGESTIONS = [
  { icon: Hammer, title: 'Build a Discord bot', prompt: 'Build a Discord.js v14 bot with slash commands for moderation (kick, ban, timeout) and a welcome message. Give me the full project structure and all files.' },
  { icon: Bug, title: 'Debug my code', prompt: 'I will paste an error and the code that causes it. Find the root cause and give me the corrected code.\n\n' },
  { icon: Wand2, title: 'Create a REST API', prompt: 'Create a REST API with Node.js, Express and TypeScript with JWT authentication, input validation and a clean folder structure.' },
  { icon: Sparkles, title: 'Refactor and optimize', prompt: 'Review the following code for readability, performance and bugs, then refactor it and explain each change.\n\n' },
];

export function ChatView({ conversationId }: { conversationId?: string }) {
  const { user, me, refresh } = useAuth();
  const { storage, conversations } = useStorage();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const verified = !!user && !!me?.emailVerified && !me.disabled;
  const unverified = !!user && !!me && !me.emailVerified;
  const guest = !user;
  const maxChars = verified ? me!.limits.maxContextChars : GUEST_CONTEXT_CHARS;

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(params.get('project'));
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);

  useEffect(() => {
    if (!verified) return;
    listProjects(user!.uid).then(setProjects).catch(() => undefined);
  }, [verified, user]);

  // Restore the conversation's own project selection
  const convMeta = conversations.find((c) => c.id === conversationId);
  useEffect(() => {
    if (conversationId) setProjectId(convMeta?.projectId ?? null);
    else setProjectId(params.get('project'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, convMeta?.projectId]);

  const onCreated = useCallback((id: string) => navigate(`/chat/${id}`, { replace: true }), [navigate]);

  const loadContext = useCallback(async () => {
    if (!verified || !projectId) return [];
    const files = await listFiles(user!.uid, projectId);
    const budget = Math.floor(maxChars * 0.6);
    let used = 0;
    const out: { name: string; content: string }[] = [];
    for (const f of files) {
      if (used + f.content.length > budget) continue;
      used += f.content.length;
      out.push({ name: f.path, content: f.content });
    }
    return out;
  }, [verified, projectId, user, maxChars]);

  const chat = useChat({ storage, conversationId, onConversationCreated: onCreated, maxChars, projectId, loadContext });
  const { messages, streaming, loading, notFound, error, quota, setQuota } = chat;

  // Initial quota: server-reported guest session, or the signed-in user's daily allowance
  useEffect(() => {
    if (guest) {
      ensureGuestSession()
        .then((s) => setQuota({ remaining: s.remaining, limit: s.limit }))
        .catch(() => undefined);
    } else if (verified) {
      setQuota({ remaining: me!.usage.remainingToday, limit: me!.limits.dailyMessages });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest, verified, me?.usage.remainingToday, me?.limits.dailyMessages]);

  // Daily allowance exhausted: remember when it resets so we can show a countdown
  const [resetsAt, setResetsAt] = useState<number | null>(null);
  useEffect(() => {
    if (verified && me!.usage.remainingToday <= 0) setResetsAt(me!.usage.resetsAt ?? nextUtcMidnight());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, me?.usage.remainingToday, me?.usage.resetsAt]);
  useEffect(() => {
    if (error?.code === 'USAGE_LIMIT') {
      setQuota((q) => ({ remaining: 0, limit: q?.limit ?? me?.limits.dailyMessages ?? 0 }));
      setResetsAt(error.resetsAt ?? nextUtcMidnight());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // Auto-scroll that respects the user scrolling up
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stick.current = near;
    setShowJump(!near);
  };
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  useEffect(() => {
    stick.current = true;
  }, [conversationId]);

  const limitReached = guest && quota !== null && quota.remaining <= 0;
  const dailyLimitReached = verified && quota !== null && quota.remaining <= 0;
  const blocked = limitReached || dailyLimitReached;
  const initial = (user?.displayName || user?.email || 'G').charAt(0);

  const saveFiles = useMemo(() => {
    if (!verified || !projectId) return undefined;
    return async (files: { path: string; content: string }[]) => {
      try {
        const r = await putFiles(user!.uid, projectId, files);
        toast.success(`Saved ${r.saved} file${r.saved === 1 ? '' : 's'} to the project${r.rejected ? ` (${r.rejected} rejected)` : ''}.`);
      } catch {
        toast.error('Could not save the files to your project.');
      }
    };
  }, [verified, projectId, user, toast]);

  const onProjectChange = async (id: string) => {
    const next = id || null;
    setProjectId(next);
    if (conversationId) await storage.patch(conversationId, { projectId: next }).catch(() => undefined);
  };

  const quotaLabel =
    quota === null
      ? null
      : guest
        ? `${Math.max(0, quota.remaining)} of ${quota.limit} free messages left`
        : isUnlimited(quota.limit)
          ? 'Unlimited messages'
          : `${Math.max(0, quota.remaining)} messages left today`;

  const empty = !loading && !notFound && messages.length === 0;
  const gate = (
    <>
      {limitReached ? (
        <SignupPrompt limit={quota?.limit ?? 5} />
      ) : dailyLimitReached ? (
        <DailyLimit key={resetsAt ?? 0} limit={quota?.limit ?? 0} resetsAt={resetsAt ?? nextUtcMidnight()} onExpire={() => void refresh()} />
      ) : unverified ? (
        <div className="mx-auto w-full max-w-3xl px-3 pb-5 sm:px-6">
          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <MailCheck size={20} className="mt-0.5 text-ink-200" />
              <div>
                <p className="text-sm font-medium text-ink-50">Verify your email to start chatting</p>
                <p className="text-xs text-ink-300">We sent a link to {me?.email}. It keeps your account and conversations secure.</p>
              </div>
            </div>
            <Link to="/verify-email" className="btn-primary btn-sm">Verify email</Link>
          </div>
        </div>
      ) : (
        <Composer
          streaming={streaming}
          maxAttachChars={Math.min(MAX_ATTACH_CHARS, Math.floor(maxChars * 0.8))}
          onSend={chat.send}
          onStop={chat.stop}
          prefill={empty ? prefill : null}
          toolbar={
            verified && projects.length > 0 ? (
              <label className="ml-1 inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-ink-300 hover:bg-ink-700">
                <FolderOpen size={15} className="shrink-0" />
                <select
                  value={projectId ?? ''}
                  onChange={(e) => void onProjectChange(e.target.value)}
                  className="max-w-[140px] truncate bg-transparent text-xs text-ink-200 focus:outline-none"
                  aria-label="Project context"
                >
                  <option value="" className="bg-ink-800">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-ink-800">{p.name}</option>
                  ))}
                </select>
              </label>
            ) : null
          }
        />
      )}
    </>
  );
  const errorBar = (
    <>
      {error && !blocked && (
        <div className="mx-auto w-full max-w-3xl px-3 pb-2 sm:px-6">
          <Notice tone="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error.message}</span>
              <span className="flex gap-2">
                {error.code === 'USAGE_LIMIT' && (
                  <Link to="/dashboard" className="btn-secondary btn-sm">View plans</Link>
                )}
                {error.code === 'EMAIL_NOT_VERIFIED' && (
                  <Link to="/verify-email" className="btn-secondary btn-sm">Verify email</Link>
                )}
                {['NETWORK_ERROR', 'STREAM_ERROR', 'AI_UPSTREAM_ERROR', 'EMPTY_RESPONSE', 'UNKNOWN', 'SAFETY_BLOCK'].includes(error.code) && messages.length > 0 && (
                  <button className="btn-secondary btn-sm" onClick={() => void chat.regenerate()}>Try again</button>
                )}
                <button className="btn-ghost btn-sm" onClick={chat.clearError}>Dismiss</button>
              </span>
            </div>
          </Notice>
        </div>
      )}

    </>
  );
  return (
    <FileViewerProvider>
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="min-w-0 truncate text-sm text-ink-200">{convMeta?.title ?? (conversationId ? '' : 'New conversation')}</div>
        {quotaLabel && (
          <span
            className={`shrink-0 rounded-full border px-3 py-1 text-xs ${!isUnlimited(quota!.limit) && quota!.remaining <= (guest ? 1 : 3) ? 'border-ink-100 text-ink-50' : 'border-ink-600 text-ink-300'}`}
            aria-live="polite"
            data-testid="message-counter"
          >
            {quotaLabel}
          </span>
        )}
      </div>


      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto pb-8">
          <div className="w-full max-w-3xl">
            <div className="mb-7 flex flex-col items-center px-5 text-center">
              <LogoMark size={44} />
              <h1 className="mt-5 font-display text-3xl text-ink-50 sm:text-4xl">What can I help you build?</h1>
              <p className="mt-2 max-w-md text-sm text-ink-300">
                {guest
                  ? `Start immediately. You have ${quota?.limit ?? 5} free messages, no account required.`
                  : 'Ask for complete programs, bug fixes, refactors or architecture. Attach files or a ZIP for project-aware help.'}
              </p>
            </div>
            {errorBar}
            {gate}
            <div className="mt-1 flex flex-wrap justify-center gap-2 px-4">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  onClick={() => setPrefill({ text: s.prompt, nonce: Date.now() })}
                  className="inline-flex items-center gap-2 rounded-full border border-ink-700 px-4 py-2 text-sm text-ink-200 transition hover:border-ink-400 hover:bg-ink-800 hover:text-ink-50"
                >
                  <s.icon size={15} className="text-ink-300" />
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-full items-center justify-center text-ink-300">
                <Spinner size={20} />
              </div>
            ) : notFound ? (
              <div className="mx-auto mt-20 max-w-md px-6 text-center">
                <h2 className="text-lg font-medium text-ink-50">Conversation not found</h2>
                <p className="mt-2 text-sm text-ink-300">It may have been deleted, expired after 7 days, or belongs to another account.</p>
                <Link to="/chat" className="btn-primary mt-5">Start a new conversation</Link>
              </div>
            ) : (
              <div className="pb-4 pt-2">
                {messages.map((m, i) => (
                  <MessageItem
                    key={m.id}
                    message={m}
                    isLast={i === messages.length - 1}
                    streaming={streaming}
                    initial={initial}
                    canEdit={!streaming && !blocked && !unverified}
                    onEdit={chat.editMessage}
                    onRegenerate={chat.regenerate}
                    onSaveFiles={saveFiles}
                  />
                ))}
              </div>
            )}
            {showJump && (
              <button
                onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })}
                className="sticky bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-ink-500 bg-ink-800 p-2 text-ink-100 shadow-glow hover:bg-ink-700"
                aria-label="Scroll to latest"
              >
                <ArrowDown size={16} />
              </button>
            )}
          </div>
          {errorBar}
          {gate}
        </>
      )}
    </div>
    </FileViewerProvider>
  );
}

function DailyLimit({ limit, resetsAt, onExpire }: { limit: number; resetsAt: number; onExpire: () => void }) {
  const left = useCountdown(resetsAt);
  const fired = useRef(false);
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      onExpire();
    }
  }, [left, onExpire]);
  const at = new Date(resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-5 sm:px-6">
      <div className="card animate-fade-up p-6 text-center" role="status" aria-live="polite">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-ink-500 bg-ink-800">
          <Clock size={18} />
        </div>
        <h3 className="mt-4 text-base font-medium text-ink-50">You have used all {limit > 0 ? limit : 'your'} messages for today</h3>
        <p className="mt-1 text-sm text-ink-300">You can chat again in</p>
        <div className="mt-2 font-mono text-4xl tracking-wider text-ink-50" data-testid="limit-countdown">{formatCountdown(left)}</div>
        <p className="mt-2 text-xs text-ink-400">Your allowance resets today at {at} (your local time).</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a href={PATREON_URL} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">Get Pro for unlimited chat</a>
          <Link to="/dashboard" className="btn-secondary btn-sm">View plans</Link>
        </div>
      </div>
    </div>
  );
}

function SignupPrompt({ limit }: { limit: number }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-5 sm:px-6">
      <div className="card animate-fade-up overflow-hidden">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink-500 bg-ink-800">
              <Lock size={18} />
            </div>
            <div>
              <h3 className="text-base font-medium text-ink-50">You have used your {limit} free messages</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-ink-300">
                Create a free Airtrohp account to keep going. Your conversation is saved and moves with you, and registered accounts get a daily allowance, history across devices, file projects and the option to upgrade.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
            <Link to="/register" className="btn-primary">Create account</Link>
            <Link to="/login" className="btn-ghost">I already have an account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
