import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { CellHookData } from 'jspdf-autotable';
import type { Student } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const COURSES  = ['CE', 'ME', 'EC', 'CS', 'EE'] as const;
const YEARS    = ['1ST YEAR', '2ND YEAR', '3RD YEAR'] as const;
const YR_LABEL: Record<string, string> = {
  '1ST YEAR': '1st Yr',
  '2ND YEAR': '2nd Yr',
  '3RD YEAR': '3rd Yr',
};

// Pastel accent themes — one per modal/section accent colour in the dashboard,
// so each exported PDF reads visually consistent with the modal it was triggered from
// (light tint header/subtotal rows, a single solid accent row for the grand total).
type RGB = [number, number, number];
interface Theme { tint: RGB; line: RGB; solid: RGB }

// "solid" uses each colour's 800-shade (darker than the 700-shade the on-screen modals use) —
// on a black & white laser printer, light/mid tones grey out and lose contrast, so we bias dark.
const THEMES = {
  sky:     { tint: [240, 249, 255], line: [186, 230, 253], solid: [7,  89,  133] },
  emerald: { tint: [236, 253, 245], line: [167, 243, 208], solid: [6,  95,  70]  },
  rose:    { tint: [255, 241, 242], line: [254, 205, 211], solid: [159, 18,  57] },
  teal:    { tint: [240, 253, 250], line: [153, 246, 228], solid: [17,  94,  89] },
  violet:  { tint: [245, 243, 255], line: [221, 214, 254], solid: [91,  33,  182] },
  amber:   { tint: [255, 251, 235], line: [253, 230, 138], solid: [146, 64,  14] },
  green:   { tint: [240, 253, 244], line: [187, 247, 208], solid: [22,  101, 52] },
  lime:    { tint: [247, 254, 231], line: [217, 249, 157], solid: [63,  98,  18] },
  indigo:  { tint: [238, 242, 255], line: [199, 210, 254], solid: [55,  48,  163] },
} as const satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

const WHITE:      RGB = [255, 255, 255];
const NEAR_BLACK: RGB = [15,  15,   15];
const ROW_TEXT:   RGB = [30,  30,   32]; // near-black — stays crisp on a B&W laser print

const MARGIN = 14;
const FONT   = 9.5;
const PAD    = { top: 2.6, right: 3.8, bottom: 2.6, left: 3.8 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateStr(): string {
  const d  = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = d.toLocaleString('en-US', { month: 'short' });
  const yr = String(d.getFullYear()).slice(2);
  return `${dd}-${mo}-${yr}`;
}

function buildDoc(academicYear: string, subtitle: string, theme: Theme, orientation: 'portrait' | 'landscape' = 'portrait'): jsPDF {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const W   = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...NEAR_BLACK);
  doc.text(`SMP Admn Stats ${academicYear}`, W / 2, 17, { align: 'center' });

  doc.setFontSize(12.5);
  doc.setTextColor(...theme.solid);
  doc.text(subtitle, W / 2, 25, { align: 'center' });

  // Thin accent rule beneath the subtitle — mirrors each modal's coloured header border
  doc.setDrawColor(...theme.line);
  doc.setLineWidth(0.4);
  doc.line(W / 2 - 20, 28, W / 2 + 20, 28);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(`Generated: ${dateStr()}`, W / 2, 33, { align: 'center' });
  doc.setTextColor(...NEAR_BLACK);

  return doc;
}

function addFooters(doc: jsPDF, academicYear: string, reportName: string): void {
  const totalPages = (doc as unknown as { internal: { getNumberOfPages(): number } })
    .internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`SMP Admn Stats ${academicYear} - ${reportName}`, MARGIN, H - 5);
    doc.text(`Page ${i} of ${totalPages}`, W - MARGIN, H - 5, { align: 'right' });
  }
}

function headStyles(theme: Theme) {
  return {
    fillColor: theme.tint,
    textColor: theme.solid,
    fontStyle: 'bold' as const,
    fontSize: FONT,
    cellPadding: PAD,
    lineWidth: 0.15,
    lineColor: theme.line,
  };
}

function bodyStyles(theme: Theme) {
  return {
    fontSize: FONT,
    cellPadding: PAD,
    fillColor: WHITE,
    textColor: ROW_TEXT,
    lineColor: theme.line,
    lineWidth: 0.15,
  };
}

