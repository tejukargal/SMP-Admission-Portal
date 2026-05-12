import { useMemo } from 'react';
import type { Student, Course } from '../../types';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];

const COURSE_COLORS: Record<Course, { bg: string; text: string; border: string }> = {
  CE: { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  ME: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  EC: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  CS: { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200' },
  EE: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200' },
};

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
}

interface Props {
  students: Student[];
  academicYear: string | null;
  onClose: () => void;
}

export function EnrollmentBreakdownModal({ students, academicYear, onClose }: Props) {
  const { dateRows, totals, grandTotal } = useMemo(() => {
    // Pending = anything not CONFIRMED or CANCELLED (mirrors Admissions.tsx logic)
    const confirmed = students.filter(
      (s) => !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')
    );

    // Group by calendar date extracted from createdAt
    const byDate = new Map<string, Student[]>();
    for (const s of confirmed) {
      const dateKey = s.createdAt.slice(0, 10); // "YYYY-MM-DD"
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(s);
    }

    // Sort dates descending
    const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

    const dateRows = sortedDates.map((dateKey) => {
      const group = byDate.get(dateKey)!;
      const courseCounts: Record<Course, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
      for (const s of group) courseCounts[s.course] = (courseCounts[s.course] ?? 0) + 1;
      return { dateKey, courseCounts, total: group.length };
    });

    const totals: Record<Course, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    for (const row of dateRows) {
      for (const c of COURSES) totals[c] += row.courseCounts[c];
    }
    const grandTotal = confirmed.length;

    return { dateRows, totals, grandTotal };
  }, [students]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ animation: 'backdrop-enter 0.2s ease-out' }}
    >
      <div
        className="absolute inset-0 bg-black/40"
        style={{ backdropFilter: 'blur(4px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-auto overflow-hidden border border-gray-100 flex flex-col"
        style={{ maxHeight: '85vh', animation: 'modal-enter 0.25s ease-out' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 px-5 py-4 border-b border-gray-100 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%)' }}
        >
          <div>
            <h3 className="text-base font-bold text-gray-900">Enrollment Log</h3>
            {academicYear && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                Date-wise pending enrollments — {academicYear}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Course header legend */}
        <div className="flex-shrink-0 px-5 pt-3 pb-1 flex items-center gap-2 flex-wrap">
          {COURSES.map((c) => {
            const col = COURSE_COLORS[c];
            return (
              <span
                key={c}
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${col.bg} ${col.text} ${col.border}`}
              >
                {c}
              </span>
            );
          })}
          <span className="ml-auto text-[11px] text-gray-400 font-medium">
            {grandTotal} total pending
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto px-5 pb-4">
          {dateRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No pending enrollments found.</div>
          ) : (
            <table className="w-full text-xs border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th className="sticky top-0 bg-white py-2 text-left font-semibold text-gray-500 whitespace-nowrap pr-4 border-b border-gray-100">Date</th>
                  {COURSES.map((c) => {
                    const col = COURSE_COLORS[c];
                    return (
                      <th
                        key={c}
                        className={`sticky top-0 bg-white py-2 text-center font-bold whitespace-nowrap w-14 border-b border-gray-100 ${col.text}`}
                      >
                        {c}
                      </th>
                    );
                  })}
                  <th className="sticky top-0 bg-white py-2 text-center font-semibold text-gray-700 whitespace-nowrap w-16 border-b border-gray-100">Total</th>
                </tr>
              </thead>
              <tbody>
                {dateRows.map(({ dateKey, courseCounts, total }, idx) => (
                  <tr
                    key={dateKey}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}
                    style={{ animation: `content-enter 0.2s ease-out ${Math.min(idx * 0.03, 0.3)}s both` }}
                  >
                    <td className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">
                      {formatDate(dateKey)}
                    </td>
                    {COURSES.map((c) => {
                      const count = courseCounts[c];
                      const col = COURSE_COLORS[c];
                      return (
                        <td key={c} className="py-2 text-center">
                          {count > 0 ? (
                            <span className={`inline-flex items-center justify-center w-7 h-5 rounded font-bold text-[11px] border ${col.bg} ${col.text} ${col.border}`}>
                              {count}
                            </span>
                          ) : (
                            <span className="text-gray-200">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 text-center">
                      <span className="inline-flex items-center justify-center px-2 h-5 rounded font-bold text-[11px] bg-gray-800 text-white">
                        {total}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Totals footer */}
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td className="py-2.5 pr-4 font-bold text-gray-800 text-[11px] whitespace-nowrap">
                    TOTAL ({dateRows.length} day{dateRows.length !== 1 ? 's' : ''})
                  </td>
                  {COURSES.map((c) => {
                    const count = totals[c];
                    const col = COURSE_COLORS[c];
                    return (
                      <td key={c} className="py-2.5 text-center">
                        {count > 0 ? (
                          <span className={`inline-flex items-center justify-center w-7 h-5 rounded font-bold text-[11px] border ${col.bg} ${col.text} ${col.border}`}>
                            {count}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-[11px]">0</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 text-center">
                    <span className="inline-flex items-center justify-center px-2 h-5 rounded font-bold text-[11px] bg-emerald-600 text-white">
                      {grandTotal}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
