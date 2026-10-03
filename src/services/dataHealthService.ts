import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getAllStudents, CROSS_YEAR_PROPAGATABLE_FIELDS } from './studentService';
import type {
  Student, FeeRecord, Gender, Religion, Category, Course, Year, AdmType, AdmCat,
} from '../types';

// Settings › Backup & Restore › Data Health.
// scanDataHealth() is strictly read-only: it loads every student and fee record once
// and returns proposed patches + report-only issues. Nothing is written until one of
// the apply/resolve functions is called from an explicit Fix click.
//
// Hard rules:
//  • A student's regNumber is never modified — it is the student-portal identity
//    (auth claim, Firestore rules, examResults, per-Reg-No state docs). Reg No
//    problems are report-only.
//  • Fee amounts are never touched and nothing is ever deleted.

const STUDENTS = 'students';
const FEE_RECORDS = 'feeRecords';

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** Uppercase, drop dots, collapse whitespace — "Ravi K. M" ≡ "RAVI K M". */
export function normName(s: string | undefined | null): string {
  return (s ?? '').toUpperCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

const regKey = (s: { regNumber?: string }) => (s.regNumber ?? '').trim().toUpperCase();

function isEmptyVal(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'number') return v === 0 || Number.isNaN(v);
  return false;
}

/** "fatherMobile" → "Father Mobile", "studentNameSSLC" → "Student Name SSLC". */
export function fieldLabel(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const GENDERS: readonly Gender[] = ['BOY', 'GIRL'];
const RELIGIONS: readonly Religion[] = ['HINDU', 'MUSLIM', 'CHRISTIAN', 'JAIN', 'BUDDHIST', 'SIKH'];
const CATEGORIES: readonly Category[] = ['SC', 'ST', 'C1', '2A', '2B', '3A', '3B', 'GM'];
const COURSES: readonly Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: readonly Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const ADM_TYPES: readonly AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL', 'SNQ'];
const ADM_CATS: readonly AdmCat[] = ['GM', 'SNQ', 'OTHERS'];

const MOBILE_RE = /^[6-9]\d{9}$/;

function isValidDob(v: string): boolean {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
    && y >= 1950 && y <= new Date().getFullYear();
}

// ─── Report types ────────────────────────────────────────────────────────────

/** A proposed field update on one document. */
export interface Patch {
  id: string;
  name: string;
  regNo: string;
  academicYear: string;
  fields: Record<string, unknown>;
  before: Record<string, unknown>;
}

export interface ConflictValue {
  value: string;
  years: string[];
}

/** One field that disagrees between a student's year records. */
export interface ConflictRow {
  key: string;
  regNo: string;
  name: string;
  field: keyof Student;
  values: ConflictValue[];
  ids: string[];
}

export type IssueKind =
  | 'invalid-mobile' | 'invalid-aadhar' | 'invalid-dob' | 'invalid-value'
  | 'missing-reg' | 'reg-format'
  | 'duplicate-enrollment' | 'duplicate-aadhar'
  | 'orphan-fee' | 'fee-reg-mismatch';

export interface Issue {
  kind: IssueKind;
  regNo: string;
  name: string;
  academicYear: string;
  detail: string;
}

export interface DataHealthReport {
  scannedAt: string;
  studentCount: number;
  feeRecordCount: number;
  fillBlanks: Patch[];
  conflicts: ConflictRow[];
  cleanup: Patch[];
  feeSync: Patch[];
  issues: Issue[];
}

// ─── 1. Fill blanks across years ─────────────────────────────────────────────

// Marks move as a block so a record never ends up with one year's max and another
// year's obtained.
const MARK_BLOCKS: (keyof Student)[][] = [
  ['sslcMaxTotal', 'sslcObtainedTotal'],
  ['scienceMax', 'scienceObtained', 'mathsMax', 'mathsObtained', 'mathsScienceMaxTotal', 'mathsScienceObtainedTotal'],
  ['pucMaxTotal', 'pucObtainedTotal', 'pucPercentage'],
  ['itiMaxTotal', 'itiObtainedTotal', 'itiPercentage'],
];
const BLOCK_FIELDS = new Set<string>(MARK_BLOCKS.flat());
const SINGLE_FILL_FIELDS = (CROSS_YEAR_PROPAGATABLE_FIELDS as (keyof Student)[]).filter((f) => !BLOCK_FIELDS.has(f));

function scanFillBlanks(groups: Student[][]): Patch[] {
  const patches: Patch[] = [];
  for (const group of groups) {
    if (group.length < 2) continue;
    // Latest academic year first, so its value wins as the source.
    const latestFirst = [...group].sort((a, b) => b.academicYear.localeCompare(a.academicYear));

    for (const r of group) {
      const fields: Record<string, unknown> = {};
      const before: Record<string, unknown> = {};

      for (const f of SINGLE_FILL_FIELDS) {
        if (!isEmptyVal(r[f])) continue;
        const src = latestFirst.find((o) => o.id !== r.id && !isEmptyVal(o[f]));
        if (!src) continue;
        const v = src[f];
        fields[f] = typeof v === 'string' ? v.trim() : v;
        before[f] = r[f] ?? '';
      }

      for (const block of MARK_BLOCKS) {
        if (!block.every((f) => isEmptyVal(r[f]))) continue;
        const src = latestFirst.find((o) => o.id !== r.id && block.some((f) => !isEmptyVal(o[f])));
        if (!src) continue;
        for (const f of block) {
          fields[f] = src[f] ?? 0;
          before[f] = r[f] ?? 0;
        }
      }

      if (Object.keys(fields).length > 0) {
        patches.push({ id: r.id, name: r.studentNameSSLC, regNo: regKey(r), academicYear: r.academicYear, fields, before });
      }
    }
  }
  return patches;
}

// ─── 2. Cross-year conflicts ─────────────────────────────────────────────────

const CONFLICT_FIELDS: { field: keyof Student; norm: (v: string) => string }[] = [
  { field: 'studentNameSSLC',   norm: normName },
  { field: 'studentNameAadhar', norm: normName },
  { field: 'fatherName',        norm: normName },
  { field: 'motherName',        norm: normName },
  { field: 'dateOfBirth',       norm: (v) => v.trim() },
  { field: 'gender',            norm: (v) => v.trim().toUpperCase() },
  { field: 'aadharNumber',      norm: (v) => v.replace(/\D/g, '') },
  { field: 'category',          norm: (v) => v.trim().toUpperCase() },
];

function scanConflicts(groups: Student[][]): ConflictRow[] {
  const rows: ConflictRow[] = [];
  for (const group of groups) {
    if (group.length < 2) continue;
    const latestFirst = [...group].sort((a, b) => b.academicYear.localeCompare(a.academicYear));
    for (const { field, norm } of CONFLICT_FIELDS) {
      // normalised value → { display value (from latest year), years }
      const byNorm = new Map<string, ConflictValue>();
      for (const r of latestFirst) {
        const raw = String(r[field] ?? '').trim();
        if (!raw) continue;
        const k = norm(raw);
        const entry = byNorm.get(k);
        if (entry) entry.years.push(r.academicYear);
        else byNorm.set(k, { value: raw, years: [r.academicYear] });
      }
      if (byNorm.size < 2) continue;
      const reg = regKey(group[0]);
      rows.push({
        key: `${reg}__${field}`,
        regNo: reg,
        name: latestFirst[0].studentNameSSLC,
        field,
        values: [...byNorm.values()].map((v) => ({ ...v, years: v.years.sort() })),
        ids: group.map((r) => r.id),
      });
    }
  }
  return rows;
}

// ─── 3a. Clean-up ────────────────────────────────────────────────────────────

const UPPER_TEXT: (keyof Student)[] = [
  'studentNameSSLC', 'studentNameAadhar', 'fatherName', 'motherName', 'caste', 'town', 'taluk', 'district',
];
const UPPER_ENUM: (keyof Student)[] = [
  'gender', 'religion', 'category', 'tenthBoard', 'priorQualification', 'course', 'year', 'admType', 'admCat',
];

const collapse = (v: string) => v.replace(/\s+/g, ' ').trim();

export function cleanMobile(v: string): string {
  let d = v.replace(/[\s\-().]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (/^91\d{10}$/.test(d)) d = d.slice(2);
  else if (/^0\d{10}$/.test(d)) d = d.slice(1);
  return d;
}

function cleanDob(v: string): string {
  const s = v.trim();
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${dmy[3]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

function cleanedFields(r: Student): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (f: keyof Student, next: string) => {
    const cur = r[f];
    if (typeof cur === 'string' && cur !== next) out[f] = next;
  };
  for (const f of UPPER_TEXT) { const v = r[f]; if (typeof v === 'string') set(f, collapse(v).toUpperCase()); }
  for (const f of UPPER_ENUM) { const v = r[f]; if (typeof v === 'string') set(f, v.trim().toUpperCase()); }
  if (typeof r.address === 'string') set('address', r.address.trim());
  if (typeof r.itiPucCombination === 'string') set('itiPucCombination', collapse(r.itiPucCombination));
  if (typeof r.apaarId === 'string') set('apaarId', r.apaarId.trim());
  if (typeof r.fatherMobile === 'string') set('fatherMobile', cleanMobile(r.fatherMobile));
  if (typeof r.studentMobile === 'string') set('studentMobile', cleanMobile(r.studentMobile));
  if (typeof r.aadharNumber === 'string') set('aadharNumber', r.aadharNumber.replace(/[\s-]/g, ''));
  if (typeof r.dateOfBirth === 'string') set('dateOfBirth', cleanDob(r.dateOfBirth));
  return out;
}

function scanCleanup(students: Student[]): Patch[] {
  const patches: Patch[] = [];
  for (const r of students) {
    const fields = cleanedFields(r);
    const keys = Object.keys(fields);
    if (keys.length === 0) continue;
    const before: Record<string, unknown> = {};
    for (const k of keys) before[k] = r[k as keyof Student];
    patches.push({ id: r.id, name: r.studentNameSSLC, regNo: regKey(r), academicYear: r.academicYear, fields, before });
  }
  return patches;
}

// ─── 3b / 4a. Invalid values, Reg No and duplicates (report only) ───────────

function scanStudentIssues(students: Student[], groups: Student[][]): Issue[] {
  const issues: Issue[] = [];
  const push = (r: Student, kind: IssueKind, detail: string) =>
    issues.push({ kind, regNo: regKey(r), name: r.studentNameSSLC, academicYear: r.academicYear, detail });

  const enumChecks: { field: keyof Student; allowed: readonly string[] }[] = [
    { field: 'gender', allowed: GENDERS }, { field: 'religion', allowed: RELIGIONS },
    { field: 'category', allowed: CATEGORIES }, { field: 'course', allowed: COURSES },
    { field: 'year', allowed: YEARS }, { field: 'admType', allowed: ADM_TYPES },
    { field: 'admCat', allowed: ADM_CATS },
  ];

  for (const r of students) {
    // Judge values as they will be after Clean-up, so a fixable "+91 98…" isn't double-reported.
    const fixed = { ...r, ...cleanedFields(r) } as Student;

    for (const f of ['fatherMobile', 'studentMobile'] as const) {
      const v = fixed[f];
      if (v && !MOBILE_RE.test(v)) push(r, 'invalid-mobile', `${fieldLabel(f)} "${r[f]}" is not a valid 10-digit mobile`);
    }
    if (fixed.aadharNumber && !/^\d{12}$/.test(fixed.aadharNumber)) {
      push(r, 'invalid-aadhar', `Aadhar "${r.aadharNumber}" is not 12 digits`);
    }
    if (fixed.dateOfBirth && !isValidDob(fixed.dateOfBirth)) {
      push(r, 'invalid-dob', `DOB "${r.dateOfBirth}" is not a valid DD/MM/YYYY date`);
    }
    for (const { field, allowed } of enumChecks) {
      const v = String(fixed[field] ?? '');
      if (!allowed.includes(v)) push(r, 'invalid-value', `${fieldLabel(field)} is ${v ? `"${v}"` : 'blank'}`);
    }
    if (!regKey(r) && r.year && r.year !== '1ST YEAR' && r.admissionStatus?.trim() !== 'CANCELLED') {
      push(r, 'missing-reg', `${r.year} record has no Reg No`);
    }
    if (r.regNumber && r.regNumber !== r.regNumber.trim()) {
      push(r, 'reg-format', `Reg No "${r.regNumber}" has leading/trailing spaces — student portal login may not match`);
    }
  }

  for (const group of groups) {
    // Same Reg No spelled differently (case) across years.
    const spellings = new Set(group.map((r) => (r.regNumber ?? '').trim()));
    if (spellings.size > 1) {
      push(group[0], 'reg-format', `Reg No written differently across years: ${[...spellings].join(' / ')}`);
    }
    // Same Reg No enrolled twice in one academic year.
    const byYear = new Map<string, Student[]>();
    for (const r of group) {
      const list = byYear.get(r.academicYear);
      if (list) list.push(r); else byYear.set(r.academicYear, [r]);
    }
    for (const [ay, list] of byYear) {
      if (list.length < 2) continue;
      const desc = list.map((r) => `${r.course} ${r.year} (${r.admissionStatus || 'PENDING'})`).join(', ');
      issues.push({ kind: 'duplicate-enrollment', regNo: regKey(list[0]), name: list[0].studentNameSSLC, academicYear: ay, detail: `${list.length} records in ${ay}: ${desc}` });
    }
  }

  // Same Aadhar under different Reg Nos (or different unregistered students).
  const byAadhar = new Map<string, Student[]>();
  for (const r of students) {
    const a = (r.aadharNumber ?? '').replace(/\D/g, '');
    if (a.length !== 12) continue;
    const list = byAadhar.get(a);
    if (list) list.push(r); else byAadhar.set(a, [r]);
  }
  for (const [a, list] of byAadhar) {
    const people = new Map<string, Student>();
    for (const r of list) people.set(regKey(r) || `id:${r.id}`, r);
    if (people.size < 2) continue;
    const desc = [...people.values()].map((r) => `${r.studentNameSSLC} (${regKey(r) || 'no Reg No'}, ${r.academicYear})`).join('; ');
    issues.push({ kind: 'duplicate-aadhar', regNo: '', name: list[0].studentNameSSLC, academicYear: '', detail: `Aadhar ${a} is on ${people.size} students: ${desc}` });
  }

  return issues;
}

// ─── 4b / 4c. Fee record links & stale snapshots ─────────────────────────────

function scanFees(fees: FeeRecord[], byId: Map<string, Student>): { patches: Patch[]; issues: Issue[] } {
  const patches: Patch[] = [];
  const issues: Issue[] = [];
  for (const f of fees) {
    const s = byId.get(f.studentId);
    if (!s) {
      issues.push({
        kind: 'orphan-fee', regNo: (f.regNumber ?? '').trim(), name: f.studentName ?? '', academicYear: f.academicYear ?? '',
        detail: `Fee record ${f.id} (Rpt ${f.receiptNumber || '—'}) points to a student that no longer exists`,
      });
      continue;
    }
    const fields: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const name = s.studentNameSSLC?.trim();
    if (name && (f.studentName ?? '') !== name) { fields.studentName = name; before.studentName = f.studentName ?? ''; }
    const father = s.fatherName?.trim();
    if (father && (f.fatherName ?? '') !== father) { fields.fatherName = father; before.fatherName = f.fatherName ?? ''; }

    const sReg = (s.regNumber ?? '').trim();
    const fReg = f.regNumber ?? '';
    if (sReg && fReg !== sReg) {
      // Only safe cases: blank, or the same Reg No differing by case/whitespace.
      if (!fReg.trim() || fReg.trim().toUpperCase() === sReg.toUpperCase()) {
        fields.regNumber = sReg; before.regNumber = fReg;
      } else {
        issues.push({
          kind: 'fee-reg-mismatch', regNo: sReg, name: s.studentNameSSLC, academicYear: f.academicYear,
          detail: `Fee record Rpt ${f.receiptNumber || '—'} has Reg No "${fReg}" but the student's is "${sReg}"`,
        });
      }
    }
    if (Object.keys(fields).length > 0) {
      patches.push({ id: f.id, name: s.studentNameSSLC, regNo: sReg.toUpperCase(), academicYear: f.academicYear, fields, before });
    }
  }
  return { patches, issues };
}

// ─── Scan ────────────────────────────────────────────────────────────────────

export type ScanStage = 'students' | 'fees' | 'analysing';

export async function scanDataHealth(onStage?: (stage: ScanStage) => void): Promise<DataHealthReport> {
  onStage?.('students');
  const students = await getAllStudents();
  onStage?.('fees');
  const feeSnap = await getDocs(collection(db, FEE_RECORDS));
  const fees = feeSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeRecord));
  onStage?.('analysing');

  const byReg = new Map<string, Student[]>();
  for (const s of students) {
    const k = regKey(s);
    if (!k) continue;
    const list = byReg.get(k);
    if (list) list.push(s); else byReg.set(k, [s]);
  }
  const groups = [...byReg.values()];
  const byId = new Map(students.map((s) => [s.id, s]));
  const fee = scanFees(fees, byId);

  return {
    scannedAt: new Date().toISOString(),
    studentCount: students.length,
    feeRecordCount: fees.length,
    fillBlanks: scanFillBlanks(groups),
    conflicts: scanConflicts(groups),
    cleanup: scanCleanup(students),
    feeSync: fee.patches,
    issues: [...scanStudentIssues(students, groups), ...fee.issues],
  };
}

// ─── Apply ───────────────────────────────────────────────────────────────────

async function commitPatches(
  col: string,
  patches: { id: string; fields: Record<string, unknown> }[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const CHUNK = 400;
  const now = new Date().toISOString();
  for (let i = 0; i < patches.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const { id, fields } of patches.slice(i, i + CHUNK)) {
      batch.update(doc(db, col, id), { ...fields, updatedAt: now });
    }
    await batch.commit();
    onProgress?.(Math.min(i + CHUNK, patches.length), patches.length);
  }
  return patches.length;
}

export function applyStudentPatches(patches: Patch[], onProgress?: (done: number, total: number) => void) {
  return commitPatches(STUDENTS, patches, onProgress);
}

export function applyFeePatches(patches: Patch[], onProgress?: (done: number, total: number) => void) {
  return commitPatches(FEE_RECORDS, patches, onProgress);
}

/** Writes the chosen value of a conflicting field to every year record of the student. */
export function resolveConflict(row: ConflictRow, value: string) {
  return commitPatches(STUDENTS, row.ids.map((id) => ({ id, fields: { [row.field]: value } })));
}
