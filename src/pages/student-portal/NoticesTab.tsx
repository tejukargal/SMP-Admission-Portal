import { useMemo, useState } from 'react';
import type { Notice, NoticeCategory } from '../../types';
import { NoticeDetailModal } from './NoticeDetailModal';

const CATEGORY_STYLE: Record<Notice['category'], string> = {
  fee: 'bg-red-50 text-red-700 border-red-200',
  document: 'bg-amber-50 text-amber-700 border-amber-200',
  general: 'bg-sky-50 text-sky-700 border-sky-200',
};

const CATEGORY_LABEL: Record<Notice['category'], string> = {
  fee: 'Fee', document: 'Documents', general: 'General',
};

const CATEGORY_BORDER: Record<Notice['category'], string> = {
  fee: 'border-l-red-300',
  document: 'border-l-amber-300',
  general: 'border-l-sky-300',
};

const CATEGORY_CARD_BG: Record<Notice['category'], string> = {
  fee: 'bg-red-50/40',
  document: 'bg-amber-50/40',
  general: 'bg-sky-50/40',
};

const CATEGORY_CHIP_ACTIVE: Record<Notice['category'], string> = {
  fee: 'bg-red-100 text-red-700 border-red-300',
  document: 'bg-amber-100 text-amber-700 border-amber-300',
  general: 'bg-sky-100 text-sky-700 border-sky-300',
};

const CATEGORY_ORDER: NoticeCategory[] = ['fee', 'document', 'general'];

interface NoticesTabProps {
  notices: Notice[];
  loading: boolean;
}

export function NoticesTab({ notices, loading }: NoticesTabProps) {
  const [activeCategory, setActiveCategory] = useState<NoticeCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Notice | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: notices.length };
    for (const n of notices) map[n.category] = (map[n.category] ?? 0) + 1;
    return map;
  }, [notices]);

  // Search + category filter applied first, then the existing sort:
  // Active notices first (newest first within each group), Inactive ("finished") below.
  const sorted = useMemo(() => {
    let rows = notices;
    if (activeCategory !== 'all') rows = rows.filter((n) => n.category === activeCategory);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      rows = rows.filter((n) => n.title.toUpperCase().includes(q) || n.body.toUpperCase().includes(q));
    }
    return rows.slice().sort((a, b) => {
      if (!!a.inactiveAt !== !!b.inactiveAt) return a.inactiveAt ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [notices, activeCategory, search]);

  if (loading) return <div className="text-sm text-gray-400 text-center py-10">Loading notices…</div>;
  if (notices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 px-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 border border-amber-100 flex items-center justify-center text-amber-600">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-500">No notices right now.</p>
          <p className="text-xs text-gray-400 mt-0.5">Announcements from the office will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          type="text"
          placeholder="Search notices…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`w-full rounded-full border border-amber-200 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 bg-white shadow-sm text-gray-800 placeholder:text-gray-400 placeholder:font-normal transition-all duration-150 pl-8 ${search ? 'pr-8' : 'pr-3'}`}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-amber-400 hover:bg-amber-500 text-white transition-colors duration-150"
            aria-label="Clear search"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        <button
          onClick={() => setActiveCategory('all')}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${activeCategory === 'all' ? 'bg-gray-700 text-white border-gray-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          All
          <span className={`rounded-full px-1.5 py-px text-[9px] font-bold ${activeCategory === 'all' ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'}`}>{counts.all ?? 0}</span>
        </button>
        {CATEGORY_ORDER.filter((c) => (counts[c] ?? 0) > 0).map((c) => (
          <button
            key={c}
            onClick={() => setActiveCategory(c)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${activeCategory === c ? CATEGORY_CHIP_ACTIVE[c] : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {CATEGORY_LABEL[c]}
            <span className={`rounded-full px-1.5 py-px text-[9px] font-bold ${activeCategory === c ? 'bg-white/60' : 'bg-gray-100 text-gray-500'}`}>{counts[c] ?? 0}</span>
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No notices match your search.</p>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((n, i) => (
            <div
              key={n.id}
              onClick={() => setSelected(n)}
              style={{ animation: 'content-enter 0.3s ease-out both', animationDelay: `${Math.min(i, 12) * 0.05}s` }}
              className={`rounded-xl border border-gray-100 shadow-md hover:shadow-xl transition-shadow cursor-pointer group p-4 border-l-4 ${n.inactiveAt ? 'bg-white opacity-60 border-l-gray-300' : `${CATEGORY_CARD_BG[n.category]} ${CATEGORY_BORDER[n.category]}`}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${CATEGORY_STYLE[n.category]}`}>
                    {CATEGORY_LABEL[n.category]}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${n.inactiveAt ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                    {n.inactiveAt ? 'Inactive' : 'Active'}
                  </span>
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(n.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{n.title}</h4>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap line-clamp-3">{n.body}</p>
              <div className="flex items-center justify-between pt-2 mt-2.5 border-t border-gray-200/70">
                {(n.attachments?.length ?? 0) > 0 ? (
                  <span className="flex items-center gap-1 text-gray-500 text-[11px]">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                    {n.attachments!.length} attachment{n.attachments!.length !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span aria-hidden="true" />
                )}
                <span className="text-blue-600 text-xs font-semibold group-hover:underline">View Details →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <NoticeDetailModal notice={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
