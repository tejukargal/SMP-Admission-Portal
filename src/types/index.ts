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
  pucPercentage: number;
  itiPercentage: number;
  fatherMobile: string;
  studentMobile: string;
  course: Course;
  year: Year;
  admType: AdmType;
  admCat: AdmCat;
  academicYear: AcademicYear;
  admissionStatus: string;
  meritNumber: string;
  regNumber: string;
  createdAt: string;
  updatedAt: string;
}

export type StudentFormData = Omit<Student, 'id' | 'createdAt' | 'updatedAt'>;

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
  remarks: string;
  smp: SMPHeads;            // paid amounts per SMP head
  svk: number;              // SVK base paid
  additionalPaid: FeeAdditionalHead[];  // additional fee heads paid
  createdAt: string;
  updatedAt: string;
}

export type PaymentMode = 'CASH' | 'UPI';

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

export interface AppSettings {
  id: 'app_settings';
  currentAcademicYear: AcademicYear;
  updatedAt: string;
}

// ─── Document tracking ────────────────────────────────────────────────────────

export const REQUIRED_DOCS = [
  { key: 'sslcMarksCard',          label: 'SSLC Marks Card' },
  { key: 'transferCertificate',    label: 'Transfer Certificate' },
  { key: 'studyCertificate',       label: 'Study Certificate' },
  { key: 'characterConduct',       label: 'Character & Conduct Certificate' },
  { key: 'casteCertificate',       label: 'Caste Certificate' },
  { key: 'incomeCertificate',      label: 'Income Certificate' },
  { key: 'physicalFitness',        label: 'Physical Fitness Certificate' },
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
}

export type DocRecord = Record<DocKey, DocEntry>;

export interface StudentDocuments {
  id: string;            // == studentId
  studentId: string;
  docs: Partial<DocRecord>;
  updatedAt: string;
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
