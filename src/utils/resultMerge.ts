import type { ExamResult, ExamResultSubject, ExamResultSemesterSummary } from '../types';

// Display-only merged view: Firestore keeps one doc per semester (Format B)
// or per exam session (Format A) — see resultService.ts — but a student with
// backlog subjects can have several such docs. This groups them into a
// single record so results read as one consolidated academic record instead
// of one row/card per imported sheet.
export interface MergedExamResult extends ExamResult {
  semesterCount: number;
  sourceCount: number;
  sourceIds: string[];
}

function maxSemester(r: ExamResult): number {
  return r.semesterSummary.reduce((max, s) => Math.max(max, s.semester), 0);
}

function mergeByKey(results: ExamResult[], keyFn: (r: ExamResult) => string): MergedExamResult[] {
  const groups = new Map<string, ExamResult[]>();
  for (const r of results) {
    const key = keyFn(r);
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }

  const merged: MergedExamResult[] = [];

  for (const docs of groups.values()) {
    const primary = docs.slice().sort((a, b) => {
      const semDiff = maxSemester(b) - maxSemester(a);
      if (semDiff !== 0) return semDiff;
      return (b.updatedAt || b.importedAt).localeCompare(a.updatedAt || a.importedAt);
    })[0];

    const subjectMap = new Map<string, { subject: ExamResultSubject; updatedAt: string }>();
    const semesterMap = new Map<number, { entry: ExamResultSemesterSummary; updatedAt: string }>();
    const semesters = new Set<number>();

    for (const d of docs) {
      const updatedAt = d.updatedAt || d.importedAt;

      for (const s of d.subjects) {
        const key = `${s.sem}__${s.code}`;
        const existing = subjectMap.get(key);
        if (!existing || updatedAt > existing.updatedAt) {
          subjectMap.set(key, { subject: s, updatedAt });
        }
      }

      for (const s of d.semesterSummary) {
        semesters.add(s.semester);
        const existing = semesterMap.get(s.semester);
        if (!existing || updatedAt > existing.updatedAt) {
          semesterMap.set(s.semester, { entry: s, updatedAt });
        }
      }
    }

    const subjects = Array.from(subjectMap.values())
      .map((v) => v.subject)
      .sort((a, b) => a.sem - b.sem || a.code.localeCompare(b.code));

    const semesterSummary = Array.from(semesterMap.values())
      .map((v) => v.entry)
      .sort((a, b) => a.semester - b.semester);

    merged.push({
      ...primary,
      subjects,
      semesterSummary,
      semesterCount: semesters.size,
      sourceCount: docs.length,
      sourceIds: docs.map((d) => d.id),
    });
  }

  return merged;
}

// One row per student — used by the Results page listing, which spans many
// students and should read as one consolidated academic record per student
// regardless of how many semesters/sessions contributed to it.
export function mergeStudentResults(results: ExamResult[]): MergedExamResult[] {
  return mergeByKey(results, (r) => r.regNumber || r.id);
}

// One section per (student, exam session) — used by a single student's
// results tab, where separate exam sessions (e.g. a later backlog sitting)
// should stay visually distinct, but multiple sheets printed under the same
// session title (e.g. separate Sem-1/Sem-2 ledgers both titled "May 2026")
// should consolidate into one section instead of showing as duplicates.
export function mergeResultsBySession(results: ExamResult[]): MergedExamResult[] {
  return mergeByKey(results, (r) => `${r.regNumber || r.id}__${r.examSession}`);
}
