import { useState, useEffect } from 'react';
import type { Student } from '../../types';
import {
  generateCourseCompletionCertificate,
  CCC_COURSE_NAMES,
  computeFromYear,
  type CCCFormData,
} from '../../utils/courseCompletionCertificate';
import { getNextCccNumber, certAcademicYear } from '../../services/cccService';

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

function refPrefix(acadYear: string): string {
  return `SMP/EXAM/${acadYear}/`;
}

const inp = 'w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500';

export function CourseCompletionCertificateModal({ student, onClose }: Props) {
  const [dateIssueISO, setDateIssueISO] = useState(todayISO);
  const [examPeriod,   setExamPeriod]   = useState('');
  const [regNumber,    setRegNumber]    = useState(student.regNumber?.trim() ?? '');
  const [generating,   setGenerating]   = useState(false);

  const acadYear = certAcademicYear(dateIssueISO ? new Date(dateIssueISO) : new Date());
  const [refNumber, setRefNumber] = useState(() => refPrefix(acadYear));

  // When the date changes, update the academic year portion of the ref number
  // while preserving any number the user has already typed after the last slash.
  useEffect(() => {
    const newPrefix = refPrefix(certAcademicYear(dateIssueISO ? new Date(dateIssueISO) : new Date()));
    setRefNumber((prev) => {
      const lastSlash = prev.lastIndexOf('/');
      const suffix = lastSlash !== -1 ? prev.slice(lastSlash + 1) : '';
      return newPrefix + suffix;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateIssueISO]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const numberSuffix = refNumber.slice(refNumber.lastIndexOf('/') + 1).trim();
  const canGenerate  = dateIssueISO !== '' && examPeriod.trim() !== '' && regNumber.trim() !== '';

  async function handleGenerate() {
    if (!canGenerate || generating) return;
    setGenerating(true);
    try {
      let finalRef = refNumber.trim();

      // If user left the number part blank, auto-assign the next counter value.
      if (!numberSuffix) {
        const ay  = certAcademicYear(new Date(dateIssueISO));
        const num = await getNextCccNumber();
        finalRef  = `SMP/EXAM/${ay}/${String(num).padStart(4, '0')}`;
      }

      const data: CCCFormData = {
        dateOfIssue: isoToDDMMYYYY(dateIssueISO),
        refNumber:   finalRef,
        examPeriod:  examPeriod.trim(),
        regNumber:   regNumber.trim(),
      };
      generateCourseCompletionCertificate(student, data);
      onClose();
    } finally {
      setGenerating(false);
    }
  }

  const fromYear = computeFromYear(student.academicYear, student.admType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Course Completion Certificate</h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px]">{student.studentNameSSLC}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5" aria-label="Close">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">

          {/* Pre-filled info */}
          <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-500 space-y-0.5">
            <div>
              <span className="font-medium text-gray-700">Course:</span>{' '}
              {CCC_COURSE_NAMES[student.course] ?? student.course}
            </div>
            <div>
              <span className="font-medium text-gray-700">Study Period:</span>{' '}
              {fromYear} to {student.academicYear}
            </div>
            <div>
              <span className="font-medium text-gray-700">Gender:</span>{' '}
              {student.gender === 'GIRL' ? 'GIRL (will use "Kum." / "She")' : 'BOY (will use "Sri." / "He")'}
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

          {/* Ref Number */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Ref Number
              <span className="ml-1.5 text-[10px] font-normal text-gray-400">(leave number blank to auto-assign)</span>
            </label>
            <input
              type="text"
              value={refNumber}
              onChange={(e) => setRefNumber(e.target.value.toUpperCase())}
              className={inp}
              placeholder={`SMP/EXAM/${acadYear}/0001`}
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
                placeholder="e.g. 308EC18011"
                className={inp}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 flex justify-end gap-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleGenerate()}
            disabled={!canGenerate || generating}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
