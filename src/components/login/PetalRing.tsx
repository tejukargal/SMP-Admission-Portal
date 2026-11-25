import { useId, type ReactNode } from 'react';

const PETALS = 7;

interface Props {
  /** Rendered width/height in px. */
  size: number;
  /** Soft violet glow behind the ring. */
  glow?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Seven gradient petals circling in a loop: the ring turns slowly while a squeeze
 *  wave travels petal-to-petal (each one pinches thin and springs back).
 *  Pure SVG + CSS — keyframes live in index.css (`petal-*`). */
export function PetalRing({ size, glow = false, className = '', children }: Props) {
  const gid = `petal-grad-${useId().replace(/:/g, '')}`;
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {glow && (
        <div
          aria-hidden="true"
          className="absolute inset-[8%] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.45), rgba(217,70,239,0.15) 55%, transparent 72%)', filter: 'blur(18px)' }}
        />
      )}
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        aria-hidden="true"
        className="petal-ring relative"
      >
        {/* One gradient across the whole ring, seen through a petal-shaped mask —
            so the colours sweep magenta → blue around the ring and turn with it. */}
        <defs>
          <linearGradient id={`${gid}-g`} gradientUnits="userSpaceOnUse" x1="70" y1="12" x2="130" y2="188">
            <stop offset="0%" stopColor="#E040FB" />
            <stop offset="50%" stopColor="#9B4DFF" />
            <stop offset="100%" stopColor="#4338FF" />
          </linearGradient>
          <mask id={`${gid}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
            {Array.from({ length: PETALS }, (_, i) => (
              <g key={i} transform={`rotate(${(i * 360) / PETALS} 100 100) translate(100 40)`}>
                <g transform="rotate(32)">
                  <g className="petal" style={{ animationDelay: `${i * 90}ms` }}>
                    <ellipse cx="0" cy="0" rx="17" ry="23" fill="#fff" />
                  </g>
                </g>
              </g>
            ))}
          </mask>
        </defs>
        <rect x="0" y="0" width="200" height="200" fill={`url(#${gid}-g)`} mask={`url(#${gid}-m)`} />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}
