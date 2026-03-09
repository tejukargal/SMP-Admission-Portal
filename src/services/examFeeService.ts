import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ExamFeeRecord, AcademicYear } from '../types';

export async function getExamFeeRecords(academicYear: AcademicYear): Promise<ExamFeeRecord[]> {
  const q = query(
    collection(db, 'examFeeRecords'),
    where('academicYear', '==', academicYear)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExamFeeRecord);
}

export async function saveExamFeeRecords(
  updates: Array<{ studentId: string; academicYear: AcademicYear; paid: boolean }>
): Promise<void> {
  if (!updates.length) return;
  const CHUNK = 500;
  const now = new Date().toISOString();
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const { studentId, academicYear, paid } of chunk) {
      const id = `${studentId}__${academicYear}`;
      const ref = doc(db, 'examFeeRecords', id);
      batch.set(ref, { id, studentId, academicYear, paid, updatedAt: now });
    }
    await batch.commit();
  }
}
