import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AppSettings, AcademicYear } from '../types';

let cachedSettings: AppSettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

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

  cachedSettings = toSettings(snap.data());
  cacheTimestamp = now;
  return cachedSettings;
}

function toSettings(data: Record<string, unknown>): AppSettings {
  return {
    id: 'app_settings',
    currentAcademicYear: data['currentAcademicYear'] as AcademicYear,
    updatedAt: (data['updatedAt'] as string | undefined) ?? new Date().toISOString(),
  };
}

/**
 * Live listener on the settings doc. Keeps the module cache in sync so a year
 * change made in Settings (this tab, another tab or another device) reaches
 * every consumer immediately instead of waiting out the cache TTL.
 */
export function subscribeSettings(
  onChange: (settings: AppSettings | null) => void,
  onError: (err: Error) => void,
): () => void {
  const ref = doc(db, 'settings', SETTINGS_DOC_ID);
  return onSnapshot(
    ref,
    (snap) => {
      cachedSettings = snap.exists() ? toSettings(snap.data()) : null;
      cacheTimestamp = Date.now();
      onChange(cachedSettings);
    },
    onError,
  );
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
