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
  }

  function setSubmittedOn(key: DocKey, date: string) {
    if (!docs) return;
    setDocs({ ...docs, [key]: { ...docs[key], submittedOn: date } });
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
  }

  function setReturnedOn(key: DocKey, date: string) {
    if (!docs) return;
    setDocs({ ...docs, [key]: { ...docs[key], returnedOn: date } });
  }

  function setRemarks(key: DocKey, remarks: string) {
    if (!docs) return;
    setDocs({ ...docs, [key]: { ...docs[key], remarks } });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-2xl flex flex-col"
        style={{ width: '780px', maxWidth: '100%', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Manage Documents</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {student.studentNameSSLC}
              <span className="text-gray-300 mx-1.5">·</span>
              {student.course} {student.year}
              <span className="text-gray-300 mx-1.5">·</span>
              {student.academicYear}
              {student.regNumber && (
                <>
                  <span className="text-gray-300 mx-1.5">·</span>
                  Reg: {student.regNumber}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {docs && (
              <>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  submittedCount === total ? 'bg-green-100 text-green-700' :
                  submittedCount === 0     ? 'bg-red-100 text-red-700'     :
                                             'bg-yellow-100 text-yellow-700'
                }`}>
                  {submittedCount}/{total} Submitted
                </span>
                {returnedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {returnedCount} Returned
                  </span>
                )}
              </>
            )}
            <button
              onClick={onClose}
              className="ml-2 text-gray-400 hover:text-gray-700 text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              Loading document records…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-48 text-sm text-red-500">{error}</div>
          ) : docs ? (
            <table className="w-full text-xs border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-7">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Document</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-24">Submitted</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-32">Sub. Date</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-24">Returned</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-32">Ret. Date</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {REQUIRED_DOCS.map(({ key, label }, idx) => {
                  const entry = docs[key];
                  const rowBg =
                    entry.returned  ? 'bg-blue-50/50' :
                    entry.submitted ? 'bg-green-50/50' :
                                      '';
                  return (
                    <tr key={key} className={`${rowBg} transition-colors`}>
                      <td className="px-3 py-2 text-gray-400 text-center">{idx + 1}</td>

                      {/* Document name */}
                      <td className="px-3 py-2 font-medium text-gray-800">{label}</td>

                      {/* Submitted toggle */}
                      <td className="px-3 py-2 text-center">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={entry.submitted}
                            onChange={() => toggleSubmitted(key)}
                            className="w-4 h-4 rounded accent-green-600 cursor-pointer"
                          />
                          <span className={`text-xs font-medium ${entry.submitted ? 'text-green-700' : 'text-gray-400'}`}>
                            {entry.submitted ? 'Yes' : 'No'}
                          </span>
                        </label>
                      </td>

                      {/* Submitted date */}
                      <td className="px-3 py-2">
                        {entry.submitted ? (
                          <input
                            type="date"
                            value={entry.submittedOn}
                            onChange={(e) => setSubmittedOn(key, e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Returned toggle */}
                      <td className="px-3 py-2 text-center">
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
                      <td className="px-3 py-2">
                        {entry.returned ? (
                          <input
                            type="date"
                            value={entry.returnedOn}
                            onChange={(e) => setReturnedOn(key, e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Remarks */}
                      <td className="px-3 py-2">
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
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="text-xs">
            {saveError ? (
              <span className="text-red-600">{saveError}</span>
            ) : saved ? (
              <span className="text-green-600 font-medium">✓ Saved successfully</span>
            ) : (
              <span className="text-gray-400">Green = submitted · Blue = returned to student</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
            {docs && (
              <button
                onClick={() => printStudentDocs(student, docs)}
                className="px-4 py-1.5 text-sm rounded border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 transition-colors flex items-center gap-1.5"
              >
                🖨️ Print
              </button>
            )}
            <button
              onClick={() => void handleSave()}
              disabled={saving || loading || !docs}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
