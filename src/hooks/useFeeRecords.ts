import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { FeeRecord, AcademicYear } from '../types';

/**
 * Derives the financial year date range (01-Apr to 31-Mar) from an academic year
 * string like '2025-26'. Used to query fee records by payment date instead of
 * academicYear field — so previous-year dues collected in the current financial
 * year still appear in the current year's Fee Register.
 */
function financialYearDateRange(academicYear: AcademicYear): { startDate: string; endDate: string } {
  const startYear = parseInt(academicYear.split('-')[0], 10);
  return {
    startDate: `${startYear}-04-01`,
    endDate:   `${startYear + 1}-03-31`,
  };
}

export function useFeeRecords(
  academicYear: AcademicYear | null,
  options?: { mode?: 'by-year' | 'by-date' },
) {
  const mode = options?.mode ?? 'by-year';
  const [records, setRecords] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(() => academicYear !== null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!academicYear) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const q = mode === 'by-date'
      ? (() => {
          const { startDate, endDate } = financialYearDateRange(academicYear);
          return query(
            collection(db, 'feeRecords'),
            where('date', '>=', startDate),
            where('date', '<=', endDate),
          );
        })()
      : query(
          collection(db, 'feeRecords'),
          where('academicYear', '==', academicYear),
        );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeRecord)));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [academicYear, mode, tick]);

  function refetch() { setTick((t) => t + 1); }

  return { records, loading, error, refetch };
}
