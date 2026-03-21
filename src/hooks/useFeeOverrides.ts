import { useState, useEffect } from 'react';
import { getFeeOverridesByYear } from '../services/feeOverrideService';
import type { AcademicYear, StudentFeeOverride } from '../types';

export function useFeeOverrides(academicYear: AcademicYear | null) {
  const [overrides, setOverrides] = useState<StudentFeeOverride[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!academicYear) { setOverrides([]); return; }
    setLoading(true);
    getFeeOverridesByYear(academicYear)
      .then(setOverrides)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [academicYear]);

  return { overrides, loading };
}
