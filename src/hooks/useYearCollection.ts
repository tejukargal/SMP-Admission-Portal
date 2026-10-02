import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AcademicYear } from '../types';

// Module-level cache keyed by "collection|year" — survives page navigation, so
// returning to a page renders instantly with no spinner.
const _cache = new Map<string, unknown[]>();

/**
 * Live `collection where academicYear == year` subscription, cache-first.
 * onSnapshot answers from the persistent IndexedDB cache straight away (getDocs
 * would wait on the server), then stays in sync with later writes.
 */
export function useYearCollection<T>(col: string, academicYear: AcademicYear | null) {
  const cacheKey = `${col}|${academicYear ?? ''}`;
  const [docs, setDocs] = useState<T[]>(() => (_cache.get(cacheKey) as T[] | undefined) ?? []);
  const [loading, setLoading] = useState(() => !_cache.has(cacheKey) && academicYear !== null);
  // Key the current `docs` state belongs to — see useFeeRecords for why.
  const [loadedKey, setLoadedKey] = useState(() => (_cache.has(cacheKey) || academicYear === null ? cacheKey : null));

  useEffect(() => {
    if (!academicYear) {
      setDocs([]);
      setLoading(false);
      setLoadedKey(cacheKey);
      return;
    }
    if (!_cache.has(cacheKey)) setLoading(true);
    const q = query(collection(db, col), where('academicYear', '==', academicYear));
    return onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
        _cache.set(cacheKey, data);
        setDocs(data);
        setLoadedKey(cacheKey);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [col, academicYear, cacheKey]);

  const stale = academicYear !== null && loadedKey !== cacheKey;
  const cached = _cache.get(cacheKey) as T[] | undefined;
  return {
    docs: stale ? (cached ?? []) : docs,
    loading: loading || (stale && !cached),
  };
}
