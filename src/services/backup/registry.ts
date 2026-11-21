// Every Firestore collection the backup knows about. Adding a collection to
// the app? Add it here too, or it will silently be missing from backups.

export type BackupGroup =
  | 'Enrollment' | 'Fees' | 'Certificates' | 'Cash & Bank' | 'Results'
  | 'Communication' | 'Admin' | 'Logs';

/**
 * How a single-year backup selects documents:
 *  - field:     `academicYear == year`
 *  - idPrefix:  doc id starts with the year (e.g. counters/2025-26__tc)
 *  - byStudent: doc id is a student id from that year (studentDocuments)
 *  - global:    not year-scoped — the whole collection is included
 */
export type YearScope = 'field' | 'idPrefix' | 'byStudent' | 'global';

/**
 * default: ticked on restore
 * optIn:   unticked on restore (sensitive or rarely wanted)
 * never:   export-only — Firestore rules block client writes
 */
export type RestorePolicy = 'default' | 'optIn' | 'never';

export interface CollectionSpec {
  name: string;
  label: string;
  group: BackupGroup;
  yearScope: YearScope;
  restore: RestorePolicy;
  /** Subcollection names under each doc (backed up for full backups). */
  subcollections?: string[];
  /** For idPrefix: extra id prefixes that are always included (global counters). */
  alwaysIncludePrefixes?: string[];
  note?: string;
}

