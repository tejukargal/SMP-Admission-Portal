import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AcademicYear, FeeRecord, Student } from '../../types';
import { fetchMyFeeRecords, fetchMyFeeStructure, fetchMyFeeOverride } from '../../services/studentPortalService';
import {
  calcAllotted, calcEffectiveFine, calcRecordTotal, sumSMPRecord, effectiveValues,
  type YearData,
} from '../../utils/feeCalc';

export function FeeHistoryTab({ regNumber, allRecords }: { regNumber: string; allRecords: Student[] }) {
  const navigate = useNavigate();
  function openBreakup(record: FeeRecord, kind: 'smp' | 'svk' | 'additional') {
    navigate('/portal/receipt', { state: { record, kind, fromTab: 'fees' } });
  }
  const [yearData, setYearData] = useState<YearData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMyFeeRecords(regNumber)
      .then(async (records) => {
        const grouped = new Map<AcademicYear, typeof records>();
        for (const r of records) {
          const list = grouped.get(r.academicYear) ?? [];
          list.push(r);
          grouped.set(r.academicYear, list);
        }
        const data: YearData[] = await Promise.all(
          [...grouped.entries()].map(async ([ay, recs]) => {
            const first = recs[0];
            const structure = await fetchMyFeeStructure(ay, first.course, first.year, first.admType, first.admCat);
            const ownDocForYear = allRecords.find((s) => s.academicYear === ay);
            const override = ownDocForYear ? await fetchMyFeeOverride(ownDocForYear.id, ay) : null;
            const sorted = [...recs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return { academicYear: ay, records: sorted, structure, override };
          }),
        );
        data.sort((a, b) => b.academicYear.localeCompare(a.academicYear));
        if (!cancelled) setYearData(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load fee history.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [regNumber, allRecords]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
    );
  }
  if (error) {
    return <div className="text-sm text-red-500 text-center py-10">{error}</div>;
  }
  if (yearData.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-10">No fee records found.</div>;
  }

  const totalDue = yearData.reduce((sum, yd) => {
    const ev = effectiveValues(yd);
    if (!ev) return sum;
    const paid = yd.records.reduce((s, r) => s + calcRecordTotal(r), 0);
    const allotted = calcAllotted(ev.smp, ev.svk, ev.additional, yd.records);
    const due = allotted - paid;
    return sum + Math.max(0, due);
  }, 0);

  return (
    <div className="space-y-3">
      {totalDue > 0 && (
        <div
          style={{ animation: 'content-enter 0.3s ease-out both' }}
          className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-3.5 py-2.5 flex items-center gap-2 shadow-sm"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p className="text-[11px] font-bold leading-tight">
            You have a pending due of ₹{totalDue.toLocaleString()}. Please pay the due fee immediately at the office.
          </p>
        </div>
      )}
      {yearData.map((yd, idx) => {
        const { academicYear, records, override } = yd;
        const ev = effectiveValues(yd);
        const totalPaid = records.reduce((s, r) => s + calcRecordTotal(r), 0);
        const allotted = ev ? calcAllotted(ev.smp, ev.svk, ev.additional, records) : null;
        const due = allotted !== null ? allotted - totalPaid : null;
        const noDues = due !== null && due <= 0;
        const smpPaid = records.reduce((s, r) => s + sumSMPRecord(r.smp), 0);
        const svkPaid = records.reduce((s, r) => s + r.svk, 0);

        return (
          <div
            key={academicYear}
            style={{ animation: 'content-enter 0.3s ease-out both', animationDelay: `${Math.min(idx, 12) * 0.05}s` }}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
          >
            <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50 border-gray-200">
              <div className="flex items-center gap-2">
                <span className="rounded-full text-[10px] font-bold px-2.5 py-0.5 border bg-gray-900 text-white border-gray-900">
                  {academicYear}
                </span>
                <span className="text-xs text-gray-500">
                  {records[0].course} · {records[0].year} · {records[0].admType}
                </span>
                {override && (
                  <span className="text-[10px] rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-amber-700 font-semibold">
                    Custom Allotted
                  </span>
                )}
              </div>
              {allotted !== null ? (
                <div className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full text-white ${noDues ? 'bg-emerald-600' : 'bg-red-600'}`}>
                  {noDues ? 'No Dues' : `Due ₹${due!.toLocaleString()}`}
                </div>
              ) : (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5 font-medium">
                  Structure not configured
                </span>
              )}
            </div>

            <div className="px-4 py-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-gray-50 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Allotted</p>
                <p className="text-base font-black text-gray-800">{allotted !== null ? `₹${allotted.toLocaleString()}` : '—'}</p>
              </div>
              <div className="rounded-xl bg-gray-50 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Paid</p>
                <p className="text-base font-black text-emerald-600">₹{totalPaid.toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-gray-50 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Due</p>
                <p className={`text-base font-black ${noDues ? 'text-emerald-600' : 'text-red-600'}`}>
                  {due !== null ? `₹${Math.max(0, due).toLocaleString()}` : '—'}
                </p>
              </div>
            </div>

            {/* Receipts */}
            <div className="border-t border-gray-200 px-4 py-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 mt-1 mb-0.5">
                <span className="w-5 h-5 rounded-md bg-gray-100 text-gray-500 flex items-center justify-center">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Receipts</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="text-left font-semibold py-1 whitespace-nowrap">Date</th>
                    <th className="text-left font-semibold py-1 whitespace-nowrap">Receipt</th>
                    <th className="text-right font-semibold py-1 whitespace-nowrap">SMP</th>
                    <th className="text-right font-semibold py-1 whitespace-nowrap">SVK</th>
                    <th className="text-right font-semibold py-1 whitespace-nowrap">Total</th>
                    <th className="text-right font-semibold py-1 whitespace-nowrap">Breakup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.map((r) => {
                    const hasSMP = sumSMPRecord(r.smp) > 0;
                    const hasSVK = r.svk > 0;
                    const hasAddl = r.additionalPaid.some((h) => h.amount > 0);
                    return (
                      <tr key={r.id}>
                        <td className="py-1.5 text-gray-600 whitespace-nowrap">{r.date ? r.date.split('T')[0] : '—'}</td>
                        <td className="py-1.5 text-gray-600 whitespace-nowrap">{r.receiptNumber || '—'}</td>
                        <td className="py-1.5 text-right text-gray-700 whitespace-nowrap">₹{sumSMPRecord(r.smp).toLocaleString()}</td>
                        <td className="py-1.5 text-right text-gray-700 whitespace-nowrap">₹{r.svk.toLocaleString()}</td>
                        <td className="py-1.5 text-right font-semibold text-gray-900 whitespace-nowrap">₹{calcRecordTotal(r).toLocaleString()}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {hasSMP && (
                              <button
                                onClick={() => openBreakup(r, 'smp')}
                                className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                              >
                                SMP
                              </button>
                            )}
                            {hasSVK && (
                              <button
                                onClick={() => openBreakup(r, 'svk')}
                                className="text-[10px] font-semibold text-violet-600 hover:text-violet-700 hover:underline cursor-pointer"
                              >
                                SVK
                              </button>
                            )}
                            {hasAddl && (
                              <button
                                onClick={() => openBreakup(r, 'additional')}
                                className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                              >
                                Addl
                              </button>
                            )}
                            {!hasSMP && !hasSVK && !hasAddl && <span className="text-[10px] text-gray-300">—</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(smpPaid > 0 || svkPaid > 0) && calcEffectiveFine(0, records) > 0 && (
                <p className="text-[10px] text-gray-400 mt-1.5">Includes fine of ₹{calcEffectiveFine(0, records).toLocaleString()}.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
