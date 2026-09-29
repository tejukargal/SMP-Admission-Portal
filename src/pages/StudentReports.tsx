import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { useAuth } from '../contexts/AuthContext';
import { exportStudentReportPdf } from '../utils/studentReportPdf';
import { isConfirmedActive } from '../utils/studentStatus';
import { isWPStudent } from '../utils/wpStudent';
import { exportStudentsPdf, type StudentsPdfFilters } from '../utils/studentsPdf';
import { useAllStudents } from '../hooks/useAllStudents';
import { exportTcIssuedPdf, type TcRow } from '../utils/tcIssuedPdf';
import { exportPcIssuedPdf, type PcRow } from '../utils/pcIssuedPdf';
import type { TCRecord } from '../services/tcService';
import { clearTcHistory, academicYearFromDate } from '../services/tcService';
import { buildTCHTML, type TCFormData } from '../utils/transferCertificate';
import { CERT_CLEAR_PASSKEY } from '../config/constants';
import type { PCRecord } from '../services/pcService';
import { clearPcHistory } from '../services/pcService';
import { useAllRefunds } from '../hooks/useAllRefunds';
import { exportRefundStudentsPdf } from '../utils/refundStudentsPdf';
import type { RefundCategory, RefundRecord } from '../services/refundService';
import { PageSpinner } from '../components/common/PageSpinner';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { ColumnPickerDropdown } from '../components/common/ColumnPickerDropdown';
import { STUDENT_COLUMNS, DEFAULT_CUSTOM_COLUMNS, formatColumnValue, type ColumnDef, type ColumnKey } from '../utils/studentColumns';
import { sortByLevels, SORT_FIELD_OPTIONS, type SortLevel, type SortableField } from '../utils/sortStudents';
import { exportCustomStudentReportPdf } from '../utils/customStudentReportPdf';
import { exportNotAdmittedPdf } from '../utils/notAdmittedPdf';
import { exportTransferStudentsPdf } from '../utils/transferStudentsPdf';
import { updateStudentNotAdmittedStatus, updateStudentTransferOut } from '../services/studentService';
import { ACADEMIC_YEARS, CATEGORY_GROUPS, CATEGORY_GROUP_LABELS } from '../types';
import type { Student, Course, Year, Gender, Category, AdmType, AdmCat, AcademicYear, CategoryGroup, NotAdmittedStatusTag } from '../types';

const PAGE_SIZE = 100;

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[]     = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];

type ReportType = 'snq-allotment' | 'whatsapp-numbers' | 'tc-issued' | 'pc-issued' | 'allotted-category' | 'student-list' | 'not-admitted' | 'transfer-students' | 'refund-students' | 'custom';

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: 'snq-allotment',      label: 'List for SNQ Allotment'  },
  { value: 'whatsapp-numbers',   label: 'Whatsapp Numbers List'   },
  { value: 'tc-issued',          label: 'TC Issued List'          },
  { value: 'pc-issued',          label: 'PC Issued List'          },
  { value: 'allotted-category',  label: 'Allotted Category List'  },
  { value: 'student-list',       label: 'Student List'            },
  { value: 'not-admitted',       label: 'Not Admitted List'       },
  { value: 'transfer-students',  label: 'Transfer Students'       },
  { value: 'refund-students',    label: 'Refund Students List'    },
  { value: 'custom',             label: 'Custom Report'           },
];

const fs = 'rounded-full border border-[#4F46E5]/30 bg-white px-3 py-1 text-[12px] font-medium text-[#3730A3] hover:border-[#4F46E5]/55 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/25 focus:border-[#4F46E5] cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed';

const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left', center: 'text-center', right: 'text-right',
};

function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const c = a.course.localeCompare(b.course);
    if (c !== 0) return c;
    return (b.sslcObtainedTotal ?? 0) - (a.sslcObtainedTotal ?? 0);
  });
}

function exportWhatsappPdf(students: Student[], filters: {
  academicYear: string | null;
  courseFilter: string;
  yearFilter: string;
  admTypeFilter: string;
  admCatFilter: string;
  searchTerm: string;
}): void {
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W      = doc.internal.pageSize.getWidth();
  const MARGIN = 12;
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  const title = filters.academicYear
    ? `SMP Admissions — Whatsapp Numbers List  (${filters.academicYear})`
    : 'SMP Admissions — Whatsapp Numbers List';
  doc.text(title, W / 2, 13, { align: 'center' });

  const chips: string[] = [];
  if (filters.courseFilter)  chips.push(filters.courseFilter);
  if (filters.yearFilter)    chips.push(filters.yearFilter);
  if (filters.admTypeFilter) chips.push(filters.admTypeFilter);
  if (filters.admCatFilter)  chips.push(filters.admCatFilter);
  if (filters.searchTerm)    chips.push(`"${filters.searchTerm}"`);
  chips.push(`${students.length} student${students.length !== 1 ? 's' : ''}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(chips.join('  ·  '), MARGIN, 20);
  doc.text(`Generated ${dateStr}`, W - MARGIN, 20, { align: 'right' });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 23, W - MARGIN, 23);
  doc.setTextColor(0);

  const HEAD: [number, number, number]  = [21, 128, 61];   // green-700
  const WHITE: [number, number, number] = [255, 255, 255];
  const GRID: [number, number, number]  = [210, 215, 220];

  // Usable width = 210 - 12 - 12 = 186mm. Column widths sum to exactly 186mm.
  autoTable(doc, {
    startY: 26,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Sl', 'Student Name', 'Year', 'Course', 'Father Mobile', 'Student Mobile']],
    body: students.map((s, i) => [
      i + 1,
      s.studentNameSSLC,
      s.year,
      s.course,
      s.fatherMobile || '—',
      s.studentMobile || '—',
    ]),
    styles: { overflow: 'ellipsize' },
    headStyles: {
      fillColor: HEAD, textColor: WHITE, fontStyle: 'bold',
      fontSize: 9.5, cellPadding: { top: 3, right: 3.5, bottom: 3, left: 3.5 },
    },
    bodyStyles: {
      fontSize: 9.5, cellPadding: { top: 3, right: 3.5, bottom: 3, left: 3.5 },
      lineColor: GRID, lineWidth: 0.18, textColor: [20, 20, 20] as [number, number, number],
    },
    alternateRowStyles: { fillColor: [240, 253, 244] as [number, number, number] },
    // Usable width = 210 - 12 - 12 = 186mm. Columns: 13+61+22+19+35+36 = 186mm.
    // Sl=13mm gives 6mm text space for up to 3-digit serial numbers.
    columnStyles: {
      0: { cellWidth: 13, halign: 'center' },
      1: { cellWidth: 61 },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 19, halign: 'center' },
      4: { cellWidth: 35 },
      5: { cellWidth: 36 },
    },
  });

  const totalPages = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(`Whatsapp Numbers List — ${filters.academicYear ?? ''}`, MARGIN, H - 5);
    doc.text(`Page ${p} of ${totalPages}`, W - MARGIN, H - 5, { align: 'right' });
  }

  const parts = ['whatsapp_numbers'];
  if (filters.academicYear) parts.push(filters.academicYear.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter) parts.push(filters.courseFilter);
  if (filters.yearFilter)   parts.push(filters.yearFilter.replace(/\s+/g, ''));
  doc.save(parts.join('_') + '.pdf');
}

function exportAllottedCategoryPdf(students: Student[], filters: {
  academicYear: string | null;
  courseFilter: string;
  yearFilter: string;
  admTypeFilter: string;
  admCatFilter: string;
  searchTerm: string;
}): void {
  // Landscape A4: 297mm wide. Usable = 297 - 12 - 12 = 273mm.
  // Columns: Sl(12) + Name(50) + FatherName(38) + Year(20) + Course(16) +
  //          RegNo(24) + Cat(14) + AllottedCat(24) + AdmType(22) + StudMob(27) + FatherMob(26) = 273mm
  const doc    = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W      = doc.internal.pageSize.getWidth();   // 297mm
  const MARGIN = 12;
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  const title = filters.academicYear
    ? `SMP Admissions — Allotted Category List  (${filters.academicYear})`
    : 'SMP Admissions — Allotted Category List';
  doc.text(title, W / 2, 12, { align: 'center' });

  const chips: string[] = [];
  if (filters.courseFilter)  chips.push(filters.courseFilter);
  if (filters.yearFilter)    chips.push(filters.yearFilter);
  if (filters.admTypeFilter) chips.push(filters.admTypeFilter);
  if (filters.admCatFilter)  chips.push(filters.admCatFilter);
  if (filters.searchTerm)    chips.push(`"${filters.searchTerm}"`);
  chips.push(`${students.length} student${students.length !== 1 ? 's' : ''}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(chips.join('  ·  '), MARGIN, 18);
  doc.text(`Generated ${dateStr}`, W - MARGIN, 18, { align: 'right' });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 21, W - MARGIN, 21);
  doc.setTextColor(0);

  const HEAD: [number, number, number]  = [30, 64, 175];   // indigo-800
  const WHITE: [number, number, number] = [255, 255, 255];
  const GRID: [number, number, number]  = [210, 215, 220];
  const CELL_PAD = { top: 2, right: 2.5, bottom: 2, left: 2.5 };

  autoTable(doc, {
    startY: 24,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Sl', 'Student Name', 'Year', 'Course', 'Reg No', 'Cat', 'Adm Cat', 'Allotted Cat', 'Adm Type', 'Student Mob', 'Father Mob']],
    body: students.map((s, i) => [
      i + 1,
      s.studentNameSSLC,
      s.year,
      s.course,
      s.regNumber || '—',
      s.category || '—',
      s.admCat || '—',
      s.allottedCategory || '—',
      s.admType || '—',
      s.studentMobile || '—',
      s.fatherMobile || '—',
    ]),
    styles: { overflow: 'ellipsize' },
    headStyles: {
      fillColor: HEAD, textColor: WHITE, fontStyle: 'bold',
      fontSize: 8, cellPadding: CELL_PAD,
    },
    bodyStyles: {
      fontSize: 8, cellPadding: CELL_PAD,
      lineColor: GRID, lineWidth: 0.18, textColor: [20, 20, 20] as [number, number, number],
    },
    alternateRowStyles: { fillColor: [239, 246, 255] as [number, number, number] },
    // Landscape usable = 297-12-12 = 273mm: 10+65+18+13+27+12+17+35+17+29+30 = 273mm
    columnStyles: {
      0:  { cellWidth: 10,  halign: 'center' },
      1:  { cellWidth: 65 },
      2:  { cellWidth: 18,  halign: 'center' },
      3:  { cellWidth: 13,  halign: 'center' },
      4:  { cellWidth: 27 },
      5:  { cellWidth: 12,  halign: 'center' },
      6:  { cellWidth: 17,  halign: 'center' },
      7:  { cellWidth: 35,  halign: 'center' },
      8:  { cellWidth: 17,  halign: 'center' },
      9:  { cellWidth: 29 },
      10: { cellWidth: 30 },
    },
  });

  const totalPages = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(`Allotted Category List — ${filters.academicYear ?? ''}`, MARGIN, H - 5);
    doc.text(`Page ${p} of ${totalPages}`, W - MARGIN, H - 5, { align: 'right' });
  }

  const parts = ['allotted_category'];
  if (filters.academicYear) parts.push(filters.academicYear.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter) parts.push(filters.courseFilter);
  if (filters.yearFilter)   parts.push(filters.yearFilter.replace(/\s+/g, ''));
  doc.save(parts.join('_') + '.pdf');
}

// ── Design tokens — student-portal look, indigo / periwinkle ──────────────────
const INDIGO = '#4F46E5';
const CORAL = '#E11D48';
const MINT = '#0FA968';
const AMBER = '#D97706';
const FALLBACK_COLOR = '#8A93A3';

// Each report keeps a small identifying tint (table header band + count chips).
const REPORT_TINT: Record<ReportType, string> = {
  'snq-allotment':     '#D97706',
  'whatsapp-numbers':  '#16A34A',
  'tc-issued':         '#2563EB',
  'pc-issued':         '#7C3AED',
  'allotted-category': '#C026D3',
  'student-list':      INDIGO,
  'not-admitted':      CORAL,
  'transfer-students': '#0284C7',
  'refund-students':   '#DB2777',
  'custom':            '#6366F1',
};

// Header band + divider colours per report (tint mixed 11% / 30% with white).
// Mirrored exactly in index.css (.scroll-report--<report>) for the scrollbar gutter.
const REPORT_BAND: Record<ReportType, { band: string; line: string }> = {
  'snq-allotment':      { band: '#FBF0E4', line: '#F4D6B4' },
  'whatsapp-numbers':   { band: '#E5F5EB', line: '#B9E3C9' },
  'tc-issued':          { band: '#E7EEFD', line: '#BED0F9' },
  'pc-issued':          { band: '#F1E9FD', line: '#D8C4FA' },
  'allotted-category':  { band: '#F8E7FA', line: '#ECBEF2' },
  'student-list':       { band: '#ECEBFC', line: '#CAC8F7' },
  'not-admitted':       { band: '#FCE6EB', line: '#F6BBC8' },
  'transfer-students':  { band: '#E3F1F9', line: '#B3DAEE' },
  'refund-students':    { band: '#FBE7F0', line: '#F4BED6' },
  'custom':             { band: '#EEEEFD', line: '#D0D1FB' },
};

const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };
const YEAR_COLOR: Record<string, string> = {
  '1ST YEAR': '#0EA5E9', '2ND YEAR': '#F59E0B', '3RD YEAR': '#8B5CF6',
};
const ADM_TYPE_COLOR: Record<string, string> = {
  REGULAR: '#1D6FD8', REPEATER: '#D97706', LATERAL: '#7C3AED', EXTERNAL: '#0F8B8D', SNQ: '#10B981',
};
const ADM_CAT_COLOR: Record<string, string> = { GM: '#5B9A2F', SNQ: '#10B981', OTHERS: '#F59E0B' };
const CATEGORY_COLOR: Record<string, string> = {
  GM: '#64748B', SC: '#0EA5E9', ST: '#14B8A6', C1: '#F59E0B', '2A': '#8B5CF6', '2B': '#EC4899', '3A': '#6366F1', '3B': '#10B981',
};
const GENDER_COLOR: Record<string, string> = { BOY: '#0EA5E9', GIRL: '#EC4899' };
const STATUS_COLOR: Record<string, string> = { CONFIRMED: MINT, CANCELLED: CORAL };
const REFUND_CAT_COLOR: Record<string, string> = { SNQ: '#2563EB', GENERAL: MINT, SEAT_CANCELLATION: AMBER };

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

// Outline chip: white fill + tinted hairline and ink; solid colour when selected.
function chipStyle(color: string, selected: boolean): React.CSSProperties {
  return selected
    ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 2px 8px ${color}40` }
    : { background: '#fff', borderColor: `${color}73`, color: inkOf(color) };
}

const OUTLINE_PILL_BTN =
  'shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#DCDDFB] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#262B35] hover:border-[#4F46E5]/40 hover:bg-[#4F46E5]/[0.06] hover:text-[#3730A3] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const CHIP_ARROW =
  'shrink-0 w-6 h-6 rounded-full border border-[#4F46E5]/40 bg-white text-[#3730A3] flex items-center justify-center shadow-[0_1px_4px_rgba(18,20,26,0.06)] enabled:hover:bg-[#F3F4FE] enabled:cursor-pointer disabled:opacity-35 disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]/30 transition-[opacity,background-color]';
const SELECT_PILL =
  'rounded-full border border-[#4F46E5]/30 bg-white px-3 py-1 text-[12px] font-medium text-[#3730A3] hover:border-[#4F46E5]/55 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/25 focus:border-[#4F46E5] cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed';
const FIELD_LABEL = 'text-[9.5px] font-medium uppercase tracking-[0.6px] text-[#8A8FA8] whitespace-nowrap select-none';
const TOOLBAR_SEP = <span className="w-px h-5 bg-[#DCDDFB] shrink-0" />;
const MENU_ITEM =
  'group w-full text-left px-2 py-1.5 rounded-[10px] text-[12px] font-medium text-[#5B6371] enabled:hover:bg-[#F5F6FE] enabled:hover:text-[#262B35] enabled:cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors duration-100';
const MENU_ICON =
  'w-6 h-6 rounded-[8px] bg-[#EEF0FE] text-[#5B6371] flex items-center justify-center flex-shrink-0 transition-colors';

// Report table cells. Header cells read the report tint from CSS variables set on
// the table's scroller (see ReportTable), so every table shares these classes.
const RTH =
  'h-9 px-3 py-0 align-middle text-[9.5px] font-medium uppercase tracking-[0.6px] whitespace-nowrap bg-[color:var(--band)] border-b border-[color:var(--band-line)] text-[color:var(--band-ink)]';
const RTBODY = '[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-t-[#EEEFFC]';
const RROW = 'transition-colors hover:bg-[#F7F7FE]';
const TD = 'px-3 py-2 whitespace-nowrap';
const TD_IDX = 'px-3 py-2 whitespace-nowrap text-[11px] font-medium text-[#8A8FA8] tabular-nums';
const TD_TXT = 'px-3 py-2 whitespace-nowrap text-[11.5px] font-medium text-[#4B5068]';
const TD_NUM = 'px-3 py-2 whitespace-nowrap text-[11.5px] font-medium text-black tabular-nums';
const DASH = <span className="text-[#C4C8D0]">—</span>;

/** Department ring monogram — pastel gradient in the department's hue with a thin ring. */
function RingAvatar({ name, course, size = 22 }: { name: string; course: string; size?: number }) {
  const h = DEPT_HUE[course] ?? 235;
  const ring = DEPT_DOT[course] ?? FALLBACK_COLOR;
  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0 font-medium tracking-[0.3px]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.43),
        background: `linear-gradient(135deg, hsl(${h - 6} 85% 88%), hsl(${h + 8} 85% 74%))`,
        color: `hsl(${h} 70% 22%)`,
        boxShadow: `0 0 0 1px #fff, 0 0 0 2px ${ring}80`,
      }}
      title={course}
    >
      {name.charAt(0)}
    </span>
  );
}

