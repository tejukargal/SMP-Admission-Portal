import type { FeeRecord, SMPFeeHead } from '../../types';
import { SMP_FEE_HEADS } from '../../types';
import { sumSMPRecord } from '../../utils/feeCalc';
import { generateSMPReceipt, generateSVKReceipt, generateAdditionalReceipt } from '../../utils/feeReceipts';

const YEAR_LABELS: Record<string, string> = {
  '1ST YEAR': 'Y1',
  '2ND YEAR': 'Y2',
  '3RD YEAR': 'Y3',
};

// ── Design tokens — teal student-portal look (matches Collect Fee / Fee Details) ──
const TEAL = '#0F8B8D';
const TEAL_INK = '#0B6567';
const SKY = '#0284C7';     // SMP
const VIOLET = '#7C3AED';  // SVK
const MINT = '#0FA968';    // Additional
const CORAL = '#E11D48';
const AMBER = '#D97706';
const FALLBACK_COLOR = '#8A93A3';
const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };
const ADM_TYPE_COLOR: Record<string, string> = {
  REGULAR: '#1D6FD8', REPEATER: '#D97706', LATERAL: '#7C3AED', EXTERNAL: TEAL, SNQ: '#10B981',
};
const ADM_CAT_COLOR: Record<string, string> = { GM: '#5B9A2F', SNQ: '#10B981', OTHERS: '#F59E0B' };
const MODE_COLOR: Record<string, string> = { CASH: AMBER, UPI: VIOLET, SPLIT: TEAL };

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

const PRINT_ICON = (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a1 1 0 001-1v-4a1 1 0 00-1-1H9a1 1 0 00-1 1v4a1 1 0 001 1zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
  </svg>
);

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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

/** Compact highlighted student detail: tiny label over an accent-ink value. */
function InfoTile({ label, value, color, mono }: { label: string; value?: string; color?: string; mono?: boolean }) {
  const c = color ?? FALLBACK_COLOR;
  return (
    <div
      className="flex flex-col justify-center rounded-xl border px-2 py-1.5 min-w-0"
      style={{ background: `linear-gradient(135deg, ${c}17, ${c}08)`, borderColor: `${c}4D` }}
    >
      <span className="flex items-center gap-1 text-[8px] font-medium uppercase tracking-[0.8px] text-[#8A93A3] leading-none whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
        {label}
      </span>
      <span
        className={`mt-1 text-[12px] font-semibold leading-none truncate ${mono ? 'tabular-nums' : ''}`}
        style={{ color: inkOf(c) }}
      >
        {value || '—'}
      </span>
    </div>
  );
}

/** Fee-group card: accent header (letter badge, title, mode, Print), rows, and a tinted total. */
function GroupHeader({ color, badge, title, mode, onPrint, first }: {
  color: string;
  badge: string;
  title: string;
  mode?: React.ReactNode;
  onPrint: () => void;
  first?: boolean;
}) {
  return (
    <div
      className="px-3 py-2 flex items-center justify-between gap-2"
      style={{ background: `${color}12`, boxShadow: `inset 0 -1px 0 ${color}26${first ? '' : `, inset 0 1px 0 ${color}26`}` }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-5 h-5 rounded-[7px] text-white flex items-center justify-center text-[9.5px] font-semibold shrink-0"
          style={{ background: color, boxShadow: `0 2px 6px ${color}40` }}
        >
          {badge}
        </span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.6px] truncate" style={{ color: inkOf(color) }}>
          {title}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {mode}
        <button
          onClick={onPrint}
          className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-[5px] text-[11px] font-medium leading-none transition-colors cursor-pointer hover:bg-[var(--tint)]"
          style={{ borderColor: `${color}66`, color: inkOf(color), '--tint': `${color}14` } as React.CSSProperties}
        >
          {PRINT_ICON}
          Print
        </button>
      </div>
    </div>
  );
}

function AmountRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-[11.5px]">
      <span className="font-medium text-[#5B6371]">{label}</span>
      <span className="tabular-nums font-medium text-[#262B35]">₹{amount.toLocaleString()}</span>
    </div>
  );
}

