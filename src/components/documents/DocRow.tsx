import { useState } from 'react';
import type { DocEntry, DocKey, DocStatus } from '../../types';
import { hasCopyType, statusOf, todayLocal } from '../../services/studentDocumentService';
import { OutlinePill, Spinner, Svg } from './docsUi';
import { DOC_TONE, STATUS_META, shortUser } from './docsTokens';
import { Icon } from './docsIcons';

export type RowSaveState = 'idle' | 'saving' | 'saved';

interface Props {
  docKey: DocKey;
  label: string;
  entry: DocEntry;
  saveState: RowSaveState;
  error: string;
  index: number;
  onStatus: (target: DocStatus) => void;
  onConfirmReturn: (date: string, reason: string) => void;
  onDate: (field: 'submittedOn' | 'returnedOn', date: string) => void;
  onRemarks: (remarks: string) => void;
  onCopyType: () => void;
  onDismissError: () => void;
}

const SEGMENTS: { status: DocStatus; icon: React.ReactNode }[] = [
  { status: 'pending',     icon: Icon.clock },
  { status: 'received',    icon: Icon.check },
  { status: 'returned',    icon: Icon.back },
  { status: 'notRequired', icon: Icon.slash },
];

export function DocRow({
  docKey, label, entry, saveState, error, index,
  onStatus, onConfirmReturn, onDate, onRemarks, onCopyType, onDismissError,
}: Props) {
  const status = statusOf(entry);
  const meta = STATUS_META[status];
  const busy = saveState === 'saving';
  const today = todayLocal();

  const [returningOpen, setReturningOpen] = useState(false);
  const [retDate, setRetDate] = useState(today);
  const [retReason, setRetReason] = useState('');
  // Drafts are null when not being edited, so live data (another user, undo,
  // conflict refresh) always shows through otherwise.
  const [remarkDraft, setRemarkDraft] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState<string | null>(null);
  const [backDraft, setBackDraft] = useState<string | null>(null);
  const editingRemark = remarkDraft !== null;
  const returning = returningOpen && status === 'received';

  function disabledReason(target: DocStatus): string {
    if (target === status) return '';
    if (target === 'returned' && status !== 'received') return 'Mark it Received first — only a document the college holds can be returned.';
    if (target === 'notRequired' && status === 'received') return 'The college holds this document — return it or reset to Pending first.';
    return '';
  }

  function clickSegment(target: DocStatus) {
    if (busy || target === status || disabledReason(target)) return;
    if (target === 'returned') {
      setRetDate(today); setRetReason(''); setReturningOpen(true);
      return;
    }
    onStatus(target);
  }

  function commitRemark() {
    const next = (remarkDraft ?? '').trim();
    setRemarkDraft(null);
    if (next !== (entry.remarks ?? '').trim()) onRemarks(next);
  }

  function commitDate(field: 'submittedOn' | 'returnedOn', value: string | null) {
    if (field === 'submittedOn') setSubDraft(null); else setBackDraft(null);
    if (!value || value === entry[field]) return;
    onDate(field, value);
  }

  const dateCls = 'rounded-md border px-1.5 py-[1px] text-[11.5px] font-medium bg-white focus:outline-none focus:ring-2 tabular-nums';

  return (
    <div
      className="group rounded-xl border bg-white transition-colors"
      style={{
        borderColor: error ? `${DOC_TONE.coral}55` : status === 'pending' ? DOC_TONE.line : `${meta.color}40`,
        background: status === 'notRequired' ? '#FAFBFC' : '#fff',
        animation: `content-enter 0.24s ease-out ${index * 25}ms both`,
      }}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {/* Status mark */}
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={status === 'pending'
            ? { border: `1.5px dashed ${DOC_TONE.faint}`, color: DOC_TONE.faint }
            : { background: meta.wash, color: meta.ink, border: `1px solid ${meta.color}55` }}
        >
          {busy ? <Spinner color={meta.color} /> : <Svg size={13} strokeWidth={2.4}>{SEGMENTS.find((s) => s.status === status)!.icon}</Svg>}
        </span>

        {/* Label + chips */}
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span
            className={`text-[13.5px] font-medium ${status === 'notRequired' ? 'line-through decoration-[#D5DBE3]' : ''}`}
            style={{ color: status === 'notRequired' ? DOC_TONE.faint : DOC_TONE.text }}
          >
            {label}
          </span>
          {(status === 'received' || status === 'returned') && hasCopyType(docKey) && (
            <button
              type="button"
              onClick={onCopyType}
              disabled={busy}
              title="Click to switch between Original and Copy"
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50 cursor-pointer"
            >
              <OutlinePill color={entry.copyType === 'copy' ? DOC_TONE.amber : DOC_TONE.sky}>
                {entry.copyType === 'copy' ? 'Copy' : 'Original'}
                <span className="opacity-60">⇄</span>
              </OutlinePill>
            </button>
          )}
          {saveState === 'saved' && (
            <span className="text-[11px] font-medium" style={{ color: DOC_TONE.accent, animation: 'toast-in 0.2s ease-out' }}>Saved ✓</span>
          )}
        </div>

        {/* Segmented status control */}
        <div role="group" aria-label={`${label} status`} className="flex items-center rounded-full border p-[3px] gap-[2px] shrink-0" style={{ borderColor: DOC_TONE.line, background: '#F8FAFB' }}>
          {SEGMENTS.map(({ status: s, icon }) => {
            const active = s === status;
            const why = disabledReason(s);
            const m = STATUS_META[s];
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                disabled={busy || !!why}
                title={why || (active ? `Currently ${m.label}` : `Mark as ${m.label}`)}
                onClick={() => clickSegment(s)}
                className="flex items-center gap-1 rounded-full px-2.5 h-7 text-[11.5px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed cursor-pointer"
                style={active
                  ? { background: m.wash, color: m.ink, boxShadow: `inset 0 0 0 1px ${m.color}88` }
                  : { color: why ? '#CBD2DA' : DOC_TONE.muted }}
              >
                <Svg size={12} strokeWidth={2.2}>{icon}</Svg>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Meta line: dates · who · remark */}
      {(status !== 'pending' || entry.remarks || editingRemark || entry.updatedBy) && !returning && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 pl-[54px] pr-3.5 pb-2.5 -mt-0.5 text-[11.5px]" style={{ color: DOC_TONE.muted }}>
          {(status === 'received' || status === 'returned') && (
            <label className="flex items-center gap-1.5">
              <span>Received</span>
              <input
                type="date" value={subDraft ?? entry.submittedOn} max={today} disabled={busy}
                onChange={(e) => setSubDraft(e.target.value)}
                onBlur={() => commitDate('submittedOn', subDraft)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className={`${dateCls} focus:ring-emerald-200`}
                style={{ borderColor: `${STATUS_META.received.color}55`, color: STATUS_META.received.ink }}
              />
            </label>
          )}
          {status === 'returned' && (
            <label className="flex items-center gap-1.5">
              <span>Returned</span>
              <input
                type="date" value={backDraft ?? entry.returnedOn} min={entry.submittedOn || undefined} max={today} disabled={busy}
                onChange={(e) => setBackDraft(e.target.value)}
                onBlur={() => commitDate('returnedOn', backDraft)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className={`${dateCls} focus:ring-sky-200`}
                style={{ borderColor: `${STATUS_META.returned.color}55`, color: STATUS_META.returned.ink }}
              />
            </label>
          )}
          {entry.updatedBy && (
            <span title={entry.updatedAt ? new Date(entry.updatedAt).toLocaleString('en-IN') : undefined}>
              by <span style={{ color: DOC_TONE.text }}>{shortUser(entry.updatedBy)}</span>
            </span>
          )}

          {/* Remark */}
          {editingRemark ? (
            <input
              autoFocus
              value={remarkDraft ?? ''}
              maxLength={500}
              onChange={(e) => setRemarkDraft(e.target.value)}
              onBlur={commitRemark}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRemark();
                if (e.key === 'Escape') { e.nativeEvent.stopImmediatePropagation(); setRemarkDraft(null); }
              }}
              placeholder="Add a remark…"
              className="flex-1 min-w-[180px] rounded-md border px-2 py-[2px] text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
              style={{ borderColor: DOC_TONE.hairline, color: DOC_TONE.text }}
            />
          ) : entry.remarks ? (
            <button
              type="button" onClick={() => setRemarkDraft(entry.remarks ?? '')} disabled={busy}
              className="flex items-center gap-1 italic hover:underline cursor-pointer text-left"
              style={{ color: DOC_TONE.text }} title="Edit remark"
            >
              “{entry.remarks}”
              <span style={{ color: DOC_TONE.faint }}><Svg size={11}>{Icon.pen}</Svg></span>
            </button>
          ) : (
            <button
              type="button" onClick={() => setRemarkDraft(entry.remarks ?? '')} disabled={busy}
              className="font-medium hover:underline cursor-pointer"
              style={{ color: DOC_TONE.accent }}
            >
              + Remark
            </button>
          )}
        </div>
      )}
      {status === 'pending' && !entry.remarks && !editingRemark && !entry.updatedBy && !returning && (
        <div className="pl-[54px] pb-2 -mt-1 text-[11.5px]">
          <button type="button" onClick={() => setRemarkDraft(entry.remarks ?? '')} className="font-medium hover:underline cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" style={{ color: DOC_TONE.accent }}>
            + Remark
          </button>
        </div>
      )}

      {/* Inline return form */}
      {returning && (
        <div
          className="mx-3.5 mb-3 rounded-lg border px-3 py-2.5 flex items-center gap-2.5 flex-wrap"
          style={{ borderColor: `${STATUS_META.returned.color}44`, background: STATUS_META.returned.wash, animation: 'content-enter 0.18s ease-out' }}
        >
          <span className="text-[12px] font-medium" style={{ color: STATUS_META.returned.ink }}>Hand back original on</span>
          <input
            type="date" value={retDate} min={entry.submittedOn || undefined} max={today}
            onChange={(e) => setRetDate(e.target.value)}
            className={`${dateCls} focus:ring-sky-200`}
            style={{ borderColor: `${STATUS_META.returned.color}55`, color: STATUS_META.returned.ink }}
          />
          <input
            value={retReason} maxLength={200}
            onChange={(e) => setRetReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && retDate) { setReturningOpen(false); onConfirmReturn(retDate, retReason.trim()); } }}
            placeholder="Reason / returned to (optional)"
            className="flex-1 min-w-[160px] rounded-md border bg-white px-2 py-[3px] text-[12px] focus:outline-none focus:ring-2 focus:ring-sky-200"
            style={{ borderColor: `${STATUS_META.returned.color}44` }}
          />
          <button
            type="button"
            disabled={!retDate}
            onClick={() => { setReturningOpen(false); onConfirmReturn(retDate, retReason.trim()); }}
            className="rounded-full px-3 h-7 text-[12px] font-medium text-white disabled:opacity-50 cursor-pointer"
            style={{ background: STATUS_META.returned.color }}
          >
            Confirm return
          </button>
          <button
            type="button"
            onClick={() => setReturningOpen(false)}
            className="rounded-full px-3 h-7 text-[12px] font-medium border bg-white cursor-pointer"
            style={{ borderColor: DOC_TONE.line, color: DOC_TONE.muted }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Row error */}
      {error && (
        <div className="mx-3.5 mb-2.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium" style={{ background: '#FFF1F3', color: DOC_TONE.coral }}>
          <span className="flex-1">{error}</span>
          <button type="button" onClick={onDismissError} className="opacity-70 hover:opacity-100 cursor-pointer" aria-label="Dismiss">
            <Svg size={12}>{Icon.close}</Svg>
          </button>
        </div>
      )}
    </div>
  );
}
