import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`card relative z-10 max-h-[85vh] w-full animate-fade-up overflow-hidden ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
          <h2 className="text-sm font-medium text-ink-50">{title}</h2>
          <button onClick={onClose} className="text-ink-300 transition hover:text-ink-50" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(85vh-60px)] overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}
