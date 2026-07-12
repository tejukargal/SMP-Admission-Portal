import { useEffect, useState } from 'react';
import { fetchMyTcRecords, fetchMyPcRecords, fetchMyRefundRecords } from '../../services/studentPortalService';
import type { TCRecord } from '../../services/tcService';
import type { PCRecord } from '../../services/pcService';
import type { RefundRecord } from '../../services/refundService';

type SubTab = 'tc' | 'pc' | 'refund';

const REFUND_PAYMENT_LABELS: Record<string, string> = {
  CHEQUE: 'Cheque',
  ACCOUNT_PAYEE_CHEQUE: 'Account Payee Cheque',
  NEFT: 'NEFT',
  CASH: 'Cash',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CertificatesTab({ regNumber }: { regNumber: string }) {
  const [loading, setLoading] = useState(true);
  const [tcRecords, setTcRecords] = useState<TCRecord[]>([]);
  const [pcRecords, setPcRecords] = useState<PCRecord[]>([]);
  const [refundRecords, setRefundRecords] = useState<RefundRecord[]>([]);
  const [subTab, setSubTab] = useState<SubTab>('tc');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchMyTcRecords(regNumber),
      fetchMyPcRecords(regNumber),
      fetchMyRefundRecords(regNumber),
    ])
      .then(([tc, pc, refund]) => {
        if (cancelled) return;
        setTcRecords(tc);
        setPcRecords(pc);
        setRefundRecords(refund);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [regNumber]);

  const SUB_TABS: { key: SubTab; label: string; count: number }[] = [
    { key: 'tc', label: 'TC', count: tcRecords.length },
    { key: 'pc', label: 'PC', count: pcRecords.length },
    { key: 'refund', label: 'Refunds', count: refundRecords.length },
  ];

  if (loading) {
    return <div className="text-sm text-gray-400 text-center py-10">Loading certificates…</div>;
  }

  return (
    <div className="space-y-3">
      {/* Sub-tab pills */}
      <div className="flex items-center gap-1.5">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              subTab === t.key ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
            <span className={`rounded-full text-[10px] px-1.5 leading-4 ${subTab === t.key ? 'bg-white/25' : 'bg-gray-100 text-gray-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {subTab === 'tc' && <TcList records={tcRecords} />}
      {subTab === 'pc' && <PcList records={pcRecords} />}
      {subTab === 'refund' && <RefundList records={refundRecords} />}
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-6">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl">
        {icon}
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-500">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function TcList({ records }: { records: TCRecord[] }) {
  if (records.length === 0) {
    return <EmptyState icon="📜" title="No Transfer Certificate Issued" subtitle="Your TC will appear here once issued by the office." />;
  }
  return (
    <div className="space-y-3">
      {records.map((r, idx) => {
        const isDup = r.isDuplicate;
        return (
          <div key={r.id} className={`rounded-xl border overflow-hidden shadow-sm border-l-4 ${isDup ? 'border-amber-200 border-l-amber-400' : 'border-purple-200 border-l-purple-400'}`}>
            <div className={`px-4 py-2.5 flex items-center justify-between flex-wrap gap-1 ${isDup ? 'bg-amber-50' : 'bg-purple-50'}`}>
              <div className="flex items-center gap-2.5">
                <span className={`text-sm font-bold ${isDup ? 'text-amber-800' : 'text-purple-800'}`}>TC #{r.tcNumber}</span>
                {idx === 0 && records.length > 1 && <span className="text-[10px] text-gray-400 font-medium">· Latest</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${isDup ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-purple-100 text-purple-700 border-purple-300'}`}>
                  {isDup ? 'Duplicate Copy' : 'Original'}
                </span>
                <span className="text-[10px] text-gray-400">Issued {fmtDate(r.issuedAt)}</span>
              </div>
            </div>
            <div className="px-4 py-3 bg-white grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              <div>
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Date of Leaving</dt>
                <dd className="text-xs font-medium text-gray-800 mt-0.5">{r.dateOfLeaving || '—'}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Semester</dt>
                <dd className="text-xs font-medium text-gray-800 mt-0.5">{r.semester || '—'}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Last Exam</dt>
                <dd className="text-xs font-medium text-gray-800 mt-0.5">{r.lastExam || '—'}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Result</dt>
                <dd className="text-xs font-medium text-gray-800 mt-0.5">{r.result || '—'}</dd>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PcList({ records }: { records: PCRecord[] }) {
  if (records.length === 0) {
    return <EmptyState icon="🎓" title="No Provisional Certificate Issued" subtitle="Your PC will appear here once issued by the office." />;
  }
  return (
    <div className="space-y-3">
      {records.map((r, idx) => {
        const isDup = r.isDuplicate;
        return (
          <div key={r.id} className={`rounded-xl border overflow-hidden shadow-sm border-l-4 ${isDup ? 'border-amber-200 border-l-amber-400' : 'border-emerald-200 border-l-emerald-400'}`}>
            <div className={`px-4 py-2.5 flex items-center justify-between flex-wrap gap-1 ${isDup ? 'bg-amber-50' : 'bg-emerald-50'}`}>
              <div className="flex items-center gap-2.5">
                <span className={`text-sm font-bold ${isDup ? 'text-amber-800' : 'text-emerald-800'}`}>{r.examPeriod}</span>
                {idx === 0 && records.length > 1 && <span className="text-[10px] text-gray-400 font-medium">· Latest</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${isDup ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-emerald-100 text-emerald-700 border-emerald-300'}`}>
                  {isDup ? 'Duplicate Copy' : 'Original'}
                </span>
                <span className="text-[10px] text-gray-400">Issued {fmtDate(r.issuedAt)}</span>
              </div>
            </div>
            <div className="px-4 py-3 bg-white grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              <div>
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Reg. Number</dt>
                <dd className="text-xs font-medium text-gray-800 mt-0.5">{r.regNumber || '—'}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Result Class</dt>
                <dd className="text-xs font-medium text-gray-800 mt-0.5">{r.resultClass || '—'}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Date of Issue</dt>
                <dd className="text-xs font-medium text-gray-800 mt-0.5">{r.dateOfIssue || '—'}</dd>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RefundList({ records }: { records: RefundRecord[] }) {
  if (records.length === 0) {
    return <EmptyState icon="↩" title="No Refund Recorded" subtitle="Fee refund vouchers will appear here once issued by the office." />;
  }
  const totalRefunded = records.reduce((s, r) => s + r.refundAmount, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold px-3 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
          {records.length} refund{records.length > 1 ? 's' : ''} · Total Refunded ₹{totalRefunded.toLocaleString()}
        </span>
      </div>
      {records.map((r, idx) => (
        <div key={r.id} className="rounded-xl border overflow-hidden shadow-sm border-l-4 border-red-200 border-l-red-400">
          <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-1 bg-red-50">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold text-red-800">₹{r.refundAmount.toLocaleString()}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/70 border border-red-200 text-red-700">
                {r.refundCategory === 'SEAT_CANCELLATION' ? 'Seat Cancellation' : 'SNQ'}
              </span>
              {idx === 0 && records.length > 1 && <span className="text-[10px] text-gray-400 font-medium">· Latest</span>}
            </div>
            <span className="text-[10px] text-gray-400">Issued {fmtDate(r.issuedAt)}</span>
          </div>
          <div className="px-4 py-3 bg-white grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <div>
              <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Mode</dt>
              <dd className="text-xs font-medium text-gray-800 mt-0.5">{REFUND_PAYMENT_LABELS[r.paymentType] ?? r.paymentType}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Reference No.</dt>
              <dd className="text-xs font-medium text-gray-800 mt-0.5">{r.referenceNumber || '—'}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Payment Date</dt>
              <dd className="text-xs font-medium text-gray-800 mt-0.5">{r.paymentDate ? fmtDate(r.paymentDate) : '—'}</dd>
            </div>
            {r.remarks && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Remarks</dt>
                <dd className="text-xs font-medium text-gray-800 mt-0.5">{r.remarks}</dd>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
