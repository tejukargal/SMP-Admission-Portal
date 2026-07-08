import { useState, useEffect, useMemo } from 'react';
import type { Student } from '../../types';
import { SMP_FEE_HEADS } from '../../types';
import type { FeeRecord } from '../../types';
import { getAllFeeRecordsByStudent, appendFeeRecordRemark } from '../../services/feeRecordService';
import {
  saveRefundRecord,
  getRefundRecordsByStudent,
  type RefundRecord,
  type RefundPaymentType,
  type RefundHeadLine,
} from '../../services/refundService';
import { generateSeatCancellationRefundVoucher } from '../../utils/seatCancellationRefundVoucher';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  student: Student;
  onClose: () => void;
}

const PAYMENT_TYPES: { value: RefundPaymentType; label: string }[] = [
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'ACCOUNT_PAYEE_CHEQUE', label: 'Account Payee Cheque' },
  { value: 'NEFT', label: 'NEFT' },
  { value: 'CASH', label: 'Cash' },
];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function isoToDDMMYYYY(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function sumSMPRecord(smp: FeeRecord['smp']): number {
  return SMP_FEE_HEADS.reduce((s, { key }) => s + smp[key], 0);
}

const inp = 'w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

export function SeatCancellationRefundModal({ student, onClose }: Props) {
  const { user } = useAuth();

  const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
  const [loadingFee, setLoadingFee] = useState(true);

  const [priorRefunds, setPriorRefunds] = useState<RefundRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [amountTouched, setAmountTouched] = useState(false);
  const [paymentType, setPaymentType] = useState<RefundPaymentType>('CHEQUE');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentDateISO, setPaymentDateISO] = useState(todayISO);
  const [remarks, setRemarks] = useState('');
  const [remarksTouched, setRemarksTouched] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fetch fee records to compute total paid
  useEffect(() => {
    let cancelled = false;
    setLoadingFee(true);
    getAllFeeRecordsByStudent(student.id)
      .then((records) => { if (!cancelled) setFeeRecords(records); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoadingFee(false); });
    return () => { cancelled = true; };
  }, [student.id]);

  // Fetch prior refund history for this student (any category — avoids double-refunding)
  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    getRefundRecordsByStudent(student.id)
      .then((records) => { if (!cancelled) setPriorRefunds(records); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [student.id]);

  const smpPaid = useMemo(
    () => feeRecords.reduce((s, r) => s + sumSMPRecord(r.smp), 0),
    [feeRecords],
  );
  const svkPaid = useMemo(
    () => feeRecords.reduce((s, r) => s + r.svk, 0),
    [feeRecords],
  );
  const additionalPaid = useMemo(
    () => feeRecords.reduce((s, r) => s + r.additionalPaid.reduce((a, h) => a + h.amount, 0), 0),
    [feeRecords],
  );
  const grandTotalPaid = smpPaid + svkPaid + additionalPaid;

  const headBreakdown: RefundHeadLine[] = useMemo(() => [
    { label: 'SMP Fee', amount: smpPaid },
    { label: 'SVK Fee', amount: svkPaid },
    { label: 'Additional Fee', amount: additionalPaid },
  ].filter((h) => h.amount > 0), [smpPaid, svkPaid, additionalPaid]);

  const priorRefundsTotal = useMemo(
    () => priorRefunds.reduce((s, r) => s + r.refundAmount, 0),
    [priorRefunds],
  );

  // Full total paid, less anything already refunded to this student (any category)
  const refundableTotal = useMemo(
    () => Math.max(0, grandTotalPaid - priorRefundsTotal),
    [grandTotalPaid, priorRefundsTotal],
  );

  // Prefill refund amount with the full refundable total once everything loads, unless the admin edited it
  useEffect(() => {
    if (!loadingFee && !loadingHistory && !amountTouched) {
      setRefundAmount(refundableTotal);
    }
  }, [loadingFee, loadingHistory, amountTouched, refundableTotal]);

  // Prefill remarks with a brief total-fee-paid summary once fee records load, unless the admin edited it
  useEffect(() => {
    if (!loadingFee && !remarksTouched) {
      setRemarks(
        `Seat admission cancelled. Total fee paid was Rs. ${grandTotalPaid.toLocaleString()} (SMP Rs. ${smpPaid.toLocaleString()}, SVK Rs. ${svkPaid.toLocaleString()} & Additional Fee of Rs. ${additionalPaid.toLocaleString()}), refunded in full.`,
      );
    }
  }, [loadingFee, remarksTouched, grandTotalPaid, smpPaid, svkPaid, additionalPaid]);

  const hasPriorRefund = priorRefunds.length > 0;
  const needsReference = paymentType !== 'CASH';
  const canGenerate =
    !loadingFee && !generating &&
    refundAmount > 0 &&
    paymentDateISO !== '' &&
    (!needsReference || referenceNumber.trim() !== '');

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setSaveError(null);
    try {
      const paymentDate = isoToDDMMYYYY(paymentDateISO);
      await saveRefundRecord({
        studentId: student.id,
        studentName: student.studentNameSSLC,
        fatherName: student.fatherName,
        regNumber: student.regNumber,
        course: student.course,
        year: student.year,
        academicYear: student.academicYear,
        totalPaid: grandTotalPaid,
        receiptBreakdown: [],
        refundCategory: 'SEAT_CANCELLATION',
        headBreakdown,
        refundAmount,
        paymentType,
        referenceNumber: referenceNumber.trim(),
        paymentDate: paymentDateISO,
        remarks: remarks.trim(),
        issuedBy: user?.email ?? '',
        issuedAt: new Date().toISOString(),
      });

      // Note the refund on the student's fee records (Fee History / Fee Register remarks)
      // so it's visible alongside the original payment remarks. Non-fatal: the refund is
      // already saved above, so a failure here must never block voucher printing.
      appendFeeRecordRemark(
        student.id,
        student.academicYear,
        `Refunded ₹${refundAmount.toLocaleString()} on ${paymentDate} (Seat Cancellation)`,
      ).catch(() => { /* non-fatal */ });

      generateSeatCancellationRefundVoucher(student, {
        totalPaid: grandTotalPaid,
        headBreakdown,
        refundAmount,
        paymentType,
        referenceNumber: referenceNumber.trim(),
        paymentDate,
        remarks: remarks.trim(),
      });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save refund record. Voucher was not generated.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Seat Cancellation Fee Refund</h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px]">{student.studentNameSSLC}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5 flex-shrink-0"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

          {/* Prior refund banner */}
          {loadingHistory ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin flex-shrink-0" />
              Checking refund history…
            </div>
          ) : hasPriorRefund ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-2">
                <span>⚠</span> Refund already recorded for this student
              </div>
              <div className="space-y-1">
                {priorRefunds.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs text-amber-700">
                    <span className="font-medium">₹{r.refundAmount.toLocaleString()}</span>
                    <span className="text-amber-500">·</span>
                    <span>{PAYMENT_TYPES.find((p) => p.value === r.paymentType)?.label}</span>
                    <span className="text-amber-500">·</span>
                    <span>{isoToDDMMYYYY(r.paymentDate) || r.paymentDate}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-green-700">
              <span>✓</span> No prior refund recorded for this student.
            </div>
          )}

          {/* Total paid summary */}
          <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-500 space-y-0.5">
            <div>
              <span className="font-medium text-gray-700">Course:</span> {student.course} · {student.year} · {student.academicYear}
            </div>
            <div>
              <span className="font-medium text-gray-700">Status:</span> Seat Cancelled
            </div>
            <div>
              <span className="font-medium text-gray-700">SMP Fee Paid:</span>{' '}
              {loadingFee ? 'Loading…' : `₹${smpPaid.toLocaleString()}`}
            </div>
            <div>
              <span className="font-medium text-gray-700">SVK Fee Paid:</span>{' '}
              {loadingFee ? 'Loading…' : `₹${svkPaid.toLocaleString()}`}
            </div>
            <div>
              <span className="font-medium text-gray-700">Additional Fee Paid:</span>{' '}
              {loadingFee ? 'Loading…' : `₹${additionalPaid.toLocaleString()}`}
            </div>
            {priorRefundsTotal > 0 && (
              <div>
                <span className="font-medium text-gray-700">Already Refunded:</span>{' '}
                ₹{priorRefundsTotal.toLocaleString()}
              </div>
            )}
            <div>
              <span className="font-medium text-gray-700">Refundable Total:</span>{' '}
              {loadingFee || loadingHistory ? 'Loading…' : `₹${refundableTotal.toLocaleString()}`}
            </div>
          </div>

          {/* Refund Amount */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Refund Amount (₹) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              value={refundAmount}
              onChange={(e) => { setAmountTouched(true); setRefundAmount(Number(e.target.value)); }}
              className={inp}
            />
          </div>

          {/* Payment Type & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mode of Refund</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as RefundPaymentType)}
                className={inp}
              >
                {PAYMENT_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Date of Refund <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={paymentDateISO}
                onChange={(e) => setPaymentDateISO(e.target.value)}
                className={inp}
              />
            </div>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Reference / Cheque / UTR No.{needsReference && <span className="text-red-500"> *</span>}
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value.toUpperCase())}
              placeholder={needsReference ? 'e.g. 123456 / UTR number' : 'Optional'}
              className={inp}
            />
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => { setRemarksTouched(true); setRemarks(e.target.value); }}
              rows={2}
              className={inp}
              placeholder="Optional"
            />
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            <strong>Note:</strong> Generating this voucher records the refund and opens a printable document with signature lines for the student, parent/guardian, and principal.
          </div>

          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700">
              <strong>Couldn't save refund record:</strong> {saveError}
              <div className="mt-1 text-red-500">The voucher was not printed. Please try again.</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 flex justify-end gap-2 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating…' : 'Generate Voucher'}
          </button>
        </div>
      </div>
    </div>
  );
}
