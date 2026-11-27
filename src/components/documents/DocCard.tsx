import { memo, useState, type ReactNode } from 'react';
import type { DocEntry, DocKey } from '../../types';
import { hasCopyType, todayLocal } from '../../services/studentDocumentService';
import { OutlinePill, Svg } from './docsUi';
import { COLUMN_META, DOC_TONE, STATUS_META, fmtDay, shortUser, type DocColumnId } from './docsTokens';
import { Icon } from './docsIcons';
import { supportsGlide, type BoardActions } from './useDocBoard';

interface Props {
  docKey: DocKey;
  label: string;
  entry: DocEntry;
  column: DocColumnId;
  selected: boolean;
  busy: boolean;
  flash: boolean;
  error: string;
  /** GM category with the caste certificate still pending. */
  gmHint: boolean;
  animateIn: boolean;
  index: number;
  actions: BoardActions;
  onToggleSelect: (key: DocKey) => void;
}

type DateField = 'submittedOn' | 'returnedOn';

/** Small pill button used for a card's quick actions. */
function ActionBtn({ children, onClick, tone, primary, title }: {
  children: ReactNode; onClick: () => void; tone: string; primary?: boolean; title?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} title={title}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 h-7 text-[11.5px] font-medium whitespace-nowrap cursor-pointer transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.96] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      style={primary
        ? { borderColor: `${tone}88`, color: tone, background: `${tone}14` }
        : { borderColor: DOC_TONE.line, color: DOC_TONE.muted, background: '#fff' }}
    >
      {children}
    </button>
  );
}

