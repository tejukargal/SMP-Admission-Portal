import { useEffect, useMemo, useState } from 'react';
import type { DocEntry, DocHistoryEntry } from '../../types';
import { REQUIRED_DOCS } from '../../types';
import { getDocHistory, hasCopyType, statusOf } from '../../services/studentDocumentService';
import { Svg } from './docsUi';
import { DOC_TONE, STATUS_META, fmtDay, fmtTime, localDayOf, shortUser } from './docsTokens';
import { Icon } from './docsIcons';

const LABEL = Object.fromEntries(REQUIRED_DOCS.map((d) => [d.key, d.label])) as Record<string, string>;

function copyWord(e: DocEntry): string {
  return e.copyType === 'copy' ? 'Copy' : 'Original';
}

/** Human sentence for one audit entry. */
function describe(h: DocHistoryEntry): string {
  const { before: b, after: a } = h;
  const withCopy = hasCopyType(h.docKey) ? ` (${copyWord(a)})` : '';
  switch (h.action) {
    case 'received':    return `Marked received${withCopy}, dated ${fmtDay(a.submittedOn)}`;
    case 'returned':    return `Returned to student on ${fmtDay(a.returnedOn)}`;
    case 'unreturned':  return 'Back with the college (return undone)';
    case 'pending':     return 'Reset to pending';
    case 'notRequired': return 'Marked not required';
    case 'required':    return 'Marked required again';
    case 'copyType':    return `Changed to ${copyWord(a)}`;
    case 'remarks':     return a.remarks ? `Remark: “${a.remarks}”` : 'Remark cleared';
    case 'date':
      if (a.returnedOn !== b.returnedOn) return `Return date changed ${fmtDay(b.returnedOn)} → ${fmtDay(a.returnedOn)}`;
      return `Received date changed ${fmtDay(b.submittedOn)} → ${fmtDay(a.submittedOn)}`;
    case 'undo':        return `Undo — restored to ${STATUS_META[statusOf(a)].label}`;
    default:            return 'Updated';
  }
}

export function DocHistoryPanel({ studentId, refreshKey }: { studentId: string; refreshKey: string }) {
  const [loaded, setLoaded] = useState<{ id: string; items: DocHistoryEntry[] | null; error: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDocHistory(studentId)
      .then((rows) => { if (!cancelled) setLoaded({ id: studentId, items: rows, error: '' }); })
      .catch(() => { if (!cancelled) setLoaded({ id: studentId, items: null, error: 'Could not load the change history.' }); });
    return () => { cancelled = true; };
  }, [studentId, refreshKey]);

  // Keep showing the previous list while a refresh loads (no flicker after each save).
  const current = loaded?.id === studentId ? loaded : null;
  const items = current?.items ?? null;
  const error = current?.error ?? '';

  const groups = useMemo(() => {
    const map = new Map<string, DocHistoryEntry[]>();
    for (const h of items ?? []) {
      const day = localDayOf(h.at);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(h);
    }
    return [...map.entries()];
  }, [items]);

  if (error) {
    return <div className="py-16 text-center text-[13px]" style={{ color: DOC_TONE.coral }}>{error}</div>;
  }
  if (!items) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 !rounded-xl" />)}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="py-14 flex flex-col items-center gap-2 text-center">
        <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: DOC_TONE.wash, color: DOC_TONE.accent }}>
          <Svg size={20}>{Icon.history}</Svg>
        </span>
        <p className="text-[13px] font-medium" style={{ color: DOC_TONE.text }}>No changes recorded yet</p>
        <p className="text-[12px] max-w-xs" style={{ color: DOC_TONE.muted }}>
          Every change from now on is logged here with who made it and when. Entries can't be edited or removed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ animation: 'content-enter 0.22s ease-out' }}>
      <p className="flex items-center gap-1.5 text-[11.5px]" style={{ color: DOC_TONE.muted }}>
        <Svg size={12}>{Icon.shield}</Svg>
        Tamper-proof log — entries can't be edited or deleted.
      </p>
      {groups.map(([day, rows]) => (
        <section key={day}>
          <h4 className="text-[11px] font-medium uppercase tracking-[0.7px] mb-2" style={{ color: DOC_TONE.faint }}>{fmtDay(day)}</h4>
          <ol className="relative border-l ml-[7px] space-y-2.5" style={{ borderColor: DOC_TONE.line }}>
            {rows.map((h) => {
              const m = STATUS_META[statusOf(h.after)];
              return (
                <li key={h.id} className="pl-4 relative">
                  <span
                    className="absolute -left-[5px] top-[7px] w-[9px] h-[9px] rounded-full"
                    style={{ background: m.color, boxShadow: `0 0 0 3px ${m.wash}` }}
                  />
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[12.5px] font-medium" style={{ color: DOC_TONE.text }}>{LABEL[h.docKey] ?? h.docKey}</span>
                    <span className="text-[12.5px]" style={{ color: '#4B5563' }}>{describe(h)}</span>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: DOC_TONE.muted }}>
                    {fmtTime(h.at)} · <span title={h.byEmail}>{shortUser(h.byEmail) || 'unknown'}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
