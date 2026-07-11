import type { StudentNotification } from '../../types';

const TYPE_LABEL: Record<StudentNotification['type'], string> = {
  'fee-paid': 'Fee Payment',
  'fee-dues-updated': 'Fee Update',
  'profile-updated': 'Profile Update',
  'status-changed': 'Admission Status',
  'allotted-category': 'Allotted Category',
};

const TYPE_STYLE: Record<StudentNotification['type'], string> = {
  'fee-paid': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'fee-dues-updated': 'bg-amber-50 text-amber-700 border-amber-200',
  'profile-updated': 'bg-blue-50 text-blue-700 border-blue-200',
  'status-changed': 'bg-violet-50 text-violet-700 border-violet-200',
  'allotted-category': 'bg-sky-50 text-sky-700 border-sky-200',
};

interface NotificationModalProps {
  notifications: StudentNotification[];
  onClose: () => void;
}

export function NotificationModal({ notifications, onClose }: NotificationModalProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <h3 className="text-sm font-bold text-gray-900">What's New</h3>
          <p className="text-[11px] text-gray-400">
            {notifications.length} update{notifications.length !== 1 ? 's' : ''} to your record since you last checked
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5">
          {notifications.map((n) => (
            <div key={n.id} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${TYPE_STYLE[n.type]}`}>
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
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
