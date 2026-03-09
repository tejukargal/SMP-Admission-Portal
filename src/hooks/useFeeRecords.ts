import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { FeeRecord, AcademicYear } from '../types';

export function useFeeRecords(academicYear: AcademicYear | null) {
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

    const q = query(
      collection(db, 'feeRecords'),
      where('academicYear', '==', academicYear)
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
  }, [academicYear, tick]);

  function refetch() { setTick((t) => t + 1); }

  return { records, loading, error, refetch };
}
