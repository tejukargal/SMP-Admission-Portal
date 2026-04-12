import { useState, useEffect } from 'react';
import { subscribeInquiries } from '../services/inquiryService';
import type { Inquiry, AcademicYear } from '../types';

interface UseInquiriesResult {
  inquiries: Inquiry[];
  loading: boolean;
  error: string | null;
}

export function useInquiries(academicYear: AcademicYear | null): UseInquiriesResult {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(() => academicYear !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!academicYear) {
      setInquiries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeInquiries(
      academicYear,
      (data) => {
        // Sort newest-first client-side (avoids composite index requirement)
        setInquiries(data.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [academicYear]);

  return { inquiries, loading, error };
}