function FooterButton({ color, onClick, icon, children }: {
  color: string;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[11.5px] font-medium transition-colors cursor-pointer hover:bg-[var(--tint)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      style={{ borderColor: `${color}66`, color: inkOf(color), '--tint': `${color}0F`, '--ring': `${color}40` } as React.CSSProperties}
    >
      {icon}
      {children}
    </button>
  );
}

export interface FeeReceiptDetailModalProps {
  record: FeeRecord;
  isAdmin: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onFeeDetails?: () => void;
}

export function FeeReceiptDetailModal({ record, isAdmin, onClose, onEdit, onDelete, onFeeDetails }: FeeReceiptDetailModalProps) {
  const smpTotal = sumSMPRecord(record.smp);
  const svkBase = record.svk;
  const addlTotal = record.additionalPaid.reduce((s, h) => s + h.amount, 0);
  const svkTotal = svkBase + addlTotal;
  const grandTotal = smpTotal + svkTotal;

  const smpHeadsWithValues = (SMP_FEE_HEADS as { key: SMPFeeHead; label: string }[]).filter(({ key }) => record.smp[key] > 0);
  const hasSVK = svkBase > 0 || addlTotal > 0;

  const modeBadge = (mode: string | undefined) => {
    const label = mode ?? record.paymentMode;
    const c = MODE_COLOR[label] ?? AMBER;
    return (
      <span
        className="inline-flex items-center rounded-full border px-2 py-[3px] text-[10px] font-medium leading-none"
        style={{ background: `${c}0F`, borderColor: `${c}66`, color: inkOf(c) }}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-[#0B2A2B]/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div
        className="relative bg-white rounded-[22px] border border-[#CDE6E6] w-full max-w-[440px] flex flex-col overflow-hidden"
        style={{ animation: 'modal-enter 0.25s ease-out', height: '520px', boxShadow: '0 24px 60px rgba(11,42,43,0.22), 0 4px 14px rgba(18,20,26,0.06)' }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden px-4 py-3 flex items-center justify-between shrink-0 border-b border-[#0F8B8D]/20"
          style={{ background: `linear-gradient(135deg, ${TEAL}24 0%, ${TEAL}0D 55%, #FFFFFF 100%)` }}
        >
          <span
            className="pointer-events-none absolute -top-16 -right-8 w-36 h-36 rounded-full border-[18px]"
            style={{ borderColor: `${TEAL}14` }}
            aria-hidden="true"
          />
          <div className="relative flex items-center gap-2 min-w-0 flex-1">
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-[9px] text-white text-[13px] font-semibold shrink-0"
              style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_INK})`, boxShadow: `0 3px 10px ${TEAL}40` }}
            >
              ₹
            </span>
            <h3 className="text-[15.5px] font-bold text-[#0B6567] leading-none tracking-[-0.2px] shrink-0">Fee Receipt</h3>
            <span
              className="inline-flex items-center rounded-full border bg-white/80 px-2 py-[4px] text-[10px] font-medium leading-none shrink-0"
              style={{ borderColor: `${DEPT_DOT[record.course] ?? FALLBACK_COLOR}73`, color: inkOf(DEPT_DOT[record.course] ?? FALLBACK_COLOR) }}
            >
              {record.course} · {YEAR_LABELS[record.year] ?? record.year}
            </span>
            <span className="inline-flex items-center rounded-full border border-[#0F8B8D]/45 bg-white/80 text-[#0B6567] px-2 py-[4px] text-[10px] font-medium leading-none tabular-nums shrink-0">
              {record.academicYear}
            </span>
          </div>
          <button
            onClick={onClose}
            className="relative flex items-center justify-center w-7 h-7 rounded-full border border-[#0F8B8D]/35 bg-white text-[#0B6567] hover:bg-[#EFF8F8] hover:border-[#0F8B8D]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F8B8D]/30 transition-colors cursor-pointer shrink-0 ml-3"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* ── Student Info ──────────────────────────────────────────────── */}
        <div className="px-4 py-2.5 bg-white border-b border-[#E3F0F0] shrink-0 space-y-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <RingAvatar name={record.studentName} course={record.course} />
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold truncate leading-tight" style={{ color: TEAL }} title={record.studentName}>
                {record.studentName}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-[#8A93A3] min-w-0">
                <span className="uppercase tracking-[0.5px] text-[9px]">Father</span>
                <span className="text-[#5B6371] truncate">{record.fatherName}</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <InfoTile label="Reg No" value={record.regNumber || '—'} color={TEAL} mono />
            <InfoTile label="Adm Type" value={record.admType} color={ADM_TYPE_COLOR[record.admType]} />
            <InfoTile label="Adm Cat" value={record.admCat} color={ADM_CAT_COLOR[record.admCat]} />
          </div>
        </div>

        {/* ── Scrollable Body ───────────────────────────────────────────── */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none', background: 'linear-gradient(160deg, #F6FBFB 0%, #FCFDFD 45%, #F2F9F9 100%)' }}
        >

          {/* Receipt Details */}
          <div className="rounded-2xl border border-[#CDE6E6] bg-white overflow-hidden" style={{ animation: 'content-enter 0.26s ease-out' }}>
            <div
              className="px-3 py-1.5 flex items-center gap-1.5"
              style={{ background: 'linear-gradient(90deg, #E3F2F2 0%, #EDF7F7 55%, #F6FBFB 100%)', boxShadow: 'inset 0 -1px 0 #D8EBEB' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: TEAL }} />
              <span className="text-[10px] font-medium text-[#0B6567] uppercase tracking-[0.8px]">Receipt Details</span>
            </div>
            <div className="divide-y divide-[#EEF4F6] px-3">
              {[
                { label: 'Date',     value: formatDate(record.date),            mono: false },
                { label: 'SMP Rpt', value: record.receiptNumber || '—',         mono: true  },
                { label: 'SVK Rpt', value: record.svkReceiptNumber || '—',      mono: true  },
                ...(record.additionalReceiptNumber
                  ? [{ label: 'Addl Rpt', value: record.additionalReceiptNumber, mono: true }]
                  : []),
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between items-center py-1.5 text-[11.5px]">
                  <span className="font-medium text-[#8A93A3]">{label}</span>
                  <span className={`font-semibold text-[#262B35] ${mono ? 'tabular-nums' : ''}`}>{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-1.5 text-[11.5px]">
                <span className="font-medium text-[#8A93A3]">Payment Mode</span>
                <div className="flex items-center gap-1.5">
                  {record.smpPaymentMode && smpTotal > 0 && record.smpPaymentMode !== (record.svkPaymentMode ?? record.paymentMode) ? (
                    <>
                      <span className="text-[9.5px] font-medium" style={{ color: inkOf(SKY) }}>SMP</span>{modeBadge(record.smpPaymentMode)}
                      {hasSVK && <><span className="text-[9.5px] font-medium ml-1" style={{ color: inkOf(VIOLET) }}>SVK</span>{modeBadge(record.svkPaymentMode)}</>}
                    </>
                  ) : (
                    modeBadge(record.paymentMode)
                  )}
                </div>
              </div>
              {record.remarks && (
                <div className="flex justify-between items-center py-1.5 text-[11.5px] gap-3">
                  <span className="font-medium text-[#8A93A3] shrink-0">Remarks</span>
                  <span className="font-medium text-[#5B6371] text-right">{record.remarks}</span>
                </div>
              )}
            </div>
          </div>

          {/* SMP Fee Group */}
          {smpTotal > 0 && (
            <div
              className="rounded-2xl border bg-white overflow-hidden"
              style={{ borderColor: `${SKY}33`, animation: 'content-enter 0.26s ease-out 50ms both' }}
            >
              <GroupHeader
                color={SKY}
                badge="G"
                title="SMP Fee — Government"
                mode={record.smpPaymentMode && modeBadge(record.smpPaymentMode)}
                onPrint={() => generateSMPReceipt(record)}
                first
              />
              <div className="divide-y divide-[#EEF4F6] px-3">
                {smpHeadsWithValues.map(({ key, label }) => (
                  <AmountRow key={key} label={label} amount={record.smp[key]} />
                ))}
              </div>
              <div className="px-3 py-1.5 flex justify-between items-center" style={{ background: `${SKY}0F`, boxShadow: `inset 0 1px 0 ${SKY}26` }}>
                <span className="text-[11.5px] font-semibold" style={{ color: inkOf(SKY) }}>SMP Total</span>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: inkOf(SKY) }}>₹{smpTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* SVK Fee Group */}
          {hasSVK && (
            <div
              className="rounded-2xl border bg-white overflow-hidden"
              style={{ borderColor: `${VIOLET}33`, animation: 'content-enter 0.26s ease-out 100ms both' }}
            >
              {/* SVK sub-section */}
              {svkBase > 0 && (
                <>
                  <GroupHeader
                    color={VIOLET}
                    badge="M"
                    title="SVK Fee — Management"
                    mode={record.svkPaymentMode && modeBadge(record.svkPaymentMode)}
                    onPrint={() => generateSVKReceipt(record)}
                    first
                  />
                  <div className="px-3">
                    <AmountRow label="SVK" amount={svkBase} />
                  </div>
                </>
              )}
              {/* Additional sub-section */}
              {addlTotal > 0 && (
                <>
                  <GroupHeader
                    color={MINT}
                    badge="+"
                    title="Additional Fee"
                    mode={record.additionalPaymentMode && modeBadge(record.additionalPaymentMode)}
                    onPrint={() => generateAdditionalReceipt(record)}
                    first={!(svkBase > 0)}
                  />
                  <div className="divide-y divide-[#EEF4F6] px-3">
                    {record.additionalPaid.map((h, i) => (
                      <AmountRow key={i} label={h.label} amount={h.amount} />
                    ))}
                  </div>
                </>
              )}
              <div className="px-3 py-1.5 flex justify-between items-center" style={{ background: `${VIOLET}0F`, boxShadow: `inset 0 1px 0 ${VIOLET}26` }}>
                <span className="text-[11.5px] font-semibold" style={{ color: inkOf(VIOLET) }}>SVK + Additional Total</span>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: inkOf(VIOLET) }}>₹{svkTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Grand Total */}
          <div
            className="relative overflow-hidden rounded-2xl border px-4 py-3 flex justify-between items-center"
            style={{
              background: `linear-gradient(135deg, ${TEAL}29 0%, ${TEAL}0F 60%, #FFFFFF 100%)`,
              borderColor: `${TEAL}4D`,
              boxShadow: `0 6px 18px ${TEAL}1A`,
              animation: 'content-enter 0.26s ease-out 150ms both',
            }}
          >
            <span
              className="pointer-events-none absolute -bottom-16 -right-6 w-28 h-28 rounded-full border-[16px]"
              style={{ borderColor: `${TEAL}14` }}
              aria-hidden="true"
            />
            <span className="relative text-[10px] font-medium uppercase tracking-[1px] text-[#0B6567]">Grand Total</span>
            <span className="relative text-[22px] font-semibold tabular-nums leading-none" style={{ color: TEAL_INK }}>
              ₹{grandTotal.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="border-t border-[#CDE6E6] px-4 py-3 flex items-center justify-between gap-2 bg-white shrink-0">
          {/* Left: admin actions */}
          <div className="flex items-center gap-1.5">
            {isAdmin && onDelete && (
              <FooterButton
                color={CORAL}
                onClick={onDelete}
                icon={
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                }
              >
                Delete
              </FooterButton>
            )}
            {isAdmin && onEdit && (
              <FooterButton
                color={SKY}
                onClick={onEdit}
                icon={
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                }
              >
                Edit
              </FooterButton>
            )}
            {onFeeDetails && (
              <FooterButton
                color={TEAL}
                onClick={onFeeDetails}
                icon={
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                }
              >
                Fee Details
              </FooterButton>
            )}
          </div>
          {/* Right: close */}
          <button
            onClick={onClose}
            className="rounded-full border border-[#0F8B8D]/45 bg-white px-4 py-1.5 text-[11.5px] font-medium text-[#0B6567] hover:bg-[#0F8B8D]/[0.06] hover:border-[#0F8B8D]/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F8B8D]/30 cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
