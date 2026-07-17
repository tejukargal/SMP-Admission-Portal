export type UserRole = 'admin' | 'staff';

export interface StaffUser {
  uid: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  defaultAcademicYear?: AcademicYear;
}

export type Gender = 'BOY' | 'GIRL';
export type Religion = 'HINDU' | 'MUSLIM' | 'CHRISTIAN' | 'JAIN' | 'BUDDHIST' | 'SIKH';
export type Category = 'SC' | 'ST' | 'C1' | '2A' | '2B' | '3A' | '3B' | 'GM';
export type CategoryGroup = 'GM' | 'OBC' | 'SC_ST';
export const CATEGORY_GROUPS: Record<CategoryGroup, Category[]> = {
  GM: ['GM'],
  OBC: ['2A', '2B', '3A', '3B', 'C1'],
  SC_ST: ['SC', 'ST'],
};
export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  GM: 'GM', OBC: 'OBC', SC_ST: 'SC/ST',
};
export type Course = 'CE' | 'ME' | 'EC' | 'CS' | 'EE';
export type Year = '1ST YEAR' | '2ND YEAR' | '3RD YEAR';
export type AdmType = 'REGULAR' | 'REPEATER' | 'LATERAL' | 'EXTERNAL' | 'SNQ';
export type AdmCat = 'GM' | 'SNQ' | 'OTHERS';
export type TenthBoard = 'SSLC' | 'CBSE' | 'ICSE' | 'OUT OF STATE';
export type PriorQualification = 'NONE' | 'ITI' | 'PUC';
export type AcademicYear =
  | '2012-13' | '2013-14' | '2014-15' | '2015-16' | '2016-17' | '2017-18'
  | '2018-19' | '2019-20' | '2020-21' | '2021-22' | '2022-23' | '2023-24'
  | '2024-25' | '2025-26' | '2026-27' | '2027-28' | '2028-29' | '2029-30';

// Manually-set (or TC-auto-detected) outcome tag for a student who did not
// re-enroll in the current academic year — shown/edited from the Not Admitted
// List's right-click context menu in StudentReports.tsx.
export type NotAdmittedStatusTag = 'ANS' | 'LEFTOUT' | 'TRANSFERRED' | 'TC_ISSUED';

export interface Student {
  id: string;
  studentNameSSLC: string;
  studentNameAadhar: string;
  fatherName: string;
  motherName: string;
  dateOfBirth: string;
  gender: Gender;
  religion: Religion;
  caste: string;
  category: Category;
  tenthBoard: TenthBoard;
  priorQualification: PriorQualification;
  sslcMaxTotal: number;
  sslcObtainedTotal: number;
  scienceMax: number;
  scienceObtained: number;
  mathsMax: number;
  mathsObtained: number;
  mathsScienceMaxTotal: number;
  mathsScienceObtainedTotal: number;
  annualIncome: number;
  address: string;
  town: string;
  taluk: string;
  district: string;
  pucMaxTotal: number;
  pucObtainedTotal: number;
  pucPercentage: number;
  itiMaxTotal: number;
  itiObtainedTotal: number;
  itiPercentage: number;
  itiPucCombination: string;
  fatherMobile: string;
  studentMobile: string;
  course: Course;
  year: Year;
  admType: AdmType;
  admCat: AdmCat;
  academicYear: AcademicYear;
  admissionStatus: string;
  enrollmentDate: string;
  applicationNumber: string;
  meritNumber: string;
  regNumber: string;
  aadharNumber: string;
  apaarId: string;
  allottedCategory?: string;
  notAdmittedStatusTag?: NotAdmittedStatusTag;
  transferredIn?: boolean;
  transferInPolytechnic?: string;
  transferOut?: boolean;
  transferOutDate?: string;
  transferOutPolytechnic?: string;
  createdAt: string;
  updatedAt: string;
}

// allottedCategory, notAdmittedStatusTag, transferOut, transferOutDate and
// transferOutPolytechnic are intentionally excluded — they are set via their own dedicated
// service calls (not through the enrollment form), so normal edits must never accidentally
// clear them. transferredIn/transferInPolytechnic stay in the form — captured via the
// enrollment form's "Transferred In" checkbox + polytechnic name field.
export type StudentFormData = Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'allottedCategory' | 'notAdmittedStatusTag' | 'transferOut' | 'transferOutDate' | 'transferOutPolytechnic'>;

