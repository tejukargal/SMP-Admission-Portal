import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, type QueryConstraint } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { StudentFilters } from '../services/studentService';
import type { Student, AcademicYear } from '../types';

interface UseStudentsResult {
  students: Student[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Module-level cache keyed by query fingerprint — survives page navigation.
// Pages that call useStudents(academicYear) with no filters share the same cache entry
// so navigating back is instant without a loading flash.
const _cache = new Map<string, Student[]>();

export function useStudents(
  academicYear: AcademicYear | null,
  filters: StudentFilters = {}
): UseStudentsResult {
  const { course, year, gender } = filters;
  const cacheKey = `${academicYear ?? ''}|${course ?? ''}|${year ?? ''}|${gender ?? ''}`;

  const [students, setStudents] = useState<Student[]>(() => _cache.get(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !_cache.has(cacheKey) && academicYear !== null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!academicYear) {
      setStudents([]);
      setLoading(false);
      return;
    }
    if (!_cache.has(cacheKey)) setLoading(true);
    setError(null);

    const constraints: QueryConstraint[] = [
      where('academicYear', '==', academicYear),
    ];
    if (course) constraints.push(where('course', '==', course));
    if (year)   constraints.push(where('year',   '==', year));
    if (gender) constraints.push(where('gender', '==', gender));
    constraints.push(orderBy('createdAt', 'desc'));

    const q = query(collection(db, 'students'), ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
        _cache.set(cacheKey, data);
        setStudents(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [academicYear, course, year, gender, tick, cacheKey]);

  function refetch() {
    _cache.delete(cacheKey);
    setTick((t) => t + 1);
  }

  return { students, loading, error, refetch };
}
