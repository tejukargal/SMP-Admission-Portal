import {
  doc,
  setDoc,
  deleteDoc,
  query,
  collection,
  where,
  getDocs,
  writeBatch,
  runTransaction,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { FeeRecord, FeeRecordFormData, AcademicYear, Course, Year, AdmType, AdmCat, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS } from '../types';

const AIDED_COURSES = new Set<Course>(['CE', 'ME', 'EC', 'CS']);
import { getFeeStructure } from './feeStructureService';

const COL = 'feeRecords';

function recordDocId(
  studentId: string,
  academicYear: AcademicYear,
  receiptNumber: string
): string {
  return `${studentId}__${academicYear}__${receiptNumber}`;
}

/** Save a single payment installment as its own document. */
export async function saveFeeRecord(data: FeeRecordFormData): Promise<void> {
  const id = recordDocId(data.studentId, data.academicYear, data.receiptNumber);
  const now = new Date().toISOString();
  await setDoc(doc(db, COL, id), { ...data, createdAt: now, updatedAt: now });
}

/** Update an existing fee record. Handles receipt-number changes by re-keying the doc. */
export async function updateFeeRecord(
  oldId: string,
  data: FeeRecordFormData,
  originalCreatedAt: string
): Promise<void> {
  const newId = recordDocId(data.studentId, data.academicYear, data.receiptNumber);
  const now = new Date().toISOString();
  if (oldId !== newId) {
    await deleteDoc(doc(db, COL, oldId));
  }
  await setDoc(doc(db, COL, newId), { ...data, createdAt: originalCreatedAt, updatedAt: now });
}

/** Delete a single fee record by its document ID. */
export async function deleteFeeRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** All payment records for a specific student in a given academic year. */
export async function getFeeRecordsByStudent(
  studentId: string,
  academicYear: AcademicYear
): Promise<FeeRecord[]> {
  const q = query(
    collection(db, COL),
    where('studentId', '==', studentId),
    where('academicYear', '==', academicYear)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeRecord));
}

/** All payment records for a student across every academic year, matched by reg number. */
export async function getAllFeeRecordsByRegNumber(regNumber: string): Promise<FeeRecord[]> {
  const q = query(collection(db, COL), where('regNumber', '==', regNumber));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeRecord));
}

/** All payment records for a student across every academic year, matched by studentId. */
export async function getAllFeeRecordsByStudent(studentId: string): Promise<FeeRecord[]> {
  const q = query(collection(db, COL), where('studentId', '==', studentId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeRecord));
}

/** Delete all fee records for a given academic year. Returns count deleted. */
export async function deleteFeeRecordsByAcademicYear(
  academicYear: AcademicYear
): Promise<number> {
  const q = query(collection(db, COL), where('academicYear', '==', academicYear));
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

/** All fee records for an academic year — used for status display and fee register. */
export async function getFeeRecordsByAcademicYear(
  academicYear: AcademicYear
): Promise<FeeRecord[]> {
  const q = query(
    collection(db, COL),
    where('academicYear', '==', academicYear)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeRecord));
}

const SVK_RPT_PREFIX = 'SVK DVP ';

// ── Receipt number counters ────────────────────────────────────────────────────
//
// Counter documents live at receiptCounters/{academicYear}.
// Aided courses (CE, ME, EC, CS) share one series; unaided (EE) has its own.
// This applies to SMP, SVK, and Additional receipts independently.
//
// Design:
//  • peekNextReceiptNumbers()  – reads the current max and returns max+1, NO write.
//    Called when the modal opens so the user sees the suggested next number.
//  • updateReceiptCounters()   – called AFTER a successful save; updates
//    max(current, usedNumber) in a transaction so the counter always reflects
//    the highest receipt number ever written.
//
// This means cancelling the modal never wastes a receipt number.

const RECEIPT_COUNTERS_COL = 'receiptCounters';

interface ReceiptCounterDoc {
  smpAided: number;    smpAidedPadLen: number;
  smpUnaided: number;  smpUnaidedPadLen: number;
  svk: number;         svkPadLen: number;   // shared across all courses
  additional: number;                        // shared across all courses
}

/** Returns the highest receipt numbers found across ALL academic years' counter docs.
 *  Used to seed a new year's counter so receipt numbers never reset between years. */
