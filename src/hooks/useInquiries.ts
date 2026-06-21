import { useState, useEffect } from 'react';
import { subscribeInquiries } from '../services/inquiryService';
import type { Inquiry, AcademicYear } from '../types';

interface UseInquiriesResult {
  inquiries: Inquiry[];
  loading: boolean;
  error: string | null;
}

// Module-level cache keyed by academicYear — survives page navigation so
// returning to the Inquiries page is instant without a loading flash.
const _cache = new Map<string, Inquiry[]>();

export function useInquiries(academicYear: AcademicYear | null): UseInquiriesResult {
  const cacheKey = academicYear ?? '';
  const [inquiries, setInquiries] = useState<Inquiry[]>(() => _cache.get(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !_cache.has(cacheKey) && academicYear !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!academicYear) {
      setInquiries([]);
      setLoading(false);
      return;
    }
    if (!_cache.has(cacheKey)) setLoading(true);
    setError(null);

    const unsubscribe = subscribeInquiries(
      academicYear,
      (data) => {
        // Sort newest-first client-side (avoids composite index requirement)
        const sorted = data.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        _cache.set(cacheKey, sorted);
        setInquiries(sorted);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [academicYear, cacheKey]);

  return { inquiries, loading, error };
}
