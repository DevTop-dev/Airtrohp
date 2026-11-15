import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { Notice, Spinner } from '../components/ui/Feedback';
import { useAuth } from '../context/AuthContext';
import { friendlyAuthError } from '../lib/format';
import { useDocTitle } from '../hooks/useMisc';
import { isConfigured } from '../lib/config';

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-[calc(100vh-var(--devtop-h))] items-center justify-center overflow-hidden px-4 py-12">
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-[400px] animate-fade-up">
        <div className="mb-8 flex justify-center">
          <Logo size={34} />
        </div>
        <div className="card p-7 sm:p-8">
          <h1 className="font-display text-3xl text-ink-50">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-300">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-ink-300">{footer}</div>}
        <p className="mt-8 text-center text-xs text-ink-400">
          <Link to="/chat" className="hover:text-ink-100">Continue as guest</Link> · <Link to="/" className="hover:text-ink-100">Back to home</Link>
        </p>
      </div>
    </div>
  );
}

function ConfigWarning() {
  if (isConfigured) return null;
  return (
    <Notice tone="error" className="mb-4">
      Airtrohp is not configured yet. Set the VITE_FIREBASE_* and VITE_API_URL environment variables (see README).
    </Notice>
  );
}

export function LoginPage() {
  useDocTitle('Log in');
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      const next = params.get('next');
      nav(next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat', { replace: true });
    } catch (err) {
      setError(friendlyAuthError((err as { code?: string }).code ?? ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to continue with Airtrohp."
      footer={<>New to Airtrohp? <Link to="/register" className="text-ink-50 underline underline-offset-4">Create an account</Link></>}
    >
      <ConfigWarning />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link to="/reset-password" className="mb-1.5 text-xs text-ink-300 hover:text-ink-50">Forgot password?</Link>
          </div>
          <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Log in'}</button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  useDocTitle('Create account');
  const { signUp } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await signUp(email.trim(), password, name);
      nav('/verify-email', { replace: true });
    } catch (err) {
      setError(friendlyAuthError((err as { code?: string }).code ?? ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free to start. Your guest conversation is saved to your account."
      footer={<>Already registered? <Link to="/login" className="text-ink-50 underline underline-offset-4">Log in</Link></>}
    >
      <ConfigWarning />
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" autoComplete="name" required maxLength={60} className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mt-1.5 text-xs text-ink-400">At least 8 characters.</p>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Create account'}</button>
        <p className="text-center text-xs text-ink-400">We will email you a link to verify your address.</p>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  useDocTitle('Reset password');
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/user-not-found') setSent(true); // do not reveal which emails exist
      else setError(friendlyAuthError(code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="We will email you a secure link." footer={<Link to="/login" className="text-ink-50 underline underline-offset-4">Back to log in</Link>}>
      {sent ? (
        <Notice tone="success">If an account exists for {email}, a reset link is on its way. Check your inbox and spam folder.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Send reset link'}</button>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmailPage() {
  useDocTitle('Verify email');
  const { user, loading, resendVerification, refresh, signOut } = useAuth();
  const nav = useNavigate();
  const [cooldown, setCooldown] = useState(0);
  const [msg, setMsg] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav('/login', { replace: true });
  }, [loading, user, nav]);

  useEffect(() => {
    if (user?.emailVerified) nav('/chat', { replace: true });
  }, [user?.emailVerified, nav]);

  // Poll so the page advances automatically after the user clicks the email link
  useEffect(() => {
    if (!user || user.emailVerified) return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [user, refresh]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setMsg('');
    try {
      await resendVerification();
      setMsg('Verification email sent.');
      setCooldown(45);
    } catch (e) {
      setMsg(friendlyAuthError((e as { code?: string }).code ?? ''));
      setCooldown(15);
    }
  };

  const check = async () => {
    setChecking(true);
    setMsg('');
    const me = await refresh();
    setChecking(false);
    if (me && !me.emailVerified) setMsg('Not verified yet. Click the link in the email, then try again.');
  };

  return (
    <AuthShell title="Check your inbox" subtitle="One more step to secure your account.">
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-ink-600 bg-ink-900 p-4">
        <MailCheck size={20} className="mt-0.5 shrink-0 text-ink-200" />
        <p className="text-sm leading-6 text-ink-200">
          We sent a verification link to <span className="text-ink-50">{user?.email}</span>. Open it, then come back here. This page continues automatically.
        </p>
      </div>
      {msg && <Notice className="mb-4">{msg}</Notice>}
      <div className="space-y-3">
        <button className="btn-primary w-full" onClick={() => void check()} disabled={checking}>{checking ? <Spinner /> : 'I have verified my email'}</button>
        <button className="btn-secondary w-full" onClick={() => void resend()} disabled={cooldown > 0}>
          {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend verification email'}
        </button>
        <button className="btn-ghost w-full" onClick={() => void signOut().then(() => nav('/'))}>Use a different account</button>
      </div>
    </AuthShell>
  );
}
