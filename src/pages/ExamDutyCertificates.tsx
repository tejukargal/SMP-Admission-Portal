import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { deleteExamCert, examSessionTitle, subscribeExamCerts } from '../services/examDutyCertService';
import { DUTY_LABELS, DUTY_ORDER, dmy, dutyLabel, dutyPeriodShort, printExamCerts } from '../utils/examDutyCertificate';
import { exportExamCertsXlsx } from '../utils/examDutyCertExport';
import {
  ExamDutyCertificateModal,
  WINE,
  WINE_BAND,
  WINE_HAIR,
  WINE_INK,
} from '../components/common/ExamDutyCertificateModal';
import { Modal } from '../components/common/Modal';
import type { ExamDutyCertificate, ExamDutyType } from '../types';

const ALL = '__all__';

// Last snapshot, kept across navigation so returning to the page renders
// instantly — an empty collection otherwise has nothing in the offline cache
// and would wait on the server every visit.
let certsCache: ExamDutyCertificate[] | null = null;

const OUTLINE_BTN =
  'shrink-0 inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#262B35] ' +
  'hover:bg-[#FDF0F5] hover:text-[#9D174D] focus:outline-none focus:ring-2 focus:ring-[#BE185D]/25 cursor-pointer transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';

interface SessionOption { key: string; label: string; year: number; count: number }

type ModalState =
  | { mode: 'new' }
  | { mode: 'edit' | 'duplicate'; cert: ExamDutyCertificate }
  | null;

function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  print: 'M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  sheet: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h8',
};

