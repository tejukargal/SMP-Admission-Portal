import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
  runTransaction,
  documentId,
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

// ── Default reg-number generation ──────────────────────────────────────────
// Format: {yearNum}{course}308{yearCode}{serial3}
// e.g. 1st year CE, 2026-27 → "1CE30826001"

const INST_CODE = '308';

const YEAR_NUM: Partial<Record<string, string>> = {
  '1ST YEAR': '1',
  '2ND YEAR': '2',
  '3RD YEAR': '3',
};

function buildRegPrefix(academicYear: AcademicYear, course: Course, year: Year): string {
  const yearNum = YEAR_NUM[year] ?? '0';
  const yearCode = academicYear.split('-')[0].slice(-2); // "2026-27" → "26"
  return `${yearNum}${course}${INST_CODE}${yearCode}`;
}

function buildDefaultRegNumber(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

function regCounterDocId(academicYear: AcademicYear, course: Course, year: Year): string {
  const yearNum = YEAR_NUM[year] ?? '0';
  return `${academicYear}__regseq__${yearNum}__${course}`;
}

/**
 * Returns true when the stored regNumber should be replaced by a freshly
 * generated unique default (i.e. the user has not supplied their own number).
 */
function isAutoRegNumber(regNumber: string, course: Course): boolean {
  if (!regNumber) return true;
  if (regNumber === `${INST_CODE}${course}`) return true; // old default e.g. "308CE"
  // New auto-format: digit + course(CE/ME/EC/CS/EE) + 308 + 2-digit year + 3-digit serial
  if (/^\d(CE|ME|EC|CS|EE)308\d{5}$/.test(regNumber)) return true;
  return false;
}

/**
 * Bootstraps the reg-number counter for a given (academicYear, course, year)
 * combination if it doesn't exist yet, seeding from the highest existing serial.
 */
async function ensureRegCounter(
  academicYear: AcademicYear,
  course: Course,
  year: Year,
): Promise<void> {
  const counterRef = doc(db, COUNTERS_COLLECTION, regCounterDocId(academicYear, course, year));
  const snap = await getDoc(counterRef);
  if (snap.exists()) return;

  const prefix = buildRegPrefix(academicYear, course, year);
  const q = query(
    collection(db, STUDENTS_COLLECTION),
    where('academicYear', '==', academicYear),
    where('course', '==', course),
    where('year', '==', year),
  );
  const studentsSnap = await getDocs(q);
  let maxSerial = 0;
  for (const d of studentsSnap.docs) {
    const rn = (d.data() as Record<string, unknown>).regNumber;
    if (typeof rn === 'string' && rn.startsWith(prefix)) {
      const serial = parseInt(rn.slice(prefix.length), 10);
      if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
    }
  }

  await runTransaction(db, async (tx) => {
    const snap2 = await tx.get(counterRef);
    if (!snap2.exists()) {
      tx.set(counterRef, { seq: maxSerial, academicYear, course, year });
    }
  });
}

/**
 * Returns the next default reg number for the given combination WITHOUT
 * committing anything — used for form preview only. The actual unique number
 * is committed atomically inside addStudent().
 */
export async function peekNextDefaultRegNumber(
  academicYear: AcademicYear,
  course: Course,
  year: Year,
): Promise<string> {
  await ensureRegCounter(academicYear, course, year);
  const counterRef = doc(db, COUNTERS_COLLECTION, regCounterDocId(academicYear, course, year));
  const snap = await getDoc(counterRef);
  const seq = ((snap.data() as { seq: number } | undefined)?.seq ?? 0) + 1;
  return buildDefaultRegNumber(buildRegPrefix(academicYear, course, year), seq);
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
export async function addStudent(
  data: StudentFormData,
): Promise<{ id: string; meritNumber: string; regNumber: string }> {
  await ensureCounter(data.academicYear);

  const shouldAutoReg = isAutoRegNumber(data.regNumber, data.course);
  if (shouldAutoReg) {
    await ensureRegCounter(data.academicYear, data.course, data.year);
  }

  const now = new Date().toISOString();
  const counterRef = doc(db, COUNTERS_COLLECTION, data.academicYear);
  const regCounterRef = shouldAutoReg
    ? doc(db, COUNTERS_COLLECTION, regCounterDocId(data.academicYear, data.course, data.year))
    : null;
  // Pre-generate the document ID so we can set it inside the transaction.
  const newStudentRef = doc(collection(db, STUDENTS_COLLECTION));

  const { meritNumber, regNumber } = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const seq = ((counterSnap.data() as { seq: number } | undefined)?.seq ?? 0) + 1;
    const merit = String(seq).padStart(3, '0') + buildMeritSuffix(data.academicYear);

    let assignedReg = data.regNumber;
    if (shouldAutoReg && regCounterRef) {
      const regSnap = await tx.get(regCounterRef);
      const regSeq = ((regSnap.data() as { seq: number } | undefined)?.seq ?? 0) + 1;
      assignedReg = buildDefaultRegNumber(
        buildRegPrefix(data.academicYear, data.course, data.year),
        regSeq,
      );
      tx.set(regCounterRef, { seq: regSeq, academicYear: data.academicYear, course: data.course, year: data.year });
    }

    tx.set(counterRef, { seq, academicYear: data.academicYear });
    tx.set(newStudentRef, {
      ...data,
      regNumber: assignedReg,
      meritNumber: merit,
      createdAt: now,
      updatedAt: now,
    });

    return { meritNumber: merit, regNumber: assignedReg };
  });

  return { id: newStudentRef.id, meritNumber, regNumber };
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

export async function updateStudentStatus(id: string, status: string): Promise<void> {
  const ref = doc(db, STUDENTS_COLLECTION, id);
  await updateDoc(ref, { admissionStatus: status, updatedAt: new Date().toISOString() });
}

export async function deleteStudent(id: string): Promise<void> {
  // Cascade-delete all associated data: fee records, fee overrides, student documents
  const [feeRecordsSnap, feeOverridesSnap] = await Promise.all([
    getDocs(query(collection(db, 'feeRecords'), where('studentId', '==', id))),
    getDocs(query(collection(db, 'feeOverrides'), where('studentId', '==', id))),
  ]);

  const toDelete = [
    doc(db, STUDENTS_COLLECTION, id),
    doc(db, 'studentDocuments', id),
    ...feeRecordsSnap.docs.map((d) => d.ref),
    ...feeOverridesSnap.docs.map((d) => d.ref),
  ];

  const CHUNK = 500;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const batch = writeBatch(db);
    toDelete.slice(i, i + CHUNK).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
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

/**
 * Deletes all counter and receipt-counter documents for the given academic year
 * so that merit numbers, reg numbers, and receipt numbers restart from 1 on the
 * next enrollment / fee collection.
 *
 * Counters deleted:
 *   counters/{academicYear}              — merit number counter
 *   counters/{academicYear}__tc          — TC number counter
 *   counters/{academicYear}__regseq__*   — per-course/year reg-number counters
 *   receiptCounters/{academicYear}       — SMP / SVK / additional receipt counters
 */
export async function resetAcademicYearCounters(academicYear: AcademicYear): Promise<void> {
  const regPrefix = `${academicYear}__regseq__`;
  const regSnap = await getDocs(
    query(
      collection(db, COUNTERS_COLLECTION),
      where(documentId(), '>=', regPrefix),
      where(documentId(), '<=', regPrefix + ''),
    )
  );

  const deletes: Promise<void>[] = [
    deleteDoc(doc(db, COUNTERS_COLLECTION, academicYear)),
    deleteDoc(doc(db, COUNTERS_COLLECTION, `${academicYear}__tc`)),
    deleteDoc(doc(db, 'receiptCounters', academicYear)),
    ...regSnap.docs.map((d) => deleteDoc(d.ref)),
  ];
  await Promise.all(deletes);
}
