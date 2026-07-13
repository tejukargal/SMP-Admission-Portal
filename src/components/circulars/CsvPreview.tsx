import { useEffect, useState } from 'react';
import { AutoScrollViewer } from './AutoScrollViewer';

interface CsvPreviewProps {
  url: string;
  /** Department/category text color class, e.g. "text-blue-700" — literal, from departments.ts or a fixed fallback. */
  accentText?: string;
  /** Department/category left-border color class, e.g. "border-l-blue-500". */
  accentBorder?: string;
}

/** Compact scrolling-rows preview for CSV attachments — SMP Connect style:
 *  each row rendered as a small card of "Header: value" lines. */
export function CsvPreview({ url, accentText = 'text-gray-700', accentBorder = 'border-l-gray-400' }: CsvPreviewProps) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error('fetch failed'); return r.text(); })
      .then((text) => {
        if (cancelled) return;
        const parsed = text.split(/\r?\n/)
          .filter((line) => line.trim() !== '')
          .map((line) => line.split(/,|\t/).map((cell) => cell.trim().replace(/^"|"$/g, '')));
        setRows(parsed);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [url]);

  if (error) return null;
  if (!rows) return <p className="text-xs text-gray-400 text-center py-8">Loading preview…</p>;
  if (rows.length === 0) return null;

  const [headers, ...dataRows] = rows;
  if (dataRows.length === 0) return null;

  return (
    <AutoScrollViewer>
      <div className="p-2 space-y-1.5">
        {dataRows.map((row, i) => (
          <div key={i} className={`rounded-lg border-l-4 ${accentBorder} bg-white shadow-sm px-3 py-2`}>
            {row.map((cell, j) => (
              <p key={j} className="text-xs leading-relaxed">
                <span className={`font-bold ${accentText}`}>{headers[j] ?? `Col ${j + 1}`}:</span>{' '}
                <span className="text-gray-800 font-medium">{cell || '—'}</span>
              </p>
            ))}
          </div>
        ))}
      </div>
    </AutoScrollViewer>
  );
}
