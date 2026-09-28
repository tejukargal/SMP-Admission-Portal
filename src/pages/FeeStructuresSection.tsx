import { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../hooks/useSettings';
import { getFeeStructure, saveFeeStructure, getAllFeeStructures, applyAdditionalHeadsToYear } from '../services/feeStructureService';
import { Button } from '../components/common/Button';
import type {
  AcademicYear,
  Course,
  Year,
  AdmType,
  AdmCat,
  SMPFeeHead,
  SMPHeads,
  FeeAdditionalHead,
  FeeStructure,
} from '../types';
import { SMP_FEE_HEADS, ACADEMIC_YEARS } from '../types';
import {
  COURSES, YEARS, ADM_TYPES, ADM_CATS, DEFAULT_SMP, SMP_HEAD_FULL, SMP_HEADS_NO_FINE,
  sum, structureTotals, structureDocId, selectCls, amountInputCls, chipCls, DISCARD_PROMPT,
} from './feeStructureShared';

interface Props {
  onDirtyChange: (dirty: boolean) => void;
  onGoToLateFee: () => void;
}

function snapshot(smp: SMPHeads, svk: number, additional: FeeAdditionalHead[]): string {
  return JSON.stringify({ smp, svk, additional });
}

/** Settings › Fee Structure › Fee Structures: pick a combination from the
 *  coverage grid and edit its SMP / SVK / additional amounts. */
export function FeeStructuresSection({ onDirtyChange, onGoToLateFee }: Props) {
  const { settings, loading: settingsLoading } = useSettings();

  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [selectedCourse, setSelectedCourse] = useState<Course | ''>('');
  const [selectedStudyYear, setSelectedStudyYear] = useState<Year | ''>('');
  const [selectedAdmType, setSelectedAdmType] = useState<AdmType>('REGULAR');
  const [selectedAdmCat, setSelectedAdmCat] = useState<AdmCat>('GM');

  const [loadingStructure, setLoadingStructure] = useState(false);
  const [isExisting, setIsExisting] = useState(false);
  // True once the editor has shown a structure; later loads keep it mounted (no layout jump)
  const [formReady, setFormReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Apply-to-all additional heads dialog ──────────────────────────────────
  const [showApplyToAllDialog, setShowApplyToAllDialog] = useState(false);
  const [applyToAllCount, setApplyToAllCount] = useState(0);
  const [applyToAllSaving, setApplyToAllSaving] = useState(false);

  // ── Saved structures (feeds the coverage grid and "Copy from…") ───────────
  const [allStructures, setAllStructures] = useState<FeeStructure[]>([]);
  const [listTick, setListTick] = useState(0);

  const [smpAmounts, setSmpAmounts] = useState<SMPHeads>({ ...DEFAULT_SMP });
  const [svkAmount, setSvkAmount] = useState(0);
  const [additionalHeads, setAdditionalHeads] = useState<FeeAdditionalHead[]>([]);

  // Snapshot of the form as last loaded/saved — drives the unsaved-changes guard
  const [baseline, setBaseline] = useState(() => snapshot(DEFAULT_SMP, 0, []));

  // Default to current academic year from settings
  useEffect(() => {
    if (settings?.currentAcademicYear && !selectedYear) {
      setSelectedYear(settings.currentAcademicYear);
    }
  }, [settings, selectedYear]);

  const allSelected = !!selectedYear && !!selectedCourse && !!selectedStudyYear;

  // Load structure whenever all five selectors are set
  useEffect(() => {
    if (!allSelected) return;
    let cancelled = false;
    setLoadingStructure(true);
    setError(null);
    setShowApplyToAllDialog(false);
    getFeeStructure(
      selectedYear as AcademicYear,
      selectedCourse as Course,
      selectedStudyYear as Year,
      selectedAdmType,
      selectedAdmCat
    )
      .then((struct) => {
        if (cancelled) return;
        if (struct) {
          setSmpAmounts(struct.smp);
          setSvkAmount(struct.svk);
          setAdditionalHeads(struct.additionalHeads);
          setBaseline(snapshot(struct.smp, struct.svk, struct.additionalHeads));
          setIsExisting(true);
        } else {
          // New structure — apply defaults
          setSmpAmounts({ ...DEFAULT_SMP });
          setSvkAmount(0);
          setAdditionalHeads([]);
          setBaseline(snapshot(DEFAULT_SMP, 0, []));
          setIsExisting(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load structure');
      })
      .finally(() => { if (!cancelled) { setLoadingStructure(false); setFormReady(true); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedCourse, selectedStudyYear, selectedAdmType, selectedAdmCat]);

  // Load full list on mount and after every save
  useEffect(() => {
    getAllFeeStructures().then(setAllStructures).catch(() => {});
  }, [listTick]);

  const dirty = allSelected && !loadingStructure && snapshot(smpAmounts, svkAmount, additionalHeads) !== baseline;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /** Runs `fn` only if there are no unsaved edits, or the user agrees to discard them. */
  function guarded(fn: () => void) {
    if (dirty && !window.confirm(DISCARD_PROMPT)) return;
    setSaveSuccess(false);
    fn();
  }

  // Structures for the chosen academic year, keyed by doc id
  const byId = useMemo(() => {
    const m = new Map<string, FeeStructure>();
    for (const s of allStructures) if (s.academicYear === selectedYear) m.set(s.id, s);
    return m;
  }, [allStructures, selectedYear]);

  const configuredCount = COURSES.reduce(
    (n, c) => n + YEARS.filter((y) => byId.has(structureDocId(selectedYear, c, y, selectedAdmType, selectedAdmCat))).length,
    0,
  );

  // "Copy amounts from…" options, latest academic year first
  const copyGroups = useMemo(() => {
    const grouped = new Map<AcademicYear, FeeStructure[]>();
    for (const s of allStructures) {
      const list = grouped.get(s.academicYear) ?? [];
      list.push(s);
      grouped.set(s.academicYear, list);
    }
    return [...grouped.keys()]
      .sort((a, b) => ACADEMIC_YEARS.indexOf(b) - ACADEMIC_YEARS.indexOf(a))
      .map((yr) => ({
        academicYear: yr,
        structures: grouped.get(yr)!.sort((a, b) =>
          a.course.localeCompare(b.course) ||
          YEARS.indexOf(a.year) - YEARS.indexOf(b.year) ||
          ADM_TYPES.indexOf(a.admType) - ADM_TYPES.indexOf(b.admType) ||
          ADM_CATS.indexOf(a.admCat) - ADM_CATS.indexOf(b.admCat)
        ),
      }));
  }, [allStructures]);

  const currentDocId = allSelected
    ? structureDocId(selectedYear, selectedCourse as Course, selectedStudyYear as Year, selectedAdmType, selectedAdmCat)
    : '';

  function copyFrom(id: string) {
    const s = allStructures.find((x) => x.id === id);
    if (!s) return;
    setSmpAmounts({ ...s.smp });
    setSvkAmount(s.svk);
    setAdditionalHeads(s.additionalHeads.map((h) => ({ ...h })));
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

  function discardChanges() {
    const b = JSON.parse(baseline) as { smp: SMPHeads; svk: number; additional: FeeAdditionalHead[] };
    setSmpAmounts(b.smp);
    setSvkAmount(b.svk);
    setAdditionalHeads(b.additional);
  }

  async function handleSave() {
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
        admType: selectedAdmType,
        admCat: selectedAdmCat,
        smp: smpAmounts,
        svk: svkAmount,
        additionalHeads: validAdditional,
      });
      setAdditionalHeads(validAdditional);
      setBaseline(snapshot(smpAmounts, svkAmount, validAdditional));
      setIsExisting(true);
      setListTick((t) => t + 1);

      // Check if there are other structures in the same year to offer "apply to all"
      if (validAdditional.length > 0) {
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

  const smpTotal = sum(SMP_FEE_HEADS.map(({ key }) => smpAmounts[key]));
  const smpNoFineTotal = smpTotal - smpAmounts.fine;
  const additionalTotal = sum(additionalHeads.map((h) => h.amount));
  const grandTotal = smpTotal + svkAmount + additionalTotal;

  const showForm = allSelected && formReady;

  return (
    <div className="flex flex-col gap-3 min-h-full">

      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 leading-tight">Fee Structures</h2>
        <p className="text-xs text-gray-500">
          Choose the admission type and category, then click a course / year cell to set its fee amounts.
        </p>
      </div>

      {/* Step 1 — scope */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 w-24">Academic Year</span>
            <select
              className={selectCls}
              value={selectedYear}
              onChange={(e) => {
                const v = e.target.value as AcademicYear | '';
                guarded(() => setSelectedYear(v));
              }}
              disabled={settingsLoading}
            >
              <option value="">Select Year</option>
              {ACADEMIC_YEARS.map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Adm Type</span>
            <div className="flex flex-wrap gap-1.5">
              {ADM_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={chipCls(selectedAdmType === t)}
                  onClick={() => { if (t !== selectedAdmType) guarded(() => setSelectedAdmType(t)); }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Adm Cat</span>
            <div className="flex flex-wrap gap-1.5">
              {ADM_CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={chipCls(selectedAdmCat === c)}
                  onClick={() => { if (c !== selectedAdmCat) guarded(() => setSelectedAdmCat(c)); }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Step 2 — coverage grid */}
      {selectedYear && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">
              {selectedYear} · {selectedAdmType} · {selectedAdmCat}
            </p>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300" /> Configured</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border border-dashed border-gray-300" /> Not set</span>
              <span className="font-medium text-gray-700">{configuredCount} of {COURSES.length * YEARS.length} configured</span>
            </div>
          </div>
          <div className="grid grid-cols-[3rem_repeat(3,minmax(0,1fr))] gap-1.5">
            <span />
            {YEARS.map((y) => (
              <span key={y} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center">{y}</span>
            ))}
            {COURSES.map((c) => (
              <div key={c} className="contents">
                <span className="text-xs font-semibold text-gray-700 self-center">{c}</span>
                {YEARS.map((y) => {
                  const s = byId.get(structureDocId(selectedYear, c, y, selectedAdmType, selectedAdmCat));
                  const active = selectedCourse === c && selectedStudyYear === y;
                  const base = 'rounded-md px-2 py-1.5 text-xs text-center transition-colors cursor-pointer border';
                  const tone = active
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : s
                      ? 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100'
                      : 'bg-white border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-600';
                  return (
                    <button
                      key={y}
                      type="button"
                      className={`${base} ${tone}`}
                      onClick={() => { if (!active) guarded(() => { setSelectedCourse(c); setSelectedStudyYear(y); }); }}
                      title={s ? `Edit ${c} ${y}` : `Create ${c} ${y}`}
                    >
                      {s ? <>✓ <span className="font-semibold">₹{structureTotals(s).grand.toLocaleString()}</span></> : 'Not set · add'}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading (first load only — afterwards the editor stays put and dims) */}
      {loadingStructure && !formReady && (
        <div className="py-10 flex items-center justify-center text-sm text-gray-500">
          Loading structure…
        </div>
      )}

      {/* Empty state */}
      {!loadingStructure && !allSelected && (
        <div className="py-10 flex items-center justify-center text-sm text-gray-400 text-center px-4 border border-dashed border-gray-200 rounded-lg">
          {selectedYear ? 'Click a cell above to view or set its fee amounts.' : 'Select an academic year to begin.'}
        </div>
      )}

      {/* Step 3 — editor */}
      {showForm && (
        <div
          className={`bg-white rounded-lg border border-blue-200 shadow-sm transition-opacity duration-150 ${
            loadingStructure ? 'opacity-60 pointer-events-none' : ''
          }`}
          aria-busy={loadingStructure}
        >

          {/* Editor header */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 bg-blue-50/40 rounded-t-lg">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {selectedCourse} · {selectedStudyYear} · {selectedAdmType} · {selectedAdmCat}
              </h3>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                isExisting ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {isExisting ? 'Saved structure' : 'New — defaults applied'}
              </span>
              {dirty && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  ● Unsaved changes
                </span>
              )}
            </div>
            <select
              className={selectCls}
              value=""
              onChange={(e) => { if (e.target.value) copyFrom(e.target.value); }}
              disabled={copyGroups.length === 0}
              title="Fill this form with the amounts of another saved structure (you still need to Save)"
            >
              <option value="">Copy amounts from…</option>
              {copyGroups.map(({ academicYear, structures }) => (
                <optgroup key={academicYear} label={academicYear}>
                  {structures.filter((s) => s.id !== currentDocId).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.course} · {s.year} · {s.admType} · {s.admCat} — ₹{structureTotals(s).grand.toLocaleString()}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="p-4 grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-4">

            {/* SMP Fee */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">SMP Fee — Government</h4>
                  <p className="text-[11px] text-gray-400">Per-head amounts collected on the SMP receipt.</p>
                </div>
                <span className="text-xs text-gray-500">
                  Subtotal <span className="font-semibold text-gray-800">₹{smpNoFineTotal.toLocaleString()}</span>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {SMP_HEADS_NO_FINE.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <label htmlFor={`smp-${key}`} className="flex-1 min-w-0 text-xs text-gray-700 truncate">
                      {SMP_HEAD_FULL[key]}
                      {SMP_HEAD_FULL[key].toUpperCase() !== label.toUpperCase() && (
                        <span className="ml-1 text-[10px] text-gray-400 uppercase">{label}</span>
                      )}
                    </label>
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                      <input
                        id={`smp-${key}`}
                        type="number"
                        min="0"
                        value={smpAmounts[key] === 0 ? '' : smpAmounts[key]}
                        onChange={(e) => handleSMPChange(key, e.target.value)}
                        placeholder="0"
                        className={amountInputCls}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Fixed fine (smp.fine) — kept apart from the date-based late fee schedule */}
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <label htmlFor="smp-fine" className="text-xs font-medium text-amber-900">Fixed fine (allotted)</label>
                <div className="relative w-28">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                  <input
                    id="smp-fine"
                    type="number"
                    min="0"
                    value={smpAmounts.fine === 0 ? '' : smpAmounts.fine}
                    onChange={(e) => handleSMPChange('fine', e.target.value)}
                    placeholder="0"
                    className={amountInputCls}
                  />
                </div>
                <p className="basis-full text-[11px] text-amber-800">
                  Usually ₹0. Counts in the SMP total. Date-based late fees are set in{' '}
                  <button type="button" onClick={onGoToLateFee} className="font-semibold underline hover:text-amber-950 cursor-pointer">
                    Late Fee Schedule →
                  </button>
                </p>
              </div>
            </section>

            <div className="space-y-4">
              {/* SVK Fee */}
              <section>
                <h4 className="text-sm font-semibold text-gray-800">SVK Fee — Management</h4>
                <p className="text-[11px] text-gray-400 mb-2">Single amount, collected on the SVK receipt.</p>
                <div className="flex items-center gap-2">
                  <label htmlFor="svk" className="flex-1 text-xs text-gray-700">SVK Dvp Fund</label>
                  <div className="relative w-28">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                    <input
                      id="svk"
                      type="number"
                      min="0"
                      value={svkAmount === 0 ? '' : svkAmount}
                      onChange={(e) => {
                        setSvkAmount(Math.max(0, parseInt(e.target.value) || 0));
                        setSaveSuccess(false);
                      }}
                      placeholder="0"
                      className={amountInputCls}
                    />
                  </div>
                </div>
              </section>

              {/* Additional Fee */}
              <section className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">Additional Fee</h4>
                  <span className="text-xs text-gray-500">
                    Subtotal <span className="font-semibold text-gray-800">₹{additionalTotal.toLocaleString()}</span>
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mb-2">Red Cross, App Fee, etc. — gets a separate receipt number.</p>
                <div className="space-y-1.5">
                  {additionalHeads.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={h.label}
                        onChange={(e) => updateAdditionalHead(idx, 'label', e.target.value)}
                        placeholder="Head name (e.g. Red Cross)"
                        className={`flex-1 min-w-0 rounded-md border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 ${
                          h.label.trim() === '' ? 'border-amber-300' : 'border-gray-300'
                        }`}
                      />
                      <div className="relative w-28 shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={h.amount === 0 ? '' : h.amount}
                          onChange={(e) => updateAdditionalHead(idx, 'amount', e.target.value)}
                          placeholder="0"
                          className={amountInputCls}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAdditionalHead(idx)}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {additionalHeads.some((h) => h.label.trim() === '') && (
                    <p className="text-[11px] text-amber-700">Rows without a name are skipped when saving.</p>
                  )}
                  {additionalHeads.length === 0 && (
                    <p className="text-xs text-gray-400">No additional heads.</p>
                  )}
                  <button
                    type="button"
                    onClick={addAdditionalHead}
                    className="text-xs text-green-700 hover:text-green-900 font-medium cursor-pointer hover:underline"
                  >
                    + Add head
                  </button>
                </div>
              </section>
            </div>
          </div>

          {/* Apply-to-all additional heads confirmation */}
          {showApplyToAllDialog && (
            <div className="mx-4 mb-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-green-800">
                Structure saved. Apply these additional fee heads to all structures in {selectedYear}?
              </p>
              <p className="text-[11px] text-green-700">
                {applyToAllCount} other saved structure{applyToAllCount > 1 ? 's' : ''} in {selectedYear} will have
                their additional fee heads replaced with the ones you just set.
              </p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => void handleApplyToAll()}
                  disabled={applyToAllSaving}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {applyToAllSaving ? 'Applying…' : `Apply to all ${applyToAllCount} structure${applyToAllCount > 1 ? 's' : ''}`}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowApplyToAllDialog(false); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); }}
                  disabled={applyToAllSaving}
                  className="px-3 py-1.5 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  This structure only
                </button>
              </div>
            </div>
          )}

          {/* Sticky totals + save footer */}
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-200 bg-white/95 backdrop-blur rounded-b-lg">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
              <span><span className="text-gray-500">SMP </span><span className="font-semibold text-gray-800">₹{smpTotal.toLocaleString()}</span></span>
              <span className="text-gray-300">+</span>
              <span><span className="text-gray-500">SVK </span><span className="font-semibold text-gray-800">₹{svkAmount.toLocaleString()}</span></span>
              <span className="text-gray-300">+</span>
              <span><span className="text-gray-500">Additional </span><span className="font-semibold text-gray-800">₹{additionalTotal.toLocaleString()}</span></span>
              <span className="text-gray-300">=</span>
              <span><span className="text-gray-500">Grand Total </span><span className="text-sm font-bold text-blue-700">₹{grandTotal.toLocaleString()}</span></span>
            </div>
            <div className="flex items-center gap-2">
              {saveSuccess && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
              {error && <span className="text-xs text-red-600">{error}</span>}
              {dirty && (
                <Button size="sm" variant="secondary" onClick={discardChanges} disabled={saving}>
                  Discard
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => void handleSave()}
                loading={saving}
                disabled={!allSelected}
              >
                {isExisting ? 'Update Structure' : 'Save Structure'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
