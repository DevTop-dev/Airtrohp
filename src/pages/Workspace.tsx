import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, FileCode2, FolderGit2, MessageSquare, Plus, Trash2, Upload } from 'lucide-react';
import clsx from 'clsx';
import { PageShell } from '../components/layout/AppLayout';
import { EmptyState, Notice, Spinner } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { MAX_PROJECT_FILES } from '../lib/config';
import { downloadText, downloadZip, readFiles } from '../lib/files';
import { formatBytes, relativeTime } from '../lib/format';
import { createProject, deleteFile, deleteProject, listFiles, listProjects, putFiles } from '../lib/workspace';
import { useDocTitle } from '../hooks/useMisc';
import type { Project, ProjectFile } from '../lib/types';

export default function Workspace() {
  useDocTitle('Workspace');
  const { user } = useAuth();
  const uid = user!.uid;
  const toast = useToast();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<ProjectFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reloadProjects = useCallback(async () => {
    try {
      const list = await listProjects(uid);
      setProjects(list);
      setSelected((cur) => (cur && list.some((p) => p.id === cur) ? cur : list[0]?.id ?? null));
    } catch {
      setProjects([]);
      toast.error('Could not load your projects.');
    }
  }, [uid, toast]);

  const reloadFiles = useCallback(
    async (pid: string) => {
      setFilesLoading(true);
      try {
        setFiles(await listFiles(uid, pid));
      } catch {
        toast.error('Could not load project files.');
      } finally {
        setFilesLoading(false);
      }
    },
    [uid, toast],
  );

  useEffect(() => {
    void reloadProjects();
  }, [reloadProjects]);
  useEffect(() => {
    if (selected) void reloadFiles(selected);
    else setFiles([]);
  }, [selected, reloadFiles]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const id = await createProject(uid, newName);
      setNewName('');
      await reloadProjects();
      setSelected(id);
    } catch {
      toast.error('Could not create the project.');
    }
  };

  const upload = async (list: File[]) => {
    if (!selected || !list.length) return;
    setUploading(true);
    try {
      const r = await readFiles(list);
      if (r.files.length) {
        const res = await putFiles(uid, selected, r.files.map((f) => ({ path: f.name, content: f.content })));
        toast.success(`Added ${res.saved} file${res.saved === 1 ? '' : 's'}${res.rejected ? `, ${res.rejected} rejected (limit ${MAX_PROJECT_FILES} files)` : ''}.`);
      }
      if (r.skipped.length) toast.info(`Skipped ${r.skipped.length}: ${r.skipped.slice(0, 2).map((s) => `${s.name} (${s.reason})`).join(', ')}${r.skipped.length > 2 ? '…' : ''}`);
      await Promise.all([reloadFiles(selected), reloadProjects()]);
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const current = projects?.find((p) => p.id === selected) ?? null;

  return (
    <PageShell title="Workspace" subtitle="Keep project files in your account and give Airtrohp full project context in any chat.">
      {projects === null ? (
        <div className="flex justify-center py-20 text-ink-300"><Spinner size={22} /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-4">
            <form onSubmit={create} className="flex gap-2">
              <input className="input" placeholder="New project name" value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} aria-label="New project name" />
              <button className="btn-primary shrink-0 !px-3" aria-label="Create project" disabled={!newName.trim()}><Plus size={16} /></button>
            </form>
            {projects.length === 0 ? (
              <p className="px-1 text-sm text-ink-400">No projects yet.</p>
            ) : (
              <ul className="space-y-1">
                {projects.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelected(p.id)}
                      className={clsx('w-full rounded-lg px-3 py-2.5 text-left transition', p.id === selected ? 'bg-ink-700 text-ink-50' : 'text-ink-200 hover:bg-ink-800')}
                    >
                      <div className="truncate text-sm">{p.name}</div>
                      <div className="text-xs text-ink-400">{p.fileCount} files · {relativeTime(p.updatedAt)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section>
            {!current ? (
              <EmptyState icon={<FolderGit2 size={28} />} title="Create your first project">
                Projects hold your code files so every chat can see them. Add a project on the left, then upload files or a ZIP.
              </EmptyState>
            ) : (
              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 p-5">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-medium text-ink-50">{current.name}</h2>
                    <p className="text-xs text-ink-400">{files.length} / {MAX_PROJECT_FILES} files</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/chat?project=${current.id}`} className="btn-primary btn-sm"><MessageSquare size={14} /> Chat with project</Link>
                    <button className="btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={uploading}>
                      {uploading ? <Spinner /> : <Upload size={14} />} Upload
                    </button>
                    <button className="btn-secondary btn-sm" disabled={!files.length} onClick={() => downloadZip(`${current.name.replace(/[^\w.-]+/g, '_')}.zip`, files.map((f) => ({ path: f.path, content: f.content })))}>
                      <Download size={14} /> ZIP
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setConfirmDelete(true)} aria-label="Delete project"><Trash2 size={14} /></button>
                    <input ref={input} type="file" multiple accept=".zip,text/*,.js,.jsx,.ts,.tsx,.json,.html,.css,.md,.py,.php,.java,.kt,.swift,.c,.h,.cpp,.cs,.go,.rs,.sql,.sh,.yml,.yaml,.toml,.xml,.vue,.env" className="hidden"
                      onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
                  </div>
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)); }}
                  className="min-h-[220px]"
                >
                  {filesLoading ? (
                    <div className="flex justify-center py-16 text-ink-300"><Spinner size={20} /></div>
                  ) : files.length === 0 ? (
                    <div className="px-6 py-16 text-center text-sm text-ink-300">
                      Drop files or a ZIP here, or use Upload.<br />
                      <span className="text-xs text-ink-400">Text and code files only. ZIPs are filtered and read as text, nothing is executed.</span>
                    </div>
                  ) : (
                    <ul className="divide-y divide-ink-800">
                      {files.map((f) => (
                        <li key={f.id} className="group flex items-center gap-3 px-5 py-3 hover:bg-ink-800/60">
                          <FileCode2 size={15} className="shrink-0 text-ink-300" />
                          <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink-100" title={f.path}>{f.path}</span>
                          <span className="shrink-0 text-xs text-ink-400">{formatBytes(f.size)}</span>
                          <button className="rounded p-1.5 text-ink-300 hover:bg-ink-700 hover:text-ink-50" onClick={() => setViewing(f)} aria-label={`View ${f.path}`}><Eye size={14} /></button>
                          <button className="rounded p-1.5 text-ink-300 hover:bg-ink-700 hover:text-ink-50" onClick={() => downloadText(f.path, f.content)} aria-label={`Download ${f.path}`}><Download size={14} /></button>
                          <button
                            className="rounded p-1.5 text-ink-300 hover:bg-ink-700 hover:text-ink-50"
                            onClick={async () => { await deleteFile(uid, current.id, f.id).catch(() => toast.error('Could not delete the file.')); await Promise.all([reloadFiles(current.id), reloadProjects()]); }}
                            aria-label={`Delete ${f.path}`}
                          ><Trash2 size={14} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {current && <Notice className="mt-4">In chat, pick this project from the folder menu in the message box. Project files are sent to Airtrohp as context, up to your plan’s limit.</Notice>}
          </section>
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.path ?? ''} wide>
        <pre className="overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-4 font-mono text-[12.5px] leading-6 text-ink-200">{viewing?.content}</pre>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this project?">
        <p className="text-sm text-ink-200">“{current?.name}” and all of its files will be permanently removed.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button
            className="btn-primary"
            onClick={async () => {
              if (!current) return;
              setConfirmDelete(false);
              await deleteProject(uid, current.id).catch(() => toast.error('Could not delete the project.'));
              await reloadProjects();
            }}
          >Delete project</button>
        </div>
      </Modal>
    </PageShell>
  );
}
