import { useState, useEffect } from 'react';
import { getAllFeeRecordsByStudent, getAllFeeRecordsByRegNumber, removeFeeRecordRemark } from '../../services/feeRecordService';
import { getFeeStructure } from '../../services/feeStructureService';
import { getFeeOverride } from '../../services/feeOverrideService';
import { getTcRecordsByStudent, getTcRecordsByRegNumber, getTcEditRecordsByStudent, type TCRecord, type TCEditRecord } from '../../services/tcService';
import { getPcRecordsByStudent, getPcRecordsByRegNumber, type PCRecord } from '../../services/pcService';
import { getAnsRecordsByStudent } from '../../services/ansLetterService';
import { AnsLetterPreviewModal } from './AnsLetterPreviewModal';
import { SeatCancellationLetterModal } from './SeatCancellationLetterModal';
import { getSeatCancelLetterRecords, deleteSeatCancelLetterRecord } from '../../services/seatCancelLetterService';
import {
  getRefundRecordsByStudent,
  deleteRefundRecord,
  isFeeNettingRefund,
  type RefundRecord,
} from '../../services/refundService';
import { GeneralFeeRefundModal } from '../common/GeneralFeeRefundModal';
import { generateGeneralFeeRefundVoucher } from '../../utils/generalFeeRefundVoucher';
import { generateSnqRefundVoucher } from '../../utils/snqRefundVoucher';
import { generateSeatCancellationRefundVoucher } from '../../utils/seatCancellationRefundVoucher';
import { useAuth } from '../../contexts/AuthContext';
import { getExamResultsByRegNumber, deleteExamResult } from '../../services/resultService';
import { invalidateResultsCache } from '../../hooks/useResults';
import { mergeResultsBySession } from '../../utils/resultMerge';
import { useStudentDocuments } from '../../hooks/useStudentDocuments';
import { ResultDetailModal } from '../results/ResultDetailModal';
import { FeeReceiptDetailModal } from '../fee/FeeReceiptDetailModal';
import {
  ModalThemeContext, useModalTheme, STUDENT_DEFAULT_THEME, PERIWINKLE_THEME,
  type ModalThemeName,
} from '../common/modalTheme';
import type {
  Student, FeeRecord, AcademicYear,
  AdmType, AdmCat, DocRecord, ExamResult, AnsLetterRecord, AnsLetterStatus,
  SeatCancelLetterRecord,
} from '../../types';
import { REQUIRED_DOCS, SMP_FEE_HEADS } from '../../types';
import {
  sumSMPRecord, calcRecordTotal, calcEffectiveFine, calcAllotted, effectiveValues,
  type YearData,
} from '../../utils/feeCalc';

// ─── Design tokens — student-portal look, ocean blue ─────────────────────────

const OCEAN = '#0B7BC0';
const MINT = '#0FA968';
const CORAL = '#E11D48';
const AMBER = '#D97706';
const SKY = '#0284C7';
const VIOLET = '#7C3AED';
const ROSE = '#DB2777';
const FALLBACK_COLOR = '#8A93A3';

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
const MODE_COLOR: Record<string, string> = { CASH: AMBER, UPI: VIOLET, SPLIT: SKY };

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// ─── Shared presentational pieces ─────────────────────────────────────────────

/** Department ring monogram — pastel gradient in the department's hue with a thin ring. */
function RingAvatar({ name, course, size = 22 }: { name: string; course: string; size?: number }) {
  const h = DEPT_HUE[course] ?? 205;
  const ring = DEPT_DOT[course] ?? FALLBACK_COLOR;
  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0 font-semibold tracking-[0.3px]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `linear-gradient(135deg, hsl(${h - 6} 85% 88%), hsl(${h + 8} 85% 74%))`,
        color: `hsl(${h} 70% 22%)`,
        boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${ring}80`,
      }}
      title={course}
    >
      {name.charAt(0)}
    </span>
  );
}

/** Compact thin-line pill: accent-tinted fill, border and ink text. */
function LinePill({ value, color, title, dot, tall }: { value?: React.ReactNode; color?: string; title?: string; dot?: boolean; tall?: boolean }) {
  if (value === undefined || value === null || value === '') return <span className="text-[#C4C8D0] text-[11px]">—</span>;
  const c = color ?? FALLBACK_COLOR;
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 rounded-full border leading-none whitespace-nowrap font-medium ${tall ? 'px-2.5 py-[6px] text-[11px]' : 'px-[7px] py-[4px] text-[10.5px]'}`}
      style={{ background: `${c}14`, borderColor: `${c}66`, color: inkOf(c) }}
      title={title}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />}
      {value}
    </span>
  );
}

/** Tiny uppercase label over a value; empty values show a muted dash. */
function Field({ label, value, wide, children }: {
  label: string;
  value?: string | number | null;
  wide?: boolean;
  children?: React.ReactNode;
}) {
  const display = (value === null || value === undefined || value === '') ? null : String(value);
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-[8.5px] font-medium uppercase tracking-[0.8px] text-[#8A93A3] leading-none">{label}</dt>
      <dd className="mt-1 text-[12px] leading-snug min-w-0">
        {children ?? (display === null
          ? <span className="text-[#C4C8D0]">—</span>
          : <span className="font-medium text-[#262B35] break-words">{display}</span>)}
      </dd>
    </div>
  );
}

