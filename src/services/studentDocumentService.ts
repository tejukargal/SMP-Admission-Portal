import {
  doc, getDocs, collection, writeBatch, onSnapshot, runTransaction, query, orderBy,
  type DocumentReference,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type {
  StudentDocuments, DocRecord, DocEntry, DocKey, DocStatus, DocHistoryAction, DocHistoryEntry,
} from '../types';
import { REQUIRED_DOCS, DOC_COPY_DEFAULT } from '../types';

const COLL = 'studentDocuments';
const HISTORY = 'history';

// ─── Defaults & shape helpers ──────────────────────────────────────────────────

export function emptyEntry(): DocEntry {
  return { submitted: false, submittedOn: '', returned: false, returnedOn: '', remarks: '' };
}

export function emptyDocRecord(): DocRecord {
  return Object.fromEntries(
    REQUIRED_DOCS.map(({ key }) => [
      key,
      key === 'eligibilityCertificate' ? { ...emptyEntry(), notRequired: true } : emptyEntry(),
    ])
  ) as DocRecord;
}

/** Fill any missing keys with empty entries (handles new doc types added later) */
export function mergeWithDefaults(partial: Partial<DocRecord>): DocRecord {
  const full = emptyDocRecord();
  for (const { key } of REQUIRED_DOCS) {
    if (partial[key]) full[key] = { ...full[key], ...partial[key] };
  }
  return full;
}

/** Today as YYYY-MM-DD in the browser's local time zone (IST for the office),
 *  not UTC — so a document received at 1 AM is not dated yesterday. */
export function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function statusOf(e: DocEntry): DocStatus {
  if (e.notRequired) return 'notRequired';
  if (e.returned) return 'returned';
  if (e.submitted) return 'received';
  return 'pending';
}

/** Whether a document has an Original/Copy distinction (photos do not). */
export function hasCopyType(key: DocKey): boolean {
  return DOC_COPY_DEFAULT[key] !== undefined;
}

export interface DocSummary {
  /** Documents that are required (total minus Not Required). */
  required: number;
  /** Required documents ever received (includes those since returned). */
  received: number;
  /** Received and still held by the college. */
  withCollege: number;
  returned: number;
  /** Required and not yet received. */
  pending: number;
  notRequired: number;
  /** Every required document has been received. */
  complete: boolean;
}

/** Shared, Not-Required-aware counts — use this everywhere counts are shown. */
export function docSummary(docs: DocRecord): DocSummary {
  let required = 0, received = 0, returned = 0, notRequired = 0;
  for (const { key } of REQUIRED_DOCS) {
    const e = docs[key];
    if (e.notRequired) { notRequired++; continue; }
    required++;
    if (e.submitted) received++;
    if (e.submitted && e.returned) returned++;
  }
  const pending = required - received;
  return { required, received, withCollege: received - returned, returned, pending, notRequired, complete: pending === 0 };
}

/** Returns an error message for an impossible entry, or '' when valid. */
export function validateEntry(e: DocEntry, today = todayLocal()): string {
  if (e.returned && !e.submitted) return 'A document must be received before it can be returned.';
  if (e.submitted && !e.submittedOn) return 'Enter the date the document was received.';
  if (e.returned && !e.returnedOn) return 'Enter the date the document was returned.';
  if (e.submittedOn && e.submittedOn > today) return 'Received date cannot be in the future.';
  if (e.returnedOn && e.returnedOn > today) return 'Return date cannot be in the future.';
  if (e.returned && e.submittedOn && e.returnedOn && e.returnedOn < e.submittedOn) {
    return 'Return date cannot be before the received date.';
  }
  if ((e.remarks ?? '').length > 500) return 'Remarks must be 500 characters or fewer.';
  return '';
}

/** Firestore rejects `undefined`; also drops the audit stamps from a snapshot. */
function cleanEntry(e: DocEntry): DocEntry {
  const out: DocEntry = {
    submitted: !!e.submitted,
    submittedOn: e.submittedOn ?? '',
    returned: !!e.returned,
    returnedOn: e.returnedOn ?? '',
    remarks: e.remarks ?? '',
  };
  if (e.notRequired !== undefined) out.notRequired = !!e.notRequired;
  if (e.copyType) out.copyType = e.copyType;
  if (e.updatedBy) out.updatedBy = e.updatedBy;
  if (e.updatedAt) out.updatedAt = e.updatedAt;
  return out;
}

function sameEntry(a: DocEntry, b: DocEntry): boolean {
  return !!a.submitted === !!b.submitted
    && (a.submittedOn ?? '') === (b.submittedOn ?? '')
    && !!a.returned === !!b.returned
    && (a.returnedOn ?? '') === (b.returnedOn ?? '')
    && (a.remarks ?? '') === (b.remarks ?? '')
    && !!a.notRequired === !!b.notRequired
    && (a.copyType ?? '') === (b.copyType ?? '')
    && (a.updatedAt ?? '') === (b.updatedAt ?? '');
}

// ─── Reads ─────────────────────────────────────────────────────────────────────

/** Live listener on one student's checklist — another staff member's change
 *  shows up immediately. Calls back with merged defaults. */
export function subscribeStudentDocuments(
  studentId: string,
  onData: (docs: DocRecord) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, COLL, studentId),
    (snap) => {
      const data = snap.exists() ? (snap.data() as Omit<StudentDocuments, 'id'>) : null;
      onData(mergeWithDefaults(data?.docs ?? {}));
    },
    onError,
  );
}

