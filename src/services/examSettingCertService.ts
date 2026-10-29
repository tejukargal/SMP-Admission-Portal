import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  counterData,
  counterRef,
  duplicateSerialError,
  examSessionKey,
  examSessionTitle,
  normaliseSessionLabel,
  readCounter,
  upsertExamStaff,
} from './examDutyCertService';
import type {
  ExamSettingCertificate,
  ExamSettingCertificateInput,
  ExamSettingSubject,
  ExamSubject,
} from '../types';

const CERTS = 'examSettingCertificates';
const SUBJECTS = 'examSubjects';

// ── Reference helpers ───────────────────────────────────────────────────────

export function settingRefPrefix(label: string, year: number): string {
  return `SMP/SEM/${examSessionTitle(label, year)}/`;
}

/** Serial 0 means "no serial" — the ref ends at the prefix and nothing is claimed. */
export function settingRefNo(label: string, year: number, serial: number): string {
  return `${settingRefPrefix(label, year)}${serial > 0 ? serial : ''}`;
}

// ── Certificates ────────────────────────────────────────────────────────────

export function subscribeSettingCerts(
  onData: (certs: ExamSettingCertificate[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, CERTS),
    (snap) => {
      const certs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExamSettingCertificate);
      certs.sort((a, b) => b.sessionYear - a.sessionYear || b.serial - a.serial);
      onData(certs);
    },
    onError,
  );
}

interface Author { uid: string; email?: string | null }

function certFields(input: ExamSettingCertificateInput) {
  const sessionLabel = normaliseSessionLabel(input.sessionLabel);
  const { bodyOverride, ...rest } = input;
  return {
    ...rest,
    sessionLabel,
    sessionKey: examSessionKey(sessionLabel, input.sessionYear),
    refNo: settingRefNo(sessionLabel, input.sessionYear, input.serial),
    ...(bodyOverride?.trim() ? { bodyOverride: bodyOverride.trim() } : {}),
  };
}

async function afterSave(input: ExamSettingCertificateInput): Promise<void> {
  // Directories are a convenience only — never fail the save over them.
  await Promise.all([
    upsertExamStaff(input).catch(() => {}),
    upsertExamSubjects(input.subjects).catch(() => {}),
  ]);
}

/**
 * Saves a new certificate and claims its serial in the shared session counter.
 * With `autoSerial`, a serial taken since the form opened (by either kind of
 * certificate) is quietly bumped to the next free number; a hand-typed serial
 * that is already taken is refused.
 */
export async function createSettingCert(
  input: ExamSettingCertificateInput,
  author: Author,
  autoSerial: boolean,
): Promise<ExamSettingCertificate> {
  const certRef = doc(collection(db, CERTS));
  const cRef = counterRef(examSessionKey(input.sessionLabel, input.sessionYear));
  const now = new Date().toISOString();

  const stamp = {
    createdBy: author.uid,
    ...(author.email ? { createdByEmail: author.email } : {}),
    createdAt: now,
    updatedAt: now,
  };

  if (!(input.serial > 0)) {
    const data = { ...certFields({ ...input, serial: 0 }), ...stamp };
    await setDoc(certRef, data);
    await afterSave(input);
    return { id: certRef.id, ...data } as ExamSettingCertificate;
  }

  const cert = await runTransaction(db, async (tx) => {
    const { seq, used } = readCounter(await tx.get(cRef));
    let serial = input.serial;
    if (used[String(serial)]) {
      if (!autoSerial) throw duplicateSerialError(serial, input.sessionLabel, input.sessionYear);
      serial = seq + 1;
    }
    used[String(serial)] = certRef.id;
    tx.set(cRef, counterData(used));

    const data = { ...certFields({ ...input, serial }), ...stamp };
    tx.set(certRef, data);
    return { id: certRef.id, ...data } as ExamSettingCertificate;
  });

  await afterSave(input);
  return cert;
}

/** Updates a certificate; moving it to another session or serial re-claims the number atomically. */
export async function updateSettingCert(
  prev: ExamSettingCertificate,
  input: ExamSettingCertificateInput,
): Promise<ExamSettingCertificate> {
  const fields = certFields(input);
  const data = { ...fields, updatedAt: new Date().toISOString() };
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
      if (prev.serial > 0 && oldC.used[String(prev.serial)] === prev.id) delete oldC.used[String(prev.serial)];
      if (fields.serial > 0) {
        if (newC.used[String(fields.serial)]) {
          throw duplicateSerialError(fields.serial, fields.sessionLabel, fields.sessionYear);
        }
        newC.used[String(fields.serial)] = prev.id;
      }
      tx.set(oldRef, counterData(oldC.used));
      if (!same) tx.set(newRef, counterData(newC.used));
      tx.set(certRef, next);
    });
  }

  await afterSave(input);
  return { id: prev.id, ...next } as ExamSettingCertificate;
}

/** Admin only (enforced by rules). Hands the serial back to the session. */
export async function deleteSettingCert(cert: ExamSettingCertificate): Promise<void> {
  const cRef = counterRef(cert.sessionKey);
  await runTransaction(db, async (tx) => {
    const c = readCounter(await tx.get(cRef));
    if (c.used[String(cert.serial)] === cert.id) delete c.used[String(cert.serial)];
    tx.set(cRef, counterData(c.used));
    tx.delete(doc(db, CERTS, cert.id));
  });
}

// ── Subject directory ───────────────────────────────────────────────────────

export function subjectId(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 100);
}

export async function listExamSubjects(): Promise<ExamSubject[]> {
  const snap = await getDocs(collection(db, SUBJECTS));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as ExamSubject)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function upsertExamSubjects(subjects: ExamSettingSubject[]): Promise<void> {
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  let n = 0;
  for (const s of subjects) {
    const code = s.code.trim().toUpperCase();
    const name = s.name.trim().toUpperCase();
    const id = subjectId(code);
    if (!id || !name) continue;
    batch.set(doc(db, SUBJECTS, id), { code, name, lastUsedAt: now });
    n++;
  }
  if (n) await batch.commit();
}
