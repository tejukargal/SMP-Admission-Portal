/**
 * Loaders for the Collect Fee and Fee Details modals, plus an intent-based
 * prefetch: the Collect Fee page starts a load when the pointer reaches a
 * button (or the row menu opens), so by the time the click lands the data is
 * usually in hand and the modal renders it before its first paint.
 *
 * These are the same fresh Firestore reads the modals always made — only
 * started a moment earlier. A prefetched entry expires after a short window
 * and is dropped when a fee modal for that student closes, so a reopen after
 * a save always reads fresh.
 */
import { getAllFeeRecordsByStudent, getAllFeeRecordsByRegNumber, getFeeRecordsByStudent, peekNextReceiptNumbers } from '../../services/feeRecordService';
import { getFeeStructure } from '../../services/feeStructureService';
import { getFeeOverride } from '../../services/feeOverrideService';
import { getFineSchedule } from '../../services/fineScheduleService';
import { getRefundRecordsByStudent, isFeeNettingRefund } from '../../services/refundService';
import type {
  AcademicYear, AdmCat, AdmType, FeeRecord, FeeStructure, FinePeriod, Student, StudentFeeOverride,
} from '../../types';
import type { FeeHistoryStudentInfo } from './FeeHistoryModal';

// ── Loaders ──────────────────────────────────────────────────────────────────

export type CollectFeeData = [
  FeeStructure | null,
  FeeRecord[],
  { smp: string; svk: string; additional: string },
  FinePeriod[],
  StudentFeeOverride | null,
];

type CollectFeeStudent = Pick<Student, 'id' | 'course' | 'year' | 'admType' | 'admCat'>;

/** The Collect Fee modal's five reads, in parallel. */
export function loadCollectFeeData(
  student: CollectFeeStudent,
  academicYear: AcademicYear,
  counterYear: AcademicYear,
): Promise<CollectFeeData> {
  return Promise.all([
    getFeeStructure(
      academicYear,
      student.course,
      student.year,
      student.admType,
      student.admCat
    ),
    getFeeRecordsByStudent(student.id, academicYear),
    peekNextReceiptNumbers(counterYear, student.course),
    getFineSchedule(academicYear, student.year),
    getFeeOverride(student.id, academicYear),
  ]);
}

export interface YearData {
  academicYear: AcademicYear;
  records: FeeRecord[];
  structure: FeeStructure | null;
  override: StudentFeeOverride | null;
}

export interface FeeHistoryData {
  yearData: YearData[];
  /** SNQ refunds per academic year; null when the refund read failed (non-fatal). */
  refundedByYear: Map<string, number> | null;
}

