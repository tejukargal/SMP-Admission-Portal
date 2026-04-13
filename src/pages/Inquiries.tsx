import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useInquiries } from '../hooks/useInquiries';
import { addInquiry, updateInquiry, updateInquiryStatus, deleteInquiry } from '../services/inquiryService';
import { exportInquiriesPdf, exportInquiriesExcel } from '../utils/inquiryExport';
import { Button } from '../components/common/Button';
import { PageSpinner } from '../components/common/PageSpinner';
import { useAuth } from '../contexts/AuthContext';
import type { Course, AcademicYear, Inquiry, InquiryStatus } from '../types';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];

type FilterTab = 'active' | 'converted' | 'cancelled';

const TAB_CONFIG: { id: FilterTab; label: string; badge: string }[] = [
  { id: 'active',    label: 'Active',    badge: 'bg-green-100 text-green-700' },
  { id: 'converted', label: 'Converted', badge: 'bg-blue-100 text-blue-700' },
  { id: 'cancelled', label: 'Cancelled', badge: 'bg-red-100 text-red-700' },
];

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
  }, [inquiries, activeTab, searchTerm]);

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

  return (
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* Page header */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0 relative">
        <div className="shrink-0">
          <h2 className="text-base font-semibold text-gray-900 leading-tight">Inquiries</h2>
          {academicYear && (
            <p className="text-[10px] text-gray-400 leading-tight">{academicYear}</p>
          )}
        </div>

        <span className="text-gray-200 text-sm select-none shrink-0">|</span>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
            <span className="text-green-600 font-medium">Active</span>
            <span className="font-bold tabular-nums text-green-800">{counts.active}</span>
          </div>
        </div>

        <Button
          size="sm"
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
          className="ml-auto shrink-0"
        >
          {showForm ? '✕ Close' : '+ Add Inquiry'}
        </Button>

        <div className="relative shrink-0">
          <input
            type="text"
            placeholder="Search name / mobile / course…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-52 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 pr-6"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 leading-none text-sm"
            >
              ×
            </button>
          )}
        </div>

        {/* Toast */}
        {toastMsg && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-2 border text-xs font-medium px-3 py-1.5 rounded-full shadow-sm whitespace-nowrap pointer-events-auto ${
              toastError
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-green-50 border-green-200 text-green-800'
            }`}
            style={{ animation: 'toast-in 0.2s ease-out' }}
          >
            <span className={toastError ? 'text-red-500' : 'text-green-500'}>
              {toastError ? '✕' : '✓'}
            </span>
            {toastMsg}
            <button
              onClick={() => setToastMsg('')}
              className={`leading-none ml-1 ${toastError ? 'text-red-400 hover:text-red-600' : 'text-green-400 hover:text-green-600'}`}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Inline Add / Edit Inquiry form */}
      {showForm && (
        <div className="flex-shrink-0 bg-white border border-blue-200 rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            {editingId ? 'Edit Inquiry' : 'New Walk-in Inquiry'}
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">

            {/* Student Name */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Student Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.studentName}
                onChange={(e) => handleFormChange('studentName', e.target.value.toUpperCase())}
                placeholder="As in SSLC certificate"
                className={`rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 uppercase ${formErrors.studentName ? 'border-red-400' : 'border-gray-300'}`}
              />
              {formErrors.studentName && <span className="text-[10px] text-red-500">{formErrors.studentName}</span>}
            </div>

            {/* Parent / Guardian Name */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Parent / Guardian Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.parentName}
                onChange={(e) => handleFormChange('parentName', e.target.value.toUpperCase())}
                placeholder="Father / Guardian name"
                className={`rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 uppercase ${formErrors.parentName ? 'border-red-400' : 'border-gray-300'}`}
              />
              {formErrors.parentName && <span className="text-[10px] text-red-500">{formErrors.parentName}</span>}
            </div>

            {/* Interested Course */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Interested Course <span className="text-red-500">*</span></label>
              <select
                value={form.interestedCourse}
                onChange={(e) => handleFormChange('interestedCourse', e.target.value)}
                className={`rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white ${formErrors.interestedCourse ? 'border-red-400' : 'border-gray-300'}`}
              >
                <option value="">Select course…</option>
                {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {formErrors.interestedCourse && <span className="text-[10px] text-red-500">{formErrors.interestedCourse}</span>}
            </div>

            {/* Father Mobile */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Father Mobile <span className="text-red-500">*</span></label>
              <input
                type="tel"
                value={form.parentMobile}
                onChange={(e) => handleFormChange('parentMobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className={`rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${formErrors.parentMobile ? 'border-red-400' : 'border-gray-300'}`}
              />
              {formErrors.parentMobile && <span className="text-[10px] text-red-500">{formErrors.parentMobile}</span>}
            </div>

            {/* Student Mobile */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Student Mobile <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="tel"
                value={form.studentMobile}
                onChange={(e) => handleFormChange('studentMobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className={`rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${formErrors.studentMobile ? 'border-red-400' : 'border-gray-300'}`}
              />
              {formErrors.studentMobile && <span className="text-[10px] text-red-500">{formErrors.studentMobile}</span>}
            </div>

            {/* Visit Date */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Visit Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.visitDate}
                onChange={(e) => handleFormChange('visitDate', e.target.value)}
                className={`rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${formErrors.visitDate ? 'border-red-400' : 'border-gray-300'}`}
              />
              {formErrors.visitDate && <span className="text-[10px] text-red-500">{formErrors.visitDate}</span>}
            </div>

            {/* Address */}
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-xs font-medium text-gray-600">Address <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => handleFormChange('address', e.target.value.toUpperCase())}
                placeholder="House / Street / Village / Town"
                style={{ textTransform: 'uppercase' }}
                className={`rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${formErrors.address ? 'border-red-400' : 'border-gray-300'}`}
              />
              {formErrors.address && <span className="text-[10px] text-red-500">{formErrors.address}</span>}
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1 col-span-2 md:col-span-3">
              <label className="text-xs font-medium text-gray-600">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => handleFormChange('notes', e.target.value.toUpperCase())}
                placeholder="Any remarks or follow-up notes…"
                style={{ textTransform: 'uppercase' }}
                className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
            <Button size="sm" onClick={() => void handleSave()} loading={saving}>
              {editingId ? 'Update Inquiry' : 'Save Inquiry'}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCancelForm} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex-shrink-0 flex items-center border-b border-gray-200 bg-white rounded-t-lg">
        {TAB_CONFIG.map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
            {counts[id] > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${badge}`}>
                {counts[id]}
              </span>
            )}
          </button>
        ))}
        {displayList.length > 0 && (
          <div className="flex items-center gap-2 ml-auto pr-3">
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingPdf ? 'Generating…' : 'Save PDF'}
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="rounded border border-green-300 px-2.5 py-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingExcel ? 'Generating…' : 'Save Excel'}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>
      ) : !academicYear ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Please configure an academic year in Settings first.
        </div>
      ) : displayList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-2">
          <p className="text-sm text-gray-400">
            {searchTerm.trim()
              ? `No results for "${searchTerm.trim()}".`
              : activeTab === 'active'
              ? `No active inquiries for ${academicYear}.`
              : activeTab === 'converted'
              ? `No converted inquiries for ${academicYear}.`
              : `No cancelled inquiries for ${academicYear}.`}
          </p>
          {activeTab === 'active' && !searchTerm.trim() && (
            <p className="text-xs text-gray-300">Use "+ Add Inquiry" to record a walk-in visit.</p>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto flex flex-col">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-8">#</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Student Name</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Parent / Guardian</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-28">Father Mobile</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-28">Student Mobile</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-14">Course</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-24">Visit Date</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Address</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayList.map((inq, idx) => (
                <tr
                  key={inq.id}
                  onContextMenu={(e) => handleContextMenu(e, inq)}
                  className={`transition-colors select-none ${
                    actionLoading === inq.id
                      ? 'opacity-50 pointer-events-none'
                      : (!isAdmin && inq.status === 'cancelled')
                      ? 'hover:bg-gray-50'
                      : 'hover:bg-gray-50 cursor-context-menu'
                  } ${editingId === inq.id ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                    <span className="flex items-center gap-1 group">
                      {inq.studentName}
                      <span className="opacity-0 group-hover:opacity-40 transition-opacity text-[9px] text-gray-400 font-normal leading-none select-none">▾</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{inq.parentName || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap tabular-nums">{resolveParentMobile(inq)}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap tabular-nums">{inq.studentMobile || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                      {inq.interestedCourse}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(inq.visitDate)}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={inq.address}>{inq.address || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate italic" title={inq.notes}>{inq.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto">
            {displayList.length} inquiry{displayList.length !== 1 ? 's' : ''}
            <span className="ml-2 text-gray-300">· Right-click a row for actions</span>
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
          className="w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1 text-xs"
        >
          {/* Header */}
          <div className="px-3 py-1.5 border-b border-gray-100">
            <p className="font-semibold text-gray-800 truncate">{ctxMenu.inq.studentName}</p>
            <p className="text-[10px] text-gray-400 truncate">{ctxMenu.inq.interestedCourse} · {fmtDate(ctxMenu.inq.visitDate)}</p>
          </div>

          {/* Edit — always available */}
          <button
            onClick={() => handleEdit(ctxMenu.inq)}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700"
          >
            <span className="text-gray-400">✎</span> Edit Inquiry
          </button>

          {/* Active-only actions — admin only */}
          {ctxMenu.inq.status === 'active' && isAdmin && (
            <>
              <button
                onClick={() => handleBeginEnrollment(ctxMenu.inq)}
                className="w-full text-left px-3 py-2 hover:bg-green-50 flex items-center gap-2 text-green-700 font-medium"
              >
                <span>→</span> Begin Enrollment
              </button>
              <div className="border-t border-gray-100 my-0.5" />
              <button
                onClick={() => void handleStatusChange(ctxMenu.inq.id, ctxMenu.inq.studentName, 'cancelled')}
                className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"
              >
                <span>✕</span> Cancel Inquiry
              </button>
            </>
          )}

          {/* Converted-only actions */}
          {ctxMenu.inq.status === 'converted' && (
            <>
              <div className="border-t border-gray-100 my-0.5" />
              <button
                onClick={() => void handleStatusChange(ctxMenu.inq.id, ctxMenu.inq.studentName, 'active')}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-600"
              >
                <span>↩</span> Restore to Active
              </button>
            </>
          )}

          {/* Cancelled-only actions */}
          {ctxMenu.inq.status === 'cancelled' && (
            <>
              <div className="border-t border-gray-100 my-0.5" />
              <button
                onClick={() => void handleStatusChange(ctxMenu.inq.id, ctxMenu.inq.studentName, 'active')}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-600"
              >
                <span>↩</span> Restore to Active
              </button>
              <button
                onClick={() => void handleDelete(ctxMenu.inq.id, ctxMenu.inq.studentName)}
                className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-500"
              >
                <span>🗑</span> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
