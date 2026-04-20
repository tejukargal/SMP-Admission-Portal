import { useState, useEffect } from 'react';
import { getAllFeeRecordsByStudent, getAllFeeRecordsByRegNumber } from '../../services/feeRecordService';
import { getFeeStructure } from '../../services/feeStructureService';
import { getFeeOverride } from '../../services/feeOverrideService';
import type { FeeRecord, FeeStructure, AcademicYear, StudentFeeOverride, SMPHeads, FeeAdditionalHead, AdmType, AdmCat } from '../../types';
import { SMP_FEE_HEADS } from '../../types';

/** Minimal student fields required by FeeHistoryModal — satisfied by both Student and a FeeRecord-derived object. */
export interface FeeHistoryStudentInfo {
  id: string;
  regNumber: string;
  studentNameSSLC: string;
  fatherName: string;
  course: string;
  year: string;
  admType: string;
  admCat: string;
}

interface YearData {
  academicYear: AcademicYear;
  records: FeeRecord[];
  structure: FeeStructure | null;
  override: StudentFeeOverride | null;
}

function sumSMPRecord(smp: FeeRecord['smp']): number {
  return SMP_FEE_HEADS.reduce((s, { key }) => s + smp[key], 0);
}

function calcRecordTotal(r: FeeRecord): number {
  return sumSMPRecord(r.smp) + r.svk + r.additionalPaid.reduce((s, h) => s + h.amount, 0);
}

/** Effective fine = max(allotted fine, total fine paid) — prevents negative balance. */
function calcEffectiveFine(smpFineAllotted: number, records: FeeRecord[]): number {
  const finePaid = records.reduce((sum, r) => sum + r.smp.fine, 0);
  return Math.max(smpFineAllotted, finePaid);
}

/** Total allotted for a year given the effective SMP/SVK/additional values. */
function calcAllotted(
  smpValues: SMPHeads,
  svk: number,
  additionalHeads: FeeAdditionalHead[],
  records: FeeRecord[],
): number {
  const effectiveFine = calcEffectiveFine(smpValues.fine, records);
  const smpTotal = SMP_FEE_HEADS.reduce(
    (t, { key }) => t + (key === 'fine' ? effectiveFine : smpValues[key]),
    0,
  );
  return smpTotal + svk + additionalHeads.reduce((t, h) => t + h.amount, 0);
}

/** Returns the effective allotted source values for a year (override > structure). */
function effectiveValues(yd: YearData): { smp: SMPHeads; svk: number; additional: FeeAdditionalHead[] } | null {
  if (yd.override) {
    return { smp: yd.override.smp, svk: yd.override.svk, additional: yd.override.additionalHeads };
  }
  if (yd.structure) {
    return { smp: yd.structure.smp, svk: yd.structure.svk, additional: yd.structure.additionalHeads };
  }
  return null;
}

const FEE_PALETTE = {
  noDues:  { headerBg: 'bg-emerald-100', headerBorder: 'border-emerald-200', cardBorder: 'border-emerald-300', badgeBg: 'bg-emerald-700', divider: 'border-emerald-300', duesBg: 'bg-emerald-50' },
  hasDues: { headerBg: 'bg-red-100',     headerBorder: 'border-red-200',     cardBorder: 'border-red-300',     badgeBg: 'bg-red-700',     divider: 'border-red-300',     duesBg: 'bg-red-50'     },
};

interface Props {
  student: FeeHistoryStudentInfo;
  onClose: () => void;
  /** Pre-computed dues status from the parent — used as the initial header colour while data loads. */
  initialNoDues?: boolean;
}

