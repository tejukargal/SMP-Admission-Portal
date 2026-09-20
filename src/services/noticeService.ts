// Admin-side CRUD for the `notices` collection — uses the primary `db`
// (admin/staff Firebase Auth session). Student-facing reads live in
// studentPortalService.ts (uses the separate student Firestore instance).
import {
  collection, doc, addDoc, deleteDoc, deleteField, getDocs, onSnapshot, orderBy, query, updateDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../config/firebase';
import type { Notice, NoticeCategory } from '../types';
import type { CircularAiProvider, CircularAiLanguage } from './circularService';

const COL = 'notices';
const functions = getFunctions(app, 'asia-south1');

export interface GenerateNoticeDraftInput {
  brief: string;
  keyDates?: string;
  provider: CircularAiProvider;
  language: CircularAiLanguage;
  /** Who the notice is going to — context for the prompt only (count + the
   *  same human-readable summary stored as `audienceLabel` on send). */
  audience: { count: number; label: string };
}

export interface NoticeDraft {
  title: string;
  category?: NoticeCategory;
  bodyHtml: string;
}

/** Calls the generateNoticeDraft Cloud Function — returns a draft only, nothing is saved until the admin reviews it and clicks Send. */
export async function generateNoticeDraft(input: GenerateNoticeDraftInput): Promise<NoticeDraft> {
  const fn = httpsCallable<GenerateNoticeDraftInput, NoticeDraft>(functions, 'generateNoticeDraft');
  const result = await fn(input);
  return result.data;
}

export async function getNotices(): Promise<Notice[]> {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notice));
}

/** Live-subscribes to the notices list, newest first. Returns an unsubscribe function. */
export function subscribeToNotices(onChange: (notices: Notice[]) => void): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notice)));
  });
}

export async function createNotice(data: Omit<Notice, 'id' | 'createdAt'>): Promise<void> {
  await addDoc(collection(db, COL), { ...data, createdAt: new Date().toISOString() });
}

export async function updateNotice(id: string, data: Pick<Notice, 'title' | 'body' | 'category'>): Promise<void> {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteNotice(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** Unpublish — hides the notice from all students but keeps the doc for admin review (not a hard delete). Reversible via publishNotice. */
export async function unpublishNotice(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { archivedAt: new Date().toISOString() });
}

/** Publish — makes a previously-unpublished notice visible to students again. */
export async function publishNotice(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { archivedAt: deleteField() });
}

/** Mark a notice "finished" — stays visible to students but labeled Inactive and sorted below Active notices. */
export async function markNoticeInactive(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { inactiveAt: new Date().toISOString() });
}

/** Reactivate a previously-inactive notice. */
export async function markNoticeActive(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { inactiveAt: deleteField() });
}

/** Pin — shows this notice first in the student portal's Notices tab, ahead of date sorting. */
export async function pinNotice(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { pinned: true });
}

/** Unpin — returns the notice to normal date-based sorting. */
export async function unpinNotice(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { pinned: deleteField() });
}
