import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getStaffUsers, createStaffUser, deactivateStaffUser, reactivateStaffUser, setStaffDefaultYear, syncMyAdminClaim } from '../services/userService';
import { auth } from '../config/firebase';
import { getMessagingConfig, saveMessagingConfig } from '../services/adminConfigService';
import { Button } from '../components/common/Button';
import { FeeStructurePage } from './FeeStructurePage';
import { ExamFee } from './ExamFee';
import { StudentAppPanel, isStudentAppSection, type StudentAppSection } from './StudentAppPanel';
import { ImportPanel, isImportSection, type ImportSection } from './ImportPanel';
import { GeneralPanel, isGeneralSection, type GeneralSection } from './GeneralPanel';
import { BackupPanel, isBackupSection, type BackupSection } from './BackupPanel';
import type { AcademicYear, StaffUser } from '../types';

type Tab = 'general' | 'fee-structure' | 'exam-fee' | 'import' | 'staff' | 'messaging' | 'student-app' | 'backup';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'fee-structure', label: 'Fee Structure' },
  { id: 'exam-fee', label: 'Exam Fee' },
  { id: 'import', label: 'Import' },
  { id: 'staff', label: 'Staff Accounts' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'student-app', label: 'Student App' },
  { id: 'backup', label: 'Backup & Restore' },
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

// The five student-app tabs were folded into one 'student-app' tab with
// sections; old ?tab= links keep working by mapping to the section.
const LEGACY_TAB_TO_SECTION: Record<string, StudentAppSection> = {
  'ai-settings': 'ai-settings',
  'app-version': 'app-version',
  'tab-headers': 'tab-headers',
  'category-icons': 'category-icons',
  'daily-briefing': 'daily-briefing',
};

