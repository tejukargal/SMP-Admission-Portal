import { useEffect, useMemo, useState } from 'react';
import { getAllStudentDocuments, mergeWithDefaults } from '../../services/studentDocumentService';
import { printDocStatus } from '../../utils/printDocStatus';
import type { DocRecord, Student } from '../../types';
import { REQUIRED_DOCS } from '../../types';

interface Props {
  students: Student[];
  onManage: (student: Student) => void;
  onClose: () => void;
}

type FilterMode = 'any' | 'none';

export function MissingDocsModal({ students, onManage, onClose }: Props) {
  const [docMap, setDocMap] = useState<Map<string, DocRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [filterMode, setFilterMode] = useState<FilterMode>('any');
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAllStudentDocuments()
      .then((records) => {
        if (!cancelled) {
          const map = new Map<string, DocRecord>();
          for (const r of records) {
            map.set(r.studentId, mergeWithDefaults(r.docs));
          }
          setDocMap(map);
        }
      })
      .catch(() => { if (!cancelled) setLoadError('Failed to load document records.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const enriched = useMemo(() => {
    return students
      .map((s) => {
        const docs = docMap.get(s.id) ?? mergeWithDefaults({});
        const missing = REQUIRED_DOCS.filter(({ key }) => !docs[key].notRequired && !docs[key].submitted).map(({ label }) => label);
        const requiredTotal = REQUIRED_DOCS.filter(({ key }) => !docs[key].notRequired).length;
        const submittedCount = requiredTotal - missing.length;
        return { student: s, docs, missing, submittedCount, requiredTotal };
      })
      .filter(({ missing, requiredTotal }) =>
        filterMode === 'none' ? missing.length === requiredTotal : missing.length > 0
      )
      .filter(({ student: s }) => {
        const q = search.trim().toUpperCase();
        if (!q) return true;
        return (
          s.studentNameSSLC.toUpperCase().includes(q) ||
          s.regNumber?.toUpperCase().includes(q)
        );
      })
      .filter(({ student: s }) => {
        if (courseFilter && s.course !== courseFilter) return false;
        if (yearFilter   && s.year   !== yearFilter)   return false;
        return true;
      })
      .sort((a, b) => a.submittedCount - b.submittedCount);
  }, [students, docMap, filterMode, search, courseFilter, yearFilter]);

  const completeCount = !loading
    ? students.filter((s) => {
        const docs = docMap.get(s.id) ?? mergeWithDefaults({});
        return REQUIRED_DOCS.every(({ key }) => docs[key].notRequired || docs[key].submitted);
      }).length
    : 0;

  const tableHeader = (
    <tr>
      <th className="px-3 py-2.5 text-left font-semibold text-gray-400 bg-gray-50 w-8 border-b border-gray-200">#</th>
      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 bg-gray-50 border-b border-gray-200">Student</th>
      <th className="px-3 py-2.5 text-left font-semibold text-gray-600 bg-gray-50 w-28 border-b border-gray-200">Course / Year</th>
      <th className="px-3 py-2.5 text-center font-semibold text-amber-700 bg-amber-50/80 w-28 whitespace-nowrap border-b border-amber-100">Submitted</th>
      <th className="px-3 py-2.5 text-left font-semibold text-red-600 bg-red-50/70 border-b border-red-100">Pending Documents</th>
    </tr>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{ animation: 'backdrop-enter 0.18s ease-out' }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '920px', maxWidth: '100%', height: '84vh', animation: 'modal-enter 0.22s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-700 to-slate-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/15 shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white tracking-tight">Document Status</h2>
              <p className="text-[11px] text-white/55 mt-0.5">
                {loading
                  ? 'Loading records…'
                  : `${enriched.length} student${enriched.length !== 1 ? 's' : ''} with pending documents`}
              </p>
            </div>
          </div>
          {!loading && (
            <div className="flex items-center gap-2 mr-3">
              {completeCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full text-[10px] font-semibold px-2.5 py-1 bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {completeCount} complete
                </span>
              )}
              {enriched.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full text-[10px] font-semibold px-2.5 py-1 bg-amber-400/20 text-amber-200 border border-amber-400/30">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  {enriched.length} pending
                </span>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white/15 hover:bg-white/30 text-white text-lg leading-none transition-colors cursor-pointer shrink-0"
          >
            ×
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2.5 shrink-0 flex-wrap bg-gray-50/50">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search name / reg…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-44 rounded-lg border border-gray-200 bg-white text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-400 placeholder:text-gray-400"
            />
          </div>

          {/* Course */}
          <select
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <option value="">All Courses</option>
            {['CE', 'ME', 'EC', 'CS', 'EE'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Year */}
          <select
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="">All Years</option>
            <option value="1ST YEAR">1st Year</option>
            <option value="2ND YEAR">2nd Year</option>
            <option value="3RD YEAR">3rd Year</option>
          </select>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs bg-white ml-1">
            <button
              onClick={() => setFilterMode('any')}
              className={`px-3 py-1.5 transition-colors ${filterMode === 'any' ? 'bg-slate-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Any Missing
            </button>
            <button
              onClick={() => setFilterMode('none')}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${filterMode === 'none' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              None Submitted
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="flex-1 overflow-auto min-h-0 scroll-emerald">
          {loading ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">{tableHeader}</thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-3"><div className="skeleton h-3 w-4" /></td>
                    <td className="px-3 py-3">
                      <div className="skeleton h-3 mb-1.5" style={{ width: `${50 + (i % 3) * 15}%` }} />
                      <div className="skeleton h-2.5 w-16" />
                    </td>
                    <td className="px-3 py-3"><div className="skeleton h-3 w-16" /></td>
                    <td className="px-3 py-3 text-center"><div className="skeleton h-5 w-16 mx-auto rounded-full" /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {Array.from({ length: 2 + (i % 3) }).map((_, j) => (
                          <div key={j} className="skeleton h-4 w-16 rounded" />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <span className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
              <span className="text-sm text-red-500">{loadError}</span>
            </div>
          ) : enriched.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3" style={{ animation: 'content-enter 0.3s ease-out' }}>
              <span className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">All documents accounted for</p>
                <p className="text-xs text-gray-400 mt-1">Every student has submitted all required documents.</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">{tableHeader}</thead>
              <tbody className="divide-y divide-gray-100">
                {enriched.map(({ student, missing, submittedCount, requiredTotal }, idx) => (
                  <tr
                    key={student.id}
                    className="hover:bg-gray-50/70 transition-colors cursor-pointer select-none"
                    onDoubleClick={() => onManage(student)}
                    title="Double-click to manage documents"
                  >
                    <td className="px-3 py-2.5 text-gray-400 font-mono">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-gray-900">{student.studentNameSSLC}</div>
                      <div className="text-gray-400 text-[10px] mt-0.5 font-mono">{student.regNumber || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold text-gray-600 border-gray-200 bg-white">
                          {student.course}
                        </span>
                        <span className="text-gray-400 text-[10px]">
                          {student.year === '1ST YEAR' ? '1st' : student.year === '2ND YEAR' ? '2nd' : '3rd'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center bg-amber-50/30">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          submittedCount === requiredTotal ? 'bg-emerald-100 text-emerald-700' :
                          submittedCount === 0             ? 'bg-red-100 text-red-600'         :
                                                             'bg-amber-100 text-amber-700'
                        }`}>
                          {submittedCount} / {requiredTotal}
                        </span>
                        <div className="w-12 h-1 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              submittedCount === requiredTotal ? 'bg-emerald-500' :
                              submittedCount === 0             ? 'bg-red-400'     :
                                                                 'bg-amber-400'
                            }`}
                            style={{ width: `${requiredTotal > 0 ? (submittedCount / requiredTotal) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 bg-red-50/20">
                      <div className="flex flex-wrap gap-1">
                        {missing.slice(0, 4).map((m) => (
                          <span key={m} className="bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded-md text-[10px] whitespace-nowrap font-medium">
                            {m}
                          </span>
                        ))}
                        {missing.length > 4 && (
                          <span className="bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded-md text-[10px] font-medium">
                            +{missing.length - 4} more
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 shrink-0">
          {!loading && !loadError && (
            <div className="flex flex-wrap gap-2 mb-3" style={{ animation: 'content-enter 0.3s ease-out' }}>
              <div className="flex-1 min-w-[80px] rounded-xl bg-white border border-gray-200 px-3 py-2">
                <div className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Total</div>
                <div className="text-sm font-bold text-gray-800 mt-0.5">{students.length}</div>
              </div>
              <div className="flex-1 min-w-[80px] rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                <div className="text-[9px] text-emerald-500 font-semibold uppercase tracking-wider">Complete</div>
                <div className="text-sm font-bold text-emerald-700 mt-0.5">{completeCount}</div>
                <div className="text-[9px] text-gray-400 mt-0.5">all docs in</div>
              </div>
              <div className="flex-1 min-w-[80px] rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                <div className="text-[9px] text-amber-500 font-semibold uppercase tracking-wider">Pending</div>
                <div className="text-sm font-bold text-amber-700 mt-0.5">{enriched.length}</div>
                <div className="text-[9px] text-gray-400 mt-0.5">need follow-up</div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Showing {enriched.length} of {students.length} students · Double-click a row to manage documents
            </span>
            <div className="flex gap-2">
              {enriched.length > 0 && (
                <button
                  onClick={() => printDocStatus(enriched)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  Print PDF
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 hover:border-gray-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
