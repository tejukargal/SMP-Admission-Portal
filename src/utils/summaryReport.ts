// Dashboard Summary report — the tabbed views behind the Summary button (and the
// stats-pill shortcuts). Pure builders produce a generic table model that the
// modal, the PDF export (dashboardReportPdf.exportSummaryTabPdf) and the Excel
// export below all share, so a new view is just another builder.

import type { AcademicYear, Category, Course, Religion, Student, Year } from '../types';
import { loadXlsx } from './lazyLibs';

export type Cell = string | number;
/** 'share' = a percentage row shown after the grand total (styled like a subtotal). */
export type RowKind = 'row' | 'subtotal' | 'grand' | 'share';
export interface SummaryRow { cells: Cell[]; kind: RowKind }
export interface HeaderGroup { label: string; span: number }
export interface SummaryTable {
  title: string;
  columns: string[];
  rows: SummaryRow[];
  note?: string;
  /** Optional header row above `columns` (e.g. a category spanning its B / G columns). */
  groups?: HeaderGroup[];
}
export interface SummaryTab { id: string; label: string; tables: SummaryTable[] }

/** Date-wise admissions row (first fee payment date per student). */
export interface DateCountRow { date: string; byCourse: Record<Course, number>; total: number }

/** Everything the Summary needs, already scoped to the Dashboard filters. */
export interface SummaryInput {
  /** Selected academic year, or null for All Years. */
  year: AcademicYear | null;
  /** Confirmed students (or the status-filtered set) — what the old stats tables used. */
  confirmed: Student[];
  /** Students matching every filter except admission status (Status tab). */
  pipeline: Student[];
  /** Previous year's confirmed students matching the same filters (Year-on-year). */
  prevConfirmed: Student[];
  /** Date-wise first-payment admissions (Date-wise tab), newest first. */
  dateRows: DateCountRow[];
}

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

/** "Share %" row: each numeric cell of the grand total as a % of `whole`. */
function shareRow(grand: SummaryRow, labelCols: number, whole: number): SummaryRow {
  return {
    kind: 'share',
    cells: grand.cells.map((c, i) => (i === 0 ? 'Share %' : i < labelCols ? '' : typeof c === 'number' ? pct(c, whole) : '')),
  };
}

/** 'YYYY-MM-DD' → '04 Oct 2026' (UTC, so the day never shifts). */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

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

const isBoyOrGirl = (s: Student) => s.gender === 'BOY' || s.gender === 'GIRL';

