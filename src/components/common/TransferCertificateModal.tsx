import { useState, useEffect, useRef } from 'react';
import type { Student } from '../../types';
import {
  buildTCHTML,
  generateTransferCertificate,
  TC_COURSE_NAMES,
  type TCFormData,
} from '../../utils/transferCertificate';
import {
  academicYearFromDate,
  formatTcNumber,
  getNextTcSequence,
  saveTcCounter,
  saveTcRecord,
  getTcRecordsByStudent,
  type TCRecord,
} from '../../services/tcService';

interface Props {
  student: Student;
  onClose: () => void;
}

function defaultSemester(year: string): string {
  if (year === '1ST YEAR') return '2nd Semester';
  if (year === '2ND YEAR') return '4th Semester';
  return '6th Semester';
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function isoToDDMMYYYY(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function createdAtToISO(createdAt: string): string {
  if (!createdAt) return '';
  return createdAt.split('T')[0];
}

function formatDisplayDate(ddmmyyyy: string): string {
  if (!ddmmyyyy) return '—';
  const [d, m, y] = ddmmyyyy.split('/');
  return `${d}/${m}/${y}`;
}

const SEMESTERS = [
  '1st Semester', '2nd Semester', '3rd Semester',
  '4th Semester', '5th Semester', '6th Semester',
];
const RESULTS = ['Distinction', 'First Class', 'Second Class', 'Pass Class', 'Fail', 'Absent', '—'];

const inp = 'w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

export function TransferCertificateModal({ student, onClose }: Props) {
  const [tcNumber,      setTcNumber]      = useState('');
  const [loadingTc,     setLoadingTc]     = useState(false);
  const [dateAdmISO,    setDateAdmISO]    = useState(() => createdAtToISO(student.createdAt));
  const [dateLeaveISO,  setDateLeaveISO]  = useState(todayISO);
  const [semester,      setSemester]      = useState(() => defaultSemester(student.year));
  const [lastExam,      setLastExam]      = useState('');
  const [result,        setResult]        = useState('First Class');
  const [duesPaid,      setDuesPaid]      = useState(true);
  const [concession,    setConcession]    = useState(false);
  const [character,     setCharacter]     = useState('SATISFACTORY');
  const [generating,    setGenerating]    = useState(false);

  // Prior TC history
  const [priorTcs,      setPriorTcs]      = useState<TCRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Preview state
  const [previewHtml,   setPreviewHtml]   = useState('');
  const [pendingData,   setPendingData]   = useState<TCFormData | null>(null);

  // Track which academic year the current auto-generated TC number belongs to
  const autoAcademicYearRef = useRef<string>('');

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fetch TC issuance history for this student
  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    getTcRecordsByStudent(student.id)
      .then((records) => { if (!cancelled) setPriorTcs(records); })
      .catch(() => { /* non-fatal — treat as no history */ })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [student.id]);

  // Auto-generate TC number whenever the leaving date changes
  useEffect(() => {
    if (!dateLeaveISO) { setTcNumber(''); return; }
    let cancelled = false;
    const academicYear = academicYearFromDate(dateLeaveISO);
    setLoadingTc(true);
    getNextTcSequence(academicYear)
      .then((seq) => {
        if (cancelled) return;
        autoAcademicYearRef.current = academicYear;
        setTcNumber(formatTcNumber(seq, academicYear));
      })
      .catch(() => { if (!cancelled) setTcNumber(''); })
      .finally(() => { if (!cancelled) setLoadingTc(false); });
    return () => { cancelled = true; };
  }, [dateLeaveISO]);

  const isDuplicate   = priorTcs.length > 0;
  const canGenerate   = !loadingHistory && tcNumber.trim() !== '' && dateAdmISO !== '' && dateLeaveISO !== '';
  const acYear        = dateLeaveISO ? academicYearFromDate(dateLeaveISO) : '';

  function handlePreview() {
    if (!canGenerate) return;
    const data: TCFormData = {
      tcNumber:        tcNumber.trim(),
      dateOfAdmission: isoToDDMMYYYY(dateAdmISO),
      dateOfLeaving:   isoToDDMMYYYY(dateLeaveISO),
      semester,
      lastExam,
      result,
      duesPaid,
      concession,
      character,
      isDuplicate,
    };
    setPendingData(data);
    setPreviewHtml(buildTCHTML(student, data));
  }

  async function handlePrint() {
    if (!pendingData || generating) return;
    setGenerating(true);
    try {
      // 1. Save / advance counter
      const match = /^(\d+)\//.exec(pendingData.tcNumber);
      if (match) {
        const seq    = parseInt(match[1], 10);
        const acYrFinal = autoAcademicYearRef.current || acYear;
        if (seq > 0) await saveTcCounter(acYrFinal, seq).catch(() => {});
      }

      // 2. Persist issuance record into student document
      await saveTcRecord(student.id, {
        studentId:       student.id,
        studentName:     student.studentNameSSLC,
        tcNumber:        pendingData.tcNumber,
        dateOfAdmission: pendingData.dateOfAdmission,
        dateOfLeaving:   pendingData.dateOfLeaving,
        semester:        pendingData.semester,
        course:          student.course,
        lastExam:        pendingData.lastExam,
        result:          pendingData.result,
        isDuplicate:     pendingData.isDuplicate,
        issuedAt:        new Date().toISOString(),
      }).catch(() => {});

      // 3. Generate PDF
      generateTransferCertificate(student, pendingData);
      onClose();
    } finally {
      setGenerating(false);
    }
  }

  function YesNo({ value, current, onChange }: { value: boolean; current: boolean; onChange: (v: boolean) => void }) {
    return (
      <button
        type="button"
        onClick={() => onChange(value)}
        className={`flex-1 py-1.5 text-center text-sm transition-colors ${
          current === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        {value ? 'YES' : 'NO'}
      </button>
    );
  }

  // ── Preview mode ──
  if (previewHtml) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
        style={{ animation: 'backdrop-enter 0.18s ease-out' }}
      >
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div
          className="relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: '860px', maxWidth: '100%', maxHeight: 'calc(100vh - 3rem)', animation: 'modal-enter 0.22s ease-out' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-slate-700 to-slate-900 flex items-center justify-between shrink-0">
            <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                </span>
                Print Preview — Transfer Certificate
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 truncate max-w-xs">
                {student.studentNameSSLC}
              </span>
              {isDuplicate && (
                <span className="inline-flex items-center rounded-full text-[10px] font-semibold px-2 py-0.5 bg-amber-500/30 text-amber-100 border border-amber-400/30 shrink-0">
                  Duplicate Copy
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 ml-3"
            >
              ×
            </button>
          </div>

          {/* Info banner */}
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 shrink-0">
            <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span className="text-xs text-blue-700">
              TC record will be saved when you click <strong>Print</strong>. Verify all details before printing.
            </span>
          </div>

          {/* Preview iframe */}
          <div className="flex-1 overflow-auto min-h-0 bg-slate-300">
            <iframe
              srcDoc={previewHtml}
              title="Transfer Certificate Print Preview"
              className="w-full border-0 block"
              style={{ height: '1100px' }}
            />
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0 flex items-center justify-between">
            <button
              onClick={() => { setPreviewHtml(''); setPendingData(null); }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Close
              </button>
              <button
                onClick={handlePrint}
                disabled={generating}
                className="rounded-lg bg-slate-700 text-white px-4 py-1.5 text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                {generating ? 'Saving…' : 'Print'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Form mode ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Transfer Certificate</h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px]">{student.studentNameSSLC}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5 flex-shrink-0" aria-label="Close">×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

          {/* Prior TC history warning */}
          {loadingHistory ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin flex-shrink-0" />
              Checking TC history…
            </div>
          ) : isDuplicate ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-2">
                <span>⚠</span> TC already issued — this will print as <span className="uppercase tracking-wide">Duplicate Copy</span>
              </div>
              <div className="space-y-1">
                {priorTcs.map((tc) => (
                  <div key={tc.id} className="flex items-center gap-2 text-xs text-amber-700">
                    <span className="font-medium">{tc.tcNumber}</span>
                    <span className="text-amber-500">·</span>
                    <span>Issued {formatDisplayDate(tc.dateOfLeaving)}</span>
                    {tc.isDuplicate && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">Duplicate</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-green-700">
              <span>✓</span> No prior TC issued — this will be the original certificate.
            </div>
          )}

          {/* Pre-filled info */}
          <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-500 space-y-0.5">
            <div><span className="font-medium text-gray-700">Course:</span> {TC_COURSE_NAMES[student.course] ?? student.course}</div>
            <div><span className="font-medium text-gray-700">Reg No:</span> {student.regNumber || '—'}</div>
            <div><span className="font-medium text-gray-700">Category / Caste:</span> {student.category} – {student.caste}</div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Date of Admission <span className="text-red-500">*</span>
              </label>
              <input type="date" value={dateAdmISO} onChange={(e) => setDateAdmISO(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Date of Leaving <span className="text-red-500">*</span>
              </label>
              <input type="date" value={dateLeaveISO} onChange={(e) => setDateLeaveISO(e.target.value)} className={inp} />
            </div>
          </div>

          {/* TC Number */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700">
                TC Number <span className="text-red-500">*</span>
              </label>
              {acYear && <span className="text-[10px] text-gray-400">AY {acYear}</span>}
            </div>
            <div className="relative">
              <input
                type="text"
                value={loadingTc ? '' : tcNumber}
                onChange={(e) => { autoAcademicYearRef.current = acYear; setTcNumber(e.target.value); }}
                placeholder={loadingTc ? 'Fetching…' : 'e.g. 0001/2025-26'}
                disabled={loadingTc}
                className={`${inp} ${loadingTc ? 'bg-gray-50 text-gray-400' : ''}`}
              />
              {loadingTc && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Semester */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Class at time of leaving</label>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className={inp}>
              {SEMESTERS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Last Exam & Result */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Exam Taken</label>
              <input
                type="text"
                value={lastExam}
                onChange={(e) => setLastExam(e.target.value.toUpperCase())}
                placeholder="e.g. MAY 2024"
                className={inp}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Result</label>
              <select value={result} onChange={(e) => setResult(e.target.value)} className={inp}>
                {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Dues & Concession */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Institution Dues Paid</label>
              <div className="flex rounded border border-gray-300 overflow-hidden">
                <YesNo value={true}  current={duesPaid}  onChange={setDuesPaid} />
                <YesNo value={false} current={duesPaid}  onChange={setDuesPaid} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Concession Received</label>
              <div className="flex rounded border border-gray-300 overflow-hidden">
                <YesNo value={true}  current={concession} onChange={setConcession} />
                <YesNo value={false} current={concession} onChange={setConcession} />
              </div>
            </div>
          </div>

          {/* Character */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Character</label>
            <input
              type="text"
              value={character}
              onChange={(e) => setCharacter(e.target.value.toUpperCase())}
              className={inp}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 flex justify-end gap-2 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handlePreview}
            disabled={!canGenerate || loadingTc}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            {isDuplicate ? 'Preview Duplicate' : 'Preview & Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
