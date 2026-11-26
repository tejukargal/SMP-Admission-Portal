import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudentDocuments } from '../../hooks/useStudentDocuments';
import {
  DocOfflineError, docSummary, statusOf, todayLocal, updateDocEntry,
} from '../../services/studentDocumentService';
import { printStudentDocs, printReturnSlip, returnedOnDate } from '../../utils/printStudentDocs';
import type { DocEntry, DocHistoryAction, DocKey, DocStatus, Student } from '../../types';
import { DOC_COPY_DEFAULT, REQUIRED_DOCS } from '../../types';
import { DocRow, type RowSaveState } from './DocRow';
import { DocHistoryPanel } from './DocHistoryPanel';
import { OutlinePill, ProgressRing, Spinner, Svg } from './docsUi';
import { DOC_TONE, STATUS_META, fmtDay } from './docsTokens';
import { Icon } from './docsIcons';

interface Props {
  student: Student;
  onClose: () => void;
}

type Tab = 'checklist' | 'history';
interface UndoState { key: DocKey; message: string; before: DocEntry; after: DocEntry; id: number }

const UNDO_MS = 6000;
const LABEL = Object.fromEntries(REQUIRED_DOCS.map((d) => [d.key, d.label])) as Record<DocKey, string>;

export function ManageDocumentsModal({ student, onClose }: Props) {
  const { docs, loading, error } = useStudentDocuments(student.id);

  const [tab, setTab] = useState<Tab>('checklist');
  const [rowState, setRowState] = useState<Partial<Record<DocKey, RowSaveState>>>({});
  const [rowError, setRowError] = useState<Partial<Record<DocKey, string>>>({});
  const [offline, setOffline] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [gmDismissed, setGmDismissed] = useState(false);
  const [slipDate, setSlipDate] = useState('');
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedTimers = useRef<Partial<Record<DocKey, ReturnType<typeof setTimeout>>>>({});

  // Esc closes (inputs that use Esc stop propagation themselves).
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    window.addEventListener('online', goOnline);
    const timers = savedTimers.current;
    return () => {
      window.removeEventListener('online', goOnline);
      clearTimeout(undoTimer.current);
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const anySaving = Object.values(rowState).some((s) => s === 'saving');

  // ── One atomic, audited change ────────────────────────────────────────────
  const commit = useCallback(async (
    key: DocKey, next: DocEntry, action: DocHistoryAction, undoMessage?: string, seenOverride?: DocEntry,
  ) => {
    if (!docs) return;
    const seen = seenOverride ?? docs[key];
    setRowError((e) => ({ ...e, [key]: '' }));
    setRowState((s) => ({ ...s, [key]: 'saving' }));
    try {
      const saved = await updateDocEntry(student.id, key, seen, next, action);
      setOffline(false);
      setLastSavedAt(new Date().toISOString());
      setRowState((s) => ({ ...s, [key]: 'saved' }));
      clearTimeout(savedTimers.current[key]);
      savedTimers.current[key] = setTimeout(() => setRowState((s) => ({ ...s, [key]: 'idle' })), 1800);
      if (undoMessage) {
        clearTimeout(undoTimer.current);
        const id = Date.now();
        setUndo({ key, message: undoMessage, before: seen, after: saved, id });
        undoTimer.current = setTimeout(() => setUndo((u) => (u?.id === id ? null : u)), UNDO_MS);
      }
    } catch (err) {
      setRowState((s) => ({ ...s, [key]: 'idle' }));
      if (err instanceof DocOfflineError) setOffline(true);
      setRowError((e) => ({ ...e, [key]: err instanceof Error ? err.message : 'Could not save. Please try again.' }));
    }
  }, [docs, student.id]);

  // ── Status transitions ────────────────────────────────────────────────────
  function setStatus(key: DocKey, target: DocStatus) {
    if (!docs) return;
    const e = docs[key];
    const from = statusOf(e);
    const label = LABEL[key];
    if (target === 'pending') {
      commit(key, { ...e, submitted: false, submittedOn: '', returned: false, returnedOn: '', notRequired: false, copyType: undefined },
        from === 'notRequired' ? 'required' : 'pending', `${label} set to Pending`);
    } else if (target === 'received') {
      if (from === 'returned') {
        commit(key, { ...e, returned: false, returnedOn: '' }, 'unreturned', `${label} is back with the college`);
      } else {
        commit(key, {
          ...e, submitted: true, submittedOn: e.submittedOn || todayLocal(),
          returned: false, returnedOn: '', notRequired: false,
          copyType: e.copyType ?? DOC_COPY_DEFAULT[key],
        }, 'received', `${label} marked Received`);
      }
    } else if (target === 'notRequired') {
      commit(key, { ...e, submitted: false, submittedOn: '', returned: false, returnedOn: '', notRequired: true, copyType: undefined },
        'notRequired', `${label} marked Not required`);
    }
  }

  function confirmReturn(key: DocKey, date: string, reason: string) {
    if (!docs) return;
    const e = docs[key];
    const remarks = reason ? (e.remarks ? `${e.remarks} · ${reason}` : reason) : e.remarks;
    commit(key, { ...e, returned: true, returnedOn: date, remarks }, 'returned', `${LABEL[key]} marked Returned`);
    setSlipDate(date);
  }

  function undoLast() {
    if (!undo || !docs) return;
    const { key, before, after } = undo;
    clearTimeout(undoTimer.current);
    setUndo(null);
    commit(key, before, 'undo', undefined, after);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const sum = docs ? docSummary(docs) : null;
  const today = todayLocal();
  const showGmHint = !!docs && student.category === 'GM' && !gmDismissed
    && statusOf(docs.casteCertificate) === 'pending';

  /** Distinct dates on which documents were returned (newest first) — for slip reprints. */
  const returnDates = useMemo(() => {
    if (!docs) return [];
    const set = new Set<string>();
    for (const { key } of REQUIRED_DOCS) if (docs[key].returned && docs[key].returnedOn) set.add(docs[key].returnedOn);
    return [...set].sort().reverse();
  }, [docs]);
  const activeSlipDate = returnDates.includes(slipDate) ? slipDate : returnDates.includes(today) ? today : '';
  const slipCount = docs && activeSlipDate ? returnedOnDate(docs, activeSlipDate).length : 0;

  const historyKey = useMemo(
    () => (docs ? REQUIRED_DOCS.map(({ key }) => docs[key].updatedAt ?? '').join('|') : ''),
    [docs],
  );

  const infoBits = [
    student.regNumber ? `Reg No ${student.regNumber}` : 'No Reg No yet',
    student.course, student.year, student.academicYear, student.category,
  ].filter(Boolean);

  // ── Save state chip ───────────────────────────────────────────────────────
  const saveChip = offline
    ? { text: 'Offline — not saved', color: DOC_TONE.coral, icon: <Svg size={12}>{Icon.wifiOff}</Svg> }
    : anySaving
      ? { text: 'Saving…', color: DOC_TONE.muted, icon: <Spinner size={12} color={DOC_TONE.muted} /> }
      : lastSavedAt
        ? { text: 'All changes saved', color: DOC_TONE.accent, icon: <Svg size={12} strokeWidth={2.6}>{Icon.check}</Svg> }
        : { text: 'Changes save instantly', color: DOC_TONE.faint, icon: <Svg size={12}>{Icon.shield}</Svg> };

  const pillBtn = 'inline-flex items-center gap-1.5 rounded-full border px-3.5 h-8 text-[12.5px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 font-wp" style={{ animation: 'backdrop-enter 0.18s ease-out' }}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Manage documents — ${student.studentNameSSLC}`}
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 780, maxWidth: '100%', maxHeight: 'calc(100vh - 2rem)', animation: 'modal-enter 0.22s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-3 shrink-0 border-b" style={{ background: `linear-gradient(180deg, ${DOC_TONE.wash}, #fff)`, borderColor: DOC_TONE.hairline }}>
          <div className="flex items-start gap-4">
            {sum ? <ProgressRing value={sum.received} total={sum.required} /> : <div className="skeleton w-[58px] h-[58px] !rounded-full shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.8px]" style={{ color: DOC_TONE.ink }}>Manage Documents</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: saveChip.color }} aria-live="polite">
                  · {saveChip.icon}{saveChip.text}
                </span>
              </div>
              <h2 className="text-[17px] font-semibold truncate mt-0.5" style={{ color: DOC_TONE.text }}>{student.studentNameSSLC}</h2>
              <p className="text-[12px] truncate" style={{ color: DOC_TONE.muted }}>{infoBits.join(' · ')}</p>
              {sum && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <OutlinePill color={STATUS_META.received.ink} wash="#fff">{sum.received}/{sum.required} received</OutlinePill>
                  {sum.withCollege > 0 && <OutlinePill color={DOC_TONE.ink} wash="#fff">{sum.withCollege} with college</OutlinePill>}
                  {sum.returned > 0 && <OutlinePill color={STATUS_META.returned.ink} wash="#fff">{sum.returned} returned</OutlinePill>}
                  {sum.pending > 0
                    ? <OutlinePill color={DOC_TONE.coral} wash="#fff">{sum.pending} pending</OutlinePill>
                    : <OutlinePill color={DOC_TONE.accent} wash="#fff">✓ All received</OutlinePill>}
                  {sum.notRequired > 0 && <OutlinePill color={STATUS_META.notRequired.ink} wash="#fff">{sum.notRequired} N/A</OutlinePill>}
                </div>
              )}
            </div>
            <button
              type="button" onClick={onClose} aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center border bg-white hover:bg-gray-50 transition-colors cursor-pointer shrink-0"
              style={{ borderColor: DOC_TONE.line, color: DOC_TONE.muted }}
            >
              <Svg size={14}>{Icon.close}</Svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 -mb-3">
            {([
              { id: 'checklist', label: 'Checklist', icon: Icon.list },
              { id: 'history', label: 'History', icon: Icon.history },
            ] as const).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={active}
                  className="flex items-center gap-1.5 px-3 h-9 text-[12.5px] font-medium border-b-2 transition-colors cursor-pointer"
                  style={{ borderColor: active ? DOC_TONE.accent : 'transparent', color: active ? DOC_TONE.ink : DOC_TONE.muted }}
                >
                  <Svg size={13}>{t.icon}</Svg>{t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4" style={{ background: '#FBFCFD' }}>
          {error ? (
            <div className="py-16 text-center text-[13px]" style={{ color: DOC_TONE.coral }}>{error}</div>
          ) : tab === 'history' ? (
            <DocHistoryPanel studentId={student.id} refreshKey={historyKey} />
          ) : (loading || !docs) ? (
            <div className="space-y-2">
              {REQUIRED_DOCS.map(({ key }) => <div key={key} className="skeleton h-[52px] !rounded-xl" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {showGmHint && (
                <div className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12.5px]" style={{ borderColor: '#F5DEB3', background: '#FFFAF0', color: '#92400E' }}>
                  <Svg size={15}>{Icon.bulb}</Svg>
                  <span className="flex-1">GM category: the <b className="font-semibold">Caste Certificate</b> is usually not required.</span>
                  <button
                    type="button" onClick={() => setStatus('casteCertificate', 'notRequired')}
                    className="rounded-full border bg-white px-3 h-7 text-[12px] font-medium cursor-pointer hover:bg-amber-50"
                    style={{ borderColor: '#F0C987' }}
                  >
                    Mark N/A
                  </button>
                  <button type="button" onClick={() => setGmDismissed(true)} className="px-2 h-7 text-[12px] font-medium cursor-pointer opacity-70 hover:opacity-100">
                    Dismiss
                  </button>
                </div>
              )}

              {REQUIRED_DOCS.map(({ key, label }, idx) => (
                <DocRow
                  key={key}
                  docKey={key}
                  label={label}
                  entry={docs[key]}
                  index={idx}
                  saveState={rowState[key] ?? 'idle'}
                  error={rowError[key] ?? ''}
                  onStatus={(t) => setStatus(key, t)}
                  onConfirmReturn={(d, r) => confirmReturn(key, d, r)}
                  onDate={(field, date) => commit(key, { ...docs[key], [field]: date }, 'date')}
                  onRemarks={(remarks) => commit(key, { ...docs[key], remarks }, 'remarks')}
                  onCopyType={() => commit(key, { ...docs[key], copyType: docs[key].copyType === 'copy' ? 'original' : 'copy' }, 'copyType')}
                  onDismissError={() => setRowError((e) => ({ ...e, [key]: '' }))}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t flex items-center gap-2 flex-wrap shrink-0 bg-white" style={{ borderColor: DOC_TONE.line }}>
          <button
            type="button"
            disabled={!docs}
            onClick={() => docs && printStudentDocs(student, docs)}
            className={`${pillBtn} bg-white hover:bg-gray-50`}
            style={{ borderColor: DOC_TONE.line, color: DOC_TONE.text }}
          >
            <Svg size={13}>{Icon.print}</Svg> Print checklist
          </button>

          {returnDates.length > 0 && docs && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!activeSlipDate || slipCount === 0}
                onClick={() => printReturnSlip(student, docs, activeSlipDate)}
                className={`${pillBtn}`}
                style={{
                  borderColor: `${STATUS_META.returned.color}66`,
                  color: STATUS_META.returned.ink,
                  background: activeSlipDate === today ? STATUS_META.returned.wash : '#fff',
                }}
                title="Acknowledgement for the student to sign when originals are handed back"
              >
                <Svg size={13}>{Icon.back}</Svg>
                Print return slip{slipCount ? ` (${slipCount})` : ''}
              </button>
              <select
                value={activeSlipDate}
                onChange={(e) => setSlipDate(e.target.value)}
                aria-label="Return slip date"
                className="h-8 rounded-full border bg-white px-2.5 text-[12px] font-medium focus:outline-none focus:ring-2 focus:ring-sky-200 cursor-pointer"
                style={{ borderColor: DOC_TONE.line, color: DOC_TONE.muted }}
              >
                {!activeSlipDate && <option value="">Pick a date</option>}
                {returnDates.map((d) => <option key={d} value={d}>{d === today ? `Today (${fmtDay(d)})` : fmtDay(d)}</option>)}
              </select>
            </div>
          )}

          <div className="flex-1" />
          <button
            type="button" onClick={onClose}
            className={`${pillBtn} text-white`}
            style={{ background: DOC_TONE.accent, borderColor: DOC_TONE.accent }}
          >
            Done
          </button>
        </div>

        {/* ── Undo toast ── */}
        {undo && (
          <div
            key={undo.id}
            className="absolute left-1/2 -translate-x-1/2 bottom-[68px] z-10 flex items-center gap-3 rounded-full pl-4 pr-1.5 py-1.5 shadow-lg text-[12.5px] font-medium text-white overflow-hidden"
            style={{ background: '#1F2937', animation: 'toast-in 0.2s ease-out' }}
            role="status"
          >
            <span>{undo.message}</span>
            <button
              type="button" onClick={undoLast}
              className="rounded-full px-3 h-7 text-[12px] font-semibold cursor-pointer hover:bg-white/15"
              style={{ color: '#6EE7B7' }}
            >
              Undo
            </button>
            <span
              className="absolute left-0 bottom-0 h-[2px]"
              style={{ background: '#6EE7B7', width: '100%', transformOrigin: 'left', animation: `doc-undo-timer ${UNDO_MS}ms linear forwards` }}
            />
            <style>{'@keyframes doc-undo-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }'}</style>
          </div>
        )}
      </div>
    </div>
  );
}
