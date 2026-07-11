import type { Notice, Student } from '../../types';

export function noticeAppliesToMe(n: Notice, student: Student): boolean {
  if (n.archivedAt) return false; // "cleared for everyone" — kept in Firestore for admin review, hidden from students
  if (n.scope === 'all') return true;
  if (n.scope === 'academicYear') return n.scopeValue === student.academicYear;
  if (n.scope === 'course') return n.scopeValue === student.course;
  if (n.scope === 'regNumber') return n.scopeValue === student.regNumber;
  if (n.scope === 'selected') return (n.targetRegNumbers ?? []).includes(student.regNumber);
  return false;
}
