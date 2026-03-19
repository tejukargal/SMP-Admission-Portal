import { writeBatch, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AcademicYear, Course, Year, AdmType, AdmCat, FeeRecordFormData } from '../types';
import { ACADEMIC_YEARS } from '../types';

const COL_STUDENTS = 'students';
const COL_FEE_RECORDS = 'feeRecords';
const CHUNK_SIZE = 400;

/** Raw row shape parsed from the Excel fee register sheet. */
export interface FeeImportRow {
  rowIndex: number;     // 1-based Excel row number (for error reporting)
  studentName: string;
  year: string;
  course: string;
  regNumber: string;
  admType: string;
  admCat: string;
  date: string;         // ISO "YYYY-MM-DD" or empty
  receiptNumber: string;
  adm: number;
  tuition: number;
  lib: number;
  rr: number;
  sports: number;
  lab: number;
  dvp: number;
  mag: number;
  idCard: number;
  ass: number;
  swf: number;
  twf: number;
  nss: number;
  fine: number;
  svk: number;
  academicYear: string;
}

export interface FeeImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

const VALID_COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const VALID_ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL', 'SNQ'];
const VALID_ADM_CATS: AdmCat[] = ['GM', 'SNQ', 'OTHERS'];

function mapYear(raw: string): Year | null {
  const map: Record<string, Year> = {
    '1': '1ST YEAR', '1st': '1ST YEAR', '1st yr': '1ST YEAR', '1st year': '1ST YEAR', 'i': '1ST YEAR',
    '2': '2ND YEAR', '2nd': '2ND YEAR', '2nd yr': '2ND YEAR', '2nd year': '2ND YEAR', 'ii': '2ND YEAR',
    '3': '3RD YEAR', '3rd': '3RD YEAR', '3rd yr': '3RD YEAR', '3rd year': '3RD YEAR', 'iii': '3RD YEAR',
  };
  const normalized = raw.trim().toLowerCase();
  return map[normalized] ?? (VALID_COURSES.includes(raw.trim().toUpperCase() as Course) ? null : null);
}

function resolveYear(raw: string): Year | null {
  const mapped = mapYear(raw);
  if (mapped) return mapped;
  const upper = raw.trim().toUpperCase() as Year;
  const validYears: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
  return validYears.includes(upper) ? upper : null;
}

function resolveAdmType(raw: string): AdmType | null {
  const v = raw.trim().toUpperCase() as AdmType;
  return VALID_ADM_TYPES.includes(v) ? v : null;
}

function resolveAdmCat(raw: string): AdmCat | null {
  const v = raw.trim().toUpperCase();
  if (VALID_ADM_CATS.includes(v as AdmCat)) return v as AdmCat;
  if (v === 'OTHER') return 'OTHERS';
  return null;
}

/**
 * Import fee register rows from parsed Excel data.
 * Looks up each student by regNumber + academicYear in Firestore,
 * then batch-writes FeeRecord documents.
 */
export async function importFeeRegister(
  rows: FeeImportRow[],
  onProgress?: (current: number, total: number) => void
): Promise<FeeImportResult> {
  // Collect unique valid academic years across all rows
  const academicYears = [
    ...new Set(
      rows
        .map((r) => r.academicYear.trim())
        .filter((ay) => ACADEMIC_YEARS.includes(ay as AcademicYear))
    ),
  ];

  // Fetch students for those academic years and build regNumber → student lookup
  type StudentEntry = { id: string; studentName: string; fatherName: string };
  const studentMap = new Map<string, StudentEntry>(); // key: `${regNumber}__${academicYear}`

  for (const ay of academicYears) {
    const q = query(collection(db, COL_STUDENTS), where('academicYear', '==', ay));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      const reg = String(data.regNumber ?? '').trim().toUpperCase();
      if (reg) {
        studentMap.set(`${reg}__${ay}`, {
          id: d.id,
          studentName: String(data.studentNameSSLC ?? ''),
          fatherName: String(data.fatherName ?? ''),
        });
      }
    }
  }

  const errors: Array<{ row: number; message: string }> = [];
  const validRecords: Array<{ id: string; data: object }> = [];
  let autoRptCounter = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = row.rowIndex;

    // Validate academic year
    const academicYear = row.academicYear.trim();
    if (!ACADEMIC_YEARS.includes(academicYear as AcademicYear)) {
      errors.push({ row: rowNum, message: `Invalid academic year "${academicYear}"` });
      continue;
    }

    // Validate course
    const course = row.course.trim().toUpperCase() as Course;
    if (!VALID_COURSES.includes(course)) {
      errors.push({ row: rowNum, message: `Invalid course "${row.course}"` });
      continue;
    }

    // Validate year
    const year = resolveYear(row.year);
    if (!year) {
      errors.push({ row: rowNum, message: `Invalid year "${row.year}"` });
      continue;
    }

    // Validate adm type
    const admType = resolveAdmType(row.admType);
    if (!admType) {
      errors.push({ row: rowNum, message: `Invalid adm type "${row.admType}"` });
      continue;
    }

    // Validate adm cat
    const admCat = resolveAdmCat(row.admCat);
    if (!admCat) {
      errors.push({ row: rowNum, message: `Invalid adm cat "${row.admCat}"` });
      continue;
    }

    // Require reg number
    const regNumber = row.regNumber.trim().toUpperCase();
    if (!regNumber) {
      errors.push({ row: rowNum, message: 'Missing registration number' });
      continue;
    }

    // Look up matching student
    const student = studentMap.get(`${regNumber}__${academicYear}`);
    if (!student) {
      errors.push({
        row: rowNum,
        message: `Student with reg no "${regNumber}" not found in ${academicYear}`,
      });
      continue;
    }

    // Receipt number — use from Excel or auto-generate
    let receiptNumber = row.receiptNumber.trim();
    if (!receiptNumber) {
      autoRptCounter++;
      receiptNumber = `IMP-${String(autoRptCounter).padStart(4, '0')}`;
    }

    // Date — use from Excel or today
    const date = row.date || new Date().toISOString().split('T')[0];

    const id = `${student.id}__${academicYear}__${receiptNumber}`;
    const now = new Date().toISOString();

    const record: FeeRecordFormData = {
      studentId: student.id,
      studentName: student.studentName,
      fatherName: student.fatherName,
      regNumber,
      course,
      year,
      admCat,
      admType,
      academicYear: academicYear as AcademicYear,
      date,
      receiptNumber,
      svkReceiptNumber: '',
      additionalReceiptNumber: '',
      paymentMode: 'CASH',
      remarks: '',
      smp: {
        adm:     row.adm,
        tuition: row.tuition,
        lib:     row.lib,
        rr:      row.rr,
        sports:  row.sports,
        lab:     row.lab,
        dvp:     row.dvp,
        mag:     row.mag,
        idCard:  row.idCard,
        ass:     row.ass,
        swf:     row.swf,
        twf:     row.twf,
        nss:     row.nss,
        fine:    row.fine,
      },
      svk: row.svk,
      additionalPaid: [],
    };

    validRecords.push({ id, data: { ...record, createdAt: now, updatedAt: now } });
    onProgress?.(i + 1, rows.length);
  }

  // Batch write valid records in chunks
  let success = 0;
  for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const chunk = validRecords.slice(i, i + CHUNK_SIZE);
    for (const { id, data } of chunk) {
      batch.set(doc(db, COL_FEE_RECORDS, id), data);
    }
    await batch.commit();
    success += chunk.length;
  }

  return { success, failed: errors.length, errors };
}
