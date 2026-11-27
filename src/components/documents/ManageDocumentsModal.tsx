import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudentDocuments } from '../../hooks/useStudentDocuments';
import { statusOf, todayLocal } from '../../services/studentDocumentService';
import { printStudentDocs, printReturnSlip, returnedOnDate } from '../../utils/printStudentDocs';
import type { DocKey, Student } from '../../types';
import { REQUIRED_DOCS } from '../../types';
import { DocColumn } from './DocColumn';
import { BulkBar } from './BulkBar';
import { DocHistoryPanel } from './DocHistoryPanel';
import { ProgressRing, Spinner, Svg } from './docsUi';
import { DOC_TONE, STATUS_META, fmtDay } from './docsTokens';
import { Icon } from './docsIcons';
import { BOARD_UNDO_MS, LABEL, useDocBoard } from './useDocBoard';

interface Props {
  student: Student;
  onClose: () => void;
}

type Tab = 'board' | 'history';

export function ManageDocumentsModal({ student, onClose }: Props) {
  const { docs, loading, error } = useStudentDocuments(student.id);
  const board = useDocBoard(student.id, docs);
  const { view, summary: sum, actions } = board;

  const [tab, setTab] = useState<Tab>('board');
  const [historyVisited, setHistoryVisited] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<DocKey>>(new Set());
  const [slipDate, setSlipDate] = useState('');
  const [animateCards, setAnimateCards] = useState(true);
  const [closing, setClosing] = useState(false);
  const [doneError, setDoneError] = useState('');
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Esc clears a selection first, then closes (inputs that use Esc stop it themselves).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (selectedRef.current.size > 0) setSelected(new Set());
      else onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Cards fade in once on first load only.
  useEffect(() => {
    if (!docs || !animateCards) return;
    const t = setTimeout(() => setAnimateCards(false), 700);
    return () => clearTimeout(t);
  }, [docs, animateCards]);

  const toggleSelect = useCallback((key: DocKey) => {
    setSelected((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);
  const selectMany = useCallback((keys: DocKey[], on: boolean) => {
    setSelected((s) => { const n = new Set(s); for (const k of keys) { if (on) n.add(k); else n.delete(k); } return n; });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  function openTab(t: Tab) {
    setTab(t);
    if (t === 'history') setHistoryVisited(true);
  }

  async function done() {
    setDoneError('');
    if (!board.saving) { onClose(); return; }
    setClosing(true);
    const failed = await board.whenIdle();
    setClosing(false);
    if (failed) setDoneError('A change could not be saved — check the highlighted card.');
    else onClose();
  }

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo(() => {
    const c = { pending: [] as DocKey[], held: [] as DocKey[], returned: [] as DocKey[], na: [] as DocKey[] };
    if (!view) return c;
    for (const { key } of REQUIRED_DOCS) {
      const s = statusOf(view[key]);
      if (s === 'pending') c.pending.push(key);
      else if (s === 'received') c.held.push(key);
      else if (s === 'returned') c.returned.push(key);
      else c.na.push(key);
    }
    return c;
  }, [view]);

  const selectedList = useMemo(
    () => REQUIRED_DOCS.map((d) => d.key).filter((k) => selected.has(k) && !columns.na.includes(k)),
    [selected, columns.na],
  );

  const gmHintKey: DocKey | null = student.category === 'GM' && columns.pending.includes('casteCertificate') ? 'casteCertificate' : null;
  const today = todayLocal();

  /** Distinct dates on which documents were returned (newest first) — for slip reprints. */
  const returnDates = useMemo(() => {
    if (!view) return [];
    const set = new Set<string>();
    for (const { key } of REQUIRED_DOCS) if (view[key].returned && view[key].returnedOn) set.add(view[key].returnedOn);
    return [...set].sort().reverse();
  }, [view]);
  // The slip defaults to the latest return just made, then today, then the newest date.
  const wantSlip = slipDate || board.undo?.slipDate || '';
  const activeSlipDate = returnDates.includes(wantSlip) ? wantSlip : returnDates.includes(today) ? today : (returnDates[0] ?? '');
  const slipCount = view && activeSlipDate ? returnedOnDate(view, activeSlipDate).length : 0;

  // History refreshes from confirmed (live) data only.
  const historyKey = useMemo(
    () => (docs ? REQUIRED_DOCS.map(({ key }) => docs[key].updatedAt ?? '').join('|') : ''),
    [docs],
  );

  const infoBits = [
    student.regNumber ? `Reg No ${student.regNumber}` : 'No Reg No yet',
    student.course, student.year, student.academicYear, student.category,
  ].filter(Boolean);

  // ── Verdict: the one-line answer to "is this student's file complete?" ──
  const verdict = !sum ? null
    : sum.required === 0 ? { tone: DOC_TONE.muted, icon: Icon.slash, text: 'No documents required' }
    : sum.pending > 0 ? {
        tone: DOC_TONE.coral, icon: Icon.alert,
        text: `Missing ${sum.pending}: ${columns.pending.slice(0, 3).map((k) => LABEL[k]).join(', ')}${columns.pending.length > 3 ? ` +${columns.pending.length - 3}` : ''}`,
      }
    : sum.withCollege > 0 ? {
        tone: STATUS_META.received.ink, icon: Icon.check,
        text: `All ${sum.required} received · ${sum.withCollege} with college${sum.returned ? ` · ${sum.returned} returned` : ''}`,
      }
    : { tone: STATUS_META.returned.ink, icon: Icon.back, text: `All received · all ${sum.returned} returned to student` };

  // ── Save state chip ───────────────────────────────────────────────────────
  const saveChip = board.offline
    ? { text: 'Offline — not saved', color: DOC_TONE.coral, icon: <Svg size={11}>{Icon.wifiOff}</Svg> }
    : board.saving
      ? { text: 'Saving…', color: DOC_TONE.muted, icon: <Spinner size={11} color={DOC_TONE.muted} /> }
      : board.lastSavedAt
        ? { text: 'All changes saved', color: STATUS_META.received.ink, icon: <Svg size={11} strokeWidth={2.6}>{Icon.check}</Svg> }
        : { text: 'Changes save instantly', color: DOC_TONE.faint, icon: <Svg size={11}>{Icon.shield}</Svg> };

  const pillBtn = 'inline-flex items-center justify-center gap-1.5 rounded-full border px-3 h-8 text-[12.5px] font-medium whitespace-nowrap transition-[background-color,transform] duration-150 active:scale-[0.97] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300';
  const panelCls = (active: boolean) =>
    `absolute inset-0 transition-[opacity,visibility] duration-150 ${active ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`;

  const smallShortcut = 'inline-flex items-center gap-1 rounded-full border bg-white px-2 h-6 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-[background-color,transform] duration-150 active:scale-[0.96] hover:shadow-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 font-wp" style={{ animation: 'backdrop-enter 0.18s ease-out' }}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Manage documents — ${student.studentNameSSLC}`}
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          width: 1040, maxWidth: '100%',
          height: 'min(760px, calc(100vh - 1.5rem))', maxHeight: 'calc(100vh - 1.5rem)',
          animation: 'modal-enter 0.22s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-5 pt-3 shrink-0 border-b" style={{ background: `linear-gradient(180deg, ${DOC_TONE.wash}, #fff)`, borderColor: DOC_TONE.hairline }}>
          <div className="flex items-center gap-3">
            {sum ? <ProgressRing value={sum.received} total={sum.required} size={44} /> : <div className="skeleton w-[44px] h-[44px] !rounded-full shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10.5px] font-medium leading-4 min-w-0">
                <span className="uppercase tracking-[0.8px] shrink-0" style={{ color: DOC_TONE.ink }}>Manage Documents</span>
                <span className="inline-flex items-center gap-1 truncate" style={{ color: saveChip.color }} aria-live="polite">
                  · {saveChip.icon}{saveChip.text}
                </span>
              </div>
              <div className="flex items-baseline gap-2 min-w-0">
                <h2 className="text-[15.5px] font-semibold truncate shrink-0 max-w-[55%]" style={{ color: DOC_TONE.text }}>{student.studentNameSSLC}</h2>
                <p className="text-[11.5px] truncate min-w-0" style={{ color: DOC_TONE.muted }}>{infoBits.join(' · ')}</p>
              </div>
            </div>
            {verdict && (
              <div
                className="hidden md:flex items-center gap-1.5 rounded-full border bg-white px-3 h-8 text-[12px] font-medium max-w-[44%] min-w-0"
                style={{ borderColor: `${verdict.tone}55`, color: verdict.tone }}
                title={verdict.text}
              >
                <Svg size={12} strokeWidth={2.4}>{verdict.icon}</Svg>
                <span className="truncate">{verdict.text}</span>
              </div>
            )}
            <button
              type="button" onClick={onClose} aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center border bg-white hover:bg-gray-50 transition-colors cursor-pointer shrink-0"
              style={{ borderColor: DOC_TONE.line, color: DOC_TONE.muted }}
            >
              <Svg size={14}>{Icon.close}</Svg>
            </button>
          </div>
          {verdict && (
            <p className="md:hidden mt-1 flex items-center gap-1 text-[11.5px] font-medium truncate" style={{ color: verdict.tone }}>
              <Svg size={11} strokeWidth={2.4}>{verdict.icon}</Svg>{verdict.text}
            </p>
          )}

          {/* Tabs + bulk actions */}
          <div className="flex items-center gap-3 mt-2 min-h-[36px]">
            <div role="tablist" className="flex gap-1 shrink-0 self-end">
              {([
                { id: 'board', label: 'Board', icon: Icon.board },
                { id: 'history', label: 'History', icon: Icon.history },
              ] as const).map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id} type="button" role="tab" aria-selected={active} onClick={() => openTab(t.id)}
                    className="flex items-center gap-1.5 px-2.5 h-9 text-[12.5px] font-medium border-b-2 -mb-px transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:bg-sky-50"
                    style={{ borderColor: active ? DOC_TONE.accent : 'transparent', color: active ? DOC_TONE.ink : DOC_TONE.muted }}
                  >
                    <Svg size={13}>{t.icon}</Svg>{t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-w-0 flex justify-end pb-1">
              {tab === 'board' && view && (selectedList.length > 0
                ? <BulkBar key={selectedList.join()} selected={selectedList} view={view} actions={actions} onClear={clearSelection} />
                : <span className="hidden sm:inline text-[11px] truncate" style={{ color: DOC_TONE.faint }}>Tick cards to act on several at once</span>)}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 min-h-0 relative" style={{ background: '#FBFCFD' }}>
          {error ? (
            <div className="py-16 text-center text-[13px]" style={{ color: DOC_TONE.coral }}>{error}</div>
          ) : (
            <>
              <div role="tabpanel" aria-hidden={tab !== 'board'} className={`${panelCls(tab === 'board')} overflow-y-auto md:overflow-hidden`}>
                {(loading || !view) ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 md:h-full">
                    {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[260px] md:h-full !rounded-2xl" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 md:h-full">
                    <DocColumn
                      id="pending" keys={columns.pending} naKeys={columns.na} view={view}
                      selected={selected} busy={board.busy} flash={board.flash} errors={board.errors}
                      gmHintKey={gmHintKey} animateIn={animateCards} actions={actions}
                      onToggleSelect={toggleSelect} onSelectMany={selectMany}
                      shortcut={columns.pending.length > 1 ? (
                        <button
                          type="button" onClick={() => actions.receive(columns.pending)}
                          className={smallShortcut}
                          style={{ borderColor: `${STATUS_META.received.color}77`, color: STATUS_META.received.ink }}
                          title="Mark every pending document received today (undoable)"
                        >
                          <Svg size={10} strokeWidth={2.8}>{Icon.check}</Svg> Receive all
                        </button>
                      ) : undefined}
                    />
                    <DocColumn
                      id="held" keys={columns.held} view={view}
                      selected={selected} busy={board.busy} flash={board.flash} errors={board.errors}
                      gmHintKey={null} animateIn={animateCards} actions={actions}
                      onToggleSelect={toggleSelect} onSelectMany={selectMany}
                    />
                    <DocColumn
                      id="returned" keys={columns.returned} view={view}
                      selected={selected} busy={board.busy} flash={board.flash} errors={board.errors}
                      gmHintKey={null} animateIn={animateCards} actions={actions}
                      onToggleSelect={toggleSelect} onSelectMany={selectMany}
                      shortcut={activeSlipDate && slipCount > 0 ? (
                        <button
                          type="button" onClick={() => printReturnSlip(student, view, activeSlipDate)}
                          className={smallShortcut}
                          style={{ borderColor: `${STATUS_META.returned.color}77`, color: STATUS_META.returned.ink }}
                          title={`Print the return acknowledgement for ${fmtDay(activeSlipDate)}`}
                        >
                          <Svg size={10}>{Icon.print}</Svg> Slip
                        </button>
                      ) : undefined}
                    />
                  </div>
                )}
              </div>

              {historyVisited && (
                <div role="tabpanel" aria-hidden={tab !== 'history'} className={`${panelCls(tab === 'history')} overflow-y-auto px-5 py-4`} style={{ scrollbarGutter: 'stable' }}>
                  <DocHistoryPanel studentId={student.id} refreshKey={historyKey} />
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-2.5 border-t flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0 bg-white" style={{ borderColor: DOC_TONE.line }}>
          <button
            type="button" disabled={!view}
            onClick={() => view && printStudentDocs(student, view)}
            className={`${pillBtn} bg-white hover:bg-gray-50 shrink-0`}
            style={{ borderColor: DOC_TONE.line, color: DOC_TONE.text }}
          >
            <Svg size={13}>{Icon.print}</Svg> Print checklist
          </button>

          {returnDates.length > 0 && view && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={!activeSlipDate || slipCount === 0}
                onClick={() => printReturnSlip(student, view, activeSlipDate)}
                className={pillBtn}
                style={{
                  borderColor: `${STATUS_META.returned.color}66`,
                  color: STATUS_META.returned.ink,
                  background: activeSlipDate === today ? STATUS_META.returned.wash : '#fff',
                }}
                title="Acknowledgement for the student to sign when originals are handed back"
              >
                <Svg size={13}>{Icon.back}</Svg>
                Return slip{slipCount ? ` (${slipCount})` : ''}
              </button>
              <select
                value={activeSlipDate}
                onChange={(e) => setSlipDate(e.target.value)}
                aria-label="Return slip date"
                className="h-8 rounded-full border bg-white px-2 text-[12px] font-medium focus:outline-none focus:ring-2 focus:ring-sky-200 cursor-pointer"
                style={{ borderColor: DOC_TONE.line, color: DOC_TONE.muted }}
              >
                {returnDates.map((d) => <option key={d} value={d}>{d === today ? `Today (${fmtDay(d)})` : fmtDay(d)}</option>)}
              </select>
            </div>
          )}

          <div className="flex-1 min-w-0 flex justify-center">
            {doneError ? (
              <span className="text-[12px] font-medium truncate" style={{ color: DOC_TONE.coral }}>{doneError}</span>
            ) : board.undo && (
              <div
                key={board.undo.id}
                className="relative flex items-center gap-1 min-w-0 max-w-full rounded-full pl-3 pr-1 h-7 text-[12px] font-medium text-white overflow-hidden"
                style={{ background: '#1F2937', animation: 'toast-in 0.18s ease-out' }}
                role="status"
              >
                <span className="truncate">{board.undo.message}</span>
                {board.undo.slipDate && view && (
                  <button
                    type="button" onClick={() => printReturnSlip(student, view, board.undo!.slipDate!)}
                    className="shrink-0 rounded-full px-2 h-[22px] text-[11.5px] font-semibold cursor-pointer hover:bg-white/15"
                    style={{ color: '#93C5FD' }}
                  >
                    Print slip
                  </button>
                )}
                <button
                  type="button" onClick={board.undoLast}
                  className="shrink-0 rounded-full px-2.5 h-[22px] text-[11.5px] font-semibold cursor-pointer hover:bg-white/15"
                  style={{ color: '#6EE7B7' }}
                >
                  Undo
                </button>
                <span
                  className="absolute left-0 bottom-0 h-[2px] w-full"
                  style={{ background: '#6EE7B7', transformOrigin: 'left', animation: `doc-undo-timer ${BOARD_UNDO_MS}ms linear forwards` }}
                />
                <style>{'@keyframes doc-undo-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }'}</style>
              </div>
            )}
          </div>

          <button
            type="button" onClick={onClose}
            className={`${pillBtn} bg-white hover:bg-gray-50 shrink-0`}
            style={{ borderColor: DOC_TONE.line, color: DOC_TONE.muted }}
          >
            Close
          </button>
          <button
            type="button" onClick={done} disabled={closing}
            className={`${pillBtn} text-white shrink-0 px-4 min-w-[84px]`}
            style={{ background: DOC_TONE.accent, borderColor: DOC_TONE.accent }}
            title={board.saving ? 'Finishes saving, then closes' : undefined}
          >
            {closing ? <><Spinner size={12} color="#fff" /> Finishing…</> : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
