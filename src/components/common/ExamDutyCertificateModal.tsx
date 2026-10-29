import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  createExamCert,
  examRefNo,
  examSessionKey,
  listExamStaff,
  normaliseSessionLabel,
  peekNextExamCertSerial,
  updateExamCert,
} from '../../services/examDutyCertService';
import {
  buildExamCertBody,
  buildExamCertHTML,
  defaultSession,
  DEPARTMENTS,
  DESIGNATIONS,
  DUTY_LABELS,
  DUTY_ORDER,
  printExamCerts,
  rangeDays,
  SALUTATIONS,
  SESSION_LABEL_SUGGESTIONS,
  todayIso,
  type ExamCertContent,
} from '../../utils/examDutyCertificate';
import {
  DmyDateInput,
  FIELD,
  HALF_A4_H,
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
  ExamDuty,
  ExamDutyCertificate,
  ExamDutyCertificateInput,
  ExamDutyDateMode,
  ExamDutyStaff,
  ExamDutyType,
  ExamKind,
} from '../../types';

const MODE_OPTIONS: { value: ExamDutyDateMode; label: string }[] = [
  { value: 'single', label: 'One day' },
  { value: 'range', label: 'From – To' },
  { value: 'dates', label: 'Several dates' },
];

const KIND_OPTIONS: { value: ExamKind; label: string }[] = [
  { value: 'THEORY', label: 'Theory' },
  { value: 'PRACTICAL', label: 'Practical' },
];

function blankDuty(prev?: ExamDuty): ExamDuty {
  return {
    type: 'INVIGILATOR',
    customLabel: '',
    examKind: prev?.examKind ?? 'THEORY',
    mode: 'range',
    from: '',
    to: '',
    dates: [],
    subject: '',
  };
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
  duties: ExamDuty[];
  bodyOverride: string;
  bodyEdited: boolean;
}

function initialForm(mode: Props['mode'], cert?: ExamDutyCertificate, session?: { label: string; year: number }): FormState {
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
      duties: cert.duties.map((d) => ({ ...d, dates: [...d.dates] })),
      bodyOverride: cert.bodyOverride ?? '',
      bodyEdited: !!cert.bodyOverride,
    };
  }
  return {
    sessionLabel: cert?.sessionLabel ?? s.label,
    sessionYear: String(cert?.sessionYear ?? s.year),
    serial: '',
    issueDate: todayIso(),
    salutation: 'Sri.',
    name: '',
    designation: '',
    department: '',
    polytechnic: '',
    // Duplicate keeps the session and duties, so a batch of invigilators with
    // the same dates is quick to issue.
    duties: cert ? cert.duties.map((d) => ({ ...d, dates: [...d.dates] })) : [blankDuty()],
    bodyOverride: '',
    bodyEdited: false,
  };
}

function validate(f: FormState): string | null {
  if (!f.sessionLabel.trim()) return 'Enter the exam session (e.g. APR/MAY).';
  const year = Number(f.sessionYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return 'Enter a valid exam year.';
  // Blank serial is allowed (ref prints without a number); otherwise it must be ≥ 1.
  if (f.serial.trim()) {
    const serial = Number(f.serial);
    if (!Number.isInteger(serial) || serial < 1) return 'Serial number must be a whole number of 1 or more, or left blank.';
  }
  if (!f.issueDate) return 'Choose the date of issue.';
  if (!f.name.trim()) return 'Enter the name of the staff member.';
  if (!f.polytechnic.trim()) return 'Enter the polytechnic / institution name.';
  if (!f.duties.length) return 'Add at least one duty.';
  for (const [i, d] of f.duties.entries()) {
    const n = f.duties.length > 1 ? ` (duty ${i + 1})` : '';
    if (d.type === 'OTHER' && !d.customLabel.trim()) return `Enter the duty name${n}.`;
    if (d.mode === 'single' && !d.from) return `Enter the duty date as dd/mm/yyyy${n}.`;
    if (d.mode === 'range') {
      if (!d.from || !d.to) return `Enter both From and To dates as dd/mm/yyyy${n}.`;
      if (d.to < d.from) return `The To date is before the From date${n}.`;
    }
    if (d.mode === 'dates' && !d.dates.filter(Boolean).length) return `Add at least one date${n}.`;
  }
  return null;
}

/** Normalises a duty for storage (drops fields its mode / type doesn't use). */
function cleanDuty(d: ExamDuty): ExamDuty {
  return {
    type: d.type,
    customLabel: d.type === 'OTHER' ? d.customLabel.trim() : '',
    examKind: d.type === 'PRACTICAL_EXAMINER' ? 'PRACTICAL' : d.examKind,
    mode: d.mode,
    from: d.mode === 'dates' ? '' : d.from,
    to: d.mode === 'range' ? d.to : '',
    dates: d.mode === 'dates' ? [...new Set(d.dates.filter(Boolean))].sort() : [],
    subject: d.type === 'PRACTICAL_EXAMINER' ? d.subject.trim() : '',
  };
}

function toInput(f: FormState, generated: string): ExamDutyCertificateInput {
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
    duties: f.duties.map(cleanDuty),
    // Only keep an override that actually differs from the generated wording.
    ...(f.bodyEdited && body && body !== generated ? { bodyOverride: body } : {}),
  };
}

