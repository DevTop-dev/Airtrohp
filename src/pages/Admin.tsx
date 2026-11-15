import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, CircleOff, RefreshCw, Users } from 'lucide-react';
import { PageShell } from '../components/layout/AppLayout';
import { Notice, Spinner } from '../components/ui/Feedback';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';
import { useDocTitle } from '../hooks/useMisc';

interface Stats {
  users: { total: number; free: number; pro: number; ultimate: number };
  guests: { sessions: number; requests: number };
  requests: { total: number; registered: number; guest: number };
  tokens: { input: number; output: number };
  daily: { day: string; guestRequests: number; userRequests: number }[];
}
interface Status {
  time: string;
  checks: Record<string, boolean>;
  models: { standard: string; advanced: string };
}
interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  createdAt: number;
  lastSeenAt: number;
  disabled: boolean;
  tier: string;
  source: string;
  status: string;
}

const CHECK_LABELS: Record<string, string> = {
  geminiKeyConfigured: 'Gemini API key (Worker secret)',
  firebaseServiceAccountConfigured: 'Firebase service account',
  appSecretConfigured: 'App secret (32+ chars)',
  firestoreReachable: 'Firestore reachable',
  patreonOAuthConfigured: 'Patreon OAuth',
  patreonWebhookConfigured: 'Patreon webhook secret',
  patreonCampaignConfigured: 'Patreon campaign ID',
  adminConfigured: 'Admin access list',
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 font-display text-4xl text-ink-50">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
    </div>
  );
}

export default function Admin() {
  useDocTitle('Admin');
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, st, u] = await Promise.all([
        api<Stats>('/api/admin/stats'),
        api<Status>('/api/admin/status'),
        api<{ users: AdminUser[]; nextPageToken?: string }>('/api/admin/users'),
      ]);
      setStats(s);
      setStatus(st);
      setUsers(u.users);
      setNext(u.nextPageToken);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (uid: string, body: { action: string; tier?: string }) => {
    setActing(uid);
    try {
      await api(`/api/admin/users/${encodeURIComponent(uid)}`, { method: 'POST', body });
      toast.success('Done.');
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setActing(null);
    }
  };

  const more = async () => {
    if (!next) return;
    const u = await api<{ users: AdminUser[]; nextPageToken?: string }>(`/api/admin/users?pageToken=${encodeURIComponent(next)}`);
    setUsers((x) => [...x, ...u.users]);
    setNext(u.nextPageToken);
  };

  const maxDaily = Math.max(1, ...(stats?.daily ?? []).map((d) => d.guestRequests + d.userRequests));

  return (
    <PageShell
      title="Administration"
      subtitle="Platform usage, accounts and system status. Access is enforced by the Worker."
      actions={<button className="btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>{loading ? <Spinner /> : <RefreshCw size={14} />} Refresh</button>}
    >
      {error && <Notice tone="error" className="mb-6">{error}</Notice>}
      {!stats && loading && <div className="flex justify-center py-20 text-ink-300"><Spinner size={22} /></div>}

      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total users" value={formatNumber(stats.users.total)} sub="registered accounts" />
            <Stat label="Subscribers" value={formatNumber(stats.users.pro + stats.users.ultimate)} sub={`${stats.users.pro} Pro · ${stats.users.ultimate} Ultimate · ${stats.users.free} Free`} />
            <Stat label="AI requests" value={formatNumber(stats.requests.total)} sub={`${formatNumber(stats.requests.registered)} registered · ${formatNumber(stats.requests.guest)} guest`} />
            <Stat label="Guest sessions" value={formatNumber(stats.guests.sessions)} sub={`${formatNumber(stats.guests.requests)} guest requests`} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <section className="card p-6 lg:col-span-2">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-50"><Activity size={16} /> Requests, last 14 days</div>
              <div className="mt-6 flex h-36 items-end gap-1.5">
                {stats.daily.map((d) => {
                  const total = d.guestRequests + d.userRequests;
                  return (
                    <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.userRequests} registered, ${d.guestRequests} guest`}>
                      <div className="w-full rounded-sm bg-ink-500" style={{ height: `${(d.guestRequests / maxDaily) * 100}%` }} />
                      <div className="w-full rounded-sm bg-ink-100" style={{ height: `${(d.userRequests / maxDaily) * 100}%`, minHeight: total === 0 ? 2 : undefined, opacity: total === 0 ? 0.25 : 1 }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-5 text-xs text-ink-300">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-ink-100" /> Registered</span>
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-ink-500" /> Guest</span>
                <span className="ml-auto">Tokens: {formatNumber(stats.tokens.input)} in / {formatNumber(stats.tokens.output)} out</span>
              </div>
            </section>

            <section className="card p-6">
              <p className="text-sm font-medium text-ink-50">System status</p>
              <ul className="mt-4 space-y-2.5">
                {status && Object.entries(status.checks).map(([k, ok]) => (
                  <li key={k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink-200">{CHECK_LABELS[k] ?? k}</span>
                    {ok ? <CheckCircle2 size={16} className="shrink-0 text-ink-50" aria-label="OK" /> : <CircleOff size={16} className="shrink-0 text-ink-400" aria-label="Not configured" />}
                  </li>
                ))}
              </ul>
              {status && <p className="mt-5 border-t border-ink-700 pt-4 text-xs text-ink-400">Models: {status.models.standard} (Free) · {status.models.advanced} (Pro)</p>}
            </section>
          </div>

          <section className="card mt-5 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-ink-700 px-6 py-4 text-sm font-medium text-ink-50"><Users size={16} /> Accounts</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-ink-400">
                  <tr><th className="px-6 py-3 font-medium">User</th><th className="px-3 py-3 font-medium">Plan</th><th className="px-3 py-3 font-medium">Joined</th><th className="px-3 py-3 font-medium">Last seen</th><th className="px-6 py-3 text-right font-medium">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                  {users.map((u) => (
                    <tr key={u.uid} className={u.disabled ? 'opacity-50' : ''}>
                      <td className="px-6 py-3"><div className="text-ink-50">{u.displayName || '–'}</div><div className="text-xs text-ink-400">{u.email}</div></td>
                      <td className="px-3 py-3">
                        <select
                          className="rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-ink-100"
                          value={u.tier}
                          disabled={acting === u.uid}
                          onChange={(e) => void act(u.uid, { action: 'set_tier', tier: e.target.value })}
                          aria-label={`Plan for ${u.email}`}
                        >
                          <option value="free">Free</option><option value="pro">Pro</option><option value="ultimate">Ultimate</option>
                        </select>
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-ink-400">{u.source === 'none' ? '' : u.source}</div>
                      </td>
                      <td className="px-3 py-3 text-ink-300">{formatDate(u.createdAt)}</td>
                      <td className="px-3 py-3 text-ink-300">{formatDate(u.lastSeenAt)}</td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button className="btn-ghost btn-sm" disabled={acting === u.uid} onClick={() => void act(u.uid, { action: 'reset_usage' })}>Reset today</button>
                          <button className="btn-secondary btn-sm" disabled={acting === u.uid} onClick={() => void act(u.uid, { action: u.disabled ? 'enable' : 'disable' })}>{u.disabled ? 'Enable' : 'Disable'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-ink-400">No users yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {next && <div className="border-t border-ink-700 p-4 text-center"><button className="btn-ghost btn-sm" onClick={() => void more()}>Load more</button></div>}
          </section>
        </>
      )}
    </PageShell>
  );
}
