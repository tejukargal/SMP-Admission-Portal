import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { examSessionTitle } from '../../services/examDutyCertService';
import { deleteSettingCert, subscribeSettingCerts } from '../../services/examSettingCertService';
import { dmy } from '../../utils/examDutyCertificate';
import { printSettingCerts, showsCounts, subjectTotals, WORK_LABELS, WORK_ORDER } from '../../utils/examSettingCertificate';
import { exportSettingCertsXlsx } from '../../utils/examSettingCertExport';
import { ExamSettingCertificateModal } from '../common/ExamSettingCertificateModal';
import { WINE, WINE_BAND, WINE_HAIR, WINE_INK } from '../common/examCertFormKit';
import { Modal } from '../common/Modal';
import { Icon, OUTLINE_BTN, RowBtn, Toast } from './certUi';
import { ICONS } from './certIcons';
import type { ExamDutyPerson, ExamSettingCertificate, ExamSettingWork } from '../../types';

const ALL = '__all__';

// Last snapshot, kept across navigation so returning to the tab renders instantly.
let certsCache: ExamSettingCertificate[] | null = null;

interface SessionOption { key: string; label: string; year: number; count: number }

export interface SettingPrefill {
  person: ExamDutyPerson;
  session: { label: string; year: number };
}

type ModalState =
  | { mode: 'new'; prefill?: SettingPrefill }
  | { mode: 'edit' | 'duplicate'; cert: ExamSettingCertificate }
  | null;

