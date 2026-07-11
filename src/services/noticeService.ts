// Admin-side CRUD for the `notices` collection — uses the primary `db`
// (admin/staff Firebase Auth session). Student-facing reads live in
// studentPortalService.ts (uses the separate student Firestore instance).
import {
  collection, doc, addDoc, deleteDoc, deleteField, getDocs, onSnapshot, orderBy, query, updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Notice } from '../types';

const COL = 'notices';

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
