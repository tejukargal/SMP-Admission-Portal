import type { ExamResult } from '../../types';

interface Props {
  result: ExamResult;
  onClose: () => void;
}

// ── Design tokens — Results revamp (student-portal look, plum) ──────────────
const PLUM = '#9333EA';
const MINT = '#0FA968';
const CORAL = '#E11D48';
const AMBER = '#D97706';
const SKY = '#0284C7';
const FALLBACK_COLOR = '#8A93A3';
const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };
const YEAR_COLOR: Record<string, string> = {
  '1ST YEAR': '#0EA5E9', '2ND YEAR': '#F59E0B', '3RD YEAR': '#8B5CF6',
};

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

function outcomeColor(result: string): string {
  if (result === 'FAILS' || result === 'FAIL') return CORAL;
  if (result === 'AB') return AMBER;
  if (result === 'Distinction') return MINT;
  return SKY;
}

function subjectColor(result: string): string {
  if (result === 'F') return CORAL;
  if (result === 'AB') return AMBER;
  return MINT;
}

function Pill({ value, color, dot }: { value: React.ReactNode; color: string; dot?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-[5px] text-[11px] font-medium leading-none whitespace-nowrap"
      style={{ background: `${color}14`, borderColor: `${color}66`, color: inkOf(color) }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
      {value}
    </span>
  );
}

function StatTile({ label, value, color, emphasis }: { label: string; value: React.ReactNode; color: string; emphasis?: boolean }) {
  return (
    <div
      className="flex-1 min-w-[120px] rounded-xl border px-3 py-2"
      style={{
        background: `linear-gradient(135deg, ${color}${emphasis ? '24' : '12'}, ${color}04)`,
        borderColor: `${color}${emphasis ? '66' : '38'}`,
        boxShadow: emphasis ? `0 3px 12px ${color}1F` : undefined,
      }}
    >
      <div className="text-[8.5px] font-medium uppercase tracking-[0.8px]" style={{ color: inkOf(color) }}>{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums leading-tight" style={{ color: inkOf(color) }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: `${PLUM}2E` }}>
      <div
        className="px-3.5 py-2 flex items-center gap-2 border-b"
        style={{ background: `linear-gradient(90deg, ${PLUM}12, ${PLUM}03)`, borderColor: `${PLUM}1F` }}
      >
        <span
          className="w-6 h-6 rounded-[8px] flex items-center justify-center shrink-0 text-white"
          style={{ background: `linear-gradient(135deg, ${PLUM}, ${inkOf(PLUM)})`, boxShadow: `0 2px 6px ${PLUM}40` }}
        >
          {icon}
        </span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.8px]" style={{ color: inkOf(PLUM) }}>{title}</span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const TH = 'px-3 py-2 text-[9.5px] font-medium uppercase tracking-[0.6px] text-[#6B21A8] whitespace-nowrap bg-[#F6EEFD]';

export function ResultDetailModal({ result, onClose }: Props) {
  const h = DEPT_HUE[result.course] ?? 275;
  const ring = DEPT_DOT[result.course] ?? FALLBACK_COLOR;
  const resColor = outcomeColor(result.overallResult);

  return (
    <div
      className="font-wp fixed inset-0 z-50 flex items-center justify-center"
      style={{ animation: 'backdrop-enter 0.15s ease-out' }}
    >
      <div className="absolute inset-0 bg-[#2A0E45]/40" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-[22px] border border-[#E9D8F7] w-[720px] max-w-[calc(100vw-2rem)] h-[85vh] mx-4 flex flex-col overflow-hidden"
        style={{ animation: 'modal-enter 0.2s ease-out', boxShadow: '0 24px 60px rgba(42,14,69,0.24), 0 4px 14px rgba(18,20,26,0.06)' }}
      >
        {/* Hero header */}
        <div
          className="relative overflow-hidden px-5 pt-4 pb-3.5 shrink-0 border-b border-[#9333EA]/15"
          style={{ background: `linear-gradient(135deg, ${PLUM}24 0%, ${PLUM}0B 55%, #FFFFFF 100%)` }}
        >
          <span
            className="pointer-events-none absolute -top-20 -right-10 w-48 h-48 rounded-full border-[24px]"
            style={{ borderColor: `${PLUM}10` }}
            aria-hidden="true"
          />
          <div className="relative flex items-start gap-3">
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[16px] font-semibold"
              style={{
                background: `linear-gradient(135deg, hsl(${h - 6} 85% 88%), hsl(${h + 8} 85% 74%))`,
                color: `hsl(${h} 70% 22%)`,
                boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${ring}80`,
              }}
              title={result.course}
            >
              {result.studentName.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[17px] font-bold text-[#6B21A8] leading-tight tracking-[-0.2px] truncate" title={result.studentName}>
                {result.studentName}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#9333EA]/40 bg-white/85 px-2.5 py-[5px] text-[11px] font-semibold leading-none text-black tabular-nums">
                  <span className="text-[8.5px] font-medium uppercase tracking-[0.6px] text-[#8A93A3]">Reg</span>
                  {result.regNumber}
                </span>
                <Pill value={result.course} color={DEPT_DOT[result.course] ?? FALLBACK_COLOR} />
                {result.year && <Pill value={result.year} color={YEAR_COLOR[result.year] ?? FALLBACK_COLOR} />}
                <Pill value={result.examSession} color={PLUM} />
                {result.admissionType && <Pill value={result.admissionType} color={FALLBACK_COLOR} />}
              </div>
              {result.institutionName && (
                <p className="mt-1.5 text-[11px] font-medium text-[#8A93A3] truncate">{result.institutionName}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="relative flex items-center justify-center w-8 h-8 rounded-full border border-[#9333EA]/35 bg-white text-[#6B21A8] hover:bg-[#F6EEFD] hover:border-[#9333EA]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9333EA]/30 transition-colors cursor-pointer shrink-0 shadow-[0_1px_4px_rgba(18,20,26,0.06)]"
              aria-label="Close"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0 bg-[#FCFAFE]" style={{ animation: 'content-enter 0.26s ease-out' }}>

          {/* Outcome summary */}
          <div className="flex flex-wrap gap-2">
            <StatTile label="CGPA" value={result.cgpa ?? (result.cgpaStatus || '—')} color={PLUM} />
            <StatTile label="% Conversion" value={result.percentageConversion ?? 'Not Applicable'} color={SKY} />
            <StatTile label="Credits (Cumulative)" value={result.creditsEarnedCumulative ?? '—'} color={AMBER} />
            <StatTile label="Result" value={result.overallResult} color={resColor} emphasis />
          </div>

          {/* Subject rows */}
          {result.subjects.length > 0 && (
            <SectionCard
              title="Subjects"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>}
            >
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th className={TH}>Sem</th>
                    <th className={TH}>Code</th>
                    <th className={TH}>Subject</th>
                    <th className={TH}>IA/TR/PR</th>
                    <th className={TH}>Result</th>
                    <th className={`${TH} text-right`}>Credit</th>
                    <th className={TH}>Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3ECFB]">
                  {result.subjects.map((s, i) => (
                    <tr key={i} className="hover:bg-[#FAF5FE] transition-colors">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center justify-center min-w-[22px] rounded-md bg-[#F6EEFD] text-[#6B21A8] px-1.5 py-[3px] text-[10.5px] font-semibold tabular-nums leading-none">
                          {s.sem}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371] tabular-nums whitespace-nowrap">{s.code}</td>
                      <td className="px-3 py-2 text-[12px] font-medium text-[#262B35]">{s.subject}</td>
                      <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371] tabular-nums whitespace-nowrap">{s.iaTrPr}</td>
                      <td className="px-3 py-2">
                        <Pill value={s.result} color={subjectColor(s.result)} />
                      </td>
                      <td className="px-3 py-2 text-right text-[11.5px] font-medium text-black tabular-nums">{s.credit}</td>
                      <td className="px-3 py-2 text-[12px] font-semibold text-[#6B21A8]">{s.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          )}

          {/* Semester summary grid */}
          {result.semesterSummary.length > 0 && (
            <SectionCard
              title="Semester Summary"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
            >
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th className={TH}>Semester</th>
                    {result.semesterSummary.map((sem) => (
                      <th key={sem.semester} className={`${TH} text-right`}>{sem.semester}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3ECFB]">
                  <tr>
                    <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371]">Credits Applied</td>
                    {result.semesterSummary.map((sem) => (
                      <td key={sem.semester} className="px-3 py-2 text-right text-[11.5px] font-medium text-black tabular-nums">{sem.creditsApplied ?? '--'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371]">Credits Earned</td>
                    {result.semesterSummary.map((sem) => (
                      <td key={sem.semester} className="px-3 py-2 text-right text-[11.5px] font-medium text-black tabular-nums">{sem.creditsEarned ?? '--'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371]">Credit Points</td>
                    {result.semesterSummary.map((sem) => (
                      <td key={sem.semester} className="px-3 py-2 text-right text-[11.5px] font-medium text-black tabular-nums">{sem.creditPoints ?? '--'}</td>
                    ))}
                  </tr>
                  <tr className="bg-[#FAF5FE]">
                    <td className="px-3 py-2 text-[11.5px] font-semibold text-[#6B21A8]">SGPA (Attempts)</td>
                    {result.semesterSummary.map((sem) => (
                      <td key={sem.semester} className="px-3 py-2 text-right text-[12px] font-semibold text-[#6B21A8] tabular-nums">
                        {sem.sgpa === null ? '—' : sem.attempts === null ? sem.sgpa : `${sem.sgpa} (${sem.attempts})`}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
