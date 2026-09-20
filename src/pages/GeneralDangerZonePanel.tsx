import { useState, type ChangeEvent } from 'react';
import { useSettings } from '../hooks/useSettings';
import { deleteStudentsByAcademicYear, deleteAllStudents, getStudentsByAcademicYear, resetAcademicYearCounters } from '../services/studentService';
import { deleteFeeRecordsByAcademicYear } from '../services/feeRecordService';
import { deleteFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { resetDocumentsByStudentIds } from '../services/studentDocumentService';
import { RESET_PASSKEY } from '../config/constants';
import { Button } from '../components/common/Button';
import type { AcademicYear } from '../types';

export function GeneralDangerZonePanel() {
  const { settings, loading } = useSettings();
  const currentValue = settings?.currentAcademicYear || '';

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
      await resetAcademicYearCounters(currentValue as AcademicYear);
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

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-lg border border-red-200 overflow-hidden" style={{ animation: 'page-enter 0.2s ease-out both' }}>
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
