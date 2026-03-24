import { useState, useEffect, useMemo } from 'react';
import { getFeeStructure } from '../../services/feeStructureService';
import {
  getFeeRecordsByStudent,
  saveFeeRecord,
  getNextReceiptNumber,
  getNextSvkReceiptNumber,
  getNextAdditionalReceiptNumber,
} from '../../services/feeRecordService';
import { getFeeOverride, saveFeeOverride } from '../../services/feeOverrideService';
import { getFineSchedule } from '../../services/fineScheduleService';
import { Button } from '../common/Button';
import type {
  Student,
  FeeStructure,
  FeeRecord,
  AcademicYear,
  SMPFeeHead,
  SMPHeads,
  FeeAdditionalHead,
  FinePeriod,
  PaymentMode,
  StudentFeeOverride,
} from '../../types';
import { SMP_FEE_HEADS } from '../../types';

function emptySMP(): SMPHeads {
  return {
    adm: 0, tuition: 0, lib: 0, rr: 0, sports: 0, lab: 0,
    dvp: 0, mag: 0, idCard: 0, ass: 0, swf: 0, twf: 0, nss: 0, fine: 0,
  };
}

function sumSMP(smp: SMPHeads): number {
  return SMP_FEE_HEADS.reduce((s, { key }) => s + smp[key], 0);
}

