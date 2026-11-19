import { useEffect, type ReactNode } from 'react';
import { Check, ChevronRight, Copy, Download, FileCode2 } from 'lucide-react';
import { useCopy } from '../../hooks/useMisc';
import { downloadText } from '../../lib/files';
import { extensionFor } from '../../lib/codeblocks';
import { getPrefs } from '../../lib/prefs';
import { useFileViewer } from './FileViewer';

interface Props {
  lang: string;
  path: string | null;
  raw: string;
  children?: ReactNode;
}

/** A code block that declares a file path: shown as a card that opens the file in the side viewer. */
function FileCard({ lang, path, raw }: { lang: string; path: string; raw: string }) {
  const viewer = useFileViewer();
  const [copied, copy] = useCopy();
  const lines = raw ? raw.split('\n').length : 0;
  const name = path.split('/').pop() || path;
  const isOpen = viewer.open?.path === path;

  // Keep an open viewer in sync while the file is still being streamed.
  useEffect(() => {
    if (viewer.open?.path === path && viewer.open.content !== raw) viewer.show({ path, lang, content: raw });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const openFile = () => viewer.show({ path, lang, content: raw });

  return (
    <div className={`my-4 overflow-hidden rounded-2xl border bg-ink-850 transition ${isOpen ? 'border-ink-300' : 'border-ink-600 hover:border-ink-400'}`}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <button type="button" onClick={openFile} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${path}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-600 bg-ink-800 text-ink-200">
            <FileCode2 size={17} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-mono text-[13px] text-ink-50" title={path}>{name}</span>
            <span className="block truncate text-xs text-ink-400">
              {path !== name ? `${path} · ` : ''}
              {lines} {lines === 1 ? 'line' : 'lines'}
              {lang ? ` · ${lang}` : ''}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void copy(raw)}
            className="rounded-lg p-2 text-ink-300 transition hover:bg-ink-700 hover:text-ink-50"
            aria-label={`Copy ${name}`}
            title="Copy"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button
            type="button"
            onClick={() => downloadText(path, raw)}
            className="rounded-lg p-2 text-ink-300 transition hover:bg-ink-700 hover:text-ink-50"
            aria-label={`Download ${name}`}
            title="Download"
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            onClick={openFile}
            className="inline-flex items-center gap-1 rounded-lg bg-ink-50 px-3 py-1.5 text-xs font-medium text-ink-950 transition hover:bg-white"
          >
            Open <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** A plain code snippet (no file path): shown inline with copy and download. */
function InlineBlock({ lang, raw, children }: { lang: string; raw: string; children?: ReactNode }) {
  const [copied, copy] = useCopy();
  const filename = `snippet.${extensionFor(lang)}`;
  return (
    <div className="group my-4 overflow-hidden rounded-xl border border-ink-600 bg-ink-900">
      <div className="flex items-center justify-between border-b border-ink-700 bg-ink-800 px-3.5 py-2">
        <span className="truncate font-mono text-xs text-ink-200">{lang || 'code'}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => downloadText(filename, raw)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-300 transition hover:bg-ink-700 hover:text-ink-50"
            title={`Download ${filename}`}
          >
            <Download size={14} />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            onClick={() => void copy(raw)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-300 transition hover:bg-ink-700 hover:text-ink-50"
            aria-label="Copy code"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <pre className={`p-4 text-[13px] leading-6 ${getPrefs().wrapCode ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto'}`}>
        <code className={`hljs font-mono ${lang ? `language-${lang}` : ''}`}>{children}</code>
      </pre>
    </div>
  );
}

const PLAIN_LANGS = new Set(['', 'text', 'txt', 'plaintext', 'log', 'console', 'output', 'bash-output']);

/** Short, stable id from the content so two unnamed blocks in one message get different names. */
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).slice(0, 5);
}

export function CodeBlock({ lang, path, raw, children }: Props) {
  if (path) return <FileCard lang={lang} path={path} raw={raw} />;
  // Longer code without a declared path is also shown as a downloadable file card.
  const lines = raw ? raw.split('\n').length : 0;
  if (lines >= 12 && !PLAIN_LANGS.has(lang.toLowerCase())) {
    return <FileCard lang={lang} path={`code-${shortHash(raw.slice(0, 200))}.${extensionFor(lang)}`} raw={raw} />;
  }
  return <InlineBlock lang={lang} raw={raw}>{children}</InlineBlock>;
}
