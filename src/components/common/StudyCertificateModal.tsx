import { useState, useEffect } from 'react';
import type { Student } from '../../types';
import { generateStudyCertificate, type CertificateType } from '../../utils/studyCertificate';

interface Props {
  student: Student;
  onClose: () => void;
}

const OPTIONS: { type: CertificateType; label: string; desc: string; icon: string }[] = [
  {
    type: 'STUDYING',
    label: 'Currently Studying',
    desc: 'Student is enrolled and currently attending',
    icon: '📚',
  },
  {
    type: 'COMPLETED',
    label: 'Course Completed',
    desc: 'Student has completed the diploma programme',
    icon: '🎓',
  },
  {
    type: 'CANCELLED',
    label: 'Discontinued',
    desc: 'Student left before completing the course',
    icon: '📋',
  },
];

export function StudyCertificateModal({ student, onClose }: Props) {
  const [selected, setSelected] = useState<CertificateType>('STUDYING');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleGenerate() {
    generateStudyCertificate(student, selected);
    onClose();
  }

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
              <h3 className="text-sm font-semibold text-gray-900">Study Certificate</h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[240px]">
                {student.studentNameSSLC}
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

        {/* Options */}
        <div className="px-5 py-4 space-y-2">
          <p className="text-xs text-gray-500 mb-3">Select the certificate type to generate:</p>
          {OPTIONS.map((opt) => {
            const disabled = opt.type === 'COMPLETED' && student.year !== '3RD YEAR';
            return (
              <button
                key={opt.type}
                disabled={disabled}
                onClick={() => !disabled && setSelected(opt.type)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                  disabled
                    ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    : selected === opt.type
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="text-lg leading-none">{opt.icon}</span>
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${disabled ? 'text-gray-400' : selected === opt.type ? 'text-blue-700' : 'text-gray-800'}`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {disabled ? '3rd Year students only' : opt.desc}
                  </div>
                </div>
                {!disabled && selected === opt.type && (
                  <span className="ml-auto text-blue-500 flex-shrink-0">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
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
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
