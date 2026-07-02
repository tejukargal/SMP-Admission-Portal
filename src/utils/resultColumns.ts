import type { ExamResult } from '../types';

export type ResultColumnGroup = 'Identity' | 'Semester Summary' | 'Outcome';

// Only flat/scalar fields are selectable as table columns — subjects and
// semesterSummary are arrays shown via the row detail view instead.
export type ResultColumnKey = Exclude<keyof ExamResult, 'subjects' | 'semesterSummary' | 'id'>;

export interface ResultColumnDef {
  key: ResultColumnKey;
  label: string;
  group: ResultColumnGroup;
  align: 'left' | 'center' | 'right';
}

export const RESULT_COLUMNS: ResultColumnDef[] = [
  // ── Identity ──────────────────────────────────────────────────────────────
  { key: 'regNumber',    label: 'Reg No',       group: 'Identity', align: 'left'   },
  { key: 'studentName',  label: 'Student Name', group: 'Identity', align: 'left'   },
  { key: 'parentName',   label: 'Parent Name',  group: 'Identity', align: 'left'   },
  { key: 'course',       label: 'Course',       group: 'Identity', align: 'center' },
  { key: 'year',         label: 'Year',         group: 'Identity', align: 'center' },
  { key: 'academicYear', label: 'Academic Year', group: 'Identity', align: 'center' },
  { key: 'collegeCode',  label: 'College Code', group: 'Identity', align: 'center' },
  { key: 'examSession',  label: 'Exam Session', group: 'Identity', align: 'left'   },

  // ── Semester Summary ──────────────────────────────────────────────────────
  { key: 'creditsEarnedCumulative', label: 'Credits (Cumulative)', group: 'Semester Summary', align: 'right' },

  // ── Outcome ───────────────────────────────────────────────────────────────
  { key: 'cgpa',                 label: 'CGPA',        group: 'Outcome', align: 'right' },
  { key: 'cgpaStatus',           label: 'CGPA Status', group: 'Outcome', align: 'left'  },
  { key: 'percentageConversion', label: '% Conversion', group: 'Outcome', align: 'right' },
  { key: 'overallResult',        label: 'Result',      group: 'Outcome', align: 'center' },
];

export const RESULT_COLUMN_GROUPS: ResultColumnGroup[] = ['Identity', 'Semester Summary', 'Outcome'];

export const DEFAULT_RESULT_COLUMNS: ResultColumnKey[] = [
  'regNumber', 'studentName', 'course', 'year', 'academicYear', 'examSession', 'cgpa', 'overallResult',
];

export function formatResultColumnValue(col: ResultColumnDef, r: ExamResult): string {
  const v = r[col.key];
  if (v === undefined || v === null || v === '') return '—';
  return String(v);
}
