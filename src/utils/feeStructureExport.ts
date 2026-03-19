import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { FeeStructure } from '../types';
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
