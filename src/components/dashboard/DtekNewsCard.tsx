import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublishedDtekNews, type DtekCircular, type DtekNewsRecord } from '../../services/dtekNewsService';
import { formatIsoDate, formatIsoDateTime, daysAgo } from '../../utils/formatDates';
import { PERI, PERI_INK, PERI_BORDER, PERI_BAND, PERI_BAND_BORDER, FAINT, INK, MUTED, AMBER, pastel } from './dashTokens';

const CARD_BG = '#FFFFFF';
const CARD_BORDER = PERI_BORDER;

/** Past this, the digest is old enough that the header says so — the
 *  department circulates often, so a stale digest misleads. */
const STALE_AFTER_DAYS = 14;

/** The Insights & Recent Activity row above measures ~273px (its bar chart is
 *  148px plus header, legend and axis labels). Sitting just above that keeps
 *  this reading as a peer of that row instead of a slab, and the circular list
 *  scrolls inside rather than pushing the page down as the digest grows. */
const CARD_H = 300;

const CATEGORY_HEX: Record<string, string> = {
  Circular: '#7B7F8C',
  Exams: '#8B5CF6',
  Admissions: '#0EA5E9',
  Academics: '#14B8A6',
  Administration: '#64748B',
  Recruitment: PERI,
  Finance: '#10B981',
  Other: '#7B7F8C',
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
      className="rounded-2xl border overflow-hidden flex flex-col transition-shadow hover:shadow-[0_4px_16px_rgba(63,75,184,0.07)]"
      style={{ height: CARD_H, backgroundColor: CARD_BG, borderColor: CARD_BORDER }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-2.5 border-b shrink-0"
        style={{ background: PERI_BAND, borderColor: PERI_BAND_BORDER }}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-[0.8px]" style={{ color: PERI_INK }}>
            Departmental Circulars
          </span>
          {news && (
            <span className="text-[10px] font-medium truncate" style={{ color: FAINT }}>
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
            className="text-[10.5px] font-medium rounded-full border border-[#6B7CF6]/45 bg-white px-3 py-[5px] hover:bg-[#6B7CF6]/[0.08] transition-colors shrink-0"
            style={{ color: PERI_INK }}
          >
            Refresh
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-xs font-medium px-4 py-5" style={{ color: FAINT }}>Loading…</p>
      ) : !news ? (
        <div className="px-4 py-5 flex-1">
          <p className="text-xs font-medium" style={{ color: MUTED }}>No DTEK news published yet.</p>
          {isAdmin && (
            <Link to="/settings?tab=dtek-news" className="text-xs font-medium hover:underline" style={{ color: PERI_INK }}>
              Fetch the latest circulars →
            </Link>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 flex-1 min-h-0 overflow-y-auto">
          {publishedAge !== null && publishedAge > STALE_AFTER_DAYS && (
            <p className="text-[10.5px] font-medium rounded-lg border px-2.5 py-1 mb-2.5" style={pastel(AMBER)}>
              Last refreshed {formatIsoDateTime(news.publishedAt)} — the department may have circulated more since.
            </p>
          )}
          {news.overviewEn && (
            <p className="text-[11.5px] font-medium leading-snug mb-2.5 line-clamp-2" style={{ color: MUTED }}>{news.overviewEn}</p>
          )}

          <div className="space-y-2.5">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center gap-2 mb-1 sticky top-0 py-0.5" style={{ background: CARD_BG }}>
                  <span className="text-[9px] font-medium uppercase tracking-[1px] shrink-0" style={{ color: FAINT }}>
                    {group.label}
                  </span>
                  <span className="flex-1 border-t" style={{ borderColor: '#EBEEFB' }} />
                </div>
                <div className="space-y-1">
                  {group.items.map((circular, i) => (
                    <button
                      key={`${group.key}-${i}`}
                      type="button"
                      onClick={() => onOpen(circular)}
                      className="w-full text-left rounded-xl border border-transparent px-2.5 py-1.5 hover:bg-[#F5F6FF] hover:border-[#DADFFA] transition-colors cursor-pointer"
                    >
                      <p className="text-[11.5px] font-medium leading-snug line-clamp-2" style={{ color: INK }}>{circular.title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="text-[10px] font-medium px-2 py-[3px] rounded-full border leading-none" style={pastel(CATEGORY_HEX[circular.category] ?? CATEGORY_HEX.Other)}>
                          {circular.category}
                        </span>
                        {circular.actionRequired && (
                          <span className="text-[10px] font-medium px-2 py-[3px] rounded-full border leading-none" style={pastel(AMBER)}>
                            {circular.actionBy ? `Action by ${formatIsoDate(circular.actionBy)}` : 'Action needed'}
                          </span>
                        )}
                        {circular.affects && (
                          <span className="text-[10px] truncate" style={{ color: FAINT }}>{circular.affects}</span>
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
