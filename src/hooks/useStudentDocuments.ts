import { useState, useEffect } from 'react';
import { getStudentDocuments, mergeWithDefaults } from '../services/studentDocumentService';
import type { DocRecord } from '../types';

export function useStudentDocuments(studentId: string | null) {
  const [docs, setDocs] = useState<DocRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) { setDocs(null); return; }
    let cancelled = false;
    setLoading(true);
    setError('');

    getStudentDocuments(studentId)
      .then((record) => {
        if (!cancelled) setDocs(mergeWithDefaults(record.docs));
      })
      .catch(() => { if (!cancelled) setError('Failed to load document records.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [studentId]);

  return { docs, setDocs, loading, error };
}
