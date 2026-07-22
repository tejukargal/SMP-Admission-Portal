import type { Student } from '../types';

// A student counted as "confirmed" for stats/totals: admissionStatus is
// CONFIRMED and they haven't transferred out to another polytechnic.
// Transferred-out students keep admissionStatus === 'CONFIRMED' (only the
// transferOut flag changes) so their fee records stay reachable everywhere
// else — this predicate is only for count/stat widgets, not working lists.
export function isConfirmedActive(s: Student): boolean {
  return s.admissionStatus === 'CONFIRMED' && !s.transferOut;
}
