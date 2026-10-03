import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getAllStudents } from './studentService';
import type { Student, Religion, Category } from '../types';

const STUDENTS_COLLECTION = 'students';

// Every update field is optional — an empty string means "leave as is".
export interface AddressRow {
  name: string;
  regNumber: string;
  address: string;
  motherName: string;
  dateOfBirth: string;
  fatherName: string;
  fatherMobile: string;
  studentMobile: string;
  aadharNumber: string;
  gender: string;
  religion: string;
  caste: string;
  category: string;
}

export type AddressUpdateField = Exclude<keyof AddressRow, 'name' | 'regNumber'>;

export const ADDRESS_UPDATE_FIELDS: { key: AddressUpdateField; label: string }[] = [
  { key: 'address',       label: 'Address' },
  { key: 'motherName',    label: 'Mother Name' },
  { key: 'dateOfBirth',   label: 'DOB' },
  { key: 'fatherName',    label: 'Father Name' },
  { key: 'fatherMobile',  label: 'Father Mobile' },
  { key: 'studentMobile', label: 'Student Mobile' },
  { key: 'aadharNumber',  label: 'Aadhar' },
  { key: 'gender',        label: 'Gender' },
  { key: 'religion',      label: 'Religion' },
  { key: 'caste',         label: 'Caste' },
  { key: 'category',      label: 'Category' },
];

export function hasUpdateFields(row: AddressRow): boolean {
  return ADDRESS_UPDATE_FIELDS.some(({ key }) => row[key].trim() !== '');
}

interface RowIssue { row: number; regNumber: string; message: string }

export interface AddressImportResult {
  /** Students (sheet rows) that received at least one field update. */
  updated: number;
  /** Student documents written — one per academic year, so ≥ updated. */
  recordsUpdated: number;
  notFound: number;
  nameMismatch: number;
  skipped: number;
  errors: RowIssue[];
  /** Individual cells that were invalid and skipped; the row's other fields still updated. */
  warnings: RowIssue[];
}

const RELIGIONS: readonly Religion[] = ['HINDU', 'MUSLIM', 'CHRISTIAN', 'JAIN', 'BUDDHIST', 'SIKH'];
const CATEGORIES: readonly Category[] = ['SC', 'ST', 'C1', '2A', '2B', '3A', '3B', 'GM'];
const MOBILE_RE = /^[6-9]\d{9}$/;