function sumArr(arr: FeeAdditionalHead[]): number {
  return arr.reduce((s, h) => s + h.amount, 0);
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns the fine amount for a given date from the schedule, or 0 if no period matches. */
function lookupFine(date: string, schedule: FinePeriod[]): number {
  for (const p of schedule) {
    if (p.from && p.to && date >= p.from && date <= p.to) return p.amount;
  }
  return 0;
}

interface Props {
  student: Student;
  academicYear: AcademicYear;
  onClose: () => void;
  onSaved: () => void;
}

const ni =
  'w-full rounded border border-gray-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

export function FeeCollectionModal({ student, academicYear, onClose, onSaved }: Props) {
  const [structure, setStructure] = useState<FeeStructure | null>(null);
  /** All prior payment records for this student in this year */
  const [priorPayments, setPriorPayments] = useState<FeeRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Per-student allotted fee override ────────────────────────────────────
  const [loadedOverride, setLoadedOverride] = useState<StudentFeeOverride | null>(null);
  const [editingAllotted, setEditingAllotted] = useState(false);
  const [overrideSmp, setOverrideSmp] = useState<SMPHeads>(emptySMP());
  const [overrideSvk, setOverrideSvk] = useState(0);
  const [overrideAdditional, setOverrideAdditional] = useState<FeeAdditionalHead[]>([]);
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideSaveError, setOverrideSaveError] = useState<string | null>(null);

  /** Amounts being collected in THIS payment session */
  const [smpNow, setSmpNow] = useState<SMPHeads>(emptySMP());
  const [svkNow, setSvkNow] = useState(0);
  const [additionalNow, setAdditionalNow] = useState<FeeAdditionalHead[]>([]);
  const [date, setDate] = useState(today());
  const [receiptNo, setReceiptNo] = useState('');
  const [svkReceiptNo, setSvkReceiptNo] = useState('');
  const [additionalReceiptNo, setAdditionalReceiptNo] = useState('');
  const [smpPaymentMode, setSmpPaymentMode] = useState<PaymentMode>('CASH');
  const [svkPaymentMode, setSvkPaymentMode] = useState<PaymentMode>('CASH');
  const [additionalPaymentMode, setAdditionalPaymentMode] = useState<PaymentMode>('CASH');
  const [fineSchedule, setFineSchedule] = useState<FinePeriod[]>([]);
  const [remarks, setRemarks] = useState('');

  // ── Cumulative paid so far (derived from priorPayments) ───────────────────
  const cumulativeSmp = useMemo<SMPHeads>(() => {
    const smp = emptySMP();
    for (const r of priorPayments) {
      for (const { key } of SMP_FEE_HEADS) smp[key] += r.smp[key];
    }
    return smp;
  }, [priorPayments]);

  const cumulativeSvk = useMemo(
    () => priorPayments.reduce((s, r) => s + r.svk, 0),
    [priorPayments]
  );

  const cumulativeAdditional = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of priorPayments) {
      for (const h of r.additionalPaid) {
        map.set(h.label, (map.get(h.label) ?? 0) + h.amount);
      }
    }
    return map;
  }, [priorPayments]);

  useEffect(() => {
    Promise.all([
      getFeeStructure(
        academicYear,
        student.course,
        student.year,
        student.admType,
        student.admCat
      ),
      getFeeRecordsByStudent(student.id, academicYear),
      getNextReceiptNumber(academicYear),
      getNextSvkReceiptNumber(academicYear),
      getNextAdditionalReceiptNumber(academicYear),
      getFineSchedule(academicYear),
      getFeeOverride(student.id, academicYear),
    ])
      .then(([struct, prior, nextRpt, nextSvkRpt, nextAddlRpt, schedule, override]) => {
        setStructure(struct);
        setPriorPayments(prior);
        setReceiptNo(nextRpt);
        setSvkReceiptNo(nextSvkRpt);
        setAdditionalReceiptNo(nextAddlRpt);
        setFineSchedule(schedule);
        setLoadedOverride(override);

        // Effective allotted: override takes precedence over structure
        const effSmp = override ? override.smp : struct?.smp;
        const effSvk = override ? override.svk : struct?.svk;
        const effAdditional = override ? override.additionalHeads : struct?.additionalHeads;

        if (effSmp !== undefined) {
          // Compute cumulative from prior payments
          const cumSmp = emptySMP();
          for (const r of prior) {
            for (const { key } of SMP_FEE_HEADS) cumSmp[key] += r.smp[key];
          }
          const cumSvk = prior.reduce((s, r) => s + r.svk, 0);

          // Pre-fill with remaining balance (allotted − already paid)
          const fineExempt =
            (student.year === '1ST YEAR' && (student.admType === 'REGULAR' || student.admType === 'SNQ')) ||
            (student.year === '2ND YEAR' && student.admType === 'LATERAL');
          const remaining = emptySMP();
          for (const { key } of SMP_FEE_HEADS) {
            remaining[key] = key === 'fine' && fineExempt ? 0 : Math.max(0, effSmp[key] - cumSmp[key]);
          }
          setSmpNow(remaining);
          setSvkNow(Math.max(0, (effSvk ?? 0) - cumSvk));
          setAdditionalNow(
            (effAdditional ?? []).map((h) => {
              const prevPaid = prior.reduce(
                (s, r) =>
                  s + (r.additionalPaid.find((ap) => ap.label === h.label)?.amount ?? 0),
                0
              );
              return { label: h.label, amount: Math.max(0, h.amount - prevPaid) };
            })
          );
        }
        // If neither structure nor override: everything stays 0
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load fee data');
      })
      .finally(() => setLoadingData(false));
  }, [academicYear, student.course, student.id, student.year, student.admType, student.admCat]);

  // Fine is exempt for: 1st Year Regular/SNQ (all courses), 2nd Year Lateral (all courses).
  const isFineExempt =
    (student.year === '1ST YEAR' && (student.admType === 'REGULAR' || student.admType === 'SNQ')) ||
    (student.year === '2ND YEAR' && student.admType === 'LATERAL');

  // Auto-fill Fine from the year-level schedule whenever date or schedule changes.
  // Skip when a custom override specifies its own fine — the override is authoritative.
  useEffect(() => {
    if (!fineSchedule.length || !date || isFineExempt) return;
    if (loadedOverride !== undefined && loadedOverride !== null) return;
    const fine = lookupFine(date, fineSchedule);
    setSmpNow((prev) => ({ ...prev, fine }));
  }, [date, fineSchedule, isFineExempt, loadedOverride]);

  function handleSMPChange(key: SMPFeeHead, val: string) {
    setSmpNow((prev) => ({ ...prev, [key]: Math.max(0, parseInt(val) || 0) }));
  }

  function handleAdditionalChange(idx: number, val: string) {
    setAdditionalNow((prev) =>
      prev.map((h, i) =>
        i === idx ? { ...h, amount: Math.max(0, parseInt(val) || 0) } : h
      )
    );
  }

  // ── Override allotted handlers ────────────────────────────────────────────
  function startEditAllotted() {
    const src = loadedOverride ?? (structure
      ? { smp: structure.smp, svk: structure.svk, additionalHeads: structure.additionalHeads }
      : null);
    if (!src) return;
    setOverrideSmp({ ...src.smp });
    setOverrideSvk(src.svk);
    setOverrideAdditional(src.additionalHeads.map((h) => ({ ...h })));
    setOverrideSaveError(null);
    setEditingAllotted(true);
  }

  function cancelEditAllotted() {
    setEditingAllotted(false);
    setOverrideSaveError(null);
  }

  async function handleSaveOverride() {
    setSavingOverride(true);
    setOverrideSaveError(null);
    try {
      await saveFeeOverride({
        studentId: student.id,
        academicYear,
        smp: overrideSmp,
        svk: overrideSvk,
        additionalHeads: overrideAdditional,
      });
      const saved: StudentFeeOverride = {
        id: `${student.id}__${academicYear}`,
        studentId: student.id,
        academicYear,
        smp: overrideSmp,
        svk: overrideSvk,
        additionalHeads: overrideAdditional,
        updatedAt: new Date().toISOString(),
      };
      setLoadedOverride(saved);
      setEditingAllotted(false);
    } catch (err: unknown) {
      setOverrideSaveError(err instanceof Error ? err.message : 'Failed to save allotted override');
    } finally {
      setSavingOverride(false);
    }
  }

  // ── Effective allotted: override > structure ───────────────────────────────
  const effSmpValues: SMPHeads = editingAllotted
    ? overrideSmp
    : (loadedOverride?.smp ?? structure?.smp ?? emptySMP());
  const effSvkValue: number = editingAllotted
    ? overrideSvk
    : (loadedOverride?.svk ?? structure?.svk ?? 0);
  const effAdditionalHeads: FeeAdditionalHead[] = editingAllotted
    ? overrideAdditional
    : (loadedOverride?.additionalHeads ?? structure?.additionalHeads ?? []);

  // ── Derived totals ────────────────────────────────────────────────────────
  // Fine is dynamic — the effective allotted fine is whatever has been paid in
  // total (prior + now), so fine payments never produce a negative balance.
  const totalFinePaid = cumulativeSmp.fine + smpNow.fine;
  const hasAllotted = !!(structure || loadedOverride);
  const effectiveFineAllotted = hasAllotted ? Math.max(effSmpValues.fine, totalFinePaid) : 0;
  const smpAllotted = hasAllotted
    ? sumSMP(effSmpValues) - effSmpValues.fine + effectiveFineAllotted
    : 0;
  const svkAllotted = effSvkValue;
  const additionalAllotted = sumArr(effAdditionalHeads);
  const grandAllotted = smpAllotted + svkAllotted + additionalAllotted;

  const smpPreviousTotal = sumSMP(cumulativeSmp);
  const svkPreviousTotal = cumulativeSvk;
  const additionalPreviousTotal = [...cumulativeAdditional.values()].reduce((s, v) => s + v, 0);
  const totalPrevious = smpPreviousTotal + svkPreviousTotal + additionalPreviousTotal;

  const smpNowTotal = sumSMP(smpNow);
  const svkNowTotal = svkNow;
  const additionalNowTotal = sumArr(additionalNow);
  const grandNow = smpNowTotal + svkNowTotal + additionalNowTotal;

  const grandTotal = totalPrevious + grandNow;
  const balance = grandAllotted - grandTotal;

  // ── Save (this installment only — not cumulative) ─────────────────────────
  async function handleSave() {
    if (!date) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveFeeRecord({
        studentId: student.id,
        studentName: student.studentNameSSLC,
        fatherName: student.fatherName,
        regNumber: student.regNumber,
        course: student.course,
        year: student.year,
        admCat: student.admCat,
        admType: student.admType,
        academicYear,
        date,
        receiptNumber: smpNowTotal > 0 ? receiptNo : '',
        svkReceiptNumber: svkNowTotal > 0 ? svkReceiptNo : '',
        additionalReceiptNumber: additionalNowTotal > 0 ? additionalReceiptNo : '',
        // Primary paymentMode = SMP mode if SMP paid, else SVK, else Additional (backward compat)
        paymentMode: smpNowTotal > 0 ? smpPaymentMode : svkNowTotal > 0 ? svkPaymentMode : additionalPaymentMode,
        ...(smpNowTotal > 0 ? { smpPaymentMode } : {}),
        ...(svkNowTotal > 0 ? { svkPaymentMode } : {}),
        ...(additionalNowTotal > 0 ? { additionalPaymentMode } : {}),
        remarks,
        smp: smpNow,
        svk: svkNow,
        additionalPaid: additionalNow,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save fee record');
    } finally {
      setSaving(false);
    }
  }

  const isUpdate = priorPayments.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 pb-6 overflow-y-auto">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
        style={{ animation: 'backdrop-enter 0.2s ease-out' }}
      />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 flex flex-col" style={{ animation: 'modal-enter 0.25s ease-out' }}>

        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-start justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-baseline gap-2">
              {isUpdate ? 'Add Payment Installment' : 'Collect Fee'}
              {isUpdate && !loadingData && grandAllotted > 0 && (
                <span className="text-sm font-bold text-red-600">
                  Due: ₹{(grandAllotted - totalPrevious).toLocaleString()}
                </span>
              )}
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {academicYear}
              {isUpdate && (
                <span className="ml-2 text-amber-600 font-medium">
                  {priorPayments.length} prior payment{priorPayments.length > 1 ? 's' : ''} on record
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Student info + override indicator */}
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
              <span className="text-gray-500">Year: </span>
              <span className="text-gray-700">{student.year}</span>
            </span>
            <span>
              <span className="text-gray-500">Course: </span>
              <span className="text-gray-700">{student.course}</span>
            </span>
            <span>
              <span className="text-gray-500">Cat: </span>
              <span className="text-gray-700">{student.admCat}</span>
            </span>
            <span>
              <span className="text-gray-500">Adm Type: </span>
              <span className="text-gray-700">{student.admType}</span>
            </span>
          </div>

          {/* Override allotted controls */}
          {!loadingData && !loadError && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {loadedOverride && !editingAllotted && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  ✎ Custom allotted fee active
                </span>
              )}
              {!editingAllotted && (structure || loadedOverride) && (
                <button
                  onClick={startEditAllotted}
                  className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  {loadedOverride ? 'Edit Custom Allotted' : 'Override Allotted Fee'}
                </button>
              )}
              {editingAllotted && (
                <>
                  <span className="text-[10px] font-semibold text-amber-700">Editing allotted fee — save separately below</span>
                  <button
                    onClick={cancelEditAllotted}
                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {loadingData ? (
            <div className="space-y-5">
              {/* SMP table skeleton */}
              <div>
                <div className="skeleton h-3 w-36 mb-3 rounded" />
                <div className="border border-gray-200 rounded overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 flex gap-4 border-b border-gray-200">
                    <div className="skeleton h-3 flex-1" />
                    <div className="skeleton h-3 w-20" />
                    <div className="skeleton h-3 w-24" />
                  </div>
                  {Array.from({ length: 14 }).map((_, i) => (
                    <div key={i} className="px-3 py-2 flex gap-4 border-b border-gray-100 last:border-0">
                      <div className="skeleton h-3 flex-1" style={{ width: `${45 + (i % 4) * 10}%` }} />
                      <div className="skeleton h-3 w-20" />
                      <div className="skeleton h-6 w-24 rounded" />
                    </div>
                  ))}
                </div>
              </div>
              {/* SVK skeleton */}
              <div>
                <div className="skeleton h-3 w-28 mb-3 rounded" />
                <div className="border border-gray-200 rounded overflow-hidden">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="px-3 py-2 flex gap-4 border-b border-gray-100 last:border-0">
                      <div className="skeleton h-3 flex-1" />
                      <div className="skeleton h-3 w-20" />
                      <div className="skeleton h-6 w-24 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center py-10 text-sm text-red-500">
              {loadError}
            </div>
          ) : (
            <div className="space-y-5">
              {!structure && !loadedOverride && (
                <div className="rounded bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
                  No fee structure configured for{' '}
                  <strong>
                    {student.course} / {student.year} / {student.admType} / {student.admCat}
                  </strong>{' '}
                  — <strong>{academicYear}</strong>. Set it up in the{' '}
                  <strong>Fee Structure</strong> page first, or use <strong>Override Allotted Fee</strong> above.
                </div>
              )}

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
                      <th className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200 w-24">
                        Allotted (₹)
                      </th>
                      {isUpdate && (
                        <th className="text-right px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 w-24">
                          Paid so far (₹)
                        </th>
                      )}
                      <th className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200 w-28">
                        {isUpdate ? 'Now Paying (₹)' : 'Paying (₹)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {SMP_FEE_HEADS.map(({ key, label }) => (
                      <tr key={key} className={editingAllotted ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-1 text-gray-700">{label}</td>
                        <td className="px-2 py-1">
                          {editingAllotted ? (
                            <input
                              type="number"
                              min="0"
                              value={overrideSmp[key] === 0 ? '' : overrideSmp[key]}
                              onChange={(e) => setOverrideSmp((prev) => ({ ...prev, [key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className={`${ni} border-amber-300 focus:ring-amber-400 focus:border-amber-400`}
                              placeholder="0"
                            />
                          ) : (
                            <span className={`block text-right pr-2 ${loadedOverride ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                              {hasAllotted ? effSmpValues[key].toLocaleString() : '—'}
                            </span>
                          )}
                        </td>
                        {isUpdate && (
                          <td className="px-3 py-1 text-right text-gray-400">
                            {cumulativeSmp[key].toLocaleString()}
                          </td>
                        )}
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            min="0"
                            value={smpNow[key] === 0 ? '' : smpNow[key]}
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
                      <td className="px-3 py-1.5 text-right">{smpAllotted.toLocaleString()}</td>
                      {isUpdate && (
                        <td className="px-3 py-1.5 text-right text-gray-500">
                          {smpPreviousTotal.toLocaleString()}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right text-blue-700">
                        {smpNowTotal.toLocaleString()}
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
                      <th className="text-left px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200">Head</th>
                      <th className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200 w-24">Allotted (₹)</th>
                      {isUpdate && (
                        <th className="text-right px-3 py-1.5 font-semibold text-gray-500 border-b border-gray-200 w-24">Paid so far (₹)</th>
                      )}
                      <th className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200 w-28">
                        {isUpdate ? 'Now Paying (₹)' : 'Paying (₹)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr className={editingAllotted ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-1 text-gray-700">SVK</td>
                      <td className="px-2 py-1">
                        {editingAllotted ? (
                          <input
                            type="number"
                            min="0"
                            value={overrideSvk === 0 ? '' : overrideSvk}
                            onChange={(e) => setOverrideSvk(Math.max(0, parseInt(e.target.value) || 0))}
                            className={`${ni} border-amber-300 focus:ring-amber-400 focus:border-amber-400`}
                            placeholder="0"
                          />
                        ) : (
                          <span className={`block text-right pr-2 ${loadedOverride ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                            {hasAllotted ? effSvkValue.toLocaleString() : '—'}
                          </span>
                        )}
                      </td>
                      {isUpdate && (
                        <td className="px-3 py-1 text-right text-gray-400">
                          {cumulativeSvk.toLocaleString()}
                        </td>
                      )}
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          value={svkNow === 0 ? '' : svkNow}
                          onChange={(e) => setSvkNow(Math.max(0, parseInt(e.target.value) || 0))}
                          className={ni}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-800">
                      <td className="px-3 py-1.5">Total SVK</td>
                      <td className="px-3 py-1.5 text-right">{svkAllotted.toLocaleString()}</td>
                      {isUpdate && (
                        <td className="px-3 py-1.5 text-right text-gray-500">
                          {svkPreviousTotal.toLocaleString()}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right text-blue-700">
                        {svkNowTotal.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Additional Fee table */}
              {(additionalNow.length > 0 || (editingAllotted && effAdditionalHeads.length > 0)) && (
                <div>
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Additional Fee
                  </div>
                  <table className="w-full text-xs border border-green-200 rounded overflow-hidden">
                    <thead className="bg-green-50">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-semibold text-gray-600 border-b border-green-200">Head</th>
                        <th className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b border-green-200 w-24">Allotted (₹)</th>
                        {isUpdate && (
                          <th className="text-right px-3 py-1.5 font-semibold text-gray-500 border-b border-green-200 w-24">Paid so far (₹)</th>
                        )}
                        <th className="text-right px-3 py-1.5 font-semibold text-gray-600 border-b border-green-200 w-28">
                          {isUpdate ? 'Now Paying (₹)' : 'Paying (₹)'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {effAdditionalHeads.map((ah, idx) => {
                        const nowEntry = additionalNow.find((h) => h.label === ah.label);
                        const nowIdx = additionalNow.findIndex((h) => h.label === ah.label);
                        return (
                          <tr key={ah.label} className={editingAllotted ? 'bg-amber-50' : 'hover:bg-green-50'}>
                            <td className="px-3 py-1 text-gray-700">{ah.label}</td>
                            <td className="px-2 py-1">
                              {editingAllotted ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={overrideAdditional[idx]?.amount === 0 ? '' : overrideAdditional[idx]?.amount ?? ''}
                                  onChange={(e) => setOverrideAdditional((prev) =>
                                    prev.map((h, i) =>
                                      i === idx ? { ...h, amount: Math.max(0, parseInt(e.target.value) || 0) } : h
                                    )
                                  )}
                                  className={`${ni} border-amber-300 focus:ring-amber-400 focus:border-amber-400`}
                                  placeholder="0"
                                />
                              ) : (
                                <span className={`block text-right pr-2 ${loadedOverride ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                                  {ah.amount.toLocaleString()}
                                </span>
                              )}
                            </td>
                            {isUpdate && (
                              <td className="px-3 py-1 text-right text-gray-400">
                                {(cumulativeAdditional.get(ah.label) ?? 0).toLocaleString()}
                              </td>
                            )}
                            <td className="px-2 py-1">
                              {nowIdx !== -1 ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={nowEntry!.amount === 0 ? '' : nowEntry!.amount}
                                  onChange={(e) => handleAdditionalChange(nowIdx, e.target.value)}
                                  className={ni}
                                  placeholder="0"
                                />
                              ) : (
                                <span className="block text-right pr-2 text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-50 border-t border-green-200 font-semibold text-gray-800">
                        <td className="px-3 py-1.5">Total Additional</td>
                        <td className="px-3 py-1.5 text-right">{additionalAllotted.toLocaleString()}</td>
                        {isUpdate && (
                          <td className="px-3 py-1.5 text-right text-gray-500">
                            {additionalPreviousTotal.toLocaleString()}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-right text-green-700">
                          {additionalNowTotal.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Save override button (only shown while editing allotted) */}
              {editingAllotted && (
                <div className="rounded bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-amber-800">
                    <strong>Editing custom allotted fee.</strong> These values override the fee structure for this student only.
                    Save before collecting payment.
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={cancelEditAllotted}
                      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleSaveOverride()}
                      disabled={savingOverride}
                      className="rounded border border-amber-500 bg-amber-500 px-3 py-1.5 text-xs text-white font-medium hover:bg-amber-600 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {savingOverride ? 'Saving…' : 'Save Custom Allotted'}
                    </button>
                  </div>
                </div>
              )}
              {overrideSaveError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {overrideSaveError}
                </div>
              )}

              {/* Grand total summary */}
              <div className="rounded bg-gray-50 border border-gray-200 px-4 py-2.5 text-xs flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  <span className="text-gray-500">Allotted: </span>
                  <span className="font-semibold text-gray-900">
                    ₹{grandAllotted.toLocaleString()}
                  </span>
                </span>
                {isUpdate && (
                  <span>
                    <span className="text-gray-500">Paid so far: </span>
                    <span className="font-semibold text-gray-700">
                      ₹{totalPrevious.toLocaleString()}
                    </span>
                  </span>
                )}
                <span>
                  <span className="text-gray-500">
                    {isUpdate ? 'Now Paying: ' : 'Paying: '}
                  </span>
                  <span className="font-semibold text-blue-700">
                    ₹{grandNow.toLocaleString()}
                  </span>
                </span>
                {isUpdate && (
                  <span>
                    <span className="text-gray-500">Total After: </span>
                    <span className="font-semibold text-green-700">
                      ₹{grandTotal.toLocaleString()}
                    </span>
                  </span>
                )}
                <span>
                  <span className="text-gray-500">Balance: </span>
                  <span
                    className={`font-semibold ${
                      balance > 0 ? 'text-red-600' : 'text-green-700'
                    }`}
                  >
                    ₹{balance.toLocaleString()}
                  </span>
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

                {smpNowTotal > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      SMP Receipt No (Rpt)
                    </label>
                    <input
                      type="text"
                      value={receiptNo}
                      onChange={(e) => setReceiptNo(e.target.value)}
                      placeholder="Auto-incremented, editable"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="text-[10px] font-medium text-gray-500">SMP Mode:</span>
                      {(['CASH', 'UPI'] as PaymentMode[]).map((mode) => (
                        <label key={mode} className="flex items-center gap-1 cursor-pointer text-xs text-gray-700">
                          <input
                            type="radio"
                            name="smpPaymentMode"
                            value={mode}
                            checked={smpPaymentMode === mode}
                            onChange={() => setSmpPaymentMode(mode)}
                            className="accent-blue-600"
                          />
                          {mode}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {svkNowTotal > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      SVK Receipt No
                    </label>
                    <input
                      type="text"
                      value={svkReceiptNo}
                      onChange={(e) => setSvkReceiptNo(e.target.value)}
                      placeholder="Auto-incremented, editable"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                    />
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="text-[10px] font-medium text-gray-500">SVK Mode:</span>
                      {(['CASH', 'UPI'] as PaymentMode[]).map((mode) => (
                        <label key={mode} className="flex items-center gap-1 cursor-pointer text-xs text-gray-700">
                          <input
                            type="radio"
                            name="svkPaymentMode"
                            value={mode}
                            checked={svkPaymentMode === mode}
                            onChange={() => setSvkPaymentMode(mode)}
                            className="accent-purple-600"
                          />
                          {mode}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {additionalNowTotal > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Additional Fee Receipt No
                    </label>
                    <input
                      type="text"
                      value={additionalReceiptNo}
                      onChange={(e) => setAdditionalReceiptNo(e.target.value)}
                      placeholder="Auto-incremented, editable"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                    />
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="text-[10px] font-medium text-gray-500">Addl Mode:</span>
                      {(['CASH', 'UPI'] as PaymentMode[]).map((mode) => (
                        <label key={mode} className="flex items-center gap-1 cursor-pointer text-xs text-gray-700">
                          <input
                            type="radio"
                            name="additionalPaymentMode"
                            value={mode}
                            checked={additionalPaymentMode === mode}
                            onChange={() => setAdditionalPaymentMode(mode)}
                            className="accent-green-600"
                          />
                          {mode}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Remarks
                  </label>
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
            disabled={loadingData || !!loadError || !date || grandNow === 0}
          >
            {isUpdate ? 'Save Installment' : 'Save Fee Record'}
          </Button>
        </div>
      </div>
    </div>
  );
}