// Applies the light-tint subtotal / solid grand-total row styling used throughout —
// mirrors each modal's subtle subtotal rows + single solid grand-total row.
function themedRowStyler(theme: Theme, grandIdx: number, subtotalRows: number[] = []) {
  return (data: CellHookData) => {
    if (data.section !== 'body') return;
    const i = data.row.index;
    if (i === grandIdx) {
      data.cell.styles.fillColor = theme.solid;
      data.cell.styles.textColor = WHITE;
      data.cell.styles.fontStyle = 'bold';
    } else if (subtotalRows.includes(i)) {
      data.cell.styles.fillColor = theme.tint;
      data.cell.styles.textColor = theme.solid;
      data.cell.styles.fontStyle = 'bold';
    }
  };
}

type Row = (string | number)[];

// ── Summary Report — Year, Course & Admission Type ───────────────────────────

export function exportSummaryReport(students: Student[], academicYear: string, subtitle?: string, themeName: ThemeName = 'sky'): void {
  const theme = THEMES[themeName];
  const doc   = buildDoc(academicYear, subtitle ?? 'Year, Course & Admission Type-wise Student Count', theme);
  const body: Row[] = [];
  const subtotalRows: number[] = [];

  let gRegular = 0, gLtrl = 0, gSnq = 0, gRptr = 0, gTotal = 0;

  for (const yr of YEARS) {
    const yrSt = students.filter((s) => s.year === yr);
    let sRegular = 0, sLtrl = 0, sSnq = 0, sRptr = 0, sTotal = 0;

    for (const course of COURSES) {
      const ss = yrSt.filter((s) => s.course === course);
      let regular = 0, ltrl = 0, snq = 0, rptr = 0;
      for (const s of ss) {
        if (s.admCat === 'SNQ')            snq++;
        else if (s.admType === 'LATERAL')  ltrl++;
        else if (s.admType === 'REPEATER') rptr++;
        else                               regular++;
      }
      const total = ss.length;
      body.push([YR_LABEL[yr], course, regular, ltrl, snq, rptr, total]);
      sRegular += regular; sLtrl += ltrl; sSnq += snq; sRptr += rptr; sTotal += total;
    }

    subtotalRows.push(body.length);
    body.push([`${YR_LABEL[yr]} SUBTOTAL`, 'All Courses', sRegular, sLtrl, sSnq, sRptr, sTotal]);
    gRegular += sRegular; gLtrl += sLtrl; gSnq += sSnq; gRptr += sRptr; gTotal += sTotal;
  }

  const grandIdx = body.length;
  body.push(['GRAND TOTAL', '', gRegular, gLtrl, gSnq, gRptr, gTotal]);

  const S_HEAD_FONT = 10.5;
  const S_DATA_FONT = 13;
  const S_PAD       = { top: 2.2, right: 2.8, bottom: 2.2, left: 2.8 };

  // Portrait A4: usable = 210 − 2×14 = 182 mm
  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Year', 'Course', 'Regular', 'LTRL', 'SNQ', 'RPTR', 'Total']],
    body,
    headStyles: { ...headStyles(theme), fontSize: S_HEAD_FONT, cellPadding: S_PAD },
    bodyStyles: { ...bodyStyles(theme), fontSize: S_DATA_FONT, cellPadding: S_PAD, overflow: 'hidden' },
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 24 },
      2: { cellWidth: 28, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
      6: { cellWidth: 24, halign: 'center' },
    },
    didParseCell: themedRowStyler(theme, grandIdx, subtotalRows),
  });

  addFooters(doc, academicYear, 'Summary Report');
  doc.save(`SMP_Summary_Report_${dateStr().replace(/-/g, '_')}.pdf`);
}

// ── Category Report — Year, Course & Category ────────────────────────────────

type CatKey = 'gm' | 'c1' | 'twoA' | 'twoB' | 'threeA' | 'threeB' | 'sc' | 'st';
const CAT_KEYS: CatKey[] = ['gm', 'c1', 'twoA', 'twoB', 'threeA', 'threeB', 'sc', 'st'];

