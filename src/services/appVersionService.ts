import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface PublishedVersion {
  latestVersion: string;
  updateUrl: string;
}

export interface PendingRelease {
  versionCode: number;
  versionName: string;
  updateUrl: string;
  createdAt: string;
}

const VERSION_DOC = doc(db, 'appConfig', 'version');
const PENDING_DOC = doc(db, 'appConfig', 'pendingRelease');

export async function getPublishedVersion(): Promise<PublishedVersion | null> {
  const snap = await getDoc(VERSION_DOC);
  if (!snap.exists()) return null;
  return snap.data() as PublishedVersion;
}

export async function getPendingRelease(): Promise<PendingRelease | null> {
  const snap = await getDoc(PENDING_DOC);
  if (!snap.exists()) return null;
  return snap.data() as PendingRelease;
}

export async function savePendingRelease(release: Omit<PendingRelease, 'createdAt'>): Promise<void> {
  await setDoc(PENDING_DOC, { ...release, createdAt: new Date().toISOString() });
}

/** Writes appConfig/version directly, bypassing the Play Store production-track
 *  check — for emergencies/testing. Also clears any pending release so the
 *  scheduled checker doesn't later overwrite it with stale data. */
export async function publishVersionNow(version: PublishedVersion): Promise<void> {
  await setDoc(VERSION_DOC, version);
  await deleteDoc(PENDING_DOC).catch(() => {});
}
