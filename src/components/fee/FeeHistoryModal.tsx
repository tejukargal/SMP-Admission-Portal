import { useState, useLayoutEffect } from 'react';
import type { FeeRecord, SMPHeads, FeeAdditionalHead } from '../../types';
import { SMP_FEE_HEADS } from '../../types';
import { FeeReceiptDetailModal } from './FeeReceiptDetailModal';
import { takeFeeHistory } from './feeModalPrefetch';
import type { FeeHistoryData, YearData } from './feeModalPrefetch';

/** Minimal student fields required by FeeHistoryModal — satisfied by both Student and a FeeRecord-derived object. */
export interface FeeHistoryStudentInfo {
  id: string;
  regNumber: string;
  studentNameSSLC: string;
  fatherName: string;
  course: string;
  year: string;
  admType: string;
  admCat: string;
}


function sumSMPRecord(smp: FeeRecord['smp']): number {
  return SMP_FEE_HEADS.reduce((s, { key }) => s + smp[key], 0);
}

function calcRecordTotal(r: FeeRecord): number {
  return sumSMPRecord(r.smp) + r.svk + r.additionalPaid.reduce((s, h) => s + h.amount, 0);
}

/** Effective fine = max(allotted fine, total fine paid) — prevents negative balance. */
function calcEffectiveFine(smpFineAllotted: number, records: FeeRecord[]): number {
  const finePaid = records.reduce((sum, r) => sum + r.smp.fine, 0);
  return Math.max(smpFineAllotted, finePaid);
}

/** Total allotted for a year given the effective SMP/SVK/additional values. */
function calcAllotted(
  smpValues: SMPHeads,
  svk: number,
  additionalHeads: FeeAdditionalHead[],
  records: FeeRecord[],
): number {
  const effectiveFine = calcEffectiveFine(smpValues.fine, records);
  const smpTotal = SMP_FEE_HEADS.reduce(
    (t, { key }) => t + (key === 'fine' ? effectiveFine : smpValues[key]),
    0,
  );
  return smpTotal + svk + additionalHeads.reduce((t, h) => t + h.amount, 0);
}

/** Returns the effective allotted source values for a year (override > structure). */
function effectiveValues(yd: YearData): { smp: SMPHeads; svk: number; additional: FeeAdditionalHead[] } | null {
  if (yd.override) {
    return { smp: yd.override.smp, svk: yd.override.svk, additional: yd.override.additionalHeads };
  }
  if (yd.structure) {
    return { smp: yd.structure.smp, svk: yd.structure.svk, additional: yd.structure.additionalHeads };
  }
  return null;
}

// ── Design tokens — teal student-portal look (matches Collect Fee) ─────────
const TEAL = '#0F8B8D';
const TEAL_INK = '#0B6567';
const MINT = '#0FA968';
const CORAL = '#E11D48';
const AMBER = '#D97706';
const VIOLET = '#7C3AED';
const SKY = '#0284C7';
const FALLBACK_COLOR = '#8A93A3';
const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };
const YEAR_COLOR: Record<string, string> = {
  '1ST YEAR': '#0EA5E9', '2ND YEAR': '#F59E0B', '3RD YEAR': '#8B5CF6',
};
const ADM_TYPE_COLOR: Record<string, string> = {
  REGULAR: '#1D6FD8', REPEATER: '#D97706', LATERAL: '#7C3AED', EXTERNAL: TEAL, SNQ: '#10B981',
};
const ADM_CAT_COLOR: Record<string, string> = { GM: '#5B9A2F', SNQ: '#10B981', OTHERS: '#F59E0B' };
// Rotating per-year accents for the year chip and progress meter (student-portal palette).
const YEAR_ACCENTS = [TEAL, '#3E7CB1', '#8B5FBF', '#C97E2E', '#C2517B', '#3F9463'];

const TH =
  'px-3 h-8 py-0 align-middle text-left text-[9.5px] font-medium uppercase tracking-[0.6px] text-[#0B6567] whitespace-nowrap';

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;
const amtHead = (c: string): React.CSSProperties => ({ background: `${c}14`, color: inkOf(c) });
const amtCell = (c: string): React.CSSProperties => ({ background: `${c}08`, color: inkOf(c) });

