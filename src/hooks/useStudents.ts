import { useState, useEffect } from 'react';
import { getStudentsByAcademicYear, type StudentFilters } from '../services/studentService';
import type { Student, AcademicYear } from '../types';

interface UseStudentsResult {
  students: Student[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useStudents(
  academicYear: AcademicYear | null,
  filters: StudentFilters = {}
): UseStudentsResult {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Destructure so individual scalars (not object identity) are dep-array values
  const { course, year, gender } = filters;

  useEffect(() => {
    if (!academicYear) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    getStudentsByAcademicYear(academicYear, { course, year, gender })
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
  }, [academicYear, course, year, gender, tick]);

  function refetch() {
    setTick((t) => t + 1);
  }

  return { students, loading, error, refetch };
}
