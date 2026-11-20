import { useEffect, useState } from 'react';
import { Download, MoreVertical, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function platform(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

/** "Install app" button: installs Airtrohp as an app straight from the browser (no app store). Hidden once installed. */
export function InstallApp({ className = 'btn-secondary w-full gap-2' }: { className?: string }) {
  const [, force] = useState(0);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  if (typeof window === 'undefined' || isStandalone()) return null;

  const click = async () => {
    if (deferred) {
      const ev = deferred;
      deferred = null;
      await ev.prompt().catch(() => undefined);
      await ev.userChoice.catch(() => undefined);
      force((n) => n + 1);
    } else {
      setHelp(true);
    }
  };

  const p = platform();
  return (
    <>
      <button type="button" onClick={() => void click()} className={className}>
        <Download size={15} /> Install app
      </button>

      {help && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setHelp(false)} role="dialog" aria-modal="true" aria-label="Install Airtrohp">
          <div className="w-full max-w-sm rounded-3xl border border-ink-600 bg-ink-850 p-5 shadow-glow" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink-50">Install Airtrohp</h2>
                <p className="mt-0.5 text-xs text-ink-400">Add it to your home screen. No app store needed.</p>
              </div>
              <button type="button" onClick={() => setHelp(false)} className="rounded-lg p-1.5 text-ink-300 hover:bg-ink-700" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {p === 'ios' && (
              <ol className="space-y-2.5 text-sm text-ink-200">
                <li>1. Open this page in <b>Safari</b>.</li>
                <li className="flex flex-wrap items-center gap-1.5">2. Tap the <Share size={15} className="inline" /> <b>Share</b> button.</li>
                <li>3. Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
              </ol>
            )}
            {p === 'android' && (
              <ol className="space-y-2.5 text-sm text-ink-200">
                <li>1. Open this page in <b>Chrome</b>.</li>
                <li className="flex flex-wrap items-center gap-1.5">2. Tap the <MoreVertical size={15} className="inline" /> menu at the top right.</li>
                <li>3. Choose <b>Install app</b> (or <b>Add to Home screen</b>).</li>
              </ol>
            )}
            {p === 'other' && (
              <ol className="space-y-2.5 text-sm text-ink-200">
                <li>1. Use <b>Chrome</b> or <b>Edge</b> on your computer.</li>
                <li>2. Click the <b>install icon</b> at the right end of the address bar, or open the browser menu.</li>
                <li>3. Choose <b>Install Airtrohp</b>.</li>
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}
