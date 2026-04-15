import { useState, useEffect } from 'react';
import type { Student } from '../../types';
import { generateAdmissionLetter, generateAdmissionLetterKannada } from '../../utils/admissionLetter';

interface Props {
  student: Student;
  lang: 'en' | 'kn';
  onClose: () => void;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function displayDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function displayTime(hhmm: string): string {
  const [hStr, minStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const min = minStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${ampm}`;
}

export function AdmissionLetterModal({ student, lang, onClose }: Props) {
  const [reportDate, setReportDate]   = useState(todayStr());
  const [reportTime, setReportTime]   = useState('11:00');
  const [contactNum, setContactNum]   = useState('9449685992');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleGenerate() {
    const fn = lang === 'kn' ? generateAdmissionLetterKannada : generateAdmissionLetter;
    fn(student, displayTime(reportTime), displayDate(reportDate), contactNum);
    onClose();
  }

  const ready = reportDate !== '' && reportTime !== '' && contactNum.trim() !== '';

  const isKn = lang === 'kn';
  const langLabel = isKn ? 'ಕನ್ನಡ' : 'English';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Seat Allotment Intimation Letter</h3>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  isKn ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {langLabel}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[240px]">
                {student.studentNameSSLC} — {student.course} / {student.year}
              </p>
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

        {/* Fields */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">
            Specify the reporting deadline and contact number to include in the letter.
          </p>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Report On or Before (Date)
            </label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Time */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Report By (Time)
            </label>
            <input
              type="time"
              value={reportTime}
              onChange={(e) => setReportTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Contact number */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Contact Number (for letter)
            </label>
            <input
              type="tel"
              value={contactNum}
              onChange={(e) => setContactNum(e.target.value)}
              placeholder="e.g. 9449685992"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Preview note */}
          {ready && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 leading-relaxed">
              Letter will direct <strong>{student.studentNameSSLC}</strong> to report by{' '}
              <strong>{displayTime(reportTime)}</strong> on{' '}
              <strong>{displayDate(reportDate)}</strong>. Contact:{' '}
              <strong>{contactNum}</strong>.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!ready}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Letter
          </button>
        </div>
      </div>
    </div>
  );
}
