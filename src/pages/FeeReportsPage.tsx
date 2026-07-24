import { useState, useMemo, useEffect, Fragment, type ReactNode } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { useFeeOverrides } from '../hooks/useFeeOverrides';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { getRefundRecordsByAcademicYear, isFeeNettingRefund, type RefundRecord } from '../services/refundService';
import { FeeStructureView } from './FeeStructureView';
import { Button } from '../components/common/Button';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
  exportStatsPdf, exportFeeListPdf, exportDuesPdf,
  exportCourseYearPdf, exportConsolidatedPdf,
  buildDatewiseHeadwise, exportDatewiseHeadwisePdf,
} from '../utils/feeReportPdf';
import type { StudentFeeRow, DatewiseHeadwiseEntry } from '../utils/feeReportPdf';
import { isConfirmedActive } from '../utils/studentStatus';
import {
  exportStatsExcel, exportFeeListExcel, exportDuesExcel,
  exportCourseYearExcel, exportConsolidatedExcel,
  exportDatewiseHeadwiseExcel,
} from '../utils/feeReportExcel';
import type { Course, Year, AdmType, AdmCat, AcademicYear, FeeStructure, FeeRecord, Student, SMPFeeHead, RemittancePayee, RemittanceMode, GovHeadAmounts, GovHeadRefs, FeeRemittance } from '../types';
import { SMP_FEE_HEADS } from '../types';
import { addFeeRemittance, updateFeeRemittance, deleteFeeRemittance } from '../services/feeRemittanceService';
import { useFeeRemittances } from '../hooks/useFeeRemittances';

type TabId = 'statistics' | 'fee-list' | 'dues' | 'course-year' | 'consolidated' | 'daily-collections' | 'day-summary' | 'datewise-headwise' | 'bank-remittance' | 'fee-distribution' | 'fee-reg-1' | 'fee-structure';
type FeeStatus = 'ALL' | 'PAID' | 'NOT_PAID' | 'FEE_DUES' | 'NO_FEE_DUES';

const COURSES: Course[]         = ['CE', 'ME', 'EC', 'CS', 'EE'];
const AIDED_COURSES: Course[]   = ['CE', 'ME', 'EC', 'CS'];
const UNAIDED_COURSES: Course[] = ['EE'];
const YEARS:   Year[]   = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };
const ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL'];
const ADM_CATS:  AdmCat[]  = ['GM', 'SNQ', 'OTHERS'];

// Per-course left-border accent, matching Fee Register's row styling.
const COURSE_COLORS: Record<Course, string> = {
  CE: 'border-l-blue-400',
  ME: 'border-l-orange-400',
  EC: 'border-l-green-500',
  CS: 'border-l-purple-400',
  EE: 'border-l-rose-400',
};

// ── Design tokens ───────────────────────────────────────────────────────────
// Matches the Fee Register page's navy design system (see src/pages/FeeRegister.tsx):
// #3B5B8A primary, #D0E2F2 light tint, #2e4a72 dark accent for nested/total cells.
const fs =
  'shrink-0 rounded-full border border-[#3B5B8A]/25 px-3 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#3B5B8A]/30 focus:border-[#3B5B8A] hover:border-[#3B5B8A]/50 cursor-pointer transition-colors';

const ACCENT      = 'bg-[#3B5B8A]';
const ACCENT_DARK = 'bg-[#2e4a72]';
const TFOOT       = 'sticky bottom-0 z-10 bg-[#B9D4EC] border-t-2 border-[#3B5B8A]/40 font-semibold text-[11px] text-[#3B5B8A]';

const GOV_HEADS: { key: keyof GovHeadAmounts; label: string }[] = [
  { key: 'tuition',  label: 'Tuition'  },
  { key: 'dvp',      label: 'DVP'      },
  { key: 'adm',      label: 'Adm'      },
  { key: 'lab',      label: 'Lab'      },
  { key: 'rr',       label: 'R R'      },
  { key: 'magazine', label: 'Magazine' },
  { key: 'idCard',   label: 'ID Card'  },
  { key: 'fine',     label: 'Fine'     },
];

const EMPTY_GOV_HEADS: GovHeadAmounts = { tuition: 0, dvp: 0, adm: 0, lab: 0, rr: 0, magazine: 0, idCard: 0, fine: 0 };
const EMPTY_GOV_HEAD_REFS: GovHeadRefs = { tuition: '', dvp: '', adm: '', lab: '', rr: '', magazine: '', idCard: '', fine: '' };

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

// ── Report hub metadata (single source of truth for the dashboard cards) ─────
type ReportGroup = 'Overview' | 'Student Reports' | 'Collections' | 'Remittance & Structure';

interface TabMeta { id: TabId; label: string; group: ReportGroup; icon: ReactNode }

const ICON_PROPS = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const TAB_ICONS: Record<TabId, ReactNode> = {
  statistics: (
    <svg {...ICON_PROPS}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" /></svg>
  ),
  'fee-list': (
    <svg {...ICON_PROPS}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
  ),
  dues: (
    <svg {...ICON_PROPS}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
  ),
  'course-year': (
    <svg {...ICON_PROPS}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
  ),
  consolidated: (
    <svg {...ICON_PROPS}><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
  ),
  'daily-collections': (
    <svg {...ICON_PROPS}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
  ),
  'day-summary': (
    <svg {...ICON_PROPS}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M9 16l2 2 4-4" /></svg>
  ),
  'datewise-headwise': (
    <svg {...ICON_PROPS}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
  ),
  'bank-remittance': (
    <svg {...ICON_PROPS}><path d="M3 21h18" /><path d="M4 21V9l8-5 8 5v12" /><path d="M9 21V13h6v8" /></svg>
  ),
  'fee-distribution': (
    <svg {...ICON_PROPS}><path d="M21.21 15.89A10 10 0 118 2.83" /><path d="M22 12A10 10 0 0012 2v10z" /></svg>
  ),
  'fee-reg-1': (
    <svg {...ICON_PROPS}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" /></svg>
  ),
  'fee-structure': (
    <svg {...ICON_PROPS}><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>
  ),
};

const TAB_META: TabMeta[] = [
  { id: 'statistics',         label: 'Statistics',          group: 'Overview',                icon: TAB_ICONS.statistics },
  { id: 'fee-list',           label: 'Fee List',             group: 'Student Reports',         icon: TAB_ICONS['fee-list'] },
  { id: 'dues',               label: 'Dues Report',          group: 'Student Reports',         icon: TAB_ICONS.dues },
  { id: 'course-year',        label: 'Course & Year Wise',   group: 'Student Reports',         icon: TAB_ICONS['course-year'] },
  { id: 'consolidated',       label: 'Consolidated',         group: 'Student Reports',         icon: TAB_ICONS.consolidated },
  { id: 'daily-collections',  label: 'Daily Collections',    group: 'Collections',             icon: TAB_ICONS['daily-collections'] },
  { id: 'day-summary',        label: 'Day Summary',          group: 'Collections',             icon: TAB_ICONS['day-summary'] },
  { id: 'datewise-headwise',  label: 'Datewise Headwise',    group: 'Collections',             icon: TAB_ICONS['datewise-headwise'] },
  { id: 'bank-remittance',    label: 'Bank Remittance',      group: 'Remittance & Structure',  icon: TAB_ICONS['bank-remittance'] },
  { id: 'fee-distribution',   label: 'Fee Distribution',     group: 'Remittance & Structure',  icon: TAB_ICONS['fee-distribution'] },
  { id: 'fee-reg-1',          label: 'Fee Reg_1',            group: 'Remittance & Structure',  icon: TAB_ICONS['fee-reg-1'] },
  { id: 'fee-structure',      label: 'Fee Structure',        group: 'Remittance & Structure',  icon: TAB_ICONS['fee-structure'] },
];

const REPORT_GROUPS: ReportGroup[] = ['Overview', 'Student Reports', 'Collections', 'Remittance & Structure'];

// ── Report hub — dashboard landing screen with grouped cards ─────────────────
// Overall display order (0..11) per tab, used to stagger each card's entrance —
// same technique as Students.tsx's row-by-row `content-enter` delay.
const TAB_ORDER_INDEX: Partial<Record<TabId, number>> = Object.fromEntries(
  TAB_META.map((t, i) => [t.id, i]),
);

interface HubStat { label: string; value: string }
// Row-header x column-header matrix with a totals row — same table idiom as Dashboard's
// "Admission Type-wise" modal (Year rows x Regular/Lateral/SNQ/Repeater/Total columns).
interface HubMatrix { columns: string[]; rowLabels: string[]; data: string[][]; totalRow: string[] }
// One shared header row (stat labels) above one data row (values) — same column-headed
// table idiom, used for cards whose stats don't decompose into a row x column matrix.
interface HubCardContent { headline: string; rows?: HubStat[]; matrix?: HubMatrix }

