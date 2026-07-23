import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Circular, Department } from '../../types';
import { CircularCard } from '../../components/circulars/CircularCard';
import { DepartmentFilterChips } from '../../components/circulars/DepartmentFilterChips';
import { circularSeenKey } from '../../utils/htmlContent';

interface CircularsTabProps {
  circulars: Circular[];      // already filtered of archivedAt by StudentPortal
  loading: boolean;
  seenIds: Set<string>;       // keyed by circularSeenKey(c), i.e. id+updatedAt — not plain ids
  onShareApp: () => void;
}

/** Student-facing Circulars tab — SMP Connect design: department filter chips
 *  + colored cards + full-detail modal. All students see all circulars. */
export function CircularsTab({ circulars, loading, seenIds, onShareApp }: CircularsTabProps) {
  const navigate = useNavigate();
  const [activeDept, setActiveDept] = useState<Department>('All');

  const counts = useMemo(() => {
    const map: Partial<Record<Department, number>> = { All: circulars.length };
    for (const c of circulars) {
      if (c.department === 'All') continue; // 'All' circulars appear under every chip; counted in the All total
      map[c.department] = (map[c.department] ?? 0) + 1;
    }
    return map;
  }, [circulars]);

  const visible = useMemo(() => {
    const filtered = activeDept === 'All'
      ? circulars
      : circulars.filter((c) => c.department === activeDept || c.department === 'All');
    // Pinned circulars first, then newest circular date; ties broken by creation time.
    return [...filtered].sort((a, b) =>
      (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [circulars, activeDept]);

  if (loading) return <div className="text-sm text-gray-400 text-center py-10">Loading circulars…</div>;

  if (circulars.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center justify-center gap-3 py-14 px-6">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-500">No circulars right now.</p>
            <p className="text-xs text-gray-400 mt-0.5">College circulars and announcements will appear here.</p>
          </div>
        </div>
        <ShareAppButton onClick={onShareApp} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DepartmentFilterChips counts={counts} active={activeDept} onChange={setActiveDept} />

      {visible.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No circulars for this department.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map((c, i) => (
            <CircularCard
              key={c.id}
              circular={c}
              index={i}
              unread={!seenIds.has(circularSeenKey(c))}
              onClick={() => navigate('/portal/circular', { state: { circular: c, fromTab: 'circulars' } })}
            />
          ))}
        </div>
      )}

      <ShareAppButton onClick={onShareApp} />
    </div>
  );
}

function ShareAppButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full sm:w-auto sm:mx-auto flex items-center justify-center gap-2 rounded-full border-2 border-gray-200 bg-white text-gray-700 hover:bg-gray-50 px-4 py-2 text-sm font-semibold transition-colors cursor-pointer group"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
      Share this app link to friends
    </button>
  );
}
