import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { useSettings } from '../hooks/useSettings';
import { saveSettings } from '../services/settingsService';
import { deleteStudentsByAcademicYear, deleteAllStudents, getStudentsByAcademicYear } from '../services/studentService';
import { deleteFeeRecordsByAcademicYear } from '../services/feeRecordService';
import { deleteFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { resetDocumentsByStudentIds } from '../services/studentDocumentService';
import { getStaffUsers, createStaffUser, deactivateStaffUser, reactivateStaffUser, setStaffDefaultYear } from '../services/userService';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { FeeStructurePage } from './FeeStructurePage';
import { ImportStudents } from './ImportStudents';
import { ImportFeeRegister } from './ImportFeeRegister';
import { ImportAddress } from './ImportAddress';
import type { AcademicYear, StaffUser } from '../types';

type Tab = 'general' | 'fee-structure' | 'import-students' | 'import-fee' | 'import-address' | 'staff';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'fee-structure', label: 'Fee Structure' },
  { id: 'import-students', label: 'Import Students' },
  { id: 'import-fee', label: 'Import Fee Register' },
  { id: 'import-address', label: 'Import Address' },
  { id: 'staff', label: 'Staff Accounts' },
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

  // Document status reset modal state
  const [docsResetOpen, setDocsResetOpen] = useState(false);
  const [docsPasskey, setDocsPasskey] = useState('');
  const [docsPasskeyError, setDocsPasskeyError] = useState('');
  const [docsResetting, setDocsResetting] = useState(false);
  const [docsResetMsg, setDocsResetMsg] = useState('');
  const [docsResetErrorMsg, setDocsResetErrorMsg] = useState('');

  // Fee structure reset modal state
  const [feeStructureResetOpen, setFeeStructureResetOpen] = useState(false);
  const [feeStructurePasskey, setFeeStructurePasskey] = useState('');
  const [feeStructurePasskeyError, setFeeStructurePasskeyError] = useState('');
  const [feeStructureResetting, setFeeStructureResetting] = useState(false);
  const [feeStructureResetMsg, setFeeStructureResetMsg] = useState('');
  const [feeStructureResetErrorMsg, setFeeStructureResetErrorMsg] = useState('');

  // Staff accounts state
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [savingYearFor, setSavingYearFor] = useState<string | null>(null);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [staffCreateMsg, setStaffCreateMsg] = useState('');
  const [staffCreateError, setStaffCreateError] = useState('');

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

  function openDocsResetModal() {
    setDocsPasskey('');
    setDocsPasskeyError('');
    setDocsResetMsg('');
    setDocsResetErrorMsg('');
    setDocsResetOpen(true);
  }

  function closeDocsResetModal() {
    setDocsResetOpen(false);
    setDocsPasskey('');
    setDocsPasskeyError('');
  }

  async function handleDocsReset() {
    if (docsPasskey !== RESET_PASSKEY) {
      setDocsPasskeyError('Incorrect passkey. Please try again.');
      return;
    }
    if (!currentValue) return;
    setDocsPasskeyError('');
    setDocsResetting(true);
    try {
      const students = await getStudentsByAcademicYear(currentValue as AcademicYear);
      const ids = students.map((s) => s.id);
      const count = await resetDocumentsByStudentIds(ids);
      setDocsResetMsg(
        count > 0
          ? `Document records reset for ${count} student${count === 1 ? '' : 's'} in ${currentValue}.`
          : `No students found for ${currentValue}.`
      );
      closeDocsResetModal();
    } catch (err: unknown) {
      setDocsResetErrorMsg(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setDocsResetting(false);
    }
  }

  function openFeeStructureResetModal() {
    setFeeStructurePasskey('');
    setFeeStructurePasskeyError('');
    setFeeStructureResetMsg('');
    setFeeStructureResetErrorMsg('');
    setFeeStructureResetOpen(true);
  }

  function closeFeeStructureResetModal() {
    setFeeStructureResetOpen(false);
    setFeeStructurePasskey('');
    setFeeStructurePasskeyError('');
  }

  async function handleFeeStructureReset() {
    if (feeStructurePasskey !== RESET_PASSKEY) {
      setFeeStructurePasskeyError('Incorrect passkey. Please try again.');
      return;
    }
    if (!currentValue) return;
    setFeeStructurePasskeyError('');
    setFeeStructureResetting(true);
    try {
      const count = await deleteFeeStructuresByAcademicYear(currentValue as AcademicYear);
      setFeeStructureResetMsg(
        count > 0
          ? `Fee structure reset — ${count} entr${count === 1 ? 'y' : 'ies'} deleted for ${currentValue}.`
          : `No fee structure entries found for ${currentValue}.`
      );
      closeFeeStructureResetModal();
    } catch (err: unknown) {
      setFeeStructureResetErrorMsg(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setFeeStructureResetting(false);
    }
  }

  // Load staff list when staff tab is opened
  useEffect(() => {
    if (activeTab !== 'staff') return;
    setStaffLoading(true);
    setStaffError('');
    getStaffUsers()
      .then(setStaffUsers)
      .catch(() => setStaffError('Failed to load staff accounts.'))
      .finally(() => setStaffLoading(false));
  }, [activeTab]);

  async function handleCreateStaff(e: FormEvent) {
    e.preventDefault();
    setStaffCreateMsg('');
    setStaffCreateError('');
    if (!newStaffEmail.trim() || !newStaffPassword.trim()) {
      setStaffCreateError('Email and password are required.');
      return;
    }
    if (newStaffPassword.length < 6) {
      setStaffCreateError('Password must be at least 6 characters.');
      return;
    }
    setCreatingStaff(true);
    try {
      await createStaffUser(newStaffEmail.trim(), newStaffPassword.trim());
      setStaffCreateMsg(`Staff account created for ${newStaffEmail.trim()}.`);
      setNewStaffEmail('');
      setNewStaffPassword('');
      const updated = await getStaffUsers();
      setStaffUsers(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create staff account.';
      setStaffCreateError(msg.includes('email-already-in-use') ? 'This email is already in use.' : msg);
    } finally {
      setCreatingStaff(false);
    }
  }

  async function handleToggleStaff(uid: string, currentlyActive: boolean) {
    try {
      if (currentlyActive) {
        await deactivateStaffUser(uid);
      } else {
        await reactivateStaffUser(uid);
      }
      setStaffUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, active: !currentlyActive } : u))
      );
    } catch {
      setStaffError('Failed to update staff account.');
    }
  }

  async function handleSetDefaultYear(uid: string, year: string) {
    setSavingYearFor(uid);
    try {
      await setStaffDefaultYear(uid, year as AcademicYear | '');
      setStaffUsers((prev) =>
        prev.map((u) =>
          u.uid === uid
            ? { ...u, defaultAcademicYear: year ? (year as AcademicYear) : undefined }
            : u
        )
      );
    } catch {
      setStaffError('Failed to update default year.');
    } finally {
      setSavingYearFor(null);
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ animation: 'page-enter 0.22s ease-out' }}>

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
          <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <div className="max-w-xl space-y-5">

              {/* Academic Year */}
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

              {/* Danger Zone */}
              <div className="bg-white rounded-lg border border-red-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out 0.07s both' }}>
                <div className="px-6 py-4 border-b border-red-100 bg-red-50/60">
                  <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wider">Danger Zone</h3>
                  <p className="text-xs text-red-400 mt-0.5">These actions are irreversible — proceed with caution</p>
                </div>

                {(resetMsg || fullResetMsg || feeResetMsg || docsResetMsg || feeStructureResetMsg) && (
                  <div className="px-6 pt-4">
                    <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
                      {resetMsg || fullResetMsg || feeResetMsg || docsResetMsg || feeStructureResetMsg}
                    </p>
                  </div>
                )}
                {(resetErrorMsg || fullResetErrorMsg || feeResetErrorMsg || docsResetErrorMsg || feeStructureResetErrorMsg) && (
                  <div className="px-6 pt-4">
                    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                      {resetErrorMsg || fullResetErrorMsg || feeResetErrorMsg || docsResetErrorMsg || feeStructureResetErrorMsg}
                    </p>
                  </div>
                )}

                <div className="divide-y divide-gray-100">
                  {/* Year Data Reset */}
                  <div className="flex items-center justify-between px-6 py-4 gap-6">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">Year Data Reset</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Delete all student records for <span className="font-medium text-gray-600">{currentValue || '—'}</span>
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={!currentValue || loading}
                      onClick={openResetModal}
                      className="w-32 shrink-0"
                    >
                      Reset {currentValue || '—'}
                    </Button>
                  </div>

                  {/* Fee Register Reset */}
                  <div className="flex items-center justify-between px-6 py-4 gap-6">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">Reset Fee Register</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Delete fee records for <span className="font-medium text-gray-600">{currentValue || '—'}</span> — enrollment data unaffected
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={!currentValue || loading}
                      onClick={openFeeResetModal}
                      className="w-32 shrink-0"
                    >
                      Reset {currentValue || '—'}
                    </Button>
                  </div>

                  {/* Document Status Reset */}
                  <div className="flex items-center justify-between px-6 py-4 gap-6">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">Reset Document Status</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Clear document submission records for <span className="font-medium text-gray-600">{currentValue || '—'}</span>
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={!currentValue || loading}
                      onClick={openDocsResetModal}
                      className="w-32 shrink-0"
                    >
                      Reset {currentValue || '—'}
                    </Button>
                  </div>

                  {/* Fee Structure Reset */}
                  <div className="flex items-center justify-between px-6 py-4 gap-6">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">Reset Fee Structure</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Delete all fee structure entries for <span className="font-medium text-gray-600">{currentValue || '—'}</span> — fee records and students unaffected
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={!currentValue || loading}
                      onClick={openFeeStructureResetModal}
                      className="w-32 shrink-0"
                    >
                      Reset {currentValue || '—'}
                    </Button>
                  </div>

                  {/* Full Reset — most destructive */}
                  <div className="flex items-center justify-between px-6 py-4 gap-6 bg-red-50/40">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">Full Data Reset</p>
                      <p className="text-xs text-gray-400 mt-0.5">Permanently delete all student records across every academic year</p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={loading}
                      onClick={openFullResetModal}
                      className="w-32 shrink-0"
                    >
                      Full Reset
                    </Button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Fee Structure ── */}
        {activeTab === 'fee-structure' && (
          <div className="h-full" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <FeeStructurePage />
          </div>
        )}

        {/* ── Import Students ── */}
        {activeTab === 'import-students' && (
          <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <ImportStudents />
          </div>
        )}

        {/* ── Import Address ── */}
        {activeTab === 'import-address' && (
          <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <ImportAddress />
          </div>
        )}

        {/* ── Import Fee Register ── */}
        {activeTab === 'import-fee' && (
          <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <ImportFeeRegister />
          </div>
        )}

        {/* ── Staff Accounts ── */}
        {activeTab === 'staff' && (
          <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <div className="max-w-lg space-y-5">

              {/* Create staff account */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" style={{ animation: 'page-enter 0.2s ease-out both' }}>
                <h3 className="text-base font-medium text-gray-800 mb-1">Create Staff Account</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Staff can enroll students, view student list, fee register, and dashboard.
                  They cannot edit/delete students, collect fees, or access settings.
                </p>
                <form onSubmit={(e) => { void handleCreateStaff(e); }} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={newStaffEmail}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => { setNewStaffEmail(e.target.value); setStaffCreateError(''); setStaffCreateMsg(''); }}
                      placeholder="staff@example.com"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      value={newStaffPassword}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => { setNewStaffPassword(e.target.value); setStaffCreateError(''); setStaffCreateMsg(''); }}
                      placeholder="Min 6 characters"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  {staffCreateError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{staffCreateError}</p>
                  )}
                  {staffCreateMsg && (
                    <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">{staffCreateMsg}</p>
                  )}
                  <Button type="submit" loading={creatingStaff}>
                    Create Staff Account
                  </Button>
                </form>
              </div>

              {/* Staff list */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" style={{ animation: 'page-enter 0.2s ease-out 0.07s both' }}>
                <h3 className="text-base font-medium text-gray-800 mb-4">Staff Accounts</h3>
                {staffLoading ? (
                  <p className="text-sm text-gray-500">Loading...</p>
                ) : staffError ? (
                  <p className="text-sm text-red-600">{staffError}</p>
                ) : staffUsers.length === 0 ? (
                  <p className="text-sm text-gray-400">No staff accounts yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {staffUsers.map((u) => (
                      <li key={u.uid} className="flex items-center justify-between py-3 gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{u.email}</p>
                          <p className="text-[10px] text-gray-400">
                            Created {new Date(u.createdAt).toLocaleDateString('en-IN')}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[10px] text-gray-400 shrink-0">Default year:</span>
                            <select
                              value={u.defaultAcademicYear ?? ''}
                              onChange={(e) => { void handleSetDefaultYear(u.uid, e.target.value); }}
                              disabled={savingYearFor === u.uid}
                              className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer disabled:opacity-50"
                            >
                              <option value="">Not set (follows global)</option>
                              {ACADEMIC_YEAR_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            {savingYearFor === u.uid && (
                              <span className="text-[10px] text-gray-400">Saving…</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                              u.active
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : 'bg-red-50 text-red-500 border border-red-200'
                            }`}
                          >
                            {u.active ? 'Active' : 'Deactivated'}
                          </span>
                          <button
                            onClick={() => { void handleToggleStaff(u.uid, u.active); }}
                            className={`rounded px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer ${
                              u.active
                                ? 'text-red-600 border-red-200 hover:bg-red-50'
                                : 'text-green-700 border-green-200 hover:bg-green-50'
                            }`}
                          >
                            {u.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
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

      {/* Document Status Reset Passkey Modal */}
      {docsResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDocsResetModal}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Reset Document Status</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will clear{' '}
              <span className="font-semibold text-red-600">all document submission records</span>{' '}
              for students enrolled in{' '}
              <span className="font-semibold">{currentValue}</span>, allowing a fresh start.
              Student enrollment data is not affected. Enter the passkey to continue.
            </p>

            <label className="text-sm font-medium text-gray-700 block mb-1">Passkey</label>
            <input
              type="password"
              value={docsPasskey}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setDocsPasskey(e.target.value);
                setDocsPasskeyError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { void handleDocsReset(); } }}
              placeholder="Enter passkey"
              className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm mb-1 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                docsPasskeyError ? 'border-red-500' : 'border-gray-300'
              }`}
              autoFocus
            />
            {docsPasskeyError && (
              <p className="text-xs text-red-600 mb-3">{docsPasskeyError}</p>
            )}
            {!docsPasskeyError && <div className="mb-3" />}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={closeDocsResetModal} disabled={docsResetting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => { void handleDocsReset(); }} loading={docsResetting}>
                Reset Doc Status
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fee Structure Reset Passkey Modal */}
      {feeStructureResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeFeeStructureResetModal}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Reset Fee Structure</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete{' '}
              <span className="font-semibold text-red-600">all fee structure entries</span> for{' '}
              <span className="font-semibold">{currentValue}</span>. Fee records and student
              enrollment data are not affected. Enter the passkey to continue.
            </p>

            <label className="text-sm font-medium text-gray-700 block mb-1">Passkey</label>
            <input
              type="password"
              value={feeStructurePasskey}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setFeeStructurePasskey(e.target.value);
                setFeeStructurePasskeyError('');
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { void handleFeeStructureReset(); } }}
              placeholder="Enter passkey"
              className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm mb-1 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                feeStructurePasskeyError ? 'border-red-500' : 'border-gray-300'
              }`}
              autoFocus
            />
            {feeStructurePasskeyError && (
              <p className="text-xs text-red-600 mb-3">{feeStructurePasskeyError}</p>
            )}
            {!feeStructurePasskeyError && <div className="mb-3" />}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={closeFeeStructureResetModal} disabled={feeStructureResetting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => { void handleFeeStructureReset(); }} loading={feeStructureResetting}>
                Reset Fee Structure
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
