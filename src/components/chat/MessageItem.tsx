import { memo, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, Download, FileCode2, FolderDown, Pencil, RefreshCw } from 'lucide-react';
import { LogoMark } from '../ui/Logo';
import { Markdown } from './Markdown';
import { useCopy } from '../../hooks/useMisc';
import { extractFiles } from '../../lib/codeblocks';
import { downloadZip } from '../../lib/files';
import { formatBytes } from '../../lib/format';
import type { ChatMessage } from '../../lib/types';

interface Props {
  message: ChatMessage;
  isLast: boolean;
  streaming: boolean;
  initial: string;
  canEdit: boolean;
  onEdit: (id: string, text: string) => void;
  onRegenerate: () => void;
  onSaveFiles?: (files: { path: string; content: string }[]) => void;
}

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-300 transition hover:bg-ink-800 hover:text-ink-50"
    >
      {children}
    </button>
  );
}

function MessageItemImpl({ message, isLast, streaming, initial, canEdit, onEdit, onRegenerate, onSaveFiles }: Props) {
  const [copied, copy] = useCopy();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isUser = message.role === 'user';
  const active = streaming && isLast && !isUser;
  const files = useMemo(() => (isUser || active ? [] : extractFiles(message.content)), [isUser, active, message.content]);

  return (
    <article className="group animate-fade-in border-b border-ink-800/70 px-4 py-6 sm:px-6" aria-label={isUser ? 'Your message' : 'Airtrohp response'}>
      <div className="mx-auto flex max-w-3xl gap-4">
        <div className="mt-0.5 shrink-0">
          {isUser ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-ink-500 bg-ink-800 text-xs font-medium uppercase text-ink-100">{initial}</div>
          ) : (
            <LogoMark size={28} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.18em] text-ink-300">{isUser ? 'You' : 'Airtrohp'}</div>

          {isUser && editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(14, Math.max(3, draft.split('\n').length + 1))}
                className="input resize-y font-sans"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  className="btn-primary btn-sm"
                  disabled={!draft.trim()}
                  onClick={() => {
                    setEditing(false);
                    onEdit(message.id, draft);
                  }}
                >
                  Save and regenerate
                </button>
                <button className="btn-ghost btn-sm" onClick={() => { setEditing(false); setDraft(message.content); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : isUser ? (
            <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-ink-50">{message.content}</div>
          ) : message.content ? (
            <Markdown content={message.content} />
          ) : (
            <div className="flex items-center gap-1.5 py-2" aria-label="Airtrohp is thinking">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-blink rounded-full bg-ink-200" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
          )}

          {active && message.content && <span className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 animate-blink bg-ink-100" aria-hidden />}

          {message.files && message.files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.files.map((f) => (
                <span key={f.name} className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-xs text-ink-200" title={f.name}>
                  <FileCode2 size={13} />
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  <span className="text-ink-400">{formatBytes(f.size)}</span>
                </span>
              ))}
            </div>
          )}

          {!active && !editing && (message.content || isUser) && (
            <div className="mt-3 flex flex-wrap items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <IconBtn onClick={() => copy(message.content)} label="Copy message">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </IconBtn>
              {isUser && canEdit && (
                <IconBtn onClick={() => { setDraft(message.content); setEditing(true); }} label="Edit message">
                  <Pencil size={14} /> Edit
                </IconBtn>
              )}
              {!isUser && isLast && canEdit && (
                <IconBtn onClick={onRegenerate} label="Regenerate response">
                  <RefreshCw size={14} /> Regenerate
                </IconBtn>
              )}
              {files.length > 1 && (
                <IconBtn onClick={() => downloadZip('airtrohp-files.zip', files)} label="Download all files as ZIP">
                  <Download size={14} /> Download {files.length} files (.zip)
                </IconBtn>
              )}
              {files.length > 0 && onSaveFiles && (
                <IconBtn onClick={() => onSaveFiles(files)} label="Save files to project workspace">
                  <FolderDown size={14} /> Save to project
                </IconBtn>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export const MessageItem = memo(MessageItemImpl);
