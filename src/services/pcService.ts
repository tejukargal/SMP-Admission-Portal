import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface PCRecord {
  id: string;
  studentId: string;
  studentName: string;
  examPeriod: string;
  regNumber: string;
  resultClass: string;
  dateOfIssue: string; // DD/MM/YYYY
  isDuplicate: boolean;
  issuedAt: string;    // ISO timestamp
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Append a PC issuance record to the student document's pcHistory array. */
export async function savePcRecord(
  studentId: string,
  data: Omit<PCRecord, 'id'>,
): Promise<void> {
  const record: PCRecord = { ...data, id: makeId() };
  await updateDoc(doc(db, 'students', studentId), {
    pcHistory: arrayUnion(record),
  });
}

/** Read PC history from the student document, sorted newest-first. */
export async function getPcRecordsByStudent(studentId: string): Promise<PCRecord[]> {
  const snap    = await getDoc(doc(db, 'students', studentId));
  const history = (snap.data() as { pcHistory?: PCRecord[] } | undefined)?.pcHistory ?? [];
  return [...history].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}
