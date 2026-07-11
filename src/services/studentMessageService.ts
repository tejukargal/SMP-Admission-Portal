// Admin-side access to the `studentMessages` collection — uses the primary
// `db` (admin/staff Firebase Auth session). Students create/read their own
// messages via studentPortalService.ts (separate student Firestore instance).
import { collection, doc, deleteDoc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { StudentMessage } from '../types';

const COL = 'studentMessages';

export async function getAllStudentMessages(): Promise<StudentMessage[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as StudentMessage))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function resolveStudentMessage(id: string, adminReply: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status: 'resolved',
    adminReply: adminReply || '',
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteStudentMessage(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

export async function bulkResolveStudentMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  for (const id of ids) {
    batch.update(doc(db, COL, id), { status: 'resolved', updatedAt: now });
  }
  await batch.commit();
}

export async function bulkDeleteStudentMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.delete(doc(db, COL, id));
  }
  await batch.commit();
}