export async function getAllStudentDocuments(): Promise<StudentDocuments[]> {
  const snap = await getDocs(collection(db, COLL));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudentDocuments));
}

export async function getDocHistory(studentId: string): Promise<DocHistoryEntry[]> {
  const snap = await getDocs(query(collection(db, COLL, studentId, HISTORY), orderBy('at', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DocHistoryEntry));
}

// ─── Writes ────────────────────────────────────────────────────────────────────

export class DocConflictError extends Error {
  latest: DocEntry;
  constructor(latest: DocEntry) {
    super(latest.updatedBy
      ? `Updated by ${latest.updatedBy} just now — please re-check.`
      : 'This document was just changed by someone else — please re-check.');
    this.name = 'DocConflictError';
    this.latest = latest;
  }
}

export class DocOfflineError extends Error {
  constructor() {
    super("You're offline — change not saved. Reconnect and try again.");
    this.name = 'DocOfflineError';
  }
}

const SAVE_TIMEOUT_MS = 15_000;

/**
 * Atomically change ONE checklist entry and append its audit entry.
 *
 * - Writes only `docs.<key>`, so edits to different documents never overwrite each other.
 * - Rejects with DocConflictError if the entry changed since the user saw it (`seen`).
 * - Transactions need the server, so this fails fast offline (DocOfflineError) instead
 *   of leaving a queued write the user can't see.
 * Returns the saved entry (with audit stamps).
 */
export async function updateDocEntry(
  studentId: string,
  key: DocKey,
  seen: DocEntry,
  next: DocEntry,
  action: DocHistoryAction,
): Promise<DocEntry> {
  const user = auth.currentUser;
  if (!user) throw new Error('Your session has expired — please sign in again.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new DocOfflineError();

  const invalid = validateEntry(next);
  if (invalid) throw new Error(invalid);

  const now = new Date().toISOString();
  const byEmail = user.email ?? '';
  const saved = cleanEntry({ ...next, updatedBy: byEmail, updatedAt: now });
  const ref = doc(db, COLL, studentId);
  const histRef: DocumentReference = doc(collection(db, COLL, studentId, HISTORY));

  const work = runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists() ? (snap.data() as Omit<StudentDocuments, 'id'>) : null;
    const current = mergeWithDefaults(stored?.docs ?? {})[key];
    if (!sameEntry(current, seen)) throw new DocConflictError(current);

    if (snap.exists()) {
      tx.update(ref, { [`docs.${key}`]: saved, updatedAt: now, updatedBy: byEmail });
    } else {
      tx.set(ref, { studentId, docs: { [key]: saved }, updatedAt: now, updatedBy: byEmail });
    }
    tx.set(histRef, {
      docKey: key,
      action,
      before: cleanEntry(current),
      after: saved,
      byUid: user.uid,
      byEmail,
      at: now,
    });
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DocOfflineError()), SAVE_TIMEOUT_MS);
  });
  try {
    await Promise.race([work, timeout]);
  } catch (err) {
    if (err instanceof DocConflictError || err instanceof DocOfflineError) throw err;
    const code = (err as { code?: string }).code;
    if (code === 'unavailable') throw new DocOfflineError();
    if (code === 'permission-denied') throw new Error('Permission denied — this change was blocked by security rules.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
  return saved;
}

// ─── Deletes (admin-only by rules) ─────────────────────────────────────────────

async function commitDeletes(refs: DocumentReference[]): Promise<void> {
  const BATCH_LIMIT = 500;
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const r of refs.slice(i, i + BATCH_LIMIT)) batch.delete(r);
    await batch.commit();
  }
}

/** All history entry refs under the given checklist records (read in small parallel chunks). */
export async function historyRefsFor(studentIds: string[]): Promise<DocumentReference[]> {
  const refs: DocumentReference[] = [];
  const CHUNK = 20;
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const snaps = await Promise.all(
      studentIds.slice(i, i + CHUNK).map((id) => getDocs(collection(db, COLL, id, HISTORY))),
    );
    for (const s of snaps) refs.push(...s.docs.map((d) => d.ref));
  }
  return refs;
}

/** Delete document records (and their history) for the given student IDs. Returns records deleted. */
export async function resetDocumentsByStudentIds(studentIds: string[]): Promise<number> {
  if (studentIds.length === 0) return 0;
  const history = await historyRefsFor(studentIds);
  await commitDeletes([...history, ...studentIds.map((id) => doc(db, COLL, id))]);
  return studentIds.length;
}

/** Delete ALL document records (and their history) across all students. */
export async function resetAllDocuments(): Promise<number> {
  const snap = await getDocs(collection(db, COLL));
  if (snap.empty) return 0;
  const history = await historyRefsFor(snap.docs.map((d) => d.id));
  await commitDeletes([...history, ...snap.docs.map((d) => d.ref)]);
  return snap.docs.length;
}