// The four import-* tabs were folded into one 'import' tab with sections;
// old ?tab= links (and Results.tsx's navigate) keep working.
const LEGACY_IMPORT_TAB_TO_SECTION: Record<string, ImportSection> = {
  'import-students': 'students',
  'import-fee': 'fee-register',
  'import-address': 'address',
  'import-results': 'results',
};

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get('tab') ?? '';
  const legacyAppSection = LEGACY_TAB_TO_SECTION[tabParam];
  const legacyImportSection = LEGACY_IMPORT_TAB_TO_SECTION[tabParam];
  const initialTab: Tab =
    legacyAppSection ? 'student-app' :
    legacyImportSection ? 'import' :
    TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'general';
  const sectionParam = searchParams.get('section');
  const initialAppSection: StudentAppSection = legacyAppSection ?? (isStudentAppSection(sectionParam) ? sectionParam : 'ai-settings');
  const initialImportSection: ImportSection = legacyImportSection ?? (isImportSection(sectionParam) ? sectionParam : 'students');
  const initialGeneralSection: GeneralSection = isGeneralSection(sectionParam) ? sectionParam : 'academic-year';
  const initialBackupSection: BackupSection = isBackupSection(sectionParam) ? sectionParam : 'export';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [appSection, setAppSection] = useState<StudentAppSection>(initialAppSection);
  const [importSection, setImportSection] = useState<ImportSection>(initialImportSection);
  const [generalSection, setGeneralSection] = useState<GeneralSection>(initialGeneralSection);
  const [backupSection, setBackupSection] = useState<BackupSection>(initialBackupSection);

  // Mirror the tab (and its active section, if any) into the URL so a
  // refresh or a shared link lands on the same place.
  useEffect(() => {
    const next: Record<string, string> = { tab: activeTab };
    if (activeTab === 'student-app') next.section = appSection;
    else if (activeTab === 'import') next.section = importSection;
    else if (activeTab === 'general') next.section = generalSection;
    else if (activeTab === 'backup') next.section = backupSection;
    setSearchParams(next, { replace: true });
  }, [activeTab, appSection, importSection, generalSection, backupSection, setSearchParams]);

  // Messaging config state
  const [msgApiKey, setMsgApiKey] = useState('');
  const [msgSenderId, setMsgSenderId] = useState('');
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgSaving, setMsgSaving] = useState(false);
  const [msgSaveMsg, setMsgSaveMsg] = useState('');
  const [msgSaveError, setMsgSaveError] = useState('');

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
  const [syncingClaim, setSyncingClaim] = useState(false);
  const [syncClaimMsg,  setSyncClaimMsg]  = useState('');

  // Load messaging config when messaging tab is opened
  useEffect(() => {
    if (activeTab !== 'messaging') return;
    setMsgLoading(true);
    getMessagingConfig()
      .then((cfg) => {
        if (cfg) { setMsgApiKey(cfg.fast2smsApiKey); setMsgSenderId(cfg.senderId); }
      })
      .catch(() => {})
      .finally(() => setMsgLoading(false));
  }, [activeTab]);
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

  async function handleSyncMyAccess() {
    setSyncingClaim(true);
    setSyncClaimMsg('');
    try {
      const isAdmin = await syncMyAdminClaim();
      await auth.currentUser?.getIdToken(true);
      setSyncClaimMsg(isAdmin ? 'Access refreshed — admin permissions are active.' : 'Synced, but this account is not marked as admin in Firestore.');
    } catch (err) {
      setSyncClaimMsg(err instanceof Error ? err.message : 'Failed to refresh access.');
    } finally {
      setSyncingClaim(false);
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

  async function handleSaveMessaging(e: FormEvent) {
    e.preventDefault();
    setMsgSaveMsg('');
    setMsgSaveError('');
    if (!msgApiKey.trim()) { setMsgSaveError('API key is required.'); return; }
    setMsgSaving(true);
    try {
      await saveMessagingConfig({ fast2smsApiKey: msgApiKey.trim(), senderId: msgSenderId.trim() || 'SMPCLG' });
      setMsgSaveMsg('Messaging settings saved.');
    } catch (err: unknown) {
      setMsgSaveError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setMsgSaving(false);
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

        {/* ── General (academic year, certificate history, delete student, danger zone) ── */}
        {activeTab === 'general' && (
          <GeneralPanel section={generalSection} onSectionChange={setGeneralSection} />
        )}

        {/* ── Fee Structure ── */}
        {activeTab === 'fee-structure' && (
          <div className="h-full" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <FeeStructurePage />
          </div>
        )}

        {/* ── Exam Fee ── */}
        {activeTab === 'exam-fee' && (
          <div className="h-full" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <ExamFee />
          </div>
        )}

        {/* ── Import (students, address, fee register, fee structure, results) ── */}
        {activeTab === 'import' && (
          <ImportPanel section={importSection} onSectionChange={setImportSection} />
        )}

        {/* ── Messaging ── */}
        {activeTab === 'messaging' && (
          <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <div className="max-w-md space-y-5">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" style={{ animation: 'page-enter 0.2s ease-out both' }}>
                <h3 className="text-base font-medium text-gray-800 mb-1">Bulk SMS Composer</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Temporarily moved off the sidebar while it's being finished. Open it here in the meantime.
                </p>
                <Button variant="secondary" onClick={() => navigate('/messaging')}>
                  Open Bulk SMS Composer →
                </Button>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" style={{ animation: 'page-enter 0.2s ease-out both' }}>
                <h3 className="text-base font-medium text-gray-800 mb-1">Fast2SMS Configuration</h3>
                <p className="text-sm text-gray-500 mb-4">
                  These credentials are used by the Bulk SMS feature to send messages via Fast2SMS.
                  Your API key is stored securely in Firestore and never exposed to students.
                </p>
                {msgLoading ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : (
                  <form onSubmit={(e) => { void handleSaveMessaging(e); }} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Fast2SMS API Key
                      </label>
                      <input
                        type="password"
                        value={msgApiKey}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => { setMsgApiKey(e.target.value); setMsgSaveMsg(''); setMsgSaveError(''); }}
                        placeholder="Paste your Fast2SMS API key"
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sender ID <span className="text-gray-400 font-normal">(optional, default: SMPCLG)</span>
                      </label>
                      <input
                        type="text"
                        value={msgSenderId}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => { setMsgSenderId(e.target.value.toUpperCase()); setMsgSaveMsg(''); setMsgSaveError(''); }}
                        placeholder="SMPCLG"
                        maxLength={11}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    {msgSaveError && (
                      <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{msgSaveError}</p>
                    )}
                    {msgSaveMsg && (
                      <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">{msgSaveMsg}</p>
                    )}
                    <Button type="submit" loading={msgSaving}>
                      Save Messaging Settings
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Staff Accounts ── */}
        {activeTab === 'staff' && (
          <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <div className="max-w-lg space-y-5">

              {/* Refresh my access (custom claim sync) */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6" style={{ animation: 'page-enter 0.2s ease-out both' }}>
                <h3 className="text-base font-medium text-gray-800 mb-1">My Access</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Refreshes the admin permission used for Storage uploads (e.g. remittance challan copies) from your current role.
                  Use this once, or any time uploads unexpectedly fail with a permission error.
                </p>
                <Button onClick={() => { void handleSyncMyAccess(); }} loading={syncingClaim} variant="secondary">
                  Refresh My Permissions
                </Button>
                {syncClaimMsg && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-md px-3 py-2 mt-3">{syncClaimMsg}</p>
                )}
              </div>

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

        {/* ── Student App (AI settings, app version, header/icon art, daily briefing) ── */}
        {activeTab === 'student-app' && (
          <StudentAppPanel section={appSection} onSectionChange={setAppSection} />
        )}

        {/* ── Backup & Restore (export, restore, data repair) ── */}
        {activeTab === 'backup' && (
          <BackupPanel section={backupSection} onSectionChange={setBackupSection} />
        )}

      </div>
    </div>
  );
}