function catKey(s: Student): CatKey {
  switch (s.category) {
    case 'GM':  return 'gm';
    case 'C1':  return 'c1';
    case '2A':  return 'twoA';
    case '2B':  return 'twoB';
    case '3A':  return 'threeA';
    case '3B':  return 'threeB';
    case 'SC':  return 'sc';
    case 'ST':  return 'st';
    default:    return 'gm';
  }
}

function zeroCounts(): Record<CatKey, number> {
  return { gm: 0, c1: 0, twoA: 0, twoB: 0, threeA: 0, threeB: 0, sc: 0, st: 0 };
}

function catRow(label1: string, label2: string, c: Record<CatKey, number>, total: number): Row {
  return [label1, label2, c.gm, c.c1, c.twoA, c.twoB, c.threeA, c.threeB, c.sc, c.st, total];
}

export function exportCategoryReport(students: Student[], academicYear: string, subtitle?: string, themeName: ThemeName = 'emerald'): void {
  const theme = THEMES[themeName];
  const doc   = buildDoc(academicYear, subtitle ?? 'Year, Course & Cat wise Student Count', theme);
  const body: Row[] = [];
  const subtotalRows: number[] = [];

  const grand = zeroCounts();
  let gTotal  = 0;

  for (const yr of YEARS) {
    const yrSt = students.filter((s) => s.year === yr);
    const sub  = zeroCounts();
    let sTotal = 0;

    for (const course of COURSES) {
      const ss  = yrSt.filter((s) => s.course === course);
      const cnt = zeroCounts();
      for (const s of ss) cnt[catKey(s)]++;
      const total = ss.length;
      body.push(catRow(YR_LABEL[yr], course, cnt, total));
      for (const k of CAT_KEYS) sub[k] += cnt[k];
      sTotal += total;
    }

    subtotalRows.push(body.length);
    body.push(catRow(`${YR_LABEL[yr]} SUBTOTAL`, 'All Courses', sub, sTotal));
    for (const k of CAT_KEYS) grand[k] += sub[k];
    gTotal += sTotal;
  }

  const grandIdx = body.length;
  body.push(catRow('GRAND TOTAL', '', grand, gTotal));

  // Portrait A4: usable = 182 mm
  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Year', 'Course', 'GM', 'C1', '2A', '2B', '3A', '3B', 'SC', 'ST', 'Total']],
    body,
    headStyles: headStyles(theme),
    bodyStyles: bodyStyles(theme),
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0:  { cellWidth: 24 },
      1:  { cellWidth: 24 },
      2:  { cellWidth: 14.5, halign: 'center' },
      3:  { cellWidth: 14.5, halign: 'center' },
      4:  { cellWidth: 14.5, halign: 'center' },
      5:  { cellWidth: 14.5, halign: 'center' },
      6:  { cellWidth: 14.5, halign: 'center' },
      7:  { cellWidth: 14.5, halign: 'center' },
      8:  { cellWidth: 14.5, halign: 'center' },
      9:  { cellWidth: 14.5, halign: 'center' },
      10: { cellWidth: 18, halign: 'center' },
    },
    didParseCell: themedRowStyler(theme, grandIdx, subtotalRows),
  });

  addFooters(doc, academicYear, 'Category Report');
  doc.save(`SMP_Category_Report_${dateStr().replace(/-/g, '_')}.pdf`);
}

// ── Year & Course-wise Gender Report ─────────────────────────────────────────

export function exportGenderCourseYearReport(students: Student[], academicYear: string, subtitle?: string, themeName: ThemeName = 'teal'): void {
  const theme = THEMES[themeName];
  const doc   = buildDoc(academicYear, subtitle ?? 'Year & Course-wise Gender Count', theme);
  const body: Row[] = [];
  const subtotalRows: number[] = [];

  let gB = 0, gG = 0, gT = 0;

  for (const yr of YEARS) {
    const yrSt = students.filter((s) => s.year === yr);
    let sB = 0, sG = 0, sT = 0;
    for (const course of COURSES) {
      const ss = yrSt.filter((s) => s.course === course);
      const boys  = ss.filter((s) => s.gender === 'BOY').length;
      const girls = ss.filter((s) => s.gender === 'GIRL').length;
      body.push([YR_LABEL[yr], course, boys, girls, boys + girls]);
      sB += boys; sG += girls; sT += boys + girls;
    }
    subtotalRows.push(body.length);
    body.push([`${YR_LABEL[yr]} SUBTOTAL`, 'All', sB, sG, sT]);
    gB += sB; gG += sG; gT += sT;
  }

  const grandIdx = body.length;
  body.push(['GRAND TOTAL', '', gB, gG, gT]);

  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Year', 'Course', 'Boys', 'Girls', 'Total']],
    body,
    headStyles: headStyles(theme),
    bodyStyles: bodyStyles(theme),
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 34 },
      2: { cellWidth: 38, halign: 'center' },
      3: { cellWidth: 38, halign: 'center' },
      4: { cellWidth: 38, halign: 'center' },
    },
    didParseCell: themedRowStyler(theme, grandIdx, subtotalRows),
  });

  addFooters(doc, academicYear, 'Gender Course Year Report');
  doc.save(`SMP_Gender_Course_Year_${dateStr().replace(/-/g, '_')}.pdf`);
}

