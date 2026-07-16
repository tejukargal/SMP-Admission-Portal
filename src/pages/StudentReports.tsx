import { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { useAuth } from '../contexts/AuthContext';
import { exportStudentReportPdf } from '../utils/studentReportPdf';
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
import { PageSpinner } from '../components/common/PageSpinner';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { ColumnPickerDropdown } from '../components/common/ColumnPickerDropdown';
import { STUDENT_COLUMNS, DEFAULT_CUSTOM_COLUMNS, formatColumnValue } from '../utils/studentColumns';
import { sortByLevels, SORT_FIELD_OPTIONS, type SortLevel, type SortableField } from '../utils/sortStudents';
import { exportCustomStudentReportPdf } from '../utils/customStudentReportPdf';
import { exportNotAdmittedPdf } from '../utils/notAdmittedPdf';
import { ACADEMIC_YEARS, CATEGORY_GROUPS, CATEGORY_GROUP_LABELS } from '../types';
import type { Student, Course, Year, Gender, Category, AdmType, AdmCat, AcademicYear, CategoryGroup } from '../types';

const PAGE_SIZE = 100;

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[]     = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];

type ReportType = 'snq-allotment' | 'whatsapp-numbers' | 'tc-issued' | 'pc-issued' | 'allotted-category' | 'student-list' | 'not-admitted' | 'custom';

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: 'snq-allotment',      label: 'List for SNQ Allotment'  },
  { value: 'whatsapp-numbers',   label: 'Whatsapp Numbers List'   },
  { value: 'tc-issued',          label: 'TC Issued List'          },
  { value: 'pc-issued',          label: 'PC Issued List'          },
  { value: 'allotted-category',  label: 'Allotted Category List'  },
  { value: 'student-list',       label: 'Student List'            },
  { value: 'not-admitted',       label: 'Not Admitted List'       },
  { value: 'custom',             label: 'Custom Report'           },
];

const fs = 'rounded-full border border-emerald-100 px-3 py-1.5 text-xs bg-white/80 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 cursor-pointer text-gray-700';

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

