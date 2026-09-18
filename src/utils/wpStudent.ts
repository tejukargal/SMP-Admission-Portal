import type { Student } from '../types';

// Working Professional (evening college) admission — recorded with Adm Type
// EXTERNAL. WP students are enrolled and confirmed through the normal flow but
// are managed on their own page (/wp-students) and are deliberately excluded
// from every day-college list and count, since WP intake is administratively
// separate (its fee is tracked as manual counts in Fee Reports → WP Fee
// Distribution). They are kept only to issue Study / Transfer / Provisional /
// Course Completion certificates.
export function isWPStudent(s: Student): boolean {
  return s.admType === 'EXTERNAL';
}
