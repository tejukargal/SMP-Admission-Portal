import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { FeeStructure, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS } from '../types';

const INST_NAME = 'SANJAY MEMORIAL POLYTECHNIC';
const INST_ADDR = 'Ikkeri Road, SAGAR – 577401';

// ── Helpers ───────────────────────────────────────────────────────────────────

function smpTotal(s: FeeStructure): number {
  return SMP_FEE_HEADS.reduce((t, { key }) => t + s.smp[key], 0);
}

function addlTotal(s: FeeStructure): number {
  return s.additionalHeads.reduce((t, h) => t + h.amount, 0);
}

function grandTotal(s: FeeStructure): number {
  return smpTotal(s) + s.svk + addlTotal(s);
}

/** Collect all unique additional head labels across all structures (preserving first-seen order). */
function collectAddlLabels(structures: FeeStructure[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const s of structures) {
    for (const h of s.additionalHeads) {
      const lbl = h.label.trim();
      if (lbl && !seen.has(lbl)) { seen.add(lbl); labels.push(lbl); }
    }
  }
  return labels;
}

function sortStructures(structures: FeeStructure[]): FeeStructure[] {
  const yearOrder = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
  const typeOrder = ['REGULAR', 'LATERAL', 'SNQ', 'REPEATER', 'EXTERNAL'];
  const catOrder  = ['GM', 'SNQ', 'OTHERS'];
  return [...structures].sort((a, b) => {
    if (a.course !== b.course) return a.course.localeCompare(b.course);
    const yi = yearOrder.indexOf(a.year) - yearOrder.indexOf(b.year);
    if (yi !== 0) return yi;
    const ti = typeOrder.indexOf(a.admType) - typeOrder.indexOf(b.admType);
    if (ti !== 0) return ti;
    return catOrder.indexOf(a.admCat) - catOrder.indexOf(b.admCat);
  });
}

/**
 * Compute the minimum column width (pt) that fits the given header + data values
 * without wrapping. charPt = pt per character at the current font size.
 */
function colW(header: string, dataValues: (string | number)[], charPt = 3.75, padPt = 7): number {
  // For multi-line headers, use the longest line to size the column
  const headerMax = Math.max(...header.split('\n').map((l) => l.length));
  const dataMax   = Math.max(0, ...dataValues.map((v) => String(v === 0 ? '' : v).length));
  return Math.max(headerMax, dataMax) * charPt + padPt;
}

// ── PDF Export ────────────────────────────────────────────────────────────────

