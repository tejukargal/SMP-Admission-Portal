import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '../components/common/Button';
import {
  parseBoardWorkbook, scanBoardCorrections, applyBoardCorrections, undoBoardRun, listBoardRuns,
  BOARD_FIELDS, REQUIRED_COLUMNS,
  type ApplyResult, type BoardRun, type BoardScan, type BoardWorkbook, type UndoResult,
} from '../services/boardCorrectionService';

// Settings › Import › Board Corrections: pick file → preview → update → result (with undo).

type PageState = 'idle' | 'scanning' | 'preview' | 'importing' | 'done';

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="text-center">
      <p className={`text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export function ImportBoardCorrections() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageState, setPageState] = useState<PageState>('idle');
  const [wb, setWb] = useState<BoardWorkbook | null>(null);
  const [scan, setScan] = useState<BoardScan | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [runs, setRuns] = useState<BoardRun[]>([]);
  const [runsError, setRunsError] = useState('');
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoResult, setUndoResult] = useState<UndoResult | null>(null);

  async function refreshRuns() {
    try {
      setRuns(await listBoardRuns());
      setRunsError('');
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : 'Could not load recent imports.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    listBoardRuns()
      .then((r) => { if (!cancelled) setRuns(r); })
      .catch((err: unknown) => {
        if (!cancelled) setRunsError(err instanceof Error ? err.message : 'Could not load recent imports.');
      });
    return () => { cancelled = true; };
  }, []);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    setUndoResult(null);
    setPageState('scanning');
    try {
      const book = await parseBoardWorkbook(await file.arrayBuffer(), file.name);
      setWb(book);
      setScan(await scanBoardCorrections(book));
      setPageState('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.');
      setPageState('idle');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleImport() {
    if (!wb) return;
    setError('');
    setPageState('importing');
    setProgress({ current: 0, total: 0 });
    try {
      setResult(await applyBoardCorrections(wb, (current, total) => setProgress({ current, total })));
      setPageState('done');
      void refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed. Nothing was written.');
      setPageState('preview');
    }
  }

  function handleReset() {
    setPageState('idle');
    setWb(null);
    setScan(null);
    setError('');
    setResult(null);
    setProgress({ current: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleUndo(run: BoardRun) {
    const ok = window.confirm(
      `Undo the import from ${new Date(run.createdAt).toLocaleString()}? `
      + `${run.studentsApplied} student(s) go back to their earlier Reg No and details. Any value edited since is left as it is.`,
    );
    if (!ok) return;
    setError('');
    setUndoResult(null);
    setUndoingId(run.id);
    try {
      setUndoResult(await undoBoardRun(run.id));
      await refreshRuns();
      if (wb && pageState === 'preview') setScan(await scanBoardCorrections(wb));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed.');
    } finally {
      setUndoingId(null);
    }
  }

  const entries = scan?.entries ?? [];
  const toUpdate = entries.filter((e) => e.status === 'update');
  const same = entries.filter((e) => e.status === 'same');
  const skipped = entries.filter((e) => e.status === 'skip');
  const warnings = entries.flatMap((e) => e.warnings.map((w) => ({ rowNo: e.rowNo, reg: e.tempReg || e.newReg, w })));
  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const busy = pageState === 'scanning' || pageState === 'importing' || undoingId !== null;

  return (
    <div className="max-w-5xl space-y-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-md px-4 py-3">{error}</p>
      )}

      {/* Upload */}
      {(pageState === 'idle' || pageState === 'scanning') && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-1">Board Corrections</h3>
          <p className="text-sm text-gray-500 mb-4">
            Replaces each student's Temp Reg No with the Board Reg No and updates the corrected details.
          </p>

          <div
            className={`border-2 border-dashed border-gray-300 rounded-lg p-10 text-center transition-colors ${
              pageState === 'scanning' ? 'opacity-60' : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50'
            }`}
            onClick={() => { if (pageState === 'idle') fileInputRef.current?.click(); }}
          >
            <div className="text-4xl mb-3">📂</div>
            <p className="text-sm font-medium text-gray-700">
              {pageState === 'scanning' ? 'Reading file and matching students…' : 'Click to browse your Excel file'}
            </p>
            <p className="text-xs text-gray-400 mt-1">.xlsx or .xls format</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { void handleFileChange(e); }}
          />

          <div className="mt-5 text-sm text-gray-500">
            <p className="font-medium text-gray-700 mb-1">Column reference:</p>
            <div className="bg-gray-50 rounded p-3 space-y-1">
              <p className="text-xs">
                <span className="font-semibold text-gray-700">Required:</span>{' '}
                <span className="font-mono">{REQUIRED_COLUMNS.join(' · ')}</span>
              </p>
              <p className="text-xs">
                <span className="font-semibold text-gray-700">Updated:</span>{' '}
                <span className="font-mono">Reg No · {BOARD_FIELDS.map((f) => f.label).join(' · ')}</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Each row is matched on its Temp Reg No (or on the Board Reg No if it was already updated).
                All other columns and details are left as they are. Blank cells are not changed.
              </p>
              <p className="text-xs text-gray-400">
                The new Reg No is also applied to the student's fee records, refunds, files, messages and notices.
                The old number stays searchable. Every import can be undone below.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Preview */}
      {pageState === 'preview' && wb && (
        <>
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Preview</h3>
                <p className="text-sm text-gray-500 mt-0.5">{wb.fileName}</p>
              </div>
              <button className="text-xs text-gray-400 hover:text-gray-600 underline" onClick={handleReset}>
                Change file
              </button>
            </div>

            <div className="flex items-center gap-6 mb-5 flex-wrap">
              <Stat value={entries.length} label="Total Rows" tone="text-blue-600" />
              <Stat value={toUpdate.length} label="Will Update" tone="text-green-600" />
              <Stat value={same.length} label="Already Up to Date" tone="text-gray-500" />
              {skipped.length > 0 && <Stat value={skipped.length} label="Skipped" tone="text-red-500" />}
            </div>

            {toUpdate.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Changes ({toUpdate.length} students)</p>
                <div className="overflow-x-auto max-h-[28rem] overflow-y-auto border border-gray-100 rounded">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="py-2 px-3 font-medium">Row</th>
                        <th className="py-2 px-3 font-medium">Student</th>
                        <th className="py-2 px-3 font-medium">Field</th>
                        <th className="py-2 px-3 font-medium">Now</th>
                        <th className="py-2 px-3 font-medium">New</th>
                      </tr>
                    </thead>
                    <tbody>
                      {toUpdate.map((e) => e.changes.map((c, i) => (
                        <tr key={`${e.rowNo}-${c.field}`} className={i === 0 ? 'border-t border-gray-100' : ''}>
                          {i === 0 && (
                            <>
                              <td rowSpan={e.changes.length} className="py-1.5 px-3 align-top text-gray-400 tabular-nums">{e.rowNo}</td>
                              <td rowSpan={e.changes.length} className="py-1.5 px-3 align-top whitespace-nowrap">
                                <p className="text-gray-800 font-medium">{e.name}</p>
                                <p className="font-mono text-gray-400">{e.currentReg}</p>
                              </td>
                            </>
                          )}
                          <td className="py-1.5 px-3 text-gray-500 whitespace-nowrap">{c.label}</td>
                          <td className="py-1.5 px-3 text-gray-500 line-through decoration-gray-300">{c.before || '—'}</td>
                          <td className="py-1.5 px-3 text-gray-900 font-medium">{c.after}</td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-md px-4 py-3">Nothing to update. Every matched student already has these details.</p>
            )}

            {skipped.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-red-600 mb-2">Will be skipped ({skipped.length}):</p>
                <div className="bg-red-50 rounded-md px-4 py-3 max-h-48 overflow-y-auto space-y-1">
                  {skipped.map((e) => (
                    <p key={e.rowNo} className="text-xs text-red-700 font-mono">
                      Row {e.rowNo} ({e.name || e.tempReg || e.newReg}): {e.skipReason}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-amber-700 mb-2">
                  Field warnings ({warnings.length}): these cells are skipped, the rest of the row is updated:
                </p>
                <div className="bg-amber-50 rounded-md px-4 py-3 max-h-48 overflow-y-auto space-y-1">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-800 font-mono">Row {w.rowNo} ({w.reg}): {w.w}</p>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="flex gap-3">
            <Button size="lg" disabled={toUpdate.length === 0 || busy} onClick={() => { void handleImport(); }}>
              Update {toUpdate.length} Students
            </Button>
            <Button size="lg" variant="secondary" onClick={handleReset}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {/* Progress */}
      {pageState === 'importing' && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Updating records...</h3>
          <p className="text-sm text-gray-600 mb-3">
            {progress.total > 0 ? `Saved ${progress.current} of ${progress.total} students` : 'Re-checking records on the server…'}
          </p>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div className="h-3 bg-blue-500 rounded-full transition-all duration-150" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1.5 text-right">{progressPct}%</p>
        </section>
      )}

      {/* Result */}
      {pageState === 'done' && result && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Import Complete</h3>

          <div className="flex gap-6 mb-5 flex-wrap">
            <Stat value={result.studentsApplied} label="Students Updated" tone="text-green-600" />
            <Stat value={result.recordsWritten} label="Records Updated" tone="text-green-600" />
            {result.skipped.length > 0 && <Stat value={result.skipped.length} label="Skipped" tone="text-red-500" />}
          </div>

          {!result.error && result.studentsApplied > 0 && (
            <p className="text-sm text-green-700 bg-green-50 rounded-md px-4 py-3 mb-4">
              {result.studentsApplied} students updated. Students now log in with their new Reg No (or mobile number) and DOB.
              No one is messaged automatically.
            </p>
          )}
          {!result.error && result.studentsApplied === 0 && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-md px-4 py-3 mb-4">Nothing needed updating.</p>
          )}
          {result.error && (
            <p className="text-sm text-red-700 bg-red-50 rounded-md px-4 py-3 mb-4">
              Stopped after {result.studentsApplied} students: {result.error}. The students saved so far are complete; upload the file again to continue.
            </p>
          )}

          {result.skipped.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-red-600 mb-2">Not updated ({result.skipped.length}):</p>
              <div className="bg-red-50 rounded-md px-4 py-3 max-h-48 overflow-y-auto space-y-1">
                {result.skipped.map((s) => (
                  <p key={s.rowNo} className="text-xs text-red-700 font-mono">Row {s.rowNo} ({s.name || s.regNo}): {s.reason}</p>
                ))}
              </div>
            </div>
          )}

          <Button variant="secondary" onClick={handleReset}>Import Another File</Button>
        </section>
      )}

      {undoResult && (
        <div className={`rounded-md px-4 py-3 text-sm ${undoResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          <p>
            {undoResult.studentsRestored} student(s) restored.
            {undoResult.error && ` Stopped early: ${undoResult.error}`}
          </p>
          {undoResult.conflicts.length > 0 && (
            <div className="mt-2 text-xs text-amber-800 space-y-0.5 max-h-40 overflow-y-auto">
              <p className="font-medium">Edited since the import, left as is:</p>
              {undoResult.conflicts.map((c, i) => <p key={i}>{c}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Recent imports */}
      {(runs.length > 0 || runsError) && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Recent imports</h3>
          {runsError && <p className="text-xs text-red-600">Could not load recent imports: {runsError}</p>}
          <div className="divide-y divide-gray-100">
            {runs.map((run) => (
              <div key={run.id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                <span className="font-medium text-gray-800">{new Date(run.createdAt).toLocaleString()}</span>
                <span className="text-gray-500 truncate max-w-[14rem]">{run.fileName}</span>
                <span>{run.studentsApplied} student(s)</span>
                <span className={run.status === 'done' ? 'text-green-700' : run.status === 'undone' ? 'text-gray-500' : 'text-amber-700'}>{run.status}</span>
                {run.status !== 'undone' && (
                  <span className="ml-auto">
                    <Button variant="secondary" size="sm" disabled={busy} loading={undoingId === run.id} onClick={() => { void handleUndo(run); }}>
                      Undo
                    </Button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
