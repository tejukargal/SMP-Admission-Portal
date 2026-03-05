import { useState, useEffect } from 'react';
import { getAllFeeRecordsByRegNumber, getAllFeeRecordsByStudent } from '../../services/feeRecordService';
import { getFeeStructure } from '../../services/feeStructureService';
import type { Student, FeeRecord, FeeStructure, AcademicYear } from '../../types';
import { SMP_FEE_HEADS } from '../../types';

interface YearData {
  academicYear: AcademicYear;
  records: FeeRecord[];
  structure: FeeStructure | null;
}

function sumSMPRecord(smp: FeeRecord['smp']): number {
  return SMP_FEE_HEADS.reduce((s, { key }) => s + smp[key], 0);
}

function calcRecordTotal(r: FeeRecord): number {
  return sumSMPRecord(r.smp) + r.svk + r.additionalPaid.reduce((s, h) => s + h.amount, 0);
}

function calcEffectiveFine(s: FeeStructure, records: FeeRecord[]): number {
  const finePaid = records.reduce((sum, r) => sum + r.smp.fine, 0);
  return Math.max(s.smp.fine, finePaid);
}

function calcAllotted(s: FeeStructure, records: FeeRecord[]): number {
  const effectiveFine = calcEffectiveFine(s, records);
  const smpTotal = SMP_FEE_HEADS.reduce(
    (t, { key }) => t + (key === 'fine' ? effectiveFine : s.smp[key]),
    0
  );
  return smpTotal + s.svk + s.additionalHeads.reduce((t, h) => t + h.amount, 0);
}

interface Props {
  student: Student;
  onClose: () => void;
}