export function exportFeeStructurePDF(structures: FeeStructure[], academicYear: string): void {
  const sorted     = sortStructures(structures);
  const addlLabels = collectAddlLabels(sorted);

  const doc    = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const margin = 18;
  const avail  = pageW - margin * 2;   // usable width in pt

  // ── Page header ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(INST_NAME, pageW / 2, 28, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(INST_ADDR, pageW / 2, 39, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`FEE STRUCTURE  –  ${academicYear}`, pageW / 2, 54, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const printDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`(All amounts in ₹)   Printed: ${printDate}`, pageW / 2, 64, { align: 'center' });

  // ── Column headers ────────────────────────────────────────────────────────
  const metaHeaders  = ['Course', 'Year', 'Adm\nType', 'Adm\nCat'];
  const smpHeaders   = SMP_FEE_HEADS.map((h) => h.label);
  const trailHeaders = [
    'SMP\nTotal', 'SVK',
    ...addlLabels,
    ...(addlLabels.length ? ['Addl\nTotal'] : []),
    'Grand\nTotal',
  ];
  const allHeaders = [...metaHeaders, ...smpHeaders, ...trailHeaders];

  // ── Row data ──────────────────────────────────────────────────────────────
  const body = sorted.map((s) => {
    const addlAmts = addlLabels.map(
      (lbl) => s.additionalHeads.find((h) => h.label.trim() === lbl)?.amount ?? 0
    );
    return [
      s.course,
      s.year.replace(' YEAR', ''),
      s.admType,
      s.admCat,
      ...SMP_FEE_HEADS.map(({ key }) => s.smp[key] || ''),
      smpTotal(s) || '',
      s.svk || '',
      ...addlAmts.map((v) => v || ''),
      ...(addlLabels.length ? [addlTotal(s) || ''] : []),
      grandTotal(s),
    ];
  });

  // ── Column index helpers ──────────────────────────────────────────────────
  const smpStart     = metaHeaders.length;
  const smpEnd       = smpStart + SMP_FEE_HEADS.length - 1;
  const smpTotalIdx  = smpEnd + 1;
  const svkIdx       = smpTotalIdx + 1;
  const addlStart    = svkIdx + 1;
  const addlEnd      = addlStart + addlLabels.length - 1;
  const addlTotalIdx = addlLabels.length ? addlEnd + 1 : -1;
  const grandIdx     = allHeaders.length - 1;

  // ── Two-phase column widths ───────────────────────────────────────────────
  // Phase 1: fixed compact widths for meta + total/summary columns
  //   These are sized to content only — no scaling up.
  // Phase 2: remaining space distributed equally across the 14 SMP detail columns.
  const fixedW: Record<number, number> = {
    0: colW('Course',   body.map((r) => r[0])),           // Course
    1: colW('Year',     body.map((r) => r[1])),           // Year
    2: colW('Adm\nType',body.map((r) => r[2])),           // Adm Type
    3: colW('Adm\nCat', body.map((r) => r[3])),           // Adm Cat
    [smpTotalIdx]: colW('SMP\nTotal', body.map((r) => r[smpTotalIdx])),
    [svkIdx]:      colW('SVK',        body.map((r) => r[svkIdx])),
    [grandIdx]:    colW('Grand\nTotal',body.map((r) => r[grandIdx])),
  };
  if (addlTotalIdx !== -1)
    fixedW[addlTotalIdx] = colW('Addl\nTotal', body.map((r) => r[addlTotalIdx]));
  // Individual addl head columns — sized to label, capped at 34pt
  for (let i = addlStart; i <= addlEnd; i++)
    fixedW[i] = Math.min(colW(allHeaders[i], body.map((r) => r[i])), 34);

  const fixedTotal = Object.values(fixedW).reduce((a, b) => a + b, 0);
  const smpCount   = SMP_FEE_HEADS.length;
  const flexW      = (avail - fixedTotal) / smpCount;   // equal share for each SMP head

  const colWidths  = allHeaders.map((_, i) => fixedW[i] ?? flexW);

  // Build columnStyles
  const columnStyles: Record<number, object> = {};
  allHeaders.forEach((_, i) => {
    const base: Record<string, unknown> = { cellWidth: colWidths[i] };
    if (i < 4) base.halign = 'left';
    if (i === 0) base.fontStyle = 'bold';
    if (i === smpTotalIdx || i === svkIdx || i === grandIdx || i === addlTotalIdx)
      base.fontStyle = 'bold';
    columnStyles[i] = base;
  });

  // ── Detailed breakdown table ──────────────────────────────────────────────
  autoTable(doc, {
    startY: 72,
    head: [allHeaders],
    body,
    tableWidth: avail,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: { top: 6, bottom: 6, left: 2.5, right: 2.5 },
      valign: 'middle',
      halign: 'right',
      overflow: 'hidden',          // body cells never wrap — content is sized to fit
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [40, 40, 80],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      overflow: 'linebreak',       // headers may wrap (e.g. "SMP\nTotal")
      valign: 'middle',
    },
    columnStyles,
    margin: { left: margin, right: margin },
  });

  // ── Summary table — new page ──────────────────────────────────────────────
  doc.addPage();

  // Repeat page header on the new page
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(INST_NAME, pageW / 2, 28, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(INST_ADDR, pageW / 2, 39, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`FEE STRUCTURE  –  ${academicYear}`, pageW / 2, 54, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40);
  doc.text('FEE SUMMARY', margin, 68);

  const summaryHeaders = [
    'Course', 'Year', 'Adm Type', 'Adm Cat',
    'SMP Total', 'SVK',
    ...(addlLabels.length ? ['Addl Total'] : []),
    'Grand Total',
  ];

  const summaryBody = sorted.map((s) => [
    s.course,
    s.year.replace(' YEAR', ''),
    s.admType,
    s.admCat,
    smpTotal(s) || '',
    s.svk || '',
    ...(addlLabels.length ? [addlTotal(s) || ''] : []),
    grandTotal(s),
  ]);

  // Summary table widths: fixed compact for meta (4 cols), equal share for total cols
  const summaryMetaFixed = summaryHeaders.slice(0, 4).map((hdr, ci) =>
    colW(hdr, summaryBody.map((r) => r[ci]))
  );
  const summaryMetaTotal = summaryMetaFixed.reduce((a, b) => a + b, 0);
  const summaryTotalCols = summaryHeaders.length - 4;
  const summaryTotalW    = (avail - summaryMetaTotal) / summaryTotalCols;
  const summaryColWidths = summaryHeaders.map((_, i) =>
    i < 4 ? summaryMetaFixed[i] : summaryTotalW
  );
  const summaryColStyles: Record<number, object> = {};
  summaryHeaders.forEach((_, i) => {
    const base: Record<string, unknown> = { cellWidth: summaryColWidths[i] };
    if (i < 4) base.halign = 'left';
    if (i === 0) base.fontStyle = 'bold';
    if (summaryHeaders[i] === 'SMP Total' || summaryHeaders[i] === 'SVK' ||
        summaryHeaders[i] === 'Addl Total' || summaryHeaders[i] === 'Grand Total')
      base.fontStyle = 'bold';
    summaryColStyles[i] = base;
  });

  autoTable(doc, {
    startY: 74,
    head: [summaryHeaders],
    body: summaryBody,
    tableWidth: avail,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 6.5, bottom: 6.5, left: 3, right: 3 },
      valign: 'middle',
      halign: 'right',
      overflow: 'hidden',
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [40, 40, 80],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: summaryColStyles,
    margin: { left: margin, right: margin },
  });

  // ── Footer note ───────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryEndY = (doc as any).lastAutoTable?.finalY ?? 400;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(
    'Note: This fee structure is subject to change without prior notice. For queries contact the college office.',
    pageW / 2,
    summaryEndY + 12,
    { align: 'center' }
  );

  doc.save(`Fee Structure – ${academicYear}.pdf`);
}

// ── Excel Export ──────────────────────────────────────────────────────────────

