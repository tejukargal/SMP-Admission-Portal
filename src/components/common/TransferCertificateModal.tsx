import { useState, useEffect, useRef } from 'react';
import type { Student } from '../../types';
import {
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

  async function handleGenerate() {
    if (!canGenerate || generating) return;
    setGenerating(true);
    try {
      // 1. Save / advance counter
      const match = /^(\d+)\//.exec(tcNumber.trim());
      if (match) {
        const seq    = parseInt(match[1], 10);
        const acYrFinal = autoAcademicYearRef.current || acYear;
        if (seq > 0) await saveTcCounter(acYrFinal, seq).catch(() => {});
      }

      // 2. Persist issuance record into student document
      await saveTcRecord(student.id, {
        studentId:       student.id,
        studentName:     student.studentNameSSLC,
        tcNumber:        tcNumber.trim(),
        dateOfAdmission: isoToDDMMYYYY(dateAdmISO),
        dateOfLeaving:   isoToDDMMYYYY(dateLeaveISO),
        semester,
        course:          student.course,
        lastExam,
        result,
        isDuplicate,
        issuedAt:        new Date().toISOString(),
      }).catch(() => {});

      // 3. Generate PDF
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
      generateTransferCertificate(student, data);
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
            onClick={handleGenerate}
            disabled={!canGenerate || generating || loadingTc}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating…' : isDuplicate ? 'Generate Duplicate' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
