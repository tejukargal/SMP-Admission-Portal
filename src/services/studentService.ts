import {
  collection,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
  runTransaction,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Student, StudentFormData, AcademicYear, Course, Year, Gender } from '../types';

export interface StudentFilters {
  course?: Course;
  year?: Year;
  gender?: Gender;
}

const STUDENTS_COLLECTION = 'students';

const COUNTERS_COLLECTION = 'counters';

function buildMeritSuffix(academicYear: AcademicYear): string {
  const [startYear, endYear] = academicYear.split('-');
  return startYear.slice(-2) + endYear;
}

/**
 * One-time bootstrap: creates the counter doc for an academic year if it doesn't
 * exist yet, seeding it from the highest existing merit serial in that year.
 * The inner transaction guarantees only one concurrent caller wins — the others
 * see the doc already exists and skip cleanly.
 */
async function ensureCounter(academicYear: AcademicYear): Promise<void> {
  const counterRef = doc(db, COUNTERS_COLLECTION, academicYear);
  const snap = await getDoc(counterRef);
  if (snap.exists()) return;

  // Scan existing students once to seed the counter correctly on first use.
  const q = query(
    collection(db, STUDENTS_COLLECTION),
    where('academicYear', '==', academicYear)
  );
  const studentsSnap = await getDocs(q);
  let maxSerial = 0;
  for (const d of studentsSnap.docs) {
    const merit = (d.data() as Record<string, unknown>).meritNumber;
    if (typeof merit === 'string' && merit.length >= 3) {
      const serial = parseInt(merit.slice(0, 3), 10);
      if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
    }
  }

  // Race-safe creation: the transaction ensures only the first caller writes —
  // any concurrent initialiser will see the doc already exists and skip.
  await runTransaction(db, async (tx) => {
    const snap2 = await tx.get(counterRef);
    if (!snap2.exists()) {
      tx.set(counterRef, { seq: maxSerial, academicYear });
    }
  });
}

/**
 * Atomically increments the merit counter AND writes the new student document
 * in a single Firestore transaction. This guarantees:
 *   • No duplicate merit numbers under any level of concurrent traffic.
 *   • One round-trip instead of a full collection scan per enrollment.
 */
export async function addStudent(data: StudentFormData): Promise<{ id: string; meritNumber: string }> {
  await ensureCounter(data.academicYear);

  const now = new Date().toISOString();
  const counterRef = doc(db, COUNTERS_COLLECTION, data.academicYear);
  // Pre-generate the document ID so we can set it inside the transaction.
  const newStudentRef = doc(collection(db, STUDENTS_COLLECTION));

  const meritNumber = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const seq = ((counterSnap.data() as { seq: number } | undefined)?.seq ?? 0) + 1;
    const merit = String(seq).padStart(3, '0') + buildMeritSuffix(data.academicYear);

    tx.set(counterRef, { seq, academicYear: data.academicYear });
    tx.set(newStudentRef, {
      ...data,
      meritNumber: merit,
      createdAt: now,
      updatedAt: now,
    });

    return merit;
  });

  return { id: newStudentRef.id, meritNumber };
}

export async function getStudent(id: string): Promise<Student | null> {
  const ref = doc(db, STUDENTS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Student;
}

export async function updateStudent(
  id: string,
  data: StudentFormData
): Promise<void> {
  const ref = doc(db, STUDENTS_COLLECTION, id);
  await updateDoc(ref, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteStudent(id: string): Promise<void> {
  const ref = doc(db, STUDENTS_COLLECTION, id);
  await deleteDoc(ref);
}

export async function deleteStudentsByAcademicYear(
  academicYear: AcademicYear
): Promise<number> {
  const q = query(
    collection(db, STUDENTS_COLLECTION),
    where('academicYear', '==', academicYear)
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const CHUNK = 400;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.docs.length;
}

export async function deleteAllStudents(): Promise<number> {
  const snap = await getDocs(collection(db, STUDENTS_COLLECTION));
  if (snap.empty) return 0;

  const CHUNK = 400;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.docs.length;
}

export async function getAllStudents(): Promise<Student[]> {
  const snap = await getDocs(collection(db, STUDENTS_COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
}

export async function getStudentsByAcademicYear(
  academicYear: AcademicYear,
  filters: StudentFilters = {}
): Promise<Student[]> {
  const constraints: QueryConstraint[] = [
    where('academicYear', '==', academicYear),
  ];

  if (filters.course) constraints.push(where('course', '==', filters.course));
  if (filters.year)   constraints.push(where('year',   '==', filters.year));
  if (filters.gender) constraints.push(where('gender', '==', filters.gender));

  constraints.push(orderBy('createdAt', 'desc'));

  const q = query(collection(db, STUDENTS_COLLECTION), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
}