/** Card with a tinted icon header — used by the Profile / Docs / TC edit-history sections. */
function IconCard({ title, color, icon, right, children, className = '' }: {
  title: string;
  color: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border bg-white overflow-hidden ${className}`}
      style={{ borderColor: `${color}33`, boxShadow: `0 4px 14px ${color}0D` }}
    >
      <div
        className="px-3.5 py-2 flex items-center gap-2 border-b"
        style={{ background: `linear-gradient(90deg, ${color}14, ${color}05)`, borderColor: `${color}26` }}
      >
        <span
          className="w-6 h-6 rounded-[8px] flex items-center justify-center shrink-0 text-white"
          style={{ background: `linear-gradient(135deg, ${color}, ${inkOf(color)})`, boxShadow: `0 2px 6px ${color}40` }}
        >
          {icon}
        </span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.8px]" style={{ color: inkOf(color) }}>{title}</span>
        {right && <div className="ml-auto flex items-center gap-1.5">{right}</div>}
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </section>
  );
}

/** Record card shared by the TC / PC / ANS / Results / Refund tabs. */
function RecordCard({ color, icon, title, pills, meta, actions, children, style }: {
  color: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  pills?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="rounded-2xl border bg-white overflow-hidden transition-shadow duration-200 hover:shadow-[0_6px_18px_rgba(11,60,94,0.08)]"
      style={{ borderColor: `${color}33`, ...style }}
    >
      <div
        className="px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5"
        style={{ background: `linear-gradient(90deg, ${color}12, ${color}03 70%)` }}
      >
        <span
          className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 text-white"
          style={{ background: `linear-gradient(135deg, ${color}, ${inkOf(color)})`, boxShadow: `0 3px 8px ${color}40` }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex flex-wrap items-center gap-1.5">
          <span className="text-[13.5px] font-semibold leading-none" style={{ color: inkOf(color) }}>{title}</span>
          {pills}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {meta && <span className="text-[10.5px] font-medium text-[#8A93A3] whitespace-nowrap">{meta}</span>}
          {actions}
        </div>
      </div>
      {children && <div className="px-3.5 py-3 border-t" style={{ borderColor: `${color}1A` }}>{children}</div>}
    </div>
  );
}

/** Pill-shaped button: outline (tinted), solid (tinted) or neutral. */
function PillBtn({ color: colorProp, variant = 'outline', onClick, disabled, title, children }: {
  color?: string;
  variant?: 'outline' | 'solid' | 'neutral';
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const theme = useModalTheme(STUDENT_DEFAULT_THEME);
  const color = colorProp ?? theme.accent;
  const style: React.CSSProperties =
    variant === 'solid'
      ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 2px 8px ${color}40` }
      : variant === 'neutral'
      ? { background: '#fff', borderColor: '#D5DEE8', color: '#5B6371' }
      : { background: '#fff', borderColor: `${color}66`, color: inkOf(color), '--tint': `${color}12` } as React.CSSProperties;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-[11px] font-medium leading-none whitespace-nowrap transition-[filter,background-color] duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        variant === 'outline' ? 'enabled:hover:bg-[var(--tint)]' : 'enabled:hover:brightness-95'
      }`}
      style={style}
    >
      {children}
    </button>
  );
}

/** Tinted summary pill used at the top of each list tab. */
function SummaryPill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-[11.5px] font-medium"
      style={{ background: `${color}10`, borderColor: `${color}4D`, color: inkOf(color) }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

/** Soft warning / info banner. */
function Banner({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-medium leading-relaxed"
      style={{ background: `${color}0D`, borderColor: `${color}40`, color: inkOf(color) }}
    >
      <svg className="shrink-0 mt-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span>{children}</span>
    </div>
  );
}

function EmptyState({ color, icon, title, subtitle, children }: {
  color: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center" style={{ animation: 'content-enter 0.26s ease-out' }}>
      <div
        className="w-14 h-14 rounded-2xl border flex items-center justify-center"
        style={{ background: `${color}0F`, borderColor: `${color}33`, color }}
      >
        {icon}
      </div>
      <div>
        <p className="text-[13.5px] font-semibold" style={{ color: inkOf(color) }}>{title}</p>
        {subtitle && <p className="text-[11.5px] font-medium text-[#8A93A3] mt-1 max-w-sm">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function CardSkeleton({ count = 2, cells = 6 }: { count?: number; cells?: number }) {
  return (
    <div className="px-5 py-4 space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-[#E3EDF5] bg-white overflow-hidden">
          <div className="px-3.5 py-2.5 flex items-center gap-3 bg-[#F5F9FC]">
            <div className="skeleton w-8 h-8 !rounded-[10px]" />
            <div className="skeleton h-3 w-32 rounded" />
            <div className="skeleton h-3 w-16 rounded ml-auto" />
          </div>
          <div className="px-3.5 py-3 grid grid-cols-3 gap-3">
            {Array.from({ length: cells }).map((_, j) => <div key={j} className="skeleton h-6 rounded" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// Icons (stroke, currentColor)
const Ico = {
  user: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>,
  home: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>,
  cap: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>,
  chart: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  folder: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  rupee: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 000-10"/></svg>,
  arrow: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  award: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13.5L17 22l-5-3-5 3 1.5-8.5"/></svg>,
  doc: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>,
  mail: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>,
  undo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>,
  edit: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  print: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  eye: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  trash: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>,
  plus: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  check: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  big: (d: React.ReactNode) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>,
};

// ─── Profile tab ─────────────────────────────────────────────────────────────

function ProfileTab({ student: s }: { student: Student }) {
  const theme = useModalTheme(STUDENT_DEFAULT_THEME);
  const sslcPct = s.sslcMaxTotal > 0
    ? ((s.sslcObtainedTotal / s.sslcMaxTotal) * 100)
    : null;
  const msPct = s.mathsScienceMaxTotal > 0
    ? ((s.mathsScienceObtainedTotal / s.mathsScienceMaxTotal) * 100)
    : null;
  const sciPct  = s.scienceMax > 0 ? (s.scienceObtained / s.scienceMax) * 100 : null;
  const mathPct = s.mathsMax > 0   ? (s.mathsObtained   / s.mathsMax)   * 100 : null;
  const bars = [
    { label: 'SSLC',            obtained: s.sslcObtainedTotal,         max: s.sslcMaxTotal,         pct: sslcPct, color: '#3B82F6' },
    { label: 'Science',         obtained: s.scienceObtained,           max: s.scienceMax,           pct: sciPct,  color: '#10B981' },
    { label: 'Maths',           obtained: s.mathsObtained,             max: s.mathsMax,             pct: mathPct, color: '#8B5CF6' },
    { label: 'Maths + Science', obtained: s.mathsScienceObtainedTotal, max: s.mathsScienceMaxTotal, pct: msPct,   color: '#F59E0B' },
  ];
  const priorPct = s.priorQualification === 'ITI' ? s.itiPercentage
                 : s.priorQualification === 'PUC' ? s.pucPercentage
                 : null;

  return (
    <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ animation: 'content-enter 0.26s ease-out' }}>

      {/* Personal */}
      <IconCard title="Personal" color={SKY} icon={Ico.user}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Name (SSLC)" value={s.studentNameSSLC} />
          <Field label="Name (Aadhaar)" value={s.studentNameAadhar} />
          <Field label="Date of Birth" value={s.dateOfBirth ? s.dateOfBirth.split('-').reverse().join('-') : ''} />
          <Field label="Gender">
            <LinePill value={s.gender} color={GENDER_COLOR[s.gender]} />
          </Field>
          <Field label="Religion" value={s.religion} />
          <Field label="Caste" value={s.caste} />
          <Field label="Category">
            <LinePill value={s.category} color={CATEGORY_COLOR[s.category]} />
          </Field>
          <Field label="Annual Income" value={s.annualIncome ? `₹${Number(s.annualIncome).toLocaleString()}` : ''} />
        </dl>
      </IconCard>

      {/* Family & contact */}
      <IconCard title="Family & Contact" color={VIOLET} icon={Ico.home}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Father's Name" value={s.fatherName} />
          <Field label="Mother's Name" value={s.motherName} />
          <Field label="Father Mobile">
            {s.fatherMobile
              ? <span className="font-medium text-black tabular-nums">{s.fatherMobile}</span>
              : <span className="text-[#C4C8D0]">—</span>}
          </Field>
          <Field label="Student Mobile">
            {s.studentMobile
              ? <span className="font-medium text-black tabular-nums">{s.studentMobile}</span>
              : <span className="text-[#C4C8D0]">—</span>}
          </Field>
          <Field label="Address" value={s.address} wide />
          <Field label="Town / City" value={s.town} />
          <Field label="Taluk" value={s.taluk} />
          <Field label="District" value={s.district} />
        </dl>
      </IconCard>

      {/* Academic */}
      <IconCard title="Academic" color={theme.accent} icon={Ico.cap}>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          <Field label="Course">
            <LinePill value={s.course} color={DEPT_DOT[s.course]} />
          </Field>
          <Field label="Study Year">
            <LinePill value={s.year} color={YEAR_COLOR[s.year]} />
          </Field>
          <Field label="Academic Year" value={s.academicYear} />
          <Field label="Admission Status">
            <LinePill value={s.admissionStatus} color={STATUS_COLOR[s.admissionStatus] ?? AMBER} dot />
          </Field>
          <Field label="Admission Type">
            <LinePill value={s.admType} color={ADM_TYPE_COLOR[s.admType]} />
          </Field>
          <Field label="Admission Category">
            <LinePill value={s.admCat} color={ADM_CAT_COLOR[s.admCat]} />
          </Field>
          <Field label="Merit Number" value={s.meritNumber} />
          <Field label="Register Number">
            {s.regNumber
              ? <span className="font-semibold text-black tabular-nums">{s.regNumber}</span>
              : <span className="text-[#C4C8D0]">—</span>}
          </Field>
          <Field label="10th Board" value={s.tenthBoard} />
          <Field label="Prior Qualification" value={s.priorQualification} />
        </dl>
      </IconCard>

      {/* Marks */}
      <IconCard
        title="Marks"
        color={AMBER}
        icon={Ico.chart}
        right={s.tenthBoard ? <LinePill value={s.tenthBoard} color={AMBER} /> : undefined}
      >
        <div className="space-y-2.5">
          {bars.map(({ label, obtained, max, pct, color }, idx) => (
            <div key={label}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#5B6371]">{label}</span>
                <span className="text-[11px] font-medium text-[#5B6371] tabular-nums">
                  {obtained || '—'} / {max || '—'}
                  <span className="ml-2 font-semibold" style={{ color: pct !== null ? inkOf(color) : '#C4C8D0' }}>
                    {pct !== null ? `${pct.toFixed(1)}%` : '—'}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: `${color}1A` }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: pct !== null ? `${Math.min(pct, 100)}%` : '0%',
                    background: `linear-gradient(90deg, ${color}B3, ${color})`,
                    transformOrigin: 'left',
                    animation: `fee-bar-fill 0.5s ease-out ${idx * 60}ms both`,
                  }}
                />
              </div>
            </div>
          ))}

          {s.priorQualification !== 'NONE' && (
            <div className="pt-2 mt-1 border-t border-[#F1E6D4] flex items-center gap-4">
              <Field label="Prior Qualification" value={s.priorQualification} />
              {priorPct !== null && priorPct > 0 && (
                <Field label={`${s.priorQualification} %`}>
                  <span className="text-[14px] font-semibold text-[#4F46E5]">{priorPct.toFixed(1)}%</span>
                </Field>
              )}
            </div>
          )}
        </div>
      </IconCard>

    </div>
  );
}

// ─── Documents tab ────────────────────────────────────────────────────────────

function DocumentsTab({
  docs,
  loading,
  error,
}: {
  docs: DocRecord | null;
  loading: boolean;
  error: string;
}) {
  if (loading) {
    return (
      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-2">
        {REQUIRED_DOCS.map((d) => (
          <div key={d.key} className="skeleton h-11 !rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState color={CORAL} icon={Ico.big(<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>)} title={error} />
    );
  }

  const submittedCount = docs
    ? REQUIRED_DOCS.filter((d) => docs[d.key]?.submitted).length
    : 0;
  const allIn = submittedCount === REQUIRED_DOCS.length;
  const pct = (submittedCount / REQUIRED_DOCS.length) * 100;
  const stateColor = allIn ? MINT : AMBER;

  return (
    <div className="px-5 py-4 space-y-3" style={{ animation: 'content-enter 0.26s ease-out' }}>
      {/* Summary */}
      <div className="rounded-2xl border bg-white px-4 py-3 flex items-center gap-4" style={{ borderColor: `${stateColor}40` }}>
        <span
          className="w-9 h-9 rounded-[11px] flex items-center justify-center text-white shrink-0"
          style={{ background: `linear-gradient(135deg, ${AMBER}, ${inkOf(AMBER)})`, boxShadow: `0 3px 8px ${AMBER}40` }}
        >
          {Ico.folder}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-[#262B35]">Document Checklist</span>
            <LinePill value={allIn ? 'All submitted' : 'Pending'} color={stateColor} dot />
          </div>
          <div className="mt-1.5 h-2 rounded-full overflow-hidden" style={{ background: `${stateColor}1A` }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: stateColor, transformOrigin: 'left', animation: 'fee-bar-fill 0.5s ease-out both' }}
            />
          </div>
        </div>
        <span className="text-[20px] font-semibold tabular-nums shrink-0" style={{ color: inkOf(stateColor) }}>
          {submittedCount}<span className="text-[13px] text-[#8A93A3] font-medium"> / {REQUIRED_DOCS.length}</span>
        </span>
      </div>

      {/* Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {REQUIRED_DOCS.map((d) => {
          const entry = docs?.[d.key];
          const submitted = entry?.submitted ?? false;
          const returned = entry?.returned ?? false;
          return (
            <div
              key={d.key}
              className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5"
              style={{ borderColor: submitted ? `${MINT}40` : '#E3EAF1' }}
            >
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                style={submitted
                  ? { background: MINT, color: '#fff', boxShadow: `0 2px 6px ${MINT}40` }
                  : { border: '1.5px dashed #C4CCD6', color: '#C4CCD6' }}
              >
                {submitted && Ico.check}
              </span>
              <span className={`flex-1 min-w-0 text-[12px] font-medium ${submitted ? 'text-[#262B35]' : 'text-[#8A93A3]'}`}>
                {d.label}
              </span>
              <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                {submitted && entry?.submittedOn && (
                  <LinePill value={entry.submittedOn.split('-').reverse().join('-')} color={MINT} title="Submitted on" />
                )}
                {returned && (
                  <LinePill
                    value={<>Returned{entry?.returnedOn ? ` · ${entry.returnedOn.split('-').reverse().join('-')}` : ''}</>}
                    color={AMBER}
                  />
                )}
                {!submitted && (
                  <span className="text-[9.5px] font-medium uppercase tracking-[0.6px] text-[#A9B0BB]">Pending</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fee history tab ──────────────────────────────────────────────────────────
// Minimal ledger: an identity strip (name + reg no + overall figures) on top, then
// one quiet section per academic year — a single header line, a slim receipt list,
// and the per-head split folded behind a "Fee heads" toggle.

const LEDGER_LINE = '#E6EAF0';
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** Inline "Label ₹value" figure used in the identity strip and year headers. */
function Figure({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[10.5px] font-medium text-[#8A93A3]">{label}</span>
      <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: color ?? '#262B35' }}>{value}</span>
    </span>
  );
}

/** Due / No-dues status pill: solid when due (themed), soft outline when cleared. */
function DueStatusPill({ due, size = 'md' }: { due: number | null; size?: 'md' | 'lg' }) {
  const theme = useModalTheme(STUDENT_DEFAULT_THEME);
  const h = size === 'lg' ? 'h-8 px-3.5 text-[12.5px]' : 'h-7 px-3 text-[11.5px]';
  if (due === null) {
    return (
      <span className={`inline-flex items-center rounded-full border bg-white font-medium whitespace-nowrap ${h}`} style={{ borderColor: `${AMBER}66`, color: inkOf(AMBER) }}>
        No structure set
      </span>
    );
  }
  if (due > 0) {
    return (
      <span
        className={`inline-flex items-center rounded-full font-semibold tabular-nums text-white whitespace-nowrap ${h}`}
        style={{ background: theme.due, boxShadow: `0 2px 8px ${theme.due}40`, animation: 'stat-pop 0.3s ease-out' }}
      >
        Due {rupees(due)}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap ${h}`}
      style={{ background: `${theme.paid}12`, borderColor: `${theme.paid}66`, color: inkOf(theme.paid), animation: 'stat-pop 0.3s ease-out' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      No dues
    </span>
  );
}

