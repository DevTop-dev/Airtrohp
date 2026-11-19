import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowUp, FileCode2, Paperclip, Square, X } from 'lucide-react';
import { readFiles } from '../../lib/files';
import { formatBytes } from '../../lib/format';
import { getPrefs } from '../../lib/prefs';
import type { AttachedFile } from '../../lib/types';
import { useToast } from '../../context/ToastContext';
import { ModelPicker } from './ModelPicker';

interface Props {
  streaming: boolean;
  disabled?: boolean;
  disabledReason?: string;
  maxAttachChars: number;
  toolbar?: ReactNode;
  onSend: (text: string, files: AttachedFile[]) => void | Promise<void>;
  onStop: () => void;
  prefill?: { text: string; nonce: number } | null;
}

const ACCEPT = '.zip,.js,.jsx,.mjs,.cjs,.ts,.tsx,.json,.html,.css,.scss,.md,.txt,.py,.php,.java,.kt,.swift,.c,.h,.cpp,.hpp,.cs,.go,.rs,.sql,.sh,.yml,.yaml,.toml,.xml,.vue,.svelte,.env,.csv,.dockerfile,text/*';

export function Composer({ streaming, disabled, disabledReason, maxAttachChars, toolbar, onSend, onStop, prefill }: Props) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (prefill) {
      setText(prefill.text);
      ta.current?.focus();
    }
  }, [prefill]);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const total = files.reduce((n, f) => n + f.content.length, 0);

  const addFiles = useCallback(
    async (list: File[]) => {
      if (!list.length) return;
      setBusy(true);
      try {
        const r = await readFiles(list);
        let used = files.reduce((n, f) => n + f.content.length, 0);
        const accepted: AttachedFile[] = [];
        let over = 0;
        for (const f of r.files) {
          if (used + f.content.length > maxAttachChars) {
            over++;
            continue;
          }
          used += f.content.length;
          accepted.push(f);
        }
        setFiles((prev) => {
          const names = new Set(accepted.map((a) => a.name));
          return [...prev.filter((p) => !names.has(p.name)), ...accepted];
        });
        if (over) toast.error(`${over} file(s) skipped: attachments are limited to ${Math.round(maxAttachChars / 1000)}k characters on your plan.`);
        if (r.skipped.length) {
          const first = r.skipped.slice(0, 2).map((s) => `${s.name} (${s.reason})`).join(', ');
          toast.info(`Skipped ${r.skipped.length} file(s): ${first}${r.skipped.length > 2 ? '…' : ''}`);
        }
        if (accepted.length) toast.success(`Attached ${accepted.length} file${accepted.length > 1 ? 's' : ''}.`);
      } finally {
        setBusy(false);
      }
    },
    [files, maxAttachChars, toast],
  );

  const submit = async () => {
    if (streaming || disabled || busy) return;
    if (!text.trim() && files.length === 0) return;
    const t = text;
    const f = files;
    setText('');
    setFiles([]);
    await onSend(t, f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void addFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-6 sm:pb-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`rounded-[30px] border bg-ink-800 shadow-soft transition ${drag ? 'border-ink-100' : 'border-ink-700 focus-within:border-ink-500'}`}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-ink-700 px-3 pb-2 pt-3">
            {files.map((f) => (
              <span key={f.name} className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 py-1 pl-2 pr-1 font-mono text-xs text-ink-100">
                <FileCode2 size={13} />
                <span className="max-w-[160px] truncate" title={f.name}>{f.name}</span>
                <span className="text-ink-400">{formatBytes(f.size)}</span>
                <button className="rounded p-0.5 text-ink-300 hover:bg-ink-600 hover:text-ink-50" onClick={() => setFiles((p) => p.filter((x) => x.name !== f.name))} aria-label={`Remove ${f.name}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <span className="self-center text-xs text-ink-400">{Math.round(total / 1000)}k / {Math.round(maxAttachChars / 1000)}k chars</span>
          </div>
        )}

        <textarea
          ref={ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              const enterToSend = getPrefs().enterToSend;
              if (enterToSend || e.metaKey || e.ctrlKey) {
                e.preventDefault();
                void submit();
              }
            }
          }}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? disabledReason ?? 'Chat unavailable' : 'Message Airtrohp'}
          className="block max-h-[220px] w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[15px] leading-6 text-ink-50 placeholder-ink-400 focus:outline-none disabled:cursor-not-allowed"
          aria-label="Message Airtrohp"
        />

        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={disabled || busy}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-300 transition hover:bg-ink-700 hover:text-ink-50 disabled:opacity-40"
              aria-label="Attach files or a ZIP project"
              title="Attach files or a ZIP project"
            >
              <Paperclip size={17} />
            </button>
            <input
              ref={input}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <ModelPicker disabled={disabled || streaming} />
            {toolbar}
          </div>
          {streaming ? (
            <button onClick={onStop} className="inline-flex h-9 items-center gap-2 rounded-full bg-ink-50 px-4 text-xs font-medium text-ink-950 transition hover:bg-white" aria-label="Stop generating">
              <Square size={12} fill="currentColor" /> Stop
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={disabled || busy || (!text.trim() && files.length === 0)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink-50 text-ink-950 transition hover:bg-white disabled:bg-ink-600 disabled:text-ink-400"
              aria-label="Send message"
            >
              <ArrowUp size={17} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-ink-400">Airtrohp can make mistakes. Review generated code before running it.</p>
    </div>
  );
}
