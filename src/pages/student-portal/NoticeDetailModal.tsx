import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Notice } from '../../types';
import { formatBytes } from '../../utils/htmlContent';
import { AttachmentPreview } from '../../components/circulars/AttachmentPreview';

const CATEGORY_STYLE: Record<Notice['category'], string> = {
  fee: 'bg-red-50 text-red-700 border-red-200',
  document: 'bg-amber-50 text-amber-700 border-amber-200',
  general: 'bg-sky-50 text-sky-700 border-sky-200',
};

const CATEGORY_LABEL: Record<Notice['category'], string> = {
  fee: 'Fee', document: 'Documents', general: 'General',
};

const CATEGORY_HEADER_BG: Record<Notice['category'], string> = {
  fee: 'bg-red-50/60',
  document: 'bg-amber-50/60',
  general: 'bg-sky-50/60',
};

interface NoticeDetailModalProps {
  notice: Notice;
  onClose: () => void;
}

/** Full-detail notice modal — category-tinted header, plain-text body
 *  (notices keep textarea bodies) and downloadable Storage attachments. */
export function NoticeDetailModal({ notice, onClose }: NoticeDetailModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/50" style={{ animation: 'backdrop-enter 0.18s ease-out' }} onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        style={{ animation: 'modal-enter 0.22s ease-out' }}
        role="dialog"
        aria-modal="true"
        aria-label={notice.title}
      >
        <div className={`${CATEGORY_HEADER_BG[notice.category]} border-b border-gray-200 px-4 sm:px-5 py-3.5 shrink-0`}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${CATEGORY_STYLE[notice.category]}`}>
                {CATEGORY_LABEL[notice.category]}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${notice.inactiveAt ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                {notice.inactiveAt ? 'Inactive' : 'Active'}
              </span>
              <span className="text-[11px] text-gray-500">
                {new Date(notice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-white/70 hover:text-gray-800 transition-colors cursor-pointer shrink-0"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-snug mt-2">{notice.title}</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{notice.body}</p>

          {(notice.attachments?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                Attachments ({notice.attachments!.length})
              </p>
              <div className="space-y-3">
                {notice.attachments!.map((att) => (
                  <div key={att.storagePath} className="space-y-1.5">
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={att.name}
                      className="flex items-center gap-3 p-3 bg-white border-2 border-gray-200 rounded-xl hover:shadow-md hover:border-gray-300 transition-all group"
                    >
                      <svg className="w-8 h-8 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-sm text-gray-800 truncate">{att.name}</span>
                        <span className="block text-xs text-gray-500">{att.type || 'file'} · {formatBytes(att.size)}</span>
                      </span>
                      <svg className="w-4.5 h-4.5 text-gray-500 opacity-70 group-hover:opacity-100 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </a>
                    <AttachmentPreview attachment={att} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
