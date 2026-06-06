import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';

/** Returns the academic year string for a given date, e.g. "2026-27". */
export function certAcademicYear(date: Date = new Date()): string {
  const month = date.getMonth() + 1; // 1-12
  const year  = date.getFullYear();
  const start = month >= 6 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/**
 * Atomically increments the global CCC counter and returns the next number.
 * Stored at config/cccCounter → { count: number }.
 */
export async function getNextCccNumber(): Promise<number> {
  const counterRef = doc(db, 'config', 'cccCounter');
  return runTransaction(db, async (tx) => {
    const snap    = await tx.get(counterRef);
    const current = snap.exists() ? (snap.data().count as number) : 0;
    const next    = current + 1;
    tx.set(counterRef, { count: next }, { merge: true });
    return next;
  });
}
