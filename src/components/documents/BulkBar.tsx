import { useState, type ReactNode } from 'react';
import type { DocKey, DocRecord } from '../../types';
import { statusOf, todayLocal } from '../../services/studentDocumentService';
import { Svg } from './docsUi';
import { DOC_TONE, STATUS_META } from './docsTokens';
import { Icon } from './docsIcons';
import type { BoardActions } from './useDocBoard';

interface Props {
  selected: DocKey[];
  view: DocRecord;
  actions: BoardActions;
  onClear: () => void;
}

function BarBtn({ children, count, tone, onClick }: { children: ReactNode; count: number; tone: string; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button" onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 h-7 text-[11.5px] font-medium whitespace-nowrap cursor-pointer bg-white transition-[background-color,transform] duration-150 active:scale-[0.96] hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      style={{ borderColor: `${tone}77`, color: tone }}
    >
      {children}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

/** Actions for the ticked cards. Each button acts only on the cards it applies to. */
export function BulkBar({ selected, view, actions, onClear }: Props) {
  const today = todayLocal();
  const [returning, setReturning] = useState(false);
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('');

  const by = (ok: (s: ReturnType<typeof statusOf>) => boolean) => selected.filter((k) => ok(statusOf(view[k])));
  const toReceive = by((s) => s === 'pending' || s === 'notRequired');
  const toReturn  = by((s) => s === 'received');
  const toNA      = by((s) => s === 'pending');
  const toBack    = by((s) => s === 'returned');
  const toReset   = by((s) => s !== 'pending');

  function run(fn: () => void) { fn(); onClear(); }

  if (returning) {
    const latestReceived = toReturn.map((k) => view[k].submittedOn).filter(Boolean).sort().pop();
    return (
      <div className="flex items-center gap-1.5 flex-wrap min-w-0" style={{ animation: 'toast-in 0.16s ease-out' }}>
        <span className="text-[11.5px] font-medium whitespace-nowrap" style={{ color: STATUS_META.returned.ink }}>
          Return {toReturn.length} on
        </span>
        <input
          type="date" value={date} min={latestReceived || undefined} max={today}
          onChange={(e) => setDate(e.target.value)}
          className="h-7 rounded-md border bg-white px-1.5 text-[11.5px] font-medium tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-200"
          style={{ borderColor: `${STATUS_META.returned.color}66`, color: STATUS_META.returned.ink }}
        />
        <input
          autoFocus value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && date) run(() => actions.returnDocs(toReturn, date, reason.trim()));
            if (e.key === 'Escape') { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setReturning(false); }
          }}
          placeholder="Reason (optional)"
          className="h-7 w-[150px] min-w-0 rounded-md border bg-white px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-sky-200"
          style={{ borderColor: `${STATUS_META.returned.color}44` }}
        />
        <button
          type="button" disabled={!date}
          onClick={() => run(() => actions.returnDocs(toReturn, date, reason.trim()))}
          className="rounded-full px-3 h-7 text-[11.5px] font-medium text-white disabled:opacity-50 cursor-pointer active:scale-[0.96] transition-transform"
          style={{ background: STATUS_META.returned.color }}
        >
          Confirm
        </button>
        <button type="button" onClick={() => setReturning(false)} className="px-2 h-7 text-[11.5px] font-medium cursor-pointer" style={{ color: DOC_TONE.muted }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0" style={{ animation: 'toast-in 0.16s ease-out' }}>
      <span className="text-[11.5px] font-medium whitespace-nowrap mr-0.5" style={{ color: DOC_TONE.ink }}>
        {selected.length} selected
      </span>
      <BarBtn count={toReceive.length} tone={STATUS_META.received.ink} onClick={() => run(() => actions.receive(toReceive))}>
        <Svg size={11} strokeWidth={2.6}>{Icon.check}</Svg> Receive
      </BarBtn>
      <BarBtn count={toReturn.length} tone={STATUS_META.returned.ink} onClick={() => { setDate(today); setReason(''); setReturning(true); }}>
        <Svg size={11}>{Icon.back}</Svg> Return…
      </BarBtn>
      <BarBtn count={toBack.length} tone={STATUS_META.received.ink} onClick={() => run(() => actions.backToCollege(toBack))}>
        Back to college
      </BarBtn>
      <BarBtn count={toNA.length} tone={STATUS_META.notRequired.ink} onClick={() => run(() => actions.markNotRequired(toNA))}>
        <Svg size={11}>{Icon.slash}</Svg> N/A
      </BarBtn>
      <BarBtn count={toReset.length} tone={STATUS_META.pending.ink} onClick={() => run(() => actions.markPending(toReset))}>
        Reset
      </BarBtn>
      <button
        type="button" onClick={onClear} aria-label="Clear selection"
        className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-100"
        style={{ color: DOC_TONE.muted }}
      >
        <Svg size={12}>{Icon.close}</Svg>
      </button>
    </div>
  );
}
