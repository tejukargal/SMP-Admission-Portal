// Admin-side CRUD for the `circulars` collection — uses the primary `db` and
// `storage` (admin/staff Firebase Auth session). Attachments live in Firebase
// Storage at circulars/{circularId}/{ts}_{name}; the tokenized download URL is
// stored on the doc so students can download without a Storage SDK/auth.
// Student-facing reads live in studentPortalService.ts.
import {
  collection, doc, deleteDoc, deleteField, onSnapshot, orderBy, query, setDoc, updateDoc,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, uploadString, getDownloadURL, deleteObject,
} from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage, app } from '../config/firebase';
import type { Circular, StoredAttachment } from '../types';

const COL = 'circulars';
const functions = getFunctions(app, 'asia-south1');

/** An AI-generated background image held in memory, not yet uploaded to Storage. */
export interface PendingBackground {
  base64: string;
  mimeType: string;
}

export interface GenerateBackgroundInput {
  title: string;
  subject: string;
  department: string;
  bodySnippet: string;
}

/** Calls the generateCircularBackground Cloud Function — returns image bytes only, nothing is persisted yet. */
export async function generateCircularBackground(input: GenerateBackgroundInput): Promise<PendingBackground> {
  const fn = httpsCallable<GenerateBackgroundInput, { imageBase64: string; mimeType: string }>(
    functions,
    'generateCircularBackground',
  );
  const result = await fn(input);
  return { base64: result.data.imageBase64, mimeType: result.data.mimeType };
}

/** Uploads an accepted AI-generated background and returns its download URL. */
export async function uploadCircularBackground(circularId: string, background: PendingBackground): Promise<string> {
  const ext = background.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const path = `circularBackgrounds/${circularId}/background.${ext}`;
  const sref = storageRef(storage, path);
  await uploadString(sref, background.base64, 'base64', { contentType: background.mimeType });
  return getDownloadURL(sref);
}

/** Generates-and-saves a background for an already-existing circular (the admin list's "Generate/Regenerate Background" action). */
export async function setCircularBackground(id: string, background: PendingBackground): Promise<string> {
  const url = await uploadCircularBackground(id, background);
  await updateDoc(doc(db, COL, id), { backgroundImageUrl: url, updatedAt: new Date().toISOString() });
  return url;
}

export type CircularAiProvider = 'claude' | 'gemini';
export type CircularAiLanguage = 'english' | 'kannada' | 'both';

export interface GenerateCircularDraftInput {
  brief: string;
  keyDates?: string;
  provider: CircularAiProvider;
  language: CircularAiLanguage;
}

export interface CircularDraft {
  title: string;
  subject: string;
  department?: string;
  bodyHtml: string;
}

/** Calls the generateCircularDraft Cloud Function — returns a draft only, nothing is saved until the admin reviews it in the form. */
export async function generateCircularDraft(input: GenerateCircularDraftInput): Promise<CircularDraft> {
  const fn = httpsCallable<GenerateCircularDraftInput, CircularDraft>(functions, 'generateCircularDraft');
  const result = await fn(input);
  return result.data;
}

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
  data: Omit<Circular, 'id' | 'createdAt' | 'attachments' | 'backgroundImageUrl'>,
  files: File[],
  pendingBackground?: PendingBackground,
): Promise<string> {
  const ref = doc(collection(db, COL));
  const attachments: StoredAttachment[] = [];
  for (const file of files) {
    attachments.push(await uploadAttachment(`circulars/${ref.id}`, file));
  }
  const backgroundImageUrl = pendingBackground ? await uploadCircularBackground(ref.id, pendingBackground) : undefined;
  await setDoc(ref, {
    ...data,
    attachments,
    createdAt: new Date().toISOString(),
    ...(backgroundImageUrl ? { backgroundImageUrl } : {}),
  });
  return ref.id;
}

export async function updateCircular(
  id: string,
  data: Pick<Circular, 'title' | 'date' | 'subject' | 'department' | 'body'>,
  keptAttachments: StoredAttachment[],
  newFiles: File[],
  removedPaths: string[],
  pendingBackground?: PendingBackground,
): Promise<void> {
  const attachments = [...keptAttachments];
  for (const file of newFiles) {
    attachments.push(await uploadAttachment(`circulars/${id}`, file));
  }
  const backgroundImageUrl = pendingBackground ? await uploadCircularBackground(id, pendingBackground) : undefined;
  await updateDoc(doc(db, COL, id), {
    ...data,
    attachments,
    updatedAt: new Date().toISOString(),
    ...(backgroundImageUrl ? { backgroundImageUrl } : {}),
  });
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
