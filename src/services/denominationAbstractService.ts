import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { DenominationAbstract } from '../types';

const COL = 'denominationAbstracts';

export function denominationAbstractId(
  academicYear: string,
  viewMode: 'daily' | 'period',
  dateKey: string,
): string {
  return `${academicYear}__${viewMode}__${dateKey}`;
}

export async function getDenominationAbstract(id: string): Promise<DenominationAbstract | null> {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as DenominationAbstract) : null;
}

export async function saveDenominationAbstract(
  id: string,
  data: Omit<DenominationAbstract, 'id' | 'updatedAt'>,
): Promise<void> {
  await setDoc(doc(db, COL, id), { ...data, updatedAt: new Date().toISOString() });
}
