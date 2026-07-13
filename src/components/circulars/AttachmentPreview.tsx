import type { StoredAttachment } from '../../types';
import { ImagePreview } from './ImagePreview';
import { PdfPreview } from './PdfPreview';
import { CsvPreview } from './CsvPreview';

interface AttachmentPreviewProps {
  attachment: StoredAttachment;
  accentText?: string;
  accentBorder?: string;
}

function previewKind(att: StoredAttachment): 'image' | 'pdf' | 'csv' | null {
  const name = att.name.toLowerCase();
  if (att.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (att.type.startsWith('image/') || /\.(jpe?g|png)$/.test(name)) return 'image';
  if (att.type === 'text/csv' || name.endsWith('.csv')) return 'csv';
  return null;
}

/** Dispatches to the right compact preview for a Storage attachment — PDF
 *  (rendered pages), image (JPG/PNG), or CSV (scrolling rows). Renders
 *  nothing for other file types; the download row above is always shown
 *  regardless. */
export function AttachmentPreview({ attachment, accentText, accentBorder }: AttachmentPreviewProps) {
  switch (previewKind(attachment)) {
    case 'image': return <ImagePreview url={attachment.url} name={attachment.name} />;
    case 'pdf': return <PdfPreview url={attachment.url} />;
    case 'csv': return <CsvPreview url={attachment.url} accentText={accentText} accentBorder={accentBorder} />;
    default: return null;
  }
}
