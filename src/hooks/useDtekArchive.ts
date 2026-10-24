import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { getDtekArchivePage, type ArchivedDtekCircular } from '../services/dtekNewsService';

const PAGE_SIZE = 25;

/** Pages through dtekCirculars, newest date first. Nothing is read until
 *  `enabled` turns true, so the archive costs no reads unless someone opens it. */
export function useDtekArchive(enabled: boolean) {
  const [items, setItems] = useState<ArchivedDtekCircular[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const cursorRef = useRef<QueryDocumentSnapshot | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    cursorRef.current = null;
    setLoading(true);
    setError('');
    getDtekArchivePage(PAGE_SIZE)
      .then((page) => {
        if (cancelled) return;
        cursorRef.current = page.cursor;
        setItems(page.items);
        setHasMore(page.hasMore);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load previous circulars.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, tick]);

  const loadMore = useCallback(async () => {
    if (!cursorRef.current) return;
    setLoading(true);
    setError('');
    try {
      const page = await getDtekArchivePage(PAGE_SIZE, cursorRef.current);
      cursorRef.current = page.cursor;
      setItems((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load previous circulars.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { items, hasMore, loading, error, loadMore, refetch };
}
