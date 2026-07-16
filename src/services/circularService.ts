// Admin-side CRUD for the `circulars` collection — uses the primary `db` and
// `storage` (admin/staff Firebase Auth session). Attachments live in Firebase
// Storage at circulars/{circularId}/{ts}_{name}; the tokenized download URL is
// stored on the doc so students can download without a Storage SDK/auth.
// Student-facing reads live in studentPortalService.ts.
import {
  collection, doc, deleteDoc, deleteField, onSnapshot, orderBy, query, setDoc, updateDoc,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage';
import { db, storage } from '../config/firebase';
import type { Circular, StoredAttachment } from '../types';

const COL = 'circulars';

// Shared with the attachment UI — keep in sync with storage.rules.
export const ATTACHMENT_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'text/csv'];
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5MB — matches storage.rules
export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.csv';

export function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_');
}

/** Uploads one file under the given folder and returns its StoredAttachment record. */
export async function uploadAttachment(folder: string, file: File): Promise<StoredAttachment> {
  const path = `${folder}/${Date.now()}_${sanitizeFileName(file.name)}`;
  const sref = storageRef(storage, path);
  await uploadBytes(sref, file);
  const url = await getDownloadURL(sref);
  return { name: file.name, type: file.type, size: file.size, url, storagePath: path };
}

async function deleteAttachmentFile(path: string): Promise<void> {
  try { await deleteObject(storageRef(storage, path)); } catch { /* ignore — file may already be gone */ }
}

/** Live-subscribes to the circulars list, newest first. Returns an unsubscribe function. */
export function subscribeToCirculars(onChange: (circulars: Circular[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Circular)));
  });
}

export async function createCircular(
  data: Omit<Circular, 'id' | 'createdAt' | 'attachments'>,
  files: File[],
): Promise<void> {
  const ref = doc(collection(db, COL));
  const attachments: StoredAttachment[] = [];
  for (const file of files) {
    attachments.push(await uploadAttachment(`circulars/${ref.id}`, file));
  }
  await setDoc(ref, { ...data, attachments, createdAt: new Date().toISOString() });
}

export async function updateCircular(
  id: string,
  data: Pick<Circular, 'title' | 'date' | 'subject' | 'department' | 'body'>,
  keptAttachments: StoredAttachment[],
  newFiles: File[],
  removedPaths: string[],
): Promise<void> {
  const attachments = [...keptAttachments];
  for (const file of newFiles) {
    attachments.push(await uploadAttachment(`circulars/${id}`, file));
  }
  await updateDoc(doc(db, COL, id), { ...data, attachments, updatedAt: new Date().toISOString() });
  for (const path of removedPaths) await deleteAttachmentFile(path);
}

export async function deleteCircular(circular: Circular): Promise<void> {
  await deleteDoc(doc(db, COL, circular.id));
  for (const att of circular.attachments ?? []) await deleteAttachmentFile(att.storagePath);
}

/** Unpublish — hides the circular from all students but keeps the doc for admin review. Reversible via publishCircular. */
export async function unpublishCircular(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { archivedAt: new Date().toISOString() });
}

/** Publish — makes a previously-unpublished circular visible to students again. */
export async function publishCircular(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { archivedAt: deleteField() });
}

/** Pin — shows this circular first in the student portal's Circulars tab, ahead of date sorting. */
export async function pinCircular(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { pinned: true });
}

/** Unpin — returns the circular to normal date-based sorting. */
export async function unpinCircular(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { pinned: deleteField() });
}
