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

// Working Professionals enroll directly into 2nd Year and finish the Diploma in
// two years — identical to a lateral-entry admission. Certificate wording, the
// study-from year and admission-order titles all key off this, NOT off
// admType === 'LATERAL' alone. Fee rules deliberately do not use it: the
// FeeCollectionModal lateral fine-exemption stays keyed to LATERAL only.
export function isLateralEntry(admType?: string | null): boolean {
  return admType === 'LATERAL' || admType === 'EXTERNAL';
}

// Printed on the Study / Transfer / Provisional / Course Completion certificates
// of DB-backed WP students (admType EXTERNAL). Manual certificates synthesize
// admType 'LATERAL', so they deliberately do not carry this line.
export const WP_CERTIFICATE_NOTE =
  'Admitted as a Working Professional (Evening College) under the Lateral Entry scheme.';
