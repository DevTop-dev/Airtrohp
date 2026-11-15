import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { LogoMark } from './Logo';
import clsx from 'clsx';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={clsx('animate-spin', className)} aria-label="Loading" />;
}

/** Full-screen Airtrohp loading screen. */
export function Splash({ label = 'Loading Airtrohp' }: { label?: string }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 bg-ink-950">
      <div className="animate-blink">
        <LogoMark size={44} />
      </div>
      <p className="text-xs uppercase tracking-[0.25em] text-ink-300">{label}</p>
    </div>
  );
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'error' | 'success'; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-lg border px-3.5 py-2.5 text-sm leading-6',
        tone === 'error' ? 'border-ink-300 bg-ink-800 text-ink-50' : tone === 'success' ? 'border-ink-500 bg-ink-800 text-ink-100' : 'border-ink-600 bg-ink-850 text-ink-200',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-600 px-6 py-14 text-center">
      {icon && <div className="text-ink-300">{icon}</div>}
      <h3 className="text-base font-medium text-ink-50">{title}</h3>
      {children && <div className="max-w-sm text-sm text-ink-300">{children}</div>}
    </div>
  );
}
