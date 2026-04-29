import { useEffect, useState } from 'react';
import type { Student } from '../../types';
import { buildAdmissionOrderHTML, generateAdmissionOrder } from '../../utils/admissionOrder';

interface Props {
  student: Student;
  onClose: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AdmissionOrderModal({ student, onClose }: Props) {
  const [counsellingDate, setCounsellingDate] = useState(todayISO);
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handlePreview() {
    setPreviewHtml(buildAdmissionOrderHTML(student, counsellingDate));
  }

  function handlePrint() {
    generateAdmissionOrder(student, counsellingDate);
    onClose();
  }

  const hasAllottedCategory = !!student.allottedCategory;

  // ── Preview phase ──────────────────────────────────────────────────────────
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
                Print Preview — Admission Order
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2.5 py-0.5 bg-white/20 text-white border border-white/40 truncate max-w-xs">
                {student.studentNameSSLC}
              </span>
              {!hasAllottedCategory && (
                <span className="inline-flex items-center rounded-full text-[10px] font-semibold px-2 py-0.5 bg-amber-500/30 text-amber-100 border border-amber-400/30 shrink-0">
                  No allotted category — using claimed category
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
              Prints two copies on a single A4 sheet — Student's Copy and Office Copy.
            </span>
          </div>

          {/* Preview iframe */}
          <div className="flex-1 overflow-auto min-h-0 bg-slate-300">
            <iframe
              srcDoc={previewHtml}
              title="Admission Order Print Preview"
              className="w-full border-0 block"
              style={{ height: '900px' }}
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
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400">Verify all details before printing</span>
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

  // ── Date selection phase ───────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4"
        style={{ animation: 'modal-enter 0.22s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Admission Order</h3>
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

        {/* Date picker */}
        <div className="px-5 py-5">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Counselling Date
          </label>
          <input
            type="date"
            value={counsellingDate}
            onChange={(e) => setCounsellingDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
          />
          <p className="mt-2 text-[11px] text-gray-400">
            This date will appear as the Offline Counselling date on the order.
          </p>
        </div>

        {!hasAllottedCategory && (
          <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Allotted category not set — the student's claimed category will be printed instead.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!counsellingDate}
            onClick={handlePreview}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5"
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
