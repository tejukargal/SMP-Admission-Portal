import {
  collection, doc, getDoc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField, writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import type { CashDeposit, CashTrackingSettings, UpiCredit } from '../types';

const COL = 'cashDeposits';
const SETTINGS_REF = () => doc(db, 'settings', 'cash_tracking');

export const DEFAULT_OVERDUE_DAYS = 2;

/** Firestore rejects `undefined` field values — drop them before writing. */
function clean(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export function subscribeCashDeposits(
  onData: (data: CashDeposit[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, COL),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashDeposit))),
    onError,
  );
}

async function uploadSlip(depositId: string, file: File): Promise<{ url: string; path: string }> {
  const path = `cashDepositSlips/${depositId}/${Date.now()}_${file.name}`;
  const sref = storageRef(storage, path);
  await uploadBytes(sref, file);
  return { url: await getDownloadURL(sref), path };
}

async function deleteSlip(path: string): Promise<void> {
  try { await deleteObject(storageRef(storage, path)); } catch { /* ignore — file may already be gone */ }
}

export async function addCashDeposit(
  data: Omit<CashDeposit, 'id' | 'createdAt' | 'updatedAt' | 'slipUrl' | 'slipPath'>,
  slipFile?: File | null,
): Promise<string> {
  const now = new Date().toISOString();
  const ref = doc(collection(db, COL));
  const patch: Record<string, unknown> = clean({ ...data, createdAt: now, updatedAt: now });
  if (slipFile) {
    const { url, path } = await uploadSlip(ref.id, slipFile);
    patch.slipUrl = url;
    patch.slipPath = path;
  }
  await setDoc(ref, patch);
  return ref.id;
}

/** Edit the bank-side details of a deposit (date, mode, reference, remarks, slip). */
export async function updateCashDeposit(
  deposit: CashDeposit,
  data: Pick<CashDeposit, 'depositDate' | 'depositMode' | 'reference' | 'remarks'> & { denominations?: Record<string, number> },
  options?: { slipFile?: File | null; removeSlip?: boolean },
): Promise<void> {
  const patch: Record<string, unknown> = {
    ...clean({ ...data, updatedAt: new Date().toISOString() }),
    ...(data.denominations === undefined ? { denominations: deleteField() } : {}),
  };
  if (options?.slipFile || options?.removeSlip) {
    if (deposit.slipPath) await deleteSlip(deposit.slipPath);
    if (options.slipFile) {
      const { url, path } = await uploadSlip(deposit.id, options.slipFile);
      patch.slipUrl = url;
      patch.slipPath = path;
    } else {
      patch.slipUrl = deleteField();
      patch.slipPath = deleteField();
    }
  }
  await updateDoc(doc(db, COL, deposit.id), patch);
}

/** Undo a deposit — its days return to cash in hand. */
export async function deleteCashDeposit(deposit: CashDeposit): Promise<void> {
  await deleteDoc(doc(db, COL, deposit.id));
  if (deposit.slipPath) await deleteSlip(deposit.slipPath);
}

export async function getCashTrackingSettings(): Promise<CashTrackingSettings | null> {
  const snap = await getDoc(SETTINGS_REF());
  return snap.exists() ? (snap.data() as CashTrackingSettings) : null;
}

export function subscribeCashTrackingSettings(
  onData: (data: CashTrackingSettings | null) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    SETTINGS_REF(),
    (snap) => onData(snap.exists() ? (snap.data() as CashTrackingSettings) : null),
    onError,
  );
}

export async function saveCashTrackingSettings(data: Omit<CashTrackingSettings, 'updatedAt'>): Promise<void> {
  await setDoc(SETTINGS_REF(), { ...data, updatedAt: new Date().toISOString() });
}

// ── UPI credits ──────────────────────────────────────────────────────────────

const UPI_COL = 'upiCredits';

export function upiCreditId(account: string, collectionDate: string): string {
  return `${account}__${collectionDate}`;
}

export function subscribeUpiCredits(
  onData: (data: UpiCredit[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, UPI_COL),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UpiCredit))),
    onError,
  );
}

/** Set the bank credit date/ref for one or more UPI collection days (one doc per day+account). */
export async function saveUpiCredits(
  entries: { account: UpiCredit['account']; collectionDate: string; amount: number; existing?: UpiCredit }[],
  data: { creditDate: string; reference: string; remarks: string; createdBy: string; createdByEmail?: string },
): Promise<void> {
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  for (const e of entries) {
    const id = upiCreditId(e.account, e.collectionDate);
    batch.set(doc(db, UPI_COL, id), clean({
      account: e.account,
      collectionDate: e.collectionDate,
      amount: e.amount,
      creditDate: data.creditDate,
      reference: data.reference,
      remarks: data.remarks,
      createdBy: e.existing?.createdBy ?? data.createdBy,
      createdByEmail: e.existing?.createdByEmail ?? data.createdByEmail,
      createdAt: e.existing?.createdAt ?? now,
      updatedAt: now,
    }));
  }
  await batch.commit();
}

/** Remove the confirmation — the day falls back to "credited on collection date". */
export async function deleteUpiCredit(id: string): Promise<void> {
  await deleteDoc(doc(db, UPI_COL, id));
}
