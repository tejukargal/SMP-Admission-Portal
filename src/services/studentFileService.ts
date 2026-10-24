import {
  collection, doc, onSnapshot, query, setDoc, updateDoc, deleteDoc, where,
  type Unsubscribe,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db, storage } from '../config/firebase';
import { sanitizeFileName } from './circularService';
import { syncMyAdminClaim } from './userService';
import { compressImage, STUDENT_FILE_MAX_BYTES } from '../utils/compressImage';
import type { Student, StudentFile, StudentFileCategory } from '../types';

const COL = 'studentFiles';

export const STUDENT_FILE_CATEGORY_LABEL: Record<StudentFileCategory, string> = {
  TC_REQUEST: 'TC Request',
  PC_REQUEST: 'PC Request',
  FEE_CONCESSION: 'Fee Concession',
  STUDY_CERT_REQUEST: 'Study Cert Request',
  AFFIDAVIT: 'Affidavit',
  OTHER: 'Other',
};

export const STUDENT_FILE_CATEGORIES = Object.keys(STUDENT_FILE_CATEGORY_LABEL) as StudentFileCategory[];

/** Same identity the Dashboard search groups by — files follow the student across academic years. */
export function studentFileOwnerKey(s: Pick<Student, 'id' | 'regNumber'>): string {
  const reg = s.regNumber?.trim().toUpperCase();
  return reg ? reg : `id_${s.id}`;
}

export type StudentFileMeta = Pick<StudentFile, 'category' | 'title' | 'letterDate' | 'note'>;

/** Firestore rejects `undefined` field values — drop them (and blank strings) before writing. */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''),
  ) as Partial<T>;
}

async function deleteStoredFile(path: string): Promise<void> {
  try { await deleteObject(storageRef(storage, path)); } catch { /* ignore — file may already be gone */ }
}

/** Compresses photos, uploads to studentFiles/{id}/…, then writes the metadata doc. */
export async function uploadStudentFile(
  student: Student,
  original: File,
  meta: StudentFileMeta,
  uploadedBy: string,
): Promise<StudentFile> {
  const file = await compressImage(original);
  if (file.size > STUDENT_FILE_MAX_BYTES) throw new Error(`${original.name} is larger than 10 MB.`);

  const ref = doc(collection(db, COL));
  const path = `${COL}/${ref.id}/${Date.now()}_${sanitizeFileName(file.name)}`;
  const sref = storageRef(storage, path);
  try {
    await uploadBytes(sref, file, { contentType: file.type });
  } catch (err) {
    // Storage rules check the `admin` Auth claim, which can be missing or stale on
    // this login even though Firestore says admin. Re-sync it once and retry.
    if ((err as { code?: string }).code !== 'storage/unauthorized') throw err;
    if (!(await syncMyAdminClaim())) throw err;
    await auth.currentUser?.getIdToken(true);
    await uploadBytes(sref, file, { contentType: file.type });
  }
  let url: string;
  try {
    url = await getDownloadURL(sref);
  } catch (err) {
    await deleteStoredFile(path);
    throw err;
  }

  const record: Omit<StudentFile, 'id'> = {
    ownerKey: studentFileOwnerKey(student),
    ...(student.regNumber ? { regNumber: student.regNumber.trim().toUpperCase() } : {}),
    studentId: student.id,
    studentName: student.studentNameSSLC,
    academicYear: student.academicYear,
    ...clean(meta),
    category: meta.category,
    name: file.name,
    type: file.type,
    size: file.size,
    url,
    storagePath: path,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
  };
  try {
    await setDoc(ref, record);
  } catch (err) {
    await deleteStoredFile(path);
    throw err;
  }
  return { id: ref.id, ...record };
}

export async function updateStudentFileMeta(id: string, meta: StudentFileMeta): Promise<void> {
  // Blank optional fields are cleared by writing '' — keeps the update a plain merge.
  await updateDoc(doc(db, COL, id), {
    category: meta.category,
    title: meta.title ?? '',
    letterDate: meta.letterDate ?? '',
    note: meta.note ?? '',
  });
}

export async function deleteStudentFile(file: StudentFile): Promise<void> {
  await deleteStoredFile(file.storagePath);
  await deleteDoc(doc(db, COL, file.id));
}

/** Live files for a student: by owner key (all years) plus any saved against this record
 *  before it had a Reg No. Newest first. */
export function subscribeStudentFiles(
  student: Pick<Student, 'id' | 'regNumber'>,
  onData: (files: StudentFile[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const byOwner = new Map<string, StudentFile>();
  const byRecord = new Map<string, StudentFile>();
  let ready = 0;
  const emit = () => {
    if (ready < 2) return;
    const merged = new Map([...byOwner, ...byRecord]);
    onData([...merged.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)));
  };
  const listen = (field: 'ownerKey' | 'studentId', value: string, into: Map<string, StudentFile>) => {
    let first = true;
    return onSnapshot(
      query(collection(db, COL), where(field, '==', value)),
      (snap) => {
        into.clear();
        for (const d of snap.docs) into.set(d.id, { id: d.id, ...d.data() } as StudentFile);
        if (first) { first = false; ready++; }
        emit();
      },
      onError,
    );
  };
  const unsubs = [
    listen('ownerKey', studentFileOwnerKey(student), byOwner),
    listen('studentId', student.id, byRecord),
  ];
  return () => unsubs.forEach((u) => u());
}

/** Live file count per owner key across the whole collection (for the 📎 badges). */
export function subscribeStudentFileCounts(
  onData: (counts: Map<string, number>) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, COL),
    (snap) => {
      const counts = new Map<string, number>();
      for (const d of snap.docs) {
        const key = d.get('ownerKey') as string | undefined;
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      onData(counts);
    },
    onError,
  );
}

/** Plain-language message for an upload / load / delete failure. */
export function studentFileErrorMessage(err: unknown, fallback: string): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code === 'storage/unauthorized' || code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'Permission denied — only an admin can change files. If you are an admin, try Settings › Refresh My Permissions, or log out and back in.';
  }
  if (code === 'storage/canceled') return 'Upload was cancelled.';
  if (code === 'storage/retry-limit-exceeded' || code === 'unavailable') return 'Network problem — check the connection and try again.';
  return err instanceof Error && !code ? err.message : fallback;
}

/** Saves the file with its original name (download attribute is ignored on cross-origin URLs). */
export async function downloadStudentFile(file: Pick<StudentFile, 'url' | 'name'>): Promise<void> {
  try {
    const res = await fetch(file.url);
    if (!res.ok) throw new Error(String(res.status));
    const blobUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch {
    window.open(file.url, '_blank', 'noopener');
  }
}
