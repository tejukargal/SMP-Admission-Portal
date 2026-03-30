import { useState, useEffect } from 'react';
import { getAllFeeRecordsByStudent, getAllFeeRecordsByRegNumber } from '../../services/feeRecordService';
import { getFeeStructure } from '../../services/feeStructureService';
import { getFeeOverride } from '../../services/feeOverrideService';
import { useStudentDocuments } from '../../hooks/useStudentDocuments';
import type {
  Student, FeeRecord, FeeStructure, AcademicYear,
  StudentFeeOverride, SMPHeads, FeeAdditionalHead, AdmType, AdmCat, DocRecord,
} from '../../types';
import { SMP_FEE_HEADS, REQUIRED_DOCS } from '../../types';

// ─── Fee history helpers (mirrors FeeHistoryModal) ───────────────────────────

function sumSMPRecord(smp: FeeRecord['smp']): number {
  return SMP_FEE_HEADS.reduce((s, { key }) => s + smp[key], 0);
}
function calcRecordTotal(r: FeeRecord): number {
  return sumSMPRecord(r.smp) + r.svk + r.additionalPaid.reduce((s, h) => s + h.amount, 0);
}
function calcEffectiveFine(smpFineAllotted: number, records: FeeRecord[]): number {
  const finePaid = records.reduce((sum, r) => sum + r.smp.fine, 0);
  return Math.max(smpFineAllotted, finePaid);
}
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

interface YearData {
  academicYear: AcademicYear;
  records: FeeRecord[];
  structure: FeeStructure | null;
  override: StudentFeeOverride | null;
}

function effectiveValues(yd: YearData): { smp: SMPHeads; svk: number; additional: FeeAdditionalHead[] } | null {
  if (yd.override) return { smp: yd.override.smp, svk: yd.override.svk, additional: yd.override.additionalHeads };
  if (yd.structure) return { smp: yd.structure.smp, svk: yd.structure.svk, additional: yd.structure.additionalHeads };
  return null;
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </h4>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  const display = (value === null || value === undefined || value === '') ? '—' : String(value);
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 leading-tight">{label}</dt>
      <dd className="text-xs text-gray-800 mt-0.5 leading-snug">{display}</dd>
    </div>
  );
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

