import type { AcademicYear, FeeAdditionalHead, FeeRecord, FeeStructure, SMPHeads, StudentFeeOverride } from '../types';
import { SMP_FEE_HEADS } from '../types';

// ─── Fee history helpers ──────────────────────────────────────────────────────
// Shared by StudentDetailModal (admin) and the student self-service portal —
// keep this the single source of truth for paid/allotted/due math.

export function sumSMPRecord(smp: FeeRecord['smp']): number {
  return SMP_FEE_HEADS.reduce((s, { key }) => s + smp[key], 0);
}

export function calcRecordTotal(r: FeeRecord): number {
  return sumSMPRecord(r.smp) + r.svk + r.additionalPaid.reduce((s, h) => s + h.amount, 0);
}

export function calcEffectiveFine(smpFineAllotted: number, records: FeeRecord[]): number {
  const finePaid = records.reduce((sum, r) => sum + r.smp.fine, 0);
  return Math.max(smpFineAllotted, finePaid);
}

export function calcAllotted(
  smpValues: SMPHeads,
  svk: number,
  additionalHeads: FeeAdditionalHead[],
  records: FeeRecord[],
): number {
  const effectiveFine = calcEffectiveFine(smpValues.fine, records);
  const smpTotal = SMP_FEE_HEADS.reduce(
    (t, { key }) => t + (key === 'fine' ? effectiveFine : smpValues[key]),
    0,
  );
  return smpTotal + svk + additionalHeads.reduce((t, h) => t + h.amount, 0);
}

export interface YearData {
  academicYear: AcademicYear;
  records: FeeRecord[];
  structure: FeeStructure | null;
  override: StudentFeeOverride | null;
}

export function effectiveValues(yd: YearData): { smp: SMPHeads; svk: number; additional: FeeAdditionalHead[] } | null {
  if (yd.override) return { smp: yd.override.smp, svk: yd.override.svk, additional: yd.override.additionalHeads };
  if (yd.structure) return { smp: yd.structure.smp, svk: yd.structure.svk, additional: yd.structure.additionalHeads };
  return null;
}
