import { safePath } from './files';

export interface CodeFile {
  lang: string;
  path: string;
  content: string;
}

/** Parses `file=path`, `path=path` or `title="path"` out of a fence info string. */
export function pathFromMeta(meta: string | undefined | null): string | null {
  if (!meta) return null;
  const m = /(?:file|path|title|filename)\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))/i.exec(meta);
  const raw = m?.[1] ?? m?.[2] ?? m?.[3];
  return raw ? safePath(raw) : null;
}

/** Extracts fenced code blocks that declare a file path, so users can download or save them. */
export function extractFiles(markdown: string): CodeFile[] {
  const out: CodeFile[] = [];
  const re = /^```([^\s`]*)[ \t]*([^\n`]*)\n([\s\S]*?)^```[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const path = pathFromMeta(m[2]);
    if (path) out.push({ lang: m[1], path, content: m[3].replace(/\n$/, '') });
  }
  // keep only the latest version of a path
  const map = new Map<string, CodeFile>();
  for (const f of out) map.set(f.path, f);
  return [...map.values()];
}

const EXT: Record<string, string> = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', tsx: 'tsx', jsx: 'jsx', python: 'py', py: 'py', html: 'html', css: 'css',
  json: 'json', bash: 'sh', sh: 'sh', shell: 'sh', sql: 'sql', go: 'go', rust: 'rs', rs: 'rs', java: 'java', kotlin: 'kt', swift: 'swift',
  c: 'c', cpp: 'cpp', csharp: 'cs', cs: 'cs', php: 'php', yaml: 'yml', yml: 'yml', toml: 'toml', markdown: 'md', md: 'md', vue: 'vue',
};

export function extensionFor(lang: string): string {
  return EXT[lang.toLowerCase()] ?? 'txt';
}
