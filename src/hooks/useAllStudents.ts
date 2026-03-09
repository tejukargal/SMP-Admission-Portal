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

export function useAllStudents(): UseAllStudentsResult {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)));
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
    setTick((t) => t + 1);
  }

  return { students, loading, error, refetch };
}
