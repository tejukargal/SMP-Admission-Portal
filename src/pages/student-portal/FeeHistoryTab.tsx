import { useEffect, useState } from 'react';
import type { AcademicYear, Student } from '../../types';
import { fetchMyFeeRecords, fetchMyFeeStructure, fetchMyFeeOverride } from '../../services/studentPortalService';
import {
  calcAllotted, calcEffectiveFine, calcRecordTotal, sumSMPRecord, effectiveValues,
  type YearData,
} from '../../utils/feeCalc';

export function FeeHistoryTab({ regNumber, allRecords }: { regNumber: string; allRecords: Student[] }) {
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
    return <div className="text-sm text-gray-400 text-center py-10">Loading fee history…</div>;
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
        <div className="rounded-lg bg-red-600 text-white px-3 py-1.5 flex items-center gap-1.5 shadow-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p className="text-[11px] font-bold leading-tight">
            You have a pending due of ₹{totalDue.toLocaleString()}. Please pay the due fee immediately at the office.
          </p>
        </div>
      )}
      {yearData.map((yd) => {
        const { academicYear, records, override } = yd;
        const ev = effectiveValues(yd);
        const totalPaid = records.reduce((s, r) => s + calcRecordTotal(r), 0);
        const allotted = ev ? calcAllotted(ev.smp, ev.svk, ev.additional, records) : null;
        const due = allotted !== null ? allotted - totalPaid : null;
        const noDues = due !== null && due <= 0;
        const smpPaid = records.reduce((s, r) => s + sumSMPRecord(r.smp), 0);
        const svkPaid = records.reduce((s, r) => s + r.svk, 0);

        return (
          <div key={academicYear} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className={`px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b ${noDues ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center gap-2">
                <span className={`rounded-full text-white text-[10px] font-bold px-2.5 py-0.5 ${noDues ? 'bg-emerald-600' : 'bg-red-600'}`}>
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
                <div className={`text-xs font-bold ${noDues ? 'text-emerald-700' : 'text-red-700'}`}>
                  {noDues ? 'No Dues' : `Due ₹${due!.toLocaleString()}`}
                </div>
              ) : (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5 font-medium">
                  Structure not configured
                </span>
              )}
            </div>

            <div className="px-4 py-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Allotted</p>
                <p className="text-sm font-bold text-gray-800">{allotted !== null ? `₹${allotted.toLocaleString()}` : '—'}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400">Paid</p>
                <p className="text-sm font-bold text-emerald-700">₹{totalPaid.toLocaleString()}</p>
              </div>
              <div>
                <p className={`text-[9px] font-semibold uppercase tracking-wider ${noDues ? 'text-emerald-400' : 'text-red-400'}`}>Due</p>
                <p className={`text-sm font-bold ${noDues ? 'text-emerald-700' : 'text-red-700'}`}>
                  {due !== null ? `₹${Math.max(0, due).toLocaleString()}` : '—'}
                </p>
              </div>
            </div>

            {/* Receipts */}
            <div className="border-t border-gray-100 px-4 py-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-left font-semibold py-1 whitespace-nowrap">Date</th>
                    <th className="text-left font-semibold py-1 whitespace-nowrap">Receipt</th>
                    <th className="text-right font-semibold py-1 whitespace-nowrap">SMP</th>
                    <th className="text-right font-semibold py-1 whitespace-nowrap">SVK</th>
                    <th className="text-right font-semibold py-1 whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5 text-gray-600 whitespace-nowrap">{r.date ? r.date.split('T')[0] : '—'}</td>
                      <td className="py-1.5 text-gray-600 whitespace-nowrap">{r.receiptNumber || '—'}</td>
                      <td className="py-1.5 text-right text-gray-700 whitespace-nowrap">₹{sumSMPRecord(r.smp).toLocaleString()}</td>
                      <td className="py-1.5 text-right text-gray-700 whitespace-nowrap">₹{r.svk.toLocaleString()}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900 whitespace-nowrap">₹{calcRecordTotal(r).toLocaleString()}</td>
                    </tr>
                  ))}
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
