import { useState, useEffect, lazy, Suspense, type FormEvent, type ChangeEvent, type ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getStaffUsers, createStaffUser, deactivateStaffUser, reactivateStaffUser, setStaffDefaultYear, syncMyAdminClaim } from '../services/userService';
import { auth } from '../config/firebase';
import { getMessagingConfig, saveMessagingConfig } from '../services/adminConfigService';
import {
  SLATE, SLATE_INK, HAIRLINE, BAND, MINT, CORAL, PAGE_BG, TEXT_INPUT,
  PillButton, FieldLabel, Notice, SettingsCard,
} from '../components/settings/settingsUi';
import { isFeeStructureSection, type FeeStructureSection } from './feeStructureShared';
import { StudentAppPanel, isStudentAppSection, type StudentAppSection } from './StudentAppPanel';
import { ImportPanel, isImportSection, type ImportSection } from './ImportPanel';
import { GeneralPanel, isGeneralSection, type GeneralSection } from './GeneralPanel';
import { BackupPanel, isBackupSection, type BackupSection } from './BackupPanel';

const FeeStructurePanel = lazy(() => import('./FeeStructurePanel').then((m) => ({ default: m.FeeStructurePanel })));
const ExamFee = lazy(() => import('./ExamFee').then((m) => ({ default: m.ExamFee })));
const DtekNewsPanel = lazy(() => import('./DtekNewsPanel').then((m) => ({ default: m.DtekNewsPanel })));
import type { AcademicYear, StaffUser } from '../types';

type Tab = 'general' | 'fee-structure' | 'exam-fee' | 'import' | 'staff' | 'messaging' | 'student-app' | 'dtek-news' | 'backup';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'fee-structure', label: 'Fee Structure' },
  { id: 'exam-fee', label: 'Exam Fee' },
  { id: 'import', label: 'Import' },
  { id: 'staff', label: 'Staff Accounts' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'student-app', label: 'Student App' },
  { id: 'dtek-news', label: 'DTEK News' },
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