// ─── Fee types ────────────────────────────────────────────────────────────────

export type SMPFeeHead =
  | 'adm' | 'tuition' | 'lib' | 'rr' | 'sports' | 'lab'
  | 'dvp' | 'mag' | 'idCard' | 'ass' | 'swf' | 'twf' | 'nss' | 'fine';

export const SMP_FEE_HEADS: { key: SMPFeeHead; label: string }[] = [
  { key: 'adm',     label: 'Adm' },
  { key: 'tuition', label: 'Tuition' },
  { key: 'lib',     label: 'Lib' },
  { key: 'rr',      label: 'RR' },
  { key: 'sports',  label: 'Sports' },
  { key: 'lab',     label: 'Lab' },
  { key: 'dvp',     label: 'DVP' },
  { key: 'mag',     label: 'Mag' },
  { key: 'idCard',  label: 'ID' },
  { key: 'ass',     label: 'Ass' },
  { key: 'swf',     label: 'SWF' },
  { key: 'twf',     label: 'TWF' },
  { key: 'nss',     label: 'NSS' },
  { key: 'fine',    label: 'Fine' },
];

export type SMPHeads = Record<SMPFeeHead, number>;

export interface FeeAdditionalHead {
  label: string;
  amount: number;
}

/** A single period in the fine schedule — fine applies on dates from..to (inclusive). */
export interface FinePeriod {
  from: string;   // "YYYY-MM-DD"
  to: string;     // "YYYY-MM-DD"
  amount: number;
}

/** Fee structure — allotted amounts per course/year/admType/admCat per academic year */
export interface FeeStructure {
  id: string;               // composite: `${academicYear}__${course}__${year}__${admType}__${admCat}`
  academicYear: AcademicYear;
  course: Course;
  year: Year;
  admType: AdmType;
  admCat: AdmCat;
  smp: SMPHeads;            // allotted SMP amounts
  svk: number;              // allotted SVK base amount
  additionalHeads: FeeAdditionalHead[];  // extra SVK heads (Red Cross, App Fee, etc.)
  createdAt: string;
  updatedAt: string;
}

export type FeeStructureFormData = Omit<FeeStructure, 'id' | 'createdAt' | 'updatedAt'>;

/** Fee record — amounts collected per student per academic year */
export interface FeeRecord {
  id: string;               // composite: `${studentId}__${academicYear}`
  studentId: string;
  studentName: string;
  fatherName: string;
  regNumber: string;
  course: Course;
  year: Year;
  admCat: AdmCat;
  admType: AdmType;
  academicYear: AcademicYear;
  date: string;             // date of payment (ISO)
  receiptNumber: string;          // SMP Rpt
  svkReceiptNumber: string;       // SVK Rpt (e.g. "SVK DVP 1")
  additionalReceiptNumber: string; // Additional Fee Rpt (e.g. "0001")
  paymentMode: PaymentMode;         // primary mode (backward compat; equals SMP mode if SMP was paid)
  smpPaymentMode?: PaymentMode;     // payment mode for SMP component
  svkPaymentMode?: PaymentMode;     // payment mode for SVK component
  additionalPaymentMode?: PaymentMode; // payment mode for Additional Fee component
  smpSplit?: SplitPayment;          // cash/upi split amounts for SMP (when smpPaymentMode === 'SPLIT')
  svkSplit?: SplitPayment;          // cash/upi split amounts for SVK (when svkPaymentMode === 'SPLIT')
  additionalSplit?: SplitPayment;   // cash/upi split amounts for Additional (when additionalPaymentMode === 'SPLIT')
  remarks: string;
  isDueFee?: boolean;       // true when collected as a due/installment payment (prior payments existed)
  smp: SMPHeads;            // paid amounts per SMP head
  svk: number;              // SVK base paid
  additionalPaid: FeeAdditionalHead[];  // additional fee heads paid
  createdAt: string;
  updatedAt: string;
}

export type PaymentMode = 'CASH' | 'UPI' | 'SPLIT';

export interface SplitPayment {
  cash: number;
  upi: number;
}

