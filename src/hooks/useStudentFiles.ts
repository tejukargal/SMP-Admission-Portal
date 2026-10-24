import { useEffect, useState, useSyncExternalStore } from 'react';
import { subscribeStudentFiles, subscribeStudentFileCounts, studentFileErrorMessage } from '../services/studentFileService';
import type { Student, StudentFile } from '../types';

/** Live Files-tab list for one student (all academic years, newest first). */
export function useStudentFiles(student: Pick<Student, 'id' | 'regNumber'>) {
  const [files, setFiles] = useState<StudentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { id, regNumber } = student;

  useEffect(() => {
    const unsub = subscribeStudentFiles(
      { id, regNumber },
      (data) => { setFiles(data); setLoading(false); setError(null); },
      (err) => { setError(studentFileErrorMessage(err, 'Could not load files.')); setLoading(false); },
    );
    return unsub;
  }, [id, regNumber]);

  return { files, loading, error };
}

// ── Shared count store — one collection listener however many lists show 📎 badges ──
const EMPTY = new Map<string, number>();
let counts: Map<string, number> = EMPTY;
let unsubscribe: (() => void) | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!unsubscribe) {
    unsubscribe = subscribeStudentFileCounts(
      (next) => { counts = next; listeners.forEach((l) => l()); },
      () => { /* badges are optional — keep the last known counts */ },
    );
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribe) { unsubscribe(); unsubscribe = null; }
  };
}

/** Map<ownerKey, file count> — key with studentFileOwnerKey(student). */
export function useStudentFileCounts(): Map<string, number> {
  return useSyncExternalStore(subscribe, () => counts);
}
