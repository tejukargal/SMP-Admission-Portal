import { useYearCollection } from './useYearCollection';
import type { AcademicYear, StudentFeeOverride } from '../types';

export function useFeeOverrides(academicYear: AcademicYear | null) {
  const { docs, loading } = useYearCollection<StudentFeeOverride>('feeOverrides', academicYear);
  return { overrides: docs, loading };
}
