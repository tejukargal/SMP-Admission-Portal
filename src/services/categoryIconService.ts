// Admin-side generation/upload for the student portal's Overview-tile /
// Recent-Activity category icons — same generate → preview → upload flow as
// tabHeaderService's header backgrounds, but keyed by a fixed category
// identity (there are only ever 4 of these) and saved to a single shared
// config doc instead of a per-circular field.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage, app } from '../config/firebase';

const functions = getFunctions(app, 'asia-south1');

export type CategoryIconKey = 'circulars' | 'notices' | 'fees' | 'certificates';

export const CATEGORY_ICON_TABS: { key: CategoryIconKey; label: string }[] = [
  { key: 'circulars', label: 'Circulars' },
  { key: 'notices', label: 'Notices' },
  { key: 'fees', label: 'Fees' },
  { key: 'certificates', label: 'Certificates' },
];

/** An AI-generated icon image held in memory, not yet uploaded to Storage. */
export interface PendingCategoryIcon {
  base64: string;
  mimeType: string;
}

export type CategoryIcons = Partial<Record<CategoryIconKey, string>>;

/** Reads the currently-saved category icon URLs, keyed by category. */
export async function getCategoryIcons(): Promise<CategoryIcons> {
  const snap = await getDoc(doc(db, 'appConfig', 'categoryIcons'));
  return snap.exists() ? (snap.data() as CategoryIcons) : {};
}

/** Calls the generateCategoryIcon Cloud Function — returns image bytes only, nothing is persisted yet. */
export async function generateCategoryIcon(key: CategoryIconKey): Promise<PendingCategoryIcon> {
  const fn = httpsCallable<{ key: CategoryIconKey }, { imageBase64: string; mimeType: string }>(
    functions,
    'generateCategoryIcon',
  );
  const result = await fn({ key });
  return { base64: result.data.imageBase64, mimeType: result.data.mimeType };
}

/** Uploads an accepted AI-generated icon and saves its download URL onto the shared appConfig/categoryIcons doc. */
export async function setCategoryIcon(key: CategoryIconKey, icon: PendingCategoryIcon): Promise<string> {
  const ext = icon.mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const path = `categoryIcons/${key}.${ext}`;
  const sref = storageRef(storage, path);
  await uploadString(sref, icon.base64, 'base64', { contentType: icon.mimeType });
  const url = await getDownloadURL(sref);
  await setDoc(doc(db, 'appConfig', 'categoryIcons'), { [key]: url }, { merge: true });
  return url;
}
