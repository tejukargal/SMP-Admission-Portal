import {
  doc,
  setDoc,
  deleteDoc,
  query,
  collection,
  where,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { FeeRecord, FeeRecordFormData, AcademicYear } from '../types';

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

/**
 * Returns the next SMP receipt number for a given academic year.
 * Finds the highest numeric receipt number saved so far and increments by 1.
 */
export async function getNextReceiptNumber(academicYear: AcademicYear): Promise<string> {
  const records = await getFeeRecordsByAcademicYear(academicYear);
  let max = 0;
  let padLen = 1;
  for (const r of records) {
    const n = parseInt(r.receiptNumber, 10);
    if (!isNaN(n) && n > max) {
      max = n;
      padLen = r.receiptNumber.length;
    }
  }
  return String(max + 1).padStart(padLen, '0');
}

/**
 * Returns the next Additional Fee receipt number for a given academic year.
 * Format: 4-digit zero-padded (e.g. "0001", "0002", ...).
 */
export async function getNextAdditionalReceiptNumber(academicYear: AcademicYear): Promise<string> {
  const records = await getFeeRecordsByAcademicYear(academicYear);
  let max = 0;
  for (const r of records) {
    const rpt = r.additionalReceiptNumber ?? '';
    if (rpt) {
      const n = parseInt(rpt, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return String(max + 1).padStart(4, '0');
}

const SVK_RPT_PREFIX = 'SVK DVP ';

/**
 * Returns the next SVK receipt number for a given academic year.
 * SVK receipt numbers follow the format "SVK DVP {n}" preserving zero-padding.
 */
export async function getNextSvkReceiptNumber(academicYear: AcademicYear): Promise<string> {
  const records = await getFeeRecordsByAcademicYear(academicYear);
  let max = 0;
  let padLen = 1;
  for (const r of records) {
    const svkRpt = r.svkReceiptNumber ?? '';
    if (svkRpt.startsWith(SVK_RPT_PREFIX)) {
      const numPart = svkRpt.slice(SVK_RPT_PREFIX.length);
      const n = parseInt(numPart, 10);
      if (!isNaN(n) && n > max) {
        max = n;
        padLen = numPart.length;
      }
    }
  }
  return `${SVK_RPT_PREFIX}${String(max + 1).padStart(padLen, '0')}`;
}
