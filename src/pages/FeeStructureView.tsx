import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { AcademicYear, FeeStructure, Course, Year } from '../types';
import { SMP_FEE_HEADS, ACADEMIC_YEARS } from '../types';
import { getSettings } from '../services/settingsService';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { exportFeeStructureFormatted, exportFeeStructureFormattedPDF } from '../utils/feeStructureExport';

// ── Constants ──────────────────────────────────────────────────────────────

const SMP_HEAD_FULL: Record<string, string> = {
  adm:     'Admission',
  tuition: 'Tuition',
  lib:     'Library',
  rr:      'Reading Room',
  sports:  'Sports',
  lab:     'Lab',
  dvp:     'DVP',
  mag:     'Magazine',
  idCard:  'ID Card',
  ass:     'Association',
  swf:     'SWF',
  twf:     'TWF',
  nss:     'NSS',
  fine:    'Fine',
};

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[]   = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const ADM_TYPES       = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL'];
const ADM_CATS        = ['GM', 'SNQ', 'OTHERS'];

// Body sticky columns (left-pinned only)
const stickyBase   = 'sticky left-0 z-[1]';
const stickySecond = 'sticky left-[72px] z-[1]';
const stickyThird  = 'sticky left-[144px] z-[1]';
const stickyFourth = 'sticky left-[212px] z-[1]';

// Header sticky columns (left-pinned + top-pinned — highest z so they sit above everything)
const stickyHBase   = 'sticky left-0 top-0 z-[4]';
const stickyHSecond = 'sticky left-[72px] top-0 z-[4]';
const stickyHThird  = 'sticky left-[144px] top-0 z-[4]';
const stickyHFourth = 'sticky left-[212px] top-0 z-[4]';

// Plain header cells (top-pinned only)
// Row 1 height is ~30px (py-1.5 group headers); row 2 offset matches that
const hRow1 = 'sticky top-0 z-[2]';
const hRow2 = 'sticky top-[30px] z-[2]';

// ── Helpers ────────────────────────────────────────────────────────────────

function smpTotal(s: FeeStructure) {
  return SMP_FEE_HEADS.reduce((sum, { key }) => sum + (s.smp[key] ?? 0), 0);
}
function additionalTotal(s: FeeStructure) {
  return s.additionalHeads.reduce((sum, h) => sum + h.amount, 0);
}
function r(n: number) { return n === 0 ? 0 : n; }
function fmtCell(n: number) {
  return n === 0
    ? <span className="text-gray-300">—</span>
    : <span>₹{n.toLocaleString('en-IN')}</span>;
}
// ── Export: Excel ──────────────────────────────────────────────────────────

