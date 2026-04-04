import { useState, useEffect } from 'react';
import type { Student } from '../../types';
import {
  generateProvisionalCertificate,
  PC_COURSE_NAMES,
  type PCFormData,
} from '../../utils/provisionalCertificate';
import {
  savePcRecord,
  getPcRecordsByStudent,
  type PCRecord,
} from '../../services/pcService';

interface Props {
  student: Student;
  onClose: () => void;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function isoToDDMMYYYY(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatDisplayDate(ddmmyyyy: string): string {
  if (!ddmmyyyy) return '—';
  return ddmmyyyy;
}

const RESULT_CLASSES = ['DISTINCTION', 'FIRST CLASS', 'SECOND CLASS', 'PASS CLASS'];

const inp = 'w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

export function ProvisionalCertificateModal({ student, onClose }: Props) {
  const [dateIssueISO,  setDateIssueISO]  = useState(todayISO);
  const [examPeriod,    setExamPeriod]    = useState('');
  const [regNumber,     setRegNumber]     = useState(student.regNumber?.trim() ?? '');
  const [resultClass,   setResultClass]   = useState('FIRST CLASS');
  const [generating,    setGenerating]    = useState(false);

  const [priorPcs,      setPriorPcs]      = useState<PCRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fetch PC history for this student
  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    getPcRecordsByStudent(student.id)
      .then((records) => { if (!cancelled) setPriorPcs(records); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [student.id]);

  const isDuplicate = priorPcs.length > 0;
  const canGenerate = !loadingHistory && dateIssueISO !== '' && examPeriod.trim() !== '' && regNumber.trim() !== '';

  async function handleGenerate() {
    if (!canGenerate || generating) return;
    setGenerating(true);
    try {
      // Persist issuance record
      await savePcRecord(student.id, {
        studentId:   student.id,
        studentName: student.studentNameSSLC,
        examPeriod:  examPeriod.trim(),
        regNumber:   regNumber.trim(),
        resultClass,
        dateOfIssue: isoToDDMMYYYY(dateIssueISO),
        isDuplicate,
        issuedAt:    new Date().toISOString(),
      }).catch(() => {});

      const data: PCFormData = {
        dateOfIssue: isoToDDMMYYYY(dateIssueISO),
        examPeriod:  examPeriod.trim(),
        regNumber:   regNumber.trim(),
        resultClass,
        isDuplicate,
      };
      generateProvisionalCertificate(student, data);
      onClose();
    } finally {
      setGenerating(false);
    }
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
              <h3 className="text-sm font-semibold text-gray-900">Provisional Certificate</h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px]">{student.studentNameSSLC}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5 flex-shrink-0"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

          {/* PC history status */}
          {loadingHistory ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin flex-shrink-0" />
              Checking PC history…
            </div>
          ) : isDuplicate ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-2">
                <span>⚠</span> PC already issued — this will print as{' '}
                <span className="uppercase tracking-wide">Duplicate Copy</span>
              </div>
              <div className="space-y-1">
                {priorPcs.map((pc) => (
                  <div key={pc.id} className="flex items-center gap-2 text-xs text-amber-700">
                    <span className="font-medium">{pc.examPeriod}</span>
                    <span className="text-amber-500">·</span>
                    <span>{pc.resultClass}</span>
                    <span className="text-amber-500">·</span>
                    <span>Issued {formatDisplayDate(pc.dateOfIssue)}</span>
                    {pc.isDuplicate && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">
                        Duplicate
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-green-700">
              <span>✓</span> No prior PC issued — this will be the original certificate.
            </div>
          )}

          {/* Pre-filled info */}
          <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-500 space-y-0.5">
            <div>
              <span className="font-medium text-gray-700">Course:</span>{' '}
              {PC_COURSE_NAMES[student.course] ?? student.course}
            </div>
            <div>
              <span className="font-medium text-gray-700">Year:</span> {student.year}
            </div>
            <div>
              <span className="font-medium text-gray-700">Gender:</span>{' '}
              {student.gender === 'GIRL' ? 'GIRL (will use "Kum." / "her")' : 'BOY (will use "Sri." / "his")'}
            </div>
          </div>

          {/* Date of Issue */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Date of Issue <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dateIssueISO}
              onChange={(e) => setDateIssueISO(e.target.value)}
              className={inp}
            />
          </div>

          {/* Exam Period & Register Number */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Exam Held During <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={examPeriod}
                onChange={(e) => setExamPeriod(e.target.value.toUpperCase())}
                placeholder="e.g. MAY-2024"
                className={inp}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Register No. <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={regNumber}
                onChange={(e) => setRegNumber(e.target.value.toUpperCase())}
                placeholder="e.g. 308EC17024"
                className={inp}
              />
            </div>
          </div>

          {/* Result Class */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Result Class</label>
            <select
              value={resultClass}
              onChange={(e) => setResultClass(e.target.value)}
              className={inp}
            >
              {RESULT_CLASSES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Eligibility reminder */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            <strong>Note:</strong> This certificate is only to be issued to 3rd year students who have completed all 3 years and passed all subjects.
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 flex justify-end gap-2 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleGenerate()}
            disabled={!canGenerate || generating}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating…' : isDuplicate ? 'Generate Duplicate' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
