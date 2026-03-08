import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  StudentFormData,
  AcademicYear,
  Course,
  Year,
  Gender,
  Religion,
  Category,
  AdmType,
  AdmCat,
} from '../types';

const STUDENTS_COLLECTION = 'students';

// Raw row shape coming from the Excel sheet
export interface ImportRow {
  name: string;
  fatherName: string;
  academicYear: string;
  year: string;
  course: string;
  regNumber: string;
  category: string;
  gender: string;
  phone: string;
  admType: string;
  caste: string;
  admCat: string;
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: { row: number; message: string }[];
}

function mapYear(raw: string): Year {
  const map: Record<string, Year> = {
    '1st yr': '1ST YEAR',
    '2nd yr': '2ND YEAR',
    '3rd yr': '3RD YEAR',
    '1st year': '1ST YEAR',
    '2nd year': '2ND YEAR',
    '3rd year': '3RD YEAR',
    '1st': '1ST YEAR',
    '2nd': '2ND YEAR',
    '3rd': '3RD YEAR',
  };
  return map[raw.toLowerCase().trim()] ?? (raw.toUpperCase() as Year);
}

function mapGender(raw: string): Gender {
  const v = raw.trim().toUpperCase();
  if (v === 'B' || v === 'BOY' || v === 'MALE') return 'BOY';
  if (v === 'G' || v === 'GIRL' || v === 'FEMALE') return 'GIRL';
  return 'BOY';
}

function mapAdmType(raw: string): AdmType {
  const v = raw.trim().toUpperCase() as AdmType;
  const valid: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL', 'SNQ'];
  return valid.includes(v) ? v : 'REGULAR';
}

function mapAdmCat(raw: string): AdmCat {
  const v = raw.trim().toUpperCase() as AdmCat;
  const valid: AdmCat[] = ['GM', 'SNQ', 'OTHERS'];
  return valid.includes(v) ? v : 'GM';
}

function mapCategory(raw: string): Category {
  const v = raw.trim().toUpperCase() as Category;
  const valid: Category[] = ['SC', 'ST', 'C1', '2A', '2B', '3A', '3B', 'GM'];
  return valid.includes(v) ? v : 'GM';
}

function buildMeritSuffix(academicYear: AcademicYear): string {
  const [startYear, endYear] = academicYear.split('-');
  return startYear.slice(-2) + endYear;
}

// Get the current max merit serial per academic year from Firestore
async function fetchMaxSerials(
  academicYears: AcademicYear[]
): Promise<Map<AcademicYear, number>> {
  const serialMap = new Map<AcademicYear, number>();
  await Promise.all(
    academicYears.map(async (ay) => {
      const q = query(
        collection(db, STUDENTS_COLLECTION),
        where('academicYear', '==', ay)
      );
      const snap = await getDocs(q);
      let maxSerial = 0;
      for (const d of snap.docs) {
        const merit = (d.data() as Record<string, unknown>).meritNumber;
        if (typeof merit === 'string' && merit.length >= 3) {
          const serial = parseInt(merit.slice(0, 3), 10);
          if (!isNaN(serial) && serial > maxSerial) maxSerial = serial;
        }
      }
      serialMap.set(ay, maxSerial);
    })
  );
  return serialMap;
}

function rowToFormData(row: ImportRow): StudentFormData {
  const phone = String(row.phone ?? '').trim();
  // Excel may store phone as a number — ensure string and strip .0 suffix
  const phoneStr = phone.replace(/\.0+$/, '').replace(/\D/g, '').slice(-10);

  return {
    studentNameSSLC: row.name.trim().toUpperCase(),
    studentNameAadhar: row.name.trim().toUpperCase(),
    fatherName: row.fatherName.trim().toUpperCase(),
    motherName: '',
    dateOfBirth: '',
    gender: mapGender(row.gender),
    religion: '' as Religion,
    caste: row.caste.trim().toUpperCase(),
    category: mapCategory(row.category),
    tenthBoard: 'SSLC',
    priorQualification: 'NONE',
    sslcMaxTotal: 625,
    sslcObtainedTotal: 0,
    scienceMax: 100,
    scienceObtained: 0,
    mathsMax: 100,
    mathsObtained: 0,
    mathsScienceMaxTotal: 200,
    mathsScienceObtainedTotal: 0,
    annualIncome: 0,
    address: '',
    fatherMobile: phoneStr,
    studentMobile: '',
    course: row.course.trim().toUpperCase() as Course,
    year: mapYear(row.year),
    admType: mapAdmType(row.admType),
    admCat: mapAdmCat(row.admCat),
    academicYear: row.academicYear.trim() as AcademicYear,
    admissionStatus: 'CONFIRMED',
    meritNumber: '',
    regNumber: row.regNumber.trim().toUpperCase(),
  };
}

export async function importStudents(
  rows: ImportRow[],
  onProgress: (current: number, total: number) => void
): Promise<ImportResult> {
  const result: ImportResult = { success: 0, failed: 0, errors: [] };
  if (rows.length === 0) return result;

  // Collect unique academic years
  const uniqueYears = [...new Set(rows.map((r) => r.academicYear.trim() as AcademicYear))];

  // Fetch existing max serials from Firestore (one query per year)
  const serialMap = await fetchMaxSerials(uniqueYears);

  // In-memory counters for this import batch, per academic year
  const counters = new Map<AcademicYear, number>();
  for (const [ay, max] of serialMap) {
    counters.set(ay, max);
  }

  const total = rows.length;
  // Firestore WriteBatch supports up to 500 ops — chunk if needed
    const CHUNK_SIZE = 200;

  for (let chunkStart = 0; chunkStart < total; chunkStart += CHUNK_SIZE) {
    const chunk = rows.slice(chunkStart, chunkStart + CHUNK_SIZE);
    const batch = writeBatch(db);
    let chunkSuccess = 0;

    for (let i = 0; i < chunk.length; i++) {
      const row = chunk[i];
      const rowIndex = chunkStart + i + 2; // 1-indexed, +1 for header row

      try {
        const formData = rowToFormData(row);
        const ay = formData.academicYear;
        const currentSerial = (counters.get(ay) ?? 0) + 1;
        counters.set(ay, currentSerial);

        const meritNumber =
          String(currentSerial).padStart(3, '0') + buildMeritSuffix(ay);

        const now = new Date().toISOString();
        const docRef = doc(collection(db, STUDENTS_COLLECTION));
        batch.set(docRef, {
          ...formData,
          meritNumber,
          createdAt: now,
          updatedAt: now,
        });

        chunkSuccess++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          row: rowIndex,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    await batch.commit();
    result.success += chunkSuccess;
    onProgress(Math.min(chunkStart + chunk.length, total), total);
  }

  return result;
}
