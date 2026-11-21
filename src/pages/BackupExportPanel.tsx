import { useEffect, useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import {
  BACKUP_COLLECTIONS, backupBaseName, buildBackupWorkbook, buildBackupZip, downloadBackupJson, downloadBlob,
  exportBackup, getBackupMeta, recordBackupMeta, serializeBackup, storagePathsIn, totalDocs,
  type BackupFileV2, type BackupMeta, type ExportProgress,
} from '../services/backupService';
import { Button } from '../components/common/Button';
import type { AcademicYear } from '../types';
import { ACADEMIC_YEARS } from '../types';

const YEAR_OPTIONS = [...ACADEMIC_YEARS].reverse();
const STALE_DAYS = 7;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function ProgressBar({ progress }: { progress: ExportProgress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-gray-600">
        <span>{progress.stage}</span>
        <span>{progress.done}/{progress.total}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ResultSummary({ backup, extra }: { backup: BackupFileV2; extra: string[] }) {
  const nonEmpty = BACKUP_COLLECTIONS.filter((s) => (backup.counts[s.name] ?? 0) > 0);
  return (
    <div className="space-y-3">
      <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
        Backup downloaded — {totalDocs(backup).toLocaleString('en-IN')} records from {nonEmpty.length} collections.
        {extra.map((e) => <div key={e} className="text-xs mt-0.5">{e}</div>)}
      </div>
      {backup.readErrors.length > 0 && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <p className="font-semibold">Incomplete: these collections could not be read</p>
          <ul className="text-xs mt-1 list-disc pl-4">
            {backup.readErrors.map((e) => <li key={e.name}><b>{e.name}</b> — {e.error}</li>)}
          </ul>
        </div>
      )}
      <details className="text-xs text-gray-600">
        <summary className="cursor-pointer select-none">Show counts per collection</summary>
        <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 mt-2">
          {nonEmpty.map((s) => (
            <div key={s.name} className="contents">
              <span>{s.label}</span>
              <span className="font-medium text-gray-800 text-right">{backup.counts[s.name].toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

export function BackupExportPanel() {
  const { settings, loading } = useSettings();
  const currentYear = settings?.currentAcademicYear;

  const [meta, setMeta] = useState<BackupMeta | null>(null);
  const [withExcel, setWithExcel] = useState(true);
  const [withFiles, setWithFiles] = useState(false);
  const [exportYear, setExportYear] = useState<AcademicYear | ''>('');
  const [busy, setBusy] = useState<'full' | 'year' | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [done, setDone] = useState<{ backup: BackupFileV2; extra: string[] } | null>(null);
  const [error, setError] = useState('');

  const selectedYear = (exportYear || currentYear || '') as AcademicYear | '';

  useEffect(() => {
    getBackupMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  async function run(kind: 'full' | 'year') {
    if (kind === 'year' && !selectedYear) return;
    setBusy(kind);
    setDone(null);
    setError('');
    try {
      const backup = await exportBackup(
        kind === 'full' ? { scope: 'full' } : { scope: 'year', academicYear: selectedYear as AcademicYear },
        setProgress,
      );
      const extra: string[] = [];
      if (kind === 'full') {
        setProgress({ stage: withExcel ? 'Building Excel workbook…' : 'Preparing…', done: 0, total: 1 });
        const xlsx = withExcel ? await buildBackupWorkbook(backup) : null;
        if (withFiles) {
          const { blob, manifest } = await buildBackupZip(serializeBackup(backup), xlsx, true, setProgress, storagePathsIn(backup.collections));
          downloadBlob(blob, `${backupBaseName(backup)}.zip`);
          if (manifest) {
            const mb = manifest.files.reduce((a, f) => a + f.size, 0) / 1024 / 1024;
            extra.push(`ZIP includes ${manifest.files.length} uploaded files (${mb.toFixed(1)} MB), the JSON and the Excel workbook.`);
            if (manifest.failed.length) extra.push(`⚠ ${manifest.failed.length} files or folders could not be listed or downloaded — see files-manifest.json in the ZIP.`);
          }
        } else {
          downloadBackupJson(backup);
          if (xlsx) {
            downloadBlob(
              new Blob([xlsx as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
              `${backupBaseName(backup)}.xlsx`,
            );
            extra.push('Excel workbook downloaded alongside the JSON.');
          }
        }
      } else {
        downloadBackupJson(backup);
      }
      setDone({ backup, extra });
      if (backup.readErrors.length === 0) {
        await recordBackupMeta(backup).catch(() => undefined);
        setMeta(await getBackupMeta().catch(() => null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed.');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const last = meta?.lastFullBackupAt;
  const stale = !last || daysAgo(last) >= STALE_DAYS;

  return (
    <div className="max-w-2xl space-y-4">
      {/* Last backup banner */}
      <div className={`rounded-lg border px-4 py-3 text-sm ${stale ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
        {last ? (
          <>Last full backup: <b>{formatDate(last)}</b> ({daysAgo(last) === 0 ? 'today' : `${daysAgo(last)} days ago`})
            {meta?.lastFullBackupDocs ? ` · ${meta.lastFullBackupDocs.toLocaleString('en-IN')} records` : ''}
            {stale && ' — time for a fresh one.'}</>
        ) : (
          <>No full backup recorded yet. Take one now and keep the file somewhere safe (pen drive / Google Drive).</>
        )}
      </div>

      {/* Full backup */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Full Backup — All Years</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Every academic year and every collection: enrollment, fee structure, receipts, overrides, refunds,
            certificates, exam duty, cash &amp; bank, results, circulars, messages, staff and settings.
          </p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked disabled className="mt-0.5" />
            <span>JSON backup <span className="text-xs text-gray-400">(always — this is the file used for Restore)</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={withExcel} onChange={(e) => setWithExcel(e.target.checked)} className="mt-0.5" disabled={!!busy} />
            <span>Excel workbook <span className="text-xs text-gray-400">(readable, one sheet per area, all years with a Summary sheet)</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} className="mt-0.5" disabled={!!busy} />
            <span>
              Include uploaded files as one ZIP
              <span className="block text-xs text-gray-400">
                Student letters, remittance challans, deposit slips, circular attachments. Can be large and take several
                minutes — keep this tab open. Files are a safekeeping copy; restore uses the JSON only.
              </span>
            </span>
          </label>
          <Button onClick={() => { void run('full'); }} loading={busy === 'full'} disabled={!!busy}>
            {busy === 'full' ? 'Preparing full backup…' : 'Download Full Backup'}
          </Button>
        </div>
      </div>

      {/* Single year */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Single-Year Backup</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            One academic year's year-wise data (students, fees, counters…) plus the shared registers (certificates, cash, circulars).
          </p>
        </div>
        <div className="px-6 py-5 flex items-end gap-3 flex-wrap">
          {loading ? (
            <p className="text-sm text-gray-400">Loading settings…</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Academic Year</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setExportYear(e.target.value as AcademicYear)}
                  disabled={!!busy}
                  className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>{y}{y === currentYear ? ' (active)' : ''}</option>
                  ))}
                </select>
              </div>
              <Button variant="secondary" onClick={() => { void run('year'); }} loading={busy === 'year'} disabled={!!busy || !selectedYear}>
                {busy === 'year' ? 'Preparing…' : 'Download Year Backup'}
              </Button>
            </>
          )}
        </div>
      </div>

      {(progress || done || error) && (
        <div className="bg-white rounded-lg border border-gray-200 px-6 py-4 space-y-3">
          {progress && <ProgressBar progress={progress} />}
          {done && <ResultSummary backup={done.backup} extra={done.extra} />}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>}
        </div>
      )}
    </div>
  );
}
