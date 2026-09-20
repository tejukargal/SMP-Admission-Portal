import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { exportBackup, downloadBackupFile } from '../services/backupService';
import { Button } from '../components/common/Button';
import type { AcademicYear } from '../types';
import { ACADEMIC_YEARS } from '../types';

const YEAR_OPTIONS = [...ACADEMIC_YEARS].reverse().map((y) => ({ value: y, label: y }));

export function BackupExportPanel() {
  const { settings, loading } = useSettings();
  const currentYear = settings?.currentAcademicYear;

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

  return (
    <div className="max-w-xl">
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
    </div>
  );
}
