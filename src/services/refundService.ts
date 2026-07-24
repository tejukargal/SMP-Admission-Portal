import { doc, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Course, Year, AcademicYear } from '../types';

export type RefundPaymentType = 'CHEQUE' | 'ACCOUNT_PAYEE_CHEQUE' | 'NEFT' | 'CASH' | 'UPI';
export type RefundCategory = 'SNQ' | 'SEAT_CANCELLATION' | 'GENERAL';

export interface RefundReceiptLine {
  date: string;
  receiptNumber: string;
  amount: number;
}

export interface RefundHeadLine {
  label: string;
  amount: number;
}

export interface RefundRecord {
  id: string;
  studentId: string;
  studentName: string;
  fatherName: string;
  regNumber: string;
  course: Course;
  year: Year;
  academicYear: AcademicYear;
  totalPaid: number;                      // sum of all fee records at time of issuance
  receiptBreakdown: RefundReceiptLine[];   // SNQ: SMP-only per-receipt snapshot for the printed voucher / audit trail
  refundAmount: number;                   // editable, defaults to totalPaid
  paymentType: RefundPaymentType;
  referenceNumber: string;                // cheque/NEFT ref; blank allowed for CASH
  paymentDate: string;                    // ISO date of the refund payment
  remarks: string;
  issuedBy: string;                       // admin's email
  issuedAt: string;                       // ISO timestamp of voucher generation
  refundCategory?: RefundCategory;        // absent = 'SNQ' (backward compat with existing records)
  headBreakdown?: RefundHeadLine[];       // SEAT_CANCELLATION: SMP/SVK/Additional subtotal snapshot
}

const COL = 'refunds';

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Persist a refund record as its own document (append-only audit record). */
export async function saveRefundRecord(data: Omit<RefundRecord, 'id'>): Promise<RefundRecord> {
  const record: RefundRecord = { ...data, id: makeId() };
  await setDoc(doc(db, COL, record.id), record);
  return record;
}

/** Read refund records for a student, sorted newest-first. */
export async function getRefundRecordsByStudent(studentId: string): Promise<RefundRecord[]> {
  const q = query(collection(db, COL), where('studentId', '==', studentId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as RefundRecord))
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

/** Read all refund records for an academic year (for netting refunds in fee reports). */
export async function getRefundRecordsByAcademicYear(academicYear: AcademicYear): Promise<RefundRecord[]> {
  const q = query(collection(db, COL), where('academicYear', '==', academicYear));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RefundRecord));
}

/** Permanently delete a refund record (admin-only per Firestore rules). */
export async function deleteRefundRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** True for refund categories that correspond to a feeRecords entry and must be
 *  netted against paid totals. GENERAL refunds cover money paid outside the fee
 *  system (e.g. direct UPI to bank), so they're excluded from all netting. */
export function isFeeNettingRefund(r: RefundRecord): boolean {
  return (r.refundCategory ?? 'SNQ') !== 'GENERAL';
}
