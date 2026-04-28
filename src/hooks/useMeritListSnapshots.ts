import { useState, useEffect } from 'react';
import { getMeritListSnapshots } from '../services/meritListSnapshotService';
import type { AcademicYear, MeritListSnapshot } from '../types';

interface Result {
  snapshots: MeritListSnapshot[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMeritListSnapshots(academicYear: AcademicYear | null): Result {
  const [snapshots, setSnapshots] = useState<MeritListSnapshot[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [tick, setTick]           = useState(0);

  useEffect(() => {
    if (!academicYear) { setSnapshots([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMeritListSnapshots(academicYear)
      .then((data) => { if (!cancelled) { setSnapshots(data); setLoading(false); } })
      .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [academicYear, tick]);

  return { snapshots, loading, error, refetch: () => setTick((t) => t + 1) };
}
