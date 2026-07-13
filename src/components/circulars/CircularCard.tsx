import type { Circular } from '../../types';
import { departmentMeta } from '../../utils/departments';
import { stripHtml, formatCircularDate } from '../../utils/htmlContent';

interface CircularCardProps {
  circular: Circular;
  onClick: () => void;
  index: number;
  unread?: boolean;
}

/** Department-colored circular card — SMP Connect design: tinted background,
 *  colored left accent, department pill, title/subject/preview + footer. */
export function CircularCard({ circular, onClick, index, unread }: CircularCardProps) {
  const meta = departmentMeta(circular.department);
  const preview = stripHtml(circular.body);
  const attachmentCount = circular.attachments?.length ?? 0;

  return (
    <div
      onClick={onClick}
      style={{ animation: 'content-enter 0.3s ease-out both', animationDelay: `${Math.min(index, 12) * 0.05}s` }}
      className={`${meta.cardBg} border border-gray-100 border-l-4 ${meta.borderL} rounded-xl shadow-md hover:shadow-xl transition-shadow cursor-pointer overflow-hidden group`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${meta.pill}`}>
              {circular.department}
            </span>
            {unread && (
              <span className="inline-flex items-center rounded-full bg-red-500 text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">New</span>
            )}
          </span>
          <span className="flex items-center gap-1 text-gray-500 text-[11px] shrink-0">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {formatCircularDate(circular.date)}
          </span>
        </div>

        <h3 className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
          {circular.title}
        </h3>
        <p className={`text-xs ${meta.text} font-semibold mt-1 line-clamp-2`}>{circular.subject}</p>
        {preview && <p className="text-xs text-gray-600 mt-2 line-clamp-3">{preview}</p>}

        <div className="flex items-center justify-between pt-2.5 mt-3 border-t border-gray-200/70">
          {attachmentCount > 0 ? (
            <span className="flex items-center gap-1 text-gray-500 text-[11px]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              {attachmentCount} attachment{attachmentCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-[11px] text-gray-400">No attachments</span>
          )}
          <span className="text-blue-600 text-xs font-semibold group-hover:underline">View Details →</span>
        </div>
      </div>
    </div>
  );
}
