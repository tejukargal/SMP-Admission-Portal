// Admin-side CRUD for the `circulars` collection — uses the primary `db` and
// `storage` (admin/staff Firebase Auth session). Attachments live in Firebase
// Storage at circulars/{circularId}/{ts}_{name}; the tokenized download URL is
// stored on the doc so students can download without a Storage SDK/auth.
// Student-facing reads live in studentPortalService.ts.
import {
  collection, doc, deleteDoc, deleteField, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, uploadString, getDownloadURL, deleteObject,
} from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage, app } from '../config/firebase';
import { imageExtensionFor, imageUploadMetadata } from './imageUpload';
import type { Circular, StoredAttachment, StudentCircularState } from '../types';

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
  // Timestamped so a regenerated background lands at a new path (and so a
  // new download URL) — the student app caches images by URL, and an
  // overwritten object keeps its old token, which would serve the stale image.
  const path = `circularBackgrounds/${circularId}/background-${Date.now()}.${imageExtensionFor(background.mimeType)}`;
  const sref = storageRef(storage, path);
  await uploadString(sref, background.base64, 'base64', imageUploadMetadata(background.mimeType));
  return getDownloadURL(sref);
}

/** Generates-and-saves a background for an already-existing circular (the admin list's "Generate/Regenerate Background" action). */
export async function setCircularBackground(id: string, background: PendingBackground): Promise<string> {
  const url = await uploadCircularBackground(id, background);
  await updateDoc(doc(db, COL, id), { backgroundImageUrl: url, updatedAt: new Date().toISOString() });
  return url;
}

export interface CircularReminderInput {
  circularId: string;
  title: string;
  body: string;
  audience: 'all' | 'unseen';
  /** true = only count recipients, send nothing. */
  dryRun?: boolean;
}