export function FeeHistoryModal({ student, onClose }: Props) {
  const [yearData, setYearData] = useState<YearData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = student.regNumber
      ? getAllFeeRecordsByRegNumber(student.regNumber)
      : getAllFeeRecordsByStudent(student.id);

    fetch
      .then(async (records) => {
        const grouped = new Map<AcademicYear, FeeRecord[]>();
        for (const r of records) {
          const list = grouped.get(r.academicYear) ?? [];
          list.push(r);
          grouped.set(r.academicYear, list);
        }

        const data: YearData[] = await Promise.all(
          [...grouped.entries()].map(async ([ay, recs]) => {
            const first = recs[0];
            const structure =
              (await getFeeStructure(ay, first.course, first.year, first.admType, first.admCat)) ??
              (await getFeeStructure(ay, first.course, first.year, student.admType, student.admCat));
            const sorted = [...recs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return { academicYear: ay, records: sorted, structure };
          })
        );

        data.sort((a, b) => b.academicYear.localeCompare(a.academicYear));
        setYearData(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load fee history');
      })
      .finally(() => setLoading(false));
  }, [student.id]);

  const overallAllotted = yearData.reduce(
    (s, { structure, records }) => s + (structure ? calcAllotted(structure, records) : 0),
    0
  );
  const overallFine = yearData.reduce(
    (s, { structure, records }) => s + (structure ? calcEffectiveFine(structure, records) : 0),
    0
  );
  const overallPaid = yearData.reduce(
    (s, { records }) => s + records.reduce((rs, r) => rs + calcRecordTotal(r), 0),
    0
  );
  const overallDue = overallAllotted - overallPaid;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" style={{ animation: 'backdrop-enter 0.2s ease-out' }} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 flex flex-col" style={{ animation: 'modal-enter 0.25s ease-out' }}>

        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-start justify-between shrink-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 shrink-0">Fee History</h3>
            {!loading && !error && yearData.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {yearData.map(({ academicYear, records, structure }) => {
                  const paid = records.reduce((s, r) => s + calcRecordTotal(r), 0);
                  const allotted = structure ? calcAllotted(structure, records) : null;
                  const due = allotted !== null ? allotted - paid : null;
                  const noDues = due !== null && due <= 0;
                  return (
                    <span
                      key={academicYear}
                      className={`text-xs font-bold ${noDues ? 'text-green-600' : 'text-red-500'}`}
                    >
                      {academicYear}: {noDues ? 'No Dues' : `Dues ₹${due !== null ? due.toLocaleString() : '—'}`}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer mt-0.5 shrink-0 ml-3"
          >
            ×
          </button>
        </div>

        {/* Student info */}
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-200 text-xs shrink-0">
          <div className="flex flex-wrap gap-x-5 gap-y-0.5">
            <span>
              <span className="text-gray-500">Name: </span>
              <span className="font-semibold text-gray-900">{student.studentNameSSLC}</span>
            </span>
            <span>
              <span className="text-gray-500">Father: </span>
              <span className="text-gray-700">{student.fatherName}</span>
            </span>
            <span>
              <span className="text-gray-500">Reg: </span>
              <span className="text-gray-700">{student.regNumber || '—'}</span>
            </span>
            <span>
              <span className="text-gray-500">Course: </span>
              <span className="text-gray-700">{student.course}</span>
            </span>
            <span>
              <span className="text-gray-500">Year: </span>
              <span className="text-gray-700">{student.year}</span>
            </span>
            <span>
              <span className="text-gray-500">Adm Type: </span>
              <span className="text-gray-700">{student.admType}</span>
            </span>
            <span>
              <span className="text-gray-500">Cat: </span>
              <span className="text-gray-700">{student.admCat}</span>
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto space-y-4" style={{ maxHeight: '65vh' }}>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-gray-500">
              Loading fee history…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-10 text-sm text-red-500">
              {error}
            </div>
          ) : yearData.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-gray-400">
              No fee records found for this student.
            </div>
          ) : (
            yearData.map(({ academicYear, records, structure }) => {
              const totalPaid = records.reduce((s, r) => s + calcRecordTotal(r), 0);
              const allotted = structure ? calcAllotted(structure, records) : null;
              const fine = structure ? calcEffectiveFine(structure, records) : 0;
              const due = allotted !== null ? allotted - totalPaid : null;
              const svkAllotted = structure
                ? structure.svk + structure.additionalHeads.reduce((t, h) => t + h.amount, 0)
                : 0;
              const smpAllotted = allotted !== null ? allotted - svkAllotted : 0;
              const smpPaid = records.reduce((s, r) => s + sumSMPRecord(r.smp), 0);
              const svkPaid = totalPaid - smpPaid;
              const smpDue = smpAllotted - smpPaid;
              const svkDue = svkAllotted - svkPaid;

              return (
                <div key={academicYear} className="border border-gray-200 rounded-lg overflow-hidden">

                  {/* Academic year header with summary */}
                  <div className="bg-blue-50 border-b border-blue-100 px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span className="text-xs font-semibold text-blue-800 shrink-0">
                      {academicYear}
                    </span>
                    <span className="text-xs text-gray-500">
                      {records[0].course} · {records[0].year} · {records[0].admType} · {records[0].admCat}
                    </span>
                    <div className="ml-auto flex gap-4 text-xs">
                      {allotted !== null ? (
                        <>
                          <span>
                            <span className="text-gray-500">Allotted: </span>
                            <span className="font-semibold text-gray-700">
                              ₹{allotted.toLocaleString()}
                            </span>
                            <span className="text-gray-400 font-normal ml-1 text-[10px]">
                              (SMP ₹{smpAllotted.toLocaleString()} | SVK ₹{svkAllotted.toLocaleString()})
                            </span>
                          </span>
                          <span>
                            <span className="text-gray-500">Paid: </span>
                            <span className="font-semibold text-green-700">
                              ₹{totalPaid.toLocaleString()}
                            </span>
                            <span className="text-gray-400 font-normal ml-1 text-[10px]">
                              (SMP ₹{smpPaid.toLocaleString()} | SVK ₹{svkPaid.toLocaleString()})
                            </span>
                          </span>
                          <span>
                            <span className="text-gray-500">Due: </span>
                            <span
                              className={`font-semibold ${
                                due! > 0 ? 'text-red-600' : 'text-green-600'
                              }`}
                            >
                              ₹{due!.toLocaleString()}
                            </span>
                            <span className="text-gray-400 font-normal ml-1 text-[10px]">
                              (SMP ₹{smpDue.toLocaleString()} | SVK ₹{svkDue.toLocaleString()})
                            </span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span>
                            <span className="text-gray-500">Paid: </span>
                            <span className="font-semibold text-green-700">
                              ₹{totalPaid.toLocaleString()}
                            </span>
                          </span>
                          <span className="text-yellow-600 text-[10px] self-center">
                            No fee structure configured
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Receipts table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">
                            Date
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">
                            SMP Rpt
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">
                            SVK Rpt
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">
                            Mode
                          </th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">
                            Remarks
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                            SMP (₹)
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                            SVK (₹)
                          </th>
                          <th className="px-3 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                            Total (₹)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {records.map((r) => {
                          const smpTotal = sumSMPRecord(r.smp);
                          const svkTotal =
                            r.svk + r.additionalPaid.reduce((s, h) => s + h.amount, 0);
                          const total = smpTotal + svkTotal;
                          return (
                            <tr key={r.id} className="hover:bg-gray-50">
                              <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                                {r.date}
                              </td>
                              <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                                {r.receiptNumber || '—'}
                              </td>
                              <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                                {r.svkReceiptNumber || '—'}
                              </td>
                              <td className="px-3 py-1.5 whitespace-nowrap">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    r.paymentMode === 'CASH'
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-purple-50 text-purple-700'
                                  }`}
                                >
                                  {r.paymentMode}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-gray-500 max-w-[8rem] truncate">
                                {r.remarks || '—'}
                              </td>
                              <td className="px-3 py-1.5 text-right text-gray-700 whitespace-nowrap">
                                {smpTotal.toLocaleString()}
                              </td>
                              <td className="px-3 py-1.5 text-right text-gray-700 whitespace-nowrap">
                                {svkTotal.toLocaleString()}
                              </td>
                              <td className="px-3 py-1.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                                {total.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t border-gray-200 bg-gray-50">
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-1.5 text-xs font-semibold text-gray-600"
                          >
                            {records.length} receipt{records.length > 1 ? 's' : ''}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-800">
                            {records
                              .reduce((s, r) => s + sumSMPRecord(r.smp), 0)
                              .toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-800">
                            {records
                              .reduce(
                                (s, r) =>
                                  s +
                                  r.svk +
                                  r.additionalPaid.reduce((a, h) => a + h.amount, 0),
                                0
                              )
                              .toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-green-700">
                            ₹{totalPaid.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Pending dues breakdown (when structure exists) */}
                  {structure && (
                    <div className="border-t border-gray-200 px-3 py-2 bg-gray-50">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Pending Dues Breakdown
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {/* SMP heads with due > 0 */}
                        {SMP_FEE_HEADS.map(({ key, label }) => {
                          const allottedAmt = key === 'fine' ? fine : structure.smp[key];
                          const paidAmt = records.reduce((s, r) => s + r.smp[key], 0);
                          const dueAmt = allottedAmt - paidAmt;
                          if (allottedAmt === 0) return null;
                          return (
                            <span key={key}>
                              <span className="text-gray-500">{label}: </span>
                              <span
                                className={
                                  dueAmt > 0
                                    ? 'font-medium text-red-600'
                                    : 'font-medium text-green-600'
                                }
                              >
                                ₹{dueAmt.toLocaleString()}
                              </span>
                            </span>
                          );
                        })}
                        {/* SVK */}
                        {(() => {
                          const svkAllotted = structure.svk;
                          const svkPaid = records.reduce((s, r) => s + r.svk, 0);
                          const svkDue = svkAllotted - svkPaid;
                          if (svkAllotted === 0) return null;
                          return (
                            <span key="svk">
                              <span className="text-gray-500">SVK: </span>
                              <span
                                className={
                                  svkDue > 0
                                    ? 'font-medium text-red-600'
                                    : 'font-medium text-green-600'
                                }
                              >
                                ₹{svkDue.toLocaleString()}
                              </span>
                            </span>
                          );
                        })()}
                        {/* Additional SVK heads */}
                        {structure.additionalHeads.map((h) => {
                          const paidAmt = records.reduce(
                            (s, r) =>
                              s +
                              (r.additionalPaid.find((ap) => ap.label === h.label)?.amount ?? 0),
                            0
                          );
                          const dueAmt = h.amount - paidAmt;
                          if (h.amount === 0) return null;
                          return (
                            <span key={h.label}>
                              <span className="text-gray-500">{h.label}: </span>
                              <span
                                className={
                                  dueAmt > 0
                                    ? 'font-medium text-red-600'
                                    : 'font-medium text-green-600'
                                }
                              >
                                ₹{dueAmt.toLocaleString()}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Overall summary footer */}
        {!loading && !error && yearData.length > 0 && (
          <div className="px-5 py-2.5 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-x-6 gap-y-1 text-xs shrink-0">
            <span className="font-semibold text-gray-600 self-center">Overall:</span>
            <span>
              <span className="text-gray-500">Total Allotted: </span>
              <span className="font-semibold text-gray-900">
                ₹{overallAllotted.toLocaleString()}
              </span>
              {overallFine > 0 && (
                <span className="text-amber-600 font-normal ml-1">
                  (₹{(overallAllotted - overallFine).toLocaleString()} + Fine ₹{overallFine.toLocaleString()})
                </span>
              )}
            </span>
            <span>
              <span className="text-gray-500">Total Paid: </span>
              <span className="font-semibold text-green-700">₹{overallPaid.toLocaleString()}</span>
            </span>
            <span>
              <span className="text-gray-500">Total Due: </span>
              <span className={`font-semibold ${overallDue > 0 ? 'text-red-600' : 'text-green-700'}`}>
                ₹{overallDue.toLocaleString()}
              </span>
            </span>
          </div>
        )}

        {/* Close button */}
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
