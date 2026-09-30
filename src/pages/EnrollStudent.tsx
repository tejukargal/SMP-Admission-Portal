import { useState, useEffect, useLayoutEffect, useMemo, useRef, type SelectHTMLAttributes, type FormEvent, type ChangeEvent, type KeyboardEvent, type ClipboardEvent } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { addStudent, getStudent, updateStudent, updateStudentFields, CROSS_YEAR_PROPAGATABLE_FIELDS, getAllStudents, getStudentsByAcademicYear, peekNextDefaultRegNumber, peekNextDefaultAppNumber, updateStudentAllottedCategory } from '../services/studentService';
import { applyAdmCatFeeAdjustment, applyCourseYearUpdate } from '../services/feeRecordService';
import { createStudentNotification } from '../services/studentNotificationService';
import { validateStudentForm, validateStudentFormEdit, type ValidationErrors } from '../utils/validation';
import { Input } from '../components/common/Input';
import { createPortal } from 'react-dom';
import { KARNATAKA_TALUKS, KARNATAKA_TALUK_DISTRICT } from '../data/karnatakaLocations';
import type { Student, StudentFormData, AcademicYear, Course, Year, Gender, Religion, Category, AdmType, AdmCat, TenthBoard, PriorQualification } from '../types';

const GENDER_OPTIONS = [
  { value: 'BOY', label: 'BOY' },
  { value: 'GIRL', label: 'GIRL' },
];

const RELIGION_OPTIONS = [
  { value: 'HINDU', label: 'HINDU' },
  { value: 'MUSLIM', label: 'MUSLIM' },
  { value: 'CHRISTIAN', label: 'CHRISTIAN' },
  { value: 'JAIN', label: 'JAIN' },
  { value: 'BUDDHIST', label: 'BUDDHIST' },
  { value: 'SIKH', label: 'SIKH' },
];

const TENTH_BOARD_OPTIONS = [
  { value: 'SSLC',         label: 'SSLC' },
  { value: 'CBSE',         label: 'CBSE' },
  { value: 'ICSE',         label: 'ICSE' },
  { value: 'OUT OF STATE', label: 'OUT OF STATE' },
];

const PRIOR_QUALIFICATION_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'ITI',  label: 'ITI' },
  { value: 'PUC',  label: 'PUC' },
];

const CATEGORY_OPTIONS = [
  { value: 'GM', label: 'GM' },
  { value: 'SC', label: 'SC' },
  { value: 'ST', label: 'ST' },
  { value: 'C1', label: 'C1' },
  { value: '2A', label: '2A' },
  { value: '2B', label: '2B' },
  { value: '3A', label: '3A' },
  { value: '3B', label: '3B' },
];

const COURSE_OPTIONS = [
  { value: 'CE', label: 'CE - Civil Engineering' },
  { value: 'ME', label: 'ME - Mechanical Engineering' },
  { value: 'EC', label: 'EC - Electronics & Communication' },
  { value: 'CS', label: 'CS - Computer Science' },
  { value: 'EE', label: 'EE - Electrical Engineering' },
];

const YEAR_OPTIONS = [
  { value: '1ST YEAR', label: '1ST YEAR' },
  { value: '2ND YEAR', label: '2ND YEAR' },
  { value: '3RD YEAR', label: '3RD YEAR' },
];

const ADM_TYPE_OPTIONS = [
  { value: 'REGULAR', label: 'REGULAR' },
  { value: 'REPEATER', label: 'REPEATER' },
  { value: 'LATERAL', label: 'LATERAL' },
  { value: 'EXTERNAL', label: 'EXTERNAL' },
];

const ADM_CAT_OPTIONS = [
  { value: 'GM', label: 'GM' },
  { value: 'SNQ', label: 'SNQ' },
  { value: 'OTHERS', label: 'OTHERS' },
];

const ACADEMIC_YEAR_OPTIONS = [
  { value: '2024-25', label: '2024-25' },
  { value: '2025-26', label: '2025-26' },
  { value: '2026-27', label: '2026-27' },
  { value: '2027-28', label: '2027-28' },
  { value: '2028-29', label: '2028-29' },
  { value: '2029-30', label: '2029-30' },
];

const ADMISSION_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'PENDING' },
  { value: 'CONFIRMED', label: 'CONFIRMED' },
  { value: 'CANCELLED', label: 'CANCELLED' },
];

// ── Design tokens — mirrors the Inquiries "Add Inquiry" modal (lime) ─────────
const ROSE = '#65A30D';        // accent (name kept for shared helper code)
const ROSE_INK = '#3F6212';
const ROSE_HAIR = '#E3EFC8';

const ENROLL_SECTIONS = [
  { key: 'personal',   n: 1, title: 'Personal Information', color: '#65A30D' },
  { key: 'contact',    n: 2, title: 'Contact Details',      color: '#65A30D' },
  { key: 'marks',      n: 3, title: 'SSLC Marks',           color: '#65A30D' },
  { key: 'enrollment', n: 4, title: 'Enrollment Details',   color: '#65A30D' },
] as const;

const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

/** Section label like the modal's: small uppercase lime-ink text + numbered dot + hairline. */
function SectionLabel({ idx }: { idx: number }) {
  const sec = ENROLL_SECTIONS[idx];
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-medium text-white shrink-0" style={{ background: `linear-gradient(135deg, ${ROSE}, ${ROSE_INK})` }}>{sec.n}</span>
      <p className="text-[9.5px] font-medium uppercase tracking-[0.6px] whitespace-nowrap" style={{ color: ROSE_INK }}>{sec.title}</p>
      <span className="h-px flex-1" style={{ background: ROSE_HAIR }} />
    </div>
  );
}

/** Small divider label inside a section grid (visual grouping only). */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 pt-1">
      <span className="text-[10px] font-medium text-[#8A93A3] whitespace-nowrap">{children}</span>
      <span className="h-px flex-1 bg-[#EEF6DC]" />
    </div>
  );
}

const PILL_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-[#65A30D]/45 bg-white px-4 py-1.5 text-[12px] font-medium text-[#3F6212] hover:bg-[#65A30D]/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#65A30D]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const GRAD_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-1.5 text-[12px] font-medium text-white hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#65A30D]/40 focus-visible:ring-offset-2 cursor-pointer transition-[filter] disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap';
const GRAD_STYLE: React.CSSProperties = { background: `linear-gradient(135deg, ${ROSE}, ${ROSE_INK})`, boxShadow: `0 3px 10px ${ROSE}40` };

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ModalShell({ tone, title, icon, children, footer }: { tone: 'lime' | 'rose' | 'amber'; title: string; icon: React.ReactNode; children: React.ReactNode; footer: React.ReactNode }) {
  const c = tone === 'lime' ? ROSE : tone === 'rose' ? '#E11D48' : '#D97706';
  return (
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-md overflow-hidden" style={{ borderColor: `${c}33`, animation: 'modal-enter 0.22s ease-out' }}>
        <div className="px-5 py-3.5 flex items-center gap-2.5" style={{ background: `linear-gradient(135deg, ${c}, ${inkOf(c)})` }}>
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/20 ring-1 ring-white/40 text-white">{icon}</span>
          <h3 className="text-[14px] font-bold text-white">{title}</h3>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
        <div className="px-5 py-3 border-t flex gap-2 justify-end" style={{ borderColor: `${c}22`, background: `${c}08` }}>{footer}</div>
      </div>
    </div>
  );
}

const WARN_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

/**
 * Page-local dropdown that replaces the native <select> with the app's pill + floating-menu style
 * (same look as FilterDropdown). Same props as the shared Select; onChange receives a select-like
 * event so the existing handlers (`e.target.value`) work unchanged.
 */
interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
}

