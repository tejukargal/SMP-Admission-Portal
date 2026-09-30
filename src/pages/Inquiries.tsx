import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useInquiries } from '../hooks/useInquiries';
import { addInquiry, updateInquiry, updateInquiryStatus, deleteInquiry } from '../services/inquiryService';
import { exportInquiriesPdf, exportInquiriesExcel } from '../utils/inquiryExport';
import { PageSpinner } from '../components/common/PageSpinner';
import { useAuth } from '../contexts/AuthContext';
import type { Course, AcademicYear, Inquiry, InquiryStatus } from '../types';
import type React from 'react';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];

type FilterTab = 'active' | 'converted' | 'cancelled';

const TAB_CONFIG: { id: FilterTab; label: string }[] = [
  { id: 'active',    label: 'Active' },
  { id: 'converted', label: 'Converted' },
  { id: 'cancelled', label: 'Cancelled' },
];

// ── Design tokens — student-portal look, lime / green ───────────────────────
const LIME = '#65A30D';
const LIME_INK = '#3F6212';
const HAIRLINE = '#E3EFC8';
const FALLBACK_COLOR = '#8A93A3';
const STATUS_COLOR: Record<FilterTab, string> = {
  active: '#65A30D',
  converted: '#0284C7',
  cancelled: '#E11D48',
};
const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

