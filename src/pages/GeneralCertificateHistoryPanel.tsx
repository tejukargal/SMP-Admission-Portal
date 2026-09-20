import { useState, useEffect, type ChangeEvent } from 'react';
import { getAllStudents } from '../services/studentService';
import { clearTcHistory, type TCRecord } from '../services/tcService';
import { clearPcHistory, type PCRecord } from '../services/pcService';
import type { Student } from '../types';

type StudentWithHistory = Student & { tcHistory?: TCRecord[]; pcHistory?: PCRecord[] };

export function GeneralCertificateHistoryPanel() {
  const [tcQuery, setTcQuery] = useState('');
  const [tcStudents, setTcStudents] = useState<StudentWithHistory[] | null>(null);
  const [tcFetching, setTcFetching] = useState(false);
  const [tcConfirmId, setTcConfirmId] = useState<string | null>(null);
  const [tcClearingId, setTcClearingId] = useState<string | null>(null);
  const [tcClearMsg, setTcClearMsg] = useState('');
  const [tcClearError, setTcClearError] = useState('');
  const [pcConfirmId, setPcConfirmId] = useState<string | null>(null);
  const [pcClearingId, setPcClearingId] = useState<string | null>(null);

  // Fetch all students once on first search
  useEffect(() => {
    if (!tcQuery.trim() || tcStudents !== null || tcFetching) return;
    setTcFetching(true);
    getAllStudents()
      .then((list) => setTcStudents(list as StudentWithHistory[]))
      .catch(() => setTcStudents([]))
      .finally(() => setTcFetching(false));
  }, [tcQuery, tcStudents, tcFetching]);

  const tcQueryLower = tcQuery.toLowerCase().trim();
  const tcResults: StudentWithHistory[] =
    tcStudents && tcQueryLower.length >= 2
      ? tcStudents
          .filter((s) =>
            s.studentNameSSLC.toLowerCase().includes(tcQueryLower) ||
            s.regNumber.toLowerCase().includes(tcQueryLower) ||
            s.fatherName.toLowerCase().includes(tcQueryLower)
          )
          .slice(0, 12)
      : [];

  async function handleClearTcHistory(student: StudentWithHistory) {
    setTcClearingId(student.id);
    setTcClearMsg('');
    setTcClearError('');
    try {
      await clearTcHistory(student.id, student.tcHistory ?? []);
      setTcStudents((prev) =>
        prev?.map((s) => s.id === student.id ? { ...s, tcHistory: [] } : s) ?? null
      );
      setTcConfirmId(null);
      setTcClearMsg(`TC history cleared for ${student.studentNameSSLC}.`);
    } catch (err: unknown) {
      setTcClearError(err instanceof Error ? err.message : 'Failed to clear TC history.');
    } finally {
      setTcClearingId(null);
    }
  }

  async function handleClearPcHistory(student: StudentWithHistory) {
    setPcClearingId(student.id);
    setTcClearMsg('');
    setTcClearError('');
    try {
      await clearPcHistory(student.id);
      setTcStudents((prev) =>
        prev?.map((s) => s.id === student.id ? { ...s, pcHistory: [] } : s) ?? null
      );
      setPcConfirmId(null);
      setTcClearMsg(`PC history cleared for ${student.studentNameSSLC}.`);
    } catch (err: unknown) {
      setTcClearError(err instanceof Error ? err.message : 'Failed to clear PC history.');
    } finally {
      setPcClearingId(null);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Certificate History Management</h3>
          <p className="text-xs text-gray-400 mt-0.5">Search a student and clear their Transfer Certificate or Provisional Certificate issuance history</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              value={tcQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setTcQuery(e.target.value);
                setTcClearMsg('');
                setTcClearError('');
                setTcConfirmId(null);
              }}
              placeholder="Search by name, register number or father name…"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 pr-8"
            />
            {tcFetching && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Feedback messages */}
          {tcClearMsg && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded px-3 py-2">{tcClearMsg}</p>
          )}
          {tcClearError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{tcClearError}</p>
          )}

          {/* Results */}
          {tcQueryLower.length >= 2 && !tcFetching && tcResults.length === 0 && tcStudents !== null && (
            <p className="text-xs text-gray-400 text-center py-3">No students found for "{tcQuery}".</p>
          )}

          {tcResults.length > 0 && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
              {tcResults.map((s) => {
                const tcCount        = s.tcHistory?.length ?? 0;
                const pcCount        = s.pcHistory?.length ?? 0;
                const isTcConfirming = tcConfirmId === s.id;
                const isPcConfirming = pcConfirmId === s.id;
                const isTcClearing   = tcClearingId === s.id;
                const isPcClearing   = pcClearingId === s.id;
                return (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      {/* Student info */}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{s.studentNameSSLC}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {s.regNumber || '—'} · {s.course} · {s.year} · {s.academicYear}
                        </p>
                        <p className="text-xs text-gray-400">Father: {s.fatherName}</p>
                      </div>
                      {/* Badges + actions */}
                      <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
                        {/* TC row */}
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            tcCount === 0 ? 'bg-gray-100 text-gray-400'
                            : tcCount === 1 ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>
                            {tcCount === 0 ? 'No TCs' : `${tcCount} TC${tcCount > 1 ? 's' : ''}`}
                          </span>
                          {!isTcConfirming && !isPcConfirming && (
                            <button
                              disabled={tcCount === 0 || isTcClearing}
                              onClick={() => { setTcConfirmId(s.id); setPcConfirmId(null); setTcClearMsg(''); setTcClearError(''); }}
                              className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Clear TC
                            </button>
                          )}
                        </div>
                        {/* PC row */}
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            pcCount === 0 ? 'bg-gray-100 text-gray-400'
                            : pcCount === 1 ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>
                            {pcCount === 0 ? 'No PCs' : `${pcCount} PC${pcCount > 1 ? 's' : ''}`}
                          </span>
                          {!isTcConfirming && !isPcConfirming && (
                            <button
                              disabled={pcCount === 0 || isPcClearing}
                              onClick={() => { setPcConfirmId(s.id); setTcConfirmId(null); setTcClearMsg(''); setTcClearError(''); }}
                              className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Clear PC
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* TC confirm row */}
                    {isTcConfirming && (
                      <div className="mt-2.5 flex items-center gap-2 bg-red-50 border border-red-100 rounded px-3 py-2">
                        <p className="text-xs text-red-700 flex-1">
                          Clear {tcCount} TC record{tcCount > 1 ? 's' : ''} for <strong>{s.studentNameSSLC}</strong>? This cannot be undone.
                        </p>
                        <button
                          onClick={() => setTcConfirmId(null)}
                          className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={isTcClearing}
                          onClick={() => { void handleClearTcHistory(s); }}
                          className="text-xs px-2.5 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
                        >
                          {isTcClearing ? 'Clearing…' : 'Yes, Clear'}
                        </button>
                      </div>
                    )}

                    {/* PC confirm row */}
                    {isPcConfirming && (
                      <div className="mt-2.5 flex items-center gap-2 bg-red-50 border border-red-100 rounded px-3 py-2">
                        <p className="text-xs text-red-700 flex-1">
                          Clear {pcCount} PC record{pcCount > 1 ? 's' : ''} for <strong>{s.studentNameSSLC}</strong>? This cannot be undone.
                        </p>
                        <button
                          onClick={() => setPcConfirmId(null)}
                          className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={isPcClearing}
                          onClick={() => { void handleClearPcHistory(s); }}
                          className="text-xs px-2.5 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
                        >
                          {isPcClearing ? 'Clearing…' : 'Yes, Clear'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tcQueryLower.length < 2 && (
            <p className="text-xs text-gray-400">Type at least 2 characters to search.</p>
          )}
        </div>
      </div>
    </div>
  );
}