/** Department ring monogram — pastel gradient in the department's hue with a thin ring. */
function RingAvatar({ name, course }: { name: string; course: string }) {
  const h = DEPT_HUE[course] ?? 210;
  const ring = DEPT_DOT[course] ?? FALLBACK_COLOR;
  return (
    <span
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[14px] font-medium"
      style={{
        background: `linear-gradient(135deg, hsl(${h - 6} 85% 88%), hsl(${h + 8} 85% 74%))`,
        color: `hsl(${h} 70% 22%)`,
        boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${ring}80`,
      }}
      title={course}
    >
      {name.charAt(0)}
    </span>
  );
}

/** Highlighted student detail: tiny label over an accent-ink value, on a tinted tile. */
function InfoTile({ label, value, color, mono }: { label: string; value?: string; color?: string; mono?: boolean }) {
  const c = color ?? FALLBACK_COLOR;
  return (
    <div
      className="flex flex-col justify-center rounded-xl border px-2.5 py-1.5 min-w-[64px]"
      style={{ background: `linear-gradient(135deg, ${c}17, ${c}08)`, borderColor: `${c}4D` }}
    >
      <span className="flex items-center gap-1 text-[8.5px] font-medium uppercase tracking-[0.8px] text-[#8A93A3] leading-none whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
        {label}
      </span>
      <span
        className={`mt-1 text-[13px] font-semibold leading-none whitespace-nowrap ${mono ? 'tabular-nums' : ''}`}
        style={{ color: inkOf(c) }}
      >
        {value || '—'}
      </span>
    </div>
  );
}

/** White outline pill with a tinted hairline and ink (Custom Allotted / Refunded / No structure). */
function OutlinePill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-[4px] text-[10px] font-medium leading-none shrink-0 whitespace-nowrap"
      style={{ borderColor: `${color}73`, color: inkOf(color) }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {children}
    </span>
  );
}

/** Payment-mode pill: amber for CASH, violet otherwise. */
function ModePill({ mode, children }: { mode: string; children: React.ReactNode }) {
  const c = mode === 'CASH' ? AMBER : VIOLET;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-[3.5px] text-[10px] font-medium leading-none whitespace-nowrap"
      style={{ background: `${c}0F`, borderColor: `${c}66`, color: inkOf(c) }}
    >
      {children}
    </span>
  );
}

/** Small colour-coded label for a dues group (SMP / SVK / Addl). */
function GroupTag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="mt-[3px] w-11 shrink-0 inline-flex items-center justify-center rounded-full py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.6px] leading-none"
      style={{ background: `${color}17`, color: inkOf(color) }}
    >
      {children}
    </span>
  );
}

/** One fee head's pending due as a compact one-line chip: coral amount when due, mint ✓ when settled. */
function DueTile({ label, dueAmt }: { label: string; dueAmt: number }) {
  const c = dueAmt > 0 ? CORAL : MINT;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border bg-white pl-2 pr-1.5 py-[3px] leading-none whitespace-nowrap"
      style={{ borderColor: `${c}40` }}
    >
      <span className="text-[10px] font-medium text-[#5B6371]">{label}</span>
      <span
        className="rounded-full px-1.5 py-[2px] text-[10.5px] font-semibold tabular-nums"
        style={{ background: `${c}14`, color: inkOf(c) }}
      >
        {dueAmt === 0 ? '✓' : `₹${dueAmt.toLocaleString()}`}
      </span>
    </span>
  );
}

/** Paid-% ring for the summary hero; sweeps in from empty on mount. */
function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const SIZE = 92;
  const STROKE = 9;
  const r = (SIZE - STROKE) / 2;
  const len = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - pct / 100)}
          style={{ '--ring-len': len, animation: 'fee-ring-fill 0.9s cubic-bezier(0.2,0.8,0.2,1) 0.15s both' } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] font-semibold leading-none tabular-nums" style={{ color: inkOf(color) }}>{pct}%</span>
        <span className="mt-1 text-[8.5px] font-medium uppercase tracking-[1.2px] text-[#5B6371]">Paid</span>
      </div>
    </div>
  );
}

interface Props {
  student: FeeHistoryStudentInfo;
  onClose: () => void;
  /** Pre-computed dues status from the parent — used as the initial header colour while data loads. */
  initialNoDues?: boolean;
}

export function FeeHistoryModal({ student, onClose, initialNoDues }: Props) {
  const [yearData, setYearData] = useState<YearData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // SNQ refunds per academic year — netted against paid so a refunded student shows 0 due, not negative
  const [refundedByYear, setRefundedByYear] = useState<Map<string, number>>(new Map());
  const [expandedDues, setExpandedDues] = useState<Set<string>>(new Set());
  const [receiptDetailRecord, setReceiptDetailRecord] = useState<FeeRecord | null>(null);

  function toggleDues(ay: string) {
    setExpandedDues((prev) => {
      const next = new Set(prev);
      if (next.has(ay)) next.delete(ay); else next.add(ay);
      return next;
    });
  }

  // Loads records → per-year structure/override, and refunds (see feeModalPrefetch).
  // A layout effect so an already-prefetched result renders before the first
  // paint — the modal opens filled, with no skeleton.
  useLayoutEffect(() => {
    let cancelled = false;
    const apply = ({ yearData: data, refundedByYear: refunds }: FeeHistoryData) => {
      setYearData(data);
      if (refunds) setRefundedByYear(refunds);
      setLoading(false);
    };
    const load = takeFeeHistory(student);
    if (load.data) {
      apply(load.data);
      return;
    }
    load.promise
      .then((data) => { if (!cancelled) apply(data); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load fee history');
        setLoading(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  const overallAllotted = yearData.reduce((s, yd) => {
    const ev = effectiveValues(yd);
    return s + (ev ? calcAllotted(ev.smp, ev.svk, ev.additional, yd.records) : 0);
  }, 0);
  const overallFine = yearData.reduce((s, yd) => {
    const ev = effectiveValues(yd);
    return s + (ev ? calcEffectiveFine(ev.smp.fine, yd.records) : 0);
  }, 0);
  const overallRefunded = yearData.reduce(
    (s, { academicYear }) => s + (refundedByYear.get(academicYear) ?? 0),
    0,
  );
  const overallPaid = yearData.reduce(
    (s, { records }) => s + records.reduce((rs, r) => rs + calcRecordTotal(r), 0),
    0,
  ) - overallRefunded;
  const overallDue = overallAllotted - overallPaid;

  // Status tone for the header: mint when clear, coral when due, teal while unknown.
  const headerTone = loading
    ? initialNoDues === true
      ? MINT
      : initialNoDues === false
        ? CORAL
        : TEAL
    : !error && yearData.length > 0
      ? overallDue > 0
        ? CORAL
        : MINT
      : TEAL;

  // Display-only figures for the summary hero.
  const heroTone = overallDue > 0 ? CORAL : MINT;
  const paidPct = overallAllotted > 0
    ? Math.min(100, Math.max(0, Math.round((overallPaid / overallAllotted) * 100)))
    : null;
  const receiptCount = yearData.reduce((n, yd) => n + yd.records.length, 0);
  // Compact year-wise breakup for the hero — same formulas as each year card below.
  const heroYears = yearData.map((yd, i) => {
    const ev = effectiveValues(yd);
    const refunded = refundedByYear.get(yd.academicYear) ?? 0;
    const paid = yd.records.reduce((s, r) => s + calcRecordTotal(r), 0) - refunded;
    const allotted = ev ? calcAllotted(ev.smp, ev.svk, ev.additional, yd.records) : null;
    const due = allotted !== null ? allotted - paid : null;
    return {
      academicYear: yd.academicYear,
      accent: YEAR_ACCENTS[i % YEAR_ACCENTS.length],
      paid,
      allotted,
      due,
      noDues: due !== null && due <= 0,
      pct: allotted !== null && allotted > 0 ? Math.min(100, Math.max(0, Math.round((paid / allotted) * 100))) : null,
      smp: yd.records.reduce((s, r) => s + sumSMPRecord(r.smp), 0) - refunded,
      svk: yd.records.reduce((s, r) => s + r.svk, 0),
      addl: yd.records.reduce((s, r) => s + r.additionalPaid.reduce((a, h) => a + h.amount, 0), 0),
      receipts: yd.records.length,
      custom: !!yd.override,
    };
  });

  return (
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-[#0B2A2B]/45"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div
        className="relative bg-white rounded-[22px] border border-[#CDE6E6] w-full max-w-4xl flex flex-col overflow-hidden h-[calc(100vh-3rem)]"
        style={{ animation: 'modal-enter 0.25s ease-out', boxShadow: '0 24px 60px rgba(11,42,43,0.22), 0 4px 14px rgba(18,20,26,0.06)' }}
      >

        {/* Header — pastel status tint with a soft corner ring */}
        <div
          className="relative overflow-hidden px-5 py-3.5 flex items-center justify-between shrink-0 border-b"
          style={{
            background: `linear-gradient(135deg, ${headerTone}24 0%, ${headerTone}0D 55%, #FFFFFF 100%)`,
            borderColor: `${headerTone}33`,
            transition: 'background 0.3s ease, border-color 0.3s ease',
          }}
        >
          <span
            className="pointer-events-none absolute -top-20 -right-10 w-44 h-44 rounded-full border-[22px]"
            style={{ borderColor: `${headerTone}14` }}
            aria-hidden="true"
          />
          <div className="relative min-w-0 flex-1 flex items-center gap-2.5 flex-wrap">
            <h3 className="flex items-center gap-2.5 shrink-0">
              <span
                className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] text-white shrink-0"
                style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_INK})`, boxShadow: `0 3px 10px ${TEAL}40` }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </span>
              <span className="flex flex-col">
                <span className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">Fee Collection</span>
                <span className="mt-1 text-[17px] font-bold text-[#0B6567] leading-none tracking-[-0.2px]">Fee Details</span>
              </span>
            </h3>
            {!loading && !error && yearData.length > 0 && yearData.map((yd) => {
              const ev = effectiveValues(yd);
              const paid = yd.records.reduce((s, r) => s + calcRecordTotal(r), 0)
                - (refundedByYear.get(yd.academicYear) ?? 0);
              const allotted = ev ? calcAllotted(ev.smp, ev.svk, ev.additional, yd.records) : null;
              const due = allotted !== null ? allotted - paid : null;
              const noDues = due !== null && due <= 0;
              const c = noDues ? MINT : CORAL;
              return (
                <span
                  key={yd.academicYear}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-white/80 px-2.5 py-[5px] text-[10.5px] font-medium leading-none tabular-nums"
                  style={{ borderColor: `${c}73`, color: inkOf(c), animation: 'content-enter 0.25s ease-out' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
                  {yd.academicYear}
                  <span className="opacity-50">·</span>
                  <span>{noDues ? '✓ No Dues' : `Due ₹${due !== null ? due.toLocaleString() : '—'}`}</span>
                  {yd.override && (
                    <span style={{ color: inkOf(AMBER) }}>· custom</span>
                  )}
                </span>
              );
            })}
          </div>
          <button
            onClick={onClose}
            className="relative flex items-center justify-center w-8 h-8 rounded-full border border-[#0F8B8D]/35 bg-white text-[#0B6567] hover:bg-[#EFF8F8] hover:border-[#0F8B8D]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F8B8D]/30 transition-colors cursor-pointer shrink-0 ml-3 shadow-[0_1px_4px_rgba(18,20,26,0.06)]"
            aria-label="Close"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Student strip */}
        <div className="px-5 py-3 bg-white border-b border-[#E3F0F0] shrink-0 flex items-center gap-x-4 gap-y-2.5 flex-wrap">
          <div className="min-w-[220px] flex-1 flex items-center gap-3">
            <RingAvatar name={student.studentNameSSLC} course={student.course} />
            <div className="min-w-0">
              <p className="text-[16px] font-semibold truncate leading-tight tracking-[-0.1px]" style={{ color: TEAL }} title={student.studentNameSSLC}>
                {student.studentNameSSLC}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-[#8A93A3] min-w-0">
                <span className="uppercase tracking-[0.5px] text-[9px]">Father</span>
                <span className="text-[#5B6371] truncate">{student.fatherName}</span>
              </p>
            </div>
          </div>
          <div className="flex items-stretch gap-1.5 flex-wrap">
            <InfoTile label="Reg No" value={student.regNumber || '—'} color={TEAL} mono />
            <InfoTile label="Course" value={student.course} color={DEPT_DOT[student.course]} />
            <InfoTile label="Year" value={student.year} color={YEAR_COLOR[student.year]} />
            <InfoTile label="Adm Type" value={student.admType} color={ADM_TYPE_COLOR[student.admType]} />
            <InfoTile label="Adm Cat" value={student.admCat} color={ADM_CAT_COLOR[student.admCat]} />
          </div>
        </div>

        {/* Body */}
        <div
          className="px-5 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none', background: 'linear-gradient(160deg, #F6FBFB 0%, #FCFDFD 45%, #F2F9F9 100%)' }}
        >
          {loading ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#CDE6E6] bg-white p-4 h-[206px] flex items-center gap-5">
                <div className="skeleton w-[92px] h-[92px] !rounded-full shrink-0" />
                <div className="flex-1 space-y-2.5">
                  <div className="skeleton h-2.5 w-20 rounded" />
                  <div className="skeleton h-6 w-36 rounded-lg" />
                  <div className="flex gap-5">
                    <div className="skeleton h-7 w-20 rounded-lg" />
                    <div className="skeleton h-7 w-20 rounded-lg" />
                  </div>
                </div>
              </div>
              {Array.from({ length: 2 }).map((_, yi) => (
                <div key={yi} className="border border-[#CDE6E6] bg-white rounded-2xl overflow-hidden">
                  <div className="bg-[#F4FAFA] border-b border-[#E3F0F0] px-4 py-3 flex items-center gap-4">
                    <div className="skeleton h-5 w-24 rounded-full" />
                    <div className="skeleton h-3 w-40 rounded" />
                    <div className="ml-auto flex gap-6">
                      <div className="skeleton h-8 w-20 rounded-lg" />
                      <div className="skeleton h-8 w-20 rounded-lg" />
                      <div className="skeleton h-8 w-20 rounded-lg" />
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="border border-[#EAF3F3] rounded-xl overflow-hidden">
                      <div className="bg-[#EDF7F7] px-3 py-1.5 flex gap-3 border-b border-[#E3F0F0]">
                        {['w-16', 'w-20', 'flex-1', 'w-20', 'w-20', 'w-20'].map((w, j) => (
                          <div key={j} className={`skeleton h-2.5 ${w} rounded`} />
                        ))}
                      </div>
                      {Array.from({ length: 2 + yi }).map((_, i) => (
                        <div key={i} className="px-3 py-2 flex gap-3 border-b border-[#EAF3F3] last:border-0">
                          {['w-16', 'w-20', 'flex-1', 'w-20', 'w-20', 'w-20'].map((w, j) => (
                            <div key={j} className={`skeleton h-3 ${w} rounded`} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center" style={{ animation: 'content-enter 0.26s ease-out' }}>
              <div className="w-14 h-14 rounded-2xl border flex items-center justify-center" style={{ borderColor: `${CORAL}40`, background: `${CORAL}0F`, color: CORAL }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <span className="text-[13px] font-medium" style={{ color: inkOf(CORAL) }}>{error}</span>
            </div>
          ) : yearData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-center" style={{ animation: 'content-enter 0.26s ease-out' }}>
              <div className="w-14 h-14 rounded-2xl border border-[#CDE6E6] bg-[#EFF8F8] flex items-center justify-center text-[22px] font-medium text-[#8A93A3]">
                ₹
              </div>
              <span className="text-[14px] font-medium text-[#5B6371]">No fee records found for this student.</span>
            </div>
          ) : (
            <>
            {/* Summary hero — paid ring, totals and a status strip */}
            <div
              className="relative overflow-hidden rounded-2xl border p-4 h-[206px]"
              style={{
                background: `linear-gradient(135deg, ${heroTone}21 0%, ${heroTone}0A 55%, #FFFFFF 100%)`,
                borderColor: `${heroTone}47`,
                boxShadow: `0 6px 20px ${heroTone}17`,
                animation: 'content-enter 0.35s ease-out',
              }}
            >
              <span
                className="pointer-events-none absolute -bottom-32 -right-16 w-60 h-60 rounded-full border-[28px]"
                style={{ borderColor: `${heroTone}12` }}
                aria-hidden="true"
              />
              <div className="relative h-full flex gap-4 items-stretch">
              {/* Left: ring, totals and status */}
              <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
              <div className="flex items-center gap-5">
                {paidPct !== null ? (
                  <ProgressRing pct={paidPct} color={heroTone} />
                ) : (
                  <div className="w-[92px] h-[92px] rounded-full bg-white/75 flex items-center justify-center shrink-0" style={{ color: heroTone }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[9.5px] font-medium uppercase tracking-[1px] text-[#5B6371]">Total Paid</div>
                  <div className="mt-0.5 text-[26px] font-semibold text-[#1F2530] leading-none tabular-nums">₹{overallPaid.toLocaleString()}</div>
                  <div className="mt-3 flex items-start gap-5">
                    <div>
                      <div className="text-[9.5px] font-medium uppercase tracking-[1px] text-[#5B6371]">Total Allotted</div>
                      <div className="mt-0.5 text-[14.5px] font-semibold text-[#262B35] tabular-nums">₹{overallAllotted.toLocaleString()}</div>
                      {overallFine > 0 && (
                        <div className="mt-0.5 text-[10px] font-medium tabular-nums" style={{ color: inkOf(AMBER) }}>
                          +Fine ₹{overallFine.toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[9.5px] font-medium uppercase tracking-[1px] text-[#5B6371]">Total Due</div>
                      <div className="mt-0.5 text-[14.5px] font-semibold tabular-nums" style={{ color: inkOf(heroTone) }}>
                        ₹{overallDue.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9.5px] font-medium uppercase tracking-[1px] text-[#5B6371]">Receipts</div>
                      <div className="mt-0.5 text-[14.5px] font-semibold text-[#262B35] tabular-nums">{receiptCount}</div>
                    </div>
                  </div>
                </div>
              </div>
                <div className="flex items-center gap-2.5 rounded-xl bg-white/75 border px-3 py-2.5" style={{ borderColor: `${heroTone}26` }}>
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: heroTone }}>
                    {overallDue > 0
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold leading-tight tabular-nums" style={{ color: inkOf(heroTone) }}>
                      {overallDue > 0 ? `₹${overallDue.toLocaleString()} due` : 'All dues cleared'}
                    </div>
                    <div className="text-[11px] font-medium text-[#5B6371] leading-snug">
                      {yearData.length} academic year{yearData.length > 1 ? 's' : ''} · {receiptCount} receipt{receiptCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: compact year-wise payment breakup */}
              <div className="flex-[1.15] min-w-0 min-h-0 rounded-xl bg-white/80 border p-2.5 flex flex-col" style={{ borderColor: `${heroTone}26` }}>
                <div className="px-1 pb-1.5 flex items-center justify-between">
                  <span className="text-[9.5px] font-medium uppercase tracking-[1px] text-[#5B6371]">Year-wise Payments</span>
                  <span className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.6px]">
                    <span style={{ color: inkOf(SKY) }}>SMP</span>
                    <span style={{ color: inkOf(VIOLET) }}>SVK</span>
                    <span style={{ color: inkOf(MINT) }}>Addl</span>
                  </span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden divide-y divide-[#EAF3F3]" style={{ scrollbarWidth: 'none' }}>
                  {heroYears.map((y, i) => {
                    const statusColor = y.allotted === null ? AMBER : y.noDues ? MINT : CORAL;
                    return (
                      <div key={y.academicYear} className="px-1 py-1.5" style={{ animation: `content-enter 0.3s ease-out ${120 + i * 50}ms both` }}>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center rounded-full px-2 py-[3px] text-[10.5px] font-semibold leading-none tabular-nums shrink-0"
                            style={{ background: `${y.accent}1F`, color: inkOf(y.accent) }}
                          >
                            {y.academicYear}
                          </span>
                          {y.custom && (
                            <span className="text-[9.5px] font-medium shrink-0" style={{ color: inkOf(AMBER) }}>custom</span>
                          )}
                          <span className="text-[11px] font-medium text-[#8A93A3] tabular-nums truncate">
                            <span className="font-semibold text-[#262B35]">₹{y.paid.toLocaleString()}</span>
                            {y.allotted !== null && ` of ₹${y.allotted.toLocaleString()}`}
                          </span>
                          <span
                            className="ml-auto inline-flex items-center rounded-full border px-1.5 py-[3px] text-[10px] font-semibold leading-none tabular-nums shrink-0"
                            style={{ background: `${statusColor}0F`, borderColor: `${statusColor}59`, color: inkOf(statusColor) }}
                          >
                            {y.allotted === null ? 'Not set' : y.noDues ? '✓ No Dues' : `Due ₹${y.due!.toLocaleString()}`}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 min-w-[40px] h-1 rounded-full overflow-hidden" style={{ background: `${y.noDues ? MINT : y.accent}1F` }}>
                            {y.pct !== null && (
                              <div
                                className="h-full rounded-full origin-left"
                                style={{
                                  width: `${y.pct}%`,
                                  background: y.noDues ? MINT : y.accent,
                                  animation: `fee-bar-fill 0.7s cubic-bezier(0.2,0.8,0.2,1) ${200 + i * 60}ms both`,
                                }}
                              />
                            )}
                          </div>
                          <span className="flex items-center gap-1.5 text-[10px] font-medium tabular-nums whitespace-nowrap shrink-0">
                            {y.smp !== 0 && <span style={{ color: inkOf(SKY) }}>₹{y.smp.toLocaleString()}</span>}
                            {y.svk > 0 && <span style={{ color: inkOf(VIOLET) }}>₹{y.svk.toLocaleString()}</span>}
                            {y.addl > 0 && <span style={{ color: inkOf(MINT) }}>₹{y.addl.toLocaleString()}</span>}
                            <span className="text-[#8A93A3]">· {y.receipts} rcpt{y.receipts !== 1 ? 's' : ''}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>
            </div>

            <div className="pt-1 px-1 flex items-baseline justify-between gap-3">
              <p className="text-[10px] font-medium uppercase tracking-[1px] text-[#8A93A3]">Year-wise History</p>
              <p className="text-[10.5px] font-medium text-[#8A93A3]">Click an amount to view its receipt breakup</p>
            </div>

            {yearData.map((yd, ydIdx) => {
              const { academicYear, records, structure, override } = yd;
              const ev = effectiveValues(yd);
              // SNQ refunds apply to the SMP component: net them out so due is 0 after refund, not negative
              const refunded = refundedByYear.get(academicYear) ?? 0;
              const totalPaid = records.reduce((s, r) => s + calcRecordTotal(r), 0) - refunded;
              const allotted = ev ? calcAllotted(ev.smp, ev.svk, ev.additional, records) : null;
              const fine = ev ? calcEffectiveFine(ev.smp.fine, records) : 0;
              const due = allotted !== null ? allotted - totalPaid : null;
              const noDues = due !== null && due <= 0;
              const tone = noDues ? MINT : CORAL;
              const accent = YEAR_ACCENTS[ydIdx % YEAR_ACCENTS.length];
              const svkBaseAllotted = ev?.svk ?? 0;
              const additionalAllotted = ev ? ev.additional.reduce((t, h) => t + h.amount, 0) : 0;
              const smpAllotted = allotted !== null ? allotted - svkBaseAllotted - additionalAllotted : 0;
              const smpPaidRaw = records.reduce((s, r) => s + sumSMPRecord(r.smp), 0);
              const smpPaid = smpPaidRaw - refunded;
              const svkBasePaid = records.reduce((s, r) => s + r.svk, 0);
              const additionalPaidTotal = records.reduce(
                (s, r) => s + r.additionalPaid.reduce((a, h) => a + h.amount, 0),
                0,
              );
              const smpDue = smpAllotted - smpPaid;
              const svkDue = svkBaseAllotted - svkBasePaid;
              const additionalDue = additionalAllotted - additionalPaidTotal;
              // SNQ students get a tuition concession (lower allotted SMP) that must be refunded.
              // If they've paid more than the SNQ allotted SMP and no (or only a partial) refund
              // has been issued yet, flag the outstanding refund so it isn't missed.
              const pendingRefund = records[0].admCat === 'SNQ' && allotted !== null
                ? Math.max(0, smpPaidRaw - smpAllotted - refunded)
                : 0;
              const yearPct = allotted !== null && allotted > 0
                ? Math.min(100, Math.max(0, Math.round((totalPaid / allotted) * 100)))
                : null;
              const isOpen = expandedDues.has(academicYear);

              return (
                <div
                  key={academicYear}
                  style={{
                    animation: `content-enter 0.3s ease-out ${(ydIdx + 1) * 65}ms both`,
                    borderColor: `${tone}4D`,
                    boxShadow: `0 4px 14px ${tone}12`,
                  }}
                  className="rounded-2xl overflow-hidden bg-white border"
                >

                  {/* Year card header */}
                  <div
                    className="px-4 py-3 border-b"
                    style={{
                      background: `linear-gradient(90deg, ${tone}17 0%, ${tone}06 60%, #FFFFFF 100%)`,
                      borderColor: `${tone}26`,
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Left: year + meta */}
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[11.5px] font-semibold leading-none shrink-0 tabular-nums"
                          style={{ background: `${accent}1F`, color: inkOf(accent) }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          {academicYear}
                        </span>
                        <span className="text-[11.5px] font-medium text-[#5B6371]">
                          {records[0].course} · {records[0].year} · {records[0].admType} · {records[0].admCat}
                        </span>
                        {override && (
                          <OutlinePill color={AMBER}>Custom Allotted</OutlinePill>
                        )}
                        {refunded > 0 && (
                          <OutlinePill color={VIOLET}>Refunded ₹{refunded.toLocaleString()}</OutlinePill>
                        )}
                      </div>

                      {/* Right: stat metrics */}
                      <div className="ml-auto flex items-stretch gap-0 shrink-0">
                        {allotted !== null ? (
                          <>
                            <div className="flex flex-col items-end px-3 border-r" style={{ borderColor: `${tone}33` }}>
                              <span className="text-[9px] font-medium uppercase tracking-[0.8px] text-[#8A93A3]">Allotted</span>
                              <span className="text-[13px] font-semibold text-[#262B35] tabular-nums">₹{allotted.toLocaleString()}</span>
                              <span className="text-[9.5px] font-medium text-[#8A93A3]">
                                {smpAllotted > 0 && `SMP ₹${smpAllotted.toLocaleString()}`}
                                {svkBaseAllotted > 0 && ` · SVK ₹${svkBaseAllotted.toLocaleString()}`}
                                {additionalAllotted > 0 && ` · Addl ₹${additionalAllotted.toLocaleString()}`}
                              </span>
                            </div>
                            <div className="flex flex-col items-end px-3 border-r" style={{ borderColor: `${tone}33` }}>
                              <span className="text-[9px] font-medium uppercase tracking-[0.8px]" style={{ color: MINT }}>Paid</span>
                              <span className="text-[13px] font-semibold tabular-nums" style={{ color: inkOf(MINT) }}>₹{totalPaid.toLocaleString()}</span>
                              <span className="text-[9.5px] font-medium text-[#8A93A3]">
                                {smpPaid > 0 && `SMP ₹${smpPaid.toLocaleString()}`}
                                {svkBasePaid > 0 && ` · SVK ₹${svkBasePaid.toLocaleString()}`}
                                {additionalPaidTotal > 0 && ` · Addl ₹${additionalPaidTotal.toLocaleString()}`}
                                {refunded > 0 && ` · net of ₹${refunded.toLocaleString()} refund`}
                              </span>
                            </div>
                            <div className="flex flex-col items-end pl-3">
                              <span className="text-[9px] font-medium uppercase tracking-[0.8px]" style={{ color: tone }}>
                                Due
                              </span>
                              <span className="text-[13px] font-semibold tabular-nums" style={{ color: inkOf(tone) }}>
                                ₹{due!.toLocaleString()}
                              </span>
                              <span className="text-[9.5px] font-medium text-[#8A93A3]">
                                {smpDue !== 0 && `SMP ₹${smpDue.toLocaleString()}`}
                                {svkDue !== 0 && ` · SVK ₹${svkDue.toLocaleString()}`}
                                {additionalDue !== 0 && ` · Addl ₹${additionalDue.toLocaleString()}`}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex flex-col items-end px-3 border-r" style={{ borderColor: `${tone}33` }}>
                              <span className="text-[9px] font-medium uppercase tracking-[0.8px]" style={{ color: MINT }}>Paid</span>
                              <span className="text-[13px] font-semibold tabular-nums" style={{ color: inkOf(MINT) }}>₹{totalPaid.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center pl-3">
                              <OutlinePill color={AMBER}>No structure configured</OutlinePill>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Paid-of-allotted meter */}
                    {yearPct !== null && (
                      <div className="mt-3">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${noDues ? MINT : accent}1F` }}>
                          <div
                            className="h-full rounded-full origin-left"
                            style={{
                              width: `${yearPct}%`,
                              background: noDues ? MINT : `linear-gradient(90deg, ${accent}B3, ${accent})`,
                              animation: `fee-bar-fill 0.7s cubic-bezier(0.2,0.8,0.2,1) ${150 + ydIdx * 65}ms both`,
                            }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-[#8A93A3] tabular-nums">
                          <span>
                            <span className="font-semibold text-[#262B35]">₹{totalPaid.toLocaleString()}</span> paid of ₹{allotted!.toLocaleString()}
                          </span>
                          <span className="font-semibold" style={{ color: inkOf(noDues ? MINT : accent) }}>{yearPct}%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {pendingRefund > 0 && (
                    <div
                      className="px-4 py-2 border-b flex items-center gap-2.5 text-[12px] font-medium"
                      style={{ background: `${CORAL}0F`, borderColor: `${CORAL}33`, color: inkOf(CORAL) }}
                    >
                      <span className="w-6 h-6 rounded-[8px] flex items-center justify-center text-white shrink-0" style={{ background: CORAL }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </span>
                      <span>SNQ Refund Pending: student has to be refunded ₹{pendingRefund.toLocaleString()} (voucher not yet generated)</span>
                    </div>
                  )}

                  {/* Receipts table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'linear-gradient(90deg, #E3F2F2 0%, #EDF7F7 55%, #E6F3F1 100%)', boxShadow: 'inset 0 -1px 0 #C7E2E2' }}>
                          <th className={TH}>Date</th>
                          <th className={TH}>SMP Rpt</th>
                          <th className={TH}>SVK Rpt</th>
                          <th className={TH}>Addl Rpt</th>
                          <th className={TH}>Mode</th>
                          <th className={TH}>Remarks</th>
                          <th className={`${TH} text-right`} style={amtHead(SKY)}>SMP (₹)</th>
                          <th className={`${TH} text-right`} style={amtHead(VIOLET)}>SVK (₹)</th>
                          <th className={`${TH} text-right`} style={amtHead(MINT)}>Addl (₹)</th>
                          <th className={`${TH} text-right`} style={amtHead(TEAL)}>Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAF3F3]">
                        {records.map((r) => {
                          const rowSmpTotal = sumSMPRecord(r.smp);
                          const rowSvkBase = r.svk;
                          const rowAddlTotal = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
                          const rowTotal = rowSmpTotal + rowSvkBase + rowAddlTotal;
                          return (
                            <tr key={r.id} className="hover:bg-[#F4FAFA] transition-colors">
                              <td className="px-3 py-2 text-[11.5px] font-medium text-[#262B35] whitespace-nowrap tabular-nums">
                                {r.date.split('-').reverse().join('-')}
                              </td>
                              <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371] whitespace-nowrap tabular-nums">
                                {r.receiptNumber || '—'}
                              </td>
                              <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371] whitespace-nowrap tabular-nums">
                                {r.svkReceiptNumber || '—'}
                              </td>
                              <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371] whitespace-nowrap tabular-nums">
                                {r.additionalReceiptNumber || '—'}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {(() => {
                                  const rowSmpAmt = sumSMPRecord(r.smp);
                                  const rowSvkAmt = r.svk;
                                  const rowAddlAmt = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
                                  const hasPerSection = r.smpPaymentMode !== undefined || r.svkPaymentMode !== undefined || r.additionalPaymentMode !== undefined;
                                  const badge = (mode: typeof r.paymentMode) => (
                                    <ModePill mode={mode}>{mode}</ModePill>
                                  );
                                  if (!hasPerSection) return badge(r.paymentMode);
                                  const smpMode = r.smpPaymentMode ?? r.paymentMode;
                                  const svkMode = r.svkPaymentMode ?? r.paymentMode;
                                  const addlMode = r.additionalPaymentMode ?? r.paymentMode;
                                  const activeModes = [
                                    ...(rowSmpAmt > 0 ? [smpMode] : []),
                                    ...(rowSvkAmt > 0 ? [svkMode] : []),
                                    ...(rowAddlAmt > 0 ? [addlMode] : []),
                                  ];
                                  if (activeModes.length > 0 && activeModes.every((m) => m === activeModes[0])) {
                                    return badge(activeModes[0]);
                                  }
                                  return (
                                    <div className="flex flex-col items-start gap-1">
                                      {rowSmpAmt > 0 && (
                                        <ModePill mode={smpMode}>SMP · {smpMode}</ModePill>
                                      )}
                                      {rowSvkAmt > 0 && (
                                        <ModePill mode={svkMode}>SVK · {svkMode}</ModePill>
                                      )}
                                      {rowAddlAmt > 0 && (
                                        <ModePill mode={addlMode}>Addl · {addlMode}</ModePill>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-2 text-[11px] font-medium text-[#8A93A3] max-w-[8rem] truncate">
                                {r.remarks || '—'}
                              </td>
                              <td
                                className="px-3 py-2 text-right text-[11.5px] font-medium whitespace-nowrap tabular-nums cursor-pointer hover:underline underline-offset-2 hover:brightness-95"
                                style={amtCell(SKY)}
                                title="View receipt breakup"
                                onClick={() => setReceiptDetailRecord(r)}
                              >
                                {rowSmpTotal > 0 ? rowSmpTotal.toLocaleString() : <span className="text-[#C4C8D0]">—</span>}
                              </td>
                              <td
                                className="px-3 py-2 text-right text-[11.5px] font-medium whitespace-nowrap tabular-nums cursor-pointer hover:underline underline-offset-2 hover:brightness-95"
                                style={amtCell(VIOLET)}
                                title="View receipt breakup"
                                onClick={() => setReceiptDetailRecord(r)}
                              >
                                {rowSvkBase > 0 ? rowSvkBase.toLocaleString() : <span className="text-[#C4C8D0]">—</span>}
                              </td>
                              <td
                                className="px-3 py-2 text-right text-[11.5px] font-medium whitespace-nowrap tabular-nums cursor-pointer hover:underline underline-offset-2 hover:brightness-95"
                                style={amtCell(MINT)}
                                title="View receipt breakup"
                                onClick={() => setReceiptDetailRecord(r)}
                              >
                                {rowAddlTotal > 0 ? rowAddlTotal.toLocaleString() : <span className="text-[#C4C8D0]">—</span>}
                              </td>
                              <td
                                className="px-3 py-2 text-right text-[12px] font-semibold whitespace-nowrap tabular-nums cursor-pointer hover:underline underline-offset-2 hover:brightness-95"
                                style={amtCell(TEAL)}
                                title="View receipt breakup"
                                onClick={() => setReceiptDetailRecord(r)}
                              >
                                ₹{rowTotal.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#C7E2E2] bg-[#F2F9F9]">
                          <td colSpan={6} className="px-3 py-2 text-[11px] font-medium text-[#5B6371]">
                            {records.length} receipt{records.length > 1 ? 's' : ''}
                          </td>
                          <td className="px-3 py-2 text-right text-[11.5px] font-semibold tabular-nums" style={amtHead(SKY)}>
                            {records.reduce((s, r) => s + sumSMPRecord(r.smp), 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right text-[11.5px] font-semibold tabular-nums" style={amtHead(VIOLET)}>
                            {records.reduce((s, r) => s + r.svk, 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right text-[11.5px] font-semibold tabular-nums" style={amtHead(MINT)}>
                            {records.reduce((s, r) => s + r.additionalPaid.reduce((a, h) => a + h.amount, 0), 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right text-[12px] font-semibold tabular-nums" style={amtHead(TEAL)}>
                            ₹{totalPaid.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Pending dues breakdown */}
                  {ev && (
                    <div className="border-t" style={{ borderColor: `${tone}26` }}>
                      <button
                        onClick={() => toggleDues(academicYear)}
                        className="group w-full flex items-center justify-between px-4 py-2 hover:brightness-[0.98] transition-all cursor-pointer text-left"
                        style={{ background: `${tone}0A` }}
                        aria-expanded={isOpen}
                      >
                        <span className="text-[10px] font-medium text-[#0B6567] uppercase tracking-[0.8px]">
                          Pending Dues Breakdown
                          {override && !structure && (
                            <span className="ml-1 normal-case tracking-normal" style={{ color: inkOf(AMBER) }}>· custom allotted</span>
                          )}
                        </span>
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                          style={{ background: `${tone}17`, color: inkOf(tone) }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </span>
                      </button>
                      {isOpen && (
                      <div className="px-4 pb-3 pt-2.5" style={{ background: `${tone}0A`, animation: 'content-enter 0.22s ease-out' }}>
                      <div className="space-y-2">

                        {/* SMP row */}
                        {(() => {
                          const items = SMP_FEE_HEADS.flatMap(({ key, label }) => {
                            const allottedAmt = key === 'fine' ? fine : ev.smp[key];
                            if (allottedAmt === 0) return [];
                            const paidAmt = records.reduce((s, r) => s + r.smp[key], 0);
                            return [{ key, label, dueAmt: allottedAmt - paidAmt }];
                          });
                          if (items.length === 0) return null;
                          return (
                            <div className="flex items-start gap-2.5">
                              <GroupTag color={SKY}>SMP</GroupTag>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap gap-1.5">
                                  {items.map(({ key, label, dueAmt }) => (
                                    <DueTile key={key} label={label} dueAmt={dueAmt} />
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* SVK row */}
                        {ev.svk > 0 && (() => {
                          const svkPd = records.reduce((s, r) => s + r.svk, 0);
                          const svkDueAmt = ev.svk - svkPd;
                          return (
                            <div className="flex items-start gap-2.5">
                              <GroupTag color={VIOLET}>SVK</GroupTag>
                              <div className="flex flex-wrap gap-1.5">
                                <DueTile label="SVK Fee" dueAmt={svkDueAmt} />
                              </div>
                            </div>
                          );
                        })()}

                        {/* Additional heads row */}
                        {ev.additional.length > 0 && (() => {
                          const items = ev.additional.flatMap((h) => {
                            if (h.amount === 0) return [];
                            const paidAmt = records.reduce(
                              (s, r) => s + (r.additionalPaid.find((ap) => ap.label === h.label)?.amount ?? 0), 0,
                            );
                            return [{ label: h.label, dueAmt: h.amount - paidAmt }];
                          });
                          if (items.length === 0) return null;
                          return (
                            <div className="flex items-start gap-2.5">
                              <GroupTag color={MINT}>Addl</GroupTag>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap gap-1.5">
                                  {items.map(({ label, dueAmt }) => (
                                    <DueTile key={label} label={label} dueAmt={dueAmt} />
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                      </div>
                      </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#CDE6E6] bg-white shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#0F8B8D]/45 bg-white px-4 py-1.5 text-[12px] font-medium text-[#0B6567] hover:bg-[#0F8B8D]/[0.06] hover:border-[#0F8B8D]/70 focus:outline-none focus:ring-2 focus:ring-[#0F8B8D]/30 cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {receiptDetailRecord && (
        <FeeReceiptDetailModal
          record={receiptDetailRecord}
          isAdmin={false}
          onClose={() => setReceiptDetailRecord(null)}
        />
      )}
    </div>
  );
}