export type FeeRecordFormData = Omit<FeeRecord, 'id' | 'createdAt' | 'updatedAt'>;

/** Per-student override of allotted fee amounts (for special cases like out-of-state, special permission). */
export interface StudentFeeOverride {
  id: string;                       // `${studentId}__${academicYear}`
  studentId: string;
  academicYear: AcademicYear;
  smp: SMPHeads;                    // overridden allotted amounts per SMP head
  svk: number;                      // overridden SVK base allotted
  additionalHeads: FeeAdditionalHead[];  // same labels as structure, custom amounts
  updatedAt: string;
}

export const ACADEMIC_YEARS: AcademicYear[] = [
  '2012-13', '2013-14', '2014-15', '2015-16', '2016-17', '2017-18',
  '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24',
  '2024-25', '2025-26', '2026-27', '2027-28', '2028-29', '2029-30',
];

/** Academic-year-level fine schedule — one document per year in `fineSchedules` collection. */
export interface AcademicFineSchedule {
  academicYear: AcademicYear;
  periods: FinePeriod[];
  updatedAt: string;
}

// ─── Inquiry (pre-admission walk-in) ─────────────────────────────────────────

export type InquiryStatus = 'active' | 'converted' | 'cancelled';

export interface Inquiry {
  id: string;
  studentName: string;
  parentName?: string;      // Parent / Guardian name
  parentMobile?: string;    // Father / Guardian mobile (mandatory on new records)
  studentMobile?: string;   // Student mobile (optional)
  mobile?: string;          // Legacy field — kept for backward compat with old records
  address: string;
  interestedCourse: Course;
  visitDate: string;       // 'YYYY-MM-DD'
  notes: string;
  status: InquiryStatus;
  academicYear: AcademicYear;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  id: 'app_settings';
  currentAcademicYear: AcademicYear;
  updatedAt: string;
}

// ─── Document tracking ────────────────────────────────────────────────────────

export const REQUIRED_DOCS = [
  { key: 'sslcMarksCard',          label: 'SSLC Marks Card' },
  { key: 'transferCertificate',    label: 'TC' },
  { key: 'studyCertificate',       label: 'Study Certificate' },
  { key: 'casteCertificate',       label: 'Caste Certificate' },
  { key: 'incomeCertificate',      label: 'Income Certificate' },
  { key: 'aadharCopy',             label: 'Copy of Aadhar' },
  { key: 'eligibilityCertificate', label: 'Eligibility Certificate' },
  { key: 'passportPhotos',         label: 'Passport Photos (5 nos.)' },
] as const;

export type DocKey = (typeof REQUIRED_DOCS)[number]['key'];

export interface DocEntry {
  submitted: boolean;
  submittedOn: string;   // 'YYYY-MM-DD' or ''
  returned: boolean;
  returnedOn: string;    // 'YYYY-MM-DD' or ''
  remarks: string;
  notRequired?: boolean;
}

export type DocRecord = Record<DocKey, DocEntry>;

export interface StudentDocuments {
  id: string;            // == studentId
  studentId: string;
  docs: Partial<DocRecord>;
  updatedAt: string;
}

// ─── Merit List Snapshots ─────────────────────────────────────────────────────

/** Frozen snapshot of a single student's merit-list data, stored at save time. */
export interface MeritListStudent {
  studentNameSSLC: string;
  fatherName: string;
  gender: string;
  dateOfBirth: string;
  category: string;
  annualIncome: number;
  mathsScienceMaxTotal: number;
  mathsScienceObtainedTotal: number;
  sslcMaxTotal: number;
  sslcObtainedTotal: number;
  meritNumber: string;
  course: Course;
  year: Year;
  // Lateral-entry fields (present only on lateral snapshots)
  priorQualification?: string;
  itiMaxTotal?: number;
  itiObtainedTotal?: number;
  itiPercentage?: number;
  pucMaxTotal?: number;
  pucObtainedTotal?: number;
  pucPercentage?: number;
  itiPucCombination?: string;
}

/** Immutable snapshot of the merit list saved at a point in time. */
export interface MeritListSnapshot {
  id: string;
  phase: number;
  academicYear: AcademicYear;
  savedAt: string;        // ISO timestamp
  students: MeritListStudent[];
  type?: 'lateral';       // absent = regular merit list
}

