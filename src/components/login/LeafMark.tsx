import { useId } from 'react';

/** Centre of the petal ring: the app's leaf mark and the "SMP" wordmark take turns,
 *  blur-morphing in step with the petals' squeeze wave (CSS `login-face-*`, 7.2s =
 *  two waves — leaf for one, SMP for the next). Same magenta → blue as the petals. */
export function LeafMark({ size }: { size: number }) {
  const gid = `leaf-grad-${useId().replace(/:/g, '')}`;
  const icon = Math.round(size * 0.5);
  return (
    <div className="relative rounded-full bg-white shadow-[0_6px_20px_rgba(79,70,229,0.18)] ring-1 ring-[#E4E2FB] flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="login-face-leaf absolute inset-0 flex items-center justify-center">
        <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke={`url(#${gid})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <defs>
            <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="4" y1="2" x2="18" y2="22">
              <stop offset="0%" stopColor="#E040FB" />
              <stop offset="50%" stopColor="#9B4DFF" />
              <stop offset="100%" stopColor="#4338FF" />
            </linearGradient>
          </defs>
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </svg>
      </span>
      <span
        className="login-face-smp absolute inset-0 flex items-center justify-center font-bold tracking-[0.04em] bg-clip-text text-transparent"
        style={{ fontSize: Math.round(size * 0.28), backgroundImage: 'linear-gradient(160deg, #E040FB 0%, #9B4DFF 50%, #4338FF 100%)' }}
        aria-label="SMP"
      >
        SMP
      </span>
    </div>
  );
}