function ProfileTab({ student: s }: { student: Student }) {
  const sslcPct = s.sslcMaxTotal > 0
    ? ((s.sslcObtainedTotal / s.sslcMaxTotal) * 100).toFixed(1)
    : null;
  const msPct = s.mathsScienceMaxTotal > 0
    ? ((s.mathsScienceObtainedTotal / s.mathsScienceMaxTotal) * 100).toFixed(1)
    : null;

  return (
    <div className="px-6 py-5 space-y-6">

      {/* Personal */}
      <section>
        <SectionHeading>Personal Information</SectionHeading>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          <Field label="Name (SSLC)" value={s.studentNameSSLC} />
          <Field label="Name (Aadhaar)" value={s.studentNameAadhar} />
          <Field label="Date of Birth" value={s.dateOfBirth ? s.dateOfBirth.split('-').reverse().join('-') : ''} />
          <Field label="Gender" value={s.gender} />
          <Field label="Religion" value={s.religion} />
          <Field label="Caste" value={s.caste} />
          <Field label="Category" value={s.category} />
          <Field label="Annual Income" value={s.annualIncome ? `₹${Number(s.annualIncome).toLocaleString()}` : ''} />
        </dl>
      </section>

      <div className="border-t border-gray-100" />

      {/* Contact */}
      <section>
        <SectionHeading>Contact Details</SectionHeading>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          <Field label="Father's Name" value={s.fatherName} />
          <Field label="Mother's Name" value={s.motherName} />
          <Field label="Father Mobile" value={s.fatherMobile} />
          <Field label="Student Mobile" value={s.studentMobile} />
          <div className="col-span-2 sm:col-span-3">
            <Field label="Address" value={s.address} />
          </div>
          <Field label="Town / City" value={s.town} />
          <Field label="Taluk" value={s.taluk} />
          <Field label="District" value={s.district} />
        </dl>
      </section>

      <div className="border-t border-gray-100" />

      {/* Academic */}
      <section>
        <SectionHeading>Academic Details</SectionHeading>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          <Field label="Course" value={s.course} />
          <Field label="Study Year" value={s.year} />
          <Field label="Academic Year" value={s.academicYear} />
          <Field label="Admission Type" value={s.admType} />
          <Field label="Admission Category" value={s.admCat} />
          <Field label="Admission Status" value={s.admissionStatus} />
          <Field label="Merit Number" value={s.meritNumber} />
          <Field label="Register Number" value={s.regNumber} />
          <Field label="10th Board" value={s.tenthBoard} />
          <Field label="Prior Qualification" value={s.priorQualification} />
        </dl>
      </section>

      <div className="border-t border-gray-100" />

      {/* Marks */}
      <section>
        <SectionHeading>Marks Details</SectionHeading>
        <div className="overflow-x-auto">
          <table className="text-xs w-auto border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Subject</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">Max Marks</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">Obtained</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700">SSLC Total</td>
                <td className="px-4 py-2 text-right text-gray-700">{s.sslcMaxTotal || '—'}</td>
                <td className="px-4 py-2 text-right text-gray-700">{s.sslcObtainedTotal || '—'}</td>
                <td className="px-4 py-2 text-right font-medium text-blue-700">
                  {sslcPct ? `${sslcPct}%` : '—'}
                </td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700">Science</td>
                <td className="px-4 py-2 text-right text-gray-700">{s.scienceMax || '—'}</td>
                <td className="px-4 py-2 text-right text-gray-700">{s.scienceObtained || '—'}</td>
                <td className="px-4 py-2 text-right text-gray-400">—</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700">Maths</td>
                <td className="px-4 py-2 text-right text-gray-700">{s.mathsMax || '—'}</td>
                <td className="px-4 py-2 text-right text-gray-700">{s.mathsObtained || '—'}</td>
                <td className="px-4 py-2 text-right text-gray-400">—</td>
              </tr>
              <tr className="bg-blue-50 font-semibold">
                <td className="px-4 py-2 text-blue-800">Maths + Science Total</td>
                <td className="px-4 py-2 text-right text-blue-800">{s.mathsScienceMaxTotal || '—'}</td>
                <td className="px-4 py-2 text-right text-blue-800">{s.mathsScienceObtainedTotal || '—'}</td>
                <td className="px-4 py-2 text-right text-blue-700">
                  {msPct ? `${msPct}%` : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── Documents tab ────────────────────────────────────────────────────────────

function DocumentsTab({
  docs,
  loading,
  error,
}: {
  docs: DocRecord | null;
  loading: boolean;
  error: string;
}) {
  if (loading) {
    return (
      <div className="px-6 py-5 space-y-2">
        {REQUIRED_DOCS.map((d) => (
          <div key={d.key} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-10 text-center text-sm text-red-500">{error}</div>
    );
  }

  const submittedCount = docs
    ? REQUIRED_DOCS.filter((d) => docs[d.key]?.submitted).length
    : 0;

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <SectionHeading>Document Checklist</SectionHeading>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          submittedCount === REQUIRED_DOCS.length
            ? 'bg-green-100 text-green-700'
            : 'bg-yellow-100 text-yellow-700'
        }`}>
          {submittedCount} / {REQUIRED_DOCS.length} submitted
        </span>
      </div>
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
        {REQUIRED_DOCS.map((d) => {
          const entry = docs?.[d.key];
          const submitted = entry?.submitted ?? false;
          const returned = entry?.returned ?? false;
          return (
            <div key={d.key} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
              {/* Status icon */}
              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                submitted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}>
                {submitted ? '✓' : '○'}
              </span>
              {/* Doc name */}
              <span className={`flex-1 text-xs ${submitted ? 'text-gray-800' : 'text-gray-400'}`}>
                {d.label}
              </span>
              {/* Dates */}
              <div className="flex items-center gap-4 text-xs shrink-0">
                {submitted && entry?.submittedOn && (
                  <span className="text-gray-500">
                    Submitted: <span className="text-gray-700">{entry.submittedOn.split('-').reverse().join('-')}</span>
                  </span>
                )}
                {returned && (
                  <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                    <span>Returned</span>
                    {entry?.returnedOn && (
                      <span className="font-normal text-gray-500">
                        {entry.returnedOn.split('-').reverse().join('-')}
                      </span>
                    )}
                  </span>
                )}
                {!submitted && (
                  <span className="text-gray-300 text-[10px] uppercase tracking-wide">Pending</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fee history tab ──────────────────────────────────────────────────────────

function FeeTab({
  yearData,
  loading,
  error,
  overallAllotted,
  overallFine,
  overallPaid,
  overallDue,
}: {
  yearData: YearData[];
  loading: boolean;
  error: string | null;
  overallAllotted: number;
  overallFine: number;
  overallPaid: number;
  overallDue: number;
}) {
  if (loading) {
    return (
      <div className="px-6 py-5 space-y-4">
        {Array.from({ length: 2 }).map((_, yi) => (
          <div key={yi} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-100 px-3 py-2 flex items-center gap-4">
              <div className="skeleton h-3.5 w-20 rounded" />
              <div className="skeleton h-3 w-32 rounded" />
              <div className="ml-auto flex gap-6">
                <div className="skeleton h-3 w-28 rounded" />
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-3 w-20 rounded" />
              </div>
            </div>
            <div className="border border-gray-100 rounded overflow-hidden mx-3 my-3">
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
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-10 flex items-center justify-center text-sm text-red-500">{error}</div>
    );
  }

  if (yearData.length === 0) {
    return (
      <div className="px-6 py-10 flex items-center justify-center text-sm text-gray-400">
        No fee records found for this student.
      </div>
    );
  }

  return (
    <div className="px-6 py-5 space-y-4">
      {/* Year-dues summary chips */}
      <div className="flex flex-wrap gap-2">
        {yearData.map((yd) => {
          const ev = effectiveValues(yd);
          const paid = yd.records.reduce((s, r) => s + calcRecordTotal(r), 0);
          const allotted = ev ? calcAllotted(ev.smp, ev.svk, ev.additional, yd.records) : null;
          const due = allotted !== null ? allotted - paid : null;
          const noDues = due !== null && due <= 0;
          return (
            <span
              key={yd.academicYear}
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                noDues ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'
              }`}
            >
              {yd.academicYear}: {noDues ? 'No Dues' : `Due ₹${due !== null ? due.toLocaleString() : '—'}`}
              {yd.override && <span className="ml-1 font-normal text-amber-600 text-[10px]">(custom)</span>}
            </span>
          );
        })}
      </div>

      {/* Year blocks */}
      {yearData.map((yd) => {
        const { academicYear, records, structure, override } = yd;
        const ev = effectiveValues(yd);
        const totalPaid = records.reduce((s, r) => s + calcRecordTotal(r), 0);
        const allotted = ev ? calcAllotted(ev.smp, ev.svk, ev.additional, records) : null;
        const fine = ev ? calcEffectiveFine(ev.smp.fine, records) : 0;
        const due = allotted !== null ? allotted - totalPaid : null;
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
          <div key={academicYear} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Year header */}
            <div className="bg-blue-50 border-b border-blue-100 px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="text-xs font-semibold text-blue-800 shrink-0">{academicYear}</span>
              <span className="text-xs text-gray-500">
                {records[0].course} · {records[0].year} · {records[0].admType} · {records[0].admCat}
              </span>
              {override && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                  Custom Allotted Fee
                </span>
              )}
              <div className="ml-auto flex gap-4 text-xs">
                {allotted !== null ? (
                  <>
                    <span>
                      <span className="text-gray-500">Allotted: </span>
                      <span className="font-semibold text-gray-700">₹{allotted.toLocaleString()}</span>
                      <span className="text-gray-400 font-normal ml-1 text-[10px]">
                        (SMP ₹{smpAllotted.toLocaleString()} | SVK ₹{svkBaseAllotted.toLocaleString()} | Addl ₹{additionalAllotted.toLocaleString()})
                      </span>
                    </span>
                    <span>
                      <span className="text-gray-500">Paid: </span>
                      <span className="font-semibold text-green-700">₹{totalPaid.toLocaleString()}</span>
                      <span className="text-gray-400 font-normal ml-1 text-[10px]">
                        (SMP ₹{smpPaid.toLocaleString()} | SVK ₹{svkBasePaid.toLocaleString()} | Addl ₹{additionalPaidTotal.toLocaleString()})
                      </span>
                    </span>
                    <span>
                      <span className="text-gray-500">Due: </span>
                      <span className={`font-semibold ${due! > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{due!.toLocaleString()}
                      </span>
                      <span className="text-gray-400 font-normal ml-1 text-[10px]">
                        (SMP ₹{smpDue.toLocaleString()} | SVK ₹{svkDue.toLocaleString()} | Addl ₹{additionalDue.toLocaleString()})
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      <span className="text-gray-500">Paid: </span>
                      <span className="font-semibold text-green-700">₹{totalPaid.toLocaleString()}</span>
                    </span>
                    <span className="text-yellow-600 text-[10px] self-center">No fee structure configured</span>
                  </>
                )}
              </div>
            </div>

            {/* Receipts table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Date', 'SMP Rpt', 'SVK Rpt', 'Addl Rpt', 'Mode', 'Remarks', 'SMP (₹)', 'SVK (₹)', 'Addl (₹)', 'Total (₹)'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-3 py-1.5 font-semibold text-gray-600 whitespace-nowrap ${i >= 6 ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((r) => {
                    const rowSmpTotal = sumSMPRecord(r.smp);
                    const rowSvkBase = r.svk;
                    const rowAddlTotal = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
                    const rowTotal = rowSmpTotal + rowSvkBase + rowAddlTotal;
                    const badge = (mode: typeof r.paymentMode) => (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${mode === 'CASH' ? 'bg-amber-50 text-amber-700' : 'bg-purple-50 text-purple-700'}`}>
                        {mode}
                      </span>
                    );
                    const hasPerSection = r.smpPaymentMode !== undefined || r.svkPaymentMode !== undefined || r.additionalPaymentMode !== undefined;
                    const smpMode = r.smpPaymentMode ?? r.paymentMode;
                    const svkMode = r.svkPaymentMode ?? r.paymentMode;
                    const addlMode = r.additionalPaymentMode ?? r.paymentMode;

                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                          {r.date.split('-').reverse().join('-')}
                        </td>
                        <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{r.receiptNumber || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{r.svkReceiptNumber || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{r.additionalReceiptNumber || '—'}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {!hasPerSection ? badge(r.paymentMode) : (() => {
                            const activeModes = [
                              ...(rowSmpTotal > 0 ? [smpMode] : []),
                              ...(rowSvkBase > 0 ? [svkMode] : []),
                              ...(rowAddlTotal > 0 ? [addlMode] : []),
                            ];
                            if (activeModes.length > 0 && activeModes.every((m) => m === activeModes[0])) {
                              return badge(activeModes[0]);
                            }
                            return (
                              <div className="flex flex-col gap-0.5">
                                {rowSmpTotal > 0 && <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${smpMode === 'CASH' ? 'bg-amber-50 text-amber-700' : 'bg-purple-50 text-purple-700'}`}>SMP:{smpMode}</span>}
                                {rowSvkBase > 0 && <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${svkMode === 'CASH' ? 'bg-amber-50 text-amber-700' : 'bg-purple-50 text-purple-700'}`}>SVK:{svkMode}</span>}
                                {rowAddlTotal > 0 && <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${addlMode === 'CASH' ? 'bg-amber-50 text-amber-700' : 'bg-purple-50 text-purple-700'}`}>Addl:{addlMode}</span>}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500 max-w-[8rem] truncate">{r.remarks || '—'}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700 whitespace-nowrap">{rowSmpTotal.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700 whitespace-nowrap">{rowSvkBase.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700 whitespace-nowrap">{rowAddlTotal > 0 ? rowAddlTotal.toLocaleString() : '—'}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-gray-900 whitespace-nowrap">{rowTotal.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={6} className="px-3 py-1.5 text-xs font-semibold text-gray-600">
                      {records.length} receipt{records.length > 1 ? 's' : ''}
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-800">
                      {records.reduce((s, r) => s + sumSMPRecord(r.smp), 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-800">
                      {records.reduce((s, r) => s + r.svk, 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-800">
                      {records.reduce((s, r) => s + r.additionalPaid.reduce((a, h) => a + h.amount, 0), 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-semibold text-green-700">
                      ₹{totalPaid.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pending dues breakdown */}
            {ev && (
              <div className="border-t border-gray-200 px-3 py-2 bg-gray-50">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Pending Dues Breakdown
                  {override && !structure && (
                    <span className="ml-1 normal-case text-amber-600">(using custom allotted fee)</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {SMP_FEE_HEADS.map(({ key, label }) => {
                    const allottedAmt = key === 'fine' ? fine : ev.smp[key];
                    const paidAmt = records.reduce((s, r) => s + r.smp[key], 0);
                    const dueAmt = allottedAmt - paidAmt;
                    if (allottedAmt === 0) return null;
                    return (
                      <span key={key}>
                        <span className="text-gray-500">{label}: </span>
                        <span className={dueAmt > 0 ? 'font-medium text-red-600' : 'font-medium text-green-600'}>
                          ₹{dueAmt.toLocaleString()}
                        </span>
                      </span>
                    );
                  })}
                  {ev.svk > 0 && (() => {
                    const svkPd = records.reduce((s, r) => s + r.svk, 0);
                    const svkDueAmt = ev.svk - svkPd;
                    return (
                      <span key="svk">
                        <span className="text-gray-500">SVK: </span>
                        <span className={svkDueAmt > 0 ? 'font-medium text-red-600' : 'font-medium text-green-600'}>
                          ₹{svkDueAmt.toLocaleString()}
                        </span>
                      </span>
                    );
                  })()}
                  {ev.additional.length > 0 && (
                    <span className="w-full text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Additional:</span>
                  )}
                  {ev.additional.map((h) => {
                    const paidAmt = records.reduce(
                      (s, r) => s + (r.additionalPaid.find((ap) => ap.label === h.label)?.amount ?? 0),
                      0,
                    );
                    const dueAmt = h.amount - paidAmt;
                    if (h.amount === 0) return null;
                    return (
                      <span key={h.label}>
                        <span className="text-gray-500">{h.label}: </span>
                        <span className={dueAmt > 0 ? 'font-medium text-red-600' : 'font-medium text-green-600'}>
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
      })}

      {/* Overall summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="font-semibold text-gray-600 self-center">Overall:</span>
        <span>
          <span className="text-gray-500">Total Allotted: </span>
          <span className="font-semibold text-gray-900">₹{overallAllotted.toLocaleString()}</span>
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
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

type Tab = 'profile' | 'documents' | 'fee';

interface Props {
  student: Student;
  onClose: () => void;
}

export function StudentDetailModal({ student, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Fee history state — lazy-loaded on first visit to fee tab
  const [yearData, setYearData] = useState<YearData[]>([]);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeLoaded, setFeeLoaded] = useState(false);

  // Documents — load eagerly (single Firestore doc, cheap)
  const { docs, loading: docsLoading, error: docsError } = useStudentDocuments(student.id);

  // Lazy-load fee history when fee tab first activated
  useEffect(() => {
    if (activeTab !== 'fee' || feeLoaded) return;
    setFeeLoading(true);

    Promise.all([
      getAllFeeRecordsByStudent(student.id),
      student.regNumber
        ? getAllFeeRecordsByRegNumber(student.regNumber)
        : Promise.resolve([] as FeeRecord[]),
    ])
      .then(([byId, byReg]) => {
        const seen = new Set<string>();
        const merged: FeeRecord[] = [];
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
        const latestAY = [...grouped.keys()].sort().at(-1);
        const data: YearData[] = await Promise.all(
          [...grouped.entries()].map(async ([ay, recs]) => {
            const first = recs[0];
            const isLatest = ay === latestAY;
            const structure =
              await getFeeStructure(ay, first.course, first.year, first.admType, first.admCat)
              ?? (isLatest
                ? await getFeeStructure(ay, first.course, first.year, student.admType as AdmType, student.admCat as AdmCat)
                : null);
            const override = await getFeeOverride(first.studentId, ay);
            const sorted = [...recs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return { academicYear: ay, records: sorted, structure: structure ?? null, override };
          }),
        );
        data.sort((a, b) => b.academicYear.localeCompare(a.academicYear));
        setYearData(data);
      })
      .catch((err: unknown) => {
        setFeeError(err instanceof Error ? err.message : 'Failed to load fee history');
      })
      .finally(() => { setFeeLoading(false); setFeeLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, feeLoaded]);

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Overall fee stats
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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile',   label: 'Profile' },
    { id: 'documents', label: 'Documents' },
    { id: 'fee',       label: 'Fee History' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-5xl flex flex-col"
        style={{ animation: 'modal-enter 0.25s ease-out', maxHeight: 'calc(100vh - 3rem)' }}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-start justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{student.studentNameSSLC}</h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
              {student.regNumber && (
                <span className="text-xs text-gray-500">
                  Reg: <span className="text-gray-700 font-medium">{student.regNumber}</span>
                </span>
              )}
              <span className="text-xs text-gray-500">{student.course} · {student.year} · {student.academicYear}</span>
              <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-semibold ${
                student.admissionStatus === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                student.admissionStatus === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {student.admissionStatus}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer shrink-0 ml-3 mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 shrink-0 px-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                activeTab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — flex-1 + overflow-y-auto keeps it within the modal height */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'profile' && <ProfileTab student={student} />}
          {activeTab === 'documents' && (
            <DocumentsTab docs={docs} loading={docsLoading} error={docsError} />
          )}
          {activeTab === 'fee' && (
            <FeeTab
              yearData={yearData}
              loading={feeLoading}
              error={feeError}
              overallAllotted={overallAllotted}
              overallFine={overallFine}
              overallPaid={overallPaid}
              overallDue={overallDue}
            />
          )}
        </div>

        {/* Footer */}
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
