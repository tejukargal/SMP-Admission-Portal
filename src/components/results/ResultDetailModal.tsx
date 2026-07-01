import type { ExamResult } from '../../types';

interface Props {
  result: ExamResult;
  onClose: () => void;
}

export function ResultDetailModal({ result, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ animation: 'backdrop-enter 0.15s ease-out' }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
        style={{ animation: 'modal-enter 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 rounded-t-2xl shrink-0" style={{ background: 'linear-gradient(90deg, #ecfdf5, #f0f9ff)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-800 truncate">{result.studentName}</h3>
              <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                {result.regNumber}
                <span className="text-gray-300 mx-1.5">·</span>
                {result.course}
                {result.year && (<><span className="text-gray-300 mx-1.5">·</span>{result.year}</>)}
                <span className="text-gray-300 mx-1.5">·</span>
                {result.examSession}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-white/60 cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5 overflow-y-auto">

          {/* Outcome summary */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold border border-gray-200">
              CGPA: {result.cgpa ?? (result.cgpaStatus || '—')}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold border border-gray-200">
              % Conversion: {result.percentageConversion ?? 'Not Applicable'}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold border border-gray-200">
              Credits (Cumulative): {result.creditsEarnedCumulative ?? '—'}
            </span>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold border ${
                result.overallResult === 'FAILS'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : result.overallResult === 'Distinction'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
            >
              {result.overallResult}
            </span>
          </div>

          {/* Subject rows */}
          {result.subjects.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Subjects</p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-3 py-1.5 font-medium">Sem</th>
                      <th className="px-3 py-1.5 font-medium">Code</th>
                      <th className="px-3 py-1.5 font-medium">Subject</th>
                      <th className="px-3 py-1.5 font-medium">IA/TR/PR</th>
                      <th className="px-3 py-1.5 font-medium">Result</th>
                      <th className="px-3 py-1.5 font-medium text-right">Credit</th>
                      <th className="px-3 py-1.5 font-medium">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.subjects.map((s, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-gray-700">{s.sem}</td>
                        <td className="px-3 py-1.5 text-gray-700">{s.code}</td>
                        <td className="px-3 py-1.5 text-gray-700">{s.subject}</td>
                        <td className="px-3 py-1.5 text-gray-700">{s.iaTrPr}</td>
                        <td className={`px-3 py-1.5 font-semibold ${s.result === 'F' ? 'text-red-600' : 'text-emerald-700'}`}>
                          {s.result}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-700">{s.credit}</td>
                        <td className="px-3 py-1.5 text-gray-700">{s.grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Semester summary grid */}
          {result.semesterSummary.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Semester Summary</p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-3 py-1.5 font-medium">Semester</th>
                      {result.semesterSummary.map((sem) => (
                        <th key={sem.semester} className="px-3 py-1.5 font-medium text-right">{sem.semester}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="px-3 py-1.5 text-gray-500">Credits Applied</td>
                      {result.semesterSummary.map((sem) => (
                        <td key={sem.semester} className="px-3 py-1.5 text-right text-gray-700">{sem.creditsApplied}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 text-gray-500">Credits Earned</td>
                      {result.semesterSummary.map((sem) => (
                        <td key={sem.semester} className="px-3 py-1.5 text-right text-gray-700">{sem.creditsEarned}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 text-gray-500">Credit Points</td>
                      {result.semesterSummary.map((sem) => (
                        <td key={sem.semester} className="px-3 py-1.5 text-right text-gray-700">{sem.creditPoints}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 text-gray-500">SGPA (Attempts)</td>
                      {result.semesterSummary.map((sem) => (
                        <td key={sem.semester} className="px-3 py-1.5 text-right text-gray-700">
                          {sem.sgpa !== null ? `${sem.sgpa} (${sem.attempts})` : '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
