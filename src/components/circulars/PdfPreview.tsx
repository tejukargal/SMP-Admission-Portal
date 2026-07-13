import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AutoScrollViewer } from './AutoScrollViewer';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const MAX_PREVIEW_PAGES = 15;
const RENDER_WIDTH = 560; // px — compact preview width

interface PdfPreviewProps {
  url: string;
}

/** Compact slowly-scrolling preview for PDF attachments — renders each page
 *  to a canvas at a small fixed width (capped at MAX_PREVIEW_PAGES pages). */
export function PdfPreview({ url }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [truncated, setTruncated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;

    async function render() {
      try {
        const pdf = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled || !container) return;
        const pageCount = Math.min(pdf.numPages, MAX_PREVIEW_PAGES);
        if (pdf.numPages > MAX_PREVIEW_PAGES) setTruncated(true);

        for (let i = 1; i <= pageCount; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = RENDER_WIDTH / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'block mx-auto mb-2 rounded shadow-sm bg-white';
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
        if (!cancelled) setStatus('ready');
      } catch (err) {
        console.error('[PdfPreview] failed to render', url, err);
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load');
          setStatus('error');
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
      if (container) container.innerHTML = '';
    };
  }, [url]);

  if (status === 'error') {
    return <p className="text-xs text-gray-400 text-center py-8">Preview unavailable ({errorMessage}) — use the download button above.</p>;
  }

  return (
    <div>
      <AutoScrollViewer>
        <div ref={containerRef} className="p-2">
          {status === 'loading' && <p className="text-xs text-gray-400 text-center py-8">Loading preview…</p>}
        </div>
      </AutoScrollViewer>
      {truncated && (
        <p className="text-[10px] text-gray-400 mt-1">Showing first {MAX_PREVIEW_PAGES} pages — open the file to view all pages.</p>
      )}
    </div>
  );
}
