import { useState, useEffect } from 'react';
import { getFeeRecordsByAcademicYear } from '../services/feeRecordService';
import type { FeeRecord, AcademicYear } from '../types';

export function useFeeRecords(academicYear: AcademicYear | null) {
  const [records, setRecords] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!academicYear) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFeeRecordsByAcademicYear(academicYear)
      .then((data) => { if (!cancelled) setRecords(data); })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load fee records');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [academicYear, tick]);

  function refetch() { setTick((t) => t + 1); }

  return { records, loading, error, refetch };
}
