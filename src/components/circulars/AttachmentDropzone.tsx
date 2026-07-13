import { useRef, useState } from 'react';
import type { StoredAttachment } from '../../types';
import { ATTACHMENT_ALLOWED_TYPES, ATTACHMENT_MAX_BYTES, ATTACHMENT_ACCEPT } from '../../services/circularService';
import { formatBytes } from '../../utils/htmlContent';

interface AttachmentDropzoneProps {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  /** Already-uploaded attachments (edit mode). */
  existing?: StoredAttachment[];
  onRemoveExisting?: (index: number) => void;
}

function validateFile(file: File): string | null {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  if (!ATTACHMENT_ALLOWED_TYPES.includes(file.type) && !isCsv) {
    return `Invalid file type: ${file.name}. Only PDF, JPG, PNG and CSV are allowed.`;
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return `File too large: ${file.name}. Maximum size is ${formatBytes(ATTACHMENT_MAX_BYTES)}.`;
  }
  return null;
}

/** Drag-and-drop + click-to-browse file picker with per-file validation.
 *  Shared by the circular compose form and the notice Compose & Send modal. */
export function AttachmentDropzone({ files, onAdd, onRemove, existing, onRemoveExisting }: AttachmentDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      const err = validateFile(file);
      if (err) { setError(err); continue; }
      accepted.push(file);
    }
    if (accepted.length > 0) onAdd(accepted);
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        className={`rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${dragging ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300 bg-gray-50 hover:border-emerald-300 hover:bg-emerald-50/40'}`}
      >
        <svg className="mx-auto w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p className="text-xs font-semibold text-gray-600 mt-1.5">Drop files here or click to browse</p>
        <p className="text-[10px] text-gray-400 mt-0.5">PDF, JPG, PNG or CSV · max {formatBytes(ATTACHMENT_MAX_BYTES)} each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {error && <p className="text-xs text-red-500 font-medium mt-1.5">{error}</p>}

      {(existing?.length ?? 0) > 0 && (
        <ul className="mt-2 space-y-1.5">
          {existing!.map((att, i) => (
            <li key={att.storagePath} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span className="flex-1 min-w-0 truncate text-xs font-medium text-gray-700">{att.name}</span>
              <span className="text-[10px] text-gray-400 shrink-0">{formatBytes(att.size)}</span>
              {onRemoveExisting && (
                <button type="button" onClick={() => onRemoveExisting(i)} className="text-red-400 hover:text-red-600 cursor-pointer shrink-0" aria-label={`Remove ${att.name}`}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2">
              <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span className="flex-1 min-w-0 truncate text-xs font-medium text-gray-700">{file.name}</span>
              <span className="text-[10px] text-gray-400 shrink-0">{formatBytes(file.size)}</span>
              <button type="button" onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600 cursor-pointer shrink-0" aria-label={`Remove ${file.name}`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