function ReportHub({ onSelect, content }: { onSelect: (id: TabId) => void; content: Partial<Record<TabId, HubCardContent>> }) {
  return (
    <div className="flex flex-col gap-4" style={{ animation: 'content-enter 0.22s ease-out' }}>
      {REPORT_GROUPS.map((group) => (
        <div key={group}>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="w-1 h-4 rounded-full shrink-0 bg-[#3B5B8A]" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#3B5B8A]">{group}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {TAB_META.filter((t) => t.group === group).map((tab) => { const c = content[tab.id]; return (
              <button
                key={tab.id}
                onClick={() => onSelect(tab.id)}
                className="group flex flex-col rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-[#3B5B8A]/50 hover:shadow-sm transition-all"
                style={{ animation: `content-enter 0.25s ease-out ${Math.min((TAB_ORDER_INDEX[tab.id] ?? 0) * 0.03, 0.3)}s both` }}
              >
                <span className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-lg bg-[#D0E2F2]/50 text-[#3B5B8A]">
                    {tab.icon}
                  </span>
                  <span className="flex-1 min-w-0 text-xs font-semibold text-gray-800 truncate">{tab.label}</span>
                  <svg className="shrink-0 text-gray-300 group-hover:text-[#3B5B8A] transition-colors" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </span>

                {c && (
                  <>
                    <span className="text-sm font-bold text-[#3B5B8A] mt-1.5 truncate">{c.headline}</span>
                    {c.matrix ? (
                      <table className="mt-1.5 w-full border-collapse table-fixed">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="pb-1 w-[20%]" />
                            {c.matrix.columns.map((col) => (
                              <th key={col} className="pb-1 pl-1 w-[20%] text-[8px] font-semibold uppercase tracking-wide text-gray-400 text-right truncate">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {c.matrix.rowLabels.map((label, r) => (
                            <tr key={label}>
                              <td className="py-0.5 pr-1 text-[9px] font-semibold text-gray-600 truncate">{label}</td>
                              {c.matrix!.data[r].map((v, ci) => (
                                <td key={ci} className="py-0.5 pl-1 text-[9px] font-bold text-gray-700 tabular-nums text-right truncate">{v}</td>
                              ))}
                            </tr>
                          ))}
                          <tr className="border-t-2 border-[#3B5B8A]/30">
                            <td className="pt-1 pr-1 text-[8px] font-bold uppercase text-[#3B5B8A] truncate">Total</td>
                            {c.matrix.totalRow.map((v, ci) => (
                              <td key={ci} className="pt-1 pl-1 text-[9px] font-black text-[#3B5B8A] tabular-nums text-right truncate">{v}</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    ) : c.rows && (
                      <table className="mt-1.5 w-full border-collapse table-fixed">
                        <thead>
                          <tr className="border-b border-gray-100">
                            {c.rows.map((stat, i) => {
                              const isTotal = i === c.rows!.length - 1 && (stat.label === 'Total' || stat.label === 'Balance');
                              return (
                                <th key={i} className={`pb-1 text-[9px] font-semibold uppercase tracking-wide text-left truncate ${isTotal ? 'pl-1.5 border-l border-gray-200 text-[#3B5B8A]/70' : 'text-gray-400'}`}>
                                  {stat.label}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {c.rows.map((stat, i) => {
                              const isTotal = i === c.rows!.length - 1 && (stat.label === 'Total' || stat.label === 'Balance');
                              return (
                                <td key={i} className={`pt-1 text-[11px] font-bold tabular-nums truncate ${isTotal ? 'pl-1.5 border-l border-gray-200 text-[#3B5B8A]' : 'text-gray-700'}`}>
                                  {stat.value}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </button>
            );})}
          </div>
        </div>
      ))}
    </div>
  );
}

function fmt(n: number): string {
  return `\u20B9${n.toLocaleString('en-IN')}`;
}

// Lakh-shorthand currency, for narrow matrix-table cells where the full comma-grouped
// figure (e.g. \u20B936,40,069) would overflow/truncate. Amounts under 1L are short enough
// to show in full already.
function fmtCompact(n: number): string {
  if (Math.abs(n) >= 100000) {
    return `\u20B9${(n / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  }
  return fmt(n);
}

// Force-download a cross-origin file (Storage download URLs don't honor the `download` attribute cross-origin).
async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  } catch {
    window.open(url, '_blank');
  }
}

// Pure-ASCII Indian number formatter for jsPDF cells (avoids WinAnsi garbling from toLocaleString).
function numPdf(n: number): string {
  const sign = n < 0 ? '-' : '';
  const s = Math.abs(Math.round(n)).toString();
  if (s.length <= 3) return sign + s;
  const last3 = s.slice(-3);
  const rest  = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return sign + grouped + ',' + last3;
}

// ── Chip ──────────────────────────────────────────────────────────────────────
interface ChipProps { label: string; count: number; active: boolean; colorClass: string; onClick: () => void; }
function Chip({ label, count, active, colorClass, onClick }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors
        ${active ? colorClass : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
    >
      <span>{label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold
        ${active ? 'bg-white/40' : 'bg-gray-100 text-gray-500'}`}>
        {count}
      </span>
    </button>
  );
}

// ── Export buttons ─────────────────────────────────────────────────────────────
// Pill-shaped, matching Fee Register's "Export Excel" button.
function ExportBar({ onPdf, onExcel }: { onPdf?: () => void; onExcel?: () => void }) {
  const cls = 'flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors whitespace-nowrap shadow-sm';
  return (
    <div className="flex gap-2">
      {onPdf   && <button onClick={onPdf} className={cls}>PDF</button>}
      {onExcel && <button onClick={onExcel} className={cls}>Excel</button>}
    </div>
  );
}

// ── Clear filters button ─────────────────────────────────────────────────────
function ClearButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-400'
          : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
      }`}
    >
      Clear
    </button>
  );
}

// ── Stat chip strip ──────────────────────────────────────────────────────────
// Pill-shaped stat badges, matching Fee Register's header "Records"/"Collected" pills.
interface StatChipEntry { label: string; value: string | number; color: string; bg: string; border: string; }
function StatChipRow({ entries }: { entries: StatChipEntry[] }) {
  return (
    <div className="shrink-0 flex flex-wrap gap-2">
      {entries.map((c) => (
        <div key={c.label} className={`flex items-center gap-1.5 rounded-full border ${c.border} ${c.bg} px-3 py-1 shadow-sm whitespace-nowrap`}>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{c.label}</span>
          <span className={`text-sm font-bold tabular-nums ${c.color}`}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Segmented toggle (replaces bespoke pill-toggle / underline-tab variants) ──
interface SegmentedOption { value: string; label: string; }
function SegmentedToggle({ options, value, onChange }: { options: SegmentedOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            value === o.value ? `${ACCENT} text-white shadow-sm` : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Search box ──────────────────────────────────────────────────────────────
// Pill search input matching Fee Register's search bar: icon + amber circular clear button.
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative shrink-0 w-60">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#3B5B8A]/50 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-full border border-[#3B5B8A]/30 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#3B5B8A]/30 focus:border-[#3B5B8A] bg-white shadow-sm text-gray-800 placeholder:text-gray-400 placeholder:font-normal transition-all duration-150 pl-8 ${value ? 'pr-8' : 'pr-3'}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-amber-400 hover:bg-amber-500 text-white transition-colors duration-150 shrink-0"
          aria-label="Clear search"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Collapsible filter panel ──────────────────────────────────────────────────
// Matches Fee Register's gradient toolbar: an always-visible top row (search / stat
// pills / export / clear / toggle) with a collapsible row of filter selects below it,
// hidden until the user expands it. `showFilters` is local — each tab only has one
// panel mounted at a time, so per-mount state (not lifted to the parent) is correct.
function FilterPanel({
  search, right, hasActiveFilters, onClear, children,
}: {
  search?: ReactNode;
  right?: ReactNode;
  hasActiveFilters: boolean;
  onClear: () => void;
  children: ReactNode;
}) {
  const [showFilters, setShowFilters] = useState(false);
  return (
    <div
      className="shrink-0 rounded-2xl border border-[#3B5B8A]/15 overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #eef3fa 0%, #f8fafc 45%, #eaf1fb 100%)', boxShadow: '0 1px 4px 0 rgba(59,91,138,0.08)' }}
    >
      {/* Top row — search / right slot / clear / toggle. Fixed in place: expanding the
          filters below never shifts this row, matching Fee Register's filter bar. */}
      <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
        {search}
        <div className="flex-1" />
        {right}
        {hasActiveFilters && (
          <>
            <span className="w-px h-5 bg-[#3B5B8A]/20 shrink-0" />
            <ClearButton active={hasActiveFilters} onClick={onClear} />
          </>
        )}
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
            showFilters
              ? 'bg-[#D0E2F2] border-[#3B5B8A]/40 text-[#3B5B8A]'
              : 'border-[#3B5B8A]/20 text-[#3B5B8A]/50 hover:bg-[#D0E2F2]/40 hover:text-[#3B5B8A]'
          }`}
          title="Toggle filters"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
        </button>
      </div>

      {/* Collapsible filter row — expands below the top row, never displacing it */}
      <div
        className="grid"
        style={{
          gridTemplateRows: showFilters ? '1fr' : '0fr',
          opacity: showFilters ? 1 : 0,
          transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-wrap content-center items-center gap-1.5 px-3 py-2 border-t border-[#3B5B8A]/10">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared: grouped 2-row header for fee detail tables ─────────────────────────
function FeeTableHead({ headerColor }: { headerColor: string }) {
  return (
    <thead className={`sticky top-0 z-10 ${headerColor} text-white text-[11px]`}>
      <tr>
        <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
        <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Name</th>
        <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Reg No</th>
        <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Course</th>
        <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Year</th>
        <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Allotted</th>
        <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Paid</th>
        <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Balance</th>
      </tr>
      <tr>
        {(['SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total'] as const).map((h, i) => (
          <th key={i} className={`px-2 py-1 text-right font-semibold ${i % 3 === 0 ? 'border-l border-white/30' : ''} ${i % 3 === 2 ? ACCENT_DARK : ''}`}>{h}</th>
        ))}
      </tr>
    </thead>
  );
}

// ── Shared: fee detail row cells ───────────────────────────────────────────────
function FeeDetailRow({ r, i, stripe }: { r: StudentFeeRow; i: number; stripe: boolean }) {
  return (
    <tr className={`border-l-2 ${COURSE_COLORS[r.student.course]} hover:bg-[#3B5B8A]/10 transition-colors ${stripe ? 'bg-gray-50' : 'bg-white'}`}>
      <td className="px-2 py-1.5 text-center text-gray-400 text-[11px]">{i + 1}</td>
      <td className="px-2 py-1.5 font-medium text-[11px] max-w-[140px] truncate">{r.student.studentNameSSLC}</td>
      <td className="px-2 py-1.5 text-gray-500 text-[11px]">{r.student.regNumber || '—'}</td>
      <td className="px-2 py-1.5 text-center font-semibold text-[11px]">{r.student.course}</td>
      <td className="px-2 py-1.5 text-[11px]">{r.student.year}</td>
      {/* Allotted */}
      <td className="px-2 py-1.5 text-right text-[11px] border-l border-gray-100">{r.smpAllotted !== null ? fmt(r.smpAllotted) : '—'}</td>
      <td className="px-2 py-1.5 text-right text-[11px]">{r.svkAllotted !== null ? fmt(r.svkAllotted) : '—'}</td>
      <td className="px-2 py-1.5 text-right text-[11px] font-semibold">{r.allotted !== null ? fmt(r.allotted) : '—'}</td>
      {/* Paid */}
      <td className="px-2 py-1.5 text-right text-[11px] text-green-700 border-l border-gray-100">{r.smpPaid > 0 ? fmt(r.smpPaid) : '—'}</td>
      <td className="px-2 py-1.5 text-right text-[11px] text-green-700">{r.svkPaid > 0 ? fmt(r.svkPaid) : '—'}</td>
      <td className="px-2 py-1.5 text-right text-[11px] text-green-700 font-semibold">{r.paid > 0 ? fmt(r.paid) : '—'}</td>
      {/* Balance */}
      <td className={`px-2 py-1.5 text-right text-[11px] border-l border-gray-100 ${r.smpBalance !== null && r.smpBalance > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.smpBalance !== null ? fmt(r.smpBalance) : '—'}</td>
      <td className={`px-2 py-1.5 text-right text-[11px] ${r.svkBalance !== null && r.svkBalance > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.svkBalance !== null ? fmt(r.svkBalance) : '—'}</td>
      <td className={`px-2 py-1.5 text-right text-[11px] font-semibold ${r.balance !== null && r.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.balance !== null ? fmt(r.balance) : '—'}</td>
    </tr>
  );
}

// ── Shared: local text-search over student fee rows (name / reg no) ──────────
function searchStudentRows(rows: StudentFeeRow[], query: string): StudentFeeRow[] {
  if (!query) return rows;
  const q = query.trim().toUpperCase();
  return rows.filter((r) => {
    const s = r.student;
    return s.studentNameSSLC.toUpperCase().includes(q) || (s.regNumber ?? '').toUpperCase().includes(q);
  });
}

// ── Shared: course/year breakdown data ────────────────────────────────────────
interface BreakdownEntry {
  course: string; year: string; total: number; paid: number;
  smpAllt: number; svkAllt: number; smpColl: number; svkColl: number;
}

function buildBreakdown(rows: StudentFeeRow[]): BreakdownEntry[] {
  const map = new Map<string, BreakdownEntry>();
  for (const r of rows) {
    const key = `${r.student.course}__${r.student.year}`;
    if (!map.has(key)) {
      map.set(key, { course: r.student.course, year: r.student.year, total: 0, paid: 0, smpAllt: 0, svkAllt: 0, smpColl: 0, svkColl: 0 });
    }
    const e = map.get(key)!;
    e.total++;
    if (r.paid > 0) e.paid++;
    e.smpAllt += r.smpAllotted ?? 0;
    e.svkAllt += r.svkAllotted ?? 0;
    e.smpColl += r.smpPaid;
    e.svkColl += r.svkPaid;
  }
  return Array.from(map.values()).sort((a, b) => {
    const c = a.course.localeCompare(b.course);
    return c !== 0 ? c : a.year.localeCompare(b.year);
  });
}

// ── Shared: group summary table ───────────────────────────────────────────────
function GroupTable({ breakdown, totals, colSpanLabel = 2 }: {
  breakdown: BreakdownEntry[];
  totals: { students: number; paid: number; smpAllt: number; svkAllt: number; smpColl: number; svkColl: number };
  colSpanLabel?: number;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
      <table className="w-full text-[11px]">
        <thead className={`${ACCENT} text-white`}>
          <tr>
            <th className="px-2 py-1.5 text-center font-semibold" colSpan={colSpanLabel === 1 ? 1 : 2}>Course / Year</th>
            <th className="px-2 py-1.5 text-center font-semibold">Students</th>
            <th className="px-2 py-1.5 text-center font-semibold">Paid</th>
            <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Allotted</th>
            <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Collected</th>
            <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Balance</th>
          </tr>
          <tr>
            <th className="px-2 py-1 font-semibold" colSpan={colSpanLabel === 1 ? 1 : 2}></th>
            <th className="px-2 py-1 font-semibold"></th>
            <th className="px-2 py-1 font-semibold"></th>
            {(['SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total'] as const).map((h, i) => (
              <th key={i} className={`px-2 py-1 text-right font-semibold ${i % 3 === 0 ? 'border-l border-white/30' : ''} ${i % 3 === 2 ? ACCENT_DARK : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {breakdown.map((b, i) => {
            const bAllt = b.smpAllt + b.svkAllt;
            const bColl = b.smpColl + b.svkColl;
            return (
              <tr key={`${b.course}-${b.year}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-2 py-1.5 font-semibold">{b.course}</td>
                <td className="px-2 py-1.5">{b.year}</td>
                <td className="px-2 py-1.5 text-center">{b.total}</td>
                <td className="px-2 py-1.5 text-center text-green-700">{b.paid}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100">{fmt(b.smpAllt)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(b.svkAllt)}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{fmt(bAllt)}</td>
                <td className="px-2 py-1.5 text-right text-green-700 border-l border-gray-100">{fmt(b.smpColl)}</td>
                <td className="px-2 py-1.5 text-right text-green-700">{fmt(b.svkColl)}</td>
                <td className="px-2 py-1.5 text-right text-green-700 font-semibold">{fmt(bColl)}</td>
                <td className="px-2 py-1.5 text-right text-red-600 border-l border-gray-100">{fmt(b.smpAllt - b.smpColl)}</td>
                <td className="px-2 py-1.5 text-right text-red-600">{fmt(b.svkAllt - b.svkColl)}</td>
                <td className="px-2 py-1.5 text-right text-red-600 font-semibold">{fmt(bAllt - bColl)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-100 font-bold border-t border-gray-300 text-[11px]">
          <tr>
            <td className="px-2 py-2" colSpan={colSpanLabel === 1 ? 1 : 2}>Total</td>
            <td className="px-2 py-2 text-center">{totals.students}</td>
            <td className="px-2 py-2 text-center text-green-700">{totals.paid}</td>
            <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(totals.smpAllt)}</td>
            <td className="px-2 py-2 text-right">{fmt(totals.svkAllt)}</td>
            <td className="px-2 py-2 text-right">{fmt(totals.smpAllt + totals.svkAllt)}</td>
            <td className="px-2 py-2 text-right text-green-700 border-l border-gray-200">{fmt(totals.smpColl)}</td>
            <td className="px-2 py-2 text-right text-green-700">{fmt(totals.svkColl)}</td>
            <td className="px-2 py-2 text-right text-green-700">{fmt(totals.smpColl + totals.svkColl)}</td>
            <td className="px-2 py-2 text-right text-red-600 border-l border-gray-200">{fmt(totals.smpAllt - totals.smpColl)}</td>
            <td className="px-2 py-2 text-right text-red-600">{fmt(totals.svkAllt - totals.svkColl)}</td>
            <td className="px-2 py-2 text-right text-red-600">{fmt((totals.smpAllt + totals.svkAllt) - (totals.smpColl + totals.svkColl))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Tab: Statistics ──────────────────────────────────────────────────────────────
function StatisticsTab({ rows, academicYear, fp }: { rows: StudentFeeRow[]; academicYear: string; fp: CommonFilterProps }) {
  const total       = rows.length;
  const paidCount   = rows.filter((r) => r.paid > 0).length;
  const notPaid     = total - paidCount;
  const duesCount   = rows.filter((r) => r.balance !== null && r.balance > 0).length;
  const noDuesCount = rows.filter((r) => r.balance !== null && r.balance <= 0).length;
  const totSmpAllt  = rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
  const totSvkAllt  = rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
  const totSmpPaid  = rows.reduce((s, r) => s + r.smpPaid, 0);
  const totSvkPaid  = rows.reduce((s, r) => s + r.svkPaid, 0);
  const breakdown   = useMemo(() => buildBreakdown(rows), [rows]);

  return (
    <div className="space-y-2">
      <CommonFilters fp={fp} extra={
        <ExportBar onPdf={() => exportStatsPdf(rows, academicYear)} onExcel={() => exportStatsExcel(rows, academicYear)} />
      } />

      {/* Count summary strip */}
      <StatChipRow entries={[
        { label: 'Total',    value: total,       color: 'text-[#3B5B8A]',    bg: 'bg-[#D0E2F2]/40',    border: 'border-[#3B5B8A]/25'   },
        { label: 'Paid',     value: paidCount,   color: 'text-green-700',   bg: 'bg-green-50',   border: 'border-green-200'  },
        { label: 'Not Paid', value: notPaid,     color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'    },
        { label: 'Fee Dues', value: duesCount,   color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'  },
        { label: 'No Dues',  value: noDuesCount, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
      ]} />

      {/* SMP / SVK / Total amount table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-sm">
          <thead className={`${ACCENT} text-white`}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Metric</th>
              <th className="px-3 py-2 text-right font-semibold">SMP</th>
              <th className="px-3 py-2 text-right font-semibold">SVK</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Allotted',  smp: totSmpAllt,                   svk: totSvkAllt },
              { label: 'Collected', smp: totSmpPaid,                   svk: totSvkPaid },
              { label: 'Balance',   smp: totSmpAllt - totSmpPaid,      svk: totSvkAllt - totSvkPaid },
            ].map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 font-semibold">{row.label}</td>
                <td className="px-3 py-2 text-right">{fmt(row.smp)}</td>
                <td className="px-3 py-2 text-right">{fmt(row.svk)}</td>
                <td className="px-3 py-2 text-right font-bold">{fmt(row.smp + row.svk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Course / Year breakdown */}
      <GroupTable
        breakdown={breakdown}
        totals={{ students: total, paid: paidCount, smpAllt: totSmpAllt, svkAllt: totSvkAllt, smpColl: totSmpPaid, svkColl: totSvkPaid }}
      />
    </div>
  );
}

// ── Tab: Fee List ─────────────────────────────────────────────────────────────
function FeeListTab({ rows: allRows, academicYear, fp }: { rows: StudentFeeRow[]; academicYear: string; fp: CommonFilterProps }) {
  const [searchTerm,      setSearchTerm]      = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const rows = useMemo(() => searchStudentRows(allRows, debouncedSearch), [allRows, debouncedSearch]);

  const totals = useMemo(() => ({
    smpAllt: rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0),
    svkAllt: rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0),
    smpPaid: rows.reduce((s, r) => s + r.smpPaid, 0),
    svkPaid: rows.reduce((s, r) => s + r.svkPaid, 0),
  }), [rows]);

  const fpWithSearch: CommonFilterProps = {
    ...fp,
    hasActiveFilters: fp.hasActiveFilters || !!searchTerm,
    clearFilters: () => { fp.clearFilters(); setSearchTerm(''); },
  };

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="shrink-0">
        <CommonFilters
          fp={fpWithSearch}
          search={<SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search name / reg no…" />}
          extra={
            <>
              <span className="text-xs text-gray-500 whitespace-nowrap">{rows.length} student{rows.length !== 1 ? 's' : ''}</span>
              <ExportBar onPdf={() => exportFeeListPdf(rows, academicYear)} onExcel={() => exportFeeListExcel(rows, academicYear)} />
            </>
          }
        />
      </div>
      <div className="flex-1 min-h-0 rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full bg-white">
          <FeeTableHead headerColor={ACCENT} />
          <tbody>
            {rows.map((r, i) => <FeeDetailRow key={r.student.id} r={r} i={i} stripe={i % 2 !== 0} />)}
            {rows.length === 0 && (
              <tr><td colSpan={14} className="px-3 py-6 text-center text-xs text-gray-400">No students match the current filters.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className={TFOOT}>
              <tr>
                <td className="px-2 py-2 text-center text-gray-400">—</td>
                <td className="px-2 py-2" colSpan={4}>Total — {rows.length} student{rows.length !== 1 ? 's' : ''}</td>
                <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(totals.smpAllt)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.svkAllt)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.smpAllt + totals.svkAllt)}</td>
                <td className="px-2 py-2 text-right text-green-700 border-l border-gray-200">{fmt(totals.smpPaid)}</td>
                <td className="px-2 py-2 text-right text-green-700">{fmt(totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-green-700">{fmt(totals.smpPaid + totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600 border-l border-gray-200">{fmt(totals.smpAllt - totals.smpPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600">{fmt(totals.svkAllt - totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600">{fmt((totals.smpAllt + totals.svkAllt) - (totals.smpPaid + totals.svkPaid))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Dues Report ──────────────────────────────────────────────────────────
function DuesTab({ rows: allRows, academicYear, fp }: { rows: StudentFeeRow[]; academicYear: string; fp: CommonFilterProps }) {
  const [searchTerm,      setSearchTerm]      = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const rows = useMemo(() => searchStudentRows(allRows, debouncedSearch), [allRows, debouncedSearch]);
  const dueRows = useMemo(() => rows.filter((r) => r.balance !== null && r.balance > 0), [rows]);
  const totals = useMemo(() => ({
    smpAllt: dueRows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0),
    svkAllt: dueRows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0),
    smpPaid: dueRows.reduce((s, r) => s + r.smpPaid, 0),
    svkPaid: dueRows.reduce((s, r) => s + r.svkPaid, 0),
  }), [dueRows]);

  const fpWithSearch: CommonFilterProps = {
    ...fp,
    hasActiveFilters: fp.hasActiveFilters || !!searchTerm,
    clearFilters: () => { fp.clearFilters(); setSearchTerm(''); },
  };

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="shrink-0">
        <CommonFilters
          fp={fpWithSearch}
          search={<SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search name / reg no…" />}
          extra={
            <>
              <span className="text-xs text-gray-500 whitespace-nowrap">{dueRows.length} student{dueRows.length !== 1 ? 's' : ''} with dues</span>
              <ExportBar onPdf={() => exportDuesPdf(rows, academicYear)} onExcel={() => exportDuesExcel(rows, academicYear)} />
            </>
          }
        />
      </div>
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full">
          <FeeTableHead headerColor={ACCENT} />
          <tbody>
            {dueRows.map((r, i) => <FeeDetailRow key={r.student.id} r={r} i={i} stripe={i % 2 !== 0} />)}
            {dueRows.length === 0 && (
              <tr><td colSpan={14} className="px-3 py-6 text-center text-xs text-gray-400">No students with outstanding balance.</td></tr>
            )}
          </tbody>
          {dueRows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 bg-[#B9D4EC] font-bold border-t-2 border-[#3B5B8A]/40 text-[11px] text-[#3B5B8A]">
              <tr>
                <td className="px-2 py-2 text-center text-gray-400">—</td>
                <td className="px-2 py-2" colSpan={4}>Total — {dueRows.length} student{dueRows.length !== 1 ? 's' : ''}</td>
                <td className="px-2 py-2 text-right border-l border-[#3B5B8A]/20">{fmt(totals.smpAllt)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.svkAllt)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.smpAllt + totals.svkAllt)}</td>
                <td className="px-2 py-2 text-right text-green-700 border-l border-[#3B5B8A]/20">{fmt(totals.smpPaid)}</td>
                <td className="px-2 py-2 text-right text-green-700">{fmt(totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-green-700">{fmt(totals.smpPaid + totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600 border-l border-[#3B5B8A]/20">{fmt(totals.smpAllt - totals.smpPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600">{fmt(totals.svkAllt - totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600">{fmt((totals.smpAllt + totals.svkAllt) - (totals.smpPaid + totals.svkPaid))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Course & Year Wise ───────────────────────────────────────────────────
function CourseYearTab({ rows, academicYear, fp }: { rows: StudentFeeRow[]; academicYear: string; fp: CommonFilterProps }) {
  const breakdown = useMemo(() => buildBreakdown(rows), [rows]);
  const totals = useMemo(() => ({
    students: rows.length,
    paid:     rows.filter((r) => r.paid > 0).length,
    smpAllt:  rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0),
    svkAllt:  rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0),
    smpColl:  rows.reduce((s, r) => s + r.smpPaid, 0),
    svkColl:  rows.reduce((s, r) => s + r.svkPaid, 0),
  }), [rows]);

  return (
    <div className="space-y-3">
      <CommonFilters fp={fp} extra={
        <ExportBar onPdf={() => exportCourseYearPdf(rows, academicYear)} onExcel={() => exportCourseYearExcel(rows, academicYear)} />
      } />
      <GroupTable breakdown={breakdown} totals={totals} />
    </div>
  );
}

// ── Tab: Consolidated ──────────────────────────────────────────────────────────
function ConsolidatedTab({ feeRecords, academicYear, fp }: { feeRecords: FeeRecord[]; academicYear: string; fp: CommonFilterProps }) {
  const { smpTotals, smpGrandTotal, svkTotal, additionalTotal } = useMemo(() => {
    const totals = {} as Record<string, number>;
    for (const { key } of SMP_FEE_HEADS) totals[key] = 0;
    let svk = 0, add = 0;
    for (const r of feeRecords) {
      for (const { key } of SMP_FEE_HEADS) totals[key] += r.smp[key];
      svk += r.svk;
      add += r.additionalPaid.reduce((s, h) => s + h.amount, 0);
    }
    const smpTotal = SMP_FEE_HEADS.reduce((s, { key }) => s + totals[key], 0);
    return { smpTotals: totals, smpGrandTotal: smpTotal, svkTotal: svk, additionalTotal: add };
  }, [feeRecords]);

  const svkFullTotal = svkTotal + additionalTotal;
  const grandTotal   = smpGrandTotal + svkFullTotal;

  return (
    <div className="space-y-3">
      <CommonFilters fp={fp} extra={
        <>
          <span className="text-xs text-gray-500">{feeRecords.length} payment record{feeRecords.length !== 1 ? 's' : ''}</span>
          <ExportBar onPdf={() => exportConsolidatedPdf(feeRecords, academicYear)} onExcel={() => exportConsolidatedExcel(feeRecords, academicYear)} />
        </>
      } />

      {/* SMP vs SVK summary */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-w-xs">
        <table className="w-full text-sm">
          <thead className={`${ACCENT} text-white`}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Category</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-[#D0E2F2]/40">
              <td className="px-3 py-1.5 font-semibold">SMP Total</td>
              <td className="px-3 py-1.5 text-right font-semibold">{fmt(smpGrandTotal)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 pl-5 text-gray-500">SVK (Base)</td>
              <td className="px-3 py-1.5 text-right">{fmt(svkTotal)}</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="px-3 py-1.5 pl-5 text-gray-500">SVK (Add-ons)</td>
              <td className="px-3 py-1.5 text-right">{fmt(additionalTotal)}</td>
            </tr>
            <tr className="bg-[#D0E2F2]/40">
              <td className="px-3 py-1.5 font-semibold">SVK Total</td>
              <td className="px-3 py-1.5 text-right font-semibold">{fmt(svkFullTotal)}</td>
            </tr>
          </tbody>
          <tfoot className="border-t border-gray-200">
            <tr className={`${ACCENT} text-white font-bold`}>
              <td className="px-3 py-2">Grand Total</td>
              <td className="px-3 py-2 text-right">{fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* SMP head-wise breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-w-xs">
        <table className="w-full text-sm">
          <thead className="bg-gray-500 text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">SMP Fee Head</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {SMP_FEE_HEADS.map(({ label, key }, i) => (
              <tr key={key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-1.5">{label}</td>
                <td className="px-3 py-1.5 text-right">{fmt(smpTotals[key])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200">
            <tr className="bg-[#D0E2F2]/40 font-bold">
              <td className="px-3 py-2">SMP Total</td>
              <td className="px-3 py-2 text-right">{fmt(smpGrandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Daily Collections ────────────────────────────────────────────────────
interface DayEntry {
  dateKey: string;
  dateLabel: string;
  receiptCount: number;
  studentCount: number;
  smpCash: number; svkCash: number; addCash: number; cashTotal: number;
  smpUpi: number;  svkUpi: number;  addUpi: number;  upiTotal: number;
  dayTotal: number;
}

function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}

function buildDailyCollections(records: FeeRecord[]): DayEntry[] {
  const map = new Map<string, DayEntry>();
  const studentSets = new Map<string, Set<string>>();
  for (const r of records) {
    const dateKey = r.date.slice(0, 10);
    if (!map.has(dateKey)) {
      map.set(dateKey, {
        dateKey,
        dateLabel: formatDayLabel(dateKey),
        receiptCount: 0,
        studentCount: 0,
        smpCash: 0, svkCash: 0, addCash: 0, cashTotal: 0,
        smpUpi: 0,  svkUpi: 0,  addUpi: 0,  upiTotal: 0,
        dayTotal: 0,
      });
      studentSets.set(dateKey, new Set());
    }
    const e = map.get(dateKey)!;
    e.receiptCount++;
    studentSets.get(dateKey)!.add(r.studentId);

    const smpAmt = SMP_FEE_HEADS.reduce((s, { key }) => s + r.smp[key], 0);
    const svkAmt = r.svk;
    const addAmt = r.additionalPaid.reduce((s, h) => s + h.amount, 0);

    const smpMode = r.smpPaymentMode ?? r.paymentMode;
    const svkMode = r.svkPaymentMode ?? r.paymentMode;
    const addMode = r.additionalPaymentMode ?? r.paymentMode;

    if (smpMode === 'CASH')  { e.smpCash += smpAmt; }
    else if (smpMode === 'SPLIT') { e.smpCash += r.smpSplit?.cash ?? 0; e.smpUpi += r.smpSplit?.upi ?? 0; }
    else                     { e.smpUpi  += smpAmt; }

    if (svkMode === 'CASH')  { e.svkCash += svkAmt; }
    else if (svkMode === 'SPLIT') { e.svkCash += r.svkSplit?.cash ?? 0; e.svkUpi += r.svkSplit?.upi ?? 0; }
    else                     { e.svkUpi  += svkAmt; }

    if (addMode === 'CASH')  { e.addCash += addAmt; }
    else if (addMode === 'SPLIT') { e.addCash += r.additionalSplit?.cash ?? 0; e.addUpi += r.additionalSplit?.upi ?? 0; }
    else                     { e.addUpi  += addAmt; }

    e.cashTotal = e.smpCash + e.svkCash + e.addCash;
    e.upiTotal  = e.smpUpi  + e.svkUpi  + e.addUpi;
    e.dayTotal  = e.cashTotal + e.upiTotal;
  }
  for (const [dateKey, e] of map) {
    e.studentCount = studentSets.get(dateKey)!.size;
  }
  return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function exportDailyCollectionsExcel(entries: DayEntry[], academicYear: string): void {
  const header = [
    'Date', 'Receipts', 'Students',
    'SMP (Cash)', 'SVK (Cash)', 'Additional (Cash)', 'Total Cash',
    'SMP (UPI)',  'SVK (UPI)',  'Additional (UPI)',  'Total UPI',
    'Day Total',
  ];
  const dataRows = entries.map((e) => [
    e.dateLabel, e.receiptCount, e.studentCount,
    e.smpCash || null, e.svkCash || null, e.addCash || null, e.cashTotal || null,
    e.smpUpi  || null, e.svkUpi  || null, e.addUpi  || null, e.upiTotal  || null,
    e.dayTotal,
  ]);
  const tot = entries.reduce(
    (a, e) => ({
      receiptCount: a.receiptCount + e.receiptCount,
      smpCash: a.smpCash + e.smpCash, svkCash: a.svkCash + e.svkCash, addCash: a.addCash + e.addCash,
      cashTotal: a.cashTotal + e.cashTotal,
      smpUpi: a.smpUpi + e.smpUpi,   svkUpi: a.svkUpi + e.svkUpi,   addUpi: a.addUpi + e.addUpi,
      upiTotal: a.upiTotal + e.upiTotal,
      dayTotal: a.dayTotal + e.dayTotal,
    }),
    { receiptCount: 0, smpCash: 0, svkCash: 0, addCash: 0, cashTotal: 0, smpUpi: 0, svkUpi: 0, addUpi: 0, upiTotal: 0, dayTotal: 0 },
  );
  const totRow = [
    'TOTAL', tot.receiptCount, '',
    tot.smpCash || null, tot.svkCash || null, tot.addCash || null, tot.cashTotal,
    tot.smpUpi  || null, tot.svkUpi  || null, tot.addUpi  || null, tot.upiTotal,
    tot.dayTotal,
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Collections');
  XLSX.writeFile(wb, `Daily_Collections_${academicYear}.xlsx`);
}

// ── Day Breakdown Excel export ────────────────────────────────────────────────
function exportDayBreakdownExcel(day: DayEntry, cashRecs: FeeRecord[], upiRecs: FeeRecord[]): void {
  const header = ['Sl', 'Student Name', 'Reg No', 'Course', 'Year', 'SMP Rpt', 'SVK Rpt', 'Add Rpt', 'SMP', 'SVK', 'Additional', 'Total'];

  const makeRows = (recs: FeeRecord[], isCash: boolean) =>
    recs.map((r, i) => {
      const s      = getRecordSplit(r);
      const smpAmt = isCash ? s.smpCash : s.smpUpi;
      const svkAmt = isCash ? s.svkCash : s.svkUpi;
      const addAmt = isCash ? s.addCash : s.addUpi;
      return [i + 1, r.studentName, r.regNumber || '', r.course, r.year,
        r.receiptNumber || '', r.svkReceiptNumber || '', r.additionalReceiptNumber || '',
        smpAmt || null, svkAmt || null, addAmt || null, smpAmt + svkAmt + addAmt];
    });

  const makeTotRow = (recs: FeeRecord[], isCash: boolean) => {
    const t = recs.reduce((a, r) => {
      const s = getRecordSplit(r);
      return { smp: a.smp + (isCash ? s.smpCash : s.smpUpi), svk: a.svk + (isCash ? s.svkCash : s.svkUpi), add: a.add + (isCash ? s.addCash : s.addUpi) };
    }, { smp: 0, svk: 0, add: 0 });
    return ['TOTAL', '', '', '', '', '', '', '', t.smp || null, t.svk || null, t.add || null, t.smp + t.svk + t.add];
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...makeRows(cashRecs, true),  makeTotRow(cashRecs, true)]),  'Cash Payments');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...makeRows(upiRecs,  false), makeTotRow(upiRecs,  false)]), 'UPI Payments');
  XLSX.writeFile(wb, `Collections_${day.dateKey}_${day.dateLabel.replace(/ /g, '_')}.xlsx`);
}

// ── Day Breakdown Modal ────────────────────────────────────────────────────────
function getRecordSplit(r: FeeRecord) {
  const smpAmt = SMP_FEE_HEADS.reduce((s, { key }) => s + r.smp[key], 0);
  const svkAmt = r.svk;
  const addAmt = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
  const smpMode = r.smpPaymentMode ?? r.paymentMode;
  const svkMode = r.svkPaymentMode ?? r.paymentMode;
  const addMode = r.additionalPaymentMode ?? r.paymentMode;
  return {
    smpCash: smpMode === 'CASH' ? smpAmt : smpMode === 'SPLIT' ? (r.smpSplit?.cash ?? 0) : 0,
    smpUpi:  smpMode === 'UPI'  ? smpAmt : smpMode === 'SPLIT' ? (r.smpSplit?.upi  ?? 0) : 0,
    svkCash: svkMode === 'CASH' ? svkAmt : svkMode === 'SPLIT' ? (r.svkSplit?.cash ?? 0) : 0,
    svkUpi:  svkMode === 'UPI'  ? svkAmt : svkMode === 'SPLIT' ? (r.svkSplit?.upi  ?? 0) : 0,
    addCash: addMode === 'CASH' ? addAmt : addMode === 'SPLIT' ? (r.additionalSplit?.cash ?? 0) : 0,
    addUpi:  addMode === 'UPI'  ? addAmt : addMode === 'SPLIT' ? (r.additionalSplit?.upi  ?? 0) : 0,
  };
}

function DayBreakdownModal({ day, records, onClose }: { day: DayEntry; records: FeeRecord[]; onClose: () => void }) {
  const dayRecords = useMemo(
    () =>
      records
        .filter((r) => r.date.slice(0, 10) === day.dateKey)
        .sort((a, b) => (parseInt(a.receiptNumber, 10) || 0) - (parseInt(b.receiptNumber, 10) || 0)),
    [records, day.dateKey],
  );

  const cashRecords = useMemo(
    () => dayRecords.filter((r) => { const s = getRecordSplit(r); return (s.smpCash + s.svkCash + s.addCash) > 0; }),
    [dayRecords],
  );
  const upiRecords = useMemo(
    () => dayRecords.filter((r) => { const s = getRecordSplit(r); return (s.smpUpi + s.svkUpi + s.addUpi) > 0; }),
    [dayRecords],
  );

  const cashTot = useMemo(() => cashRecords.reduce(
    (a, r) => { const s = getRecordSplit(r); return { smp: a.smp + s.smpCash, svk: a.svk + s.svkCash, add: a.add + s.addCash }; },
    { smp: 0, svk: 0, add: 0 },
  ), [cashRecords]);

  const upiTot = useMemo(() => upiRecords.reduce(
    (a, r) => { const s = getRecordSplit(r); return { smp: a.smp + s.smpUpi, svk: a.svk + s.svkUpi, add: a.add + s.addUpi }; },
    { smp: 0, svk: 0, add: 0 },
  ), [upiRecords]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function PaymentSection({
    sectionRecords,
    mode,
    totals,
  }: {
    sectionRecords: FeeRecord[];
    mode: 'CASH' | 'UPI';
    totals: { smp: number; svk: number; add: number };
  }) {
    const isCash  = mode === 'CASH';
    const hdrCls  = isCash ? 'bg-emerald-700' : 'bg-blue-700';
    const totBg   = isCash ? 'bg-emerald-100' : 'bg-blue-100';
    const totClr  = isCash ? 'text-green-700' : 'text-blue-700';
    const grand   = totals.smp + totals.svk + totals.add;
    const cell    = 'px-2 py-1.5 text-right text-[11px]';
    const hCell   = 'px-2 py-1.5 text-right font-semibold';

    if (sectionRecords.length === 0) {
      return (
        <div className={`rounded border px-4 py-3 text-xs text-gray-400 ${isCash ? 'border-emerald-200 bg-emerald-50/30' : 'border-blue-200 bg-blue-50/30'}`}>
          No {mode} payments on this day.
        </div>
      );
    }

    return (
      <div className="overflow-auto max-h-[186px] rounded-lg border border-gray-200">
        <table className="w-full text-[11px]">
          <thead className={`sticky top-0 z-10 ${hdrCls} text-white`}>
            <tr>
              <th className="px-2 py-1.5 text-center font-semibold">Sl</th>
              <th className="px-2 py-1.5 text-left font-semibold min-w-[130px]">Student Name</th>
              <th className="px-2 py-1.5 text-left font-semibold">Reg No</th>
              <th className="px-2 py-1.5 text-center font-semibold">Yr / Course</th>
              <th className="px-2 py-1.5 text-left font-semibold border-l border-white/30">SMP Rpt</th>
              <th className="px-2 py-1.5 text-left font-semibold">SVK Rpt</th>
              <th className="px-2 py-1.5 text-left font-semibold">Add Rpt</th>
              <th className={`${hCell} border-l border-white/30`}>SMP</th>
              <th className={hCell}>SVK</th>
              <th className={hCell}>Add</th>
              <th className={`${hCell} border-l border-white/30`}>{isCash ? 'Cash Total' : 'UPI Total'}</th>
            </tr>
          </thead>
          <tbody>
            {sectionRecords.map((r, i) => {
              const s       = getRecordSplit(r);
              const smpAmt  = isCash ? s.smpCash : s.smpUpi;
              const svkAmt  = isCash ? s.svkCash : s.svkUpi;
              const addAmt  = isCash ? s.addCash : s.addUpi;
              const rowTot  = smpAmt + svkAmt + addAmt;
              const yShort  = r.year.split(' ')[0];
              return (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                  <td className="px-2 py-1.5 font-medium truncate max-w-[160px]">{r.studentName}</td>
                  <td className="px-2 py-1.5 text-gray-500">{r.regNumber || '—'}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{yShort} / {r.course}</td>
                  <td className="px-2 py-1.5 border-l border-gray-100 font-mono">{r.receiptNumber || '—'}</td>
                  <td className="px-2 py-1.5 text-gray-500 font-mono">{r.svkReceiptNumber || '—'}</td>
                  <td className="px-2 py-1.5 text-gray-500 font-mono">{r.additionalReceiptNumber || '—'}</td>
                  <td className={`${cell} border-l border-gray-100`}>{smpAmt > 0 ? fmt(smpAmt) : '—'}</td>
                  <td className={cell}>{svkAmt > 0 ? fmt(svkAmt) : '—'}</td>
                  <td className={cell}>{addAmt > 0 ? fmt(addAmt) : '—'}</td>
                  <td className={`${cell} font-bold border-l border-gray-100`}>{fmt(rowTot)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className={`sticky bottom-0 z-10 ${totBg} font-bold border-t-2 border-gray-300 text-[11px]`}>
            <tr>
              <td className="px-2 py-2 text-center text-gray-400">—</td>
              <td className="px-2 py-2" colSpan={6}>
                {sectionRecords.length} payment{sectionRecords.length !== 1 ? 's' : ''}
              </td>
              <td className={`px-2 py-2 text-right ${totClr} border-l border-gray-200`}>{fmt(totals.smp)}</td>
              <td className={`px-2 py-2 text-right ${totClr}`}>{fmt(totals.svk)}</td>
              <td className={`px-2 py-2 text-right ${totClr}`}>{fmt(totals.add)}</td>
              <td className={`px-2 py-2 text-right ${totClr} border-l border-gray-200`}>{fmt(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Daily Collections — {day.dateLabel}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
              <span>{day.receiptCount} receipt{day.receiptCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{day.studentCount} student{day.studentCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span className="text-green-700 font-semibold">Cash: {fmt(day.cashTotal)}</span>
              <span>·</span>
              <span className="text-blue-700 font-semibold">UPI: {fmt(day.upiTotal)}</span>
              <span>·</span>
              <span className="font-semibold">Total: {fmt(day.dayTotal)}</span>
            </p>
          </div>
          <div className="ml-4 flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => exportDayBreakdownExcel(day, cashRecords, upiRecords)}
              className="px-3 py-1.5 rounded border border-gray-300 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              Excel
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-base font-bold leading-none transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Cash Payments
              </span>
              <span className="text-[10px] text-gray-400">
                {cashRecords.length} receipt{cashRecords.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
                {fmt(cashTot.smp + cashTot.svk + cashTot.add)} total
              </span>
            </div>
            <PaymentSection sectionRecords={cashRecords} mode="CASH" totals={cashTot} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                UPI Payments
              </span>
              <span className="text-[10px] text-gray-400">
                {upiRecords.length} receipt{upiRecords.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
                {fmt(upiTot.smp + upiTot.svk + upiTot.add)} total
              </span>
            </div>
            <PaymentSection sectionRecords={upiRecords} mode="UPI" totals={upiTot} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DailyCollectionsTab({ feeRecords, academicYear, showAllYears }: { feeRecords: FeeRecord[]; academicYear: string; showAllYears: boolean }) {
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [modeFilter,  setModeFilter]  = useState<'ALL' | 'CASH' | 'UPI'>('ALL');
  const [selectedDay, setSelectedDay] = useState<DayEntry | null>(null);

  const allDays = useMemo(() => buildDailyCollections(feeRecords), [feeRecords]);

  const filteredDays = useMemo(() => {
    let days = allDays;
    if (dateFrom)              days = days.filter((e) => e.dateKey >= dateFrom);
    if (dateTo)                days = days.filter((e) => e.dateKey <= dateTo);
    if (modeFilter === 'CASH') days = days.filter((e) => e.cashTotal > 0);
    if (modeFilter === 'UPI')  days = days.filter((e) => e.upiTotal  > 0);
    return days;
  }, [allDays, dateFrom, dateTo, modeFilter]);

  const totals = useMemo(
    () =>
      filteredDays.reduce(
        (a, e) => ({
          receiptCount: a.receiptCount + e.receiptCount,
          studentCount: a.studentCount + e.studentCount,
          smpCash:      a.smpCash      + e.smpCash,
          svkCash:      a.svkCash      + e.svkCash,
          addCash:      a.addCash      + e.addCash,
          cashTotal:    a.cashTotal    + e.cashTotal,
          smpUpi:       a.smpUpi       + e.smpUpi,
          svkUpi:       a.svkUpi       + e.svkUpi,
          addUpi:       a.addUpi       + e.addUpi,
          upiTotal:     a.upiTotal     + e.upiTotal,
          dayTotal:     a.dayTotal     + e.dayTotal,
        }),
        { receiptCount: 0, studentCount: 0, smpCash: 0, svkCash: 0, addCash: 0, cashTotal: 0, smpUpi: 0, svkUpi: 0, addUpi: 0, upiTotal: 0, dayTotal: 0 },
      ),
    [filteredDays],
  );

  const hasFilter = !!dateFrom || !!dateTo || modeFilter !== 'ALL';

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {selectedDay && (
        <DayBreakdownModal
          day={selectedDay}
          records={feeRecords}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* Summary strip + export */}
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <StatChipRow entries={[
          { label: 'Cash',     value: fmt(totals.cashTotal), color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'UPI',      value: fmt(totals.upiTotal),  color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
          { label: 'Total',    value: fmt(totals.dayTotal),  color: 'text-gray-900',    bg: 'bg-gray-50',    border: 'border-gray-200'    },
          { label: 'Receipts', value: totals.receiptCount,   color: 'text-purple-700',  bg: 'bg-purple-50',  border: 'border-purple-200'  },
        ]} />
        {showAllYears && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-400 bg-amber-50 text-[10px] font-semibold text-amber-700">
            Incl. Prior Year Dues
          </span>
        )}
        <div className="ml-auto">
          <ExportBar onExcel={() => exportDailyCollectionsExcel(filteredDays, academicYear)} />
        </div>
      </div>

      {/* Filters */}
      <FilterPanel hasActiveFilters={hasFilter} onClear={() => { setDateFrom(''); setDateTo(''); setModeFilter('ALL'); }}>
        <span className="text-xs text-gray-500 font-medium">From</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fs} />
        <span className="text-xs text-gray-500 font-medium">To</span>
        <input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}   className={fs} />
        <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value as 'ALL' | 'CASH' | 'UPI')} className={fs}>
          <option value="ALL">All Modes</option>
          <option value="CASH">Cash Only</option>
          <option value="UPI">UPI Only</option>
        </select>
      </FilterPanel>

      {/* Day-wise summary table — 13 columns */}
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className={`sticky top-0 z-10 ${ACCENT} text-white`}>
            <tr>
              <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
              <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Date</th>
              <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Receipts</th>
              <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Students</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={4}>Cash</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={4}>UPI</th>
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30" rowSpan={2}>Day Total</th>
            </tr>
            <tr>
              <th className="px-2 py-1 text-right font-semibold border-l border-white/30">SMP</th>
              <th className="px-2 py-1 text-right font-semibold">SVK</th>
              <th className="px-2 py-1 text-right font-semibold">Add</th>
              <th className="px-2 py-1 text-right font-semibold bg-emerald-600">Total</th>
              <th className="px-2 py-1 text-right font-semibold border-l border-white/30">SMP</th>
              <th className="px-2 py-1 text-right font-semibold">SVK</th>
              <th className="px-2 py-1 text-right font-semibold">Add</th>
              <th className="px-2 py-1 text-right font-semibold bg-blue-600">Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredDays.map((e, i) => (
              <tr
                key={e.dateKey}
                onClick={() => setSelectedDay(e)}
                className={`cursor-pointer transition-colors hover:bg-emerald-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
              >
                <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                <td className="px-2 py-1.5 font-medium text-emerald-700 underline-offset-2 hover:underline">{e.dateLabel}</td>
                <td className="px-2 py-1.5 text-center text-gray-600">{e.receiptCount}</td>
                <td className="px-2 py-1.5 text-center text-gray-600">{e.studentCount}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100 text-green-800">{e.smpCash > 0 ? fmt(e.smpCash) : '—'}</td>
                <td className="px-2 py-1.5 text-right text-green-800">{e.svkCash > 0 ? fmt(e.svkCash) : '—'}</td>
                <td className="px-2 py-1.5 text-right text-green-800">{e.addCash > 0 ? fmt(e.addCash) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-green-700 bg-green-50">{e.cashTotal > 0 ? fmt(e.cashTotal) : '—'}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100 text-blue-800">{e.smpUpi > 0 ? fmt(e.smpUpi) : '—'}</td>
                <td className="px-2 py-1.5 text-right text-blue-800">{e.svkUpi > 0 ? fmt(e.svkUpi) : '—'}</td>
                <td className="px-2 py-1.5 text-right text-blue-800">{e.addUpi > 0 ? fmt(e.addUpi) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-blue-700 bg-blue-50">{e.upiTotal > 0 ? fmt(e.upiTotal) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-bold border-l border-gray-100">{fmt(e.dayTotal)}</td>
              </tr>
            ))}
            {filteredDays.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-xs text-gray-400">
                  No collections found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
          {filteredDays.length > 0 && (
            <tfoot className={TFOOT}>
              <tr>
                <td className="px-2 py-2 text-center text-gray-400">—</td>
                <td className="px-2 py-2">Total — {filteredDays.length} day{filteredDays.length !== 1 ? 's' : ''}</td>
                <td className="px-2 py-2 text-center">{totals.receiptCount}</td>
                <td className="px-2 py-2 text-center">{totals.studentCount}</td>
                <td className="px-2 py-2 text-right border-l border-gray-200 text-green-800">{totals.smpCash > 0 ? fmt(totals.smpCash) : '—'}</td>
                <td className="px-2 py-2 text-right text-green-800">{totals.svkCash > 0 ? fmt(totals.svkCash) : '—'}</td>
                <td className="px-2 py-2 text-right text-green-800">{totals.addCash > 0 ? fmt(totals.addCash) : '—'}</td>
                <td className="px-2 py-2 text-right font-bold text-green-700">{fmt(totals.cashTotal)}</td>
                <td className="px-2 py-2 text-right border-l border-gray-200 text-blue-800">{totals.smpUpi > 0 ? fmt(totals.smpUpi) : '—'}</td>
                <td className="px-2 py-2 text-right text-blue-800">{totals.svkUpi > 0 ? fmt(totals.svkUpi) : '—'}</td>
                <td className="px-2 py-2 text-right text-blue-800">{totals.addUpi > 0 ? fmt(totals.addUpi) : '—'}</td>
                <td className="px-2 py-2 text-right font-bold text-blue-700">{fmt(totals.upiTotal)}</td>
                <td className="px-2 py-2 text-right font-bold border-l border-gray-200">{fmt(totals.dayTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Day Summary ──────────────────────────────────────────────────────────
function exportDaySummaryExcel(entries: DayEntry[], academicYear: string): void {
  const header = [
    'Date', 'Students',
    'SMP Cash', 'SMP UPI',
    'SVK Cash', 'SVK UPI',
    'Add Cash', 'Add UPI',
    'Day Total',
  ];
  const dataRows = entries.map((e) => [
    e.dateLabel, e.studentCount,
    e.smpCash || null, e.smpUpi || null,
    e.svkCash || null, e.svkUpi || null,
    e.addCash || null, e.addUpi || null,
    e.dayTotal,
  ]);
  const tot = entries.reduce(
    (a, e) => ({
      studentCount: a.studentCount + e.studentCount,
      smpCash: a.smpCash + e.smpCash, smpUpi: a.smpUpi + e.smpUpi,
      svkCash: a.svkCash + e.svkCash, svkUpi: a.svkUpi + e.svkUpi,
      addCash: a.addCash + e.addCash, addUpi: a.addUpi + e.addUpi,
      dayTotal: a.dayTotal + e.dayTotal,
    }),
    { studentCount: 0, smpCash: 0, smpUpi: 0, svkCash: 0, svkUpi: 0, addCash: 0, addUpi: 0, dayTotal: 0 },
  );
  const totRow = [
    'TOTAL', tot.studentCount,
    tot.smpCash || null, tot.smpUpi || null,
    tot.svkCash || null, tot.svkUpi || null,
    tot.addCash || null, tot.addUpi || null,
    tot.dayTotal,
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Day Summary');
  XLSX.writeFile(wb, `Day_Summary_${academicYear}.xlsx`);
}

function DaySummaryTab({ feeRecords, academicYear, showAllYears }: { feeRecords: FeeRecord[]; academicYear: string; showAllYears: boolean }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const allDays = useMemo(() => buildDailyCollections(feeRecords), [feeRecords]);

  const filteredDays = useMemo(() => {
    let days = allDays;
    if (dateFrom) days = days.filter((e) => e.dateKey >= dateFrom);
    if (dateTo)   days = days.filter((e) => e.dateKey <= dateTo);
    return days;
  }, [allDays, dateFrom, dateTo]);

  const totals = useMemo(
    () =>
      filteredDays.reduce(
        (a, e) => ({
          studentCount: a.studentCount + e.studentCount,
          smpCash:  a.smpCash  + e.smpCash,  smpUpi:  a.smpUpi  + e.smpUpi,
          svkCash:  a.svkCash  + e.svkCash,  svkUpi:  a.svkUpi  + e.svkUpi,
          addCash:  a.addCash  + e.addCash,  addUpi:  a.addUpi  + e.addUpi,
          dayTotal: a.dayTotal + e.dayTotal,
        }),
        { studentCount: 0, smpCash: 0, smpUpi: 0, svkCash: 0, svkUpi: 0, addCash: 0, addUpi: 0, dayTotal: 0 },
      ),
    [filteredDays],
  );

  const hasFilter = !!dateFrom || !!dateTo;

  const n = (v: number) => (v > 0 ? fmt(v) : '—');

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* Summary strip + export */}
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <StatChipRow entries={[
          { label: 'Cash',      value: fmt(totals.smpCash + totals.svkCash + totals.addCash), color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'UPI',       value: fmt(totals.smpUpi  + totals.svkUpi  + totals.addUpi),  color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
          { label: 'Total',     value: fmt(totals.dayTotal),                                   color: 'text-gray-900',    bg: 'bg-gray-50',    border: 'border-gray-200'    },
          { label: 'Days',      value: `${filteredDays.length} / ${allDays.length}`,            color: 'text-purple-700',  bg: 'bg-purple-50',  border: 'border-purple-200'  },
        ]} />
        {showAllYears && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-400 bg-amber-50 text-[10px] font-semibold text-amber-700">
            Incl. Prior Year Dues
          </span>
        )}
        <div className="ml-auto">
          <ExportBar onExcel={() => exportDaySummaryExcel(filteredDays, academicYear)} />
        </div>
      </div>

      {/* Filters */}
      <FilterPanel hasActiveFilters={hasFilter} onClear={() => { setDateFrom(''); setDateTo(''); }}>
        <span className="text-xs text-gray-500 font-medium">From</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fs} />
        <span className="text-xs text-gray-500 font-medium">To</span>
        <input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}   className={fs} />
      </FilterPanel>

      {/* Table */}
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-[11px] whitespace-nowrap">
          <thead className={`sticky top-0 z-10 ${ACCENT} text-white`}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold" rowSpan={2}>Date</th>
              <th className="px-2 py-2 text-center font-semibold" rowSpan={2}>Students</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-white/30" colSpan={2}>SMP</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-white/30" colSpan={2}>SVK</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-white/30" colSpan={2}>Additional</th>
              <th className="px-2 py-2 text-right font-semibold border-l border-white/30" rowSpan={2}>Day Total</th>
            </tr>
            <tr>
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30 bg-emerald-700/80">Cash</th>
              <th className="px-2 py-1.5 text-right font-semibold bg-blue-700/80">UPI</th>
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30 bg-emerald-700/80">Cash</th>
              <th className="px-2 py-1.5 text-right font-semibold bg-blue-700/80">UPI</th>
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30 bg-emerald-700/80">Cash</th>
              <th className="px-2 py-1.5 text-right font-semibold bg-blue-700/80">UPI</th>
            </tr>
          </thead>
          <tbody>
            {filteredDays.map((e, i) => (
              <tr key={e.dateKey} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-1.5 font-medium text-[#3B5B8A]">{e.dateLabel}</td>
                <td className="px-2 py-1.5 text-center text-gray-600">{e.studentCount}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100 text-emerald-700">{n(e.smpCash)}</td>
                <td className="px-2 py-1.5 text-right text-blue-700">{n(e.smpUpi)}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100 text-emerald-700">{n(e.svkCash)}</td>
                <td className="px-2 py-1.5 text-right text-blue-700">{n(e.svkUpi)}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100 text-emerald-700">{n(e.addCash)}</td>
                <td className="px-2 py-1.5 text-right text-blue-700">{n(e.addUpi)}</td>
                <td className="px-2 py-1.5 text-right font-bold border-l border-gray-100">{fmt(e.dayTotal)}</td>
              </tr>
            ))}
            {filteredDays.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-xs text-gray-400">
                  No collections found{hasFilter ? ' for the selected date range' : ''}.
                </td>
              </tr>
            )}
          </tbody>
          {filteredDays.length > 0 && (
            <tfoot className={TFOOT}>
              <tr>
                <td className="px-3 py-2 text-gray-700">Total — {filteredDays.length} day{filteredDays.length !== 1 ? 's' : ''}</td>
                <td className="px-2 py-2 text-center text-gray-700">{totals.studentCount}</td>
                <td className="px-2 py-2 text-right border-l border-gray-200 text-emerald-700">{n(totals.smpCash)}</td>
                <td className="px-2 py-2 text-right text-blue-700">{n(totals.smpUpi)}</td>
                <td className="px-2 py-2 text-right border-l border-gray-200 text-emerald-700">{n(totals.svkCash)}</td>
                <td className="px-2 py-2 text-right text-blue-700">{n(totals.svkUpi)}</td>
                <td className="px-2 py-2 text-right border-l border-gray-200 text-emerald-700">{n(totals.addCash)}</td>
                <td className="px-2 py-2 text-right text-blue-700">{n(totals.addUpi)}</td>
                <td className="px-2 py-2 text-right border-l border-gray-200 text-gray-900">{fmt(totals.dayTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Datewise Consolidated Headwise ───────────────────────────────────────
function DatewiseHeadwiseTab({ feeRecords, academicYear, fp, showAllYears }: { feeRecords: FeeRecord[]; academicYear: string; fp: CommonFilterProps; showAllYears: boolean }) {
  const entries: DatewiseHeadwiseEntry[] = useMemo(() => buildDatewiseHeadwise(feeRecords), [feeRecords]);

  const grandHeads = useMemo(() => {
    const totals = {} as Record<string, number>;
    for (const { key } of SMP_FEE_HEADS) totals[key] = 0;
    for (const e of entries) {
      for (const { key } of SMP_FEE_HEADS) totals[key] += e.heads[key];
    }
    return totals;
  }, [entries]);

  const grandTotal = useMemo(
    () => SMP_FEE_HEADS.reduce((s, { key }) => s + grandHeads[key], 0),
    [grandHeads],
  );

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="shrink-0">
        <CommonFilters fp={fp} extra={
          <>
            <span className="text-xs text-gray-500">{entries.length} day{entries.length !== 1 ? 's' : ''}</span>
            {grandTotal > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#3B5B8A]/30 bg-[#D0E2F2]/50 text-xs font-semibold text-[#3B5B8A]">
                {fmt(grandTotal)}
              </span>
            )}
            {showAllYears && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-400 bg-amber-50 text-[10px] font-semibold text-amber-700">
                Incl. Prior Dues
              </span>
            )}
            <ExportBar
              onPdf={() => exportDatewiseHeadwisePdf(entries, academicYear)}
              onExcel={() => exportDatewiseHeadwiseExcel(entries, academicYear)}
            />
          </>
        } />
      </div>
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-[11px] whitespace-nowrap">
          <thead className={`sticky top-0 z-10 ${ACCENT} text-white`}>
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Date</th>
              {SMP_FEE_HEADS.map(({ key, label }) => (
                <th key={key} className="px-2 py-1.5 text-right font-semibold">{label}</th>
              ))}
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30">Total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.dateKey} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-2 py-1.5 font-medium text-[#3B5B8A]">{e.dateLabel}</td>
                {SMP_FEE_HEADS.map(({ key }) => (
                  <td key={key} className="px-2 py-1.5 text-right">
                    {e.heads[key] > 0 ? fmt(e.heads[key]) : '—'}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-bold border-l border-gray-100">{fmt(e.total)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={SMP_FEE_HEADS.length + 2} className="px-3 py-6 text-center text-xs text-gray-400">
                  No fee records found.
                </td>
              </tr>
            )}
          </tbody>
          {entries.length > 0 && (
            <tfoot className={TFOOT}>
              <tr>
                <td className="px-2 py-2">Total</td>
                {SMP_FEE_HEADS.map(({ key }) => (
                  <td key={key} className="px-2 py-2 text-right">{fmt(grandHeads[key])}</td>
                ))}
                <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Bank Remittance ──────────────────────────────────────────────────────

const AIDED_COURSES_SET = new Set<Course>(['CE', 'ME', 'EC', 'CS']);

interface RemittanceSummary {
  smpCash: number; smpPay: number;
  svkCash: number; svkPay: number;
  rcCash:  number; rcPay:  number;
  insCash: number; insPay: number;
}

function buildRemittanceSummaries(
  records: FeeRecord[],
  dateFrom?: string,
  dateTo?: string,
): { aided: RemittanceSummary; unaided: RemittanceSummary } {
  const aided:   RemittanceSummary = { smpCash:0, smpPay:0, svkCash:0, svkPay:0, rcCash:0, rcPay:0, insCash:0, insPay:0 };
  const unaided: RemittanceSummary = { smpCash:0, smpPay:0, svkCash:0, svkPay:0, rcCash:0, rcPay:0, insCash:0, insPay:0 };

  for (const r of records) {
    const d = r.date.slice(0, 10);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo   && d > dateTo)   continue;

    const bucket  = AIDED_COURSES_SET.has(r.course) ? aided : unaided;
    const smpMode = r.smpPaymentMode        ?? r.paymentMode;
    const svkMode = r.svkPaymentMode        ?? r.paymentMode;
    const addMode = r.additionalPaymentMode ?? r.paymentMode;

    // SMP
    const smpAmt = SMP_FEE_HEADS.reduce((s, { key }) => s + r.smp[key], 0);
    bucket.smpCash += smpMode === 'CASH' ? smpAmt : smpMode === 'SPLIT' ? (r.smpSplit?.cash ?? 0) : 0;
    bucket.smpPay  += smpMode === 'UPI'  ? smpAmt : smpMode === 'SPLIT' ? (r.smpSplit?.upi  ?? 0) : 0;

    // SVK
    bucket.svkCash += svkMode === 'CASH' ? r.svk : svkMode === 'SPLIT' ? (r.svkSplit?.cash ?? 0) : 0;
    bucket.svkPay  += svkMode === 'UPI'  ? r.svk : svkMode === 'SPLIT' ? (r.svkSplit?.upi  ?? 0) : 0;

    // Additional heads — Red Cross & Insurance (pro-rated for SPLIT mode)
    const totalAdd = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
    if (totalAdd > 0) {
      const splitCash = addMode === 'SPLIT' ? (r.additionalSplit?.cash ?? 0) : 0;
      const splitUpi  = addMode === 'SPLIT' ? (r.additionalSplit?.upi  ?? 0) : 0;
      for (const head of r.additionalPaid) {
        const lbl   = head.label.toLowerCase();
        const ratio = head.amount / totalAdd;
        const cash  = addMode === 'CASH' ? head.amount : addMode === 'SPLIT' ? Math.round(splitCash * ratio) : 0;
        const pay   = addMode === 'UPI'  ? head.amount : addMode === 'SPLIT' ? Math.round(splitUpi  * ratio) : 0;
        if (lbl.includes('red cross') || lbl.includes('redcross')) { bucket.rcCash  += cash; bucket.rcPay  += pay; }
        else if (lbl.includes('insur'))                            { bucket.insCash += cash; bucket.insPay += pay; }
      }
    }
  }

  return { aided, unaided };
}

function BankRemittanceTable({
  aided, unaided, label,
}: {
  aided: RemittanceSummary;
  unaided: RemittanceSummary;
  label?: string;
}) {
  const rows = [
    { name: 'SMP',       aidedCash: aided.smpCash, aidedPay: aided.smpPay, unaidedCash: unaided.smpCash, unaidedPay: unaided.smpPay },
    { name: 'SVK',       aidedCash: aided.svkCash, aidedPay: aided.svkPay, unaidedCash: unaided.svkCash, unaidedPay: unaided.svkPay },
    { name: 'Red Cross', aidedCash: aided.rcCash,  aidedPay: aided.rcPay,  unaidedCash: unaided.rcCash,  unaidedPay: unaided.rcPay  },
    { name: 'Insurance', aidedCash: aided.insCash, aidedPay: aided.insPay, unaidedCash: unaided.insCash, unaidedPay: unaided.insPay },
  ];

  const totAidedCash   = rows.reduce((s, r) => s + r.aidedCash,   0);
  const totAidedPay    = rows.reduce((s, r) => s + r.aidedPay,    0);
  const totUnaidedCash = rows.reduce((s, r) => s + r.unaidedCash, 0);
  const totUnaidedPay  = rows.reduce((s, r) => s + r.unaidedPay,  0);
  const grandTotal     = totAidedCash + totAidedPay + totUnaidedCash + totUnaidedPay;

  const cell = 'px-4 py-2.5 text-sm';

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {label && (
        <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</span>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className={`${ACCENT} text-white`}>
          <tr>
            <th className="px-4 py-2 text-left font-semibold" rowSpan={2}>Fee Head</th>
            <th className="px-4 py-2 text-center font-semibold border-l border-white/20 bg-[#2e4a72]/70" colSpan={2}>Aided</th>
            <th className="px-4 py-2 text-center font-semibold border-l border-white/20 bg-slate-600/60" colSpan={2}>Unaided</th>
            <th className="px-4 py-2 text-right font-semibold border-l border-white/20" rowSpan={2}>Total</th>
          </tr>
          <tr>
            <th className="px-4 py-1.5 text-right text-xs font-semibold border-l border-white/20 bg-[#2e4a72]/50">Cash</th>
            <th className="px-4 py-1.5 text-right text-xs font-semibold bg-[#2e4a72]/50">Pay</th>
            <th className="px-4 py-1.5 text-right text-xs font-semibold border-l border-white/20 bg-slate-700/40">Cash</th>
            <th className="px-4 py-1.5 text-right text-xs font-semibold bg-slate-700/40">Pay</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => {
            const rowTotal = row.aidedCash + row.aidedPay + row.unaidedCash + row.unaidedPay;
            return (
              <tr key={row.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className={`${cell} font-semibold text-gray-700`}>{row.name}</td>
                <td className={`${cell} text-right border-l border-gray-100 ${row.aidedCash > 0 ? 'text-emerald-700 font-medium' : 'text-gray-300'}`}>{row.aidedCash > 0 ? fmt(row.aidedCash) : '—'}</td>
                <td className={`${cell} text-right ${row.aidedPay > 0 ? 'text-blue-700 font-medium' : 'text-gray-300'}`}>{row.aidedPay > 0 ? fmt(row.aidedPay) : '—'}</td>
                <td className={`${cell} text-right border-l border-gray-100 ${row.unaidedCash > 0 ? 'text-emerald-700 font-medium' : 'text-gray-300'}`}>{row.unaidedCash > 0 ? fmt(row.unaidedCash) : '—'}</td>
                <td className={`${cell} text-right ${row.unaidedPay > 0 ? 'text-blue-700 font-medium' : 'text-gray-300'}`}>{row.unaidedPay > 0 ? fmt(row.unaidedPay) : '—'}</td>
                <td className={`${cell} text-right font-bold border-l border-gray-100 text-gray-800`}>{rowTotal > 0 ? fmt(rowTotal) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300">
          <tr>
            <td className="px-4 py-2.5 font-bold">Total</td>
            <td className={`px-4 py-2.5 text-right border-l border-gray-200 ${totAidedCash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{totAidedCash > 0 ? fmt(totAidedCash) : '—'}</td>
            <td className={`px-4 py-2.5 text-right ${totAidedPay > 0 ? 'text-blue-700' : 'text-gray-300'}`}>{totAidedPay > 0 ? fmt(totAidedPay) : '—'}</td>
            <td className={`px-4 py-2.5 text-right border-l border-gray-200 ${totUnaidedCash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{totUnaidedCash > 0 ? fmt(totUnaidedCash) : '—'}</td>
            <td className={`px-4 py-2.5 text-right ${totUnaidedPay > 0 ? 'text-blue-700' : 'text-gray-300'}`}>{totUnaidedPay > 0 ? fmt(totUnaidedPay) : '—'}</td>
            <td className="px-4 py-2.5 text-right border-l border-gray-200 text-gray-900">{fmt(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function RemittanceAbstractTable({
  aided, unaided, label,
}: {
  aided: RemittanceSummary;
  unaided: RemittanceSummary;
  label?: string;
}) {
  type AbstractRow = { name: string; aided: number; unaided: number; mode: 'cash' | 'pay' };
  const groups: AbstractRow[][] = [
    [
      { name: 'SMP Cash', aided: aided.smpCash, unaided: unaided.smpCash, mode: 'cash' },
      { name: 'SMP Pay',  aided: aided.smpPay,  unaided: unaided.smpPay,  mode: 'pay'  },
    ],
    [
      { name: 'SVK Cash', aided: aided.svkCash, unaided: unaided.svkCash, mode: 'cash' },
      { name: 'SVK Pay',  aided: aided.svkPay,  unaided: unaided.svkPay,  mode: 'pay'  },
    ],
    [
      { name: 'RC Cash', aided: aided.rcCash, unaided: unaided.rcCash, mode: 'cash' },
      { name: 'RC Pay',  aided: aided.rcPay,  unaided: unaided.rcPay,  mode: 'pay'  },
    ],
    [
      { name: 'Ins Cash', aided: aided.insCash, unaided: unaided.insCash, mode: 'cash' },
      { name: 'Ins Pay',  aided: aided.insPay,  unaided: unaided.insPay,  mode: 'pay'  },
    ],
  ];

  const rows = groups.flat();
  const totAided   = rows.reduce((s, r) => s + r.aided,   0);
  const totUnaided = rows.reduce((s, r) => s + r.unaided, 0);
  const grandTotal = totAided + totUnaided;

  const cell = 'px-4 py-2 text-sm';

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden max-w-md">
      {label && (
        <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</span>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className={`${ACCENT} text-white`}>
          <tr>
            <th className="px-4 py-2 text-left font-semibold"></th>
            <th className="px-4 py-2 text-right font-semibold border-l border-white/20 bg-[#2e4a72]/70">Aided</th>
            <th className="px-4 py-2 text-right font-semibold border-l border-white/20 bg-slate-600/60">Unaided</th>
            <th className="px-4 py-2 text-right font-semibold border-l border-white/20">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {groups.map((group, gi) => (
            <Fragment key={group[0]!.name}>
              {group.map((row) => {
                const rowTotal = row.aided + row.unaided;
                return (
                  <tr key={row.name} className={gi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className={`${cell} font-semibold text-gray-700`}>{row.name}</td>
                    <td className={`${cell} text-right border-l border-gray-100 ${row.aided   > 0 ? (row.mode === 'cash' ? 'text-emerald-700' : 'text-blue-700') + ' font-medium' : 'text-gray-300'}`}>{row.aided   > 0 ? fmt(row.aided)   : '—'}</td>
                    <td className={`${cell} text-right border-l border-gray-100 ${row.unaided > 0 ? (row.mode === 'cash' ? 'text-emerald-700' : 'text-blue-700') + ' font-medium' : 'text-gray-300'}`}>{row.unaided > 0 ? fmt(row.unaided) : '—'}</td>
                    <td className={`${cell} text-right font-bold border-l border-gray-100 text-gray-800`}>{rowTotal > 0 ? fmt(rowTotal) : '—'}</td>
                  </tr>
                );
              })}
              {gi < groups.length - 1 && (
                <tr className="h-2">
                  <td colSpan={4} className="p-0" />
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300">
          <tr>
            <td className="px-4 py-2.5">Total</td>
            <td className={`px-4 py-2.5 text-right border-l border-gray-200 ${totAided   > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{totAided   > 0 ? fmt(totAided)   : '—'}</td>
            <td className={`px-4 py-2.5 text-right border-l border-gray-200 ${totUnaided > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{totUnaided > 0 ? fmt(totUnaided) : '—'}</td>
            <td className="px-4 py-2.5 text-right border-l border-gray-200 text-gray-900">{fmt(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const SBI_ACCOUNT    = '64049891981';
const CANARA_ACCOUNT = '19032200004180';

function BankAccountSummaryTable({ aided, unaided }: { aided: RemittanceSummary; unaided: RemittanceSummary }) {
  // SBI Aided breakdown
  const sbiAided = [
    { head: 'SMP',       cash: aided.smpCash, pay: aided.smpPay  },
    { head: 'Red Cross', cash: aided.rcCash,  pay: aided.rcPay   },
    { head: 'Insurance', cash: aided.insCash, pay: aided.insPay  },
  ];
  const sbiAidedCash = sbiAided.reduce((s, r) => s + r.cash, 0);
  const sbiAidedPay  = sbiAided.reduce((s, r) => s + r.pay,  0);

  // SBI Unaided breakdown
  const sbiUnaided = [
    { head: 'SMP',       cash: unaided.smpCash, pay: unaided.smpPay  },
    { head: 'Red Cross', cash: unaided.rcCash,  pay: unaided.rcPay   },
    { head: 'Insurance', cash: unaided.insCash, pay: unaided.insPay  },
  ];
  const sbiUnaidedCash = sbiUnaided.reduce((s, r) => s + r.cash, 0);
  const sbiUnaidedPay  = sbiUnaided.reduce((s, r) => s + r.pay,  0);

  const sbiCash = sbiAidedCash + sbiUnaidedCash;
  const sbiPay  = sbiAidedPay  + sbiUnaidedPay;

  // SVK
  const svkAidedCash   = aided.svkCash;
  const svkAidedPay    = aided.svkPay;
  const svkUnaidedCash = unaided.svkCash;
  const svkUnaidedPay  = unaided.svkPay;
  const svkCash        = svkAidedCash + svkUnaidedCash;
  const svkPay         = svkAidedPay  + svkUnaidedPay;

  const grandCash = sbiCash + svkCash;
  const grandPay  = sbiPay  + svkPay;

  const detailCell = 'px-3 py-2 text-sm';
  const subCell    = 'px-4 py-2 text-sm font-bold';

  const moneyCls = (v: number, pos: string) => v > 0 ? pos : 'text-gray-300';

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Bank Account Summary</span>
      </div>
      <table className="w-full text-sm">
        <thead className={`${ACCENT} text-white`}>
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Bank</th>
            <th className="px-4 py-2 text-left font-semibold">Account No.</th>
            <th className="px-4 py-2 text-left font-semibold">Challan</th>
            <th className="px-4 py-2 text-left font-semibold">Fee Head</th>
            <th className="px-4 py-2 text-right font-semibold border-l border-white/20">Cash (Challan)</th>
            <th className="px-4 py-2 text-right font-semibold">Pay (UPI)</th>
            <th className="px-4 py-2 text-right font-semibold border-l border-white/20">Total</th>
          </tr>
        </thead>
        <tbody>
          {/* ── SBI Aided detail rows ── */}
          {sbiAided.map((row, i) => (
            <tr key={'sbi-aided-' + row.head} className="bg-blue-50 border-b border-blue-100">
              {i === 0 && (
                <>
                  <td className={`${subCell} text-blue-700`} rowSpan={sbiAided.length}>SBI Ppl</td>
                  <td className={`${detailCell} font-mono text-gray-500`} rowSpan={sbiAided.length}>{SBI_ACCOUNT}</td>
                  <td className={`${detailCell} font-semibold text-blue-600`} rowSpan={sbiAided.length}>Aided</td>
                </>
              )}
              <td className={`${detailCell} pl-5 text-gray-600`}>{row.head}</td>
              <td className={`${detailCell} text-right border-l border-blue-100 font-medium ${moneyCls(row.cash, 'text-emerald-700')}`}>{row.cash > 0 ? fmt(row.cash) : '—'}</td>
              <td className={`${detailCell} text-right font-medium ${moneyCls(row.pay, 'text-blue-700')}`}>{row.pay > 0 ? fmt(row.pay) : '—'}</td>
              <td className={`${detailCell} text-right font-semibold border-l border-blue-100 text-blue-600`}>{(row.cash + row.pay) > 0 ? fmt(row.cash + row.pay) : '—'}</td>
            </tr>
          ))}
          {/* SBI Aided sub-total */}
          <tr className="bg-blue-100 border-b border-blue-200">
            <td className="px-4 py-1.5 text-xs font-bold text-blue-700 italic" colSpan={4}>Aided Sub-total</td>
            <td className={`px-4 py-1.5 text-right text-xs font-bold border-l border-blue-200 ${moneyCls(sbiAidedCash, 'text-emerald-700')}`}>{sbiAidedCash > 0 ? fmt(sbiAidedCash) : '—'}</td>
            <td className={`px-4 py-1.5 text-right text-xs font-bold ${moneyCls(sbiAidedPay, 'text-blue-700')}`}>{sbiAidedPay > 0 ? fmt(sbiAidedPay) : '—'}</td>
            <td className="px-4 py-1.5 text-right text-xs font-bold border-l border-blue-200 text-blue-700">{(sbiAidedCash + sbiAidedPay) > 0 ? fmt(sbiAidedCash + sbiAidedPay) : '—'}</td>
          </tr>

          {/* ── SBI Unaided detail rows ── */}
          {sbiUnaided.map((row, i) => (
            <tr key={'sbi-unaided-' + row.head} className="bg-indigo-50/60 border-b border-indigo-100">
              {i === 0 && (
                <>
                  <td className={`${subCell} text-blue-400`} rowSpan={sbiUnaided.length}></td>
                  <td className={`${detailCell} font-mono text-gray-400`} rowSpan={sbiUnaided.length}>{SBI_ACCOUNT}</td>
                  <td className={`${detailCell} font-semibold text-indigo-500`} rowSpan={sbiUnaided.length}>Unaided</td>
                </>
              )}
              <td className={`${detailCell} pl-5 text-gray-600`}>{row.head}</td>
              <td className={`${detailCell} text-right border-l border-indigo-100 font-medium ${moneyCls(row.cash, 'text-emerald-700')}`}>{row.cash > 0 ? fmt(row.cash) : '—'}</td>
              <td className={`${detailCell} text-right font-medium ${moneyCls(row.pay, 'text-blue-700')}`}>{row.pay > 0 ? fmt(row.pay) : '—'}</td>
              <td className={`${detailCell} text-right font-semibold border-l border-indigo-100 text-indigo-500`}>{(row.cash + row.pay) > 0 ? fmt(row.cash + row.pay) : '—'}</td>
            </tr>
          ))}
          {/* SBI Unaided sub-total */}
          <tr className="bg-indigo-100 border-b border-indigo-200">
            <td className="px-4 py-1.5 text-xs font-bold text-indigo-700 italic" colSpan={4}>Unaided Sub-total</td>
            <td className={`px-4 py-1.5 text-right text-xs font-bold border-l border-indigo-200 ${moneyCls(sbiUnaidedCash, 'text-emerald-700')}`}>{sbiUnaidedCash > 0 ? fmt(sbiUnaidedCash) : '—'}</td>
            <td className={`px-4 py-1.5 text-right text-xs font-bold ${moneyCls(sbiUnaidedPay, 'text-blue-700')}`}>{sbiUnaidedPay > 0 ? fmt(sbiUnaidedPay) : '—'}</td>
            <td className="px-4 py-1.5 text-right text-xs font-bold border-l border-indigo-200 text-indigo-700">{(sbiUnaidedCash + sbiUnaidedPay) > 0 ? fmt(sbiUnaidedCash + sbiUnaidedPay) : '—'}</td>
          </tr>
          {/* SBI Grand sub-total */}
          <tr className="bg-blue-200 border-b-2 border-blue-400">
            <td className="px-4 py-2 font-bold text-blue-900 text-xs uppercase tracking-wide" colSpan={4}>SBI Sub-total</td>
            <td className={`px-4 py-2 text-right font-bold border-l border-blue-300 ${moneyCls(sbiCash, 'text-emerald-800')}`}>{sbiCash > 0 ? fmt(sbiCash) : '—'}</td>
            <td className={`px-4 py-2 text-right font-bold ${moneyCls(sbiPay, 'text-blue-800')}`}>{sbiPay > 0 ? fmt(sbiPay) : '—'}</td>
            <td className="px-4 py-2 text-right font-bold border-l border-blue-300 text-blue-900">{(sbiCash + sbiPay) > 0 ? fmt(sbiCash + sbiPay) : '—'}</td>
          </tr>

          {/* ── SVK Aided ── */}
          <tr className="bg-emerald-50 border-b border-emerald-100">
            <td className={`${subCell} text-emerald-700`}>SVK Mgt</td>
            <td className={`${detailCell} font-mono text-gray-500`}>{CANARA_ACCOUNT}</td>
            <td className={`${detailCell} font-semibold text-emerald-600`}>Aided</td>
            <td className={`${detailCell} pl-5 text-gray-600`}>SVK</td>
            <td className={`${detailCell} text-right border-l border-emerald-100 font-medium ${moneyCls(svkAidedCash, 'text-emerald-700')}`}>{svkAidedCash > 0 ? fmt(svkAidedCash) : '—'}</td>
            <td className={`${detailCell} text-right font-medium ${moneyCls(svkAidedPay, 'text-blue-700')}`}>{svkAidedPay > 0 ? fmt(svkAidedPay) : '—'}</td>
            <td className={`${detailCell} text-right font-semibold border-l border-emerald-100 text-emerald-700`}>{(svkAidedCash + svkAidedPay) > 0 ? fmt(svkAidedCash + svkAidedPay) : '—'}</td>
          </tr>
          {/* ── SVK Unaided ── */}
          <tr className="bg-emerald-50/60 border-b border-emerald-100">
            <td className={`${subCell} text-emerald-300`}></td>
            <td className={`${detailCell} font-mono text-gray-400`}>{CANARA_ACCOUNT}</td>
            <td className={`${detailCell} font-semibold text-slate-500`}>Unaided</td>
            <td className={`${detailCell} pl-5 text-gray-600`}>SVK</td>
            <td className={`${detailCell} text-right border-l border-emerald-100 font-medium ${moneyCls(svkUnaidedCash, 'text-emerald-700')}`}>{svkUnaidedCash > 0 ? fmt(svkUnaidedCash) : '—'}</td>
            <td className={`${detailCell} text-right font-medium ${moneyCls(svkUnaidedPay, 'text-blue-700')}`}>{svkUnaidedPay > 0 ? fmt(svkUnaidedPay) : '—'}</td>
            <td className={`${detailCell} text-right font-semibold border-l border-emerald-100 text-slate-600`}>{(svkUnaidedCash + svkUnaidedPay) > 0 ? fmt(svkUnaidedCash + svkUnaidedPay) : '—'}</td>
          </tr>
          {/* SVK sub-total */}
          <tr className="bg-emerald-200 border-b-2 border-emerald-400">
            <td className="px-4 py-2 font-bold text-emerald-900 text-xs uppercase tracking-wide" colSpan={4}>SVK Sub-total</td>
            <td className={`px-4 py-2 text-right font-bold border-l border-emerald-300 ${moneyCls(svkCash, 'text-emerald-800')}`}>{svkCash > 0 ? fmt(svkCash) : '—'}</td>
            <td className={`px-4 py-2 text-right font-bold ${moneyCls(svkPay, 'text-blue-800')}`}>{svkPay > 0 ? fmt(svkPay) : '—'}</td>
            <td className="px-4 py-2 text-right font-bold border-l border-emerald-300 text-emerald-900">{(svkCash + svkPay) > 0 ? fmt(svkCash + svkPay) : '—'}</td>
          </tr>
        </tbody>
        <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300">
          <tr>
            <td className="px-4 py-2.5" colSpan={4}>Grand Total</td>
            <td className={`px-4 py-2.5 text-right border-l border-gray-200 ${grandCash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{grandCash > 0 ? fmt(grandCash) : '—'}</td>
            <td className={`px-4 py-2.5 text-right ${grandPay > 0 ? 'text-blue-700' : 'text-gray-300'}`}>{grandPay > 0 ? fmt(grandPay) : '—'}</td>
            <td className="px-4 py-2.5 text-right border-l border-gray-200 text-gray-900">{fmt(grandCash + grandPay)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────

function exportRemittanceExcel(aided: RemittanceSummary, unaided: RemittanceSummary, label: string, academicYear: string): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Fee Head Breakup
  const feeRows: (string | number)[][] = [
    ['Fee Head', 'Aided Cash', 'Aided Pay', 'Unaided Cash', 'Unaided Pay', 'Total'],
    ['SMP',       aided.smpCash, aided.smpPay, unaided.smpCash, unaided.smpPay, aided.smpCash + aided.smpPay + unaided.smpCash + unaided.smpPay],
    ['SVK',       aided.svkCash, aided.svkPay, unaided.svkCash, unaided.svkPay, aided.svkCash + aided.svkPay + unaided.svkCash + unaided.svkPay],
    ['Red Cross', aided.rcCash,  aided.rcPay,  unaided.rcCash,  unaided.rcPay,  aided.rcCash  + aided.rcPay  + unaided.rcCash  + unaided.rcPay],
    ['Insurance', aided.insCash, aided.insPay, unaided.insCash, unaided.insPay, aided.insCash + aided.insPay + unaided.insCash + unaided.insPay],
  ];
  const feeTotal = (k: keyof RemittanceSummary) => aided[k] + unaided[k];
  feeRows.push(['Total',
    feeTotal('smpCash') + feeTotal('rcCash') + feeTotal('insCash'),
    feeTotal('smpPay')  + feeTotal('rcPay')  + feeTotal('insPay'),
    feeTotal('smpCash') + feeTotal('rcCash') + feeTotal('insCash'),
    feeTotal('smpPay')  + feeTotal('rcPay')  + feeTotal('insPay'),
    ['smpCash','smpPay','svkCash','svkPay','rcCash','rcPay','insCash','insPay'].reduce((s, k) => s + aided[k as keyof RemittanceSummary] + unaided[k as keyof RemittanceSummary], 0),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(feeRows), 'Fee Head Breakup');

  // Sheet 2 — Bank Account Summary
  const sbi = [
    { challan: 'Aided',   head: 'SMP',       cash: aided.smpCash,   pay: aided.smpPay   },
    { challan: 'Aided',   head: 'Red Cross',  cash: aided.rcCash,    pay: aided.rcPay    },
    { challan: 'Aided',   head: 'Insurance',  cash: aided.insCash,   pay: aided.insPay   },
    { challan: 'Unaided', head: 'SMP',        cash: unaided.smpCash, pay: unaided.smpPay },
    { challan: 'Unaided', head: 'Red Cross',  cash: unaided.rcCash,  pay: unaided.rcPay  },
    { challan: 'Unaided', head: 'Insurance',  cash: unaided.insCash, pay: unaided.insPay },
  ];
  const sbiAidedCash   = aided.smpCash   + aided.rcCash   + aided.insCash;
  const sbiAidedPay    = aided.smpPay    + aided.rcPay    + aided.insPay;
  const sbiUnaidedCash = unaided.smpCash + unaided.rcCash + unaided.insCash;
  const sbiUnaidedPay  = unaided.smpPay  + unaided.rcPay  + unaided.insPay;
  const sbiCash = sbiAidedCash + sbiUnaidedCash;
  const sbiPay  = sbiAidedPay  + sbiUnaidedPay;
  const svkCash = aided.svkCash + unaided.svkCash;
  const svkPay  = aided.svkPay  + unaided.svkPay;

  const bankRows: (string | number)[][] = [
    ['Bank', 'Account No.', 'Challan', 'Fee Head', 'Cash (Challan)', 'Pay (UPI)', 'Total'],
    ...sbi.map((r) => [SBI_ACCOUNT === r.challan ? 'SBI Ppl' : 'SBI Ppl', SBI_ACCOUNT, r.challan, r.head, r.cash || '', r.pay || '', (r.cash + r.pay) || '']),
    ['SBI Aided Sub-total',   '', '', '', sbiAidedCash   || '', sbiAidedPay   || '', (sbiAidedCash   + sbiAidedPay)   || ''],
    ['SBI Unaided Sub-total', '', '', '', sbiUnaidedCash || '', sbiUnaidedPay || '', (sbiUnaidedCash + sbiUnaidedPay) || ''],
    ['SBI Sub-total',         '', '', '', sbiCash        || '', sbiPay        || '', (sbiCash        + sbiPay)        || ''],
    ['SVK Mgt', CANARA_ACCOUNT, 'Aided',   'SVK', aided.svkCash   || '', aided.svkPay   || '', (aided.svkCash   + aided.svkPay)   || ''],
    ['SVK Mgt', CANARA_ACCOUNT, 'Unaided', 'SVK', unaided.svkCash || '', unaided.svkPay || '', (unaided.svkCash + unaided.svkPay) || ''],
    ['SVK Sub-total', '', '', '', svkCash || '', svkPay || '', (svkCash + svkPay) || ''],
    ['Grand Total', '', '', '', (sbiCash + svkCash) || '', (sbiPay + svkPay) || '', (sbiCash + svkCash + sbiPay + svkPay) || ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bankRows), 'Bank Account Summary');

  XLSX.writeFile(wb, `Bank_Remittance_${label.replace(/[^a-zA-Z0-9]/g, '_')}_${academicYear}.xlsx`);
}

function exportRemittancePdf(aided: RemittanceSummary, unaided: RemittanceSummary, label: string, academicYear: string): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 14;

  const dateStr = (() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}-${d.toLocaleString('en-US',{month:'short'})}-${String(d.getFullYear()).slice(2)}`;
  })();

  const HEAD: [number,number,number] = [55, 65, 81];   // gray-700
  const WHITE: [number,number,number] = [255,255,255];
  const NEAR_BLACK: [number,number,number] = [25,25,25];
  const GRID: [number,number,number] = [210,215,220];
  const BLUE: [number,number,number] = [29,78,216];
  const BLUE_LIGHT: [number,number,number] = [239,246,255];
  const INDIGO_LIGHT: [number,number,number] = [238,242,255];
  const GREEN_LIGHT: [number,number,number] = [236,253,245];
  const BLUE_SUB: [number,number,number] = [191,219,254];
  const GREEN_SUB: [number,number,number] = [167,243,208];

  const headStyles = { fillColor: HEAD, textColor: WHITE, fontStyle: 'bold' as const, fontSize: 8, cellPadding: { top:2, right:3, bottom:2, left:3 }, lineWidth: 0 };
  const bodyStyles = { fontSize: 8, cellPadding: { top:2, right:3, bottom:2, left:3 }, fillColor: WHITE, textColor: NEAR_BLACK, lineColor: GRID, lineWidth: 0.18 };

  // Title
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NEAR_BLACK);
  doc.text(`Bank Remittance — ${academicYear}`, W / 2, 12, { align: 'center' });
  doc.setFontSize(9); doc.text(label, W / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120,120,120);
  doc.text(`Generated: ${dateStr}`, W / 2, 23, { align: 'center' });
  doc.setTextColor(...NEAR_BLACK);

  const fmtN = (v: number) => v > 0 ? v.toLocaleString('en-IN') : '—';

  // ── Table 1: Fee Head Breakup ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NEAR_BLACK);
  doc.text('Fee Head Breakup', MARGIN, 28);

  const feeHeads = [
    { name: 'SMP',       aC: aided.smpCash, aP: aided.smpPay, uC: unaided.smpCash, uP: unaided.smpPay },
    { name: 'SVK',       aC: aided.svkCash, aP: aided.svkPay, uC: unaided.svkCash, uP: unaided.svkPay },
    { name: 'Red Cross', aC: aided.rcCash,  aP: aided.rcPay,  uC: unaided.rcCash,  uP: unaided.rcPay  },
    { name: 'Insurance', aC: aided.insCash, aP: aided.insPay, uC: unaided.insCash, uP: unaided.insPay },
  ];
  const feeBody = feeHeads.map((r) => [r.name, fmtN(r.aC), fmtN(r.aP), fmtN(r.uC), fmtN(r.uP), fmtN(r.aC+r.aP+r.uC+r.uP)]);
  const totAC = feeHeads.reduce((s,r)=>s+r.aC,0), totAP = feeHeads.reduce((s,r)=>s+r.aP,0);
  const totUC = feeHeads.reduce((s,r)=>s+r.uC,0), totUP = feeHeads.reduce((s,r)=>s+r.uP,0);
  feeBody.push(['Total', fmtN(totAC), fmtN(totAP), fmtN(totUC), fmtN(totUP), fmtN(totAC+totAP+totUC+totUP)]);

  autoTable(doc, {
    startY: 31, margin: { left: MARGIN, right: MARGIN },
    head: [['Fee Head', 'Aided Cash', 'Aided Pay', 'Unaided Cash', 'Unaided Pay', 'Total']],
    body: feeBody,
    headStyles,
    bodyStyles,
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { halign: 'right' }, 2: { halign: 'right' },
      3: { halign: 'right' }, 4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.row.index === feeBody.length - 1) {
        data.cell.styles.fillColor = HEAD;
        data.cell.styles.textColor = WHITE;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ── Table 2: Bank Account Summary ──
  const afterFee = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NEAR_BLACK);
  doc.text('Bank Account Summary', MARGIN, afterFee);

  const sbiAidedCash   = aided.smpCash   + aided.rcCash   + aided.insCash;
  const sbiAidedPay    = aided.smpPay    + aided.rcPay    + aided.insPay;
  const sbiUnaidedCash = unaided.smpCash + unaided.rcCash + unaided.insCash;
  const sbiUnaidedPay  = unaided.smpPay  + unaided.rcPay  + unaided.insPay;
  const sbiCash = sbiAidedCash + sbiUnaidedCash;
  const sbiPay  = sbiAidedPay  + sbiUnaidedPay;
  const svkAC = aided.svkCash, svkAP = aided.svkPay;
  const svkUC = unaided.svkCash, svkUP = unaided.svkPay;
  const svkCash = svkAC + svkUC, svkPay = svkAP + svkUP;

  const bankBody: (string | number)[][] = [
    ['SBI Ppl', SBI_ACCOUNT,    'Aided',   'SMP',       fmtN(aided.smpCash), fmtN(aided.smpPay), fmtN(aided.smpCash+aided.smpPay)],
    ['',        SBI_ACCOUNT,    '',        'Red Cross',  fmtN(aided.rcCash),  fmtN(aided.rcPay),  fmtN(aided.rcCash+aided.rcPay)],
    ['',        SBI_ACCOUNT,    '',        'Insurance',  fmtN(aided.insCash), fmtN(aided.insPay), fmtN(aided.insCash+aided.insPay)],
    ['',        'Aided Sub-total','',      '',           fmtN(sbiAidedCash),  fmtN(sbiAidedPay),  fmtN(sbiAidedCash+sbiAidedPay)],
    ['',        SBI_ACCOUNT,    'Unaided', 'SMP',       fmtN(unaided.smpCash), fmtN(unaided.smpPay), fmtN(unaided.smpCash+unaided.smpPay)],
    ['',        SBI_ACCOUNT,    '',        'Red Cross',  fmtN(unaided.rcCash),  fmtN(unaided.rcPay),  fmtN(unaided.rcCash+unaided.rcPay)],
    ['',        SBI_ACCOUNT,    '',        'Insurance',  fmtN(unaided.insCash), fmtN(unaided.insPay), fmtN(unaided.insCash+unaided.insPay)],
    ['',        'Unaided Sub-total','',   '',           fmtN(sbiUnaidedCash),  fmtN(sbiUnaidedPay),  fmtN(sbiUnaidedCash+sbiUnaidedPay)],
    ['SBI Sub-total', '', '', '',         fmtN(sbiCash), fmtN(sbiPay),         fmtN(sbiCash+sbiPay)],
    ['SVK Mgt', CANARA_ACCOUNT, 'Aided',  'SVK',        fmtN(svkAC), fmtN(svkAP), fmtN(svkAC+svkAP)],
    ['',        CANARA_ACCOUNT, 'Unaided','SVK',         fmtN(svkUC), fmtN(svkUP), fmtN(svkUC+svkUP)],
    ['SVK Sub-total', '', '', '',         fmtN(svkCash), fmtN(svkPay),         fmtN(svkCash+svkPay)],
    ['Grand Total', '', '', '',           fmtN(sbiCash+svkCash), fmtN(sbiPay+svkPay), fmtN(sbiCash+svkCash+sbiPay+svkPay)],
  ];

  const sbiAidedRows   = [0,1,2];
  const sbiAidedSubRow = 3;
  const sbiUnaidedRows = [4,5,6];
  const sbiUnaidedSubRow = 7;
  const sbiSubRow = 8;
  const svkRows = [9,10];
  const svkSubRow = 11;
  const grandRow = 12;

  autoTable(doc, {
    startY: afterFee + 2, margin: { left: MARGIN, right: MARGIN },
    head: [['Bank', 'Account No.', 'Challan', 'Fee Head', 'Cash (Challan)', 'Pay (UPI)', 'Total']],
    body: bankBody,
    headStyles,
    bodyStyles,
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: 'bold' },
      1: { cellWidth: 36, font: 'courier', fontSize: 7 },
      2: { cellWidth: 22 },
      3: { cellWidth: 26 },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell(data) {
      if (data.section !== 'body') return;
      const i = data.row.index;
      if (sbiAidedRows.includes(i))   { data.cell.styles.fillColor = BLUE_LIGHT; }
      if (sbiUnaidedRows.includes(i)) { data.cell.styles.fillColor = INDIGO_LIGHT; }
      if (svkRows.includes(i))        { data.cell.styles.fillColor = GREEN_LIGHT; }
      if (i === sbiAidedSubRow || i === sbiUnaidedSubRow) {
        data.cell.styles.fillColor = BLUE_SUB;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = BLUE;
      }
      if (i === sbiSubRow || i === svkSubRow) {
        data.cell.styles.fillColor = BLUE_SUB;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [30, 64, 175];
      }
      if (i === svkSubRow) {
        data.cell.styles.fillColor = GREEN_SUB;
        data.cell.styles.textColor = [6, 95, 70];
      }
      if (i === grandRow) {
        data.cell.styles.fillColor = HEAD;
        data.cell.styles.textColor = WHITE;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Footers
  const pages = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(160,160,160);
    doc.text(`Bank Remittance ${academicYear}`, MARGIN, H - 5);
    doc.text(`Page ${p} of ${pages}`, W - MARGIN, H - 5, { align: 'right' });
  }

  doc.save(`Bank_Remittance_${label.replace(/[^a-zA-Z0-9]/g,'_')}_${academicYear}.pdf`);
}

function exportRemittanceTrackerPdf(
  label: string,
  academicYear: string,
  summaryTable: { head: string[]; body: (string | number)[][]; foot?: (string | number)[] },
  logTable: { head: string[]; body: (string | number)[][] },
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 14;

  const dateStr = (() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}-${d.toLocaleString('en-US',{month:'short'})}-${String(d.getFullYear()).slice(2)}`;
  })();

  const HEAD: [number,number,number] = [55, 65, 81];
  const WHITE: [number,number,number] = [255,255,255];
  const NEAR_BLACK: [number,number,number] = [25,25,25];
  const GRID: [number,number,number] = [210,215,220];

  const headStyles = { fillColor: HEAD, textColor: WHITE, fontStyle: 'bold' as const, fontSize: 8, cellPadding: { top:2, right:3, bottom:2, left:3 }, lineWidth: 0 };
  const bodyStyles = { fontSize: 8, cellPadding: { top:2, right:3, bottom:2, left:3 }, fillColor: WHITE, textColor: NEAR_BLACK, lineColor: GRID, lineWidth: 0.18, overflow: 'linebreak' as const };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NEAR_BLACK);
  doc.text(`Remittance Tracker — ${academicYear}`, W / 2, 12, { align: 'center' });
  doc.setFontSize(9); doc.text(label, W / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120,120,120);
  doc.text(`Generated: ${dateStr}`, W / 2, 23, { align: 'center' });
  doc.setTextColor(...NEAR_BLACK);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Summary', MARGIN, 28);

  const body1 = summaryTable.foot ? [...summaryTable.body, summaryTable.foot] : summaryTable.body;

  autoTable(doc, {
    startY: 31, margin: { left: MARGIN, right: MARGIN },
    head: [summaryTable.head],
    body: body1,
    headStyles,
    bodyStyles,
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: { 0: { cellWidth: 44, halign: 'left' } },
    didParseCell(data) {
      if (data.column.index > 0) data.cell.styles.halign = 'right';
      if (summaryTable.foot && data.section === 'body' && data.row.index === body1.length - 1) {
        data.cell.styles.fillColor = HEAD;
        data.cell.styles.textColor = WHITE;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const afterSummary = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NEAR_BLACK);
  doc.text('Payment Log', MARGIN, afterSummary);

  autoTable(doc, {
    startY: afterSummary + 3, margin: { left: MARGIN, right: MARGIN },
    head: [logTable.head],
    body: logTable.body,
    headStyles,
    bodyStyles,
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: { [logTable.head.length - 1]: { halign: 'right', fontStyle: 'bold' } },
  });

  const pages = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(160,160,160);
    doc.text(`Remittance Tracker ${academicYear}`, MARGIN, H - 5);
    doc.text(`Page ${p} of ${pages}`, W - MARGIN, H - 5, { align: 'right' });
  }

  doc.save(`Remittance_${label.replace(/[^a-zA-Z0-9]/g,'_')}_${academicYear}.pdf`);
}

function BankRemittanceTab({ feeRecords, academicYear, showAllYears }: { feeRecords: FeeRecord[]; academicYear: string; showAllYears: boolean }) {
  const availableDates = useMemo(
    () => [...new Set(feeRecords.map((r) => r.date.slice(0, 10)))].sort(),
    [feeRecords],
  );

  const [viewMode,     setViewMode]     = useState<'daily' | 'period'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(() => availableDates[availableDates.length - 1] ?? new Date().toISOString().slice(0, 10));
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');

  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[availableDates.length - 1]);
    }
  }, [availableDates, selectedDate]);

  const dateIdx  = availableDates.indexOf(selectedDate);
  const prevDate = dateIdx > 0 ? availableDates[dateIdx - 1] : null;
  const nextDate = dateIdx !== -1 && dateIdx < availableDates.length - 1 ? availableDates[dateIdx + 1] : null;

  const dailySummary = useMemo(
    () => buildRemittanceSummaries(feeRecords, selectedDate, selectedDate),
    [feeRecords, selectedDate],
  );

  const periodSummary = useMemo(
    () => viewMode === 'period' ? buildRemittanceSummaries(feeRecords, dateFrom || undefined, dateTo || undefined) : null,
    [feeRecords, viewMode, dateFrom, dateTo],
  );

  const exportLabel = useMemo(
    () => viewMode === 'daily'
      ? formatDayLabel(selectedDate)
      : (dateFrom || dateTo) ? `${dateFrom || '…'} to ${dateTo || '…'}` : 'All Records',
    [viewMode, selectedDate, dateFrom, dateTo],
  );

  const activeSummary = viewMode === 'daily' ? dailySummary : periodSummary;

  return (
    <div className="space-y-4">
      {/* View toggle + date navigation + export buttons */}
      <div className="flex flex-wrap gap-2 items-center">
        <SegmentedToggle
          options={[{ value: 'daily', label: 'Daily' }, { value: 'period', label: 'Period' }]}
          value={viewMode}
          onChange={(v) => setViewMode(v as 'daily' | 'period')}
        />

        {viewMode === 'daily' && (
          <div className="flex items-center gap-2">
            <button
              disabled={!prevDate}
              onClick={() => prevDate && setSelectedDate(prevDate)}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >‹</button>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={fs} />
            <button
              disabled={!nextDate}
              onClick={() => nextDate && setSelectedDate(nextDate)}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >›</button>
          </div>
        )}

        {viewMode === 'period' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fs} />
            <span className="text-xs text-gray-500 font-medium">To</span>
            <input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}   className={fs} />
            <ClearButton active={!!(dateFrom || dateTo)} onClick={() => { setDateFrom(''); setDateTo(''); }} />
          </div>
        )}

        {/* Export buttons */}
        {activeSummary && (
          <div className="ml-auto">
            <ExportBar
              onExcel={() => exportRemittanceExcel(activeSummary.aided, activeSummary.unaided, exportLabel, academicYear)}
              onPdf={() => exportRemittancePdf(activeSummary.aided, activeSummary.unaided, exportLabel, academicYear)}
            />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Cash = Challan deposit</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Pay = UPI / auto-remitted</span>
        <span className="text-gray-300">·</span>
        <span>Aided: CE · ME · EC · CS &nbsp;|&nbsp; Unaided: EE</span>
        {showAllYears && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-400 bg-amber-50 text-[10px] font-semibold text-amber-700">
            Incl. Prior Year Dues
          </span>
        )}
      </div>

      {availableDates.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No fee records found.</p>
      ) : viewMode === 'daily' ? (
        <>
          <RemittanceAbstractTable
            aided={dailySummary.aided}
            unaided={dailySummary.unaided}
            label={`Abstract — ${formatDayLabel(selectedDate)}`}
          />
          <BankRemittanceTable
            aided={dailySummary.aided}
            unaided={dailySummary.unaided}
            label={`Remittance — ${formatDayLabel(selectedDate)}`}
          />
          <BankAccountSummaryTable aided={dailySummary.aided} unaided={dailySummary.unaided} />
        </>
      ) : periodSummary !== null ? (
        <>
          <RemittanceAbstractTable
            aided={periodSummary.aided}
            unaided={periodSummary.unaided}
            label={dateFrom || dateTo ? `Abstract — ${dateFrom || '…'} → ${dateTo || '…'}` : 'Abstract — All Records'}
          />
          <BankRemittanceTable
            aided={periodSummary.aided}
            unaided={periodSummary.unaided}
            label={dateFrom || dateTo ? `Period: ${dateFrom || '…'} → ${dateTo || '…'}` : 'All Records'}
          />
          <BankAccountSummaryTable aided={periodSummary.aided} unaided={periodSummary.unaided} />
        </>
      ) : null}
    </div>
  );
}

// ── Tab: Fee Distribution ─────────────────────────────────────────────────────

interface FeeDistRow {
  slNo: number;
  feeType: string;
  studentCount: number;
  feeAmountPerStudent: number;
  totalCollected: number;
  toGov: number;
  toSVK: number;
  toSMP: number;
}

function calcDistribution(
  ss: Student[],
  isAided: boolean,
  structMap: Map<string, FeeStructure>,
  finePaidMap: Map<string, number>,
): FeeDistRow[] {
  // Look up the saved fee structure for each student using normalized group keys,
  // matching the SMP Students Statistics Summary groupings (Regular/Lateral/SNQ per year).
  // Only admType is normalised (REPEATER/EXTERNAL/etc. → REGULAR; LATERAL stays LATERAL).
  // admCat is kept as-is so OTHERS students still find their OTHERS structure; GM is the fallback.
  const headMap = new Map<string, Record<SMPFeeHead, number>>();
  for (const s of ss) {
    const normAdmType = s.admType === 'LATERAL' ? 'LATERAL' : 'REGULAR';
    const st = structMap.get(`${s.course}__${s.year}__${normAdmType}__${s.admCat}`)
            ?? structMap.get(`${s.course}__${s.year}__${normAdmType}__GM`);
    if (st) headMap.set(s.id, st.smp);
  }

  function amt(s: Student, k: SMPFeeHead): number {
    return headMap.get(s.id)?.[k] ?? 0;
  }

  const rows: FeeDistRow[] = [];
  const nRef = { n: 1 };

  // Splits a year's tuition bucket into one row per distinct fee amount actually
  // charged, instead of a single row averaging over students who may be on
  // different fee-structure amounts (e.g. differing by course or admission category).
  // When every student in the bucket pays the same amount, this yields exactly one
  // row identical to the old averaged behavior.
  function pushTuitionRows(bucket: Student[], label: string) {
    if (bucket.length === 0) return;
    const byAmount = new Map<number, Student[]>();
    for (const s of bucket) {
      const a = amt(s, 'tuition');
      if (!byAmount.has(a)) byAmount.set(a, []);
      byAmount.get(a)!.push(s);
    }
    const distinctPaid = [...byAmount.keys()].filter(a => a > 0);
    const bucketTot = bucket.reduce((a, s) => a + amt(s, 'tuition'), 0);
    if (bucketTot <= 0) return;

    const groups: [number, Student[]][] = distinctPaid.length > 1
      ? [...byAmount.entries()].filter(([a]) => a > 0).sort((a, b) => a[0] - b[0])
      : [[bucketTot / bucket.length, bucket]];

    for (const [amount, students] of groups) {
      const tot = students.reduce((a, s) => a + amt(s, 'tuition'), 0);
      rows.push({
        slNo: nRef.n++,
        feeType: distinctPaid.length > 1 ? `${label} — ₹${Math.round(amount).toLocaleString('en-IN')}` : label,
        studentCount: students.length,
        feeAmountPerStudent: Math.round(tot / students.length),
        totalCollected: tot,
        toGov: isAided ? tot / 2 : 0,
        toSVK: isAided ? tot / 2 : tot,
        toSMP: 0,
      });
    }
  }

  // ── Tuition fees by year group ──
  // 1st Yr: 1ST YEAR non-SNQ + LATERAL 2ND YEAR non-SNQ (both pay 1st yr tuition rate)
  const t1 = ss.filter(s =>
    (s.year === '1ST YEAR' && s.admCat !== 'SNQ') ||
    (s.year === '2ND YEAR' && s.admType === 'LATERAL' && s.admCat !== 'SNQ'),
  );
  pushTuitionRows(t1, 'Tuition Fee 1st Yr');

  // 2nd Yr: 2ND YEAR non-LATERAL non-SNQ
  const t2 = ss.filter(s => s.year === '2ND YEAR' && s.admType !== 'LATERAL' && s.admCat !== 'SNQ');
  pushTuitionRows(t2, 'Tuition Fee 2nd Yr');

  // 3rd Yr: 3RD YEAR non-SNQ (includes LATERAL 3rd yr counted as regular)
  const t3 = ss.filter(s => s.year === '3RD YEAR' && s.admCat !== 'SNQ');
  pushTuitionRows(t3, 'Tuition Fee 3rd Yr');

  // ── Other SMP fee heads ──
  // Order matches reference HTML: dvp, adm, lab, rr, mag, idCard, sports, ass, lib, swf, twf, nss
  const otherHeads: { key: SMPFeeHead; label: string; libOnly?: true }[] = [
    { key: 'dvp',    label: 'DVP' },
    { key: 'adm',    label: 'ADMISSION' },
    { key: 'lab',    label: 'LAB' },
    { key: 'rr',     label: 'RR' },
    { key: 'mag',    label: 'MAGAZINE' },
    { key: 'idCard', label: 'ID CARD' },
    { key: 'sports', label: 'SPORTS' },
    { key: 'ass',    label: 'ASSOCIATION' },
    { key: 'lib',    label: 'LIBRARY', libOnly: true },
    { key: 'swf',    label: 'SWF' },
    { key: 'twf',    label: 'TWF' },
    { key: 'nss',    label: 'NSS' },
  ];

  for (const h of otherHeads) {
    // Library: only 1ST YEAR + LATERAL 2ND YEAR (all admCats)
    const eligible = h.libOnly
      ? ss.filter(s => s.year === '1ST YEAR' || (s.year === '2ND YEAR' && s.admType === 'LATERAL'))
      : ss;
    const tot = eligible.reduce((a, s) => a + amt(s, h.key), 0);
    if (eligible.length > 0 && tot > 0) {
      let toGov = 0, toSVK = 0, toSMP = 0;
      if (isAided) {
        if (h.key === 'dvp' || h.key === 'adm') {
          toGov = tot / 2; toSVK = tot / 2;
        } else if (h.key === 'lab' || h.key === 'rr' || h.key === 'mag' || h.key === 'idCard') {
          toGov = tot / 2; toSMP = tot / 2;
        } else {
          toSMP = tot;
        }
      } else {
        if (h.key === 'dvp' || h.key === 'adm') toSVK = tot;
        else toSMP = tot;
      }
      rows.push({
        slNo: nRef.n++, feeType: h.label,
        studentCount: eligible.length, feeAmountPerStudent: Math.round(tot / eligible.length),
        totalCollected: tot, toGov, toSVK, toSMP,
      });
    }
  }

  // ── Fine — from paid fee records, 100% to Government ──
  let fineCount = 0, fineTot = 0;
  for (const s of ss) {
    const f = finePaidMap.get(s.id) ?? 0;
    if (f > 0) { fineCount++; fineTot += f; }
  }
  if (fineTot > 0) {
    rows.push({
      slNo: nRef.n++, feeType: 'FINE',
      studentCount: fineCount, feeAmountPerStudent: Math.round(fineTot / fineCount),
      totalCollected: fineTot, toGov: fineTot, toSVK: 0, toSMP: 0,
    });
  }

  return rows;
}

function RemittanceTable({ dist, headerColor }: { dist: FeeDistRow[]; headerColor: string }) {
  const totals = dist.reduce(
    (a, r) => ({ tot: a.tot + r.totalCollected, gov: a.gov + r.toGov, svk: a.svk + r.toSVK, smp: a.smp + r.toSMP }),
    { tot: 0, gov: 0, svk: 0, smp: 0 },
  );
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
      <table className="w-full text-[11px]">
        <thead className={`${headerColor} text-white`}>
          <tr>
            <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
            <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Fee Type</th>
            <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Students</th>
            <th className="px-2 py-1.5 text-right font-semibold" rowSpan={2}>Fee Amt (₹)</th>
            <th className="px-2 py-1.5 text-right font-semibold" rowSpan={2}>Total Allotted</th>
            <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Fee Remittance (₹)</th>
          </tr>
          <tr>
            <th className="px-2 py-1 text-right font-semibold border-l border-white/30">To Govt.</th>
            <th className="px-2 py-1 text-right font-semibold">To SVK</th>
            <th className="px-2 py-1 text-right font-semibold">To SMP</th>
          </tr>
        </thead>
        <tbody>
          {dist.map((r, i) => (
            <tr key={r.slNo} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-2 py-1.5 text-center text-gray-400">{r.slNo}</td>
              <td className="px-2 py-1.5 font-medium">{r.feeType}</td>
              <td className="px-2 py-1.5 text-center">{r.studentCount}</td>
              <td className="px-2 py-1.5 text-right">{fmt(r.feeAmountPerStudent)}</td>
              <td className="px-2 py-1.5 text-right font-semibold">{fmt(r.totalCollected)}</td>
              <td className="px-2 py-1.5 text-right border-l border-gray-100">{r.toGov > 0 ? fmt(r.toGov) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{r.toSVK > 0 ? fmt(r.toSVK) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{r.toSMP > 0 ? fmt(r.toSMP) : '—'}</td>
            </tr>
          ))}
          {dist.length === 0 && (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No data for the selected filters.</td></tr>
          )}
        </tbody>
        {dist.length > 0 && (
          <tfoot className={TFOOT}>
            <tr>
              <td className="px-2 py-2" colSpan={4}>GRAND TOTAL</td>
              <td className="px-2 py-2 text-right">{fmt(totals.tot)}</td>
              <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(totals.gov)}</td>
              <td className="px-2 py-2 text-right">{fmt(totals.svk)}</td>
              <td className="px-2 py-2 text-right">{fmt(totals.smp)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Remittance Modal ─────────────────────────────────────────────────────────

function RemittanceModal({
  payee,
  academicYear,
  existingPhases,
  editing,
  onClose,
}: {
  payee: RemittancePayee;
  academicYear: AcademicYear;
  existingPhases: string[];
  editing?: FeeRemittance | null;
  onClose: () => void;
}) {
  const nextNum = existingPhases.reduce((max, ph) => {
    const n = parseInt(ph);
    return !isNaN(n) && n > max ? n : max;
  }, 0) + 1;

  const [phase,       setPhase]       = useState(editing ? editing.phase : `${ordinal(nextNum)} Phase`);
  const [date,        setDate]        = useState(editing ? editing.date : new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<RemittanceMode>(editing ? editing.paymentMode : (payee === 'GOV' ? 'Online' : 'NEFT'));
  const [reference,   setReference]   = useState(editing ? editing.reference : '');
  const [remarks,     setRemarks]     = useState(editing ? editing.remarks : '');
  const [govHeads,    setGovHeads]    = useState<GovHeadAmounts>(editing?.govHeads ? { ...editing.govHeads } : { ...EMPTY_GOV_HEADS });
  const [govHeadRefs, setGovHeadRefs] = useState<GovHeadRefs>(editing?.govHeadRefs ? { ...editing.govHeadRefs } : { ...EMPTY_GOV_HEAD_REFS });
  const [amount,      setAmount]      = useState<number | ''>(editing ? editing.amount : '');
  const [challanFile, setChallanFile] = useState<File | null>(null);
  const [removeChallan, setRemoveChallan] = useState(false);
  const [headChallanFiles,   setHeadChallanFiles]   = useState<Partial<Record<keyof GovHeadAmounts, File>>>({});
  const [headChallanRemoved, setHeadChallanRemoved] = useState<Partial<Record<keyof GovHeadAmounts, boolean>>>({});
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');

  const govTotal = GOV_HEADS.reduce((s, { key }) => s + (govHeads[key] || 0), 0);

  function validateFile(file: File): string | null {
    if (file.size > 5 * 1024 * 1024) return 'File must be under 5 MB';
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return 'Only PDF, JPG or PNG files are allowed';
    return null;
  }

  function handleFileChange(file: File | null) {
    if (!file) { setChallanFile(null); return; }
    const invalid = validateFile(file);
    if (invalid) { setErr(invalid); return; }
    setErr('');
    setRemoveChallan(false);
    setChallanFile(file);
  }

  function handleHeadFileChange(key: keyof GovHeadAmounts, file: File | null) {
    if (!file) return;
    const invalid = validateFile(file);
    if (invalid) { setErr(invalid); return; }
    setErr('');
    setHeadChallanRemoved((prev) => ({ ...prev, [key]: false }));
    setHeadChallanFiles((prev) => ({ ...prev, [key]: file }));
  }

  function handleRemoveHeadChallan(key: keyof GovHeadAmounts) {
    setHeadChallanFiles((prev) => { const next = { ...prev }; delete next[key]; return next; });
    setHeadChallanRemoved((prev) => ({ ...prev, [key]: true }));
  }

  function updateHead(key: keyof GovHeadAmounts, val: string) {
    setGovHeads((prev) => ({ ...prev, [key]: parseFloat(val) || 0 }));
  }

  function updateHeadRef(key: keyof GovHeadRefs, val: string) {
    setGovHeadRefs((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    if (!phase.trim()) { setErr('Phase is required'); return; }
    if (!date)         { setErr('Date is required');  return; }
    const finalAmount = payee === 'GOV' ? govTotal : (typeof amount === 'number' ? amount : 0);
    if (finalAmount <= 0) { setErr('Enter a valid amount'); return; }
    const finalReference = payee === 'GOV'
      ? [...new Set(Object.values(govHeadRefs).map((v) => v.trim()).filter(Boolean))].join(', ')
      : reference.trim();
    setSaving(true);
    setErr('');
    try {
      const payload = {
        academicYear,
        payee,
        phase: phase.trim(),
        date,
        paymentMode,
        reference: finalReference,
        amount: finalAmount,
        ...(payee === 'GOV' ? { govHeads, govHeadRefs } : {}),
        remarks: remarks.trim(),
      };
      if (editing) {
        await updateFeeRemittance(editing.id, payload, {
          challanFile: challanFile ?? undefined,
          removeChallan,
          previousChallanPath: editing.challanPath,
          headChallans: headChallanFiles,
          removeHeadChallans: headChallanRemoved,
          previousHeadChallans: editing.govHeadChallans,
        });
      } else {
        await addFeeRemittance(payload, { challanFile: challanFile ?? undefined, headChallans: headChallanFiles });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
    }
  }

  const payeeLabel   = payee === 'GOV' ? 'Government (K2)' : payee === 'SVK' ? 'SVK Management' : 'SMP';
  const refLabel     = payee === 'GOV' ? 'K2 Challan Ref'  : 'Cheque / NEFT Ref';
  const challanLabel = payee === 'GOV' ? 'K2 Challan Copy' : 'Payment Proof Copy';
  const inp     = 'w-full rounded border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#3B5B8A]/50 focus:border-[#3B5B8A]';
  const amtInp  = inp + ' text-right tabular-nums [appearance:none] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
  const fileInp = 'w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-gray-100 file:text-xs file:font-semibold file:text-gray-700 hover:file:bg-gray-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="text-sm font-bold text-gray-800">{editing ? 'Edit Remittance' : 'Record Remittance'}</p>
            <p className="text-xs text-gray-400 mt-0.5">{payeeLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-0.5">Phase</label>
              <input className={inp} value={phase} onChange={(e) => setPhase(e.target.value)} placeholder="e.g. 1st Phase" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-0.5">Date</label>
              <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className={payee === 'GOV' ? '' : 'grid grid-cols-2 gap-2'}>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-0.5">Payment Mode</label>
              <select className={inp} value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as RemittanceMode)}>
                <option value="Online">Online</option>
                <option value="NEFT">NEFT</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            {payee !== 'GOV' && (
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-0.5">{refLabel}</label>
                <input className={inp} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ref / Challan No." />
              </div>
            )}
          </div>

          {payee === 'GOV' ? (
            <>
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-bold uppercase text-gray-400 mb-1">Amount, K2 Challan Ref &amp; Soft Copy per Fee Head</p>
                {GOV_HEADS.map(({ key, label }) => {
                  const existingChallan = editing?.govHeadChallans?.[key];
                  const showExisting = existingChallan && !headChallanRemoved[key] && !headChallanFiles[key];
                  return (
                    <div key={key} className="border border-gray-100 rounded-lg p-1.5 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-gray-600 w-16 shrink-0">{label}</span>
                        <input
                          type="number" min="0" step="1"
                          className={amtInp + ' flex-1 min-w-0'}
                          value={govHeads[key] || ''}
                          onChange={(e) => updateHead(key, e.target.value)}
                          placeholder="0"
                        />
                        <input
                          type="text"
                          className={inp + ' flex-1 min-w-0'}
                          value={govHeadRefs[key]}
                          onChange={(e) => updateHeadRef(key, e.target.value)}
                          placeholder="Challan Ref"
                        />
                      </div>
                      <div className="pl-[4.75rem]">
                        {showExisting ? (
                          <div className="flex items-center gap-2 text-[11px]">
                            <a href={existingChallan.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                            <button type="button" className="text-gray-500 hover:text-gray-700" onClick={() => downloadFile(existingChallan.url, `${label}_${phase}.pdf`)}>Download</button>
                            <button type="button" className="ml-auto text-gray-400 hover:text-red-500" onClick={() => handleRemoveHeadChallan(key)}>Remove</button>
                          </div>
                        ) : (
                          <>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className={`${fileInp} text-[11px] file:text-[11px]`}
                              onChange={(e) => handleHeadFileChange(key, e.target.files?.[0] ?? null)}
                            />
                            {headChallanRemoved[key] && <p className="text-[10px] text-amber-600 mt-0.5">Current file will be removed on save.</p>}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between items-center bg-[#D0E2F2]/40 border border-[#3B5B8A]/25 rounded-lg px-3 py-2">
                <span className="text-sm font-bold text-[#3B5B8A]">Total</span>
                <span className="text-base font-bold text-[#3B5B8A] tabular-nums">{fmt(govTotal)}</span>
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-0.5">Amount (₹)</label>
              <input
                type="number" min="0" step="1"
                className={amtInp}
                value={amount === '' ? '' : amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          )}

          {payee !== 'GOV' && (
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-0.5">{challanLabel} (optional)</label>
            {editing?.challanUrl && !removeChallan && !challanFile ? (
              <div className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
                <a href={editing.challanUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                <button type="button" className="text-gray-500 hover:text-gray-700" onClick={() => downloadFile(editing.challanUrl!, `${payeeLabel}_${phase}.pdf`)}>Download</button>
                <button type="button" className="ml-auto text-gray-400 hover:text-red-500 shrink-0" onClick={() => setRemoveChallan(true)}>Remove</button>
              </div>
            ) : (
              <>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className={fileInp}
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
                {removeChallan && <p className="text-[10px] text-amber-600 mt-1">Current file will be removed on save.</p>}
              </>
            )}
          </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-0.5">Remarks</label>
            <input className={inp} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" />
          </div>

          {err && <p className="text-red-500 text-xs">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-gray-100">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary" size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (challanFile ? 'Uploading…' : 'Saving…') : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Fee Distribution ─────────────────────────────────────────────────────

function FeeDistributionTab({
  students,
  feeStructures,
  feeRecords,
  academicYear,
}: {
  students: Student[];
  feeStructures: FeeStructure[];
  feeRecords: FeeRecord[];
  academicYear: string;
}) {
  type DistCourseType = '' | 'Aided' | 'Unaided';
  type TableView = 'all' | 'studentstats' | 'summary' | 'aided' | 'unaided' | 'combined';

  const [courseTypeFilter, setCourseTypeFilter] = useState<DistCourseType>('');
  const [yearFilter2,      setYearFilter2]      = useState<Year | ''>('');
  const [courseFilter2,    setCourseFilter2]    = useState<Course | ''>('');
  const [admTypeFilter2,   setAdmTypeFilter2]   = useState<'' | 'REGULAR' | 'LATERAL' | 'REPEATER' | 'SNQ'>('');
  const [tableView,        setTableView]        = useState<TableView>('all');

  // ── Look-up maps ──
  const structMap = useMemo(() => {
    const m = new Map<string, FeeStructure>();
    for (const s of feeStructures) {
      m.set(`${s.course}__${s.year}__${s.admType}__${s.admCat}`, s);
    }
    return m;
  }, [feeStructures]);

  const finePaidMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of feeRecords) m.set(r.studentId, (m.get(r.studentId) ?? 0) + r.smp.fine);
    return m;
  }, [feeRecords]);

  // ── CONFIRMED students only ──
  const confirmedStudents = useMemo(
    () => students.filter(isConfirmedActive),
    [students],
  );

  // ── Apply own filters ──
  const filteredStudents = useMemo(() => {
    let ss = confirmedStudents;
    if (courseTypeFilter === 'Aided')   ss = ss.filter(s => (AIDED_COURSES as Course[]).includes(s.course));
    if (courseTypeFilter === 'Unaided') ss = ss.filter(s => (UNAIDED_COURSES as Course[]).includes(s.course));
    if (yearFilter2)    ss = ss.filter(s => s.year   === yearFilter2);
    if (courseFilter2)  ss = ss.filter(s => s.course === courseFilter2);
    if (admTypeFilter2) {
      ss = ss.filter(s => {
        if (admTypeFilter2 === 'SNQ')      return s.admCat === 'SNQ';
        if (admTypeFilter2 === 'LATERAL')  return s.admType === 'LATERAL'  && s.admCat !== 'SNQ';
        if (admTypeFilter2 === 'REPEATER') return s.admType === 'REPEATER' && s.admCat !== 'SNQ';
        // REGULAR: REGULAR + EXTERNAL + SNQ-admType rows that aren't lateral/repeater
        return s.admCat !== 'SNQ' && s.admType !== 'LATERAL' && s.admType !== 'REPEATER';
      });
    }
    return ss;
  }, [confirmedStudents, courseTypeFilter, yearFilter2, courseFilter2, admTypeFilter2]);

  const aidedFiltered   = useMemo(() => filteredStudents.filter(s => (AIDED_COURSES as Course[]).includes(s.course)),   [filteredStudents]);
  const unaidedFiltered = useMemo(() => filteredStudents.filter(s => (UNAIDED_COURSES as Course[]).includes(s.course)), [filteredStudents]);

  // ── Distribution calculations ──
  const aidedDist   = useMemo(() => calcDistribution(aidedFiltered,   true,  structMap, finePaidMap), [aidedFiltered,   structMap, finePaidMap]);
  const unaidedDist = useMemo(() => calcDistribution(unaidedFiltered, false, structMap, finePaidMap), [unaidedFiltered, structMap, finePaidMap]);

  const aidedTotals   = useMemo(() => aidedDist.reduce(  (a, r) => ({ tot: a.tot + r.totalCollected, gov: a.gov + r.toGov, svk: a.svk + r.toSVK, smp: a.smp + r.toSMP }), { tot: 0, gov: 0, svk: 0, smp: 0 }), [aidedDist]);
  const unaidedTotals = useMemo(() => unaidedDist.reduce((a, r) => ({ tot: a.tot + r.totalCollected, gov: a.gov + r.toGov, svk: a.svk + r.toSVK, smp: a.smp + r.toSMP }), { tot: 0, gov: 0, svk: 0, smp: 0 }), [unaidedDist]);
  const grandTotals   = useMemo(() => ({
    tot: aidedTotals.tot + unaidedTotals.tot,
    gov: aidedTotals.gov + unaidedTotals.gov,
    svk: aidedTotals.svk + unaidedTotals.svk,
    smp: aidedTotals.smp + unaidedTotals.smp,
  }), [aidedTotals, unaidedTotals]);

  // ── Remittance tracker ────────────────────────────────────────────────────
  const { remittances } = useFeeRemittances((academicYear as AcademicYear) || null);

  const govRemittances = useMemo(
    () => remittances.filter((r) => r.payee === 'GOV').sort((a, b) => (parseInt(a.phase) || 999) - (parseInt(b.phase) || 999)),
    [remittances],
  );
  const svkRemittances = useMemo(
    () => remittances.filter((r) => r.payee === 'SVK').sort((a, b) => (parseInt(a.phase) || 999) - (parseInt(b.phase) || 999)),
    [remittances],
  );
  const smpRemittances = useMemo(
    () => remittances.filter((r) => r.payee === 'SMP').sort((a, b) => (parseInt(a.phase) || 999) - (parseInt(b.phase) || 999)),
    [remittances],
  );

  const govPayableByHead = useMemo((): GovHeadAmounts => {
    const all = [...aidedDist, ...unaidedDist];
    const sg = (fn: (t: string) => boolean) => all.filter((r) => fn(r.feeType)).reduce((s, r) => s + r.toGov, 0);
    return {
      tuition:  sg((t) => t.startsWith('Tuition')),
      dvp:      sg((t) => t === 'DVP'),
      adm:      sg((t) => t === 'ADMISSION'),
      lab:      sg((t) => t === 'LAB'),
      rr:       sg((t) => t === 'RR'),
      magazine: sg((t) => t === 'MAGAZINE'),
      idCard:   sg((t) => t === 'ID CARD'),
      fine:     sg((t) => t === 'FINE'),
    };
  }, [aidedDist, unaidedDist]);

  const govPaidByHead = useMemo((): GovHeadAmounts => {
    const h = { ...EMPTY_GOV_HEADS };
    for (const r of govRemittances) if (r.govHeads) for (const k of Object.keys(h) as (keyof GovHeadAmounts)[]) h[k] += r.govHeads[k] ?? 0;
    return h;
  }, [govRemittances]);

  const govPhaseMap = useMemo(() => {
    const m = new Map<string, GovHeadAmounts & { total: number }>();
    for (const r of govRemittances) {
      if (!r.govHeads) continue;
      const e = m.get(r.phase) ?? { ...EMPTY_GOV_HEADS, total: 0 };
      for (const k of Object.keys(EMPTY_GOV_HEADS) as (keyof GovHeadAmounts)[]) e[k] += r.govHeads[k] ?? 0;
      e.total += r.amount;
      m.set(r.phase, e);
    }
    return m;
  }, [govRemittances]);

  const govPhases     = useMemo(() => [...govPhaseMap.keys()].sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999)), [govPhaseMap]);
  const govTotalPaid  = useMemo(() => govRemittances.reduce((s, r) => s + r.amount, 0), [govRemittances]);
  const svkPaid       = useMemo(() => svkRemittances.reduce((s, r) => s + r.amount, 0), [svkRemittances]);
  const smpPaid       = useMemo(() => smpRemittances.reduce((s, r) => s + r.amount, 0), [smpRemittances]);

  const [trackerTab,       setTrackerTab]       = useState<RemittancePayee | 'CONSOLIDATED'>('GOV');
  const [showModal,        setShowModal]        = useState(false);
  const [editingRemittance, setEditingRemittance] = useState<FeeRemittance | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState<string | null>(null);

  function getAttachments(r: FeeRemittance): { label: string; url: string }[] {
    const list: { label: string; url: string }[] = [];
    if (r.govHeadChallans) {
      for (const { key, label } of GOV_HEADS) {
        const c = r.govHeadChallans[key];
        if (c) list.push({ label, url: c.url });
      }
    }
    if (r.challanUrl) list.push({ label: r.govHeadChallans ? 'Payment Copy' : 'Attachment', url: r.challanUrl });
    return list;
  }

  async function handleDelete(id: string) {
    const r = remittances.find((r) => r.id === id);
    try { await deleteFeeRemittance(id, r?.challanPath, r?.govHeadChallans); } catch { /* snapshot listener auto-updates on success */ }
    setDeleteConfirming(null);
  }

  // ── Student statistics for summary table ──
  const studentStats = useMemo(() => {
    const allCourses = COURSES;
    type YrStat = { reg: number; lat: number; snq: number; total: number };
    const stats: Record<Course, { yr1: YrStat; yr2: YrStat; yr3: YrStat; grand: number }> = {} as never;
    for (const c of allCourses) {
      stats[c] = {
        yr1: { reg: 0, lat: 0, snq: 0, total: 0 },
        yr2: { reg: 0, lat: 0, snq: 0, total: 0 },
        yr3: { reg: 0, lat: 0, snq: 0, total: 0 },
        grand: 0,
      };
    }
    for (const s of filteredStudents) {
      if (!stats[s.course]) continue;
      const yr = s.year === '1ST YEAR' ? 'yr1' : s.year === '2ND YEAR' ? 'yr2' : 'yr3';
      const yrStat = stats[s.course][yr];
      if (s.admCat === 'SNQ') {
        yrStat.snq++;
      } else if (s.admType === 'LATERAL' && s.year !== '3RD YEAR') {
        yrStat.lat++;
      } else {
        yrStat.reg++;
      }
      yrStat.total++;
      stats[s.course].grand++;
    }
    return stats;
  }, [filteredStudents]);

  const grandStatTotals = useMemo(() => {
    const gt = { yr1: { reg: 0, snq: 0, total: 0 }, yr2: { reg: 0, lat: 0, snq: 0, total: 0 }, yr3: { reg: 0, snq: 0, total: 0 }, grand: 0 };
    for (const c of COURSES) {
      gt.yr1.reg   += studentStats[c].yr1.reg;
      gt.yr1.snq   += studentStats[c].yr1.snq;
      gt.yr1.total += studentStats[c].yr1.total;
      gt.yr2.reg   += studentStats[c].yr2.reg;
      gt.yr2.lat   += studentStats[c].yr2.lat;
      gt.yr2.snq   += studentStats[c].yr2.snq;
      gt.yr2.total += studentStats[c].yr2.total;
      gt.yr3.reg   += studentStats[c].yr3.reg;
      gt.yr3.snq   += studentStats[c].yr3.snq;
      gt.yr3.total += studentStats[c].yr3.total;
      gt.grand     += studentStats[c].grand;
    }
    return gt;
  }, [studentStats]);

  function clearFilters() {
    setCourseTypeFilter('');
    setYearFilter2('');
    setCourseFilter2('');
    setAdmTypeFilter2('');
    setTableView('all');
  }

  // ── Excel export ──
  function exportDistExcel() {
    const wb = XLSX.utils.book_new();

    // Student Statistics sheet
    const statsRows: (string | number)[][] = [
      ['Sl No', 'Course', '1st Yr Regular', '1st Yr SNQ', '1st Yr Total', '2nd Yr Regular', '2nd Yr Lateral', '2nd Yr SNQ', '2nd Yr Total', '3rd Yr Regular', '3rd Yr SNQ', '3rd Yr Total', 'Grand Total'],
    ];
    COURSES.forEach((c, i) => {
      const st = studentStats[c];
      const courseType = (AIDED_COURSES as Course[]).includes(c) ? 'Aided' : 'Unaided';
      statsRows.push([i + 1, `${c} (${courseType})`, st.yr1.reg, st.yr1.snq, st.yr1.total, st.yr2.reg, st.yr2.lat, st.yr2.snq, st.yr2.total, st.yr3.reg, st.yr3.snq, st.yr3.total, st.grand]);
    });
    statsRows.push(['', 'GRAND TOTAL', grandStatTotals.yr1.reg, grandStatTotals.yr1.snq, grandStatTotals.yr1.total, grandStatTotals.yr2.reg, grandStatTotals.yr2.lat, grandStatTotals.yr2.snq, grandStatTotals.yr2.total, grandStatTotals.yr3.reg, grandStatTotals.yr3.snq, grandStatTotals.yr3.total, grandStatTotals.grand]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(statsRows), 'Student Statistics');

    // Summary sheet
    const sumRows: (string | number)[][] = [
      ['Course Type', 'Total Students', 'Total Fee Allotted', 'To Government', 'To SVK Management', 'To SMP'],
      ['Aided Courses (CE, ME, EC, CS)', aidedFiltered.length, aidedTotals.tot, aidedTotals.gov, aidedTotals.svk, aidedTotals.smp],
      ['Unaided Course (EE)', unaidedFiltered.length, unaidedTotals.tot, unaidedTotals.gov, unaidedTotals.svk, unaidedTotals.smp],
      ['GRAND TOTAL', filteredStudents.length, grandTotals.tot, grandTotals.gov, grandTotals.svk, grandTotals.smp],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'Distribution Summary');

    // Aided sheet
    const aidedRows: (string | number)[][] = [['Sl No', 'Fee Type', 'Students', 'Fee Amount', 'Total Allotted', 'To Govt', 'To SVK', 'To SMP']];
    aidedDist.forEach(r => aidedRows.push([r.slNo, r.feeType, r.studentCount, r.feeAmountPerStudent, r.totalCollected, r.toGov, r.toSVK, r.toSMP]));
    aidedRows.push(['', 'GRAND TOTAL', '', '', aidedTotals.tot, aidedTotals.gov, aidedTotals.svk, aidedTotals.smp]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aidedRows), 'Aided Courses');

    // Unaided sheet
    const unaidedRows: (string | number)[][] = [['Sl No', 'Fee Type', 'Students', 'Fee Amount', 'Total Allotted', 'To Govt', 'To SVK', 'To SMP']];
    unaidedDist.forEach(r => unaidedRows.push([r.slNo, r.feeType, r.studentCount, r.feeAmountPerStudent, r.totalCollected, r.toGov, r.toSVK, r.toSMP]));
    unaidedRows.push(['', 'GRAND TOTAL', '', '', unaidedTotals.tot, unaidedTotals.gov, unaidedTotals.svk, unaidedTotals.smp]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(unaidedRows), 'Unaided Course');

    // Combined sheet
    const combinedRows: (string | number)[][] = [['Sl No', 'Course Type', 'Fee Type', 'Students', 'Fee Amount', 'Total Allotted', 'To Govt', 'To SVK', 'To SMP']];
    let cn = 1;
    aidedDist.forEach(r => combinedRows.push([cn++, 'Aided', r.feeType, r.studentCount, r.feeAmountPerStudent, r.totalCollected, r.toGov, r.toSVK, r.toSMP]));
    unaidedDist.forEach(r => combinedRows.push([cn++, 'Unaided', r.feeType, r.studentCount, r.feeAmountPerStudent, r.totalCollected, r.toGov, r.toSVK, r.toSMP]));
    combinedRows.push(['', '', 'GRAND TOTAL', '', '', grandTotals.tot, grandTotals.gov, grandTotals.svk, grandTotals.smp]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(combinedRows), 'Combined');

    XLSX.writeFile(wb, `SMP_Fee_Distribution_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  const show = (v: TableView) => tableView === 'all' || tableView === v;

  return (
    <div className="space-y-5">
      {/* Metrics strip */}
      <StatChipRow entries={[
        { label: 'Total Students',    value: filteredStudents.length,   color: 'text-[#3B5B8A]',   bg: 'bg-[#D0E2F2]/40',    border: 'border-[#3B5B8A]/25'   },
        { label: 'Total Fee Allotted', value: fmt(grandTotals.tot),     color: 'text-gray-700',   bg: 'bg-gray-50',    border: 'border-gray-200'   },
        { label: 'To Government',     value: fmt(grandTotals.gov),      color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200'    },
        { label: 'To SVK Management', value: fmt(grandTotals.svk),      color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-200' },
        { label: 'To SMP',            value: fmt(grandTotals.smp),      color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200'  },
        { label: 'Aided Students',    value: aidedFiltered.length,      color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
        { label: 'Unaided Students',  value: unaidedFiltered.length,    color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200'  },
      ]} />

      {/* Filters */}
      <FilterPanel
        right={<ExportBar onExcel={exportDistExcel} />}
        hasActiveFilters={!!(courseTypeFilter || yearFilter2 || courseFilter2 || admTypeFilter2 || tableView !== 'all')}
        onClear={clearFilters}
      >
        <select value={courseTypeFilter} onChange={e => setCourseTypeFilter(e.target.value as DistCourseType)} className={fs}>
          <option value="">All Courses</option>
          <option value="Aided">Aided (CE, ME, EC, CS)</option>
          <option value="Unaided">Unaided (EE)</option>
        </select>
        <select value={yearFilter2} onChange={e => setYearFilter2(e.target.value as Year | '')} className={fs}>
          <option value="">All Years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={courseFilter2} onChange={e => setCourseFilter2(e.target.value as Course | '')} className={fs}>
          <option value="">All Courses</option>
          {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={admTypeFilter2} onChange={e => setAdmTypeFilter2(e.target.value as typeof admTypeFilter2)} className={fs}>
          <option value="">All Adm Types</option>
          <option value="REGULAR">Regular</option>
          <option value="LATERAL">Lateral</option>
          <option value="REPEATER">Repeater</option>
          <option value="SNQ">SNQ</option>
        </select>
        <select value={tableView} onChange={e => setTableView(e.target.value as TableView)} className={fs}>
          <option value="all">All Tables</option>
          <option value="studentstats">Student Statistics Only</option>
          <option value="summary">Summary Only</option>
          <option value="aided">Aided Distribution Only</option>
          <option value="unaided">Unaided Distribution Only</option>
          <option value="combined">Combined Distribution Only</option>
        </select>
      </FilterPanel>

      {/* ── Student Statistics Summary ── */}
      {show('studentstats') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">SMP Students Statistics Summary</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className={`${ACCENT} text-white`}>
                <tr>
                  <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
                  <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Course</th>
                  <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>1st Year</th>
                  <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={4}>2nd Year</th>
                  <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>3rd Year</th>
                  <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" rowSpan={2}>Grand Total</th>
                </tr>
                <tr>
                  <th className="px-2 py-1 font-semibold border-l border-white/30">Regular</th>
                  <th className="px-2 py-1 font-semibold">SNQ</th>
                  <th className="px-2 py-1 font-semibold">Total</th>
                  <th className="px-2 py-1 font-semibold border-l border-white/30">Regular</th>
                  <th className="px-2 py-1 font-semibold">Lateral</th>
                  <th className="px-2 py-1 font-semibold">SNQ</th>
                  <th className="px-2 py-1 font-semibold">Total</th>
                  <th className="px-2 py-1 font-semibold border-l border-white/30">Regular</th>
                  <th className="px-2 py-1 font-semibold">SNQ</th>
                  <th className="px-2 py-1 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {COURSES.map((c, i) => {
                  const st = studentStats[c];
                  const courseType = (AIDED_COURSES as Course[]).includes(c) ? 'Aided' : 'Unaided';
                  return (
                    <tr key={c} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                      <td className="px-2 py-1.5 font-semibold">{c} <span className="text-gray-400 font-normal">({courseType})</span></td>
                      <td className="px-2 py-1.5 text-center border-l border-gray-100">{st.yr1.reg || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{st.yr1.snq || '—'}</td>
                      <td className="px-2 py-1.5 text-center font-semibold">{st.yr1.total || '—'}</td>
                      <td className="px-2 py-1.5 text-center border-l border-gray-100">{st.yr2.reg || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{st.yr2.lat || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{st.yr2.snq || '—'}</td>
                      <td className="px-2 py-1.5 text-center font-semibold">{st.yr2.total || '—'}</td>
                      <td className="px-2 py-1.5 text-center border-l border-gray-100">{st.yr3.reg || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{st.yr3.snq || '—'}</td>
                      <td className="px-2 py-1.5 text-center font-semibold">{st.yr3.total || '—'}</td>
                      <td className="px-2 py-1.5 text-center font-bold border-l border-gray-100">{st.grand || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className={TFOOT}>
                <tr>
                  <td className="px-2 py-2" colSpan={2}>GRAND TOTAL</td>
                  <td className="px-2 py-2 text-center border-l border-gray-200">{grandStatTotals.yr1.reg}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr1.snq}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr1.total}</td>
                  <td className="px-2 py-2 text-center border-l border-gray-200">{grandStatTotals.yr2.reg}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr2.lat}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr2.snq}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr2.total}</td>
                  <td className="px-2 py-2 text-center border-l border-gray-200">{grandStatTotals.yr3.reg}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr3.snq}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr3.total}</td>
                  <td className="px-2 py-2 text-center border-l border-gray-200">{grandStatTotals.grand}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Fee Distribution Summary ── */}
      {show('summary') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Fee Distribution Summary</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className={`${ACCENT} text-white`}>
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Course Type</th>
                  <th className="px-2 py-1.5 text-center font-semibold">Students</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Total Fee Allotted</th>
                  <th className="px-2 py-1.5 text-right font-semibold">To Government</th>
                  <th className="px-2 py-1.5 text-right font-semibold">To SVK Management</th>
                  <th className="px-2 py-1.5 text-right font-semibold">To SMP</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-indigo-50">
                  <td className="px-2 py-1.5 font-semibold">Aided Courses (CE, ME, EC, CS)</td>
                  <td className="px-2 py-1.5 text-center">{aidedFiltered.length}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(aidedTotals.tot)}</td>
                  <td className="px-2 py-1.5 text-right text-red-700">{fmt(aidedTotals.gov)}</td>
                  <td className="px-2 py-1.5 text-right text-violet-700">{fmt(aidedTotals.svk)}</td>
                  <td className="px-2 py-1.5 text-right text-green-700">{fmt(aidedTotals.smp)}</td>
                </tr>
                <tr className="bg-amber-50">
                  <td className="px-2 py-1.5 font-semibold">Unaided Course (EE)</td>
                  <td className="px-2 py-1.5 text-center">{unaidedFiltered.length}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(unaidedTotals.tot)}</td>
                  <td className="px-2 py-1.5 text-right text-red-700">{fmt(unaidedTotals.gov)}</td>
                  <td className="px-2 py-1.5 text-right text-violet-700">{fmt(unaidedTotals.svk)}</td>
                  <td className="px-2 py-1.5 text-right text-green-700">{fmt(unaidedTotals.smp)}</td>
                </tr>
              </tbody>
              <tfoot className={TFOOT}>
                <tr>
                  <td className="px-2 py-2">GRAND TOTAL</td>
                  <td className="px-2 py-2 text-center">{filteredStudents.length}</td>
                  <td className="px-2 py-2 text-right">{fmt(grandTotals.tot)}</td>
                  <td className="px-2 py-2 text-right text-red-700">{fmt(grandTotals.gov)}</td>
                  <td className="px-2 py-2 text-right text-violet-700">{fmt(grandTotals.svk)}</td>
                  <td className="px-2 py-2 text-right text-green-700">{fmt(grandTotals.smp)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Aided Courses Fee Remittance Abstract ── */}
      {show('aided') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Fee Remittance Abstract — Aided Courses (CE, ME, EC, CS)</h2>
          <RemittanceTable dist={aidedDist} headerColor="bg-indigo-600" />
        </div>
      )}

      {/* ── Unaided Course Fee Remittance Abstract ── */}
      {show('unaided') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Fee Remittance Abstract — Unaided Course (EE)</h2>
          <RemittanceTable dist={unaidedDist} headerColor="bg-amber-600" />
        </div>
      )}

      {/* ── Combined Fee Remittance Abstract ── */}
      {show('combined') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Combined Fee Remittance Abstract (Aided &amp; Unaided)</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className={`${ACCENT} text-white`}>
                <tr>
                  <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
                  <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Course Type</th>
                  <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Fee Type</th>
                  <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Students</th>
                  <th className="px-2 py-1.5 text-right font-semibold" rowSpan={2}>Fee Amt (₹)</th>
                  <th className="px-2 py-1.5 text-right font-semibold" rowSpan={2}>Total Allotted</th>
                  <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Fee Remittance (₹)</th>
                </tr>
                <tr>
                  <th className="px-2 py-1 text-right font-semibold border-l border-white/30">To Govt.</th>
                  <th className="px-2 py-1 text-right font-semibold">To SVK</th>
                  <th className="px-2 py-1 text-right font-semibold">To SMP</th>
                </tr>
              </thead>
              <tbody>
                {aidedDist.map((r, i) => (
                  <tr key={`a-${r.slNo}`} className={i % 2 === 0 ? 'bg-indigo-50/40' : 'bg-white'}>
                    <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium text-indigo-700">Aided</td>
                    <td className="px-2 py-1.5 font-medium">{r.feeType}</td>
                    <td className="px-2 py-1.5 text-center">{r.studentCount}</td>
                    <td className="px-2 py-1.5 text-right">{fmt(r.feeAmountPerStudent)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{fmt(r.totalCollected)}</td>
                    <td className="px-2 py-1.5 text-right border-l border-gray-100">{r.toGov > 0 ? fmt(r.toGov) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{r.toSVK > 0 ? fmt(r.toSVK) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{r.toSMP > 0 ? fmt(r.toSMP) : '—'}</td>
                  </tr>
                ))}
                {unaidedDist.map((r, i) => (
                  <tr key={`u-${r.slNo}`} className={i % 2 === 0 ? 'bg-amber-50/40' : 'bg-white'}>
                    <td className="px-2 py-1.5 text-center text-gray-400">{aidedDist.length + i + 1}</td>
                    <td className="px-2 py-1.5 font-medium text-amber-700">Unaided</td>
                    <td className="px-2 py-1.5 font-medium">{r.feeType}</td>
                    <td className="px-2 py-1.5 text-center">{r.studentCount}</td>
                    <td className="px-2 py-1.5 text-right">{fmt(r.feeAmountPerStudent)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{fmt(r.totalCollected)}</td>
                    <td className="px-2 py-1.5 text-right border-l border-gray-100">{r.toGov > 0 ? fmt(r.toGov) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{r.toSVK > 0 ? fmt(r.toSVK) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{r.toSMP > 0 ? fmt(r.toSMP) : '—'}</td>
                  </tr>
                ))}
                {aidedDist.length === 0 && unaidedDist.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">No data for the selected filters.</td></tr>
                )}
              </tbody>
              {(aidedDist.length > 0 || unaidedDist.length > 0) && (
                <tfoot className={TFOOT}>
                  <tr>
                    <td className="px-2 py-2" colSpan={5}>GRAND TOTAL</td>
                    <td className="px-2 py-2 text-right">{fmt(grandTotals.tot)}</td>
                    <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(grandTotals.gov)}</td>
                    <td className="px-2 py-2 text-right">{fmt(grandTotals.svk)}</td>
                    <td className="px-2 py-2 text-right">{fmt(grandTotals.smp)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Distribution Rules legend */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 text-[10px] text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600 text-xs mb-1">Distribution Rules</p>
        <p><span className="font-medium text-indigo-700">Aided (CE, ME, EC, CS):</span> Tuition / DVP / Admission → 50% Govt + 50% SVK | Lab / RR / Magazine / ID Card → 50% Govt + 50% SMP | Sports / Association / Library / SWF / TWF / NSS → 100% SMP | Fine → 100% Govt</p>
        <p><span className="font-medium text-amber-700">Unaided (EE):</span> Tuition / DVP / Admission → 100% SVK | All other fees → 100% SMP | Fine → 100% Govt</p>
        <p className="text-gray-400">Library fee applies only to 1st Year students and Lateral entry 2nd Year students. Fine is based on actual paid amounts from fee records.</p>
      </div>

      {/* ── Remittance Tracker ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div>
            <h3 className="text-xs font-bold text-gray-800">Remittance Tracker</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Record outgoing payments to Govt, SVK &amp; SMP — phase by phase</p>
          </div>
        </div>

        {/* Payee tabs */}
        <div className="px-4 py-2.5 border-b border-gray-100">
          <SegmentedToggle
            options={[
              { value: 'GOV',  label: 'Government (K2)' },
              { value: 'SVK',  label: 'SVK Management'   },
              { value: 'SMP',  label: 'SMP'              },
              { value: 'CONSOLIDATED', label: 'Consolidated' },
            ]}
            value={trackerTab}
            onChange={(v) => { setTrackerTab(v as RemittancePayee | 'CONSOLIDATED'); setDeleteConfirming(null); setEditingRemittance(null); }}
          />
        </div>

        <div className="p-4 space-y-4">
          {/* ── GOV panel ── */}
          {trackerTab === 'GOV' && (() => {
            const balance = grandTotals.gov - govTotalPaid;
            return (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total Payable', value: grandTotals.gov, color: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200'   },
                    { label: 'Total Paid',    value: govTotalPaid,    color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
                    {
                      label: 'Balance',
                      value: balance,
                      color:  balance > 0 ? 'text-amber-700'   : balance < 0 ? 'text-red-600'   : 'text-emerald-700',
                      bg:     balance > 0 ? 'bg-amber-50'      : balance < 0 ? 'bg-red-50'      : 'bg-emerald-50',
                      border: balance > 0 ? 'border-amber-200' : balance < 0 ? 'border-red-300' : 'border-emerald-200',
                    },
                  ].map((c) => (
                    <div key={c.label} className={`rounded-lg border ${c.border} ${c.bg} px-3 py-2`}>
                      <p className="text-xs font-semibold uppercase text-gray-400 mb-0.5">{c.label}</p>
                      <p className={`text-base font-bold ${c.color}`}>{fmt(c.value)}</p>
                    </div>
                  ))}
                </div>

                {/* Headwise phase table */}
                <div className="overflow-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-[#D0E2F2]/40 border-b border-[#3B5B8A]/20">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">Head</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700 w-28">Total Payable</th>
                        {govPhases.map((ph) => (
                          <th key={ph} className="px-3 py-2 text-right font-bold text-gray-700 w-28">{ph}</th>
                        ))}
                        <th className="px-3 py-2 text-right font-bold text-gray-700 w-28 bg-amber-50/60">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {GOV_HEADS.map(({ key, label }, i) => {
                        const payable = govPayableByHead[key];
                        const paid    = govPaidByHead[key];
                        const bal     = payable - paid;
                        return (
                          <tr key={key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-3 py-1.5 font-medium text-gray-700">{label}</td>
                            <td className="px-3 py-1.5 text-right text-gray-600">{fmt(payable)}</td>
                            {govPhases.map((ph) => {
                              const amt = govPhaseMap.get(ph)?.[key] ?? 0;
                              return (
                                <td key={ph} className="px-3 py-1.5 text-right text-gray-600">
                                  {amt > 0 ? fmt(amt) : <span className="text-gray-300">—</span>}
                                </td>
                              );
                            })}
                            <td className={`px-3 py-1.5 text-right font-semibold ${bal > 0 ? 'text-amber-700' : bal < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {bal === 0 ? '✓' : fmt(bal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                      <tr>
                        <td className="px-3 py-1.5 text-gray-800">Total</td>
                        <td className="px-3 py-1.5 text-right text-gray-800">{fmt(grandTotals.gov)}</td>
                        {govPhases.map((ph) => {
                          const tot = govPhaseMap.get(ph)?.total ?? 0;
                          return (
                            <td key={ph} className="px-3 py-1.5 text-right text-gray-800">
                              {tot > 0 ? fmt(tot) : <span className="text-gray-300 font-normal">—</span>}
                            </td>
                          );
                        })}
                        <td className={`px-3 py-1.5 text-right ${balance > 0 ? 'text-amber-700' : balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {balance === 0 ? '✓' : fmt(balance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Phase log */}
                {govRemittances.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase text-gray-400">Payment Log</p>
                    {govRemittances.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                        <span className="font-semibold text-gray-700 shrink-0 whitespace-nowrap">{r.phase}</span>
                        <span className="text-gray-500 shrink-0 whitespace-nowrap">{r.date}</span>
                        <span className="text-gray-400 shrink-0 whitespace-nowrap">{r.paymentMode}</span>
                        {(() => {
                          const count = getAttachments(r).length;
                          if (count === 0) return null;
                          return (
                            <span className="text-gray-400 shrink-0 text-sm leading-none" title="Attached file(s) — view/download from Edit">
                              📎{count > 1 ? count : ''}
                            </span>
                          );
                        })()}
                        <span className="font-semibold text-gray-800 ml-auto tabular-nums shrink-0 whitespace-nowrap">{fmt(r.amount)}</span>
                        {deleteConfirming === r.id ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button className="text-xs text-red-600 font-semibold hover:text-red-800" onClick={() => handleDelete(r.id)}>Confirm</button>
                            <button className="text-xs text-gray-400 hover:text-gray-600"            onClick={() => setDeleteConfirming(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 rounded px-2 py-0.5 transition-colors"
                              onClick={() => { setEditingRemittance(r); setShowModal(true); }}
                            >
                              Edit
                            </button>
                            <button
                              className="text-[11px] font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 rounded px-2 py-0.5 transition-colors"
                              onClick={() => setDeleteConfirming(r.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingRemittance(null); setShowModal(true); }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#3B5B8A] hover:text-[#2e4a72] border border-[#3B5B8A]/25 hover:border-[#3B5B8A]/50 bg-[#D0E2F2]/40 hover:bg-[#D0E2F2]/70 rounded-full px-3 py-1.5 transition-colors"
                  >
                    <span className="text-sm leading-none">+</span> Record Govt Payment
                  </button>
                  <button
                    onClick={() => exportRemittanceTrackerPdf(
                      'Government (K2)',
                      academicYear,
                      {
                        head: ['Head', 'Total Payable', ...govPhases, 'Balance'],
                        body: GOV_HEADS.map(({ key, label }) => {
                          const payableH = govPayableByHead[key];
                          const paidH    = govPaidByHead[key];
                          const balH     = payableH - paidH;
                          return [label, numPdf(payableH), ...govPhases.map((ph) => numPdf(govPhaseMap.get(ph)?.[key] ?? 0)), balH === 0 ? 'Settled' : numPdf(balH)];
                        }),
                        foot: ['Total', numPdf(grandTotals.gov), ...govPhases.map((ph) => numPdf(govPhaseMap.get(ph)?.total ?? 0)), balance === 0 ? 'Settled' : numPdf(balance)],
                      },
                      {
                        head: ['Phase', 'Date', 'Mode', 'Reference', 'Remarks', 'Amount'],
                        body: govRemittances.map((r) => [r.phase, r.date, r.paymentMode, r.reference || '-', r.remarks || '-', numPdf(r.amount)]),
                      },
                    )}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    PDF
                  </button>
                </div>
              </>
            );
          })()}

          {/* ── SVK / SMP panel (shared layout) ── */}
          {(trackerTab === 'SVK' || trackerTab === 'SMP') && (() => {
            const isSVK      = trackerTab === 'SVK';
            const rem        = isSVK ? svkRemittances : smpRemittances;
            const paid       = isSVK ? svkPaid        : smpPaid;
            const payable    = isSVK ? grandTotals.svk : grandTotals.smp;
            const balance    = payable - paid;
            const label      = isSVK ? 'SVK' : 'SMP';
            const phases     = [...new Set(rem.map((r) => r.phase))].sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999));
            const phaseTotals = new Map(phases.map((ph) => [ph, rem.filter((r) => r.phase === ph).reduce((s, r) => s + r.amount, 0)]));
            return (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Total Payable', value: payable, color: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200'   },
                    { label: 'Total Paid',    value: paid,    color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
                    {
                      label: 'Balance',
                      value: balance,
                      color:  balance > 0 ? 'text-amber-700'   : balance < 0 ? 'text-red-600'   : 'text-emerald-700',
                      bg:     balance > 0 ? 'bg-amber-50'      : balance < 0 ? 'bg-red-50'      : 'bg-emerald-50',
                      border: balance > 0 ? 'border-amber-200' : balance < 0 ? 'border-red-300' : 'border-emerald-200',
                    },
                  ].map((c) => (
                    <div key={c.label} className={`rounded-lg border ${c.border} ${c.bg} px-3 py-2`}>
                      <p className="text-xs font-semibold uppercase text-gray-400 mb-0.5">{c.label}</p>
                      <p className={`text-base font-bold ${c.color}`}>{fmt(c.value)}</p>
                    </div>
                  ))}
                </div>

                {/* Head / Total Payable / Phase / Balance table */}
                <div className="overflow-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-[#D0E2F2]/40 border-b border-[#3B5B8A]/20">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">Head</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700 w-28">Total Payable</th>
                        {phases.map((ph) => (
                          <th key={ph} className="px-3 py-2 text-right font-bold text-gray-700 w-28">{ph}</th>
                        ))}
                        <th className="px-3 py-2 text-right font-bold text-gray-700 w-28 bg-amber-50/60">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white">
                        <td className="px-3 py-1.5 font-medium text-gray-700">{isSVK ? 'SVK Management' : 'SMP'}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{fmt(payable)}</td>
                        {phases.map((ph) => {
                          const amt = phaseTotals.get(ph) ?? 0;
                          return (
                            <td key={ph} className="px-3 py-1.5 text-right text-gray-600">
                              {amt > 0 ? fmt(amt) : <span className="text-gray-300">—</span>}
                            </td>
                          );
                        })}
                        <td className={`px-3 py-1.5 text-right font-semibold ${balance > 0 ? 'text-amber-700' : balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {balance === 0 ? '✓' : fmt(balance)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {rem.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase text-gray-400">Payment Log</p>
                    {rem.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                        <span className="font-semibold text-gray-700 shrink-0 whitespace-nowrap">{r.phase}</span>
                        <span className="text-gray-500 shrink-0 whitespace-nowrap">{r.date}</span>
                        <span className="text-gray-400 shrink-0 whitespace-nowrap">{r.paymentMode}</span>
                        {(() => {
                          const count = getAttachments(r).length;
                          if (count === 0) return null;
                          return (
                            <span className="text-gray-400 shrink-0 text-sm leading-none" title="Attached file(s) — view/download from Edit">
                              📎{count > 1 ? count : ''}
                            </span>
                          );
                        })()}
                        <span className="font-semibold text-gray-800 ml-auto tabular-nums shrink-0 whitespace-nowrap">{fmt(r.amount)}</span>
                        {deleteConfirming === r.id ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button className="text-xs text-red-600 font-semibold hover:text-red-800" onClick={() => handleDelete(r.id)}>Confirm</button>
                            <button className="text-xs text-gray-400 hover:text-gray-600"            onClick={() => setDeleteConfirming(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 rounded px-2 py-0.5 transition-colors"
                              onClick={() => { setEditingRemittance(r); setShowModal(true); }}
                            >
                              Edit
                            </button>
                            <button
                              className="text-[11px] font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 rounded px-2 py-0.5 transition-colors"
                              onClick={() => setDeleteConfirming(r.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingRemittance(null); setShowModal(true); }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#3B5B8A] hover:text-[#2e4a72] border border-[#3B5B8A]/25 hover:border-[#3B5B8A]/50 bg-[#D0E2F2]/40 hover:bg-[#D0E2F2]/70 rounded-full px-3 py-1.5 transition-colors"
                  >
                    <span className="text-sm leading-none">+</span> Record {label} Payment
                  </button>
                  <button
                    onClick={() => exportRemittanceTrackerPdf(
                      isSVK ? 'SVK Management' : 'SMP',
                      academicYear,
                      {
                        head: ['Head', 'Total Payable', ...phases, 'Balance'],
                        body: [[
                          isSVK ? 'SVK Management' : 'SMP',
                          numPdf(payable),
                          ...phases.map((ph) => numPdf(phaseTotals.get(ph) ?? 0)),
                          balance === 0 ? 'Settled' : numPdf(balance),
                        ]],
                      },
                      {
                        head: ['Phase', 'Date', 'Mode', 'Reference', 'Remarks', 'Amount'],
                        body: rem.map((r) => [r.phase, r.date, r.paymentMode, r.reference || '-', r.remarks || '-', numPdf(r.amount)]),
                      },
                    )}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    PDF
                  </button>
                </div>
              </>
            );
          })()}

          {/* ── Consolidated panel ── */}
          {trackerTab === 'CONSOLIDATED' && (() => {
            const totalPayable = grandTotals.gov + grandTotals.svk + grandTotals.smp;
            const totalPaid    = govTotalPaid + svkPaid + smpPaid;
            const totalBalance = totalPayable - totalPaid;

            const rows = [
              { label: 'Government (K2)', payable: grandTotals.gov, paid: govTotalPaid, color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
              { label: 'SVK Management',  payable: grandTotals.svk, paid: svkPaid,      color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
              { label: 'SMP',             payable: grandTotals.smp, paid: smpPaid,      color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200'  },
            ];

            const allRemittances = [
              ...govRemittances.map((r) => ({ ...r, payeeLabel: 'Govt' })),
              ...svkRemittances.map((r) => ({ ...r, payeeLabel: 'SVK'  })),
              ...smpRemittances.map((r) => ({ ...r, payeeLabel: 'SMP'  })),
            ].sort((a, b) => a.date.localeCompare(b.date));

            return (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Payable', value: totalPayable, color: 'text-gray-800',   bg: 'bg-gray-50',   border: 'border-gray-200'   },
                    { label: 'Total Remitted', value: totalPaid,   color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200'  },
                    {
                      label: 'Balance',
                      value: totalBalance,
                      color:  totalBalance > 0 ? 'text-amber-700'   : totalBalance < 0 ? 'text-red-600'   : 'text-emerald-700',
                      bg:     totalBalance > 0 ? 'bg-amber-50'      : totalBalance < 0 ? 'bg-red-50'      : 'bg-emerald-50',
                      border: totalBalance > 0 ? 'border-amber-200' : totalBalance < 0 ? 'border-red-300' : 'border-emerald-200',
                    },
                    { label: 'Entries', value: allRemittances.length as unknown as number, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', isCount: true },
                  ].map((c) => (
                    <div key={c.label} className={`rounded-lg border ${c.border} ${c.bg} px-3 py-2`}>
                      <p className="text-xs font-semibold uppercase text-gray-400 mb-0.5">{c.label}</p>
                      <p className={`text-base font-bold ${c.color}`}>{'isCount' in c && c.isCount ? c.value : fmt(c.value as number)}</p>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => exportRemittanceTrackerPdf(
                      'Consolidated',
                      academicYear,
                      {
                        head: ['Payee', 'Payable', 'Remitted', 'Balance'],
                        body: rows.map((row) => {
                          const bal = row.payable - row.paid;
                          return [row.label, numPdf(row.payable), numPdf(row.paid), bal === 0 ? 'Settled' : numPdf(bal)];
                        }),
                        foot: ['Grand Total', numPdf(totalPayable), numPdf(totalPaid), totalBalance === 0 ? 'Settled' : numPdf(totalBalance)],
                      },
                      {
                        head: ['Payee', 'Phase', 'Date', 'Mode', 'Reference', 'Remarks', 'Amount'],
                        body: allRemittances.map((r) => [r.payeeLabel, r.phase, r.date, r.paymentMode, r.reference || '-', r.remarks || '-', numPdf(r.amount)]),
                      },
                    )}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    PDF
                  </button>
                </div>

                {/* Payee summary table */}
                <div className="overflow-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className={`${ACCENT} text-white`}>
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Payee</th>
                        <th className="px-3 py-2 text-right font-semibold">Payable</th>
                        <th className="px-3 py-2 text-right font-semibold">Remitted</th>
                        <th className="px-3 py-2 text-right font-semibold">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row, i) => {
                        const bal = row.payable - row.paid;
                        return (
                          <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-3 py-2 font-medium text-gray-700">{row.label}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{fmt(row.payable)}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${row.color}`}>{fmt(row.paid)}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${bal > 0 ? 'text-amber-700' : bal < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {bal === 0 ? '✓ Settled' : fmt(bal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                      <tr>
                        <td className="px-3 py-2 text-gray-800">Grand Total</td>
                        <td className="px-3 py-2 text-right text-gray-800">{fmt(totalPayable)}</td>
                        <td className="px-3 py-2 text-right text-green-700">{fmt(totalPaid)}</td>
                        <td className={`px-3 py-2 text-right ${totalBalance > 0 ? 'text-amber-700' : totalBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {totalBalance === 0 ? '✓ Settled' : fmt(totalBalance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Combined payment log */}
                {allRemittances.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase text-gray-400">All Payments — Chronological</p>
                    {allRemittances.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                        <span className={`text-xs font-bold shrink-0 px-1.5 py-0.5 rounded ${
                          r.payeeLabel === 'Govt' ? 'bg-red-100 text-red-700' :
                          r.payeeLabel === 'SVK'  ? 'bg-violet-100 text-violet-700' :
                                                    'bg-green-100 text-green-700'
                        }`}>{r.payeeLabel}</span>
                        <span className="font-semibold text-gray-700 shrink-0 whitespace-nowrap">{r.phase}</span>
                        <span className="text-gray-500 shrink-0 whitespace-nowrap">{r.date}</span>
                        <span className="text-gray-400 shrink-0 whitespace-nowrap">{r.paymentMode}</span>
                        {(() => {
                          const count = getAttachments(r).length;
                          if (count === 0) return null;
                          return (
                            <span className="text-gray-400 shrink-0 text-sm leading-none" title="Attached file(s) — view/download from Edit">
                              📎{count > 1 ? count : ''}
                            </span>
                          );
                        })()}
                        <span className="font-semibold text-gray-800 ml-auto tabular-nums shrink-0 whitespace-nowrap">{fmt(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {allRemittances.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No remittances recorded yet.</p>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {showModal && trackerTab !== 'CONSOLIDATED' && (
        <RemittanceModal
          payee={trackerTab}
          academicYear={academicYear as AcademicYear}
          existingPhases={
            trackerTab === 'GOV' ? govPhases :
            trackerTab === 'SVK' ? svkRemittances.map((r) => r.phase) :
                                   smpRemittances.map((r) => r.phase)
          }
          editing={editingRemittance}
          onClose={() => { setShowModal(false); setEditingRemittance(null); }}
        />
      )}
    </div>
  );
}

// ── Tab: Fee Reg_1 ───────────────────────────────────────────────────────────

interface Reg1Row {
  record: FeeRecord;
  smpCash: number; smpPay: number;
  svkCash: number; svkPay: number;
  rcCash:  number; rcPay:  number;
  insCash: number; insPay: number;
  total:   number;
}

function exportFeeReg1Excel(rows: Reg1Row[], academicYear: string): void {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const header = ['Sl','Date','Rpt No','Name','Course','Year','SMP Cash','SMP Pay','SVK Cash','SVK Pay','RC Cash','RC Pay','Ins Cash','Ins Pay','Total','Remarks'];
  const dataRows = rows.map((r, i) => {
    const [ry, rm, rd] = r.record.date.slice(0, 10).split('-');
    return [
      i + 1,
      `${rd} ${MONTHS[parseInt(rm) - 1]} ${ry}`,
      r.record.receiptNumber || '',
      r.record.studentName,
      r.record.course,
      r.record.year,
      r.smpCash || null, r.smpPay  || null,
      r.svkCash || null, r.svkPay  || null,
      r.rcCash  || null, r.rcPay   || null,
      r.insCash || null, r.insPay  || null,
      r.total,
      r.record.remarks || '',
    ];
  });
  const tot = rows.reduce(
    (a, r) => ({
      smpCash: a.smpCash + r.smpCash, smpPay: a.smpPay + r.smpPay,
      svkCash: a.svkCash + r.svkCash, svkPay: a.svkPay + r.svkPay,
      rcCash:  a.rcCash  + r.rcCash,  rcPay:  a.rcPay  + r.rcPay,
      insCash: a.insCash + r.insCash, insPay: a.insPay + r.insPay,
      total:   a.total   + r.total,
    }),
    { smpCash: 0, smpPay: 0, svkCash: 0, svkPay: 0, rcCash: 0, rcPay: 0, insCash: 0, insPay: 0, total: 0 },
  );
  const totRow = [
    'TOTAL','','','','','',
    tot.smpCash || null, tot.smpPay  || null,
    tot.svkCash || null, tot.svkPay  || null,
    tot.rcCash  || null, tot.rcPay   || null,
    tot.insCash || null, tot.insPay  || null,
    tot.total, '',
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee Register 1');
  XLSX.writeFile(wb, `Fee_Register_1_${academicYear}.xlsx`);
}

function FeeReg1Tab({
  feeRecords, allStudents, showAllYears, academicYear,
}: {
  feeRecords: FeeRecord[];
  allStudents: Student[];
  showAllYears: boolean;
  academicYear: string;
}) {
  const [aidedFilter,   setAidedFilter]   = useState<'AIDED' | 'UNAIDED' | ''>('');
  const [courseFilter,  setCourseFilter]  = useState<Course | ''>('');
  const [yearFilter,    setYearFilter]    = useState<Year | ''>('');
  const [admTypeFilter, setAdmTypeFilter] = useState<AdmType | ''>('');
  const [admCatFilter,  setAdmCatFilter]  = useState<AdmCat | ''>('');
  const [dateFrom,      setDateFrom]      = useState('');
  const [dateTo,        setDateTo]        = useState('');
  const [searchTerm,      setSearchTerm]      = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const studentMap = useMemo(
    () => new Map(allStudents.map((s) => [s.id, s])),
    [allStudents],
  );

  const baseRows = useMemo((): Reg1Row[] => {
    let list = feeRecords;
    if (aidedFilter === 'AIDED')   list = list.filter((r) => AIDED_COURSES_SET.has(r.course));
    if (aidedFilter === 'UNAIDED') list = list.filter((r) => !AIDED_COURSES_SET.has(r.course));
    if (courseFilter)  list = list.filter((r) => r.course  === courseFilter);
    if (yearFilter)    list = list.filter((r) => r.year    === yearFilter);
    if (admTypeFilter) list = list.filter((r) => r.admType === admTypeFilter);
    if (admCatFilter)  list = list.filter((r) => r.admCat  === admCatFilter);
    if (dateFrom)      list = list.filter((r) => r.date.slice(0, 10) >= dateFrom);
    if (dateTo)        list = list.filter((r) => r.date.slice(0, 10) <= dateTo);

    return list.map((r): Reg1Row => {
      const smpMode = r.smpPaymentMode        ?? r.paymentMode;
      const svkMode = r.svkPaymentMode        ?? r.paymentMode;
      const addMode = r.additionalPaymentMode ?? r.paymentMode;

      const smpAmt  = SMP_FEE_HEADS.reduce((s, { key }) => s + r.smp[key], 0);
      const smpCash = smpMode === 'CASH' ? smpAmt : smpMode === 'SPLIT' ? (r.smpSplit?.cash ?? 0) : 0;
      const smpPay  = smpMode === 'UPI'  ? smpAmt : smpMode === 'SPLIT' ? (r.smpSplit?.upi  ?? 0) : 0;

      const svkCash = svkMode === 'CASH' ? r.svk : svkMode === 'SPLIT' ? (r.svkSplit?.cash ?? 0) : 0;
      const svkPay  = svkMode === 'UPI'  ? r.svk : svkMode === 'SPLIT' ? (r.svkSplit?.upi  ?? 0) : 0;

      let rcCash = 0, rcPay = 0, insCash = 0, insPay = 0;
      const totalAdd = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
      if (totalAdd > 0) {
        const splitCash = addMode === 'SPLIT' ? (r.additionalSplit?.cash ?? 0) : 0;
        const splitUpi  = addMode === 'SPLIT' ? (r.additionalSplit?.upi  ?? 0) : 0;
        for (const head of r.additionalPaid) {
          const lbl   = head.label.toLowerCase();
          const ratio = head.amount / totalAdd;
          const cash  = addMode === 'CASH' ? head.amount : addMode === 'SPLIT' ? Math.round(splitCash * ratio) : 0;
          const pay   = addMode === 'UPI'  ? head.amount : addMode === 'SPLIT' ? Math.round(splitUpi  * ratio) : 0;
          if (lbl.includes('red cross') || lbl.includes('redcross')) { rcCash  += cash; rcPay  += pay; }
          else if (lbl.includes('insur'))                            { insCash += cash; insPay += pay; }
        }
      }

      const total = smpCash + smpPay + svkCash + svkPay + rcCash + rcPay + insCash + insPay;
      return { record: r, smpCash, smpPay, svkCash, svkPay, rcCash, rcPay, insCash, insPay, total };
    }).sort((a, b) => {
      const d = a.record.date.localeCompare(b.record.date);
      if (d !== 0) return d;
      return a.record.receiptNumber.localeCompare(b.record.receiptNumber);
    });
  }, [feeRecords, aidedFilter, courseFilter, yearFilter, admTypeFilter, admCatFilter, dateFrom, dateTo]);

  const rows = useMemo(() => {
    if (!debouncedSearch) return baseRows;
    const q = debouncedSearch.trim().toUpperCase();
    return baseRows.filter((r) => {
      const rec = r.record;
      const name = (studentMap.get(rec.studentId)?.studentNameSSLC ?? rec.studentName).toUpperCase();
      return (
        name.includes(q) ||
        (rec.regNumber ?? '').toUpperCase().includes(q) ||
        (rec.receiptNumber ?? '').includes(q)
      );
    });
  }, [baseRows, debouncedSearch, studentMap]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      smpCash: acc.smpCash + r.smpCash,
      smpPay:  acc.smpPay  + r.smpPay,
      svkCash: acc.svkCash + r.svkCash,
      svkPay:  acc.svkPay  + r.svkPay,
      rcCash:  acc.rcCash  + r.rcCash,
      rcPay:   acc.rcPay   + r.rcPay,
      insCash: acc.insCash + r.insCash,
      insPay:  acc.insPay  + r.insPay,
      total:   acc.total   + r.total,
    }),
    { smpCash: 0, smpPay: 0, svkCash: 0, svkPay: 0, rcCash: 0, rcPay: 0, insCash: 0, insPay: 0, total: 0 },
  ), [rows]);

  const hasActiveFilters = !!searchTerm || !!aidedFilter || !!courseFilter || !!yearFilter || !!admTypeFilter || !!admCatFilter || !!dateFrom || !!dateTo;
  function clearFilters() {
    setSearchTerm('');
    setAidedFilter(''); setCourseFilter(''); setYearFilter('');
    setAdmTypeFilter(''); setAdmCatFilter(''); setDateFrom(''); setDateTo('');
  }

  const td  = 'px-2 py-1.5 text-right text-[11px] tabular-nums';
  const tdL = 'px-2 py-1.5 text-left  text-[11px]';
  const tdC = 'px-2 py-1.5 text-center text-[11px]';

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* Filters */}
      <FilterPanel
        search={<SearchBox value={searchTerm} onChange={setSearchTerm} placeholder="Search name / reg / receipt…" />}
        right={<>
          {showAllYears && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-400 bg-amber-50 text-[10px] font-semibold text-amber-700">
              Incl. Prior Year Dues
            </span>
          )}
          <span className="text-xs text-gray-500 whitespace-nowrap">{rows.length} record{rows.length !== 1 ? 's' : ''}</span>
          <ExportBar onExcel={() => exportFeeReg1Excel(rows, academicYear)} />
        </>}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      >
        <select value={aidedFilter}   onChange={(e) => setAidedFilter(e.target.value as 'AIDED' | 'UNAIDED' | '')} className={fs}>
          <option value="">Aided &amp; Unaided</option>
          <option value="AIDED">Aided (CE, ME, EC, CS)</option>
          <option value="UNAIDED">Unaided (EE)</option>
        </select>
        <select value={courseFilter}  onChange={(e) => setCourseFilter(e.target.value as Course | '')} className={fs}>
          <option value="">All Courses</option>
          {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={yearFilter}    onChange={(e) => setYearFilter(e.target.value as Year | '')} className={fs}>
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={admTypeFilter} onChange={(e) => setAdmTypeFilter(e.target.value as AdmType | '')} className={fs}>
          <option value="">All Adm Types</option>
          {ADM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={admCatFilter}  onChange={(e) => setAdmCatFilter(e.target.value as AdmCat | '')} className={fs}>
          <option value="">All Adm Cats</option>
          {ADM_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className={fs} title="From date" />
        <input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}
          className={fs} title="To date" />
      </FilterPanel>

      {/* Table */}
      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead className={`sticky top-0 z-10 ${ACCENT} text-white`}>
            <tr>
              <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
              <th className="px-2 py-1.5 font-semibold whitespace-nowrap" rowSpan={2}>Date</th>
              <th className="px-2 py-1.5 font-semibold whitespace-nowrap" rowSpan={2}>Rpt No</th>
              <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Name</th>
              <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Course</th>
              <th className="px-2 py-1.5 font-semibold whitespace-nowrap" rowSpan={2}>Year</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={2}>SMP</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={2}>SVK</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={2}>RC</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={2}>Ins</th>
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30 whitespace-nowrap" rowSpan={2}>Total</th>
              <th className="px-2 py-1.5 font-semibold border-l border-white/30" rowSpan={2}>Remarks</th>
            </tr>
            <tr>
              {(['Cash','Pay','Cash','Pay','Cash','Pay','Cash','Pay'] as const).map((h, i) => (
                <th key={i} className={`px-2 py-1 text-right text-[10px] font-semibold ${i % 2 === 0 ? 'border-l border-white/30' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-8 text-center text-gray-400 text-xs">No records match the current filters.</td>
              </tr>
            ) : rows.map((r, i) => {
              const student = studentMap.get(r.record.studentId);
              const [ry, rm, rd] = r.record.date.slice(0, 10).split('-');
              const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const dateStr = `${rd} ${MONTHS[parseInt(rm) - 1]} ${ry}`;
              return (
                <tr key={r.record.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className={`${tdC} text-gray-400`}>{i + 1}</td>
                  <td className={`${tdL} text-gray-500 whitespace-nowrap`}>{dateStr}</td>
                  <td className={`${tdL} text-gray-600 whitespace-nowrap`}>{r.record.receiptNumber || '—'}</td>
                  <td className={`${tdL} font-medium max-w-[130px] truncate`}>{student?.studentNameSSLC ?? r.record.studentName}</td>
                  <td className={`${tdC} font-semibold`}>{r.record.course}</td>
                  <td className={`${tdL} whitespace-nowrap`}>{r.record.year}</td>
                  <td className={`${td} border-l border-gray-100 ${r.smpCash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{r.smpCash > 0 ? fmt(r.smpCash) : '—'}</td>
                  <td className={`${td} ${r.smpPay  > 0 ? 'text-blue-700'    : 'text-gray-300'}`}>{r.smpPay  > 0 ? fmt(r.smpPay)  : '—'}</td>
                  <td className={`${td} border-l border-gray-100 ${r.svkCash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{r.svkCash > 0 ? fmt(r.svkCash) : '—'}</td>
                  <td className={`${td} ${r.svkPay  > 0 ? 'text-blue-700'    : 'text-gray-300'}`}>{r.svkPay  > 0 ? fmt(r.svkPay)  : '—'}</td>
                  <td className={`${td} border-l border-gray-100 ${r.rcCash  > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{r.rcCash  > 0 ? fmt(r.rcCash)  : '—'}</td>
                  <td className={`${td} ${r.rcPay   > 0 ? 'text-blue-700'    : 'text-gray-300'}`}>{r.rcPay   > 0 ? fmt(r.rcPay)   : '—'}</td>
                  <td className={`${td} border-l border-gray-100 ${r.insCash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{r.insCash > 0 ? fmt(r.insCash) : '—'}</td>
                  <td className={`${td} ${r.insPay  > 0 ? 'text-blue-700'    : 'text-gray-300'}`}>{r.insPay  > 0 ? fmt(r.insPay)  : '—'}</td>
                  <td className={`${td} border-l border-gray-100 font-semibold text-gray-800`}>{r.total > 0 ? fmt(r.total) : '—'}</td>
                  <td className={`${tdL} border-l border-gray-100 text-gray-500 max-w-[160px] truncate`}>{r.record.remarks || '—'}</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className={TFOOT}>
              <tr>
                <td className="px-2 py-2 text-center text-gray-400">—</td>
                <td className="px-2 py-2 whitespace-nowrap" colSpan={5}>Total — {rows.length} record{rows.length !== 1 ? 's' : ''}</td>
                <td className={`px-2 py-2 text-right border-l border-gray-200 ${totals.smpCash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{totals.smpCash > 0 ? fmt(totals.smpCash) : '—'}</td>
                <td className={`px-2 py-2 text-right ${totals.smpPay  > 0 ? 'text-blue-700'    : 'text-gray-300'}`}>{totals.smpPay  > 0 ? fmt(totals.smpPay)  : '—'}</td>
                <td className={`px-2 py-2 text-right border-l border-gray-200 ${totals.svkCash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{totals.svkCash > 0 ? fmt(totals.svkCash) : '—'}</td>
                <td className={`px-2 py-2 text-right ${totals.svkPay  > 0 ? 'text-blue-700'    : 'text-gray-300'}`}>{totals.svkPay  > 0 ? fmt(totals.svkPay)  : '—'}</td>
                <td className={`px-2 py-2 text-right border-l border-gray-200 ${totals.rcCash  > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{totals.rcCash  > 0 ? fmt(totals.rcCash)  : '—'}</td>
                <td className={`px-2 py-2 text-right ${totals.rcPay   > 0 ? 'text-blue-700'    : 'text-gray-300'}`}>{totals.rcPay   > 0 ? fmt(totals.rcPay)   : '—'}</td>
                <td className={`px-2 py-2 text-right border-l border-gray-200 ${totals.insCash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{totals.insCash > 0 ? fmt(totals.insCash) : '—'}</td>
                <td className={`px-2 py-2 text-right ${totals.insPay  > 0 ? 'text-blue-700'    : 'text-gray-300'}`}>{totals.insPay  > 0 ? fmt(totals.insPay)  : '—'}</td>
                <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(totals.total)}</td>
                <td className="px-2 py-2 border-l border-gray-200"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Shared filter props + component ───────────────────────────────────────────
interface CommonFilterProps {
  aidedFilter: 'AIDED' | 'UNAIDED' | '';
  setAidedFilter: (v: 'AIDED' | 'UNAIDED' | '') => void;
  courseFilter: Course | '';
  setCourseFilter: (v: Course | '') => void;
  yearFilter: Year | '';
  setYearFilter: (v: Year | '') => void;
  admTypeFilter: AdmType | '';
  setAdmTypeFilter: (v: AdmType | '') => void;
  admCatFilter: AdmCat | '';
  setAdmCatFilter: (v: AdmCat | '') => void;
  feeStatusFilter: FeeStatus;
  setFeeStatusFilter: (v: FeeStatus) => void;
  stats: { total: number; paidCount: number; notPaid: number; duesCount: number; noDuesCount: number };
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

function CommonFilters({ fp, extra, search }: { fp: CommonFilterProps; extra?: ReactNode; search?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {fp.stats.total > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Total"       count={fp.stats.total}       active={fp.feeStatusFilter === 'ALL'}          colorClass="border-[#3B5B8A]/50 bg-[#D0E2F2] text-[#3B5B8A]"          onClick={() => fp.setFeeStatusFilter('ALL')} />
          <Chip label="Paid"        count={fp.stats.paidCount}   active={fp.feeStatusFilter === 'PAID'}         colorClass="border-green-400 bg-green-100 text-green-700"       onClick={() => fp.setFeeStatusFilter('PAID')} />
          <Chip label="Not Paid"    count={fp.stats.notPaid}     active={fp.feeStatusFilter === 'NOT_PAID'}     colorClass="border-red-400 bg-red-100 text-red-700"             onClick={() => fp.setFeeStatusFilter('NOT_PAID')} />
          <Chip label="Fee Dues"    count={fp.stats.duesCount}   active={fp.feeStatusFilter === 'FEE_DUES'}     colorClass="border-amber-400 bg-amber-100 text-amber-700"       onClick={() => fp.setFeeStatusFilter('FEE_DUES')} />
          <Chip label="No Fee Dues" count={fp.stats.noDuesCount} active={fp.feeStatusFilter === 'NO_FEE_DUES'}  colorClass="border-emerald-400 bg-emerald-100 text-emerald-700" onClick={() => fp.setFeeStatusFilter('NO_FEE_DUES')} />
        </div>
      )}
      <FilterPanel search={search} right={extra} hasActiveFilters={fp.hasActiveFilters} onClear={fp.clearFilters}>
        <select value={fp.aidedFilter} onChange={(e) => fp.setAidedFilter(e.target.value as 'AIDED' | 'UNAIDED' | '')} className={fs}>
          <option value="">Aided &amp; Unaided</option>
          <option value="AIDED">Aided (CE, ME, EC, CS)</option>
          <option value="UNAIDED">Unaided (EE)</option>
        </select>
        <select value={fp.courseFilter} onChange={(e) => fp.setCourseFilter(e.target.value as Course | '')} className={fs}>
          <option value="">All Courses</option>
          {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fp.yearFilter} onChange={(e) => fp.setYearFilter(e.target.value as Year | '')} className={fs}>
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={fp.admTypeFilter} onChange={(e) => fp.setAdmTypeFilter(e.target.value as AdmType | '')} className={fs}>
          <option value="">All Adm Types</option>
          {ADM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fp.admCatFilter} onChange={(e) => fp.setAdmCatFilter(e.target.value as AdmCat | '')} className={fs}>
          <option value="">All Adm Cats</option>
          {ADM_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fp.feeStatusFilter} onChange={(e) => fp.setFeeStatusFilter(e.target.value as FeeStatus)} className={fs}>
          <option value="ALL">All Fee Status</option>
          <option value="PAID">Paid</option>
          <option value="NOT_PAID">Not Paid</option>
          <option value="FEE_DUES">Fee Dues</option>
          <option value="NO_FEE_DUES">No Fee Dues</option>
        </select>
      </FilterPanel>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export function FeeReportsPage() {
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const [aidedFilter,     setAidedFilter]     = useState<'AIDED' | 'UNAIDED' | ''>('');
  const [courseFilter,    setCourseFilter]    = useState<Course | ''>('');
  const [yearFilter,      setYearFilter]      = useState<Year | ''>('');
  const [admTypeFilter,   setAdmTypeFilter]   = useState<AdmType | ''>('');
  const [admCatFilter,    setAdmCatFilter]    = useState<AdmCat | ''>('');
  const [feeStatusFilter, setFeeStatusFilter] = useState<FeeStatus>('ALL');
  const [activeTab,       setActiveTab]       = useState<TabId | null>(null);
  const [showAllYears,    setShowAllYears]    = useState(false);

  const DATE_TAB_IDS = new Set<TabId>(['daily-collections', 'day-summary', 'datewise-headwise', 'bank-remittance', 'fee-reg-1']);

  const { students: allStudents, loading: studentsLoading } = useStudents(academicYear);
  const { records: feeRecords,   loading: feeLoading       } = useFeeRecords(academicYear);
  // Fetches all payments whose date falls within the current financial year (Apr–Mar),
  // including prior-year dues collected this year. Only subscribes when toggle is on.
  const { records: allYearsRecords, loading: allYearsLoading } = useFeeRecords(
    showAllYears ? academicYear : null,
    { mode: 'by-date' },
  );
  const { overrides: feeOverrides, loading: overridesLoading } = useFeeOverrides(academicYear);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  useEffect(() => {
    if (!academicYear) { setFeeStructures([]); return; }
    getFeeStructuresByAcademicYear(academicYear).then(setFeeStructures).catch(() => {});
  }, [academicYear]);

  // SNQ refunds for the year — netted against SMP paid so a refunded student shows 0 due,
  // and Paid totals in Fee List / Dues Report aren't inflated by refunded amounts.
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  useEffect(() => {
    if (!academicYear) { setRefunds([]); return; }
    getRefundRecordsByAcademicYear(academicYear).then(setRefunds).catch(() => {});
  }, [academicYear]);

  const refundedByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of refunds.filter(isFeeNettingRefund)) map.set(r.studentId, (map.get(r.studentId) ?? 0) + r.refundAmount);
    return map;
  }, [refunds]);

  // Map: studentId → override (for O(1) lookup per student)
  const overrideByStudent = useMemo(
    () => new Map(feeOverrides.map((o) => [o.studentId, o])),
    [feeOverrides],
  );

  // ── Allotted maps (split SMP / SVK) ──────────────────────────────────────
  // smpAllottedNoFineByKey: SMP total excluding fine (fine is dynamic per student)
  // structureFineByKey: the static fine from the fee structure
  const { smpAllottedNoFineByKey, structureFineByKey, svkAllottedByKey, svkBaseAllottedByKey, additionalAllottedByKey } = useMemo(() => {
    const smpNoFineMap = new Map<string, number>();
    const fineMap      = new Map<string, number>();
    const svkMap       = new Map<string, number>();
    const svkBaseMap   = new Map<string, number>();
    const additionalMap = new Map<string, number>();
    for (const s of feeStructures) {
      const key = `${s.course}__${s.year}__${s.admType}__${s.admCat}`;
      const additionalSum = s.additionalHeads.reduce((t, h) => t + h.amount, 0);
      smpNoFineMap.set(key, SMP_FEE_HEADS.reduce((t, { key: k }) => t + (k === 'fine' ? 0 : s.smp[k]), 0));
      fineMap.set(key, s.smp.fine);
      svkMap.set(key, s.svk + additionalSum);
      svkBaseMap.set(key, s.svk);
      additionalMap.set(key, additionalSum);
    }
    return {
      smpAllottedNoFineByKey: smpNoFineMap, structureFineByKey: fineMap, svkAllottedByKey: svkMap,
      svkBaseAllottedByKey: svkBaseMap, additionalAllottedByKey: additionalMap,
    };
  }, [feeStructures]);

  // ── Paid maps (split SMP / SVK) + fine paid per student ──────────────────
  const { smpPaidByStudent, svkPaidByStudent, finePaidByStudent } = useMemo(() => {
    const smpMap  = new Map<string, number>();
    const svkMap  = new Map<string, number>();
    const fineMap = new Map<string, number>();
    for (const r of feeRecords) {
      const smpTotal = SMP_FEE_HEADS.reduce((t, { key }) => t + r.smp[key], 0);
      const svkTotal = r.svk + r.additionalPaid.reduce((t, h) => t + h.amount, 0);
      smpMap.set(r.studentId,  (smpMap.get(r.studentId)  ?? 0) + smpTotal);
      svkMap.set(r.studentId,  (svkMap.get(r.studentId)  ?? 0) + svkTotal);
      fineMap.set(r.studentId, (fineMap.get(r.studentId) ?? 0) + r.smp.fine);
    }
    return { smpPaidByStudent: smpMap, svkPaidByStudent: svkMap, finePaidByStudent: fineMap };
  }, [feeRecords]);

  // ── All students as fee rows ──────────────────────────────────────────────
  // Override takes precedence over structure per student.
  // Fine allotted: max(base fine, total fine paid) so fine payments never produce negative balance.
  // Only CONFIRMED students appear in student-based tabs (Statistics, Fee List, Dues, Course & Year, Consolidated).
  // Cancelled students with paid fees still appear in receipt-based tabs (Daily Collections, Datewise Headwise, Bank Remittance)
  // because those tabs consume raw feeRecords directly, not this list.
  const allStudentRows = useMemo((): StudentFeeRow[] =>
    allStudents.filter((s) => s.admissionStatus?.trim() === 'CONFIRMED').map((s) => {
      const override = overrideByStudent.get(s.id);
      const key      = `${s.course}__${s.year}__${s.admType}__${s.admCat}`;
      const finePaid = finePaidByStudent.get(s.id) ?? 0;

      let smpAllotted: number | null;
      let svkAllotted: number | null;
      let svkBaseAllotted: number | null;
      let additionalAllotted: number | null;

      if (override) {
        // Per-student override: sum all SMP heads (fine uses effective logic)
        const baseFine  = override.smp.fine;
        const effFine   = Math.max(baseFine, finePaid);
        const smpNoFine = SMP_FEE_HEADS.reduce((t, { key: k }) => t + (k === 'fine' ? 0 : override.smp[k]), 0);
        smpAllotted = smpNoFine + effFine;
        additionalAllotted = override.additionalHeads.reduce((t, h) => t + h.amount, 0);
        svkBaseAllotted = override.svk;
        svkAllotted = svkBaseAllotted + additionalAllotted;
      } else {
        const smpNoFine  = smpAllottedNoFineByKey.has(key) ? smpAllottedNoFineByKey.get(key)! : null;
        const structFine = structureFineByKey.get(key) ?? 0;
        const effFine    = Math.max(structFine, finePaid);
        smpAllotted = smpNoFine !== null ? smpNoFine + effFine : null;
        svkAllotted = svkAllottedByKey.has(key) ? svkAllottedByKey.get(key)! : null;
        svkBaseAllotted = svkBaseAllottedByKey.has(key) ? svkBaseAllottedByKey.get(key)! : null;
        additionalAllotted = additionalAllottedByKey.has(key) ? additionalAllottedByKey.get(key)! : null;
      }

      const allotted   = smpAllotted !== null ? (smpAllotted + (svkAllotted ?? 0)) : null;
      // SNQ refunds are netted against SMP paid: after a GM→SNQ concession refund the
      // student's net paid matches the SNQ allotted, so due is exactly 0 and Paid totals
      // aren't inflated by amounts already returned to the student.
      const refunded   = refundedByStudent.get(s.id) ?? 0;
      const smpPaid    = Math.max(0, (smpPaidByStudent.get(s.id) ?? 0) - refunded);
      const svkPaid    = svkPaidByStudent.get(s.id) ?? 0;
      const paid       = smpPaid + svkPaid;
      // Balances still clamped at 0 as a safety net: a student who paid more than currently
      // allotted (e.g. a concession granted but not yet refunded) is fully settled, not
      // "negative due" — and must never subtract from the cohort's total balance.
      const smpBalance = smpAllotted !== null ? Math.max(0, smpAllotted - smpPaid) : null;
      const svkBalance = svkAllotted !== null ? Math.max(0, svkAllotted - svkPaid) : null;
      const balance    = allotted    !== null ? Math.max(0, allotted    - paid)    : null;
      return {
        student: s, smpAllotted, svkAllotted, allotted, smpPaid, svkPaid, paid, smpBalance, svkBalance, balance,
        svkBaseAllotted, additionalAllotted,
      };
    }),
  [
    allStudents, overrideByStudent, smpAllottedNoFineByKey, structureFineByKey, svkAllottedByKey,
    svkBaseAllottedByKey, additionalAllottedByKey, smpPaidByStudent, svkPaidByStudent, finePaidByStudent, refundedByStudent,
  ]);

  // ── Stats for chips ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total       = allStudentRows.length;
    const paidCount   = allStudentRows.filter((r) => r.paid > 0).length;
    const duesCount   = allStudentRows.filter((r) => r.balance !== null && r.balance > 0).length;
    const noDuesCount = allStudentRows.filter((r) => r.balance !== null && r.balance <= 0).length;
    return { total, paidCount, notPaid: total - paidCount, duesCount, noDuesCount };
  }, [allStudentRows]);

  // ── Report hub card content (cheap, derived from data already loaded — no new
  //    Firestore reads: everything below comes from allStudentRows/feeRecords/
  //    feeStructures, all already subscribed to above) ───────────────────────
  const uniqueCollectionDays = useMemo(() => new Set(feeRecords.map((r) => r.date.slice(0, 10))).size, [feeRecords]);

  // True SMP / SVK / Additional split for both allotted and paid, plus per-bucket
  // balances (clamped at 0, matching the existing per-student balance convention).
  const dashboardTotals = useMemo(() => {
    const smpAllotted        = allStudentRows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
    const svkBaseAllotted    = allStudentRows.reduce((s, r) => s + (r.svkBaseAllotted ?? 0), 0);
    const additionalAllotted = allStudentRows.reduce((s, r) => s + (r.additionalAllotted ?? 0), 0);
    const totalAllotted      = smpAllotted + svkBaseAllotted + additionalAllotted;

    // Paid is decomposed straight from feeRecords (not the combined svkPaidByStudent
    // map above) so SVK and Additional come out as genuinely separate figures.
    let smpPaid = 0, svkPaid = 0, additionalPaid = 0;
    for (const r of feeRecords) {
      smpPaid        += SMP_FEE_HEADS.reduce((t, { key }) => t + r.smp[key], 0);
      svkPaid        += r.svk;
      additionalPaid += r.additionalPaid.reduce((t, h) => t + h.amount, 0);
    }
    const totalPaid = smpPaid + svkPaid + additionalPaid;

    return {
      smpAllotted, svkBaseAllotted, additionalAllotted, totalAllotted,
      smpPaid, svkPaid, additionalPaid, totalPaid,
      smpBalance:        Math.max(0, smpAllotted - smpPaid),
      svkBalance:        Math.max(0, svkBaseAllotted - svkPaid),
      additionalBalance: Math.max(0, additionalAllotted - additionalPaid),
      totalBalance:      Math.max(0, totalAllotted - totalPaid),
    };
  }, [allStudentRows, feeRecords]);

  // Cash vs UPI, reusing the existing getRecordSplit() helper (already used by
  // Bank Remittance / Fee Reg_1) instead of reimplementing mode detection.
  const cashUpiSplit = useMemo(() => {
    let cash = 0, upi = 0;
    for (const r of feeRecords) {
      const s = getRecordSplit(r);
      cash += s.smpCash + s.svkCash + s.addCash;
      upi  += s.smpUpi  + s.svkUpi  + s.addUpi;
    }
    return { cash, upi };
  }, [feeRecords]);

  // Aided vs Unaided collected, filtering the same allStudentRows other tabs use.
  const aidedUnaidedSplit = useMemo(() => {
    let aided = 0, unaided = 0;
    for (const r of allStudentRows) {
      if ((AIDED_COURSES as Course[]).includes(r.student.course))        aided   += r.paid;
      else if ((UNAIDED_COURSES as Course[]).includes(r.student.course)) unaided += r.paid;
    }
    return { aided, unaided };
  }, [allStudentRows]);

  const feeStructureStats = useMemo(() => ({
    count:   feeStructures.length,
    courses: new Set(feeStructures.map((s) => s.course)).size,
    years:   new Set(feeStructures.map((s) => s.year)).size,
  }), [feeStructures]);

  const hubCardContent = useMemo((): Partial<Record<TabId, HubCardContent>> => {
    const t = dashboardTotals;
    const st = (label: string, value: string): HubStat => ({ label, value });
    // Students, Allotted, Paid, Balance columns x SMP/SVK/Additional rows + Total row —
    // same row-header x column-header + totals-row idiom as Dashboard's Admission
    // Type-wise modal. Student count doesn't decompose by fee type, so it's shown only
    // on the Total row and left blank on the per-type rows.
    const feeMatrix: HubMatrix = {
      columns: ['Students', 'Allotted', 'Paid', 'Balance'],
      rowLabels: ['SMP', 'SVK', 'Additional'],
      data: [
        ['—', fmtCompact(t.smpAllotted),        fmtCompact(t.smpPaid),        fmtCompact(t.smpBalance)],
        ['—', fmtCompact(t.svkBaseAllotted),    fmtCompact(t.svkPaid),        fmtCompact(t.svkBalance)],
        ['—', fmtCompact(t.additionalAllotted), fmtCompact(t.additionalPaid), fmtCompact(t.additionalBalance)],
      ],
      totalRow: [String(stats.total), fmtCompact(t.totalAllotted), fmtCompact(t.totalPaid), fmtCompact(t.totalBalance)],
    };
    return {
      statistics:        { headline: `${fmt(t.totalPaid)} Collected`,     matrix: feeMatrix },
      'fee-list':        { headline: `${stats.total} Students`,           matrix: feeMatrix },
      dues:              { headline: `${stats.duesCount} With Dues`,      matrix: feeMatrix },
      'course-year':     { headline: `${stats.total} Students`,           matrix: feeMatrix },
      consolidated:      { headline: `${feeRecords.length} Records`,      matrix: feeMatrix },
      'daily-collections': {
        headline: `${fmt(t.totalPaid)} Collected`,
        rows: [
          st('Cash', fmt(cashUpiSplit.cash)),
          st('UPI', fmt(cashUpiSplit.upi)),
          st('Days', String(uniqueCollectionDays)),
          st('Students', String(stats.total)),
        ],
      },
      'day-summary': {
        headline: `${uniqueCollectionDays} Collection Days`,
        rows: [
          st('Cash', fmt(cashUpiSplit.cash)),
          st('UPI', fmt(cashUpiSplit.upi)),
          st('Total', fmt(t.totalPaid)),
        ],
      },
      'datewise-headwise': {
        headline: `${fmt(t.smpPaid)} SMP Collected`,
        rows: [
          st('Records', String(feeRecords.length)),
          st('Total', fmt(t.totalPaid)),
        ],
      },
      'bank-remittance': {
        headline: `${fmt(t.totalPaid)} To Remit`,
        rows: [
          st('Cash', fmt(cashUpiSplit.cash)),
          st('UPI', fmt(cashUpiSplit.upi)),
          st('Aided', fmt(aidedUnaidedSplit.aided)),
          st('Unaided', fmt(aidedUnaidedSplit.unaided)),
        ],
      },
      'fee-distribution': {
        headline: `${fmt(t.totalPaid)} Distributed`,
        rows: [
          st('Aided', fmt(aidedUnaidedSplit.aided)),
          st('Unaided', fmt(aidedUnaidedSplit.unaided)),
          st('SMP', fmt(t.smpPaid)),
          st('SVK', fmt(t.svkPaid)),
        ],
      },
      'fee-reg-1': {
        headline: `${feeRecords.length} Records`,
        rows: [
          st('SMP', fmt(t.smpPaid)),
          st('SVK', fmt(t.svkPaid)),
          st('Total', fmt(t.totalPaid)),
        ],
      },
      'fee-structure': {
        headline: `${feeStructureStats.count} Combinations`,
        rows: [
          st('Courses', String(feeStructureStats.courses)),
          st('Years', String(feeStructureStats.years)),
        ],
      },
    };
  }, [dashboardTotals, stats, feeRecords.length, uniqueCollectionDays, cashUpiSplit, aidedUnaidedSplit, feeStructureStats]);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredRows = useMemo((): StudentFeeRow[] => {
    let rows = allStudentRows;
    if (aidedFilter === 'AIDED')   rows = rows.filter((r) => (AIDED_COURSES as Course[]).includes(r.student.course));
    if (aidedFilter === 'UNAIDED') rows = rows.filter((r) => (UNAIDED_COURSES as Course[]).includes(r.student.course));
    if (courseFilter)  rows = rows.filter((r) => r.student.course  === courseFilter);
    if (yearFilter)    rows = rows.filter((r) => r.student.year    === yearFilter);
    if (admTypeFilter) rows = rows.filter((r) => r.student.admType === admTypeFilter);
    if (admCatFilter)  rows = rows.filter((r) => r.student.admCat  === admCatFilter);
    if (feeStatusFilter === 'PAID')        rows = rows.filter((r) => r.paid > 0);
    if (feeStatusFilter === 'NOT_PAID')    rows = rows.filter((r) => r.paid === 0);
    if (feeStatusFilter === 'FEE_DUES')    rows = rows.filter((r) => r.balance !== null && r.balance > 0);
    if (feeStatusFilter === 'NO_FEE_DUES') rows = rows.filter((r) => r.balance !== null && r.balance <= 0);
    return rows.slice().sort((a, b) => {
      const y = (YEAR_ORDER[a.student.year] ?? 9) - (YEAR_ORDER[b.student.year] ?? 9);
      if (y !== 0) return y;
      const c = a.student.course.localeCompare(b.student.course);
      if (c !== 0) return c;
      return a.student.studentNameSSLC.localeCompare(b.student.studentNameSSLC);
    });
  }, [allStudentRows, aidedFilter, courseFilter, yearFilter, admTypeFilter, admCatFilter, feeStatusFilter]);

  // ── Filtered fee records (Consolidated tab) ───────────────────────────────
  const filteredFeeRecords = useMemo(() => {
    if (!aidedFilter && !courseFilter && !yearFilter && !admTypeFilter && !admCatFilter && feeStatusFilter === 'ALL')
      return feeRecords;
    const ids = new Set(filteredRows.map((r) => r.student.id));
    return feeRecords.filter((r) => ids.has(r.studentId));
  }, [feeRecords, filteredRows, aidedFilter, courseFilter, yearFilter, admTypeFilter, admCatFilter, feeStatusFilter]);

  // ── Records for date-based tabs (all-years toggle aware) ──────────────────
  // When showAllYears is on: use allYearsRecords and filter by record's own fields
  // (can't use student IDs since those students may belong to other academic years).
  // When off: use current-year records via the existing paths.
  const dateTabRecords = showAllYears ? allYearsRecords : feeRecords;

  const dateTabFilteredRecords = useMemo(() => {
    if (!showAllYears) return filteredFeeRecords;
    let records = allYearsRecords;
    if (aidedFilter === 'AIDED')   records = records.filter((r) => (AIDED_COURSES as Course[]).includes(r.course));
    if (aidedFilter === 'UNAIDED') records = records.filter((r) => (UNAIDED_COURSES as Course[]).includes(r.course));
    if (courseFilter)  records = records.filter((r) => r.course  === courseFilter);
    if (yearFilter)    records = records.filter((r) => r.year    === yearFilter);
    if (admTypeFilter) records = records.filter((r) => r.admType === admTypeFilter);
    if (admCatFilter)  records = records.filter((r) => r.admCat  === admCatFilter);
    return records;
  }, [showAllYears, allYearsRecords, filteredFeeRecords, aidedFilter, courseFilter, yearFilter, admTypeFilter, admCatFilter]);

  const hasActiveFilters =
    !!aidedFilter || !!courseFilter || !!yearFilter || !!admTypeFilter || !!admCatFilter || feeStatusFilter !== 'ALL';

  function clearFilters() {
    setAidedFilter(''); setCourseFilter(''); setYearFilter(''); setAdmTypeFilter(''); setAdmCatFilter('');
    setFeeStatusFilter('ALL');
  }

  const loading = settingsLoading || studentsLoading || feeLoading || overridesLoading || (showAllYears && allYearsLoading);

  const activeMeta = activeTab ? TAB_META.find((t) => t.id === activeTab) : undefined;

  const fp: CommonFilterProps = {
    aidedFilter, setAidedFilter,
    courseFilter, setCourseFilter,
    yearFilter, setYearFilter,
    admTypeFilter, setAdmTypeFilter,
    admCatFilter, setAdmCatFilter,
    feeStatusFilter, setFeeStatusFilter,
    stats,
    hasActiveFilters,
    clearFilters,
  };

  return (
    <div className={activeTab === null ? 'flex flex-col' : 'h-full flex flex-col'} style={{ animation: 'page-enter 0.22s ease-out' }}>
      {activeTab === null ? (
        /* Header — hub only, stays at top, not sticky */
        <div className="shrink-0 pt-4 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-[3px] h-7 rounded-full bg-[#3B5B8A] shrink-0" />
            <div>
              {academicYear && <p className="text-[11px] font-semibold uppercase tracking-widest text-[#3B5B8A]/70 leading-none">{academicYear}</p>}
              <h2 className="text-xl font-black text-gray-800 leading-none tracking-tight mt-px">Fee Reports</h2>
            </div>
          </div>
        </div>
      ) : (
        /* Back-to-hub bar — replaces the header entirely inside a report. Same technique as
           Dashboard's own sticky toolbar (Dashboard.tsx): negative margin + sticky top offset
           on the SAME element, with a tall flex-column parent (this whole page) so the sticky
           range has room to work. -mt-4/-mx-4 cancel the page's p-4 padding unconditionally
           (flush with the app header at rest); -top-4 matches that offset so it locks in the
           exact same flush position once scrolled — no gap at rest or while scrolling. */
        <div className="sticky -top-4 z-20 -mx-4 -mt-4 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <button
            onClick={() => setActiveTab(null)}
            className="flex items-center gap-1.5 rounded-full border border-[#3B5B8A]/25 bg-white px-3 py-1.5 text-xs font-semibold text-[#3B5B8A] hover:bg-[#D0E2F2]/40 hover:border-[#3B5B8A]/50 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Back to Reports
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">{activeMeta?.label}</span>
          <div className="flex-1" />
          {DATE_TAB_IDS.has(activeTab) && (
            <button
              onClick={() => setShowAllYears((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                showAllYears
                  ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
              }`}
              title={showAllYears ? 'Showing all payments collected in this financial year (incl. prior-year dues) — click to show current year only' : 'Click to also show prior-year dues collected in this financial year'}
            >
              {showAllYears ? 'Incl. Prior Dues' : 'Current Year Only'}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className={activeTab === null ? 'flex flex-col pt-3' : 'flex-1 min-h-0 flex flex-col pt-3'}>
        {loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
        ) : !academicYear ? (
          <p className="text-sm text-gray-400 py-8 text-center">No academic year configured.</p>
        ) : activeTab === null ? (
          <ReportHub onSelect={setActiveTab} content={hubCardContent} />
        ) : (
          <div key={activeTab} className="flex-1 min-h-0 flex flex-col" style={{ animation: 'content-enter 0.22s ease-out' }}>
            {activeTab === 'statistics'        && <StatisticsTab       rows={filteredRows}             academicYear={academicYear} fp={fp} />}
            {activeTab === 'fee-list'          && <FeeListTab          rows={filteredRows}             academicYear={academicYear} fp={fp} />}
            {activeTab === 'dues'              && <DuesTab             rows={filteredRows}             academicYear={academicYear} fp={fp} />}
            {activeTab === 'course-year'       && <CourseYearTab       rows={filteredRows}             academicYear={academicYear} fp={fp} />}
            {activeTab === 'consolidated'      && <ConsolidatedTab     feeRecords={filteredFeeRecords}  academicYear={academicYear} fp={fp} />}
            {activeTab === 'daily-collections' && <DailyCollectionsTab feeRecords={dateTabRecords}          academicYear={academicYear} showAllYears={showAllYears} />}
            {activeTab === 'day-summary'       && <DaySummaryTab       feeRecords={dateTabRecords}          academicYear={academicYear} showAllYears={showAllYears} />}
            {activeTab === 'datewise-headwise' && <DatewiseHeadwiseTab feeRecords={dateTabFilteredRecords}  academicYear={academicYear} fp={fp} showAllYears={showAllYears} />}
            {activeTab === 'bank-remittance'   && <BankRemittanceTab   feeRecords={dateTabRecords}          academicYear={academicYear} showAllYears={showAllYears} />}
            {activeTab === 'fee-distribution'  && <FeeDistributionTab  students={allStudents} feeStructures={feeStructures} feeRecords={feeRecords} academicYear={academicYear} />}
            {activeTab === 'fee-reg-1'         && <FeeReg1Tab          feeRecords={dateTabRecords} allStudents={allStudents} showAllYears={showAllYears} academicYear={academicYear} />}
            {activeTab === 'fee-structure'     && <FeeStructureView />}
          </div>
        )}
      </div>
    </div>
  );
}
