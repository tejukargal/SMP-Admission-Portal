import { collection, query, where, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';

const STUDENTS_COLLECTION = 'students';

export interface AddressRow {
  name: string;
  regNumber: string;
  address: string;
  motherName: string;
  dateOfBirth: string;
  academicYear: string;
}

export interface AddressImportResult {
  updated: number;
  notFound: number;
  skipped: number;
  errors: { row: number; regNumber: string; message: string }[];
}

export async function importAddresses(
  rows: AddressRow[],
  onProgress: (current: number, total: number) => void
): Promise<AddressImportResult> {
  const result: AddressImportResult = { updated: 0, notFound: 0, skipped: 0, errors: [] };
  if (rows.length === 0) return result;

  // Collect unique academic years from the data
  const uniqueYears = [...new Set(rows.map((r) => r.academicYear.trim()).filter(Boolean))];

  // Fetch students per academic year, build lookup: "academicYear__REGNO" → docId
  const regMap = new Map<string, string>();
  for (const ay of uniqueYears) {
    const q = query(collection(db, STUDENTS_COLLECTION), where('academicYear', '==', ay));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data() as { regNumber?: string };
      const reg = (data.regNumber ?? '').toUpperCase().trim();
      if (reg) {
        regMap.set(`${ay}__${reg}`, d.id);
      }
    }
  }

  // Match each row against the lookup map
  const updates: { docId: string; address: string; motherName: string; dateOfBirth: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const reg = row.regNumber.trim().toUpperCase();
    const address = row.address.trim();
    const motherName = row.motherName.trim();
    const dateOfBirth = row.dateOfBirth.trim();
    const ay = row.academicYear.trim();

    if (!reg || !ay) {
      result.skipped++;
      continue;
    }

    // Skip only if all updatable fields are blank
    if (!address && !motherName && !dateOfBirth) {
      result.skipped++;
      continue;
    }

    const docId = regMap.get(`${ay}__${reg}`);
    if (!docId) {
      result.notFound++;
      result.errors.push({
        row: i + 2,
        regNumber: reg,
        message: `No student found with Reg No "${reg}" in ${ay}`,
      });
      continue;
    }

    updates.push({ docId, address, motherName, dateOfBirth });
  }

  // Batch-write updates in chunks of 200
  const CHUNK_SIZE = 200;
  const total = updates.length;

  for (let chunkStart = 0; chunkStart < total; chunkStart += CHUNK_SIZE) {
    const chunk = updates.slice(chunkStart, chunkStart + CHUNK_SIZE);
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    for (const { docId, address, motherName, dateOfBirth } of chunk) {
      const fields: Record<string, string> = { updatedAt: now };
      if (address) fields.address = address;
      if (motherName) fields.motherName = motherName;
      if (dateOfBirth) fields.dateOfBirth = dateOfBirth;
      batch.update(doc(db, STUDENTS_COLLECTION, docId), fields);
    }

    await batch.commit();
    result.updated += chunk.length;
    onProgress(Math.min(chunkStart + chunk.length, total), total);
  }

  return result;
}
