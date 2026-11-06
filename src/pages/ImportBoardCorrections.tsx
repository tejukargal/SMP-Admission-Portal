import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Button } from '../components/common/Button';
import {
  parseBoardWorkbook, scanBoardCorrections, applyBoardCorrections, undoBoardRun, listBoardRuns,
  downloadBeforeState, countPlannedRecords, defaultApproved, COLLECTION_LABEL, GROUP_LABEL,
  type ApplyResult, type BoardEntry, type BoardRun, type BoardScan, type BoardWorkbook,
  type ChangeCell, type ChangeGroup, type ReportRow, type ScanStage, type UndoResult,
} from '../services/boardCorrectionService';

// Settings › Import › Board Corrections: Upload → Checks → Review → Backup → Pilot/Apply → Verify/Undo.

const STAGE_LABEL: Record<ScanStage, string> = {
  students: 'Loading student records from the server…',
  linked: 'Loading fee records, files, notices and other linked records…',
  analysing: 'Comparing with the workbook…',
};

const GROUP_HINT: Record<ChangeGroup, string> = {
  regno: 'Temporary number replaced everywhere it is stored. The student logs in with the new number afterwards.',
  cleanup: 'Extra spaces, and spelling standardised in the Change Log for town, taluk, district, address and caste.',
  confirm: 'Names, DOB and gender print on certificates. Check each against the SSLC marks card or Aadhaar, then tick it.',
  unexpected: 'Differs from the record but not explained by the Change Log. Someone may have edited the record or the file after your export.',
};

const GROUPS: ChangeGroup[] = ['regno', 'confirm', 'cleanup', 'unexpected'];

