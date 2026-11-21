import {
  collection, doc, documentId, getDoc, getDocsFromServer, limit, orderBy, query,
  setDoc, startAfter, where, type DocumentData, type Query, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import type { AcademicYear } from '../../types';
import { BACKUP_COLLECTIONS, type CollectionSpec } from './registry';
import { encodeValue, sha256Hex } from './codec';

export const BACKUP_FORMAT = 'smp-backup' as const;
export const BACKUP_VERSION_V2 = '2' as const;

export type BackupDoc = { id: string } & Record<string, unknown>;

export type BackupScope = { scope: 'full' } | { scope: 'year'; academicYear: AcademicYear };

export interface BackupFileV2 {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION_V2;
  scope: 'full' | 'year';
  academicYear?: AcademicYear;
  exportedAt: string;
  exportedBy: string;
  /** Doc count per collection, plus per subcollection path group. */
  counts: Record<string, number>;
  /** Collections that could not be read (permission, network) — the backup is incomplete for these. */
  readErrors: { name: string; error: string }[];
  collections: Record<string, BackupDoc[]>;
  /** Keyed `parentCollection/{parentId}/subName`. */
  subcollections: Record<string, BackupDoc[]>;
  /** SHA-256 of JSON.stringify({collections, subcollections}). */
  checksum: string;
}

export interface ExportProgress {
  stage: string;
  done: number;
  total: number;
}

export type ProgressFn = (p: ExportProgress) => void;

const PAGE = 1000;
export const BACKUP_META_DOC = 'backup_meta';

function toBackupDoc(d: QueryDocumentSnapshot<DocumentData>): BackupDoc {
  return { id: d.id, ...(encodeValue(d.data()) as Record<string, unknown>) };
}

/** Reads a whole query from the server (never the offline cache), paging by doc id. */
async function readAllFromServer(base: Query<DocumentData>): Promise<BackupDoc[]> {
  const out: BackupDoc[] = [];
  let last: QueryDocumentSnapshot<DocumentData> | null = null;
  for (;;) {
    const q: Query<DocumentData> = last
      ? query(base, orderBy(documentId()), startAfter(last), limit(PAGE))
      : query(base, orderBy(documentId()), limit(PAGE));
    const snap = await getDocsFromServer(q);
    out.push(...snap.docs.map(toBackupDoc));
    if (snap.docs.length < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return out;
}

async function readCollection(
  spec: CollectionSpec,
  scope: BackupScope,
  yearStudentIds: Set<string> | null,
): Promise<BackupDoc[]> {
  const coll = collection(db, spec.name);
  if (scope.scope === 'full' || spec.yearScope === 'global') return readAllFromServer(coll);

  const year = scope.academicYear;
  switch (spec.yearScope) {
    case 'field':
      return readAllFromServer(query(coll, where('academicYear', '==', year)));
    case 'idPrefix': {
      const prefixes = [year, ...(spec.alwaysIncludePrefixes ?? [])];
      const all = await readAllFromServer(coll);
      return all.filter((d) => prefixes.some((p) => d.id.startsWith(p)));
    }
    case 'byStudent': {
      const all = await readAllFromServer(coll);
      return all.filter((d) => yearStudentIds?.has(d.id));
    }
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Builds a backup of every collection in the registry. A collection that fails
 * to read is listed in `readErrors` (the UI warns loudly) instead of aborting
 * the whole backup.
 */
export async function exportBackup(scope: BackupScope, onProgress?: ProgressFn): Promise<BackupFileV2> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline. A backup must read live data from the server — connect to the internet and try again.');
  }

  const specs = BACKUP_COLLECTIONS;
  const collections: Record<string, BackupDoc[]> = {};
  const subcollections: Record<string, BackupDoc[]> = {};
  const counts: Record<string, number> = {};
  const readErrors: { name: string; error: string }[] = [];

  // Students first: single-year backups need their ids for studentDocuments.
  const ordered = [...specs].sort((a, b) => (a.name === 'students' ? -1 : b.name === 'students' ? 1 : 0));
  let yearStudentIds: Set<string> | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const spec = ordered[i];
    onProgress?.({ stage: `Reading ${spec.label}…`, done: i, total: ordered.length });
    try {
      const docs = await readCollection(spec, scope, yearStudentIds);
      collections[spec.name] = docs;
      counts[spec.name] = docs.length;
      if (spec.name === 'students') yearStudentIds = new Set(docs.map((d) => d.id));

      for (const sub of spec.subcollections ?? []) {
        let subTotal = 0;
        for (const parent of docs) {
          const subDocs = await readAllFromServer(collection(db, spec.name, parent.id, sub));
          if (subDocs.length) {
            subcollections[`${spec.name}/${parent.id}/${sub}`] = subDocs;
            subTotal += subDocs.length;
          }
        }
        counts[`${spec.name}/*/${sub}`] = subTotal;
      }
    } catch (err) {
      collections[spec.name] = [];
      counts[spec.name] = 0;
      readErrors.push({ name: spec.name, error: errorText(err) });
    }
  }

  onProgress?.({ stage: 'Computing checksum…', done: ordered.length, total: ordered.length });
  const checksum = await sha256Hex(JSON.stringify({ collections, subcollections }));

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION_V2,
    scope: scope.scope,
    ...(scope.scope === 'year' ? { academicYear: scope.academicYear } : {}),
    exportedAt: new Date().toISOString(),
    exportedBy: auth.currentUser?.email ?? '',
    counts,
    readErrors,
    collections,
    subcollections,
    checksum,
  };
}

export function totalDocs(b: Pick<BackupFileV2, 'collections' | 'subcollections'>): number {
  let n = 0;
  for (const docs of Object.values(b.collections)) n += docs.length;
  for (const docs of Object.values(b.subcollections)) n += docs.length;
  return n;
}

// ── Backup meta (last backup timestamps, shown on the Export panel) ─────────

export interface BackupMeta {
  lastFullBackupAt?: string;
  lastFullBackupBy?: string;
  lastFullBackupDocs?: number;
  lastYearBackupAt?: string;
  lastYearBackupYear?: string;
}

export async function getBackupMeta(): Promise<BackupMeta | null> {
  const snap = await getDoc(doc(db, 'settings', BACKUP_META_DOC));
  return snap.exists() ? (snap.data() as BackupMeta) : null;
}

export async function recordBackupMeta(backup: BackupFileV2): Promise<void> {
  const patch: BackupMeta = backup.scope === 'full'
    ? { lastFullBackupAt: backup.exportedAt, lastFullBackupBy: backup.exportedBy, lastFullBackupDocs: totalDocs(backup) }
    : { lastYearBackupAt: backup.exportedAt, lastYearBackupYear: backup.academicYear };
  await setDoc(doc(db, 'settings', BACKUP_META_DOC), patch, { merge: true });
}

// ── Download helpers ─────────────────────────────────────────────────────────

export function backupBaseName(backup: Pick<BackupFileV2, 'scope' | 'academicYear' | 'exportedAt'>): string {
  const date = backup.exportedAt.slice(0, 10);
  return backup.scope === 'full' ? `smp-full-backup-${date}` : `smp-backup-${backup.academicYear}-${date}`;
}

export function serializeBackup(backup: BackupFileV2): string {
  return JSON.stringify(backup);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadBackupJson(backup: BackupFileV2, suffix = ''): void {
  const blob = new Blob([serializeBackup(backup)], { type: 'application/json' });
  downloadBlob(blob, `${backupBaseName(backup)}${suffix}.json`);
}
