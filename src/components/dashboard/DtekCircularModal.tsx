import type { DtekCircular } from '../../services/dtekNewsService';
import { formatIsoDate } from '../../utils/formatDates';
import { PERI, PERI_INK, PERI_BAND, PERI_BAND_BORDER, PERI_DIVIDER, INK, MUTED, FAINT, AMBER, pastel } from './dashTokens';

interface Props {
  circular: DtekCircular;
  onClose: () => void;
}

/** Full detail for one departmental circular: the AI's summary, its highlights,
 *  and the reference number and link an admin needs to pull the original. */
export function DtekCircularModal({ circular, onClose }: Props) {
  return (
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
      <div className="absolute inset-0 bg-[#1E2340]/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        className="relative rounded-2xl border border-[#DADFFA] bg-white shadow-[0_24px_60px_rgba(63,75,184,0.18)] w-full max-w-lg mx-4 overflow-hidden max-h-[85vh] flex flex-col"
        style={{ animation: 'modal-enter 0.25s ease-out' }}
      >
        <div className="px-5 py-3.5 flex items-start justify-between gap-3 border-b shrink-0" style={{ background: PERI_BAND, borderColor: PERI_BAND_BORDER }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-full border bg-white px-2.5 py-[4px] text-[10.5px] font-medium uppercase tracking-[0.6px] leading-none" style={{ borderColor: `${PERI}66`, color: PERI_INK }}>
                {circular.category}
              </span>
              <span className="text-xs font-medium tabular-nums" style={{ color: FAINT }}>
                {circular.date ? formatIsoDate(circular.date) : circular.dateText || 'Undated'}
              </span>
            </div>
            {circular.referenceNo && (
              <p className="text-[11px] mt-1.5 font-medium tabular-nums" style={{ color: FAINT }}>{circular.referenceNo}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full w-6 h-6 flex items-center justify-center text-[#8A93A3] hover:text-[#3F4BB8] hover:bg-white/70 transition-colors text-sm leading-none cursor-pointer shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          <div>
            <p className="text-[14px] font-medium leading-snug" style={{ color: INK }}>{circular.title}</p>
            {circular.titleKn && <p className="text-sm mt-1" style={{ color: MUTED }}>{circular.titleKn}</p>}
          </div>

          {circular.actionRequired && (
            <p className="text-xs font-medium border rounded-xl px-3 py-2" style={pastel(AMBER)}>
              Action needed
              {circular.actionByText ? ` — ${circular.actionByText}` : ''}
            </p>
          )}

          {circular.summary && (
            <p className="text-[13px] leading-relaxed" style={{ color: INK }}>{circular.summary}</p>
          )}
          {circular.summaryKn && (
            <p className="text-[13px] leading-relaxed border-t pt-3" style={{ color: MUTED, borderColor: PERI_DIVIDER }}>
              {circular.summaryKn}
            </p>
          )}

          {circular.highlights.length > 0 && (
            <div>
              <p className="text-[9px] font-medium uppercase tracking-[1px] mb-1.5" style={{ color: FAINT }}>Key points</p>
              <ul className="space-y-1">
                {circular.highlights.map((h, i) => (
                  <li key={i} className="text-[13px] flex gap-2" style={{ color: INK }}>
                    <span className="shrink-0" style={{ color: PERI }}>•</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              {(circular.highlightsKn ?? []).length > 0 && (
                <ul className="space-y-1 mt-2.5 border-t pt-2.5" style={{ borderColor: PERI_DIVIDER }}>
                  {(circular.highlightsKn ?? []).map((h, i) => (
                    <li key={i} className="text-[13px] flex gap-2" style={{ color: MUTED }}>
                      <span className="shrink-0" style={{ color: PERI }}>•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {circular.affects && (
            <p className="text-xs" style={{ color: MUTED }}>
              <span className="font-medium" style={{ color: FAINT }}>Affects:</span> {circular.affects}
            </p>
          )}

          {circular.url && (
            <a
              href={circular.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs font-medium hover:underline break-all"
              style={{ color: PERI_INK }}
            >
              Open the original circular →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
