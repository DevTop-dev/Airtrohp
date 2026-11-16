import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import hljs from 'highlight.js/lib/common';
import { Check, Copy, Download, X } from 'lucide-react';
import { useCopy } from '../../hooks/useMisc';
import { downloadText } from '../../lib/files';

export interface ViewerFile {
  path: string;
  lang: string;
  content: string;
}

interface ViewerCtx {
  open: ViewerFile | null;
  show: (f: ViewerFile) => void;
  close: () => void;
}

const Ctx = createContext<ViewerCtx | null>(null);

const NOOP: ViewerCtx = { open: null, show: () => undefined, close: () => undefined };

export function useFileViewer(): ViewerCtx {
  return useContext(Ctx) ?? NOOP;
}

export function FileViewerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ViewerFile | null>(null);
  const show = useCallback((f: ViewerFile) => setOpen(f), []);
  const close = useCallback(() => setOpen(null), []);
  const value = useMemo(() => ({ open, show, close }), [open, show, close]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <FileViewerPanel />
    </Ctx.Provider>
  );
}

const EXT_LANG: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', html: 'xml', htm: 'xml', xml: 'xml', vue: 'xml', svelte: 'xml', css: 'css', scss: 'scss', json: 'json',
  md: 'markdown', sh: 'bash', bash: 'bash', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', rs: 'rust', go: 'go',
  java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php',
  sql: 'sql', rb: 'ruby', env: 'ini', dockerfile: 'dockerfile',
};

function languageFor(path: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) return lang;
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  return EXT_LANG[ext] ?? '';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlight(code: string, language: string): string {
  if (code.length > 80_000) return escapeHtml(code);
  try {
    if (language) return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

function FileViewerPanel() {
  const { open, close } = useFileViewer();
  const [copied, copy] = useCopy();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const content = open?.content ?? '';
  const path = open?.path ?? '';
  const lang = open?.lang ?? '';
  const language = languageFor(path, lang);
  const html = useMemo(() => (content ? highlight(content, language) : ''), [content, language]);

  if (!open) return null;
  const lines = content.split('\n').length;
  const name = path.split('/').pop() || path;

  return (
    <div className="fixed inset-0 z-[260]" role="dialog" aria-modal="true" aria-label={`File ${path}`}>
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={close} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[860px] animate-fade-in flex-col border-l border-ink-700 bg-ink-900 shadow-glow">
        <header className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-mono text-sm text-ink-50" title={path}>{name}</div>
            <div className="truncate text-xs text-ink-400">
              {path !== name ? `${path} · ` : ''}
              {lines} {lines === 1 ? 'line' : 'lines'}
              {language ? ` · ${language}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => void copy(content)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-200 transition hover:bg-ink-700 hover:text-ink-50"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => downloadText(path, content)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-200 transition hover:bg-ink-700 hover:text-ink-50"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button onClick={close} className="rounded-lg p-2 text-ink-300 transition hover:bg-ink-700 hover:text-ink-50" aria-label="Close file">
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex min-w-max font-mono text-[13px] leading-6">
            <div className="sticky left-0 select-none bg-ink-900 px-3 py-4 text-right text-ink-500" aria-hidden>
              {Array.from({ length: lines }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre className="m-0 py-4 pr-6">
              <code className="hljs !bg-transparent !p-0" dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
          </div>
        </div>
      </aside>
    </div>
  );
}