// ── Category & Gender Report ──────────────────────────────────────────────────

export function exportGenderCategoryReport(students: Student[], academicYear: string, themeName: ThemeName = 'rose'): void {
  const theme = THEMES[themeName];
  const CATS = ['GM', 'C1', '2A', '2B', '3A', '3B', 'SC', 'ST'] as const;
  type Cat = typeof CATS[number];

  function catOf(s: Student): Cat {
    return (CATS as readonly string[]).includes(s.category ?? '') ? s.category as Cat : 'GM';
  }

  type Pair = { b: number; g: number };
  const zero = (): Record<Cat, Pair> =>
    Object.fromEntries(CATS.map((c) => [c, { b: 0, g: 0 }])) as Record<Cat, Pair>;

  const body: Row[] = [];
  const subtotalRows: number[] = [];
  const grandCats = zero();
  let gB = 0, gG = 0;

  for (const yr of YEARS) {
    const yrSt = students.filter((s) => s.year === yr);
    const subCats = zero();
    let sB = 0, sG = 0;

    for (const course of COURSES) {
      const ss = yrSt.filter((s) => s.course === course);
      const cats = zero();
      let tB = 0, tG = 0;
      for (const s of ss) {
        const cat = catOf(s);
        if (s.gender === 'BOY') { cats[cat].b++; tB++; } else { cats[cat].g++; tG++; }
      }
      for (const cat of CATS) { subCats[cat].b += cats[cat].b; subCats[cat].g += cats[cat].g; }
      sB += tB; sG += tG;
      body.push([
        YR_LABEL[yr], course,
        ...CATS.flatMap((cat) => [cats[cat].b, cats[cat].g]),
        tB, tG,
      ]);
    }

    subtotalRows.push(body.length);
    body.push([
      `${YR_LABEL[yr]} SUB`, 'All',
      ...CATS.flatMap((cat) => [subCats[cat].b, subCats[cat].g]),
      sB, sG,
    ]);
    for (const cat of CATS) { grandCats[cat].b += subCats[cat].b; grandCats[cat].g += subCats[cat].g; }
    gB += sB; gG += sG;
  }

  const grandIdx = body.length;
  body.push(['GRAND TOTAL', '', ...CATS.flatMap((cat) => [grandCats[cat].b, grandCats[cat].g]), gB, gG]);

  // Landscape for wide table
  const docL = buildDoc(academicYear, 'Category & Gender-wise Student Count', theme, 'landscape');

  const catHeaders = CATS.flatMap((cat) => [`${cat} B`, `${cat} G`]);
  autoTable(docL, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Year', 'Course', ...catHeaders, 'Total B', 'Total G']],
    body,
    headStyles: { ...headStyles(theme), fontSize: 8 },
    bodyStyles: { ...bodyStyles(theme), fontSize: 8.5 },
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 14 },
      ...Object.fromEntries(
        Array.from({ length: CATS.length * 2 + 2 }, (_, i) => [i + 2, { cellWidth: 13.17, halign: 'center' as const }])
      ),
    },
    didParseCell: themedRowStyler(theme, grandIdx, subtotalRows),
  });

  addFooters(docL, academicYear, 'Category Gender Report');
  docL.save(`SMP_Category_Gender_${dateStr().replace(/-/g, '_')}.pdf`);
}

// ── Date-wise Admissions Report ───────────────────────────────────────────────