/** Uppercase, drop dots, collapse whitespace — "Ravi K. M" ≡ "RAVI K M". */
function normName(s: string | undefined): string {
  return (s ?? '').toUpperCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

function normGender(v: string): string | null {
  const g = v.toUpperCase();
  if (['BOY', 'MALE', 'M'].includes(g)) return 'BOY';
  if (['GIRL', 'FEMALE', 'F'].includes(g)) return 'GIRL';
  return null;
}

/** "CAT-1" / "CAT1" / "C-1" / "Cat 1" → "C1"; "2-A" / "2 a" → "2A". */
function normCategory(v: string): Category | null {
  let c = v.toUpperCase().replace(/[\s\-_.]/g, '');
  if (/^(CAT|CATEGORY|C)(1|I)$/.test(c)) c = 'C1';
  return (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : null;
}

export async function importAddresses(
  rows: AddressRow[],
  onProgress: (current: number, total: number) => void
): Promise<AddressImportResult> {
  const result: AddressImportResult = {
    updated: 0, recordsUpdated: 0, notFound: 0, nameMismatch: 0, skipped: 0, errors: [], warnings: [],
  };
  if (rows.length === 0) return result;

  // Every enrollment (one doc per academic year) grouped by Reg No, so an update
  // reaches all of a student's years regardless of the year on the sheet.
  const byReg = new Map<string, Student[]>();
  for (const s of await getAllStudents()) {
    const reg = (s.regNumber ?? '').toUpperCase().trim();
    if (!reg) continue;
    const list = byReg.get(reg);
    if (list) list.push(s); else byReg.set(reg, [s]);
  }

  const updates: { docId: string; fields: Record<string, string> }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2; // +1 header, +1 one-based
    const reg = row.regNumber.trim().toUpperCase();
    const name = row.name.trim();

    if (!reg || !name || !hasUpdateFields(row)) {
      result.skipped++;
      continue;
    }

    const records = byReg.get(reg);
    if (!records) {
      result.notFound++;
      result.errors.push({ row: rowNo, regNumber: reg, message: `No student found with Reg No "${reg}"` });
      continue;
    }

    const wanted = normName(name);
    const nameOk = records.some((r) => normName(r.studentNameSSLC) === wanted || normName(r.studentNameAadhar) === wanted);
    if (!nameOk) {
      result.nameMismatch++;
      result.errors.push({
        row: rowNo,
        regNumber: reg,
        message: `Name "${name}" doesn't match Reg No "${reg}" (on record: ${records[0].studentNameSSLC})`,
      });
      continue;
    }

    const fields: Record<string, string> = {};
    const warn = (message: string) => result.warnings.push({ row: rowNo, regNumber: reg, message });

    const address = row.address.trim();
    if (address) fields.address = address;
    const motherName = row.motherName.trim();
    if (motherName) fields.motherName = motherName;
    const dateOfBirth = row.dateOfBirth.trim();
    if (dateOfBirth) {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateOfBirth)) fields.dateOfBirth = dateOfBirth;
      else warn(`DOB "${dateOfBirth}" is not DD/MM/YYYY — skipped`);
    }
    const fatherName = row.fatherName.trim();
    if (fatherName) fields.fatherName = fatherName;

    for (const key of ['fatherMobile', 'studentMobile'] as const) {
      const v = row[key].trim();
      if (!v) continue;
      if (MOBILE_RE.test(v)) fields[key] = v;
      else warn(`${key === 'fatherMobile' ? 'Father' : 'Student'} Mobile "${v}" is not a valid 10-digit number — skipped`);
    }

    const aadhar = row.aadharNumber.replace(/\s+/g, '');
    if (aadhar) {
      if (/^\d{12}$/.test(aadhar)) fields.aadharNumber = aadhar;
      else warn(`Aadhar "${row.aadharNumber.trim()}" is not 12 digits — skipped`);
    }

    const genderRaw = row.gender.trim();
    if (genderRaw) {
      const g = normGender(genderRaw);
      if (g) fields.gender = g;
      else warn(`Gender "${genderRaw}" not recognised (use BOY/GIRL) — skipped`);
    }

    const religion = row.religion.trim().toUpperCase();
    if (religion) {
      if ((RELIGIONS as readonly string[]).includes(religion)) fields.religion = religion;
      else warn(`Religion "${religion}" not recognised — skipped`);
    }

    const caste = row.caste.trim().toUpperCase();
    if (caste) fields.caste = caste;

    const categoryRaw = row.category.trim();
    if (categoryRaw) {
      const c = normCategory(categoryRaw);
      if (c) fields.category = c;
      else warn(`Category "${categoryRaw}" not recognised (${CATEGORIES.join('/')}) — skipped`);
    }

    if (Object.keys(fields).length === 0) {
      result.skipped++;
      continue;
    }

    result.updated++;
    for (const r of records) updates.push({ docId: r.id, fields });
  }

  // Batch-write updates in chunks of 200
  const CHUNK_SIZE = 200;
  const total = updates.length;

  for (let chunkStart = 0; chunkStart < total; chunkStart += CHUNK_SIZE) {
    const chunk = updates.slice(chunkStart, chunkStart + CHUNK_SIZE);
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    for (const { docId, fields } of chunk) {
      batch.update(doc(db, STUDENTS_COLLECTION, docId), { ...fields, updatedAt: now });
    }

    await batch.commit();
    result.recordsUpdated += chunk.length;
    onProgress(Math.min(chunkStart + chunk.length, total), total);
  }

  return result;
}
