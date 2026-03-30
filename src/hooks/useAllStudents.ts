import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Student } from '../types';

interface UseAllStudentsResult {
  students: Student[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Module-level cache — survives component unmount/remount (navigation).
// Dashboard returns instantly without a skeleton flash on every visit.
let _studentCache: Student[] | null = null;

export function useAllStudents(): UseAllStudentsResult {
  const [students, setStudents] = useState<Student[]>(() => _studentCache ?? []);
  const [loading, setLoading] = useState(_studentCache === null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Only show the loading skeleton when there is truly no data yet.
    // On return visits the cache is populated, so loading stays false.
    if (_studentCache === null) setLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        _studentCache = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
        setStudents(_studentCache);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [tick]);

  function refetch() {
    _studentCache = null; // force reload on next mount
    setTick((t) => t + 1);
  }

  return { students, loading, error, refetch };
}