export const BACKUP_COLLECTIONS: CollectionSpec[] = [
  // ── Enrollment ─────────────────────────────────────────────────────────────
  { name: 'students',          label: 'Students (incl. TC/PC/letters history)', group: 'Enrollment', yearScope: 'field', restore: 'default' },
  { name: 'studentDocuments',  label: 'Document Checklist',  group: 'Enrollment', yearScope: 'byStudent', restore: 'default' },
  { name: 'studentFiles',      label: 'Student Files (metadata)', group: 'Enrollment', yearScope: 'field', restore: 'default' },
  { name: 'inquiries',         label: 'Inquiries',           group: 'Enrollment', yearScope: 'field', restore: 'default' },
  { name: 'meritListSnapshots', label: 'Merit List Snapshots', group: 'Enrollment', yearScope: 'field', restore: 'default' },
  { name: 'counters',          label: 'Counters (merit, reg, TC, exam cert)', group: 'Enrollment', yearScope: 'idPrefix', restore: 'default', alwaysIncludePrefixes: ['examCert__'] },
  { name: 'boardCorrectionRuns', label: 'Board Corrections history', group: 'Enrollment', yearScope: 'global', restore: 'default', subcollections: ['items'] },

  // ── Fees ───────────────────────────────────────────────────────────────────
  { name: 'feeStructure',      label: 'Fee Structure',       group: 'Fees', yearScope: 'field', restore: 'default' },
  { name: 'feeRecords',        label: 'Fee Records (receipts)', group: 'Fees', yearScope: 'field', restore: 'default' },
  { name: 'feeOverrides',      label: 'Fee Overrides',       group: 'Fees', yearScope: 'field', restore: 'default' },
  { name: 'fineSchedules',     label: 'Fine Schedules',      group: 'Fees', yearScope: 'idPrefix', restore: 'default' },
  { name: 'receiptCounters',   label: 'Receipt Counters',    group: 'Fees', yearScope: 'idPrefix', restore: 'default' },
  { name: 'examFeeRecords',    label: 'Exam Fee Records',    group: 'Fees', yearScope: 'field', restore: 'default' },
  { name: 'refunds',           label: 'Refunds',             group: 'Fees', yearScope: 'field', restore: 'default', note: 'Existing refunds with different amounts are locked by rules and will be skipped.' },
  { name: 'feeRemittances',    label: 'Fee Remittances',     group: 'Fees', yearScope: 'field', restore: 'default' },
  { name: 'wpFeeRemittances',  label: 'WP Fee Remittances',  group: 'Fees', yearScope: 'field', restore: 'default' },
  { name: 'smpBudgets',        label: 'SMP Budgets',         group: 'Fees', yearScope: 'idPrefix', restore: 'default' },
  { name: 'wpFeeDistribution', label: 'WP Fee Distribution', group: 'Fees', yearScope: 'idPrefix', restore: 'default' },

  // ── Certificates ───────────────────────────────────────────────────────────
  { name: 'examDutyCertificates',    label: 'Exam Duty Certificates',      group: 'Certificates', yearScope: 'global', restore: 'default' },
  { name: 'examSettingCertificates', label: 'Setting & Conducting Certs',  group: 'Certificates', yearScope: 'global', restore: 'default' },
  { name: 'examDutyStaff',           label: 'Exam Duty Staff directory',   group: 'Certificates', yearScope: 'global', restore: 'default' },
  { name: 'examSubjects',            label: 'Exam Subjects',               group: 'Certificates', yearScope: 'global', restore: 'default' },
  { name: 'config',                  label: 'Config (CCC counter)',        group: 'Certificates', yearScope: 'global', restore: 'default' },

  // ── Cash & Bank ────────────────────────────────────────────────────────────
  { name: 'cashDeposits',          label: 'Cash Deposits',          group: 'Cash & Bank', yearScope: 'global', restore: 'default' },
  { name: 'upiCredits',            label: 'UPI Credits',            group: 'Cash & Bank', yearScope: 'global', restore: 'default' },
  { name: 'denominationAbstracts', label: 'Denomination Abstracts', group: 'Cash & Bank', yearScope: 'idPrefix', restore: 'default' },

  // ── Results ────────────────────────────────────────────────────────────────
  { name: 'examResults', label: 'Exam Results', group: 'Results', yearScope: 'global', restore: 'default' },

  // ── Communication ──────────────────────────────────────────────────────────
  { name: 'circulars',            label: 'Circulars',             group: 'Communication', yearScope: 'global', restore: 'default' },
  { name: 'notices',              label: 'Notices',               group: 'Communication', yearScope: 'global', restore: 'default' },
  { name: 'studentMessages',      label: 'Student Messages',      group: 'Communication', yearScope: 'global', restore: 'default' },
  { name: 'studentNotifications', label: 'Student Notifications', group: 'Communication', yearScope: 'global', restore: 'default' },
  { name: 'studentCircularState', label: 'Circular seen-state',   group: 'Communication', yearScope: 'global', restore: 'optIn' },
  { name: 'studentNoticeState',   label: 'Notice clear-state',    group: 'Communication', yearScope: 'global', restore: 'optIn' },
  { name: 'studentBriefingState', label: 'Briefing seen-state',   group: 'Communication', yearScope: 'global', restore: 'optIn' },
  { name: 'dailyQuote',           label: 'Daily Quotes',          group: 'Communication', yearScope: 'global', restore: 'never' },
  { name: 'scholarshipUpdates',   label: 'Scholarship Updates',   group: 'Communication', yearScope: 'global', restore: 'never' },
  { name: 'dtekNews',             label: 'DTE News digest',       group: 'Communication', yearScope: 'global', restore: 'never' },
  { name: 'dtekCirculars',        label: 'DTE Circulars',         group: 'Communication', yearScope: 'global', restore: 'never' },

  // ── Admin ──────────────────────────────────────────────────────────────────
  { name: 'settings',    label: 'Settings',                group: 'Admin', yearScope: 'global', restore: 'optIn' },
  { name: 'users',       label: 'Staff accounts (roles)',  group: 'Admin', yearScope: 'global', restore: 'optIn', note: 'Only role/active docs — login passwords live in Firebase Auth and cannot be backed up.' },
  { name: 'adminConfig', label: 'Admin config (API keys, SMS)', group: 'Admin', yearScope: 'global', restore: 'optIn' },
  { name: 'appConfig',   label: 'App config (versions, images)', group: 'Admin', yearScope: 'global', restore: 'optIn' },
  { name: 'meta',        label: 'Public stats',            group: 'Admin', yearScope: 'global', restore: 'optIn' },

  // ── Logs ───────────────────────────────────────────────────────────────────
  { name: 'smsLogs',              label: 'SMS Logs',              group: 'Logs', yearScope: 'global', restore: 'optIn' },
  { name: 'studentPushTokens',    label: 'Push tokens',           group: 'Logs', yearScope: 'global', restore: 'optIn' },
  { name: 'studentLoginActivity', label: 'Student login activity', group: 'Logs', yearScope: 'global', restore: 'never' },
];

export const BACKUP_GROUPS: BackupGroup[] = [
  'Enrollment', 'Fees', 'Certificates', 'Cash & Bank', 'Results', 'Communication', 'Admin', 'Logs',
];

const SPEC_BY_NAME = new Map(BACKUP_COLLECTIONS.map((c) => [c.name, c]));

export function getSpec(name: string): CollectionSpec | undefined {
  return SPEC_BY_NAME.get(name);
}

/** Storage folders (see storage.rules) that the "include files" ZIP walks. */
export const STORAGE_PREFIXES = [
  'studentFiles', 'remittanceChallans', 'wpRemittanceChallans', 'cashDepositSlips',
  'circulars', 'noticeAttachments', 'circularBackgrounds',
  'tabHeaderBackgrounds', 'categoryIcons', 'dailyQuoteBackgrounds',
];
