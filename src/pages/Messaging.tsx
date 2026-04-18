import { useState, useMemo, useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { useFeeOverrides } from '../hooks/useFeeOverrides';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { sendBulkSMS } from '../services/messagingService';
import type { SMSRecipient, SMSResult } from '../services/messagingService';
import type { Course, Year, AcademicYear, FeeStructure } from '../types';
import { SMP_FEE_HEADS } from '../types';

type SendTarget = 'student' | 'father' | 'both';
type FeeFilter = 'all' | 'dues' | 'no-dues';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const MOBILE_RE = /^[6-9]\d{9}$/;

const VARIABLE_TOKENS = [
  { token: '{name}',          label: 'Student Name'  },
  { token: '{father}',        label: 'Father Name'   },
  { token: '{reg}',           label: 'Reg No'        },
  { token: '{course}',        label: 'Course'        },
  { token: '{year}',          label: 'Year'          },
  { token: '{academicYear}',  label: 'Academic Year' },
  { token: '{dueAmount}',     label: 'Due Amount'    },
];

const TEMPLATES = [
  {
    label: 'Fee Reminder',
    text: 'Dear {name}, your fee of {dueAmount} for {academicYear} ({year}, {course}) is pending. Please pay at the earliest. - SMPCLG',
  },
  {
    label: 'No Dues Confirmation',
    text: 'Dear {name}, you have no pending fee dues for {academicYear}. - SMPCLG',
  },
  {
    label: 'General Notice',
    text: 'Dear {name}, please note: ',
  },
  { label: 'Custom', text: '' },
];

export function Messaging() {
  const { settings } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  // Filters
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [feeFilter, setFeeFilter] = useState<FeeFilter>('all');
  const [sendTarget, setSendTarget] = useState<SendTarget>('student');

  // Compose
  const [messageText, setMessageText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Send state
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SMSResult | null>(null);
  const [sendError, setSendError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Fee structures (loaded once per year)
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  const { students: allStudents, loading: studentsLoading } = useStudents(academicYear);
  const { records: feeRecords } = useFeeRecords(academicYear);
  const { overrides: feeOverrides } = useFeeOverrides(academicYear);

  useEffect(() => {
    if (!academicYear) { setFeeStructures([]); return; }
    getFeeStructuresByAcademicYear(academicYear).then(setFeeStructures).catch(() => {});
  }, [academicYear]);

  // ── Dues calculation (mirrors FeeReportsPage exactly) ───────────────────────

  const overrideByStudent = useMemo(
    () => new Map(feeOverrides.map((o) => [o.studentId, o])),
    [feeOverrides],
  );

  const { smpAllottedNoFineByKey, structureFineByKey, svkAllottedByKey } = useMemo(() => {
    const smpNoFineMap = new Map<string, number>();
    const fineMap      = new Map<string, number>();
    const svkMap       = new Map<string, number>();
    for (const s of feeStructures) {
      const key = `${s.course}__${s.year}__${s.admType}__${s.admCat}`;
      smpNoFineMap.set(key, SMP_FEE_HEADS.reduce((t, { key: k }) => t + (k === 'fine' ? 0 : s.smp[k]), 0));
      fineMap.set(key, s.smp.fine);
      svkMap.set(key, s.svk + s.additionalHeads.reduce((t, h) => t + h.amount, 0));
    }
    return { smpAllottedNoFineByKey: smpNoFineMap, structureFineByKey: fineMap, svkAllottedByKey: svkMap };
  }, [feeStructures]);

  const { smpPaidByStudent, svkPaidByStudent, finePaidByStudent } = useMemo(() => {
    const smpMap  = new Map<string, number>();
    const svkMap  = new Map<string, number>();
    const fineMap = new Map<string, number>();
    for (const r of feeRecords) {
      const smpTotal = SMP_FEE_HEADS.reduce((t, { key }) => t + r.smp[key], 0);
      const svkTotal = r.svk + r.additionalPaid.reduce((t, h) => t + h.amount, 0);
      smpMap.set(r.studentId,  (smpMap.get(r.studentId)  ?? 0) + smpTotal);
      svkMap.set(r.studentId,  (svkMap.get(r.studentId)  ?? 0) + svkTotal);
      fineMap.set(r.studentId, (fineMap.get(r.studentId) ?? 0) + r.smp.fine);
    }
    return { smpPaidByStudent: smpMap, svkPaidByStudent: svkMap, finePaidByStudent: fineMap };
  }, [feeRecords]);

  const allStudentRows = useMemo(() =>
    allStudents.map((s) => {
      const override = overrideByStudent.get(s.id);
      const key      = `${s.course}__${s.year}__${s.admType}__${s.admCat}`;
      const finePaid = finePaidByStudent.get(s.id) ?? 0;

      let smpAllotted: number | null;
      let svkAllotted: number | null;

      if (override) {
        const effFine   = Math.max(override.smp.fine, finePaid);
        const smpNoFine = SMP_FEE_HEADS.reduce((t, { key: k }) => t + (k === 'fine' ? 0 : override.smp[k]), 0);
        smpAllotted = smpNoFine + effFine;
        svkAllotted = override.svk + override.additionalHeads.reduce((t, h) => t + h.amount, 0);
      } else {
        const smpNoFine  = smpAllottedNoFineByKey.has(key) ? smpAllottedNoFineByKey.get(key)! : null;
        const structFine = structureFineByKey.get(key) ?? 0;
        const effFine    = Math.max(structFine, finePaid);
        smpAllotted = smpNoFine !== null ? smpNoFine + effFine : null;
        svkAllotted = svkAllottedByKey.has(key) ? svkAllottedByKey.get(key)! : null;
      }

      const allotted = smpAllotted !== null ? smpAllotted + (svkAllotted ?? 0) : null;
      const paid     = (smpPaidByStudent.get(s.id) ?? 0) + (svkPaidByStudent.get(s.id) ?? 0);
      const balance  = allotted !== null ? allotted - paid : null;
      return { student: s, balance };
    }),
    [allStudents, overrideByStudent, smpAllottedNoFineByKey, structureFineByKey,
     svkAllottedByKey, smpPaidByStudent, svkPaidByStudent, finePaidByStudent],
  );

  // ── Filtered students ────────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    let rows = allStudentRows;
    if (courseFilter) rows = rows.filter((r) => r.student.course === courseFilter);
    if (yearFilter)   rows = rows.filter((r) => r.student.year   === yearFilter);
    if (feeFilter === 'dues')    rows = rows.filter((r) => r.balance !== null && r.balance > 0);
    if (feeFilter === 'no-dues') rows = rows.filter((r) => r.balance !== null && r.balance <= 0);
    return rows;
  }, [allStudentRows, courseFilter, yearFilter, feeFilter]);

  // ── Build recipients list ────────────────────────────────────────────────────

  const recipients = useMemo((): SMSRecipient[] => {
    if (!messageText.trim() || !academicYear) return [];
    return filteredRows.flatMap((r) => {
      const phones: string[] = [];
      if ((sendTarget === 'student' || sendTarget === 'both') && MOBILE_RE.test(r.student.studentMobile))
        phones.push(r.student.studentMobile);
      if ((sendTarget === 'father'  || sendTarget === 'both') && MOBILE_RE.test(r.student.fatherMobile))
        phones.push(r.student.fatherMobile);
      if (phones.length === 0) return [];
      return [{
        studentId:       r.student.id,
        name:            r.student.studentNameSSLC,
        fatherName:      r.student.fatherName,
        reg:             r.student.regNumber,
        course:          r.student.course,
        year:            r.student.year,
        academicYear,
        dueAmount:       Math.max(0, r.balance ?? 0),
        messageTemplate: messageText,
        phones,
      }];
    });
  }, [filteredRows, sendTarget, messageText, academicYear]);

  // Deduplicated phone count
  const uniquePhones = useMemo(
    () => new Set(recipients.flatMap((r) => r.phones)).size,
    [recipients],
  );

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function insertToken(token: string) {
    const el = textareaRef.current;
    if (!el) { setMessageText((t) => t + token); return; }
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const next  = messageText.slice(0, start) + token + messageText.slice(end);
    setMessageText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  // First 3 personalized previews
  const previews = useMemo(() => {
    if (!messageText.trim()) return [];
    return filteredRows.slice(0, 3).map((r) =>
      messageText
        .replace(/\{name\}/g, r.student.studentNameSSLC)
        .replace(/\{father\}/g, r.student.fatherName)
        .replace(/\{reg\}/g, r.student.regNumber)
        .replace(/\{course\}/g, r.student.course)
        .replace(/\{year\}/g, r.student.year)
        .replace(/\{academicYear\}/g, academicYear ?? '')
        .replace(/\{dueAmount\}/g, (r.balance ?? 0) > 0 ? `Rs.${r.balance}` : 'Nil'),
    );
  }, [filteredRows, messageText, academicYear]);

  async function handleSend() {
    setConfirmOpen(false);
    setSending(true);
    setSendError('');
    setResult(null);
    try {
      const res = await sendBulkSMS(recipients);
      setResult(res);
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'Failed to send SMS. Check your API key in Settings → Messaging.');
    } finally {
      setSending(false);
    }
  }

  const fs = 'rounded border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer';

  return (
    <div className="p-4 space-y-4 max-w-4xl" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* Page header */}
      <div className="flex items-baseline gap-3">
        <h1 className="text-base font-semibold text-gray-900">Bulk SMS</h1>
        {academicYear && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {academicYear}
          </span>
        )}
      </div>

      {/* ── Step 1: Recipients ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          1 · Select Recipients
        </h2>

        <div className="flex flex-wrap gap-3">
          {/* Course */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Course</label>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value as Course | '')}
              className={fs}
            >
              <option value="">All Courses</option>
              {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Year of Study */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Year</label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value as Year | '')}
              className={fs}
            >
              <option value="">All Years</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Fee Status */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Fee Status</label>
            <select
              value={feeFilter}
              onChange={(e) => setFeeFilter(e.target.value as FeeFilter)}
              className={fs}
            >
              <option value="all">All Students</option>
              <option value="dues">Fee Dues Only</option>
              <option value="no-dues">No Dues Only</option>
            </select>
          </div>

          {/* Send To */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Send To</label>
            <select
              value={sendTarget}
              onChange={(e) => setSendTarget(e.target.value as SendTarget)}
              className={fs}
            >
              <option value="student">Student Mobile</option>
              <option value="father">Father Mobile</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>

        {/* Recipient count */}
        <div className="flex items-center gap-3 pt-1">
          {studentsLoading ? (
            <span className="text-xs text-gray-400">Loading students…</span>
          ) : (
            <>
              <span className="text-xs text-gray-700">
                <span className="font-semibold text-blue-700">{filteredRows.length}</span> students
                {' · '}
                <span className="font-semibold text-blue-700">{uniquePhones}</span> unique numbers
              </span>
              {filteredRows.length !== allStudentRows.length && (
                <span className="text-[10px] text-gray-400">
                  ({allStudentRows.length} total in {academicYear})
                </span>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Step 2: Compose ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          2 · Compose Message
        </h2>

        {/* Template picker */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 shrink-0">Template:</label>
          <select
            className={fs}
            onChange={(e) => {
              const tpl = TEMPLATES.find((t) => t.label === e.target.value);
              if (tpl && tpl.text) setMessageText(tpl.text);
            }}
            defaultValue=""
          >
            <option value="" disabled>Choose a template…</option>
            {TEMPLATES.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
          </select>
        </div>

        {/* Variable token buttons */}
        <div className="space-y-1">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
            Insert Variable
          </p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLE_TOKENS.map(({ token, label }) => (
              <button
                key={token}
                type="button"
                onClick={() => insertToken(token)}
                className="px-2 py-1 text-[11px] rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer font-mono"
              >
                {token}
                <span className="ml-1 text-[10px] font-sans text-blue-400 font-normal">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Message textarea */}
        <textarea
          ref={textareaRef}
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          rows={4}
          placeholder="Type your message here, or choose a template above."
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
        />

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-gray-400">
            {messageText.length} chars
            {messageText.length > 160 && (
              <span className="ml-1 text-amber-600">
                · {Math.ceil(messageText.length / 153)} SMS units
              </span>
            )}
          </span>
          {messageText.length > 0 && (
            <button
              type="button"
              onClick={() => setMessageText('')}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* ── Step 3: Preview ─────────────────────────────────────────────────── */}
      {previews.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            3 · Preview (first {previews.length})
          </h2>
          <div className="space-y-2">
            {previews.map((preview, i) => (
              <div key={i} className="bg-gray-50 rounded border border-gray-100 px-3 py-2">
                <p className="text-[10px] font-medium text-gray-400 mb-0.5">
                  {filteredRows[i]?.student.studentNameSSLC} · {filteredRows[i]?.student.course} · {filteredRows[i]?.student.year}
                </p>
                <p className="text-xs text-gray-800">{preview}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Step 4: Send ────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold text-blue-700">{uniquePhones}</p>
            <p className="text-xs text-gray-500">
              numbers to be messaged
              <span className="ml-1 text-gray-400">
                (~₹{(uniquePhones * 0.15).toFixed(2)} est.)
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!messageText.trim() || uniquePhones === 0 || sending}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {sending ? 'Sending…' : `Send to ${uniquePhones} numbers`}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            <span className="font-semibold">Sent successfully.</span>
            {' '}Delivered: <strong>{result.successCount}</strong>
            {result.failCount > 0 && (
              <span className="text-amber-700"> · Failed: <strong>{result.failCount}</strong></span>
            )}
            {' '}· Total: <strong>{result.total}</strong>
          </div>
        )}
        {sendError && (
          <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {sendError}
          </p>
        )}
      </section>

      {/* ── Confirm dialog ───────────────────────────────────────────────────── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setConfirmOpen(false)}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Confirm Bulk SMS</h3>
            <p className="text-sm text-gray-600">
              Send <span className="font-semibold text-blue-700">{uniquePhones} SMS messages</span>
              {' '}to {filteredRows.length} student{filteredRows.length !== 1 ? 's' : ''}?
            </p>
            <div className="bg-gray-50 rounded border border-gray-200 px-3 py-2 text-xs text-gray-700 font-mono break-words">
              {messageText.slice(0, 120)}{messageText.length > 120 ? '…' : ''}
            </div>
            <p className="text-[11px] text-amber-600">
              This will consume Fast2SMS credits and cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleSend(); }}
                className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
              >
                Yes, Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