export function SettingCertsView({ heading, prefill }: {
  heading: React.ReactNode;
  /** Opens a new certificate for this examiner as soon as the tab mounts. */
  prefill?: SettingPrefill | null;
}) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [certs, setCerts] = useState<ExamSettingCertificate[]>(() => certsCache ?? []);
  const [loading, setLoading] = useState(() => certsCache === null);
  const [loadError, setLoadError] = useState('');
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [workFilter, setWorkFilter] = useState<ExamSettingWork | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(() => (prefill ? { mode: 'new', prefill } : null));
  const [toDelete, setToDelete] = useState<ExamSettingCertificate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  useEffect(() => {
    return subscribeSettingCerts(
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
    const latestIssue = new Map<string, string>();
    for (const c of certs) {
      if ((latestIssue.get(c.sessionKey) ?? '') < c.issueDate) latestIssue.set(c.sessionKey, c.issueDate);
    }
    return [...map.values()].sort((a, b) =>
      b.year - a.year || (latestIssue.get(b.key) ?? '').localeCompare(latestIssue.get(a.key) ?? ''));
  }, [certs]);

  const activeSession = sessionKey ?? sessions[0]?.key ?? ALL;
  const activeSessionInfo = sessions.find((s) => s.key === activeSession);

  const inSession = useMemo(
    () => (activeSession === ALL ? certs : certs.filter((c) => c.sessionKey === activeSession)),
    [certs, activeSession],
  );

  const workCounts = useMemo(() => {
    const m: Partial<Record<ExamSettingWork, number>> = {};
    for (const c of inSession) m[c.work] = (m[c.work] ?? 0) + 1;
    return m;
  }, [inSession]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return inSession.filter((c) => {
      if (workFilter && c.work !== workFilter) return false;
      if (!q) return true;
      const subjects = c.subjects.map((s) => `${s.code} ${s.name}`).join(' ');
      return `${c.name} ${c.polytechnic} ${c.designation} ${c.department} ${c.refNo} ${subjects}`.toUpperCase().includes(q);
    });
  }, [inSession, search, workFilter]);

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
  const bySerial = (list: ExamSettingCertificate[]) =>
    [...list].sort((a, b) => a.sessionKey.localeCompare(b.sessionKey) || a.serial - b.serial);

  async function exportXlsx() {
    const list = selectedCerts.length ? selectedCerts : filtered;
    if (!list.length) return;
    const stem = activeSessionInfo
      ? `setting-conducting-certificates-${activeSessionInfo.key}`
      : 'setting-conducting-certificates-all';
    try {
      await exportSettingCertsXlsx(list, stem);
    } catch {
      setToast({ msg: 'Could not export the Excel file.', error: true });
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteSettingCert(toDelete);
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
          {heading}
          <span className="w-px h-8 shrink-0" style={{ background: WINE_HAIR }} />
          <div className="shrink-0 flex flex-col items-center justify-center rounded-[10px] border px-3.5 py-1 min-w-[58px]" style={{ borderColor: `${WINE}33`, background: WINE_BAND }}>
            <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] text-[#B0587F] leading-tight">Issued</span>
            <span className="text-[16px] font-medium leading-tight" style={{ color: WINE_INK }}>{inSession.length}</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1 py-1">
            {WORK_ORDER.filter((w) => workCounts[w]).map((w) => {
              const on = workFilter === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWorkFilter(on ? '' : w)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer active:scale-[0.97]"
                  style={on
                    ? { background: WINE, borderColor: WINE, color: '#fff', boxShadow: `0 2px 8px ${WINE}40` }
                    : { background: '#fff', borderColor: `${WINE}55`, color: WINE_INK }}
                >
                  {!on && <span className="w-1.5 h-1.5 rounded-full" style={{ background: WINE }} />}
                  {WORK_LABELS[w]} <span className="tabular-nums">{workCounts[w]}</span>
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
          <div className="relative w-72">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: WINE_INK }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search name / polytechnic / ref / subject…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border bg-[#FDF6F9] py-2 pl-9 pr-3 text-[13.5px] text-[#262B35] placeholder:text-[#9D174D]/50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#BE185D]/20"
              style={{ borderColor: `${WINE}55` }}
            />
          </div>
          <span className="flex-1" />
          <button type="button" className={OUTLINE_BTN} style={{ borderColor: WINE_HAIR }} disabled={!selectedCerts.length} onClick={() => printSettingCerts(bySerial(selectedCerts))}>
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
                {certs.length ? 'No certificates match.' : 'No Setting & Conducting certificates issued yet.'}
              </p>
              <p className="mt-1 text-[12.5px] text-[#7A6F7D]">
                Issue one for each examiner who set the question paper and / or conducted the semester examination at this institution.
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
                  <th className="px-2 py-2.5 font-medium">Subjects</th>
                  <th className="px-2 py-2.5 font-medium text-center">Batches</th>
                  <th className="px-2 py-2.5 font-medium text-center">Students</th>
                  <th className="px-2 py-2.5 font-medium">Issued</th>
                  <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const t = subjectTotals(c.subjects);
                  const counts = showsCounts(c.work);
                  return (
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
                          {c.subjects.map((s, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-1.5">
                              {s.code && (
                                <span className="rounded-full border px-2 py-0.5 text-[11px] tabular-nums" style={{ borderColor: `${WINE}55`, color: WINE_INK }}>{s.code}</span>
                              )}
                              <span className="text-[12px] text-[#3F3843]">{s.name}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-1 text-[10.5px] text-[#8A8190]">
                          {WORK_LABELS[c.work]}{c.bodyOverride && <span className="ml-1.5 text-[#B45309]">· custom wording</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center whitespace-nowrap tabular-nums text-[#3F3843]">
                        {counts ? <>{t.batchesConducted}<span className="text-[#A9A2AC]"> / {t.batchesAllotted}</span></> : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-center whitespace-nowrap tabular-nums text-[#3F3843]">
                        {counts ? <>{t.studentsAttended}<span className="text-[#A9A2AC]"> / {t.studentsAllotted}</span></> : '—'}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-[#5E5662] tabular-nums">{dmy(c.issueDate)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <RowBtn title="Print (staff + office copy)" onClick={() => printSettingCerts([c])} d={ICONS.print} />
                          <RowBtn title="Edit" onClick={() => setModal({ mode: 'edit', cert: c })} d={ICONS.edit} />
                          <RowBtn title="New certificate with the same subjects" onClick={() => setModal({ mode: 'duplicate', cert: c })} d={ICONS.copy} />
                          {isAdmin && <RowBtn title="Delete" danger onClick={() => setToDelete(c)} d={ICONS.trash} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="flex-shrink-0 -mt-1 text-[11px] text-[#8A8190]">
          Batches and Students show conducted / allotted. Serial numbers are shared with Attendance certificates of the same session.
        </p>
      </div>

      {modal && (
        <ExamSettingCertificateModal
          mode={modal.mode}
          cert={modal.mode === 'new' ? undefined : modal.cert}
          session={modal.mode === 'new' && modal.prefill ? modal.prefill.session : newSession}
          prefill={modal.mode === 'new' ? modal.prefill?.person : undefined}
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
              that number is handed back for the next certificate (Attendance or Setting).
            </p>
          </>
        )}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />

      {toast && <Toast msg={toast.msg} error={toast.error} />}
    </>
  );
}
