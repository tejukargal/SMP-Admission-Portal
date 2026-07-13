import { useMemo, useState } from 'react';
import type { Circular, Department } from '../../types';
import { CircularCard } from '../../components/circulars/CircularCard';
import { CircularModal } from '../../components/circulars/CircularModal';
import { DepartmentFilterChips } from '../../components/circulars/DepartmentFilterChips';
import { circularSeenKey } from '../../utils/htmlContent';

interface CircularsTabProps {
  circulars: Circular[];      // already filtered of archivedAt by StudentPortal
  loading: boolean;
  seenIds: Set<string>;       // keyed by circularSeenKey(c), i.e. id+updatedAt — not plain ids
}

/** Student-facing Circulars tab — SMP Connect design: department filter chips
 *  + colored cards + full-detail modal. All students see all circulars. */
export function CircularsTab({ circulars, loading, seenIds }: CircularsTabProps) {
  const [activeDept, setActiveDept] = useState<Department>('All');
  const [selected, setSelected] = useState<Circular | null>(null);

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
    // Newest circular date first; ties broken by creation time.
    return [...filtered].sort((a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [circulars, activeDept]);

  if (loading) return <div className="text-sm text-gray-400 text-center py-10">Loading circulars…</div>;

  if (circulars.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 px-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-100 to-cyan-100 border border-teal-100 flex items-center justify-center text-teal-600">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-500">No circulars right now.</p>
          <p className="text-xs text-gray-400 mt-0.5">College circulars and announcements will appear here.</p>
        </div>
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
              onClick={() => setSelected(c)}
            />
          ))}
        </div>
      )}

      {selected && <CircularModal circular={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
