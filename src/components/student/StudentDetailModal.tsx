import { useState, useEffect } from 'react';
import { getAllFeeRecordsByStudent, getAllFeeRecordsByRegNumber } from '../../services/feeRecordService';
import { getFeeStructure } from '../../services/feeStructureService';
import { getFeeOverride } from '../../services/feeOverrideService';
import { getTcRecordsByStudent, type TCRecord } from '../../services/tcService';
import { getPcRecordsByStudent, type PCRecord } from '../../services/pcService';
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

const FEE_PALETTE = {
  noDues:  { headerBg: 'bg-emerald-100', headerBorder: 'border-emerald-200', cardBorder: 'border-emerald-300', badgeBg: 'bg-emerald-700', divider: 'border-emerald-300', duesBg: 'bg-emerald-50' },
  hasDues: { headerBg: 'bg-red-100',     headerBorder: 'border-red-200',     cardBorder: 'border-red-300',     badgeBg: 'bg-red-700',     divider: 'border-red-300',     duesBg: 'bg-red-50'     },
};

// ─── Shared sub-components ───────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </h4>
  );
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

function ProfileSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-gray-100 overflow-hidden`}>
      <div className={`px-4 py-2 ${accent} flex items-center gap-2`}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-current opacity-70">{title}</span>
      </div>
      <div className="px-4 py-4 bg-white">
        {children}
      </div>
    </section>
  );
}

function PField({ label, value, wide }: { label: string; value: string | number | null | undefined; wide?: boolean }) {
  const display = (value === null || value === undefined || value === '') ? '—' : String(value);
  const isEmpty = display === '—';
  return (
    <div className={wide ? 'col-span-2 sm:col-span-3' : ''}>
      <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 leading-tight mb-0.5">{label}</dt>
      <dd className={`text-xs leading-snug ${isEmpty ? 'text-gray-300' : 'text-gray-800 font-medium'}`}>{display}</dd>
    </div>
  );
}

function ProfileTab({ student: s }: { student: Student }) {
  const sslcPct = s.sslcMaxTotal > 0
    ? ((s.sslcObtainedTotal / s.sslcMaxTotal) * 100)
    : null;
  const msPct = s.mathsScienceMaxTotal > 0
    ? ((s.mathsScienceObtainedTotal / s.mathsScienceMaxTotal) * 100)
    : null;

  const admStatusColor =
    s.admissionStatus === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    s.admissionStatus === 'CANCELLED' ? 'bg-red-100 text-red-700 border-red-200' :
    'bg-yellow-100 text-yellow-700 border-yellow-200';

  return (
    <div className="px-5 py-4 space-y-3">

      {/* Personal */}
      <ProfileSection title="Personal Information" accent="bg-blue-50 text-blue-600">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3.5">
          <PField label="Name (SSLC)" value={s.studentNameSSLC} />
          <PField label="Name (Aadhaar)" value={s.studentNameAadhar} />
          <PField label="Date of Birth" value={s.dateOfBirth ? s.dateOfBirth.split('-').reverse().join('-') : ''} />
          <PField label="Gender" value={s.gender} />
          <PField label="Religion" value={s.religion} />
          <PField label="Caste" value={s.caste} />
          <PField label="Category" value={s.category} />
          <PField label="Annual Income" value={s.annualIncome ? `₹${Number(s.annualIncome).toLocaleString()}` : ''} />
        </dl>
      </ProfileSection>

      {/* Contact */}
      <ProfileSection title="Contact Details" accent="bg-violet-50 text-violet-600">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3.5">
          <PField label="Father's Name" value={s.fatherName} />
          <PField label="Mother's Name" value={s.motherName} />
          <PField label="Father Mobile" value={s.fatherMobile} />
          <PField label="Student Mobile" value={s.studentMobile} />
          <div className="col-span-2 sm:col-span-4">
            <PField label="Address" value={s.address} />
          </div>
          <PField label="Town / City" value={s.town} />
          <PField label="Taluk" value={s.taluk} />
          <PField label="District" value={s.district} />
        </dl>
      </ProfileSection>

      {/* Academic */}
      <ProfileSection title="Academic Details" accent="bg-emerald-50 text-emerald-600">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3.5">
          <PField label="Course" value={s.course} />
          <PField label="Study Year" value={s.year} />
          <PField label="Academic Year" value={s.academicYear} />
          <div>
            <dt className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 leading-tight mb-0.5">Admission Status</dt>
            <dd>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${admStatusColor}`}>
                {s.admissionStatus}
              </span>
            </dd>
          </div>
          <PField label="Admission Type" value={s.admType} />
          <PField label="Admission Category" value={s.admCat} />
          <PField label="Merit Number" value={s.meritNumber} />
          <PField label="Register Number" value={s.regNumber} />
          <PField label="10th Board" value={s.tenthBoard} />
          <PField label="Prior Qualification" value={s.priorQualification} />
        </dl>
      </ProfileSection>

      {/* Marks */}
      <ProfileSection title="Marks Details" accent="bg-amber-50 text-amber-600">
        {(() => {
          const sciPct  = s.scienceMax > 0 ? (s.scienceObtained / s.scienceMax) * 100 : null;
          const mathPct = s.mathsMax > 0   ? (s.mathsObtained   / s.mathsMax)   * 100 : null;
          const bars = [
            { label: 'SSLC',    obtained: s.sslcObtainedTotal,        max: s.sslcMaxTotal,        pct: sslcPct, color: 'bg-blue-500',    track: 'bg-blue-50',    textColor: 'text-blue-700'    },
            { label: 'Science', obtained: s.scienceObtained,          max: s.scienceMax,          pct: sciPct,  color: 'bg-emerald-500', track: 'bg-emerald-50', textColor: 'text-emerald-700' },
            { label: 'Maths',   obtained: s.mathsObtained,            max: s.mathsMax,            pct: mathPct, color: 'bg-violet-500',  track: 'bg-violet-50',  textColor: 'text-violet-700'  },
            { label: 'M + S',   obtained: s.mathsScienceObtainedTotal, max: s.mathsScienceMaxTotal, pct: msPct,  color: 'bg-amber-500',  track: 'bg-amber-50',   textColor: 'text-amber-700'   },
          ];
          const priorPct = s.priorQualification === 'ITI' ? s.itiPercentage
                         : s.priorQualification === 'PUC' ? s.pucPercentage
                         : null;
          const sortedBars = [...bars].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
          return (
            <div className="flex items-stretch pt-1">

              {/* ── Bar chart (left half) ────────────────────────── */}
              <div className="w-1/2 flex flex-col justify-end pr-4">
                <div className="flex items-end">
                {sortedBars.map(({ label, obtained, max, pct, color, track, textColor }, idx) => (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1 px-1.5">
                    <span className={`text-[10px] font-bold tabular-nums ${pct !== null ? textColor : 'text-gray-300'}`}>
                      {pct !== null ? `${pct.toFixed(1)}%` : '—'}
                    </span>
                    <div className={`relative rounded-lg overflow-hidden h-20 w-full ${track} border border-gray-100`}>
                      <div
                        className={`absolute bottom-0 left-0 right-0 ${color} rounded-t-md`}
                        style={{
                          height: pct !== null ? `${Math.min(pct, 100)}%` : '0%',
                          transformOrigin: 'bottom',
                          animation: `bar-grow 0.45s ease-out ${idx * 55}ms both`,
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-gray-500 tabular-nums font-medium text-center leading-tight">
                      {obtained || '—'}/{max || '—'}
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 text-center leading-tight">
                      {label}
                    </span>
                  </div>
                ))}
                </div>
              </div>

              {/* ── Details (right half) ────────────────────────── */}
              <div className="w-1/2 space-y-2.5 border-l border-gray-100 pl-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">10th Board</div>
                    <div className="text-xs font-medium text-gray-800 mt-0.5">{s.tenthBoard || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">SSLC Total</div>
                    <div className="text-xs font-medium text-gray-800 mt-0.5">
                      {s.sslcObtainedTotal || '—'} / {s.sslcMaxTotal || '—'}
                      {sslcPct !== null && <span className="ml-1.5 text-blue-600 font-bold text-[10px]">{sslcPct.toFixed(1)}%</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Science</div>
                    <div className="text-xs font-medium text-gray-800 mt-0.5">
                      {s.scienceObtained || '—'} / {s.scienceMax || '—'}
                      {sciPct !== null && <span className="ml-1.5 text-emerald-600 font-bold text-[10px]">{sciPct.toFixed(1)}%</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Maths</div>
                    <div className="text-xs font-medium text-gray-800 mt-0.5">
                      {s.mathsObtained || '—'} / {s.mathsMax || '—'}
                      {mathPct !== null && <span className="ml-1.5 text-violet-600 font-bold text-[10px]">{mathPct.toFixed(1)}%</span>}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Maths + Science</div>
                    <div className="text-xs font-medium text-gray-800 mt-0.5">
                      {s.mathsScienceObtainedTotal || '—'} / {s.mathsScienceMaxTotal || '—'}
                      {msPct !== null && <span className="ml-1.5 text-amber-600 font-bold text-[10px]">{msPct.toFixed(1)}%</span>}
                    </div>
                  </div>
                </div>

                {s.priorQualification !== 'NONE' && (
                  <div className="border-t border-gray-100 pt-2.5 flex items-center gap-5">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Prior Qualification</div>
                      <div className="text-xs font-medium text-gray-800 mt-0.5">{s.priorQualification}</div>
                    </div>
                    {priorPct !== null && priorPct > 0 && (
                      <div>
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{s.priorQualification} %</div>
                        <div className="text-sm font-bold text-indigo-700 mt-0.5">{priorPct.toFixed(1)}%</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          );
        })()}
      </ProfileSection>

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
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-yellow-100 text-yellow-700'
        }`}>
          {submittedCount} / {REQUIRED_DOCS.length} submitted
        </span>
      </div>
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
        {REQUIRED_DOCS.map((d) => {
          const entry = docs?.[d.key];
          const submitted = entry?.submitted ?? false;
          const returned = entry?.returned ?? false;
          return (
            <div key={d.key} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
              }`}>
                {submitted ? '✓' : '○'}
              </span>
              <span className={`flex-1 text-xs ${submitted ? 'text-gray-800' : 'text-gray-400'}`}>
                {d.label}
              </span>
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
  const [expandedDues, setExpandedDues] = useState<Set<string>>(new Set());

  function toggleDues(ay: string) {
    setExpandedDues((prev) => {
      const next = new Set(prev);
      if (next.has(ay)) next.delete(ay); else next.add(ay);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="px-5 py-4 space-y-4">
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
    );
  }

  if (error) {
    return (
      <div className="px-5 py-10 flex items-center justify-center text-sm text-red-500">{error}</div>
    );
  }

  if (yearData.length === 0) {
    return (
      <div className="px-5 py-12 flex flex-col items-center justify-center gap-2">
        <span className="text-2xl opacity-20">₹</span>
        <span className="text-sm text-gray-400">No fee records found for this student.</span>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Year blocks */}
      {yearData.map((yd, ydIdx) => {
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
                    const hasPerSection = r.smpPaymentMode !== undefined || r.svkPaymentMode !== undefined || r.additionalPaymentMode !== undefined;
                    const smpMode = r.smpPaymentMode ?? r.paymentMode;
                    const svkMode = r.svkPaymentMode ?? r.paymentMode;
                    const addlMode = r.additionalPaymentMode ?? r.paymentMode;
                    const badge = (mode: typeof r.paymentMode) => (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        mode === 'CASH'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-violet-50 text-violet-700 border border-violet-200'
                      }`}>
                        {mode}
                      </span>
                    );

                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap font-medium">
                          {r.date.split('-').reverse().join('-')}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{r.receiptNumber || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{r.svkReceiptNumber || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{r.additionalReceiptNumber || '—'}</td>
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
                                {rowSmpTotal > 0 && (
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${smpMode === 'CASH' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-violet-50 text-violet-700 border border-violet-200'}`}>
                                    SMP · {smpMode}
                                  </span>
                                )}
                                {rowSvkBase > 0 && (
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${svkMode === 'CASH' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-violet-50 text-violet-700 border border-violet-200'}`}>
                                    SVK · {svkMode}
                                  </span>
                                )}
                                {rowAddlTotal > 0 && (
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${addlMode === 'CASH' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-violet-50 text-violet-700 border border-violet-200'}`}>
                                    Addl · {addlMode}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-1.5 text-gray-400 max-w-[8rem] truncate">{r.remarks || '—'}</td>
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

            {/* Pending dues breakdown — collapsible */}
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
      })}

      {/* Overall summary */}
      <div className="flex flex-wrap gap-2" style={{ animation: 'content-enter 0.35s ease-out' }}>
        <div className="flex-1 min-w-[100px] rounded-xl bg-white border border-gray-200 px-3 py-2">
          <div className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Total Allotted</div>
          <div className="text-sm font-bold text-gray-800 mt-0.5">₹{overallAllotted.toLocaleString()}</div>
          {overallFine > 0 && (
            <div className="text-[9px] text-amber-500 mt-0.5">+Fine ₹{overallFine.toLocaleString()}</div>
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
    </div>
  );
}

// ─── TC History tab ───────────────────────────────────────────────────────────

function TcHistoryTab({ records, loading }: { records: TCRecord[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="px-6 py-5 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="h-10 bg-gray-50 animate-pulse" />
            <div className="px-4 py-3 grid grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map((j) => <div key={j} className="h-6 bg-gray-100 rounded animate-pulse" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 px-6">
        <div className="w-14 h-14 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-2xl">
          📜
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-500">No Transfer Certificates Issued</p>
          <p className="text-xs text-gray-400 mt-0.5">TC records will appear here once generated for this student.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
          records.length > 1
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          {records.length} TC{records.length > 1 ? 's' : ''} issued
          {records.some((r) => r.isDuplicate) ? ' · includes duplicate' : ''}
        </span>
      </div>

      {/* Record cards */}
      <div className="space-y-3">
        {records.map((r, idx) => {
          const isDup = r.isDuplicate;
          return (
            <div
              key={r.id}
              className={`rounded-xl border overflow-hidden shadow-sm border-l-4 ${
                isDup ? 'border-amber-200 border-l-amber-400' : 'border-purple-200 border-l-purple-400'
              }`}
            >
              {/* Card header */}
              <div className={`px-4 py-2.5 flex items-center justify-between ${isDup ? 'bg-amber-50' : 'bg-purple-50'}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`text-sm font-bold ${isDup ? 'text-amber-800' : 'text-purple-800'}`}>
                    TC #{r.tcNumber}
                  </span>
                  {idx === 0 && records.length > 1 && (
                    <span className="text-[10px] text-gray-400 font-medium">· Latest</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                    isDup
                      ? 'bg-amber-100 text-amber-700 border-amber-300'
                      : 'bg-purple-100 text-purple-700 border-purple-300'
                  }`}>
                    {isDup ? 'Duplicate Copy' : 'Original'}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    Issued {new Date(r.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Card body */}
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

      {records.length > 1 && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>Multiple TCs issued for this student. Any further TC must be a <strong>Duplicate Copy</strong>.</span>
        </div>
      )}
    </div>
  );
}

// ─── PC History tab ───────────────────────────────────────────────────────────

function PcHistoryTab({ records, loading }: { records: PCRecord[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="px-6 py-5 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="h-10 bg-gray-50 animate-pulse" />
            <div className="px-4 py-3 grid grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map((j) => <div key={j} className="h-6 bg-gray-100 rounded animate-pulse" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 px-6">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-2xl">
          🎓
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-500">No Provisional Certificates Issued</p>
          <p className="text-xs text-gray-400 mt-0.5">PC records will appear here once generated for this student.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
          records.length > 1
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {records.length} PC{records.length > 1 ? 's' : ''} issued
          {records.some((r) => r.isDuplicate) ? ' · includes duplicate' : ''}
        </span>
      </div>

      {/* Record cards */}
      <div className="space-y-3">
        {records.map((r, idx) => {
          const isDup = r.isDuplicate;
          return (
            <div
              key={r.id}
              className={`rounded-xl border overflow-hidden shadow-sm border-l-4 ${
                isDup ? 'border-amber-200 border-l-amber-400' : 'border-emerald-200 border-l-emerald-400'
              }`}
            >
              {/* Card header */}
              <div className={`px-4 py-2.5 flex items-center justify-between ${isDup ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`text-sm font-bold ${isDup ? 'text-amber-800' : 'text-emerald-800'}`}>
                    {r.examPeriod}
                  </span>
                  {idx === 0 && records.length > 1 && (
                    <span className="text-[10px] text-gray-400 font-medium">· Latest</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                    isDup
                      ? 'bg-amber-100 text-amber-700 border-amber-300'
                      : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                  }`}>
                    {isDup ? 'Duplicate Copy' : 'Original'}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    Issued {new Date(r.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Card body */}
              <div className="px-4 py-3 bg-white grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
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

      {records.length > 1 && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>Multiple PCs issued for this student. Any further PC must be a <strong>Duplicate Copy</strong>.</span>
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

type Tab = 'profile' | 'documents' | 'fee' | 'tc' | 'pc';

const TAB_COLORS: Record<Tab, string> = {
  profile:   'border-blue-500 text-blue-600',
  documents: 'border-amber-500 text-amber-600',
  fee:       'border-emerald-500 text-emerald-600',
  tc:        'border-purple-500 text-purple-600',
  pc:        'border-rose-500 text-rose-600',
};

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

  // TC history state — lazy-loaded on first visit to tc tab
  const [tcRecords, setTcRecords] = useState<TCRecord[]>([]);
  const [tcLoading, setTcLoading] = useState(false);
  const [tcLoaded,  setTcLoaded]  = useState(false);

  // PC history state — lazy-loaded on first visit to pc tab
  const [pcRecords, setPcRecords] = useState<PCRecord[]>([]);
  const [pcLoading, setPcLoading] = useState(false);
  const [pcLoaded,  setPcLoaded]  = useState(false);

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

  // Lazy-load TC history when tc tab first activated
  useEffect(() => {
    if (activeTab !== 'tc' || tcLoaded) return;
    setTcLoading(true);
    getTcRecordsByStudent(student.id)
      .then((records) => setTcRecords(records))
      .catch(() => { /* non-fatal */ })
      .finally(() => { setTcLoading(false); setTcLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tcLoaded]);

  // Lazy-load PC history when pc tab first activated
  useEffect(() => {
    if (activeTab !== 'pc' || pcLoaded) return;
    setPcLoading(true);
    getPcRecordsByStudent(student.id)
      .then((records) => setPcRecords(records))
      .catch(() => { /* non-fatal */ })
      .finally(() => { setPcLoading(false); setPcLoaded(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, pcLoaded]);

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Overall fee stats (computed once fee is loaded)
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

  // Header gradient: slate until fee loads, then green/red
  const headerGradient = feeLoaded && !feeError && yearData.length > 0
    ? overallDue > 0
      ? 'from-red-600 to-red-800'
      : 'from-emerald-600 to-emerald-800'
    : 'from-slate-700 to-slate-900';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile',   label: 'Profile' },
    { id: 'documents', label: 'Docs History' },
    { id: 'fee',       label: 'Fee History' },
    { id: 'tc',        label: 'TC History' },
    { id: 'pc',        label: 'PC History' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[calc(100vh-3rem)] min-h-[580px]"
        style={{ animation: 'modal-enter 0.25s ease-out' }}
      >
        {/* Gradient header */}
        <div className={`px-5 py-3.5 bg-gradient-to-r ${headerGradient} flex items-start justify-between shrink-0 transition-all duration-500`}>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">{student.studentNameSSLC}</h3>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              {student.regNumber && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 border border-white/30 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                  Reg: {student.regNumber}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 border border-white/30 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                {student.course} · {student.year} · {student.academicYear}
              </span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                student.admissionStatus === 'CONFIRMED'
                  ? 'bg-emerald-400/30 text-white border border-emerald-300/40'
                  : student.admissionStatus === 'CANCELLED'
                    ? 'bg-red-400/30 text-white border border-red-300/40'
                    : 'bg-yellow-400/30 text-white border border-yellow-300/40'
              }`}>
                {student.admissionStatus}
              </span>
              {feeLoaded && !feeError && yearData.length > 0 && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-white/20 border border-white/30 text-white`}>
                  {overallDue > 0 ? `Due ₹${overallDue.toLocaleString()}` : '✓ No Dues'}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 mt-0.5 ml-3"
          >
            ×
          </button>
        </div>

        {/* Student info bar */}
        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {[
              { label: 'Father',    value: student.fatherName },
              { label: 'Mobile',    value: student.fatherMobile || student.studentMobile || '—' },
              { label: 'Adm Type', value: student.admType },
              { label: 'Cat',       value: student.admCat },
              { label: 'Religion',  value: student.religion },
              { label: 'Gender',    value: student.gender },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col min-w-0">
                <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{label}</span>
                <span className="text-xs text-gray-700 truncate">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 shrink-0 px-5 bg-white">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                activeTab === t.id
                  ? TAB_COLORS[t.id]
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
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
          {activeTab === 'tc' && (
            <TcHistoryTab records={tcRecords} loading={tcLoading} />
          )}
          {activeTab === 'pc' && (
            <PcHistoryTab records={pcRecords} loading={pcLoading} />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
