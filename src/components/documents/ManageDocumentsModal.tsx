import { useEffect, useState } from 'react';
import { useStudentDocuments } from '../../hooks/useStudentDocuments';
import { saveStudentDocuments } from '../../services/studentDocumentService';
import { printStudentDocs } from '../../utils/printStudentDocs';
import type { Student, DocKey } from '../../types';
import { REQUIRED_DOCS } from '../../types';

interface Props {
  student: Student;
  onClose: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ManageDocumentsModal({ student, onClose }: Props) {
  const { docs: loadedDocs, loading, error } = useStudentDocuments(student.id);
  const [docs, setDocs] = useState(loadedDocs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (loadedDocs) setDocs(loadedDocs);
  }, [loadedDocs]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function markDirty() { setSaved(false); }

  function toggleSubmitted(key: DocKey) {
    if (!docs) return;
    const entry = docs[key];
    const submitted = !entry.submitted;
    setDocs({
      ...docs,
      [key]: {
        ...entry,
        submitted,
        submittedOn: submitted ? (entry.submittedOn || todayStr()) : '',
        returned: submitted ? entry.returned : false,
        returnedOn: submitted ? entry.returnedOn : '',
      },
    });
    markDirty();
  }

  function setSubmittedOn(key: DocKey, date: string) {
    if (!docs) return;
    setDocs({ ...docs, [key]: { ...docs[key], submittedOn: date } });
    markDirty();
  }

  function toggleReturned(key: DocKey) {
    if (!docs) return;
    const entry = docs[key];
    const returned = !entry.returned;
    setDocs({
      ...docs,
      [key]: {
        ...entry,
        returned,
        returnedOn: returned ? (entry.returnedOn || todayStr()) : '',
      },
    });
    markDirty();
  }

  function setReturnedOn(key: DocKey, date: string) {
    if (!docs) return;
    setDocs({ ...docs, [key]: { ...docs[key], returnedOn: date } });
    markDirty();
  }

  function setRemarks(key: DocKey, remarks: string) {
    if (!docs) return;
    setDocs({ ...docs, [key]: { ...docs[key], remarks } });
    markDirty();
  }

  async function handleSave() {
    if (!docs) return;
    setSaving(true);
    setSaveError('');
    try {
      await saveStudentDocuments(student.id, docs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const submittedCount = docs ? REQUIRED_DOCS.filter(({ key }) => docs[key].submitted).length : 0;
  const returnedCount  = docs ? REQUIRED_DOCS.filter(({ key }) => docs[key].returned).length  : 0;
  const total = REQUIRED_DOCS.length;

  const headerGradient = loading
    ? 'from-slate-700 to-slate-900'
    : docs
      ? submittedCount === total
        ? 'from-emerald-600 to-emerald-800'
        : submittedCount === 0
          ? 'from-red-600 to-red-800'
          : 'from-amber-500 to-amber-700'
      : 'from-slate-700 to-slate-900';

  const tableHeader = (
    <tr>
      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 bg-gray-50 w-7">#</th>
      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 bg-gray-50">Document</th>
      <th className="px-3 py-2.5 text-center font-semibold bg-emerald-50 text-emerald-600 w-24 whitespace-nowrap">Submitted</th>
      <th className="px-3 py-2.5 text-left font-semibold text-emerald-700 w-32 whitespace-nowrap" style={{ background: 'rgb(236 253 245 / 0.6)' }}>Sub. Date</th>
      <th className="px-3 py-2.5 text-center font-semibold bg-blue-50 text-blue-600 w-24 whitespace-nowrap">Returned</th>
      <th className="px-3 py-2.5 text-left font-semibold text-blue-700 w-32 whitespace-nowrap" style={{ background: 'rgb(239 246 255 / 0.6)' }}>Ret. Date</th>
      <th className="px-3 py-2.5 text-left font-semibold bg-slate-50 text-slate-600">Remarks</th>
    </tr>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ animation: 'backdrop-enter 0.18s ease-out' }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '820px', maxWidth: '100%', height: 'calc(100vh - 3rem)', animation: 'modal-enter 0.22s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className={`px-5 py-3.5 bg-gradient-to-r ${headerGradient} flex items-center justify-between shrink-0`}>
          <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              Manage Documents
            </h2>
            {docs && !loading && (
              <>
                <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40">
                  {submittedCount}/{total} Submitted
                  <span className="opacity-60">·</span>
                  <span>{submittedCount === total ? '✓ Complete' : `${total - submittedCount} pending`}</span>
                </span>
                {returnedCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40">
                    {returnedCount} Returned
                  </span>
                )}
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 ml-3"
          >
            ×
          </button>
        </div>

        {/* ── Student info bar ── */}
        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {[
              { label: 'Student', value: student.studentNameSSLC, bold: true },
              { label: 'Course', value: student.course, bold: false },
              { label: 'Year', value: student.year, bold: false },
              { label: 'Academic Year', value: student.academicYear, bold: false },
              ...(student.regNumber ? [{ label: 'Reg No', value: student.regNumber, bold: false }] : []),
            ].map(({ label, value, bold }) => (
              <div key={label} className="flex flex-col min-w-0">
                <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{label}</span>
                <span className={`text-xs truncate ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div
          className="flex-1 overflow-auto min-h-0 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {loading ? (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-gray-200">
                {tableHeader}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: REQUIRED_DOCS.length }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5 text-center bg-gray-50"><div className="skeleton h-3 w-4 mx-auto" /></td>
                    <td className="px-3 py-2.5"><div className="skeleton h-3" style={{ width: `${60 + (i % 4) * 10}%` }} /></td>
                    <td className="px-3 py-2.5 text-center bg-emerald-50/20"><div className="skeleton h-4 w-4 mx-auto rounded" /></td>
                    <td className="px-3 py-2.5 bg-emerald-50/10"><div className="skeleton h-3 w-20" /></td>
                    <td className="px-3 py-2.5 text-center bg-blue-50/20"><div className="skeleton h-4 w-4 mx-auto rounded" /></td>
                    <td className="px-3 py-2.5 bg-blue-50/10"><div className="skeleton h-3 w-20" /></td>
                    <td className="px-3 py-2.5 bg-slate-50/20"><div className="skeleton h-3 w-3/4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : error ? (
            <div className="flex items-center justify-center h-48 text-sm text-red-500">{error}</div>
          ) : docs ? (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-gray-200">
                {tableHeader}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {REQUIRED_DOCS.map(({ key, label }, idx) => {
                  const entry = docs[key];
                  const rowBg =
                    entry.returned  ? 'bg-blue-50/30' :
                    entry.submitted ? 'bg-emerald-50/30' :
                                      '';
                  return (
                    <tr key={key} className={`${rowBg} hover:bg-gray-50/80 transition-colors`}>
                      <td className="px-3 py-2 text-gray-400 text-center">{idx + 1}</td>

                      {/* Document name */}
                      <td className="px-3 py-2 font-medium text-gray-800">{label}</td>

                      {/* Submitted toggle */}
                      <td className="px-3 py-2 text-center bg-emerald-50/20">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={entry.submitted}
                            onChange={() => toggleSubmitted(key)}
                            className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
                          />
                          <span className={`text-xs font-medium ${entry.submitted ? 'text-emerald-700' : 'text-gray-400'}`}>
                            {entry.submitted ? 'Yes' : 'No'}
                          </span>
                        </label>
                      </td>

                      {/* Submitted date */}
                      <td className="px-3 py-2 bg-emerald-50/10">
                        {entry.submitted ? (
                          <input
                            type="date"
                            value={entry.submittedOn}
                            onChange={(e) => setSubmittedOn(key, e.target.value)}
                            className="w-full rounded border border-emerald-200 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Returned toggle */}
                      <td className="px-3 py-2 text-center bg-blue-50/20">
                        <label className={`inline-flex items-center gap-1.5 select-none ${entry.submitted ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}>
                          <input
                            type="checkbox"
                            checked={entry.returned}
                            disabled={!entry.submitted}
                            onChange={() => toggleReturned(key)}
                            className="w-4 h-4 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span className={`text-xs font-medium ${entry.returned ? 'text-blue-700' : 'text-gray-400'}`}>
                            {entry.returned ? 'Yes' : 'No'}
                          </span>
                        </label>
                      </td>

                      {/* Returned date */}
                      <td className="px-3 py-2 bg-blue-50/10">
                        {entry.returned ? (
                          <input
                            type="date"
                            value={entry.returnedOn}
                            onChange={(e) => setReturnedOn(key, e.target.value)}
                            className="w-full rounded border border-blue-200 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Remarks */}
                      <td className="px-3 py-2 bg-slate-50/20">
                        <input
                          type="text"
                          value={entry.remarks}
                          onChange={(e) => setRemarks(key, e.target.value)}
                          placeholder="—"
                          className="w-full rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 placeholder:text-gray-300 bg-transparent"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0">
          {docs && !loading && (
            <div className="flex flex-wrap gap-2 mb-3" style={{ animation: 'content-enter 0.35s ease-out' }}>
              <div className="flex-1 min-w-[80px] rounded-xl bg-white border border-gray-200 px-3 py-2">
                <div className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Total</div>
                <div className="text-sm font-bold text-gray-800 mt-0.5">{total}</div>
              </div>
              <div className="flex-1 min-w-[80px] rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                <div className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">Submitted</div>
                <div className="text-sm font-bold text-emerald-700 mt-0.5">{submittedCount}</div>
                {submittedCount < total && (
                  <div className="text-[9px] text-gray-400 mt-0.5">{total - submittedCount} pending</div>
                )}
              </div>
              <div className="flex-1 min-w-[80px] rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                <div className="text-[9px] text-blue-400 font-semibold uppercase tracking-wider">Returned</div>
                <div className="text-sm font-bold text-blue-700 mt-0.5">{returnedCount}</div>
                {submittedCount > 0 && returnedCount < submittedCount && (
                  <div className="text-[9px] text-gray-400 mt-0.5">{submittedCount - returnedCount} with college</div>
                )}
              </div>
              {saveError && (
                <div className="flex-1 min-w-[80px] rounded-xl bg-red-50 border border-red-200 px-3 py-2">
                  <div className="text-[9px] text-red-400 font-semibold uppercase tracking-wider">Error</div>
                  <div className="text-xs font-medium text-red-600 mt-0.5">{saveError}</div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              Close
            </button>
            {docs && (
              <button
                onClick={() => printStudentDocs(student, docs)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 cursor-pointer transition-colors flex items-center gap-1.5"
              >
                🖨️ Print
              </button>
            )}
            <button
              onClick={() => void handleSave()}
              disabled={saving || saved || loading || !docs}
              className="rounded-lg bg-blue-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* ── Success toast ── */}
        {saved && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-gray-900 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg pointer-events-none">
            <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Documents saved successfully
          </div>
        )}
      </div>
    </div>
  );
}
