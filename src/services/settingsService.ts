import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AppSettings, AcademicYear } from '../types';

let cachedSettings: AppSettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const SETTINGS_DOC_ID = 'app_settings';

/** Synchronous read — returns cached value instantly if the TTL is still valid. */
export function getCachedSettings(): AppSettings | null {
  return cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL_MS ? cachedSettings : null;
}

export async function getSettings(): Promise<AppSettings | null> {
  const now = Date.now();
  if (cachedSettings && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSettings;
  }

  const ref = doc(db, 'settings', SETTINGS_DOC_ID);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  cachedSettings = {
    id: 'app_settings',
    currentAcademicYear: data['currentAcademicYear'] as AcademicYear,
    updatedAt: data['updatedAt'] ?? new Date().toISOString(),
  };
  cacheTimestamp = now;
  return cachedSettings;
}

export async function saveSettings(currentAcademicYear: AcademicYear): Promise<void> {
  const ref = doc(db, 'settings', SETTINGS_DOC_ID);
  const updatedAt = new Date().toISOString();
  await setDoc(ref, {
    id: SETTINGS_DOC_ID,
    currentAcademicYear,
    updatedAt,
    _serverTimestamp: serverTimestamp(),
  });
  // Invalidate cache
  cachedSettings = null;
  cacheTimestamp = 0;
}
