import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { FeeRecord } from '../../types';
import { SMP_LINES, formatDate, numToWords } from '../../utils/feeReceipts';

type ReceiptKind = 'smp' | 'svk' | 'additional';

interface ReceiptState {
  record: FeeRecord;
  kind: ReceiptKind;
}

const KIND_LABEL: Record<ReceiptKind, string> = {
  smp: 'SMP Fee Receipt',
  svk: 'SVK Fee Receipt',
  additional: 'Additional Fee Receipt',
};

export function ReceiptBreakup() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ReceiptState | null;

  useEffect(() => {
    if (!state?.record) navigate('/portal', { replace: true });
  }, [state, navigate]);

  if (!state?.record) return null;

  const { record, kind } = state;

  const rows: { label: string; amount: number }[] =
    kind === 'smp'
      ? SMP_LINES.map((l) => ({ label: l.label, amount: l.key ? record.smp[l.key] ?? 0 : 0 }))
      : kind === 'additional'
      ? record.additionalPaid.map((h) => ({ label: h.label, amount: h.amount }))
      : [{ label: 'SVK Fee', amount: record.svk }];

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const receiptNo =
    kind === 'smp' ? record.receiptNumber : kind === 'svk' ? record.svkReceiptNumber : record.additionalReceiptNumber;

  return (
    <div className="font-portal min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-none">Receipt Breakup</p>
            <h1 className="text-sm font-bold text-gray-900 leading-tight mt-0.5 truncate">{KIND_LABEL[kind]}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Institution header */}
          <div className="text-center px-5 pt-5 pb-3 border-b-2 border-gray-900">
            <h2 className="text-base font-black tracking-wide text-gray-900">SANJAY MEMORIAL POLYTECHNIC</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Ikkeri Road, Sagar &ndash; 577401</p>
            <span className="inline-block mt-2.5 border-2 border-gray-900 rounded px-4 py-0.5 text-xs font-bold tracking-[0.2em] text-gray-900">
              {KIND_LABEL[kind].toUpperCase()}
            </span>
          </div>

          {/* Meta */}
          <div className="px-5 pt-3 flex items-center justify-between text-xs">
            <span className="text-gray-500">
              No. <span className="text-red-600 font-black text-base align-middle">{receiptNo || '—'}</span>
            </span>
            <span className="text-gray-500">
              Date <span className="font-semibold text-gray-900">{formatDate(record.date) || '—'}</span>
            </span>
          </div>

          {/* Student info */}
          <div className="px-5 pt-2 pb-3 space-y-1 text-xs">
            <div>
              <span className="text-gray-400">Name </span>
              <span className="font-semibold text-gray-900">{record.studentName}</span>
            </div>
            <div className="flex gap-4">
              <span><span className="text-gray-400">Class </span><span className="font-semibold text-gray-900">{record.year}</span></span>
              <span><span className="text-gray-400">Section </span><span className="font-semibold text-gray-900">{record.course} ({record.admCat === 'SNQ' ? 'SNQ' : record.admType})</span></span>
            </div>
            {kind === 'svk' && (
              <div><span className="text-gray-400">Father </span><span className="font-semibold text-gray-900">{record.fatherName}</span></div>
            )}
          </div>

          {/* Fee particulars table */}
          <div className="border-t-2 border-gray-900">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-300 bg-gray-50">
                  <th className="text-left font-bold uppercase tracking-wider text-gray-500 py-1.5 px-5">Particulars</th>
                  <th className="text-right font-bold uppercase tracking-wider text-gray-500 py-1.5 px-5">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1.5 px-5 text-gray-700">{r.label}</td>
                    <td className="py-1.5 px-5 text-right tabular-nums text-gray-800">
                      {r.amount > 0 ? `₹${r.amount.toLocaleString()}` : <span className="text-gray-300">&mdash;</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center border-t-2 border-gray-900 px-5 py-2 bg-gray-50">
              <span className="text-xs font-black uppercase tracking-wider text-gray-900">Total</span>
              <span className="text-sm font-black text-gray-900 tabular-nums">₹{total.toLocaleString()}</span>
            </div>
          </div>

          {/* Amount in words + signature */}
          <div className="px-5 py-3 text-xs">
            <span className="text-gray-400">Rupees (in words) </span>
            <span className="font-semibold italic text-gray-800">{numToWords(total)}</span>
          </div>
          <div className="px-5 pb-5 pt-6 text-right">
            <span className="text-xs italic font-bold text-gray-700 border-t border-gray-300 pt-1">Receiving Clerk</span>
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-3">Student copy &middot; view only</p>
      </div>
    </div>
  );
}
