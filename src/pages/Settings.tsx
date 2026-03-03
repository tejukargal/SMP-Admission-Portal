import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useSettings } from '../hooks/useSettings';
import { saveSettings } from '../services/settingsService';
import { deleteStudentsByAcademicYear, deleteAllStudents } from '../services/studentService';
import { deleteFeeRecordsByAcademicYear } from '../services/feeRecordService';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { FeeStructurePage } from './FeeStructurePage';
import { ImportStudents } from './ImportStudents';
import { ImportFeeRegister } from './ImportFeeRegister';
import type { AcademicYear } from '../types';

type Tab = 'general' | 'fee-structure' | 'import-students' | 'import-fee';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'fee-structure', label: 'Fee Structure' },
  { id: 'import-students', label: 'Import Students' },
  { id: 'import-fee', label: 'Import Fee Register' },
];

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

const RESET_PASSKEY = 'teju2015';

export function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const { settings, loading, refetch } = useSettings();
  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Year reset modal state
  const [resetOpen, setResetOpen] = useState(false);
  const [passkey, setPasskey] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [resetErrorMsg, setResetErrorMsg] = useState('');

  // Full reset modal state
  const [fullResetOpen, setFullResetOpen] = useState(false);
  const [fullPasskey, setFullPasskey] = useState('');
  const [fullPasskeyError, setFullPasskeyError] = useState('');
  const [fullResetting, setFullResetting] = useState(false);
  const [fullResetMsg, setFullResetMsg] = useState('');
  const [fullResetErrorMsg, setFullResetErrorMsg] = useState('');

  // Fee register reset modal state
  const [feeResetOpen, setFeeResetOpen] = useState(false);
  const [feePasskey, setFeePasskey] = useState('');
  const [feePasskeyError, setFeePasskeyError] = useState('');
  const [feeResetting, setFeeResetting] = useState(false);
  const [feeResetMsg, setFeeResetMsg] = useState('');
  const [feeResetErrorMsg, setFeeResetErrorMsg] = useState('');

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

  function openResetModal() {
    setPasskey('');
    setPasskeyError('');
    setResetMsg('');
    setResetErrorMsg('');
    setResetOpen(true);
  }

  function closeResetModal() {
    setResetOpen(false);
    setPasskey('');
    setPasskeyError('');
  }

  async function handleReset() {
    if (passkey !== RESET_PASSKEY) {
      setPasskeyError('Incorrect passkey. Please try again.');
      return;
    }
    if (!currentValue) return;

    setPasskeyError('');
    setResetting(true);
    try {
      const count = await deleteStudentsByAcademicYear(currentValue as AcademicYear);
      setResetMsg(
        count > 0
          ? `Deleted ${count} student${count === 1 ? '' : 's'} for ${currentValue}.`
          : `No students found for ${currentValue}.`
      );
      closeResetModal();
    } catch (err: unknown) {
      setResetErrorMsg(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setResetting(false);
    }
  }

  function openFullResetModal() {
    setFullPasskey('');
    setFullPasskeyError('');
    setFullResetMsg('');
    setFullResetErrorMsg('');
    setFullResetOpen(true);
  }

  function closeFullResetModal() {
    setFullResetOpen(false);
    setFullPasskey('');
    setFullPasskeyError('');
  }

  async function handleFullReset() {
    if (fullPasskey !== RESET_PASSKEY) {
      setFullPasskeyError('Incorrect passkey. Please try again.');
      return;
    }

    setFullPasskeyError('');
    setFullResetting(true);
    try {
      const count = await deleteAllStudents();
      setFullResetMsg(
        count > 0
          ? `Deleted ${count} student${count === 1 ? '' : 's'} across all academic years.`
          : 'No student records found.'
      );
      closeFullResetModal();
    } catch (err: unknown) {
      setFullResetErrorMsg(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setFullResetting(false);
    }
  }

  function openFeeResetModal() {
    setFeePasskey('');
    setFeePasskeyError('');
    setFeeResetMsg('');
    setFeeResetErrorMsg('');
    setFeeResetOpen(true);
  }

  function closeFeeResetModal() {
    setFeeResetOpen(false);
    setFeePasskey('');
    setFeePasskeyError('');
  }

  async function handleFeeReset() {
    if (feePasskey !== RESET_PASSKEY) {
      setFeePasskeyError('Incorrect passkey. Please try again.');
      return;
    }
    if (!currentValue) return;

    setFeePasskeyError('');
    setFeeResetting(true);
    try {
      const count = await deleteFeeRecordsByAcademicYear(currentValue as AcademicYear);
      setFeeResetMsg(
        count > 0
          ? `Deleted ${count} fee record${count === 1 ? '' : 's'} for ${currentValue}.`
          : `No fee records found for ${currentValue}.`
      );
      closeFeeResetModal();
    } catch (err: unknown) {
      setFeeResetErrorMsg(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setFeeResetting(false);
    }
  }

  return (
    <div className="h-full flex flex-col">

      {/* Tab bar */}
      <div className="flex-shrink-0 flex gap-1 border-b border-gray-200 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">

        {/* ── General ── */}
        {activeTab === 'general' && (
          <div className="h-full overflow-auto">
            <div className="max-w-lg">
              {/* Academic Year */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-5">
                <h3 className="text-base font-medium text-gray-800 mb-4">Academic Year</h3>

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
                      <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
                        {successMsg}
                      </p>
                    )}
                    {errorMsg && (
                      <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
                        {errorMsg}
                      </p>
                    )}

                    <Button type="submit" loading={saving} disabled={!currentValue}>
                      Save Settings
                    </Button>
                  </form>
                )}
              </div>

              {/* Danger Zone */}
              <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
                <h3 className="text-base font-medium text-red-700 mb-1">Danger Zone</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Permanently delete student records. These actions cannot be undone.
                </p>

                {(resetMsg || fullResetMsg || feeResetMsg) && (
                  <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2 mb-4">
                    {resetMsg || fullResetMsg || feeResetMsg}
                  </p>
                )}
                {(resetErrorMsg || fullResetErrorMsg || feeResetErrorMsg) && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2 mb-4">
                    {resetErrorMsg || fullResetErrorMsg || feeResetErrorMsg}
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Current academic year only</p>
                    <Button
                      variant="danger"
                      disabled={!currentValue || loading}
                      onClick={openResetModal}
                    >
                      Year Data Reset ({currentValue || '—'})
                    </Button>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-1">All academic years</p>
                    <Button
                      variant="danger"
                      disabled={loading}
                      onClick={openFullResetModal}
                    >
                      Full Data Reset
                    </Button>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-1">Fee records — current year only</p>
                    <Button
                      variant="danger"
                      disabled={!currentValue || loading}
                      onClick={openFeeResetModal}
                    >
                      Reset Fee Register ({currentValue || '—'})
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Fee Structure ── */}
        {activeTab === 'fee-structure' && <FeeStructurePage />}

        {/* ── Import Students ── */}
        {activeTab === 'import-students' && (
          <div className="h-full overflow-auto">
            <ImportStudents />
          </div>
        )}

        {/* ── Import Fee Register ── */}
        {activeTab === 'import-fee' && (
          <div className="h-full overflow-auto">
            <ImportFeeRegister />
          </div>
        )}

      </div>

      {/* Year Reset Passkey Modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeResetModal}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Confirm Reset</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete{' '}
              <span className="font-semibold text-red-600">all student records</span> for{' '}
              <span className="font-semibold">{currentValue}</span>. Enter the passkey to
              continue.
            </p>

            <label className="text-sm font-medium text-gray-700 block mb-1">Passkey</label>
            <input
              type="password"
              value={passkey}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setPasskey(e.target.value);
                setPasskeyError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { void handleReset(); } }}
              placeholder="Enter passkey"
              className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm mb-1 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                passkeyError ? 'border-red-500' : 'border-gray-300'
              }`}
              autoFocus
            />
            {passkeyError && (
              <p className="text-xs text-red-600 mb-3">{passkeyError}</p>
            )}
            {!passkeyError && <div className="mb-3" />}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={closeResetModal} disabled={resetting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => { void handleReset(); }} loading={resetting}>
                Delete All Records
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fee Register Reset Passkey Modal */}
      {feeResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeFeeResetModal}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Confirm Fee Reset</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete{' '}
              <span className="font-semibold text-red-600">all fee records</span> for{' '}
              <span className="font-semibold">{currentValue}</span>. Student enrollment records
              are not affected. Enter the passkey to continue.
            </p>

            <label className="text-sm font-medium text-gray-700 block mb-1">Passkey</label>
            <input
              type="password"
              value={feePasskey}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setFeePasskey(e.target.value);
                setFeePasskeyError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { void handleFeeReset(); } }}
              placeholder="Enter passkey"
              className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm mb-1 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                feePasskeyError ? 'border-red-500' : 'border-gray-300'
              }`}
              autoFocus
            />
            {feePasskeyError && (
              <p className="text-xs text-red-600 mb-3">{feePasskeyError}</p>
            )}
            {!feePasskeyError && <div className="mb-3" />}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={closeFeeResetModal} disabled={feeResetting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => { void handleFeeReset(); }} loading={feeResetting}>
                Delete Fee Records
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Full Reset Passkey Modal */}
      {fullResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeFullResetModal}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Confirm Full Reset</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete{' '}
              <span className="font-semibold text-red-600">ALL student records across every academic year</span>.
              Enter the passkey to continue.
            </p>

            <label className="text-sm font-medium text-gray-700 block mb-1">Passkey</label>
            <input
              type="password"
              value={fullPasskey}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setFullPasskey(e.target.value);
                setFullPasskeyError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { void handleFullReset(); } }}
              placeholder="Enter passkey"
              className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm mb-1 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                fullPasskeyError ? 'border-red-500' : 'border-gray-300'
              }`}
              autoFocus
            />
            {fullPasskeyError && (
              <p className="text-xs text-red-600 mb-3">{fullPasskeyError}</p>
            )}
            {!fullPasskeyError && <div className="mb-3" />}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={closeFullResetModal} disabled={fullResetting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => { void handleFullReset(); }} loading={fullResetting}>
                Delete All Records
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
