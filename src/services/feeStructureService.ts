import { doc, setDoc, getDoc, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  FeeStructure,
  FeeStructureFormData,
  FeeAdditionalHead,
  AcademicYear,
  Course,
  Year,
  AdmType,
  AdmCat,
} from '../types';

const COL = 'feeStructure';

function structureDocId(
  academicYear: AcademicYear,
  course: Course,
  year: Year,
  admType: AdmType,
  admCat: AdmCat
): string {
  return `${academicYear}__${course}__${year}__${admType}__${admCat}`;
}

export async function saveFeeStructure(data: FeeStructureFormData): Promise<void> {
  const id = structureDocId(
    data.academicYear,
    data.course,
    data.year,
    data.admType,
    data.admCat
  );
  const ref = doc(db, COL, id);
  const snap = await getDoc(ref);
  const now = new Date().toISOString();
  const createdAt = snap.exists()
    ? (snap.data() as Pick<FeeStructure, 'createdAt'>).createdAt
    : now;
  await setDoc(ref, { ...data, createdAt, updatedAt: now });
}

/** All saved fee structures across every academic year. */
export async function getAllFeeStructures(): Promise<FeeStructure[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeStructure));
}

/** All fee structures for a specific academic year. */
export async function getFeeStructuresByAcademicYear(
  academicYear: AcademicYear
): Promise<FeeStructure[]> {
  const q = query(collection(db, COL), where('academicYear', '==', academicYear));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeStructure));
}

/** Delete every document in the feeStructure collection. Uses batched writes (max 500 per batch). */
export async function deleteAllFeeStructures(): Promise<void> {
  const snap = await getDocs(collection(db, COL));
  if (snap.empty) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/**
 * Applies the given additionalHeads to every fee structure in the specified academic year.
 * Optionally skips one doc (the one just saved) to avoid a redundant write.
 */
export async function applyAdditionalHeadsToYear(
  academicYear: AcademicYear,
  additionalHeads: FeeAdditionalHead[],
  skipDocId?: string
): Promise<number> {
  const q = query(collection(db, COL), where('academicYear', '==', academicYear));
  const snap = await getDocs(q);
  const docs = snap.docs.filter((d) => d.id !== skipDocId);
  if (docs.length === 0) return 0;
  const now = new Date().toISOString();
  const BATCH_SIZE = 500;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH_SIZE).forEach((d) => {
      batch.update(d.ref, { additionalHeads, updatedAt: now });
    });
    await batch.commit();
  }
  return docs.length;
}

export async function getFeeStructure(
  academicYear: AcademicYear,
  course: Course,
  year: Year,
  admType: AdmType,
  admCat: AdmCat
): Promise<FeeStructure | null> {
  const id = structureDocId(academicYear, course, year, admType, admCat);
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as FeeStructure;
}
