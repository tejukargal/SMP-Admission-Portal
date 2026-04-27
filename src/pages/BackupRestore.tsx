import { useState, useRef, type ChangeEvent } from 'react';
import { useSettings } from '../hooks/useSettings';
import { RESET_PASSKEY } from '../config/constants';
import type { AcademicYear } from '../types';
import { ACADEMIC_YEARS } from '../types';
import {
  exportBackup,
  restoreBackup,
  downloadBackupFile,
  parseBackupFile,
  type BackupData,
} from '../services/backupService';
import { Button } from '../components/common/Button';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const YEAR_OPTIONS = [...ACADEMIC_YEARS].reverse().map((y) => ({ value: y, label: y }));

export function BackupRestore() {
  const { settings, loading } = useSettings();
  const currentYear = settings?.currentAcademicYear;

  // ── Export state ──────────────────────────────────────────────────────────
  const [exportYear, setExportYear] = useState<AcademicYear | ''>('');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [exportError, setExportError] = useState('');

  const selectedExportYear = (exportYear || currentYear || '') as AcademicYear | '';

  async function handleExport() {
    if (!selectedExportYear) return;
    setExporting(true);
    setExportMsg('');
    setExportError('');
    try {
      const backup = await exportBackup(selectedExportYear as AcademicYear);
      downloadBackupFile(backup);
      setExportMsg(
        `Backup downloaded — ${backup.counts.students} student${backup.counts.students !== 1 ? 's' : ''}, ` +
        `${backup.counts.feeRecords} fee record${backup.counts.feeRecords !== 1 ? 's' : ''}.`
      );
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  // ── Restore state ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedBackup, setParsedBackup] = useState<BackupData | null>(null);
  const [parseError, setParseError] = useState('');
  const [restorePasskey, setRestorePasskey] = useState('');
  const [restorePasskeyError, setRestorePasskeyError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsedBackup(null);
    setParseError('');
    setRestoreMsg('');
    setRestoreError('');
    setRestorePasskey('');
    setRestorePasskeyError('');
    try {
      const data = await parseBackupFile(file);
      setParsedBackup(data);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : 'Failed to read backup file.');
    }
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';
  }

  function openConfirm() {
    if (!parsedBackup) return;
    if (restorePasskey !== RESET_PASSKEY) {
      setRestorePasskeyError('Incorrect passkey. Please try again.');
      return;
    }
    setRestorePasskeyError('');
    setConfirmOpen(true);
  }

  async function handleRestore() {
    if (!parsedBackup) return;
    setConfirmOpen(false);
    setRestoring(true);
    setRestoreMsg('');
    setRestoreError('');
    try {
      await restoreBackup(parsedBackup);
      const c = parsedBackup.counts;
      setRestoreMsg(
        `Restore complete — ${c.students} students, ${c.feeRecords} fee records, ` +
        `${c.studentDocuments} document records restored for ${parsedBackup.academicYear}.`
      );
      setParsedBackup(null);
      setRestorePasskey('');
    } catch (err: unknown) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="max-w-xl space-y-5">

        {/* ── Export ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Export Backup</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Downloads a full JSON backup of students, fees, documents, certificates and counters
            </p>
          </div>
          <div className="px-6 py-5 space-y-4">
            {loading ? (
              <p className="text-sm text-gray-400">Loading settings…</p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Academic Year</label>
                  <select
                    value={selectedExportYear}
                    onChange={(e) => {
                      setExportYear(e.target.value as AcademicYear);
                      setExportMsg('');
                      setExportError('');
                    }}
                    className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    {YEAR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}{opt.value === currentYear ? ' (active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {exportMsg && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
                    {exportMsg}
                  </p>
                )}
                {exportError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                    {exportError}
                  </p>
                )}

                <Button
                  onClick={() => { void handleExport(); }}
                  loading={exporting}
                  disabled={!selectedExportYear}
                >
                  {exporting ? 'Preparing backup…' : 'Download Backup'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Restore ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-amber-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out 0.05s both' }}>
          <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/60">
            <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider">Restore from Backup</h3>
            <p className="text-xs text-amber-600 mt-0.5">
              Restores records from a backup file — existing data for the year will be overwritten
            </p>
          </div>
          <div className="px-6 py-5 space-y-4">

            {/* File picker */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Choose backup file (.json)
              </button>
            </div>

            {parseError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {parseError}
              </p>
            )}

            {/* Backup metadata preview */}
            {parsedBackup && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Backup Details</p>
                  <button
                    onClick={() => { setParsedBackup(null); setRestorePasskey(''); setRestorePasskeyError(''); setRestoreMsg(''); setRestoreError(''); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Clear
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <span className="text-xs text-gray-500">Academic Year</span>
                    <p className="font-semibold text-gray-800">{parsedBackup.academicYear}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Backed up on</span>
                    <p className="font-medium text-gray-700">{formatDate(parsedBackup.exportedAt)}</p>
                  </div>
                </div>
                <div className="border-t border-blue-100 pt-2.5">
                  <p className="text-xs font-medium text-gray-600 mb-2">Records to restore</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
                    <span>Students</span>
                    <span className="font-medium text-gray-800">{parsedBackup.counts.students}</span>
                    <span>Fee Records</span>
                    <span className="font-medium text-gray-800">{parsedBackup.counts.feeRecords}</span>
                    <span>Fee Overrides</span>
                    <span className="font-medium text-gray-800">{parsedBackup.counts.feeOverrides}</span>
                    <span>Exam Fee Records</span>
                    <span className="font-medium text-gray-800">{parsedBackup.counts.examFeeRecords}</span>
                    <span>Document Records</span>
                    <span className="font-medium text-gray-800">{parsedBackup.counts.studentDocuments}</span>
                    <span>Inquiries</span>
                    <span className="font-medium text-gray-800">{parsedBackup.counts.inquiries}</span>
                    <span>Fee Structures</span>
                    <span className="font-medium text-gray-800">{parsedBackup.counts.feeStructures}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Passkey + restore button (only show when a backup is loaded) */}
            {parsedBackup && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Enter passkey to restore
                  </label>
                  <input
                    type="password"
                    value={restorePasskey}
                    onChange={(e) => { setRestorePasskey(e.target.value); setRestorePasskeyError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') openConfirm(); }}
                    placeholder="Enter passkey"
                    className={`rounded border px-3 py-2 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 ${
                      restorePasskeyError ? 'border-red-400' : 'border-gray-300'
                    }`}
                  />
                  {restorePasskeyError && (
                    <p className="text-xs text-red-600 mt-1">{restorePasskeyError}</p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  onClick={openConfirm}
                  loading={restoring}
                  disabled={!restorePasskey}
                >
                  {restoring ? 'Restoring…' : 'Restore Data'}
                </Button>
              </>
            )}

            {restoreMsg && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
                {restoreMsg}
              </p>
            )}
            {restoreError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {restoreError}
              </p>
            )}

          </div>
        </div>

      </div>

      {/* ── Confirm Restore Modal ──────────────────────────────────────── */}
      {confirmOpen && parsedBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Confirm Restore</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will overwrite all existing records for{' '}
              <span className="font-semibold text-gray-700">{parsedBackup.academicYear}</span>{' '}
              with data from the backup dated{' '}
              <span className="font-medium">{formatDate(parsedBackup.exportedAt)}</span>.
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => { void handleRestore(); }}>
                Yes, Restore
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
