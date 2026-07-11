import { useMemo, useState } from 'react';
import type { StudentLoginActivity } from '../../types';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold text-gray-900">Student Portal — Active Users</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer">&times;</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              Online Now: {counts.online}
            </span>
            <span className="rounded-full bg-sky-50 border border-sky-200 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
              Logged In Today: {counts.today}
            </span>
            <span className="rounded-full bg-violet-50 border border-violet-200 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
              This Week: {counts.week}
            </span>
            <span className="rounded-full bg-gray-100 border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
              Total Ever Logged In: {counts.total}
            </span>
          </div>
          <input
            type="text"
            placeholder="Search name / reg no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="text-sm text-gray-400 text-center py-10">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-10">No student logins recorded yet.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100 text-xs">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Reg No</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Course</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Year</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Last Login</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Logins</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${a.online ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${a.online ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {a.online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{a.studentName || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{a.regNumber || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{a.course || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{a.year || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatWhen(a.lastLoginAt)}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{a.loginCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
