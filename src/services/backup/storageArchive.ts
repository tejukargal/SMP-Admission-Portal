import { getBlob, getMetadata, listAll, ref, type StorageReference } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { loadZip } from '../../utils/lazyLibs';
import { STORAGE_PREFIXES } from './registry';
import type { ProgressFn } from './exportBackup';

export interface ArchivedFile {
  path: string;
  size: number;
  contentType: string;
}

export interface FilesManifest {
  createdAt: string;
  files: ArchivedFile[];
  failed: { path: string; error: string }[];
  note: string;
}

async function listRecursive(r: StorageReference): Promise<StorageReference[]> {
  const res = await listAll(r);
  const nested = await Promise.all(res.prefixes.map(listRecursive));
  return [...res.items, ...nested.flat()];
}

/** Every `storagePath` string anywhere in the backup — a fallback for when
 *  Storage refuses to list a folder. */
export function storagePathsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) storagePathsIn(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'storagePath' && typeof v === 'string' && v) out.add(v);
      else storagePathsIn(v, out);
    }
  }
  return out;
}

/** Downloads every file under the known Storage folders. */
async function collectFiles(knownPaths: Set<string>, onProgress?: ProgressFn) {
  onProgress?.({ stage: 'Listing uploaded files…', done: 0, total: 1 });
  const refs: StorageReference[] = [];
  const failed: { path: string; error: string }[] = [];
  for (const prefix of STORAGE_PREFIXES) {
    try {
      refs.push(...(await listRecursive(ref(storage, prefix))));
    } catch (err) {
      failed.push({ path: `${prefix}/ (listing)`, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const seen = new Set(refs.map((r) => r.fullPath));
  for (const p of knownPaths) if (!seen.has(p)) { refs.push(ref(storage, p)); seen.add(p); }

  const files: { meta: ArchivedFile; data: Uint8Array }[] = [];
  let bytes = 0;
  const CONCURRENCY = 6;
  let next = 0;
  async function worker() {
    while (next < refs.length) {
      const r = refs[next++];
      try {
        const [blob, md] = await Promise.all([getBlob(r), getMetadata(r).catch(() => null)]);
        const data = new Uint8Array(await blob.arrayBuffer());
        bytes += data.byteLength;
        files.push({ meta: { path: r.fullPath, size: data.byteLength, contentType: md?.contentType ?? blob.type }, data });
      } catch (err) {
        failed.push({ path: r.fullPath, error: err instanceof Error ? err.message : String(err) });
      }
      onProgress?.({
        stage: `Downloading files… ${(bytes / 1024 / 1024).toFixed(1)} MB`,
        done: files.length + failed.length,
        total: refs.length,
      });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  files.sort((a, b) => a.meta.path.localeCompare(b.meta.path));
  return { files, failed };
}

/**
 * Builds one ZIP: backup.json + backup.xlsx + files/<storage path> +
 * files-manifest.json. The files are a safekeeping copy — restore only reads
 * backup.json (re-uploading would mint new download tokens and break the
 * links stored in Firestore).
 */
export async function buildBackupZip(
  json: string,
  xlsx: Uint8Array | null,
  includeFiles: boolean,
  onProgress?: ProgressFn,
  knownPaths: Set<string> = new Set(),
): Promise<{ blob: Blob; manifest: FilesManifest | null }> {
  const { zipSync, strToU8 } = await loadZip();
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    'backup.json': [strToU8(json), { level: 6 }],
  };
  if (xlsx) entries['backup.xlsx'] = [xlsx, { level: 0 }];

  let manifest: FilesManifest | null = null;
  if (includeFiles) {
    const { files, failed } = await collectFiles(knownPaths, onProgress);
    for (const f of files) entries[`files/${f.meta.path}`] = [f.data, { level: 0 }];
    manifest = {
      createdAt: new Date().toISOString(),
      files: files.map((f) => f.meta),
      failed,
      note: 'Paths mirror Firebase Storage. Files are for safekeeping; restore uses backup.json only.',
    };
    entries['files-manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];
  }

  onProgress?.({ stage: 'Packing ZIP…', done: 1, total: 1 });
  const zipped = zipSync(entries);
  return { blob: new Blob([zipped as BlobPart], { type: 'application/zip' }), manifest };
}
