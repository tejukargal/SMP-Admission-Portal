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

export function useStudents(
  academicYear: AcademicYear | null,
  filters: StudentFilters = {}
): UseStudentsResult {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(() => academicYear !== null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const { course, year, gender } = filters;

  useEffect(() => {
    if (!academicYear) {
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
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
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student)));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [academicYear, course, year, gender, tick]);

  function refetch() {
    setTick((t) => t + 1);
  }

  return { students, loading, error, refetch };
}