export function FeeHistoryModal({ student, onClose, initialNoDues }: Props) {
  const [yearData, setYearData] = useState<YearData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDues, setExpandedDues] = useState<Set<string>>(new Set());

  function toggleDues(ay: string) {
    setExpandedDues((prev) => {
      const next = new Set(prev);
      if (next.has(ay)) next.delete(ay); else next.add(ay);
      return next;
    });
  }

  useEffect(() => {
    // Query by both studentId and regNumber to capture records across all academic years.
    // A student re-enrolled in a new year gets a new document ID, so previous-year fee
    // records (saved with the old studentId) are only reachable via regNumber.
    // Results are merged and deduplicated by record ID.
    Promise.all([
      getAllFeeRecordsByStudent(student.id),
      student.regNumber ? getAllFeeRecordsByRegNumber(student.regNumber) : Promise.resolve([] as import('../../types').FeeRecord[]),
    ]).then(([byId, byReg]) => {
      const seen = new Set<string>();
      const merged: import('../../types').FeeRecord[] = [];
      for (const r of [...byId, ...byReg]) {
        if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
      }
      return merged;
    })
      .then(async (records) => {

        const grouped = new Map<AcademicYear, FeeRecord[]>();
        for (const r of records) {
          const list = grouped.get(r.academicYear) ?? [];
          list.push(r);
          grouped.set(r.academicYear, list);
        }

        // Determine the most recent academic year across all records so we can
        // use the student's current course/year for that year's fee structure
        // lookup. This handles the case where a student's course/year was
        // changed after they had already made payments — all prior records
        // still carry the old course/year, so without this the allotted fee
        // structure would never update.  For older academic years we keep the
        // recorded values because they were accurate at the time of payment.
        const latestAY = [...grouped.keys()].sort().at(-1);

        const data: YearData[] = await Promise.all(
          [...grouped.entries()].map(async ([ay, recs]) => {
            const first = recs[0];
            const isLatest = ay === latestAY;
            // Always resolve the fee structure using the values stored on the
            // fee records themselves (course/year/admType/admCat at time of
            // payment).  We deliberately do NOT use student.year here — that
            // field reflects the student's CURRENT year-of-study (e.g. 3RD YEAR
            // in 2026-27) which is wrong for historical year groups (e.g. 2025-26
            // records that correctly carry 2ND YEAR).  Fee records are kept in
            // sync by applyCourseYearUpdate / applyAdmCatFeeAdjustment whenever
            // the student's details change mid-year.
            const structure =
              await getFeeStructure(ay, first.course, first.year, first.admType, first.admCat)
              // For the latest year only: if admType/admCat was changed very
              // recently and the fee-record update hasn't propagated, fall back
              // to the student's current admType/admCat (keeping course/year
              // from the record so we never cross year boundaries).
              ?? (isLatest
                ? await getFeeStructure(ay, first.course, first.year, student.admType as AdmType, student.admCat as AdmCat)
                : null);
            const override = await getFeeOverride(first.studentId, ay);
            const sorted = [...recs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return { academicYear: ay, records: sorted, structure: structure ?? null, override };
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

  const overallAllotted = yearData.reduce((s, yd) => {
    const ev = effectiveValues(yd);
    return s + (ev ? calcAllotted(ev.smp, ev.svk, ev.additional, yd.records) : 0);
  }, 0);
  const overallFine = yearData.reduce((s, yd) => {
    const ev = effectiveValues(yd);
    return s + (ev ? calcEffectiveFine(ev.smp.fine, yd.records) : 0);
  }, 0);
  const overallPaid = yearData.reduce(
    (s, { records }) => s + records.reduce((rs, r) => rs + calcRecordTotal(r), 0),
    0,
  );
  const overallDue = overallAllotted - overallPaid;

  const headerGradient = loading
    ? initialNoDues === true
      ? 'from-emerald-600 to-emerald-800'
      : initialNoDues === false
        ? 'from-red-600 to-red-800'
        : 'from-slate-700 to-slate-900'
    : !error && yearData.length > 0
      ? overallDue > 0
        ? 'from-red-600 to-red-800'
        : 'from-emerald-600 to-emerald-800'
      : 'from-slate-700 to-slate-900';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden h-[calc(100vh-3rem)]"
        style={{ animation: 'modal-enter 0.25s ease-out' }}
      >

        {/* Header */}
        <div className={`px-5 py-3.5 bg-gradient-to-r ${headerGradient} flex items-center justify-between shrink-0`}>
          <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 text-xs font-bold text-white shrink-0">
                ≡
              </span>
              Fee Details
            </h3>
            {!loading && !error && yearData.length > 0 && yearData.map((yd) => {
              const ev = effectiveValues(yd);
              const paid = yd.records.reduce((s, r) => s + calcRecordTotal(r), 0);
              const allotted = ev ? calcAllotted(ev.smp, ev.svk, ev.additional, yd.records) : null;
              const due = allotted !== null ? allotted - paid : null;
              const noDues = due !== null && due <= 0;
              return (
                <span
                  key={yd.academicYear}
                  className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40"
                >
                  {yd.academicYear}
                  <span className="opacity-80">·</span>
                  <span>{noDues ? '✓ No Dues' : `Due ₹${due !== null ? due.toLocaleString() : '—'}`}</span>
                  {yd.override && (
                    <span className="text-amber-300 opacity-80">· custom</span>
                  )}
                </span>
              );
            })}
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 ml-3"
          >
            ×
          </button>
        </div>

        {/* Student info bar */}
        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {[
              { label: 'Student', value: student.studentNameSSLC, bold: true },
              { label: 'Father', value: student.fatherName },
              { label: 'Reg No', value: student.regNumber || '—' },
              { label: 'Course', value: student.course },
              { label: 'Year', value: student.year },
              { label: 'Adm Type', value: student.admType },
              { label: 'Cat', value: student.admCat },
            ].map(({ label, value, bold }) => (
              <div key={label} className="flex flex-col min-w-0">
                <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{label}</span>
                <span className={`text-xs truncate ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, yi) => (
                <div key={yi} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex items-center gap-4">
                    <div className="skeleton h-5 w-24 rounded-full" />
                    <div className="skeleton h-3 w-40 rounded" />
                    <div className="ml-auto flex gap-6">
                      <div className="skeleton h-8 w-20 rounded-lg" />
                      <div className="skeleton h-8 w-20 rounded-lg" />
                      <div className="skeleton h-8 w-20 rounded-lg" />
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-1.5 flex gap-3 border-b border-gray-200">
                        {['w-16', 'w-20', 'flex-1', 'w-20', 'w-20', 'w-20'].map((w, j) => (
                          <div key={j} className={`skeleton h-2.5 ${w} rounded`} />
                        ))}
                      </div>
                      {Array.from({ length: 2 + yi }).map((_, i) => (
                        <div key={i} className="px-3 py-2 flex gap-3 border-b border-gray-100 last:border-0">
                          {['w-16', 'w-20', 'flex-1', 'w-20', 'w-20', 'w-20'].map((w, j) => (
                            <div key={j} className={`skeleton h-3 ${w} rounded`} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-10 text-sm text-red-500">
              {error}
            </div>
          ) : yearData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span className="text-2xl opacity-20">₹</span>
              <span className="text-sm text-gray-400">No fee records found for this student.</span>
            </div>
          ) : (
            yearData.map((yd, ydIdx) => {
              const { academicYear, records, structure, override } = yd;
              const ev = effectiveValues(yd);
              const totalPaid = records.reduce((s, r) => s + calcRecordTotal(r), 0);
              const allotted = ev ? calcAllotted(ev.smp, ev.svk, ev.additional, records) : null;
              const fine = ev ? calcEffectiveFine(ev.smp.fine, records) : 0;
              const due = allotted !== null ? allotted - totalPaid : null;
              const noDues = due !== null && due <= 0;
              const palette = noDues ? FEE_PALETTE.noDues : FEE_PALETTE.hasDues;
              const svkBaseAllotted = ev?.svk ?? 0;
              const additionalAllotted = ev ? ev.additional.reduce((t, h) => t + h.amount, 0) : 0;
              const smpAllotted = allotted !== null ? allotted - svkBaseAllotted - additionalAllotted : 0;
              const smpPaid = records.reduce((s, r) => s + sumSMPRecord(r.smp), 0);
              const svkBasePaid = records.reduce((s, r) => s + r.svk, 0);
              const additionalPaidTotal = records.reduce(
                (s, r) => s + r.additionalPaid.reduce((a, h) => a + h.amount, 0),
                0,
              );
              const smpDue = smpAllotted - smpPaid;
              const svkDue = svkBaseAllotted - svkBasePaid;
              const additionalDue = additionalAllotted - additionalPaidTotal;

              return (
                <div
                  key={academicYear}
                  style={{ animation: `content-enter 0.3s ease-out ${ydIdx * 65}ms both` }}
                  className={`rounded-xl overflow-hidden shadow-sm border-l-4 ${
                    noDues ? 'border-l-emerald-400' : 'border-l-red-400'
                  } border ${palette.cardBorder}`}
                >

                  {/* Year card header */}
                  <div className={`px-4 py-2.5 ${palette.headerBg} border-b ${palette.headerBorder} flex flex-wrap items-center gap-3`}>
                    {/* Left: year + meta */}
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={`rounded-full ${palette.badgeBg} text-white text-[10px] font-bold px-2.5 py-0.5 shrink-0`}>
                        {academicYear}
                      </span>
                      <span className="text-xs text-slate-500">
                        {records[0].course} · {records[0].year} · {records[0].admType} · {records[0].admCat}
                      </span>
                      {override && (
                        <span className="text-[10px] rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-amber-700 font-semibold shrink-0">
                          Custom Allotted
                        </span>
                      )}
                    </div>

                    {/* Right: stat metrics */}
                    <div className="ml-auto flex items-stretch gap-0 shrink-0">
                      {allotted !== null ? (
                        <>
                          <div className={`flex flex-col items-end px-3 border-r ${palette.divider}`}>
                            <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Allotted</span>
                            <span className="text-xs font-bold text-slate-700">₹{allotted.toLocaleString()}</span>
                            <span className="text-[9px] text-slate-400 font-normal">
                              {smpAllotted > 0 && `SMP ₹${smpAllotted.toLocaleString()}`}
                              {svkBaseAllotted > 0 && ` · SVK ₹${svkBaseAllotted.toLocaleString()}`}
                              {additionalAllotted > 0 && ` · Addl ₹${additionalAllotted.toLocaleString()}`}
                            </span>
                          </div>
                          <div className={`flex flex-col items-end px-3 border-r ${palette.divider}`}>
                            <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">Paid</span>
                            <span className="text-xs font-bold text-emerald-700">₹{totalPaid.toLocaleString()}</span>
                            <span className="text-[9px] text-slate-400 font-normal">
                              {smpPaid > 0 && `SMP ₹${smpPaid.toLocaleString()}`}
                              {svkBasePaid > 0 && ` · SVK ₹${svkBasePaid.toLocaleString()}`}
                              {additionalPaidTotal > 0 && ` · Addl ₹${additionalPaidTotal.toLocaleString()}`}
                            </span>
                          </div>
                          <div className="flex flex-col items-end pl-3">
                            <span className={`text-[9px] font-semibold uppercase tracking-wider ${noDues ? 'text-emerald-400' : 'text-red-400'}`}>
                              Due
                            </span>
                            <span className={`text-xs font-bold ${noDues ? 'text-emerald-600' : 'text-red-600'}`}>
                              ₹{due!.toLocaleString()}
                            </span>
                            <span className="text-[9px] text-slate-400 font-normal">
                              {smpDue !== 0 && `SMP ₹${smpDue.toLocaleString()}`}
                              {svkDue !== 0 && ` · SVK ₹${svkDue.toLocaleString()}`}
                              {additionalDue !== 0 && ` · Addl ₹${additionalDue.toLocaleString()}`}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={`flex flex-col items-end px-3 border-r ${palette.divider}`}>
                            <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">Paid</span>
                            <span className="text-xs font-bold text-emerald-700">₹{totalPaid.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center pl-3">
                            <span className="text-[10px] text-amber-500 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5 font-medium">
                              No structure configured
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Receipts table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Date</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">SMP Rpt</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">SVK Rpt</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Addl Rpt</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Mode</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap">Remarks</th>
                          <th className="px-3 py-1.5 text-right font-semibold whitespace-nowrap bg-blue-50 text-blue-600">SMP (₹)</th>
                          <th className="px-3 py-1.5 text-right font-semibold whitespace-nowrap bg-purple-50 text-purple-600">SVK (₹)</th>
                          <th className="px-3 py-1.5 text-right font-semibold whitespace-nowrap bg-emerald-50 text-emerald-600">Addl (₹)</th>
                          <th className="px-3 py-1.5 text-right font-semibold whitespace-nowrap bg-slate-100 text-slate-700">Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {records.map((r) => {
                          const rowSmpTotal = sumSMPRecord(r.smp);
                          const rowSvkBase = r.svk;
                          const rowAddlTotal = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
                          const rowTotal = rowSmpTotal + rowSvkBase + rowAddlTotal;
                          return (
                            <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap font-medium">
                                {r.date.split('-').reverse().join('-')}
                              </td>
                              <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                                {r.receiptNumber || '—'}
                              </td>
                              <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                                {r.svkReceiptNumber || '—'}
                              </td>
                              <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                                {r.additionalReceiptNumber || '—'}
                              </td>
                              <td className="px-3 py-1.5 whitespace-nowrap">
                                {(() => {
                                  const rowSmpAmt = sumSMPRecord(r.smp);
                                  const rowSvkAmt = r.svk;
                                  const rowAddlAmt = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
                                  const hasPerSection = r.smpPaymentMode !== undefined || r.svkPaymentMode !== undefined || r.additionalPaymentMode !== undefined;
                                  const badge = (mode: typeof r.paymentMode) => (
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      mode === 'CASH'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : 'bg-violet-50 text-violet-700 border border-violet-200'
                                    }`}>
                                      {mode}
                                    </span>
                                  );
                                  if (!hasPerSection) return badge(r.paymentMode);
                                  const smpMode = r.smpPaymentMode ?? r.paymentMode;
                                  const svkMode = r.svkPaymentMode ?? r.paymentMode;
                                  const addlMode = r.additionalPaymentMode ?? r.paymentMode;
                                  const activeModes = [
                                    ...(rowSmpAmt > 0 ? [smpMode] : []),
                                    ...(rowSvkAmt > 0 ? [svkMode] : []),
                                    ...(rowAddlAmt > 0 ? [addlMode] : []),
                                  ];
                                  if (activeModes.length > 0 && activeModes.every((m) => m === activeModes[0])) {
                                    return badge(activeModes[0]);
                                  }
                                  return (
                                    <div className="flex flex-col gap-0.5">
                                      {rowSmpAmt > 0 && (
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${smpMode === 'CASH' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-violet-50 text-violet-700 border border-violet-200'}`}>
                                          SMP · {smpMode}
                                        </span>
                                      )}
                                      {rowSvkAmt > 0 && (
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${svkMode === 'CASH' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-violet-50 text-violet-700 border border-violet-200'}`}>
                                          SVK · {svkMode}
                                        </span>
                                      )}
                                      {rowAddlAmt > 0 && (
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${addlMode === 'CASH' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-violet-50 text-violet-700 border border-violet-200'}`}>
                                          Addl · {addlMode}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-1.5 text-gray-400 max-w-[8rem] truncate">
                                {r.remarks || '—'}
                              </td>
                              <td className="px-3 py-1.5 text-right text-blue-700 whitespace-nowrap bg-blue-50/40">
                                {rowSmpTotal > 0 ? rowSmpTotal.toLocaleString() : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right text-purple-700 whitespace-nowrap bg-purple-50/40">
                                {rowSvkBase > 0 ? rowSvkBase.toLocaleString() : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right text-emerald-700 whitespace-nowrap bg-emerald-50/40">
                                {rowAddlTotal > 0 ? rowAddlTotal.toLocaleString() : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right font-bold text-slate-800 whitespace-nowrap bg-slate-50">
                                ₹{rowTotal.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                          <td colSpan={6} className="px-3 py-1.5 text-xs text-gray-500">
                            {records.length} receipt{records.length > 1 ? 's' : ''}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs text-blue-700 bg-blue-50">
                            {records.reduce((s, r) => s + sumSMPRecord(r.smp), 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs text-purple-700 bg-purple-50">
                            {records.reduce((s, r) => s + r.svk, 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs text-emerald-700 bg-emerald-50">
                            {records.reduce((s, r) => s + r.additionalPaid.reduce((a, h) => a + h.amount, 0), 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs text-slate-800 bg-slate-100">
                            ₹{totalPaid.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Pending dues breakdown */}
                  {ev && (
                    <div className={`border-t ${palette.headerBorder}`}>
                      <button
                        onClick={() => toggleDues(academicYear)}
                        className={`w-full flex items-center justify-between px-4 py-2 ${palette.duesBg} hover:brightness-95 transition-all cursor-pointer text-left`}
                      >
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Pending Dues Breakdown
                          {override && !structure && (
                            <span className="ml-1 normal-case text-amber-500 font-normal">· custom allotted</span>
                          )}
                        </span>
                        <span className={`text-gray-400 text-xs transition-transform duration-200 ${expandedDues.has(academicYear) ? 'rotate-180' : ''}`}>
                          ▾
                        </span>
                      </button>
                      {expandedDues.has(academicYear) && (
                      <div className={`px-4 pb-3 pt-2 ${palette.duesBg}`}>
                      <div className="space-y-2">

                        {/* SMP row */}
                        {(() => {
                          const items = SMP_FEE_HEADS.flatMap(({ key, label }) => {
                            const allottedAmt = key === 'fine' ? fine : ev.smp[key];
                            if (allottedAmt === 0) return [];
                            const paidAmt = records.reduce((s, r) => s + r.smp[key], 0);
                            return [{ key, label, dueAmt: allottedAmt - paidAmt }];
                          });
                          if (items.length === 0) return null;
                          return (
                            <div className="flex items-start gap-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-8 pt-1.5 shrink-0">SMP</span>
                              <div className="flex-1 overflow-x-auto">
                                <div className="flex gap-x-4 pb-0.5">
                                  {items.map(({ key, label, dueAmt }) => (
                                    <div key={key} className="flex flex-col items-center shrink-0">
                                      <span className="text-[10px] text-gray-500 whitespace-nowrap leading-tight">{label}</span>
                                      <span className={`text-xs font-bold tabular-nums leading-tight ${dueAmt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {dueAmt === 0 ? '✓' : `₹${dueAmt.toLocaleString()}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* SVK row */}
                        {ev.svk > 0 && (() => {
                          const svkPd = records.reduce((s, r) => s + r.svk, 0);
                          const svkDueAmt = ev.svk - svkPd;
                          return (
                            <div className="flex items-start gap-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-8 pt-1.5 shrink-0">SVK</span>
                              <div className="flex gap-x-4">
                                <div className="flex flex-col items-center shrink-0">
                                  <span className="text-[10px] text-gray-500 whitespace-nowrap leading-tight">SVK Fee</span>
                                  <span className={`text-xs font-bold tabular-nums leading-tight ${svkDueAmt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {svkDueAmt === 0 ? '✓' : `₹${svkDueAmt.toLocaleString()}`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Additional heads row */}
                        {ev.additional.length > 0 && (() => {
                          const items = ev.additional.flatMap((h) => {
                            if (h.amount === 0) return [];
                            const paidAmt = records.reduce(
                              (s, r) => s + (r.additionalPaid.find((ap) => ap.label === h.label)?.amount ?? 0), 0,
                            );
                            return [{ label: h.label, dueAmt: h.amount - paidAmt }];
                          });
                          if (items.length === 0) return null;
                          return (
                            <div className="flex items-start gap-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-8 pt-1.5 shrink-0">Addl</span>
                              <div className="flex-1 overflow-x-auto">
                                <div className="flex gap-x-4 pb-0.5">
                                  {items.map(({ label, dueAmt }) => (
                                    <div key={label} className="flex flex-col items-center shrink-0">
                                      <span className="text-[10px] text-gray-500 whitespace-nowrap leading-tight">{label}</span>
                                      <span className={`text-xs font-bold tabular-nums leading-tight ${dueAmt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {dueAmt === 0 ? '✓' : `₹${dueAmt.toLocaleString()}`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                      </div>
                      </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer: overall summary + close */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0">
          {!loading && !error && yearData.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3" style={{ animation: 'content-enter 0.35s ease-out' }}>
              <div className="flex-1 min-w-[100px] rounded-xl bg-white border border-gray-200 px-3 py-2">
                <div className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Total Allotted</div>
                <div className="text-sm font-bold text-gray-800 mt-0.5">₹{overallAllotted.toLocaleString()}</div>
                {overallFine > 0 && (
                  <div className="text-[9px] text-amber-500 mt-0.5">
                    +Fine ₹{overallFine.toLocaleString()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-[100px] rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                <div className="text-[9px] text-emerald-400 font-semibold uppercase tracking-wider">Total Paid</div>
                <div className="text-sm font-bold text-emerald-700 mt-0.5">₹{overallPaid.toLocaleString()}</div>
              </div>
              <div className={`flex-1 min-w-[100px] rounded-xl px-3 py-2 border ${
                overallDue > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-100'
              }`}>
                <div className={`text-[9px] font-semibold uppercase tracking-wider ${overallDue > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  Total Due
                </div>
                <div className={`text-sm font-bold mt-0.5 ${overallDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ₹{overallDue.toLocaleString()}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
