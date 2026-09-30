import { PERI, PERI_BORDER, FAINT } from './dashTokens';

export type SideCard = 'activity' | 'dtek';

const OPTIONS: { value: SideCard; label: string }[] = [
  { value: 'activity', label: 'Activity' },
  { value: 'dtek', label: 'DTEK' },
];

/** Segmented pill that switches the Insights side slot between Recent Activity and DTEK News. */
export function SideCardToggle({ value, onChange }: { value: SideCard; onChange: (v: SideCard) => void }) {
  return (
    <div
      className="inline-flex items-center rounded-full border bg-white p-0.5 shrink-0"
      style={{ borderColor: PERI_BORDER }}
      role="group"
      aria-label="Switch card"
    >
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className="rounded-full px-2.5 py-[4px] text-[10.5px] font-medium leading-none transition-colors cursor-pointer"
            style={active ? { background: PERI, color: '#fff' } : { color: FAINT }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