function Stat({ value, label, tone = 'text-gray-700' }: { value: number; label: string; tone?: string }) {
  return (
    <div className="text-center min-w-[5rem]">
      <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function Collapsible({ title, hint, count, tone, action, defaultOpen = false, children }: {
  title: string;
  hint: string;
  count: number;
  tone: 'blue' | 'amber' | 'red' | 'gray';
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneClass = count === 0
    ? 'bg-green-50 text-green-700'
    : { blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', gray: 'bg-gray-100 text-gray-600' }[tone];
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <span className={`min-w-[3rem] text-center rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums ${toneClass}`}>
          {count === 0 ? '✓' : count}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800">{title}</p>
          <p className="text-xs text-gray-400">{hint}</p>
        </div>
        {count > 0 && action}
        {count > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer">
            {open ? 'Hide' : 'Review'}
          </button>
        )}
      </div>
      {open && count > 0 && <div className="px-4 pb-4 pt-1 border-t border-gray-100 max-h-[32rem] overflow-auto">{children}</div>}
    </div>
  );
}

function ReportTable({ rows, problemLabel = 'Detail' }: { rows: ReportRow[]; problemLabel?: string }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-500 border-b border-gray-100">
          <th className="py-1.5 pr-3 font-medium">Student</th>
          <th className="py-1.5 pr-3 font-medium">Reg No</th>
          <th className="py-1.5 font-medium">{problemLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-gray-50 align-top">
            <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap">{r.name}</td>
            <td className="py-1.5 pr-3 font-mono text-gray-600 whitespace-nowrap">{r.regNo || '—'}</td>
            <td className="py-1.5 text-gray-600">{r.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CellTable({ rows, approved, disabled, onToggle }: {
  rows: { entry: BoardEntry; cell: ChangeCell }[];
  approved: ReadonlySet<string>;
  disabled: boolean;
  onToggle: (key: string, value: boolean) => void;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-500 border-b border-gray-100">
          <th className="py-1.5 pr-2 font-medium w-6" aria-label="Apply" />
          <th className="py-1.5 pr-3 font-medium">Student</th>
          <th className="py-1.5 pr-3 font-medium">Reg No</th>
          <th className="py-1.5 pr-3 font-medium">Field</th>
          <th className="py-1.5 pr-3 font-medium">On record</th>
          <th className="py-1.5 font-medium">New value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ entry, cell }) => (
          <tr key={cell.key} className="border-b border-gray-50 align-top">
            <td className="py-1.5 pr-2">
              <input
                type="checkbox"
                aria-label={`Apply ${cell.label} for ${entry.name}`}
                checked={approved.has(cell.key)}
                disabled={disabled}
                onChange={(e) => onToggle(cell.key, e.target.checked)}
                className="cursor-pointer"
              />
            </td>
            <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap">{entry.name}</td>
            <td className="py-1.5 pr-3 font-mono text-gray-600 whitespace-nowrap">{entry.newReg}</td>
            <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">{cell.label}</td>
            <td className="py-1.5 pr-3 text-red-500 whitespace-pre-wrap">{cell.before || '∅'}</td>
            <td className="py-1.5 text-green-700">
              {cell.after}
              {cell.note && <span className="block text-gray-400">{cell.note}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ImportBoardCorrections() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wb, setWb] = useState<BoardWorkbook | null>(null);
  const [scan, setScan] = useState<BoardScan | null>(null);
  const [stage, setStage] = useState<ScanStage | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  /** Explicit ticks and unticks. Anything absent uses its group's default. */
  const [decisions, setDecisions] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [backupDone, setBackupDone] = useState(false);
  const [mode, setMode] = useState<'pilot' | 'full'>('pilot');
  const [pilotRow, setPilotRow] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [runs, setRuns] = useState<BoardRun[]>([]);
  const [runsError, setRunsError] = useState('');
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoResult, setUndoResult] = useState<UndoResult | null>(null);

  const scanning = stage !== null;
  const applying = progress !== null;
  const busy = scanning || applying || undoingId !== null;

  async function refreshRuns() {
    try {
      setRuns(await listBoardRuns());
      setRunsError('');
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : 'Could not load past runs.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    listBoardRuns()
      .then((r) => { if (!cancelled) setRuns(r); })
      .catch((err: unknown) => {
        if (!cancelled) setRunsError(err instanceof Error ? err.message : 'Could not load past runs.');
      });
    return () => { cancelled = true; };
  }, []);

  async function runScan(book: BoardWorkbook) {
    setError('');
    try {
      const result = await scanBoardCorrections(book, setStage);
      setScan(result);
      // The before-state just changed, so any earlier download no longer describes it.
      setBackupDone(false);
      setConfirmText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed. Check your connection and try again.');
    } finally {
      setStage(null);
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setScan(null);
    setDecisions(new Map());
    setApplyResult(null);
    setUndoResult(null);
    try {
      const book = await parseBoardWorkbook(await file.arrayBuffer(), file.name);
      setWb(book);
      await runScan(book);
    } catch (err) {
      setWb(null);
      setError(err instanceof Error ? err.message : 'Could not read this file.');
    }
  }

  function reset() {
    setWb(null);
    setScan(null);
    setDecisions(new Map());
    setApplyResult(null);
    setUndoResult(null);
    setError('');
    setSearch('');
    setBackupDone(false);
    setConfirmText('');
    setPilotRow('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const clearEntries = useMemo(() => (scan?.entries ?? []).filter((e) => e.blockers.length === 0), [scan]);

  const approved = useMemo(() => {
    const set = new Set<string>();
    for (const e of clearEntries) {
      for (const c of e.cells) {
        if (decisions.get(c.key) ?? defaultApproved(c)) set.add(c.key);
      }
    }
    return set;
  }, [clearEntries, decisions]);

  const readyEntries = useMemo(
    () => clearEntries.filter((e) => e.cells.some((c) => approved.has(c.key))),
    [clearEntries, approved],
  );

  const rowsByGroup = useMemo(() => {
    const out: Record<ChangeGroup, { entry: BoardEntry; cell: ChangeCell }[]> = { regno: [], cleanup: [], confirm: [], unexpected: [] };
    for (const entry of clearEntries) {
      for (const cell of entry.cells) out[cell.group].push({ entry, cell });
    }
    return out;
  }, [clearEntries]);

  const needle = search.trim().toUpperCase();
  const matches = (name: string, ...regs: string[]) =>
    !needle || name.toUpperCase().includes(needle) || regs.some((r) => r.toUpperCase().includes(needle));

  function toggle(key: string, value: boolean) {
    setDecisions((prev) => new Map(prev).set(key, value));
    setConfirmText('');
  }

  function setGroup(group: ChangeGroup, value: boolean) {
    setDecisions((prev) => {
      const next = new Map(prev);
      for (const { cell } of rowsByGroup[group]) next.set(cell.key, value);
      return next;
    });
    setConfirmText('');
  }

  const targetEntries = useMemo(
    () => (mode === 'full' ? readyEntries : readyEntries.filter((e) => e.rowNo === pilotRow)),
    [mode, pilotRow, readyEntries],
  );
  const phrase = `APPLY ${targetEntries.length}`;

  const plannedRecords = useMemo(() => {
    const totals: Record<string, number> = {};
    if (!scan) return totals;
    for (const e of targetEntries) {
      for (const [col, n] of Object.entries(countPlannedRecords(e, approved, scan.data))) {
        totals[col] = (totals[col] ?? 0) + n;
      }
    }
    return totals;
  }, [scan, approved, targetEntries]);

  async function handleBackup() {
    if (!wb || !scan) return;
    setError('');
    try {
      await downloadBeforeState(wb, scan, approved);
      setBackupDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    }
  }

  async function handleApply() {
    if (!wb || !scan || targetEntries.length === 0) return;
    setError('');
    setApplyResult(null);
    setUndoResult(null);
    setProgress({ done: 0, total: targetEntries.length });
    try {
      const result = await applyBoardCorrections(
        wb, scan, approved, new Set(targetEntries.map((e) => e.rowNo)), mode,
        (done, total) => setProgress({ done, total }),
      );
      setApplyResult(result);
      setPilotRow('');
      setProgress(null);
      await Promise.all([runScan(wb), refreshRuns()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed. Nothing further was written.');
      setProgress(null);
    }
  }

  async function handleUndo(run: BoardRun) {
    const ok = window.confirm(
      `Undo this ${run.kind} run from ${new Date(run.createdAt).toLocaleString()}? `
      + `${run.studentsApplied} student(s) go back to their earlier values. Any value edited since the run is left as it is.`,
    );
    if (!ok) return;
    setError('');
    setApplyResult(null);
    setUndoResult(null);
    setUndoingId(run.id);
    try {
      setUndoResult(await undoBoardRun(run.id));
      await refreshRuns();
      if (wb) await runScan(wb);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed.');
    } finally {
      setUndoingId(null);
    }
  }

  const categoryRows = useMemo<ReportRow[]>(
    () => (wb?.toVerify ?? [])
      .filter((r) => r.issue.startsWith('Category differs'))
      .map((r) => ({ name: r.name, regNo: r.regNo, detail: `On record: ${r.current || '—'}. Board: ${r.board || '—'}. ${r.action}` })),
    [wb],
  );

  const otherToVerify = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of wb?.toVerify ?? []) {
      if (!r.issue.startsWith('Category differs')) counts.set(r.issue, (counts.get(r.issue) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [wb]);

  const leftoverEntries = scan ? Object.entries(scan.leftoverTotals) : [];
  const leftoverCount = leftoverEntries.reduce((n, [, c]) => n + c, 0);
  const allMoved = !!scan && scan.stillTemporary === 0 && leftoverCount === 0;
  const progressPct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="max-w-5xl space-y-4">
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-800">Board Corrections</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Replaces temporary Reg Nos with Board-allotted ones and applies corrected details across every linked record.
              Scanning only reads data. Nothing changes until you apply, and every run can be undone.
            </p>
            {wb && <p className="text-xs text-gray-400 mt-1">{wb.fileName} · {wb.rows.length} students in file</p>}
          </div>
          {wb && (
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => { void runScan(wb); }}>Scan again</Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={reset}>Change file</Button>
            </div>
          )}
        </div>

        {!wb && (
          <>
            <button
              type="button"
              className="mt-4 w-full border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="block text-sm font-medium text-gray-700">Click to choose the corrected Excel workbook</span>
              <span className="block text-xs text-gray-400 mt-1">
                Needs a Students sheet with Reg No and Temp Reg No. Reg No Mapping, Change Log and To Verify sheets are used when present.
              </span>
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { void handleFile(e); }} />
          </>
        )}

        {stage && <p className="mt-4 text-sm text-blue-700 bg-blue-50 rounded-md px-4 py-3">{STAGE_LABEL[stage]}</p>}
        {error && <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-md px-4 py-3">{error}</p>}
      </section>

      {applyResult && (
        <section className={`rounded-lg border p-4 text-sm ${applyResult.error ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
          <p className="font-medium">
            {applyResult.studentsApplied} student(s) updated, {applyResult.recordsWritten} record(s) written.
          </p>
          {applyResult.error && (
            <p className="mt-1">
              The run stopped: {applyResult.error}. Students already saved are complete and the rest are untouched. Scan again and apply to continue.
            </p>
          )}
          {applyResult.skipped.length > 0 && (
            <div className="mt-2">
              <p className="font-medium">Skipped ({applyResult.skipped.length}):</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {applyResult.skipped.map((s, i) => <li key={i}>{s.name} ({s.regNo}): {s.reason}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {undoResult && (
        <section className={`rounded-lg border p-4 text-sm ${undoResult.error || undoResult.conflicts.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-green-50 border-green-200 text-green-800'}`}>
          <p className="font-medium">{undoResult.studentsRestored} student(s) restored.</p>
          {undoResult.error && <p className="mt-1">Undo stopped: {undoResult.error}. Press Undo again to continue with the rest.</p>}
          {undoResult.conflicts.length > 0 && (
            <div className="mt-2">
              <p className="font-medium">Left as they are, because they were edited after the run ({undoResult.conflicts.length}):</p>
              <ul className="mt-1 space-y-0.5 text-xs">{undoResult.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {scan && (
        <>
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Stat value={scan.entries.length} label="Matched" tone="text-blue-600" />
              <Stat value={scan.blocked.length} label="Blocked" tone={scan.blocked.length ? 'text-red-500' : 'text-gray-400'} />
              <Stat value={scan.stillTemporary} label="Still on temporary Reg No" tone={scan.stillTemporary ? 'text-amber-600' : 'text-green-600'} />
              <Stat value={leftoverCount} label="Records under old numbers" tone={leftoverCount ? 'text-amber-600' : 'text-green-600'} />
              <Stat value={readyEntries.length} label="Students ready to apply" tone="text-gray-700" />
            </div>
            {leftoverCount > 0 && (
              <p className="mt-3 text-xs text-gray-500">
                Under old numbers: {leftoverEntries.map(([col, n]) => `${COLLECTION_LABEL[col] ?? col} ${n}`).join(' · ')}
              </p>
            )}
            {allMoved && runs.length > 0 && (
              <p className="mt-3 text-sm text-green-700 bg-green-50 rounded-md px-4 py-2">
                Verified on the server: no student in this file is on a temporary number, and no record is filed under one.
              </p>
            )}
            {!wb?.hasChangeLog && (
              <p className="mt-3 text-xs text-amber-800 bg-amber-50 rounded-md px-3 py-2">
                No Change Log sheet in this file, so every real difference is listed as Unexpected and must be ticked by hand.
              </p>
            )}
          </section>

          <Collapsible
            title="Blocked"
            hint="These can't be applied until fixed. Other students are not affected."
            count={scan.blocked.length}
            tone="red"
            defaultOpen
          >
            <ReportTable rows={scan.blocked} problemLabel="Problem" />
          </Collapsible>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter changes by name or Reg No"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />

          {GROUPS.map((group) => {
            const rows = rowsByGroup[group];
            const ticked = rows.filter((r) => approved.has(r.cell.key)).length;
            const visible = rows.filter((r) => matches(r.entry.name, r.entry.newReg, r.entry.tempReg));
            const allowBulk = group === 'regno' || group === 'cleanup';
            return (
              <Collapsible
                key={group}
                title={`${GROUP_LABEL[group]} · ${ticked} of ${rows.length} ticked`}
                hint={GROUP_HINT[group]}
                count={rows.length}
                tone={group === 'unexpected' || group === 'confirm' ? 'amber' : 'blue'}
                defaultOpen={group === 'confirm' || group === 'unexpected'}
                action={allowBulk ? (
                  <div className="flex gap-2 text-xs">
                    <button type="button" disabled={busy} className="text-blue-700 underline cursor-pointer disabled:opacity-50" onClick={() => setGroup(group, true)}>All</button>
                    <button type="button" disabled={busy} className="text-blue-700 underline cursor-pointer disabled:opacity-50" onClick={() => setGroup(group, false)}>None</button>
                  </div>
                ) : undefined}
              >
                {visible.length === 0
                  ? <p className="text-xs text-gray-400 py-2">Nothing matches this filter.</p>
                  : <CellTable rows={visible} approved={approved} disabled={busy} onToggle={toggle} />}
              </Collapsible>
            );
          })}

          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider pt-2">For your information: nothing below is changed</h4>

          <Collapsible title="Category differences from the Board" hint="From the To Verify sheet. Check caste certificates, then use Allotted Category on the student where needed." count={categoryRows.length} tone="amber">
            <ReportTable rows={categoryRows} />
          </Collapsible>
          <Collapsible title="Certificates already issued" hint="Issued history keeps the old details, as they were printed on the certificate." count={scan.certificatesIssued.length} tone="amber">
            <ReportTable rows={scan.certificatesIssued} />
          </Collapsible>
          <Collapsible title="Possible records under another number" hint="Same Aadhaar, or same name, father and DOB, but not linked to this student." count={scan.possibleOtherRecords.length} tone="amber">
            <ReportTable rows={scan.possibleOtherRecords} />
          </Collapsible>
          <Collapsible title="Confirmed students not in this file" hint="Working Professional students are not listed here." count={scan.notInFile.length} tone="amber">
            <ReportTable rows={scan.notInFile} />
          </Collapsible>
          <Collapsible title="Reg Nos not in 308 format" hint="Left as they are." count={scan.nonStandardRegs.length} tone="gray">
            <ReportTable rows={scan.nonStandardRegs} />
          </Collapsible>
          <Collapsible title="No Date of Birth" hint="Blank cells never overwrite data. Enter these on the student's record." count={scan.blankDob.length} tone="amber">
            <ReportTable rows={scan.blankDob} />
          </Collapsible>
          <Collapsible title="Other differences, never written" hint="Religion, mobiles, marks, income, merit no, admission type and status differ between record and file." count={scan.compareDiffs.length} tone="gray">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-1.5 pr-3 font-medium">Student</th>
                  <th className="py-1.5 pr-3 font-medium">Reg No</th>
                  <th className="py-1.5 pr-3 font-medium">Field</th>
                  <th className="py-1.5 pr-3 font-medium">On record</th>
                  <th className="py-1.5 font-medium">In file</th>
                </tr>
              </thead>
              <tbody>
                {scan.compareDiffs.map((d, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap">{d.name}</td>
                    <td className="py-1.5 pr-3 font-mono text-gray-600">{d.regNo}</td>
                    <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">{d.label}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{d.record || '∅'}</td>
                    <td className="py-1.5 text-gray-600">{d.excel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Collapsible>
          {otherToVerify.length > 0 && (
            <p className="text-xs text-gray-500 px-1">
              Also on your To Verify sheet, for correcting through the normal edit form:{' '}
              {otherToVerify.map(([issue, n]) => `${issue} (${n})`).join(' · ')}.
            </p>
          )}

          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">Apply</h3>

            <div className="flex items-start gap-3">
              <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${backupDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {backupDone ? '✓' : '1'}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Download the before-state</p>
                <p className="text-xs text-gray-500 mb-2">
                  An Excel list of every change and a JSON copy of every record this file can touch. Keep both safe: they contain student details.
                </p>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => { void handleBackup(); }}>
                  {backupDone ? 'Download again' : 'Download'}
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">2</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Choose who to apply to</p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-700">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="board-mode" checked={mode === 'pilot'} disabled={busy} onChange={() => { setMode('pilot'); setConfirmText(''); }} />
                    One student (pilot)
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="board-mode" checked={mode === 'full'} disabled={busy} onChange={() => { setMode('full'); setConfirmText(''); }} />
                    All {readyEntries.length} ready students
                  </label>
                </div>
                {mode === 'pilot' && (
                  <select
                    aria-label="Pilot student"
                    value={pilotRow}
                    disabled={busy}
                    onChange={(e) => { setPilotRow(e.target.value); setConfirmText(''); }}
                    className="mt-2 w-full max-w-md rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select a student…</option>
                    {readyEntries.map((e) => (
                      <option key={e.rowNo} value={e.rowNo}>{e.name} · {e.tempReg || e.newReg}</option>
                    ))}
                  </select>
                )}
                {mode === 'full' && (
                  <p className="mt-2 text-xs text-amber-800 bg-amber-50 rounded-md px-3 py-2">
                    Run this when no one is collecting fees or enrolling, and after the pilot student has been checked.
                  </p>
                )}
                {targetEntries.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Will write: {Object.entries(plannedRecords).map(([col, n]) => `${COLLECTION_LABEL[col] ?? col} ${n}`).join(' · ') || 'nothing'}.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">3</span>
              <div className="flex-1">
                <label htmlFor="board-confirm" className="text-sm font-medium text-gray-800">
                  Type <span className="font-mono text-blue-700">{phrase}</span> to confirm
                </label>
                <div className="mt-2 flex flex-wrap gap-3 items-center">
                  <input
                    id="board-confirm"
                    value={confirmText}
                    disabled={busy || !backupDone || targetEntries.length === 0}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-mono disabled:bg-gray-50"
                  />
                  <Button
                    loading={applying}
                    disabled={busy || !backupDone || targetEntries.length === 0 || confirmText.trim() !== phrase}
                    onClick={() => { void handleApply(); }}
                  >
                    {applying ? `Applying ${progress?.done ?? 0} / ${progress?.total ?? 0}` : `Apply to ${targetEntries.length} student(s)`}
                  </Button>
                </div>
                {!backupDone && <p className="mt-1 text-xs text-gray-400">Download the before-state first.</p>}
                {applying && (
                  <div className="mt-3 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-2 bg-blue-500 rounded-full transition-all duration-150" style={{ width: `${progressPct}%` }} />
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
              After a Reg No changes, the old number stops working for login. Students use the new Reg No or their mobile number, with their DOB.
              Anyone already logged in sees "Please sign in again". No one is messaged automatically, so send the new numbers by SMS or notice.
            </p>
          </section>
        </>
      )}

      {(runs.length > 0 || runsError) && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Past runs</h3>
          {runsError && <p className="text-xs text-red-600">Could not load past runs: {runsError}</p>}
          <div className="divide-y divide-gray-100">
            {runs.map((run) => (
              <div key={run.id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                <span className="font-medium text-gray-800">{new Date(run.createdAt).toLocaleString()}</span>
                <span className="capitalize">{run.kind}</span>
                <span>{run.studentsApplied} student(s), {run.recordsWritten} record(s)</span>
                <span className="text-gray-400">{run.createdBy}</span>
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