async function _getGlobalCounterMax(): Promise<ReceiptCounterDoc> {
  const snapshot = await getDocs(collection(db, RECEIPT_COUNTERS_COL));
  const result: ReceiptCounterDoc = {
    smpAided: 0, smpAidedPadLen: 1,
    smpUnaided: 0, smpUnaidedPadLen: 1,
    svk: 0, svkPadLen: 1,
    additional: 0,
  };
  for (const snap of snapshot.docs) {
    const d = snap.data() as Partial<ReceiptCounterDoc>;
    if ((d.smpAided   ?? 0) > result.smpAided)   { result.smpAided   = d.smpAided!;   result.smpAidedPadLen   = d.smpAidedPadLen   ?? 1; }
    if ((d.smpUnaided ?? 0) > result.smpUnaided) { result.smpUnaided = d.smpUnaided!; result.smpUnaidedPadLen = d.smpUnaidedPadLen ?? 1; }
    if ((d.svk        ?? 0) > result.svk)        { result.svk        = d.svk!;        result.svkPadLen        = d.svkPadLen        ?? 1; }
    if ((d.additional ?? 0) > result.additional)   result.additional = d.additional!;
  }
  return result;
}

/** Scans existing records and builds initial counter values, seeded from the
 *  global max across all years so receipt numbers never reset between years.
 *  SMP is split by aided/unaided; SVK and Additional are shared series. */
async function _buildCounterFromRecords(academicYear: AcademicYear): Promise<ReceiptCounterDoc> {
  const [records, globalMax] = await Promise.all([
    getFeeRecordsByAcademicYear(academicYear),
    _getGlobalCounterMax(),
  ]);
  const c: ReceiptCounterDoc = { ...globalMax };
  for (const r of records) {
    const aided = AIDED_COURSES.has(r.course);
    const smpN = parseInt(r.receiptNumber ?? '', 10);
    if (!isNaN(smpN)) {
      if (aided  && smpN > c.smpAided)   { c.smpAided   = smpN; c.smpAidedPadLen   = (r.receiptNumber ?? '').length; }
      if (!aided && smpN > c.smpUnaided) { c.smpUnaided = smpN; c.smpUnaidedPadLen = (r.receiptNumber ?? '').length; }
    }
    const svkRpt = r.svkReceiptNumber ?? '';
    if (svkRpt.startsWith(SVK_RPT_PREFIX)) {
      const numPart = svkRpt.slice(SVK_RPT_PREFIX.length);
      const svkN = parseInt(numPart, 10);
      if (!isNaN(svkN) && svkN > c.svk) { c.svk = svkN; c.svkPadLen = numPart.length; }
    }
    const addN = parseInt(r.additionalReceiptNumber ?? '', 10);
    if (!isNaN(addN) && addN > c.additional) c.additional = addN;
  }
  return c;
}

/**
 * Ensures the counter document exists in the new aided/unaided format.
 * If the document is missing OR has the old single-series format, it is rebuilt
 * by scanning all existing fee records for this academic year.
 */
async function _ensureCounterDoc(academicYear: AcademicYear): Promise<void> {
  const ref = doc(db, RECEIPT_COUNTERS_COL, academicYear);
  const snap = await getDoc(ref);
  const isCurrentFormat = (data: Record<string, unknown> | undefined) =>
    data?.smpAided !== undefined && data?.svk !== undefined;
  if (snap.exists() && isCurrentFormat(snap.data())) return;
  const initial = await _buildCounterFromRecords(academicYear);
  await runTransaction(db, async (tx) => {
    const check = await tx.get(ref);
    if (!check.exists() || !isCurrentFormat(check.data())) tx.set(ref, initial);
  });
}

/**
 * Reads the current counter and returns the NEXT suggested receipt numbers
 * for each type, based on the course's aided/unaided classification.
 * Does NOT modify the counter — calling this on modal open never wastes numbers.
 */
export async function peekNextReceiptNumbers(
  academicYear: AcademicYear,
  course: Course,
): Promise<{ smp: string; svk: string; additional: string }> {
  await _ensureCounterDoc(academicYear);
  const snap = await getDoc(doc(db, RECEIPT_COUNTERS_COL, academicYear));
  const d = snap.data() as ReceiptCounterDoc;
  const aided = AIDED_COURSES.has(course);

  const smpMax = aided ? (d.smpAided   ?? 0) : (d.smpUnaided ?? 0);
  const smpPad = aided ? (d.smpAidedPadLen ?? 1) : (d.smpUnaidedPadLen ?? 1);

  return {
    smp:        String(smpMax + 1).padStart(smpPad, '0'),
    svk:        `${SVK_RPT_PREFIX}${String((d.svk ?? 0) + 1).padStart(d.svkPadLen ?? 1, '0')}`,
    additional: String((d.additional ?? 0) + 1).padStart(4, '0'),
  };
}

/**
 * Called after a fee record is successfully saved. Updates the counter document
 * to max(current, usedNumber) for each receipt type, so the next peek returns
 * the correct next-in-sequence number regardless of manual overrides.
 * Skips any receipt type whose string is empty or non-numeric.
 */
