// Shared bits for uploading AI-generated background images to Storage.
// The Cloud Functions re-encode every generated image as WebP; keep the
// object extension honest about the bytes, and mark them immutable so the
// student app (and any HTTP cache in between) never re-fetches a URL it has
// already seen — regenerated images always get a *new* URL rather than
// overwriting the bytes behind an existing one.
import type { UploadMetadata } from 'firebase/storage';

export const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export function imageExtensionFor(mimeType: string): string {
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'png';
}

export function imageUploadMetadata(mimeType: string): UploadMetadata {
  return { contentType: mimeType, cacheControl: IMAGE_CACHE_CONTROL };
}
