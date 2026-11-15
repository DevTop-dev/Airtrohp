import type { ReactNode } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { useCopy } from '../../hooks/useMisc';
import { downloadText } from '../../lib/files';
import { extensionFor } from '../../lib/codeblocks';
import { getPrefs } from '../../lib/prefs';

export function CodeBlock({ lang, path, raw, children }: { lang: string; path: string | null; raw: string; children?: ReactNode }) {
  const [copied, copy] = useCopy();
  const filename = path ?? `snippet.${extensionFor(lang)}`;
  return (
    <div className="group my-4 overflow-hidden rounded-xl border border-ink-600 bg-ink-900">
      <div className="flex items-center justify-between border-b border-ink-700 bg-ink-800 px-3.5 py-2">
        <span className="truncate font-mono text-xs text-ink-200">{path ?? (lang || 'code')}</span>
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
            onClick={() => copy(raw)}
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
