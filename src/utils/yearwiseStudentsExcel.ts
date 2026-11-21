import type ExcelJS from 'exceljs';
import type { Student } from '../types';
import { formatColumnValue, type ColumnDef } from './studentColumns';

// Settings › Backup & Restore › Yearwise Students — confirmed students across
// several academic years: Summary + All Years + one sheet per year.

const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };
const STUDY_YEARS = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];

/** Newest academic year first, then year of study → course → name. */
export function sortYearwise(students: Student[]): Student[] {
  return [...students].sort((a, b) =>
    b.academicYear.localeCompare(a.academicYear)
    || (YEAR_ORDER[a.year] ?? 9) - (YEAR_ORDER[b.year] ?? 9)
    || a.course.localeCompare(b.course)
    || a.studentNameSSLC.localeCompare(b.studentNameSSLC));
}

type Cell = string | number | null;

function cellFor(col: ColumnDef, s: Student, i: number): Cell {
  if (col.key === 'slNo') return i + 1;
  if (col.key === 'mobile') return s.studentMobile || s.fatherMobile || null;
  const v = s[col.key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Yes' : null;
  if (typeof v === 'number') return v;
  if (col.align === 'right' && typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  const text = formatColumnValue(col, s, i);
  return text === '—' ? null : text;
}

const HEAD_FILL = 'FF0B7BC0';

function addTable(wb: ExcelJS.Workbook, name: string, columns: ColumnDef[], rows: Student[]) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  const header = ['Sl', ...columns.map((c) => c.label)];
  ws.addRow(header);
  rows.forEach((s, i) => ws.addRow([i + 1, ...columns.map((c) => cellFor(c, s, i))]));

  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
  head.alignment = { vertical: 'middle' };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };

  ws.getColumn(1).width = 6;
  ws.getColumn(1).alignment = { horizontal: 'center' };
  columns.forEach((c, idx) => {
    let w = c.label.length;
    for (let r = 0; r < Math.min(rows.length, 400); r++) {
      w = Math.max(w, String(cellFor(c, rows[r], r) ?? '').length);
    }
    const col = ws.getColumn(idx + 2);
    col.width = Math.min(Math.max(w + 2, 7), 45);
    col.alignment = { horizontal: c.align };
  });
}

export interface YearwiseExcelInput {
  students: Student[];          // already filtered
  columns: ColumnDef[];         // chosen columns, registry order, without slNo
  years: string[];              // selected academic years
  courses: string[];            // course options present (for summary columns)
  filterLine: string;
  fileName: string;
}

export async function exportYearwiseStudentsExcel(input: YearwiseExcelInput): Promise<void> {
  const { default: ExcelJSLib } = await import('exceljs');
  const wb = new ExcelJSLib.Workbook();
  wb.creator = 'SMP Admissions';
  wb.created = new Date();

  const sorted = sortYearwise(input.students);
  const years = [...input.years].sort().reverse();
  const byYear = new Map<string, Student[]>();
  for (const y of years) byYear.set(y, []);
  for (const s of sorted) byYear.get(s.academicYear)?.push(s);

  // ── Summary ────────────────────────────────────────────────────────────────
  const sum = wb.addWorksheet('Summary');
  sum.addRow(['Confirmed Students — Yearwise']).font = { bold: true, size: 14 };
  sum.addRow([`Generated ${new Date().toLocaleString('en-IN')}`]);
  sum.addRow([input.filterLine]);
  sum.addRow(['Confirmed = Admission Status CONFIRMED, excluding transferred-out and Working Professional (EXTERNAL) students.']).font = { italic: true, color: { argb: 'FF6B7280' } };
  sum.addRow([]);

  const header = ['Academic Year', 'Total', ...input.courses, ...STUDY_YEARS.map((y) => y.replace(' YEAR', ' Yr')), 'Boys', 'Girls'];
  const headRow = sum.addRow(header);
  headRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };

  const countRow = (label: string, list: Student[]) => [
    label,
    list.length,
    ...input.courses.map((c) => list.filter((s) => s.course === c).length || null),
    ...STUDY_YEARS.map((y) => list.filter((s) => s.year === y).length || null),
    list.filter((s) => s.gender === 'BOY').length || null,
    list.filter((s) => s.gender === 'GIRL').length || null,
  ];
  for (const y of years) sum.addRow(countRow(y, byYear.get(y) ?? []));
  sum.addRow(countRow('TOTAL', sorted)).font = { bold: true };

  // Course × year of study breakdown per academic year
  sum.addRow([]);
  sum.addRow(['Course × Year of study']).font = { bold: true };
  const bHead = sum.addRow(['Academic Year', 'Course', ...STUDY_YEARS.map((y) => y.replace(' YEAR', ' Yr')), 'Total']);
  bHead.font = { bold: true };
  for (const y of years) {
    const list = byYear.get(y) ?? [];
    for (const c of input.courses) {
      const inCourse = list.filter((s) => s.course === c);
      if (!inCourse.length) continue;
      sum.addRow([y, c, ...STUDY_YEARS.map((yr) => inCourse.filter((s) => s.year === yr).length || null), inCourse.length]);
    }
  }
  sum.getColumn(1).width = 16;
  for (let i = 2; i <= header.length; i++) sum.getColumn(i).width = 10;

  // ── All Years + per year ───────────────────────────────────────────────────
  const hasAyCol = input.columns.some((c) => c.key === 'academicYear');
  const allCols = hasAyCol ? input.columns : [
    { key: 'academicYear', label: 'Academic Year', group: 'Admission', align: 'center' } as ColumnDef,
    ...input.columns,
  ];
  addTable(wb, 'All Years', allCols, sorted);
  for (const y of years) addTable(wb, y, input.columns, byYear.get(y) ?? []);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = input.fileName.endsWith('.xlsx') ? input.fileName : `${input.fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
