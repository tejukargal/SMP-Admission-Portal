import type { AcademicYear, Course, FeeRecord, Student } from '../types';
import { SMP_FEE_HEADS } from '../types';
import type { StudentFeeRow } from './feeReportData';
import { isWPStudent } from './wpStudent';
import { aidedStatus, receiptAccountSplit } from './cashLedger';

// ── Fee Reports › Statistics ─────────────────────────────────────────────────
// Pure aggregation shared by the Statistics / Course & Year screens and their
// PDF/Excel exports, so the screen and the downloads always show the same figures.

// ── Student groups ───────────────────────────────────────────────────────────
// Transferred-out wins over WP: a WP student who transferred out is no longer on roll.
export type StudentGroup = 'REGULAR' | 'WP' | 'TRANSFERRED';
export const STUDENT_GROUPS: StudentGroup[] = ['REGULAR', 'WP', 'TRANSFERRED'];
export const STUDENT_GROUP_LABEL: Record<StudentGroup, string> = {
  REGULAR: 'Regular', WP: 'WP (Working Professional)', TRANSFERRED: 'Transferred out',
};

export function studentGroup(s: Student): StudentGroup {
  if (s.transferOut) return 'TRANSFERRED';
  if (isWPStudent(s)) return 'WP';
  return 'REGULAR';
}

// ── Totals for a set of students ─────────────────────────────────────────────

export interface FeeStats {
  students: number;
  fullyPaid: number;     // paid something and owes nothing
  partPaid: number;      // paid something, still owes
  notPaid: number;       // paid nothing
  withDues: number;      // balance > 0
  noDues: number;        // fee structure known and balance = 0
  noStructure: number;   // no fee structure / override → allotted unknown
  smpAllt: number; svkBaseAllt: number; addAllt: number; allotted: number;
  smpColl: number; svkBaseColl: number; addColl: number; collected: number;
  // Dues are summed per student (each clamped at 0), so one student's excess
  // payment never hides another student's due — same as the Dues report.
  smpBal: number; svkBaseBal: number; addBal: number; balance: number;
  excess: number;        // Σ (paid − allotted) where a student paid more than allotted
}

export function emptyFeeStats(): FeeStats {
  return {
    students: 0, fullyPaid: 0, partPaid: 0, notPaid: 0, withDues: 0, noDues: 0, noStructure: 0,
    smpAllt: 0, svkBaseAllt: 0, addAllt: 0, allotted: 0,
    smpColl: 0, svkBaseColl: 0, addColl: 0, collected: 0,
    smpBal: 0, svkBaseBal: 0, addBal: 0, balance: 0, excess: 0,
  };
}

function addRow(t: FeeStats, r: StudentFeeRow): void {
  t.students += 1;
  if (r.paid <= 0) t.notPaid += 1;
  if (r.allotted === null) t.noStructure += 1;
  else if ((r.balance ?? 0) > 0) { t.withDues += 1; if (r.paid > 0) t.partPaid += 1; }
  else { t.noDues += 1; if (r.paid > 0) t.fullyPaid += 1; }
  t.smpAllt += r.smpAllotted ?? 0;
  t.svkBaseAllt += r.svkBaseAllotted ?? 0;
  t.addAllt += r.additionalAllotted ?? 0;
  t.allotted += r.allotted ?? 0;
  t.smpColl += r.smpPaid;
  t.svkBaseColl += r.svkBasePaid;
  t.addColl += r.additionalPaid;
  t.collected += r.paid;
  t.smpBal += r.smpBalance ?? 0;
  t.svkBaseBal += r.svkBaseBalance ?? 0;
  t.addBal += r.additionalBalance ?? 0;
  t.balance += r.balance ?? 0;
  if (r.allotted !== null && r.paid > r.allotted) t.excess += r.paid - r.allotted;
}

export function computeFeeStats(rows: StudentFeeRow[]): FeeStats {
  const t = emptyFeeStats();
  for (const r of rows) addRow(t, r);
  return t;
}

/** Share of the allotted fee that is settled (allotted − dues) / allotted. */
export function collectionPct(t: FeeStats): number | null {
  return t.allotted > 0 ? ((t.allotted - t.balance) / t.allotted) * 100 : null;
}

