// Dashboard Summary report — the tabbed views behind the Summary button.
// Pure builders produce a generic table model that the modal, the PDF export
// (dashboardReportPdf.exportSummaryTabPdf) and the Excel export below all share,
// so a new view is just another builder.

import type { AcademicYear, Category, Course, Religion, Student, Year } from '../types';
import { isConfirmedActive } from './studentStatus';
import { loadXlsx } from './lazyLibs';

export type Cell = string | number;
export type RowKind = 'row' | 'subtotal' | 'grand';
export interface SummaryRow { cells: Cell[]; kind: RowKind }
export interface SummaryTable { title: string; columns: string[]; rows: SummaryRow[]; note?: string }
export interface SummaryTab { id: string; label: string; tables: SummaryTable[] }

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YR_LABEL: Record<Year, string> = { '1ST YEAR': '1st Yr', '2ND YEAR': '2nd Yr', '3RD YEAR': '3rd Yr' };
const SEATS_PER_COURSE = 63; // per course per year — same intake as the Intake % modal
const CATEGORIES: Category[] = ['GM', 'C1', '2A', '2B', '3A', '3B', 'SC', 'ST'];
const RELIGIONS: Religion[] = ['HINDU', 'MUSLIM', 'CHRISTIAN', 'JAIN', 'BUDDHIST', 'SIKH'];