// ── Icons (display only) ──────────────────────────────────────────────────────
function Ico({ children, size = 14 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const TAB_ICONS: Record<Tab, ReactNode> = {
  'general': <Ico><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></Ico>,
  'fee-structure': <Ico><path d="M4 3h16v18l-3-2-3 2-2-2-2 2-3-2-3 2z" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /></Ico>,
  'exam-fee': <Ico><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15l2 2 4-4" /></Ico>,
  'import': <Ico><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Ico>,
  'staff': <Ico><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Ico>,
  'messaging': <Ico><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Ico>,
  'student-app': <Ico><rect x="5" y="2" width="14" height="20" rx="2.5" /><line x1="11" y1="18" x2="13" y2="18" /></Ico>,
  'dtek-news': <Ico><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" /><line x1="10" y1="7" x2="18" y2="7" /><line x1="10" y1="11" x2="18" y2="11" /><line x1="10" y1="15" x2="14" y2="15" /></Ico>,
  'backup': <Ico><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></Ico>,
};

const CARD_ICONS = {
  send: <Ico size={17}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Ico>,
  key: <Ico size={17}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></Ico>,
  shield: <Ico size={17}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></Ico>,
  userPlus: <Ico size={17}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></Ico>,
  users: <Ico size={17}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Ico>,
};

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
  const initialFeeSection: FeeStructureSection = isFeeStructureSection(sectionParam) ? sectionParam : 'structures';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [appSection, setAppSection] = useState<StudentAppSection>(initialAppSection);
  const [importSection, setImportSection] = useState<ImportSection>(initialImportSection);
  const [generalSection, setGeneralSection] = useState<GeneralSection>(initialGeneralSection);
  const [backupSection, setBackupSection] = useState<BackupSection>(initialBackupSection);
  const [feeSection, setFeeSection] = useState<FeeStructureSection>(initialFeeSection);

  // Mirror the tab (and its active section, if any) into the URL so a
  // refresh or a shared link lands on the same place.
  useEffect(() => {
    const next: Record<string, string> = { tab: activeTab };
    if (activeTab === 'student-app') next.section = appSection;
    else if (activeTab === 'import') next.section = importSection;
    else if (activeTab === 'general') next.section = generalSection;
    else if (activeTab === 'backup') next.section = backupSection;
    else if (activeTab === 'fee-structure') next.section = feeSection;
    setSearchParams(next, { replace: true });
  }, [activeTab, appSection, importSection, generalSection, backupSection, feeSection, setSearchParams]);

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
    <div
      className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{ background: PAGE_BG, animation: 'page-enter 0.22s ease-out' }}
    >

      {/* Page header */}
      <div className="flex-shrink-0 flex items-end gap-4 min-w-0">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">
            SMP Admissions · Settings
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <h2 className="text-[22px] font-bold leading-none tracking-[-0.3px]" style={{ color: SLATE_INK }}>Settings</h2>
            <span
              key={activeTab}
              className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-[4px] text-[10.5px] font-medium leading-none"
              style={{ borderColor: `${SLATE}66`, color: SLATE_INK, animation: 'page-enter 0.18s ease-out' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: SLATE }} />
              {TABS.find((t) => t.id === activeTab)?.label}
            </span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 rounded-2xl border bg-white p-1.5" style={{ borderColor: HAIRLINE }}>
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-[7px] text-[12.5px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5BA9]/40 ${
                  isActive
                    ? 'text-white'
                    : 'text-[#5B6371] hover:bg-[#3B5BA9]/[0.07] hover:text-[#2B437F]'
                }`}
                style={isActive ? { background: `linear-gradient(135deg, ${SLATE}, ${SLATE_INK})`, boxShadow: `0 3px 10px ${SLATE}40` } : undefined}
              >
                <span className={isActive ? 'opacity-95' : 'opacity-70'}>{TAB_ICONS[tab.id]}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">

        {/* ── General (academic year, certificate history, delete student, danger zone) ── */}
        {activeTab === 'general' && (
          <GeneralPanel section={generalSection} onSectionChange={setGeneralSection} />
        )}

        {/* ── Fee Structure ── */}
        {activeTab === 'fee-structure' && (
          <Suspense fallback={null}><FeeStructurePanel section={feeSection} onSectionChange={setFeeSection} /></Suspense>
        )}

        {/* ── Exam Fee ── */}
        {activeTab === 'exam-fee' && (
          <div className="h-full" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <Suspense fallback={null}><ExamFee /></Suspense>
          </div>
        )}

        {/* ── Import (students, address, fee register, fee structure, results) ── */}
        {activeTab === 'import' && (
          <ImportPanel section={importSection} onSectionChange={setImportSection} />
        )}

        {/* ── Messaging ── */}
        {activeTab === 'messaging' && (
          <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <div className="max-w-2xl space-y-4 pb-2">
              <SettingsCard
                title="Bulk SMS Composer"
                subtitle="Temporarily moved off the sidebar while it's being finished. Open it here in the meantime."
                icon={CARD_ICONS.send}
              >
                <PillButton tone="slate" onClick={() => navigate('/messaging')}>
                  Open Bulk SMS Composer →
                </PillButton>
              </SettingsCard>
              <SettingsCard
                title="Fast2SMS Configuration"
                subtitle={<>These credentials are used by the Bulk SMS feature to send messages via Fast2SMS. Your API key is stored securely in Firestore and never exposed to students.</>}
                icon={CARD_ICONS.key}
                tone="#7C5CC4"
                delay={0.05}
              >
                {msgLoading ? (
                  <div className="flex items-center gap-2 text-[12.5px] text-[#8A93A3]">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-[#D9E1F2] border-t-[#3B5BA9] animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <form onSubmit={(e) => { void handleSaveMessaging(e); }} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
                      <div>
                        <FieldLabel>Fast2SMS API Key</FieldLabel>
                        <input
                          type="password"
                          value={msgApiKey}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => { setMsgApiKey(e.target.value); setMsgSaveMsg(''); setMsgSaveError(''); }}
                          placeholder="Paste your Fast2SMS API key"
                          className={TEXT_INPUT}
                        />
                      </div>
                      <div>
                        <FieldLabel hint="(optional, default: SMPCLG)">Sender ID</FieldLabel>
                        <input
                          type="text"
                          value={msgSenderId}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => { setMsgSenderId(e.target.value.toUpperCase()); setMsgSaveMsg(''); setMsgSaveError(''); }}
                          placeholder="SMPCLG"
                          maxLength={11}
                          className={`${TEXT_INPUT} tracking-wide`}
                        />
                      </div>
                    </div>
                    {msgSaveError && <Notice tone="error">{msgSaveError}</Notice>}
                    {msgSaveMsg && <Notice tone="success">{msgSaveMsg}</Notice>}
                    <div className="pt-1 border-t" style={{ borderColor: BAND }}>
                      <PillButton type="submit" loading={msgSaving} className="mt-3">
                        Save Messaging Settings
                      </PillButton>
                    </div>
                  </form>
                )}
              </SettingsCard>
            </div>
          </div>
        )}

        {/* ── Staff Accounts ── */}
        {activeTab === 'staff' && (
          <div className="h-full overflow-auto" style={{ animation: 'page-enter 0.22s ease-out' }}>
            <div className="max-w-5xl space-y-4 pb-2">

              <div className="grid gap-4 lg:grid-cols-2 items-start">
                {/* Refresh my access (custom claim sync) */}
                <SettingsCard
                  title="My Access"
                  subtitle={<>Refreshes the admin permission used for Storage uploads (e.g. remittance challan copies) from your current role. Use this once, or any time uploads unexpectedly fail with a permission error.</>}
                  icon={CARD_ICONS.shield}
                  tone={MINT}
                >
                  <PillButton tone="slate" onClick={() => { void handleSyncMyAccess(); }} loading={syncingClaim}>
                    Refresh My Permissions
                  </PillButton>
                  {syncClaimMsg && <Notice tone="info" className="mt-3">{syncClaimMsg}</Notice>}
                </SettingsCard>

                {/* Create staff account */}
                <SettingsCard
                  title="Create Staff Account"
                  subtitle={<>Staff can enroll students, view student list, fee register, and dashboard. They cannot edit/delete students, collect fees, or access settings.</>}
                  icon={CARD_ICONS.userPlus}
                  delay={0.04}
                >
                  <form onSubmit={(e) => { void handleCreateStaff(e); }} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <FieldLabel>Email</FieldLabel>
                        <input
                          type="email"
                          value={newStaffEmail}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => { setNewStaffEmail(e.target.value); setStaffCreateError(''); setStaffCreateMsg(''); }}
                          placeholder="staff@example.com"
                          className={TEXT_INPUT}
                        />
                      </div>
                      <div>
                        <FieldLabel>Password</FieldLabel>
                        <input
                          type="password"
                          value={newStaffPassword}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => { setNewStaffPassword(e.target.value); setStaffCreateError(''); setStaffCreateMsg(''); }}
                          placeholder="Min 6 characters"
                          className={TEXT_INPUT}
                        />
                      </div>
                    </div>
                    {staffCreateError && <Notice tone="error">{staffCreateError}</Notice>}
                    {staffCreateMsg && <Notice tone="success">{staffCreateMsg}</Notice>}
                    <PillButton type="submit" loading={creatingStaff}>
                      Create Staff Account
                    </PillButton>
                  </form>
                </SettingsCard>
              </div>

              {/* Staff list */}
              <SettingsCard
                title="Staff Accounts"
                icon={CARD_ICONS.users}
                tone="#0B7BC0"
                delay={0.08}
                right={!staffLoading && !staffError && (
                  <span
                    className="rounded-full border bg-white px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums"
                    style={{ borderColor: `${SLATE}66`, color: SLATE_INK }}
                  >
                    {staffUsers.length} {staffUsers.length === 1 ? 'account' : 'accounts'}
                  </span>
                )}
              >
                {staffLoading ? (
                  <div className="flex items-center gap-2 text-[12.5px] text-[#8A93A3]">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-[#D9E1F2] border-t-[#3B5BA9] animate-spin" />
                    Loading...
                  </div>
                ) : staffError ? (
                  <Notice tone="error">{staffError}</Notice>
                ) : staffUsers.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-center text-[12.5px] text-[#8A93A3]" style={{ borderColor: HAIRLINE }}>
                    No staff accounts yet.
                  </div>
                ) : (
                  <ul className="rounded-xl border overflow-hidden divide-y" style={{ borderColor: HAIRLINE }}>
                    {staffUsers.map((u) => {
                      const tone = u.active ? MINT : CORAL;
                      return (
                        <li key={u.uid} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3 hover:bg-[#F8FAFE] transition-colors" style={{ borderColor: BAND }}>
                          <div className="flex items-center gap-3 min-w-0 flex-1 basis-56">
                            <span
                              className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[14px] font-semibold"
                              style={
                                u.active
                                  ? { background: `${SLATE}14`, color: SLATE_INK, boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${SLATE}40` }
                                  : { background: '#F1F2F5', color: '#8A93A3', boxShadow: '0 0 0 2px #fff, 0 0 0 3.5px #E3E6EC' }
                              }
                            >
                              {u.email.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className={`text-[13px] font-medium truncate ${u.active ? 'text-[#262B35]' : 'text-[#8A93A3]'}`}>{u.email}</p>
                              <p className="text-[10.5px] text-[#8A93A3]">
                                Created {new Date(u.createdAt).toLocaleDateString('en-IN')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10.5px] text-[#8A93A3] shrink-0">Default year:</span>
                            <select
                              value={u.defaultAcademicYear ?? ''}
                              onChange={(e) => { void handleSetDefaultYear(u.uid, e.target.value); }}
                              disabled={savingYearFor === u.uid}
                              className="rounded-full border border-[#3B5BA9]/35 bg-white px-2.5 py-1 text-[11px] font-medium text-[#2B437F] hover:border-[#3B5BA9]/60 focus:outline-none focus:ring-2 focus:ring-[#3B5BA9]/25 cursor-pointer disabled:opacity-50 transition-colors"
                            >
                              <option value="">Not set (follows global)</option>
                              {ACADEMIC_YEAR_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            {savingYearFor === u.uid && (
                              <span className="text-[10.5px] text-[#3B5BA9]">Saving…</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-auto">
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-[4px] text-[10.5px] font-medium"
                              style={{ borderColor: `${tone}55`, color: u.active ? '#0A7A4B' : '#A5173A' }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone }} />
                              {u.active ? 'Active' : 'Deactivated'}
                            </span>
                            <PillButton
                              tone={u.active ? 'red' : 'green'}
                              className="!px-3 !py-1 !text-[11px]"
                              onClick={() => { void handleToggleStaff(u.uid, u.active); }}
                            >
                              {u.active ? 'Deactivate' : 'Reactivate'}
                            </PillButton>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SettingsCard>
            </div>
          </div>
        )}

        {/* ── Student App (AI settings, app version, header/icon art, daily briefing) ── */}
        {activeTab === 'student-app' && (
          <StudentAppPanel section={appSection} onSectionChange={setAppSection} />
        )}

        {/* ── DTEK News (department circular digest shown on the Dashboard) ── */}
        {activeTab === 'dtek-news' && <Suspense fallback={null}><DtekNewsPanel /></Suspense>}

        {/* ── Backup & Restore (export, restore, data repair) ── */}
        {activeTab === 'backup' && (
          <BackupPanel section={backupSection} onSectionChange={setBackupSection} />
        )}

      </div>
    </div>
  );
}