function FeeTab({
  student,
  yearData,
  loading,
  error,
  overallAllotted,
  overallFine,
  overallPaid,
  overallDue,
  refundedByYear,
}: {
  student: Student;
  yearData: YearData[];
  loading: boolean;
  error: string | null;
  overallAllotted: number;
  overallFine: number;
  overallPaid: number;
  overallDue: number;
  refundedByYear: Map<string, number>;
}) {
  const [expandedHeads, setExpandedHeads] = useState<Set<string>>(new Set());
  const [receiptDetailRecord, setReceiptDetailRecord] = useState<FeeRecord | null>(null);
  const theme = useModalTheme(STUDENT_DEFAULT_THEME);

  function toggleHeads(ay: string) {
    setExpandedHeads((prev) => {
      const next = new Set(prev);
      if (next.has(ay)) next.delete(ay); else next.add(ay);
      return next;
    });
  }

  // ── Identity strip: always shown (even while loading) so the tab opens on who it is.
  const identity = (
    <div
      className="rounded-2xl border bg-white px-4 py-3"
      style={{ borderColor: `${theme.accent}40`, animation: 'content-enter 0.25s ease-out' }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <h4 className="text-[17px] font-semibold leading-tight tracking-[-0.2px] truncate max-w-[420px]" style={{ color: theme.accentInk }} title={student.studentNameSSLC}>
          {student.studentNameSSLC}
        </h4>
        {student.regNumber ? (
          <span
            className="inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-[15px] font-semibold leading-none tabular-nums"
            style={{ background: `${theme.accent}12`, borderColor: `${theme.accent}66`, color: theme.accentInk }}
            title="Register No"
          >
            <span className="text-[9px] font-medium uppercase tracking-[0.8px] text-[#8A93A3]">Reg</span>
            {student.regNumber}
          </span>
        ) : (
          <span className="inline-flex items-center h-8 rounded-full border border-dashed bg-white px-3 text-[11.5px] font-medium text-[#8A93A3]" style={{ borderColor: `${theme.accent}59` }}>
            No Reg No
          </span>
        )}
        <div className="ml-auto">
          {loading ? <div className="skeleton h-8 w-28 !rounded-full" /> : !error && yearData.length > 0 && <DueStatusPill due={overallDue} size="lg" />}
        </div>
      </div>
      {!loading && !error && yearData.length > 0 && (
        <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap">
          <Figure label="Allotted" value={rupees(overallAllotted)} />
          {overallFine > 0 && <span className="text-[10.5px] font-medium" style={{ color: inkOf(AMBER) }}>incl. fine {rupees(overallFine)}</span>}
          <span className="text-[#D5DAE2]">·</span>
          <Figure label="Paid" value={rupees(overallPaid)} color={inkOf(theme.paid)} />
          <span className="text-[#D5DAE2]">·</span>
          <Figure label="Due" value={rupees(Math.max(0, overallDue))} color={overallDue > 0 ? inkOf(theme.due) : inkOf(theme.paid)} />
          <span className="ml-auto text-[10.5px] font-medium text-[#8A93A3]">
            {yearData.length} academic year{yearData.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="px-5 py-4 space-y-3">
        {identity}
        {Array.from({ length: 2 }).map((_, yi) => (
          <div key={yi} className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: LEDGER_LINE }}>
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="skeleton h-4 w-16 rounded" />
              <div className="skeleton h-3 w-44 rounded" />
              <div className="ml-auto skeleton h-7 w-24 !rounded-full" />
            </div>
            <div className="px-4 pb-3 space-y-2.5">
              {Array.from({ length: 2 + yi }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  {['w-20', 'w-32', 'w-12', 'flex-1', 'w-16'].map((w, j) => (
                    <div key={j} className={`skeleton h-3 ${w} rounded`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 py-4 space-y-3">
        {identity}
        <EmptyState color={CORAL} icon={Ico.big(<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>)} title={error} />
      </div>
    );
  }

  if (yearData.length === 0) {
    return (
      <div className="px-5 py-4 space-y-3">
        {identity}
        <EmptyState
          color={theme.paid}
          icon={Ico.big(<><rect x="1" y="5" width="22" height="14" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>)}
          title="No fee records found for this student."
        />
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-3">
      {identity}

      {/* One section per academic year */}
      {yearData.map((yd, ydIdx) => {
        const { academicYear, records, structure, override } = yd;
        const ev = effectiveValues(yd);
        // SNQ refunds apply to the SMP component: net them out so due is 0 after refund, not negative
        const refunded = refundedByYear.get(academicYear) ?? 0;
        const totalPaid = records.reduce((s, r) => s + calcRecordTotal(r), 0) - refunded;
        const allotted = ev ? calcAllotted(ev.smp, ev.svk, ev.additional, records) : null;
        const fine = ev ? calcEffectiveFine(ev.smp.fine, records) : 0;
        const due = allotted !== null ? allotted - totalPaid : null;
        const svkBaseAllotted = ev?.svk ?? 0;
        const additionalAllotted = ev ? ev.additional.reduce((t, h) => t + h.amount, 0) : 0;
        const smpAllotted = allotted !== null ? allotted - svkBaseAllotted - additionalAllotted : 0;
        const smpPaidRaw = records.reduce((s, r) => s + sumSMPRecord(r.smp), 0);
        const smpPaid = smpPaidRaw - refunded;
        const svkBasePaid = records.reduce((s, r) => s + r.svk, 0);
        const additionalPaidTotal = records.reduce(
          (s, r) => s + r.additionalPaid.reduce((a, h) => a + h.amount, 0),
          0,
        );
        // SNQ students get a tuition concession (lower allotted SMP) that must be refunded.
        // If they've paid more than the SNQ allotted SMP and no (or only a partial) refund
        // has been issued yet, flag the outstanding refund so it isn't missed.
        const pendingRefund = records[0].admCat === 'SNQ' && allotted !== null
          ? Math.max(0, smpPaidRaw - smpAllotted - refunded)
          : 0;
        const r0 = records[0];
        const headsOpen = expandedHeads.has(academicYear);

        // Allotted / paid / due per bucket, shown inside the "Fee heads" fold-out.
        const buckets = [
          { key: 'SMP', allotted: smpAllotted, paid: smpPaid, color: SKY },
          { key: 'SVK', allotted: svkBaseAllotted, paid: svkBasePaid, color: VIOLET },
          { key: 'Addl', allotted: additionalAllotted, paid: additionalPaidTotal, color: MINT },
        ].filter((b) => b.allotted > 0 || b.paid > 0);

        return (
          <section
            key={academicYear}
            className="rounded-2xl border bg-white overflow-hidden"
            style={{ borderColor: LEDGER_LINE, animation: `content-enter 0.28s ease-out ${(ydIdx + 1) * 55}ms both` }}
          >
            {/* Year header — one line */}
            <div className="px-4 py-2.5 flex items-center gap-x-3 gap-y-1.5 flex-wrap">
              <span className="text-[14px] font-semibold tabular-nums text-[#262B35]">{academicYear}</span>
              <span className="text-[11.5px] font-medium text-[#5B6371] whitespace-nowrap">
                {[r0.course, r0.year, r0.admType, r0.admCat].filter(Boolean).join(' · ')}
              </span>
              {override && <LinePill value="Custom allotted" color={AMBER} />}
              {refunded > 0 && <LinePill value={`Refunded ${rupees(refunded)}`} color={VIOLET} />}
              <div className="ml-auto flex items-center gap-3">
                {allotted !== null && <Figure label="Allotted" value={rupees(allotted)} />}
                <Figure label="Paid" value={rupees(totalPaid)} color={inkOf(theme.paid)} />
                <DueStatusPill due={due === null ? null : Math.max(0, due)} />
              </div>
            </div>

            {pendingRefund > 0 && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium" style={{ background: `${theme.refund}0D`, borderColor: `${theme.refund}40`, color: inkOf(theme.refund) }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                SNQ refund pending — {rupees(pendingRefund)} to be refunded (voucher not yet generated)
              </div>
            )}

            {/* Receipt list */}
            <div className="border-t" style={{ borderColor: LEDGER_LINE }}>
              {records.map((r) => {
                const rowSmp = sumSMPRecord(r.smp);
                const rowSvk = r.svk;
                const rowAddl = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
                const rowTotal = rowSmp + rowSvk + rowAddl;
                const smpMode = r.smpPaymentMode ?? r.paymentMode;
                const svkMode = r.svkPaymentMode ?? r.paymentMode;
                const addlMode = r.additionalPaymentMode ?? r.paymentMode;
                const modes = [...new Set([
                  ...(rowSmp > 0 ? [smpMode] : []),
                  ...(rowSvk > 0 ? [svkMode] : []),
                  ...(rowAddl > 0 ? [addlMode] : []),
                ])];
                const receiptNos = [
                  r.receiptNumber && `SMP ${r.receiptNumber}`,
                  // SVK receipt numbers already carry their prefix ("SVK DVP 12")
                  r.svkReceiptNumber && (/^SVK/i.test(r.svkReceiptNumber) ? r.svkReceiptNumber : `SVK ${r.svkReceiptNumber}`),
                  r.additionalReceiptNumber && `Addl ${r.additionalReceiptNumber}`,
                ].filter(Boolean).join(' · ');
                const split = [
                  rowSmp > 0 && `SMP ${rupees(rowSmp)}`,
                  rowSvk > 0 && `SVK ${rupees(rowSvk)}`,
                  rowAddl > 0 && `Addl ${rupees(rowAddl)}`,
                ].filter(Boolean).join(' · ');
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReceiptDetailRecord(r)}
                    className="group w-full grid items-center gap-3 px-4 py-2 text-left border-b last:border-b-0 hover:bg-[#F7F9FC] transition-colors cursor-pointer"
                    style={{ gridTemplateColumns: '84px minmax(0,1.4fr) auto minmax(0,1fr) 210px', borderColor: '#F0F2F6' }}
                    title="View receipt details"
                  >
                    <span className="text-[12px] font-medium tabular-nums text-[#262B35]">{r.date.split('-').reverse().join('-')}</span>
                    <span className="text-[11.5px] tabular-nums text-[#5B6371] truncate">{receiptNos || '—'}</span>
                    <span className="flex items-center gap-1">
                      {(modes.length ? modes : [r.paymentMode]).map((m) => (
                        <LinePill key={m} value={m} color={MODE_COLOR[m] ?? FALLBACK_COLOR} />
                      ))}
                    </span>
                    <span className="text-[11px] text-[#8A93A3] truncate" title={r.remarks || undefined}>{r.remarks || ''}</span>
                    <span className="flex items-center justify-end gap-2">
                      <span className="flex flex-col items-end leading-tight">
                        <span className="text-[13px] font-semibold tabular-nums text-[#262B35]">{rupees(rowTotal)}</span>
                        {split && split.includes('·') && <span className="text-[9.5px] text-[#8A93A3] tabular-nums whitespace-nowrap">{split}</span>}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="text-[#C4C8D0] group-hover:text-[#5B6371] transition-colors"><polyline points="9 18 15 12 9 6"/></svg>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Footer: receipt count + total, and the fee-heads toggle */}
            <div className="flex items-center gap-3 px-4 py-2 border-t bg-[#FAFBFD]" style={{ borderColor: LEDGER_LINE }}>
              {ev ? (
                <button
                  type="button"
                  onClick={() => toggleHeads(academicYear)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer hover:underline underline-offset-2"
                  style={{ color: theme.accentInk }}
                  aria-expanded={headsOpen}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${headsOpen ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6"/></svg>
                  Fee heads
                  {override && !structure && <span className="font-normal" style={{ color: AMBER }}>· custom allotted</span>}
                </button>
              ) : <span />}
              <span className="ml-auto text-[11px] font-medium text-[#8A93A3]">
                {records.length} receipt{records.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[12.5px] font-semibold tabular-nums text-[#262B35] text-right pr-5">{rupees(totalPaid)}</span>
            </div>

            {/* Fee heads fold-out: per-bucket figures + per-head dues */}
            {ev && headsOpen && (
              <div className="px-4 pb-3 pt-2.5 space-y-2.5 border-t" style={{ borderColor: LEDGER_LINE, animation: 'content-enter 0.2s ease-out' }}>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {buckets.map((b) => (
                    <span key={b.key} className="inline-flex items-baseline gap-2 text-[11px]">
                      <span className="font-semibold" style={{ color: inkOf(b.color) }}>{b.key}</span>
                      <Figure label="Allotted" value={rupees(b.allotted)} />
                      <Figure label="Paid" value={rupees(b.paid)} />
                      <Figure label="Due" value={rupees(Math.max(0, b.allotted - b.paid))} color={b.allotted - b.paid > 0 ? inkOf(theme.due) : inkOf(theme.paid)} />
                    </span>
                  ))}
                </div>

                {(() => {
                  const smpItems = SMP_FEE_HEADS.flatMap(({ key, label }) => {
                    const allottedAmt = key === 'fine' ? fine : ev.smp[key];
                    if (allottedAmt === 0) return [];
                    const paidAmt = records.reduce((s, r) => s + r.smp[key], 0);
                    return [{ key: `smp-${key}`, label, dueAmt: allottedAmt - paidAmt }];
                  });
                  const svkItems = ev.svk > 0 ? [{ key: 'svk', label: 'SVK Fee', dueAmt: ev.svk - svkBasePaid }] : [];
                  const addlItems = ev.additional.flatMap((h) => {
                    if (h.amount === 0) return [];
                    const paidAmt = records.reduce(
                      (s, r) => s + (r.additionalPaid.find((ap) => ap.label === h.label)?.amount ?? 0), 0,
                    );
                    return [{ key: `addl-${h.label}`, label: h.label, dueAmt: h.amount - paidAmt }];
                  });
                  const rows = [
                    { name: 'SMP', color: SKY, items: smpItems },
                    { name: 'SVK', color: VIOLET, items: svkItems },
                    { name: 'Addl', color: MINT, items: addlItems },
                  ].filter((row) => row.items.length > 0);
                  return rows.map((row) => (
                    <div key={row.name} className="flex items-start gap-2">
                      <span className="text-[9.5px] font-semibold uppercase tracking-[0.6px] w-9 pt-[7px] shrink-0" style={{ color: inkOf(row.color) }}>{row.name}</span>
                      <div className="flex-1 flex flex-wrap gap-1">
                        {row.items.map(({ key, label, dueAmt }) => <DueChip key={key} label={label} dueAmt={dueAmt} />)}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </section>
        );
      })}

      {receiptDetailRecord && (
        <FeeReceiptDetailModal
          record={receiptDetailRecord}
          isAdmin={false}
          onClose={() => setReceiptDetailRecord(null)}
        />
      )}
    </div>
  );
}

/** One fee head in the breakdown: due amount when due, ✓ when cleared. Minimal outline chip. */
function DueChip({ label, dueAmt }: { label: string; dueAmt: number }) {
  const theme = useModalTheme(STUDENT_DEFAULT_THEME);
  const isDue = dueAmt > 0;
  const c = isDue ? theme.due : theme.paid;
  return (
    <span
      className="inline-flex items-center gap-1.5 h-7 rounded-full border bg-white px-2.5 text-[11px] font-medium leading-none"
      style={{ borderColor: isDue ? `${c}59` : LEDGER_LINE }}
    >
      <span className="whitespace-nowrap text-[#5B6371]">{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: inkOf(c) }}>
        {dueAmt === 0 ? '✓' : rupees(dueAmt)}
      </span>
    </span>
  );
}

// ─── TC History tab ───────────────────────────────────────────────────────────

function TcHistoryTab({
  records, editRecords, loading,
}: {
  records: TCRecord[];
  editRecords: TCEditRecord[];
  loading: boolean;
}) {
  const theme = useModalTheme(STUDENT_DEFAULT_THEME);
  if (loading) return <CardSkeleton />;

  if (records.length === 0 && editRecords.length === 0) {
    return (
      <EmptyState
        color={VIOLET}
        icon={Ico.big(<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>)}
        title="No Transfer Certificates Issued"
        subtitle="TC records will appear here once generated for this student."
      />
    );
  }

  return (
    <div className="px-5 py-4 space-y-3" style={{ animation: 'content-enter 0.26s ease-out' }}>
      {/* Summary bar */}
      {records.length > 0 && (
        <div className="flex items-center justify-between">
          <SummaryPill color={records.length > 1 ? AMBER : VIOLET}>
            {records.length} TC{records.length > 1 ? 's' : ''} issued
            {records.some((r) => r.isDuplicate) ? ' · includes duplicate' : ''}
          </SummaryPill>
        </div>
      )}

      {/* Record cards */}
      {records.map((r, idx) => {
        const isDup = r.isDuplicate;
        const c = isDup ? AMBER : VIOLET;
        return (
          <RecordCard
            key={r.id}
            color={c}
            icon={Ico.arrow}
            title={<span className="tabular-nums">TC #{r.tcNumber}</span>}
            pills={
              <>
                <LinePill value={isDup ? 'Duplicate Copy' : 'Original'} color={c} dot />
                {idx === 0 && records.length > 1 && <LinePill value="Latest" color={theme.accent} />}
              </>
            }
            meta={`Issued ${fmtDate(r.issuedAt)}`}
          >
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
              <Field label="Date of Leaving" value={r.dateOfLeaving} />
              <Field label="Semester" value={r.semester} />
              <Field label="Last Exam" value={r.lastExam} />
              <Field label="Result" value={r.result} />
            </dl>
          </RecordCard>
        );
      })}

      {records.length > 1 && (
        <Banner color={AMBER}>
          Multiple TCs issued for this student. Any further TC must be a <strong>Duplicate Copy</strong>.
        </Banner>
      )}

      {/* Extra-details edit history — father/mother name, DOB, caste, category corrections */}
      {editRecords.length > 0 && (
        <IconCard
          title="Extra Details Edit History"
          color={VIOLET}
          icon={Ico.edit}
          right={<LinePill value={`${editRecords.length} edit${editRecords.length > 1 ? 's' : ''}`} color={VIOLET} />}
        >
          <div className="space-y-3">
            {editRecords.map((rec) => (
              <div key={rec.id} className="flex gap-3">
                <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: VIOLET, boxShadow: `0 0 0 3px ${VIOLET}26` }} />
                <div className="min-w-0 space-y-1">
                  <div className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#8A93A3]">
                    {fmtDate(rec.editedAt)}
                  </div>
                  <div className="space-y-0.5">
                    {rec.changes.map((c, i) => (
                      <div key={i} className="text-[12px] text-[#262B35]">
                        <span className="font-medium text-[#5B6371]">{c.label}:</span>{' '}
                        <span className="line-through text-[#A9B0BB]">{c.from}</span>
                        {' → '}
                        <span className="font-semibold" style={{ color: inkOf(VIOLET) }}>{c.to}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </IconCard>
      )}
    </div>
  );
}

// ─── PC History tab ───────────────────────────────────────────────────────────

function PcHistoryTab({ records, loading }: { records: PCRecord[]; loading: boolean }) {
  const theme = useModalTheme(STUDENT_DEFAULT_THEME);
  if (loading) return <CardSkeleton />;

  if (records.length === 0) {
    return (
      <EmptyState
        color={ROSE}
        icon={Ico.big(<><circle cx="12" cy="8" r="6"/><path d="M15.5 13.5L17 22l-5-3-5 3 1.5-8.5"/></>)}
        title="No Provisional Certificates Issued"
        subtitle="PC records will appear here once generated for this student."
      />
    );
  }

  return (
    <div className="px-5 py-4 space-y-3" style={{ animation: 'content-enter 0.26s ease-out' }}>
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <SummaryPill color={records.length > 1 ? AMBER : ROSE}>
          {records.length} PC{records.length > 1 ? 's' : ''} issued
          {records.some((r) => r.isDuplicate) ? ' · includes duplicate' : ''}
        </SummaryPill>
      </div>

      {/* Record cards */}
      {records.map((r, idx) => {
        const isDup = r.isDuplicate;
        const c = isDup ? AMBER : ROSE;
        return (
          <RecordCard
            key={r.id}
            color={c}
            icon={Ico.award}
            title={r.examPeriod}
            pills={
              <>
                <LinePill value={isDup ? 'Duplicate Copy' : 'Original'} color={c} dot />
                {idx === 0 && records.length > 1 && <LinePill value="Latest" color={theme.accent} />}
              </>
            }
            meta={`Issued ${fmtDate(r.issuedAt)}`}
          >
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
              <Field label="Reg. Number" value={r.regNumber} />
              <Field label="Result Class" value={r.resultClass} />
              <Field label="Date of Issue" value={r.dateOfIssue} />
            </dl>
          </RecordCard>
        );
      })}

      {records.length > 1 && (
        <Banner color={AMBER}>
          Multiple PCs issued for this student. Any further PC must be a <strong>Duplicate Copy</strong>.
        </Banner>
      )}
    </div>
  );
}

// ─── ANS Letters tab ────────────────────────────────────────────────────────

const ANS_STATUS_LABEL: Record<AnsLetterStatus, string> = {
  sent: 'Sent',
  visited: 'Parent Visited',
  resolved: 'Resolved',
};

const ANS_STATUS_COLOR: Record<AnsLetterStatus, string> = {
  sent: AMBER,
  visited: SKY,
  resolved: MINT,
};

const ANS_TINT = '#EA580C';

function AnsHistoryTab({ student, records, loading }: { student: Student; records: AnsLetterRecord[]; loading: boolean }) {
  const theme = useModalTheme(STUDENT_DEFAULT_THEME);
  const [previewing, setPreviewing] = useState(false);

  if (loading) return <CardSkeleton cells={3} />;

  if (records.length === 0) {
    return (
      <EmptyState
        color={ANS_TINT}
        icon={Ico.big(<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></>)}
        title="No ANS Letters Issued"
        subtitle="Attendance-shortage intimation letters will appear here once generated for this student."
      />
    );
  }

  return (
    <div className="px-5 py-4 space-y-3" style={{ animation: 'content-enter 0.26s ease-out' }}>
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <SummaryPill color={records.length > 1 ? AMBER : ANS_TINT}>
          {records.length} ANS letter{records.length > 1 ? 's' : ''} issued
        </SummaryPill>
        <PillBtn color={ANS_TINT} onClick={() => setPreviewing(true)}>
          {Ico.eye}
          Preview Letter
        </PillBtn>
      </div>

      {/* Record cards */}
      {records.map((r, idx) => (
        <RecordCard
          key={r.id}
          color={ANS_TINT}
          icon={Ico.mail}
          title={fmtDate(r.issuedAt)}
          pills={
            <>
              <LinePill value={ANS_STATUS_LABEL[r.status]} color={ANS_STATUS_COLOR[r.status]} dot />
              {idx === 0 && records.length > 1 && <LinePill value="Latest" color={theme.accent} />}
            </>
          }
          meta={new Date(r.issuedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        >
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
            <Field label="Course">
              <LinePill value={r.course} color={DEPT_DOT[r.course]} />
            </Field>
            <Field label="Year">
              <LinePill value={r.year} color={YEAR_COLOR[r.year]} />
            </Field>
            <Field label="Academic Year" value={r.academicYear} />
            {r.statusUpdatedAt && (
              <Field label="Status Updated" value={fmtDate(r.statusUpdatedAt)} />
            )}
          </dl>
        </RecordCard>
      ))}

      {previewing && (
        <AnsLetterPreviewModal student={student} onClose={() => setPreviewing(false)} readOnly />
      )}
    </div>
  );
}

// ─── Refund History tab ───────────────────────────────────────────────────────

const REFUND_PAYMENT_LABELS: Record<string, string> = {
  CHEQUE: 'Cheque',
  ACCOUNT_PAYEE_CHEQUE: 'Account Payee Cheque',
  NEFT: 'NEFT',
  CASH: 'Cash',
  UPI: 'UPI',
};

const REFUND_CATEGORY_LABELS: Record<string, string> = {
  SEAT_CANCELLATION: 'Seat Cancellation',
  GENERAL: 'General Refund',
  SNQ: 'SNQ',
};

function refundIsoToDDMMYYYY(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ── Seat Cancellation request letter (Kannada) — button + issued-letters list ──
function SeatCancelLetterSection({ student }: { student: Student }) {
  const { role } = useAuth();
  const [records, setRecords] = useState<SeatCancelLetterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ initial?: SeatCancelLetterRecord } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSeatCancelLetterRecords(student.id)
      .then((r) => { if (!cancelled) setRecords(r); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [student.id]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteSeatCancelLetterRecord(student.id, id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch { /* keep row; user can retry */ }
    finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  }

  return (
    <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: `${AMBER}40` }}>
      <div
        className="px-3.5 py-2.5 flex items-center justify-between gap-3"
        style={{ background: `linear-gradient(90deg, ${AMBER}14, ${AMBER}03 75%)` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 text-white"
            style={{ background: `linear-gradient(135deg, ${AMBER}, ${inkOf(AMBER)})`, boxShadow: `0 3px 8px ${AMBER}40` }}
          >
            {Ico.doc}
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold" style={{ color: inkOf(AMBER) }}>
              Seat Cancellation Letter <span className="font-normal">(ಕನ್ನಡ)</span>
            </p>
            <p className="text-[10.5px] font-medium text-[#8A93A3]">Student's request to cancel the seat, return original documents and refund the fee.</p>
          </div>
        </div>
        <PillBtn color={AMBER} onClick={() => setModal({})}>
          {Ico.doc}
          Cancellation Letter
        </PillBtn>
      </div>

      {!loading && records.length > 0 && (
        <div className="border-t divide-y divide-[#F3EBDD]" style={{ borderColor: `${AMBER}26` }}>
          {records.map((r) => (
            <div key={r.id} className="px-3.5 py-2 flex items-center gap-3">
              <span className="text-[11px] font-semibold text-[#5B6371] shrink-0 w-20 tabular-nums">
                {refundIsoToDDMMYYYY(r.letterDate)}
              </span>
              <span className="text-[12px] text-[#262B35] truncate flex-1 min-w-0" title={r.reason}>{r.reason}</span>
              <PillBtn color={AMBER} onClick={() => setModal({ initial: r })}>
                {Ico.print}
                Reprint
              </PillBtn>
              {role === 'admin' && (
                pendingDeleteId === r.id ? (
                  <span className="flex items-center gap-1 shrink-0">
                    <PillBtn color={CORAL} variant="solid" onClick={() => void handleDelete(r.id)} disabled={deletingId === r.id}>
                      {deletingId === r.id ? 'Deleting…' : 'Confirm'}
                    </PillBtn>
                    <PillBtn variant="neutral" onClick={() => setPendingDeleteId(null)}>
                      Cancel
                    </PillBtn>
                  </span>
                ) : (
                  <PillBtn color={CORAL} onClick={() => setPendingDeleteId(r.id)} title="Delete this letter record">
                    {Ico.trash}
                    Delete
                  </PillBtn>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <SeatCancellationLetterModal
          student={student}
          initial={modal.initial ? { reason: modal.initial.reason, letterDate: modal.initial.letterDate } : undefined}
          readOnly={!!modal.initial}
          onSaved={(r) => setRecords((prev) => [r, ...prev])}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function RefundHistoryTab({ student, records, loading, error, onDeleted, onCreated }: {
  student: Student;
  records: RefundRecord[];
  loading: boolean;
  error: string | null;
  onDeleted: (id: string) => void;
  onCreated: (r: RefundRecord) => void;
}) {
  const theme = useModalTheme(STUDENT_DEFAULT_THEME);
  const { role } = useAuth();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showGeneralRefundModal, setShowGeneralRefundModal] = useState(false);

  function handlePrint(r: RefundRecord) {
    if (r.refundCategory === 'SEAT_CANCELLATION') {
      generateSeatCancellationRefundVoucher(student, {
        totalPaid: r.totalPaid,
        headBreakdown: r.headBreakdown ?? [],
        refundAmount: r.refundAmount,
        paymentType: r.paymentType,
        referenceNumber: r.referenceNumber,
        paymentDate: refundIsoToDDMMYYYY(r.paymentDate),
        remarks: r.remarks,
      });
      return;
    }
    if (r.refundCategory === 'GENERAL') {
      generateGeneralFeeRefundVoucher(student, {
        refundAmount: r.refundAmount,
        paymentType: r.paymentType,
        referenceNumber: r.referenceNumber,
        paymentDate: refundIsoToDDMMYYYY(r.paymentDate),
        remarks: r.remarks,
      });
      return;
    }
    generateSnqRefundVoucher(student, {
      totalPaid: r.totalPaid,
      receiptBreakdown: r.receiptBreakdown,
      refundAmount: r.refundAmount,
      paymentType: r.paymentType,
      referenceNumber: r.referenceNumber,
      paymentDate: refundIsoToDDMMYYYY(r.paymentDate),
      remarks: r.remarks,
    });
  }

  async function handleDelete(r: RefundRecord) {
    setDeletingId(r.id);
    setDeleteError(null);
    try {
      await deleteRefundRecord(r.id);
      // Remove the matching "Refunded ₹X on DD/MM/YYYY" note added when this refund was
      // generated, so it doesn't linger on the fee records after the refund itself is gone.
      // GENERAL refunds never appended such a note (no corresponding fee record), so skip it.
      if (r.refundCategory !== 'GENERAL') {
        const note = `Refunded ₹${r.refundAmount.toLocaleString()} on ${refundIsoToDDMMYYYY(r.paymentDate)}`;
        removeFeeRecordRemark(student.id, r.academicYear, note).catch(() => { /* non-fatal */ });
      }
      onDeleted(r.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete refund record');
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  }

  if (loading) return <CardSkeleton />;

  if (error) {
    return (
      <EmptyState
        color={CORAL}
        icon={Ico.big(<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>)}
        title="Couldn't load refund history"
        subtitle={error}
      />
    );
  }

  if (records.length === 0) {
    return (
      <div className="px-5 pt-4" style={{ animation: 'content-enter 0.26s ease-out' }}>
        <SeatCancelLetterSection student={student} />
        <EmptyState
          color={CORAL}
          icon={Ico.big(<><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></>)}
          title="No Refund Recorded"
          subtitle="SNQ, seat cancellation, or general fee refund vouchers will appear here once generated for this student."
        >
          {role === 'admin' && (
            <PillBtn color={theme.accent} variant="solid" onClick={() => setShowGeneralRefundModal(true)}>
              {Ico.plus}
              Record Refund
            </PillBtn>
          )}
        </EmptyState>
        {showGeneralRefundModal && (
          <GeneralFeeRefundModal
            student={student}
            onClose={() => setShowGeneralRefundModal(false)}
            onSaved={(r) => { onCreated(r); setShowGeneralRefundModal(false); }}
          />
        )}
      </div>
    );
  }

  const totalRefunded = records.reduce((s, r) => s + r.refundAmount, 0);

  return (
    <div className="px-5 py-4 space-y-3" style={{ animation: 'content-enter 0.26s ease-out' }}>
      <SeatCancelLetterSection student={student} />

      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <SummaryPill color={CORAL}>
          {records.length} refund{records.length > 1 ? 's' : ''} · Total Refunded <span className="font-semibold tabular-nums">₹{totalRefunded.toLocaleString()}</span>
        </SummaryPill>
        {role === 'admin' && (
          <PillBtn color={theme.accent} variant="solid" onClick={() => setShowGeneralRefundModal(true)}>
            {Ico.plus}
            Record Refund
          </PillBtn>
        )}
      </div>

      {showGeneralRefundModal && (
        <GeneralFeeRefundModal
          student={student}
          onClose={() => setShowGeneralRefundModal(false)}
          onSaved={(r) => { onCreated(r); setShowGeneralRefundModal(false); }}
        />
      )}

      {deleteError && (
        <Banner color={CORAL}>
          <strong>Couldn't delete refund:</strong> {deleteError}
        </Banner>
      )}

      {/* Record cards */}
      {records.map((r, idx) => {
        const isGeneral = r.refundCategory === 'GENERAL';
        const c = isGeneral ? theme.accent : theme.refund;
        return (
          <RecordCard
            key={r.id}
            color={c}
            icon={Ico.undo}
            title={<span className="tabular-nums">₹{r.refundAmount.toLocaleString()}</span>}
            pills={
              <>
                <LinePill value={REFUND_CATEGORY_LABELS[r.refundCategory ?? 'SNQ']} color={c} dot />
                {idx === 0 && records.length > 1 && <LinePill value="Latest" color={theme.accent} />}
              </>
            }
            meta={`Issued ${fmtDate(r.issuedAt)}`}
            actions={
              <>
                <PillBtn color={theme.accent} onClick={() => handlePrint(r)} title="Print refund voucher">
                  {Ico.print}
                  Print Voucher
                </PillBtn>
                {role === 'admin' && (
                  pendingDeleteId === r.id ? (
                    <span className="flex items-center gap-1">
                      <PillBtn color={CORAL} variant="solid" onClick={() => void handleDelete(r)} disabled={deletingId === r.id}>
                        {deletingId === r.id ? 'Deleting…' : 'Confirm Delete'}
                      </PillBtn>
                      <PillBtn variant="neutral" onClick={() => setPendingDeleteId(null)} disabled={deletingId === r.id}>
                        Cancel
                      </PillBtn>
                    </span>
                  ) : (
                    <PillBtn
                      color={CORAL}
                      onClick={() => { setPendingDeleteId(r.id); setDeleteError(null); }}
                      title="Delete this refund record"
                    >
                      {Ico.trash}
                      Delete
                    </PillBtn>
                  )
                )}
              </>
            }
          >
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3">
              <Field label="Mode" value={REFUND_PAYMENT_LABELS[r.paymentType] ?? r.paymentType} />
              <Field label="Reference No." value={r.referenceNumber} />
              <Field label="Payment Date" value={r.paymentDate ? fmtDate(r.paymentDate) : ''} />
              {!isGeneral && (
                <Field
                  label={r.refundCategory === 'SEAT_CANCELLATION' ? 'Total Paid (at issue)' : 'SMP Paid (at issue)'}
                  value={`₹${r.totalPaid.toLocaleString()}`}
                />
              )}
              {r.remarks && (
                <div className="col-span-2 sm:col-span-4">
                  <Field label={isGeneral ? 'Reason for Refund' : 'Remarks'} value={r.remarks} />
                </div>
              )}
            </dl>
          </RecordCard>
        );
      })}
    </div>
  );
}

// ─── Results tab ────────────────────────────────────────────────────────────────

function groupSubjectsBySem(subjects: ExamResult['subjects']): [number, ExamResult['subjects']][] {
  const map = new Map<number, ExamResult['subjects']>();
  for (const s of subjects) {
    const group = map.get(s.sem);
    if (group) group.push(s);
    else map.set(s.sem, [s]);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

function resultColor(overallResult: string): string {
  if (overallResult === 'FAILS' || overallResult === 'FAIL') return CORAL;
  if (overallResult === 'AB') return AMBER;
  if (overallResult === 'Distinction') return MINT;
  return SKY;
}

/** Subject count chips: subjects / passed / failed / absent. */
function SubjectChips({ subjects, small }: { subjects: ExamResult['subjects']; small?: boolean }) {
  const chips = [
    { label: `${subjects.length} subject${subjects.length === 1 ? '' : 's'}`, color: FALLBACK_COLOR },
    { label: `${subjects.filter((s) => s.result === 'P').length} passed`, color: MINT },
    { label: `${subjects.filter((s) => s.result === 'F').length} failed`, color: CORAL },
    { label: `${subjects.filter((s) => s.result === 'AB').length} absent`, color: AMBER },
  ];
  return (
    <>
      {chips.map((c) => (
        <span
          key={c.label}
          className={`inline-flex items-center gap-1 rounded-full border bg-white font-medium leading-none ${small ? 'px-2 py-[3px] text-[10px]' : 'px-2.5 py-[5px] text-[11px]'}`}
          style={{ borderColor: `${c.color}55`, color: inkOf(c.color) }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
          {c.label}
        </span>
      ))}
    </>
  );
}

function ResultsTab({
  records,
  loading,
  onRecordsChange,
}: {
  records: ExamResult[];
  loading: boolean;
  onRecordsChange: (records: ExamResult[]) => void;
}) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [selected, setSelected] = useState<ExamResult | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const sections = mergeResultsBySession(records);

  async function handleDelete(section: ReturnType<typeof mergeResultsBySession>[number]) {
    const label = section.sourceCount > 1
      ? `all ${section.sourceCount} sheets under "${section.examSession}"`
      : `the "${section.examSession}" result`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

    setDeletingKey(section.id);
    try {
      await Promise.all(section.sourceIds.map((id) => deleteExamResult(id)));
      onRecordsChange(records.filter((r) => !section.sourceIds.includes(r.id)));
      invalidateResultsCache();
    } catch {
      window.alert('Failed to delete result. Please try again.');
    } finally {
      setDeletingKey(null);
    }
  }

  if (loading) return <CardSkeleton />;

  if (records.length === 0) {
    return (
      <EmptyState
        color={SKY}
        icon={Ico.big(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></>)}
        title="No Exam Results Found"
        subtitle="Results will appear here once imported for this student."
      />
    );
  }

  return (
    <div className="px-5 py-4 space-y-3" style={{ animation: 'content-enter 0.26s ease-out' }}>
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <SummaryPill color={SKY}>
          {sections.length} exam session{sections.length > 1 ? 's' : ''} found
        </SummaryPill>
      </div>

      {/* Session cards — one per distinct exam session, consolidating any
          sheets (e.g. separate Sem-1/Sem-2 ledgers) printed under it. */}
      {sections.map((r) => (
        <RecordCard
          key={r.id}
          color={SKY}
          icon={Ico.doc}
          title={r.examSession}
          pills={
            <>
              {r.semesterCount > 1 && <LinePill value={`${r.semesterCount} sems`} color={SKY} />}
              <LinePill value={r.overallResult} color={resultColor(r.overallResult)} dot />
            </>
          }
          actions={
            <>
              <PillBtn color={SKY} onClick={() => setSelected(r)}>
                View Full Result
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </PillBtn>
              {isAdmin && (
                <PillBtn color={CORAL} onClick={() => void handleDelete(r)} disabled={deletingKey === r.id}>
                  {Ico.trash}
                  {deletingKey === r.id ? 'Deleting…' : 'Delete'}
                </PillBtn>
              )}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex flex-col justify-center rounded-xl border px-3 py-1.5 mr-1"
              style={{ background: `${SKY}0F`, borderColor: `${SKY}40` }}
            >
              <span className="text-[8.5px] font-medium uppercase tracking-[0.8px] text-[#8A93A3] leading-none">CGPA</span>
              <span className="mt-1 text-[14px] font-semibold leading-none tabular-nums" style={{ color: inkOf(SKY) }}>
                {r.cgpa ?? (r.cgpaStatus || '—')}
              </span>
            </div>
            <SubjectChips subjects={r.subjects} />
          </div>

          {/* Sem-wise breakdown — only useful when the session spans more
              than one semester (backlog sheets combine several). */}
          {r.semesterCount > 1 && (
            <div className="mt-3 rounded-xl border border-[#E3EDF5] divide-y divide-[#EEF3F7] overflow-hidden">
              {groupSubjectsBySem(r.subjects).map(([sem, subs]) => (
                <div key={sem} className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-[#F7FBFE]">
                  <span className="text-[11px] font-semibold w-14 shrink-0" style={{ color: inkOf(SKY) }}>Sem {sem}</span>
                  <SubjectChips subjects={subs} small />
                </div>
              ))}
            </div>
          )}
        </RecordCard>
      ))}

      {selected && <ResultDetailModal result={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

type Tab = 'profile' | 'documents' | 'fee' | 'tc' | 'pc' | 'results' | 'refund' | 'ans';

// Each tab keeps a small identifying colour on its pill.
const TAB_TINT: Record<Tab, string> = {
  profile:   OCEAN,
  documents: AMBER,
  fee:       MINT,
  tc:        VIOLET,
  pc:        ROSE,
  results:   SKY,
  refund:    CORAL,
  ans:       ANS_TINT,
};

const TAB_ICON: Record<Tab, React.ReactNode> = {
  profile:   Ico.user,
  documents: Ico.folder,
  fee:       Ico.rupee,
  tc:        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  pc:        Ico.cap,
  results:   Ico.chart,
  refund:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>,
  ans:       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>,
};

/** Slim single-line "label · value" chip for the info line under the name. */
function InfoChip({ label, value, color, mono }: { label: string; value?: string; color?: string; mono?: boolean }) {
  const c = color ?? FALLBACK_COLOR;
  return (
    <span
      className="shrink-0 inline-flex items-center gap-1.5 rounded-full border bg-white/80 px-2.5 py-[6px] leading-none max-w-[240px]"
      style={{ borderColor: `${c}40` }}
      title={value}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
      <span className="text-[8.5px] font-medium uppercase tracking-[0.6px] text-[#8A93A3] whitespace-nowrap">{label}</span>
      <span className={`text-[11px] font-semibold truncate ${mono ? 'tabular-nums' : ''}`} style={{ color: inkOf(c) }}>
        {value || '—'}
      </span>
    </span>
  );
}

interface Props {
  student: Student;
  onClose: () => void;
  defaultTab?: Tab;
  /** Visual theme. 'default' = ocean blue with green/red payment status (Students, Admissions, WP Students);
   *  'periwinkle' = Dashboard look (periwinkle accent, indigo paid/due, amber refund). */
  theme?: ModalThemeName;
}

export function StudentDetailModal({ student, onClose, defaultTab = 'profile', theme: themeName = 'default' }: Props) {
  const pw = themeName === 'periwinkle';
  const theme = pw ? PERIWINKLE_THEME : STUDENT_DEFAULT_THEME;
  const tabTint: Record<Tab, string> = { ...TAB_TINT, profile: theme.accent, fee: theme.paid, refund: theme.refund };
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);

  // Fee history state — lazy-loaded on first visit to fee tab
  const [yearData, setYearData] = useState<YearData[]>([]);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeLoaded, setFeeLoaded] = useState(false);

  // Documents — load eagerly (single Firestore doc, cheap)
  const { docs, loading: docsLoading, error: docsError } = useStudentDocuments(student.id);

  // TC history state — lazy-loaded on first visit to tc tab
  const [tcRecords, setTcRecords] = useState<TCRecord[]>([]);
  const [tcLoading, setTcLoading] = useState(false);
  const [tcLoaded,  setTcLoaded]  = useState(false);

  // Extra-details edit history (father/mother name, DOB, caste, category corrections)
  const [tcEditRecords, setTcEditRecords] = useState<TCEditRecord[]>([]);

  // PC history state — lazy-loaded on first visit to pc tab
  const [pcRecords, setPcRecords] = useState<PCRecord[]>([]);
  const [pcLoading, setPcLoading] = useState(false);
  const [pcLoaded,  setPcLoaded]  = useState(false);

  // ANS letter history state — lazy-loaded on first visit to ans tab
  const [ansRecords, setAnsRecords] = useState<AnsLetterRecord[]>([]);
  const [ansLoading, setAnsLoading] = useState(false);
  const [ansLoaded,  setAnsLoaded]  = useState(false);

  // Exam results state — lazy-loaded on first visit to results tab
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsLoaded,  setResultsLoaded]  = useState(false);

  // Refund history state — lazy-loaded on first visit to refund tab (SNQ students only)
  const [refundRecords, setRefundRecords] = useState<RefundRecord[]>([]);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundLoaded,  setRefundLoaded]  = useState(false);
  const [refundError,   setRefundError]   = useState<string | null>(null);


  // Lazy-load fee history when fee tab first activated
  useEffect(() => {
    if (activeTab !== 'fee' || feeLoaded) return;
    setFeeLoading(true);

    Promise.all([
      getAllFeeRecordsByStudent(student.id),
      student.regNumber
        ? getAllFeeRecordsByRegNumber(student.regNumber)
        : Promise.resolve([] as FeeRecord[]),
    ])
      .then(([byId, byReg]) => {
        const seen = new Set<string>();
        const merged: FeeRecord[] = [];
        for (const r of [...byId, ...byReg]) {
          if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
        }
        return merged;
      })
      .then(async (records) => {
        const grouped = new Map<AcademicYear, FeeRecord[]>();
        for (const r of records) {
          const list = grouped.get(r.academicYear) ?? [];
          list.push(r);
          grouped.set(r.academicYear, list);
        }
        const latestAY = [...grouped.keys()].sort().at(-1);
        const data: YearData[] = await Promise.all(
          [...grouped.entries()].map(async ([ay, recs]) => {
            const first = recs[0];
            const isLatest = ay === latestAY;
            const structure =
              await getFeeStructure(ay, first.course, first.year, first.admType, first.admCat)
              ?? (isLatest
                ? await getFeeStructure(ay, first.course, first.year, student.admType as AdmType, student.admCat as AdmCat)
                : null);
            const override = await getFeeOverride(first.studentId, ay);
            const sorted = [...recs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return { academicYear: ay, records: sorted, structure: structure ?? null, override };
          }),
        );
        data.sort((a, b) => b.academicYear.localeCompare(a.academicYear));
        setYearData(data);
      })
      .catch((err: unknown) => {
        setFeeError(err instanceof Error ? err.message : 'Failed to load fee history');
      })
      .finally(() => { setFeeLoading(false); setFeeLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, feeLoaded]);

  // Lazy-load TC history (and extra-details edit history) when tc tab first activated.
  // Merges the current doc's own tcHistory with every sibling academic-year doc's
  // (same regNumber) tcHistory — a TC is issued once, on the final-year doc, so earlier
  // years must look across years to see it too.
  useEffect(() => {
    if (activeTab !== 'tc' || tcLoaded) return;
    setTcLoading(true);
    Promise.all([
      getTcRecordsByStudent(student.id),
      student.regNumber ? getTcRecordsByRegNumber(student.regNumber) : Promise.resolve([] as TCRecord[]),
      getTcEditRecordsByStudent(student.id).catch(() => [] as TCEditRecord[]),
    ])
      .then(([byId, byReg, editRecords]) => {
        const seen = new Set<string>();
        const merged: TCRecord[] = [];
        for (const r of [...byId, ...byReg]) {
          if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
        }
        merged.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
        setTcRecords(merged);
        setTcEditRecords(editRecords);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { setTcLoading(false); setTcLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tcLoaded]);

  // Lazy-load PC history when pc tab first activated — merged across sibling
  // academic-year docs (same regNumber), mirroring the TC history fix above.
  useEffect(() => {
    if (activeTab !== 'pc' || pcLoaded) return;
    setPcLoading(true);
    Promise.all([
      getPcRecordsByStudent(student.id),
      student.regNumber ? getPcRecordsByRegNumber(student.regNumber) : Promise.resolve([] as PCRecord[]),
    ])
      .then(([byId, byReg]) => {
        const seen = new Set<string>();
        const merged: PCRecord[] = [];
        for (const r of [...byId, ...byReg]) {
          if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
        }
        merged.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
        setPcRecords(merged);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { setPcLoading(false); setPcLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, pcLoaded]);

  // Lazy-load ANS letter history when ans tab first activated
  useEffect(() => {
    if (activeTab !== 'ans' || ansLoaded) return;
    setAnsLoading(true);
    getAnsRecordsByStudent(student.id)
      .then((records) => setAnsRecords(records))
      .catch(() => { /* non-fatal */ })
      .finally(() => { setAnsLoading(false); setAnsLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ansLoaded]);

  // Lazy-load exam results when results tab first activated
  useEffect(() => {
    if (activeTab !== 'results' || resultsLoaded) return;
    setResultsLoading(true);
    (student.regNumber ? getExamResultsByRegNumber(student.regNumber) : Promise.resolve([] as ExamResult[]))
      .then((records) => {
        const sorted = [...records].sort((a, b) =>
          (b.updatedAt || b.importedAt).localeCompare(a.updatedAt || a.importedAt)
        );
        setExamResults(sorted);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { setResultsLoading(false); setResultsLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, resultsLoaded]);

  // Load refund history eagerly — the Fee History tab also needs it to net
  // SNQ refunds against paid amounts (so due shows 0 after refund, not negative).
  useEffect(() => {
    if (refundLoaded) return;
    setRefundLoading(true);
    setRefundError(null);
    getRefundRecordsByStudent(student.id)
      .then((records) => setRefundRecords(records))
      .catch((err: unknown) => {
        setRefundError(err instanceof Error ? err.message : 'Failed to load refund history');
      })
      .finally(() => { setRefundLoading(false); setRefundLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refundLoaded]);

  // SNQ / Seat Cancellation refund totals per academic year, netted into fee tab
  // paid/due figures. GENERAL refunds (money paid outside the fee system) are excluded.
  const refundedByYear = new Map<string, number>();
  for (const r of refundRecords.filter(isFeeNettingRefund)) {
    refundedByYear.set(r.academicYear, (refundedByYear.get(r.academicYear) ?? 0) + r.refundAmount);
  }

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Overall fee stats (computed once fee is loaded)
  const overallAllotted = yearData.reduce((s, yd) => {
    const ev = effectiveValues(yd);
    return s + (ev ? calcAllotted(ev.smp, ev.svk, ev.additional, yd.records) : 0);
  }, 0);
  const overallFine = yearData.reduce((s, yd) => {
    const ev = effectiveValues(yd);
    return s + (ev ? calcEffectiveFine(ev.smp.fine, yd.records) : 0);
  }, 0);
  const overallRefunded = yearData.reduce(
    (s, { academicYear }) => s + (refundedByYear.get(academicYear) ?? 0),
    0,
  );
  const overallPaid = yearData.reduce(
    (s, { records }) => s + records.reduce((rs, r) => rs + calcRecordTotal(r), 0),
    0,
  ) - overallRefunded;
  const overallDue = overallAllotted - overallPaid;

  const allTabs: { id: Tab; label: string }[] = [
    { id: 'profile',   label: 'Profile' },
    { id: 'documents', label: 'Docs History' },
    { id: 'fee',       label: 'Fee History' },
    { id: 'tc',        label: 'TC History' },
    { id: 'pc',        label: 'PC History' },
    { id: 'results',   label: 'Results' },
    { id: 'ans',       label: 'ANS Letters' },
    ...(student.admCat === 'SNQ' || student.admissionStatus === 'CANCELLED' || refundRecords.length > 0 || role === 'admin'
      ? [{ id: 'refund' as Tab, label: 'Refund' }]
      : []),
  ];
  const tabs = defaultTab === 'profile'
    ? allTabs
    : [allTabs.find((t) => t.id === defaultTab)!, ...allTabs.filter((t) => t.id !== defaultTab)];

  const feeReady = feeLoaded && !feeError && yearData.length > 0;

  return (
    <ModalThemeContext.Provider value={theme}>
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className={`absolute inset-0 ${pw ? 'bg-[#1E2340]/35' : 'bg-[#0B2A3E]/45'}`}
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div
        className={`relative bg-white rounded-[22px] border w-full max-w-5xl flex flex-col overflow-hidden max-h-[calc(100vh-3rem)] min-h-[580px] ${pw ? 'border-[#DADFFA]' : 'border-[#CFE3F2]'}`}
        style={{ animation: 'modal-enter 0.25s ease-out', boxShadow: pw ? '0 24px 60px rgba(63,75,184,0.22), 0 4px 14px rgba(18,20,26,0.06)' : '0 24px 60px rgba(11,42,62,0.24), 0 4px 14px rgba(18,20,26,0.06)' }}
      >
        {/* Hero header — two compact rows: identity + pills, then an inline info line */}
        <div
          className="relative overflow-hidden px-5 pt-3 pb-2.5 shrink-0"
          style={{ background: `linear-gradient(135deg, ${theme.accent}26 0%, ${theme.accent}0D 50%, #FFFFFF 100%)` }}
        >
          <span
            className="pointer-events-none absolute -top-24 -right-12 w-56 h-56 rounded-full border-[26px]"
            style={{ borderColor: `${theme.accent}12` }}
            aria-hidden="true"
          />

          {/* Row 1: avatar · name · pills · year · close */}
          <div className="relative flex items-center gap-3">
            <RingAvatar name={student.studentNameSSLC} course={student.course} size={36} />
            <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h3 className={`text-[17px] font-bold ${pw ? 'text-[#3F4BB8]' : 'text-[#075E93]'} leading-none tracking-[-0.2px] truncate max-w-[360px]`} title={student.studentNameSSLC}>
                {student.studentNameSSLC}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {student.regNumber && (
                  <span className={`inline-flex items-center gap-1 rounded-full border ${pw ? 'border-[#6B7CF6]/40' : 'border-[#0B7BC0]/40'} bg-white/85 px-2.5 py-[6px] text-[11px] font-semibold leading-none text-black tabular-nums`}>
                    <span className="text-[8.5px] font-medium uppercase tracking-[0.6px] text-[#8A93A3]">Reg</span>
                    {student.regNumber}
                  </span>
                )}
                <LinePill tall value={student.course} color={DEPT_DOT[student.course]} />
                <LinePill tall value={student.year} color={YEAR_COLOR[student.year]} />
                <LinePill tall value={student.admissionStatus} color={STATUS_COLOR[student.admissionStatus] ?? AMBER} dot />
                {student.transferOut && (
                  <LinePill
                    tall
                    value={`Transferred Out${student.transferOutPolytechnic ? ` · ${student.transferOutPolytechnic}` : ''}`}
                    color={SKY}
                  />
                )}
                {feeReady && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[6px] text-[11px] font-semibold leading-none ${theme.solidDue && overallDue <= 0 ? 'border' : 'text-white'}`}
                    style={theme.solidDue && overallDue <= 0
                      ? { background: `${theme.paid}14`, borderColor: `${theme.paid}73`, color: inkOf(theme.paid), animation: 'stat-pop 0.3s ease-out' }
                      : {
                          background: overallDue > 0 ? theme.due : theme.paid,
                          boxShadow: `0 2px 8px ${overallDue > 0 ? theme.due : theme.paid}45`,
                          animation: 'stat-pop 0.3s ease-out',
                        }}
                  >
                    {overallDue > 0 ? `Due ₹${overallDue.toLocaleString()}` : '✓ No Dues'}
                  </span>
                )}
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full border bg-white/85 px-2.5 py-[6px] text-[11px] font-medium leading-none tabular-nums ${pw ? 'border-[#6B7CF6]/40 text-[#3F4BB8]' : 'border-[#0B7BC0]/40 text-[#075E93]'}`}
              title="Academic year"
            >
              {student.academicYear}
            </span>
            <button
              onClick={onClose}
              className={`relative flex items-center justify-center w-7 h-7 rounded-full border bg-white focus:outline-none focus-visible:ring-2 transition-colors cursor-pointer shrink-0 shadow-[0_1px_4px_rgba(18,20,26,0.06)] ${pw ? 'border-[#6B7CF6]/35 text-[#3F4BB8] hover:bg-[#F5F6FF] hover:border-[#6B7CF6]/60 focus-visible:ring-[#6B7CF6]/30' : 'border-[#0B7BC0]/35 text-[#075E93] hover:bg-[#EEF6FC] hover:border-[#0B7BC0]/60 focus-visible:ring-[#0B7BC0]/30'}`}
              aria-label="Close"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Row 2: inline info chips */}
          <div className="relative mt-2 pl-[48px] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <InfoChip label="Father" value={student.fatherName} color={VIOLET} />
            <InfoChip label="Mobile" value={student.fatherMobile || student.studentMobile || '—'} color={theme.accent} mono />
            <InfoChip label="Adm Type" value={student.admType} color={ADM_TYPE_COLOR[student.admType]} />
            <InfoChip label="Cat" value={student.admCat} color={ADM_CAT_COLOR[student.admCat]} />
            <InfoChip label="Religion" value={student.religion} color="#64748B" />
            <InfoChip label="Gender" value={student.gender} color={GENDER_COLOR[student.gender]} />
          </div>
        </div>

        {/* Tab bar */}
        <div className="shrink-0 px-4 py-2 border-y border-[#E3EDF5] bg-white">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {tabs.map((t) => {
              const active = activeTab === t.id;
              const c = tabTint[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11.5px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer ${
                    active ? 'text-white' : 'border-transparent text-[#5B6371] hover:bg-[var(--tint)] hover:text-[var(--ink)]'
                  }`}
                  style={active
                    ? { background: c, borderColor: c, boxShadow: `0 2px 8px ${c}40` }
                    : { '--tint': `${c}12`, '--ink': inkOf(c) } as React.CSSProperties}
                >
                  <span className={active ? 'text-white' : ''} style={active ? undefined : { color: c }}>{TAB_ICON[t.id]}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className={`flex-1 min-h-0 overflow-y-auto ${pw ? 'bg-[#F8F9FF]' : 'bg-[#F7FBFE]'} [&::-webkit-scrollbar]:hidden`} style={{ scrollbarWidth: 'none' }}>
          <div key={activeTab}>
          {activeTab === 'profile' && <ProfileTab student={student} />}
          {activeTab === 'documents' && (
            <DocumentsTab docs={docs} loading={docsLoading} error={docsError} />
          )}
          {activeTab === 'fee' && (
            <FeeTab
              student={student}
              yearData={yearData}
              loading={feeLoading}
              error={feeError}
              overallAllotted={overallAllotted}
              overallFine={overallFine}
              overallPaid={overallPaid}
              overallDue={overallDue}
              refundedByYear={refundedByYear}
            />
          )}
          {activeTab === 'tc' && (
            <TcHistoryTab records={tcRecords} editRecords={tcEditRecords} loading={tcLoading} />
          )}
          {activeTab === 'pc' && (
            <PcHistoryTab records={pcRecords} loading={pcLoading} />
          )}
          {activeTab === 'ans' && (
            <AnsHistoryTab student={student} records={ansRecords} loading={ansLoading} />
          )}
          {activeTab === 'results' && (
            <ResultsTab records={examResults} loading={resultsLoading} onRecordsChange={setExamResults} />
          )}
          {activeTab === 'refund' && (
            <RefundHistoryTab
              student={student}
              records={refundRecords}
              loading={refundLoading}
              error={refundError}
              onDeleted={(id) => setRefundRecords((prev) => prev.filter((r) => r.id !== id))}
              onCreated={(r) => setRefundRecords((prev) => [r, ...prev])}
            />
          )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[#E3EDF5] bg-white flex items-center justify-between shrink-0">
          <span className="text-[10.5px] font-medium text-[#A9B0BB]">Press Esc to close</span>
          <button
            onClick={onClose}
            className={`inline-flex items-center justify-center rounded-full border bg-white px-4 py-1.5 text-[12px] font-medium focus:outline-none focus-visible:ring-2 cursor-pointer transition-colors ${pw ? 'border-[#6B7CF6]/45 text-[#3F4BB8] hover:bg-[#6B7CF6]/[0.06] hover:border-[#6B7CF6]/70 focus-visible:ring-[#6B7CF6]/30' : 'border-[#0B7BC0]/45 text-[#075E93] hover:bg-[#0B7BC0]/[0.06] hover:border-[#0B7BC0]/70 focus-visible:ring-[#0B7BC0]/30'}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
    </ModalThemeContext.Provider>
  );
}
