import type { Student } from '../types';

// A student counted as "confirmed" for stats/totals: admissionStatus is
// CONFIRMED and they haven't transferred out to another polytechnic.
// Transferred-out students keep admissionStatus === 'CONFIRMED' (only the
// transferOut flag changes) so their fee records stay reachable everywhere
// else — this predicate is only for count/stat widgets, not working lists.
export function isConfirmedActive(s: Student): boolean {
  return s.admissionStatus === 'CONFIRMED' && !s.transferOut;
}

// A confirmed student who later left: status CANCELLED and either explicitly marked
// Discontinued, or has fee payments (fees are only collected after confirmation, so a
// cancelled student who paid was confirmed first). The flag only counts while the status
// is still CANCELLED, so re-confirming a student via the Edit form can't leave it stale.
// Cancelled students without either are seats cancelled before joining.
export function isDiscontinued(s: Student, feePaid: number): boolean {
  return s.admissionStatus?.trim() === 'CANCELLED' && (s.discontinued === true || feePaid > 0);
}
