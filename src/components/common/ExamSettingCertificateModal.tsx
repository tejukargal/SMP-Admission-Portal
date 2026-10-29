import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  examSessionKey,
  listExamStaff,
  normaliseSessionLabel,
  peekNextExamCertSerial,
} from '../../services/examDutyCertService';
import {
  createSettingCert,
  listExamSubjects,
  settingRefNo,
  updateSettingCert,
} from '../../services/examSettingCertService';
import {
  defaultSession,
  DEPARTMENTS,
  DESIGNATIONS,
  SALUTATIONS,
  SESSION_LABEL_SUGGESTIONS,
  todayIso,
} from '../../utils/examDutyCertificate';
import {
  buildSettingCertBody,
  buildSettingCertHTML,
  printSettingCerts,
  showsCounts,
  subjectTotals,
  WORK_LABELS,
  WORK_ORDER,
  type SettingCertContent,
} from '../../utils/examSettingCertificate';
import {
  A4_H,
  FIELD,
  Label,
  ScaledPreview,
  SectionTitle,
  Segmented,
  WINE,
  WINE_BAND,
  WINE_HAIR,
  WINE_INK,
} from './examCertFormKit';
import type {
  ExamCertSalutation,
  ExamDutyPerson,
  ExamDutyStaff,
  ExamSettingCertificate,
  ExamSettingCertificateInput,
  ExamSettingSubject,
  ExamSettingWork,
  ExamSubject,
} from '../../types';

const WORK_OPTIONS = WORK_ORDER.map((value) => ({ value, label: WORK_LABELS[value] }));

/** One editable subject row. Counts are kept as typed text; conducted/attended
 *  follow the allotted figures until edited by hand. */
interface SubjectRow {
  code: string;
  name: string;
  batchesAllotted: string;
  studentsAllotted: string;
  batchesConducted: string;
  studentsAttended: string;
  batchesTouched: boolean;
  studentsTouched: boolean;
}

function blankRow(): SubjectRow {
  return {
    code: '', name: '',
    batchesAllotted: '', studentsAllotted: '', batchesConducted: '', studentsAttended: '',
    batchesTouched: false, studentsTouched: false,
  };
}

function toRow(s: ExamSettingSubject): SubjectRow {
  return {
    code: s.code,
    name: s.name,
    batchesAllotted: String(s.batchesAllotted),
    studentsAllotted: String(s.studentsAllotted),
    batchesConducted: String(s.batchesConducted),
    studentsAttended: String(s.studentsAttended),
    batchesTouched: s.batchesConducted !== s.batchesAllotted,
    studentsTouched: s.studentsAttended !== s.studentsAllotted,
  };
}

function isBlankRow(r: SubjectRow): boolean {
  return !r.code.trim() && !r.name.trim() && !r.batchesAllotted && !r.studentsAllotted
    && !r.batchesConducted && !r.studentsAttended;
}

function cleanSubjects(rows: SubjectRow[], work: ExamSettingWork): ExamSettingSubject[] {
  const counts = showsCounts(work);
  const n = (v: string) => (counts ? Number(v) || 0 : 0);
  return rows.filter((r) => !isBlankRow(r)).map((r) => ({
    code: r.code.trim().toUpperCase(),
    name: r.name.trim().toUpperCase(),
    batchesAllotted: n(r.batchesAllotted),
    studentsAllotted: n(r.studentsAllotted),
    batchesConducted: n(r.batchesConducted),
    studentsAttended: n(r.studentsAttended),
  }));
}

interface FormState {
  sessionLabel: string;
  sessionYear: string;
  serial: string;
  issueDate: string;
  salutation: ExamCertSalutation;
  name: string;
  designation: string;
  department: string;
  polytechnic: string;
  work: ExamSettingWork;
  subjects: SubjectRow[];
  bodyOverride: string;
  bodyEdited: boolean;
}

