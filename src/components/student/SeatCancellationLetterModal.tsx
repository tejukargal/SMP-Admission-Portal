import { useEffect, useMemo, useState } from 'react';
import type { Student, SeatCancelLetterRecord } from '../../types';
import {
  buildSeatCancellationLetterHTML,
  generateSeatCancellationLetter,
  SEAT_CANCEL_REASON_PRESETS,
} from '../../utils/seatCancellationLetter';
import { saveSeatCancelLetterRecord } from '../../services/seatCancelLetterService';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  student: Student;
  onClose: () => void;
  /** Called with the new history record after a (non-readOnly) print is saved. */
  onSaved?: (record: SeatCancelLetterRecord) => void;
  /** Prefill from an already-issued letter (Reprint). */
  initial?: { reason: string; letterDate: string };
  /** Reprinting an issued letter — won't add another history entry. */
  readOnly?: boolean;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SeatCancellationLetterModal({ student, onClose, onSaved, initial, readOnly = false }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [letterDate, setLetterDate] = useState(initial?.letterDate ?? todayISO());

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const previewHtml = useMemo(
    () => buildSeatCancellationLetterHTML(student, { reason, letterDate }),
    [student, reason, letterDate],
  );

  const canPrint = reason.trim() !== '' && letterDate !== '';

  function handlePrint() {
    if (!canPrint) return;
    const trimmed = reason.trim();
    generateSeatCancellationLetter(student, { reason: trimmed, letterDate });
    if (user && !readOnly) {
      saveSeatCancelLetterRecord(student.id, {
        reason: trimmed,
        letterDate,
        issuedAt: new Date().toISOString(),
        issuedBy: user.email ?? user.uid,
      })
        .then((r) => onSaved?.(r))
        .catch(() => { /* non-fatal — the letter is already printed */ });
    }
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
        style={{ width: '1180px', maxWidth: '100%', height: 'calc(100vh - 3rem)', animation: 'modal-enter 0.22s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-amber-600 to-orange-700 flex items-center justify-between shrink-0">
          <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="13" x2="15" y2="17"/>
                  <line x1="15" y1="13" x2="9" y2="17"/>
                </svg>
              </span>
              {readOnly ? 'Seat Cancellation Letter — Reprint' : 'Seat Cancellation Letter'}
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/25 text-white border border-white/40">ಕನ್ನಡ</span>
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

        {/* ── Body: controls + live preview ── */}
        <div className="flex-1 min-h-0 flex">
          <div className="w-[300px] shrink-0 border-r border-gray-100 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Common reasons</label>
              <div className="flex flex-col gap-1.5">
                {SEAT_CANCEL_REASON_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setReason(p.text)}
                    className={`text-left rounded-lg border px-2.5 py-1.5 transition-colors cursor-pointer ${
                      reason.trim() === p.text
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/50'
                    }`}
                  >
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{p.label}</div>
                    <div className="text-xs text-gray-800 leading-snug">{p.text}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Reason (edit or type in Kannada) <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="ಉದಾ: ನನಗೆ ಬೇರೆ ಕಾಲೇಜಿನಲ್ಲಿ ಪ್ರವೇಶಾತಿ ದೊರೆತಿರುವುದರಿಂದ"
                className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                Reads in the letter as: “ಪ್ರಸ್ತುತ <em>[reason]</em>, ಈ ಸಂಸ್ಥೆಯಲ್ಲಿ …”
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Letter date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={letterDate}
                onChange={(e) => setLetterDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>

          <div className="flex-1 min-w-0 overflow-auto bg-slate-300">
            <iframe
              srcDoc={previewHtml}
              title="Seat Cancellation Letter Preview"
              className="w-full border-0 block"
              style={{ height: '1180px' }}
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 shrink-0 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            {readOnly ? 'Reprinting will not add another history entry' : 'Student and parent sign the printed letter'}
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
              disabled={!canPrint}
              className="rounded-lg bg-amber-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-amber-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              {readOnly ? 'Reprint' : 'Print'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
