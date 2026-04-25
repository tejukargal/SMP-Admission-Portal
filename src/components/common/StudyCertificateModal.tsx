import { useState, useEffect } from 'react';
import type { Student } from '../../types';
import { buildStudyCertHTML, generateStudyCertificate, type CertificateType } from '../../utils/studyCertificate';

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
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handlePreview() {
    setPreviewHtml(buildStudyCertHTML(student, selected));
  }

  function handlePrint() {
    generateStudyCertificate(student, selected);
    onClose();
  }

  const CERT_LABELS: Record<CertificateType, string> = {
    STUDYING: 'Currently Studying',
    COMPLETED: 'Course Completed',
    CANCELLED: 'Discontinued',
  };

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
                Print Preview — Study Certificate
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 truncate max-w-xs">
                {student.studentNameSSLC}
              </span>
              <span className="inline-flex items-center rounded-full text-[10px] font-semibold px-2 py-0.5 bg-blue-500/30 text-blue-100 border border-blue-400/30 shrink-0">
                {CERT_LABELS[selected]}
              </span>
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
              Prints on a single A4 sheet. Verify all details before printing.
            </span>
          </div>

          {/* Preview iframe */}
          <div className="flex-1 overflow-auto min-h-0 bg-slate-300">
            <iframe
              srcDoc={previewHtml}
              title="Study Certificate Print Preview"
              scrolling="no"
              className="w-full border-0 block"
              style={{ height: '1250px' }}
            />
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0 flex items-center justify-between">
            <button
              onClick={() => setPreviewHtml('')}
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
                className="rounded-lg bg-slate-700 text-white px-4 py-1.5 text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Print
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Selection mode ──
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
            onClick={handlePreview}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Preview & Print
          </button>
        </div>
      </div>
    </div>
  );
}
