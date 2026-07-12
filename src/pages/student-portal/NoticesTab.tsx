import type { Notice } from '../../types';

const CATEGORY_STYLE: Record<Notice['category'], string> = {
  fee: 'bg-red-50 text-red-700 border-red-200',
  document: 'bg-amber-50 text-amber-700 border-amber-200',
  general: 'bg-sky-50 text-sky-700 border-sky-200',
};

const CATEGORY_LABEL: Record<Notice['category'], string> = {
  fee: 'Fee', document: 'Documents', general: 'General',
};

const CATEGORY_BORDER: Record<Notice['category'], string> = {
  fee: 'border-l-red-400',
  document: 'border-l-amber-400',
  general: 'border-l-sky-400',
};

interface NoticesTabProps {
  notices: Notice[];
  loading: boolean;
}

export function NoticesTab({ notices, loading }: NoticesTabProps) {
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

  // Active notices first (newest first within each group), Inactive ("finished") below.
  const sorted = notices.slice().sort((a, b) => {
    if (!!a.inactiveAt !== !!b.inactiveAt) return a.inactiveAt ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <div className="space-y-2.5">
      {sorted.map((n) => (
        <div key={n.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 border-l-4 ${n.inactiveAt ? 'opacity-60 border-l-gray-300' : CATEGORY_BORDER[n.category]}`}>
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
          <h4 className="text-sm font-bold text-gray-900">{n.title}</h4>
          <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{n.body}</p>
        </div>
      ))}
    </div>
  );
}
