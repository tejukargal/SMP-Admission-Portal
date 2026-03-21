import { doc, getDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { StudentFeeOverride, AcademicYear } from '../types';

const COL = 'feeOverrides';

export async function getFeeOverride(
  studentId: string,
  academicYear: AcademicYear,
): Promise<StudentFeeOverride | null> {
  try {
    const id = `${studentId}__${academicYear}`;
    const snap = await getDoc(doc(db, COL, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as StudentFeeOverride;
  } catch {
    // Silently return null if collection is inaccessible (e.g. rules not yet deployed)
    return null;
  }
}

export async function saveFeeOverride(
  override: Omit<StudentFeeOverride, 'id' | 'updatedAt'>,
): Promise<void> {
  const id = `${override.studentId}__${override.academicYear}`;
  await setDoc(doc(db, COL, id), {
    ...override,
    id,
    updatedAt: new Date().toISOString(),
  });
}

export async function getFeeOverridesByYear(
  academicYear: AcademicYear,
): Promise<StudentFeeOverride[]> {
  const q = query(collection(db, COL), where('academicYear', '==', academicYear));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudentFeeOverride));
}
