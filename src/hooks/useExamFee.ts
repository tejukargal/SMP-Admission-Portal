import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
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
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'examFeeRecords'),
      where('academicYear', '==', academicYear)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamFeeRecord)));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [academicYear, tick]);

  function refetch() {
    setTick((t) => t + 1);
  }

  return { records, loading, error, refetch };
}