// ─── Exam Fee ─────────────────────────────────────────────────────────────────

/** Exam fee payment status per student per academic year */
export interface ExamFeeRecord {
  id: string;            // `${studentId}__${academicYear}`
  studentId: string;
  academicYear: AcademicYear;
  paid: boolean;
  updatedAt: string;
}

// ─── Fee Remittance ───────────────────────────────────────────────────────────

export type RemittancePayee = 'GOV' | 'SVK' | 'SMP';
export type RemittanceMode  = 'Online' | 'NEFT' | 'Cheque';

/** Per-fee-head amounts for a Government (K2) remittance */
export interface GovHeadAmounts {
  tuition:  number;
  dvp:      number;
  adm:      number;
  lab:      number;
  rr:       number;
  magazine: number;
  idCard:   number;
  fine:     number;
}

/** Per-fee-head K2 challan references for a Government (K2) remittance */
export interface GovHeadRefs {
  tuition:  string;
  dvp:      string;
  adm:      string;
  lab:      string;
  rr:       string;
  magazine: string;
  idCard:   string;
  fine:     string;
}

export interface FeeRemittance {
  id:          string;
  academicYear: AcademicYear;
  payee:       RemittancePayee;
  phase:       string;          // e.g. "1st Phase", "2nd Phase"
  date:        string;          // YYYY-MM-DD
  paymentMode: RemittanceMode;
  reference:   string;          // challan / cheque / NEFT ref (for GOV: summary of head refs)
  amount:      number;          // total (sum of govHeads for GOV payee)
  govHeads?:   GovHeadAmounts; // present only when payee === 'GOV'
  govHeadRefs?: GovHeadRefs;   // present only when payee === 'GOV' — per-head K2 challan ref
  challanUrl?:  string;        // download URL of the uploaded soft copy — used for SVK/SMP (single payment-level proof)
  challanPath?: string;        // Firebase Storage path, needed to delete/replace the file
  govHeadChallans?: Partial<Record<keyof GovHeadAmounts, GovHeadChallan>>; // present only when payee === 'GOV' — per-head soft copy
  remarks:     string;
  createdAt:   string;
  updatedAt:   string;
}

/** A single uploaded soft-copy file (download URL + storage path for delete/replace) */
export interface GovHeadChallan {
  url:  string;
  path: string;
}

// ─── Exam Results (parsed from Result Ledger PDFs) ─────────────────────────────

export interface ExamResultSubject {
  sem: number;
  code: string;
  subject: string;
  iaTrPr: string;      // raw "225/--/80" style string
  result: 'P' | 'F';
  credit: number;
  grade: string;
}

export interface ExamResultSemesterSummary {
  semester: number;           // 1..6
  creditsApplied: number | null;  // null = not attempted ("--" in ledger)
  creditsEarned: number | null;
  creditPoints: number | null;
  sgpa: number | null;
  attempts: number | null;
}

// ─── Student Portal — Notices & Messages ───────────────────────────────────────

export type NoticeCategory = 'fee' | 'document' | 'general';
export type NoticeScope = 'all' | 'academicYear' | 'course' | 'regNumber' | 'selected';

/** Admin-authored announcement, optionally targeted to a subset of students. */
export interface Notice {
  id: string;
  title: string;
  body: string;
  category: NoticeCategory;
  scope: NoticeScope;
  scopeValue?: string;          // AcademicYear / Course / regNumber string — present for legacy scopes only
  targetRegNumbers?: string[];  // exact recipient list, present when scope === 'selected'
  audienceLabel?: string;       // human-readable summary of the audience, e.g. "CE · 2ND YEAR · Has Dues (24 students)"
  createdAt: string;
  createdBy: string;        // admin uid
  updatedAt?: string;       // set when the notice is edited after being sent
  archivedAt?: string;      // set when admin unpublishes the notice — hidden from all students, kept for admin review; cleared again on publish
  inactiveAt?: string;      // set when admin marks a notice "finished" — stays visible to students (unlike archivedAt) but labeled Inactive and sorted below Active notices; cleared again on reactivate
  attachments?: StoredAttachment[]; // optional Firebase Storage files — absent on legacy notices
}

