import type { Notice } from '../../types';

const CATEGORY_STYLE: Record<Notice['category'], string> = {
  fee: 'bg-red-50 text-red-700 border-red-200',
  document: 'bg-amber-50 text-amber-700 border-amber-200',
  general: 'bg-sky-50 text-sky-700 border-sky-200',
};

const CATEGORY_LABEL: Record<Notice['category'], string> = {
  fee: 'Fee', document: 'Documents', general: 'General',
};

interface NoticesTabProps {
  notices: Notice[];
  loading: boolean;
}

export function NoticesTab({ notices, loading }: NoticesTabProps) {
  if (loading) return <div className="text-sm text-gray-400 text-center py-10">Loading notices…</div>;
  if (notices.length === 0) return <div className="text-sm text-gray-400 text-center py-10">No notices right now.</div>;

  const sorted = notices.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-2.5">
      {sorted.map((n) => (
        <div key={n.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${CATEGORY_STYLE[n.category]}`}>
              {CATEGORY_LABEL[n.category]}
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
