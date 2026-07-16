import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Circular } from '../../types';
import { departmentMeta } from '../../utils/departments';
import { renderHtmlContent, formatBytes, formatCircularDate, attachmentKind } from '../../utils/htmlContent';
import { AttachmentPreview } from './AttachmentPreview';

interface CircularModalProps {
  circular: Circular;
  onClose: () => void;
  /** Extra classes for the portal root — student portal passes 'font-portal'; admin leaves it unset. */
  className?: string;
}

/** Full-detail circular modal — SMP Connect design: fixed department-tinted
 *  header, scrollable body (Subject + Details + downloadable attachments). */
export function CircularModal({ circular, onClose, className = '' }: CircularModalProps) {
  const meta = departmentMeta(circular.department);

  // Lock body scroll while open; Escape closes.
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
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 ${className}`}>
      <div className="absolute inset-0 bg-black/50" style={{ animation: 'backdrop-enter 0.18s ease-out' }} onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        style={{ animation: 'modal-enter 0.22s ease-out' }}
        role="dialog"
        aria-modal="true"
        aria-label={circular.title}
      >
        {/* Fixed header */}
        <div className="bg-gray-50 border-b border-gray-200 px-4 sm:px-5 py-3.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {circular.department}
              </span>
              <span className="flex items-center gap-1 text-gray-500 text-[11px]">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {formatCircularDate(circular.date)}
              </span>
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-white/70 hover:text-gray-800 transition-colors cursor-pointer shrink-0"
              aria-label="Close"
            >
              <svg className="w-4.5 h-4.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-snug mt-2">{circular.title}</h2>
        </div>

        {/* Scrollable body */}
        <div className="circular-scroll-body flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Subject</p>
            <p className="text-sm font-semibold text-gray-500">{circular.subject}</p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Details</p>
            <div
              className="text-sm text-gray-700 leading-relaxed break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1.5"
              dangerouslySetInnerHTML={renderHtmlContent(circular.body)}
            />
          </div>

          {(circular.attachments?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                Attachments ({circular.attachments.length})
              </p>
              <div className="space-y-3">
                {circular.attachments.map((att) => {
                  const isCsv = attachmentKind(att) === 'csv';
                  return (
                    <div key={att.storagePath} className="space-y-1.5">
                      {isCsv ? (
                        <div className="flex items-center gap-3 p-3 bg-white border-2 border-gray-200 rounded-xl">
                          <svg className="w-8 h-8 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                          </svg>
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-sm text-gray-900 truncate">{att.name}</span>
                            <span className="block text-xs text-gray-500">{att.type || 'file'} · {formatBytes(att.size)} · Preview only</span>
                          </span>
                        </div>
                      ) : (
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={att.name}
                          className="flex items-center gap-3 p-3 bg-white border-2 border-gray-200 rounded-xl hover:shadow-md transition-shadow group"
                        >
                          <svg className="w-8 h-8 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                          </svg>
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-sm text-gray-900 truncate">{att.name}</span>
                            <span className="block text-xs text-gray-500">{att.type || 'file'} · {formatBytes(att.size)}</span>
                          </span>
                          <svg className="w-4.5 h-4.5 text-gray-500 opacity-70 group-hover:opacity-100 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                        </a>
                      )}
                      <AttachmentPreview attachment={att} accentText="text-gray-500" accentBorder="border-l-gray-400" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
