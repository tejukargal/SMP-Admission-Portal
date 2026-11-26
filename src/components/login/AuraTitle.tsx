/** "SMP ADMISSIONS" under the petal ring, styled like the app header's title:
 *  bold uppercase with a flowing gradient (petal colours, one loop per two petal
 *  waves) and a light sweep that crosses the letters each time the squeeze wave
 *  runs round the ring. CSS: `login-title-*` in index.css. */
export function AuraTitle({ className = '' }: { className?: string }) {
  return (
    <h1 className={`relative inline-block font-bold uppercase leading-tight ${className}`} aria-label="SMP Admissions">
      <span aria-hidden="true" className="login-title-aura">SMP Admissions</span>
      <span aria-hidden="true" className="login-title-shine absolute inset-0">SMP Admissions</span>
    </h1>
  );
}
