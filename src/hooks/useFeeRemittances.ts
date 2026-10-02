import { useState, useEffect } from 'react';
import { subscribeFeeRemittances } from '../services/feeRemittanceService';
import type { FeeRemittance, AcademicYear, RemittanceScope } from '../types';

const _cache = new Map<string, FeeRemittance[]>();

export function useFeeRemittances(academicYear: AcademicYear | null, scope: RemittanceScope = 'main') {
  const cacheKey = `${scope}__${academicYear ?? ''}`;
  const [remittances, setRemittances] = useState<FeeRemittance[]>(() => _cache.get(cacheKey) ?? []);
  const [loading, setLoading]         = useState(() => !_cache.has(cacheKey) && academicYear !== null);
  const [error, setError]             = useState<string | null>(null);
  const [tick, setTick]               = useState(0);

  useEffect(() => {
    if (!academicYear) { setRemittances([]); setLoading(false); return; }
    if (!_cache.has(cacheKey)) setLoading(true);
    setError(null);

    const unsubscribe = subscribeFeeRemittances(
      academicYear,
      (data) => { _cache.set(cacheKey, data); setRemittances(data); setLoading(false); },
      (err)  => { setError(err.message); setLoading(false); },
      scope,
    );
    return unsubscribe;
  }, [academicYear, scope, cacheKey, tick]);

  function refetch() { _cache.delete(cacheKey); setTick((t) => t + 1); }

  return { remittances, loading, error, refetch };
}