/** Per-student "which notices have I seen" state (drives the unread badge; students cannot dismiss notices themselves) — one doc per student, keyed by regNumber. */
export interface StudentNoticeState {
  regNumber: string;
  seenNoticeIds: string[];
  updatedAt: string;
}

// ─── Student Portal — Circulars ────────────────────────────────────────────────

export type Department =
  | 'CE' | 'ME' | 'CS' | 'EC' | 'EE' | 'All' | 'Office' | 'Results'
  | 'Fee Dues' | 'Exams' | 'Scholarships' | 'Internship' | 'Annual Day'
  | 'Functions' | 'Admission Ticket' | 'Admissions' | 'Red Cross' | 'NSS';

/** File stored in Firebase Storage; `url` is a tokenized download URL usable without auth. */
export interface StoredAttachment {
  name: string;         // original filename
  type: string;         // MIME type
  size: number;         // bytes
  url: string;          // getDownloadURL() result
  storagePath: string;  // e.g. circulars/{circularId}/{ts}_{name} — for admin delete
}

/** College-wide circular — visible to ALL students; department is a label/filter, not access control. */
export interface Circular {
  id: string;
  title: string;
  date: string;          // YYYY-MM-DD display date chosen by admin
  subject: string;
  department: Department;
  body: string;          // HTML from the rich text editor, sanitized on render
  attachments: StoredAttachment[];
  createdAt: string;
  createdBy: string;     // admin uid
  updatedAt?: string;
  archivedAt?: string;   // unpublished — hidden from students, kept for admin
  pinned?: boolean;      // shown first in the student portal's Circulars tab, ahead of date sorting
}

/** Per-student seen-circular ids (unread badge) — one doc per student, keyed by regNumber. */
export interface StudentCircularState {
  regNumber: string;
  seenCircularIds: string[];
  updatedAt: string;
}

/** One doc per student (keyed by their portal Auth uid), updated by the studentLogin Cloud Function on login and self-updated on logout. */
export interface StudentLoginActivity {
  id: string;             // doc id === student's portal Auth uid
  regNumber: string;
  studentName: string;
  course: string;
  year: string;
  lastLoginAt: string;
  loginCount: number;
  online: boolean;
  lastLogoutAt?: string;
}

export type StudentNotificationType =
  | 'fee-paid' | 'fee-dues-updated' | 'profile-updated' | 'status-changed' | 'allotted-category';

/** Auto-generated "your record changed" notification, shown once at portal login. */
export interface StudentNotification {
  id: string;
  studentId: string;     // the specific Student doc id at time of change
  regNumber: string;     // stable identity across academic years — query key
  type: StudentNotificationType;
  title: string;
  message: string;
  createdAt: string;
  createdBy: string;     // admin/staff uid
  seen: boolean;
  seenAt?: string;
}

export type StudentMessageCategory = 'name-correction' | 'profile-update' | 'other';
export type StudentMessageStatus = 'open' | 'resolved';

/** A free-text message/query submitted by a student to admin. */
export interface StudentMessage {
  id: string;
  regNumber: string;
  studentName: string;
  category: StudentMessageCategory;
  message: string;
  status: StudentMessageStatus;
  adminReply?: string;
  createdAt: string;
  updatedAt: string;
}

/** A single student's parsed result, from a course-wise Result Ledger PDF. */
export interface ExamResult {
  id: string;                      // `${regNumber}__${examSession slug}`
  regNumber: string;
  studentName: string;
  parentName: string;
  course: Course;
  collegeCode: string;
  examSession: string;             // "Apr/May-2026(26A)" as printed on the ledger
  subjects: ExamResultSubject[];
  semesterSummary: ExamResultSemesterSummary[];
  creditsEarnedCumulative: number | null;
  cgpa: number | null;
  cgpaStatus: string;              // e.g. "Credit(s) Pending" when cgpa is non-numeric
  percentageConversion: number | null;
  overallResult: string;           // First Class / Second Class / Distinction / FAILS / etc.
  studentId: string;               // '' if no matching student found
  academicYear: string;            // '' if unmatched (AcademicYear string when matched)
  year: string;                    // '' if unmatched (Year string when matched)
  importedAt: string;              // ISO
  updatedAt: string;               // ISO
}
