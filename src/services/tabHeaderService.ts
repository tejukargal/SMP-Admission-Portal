// Admin-side generation/upload for the student portal's per-tab header
// background images — same generate → preview → upload flow as
// circularService's background helpers, but keyed by a fixed tab identity
// (there are only ever 6 of these, not one per document) and saved to a
// single shared config doc instead of a per-circular field.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage, app } from '../config/firebase';
import { imageExtensionFor, imageUploadMetadata } from './imageUpload';

const functions = getFunctions(app, 'asia-south1');

export type TabHeaderKey = 'home' | 'circulars' | 'profile' | 'fees' | 'certificates' | 'notices';

export const TAB_HEADER_TABS: { key: TabHeaderKey; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'circulars', label: 'Circulars' },
  { key: 'profile', label: 'Profile' },
  { key: 'fees', label: 'Fee History' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'notices', label: 'Notices' },
];

/** An AI-generated background image held in memory, not yet uploaded to Storage. */
export interface PendingTabHeaderBackground {
  base64: string;
  mimeType: string;
  /** Home only: the deep same-hue hex the student app draws the greeting and
   *  name in over this image's pastel background. */
  textColor?: string;
}

export type TabHeaderBackgrounds = Partial<Record<TabHeaderKey, string>>;

/** Reads the currently-saved header background URLs, keyed by tab. */
export async function getTabHeaderBackgrounds(): Promise<TabHeaderBackgrounds> {
  const snap = await getDoc(doc(db, 'appConfig', 'tabHeaders'));
  return snap.exists() ? (snap.data() as TabHeaderBackgrounds) : {};
}

/** Calls the generateTabHeaderBackground Cloud Function — returns image bytes only, nothing is persisted yet. */
export async function generateTabHeaderBackground(tabKey: TabHeaderKey): Promise<PendingTabHeaderBackground> {
  const fn = httpsCallable<{ tabKey: TabHeaderKey }, { imageBase64: string; mimeType: string; textColor?: string }>(
    functions,
    'generateTabHeaderBackground',
  );
  const result = await fn({ tabKey });
  return { base64: result.data.imageBase64, mimeType: result.data.mimeType, textColor: result.data.textColor };
}

/** Uploads an accepted AI-generated background and saves its download URL onto the shared appConfig/tabHeaders doc.
 *  For Home, also saves `homeTextColor` beside it — the pastel is random each generation, so the student app needs
 *  the matching deep tone to draw the greeting/name in. */
export async function setTabHeaderBackground(tabKey: TabHeaderKey, background: PendingTabHeaderBackground): Promise<string> {
  // Timestamped for the same reason as uploadCircularBackground: a
  // regenerated header must get a new URL, not new bytes behind the old one.
  const path = `tabHeaderBackgrounds/${tabKey}-${Date.now()}.${imageExtensionFor(background.mimeType)}`;
  const sref = storageRef(storage, path);
  await uploadString(sref, background.base64, 'base64', imageUploadMetadata(background.mimeType));
  const url = await getDownloadURL(sref);
  const patch: Record<string, string> = { [tabKey]: url };
  if (tabKey === 'home' && background.textColor) patch.homeTextColor = background.textColor;
  await setDoc(doc(db, 'appConfig', 'tabHeaders'), patch, { merge: true });
  return url;
}
