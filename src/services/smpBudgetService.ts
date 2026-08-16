import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AcademicYear, BudgetHeadEntry, SMPBudget } from '../types';

const COL = 'smpBudgets';

export async function getSMPBudget(academicYear: AcademicYear): Promise<SMPBudget | null> {
  const snap = await getDoc(doc(db, COL, academicYear));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as SMPBudget;
}

export async function saveSMPBudget(academicYear: AcademicYear, heads: BudgetHeadEntry[]): Promise<void> {
  await setDoc(doc(db, COL, academicYear), {
    academicYear,
    heads,
    updatedAt: new Date().toISOString(),
  });
}
