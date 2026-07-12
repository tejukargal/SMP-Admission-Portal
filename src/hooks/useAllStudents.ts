import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
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

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let retriedAfterTokenRefresh = false;

    function attach() {
      unsubscribe = onSnapshot(
        collection(db, 'students'),
        (snap) => {
          _studentCache = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
          setStudents(_studentCache);
          setLoading(false);
          setError(null);
        },
        (err) => {
          // A long-lived listener can occasionally be torn down with a spurious
          // permission-denied error right as the ID token silently rotates in the
          // background — the already-open stream doesn't always pick up the
          // refreshed token in time (mirrors the retry AuthContext already does
          // for the same class of transient failure on login). Force a token
          // refresh and reattach once before surfacing the error to the user.
          if (!retriedAfterTokenRefresh && err.code === 'permission-denied' && auth.currentUser) {
            retriedAfterTokenRefresh = true;
            auth.currentUser.getIdToken(true)
              .then(() => { if (!cancelled) attach(); })
              .catch(() => { if (!cancelled) { setError(err.message); setLoading(false); } });
            return;
          }
          setError(err.message);
          setLoading(false);
        }
      );
    }

    attach();

    return () => { cancelled = true; unsubscribe?.(); };
  }, [tick]);

  function refetch() {
    _studentCache = null; // force reload on next mount
    setTick((t) => t + 1);
  }

  return { students, loading, error, refetch };
}
