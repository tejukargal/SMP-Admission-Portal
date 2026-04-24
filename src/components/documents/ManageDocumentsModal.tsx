import { useEffect, useRef, useState } from 'react';
import { useStudentDocuments } from '../../hooks/useStudentDocuments';
import { saveStudentDocuments } from '../../services/studentDocumentService';
import { printStudentDocs } from '../../utils/printStudentDocs';
import type { Student, DocKey } from '../../types';
import { REQUIRED_DOCS } from '../../types';

interface Props {
  student: Student;
  onClose: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Unique colour per document type — never changes with status
const DOC_PALETTE: Record<string, { bg: string; border: string; text: string }> = {
  sslcMarksCard:           { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-900'   },
  transferCertificate:     { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-900'  },
  studyCertificate:        { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-900' },
  characterConduct:        { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-900'   },
  casteCertificate:        { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-900' },
  incomeCertificate:       { bg: 'bg-cyan-50',   border: 'border-cyan-200',   text: 'text-cyan-900'   },
  physicalFitness:         { bg: 'bg-sky-50',    border: 'border-sky-200',    text: 'text-sky-900'    },
  aadharCopy:              { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900' },
  eligibilityCertificate:  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900' },
  passportPhotos:          { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-900'   },
};

export function ManageDocumentsModal({ student, onClose }: Props) {
  const { docs: loadedDocs, loading, error } = useStudentDocuments(student.id);
  const [docs, setDocs]         = useState(loadedDocs);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isDirty, setIsDirty]   = useState(false);

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clear pending single-click timer on unmount to avoid state updates on dead component
  useEffect(() => () => { if (clickTimerRef.current) clearTimeout(clickTimerRef.current); }, []);

  // Single click: wait briefly to see if a double-click follows before submitting
  function handleCardClick(key: DocKey, isSubmitted: boolean, isReturned: boolean) {
    if (isSubmitted || isReturned) return;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      toggleSubmitted(key);
    }, 220);
  }

  // Double click: cancel the pending single-click and open the detail popup
  function handleCardDoubleClick(key: DocKey) {
    if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
    setDetailDoc({ key, focusRemarks: false });
  }

  const [docContextMenu, setDocContextMenu]       = useState<{ x: number; y: number; key: DocKey } | null>(null);
  const [detailDoc, setDetailDoc]                 = useState<{ key: DocKey; focusRemarks: boolean } | null>(null);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const remarksRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (loadedDocs) setDocs(loadedDocs); }, [loadedDocs]);

  // Guard close: show warning if there are unsaved changes
  function handleClose() {
    if (isDirty) { setShowUnsavedWarning(true); return; }
    onClose();
  }

  // Save then close — used by the warning dialog's "Save & Close" action
  async function handleSaveAndClose() {
    if (!docs) return;
    setSaving(true); setSaveError('');
    try {
      await saveStudentDocuments(student.id, docs);
      onClose();
    } catch {
      setSaveError('Failed to save. Please try again.');
      setShowUnsavedWarning(false);
    } finally {
      setSaving(false);
    }
  }

  // Escape: close context menu → detail popup → warning → modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (docContextMenu)      { setDocContextMenu(null);      return; }
      if (detailDoc)           { setDetailDoc(null);           return; }
      if (showUnsavedWarning)  { setShowUnsavedWarning(false); return; }
      handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, docContextMenu, detailDoc, showUnsavedWarning, isDirty]);

  // Auto-focus remarks textarea when popup opens with focusRemarks=true
  useEffect(() => {
    if (!detailDoc?.focusRemarks) return;
    const t = setTimeout(() => remarksRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [detailDoc]);

  function markDirty() { setSaved(false); setIsDirty(true); }

  function toggleSubmitted(key: DocKey) {
    if (!docs) return;
    const entry = docs[key];
    const submitted = !entry.submitted;
    setDocs({
      ...docs,
      [key]: {
        ...entry,
        submitted,
        submittedOn: submitted ? (entry.submittedOn || todayStr()) : '',
        returned: submitted ? entry.returned : false,
        returnedOn: submitted ? entry.returnedOn : '',
      },
    });
    markDirty();
  }

  function setSubmittedOn(key: DocKey, date: string) {
    if (!docs) return;
    setDocs({ ...docs, [key]: { ...docs[key], submittedOn: date } });
    markDirty();
  }

  function toggleReturned(key: DocKey) {
    if (!docs) return;
    const entry = docs[key];
    const returned = !entry.returned;
    setDocs({
      ...docs,
      [key]: {
        ...entry,
        returned,
        returnedOn: returned ? (entry.returnedOn || todayStr()) : '',
      },
    });
    markDirty();
  }

  function setReturnedOn(key: DocKey, date: string) {
    if (!docs) return;
    setDocs({ ...docs, [key]: { ...docs[key], returnedOn: date } });
    markDirty();
  }

  function setRemarks(key: DocKey, remarks: string) {
    if (!docs) return;
    setDocs({ ...docs, [key]: { ...docs[key], remarks } });
    markDirty();
  }

  async function handleSave() {
    if (!docs) return;
    setSaving(true); setSaveError('');
    try {
      await saveStudentDocuments(student.id, docs);
      setSaved(true); setIsDirty(false);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleDocContextMenu(e: React.MouseEvent, key: DocKey) {
    e.preventDefault(); e.stopPropagation();
    const MENU_W = 210, MENU_H = 160;
    const x = e.clientX + MENU_W > window.innerWidth  ? e.clientX - MENU_W : e.clientX;
    const y = e.clientY + MENU_H > window.innerHeight ? e.clientY - MENU_H : e.clientY;
    setDocContextMenu({ x, y, key });
  }

  const submittedCount = docs ? REQUIRED_DOCS.filter(({ key }) => docs[key].submitted).length : 0;
  const returnedCount  = docs ? REQUIRED_DOCS.filter(({ key }) => docs[key].returned).length  : 0;
  const total = REQUIRED_DOCS.length;
  const pendingCount   = total - submittedCount;

  const headerGradient = loading
    ? 'from-slate-700 to-slate-900'
    : docs
      ? submittedCount === total ? 'from-emerald-600 to-emerald-800'
      : submittedCount === 0    ? 'from-red-600 to-red-800'
                                : 'from-amber-500 to-amber-700'
      : 'from-slate-700 to-slate-900';

  // ── Context menu shared classes ───────────────────────────────────────────
  const mItem = 'group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors duration-100';
  const mIcon = 'w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 transition-colors';

  // ── Detail popup computed values ──────────────────────────────────────────
  const dKey    = detailDoc?.key;
  const dEntry  = dKey && docs ? docs[dKey] : null;
  const dLabel  = dKey ? REQUIRED_DOCS.find(d => d.key === dKey)?.label ?? '' : '';
  const dPal    = dKey ? (DOC_PALETTE[dKey] ?? DOC_PALETTE.sslcMarksCard) : DOC_PALETTE.sslcMarksCard;
  const dStatus = dEntry?.returned ? 'Returned' : dEntry?.submitted ? 'Submitted' : 'Pending';
  const dStatusCls = dEntry?.returned
    ? 'bg-blue-500 text-white'
    : dEntry?.submitted
      ? 'bg-emerald-500 text-white'
      : 'bg-gray-200 text-gray-600';

  // ── Skeleton grid while loading ───────────────────────────────────────────
  const skeletonGrid = (
    <div className="grid grid-cols-4 gap-3 p-5">
      {Array.from({ length: REQUIRED_DOCS.length }).map((_, i) => (
        <div key={i} className="rounded-xl border-2 border-gray-100 bg-white p-3 h-[90px] flex flex-col">
          <div className="skeleton h-3 w-3/4 rounded mb-1" />
          <div className="skeleton h-3 w-1/2 rounded" />
          <div className="flex-1 flex items-center justify-center">
            <div className="skeleton h-5 w-20 rounded" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* ════════════════════════════════════════════════════════════════════
          MODAL
      ════════════════════════════════════════════════════════════════════ */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
        style={{ animation: 'backdrop-enter 0.18s ease-out' }}
      >
        <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
        <div
          className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: '860px', maxWidth: '100%', maxHeight: 'calc(100vh - 3rem)', animation: 'modal-enter 0.22s ease-out' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className={`px-5 py-3.5 bg-gradient-to-r ${headerGradient} flex items-center justify-between shrink-0`}>
            <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </span>
                Manage Documents
              </h2>
              {docs && !loading && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40">
                    {submittedCount}/{total} Submitted
                    <span className="opacity-60">·</span>
                    <span>{submittedCount === total ? '✓ Complete' : `${pendingCount} pending`}</span>
                  </span>
                  {returnedCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40">
                      {returnedCount} Returned
                    </span>
                  )}
                  <span className="ml-1 text-[10px] text-white/55 italic hidden sm:inline">
                    Double-click for details · Right-click for options
                  </span>
                </>
              )}
            </div>
            <button
              onClick={handleClose}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 ml-3"
            >
              ×
            </button>
          </div>

          {/* ── Student info bar ── */}
          <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 shrink-0">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {[
                { label: 'Student',       value: student.studentNameSSLC, bold: true  },
                { label: 'Course',        value: student.course,          bold: false },
                { label: 'Year',          value: student.year,            bold: false },
                { label: 'Academic Year', value: student.academicYear,    bold: false },
                ...(student.regNumber ? [{ label: 'Reg No', value: student.regNumber, bold: false }] : []),
              ].map(({ label, value, bold }) => (
                <div key={label} className="flex flex-col min-w-0">
                  <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{label}</span>
                  <span className={`text-xs truncate ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Body: 4-column document card grid ── */}
          <div
            className="flex-1 overflow-auto min-h-0 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {loading ? skeletonGrid : error ? (
              <div className="flex items-center justify-center h-48 text-sm text-red-500">{error}</div>
            ) : docs ? (
              <div className="grid grid-cols-4 gap-3 p-5">
                {REQUIRED_DOCS.map(({ key, label }) => {
                  const entry       = docs[key];
                  const isSubmitted = entry.submitted;
                  const isReturned  = entry.returned;
                  const pal = DOC_PALETTE[key] ?? DOC_PALETTE.sslcMarksCard;

                  // Big centred status text + colour
                  const statusText = isReturned ? 'RETURNED' : isSubmitted ? 'SUBMITTED' : 'PENDING';
                  const statusTextCls = isReturned
                    ? 'text-blue-600'
                    : isSubmitted
                      ? 'text-emerald-600'
                      : 'text-gray-400';

                  return (
                    <div
                      key={key}
                      className={`flex flex-col rounded-xl border-2 p-2.5 h-[90px] select-none hover:shadow-md transition-shadow duration-150 ${pal.bg} ${pal.border} ${!isSubmitted && !isReturned ? 'cursor-pointer' : 'cursor-context-menu'}`}
                      onClick={() => handleCardClick(key, isSubmitted, isReturned)}
                      onDoubleClick={() => handleCardDoubleClick(key)}
                      onContextMenu={(e) => handleDocContextMenu(e, key)}
                      title={!isSubmitted && !isReturned ? 'Click to mark as submitted · Double-click for details · Right-click for options' : 'Double-click for details · Right-click for options'}
                    >
                      {/* Document label — small, top */}
                      <p className={`text-[12px] font-extrabold leading-snug line-clamp-2 text-center shrink-0 ${pal.text}`}>
                        {label}
                      </p>

                      {/* Status — centred, big bold, colour-coded */}
                      <div className="flex-1 flex items-center justify-center">
                        <span
                          className={`text-[13px] font-black tracking-widest uppercase transition-colors duration-200 ${statusTextCls}`}
                          style={{ letterSpacing: '0.12em' }}
                        >
                          {statusText}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* ── Footer: colour-coded status legend + action buttons ── */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0">
            {docs && !loading && (
              <div className="flex gap-2 mb-3" style={{ animation: 'content-enter 0.35s ease-out' }}>
                {/* Total */}
                <div className="flex-1 rounded-xl border-2 border-gray-200 bg-white px-3 py-1.5">
                  <div className="text-[8.5px] text-gray-400 font-bold uppercase tracking-wider">Total</div>
                  <div className="text-base font-extrabold text-gray-700 leading-tight">{total}</div>
                  <div className="text-[8.5px] text-gray-400">documents</div>
                </div>
                {/* Submitted */}
                <div className={`flex-1 rounded-xl px-3 py-1.5 ${submittedCount === total ? 'bg-emerald-600' : 'bg-emerald-500'}`}>
                  <div className="text-[8.5px] text-emerald-100 font-bold uppercase tracking-wider">Submitted</div>
                  <div className="text-base font-extrabold text-white leading-tight">{submittedCount}</div>
                  <div className="text-[8.5px] text-emerald-200">
                    {submittedCount === total ? '✓ All submitted' : `${pendingCount} pending`}
                  </div>
                </div>
                {/* Returned */}
                <div className="flex-1 rounded-xl bg-blue-500 px-3 py-1.5">
                  <div className="text-[8.5px] text-blue-100 font-bold uppercase tracking-wider">Returned</div>
                  <div className="text-base font-extrabold text-white leading-tight">{returnedCount}</div>
                  <div className="text-[8.5px] text-blue-200">
                    {submittedCount > 0 && returnedCount < submittedCount
                      ? `${submittedCount - returnedCount} with college`
                      : returnedCount === 0 ? 'none returned' : '✓ All returned'}
                  </div>
                </div>
                {/* Pending */}
                <div className={`flex-1 rounded-xl px-3 py-1.5 border-2 ${pendingCount === 0 ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
                  <div className={`text-[8.5px] font-bold uppercase tracking-wider ${pendingCount === 0 ? 'text-gray-400' : 'text-red-400'}`}>Pending</div>
                  <div className={`text-base font-extrabold leading-tight ${pendingCount === 0 ? 'text-gray-400' : 'text-red-600'}`}>{pendingCount}</div>
                  <div className={`text-[8.5px] ${pendingCount === 0 ? 'text-gray-400' : 'text-red-400'}`}>
                    {pendingCount === 0 ? '✓ Complete' : 'not submitted'}
                  </div>
                </div>
                {/* Error tile */}
                {saveError && (
                  <div className="flex-1 rounded-xl bg-red-50 border-2 border-red-300 px-3 py-1.5">
                    <div className="text-[8.5px] text-red-400 font-bold uppercase tracking-wider">Error</div>
                    <div className="text-[10px] font-semibold text-red-600 mt-0.5 leading-tight">{saveError}</div>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Close
              </button>
              {docs && (
                <button
                  onClick={() => printStudentDocs(student, docs)}
                  disabled={isDirty}
                  title={isDirty ? 'Save changes before printing' : 'Print document list'}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  🖨️ Print
                </button>
              )}
              <button
                onClick={() => void handleSave()}
                disabled={saving || loading || !docs || !isDirty}
                className="rounded-lg bg-blue-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* ── Unsaved-changes warning overlay ── */}
          {showUnsavedWarning && (
            <div className="absolute inset-0 z-[80] flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-[2px]">
              <div
                className="bg-white rounded-2xl shadow-2xl w-72 overflow-hidden"
                style={{ animation: 'modal-enter 0.16s ease-out' }}
              >
                {/* Header */}
                <div className="px-5 pt-5 pb-3 flex items-start gap-3">
                  <span className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-lg">⚠️</span>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Unsaved Changes</h3>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      You have unsaved changes. Save them before closing or they will be lost.
                    </p>
                  </div>
                </div>
                {/* Actions */}
                <div className="px-5 pb-5 flex flex-col gap-2 mt-1">
                  <button
                    onClick={() => void handleSaveAndClose()}
                    disabled={saving}
                    className="w-full rounded-lg bg-blue-600 text-white py-2 text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving…' : 'Save & Close'}
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full rounded-lg border border-red-200 bg-red-50 text-red-600 py-2 text-xs font-semibold hover:bg-red-100 transition-colors"
                  >
                    Discard & Close
                  </button>
                  <button
                    onClick={() => setShowUnsavedWarning(false)}
                    className="w-full rounded-lg border border-gray-200 bg-white text-gray-600 py-2 text-xs font-medium hover:bg-gray-50 transition-colors"
                  >
                    Keep Editing
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Success toast */}
          {saved && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-gray-900 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg pointer-events-none">
              <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Documents saved successfully
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          DOCUMENT RIGHT-CLICK CONTEXT MENU
          Rendered as a fragment sibling to avoid overflow/stacking issues
      ════════════════════════════════════════════════════════════════════ */}
      {docContextMenu && docs && (() => {
        const ce    = docs[docContextMenu.key];
        const cLabel = REQUIRED_DOCS.find(d => d.key === docContextMenu.key)?.label ?? '';
        const cPal  = DOC_PALETTE[docContextMenu.key] ?? DOC_PALETTE.sslcMarksCard;
        return (
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setDocContextMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setDocContextMenu(null); }}
            />
            <div
              className="fixed z-[70] bg-white border border-gray-200/80 rounded-2xl overflow-hidden min-w-[210px]"
              style={{
                left: docContextMenu.x, top: docContextMenu.y,
                boxShadow: '0 8px 32px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.06)',
                animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)',
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* Header: uses the doc's unique palette colour */}
              <div className={`px-3 pt-2.5 pb-2 border-b border-gray-100 ${cPal.bg}`}>
                <span className={`text-[11px] font-bold truncate block ${cPal.text}`}>{cLabel}</span>
              </div>

              <div className="py-1.5">
                {/* Mark Submitted */}
                {!ce.submitted && (
                  <button className={mItem} onClick={() => { toggleSubmitted(docContextMenu.key); setDocContextMenu(null); }}>
                    <span className={`${mIcon} group-hover:bg-emerald-100 group-hover:text-emerald-600`}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                    Mark as Submitted
                  </button>
                )}

                {/* Submitted, not returned */}
                {ce.submitted && !ce.returned && (
                  <>
                    <button className={mItem} onClick={() => { toggleReturned(docContextMenu.key); setDocContextMenu(null); }}>
                      <span className={`${mIcon} group-hover:bg-blue-100 group-hover:text-blue-600`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 00-4-4H4" /></svg>
                      </span>
                      Mark as Returned
                    </button>
                    <div className="my-1 h-px bg-gray-100 mx-3" />
                    <button className={mItem} onClick={() => { toggleSubmitted(docContextMenu.key); setDocContextMenu(null); }}>
                      <span className={`${mIcon} group-hover:bg-red-100 group-hover:text-red-500`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </span>
                      Mark as Pending
                    </button>
                  </>
                )}

                {/* Returned */}
                {ce.returned && (
                  <>
                    <button className={mItem} onClick={() => { toggleReturned(docContextMenu.key); setDocContextMenu(null); }}>
                      <span className={`${mIcon} group-hover:bg-amber-100 group-hover:text-amber-600`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 10 20 15 15 20" /><path d="M4 4v7a4 4 0 004 4h12" /></svg>
                      </span>
                      Unmark Returned
                    </button>
                    <div className="my-1 h-px bg-gray-100 mx-3" />
                    <button className={mItem} onClick={() => { toggleSubmitted(docContextMenu.key); setDocContextMenu(null); }}>
                      <span className={`${mIcon} group-hover:bg-red-100 group-hover:text-red-500`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </span>
                      Clear All Statuses
                    </button>
                  </>
                )}

                {/* Always: Add / Edit Remarks */}
                <div className="my-1 h-px bg-gray-100 mx-3" />
                <button
                  className={mItem}
                  onClick={() => { setDetailDoc({ key: docContextMenu.key, focusRemarks: true }); setDocContextMenu(null); }}
                >
                  <span className={`${mIcon} group-hover:bg-violet-100 group-hover:text-violet-600`}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </span>
                  Add / Edit Remarks
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════════
          DOUBLE-CLICK DETAIL POPUP
      ════════════════════════════════════════════════════════════════════ */}
      {detailDoc && dEntry && (
        <>
          {/* Semi-opaque backdrop */}
          <div
            className="fixed inset-0 z-[60] bg-black/25"
            onClick={() => setDetailDoc(null)}
          />
          {/* Centred detail panel */}
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            <div
              className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-gray-200 w-80 overflow-hidden"
              style={{ animation: 'modal-enter 0.18s ease-out' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header — uses the doc's unique palette colour */}
              <div className={`px-4 py-3 border-b ${dPal.bg} ${dPal.border} flex items-center justify-between`}>
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] font-extrabold uppercase tracking-wider mb-0.5 ${dPal.text} opacity-60`}>Document Details</p>
                  <h4 className={`text-xs font-bold leading-tight ${dPal.text}`}>{dLabel}</h4>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${dStatusCls}`}>
                    {dStatus}
                  </span>
                  <button
                    onClick={() => setDetailDoc(null)}
                    className="flex items-center justify-center w-5 h-5 rounded-full bg-black/10 hover:bg-black/20 text-gray-600 text-xs leading-none transition-colors cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-4 py-3.5 space-y-3">
                {/* Submitted On */}
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-emerald-500 mb-1">
                    Submitted On
                  </label>
                  {dEntry.submitted ? (
                    <input
                      type="date"
                      value={dEntry.submittedOn}
                      onChange={(e) => setSubmittedOn(detailDoc.key, e.target.value)}
                      className="w-full text-xs rounded-lg border border-emerald-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 text-gray-700 bg-emerald-50/40"
                    />
                  ) : (
                    <span className="text-xs text-gray-300 italic">Not yet submitted</span>
                  )}
                </div>

                {/* Returned On */}
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    Returned On
                  </label>
                  {dEntry.returned ? (
                    <input
                      type="date"
                      value={dEntry.returnedOn}
                      onChange={(e) => setReturnedOn(detailDoc.key, e.target.value)}
                      className="w-full text-xs rounded-lg border border-blue-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 text-gray-700 bg-blue-50/40"
                    />
                  ) : (
                    <span className="text-xs text-gray-300 italic">
                      {dEntry.submitted ? 'Not yet returned' : '—'}
                    </span>
                  )}
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                    Remarks
                  </label>
                  <textarea
                    ref={remarksRef}
                    value={dEntry.remarks}
                    onChange={(e) => setRemarks(detailDoc.key, e.target.value)}
                    placeholder="Add a remark…"
                    rows={2}
                    className="w-full text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400 placeholder:text-gray-300 text-gray-700"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[9px] text-gray-400 italic">Changes auto-apply · Save when ready</span>
                <button
                  onClick={() => setDetailDoc(null)}
                  className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
