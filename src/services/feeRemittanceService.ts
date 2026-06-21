import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, doc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { FeeRemittance, AcademicYear } from '../types';

const COL = 'feeRemittances';

export function subscribeFeeRemittances(
  academicYear: AcademicYear,
  onData: (data: FeeRemittance[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where('academicYear', '==', academicYear));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeRemittance))),
    onError,
  );
}

export async function addFeeRemittance(
  data: Omit<FeeRemittance, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, COL), { ...data, createdAt: now, updatedAt: now });
  return ref.id;
}

export async function deleteFeeRemittance(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