export async function updateReceiptCounters(
  academicYear: AcademicYear,
  course: Course,
  used: { smp: string; svk: string; additional: string },
): Promise<void> {
  await _ensureCounterDoc(academicYear);
  const ref = doc(db, RECEIPT_COUNTERS_COL, academicYear);
  const aided = AIDED_COURSES.has(course);

  const smpN   = parseInt(used.smp, 10);
  const svkStr = used.svk.startsWith(SVK_RPT_PREFIX) ? used.svk.slice(SVK_RPT_PREFIX.length) : used.svk;
  const svkN   = parseInt(svkStr, 10);
  const addN   = parseInt(used.additional, 10);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() as ReceiptCounterDoc;
    const updates: Partial<ReceiptCounterDoc> = {};

    if (aided) {
      if (!isNaN(smpN) && smpN > d.smpAided) {
        updates.smpAided = smpN;
        updates.smpAidedPadLen = used.smp.length;
      }
    } else {
      if (!isNaN(smpN) && smpN > d.smpUnaided) {
        updates.smpUnaided = smpN;
        updates.smpUnaidedPadLen = used.smp.length;
      }
    }

    if (!isNaN(svkN) && svkN > d.svk) {
      updates.svk = svkN;
      updates.svkPadLen = svkStr.length;
    }
    if (!isNaN(addN) && addN > d.additional) updates.additional = addN;

    if (Object.keys(updates).length > 0) tx.update(ref, updates);
  });
}

/**
 * When a student's course or year is changed, updates all existing fee records
 * for that student in the given academic year to reflect the new values and
 * appends an auto-generated remark describing the change.
 *
 * All updates are committed in a single batch write.
 */
export async function applyCourseYearUpdate(
  studentId: string,
  academicYear: AcademicYear,
  oldCourse: Course,
  oldYear: Year,
  newCourse: Course,
  newYear: Year,
): Promise<void> {
  const records = await getFeeRecordsByStudent(studentId, academicYear);
  if (records.length === 0) return;

  const now = new Date().toISOString();
  const changeNote = `Course/Year changed: ${oldCourse} ${oldYear} → ${newCourse} ${newYear}`;
  const batch = writeBatch(db);

  for (const record of records) {
    const updatedRemarks = record.remarks
      ? `${record.remarks}; ${changeNote}`
      : changeNote;
    batch.update(doc(db, COL, record.id), {
      course: newCourse,
      year: newYear,
      remarks: updatedRemarks,
      updatedAt: now,
    });
  }

  await batch.commit();
}

/**
 * When a student's Adm Cat is changed (e.g. GM → SNQ), adjusts existing fee
 * records for that student in the given academic year:
 *  - Zeros out any SMP heads that are 0 in the new fee structure but were > 0
 *    in the old one (e.g. Tuition for SNQ students).
 *  - Updates the `admCat` field on each record so FeeHistoryModal picks up the
 *    correct fee structure for display.
 *  - Appends an auto-generated remark describing what was changed.
 *
 * All updates are committed in a single batch write.
 */
export async function applyAdmCatFeeAdjustment(
  studentId: string,
  academicYear: AcademicYear,
  course: Course,
  year: Year,
  admType: AdmType,
  oldAdmCat: AdmCat,
  newAdmCat: AdmCat,
): Promise<void> {
  const [oldStructure, newStructure] = await Promise.all([
    getFeeStructure(academicYear, course, year, admType, oldAdmCat),
    getFeeStructure(academicYear, course, year, admType, newAdmCat),
  ]);

  const records = await getFeeRecordsByStudent(studentId, academicYear);
  if (records.length === 0) return;

  // Heads where the new structure has 0 (i.e. the student no longer owes anything).
  const headsToZero = new Set<SMPFeeHead>(
    newStructure
      ? (Object.entries(newStructure.smp) as [SMPFeeHead, number][])
          .filter(([key, newAmt]) => newAmt === 0 && (oldStructure?.smp[key] ?? 0) > 0)
          .map(([key]) => key)
      : []
  );

  const now = new Date().toISOString();
  const batch = writeBatch(db);

  for (const record of records) {
    const updatedSmp = { ...record.smp };
    const adjustments: string[] = [];

    for (const key of headsToZero) {
      if (updatedSmp[key] > 0) {
        const paidAmt = updatedSmp[key];
        updatedSmp[key] = 0;
        const label = SMP_FEE_HEADS.find((h) => h.key === key)?.label ?? key;
        adjustments.push(`${label} ₹${paidAmt}→₹0`);
      }
    }

    const catNote = `Cat changed ${oldAdmCat}→${newAdmCat}`;
    const changeDetail =
      adjustments.length > 0
        ? `${catNote}; ${adjustments.join(', ')} (auto-adjusted)`
        : catNote;

    const updatedRemarks = record.remarks
      ? `${record.remarks}; ${changeDetail}`
      : changeDetail;

    batch.update(doc(db, COL, record.id), {
      admCat: newAdmCat,
      smp: updatedSmp,
      remarks: updatedRemarks,
      updatedAt: now,
    });
  }

  await batch.commit();
}