export function pctLabel(t: FeeStats): string {
  const p = collectionPct(t);
  return p === null ? '—' : `${p.toFixed(1)}%`;
}

export function statsByGroup(rows: StudentFeeRow[]): Record<StudentGroup, FeeStats> {
  const out = { REGULAR: emptyFeeStats(), WP: emptyFeeStats(), TRANSFERRED: emptyFeeStats() };
  for (const r of rows) addRow(out[studentGroup(r.student)], r);
  return out;
}

// ── Course / year breakdown ──────────────────────────────────────────────────

const COURSE_ORDER: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const courseRank = (c: string) => { const i = COURSE_ORDER.indexOf(c as Course); return i < 0 ? 99 : i; };

export interface BreakdownLine { course: string; year: string; stats: FeeStats; }

export function courseYearBreakdown(rows: StudentFeeRow[]): BreakdownLine[] {
  const map = new Map<string, BreakdownLine>();
  for (const r of rows) {
    const key = `${r.student.course}__${r.student.year}`;
    let line = map.get(key);
    if (!line) { line = { course: r.student.course, year: r.student.year, stats: emptyFeeStats() }; map.set(key, line); }
    addRow(line.stats, r);
  }
  return [...map.values()].sort((a, b) => courseRank(a.course) - courseRank(b.course) || a.year.localeCompare(b.year));
}

/** Aided / Unaided subtotals — only when the rows contain both kinds. */
export function aidedSubtotals(rows: StudentFeeRow[]): { label: string; stats: FeeStats }[] {
  const aided = rows.filter((r) => aidedStatus(r.student.course) === 'AIDED');
  const unaided = rows.filter((r) => aidedStatus(r.student.course) === 'UNAIDED');
  if (!aided.length || !unaided.length) return [];
  return [
    { label: 'Aided (CE, ME, EC, CS)', stats: computeFeeStats(aided) },
    { label: 'Unaided (EE)', stats: computeFeeStats(unaided) },
  ];
}

/** Course/year/adm-type combinations whose students have no fee structure. */
export function missingStructureKeys(rows: StudentFeeRow[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.allotted === null) keys.add(`${r.student.course} ${r.student.year} · ${r.student.admType} / ${r.student.admCat}`);
  }
  return [...keys].sort();
}

// ── Previous-year dues collected this financial year ─────────────────────────
// Same definition as the Fee Register's "Due Fee" rows from earlier years: fee
// records dated in the current financial year whose academicYear is an earlier one.

export interface PriorDueAmounts { smp: number; svk: number; add: number; total: number; cash: number; upi: number; }

export interface PriorDueReceipt extends PriorDueAmounts { record: FeeRecord; receiptNos: string; }

export interface PriorDueGroup extends PriorDueAmounts { label: string; students: number; receipts: number; }

export interface PriorDuesSummary {
  receipts: PriorDueReceipt[];
  byYear: PriorDueGroup[];        // per academic year of the dues, latest first
  byCourseYear: PriorDueGroup[];  // per course / year of study
  totals: PriorDueGroup;
}

function emptyGroup(label: string): PriorDueGroup {
  return { label, students: 0, receipts: 0, smp: 0, svk: 0, add: 0, total: 0, cash: 0, upi: 0 };
}

export function receiptNumbers(r: FeeRecord): string {
  return [
    r.receiptNumber && `SMP ${r.receiptNumber}`,
    r.svkReceiptNumber,   // already reads "SVK DVP 1"
    r.additionalReceiptNumber && `Addl ${r.additionalReceiptNumber}`,
  ].filter(Boolean).join(', ');
}