// Outline chip: white fill + tinted hairline and ink; solid colour when selected.
function chipStyle(color: string, selected: boolean): React.CSSProperties {
  return selected
    ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 2px 8px ${color}40` }
    : { background: '#fff', borderColor: `${color}73`, color: inkOf(color) };
}

const OUTLINE_PILL_BTN =
  'shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#65A30D]/45 bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#3F6212] hover:bg-[#65A30D]/[0.08] focus:outline-none focus:ring-2 focus:ring-[#65A30D]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const TH =
  'h-9 px-3 py-0 align-middle text-[9.5px] font-medium uppercase tracking-[0.6px] whitespace-nowrap bg-[#F1F8E2] border-b border-[#D5E6AE] text-[#3F6212]';

/** Department ring monogram — pastel gradient in the department's hue with a thin ring. */
function RingAvatar({ name, course, size = 22 }: { name: string; course: string; size?: number }) {
  const h = DEPT_HUE[course] ?? 90;
  const ring = DEPT_DOT[course] ?? FALLBACK_COLOR;
  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0 font-medium tracking-[0.3px]"
      style={{
        width: size, height: size, fontSize: size * 0.43,
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
function LinePill({ value, color, minWidth }: { value?: string | null; color?: string; minWidth?: number }) {
  if (!value) return <span className="text-[#C4C8D0] text-[10px]">—</span>;
  const c = color ?? FALLBACK_COLOR;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border px-[7px] py-[4.5px] text-[10.5px] font-medium leading-none whitespace-nowrap"
      style={{ background: `${c}14`, borderColor: `${c}73`, color: inkOf(c), minWidth }}
    >
      {value}
    </span>
  );
}

function EmptyState({ title, hint, tone = 'muted' }: { title: string; hint?: string; tone?: 'muted' | 'error' }) {
  const isError = tone === 'error';
  const c = isError ? '#E11D48' : LIME;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-14 text-center px-6" style={{ animation: 'content-enter 0.26s ease-out' }}>
      <div className="w-14 h-14 rounded-2xl border flex items-center justify-center" style={{ borderColor: `${c}33`, background: `${c}0D`, color: c }}>
        {isError ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        )}
      </div>
      <p className="text-[14px] font-medium max-w-md" style={{ color: isError ? inkOf(c) : '#5B6371' }}>{title}</p>
      {hint && <p className="text-[12px] text-[#8A93A3]">{hint}</p>}
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

interface InquiryForm {
  studentName: string;
  parentName: string;
  parentMobile: string;
  studentMobile: string;
  address: string;
  interestedCourse: Course | '';
  visitDate: string;
  notes: string;
}

interface CtxMenu {
  inq: Inquiry;
  x: number;
  y: number;
}

function emptyForm(): InquiryForm {
  return {
    studentName: '',
    parentName: '',
    parentMobile: '',
    studentMobile: '',
    address: '',
    interestedCourse: '',
    visitDate: new Date().toISOString().slice(0, 10),
    notes: '',
  };
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function resolveParentMobile(inq: Inquiry): string {
  return inq.parentMobile || inq.mobile || '—';
}

export function Inquiries() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;
  const { inquiries, loading, error } = useInquiries(academicYear);

  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InquiryForm>(emptyForm());
  const [formErrors, setFormErrors] = useState<Partial<InquiryForm>>({});
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastError, setToastError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');

  const ctxRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click, Escape, or scroll
  const closeCtx = useCallback(() => setCtxMenu(null), []);

  useEffect(() => {
    if (!ctxMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeCtx(); }
    function onMouseDown(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) closeCtx();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', closeCtx, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', closeCtx, true);
    };
  }, [ctxMenu, closeCtx]);

  useEffect(() => {
    if (!showForm || saving) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleCancelForm(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm, saving]);

  function handleContextMenu(e: React.MouseEvent, inq: Inquiry) {
    e.preventDefault();
    // Staff have no actions on cancelled inquiries
    if (!isAdmin && inq.status === 'cancelled') return;
    const menuW = 200;
    const menuH = 160;
    const x = e.clientX + menuW > window.innerWidth  ? e.clientX - menuW : e.clientX;
    const y = e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY;
    setCtxMenu({ inq, x, y });
  }

  function showToast(msg: string, isError = false) {
    setToastMsg(msg);
    setToastError(isError);
    setTimeout(() => setToastMsg(''), 3500);
  }

  function handleExportPdf() {
    setExportingPdf(true);
    const statusLabel = TAB_CONFIG.find((t) => t.id === activeTab)?.label ?? activeTab;
    setTimeout(() => {
      try { exportInquiriesPdf(displayList, academicYear, statusLabel); }
      finally { setExportingPdf(false); }
    }, 0);
  }

  function handleExportExcel() {
    setExportingExcel(true);
    const statusLabel = TAB_CONFIG.find((t) => t.id === activeTab)?.label ?? activeTab;
    setTimeout(() => {
      try { exportInquiriesExcel(displayList, academicYear, statusLabel); }
      finally { setExportingExcel(false); }
    }, 0);
  }

  const counts = useMemo(() => ({
    active:    inquiries.filter((i) => i.status === 'active').length,
    converted: inquiries.filter((i) => i.status === 'converted').length,
    cancelled: inquiries.filter((i) => i.status === 'cancelled').length,
  }), [inquiries]);

  const displayList = useMemo(() => {
    let list = inquiries.filter((i) => i.status === activeTab);
    if (courseFilter) list = list.filter((i) => i.interestedCourse === courseFilter);
    const q = searchTerm.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.studentName.toUpperCase().includes(q) ||
          (i.parentName || '').toUpperCase().includes(q) ||
          resolveParentMobile(i).includes(searchTerm.trim()) ||
          (i.studentMobile || '').includes(searchTerm.trim()) ||
          i.interestedCourse.toUpperCase().includes(q)
      );
    }
    return list;
  }, [inquiries, activeTab, searchTerm, courseFilter]);

  // Per-course counts for the current status tab (drives the course chips).
  const courseCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const i of inquiries) if (i.status === activeTab) out[i.interestedCourse] = (out[i.interestedCourse] ?? 0) + 1;
    return out;
  }, [inquiries, activeTab]);

  // ── Form handlers ──────────────────────────────────────────────────────────

  function handleFormChange(field: keyof InquiryForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function validate(): boolean {
    const errs: Partial<InquiryForm> = {};
    if (!form.studentName.trim()) errs.studentName = 'Name is required';
    if (!form.parentName.trim()) errs.parentName = 'Parent / Guardian name is required';
    if (!form.parentMobile.trim()) {
      errs.parentMobile = 'Father mobile is required';
    } else if (!/^[6-9]\d{9}$/.test(form.parentMobile.trim())) {
      errs.parentMobile = 'Enter a valid 10-digit mobile number';
    }
    if (form.studentMobile.trim() && !/^[6-9]\d{9}$/.test(form.studentMobile.trim())) {
      errs.studentMobile = 'Enter a valid 10-digit mobile number';
    }
    if (!form.address.trim()) errs.address = 'Address is required';
    if (!form.interestedCourse) errs.interestedCourse = 'Select a course' as Course;
    if (!form.visitDate) errs.visitDate = 'Visit date is required';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate() || !academicYear) return;
    setSaving(true);
    try {
      const data = {
        studentName:      form.studentName.trim().toUpperCase(),
        parentName:       form.parentName.trim().toUpperCase(),
        parentMobile:     form.parentMobile.trim(),
        studentMobile:    form.studentMobile.trim(),
        address:          form.address.trim(),
        interestedCourse: form.interestedCourse as Course,
        visitDate:        form.visitDate,
        notes:            form.notes.trim(),
        academicYear,
      };

      if (editingId) {
        const currentInq = inquiries.find((i) => i.id === editingId);
        await updateInquiry(editingId, { ...data, status: currentInq?.status ?? 'active' });
        showToast('Inquiry updated successfully.');
      } else {
        await addInquiry({ ...data, status: 'active' });
        setActiveTab('active');
        showToast('Inquiry saved successfully.');
      }

      setForm(emptyForm());
      setEditingId(null);
      setShowForm(false);
    } catch {
      showToast('Failed to save inquiry. Please try again.', true);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelForm() {
    setForm(emptyForm());
    setFormErrors({});
    setEditingId(null);
    setShowForm(false);
  }

  function handleEdit(inq: Inquiry) {
    closeCtx();
    setForm({
      studentName:      inq.studentName,
      parentName:       inq.parentName || '',
      parentMobile:     inq.parentMobile || inq.mobile || '',
      studentMobile:    inq.studentMobile || '',
      address:          inq.address,
      interestedCourse: inq.interestedCourse,
      visitDate:        inq.visitDate,
      notes:            inq.notes,
    });
    setEditingId(inq.id);
    setFormErrors({});
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Row actions ────────────────────────────────────────────────────────────

  async function handleStatusChange(id: string, name: string, status: InquiryStatus) {
    closeCtx();
    setActionLoading(id);
    try {
      await updateInquiryStatus(id, status);
      const msgs: Record<InquiryStatus, string> = {
        active:    `${name} restored to Active.`,
        converted: `${name} marked as Converted.`,
        cancelled: `${name} moved to Cancelled.`,
      };
      showToast(msgs[status]);
    } catch {
      showToast('Failed to update. Please try again.', true);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    closeCtx();
    if (!window.confirm(`Delete inquiry for ${name}? This cannot be undone.`)) return;
    setActionLoading(id);
    try {
      await deleteInquiry(id);
      showToast(`Inquiry for ${name} deleted.`);
    } catch {
      showToast('Failed to delete. Please try again.', true);
    } finally {
      setActionLoading(null);
    }
  }

  function handleBeginEnrollment(inq: Inquiry) {
    closeCtx();
    sessionStorage.setItem(
      'smp_inquiry_prefill',
      JSON.stringify({
        inquiryId:   inq.id,
        studentName: inq.studentName,
        mobile:      resolveParentMobile(inq),
        address:     inq.address,
        course:      inq.interestedCourse,
      })
    );
    void updateInquiryStatus(inq.id, 'converted');
    void navigate('/enroll');
  }

  const isLoading = settingsLoading || loading;
  if (isLoading) return <PageSpinner />;

  const hasActiveFilters = !!searchTerm || !!courseFilter;
  const tabColor = STATUS_COLOR[activeTab];

  const INPUT_BASE = 'w-full border bg-[#FBFDF5] px-3 py-2 text-[13px] font-medium text-[#3F6212] placeholder:text-[#3F6212]/45 placeholder:font-normal focus:outline-none focus:bg-white focus:ring-2 transition-all duration-150';
  const inputCls = (err?: string, rounded = 'rounded-full') =>
    `${INPUT_BASE} ${rounded} ${err ? 'border-[#E11D48]/60 focus:border-[#E11D48] focus:ring-[#E11D48]/20' : 'border-[#65A30D]/35 focus:border-[#65A30D] focus:ring-[#65A30D]/20'}`;
  const LABEL = 'text-[11px] font-medium text-[#5B6371] pl-1';
  const ERR = 'text-[10.5px] font-medium text-[#E11D48] pl-1';
  const SECTION = 'text-[9.5px] font-medium uppercase tracking-[0.6px] text-[#3F6212]';

  return (
    <div
      className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{ background: 'linear-gradient(160deg, #F9FCF1 0%, #FDFEF9 45%, #F3F9E4 100%)', animation: 'page-enter 0.22s ease-out' }}
    >

      {/* ── Page header ── */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0 relative">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">
            SMP Admissions{academicYear ? ` · ${academicYear}` : ''}
          </p>
          <h2 className="mt-1.5 text-[22px] font-bold leading-none tracking-[-0.3px]" style={{ color: LIME_INK }}>Inquiries</h2>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="relative w-56">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: LIME_INK }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search name / mobile / course…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-full border border-[#65A30D]/40 bg-[#FBFDF5] py-2 pl-9 pr-3 text-[13px] font-medium text-[#3F6212] placeholder:text-[#3F6212]/55 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#65A30D] focus:ring-2 focus:ring-[#65A30D]/20 transition-all duration-150"
            />
          </div>
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            disabled={!searchTerm}
            aria-label="Clear search"
            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#F97360]/10 px-3 py-2 text-[11.5px] font-medium text-[#E2533F] hover:bg-[#F97360]/[0.16] focus:outline-none focus:ring-2 focus:ring-[#F97360]/30 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear
          </button>
          <button
            onClick={() => {
              if (showForm) {
                handleCancelForm();
              } else {
                setForm(emptyForm());
                setEditingId(null);
                setFormErrors({});
                setShowForm(true);
              }
            }}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-medium text-white hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#65A30D]/40 focus-visible:ring-offset-2 cursor-pointer transition-[filter]"
            style={{ background: `linear-gradient(135deg, ${LIME}, ${LIME_INK})`, boxShadow: `0 3px 10px ${LIME}40` }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Inquiry
          </button>
        </div>

        {/* Toast */}
        {toastMsg && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 flex items-center gap-2 border text-[12px] font-medium px-3.5 py-1.5 rounded-full whitespace-nowrap pointer-events-auto bg-white"
            style={{
              animation: 'toast-in 0.2s ease-out',
              borderColor: toastError ? '#E11D4866' : '#65A30D66',
              color: toastError ? '#9F1239' : LIME_INK,
              boxShadow: `0 4px 14px ${toastError ? '#E11D4820' : '#65A30D25'}`,
            }}
          >
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white" style={{ background: toastError ? '#E11D48' : LIME }}>
              {toastError ? '✕' : '✓'}
            </span>
            {toastMsg}
            <button onClick={() => setToastMsg('')} className="leading-none ml-1 opacity-50 hover:opacity-100 cursor-pointer">×</button>
          </div>
        )}
      </div>

      {/* ── Status tiles + course chips + exports ── */}
      <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
        {TAB_CONFIG.map(({ id, label }) => {
          const c = STATUS_COLOR[id];
          const selected = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-start justify-center rounded-xl border px-3.5 py-1.5 min-w-[104px] cursor-pointer transition-all active:scale-[0.98] hover:brightness-[0.97] ${!selected ? 'opacity-70 hover:opacity-100' : ''}`}
              style={selected ? { background: c, borderColor: c, boxShadow: `0 3px 10px ${c}40` } : { background: `${c}12`, borderColor: `${c}59` }}
            >
              <span className="inline-flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.5px] leading-tight" style={{ color: selected ? '#fff' : inkOf(c) }}>
                {!selected && <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />}
                {label}
              </span>
              <span className="text-[18px] font-medium leading-tight" style={{ color: selected ? '#fff' : inkOf(c) }}><AnimNum value={counts[id]} /></span>
            </button>
          );
        })}

        <span className="w-px h-8 bg-[#D5E6AE] mx-1 self-center" />

        {COURSES.map((c) => {
          const count = courseCounts[c] ?? 0;
          const selected = courseFilter === c;
          const dimmed = (!!courseFilter && !selected) || count === 0;
          return (
            <button
              key={c}
              onClick={() => setCourseFilter(selected ? '' : c)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${dimmed && !selected ? 'opacity-[0.5] hover:opacity-100' : ''}`}
              style={chipStyle(DEPT_DOT[c], selected)}
            >
              {!selected && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DEPT_DOT[c] }} />}
              <span>{c}</span>
              <AnimNum value={count} />
            </button>
          );
        })}

        {courseFilter && (
          <button
            onClick={() => setCourseFilter('')}
            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#F97360]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#E2533F] hover:bg-[#F97360]/[0.16] cursor-pointer transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear course
          </button>
        )}

        {displayList.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={handleExportPdf} disabled={exportingPdf} className={OUTLINE_PILL_BTN}>
              {exportingPdf ? 'Generating…' : 'Save PDF'}
            </button>
            <button onClick={handleExportExcel} disabled={exportingExcel} className={OUTLINE_PILL_BTN}>
              {exportingExcel ? 'Generating…' : 'Save Excel'}
            </button>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {error ? (
        <EmptyState tone="error" title={error} />
      ) : !academicYear ? (
        <EmptyState title="Please configure an academic year in Settings first." />
      ) : displayList.length === 0 ? (
        <EmptyState
          title={
            searchTerm.trim()
              ? `No results for "${searchTerm.trim()}".`
              : courseFilter
              ? `No ${activeTab} inquiries for ${courseFilter}.`
              : activeTab === 'active'
              ? `No active inquiries for ${academicYear}.`
              : activeTab === 'converted'
              ? `No converted inquiries for ${academicYear}.`
              : `No cancelled inquiries for ${academicYear}.`
          }
          hint={activeTab === 'active' && !searchTerm.trim() && !courseFilter ? 'Use "+ Add Inquiry" to record a walk-in visit.' : undefined}
        />
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-2xl border overflow-hidden flex flex-col transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(63,98,18,0.06)]" style={{ borderColor: HAIRLINE }}>
          <div className="scroll-inq flex-1 min-h-0 overflow-auto">
            <table className="min-w-full text-xs border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={`${TH} text-left w-8`}>#</th>
                  <th className={`${TH} text-left`}>Student Name</th>
                  <th className={`${TH} text-left`}>Parent / Guardian</th>
                  <th className={`${TH} text-left w-28`}>Father Mobile</th>
                  <th className={`${TH} text-left w-28`}>Student Mobile</th>
                  <th className={`${TH} text-left w-14`}>Course</th>
                  <th className={`${TH} text-left w-24`}>Visit Date</th>
                  <th className={`${TH} text-left`}>Address</th>
                  <th className={`${TH} text-left`}>Notes</th>
                </tr>
              </thead>
              <tbody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-t-[#EEF6DC]">
                {displayList.map((inq, idx) => (
                  <tr
                    key={inq.id}
                    onContextMenu={(e) => handleContextMenu(e, inq)}
                    className={`transition-colors select-none ${
                      actionLoading === inq.id
                        ? 'opacity-50 pointer-events-none'
                        : (!isAdmin && inq.status === 'cancelled')
                        ? 'hover:bg-[#F9FCF1]'
                        : 'hover:bg-[#F9FCF1] cursor-context-menu'
                    } ${editingId === inq.id ? 'bg-[#F1F8E2]' : ''} ${ctxMenu?.inq.id === inq.id ? 'row-ctx-active-lime' : ''}`}
                  >
                    <td className="px-3 py-2 text-[11px] font-medium text-[#8A93A3] tabular-nums whitespace-nowrap">{idx + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="flex items-center gap-2.5 group">
                        <RingAvatar name={inq.studentName} course={inq.interestedCourse} />
                        <span className="text-[12.5px] font-medium" style={{ color: LIME_INK }}>{inq.studentName}</span>
                        <span className="opacity-0 group-hover:opacity-40 transition-opacity text-[9px] text-gray-400 font-normal leading-none select-none">▾</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11.5px] font-medium text-[#4B5068] whitespace-nowrap">{inq.parentName || '—'}</td>
                    <td className="px-3 py-2 text-[11.5px] font-medium text-black tabular-nums whitespace-nowrap">{resolveParentMobile(inq)}</td>
                    <td className="px-3 py-2 text-[11.5px] font-medium text-black tabular-nums whitespace-nowrap">{inq.studentMobile || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <LinePill value={inq.interestedCourse} color={DEPT_DOT[inq.interestedCourse]} minWidth={34} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <LinePill value={fmtDate(inq.visitDate)} color={tabColor} />
                    </td>
                    <td className="px-3 py-2 text-[11.5px] font-medium text-[#4B5068] max-w-[180px] truncate" title={inq.address}>{inq.address || '—'}</td>
                    <td className="px-3 py-2 text-[11.5px] text-[#8A93A3] max-w-[160px] truncate italic" title={inq.notes}>{inq.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex-shrink-0 px-4 py-2 border-t bg-[#F9FCF1] text-[11px] font-medium text-[#8A93A3]" style={{ borderColor: '#D5E6AE' }}>
            <span className="text-[#262B35] tabular-nums">{displayList.length}</span> inquiry{displayList.length !== 1 ? 's' : ''}
            {hasActiveFilters && <span> (filtered)</span>}
            <span className="ml-2 text-[#B5BCC8]">· Right-click a row for actions</span>
          </div>
        </div>
      )}

      {/* ── Add / Edit Inquiry modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-wp" style={{ animation: 'backdrop-enter 0.18s ease-out' }}>
          <div className="absolute inset-0 bg-black/40" onClick={() => !saving && handleCancelForm()} aria-hidden="true" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border"
            style={{ borderColor: HAIRLINE, maxHeight: 'calc(100vh - 2rem)', animation: 'modal-enter 0.22s ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 flex items-center justify-between shrink-0" style={{ background: `linear-gradient(135deg, ${LIME}, ${LIME_INK})` }}>
              <h3 className="text-[14px] font-bold text-white flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/20 ring-1 ring-white/40">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                </span>
                {editingId ? 'Edit Inquiry' : 'New Walk-in Inquiry'}
              </h3>
              <button
                onClick={handleCancelForm}
                disabled={saving}
                aria-label="Close"
                className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4" style={{ background: 'linear-gradient(160deg, #FDFEF9, #F9FCF1)' }}>
              {/* Student */}
              <div className="space-y-2.5">
                <p className={SECTION}>Student</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-2.5">
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className={LABEL}>Student Name <span className="text-[#E11D48]">*</span></label>
                    <input
                      type="text"
                      value={form.studentName}
                      onChange={(e) => handleFormChange('studentName', e.target.value.toUpperCase())}
                      placeholder="As in SSLC certificate"
                      style={{ textTransform: 'uppercase' }}
                      className={inputCls(formErrors.studentName)}
                    />
                    {formErrors.studentName && <span className={ERR}>{formErrors.studentName}</span>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={LABEL}>Interested Course <span className="text-[#E11D48]">*</span></label>
                    <select
                      value={form.interestedCourse}
                      onChange={(e) => handleFormChange('interestedCourse', e.target.value)}
                      className={`${inputCls(formErrors.interestedCourse)} cursor-pointer`}
                    >
                      <option value="">Select course…</option>
                      {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {formErrors.interestedCourse && <span className={ERR}>{formErrors.interestedCourse}</span>}
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className={LABEL}>Student Mobile <span className="text-[#8A93A3] font-normal">(optional)</span></label>
                    <input
                      type="tel"
                      value={form.studentMobile}
                      onChange={(e) => handleFormChange('studentMobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile number"
                      className={inputCls(formErrors.studentMobile)}
                    />
                    {formErrors.studentMobile && <span className={ERR}>{formErrors.studentMobile}</span>}
                  </div>
                </div>
              </div>

              {/* Parent */}
              <div className="space-y-2.5">
                <p className={SECTION}>Parent / Guardian</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2.5">
                  <div className="flex flex-col gap-1">
                    <label className={LABEL}>Parent / Guardian Name <span className="text-[#E11D48]">*</span></label>
                    <input
                      type="text"
                      value={form.parentName}
                      onChange={(e) => handleFormChange('parentName', e.target.value.toUpperCase())}
                      placeholder="Father / Guardian name"
                      style={{ textTransform: 'uppercase' }}
                      className={inputCls(formErrors.parentName)}
                    />
                    {formErrors.parentName && <span className={ERR}>{formErrors.parentName}</span>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={LABEL}>Father Mobile <span className="text-[#E11D48]">*</span></label>
                    <input
                      type="tel"
                      value={form.parentMobile}
                      onChange={(e) => handleFormChange('parentMobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile number"
                      className={inputCls(formErrors.parentMobile)}
                    />
                    {formErrors.parentMobile && <span className={ERR}>{formErrors.parentMobile}</span>}
                  </div>
                </div>
              </div>

              {/* Visit */}
              <div className="space-y-2.5">
                <p className={SECTION}>Visit</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-2.5">
                  <div className="flex flex-col gap-1">
                    <label className={LABEL}>Visit Date <span className="text-[#E11D48]">*</span></label>
                    <input
                      type="date"
                      value={form.visitDate}
                      onChange={(e) => handleFormChange('visitDate', e.target.value)}
                      className={inputCls(formErrors.visitDate)}
                    />
                    {formErrors.visitDate && <span className={ERR}>{formErrors.visitDate}</span>}
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className={LABEL}>Address <span className="text-[#E11D48]">*</span></label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => handleFormChange('address', e.target.value.toUpperCase())}
                      placeholder="House / Street / Village / Town"
                      style={{ textTransform: 'uppercase' }}
                      className={inputCls(formErrors.address)}
                    />
                    {formErrors.address && <span className={ERR}>{formErrors.address}</span>}
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-3">
                    <label className={LABEL}>Notes <span className="text-[#8A93A3] font-normal">(optional)</span></label>
                    <input
                      type="text"
                      value={form.notes}
                      onChange={(e) => handleFormChange('notes', e.target.value.toUpperCase())}
                      placeholder="Any remarks or follow-up notes…"
                      style={{ textTransform: 'uppercase' }}
                      className={inputCls()}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t flex items-center justify-end gap-2 shrink-0 bg-[#F9FCF1]" style={{ borderColor: HAIRLINE }}>
              <button onClick={handleCancelForm} disabled={saving} className={OUTLINE_PILL_BTN}>Cancel</button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center rounded-full px-5 py-1.5 text-[12px] font-medium text-white hover:brightness-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-[filter]"
                style={{ background: `linear-gradient(135deg, ${LIME}, ${LIME_INK})`, boxShadow: `0 3px 10px ${LIME}40` }}
              >
                {saving ? 'Saving…' : editingId ? 'Update Inquiry' : 'Save Inquiry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999, borderColor: HAIRLINE, boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          className="font-wp bg-white border rounded-2xl overflow-hidden min-w-[210px]"
        >
          <div className="px-3 pt-2.5 pb-2 border-b flex items-center gap-2.5" style={{ borderColor: '#EEF6DC' }}>
            <RingAvatar name={ctxMenu.inq.studentName} course={ctxMenu.inq.interestedCourse} size={26} />
            <div className="min-w-0">
              <p className="text-[12px] font-medium truncate" style={{ color: LIME_INK }}>{ctxMenu.inq.studentName}</p>
              <p className="text-[10px] text-[#8A93A3] truncate">{ctxMenu.inq.interestedCourse} · {fmtDate(ctxMenu.inq.visitDate)}</p>
            </div>
          </div>

          <div className="py-1.5">
            <button
              onClick={() => handleEdit(ctxMenu.inq)}
              className="group w-full text-left px-3 py-[7px] text-[13px] font-medium text-[#4B5068] hover:bg-[#F9FCF1] hover:text-[#262B35] flex items-center gap-2.5 transition-colors duration-100 cursor-pointer"
            >
              <span className="w-[18px] h-[18px] rounded-[5px] bg-[#F1F8E2] text-[#3F6212] flex items-center justify-center flex-shrink-0">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </span>
              Edit Inquiry
            </button>

            {ctxMenu.inq.status === 'active' && isAdmin && (
              <>
                <button
                  onClick={() => handleBeginEnrollment(ctxMenu.inq)}
                  className="group w-full text-left px-3 py-[7px] text-[13px] font-medium text-[#3F6212] hover:bg-[#65A30D]/10 flex items-center gap-2.5 transition-colors duration-100 cursor-pointer"
                >
                  <span className="w-[18px] h-[18px] rounded-[5px] bg-[#65A30D]/15 text-[#4D7C0F] flex items-center justify-center flex-shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </span>
                  Begin Enrollment
                </button>
                <div className="my-1 h-px bg-[#EEF6DC] mx-3" />
                <button
                  onClick={() => void handleStatusChange(ctxMenu.inq.id, ctxMenu.inq.studentName, 'cancelled')}
                  className="group w-full text-left px-3 py-[7px] text-[13px] font-medium text-[#E11D48] hover:bg-[#E11D48]/[0.07] flex items-center gap-2.5 transition-colors duration-100 cursor-pointer"
                >
                  <span className="w-[18px] h-[18px] rounded-[5px] bg-[#E11D48]/10 text-[#E11D48] flex items-center justify-center flex-shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </span>
                  Cancel Inquiry
                </button>
              </>
            )}

            {(ctxMenu.inq.status === 'converted' || ctxMenu.inq.status === 'cancelled') && (
              <>
                <div className="my-1 h-px bg-[#EEF6DC] mx-3" />
                <button
                  onClick={() => void handleStatusChange(ctxMenu.inq.id, ctxMenu.inq.studentName, 'active')}
                  className="group w-full text-left px-3 py-[7px] text-[13px] font-medium text-[#4B5068] hover:bg-[#F9FCF1] hover:text-[#262B35] flex items-center gap-2.5 transition-colors duration-100 cursor-pointer"
                >
                  <span className="w-[18px] h-[18px] rounded-[5px] bg-[#0284C7]/10 text-[#0284C7] flex items-center justify-center flex-shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 101.85-4.17L1 10"/></svg>
                  </span>
                  Restore to Active
                </button>
              </>
            )}

            {ctxMenu.inq.status === 'cancelled' && (
              <button
                onClick={() => void handleDelete(ctxMenu.inq.id, ctxMenu.inq.studentName)}
                className="group w-full text-left px-3 py-[7px] text-[13px] font-medium text-[#E11D48] hover:bg-[#E11D48]/[0.07] flex items-center gap-2.5 transition-colors duration-100 cursor-pointer"
              >
                <span className="w-[18px] h-[18px] rounded-[5px] bg-[#E11D48]/10 text-[#E11D48] flex items-center justify-center flex-shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                </span>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