export const DocCard = memo(function DocCard({
  docKey, label, entry, column, selected, busy, flash, error, gmHint, animateIn, index, actions, onToggleSelect,
}: Props) {
  const today = todayLocal();
  const col = COLUMN_META[column];

  const [editDate, setEditDate] = useState<DateField | null>(null);
  const [dateDraft, setDateDraft] = useState('');
  const [remarkDraft, setRemarkDraft] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [retDate, setRetDate] = useState(today);
  const [retReason, setRetReason] = useState('');

  function openDate(field: DateField) {
    setDateDraft(entry[field] || today);
    setEditDate(field);
  }
  function commitDate() {
    if (editDate && dateDraft && dateDraft !== entry[editDate]) actions.setDate(docKey, editDate, dateDraft);
    setEditDate(null);
  }
  function commitRemark() {
    const next = (remarkDraft ?? '').trim();
    setRemarkDraft(null);
    if (next !== (entry.remarks ?? '').trim()) actions.setRemarks(docKey, next);
  }
  function confirmReturn() {
    if (!retDate) return;
    setReturning(false);
    actions.returnDocs([docKey], retDate, retReason.trim());
  }

  // ── Rectify checks (legacy / inconsistent data) ────────────────────────
  const flags: { text: string; fix?: { label: string; run: () => void } }[] = [];
  if (column !== 'pending' && !entry.submittedOn) flags.push({ text: 'No received date', fix: { label: 'Add date', run: () => openDate('submittedOn') } });
  if (entry.submittedOn && entry.submittedOn > today) flags.push({ text: 'Received date is in the future', fix: { label: 'Fix', run: () => openDate('submittedOn') } });
  if (column === 'returned' && !entry.returnedOn) flags.push({ text: 'No return date', fix: { label: 'Add date', run: () => openDate('returnedOn') } });
  if (column === 'returned' && entry.returnedOn && entry.submittedOn && entry.returnedOn < entry.submittedOn) {
    flags.push({ text: 'Returned before it was received', fix: { label: 'Fix date', run: () => openDate('returnedOn') } });
  }

  const dateInputCls = 'rounded-md border px-1.5 py-[1px] text-[11.5px] font-medium bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 tabular-nums';

  function dateChip(field: DateField, word: string, tone: string) {
    if (editDate === field) {
      return (
        <input
          type="date" autoFocus value={dateDraft}
          min={field === 'returnedOn' ? entry.submittedOn || undefined : undefined} max={today}
          onChange={(e) => setDateDraft(e.target.value)}
          onBlur={commitDate}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setEditDate(null); }
          }}
          className={dateInputCls}
          style={{ borderColor: `${tone}66`, color: tone }}
          aria-label={`${word} date`}
        />
      );
    }
    return (
      <button
        type="button" onClick={() => openDate(field)} title={`Change ${word.toLowerCase()} date`}
        className="inline-flex items-center gap-1 rounded-md px-1 -mx-1 hover:bg-gray-100 cursor-pointer tabular-nums"
      >
        <Svg size={11}>{Icon.calendar}</Svg>
        <span>{word}</span>
        <span style={{ color: entry[field] ? tone : DOC_TONE.coral }}>{entry[field] ? fmtDay(entry[field]) : '—'}</span>
      </button>
    );
  }

  const showMeta = column !== 'pending' || entry.updatedBy;

  return (
    <div
      className="group relative rounded-xl border bg-white transition-[border-color,box-shadow] duration-150"
      style={{
        borderColor: error ? `${DOC_TONE.coral}66` : selected ? DOC_TONE.accent : col.hairline,
        boxShadow: selected ? `0 0 0 3px ${DOC_TONE.accent}22` : '0 1px 2px rgba(15,23,42,0.04)',
        viewTransitionName: `doc-card-${docKey}`,
        animation: animateIn || !supportsGlide ? `content-enter 0.22s ease-out ${animateIn ? index * 30 : 0}ms both` : undefined,
      }}
    >
      <div className="flex items-start gap-2.5 px-3 pt-2.5">
        {/* Select */}
        <button
          type="button" role="checkbox" aria-checked={selected} aria-label={`Select ${label}`}
          onClick={() => onToggleSelect(docKey)}
          className="mt-[1px] w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          style={selected
            ? { background: DOC_TONE.accent, borderColor: DOC_TONE.accent, color: '#fff' }
            : { borderColor: '#CBD3DD', background: '#fff' }}
        >
          {selected && <Svg size={11} strokeWidth={3}>{Icon.check}</Svg>}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-medium truncate" style={{ color: DOC_TONE.text }} title={label}>{label}</span>
            {column !== 'pending' && hasCopyType(docKey) && (
              <button
                type="button" onClick={() => actions.toggleCopy(docKey)}
                title="Click to switch between Original and Copy"
                className="rounded-full shrink-0 cursor-pointer active:scale-[0.96] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <OutlinePill color={entry.copyType === 'copy' ? DOC_TONE.amber : DOC_TONE.sky}>
                  {entry.copyType === 'copy' ? 'Copy' : 'Original'}<span className="opacity-50">⇄</span>
                </OutlinePill>
              </button>
            )}
            <span className="flex-1" />
            {busy ? (
              <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: col.color }} title="Saving…" />
            ) : flash ? (
              <span className="text-[10.5px] font-medium shrink-0" style={{ color: DOC_TONE.emerald, animation: 'toast-in 0.2s ease-out' }}>Saved ✓</span>
            ) : null}
          </div>

          {showMeta && (
            <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 mt-0.5 text-[11px]" style={{ color: DOC_TONE.muted }}>
              {column !== 'pending' && dateChip('submittedOn', 'Received', STATUS_META.received.ink)}
              {column === 'returned' && dateChip('returnedOn', 'Returned', STATUS_META.returned.ink)}
              {entry.updatedBy && (
                <span title={entry.updatedAt ? new Date(entry.updatedAt).toLocaleString('en-IN') : undefined}>
                  by <span style={{ color: '#4B5563' }}>{shortUser(entry.updatedBy)}</span>
                </span>
              )}
            </div>
          )}

          {/* Remark */}
          {remarkDraft !== null ? (
            <input
              autoFocus value={remarkDraft} maxLength={500}
              onChange={(e) => setRemarkDraft(e.target.value)}
              onBlur={commitRemark}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRemark();
                if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setRemarkDraft(null); }
              }}
              placeholder="Add a remark…"
              className="mt-1 w-full rounded-md border px-2 py-[3px] text-[12px] focus:outline-none focus:ring-2 focus:ring-sky-200"
              style={{ borderColor: DOC_TONE.hairline, color: DOC_TONE.text }}
            />
          ) : entry.remarks ? (
            <button
              type="button" onClick={() => setRemarkDraft(entry.remarks ?? '')}
              className="mt-0.5 flex items-start gap-1 text-left text-[11.5px] italic hover:underline cursor-pointer"
              style={{ color: '#4B5563' }} title="Edit remark"
            >
              <span className="line-clamp-2">“{entry.remarks}”</span>
              <span className="mt-[2px] shrink-0" style={{ color: DOC_TONE.faint }}><Svg size={10}>{Icon.pen}</Svg></span>
            </button>
          ) : null}

          {/* Rectify + smart hints */}
          {(flags.length > 0 || gmHint) && (
            <div className="mt-1.5 flex flex-col gap-1">
              {flags.map((f) => (
                <div key={f.text} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: '#FFF7ED', color: '#9A3412' }}>
                  <Svg size={11}>{Icon.alert}</Svg>
                  <span className="flex-1">{f.text}</span>
                  {f.fix && <button type="button" onClick={f.fix.run} className="underline cursor-pointer">{f.fix.label}</button>}
                </div>
              ))}
              {gmHint && (
                <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: '#FFFAF0', color: '#92400E' }}>
                  <Svg size={11}>{Icon.bulb}</Svg>
                  <span className="flex-1">GM category — usually not required</span>
                  <button type="button" onClick={() => actions.markNotRequired([docKey])} className="underline cursor-pointer">Mark N/A</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline return form */}
      {returning ? (
        <div
          className="mx-3 mt-2 mb-2.5 rounded-lg border px-2.5 py-2 flex flex-col gap-1.5"
          style={{ borderColor: `${STATUS_META.returned.color}55`, background: STATUS_META.returned.wash, animation: 'content-enter 0.16s ease-out' }}
        >
          <div className="flex items-center gap-2 text-[11.5px] font-medium" style={{ color: STATUS_META.returned.ink }}>
            Hand back on
            <input
              type="date" value={retDate} min={entry.submittedOn || undefined} max={today}
              onChange={(e) => setRetDate(e.target.value)}
              className={dateInputCls}
              style={{ borderColor: `${STATUS_META.returned.color}66`, color: STATUS_META.returned.ink }}
            />
          </div>
          <input
            autoFocus value={retReason} maxLength={200}
            onChange={(e) => setRetReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmReturn();
              if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setReturning(false); }
            }}
            placeholder="Reason / returned to (optional)"
            className="w-full rounded-md border bg-white px-2 py-[3px] text-[12px] focus:outline-none focus:ring-2 focus:ring-sky-200"
            style={{ borderColor: `${STATUS_META.returned.color}44` }}
          />
          <div className="flex justify-end gap-1.5">
            <ActionBtn tone={DOC_TONE.muted} onClick={() => setReturning(false)}>Cancel</ActionBtn>
            <button
              type="button" disabled={!retDate} onClick={confirmReturn}
              className="rounded-full px-3 h-7 text-[11.5px] font-medium text-white disabled:opacity-50 cursor-pointer active:scale-[0.96] transition-transform"
              style={{ background: STATUS_META.returned.color }}
            >
              Confirm return
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap pl-[40px] pr-3 pt-2 pb-2.5">
          {column === 'pending' && (
            <>
              <ActionBtn primary tone={STATUS_META.received.color} onClick={() => actions.receive([docKey])} title="Mark received today">
                <Svg size={11} strokeWidth={2.6}>{Icon.check}</Svg> Receive
              </ActionBtn>
              <ActionBtn tone={DOC_TONE.muted} onClick={() => actions.markNotRequired([docKey])} title="Not required for this student">
                <Svg size={11}>{Icon.slash}</Svg> N/A
              </ActionBtn>
            </>
          )}
          {column === 'held' && (
            <>
              <ActionBtn primary tone={STATUS_META.returned.color} onClick={() => { setRetDate(today); setRetReason(''); setReturning(true); }} title="Hand the original back to the student">
                <Svg size={11}>{Icon.back}</Svg> Return…
              </ActionBtn>
              <ActionBtn tone={DOC_TONE.muted} onClick={() => actions.markPending([docKey])} title="Wrongly marked — move back to Pending">
                Reset
              </ActionBtn>
            </>
          )}
          {column === 'returned' && (
            <>
              <ActionBtn primary tone={STATUS_META.received.color} onClick={() => actions.backToCollege([docKey])} title="The student handed it back to the college">
                Back to college
              </ActionBtn>
              <ActionBtn tone={DOC_TONE.muted} onClick={() => actions.markPending([docKey])} title="Wrongly marked — move back to Pending">
                Reset
              </ActionBtn>
            </>
          )}
          {remarkDraft === null && !entry.remarks && (
            <button
              type="button" onClick={() => setRemarkDraft('')}
              className="ml-auto text-[11px] font-medium cursor-pointer hover:underline opacity-60 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              style={{ color: DOC_TONE.accent }}
            >
              + Remark
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mx-3 mb-2.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium" style={{ background: '#FFF1F3', color: DOC_TONE.coral }}>
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => actions.dismissError(docKey)} className="opacity-70 hover:opacity-100 cursor-pointer" aria-label="Dismiss">
            <Svg size={11}>{Icon.close}</Svg>
          </button>
        </div>
      )}
    </div>
  );
});
