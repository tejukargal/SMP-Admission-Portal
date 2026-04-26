import { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../hooks/useSettings';
import { getFeeStructure, saveFeeStructure, getAllFeeStructures, deleteAllFeeStructures, applyAdditionalHeadsToYear } from '../services/feeStructureService';
import { getFineSchedule, saveFineSchedule } from '../services/fineScheduleService';
import { exportFeeStructurePDF, exportFeeStructureExcel, exportFeeStructureFormatted } from '../utils/feeStructureExport';
import { Button } from '../components/common/Button';
import { FeeStructureImportModal } from '../components/fee/FeeStructureImportModal';
import type {
  AcademicYear,
  Course,
  Year,
  AdmType,
  AdmCat,
  SMPFeeHead,
  SMPHeads,
  FeeAdditionalHead,
  FinePeriod,
  FeeStructure,
} from '../types';
import { SMP_FEE_HEADS, ACADEMIC_YEARS } from '../types';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL'];
const ADM_CATS: AdmCat[] = ['GM', 'SNQ', 'OTHERS'];

const fs =
  'rounded border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer';

/** Default SMP amounts applied when creating a new structure */
const DEFAULT_SMP: SMPHeads = {
  adm:     30,
  tuition: 0,
  lib:     0,
  rr:      100,
  sports:  70,
  lab:     300,
  dvp:     500,
  mag:     60,
  idCard:  10,
  ass:     60,
  swf:     25,
  twf:     25,
  nss:     40,
  fine:    0,
};

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

// Split SMP heads into two columns for display
const SMP_LEFT = SMP_FEE_HEADS.slice(0, 7);
const SMP_RIGHT = SMP_FEE_HEADS.slice(7);

export function FeeStructurePage() {
  const { settings, loading: settingsLoading } = useSettings();

  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [selectedCourse, setSelectedCourse] = useState<Course | ''>('');
  const [selectedStudyYear, setSelectedStudyYear] = useState<Year | ''>('');
  const [selectedAdmType, setSelectedAdmType] = useState<AdmType | ''>('');
  const [selectedAdmCat, setSelectedAdmCat] = useState<AdmCat | ''>('');

  const [loadingStructure, setLoadingStructure] = useState(false);
  const [isExisting, setIsExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | 'formatted' | null>(null);

  // ── Apply-to-all additional heads dialog ──────────────────────────────────
  const [showApplyToAllDialog, setShowApplyToAllDialog] = useState(false);
  const [applyToAllCount, setApplyToAllCount] = useState(0);
  const [applyToAllSaving, setApplyToAllSaving] = useState(false);

  // ── Saved structures list ─────────────────────────────────────────────────
  const [allStructures, setAllStructures] = useState<FeeStructure[]>([]);
  const [listTick, setListTick] = useState(0);

  const [smpAmounts, setSmpAmounts] = useState<SMPHeads>({ ...DEFAULT_SMP });
  const [svkAmount, setSvkAmount] = useState(0);
  const [additionalHeads, setAdditionalHeads] = useState<FeeAdditionalHead[]>([]);

  // ── Year-level fine schedule ───────────────────────────────────────────────
  const [fineSchedule, setFineSchedule] = useState<FinePeriod[]>([]);
  const [fineSaving, setFineSaving] = useState(false);
  const [fineSuccess, setFineSuccess] = useState(false);
  const [fineError, setFineError] = useState<string | null>(null);

  // Default to current academic year from settings
  useEffect(() => {
    if (settings?.currentAcademicYear && !selectedYear) {
      setSelectedYear(settings.currentAcademicYear);
    }
  }, [settings, selectedYear]);

  // Load fine schedule whenever the academic year changes
  useEffect(() => {
    if (!selectedYear) { setFineSchedule([]); return; }
    getFineSchedule(selectedYear as AcademicYear)
      .then(setFineSchedule)
      .catch(() => setFineSchedule([]));
    setFineSuccess(false);
    setFineError(null);
  }, [selectedYear]);

  const allSelected =
    !!selectedYear && !!selectedCourse &&
    !!selectedStudyYear && !!selectedAdmType && !!selectedAdmCat;

  // Load structure whenever all five selectors are set
  useEffect(() => {
    if (!allSelected) return;
    let cancelled = false;
    setLoadingStructure(true);
    setError(null);
    setIsExisting(false);
    getFeeStructure(
      selectedYear as AcademicYear,
      selectedCourse as Course,
      selectedStudyYear as Year,
      selectedAdmType as AdmType,
      selectedAdmCat as AdmCat
    )
      .then((struct) => {
        if (cancelled) return;
        if (struct) {
          setSmpAmounts(struct.smp);
          setSvkAmount(struct.svk);
          setAdditionalHeads(struct.additionalHeads);
          setIsExisting(true);
        } else {
          // New structure — apply defaults
          setSmpAmounts({ ...DEFAULT_SMP });
          setSvkAmount(0);
          setAdditionalHeads([]);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load structure');
      })
      .finally(() => { if (!cancelled) setLoadingStructure(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedCourse, selectedStudyYear, selectedAdmType, selectedAdmCat]);

  // Load full list on mount and after every save
  useEffect(() => {
    getAllFeeStructures().then(setAllStructures).catch(() => {});
  }, [listTick]);

  // Group by academic year, sorted latest → oldest
  const structuresByYear = useMemo(() => {
    const grouped = new Map<AcademicYear, FeeStructure[]>();
    for (const s of allStructures) {
      const list = grouped.get(s.academicYear) ?? [];
      list.push(s);
      grouped.set(s.academicYear, list);
    }
    // Sort years descending using ACADEMIC_YEARS order
    const sortedYears = [...grouped.keys()].sort(
      (a, b) => ACADEMIC_YEARS.indexOf(b) - ACADEMIC_YEARS.indexOf(a)
    );
    return sortedYears.map((yr) => ({
      academicYear: yr,
      structures: grouped.get(yr)!.sort((a, b) => {
        const cmp = a.course.localeCompare(b.course);
        if (cmp !== 0) return cmp;
        return YEARS.indexOf(a.year) - YEARS.indexOf(b.year);
      }),
    }));
  }, [allStructures]);

  function loadStructure(s: FeeStructure) {
    setSelectedYear(s.academicYear);
    setSelectedCourse(s.course);
    setSelectedStudyYear(s.year);
    setSelectedAdmType(s.admType);
    setSelectedAdmCat(s.admCat);
    setSaveSuccess(false);
  }

  function handleSMPChange(key: SMPFeeHead, val: string) {
    setSmpAmounts((prev) => ({ ...prev, [key]: Math.max(0, parseInt(val) || 0) }));
    setSaveSuccess(false);
  }

  function addAdditionalHead() {
    setAdditionalHeads((prev) => [...prev, { label: '', amount: 0 }]);
    setSaveSuccess(false);
  }

  function updateAdditionalHead(idx: number, field: 'label' | 'amount', val: string) {
    setAdditionalHeads((prev) =>
      prev.map((h, i) =>
        i === idx
          ? {
              ...h,
              [field]: field === 'amount' ? Math.max(0, parseInt(val) || 0) : val,
            }
          : h
      )
    );
    setSaveSuccess(false);
  }

  function removeAdditionalHead(idx: number) {
    setAdditionalHeads((prev) => prev.filter((_, i) => i !== idx));
    setSaveSuccess(false);
  }

  function addFinePeriod() {
    setFineSchedule((prev) => [...prev, { from: '', to: '', amount: 0 }]);
    setFineSuccess(false);
  }

  function updateFinePeriod(idx: number, field: keyof FinePeriod, val: string) {
    setFineSchedule((prev) =>
      prev.map((p, i) =>
        i === idx
          ? { ...p, [field]: field === 'amount' ? Math.max(0, parseInt(val) || 0) : val }
          : p
      )
    );
    setFineSuccess(false);
  }

  function removeFinePeriod(idx: number) {
    setFineSchedule((prev) => prev.filter((_, i) => i !== idx));
    setFineSuccess(false);
  }

  async function handleSaveFineSchedule() {
    if (!selectedYear) return;
    setFineSaving(true);
    setFineSuccess(false);
    setFineError(null);
    try {
      await saveFineSchedule(
        selectedYear as AcademicYear,
        fineSchedule.filter((p) => p.from && p.to)
      );
      setFineSuccess(true);
      setTimeout(() => setFineSuccess(false), 3000);
    } catch (err: unknown) {
      setFineError(err instanceof Error ? err.message : 'Failed to save fine schedule');
    } finally {
      setFineSaving(false);
    }
  }

  function handleExport(format: 'pdf' | 'excel' | 'formatted') {
    const exportYear = selectedYear || settings?.currentAcademicYear;
    if (!exportYear) return;
    const yearStructures = allStructures.filter((s) => s.academicYear === exportYear);
    if (yearStructures.length === 0) return;
    setExporting(format);
    try {
      if (format === 'pdf') exportFeeStructurePDF(yearStructures, exportYear);
      else if (format === 'excel') exportFeeStructureExcel(yearStructures, exportYear);
      else exportFeeStructureFormatted(yearStructures, exportYear);
    } finally {
      setExporting(null);
    }
  }

  async function handleSave(applyToAll?: boolean) {
    if (!allSelected) return;
    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const validAdditional = additionalHeads.filter((h) => h.label.trim() !== '');
      await saveFeeStructure({
        academicYear: selectedYear as AcademicYear,
        course: selectedCourse as Course,
        year: selectedStudyYear as Year,
        admType: selectedAdmType as AdmType,
        admCat: selectedAdmCat as AdmCat,
        smp: smpAmounts,
        svk: svkAmount,
        additionalHeads: validAdditional,
      });
      setIsExisting(true);
      setListTick((t) => t + 1);

      // If applying to all, skip dialog
      if (applyToAll) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        return;
      }

      // Check if there are other structures in the same year to offer "apply to all"
      if (validAdditional.length > 0) {
        const currentDocId = `${selectedYear}__${selectedCourse}__${selectedStudyYear}__${selectedAdmType}__${selectedAdmCat}`;
        const othersInYear = allStructures.filter(
          (s) => s.academicYear === selectedYear && s.id !== currentDocId
        );
        if (othersInYear.length > 0) {
          setApplyToAllCount(othersInYear.length);
          setShowApplyToAllDialog(true);
          return;
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyToAll() {
    setApplyToAllSaving(true);
    try {
      const validAdditional = additionalHeads.filter((h) => h.label.trim() !== '');
      const currentDocId = `${selectedYear}__${selectedCourse}__${selectedStudyYear}__${selectedAdmType}__${selectedAdmCat}`;
      await applyAdditionalHeadsToYear(
        selectedYear as AcademicYear,
        validAdditional,
        currentDocId
      );
      setListTick((t) => t + 1);
      setShowApplyToAllDialog(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply to all structures');
    } finally {
      setApplyToAllSaving(false);
    }
  }

  async function handleClearAll() {
    setClearing(true);
    try {
      await deleteAllFeeStructures();
      setAllStructures([]);
      // Reset form state if currently showing a loaded structure
      setIsExisting(false);
      setSmpAmounts({ ...DEFAULT_SMP });
      setSvkAmount(0);
      setAdditionalHeads([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to clear structures');
    } finally {
      setClearing(false);
      setClearConfirm(false);
    }
  }

  const smpTotal = sum(SMP_FEE_HEADS.map(({ key }) => smpAmounts[key]));
  const additionalTotal = sum(additionalHeads.map((h) => h.amount));
  const grandTotal = smpTotal + svkAmount + additionalTotal;

  const showForm = allSelected && !loadingStructure;

  return (
    <div className="h-full flex flex-col gap-3">

      {/* Header */}
      <div className="flex-shrink-0 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 leading-tight">Fee Structure</h2>
          <p className="text-[10px] text-gray-400 leading-tight">
            Configure allotted fee amounts per academic year / course / year / adm type / adm category
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export PDF */}
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting !== null || allStructures.filter(s => s.academicYear === (selectedYear || settings?.currentAcademicYear)).length === 0}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export fee structure as PDF (notice board)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>

          {/* Export Excel (flat data) */}
          <button
            onClick={() => handleExport('excel')}
            disabled={exporting !== null || allStructures.filter(s => s.academicYear === (selectedYear || settings?.currentAcademicYear)).length === 0}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 text-green-700 cursor-pointer transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export fee structure as Excel spreadsheet (flat data)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting === 'excel' ? 'Exporting…' : 'Export Excel'}
          </button>

          {/* Fee Structure Format (reference layout) */}
          <button
            onClick={() => handleExport('formatted')}
            disabled={exporting !== null || allStructures.filter(s => s.academicYear === (selectedYear || settings?.currentAcademicYear)).length === 0}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 cursor-pointer transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title="Generate formatted fee structure Excel (Fee Structure + Component Breakup + Course-wise Data + Quick Reference)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exporting === 'formatted' ? 'Generating…' : 'Fee Structure Format'}
          </button>

          {/* Import from Excel */}
          <button
            onClick={() => setShowImport(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer transition-colors shadow-sm"
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import from Excel
          </button>
        </div>
      </div>

      {/* Selectors */}
      <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-end gap-4">

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Academic Year</label>
            <select
              className={fs}
              value={selectedYear}
              onChange={(e) => { setSelectedYear(e.target.value as AcademicYear | ''); setSaveSuccess(false); }}
              disabled={settingsLoading}
            >
              <option value="">Select Year</option>
              {ACADEMIC_YEARS.map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Course</label>
            <select
              className={fs}
              value={selectedCourse}
              onChange={(e) => { setSelectedCourse(e.target.value as Course | ''); setSaveSuccess(false); }}
            >
              <option value="">Select Course</option>
              {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
            <select
              className={fs}
              value={selectedStudyYear}
              onChange={(e) => { setSelectedStudyYear(e.target.value as Year | ''); setSaveSuccess(false); }}
            >
              <option value="">Select Year</option>
              {YEARS.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Adm Type</label>
            <select
              className={fs}
              value={selectedAdmType}
              onChange={(e) => { setSelectedAdmType(e.target.value as AdmType | ''); setSaveSuccess(false); }}
            >
              <option value="">Select Type</option>
              {ADM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Adm Cat</label>
            <select
              className={fs}
              value={selectedAdmCat}
              onChange={(e) => { setSelectedAdmCat(e.target.value as AdmCat | ''); setSaveSuccess(false); }}
            >
              <option value="">Select Cat</option>
              {ADM_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {allSelected && !loadingStructure && (
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full ${
                isExisting ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isExisting ? 'Existing structure' : 'New — defaults applied'}
            </span>
          )}
        </div>
      </div>

      {/* Content area: form (left) + saved list (right) */}
      <div className="flex-1 min-h-0 flex gap-3">

        {/* Left: form / loading / empty state */}
        <div className="flex-1 min-h-0 overflow-auto">

      {/* Year-level Fine Schedule — visible as soon as a year is selected */}
      {selectedYear && (
        <div className="bg-white rounded-lg border border-amber-200 shadow-sm px-5 py-4 mb-1">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                Late Fee Schedule
                <span className="ml-2 text-xs font-normal text-amber-600">{selectedYear}</span>
              </h3>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Applies to all combinations for this academic year. Fine auto-fills based on payment date when collecting fee.
              </p>
            </div>
            {fineSchedule.length > 0 && (
              <span className="text-[10px] text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded px-2 py-0.5 shrink-0 ml-3 mt-0.5">
                {fineSchedule.length} period{fineSchedule.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {fineSchedule.length === 0 && (
            <p className="text-xs text-gray-400 mb-3">No fine periods yet. Add one below.</p>
          )}

          {fineSchedule.length > 0 && (
            <div className="space-y-2 mb-3">
              <div className="grid grid-cols-[1fr_1fr_9rem_1.5rem] gap-2 px-1">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">From</span>
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">To</span>
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Fine (₹)</span>
                <span />
              </div>
              {fineSchedule.map((p, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_9rem_1.5rem] gap-2 items-center">
                  <input
                    type="date"
                    value={p.from}
                    onChange={(e) => updateFinePeriod(idx, 'from', e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                  />
                  <input
                    type="date"
                    value={p.to}
                    onChange={(e) => updateFinePeriod(idx, 'to', e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                  />
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={p.amount === 0 ? '' : p.amount}
                      onChange={(e) => updateFinePeriod(idx, 'amount', e.target.value)}
                      placeholder="0"
                      className="w-full rounded border border-gray-300 pl-6 pr-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                    />
                  </div>
                  <button
                    onClick={() => removeFinePeriod(idx)}
                    className="text-gray-400 hover:text-red-500 text-sm cursor-pointer transition-colors"
                    title="Remove period"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={addFinePeriod}
              className="text-xs text-amber-600 hover:text-amber-800 font-medium cursor-pointer hover:underline"
            >
              + Add fine period
            </button>
            <Button
              size="sm"
              onClick={() => void handleSaveFineSchedule()}
              loading={fineSaving}
            >
              Save Fine Schedule
            </Button>
            {fineSuccess && (
              <span className="text-xs text-green-600 font-medium">Saved!</span>
            )}
            {fineError && (
              <span className="text-xs text-red-600">{fineError}</span>
            )}
          </div>
        </div>
      )}

      {/* Loading */}
      {loadingStructure && (
        <div className="h-full flex items-center justify-center text-sm text-gray-500">
          Loading structure…
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="space-y-4">

          {/* SMP Fee */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">SMP Fee — Government</h3>
              <span className="text-xs text-gray-500">
                Total:{' '}
                <span className="font-semibold text-gray-800">₹{smpTotal.toLocaleString()}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              {[SMP_LEFT, SMP_RIGHT].map((col, ci) => (
                <div key={ci} className="space-y-2">
                  {col.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-3">
                      <label className="w-16 text-xs text-gray-600 text-right shrink-0">
                        {label}
                      </label>
                      <div className="flex-1 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={smpAmounts[key] === 0 ? '' : smpAmounts[key]}
                          onChange={(e) => handleSMPChange(key, e.target.value)}
                          placeholder="0"
                          className="w-full rounded border border-gray-300 pl-6 pr-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* SVK Fee */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">SVK Fee — Management</h3>
              <span className="text-xs text-gray-500">
                Total:{' '}
                <span className="font-semibold text-gray-800">₹{svkAmount.toLocaleString()}</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="w-24 text-xs text-gray-600 text-right shrink-0">SVK</label>
              <div className="relative w-40">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  value={svkAmount === 0 ? '' : svkAmount}
                  onChange={(e) => {
                    setSvkAmount(Math.max(0, parseInt(e.target.value) || 0));
                    setSaveSuccess(false);
                  }}
                  placeholder="0"
                  className="w-full rounded border border-gray-300 pl-6 pr-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Additional Fee */}
          <div className="bg-white rounded-lg border border-green-200 shadow-sm px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Additional Fee</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Red Cross, App Fee, etc. — gets a separate receipt number.</p>
              </div>
              <span className="text-xs text-gray-500">
                Total:{' '}
                <span className="font-semibold text-gray-800">₹{additionalTotal.toLocaleString()}</span>
              </span>
            </div>
            <div className="space-y-2">
              {additionalHeads.map((h, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <input
                    type="text"
                    value={h.label}
                    onChange={(e) => updateAdditionalHead(idx, 'label', e.target.value)}
                    placeholder="Head name (e.g. Red Cross)"
                    className="w-44 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                  />
                  <div className="relative w-32">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={h.amount === 0 ? '' : h.amount}
                      onChange={(e) => updateAdditionalHead(idx, 'amount', e.target.value)}
                      placeholder="0"
                      className="w-full rounded border border-gray-300 pl-6 pr-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <button
                    onClick={() => removeAdditionalHead(idx)}
                    className="text-gray-400 hover:text-red-500 text-sm cursor-pointer transition-colors"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              {additionalHeads.length === 0 && (
                <p className="text-xs text-gray-400">No additional heads yet.</p>
              )}
              <button
                onClick={addAdditionalHead}
                className="text-xs text-green-600 hover:text-green-800 font-medium cursor-pointer hover:underline"
              >
                + Add head (Red Cross, App Fee, etc.)
              </button>
            </div>
          </div>

          {/* Grand total */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-5 py-3">
            <div className="flex flex-wrap gap-x-8 gap-y-1 text-xs">
              <span>
                <span className="text-gray-500">SMP Total: </span>
                <span className="font-semibold text-gray-800">₹{smpTotal.toLocaleString()}</span>
              </span>
              <span>
                <span className="text-gray-500">SVK Total: </span>
                <span className="font-semibold text-gray-800">₹{svkAmount.toLocaleString()}</span>
              </span>
              <span>
                <span className="text-gray-500">Additional Total: </span>
                <span className="font-semibold text-gray-800">₹{additionalTotal.toLocaleString()}</span>
              </span>
              <span>
                <span className="text-gray-500">Grand Total: </span>
                <span className="font-semibold text-blue-700">₹{grandTotal.toLocaleString()}</span>
              </span>
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pb-2">
            <Button
              onClick={() => void handleSave()}
              loading={saving}
              disabled={!allSelected}
            >
              {isExisting ? 'Update Structure' : 'Save Structure'}
            </Button>
            {saveSuccess && (
              <span className="text-xs text-green-600 font-medium">
                Structure saved successfully.
              </span>
            )}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>

          {/* Apply-to-all additional heads confirmation */}
          {showApplyToAllDialog && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-green-800">
                Apply additional fee heads to all structures in {selectedYear}?
              </p>
              <p className="text-[11px] text-green-700">
                {applyToAllCount} other saved structure{applyToAllCount > 1 ? 's' : ''} in {selectedYear} will have
                their additional fee heads replaced with the ones you just set.
              </p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => void handleApplyToAll()}
                  disabled={applyToAllSaving}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {applyToAllSaving ? 'Applying…' : `Apply to all ${applyToAllCount} structure${applyToAllCount > 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={() => { setShowApplyToAllDialog(false); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); }}
                  disabled={applyToAllSaving}
                  className="px-3 py-1.5 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  This structure only
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loadingStructure && !allSelected && (
        <div className="h-full flex items-center justify-center text-sm text-gray-400 text-center px-4">
          Select academic year, course, year, adm type and adm category to configure the fee structure.
        </div>
      )}

        </div>{/* end left panel */}

        {/* Right: saved structures list */}
        <div className="w-72 min-h-0 flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden shrink-0">
          <div className="px-3 py-2 border-b border-gray-200 shrink-0">
            <div className="flex items-start justify-between gap-1">
              <div>
                <p className="text-xs font-semibold text-gray-700">Saved Structures</p>
                <p className="text-[10px] text-gray-400">
                  {allStructures.length} total · click to load
                </p>
              </div>
              {allStructures.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  {clearConfirm ? (
                    <>
                      <span className="text-[10px] text-red-600 font-medium">Delete all?</span>
                      <button
                        onClick={() => void handleClearAll()}
                        disabled={clearing}
                        className="px-2 py-0.5 text-[10px] font-semibold rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        {clearing ? '…' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setClearConfirm(false)}
                        disabled={clearing}
                        className="px-2 py-0.5 text-[10px] rounded border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setClearConfirm(true)}
                      className="px-2 py-0.5 text-[10px] rounded border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 cursor-pointer transition-colors"
                      title="Delete all saved fee structures"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {allStructures.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-gray-400 px-4 text-center">
                No structures saved yet.
              </div>
            ) : (
              structuresByYear.map(({ academicYear, structures }) => {
                const smpHeadSum = (s: FeeStructure) =>
                  SMP_FEE_HEADS.reduce((t, { key }) => t + s.smp[key], 0);
                const svkSum = (s: FeeStructure) => s.svk;
                const addlSum = (s: FeeStructure) =>
                  s.additionalHeads.reduce((t, h) => t + h.amount, 0);

                return (
                  <div key={academicYear}>
                    {/* Year group header */}
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        {academicYear}
                      </span>
                      <span className="ml-1.5 text-[10px] text-gray-400">
                        ({structures.length})
                      </span>
                    </div>

                    {/* Structures in this year */}
                    {structures.map((s) => {
                      const grand = smpHeadSum(s) + svkSum(s) + addlSum(s);
                      const isActive =
                        selectedYear === s.academicYear &&
                        selectedCourse === s.course &&
                        selectedStudyYear === s.year &&
                        selectedAdmType === s.admType &&
                        selectedAdmCat === s.admCat;
                      return (
                        <button
                          key={s.id}
                          onClick={() => loadStructure(s)}
                          className={`w-full text-left px-3 py-2 border-b border-gray-100 transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-blue-50 border-l-2 border-l-blue-500'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-xs font-medium ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                              {s.course}
                            </span>
                            <span className={`text-xs font-semibold ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>
                              ₹{grand.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {s.year} · {s.admType} · {s.admCat}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            SMP ₹{smpHeadSum(s).toLocaleString()} · SVK ₹{svkSum(s).toLocaleString()} · Addl ₹{addlSum(s).toLocaleString()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>{/* end right panel */}

      </div>{/* end content area */}

      {/* Import modal */}
      {showImport && (
        <FeeStructureImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setListTick((t) => t + 1);
            setShowImport(false);
          }}
        />
      )}

    </div>
  );
}
