import { useMemo, useState } from 'react';
import { updateFeeRecord, updateReceiptCounters } from '../../services/feeRecordService';
import { Button } from '../common/Button';
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

const ni =
  'w-full rounded border border-gray-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" style={{ animation: 'backdrop-enter 0.2s ease-out' }} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 flex flex-col" style={{ animation: 'modal-enter 0.25s ease-out' }}>

        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-start justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Edit Fee Record</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">{record.academicYear}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Student info */}
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-200 text-xs shrink-0">
          <div className="flex flex-wrap gap-x-5 gap-y-0.5">
            <span>
              <span className="text-gray-500">Name: </span>
              <span className="font-semibold text-gray-900">{record.studentName}</span>
            </span>
            <span>
              <span className="text-gray-500">Father: </span>
              <span className="text-gray-700">{record.fatherName}</span>
            </span>
            <span>
              <span className="text-gray-500">Reg: </span>
              <span className="text-gray-700">{record.regNumber || '—'}</span>
            </span>
            <span>
              <span className="text-gray-500">Year: </span>
              <span className="text-gray-700">{record.year}</span>
            </span>
            <span>
              <span className="text-gray-500">Course: </span>
              <span className="text-gray-700">{record.course}</span>
            </span>
            <span>
              <span className="text-gray-500">Cat: </span>
              <span className="text-gray-700">{record.admCat}</span>
            </span>
            <span>
              <span className="text-gray-500">Adm Type: </span>
              <span className="text-gray-700">{record.admType}</span>
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto space-y-5" style={{ maxHeight: '60vh' }}>

          {/* SMP Fee table */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              SMP Fee (Government)
            </div>
            <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200">
                    Head
                  </th>
                  <th className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200 w-28">
                    Amount (₹)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {SMP_FEE_HEADS.map(({ key, label }) => (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="px-3 py-1 text-gray-700">{label}</td>
                    <td className="px-2 py-1">
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
                <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-800">
                  <td className="px-3 py-1.5">Total SMP</td>
                  <td className="px-3 py-1.5 text-right text-blue-700">
                    {smpTotal.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* SVK Fee table */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              SVK Fee (Management)
            </div>
            <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200">Head</th>
                  <th className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200 w-28">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50">
                  <td className="px-3 py-1 text-gray-700">SVK</td>
                  <td className="px-2 py-1">
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
                <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-800">
                  <td className="px-3 py-1.5">Total SVK</td>
                  <td className="px-3 py-1.5 text-right text-blue-700">{svk.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Additional Fee table */}
          {additionalPaid.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Additional Fee
              </div>
              <table className="w-full text-xs border border-green-200 rounded overflow-hidden">
                <thead className="bg-green-50">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-semibold text-gray-600 border-b border-green-200">Head</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b border-green-200 w-28">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {additionalPaid.map((h, idx) => (
                    <tr key={h.label} className="hover:bg-green-50">
                      <td className="px-3 py-1 text-gray-700">{h.label}</td>
                      <td className="px-2 py-1">
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
                  <tr className="bg-green-50 border-t border-green-200 font-semibold text-gray-800">
                    <td className="px-3 py-1.5">Total Additional</td>
                    <td className="px-3 py-1.5 text-right text-green-700">{additionalTotal.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Grand total */}
          <div className="rounded bg-gray-50 border border-gray-200 px-4 py-2.5 text-xs flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <span className="text-gray-500">SMP: </span>
              <span className="font-semibold text-gray-800">₹{smpTotal.toLocaleString()}</span>
            </span>
            <span>
              <span className="text-gray-500">SVK: </span>
              <span className="font-semibold text-gray-800">₹{svk.toLocaleString()}</span>
            </span>
            {additionalTotal > 0 && (
              <span>
                <span className="text-gray-500">Additional: </span>
                <span className="font-semibold text-gray-800">₹{additionalTotal.toLocaleString()}</span>
              </span>
            )}
            <span>
              <span className="text-gray-500">Grand Total: </span>
              <span className="font-semibold text-blue-700">₹{grandTotal.toLocaleString()}</span>
            </span>
          </div>

          {/* Payment details */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-100/80 border-b border-gray-200">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Payment Details</span>
            </div>
            <div className="divide-y divide-gray-100 bg-gray-50/40">

              {/* Date */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-32 shrink-0 text-[11px] font-semibold text-gray-500">Date <span className="text-red-400">*</span></span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>

              {/* SMP Receipt + mode */}
              <div>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-32 shrink-0 text-[11px] font-semibold text-blue-600/80">SMP Receipt No</span>
                  <input
                    type="text"
                    value={receiptNo}
                    onChange={(e) => setReceiptNo(e.target.value)}
                    className="flex-1 rounded border border-blue-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                  <div className="flex items-center gap-1 shrink-0 w-[144px]">
                    {(['CASH', 'UPI', 'SPLIT'] as PaymentMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSmpPaymentMode(mode)}
                        className={`flex-1 py-1 rounded text-[9px] font-bold text-center transition-colors cursor-pointer border ${
                          smpPaymentMode === mode
                            ? mode === 'SPLIT' ? 'bg-teal-600 text-white border-teal-600' : 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                {smpPaymentMode === 'SPLIT' && (
                  <div className="flex items-center gap-3 px-4 pb-2.5 bg-teal-50/50">
                    <div className="w-32 shrink-0" />
                    <div className="flex flex-1 items-center gap-2 text-[10px] text-gray-600">
                      <span className="shrink-0">Cash ₹</span>
                      <input type="number" min="0" value={smpSplit.cash === 0 ? '' : smpSplit.cash}
                        onChange={(e) => setSmpSplit((p) => ({ ...p, cash: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-24 rounded border border-teal-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white" placeholder="0" />
                      <span className="shrink-0 text-gray-400">+ UPI ₹</span>
                      <input type="number" min="0" value={smpSplit.upi === 0 ? '' : smpSplit.upi}
                        onChange={(e) => setSmpSplit((p) => ({ ...p, upi: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-24 rounded border border-teal-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white" placeholder="0" />
                      {(smpSplit.cash > 0 || smpSplit.upi > 0) && (
                        <span className={`shrink-0 font-semibold ${smpSplit.cash + smpSplit.upi === smpTotal ? 'text-emerald-600' : 'text-red-500'}`}>
                          {smpSplit.cash + smpSplit.upi === smpTotal ? `= ₹${smpTotal.toLocaleString()} ✓` : `≠ ₹${smpTotal.toLocaleString()}`}
                        </span>
                      )}
                    </div>
                    <div className="w-[144px] shrink-0" />
                  </div>
                )}
              </div>

              {/* SVK Receipt + mode */}
              <div>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-32 shrink-0 text-[11px] font-semibold text-purple-600/80">SVK Receipt No</span>
                  <input
                    type="text"
                    value={svkReceiptNo}
                    onChange={(e) => setSvkReceiptNo(e.target.value)}
                    className="flex-1 rounded border border-purple-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 bg-white"
                  />
                  <div className="flex items-center gap-1 shrink-0 w-[144px]">
                    {(['CASH', 'UPI', 'SPLIT'] as PaymentMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSvkPaymentMode(mode)}
                        className={`flex-1 py-1 rounded text-[9px] font-bold text-center transition-colors cursor-pointer border ${
                          svkPaymentMode === mode
                            ? mode === 'SPLIT' ? 'bg-teal-600 text-white border-teal-600' : 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-purple-400 hover:text-purple-600'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                {svkPaymentMode === 'SPLIT' && (
                  <div className="flex items-center gap-3 px-4 pb-2.5 bg-teal-50/50">
                    <div className="w-32 shrink-0" />
                    <div className="flex flex-1 items-center gap-2 text-[10px] text-gray-600">
                      <span className="shrink-0">Cash ₹</span>
                      <input type="number" min="0" value={svkSplit.cash === 0 ? '' : svkSplit.cash}
                        onChange={(e) => setSvkSplit((p) => ({ ...p, cash: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-24 rounded border border-teal-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white" placeholder="0" />
                      <span className="shrink-0 text-gray-400">+ UPI ₹</span>
                      <input type="number" min="0" value={svkSplit.upi === 0 ? '' : svkSplit.upi}
                        onChange={(e) => setSvkSplit((p) => ({ ...p, upi: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-24 rounded border border-teal-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white" placeholder="0" />
                      {(svkSplit.cash > 0 || svkSplit.upi > 0) && (
                        <span className={`shrink-0 font-semibold ${svkSplit.cash + svkSplit.upi === svk ? 'text-emerald-600' : 'text-red-500'}`}>
                          {svkSplit.cash + svkSplit.upi === svk ? `= ₹${svk.toLocaleString()} ✓` : `≠ ₹${svk.toLocaleString()}`}
                        </span>
                      )}
                    </div>
                    <div className="w-[144px] shrink-0" />
                  </div>
                )}
              </div>

              {/* Additional Receipt + mode */}
              {additionalPaid.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-32 shrink-0 text-[11px] font-semibold text-emerald-600/80">Additional Receipt</span>
                    <input
                      type="text"
                      value={additionalReceiptNo}
                      onChange={(e) => setAdditionalReceiptNo(e.target.value)}
                      className="flex-1 rounded border border-emerald-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                    />
                    <div className="flex items-center gap-1 shrink-0 w-[144px]">
                      {(['CASH', 'UPI', 'SPLIT'] as PaymentMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setAdditionalPaymentMode(mode)}
                          className={`flex-1 py-1 rounded text-[9px] font-bold text-center transition-colors cursor-pointer border ${
                            additionalPaymentMode === mode
                              ? mode === 'SPLIT' ? 'bg-teal-600 text-white border-teal-600' : 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-gray-400 border-gray-200 hover:border-emerald-400 hover:text-emerald-600'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  {additionalPaymentMode === 'SPLIT' && (
                    <div className="flex items-center gap-3 px-4 pb-2.5 bg-teal-50/50">
                      <div className="w-32 shrink-0" />
                      <div className="flex flex-1 items-center gap-2 text-[10px] text-gray-600">
                        <span className="shrink-0">Cash ₹</span>
                        <input type="number" min="0" value={additionalSplit.cash === 0 ? '' : additionalSplit.cash}
                          onChange={(e) => setAdditionalSplit((p) => ({ ...p, cash: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-24 rounded border border-teal-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white" placeholder="0" />
                        <span className="shrink-0 text-gray-400">+ UPI ₹</span>
                        <input type="number" min="0" value={additionalSplit.upi === 0 ? '' : additionalSplit.upi}
                          onChange={(e) => setAdditionalSplit((p) => ({ ...p, upi: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-24 rounded border border-teal-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white" placeholder="0" />
                        {(additionalSplit.cash > 0 || additionalSplit.upi > 0) && (
                          <span className={`shrink-0 font-semibold ${additionalSplit.cash + additionalSplit.upi === additionalTotal ? 'text-emerald-600' : 'text-red-500'}`}>
                            {additionalSplit.cash + additionalSplit.upi === additionalTotal ? `= ₹${additionalTotal.toLocaleString()} ✓` : `≠ ₹${additionalTotal.toLocaleString()}`}
                          </span>
                        )}
                      </div>
                      <div className="w-[144px] shrink-0" />
                    </div>
                  )}
                </div>
              )}

              {/* Split note preview */}
              {splitNote && (
                <div className="flex items-start gap-3 px-4 py-2 bg-teal-50/60">
                  <div className="w-32 shrink-0" />
                  <div className="flex-1 text-[10px] text-teal-700 font-medium">
                    <span className="text-teal-400 font-semibold mr-1">Split:</span>{splitNote}
                    <span className="text-teal-400 ml-1 font-normal">(auto-added to remarks)</span>
                  </div>
                </div>
              )}

              {/* Remarks */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-32 shrink-0 text-[11px] font-semibold text-gray-500">Remarks</span>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={splitNote ? 'Optional additional notes' : 'Optional notes'}
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>

            </div>
          </div>

          {saveError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-3 shrink-0">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            loading={saving}
            disabled={!date || !isSplitValid}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
