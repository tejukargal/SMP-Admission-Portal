import type { Course, FeeRecord, SMPFeeHead } from '../../types';
import { SMP_FEE_HEADS } from '../../types';
import { sumSMPRecord } from '../../utils/feeCalc';
import { generateSMPReceipt, generateSVKReceipt, generateAdditionalReceipt } from '../../utils/feeReceipts';

const YEAR_LABELS: Record<string, string> = {
  '1ST YEAR': 'Y1',
  '2ND YEAR': 'Y2',
  '3RD YEAR': 'Y3',
};

const COURSE_GRADIENTS: Record<Course, string> = {
  CE: 'from-blue-600 to-blue-800',
  ME: 'from-orange-500 to-orange-700',
  EC: 'from-green-600 to-green-800',
  CS: 'from-purple-600 to-purple-800',
  EE: 'from-rose-500 to-rose-700',
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
  const gradient = COURSE_GRADIENTS[record.course];

  const modeBadge = (mode: string | undefined) => (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
      mode === 'UPI'
        ? 'bg-violet-50 text-violet-700 border-violet-200'
        : mode === 'SPLIT'
        ? 'bg-teal-50 text-teal-700 border-teal-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'
    }`}>
      {mode ?? record.paymentMode}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[440px] flex flex-col overflow-hidden"
        style={{ animation: 'modal-enter 0.25s ease-out', height: '520px' }}
      >
        {/* ── Gradient Header ───────────────────────────────────────────── */}
        <div className={`px-5 py-2.5 bg-gradient-to-r ${gradient} flex items-center justify-between shrink-0`}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 text-[10px] font-bold text-white shrink-0">
                ₹
              </span>
              Fee Receipt
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 shrink-0">
              {record.course} · {YEAR_LABELS[record.year] ?? record.year}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 shrink-0">
              {record.academicYear}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 ml-3"
          >
            ×
          </button>
        </div>

        {/* ── Student Info Bar ──────────────────────────────────────────── */}
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {[
              { label: 'Student', value: record.studentName, bold: true },
              { label: 'Father',  value: record.fatherName },
              { label: 'Reg No',  value: record.regNumber || '—' },
              { label: 'Adm Type', value: record.admType },
              { label: 'Cat',     value: record.admCat },
            ].map(({ label, value, bold }) => (
              <div key={label} className="flex flex-col min-w-0">
                <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{label}</span>
                <span className={`text-xs truncate ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Scrollable Body ───────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>

          {/* Receipt Details */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Receipt Details</span>
            </div>
            <div className="divide-y divide-gray-100 px-3">
              {[
                { label: 'Date',     value: formatDate(record.date),            mono: false },
                { label: 'SMP Rpt', value: record.receiptNumber || '—',         mono: true  },
                { label: 'SVK Rpt', value: record.svkReceiptNumber || '—',      mono: true  },
                ...(record.additionalReceiptNumber
                  ? [{ label: 'Addl Rpt', value: record.additionalReceiptNumber, mono: true }]
                  : []),
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between items-center py-1.5 text-[11px]">
                  <span className="text-gray-400">{label}</span>
                  <span className={`font-semibold text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-1.5 text-[11px]">
                <span className="text-gray-400">Payment Mode</span>
                <div className="flex items-center gap-1.5">
                  {record.smpPaymentMode && smpTotal > 0 && record.smpPaymentMode !== (record.svkPaymentMode ?? record.paymentMode) ? (
                    <>
                      <span className="text-[9px] text-gray-400">SMP</span>{modeBadge(record.smpPaymentMode)}
                      {hasSVK && <><span className="text-[9px] text-gray-400 ml-1">SVK</span>{modeBadge(record.svkPaymentMode)}</>}
                    </>
                  ) : (
                    modeBadge(record.paymentMode)
                  )}
                </div>
              </div>
              {record.remarks && (
                <div className="flex justify-between items-center py-1.5 text-[11px] gap-3">
                  <span className="text-gray-400 shrink-0">Remarks</span>
                  <span className="font-medium text-gray-600 text-right">{record.remarks}</span>
                </div>
              )}
            </div>
          </div>

          {/* SMP Fee Group */}
          {smpTotal > 0 && (
            <div className="rounded-xl border border-blue-100 overflow-hidden">
              <div className="bg-blue-50 px-3 py-1.5 border-b border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-blue-600 text-white flex items-center justify-center text-[8px] font-black">G</span>
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">SMP Fee — Government</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {record.smpPaymentMode && modeBadge(record.smpPaymentMode)}
                  <button
                    onClick={() => generateSMPReceipt(record)}
                    className="flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a1 1 0 001-1v-4a1 1 0 00-1-1H9a1 1 0 00-1 1v4a1 1 0 001 1zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print
                  </button>
                </div>
              </div>
              <div className="divide-y divide-gray-100 px-3">
                {smpHeadsWithValues.map(({ key, label }) => (
                  <div key={key} className="flex justify-between items-center py-1.5 text-[11px]">
                    <span className="text-gray-500">{label}</span>
                    <span className="tabular-nums font-medium text-gray-800">₹{record.smp[key].toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="bg-blue-50/70 px-3 py-1.5 flex justify-between items-center border-t border-blue-100">
                <span className="text-[11px] font-bold text-blue-700">SMP Total</span>
                <span className="text-xs font-bold text-blue-800 tabular-nums">₹{smpTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* SVK Fee Group */}
          {hasSVK && (
            <div className="rounded-xl border border-violet-100 overflow-hidden">
              {/* SVK sub-section */}
              {svkBase > 0 && (
                <>
                  <div className="bg-violet-50 px-3 py-1.5 border-b border-violet-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-violet-600 text-white flex items-center justify-center text-[8px] font-black">M</span>
                      <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">SVK Fee — Management</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {record.svkPaymentMode && modeBadge(record.svkPaymentMode)}
                      <button
                        onClick={() => generateSVKReceipt(record)}
                        className="flex items-center gap-1 rounded border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-violet-600 hover:bg-violet-50 hover:border-violet-300 transition-colors cursor-pointer"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a1 1 0 001-1v-4a1 1 0 00-1-1H9a1 1 0 00-1 1v4a1 1 0 001 1zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                      </button>
                    </div>
                  </div>
                  <div className="px-3 border-b border-violet-50">
                    <div className="flex justify-between items-center py-1.5 text-[11px]">
                      <span className="text-gray-500">SVK</span>
                      <span className="tabular-nums font-medium text-gray-800">₹{svkBase.toLocaleString()}</span>
                    </div>
                  </div>
                </>
              )}
              {/* Additional sub-section */}
              {addlTotal > 0 && (
                <>
                  <div className={`bg-emerald-50 px-3 py-1.5 flex items-center justify-between ${svkBase > 0 ? 'border-t border-emerald-100' : ''} border-b border-emerald-100`}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black">+</span>
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Additional Fee</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {record.additionalPaymentMode && modeBadge(record.additionalPaymentMode)}
                      <button
                        onClick={() => generateAdditionalReceipt(record)}
                        className="flex items-center gap-1 rounded border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 transition-colors cursor-pointer"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a1 1 0 001-1v-4a1 1 0 00-1-1H9a1 1 0 00-1 1v4a1 1 0 001 1zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100 px-3">
                    {record.additionalPaid.map((h, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5 text-[11px]">
                        <span className="text-gray-500">{h.label}</span>
                        <span className="tabular-nums font-medium text-gray-800">₹{h.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="bg-violet-50/70 px-3 py-1.5 flex justify-between items-center border-t border-violet-100">
                <span className="text-[11px] font-bold text-violet-700">SVK + Additional Total</span>
                <span className="text-xs font-bold text-violet-800 tabular-nums">₹{svkTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Grand Total */}
          <div className={`rounded-xl bg-gradient-to-r ${gradient} px-4 py-3 flex justify-between items-center`}>
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">Grand Total</span>
            <span className="text-lg font-black text-white tabular-nums">₹{grandTotal.toLocaleString()}</span>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-2 bg-gray-50/60 shrink-0">
          {/* Left: admin actions */}
          <div className="flex items-center gap-1.5">
            {isAdmin && onDelete && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors cursor-pointer"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}
            {isAdmin && onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
            )}
            {onFeeDetails && (
              <button
                onClick={onFeeDetails}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 transition-colors cursor-pointer"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Fee Details
              </button>
            )}
          </div>
          {/* Right: close */}
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
