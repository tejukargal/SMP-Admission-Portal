import { useEffect, useMemo, useState } from 'react';
import {
  updateFeeRecord,
  updateReceiptCounters,
  peekNextReceiptNumbers,
  isPlausibleReceiptJump,
} from '../../services/feeRecordService';
import type {
  FeeRecord,
  SMPFeeHead,
  SMPHeads,
  FeeAdditionalHead,
  PaymentMode,
  SplitPayment,
} from '../../types';
import { SMP_FEE_HEADS } from '../../types';

function sumSMP(smp: SMPHeads): number {
  return SMP_FEE_HEADS.reduce((s, { key }) => s + smp[key], 0);
}

function sumArr(arr: FeeAdditionalHead[]): number {
  return arr.reduce((s, h) => s + h.amount, 0);
}

interface Props {
  record: FeeRecord;
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

/** Pastel totals tile. */
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

export function FeeEditModal({ record, onClose, onSaved }: Props) {
  const [smp, setSmp] = useState<SMPHeads>({ ...record.smp });
  const [svk, setSvk] = useState(record.svk);
  const [additionalPaid, setAdditionalPaid] = useState<FeeAdditionalHead[]>(
    record.additionalPaid.map((h) => ({ ...h }))
  );
  const [date, setDate] = useState(record.date);
  const [receiptNo, setReceiptNo] = useState(record.receiptNumber);
  const [svkReceiptNo, setSvkReceiptNo] = useState(record.svkReceiptNumber ?? '');
  const [additionalReceiptNo, setAdditionalReceiptNo] = useState(record.additionalReceiptNumber ?? '');
  const [smpPaymentMode, setSmpPaymentMode] = useState<PaymentMode>(record.smpPaymentMode ?? record.paymentMode);
  const [svkPaymentMode, setSvkPaymentMode] = useState<PaymentMode>(record.svkPaymentMode ?? record.paymentMode);
  const [additionalPaymentMode, setAdditionalPaymentMode] = useState<PaymentMode>(record.additionalPaymentMode ?? record.paymentMode);
  const [smpSplit, setSmpSplit] = useState<SplitPayment>(record.smpSplit ?? { cash: 0, upi: 0 });
  const [svkSplit, setSvkSplit] = useState<SplitPayment>(record.svkSplit ?? { cash: 0, upi: 0 });
  const [additionalSplit, setAdditionalSplit] = useState<SplitPayment>(record.additionalSplit ?? { cash: 0, upi: 0 });
  const [remarks, setRemarks] = useState(record.remarks ?? '');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [suggestedSmpReceipt, setSuggestedSmpReceipt] = useState('');

  useEffect(() => {
    let cancelled = false;
    peekNextReceiptNumbers(record.academicYear, record.course).then((receipts) => {
      if (!cancelled) setSuggestedSmpReceipt(receipts.smp);
    });
    return () => {
      cancelled = true;
    };
  }, [record.academicYear, record.course]);

  function handleSMPChange(key: SMPFeeHead, val: string) {
    setSmp((prev) => ({ ...prev, [key]: Math.max(0, parseInt(val) || 0) }));
  }

  function handleAdditionalChange(idx: number, val: string) {
    setAdditionalPaid((prev) =>
      prev.map((h, i) =>
        i === idx ? { ...h, amount: Math.max(0, parseInt(val) || 0) } : h
      )
    );
  }

  const smpTotal = sumSMP(smp);
  const additionalTotal = sumArr(additionalPaid);
  const grandTotal = smpTotal + svk + additionalTotal;

  const splitNote = useMemo(() => {
    const parts: string[] = [];
    if (smpPaymentMode === 'SPLIT' && smpTotal > 0 && (smpSplit.cash > 0 || smpSplit.upi > 0)) {
      parts.push(`SMP: ₹${smpSplit.cash.toLocaleString()} Cash + ₹${smpSplit.upi.toLocaleString()} UPI`);
    }
    if (svkPaymentMode === 'SPLIT' && svk > 0 && (svkSplit.cash > 0 || svkSplit.upi > 0)) {
      parts.push(`SVK: ₹${svkSplit.cash.toLocaleString()} Cash + ₹${svkSplit.upi.toLocaleString()} UPI`);
    }
    if (additionalPaymentMode === 'SPLIT' && additionalTotal > 0 && (additionalSplit.cash > 0 || additionalSplit.upi > 0)) {
      parts.push(`Addl: ₹${additionalSplit.cash.toLocaleString()} Cash + ₹${additionalSplit.upi.toLocaleString()} UPI`);
    }
    return parts.join('; ');
  }, [smpPaymentMode, svkPaymentMode, additionalPaymentMode, smpTotal, svk, additionalTotal, smpSplit, svkSplit, additionalSplit]);

  const isSplitValid =
    (smpPaymentMode !== 'SPLIT' || smpTotal === 0 || smpSplit.cash + smpSplit.upi === smpTotal) &&
    (svkPaymentMode !== 'SPLIT' || svk === 0 || svkSplit.cash + svkSplit.upi === svk) &&
    (additionalPaymentMode !== 'SPLIT' || additionalTotal === 0 || additionalSplit.cash + additionalSplit.upi === additionalTotal);

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (smpPaymentMode === 'SPLIT' && smpTotal > 0 && smpSplit.cash + smpSplit.upi !== smpTotal) {
        setSaveError(`SMP split (₹${smpSplit.cash} Cash + ₹${smpSplit.upi} UPI) must equal ₹${smpTotal}`);
        return;
      }
      if (svkPaymentMode === 'SPLIT' && svk > 0 && svkSplit.cash + svkSplit.upi !== svk) {
        setSaveError(`SVK split (₹${svkSplit.cash} Cash + ₹${svkSplit.upi} UPI) must equal ₹${svk}`);
        return;
      }
      if (additionalPaymentMode === 'SPLIT' && additionalTotal > 0 && additionalSplit.cash + additionalSplit.upi !== additionalTotal) {
        setSaveError(`Additional split (₹${additionalSplit.cash} Cash + ₹${additionalSplit.upi} UPI) must equal ₹${additionalTotal}`);
        return;
      }

      // Strip any previous auto-split note from remarks before rebuilding
      const existingSplitPrefixes = ['SMP: ₹', 'SVK: ₹', 'Addl: ₹'];
      const userRemarks = remarks
        .split('; ')
        .filter((part) => !existingSplitPrefixes.some((pfx) => part.startsWith(pfx)))
        .join('; ');
      const combinedRemarks = [splitNote, userRemarks].filter(Boolean).join('; ');

      const primaryMode = smpTotal > 0 ? smpPaymentMode : svk > 0 ? svkPaymentMode : additionalPaymentMode;

      if (receiptNo) {
        const suggestedN = parseInt(suggestedSmpReceipt, 10);
        const usedN = parseInt(receiptNo, 10);
        if (!isNaN(suggestedN) && !isNaN(usedN) && !isPlausibleReceiptJump(suggestedN, usedN)) {
          const proceed = window.confirm(
            `SMP Receipt No "${receiptNo}" looks unusually high for this series (current next: ${suggestedSmpReceipt}). ` +
            `This may belong to the other (Aided/Unaided) series. Continue anyway?`
          );
          if (!proceed) return;
        }
      }

      await updateFeeRecord(
        record.id,
        {
          studentId: record.studentId,
          studentName: record.studentName,
          fatherName: record.fatherName,
          regNumber: record.regNumber,
          course: record.course,
          year: record.year,
          admCat: record.admCat,
          admType: record.admType,
          academicYear: record.academicYear,
          date,
          receiptNumber: receiptNo,
          svkReceiptNumber: svkReceiptNo,
          additionalReceiptNumber: additionalReceiptNo,
          paymentMode: primaryMode,
          smpPaymentMode,
          svkPaymentMode,
          additionalPaymentMode,
          ...(smpPaymentMode === 'SPLIT' ? { smpSplit } : {}),
          ...(svkPaymentMode === 'SPLIT' ? { svkSplit } : {}),
          ...(additionalPaymentMode === 'SPLIT' ? { additionalSplit } : {}),
          remarks: combinedRemarks,
          smp,
          svk,
          additionalPaid,
        },
        record.createdAt
      );

      // Keep counters in sync with any manually changed receipt numbers.
      await updateReceiptCounters(record.academicYear, record.course, {
        smp:        receiptNo,
        svk:        svkReceiptNo,
        additional: additionalReceiptNo,
      });

      onSaved();
      onClose();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update fee record');
    } finally {
      setSaving(false);
    }
  }

  const splitRow = (
    split: SplitPayment,
    setSplit: React.Dispatch<React.SetStateAction<SplitPayment>>,
    total: number,
  ) => (
    <div className="flex items-center gap-3 px-4 pb-2.5 pt-0.5">
      <div className="w-36 shrink-0" />
      <div className={SPLIT_BOX}>
        <span className="shrink-0">Cash ₹</span>
        <input
          type="number"
          min="0"
          value={split.cash === 0 ? '' : split.cash}
          onChange={(e) => setSplit((p) => ({ ...p, cash: Math.max(0, parseInt(e.target.value) || 0) }))}
          className={SPLIT_IN}
          placeholder="0"
        />
        <span className="shrink-0 text-[#8A93A3]">+ UPI ₹</span>
        <input
          type="number"
          min="0"
          value={split.upi === 0 ? '' : split.upi}
          onChange={(e) => setSplit((p) => ({ ...p, upi: Math.max(0, parseInt(e.target.value) || 0) }))}
          className={SPLIT_IN}
          placeholder="0"
        />
        {(split.cash > 0 || split.upi > 0) && (
          <SplitCheck ok={split.cash + split.upi === total}>
            {split.cash + split.upi === total ? `= ₹${total.toLocaleString()} ✓` : `≠ ₹${total.toLocaleString()}`}
          </SplitCheck>
        )}
      </div>
      <div className="w-[144px] shrink-0" />
    </div>
  );

  return (
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-[#0B2A2B]/45"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div
        className="relative bg-white rounded-[22px] border border-[#CDE6E6] w-full max-w-3xl flex flex-col overflow-hidden max-h-[calc(100vh-3rem)]"
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
              className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] text-white shrink-0"
              style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_INK})`, boxShadow: `0 3px 10px ${TEAL}40` }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </span>
            <div className="flex flex-col">
              <span className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">Fee Register</span>
              <h3 className="mt-1 text-[17px] font-bold text-[#0B6567] leading-none tracking-[-0.2px]">Edit Fee Record</h3>
            </div>
            <span className="rounded-full border border-[#0F8B8D]/45 bg-white/80 text-[#0B6567] px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums">
              {record.academicYear}
            </span>
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
              <RingAvatar name={record.studentName} course={record.course} />
              <div className="min-w-0">
                <p className="text-[16px] font-semibold truncate leading-tight tracking-[-0.1px]" style={{ color: TEAL }} title={record.studentName}>
                  {record.studentName}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-[#8A93A3] min-w-0">
                  <span className="uppercase tracking-[0.5px] text-[9px]">Father</span>
                  <span className="text-[#5B6371] truncate">{record.fatherName}</span>
                </p>
              </div>
            </div>
            <div className="flex items-stretch gap-1.5 flex-wrap">
              <InfoTile label="Reg No" value={record.regNumber || '—'} color={TEAL} mono />
              <InfoTile label="Course" value={record.course} color={DEPT_DOT[record.course]} />
              <InfoTile label="Year" value={record.year} color={YEAR_COLOR[record.year]} />
              <InfoTile label="Adm Type" value={record.admType} color={ADM_TYPE_COLOR[record.admType]} />
              <InfoTile label="Adm Cat" value={record.admCat} color={ADM_CAT_COLOR[record.admCat]} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="scroll-teal px-5 py-4 flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-5" style={{ animation: 'content-enter 0.3s ease-out' }}>

            {/* ── SMP Fee table ──────────────────────────────────────── */}
            <div>
              <SectionTitle color={SKY}>SMP Fee — Government</SectionTitle>
              <div className={FEE_CARD} style={feeCardStyle(SKY)}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: `${SKY}12`, boxShadow: `inset 0 -1px 0 ${SKY}33` }}>
                      <th className={`${FTH} text-left`}>Head</th>
                      <th className={`${FTH} text-right w-32`} style={{ background: `${SKY}1F` }}>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF4F6]">
                    {SMP_FEE_HEADS.map(({ key, label }) => (
                      <tr key={key} className="hover:bg-[var(--acc-row)] transition-colors">
                        <td className="px-3 py-1.5 text-[12px] font-medium text-[#262B35]">{label}</td>
                        <td className="px-2 py-1.5" style={{ background: `${SKY}0A` }}>
                          <input
                            type="number"
                            min="0"
                            value={smp[key] === 0 ? '' : smp[key]}
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
                      <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums" style={{ color: inkOf(SKY), background: `${SKY}1F` }}>
                        {smpTotal.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── SVK Fee table ──────────────────────────────────────── */}
            <div>
              <SectionTitle color={VIOLET}>SVK Fee — Management</SectionTitle>
              <div className={FEE_CARD} style={feeCardStyle(VIOLET)}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: `${VIOLET}12`, boxShadow: `inset 0 -1px 0 ${VIOLET}33` }}>
                      <th className={`${FTH} text-left`}>Head</th>
                      <th className={`${FTH} text-right w-32`} style={{ background: `${VIOLET}1F` }}>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF4F6]">
                    <tr className="hover:bg-[var(--acc-row)] transition-colors">
                      <td className="px-3 py-1.5 text-[12px] font-medium text-[#262B35]">SVK</td>
                      <td className="px-2 py-1.5" style={{ background: `${VIOLET}0A` }}>
                        <input
                          type="number"
                          min="0"
                          value={svk === 0 ? '' : svk}
                          onChange={(e) => setSvk(Math.max(0, parseInt(e.target.value) || 0))}
                          className={ni}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr style={{ background: `${VIOLET}0F`, boxShadow: `inset 0 1px 0 ${VIOLET}33` }}>
                      <td className="px-3 py-2 text-[12px] font-semibold" style={{ color: inkOf(VIOLET) }}>Total SVK</td>
                      <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums" style={{ color: inkOf(VIOLET), background: `${VIOLET}1F` }}>
                        {svk.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── Additional Fee table ───────────────────────────────── */}
            {additionalPaid.length > 0 && (
              <div>
                <SectionTitle color={MINT}>Additional Fee</SectionTitle>
                <div className={FEE_CARD} style={feeCardStyle(MINT)}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: `${MINT}12`, boxShadow: `inset 0 -1px 0 ${MINT}33` }}>
                        <th className={`${FTH} text-left`}>Head</th>
                        <th className={`${FTH} text-right w-32`} style={{ background: `${MINT}1F` }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF4F6]">
                      {additionalPaid.map((h, idx) => (
                        <tr key={h.label} className="hover:bg-[var(--acc-row)] transition-colors">
                          <td className="px-3 py-1.5 text-[12px] font-medium text-[#262B35]">{h.label}</td>
                          <td className="px-2 py-1.5" style={{ background: `${MINT}0A` }}>
                            <input
                              type="number"
                              min="0"
                              value={h.amount === 0 ? '' : h.amount}
                              onChange={(e) => handleAdditionalChange(idx, e.target.value)}
                              className={ni}
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: `${MINT}0F`, boxShadow: `inset 0 1px 0 ${MINT}33` }}>
                        <td className="px-3 py-2 text-[12px] font-semibold" style={{ color: inkOf(MINT) }}>Total Additional</td>
                        <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums" style={{ color: inkOf(MINT), background: `${MINT}1F` }}>
                          {additionalTotal.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── Totals ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
              <SumTile label="SMP" value={smpTotal} color={SKY} />
              <SumTile label="SVK" value={svk} color={VIOLET} />
              {additionalTotal > 0 && <SumTile label="Additional" value={additionalTotal} color={MINT} />}
              <SumTile label="Grand Total" value={grandTotal} color={TEAL} emphasis />
            </div>

            {/* ── Payment Details ────────────────────────────────────── */}
            <div className="rounded-2xl border border-[#CDE6E6] bg-white overflow-hidden shadow-[0_4px_14px_rgba(15,139,141,0.06)]">
              <div
                className="px-4 py-2.5 border-b border-[#E3F0F0] flex items-center gap-2"
                style={{ background: 'linear-gradient(90deg, #E3F2F2 0%, #EDF7F7 55%, #F6FBFB 100%)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: TEAL }} />
                <span className="text-[10px] font-medium text-[#0B6567] uppercase tracking-[0.8px]">Payment Details</span>
              </div>

              <div className="divide-y divide-[#EEF4F6]">

                {/* Date */}
                <div className="flex items-center gap-3 px-4 py-2.5" style={accVars(TEAL)}>
                  <span className="w-36 shrink-0 text-[11.5px] font-medium text-[#5B6371]">
                    Date <span style={{ color: CORAL }}>*</span>
                  </span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={TXT_IN} />
                  <div className="w-[144px] shrink-0" />
                </div>

                {/* SMP Receipt + mode */}
                <div style={accVars(SKY)}>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-36 shrink-0 flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: inkOf(SKY) }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SKY }} />
                      SMP Receipt No
                    </span>
                    <input type="text" value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} className={TXT_IN} />
                    <ModeToggle value={smpPaymentMode} color={SKY} onSelect={setSmpPaymentMode} />
                  </div>
                  {smpPaymentMode === 'SPLIT' && splitRow(smpSplit, setSmpSplit, smpTotal)}
                </div>

                {/* SVK Receipt + mode */}
                <div style={accVars(VIOLET)}>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-36 shrink-0 flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: inkOf(VIOLET) }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: VIOLET }} />
                      SVK Receipt No
                    </span>
                    <input type="text" value={svkReceiptNo} onChange={(e) => setSvkReceiptNo(e.target.value)} className={TXT_IN} />
                    <ModeToggle value={svkPaymentMode} color={VIOLET} onSelect={setSvkPaymentMode} />
                  </div>
                  {svkPaymentMode === 'SPLIT' && splitRow(svkSplit, setSvkSplit, svk)}
                </div>

                {/* Additional Receipt + mode */}
                {additionalPaid.length > 0 && (
                  <div style={accVars(MINT)}>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-36 shrink-0 flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: inkOf(MINT) }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: MINT }} />
                        Additional Receipt
                      </span>
                      <input type="text" value={additionalReceiptNo} onChange={(e) => setAdditionalReceiptNo(e.target.value)} className={TXT_IN} />
                      <ModeToggle value={additionalPaymentMode} color={MINT} onSelect={setAdditionalPaymentMode} />
                    </div>
                    {additionalPaymentMode === 'SPLIT' && splitRow(additionalSplit, setAdditionalSplit, additionalTotal)}
                  </div>
                )}

                {/* Split note preview */}
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
                  <span className="w-36 shrink-0 text-[11.5px] font-medium text-[#5B6371]">Remarks</span>
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

            {saveError && <ErrorStrip>{saveError}</ErrorStrip>}
          </div>
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
            disabled={!date || !isSplitValid || saving}
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium text-white enabled:hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F8B8D]/40 focus-visible:ring-offset-2 enabled:cursor-pointer transition-[filter,opacity] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_INK})`, boxShadow: `0 3px 10px ${TEAL}40` }}
          >
            {saving && (
              <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
