import { useState, type ReactNode } from 'react';
import type { DocKey, DocRecord } from '../../types';
import { DocCard } from './DocCard';
import { Svg } from './docsUi';
import { COLUMN_META, DOC_TONE, STATUS_META, type DocColumnId } from './docsTokens';
import { Icon } from './docsIcons';
import { LABEL, type BoardActions } from './useDocBoard';

interface Props {
  id: DocColumnId;
  keys: DocKey[];
  view: DocRecord;
  selected: ReadonlySet<DocKey>;
  busy: Partial<Record<DocKey, true>>;
  flash: Partial<Record<DocKey, true>>;
  errors: Partial<Record<DocKey, string>>;
  gmHintKey: DocKey | null;
  animateIn: boolean;
  actions: BoardActions;
  onToggleSelect: (key: DocKey) => void;
  onSelectMany: (keys: DocKey[], on: boolean) => void;
  /** Column shortcut shown in the header (e.g. "Receive all"). */
  shortcut?: ReactNode;
  /** Not-required documents (Pending column only). */
  naKeys?: DocKey[];
}

const EMPTY: Record<DocColumnId, { icon: ReactNode; text: string }> = {
  pending:  { icon: Icon.sparkle, text: 'Nothing pending — every required document is in.' },
  held:     { icon: Icon.inbox,   text: 'No documents with the college yet.' },
  returned: { icon: Icon.back,    text: 'No originals handed back.' },
};

export function DocColumn({
  id, keys, view, selected, busy, flash, errors, gmHintKey, animateIn, actions,
  onToggleSelect, onSelectMany, shortcut, naKeys,
}: Props) {
  const meta = COLUMN_META[id];
  const [naOpen, setNaOpen] = useState(true);
  const selCount = keys.filter((k) => selected.has(k)).length;
  const all = keys.length > 0 && selCount === keys.length;
  const some = selCount > 0 && !all;

  return (
    <section
      className="flex flex-col min-h-0 rounded-2xl border overflow-hidden"
      style={{ borderColor: meta.hairline, background: meta.wash }}
      aria-label={`${meta.title} documents`}
    >
      {/* Header */}
      <header className="flex items-center gap-2 px-3 pt-2.5 pb-2 shrink-0">
        <button
          type="button" role="checkbox" aria-checked={all ? true : some ? 'mixed' : false}
          aria-label={`Select all ${meta.title}`} disabled={keys.length === 0}
          onClick={() => onSelectMany(keys, !all)}
          className="w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          style={all || some
            ? { background: DOC_TONE.accent, borderColor: DOC_TONE.accent, color: '#fff' }
            : { borderColor: '#CBD3DD', background: '#fff' }}
        >
          {all && <Svg size={11} strokeWidth={3}>{Icon.check}</Svg>}
          {some && <Svg size={11} strokeWidth={3}>{Icon.minus}</Svg>}
        </button>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[13px] font-semibold" style={{ color: meta.ink }}>{meta.title}</h3>
            <span
              className="min-w-[20px] h-[18px] px-1.5 rounded-full text-[11px] font-medium flex items-center justify-center tabular-nums"
              style={{ background: '#fff', color: meta.ink, border: `1px solid ${meta.color}55` }}
            >
              {keys.length}
            </span>
          </div>
          <p className="text-[10.5px] truncate" style={{ color: DOC_TONE.muted }}>{meta.subtitle}</p>
        </div>
        {shortcut}
      </header>

      {/* Cards */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5 space-y-2" style={{ scrollbarWidth: 'thin' }}>
        {keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 text-center py-6 px-4 rounded-xl border border-dashed" style={{ borderColor: meta.hairline, color: DOC_TONE.faint }}>
            <Svg size={18}>{EMPTY[id].icon}</Svg>
            <span className="text-[11.5px]">{EMPTY[id].text}</span>
          </div>
        ) : keys.map((key, i) => (
          <DocCard
            key={key}
            docKey={key}
            label={LABEL[key]}
            entry={view[key]}
            column={id}
            selected={selected.has(key)}
            busy={!!busy[key]}
            flash={!!flash[key]}
            error={errors[key] ?? ''}
            gmHint={gmHintKey === key}
            animateIn={animateIn}
            index={i}
            actions={actions}
            onToggleSelect={onToggleSelect}
          />
        ))}

        {/* Not-required tray */}
        {naKeys && naKeys.length > 0 && (
          <div className="rounded-xl border bg-white/70 mt-3" style={{ borderColor: DOC_TONE.line }}>
            <button
              type="button" onClick={() => setNaOpen((o) => !o)} aria-expanded={naOpen}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-[11.5px] font-medium cursor-pointer"
              style={{ color: STATUS_META.notRequired.ink }}
            >
              <Svg size={12}>{Icon.slash}</Svg>
              Not required
              <span className="tabular-nums" style={{ color: DOC_TONE.faint }}>({naKeys.length})</span>
              <span className="flex-1" />
              <span className="transition-transform duration-150" style={{ transform: naOpen ? 'rotate(180deg)' : undefined }}>
                <Svg size={12}>{Icon.chevron}</Svg>
              </span>
            </button>
            {naOpen && (
              <ul className="px-2 pb-2 space-y-1">
                {naKeys.map((key) => (
                  <li
                    key={key}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]"
                    style={{ background: '#F8FAFB', viewTransitionName: `doc-card-${key}` }}
                  >
                    <span className="flex-1 truncate line-through decoration-[#D5DBE3]" style={{ color: DOC_TONE.muted }}>{LABEL[key]}</span>
                    {busy[key] && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: STATUS_META.notRequired.color }} />}
                    <button
                      type="button" onClick={() => actions.markPending([key])}
                      className="text-[11px] font-medium cursor-pointer hover:underline shrink-0"
                      style={{ color: DOC_TONE.accent }}
                    >
                      Required again
                    </button>
                  </li>
                ))}
                {naKeys.some((k) => errors[k]) && (
                  <li className="px-2 text-[11px] font-medium" style={{ color: DOC_TONE.coral }}>
                    {naKeys.map((k) => errors[k]).filter(Boolean)[0]}
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
