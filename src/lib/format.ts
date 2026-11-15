export function newId(): string {
  const a = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 'New conversation';
  return t.length > 48 ? `${t.slice(0, 47)}…` : t;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatDate(ts: number): string {
  if (!ts) return '–';
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(ts);
}

export function friendlyAuthError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 8 characters).';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised for Google sign-in yet. Add it in Firebase Authentication, Settings, Authorized domains.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled yet. Enable the Google provider in Firebase Authentication.';
    case 'auth/account-exists-with-different-credential':
      return 'An account with this email already exists. Log in with your password instead.';
    case 'auth/requires-recent-login':
      return 'Please sign in again to do that.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