export function ExamDutyCertificates() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [certs, setCerts] = useState<ExamDutyCertificate[]>(() => certsCache ?? []);
  const [loading, setLoading] = useState(() => certsCache === null);
  const [loadError, setLoadError] = useState('');
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dutyFilter, setDutyFilter] = useState<ExamDutyType | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);
  const [toDelete, setToDelete] = useState<ExamDutyCertificate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  useEffect(() => {
    return subscribeExamCerts(
      (c) => { certsCache = c; setCerts(c); setLoading(false); },
      (e) => { setLoadError(e.message); setLoading(false); },
    );
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const sessions = useMemo<SessionOption[]>(() => {
    const map = new Map<string, SessionOption>();
    for (const c of certs) {
      const s = map.get(c.sessionKey);
      if (s) s.count++;
      else map.set(c.sessionKey, { key: c.sessionKey, label: c.sessionLabel, year: c.sessionYear, count: 1 });
    }
    // Latest session first: by year, then by the latest certificate issued in it.
    const latestIssue = new Map<string, string>();
    for (const c of certs) {
      if ((latestIssue.get(c.sessionKey) ?? '') < c.issueDate) latestIssue.set(c.sessionKey, c.issueDate);
    }
    return [...map.values()].sort((a, b) =>
      b.year - a.year || (latestIssue.get(b.key) ?? '').localeCompare(latestIssue.get(a.key) ?? ''));
  }, [certs]);

  // Default to the latest session once data arrives.
  const activeSession = sessionKey ?? sessions[0]?.key ?? ALL;
  const activeSessionInfo = sessions.find((s) => s.key === activeSession);

  const inSession = useMemo(
    () => (activeSession === ALL ? certs : certs.filter((c) => c.sessionKey === activeSession)),
    [certs, activeSession],
  );

  const dutyCounts = useMemo(() => {
    const m: Partial<Record<ExamDutyType, number>> = {};
    for (const c of inSession) for (const t of new Set(c.duties.map((d) => d.type))) m[t] = (m[t] ?? 0) + 1;
    return m;
  }, [inSession]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return inSession.filter((c) => {
      if (dutyFilter && !c.duties.some((d) => d.type === dutyFilter)) return false;
      if (!q) return true;
      return `${c.name} ${c.polytechnic} ${c.designation} ${c.department} ${c.refNo}`.toUpperCase().includes(q);
    });
  }, [inSession, search, dutyFilter]);

  const selectedCerts = filtered.filter((c) => selected.has(c.id));
  const allChecked = filtered.length > 0 && selectedCerts.length === filtered.length;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(filtered.map((c) => c.id)));
  }

  // Print in serial order so the office copies file neatly.
  const bySerial = (list: ExamDutyCertificate[]) =>
    [...list].sort((a, b) => a.sessionKey.localeCompare(b.sessionKey) || a.serial - b.serial);

  async function exportXlsx() {
    const list = selectedCerts.length ? selectedCerts : filtered;
    if (!list.length) return;
    const stem = activeSessionInfo
      ? `exam-duty-certificates-${activeSessionInfo.key}`
      : 'exam-duty-certificates-all';
    try {
      await exportExamCertsXlsx(list, stem);
    } catch {
      setToast({ msg: 'Could not export the Excel file.', error: true });
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteExamCert(toDelete);
      setToast({ msg: `Deleted ${toDelete.refNo}` });
      setSelected((s) => { const n = new Set(s); n.delete(toDelete.id); return n; });
      setToDelete(null);
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Could not delete.', error: true });
    } finally {
      setDeleting(false);
    }
  }

  const newSession = activeSessionInfo ? { label: activeSessionInfo.label, year: activeSessionInfo.year } : undefined;

  return (
    <>
      <div
        className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
        style={{ background: 'linear-gradient(160deg, #FDF6F9 0%, #FFFDFE 45%, #FBF1F6 100%)', animation: 'page-enter 0.22s ease-out' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex flex-wrap items-center gap-4 min-w-0">
          <div className="shrink-0">
            <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">SMP Admissions · Examinations</p>
            <h2 className="mt-1.5 text-[22px] font-bold leading-none tracking-[-0.3px]" style={{ color: WINE_INK }}>Exam Duty Certificates</h2>
          </div>
          <span className="w-px h-8 shrink-0" style={{ background: WINE_HAIR }} />
          <div className="shrink-0 flex flex-col items-center justify-center rounded-[10px] border px-3.5 py-1 min-w-[58px]" style={{ borderColor: `${WINE}33`, background: WINE_BAND }}>
            <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] text-[#B0587F] leading-tight">Issued</span>
            <span className="text-[16px] font-medium leading-tight" style={{ color: WINE_INK }}>{inSession.length}</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1 py-1">
            {DUTY_ORDER.filter((t) => dutyCounts[t]).map((t) => {
              const on = dutyFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDutyFilter(on ? '' : t)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer active:scale-[0.97]"
                  style={on
                    ? { background: WINE, borderColor: WINE, color: '#fff', boxShadow: `0 2px 8px ${WINE}40` }
                    : { background: '#fff', borderColor: `${WINE}55`, color: WINE_INK }}
                >
                  {!on && <span className="w-1.5 h-1.5 rounded-full" style={{ background: WINE }} />}
                  {DUTY_LABELS[t]} <span className="tabular-nums">{dutyCounts[t]}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setModal({ mode: 'new' })}
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-medium text-white hover:brightness-95 cursor-pointer"
            style={{ background: `linear-gradient(135deg, ${WINE}, ${WINE_INK})`, boxShadow: `0 3px 10px ${WINE}40` }}
          >
            + New Certificate
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex-shrink-0 rounded-2xl border bg-white flex flex-wrap items-center gap-2 px-2.5 py-2" style={{ borderColor: WINE_HAIR }}>
          <select
            value={activeSession}
            onChange={(e) => { setSessionKey(e.target.value); setSelected(new Set()); }}
            className="rounded-full border bg-[#FDF6F9] px-3 py-2 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#BE185D]/20 cursor-pointer"
            style={{ borderColor: `${WINE}55`, color: WINE_INK }}
          >
            {sessions.map((s) => (
              <option key={s.key} value={s.key}>{examSessionTitle(s.label, s.year)} ({s.count})</option>
            ))}
            <option value={ALL}>All sessions ({certs.length})</option>
          </select>
          <div className="relative w-64">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: WINE_INK }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search name / polytechnic / ref…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border bg-[#FDF6F9] py-2 pl-9 pr-3 text-[13.5px] text-[#262B35] placeholder:text-[#9D174D]/50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#BE185D]/20"
              style={{ borderColor: `${WINE}55` }}
            />
          </div>
          <span className="flex-1" />
          <button type="button" className={OUTLINE_BTN} style={{ borderColor: WINE_HAIR }} disabled={!selectedCerts.length} onClick={() => printExamCerts(bySerial(selectedCerts))}>
            <Icon d={ICONS.print} size={13} /> Print selected{selectedCerts.length ? ` (${selectedCerts.length})` : ''}
          </button>
          <button type="button" className={OUTLINE_BTN} style={{ borderColor: WINE_HAIR }} disabled={!filtered.length} onClick={() => void exportXlsx()}>
            <Icon d={ICONS.sheet} size={13} /> Excel{selectedCerts.length ? ` (${selectedCerts.length})` : ''}
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 rounded-2xl border bg-white overflow-auto" style={{ borderColor: WINE_HAIR }}>
          {loadError ? (
            <div className="p-10 text-center text-[13px] text-[#B4232F]">Could not load certificates: {loadError}</div>
          ) : loading ? (
            <div className="p-12 flex items-center justify-center gap-2 text-[12.5px] text-[#7A6F7D]">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[#BE185D]/25 border-t-[#BE185D] animate-spin" />
              Loading certificates…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-[14px] font-medium" style={{ color: WINE_INK }}>
                {certs.length ? 'No certificates match.' : 'No attendance certificates issued yet.'}
              </p>
              <p className="mt-1 text-[12.5px] text-[#7A6F7D]">
                Issue one for each external lecturer or staff member who did exam duty at this centre.
              </p>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-[1]" style={{ background: WINE_BAND }}>
                <tr className="text-left text-[10.5px] uppercase tracking-[0.5px] text-[#9D174D]">
                  <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" className="accent-[#BE185D] cursor-pointer" /></th>
                  <th className="px-2 py-2.5 font-medium">Ref. No.</th>
                  <th className="px-2 py-2.5 font-medium">Name</th>
                  <th className="px-2 py-2.5 font-medium">Polytechnic</th>
                  <th className="px-2 py-2.5 font-medium">Duties</th>
                  <th className="px-2 py-2.5 font-medium">Issued</th>
                  <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t align-top hover:bg-[#FFF8FB]" style={{ borderColor: '#F6E6EE' }}>
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} className="accent-[#BE185D] cursor-pointer" /></td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] tabular-nums" style={{ borderColor: `${WINE}55`, color: WINE_INK }}>{c.serial > 0 ? `#${c.serial}` : 'No serial'}</span>
                      <div className="mt-1 text-[11px] text-[#8A8190]">{c.refNo}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="font-medium text-[#262B35]">{c.salutation} {c.name}</div>
                      <div className="text-[11.5px] text-[#7A6F7D]">{c.designation}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="text-[#262B35]">{c.polytechnic}</div>
                      {c.department && <div className="text-[11.5px] text-[#7A6F7D]">{c.department}</div>}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-col gap-1">
                        {c.duties.map((d, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: `${WINE}55`, color: WINE_INK }}>
                              {dutyLabel(d)}{d.type !== 'IA_VERIFIER' && d.type !== 'PRACTICAL_EXAMINER' && d.examKind === 'PRACTICAL' ? ' · Practical' : ''}
                            </span>
                            <span className="text-[11.5px] text-[#5E5662] tabular-nums">{dutyPeriodShort(d)}</span>
                          </div>
                        ))}
                      </div>
                      {c.bodyOverride && <div className="mt-1 text-[10.5px] text-[#B45309]">custom wording</div>}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-[#5E5662] tabular-nums">{dmy(c.issueDate)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <RowBtn title="Print (staff + office copy)" onClick={() => printExamCerts([c])} d={ICONS.print} />
                        <RowBtn title="Edit" onClick={() => setModal({ mode: 'edit', cert: c })} d={ICONS.edit} />
                        <RowBtn title="New certificate with the same duties" onClick={() => setModal({ mode: 'duplicate', cert: c })} d={ICONS.copy} />
                        {isAdmin && <RowBtn title="Delete" danger onClick={() => setToDelete(c)} d={ICONS.trash} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <ExamDutyCertificateModal
          mode={modal.mode}
          cert={modal.mode === 'new' ? undefined : modal.cert}
          session={newSession}
          onClose={() => setModal(null)}
          onSaved={(c) => {
            setSessionKey(c.sessionKey);
            setToast({ msg: `Saved ${c.refNo}` });
          }}
        />
      )}

      <Modal
        open={!!toDelete}
        title="Delete certificate?"
        message={toDelete && (
          <>
            <p><strong>{toDelete.refNo}</strong> — {toDelete.salutation} {toDelete.name}</p>
            <p className="mt-2">
              The record is removed from the register. If it is the latest serial of the session,
              that number is handed back for the next certificate.
            </p>
          </>
        )}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />

      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] rounded-full px-4 py-2 text-[12.5px] font-medium text-white shadow-lg ${toast.error ? 'bg-[#B4232F]' : 'bg-[#262B35]'}`}
          style={{ animation: 'modal-enter 0.2s ease-out' }}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}

function RowBtn({ title, onClick, d, danger }: { title: string; onClick: () => void; d: string; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
        danger ? 'text-[#B4232F] hover:bg-[#FDECEE]' : 'text-[#9D174D] hover:bg-[#FDF0F5]'
      }`}
    >
      <Icon d={d} />
    </button>
  );
}
