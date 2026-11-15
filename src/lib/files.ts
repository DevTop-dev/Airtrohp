import { unzipSync, zipSync, strToU8 } from 'fflate';
import {
  MAX_FILE_CHARS,
  MAX_ZIP_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED,
} from './config';
import type { AttachedFile } from './types';

const TEXT_EXT = new Set(
  (
    'js jsx mjs cjs ts tsx json jsonc html htm css scss sass less md mdx txt py pyi ipynb rb php java kt kts swift c h cc cpp hpp cxx cs go rs ' +
    'sql sh bash zsh ps1 bat cmd yml yaml toml ini cfg conf env xml svg vue svelte astro dart lua r scala gradle properties lock csv tsv ' +
    'graphql gql prisma proto tf dockerfile makefile gitignore editorconfig eslintrc prettierrc npmrc log'
  ).split(' '),
);
const TEXT_NAMES = new Set(['dockerfile', 'makefile', 'procfile', 'license', 'readme', 'gemfile', 'rakefile', '.gitignore', '.env.example', '.editorconfig']);
const IGNORED_DIRS = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.cache/', '__pycache__/', 'vendor/', '.venv/', 'venv/', 'target/', '.idea/', '.vscode/'];

export function isTextName(name: string): boolean {
  const base = name.split('/').pop()?.toLowerCase() ?? '';
  if (TEXT_NAMES.has(base)) return true;
  const dot = base.lastIndexOf('.');
  return dot >= 0 && TEXT_EXT.has(base.slice(dot + 1));
}

/** Rejects absolute paths, drive letters, traversal and control characters. */
export function safePath(raw: string): string | null {
  const p = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!p || p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..') || /[\u0000-\u001f]/.test(p)) return null;
  if (p.length > 240) return null;
  return p;
}

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null; // binary
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export interface ReadResult {
  files: AttachedFile[];
  skipped: { name: string; reason: string }[];
}

/**
 * Safely extracts a ZIP in the browser. Nothing is executed: entries are filtered by path, extension and size
 * BEFORE decompression, limits protect against zip bombs, and only valid UTF-8 text files are kept.
 */
export function extractZip(data: Uint8Array): ReadResult {
  const out: ReadResult = { files: [], skipped: [] };
  let entries = 0;
  let declaredTotal = 0;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(data, {
      filter: (f) => {
        entries++;
        if (entries > MAX_ZIP_ENTRIES) return false;
        if (f.name.endsWith('/')) return false;
        const path = safePath(f.name);
        if (!path) {
          out.skipped.push({ name: f.name, reason: 'unsafe path' });
          return false;
        }
        const lower = path.toLowerCase();
        if (IGNORED_DIRS.some((d) => lower.startsWith(d) || lower.includes('/' + d))) return false;
        if (!isTextName(path)) {
          out.skipped.push({ name: path, reason: 'not a supported text/code file' });
          return false;
        }
        if (f.originalSize > MAX_FILE_CHARS * 4) {
          out.skipped.push({ name: path, reason: 'file too large' });
          return false;
        }
        declaredTotal += f.originalSize;
        if (declaredTotal > MAX_ZIP_UNCOMPRESSED) return false;
        return true;
      },
    });
  } catch {
    out.skipped.push({ name: 'archive', reason: 'could not read this ZIP file' });
    return out;
  }
  if (entries > MAX_ZIP_ENTRIES) out.skipped.push({ name: 'archive', reason: `only the first ${MAX_ZIP_ENTRIES} entries were considered` });
  for (const [name, bytes] of Object.entries(unzipped)) {
    const path = safePath(name);
    if (!path) continue;
    const text = decodeText(bytes);
    if (text === null) out.skipped.push({ name: path, reason: 'binary or not UTF-8' });
    else if (text.length > MAX_FILE_CHARS) out.skipped.push({ name: path, reason: 'file too large' });
    else out.files.push({ name: path, content: text, size: text.length });
  }
  return out;
}

export async function readFiles(list: File[]): Promise<ReadResult> {
  const out: ReadResult = { files: [], skipped: [] };
  for (const file of list) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      if (file.size > MAX_ZIP_BYTES) {
        out.skipped.push({ name: file.name, reason: `ZIP larger than ${MAX_ZIP_BYTES / 1024 / 1024} MB` });
        continue;
      }
      const r = extractZip(new Uint8Array(await file.arrayBuffer()));
      out.files.push(...r.files);
      out.skipped.push(...r.skipped);
      continue;
    }
    if (!isTextName(file.name) && !file.type.startsWith('text/')) {
      out.skipped.push({ name: file.name, reason: 'not a supported text/code file' });
      continue;
    }
    if (file.size > MAX_FILE_CHARS * 4) {
      out.skipped.push({ name: file.name, reason: 'file too large' });
      continue;
    }
    const text = decodeText(new Uint8Array(await file.arrayBuffer()));
    if (text === null) out.skipped.push({ name: file.name, reason: 'binary or not UTF-8' });
    else if (text.length > MAX_FILE_CHARS) out.skipped.push({ name: file.name, reason: 'file too large' });
    else out.files.push({ name: file.name, content: text, size: text.length });
  }
  return out;
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(name: string, content: string) {
  downloadBlob(name.split('/').pop() || 'file.txt', new Blob([content], { type: 'text/plain;charset=utf-8' }));
}

export function downloadZip(zipName: string, files: { path: string; content: string }[]) {
  const tree: Record<string, Uint8Array> = {};
  for (const f of files) {
    const p = safePath(f.path);
    if (p) tree[p] = strToU8(f.content);
  }
  const zipped = zipSync(tree);
  downloadBlob(zipName, new Blob([zipped as BlobPart], { type: 'application/zip' }));
}

export async function sha256Short(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}
