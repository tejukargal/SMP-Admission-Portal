import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  writeBatch,
  documentId,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AcademicYear } from '../types';

export const BACKUP_VERSION = '1' as const;

export type BackupDoc = { id: string } & Record<string, unknown>;

export interface BackupCounts {
  students: number;
  feeRecords: number;
  feeOverrides: number;
  examFeeRecords: number;
  inquiries: number;
  studentDocuments: number;
  feeStructures: number;
}

export interface BackupData {
  version: typeof BACKUP_VERSION;
  academicYear: AcademicYear;
  exportedAt: string;
  counts: BackupCounts;
  data: {
    students: BackupDoc[];
    feeRecords: BackupDoc[];
    feeOverrides: BackupDoc[];
    examFeeRecords: BackupDoc[];
    inquiries: BackupDoc[];
    studentDocuments: BackupDoc[];
    feeStructures: BackupDoc[];
    fineSchedule: BackupDoc | null;
    counters: {
      merit: BackupDoc | null;
      tc: BackupDoc | null;
      regSeq: BackupDoc[];
      receipts: BackupDoc | null;
    };
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchByYear(coll: string, year: AcademicYear): Promise<BackupDoc[]> {
  const snap = await getDocs(
    query(collection(db, coll), where('academicYear', '==', year))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BackupDoc);
}

async function fetchDocIfExists(coll: string, docId: string): Promise<BackupDoc | null> {
  const snap = await getDoc(doc(db, coll, docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as BackupDoc;
}

async function batchSetDocs(collName: string, docs: BackupDoc[]): Promise<void> {
  if (docs.length === 0) return;
  const CHUNK = 400;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const item of docs.slice(i, i + CHUNK)) {
      const { id, ...data } = item;
      batch.set(doc(db, collName, id as string), data);
    }
    await batch.commit();
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportBackup(academicYear: AcademicYear): Promise<BackupData> {
  // Fetch students first — we need their IDs to pull studentDocuments
  const students = await fetchByYear('students', academicYear);
  const studentIds = students.map((s) => s.id);

  const [feeRecords, feeOverrides, examFeeRecords, inquiries, feeStructures] = await Promise.all([
    fetchByYear('feeRecords', academicYear),
    fetchByYear('feeOverrides', academicYear),
    fetchByYear('examFeeRecords', academicYear),
    fetchByYear('inquiries', academicYear),
    fetchByYear('feeStructure', academicYear),
  ]);

  // studentDocuments are keyed by studentId with no academicYear field
  const studentDocuments: BackupDoc[] = [];
  if (studentIds.length > 0) {
    const CHUNK = 30; // Firestore 'in' limit
    for (let i = 0; i < studentIds.length; i += CHUNK) {
      const chunk = studentIds.slice(i, i + CHUNK);
      const snap = await getDocs(
        query(collection(db, 'studentDocuments'), where(documentId(), 'in', chunk))
      );
      studentDocuments.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BackupDoc));
    }
  }

  const fineSchedule = await fetchDocIfExists('fineSchedules', academicYear);

  // Counter docs
  const regPrefix = `${academicYear}__regseq__`;
  const regPrefixEnd = regPrefix + String.fromCodePoint(0xf8ff);
  const [regSnap, merit, tc, receipts] = await Promise.all([
    getDocs(
      query(
        collection(db, 'counters'),
        where(documentId(), '>=', regPrefix),
        where(documentId(), '<=', regPrefixEnd),
      )
    ),
    fetchDocIfExists('counters', academicYear),
    fetchDocIfExists('counters', `${academicYear}__tc`),
    fetchDocIfExists('receiptCounters', academicYear),
  ]);

  return {
    version: BACKUP_VERSION,
    academicYear,
    exportedAt: new Date().toISOString(),
    counts: {
      students: students.length,
      feeRecords: feeRecords.length,
      feeOverrides: feeOverrides.length,
      examFeeRecords: examFeeRecords.length,
      inquiries: inquiries.length,
      studentDocuments: studentDocuments.length,
      feeStructures: feeStructures.length,
    },
    data: {
      students,
      feeRecords,
      feeOverrides,
      examFeeRecords,
      inquiries,
      studentDocuments,
      feeStructures,
      fineSchedule,
      counters: {
        merit,
        tc,
        regSeq: regSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as BackupDoc),
        receipts,
      },
    },
  };
}

// ── Restore ───────────────────────────────────────────────────────────────────

export async function restoreBackup(backup: BackupData): Promise<void> {
  const { data } = backup;

  await Promise.all([
    batchSetDocs('students',        data.students),
    batchSetDocs('feeRecords',      data.feeRecords),
    batchSetDocs('feeOverrides',    data.feeOverrides),
    batchSetDocs('examFeeRecords',  data.examFeeRecords),
    batchSetDocs('inquiries',       data.inquiries),
    batchSetDocs('studentDocuments', data.studentDocuments),
    batchSetDocs('feeStructure',    data.feeStructures ?? []),
  ]);

  if (data.fineSchedule) {
    const { id, ...fsData } = data.fineSchedule;
    await setDoc(doc(db, 'fineSchedules', id as string), fsData);
  }

  const { counters } = data;
  const counterWrites: Promise<void>[] = [];

  if (counters.merit) {
    const { id, ...d } = counters.merit;
    counterWrites.push(setDoc(doc(db, 'counters', id as string), d));
  }
  if (counters.tc) {
    const { id, ...d } = counters.tc;
    counterWrites.push(setDoc(doc(db, 'counters', id as string), d));
  }
  if (counters.receipts) {
    const { id, ...d } = counters.receipts;
    counterWrites.push(setDoc(doc(db, 'receiptCounters', id as string), d));
  }
  if (counters.regSeq?.length) {
    counterWrites.push(batchSetDocs('counters', counters.regSeq));
  }

  await Promise.all(counterWrites);
}

// ── File helpers ──────────────────────────────────────────────────────────────

export function downloadBackupFile(backup: BackupData): void {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `smp-backup-${backup.academicYear}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseBackupFile(file: File): Promise<BackupData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as BackupData;
        if (parsed.version !== BACKUP_VERSION) {
          reject(new Error(`Unsupported backup version "${parsed.version}". Expected "${BACKUP_VERSION}".`));
          return;
        }
        if (!parsed.academicYear || !parsed.exportedAt || !parsed.data || !parsed.counts) {
          reject(new Error('Invalid backup file — missing required fields.'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error('Could not parse file. Make sure it is a valid SMP backup (.json).'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the file.'));
    reader.readAsText(file);
  });
}