export function buildSummaryTabs(input: SummaryInput): SummaryTab[] {
  const { year, confirmed, pipeline, prevConfirmed, dateRows } = input;

  // ── Overview ──
  const overview: SummaryTable = {
    title: 'Year, Course & Admission Type — confirmed students',
    columns: ['Year', 'Course', 'Regular', 'LTRL', 'SNQ', 'RPTR', 'Type Total', 'Boys', 'Girls', 'Gender Total'],
    rows: yearCourseGrid(confirmed, (g) => {
      const b = { regular: 0, ltrl: 0, snq: 0, rptr: 0 };
      for (const s of g) b[admBucket(s)]++;
      const boys = g.filter((s) => s.gender === 'BOY').length;
      const girls = g.filter((s) => s.gender === 'GIRL').length;
      return [b.regular, b.ltrl, b.snq, b.rptr, g.length, boys, girls, boys + girls];
    }),
  };
  // Seats / Vacant / Fill % — intake is per academic year, so only when one year is
  // selected. They scale with how many course-years a row spans (1, 5 or 15).
  if (year) {
    overview.columns.push('Seats', 'Vacant', 'Fill%');
    for (const r of overview.rows) {
      const span = r.kind === 'row' ? 1 : r.kind === 'subtotal' ? COURSES.length : COURSES.length * YEARS.length;
      const seats = SEATS_PER_COURSE * span;
      const total = r.cells[6] as number; // Type Total = every confirmed student in the row
      r.cells.push(seats, Math.max(0, seats - total), pct(total, seats));
    }
  }

  // ── Adm Type (the original Adm Type-wise table) + share of each type ──
  const admType: SummaryTable = {
    title: 'Admission Type-wise Count',
    columns: ['Year', 'Course', 'Regular', 'LTRL', 'SNQ', 'RPTR', 'Total'],
    rows: yearCourseGrid(confirmed, (g) => {
      const b = { regular: 0, ltrl: 0, snq: 0, rptr: 0 };
      for (const s of g) b[admBucket(s)]++;
      return [b.regular, b.ltrl, b.snq, b.rptr, g.length];
    }),
  };
  admType.rows.push(shareRow(admType.rows[admType.rows.length - 1], 2, confirmed.length));

  // ── Category (the original Category-wise table) + share of each category ──
  // As before, only the eight known categories are counted.
  const catStudents = confirmed.filter((s) => CATEGORIES.includes(s.category));
  const category: SummaryTable = {
    title: 'Category-wise Count',
    columns: ['Year', 'Course', ...CATEGORIES, 'Total'],
    rows: yearCourseGrid(catStudents, (g) => [...CATEGORIES.map((c) => g.filter((s) => s.category === c).length), g.length]),
  };
  category.rows.push(shareRow(category.rows[category.rows.length - 1], 2, catStudents.length));

  // ── Cat & Gender (the original Category & Gender-wise table) + Total B+G ──
  const catGender: SummaryTable = {
    title: 'Category & Gender-wise Count',
    groups: [{ label: '', span: 2 }, ...CATEGORIES.map((c) => ({ label: c, span: 2 })), { label: 'Total', span: 3 }],
    columns: ['Year', 'Course', ...CATEGORIES.flatMap(() => ['B', 'G']), 'B', 'G', 'B+G'],
    rows: yearCourseGrid(catStudents.filter(isBoyOrGirl), (g) => {
      const cells: number[] = [];
      for (const c of CATEGORIES) {
        cells.push(g.filter((s) => s.category === c && s.gender === 'BOY').length);
        cells.push(g.filter((s) => s.category === c && s.gender === 'GIRL').length);
      }
      const boys = g.filter((s) => s.gender === 'BOY').length;
      return [...cells, boys, g.length - boys, g.length];
    }),
  };

  // ── Year & Gender (the original Year & Course-wise Gender table) + Girls % ──
  const yearGender: SummaryTable = {
    title: 'Year & Course-wise Gender',
    columns: ['Year', 'Course', 'Boys', 'Girls', 'Total', 'Girls %'],
    rows: yearCourseGrid(confirmed.filter(isBoyOrGirl), (g) => {
      const boys = g.filter((s) => s.gender === 'BOY').length;
      return [boys, g.length - boys, g.length];
    }),
  };
  for (const r of yearGender.rows) r.cells.push(pct(r.cells[3] as number, r.cells[4] as number));

  // ── Date-wise (the original Date-wise Admissions table) + running total ──
  const dateTotal = dateRows.reduce((t, r) => t + r.total, 0);
  const dateWise: SummaryTable = {
    title: 'Date-wise Admissions — Course Count',
    columns: ['Date', ...COURSES, 'Total', 'Cumulative'],
    rows: [],
    note: dateRows.length > 0
      ? 'Each student is counted on the date of their first fee payment. Cumulative counts up from the earliest date.'
      : 'No admission fee payments recorded for this selection.',
  };
  if (dateRows.length > 0) {
    let running = dateTotal; // rows are newest first, so the running total counts down
    for (const r of dateRows) {
      dateWise.rows.push({ kind: 'row', cells: [formatDay(r.date), ...COURSES.map((c) => r.byCourse[c]), r.total, running] });
      running -= r.total;
    }
    dateWise.rows.push({
      kind: 'grand',
      cells: ['GRAND TOTAL', ...COURSES.map((c) => dateRows.reduce((t, r) => t + r.byCourse[c], 0)), dateTotal, ''],
    });
  }

  // ── Status ──
  const status: SummaryTable = {
    title: 'Admission status — all students',
    columns: ['Year', 'Course', 'Confirmed', 'Provisional', 'Pending', 'Cancelled', 'Transferred out', 'Total'],
    rows: yearCourseGrid(pipeline, (g) => {
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

  // ── Year-on-year (single year only) ──
  const prevYear = year ? previousAcademicYear(year) : null;
  const yoy: SummaryTable | null = year ? {
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
  } : null;

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
    { id: 'admtype', label: 'Adm Type', tables: [admType] },
    { id: 'category', label: 'Category', tables: [category] },
    { id: 'catgender', label: 'Cat & Gender', tables: [catGender] },
    { id: 'yeargender', label: 'Year & Gender', tables: [yearGender] },
    { id: 'datewise', label: 'Date-wise', tables: [dateWise] },
    { id: 'status', label: 'Status', tables: [status] },
    ...(yoy ? [{ id: 'yoy', label: 'Year-on-year', tables: [yoy] }] : []),
    profile,
  ];
}

/** One workbook: a sheet per tab, its tables stacked with a title row and a gap. */
export async function exportSummaryWorkbook(tabs: SummaryTab[], scope: string, filterLabel = ''): Promise<void> {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const heading = `SMP Admission Summary ${scope}${filterLabel ? ` (${filterLabel})` : ''}`;
  for (const tab of tabs) {
    const aoa: Cell[][] = [[`${heading} — ${tab.label}`], []];
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
    for (const t of tab.tables) {
      aoa.push([t.title]);
      if (t.groups) {
        const row: Cell[] = [];
        for (const g of t.groups) {
          if (g.span > 1) merges.push({ s: { r: aoa.length, c: row.length }, e: { r: aoa.length, c: row.length + g.span - 1 } });
          row.push(g.label, ...Array<Cell>(g.span - 1).fill(''));
        }
        aoa.push(row);
      }
      aoa.push(t.columns, ...t.rows.map((r) => r.cells));
      if (t.note) aoa.push([t.note]);
      aoa.push([]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (merges.length) ws['!merges'] = merges;
    const widest = Math.max(...tab.tables.map((t) => t.columns.length));
    ws['!cols'] = Array.from({ length: widest }, (_, i) => ({ wch: i < 2 ? 16 : 10 }));
    // Sheet names can't contain : \ / ? * [ ]
    XLSX.utils.book_append_sheet(wb, ws, tab.label.replace(/[:\\/?*[\]]/g, '-').slice(0, 31));
  }
  XLSX.writeFile(wb, `SMP_Summary_${scope.replace(/\s+/g, '_')}.xlsx`);
}
