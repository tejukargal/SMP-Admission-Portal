import { useMemo, useState } from 'react';
import type { StudentLoginActivity } from '../../types';
import { MsgModal, SearchPill, StatusPill, EmptyState, MsgIcon, MINT, CYAN, VIOLET, MUTED } from './messagesUi';

const DAY_MS = 24 * 60 * 60 * 1000;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface ActiveUsersModalProps {
  activity: StudentLoginActivity[];
  loading: boolean;
  onClose: () => void;
}

export function ActiveUsersModal({ activity, loading, onClose }: ActiveUsersModalProps) {
  const [search, setSearch] = useState('');
  const [now] = useState(() => Date.now());

  const counts = useMemo(() => {
    let online = 0, today = 0, week = 0;
    for (const a of activity) {
      if (a.online) online++;
      const ageMs = now - new Date(a.lastLoginAt).getTime();
      if (ageMs <= DAY_MS) today++;
      if (ageMs <= 7 * DAY_MS) week++;
    }
    return { online, today, week, total: activity.length };
  }, [activity, now]);

  const filtered = useMemo(() => {
    let rows = activity;
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      rows = rows.filter((a) =>
        a.studentName.toUpperCase().includes(q) ||
        a.regNumber.toUpperCase().includes(q));
    }
    return rows.slice().sort((a, b) => {
      if (!!a.online !== !!b.online) return a.online ? -1 : 1;
      return b.lastLoginAt.localeCompare(a.lastLoginAt);
    });
  }, [activity, search]);

  const COUNT_PILLS = [
    { label: 'Online Now', value: counts.online, c: MINT, solid: true },
    { label: 'Logged In Today', value: counts.today, c: CYAN },
    { label: 'This Week', value: counts.week, c: VIOLET },
    { label: 'Total Ever Logged In', value: counts.total, c: MUTED },
  ];
  const TH = 'px-3 py-2 text-left text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#0E6A85] whitespace-nowrap';

  return (
    <MsgModal
      title="Student Portal — Active Users"
      icon={<MsgIcon name="users" size={15} />}
      tone={MINT}
      size="xl"
      onClose={onClose}
      bodyClassName=""
      subtitle={
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {COUNT_PILLS.map((p) => (
              <span
                key={p.label}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                style={p.solid
                  ? { background: p.c, borderColor: p.c, color: '#fff' }
                  : { background: `${p.c}0F`, borderColor: `${p.c}40`, color: p.c === MUTED ? '#5B6371' : p.c }}
              >
                {p.solid && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                {p.label}: <span className="font-semibold tabular-nums">{p.value}</span>
              </span>
            ))}
          </div>
          <SearchPill value={search} onChange={setSearch} placeholder="Search name / reg no…" className="w-full" />
        </div>
      }
    >
      {loading ? (
        <EmptyState loading>Loading…</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>No student logins recorded yet.</EmptyState>
      ) : (
        <table className="min-w-full text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#ECF7FA] shadow-[inset_0_-1px_0_#CBE8F0]">
            <tr>
              <th className={TH}>Status</th>
              <th className={TH}>Name</th>
              <th className={TH}>Reg No</th>
              <th className={TH}>Course</th>
              <th className={TH}>Year</th>
              <th className={TH}>Last Login</th>
              <th className={TH}>Logins</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECF7FA]">
            {filtered.map((a) => (
              <tr key={a.id} className="hover:bg-[#F3FAFC] transition-colors">
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusPill color={a.online ? MINT : MUTED}>{a.online ? 'Online' : 'Offline'}</StatusPill>
                </td>
                <td className="px-3 py-2 font-medium text-[#262B35] whitespace-nowrap">{a.studentName || '—'}</td>
                <td className="px-3 py-2 text-[#5B6371] tabular-nums whitespace-nowrap">{a.regNumber || '—'}</td>
                <td className="px-3 py-2 text-[#3F4654] whitespace-nowrap">{a.course || '—'}</td>
                <td className="px-3 py-2 text-[#3F4654] whitespace-nowrap">{a.year || '—'}</td>
                <td className="px-3 py-2 text-[#5B6371] tabular-nums whitespace-nowrap">{formatWhen(a.lastLoginAt)}</td>
                <td className="px-3 py-2 text-[#5B6371] tabular-nums whitespace-nowrap">{a.loginCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </MsgModal>
  );
}