function initialForm(
  mode: Props['mode'],
  cert?: ExamSettingCertificate,
  session?: { label: string; year: number },
  prefill?: ExamDutyPerson,
): FormState {
  const s = session ?? defaultSession();
  if (cert && mode === 'edit') {
    return {
      sessionLabel: cert.sessionLabel,
      sessionYear: String(cert.sessionYear),
      serial: cert.serial > 0 ? String(cert.serial) : '',
      issueDate: cert.issueDate,
      salutation: cert.salutation,
      name: cert.name,
      designation: cert.designation,
      department: cert.department,
      polytechnic: cert.polytechnic,
      work: cert.work,
      subjects: cert.subjects.length ? cert.subjects.map(toRow) : [blankRow()],
      bodyOverride: cert.bodyOverride ?? '',
      bodyEdited: !!cert.bodyOverride,
    };
  }
  return {
    sessionLabel: cert?.sessionLabel ?? s.label,
    sessionYear: String(cert?.sessionYear ?? s.year),
    serial: '',
    issueDate: todayIso(),
    salutation: prefill?.salutation ?? 'Sri.',
    name: prefill?.name ?? '',
    designation: prefill?.designation ?? '',
    department: prefill?.department ?? '',
    polytechnic: prefill?.polytechnic ?? '',
    work: cert?.work ?? 'SET_AND_CONDUCTED',
    // Duplicate keeps the session, work and subjects for another examiner.
    subjects: cert?.subjects.length ? cert.subjects.map(toRow) : [blankRow()],
    bodyOverride: '',
    bodyEdited: false,
  };
}

