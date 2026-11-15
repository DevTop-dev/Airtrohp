import { Link } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';
import { useDocTitle } from '../hooks/useMisc';

export default function NotFound() {
  useDocTitle('Page not found');
  return (
    <div className="flex min-h-[calc(100vh-var(--devtop-h))] flex-col items-center justify-center px-5 text-center">
      <Logo size={36} />
      <p className="mt-10 font-display text-8xl text-ink-500">404</p>
      <h1 className="mt-4 text-xl font-medium text-ink-50">This page does not exist</h1>
      <p className="mt-2 text-sm text-ink-300">The link may be broken or the page may have moved.</p>
      <div className="mt-8 flex gap-3">
        <Link to="/" className="btn-secondary">Home</Link>
        <Link to="/chat" className="btn-primary">Open chat</Link>
      </div>
    </div>
  );
}
