import { useEffect, useState } from 'react';
import type { Student } from '../../types';
import { buildAnsLetterHTML, generateAnsLetter } from '../../utils/ansLetter';

interface Props {
  student: Student;
  onClose: () => void;
}

export function AnsLetterPreviewModal({ student, onClose }: Props) {
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    setPreviewHtml(buildAnsLetterHTML(student));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handlePrint() {
    generateAnsLetter(student);
    onClose();
  }

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

        {/* ── Header ── */}
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
              Print Preview — ANS Letter
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 truncate max-w-xs">
              {student.studentNameSSLC}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer shrink-0 ml-3"
          >
            ×
          </button>
        </div>

        {/* ── Info banner ── */}
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 shrink-0">
          <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="text-xs text-blue-700">
            Prints on a single A4 sheet — Intimation Letter with tear-off mailing section.
          </span>
        </div>

        {/* ── Preview iframe ── */}
        <div className="flex-1 overflow-auto min-h-0 bg-slate-300">
          {previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              title="ANS Letter Print Preview"
              className="w-full border-0 block"
              style={{ height: '900px' }}
            />
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="skeleton h-4 w-32 rounded" />
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            Verify all details before printing
          </span>
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
