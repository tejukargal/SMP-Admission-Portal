import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ExamResult, Course } from '../types';
import type { RawResult } from '../utils/resultPdfParser';

const RESULTS_COLLECTION = 'examResults';
const STUDENTS_COLLECTION = 'students';
const CHUNK_SIZE = 400;

export interface ImportResultsInput {
  course: Course | null;
  collegeCode: string;
  examSession: string;
  results: RawResult[];
}

export interface ImportResultsSummary {
  success: number;
  failed: number;
  errors: Array<{ regNumber: string; message: string }>;
}

function slugifySession(session: string): string {
  return session.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Import parsed exam results, matching each by regNumber against the
 * students collection to attach studentId/academicYear/year for navigation.
 * Results are still saved even when no matching student is found.
 */
export async function importExamResults(
  input: ImportResultsInput,
  onProgress?: (current: number, total: number) => void
): Promise<ImportResultsSummary> {
  const { course, collegeCode, examSession, results } = input;

  // Build regNumber → student lookup across all students (reg numbers are
  // unique institution-wide, so no academicYear scoping is needed here).
  const studentMap = new Map<string, { id: string; academicYear: string; year: string }>();
  const snap = await getDocs(collection(db, STUDENTS_COLLECTION));
  for (const d of snap.docs) {
    const data = d.data();
    const reg = String(data.regNumber ?? '').trim().toUpperCase();
    if (reg) {
      studentMap.set(reg, {
        id: d.id,
        academicYear: String(data.academicYear ?? ''),
        year: String(data.year ?? ''),
      });
    }
  }

  const sessionSlug = slugifySession(examSession);
  const now = new Date().toISOString();
  const errors: Array<{ regNumber: string; message: string }> = [];
  const records: Array<{ id: string; data: ExamResult }> = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const regNumber = r.regNumber.trim().toUpperCase();

    if (!regNumber) {
      errors.push({ regNumber: '(blank)', message: 'Missing register number' });
      continue;
    }

    const student = studentMap.get(regNumber);
    const id = `${regNumber}__${sessionSlug}`;

    const record: ExamResult = {
      id,
      regNumber,
      studentName: r.studentName,
      parentName: r.parentName,
      course: course ?? 'CE',
      collegeCode,
      examSession,
      subjects: r.subjects,
      semesterSummary: r.semesterSummary,
      creditsEarnedCumulative: r.creditsEarnedCumulative,
      cgpa: r.cgpa,
      cgpaStatus: r.cgpaStatus,
      percentageConversion: r.percentageConversion,
      overallResult: r.overallResult,
      studentId: student?.id ?? '',
      academicYear: student?.academicYear ?? '',
      year: student?.year ?? '',
      importedAt: now,
      updatedAt: now,
    };

    records.push({ id, data: record });
    onProgress?.(i + 1, results.length);
  }

  let success = 0;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const chunk = records.slice(i, i + CHUNK_SIZE);
    for (const { id, data } of chunk) {
      batch.set(doc(db, RESULTS_COLLECTION, id), data);
    }
    await batch.commit();
    success += chunk.length;
  }

  return { success, failed: errors.length, errors };
}

export async function getAllExamResults(): Promise<ExamResult[]> {
  const snap = await getDocs(collection(db, RESULTS_COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamResult));
}

export async function getExamResultsByCourse(course: Course): Promise<ExamResult[]> {
  const q = query(collection(db, RESULTS_COLLECTION), where('course', '==', course));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamResult));
}

export async function getExamResultsByRegNumber(regNumber: string): Promise<ExamResult[]> {
  const reg = regNumber.trim().toUpperCase();
  const q = query(collection(db, RESULTS_COLLECTION), where('regNumber', '==', reg));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamResult));
}

export async function deleteExamResult(id: string): Promise<void> {
  await deleteDoc(doc(db, RESULTS_COLLECTION, id));
}
