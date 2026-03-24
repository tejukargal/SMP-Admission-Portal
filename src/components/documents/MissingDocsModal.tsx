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

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const enriched = useMemo(() => {
    return students
      .map((s) => {
        const docs = docMap.get(s.id) ?? mergeWithDefaults({});
        const missing = REQUIRED_DOCS.filter(({ key }) => !docs[key].submitted).map(({ label }) => label);
        const submittedCount = REQUIRED_DOCS.length - missing.length;
        return { student: s, docs, missing, submittedCount };
      })
      .filter(({ missing }) =>
        filterMode === 'none' ? missing.length === REQUIRED_DOCS.length : missing.length > 0
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

  const total = REQUIRED_DOCS.length;
  const fsBtn = 'px-3 py-1.5 text-xs border border-gray-200 rounded bg-white text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}
      style={{ animation: 'backdrop-enter 0.18s ease-out' }}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-2xl flex flex-col"
        style={{ width: '900px', maxWidth: '100%', height: '82vh', animation: 'modal-enter 0.22s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Document Status — All Students</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading
                ? 'Loading…'
                : `${enriched.length} student${enriched.length !== 1 ? 's' : ''} with pending documents`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none ml-4">×</button>
        </div>

        {/* ── Filters ── */}
        <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0 flex-wrap">
          <input
            type="text"
            placeholder="Search name / reg…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select className={fsBtn} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
            <option value="">All Courses</option>
            {['CE', 'ME', 'EC', 'CS', 'EE'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={fsBtn} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="">All Years</option>
            <option value="1ST YEAR">1ST YEAR</option>
            <option value="2ND YEAR">2ND YEAR</option>
            <option value="3RD YEAR">3RD YEAR</option>
          </select>
          <div className="flex rounded border border-gray-200 overflow-hidden text-xs ml-1">
            <button
              onClick={() => setFilterMode('any')}
              className={`px-3 py-1.5 transition-colors ${filterMode === 'any' ? 'bg-blue-600 text-white' : 'text-gray-600 bg-white hover:bg-gray-50'}`}
            >
              Any Missing
            </button>
            <button
              onClick={() => setFilterMode('none')}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${filterMode === 'none' ? 'bg-red-600 text-white' : 'text-gray-600 bg-white hover:bg-gray-50'}`}
            >
              None Submitted
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-8">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Student</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-28">Course / Year</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-24">Submitted</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Pending Documents</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5"><div className="skeleton h-3 w-4" /></td>
                    <td className="px-3 py-2.5">
                      <div className="skeleton h-3 mb-1.5" style={{ width: `${50 + (i % 3) * 15}%` }} />
                      <div className="skeleton h-2.5 w-16" />
                    </td>
                    <td className="px-3 py-2.5"><div className="skeleton h-3 w-16" /></td>
                    <td className="px-3 py-2.5 text-center"><div className="skeleton h-5 w-12 mx-auto rounded-full" /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        {Array.from({ length: 2 + (i % 3) }).map((_, j) => (
                          <div key={j} className="skeleton h-4 w-16 rounded" />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><div className="skeleton h-3 w-14" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : loadError ? (
            <div className="flex items-center justify-center h-48 text-sm text-red-500">{loadError}</div>
          ) : enriched.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <span className="text-2xl">✓</span>
              <span className="text-sm text-gray-400">All students have submitted all documents.</span>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-8">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Student</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-28">Course / Year</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-24">Submitted</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Pending Documents</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {enriched.map(({ student, missing, submittedCount }, idx) => (
                  <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-900">{student.studentNameSSLC}</div>
                      <div className="text-gray-400 mt-0.5">{student.regNumber || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {student.course}
                      <span className="text-gray-300 mx-1">·</span>
                      {student.year === '1ST YEAR' ? '1st' : student.year === '2ND YEAR' ? '2nd' : '3rd'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full font-medium ${
                        submittedCount === total ? 'bg-green-100 text-green-700' :
                        submittedCount === 0     ? 'bg-red-100 text-red-600'     :
                                                   'bg-yellow-100 text-yellow-700'
                      }`}>
                        {submittedCount} / {total}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {missing.slice(0, 4).map((m) => (
                          <span key={m} className="bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                            {m}
                          </span>
                        ))}
                        {missing.length > 4 && (
                          <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">
                            +{missing.length - 4} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => onManage(student)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline whitespace-nowrap"
                      >
                        Manage →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-gray-400">
            Showing {enriched.length} of {students.length} students for current academic year.
          </span>
          <div className="flex gap-2">
            {enriched.length > 0 && (
              <button
                onClick={() => printDocStatus(enriched)}
                className="px-3 py-1.5 rounded border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 text-xs transition-colors flex items-center gap-1.5"
              >
                🖨️ Print PDF
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
