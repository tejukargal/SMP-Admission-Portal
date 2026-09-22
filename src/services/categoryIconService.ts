// Admin-side generation/upload for the student portal's Overview-tile /
// Recent-Activity category icons — same generate → preview → upload flow as
// tabHeaderService's header backgrounds, but keyed by a fixed category
// identity (there are only ever 4 of these) and saved to a single shared
// config doc instead of a per-circular field.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage, app } from '../config/firebase';
import { imageExtensionFor, imageUploadMetadata } from './imageUpload';

const functions = getFunctions(app, 'asia-south1');

export type CategoryIconKey = 'circulars' | 'notices' | 'fees' | 'certificates' | 'dailyBriefing' | 'scholarships';

export const CATEGORY_ICON_TABS: { key: CategoryIconKey; label: string }[] = [
  { key: 'circulars', label: 'Circulars' },
  { key: 'notices', label: 'Notices' },
  { key: 'fees', label: 'Fees' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'dailyBriefing', label: 'Daily Briefing banner' },
  { key: 'scholarships', label: 'Scholarships banner' },
];

/** Keys that back the two full-width Home banners rather than a square
 *  Overview tile — generated 16:9 and shown as a short wide strip. */
export const BANNER_ICON_KEYS: readonly CategoryIconKey[] = ['dailyBriefing', 'scholarships'];

/** An AI-generated icon image held in memory, not yet uploaded to Storage. */
export interface PendingCategoryIcon {
  base64: string;
  mimeType: string;
  /** Banner keys only: whether the AI-picked solid background colour is dark
   *  enough that the student app should render light/white text over it. */
  textIsLight?: boolean;
  /** Tile keys only (circulars/notices/fees/certificates): the deep, legible
   *  hex the student app should use for that tile's label/value text — the
   *  match for whichever pastel background the AI randomly picked this
   *  generation (see functions/src/index.ts's CATEGORY_ICON_TILE_PALETTES). */
  labelColor?: string;
}

export type CategoryIcons = Partial<Record<CategoryIconKey, string>>;

/** Reads the currently-saved category icon URLs, keyed by category. */
export async function getCategoryIcons(): Promise<CategoryIcons> {
  const snap = await getDoc(doc(db, 'appConfig', 'categoryIcons'));
  return snap.exists() ? (snap.data() as CategoryIcons) : {};
}

/** Calls the generateCategoryIcon Cloud Function — returns image bytes only, nothing is persisted yet. */
export async function generateCategoryIcon(key: CategoryIconKey): Promise<PendingCategoryIcon> {
  const fn = httpsCallable<
    { key: CategoryIconKey },
    { imageBase64: string; mimeType: string; textIsLight?: boolean; labelColor?: string }
  >(functions, 'generateCategoryIcon');
  const result = await fn({ key });
  return {
    base64: result.data.imageBase64,
    mimeType: result.data.mimeType,
    textIsLight: result.data.textIsLight,
    labelColor: result.data.labelColor,
  };
}

/** Uploads an accepted AI-generated icon and saves its download URL onto the shared appConfig/categoryIcons doc.
 *  For a banner key, also saves `{key}TextIsLight` alongside the URL. For a tile key, saves `{key}LabelColor`
 *  instead. Both exist because the AI-picked background colour is random each generation, so the student app
 *  needs to know which one was picked — a light/dark toggle for the banners' mixed-lightness pool, or the exact
 *  matching text hex for the tiles' always-pastel pool. */
export async function setCategoryIcon(key: CategoryIconKey, icon: PendingCategoryIcon): Promise<string> {
  // Timestamped for the same reason as uploadCircularBackground: a
  // regenerated icon must get a new URL, not new bytes behind the old one.
  const path = `categoryIcons/${key}-${Date.now()}.${imageExtensionFor(icon.mimeType)}`;
  const sref = storageRef(storage, path);
  await uploadString(sref, icon.base64, 'base64', imageUploadMetadata(icon.mimeType));
  const url = await getDownloadURL(sref);
  const patch: Record<string, string | boolean> = { [key]: url };
  if (BANNER_ICON_KEYS.includes(key)) patch[`${key}TextIsLight`] = icon.textIsLight ?? false;
  if (icon.labelColor) patch[`${key}LabelColor`] = icon.labelColor;
  await setDoc(doc(db, 'appConfig', 'categoryIcons'), patch, { merge: true });
  return url;
}
