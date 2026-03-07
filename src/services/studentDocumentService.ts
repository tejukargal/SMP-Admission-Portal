import { doc, getDoc, setDoc, getDocs, collection, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { StudentDocuments, DocRecord, DocEntry } from '../types';
import { REQUIRED_DOCS } from '../types';

const COLL = 'studentDocuments';

export function emptyEntry(): DocEntry {
  return { submitted: false, submittedOn: '', returned: false, returnedOn: '', remarks: '' };
}

export function emptyDocRecord(): DocRecord {
  return Object.fromEntries(
    REQUIRED_DOCS.map(({ key }) => [key, emptyEntry()])
  ) as DocRecord;
}

/** Fill any missing keys with empty entries (handles new doc types added later) */
export function mergeWithDefaults(partial: Partial<DocRecord>): DocRecord {
  const full = emptyDocRecord();
  for (const { key } of REQUIRED_DOCS) {
    if (partial[key]) full[key] = { ...emptyEntry(), ...partial[key] };
  }
  return full;
}

export async function getStudentDocuments(studentId: string): Promise<StudentDocuments> {
  const ref = doc(db, COLL, studentId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as StudentDocuments;
  }
  return { id: studentId, studentId, docs: {}, updatedAt: '' };
}

export async function saveStudentDocuments(studentId: string, docs: DocRecord): Promise<void> {
  const ref = doc(db, COLL, studentId);
  await setDoc(ref, { studentId, docs, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function getAllStudentDocuments(): Promise<StudentDocuments[]> {
  const snap = await getDocs(collection(db, COLL));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudentDocuments));
}

/** Delete document records for a given list of student IDs. Returns number of records deleted. */
export async function resetDocumentsByStudentIds(studentIds: string[]): Promise<number> {
  if (studentIds.length === 0) return 0;
  const BATCH_LIMIT = 500;
  for (let i = 0; i < studentIds.length; i += BATCH_LIMIT) {
    const chunk = studentIds.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.delete(doc(db, COLL, id));
    }
    await batch.commit();
  }
  return studentIds.length;
}

/** Delete ALL document records across all students. */
export async function resetAllDocuments(): Promise<number> {
  const snap = await getDocs(collection(db, COLL));
  if (snap.empty) return 0;
  const BATCH_LIMIT = 500;
  const refs = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const chunk = refs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}

