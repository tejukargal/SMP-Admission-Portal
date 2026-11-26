import { useState, useEffect } from 'react';
import { subscribeStudentDocuments } from '../services/studentDocumentService';
import type { DocRecord } from '../types';

interface Snapshot { id: string; docs: DocRecord | null; error: string }

/** Live checklist for one student — updates as soon as anyone saves a change. */
export function useStudentDocuments(studentId: string | null) {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!studentId) return;
    return subscribeStudentDocuments(
      studentId,
      (docs) => setSnap({ id: studentId, docs, error: '' }),
      () => setSnap({ id: studentId, docs: null, error: 'Failed to load document records.' }),
    );
  }, [studentId]);

  // Data from a previous student never leaks into the next one.
  const current = studentId && snap?.id === studentId ? snap : null;
  return {
    docs: current?.docs ?? null,
    loading: !!studentId && !current,
    error: current?.error ?? '',
  };
}