/** Compact thin-line pill: accent-tinted fill, border and ink text. */
function LinePill({ value, color, minWidth, title }: { value?: string | null; color?: string; minWidth?: number; title?: string }) {
  if (!value) return DASH;
  const c = color ?? FALLBACK_COLOR;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border px-[7px] py-[4.5px] text-[10.5px] font-medium leading-none whitespace-nowrap"
      style={{ background: `${c}14`, borderColor: `${c}73`, color: inkOf(c), minWidth }}
      title={title}
    >
      {value}
    </span>
  );
}

/** Name cell body: ring avatar + indigo-ink name + optional trailing tags. */
function NameCell({ name, course, children }: { name: string; course: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <RingAvatar name={name} course={course} />
      <span className="text-[12.5px] font-medium text-[#3730A3]">{name}</span>
      {children}
    </div>
  );
}

function EmptyState({ title, tone = 'muted' }: { title: string; tone?: 'muted' | 'error' }) {
  const isError = tone === 'error';
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-14 text-center" style={{ animation: 'content-enter 0.26s ease-out' }}>
      <div
        className="w-14 h-14 rounded-2xl border flex items-center justify-center"
        style={isError
          ? { borderColor: `${CORAL}40`, background: `${CORAL}0F`, color: CORAL }
          : { borderColor: '#DCDDFB', background: '#F3F4FE', color: '#8A8FA8' }}
      >
        {isError ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
        )}
      </div>
      <p className="text-[14px] font-medium" style={{ color: isError ? inkOf(CORAL) : '#5B6371' }}>{title}</p>
    </div>
  );
}

function AnimNum({ value }: { value: number }) {
  return (
    <span key={value} className="font-medium tabular-nums" style={{ display: 'inline-block', animation: 'stat-pop 0.28s ease-out' }}>
      {value}
    </span>
  );
}

/**
 * Report table card: the header cells read the report's band colours from CSS
 * variables on the scroller; the scrollbar gutter beside the header uses the
 * matching static class (.scroll-report--<report> in index.css). The "Showing…"
 * footer sits below the scroller so it is always visible.
 */
function ReportTable({ report, footer, children }: { report: ReportType; footer: React.ReactNode; children: React.ReactNode }) {
  const tint = REPORT_TINT[report];
  const { band, line } = REPORT_BAND[report];
  return (
    <div
      className="flex-1 min-h-0 bg-white rounded-2xl border border-[#DCDDFB] overflow-hidden flex flex-col transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(30,27,75,0.06)]"
      style={{ animation: 'content-enter 0.26s ease-out' }}
    >
      <div
        className={`scroll-report scroll-report--${report} flex-1 min-h-0 overflow-auto`}
        style={{ '--band': band, '--band-line': line, '--band-ink': inkOf(tint) } as React.CSSProperties}
      >
        <table className="w-full text-xs border-separate border-spacing-0">{children}</table>
      </div>
      <div className="flex-shrink-0 px-4 py-2 border-t border-[#DCDDFB] bg-[#F7F7FE] text-[11px] font-medium text-[#8A8FA8] flex items-center justify-between gap-3">
        {footer}
      </div>
    </div>
  );
}

/** "Load more" row spanning the table. */
function LoadMoreRow({ colSpan, remaining, onClick }: { colSpan: number; remaining: number; onClick: () => void }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-3 text-center border-t border-[#EEEFFC]">
        <button className={OUTLINE_PILL_BTN} onClick={onClick}>
          Load more ({remaining} remaining)
        </button>
      </td>
    </tr>
  );
}

const WP_TAG = <LinePill value="WP" color={AMBER} title="Working Professional (Evening College)" />;
const DUP_TAG = <LinePill value="DUP" color="#B45309" />;

// ── Clear-history modals (TC / PC) ───────────────────────────────────────────
const PASSKEY_INPUT =
  'block w-full rounded-xl border bg-[#F5F6FE] px-3 py-2 text-[13px] font-medium text-[#262B35] placeholder:text-[#A9ACC4] placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 transition-colors';
const MODAL_CANCEL_BTN =
  'inline-flex items-center justify-center rounded-full border border-[#4F46E5]/40 bg-white px-4 py-1.5 text-[12px] font-medium text-[#3730A3] hover:bg-[#4F46E5]/[0.06] hover:border-[#4F46E5]/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const MODAL_DANGER_BTN =
  'inline-flex items-center justify-center rounded-full px-4 py-1.5 text-[12px] font-medium text-white bg-[#E11D48] enabled:hover:bg-[#BE123C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48]/40 enabled:cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

/** Coral-tinted header for the destructive clear-history modals. */
function ClearModalHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div
      className="relative overflow-hidden px-5 py-3.5 flex items-center gap-2.5 border-b"
      style={{ background: `linear-gradient(135deg, ${CORAL}1F 0%, ${CORAL}0A 55%, #FFFFFF 100%)`, borderColor: `${CORAL}26` }}
    >
      <span
        className="pointer-events-none absolute -top-16 -right-8 w-36 h-36 rounded-full border-[18px]"
        style={{ borderColor: `${CORAL}10` }}
        aria-hidden="true"
      />
      <span
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-[10px] text-white shrink-0"
        style={{ background: `linear-gradient(135deg, ${CORAL}, #BE123C)`, boxShadow: `0 3px 10px ${CORAL}40` }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </span>
      <div className="relative flex flex-col">
        <span className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A8FA8] leading-none">{eyebrow}</span>
        <h3 className="mt-1 text-[16px] font-bold leading-none tracking-[-0.2px]" style={{ color: inkOf(CORAL) }}>{title}</h3>
      </div>
    </div>
  );
}

