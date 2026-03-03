import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
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

function buildMeritSuffix(academicYear: AcademicYear): string {
  const [startYear, endYear] = academicYear.split('-');
  return startYear.slice(-2) + endYear;
}

async function generateMeritNumber(academicYear: AcademicYear): Promise<string> {
  const q = query(
    collection(db, STUDENTS_COLLECTION),
    where('academicYear', '==', academicYear)
  );
  const snap = await getDocs(q);
  let maxSerial = 0;
  for (const d of snap.docs) {
    const merit = (d.data() as Record<string, unknown>).meritNumber;
    if (typeof merit === 'string' && merit.length >= 3) {
      const serial = parseInt(merit.slice(0, 3), 10);
      if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
    }
  }
  return String(maxSerial + 1).padStart(3, '0') + buildMeritSuffix(academicYear);
}

export async function addStudent(data: StudentFormData): Promise<{ id: string; meritNumber: string }> {
  const now = new Date().toISOString();
  const meritNumber = await generateMeritNumber(data.academicYear);
  const ref = await addDoc(collection(db, STUDENTS_COLLECTION), {
    ...data,
    meritNumber,
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, meritNumber };
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
