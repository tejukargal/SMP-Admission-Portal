import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../config/firebase';

const functions = getFunctions(app, 'asia-south1');

export interface PublishedVersion {
  latestVersion: string;
  updateUrl: string;
  /** "What's new" for latestVersion — one item per line; shown on the app's update card. */
  releaseNotes?: string;
  /** Set by the sendAppUpdateReminder Cloud Function. */
  lastUpdateReminderAt?: string;
  updateReminderCount?: number;
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
export async function publishVersionNow(version: Pick<PublishedVersion, 'latestVersion' | 'updateUrl'>): Promise<void> {
  // merge — keeps the release notes and reminder history on the same doc.
  await setDoc(VERSION_DOC, version, { merge: true });
  await deleteDoc(PENDING_DOC).catch(() => {});
}

/** Saves the "What's new" list shown on the student app's update card. */
export async function saveReleaseNotes(releaseNotes: string): Promise<void> {
  await setDoc(VERSION_DOC, { releaseNotes }, { merge: true });
}

export interface UpdateReminderResult {
  students: number;
  devices: number;
  upToDate: number;
  latestVersion: string;
  sent: boolean;
}

/** Calls sendAppUpdateReminder — pushes an update reminder to every device on
 *  an older app version (dryRun: only counts them). */
export async function sendAppUpdateReminder(input: { title: string; body: string; dryRun?: boolean }): Promise<UpdateReminderResult> {
  const fn = httpsCallable<typeof input, UpdateReminderResult>(functions, 'sendAppUpdateReminder');
  return (await fn(input)).data;
}
