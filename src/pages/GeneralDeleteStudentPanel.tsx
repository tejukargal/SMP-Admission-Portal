import { useState, useEffect, type ChangeEvent } from 'react';
import { useSettings } from '../hooks/useSettings';
import { getStudentsByAcademicYear, deleteStudent } from '../services/studentService';
import { RESET_PASSKEY } from '../config/constants';
import { Button } from '../components/common/Button';
import type { AcademicYear, Student } from '../types';

export function GeneralDeleteStudentPanel() {
  const { settings } = useSettings();
  const currentValue = settings?.currentAcademicYear || '';

  const [delStudentQuery, setDelStudentQuery] = useState('');
  const [delStudentList, setDelStudentList] = useState<Student[] | null>(null);
  const [delStudentFetching, setDelStudentFetching] = useState(false);
  const [delStudentTarget, setDelStudentTarget] = useState<Student | null>(null);
  const [delStudentPasskey, setDelStudentPasskey] = useState('');
  const [delStudentPasskeyError, setDelStudentPasskeyError] = useState('');
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [delStudentMsg, setDelStudentMsg] = useState('');
  const [delStudentError, setDelStudentError] = useState('');

  // Fetch current-year students once when search is first used
  useEffect(() => {
    if (!delStudentQuery.trim() || delStudentList !== null || delStudentFetching || !currentValue) return;
    setDelStudentFetching(true);
    getStudentsByAcademicYear(currentValue as AcademicYear)
      .then((list) => setDelStudentList(list))
      .catch(() => setDelStudentList([]))
      .finally(() => setDelStudentFetching(false));
  }, [delStudentQuery, delStudentList, delStudentFetching, currentValue]);

  const delStudentQueryLower = delStudentQuery.toLowerCase().trim();
  const delStudentResults: Student[] =
    delStudentList && delStudentQueryLower.length >= 2
      ? delStudentList
          .filter((s) =>
            s.studentNameSSLC.toLowerCase().includes(delStudentQueryLower) ||
            s.regNumber.toLowerCase().includes(delStudentQueryLower) ||
            s.fatherName.toLowerCase().includes(delStudentQueryLower)
          )
          .slice(0, 10)
      : [];

  async function handleDeleteStudent() {
    if (!delStudentTarget) return;
    if (delStudentPasskey !== RESET_PASSKEY) {
      setDelStudentPasskeyError('Incorrect passkey.');
      return;
    }
    setDeletingStudent(true);
    setDelStudentError('');
    try {
      await deleteStudent(delStudentTarget.id);
      const name = delStudentTarget.studentNameSSLC;
      setDelStudentList((prev) => prev?.filter((s) => s.id !== delStudentTarget.id) ?? null);
      setDelStudentTarget(null);
      setDelStudentPasskey('');
      setDelStudentPasskeyError('');
      setDelStudentQuery('');
      setDelStudentMsg(`${name} has been permanently deleted.`);
    } catch (err: unknown) {
      setDelStudentError(err instanceof Error ? err.message : 'Failed to delete student.');
    } finally {
      setDeletingStudent(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-lg shadow-sm border border-orange-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <div className="px-6 py-4 border-b border-orange-100 bg-orange-50/50">
          <h3 className="text-sm font-semibold text-orange-700 uppercase tracking-wider">Delete Student</h3>
          <p className="text-xs text-orange-400 mt-0.5">Permanently remove a student from <span className="font-medium text-orange-600">{currentValue || '—'}</span> — all associated fee records, overrides, and documents are also deleted</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          {delStudentMsg && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded px-3 py-2">{delStudentMsg}</p>
          )}
          {delStudentError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{delStudentError}</p>
          )}

          <div className="relative">
            <input
              type="text"
              value={delStudentQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setDelStudentQuery(e.target.value);
                setDelStudentMsg('');
                setDelStudentError('');
              }}
              placeholder="Search by name, register number or father name…"
              disabled={!currentValue}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 pr-8 disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
            {delStudentFetching && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
              </div>
            )}
          </div>

          {delStudentQueryLower.length >= 2 && !delStudentFetching && delStudentResults.length === 0 && delStudentList !== null && (
            <p className="text-xs text-gray-400 text-center py-3">No students found in {currentValue} for "{delStudentQuery}".</p>
          )}

          {delStudentResults.length > 0 && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
              {delStudentResults.map((s) => (
                <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.studentNameSSLC}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.regNumber || '—'} · {s.course} · {s.year} · {s.academicYear}
                    </p>
                    <p className="text-xs text-gray-400">Father: {s.fatherName}</p>
                  </div>
                  <button
                    onClick={() => { setDelStudentTarget(s); setDelStudentPasskey(''); setDelStudentPasskeyError(''); }}
                    className="shrink-0 text-xs px-3 py-1.5 rounded border border-red-300 text-red-600 bg-white hover:bg-red-50 transition-colors font-medium"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Student Passkey Modal */}
      {delStudentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setDelStudentTarget(null); setDelStudentPasskey(''); setDelStudentPasskeyError(''); }}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Delete Student</h3>
            <p className="text-sm text-gray-600 mb-4">
              Permanently delete{' '}
              <span className="font-semibold text-red-600">{delStudentTarget.studentNameSSLC}</span>
              {' '}({delStudentTarget.regNumber || '—'}, {delStudentTarget.course}, {delStudentTarget.year})?
              This also deletes all their fee records, overrides, and documents. Enter the passkey to continue.
            </p>

            <label className="text-sm font-medium text-gray-700 block mb-1">Passkey</label>
            <input
              type="password"
              value={delStudentPasskey}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setDelStudentPasskey(e.target.value);
                setDelStudentPasskeyError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { void handleDeleteStudent(); } }}
              placeholder="Enter passkey"
              className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm mb-1 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                delStudentPasskeyError ? 'border-red-500' : 'border-gray-300'
              }`}
              autoFocus
            />
            {delStudentPasskeyError && (
              <p className="text-xs text-red-600 mb-3">{delStudentPasskeyError}</p>
            )}
            {!delStudentPasskeyError && <div className="mb-3" />}

            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => { setDelStudentTarget(null); setDelStudentPasskey(''); setDelStudentPasskeyError(''); }}
                disabled={deletingStudent}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={() => { void handleDeleteStudent(); }} loading={deletingStudent}>
                Delete Student
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
