import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { AcademicYear } from '../../types';
import { loadZip } from '../../utils/lazyLibs';
import { decodeValue, sha256Hex } from './codec';
import {
  BACKUP_FORMAT, BACKUP_META_DOC, BACKUP_VERSION_V2,
  type BackupDoc, type BackupFileV2, type ProgressFn,
} from './exportBackup';

export type ChecksumStatus = 'ok' | 'mismatch' | 'none';

export interface ParsedBackup {
  backup: BackupFileV2;
  checksum: ChecksumStatus;
  /** 'v1' for backups made before the full-backup upgrade. */
  sourceVersion: '1' | '2';
  fileName: string;
}

// ── v1 (single-year, pre-upgrade) → v2 ───────────────────────────────────────

interface BackupV1 {
  version: '1';
  academicYear: AcademicYear;
  exportedAt: string;
  data: {
    students: BackupDoc[];
    feeRecords: BackupDoc[];
    feeOverrides: BackupDoc[];
    examFeeRecords: BackupDoc[];
    inquiries: BackupDoc[];
    studentDocuments: BackupDoc[];
    feeStructures?: BackupDoc[];
    fineSchedule?: BackupDoc | null;
    counters?: {
      merit?: BackupDoc | null;
      tc?: BackupDoc | null;
      regSeq?: BackupDoc[];
      receipts?: BackupDoc | null;
      examCerts?: BackupDoc[];
    };
    examDutyCertificates?: BackupDoc[];
    examDutyStaff?: BackupDoc[];
    examSettingCertificates?: BackupDoc[];
    examSubjects?: BackupDoc[];
  };
}

function convertV1(v1: BackupV1): BackupFileV2 {
  const d = v1.data;
  const c = d.counters ?? {};
  const nonNull = (x: BackupDoc | null | undefined): BackupDoc[] => (x ? [x] : []);
  const collections: Record<string, BackupDoc[]> = {
    students: d.students ?? [],
    feeRecords: d.feeRecords ?? [],
    feeOverrides: d.feeOverrides ?? [],
    examFeeRecords: d.examFeeRecords ?? [],
    inquiries: d.inquiries ?? [],
    studentDocuments: d.studentDocuments ?? [],
    feeStructure: d.feeStructures ?? [],
    fineSchedules: nonNull(d.fineSchedule),
    counters: [...nonNull(c.merit), ...nonNull(c.tc), ...(c.regSeq ?? []), ...(c.examCerts ?? [])],
    receiptCounters: nonNull(c.receipts),
    examDutyCertificates: d.examDutyCertificates ?? [],
    examDutyStaff: d.examDutyStaff ?? [],
    examSettingCertificates: d.examSettingCertificates ?? [],
    examSubjects: d.examSubjects ?? [],
  };
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(collections)) counts[k] = v.length;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION_V2,
    scope: 'year',
    academicYear: v1.academicYear,
    exportedAt: v1.exportedAt,
    exportedBy: '',
    counts,
    readErrors: [],
    collections,
    subcollections: {},
    checksum: '',
  };
}

// ── Parse ────────────────────────────────────────────────────────────────────

async function readJsonText(file: File): Promise<string> {
  const isZip = file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip');
  if (!isZip) return file.text();
  const { unzipSync, strFromU8 } = await loadZip();
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Only inflate backup.json — the files/ folder may be hundreds of MB.
  const entries = unzipSync(bytes, { filter: (f) => f.name === 'backup.json' });
  const json = entries['backup.json'];
  if (!json) throw new Error('This ZIP does not contain a backup.json — is it an SMP backup ZIP?');
  return strFromU8(json);
}

export async function parseBackupFile(file: File): Promise<ParsedBackup> {
  let text: string;
  try {
    text = await readJsonText(file);
  } catch (err) {
    throw err instanceof Error ? err : new Error('Failed to read the file.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Could not parse file. Make sure it is a valid SMP backup (.json or .zip).');
  }

  const obj = parsed as Partial<BackupFileV2> & Partial<BackupV1>;
  if (obj.version === '1' && obj.data && obj.academicYear) {
    return { backup: convertV1(obj as BackupV1), checksum: 'none', sourceVersion: '1', fileName: file.name };
  }
  if (obj.format !== BACKUP_FORMAT || obj.version !== BACKUP_VERSION_V2 || !obj.collections || !obj.exportedAt) {
    throw new Error(`Unsupported or invalid backup file (version "${String(obj.version ?? '?')}").`);
  }
  const backup = { ...obj, subcollections: obj.subcollections ?? {}, readErrors: obj.readErrors ?? [] } as unknown as BackupFileV2;
  let checksum: ChecksumStatus = 'none';
  if (backup.checksum) {
    const actual = await sha256Hex(JSON.stringify({ collections: obj.collections, subcollections: obj.subcollections ?? {} }));
    checksum = actual === backup.checksum ? 'ok' : 'mismatch';
  }
  return { backup, checksum, sourceVersion: '2', fileName: file.name };
}

// ── Restore ──────────────────────────────────────────────────────────────────

export interface RestoreResult {
  name: string;
  attempted: number;
  written: number;
  failed: number;
  firstError?: string;
}

const CHUNK = 400;

function shouldSkipDoc(collectionPath: string, id: string): boolean {
  // Restoring an old backup must not rewind the "last backup" marker.
  return collectionPath === 'settings' && id === BACKUP_META_DOC;
}

async function writeDocs(collectionPath: string, docs: BackupDoc[], result: RestoreResult): Promise<void> {
  const items = docs.filter((d) => !shouldSkipDoc(collectionPath, d.id));
  result.attempted += items.length;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const item of chunk) {
      const { id, ...data } = item;
      batch.set(doc(db, collectionPath, id), decodeValue(data) as Record<string, unknown>);
    }
    try {
      await batch.commit();
      result.written += chunk.length;
    } catch {
      // One rejected doc fails the whole batch — retry one by one so only
      // the genuinely rejected docs are counted as failed.
      for (const item of chunk) {
        const { id, ...data } = item;
        try {
          await setDoc(doc(db, collectionPath, id), decodeValue(data) as Record<string, unknown>);
          result.written += 1;
        } catch (err) {
          result.failed += 1;
          result.firstError ??= `${id}: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    }
  }
}

/**
 * Writes the selected collections back (overwrite by doc id). Never deletes
 * docs that exist live but not in the backup. Collections are restored one at
 * a time; failures are collected per collection rather than aborting.
 */
export async function restoreBackup(
  backup: BackupFileV2,
  selected: string[],
  onProgress?: ProgressFn,
): Promise<RestoreResult[]> {
  const results: RestoreResult[] = [];
  for (let i = 0; i < selected.length; i++) {
    const name = selected[i];
    onProgress?.({ stage: `Restoring ${name}…`, done: i, total: selected.length });
    const result: RestoreResult = { name, attempted: 0, written: 0, failed: 0 };
    await writeDocs(name, backup.collections[name] ?? [], result);
    for (const [path, docs] of Object.entries(backup.subcollections)) {
      if (path.startsWith(`${name}/`)) await writeDocs(path, docs, result);
    }
    results.push(result);
  }
  onProgress?.({ stage: 'Done', done: selected.length, total: selected.length });
  return results;
}
