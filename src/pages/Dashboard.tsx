import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ExternalLink, FolderGit2, LogOut, MessageSquare, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { PageShell } from '../components/layout/AppLayout';
import { PlanCards } from '../components/ui/PlanCards';
import { Notice, Spinner } from '../components/ui/Feedback';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';
import { PATREON_URL, isUnlimited } from '../lib/config';
import { useDocTitle, usePublicConfig } from '../hooks/useMisc';
import type { UsageDay } from '../lib/types';

function UsageBars({ days }: { days: UsageDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.requests));
  return (
    <div className="flex h-28 items-end gap-1.5" role="img" aria-label="AI requests over the last 14 days">
      {days.map((d) => (
        <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
          <div
            className="min-h-[3px] w-full rounded-sm bg-ink-200 transition group-hover:bg-white"
            style={{ height: `${Math.max(3, (d.requests / max) * 100)}%`, opacity: d.requests === 0 ? 0.25 : 1 }}
          />
          <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded border border-ink-600 bg-ink-800 px-2 py-0.5 text-[10px] text-ink-100 group-hover:block">
            {d.day.slice(5)}: {d.requests}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  useDocTitle('Dashboard');
  const { user, me, meError, refresh, signOut } = useAuth();
  const { config } = usePublicConfig();
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [days, setDays] = useState<UsageDay[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadUsage = () => api<{ days: UsageDay[] }>('/api/usage').then((r) => setDays(r.days)).catch(() => setDays([]));
  useEffect(() => {
    void loadUsage();
  }, []);

  // Returning from Patreon OAuth
  useEffect(() => {
    const p = params.get('patreon');
    if (!p) return;
    if (p === 'connected') {
      toast.success('Patreon connected. Your membership was verified.');
      void refresh();
    } else {
      const reason = params.get('reason');
      toast.error(
        reason === 'PATREON_ALREADY_LINKED'
          ? 'That Patreon account is already linked to another Airtrohp account.'
          : reason === 'cancelled'
            ? 'Patreon connection cancelled.'
            : 'Could not connect Patreon. Please try again.',
      );
    }
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total14 = useMemo(() => (days ?? []).reduce((n, d) => n + d.requests, 0), [days]);
  const tokens14 = useMemo(() => (days ?? []).reduce((n, d) => n + d.inputTokens + d.outputTokens, 0), [days]);

  const connect = async () => {
    setBusy('connect');
    try {
      const r = await api<{ url: string }>('/api/patreon/connect', { method: 'POST' });
      window.location.assign(r.url);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not start the Patreon connection.');
      setBusy(null);
    }
  };
  const sync = async () => {
    setBusy('sync');
    try {
      await api('/api/patreon/sync', { method: 'POST' });
      await refresh();
      toast.success('Membership re-verified with Patreon.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not verify your membership.');
    } finally {
      setBusy(null);
    }
  };
  const disconnect = async () => {
    setBusy('disconnect');
    try {
      await api('/api/patreon/disconnect', { method: 'POST' });
      await refresh();
      toast.success('Patreon disconnected.');
    } catch {
      toast.error('Could not disconnect Patreon.');
    } finally {
      setBusy(null);
    }
  };

  if (!me) {
    return (
      <PageShell title="Dashboard">
        {meError ? <Notice tone="error">{meError}</Notice> : <div className="flex justify-center py-20 text-ink-300"><Spinner size={22} /></div>}
      </PageShell>
    );
  }

  const used = me.usage.usedToday;
  const limit = me.limits.dailyMessages;
  const unlimited = isUnlimited(limit);
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  return (
    <PageShell
      title={`Hello, ${(user?.displayName || me.displayName || 'there').split(' ')[0]}`}
      subtitle="Your Airtrohp account, usage and membership."
      actions={
        <div className="flex gap-2">
          <Link to="/chat" className="btn-primary btn-sm"><MessageSquare size={14} /> New chat</Link>
          <Link to="/workspace" className="btn-secondary btn-sm"><FolderGit2 size={14} /> Workspace</Link>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Profile */}
        <section className="card p-6">
          <p className="eyebrow">Profile</p>
          <div className="mt-5 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-ink-500 bg-ink-800 font-display text-2xl uppercase">
              {(user?.displayName || me.email).charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-medium text-ink-50">{user?.displayName || 'Airtrohp user'}</div>
              <div className="truncate text-sm text-ink-300">{me.email}</div>
            </div>
          </div>
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-300">Plan</dt><dd className="text-ink-50">{me.tierName}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-300">Email</dt><dd className="flex items-center gap-1.5 text-ink-50"><ShieldCheck size={14} /> {me.emailVerified ? 'Verified' : 'Not verified'}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-300">Member since</dt><dd className="text-ink-50">{formatDate(user?.metadata.creationTime ? Date.parse(user.metadata.creationTime) : 0)}</dd></div>
          </dl>
          <div className="mt-6 flex gap-2">
            <Link to="/settings" className="btn-secondary btn-sm flex-1">Settings</Link>
            <button className="btn-ghost btn-sm" onClick={() => void signOut().then(() => nav('/'))}><LogOut size={14} /> Log out</button>
          </div>
        </section>

        {/* Usage */}
        <section className="card p-6 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow">Today’s usage</p>
              <div className="mt-4 flex items-baseline gap-2">
                {unlimited ? (
                  <>
                    <span className="font-display text-5xl text-ink-50">Unlimited</span>
                    <span className="text-sm text-ink-300">messages ({formatNumber(used)} used today)</span>
                  </>
                ) : (
                  <>
                    <span className="font-display text-5xl text-ink-50">{formatNumber(me.usage.remainingToday)}</span>
                    <span className="text-sm text-ink-300">of {formatNumber(limit)} messages left</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right text-xs text-ink-300">{unlimited ? 'Fair-use rate limit applies' : 'Resets daily at 00:00 UTC'}</div>
          </div>
          <div className={`mt-5 h-1.5 overflow-hidden rounded-full bg-ink-700 ${unlimited ? 'hidden' : ''}`} role="progressbar" aria-valuenow={used} aria-valuemax={limit} aria-label="Daily usage">
            <div className="h-full rounded-full bg-ink-50 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-ink-700 pt-5 text-sm">
            <div><div className="text-ink-300">Last 14 days</div><div className="mt-1 text-lg text-ink-50">{days ? formatNumber(total14) : '…'}</div><div className="text-xs text-ink-400">requests</div></div>
            <div><div className="text-ink-300">Tokens</div><div className="mt-1 text-lg text-ink-50">{days ? formatNumber(tokens14) : '…'}</div><div className="text-xs text-ink-400">last 14 days</div></div>
            <div><div className="text-ink-300">Context limit</div><div className="mt-1 text-lg text-ink-50">{Math.round(me.limits.maxContextChars / 1000)}k</div><div className="text-xs text-ink-400">characters</div></div>
          </div>
          <div className="mt-6">{days ? <UsageBars days={days} /> : <div className="h-28 animate-pulse rounded bg-ink-800" />}</div>
        </section>
      </div>

      {/* Membership */}
      <section className="mt-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Membership</p>
            <h2 className="mt-2 font-display text-3xl text-ink-50">
              {me.tier === 'free' ? 'You are on the Free plan' : `You are on ${me.tierName}`}
            </h2>
            {me.membership.source === 'patreon' && me.tier !== 'free' && me.membership.expiresAt && (
              <p className="mt-1 text-sm text-ink-300">Verified with Patreon. Access is re-checked automatically.</p>
            )}
            {me.membership.source === 'admin' && <p className="mt-1 text-sm text-ink-300">Plan assigned by an Airtrohp administrator.</p>}
            {me.membership.status === 'declined' && <p className="mt-1 text-sm text-ink-100">Your last Patreon payment was declined, so Pro access is paused until it succeeds.</p>}
          </div>
          {me.membership.patreonLinked && (
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" onClick={() => void sync()} disabled={busy !== null}>{busy === 'sync' ? <Spinner /> : <RefreshCw size={14} />} Re-verify</button>
              <button className="btn-ghost btn-sm" onClick={() => void disconnect()} disabled={busy !== null}>{busy === 'disconnect' ? <Spinner /> : <Unplug size={14} />} Disconnect Patreon</button>
            </div>
          )}
        </div>

        {!config.patreonEnabled && (
          <Notice className="mb-5">Patreon billing is not configured on this deployment yet, so upgrading is unavailable. See the README (Patreon section) to enable it.</Notice>
        )}

        <PlanCards
          config={config}
          currentTier={me.tier}
          renderAction={(t, isCurrent) => {
            if (isCurrent) return <button className="btn-secondary w-full" disabled>Current plan</button>;
            if (!t.enabled) return <button className="btn-secondary w-full" disabled>Coming soon</button>;
            if (t.id === 'free') return <button className="btn-secondary w-full" disabled>Included</button>;
            return (
              <div className="space-y-2">
                {config.patreonJoinUrl ?? PATREON_URL ? (
                  <a href={config.patreonJoinUrl ?? PATREON_URL} target="_blank" rel="noopener noreferrer" className="btn-primary w-full">Get Pro on Patreon <ExternalLink size={14} /></a>
                ) : (
                  <button className="btn-primary w-full" disabled>Upgrade unavailable</button>
                )}
                {config.patreonEnabled && !me.membership.patreonLinked && (
                  <button className="btn-ghost w-full" onClick={() => void connect()} disabled={busy !== null}>
                    {busy === 'connect' ? <Spinner /> : 'Already a patron? Connect Patreon'}
                  </button>
                )}
              </div>
            );
          }}
        />
        <p className="mt-4 text-xs text-ink-400">After pledging on Patreon, choose “Connect Patreon” so Airtrohp can verify your membership directly with Patreon. Pro is activated from the verified result, never from the browser.</p>
      </section>
    </PageShell>
  );
}
