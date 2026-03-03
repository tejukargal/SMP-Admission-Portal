import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AcademicYear, FinePeriod } from '../types';

const COL = 'fineSchedules';

export async function getFineSchedule(academicYear: AcademicYear): Promise<FinePeriod[]> {
  const snap = await getDoc(doc(db, COL, academicYear));
  if (!snap.exists()) return [];
  const data = snap.data() as { periods?: FinePeriod[] };
  return data.periods ?? [];
}

export async function saveFineSchedule(
  academicYear: AcademicYear,
  periods: FinePeriod[]
): Promise<void> {
  await setDoc(doc(db, COL, academicYear), {
    academicYear,
    periods,
    updatedAt: new Date().toISOString(),
  });
}
