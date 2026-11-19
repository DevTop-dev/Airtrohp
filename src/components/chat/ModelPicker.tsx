import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { AUTO, getSelectedProvider, setSelectedProvider, useModels, type AiModel } from '../../lib/models';

/**
 * Icon for an AI. If you put an image at /public/logos/<id>.svg (or .png) it is shown; otherwise a neutral monogram badge.
 * ids: auto, gemini, groq, cerebras, openrouter, mistral, workers-ai
 */
export function ModelIcon({ id, name, size = 20 }: { id: string; name: string; size?: number }) {
  const [step, setStep] = useState(0); // 0: svg, 1: png, 2: monogram
  const box = { width: size, height: size };
  if (step < 2) {
    return (
      <img
        src={`/logos/${id}.${step === 0 ? 'svg' : 'png'}`}
        alt=""
        style={box}
        className="shrink-0 rounded-md object-contain"
        onError={() => setStep((s) => s + 1)}
      />
    );
  }
  return (
    <span
      style={{ ...box, fontSize: Math.round(size * 0.55) }}
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-ink-500 bg-gradient-to-b from-ink-600 to-ink-700 font-semibold leading-none text-ink-50"
      aria-hidden
    >
      {id === 'auto' ? '✦' : name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Dropdown in the composer that lists every connected AI and lets the user pick one. */
export function ModelPicker({ disabled }: { disabled?: boolean }) {
  const models = useModels();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(getSelectedProvider());
  const root = useRef<HTMLDivElement>(null);
  const all: AiModel[] = [AUTO, ...models];
  const current = all.find((m) => m.id === selected) ?? AUTO;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: string) => {
    setSelected(id);
    setSelectedProvider(id);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-full pl-2 pr-2.5 text-xs font-medium text-ink-200 transition hover:bg-ink-700 hover:text-ink-50 disabled:opacity-40"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Choose which AI answers"
      >
        <ModelIcon id={current.id} name={current.name} size={18} />
        <span className="max-w-[110px] truncate">{current.name}</span>
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 z-30 mb-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-600 bg-ink-850 p-1.5 shadow-glow animate-fade-in"
        >
          <p className="px-3 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">Choose an AI</p>
          {all.map((m) => (
            <button
              key={m.id}
              role="option"
              aria-selected={m.id === current.id}
              type="button"
              onClick={() => pick(m.id)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-ink-700"
            >
              <ModelIcon id={m.id} name={m.name} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-50">{m.name}</span>
                <span className="block truncate text-xs text-ink-400">{m.model}</span>
              </span>
              {m.id === current.id && <Check size={16} className="shrink-0 text-ink-100" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
