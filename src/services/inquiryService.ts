import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Inquiry, InquiryStatus, AcademicYear } from '../types';

const COL = 'inquiries';

export async function addInquiry(
  data: Omit<Inquiry, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, COL), { ...data, createdAt: now, updatedAt: now });
  return ref.id;
}

export async function updateInquiryStatus(id: string, status: InquiryStatus): Promise<void> {
  await updateDoc(doc(db, COL, id), { status, updatedAt: new Date().toISOString() });
}

export async function deleteInquiry(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** Subscribe to real-time updates for all inquiries in a given academic year. */
export function subscribeInquiries(
  academicYear: AcademicYear,
  onData: (inquiries: Inquiry[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  // Single-field where query — no composite index needed.
  // Sort newest-first client-side in the hook.
  const q = query(
    collection(db, COL),
    where('academicYear', '==', academicYear)
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Inquiry))),
    onError
  );
}
