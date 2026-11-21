import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { RESET_PASSKEY } from '../config/constants';
import {
  BACKUP_COLLECTIONS, BACKUP_GROUPS, downloadBackupJson, exportBackup, parseBackupFile, restoreBackup,
  type ExportProgress, type ParsedBackup, type RestoreResult,
} from '../services/backupService';
import { Button } from '../components/common/Button';
import { ProgressBar } from './BackupExportPanel';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function defaultSelection(p: ParsedBackup): Set<string> {
  return new Set(
    BACKUP_COLLECTIONS
      .filter((s) => s.restore === 'default' && (p.backup.collections[s.name]?.length ?? 0) > 0)
      .map((s) => s.name),
  );
}

export function BackupRestorePanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [safety, setSafety] = useState(true);
  const [parseError, setParseError] = useState('');
  const [passkey, setPasskey] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [results, setResults] = useState<RestoreResult[] | null>(null);
  const [restoreError, setRestoreError] = useState('');

  const backup = parsed?.backup;

  const selectedDocs = useMemo(() => {
    if (!backup) return 0;
    let n = 0;
    for (const name of selected) {
      n += backup.collections[name]?.length ?? 0;
      for (const [path, docs] of Object.entries(backup.subcollections)) if (path.startsWith(`${name}/`)) n += docs.length;
    }
    return n;
  }, [backup, selected]);

  function reset() {
    setParsed(null); setSelected(new Set()); setPasskey(''); setPasskeyError('');
    setResults(null); setRestoreError(''); setParseError('');
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    reset();
    try {
      const p = await parseBackupFile(file);
      setParsed(p);
      setSelected(defaultSelection(p));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to read backup file.');
    }
  }

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function openConfirm() {
    if (!parsed || selected.size === 0) return;
    if (passkey !== RESET_PASSKEY) {
      setPasskeyError('Incorrect passkey. Please try again.');
      return;
    }
    setPasskeyError('');
    setConfirmOpen(true);
  }

  async function handleRestore() {
    if (!backup) return;
    setConfirmOpen(false);
    setRestoring(true);
    setResults(null);
    setRestoreError('');
    try {
      if (safety) {
        const snapshot = await exportBackup(
          backup.scope === 'year' && backup.academicYear ? { scope: 'year', academicYear: backup.academicYear } : { scope: 'full' },
          (p) => setProgress({ ...p, stage: `Safety snapshot: ${p.stage}` }),
        );
        downloadBackupJson(snapshot, '-before-restore');
      }
      const order = BACKUP_COLLECTIONS.map((s) => s.name).filter((n) => selected.has(n));
      const res = await restoreBackup(backup, order, setProgress);
      setResults(res);
      setPasskey('');
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setRestoring(false);
      setProgress(null);
    }
  }

  const failedTotal = results?.reduce((a, r) => a + r.failed, 0) ?? 0;

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-lg border border-amber-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/60">
          <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider">Restore from Backup</h3>
          <p className="text-xs text-amber-600 mt-0.5">
            Writes the chosen collections back from a backup file. Records with the same ID are overwritten; records not in
            the backup are left untouched (nothing is deleted).
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <input ref={fileInputRef} type="file" accept=".json,.zip,application/json,application/zip" onChange={handleFileChange} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={restoring}
              className="inline-flex items-center gap-2 px-4 py-2 rounded border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Choose backup file (.json or .zip)
            </button>
          </div>

          {parseError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{parseError}</p>}

          {parsed && backup && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Backup Details</p>
                <button onClick={reset} className="text-xs text-blue-600 hover:underline">Clear</button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div>
                  <span className="text-xs text-gray-500">Scope</span>
                  <p className="font-semibold text-gray-800">{backup.scope === 'full' ? 'All years (full)' : backup.academicYear}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Backed up on</span>
                  <p className="font-medium text-gray-700">{formatDate(backup.exportedAt)}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">By</span>
                  <p className="font-medium text-gray-700">{backup.exportedBy || '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Integrity</span>
                  <p className={`font-medium ${parsed.checksum === 'ok' ? 'text-green-700' : parsed.checksum === 'mismatch' ? 'text-red-700' : 'text-gray-500'}`}>
                    {parsed.checksum === 'ok' ? '✓ Checksum verified' : parsed.checksum === 'mismatch' ? '✗ File has been modified or damaged' : parsed.sourceVersion === '1' ? 'Older backup (no checksum)' : 'No checksum'}
                  </p>
                </div>
              </div>
              {parsed.checksum === 'mismatch' && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                  The contents do not match the checksum written when this backup was made. Restore only if you know why the file changed.
                </p>
              )}
              {backup.readErrors.length > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  This backup was incomplete when made — could not read: {backup.readErrors.map((e) => e.name).join(', ')}.
                </p>
              )}

              {/* Collection checklist */}
              <div className="border-t border-blue-100 pt-2.5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-600">Choose what to restore</p>
                  <div className="flex gap-3 text-xs">
                    <button className="text-blue-600 hover:underline" onClick={() => setSelected(defaultSelection(parsed))}>Recommended</button>
                    <button className="text-blue-600 hover:underline" onClick={() => setSelected(new Set())}>None</button>
                  </div>
                </div>
                {BACKUP_GROUPS.map((group) => {
                  const specs = BACKUP_COLLECTIONS.filter((s) => s.group === group && (backup.collections[s.name]?.length ?? 0) > 0);
                  if (!specs.length) return null;
                  return (
                    <div key={group}>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{group}</p>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                        {specs.map((s) => {
                          const never = s.restore === 'never';
                          return (
                            <label key={s.name} className={`flex items-start gap-2 text-xs ${never ? 'text-gray-400' : 'text-gray-700 cursor-pointer'}`} title={never ? 'Written only by Cloud Functions — kept in the backup for reference, cannot be restored from the browser.' : s.note}>
                              <input type="checkbox" className="mt-0.5" disabled={never || restoring} checked={!never && selected.has(s.name)} onChange={() => toggle(s.name)} />
                              <span className="flex-1">
                                {s.label}{s.restore === 'optIn' && <span className="text-amber-600"> · opt-in</span>}
                                {never && <span> · reference only</span>}
                              </span>
                              <span className="font-medium text-gray-800">{(backup.collections[s.name]?.length ?? 0).toLocaleString('en-IN')}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-gray-500">
                  {selected.size} collections, {selectedDocs.toLocaleString('en-IN')} records selected. Uploaded files in a ZIP are not
                  re-uploaded (they are a safekeeping copy). Staff login passwords cannot be restored.
                </p>
              </div>
            </div>
          )}

          {parsed && (
            <>
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} className="mt-0.5" disabled={restoring} />
                <span>
                  Download a safety snapshot of the current data first
                  <span className="block text-xs text-gray-400">Recommended — lets you undo this restore by restoring the snapshot.</span>
                </span>
              </label>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Enter passkey to restore</label>
                <input
                  type="password"
                  value={passkey}
                  onChange={(e) => { setPasskey(e.target.value); setPasskeyError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') openConfirm(); }}
                  placeholder="Enter passkey"
                  className={`rounded border px-3 py-2 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 ${passkeyError ? 'border-red-400' : 'border-gray-300'}`}
                />
                {passkeyError && <p className="text-xs text-red-600 mt-1">{passkeyError}</p>}
              </div>
              <Button variant="secondary" onClick={openConfirm} loading={restoring} disabled={!passkey || selected.size === 0 || restoring}>
                {restoring ? 'Restoring…' : 'Restore Selected'}
              </Button>
            </>
          )}

          {progress && <ProgressBar progress={progress} />}

          {results && (
            <div className={`rounded-md border px-3 py-2 text-sm ${failedTotal ? 'border-amber-200 bg-amber-50' : 'border-green-100 bg-green-50'}`}>
              <p className={`font-medium ${failedTotal ? 'text-amber-800' : 'text-green-700'}`}>
                Restore finished — {results.reduce((a, r) => a + r.written, 0).toLocaleString('en-IN')} records written
                {failedTotal ? `, ${failedTotal} rejected` : ''}.
              </p>
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-gray-500 text-left"><th className="font-medium py-0.5">Collection</th><th className="font-medium text-right">Written</th><th className="font-medium text-right">Rejected</th></tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.name} className="border-t border-black/5 align-top">
                      <td className="py-0.5">
                        {r.name}
                        {r.firstError && <div className="text-red-600 break-all">{r.firstError}</div>}
                      </td>
                      <td className="text-right">{r.written}</td>
                      <td className={`text-right ${r.failed ? 'text-red-600 font-medium' : ''}`}>{r.failed || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {restoreError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{restoreError}</p>}
        </div>
      </div>

      {confirmOpen && backup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Confirm Restore</h2>
            <p className="text-sm text-gray-500 mb-4">
              {selectedDocs.toLocaleString('en-IN')} records in {selected.size} collections will be written from the backup dated{' '}
              <span className="font-medium">{formatDate(backup.exportedAt)}</span>, overwriting matching records.
              {safety ? ' A safety snapshot will download first.' : ' No safety snapshot will be taken — this cannot be undone.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => { void handleRestore(); }}>Yes, Restore</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