export function buildPriorDues(records: FeeRecord[], currentYear: AcademicYear | string): PriorDuesSummary {
  const receipts: PriorDueReceipt[] = records
    .filter((r) => r.academicYear !== currentYear)
    .map((r) => {
      const smp = SMP_FEE_HEADS.reduce((s, { key }) => s + (r.smp?.[key] ?? 0), 0);
      const svk = r.svk ?? 0;
      const add = (r.additionalPaid ?? []).reduce((s, h) => s + (h.amount ?? 0), 0);
      const split = receiptAccountSplit(r);
      return {
        record: r, receiptNos: receiptNumbers(r),
        smp, svk, add, total: smp + svk + add,
        cash: split.SBI.cash + split.SVK.cash, upi: split.SBI.upi + split.SVK.upi,
      };
    })
    .sort((a, b) => a.record.date.localeCompare(b.record.date) || a.receiptNos.localeCompare(b.receiptNos, undefined, { numeric: true }));

  const byYear = new Map<string, { g: PriorDueGroup; ids: Set<string> }>();
  const byCourseYear = new Map<string, { g: PriorDueGroup; ids: Set<string>; course: string; year: string }>();
  const totals = emptyGroup('Total');
  const allIds = new Set<string>();
  const addTo = (g: PriorDueGroup, x: PriorDueReceipt) => {
    g.receipts += 1; g.smp += x.smp; g.svk += x.svk; g.add += x.add; g.total += x.total; g.cash += x.cash; g.upi += x.upi;
  };

  for (const x of receipts) {
    const r = x.record;
    const studentKey = `${r.studentId}__${r.academicYear}`;
    let y = byYear.get(r.academicYear);
    if (!y) { y = { g: emptyGroup(r.academicYear), ids: new Set() }; byYear.set(r.academicYear, y); }
    addTo(y.g, x); y.ids.add(studentKey);
    const cyKey = `${r.course}__${r.year}`;
    let c = byCourseYear.get(cyKey);
    if (!c) { c = { g: emptyGroup(`${r.course} ${r.year}`), ids: new Set(), course: r.course, year: r.year }; byCourseYear.set(cyKey, c); }
    addTo(c.g, x); c.ids.add(studentKey);
    addTo(totals, x); allIds.add(studentKey);
  }
  totals.students = allIds.size;

  return {
    receipts,
    byYear: [...byYear.values()].map(({ g, ids }) => ({ ...g, students: ids.size })).sort((a, b) => b.label.localeCompare(a.label)),
    byCourseYear: [...byCourseYear.values()]
      .sort((a, b) => courseRank(a.course) - courseRank(b.course) || a.year.localeCompare(b.year))
      .map(({ g, ids }) => ({ ...g, students: ids.size })),
    totals,
  };
}

// ── Discontinued students ────────────────────────────────────────────────────
// Confirmed students who later left (see isDiscontinued in utils/studentStatus).
// Paid amounts are gross; refunds (seat cancellation etc.) are reported separately.
// They owe nothing further, so the balance left when they left is "uncollected" and
// never counted as dues.

export interface DiscontinuedEntry { row: StudentFeeRow; refunded: number; }

export interface DiscontinuedTotals {
  label: string;
  students: number;
  paidStudents: number;
  refundedStudents: number;
  smpColl: number; svkBaseColl: number; addColl: number; collected: number;
  refunded: number;
  retained: number;      // collected − refunded
  uncollected: number;   // balance left at cancellation (informational)
}

export function discontinuedTotals(entries: DiscontinuedEntry[], label = 'Total'): DiscontinuedTotals {
  const t: DiscontinuedTotals = {
    label, students: 0, paidStudents: 0, refundedStudents: 0,
    smpColl: 0, svkBaseColl: 0, addColl: 0, collected: 0, refunded: 0, retained: 0, uncollected: 0,
  };
  for (const { row: r, refunded } of entries) {
    t.students += 1;
    if (r.paid > 0) t.paidStudents += 1;
    if (refunded > 0) t.refundedStudents += 1;
    t.smpColl += r.smpPaid;
    t.svkBaseColl += r.svkBasePaid;
    t.addColl += r.additionalPaid;
    t.collected += r.paid;
    t.refunded += refunded;
    t.uncollected += r.balance ?? 0;
  }
  t.retained = t.collected - t.refunded;
  return t;
}

export function discontinuedByCourseYear(entries: DiscontinuedEntry[]): DiscontinuedTotals[] {
  const map = new Map<string, DiscontinuedEntry[]>();
  for (const e of entries) {
    const key = `${e.row.student.course}__${e.row.student.year}`;
    const list = map.get(key);
    if (list) list.push(e); else map.set(key, [e]);
  }
  return [...map.values()]
    .sort((a, b) => courseRank(a[0].row.student.course) - courseRank(b[0].row.student.course)
      || a[0].row.student.year.localeCompare(b[0].row.student.year))
    .map((list) => discontinuedTotals(list, `${list[0].row.student.course} ${list[0].row.student.year}`));
}
