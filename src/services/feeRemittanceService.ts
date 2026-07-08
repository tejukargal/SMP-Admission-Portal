import {
  collection, query, where, onSnapshot,
  deleteDoc, updateDoc, setDoc, doc, deleteField,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage';
import { db, storage } from '../config/firebase';
import type { FeeRemittance, AcademicYear, GovHeadAmounts, GovHeadChallan } from '../types';

const COL = 'feeRemittances';

type HeadFileMap = Partial<Record<keyof GovHeadAmounts, File>>;
type HeadFlagMap = Partial<Record<keyof GovHeadAmounts, boolean>>;
type HeadChallanMap = Partial<Record<keyof GovHeadAmounts, GovHeadChallan>>;

export function subscribeFeeRemittances(
  academicYear: AcademicYear,
  onData: (data: FeeRemittance[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where('academicYear', '==', academicYear));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeRemittance))),
    onError,
  );
}

async function uploadChallan(path: string, file: File): Promise<GovHeadChallan> {
  const sref = storageRef(storage, path);
  await uploadBytes(sref, file);
  const url = await getDownloadURL(sref);
  return { url, path };
}

async function deleteChallanFile(challanPath: string): Promise<void> {
  try { await deleteObject(storageRef(storage, challanPath)); } catch { /* ignore — file may already be gone */ }
}

export async function addFeeRemittance(
  data: Omit<FeeRemittance, 'id' | 'createdAt' | 'updatedAt'>,
  attachments?: { challanFile?: File; headChallans?: HeadFileMap },
): Promise<string> {
  const now = new Date().toISOString();
  const ref = doc(collection(db, COL));
  const patch: Record<string, unknown> = { ...data, createdAt: now, updatedAt: now };

  if (attachments?.challanFile) {
    const { url, path } = await uploadChallan(`remittanceChallans/${ref.id}/${Date.now()}_${attachments.challanFile.name}`, attachments.challanFile);
    patch.challanUrl  = url;
    patch.challanPath = path;
  }

  if (attachments?.headChallans) {
    const map: HeadChallanMap = {};
    for (const [key, file] of Object.entries(attachments.headChallans)) {
      if (!file) continue;
      map[key as keyof GovHeadAmounts] = await uploadChallan(`remittanceChallans/${ref.id}/${key}/${Date.now()}_${file.name}`, file);
    }
    if (Object.keys(map).length) patch.govHeadChallans = map;
  }

  await setDoc(ref, patch);
  return ref.id;
}

export async function updateFeeRemittance(
  id: string,
  data: Omit<FeeRemittance, 'id' | 'createdAt' | 'updatedAt'>,
  options?: {
    challanFile?: File; removeChallan?: boolean; previousChallanPath?: string;
    headChallans?: HeadFileMap; removeHeadChallans?: HeadFlagMap; previousHeadChallans?: HeadChallanMap;
  },
): Promise<void> {
  const patch: Record<string, unknown> = { ...data, updatedAt: new Date().toISOString() };

  if (options?.challanFile) {
    if (options.previousChallanPath) await deleteChallanFile(options.previousChallanPath);
    const { url, path } = await uploadChallan(`remittanceChallans/${id}/${Date.now()}_${options.challanFile.name}`, options.challanFile);
    patch.challanUrl  = url;
    patch.challanPath = path;
  } else if (options?.removeChallan) {
    if (options.previousChallanPath) await deleteChallanFile(options.previousChallanPath);
    patch.challanUrl  = deleteField();
    patch.challanPath = deleteField();
  }

  const headKeys = new Set([
    ...Object.keys(options?.headChallans ?? {}),
    ...Object.keys(options?.removeHeadChallans ?? {}),
  ]) as Set<keyof GovHeadAmounts>;
  for (const key of headKeys) {
    const file     = options?.headChallans?.[key];
    const remove   = options?.removeHeadChallans?.[key];
    const previous = options?.previousHeadChallans?.[key];
    if (file) {
      if (previous) await deleteChallanFile(previous.path);
      const challan = await uploadChallan(`remittanceChallans/${id}/${key}/${Date.now()}_${file.name}`, file);
      patch[`govHeadChallans.${key}`] = challan;
    } else if (remove) {
      if (previous) await deleteChallanFile(previous.path);
      patch[`govHeadChallans.${key}`] = deleteField();
    }
  }

  await updateDoc(doc(db, COL, id), patch);
}

export async function deleteFeeRemittance(
  id: string,
  challanPath?: string,
  headChallans?: HeadChallanMap,
): Promise<void> {
  if (challanPath) await deleteChallanFile(challanPath);
  if (headChallans) await Promise.all(Object.values(headChallans).map((c) => c && deleteChallanFile(c.path)));
  await deleteDoc(doc(db, COL, id));
}