export function exportFeeStructureExcel(structures: FeeStructure[], academicYear: string): void {
  const sorted     = sortStructures(structures);
  const addlLabels = collectAddlLabels(sorted);

  const wb = XLSX.utils.book_new();

  const headerRow1 = [INST_NAME];
  const headerRow2 = [INST_ADDR];
  const headerRow3 = [`FEE STRUCTURE – ${academicYear}   (All amounts in ₹)`];
  const blankRow: string[] = [];

  const colHeaders = [
    'Course', 'Year', 'Adm Type', 'Adm Cat',
    ...SMP_FEE_HEADS.map((h) => h.label),
    'SMP Total', 'SVK',
    ...addlLabels,
    ...(addlLabels.length ? ['Addl Total'] : []),
    'Grand Total',
  ];

  const dataRows = sorted.map((s) => {
    const addlAmts = addlLabels.map(
      (lbl) => s.additionalHeads.find((h) => h.label.trim() === lbl)?.amount ?? 0
    );
    return [
      s.course,
      s.year,
      s.admType,
      s.admCat,
      ...SMP_FEE_HEADS.map(({ key }) => s.smp[key]),
      smpTotal(s),
      s.svk,
      ...addlAmts,
      ...(addlLabels.length ? [addlTotal(s)] : []),
      grandTotal(s),
    ];
  });

  const sheetData = [headerRow1, headerRow2, headerRow3, blankRow, colHeaders, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  const totalCols = colHeaders.length;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: totalCols - 1 } },
  ];

  ws['!cols'] = colHeaders.map((h, i) => {
    if (i < 4) return { wch: Math.max(h.length + 2, 14) };
    if (h === 'SMP Total' || h === 'Grand Total' || h === 'Addl Total') return { wch: 10 };
    return { wch: Math.max(h.length + 1, 7) };
  });

  XLSX.utils.book_append_sheet(wb, ws, academicYear);
  XLSX.writeFile(wb, `Fee Structure – ${academicYear}.xlsx`);
}

// ── Formatted Export (matches reference Fee_Structure layout) ─────────────────

const FEE_HEAD_LABELS: Record<SMPFeeHead, string> = {
  adm:     'Admission Fee',
  tuition: 'Tuition Fee',
  lib:     'Library Fee',
  rr:      'Reading Room (RR)',
  sports:  'Sports Fee',
  lab:     'Lab Fee',
  dvp:     'Development Fee (DVP)',
  mag:     'Magazine',
  idCard:  'ID Card',
  ass:     'Association Fee',
  swf:     'Student Welfare (SWF)',
  twf:     'Teacher Welfare (TWF)',
  nss:     'NSS Fee',
  fine:    'Fine',
};

// 11 standard column combinations (year × admType × admCat)
// SNQ = scholarship category: admType REGULAR, admCat SNQ
const COMBOS = [
  { year: '1ST YEAR', admType: 'REGULAR',  admCat: 'GM'  },
  { year: '1ST YEAR', admType: 'REGULAR',  admCat: 'SNQ' },
  { year: '1ST YEAR', admType: 'REPEATER', admCat: 'GM'  },
  { year: '2ND YEAR', admType: 'REGULAR',  admCat: 'GM'  },
  { year: '2ND YEAR', admType: 'REGULAR',  admCat: 'SNQ' },
  { year: '2ND YEAR', admType: 'LATERAL',  admCat: 'GM'  },
  { year: '2ND YEAR', admType: 'REPEATER', admCat: 'GM'  },
  { year: '3RD YEAR', admType: 'REGULAR',  admCat: 'GM'  },
  { year: '3RD YEAR', admType: 'REGULAR',  admCat: 'SNQ' },
  { year: '3RD YEAR', admType: 'LATERAL',  admCat: 'GM'  },
  { year: '3RD YEAR', admType: 'REPEATER', admCat: 'GM'  },
] as const;

type Combo = (typeof COMBOS)[number];

