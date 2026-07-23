import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Circular } from '../../types';
import { departmentMeta } from '../../utils/departments';
import { renderHtmlContent, formatBytes, formatCircularDate, attachmentKind } from '../../utils/htmlContent';
import { AttachmentPreview } from '../../components/circulars/AttachmentPreview';
import type { TabKey } from './StudentPortal';

interface CircularDetailState {
  circular: Circular;
  fromTab?: TabKey;
}

export function CircularDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as CircularDetailState | null;

  useEffect(() => {
    if (!state?.circular) navigate('/portal', { replace: true });
  }, [state, navigate]);

  if (!state?.circular) return null;

  const { circular } = state;
  const meta = departmentMeta(circular.department);

  return (
    <div className="font-portal min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/portal', { state: { activeTab: state.fromTab ?? 'circulars' } })}
            aria-label="Back"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-none">Circular</p>
            <h1 className="text-sm font-bold text-gray-900 leading-tight mt-0.5 truncate">{circular.title}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header info */}
          <div className="bg-gray-50 border-b border-gray-200 px-4 sm:px-5 py-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {circular.department}
              </span>
              {circular.pinned && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 3c-.6 0-1 .4-1 1v6.2l-2.5 2.5V6a1 1 0 0 0-2 0v6.7L8 15.2V17h8v-1.8l-2.5-2.5V6.9L16 4.7V13a1 1 0 0 0 2 0V4c0-.6-.4-1-1-1z"/><path d="M11 17v4a1 1 0 0 0 2 0v-4z"/></svg>
                  Pinned
                </span>
              )}
              <span className="flex items-center gap-1 text-gray-500 text-[11px]">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {formatCircularDate(circular.date)}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-snug mt-2">{circular.title}</h2>
          </div>

          {/* Body */}
          <div className="px-4 sm:px-5 py-4 space-y-4">
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
      </div>
    </div>
  );
}