function DutyEditor({ duty, index, count, onChange, onRemove }: {
  duty: ExamDuty; index: number; count: number;
  onChange: (d: ExamDuty) => void; onRemove: () => void;
}) {
  const [pendingDate, setPendingDate] = useState('');
  const set = (patch: Partial<ExamDuty>) => onChange({ ...duty, ...patch });
  const showKind = duty.type !== 'IA_VERIFIER' && duty.type !== 'PRACTICAL_EXAMINER';

  function addDate(v: string) {
    if (v && !duty.dates.includes(v)) set({ dates: [...duty.dates, v].sort() });
    setPendingDate('');
  }

  return (
    <div className="rounded-xl border bg-white p-3 space-y-2.5" style={{ borderColor: WINE_HAIR }}>
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#9D174D]">Duty {count > 1 ? index + 1 : ''}</span>
        <span className="flex-1" />
        {count > 1 && (
          <button type="button" onClick={onRemove} className="text-[11.5px] text-[#B4232F] hover:underline cursor-pointer">Remove</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <Label>Duty carried out</Label>
          <select
            className={FIELD}
            value={duty.type}
            onChange={(e) => {
              const type = e.target.value as ExamDutyType;
              set({ type, ...(type === 'PRACTICAL_EXAMINER' ? { examKind: 'PRACTICAL' as ExamKind } : {}) });
            }}
          >
            {DUTY_ORDER.map((t) => <option key={t} value={t}>{DUTY_LABELS[t]}</option>)}
          </select>
        </label>
        {duty.type === 'OTHER' ? (
          <label className="block">
            <Label>Duty name</Label>
            <input className={FIELD} value={duty.customLabel} placeholder="e.g. Valuation Camp Officer" onChange={(e) => set({ customLabel: e.target.value })} />
          </label>
        ) : duty.type === 'PRACTICAL_EXAMINER' ? (
          <label className="block">
            <Label hint="optional">Subject / Lab</Label>
            <input className={FIELD} value={duty.subject} placeholder="e.g. Workshop Practice" onChange={(e) => set({ subject: e.target.value })} />
          </label>
        ) : <div />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {showKind && <Segmented value={duty.examKind} options={KIND_OPTIONS} onChange={(examKind) => set({ examKind })} />}
        <Segmented value={duty.mode} options={MODE_OPTIONS} onChange={(mode) => set({ mode })} />
      </div>

      {duty.mode === 'single' && (
        <label className="block w-1/2 pr-1.5">
          <Label>Date</Label>
          <DmyDateInput value={duty.from} onChange={(from) => set({ from })} />
        </label>
      )}
      {duty.mode === 'range' && (
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <Label>From</Label>
            <DmyDateInput value={duty.from} onChange={(from) => set({ from, ...(from && duty.to && from > duty.to ? { to: from } : {}) })} />
          </label>
          <label className="block">
            <Label hint={rangeDays(duty.from, duty.to) ? `${rangeDays(duty.from, duty.to)} day${rangeDays(duty.from, duty.to) > 1 ? 's' : ''}` : undefined}>To</Label>
            <DmyDateInput value={duty.to} onChange={(to) => set({ to })} />
          </label>
        </div>
      )}
      {duty.mode === 'dates' && (
        <div>
          <Label hint="pick a date to add it">Dates</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {duty.dates.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] text-[#9D174D]" style={{ borderColor: `${WINE}55`, background: WINE_BAND }}>
                {d.split('-').reverse().join('/')}
                <button type="button" aria-label="Remove date" className="cursor-pointer opacity-70 hover:opacity-100" onClick={() => set({ dates: duty.dates.filter((x) => x !== d) })}>×</button>
              </span>
            ))}
            <input
              type="date"
              className={`${FIELD} !w-auto !py-1`}
              value={pendingDate}
              onChange={(e) => addDate(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

interface Props {
  mode: 'new' | 'edit' | 'duplicate';
  /** The certificate being edited, or the source of a duplicate. */
  cert?: ExamDutyCertificate;
  /** Session to start a new certificate in (the page's current session). */
  session?: { label: string; year: number };
  onClose: () => void;
  onSaved?: (cert: ExamDutyCertificate) => void;
}

export function ExamDutyCertificateModal({ mode, cert, session, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const isEdit = mode === 'edit' && !!cert;
  const [form, setForm] = useState<FormState>(() => initialForm(mode, cert, session));
  const [serialTouched, setSerialTouched] = useState(isEdit);
  const [peekTick, setPeekTick] = useState(0);
  const [staff, setStaff] = useState<ExamDutyStaff[]>([]);
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
    return () => { cancelled = true; };
  }, []);

  // Suggest the next free serial for the session unless the user typed one.
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

  const content: ExamCertContent = useMemo(() => {
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
      duties: form.duties.map(cleanDuty),
      refNo: examRefNo(label, yr, Number(form.serial) || 0),
      issueDate: form.issueDate,
    };
  }, [form, year]);

  const generated = useMemo(() => buildExamCertBody(content), [content]);
  const bodyText = form.bodyEdited ? form.bodyOverride : generated;
  const previewHtml = useDeferredValue(
    buildExamCertHTML([{ ...content, bodyOverride: form.bodyEdited ? form.bodyOverride : undefined }], { preview: true })
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

  function updateDuty(i: number, d: ExamDuty) {
    set({ duties: form.duties.map((x, j) => (j === i ? d : x)) });
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
        ? await updateExamCert(cert, input)
        : await createExamCert(input, { uid: user?.uid ?? '', email: user?.email }, !serialTouched);
      onSaved?.(saved);
      if (after === 'print') printExamCerts([saved], printWin);
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
          bodyOverride: '',
          bodyEdited: false,
        }));
        setSerialTouched(false);
        setPeekTick((t) => t + 1);
        listExamStaff().then(setStaff).catch(() => {});
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

  const title = isEdit ? `Edit Certificate · ${cert.refNo}` : mode === 'duplicate' ? 'New Certificate (copied duties)' : 'New Attendance Certificate';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 font-wp" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
      <div className="absolute inset-0 bg-black/40" onClick={() => !saving && onClose()} aria-hidden="true" />
      <div
        className="relative w-full max-w-[1180px] max-h-[94vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border"
        style={{ borderColor: WINE_HAIR, animation: 'modal-enter 0.25s ease-out' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: WINE_HAIR, background: WINE_BAND }}>
          <div className="min-w-0">
            <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">Exam Duty · Attendance Certificate</p>
            <h3 className="mt-1 text-[16px] font-bold leading-tight truncate" style={{ color: WINE_INK }}>{title}</h3>
          </div>
          <span className="flex-1" />
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-[#9D174D] hover:bg-white cursor-pointer">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] overflow-hidden">
          {/* Form */}
          <div className="overflow-y-auto px-5 py-4 space-y-5">
            <section>
              <SectionTitle n={1}>Exam session &amp; reference</SectionTitle>
              <div className="grid grid-cols-[1.3fr_0.9fr_0.8fr_1.1fr] gap-2.5">
                <label className="block">
                  <Label>Session</Label>
                  <input
                    className={FIELD}
                    list="exam-session-labels"
                    value={form.sessionLabel}
                    placeholder="APR/MAY"
                    style={{ textTransform: 'uppercase' }}
                    onChange={(e) => set({ sessionLabel: e.target.value.toUpperCase() })}
                  />
                  <datalist id="exam-session-labels">
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
                {serialTouched && !isEdit && (
                  <button type="button" className="ml-2 text-[#BE185D] hover:underline cursor-pointer" onClick={() => setSerialTouched(false)}>use next free number</button>
                )}
              </p>
            </section>

            <section>
              <SectionTitle n={2}>Staff details</SectionTitle>
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
                    placeholder="e.g. DEEPAK DONGRE G"
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
                  <input className={FIELD} list="exam-designations" value={form.designation} placeholder="e.g. Selection Grade Lecturer & HOD" onChange={(e) => set({ designation: e.target.value })} />
                  <datalist id="exam-designations">{DESIGNATIONS.map((d) => <option key={d} value={d} />)}</datalist>
                </label>
                <label className="block">
                  <Label hint="optional">Department / Course</Label>
                  <input className={FIELD} list="exam-departments" value={form.department} placeholder="e.g. Mechanical Engineering" onChange={(e) => set({ department: e.target.value })} />
                  <datalist id="exam-departments">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
                </label>
              </div>
              <label className="block mt-2.5">
                <Label hint="include the place">Polytechnic / Institution</Label>
                <input
                  className={FIELD}
                  list="exam-polytechnics"
                  value={form.polytechnic}
                  placeholder="e.g. GOVT. POLYTECHNIC, SORABA"
                  style={{ textTransform: 'uppercase' }}
                  onChange={(e) => set({ polytechnic: e.target.value.toUpperCase() })}
                />
                <datalist id="exam-polytechnics">{polytechnicOptions.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
            </section>

            <section>
              <SectionTitle n={3}>Duties carried out</SectionTitle>
              <div className="space-y-2.5">
                {form.duties.map((d, i) => (
                  <DutyEditor
                    key={i}
                    duty={d}
                    index={i}
                    count={form.duties.length}
                    onChange={(nd) => updateDuty(i, nd)}
                    onRemove={() => set({ duties: form.duties.filter((_, j) => j !== i) })}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => set({ duties: [...form.duties, blankDuty(form.duties[form.duties.length - 1])] })}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-dashed px-3.5 py-1.5 text-[12px] font-medium cursor-pointer hover:bg-[#FDF0F5]"
                style={{ borderColor: `${WINE}80`, color: WINE_INK }}
              >
                + Add another duty
              </button>
            </section>

            <section>
              <SectionTitle n={4}>Certificate text</SectionTitle>
              <textarea
                className={`${FIELD} leading-relaxed resize-y min-h-[120px]`}
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
                  <span className="text-[#7A6F7D]">Generated from the details above. Edit freely if a case needs different wording.</span>
                )}
              </div>
            </section>
          </div>

          {/* Preview — scrollbar gutter is reserved so the scrollbar appearing
              can't narrow the column, which would shrink the scaled preview,
              hide the scrollbar again, and loop forever (visible shaking). */}
          <div className="hidden lg:flex flex-col gap-2 border-l px-5 py-4 overflow-y-auto [scrollbar-gutter:stable]" style={{ borderColor: WINE_HAIR, background: '#FBF8FA' }}>
            <div className="flex items-baseline justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#7A6F7D]">Preview · half A4</span>
              <span className="text-[10.5px] text-[#A9A2AC]">Prints staff + office copy on one A4 sheet</span>
            </div>
            <ScaledPreview html={previewHtml} height={HALF_A4_H} />
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
            <button type="button" onClick={() => void save('new')} disabled={saving} className="rounded-full border px-4 py-2 text-[12.5px] font-medium hover:bg-[#FDF0F5] cursor-pointer disabled:opacity-50" style={{ borderColor: `${WINE}80`, color: WINE_INK }} title="Save, then start the next certificate with the same session and duties">
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
