import { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  saveFeeRecord,
  updateReceiptCounters,
  isPlausibleReceiptJump,
} from '../../services/feeRecordService';
import { saveFeeOverride } from '../../services/feeOverrideService';
import { createStudentNotification } from '../../services/studentNotificationService';
import type {
  Student,
  FeeStructure,
  FeeRecord,
  AcademicYear,
  SMPFeeHead,
  SMPHeads,
  FeeAdditionalHead,
  FinePeriod,
  PaymentMode,
  SplitPayment,
  StudentFeeOverride,
} from '../../types';
import { SMP_FEE_HEADS } from '../../types';
import { lookupFine } from '../../utils/feeCalc';
import { takeCollectFee } from './feeModalPrefetch';
import type { CollectFeeData } from './feeModalPrefetch';

function emptySMP(): SMPHeads {
  return {
    adm: 0, tuition: 0, lib: 0, rr: 0, sports: 0, lab: 0,
    dvp: 0, mag: 0, idCard: 0, ass: 0, swf: 0, twf: 0, nss: 0, fine: 0,
  };
}

function sumSMP(smp: SMPHeads): number {
  return SMP_FEE_HEADS.reduce((s, { key }) => s + smp[key], 0);
}

function sumArr(arr: FeeAdditionalHead[]): number {
  return arr.reduce((s, h) => s + h.amount, 0);
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

interface Props {
  student: Student;
  academicYear: AcademicYear;
  /** When set, receipt counters are read/written from this year instead of academicYear.
   *  Use when collecting dues for a prior-year student from the current-year context. */
  receiptCounterYear?: AcademicYear;
  onClose: () => void;
  onSaved: () => void;
}

// ── Design tokens — teal student-portal look (matches Collect Fee / Fee Details) ──
const TEAL = '#0F8B8D';
const TEAL_INK = '#0B6567';
const SKY = '#0284C7';     // SMP
const VIOLET = '#7C3AED';  // SVK
const MINT = '#0FA968';    // Additional / cleared
const CORAL = '#E11D48';
const AMBER = '#D97706';
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

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;
/** Per-section accent as CSS variables, picked up by the inputs' focus ring/border and row hover. */
const accVars = (c: string) => ({ '--acc': c, '--acc-ink': inkOf(c), '--acc-ring': `${c}33`, '--acc-row': `${c}0A` } as React.CSSProperties);

// Number input for fee tables — focus takes the enclosing section's accent.
const ni =
  'w-full rounded-lg border border-[#D5E6E6] px-2 py-1 text-xs text-right tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-[var(--acc-ring,rgba(15,139,141,0.2))] focus:border-[var(--acc,#0F8B8D)] transition-colors';
// Number input while editing the custom allotted fee.
const niAmber =
  'w-full rounded-lg border border-amber-300 px-2 py-1 text-xs text-right tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-colors';
const TXT_IN =
  'flex-1 min-w-0 rounded-lg border border-[#D5E6E6] px-2.5 py-1.5 text-xs font-medium text-[#262B35] bg-white placeholder:text-[#A9B0BB] placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[var(--acc-ring)] focus:border-[var(--acc)] transition-colors';
const SPLIT_BOX =
  'flex flex-1 items-center gap-2 text-[10.5px] font-medium text-[#5B6371] rounded-xl border border-[#0F8B8D]/20 bg-[#0F8B8D]/[0.05] px-2.5 py-1.5';
const SPLIT_IN =
  'w-24 rounded-lg border border-[#0F8B8D]/35 px-2 py-1 text-xs text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0F8B8D]/25 focus:border-[#0F8B8D] bg-white';
const FEE_CARD = 'rounded-2xl overflow-hidden border bg-white';
const feeCardStyle = (c: string) => ({ ...accVars(c), borderColor: `${c}33`, boxShadow: `0 4px 14px ${c}0F` } as React.CSSProperties);
const FTH = 'px-3 py-2 text-[9.5px] font-medium uppercase tracking-[0.6px] whitespace-nowrap text-[color:var(--acc-ink)]';

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

/** White outline pill with a tinted hairline, dot and ink. */
function OutlinePill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border bg-white/85 px-2.5 py-[4px] text-[10.5px] font-medium leading-none shrink-0 whitespace-nowrap tabular-nums"
      style={{ borderColor: `${color}73`, color: inkOf(color) }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {children}
    </span>
  );
}

/** Fee-table section title: accent dot + accent-ink label. */
function SectionTitle({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2 pl-1">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 0 3px ${color}26` }} />
      <span className="text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: inkOf(color) }}>
        {children}
      </span>
    </div>
  );
}

/** Pastel totals tile (Allotted / Paid So Far / Paying / Total After / Balance). */
function SumTile({ label, value, color, emphasis }: { label: string; value: number; color: string; emphasis?: boolean }) {
  return (
    <div
      className="flex-1 min-w-[90px] rounded-xl border px-3 py-2"
      style={{
        background: `linear-gradient(135deg, ${color}${emphasis ? '24' : '14'}, ${color}06)`,
        borderColor: `${color}${emphasis ? '66' : '40'}`,
        boxShadow: emphasis ? `0 3px 12px ${color}1F` : undefined,
      }}
    >
      <div className="text-[9px] font-medium uppercase tracking-[0.8px]" style={{ color: inkOf(color) }}>
        {label}
      </div>
      <div className={`mt-0.5 font-semibold tabular-nums ${emphasis ? 'text-[16px]' : 'text-[14px]'}`} style={{ color: inkOf(color) }}>
        ₹{value.toLocaleString()}
      </div>
    </div>
  );
}

