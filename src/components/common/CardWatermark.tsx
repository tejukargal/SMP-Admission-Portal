interface CardWatermarkProps {
  label: string;
}

/** Diagonal background watermark for compact cards — signals a card's state (e.g. "Unpublished") at a glance. */
export function CardWatermark({ label }: CardWatermarkProps) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none select-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
    >
      <span className="-rotate-[22deg] whitespace-nowrap text-3xl font-black uppercase tracking-widest text-gray-400/30">
        {label}
      </span>
    </span>
  );
}
