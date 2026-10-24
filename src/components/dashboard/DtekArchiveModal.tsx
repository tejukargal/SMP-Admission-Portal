import { useState } from 'react';
import type { DtekCircular } from '../../services/dtekNewsService';
import { useDtekArchive } from '../../hooks/useDtekArchive';
import { groupByDate, matchesDtekSearch } from '../../utils/dtekGroups';
import { formatIsoDate } from '../../utils/formatDates';
import { PERI_INK, PERI_BAND, PERI_BAND_BORDER, INK, MUTED, FAINT, AMBER, DTEK_CATEGORY_HEX, pastel } from './dashTokens';

interface Props {
  onOpen: (circular: DtekCircular) => void;
  onClose: () => void;
}

/** Every DTEK circular published so far, grouped by date and paged from
 *  dtekCirculars. Picking one hands it to the usual DtekCircularModal, which
 *  the Dashboard renders after this so it stacks on top. */
export function DtekArchiveModal({ onOpen, onClose }: Props) {
  const archive = useDtekArchive(true);
  const [search, setSearch] = useState('');
  const groups = groupByDate(archive.items.filter((c) => matchesDtekSearch(c, search)));

  return (
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
      <div className="absolute inset-0 bg-[#1E2340]/30" onClick={onClose} aria-hidden="true" />
      <div
        className="relative rounded-2xl border border-[#DADFFA] bg-white shadow-[0_24px_60px_rgba(63,75,184,0.18)] w-full max-w-lg mx-4 overflow-hidden max-h-[85vh] flex flex-col"
        style={{ animation: 'modal-enter 0.25s ease-out' }}
      >
        <div className="px-5 py-3.5 flex items-center justify-between gap-3 border-b shrink-0" style={{ background: PERI_BAND, borderColor: PERI_BAND_BORDER }}>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.8px]" style={{ color: PERI_INK }}>Previous Circulars</p>
            <p className="text-[10.5px] font-medium mt-0.5" style={{ color: FAINT }}>
              {archive.items.length} loaded{archive.hasMore ? ' · more available' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full w-6 h-6 flex items-center justify-center text-[#8A93A3] hover:text-[#3F4BB8] hover:bg-white/70 transition-colors text-sm leading-none cursor-pointer shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 pt-3 shrink-0">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, order number, category…"
            className="block w-full rounded-xl border border-[#DADFFA] px-3 py-1.5 text-xs font-medium bg-white placeholder-[#A0A6B5] focus:outline-none focus:ring-2 focus:ring-[#6B7CF6]/30"
            style={{ color: INK }}
          />
        </div>

        <div className="px-5 py-3 overflow-auto space-y-2.5">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-1 sticky top-0 py-0.5 bg-white">
                <span className="text-[9px] font-medium uppercase tracking-[1px] shrink-0" style={{ color: FAINT }}>{group.label}</span>
                <span className="flex-1 border-t" style={{ borderColor: '#EBEEFB' }} />
              </div>
              <div className="space-y-1">
                {group.items.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onOpen(c)}
                    className="w-full text-left rounded-xl border border-transparent px-2.5 py-1.5 hover:bg-[#F5F6FF] hover:border-[#DADFFA] transition-colors cursor-pointer"
                  >
                    <p className="text-[11.5px] font-medium leading-snug line-clamp-2" style={{ color: INK }}>{c.title}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="text-[10px] font-medium px-2 py-[3px] rounded-full border leading-none" style={pastel(DTEK_CATEGORY_HEX[c.category] ?? DTEK_CATEGORY_HEX.Other)}>
                        {c.category}
                      </span>
                      {c.actionRequired && (
                        <span className="text-[10px] font-medium px-2 py-[3px] rounded-full border leading-none" style={pastel(AMBER)}>
                          {c.actionBy ? `Action by ${formatIsoDate(c.actionBy)}` : 'Action needed'}
                        </span>
                      )}
                      {c.referenceNo && <span className="text-[10px] truncate tabular-nums" style={{ color: FAINT }}>{c.referenceNo}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {!archive.loading && archive.items.length === 0 && !archive.error && (
            <p className="text-xs font-medium" style={{ color: MUTED }}>No previous circulars yet — they are kept from the next publish onwards.</p>
          )}
          {archive.items.length > 0 && groups.length === 0 && (
            <p className="text-xs font-medium" style={{ color: MUTED }}>
              No loaded circulars match “{search}”.{archive.hasMore ? ' Load more to search further back.' : ''}
            </p>
          )}
          {archive.error && <p className="text-xs font-medium text-red-500">{archive.error}</p>}
          {archive.loading && <p className="text-xs font-medium" style={{ color: FAINT }}>Loading…</p>}
          {archive.hasMore && !archive.loading && (
            <button
              type="button"
              onClick={() => void archive.loadMore()}
              className="text-[10.5px] font-medium rounded-full border border-[#6B7CF6]/45 bg-white px-3 py-[5px] hover:bg-[#6B7CF6]/[0.08] transition-colors cursor-pointer"
              style={{ color: PERI_INK }}
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
