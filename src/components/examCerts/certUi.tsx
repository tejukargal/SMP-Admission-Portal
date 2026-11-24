import { useEffect, useState, type FormEvent } from 'react';
import { CERT_EDIT_PASSKEY } from '../../config/constants';
import { FIELD, WINE, WINE_BAND, WINE_HAIR, WINE_INK } from '../common/examCertFormKit';

// Shared bits of the Exam Duty Certificates page (Attendance and
// Setting & Conducting tabs).

export const OUTLINE_BTN =
  'shrink-0 inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#262B35] ' +
  'hover:bg-[#FDF0F5] hover:text-[#9D174D] focus:outline-none focus:ring-2 focus:ring-[#BE185D]/25 cursor-pointer transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';

export function Icon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function RowBtn({ title, onClick, d, danger }: { title: string; onClick: () => void; d: string; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
        danger ? 'text-[#B4232F] hover:bg-[#FDECEE]' : 'text-[#9D174D] hover:bg-[#FDF0F5]'
      }`}
    >
      <Icon d={d} />
    </button>
  );
}

export function Toast({ msg, error }: { msg: string; error?: boolean }) {
  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] rounded-full px-4 py-2 text-[12.5px] font-medium text-white shadow-lg ${error ? 'bg-[#B4232F]' : 'bg-[#262B35]'}`}
      style={{ animation: 'modal-enter 0.2s ease-out' }}
    >
      {msg}
    </div>
  );
}

/** Asks for the edit passkey before an issued certificate can be edited. */
export function PasskeyPrompt({ onUnlock, onCancel }: { onUnlock: () => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (value === CERT_EDIT_PASSKEY) onUnlock();
    else { setWrong(true); setValue(''); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-wp" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden border"
        style={{ borderColor: WINE_HAIR, animation: 'modal-enter 0.25s ease-out' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-5 py-3 border-b" style={{ borderColor: WINE_HAIR, background: WINE_BAND }}>
          <h3 className="text-[15px] font-bold" style={{ color: WINE_INK }}>Edit certificate</h3>
        </div>
        <div className="px-5 py-4 space-y-2">
          <p className="text-[12.5px] text-[#5E5662]">Enter the passkey to edit issued certificates.</p>
          <input
            type="password"
            autoFocus
            className={FIELD}
            placeholder="Passkey"
            value={value}
            onChange={(e) => { setValue(e.target.value); setWrong(false); }}
          />
          {wrong && <p className="text-[11.5px] text-[#B4232F]">Incorrect passkey. Try again.</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: WINE_HAIR }}>
          <button type="button" onClick={onCancel} className="rounded-full border border-[#E7E3E8] px-4 py-2 text-[12.5px] font-medium text-[#4B4450] hover:bg-[#FBF9FB] cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value}
            className="rounded-full px-5 py-2 text-[12.5px] font-medium text-white hover:brightness-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: `linear-gradient(135deg, ${WINE}, ${WINE_INK})` }}
          >
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}

export type CertTab = 'attendance' | 'setting';

const TABS: { value: CertTab; label: string }[] = [
  { value: 'attendance', label: 'Attendance' },
  { value: 'setting', label: 'Setting & Conducting' },
];

/** Page title with the certificate-kind switch underneath. */
export function CertsHeading({ tab, onTab }: { tab: CertTab; onTab: (t: CertTab) => void }) {
  return (
    <div className="shrink-0">
      <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">SMP Admissions · Examinations</p>
      <h2 className="mt-1.5 text-[22px] font-bold leading-none tracking-[-0.3px]" style={{ color: WINE_INK }}>Exam Duty Certificates</h2>
      <div className="mt-2 inline-flex rounded-full border bg-white p-0.5" style={{ borderColor: WINE_HAIR }} role="tablist">
        {TABS.map((t) => {
          const on = t.value === tab;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onTab(t.value)}
              className={`rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors cursor-pointer ${on ? 'text-white' : 'text-[#6B6170] hover:text-[#9D174D]'}`}
              style={on ? { background: WINE } : undefined}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
