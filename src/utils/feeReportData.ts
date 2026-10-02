import type { FeeRecord, SMPFeeHead, Student } from '../types';
import { SMP_FEE_HEADS } from '../types';

export interface StudentFeeRow {
  student: Student;
  smpAllotted: number | null;
  svkAllotted: number | null;
  allotted: number | null;
  smpPaid: number;
  svkPaid: number;
  paid: number;
  smpBalance: number | null;
  svkBalance: number | null;
  balance: number | null;
  // SVK management fee and Additional heads (Red Cross, Insurance, etc.), tracked
  // separately from the combined `svkAllotted` above — used by the Fee Reports
  // dashboard cards for a true 3-way SMP/SVK/Additional allotment breakdown.
  svkBaseAllotted: number | null;
  additionalAllotted: number | null;
  // Paid-side / balance-side split, mirrors the allotted-side split above.
  svkBasePaid: number;
  additionalPaid: number;
  svkBaseBalance: number | null;
  additionalBalance: number | null;
}

function formatDayLabelLocal(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}

export interface DatewiseHeadwiseEntry {
  dateKey: string;
  dateLabel: string;
  heads: Record<SMPFeeHead, number>;
  total: number;
}

export function buildDatewiseHeadwise(records: FeeRecord[]): DatewiseHeadwiseEntry[] {
  const map = new Map<string, DatewiseHeadwiseEntry>();
  for (const r of records) {
    const dateKey = r.date.slice(0, 10);
    if (!map.has(dateKey)) {
      const heads = {} as Record<SMPFeeHead, number>;
      for (const { key } of SMP_FEE_HEADS) heads[key] = 0;
      map.set(dateKey, { dateKey, dateLabel: formatDayLabelLocal(dateKey), heads, total: 0 });
    }
    const e = map.get(dateKey)!;
    for (const { key } of SMP_FEE_HEADS) e.heads[key] += r.smp[key];
    e.total = SMP_FEE_HEADS.reduce((s, { key }) => s + e.heads[key], 0);
  }
  return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