function validate(f: FormState): string | null {
  if (!f.sessionLabel.trim()) return 'Enter the exam session (e.g. APR/MAY).';
  const year = Number(f.sessionYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return 'Enter a valid exam year.';
  if (f.serial.trim()) {
    const serial = Number(f.serial);
    if (!Number.isInteger(serial) || serial < 1) return 'Serial number must be a whole number of 1 or more, or left blank.';
  }
  if (!f.issueDate) return 'Choose the date of issue.';
  if (!f.name.trim()) return 'Enter the name of the examiner.';
  if (!f.polytechnic.trim()) return 'Enter the polytechnic / institution name.';
  const rows = f.subjects.filter((r) => !isBlankRow(r));
  if (!rows.length) return 'Add at least one subject.';
  for (const [i, r] of rows.entries()) {
    if (!r.name.trim()) return `Enter the subject name (row ${i + 1}).`;
  }
  return null;
}

function toInput(f: FormState, generated: string): ExamSettingCertificateInput {
  const body = f.bodyOverride.trim();
  return {
    sessionLabel: normaliseSessionLabel(f.sessionLabel),
    sessionYear: Number(f.sessionYear),
    serial: Number(f.serial) || 0,
    issueDate: f.issueDate,
    salutation: f.salutation,
    name: f.name.trim().toUpperCase(),
    designation: f.designation.trim(),
    department: f.department.trim(),
    polytechnic: f.polytechnic.trim().toUpperCase(),
    work: f.work,
    subjects: cleanSubjects(f.subjects, f.work),
    // Only keep an override that actually differs from the generated wording.
    ...(f.bodyEdited && body && body !== generated ? { bodyOverride: body } : {}),
  };
}

// ── Subjects editor ─────────────────────────────────────────────────────────

const CELL =
  'block w-full rounded-md border border-[#E7E3E8] bg-white px-2 py-1.5 text-[13px] text-[#262B35] placeholder:text-[#C2BBC4] ' +
  'focus:outline-none focus:border-[#BE185D]/60 focus:ring-2 focus:ring-[#BE185D]/15 transition-colors';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

function SubjectsEditor({ rows, work, directory, onChange }: {
  rows: SubjectRow[];
  work: ExamSettingWork;
  directory: ExamSubject[];
  onChange: (rows: SubjectRow[]) => void;
}) {
  const counts = showsCounts(work);
  const byCode = useMemo(() => new Map(directory.map((s) => [s.code, s.name])), [directory]);
  const cleaned = cleanSubjects(rows, work);
  const totals = subjectTotals(cleaned);
  const grid = counts
    ? 'grid-cols-[18px_92px_minmax(0,1fr)_repeat(4,50px)_20px]'
    : 'grid-cols-[18px_110px_minmax(0,1fr)_20px]';

  function update(i: number, patch: Partial<SubjectRow>) {
    onChange(rows.map((r, j) => {
      if (j !== i) return r;
      const n = { ...r, ...patch };
      // Conducted / attended follow the allotted figures until edited by hand.
      if (patch.batchesAllotted !== undefined && !n.batchesTouched) n.batchesConducted = n.batchesAllotted;
      if (patch.studentsAllotted !== undefined && !n.studentsTouched) n.studentsAttended = n.studentsAllotted;
      return n;
    }));
  }

  function setCode(i: number, raw: string) {
    const code = raw.toUpperCase();
    const known = byCode.get(code.trim());
    update(i, { code, ...(known && !rows[i].name.trim() ? { name: known } : {}) });
  }

  const over = counts && cleaned.some((s) => s.batchesConducted > s.batchesAllotted || s.studentsAttended > s.studentsAllotted);

  return (
    <div>
      <div className={`grid ${grid} gap-1.5 items-end px-0.5 pb-1 text-[9.5px] font-medium uppercase tracking-[0.4px] text-[#7A6F7D] leading-tight`}>
        <span>#</span>
        <span>Code</span>
        <span>Subject</span>
        {counts && (
          <>
            <span className="text-center">Batches<br />allotted</span>
            <span className="text-center">Students<br />allotted</span>
            <span className="text-center">Batches<br />conducted</span>
            <span className="text-center">Students<br />attended</span>
          </>
        )}
        <span />
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className={`grid ${grid} gap-1.5 items-center`}>
            <span className="text-[11.5px] text-[#9A919D] tabular-nums text-center">{i + 1}</span>
            <input
              className={`${CELL} tabular-nums`}
              list="exam-subject-codes"
              value={r.code}
              placeholder="20EC41P"
              style={{ textTransform: 'uppercase' }}
              onChange={(e) => setCode(i, e.target.value)}
            />
            <input
              className={CELL}
              value={r.name}
              placeholder="PCB LAB"
              style={{ textTransform: 'uppercase' }}
              onChange={(e) => update(i, { name: e.target.value.toUpperCase() })}
            />
            {counts && (
              <>
                <input className={`${CELL} text-center tabular-nums`} inputMode="numeric" value={r.batchesAllotted} onChange={(e) => update(i, { batchesAllotted: digits(e.target.value) })} />
                <input className={`${CELL} text-center tabular-nums`} inputMode="numeric" value={r.studentsAllotted} onChange={(e) => update(i, { studentsAllotted: digits(e.target.value) })} />
                <input className={`${CELL} text-center tabular-nums`} inputMode="numeric" value={r.batchesConducted} onChange={(e) => update(i, { batchesConducted: digits(e.target.value), batchesTouched: true })} />
                <input className={`${CELL} text-center tabular-nums`} inputMode="numeric" value={r.studentsAttended} onChange={(e) => update(i, { studentsAttended: digits(e.target.value), studentsTouched: true })} />
              </>
            )}
            {rows.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove subject ${i + 1}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[#B4232F] hover:bg-[#FDECEE] cursor-pointer"
              >
                ×
              </button>
            ) : <span />}
          </div>
        ))}
        {counts && (
          <div className={`grid ${grid} gap-1.5 items-center pt-1 border-t`} style={{ borderColor: WINE_HAIR }}>
            <span />
            <span />
            <span className="text-right pr-1 text-[11px] font-medium uppercase tracking-[0.5px]" style={{ color: WINE_INK }}>Total</span>
            {[totals.batchesAllotted, totals.studentsAllotted, totals.batchesConducted, totals.studentsAttended].map((v, i) => (
              <span key={i} className="text-center text-[13px] font-semibold tabular-nums" style={{ color: WINE_INK }}>{v}</span>
            ))}
            <span />
          </div>
        )}
      </div>
      <datalist id="exam-subject-codes">
        {directory.map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}
      </datalist>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onChange([...rows, blankRow()])}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-3.5 py-1.5 text-[12px] font-medium cursor-pointer hover:bg-[#FDF0F5]"
          style={{ borderColor: `${WINE}80`, color: WINE_INK }}
        >
          + Add subject
        </button>
        {over && (
          <span className="text-[11.5px] text-[#B45309]">Conducted / attended is more than allotted in a row — please check.</span>
        )}
      </div>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

interface Props {
  mode: 'new' | 'edit' | 'duplicate';
  /** The certificate being edited, or the source of a duplicate. */
  cert?: ExamSettingCertificate;
  /** Session to start a new certificate in (the page's current session). */
  session?: { label: string; year: number };
  /** Examiner to start a new certificate with (e.g. from an Attendance certificate). */
  prefill?: ExamDutyPerson;
  onClose: () => void;
  onSaved?: (cert: ExamSettingCertificate) => void;
}

export function ExamSettingCertificateModal({ mode, cert, session, prefill, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const isEdit = mode === 'edit' && !!cert;
  const [form, setForm] = useState<FormState>(() => initialForm(mode, cert, session, prefill));
  const [serialTouched, setSerialTouched] = useState(isEdit);
  const [peekTick, setPeekTick] = useState(0);
  const [staff, setStaff] = useState<ExamDutyStaff[]>([]);
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const year = Number(form.sessionYear);
  const sessionKey = form.sessionLabel.trim() && year ? examSessionKey(form.sessionLabel, year) : '';

  useEffect(() => {
    let cancelled = false;
    listExamStaff().then((s) => { if (!cancelled) setStaff(s); }).catch(() => {});
    listExamSubjects().then((s) => { if (!cancelled) setSubjects(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Suggest the next free serial of the session (shared with Attendance certificates).
  useEffect(() => {
    if (serialTouched || !sessionKey) return;
    let cancelled = false;
    const t = setTimeout(() => {
      peekNextExamCertSerial(sessionKey)
        .then((n) => { if (!cancelled) setForm((f) => ({ ...f, serial: String(n) })); })
        .catch(() => {});
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [sessionKey, serialTouched, peekTick]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const set = (patch: Partial<FormState>) => { setForm((f) => ({ ...f, ...patch })); setError(''); };

  const content: SettingCertContent = useMemo(() => {
    const label = normaliseSessionLabel(form.sessionLabel) || 'SESSION';
    const yr = year || new Date().getFullYear();
    return {
      salutation: form.salutation,
      name: form.name || 'NAME',
      designation: form.designation,
      department: form.department,
      polytechnic: form.polytechnic || 'POLYTECHNIC',
      sessionLabel: label,
      sessionYear: yr,
      work: form.work,
      subjects: cleanSubjects(form.subjects, form.work),
      refNo: settingRefNo(label, yr, Number(form.serial) || 0),
      issueDate: form.issueDate,
    };
  }, [form, year]);

  const generated = useMemo(() => buildSettingCertBody(content), [content]);
  const bodyText = form.bodyEdited ? form.bodyOverride : generated;
  const previewHtml = useDeferredValue(
    buildSettingCertHTML([{ ...content, bodyOverride: form.bodyEdited ? form.bodyOverride : undefined }], { preview: true })
  );

  const suggestions = useMemo(() => {
    const q = form.name.trim().toUpperCase();
    if (q.length < 2) return [];
    return staff.filter((s) => s.name.includes(q) || s.polytechnic.includes(q)).slice(0, 6);
  }, [staff, form.name]);

  const polytechnicOptions = useMemo(() => [...new Set(staff.map((s) => s.polytechnic))].sort(), [staff]);

  function pickStaff(s: ExamDutyStaff) {
    set({ salutation: s.salutation, name: s.name, designation: s.designation, department: s.department, polytechnic: s.polytechnic });
    setShowSuggest(false);
  }

  async function save(after: 'close' | 'print' | 'new') {
    const problem = validate(form);
    if (problem) { setError(problem); return; }
    // Open the print window inside the click so the popup isn't blocked after the await.
    const printWin = after === 'print' ? window.open('', '_blank') : null;
    setSaving(true);
    setError('');
    try {
      const input = toInput(form, generated);
      const saved = isEdit
        ? await updateSettingCert(cert, input)
        : await createSettingCert(input, { uid: user?.uid ?? '', email: user?.email }, !serialTouched);
      onSaved?.(saved);
      if (after === 'print') printSettingCerts([saved], printWin);
      if (after === 'new') {
        setNotice(`Saved ${saved.refNo} — ${saved.salutation} ${saved.name}`);
        setForm((f) => ({
          ...f,
          serial: '',
          salutation: 'Sri.',
          name: '',
          designation: '',
          department: '',
          polytechnic: '',
          subjects: [blankRow()],
          bodyOverride: '',
          bodyEdited: false,
        }));
        setSerialTouched(false);
        setPeekTick((t) => t + 1);
        listExamStaff().then(setStaff).catch(() => {});
        listExamSubjects().then(setSubjects).catch(() => {});
        nameRef.current?.focus();
      } else {
        onClose();
      }
    } catch (e) {
      printWin?.close();
      setError(e instanceof Error ? e.message : 'Could not save the certificate.');
    } finally {
      setSaving(false);
    }
  }

  const title = isEdit
    ? `Edit Certificate · ${cert.refNo}`
    : mode === 'duplicate' ? 'New Certificate (copied subjects)' : 'New Setting & Conducting Certificate';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 font-wp" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
      <div className="absolute inset-0 bg-black/40" onClick={() => !saving && onClose()} aria-hidden="true" />
      <div
        className="relative w-full max-w-[1240px] max-h-[94vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border"
        style={{ borderColor: WINE_HAIR, animation: 'modal-enter 0.25s ease-out' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: WINE_HAIR, background: WINE_BAND }}>
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">Exam Duty · Setting &amp; Conducting Certificate</p>
            <h3 className="mt-1 text-[16px] font-bold leading-tight truncate" style={{ color: WINE_INK }}>{title}</h3>
          </div>
          <span className="flex-1" />
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-[#9D174D] hover:bg-white cursor-pointer">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)] overflow-hidden">
          {/* Form */}
          <div className="overflow-y-auto px-5 py-4 space-y-5">
            <section>
              <SectionTitle n={1}>Exam session &amp; reference</SectionTitle>
              <div className="grid grid-cols-[1.3fr_0.9fr_0.8fr_1.1fr] gap-2.5">
                <label className="block">
                  <Label>Session</Label>
                  <input
                    className={FIELD}
                    list="setting-session-labels"
                    value={form.sessionLabel}
                    placeholder="APR/MAY"
                    style={{ textTransform: 'uppercase' }}
                    onChange={(e) => set({ sessionLabel: e.target.value.toUpperCase() })}
                  />
                  <datalist id="setting-session-labels">
                    {SESSION_LABEL_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </label>
                <label className="block">
                  <Label>Year</Label>
                  <input className={FIELD} inputMode="numeric" value={form.sessionYear} onChange={(e) => set({ sessionYear: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                </label>
                <label className="block">
                  <Label hint={!form.serial.trim() ? 'blank' : serialTouched && !isEdit ? 'manual' : 'auto'}>Serial</Label>
                  <input
                    className={FIELD}
                    inputMode="numeric"
                    value={form.serial}
                    onChange={(e) => { setSerialTouched(true); set({ serial: e.target.value.replace(/\D/g, '').slice(0, 5) }); }}
                  />
                </label>
                <label className="block">
                  <Label>Date of issue</Label>
                  <input type="date" className={FIELD} value={form.issueDate} onChange={(e) => set({ issueDate: e.target.value })} />
                </label>
              </div>
              <p className="mt-1.5 text-[11.5px] text-[#7A6F7D]">
                Ref. No. <span className="font-medium text-[#262B35]">{content.refNo}</span>
                <span className="ml-1.5 text-[#A9A2AC]">· serials shared with Attendance certificates</span>
                {serialTouched && !isEdit && (
                  <button type="button" className="ml-2 text-[#BE185D] hover:underline cursor-pointer" onClick={() => setSerialTouched(false)}>use next free number</button>
                )}
              </p>
            </section>

            <section>
              <SectionTitle n={2}>Examiner details</SectionTitle>
              <div className="grid grid-cols-[0.55fr_2fr] gap-2.5">
                <label className="block">
                  <Label>Title</Label>
                  <select className={FIELD} value={form.salutation} onChange={(e) => set({ salutation: e.target.value as ExamCertSalutation })}>
                    {SALUTATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block relative">
                  <Label hint={staff.length ? 'type to find a returning examiner' : undefined}>Name</Label>
                  <input
                    ref={nameRef}
                    className={FIELD}
                    value={form.name}
                    placeholder="e.g. JOSEPH R HONNALLI"
                    style={{ textTransform: 'uppercase' }}
                    autoComplete="off"
                    onFocus={() => setShowSuggest(true)}
                    onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                    onChange={(e) => { set({ name: e.target.value.toUpperCase() }); setShowSuggest(true); }}
                  />
                  {showSuggest && suggestions.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl border bg-white shadow-lg overflow-hidden" style={{ borderColor: WINE_HAIR }}>
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); pickStaff(s); }}
                          className="w-full text-left px-3 py-2 hover:bg-[#FDF0F5] cursor-pointer"
                        >
                          <div className="text-[13px] text-[#262B35]">{s.salutation} {s.name}</div>
                          <div className="text-[11px] text-[#7A6F7D] truncate">{[s.designation, s.department, s.polytechnic].filter(Boolean).join(' · ')}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                <label className="block">
                  <Label>Designation</Label>
                  <input className={FIELD} list="setting-designations" value={form.designation} placeholder="e.g. Instructor" onChange={(e) => set({ designation: e.target.value })} />
                  <datalist id="setting-designations">{DESIGNATIONS.map((d) => <option key={d} value={d} />)}</datalist>
                </label>
                <label className="block">
                  <Label hint="optional">Department / Course</Label>
                  <input className={FIELD} list="setting-departments" value={form.department} placeholder="e.g. Electronics & Communication Engineering" onChange={(e) => set({ department: e.target.value })} />
                  <datalist id="setting-departments">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
                </label>
              </div>
              <label className="block mt-2.5">
                <Label hint="include the place, after a comma">Polytechnic / Institution</Label>
                <input
                  className={FIELD}
                  list="setting-polytechnics"
                  value={form.polytechnic}
                  placeholder="e.g. GOVT. POLYTECHNIC, SORABA"
                  style={{ textTransform: 'uppercase' }}
                  onChange={(e) => set({ polytechnic: e.target.value.toUpperCase() })}
                />
                <datalist id="setting-polytechnics">{polytechnicOptions.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
            </section>

            <section>
              <SectionTitle n={3}>Work done &amp; subjects</SectionTitle>
              <div className="mb-3">
                <Segmented value={form.work} options={WORK_OPTIONS} onChange={(work) => set({ work })} />
              </div>
              <SubjectsEditor
                rows={form.subjects}
                work={form.work}
                directory={subjects}
                onChange={(rows) => set({ subjects: rows })}
              />
            </section>

            <section>
              <SectionTitle n={4}>Certificate text</SectionTitle>
              <textarea
                className={`${FIELD} leading-relaxed resize-y min-h-[110px]`}
                value={bodyText}
                onChange={(e) => set({ bodyOverride: e.target.value, bodyEdited: true })}
              />
              <div className="mt-1 flex items-center gap-2 text-[11.5px]">
                {form.bodyEdited ? (
                  <>
                    <span className="text-[#B45309]">Edited by hand — changes to the fields above won't update this text.</span>
                    <button type="button" className="text-[#BE185D] hover:underline cursor-pointer" onClick={() => set({ bodyEdited: false, bodyOverride: '' })}>Reset to generated</button>
                  </>
                ) : (
                  <span className="text-[#7A6F7D]">Generated from the details above. The subjects table prints below this paragraph.</span>
                )}
              </div>
            </section>
          </div>

          {/* Preview — scrollbar gutter reserved so the scaled preview can't shake (see ExamDutyCertificateModal). */}
          <div className="hidden lg:flex flex-col gap-2 border-l px-5 py-4 overflow-y-auto [scrollbar-gutter:stable]" style={{ borderColor: WINE_HAIR, background: '#FBF8FA' }}>
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#7A6F7D]">Preview · A4</span>
              <span className="text-[10.5px] text-[#A9A2AC]">Prints a staff copy + an office copy</span>
            </div>
            <ScaledPreview html={previewHtml} height={A4_H} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t bg-white" style={{ borderColor: WINE_HAIR }}>
          <div className="min-w-0 flex-1 text-[12px]">
            {error ? <span className="text-[#B4232F]">{error}</span> : notice ? <span className="text-[#0F7A4D]">✓ {notice}</span> : null}
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-full border border-[#E7E3E8] px-4 py-2 text-[12.5px] font-medium text-[#4B4450] hover:bg-[#FBF9FB] cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          {!isEdit && (
            <button type="button" onClick={() => void save('new')} disabled={saving} className="rounded-full border px-4 py-2 text-[12.5px] font-medium hover:bg-[#FDF0F5] cursor-pointer disabled:opacity-50" style={{ borderColor: `${WINE}80`, color: WINE_INK }} title="Save, then start the next certificate in the same session">
              Save &amp; New
            </button>
          )}
          <button type="button" onClick={() => void save('close')} disabled={saving} className="rounded-full border px-4 py-2 text-[12.5px] font-medium hover:bg-[#FDF0F5] cursor-pointer disabled:opacity-50" style={{ borderColor: `${WINE}80`, color: WINE_INK }}>
            {isEdit ? 'Save changes' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => void save('print')}
            disabled={saving}
            className="rounded-full px-5 py-2 text-[12.5px] font-medium text-white hover:brightness-95 cursor-pointer disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${WINE}, ${WINE_INK})`, boxShadow: `0 3px 10px ${WINE}40` }}
          >
            {saving ? 'Saving…' : 'Save & Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
