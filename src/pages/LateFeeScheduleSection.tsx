import { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../hooks/useSettings';
import { getFineSchedule, saveFineSchedule } from '../services/fineScheduleService';
import { lookupFine } from '../utils/feeCalc';
import { Button } from '../components/common/Button';
import type { AcademicYear, FinePeriod, Year } from '../types';
import { ACADEMIC_YEARS } from '../types';
import { YEARS, selectCls, chipCls, DISCARD_PROMPT } from './feeStructureShared';

interface Props {
  onDirtyChange: (dirty: boolean) => void;
}

const dateInputCls =
  'w-full rounded-md border px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** Shift a YYYY-MM-DD date by `days`. */
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Settings › Fee Structure › Late Fee Schedule: date-based fines per
 *  academic year + study year, auto-filled when collecting fee. */
export function LateFeeScheduleSection({ onDirtyChange }: Props) {
  const { settings, loading: settingsLoading } = useSettings();

  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [studyYear, setStudyYear] = useState<Year>('1ST YEAR');

  const [periods, setPeriods] = useState<FinePeriod[]>([]);
  const [baseline, setBaseline] = useState('[]');
  const [loading, setLoading] = useState(false);
  // True after the first load; later loads keep the editor mounted and just dim it
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Partial<Record<Year, number>>>({});
  const [countsTick, setCountsTick] = useState(0);
  const [previewDate, setPreviewDate] = useState(todayISO);

  useEffect(() => {
    if (settings?.currentAcademicYear && !selectedYear) {
      setSelectedYear(settings.currentAcademicYear);
    }
  }, [settings, selectedYear]);

  // Load the schedule for the chosen academic year + study year
  useEffect(() => {
    if (!selectedYear) { setPeriods([]); setBaseline('[]'); return; }
    let cancelled = false;
    setLoading(true);
    setSuccess(false);
    setError(null);
    getFineSchedule(selectedYear, studyYear)
      .then((p) => { if (!cancelled) { setPeriods(p); setBaseline(JSON.stringify(p)); } })
      .catch(() => { if (!cancelled) { setPeriods([]); setBaseline('[]'); } })
      .finally(() => { if (!cancelled) { setLoading(false); setReady(true); } });
    return () => { cancelled = true; };
  }, [selectedYear, studyYear]);

  // Period counts for each study-year chip
  useEffect(() => {
    if (!selectedYear) { setCounts({}); return; }
    let cancelled = false;
    Promise.all(YEARS.map((y) => getFineSchedule(selectedYear, y).then((p) => [y, p.length] as const)))
      .then((entries) => { if (!cancelled) setCounts(Object.fromEntries(entries)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedYear, countsTick]);

  const dirty = !loading && JSON.stringify(periods) !== baseline;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function guarded(fn: () => void) {
    if (dirty && !window.confirm(DISCARD_PROMPT)) return;
    fn();
  }

  // ── Checks (read-only — the saved order is never changed) ─────────────────
  const checks = useMemo(() => {
    const invalid = new Set<number>();
    const overlapping = new Set<number>();
    const incomplete: number[] = [];
    periods.forEach((p, i) => {
      if (!p.from || !p.to) incomplete.push(i);
      else if (p.from > p.to) invalid.add(i);
    });
    const complete = periods
      .map((p, i) => ({ ...p, i }))
      .filter((p) => p.from && p.to && !invalid.has(p.i));
    const overlaps: [number, number][] = [];
    for (let a = 0; a < complete.length; a++) {
      for (let b = a + 1; b < complete.length; b++) {
        const pa = complete[a], pb = complete[b];
        if (pa.from <= pb.to && pb.from <= pa.to) {
          overlaps.push([pa.i, pb.i]);
          overlapping.add(pa.i);
          overlapping.add(pb.i);
        }
      }
    }
    const sorted = [...complete].sort((a, b) => a.from.localeCompare(b.from));
    const gaps: { from: string; to: string }[] = [];
    for (let k = 1; k < sorted.length; k++) {
      const maxPrevTo = sorted.slice(0, k).reduce((m, p) => (p.to > m ? p.to : m), '');
      const gapStart = shiftDate(maxPrevTo, 1);
      if (sorted[k].from > gapStart) gaps.push({ from: gapStart, to: shiftDate(sorted[k].from, -1) });
    }
    return { invalid, overlapping, overlaps, incomplete, gaps };
  }, [periods]);

  const previewFine = previewDate ? lookupFine(previewDate, periods) : 0;

  function addPeriod() {
    // Start the new period the day after the latest existing end date
    const lastTo = periods.reduce((m, p) => (p.to > m ? p.to : m), '');
    setPeriods((prev) => [...prev, { from: lastTo ? shiftDate(lastTo, 1) : '', to: '', amount: 0 }]);
    setSuccess(false);
  }

  function updatePeriod(idx: number, field: keyof FinePeriod, val: string) {
    setPeriods((prev) =>
      prev.map((p, i) =>
        i === idx
          ? { ...p, [field]: field === 'amount' ? Math.max(0, parseInt(val) || 0) : val }
          : p
      )
    );
    setSuccess(false);
  }

  function removePeriod(idx: number) {
    setPeriods((prev) => prev.filter((_, i) => i !== idx));
    setSuccess(false);
  }

  async function handleSave() {
    if (!selectedYear) return;
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      const toSave = periods.filter((p) => p.from && p.to);
      await saveFineSchedule(selectedYear, studyYear, toSave);
      setPeriods(toSave);
      setBaseline(JSON.stringify(toSave));
      setCountsTick((t) => t + 1);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save fine schedule');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">

      <div>
        <h2 className="text-base font-semibold text-gray-900 leading-tight">Late Fee Schedule</h2>
        <p className="text-xs text-gray-500">
          Date ranges with a fine amount. When collecting fee, the fine auto-fills from the period that
          contains the payment date. Set separately for each study year.
        </p>
      </div>

      {/* Scope */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Academic Year</span>
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
            {ACADEMIC_YEARS.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Study Year</span>
          <div className="flex gap-1.5">
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                className={chipCls(studyYear === y)}
                onClick={() => { if (y !== studyYear) guarded(() => setStudyYear(y)); }}
              >
                {y}
                {counts[y] !== undefined && (
                  <span className={`ml-1.5 text-[10px] ${studyYear === y ? 'text-blue-100' : 'text-gray-400'}`}>
                    {counts[y] ? `${counts[y]} period${counts[y]! > 1 ? 's' : ''}` : 'none'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!selectedYear ? (
        <div className="py-10 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
          Select an academic year to begin.
        </div>
      ) : loading && !ready ? (
        <div className="py-10 text-center text-sm text-gray-500">Loading schedule…</div>
      ) : (
        <div
          className={`grid grid-cols-1 xl:grid-cols-[3fr_1.3fr] gap-3 items-start transition-opacity duration-150 ${
            loading ? 'opacity-60 pointer-events-none' : ''
          }`}
          aria-busy={loading}
        >

          {/* Periods */}
          <div className="bg-white rounded-lg border border-amber-200 shadow-sm">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-amber-100 bg-amber-50/50 rounded-t-lg">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{studyYear} · {selectedYear}</h3>
                {dirty && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                    ● Unsaved changes
                  </span>
                )}
              </div>
              <span className="text-[11px] text-gray-500">
                Falls back to the shared schedule if none is saved for this study year.
              </span>
            </div>

            <div className="p-4">
              {periods.length === 0 ? (
                <p className="text-xs text-gray-400 mb-3">No fine periods — no late fee will be auto-filled.</p>
              ) : (
                <div className="space-y-1.5 mb-3">
                  <div className="grid grid-cols-[1.5rem_1fr_1fr_8rem_1.5rem] gap-2 px-0.5">
                    <span />
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">From</span>
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">To (inclusive)</span>
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Fine</span>
                    <span />
                  </div>
                  {periods.map((p, idx) => {
                    const bad = checks.invalid.has(idx);
                    const overlap = checks.overlapping.has(idx);
                    const border = bad ? 'border-red-400 bg-red-50' : overlap ? 'border-amber-400' : 'border-gray-300';
                    return (
                      <div key={idx} className="grid grid-cols-[1.5rem_1fr_1fr_8rem_1.5rem] gap-2 items-center">
                        <span className="text-[11px] text-gray-400 text-right">{idx + 1}.</span>
                        <input
                          type="date"
                          value={p.from}
                          onChange={(e) => updatePeriod(idx, 'from', e.target.value)}
                          className={`${dateInputCls} ${!p.from ? 'border-amber-300' : border}`}
                        />
                        <input
                          type="date"
                          value={p.to}
                          min={p.from || undefined}
                          onChange={(e) => updatePeriod(idx, 'to', e.target.value)}
                          className={`${dateInputCls} ${!p.to ? 'border-amber-300' : border}`}
                        />
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                          <input
                            type="number"
                            min="0"
                            value={p.amount === 0 ? '' : p.amount}
                            onChange={(e) => updatePeriod(idx, 'amount', e.target.value)}
                            placeholder="0"
                            className="w-full rounded-md border border-gray-300 pl-6 pr-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removePeriod(idx)}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                          title="Remove period"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Check messages */}
              <div className="space-y-1 mb-3">
                {checks.invalid.size > 0 && (
                  <p className="text-[11px] text-red-600">
                    ✕ Period {[...checks.invalid].map((i) => i + 1).join(', ')}: "From" is after "To". Fix before saving.
                  </p>
                )}
                {checks.overlaps.map(([a, b]) => (
                  <p key={`${a}-${b}`} className="text-[11px] text-amber-700">
                    ⚠ Periods {a + 1} and {b + 1} overlap — on shared dates the earlier row (period {Math.min(a, b) + 1}) wins.
                  </p>
                ))}
                {checks.gaps.map((g) => (
                  <p key={g.from} className="text-[11px] text-gray-500">
                    ⓘ No fine from {fmtDate(g.from)} to {fmtDate(g.to)}.
                  </p>
                ))}
                {checks.incomplete.length > 0 && (
                  <p className="text-[11px] text-amber-700">
                    Period {checks.incomplete.map((i) => i + 1).join(', ')} missing a date — will be skipped when saving.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={addPeriod}
                  className="text-xs text-amber-700 hover:text-amber-900 font-medium cursor-pointer hover:underline"
                >
                  + Add fine period
                </button>
                <div className="flex items-center gap-2">
                  {success && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
                  {error && <span className="text-xs text-red-600">{error}</span>}
                  {dirty && (
                    <Button size="sm" variant="secondary" onClick={() => setPeriods(JSON.parse(baseline) as FinePeriod[])} disabled={saving}>
                      Discard
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => void handleSave()}
                    loading={saving}
                    disabled={checks.invalid.size > 0}
                  >
                    Save Schedule
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 space-y-2">
            <h3 className="text-sm font-semibold text-gray-800">Check a date</h3>
            <p className="text-[11px] text-gray-500">See what fine would auto-fill for a payment on this date.</p>
            <input
              type="date"
              value={previewDate}
              onChange={(e) => setPreviewDate(e.target.value)}
              className={`${dateInputCls} border-gray-300`}
            />
            <div className={`rounded-md px-3 py-2 text-center ${previewFine > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
              <p className="text-[11px] text-gray-500">Fine on {previewDate ? fmtDate(previewDate) : '—'}</p>
              <p className={`text-lg font-bold ${previewFine > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                ₹{previewFine.toLocaleString()}
              </p>
            </div>
            {dirty && <p className="text-[11px] text-orange-600">Preview includes unsaved changes.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
