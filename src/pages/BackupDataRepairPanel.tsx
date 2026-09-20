import { useState } from 'react';
import { backfillStudentDOB } from '../services/studentService';
import { Button } from '../components/common/Button';

export function BackupDataRepairPanel() {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncError, setSyncError] = useState('');

  async function handleSyncDOB() {
    setSyncing(true);
    setSyncMsg('');
    setSyncError('');
    try {
      const { checked, updated } = await backfillStudentDOB();
      setSyncMsg(
        updated === 0
          ? `All ${checked} multi-year student records already have Date of Birth and Father Name filled in.`
          : `Done — synced ${updated} record${updated !== 1 ? 's' : ''} across ${checked} checked.`
      );
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Data Repair</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Fixes missing Date of Birth and Father Name across all enrollment years for the same student, identified by Register Number
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            When a student is enrolled across multiple academic years, some records may be missing DOB or Father Name (e.g. bulk-imported records). This repair scans all multi-year records grouped by Register Number and copies the values from whichever year has them to the ones that don't.
          </p>

          {syncMsg && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
              {syncMsg}
            </p>
          )}
          {syncError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {syncError}
            </p>
          )}

          <Button
            variant="secondary"
            onClick={() => { void handleSyncDOB(); }}
            loading={syncing}
          >
            {syncing ? 'Syncing…' : 'Sync DOB & Father Name'}
          </Button>
        </div>
      </div>
    </div>
  );
}
