import type { StudentNotification } from '../../types';

const TYPE_LABEL: Record<StudentNotification['type'], string> = {
  'fee-paid': 'Fee Payment',
  'fee-dues-updated': 'Fee Update',
  'profile-updated': 'Profile Update',
  'status-changed': 'Admission Status',
  'allotted-category': 'Allotted Category',
};

const TYPE_DOT: Record<StudentNotification['type'], string> = {
  'fee-paid': 'bg-emerald-500',
  'fee-dues-updated': 'bg-amber-500',
  'profile-updated': 'bg-blue-500',
  'status-changed': 'bg-violet-500',
  'allotted-category': 'bg-sky-500',
};

interface NotificationModalProps {
  notifications: StudentNotification[];
  onClose: () => void;
}

export function NotificationModal({ notifications, onClose }: NotificationModalProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-[backdrop-enter_0.2s_ease-out]" aria-hidden="true" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col animate-[modal-enter_0.25s_ease-out]">
        <div className="px-4 py-3 border-b border-gray-200 shrink-0 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-gray-900 text-white shadow-sm flex items-center justify-center shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </span>
          <div>
            <h3 className="text-sm font-bold text-gray-900">What's New</h3>
            <p className="text-[11px] text-gray-400">
              {notifications.length} update{notifications.length !== 1 ? 's' : ''} to your record since you last checked
            </p>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5">
          {notifications.map((n, idx) => (
            <div
              key={n.id}
              style={{ animation: 'content-enter 0.3s ease-out both', animationDelay: `${Math.min(idx, 12) * 0.05}s` }}
              className="bg-gray-50 rounded-xl border border-gray-200 p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600">
                  <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[n.type]}`} />
                  {TYPE_LABEL[n.type]}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(n.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <h4 className="text-xs font-bold text-gray-900">{n.title}</h4>
              <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{n.message}</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 shrink-0">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold py-2 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