function exportExcel(
  rows: FeeStructure[],
  additionalLabels: string[],
  academicYear: string,
) {
  const header = [
    'Course', 'Year', 'Adm Type', 'Cat',
    ...SMP_FEE_HEADS.map(({ key }) => SMP_HEAD_FULL[key] ?? key),
    'SMP Total',
    'SVK Mgmt Fee',
    ...additionalLabels,
    ...(additionalLabels.length > 0 ? ['Additional Total'] : []),
    'Grand Total',
  ];

  const data = rows.map((s) => {
    const smpSum = smpTotal(s);
    const addSum = additionalTotal(s);
    return [
      s.course, s.year, s.admType, s.admCat,
      ...SMP_FEE_HEADS.map(({ key }) => r(s.smp[key] ?? 0)),
      r(smpSum),
      r(s.svk),
      ...additionalLabels.map((lbl) => {
        const h = s.additionalHeads.find((x) => x.label === lbl);
        return r(h?.amount ?? 0);
      }),
      ...(additionalLabels.length > 0 ? [r(addSum)] : []),
      r(smpSum + s.svk + addSum),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee Structure');
  XLSX.writeFile(wb, `Fee_Structure_${academicYear}.xlsx`);
}

// ── Component ──────────────────────────────────────────────────────────────

export function FeeStructureView() {
  const [selectedYear, setSelectedYear] = useState<AcademicYear | null>(null);
  const [structures, setStructures]     = useState<FeeStructure[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [showSmpBreakup, setShowSmpBreakup] = useState(false);
  const [courseFilter, setCourseFilter]     = useState('');
  const [yearFilter, setYearFilter]         = useState('');
  const [admTypeFilter, setAdmTypeFilter]   = useState('');
  const [admCatFilter, setAdmCatFilter]     = useState('');

  // Load current academic year once
  useEffect(() => {
    getSettings()
      .then((s) => {
        if (s) setSelectedYear(s.currentAcademicYear);
        else setLoading(false);
      })
      .catch(() => { setError('Failed to load settings'); setLoading(false); });
  }, []);

  // Fetch structures when year changes
  useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    setError(null);
    getFeeStructuresByAcademicYear(selectedYear)
      .then((data) => {
        data.sort((a, b) => {
          if (a.course !== b.course) return a.course.localeCompare(b.course);
          if (a.year !== b.year) return a.year.localeCompare(b.year);
          if (a.admType !== b.admType) return a.admType.localeCompare(b.admType);
          return a.admCat.localeCompare(b.admCat);
        });
        setStructures(data);
      })
      .catch(() => setError('Failed to load fee structures'))
      .finally(() => setLoading(false));
  }, [selectedYear]);

  // Client-side filters
  const filteredStructures = useMemo(() => {
    return structures.filter((s) => {
      if (courseFilter  && s.course  !== courseFilter)  return false;
      if (yearFilter    && s.year    !== yearFilter)    return false;
      if (admTypeFilter && s.admType !== admTypeFilter) return false;
      if (admCatFilter  && s.admCat  !== admCatFilter)  return false;
      return true;
    });
  }, [structures, courseFilter, yearFilter, admTypeFilter, admCatFilter]);

  // Collect unique additional head labels from the filtered set
  const additionalLabels = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    filteredStructures.forEach((s) =>
      s.additionalHeads.forEach((h) => {
        if (!seen.has(h.label)) { seen.add(h.label); labels.push(h.label); }
      })
    );
    return labels;
  }, [filteredStructures]);

  const availableCourses = useMemo(
    () => [...new Set(structures.map((s) => s.course))].sort(),
    [structures],
  );

  const hasData   = !loading && !error && filteredStructures.length > 0;
  const totalRows = filteredStructures.length;

  return (
    <div className="px-6 pt-3 pb-6 space-y-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fee Structure</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Allotted fee amounts per course / year / admission type combination
          </p>
        </div>

        {/* Academic Year selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 whitespace-nowrap">Academic Year</label>
          <select
            value={selectedYear ?? ''}
            onChange={(e) => {
              setSelectedYear(e.target.value as AcademicYear);
              setCourseFilter(''); setYearFilter('');
              setAdmTypeFilter(''); setAdmCatFilter('');
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {ACADEMIC_YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Toolbar (filters + actions) ───────────────────────────────────── */}
      {!loading && !error && structures.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">

          {/* Course filter */}
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">All Courses</option>
            {COURSES.filter((c) => availableCourses.includes(c)).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Year filter */}
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">All Years</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Adm Type filter */}
          <select
            value={admTypeFilter}
            onChange={(e) => setAdmTypeFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">All Adm Types</option>
            {ADM_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Adm Cat filter */}
          <select
            value={admCatFilter}
            onChange={(e) => setAdmCatFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">All Adm Cats</option>
            {ADM_CATS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Clear filters */}
          {(courseFilter || yearFilter || admTypeFilter || admCatFilter) && (
            <button
              onClick={() => { setCourseFilter(''); setYearFilter(''); setAdmTypeFilter(''); setAdmCatFilter(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1.5"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Clear
            </button>
          )}

          <div className="flex-1" />

          {/* Toggle SMP breakup */}
          <button
            onClick={() => setShowSmpBreakup((v) => !v)}
            title={showSmpBreakup ? 'Hide Govt Fee Breakup' : 'Show Govt Fee Breakup'}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              showSmpBreakup
                ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {showSmpBreakup ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
                Hide Govt Breakup
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                Show Govt Breakup
              </>
            )}
          </button>

          {/* Export Excel */}
          {hasData && (
            <button
              onClick={() => exportExcel(filteredStructures, additionalLabels, selectedYear ?? '')}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>
              </svg>
              Excel
            </button>
          )}

          {/* Export PDF */}
          {hasData && (
            <button
              onClick={() => exportFeeStructureFormattedPDF(structures, selectedYear ?? '')}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>
              </svg>
              PDF
            </button>
          )}

          {/* Fee Structure Format */}
          {hasData && (
            <button
              onClick={() => exportFeeStructureFormatted(structures, selectedYear ?? '')}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
              </svg>
              Fee Structure Format
            </button>
          )}
        </div>
      )}

      {/* ── Loading / error / empty ───────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>
      ) : structures.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-2">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
          </svg>
          <span>No fee structures saved for <strong>{selectedYear}</strong></span>
          <span className="text-xs text-gray-300">Go to Settings → Fee Structure to add entries.</span>
        </div>
      ) : filteredStructures.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-1">
          <span>No combinations match the selected filters.</span>
          <button
            onClick={() => { setCourseFilter(''); setYearFilter(''); setAdmTypeFilter(''); setAdmCatFilter(''); }}
            className="text-xs text-emerald-600 underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {/* ── Legend + count ─────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            <span className="text-gray-400 font-medium">
              {totalRows} combination{totalRows !== 1 ? 's' : ''}
              {(courseFilter || yearFilter) && ` (filtered)`}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-200 inline-block" />
              <span className="text-gray-500">Govt Fee (SMP)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-purple-100 border border-purple-200 inline-block" />
              <span className="text-gray-500">SVK Mgmt Fee</span>
            </span>
            {additionalLabels.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-200 inline-block" />
                <span className="text-gray-500">Additional Fee</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 inline-block" />
              <span className="text-gray-500">Grand Total</span>
            </span>
          </div>

          {/* ── Table ──────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 255px)' }}>
              <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>

                <colgroup>
                  <col style={{ minWidth: 72 }} />
                  <col style={{ minWidth: 72 }} />
                  <col style={{ minWidth: 68 }} />
                  <col style={{ minWidth: 52 }} />
                  {showSmpBreakup && SMP_FEE_HEADS.map(({ key }) => (
                    <col key={key} style={{ minWidth: 72 }} />
                  ))}
                  <col style={{ minWidth: 80 }} />  {/* SMP Total */}
                  <col style={{ minWidth: 80 }} />  {/* SVK */}
                  {additionalLabels.map((l) => <col key={l} style={{ minWidth: 80 }} />)}
                  {additionalLabels.length > 0 && <col style={{ minWidth: 80 }} />}
                  <col style={{ minWidth: 90 }} />  {/* Grand Total */}
                </colgroup>

                <thead>
                  {/* ── Row 1: group headers ── */}
                  <tr className="border-b border-gray-200">
                    <th rowSpan={2} className={`${stickyHBase} bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap`}>Course</th>
                    <th rowSpan={2} className={`${stickyHSecond} bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap`}>Year</th>
                    <th rowSpan={2} className={`${stickyHThird} bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap`}>Adm Type</th>
                    <th rowSpan={2} className={`${stickyHFourth} bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap`}>Cat</th>

                    {/* SMP group header */}
                    {showSmpBreakup ? (
                      <th
                        colSpan={SMP_FEE_HEADS.length + 1}
                        className={`${hRow1} px-3 py-1.5 text-center font-semibold text-blue-700 bg-blue-50 border-r border-gray-200`}
                      >
                        Govt Fee (SMP)
                      </th>
                    ) : (
                      <th
                        rowSpan={2}
                        className={`${hRow1} px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 border-r border-gray-200 whitespace-nowrap`}
                      >
                        Govt Fee (SMP)
                      </th>
                    )}

                    {/* SVK */}
                    <th rowSpan={2} className={`${hRow1} px-3 py-2 text-center font-semibold text-purple-700 bg-purple-50 border-r border-gray-200 whitespace-nowrap`}>
                      SVK Mgmt Fee
                    </th>

                    {/* Additional group */}
                    {additionalLabels.length > 0 && (
                      <th
                        colSpan={additionalLabels.length + 1}
                        className={`${hRow1} px-3 py-1.5 text-center font-semibold text-amber-700 bg-amber-50 border-r border-gray-200`}
                      >
                        Additional Fee
                      </th>
                    )}

                    {/* Grand Total */}
                    <th rowSpan={2} className={`${hRow1} px-3 py-2 text-center font-semibold text-emerald-700 bg-emerald-50 whitespace-nowrap`}>
                      Grand Total
                    </th>
                  </tr>

                  {/* ── Row 2: sub-headers ── */}
                  <tr className="border-b-2 border-gray-200">
                    {/* SMP individual heads — only when breakup visible */}
                    {showSmpBreakup && SMP_FEE_HEADS.map(({ key }) => (
                      <th
                        key={key}
                        title={SMP_HEAD_FULL[key]}
                        className={`${hRow2} px-2 py-1.5 text-center font-medium text-blue-600 bg-blue-50 whitespace-nowrap border-r border-blue-100`}
                      >
                        {SMP_HEAD_FULL[key] ?? key}
                      </th>
                    ))}
                    {showSmpBreakup && (
                      <th className={`${hRow2} px-2 py-1.5 text-center font-bold text-blue-700 bg-blue-100 border-r border-gray-200 whitespace-nowrap`}>
                        SMP Total
                      </th>
                    )}

                    {/* Additional sub-headers */}
                    {additionalLabels.map((label) => (
                      <th
                        key={label}
                        className={`${hRow2} px-2 py-1.5 text-center font-medium text-amber-600 bg-amber-50 whitespace-nowrap border-r border-amber-100`}
                      >
                        {label}
                      </th>
                    ))}
                    {additionalLabels.length > 0 && (
                      <th className={`${hRow2} px-2 py-1.5 text-center font-bold text-amber-700 bg-amber-100 border-r border-gray-200 whitespace-nowrap`}>
                        Addl. Total
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {filteredStructures.map((s, idx) => {
                    const smpSum = smpTotal(s);
                    const addSum = additionalTotal(s);
                    const total  = smpSum + s.svk + addSum;
                    const rowBg  = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';

                    return (
                      <tr key={s.id} className={`${rowBg} hover:bg-emerald-50/40 transition-colors`}>
                        <td className={`${stickyBase} ${rowBg} px-3 py-2.5 font-semibold text-gray-900 border-r border-gray-100 whitespace-nowrap`}>{s.course}</td>
                        <td className={`${stickySecond} ${rowBg} px-3 py-2.5 text-gray-600 border-r border-gray-100 whitespace-nowrap`}>{s.year}</td>
                        <td className={`${stickyThird} ${rowBg} px-3 py-2.5 text-gray-600 border-r border-gray-100 whitespace-nowrap`}>{s.admType}</td>
                        <td className={`${stickyFourth} ${rowBg} px-3 py-2.5 text-gray-600 border-r border-gray-100 whitespace-nowrap`}>{s.admCat}</td>

                        {/* SMP individual head cells */}
                        {showSmpBreakup && SMP_FEE_HEADS.map(({ key }) => (
                          <td key={key} className="px-2 py-2.5 text-right text-gray-700 border-r border-gray-100 whitespace-nowrap bg-blue-50/30">
                            {fmtCell(s.smp[key] ?? 0)}
                          </td>
                        ))}

                        {/* SMP total */}
                        <td className="px-3 py-2.5 text-right font-bold text-blue-700 bg-blue-50 border-r border-gray-200 whitespace-nowrap">
                          ₹{smpSum.toLocaleString('en-IN')}
                        </td>

                        {/* SVK */}
                        <td className="px-3 py-2.5 text-right font-semibold text-purple-700 bg-purple-50 border-r border-gray-200 whitespace-nowrap">
                          {s.svk === 0 ? <span className="text-gray-300">—</span> : `₹${s.svk.toLocaleString('en-IN')}`}
                        </td>

                        {/* Additional individual heads */}
                        {additionalLabels.map((label) => {
                          const head = s.additionalHeads.find((h) => h.label === label);
                          return (
                            <td key={label} className="px-2 py-2.5 text-right text-gray-700 border-r border-gray-100 whitespace-nowrap bg-amber-50/30">
                              {fmtCell(head?.amount ?? 0)}
                            </td>
                          );
                        })}

                        {/* Additional total */}
                        {additionalLabels.length > 0 && (
                          <td className="px-3 py-2.5 text-right font-bold text-amber-700 bg-amber-50 border-r border-gray-200 whitespace-nowrap">
                            {addSum === 0 ? <span className="text-gray-300">—</span> : `₹${addSum.toLocaleString('en-IN')}`}
                          </td>
                        )}

                        {/* Grand total */}
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50 whitespace-nowrap">
                          ₹{total.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-400 flex items-center justify-between">
              <span>{totalRows} combination{totalRows !== 1 ? 's' : ''} for {selectedYear}</span>
              <span>Amounts in Indian Rupees (₹). Excel export always includes full Govt Fee breakup.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
