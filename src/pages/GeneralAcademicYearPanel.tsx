import { useState, type FormEvent } from 'react';
import { useSettings } from '../hooks/useSettings';
import { saveSettings } from '../services/settingsService';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import type { AcademicYear } from '../types';

const ACADEMIC_YEAR_OPTIONS = [
  { value: '2029-30', label: '2029-30' },
  { value: '2028-29', label: '2028-29' },
  { value: '2027-28', label: '2027-28' },
  { value: '2026-27', label: '2026-27' },
  { value: '2025-26', label: '2025-26' },
  { value: '2024-25', label: '2024-25' },
  { value: '2023-24', label: '2023-24' },
  { value: '2022-23', label: '2022-23' },
  { value: '2021-22', label: '2021-22' },
  { value: '2020-21', label: '2020-21' },
  { value: '2019-20', label: '2019-20' },
  { value: '2018-19', label: '2018-19' },
  { value: '2017-18', label: '2017-18' },
  { value: '2016-17', label: '2016-17' },
  { value: '2015-16', label: '2015-16' },
  { value: '2014-15', label: '2014-15' },
  { value: '2013-14', label: '2013-14' },
  { value: '2012-13', label: '2012-13' },
];

export function GeneralAcademicYearPanel() {
  const { settings, loading, refetch } = useSettings();
  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const currentValue = selectedYear || settings?.currentAcademicYear || '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!currentValue) return;
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await saveSettings(currentValue as AcademicYear);
      refetch();
      setSuccessMsg('Settings saved successfully!');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200" style={{ animation: 'page-enter 0.2s ease-out both' }}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Academic Year</h3>
          <p className="text-xs text-gray-400 mt-0.5">Set the active academic year for all operations</p>
        </div>
        <div className="px-6 py-5">
          {loading ? (
            <p className="text-sm text-gray-500">Loading settings...</p>
          ) : (
            <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
              <Select
                label="Current Academic Year"
                options={ACADEMIC_YEAR_OPTIONS}
                value={currentValue}
                onChange={(e) => setSelectedYear(e.target.value as AcademicYear)}
                placeholder="Select academic year"
              />

              {successMsg && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
                  {successMsg}
                </p>
              )}
              {errorMsg && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  {errorMsg}
                </p>
              )}

              <Button type="submit" loading={saving} disabled={!currentValue}>
                Save Settings
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