function Select({ label, error, options, placeholder, className = '', value, onChange, disabled }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = String(value ?? '');
  const selected = options.find((o) => o.value === current);

  function pick(v: string) {
    onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function close() { setOpen(false); }
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current;
    const w = Math.max(rect.width, 160);
    let left = rect.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    const below = window.innerHeight - rect.bottom;
    const h = Math.min(menu.scrollHeight, 260);
    menu.style.left = `${left}px`;
    menu.style.minWidth = `${w}px`;
    menu.style.top = below < h + 12 && rect.top > below ? `${rect.top - h - 4}px` : `${rect.bottom + 4}px`;
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setHi(Math.max(0, options.findIndex((o) => o.value === current)));
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (hi >= 0) pick(options[hi].value); }
    else if (e.key === 'Tab') setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{label}</label>}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { setHi(Math.max(0, options.findIndex((o) => o.value === current))); setOpen((o) => !o); }}
        onKeyDown={onKeyDown}
        className={`enroll-dd ${error ? 'enroll-dd-error' : ''} ${open ? 'enroll-dd-open' : ''} ${className}`}
      >
        <span className={`truncate ${selected ? '' : 'enroll-dd-placeholder'}`}>{selected?.label ?? placeholder ?? 'Select…'}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="font-wp fixed z-[9999] bg-white border rounded-2xl overflow-hidden py-1"
          style={{ borderColor: '#E3EFC8', boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
        >
          <div className="max-h-64 overflow-y-auto">
            {options.map((opt, i) => {
              const isSel = opt.value === current;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(opt.value)}
                  className={`w-full text-left px-3 py-[6px] text-[12.5px] font-medium flex items-center gap-2 transition-colors duration-100 cursor-pointer ${
                    isSel ? 'text-[#3F6212] bg-[#F1F8E2]' : i === hi ? 'text-[#3F6212] bg-[#F9FCF1]' : 'text-[#4B5068]'
                  }`}
                >
                  <span className="w-3 h-3 flex items-center justify-center shrink-0">
                    {isSel && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

interface YearWarningModalProps {
  studentName: string;
  selectedYear: string;
  conflictRecord: Student;
  onProceed: () => void;
  onEdit: () => void;
}

interface DuplicateWarningModalProps {
  type: 'same-year' | 'too-many-years';
  match: Student;
  allMatches: Student[];
  onContinue: () => void;
  onReset: () => void;
}

function DuplicateWarningModal({ type, match, allMatches, onContinue, onReset }: DuplicateWarningModalProps) {
  const distinctYears = [...new Set(allMatches.map((s) => s.academicYear))].sort();
  return (
    <ModalShell
      tone="rose"
      title="Possible Duplicate Entry"
      icon={WARN_ICON}
      footer={
        <>
          <button type="button" onClick={onReset} className={PILL_BTN}>Reset Fields</button>
          <button type="button" onClick={onContinue} className={GRAD_BTN} style={GRAD_STYLE}>Continue Anyway</button>
        </>
      }
    >
      {type === 'same-year' ? (
        <>
          <p className="text-[13px] text-[#4B5068]">
            A student with the same name, father name, and mother name is already enrolled in{' '}
            <span className="font-medium text-[#262B35]">{match.academicYear}</span>:
          </p>
          <div className="rounded-xl px-4 py-3 border space-y-1" style={{ background: '#FFF5F7', borderColor: '#FECDD3' }}>
            <p className="text-[13px] font-medium" style={{ color: '#9F1239' }}>{match.studentNameSSLC}</p>
            <p className="text-[11.5px] text-[#5B6371]">Father: {match.fatherName} · Mother: {match.motherName}</p>
            <p className="text-[11.5px] text-[#5B6371]">{match.course} · {match.year} · {match.academicYear}</p>
            {match.meritNumber && (
              <p className="text-[11px] text-[#8A93A3] font-mono">Merit: {match.meritNumber} · Reg: {match.regNumber}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-[#4B5068]">
            This student already has enrollment records across{' '}
            <span className="font-medium text-[#262B35]">{distinctYears.length} academic year{distinctYears.length !== 1 ? 's' : ''}</span>.
            Students can only be enrolled for a maximum of 3 academic years.
          </p>
          <div className="rounded-xl px-4 py-3 border space-y-2" style={{ background: '#FFF5F7', borderColor: '#FECDD3' }}>
            <p className="text-[13px] font-medium" style={{ color: '#9F1239' }}>{match.studentNameSSLC}</p>
            <p className="text-[11.5px] text-[#5B6371]">Father: {match.fatherName} · Mother: {match.motherName}</p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {distinctYears.map((yr) => (
                <span key={yr} className="text-[10.5px] font-medium px-2.5 py-1 rounded-full border border-[#E11D48]/45 bg-[#E11D48]/[0.07] text-[#9F1239] leading-none">{yr}</span>
              ))}
            </div>
          </div>
        </>
      )}
      <p className="text-[13px] text-[#4B5068]">
        Do you want to continue with this entry, or reset the name fields to start over?
      </p>
    </ModalShell>
  );
}

function YearWarningModal({ studentName, selectedYear, conflictRecord, onProceed, onEdit }: YearWarningModalProps) {
  return (
    <ModalShell
      tone="amber"
      title="Year Conflict Detected"
      icon={WARN_ICON}
      footer={
        <>
          <button type="button" onClick={onEdit} className={PILL_BTN}>Edit Year</button>
          <button type="button" onClick={onProceed} className={GRAD_BTN} style={GRAD_STYLE}>Proceed Anyway</button>
        </>
      }
    >
      <p className="text-[13px] text-[#4B5068]">
        <span className="font-medium text-[#262B35]">{studentName}</span> was already enrolled as{' '}
        <span className="font-medium text-amber-700">{conflictRecord.year}</span> in{' '}
        <span className="font-medium text-amber-700">{conflictRecord.academicYear}</span>.
      </p>
      <p className="text-[13px] text-[#4B5068]">
        Saving as <span className="font-medium text-[#262B35]">{selectedYear}</span> again may indicate the student
        was <span className="font-medium text-red-600">not promoted</span>. Do you want to proceed,
        or go back and edit the year?
      </p>
    </ModalShell>
  );
}

const COURSE_LABEL: Record<string, string> = {
  CE: 'CE - Civil Engineering',
  ME: 'ME - Mechanical Engineering',
  EC: 'EC - Electronics & Communication',
  CS: 'CS - Computer Science',
  EE: 'EE - Electrical Engineering',
};

interface EnrollmentPreviewProps {
  form: StudentFormData;
  saving: boolean;
  errorMsg: string;
  onConfirm: () => void;
  onEdit: () => void;
}

function PreviewRow({ label, value, required }: { label: string; value: string | number; required?: boolean }) {
  const display = value === '' || value === 0 || value === null || value === undefined
    ? null
    : String(value);
  const isPct = /Percentage$/.test(label);
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5 border-b border-[#EEF6DC] last:border-0">
      <dt className="text-[11.5px] text-[#8A93A3] font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-[#E11D48]">*</span>}
      </dt>
      <dd className={`text-[12px] font-medium ${display ? 'text-[#262B35]' : 'text-[#C4C8D0]'}`}>
        {display && isPct ? (
          <span className="inline-flex items-center rounded-full border border-[#65A30D]/45 bg-[#65A30D]/[0.07] px-2 py-[2px] text-[11px] text-[#3F6212]">{display}</span>
        ) : (display ?? '—')}
      </dd>
    </div>
  );
}

function PreviewCard({ idx, children }: { idx: number; children: React.ReactNode }) {
  const sec = ENROLL_SECTIONS[idx];
  return (
    <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: ROSE_HAIR }}>
      <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: '#EEF6DC', background: `${sec.color}0D` }}>
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-medium text-white" style={{ background: sec.color }}>{sec.n}</span>
        <h3 className="text-[11px] font-medium uppercase tracking-[0.6px]" style={{ color: inkOf(sec.color) }}>{sec.title === 'SSLC Marks' ? 'SSLC Marks' : sec.title}</h3>
      </div>
      <dl className="px-4 py-1">{children}</dl>
    </section>
  );
}

function EnrollmentPreview({ form, saving, errorMsg, onConfirm, onEdit }: EnrollmentPreviewProps) {
  return (
    <div className="font-wp fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-2xl my-8 overflow-hidden" style={{ borderColor: ROSE_HAIR, animation: 'modal-enter 0.22s ease-out' }}>
        {/* Header */}
        <div className="px-5 py-3.5" style={{ background: `linear-gradient(135deg, ${ROSE}, ${ROSE_INK})` }}>
          <h2 className="text-[14px] font-bold text-white flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/20 ring-1 ring-white/40 text-[12px] font-medium">
              {(form.studentNameSSLC || '?').charAt(0)}
            </span>
            Review Enrollment Details
          </h2>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {form.studentNameSSLC && <span className="text-[11.5px] font-medium text-white/95">{form.studentNameSSLC}</span>}
            {form.course && <span className="rounded-full border border-white/50 bg-white/15 px-2 py-[3px] text-[10.5px] font-medium text-white leading-none">{form.course}</span>}
            {form.year && <span className="rounded-full border border-white/50 bg-white/15 px-2 py-[3px] text-[10.5px] font-medium text-white leading-none">{form.year}</span>}
            {form.academicYear && <span className="rounded-full border border-white/50 bg-white/15 px-2 py-[3px] text-[10.5px] font-medium text-white leading-none">{form.academicYear}</span>}
          </div>
        </div>
        <div className="px-5 py-2 border-b text-[11.5px] text-[#3F6212] font-medium" style={{ background: '#F9FCF1', borderColor: ROSE_HAIR }}>
          Please verify all details before confirming. Fields marked <span className="text-[#E11D48] font-bold">*</span> are mandatory.
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[62vh] overflow-y-auto" style={{ background: 'linear-gradient(160deg, #FDFEF9, #F9FCF1)' }}>
          {/* Personal Information */}
          <PreviewCard idx={0}>
            <PreviewRow label="Name (SSLC)" value={form.studentNameSSLC} required />
            <PreviewRow label="Name (Aadhar)" value={form.studentNameAadhar} required />
            <PreviewRow label="Father Name" value={form.fatherName} />
            <PreviewRow label="Mother Name" value={form.motherName} />
            <PreviewRow label="Date of Birth" value={form.dateOfBirth} />
            <PreviewRow label="Gender" value={form.gender} required />
            <PreviewRow label="Religion" value={form.religion} required />
            <PreviewRow label="Caste" value={form.caste} />
            <PreviewRow label="Category" value={form.category} />
            <PreviewRow label="Annual Income" value={form.annualIncome > 0 ? `₹ ${form.annualIncome.toLocaleString()}` : ''} />
            <PreviewRow label="Aadhar Number" value={form.aadharNumber} />
            <PreviewRow label="APAAR ID" value={form.apaarId} />
          </PreviewCard>

          {/* Contact */}
          <PreviewCard idx={1}>
            <PreviewRow label="Father Mobile" value={form.fatherMobile} />
            <PreviewRow label="Student Mobile" value={form.studentMobile} />
            <PreviewRow label="Address" value={form.address} />
            <PreviewRow label="Town / City" value={form.town} />
            <PreviewRow label="Taluk" value={form.taluk} />
            <PreviewRow label="District" value={form.district} />
          </PreviewCard>

          {/* SSLC Marks */}
          <PreviewCard idx={2}>
            <PreviewRow label="10th Board" value={form.tenthBoard} />
            <PreviewRow label="Prior Qualification" value={form.priorQualification} />
            {form.priorQualification === 'PUC' && (
              <>
                <PreviewRow label="PUC Max Total" value={form.pucMaxTotal} />
                <PreviewRow label="PUC Obtained Total" value={form.pucObtainedTotal} />
                <PreviewRow label="PUC Percentage" value={(form.pucMaxTotal ?? 0) > 0 ? `${(((form.pucObtainedTotal ?? 0) / form.pucMaxTotal) * 100).toFixed(2)}%` : ''} />
              </>
            )}
            {form.priorQualification === 'ITI' && (
              <>
                <PreviewRow label="ITI Max Total" value={form.itiMaxTotal} />
                <PreviewRow label="ITI Obtained Total" value={form.itiObtainedTotal} />
                <PreviewRow label="ITI Percentage" value={(form.itiMaxTotal ?? 0) > 0 ? `${(((form.itiObtainedTotal ?? 0) / form.itiMaxTotal) * 100).toFixed(2)}%` : ''} />
              </>
            )}
            <PreviewRow label="SSLC Max Total" value={form.sslcMaxTotal} />
            <PreviewRow label="SSLC Obtained Total" value={form.sslcObtainedTotal} />
            <PreviewRow
              label="SSLC Percentage"
              value={form.sslcMaxTotal > 0 ? `${((form.sslcObtainedTotal / form.sslcMaxTotal) * 100).toFixed(2)}%` : ''}
            />
            <PreviewRow label="Science Max" value={form.scienceMax} />
            <PreviewRow label="Science Obtained" value={form.scienceObtained} />
            <PreviewRow label="Maths Max" value={form.mathsMax} />
            <PreviewRow label="Maths Obtained" value={form.mathsObtained} />
            <PreviewRow label="Maths + Science Max Total" value={form.mathsScienceMaxTotal} />
            <PreviewRow label="Maths + Science Obtained Total" value={form.mathsScienceObtainedTotal} />
          </PreviewCard>

          {/* Enrollment Details */}
          <PreviewCard idx={3}>
            <PreviewRow label="Course" value={COURSE_LABEL[form.course] ?? form.course} required />
            <PreviewRow label="Year" value={form.year} required />
            <PreviewRow label="Adm Type" value={form.admType} required />
            <PreviewRow label="Adm Cat" value={form.admCat} required />
            <PreviewRow label="Academic Year" value={form.academicYear} required />
            <PreviewRow label="Admission Status" value={form.admissionStatus} required />
            <PreviewRow label="Enrollment Date" value={form.enrollmentDate} />
            <PreviewRow label="Application No" value={form.applicationNumber} />
            <PreviewRow label="Reg Number" value={form.regNumber} />
          </PreviewCard>
        </div>

        {errorMsg && (
          <div className="mx-5 mb-3 text-[13px] font-medium text-[#BE123C] bg-[#FFF1F2] rounded-xl px-4 py-3 border border-[#FECDD3]">
            {errorMsg}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t flex gap-2 justify-end" style={{ borderColor: ROSE_HAIR, background: '#F9FCF1' }}>
          <button type="button" onClick={onEdit} disabled={saving} className={PILL_BTN}>
            Edit Details
          </button>
          <button type="button" onClick={onConfirm} disabled={saving} className={GRAD_BTN} style={GRAD_STYLE}>
            {saving && <Spinner />}
            Confirm &amp; Enroll
          </button>
        </div>
      </div>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  studentNameSSLC:      'Name (SSLC)',
  studentNameAadhar:    'Name (Aadhar)',
  fatherName:           'Father Name',
  motherName:           'Mother Name',
  gender:               'Gender',
  religion:             'Religion',
  dateOfBirth:          'Date of Birth',
  course:               'Course',
  year:                 'Year',
  admType:              'Adm Type',
  admCat:               'Adm Cat',
  academicYear:         'Academic Year',
  admissionStatus:      'Status',
  fatherMobile:         'Father Mobile',
  studentMobile:        'Student Mobile',
  sslcMaxTotal:         'SSLC Max',
  sslcObtainedTotal:    'SSLC Obtained',
  scienceMax:           'Science Max',
  scienceObtained:      'Science Obt.',
  mathsMax:             'Maths Max',
  mathsObtained:        'Maths Obt.',
  town:                 'Town',
  taluk:                'Taluk',
  district:             'District',
  pucMaxTotal:          'PUC Max Total',
  pucObtainedTotal:     'PUC Obtained Total',
  pucPercentage:        'PUC %',
  itiMaxTotal:          'ITI Max Total',
  itiObtainedTotal:     'ITI Obtained Total',
  itiPercentage:        'ITI %',
  itiPucCombination:    'PUC Combination / ITI Trade',
  caste:                'Caste',
  category:             'Category',
  address:              'Address',
  regNumber:            'Reg No',
  applicationNumber:    'Application No',
  aadharNumber:         'Aadhar Number',
  apaarId:              'APAAR ID',
};

function emptyForm(defaultYear?: AcademicYear): StudentFormData {
  return {
    studentNameSSLC: '',
    studentNameAadhar: '',
    fatherName: '',
    motherName: '',
    dateOfBirth: '',
    gender: '' as Gender,
    religion: '' as Religion,
    caste: '',
    category: 'GM' as Category,
    tenthBoard: 'SSLC' as TenthBoard,
    priorQualification: 'NONE' as PriorQualification,
    sslcMaxTotal: 625,
    sslcObtainedTotal: 0,
    scienceMax: 100,
    scienceObtained: 0,
    mathsMax: 100,
    mathsObtained: 0,
    mathsScienceMaxTotal: 200,
    mathsScienceObtainedTotal: 0,
    annualIncome: 0,
    address: '',
    town: '',
    taluk: '',
    district: '',
    pucMaxTotal: 0,
    pucObtainedTotal: 0,
    pucPercentage: 0,
    itiMaxTotal: 0,
    itiObtainedTotal: 0,
    itiPercentage: 0,
    itiPucCombination: '',
    fatherMobile: '',
    studentMobile: '',
    course: '' as Course,
    year: '' as Year,
    admType: 'REGULAR' as AdmType,
    admCat: 'GM' as AdmCat,
    academicYear: defaultYear ?? ('' as AcademicYear),
    admissionStatus: 'PENDING',
    enrollmentDate: new Date().toISOString().slice(0, 10),
    applicationNumber: '',
    meritNumber: '',
    regNumber: '',
    aadharNumber: '',
    apaarId: '',
    transferredIn: false,
    transferInPolytechnic: '',
  };
}

export function EnrollStudent() {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const fromDashboard = searchParams.get('from') === 'dashboard';
  const backTo = fromDashboard ? '/dashboard' : '/students';
  const backLabel = fromDashboard ? 'Back to Dashboard' : 'Back to Students';
  const navigate = useNavigate();
  const location = useLocation();
  const navStudent = (location.state as { student?: Student } | null)?.student ?? null;
  const reEnrollStudent = (location.state as { reEnrollStudent?: Student } | null)?.reEnrollStudent ?? null;
  const reEnrollTargetYear = (location.state as { targetYear?: Year } | null)?.targetYear ?? null;
  const reEnrollAcademicYear = (location.state as { targetAcademicYear?: AcademicYear } | null)?.targetAcademicYear ?? null;
  const { settings } = useSettings();

  const [form, setForm] = useState<StudentFormData>(emptyForm());
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [editOriginalYear, setEditOriginalYear] = useState<{ year: string; academicYear: string } | null>(null);
  const [editOriginalAdmCat, setEditOriginalAdmCat] = useState<AdmCat | null>(null);
  const [editOriginalCourse, setEditOriginalCourse] = useState<string | null>(null);
  const [editOriginalProfile, setEditOriginalProfile] = useState<{ studentNameSSLC: string; fatherName: string; motherName: string } | null>(null);
  const [editOriginalFormData, setEditOriginalFormData] = useState<StudentFormData | null>(null);
  const [applyToAllYears, setApplyToAllYears] = useState(false);
  const [enrollmentHistory, setEnrollmentHistory] = useState<Student[]>([]);
  const [showYearWarning, setShowYearWarning] = useState(false);
  const [yearConflictRecord, setYearConflictRecord] = useState<Student | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Duplicate detection
  const allStudentsDupRef = useRef<Student[] | null>(null);
  const dupAcknowledgedRef = useRef<Set<string>>(new Set());
  interface DupWarning { type: 'same-year' | 'too-many-years'; match: Student; allMatches: Student[]; }
  const [dupWarning, setDupWarning] = useState<DupWarning | null>(null);

  // Caste autocomplete
  type CasteEntry = { caste: string; category: Category };
  const casteIndexRef = useRef<CasteEntry[] | null>(null);
  const casteSuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const casteLingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [casteSuggestions, setCasteSuggestions] = useState<CasteEntry[]>([]);
  const [casteOpen, setCasteOpen] = useState(false);
  const [casteHighlight, setCasteHighlight] = useState(-1);

  // Taluk autocomplete
  const talukSuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [talukSuggestions, setTalukSuggestions] = useState<string[]>([]);
  const [talukOpen, setTalukOpen] = useState(false);
  const [talukHighlight, setTalukHighlight] = useState(-1);

  // Annual income: raw digit string is source of truth for the formatted display
  const [incomeRaw, setIncomeRaw] = useState(
    form.annualIncome > 0 ? String(form.annualIncome) : ''
  );
  // Sync rawDigits when form resets or loads (edit mode)
  useEffect(() => {
    setIncomeRaw(form.annualIncome > 0 ? String(form.annualIncome) : '');
  }, [form.annualIncome]);
  const incomeDisplay = incomeRaw
    ? parseInt(incomeRaw, 10).toLocaleString('en-IN')
    : '';

  async function loadCasteIndex() {
    if (casteIndexRef.current !== null) return;
    const all = await getAllStudents();
    all.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    const seen = new Set<string>();
    const index: CasteEntry[] = [];
    for (const s of all) {
      const key = s.caste?.trim().toUpperCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        index.push({ caste: key, category: s.category });
      }
    }
    casteIndexRef.current = index;
  }

  function handleCasteChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase();
    handleFieldChange('caste', val);
    setCasteHighlight(-1);
    if (casteSuggestTimer.current) clearTimeout(casteSuggestTimer.current);
    if (casteLingerTimer.current) clearTimeout(casteLingerTimer.current);
    if (!val.trim()) { setCasteSuggestions([]); setCasteOpen(false); return; }
    casteSuggestTimer.current = setTimeout(() => {
      const q = val.trim();
      const index = casteIndexRef.current;
      if (!index) { setCasteSuggestions([]); return; }
      const matches = index.filter(item => item.caste.includes(q)).slice(0, 3);
      setCasteSuggestions(matches);
      if (matches.length > 0) {
        setCasteOpen(true);
        casteLingerTimer.current = setTimeout(() => setCasteOpen(false), 10000);
      } else {
        setCasteOpen(false);
      }
    }, 150);
  }

  function handleCastePick(item: CasteEntry) {
    if (casteLingerTimer.current) clearTimeout(casteLingerTimer.current);
    handleFieldChange('caste', item.caste);
    handleFieldChange('category', item.category);
    setCasteSuggestions([]);
    setCasteOpen(false);
    setCasteHighlight(-1);
  }

  function handleCasteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!casteOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCasteHighlight(h => Math.min(h + 1, casteSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCasteHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      const idx = casteHighlight >= 0 ? casteHighlight : 0;
      if (casteSuggestions[idx]) {
        e.preventDefault();
        handleCastePick(casteSuggestions[idx]);
      }
    } else if (e.key === 'Escape') {
      setCasteOpen(false);
    }
  }

  function handleTalukChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase();
    handleFieldChange('taluk', val);
    setTalukHighlight(-1);
    if (talukSuggestTimer.current) clearTimeout(talukSuggestTimer.current);
    if (!val.trim()) { setTalukSuggestions([]); setTalukOpen(false); return; }
    talukSuggestTimer.current = setTimeout(() => {
      const q = val.trim();
      const matches = KARNATAKA_TALUKS.filter(t => t.startsWith(q) && t !== q).slice(0, 8);
      setTalukSuggestions(matches);
      setTalukOpen(matches.length > 0);
    }, 100);
  }

  function handleTalukPick(taluk: string) {
    handleFieldChange('taluk', taluk);
    const district = KARNATAKA_TALUK_DISTRICT[taluk] ?? '';
    handleFieldChange('district', district);
    setTalukSuggestions([]);
    setTalukOpen(false);
    setTalukHighlight(-1);
  }

  function handleTalukKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!talukOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTalukHighlight(h => Math.min(h + 1, talukSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTalukHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      const idx = talukHighlight >= 0 ? talukHighlight : 0;
      if (talukSuggestions[idx]) {
        e.preventDefault();
        handleTalukPick(talukSuggestions[idx]);
      }
    } else if (e.key === 'Escape') {
      setTalukOpen(false);
    }
  }

  // Re-enroll from previous year
  const [reEnrollOpen, setReEnrollOpen] = useState(false);
  const [prevQuery, setPrevQuery] = useState('');
  const [prevResults, setPrevResults] = useState<Student[]>([]);
  const [prevSearching, setPrevSearching] = useState(false);
  const [prevSourceStudent, setPrevSourceStudent] = useState<Student | null>(null);
  const prevStudentsCache = useRef<Student[] | null>(null);

  // In edit mode: merge live-computed warnings with any blocking errors from submit attempt.
  // Warnings show red but don't block save; blocking errors (mandatory fields) take priority.
  const displayErrors = useMemo<ValidationErrors>(() => {
    if (!editId) return errors;
    const { warnings } = validateStudentFormEdit(form);
    return { ...warnings, ...errors };
  }, [editId, form, errors]);


  // Pre-fill form from dashboard "Re-Enroll" context menu action
  useEffect(() => {
    if (!reEnrollStudent || !reEnrollTargetYear || !reEnrollAcademicYear) return;
    const { id: _id, createdAt: _c, updatedAt: _u,
            meritNumber: _m, applicationNumber: _a,
            allottedCategory: _ac, ...rest } = reEnrollStudent;
    const dob = rest.dateOfBirth?.match(/^\d{4}-\d{2}-\d{2}$/)
      ? rest.dateOfBirth.split('-').reverse().join('/')
      : rest.dateOfBirth;
    setForm((prev) => ({
      ...prev,
      ...rest,
      dateOfBirth: dob,
      year: reEnrollTargetYear,
      academicYear: reEnrollAcademicYear,
      admissionStatus: 'CONFIRMED',
      enrollmentDate: new Date().toISOString().slice(0, 10),
      applicationNumber: '',
      meritNumber: '',
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editId && !reEnrollStudent && settings?.currentAcademicYear) {
      setForm((prev) => ({ ...prev, academicYear: settings.currentAcademicYear }));
    }
  }, [settings, editId]);

  // Pre-fill from inquiry walk-in (set by Inquiries page via sessionStorage)
  useEffect(() => {
    if (editId) return;
    const raw = sessionStorage.getItem('smp_inquiry_prefill');
    if (!raw) return;
    sessionStorage.removeItem('smp_inquiry_prefill');
    try {
      const prefill = JSON.parse(raw) as {
        studentName: string;
        mobile: string;
        address: string;
        course: string;
      };
      setForm((prev) => ({
        ...prev,
        studentNameSSLC: prefill.studentName ?? prev.studentNameSSLC,
        studentMobile: prefill.mobile ?? prev.studentMobile,
        address: prefill.address ?? prev.address,
        course: (prefill.course as import('../types').Course) || prev.course,
      }));
    } catch {
      // malformed sessionStorage entry — ignore
    }
  // Run once on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-preview unique default reg number for new enrollments.
  // Runs whenever course / year / academicYear change.
  // Skipped in edit mode or when using the "re-enroll from previous year" flow
  // (the previous student's reg number is preserved in those cases).
  // Only overwrites the field when it is empty, holds the old default (e.g. "308CE"),
  // or already shows a previous auto-preview — any manually typed custom value is kept.
  useEffect(() => {
    if (editId) return;
    if (prevSourceStudent) return; // re-enroll: preserve previous reg number
    const { course, year, academicYear } = form;
    if (!course || !year || !academicYear) return;

    const isAutoFillable =
      !form.regNumber ||
      form.regNumber === `308${course}` ||
      /^\d(CE|ME|EC|CS|EE)308\d{5}$/.test(form.regNumber);
    if (!isAutoFillable) return;

    let cancelled = false;
    peekNextDefaultRegNumber(academicYear as import('../types').AcademicYear, course as import('../types').Course, year as import('../types').Year)
      .then((preview) => {
        if (cancelled) return;
        setForm((prev) => {
          const stillAutoFillable =
            !prev.regNumber ||
            prev.regNumber === `308${prev.course}` ||
            /^\d(CE|ME|EC|CS|EE)308\d{5}$/.test(prev.regNumber);
          if (!stillAutoFillable) return prev;
          return { ...prev, regNumber: preview };
        });
      })
      .catch(() => {}); // network errors are silently ignored; regNumber stays as-is
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.course, form.year, form.academicYear, editId, prevSourceStudent]);

  // Auto-preview application number for new enrollments.
  // Application number is always auto-generated (not editable), per (academicYear, course).
  useEffect(() => {
    if (editId) return;
    const { course, academicYear } = form;
    if (!course || !academicYear) return;

    let cancelled = false;
    peekNextDefaultAppNumber(academicYear as import('../types').AcademicYear, course as import('../types').Course)
      .then((preview) => {
        if (cancelled) return;
        setForm((prev) => ({ ...prev, applicationNumber: preview }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.course, form.academicYear, editId]);

  // Debounced search across previous-year students
  useEffect(() => {
    if (editId) return;
    const trimmed = prevQuery.trim();
    if (trimmed.length < 2) {
      setPrevResults([]);
      setPrevSearching(false);
      return;
    }
    // Clear stale results immediately so the list doesn't freeze on old data
    setPrevResults([]);
    setPrevSearching(true);
    const timer = setTimeout(async () => {
      try {
        if (prevStudentsCache.current === null) {
          const all = await getAllStudents();
          prevStudentsCache.current = settings?.currentAcademicYear
            ? all.filter((s) => s.academicYear !== settings.currentAcademicYear)
            : all;
        }
        const q = trimmed.toUpperCase();
        const results = prevStudentsCache.current
          .filter(
            (s) =>
              s.studentNameSSLC.toUpperCase().includes(q) ||
              s.regNumber.toUpperCase().includes(q)
          )
          .slice(0, 8);
        setPrevResults(results);
      } catch {
        setPrevResults([]);
      } finally {
        setPrevSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [prevQuery, editId, settings?.currentAcademicYear]);

  // Debounced duplicate check: fires when name + father + mother all have ≥3 chars (add mode only)
  useEffect(() => {
    if (editId) return;
    const name       = form.studentNameSSLC.trim();
    const father     = form.fatherName.trim();
    const mother     = form.motherName.trim();
    const targetYear = form.academicYear;
    if (name.length < 3 || father.length < 3 || mother.length < 3) return;
    const key = `${name.toUpperCase()}__${father.toUpperCase()}__${mother.toUpperCase()}`;
    if (dupAcknowledgedRef.current.has(key)) return;

    const timer = setTimeout(async () => {
      try {
        if (allStudentsDupRef.current === null) {
          allStudentsDupRef.current = await getAllStudents();
        }
        const allMatches = allStudentsDupRef.current.filter(
          (s) =>
            s.studentNameSSLC.trim().toUpperCase() === name.toUpperCase() &&
            s.fatherName.trim().toUpperCase() === father.toUpperCase() &&
            s.motherName.trim().toUpperCase() === mother.toUpperCase()
        );
        if (allMatches.length === 0) return;

        // Priority 1: already enrolled in the same academic year → true duplicate
        const sameYearMatch = targetYear
          ? (allMatches.find((s) => s.academicYear === targetYear) ?? null)
          : null;
        if (sameYearMatch) {
          setDupWarning({ type: 'same-year', match: sameYearMatch, allMatches });
          return;
        }

        // Priority 2: enrolled across 3+ distinct academic years → exceeds maximum
        const distinctYears = new Set(allMatches.map((s) => s.academicYear));
        if (distinctYears.size >= 3) {
          setDupWarning({ type: 'too-many-years', match: allMatches[0], allMatches });
        }
      } catch {
        // silently ignore
      }
    }, 700);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.studentNameSSLC, form.fatherName, form.motherName, form.academicYear, editId]);

  useEffect(() => {
    if (!editId) return;

    function applyStudentData(student: Student) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, createdAt: _c, updatedAt: _u, motherMobile: _mm, ...rest } = student as Student & { motherMobile?: string };
      if (rest.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(rest.dateOfBirth)) {
        const [y, m, d] = rest.dateOfBirth.split('-');
        rest.dateOfBirth = `${d}/${m}/${y}`;
      }
      const formData = rest as StudentFormData;
      if (!formData.meritNumber) formData.meritNumber = '';
      if (!formData.regNumber) formData.regNumber = formData.course ? `308${formData.course}` : '';
      if (!formData.admType) formData.admType = 'REGULAR';
      if (!formData.admCat) formData.admCat = 'GM';
      if (!formData.enrollmentDate) formData.enrollmentDate = new Date().toISOString().slice(0, 10);
      setForm(formData);
      setEditOriginalYear({ year: formData.year, academicYear: formData.academicYear });
      setEditOriginalAdmCat(formData.admCat ?? null);
      setEditOriginalCourse(formData.course ?? null);
      setEditOriginalProfile({
        studentNameSSLC: formData.studentNameSSLC,
        fatherName: formData.fatherName,
        motherName: formData.motherName,
      });
      setEditOriginalFormData({ ...formData });
      setApplyToAllYears(false);
      getAllStudents().then((all) => {
        const history = all
          .filter((s) => {
            if (s.id === editId) return false;
            if (student.regNumber) {
              return s.regNumber?.toUpperCase() === student.regNumber.toUpperCase();
            }
            return s.studentNameSSLC.toUpperCase() === student.studentNameSSLC.toUpperCase();
          })
          .sort((a, b) => a.academicYear.localeCompare(b.academicYear));
        setEnrollmentHistory(history);
      }).catch(() => {});
    }

    // When navigated from Students page the student object is in router state —
    // use it immediately so the form renders without a Firestore round-trip.
    if (navStudent) {
      applyStudentData(navStudent);
      return;
    }

    // Fallback: direct URL navigation or browser refresh — fetch from Firestore.
    setLoadingEdit(true);
    getStudent(editId)
      .then((student) => {
        if (student) applyStudentData(student);
        else setErrorMsg('Student not found.');
      })
      .catch(() => setErrorMsg('Failed to load student data'))
      .finally(() => setLoadingEdit(false));
  }, [editId, navStudent]);

  function handleFieldChange(field: keyof StudentFormData, value: string | number) {
    setForm((prev) => {
      const updated: StudentFormData = { ...prev, [field]: value };
      const newScienceMax = field === 'scienceMax' ? Number(value) : Number(prev.scienceMax);
      const newMathsMax = field === 'mathsMax' ? Number(value) : Number(prev.mathsMax);
      const newScienceObtained =
        field === 'scienceObtained' ? Number(value) : Number(prev.scienceObtained);
      const newMathsObtained =
        field === 'mathsObtained' ? Number(value) : Number(prev.mathsObtained);

      if (['scienceMax', 'mathsMax'].includes(field as string)) {
        updated.mathsScienceMaxTotal = newScienceMax + newMathsMax;
      }
      if (['scienceObtained', 'mathsObtained'].includes(field as string)) {
        updated.mathsScienceObtainedTotal = newScienceObtained + newMathsObtained;
      }

      const newPucMax = field === 'pucMaxTotal' ? Number(value) : Number(prev.pucMaxTotal ?? 0);
      const newPucObtained = field === 'pucObtainedTotal' ? Number(value) : Number(prev.pucObtainedTotal ?? 0);
      const newItiMax = field === 'itiMaxTotal' ? Number(value) : Number(prev.itiMaxTotal ?? 0);
      const newItiObtained = field === 'itiObtainedTotal' ? Number(value) : Number(prev.itiObtainedTotal ?? 0);
      if (['pucMaxTotal', 'pucObtainedTotal'].includes(field as string)) {
        updated.pucPercentage = newPucMax > 0 ? parseFloat(((newPucObtained / newPucMax) * 100).toFixed(2)) : 0;
      }
      if (['itiMaxTotal', 'itiObtainedTotal'].includes(field as string)) {
        updated.itiPercentage = newItiMax > 0 ? parseFloat(((newItiObtained / newItiMax) * 100).toFixed(2)) : 0;
      }

      if (field === 'priorQualification') {
        if (value === 'ITI' || value === 'PUC') {
          updated.year = '2ND YEAR';
          updated.admType = 'LATERAL';
        } else if (value === 'NONE') {
          updated.year = '' as Year;
          updated.admType = 'REGULAR';
        }
      }

      // "Transferred In" only applies to 2nd/3rd year — clear it if the year changes away from those
      if (field === 'year' && value !== '2ND YEAR' && value !== '3RD YEAR') {
        updated.transferredIn = false;
        updated.transferInPolytechnic = '';
      }

      // regNumber auto-preview is handled by a dedicated useEffect
      return updated;
    });

    setErrors((prev) => {
      const isMobile = field === 'fatherMobile' || field === 'studentMobile';
      if (!prev[field as string] && !(isMobile && (prev['fatherMobile'] || prev['studentMobile']))) return prev;
      const next = { ...prev };
      delete next[field as string];
      // Filling either mobile clears the "at least one required" error on both
      if (isMobile && String(value).trim()) {
        delete next['fatherMobile'];
        delete next['studentMobile'];
      }
      return next;
    });
  }

  function handleTextChange(field: keyof StudentFormData) {
    return (e: ChangeEvent<HTMLInputElement>) => handleFieldChange(field, e.target.value);
  }

  function handleNumberChange(field: keyof StudentFormData) {
    return (e: ChangeEvent<HTMLInputElement>) => handleFieldChange(field, Number(e.target.value));
  }

  function handleIncomeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.metaKey || e.ctrlKey || e.key === 'Tab' || e.key === 'Enter' || e.key.startsWith('Arrow') || e.key.startsWith('F')) return;
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const newRaw = incomeRaw + e.key;
      setIncomeRaw(newRaw);
      handleFieldChange('annualIncome', parseInt(newRaw, 10));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const newRaw = incomeRaw.slice(0, -1);
      setIncomeRaw(newRaw);
      handleFieldChange('annualIncome', newRaw ? parseInt(newRaw, 10) : 0);
    } else {
      e.preventDefault();
    }
  }

  function handleIncomePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
    if (digits) {
      setIncomeRaw(digits);
      handleFieldChange('annualIncome', parseInt(digits, 10));
    }
  }

  function handleSelectChange(field: keyof StudentFormData) {
    return (e: ChangeEvent<HTMLSelectElement>) => handleFieldChange(field, e.target.value);
  }

  function handlePrevStudentSelect(student: Student) {
    // Find the most recent enrollment for this student across all cached previous years
    const allRecords = (prevStudentsCache.current ?? []).filter((s) => {
      if (student.regNumber) {
        return s.regNumber?.toUpperCase() === student.regNumber.toUpperCase();
      }
      return s.studentNameSSLC.toUpperCase() === student.studentNameSSLC.toUpperCase();
    });
    const latest = allRecords.sort((a, b) => {
      const yearA = parseInt(a.academicYear.split('-')[0], 10);
      const yearB = parseInt(b.academicYear.split('-')[0], 10);
      return yearB - yearA;
    })[0] ?? student;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _c, updatedAt: _u, meritNumber: _m, applicationNumber: _an, ...rest } = latest;
    // Convert DOB from YYYY-MM-DD to DD/MM/YYYY if needed
    let dob = rest.dateOfBirth;
    if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      const [y, mo, d] = dob.split('-');
      dob = `${d}/${mo}/${y}`;
    }
    setForm({
      ...rest,
      dateOfBirth: dob,
      applicationNumber: '',
      meritNumber: '',
      admissionStatus: 'CONFIRMED',
      enrollmentDate: new Date().toISOString().slice(0, 10),
      academicYear: settings?.currentAcademicYear ?? ('' as AcademicYear),
    });
    setErrors({});
    setPrevSourceStudent(latest);
    setPrevQuery('');
    setPrevResults([]);
  }

  function handleClearPrevStudent() {
    setPrevSourceStudent(null);
    setForm(emptyForm(settings?.currentAcademicYear));
    setErrors({});
  }

  async function performSave() {
    setSaving(true);
    setErrorMsg('');
    try {
      // Duplicate guard: check if student already enrolled in the target academic year
      if (prevSourceStudent && form.academicYear) {
        const existing = await getStudentsByAcademicYear(form.academicYear as AcademicYear);
        const dup = existing.find((s) => {
          if (form.regNumber && s.regNumber) {
            return s.regNumber.toUpperCase() === form.regNumber.toUpperCase();
          }
          return s.studentNameSSLC.toUpperCase() === form.studentNameSSLC.toUpperCase();
        });
        if (dup) {
          setErrorMsg(
            `${form.studentNameSSLC} is already enrolled in ${form.academicYear} (Merit No: ${dup.meritNumber})`
          );
          return;
        }
      }
      if (editId) {
        await updateStudent(editId, form);
        // If course or year changed, update existing fee records to carry the new values
        if (
          editOriginalCourse !== null &&
          (form.course !== editOriginalCourse || form.year !== editOriginalYear?.year)
        ) {
          await applyCourseYearUpdate(
            editId,
            form.academicYear,
            editOriginalCourse as import('../types').Course,
            editOriginalYear!.year as import('../types').Year,
            form.course,
            form.year,
          );
        }
        // If Adm Cat changed, adjust existing fee records to reflect new structure
        if (editOriginalAdmCat && form.admCat !== editOriginalAdmCat) {
          await applyAdmCatFeeAdjustment(
            editId,
            form.academicYear,
            editOriginalAdmCat,
            form.admCat,
          );
        }

        // If requested, copy the corrected physical-person fields onto this
        // student's other-year records too (course/year/fee-related fields are
        // never propagated — each year's enrollment stays independent).
        if (applyToAllYears && editOriginalFormData && enrollmentHistory.length > 0) {
          const changedFields: Partial<StudentFormData> = {};
          for (const field of CROSS_YEAR_PROPAGATABLE_FIELDS) {
            if (form[field] !== editOriginalFormData[field]) {
              (changedFields as Record<string, unknown>)[field] = form[field];
            }
          }
          if (Object.keys(changedFields).length > 0) {
            await Promise.all(
              enrollmentHistory.map((sibling) => updateStudentFields(sibling.id, changedFields))
            );
          }
        }

        // Notify the student of what changed, in a single summary notification
        if (user) {
          const changed: string[] = [];
          if (editOriginalProfile?.studentNameSSLC && editOriginalProfile.studentNameSSLC !== form.studentNameSSLC) changed.push('Name');
          if (editOriginalProfile?.fatherName && editOriginalProfile.fatherName !== form.fatherName) changed.push("Father's Name");
          if (editOriginalProfile?.motherName && editOriginalProfile.motherName !== form.motherName) changed.push("Mother's Name");
          if (editOriginalCourse !== null && form.course !== editOriginalCourse) changed.push('Course');
          if (editOriginalYear && form.year !== editOriginalYear.year) changed.push('Study Year');
          if (editOriginalAdmCat && form.admCat !== editOriginalAdmCat) changed.push('Admission Category');
          if (changed.length > 0) {
            void createStudentNotification({
              studentId: editId,
              regNumber: form.regNumber,
              type: 'profile-updated',
              title: 'Your Profile Was Updated',
              message: `The office updated the following on your record: ${changed.join(', ')}.`,
              createdBy: user.uid,
            });
          }
        }

        navigate(backTo, { state: { updatedName: form.studentNameSSLC }, replace: true });
      } else {
        const { id: newStudentId, meritNumber, regNumber, applicationNumber } = await addStudent(form);
        allStudentsDupRef.current = null; // invalidate so next check sees the new entry
        const wasReEnroll = !!prevSourceStudent;
        const prevAllottedCategory = prevSourceStudent?.allottedCategory;
        setForm(emptyForm(settings?.currentAcademicYear));
        setPrevSourceStudent(null);
        setShowPreview(false);
        if (wasReEnroll) {
          if (prevAllottedCategory) {
            await updateStudentAllottedCategory(newStudentId, prevAllottedCategory);
          }
          navigate(fromDashboard ? '/fees' : '/students');
        } else {
          if (fromDashboard) {
            navigate('/fees');
          } else {
            setSuccessMsg(`Student enrolled successfully! App No: ${applicationNumber} · Merit No: ${meritNumber} · Reg No: ${regNumber}`);
            topRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save student');
    } finally {
      setSaving(false);
    }
  }

  function normalizeDOB(val: string): string {
    const parts = val.trim().split('/');
    if (parts.length !== 3) return val;
    const [rawD, rawM, rawY] = parts;
    if (!rawD || !rawM || !rawY) return val;
    const dd = rawD.padStart(2, '0');
    const mm = rawM.padStart(2, '0');
    const twoDigit = rawY.padStart(2, '0');
    const yyyy = rawY.length <= 2
      ? (parseInt(twoDigit, 10) >= 80 ? '19' : '20') + twoDigit
      : rawY;
    return `${dd}/${mm}/${yyyy}`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');
    if (editId) {
      // Edit mode: validate and save directly (no preview)
      const { errors: blockingErrors } = validateStudentFormEdit(form);
      if (Object.keys(blockingErrors).length > 0) {
        setErrors(blockingErrors);
        return;
      }
      setErrors({});
      // Warn if the year being saved matches a previous enrollment year
      const editConflict = enrollmentHistory.find((s) => s.year === form.year);
      if (editConflict) {
        setYearConflictRecord(editConflict);
        setShowYearWarning(true);
        return;
      }
      await performSave();
    } else {
      // New enrollment (manual or re-enroll): same mandatory fields for all paths
      const validationErrors = validateStudentForm(form);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      setErrors({});
      setShowPreview(true);
    }
  }

  // Called by the preview "Confirm & Enroll" button — checks year conflict for re-enroll before saving
  function handleConfirmEnroll() {
    if (prevSourceStudent && prevStudentsCache.current) {
      const prevRecords = prevStudentsCache.current.filter((s) => {
        if (prevSourceStudent.regNumber) {
          return s.regNumber?.toUpperCase() === prevSourceStudent.regNumber.toUpperCase();
        }
        return s.studentNameSSLC.toUpperCase() === form.studentNameSSLC.toUpperCase();
      });
      const conflict = prevRecords.find((s) => s.year === form.year);
      if (conflict) {
        setYearConflictRecord(conflict);
        setShowPreview(false);
        setShowYearWarning(true);
        return;
      }
    }
    void performSave();
  }

  // Disable main's own scroll so this page owns its scroll container.
  // Restored automatically on unmount (navigation away).
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    const prev = (main as HTMLElement).style.overflowY;
    (main as HTMLElement).style.overflowY = 'hidden';
    return () => { (main as HTMLElement).style.overflowY = prev; };
  }, []);

  if (loadingEdit) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading student data...</p>
      </div>
    );
  }

  return (
    <div
      className="font-wp enroll-skin -m-4 p-4 h-[calc(100%+2rem)] flex flex-col"
      style={{ background: 'linear-gradient(160deg, #F9FCF1 0%, #FDFEF9 45%, #F3F9E4 100%)', animation: 'page-enter 0.22s ease-out' }}
    >
      {/* ── Modal-style card ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 w-full max-w-6xl mx-auto flex flex-col bg-white rounded-2xl border shadow-xl overflow-hidden" style={{ borderColor: ROSE_HAIR }}>

      {/* Card header */}
      <div className="px-5 py-3.5 flex items-center gap-3 shrink-0 min-w-0" style={{ background: `linear-gradient(135deg, ${ROSE}, ${ROSE_INK})` }}>
        <h2 className="text-[14px] font-bold text-white flex items-center gap-2.5 shrink-0">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/20 ring-1 ring-white/40">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          </span>
          {editId ? 'Edit Student' : 'Enroll Student'}
        </h2>
        {form.academicYear && (
          <span className="rounded-full border border-white/50 bg-white/15 px-2.5 py-[4px] text-[10.5px] font-medium text-white leading-none whitespace-nowrap">
            {form.academicYear}
          </span>
        )}
        <button
          type="button"
          onClick={() => void navigate(backTo)}
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white/20 hover:bg-white/35 px-3.5 py-1.5 text-[11.5px] font-medium text-white transition-colors cursor-pointer"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          {backLabel}
        </button>
      </div>

      {/* ── Scrollable area ─────────────────────────────────────────────── */}
      <div ref={topRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-5 scroll-enroll" style={{ background: 'linear-gradient(160deg, #FDFEF9, #F9FCF1)' }}>

      {successMsg && (
        <p className="text-[13px] font-medium text-[#3F6212] bg-[#F1F8E2] border border-[#D5E6AE] rounded-xl px-4 py-3 mb-4">{successMsg}</p>
      )}
      {errorMsg && (
        <p className="text-[13px] font-medium text-[#BE123C] bg-[#FFF1F2] border border-[#FECDD3] rounded-xl px-4 py-3 mb-4">{errorMsg}</p>
      )}

      {/* Dashboard re-enroll info banner */}
      {reEnrollStudent && reEnrollTargetYear && reEnrollAcademicYear && (
        <div className="mb-4 px-4 py-2.5 rounded-xl border text-[13px] text-[#3F6212] flex items-center gap-2.5" style={{ background: '#F1F8E2', borderColor: '#D5E6AE' }}>
          <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: `linear-gradient(135deg, ${ROSE}, ${ROSE_INK})` }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
          </span>
          <span>
            Re-enrolling <span className="font-bold">{reEnrollStudent.studentNameSSLC}</span> for{' '}
            <span className="font-bold">{reEnrollTargetYear}</span> in{' '}
            <span className="font-bold">{reEnrollAcademicYear}</span>
          </span>
        </div>
      )}

      {/* Re-enroll banner — admin only */}
      {!editId && isAdmin && (
        <div className="bg-white rounded-2xl border mb-5" style={{ borderColor: ROSE_HAIR }}>
          <button
            type="button"
            onClick={() => setReEnrollOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0" style={{ background: `${ROSE}12`, borderColor: `${ROSE}40`, color: inkOf(ROSE) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              </span>
              <span className="text-[13px] font-medium" style={{ color: ROSE_INK }}>Re-enroll from Previous Year</span>
              {prevSourceStudent && (
                <span className="text-[12px] text-[#8A93A3] font-normal">
                  — {prevSourceStudent.studentNameSSLC}
                </span>
              )}
            </span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${reEnrollOpen || !!prevSourceStudent ? 'rotate-180' : ''}`}
              style={{ color: ROSE }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {(reEnrollOpen || !!prevSourceStudent) && (
            <div className="px-4 pb-4 border-t" style={{ borderColor: '#EEF6DC' }}>
              {prevSourceStudent ? (
                <div className="flex items-center gap-3 flex-wrap pt-3">
                  <p className="text-[13px] text-[#4B5068]">
                    Pre-filled from:{' '}
                    <span className="font-medium" style={{ color: ROSE_INK }}>{prevSourceStudent.studentNameSSLC}</span>
                    {' '}— {prevSourceStudent.course}, {prevSourceStudent.year},{' '}
                    {prevSourceStudent.academicYear}
                  </p>
                  <button
                    type="button"
                    onClick={handleClearPrevStudent}
                    className="inline-flex items-center gap-1 rounded-full bg-[#F97360]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#E2533F] hover:bg-[#F97360]/[0.16] cursor-pointer transition-colors"
                  >
                    Clear &amp; start fresh
                  </button>
                </div>
              ) : (
                <div className="relative pt-3">
                  <p className="text-[12px] text-[#8A93A3] mb-2">
                    Search by name or register number to pre-fill the form with an existing student's details.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={prevQuery}
                      onChange={(e) => setPrevQuery(e.target.value)}
                      placeholder="Type name or register number..."
                      className="block w-full max-w-md py-2"
                    />
                    <button
                      type="button"
                      onClick={() => { setForm(emptyForm(settings?.currentAcademicYear)); setErrors({}); setPrevQuery(''); if (casteLingerTimer.current) clearTimeout(casteLingerTimer.current); setCasteSuggestions([]); setCasteOpen(false); }}
                      className={`${PILL_BTN} flex-shrink-0`}
                    >
                      Reset Fields
                    </button>
                  </div>
                  {prevSearching && (
                    <p className="text-[12px] mt-1" style={{ color: ROSE }}>Searching...</p>
                  )}
                  {prevQuery.trim().length >= 2 && !prevSearching && prevResults.length === 0 && (
                    <p className="text-[12px] text-[#8A93A3] mt-1">No students found in previous years.</p>
                  )}
                  {prevResults.length > 0 && (
                    <ul className="absolute z-10 w-full max-w-md bg-white border rounded-xl shadow-lg mt-1 max-h-64 overflow-y-auto" style={{ borderColor: ROSE_HAIR }}>
                      {prevResults.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => handlePrevStudentSelect(s)}
                            className="w-full text-left px-4 py-2.5 hover:bg-[#F9FCF1] border-b border-[#EEF6DC] last:border-0 flex items-center gap-2.5 cursor-pointer"
                          >
                            <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-medium" style={{ background: 'linear-gradient(135deg, #D9F99D, #BEF264)', color: '#365314', boxShadow: '0 0 0 1px #fff, 0 0 0 2px #65A30D80' }}>
                              {s.studentNameSSLC.charAt(0)}
                            </span>
                            <span className="min-w-0">
                              <p className="text-[13px] font-medium" style={{ color: ROSE_INK }}>{s.studentNameSSLC}</p>
                              <p className="text-[11.5px] text-[#8A93A3]">
                                {s.course} · {s.year} · {s.academicYear}
                                {s.regNumber ? ` · ${s.regNumber}` : ''}
                              </p>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <form id="enroll-form" onSubmit={(e) => { void handleSubmit(e); }} className="space-y-6">

        {/* ── Personal Information ─────────────────────────────────────── */}
        <section className="" style={{ borderColor: '#E3EFC8' }}>
          <SectionLabel idx={0} />
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <Input
                  label="Name as per SSLC"
                  value={form.studentNameSSLC}
                  onChange={handleTextChange('studentNameSSLC')}
                  error={displayErrors['studentNameSSLC']}
                  uppercase
                  placeholder="STUDENT NAME (SSLC)"
                />
              </div>
              <div className="lg:col-span-2">
                <Input
                  label="Name as per Aadhar"
                  value={form.studentNameAadhar}
                  onChange={handleTextChange('studentNameAadhar')}
                  error={displayErrors['studentNameAadhar']}
                  uppercase
                  placeholder="STUDENT NAME (AADHAR)"
                />
              </div>
              <Input
                label="Father Name"
                value={form.fatherName}
                onChange={handleTextChange('fatherName')}
                error={displayErrors['fatherName']}
                uppercase
                placeholder="FATHER NAME"
              />
              <Input
                label="Mother Name"
                value={form.motherName}
                onChange={handleTextChange('motherName')}
                error={displayErrors['motherName']}
                uppercase
                placeholder="MOTHER NAME"
              />
              <Input
                label="Date of Birth"
                value={form.dateOfBirth}
                onChange={(e) => {
                  let val = e.target.value.replace(/[^\d/]/g, '');
                  const raw = val.replace(/\//g, '');
                  if (raw.length >= 3 && !val.includes('/')) {
                    val = raw.slice(0, 2) + '/' + raw.slice(2);
                  }
                  if (raw.length >= 5 && val.split('/').length < 3) {
                    const parts = val.split('/');
                    val = parts[0] + '/' + (parts[1] ?? '').slice(0, 2) + '/' + (parts[1] ?? '').slice(2) + (parts[2] ?? '');
                  }
                  if (val.length > 10) val = val.slice(0, 10);
                  handleFieldChange('dateOfBirth', val);
                }}
                onBlur={() => {
                  if (form.dateOfBirth) {
                    handleFieldChange('dateOfBirth', normalizeDOB(form.dateOfBirth));
                  }
                }}
                error={displayErrors['dateOfBirth']}
                placeholder="DD/MM/YYYY"
                maxLength={10}
              />
              <Select
                label="Gender"
                options={GENDER_OPTIONS}
                value={form.gender}
                onChange={handleSelectChange('gender')}
                error={displayErrors['gender']}
                placeholder="Select gender"
              />
              <Select
                label="Religion"
                options={RELIGION_OPTIONS}
                value={form.religion}
                onChange={handleSelectChange('religion')}
                error={displayErrors['religion']}
                placeholder="Select religion"
              />
              <div className="flex flex-col gap-1 relative">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Caste Name</label>
                <input
                  type="text"
                  value={form.caste}
                  onChange={handleCasteChange}
                  onKeyDown={handleCasteKeyDown}
                  onFocus={() => void loadCasteIndex()}
                  onBlur={() => { casteSuggestTimer.current && clearTimeout(casteSuggestTimer.current); casteLingerTimer.current && clearTimeout(casteLingerTimer.current); setCasteOpen(false); setCasteHighlight(-1); }}
                  placeholder="CASTE"
                  style={{ textTransform: 'uppercase' }}
                  className={`block w-full rounded-lg border px-3 py-2 text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors ${displayErrors['caste'] ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                />
                {displayErrors['caste'] && <p className="text-xs text-red-500 font-medium">{displayErrors['caste']}</p>}
                {casteOpen && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-white border border-[#D5E6AE] rounded-xl shadow-lg mt-0.5 overflow-hidden">
                    {casteSuggestions.map((item, idx) => (
                      <button
                        key={item.caste}
                        type="button"
                        onMouseDown={() => handleCastePick(item)}
                        className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center gap-2 ${idx === casteHighlight ? 'bg-[#F1F8E2] text-[#3F6212]' : 'hover:bg-[#F1F8E2] text-gray-800'}`}
                      >
                        <span className="font-medium">{item.caste}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{item.category}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Select
                label="Category"
                options={CATEGORY_OPTIONS}
                value={form.category}
                onChange={handleSelectChange('category')}
                error={displayErrors['category']}
              />
              <Input
                label="Annual Income (₹)"
                type="text"
                inputMode="numeric"
                value={incomeDisplay}
                onChange={() => {}}
                onKeyDown={handleIncomeKeyDown}
                onPaste={handleIncomePaste}
                error={displayErrors['annualIncome']}
                placeholder="0"
              />
              <div className="lg:col-span-2">
                <Input
                  label="Aadhar Number"
                  value={form.aadharNumber}
                  onChange={handleTextChange('aadharNumber')}
                  error={displayErrors['aadharNumber']}
                  placeholder="XXXX XXXX XXXX"
                  maxLength={14}
                />
              </div>
              <div className="lg:col-span-2">
                <Input
                  label="APAAR ID"
                  value={form.apaarId}
                  onChange={handleTextChange('apaarId')}
                  error={displayErrors['apaarId']}
                  placeholder="APAAR ID"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Contact Details ──────────────────────────────────────────── */}
        <section className="pt-6 border-t" style={{ borderColor: '#E3EFC8' }}>
          <SectionLabel idx={1} />
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <Input
                  label="Father Mobile"
                  value={form.fatherMobile}
                  onChange={handleTextChange('fatherMobile')}
                  error={displayErrors['fatherMobile']}
                  placeholder="9XXXXXXXXX"
                  maxLength={10}
                />
              </div>
              <div className="lg:col-span-2">
                <Input
                  label="Student Mobile"
                  value={form.studentMobile}
                  onChange={handleTextChange('studentMobile')}
                  error={displayErrors['studentMobile']}
                  placeholder="9XXXXXXXXX"
                  maxLength={10}
                />
              </div>
              <div className="lg:col-span-4">
                <Input
                  label="Address"
                  value={form.address}
                  onChange={handleTextChange('address')}
                  error={displayErrors['address']}
                  uppercase
                  placeholder="DOOR NO. / STREET / LOCALITY"
                />
              </div>
              <Input
                label="Town / City"
                value={form.town}
                onChange={handleTextChange('town')}
                error={displayErrors['town']}
                uppercase
                placeholder="TOWN / CITY"
              />
              <div className="flex flex-col gap-1 relative">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Taluk
                </label>
                <input
                  type="text"
                  value={form.taluk}
                  onChange={handleTalukChange}
                  onKeyDown={handleTalukKeyDown}
                  onBlur={() => { talukSuggestTimer.current && clearTimeout(talukSuggestTimer.current); setTalukOpen(false); setTalukHighlight(-1); }}
                  placeholder="TALUK"
                  style={{ textTransform: 'uppercase' }}
                  className={`block w-full rounded-lg border px-3 py-2 text-sm bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors ${displayErrors['taluk'] ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                />
                {displayErrors['taluk'] && <p className="text-xs text-red-500 font-medium">{displayErrors['taluk']}</p>}
                {talukOpen && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-white border border-[#D5E6AE] rounded-xl shadow-lg mt-0.5 overflow-hidden">
                    {talukSuggestions.map((taluk, idx) => (
                      <button
                        key={taluk}
                        type="button"
                        onMouseDown={() => handleTalukPick(taluk)}
                        className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center gap-2 ${idx === talukHighlight ? 'bg-[#F1F8E2] text-[#3F6212]' : 'hover:bg-[#F1F8E2] text-gray-800'}`}
                      >
                        <span className="font-medium">{taluk}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{KARNATAKA_TALUK_DISTRICT[taluk]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                label="District"
                value={form.district}
                onChange={handleTextChange('district')}
                error={displayErrors['district']}
                uppercase
                placeholder="AUTO-FILLED FROM TALUK"
              />
            </div>
          </div>
        </section>

        {/* ── SSLC Marks ───────────────────────────────────────────────── */}
        <section className="pt-6 border-t" style={{ borderColor: '#E3EFC8' }}>
          <SectionLabel idx={2} />
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <GroupLabel>Board &amp; prior qualification</GroupLabel>
              <div className="lg:col-span-2">
                <Select
                  label="10th Board"
                  options={TENTH_BOARD_OPTIONS}
                  value={form.tenthBoard}
                  onChange={handleSelectChange('tenthBoard')}
                />
              </div>
              <div className="lg:col-span-2">
                <Select
                  label="Prior Qualification"
                  options={PRIOR_QUALIFICATION_OPTIONS}
                  value={form.priorQualification}
                  onChange={handleSelectChange('priorQualification')}
                />
              </div>
              {form.priorQualification === 'PUC' && (
                <>
                  <div>
                    <Input
                      label="PUC Max Total"
                      type="number"
                      min={0}
                      value={form.pucMaxTotal || ''}
                      onChange={handleNumberChange('pucMaxTotal')}
                      error={displayErrors['pucMaxTotal']}
                      placeholder="e.g. 600"
                    />
                  </div>
                  <div>
                    <Input
                      label="PUC Obtained Total"
                      type="number"
                      min={0}
                      value={form.pucObtainedTotal || ''}
                      onChange={handleNumberChange('pucObtainedTotal')}
                      error={displayErrors['pucObtainedTotal']}
                      placeholder="e.g. 450"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider block mb-1">PUC Percentage</label>
                    <input
                      type="text"
                      readOnly
                      value={
                        (form.pucMaxTotal ?? 0) > 0
                          ? `${(((form.pucObtainedTotal ?? 0) / form.pucMaxTotal) * 100).toFixed(2)}%`
                          : '—'
                      }
                      className="block w-full rounded-md border border-amber-200 px-3 py-2 text-sm bg-amber-100/60 text-gray-600 cursor-not-allowed"
                    />
                  </div>
                </>
              )}
              {form.priorQualification === 'ITI' && (
                <>
                  <div>
                    <Input
                      label="ITI Max Total"
                      type="number"
                      min={0}
                      value={form.itiMaxTotal || ''}
                      onChange={handleNumberChange('itiMaxTotal')}
                      error={displayErrors['itiMaxTotal']}
                      placeholder="e.g. 1000"
                    />
                  </div>
                  <div>
                    <Input
                      label="ITI Obtained Total"
                      type="number"
                      min={0}
                      value={form.itiObtainedTotal || ''}
                      onChange={handleNumberChange('itiObtainedTotal')}
                      error={displayErrors['itiObtainedTotal']}
                      placeholder="e.g. 820"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider block mb-1">ITI Percentage</label>
                    <input
                      type="text"
                      readOnly
                      value={
                        (form.itiMaxTotal ?? 0) > 0
                          ? `${(((form.itiObtainedTotal ?? 0) / form.itiMaxTotal) * 100).toFixed(2)}%`
                          : '—'
                      }
                      className="block w-full rounded-md border border-amber-200 px-3 py-2 text-sm bg-amber-100/60 text-gray-600 cursor-not-allowed"
                    />
                  </div>
                </>
              )}
              {(form.priorQualification === 'ITI' || form.priorQualification === 'PUC') && (
                <div className="lg:col-span-4">
                  <Input
                    label={form.priorQualification === 'ITI' ? 'ITI Trade' : 'PUC Combination'}
                    uppercase
                    value={form.itiPucCombination || ''}
                    onChange={(e) => handleFieldChange('itiPucCombination', e.target.value)}
                    placeholder={form.priorQualification === 'ITI' ? 'e.g. ELECTRICIAN' : 'e.g. PCMB'}
                  />
                </div>
              )}
              <GroupLabel>SSLC totals</GroupLabel>
              <div className="lg:col-span-2">
                <Input
                  label="SSLC Max Total"
                  type="number"
                  min={0}
                  value={form.sslcMaxTotal}
                  onChange={handleNumberChange('sslcMaxTotal')}
                  error={displayErrors['sslcMaxTotal']}
                />
              </div>
              <div className="lg:col-span-2">
                <Input
                  label="SSLC Obtained Total"
                  type="number"
                  min={0}
                  value={form.sslcObtainedTotal}
                  onChange={handleNumberChange('sslcObtainedTotal')}
                  error={displayErrors['sslcObtainedTotal']}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider block mb-1">SSLC Percentage</label>
                <input
                  type="text"
                  readOnly
                  value={
                    form.sslcMaxTotal > 0
                      ? `${((form.sslcObtainedTotal / form.sslcMaxTotal) * 100).toFixed(2)}%`
                      : '—'
                  }
                  className="block w-full rounded-md border border-amber-200 px-3 py-2 text-sm bg-amber-100/60 text-gray-600 cursor-not-allowed"
                />
              </div>
              <GroupLabel>Subject marks (Maths &amp; Science)</GroupLabel>
              <Input
                label="Science Max"
                type="number"
                min={0}
                value={form.scienceMax}
                onChange={handleNumberChange('scienceMax')}
                error={displayErrors['scienceMax']}
                readOnly
                tabIndex={-1}
                className="bg-gray-100 text-gray-400 cursor-default select-none"
              />
              <Input
                label="Science Obtained"
                type="number"
                min={0}
                value={form.scienceObtained}
                onChange={handleNumberChange('scienceObtained')}
                error={displayErrors['scienceObtained']}
              />
              <Input
                label="Maths Max"
                type="number"
                min={0}
                value={form.mathsMax}
                onChange={handleNumberChange('mathsMax')}
                error={displayErrors['mathsMax']}
                readOnly
                tabIndex={-1}
                className="bg-gray-100 text-gray-400 cursor-default select-none"
              />
              <Input
                label="Maths Obtained"
                type="number"
                min={0}
                value={form.mathsObtained}
                onChange={handleNumberChange('mathsObtained')}
                error={displayErrors['mathsObtained']}
              />
              <div className="lg:col-span-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider block mb-1">
                  Maths + Science Max Total
                </label>
                <input
                  type="number"
                  readOnly
                  value={form.mathsScienceMaxTotal}
                  className="block w-full rounded-md border border-amber-200 px-3 py-2 text-sm bg-amber-100/60 text-gray-600 cursor-not-allowed"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider block mb-1">
                  Maths + Science Obtained Total
                </label>
                <input
                  type="number"
                  readOnly
                  value={form.mathsScienceObtainedTotal}
                  className="block w-full rounded-md border border-amber-200 px-3 py-2 text-sm bg-amber-100/60 text-gray-600 cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Enrollment Details ───────────────────────────────────────── */}
        <section className="pt-6 border-t" style={{ borderColor: '#E3EFC8' }}>
          <SectionLabel idx={3} />
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <GroupLabel>Course &amp; admission</GroupLabel>
              <div className="lg:col-span-2">
                <Select
                  label="Course"
                  options={COURSE_OPTIONS}
                  value={form.course}
                  onChange={handleSelectChange('course')}
                  error={displayErrors['course']}
                  placeholder="Select course"
                />
              </div>
              <div className="lg:col-span-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Year</span>
                    {prevSourceStudent && (
                      <span className="text-xs text-amber-600 font-medium">
                        Previously: {prevSourceStudent.year} ({prevSourceStudent.academicYear})
                      </span>
                    )}
                    {editId && editOriginalYear && (
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1 flex-wrap">
                        {enrollmentHistory.map((r) => (
                          <span key={r.id} className="flex items-center gap-1">
                            <span>{r.year} ({r.academicYear})</span>
                            <span className="text-gray-400">→</span>
                          </span>
                        ))}
                        <span>{editOriginalYear.year} ({editOriginalYear.academicYear})</span>
                      </span>
                    )}
                  </div>
                  <Select
                    options={YEAR_OPTIONS}
                    value={form.year}
                    onChange={handleSelectChange('year')}
                    error={displayErrors['year']}
                    placeholder="Select year"
                  />
                </div>
              </div>
              <Select
                label="Adm Type"
                options={ADM_TYPE_OPTIONS}
                value={form.admType}
                onChange={handleSelectChange('admType')}
                error={displayErrors['admType']}
              />
              <Select
                label="Adm Cat"
                options={ADM_CAT_OPTIONS}
                value={form.admCat}
                onChange={handleSelectChange('admCat')}
                error={displayErrors['admCat']}
              />
              <Select
                label="Academic Year"
                options={ACADEMIC_YEAR_OPTIONS}
                value={form.academicYear}
                onChange={handleSelectChange('academicYear')}
                error={displayErrors['academicYear']}
                placeholder="Select academic year"
              />
              <Select
                label="Admission Status"
                options={ADMISSION_STATUS_OPTIONS}
                value={form.admissionStatus}
                onChange={handleSelectChange('admissionStatus')}
                error={displayErrors['admissionStatus']}
                placeholder="Select status"
                disabled={!editId}
                className="disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500"
              />
              <Input
                label="Enrollment Date"
                type="date"
                value={form.enrollmentDate}
                onChange={handleTextChange('enrollmentDate')}
                error={displayErrors['enrollmentDate']}
              />
              {(form.year === '2ND YEAR' || form.year === '3RD YEAR') && (
                <div className="lg:col-span-2 flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!form.transferredIn}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        transferredIn: e.target.checked,
                        transferInPolytechnic: e.target.checked ? prev.transferInPolytechnic : '',
                      }))}
                      className="w-4 h-4 rounded border-lime-400 text-lime-600 focus:ring-lime-400 cursor-pointer"
                    />
                    <span className="font-semibold text-gray-600 uppercase tracking-wider text-xs">
                      Transferred In (from another Polytechnic)
                    </span>
                  </label>
                  {form.transferredIn && (
                    <Input
                      label="Transferred From (Polytechnic Name)"
                      value={form.transferInPolytechnic ?? ''}
                      onChange={handleTextChange('transferInPolytechnic')}
                      uppercase
                      placeholder="Enter polytechnic name"
                    />
                  )}
                </div>
              )}
              <GroupLabel>Registration</GroupLabel>
              <Input
                label="Reg Number"
                value={form.regNumber}
                onChange={handleTextChange('regNumber')}
                error={displayErrors['regNumber']}
                uppercase
                placeholder="Auto-assigned if blank"
              />
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider block mb-1">
                  Application Number
                </label>
                {editId ? (
                  <input
                    readOnly
                    value={form.applicationNumber || 'Not assigned'}
                    className="block w-full rounded-md border border-violet-200 px-3 py-2 text-sm bg-violet-100/60 text-gray-600 cursor-not-allowed font-mono tracking-wider"
                  />
                ) : (
                  <input
                    readOnly
                    value={form.applicationNumber}
                    placeholder="Auto-generated on enrollment"
                    className="block w-full rounded-md border border-violet-200 px-3 py-2 text-sm bg-violet-100/60 text-gray-500 cursor-not-allowed font-mono tracking-wider"
                  />
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider block mb-1">
                  Merit Number
                </label>
                {editId ? (
                  <input
                    readOnly
                    value={form.meritNumber || 'Not assigned'}
                    className="block w-full rounded-md border border-violet-200 px-3 py-2 text-sm bg-violet-100/60 text-gray-600 cursor-not-allowed font-mono tracking-wider"
                  />
                ) : (
                  <input
                    readOnly
                    value=""
                    placeholder="Auto-generated on enrollment"
                    className="block w-full rounded-md border border-violet-200 px-3 py-2 text-sm bg-violet-100/60 text-gray-400 cursor-not-allowed italic"
                  />
                )}
              </div>
            </div>

            {editId && enrollmentHistory.length > 0 && (
              <div className="mt-4 rounded-xl border border-[#D5E6AE] bg-[#F1F8E2] px-4 py-3">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={applyToAllYears}
                    onChange={(e) => setApplyToAllYears(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-lime-400 text-lime-600 focus:ring-lime-400 cursor-pointer"
                  />
                  <span className="text-sm text-gray-700">
                    <span className="font-semibold">Apply name / profile corrections to all years for this student</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Copies personal details you change here (name, parents' names, DOB, address, mobile, marks, etc.) onto this
                      student's other enrollment years: {enrollmentHistory.map((r) => r.academicYear).join(', ')}.
                      Course, year, admission category and fee-related fields are never copied — those stay specific to each year.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        </section>

      </form>

      </div>{/* end scrollable area */}

      {/* ── Footer bar — like the Add Inquiry modal footer ─────────────── */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-t bg-[#F9FCF1]"
        style={{ borderColor: ROSE_HAIR }}
      >
        {/* Error field pills — shown on the left when validation fails */}
        {Object.keys(errors).length > 0 && (
          <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
            <svg className="shrink-0 text-[#E11D48] w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0" style={{ scrollbarWidth: 'none' }}>
              {(() => {
                const keys = Object.keys(errors);
                // Merge fatherMobile + studentMobile into one pill when both share the same message
                const mobileMerged = keys.includes('fatherMobile') && keys.includes('studentMobile') &&
                  errors['fatherMobile'] === errors['studentMobile'];
                const displayKeys = mobileMerged
                  ? keys.filter((k) => k !== 'studentMobile')
                  : keys;
                return displayKeys.map((key) => (
                  <span
                    key={key}
                    className="shrink-0 inline-flex items-center px-2.5 py-[3px] rounded-full text-[10.5px] font-medium bg-[#E11D48]/[0.06] text-[#BE123C] border border-[#E11D48]/40 whitespace-nowrap leading-none"
                  >
                    {key === 'fatherMobile' && mobileMerged ? 'Mobile (Father / Student)' : (FIELD_LABELS[key] ?? key)}
                  </span>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Buttons — pushed to the right */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {!editId && (
            <button
              type="button"
              className={PILL_BTN}
              onClick={() => { setForm(emptyForm(settings?.currentAcademicYear)); setErrors({}); setPrevSourceStudent(null); }}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className={PILL_BTN}
            onClick={() => void navigate(backTo)}
          >
            Cancel
          </button>
          <button type="submit" form="enroll-form" disabled={saving} className={GRAD_BTN} style={GRAD_STYLE}>
            {saving && <Spinner />}
            {editId ? 'Update Student' : 'Preview & Enroll'}
          </button>
        </div>
      </div>

      </div>{/* end card */}

      {showPreview && (
        <EnrollmentPreview
          form={form}
          saving={saving}
          errorMsg={errorMsg}
          onConfirm={handleConfirmEnroll}
          onEdit={() => setShowPreview(false)}
        />
      )}

      {dupWarning && (
        <DuplicateWarningModal
          type={dupWarning.type}
          match={dupWarning.match}
          allMatches={dupWarning.allMatches}
          onContinue={() => {
            const key = `${form.studentNameSSLC.trim().toUpperCase()}__${form.fatherName.trim().toUpperCase()}__${form.motherName.trim().toUpperCase()}`;
            dupAcknowledgedRef.current.add(key);
            setDupWarning(null);
          }}
          onReset={() => {
            setDupWarning(null);
            setForm((prev) => ({ ...prev, studentNameSSLC: '', fatherName: '', motherName: '' }));
          }}
        />
      )}

      {showYearWarning && yearConflictRecord && (
        <YearWarningModal
          studentName={form.studentNameSSLC}
          selectedYear={form.year}
          conflictRecord={yearConflictRecord}
          onProceed={() => { setShowYearWarning(false); setYearConflictRecord(null); void performSave(); }}
          onEdit={() => { setShowYearWarning(false); setYearConflictRecord(null); }}
        />
      )}
    </div>
  );
}
