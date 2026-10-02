import { useYearCollection } from './useYearCollection';
import type { RefundRecord } from '../services/refundService';
import type { AcademicYear } from '../types';

export function useRefundRecords(academicYear: AcademicYear | null) {
  const { docs, loading } = useYearCollection<RefundRecord>('refunds', academicYear);
  return { refunds: docs, loading };
}
