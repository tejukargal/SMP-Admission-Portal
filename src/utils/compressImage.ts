// Shrinks phone photos of letters before they go to Storage. PDFs pass through untouched.

export const STUDENT_FILE_MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const COMPRESS_OVER_BYTES = 400 * 1024;
const MAX_SIDE = 2000;
const JPEG_QUALITY = 0.82;

/** Returns an error message if the file can't be stored as a student file, else null. */
export function validateStudentFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (/\.(heic|heif)$/.test(name) || file.type === 'image/heic' || file.type === 'image/heif') {
    return `${file.name}: HEIC photos aren't supported — save it as JPG or PDF first.`;
  }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `${file.name}: only PDF, JPG and PNG files can be uploaded.`;
  }
  if (file.size > STUDENT_FILE_MAX_BYTES && file.type === 'application/pdf') {
    return `${file.name}: PDF is larger than 10 MB.`;
  }
  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read image ${file.name}`)); };
    img.src = url;
  });
}

/** JPEG/PNG over 400 KB → JPEG, long side ≤ 2000px. Keeps the original if that isn't smaller. */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= COMPRESS_OVER_BYTES) return file;
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.fillStyle = '#fff'; // PNG transparency → white paper, not black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob || blob.size >= file.size) return file;
  const name = file.name.replace(/\.(png|jpe?g)$/i, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
}
