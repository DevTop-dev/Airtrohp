import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { sha256Short, safePath } from './files';
import { MAX_PROJECT_FILES } from './config';
import type { Project, ProjectFile } from './types';

const projects = (uid: string) => collection(db, 'users', uid, 'projects');
const files = (uid: string, pid: string) => collection(db, 'users', uid, 'projects', pid, 'files');

export async function listProjects(uid: string): Promise<Project[]> {
  const snap = await getDocs(query(projects(uid), orderBy('updatedAt', 'desc')));
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      name: String(x.name ?? 'Untitled project'),
      createdAt: Number(x.createdAt ?? 0),
      updatedAt: Number(x.updatedAt ?? 0),
      fileCount: Number(x.fileCount ?? 0),
    };
  });
}

export async function createProject(uid: string, name: string): Promise<string> {
  const now = Date.now();
  const ref = await addDoc(projects(uid), { name: name.trim().slice(0, 80) || 'Untitled project', createdAt: now, updatedAt: now, fileCount: 0 });
  return ref.id;
}

export async function listFiles(uid: string, pid: string): Promise<ProjectFile[]> {
  const snap = await getDocs(query(files(uid, pid), orderBy('path', 'asc')));
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, path: String(x.path), content: String(x.content ?? ''), size: Number(x.size ?? 0) };
  });
}

async function recount(uid: string, pid: string) {
  const snap = await getDocs(files(uid, pid));
  await updateDoc(doc(projects(uid), pid), { fileCount: snap.size, updatedAt: Date.now() });
  return snap.size;
}

export async function putFiles(uid: string, pid: string, incoming: { path: string; content: string }[]): Promise<{ saved: number; rejected: number }> {
  const existing = await getDocs(files(uid, pid));
  const existingIds = new Set(existing.docs.map((d) => d.id));
  let saved = 0;
  let rejected = 0;
  let total = existing.size;
  for (const f of incoming) {
    const path = safePath(f.path);
    if (!path) {
      rejected++;
      continue;
    }
    const id = await sha256Short(path);
    if (!existingIds.has(id)) {
      if (total >= MAX_PROJECT_FILES) {
        rejected++;
        continue;
      }
      total++;
      existingIds.add(id);
    }
    await setDoc(doc(files(uid, pid), id), { path, content: f.content, size: f.content.length, updatedAt: Date.now() });
    saved++;
  }
  await recount(uid, pid);
  return { saved, rejected };
}

export async function deleteFile(uid: string, pid: string, fileId: string) {
  await deleteDoc(doc(files(uid, pid), fileId));
  await recount(uid, pid);
}

export async function deleteProject(uid: string, pid: string) {
  const snap = await getDocs(files(uid, pid));
  for (const d of snap.docs) await deleteDoc(d.ref);
  await deleteDoc(doc(projects(uid), pid));
}

export async function renameProject(uid: string, pid: string, name: string) {
  await updateDoc(doc(projects(uid), pid), { name: name.trim().slice(0, 80) || 'Untitled project', updatedAt: Date.now() });
}