/** Calls sendCircularReminder — re-notifies students about a Live circular (or, with dryRun, just counts them). */
export async function sendCircularReminder(input: CircularReminderInput): Promise<{ students: number; devices: number; sent: boolean }> {
  const fn = httpsCallable<CircularReminderInput, { students: number; devices: number; sent: boolean }>(functions, 'sendCircularReminder');
  const result = await fn(input);
  return result.data;
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

/** Lifecycle fields chosen in the form. `archivedAt` set = Draft (or Scheduled with publishAt). */
export interface CircularPublishing {
  draft: boolean;
  publishAt?: string;
  expiresOn?: string;
  notify: boolean;
}

export async function createCircular(
  data: Pick<Circular, 'title' | 'date' | 'subject' | 'department' | 'body' | 'createdBy'>,
  files: File[],
  publishing: CircularPublishing,
  pendingBackground?: PendingBackground,
  /** Reuse an existing background URL (Duplicate) when no new one was generated. */
  existingBackgroundUrl?: string,
): Promise<string> {
  const ref = doc(collection(db, COL));
  const attachments: StoredAttachment[] = [];
  for (const file of files) {
    attachments.push(await uploadAttachment(`circulars/${ref.id}`, file));
  }
  const backgroundImageUrl = pendingBackground
    ? await uploadCircularBackground(ref.id, pendingBackground)
    : existingBackgroundUrl;
  const now = new Date().toISOString();
  // Firestore rejects `undefined` values, so optional fields are spread in only when set.
  await setDoc(ref, {
    ...data,
    attachments,
    createdAt: now,
    notify: publishing.notify,
    ...(publishing.draft ? { archivedAt: now } : {}),
    ...(publishing.draft && publishing.publishAt ? { publishAt: publishing.publishAt } : {}),
    ...(publishing.expiresOn ? { expiresOn: publishing.expiresOn } : {}),
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
  /** null clears the field; publishAt is only honoured while the circular is a Draft/Scheduled. */
  schedule: { expiresOn: string | null; publishAt?: string | null; notify?: boolean },
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
    expiresOn: schedule.expiresOn ?? deleteField(),
    ...(schedule.publishAt !== undefined ? { publishAt: schedule.publishAt ?? deleteField() } : {}),
    ...(schedule.notify !== undefined ? { notify: schedule.notify } : {}),
    ...(backgroundImageUrl ? { backgroundImageUrl } : {}),
  });
  for (const path of removedPaths) await deleteAttachmentFile(path);
}

export async function deleteCircular(circular: Circular): Promise<void> {
  await deleteDoc(doc(db, COL, circular.id));
  for (const att of circular.attachments ?? []) await deleteAttachmentFile(att.storagePath);
}

export async function bulkDeleteCirculars(list: Circular[]): Promise<void> {
  const batch = writeBatch(db);
  for (const c of list) batch.delete(doc(db, COL, c.id));
  await batch.commit();
  for (const c of list) for (const att of c.attachments ?? []) await deleteAttachmentFile(att.storagePath);
}

export type CircularTarget = 'draft' | 'live' | 'expired';

/** The field writes for moving a circular to Draft / Live / Expired. These never
 *  bump updatedAt: the student app's seen-key is `id:updatedAt`, so bumping it
 *  would re-flag the circular as unread for everyone.
 *  - live: clears archivedAt/expiredAt/publishAt; `notify` decides the publish push
 *    (the push trigger fires only on the Draft → Live transition)
 *  - draft: hides it from students and unpins
 *  - expired: moves it to the students' Expired tab and unpins */
function statusPatch(to: CircularTarget, opts: { notify?: boolean; pin?: boolean }) {
  const now = new Date().toISOString();
  switch (to) {
    case 'live':
      return {
        archivedAt: deleteField(), expiredAt: deleteField(), publishAt: deleteField(),
        notify: opts.notify ?? false,
        ...(opts.pin ? { pinned: true, pinnedAt: now } : {}),
      };
    case 'draft':
      return { archivedAt: now, pinned: deleteField(), pinnedAt: deleteField(), publishAt: deleteField() };
    case 'expired':
      return { expiredAt: now, archivedAt: deleteField(), pinned: deleteField(), pinnedAt: deleteField(), publishAt: deleteField() };
  }
}

export async function setCircularStatus(id: string, to: CircularTarget, opts: { notify?: boolean; pin?: boolean } = {}): Promise<void> {
  await updateDoc(doc(db, COL, id), statusPatch(to, opts));
}

export async function bulkSetCircularStatus(ids: string[], to: CircularTarget, opts: { notify?: boolean; pin?: boolean } = {}): Promise<void> {
  const batch = writeBatch(db);
  for (const id of ids) batch.update(doc(db, COL, id), statusPatch(to, opts));
  await batch.commit();
}

/** Pin / unpin a Live circular. A new pin goes first (pinnedAt = now). Silent
 *  by default — pass notify to push "📌 Pinned" to every student. */
export async function setCircularPinned(id: string, pinned: boolean, notify = false): Promise<void> {
  await updateDoc(
    doc(db, COL, id),
    pinned ? { pinned: true, pinnedAt: new Date().toISOString(), notify } : { pinned: deleteField(), pinnedAt: deleteField() },
  );
}

/** "Move to first" — puts an already-pinned circular ahead of the other pins.
 *  Only pinnedAt changes, so no push fires and updatedAt stays put. */
export async function moveCircularToFirst(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { pinnedAt: new Date().toISOString() });
}

/** Number of students who have opened each circular (any version). The web
 *  portal stores bare ids, the mobile app stores `id:updatedAt` keys. */
export async function fetchCircularSeenCounts(): Promise<Map<string, number>> {
  const snap = await getDocs(collection(db, 'studentCircularState'));
  const counts = new Map<string, number>();
  for (const d of snap.docs) {
    const ids = new Set<string>();
    for (const key of (d.data() as StudentCircularState).seenCircularIds ?? []) {
      const i = key.indexOf(':');
      ids.add(i === -1 ? key : key.slice(0, i));
    }
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
