import { useState, type ReactNode } from 'react';
import { Button } from '../components/common/Button';
import { loadXlsx } from '../utils/lazyLibs';
import {
  scanDataHealth, applyStudentPatches, applyFeePatches, resolveConflict, fieldLabel,
  type DataHealthReport, type Patch, type ConflictRow, type Issue, type IssueKind, type ScanStage,
} from '../services/dataHealthService';

// Settings › Backup & Restore › Data Health — scan (read-only) → review → fix.

const ROW_LIMIT = 200;

const STAGE_LABEL: Record<ScanStage, string> = {
  students: 'Loading students…',
  fees: 'Loading fee records…',
  analysing: 'Analysing…',
};

const ISSUE_LABEL: Record<IssueKind, string> = {
  'invalid-mobile': 'Invalid mobile',
  'invalid-aadhar': 'Invalid Aadhar',
  'invalid-dob': 'Invalid DOB',
  'invalid-value': 'Invalid value',
  'missing-reg': 'Missing Reg No',
  'reg-format': 'Reg No format',
  'duplicate-enrollment': 'Duplicate enrollment',
  'duplicate-aadhar': 'Shared Aadhar',
  'orphan-fee': 'Orphan fee record',
  'fee-reg-mismatch': 'Fee Reg No mismatch',
};

type CardId = 'fill' | 'conflicts' | 'cleanup' | 'invalid' | 'duplicates' | 'feeSync' | 'feeLinks';

const INVALID_KINDS: IssueKind[] = ['invalid-mobile', 'invalid-aadhar', 'invalid-dob', 'invalid-value', 'missing-reg', 'reg-format'];
const DUPLICATE_KINDS: IssueKind[] = ['duplicate-enrollment', 'duplicate-aadhar'];
const FEE_LINK_KINDS: IssueKind[] = ['orphan-fee', 'fee-reg-mismatch'];

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === '') return '∅';
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

function MoreNote({ total }: { total: number }) {
  if (total <= ROW_LIMIT) return null;
  return <p className="text-xs text-gray-400 mt-2">+{total - ROW_LIMIT} more — export the report to see all.</p>;
}