/** The Fee Details modal's records → per-year structure/override reads, and its refund read. */
export function loadFeeHistoryData(student: FeeHistoryStudentInfo): Promise<FeeHistoryData> {
  // Query by both studentId and regNumber to capture records across all academic years.
  // A student re-enrolled in a new year gets a new document ID, so previous-year fee
  // records (saved with the old studentId) are only reachable via regNumber.
  // Results are merged and deduplicated by record ID.
  const yearDataPromise = Promise.all([
    getAllFeeRecordsByStudent(student.id),
    student.regNumber ? getAllFeeRecordsByRegNumber(student.regNumber) : Promise.resolve([] as FeeRecord[]),
  ]).then(([byId, byReg]) => {
    const seen = new Set<string>();
    const merged: FeeRecord[] = [];
    for (const r of [...byId, ...byReg]) {
      if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
    }
    return merged;
  })
    .then(async (records) => {

      const grouped = new Map<AcademicYear, FeeRecord[]>();
      for (const r of records) {
        const list = grouped.get(r.academicYear) ?? [];
        list.push(r);
        grouped.set(r.academicYear, list);
      }

      // Determine the most recent academic year across all records so we can
      // use the student's current course/year for that year's fee structure
      // lookup. This handles the case where a student's course/year was
      // changed after they had already made payments — all prior records
      // still carry the old course/year, so without this the allotted fee
      // structure would never update.  For older academic years we keep the
      // recorded values because they were accurate at the time of payment.
      const latestAY = [...grouped.keys()].sort().at(-1);

      const data: YearData[] = await Promise.all(
        [...grouped.entries()].map(async ([ay, recs]) => {
          const first = recs[0];
          const isLatest = ay === latestAY;
          // Always resolve the fee structure using the values stored on the
          // fee records themselves (course/year/admType/admCat at time of
          // payment).  We deliberately do NOT use student.year here — that
          // field reflects the student's CURRENT year-of-study (e.g. 3RD YEAR
          // in 2026-27) which is wrong for historical year groups (e.g. 2025-26
          // records that correctly carry 2ND YEAR).  Fee records are kept in
          // sync by applyCourseYearUpdate / applyAdmCatFeeAdjustment whenever
          // the student's details change mid-year.
          //
          // The primary structure, the latest-year fallback and the override
          // are read together (one round trip) rather than one after another;
          // the result is the same: primary ?? (latest year only) fallback.
          const [primary, fallback, override] = await Promise.all([
            getFeeStructure(ay, first.course, first.year, first.admType, first.admCat),
            // For the latest year only: if admType/admCat was changed very
            // recently and the fee-record update hasn't propagated, fall back
            // to the student's current admType/admCat (keeping course/year
            // from the record so we never cross year boundaries).
            isLatest
              ? getFeeStructure(ay, first.course, first.year, student.admType as AdmType, student.admCat as AdmCat)
              : Promise.resolve(null),
            getFeeOverride(first.studentId, ay),
          ]);
          const structure = primary ?? fallback;
          const sorted = [...recs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return { academicYear: ay, records: sorted, structure: structure ?? null, override };
        })
      );

      data.sort((a, b) => b.academicYear.localeCompare(a.academicYear));
      return data;
    });

  // Load SNQ refunds (by current studentId) and group amounts by academic year
  const refundsPromise = getRefundRecordsByStudent(student.id)
    .then((refunds) => {
      const map = new Map<string, number>();
      for (const r of refunds.filter(isFeeNettingRefund)) map.set(r.academicYear, (map.get(r.academicYear) ?? 0) + r.refundAmount);
      return map;
    })
    .catch(() => null /* non-fatal — dues simply won't be netted */);

  return Promise.all([yearDataPromise, refundsPromise]).then(([yearData, refundedByYear]) => ({ yearData, refundedByYear }));
}

// ── Prefetch cache ───────────────────────────────────────────────────────────

/** A load in flight or done. `data` is set once it resolves, so a modal can use it synchronously. */
export interface PendingLoad<T> {
  promise: Promise<T>;
  data?: T;
}

interface Entry<T> extends PendingLoad<T> {
  ts: number;
  studentId: string;
}

/** How long a prefetched load may wait for its click before it's considered stale. */
const FRESH_MS = 15_000;

const entries = new Map<string, Entry<unknown>>();

function track<T>(load: () => Promise<T>, studentId: string): Entry<T> {
  const entry: Entry<T> = { promise: load(), ts: Date.now(), studentId };
  entry.promise.then(
    (data) => { entry.data = data; },
    () => { /* the modal that takes it reports the error */ },
  );
  return entry;
}

function prefetch<T>(key: string, studentId: string, load: () => Promise<T>): void {
  const existing = entries.get(key);
  if (existing && Date.now() - existing.ts < FRESH_MS) return;
  const entry = track(load, studentId);
  entries.set(key, entry as Entry<unknown>);
  // A failed prefetch is dropped so the modal retries with a fresh read.
  entry.promise.catch(() => { if (entries.get(key) === entry) entries.delete(key); });
}

/**
 * Returns the prefetched load when it's still fresh, else starts a new one. The
 * entry is left in place (so React StrictMode's double effect run reuses it);
 * the page drops it with invalidateFeePrefetch() when the modal closes. Cold
 * loads (no prefetch) aren't stored, so other pages never see a reused read.
 */
function take<T>(key: string, studentId: string, load: () => Promise<T>): PendingLoad<T> {
  const existing = entries.get(key) as Entry<T> | undefined;
  if (existing && Date.now() - existing.ts < FRESH_MS) return existing;
  entries.delete(key);
  return track(load, studentId);
}

const collectKey = (s: CollectFeeStudent, academicYear: AcademicYear, counterYear: AcademicYear) =>
  `collect|${s.id}|${s.course}|${s.year}|${s.admType}|${s.admCat}|${academicYear}|${counterYear}`;
const historyKey = (s: FeeHistoryStudentInfo) =>
  `history|${s.id}|${s.regNumber}|${s.admType}|${s.admCat}`;

export function prefetchCollectFee(student: CollectFeeStudent, academicYear: AcademicYear, counterYear: AcademicYear): void {
  prefetch(collectKey(student, academicYear, counterYear), student.id, () => loadCollectFeeData(student, academicYear, counterYear));
}

export function takeCollectFee(student: CollectFeeStudent, academicYear: AcademicYear, counterYear: AcademicYear): PendingLoad<CollectFeeData> {
  return take(collectKey(student, academicYear, counterYear), student.id, () => loadCollectFeeData(student, academicYear, counterYear));
}

export function prefetchFeeHistory(student: FeeHistoryStudentInfo): void {
  prefetch(historyKey(student), student.id, () => loadFeeHistoryData(student));
}

export function takeFeeHistory(student: FeeHistoryStudentInfo): PendingLoad<FeeHistoryData> {
  return take(historyKey(student), student.id, () => loadFeeHistoryData(student));
}

/** Drops any prefetched loads for a student — call after their fees may have changed. */
export function invalidateFeePrefetch(studentId: string): void {
  for (const [key, entry] of entries) {
    if (entry.studentId === studentId) entries.delete(key);
  }
}
