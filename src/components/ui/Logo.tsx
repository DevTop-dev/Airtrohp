import { Link } from 'react-router-dom';
import clsx from 'clsx';

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0a0a0a" />
      <rect x=".5" y=".5" width="31" height="31" rx="7.5" fill="none" stroke="#3a3a3a" />
      <path d="M16 6.5 25.5 25.5h-4.6L16 15.6l-4.9 9.9H6.5z" fill="#f4f4f4" />
      <circle cx="16" cy="22.6" r="1.7" fill="#0a0a0a" />
    </svg>
  );
}

export function Logo({ to = '/', size = 28, className, wordmark = true }: { to?: string; size?: number; className?: string; wordmark?: boolean }) {
  return (
    <Link to={to} className={clsx('inline-flex items-center gap-2.5 text-ink-50', className)} aria-label="Airtrohp home">
      <LogoMark size={size} />
      {wordmark && <span className="text-[17px] font-medium tracking-[0.02em]">Airtrohp</span>}
    </Link>
  );
}
