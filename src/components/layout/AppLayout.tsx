import { useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Logo } from '../ui/Logo';
import { StorageProvider } from '../../context/StorageContext';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  return (
    <StorageProvider>
      <div className="app-h flex overflow-hidden bg-ink-950">
        {/* desktop sidebar */}
        <aside className="hidden w-72 shrink-0 border-r border-ink-800 lg:block">
          <Sidebar onNavigate={() => undefined} />
        </aside>

        {/* mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-[250] lg:hidden">
            <div className="absolute inset-0 animate-fade-in bg-black/70" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-[84vw] max-w-[320px] animate-fade-in border-r border-ink-700 shadow-glow">
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-ink-800 px-3 py-2.5 lg:hidden">
            <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-200 hover:bg-ink-800" aria-label="Open menu">
              <Menu size={20} />
            </button>
            <Logo size={24} />
          </header>
          <main className="min-h-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </StorageProvider>
  );
}

/** Scrolling container for non-chat pages inside the app layout. */
export function PageShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl text-ink-50">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-ink-300">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}
