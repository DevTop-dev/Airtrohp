import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Splash } from '../ui/Feedback';

/** Signed-in + email verified. (The Worker re-checks all of this on every API call.) */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  return <Outlet />;
}

/** UI convenience only: administrator rights are enforced by the Worker, never by this check. */
export function RequireAdmin() {
  const { me, loading } = useAuth();
  if (loading) return <Splash />;
  if (!me?.isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Redirects signed-in users away from login/register pages. */
export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user?.emailVerified) return <Navigate to="/chat" replace />;
  return <Outlet />;
}