export function exportDatewiseAdmissionsReport(
  dateTable: Array<{ date: string; byCourse: Record<string, number>; total: number }>,
  academicYear: string,
  themeName: ThemeName = 'violet',
): void {
  const theme = THEMES[themeName];
  const doc = buildDoc(academicYear, 'Date-wise Admissions — Course Count', theme);

  function fmtDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[parseInt(m) - 1]} ${y}`;
  }

  const body: Row[] = dateTable.map((r) => [
    fmtDate(r.date),
    ...COURSES.map((c) => r.byCourse[c] ?? 0),
    r.total,
  ]);

  const grandByCourse = COURSES.map((c) => dateTable.reduce((a, r) => a + (r.byCourse[c] ?? 0), 0));
  const grandTotal    = dateTable.reduce((a, r) => a + r.total, 0);
  const grandIdx      = body.length;
  body.push(['GRAND TOTAL', ...grandByCourse, grandTotal]);

  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Date', ...COURSES, 'Total']],
    body,
    headStyles: headStyles(theme),
    bodyStyles: bodyStyles(theme),
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0: { cellWidth: 40 },
      ...Object.fromEntries(
        COURSES.map((_, i) => [i + 1, { cellWidth: 24, halign: 'center' as const }])
      ),
      [COURSES.length + 1]: { cellWidth: 22, halign: 'center' as const },
    },
    didParseCell: themedRowStyler(theme, grandIdx),
  });

  addFooters(doc, academicYear, 'Datewise Admissions');
  doc.save(`SMP_Datewise_Admissions_${dateStr().replace(/-/g, '_')}.pdf`);
}

// ── 1st Year Pending Seats Report ─────────────────────────────────────────────

export function exportFirstYearSeatsReport(
  seats: Record<string, { nonSnqConfirmed: number; snqConfirmed: number }>,
  academicYear: string,
  themeName: ThemeName = 'amber',
): void {
  const theme = THEMES[themeName];
  const doc = buildDoc(academicYear, '1st Year — Pending Seats', theme);
  const TOTAL_REGULAR = 60;
  const TOTAL_SNQ = 3;

  const body: Row[] = COURSES.map((course) => {
    const s = seats[course] ?? { nonSnqConfirmed: 0, snqConfirmed: 0 };
    const snqAllotted   = s.snqConfirmed > 0;
    const regFilled     = Math.min(s.nonSnqConfirmed, 60);
    const overflowToSnq = Math.max(0, s.nonSnqConfirmed - 60);
    const snqFilled     = snqAllotted ? s.snqConfirmed : overflowToSnq;
    return [
      course,
      regFilled,
      Math.max(0, TOTAL_REGULAR - regFilled),
      snqAllotted ? snqFilled : `${snqFilled}*`,
      Math.max(0, TOTAL_SNQ - snqFilled),
    ];
  });

  const totRegFilled  = COURSES.reduce((a, c) => a + Math.min(seats[c]?.nonSnqConfirmed ?? 0, 60), 0);
  const totSnqFilled  = COURSES.reduce((a, c) => {
    const s = seats[c];
    if (!s) return a;
    return a + (s.snqConfirmed > 0 ? s.snqConfirmed : Math.max(0, s.nonSnqConfirmed - 60));
  }, 0);
  const grandIdx = body.length;
  body.push([
    'TOTAL',
    totRegFilled,
    Math.max(0, COURSES.length * TOTAL_REGULAR - totRegFilled),
    totSnqFilled,
    Math.max(0, COURSES.length * TOTAL_SNQ - totSnqFilled),
  ]);

  autoTable(doc, {
    startY: 38,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Course', 'Reg Filled', 'Reg Pending', 'SNQ Filled', 'SNQ Pending']],
    body,
    headStyles: headStyles(theme),
    bodyStyles: bodyStyles(theme),
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 36, halign: 'center' },
      2: { cellWidth: 36, halign: 'center' },
      3: { cellWidth: 36, halign: 'center' },
      4: { cellWidth: 36, halign: 'center' },
    },
    didParseCell: themedRowStyler(theme, grandIdx),
  });

  addFooters(doc, academicYear, '1st Year Seats');
  doc.save(`SMP_1stYear_Seats_${dateStr().replace(/-/g, '_')}.pdf`);
}