function PatchTable({ patches }: { patches: Patch[] }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="py-1.5 pr-3 font-medium">Student</th>
              <th className="py-1.5 pr-3 font-medium">Reg No</th>
              <th className="py-1.5 pr-3 font-medium">Year</th>
              <th className="py-1.5 font-medium">Changes</th>
            </tr>
          </thead>
          <tbody>
            {patches.slice(0, ROW_LIMIT).map((p) => (
              <tr key={p.id} className="border-b border-gray-50 align-top">
                <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap">{p.name}</td>
                <td className="py-1.5 pr-3 font-mono text-gray-600">{p.regNo || '—'}</td>
                <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">{p.academicYear}</td>
                <td className="py-1.5 text-gray-600">
                  {Object.keys(p.fields).map((k) => (
                    <div key={k}>
                      <span className="text-gray-400">{fieldLabel(k)}:</span>{' '}
                      <span className="line-through text-red-400">{fmt(p.before[k])}</span>{' → '}
                      <span className="text-green-700">{fmt(p.fields[k])}</span>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MoreNote total={patches.length} />
    </>
  );
}

function IssueTable({ issues }: { issues: Issue[] }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="py-1.5 pr-3 font-medium">Type</th>
              <th className="py-1.5 pr-3 font-medium">Student</th>
              <th className="py-1.5 pr-3 font-medium">Reg No</th>
              <th className="py-1.5 pr-3 font-medium">Year</th>
              <th className="py-1.5 font-medium">Problem</th>
            </tr>
          </thead>
          <tbody>
            {issues.slice(0, ROW_LIMIT).map((i, idx) => (
              <tr key={idx} className="border-b border-gray-50 align-top">
                <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">{ISSUE_LABEL[i.kind]}</td>
                <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap">{i.name || '—'}</td>
                <td className="py-1.5 pr-3 font-mono text-gray-600">{i.regNo || '—'}</td>
                <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">{i.academicYear || '—'}</td>
                <td className="py-1.5 text-gray-600">{i.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MoreNote total={issues.length} />
    </>
  );
}

function ConflictTable({ rows, busyKey, onResolve }: {
  rows: ConflictRow[];
  busyKey: string | null;
  onResolve: (row: ConflictRow, value: string) => void;
}) {
  return (
    <>
      <p className="text-xs text-gray-500 mb-2">Click the correct value to write it to every academic year of that student.</p>
      <div className="space-y-2">
        {rows.slice(0, ROW_LIMIT).map((row) => (
          <div key={row.key} className="rounded-md border border-gray-100 px-3 py-2">
            <p className="text-xs text-gray-700">
              <span className="font-medium">{row.name}</span>
              <span className="font-mono text-gray-500 ml-2">{row.regNo}</span>
              <span className="text-gray-400 ml-2">· {fieldLabel(row.field)}</span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {row.values.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => onResolve(row, v.value)}
                  title="Use this value for all years"
                  className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-800 hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
                >
                  <span className="font-medium">{v.value}</span>
                  <span className="text-blue-400">{v.years.join(', ')}</span>
                </button>
              ))}
              {busyKey === row.key && <span className="text-xs text-gray-400 self-center">Saving…</span>}
            </div>
          </div>
        ))}
      </div>
      <MoreNote total={rows.length} />
    </>
  );
}

function Card({ title, hint, count, tone, open, onToggle, action, children }: {
  title: string; hint: string; count: number; tone: 'fix' | 'review';
  open: boolean; onToggle: () => void; action?: ReactNode; children: ReactNode;
}) {
  const clean = count === 0;
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <span className={`min-w-[3rem] text-center rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums ${
          clean ? 'bg-green-50 text-green-700' : tone === 'fix' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {clean ? '✓' : count}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800">{title}</p>
          <p className="text-xs text-gray-400">{hint}</p>
        </div>
        {!clean && action}
        {!clean && (
          <button type="button" onClick={onToggle} className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer">
            {open ? 'Hide' : 'Review'}
          </button>
        )}
      </div>
      {open && !clean && <div className="px-4 pb-4 pt-1 border-t border-gray-100">{children}</div>}
    </div>
  );
}

export function BackupDataRepairPanel() {
  const [report, setReport] = useState<DataHealthReport | null>(null);
  const [stage, setStage] = useState<ScanStage | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<CardId | null>(null);
  const [fixing, setFixing] = useState<CardId | null>(null);
  const [progress, setProgress] = useState('');
  const [conflictBusy, setConflictBusy] = useState<string | null>(null);

  const scanning = stage !== null;
  const busy = scanning || fixing !== null || conflictBusy !== null;

  async function runScan() {
    setError('');
    try {
      const r = await scanDataHealth(setStage);
      setReport(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      setStage(null);
    }
  }

  async function runFix(id: CardId, patches: Patch[], apply: typeof applyStudentPatches, what: string) {
    if (!window.confirm(`Update ${patches.length} ${what}? This writes to the database.`)) return;
    setFixing(id);
    setMsg('');
    setError('');
    try {
      const n = await apply(patches, (done, total) => setProgress(`${done} / ${total}`));
      setMsg(`Updated ${n} ${what}. Re-scanned below.`);
      await runScan();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fix failed.');
    } finally {
      setFixing(null);
      setProgress('');
    }
  }

  async function onResolve(row: ConflictRow, value: string) {
    if (!window.confirm(`Set ${fieldLabel(row.field)} = "${value}" on all ${row.ids.length} year records of ${row.name}?`)) return;
    setConflictBusy(row.key);
    setError('');
    try {
      await resolveConflict(row, value);
      // Drop just this row locally — a full re-scan per click would be slow.
      setReport((r) => r && { ...r, conflicts: r.conflicts.filter((c) => c.key !== row.key) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setConflictBusy(null);
    }
  }

  async function exportReport() {
    if (!report) return;
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    const patchRows = (ps: Patch[]) => ps.flatMap((p) => Object.keys(p.fields).map((k) => ({
      Student: p.name, 'Reg No': p.regNo, Year: p.academicYear, Field: fieldLabel(k),
      Current: String(p.before[k] ?? ''), Proposed: String(p.fields[k] ?? ''),
    })));
    const issueRows = (kinds: IssueKind[]) => report.issues.filter((i) => kinds.includes(i.kind)).map((i) => ({
      Type: ISSUE_LABEL[i.kind], Student: i.name, 'Reg No': i.regNo, Year: i.academicYear, Problem: i.detail,
    }));
    const sheets: [string, object[]][] = [
      ['Fill Blanks', patchRows(report.fillBlanks)],
      ['Conflicts', report.conflicts.map((c) => ({
        Student: c.name, 'Reg No': c.regNo, Field: fieldLabel(c.field),
        Values: c.values.map((v) => `${v.value} (${v.years.join(', ')})`).join(' | '),
      }))],
      ['Clean-up', patchRows(report.cleanup)],
      ['Invalid Values', issueRows(INVALID_KINDS)],
      ['Duplicates', issueRows(DUPLICATE_KINDS)],
      ['Fee Name Sync', patchRows(report.feeSync)],
      ['Fee Links', issueRows(FEE_LINK_KINDS)],
    ];
    for (const [name, rows] of sheets) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Result: 'No issues' }]), name);
    }
    XLSX.writeFile(wb, `Data_Health_${report.scannedAt.slice(0, 10)}.xlsx`);
  }

  const toggle = (id: CardId) => setOpen((o) => (o === id ? null : id));
  const fixBtn = (id: CardId, patches: Patch[], apply: typeof applyStudentPatches, what: string) => (
    <Button size="sm" disabled={busy} loading={fixing === id} onClick={() => { void runFix(id, patches, apply, what); }}>
      {fixing === id ? `Fixing ${progress}` : `Fix ${patches.length}`}
    </Button>
  );

  const invalid = report?.issues.filter((i) => INVALID_KINDS.includes(i.kind)) ?? [];
  const duplicates = report?.issues.filter((i) => DUPLICATE_KINDS.includes(i.kind)) ?? [];
  const feeLinks = report?.issues.filter((i) => FEE_LINK_KINDS.includes(i.kind)) ?? [];

  return (
    <div className="max-w-4xl space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-start gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Data Health</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Scans every student and fee record for gaps, conflicts and formatting problems. The scan only reads data;
              nothing changes until you click a Fix button. Reg Nos and fee amounts are never modified.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {report && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => { void exportReport(); }}>
                Export report
              </Button>
            )}
            <Button size="sm" disabled={busy} loading={scanning} onClick={() => { void runScan(); }}>
              {stage ? STAGE_LABEL[stage] : report ? 'Re-scan' : 'Scan'}
            </Button>
          </div>
        </div>
        {(report || msg || error) && (
          <div className="px-6 py-3 space-y-2">
            {report && (
              <p className="text-xs text-gray-500">
                Scanned {report.studentCount.toLocaleString('en-IN')} student records and {report.feeRecordCount.toLocaleString('en-IN')} fee records
                at {new Date(report.scannedAt).toLocaleTimeString('en-IN')}.
              </p>
            )}
            {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">{msg}</p>}
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>}
          </div>
        )}
      </div>

      {report && (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider pt-1">Across academic years</p>
          <Card title="Fill blanks across years" tone="fix" count={report.fillBlanks.length}
            hint="Empty personal fields copied from the student's latest year that has them (marks copied as a block). Never overwrites."
            open={open === 'fill'} onToggle={() => toggle('fill')}
            action={fixBtn('fill', report.fillBlanks, applyStudentPatches, 'student records')}>
            <PatchTable patches={report.fillBlanks} />
          </Card>
          <Card title="Conflicting values" tone="review" count={report.conflicts.length}
            hint="Same Reg No with a different Name, Father/Mother, DOB, Gender, Aadhar or Category in different years."
            open={open === 'conflicts'} onToggle={() => toggle('conflicts')}>
            <ConflictTable rows={report.conflicts} busyKey={conflictBusy} onResolve={(r, v) => { void onResolve(r, v); }} />
          </Card>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider pt-2">Record quality</p>
          <Card title="Clean-up formatting" tone="fix" count={report.cleanup.length}
            hint="Trim/collapse spaces, uppercase names & places, strip spaces/+91 from mobiles and Aadhar, DOB to DD/MM/YYYY."
            open={open === 'cleanup'} onToggle={() => toggle('cleanup')}
            action={fixBtn('cleanup', report.cleanup, applyStudentPatches, 'student records')}>
            <PatchTable patches={report.cleanup} />
          </Card>
          <Card title="Invalid values" tone="review" count={invalid.length}
            hint="Bad mobiles, Aadhar not 12 digits, impossible DOB, unknown Gender/Religion/Category…, missing or mis-typed Reg No. Fix in Edit or the Personal Details import."
            open={open === 'invalid'} onToggle={() => toggle('invalid')}>
            <IssueTable issues={invalid} />
          </Card>
          <Card title="Duplicates" tone="review" count={duplicates.length}
            hint="Same Reg No enrolled twice in one academic year, or one Aadhar on different students."
            open={open === 'duplicates'} onToggle={() => toggle('duplicates')}>
            <IssueTable issues={duplicates} />
          </Card>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider pt-2">Fee records</p>
          <Card title="Sync names on fee records" tone="fix" count={report.feeSync.length}
            hint="Fee records whose stored Name / Father Name (or blank Reg No) differ from the corrected student record. Amounts untouched."
            open={open === 'feeSync'} onToggle={() => toggle('feeSync')}
            action={fixBtn('feeSync', report.feeSync, applyFeePatches, 'fee records')}>
            <PatchTable patches={report.feeSync} />
          </Card>
          <Card title="Fee record links" tone="review" count={feeLinks.length}
            hint="Fee records pointing to a deleted student, or carrying a different Reg No than their student."
            open={open === 'feeLinks'} onToggle={() => toggle('feeLinks')}>
            <IssueTable issues={feeLinks} />
          </Card>
        </div>
      )}
    </div>
  );
}