/** CASH / UPI / SPLIT segmented pill group; the selected mode fills with the section accent (SPLIT in teal). */
function ModeToggle({ value, color, onSelect }: { value: PaymentMode; color: string; onSelect: (mode: PaymentMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0 w-[144px] rounded-full border border-[#D5E6E6] bg-white p-0.5">
      {(['CASH', 'UPI', 'SPLIT'] as PaymentMode[]).map((mode) => {
        const selected = value === mode;
        const c = mode === 'SPLIT' ? TEAL : color;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onSelect(mode)}
            className={`flex-1 py-[5px] rounded-full text-[9.5px] font-semibold tracking-[0.3px] text-center leading-none transition-colors cursor-pointer ${
              selected ? 'text-white' : 'text-[#8A93A3] hover:bg-[#F4FAFA]'
            }`}
            style={selected ? { background: c, boxShadow: `0 2px 6px ${c}40` } : undefined}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}

/** Split-payment match indicator: mint when cash + UPI equals the section total, coral otherwise. */
function SplitCheck({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const c = ok ? MINT : CORAL;
  return (
    <span
      className="shrink-0 rounded-full px-2 py-[3px] font-semibold tabular-nums"
      style={{ background: `${c}14`, color: inkOf(c) }}
    >
      {children}
    </span>
  );
}

function ErrorStrip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[12px] font-medium rounded-xl border px-3 py-2"
      style={{ background: `${CORAL}0D`, borderColor: `${CORAL}40`, color: inkOf(CORAL) }}
    >
      {children}
    </div>
  );
}

export function FeeCollectionModal({ student, academicYear, receiptCounterYear, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const counterYear = receiptCounterYear ?? academicYear;
  const [structure, setStructure] = useState<FeeStructure | null>(null);
  /** All prior payment records for this student in this year */
  const [priorPayments, setPriorPayments] = useState<FeeRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Per-student allotted fee override ────────────────────────────────────
  const [loadedOverride, setLoadedOverride] = useState<StudentFeeOverride | null>(null);
  const [editingAllotted, setEditingAllotted] = useState(false);
  const [overrideSmp, setOverrideSmp] = useState<SMPHeads>(emptySMP());
  const [overrideSvk, setOverrideSvk] = useState(0);
  const [overrideAdditional, setOverrideAdditional] = useState<FeeAdditionalHead[]>([]);
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideSaveError, setOverrideSaveError] = useState<string | null>(null);

  /** Amounts being collected in THIS payment session */
  const [smpNow, setSmpNow] = useState<SMPHeads>(emptySMP());
  const [svkNow, setSvkNow] = useState(0);
  const [additionalNow, setAdditionalNow] = useState<FeeAdditionalHead[]>([]);
  const [date, setDate] = useState(today());
  const [receiptNo, setReceiptNo] = useState('');
  const [suggestedSmpReceipt, setSuggestedSmpReceipt] = useState('');
  const [svkReceiptNo, setSvkReceiptNo] = useState('');
  const [additionalReceiptNo, setAdditionalReceiptNo] = useState('');
  const [smpPaymentMode, setSmpPaymentMode] = useState<PaymentMode>('CASH');
  const [svkPaymentMode, setSvkPaymentMode] = useState<PaymentMode>('CASH');
  const [additionalPaymentMode, setAdditionalPaymentMode] = useState<PaymentMode>('CASH');
  const [smpSplit, setSmpSplit] = useState<SplitPayment>({ cash: 0, upi: 0 });
  const [svkSplit, setSvkSplit] = useState<SplitPayment>({ cash: 0, upi: 0 });
  const [additionalSplit, setAdditionalSplit] = useState<SplitPayment>({ cash: 0, upi: 0 });
  const [fineSchedule, setFineSchedule] = useState<FinePeriod[]>([]);
  const [remarks, setRemarks] = useState('');


  // ── Cumulative paid so far (derived from priorPayments) ───────────────────
  const cumulativeSmp = useMemo<SMPHeads>(() => {
    const smp = emptySMP();
    for (const r of priorPayments) {
      for (const { key } of SMP_FEE_HEADS) smp[key] += r.smp[key];
    }
    return smp;
  }, [priorPayments]);

  const cumulativeSvk = useMemo(
    () => priorPayments.reduce((s, r) => s + r.svk, 0),
    [priorPayments]
  );

  const cumulativeAdditional = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of priorPayments) {
      for (const h of r.additionalPaid) {
        map.set(h.label, (map.get(h.label) ?? 0) + h.amount);
      }
    }
    return map;
  }, [priorPayments]);

  // Loads structure, prior payments, next receipt numbers, fine schedule and override
  // (see feeModalPrefetch). A layout effect so an already-prefetched result renders
  // before the first paint — the modal opens filled, with no skeleton.
  useLayoutEffect(() => {
    let cancelled = false;
    const applyLoaded = ([struct, prior, receipts, schedule, override]: CollectFeeData) => {
      setStructure(struct);
      setPriorPayments(prior);
      setReceiptNo(receipts.smp);
      setSuggestedSmpReceipt(receipts.smp);
      setSvkReceiptNo(receipts.svk);
      setAdditionalReceiptNo(receipts.additional);
      setFineSchedule(schedule);
      setLoadedOverride(override);

      // Effective allotted: override takes precedence over structure
      const effSmp = override ? override.smp : struct?.smp;
      const effSvk = override ? override.svk : struct?.svk;
      const effAdditional = override ? override.additionalHeads : struct?.additionalHeads;

      if (effSmp !== undefined) {
        // Compute cumulative from prior payments
        const cumSmp = emptySMP();
        for (const r of prior) {
          for (const { key } of SMP_FEE_HEADS) cumSmp[key] += r.smp[key];
        }
        const cumSvk = prior.reduce((s, r) => s + r.svk, 0);

        // Pre-fill with remaining balance (allotted − already paid)
        const fineExempt =
          (student.year === '1ST YEAR' && (student.admType === 'REGULAR' || student.admType === 'SNQ')) ||
          (student.year === '2ND YEAR' && student.admType === 'LATERAL');
        const remaining = emptySMP();
        for (const { key } of SMP_FEE_HEADS) {
          remaining[key] = key === 'fine' && fineExempt ? 0 : Math.max(0, effSmp[key] - cumSmp[key]);
        }
        setSmpNow(remaining);
        setSvkNow(Math.max(0, (effSvk ?? 0) - cumSvk));
        setAdditionalNow(
          (effAdditional ?? []).map((h) => {
            const prevPaid = prior.reduce(
              (s, r) =>
                s + (r.additionalPaid.find((ap) => ap.label === h.label)?.amount ?? 0),
              0
            );
            return { label: h.label, amount: Math.max(0, h.amount - prevPaid) };
          })
        );
      }
      // If neither structure nor override: everything stays 0
    };
    const load = takeCollectFee(student, academicYear, counterYear);
    if (load.data) {
      applyLoaded(load.data);
      setLoadingData(false);
      return;
    }
    load.promise
      .then((data) => { if (!cancelled) applyLoaded(data); })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load fee data');
      })
      .finally(() => { if (!cancelled) setLoadingData(false); });
    return () => { cancelled = true; };
  }, [academicYear, student.course, student.id, student.year, student.admType, student.admCat]);

  // Fine is exempt for: 1st Year Regular/SNQ (all courses), 2nd Year Lateral (all courses).
  const isFineExempt =
    (student.year === '1ST YEAR' && (student.admType === 'REGULAR' || student.admType === 'SNQ')) ||
    (student.year === '2ND YEAR' && student.admType === 'LATERAL');

  // Auto-fill Fine from the year-level schedule whenever date or schedule changes.
  // Skip when a custom override specifies its own fine — the override is authoritative.
  // Also skip for due/installment payments — the fine is decided once, on the first
  // payment, and must not be re-evaluated against a later due-payment date.
  useEffect(() => {
    if (!fineSchedule.length || !date || isFineExempt) return;
    if (loadedOverride !== undefined && loadedOverride !== null) return;
    if (priorPayments.length > 0) return;
    const fine = lookupFine(date, fineSchedule);
    setSmpNow((prev) => ({ ...prev, fine }));
  }, [date, fineSchedule, isFineExempt, loadedOverride, priorPayments]);

  function handleSMPChange(key: SMPFeeHead, val: string) {
    setSmpNow((prev) => ({ ...prev, [key]: Math.max(0, parseInt(val) || 0) }));
  }

  function handleAdditionalChange(idx: number, val: string) {
    setAdditionalNow((prev) =>
      prev.map((h, i) =>
        i === idx ? { ...h, amount: Math.max(0, parseInt(val) || 0) } : h
      )
    );
  }

  // ── Override allotted handlers ────────────────────────────────────────────
  function startEditAllotted() {
    const src = loadedOverride ?? (structure
      ? { smp: structure.smp, svk: structure.svk, additionalHeads: structure.additionalHeads }
      : null);
    if (!src) return;
    setOverrideSmp({ ...src.smp });
    setOverrideSvk(src.svk);
    setOverrideAdditional(src.additionalHeads.map((h) => ({ ...h })));
    setOverrideSaveError(null);
    setEditingAllotted(true);
  }

  function cancelEditAllotted() {
    setEditingAllotted(false);
    setOverrideSaveError(null);
  }

  async function handleSaveOverride() {
    setSavingOverride(true);
    setOverrideSaveError(null);
    try {
      await saveFeeOverride({
        studentId: student.id,
        academicYear,
        smp: overrideSmp,
        svk: overrideSvk,
        additionalHeads: overrideAdditional,
      });
      const saved: StudentFeeOverride = {
        id: `${student.id}__${academicYear}`,
        studentId: student.id,
        academicYear,
        smp: overrideSmp,
        svk: overrideSvk,
        additionalHeads: overrideAdditional,
        updatedAt: new Date().toISOString(),
      };
      setLoadedOverride(saved);
      setEditingAllotted(false);

      if (user) {
        void createStudentNotification({
          studentId: student.id,
          regNumber: student.regNumber,
          type: 'fee-dues-updated',
          title: 'Fee Allotment Updated',
          message: `Your fee allotment for ${academicYear} has been updated by the office. Check the Fee History tab for the latest breakup.`,
          createdBy: user.uid,
        });
      }

      // Re-prefill Now Paying with remaining balance from the newly saved override
      const fineExempt =
        (student.year === '1ST YEAR' && (student.admType === 'REGULAR' || student.admType === 'SNQ')) ||
        (student.year === '2ND YEAR' && student.admType === 'LATERAL');
      const remaining = emptySMP();
      for (const { key } of SMP_FEE_HEADS) {
        remaining[key] = key === 'fine' && fineExempt ? 0 : Math.max(0, overrideSmp[key] - cumulativeSmp[key]);
      }
      setSmpNow(remaining);
      setSvkNow(Math.max(0, overrideSvk - cumulativeSvk));
      setAdditionalNow(
        overrideAdditional.map((h) => {
          const prevPaid = cumulativeAdditional.get(h.label) ?? 0;
          return { label: h.label, amount: Math.max(0, h.amount - prevPaid) };
        })
      );
    } catch (err: unknown) {
      setOverrideSaveError(err instanceof Error ? err.message : 'Failed to save allotted override');
    } finally {
      setSavingOverride(false);
    }
  }

  // ── Effective allotted: override > structure ───────────────────────────────
  const effSmpValues: SMPHeads = editingAllotted
    ? overrideSmp
    : (loadedOverride?.smp ?? structure?.smp ?? emptySMP());
  const effSvkValue: number = editingAllotted
    ? overrideSvk
    : (loadedOverride?.svk ?? structure?.svk ?? 0);
  const effAdditionalHeads: FeeAdditionalHead[] = editingAllotted
    ? overrideAdditional
    : (loadedOverride?.additionalHeads ?? structure?.additionalHeads ?? []);

  // ── Derived totals ────────────────────────────────────────────────────────
  // Fine is dynamic — the effective allotted fine is whatever has been paid in
  // total (prior + now), so fine payments never produce a negative balance.
  const totalFinePaid = cumulativeSmp.fine + smpNow.fine;
  const hasAllotted = !!(structure || loadedOverride);
  const effectiveFineAllotted = hasAllotted ? Math.max(effSmpValues.fine, totalFinePaid) : 0;
  const smpAllotted = hasAllotted
    ? sumSMP(effSmpValues) - effSmpValues.fine + effectiveFineAllotted
    : 0;
  const svkAllotted = effSvkValue;
  const additionalAllotted = sumArr(effAdditionalHeads);
  const grandAllotted = smpAllotted + svkAllotted + additionalAllotted;

  const smpPreviousTotal = sumSMP(cumulativeSmp);
  const svkPreviousTotal = cumulativeSvk;
  const additionalPreviousTotal = [...cumulativeAdditional.values()].reduce((s, v) => s + v, 0);
  const totalPrevious = smpPreviousTotal + svkPreviousTotal + additionalPreviousTotal;

  const smpNowTotal = sumSMP(smpNow);
  const svkNowTotal = svkNow;
  const additionalNowTotal = sumArr(additionalNow);
  const grandNow = smpNowTotal + svkNowTotal + additionalNowTotal;

  const grandTotal = totalPrevious + grandNow;
  const balance = grandAllotted - grandTotal;

  // ── Split payment helpers ─────────────────────────────────────────────────
  const splitNote = useMemo(() => {
    const parts: string[] = [];
    if (smpPaymentMode === 'SPLIT' && smpNowTotal > 0 && (smpSplit.cash > 0 || smpSplit.upi > 0)) {
      parts.push(`SMP: ₹${smpSplit.cash.toLocaleString()} Cash + ₹${smpSplit.upi.toLocaleString()} UPI`);
    }
    if (svkPaymentMode === 'SPLIT' && svkNowTotal > 0 && (svkSplit.cash > 0 || svkSplit.upi > 0)) {
      parts.push(`SVK: ₹${svkSplit.cash.toLocaleString()} Cash + ₹${svkSplit.upi.toLocaleString()} UPI`);
    }
    if (additionalPaymentMode === 'SPLIT' && additionalNowTotal > 0 && (additionalSplit.cash > 0 || additionalSplit.upi > 0)) {
      parts.push(`Addl: ₹${additionalSplit.cash.toLocaleString()} Cash + ₹${additionalSplit.upi.toLocaleString()} UPI`);
    }
    return parts.join('; ');
  }, [smpPaymentMode, svkPaymentMode, additionalPaymentMode, smpNowTotal, svkNowTotal, additionalNowTotal, smpSplit, svkSplit, additionalSplit]);

  const isSplitValid =
    (smpPaymentMode !== 'SPLIT' || smpNowTotal === 0 || smpSplit.cash + smpSplit.upi === smpNowTotal) &&
    (svkPaymentMode !== 'SPLIT' || svkNowTotal === 0 || svkSplit.cash + svkSplit.upi === svkNowTotal) &&
    (additionalPaymentMode !== 'SPLIT' || additionalNowTotal === 0 || additionalSplit.cash + additionalSplit.upi === additionalNowTotal);

  // ── Save (this installment only — not cumulative) ─────────────────────────
  async function handleSave() {
    if (!date) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Validate split amounts
      if (smpPaymentMode === 'SPLIT' && smpNowTotal > 0 && smpSplit.cash + smpSplit.upi !== smpNowTotal) {
        setSaveError(`SMP split (₹${smpSplit.cash} Cash + ₹${smpSplit.upi} UPI) must equal ₹${smpNowTotal}`);
        return;
      }
      if (svkPaymentMode === 'SPLIT' && svkNowTotal > 0 && svkSplit.cash + svkSplit.upi !== svkNowTotal) {
        setSaveError(`SVK split (₹${svkSplit.cash} Cash + ₹${svkSplit.upi} UPI) must equal ₹${svkNowTotal}`);
        return;
      }
      if (additionalPaymentMode === 'SPLIT' && additionalNowTotal > 0 && additionalSplit.cash + additionalSplit.upi !== additionalNowTotal) {
        setSaveError(`Additional split (₹${additionalSplit.cash} Cash + ₹${additionalSplit.upi} UPI) must equal ₹${additionalNowTotal}`);
        return;
      }

      const combinedRemarks = [splitNote, remarks].filter(Boolean).join('; ');

      const usedSmpReceipt  = smpNowTotal        > 0 ? receiptNo           : '';
      const usedSvkReceipt  = svkNowTotal        > 0 ? svkReceiptNo        : '';
      const usedAddReceipt  = additionalNowTotal  > 0 ? additionalReceiptNo : '';

      if (usedSmpReceipt) {
        const suggestedN = parseInt(suggestedSmpReceipt, 10);
        const usedN = parseInt(usedSmpReceipt, 10);
        if (!isNaN(suggestedN) && !isNaN(usedN) && !isPlausibleReceiptJump(suggestedN, usedN)) {
          const proceed = window.confirm(
            `SMP Receipt No "${usedSmpReceipt}" looks unusually high for this series (suggested next: ${suggestedSmpReceipt}). ` +
            `This may belong to the other (Aided/Unaided) series. Continue anyway?`
          );
          if (!proceed) {
            return;
          }
        }
      }

      await saveFeeRecord({
        studentId: student.id,
        studentName: student.studentNameSSLC,
        fatherName: student.fatherName,
        regNumber: student.regNumber,
        course: student.course,
        year: student.year,
        admCat: student.admCat,
        admType: student.admType,
        academicYear,
        date,
        receiptNumber: usedSmpReceipt,
        svkReceiptNumber: usedSvkReceipt,
        additionalReceiptNumber: usedAddReceipt,
        // Primary paymentMode = SMP mode if SMP paid, else SVK, else Additional (backward compat)
        paymentMode: smpNowTotal > 0 ? smpPaymentMode : svkNowTotal > 0 ? svkPaymentMode : additionalPaymentMode,
        ...(smpNowTotal > 0 ? { smpPaymentMode, ...(smpPaymentMode === 'SPLIT' ? { smpSplit } : {}) } : {}),
        ...(svkNowTotal > 0 ? { svkPaymentMode, ...(svkPaymentMode === 'SPLIT' ? { svkSplit } : {}) } : {}),
        ...(additionalNowTotal > 0 ? { additionalPaymentMode, ...(additionalPaymentMode === 'SPLIT' ? { additionalSplit } : {}) } : {}),
        remarks: combinedRemarks,
        isDueFee: priorPayments.length > 0,
        smp: smpNow,
        svk: svkNow,
        additionalPaid: additionalNow,
      });

      // Update counters to reflect the highest receipt numbers now in use.
      // This runs after save so cancelling the modal never wastes a number.
      await updateReceiptCounters(counterYear, student.course, {
        smp:        usedSmpReceipt,
        svk:        usedSvkReceipt,
        additional: usedAddReceipt,
      });

      if (user && grandNow > 0) {
        void createStudentNotification({
          studentId: student.id,
          regNumber: student.regNumber,
          type: 'fee-paid',
          title: 'Fee Payment Received',
          message: `A payment of ₹${grandNow.toLocaleString()} was recorded for ${academicYear} on ${date}. Remaining balance: ₹${Math.max(0, balance).toLocaleString()}.`,
          createdBy: user.uid,
        });
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save fee record');
    } finally {
      setSaving(false);
    }
  }

  const isUpdate = priorPayments.length > 0;

  return (
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-[#0B2A2B]/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div
        className="relative bg-white rounded-[22px] border border-[#CDE6E6] w-full max-w-3xl flex flex-col overflow-hidden h-[calc(100vh-3rem)]"
        style={{ animation: 'modal-enter 0.25s ease-out', boxShadow: '0 24px 60px rgba(11,42,43,0.22), 0 4px 14px rgba(18,20,26,0.06)' }}
      >

        {/* Header */}
        <div
          className="relative overflow-hidden px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-[#0F8B8D]/20"
          style={{ background: `linear-gradient(135deg, ${TEAL}24 0%, ${TEAL}0D 55%, #FFFFFF 100%)` }}
        >
          <span
            className="pointer-events-none absolute -top-20 -right-10 w-44 h-44 rounded-full border-[22px]"
            style={{ borderColor: `${TEAL}14` }}
            aria-hidden="true"
          />
          <div className="relative min-w-0 flex items-center gap-2.5 flex-wrap">
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] text-white text-[15px] font-semibold shrink-0"
              style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_INK})`, boxShadow: `0 3px 10px ${TEAL}40` }}
            >
              ₹
            </span>
            <div className="flex flex-col">
              <span className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">Fee Collection</span>
              <h3 className="mt-1 text-[17px] font-bold text-[#0B6567] leading-none tracking-[-0.2px]">
                {isUpdate ? 'Add Payment Installment' : 'Collect Fee'}
              </h3>
            </div>
            <span className="rounded-full border border-[#0F8B8D]/45 bg-white/80 text-[#0B6567] px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums">
              {academicYear}
            </span>
            {isUpdate && (
              <OutlinePill color={AMBER}>
                {priorPayments.length} prior payment{priorPayments.length > 1 ? 's' : ''} on record
              </OutlinePill>
            )}
            {isUpdate && !loadingData && grandAllotted > 0 && (
              <OutlinePill color={CORAL}>
                Due: ₹{(grandAllotted - totalPrevious).toLocaleString()}
              </OutlinePill>
            )}
          </div>
          <button
            onClick={onClose}
            className="relative flex items-center justify-center w-8 h-8 rounded-full border border-[#0F8B8D]/35 bg-white text-[#0B6567] hover:bg-[#EFF8F8] hover:border-[#0F8B8D]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F8B8D]/30 transition-colors cursor-pointer shrink-0 ml-3 shadow-[0_1px_4px_rgba(18,20,26,0.06)]"
            aria-label="Close"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Student info bar */}
        <div className="px-5 py-3 bg-white border-b border-[#E3F0F0] shrink-0">
          <div className="flex items-center gap-x-4 gap-y-2.5 flex-wrap">
            <div className="min-w-[200px] flex-1 flex items-center gap-3">
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

          {/* Override allotted controls */}
          {!loadingData && !loadError && (
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              {loadedOverride && !editingAllotted && (
                <OutlinePill color={AMBER}>✎ Custom allotted fee active</OutlinePill>
              )}
              {!editingAllotted && (structure || loadedOverride) && (
                <button
                  onClick={startEditAllotted}
                  className="inline-flex items-center gap-1 rounded-full border border-[#0F8B8D]/40 bg-white px-2.5 py-[4px] text-[10.5px] font-medium text-[#0B6567] hover:bg-[#0F8B8D]/[0.06] hover:border-[#0F8B8D]/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F8B8D]/30 transition-colors cursor-pointer"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  {loadedOverride ? 'Edit Custom Allotted' : 'Override Allotted Fee'}
                </button>
              )}
              {editingAllotted && (
                <>
                  <span className="text-[10.5px] font-medium" style={{ color: inkOf(AMBER) }}>
                    Editing allotted fee — save separately below
                  </span>
                  <button
                    onClick={cancelEditAllotted}
                    className="rounded-full border border-[#D5E6E6] bg-white px-2.5 py-[4px] text-[10.5px] font-medium text-[#5B6371] hover:bg-[#F4FAFA] cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div
          className="scroll-teal px-5 py-4 flex-1 min-h-0 overflow-y-auto"
          style={{ background: 'linear-gradient(160deg, #F6FBFB 0%, #FCFDFD 45%, #F2F9F9 100%)' }}
        >
          {loadingData ? (
            <div className="space-y-5">
              {/* SMP table skeleton */}
              <div>
                <div className="skeleton h-3 w-36 mb-3 rounded" />
                <div className="border border-[#CDE6E6] bg-white rounded-2xl overflow-hidden">
                  <div className="bg-[#EDF7F7] px-3 py-2 flex gap-4 border-b border-[#E3F0F0]">
                    <div className="skeleton h-3 flex-1" />
                    <div className="skeleton h-3 w-20" />
                    <div className="skeleton h-3 w-24" />
                  </div>
                  {Array.from({ length: 14 }).map((_, i) => (
                    <div key={i} className="px-3 py-2 flex gap-4 border-b border-[#EAF3F3] last:border-0">
                      <div className="skeleton h-3 flex-1" style={{ width: `${45 + (i % 4) * 10}%` }} />
                      <div className="skeleton h-3 w-20" />
                      <div className="skeleton h-6 w-24 !rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
              {/* SVK skeleton */}
              <div>
                <div className="skeleton h-3 w-28 mb-3 rounded" />
                <div className="border border-[#CDE6E6] bg-white rounded-2xl overflow-hidden">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="px-3 py-2 flex gap-4 border-b border-[#EAF3F3] last:border-0">
                      <div className="skeleton h-3 flex-1" />
                      <div className="skeleton h-3 w-20" />
                      <div className="skeleton h-6 w-24 !rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center" style={{ animation: 'content-enter 0.26s ease-out' }}>
              <div className="w-14 h-14 rounded-2xl border flex items-center justify-center" style={{ borderColor: `${CORAL}40`, background: `${CORAL}0F`, color: CORAL }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <span className="text-[13px] font-medium" style={{ color: inkOf(CORAL) }}>{loadError}</span>
            </div>
          ) : (
            <div className="space-y-5" style={{ animation: 'content-enter 0.3s ease-out' }}>
              {!structure && !loadedOverride && (
                <div
                  className="rounded-2xl border px-4 py-3 flex items-start gap-3 text-[12px] font-medium leading-relaxed"
                  style={{ background: `${AMBER}0F`, borderColor: `${AMBER}4D`, color: inkOf(AMBER) }}
                >
                  <span className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white shrink-0" style={{ background: AMBER }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </span>
                  <div>
                    No fee structure configured for{' '}
                    <strong className="font-semibold">
                      {student.course} / {student.year} / {student.admType} / {student.admCat}
                    </strong>{' '}
                    — <strong className="font-semibold">{academicYear}</strong>. Set it up in the{' '}
                    <strong className="font-semibold">Fee Structure</strong> page first, or use <strong className="font-semibold">Override Allotted Fee</strong> above.
                  </div>
                </div>
              )}

              {/* ── SMP Fee Table ──────────────────────────────────────── */}
              <div>
                <SectionTitle color={SKY}>SMP Fee — Government</SectionTitle>
                <div className={FEE_CARD} style={feeCardStyle(SKY)}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: `${SKY}12`, boxShadow: `inset 0 -1px 0 ${SKY}33` }}>
                        <th className={`${FTH} text-left`}>Head</th>
                        <th className={`${FTH} text-right w-24`}>Allotted (₹)</th>
                        {isUpdate && (
                          <th className={`${FTH} text-right w-24`}>
                            Paid (₹)
                          </th>
                        )}
                        <th className={`${FTH} text-right w-28`} style={{ background: `${SKY}1F` }}>
                          {isUpdate ? 'Now Paying (₹)' : 'Paying (₹)'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF4F6]">
                      {SMP_FEE_HEADS.map(({ key, label }) => (
                        <tr
                          key={key}
                          className={editingAllotted ? 'bg-amber-50/70' : 'hover:bg-[var(--acc-row)] transition-colors'}
                        >
                          <td className="px-3 py-1.5 text-[12px] font-medium text-[#262B35]">{label}</td>
                          <td className="px-2 py-1.5">
                            {editingAllotted ? (
                              <input
                                type="number"
                                min="0"
                                value={overrideSmp[key] === 0 ? '' : overrideSmp[key]}
                                onChange={(e) =>
                                  setOverrideSmp((prev) => ({
                                    ...prev,
                                    [key]: Math.max(0, parseInt(e.target.value) || 0),
                                  }))
                                }
                                className={niAmber}
                                placeholder="0"
                              />
                            ) : (
                              <span
                                className={`block text-right pr-2 tabular-nums ${
                                  loadedOverride ? 'text-amber-700 font-medium' : 'text-[#8A93A3]'
                                }`}
                              >
                                {hasAllotted ? effSmpValues[key].toLocaleString() : '—'}
                              </span>
                            )}
                          </td>
                          {isUpdate && (
                            <td className="px-3 py-1.5 text-right text-[#8A93A3] tabular-nums">
                              {cumulativeSmp[key].toLocaleString()}
                            </td>
                          )}
                          <td className="px-2 py-1.5" style={{ background: `${SKY}0A` }}>
                            <input
                              type="number"
                              min="0"
                              value={smpNow[key] === 0 ? '' : smpNow[key]}
                              onChange={(e) => handleSMPChange(key, e.target.value)}
                              className={ni}
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: `${SKY}0F`, boxShadow: `inset 0 1px 0 ${SKY}33` }}>
                        <td className="px-3 py-2 text-[12px] font-semibold" style={{ color: inkOf(SKY) }}>Total SMP</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: inkOf(SKY) }}>
                          {smpAllotted.toLocaleString()}
                        </td>
                        {isUpdate && (
                          <td className="px-3 py-2 text-right font-medium text-[#5B6371] tabular-nums">
                            {smpPreviousTotal.toLocaleString()}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums" style={{ color: inkOf(SKY), background: `${SKY}1F` }}>
                          {smpNowTotal.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── SVK Fee Table ──────────────────────────────────────── */}
              <div>
                <SectionTitle color={VIOLET}>SVK Fee — Management</SectionTitle>
                <div className={FEE_CARD} style={feeCardStyle(VIOLET)}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: `${VIOLET}12`, boxShadow: `inset 0 -1px 0 ${VIOLET}33` }}>
                        <th className={`${FTH} text-left`}>Head</th>
                        <th className={`${FTH} text-right w-24`}>Allotted (₹)</th>
                        {isUpdate && (
                          <th className={`${FTH} text-right w-24`}>
                            Paid (₹)
                          </th>
                        )}
                        <th className={`${FTH} text-right w-28`} style={{ background: `${VIOLET}1F` }}>
                          {isUpdate ? 'Now Paying (₹)' : 'Paying (₹)'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF4F6]">
                      <tr
                        className={
                          editingAllotted ? 'bg-amber-50/70' : 'hover:bg-[var(--acc-row)] transition-colors'
                        }
                      >
                        <td className="px-3 py-1.5 text-[12px] font-medium text-[#262B35]">SVK</td>
                        <td className="px-2 py-1.5">
                          {editingAllotted ? (
                            <input
                              type="number"
                              min="0"
                              value={overrideSvk === 0 ? '' : overrideSvk}
                              onChange={(e) =>
                                setOverrideSvk(Math.max(0, parseInt(e.target.value) || 0))
                              }
                              className={niAmber}
                              placeholder="0"
                            />
                          ) : (
                            <span
                              className={`block text-right pr-2 tabular-nums ${
                                loadedOverride ? 'text-amber-700 font-medium' : 'text-[#8A93A3]'
                              }`}
                            >
                              {hasAllotted ? effSvkValue.toLocaleString() : '—'}
                            </span>
                          )}
                        </td>
                        {isUpdate && (
                          <td className="px-3 py-1.5 text-right text-[#8A93A3] tabular-nums">
                            {cumulativeSvk.toLocaleString()}
                          </td>
                        )}
                        <td className="px-2 py-1.5" style={{ background: `${VIOLET}0A` }}>
                          <input
                            type="number"
                            min="0"
                            value={svkNow === 0 ? '' : svkNow}
                            onChange={(e) =>
                              setSvkNow(Math.max(0, parseInt(e.target.value) || 0))
                            }
                            className={ni}
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr style={{ background: `${VIOLET}0F`, boxShadow: `inset 0 1px 0 ${VIOLET}33` }}>
                        <td className="px-3 py-2 text-[12px] font-semibold" style={{ color: inkOf(VIOLET) }}>Total SVK</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: inkOf(VIOLET) }}>
                          {svkAllotted.toLocaleString()}
                        </td>
                        {isUpdate && (
                          <td className="px-3 py-2 text-right font-medium text-[#5B6371] tabular-nums">
                            {svkPreviousTotal.toLocaleString()}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums" style={{ color: inkOf(VIOLET), background: `${VIOLET}1F` }}>
                          {svkNowTotal.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── Additional Fee Table ───────────────────────────────── */}
              {(additionalNow.length > 0 || (editingAllotted && effAdditionalHeads.length > 0)) && (
                <div>
                  <SectionTitle color={MINT}>Additional Fee</SectionTitle>
                  <div className={FEE_CARD} style={feeCardStyle(MINT)}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: `${MINT}12`, boxShadow: `inset 0 -1px 0 ${MINT}33` }}>
                          <th className={`${FTH} text-left`}>Head</th>
                          <th className={`${FTH} text-right w-24`}>Allotted (₹)</th>
                          {isUpdate && (
                            <th className={`${FTH} text-right w-24`}>
                              Paid (₹)
                            </th>
                          )}
                          <th className={`${FTH} text-right w-28`} style={{ background: `${MINT}1F` }}>
                            {isUpdate ? 'Now Paying (₹)' : 'Paying (₹)'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEF4F6]">
                        {effAdditionalHeads.map((ah, idx) => {
                          const nowEntry = additionalNow.find((h) => h.label === ah.label);
                          const nowIdx = additionalNow.findIndex((h) => h.label === ah.label);
                          return (
                            <tr
                              key={ah.label}
                              className={
                                editingAllotted
                                  ? 'bg-amber-50/70'
                                  : 'hover:bg-[var(--acc-row)] transition-colors'
                              }
                            >
                              <td className="px-3 py-1.5 text-[12px] font-medium text-[#262B35]">{ah.label}</td>
                              <td className="px-2 py-1.5">
                                {editingAllotted ? (
                                  <input
                                    type="number"
                                    min="0"
                                    value={
                                      overrideAdditional[idx]?.amount === 0
                                        ? ''
                                        : overrideAdditional[idx]?.amount ?? ''
                                    }
                                    onChange={(e) =>
                                      setOverrideAdditional((prev) =>
                                        prev.map((h, i) =>
                                          i === idx
                                            ? {
                                                ...h,
                                                amount: Math.max(0, parseInt(e.target.value) || 0),
                                              }
                                            : h
                                        )
                                      )
                                    }
                                    className={niAmber}
                                    placeholder="0"
                                  />
                                ) : (
                                  <span
                                    className={`block text-right pr-2 tabular-nums ${
                                      loadedOverride ? 'text-amber-700 font-medium' : 'text-[#8A93A3]'
                                    }`}
                                  >
                                    {ah.amount.toLocaleString()}
                                  </span>
                                )}
                              </td>
                              {isUpdate && (
                                <td className="px-3 py-1.5 text-right text-[#8A93A3] tabular-nums">
                                  {(cumulativeAdditional.get(ah.label) ?? 0).toLocaleString()}
                                </td>
                              )}
                              <td className="px-2 py-1.5" style={{ background: `${MINT}0A` }}>
                                {nowIdx !== -1 ? (
                                  <input
                                    type="number"
                                    min="0"
                                    value={nowEntry!.amount === 0 ? '' : nowEntry!.amount}
                                    onChange={(e) => handleAdditionalChange(nowIdx, e.target.value)}
                                    className={ni}
                                    placeholder="0"
                                  />
                                ) : (
                                  <span className="block text-right pr-2 text-[#C4C8D0]">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: `${MINT}0F`, boxShadow: `inset 0 1px 0 ${MINT}33` }}>
                          <td className="px-3 py-2 text-[12px] font-semibold" style={{ color: inkOf(MINT) }}>Total Additional</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: inkOf(MINT) }}>
                            {additionalAllotted.toLocaleString()}
                          </td>
                          {isUpdate && (
                            <td className="px-3 py-2 text-right font-medium text-[#5B6371] tabular-nums">
                              {additionalPreviousTotal.toLocaleString()}
                            </td>
                          )}
                          <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums" style={{ color: inkOf(MINT), background: `${MINT}1F` }}>
                            {additionalNowTotal.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Save override panel (editing allotted) ─────────────── */}
              {editingAllotted && (
                <div
                  className="rounded-2xl border px-4 py-3 flex items-center justify-between gap-3"
                  style={{ background: `${AMBER}0F`, borderColor: `${AMBER}4D` }}
                >
                  <div className="text-[12px] font-medium leading-relaxed" style={{ color: inkOf(AMBER) }}>
                    <strong className="font-semibold">Editing custom allotted fee.</strong> These values override the fee
                    structure for this student only. Save before collecting payment.
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={cancelEditAllotted}
                      className="rounded-full border border-[#D5E6E6] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#5B6371] hover:bg-[#F4FAFA] cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleSaveOverride()}
                      disabled={savingOverride}
                      className="rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white hover:brightness-95 cursor-pointer transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: AMBER, boxShadow: `0 3px 10px ${AMBER}40` }}
                    >
                      {savingOverride ? 'Saving…' : 'Save Custom Allotted'}
                    </button>
                  </div>
                </div>
              )}
              {overrideSaveError && (
                <ErrorStrip>{overrideSaveError}</ErrorStrip>
              )}

              {/* ── Grand Total Summary Cards ──────────────────────────── */}
              <div className="flex flex-wrap gap-2">
                <SumTile label="Allotted" value={grandAllotted} color="#5B6371" />
                {isUpdate && (
                  <SumTile label="Paid So Far" value={totalPrevious} color={SKY} />
                )}
                <SumTile label={isUpdate ? 'Now Paying' : 'Paying'} value={grandNow} color={TEAL} emphasis />
                {isUpdate && (
                  <SumTile label="Total After" value={grandTotal} color={MINT} />
                )}
                <SumTile label="Balance" value={balance} color={balance > 0 ? CORAL : MINT} />
              </div>

              {/* ── Payment Details ────────────────────────────────────── */}
              <div className="rounded-2xl border border-[#CDE6E6] bg-white overflow-hidden shadow-[0_4px_14px_rgba(15,139,141,0.06)]">
                {/* Section header */}
                <div
                  className="px-4 py-2.5 border-b border-[#E3F0F0] flex items-center gap-2"
                  style={{ background: 'linear-gradient(90deg, #E3F2F2 0%, #EDF7F7 55%, #F6FBFB 100%)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: TEAL }} />
                  <span className="text-[10px] font-medium text-[#0B6567] uppercase tracking-[0.8px]">
                    Payment Details
                  </span>
                </div>

                <div className="divide-y divide-[#EEF4F6]">

                  {/* Date */}
                  <div className="flex items-center gap-3 px-4 py-2.5" style={accVars(TEAL)}>
                    <span className="w-36 shrink-0 text-[11.5px] font-medium text-[#5B6371]">
                      Date <span style={{ color: CORAL }}>*</span>
                    </span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={TXT_IN}
                    />
                    <div className="w-[144px] shrink-0" />
                  </div>

                  {/* SMP Receipt + mode + optional split */}
                  {smpNowTotal > 0 && (
                    <div style={accVars(SKY)}>
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-36 shrink-0 flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: inkOf(SKY) }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SKY }} />
                          SMP Receipt No
                        </span>
                        <input
                          type="text"
                          value={receiptNo}
                          onChange={(e) => setReceiptNo(e.target.value)}
                          placeholder="Auto-incremented"
                          className={TXT_IN}
                        />
                        <ModeToggle value={smpPaymentMode} color={SKY} onSelect={(mode) => setSmpPaymentMode(mode)} />
                      </div>
                      {smpPaymentMode === 'SPLIT' && (
                        <div className="flex items-center gap-3 px-4 pb-2.5 pt-0.5">
                          <div className="w-36 shrink-0" />
                          <div className={SPLIT_BOX}>
                            <span className="shrink-0">Cash ₹</span>
                            <input
                              type="number"
                              min="0"
                              value={smpSplit.cash === 0 ? '' : smpSplit.cash}
                              onChange={(e) => setSmpSplit((p) => ({ ...p, cash: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className={SPLIT_IN}
                              placeholder="0"
                            />
                            <span className="shrink-0 text-[#8A93A3]">+ UPI ₹</span>
                            <input
                              type="number"
                              min="0"
                              value={smpSplit.upi === 0 ? '' : smpSplit.upi}
                              onChange={(e) => setSmpSplit((p) => ({ ...p, upi: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className={SPLIT_IN}
                              placeholder="0"
                            />
                            {(smpSplit.cash > 0 || smpSplit.upi > 0) && (
                              <SplitCheck ok={smpSplit.cash + smpSplit.upi === smpNowTotal}>
                                {smpSplit.cash + smpSplit.upi === smpNowTotal ? `= ₹${smpNowTotal.toLocaleString()} ✓` : `≠ ₹${smpNowTotal.toLocaleString()}`}
                              </SplitCheck>
                            )}
                          </div>
                          <div className="w-[144px] shrink-0" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* SVK Receipt + mode + optional split */}
                  {svkNowTotal > 0 && (
                    <div style={accVars(VIOLET)}>
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-36 shrink-0 flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: inkOf(VIOLET) }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: VIOLET }} />
                          SVK Receipt No
                        </span>
                        <input
                          type="text"
                          value={svkReceiptNo}
                          onChange={(e) => setSvkReceiptNo(e.target.value)}
                          placeholder="Auto-incremented"
                          className={TXT_IN}
                        />
                        <ModeToggle value={svkPaymentMode} color={VIOLET} onSelect={(mode) => setSvkPaymentMode(mode)} />
                      </div>
                      {svkPaymentMode === 'SPLIT' && (
                        <div className="flex items-center gap-3 px-4 pb-2.5 pt-0.5">
                          <div className="w-36 shrink-0" />
                          <div className={SPLIT_BOX}>
                            <span className="shrink-0">Cash ₹</span>
                            <input
                              type="number"
                              min="0"
                              value={svkSplit.cash === 0 ? '' : svkSplit.cash}
                              onChange={(e) => setSvkSplit((p) => ({ ...p, cash: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className={SPLIT_IN}
                              placeholder="0"
                            />
                            <span className="shrink-0 text-[#8A93A3]">+ UPI ₹</span>
                            <input
                              type="number"
                              min="0"
                              value={svkSplit.upi === 0 ? '' : svkSplit.upi}
                              onChange={(e) => setSvkSplit((p) => ({ ...p, upi: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className={SPLIT_IN}
                              placeholder="0"
                            />
                            {(svkSplit.cash > 0 || svkSplit.upi > 0) && (
                              <SplitCheck ok={svkSplit.cash + svkSplit.upi === svkNowTotal}>
                                {svkSplit.cash + svkSplit.upi === svkNowTotal ? `= ₹${svkNowTotal.toLocaleString()} ✓` : `≠ ₹${svkNowTotal.toLocaleString()}`}
                              </SplitCheck>
                            )}
                          </div>
                          <div className="w-[144px] shrink-0" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Additional Receipt + mode + optional split */}
                  {additionalNowTotal > 0 && (
                    <div style={accVars(MINT)}>
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-36 shrink-0 flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: inkOf(MINT) }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: MINT }} />
                          Additional Receipt
                        </span>
                        <input
                          type="text"
                          value={additionalReceiptNo}
                          onChange={(e) => setAdditionalReceiptNo(e.target.value)}
                          placeholder="Auto-incremented"
                          className={TXT_IN}
                        />
                        <ModeToggle value={additionalPaymentMode} color={MINT} onSelect={(mode) => setAdditionalPaymentMode(mode)} />
                      </div>
                      {additionalPaymentMode === 'SPLIT' && (
                        <div className="flex items-center gap-3 px-4 pb-2.5 pt-0.5">
                          <div className="w-36 shrink-0" />
                          <div className={SPLIT_BOX}>
                            <span className="shrink-0">Cash ₹</span>
                            <input
                              type="number"
                              min="0"
                              value={additionalSplit.cash === 0 ? '' : additionalSplit.cash}
                              onChange={(e) => setAdditionalSplit((p) => ({ ...p, cash: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className={SPLIT_IN}
                              placeholder="0"
                            />
                            <span className="shrink-0 text-[#8A93A3]">+ UPI ₹</span>
                            <input
                              type="number"
                              min="0"
                              value={additionalSplit.upi === 0 ? '' : additionalSplit.upi}
                              onChange={(e) => setAdditionalSplit((p) => ({ ...p, upi: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className={SPLIT_IN}
                              placeholder="0"
                            />
                            {(additionalSplit.cash > 0 || additionalSplit.upi > 0) && (
                              <SplitCheck ok={additionalSplit.cash + additionalSplit.upi === additionalNowTotal}>
                                {additionalSplit.cash + additionalSplit.upi === additionalNowTotal ? `= ₹${additionalNowTotal.toLocaleString()} ✓` : `≠ ₹${additionalNowTotal.toLocaleString()}`}
                              </SplitCheck>
                            )}
                          </div>
                          <div className="w-[144px] shrink-0" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Split note preview (auto-generated, saved to remarks) */}
                  {splitNote && (
                    <div className="flex items-start gap-3 px-4 py-2" style={{ background: `${TEAL}0A` }}>
                      <div className="w-36 shrink-0" />
                      <div className="flex-1 text-[10.5px] text-[#0B6567] font-medium leading-relaxed">
                        <span className="font-semibold mr-1" style={{ color: TEAL }}>Split:</span>{splitNote}
                        <span className="text-[#8A93A3] ml-1 font-normal">(auto-added to remarks)</span>
                      </div>
                      <div className="w-[144px] shrink-0" />
                    </div>
                  )}

                  {/* Remarks */}
                  <div className="flex items-center gap-3 px-4 py-2.5" style={accVars(TEAL)}>
                    <span className="w-36 shrink-0 text-[11.5px] font-medium text-[#5B6371]">
                      Remarks
                    </span>
                    <input
                      type="text"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder={splitNote ? 'Optional additional notes' : 'Optional notes'}
                      className={TXT_IN}
                    />
                    <div className="w-[144px] shrink-0" />
                  </div>

                </div>
              </div>

              {saveError && (
                <ErrorStrip>{saveError}</ErrorStrip>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#CDE6E6] bg-white flex justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-full border border-[#0F8B8D]/45 bg-white px-4 py-1.5 text-[12px] font-medium text-[#0B6567] hover:bg-[#0F8B8D]/[0.06] hover:border-[#0F8B8D]/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F8B8D]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={(loadingData || !!loadError || !date || grandNow === 0 || !isSplitValid) || saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium text-white enabled:hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F8B8D]/40 focus-visible:ring-offset-2 enabled:cursor-pointer transition-[filter,opacity] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_INK})`, boxShadow: `0 3px 10px ${TEAL}40` }}
          >
            {saving && (
              <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isUpdate ? 'Save Installment' : 'Save Fee Record'}
          </button>
        </div>
      </div>
    </div>
  );
}
