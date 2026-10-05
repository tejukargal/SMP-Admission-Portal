import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  deleteDoc,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  ExamDutyCertificate,
  ExamDutyCertificateInput,
  ExamDutyPerson,
  ExamDutyStaff,
} from '../types';

const CERTS = 'examDutyCertificates';
const STAFF = 'examDutyStaff';

// ── Session / reference helpers ─────────────────────────────────────────────

/** Normalises a typed session label: "apr / may" → "APR/MAY". */
export function normaliseSessionLabel(label: string): string {
  return label.toUpperCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
}

/** Serial series key, one per exam session: ('APR/MAY', 2026) → 'APR-MAY-2026'. */
export function examSessionKey(label: string, year: number): string {
  const slug = normaliseSessionLabel(label).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}-${year}`;
}

export function examSessionTitle(label: string, year: number): string {
  return `${normaliseSessionLabel(label)}-${year}`;
}

export function examRefPrefix(label: string, year: number): string {
  return `SMP/EXAM/${examSessionTitle(label, year)}/`;
}

export function examRefNo(label: string, year: number, serial: number): string {
  return `${examRefPrefix(label, year)}${serial}`;
}

// ── Serial counter ──────────────────────────────────────────────────────────
// counters/examCert__{sessionKey} → { seq, used: { [serial]: certId }, updatedAt }
// `used` makes a duplicate serial impossible inside a session, and `seq` is
// always the highest serial still in use, so deleting the newest certificate
// hands its number back.

interface SerialCounter { seq: number; used: Record<string, string> }

function counterRef(sessionKey: string) {
  return doc(db, 'counters', `examCert__${sessionKey}`);
}

function readCounter(snap: DocumentSnapshot): SerialCounter {
  const used = (snap.exists() ? (snap.data().used as Record<string, string> | undefined) : undefined) ?? {};
  return { seq: maxSerial(used), used: { ...used } };
}

function maxSerial(used: Record<string, string>): number {
  return Object.keys(used).reduce((m, k) => Math.max(m, Number(k) || 0), 0);
}

function counterData(used: Record<string, string>) {
  return { seq: maxSerial(used), used, updatedAt: new Date().toISOString() };
}

export async function peekNextExamCertSerial(sessionKey: string): Promise<number> {
  const snap = await getDoc(counterRef(sessionKey));
  return readCounter(snap).seq + 1;
}

function duplicateSerialError(serial: number, label: string, year: number): Error {
  return new Error(`Ref. No. ${examRefNo(label, year, serial)} has already been issued. Choose another serial number.`);
}

// ── Certificates ────────────────────────────────────────────────────────────

export function subscribeExamCerts(
  onData: (certs: ExamDutyCertificate[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, CERTS),
    (snap) => {
      const certs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExamDutyCertificate);
      certs.sort((a, b) => b.sessionYear - a.sessionYear || b.serial - a.serial);
      onData(certs);
    },
    onError,
  );
}

interface Author { uid: string; email?: string | null }

function certFields(input: ExamDutyCertificateInput) {
  const sessionLabel = normaliseSessionLabel(input.sessionLabel);
  const { bodyOverride, ...rest } = input;
  return {
    ...rest,
    sessionLabel,
    sessionKey: examSessionKey(sessionLabel, input.sessionYear),
    refNo: examRefNo(sessionLabel, input.sessionYear, input.serial),
    ...(bodyOverride?.trim() ? { bodyOverride: bodyOverride.trim() } : {}),
  };
}

/**
 * Saves a new certificate and claims its serial atomically. With `autoSerial`,
 * a serial taken by someone else since the form opened is quietly bumped to the
 * next free number. A hand-typed serial that is already taken is refused.
 */
export async function createExamCert(
  input: ExamDutyCertificateInput,
  author: Author,
  autoSerial: boolean,
): Promise<ExamDutyCertificate> {
  const certRef = doc(collection(db, CERTS));
  const sessionKey = examSessionKey(input.sessionLabel, input.sessionYear);
  const cRef = counterRef(sessionKey);
  const now = new Date().toISOString();

  const cert = await runTransaction(db, async (tx) => {
    const { seq, used } = readCounter(await tx.get(cRef));
    let serial = input.serial;
    if (used[String(serial)]) {
      if (!autoSerial) throw duplicateSerialError(serial, input.sessionLabel, input.sessionYear);
      serial = seq + 1;
    }
    used[String(serial)] = certRef.id;
    tx.set(cRef, counterData(used));

    const data = {
      ...certFields({ ...input, serial }),
      createdBy: author.uid,
      ...(author.email ? { createdByEmail: author.email } : {}),
      createdAt: now,
      updatedAt: now,
    };
    tx.set(certRef, data);
    return { id: certRef.id, ...data } as ExamDutyCertificate;
  });

  await upsertExamStaff(input).catch(() => { /* directory is a convenience only */ });
  return cert;
}

/** Updates a certificate; moving it to another session or serial re-claims the number atomically. */
export async function updateExamCert(
  prev: ExamDutyCertificate,
  input: ExamDutyCertificateInput,
): Promise<ExamDutyCertificate> {
  const fields = certFields(input);
  const now = new Date().toISOString();
  const data = { ...fields, updatedAt: now };
  const certRef = doc(db, CERTS, prev.id);
  const moved = fields.sessionKey !== prev.sessionKey || fields.serial !== prev.serial;

  // Full replace (not updateDoc) so a cleared wording override is really removed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, bodyOverride: _omit, ...base } = prev;
  const next = { ...base, ...data };

  if (!moved) {
    await setDoc(certRef, next);
  } else {
    const oldRef = counterRef(prev.sessionKey);
    const newRef = counterRef(fields.sessionKey);
    const same = oldRef.path === newRef.path;
    await runTransaction(db, async (tx) => {
      const oldC = readCounter(await tx.get(oldRef));
      const newC = same ? oldC : readCounter(await tx.get(newRef));
      if (oldC.used[String(prev.serial)] === prev.id) delete oldC.used[String(prev.serial)];
      if (newC.used[String(fields.serial)]) {
        throw duplicateSerialError(fields.serial, fields.sessionLabel, fields.sessionYear);
      }
      newC.used[String(fields.serial)] = prev.id;
      tx.set(oldRef, counterData(oldC.used));
      if (!same) tx.set(newRef, counterData(newC.used));
      tx.set(certRef, next);
    });
  }

  await upsertExamStaff(input).catch(() => { /* directory is a convenience only */ });
  return { id: prev.id, ...next } as ExamDutyCertificate;
}

/** Admin only (enforced by rules). Hands the serial back to the session. */
export async function deleteExamCert(cert: ExamDutyCertificate): Promise<void> {
  const cRef = counterRef(cert.sessionKey);
  await runTransaction(db, async (tx) => {
    const c = readCounter(await tx.get(cRef));
    if (c.used[String(cert.serial)] === cert.id) delete c.used[String(cert.serial)];
    tx.set(cRef, counterData(c.used));
    tx.delete(doc(db, CERTS, cert.id));
  });
}

// ── Staff directory ─────────────────────────────────────────────────────────

function staffId(p: Pick<ExamDutyPerson, 'name' | 'polytechnic'>): string {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${norm(p.name)}__${norm(p.polytechnic)}`.slice(0, 300);
}

export async function listExamStaff(): Promise<ExamDutyStaff[]> {
  const snap = await getDocs(collection(db, STAFF));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as ExamDutyStaff)
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

export async function upsertExamStaff(p: ExamDutyPerson): Promise<void> {
  if (!p.name.trim() || !p.polytechnic.trim()) return;
  const person: ExamDutyPerson = {
    salutation: p.salutation,
    name: p.name.trim(),
    designation: p.designation.trim(),
    department: p.department.trim(),
    polytechnic: p.polytechnic.trim(),
  };
  await setDoc(doc(db, STAFF, staffId(person)), { ...person, lastUsedAt: new Date().toISOString() });
}

export async function deleteExamStaff(id: string): Promise<void> {
  await deleteDoc(doc(db, STAFF, id));
}
