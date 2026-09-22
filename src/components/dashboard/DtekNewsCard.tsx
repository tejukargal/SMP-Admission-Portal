import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublishedDtekNews, type DtekCircular, type DtekNewsRecord } from '../../services/dtekNewsService';
import { formatIsoDate, formatIsoDateTime, daysAgo } from '../../utils/formatDates';

const SAND = '#F5EDE0';
const AMBER = '#E0AE4E';
const DARK_AMBER = '#6B4F1D';
const CARD_BORDER = 'rgba(0,0,0,0.1)';

/** Past this, the digest is old enough that the header says so — the
 *  department circulates often, so a stale digest misleads. */
const STALE_AFTER_DAYS = 14;

/** The Insights & Recent Activity row above measures ~273px (its bar chart is
 *  148px plus header, legend and axis labels). Sitting just above that keeps
 *  this reading as a peer of that row instead of a slab, and the circular list
 *  scrolls inside rather than pushing the page down as the digest grows. */
const CARD_H = 300;

const CATEGORY_CLASS: Record<string, string> = {
  Circular: 'bg-gray-100 text-gray-600',
  Exams: 'bg-violet-50 text-violet-700',
  Admissions: 'bg-sky-50 text-sky-700',
  Academics: 'bg-teal-50 text-teal-700',
  Administration: 'bg-slate-100 text-slate-600',
  Recruitment: 'bg-indigo-50 text-indigo-700',
  Finance: 'bg-emerald-50 text-emerald-700',
  Other: 'bg-gray-100 text-gray-600',
};

/** Groups circulars under their printed date, newest first. Undated ones fall
 *  into a final group rather than being dropped — a real circular may carry no
 *  readable date, and it is still worth showing. */
function groupByDate(circulars: DtekCircular[]): { key: string; label: string; items: DtekCircular[] }[] {
  const groups = new Map<string, DtekCircular[]>();
  for (const c of circulars) {
    const key = c.date ?? '';
    const existing = groups.get(key);
    if (existing) existing.push(c);
    else groups.set(key, [c]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)))
    .map(([key, items]) => ({ key, label: key ? formatIsoDate(key) : 'Undated', items }));
}

interface Props {
  onOpen: (circular: DtekCircular) => void;
  /** Settings is admin-only routing, so staff get no link into it — it would
   *  just bounce them back to the Dashboard. */
  isAdmin: boolean;
}

/** Dashboard section showing the admin-published digest of Department of
 *  Technical Education circulars, grouped by date. Read-only: refreshing it is
 *  an AI call that costs money, so that stays behind the Settings review flow. */
export function DtekNewsCard({ onOpen, isAdmin }: Props) {
  const [news, setNews] = useState<DtekNewsRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPublishedDtekNews()
      .then((data) => { if (!cancelled) setNews(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const publishedAge = news ? daysAgo(news.publishedAt) : null;
  const groups = news ? groupByDate(news.circulars) : [];

  return (
    <div
      className="rounded-2xl border overflow-hidden flex flex-col"
      style={{ height: CARD_H, backgroundColor: SAND, borderColor: CARD_BORDER, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-black/10 shrink-0"
        style={{ background: AMBER }}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: DARK_AMBER }}>
            Departmental Circulars
          </span>
          {news && (
            <span className="text-[10px] truncate" style={{ color: DARK_AMBER, opacity: 0.75 }}>
              {news.circulars.length} item{news.circulars.length === 1 ? '' : 's'}
              {' · '}
              {publishedAge !== null && publishedAge > 0
                ? `${publishedAge} day${publishedAge === 1 ? '' : 's'} ago`
                : 'today'}
            </span>
          )}
        </div>
        {isAdmin && (
          <Link
            to="/settings?tab=dtek-news"
            className="text-[10px] font-bold uppercase tracking-wider rounded-md px-2 py-1 bg-white/60 hover:bg-white/90 transition-colors shrink-0"
            style={{ color: DARK_AMBER }}
          >
            Refresh
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-gray-500 px-4 py-5">Loading…</p>
      ) : !news ? (
        <div className="px-4 py-5 flex-1">
          <p className="text-xs text-gray-600">No DTEK news published yet.</p>
          {isAdmin && (
            <Link to="/settings?tab=dtek-news" className="text-xs font-semibold hover:underline" style={{ color: DARK_AMBER }}>
              Fetch the latest circulars →
            </Link>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 flex-1 min-h-0 overflow-y-auto">
          {publishedAge !== null && publishedAge > STALE_AFTER_DAYS && (
            <p className="text-[10px] font-semibold text-amber-800 bg-amber-100/70 rounded-md px-2 py-1 mb-2.5">
              Last refreshed {formatIsoDateTime(news.publishedAt)} — the department may have circulated more since.
            </p>
          )}
          {news.overviewEn && (
            <p className="text-[11px] text-gray-700 leading-snug mb-2.5 line-clamp-2">{news.overviewEn}</p>
          )}

          <div className="space-y-2.5">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center gap-2 mb-1 sticky top-0 py-0.5" style={{ background: SAND }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color: DARK_AMBER }}>
                    {group.label}
                  </span>
                  <span className="flex-1 border-t" style={{ borderColor: 'rgba(107,79,29,0.18)' }} />
                </div>
                <div className="space-y-1">
                  {group.items.map((circular, i) => (
                    <button
                      key={`${group.key}-${i}`}
                      type="button"
                      onClick={() => onOpen(circular)}
                      className="w-full text-left rounded-lg px-2.5 py-1.5 bg-white/55 hover:bg-white/90 transition-colors cursor-pointer"
                    >
                      <p className="text-[11px] font-medium text-gray-800 leading-snug line-clamp-2">{circular.title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CATEGORY_CLASS[circular.category] ?? CATEGORY_CLASS.Other}`}>
                          {circular.category}
                        </span>
                        {circular.actionRequired && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            {circular.actionBy ? `Action by ${formatIsoDate(circular.actionBy)}` : 'Action needed'}
                          </span>
                        )}
                        {circular.affects && (
                          <span className="text-[10px] text-gray-500 truncate">{circular.affects}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
