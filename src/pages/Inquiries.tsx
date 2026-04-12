import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useInquiries } from '../hooks/useInquiries';
import { addInquiry, updateInquiryStatus, deleteInquiry } from '../services/inquiryService';
import { exportInquiriesPdf, exportInquiriesExcel } from '../utils/inquiryExport';
import { Button } from '../components/common/Button';
import { PageSpinner } from '../components/common/PageSpinner';
import type { Course, AcademicYear, InquiryStatus } from '../types';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];

type FilterTab = 'active' | 'converted' | 'cancelled';

const TAB_CONFIG: { id: FilterTab; label: string; badge: string }[] = [
  { id: 'active',    label: 'Active',    badge: 'bg-green-100 text-green-700' },
  { id: 'converted', label: 'Converted', badge: 'bg-blue-100 text-blue-700' },
  { id: 'cancelled', label: 'Cancelled', badge: 'bg-red-100 text-red-700' },
];

interface InquiryForm {
  studentName: string;
  mobile: string;
  address: string;
  interestedCourse: Course | '';
  visitDate: string;
  notes: string;
}

function emptyForm(): InquiryForm {
  return {
    studentName: '',
    mobile: '',
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

export function Inquiries() {
  const navigate = useNavigate();
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;
  const { inquiries, loading, error } = useInquiries(academicYear);

  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<InquiryForm>(emptyForm());
  const [formErrors, setFormErrors] = useState<Partial<InquiryForm>>({});
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastError, setToastError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

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

  // Counts per tab
  const counts = useMemo(() => ({
    active:    inquiries.filter((i) => i.status === 'active').length,
    converted: inquiries.filter((i) => i.status === 'converted').length,
    cancelled: inquiries.filter((i) => i.status === 'cancelled').length,
  }), [inquiries]);

  // Filtered list
  const displayList = useMemo(() => {
    let list = inquiries.filter((i) => i.status === activeTab);
    const q = searchTerm.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.studentName.toUpperCase().includes(q) ||
          i.mobile.includes(searchTerm.trim()) ||
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
    if (!form.mobile.trim()) {
      errs.mobile = 'Mobile is required';
    } else if (!/^[6-9]\d{9}$/.test(form.mobile.trim())) {
      errs.mobile = 'Enter a valid 10-digit mobile number';
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
      await addInquiry({
        studentName: form.studentName.trim().toUpperCase(),
        mobile: form.mobile.trim(),
        address: form.address.trim(),
        interestedCourse: form.interestedCourse as Course,
        visitDate: form.visitDate,
        notes: form.notes.trim(),
        status: 'active',
        academicYear,
      });
      setForm(emptyForm());
      setShowForm(false);
      setActiveTab('active');
      showToast('Inquiry saved successfully.');
    } catch {
      showToast('Failed to save inquiry. Please try again.', true);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setForm(emptyForm());
    setFormErrors({});
    setShowForm(false);
  }

  // ── Row actions ────────────────────────────────────────────────────────────

  async function handleStatusChange(id: string, name: string, status: InquiryStatus) {
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

  function handleBeginEnrollment(id: string, studentName: string, mobile: string, address: string, course: Course) {
    // Store pre-fill data so EnrollStudent can pick it up
    sessionStorage.setItem(
      'smp_inquiry_prefill',
      JSON.stringify({ inquiryId: id, studentName, mobile, address, course })
    );
    // Mark as converted
    void updateInquiryStatus(id, 'converted');
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
          onClick={() => { setShowForm((v) => !v); setFormErrors({}); }}
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

      {/* Inline Add Inquiry form */}
      {showForm && (
        <div className="flex-shrink-0 bg-white border border-blue-200 rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">New Walk-in Inquiry</h3>
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

            {/* Mobile */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Mobile <span className="text-red-500">*</span></label>
              <input
                type="tel"
                value={form.mobile}
                onChange={(e) => handleFormChange('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className={`rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${formErrors.mobile ? 'border-red-400' : 'border-gray-300'}`}
              />
              {formErrors.mobile && <span className="text-[10px] text-red-500">{formErrors.mobile}</span>}
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
              Save Inquiry
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCancel} disabled={saving}>
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
        {/* Export buttons — shown when there are results */}
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
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Name</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-28">Mobile</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-14">Course</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-24">Visit Date</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Address</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Notes</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-52">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayList.map((inq, idx) => (
                <tr key={inq.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{inq.studentName}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap tabular-nums">{inq.mobile}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                      {inq.interestedCourse}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(inq.visitDate)}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={inq.address}>{inq.address || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate italic" title={inq.notes}>{inq.notes || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {inq.status === 'active' && (
                        <>
                          <Button
                            size="sm"
                            className="!bg-green-600 hover:!bg-green-700 border-transparent text-white"
                            loading={actionLoading === inq.id}
                            disabled={actionLoading !== null && actionLoading !== inq.id}
                            onClick={() => handleBeginEnrollment(inq.id, inq.studentName, inq.mobile, inq.address, inq.interestedCourse)}
                          >
                            Begin Enrollment
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={actionLoading === inq.id}
                            disabled={actionLoading !== null && actionLoading !== inq.id}
                            onClick={() => void handleStatusChange(inq.id, inq.studentName, 'cancelled')}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                      {inq.status === 'converted' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={actionLoading === inq.id}
                          disabled={actionLoading !== null && actionLoading !== inq.id}
                          onClick={() => void handleStatusChange(inq.id, inq.studentName, 'active')}
                        >
                          Restore
                        </Button>
                      )}
                      {inq.status === 'cancelled' && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={actionLoading === inq.id}
                            disabled={actionLoading !== null && actionLoading !== inq.id}
                            onClick={() => void handleStatusChange(inq.id, inq.studentName, 'active')}
                          >
                            Restore
                          </Button>
                          <button
                            onClick={() => void handleDelete(inq.id, inq.studentName)}
                            disabled={actionLoading !== null}
                            className="text-[10px] text-red-400 hover:text-red-600 disabled:opacity-50 underline underline-offset-2"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto">
            {displayList.length} inquiry{displayList.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