/** '2026-27' → '2025-26' */
export function previousAcademicYear(year: AcademicYear): AcademicYear | null {
  const m = year.match(/^(\d{4})-\d{2}$/);
  if (!m) return null;
  const start = Number(m[1]) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}` as AcademicYear;
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

type AdmBucket = 'regular' | 'ltrl' | 'snq' | 'rptr';
/** Same classification as the original Summary table / stats.summaryTable. */
function admBucket(s: Student): AdmBucket {
  if (s.admCat === 'SNQ') return 'snq';
  if (s.admType === 'LATERAL') return 'ltrl';
  if (s.admType === 'REPEATER') return 'rptr';
  return 'regular';
}

/** Year × Course grid: 5 course rows + a subtotal per year, then a grand total.
 *  `cellsFor` returns the numeric cells for one group of students. */
function yearCourseGrid(students: Student[], cellsFor: (group: Student[]) => number[]): SummaryRow[] {
  const rows: SummaryRow[] = [];
  let grand: number[] | null = null;
  const add = (a: number[] | null, b: number[]) => (a ? a.map((v, i) => v + b[i]) : [...b]);
  for (const yr of YEARS) {
    const yrStudents = students.filter((s) => s.year === yr);
    let sub: number[] | null = null;
    for (const course of COURSES) {
      const nums = cellsFor(yrStudents.filter((s) => s.course === course));
      sub = add(sub, nums);
      rows.push({ kind: 'row', cells: [YR_LABEL[yr], course, ...nums] });
    }
    rows.push({ kind: 'subtotal', cells: [`${YR_LABEL[yr]} subtotal`, 'All', ...sub!] });
    grand = add(grand, sub!);
  }
  rows.push({ kind: 'grand', cells: ['GRAND TOTAL', '', ...grand!] });
  return rows;
}

/** Course-wise distribution table: one row per course + total, one column per key. */
function courseDistribution<K extends string>(
  title: string,
  students: Student[],
  keys: readonly K[],
  labelOf: (k: K) => string,
  keyOf: (s: Student) => K | null,
  note?: string,
): SummaryTable {
  const rows: SummaryRow[] = COURSES.map((course) => {
    const group = students.filter((s) => s.course === course);
    const counts = keys.map((k) => group.filter((s) => keyOf(s) === k).length);
    return { kind: 'row', cells: [course, ...counts, group.length] };
  });
  const totals = keys.map((k) => students.filter((s) => keyOf(s) === k).length);
  rows.push({ kind: 'grand', cells: ['TOTAL', ...totals, students.length] });
  return { title, columns: ['Course', ...keys.map(labelOf), 'Total'], rows, note };
}

/** Top-N ranking of a free-text field, most common first; blank → NOT GIVEN. */
function ranking(students: Student[], field: (s: Student) => string | undefined): [string, number][] {
  const counts = new Map<string, number>();
  for (const s of students) {
    const key = (field(s) ?? '').trim().toUpperCase() || 'NOT GIVEN';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Top districts and top taluks side by side, with an "Others" row and the total. */
function topPlaces(students: Student[], n = 10): SummaryTable {
  const districts = ranking(students, (s) => s.district);
  const taluks = ranking(students, (s) => s.taluk);
  const rows: SummaryRow[] = Array.from({ length: Math.min(n, Math.max(districts.length, taluks.length)) }, (_, i) => ({
    kind: 'row' as const,
    cells: [i + 1, districts[i]?.[0] ?? '', districts[i]?.[1] ?? '', taluks[i]?.[0] ?? '', taluks[i]?.[1] ?? ''],
  }));
  const rest = (list: [string, number][]) => list.slice(n).reduce((t, [, c]) => t + c, 0);
  if (districts.length > n || taluks.length > n) {
    rows.push({
      kind: 'subtotal',
      cells: ['', districts.length > n ? `Others (${districts.length - n})` : '', districts.length > n ? rest(districts) : '',
        taluks.length > n ? `Others (${taluks.length - n})` : '', taluks.length > n ? rest(taluks) : ''],
    });
  }
  rows.push({ kind: 'grand', cells: ['', 'TOTAL', students.length, '', students.length] });
  return { title: 'Top districts & taluks', columns: ['#', 'District', 'Students', 'Taluk', 'Students'], rows };
}

type SslcBand = 'b85' | 'b70' | 'b60' | 'below';
const SSLC_BANDS = ['b85', 'b70', 'b60', 'below'] as const;
const SSLC_LABEL: Record<SslcBand, string> = { b85: '85% +', b70: '70-84%', b60: '60-69%', below: 'Below 60%' };
function sslcPercent(s: Student): number | null {
  return s.sslcMaxTotal > 0 && s.sslcObtainedTotal >= 0 ? (s.sslcObtainedTotal / s.sslcMaxTotal) * 100 : null;
}
function sslcBand(p: number): SslcBand {
  return p >= 85 ? 'b85' : p >= 70 ? 'b70' : p >= 60 ? 'b60' : 'below';
}

type IncomeBand = 'lt1' | 'lt25' | 'lt5' | 'ge5' | 'none';
const INCOME_BANDS = ['lt1', 'lt25', 'lt5', 'ge5', 'none'] as const;
// Plain ASCII labels: jsPDF's built-in fonts have no ₹ or ≥ glyphs.
const INCOME_LABEL: Record<IncomeBand, string> = { lt1: 'Below 1L', lt25: '1-2.5L', lt5: '2.5-5L', ge5: '5L +', none: 'Not given' };
function incomeBand(s: Student): IncomeBand {
  const v = Number(s.annualIncome) || 0;
  if (v <= 0) return 'none';
  return v < 100000 ? 'lt1' : v < 250000 ? 'lt25' : v < 500000 ? 'lt5' : 'ge5';
}

export function buildSummaryTabs(all: Student[], year: AcademicYear): SummaryTab[] {
  const yearStudents = all.filter((s) => s.academicYear === year);
  const confirmed = yearStudents.filter(isConfirmedActive);

  // ── Overview ──
  const overview: SummaryTable = {
    title: 'Year, Course & Admission Type — confirmed students',
    columns: ['Year', 'Course', 'Regular', 'LTRL', 'SNQ', 'RPTR', 'Type Total', 'Boys', 'Girls', 'Gender Total', 'Seats', 'Vacant', 'Fill%'],
    rows: yearCourseGrid(confirmed, (g) => {
      const b = { regular: 0, ltrl: 0, snq: 0, rptr: 0 };
      for (const s of g) b[admBucket(s)]++;
      const boys = g.filter((s) => s.gender === 'BOY').length;
      const girls = g.filter((s) => s.gender === 'GIRL').length;
      return [b.regular, b.ltrl, b.snq, b.rptr, g.length, boys, girls, boys + girls];
    }),
  };
  // Seats / Vacant / Fill % scale with how many course-years a row spans (1, 5 or 15).
  for (const r of overview.rows) {
    const span = r.kind === 'row' ? 1 : r.kind === 'subtotal' ? COURSES.length : COURSES.length * YEARS.length;
    const seats = SEATS_PER_COURSE * span;
    const total = r.cells[6] as number; // Type Total = every confirmed student in the row
    r.cells.push(seats, Math.max(0, seats - total), pct(total, seats));
  }

  // ── Status ──
  const status: SummaryTable = {
    title: 'Admission status — all students of the year',
    columns: ['Year', 'Course', 'Confirmed', 'Provisional', 'Pending', 'Cancelled', 'Transferred out', 'Total'],
    rows: yearCourseGrid(yearStudents, (g) => {
      let conf = 0, prov = 0, pend = 0, canc = 0, out = 0;
      for (const s of g) {
        const st = s.admissionStatus?.trim() ?? '';
        if (s.transferOut) out++;
        else if (st === 'CONFIRMED') conf++;
        else if (st === 'PROVISIONAL') prov++;
        else if (st === 'CANCELLED') canc++;
        else pend++;
      }
      return [conf, prov, pend, canc, out, g.length];
    }),
    note: 'Transferred-out students are counted only under "Transferred out". Blank or unknown status counts as Pending.',
  };

  // ── Year-on-year ──
  const prevYear = previousAcademicYear(year);
  const prevConfirmed = prevYear ? all.filter((s) => s.academicYear === prevYear && isConfirmedActive(s)) : [];
  const yoy: SummaryTable = {
    title: `Confirmed students — ${prevYear ?? 'previous year'} vs ${year}`,
    columns: ['Year', 'Course', prevYear ?? 'Previous', year, 'Change', 'Change %'],
    rows: (() => {
      const rows: SummaryRow[] = [];
      let gPrev = 0, gCur = 0;
      const derive = (p: number, c: number): Cell[] => [signed(c - p), p > 0 ? `${c - p >= 0 ? '+' : ''}${Math.round(((c - p) / p) * 100)}%` : '—'];
      for (const yr of YEARS) {
        let sPrev = 0, sCur = 0;
        for (const course of COURSES) {
          const p = prevConfirmed.filter((s) => s.year === yr && s.course === course).length;
          const c = confirmed.filter((s) => s.year === yr && s.course === course).length;
          sPrev += p; sCur += c;
          rows.push({ kind: 'row', cells: [YR_LABEL[yr], course, p, c, ...derive(p, c)] });
        }
        rows.push({ kind: 'subtotal', cells: [`${YR_LABEL[yr]} subtotal`, 'All', sPrev, sCur, ...derive(sPrev, sCur)] });
        gPrev += sPrev; gCur += sCur;
      }
      rows.push({ kind: 'grand', cells: ['GRAND TOTAL', '', gPrev, gCur, ...derive(gPrev, gCur)] });
      return rows;
    })(),
    note: prevConfirmed.length === 0 ? `No confirmed students recorded for ${prevYear ?? 'the previous year'}.` : undefined,
  };

  // ── Profile ──
  const withSslc = confirmed.filter((s) => sslcPercent(s) !== null);
  const sslcTable = courseDistribution(
    'SSLC percentage bands',
    withSslc,
    SSLC_BANDS,
    (k) => SSLC_LABEL[k],
    (s) => sslcBand(sslcPercent(s)!),
    confirmed.length - withSslc.length > 0 ? `${confirmed.length - withSslc.length} student(s) without SSLC marks are excluded.` : undefined,
  );
  sslcTable.columns.push('Avg %');
  sslcTable.rows.forEach((r, i) => {
    const group = i < COURSES.length ? withSslc.filter((s) => s.course === COURSES[i]) : withSslc;
    const avg = group.length > 0 ? group.reduce((t, s) => t + sslcPercent(s)!, 0) / group.length : null;
    r.cells.push(avg === null ? '—' : `${avg.toFixed(1)}%`);
  });

  const profile: SummaryTab = {
    id: 'profile',
    label: 'Profile',
    tables: [
      courseDistribution('Category-wise', confirmed, CATEGORIES, (k) => k, (s) => (CATEGORIES.includes(s.category) ? s.category : null)),
      courseDistribution('Religion-wise', confirmed, RELIGIONS, (k) => k.charAt(0) + k.slice(1).toLowerCase(), (s) => (RELIGIONS.includes(s.religion) ? s.religion : null)),
      sslcTable,
      courseDistribution('Annual family income (Rs)', confirmed, INCOME_BANDS, (k) => INCOME_LABEL[k], incomeBand),
      topPlaces(confirmed),
    ],
  };

  return [
    { id: 'overview', label: 'Overview', tables: [overview] },
    { id: 'status', label: 'Status', tables: [status] },
    { id: 'yoy', label: 'Year-on-year', tables: [yoy] },
    profile,
  ];
}

/** One workbook: a sheet per tab, its tables stacked with a title row and a gap. */
export async function exportSummaryWorkbook(tabs: SummaryTab[], year: string): Promise<void> {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  for (const tab of tabs) {
    const aoa: Cell[][] = [[`SMP Admission Summary ${year} — ${tab.label}`], []];
    for (const t of tab.tables) {
      aoa.push([t.title], t.columns, ...t.rows.map((r) => r.cells));
      if (t.note) aoa.push([t.note]);
      aoa.push([]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const widest = Math.max(...tab.tables.map((t) => t.columns.length));
    ws['!cols'] = Array.from({ length: widest }, (_, i) => ({ wch: i < 2 ? 16 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws, tab.label.slice(0, 31));
  }
  XLSX.writeFile(wb, `SMP_Summary_${year}.xlsx`);
}
