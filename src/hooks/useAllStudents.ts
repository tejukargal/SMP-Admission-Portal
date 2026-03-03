import { useState, useEffect } from 'react';
import { getAllStudents } from '../services/studentService';
import type { Student } from '../types';

interface UseAllStudentsResult {
  students: Student[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAllStudents(): UseAllStudentsResult {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAllStudents()
      .then((list) => {
        if (!cancelled) {
          setStudents(list);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load students');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  function refetch() {
    setTick((t) => t + 1);
  }

  return { students, loading, error, refetch };
}
