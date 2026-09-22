import type { DtekCircular } from '../../services/dtekNewsService';
import { formatIsoDate } from '../../utils/formatDates';

interface Props {
  circular: DtekCircular;
  onClose: () => void;
}

/** Full detail for one departmental circular: the AI's summary, its highlights,
 *  and the reference number and link an admin needs to pull the original. */
export function DtekCircularModal({ circular, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        className="relative rounded-2xl border-2 border-amber-200 bg-amber-50 shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[85vh] flex flex-col"
        style={{ animation: 'modal-enter 0.25s ease-out' }}
      >
        <div className="px-5 py-3.5 flex items-start justify-between gap-3 border-b border-amber-200 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border border-amber-200 bg-white/70 text-amber-800">
                {circular.category}
              </span>
              <span className="text-xs font-semibold text-gray-500">
                {circular.date ? formatIsoDate(circular.date) : circular.dateText || 'Undated'}
              </span>
            </div>
            {circular.referenceNo && (
              <p className="text-[11px] text-gray-500 mt-1 font-mono">{circular.referenceNo}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          <div>
            <p className="text-sm font-semibold text-gray-800 leading-snug">{circular.title}</p>
            {circular.titleKn && <p className="text-sm text-gray-600 mt-1">{circular.titleKn}</p>}
          </div>

          {circular.actionRequired && (
            <p className="text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
              Action needed
              {circular.actionByText ? ` — ${circular.actionByText}` : ''}
            </p>
          )}

          {circular.summary && (
            <p className="text-sm text-gray-700 leading-relaxed">{circular.summary}</p>
          )}
          {circular.summaryKn && (
            <p className="text-sm text-gray-600 leading-relaxed border-t border-amber-200/70 pt-3">
              {circular.summaryKn}
            </p>
          )}

          {circular.highlights.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Key points</p>
              <ul className="space-y-1">
                {circular.highlights.map((h, i) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-amber-600 shrink-0">•</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              {(circular.highlightsKn ?? []).length > 0 && (
                <ul className="space-y-1 mt-2.5 border-t border-amber-200/70 pt-2.5">
                  {(circular.highlightsKn ?? []).map((h, i) => (
                    <li key={i} className="text-sm text-gray-600 flex gap-2">
                      <span className="text-amber-500 shrink-0">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {circular.affects && (
            <p className="text-xs text-gray-600">
              <span className="font-semibold text-gray-500">Affects:</span> {circular.affects}
            </p>
          )}

          {circular.url && (
            <a
              href={circular.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs font-semibold text-amber-800 hover:underline break-all"
            >
              Open the original circular →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
