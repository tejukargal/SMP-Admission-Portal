import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AcademicYear, WPFeeDistribution, WPStudentCounts } from '../types';

const COL = 'wpFeeDistribution';

export async function getWPFeeDistribution(academicYear: AcademicYear): Promise<WPFeeDistribution | null> {
  const snap = await getDoc(doc(db, COL, academicYear));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as WPFeeDistribution;
}

export async function saveWPFeeDistribution(academicYear: AcademicYear, counts: WPStudentCounts): Promise<void> {
  await setDoc(doc(db, COL, academicYear), {
    academicYear,
    counts,
    updatedAt: new Date().toISOString(),
  });
}