export function exportFeeStructureFormatted(structures: FeeStructure[], academicYear: string): void {
  // ── Lookup helper ──────────────────────────────────────────────────────────
  const lookup = new Map<string, FeeStructure>();
  for (const s of structures) {
    lookup.set(`${s.course}|${s.year}|${s.admType}|${s.admCat}`, s);
  }

  function getS(course: string, c: Combo): FeeStructure | undefined {
    const s = lookup.get(`${course}|${c.year}|${c.admType}|${c.admCat}`);
    if (s) return s;
    // SNQ may have been saved with admType:'SNQ' before it was removed from AdmType options
    if (c.admCat === 'SNQ') {
      return (
        lookup.get(`${course}|${c.year}|SNQ|GM`) ??
        lookup.get(`${course}|${c.year}|SNQ|SNQ`) ??
        lookup.get(`${course}|${c.year}|SNQ|OTHERS`)
      );
    }
    return undefined;
  }

  function smpVal(course: string, c: Combo, key: SMPFeeHead): number | string {
    const s = getS(course, c);
    if (!s) return '-';
    return s.smp[key] === 0 ? '-' : s.smp[key];
  }

  function smpTot(course: string, c: Combo): number | string {
    const s = getS(course, c);
    if (!s) return '-';
    const t = SMP_FEE_HEADS.reduce((acc, { key }) => acc + s.smp[key], 0);
    return t === 0 ? '-' : t;
  }

  function svkVal(course: string, c: Combo): number | string {
    const s = getS(course, c);
    if (!s) return '-';
    return s.svk === 0 ? '-' : s.svk;
  }

  function addlVal(course: string, c: Combo, label: string): number | string {
    const s = getS(course, c);
    if (!s) return '-';
    const h = s.additionalHeads.find((x) => x.label.trim() === label);
    return h && h.amount > 0 ? h.amount : '-';
  }

  function grandTot(course: string, c: Combo): number | string {
    const s = getS(course, c);
    if (!s) return '-';
    const smp = SMP_FEE_HEADS.reduce((acc, { key }) => acc + s.smp[key], 0);
    const addl = s.additionalHeads.reduce((acc, h) => acc + h.amount, 0);
    const t = smp + s.svk + addl;
    return t === 0 ? '-' : t;
  }

  // ── Sheet 1: Fee Structure ─────────────────────────────────────────────────
  const NC = 13; // Sl + Fee Component + 11 data columns

  function buildSection(
    course: string,
    sectionLabel: string,
    addlLabels: string[],
    startRow: number
  ): { rows: (string | number)[][]; merges: XLSX.Range[] } {
    const rows: (string | number)[][] = [];
    const merges: XLSX.Range[] = [];
    let r = startRow;

    // Section header (merged full row)
    rows.push([sectionLabel, ...Array(NC - 1).fill('')]);
    merges.push({ s: { r, c: 0 }, e: { r, c: NC - 1 } });
    r++;

    // Year span header
    rows.push(['Sl', 'Fee Component', '1st Year', '', '', '2nd Year', '', '', '', '3rd Year', '', '', '']);
    merges.push({ s: { r, c: 2 }, e: { r, c: 4  } });
    merges.push({ s: { r, c: 5 }, e: { r, c: 8  } });
    merges.push({ s: { r, c: 9 }, e: { r, c: 12 } });
    r++;

    // Adm type header
    rows.push(['', '', 'Regular', '', 'Repeater', 'Regular', '', 'Lateral', 'Repeater', 'Regular', '', 'Lateral', 'Repeater']);
    merges.push({ s: { r, c: 2  }, e: { r, c: 3  } }); // 1Y Regular (GM+SNQ)
    merges.push({ s: { r, c: 5  }, e: { r, c: 6  } }); // 2Y Regular (GM+SNQ)
    merges.push({ s: { r, c: 9  }, e: { r, c: 10 } }); // 3Y Regular (GM+SNQ)
    r++;

    // Adm cat header (GM / SNQ)
    rows.push(['', '', 'GM', 'SNQ', '', 'GM', 'SNQ', '', '', 'GM', 'SNQ', '', '']);
    r++;

    // Fee component rows
    let sl = 1;
    for (const { key } of SMP_FEE_HEADS) {
      // Skip fine if all zero for this course across all combos
      if (key === 'fine' && COMBOS.every((c) => { const s = getS(course, c); return !s || s.smp.fine === 0; })) continue;
      rows.push([sl, FEE_HEAD_LABELS[key], ...COMBOS.map((c) => smpVal(course, c, key))]);
      r++; sl++;
    }

    // SMP total
    rows.push(['', 'SMP Total (Govt. Fee)', ...COMBOS.map((c) => smpTot(course, c))]);
    r++;

    // SVK
    rows.push(['', 'SVK Dvp Fund (Mgmt. Fee)', ...COMBOS.map((c) => svkVal(course, c))]);
    r++;

    // Additional heads
    for (const label of addlLabels) {
      rows.push(['', label, ...COMBOS.map((c) => addlVal(course, c, label))]);
      r++;
    }

    // Grand total
    rows.push(['', 'GRAND TOTAL', ...COMBOS.map((c) => grandTot(course, c))]);
    r++;

    return { rows, merges };
  }

  const aidedCourses = ['CE', 'ME', 'EC', 'CS'];
  const aidedAddlLabels = collectAddlLabels(structures.filter((s) => aidedCourses.includes(s.course)));
  const eeAddlLabels    = collectAddlLabels(structures.filter((s) => s.course === 'EE'));

  // Pick a representative course for aided section (use CE if present, else first available)
  const aidedRepCourse = aidedCourses.find((c) => structures.some((s) => s.course === c)) ?? 'CE';

  const sheet1Rows: (string | number)[][] = [];
  const sheet1Merges: XLSX.Range[] = [];

  let row = 0;

  // Institution header
  sheet1Rows.push([`${INST_NAME}`, ...Array(NC - 1).fill('')]);
  sheet1Merges.push({ s: { r: row, c: 0 }, e: { r: row, c: NC - 1 } });
  row++;

  sheet1Rows.push([`College Admission Fee Structure  |  Academic Year: ${academicYear}`, ...Array(NC - 1).fill('')]);
  sheet1Merges.push({ s: { r: row, c: 0 }, e: { r: row, c: NC - 1 } });
  row++;

  sheet1Rows.push(Array(NC).fill(''));
  row++;

  // Aided section
  const aidedSec = buildSection(aidedRepCourse, '  ▶  CE / CS / EC / ME — Aided Courses (Government Quota)', aidedAddlLabels, row);
  for (const r2 of aidedSec.rows) sheet1Rows.push(r2);
  for (const m of aidedSec.merges) sheet1Merges.push(m);
  row += aidedSec.rows.length;

  sheet1Rows.push(Array(NC).fill(''));
  row++;

  // EE section
  const hasEE = structures.some((s) => s.course === 'EE');
  if (hasEE) {
    const eeSec = buildSection('EE', '  ▶  EE — Unaided Course (Management Quota)', eeAddlLabels, row);
    for (const r2 of eeSec.rows) sheet1Rows.push(r2);
    for (const m of eeSec.merges) sheet1Merges.push(m);
    row += eeSec.rows.length;
  }

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
  ws1['!merges'] = sheet1Merges;
  ws1['!cols'] = [
    { wch: 4  }, // Sl
    { wch: 28 }, // Fee Component
    { wch: 9  }, { wch: 9  }, { wch: 9  }, // 1st Year
    { wch: 9  }, { wch: 9  }, { wch: 9  }, { wch: 9  }, // 2nd Year
    { wch: 9  }, { wch: 9  }, { wch: 9  }, { wch: 9  }, // 3rd Year
  ];

  // ── Sheet 2: Component Breakup ─────────────────────────────────────────────
  // Columns: fee head | one column per unique (course-group × combo)
  // Groups: aided (1Y GM, 1Y SNQ, 1Y Rep, 2Y GM, 2Y SNQ, 2Y Lat, 2Y Rep, 3Y GM, 3Y SNQ, 3Y Lat, 3Y Rep) + EE same
  const aidedGroupLabel = 'CE / CS / EC / ME';
  const eeGroupLabel    = 'EE Course';

  const breakupHeader1: (string | number)[] = [''];
  const breakupHeader2: (string | number)[] = [''];
  const breakupHeader3: (string | number)[] = ['Fee Component'];

  const breakupColCourses: { course: string; combo: Combo }[] = [];

  // Aided combos
  for (const c of COMBOS) {
    breakupColCourses.push({ course: aidedRepCourse, combo: c });
  }
  breakupHeader1.push(aidedGroupLabel, ...Array(COMBOS.length - 1).fill(''));

  // EE combos
  if (hasEE) {
    for (const c of COMBOS) {
      breakupColCourses.push({ course: 'EE', combo: c });
    }
    breakupHeader1.push(eeGroupLabel, ...Array(COMBOS.length - 1).fill(''));
  }

  for (const { combo } of breakupColCourses) {
    const yr = combo.year === '1ST YEAR' ? '1Y' : combo.year === '2ND YEAR' ? '2Y' : '3Y';
    const tp = combo.admType === 'REGULAR' ? (combo.admCat === 'SNQ' ? 'SNQ' : 'Reg') : combo.admType === 'LATERAL' ? 'Lat' : 'Rep';
    const cat = combo.admCat;
    breakupHeader2.push(`${yr} ${tp}`);
    breakupHeader3.push(cat);
  }

  const breakupRows: (string | number)[][] = [
    [`${INST_NAME} — Fee Component Breakup  |  ${academicYear}`, ...Array(breakupColCourses.length).fill('')],
    [],
    breakupHeader1,
    breakupHeader2,
    breakupHeader3,
  ];

  // Merge institution header
  const b2Merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: breakupColCourses.length } },
  ];

  // Merge group headers
  b2Merges.push({ s: { r: 2, c: 1 }, e: { r: 2, c: COMBOS.length } });
  if (hasEE) b2Merges.push({ s: { r: 2, c: COMBOS.length + 1 }, e: { r: 2, c: COMBOS.length * 2 } });

  // Fee head rows
  const allAddlLabels = collectAddlLabels(structures);
  for (const { key } of SMP_FEE_HEADS) {
    if (key === 'fine') continue;
    const row2: (string | number)[] = [FEE_HEAD_LABELS[key]];
    for (const { course, combo } of breakupColCourses) row2.push(smpVal(course, combo, key));
    breakupRows.push(row2);
  }
  // SMP total
  const smpTotRow: (string | number)[] = ['SMP Total'];
  for (const { course, combo } of breakupColCourses) smpTotRow.push(smpTot(course, combo));
  breakupRows.push(smpTotRow);
  // SVK
  const svkRow: (string | number)[] = ['SVK Dev. Fund'];
  for (const { course, combo } of breakupColCourses) svkRow.push(svkVal(course, combo));
  breakupRows.push(svkRow);
  // Additional heads
  for (const label of allAddlLabels) {
    const addlRow: (string | number)[] = [label];
    for (const { course, combo } of breakupColCourses) addlRow.push(addlVal(course, combo, label));
    breakupRows.push(addlRow);
  }
  // Grand total
  const grandRow: (string | number)[] = ['GRAND TOTAL'];
  for (const { course, combo } of breakupColCourses) grandRow.push(grandTot(course, combo));
  breakupRows.push(grandRow);

  const ws2 = XLSX.utils.aoa_to_sheet(breakupRows);
  ws2['!merges'] = b2Merges;
  ws2['!cols'] = [
    { wch: 28 },
    ...breakupColCourses.map(() => ({ wch: 9 })),
  ];

  // ── Sheet 3: Course-wise Data (flat) ───────────────────────────────────────
  const sorted3      = sortStructures(structures);
  const allAddl3     = collectAddlLabels(sorted3);
  const flatHeaders3 = [
    'Course', 'Year', 'Adm Type', 'Adm Cat',
    ...SMP_FEE_HEADS.map(({ key }) => FEE_HEAD_LABELS[key]),
    'SMP Total', 'SVK Dev. Fund',
    ...allAddl3,
    ...(allAddl3.length ? ['Addl Total'] : []),
    'Grand Total',
  ];
  const flatRows3 = sorted3.map((s) => {
    const addlAmts = allAddl3.map(
      (lbl) => s.additionalHeads.find((h) => h.label.trim() === lbl)?.amount ?? 0
    );
    return [
      s.course, s.year, s.admType, s.admCat,
      ...SMP_FEE_HEADS.map(({ key }) => s.smp[key]),
      smpTotal(s), s.svk,
      ...addlAmts,
      ...(allAddl3.length ? [addlTotal(s)] : []),
      grandTotal(s),
    ];
  });
  const ws3 = XLSX.utils.aoa_to_sheet([
    [`${INST_NAME} — Course-wise Fee Master Data  |  ${academicYear}`],
    [],
    flatHeaders3,
    ...flatRows3,
  ]);
  ws3['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: flatHeaders3.length - 1 } }];
  ws3['!cols'] = flatHeaders3.map((_, i) => ({ wch: i < 4 ? 14 : 9 }));

  // ── Sheet 4: Quick Reference ───────────────────────────────────────────────
  type QRRow = [number | string, string, string | number, string | number, string | number, string];
  const qrRows: QRRow[] = [];
  const qrScenarios: { label: string; course: string; admType: string; admCat: string }[] = [
    { label: `${aidedRepCourse}/CS/EC/ME — Regular (GM)`,          course: aidedRepCourse, admType: 'REGULAR',  admCat: 'GM'  },
    { label: `${aidedRepCourse}/CS/EC/ME — SNQ (Scholarship)`,     course: aidedRepCourse, admType: 'REGULAR',  admCat: 'SNQ' },
    { label: `${aidedRepCourse}/CS/EC/ME — Repeater (GM)`,         course: aidedRepCourse, admType: 'REPEATER', admCat: 'GM'  },
    { label: `${aidedRepCourse}/CS/EC/ME — Lateral (2nd Yr)`,      course: aidedRepCourse, admType: 'LATERAL',  admCat: 'GM'  },
  ];
  if (hasEE) {
    qrScenarios.push(
      { label: 'EE — Regular (GM)',    course: 'EE', admType: 'REGULAR',  admCat: 'GM'  },
      { label: 'EE — SNQ (Scholarship)', course: 'EE', admType: 'REGULAR',  admCat: 'SNQ' },
      { label: 'EE — Repeater (GM)',   course: 'EE', admType: 'REPEATER', admCat: 'GM'  },
      { label: 'EE — Lateral (2nd Yr)', course: 'EE', admType: 'LATERAL',  admCat: 'GM'  },
    );
  }

  let slQR = 1;
  for (const sc of qrScenarios) {
    const get = (yr: '1ST YEAR' | '2ND YEAR' | '3RD YEAR') => {
      const key = `${sc.course}|${yr}|${sc.admType}|${sc.admCat}`;
      const s = lookup.get(key);
      if (!s) return '—';
      const t = SMP_FEE_HEADS.reduce((a, { key: k }) => a + s.smp[k], 0) + s.svk + s.additionalHeads.reduce((a, h) => a + h.amount, 0);
      return t === 0 ? '—' : t;
    };
    const isLateral = sc.admType === 'LATERAL';
    qrRows.push([slQR, sc.label, isLateral ? '—' : get('1ST YEAR'), get('2ND YEAR'), isLateral ? '—' : get('3RD YEAR'), '']);
    slQR++;
  }

  const ws4 = XLSX.utils.aoa_to_sheet([
    [`${INST_NAME} — Quick Fee Reference  |  ${academicYear}`],
    [],
    ['Sl', 'Student Category / Scenario', '1st Yr (₹)', '2nd Yr (₹)', '3rd Yr (₹)', 'Notes'],
    ...qrRows,
    [],
    ['FEE COMPONENT ABBREVIATIONS', '', '', '', '', ''],
    ['RR',  'Reading Room Fee',          '', '', '', ''],
    ['DVP', 'Development Fee',           '', '', '', ''],
    ['Mag', 'Magazine Fee',              '', '', '', ''],
    ['ID',  'Identity Card Fee',         '', '', '', ''],
    ['Ass', 'Association Fee',           '', '', '', ''],
    ['SWF', 'Student Welfare Fund',      '', '', '', ''],
    ['TWF', 'Teacher Welfare Fund',      '', '', '', ''],
    ['NSS', 'National Service Scheme',   '', '', '', ''],
    ['SMP', 'Sanjay Memorial Polytechnic (Govt-regulated fees)', '', '', '', ''],
    ['SVK', 'SVK Development Fund (Management fee)',             '', '', '', ''],
    ['SNQ', 'Scholarship (SC/ST/OBC) — Tuition waived by Govt', '', '', '', ''],
    ['GM',  'General Merit (includes 2A, 2B, 3A, 3B categories)', '', '', '', ''],
  ]);
  ws4['!cols'] = [{ wch: 6 }, { wch: 44 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 36 }];

  // ── Assemble workbook ──────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Fee Structure');
  XLSX.utils.book_append_sheet(wb, ws2, 'Component Breakup');
  XLSX.utils.book_append_sheet(wb, ws3, 'Course-wise Data');
  XLSX.utils.book_append_sheet(wb, ws4, 'Quick Reference');
  XLSX.writeFile(wb, `Fee_Structure_${academicYear}.xlsx`);
}

