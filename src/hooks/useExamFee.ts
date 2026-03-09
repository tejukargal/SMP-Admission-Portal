import { useState, useEffect } from 'react';
import { getExamFeeRecords } from '../services/examFeeService';
import type { ExamFeeRecord, AcademicYear } from '../types';

interface UseExamFeeResult {
  records: ExamFeeRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useExamFee(academicYear: AcademicYear | null): UseExamFeeResult {
  const [records, setRecords] = useState<ExamFeeRecord[]>([]);
  const [loading, setLoading] = useState(() => academicYear !== null);
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

    getExamFeeRecords(academicYear)
      .then((data) => {
        if (!cancelled) {
          setRecords(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load exam fee records');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [academicYear, tick]);

  function refetch() {
    setTick((t) => t + 1);
  }

  return { records, loading, error, refetch };
}