export function StudentReports() {
  const { role }                               = useAuth();
  const isAdmin                                = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;
  const previousAcademicYear = (academicYear
    ? (ACADEMIC_YEARS[ACADEMIC_YEARS.indexOf(academicYear) - 1] ?? null)
    : null) as AcademicYear | null;

  const { students: allStudents, loading, error } = useStudents(academicYear);
  const { students: prevYearStudents, loading: prevYearLoading } = useStudents(previousAcademicYear);
  const { records: feeRecords, loading: feeLoading } = useFeeRecords(academicYear);
  const { students: allStudentsForTC, loading: tcLoading, error: tcError } = useAllStudents();

  // ── Report type ─────────────────────────────────────────────────────────────
  const [reportType, setReportType] = useState<ReportType>('snq-allotment');

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

  // ── Custom Report: columns + multi-level sort ────────────────────────────────
  const [customColumns, setCustomColumns] = useState<Set<keyof Student>>(new Set(DEFAULT_CUSTOM_COLUMNS));
  const [sortLevels, setSortLevels] = useState<SortLevel[]>([
    { field: '', direction: 'asc' },
    { field: '', direction: 'asc' },
    { field: '', direction: 'asc' },
  ]);
  const orderedCustomColumns = useMemo(
    () => STUDENT_COLUMNS.filter((c) => customColumns.has(c.key)),
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
  const [notAdmittedStatusFilter, setNotAdmittedStatusFilter] = useState<'' | 'ADMITTED' | 'NOT_ADMITTED'>('');

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
      : allStudents.filter((s) => s.admissionStatus === 'CONFIRMED');
    if (courseFilter)   result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)     result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)   result = result.filter((s) => s.gender === genderFilter);
    if (categoryFilter) result = result.filter((s) => s.category === categoryFilter);
    if (categoryGroupFilter) result = result.filter((s) => CATEGORY_GROUPS[categoryGroupFilter].includes(s.category));
    if (admTypeFilter)  result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)   result = result.filter((s) => s.admCat === admCatFilter);
    if (reportType === 'not-admitted' && notAdmittedStatusFilter) {
      result = result.filter((s) => notAdmittedStatusMap.get(s.id) === notAdmittedStatusFilter);
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
  }, [allStudents, notAdmittedBase, notAdmittedStatusMap, notAdmittedStatusFilter, firstPaymentDate, courseFilter, yearFilter, genderFilter, categoryFilter, categoryGroupFilter, admTypeFilter, admCatFilter, dateFrom, dateTo, debouncedSearch, reportType, sortLevels]);

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

  const hasActiveSort = sortLevels.some((l) => !!l.field);

  const hasActiveFilters =
    !!searchTerm || !!courseFilter || !!yearFilter || !!genderFilter ||
    !!categoryFilter || !!categoryGroupFilter || !!admTypeFilter || !!admCatFilter || !!dateFrom || !!dateTo ||
    (reportType === 'tc-issued' && tcYearFilter !== 'ALL') ||
    (reportType === 'pc-issued' && pcYearFilter !== 'ALL') ||
    (reportType === 'not-admitted' && !!notAdmittedStatusFilter) ||
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
    setSortLevels([
      { field: '', direction: 'asc' },
      { field: '', direction: 'asc' },
      { field: '', direction: 'asc' },
    ]);
  }

  // ── Stats (SNQ Allotment & WhatsApp Numbers) ──────────────────────────────────
  const stats = useMemo(() => {
    const confirmed = allStudents.filter((s) => s.admissionStatus === 'CONFIRMED');
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
              statusFilter: notAdmittedStatusFilter,
              searchTerm: debouncedSearch,
            }
          );
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
            'Sl No', 'Student Name', 'Course', 'Year', 'Category', 'Enrollment Year',
            'Reg No', 'TC Number', 'Date of Admission', 'Date of Leaving',
            'Semester', 'Last Exam', 'Result', 'Duplicate', 'Issued Date',
          ];
          const rows = tcRows.map((r, i) => [
            i + 1,
            r.studentName,
            r.course,
            r.year,
            r.category,
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
            { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
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
            'Sl No', 'Student Name', 'Course', 'Year', 'Category', 'Enrollment Year',
            'Reg No', 'Exam Period', 'Result Class', 'Date of Issue', 'Duplicate', 'Issued Date',
          ];
          const rows = pcRows.map((r, i) => [
            i + 1,
            r.studentName,
            r.course,
            r.year,
            r.category,
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
            { wch: 6 }, { wch: 26 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 14 },
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
          const headers = ['Sl No', ...orderedCustomColumns.map((c) => c.label)];
          const rows = filteredStudents.map((s, i) => [
            i + 1,
            ...orderedCustomColumns.map((c) => formatColumnValue(c, s)),
          ]);
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          ws['!cols'] = [{ wch: 6 }, ...orderedCustomColumns.map(() => ({ wch: 16 }))];
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

  const isLoading = settingsLoading || loading || feeLoading || ((reportType === 'tc-issued' || reportType === 'pc-issued') && tcLoading) || (reportType === 'not-admitted' && prevYearLoading);
  if (isLoading) return <PageSpinner />;

  const activeCount = reportType === 'tc-issued' ? tcRows.length
    : reportType === 'pc-issued' ? pcRows.length
    : filteredStudents.length;

  return (
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0">
        <div className="shrink-0">
          <h2 className="text-xl font-black text-gray-800 leading-tight tracking-tight">Student Reports</h2>
          {academicYear && reportType !== 'tc-issued' && reportType !== 'pc-issued' && reportType !== 'not-admitted' && (
            <p className="text-[10px] text-gray-400 leading-tight">{academicYear}</p>
          )}
          {(reportType === 'tc-issued' || reportType === 'pc-issued') && (
            <p className="text-[10px] text-gray-400 leading-tight">All Academic Years</p>
          )}
          {reportType === 'not-admitted' && (
            <p className="text-[10px] text-gray-400 leading-tight">
              {previousAcademicYear && academicYear ? `${previousAcademicYear} → ${academicYear}` : 'No previous academic year'}
            </p>
          )}
        </div>

        {/* Stats chips — SNQ Allotment & WhatsApp Numbers */}
        {reportType !== 'tc-issued' && reportType !== 'pc-issued' && reportType !== 'not-admitted' && !isLoading && stats.total > 0 && (
          <>
            <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">

              <div className="flex items-center gap-1 bg-white/80 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                <span className="text-emerald-500 font-semibold">Total</span>
                <span className="font-bold tabular-nums">{stats.total}</span>
              </div>

              <span className="text-emerald-200 text-xs select-none shrink-0">·</span>

              {YEARS.map((yr) => {
                const count  = stats.byYear[yr] ?? 0;
                const label  = yr === '1ST YEAR' ? '1st' : yr === '2ND YEAR' ? '2nd' : '3rd';
                const active = yearFilter === yr;
                return (
                  <button
                    key={yr}
                    onClick={() => setYearFilter(active ? '' : yr)}
                    className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                      active
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : count === 0
                        ? 'bg-white/50 border-gray-100 text-gray-300'
                        : 'bg-white/80 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    <span className={`font-semibold ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-600'}`}>{label}</span>
                    <span className={`font-bold tabular-nums ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-800'}`}>{count}</span>
                  </button>
                );
              })}

              <span className="text-emerald-200 text-xs select-none shrink-0">·</span>

              {COURSES.map((c) => {
                const count  = stats.byCourse[c] ?? 0;
                const active = courseFilter === c;
                return (
                  <button
                    key={c}
                    onClick={() => setCourseFilter(active ? '' : c)}
                    className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                      active
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : count === 0
                        ? 'bg-white/50 border-gray-100 text-gray-300'
                        : 'bg-white/80 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    <span className={`font-semibold ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-600'}`}>{c}</span>
                    <span className={`font-bold tabular-nums ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-800'}`}>{count}</span>
                  </button>
                );
              })}

              {hasActiveFilters && (
                <>
                  <span className="text-emerald-200 text-xs select-none shrink-0">·</span>
                  <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                    <span className="text-emerald-600 font-semibold">Filtered</span>
                    <span className="font-bold tabular-nums">{filteredStudents.length}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Stats chips — TC Issued List */}
        {reportType === 'tc-issued' && !isLoading && tcStats && tcStats.totalTCs > 0 && (
          <>
            <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">

              <div className="flex items-center gap-1 bg-white/80 border border-blue-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                <span className="text-blue-600 font-semibold">TCs Issued</span>
                <span className="font-bold tabular-nums">{tcStats.totalTCs}</span>
              </div>

              <span className="text-blue-200 text-xs select-none shrink-0">·</span>

              {COURSES.map((c) => {
                const count  = tcStats.byCourse[c] ?? 0;
                const active = courseFilter === c;
                return (
                  <button
                    key={c}
                    onClick={() => setCourseFilter(active ? '' : c)}
                    className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : count === 0
                        ? 'bg-white/50 border-gray-100 text-gray-300'
                        : 'bg-white/80 border-blue-100 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <span className={`font-semibold ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-600'}`}>{c}</span>
                    <span className={`font-bold tabular-nums ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-800'}`}>{count}</span>
                  </button>
                );
              })}

              {hasActiveFilters && (
                <>
                  <span className="text-blue-200 text-xs select-none shrink-0">·</span>
                  <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                    <span className="text-blue-600 font-semibold">Filtered</span>
                    <span className="font-bold tabular-nums">{tcRows.length}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Stats chips — PC Issued List */}
        {reportType === 'pc-issued' && !isLoading && pcStats && pcStats.totalPCs > 0 && (
          <>
            <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">

              <div className="flex items-center gap-1 bg-white/80 border border-violet-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                <span className="text-violet-600 font-semibold">PCs Issued</span>
                <span className="font-bold tabular-nums">{pcStats.totalPCs}</span>
              </div>

              <span className="text-violet-200 text-xs select-none shrink-0">·</span>

              {COURSES.map((c) => {
                const count  = pcStats.byCourse[c] ?? 0;
                const active = courseFilter === c;
                return (
                  <button
                    key={c}
                    onClick={() => setCourseFilter(active ? '' : c)}
                    className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                      active
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : count === 0
                        ? 'bg-white/50 border-gray-100 text-gray-300'
                        : 'bg-white/80 border-violet-100 hover:border-violet-300 hover:bg-violet-50'
                    }`}
                  >
                    <span className={`font-semibold ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-600'}`}>{c}</span>
                    <span className={`font-bold tabular-nums ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-800'}`}>{count}</span>
                  </button>
                );
              })}

              {hasActiveFilters && (
                <>
                  <span className="text-violet-200 text-xs select-none shrink-0">·</span>
                  <div className="flex items-center gap-1 bg-violet-50 border border-violet-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                    <span className="text-violet-600 font-semibold">Filtered</span>
                    <span className="font-bold tabular-nums">{pcRows.length}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Stats chips — Not Admitted List */}
        {reportType === 'not-admitted' && !isLoading && notAdmittedStats.total > 0 && (
          <>
            <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">

              <div className="flex items-center gap-1 bg-white/80 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                <span className="text-emerald-500 font-semibold">Total</span>
                <span className="font-bold tabular-nums">{notAdmittedStats.total}</span>
              </div>

              <span className="text-emerald-200 text-xs select-none shrink-0">·</span>

              {YEARS.map((yr) => {
                const count  = notAdmittedStats.byYear[yr] ?? 0;
                const label  = yr === '1ST YEAR' ? '1st' : yr === '2ND YEAR' ? '2nd' : '3rd';
                const active = yearFilter === yr;
                return (
                  <button
                    key={yr}
                    onClick={() => setYearFilter(active ? '' : yr)}
                    className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                      active
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : count === 0
                        ? 'bg-white/50 border-gray-100 text-gray-300'
                        : 'bg-white/80 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    <span className={`font-semibold ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-600'}`}>{label}</span>
                    <span className={`font-bold tabular-nums ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-800'}`}>{count}</span>
                  </button>
                );
              })}

              <span className="text-emerald-200 text-xs select-none shrink-0">·</span>

              {COURSES.map((c) => {
                const count  = notAdmittedStats.byCourse[c] ?? 0;
                const active = courseFilter === c;
                return (
                  <button
                    key={c}
                    onClick={() => setCourseFilter(active ? '' : c)}
                    className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                      active
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : count === 0
                        ? 'bg-white/50 border-gray-100 text-gray-300'
                        : 'bg-white/80 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    <span className={`font-semibold ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-600'}`}>{c}</span>
                    <span className={`font-bold tabular-nums ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-800'}`}>{count}</span>
                  </button>
                );
              })}

              {hasActiveFilters && (
                <>
                  <span className="text-emerald-200 text-xs select-none shrink-0">·</span>
                  <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                    <span className="text-emerald-600 font-semibold">Filtered</span>
                    <span className="font-bold tabular-nums">{notAdmittedSummaryPool.length}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Not Admitted summary — updates live with the active filters ─────── */}
      {reportType === 'not-admitted' && notAdmittedSummary && (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white/70 px-3 py-2 text-[12px] leading-snug text-gray-600">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            {notAdmittedSummary.admitted} Admitted
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
            {notAdmittedSummary.pending} Not Admitted
          </span>
          <span>
            <span className="font-bold text-emerald-600">{notAdmittedSummary.admitted}</span> of{' '}
            <span className="font-semibold text-gray-800">{notAdmittedSummary.total}</span>{' '}
            {notAdmittedSummary.desc && <>{notAdmittedSummary.desc} </>}
            students from <span className="font-semibold">{previousAcademicYear} (Last Year)</span> have admitted to{' '}
            <span className="font-semibold">{notAdmittedSummary.promoText}</span> in{' '}
            <span className="font-semibold">{academicYear} (Current Year)</span> —{' '}
            <span className="font-bold text-red-600">{notAdmittedSummary.pending}</span> still pending.
          </span>
        </div>
      )}

      {/* ── Filters panel ──────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 rounded-2xl border border-emerald-100 overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #f4fdf9 0%, #f8fafc 45%, #f0fdf6 100%)', boxShadow: '0 1px 4px 0 rgba(16,185,129,0.08)' }}
      >
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">

          {/* Report type selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap select-none">Report</span>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 cursor-pointer"
            >
              {REPORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <span className="text-gray-200 text-sm select-none shrink-0">|</span>

          {/* TC Year filter — only for TC Issued List */}
          {reportType === 'tc-issued' && (
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap select-none">TC Year</span>
                <select
                  value={tcYearFilter}
                  onChange={(e) => setTcYearFilter(e.target.value)}
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 cursor-pointer"
                >
                  <option value="ALL">All Academic Years</option>
                  {[...ACADEMIC_YEARS].reverse().map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
              <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            </>
          )}

          {/* PC Year filter — only for PC Issued List */}
          {reportType === 'pc-issued' && (
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap select-none">PC Year</span>
                <select
                  value={pcYearFilter}
                  onChange={(e) => setPcYearFilter(e.target.value)}
                  className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400 cursor-pointer"
                >
                  <option value="ALL">All Academic Years</option>
                  {[...ACADEMIC_YEARS].reverse().map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
              <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            </>
          )}

          {/* Search — rounded-full with icon + amber clear, matching Students page */}
          <div className="relative shrink-0 w-56">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder={reportType === 'tc-issued' ? 'Search name / reg / TC no…' : reportType === 'pc-issued' ? 'Search name / reg / exam period…' : 'Search name / reg / mobile…'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full rounded-full border border-emerald-300 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 bg-white shadow-sm text-gray-800 placeholder:text-gray-400 placeholder:font-normal transition-all duration-150 pl-8 ${searchTerm ? 'pr-8' : 'pr-3'}`}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-amber-400 hover:bg-amber-500 text-white transition-colors duration-150 shrink-0"
                aria-label="Clear search"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          {/* Standard dropdowns — FilterDropdown, matching Students page */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-px py-0.5">
            <FilterDropdown<Course | ''>
              value={courseFilter}
              onChange={(v) => setCourseFilter(v as Course | '')}
              placeholder="Course"
              options={COURSES.map((c) => ({ value: c, label: c }))}
            />
            <FilterDropdown<Year | ''>
              value={yearFilter}
              onChange={(v) => setYearFilter(v as Year | '')}
              placeholder="Study Yr"
              options={YEARS.map((yr) => ({ value: yr, label: yr }))}
            />
            <FilterDropdown<Gender | ''>
              value={genderFilter}
              onChange={(v) => setGenderFilter(v as Gender | '')}
              placeholder="Gender"
              options={[
                { value: 'BOY', label: 'BOY' },
                { value: 'GIRL', label: 'GIRL' },
              ]}
            />
            <FilterDropdown<Category | ''>
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
            <FilterDropdown<CategoryGroup | ''>
              value={categoryGroupFilter}
              onChange={(v) => setCategoryGroupFilter(v as CategoryGroup | '')}
              placeholder="Cat Group"
              options={[
                { value: 'GM', label: CATEGORY_GROUP_LABELS.GM },
                { value: 'OBC', label: CATEGORY_GROUP_LABELS.OBC },
                { value: 'SC_ST', label: CATEGORY_GROUP_LABELS.SC_ST },
              ]}
            />
            <FilterDropdown<AdmType | ''>
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
            <FilterDropdown<AdmCat | ''>
              value={admCatFilter}
              onChange={(v) => setAdmCatFilter(v as AdmCat | '')}
              placeholder="Adm Cat"
              options={[
                { value: 'GM', label: 'GM' },
                { value: 'SNQ', label: 'SNQ' },
                { value: 'OTHERS', label: 'OTHERS' },
              ]}
            />
            {reportType === 'not-admitted' && (
              <FilterDropdown<'ADMITTED' | 'NOT_ADMITTED'>
                value={notAdmittedStatusFilter}
                onChange={(v) => setNotAdmittedStatusFilter(v)}
                placeholder="Status"
                options={[
                  { value: 'ADMITTED', label: 'Admitted' },
                  { value: 'NOT_ADMITTED', label: 'Not Admitted' },
                ]}
              />
            )}
          </div>

          {/* Date range — only relevant for SNQ Allotment (fee paid date) */}
          {reportType === 'snq-allotment' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Fee Paid Date</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 bg-white/80 text-gray-700 cursor-pointer"
              />
              <span className="text-gray-300 text-xs">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 bg-white/80 text-gray-700 cursor-pointer"
              />
            </div>
          )}

          {/* Column picker + sort — only for Custom Report */}
          {reportType === 'custom' && (
            <>
              <ColumnPickerDropdown
                columns={STUDENT_COLUMNS}
                selected={customColumns}
                onChange={setCustomColumns}
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Sort by</span>
                {sortLevels.map((level, idx) => {
                  const prevChosen = idx === 0 || !!sortLevels[idx - 1].field;
                  const usedByOthers = sortLevels.filter((_, i) => i !== idx).map((l) => l.field);
                  return (
                    <div key={idx} className="flex items-center gap-1.5">
                      {idx > 0 && <span className="text-[10px] text-gray-400 whitespace-nowrap">then</span>}
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
            </>
          )}

          {/* Action buttons */}
          {hasActiveFilters && (
            <>
              <span className="w-px h-5 bg-emerald-200 shrink-0" />
              <button
                onClick={clearFilters}
                className="shrink-0 rounded-full border border-amber-300 px-2.5 py-1 text-[12px] text-amber-700 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer transition-colors font-semibold whitespace-nowrap"
              >
                Clear
              </button>
            </>
          )}

          {activeCount > 0 && (reportType !== 'custom' || orderedCustomColumns.length > 0) && (
            <>
              <button
                onClick={handleExportPdf}
                disabled={savingPdf}
                className="shrink-0 rounded-full border border-emerald-200 px-2.5 py-1 text-[12px] text-emerald-700 bg-white hover:bg-emerald-50 hover:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {savingPdf ? 'Generating…' : 'Save PDF'}
              </button>

              {isAdmin && (
                <button
                  onClick={handleExportExcel}
                  disabled={savingExcel}
                  className="shrink-0 rounded-full border border-emerald-200 px-2.5 py-1 text-[12px] text-emerald-700 bg-white hover:bg-emerald-50 hover:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {savingExcel ? 'Exporting…' : 'Export Excel'}
                </button>
              )}
            </>
          )}

          {reportType === 'custom' && orderedCustomColumns.length === 0 && (
            <span className="text-[11px] text-amber-600 font-medium shrink-0">Select at least one column to preview/export.</span>
          )}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {tcError && (reportType === 'tc-issued' || reportType === 'pc-issued') ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">{tcError}</div>
      ) : error && reportType !== 'tc-issued' && reportType !== 'pc-issued' ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>
      ) : reportType === 'tc-issued' ? (
        tcRows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            No TC records found{hasActiveFilters ? ' for the selected filters.' : ' across all academic years.'}
          </div>
        ) : (
          /* ── TC Issued List table ──────────────────────────────────────── */
          <div
            className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-blue-100 overflow-auto flex flex-col"
            style={{ boxShadow: '0 1px 4px 0 rgba(29,78,216,0.06)' }}
          >
            <table className="min-w-full divide-y divide-blue-50 text-xs">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: 'linear-gradient(90deg, #eff6ff, #dbeafe)' }}>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-9 border-b border-blue-200">#</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap border-b border-blue-200">Student Name</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-14 border-b border-blue-200">Course</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-24 border-b border-blue-200">Reg No</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-blue-200">TC Number</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-blue-200">Date of Leaving</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-blue-200">Semester</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-blue-200">Result</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-20 border-b border-blue-200">TC Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50/60">
                {tcRows.map((r, idx) => (
                  <tr
                    key={`${r.studentId}-${r.tcId}`}
                    onDoubleClick={() => { setTcClearModal(r); setTcClearModalMsg(''); setTcClearPasskey(''); setTcClearPasskeyError(''); }}
                    onContextMenu={(e) => { e.preventDefault(); setTcPreviewRow(r); }}
                    title="Double-click to clear TC history · Right-click to preview"
                    className={`transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : ''} hover:bg-blue-50/40 cursor-pointer`}
                  >
                    <td className="px-3 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                      {r.studentName}
                      {r.isDuplicate && (
                        <span className="ml-1.5 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-700 leading-none">
                          DUP
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap">{r.course}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{r.regNumber || '—'}</td>
                    <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap tabular-nums">{r.tcNumber}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.dateOfLeaving || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.semester || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.result || '—'}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {r.tcAcademicYear ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 border border-blue-100 text-blue-700">
                          {r.tcAcademicYear}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-blue-50 text-xs text-gray-500 mt-auto flex items-center justify-between gap-3">
              <span>
                Showing {tcRows.length} TC record{tcRows.length !== 1 ? 's' : ''}
                {hasActiveFilters && tcStats && tcStats.totalTCs > 0 && tcRows.length < tcStats.totalTCs && (
                  <span className="text-gray-400"> (filtered from {tcStats.totalTCs} total)</span>
                )}
              </span>
              <div className="flex items-center gap-3">
                {tcClearModalMsg && (
                  <span className="text-green-600 font-medium">{tcClearModalMsg}</span>
                )}
                {tcRows.length > 0 && (
                  <span className="text-gray-300 select-none">Right-click to preview · Double-click to clear TC history</span>
                )}
              </div>
            </div>
          </div>
        )
      ) : reportType === 'pc-issued' ? (
        pcRows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            No PC records found{hasActiveFilters ? ' for the selected filters.' : ' across all academic years.'}
          </div>
        ) : (
          /* ── PC Issued List table ──────────────────────────────────────── */
          <div
            className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-violet-100 overflow-auto flex flex-col"
            style={{ boxShadow: '0 1px 4px 0 rgba(109,40,217,0.06)' }}
          >
            <table className="min-w-full divide-y divide-violet-50 text-xs">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: 'linear-gradient(90deg, #f5f3ff, #ede9fe)' }}>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-9 border-b border-violet-200">#</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap border-b border-violet-200">Student Name</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-14 border-b border-violet-200">Course</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-24 border-b border-violet-200">Reg No</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-36 border-b border-violet-200">Exam Period</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-32 border-b border-violet-200">Result Class</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-violet-200">Date of Issue</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-20 border-b border-violet-200">PC Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-50/60">
                {pcRows.map((r, idx) => (
                  <tr
                    key={`${r.studentId}-${r.pcId}`}
                    onDoubleClick={() => { setPcClearModal(r); setPcClearModalMsg(''); setPcClearPasskey(''); setPcClearPasskeyError(''); }}
                    title="Double-click to clear PC history"
                    className={`transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : ''} hover:bg-violet-50/40 cursor-pointer`}
                  >
                    <td className="px-3 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                      {r.studentName}
                      {r.isDuplicate && (
                        <span className="ml-1.5 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-700 leading-none">
                          DUP
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap">{r.course}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{r.regNumber || '—'}</td>
                    <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">{r.examPeriod || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.resultClass || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.dateOfIssue || '—'}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {r.pcAcademicYear ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 border border-violet-100 text-violet-700">
                          {r.pcAcademicYear}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-violet-50 text-xs text-gray-500 mt-auto flex items-center justify-between gap-3">
              <span>
                Showing {pcRows.length} PC record{pcRows.length !== 1 ? 's' : ''}
                {hasActiveFilters && pcStats && pcStats.totalPCs > 0 && pcRows.length < pcStats.totalPCs && (
                  <span className="text-gray-400"> (filtered from {pcStats.totalPCs} total)</span>
                )}
              </span>
              <div className="flex items-center gap-3">
                {pcClearModalMsg && (
                  <span className="text-green-600 font-medium">{pcClearModalMsg}</span>
                )}
                {pcRows.length > 0 && (
                  <span className="text-gray-300 select-none">Double-click a row to clear PC history</span>
                )}
              </div>
            </div>
          </div>
        )
      ) : !academicYear ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Please configure an academic year in Settings first.
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          No students found{hasActiveFilters ? ' for the selected filters.' : '.'}
        </div>
      ) : reportType === 'snq-allotment' ? (
        /* ── SNQ Allotment table ─────────────────────────────────────────── */
        <div
          className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-emerald-100 overflow-auto flex flex-col"
          style={{ boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}
        >
          <table className="min-w-full divide-y divide-emerald-50 text-xs">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'linear-gradient(90deg, #fffbeb, #fefce8)' }}>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-9 border-b border-yellow-200">#</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap border-b border-yellow-200">Name (SSLC)</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap border-b border-yellow-200">Father Name</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-14 border-b border-yellow-200">Gender</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-16 border-b border-yellow-200">Category</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-14 border-b border-yellow-200">Course</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-yellow-200">Student Mob</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-yellow-200">Father Mob</th>
                <th className="px-3 py-2 text-right font-bold text-gray-700 whitespace-nowrap w-20 border-b border-yellow-200">SSLC Total</th>
                <th className="px-3 py-2 text-right font-bold text-gray-700 whitespace-nowrap w-20 border-b border-yellow-200">Income</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-24 border-b border-yellow-200">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50/60">
              {visibleStudents.map((s, idx) => (
                <tr
                  key={s.id}
                  className={`transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : ''} hover:bg-yellow-50/50`}
                >
                  <td className="px-3 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.studentNameSSLC}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.fatherName}</td>
                  <td className="px-3 py-2 text-center text-gray-700 whitespace-nowrap">
                    {s.gender === 'BOY' ? 'B' : 'G'}
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 border border-emerald-100 text-emerald-700">
                      {s.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-700 font-medium whitespace-nowrap">{s.course}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{s.studentMobile || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{s.fatherMobile || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-700 font-medium whitespace-nowrap tabular-nums">
                    {s.sslcObtainedTotal ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap tabular-nums">
                    {s.annualIncome ? s.annualIncome.toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap"></td>
                </tr>
              ))}
              {hasMore && (
                <tr>
                  <td colSpan={11} className="px-3 py-2 text-center border-t border-emerald-100/50">
                    <button
                      className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline font-medium"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load more ({filteredStudents.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-emerald-50 text-xs text-gray-500 mt-auto">
            Showing {Math.min(visibleCount, filteredStudents.length)} of {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
            {hasActiveFilters && stats.total > 0 && filteredStudents.length < stats.total && (
              <span className="text-gray-400"> (filtered from {stats.total} total)</span>
            )}
          </div>
        </div>
      ) : reportType === 'student-list' ? (
        /* ── Student List table ──────────────────────────────────────────── */
        <div
          className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-emerald-100 overflow-auto flex flex-col"
          style={{ boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}
        >
          <table className="min-w-full divide-y divide-emerald-50 text-xs">
            <thead className="sticky top-0 z-10" style={{ background: 'linear-gradient(90deg, #ecfdf5, #f0f9ff)' }}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-8">#</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Name (SSLC)</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-24">Reg No</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-14">Course</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-20">Year</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-14">Gender</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-14">Category</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-20">Adm Type</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-16">Adm Cat</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-20">Allotted Cat</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-28">Mobile</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-24">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50/60">
              {visibleStudents.map((s, idx) => (
                <tr
                  key={s.id}
                  className={`transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : ''} hover:bg-emerald-50/50`}
                >
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.studentNameSSLC}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{s.regNumber || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.course}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.year}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.gender}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.category || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.admType || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.admCat || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {s.allottedCategory ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                        s.allottedCategory !== s.category
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600'
                      }`}>
                        {s.allottedCategory}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{s.studentMobile || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.admissionStatus === 'CONFIRMED'
                        ? 'bg-green-100 text-green-700'
                        : s.admissionStatus === 'CANCELLED'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {s.admissionStatus || '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {hasMore && (
                <tr>
                  <td colSpan={12} className="px-3 py-2 text-center border-t border-emerald-100/50">
                    <button
                      className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline font-medium"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load more ({filteredStudents.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-emerald-50 text-xs text-gray-500 mt-auto">
            Showing {Math.min(visibleCount, filteredStudents.length)} of {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
            {hasActiveFilters && stats.total > 0 && filteredStudents.length < stats.total && (
              <span className="text-gray-400"> (filtered from {stats.total} total)</span>
            )}
          </div>
        </div>
      ) : reportType === 'whatsapp-numbers' ? (
        /* ── Whatsapp Numbers table ──────────────────────────────────────── */
        <div
          className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-green-100 overflow-auto flex flex-col"
          style={{ boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}
        >
          <table className="min-w-full divide-y divide-green-50 text-xs">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'linear-gradient(90deg, #f0fdf4, #dcfce7)' }}>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-9 border-b border-green-200">#</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap border-b border-green-200">Student Name</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-green-200">Year</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-14 border-b border-green-200">Course</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-32 border-b border-green-200">Father Mobile</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-32 border-b border-green-200">Student Mobile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-green-50/60">
              {visibleStudents.map((s, idx) => (
                <tr
                  key={s.id}
                  className={`transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : ''} hover:bg-green-50/50`}
                >
                  <td className="px-3 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.studentNameSSLC}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-[11px]">{s.year}</td>
                  <td className="px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap">{s.course}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap tabular-nums font-mono">{s.fatherMobile || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap tabular-nums font-mono">{s.studentMobile || <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
              {hasMore && (
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-center border-t border-green-100/50">
                    <button
                      className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline font-medium"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load more ({filteredStudents.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-green-50 text-xs text-gray-500 mt-auto">
            Showing {Math.min(visibleCount, filteredStudents.length)} of {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
            {hasActiveFilters && stats.total > 0 && filteredStudents.length < stats.total && (
              <span className="text-gray-400"> (filtered from {stats.total} total)</span>
            )}
          </div>
        </div>
      ) : reportType === 'not-admitted' ? (
        !previousAcademicYear ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            No previous academic year exists to compare against.
          </div>
        ) : (
          /* ── Not Admitted List table ───────────────────────────────────── */
          <div
            className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-red-100 overflow-auto flex flex-col"
            style={{ boxShadow: '0 1px 4px 0 rgba(185,28,28,0.06)' }}
          >
            <table className="min-w-full divide-y divide-red-50 text-xs">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: 'linear-gradient(90deg, #fef2f2, #fee2e2)' }}>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-9 border-b border-red-200">#</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap border-b border-red-200">Student Name</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-24 border-b border-red-200">Reg No</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-24 border-b border-red-200">Previous Year</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-24 border-b border-red-200">Current Year</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-14 border-b border-red-200">Course</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-12 border-b border-red-200">Cat</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-20 border-b border-red-200">Adm Type</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-16 border-b border-red-200">Adm Cat</th>
                  <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-32 border-b border-red-200">Mobile No</th>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-24 border-b border-red-200">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-50/60">
                {visibleStudents.map((s, idx) => {
                  const status = notAdmittedStatusMap.get(s.id);
                  const admitted = status === 'ADMITTED';
                  return (
                    <tr
                      key={s.id}
                      className={`transition-colors ${admitted ? 'bg-emerald-50/70 hover:bg-emerald-100/60' : 'bg-red-50/70 hover:bg-red-100/60'}`}
                    >
                      <td className="px-3 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.studentNameSSLC}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{s.regNumber || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-[11px]">{s.year}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-[11px]">{notAdmittedCurrentYearMap.get(s.id) ?? '—'}</td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap">{s.course}</td>
                      <td className="px-3 py-2 text-center text-gray-600 whitespace-nowrap">{s.category || '—'}</td>
                      <td className="px-3 py-2 text-center text-gray-600 whitespace-nowrap text-[11px]">{s.admType || '—'}</td>
                      <td className="px-3 py-2 text-center text-gray-600 whitespace-nowrap text-[11px]">{s.admCat || '—'}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap tabular-nums font-mono">{s.studentMobile || s.fatherMobile || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          admitted
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-red-100 text-red-700 border border-red-200'
                        }`}>
                          {admitted ? 'Admitted' : 'Not Admitted'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {hasMore && (
                  <tr>
                    <td colSpan={11} className="px-3 py-2 text-center border-t border-red-100/50">
                      <button
                        className="text-xs text-red-600 hover:text-red-800 hover:underline font-medium"
                        onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      >
                        Load more ({filteredStudents.length - visibleCount} remaining)
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-red-50 text-xs text-gray-500 mt-auto">
              Showing {Math.min(visibleCount, filteredStudents.length)} of {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
              {hasActiveFilters && notAdmittedBase.length > 0 && filteredStudents.length < notAdmittedBase.length && (
                <span className="text-gray-400"> (filtered from {notAdmittedBase.length} total)</span>
              )}
            </div>
          </div>
        )
      ) : reportType === 'custom' ? (
        orderedCustomColumns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Select at least one column above to preview the report.
          </div>
        ) : (
          /* ── Custom Report table ───────────────────────────────────────── */
          <div
            className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-violet-100 overflow-auto flex flex-col"
            style={{ boxShadow: '0 1px 4px 0 rgba(109,40,217,0.06)' }}
          >
            <table className="min-w-full divide-y divide-violet-50 text-xs">
              <thead className="sticky top-0 z-10">
                <tr style={{ background: 'linear-gradient(90deg, #f5f3ff, #ede9fe)' }}>
                  <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-9 border-b border-violet-200">#</th>
                  {orderedCustomColumns.map((c) => (
                    <th
                      key={c.key}
                      className={`px-3 py-2 font-bold text-gray-700 whitespace-nowrap border-b border-violet-200 ${ALIGN_CLASS[c.align]}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-50/60">
                {visibleStudents.map((s, idx) => (
                  <tr
                    key={s.id}
                    className={`transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : ''} hover:bg-violet-50/40`}
                  >
                    <td className="px-3 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                    {orderedCustomColumns.map((c) => (
                      <td key={c.key} className={`px-3 py-2 text-gray-700 whitespace-nowrap ${ALIGN_CLASS[c.align]}`}>
                        {formatColumnValue(c, s)}
                      </td>
                    ))}
                  </tr>
                ))}
                {hasMore && (
                  <tr>
                    <td colSpan={orderedCustomColumns.length + 1} className="px-3 py-2 text-center border-t border-violet-100/50">
                      <button
                        className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline font-medium"
                        onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      >
                        Load more ({filteredStudents.length - visibleCount} remaining)
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-violet-50 text-xs text-gray-500 mt-auto">
              Showing {Math.min(visibleCount, filteredStudents.length)} of {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
              {hasActiveFilters && stats.total > 0 && filteredStudents.length < stats.total && (
                <span className="text-gray-400"> (filtered from {stats.total} total)</span>
              )}
            </div>
          </div>
        )
      ) : (
        /* ── Allotted Category table ─────────────────────────────────────── */
        <div
          className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-indigo-100 overflow-auto flex flex-col"
          style={{ boxShadow: '0 1px 4px 0 rgba(99,102,241,0.06)' }}
        >
          <table className="min-w-full divide-y divide-indigo-50 text-xs">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'linear-gradient(90deg, #eef2ff, #e0e7ff)' }}>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-9 border-b border-indigo-200">#</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap border-b border-indigo-200">Student Name</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-indigo-200">Year</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-16 border-b border-indigo-200">Course</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-24 border-b border-indigo-200">Reg No</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-16 border-b border-indigo-200">Category</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-20 border-b border-indigo-200">Adm Cat</th>
                <th className="px-3 py-2 text-center font-bold text-indigo-700 whitespace-nowrap w-28 border-b border-indigo-300">Allotted Cat</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-24 border-b border-indigo-200">Adm Type</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-indigo-200">Student Mob</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-indigo-200">Father Mob</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-50/60">
              {visibleStudents.map((s, idx) => (
                <tr
                  key={s.id}
                  className={`transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : ''} hover:bg-indigo-50/40`}
                >
                  <td className="px-3 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.studentNameSSLC}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-[11px]">{s.year}</td>
                  <td className="px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap">{s.course}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{s.regNumber || '—'}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 border border-emerald-100 text-emerald-700">
                      {s.category || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 border border-sky-200 text-sky-700">
                      {s.admCat || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">
                      {s.allottedCategory || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600 whitespace-nowrap text-[11px]">{s.admType || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{s.studentMobile || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{s.fatherMobile || '—'}</td>
                </tr>
              ))}
              {hasMore && (
                <tr>
                  <td colSpan={11} className="px-3 py-2 text-center border-t border-indigo-100/50">
                    <button
                      className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline font-medium"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load more ({filteredStudents.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-indigo-50 text-xs text-gray-500 mt-auto">
            Showing {Math.min(visibleCount, filteredStudents.length)} of {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
            {hasActiveFilters && stats.total > 0 && filteredStudents.length < stats.total && (
              <span className="text-gray-400"> (filtered from {stats.total} total)</span>
            )}
          </div>
        </div>
      )}

      {/* ── PC Clear Modal (double-click on PC row) ─────────────────────── */}
      {pcClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !pcClearModalClearing && (setPcClearModal(null), setPcClearPasskey(''), setPcClearPasskeyError(''))}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-red-100 bg-red-50/60">
              <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider">Clear PC History</h3>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                <p className="text-sm font-semibold text-gray-800">{pcClearModal.studentName}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {pcClearModal.regNumber || '—'} · {pcClearModal.course} · {pcClearModal.year} · {pcClearModal.enrollmentYear}
                </p>
              </div>

              <p className="text-sm text-gray-600">
                This will permanently erase{' '}
                <span className="font-semibold text-red-600">all PC records</span> for this student.
                The action cannot be undone.
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Passkey</label>
                <input
                  type="password"
                  value={pcClearPasskey}
                  onChange={(e) => { setPcClearPasskey(e.target.value); setPcClearPasskeyError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { void handlePcClearFromModal(); } }}
                  placeholder="Enter passkey"
                  autoFocus
                  autoComplete="new-password"
                  className={`block w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 ${pcClearPasskeyError ? 'border-red-400' : 'border-gray-300'}`}
                />
                {pcClearPasskeyError && (
                  <p className="text-xs text-red-600 mt-1">{pcClearPasskeyError}</p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => { setPcClearModal(null); setPcClearPasskey(''); setPcClearPasskeyError(''); }}
                disabled={pcClearModalClearing}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handlePcClearFromModal(); }}
                disabled={pcClearModalClearing}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 font-semibold cursor-pointer"
              >
                {pcClearModalClearing ? 'Clearing…' : 'Yes, Clear History'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TC Clear Modal (double-click on TC row) ─────────────────────── */}
      {tcClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !tcClearModalClearing && (setTcClearModal(null), setTcClearPasskey(''), setTcClearPasskeyError(''))}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-red-100 bg-red-50/60">
              <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider">Clear TC History</h3>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                <p className="text-sm font-semibold text-gray-800">{tcClearModal.studentName}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {tcClearModal.regNumber || '—'} · {tcClearModal.course} · {tcClearModal.year} · {tcClearModal.enrollmentYear}
                </p>
              </div>

              <p className="text-sm text-gray-600">
                This will permanently erase{' '}
                <span className="font-semibold text-red-600">all TC records</span> for this student.
                The action cannot be undone.
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Passkey</label>
                <input
                  type="password"
                  value={tcClearPasskey}
                  onChange={(e) => { setTcClearPasskey(e.target.value); setTcClearPasskeyError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { void handleTcClearFromModal(); } }}
                  placeholder="Enter passkey"
                  autoFocus
                  autoComplete="new-password"
                  className={`block w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 ${tcClearPasskeyError ? 'border-red-400' : 'border-gray-300'}`}
                />
                {tcClearPasskeyError && (
                  <p className="text-xs text-red-600 mt-1">{tcClearPasskeyError}</p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => { setTcClearModal(null); setTcClearPasskey(''); setTcClearPasskeyError(''); }}
                disabled={tcClearModalClearing}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleTcClearFromModal(); }}
                disabled={tcClearModalClearing}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 font-semibold cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ animation: 'backdrop-enter 0.18s ease-out' }}
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setTcPreviewRow(null)} />
          <div
            className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '860px', maxWidth: '100%', maxHeight: 'calc(100vh - 3rem)', animation: 'modal-enter 0.22s ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-slate-700 to-slate-900 flex items-center justify-between shrink-0">
              <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polyline points="6 9 6 2 18 2 18 9"/>
                      <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                      <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                  </span>
                  TC Preview — {tcPreviewRow.tcNumber}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 truncate max-w-xs">
                  {tcPreviewRow.studentName}
                </span>
                {tcPreviewRow.isDuplicate && (
                  <span className="inline-flex items-center rounded-full text-[10px] font-semibold px-2 py-0.5 bg-amber-500/30 text-amber-100 border border-amber-400/30 shrink-0">
                    Duplicate Copy
                  </span>
                )}
              </div>
              <button
                onClick={() => setTcPreviewRow(null)}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 ml-3"
              >
                ×
              </button>
            </div>

            {/* Info banner */}
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 shrink-0">
              <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span className="text-xs text-blue-700">
                Read-only preview reconstructed from the issued record. This does not print or save.
              </span>
            </div>

            {/* Preview iframe */}
            <div className="flex-1 overflow-auto min-h-0 bg-slate-300">
              {tcPreviewHtml ? (
                <iframe
                  srcDoc={tcPreviewHtml}
                  title="Transfer Certificate Preview"
                  className="w-full border-0 block"
                  style={{ height: '1100px' }}
                />
              ) : (
                <div className="flex items-center justify-center h-40 text-sm text-gray-500">
                  Unable to load student record for this TC.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0 flex items-center justify-end">
              <button
                onClick={() => setTcPreviewRow(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
