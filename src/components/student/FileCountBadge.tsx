/** Small 📎 N pill shown next to a student who has files; click opens their Files tab. */
export function FileCountBadge({ count, onClick, color = '#0D9488' }: {
  count: number | undefined;
  onClick: () => void;
  color?: string;
}) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onContextMenu={(e) => e.stopPropagation()}
      className="shrink-0 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-[3px] text-[10px] font-medium leading-none tabular-nums cursor-pointer transition-[filter] hover:brightness-95"
      style={{ background: `${color}14`, borderColor: `${color}66`, color: `color-mix(in srgb, ${color} 72%, #000)` }}
      title={`${count} file${count > 1 ? 's' : ''} — open Files`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
      {count}
    </button>
  );
}
