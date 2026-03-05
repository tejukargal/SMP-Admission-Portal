import { useState } from 'react';
import { updateFeeRecord } from '../../services/feeRecordService';
import { Button } from '../common/Button';
import type {
  FeeRecord,
  SMPFeeHead,
  SMPHeads,
  FeeAdditionalHead,
  PaymentMode,
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
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(record.paymentMode);
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
  const svkTotal = svk + sumArr(additionalPaid);
  const grandTotal = smpTotal + svkTotal;

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    setSaveError(null);
    try {
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
          paymentMode,
          remarks,
          smp,
          svk,
          additionalPaid,
        },
        record.createdAt
      );
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
                  <th className="text-left px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200">
                    Head
                  </th>
                  <th className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200 w-28">
                    Amount (₹)
                  </th>
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
                {additionalPaid.map((h, idx) => (
                  <tr key={h.label} className="hover:bg-gray-50">
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
                <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-800">
                  <td className="px-3 py-1.5">Total SVK</td>
                  <td className="px-3 py-1.5 text-right text-blue-700">
                    {svkTotal.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Grand total */}
          <div className="rounded bg-gray-50 border border-gray-200 px-4 py-2.5 text-xs flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <span className="text-gray-500">SMP: </span>
              <span className="font-semibold text-gray-800">₹{smpTotal.toLocaleString()}</span>
            </span>
            <span>
              <span className="text-gray-500">SVK: </span>
              <span className="font-semibold text-gray-800">₹{svkTotal.toLocaleString()}</span>
            </span>
            <span>
              <span className="text-gray-500">Grand Total: </span>
              <span className="font-semibold text-blue-700">₹{grandTotal.toLocaleString()}</span>
            </span>
          </div>

          {/* Payment details */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                SMP Receipt No
              </label>
              <input
                type="text"
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                SVK Receipt No
              </label>
              <input
                type="text"
                value={svkReceiptNo}
                onChange={(e) => setSvkReceiptNo(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Payment Mode <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3 mt-1">
                {(['CASH', 'UPI'] as PaymentMode[]).map((mode) => (
                  <label
                    key={mode}
                    className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700"
                  >
                    <input
                      type="radio"
                      name="editPaymentMode"
                      value={mode}
                      checked={paymentMode === mode}
                      onChange={() => setPaymentMode(mode)}
                      className="accent-blue-600"
                    />
                    {mode}
                  </label>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Remarks</label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional notes"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
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
            disabled={!date}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