/** Student tile shown in the clear-history modals. */
function ClearModalStudent({ name, course, meta }: { name: string; course: string; meta: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#DCDDFB] bg-[#F7F7FE] px-3 py-2.5">
      <RingAvatar name={name} course={course} size={32} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[#3730A3] truncate">{name}</p>
        <p className="text-[11px] font-medium text-[#8A8FA8] mt-0.5 truncate">{meta}</p>
      </div>
    </div>
  );
}

export function StudentReports() {
  const { role }                               = useAuth();
  const isAdmin                                = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;
  const previousAcademicYear = (academicYear
    ? (ACADEMIC_YEARS[ACADEMIC_YEARS.indexOf(academicYear) - 1] ?? null)
    : null) as AcademicYear | null;

  const { students: rawStudents, loading, error, refetch } = useStudents(academicYear);
  const { students: rawPrevYearStudents, loading: prevYearLoading } = useStudents(previousAcademicYear);
  // WP (Working Professional / EXTERNAL) admissions are managed on /wp-students
  // and are excluded from every student report.
  const allStudents = useMemo(() => rawStudents.filter((s) => !isWPStudent(s)), [rawStudents]);
  const prevYearStudents = useMemo(() => rawPrevYearStudents.filter((s) => !isWPStudent(s)), [rawPrevYearStudents]);

  const [clearingTransferOutId, setClearingTransferOutId] = useState<string | null>(null);
  async function handleClearTransferOut(student: Student) {
    setClearingTransferOutId(student.id);
    try {
      await updateStudentTransferOut(student.id, false);
      refetch();
    } catch (err) {
      console.error('Failed to clear transfer-out status', err);
    } finally {
      setClearingTransferOutId(null);
    }
  }
  const { records: feeRecords, loading: feeLoading } = useFeeRecords(academicYear);
  // Certificate reports deliberately INCLUDE WP students: TCs and PCs are issued
  // to them from /wp-students using the same counters/{ay}__tc sequence, so the
  // issued lists must account for them. The Adm Type filter can isolate them.
  const { students: allStudentsForTC, loading: tcLoading, error: tcError } = useAllStudents();
  const { refunds: allRefunds, loading: refundsLoading, error: refundsError } = useAllRefunds();

  // ── Report type ─────────────────────────────────────────────────────────────
  const [urlSearchParams] = useSearchParams();
  const [reportType, setReportType] = useState<ReportType>(() => {
    const fromUrl = urlSearchParams.get('report');
    return REPORT_OPTIONS.some((o) => o.value === fromUrl) ? (fromUrl as ReportType) : 'snq-allotment';
  });

  // Earliest fee payment date per student
  const firstPaymentDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of feeRecords) {
      if (!r.date) continue;
      const d = r.date.split('T')[0];
      const existing = map.get(r.studentId);
      if (!existing || d < existing) map.set(r.studentId, d);
    }
    return map;
  }, [feeRecords]);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [searchTerm,     setSearchTerm]     = useState('');
  const [courseFilter,   setCourseFilter]   = useState<Course | ''>('');
  const [yearFilter,     setYearFilter]     = useState<Year | ''>('');
  const [genderFilter,   setGenderFilter]   = useState<Gender | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<Category | ''>('');
  const [categoryGroupFilter, setCategoryGroupFilter] = useState<CategoryGroup | ''>('');
  const [admTypeFilter,  setAdmTypeFilter]  = useState<AdmType | ''>('');
  const [admCatFilter,   setAdmCatFilter]   = useState<AdmCat | ''>('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [tcYearFilter,   setTcYearFilter]   = useState<string>('ALL');
  const [pcYearFilter,   setPcYearFilter]   = useState<string>('ALL');
  const [refundYearFilter,     setRefundYearFilter]     = useState<string>('ALL');
  const [refundCategoryFilter, setRefundCategoryFilter] = useState<RefundCategory | ''>('');

  // ── Custom Report: columns + multi-level sort ────────────────────────────────
  const [customColumns, setCustomColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_CUSTOM_COLUMNS));
  const [sortLevels, setSortLevels] = useState<SortLevel[]>([
    { field: '', direction: 'asc' },
    { field: '', direction: 'asc' },
    { field: '', direction: 'asc' },
  ]);
  // Column order follows selection order (the order columns were checked), not a fixed
  // group order — this is what lets DEFAULT_CUSTOM_COLUMNS dictate the default layout.
  const orderedCustomColumns = useMemo(
    () => Array.from(customColumns)
      .map((key) => STUDENT_COLUMNS.find((c) => c.key === key))
      .filter((c): c is ColumnDef => c !== undefined),
    [customColumns]
  );
  function setSortLevel(idx: number, patch: Partial<SortLevel>) {
    setSortLevels((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  const sortDescription = sortLevels
    .filter((l) => l.field)
    .map((l) => `${SORT_FIELD_OPTIONS.find((o) => o.value === l.field)?.label} (${l.direction === 'asc' ? '↑' : '↓'})`)
    .join(', ');

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [savingPdf,   setSavingPdf]   = useState(false);
  const [savingExcel, setSavingExcel] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // TC clear modal (double-click on a TC row)
  const [tcClearModal,          setTcClearModal]          = useState<TcRow | null>(null);
  const [tcClearModalClearing,  setTcClearModalClearing]  = useState(false);
  const [tcClearModalMsg,       setTcClearModalMsg]       = useState('');
  const [tcClearPasskey,        setTcClearPasskey]        = useState('');
  const [tcClearPasskeyError,   setTcClearPasskeyError]   = useState('');

  // TC preview modal (right-click on a TC row)
  const [tcPreviewRow, setTcPreviewRow] = useState<TcRow | null>(null);

  // PC clear modal (double-click on a PC row)
  const [pcClearModal,          setPcClearModal]          = useState<PcRow | null>(null);
  const [pcClearModalClearing,  setPcClearModalClearing]  = useState(false);
  const [pcClearModalMsg,       setPcClearModalMsg]       = useState('');
  const [pcClearPasskey,        setPcClearPasskey]        = useState('');
  const [pcClearPasskeyError,   setPcClearPasskeyError]   = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // ── Not Admitted List: full previous-year 1st/2nd year CONFIRMED pool, each
  // tagged ADMITTED / NOT_ADMITTED depending on whether a matching CONFIRMED
  // record (any year) exists in the current academic year ─────────────────────
  type EffectiveNotAdmittedStatus = 'ADMITTED' | 'NOT_ADMITTED' | NotAdmittedStatusTag;
  const [notAdmittedStatusFilter, setNotAdmittedStatusFilter] = useState<'' | EffectiveNotAdmittedStatus>('');

  // ── Transfer Students: current-year students flagged transferOut (leaving to
  // another polytechnic) or transferredIn (arrived from another polytechnic) ──
  const [transferDirectionFilter, setTransferDirectionFilter] = useState<'' | 'IN' | 'OUT'>('');

  // Right-click context menu (Not Admitted List rows) — mark/clear ANS/LEFTOUT/TRANSFERRED/TC_ISSUED
  const [statusCtxMenu, setStatusCtxMenu] = useState<{ x: number; y: number; student: Student } | null>(null);
  const statusCtxMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusCtxMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setStatusCtxMenu(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [statusCtxMenu]);

  useLayoutEffect(() => {
    const el = statusCtxMenuRef.current;
    if (!el || !statusCtxMenu) return;
    const GAP = 6;
    const { offsetWidth: w, offsetHeight: h } = el;
    let x = statusCtxMenu.x;
    let y = statusCtxMenu.y;
    if (x + w > window.innerWidth  - GAP) x = window.innerWidth  - w - GAP;
    if (y + h > window.innerHeight - GAP) y = window.innerHeight - h - GAP;
    if (x < GAP) x = GAP;
    if (y < GAP) y = GAP;
    el.style.left       = `${x}px`;
    el.style.top        = `${y}px`;
    el.style.visibility = 'visible';
  }, [statusCtxMenu]);

  async function handleSetNotAdmittedStatus(studentId: string, tag: NotAdmittedStatusTag | null) {
    setStatusCtxMenu(null);
    try {
      await updateStudentNotAdmittedStatus(studentId, tag);
    } catch (err) {
      console.error('Failed to update student status', err);
    }
  }

  const notAdmittedStatusMap = useMemo(() => {
    const map = new Map<string, 'ADMITTED' | 'NOT_ADMITTED'>();
    if (!previousAcademicYear) return map;
    const keyOf = (s: Student) =>
      s.regNumber?.trim()
        ? s.regNumber.trim().toUpperCase()
        : `${s.studentNameSSLC.trim().toUpperCase()}|${s.dateOfBirth}`;

    const admittedKeys = new Set(
      allStudents.filter((s) => s.admissionStatus === 'CONFIRMED').map(keyOf)
    );

    for (const s of prevYearStudents) {
      if (s.admissionStatus !== 'CONFIRMED') continue;
      if (s.year !== '1ST YEAR' && s.year !== '2ND YEAR') continue;
      map.set(s.id, admittedKeys.has(keyOf(s)) ? 'ADMITTED' : 'NOT_ADMITTED');
    }
    return map;
  }, [allStudents, prevYearStudents, previousAcademicYear]);

  // Current-year `year` (e.g. '2ND YEAR') the student was promoted into — only
  // populated for ADMITTED students; blank/'—' for NOT_ADMITTED in the UI.
  const notAdmittedCurrentYearMap = useMemo(() => {
    const map = new Map<string, Year>();
    if (!previousAcademicYear) return map;
    const keyOf = (s: Student) =>
      s.regNumber?.trim()
        ? s.regNumber.trim().toUpperCase()
        : `${s.studentNameSSLC.trim().toUpperCase()}|${s.dateOfBirth}`;

    const currentYearByKey = new Map<string, Year>();
    for (const s of allStudents) {
      if (s.admissionStatus !== 'CONFIRMED') continue;
      currentYearByKey.set(keyOf(s), s.year);
    }

    for (const s of prevYearStudents) {
      const currentYear = currentYearByKey.get(keyOf(s));
      if (currentYear) map.set(s.id, currentYear);
    }
    return map;
  }, [allStudents, prevYearStudents, previousAcademicYear]);

  const notAdmittedBase = useMemo(
    () => prevYearStudents.filter((s) => notAdmittedStatusMap.has(s.id)),
    [prevYearStudents, notAdmittedStatusMap]
  );

  const notAdmittedStats = useMemo(() => {
    const byYear: Record<string, number> = {};
    const byCourse: Record<string, number> = {};
    for (const s of notAdmittedBase) {
      byYear[s.year]     = (byYear[s.year] ?? 0) + 1;
      byCourse[s.course] = (byCourse[s.course] ?? 0) + 1;
    }
    return { byYear, byCourse, total: notAdmittedBase.length };
  }, [notAdmittedBase]);

  // Same filters as the main pipeline, minus the Admitted/Not Admitted status
  // filter itself — used to drive the summary sentence above the toolbar so it
  // always reflects the full admitted+pending breakdown for the active filters.
  const notAdmittedSummaryPool = useMemo(() => {
    if (reportType !== 'not-admitted') return [];
    let result = notAdmittedBase;
    if (courseFilter)   result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)     result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)   result = result.filter((s) => s.gender === genderFilter);
    if (categoryFilter) result = result.filter((s) => s.category === categoryFilter);
    if (categoryGroupFilter) result = result.filter((s) => CATEGORY_GROUPS[categoryGroupFilter].includes(s.category));
    if (admTypeFilter)  result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)   result = result.filter((s) => s.admCat === admCatFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.trim().toUpperCase();
      result = result.filter((s) =>
        s.studentNameSSLC.toUpperCase().includes(q) ||
        s.studentNameAadhar?.toUpperCase().includes(q) ||
        s.regNumber?.toUpperCase().includes(q) ||
        s.fatherMobile?.includes(q) ||
        s.studentMobile?.includes(q)
      );
    }
    return result;
  }, [reportType, notAdmittedBase, courseFilter, yearFilter, genderFilter, categoryFilter, categoryGroupFilter, admTypeFilter, admCatFilter, debouncedSearch]);

  const NEXT_YEAR_LABEL: Record<Year, string> = { '1ST YEAR': '2nd Year', '2ND YEAR': '3rd Year', '3RD YEAR': '' };
  const YEAR_SHORT_LABEL: Record<Year, string> = { '1ST YEAR': '1st Year', '2ND YEAR': '2nd Year', '3RD YEAR': '3rd Year' };

  // Resolves the status actually shown/filtered-on for a Not Admitted List row:
  // a manually-set tag wins, then TC-issued auto-detected from tcHistory, then
  // falls back to the existing computed Admitted/Not-Admitted tag.
  function effectiveNotAdmittedStatus(s: Student & { tcHistory?: TCRecord[] }, base?: 'ADMITTED' | 'NOT_ADMITTED'): EffectiveNotAdmittedStatus {
    if (s.notAdmittedStatusTag) return s.notAdmittedStatusTag;
    if (s.tcHistory && s.tcHistory.length > 0) return 'TC_ISSUED';
    return base ?? 'NOT_ADMITTED';
  }

  const STATUS_TAG_META: Record<EffectiveNotAdmittedStatus, { label: string; row: string; badge: string }> = {
    ADMITTED:     { label: 'Admitted',     row: 'bg-[#0FA968]/[0.05] hover:bg-[#0FA968]/[0.10]', badge: 'bg-[#0FA968]/[0.08] text-[#0B7A4D] border border-[#0FA968]/45' },
    NOT_ADMITTED: { label: 'Not Admitted', row: 'bg-[#E11D48]/[0.04] hover:bg-[#E11D48]/[0.08]', badge: 'bg-[#E11D48]/[0.08] text-[#A3153A] border border-[#E11D48]/45' },
    ANS:          { label: 'ANS',          row: 'bg-[#D97706]/[0.05] hover:bg-[#D97706]/[0.10]', badge: 'bg-[#D97706]/[0.08] text-[#9C5605] border border-[#D97706]/45' },
    LEFTOUT:      { label: 'Left Out',     row: 'bg-[#64748B]/[0.06] hover:bg-[#64748B]/[0.11]', badge: 'bg-[#64748B]/[0.10] text-[#475569] border border-[#64748B]/45' },
    TRANSFERRED:  { label: 'Transferred',  row: 'bg-[#0284C7]/[0.05] hover:bg-[#0284C7]/[0.10]', badge: 'bg-[#0284C7]/[0.08] text-[#02608F] border border-[#0284C7]/45' },
    TC_ISSUED:    { label: 'TC Issued',    row: 'bg-[#7C3AED]/[0.05] hover:bg-[#7C3AED]/[0.10]', badge: 'bg-[#7C3AED]/[0.08] text-[#5A2AAB] border border-[#7C3AED]/45' },
  };

  const notAdmittedSummary = useMemo(() => {
    if (reportType !== 'not-admitted' || !previousAcademicYear || !academicYear) return null;
    const total = notAdmittedSummaryPool.length;
    if (total === 0) return null;
    const admitted = notAdmittedSummaryPool.filter((s) => notAdmittedStatusMap.get(s.id) === 'ADMITTED').length;
    const pending = total - admitted;

    const descParts: string[] = [];
    if (yearFilter)   descParts.push(YEAR_SHORT_LABEL[yearFilter]);
    if (courseFilter) descParts.push(courseFilter);
    const desc = descParts.join(' ');

    const promoted = yearFilter ? NEXT_YEAR_LABEL[yearFilter] : '';
    const promoText = promoted
      ? `${promoted}${courseFilter ? ' ' + courseFilter : ''}`
      : 'the next year';

    return { total, admitted, pending, desc, promoText };
  }, [reportType, notAdmittedSummaryPool, notAdmittedStatusMap, previousAcademicYear, academicYear, yearFilter, courseFilter]);

  // ── Filtered data (SNQ Allotment & WhatsApp Numbers) ─────────────────────────
  const filteredStudents = useMemo(() => {
    let result = reportType === 'not-admitted'
      ? notAdmittedBase
      : reportType === 'transfer-students'
      ? allStudents.filter((s) => s.transferOut || s.transferredIn)
      : allStudents.filter(isConfirmedActive);
    if (courseFilter)   result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)     result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)   result = result.filter((s) => s.gender === genderFilter);
    if (categoryFilter) result = result.filter((s) => s.category === categoryFilter);
    if (categoryGroupFilter) result = result.filter((s) => CATEGORY_GROUPS[categoryGroupFilter].includes(s.category));
    if (admTypeFilter)  result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)   result = result.filter((s) => s.admCat === admCatFilter);
    if (reportType === 'not-admitted' && notAdmittedStatusFilter) {
      result = result.filter((s) => effectiveNotAdmittedStatus(s, notAdmittedStatusMap.get(s.id)) === notAdmittedStatusFilter);
    }
    if (reportType === 'transfer-students' && transferDirectionFilter) {
      result = result.filter((s) => (transferDirectionFilter === 'IN' ? !!s.transferredIn : !!s.transferOut));
    }
    if (dateFrom || dateTo) {
      result = result.filter((s) => {
        const paid = firstPaymentDate.get(s.id);
        if (!paid) return false;
        if (dateFrom && paid < dateFrom) return false;
        if (dateTo   && paid > dateTo)   return false;
        return true;
      });
    }
    if (debouncedSearch) {
      const q = debouncedSearch.trim().toUpperCase();
      result = result.filter((s) =>
        s.studentNameSSLC.toUpperCase().includes(q) ||
        s.studentNameAadhar?.toUpperCase().includes(q) ||
        s.regNumber?.toUpperCase().includes(q) ||
        s.fatherMobile?.includes(q) ||
        s.studentMobile?.includes(q)
      );
    }
    return reportType === 'custom' ? sortByLevels(result, sortLevels) : sortStudents(result);
  }, [allStudents, notAdmittedBase, notAdmittedStatusMap, notAdmittedStatusFilter, transferDirectionFilter, firstPaymentDate, courseFilter, yearFilter, genderFilter, categoryFilter, categoryGroupFilter, admTypeFilter, admCatFilter, dateFrom, dateTo, debouncedSearch, reportType, sortLevels]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filteredStudents, reportType]);

  const visibleStudents = useMemo(
    () => filteredStudents.slice(0, visibleCount),
    [filteredStudents, visibleCount]
  );
  const hasMore = visibleCount < filteredStudents.length;

  // ── TC Issued rows ────────────────────────────────────────────────────────────
  const tcRows = useMemo((): TcRow[] => {
    if (reportType !== 'tc-issued') return [];
    type S = Student & { tcHistory?: TCRecord[] };
    let filtered = (allStudentsForTC as S[]).filter((s) => s.tcHistory && s.tcHistory.length > 0);
    if (courseFilter)   filtered = filtered.filter((s) => s.course === courseFilter);
    if (yearFilter)     filtered = filtered.filter((s) => s.year === yearFilter);
    if (genderFilter)   filtered = filtered.filter((s) => s.gender === genderFilter);
    if (categoryFilter) filtered = filtered.filter((s) => s.category === categoryFilter);
    if (categoryGroupFilter) filtered = filtered.filter((s) => CATEGORY_GROUPS[categoryGroupFilter].includes(s.category));
    if (admTypeFilter)  filtered = filtered.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)   filtered = filtered.filter((s) => s.admCat === admCatFilter);

    const rows: TcRow[] = [];
    for (const s of filtered) {
      for (const tc of (s.tcHistory ?? [])) {
        const tcAcademicYear = tc.tcNumber.includes('/')
          ? tc.tcNumber.split('/').slice(1).join('/')
          : '';
        if (tcYearFilter !== 'ALL' && tcAcademicYear !== tcYearFilter) continue;
        rows.push({
          studentId: s.id,
          studentName: s.studentNameSSLC,
          course: s.course,
          year: s.year,
          category: s.category,
          enrollmentYear: s.academicYear,
          regNumber: s.regNumber ?? '',
          admType: s.admType,
          tcId: tc.id,
          tcNumber: tc.tcNumber,
          dateOfAdmission: tc.dateOfAdmission,
          dateOfLeaving: tc.dateOfLeaving,
          semester: tc.semester,
          lastExam: tc.lastExam,
          result: tc.result,
          isDuplicate: tc.isDuplicate,
          issuedAt: tc.issuedAt,
          tcAcademicYear,
        });
      }
    }

    const q = debouncedSearch.trim().toUpperCase();
    const result = q
      ? rows.filter((r) =>
          r.studentName.toUpperCase().includes(q) ||
          r.regNumber.toUpperCase().includes(q) ||
          r.tcNumber.toUpperCase().includes(q)
        )
      : rows;
    return result.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }, [reportType, allStudentsForTC, tcYearFilter, courseFilter, yearFilter, genderFilter, categoryFilter, categoryGroupFilter, admTypeFilter, admCatFilter, debouncedSearch]);

  // ── TC preview HTML — reconstructed from the issued record for a read-only view ──
  // Dues/concession/character aren't persisted in TCRecord, so the preview falls back
  // to the same defaults used when a TC is first issued.
  const tcPreviewHtml = useMemo(() => {
    if (!tcPreviewRow) return '';
    const student = allStudentsForTC.find((s) => s.id === tcPreviewRow.studentId);
    if (!student) return '';
    const data: TCFormData = {
      tcNumber:        tcPreviewRow.tcNumber,
      dateOfAdmission: tcPreviewRow.dateOfAdmission,
      dateOfLeaving:   tcPreviewRow.dateOfLeaving,
      semester:        tcPreviewRow.semester,
      lastExam:        tcPreviewRow.lastExam,
      result:          tcPreviewRow.result,
      duesPaid:        true,
      concession:      false,
      character:       'SATISFACTORY',
      isDuplicate:     tcPreviewRow.isDuplicate,
    };
    return buildTCHTML(student, data);
  }, [tcPreviewRow, allStudentsForTC]);

  // ── TC stats (unfiltered counts for header chips) ─────────────────────────────
  const tcStats = useMemo(() => {
    if (reportType !== 'tc-issued') return null;
    type S = Student & { tcHistory?: TCRecord[] };
    const withTC = (allStudentsForTC as S[]).filter((s) => s.tcHistory && s.tcHistory.length > 0);
    const totalTCs = withTC.reduce((sum, s) => sum + (s.tcHistory?.length ?? 0), 0);
    const byCourse: Record<string, number> = {};
    for (const s of withTC) {
      byCourse[s.course] = (byCourse[s.course] ?? 0) + (s.tcHistory?.length ?? 0);
    }
    return { totalTCs, byCourse };
  }, [reportType, allStudentsForTC]);

  // ── PC Issued rows ────────────────────────────────────────────────────────────
  const pcRows = useMemo((): PcRow[] => {
    if (reportType !== 'pc-issued') return [];
    type S = Student & { pcHistory?: PCRecord[] };
    let filtered = (allStudentsForTC as S[]).filter((s) => s.pcHistory && s.pcHistory.length > 0);
    if (courseFilter)   filtered = filtered.filter((s) => s.course === courseFilter);
    if (yearFilter)     filtered = filtered.filter((s) => s.year === yearFilter);
    if (genderFilter)   filtered = filtered.filter((s) => s.gender === genderFilter);
    if (categoryFilter) filtered = filtered.filter((s) => s.category === categoryFilter);
    if (categoryGroupFilter) filtered = filtered.filter((s) => CATEGORY_GROUPS[categoryGroupFilter].includes(s.category));
    if (admTypeFilter)  filtered = filtered.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)   filtered = filtered.filter((s) => s.admCat === admCatFilter);

    const rows: PcRow[] = [];
    for (const s of filtered) {
      for (const pc of (s.pcHistory ?? [])) {
        const pcAcademicYear = academicYearFromDate(pc.issuedAt);
        if (pcYearFilter !== 'ALL' && pcAcademicYear !== pcYearFilter) continue;
        rows.push({
          studentId: s.id,
          studentName: s.studentNameSSLC,
          course: s.course,
          year: s.year,
          category: s.category,
          enrollmentYear: s.academicYear,
          regNumber: s.regNumber ?? '',
          admType: s.admType,
          pcId: pc.id,
          examPeriod: pc.examPeriod,
          resultClass: pc.resultClass,
          dateOfIssue: pc.dateOfIssue,
          isDuplicate: pc.isDuplicate,
          issuedAt: pc.issuedAt,
          pcAcademicYear,
        });
      }
    }

    const q = debouncedSearch.trim().toUpperCase();
    const result = q
      ? rows.filter((r) =>
          r.studentName.toUpperCase().includes(q) ||
          r.regNumber.toUpperCase().includes(q) ||
          r.examPeriod.toUpperCase().includes(q)
        )
      : rows;
    return result.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }, [reportType, allStudentsForTC, pcYearFilter, courseFilter, yearFilter, genderFilter, categoryFilter, categoryGroupFilter, admTypeFilter, admCatFilter, debouncedSearch]);

  // ── PC stats (unfiltered counts for header chips) ─────────────────────────────
  const pcStats = useMemo(() => {
    if (reportType !== 'pc-issued') return null;
    type S = Student & { pcHistory?: PCRecord[] };
    const withPC = (allStudentsForTC as S[]).filter((s) => s.pcHistory && s.pcHistory.length > 0);
    const totalPCs = withPC.reduce((sum, s) => sum + (s.pcHistory?.length ?? 0), 0);
    const byCourse: Record<string, number> = {};
    for (const s of withPC) {
      byCourse[s.course] = (byCourse[s.course] ?? 0) + (s.pcHistory?.length ?? 0);
    }
    return { totalPCs, byCourse };
  }, [reportType, allStudentsForTC]);

  // ── Refund Students List rows ─────────────────────────────────────────────────
  const refundRows = useMemo((): RefundRecord[] => {
    if (reportType !== 'refund-students') return [];
    let filtered = allRefunds;
    if (courseFilter)         filtered = filtered.filter((r) => r.course === courseFilter);
    if (yearFilter)           filtered = filtered.filter((r) => r.year === yearFilter);
    if (refundYearFilter !== 'ALL') filtered = filtered.filter((r) => r.academicYear === refundYearFilter);
    if (refundCategoryFilter) filtered = filtered.filter((r) => (r.refundCategory ?? 'SNQ') === refundCategoryFilter);

    const q = debouncedSearch.trim().toUpperCase();
    const result = q
      ? filtered.filter((r) =>
          r.studentName.toUpperCase().includes(q) ||
          r.regNumber.toUpperCase().includes(q) ||
          r.referenceNumber.toUpperCase().includes(q)
        )
      : filtered;
    return [...result].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }, [reportType, allRefunds, courseFilter, yearFilter, refundYearFilter, refundCategoryFilter, debouncedSearch]);

  // ── Refund stats (unfiltered counts/total for header chips) ──────────────────
  const refundStats = useMemo(() => {
    if (reportType !== 'refund-students') return null;
    const totalRefunds = allRefunds.length;
    const totalAmount = allRefunds.reduce((sum, r) => sum + r.refundAmount, 0);
    const byCourse: Record<string, number> = {};
    for (const r of allRefunds) {
      byCourse[r.course] = (byCourse[r.course] ?? 0) + 1;
    }
    return { totalRefunds, totalAmount, byCourse };
  }, [reportType, allRefunds]);

  const hasActiveSort = sortLevels.some((l) => !!l.field);

  // Collapsible filter row (UI only). The badge on the toggle counts active
  // filters that live in the collapsed row, so they are never silently hidden.
  const [showFilters, setShowFilters] = useState(false);
  const hiddenFilterCount = [
    courseFilter, yearFilter,
    reportType !== 'refund-students' && genderFilter,
    reportType !== 'refund-students' && categoryFilter,
    reportType !== 'refund-students' && categoryGroupFilter,
    reportType !== 'refund-students' && admTypeFilter,
    reportType !== 'refund-students' && admCatFilter,
    reportType === 'not-admitted' && notAdmittedStatusFilter,
    reportType === 'transfer-students' && transferDirectionFilter,
    reportType === 'snq-allotment' && (dateFrom || dateTo),
    reportType === 'custom' && hasActiveSort,
  ].filter(Boolean).length;

  const hasActiveFilters =
    !!searchTerm || !!courseFilter || !!yearFilter || !!genderFilter ||
    !!categoryFilter || !!categoryGroupFilter || !!admTypeFilter || !!admCatFilter || !!dateFrom || !!dateTo ||
    (reportType === 'tc-issued' && tcYearFilter !== 'ALL') ||
    (reportType === 'pc-issued' && pcYearFilter !== 'ALL') ||
    (reportType === 'not-admitted' && !!notAdmittedStatusFilter) ||
    (reportType === 'transfer-students' && !!transferDirectionFilter) ||
    (reportType === 'refund-students' && (refundYearFilter !== 'ALL' || !!refundCategoryFilter)) ||
    (reportType === 'custom' && hasActiveSort);

  function clearFilters() {
    setSearchTerm(''); setDebouncedSearch('');
    setCourseFilter(''); setYearFilter('');
    setGenderFilter(''); setCategoryFilter('');
    setCategoryGroupFilter('');
    setAdmTypeFilter(''); setAdmCatFilter('');
    setDateFrom(''); setDateTo('');
    setTcYearFilter('ALL');
    setPcYearFilter('ALL');
    setNotAdmittedStatusFilter('');
    setTransferDirectionFilter('');
    setRefundYearFilter('ALL');
    setRefundCategoryFilter('');
    setSortLevels([
      { field: '', direction: 'asc' },
      { field: '', direction: 'asc' },
      { field: '', direction: 'asc' },
    ]);
  }

  // ── Stats (SNQ Allotment & WhatsApp Numbers) ──────────────────────────────────
  const stats = useMemo(() => {
    const confirmed = allStudents.filter(isConfirmedActive);
    const byYear: Record<string, number> = {};
    const byCourse: Record<string, number> = {};
    for (const s of confirmed) {
      byYear[s.year]     = (byYear[s.year] ?? 0) + 1;
      byCourse[s.course] = (byCourse[s.course] ?? 0) + 1;
    }
    return { byYear, byCourse, total: confirmed.length };
  }, [allStudents]);

  // ── Export: PDF ───────────────────────────────────────────────────────────────
  function handleExportPdf() {
    const categoryGroupLabel = categoryGroupFilter ? CATEGORY_GROUP_LABELS[categoryGroupFilter] : '';
    setSavingPdf(true);
    setTimeout(() => {
      try {
        if (reportType === 'snq-allotment') {
          exportStudentReportPdf(filteredStudents, {
            academicYear,
            courseFilter,
            yearFilter,
            genderFilter,
            categoryFilter,
            categoryGroupFilter: categoryGroupLabel,
            admTypeFilter,
            admCatFilter,
            searchTerm: debouncedSearch,
            dateFrom,
            dateTo,
          });
        } else if (reportType === 'whatsapp-numbers') {
          exportWhatsappPdf(filteredStudents, {
            academicYear,
            courseFilter,
            yearFilter,
            admTypeFilter,
            admCatFilter,
            searchTerm: debouncedSearch,
          });
        } else if (reportType === 'tc-issued') {
          exportTcIssuedPdf(tcRows, {
            tcYearFilter,
            courseFilter,
            yearFilter,
            genderFilter,
            categoryFilter,
            categoryGroupFilter: categoryGroupLabel,
            admTypeFilter,
            admCatFilter,
            searchTerm: debouncedSearch,
          });
        } else if (reportType === 'pc-issued') {
          exportPcIssuedPdf(pcRows, {
            pcYearFilter,
            courseFilter,
            yearFilter,
            genderFilter,
            categoryFilter,
            categoryGroupFilter: categoryGroupLabel,
            admTypeFilter,
            admCatFilter,
            searchTerm: debouncedSearch,
          });
        } else if (reportType === 'student-list') {
          const filters: StudentsPdfFilters = {
            academicYear,
            courseFilter,
            yearFilter,
            genderFilter,
            admTypeFilter,
            admCatFilter,
            admStatusFilter: 'CONFIRMED',
            searchTerm: debouncedSearch,
          };
          exportStudentsPdf(filteredStudents, filters);
        } else if (reportType === 'allotted-category') {
          exportAllottedCategoryPdf(filteredStudents, {
            academicYear,
            courseFilter,
            yearFilter,
            admTypeFilter,
            admCatFilter,
            searchTerm: debouncedSearch,
          });
        } else if (reportType === 'not-admitted') {
          exportNotAdmittedPdf(
            filteredStudents.map((s) => ({
              student: s,
              status: notAdmittedStatusMap.get(s.id) ?? 'NOT_ADMITTED',
              currentYear: notAdmittedCurrentYearMap.get(s.id) ?? null,
            })),
            {
              currentAcademicYear: academicYear,
              previousAcademicYear,
              courseFilter,
              categoryFilter,
              admTypeFilter,
              admCatFilter,
              // notAdmittedPdf.ts only models the original ADMITTED/NOT_ADMITTED tag —
              // new status tags (ANS/LEFTOUT/TRANSFERRED/TC_ISSUED) aren't representable
              // there, so fall back to no filter chip rather than widening that util.
              statusFilter: (notAdmittedStatusFilter === 'ADMITTED' || notAdmittedStatusFilter === 'NOT_ADMITTED')
                ? notAdmittedStatusFilter
                : '',
              searchTerm: debouncedSearch,
            }
          );
        } else if (reportType === 'transfer-students') {
          exportTransferStudentsPdf(filteredStudents, {
            academicYear,
            courseFilter,
            yearFilter,
            admTypeFilter,
            directionFilter: transferDirectionFilter,
            searchTerm: debouncedSearch,
          });
        } else if (reportType === 'refund-students') {
          exportRefundStudentsPdf(refundRows, {
            refundYearFilter,
            refundCategoryFilter,
            courseFilter,
            yearFilter,
            searchTerm: debouncedSearch,
          });
        } else if (reportType === 'custom') {
          exportCustomStudentReportPdf(filteredStudents, orderedCustomColumns, {
            academicYear,
            courseFilter,
            yearFilter,
            genderFilter,
            categoryFilter,
            categoryGroupFilter: categoryGroupLabel,
            admTypeFilter,
            admCatFilter,
            searchTerm: debouncedSearch,
            sortDescription,
          });
        }
      } finally {
        setSavingPdf(false);
      }
    }, 0);
  }

  // ── Export: Excel ─────────────────────────────────────────────────────────────
  function handleExportExcel() {
    setSavingExcel(true);
    setTimeout(() => {
      try {
        if (reportType === 'snq-allotment') {
          const headers = [
            'Sl No', 'Name (SSLC)', 'Father Name', 'Gender', 'Category',
            'Course', 'Year', 'Adm Type', 'Adm Cat',
            'Student Mobile', 'Father Mobile',
            'SSLC Max', 'SSLC Total',
            'Maths Max', 'Maths Obtained',
            'Science Max', 'Science Obtained',
            'M+S Max', 'M+S Obtained',
            'Annual Income', 'Reg No', 'Merit No', 'Enrollment Date', 'Remarks',
          ];
          const rows = filteredStudents.map((s, i) => [
            i + 1,
            s.studentNameSSLC,
            s.fatherName,
            s.gender === 'BOY' ? 'B' : 'G',
            s.category || '',
            s.course,
            s.year,
            s.admType || '',
            s.admCat || '',
            s.studentMobile || '',
            s.fatherMobile || '',
            s.sslcMaxTotal ?? '',
            s.sslcObtainedTotal ?? '',
            s.mathsMax ?? '',
            s.mathsObtained ?? '',
            s.scienceMax ?? '',
            s.scienceObtained ?? '',
            s.mathsScienceMaxTotal ?? '',
            s.mathsScienceObtainedTotal ?? '',
            s.annualIncome ?? '',
            s.regNumber || '',
            s.meritNumber || '',
            s.enrollmentDate || '',
            '',
          ]);
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws['!cols'] = [
            { wch: 6 }, { wch: 26 }, { wch: 22 }, { wch: 7 }, { wch: 8 },
            { wch: 7 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
            { wch: 14 }, { wch: 14 },
            { wch: 10 }, { wch: 10 },
            { wch: 10 }, { wch: 12 },
            { wch: 11 }, { wch: 14 },
            { wch: 9 },  { wch: 12 },
            { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
          ];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Student Report');
          const parts = ['student_report'];
          if (academicYear)   parts.push(academicYear.replace(/[^0-9-]/g, ''));
          if (courseFilter)   parts.push(courseFilter);
          if (yearFilter)     parts.push(yearFilter.replace(/\s+/g, ''));
          XLSX.writeFile(wb, parts.join('_') + '.xlsx');
        } else if (reportType === 'whatsapp-numbers') {
          const headers = ['Sl No', 'Student Name', 'Year', 'Course', 'Father Mobile', 'Student Mobile'];
          const rows = filteredStudents.map((s, i) => [
            i + 1,
            s.studentNameSSLC,
            s.year,
            s.course,
            s.fatherMobile || '',
            s.studentMobile || '',
          ]);
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Whatsapp Numbers');
          const parts = ['whatsapp_numbers'];
          if (academicYear)   parts.push(academicYear.replace(/[^0-9-]/g, ''));
          if (courseFilter)   parts.push(courseFilter);
          if (yearFilter)     parts.push(yearFilter.replace(/\s+/g, ''));
          XLSX.writeFile(wb, parts.join('_') + '.xlsx');
        } else if (reportType === 'allotted-category') {
          const headers = ['Sl No', 'Student Name', 'Year', 'Course', 'Reg No', 'Category', 'Adm Cat', 'Allotted Category', 'Adm Type', 'Student Mobile', 'Father Mobile'];
          const rows = filteredStudents.map((s, i) => [
            i + 1,
            s.studentNameSSLC,
            s.year,
            s.course,
            s.regNumber || '',
            s.category || '',
            s.admCat || '',
            s.allottedCategory || '',
            s.admType || '',
            s.studentMobile || '',
            s.fatherMobile || '',
          ]);
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Allotted Category');
          const parts = ['allotted_category'];
          if (academicYear)   parts.push(academicYear.replace(/[^0-9-]/g, ''));
          if (courseFilter)   parts.push(courseFilter);
          if (yearFilter)     parts.push(yearFilter.replace(/\s+/g, ''));
          XLSX.writeFile(wb, parts.join('_') + '.xlsx');
        } else if (reportType === 'not-admitted') {
          const headers = ['Sl No', 'Student Name', 'Reg No', 'Previous Year', 'Current Year', 'Course', 'Cat', 'Adm Type', 'Adm Cat', 'Mobile No', 'Status'];
          const rows = filteredStudents.map((s, i) => [
            i + 1,
            s.studentNameSSLC,
            s.regNumber || '',
            s.year,
            notAdmittedCurrentYearMap.get(s.id) || '',
            s.course,
            s.category || '',
            s.admType || '',
            s.admCat || '',
            s.studentMobile || s.fatherMobile || '',
            notAdmittedStatusMap.get(s.id) === 'ADMITTED' ? 'Admitted' : 'Not Admitted',
          ]);
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Not Admitted');
          const parts = ['not_admitted'];
          if (previousAcademicYear) parts.push(previousAcademicYear.replace(/[^0-9-]/g, ''));
          if (academicYear)         parts.push(academicYear.replace(/[^0-9-]/g, ''));
          if (courseFilter)         parts.push(courseFilter);
          XLSX.writeFile(wb, parts.join('_') + '.xlsx');
        } else if (reportType === 'transfer-students') {
          const headers = ['Sl No', 'Student Name', 'Reg No', 'Year', 'Course', 'Cat', 'Adm Type', 'Mobile No', 'Direction', 'Polytechnic', 'Date'];
          const rows = filteredStudents.map((s, i) => [
            i + 1,
            s.studentNameSSLC,
            s.regNumber || '',
            s.year,
            s.course,
            s.category || '',
            s.admType || '',
            s.studentMobile || s.fatherMobile || '',
            s.transferOut ? 'Transfer Out' : 'Transfer In',
            (s.transferOut ? s.transferOutPolytechnic : s.transferInPolytechnic) || '',
            (s.transferOut ? s.transferOutDate : s.enrollmentDate) || '',
          ]);
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 14 }];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Transfer Students');
          const parts = ['transfer_students'];
          if (academicYear) parts.push(academicYear.replace(/[^0-9-]/g, ''));
          if (courseFilter) parts.push(courseFilter);
          XLSX.writeFile(wb, parts.join('_') + '.xlsx');
        } else if (reportType === 'refund-students') {
          const headers = [
            'Sl No', 'Student Name', 'Father Name', 'Course', 'Year', 'Reg No',
            'Category', 'Total Paid', 'Refund Amount', 'Payment Type', 'Reference No',
            'Payment Date', 'Academic Year', 'Remarks', 'Issued By', 'Issued Date',
          ];
          const rows = refundRows.map((r, i) => [
            i + 1,
            r.studentName,
            r.fatherName,
            r.course,
            r.year,
            r.regNumber,
            r.refundCategory ?? 'SNQ',
            r.totalPaid,
            r.refundAmount,
            r.paymentType,
            r.referenceNumber,
            r.paymentDate,
            r.academicYear,
            r.remarks,
            r.issuedBy,
            r.issuedAt ? new Date(r.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
          ]);
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws['!cols'] = [
            { wch: 6 }, { wch: 26 }, { wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 14 },
            { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 16 },
            { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 16 },
          ];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Refund Students');
          const parts = ['refund_students'];
          if (refundYearFilter !== 'ALL') parts.push(refundYearFilter.replace(/[^0-9-]/g, ''));
          if (courseFilter)               parts.push(courseFilter);
          XLSX.writeFile(wb, parts.join('_') + '.xlsx');
        } else if (reportType === 'student-list') {
          const headers = [
            '#', 'Name (SSLC)', 'Name (Aadhar)', 'Father Name', 'Mother Name',
            'Date of Birth', 'Gender', 'Religion', 'Caste', 'Category',
            'Course', 'Year', 'Adm Type', 'Adm Cat', 'Reg No',
            'Student Mobile', 'Father Mobile',
            'Address', 'Town', 'Taluk', 'District',
            'SSLC Max', 'SSLC Obtained',
            'Maths Max', 'Maths Obtained', 'Science Max', 'Science Obtained',
            'M+S Max', 'M+S Obtained',
            'PUC %', 'ITI %', 'Annual Income',
            'Merit No', 'Enrollment Date', 'Admission Status', 'Academic Year',
          ];
          const rows = filteredStudents.map((s, i) => [
            i + 1,
            s.studentNameSSLC,
            s.studentNameAadhar,
            s.fatherName,
            s.motherName,
            s.dateOfBirth,
            s.gender,
            s.religion,
            s.caste,
            s.category,
            s.course,
            s.year,
            s.admType,
            s.admCat,
            s.regNumber || '',
            s.studentMobile || '',
            s.fatherMobile || '',
            s.address,
            s.town,
            s.taluk,
            s.district,
            s.sslcMaxTotal,
            s.sslcObtainedTotal,
            s.mathsMax,
            s.mathsObtained,
            s.scienceMax,
            s.scienceObtained,
            s.mathsScienceMaxTotal,
            s.mathsScienceObtainedTotal,
            s.pucPercentage,
            s.itiPercentage,
            s.annualIncome,
            s.meritNumber || '',
            s.enrollmentDate,
            s.admissionStatus,
            s.academicYear,
          ]);
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Students');
          const parts = ['student_list'];
          if (academicYear) parts.push(academicYear.replace(/[^0-9-]/g, ''));
          if (courseFilter) parts.push(courseFilter);
          if (yearFilter)   parts.push(yearFilter.replace(/\s+/g, ''));
          XLSX.writeFile(wb, parts.join('_') + '.xlsx');
        } else if (reportType === 'tc-issued') {
          const headers = [
            'Sl No', 'Student Name', 'Course', 'Year', 'Category', 'Adm Type', 'Enrollment Year',
            'Reg No', 'TC Number', 'Date of Admission', 'Date of Leaving',
            'Semester', 'Last Exam', 'Result', 'Duplicate', 'Issued Date',
          ];
          const rows = tcRows.map((r, i) => [
            i + 1,
            r.studentName,
            r.course,
            r.year,
            r.category,
            r.admType,
            r.enrollmentYear,
            r.regNumber,
            r.tcNumber,
            r.dateOfAdmission,
            r.dateOfLeaving,
            r.semester,
            r.lastExam,
            r.result,
            r.isDuplicate ? 'Yes' : 'No',
            r.issuedAt ? new Date(r.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
          ]);
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws['!cols'] = [
            { wch: 6 }, { wch: 26 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 14 },
            { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
            { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 16 },
          ];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'TC Issued');
          const parts = ['tc_issued'];
          if (tcYearFilter !== 'ALL') parts.push(tcYearFilter.replace(/[^0-9-]/g, ''));
          if (courseFilter)           parts.push(courseFilter);
          if (yearFilter)             parts.push(yearFilter.replace(/\s+/g, ''));
          XLSX.writeFile(wb, parts.join('_') + '.xlsx');
        } else if (reportType === 'pc-issued') {
          const headers = [
            'Sl No', 'Student Name', 'Course', 'Year', 'Category', 'Adm Type', 'Enrollment Year',
            'Reg No', 'Exam Period', 'Result Class', 'Date of Issue', 'Duplicate', 'Issued Date',
          ];
          const rows = pcRows.map((r, i) => [
            i + 1,
            r.studentName,
            r.course,
            r.year,
            r.category,
            r.admType,
            r.enrollmentYear,
            r.regNumber,
            r.examPeriod,
            r.resultClass,
            r.dateOfIssue,
            r.isDuplicate ? 'Yes' : 'No',
            r.issuedAt ? new Date(r.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
          ]);
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws['!cols'] = [
            { wch: 6 }, { wch: 26 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 },
            { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 16 },
          ];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'PC Issued');
          const parts = ['pc_issued'];
          if (pcYearFilter !== 'ALL') parts.push(pcYearFilter.replace(/[^0-9-]/g, ''));
          if (courseFilter)           parts.push(courseFilter);
          if (yearFilter)             parts.push(yearFilter.replace(/\s+/g, ''));
          XLSX.writeFile(wb, parts.join('_') + '.xlsx');
        } else if (reportType === 'custom') {
          const headers = orderedCustomColumns.map((c) => c.label);
          const rows = filteredStudents.map((s, i) =>
            orderedCustomColumns.map((c) => formatColumnValue(c, s, i))
          );
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws['!cols'] = orderedCustomColumns.map((c) => ({ wch: c.key === 'slNo' ? 6 : 16 }));
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Custom Report');
          const parts = ['custom_student_report'];
          if (academicYear)   parts.push(academicYear.replace(/[^0-9-]/g, ''));
          if (courseFilter)   parts.push(courseFilter);
          if (yearFilter)     parts.push(yearFilter.replace(/\s+/g, ''));
          XLSX.writeFile(wb, parts.join('_') + '.xlsx');
        }
      } finally {
        setSavingExcel(false);
      }
    }, 0);
  }

  async function handleTcClearFromModal() {
    if (!tcClearModal) return;
    if (tcClearPasskey !== CERT_CLEAR_PASSKEY) {
      setTcClearPasskeyError('Incorrect passkey. Please try again.');
      return;
    }
    setTcClearPasskeyError('');
    setTcClearModalClearing(true);
    try {
      type S = Student & { tcHistory?: TCRecord[] };
      const fullStudent = (allStudentsForTC as S[]).find((s) => s.id === tcClearModal.studentId);
      await clearTcHistory(tcClearModal.studentId, fullStudent?.tcHistory ?? []);
      setTcClearModalMsg(`TC history cleared for ${tcClearModal.studentName}.`);
      setTcClearModal(null);
      setTcClearPasskey('');
    } finally {
      setTcClearModalClearing(false);
    }
  }

  async function handlePcClearFromModal() {
    if (!pcClearModal) return;
    if (pcClearPasskey !== CERT_CLEAR_PASSKEY) {
      setPcClearPasskeyError('Incorrect passkey. Please try again.');
      return;
    }
    setPcClearPasskeyError('');
    setPcClearModalClearing(true);
    try {
      await clearPcHistory(pcClearModal.studentId);
      setPcClearModalMsg(`PC history cleared for ${pcClearModal.studentName}.`);
      setPcClearModal(null);
      setPcClearPasskey('');
    } finally {
      setPcClearModalClearing(false);
    }
  }

  const isLoading = settingsLoading || loading || feeLoading || ((reportType === 'tc-issued' || reportType === 'pc-issued') && tcLoading) || (reportType === 'not-admitted' && prevYearLoading) || (reportType === 'refund-students' && refundsLoading);

  // Header chip strip: single line between two always-visible arrow buttons;
  // each arrow dims when there is nothing more to see on its side.
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const [chipOverflow, setChipOverflow] = useState({ left: false, right: false });
  useLayoutEffect(() => {
    const el = chipScrollRef.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setChipOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [isLoading, reportType, hasActiveFilters]);

  // Animated by hand rather than scrollBy({ behavior: 'smooth' }), which some
  // browser setups ignore.
  const chipAnimRef = useRef(0);
  function scrollChips(dir: -1 | 1) {
    const el = chipScrollRef.current;
    if (!el) return;
    cancelAnimationFrame(chipAnimRef.current);
    const from = el.scrollLeft;
    const to = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, from + dir * Math.max(160, el.clientWidth * 0.6)));
    const start = performance.now();
    const DURATION = 260;
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / DURATION));
      el.scrollLeft = from + (to - from) * (1 - Math.pow(1 - t, 3));
      if (t < 1) chipAnimRef.current = requestAnimationFrame(step);
    };
    chipAnimRef.current = requestAnimationFrame(step);
  }

  if (isLoading) return <PageSpinner />;

  const activeCount = reportType === 'tc-issued' ? tcRows.length
    : reportType === 'pc-issued' ? pcRows.length
    : reportType === 'refund-students' ? refundRows.length
    : filteredStudents.length;

  const tint = REPORT_TINT[reportType];

  // Header subtitle — same conditions as before, now shown as a pill.
  const subtitle =
    reportType === 'tc-issued' || reportType === 'pc-issued' || reportType === 'refund-students'
      ? 'All Academic Years'
      : reportType === 'not-admitted'
      ? (previousAcademicYear && academicYear ? `${previousAcademicYear} → ${academicYear}` : 'No previous academic year')
      : academicYear;

  // Header count chips — one data shape for the five per-report chip sets.
  type HeaderStats = {
    label: string;
    total: number;
    amount?: number;
    byYear?: Partial<Record<string, number>>;
    byCourse: Partial<Record<string, number>>;
    filtered: number;
  };
  let headerStats: HeaderStats | null = null;
  if (reportType === 'tc-issued') {
    if (tcStats && tcStats.totalTCs > 0) headerStats = { label: 'TCs Issued', total: tcStats.totalTCs, byCourse: tcStats.byCourse, filtered: tcRows.length };
  } else if (reportType === 'pc-issued') {
    if (pcStats && pcStats.totalPCs > 0) headerStats = { label: 'PCs Issued', total: pcStats.totalPCs, byCourse: pcStats.byCourse, filtered: pcRows.length };
  } else if (reportType === 'refund-students') {
    if (refundStats && refundStats.totalRefunds > 0) headerStats = { label: 'Refunds', total: refundStats.totalRefunds, amount: refundStats.totalAmount, byCourse: refundStats.byCourse, filtered: refundRows.length };
  } else if (reportType === 'not-admitted') {
    if (notAdmittedStats.total > 0) headerStats = { label: 'Total', total: notAdmittedStats.total, byYear: notAdmittedStats.byYear, byCourse: notAdmittedStats.byCourse, filtered: notAdmittedSummaryPool.length };
  } else if (stats.total > 0) {
    headerStats = { label: 'Total', total: stats.total, byYear: stats.byYear, byCourse: stats.byCourse, filtered: filteredStudents.length };
  }

  const hs = headerStats;

  const showingStudents = (
    <span>
      Showing <span className="text-[#262B35] tabular-nums">{Math.min(visibleCount, filteredStudents.length)}</span> of{' '}
      <span className="text-[#262B35] tabular-nums">{filteredStudents.length}</span> student{filteredStudents.length !== 1 ? 's' : ''}
      {hasActiveFilters && stats.total > 0 && filteredStudents.length < stats.total && (
        <span> (filtered from {stats.total} total)</span>
      )}
    </span>
  );

  return (
    <>
    <div
      className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{ background: 'linear-gradient(160deg, #F7F7FE 0%, #FCFCFF 45%, #F3F4FE 100%)', animation: 'page-enter 0.22s ease-out' }}
    >

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-4 min-w-0">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A8FA8] leading-none">
            SMP Admissions · Reports
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <h2 className="text-[22px] font-bold text-[#3730A3] leading-none tracking-[-0.3px]">Student Reports</h2>
            {subtitle && (
              <span className="rounded-full border border-[#4F46E5]/40 bg-white text-[#3730A3] px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums whitespace-nowrap">
                {subtitle}
              </span>
            )}
          </div>
        </div>

        {hs && (
          <>
            <span className="w-px h-8 bg-[#DCDDFB] shrink-0 self-center" />
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {/* Total tile — in the report's tint */}
              <div
                className="shrink-0 flex flex-col items-center justify-center rounded-[10px] border px-3.5 py-1 min-w-[58px]"
                style={{ background: `${tint}12`, borderColor: `${tint}33` }}
              >
                <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] leading-tight whitespace-nowrap" style={{ color: inkOf(tint) }}>{hs.label}</span>
                <span className="text-[16px] font-medium leading-tight" style={{ color: inkOf(tint) }}>
                  <AnimNum value={hs.total} />
                </span>
              </div>

              {hs.amount !== undefined && (
                <div
                  className="shrink-0 flex flex-col items-center justify-center rounded-[10px] border px-3.5 py-1"
                  style={{ background: `${tint}0D`, borderColor: `${tint}33` }}
                >
                  <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] leading-tight whitespace-nowrap" style={{ color: inkOf(tint) }}>Total Amount</span>
                  <span className="text-[16px] font-medium leading-tight tabular-nums whitespace-nowrap" style={{ color: inkOf(tint) }}>
                    ₹{hs.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {hasActiveFilters && (
                <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#4F46E5]/40 bg-white text-[#3730A3] px-3 py-[6px] text-[11px] font-medium whitespace-nowrap">
                  <span>Filtered</span>
                  <AnimNum value={hs.filtered} />
                </div>
              )}

              <button type="button" onClick={() => scrollChips(-1)} disabled={!chipOverflow.left} className={`${CHIP_ARROW} ml-1`} aria-label="Scroll chips left">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div ref={chipScrollRef} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1 py-1">
                {hs.byYear && (
                  <>
                    {YEARS.map((yr) => {
                      const count = hs.byYear?.[yr] ?? 0;
                      const label = yr === '1ST YEAR' ? '1st Yr' : yr === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
                      const active = yearFilter === yr;
                      const dimmed = (!!yearFilter && !active) || count === 0;
                      return (
                        <button
                          key={yr}
                          onClick={() => setYearFilter(active ? '' : yr)}
                          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${
                            dimmed && !active ? 'opacity-[0.5] hover:opacity-100' : ''
                          }`}
                          style={chipStyle(YEAR_COLOR[yr], active)}
                        >
                          {!active && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: YEAR_COLOR[yr] }} />}
                          <span>{label}</span>
                          <AnimNum value={count} />
                        </button>
                      );
                    })}
                    <span className="w-1 h-1 rounded-full bg-[#C9CBF6] shrink-0 mx-0.5" />
                  </>
                )}
                {COURSES.map((c) => {
                  const count = hs.byCourse[c] ?? 0;
                  const active = courseFilter === c;
                  const dimmed = (!!courseFilter && !active) || count === 0;
                  return (
                    <button
                      key={c}
                      onClick={() => setCourseFilter(active ? '' : c)}
                      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${
                        dimmed && !active ? 'opacity-[0.5] hover:opacity-100' : ''
                      }`}
                      style={chipStyle(DEPT_DOT[c], active)}
                    >
                      {!active && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DEPT_DOT[c] }} />}
                      <span>{c}</span>
                      <AnimNum value={count} />
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => scrollChips(1)} disabled={!chipOverflow.right} className={CHIP_ARROW} aria-label="Scroll chips right">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Not Admitted summary — updates live with the active filters ─────── */}
      {reportType === 'not-admitted' && notAdmittedSummary && (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 rounded-2xl border border-[#DCDDFB] bg-white px-3.5 py-2.5 text-[12px] font-medium leading-snug text-[#5B6371]">
          <LinePill value={`${notAdmittedSummary.admitted} Admitted`} color={MINT} />
          <LinePill value={`${notAdmittedSummary.pending} Not Admitted`} color={CORAL} />
          <span>
            <span className="font-semibold" style={{ color: inkOf(MINT) }}>{notAdmittedSummary.admitted}</span> of{' '}
            <span className="font-semibold text-[#262B35]">{notAdmittedSummary.total}</span>{' '}
            {notAdmittedSummary.desc && <>{notAdmittedSummary.desc} </>}
            students from <span className="font-semibold text-[#3730A3]">{previousAcademicYear} (Last Year)</span> have admitted to{' '}
            <span className="font-semibold text-[#3730A3]">{notAdmittedSummary.promoText}</span> in{' '}
            <span className="font-semibold text-[#3730A3]">{academicYear} (Current Year)</span> —{' '}
            <span className="font-semibold" style={{ color: inkOf(CORAL) }}>{notAdmittedSummary.pending}</span> still pending.
          </span>
        </div>
      )}

      {/* ── Toolbar card — report selector, search, filters, exports ───────── */}
      <div className="flex-shrink-0 rounded-2xl border border-[#DCDDFB] bg-white overflow-hidden transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(30,27,75,0.05)]">
        <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">

          {/* Report type selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={FIELD_LABEL}>Report</span>
            <FilterDropdown<ReportType>
              color="indigo"
              value={reportType}
              onChange={(v) => setReportType(v as ReportType)}
              placeholder="Report"
              hideClear
              options={REPORT_OPTIONS}
            />
          </div>

          {TOOLBAR_SEP}

          {/* TC Year filter — only for TC Issued List */}
          {reportType === 'tc-issued' && (
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={FIELD_LABEL}>TC Year</span>
                <FilterDropdown<string>
                  value={tcYearFilter}
                  onChange={(v) => setTcYearFilter(v || 'ALL')}
                  placeholder="TC Year"
                  hideClear
                  color="blue"
                  options={[
                    { value: 'ALL', label: 'All Academic Years' },
                    ...[...ACADEMIC_YEARS].reverse().map((yr) => ({ value: yr, label: yr })),
                  ]}
                />
              </div>
              {TOOLBAR_SEP}
            </>
          )}

          {/* PC Year filter — only for PC Issued List */}
          {reportType === 'pc-issued' && (
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={FIELD_LABEL}>PC Year</span>
                <FilterDropdown<string>
                  value={pcYearFilter}
                  onChange={(v) => setPcYearFilter(v || 'ALL')}
                  placeholder="PC Year"
                  hideClear
                  color="violet"
                  options={[
                    { value: 'ALL', label: 'All Academic Years' },
                    ...[...ACADEMIC_YEARS].reverse().map((yr) => ({ value: yr, label: yr })),
                  ]}
                />
              </div>
              {TOOLBAR_SEP}
            </>
          )}

          {/* Refund Year + Category filters — only for Refund Students List */}
          {reportType === 'refund-students' && (
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={FIELD_LABEL}>Refund Year</span>
                <FilterDropdown<string>
                  value={refundYearFilter}
                  onChange={(v) => setRefundYearFilter(v || 'ALL')}
                  placeholder="Refund Year"
                  hideClear
                  color="rose"
                  options={[
                    { value: 'ALL', label: 'All Academic Years' },
                    ...[...ACADEMIC_YEARS].reverse().map((yr) => ({ value: yr, label: yr })),
                  ]}
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={refundCategoryFilter}
                  onChange={(e) => setRefundCategoryFilter(e.target.value as RefundCategory | '')}
                  className="rounded-full border border-[#DB2777]/35 bg-white px-3 py-1 text-[12px] font-medium text-[#9D174D] hover:border-[#DB2777]/60 focus:outline-none focus:ring-2 focus:ring-[#DB2777]/25 focus:border-[#DB2777] cursor-pointer transition-colors"
                >
                  <option value="">All Categories</option>
                  <option value="SNQ">SNQ</option>
                  <option value="SEAT_CANCELLATION">Seat Cancellation</option>
                  <option value="GENERAL">General Refund</option>
                </select>
              </div>
              {TOOLBAR_SEP}
            </>
          )}

          {/* Search */}
          <div className="relative shrink-0 w-56">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3730A3] pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder={reportType === 'tc-issued' ? 'Search name / reg / TC no…' : reportType === 'pc-issued' ? 'Search name / reg / exam period…' : reportType === 'refund-students' ? 'Search name / reg / reference no…' : 'Search name / reg / mobile…'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full rounded-full border border-[#4F46E5]/40 bg-[#F5F6FE] py-1.5 text-[13px] font-medium text-[#3730A3] placeholder:text-[#3730A3]/55 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20 transition-all duration-150 pl-9 ${searchTerm ? 'pr-8' : 'pr-3'}`}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#D97706]/10 hover:bg-[#D97706]/20 text-[#D97706] transition-colors duration-150 shrink-0"
                aria-label="Clear search"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          {/* Column picker — Custom Report only (sort lives in the filter row) */}
          {reportType === 'custom' && (
            <ColumnPickerDropdown
              color="indigo"
              columns={STUDENT_COLUMNS}
              selected={customColumns}
              onChange={setCustomColumns}
            />
          )}

          <div className="flex-1" />

          {reportType === 'custom' && orderedCustomColumns.length === 0 && (
            <span className="text-[11px] font-medium shrink-0" style={{ color: inkOf(AMBER) }}>Select at least one column to preview/export.</span>
          )}
          {activeCount > 0 && (reportType !== 'custom' || orderedCustomColumns.length > 0) && (
            <>
              <button
                onClick={handleExportPdf}
                disabled={savingPdf}
                className={OUTLINE_PILL_BTN}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {savingPdf ? 'Generating…' : 'Save PDF'}
              </button>

              {isAdmin && (
                <button
                  onClick={handleExportExcel}
                  disabled={savingExcel}
                  className={OUTLINE_PILL_BTN}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11"/></svg>
                  {savingExcel ? 'Exporting…' : 'Export Excel'}
                </button>
              )}
            </>
          )}

          {hasActiveFilters && (
            <>
              {TOOLBAR_SEP}
              <button
                onClick={clearFilters}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#D97706]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#D97706] hover:bg-[#D97706]/[0.16] focus:outline-none focus:ring-2 focus:ring-[#D97706]/30 cursor-pointer transition-colors whitespace-nowrap"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Clear
              </button>
            </>
          )}

          {/* Filter toggle — shows/hides the filter row below */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`relative shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
              showFilters || hiddenFilterCount > 0
                ? 'bg-[#4F46E5]/10 border-[#4F46E5]/30 text-[#4F46E5]'
                : 'border-[#DCDDFB] text-[#5B6371] hover:bg-[#F3F4FE] hover:text-[#262B35]'
            }`}
            title={showFilters ? 'Hide filters' : 'Show filters'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            {!showFilters && hiddenFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-[#4F46E5] text-white text-[9px] font-semibold leading-[15px] text-center tabular-nums shadow-[0_0_0_2px_#fff]">
                {hiddenFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Collapsible filter row — expands below the search bar */}
        <div
          className="grid"
          style={{
            gridTemplateRows: showFilters ? '1fr' : '0fr',
            opacity: showFilters ? 1 : 0,
            transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 border-t border-[#EEEFFC]">
              {/* Standard dropdowns */}
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterDropdown<Course | ''>
                  color="indigo"
                  value={courseFilter}
                  onChange={(v) => setCourseFilter(v as Course | '')}
                  placeholder="Course"
                  options={COURSES.map((c) => ({ value: c, label: c }))}
                />
                <FilterDropdown<Year | ''>
                  color="indigo"
                  value={yearFilter}
                  onChange={(v) => setYearFilter(v as Year | '')}
                  placeholder="Study Yr"
                  options={YEARS.map((yr) => ({ value: yr, label: yr }))}
                />
                {reportType !== 'refund-students' && (
                  <FilterDropdown<Gender | ''>
                    color="indigo"
                    value={genderFilter}
                    onChange={(v) => setGenderFilter(v as Gender | '')}
                    placeholder="Gender"
                    options={[
                      { value: 'BOY', label: 'BOY' },
                      { value: 'GIRL', label: 'GIRL' },
                    ]}
                  />
                )}
                {reportType !== 'refund-students' && (
                  <FilterDropdown<Category | ''>
                    color="indigo"
                    value={categoryFilter}
                    onChange={(v) => setCategoryFilter(v as Category | '')}
                    placeholder="Cat"
                    options={[
                      { value: 'GM', label: 'GM' },
                      { value: 'SC', label: 'SC' },
                      { value: 'ST', label: 'ST' },
                      { value: 'C1', label: 'C1' },
                      { value: '2A', label: '2A' },
                      { value: '2B', label: '2B' },
                      { value: '3A', label: '3A' },
                      { value: '3B', label: '3B' },
                    ]}
                  />
                )}
                {reportType !== 'refund-students' && (
                  <FilterDropdown<CategoryGroup | ''>
                    color="indigo"
                    value={categoryGroupFilter}
                    onChange={(v) => setCategoryGroupFilter(v as CategoryGroup | '')}
                    placeholder="Cat Group"
                    options={[
                      { value: 'GM', label: CATEGORY_GROUP_LABELS.GM },
                      { value: 'OBC', label: CATEGORY_GROUP_LABELS.OBC },
                      { value: 'SC_ST', label: CATEGORY_GROUP_LABELS.SC_ST },
                    ]}
                  />
                )}
                {reportType !== 'refund-students' && (
                  <FilterDropdown<AdmType | ''>
                    color="indigo"
                    value={admTypeFilter}
                    onChange={(v) => setAdmTypeFilter(v as AdmType | '')}
                    placeholder="Adm Type"
                    options={[
                      { value: 'REGULAR', label: 'REGULAR' },
                      { value: 'REPEATER', label: 'REPEATER' },
                      { value: 'LATERAL', label: 'LATERAL' },
                      { value: 'EXTERNAL', label: 'EXTERNAL' },
                    ]}
                  />
                )}
                {reportType !== 'refund-students' && (
                  <FilterDropdown<AdmCat | ''>
                    color="indigo"
                    value={admCatFilter}
                    onChange={(v) => setAdmCatFilter(v as AdmCat | '')}
                    placeholder="Adm Cat"
                    options={[
                      { value: 'GM', label: 'GM' },
                      { value: 'SNQ', label: 'SNQ' },
                      { value: 'OTHERS', label: 'OTHERS' },
                    ]}
                  />
                )}
                {reportType === 'not-admitted' && (
                  <FilterDropdown<EffectiveNotAdmittedStatus>
                    color="indigo"
                    value={notAdmittedStatusFilter}
                    onChange={(v) => setNotAdmittedStatusFilter(v)}
                    placeholder="Status"
                    options={[
                      { value: 'ADMITTED', label: 'Admitted' },
                      { value: 'NOT_ADMITTED', label: 'Not Admitted' },
                      { value: 'ANS', label: 'ANS' },
                      { value: 'LEFTOUT', label: 'Left Out' },
                      { value: 'TRANSFERRED', label: 'Transferred' },
                      { value: 'TC_ISSUED', label: 'TC Issued' },
                    ]}
                  />
                )}
                {reportType === 'transfer-students' && (
                  <FilterDropdown<'IN' | 'OUT'>
                    color="indigo"
                    value={transferDirectionFilter}
                    onChange={(v) => setTransferDirectionFilter(v)}
                    placeholder="Direction"
                    options={[
                      { value: 'IN', label: 'Transfer In' },
                      { value: 'OUT', label: 'Transfer Out' },
                    ]}
                  />
                )}
              </div>

              {/* Date range — only relevant for SNQ Allotment (fee paid date) */}
              {reportType === 'snq-allotment' && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={FIELD_LABEL}>Fee Paid Date</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={SELECT_PILL}
                  />
                  <span className="text-[#A5A8E8] text-xs">→</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={SELECT_PILL}
                  />
                </div>
              )}

              {/* Sort — Custom Report only */}
              {reportType === 'custom' && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={FIELD_LABEL}>Sort by</span>
                  {sortLevels.map((level, idx) => {
                    const prevChosen = idx === 0 || !!sortLevels[idx - 1].field;
                    const usedByOthers = sortLevels.filter((_, i) => i !== idx).map((l) => l.field);
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        {idx > 0 && <span className="text-[10px] font-medium text-[#8A8FA8] whitespace-nowrap">then</span>}
                        <select
                          className={fs}
                          value={level.field}
                          disabled={!prevChosen}
                          onChange={(e) => setSortLevel(idx, { field: e.target.value as SortableField | '' })}
                        >
                          <option value="">{idx === 0 ? 'Default' : '—'}</option>
                          {SORT_FIELD_OPTIONS.filter((o) => !usedByOthers.includes(o.value)).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <select
                          className={fs}
                          value={level.direction}
                          disabled={!level.field}
                          onChange={(e) => setSortLevel(idx, { direction: e.target.value as 'asc' | 'desc' })}
                        >
                          <option value="asc">Asc</option>
                          <option value="desc">Desc</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {tcError && (reportType === 'tc-issued' || reportType === 'pc-issued') ? (
        <EmptyState tone="error" title={tcError} />
      ) : refundsError && reportType === 'refund-students' ? (
        <EmptyState tone="error" title={refundsError} />
      ) : error && reportType !== 'tc-issued' && reportType !== 'pc-issued' && reportType !== 'refund-students' ? (
        <EmptyState tone="error" title={error} />
      ) : reportType === 'tc-issued' ? (
        tcRows.length === 0 ? (
          <EmptyState title={`No TC records found${hasActiveFilters ? ' for the selected filters.' : ' across all academic years.'}`} />
        ) : (
          /* ── TC Issued List table ──────────────────────────────────────── */
          <ReportTable key="tc-issued" report="tc-issued"
            footer={
              <>
                <span>
                  Showing <span className="text-[#262B35] tabular-nums">{tcRows.length}</span> TC record{tcRows.length !== 1 ? 's' : ''}
                  {hasActiveFilters && tcStats && tcStats.totalTCs > 0 && tcRows.length < tcStats.totalTCs && (
                    <span> (filtered from {tcStats.totalTCs} total)</span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {tcClearModalMsg && (
                    <span style={{ color: inkOf(MINT) }}>{tcClearModalMsg}</span>
                  )}
                  {tcRows.length > 0 && (
                    <span className="text-[#A9ACC4] select-none">Right-click to preview · Double-click to clear TC history</span>
                  )}
                </div>
              </>
            }
          >
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${RTH} text-center w-9`}>#</th>
                <th className={`${RTH} text-left`}>Student Name</th>
                <th className={`${RTH} text-center w-14`}>Course</th>
                <th className={`${RTH} text-left w-24`}>Reg No</th>
                <th className={`${RTH} text-left w-28`}>TC Number</th>
                <th className={`${RTH} text-left w-28`}>Date of Leaving</th>
                <th className={`${RTH} text-left w-28`}>Semester</th>
                <th className={`${RTH} text-left w-28`}>Result</th>
                <th className={`${RTH} text-center w-20`}>TC Year</th>
              </tr>
            </thead>
            <tbody className={RTBODY}>
              {tcRows.map((r, idx) => (
                <tr
                  key={`${r.studentId}-${r.tcId}`}
                  onDoubleClick={() => { setTcClearModal(r); setTcClearModalMsg(''); setTcClearPasskey(''); setTcClearPasskeyError(''); }}
                  onContextMenu={(e) => { e.preventDefault(); setTcPreviewRow(r); }}
                  title="Double-click to clear TC history · Right-click to preview"
                  className={`${RROW} cursor-pointer`}
                >
                  <td className={`${TD_IDX} text-center`}>{idx + 1}</td>
                  <td className={TD}>
                    <NameCell name={r.studentName} course={r.course}>
                      {r.admType === 'EXTERNAL' && WP_TAG}
                      {r.isDuplicate && DUP_TAG}
                    </NameCell>
                  </td>
                  <td className={`${TD} text-center`}><LinePill value={r.course} color={DEPT_DOT[r.course]} minWidth={34} /></td>
                  <td className={TD_NUM}>{r.regNumber || '—'}</td>
                  <td className={`${TD} text-[11.5px] font-semibold text-[#3730A3] tabular-nums`}>{r.tcNumber}</td>
                  <td className={TD_TXT}>{r.dateOfLeaving || '—'}</td>
                  <td className={TD_TXT}>{r.semester || '—'}</td>
                  <td className={TD_TXT}>{r.result || '—'}</td>
                  <td className={`${TD} text-center`}><LinePill value={r.tcAcademicYear} color={tint} /></td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        )
      ) : reportType === 'pc-issued' ? (
        pcRows.length === 0 ? (
          <EmptyState title={`No PC records found${hasActiveFilters ? ' for the selected filters.' : ' across all academic years.'}`} />
        ) : (
          /* ── PC Issued List table ──────────────────────────────────────── */
          <ReportTable key="pc-issued" report="pc-issued"
            footer={
              <>
                <span>
                  Showing <span className="text-[#262B35] tabular-nums">{pcRows.length}</span> PC record{pcRows.length !== 1 ? 's' : ''}
                  {hasActiveFilters && pcStats && pcStats.totalPCs > 0 && pcRows.length < pcStats.totalPCs && (
                    <span> (filtered from {pcStats.totalPCs} total)</span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {pcClearModalMsg && (
                    <span style={{ color: inkOf(MINT) }}>{pcClearModalMsg}</span>
                  )}
                  {pcRows.length > 0 && (
                    <span className="text-[#A9ACC4] select-none">Double-click a row to clear PC history</span>
                  )}
                </div>
              </>
            }
          >
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${RTH} text-center w-9`}>#</th>
                <th className={`${RTH} text-left`}>Student Name</th>
                <th className={`${RTH} text-center w-14`}>Course</th>
                <th className={`${RTH} text-left w-24`}>Reg No</th>
                <th className={`${RTH} text-left w-36`}>Exam Period</th>
                <th className={`${RTH} text-left w-32`}>Result Class</th>
                <th className={`${RTH} text-left w-28`}>Date of Issue</th>
                <th className={`${RTH} text-center w-20`}>PC Year</th>
              </tr>
            </thead>
            <tbody className={RTBODY}>
              {pcRows.map((r, idx) => (
                <tr
                  key={`${r.studentId}-${r.pcId}`}
                  onDoubleClick={() => { setPcClearModal(r); setPcClearModalMsg(''); setPcClearPasskey(''); setPcClearPasskeyError(''); }}
                  title="Double-click to clear PC history"
                  className={`${RROW} cursor-pointer`}
                >
                  <td className={`${TD_IDX} text-center`}>{idx + 1}</td>
                  <td className={TD}>
                    <NameCell name={r.studentName} course={r.course}>
                      {r.admType === 'EXTERNAL' && WP_TAG}
                      {r.isDuplicate && DUP_TAG}
                    </NameCell>
                  </td>
                  <td className={`${TD} text-center`}><LinePill value={r.course} color={DEPT_DOT[r.course]} minWidth={34} /></td>
                  <td className={TD_NUM}>{r.regNumber || '—'}</td>
                  <td className={`${TD} text-[11.5px] font-semibold text-[#3730A3]`}>{r.examPeriod || '—'}</td>
                  <td className={TD_TXT}>{r.resultClass || '—'}</td>
                  <td className={TD_TXT}>{r.dateOfIssue || '—'}</td>
                  <td className={`${TD} text-center`}><LinePill value={r.pcAcademicYear} color={tint} /></td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        )
      ) : !academicYear ? (
        <EmptyState title="Please configure an academic year in Settings first." />
      ) : filteredStudents.length === 0 ? (
        <EmptyState title={`No students found${hasActiveFilters ? ' for the selected filters.' : '.'}`} />
      ) : reportType === 'snq-allotment' ? (
        /* ── SNQ Allotment table ─────────────────────────────────────────── */
        <ReportTable key="snq-allotment" report="snq-allotment" footer={showingStudents}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${RTH} text-center w-9`}>#</th>
              <th className={`${RTH} text-left`}>Name (SSLC)</th>
              <th className={`${RTH} text-left`}>Father Name</th>
              <th className={`${RTH} text-center w-14`}>Gender</th>
              <th className={`${RTH} text-center w-16`}>Category</th>
              <th className={`${RTH} text-center w-14`}>Course</th>
              <th className={`${RTH} text-left w-28`}>Student Mob</th>
              <th className={`${RTH} text-left w-28`}>Father Mob</th>
              <th className={`${RTH} text-right w-20`}>SSLC Total</th>
              <th className={`${RTH} text-right w-20`}>Income</th>
              <th className={`${RTH} text-left w-24`}>Remarks</th>
            </tr>
          </thead>
          <tbody className={RTBODY}>
            {visibleStudents.map((s, idx) => (
              <tr key={s.id} className={RROW}>
                <td className={`${TD_IDX} text-center`}>{idx + 1}</td>
                <td className={TD}><NameCell name={s.studentNameSSLC} course={s.course} /></td>
                <td className={TD_TXT}>{s.fatherName}</td>
                <td className={`${TD} text-center`}>
                  <LinePill value={s.gender === 'BOY' ? 'B' : 'G'} color={GENDER_COLOR[s.gender]} minWidth={24} />
                </td>
                <td className={`${TD} text-center`}><LinePill value={s.category} color={CATEGORY_COLOR[s.category]} minWidth={30} /></td>
                <td className={`${TD} text-center`}><LinePill value={s.course} color={DEPT_DOT[s.course]} minWidth={34} /></td>
                <td className={TD_NUM}>{s.studentMobile || '—'}</td>
                <td className={TD_NUM}>{s.fatherMobile || '—'}</td>
                <td className={`${TD_NUM} text-right`}>
                  {s.sslcObtainedTotal ?? '—'}
                </td>
                <td className={`${TD_NUM} text-right`}>
                  {s.annualIncome ? s.annualIncome.toLocaleString('en-IN') : '—'}
                </td>
                <td className={TD_TXT}></td>
              </tr>
            ))}
            {hasMore && (
              <LoadMoreRow colSpan={11} remaining={filteredStudents.length - visibleCount} onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} />
            )}
          </tbody>
        </ReportTable>
      ) : reportType === 'student-list' ? (
        /* ── Student List table ──────────────────────────────────────────── */
        <ReportTable key="student-list" report="student-list" footer={showingStudents}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${RTH} text-left w-8`}>#</th>
              <th className={`${RTH} text-left`}>Name (SSLC)</th>
              <th className={`${RTH} text-left w-24`}>Reg No</th>
              <th className={`${RTH} text-left w-14`}>Course</th>
              <th className={`${RTH} text-left w-20`}>Year</th>
              <th className={`${RTH} text-left w-14`}>Gender</th>
              <th className={`${RTH} text-left w-14`}>Category</th>
              <th className={`${RTH} text-left w-20`}>Adm Type</th>
              <th className={`${RTH} text-left w-16`}>Adm Cat</th>
              <th className={`${RTH} text-left w-20`}>Allotted Cat</th>
              <th className={`${RTH} text-left w-28`}>Mobile</th>
              <th className={`${RTH} text-left w-24`}>Status</th>
            </tr>
          </thead>
          <tbody className={RTBODY}>
            {visibleStudents.map((s, idx) => (
              <tr key={s.id} className={RROW}>
                <td className={TD_IDX}>{idx + 1}</td>
                <td className={TD}><NameCell name={s.studentNameSSLC} course={s.course} /></td>
                <td className={TD_NUM}>{s.regNumber || '—'}</td>
                <td className={TD}><LinePill value={s.course} color={DEPT_DOT[s.course]} minWidth={34} /></td>
                <td className={TD}><LinePill value={s.year} color={YEAR_COLOR[s.year]} minWidth={66} /></td>
                <td className={TD}><LinePill value={s.gender} color={GENDER_COLOR[s.gender]} minWidth={40} /></td>
                <td className={TD}><LinePill value={s.category} color={CATEGORY_COLOR[s.category]} minWidth={30} /></td>
                <td className={TD}><LinePill value={s.admType} color={ADM_TYPE_COLOR[s.admType]} minWidth={70} /></td>
                <td className={TD}><LinePill value={s.admCat} color={ADM_CAT_COLOR[s.admCat]} minWidth={56} /></td>
                <td className={TD}>
                  <LinePill
                    value={s.allottedCategory}
                    color={s.allottedCategory !== s.category ? AMBER : FALLBACK_COLOR}
                    minWidth={30}
                  />
                </td>
                <td className={TD_NUM}>{s.studentMobile || '—'}</td>
                <td className={TD}>
                  <LinePill value={s.admissionStatus} color={STATUS_COLOR[s.admissionStatus] ?? AMBER} minWidth={80} />
                </td>
              </tr>
            ))}
            {hasMore && (
              <LoadMoreRow colSpan={12} remaining={filteredStudents.length - visibleCount} onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} />
            )}
          </tbody>
        </ReportTable>
      ) : reportType === 'whatsapp-numbers' ? (
        /* ── Whatsapp Numbers table ──────────────────────────────────────── */
        <ReportTable key="whatsapp-numbers" report="whatsapp-numbers" footer={showingStudents}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${RTH} text-center w-9`}>#</th>
              <th className={`${RTH} text-left`}>Student Name</th>
              <th className={`${RTH} text-left w-28`}>Year</th>
              <th className={`${RTH} text-center w-14`}>Course</th>
              <th className={`${RTH} text-left w-32`}>Father Mobile</th>
              <th className={`${RTH} text-left w-32`}>Student Mobile</th>
            </tr>
          </thead>
          <tbody className={RTBODY}>
            {visibleStudents.map((s, idx) => (
              <tr key={s.id} className={RROW}>
                <td className={`${TD_IDX} text-center`}>{idx + 1}</td>
                <td className={TD}><NameCell name={s.studentNameSSLC} course={s.course} /></td>
                <td className={TD}><LinePill value={s.year} color={YEAR_COLOR[s.year]} minWidth={66} /></td>
                <td className={`${TD} text-center`}><LinePill value={s.course} color={DEPT_DOT[s.course]} minWidth={34} /></td>
                <td className={TD_NUM}>{s.fatherMobile || DASH}</td>
                <td className={TD_NUM}>{s.studentMobile || DASH}</td>
              </tr>
            ))}
            {hasMore && (
              <LoadMoreRow colSpan={6} remaining={filteredStudents.length - visibleCount} onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} />
            )}
          </tbody>
        </ReportTable>
      ) : reportType === 'not-admitted' ? (
        !previousAcademicYear ? (
          <EmptyState title="No previous academic year exists to compare against." />
        ) : (
          /* ── Not Admitted List table ───────────────────────────────────── */
          <ReportTable key="not-admitted" report="not-admitted"
            footer={
              <span>
                Showing <span className="text-[#262B35] tabular-nums">{Math.min(visibleCount, filteredStudents.length)}</span> of{' '}
                <span className="text-[#262B35] tabular-nums">{filteredStudents.length}</span> student{filteredStudents.length !== 1 ? 's' : ''}
                {hasActiveFilters && notAdmittedBase.length > 0 && filteredStudents.length < notAdmittedBase.length && (
                  <span> (filtered from {notAdmittedBase.length} total)</span>
                )}
              </span>
            }
          >
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${RTH} text-center w-9`}>#</th>
                <th className={`${RTH} text-left`}>Student Name</th>
                <th className={`${RTH} text-left w-24`}>Reg No</th>
                <th className={`${RTH} text-left w-24`}>Previous Year</th>
                <th className={`${RTH} text-left w-24`}>Current Year</th>
                <th className={`${RTH} text-center w-14`}>Course</th>
                <th className={`${RTH} text-center w-12`}>Cat</th>
                <th className={`${RTH} text-center w-20`}>Adm Type</th>
                <th className={`${RTH} text-center w-16`}>Adm Cat</th>
                <th className={`${RTH} text-left w-32`}>Mobile No</th>
                <th className={`${RTH} text-center w-24`}>Status</th>
              </tr>
            </thead>
            <tbody className={RTBODY}>
              {visibleStudents.map((s, idx) => {
                const status = effectiveNotAdmittedStatus(s, notAdmittedStatusMap.get(s.id));
                const meta = STATUS_TAG_META[status];
                const menuActive = statusCtxMenu?.student.id === s.id;
                return (
                  <tr
                    key={s.id}
                    className={`transition-colors cursor-context-menu ${menuActive ? 'row-ctx-active' : meta.row}`}
                    onContextMenu={(e) => { e.preventDefault(); setStatusCtxMenu({ x: e.clientX, y: e.clientY, student: s }); }}
                    title="Right-click to mark status"
                  >
                    <td className={`${TD_IDX} text-center`}>{idx + 1}</td>
                    <td className={TD}><NameCell name={s.studentNameSSLC} course={s.course} /></td>
                    <td className={TD_NUM}>{s.regNumber || '—'}</td>
                    <td className={TD}><LinePill value={s.year} color={YEAR_COLOR[s.year]} minWidth={66} /></td>
                    <td className={TD}>
                      {(() => {
                        const cur = notAdmittedCurrentYearMap.get(s.id);
                        return cur ? <LinePill value={cur} color={YEAR_COLOR[cur]} minWidth={66} /> : '—';
                      })()}
                    </td>
                    <td className={`${TD} text-center`}><LinePill value={s.course} color={DEPT_DOT[s.course]} minWidth={34} /></td>
                    <td className={`${TD} text-center`}><LinePill value={s.category} color={CATEGORY_COLOR[s.category]} minWidth={30} /></td>
                    <td className={`${TD} text-center`}><LinePill value={s.admType} color={ADM_TYPE_COLOR[s.admType]} minWidth={70} /></td>
                    <td className={`${TD} text-center`}><LinePill value={s.admCat} color={ADM_CAT_COLOR[s.admCat]} minWidth={56} /></td>
                    <td className={TD_NUM}>{s.studentMobile || s.fatherMobile || DASH}</td>
                    <td className={`${TD} text-center`}>
                      <span className={`inline-flex items-center justify-center min-w-[84px] px-[7px] py-[4.5px] rounded-full text-[10.5px] font-medium leading-none ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {hasMore && (
                <LoadMoreRow colSpan={11} remaining={filteredStudents.length - visibleCount} onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} />
              )}
            </tbody>
          </ReportTable>
        )
      ) : reportType === 'transfer-students' ? (
        /* ── Transfer Students table ─────────────────────────────────────── */
        <ReportTable key="transfer-students" report="transfer-students"
          footer={
            <span>
              Showing <span className="text-[#262B35] tabular-nums">{Math.min(visibleCount, filteredStudents.length)}</span> of{' '}
              <span className="text-[#262B35] tabular-nums">{filteredStudents.length}</span> student{filteredStudents.length !== 1 ? 's' : ''}
            </span>
          }
        >
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${RTH} text-center w-9`}>#</th>
              <th className={`${RTH} text-left`}>Student Name</th>
              <th className={`${RTH} text-left w-24`}>Reg No</th>
              <th className={`${RTH} text-center w-16`}>Year</th>
              <th className={`${RTH} text-center w-14`}>Course</th>
              <th className={`${RTH} text-center w-12`}>Cat</th>
              <th className={`${RTH} text-center w-20`}>Adm Type</th>
              <th className={`${RTH} text-left w-32`}>Mobile No</th>
              <th className={`${RTH} text-center w-28`}>Direction</th>
              <th className={`${RTH} text-left w-36`}>Polytechnic</th>
              <th className={`${RTH} text-center w-24`}>Date</th>
              {isAdmin && <th className={`${RTH} text-center w-20`}>Action</th>}
            </tr>
          </thead>
          <tbody className={RTBODY}>
            {visibleStudents.map((s, idx) => {
              const isOut = !!s.transferOut;
              const dateVal = isOut ? s.transferOutDate : s.enrollmentDate;
              const polytechnic = isOut ? s.transferOutPolytechnic : s.transferInPolytechnic;
              return (
                <tr key={s.id} className={RROW}>
                  <td className={`${TD_IDX} text-center`}>{idx + 1}</td>
                  <td className={TD}><NameCell name={s.studentNameSSLC} course={s.course} /></td>
                  <td className={TD_NUM}>{s.regNumber || '—'}</td>
                  <td className={`${TD} text-center`}><LinePill value={s.year} color={YEAR_COLOR[s.year]} minWidth={66} /></td>
                  <td className={`${TD} text-center`}><LinePill value={s.course} color={DEPT_DOT[s.course]} minWidth={34} /></td>
                  <td className={`${TD} text-center`}><LinePill value={s.category} color={CATEGORY_COLOR[s.category]} minWidth={30} /></td>
                  <td className={`${TD} text-center`}><LinePill value={s.admType} color={ADM_TYPE_COLOR[s.admType]} minWidth={70} /></td>
                  <td className={TD_NUM}>{s.studentMobile || s.fatherMobile || DASH}</td>
                  <td className={`${TD} text-center`}>
                    <LinePill value={isOut ? 'Transfer Out' : 'Transfer In'} color={isOut ? '#0284C7' : '#7C3AED'} minWidth={84} />
                  </td>
                  <td className={TD_TXT}>{polytechnic || '—'}</td>
                  <td className={`${TD_TXT} text-center`}>
                    {dateVal ? new Date(dateVal).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  {isAdmin && (
                    <td className={`${TD} text-center`}>
                      {isOut && (
                        <button
                          className="inline-flex items-center justify-center rounded-[7px] border border-[#0284C7]/45 bg-white px-2.5 py-[5px] text-[11px] font-medium leading-none text-[#0369A1] transition-colors enabled:hover:bg-[#0284C7]/[0.08] enabled:cursor-pointer disabled:opacity-50"
                          disabled={clearingTransferOutId === s.id}
                          onClick={() => handleClearTransferOut(s)}
                        >
                          {clearingTransferOutId === s.id ? 'Clearing…' : 'Clear'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {hasMore && (
              <LoadMoreRow colSpan={isAdmin ? 12 : 11} remaining={filteredStudents.length - visibleCount} onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} />
            )}
          </tbody>
        </ReportTable>
      ) : reportType === 'refund-students' ? (
        refundRows.length === 0 ? (
          <EmptyState title={`No refund records found${hasActiveFilters ? ' for the selected filters.' : ' across all academic years.'}`} />
        ) : (
          /* ── Refund Students List table ──────────────────────────────────── */
          <ReportTable key="refund-students" report="refund-students"
            footer={
              <>
                <span>
                  Showing <span className="text-[#262B35] tabular-nums">{refundRows.length}</span> refund{refundRows.length !== 1 ? 's' : ''}
                  {hasActiveFilters && refundStats && refundStats.totalRefunds > 0 && refundRows.length < refundStats.totalRefunds && (
                    <span> (filtered from {refundStats.totalRefunds} total)</span>
                  )}
                </span>
                <span className="font-semibold tabular-nums" style={{ color: inkOf(tint) }}>
                  Total: ₹{refundRows.reduce((s, r) => s + r.refundAmount, 0).toLocaleString('en-IN')}
                </span>
              </>
            }
          >
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${RTH} text-center w-9`}>#</th>
                <th className={`${RTH} text-left`}>Student Name</th>
                <th className={`${RTH} text-center w-14`}>Course</th>
                <th className={`${RTH} text-left w-24`}>Reg No</th>
                <th className={`${RTH} text-center w-28`}>Category</th>
                <th className={`${RTH} text-right w-28`}>Refund Amt</th>
                <th className={`${RTH} text-left w-32`}>Mode</th>
                <th className={`${RTH} text-left w-28`}>Payment Date</th>
                <th className={`${RTH} text-center w-20`}>Acad. Year</th>
              </tr>
            </thead>
            <tbody className={RTBODY}>
              {refundRows.map((r, idx) => {
                const category = r.refundCategory ?? 'SNQ';
                const categoryLabel = category === 'SNQ' ? 'SNQ' : category === 'GENERAL' ? 'General Refund' : 'Seat Cancellation';
                return (
                  <tr key={r.id} className={RROW}>
                    <td className={`${TD_IDX} text-center`}>{idx + 1}</td>
                    <td className={TD}><NameCell name={r.studentName} course={r.course} /></td>
                    <td className={`${TD} text-center`}><LinePill value={r.course} color={DEPT_DOT[r.course]} minWidth={34} /></td>
                    <td className={TD_NUM}>{r.regNumber || '—'}</td>
                    <td className={`${TD} text-center`}><LinePill value={categoryLabel} color={REFUND_CAT_COLOR[category]} /></td>
                    <td className={`${TD} text-right text-[12px] font-semibold tabular-nums`} style={{ color: inkOf(tint) }}>₹{r.refundAmount.toLocaleString('en-IN')}</td>
                    <td className={TD_TXT}>{r.paymentType.replace(/_/g, ' ')}</td>
                    <td className={TD_TXT}>
                      {r.paymentDate ? new Date(r.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className={`${TD} text-center`}><LinePill value={r.academicYear} color={tint} /></td>
                  </tr>
                );
              })}
            </tbody>
          </ReportTable>
        )
      ) : reportType === 'custom' ? (
        orderedCustomColumns.length === 0 ? (
          <EmptyState title="Select at least one column above to preview the report." />
        ) : (
          /* ── Custom Report table ───────────────────────────────────────── */
          <ReportTable key="custom" report="custom" footer={showingStudents}>
            <thead className="sticky top-0 z-10">
              <tr>
                {orderedCustomColumns.map((c) => (
                  <th key={c.key} className={`${RTH} ${ALIGN_CLASS[c.align]}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={RTBODY}>
              {visibleStudents.map((s, idx) => (
                <tr key={s.id} className={RROW}>
                  {orderedCustomColumns.map((c) => (
                    <td key={c.key} className={`${TD_TXT} !text-[#262B35] ${ALIGN_CLASS[c.align]}`}>
                      {formatColumnValue(c, s, idx)}
                    </td>
                  ))}
                </tr>
              ))}
              {hasMore && (
                <LoadMoreRow colSpan={orderedCustomColumns.length} remaining={filteredStudents.length - visibleCount} onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} />
              )}
            </tbody>
          </ReportTable>
        )
      ) : (
        /* ── Allotted Category table ─────────────────────────────────────── */
        <ReportTable key="allotted-category" report="allotted-category" footer={showingStudents}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${RTH} text-center w-9`}>#</th>
              <th className={`${RTH} text-left`}>Student Name</th>
              <th className={`${RTH} text-left w-28`}>Year</th>
              <th className={`${RTH} text-center w-16`}>Course</th>
              <th className={`${RTH} text-left w-24`}>Reg No</th>
              <th className={`${RTH} text-center w-16`}>Category</th>
              <th className={`${RTH} text-center w-20`}>Adm Cat</th>
              <th className={`${RTH} text-center w-28 !font-semibold`}>Allotted Cat</th>
              <th className={`${RTH} text-center w-24`}>Adm Type</th>
              <th className={`${RTH} text-left w-28`}>Student Mob</th>
              <th className={`${RTH} text-left w-28`}>Father Mob</th>
            </tr>
          </thead>
          <tbody className={RTBODY}>
            {visibleStudents.map((s, idx) => (
              <tr key={s.id} className={RROW}>
                <td className={`${TD_IDX} text-center`}>{idx + 1}</td>
                <td className={TD}><NameCell name={s.studentNameSSLC} course={s.course} /></td>
                <td className={TD}><LinePill value={s.year} color={YEAR_COLOR[s.year]} minWidth={66} /></td>
                <td className={`${TD} text-center`}><LinePill value={s.course} color={DEPT_DOT[s.course]} minWidth={34} /></td>
                <td className={TD_NUM}>{s.regNumber || '—'}</td>
                <td className={`${TD} text-center`}><LinePill value={s.category} color={CATEGORY_COLOR[s.category]} minWidth={30} /></td>
                <td className={`${TD} text-center`}><LinePill value={s.admCat} color={ADM_CAT_COLOR[s.admCat]} minWidth={56} /></td>
                <td className={`${TD} text-center`}><LinePill value={s.allottedCategory} color={tint} minWidth={40} /></td>
                <td className={`${TD} text-center`}><LinePill value={s.admType} color={ADM_TYPE_COLOR[s.admType]} minWidth={70} /></td>
                <td className={TD_NUM}>{s.studentMobile || '—'}</td>
                <td className={TD_NUM}>{s.fatherMobile || '—'}</td>
              </tr>
            ))}
            {hasMore && (
              <LoadMoreRow colSpan={11} remaining={filteredStudents.length - visibleCount} onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} />
            )}
          </tbody>
        </ReportTable>
      )}
    </div>

      {/* ── PC Clear Modal (double-click on PC row) ─────────────────────── */}
      {pcClearModal && (
        <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-[#1E1B4B]/40 backdrop-blur-[2px]"
            onClick={() => !pcClearModalClearing && (setPcClearModal(null), setPcClearPasskey(''), setPcClearPasskeyError(''))}
            aria-hidden="true"
            style={{ animation: 'backdrop-enter 0.2s ease-out' }}
          />
          <div
            className="relative bg-white rounded-[22px] border border-[#DCDDFB] max-w-sm w-full overflow-hidden"
            style={{ animation: 'modal-enter 0.25s ease-out', boxShadow: '0 24px 60px rgba(30,27,75,0.22), 0 4px 14px rgba(18,20,26,0.06)' }}
          >
            <ClearModalHeader eyebrow="PC History" title="Clear PC History" />

            <div className="px-5 py-4 space-y-3">
              <ClearModalStudent
                name={pcClearModal.studentName}
                course={pcClearModal.course}
                meta={`${pcClearModal.regNumber || '—'} · ${pcClearModal.course} · ${pcClearModal.year} · ${pcClearModal.enrollmentYear}`}
              />

              <p className="text-[12.5px] font-medium text-[#5B6371] leading-relaxed">
                This will permanently erase{' '}
                <span className="font-semibold" style={{ color: inkOf(CORAL) }}>all PC records</span> for this student.
                The action cannot be undone.
              </p>

              <div>
                <label className={`block mb-1 ${FIELD_LABEL}`}>Passkey</label>
                <input
                  type="password"
                  value={pcClearPasskey}
                  onChange={(e) => { setPcClearPasskey(e.target.value); setPcClearPasskeyError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { void handlePcClearFromModal(); } }}
                  placeholder="Enter passkey"
                  autoFocus
                  autoComplete="new-password"
                  className={`${PASSKEY_INPUT} ${pcClearPasskeyError ? 'border-[#E11D48]/60' : 'border-[#DCDDFB]'}`}
                />
                {pcClearPasskeyError && (
                  <p className="text-[11.5px] font-medium mt-1" style={{ color: inkOf(CORAL) }}>{pcClearPasskeyError}</p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[#DCDDFB] flex justify-end gap-2">
              <button
                onClick={() => { setPcClearModal(null); setPcClearPasskey(''); setPcClearPasskeyError(''); }}
                disabled={pcClearModalClearing}
                className={MODAL_CANCEL_BTN}
              >
                Cancel
              </button>
              <button
                onClick={() => { void handlePcClearFromModal(); }}
                disabled={pcClearModalClearing}
                className={MODAL_DANGER_BTN}
                style={{ boxShadow: `0 3px 10px ${CORAL}40` }}
              >
                {pcClearModalClearing ? 'Clearing…' : 'Yes, Clear History'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TC Clear Modal (double-click on TC row) ─────────────────────── */}
      {tcClearModal && (
        <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-[#1E1B4B]/40 backdrop-blur-[2px]"
            onClick={() => !tcClearModalClearing && (setTcClearModal(null), setTcClearPasskey(''), setTcClearPasskeyError(''))}
            aria-hidden="true"
            style={{ animation: 'backdrop-enter 0.2s ease-out' }}
          />
          <div
            className="relative bg-white rounded-[22px] border border-[#DCDDFB] max-w-sm w-full overflow-hidden"
            style={{ animation: 'modal-enter 0.25s ease-out', boxShadow: '0 24px 60px rgba(30,27,75,0.22), 0 4px 14px rgba(18,20,26,0.06)' }}
          >
            <ClearModalHeader eyebrow="TC History" title="Clear TC History" />

            <div className="px-5 py-4 space-y-3">
              <ClearModalStudent
                name={tcClearModal.studentName}
                course={tcClearModal.course}
                meta={`${tcClearModal.regNumber || '—'} · ${tcClearModal.course} · ${tcClearModal.year} · ${tcClearModal.enrollmentYear}`}
              />

              <p className="text-[12.5px] font-medium text-[#5B6371] leading-relaxed">
                This will permanently erase{' '}
                <span className="font-semibold" style={{ color: inkOf(CORAL) }}>all TC records</span> for this student.
                The action cannot be undone.
              </p>

              <div>
                <label className={`block mb-1 ${FIELD_LABEL}`}>Passkey</label>
                <input
                  type="password"
                  value={tcClearPasskey}
                  onChange={(e) => { setTcClearPasskey(e.target.value); setTcClearPasskeyError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { void handleTcClearFromModal(); } }}
                  placeholder="Enter passkey"
                  autoFocus
                  autoComplete="new-password"
                  className={`${PASSKEY_INPUT} ${tcClearPasskeyError ? 'border-[#E11D48]/60' : 'border-[#DCDDFB]'}`}
                />
                {tcClearPasskeyError && (
                  <p className="text-[11.5px] font-medium mt-1" style={{ color: inkOf(CORAL) }}>{tcClearPasskeyError}</p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[#DCDDFB] flex justify-end gap-2">
              <button
                onClick={() => { setTcClearModal(null); setTcClearPasskey(''); setTcClearPasskeyError(''); }}
                disabled={tcClearModalClearing}
                className={MODAL_CANCEL_BTN}
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleTcClearFromModal(); }}
                disabled={tcClearModalClearing}
                className={MODAL_DANGER_BTN}
                style={{ boxShadow: `0 3px 10px ${CORAL}40` }}
              >
                {tcClearModalClearing ? 'Clearing…' : 'Yes, Clear History'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TC Preview Modal (right-click on a TC row) ────────────────────── */}
      {tcPreviewRow && (
        <div
          className="font-wp fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ animation: 'backdrop-enter 0.18s ease-out' }}
        >
          <div className="absolute inset-0 bg-[#1E1B4B]/45 backdrop-blur-[2px]" onClick={() => setTcPreviewRow(null)} />
          <div
            className="relative bg-white rounded-[22px] border border-[#DCDDFB] flex flex-col overflow-hidden"
            style={{ width: '860px', maxWidth: '100%', maxHeight: 'calc(100vh - 3rem)', animation: 'modal-enter 0.22s ease-out', boxShadow: '0 24px 60px rgba(30,27,75,0.22), 0 4px 14px rgba(18,20,26,0.06)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="relative overflow-hidden px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-[#4F46E5]/20"
              style={{ background: `linear-gradient(135deg, ${INDIGO}24 0%, ${INDIGO}0D 55%, #FFFFFF 100%)` }}
            >
              <span
                className="pointer-events-none absolute -top-20 -right-10 w-44 h-44 rounded-full border-[22px]"
                style={{ borderColor: `${INDIGO}12` }}
                aria-hidden="true"
              />
              <div className="relative min-w-0 flex-1 flex items-center gap-2.5 flex-wrap">
                <span
                  className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] text-white shrink-0"
                  style={{ background: `linear-gradient(135deg, ${INDIGO}, #3730A3)`, boxShadow: `0 3px 10px ${INDIGO}40` }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                </span>
                <div className="flex flex-col shrink-0">
                  <span className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A8FA8] leading-none">TC Preview</span>
                  <h2 className="mt-1 text-[16px] font-bold text-[#3730A3] leading-none tracking-[-0.2px] tabular-nums">{tcPreviewRow.tcNumber}</h2>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#4F46E5]/40 bg-white/85 text-[#3730A3] px-2.5 py-[4px] text-[10.5px] font-medium leading-none truncate max-w-xs">
                  {tcPreviewRow.studentName}
                </span>
                {tcPreviewRow.isDuplicate && (
                  <LinePill value="Duplicate Copy" color={AMBER} />
                )}
              </div>
              <button
                onClick={() => setTcPreviewRow(null)}
                className="relative flex items-center justify-center w-8 h-8 rounded-full border border-[#4F46E5]/35 bg-white text-[#3730A3] hover:bg-[#F3F4FE] hover:border-[#4F46E5]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]/30 transition-colors cursor-pointer shrink-0 ml-3 shadow-[0_1px_4px_rgba(18,20,26,0.06)]"
                aria-label="Close"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Info banner */}
            <div className="px-5 py-2 bg-[#F5F6FE] border-b border-[#DCDDFB] flex items-center gap-2 shrink-0">
              <svg className="w-3.5 h-3.5 text-[#4F46E5] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span className="text-[11.5px] font-medium text-[#3730A3]">
                Read-only preview reconstructed from the issued record. This does not print or save.
              </span>
            </div>

            {/* Preview iframe */}
            <div className="scroll-indigo flex-1 overflow-auto min-h-0 bg-[#E4E5F4]">
              {tcPreviewHtml ? (
                <iframe
                  srcDoc={tcPreviewHtml}
                  title="Transfer Certificate Preview"
                  className="w-full border-0 block"
                  style={{ height: '1100px' }}
                />
              ) : (
                <div className="flex items-center justify-center h-40 text-[13px] font-medium text-[#5B6371]">
                  Unable to load student record for this TC.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#DCDDFB] bg-white shrink-0 flex items-center justify-end">
              <button
                onClick={() => setTcPreviewRow(null)}
                className={MODAL_CANCEL_BTN}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Not Admitted List: status context menu (right-click a row) ─────── */}
      {statusCtxMenu && (() => {
        const student = statusCtxMenu.student;
        const currentStatus = effectiveNotAdmittedStatus(student, notAdmittedStatusMap.get(student.id));
        const currentMeta = STATUS_TAG_META[currentStatus];
        const TAG_OPTIONS: { tag: NotAdmittedStatusTag; label: string }[] = [
          { tag: 'ANS',         label: 'Mark as ANS' },
          { tag: 'LEFTOUT',     label: 'Mark as Left Out' },
          { tag: 'TRANSFERRED', label: 'Mark as Transferred' },
          { tag: 'TC_ISSUED',   label: 'Mark as TC Issued' },
        ];
        return (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setStatusCtxMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setStatusCtxMenu(null); }}
            />
            <div
              ref={statusCtxMenuRef}
              className="font-wp fixed z-50 bg-white border border-[#DCDDFB] rounded-2xl overflow-hidden min-w-[220px]"
              style={{ left: statusCtxMenu.x, top: statusCtxMenu.y, visibility: 'hidden', boxShadow: '0 12px 36px rgba(30,27,75,0.14), 0 2px 8px rgba(18,20,26,0.05)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* Header */}
              <div className="px-3 py-2.5 border-b border-[#DCDDFB] bg-[#F3F4FE] flex items-center gap-3">
                <RingAvatar name={student.studentNameSSLC} course={student.course} />
                <div className="min-w-0">
                  <p className="text-[9px] font-medium uppercase tracking-[0.8px] text-[#8A8FA8] leading-none">
                    {student.course} · {student.year} · {student.academicYear}
                  </p>
                  <p className="mt-1 text-[12px] font-medium text-[#262B35] truncate leading-none">{student.studentNameSSLC}</p>
                  <span className={`inline-flex items-center mt-1.5 px-2 py-[3px] rounded-full text-[9.5px] font-medium leading-none ${currentMeta.badge}`}>
                    {currentMeta.label}
                  </span>
                </div>
              </div>
              {/* Items */}
              <div className="p-1">
                {isAdmin ? (
                  <>
                    {TAG_OPTIONS.map((opt) => (
                      <button
                        key={opt.tag}
                        className={MENU_ITEM}
                        disabled={student.notAdmittedStatusTag === opt.tag}
                        onClick={() => { void handleSetNotAdmittedStatus(student.id, opt.tag); }}
                      >
                        <span className={`${MENU_ICON} group-enabled:group-hover:bg-[#4F46E5]/10 group-enabled:group-hover:text-[#4F46E5]`}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </span>
                        {opt.label}
                      </button>
                    ))}
                    {student.notAdmittedStatusTag && (
                      <>
                        <div className="my-1 h-px bg-[#EEEFFC] mx-2" />
                        <button
                          className={`${MENU_ITEM} !text-[#BE123C] enabled:hover:!bg-[#E11D48]/[0.06]`}
                          onClick={() => { void handleSetNotAdmittedStatus(student.id, null); }}
                        >
                          <span className={MENU_ICON} style={{ background: `${CORAL}14`, color: CORAL }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </span>
                          Clear Status
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="px-2 py-1.5 text-[11.5px] font-medium text-[#8A8FA8]">Only admins can edit status.</div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </>
  );
}
