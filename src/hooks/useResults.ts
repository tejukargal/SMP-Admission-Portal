import { useState, useEffect } from 'react';
import type { ExamResult } from '../types';
import { getAllExamResults } from '../services/resultService';

interface UseResultsResult {
  results: ExamResult[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Module-level cache — survives component unmount/remount (navigation).
let _resultsCache: ExamResult[] | null = null;

export function useResults(): UseResultsResult {
  const [results, setResults] = useState<ExamResult[]>(() => _resultsCache ?? []);
  const [loading, setLoading] = useState(_resultsCache === null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (_resultsCache !== null) {
      setResults(_resultsCache);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getAllExamResults()
      .then((data) => {
        if (cancelled) return;
        _resultsCache = data;
        setResults(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load results');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  function refetch() {
    _resultsCache = null;
    setTick((t) => t + 1);
  }

  return { results, loading, error, refetch };
}
