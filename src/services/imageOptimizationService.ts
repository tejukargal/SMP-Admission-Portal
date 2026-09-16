// Admin-side wrapper for the one-off optimizeStoredImages Cloud Function —
// re-encodes every already-stored AI background image (tab headers, category
// icons, circular backgrounds) as a downscaled WebP so the student app stops
// downloading multi-megabyte PNGs on login. Safe to run repeatedly: images
// that are already WebP are reported as skipped.
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../config/firebase';

const functions = getFunctions(app, 'asia-south1');

export interface OptimizeStoredImagesResult {
  converted: { label: string; from: string; to: string; bytesBefore: number; bytesAfter: number }[];
  skipped: { label: string; reason: string }[];
  failed: { label: string; error: string }[];
}

export async function optimizeStoredImages(): Promise<OptimizeStoredImagesResult> {
  const fn = httpsCallable<Record<string, never>, OptimizeStoredImagesResult>(
    functions,
    'optimizeStoredImages',
    // The function converts every image sequentially and can legitimately run
    // for several minutes on a large circulars collection.
    { timeout: 540_000 },
  );
  const result = await fn({});
  return result.data;
}