// ── Formatted PDF Export (matches reference Fee_Structure layout) ──────────────

export function exportFeeStructureFormattedPDF(structures: FeeStructure[], academicYear: string): void {
  // ── Lookup helpers (same as exportFeeStructureFormatted) ──────────────────
  const lookup = new Map<string, FeeStructure>();
  for (const s of structures) {
    lookup.set(`${s.course}|${s.year}|${s.admType}|${s.admCat}`, s);
  }

  function getS(course: string, c: Combo): FeeStructure | undefined {
    const s = lookup.get(`${course}|${c.year}|${c.admType}|${c.admCat}`);
    if (s) return s;
    // SNQ may have been saved with admType:'SNQ' before it was removed from AdmType options
    if (c.admCat === 'SNQ') {
      return (
        lookup.get(`${course}|${c.year}|SNQ|GM`) ??
        lookup.get(`${course}|${c.year}|SNQ|SNQ`) ??
        lookup.get(`${course}|${c.year}|SNQ|OTHERS`)
      );
    }
    return undefined;
  }
  function smpVal(course: string, c: Combo, key: SMPFeeHead): number | string {
    const s = getS(course, c); if (!s) return '–';
    return s.smp[key] === 0 ? '–' : s.smp[key];
  }
  function smpTot(course: string, c: Combo): number | string {
    const s = getS(course, c); if (!s) return '–';
    const t = SMP_FEE_HEADS.reduce((a, { key }) => a + s.smp[key], 0);
    return t === 0 ? '–' : t;
  }
  function svkVal(course: string, c: Combo): number | string {
    const s = getS(course, c); if (!s) return '–';
    return s.svk === 0 ? '–' : s.svk;
  }
  function addlVal(course: string, c: Combo, label: string): number | string {
    const s = getS(course, c); if (!s) return '–';
    const h = s.additionalHeads.find((x) => x.label.trim() === label);
    return h && h.amount > 0 ? h.amount : '–';
  }
  function grandTot(course: string, c: Combo): number | string {
    const s = getS(course, c); if (!s) return '–';
    const smp  = SMP_FEE_HEADS.reduce((a, { key }) => a + s.smp[key], 0);
    const addl = s.additionalHeads.reduce((a, h) => a + h.amount, 0);
    const t = smp + s.svk + addl;
    return t === 0 ? '–' : t;
  }

  // ── PDF setup ─────────────────────────────────────────────────────────────
  const doc    = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const margin = 20;
  const avail  = pageW - margin * 2;  // ~801pt

  // Fixed column widths: Sl + Fee Component + 11 data cols
  const slW    = 22;
  const fcW    = 138;
  const dataW  = (avail - slW - fcW) / 11;  // ~58pt each

  const columnStyles: Record<number, object> = {
    0: { cellWidth: slW,  halign: 'center' as const },
    1: { cellWidth: fcW,  halign: 'left'   as const, fontStyle: 'bold' as const },
  };
  for (let i = 2; i < 13; i++) {
    columnStyles[i] = { cellWidth: dataW, halign: 'right' as const };
  }

  // 3-row merged header
  const head = [
    [
      { content: 'Sl',           rowSpan: 3 },
      { content: 'Fee Component', rowSpan: 3 },
      { content: '1st Year',     colSpan: 3 },
      { content: '2nd Year',     colSpan: 4 },
      { content: '3rd Year',     colSpan: 4 },
    ],
    [
      { content: 'Regular', colSpan: 2 }, { content: 'Repeater' },
      { content: 'Regular', colSpan: 2 }, { content: 'Lateral' }, { content: 'Repeater' },
      { content: 'Regular', colSpan: 2 }, { content: 'Lateral' }, { content: 'Repeater' },
    ],
    ['GM', 'SNQ', '', 'GM', 'SNQ', '', '', 'GM', 'SNQ', '', ''],
  ];

  function addPageHeader(title: string, startY: number): void {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(INST_NAME, pageW / 2, startY, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(INST_ADDR, pageW / 2, startY + 11, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Fee Structure – ${academicYear}`, pageW / 2, startY + 24, { align: 'center' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(title, pageW / 2, startY + 35, { align: 'center' });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, startY + 39, pageW - margin, startY + 39);
    doc.setTextColor(0);
  }

  function buildBody(course: string, addlLabels: string[]): (string | number)[][] {
    const body: (string | number)[][] = [];
    let sl = 1;
    for (const { key } of SMP_FEE_HEADS) {
      if (key === 'fine' && COMBOS.every((c) => { const s = getS(course, c); return !s || s.smp.fine === 0; })) continue;
      body.push([sl, FEE_HEAD_LABELS[key], ...COMBOS.map((c) => smpVal(course, c, key))]);
      sl++;
    }
    body.push(['', 'SMP Total (Govt. Fee)', ...COMBOS.map((c) => smpTot(course, c))]);
    body.push(['', 'SVK Dvp Fund (Mgmt. Fee)', ...COMBOS.map((c) => svkVal(course, c))]);
    for (const label of addlLabels) {
      body.push(['', label, ...COMBOS.map((c) => addlVal(course, c, label))]);
    }
    body.push(['', 'GRAND TOTAL', ...COMBOS.map((c) => grandTot(course, c))]);
    return body;
  }

  function renderSection(
    course: string,
    addlLabels: string[],
    sectionTitle: string,
    newPage: boolean,
  ): void {
    if (newPage) doc.addPage();

    addPageHeader(sectionTitle, 18);

    const body = buildBody(course, addlLabels);

    // Highlight rows: totals at bottom
    const totalRowsCount = 2 + addlLabels.length + 1; // SMP + SVK + addl + Grand
    const totalRowStart  = body.length - totalRowsCount;

    autoTable(doc, {
      startY: 64,
      head,
      body,
      tableWidth: avail,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7,
        cellPadding: { top: 4.5, bottom: 4.5, left: 2, right: 2 },
        valign: 'middle',
        halign: 'right',
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center',
        valign: 'middle',
        overflow: 'linebreak',
      },
      columnStyles,
      margin: { left: margin, right: margin },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell(data: any) {
        if (data.section !== 'body') return;
        const ri = data.row.index;
        // Grand Total row
        if (ri === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [219, 234, 254];
          data.cell.styles.textColor = [30, 58, 138];
        } else if (ri >= totalRowStart && ri < body.length - 1) {
          // SMP total, SVK, addl rows
          data.cell.styles.fillColor = [249, 250, 251];
          if (data.column.index === 1) data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  const aidedCourses   = ['CE', 'ME', 'EC', 'CS'];
  const aidedRepCourse = aidedCourses.find((c) => structures.some((s) => s.course === c)) ?? 'CE';
  const aidedAddlLbls  = collectAddlLabels(structures.filter((s) => aidedCourses.includes(s.course)));
  const hasEE          = structures.some((s) => s.course === 'EE');
  const eeAddlLbls     = collectAddlLabels(structures.filter((s) => s.course === 'EE'));

  // Page 1: Aided courses
  renderSection(
    aidedRepCourse,
    aidedAddlLbls,
    'CE / CS / EC / ME — Aided Courses (Government Quota)',
    false,
  );

  // Page 2: EE (if exists)
  if (hasEE) {
    renderSection(
      'EE',
      eeAddlLbls,
      'EE — Unaided Course (Management Quota)',
      true,
    );
  }

  // Page: Quick Reference summary
  doc.addPage();
  addPageHeader('Quick Fee Reference', 18);

  const qrScenarios: { label: string; course: string; admType: string; admCat: string }[] = [
    { label: 'CE/CS/EC/ME — Regular (GM)',       course: aidedRepCourse, admType: 'REGULAR',  admCat: 'GM'  },
    { label: 'CE/CS/EC/ME — SNQ (Scholarship)',  course: aidedRepCourse, admType: 'REGULAR',  admCat: 'SNQ' },
    { label: 'CE/CS/EC/ME — Lateral Entry',      course: aidedRepCourse, admType: 'LATERAL',  admCat: 'GM'  },
    { label: 'CE/CS/EC/ME — Repeater (GM)',      course: aidedRepCourse, admType: 'REPEATER', admCat: 'GM'  },
  ];
  if (hasEE) {
    qrScenarios.push(
      { label: 'EE — Regular (GM)',       course: 'EE', admType: 'REGULAR',  admCat: 'GM'  },
      { label: 'EE — SNQ (Scholarship)',  course: 'EE', admType: 'REGULAR',  admCat: 'SNQ' },
      { label: 'EE — Lateral Entry',      course: 'EE', admType: 'LATERAL',  admCat: 'GM'  },
      { label: 'EE — Repeater (GM)',      course: 'EE', admType: 'REPEATER', admCat: 'GM'  },
    );
  }

  const qrBody = qrScenarios.map((sc, i) => {
    const get = (yr: '1ST YEAR' | '2ND YEAR' | '3RD YEAR'): number | string => {
      const s = lookup.get(`${sc.course}|${yr}|${sc.admType}|${sc.admCat}`);
      if (!s) return '–';
      const smpAmt  = SMP_FEE_HEADS.reduce((a, { key }) => a + s.smp[key], 0);
      const addlAmt = s.additionalHeads.reduce((a, h) => a + h.amount, 0);
      const t = smpAmt + s.svk + addlAmt;
      return t === 0 ? '–' : t;
    };
    const isLat = sc.admType === 'LATERAL';
    return [i + 1, sc.label, isLat ? '–' : get('1ST YEAR'), get('2ND YEAR'), isLat ? '–' : get('3RD YEAR')];
  });

  autoTable(doc, {
    startY: 64,
    head: [['#', 'Student Category / Scenario', '1st Year (₹)', '2nd Year (₹)', '3rd Year (₹)']],
    body: qrBody,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 6, bottom: 6, left: 4, right: 4 }, valign: 'middle' },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      1: { cellWidth: 200, halign: 'left', fontStyle: 'bold' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    margin: { left: margin, right: margin },
  });

  const printDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? 400;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    `All amounts in ₹   ·   Printed: ${printDate}   ·   Subject to change without prior notice.`,
    pageW / 2, finalY + 16,
    { align: 'center' },
  );

  doc.save(`Fee_Structure_${academicYear}.pdf`);
}
