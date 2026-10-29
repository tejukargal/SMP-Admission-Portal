import { WINE, WINE_HAIR, WINE_INK } from '../common/examCertFormKit';

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
