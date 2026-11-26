/* Shared visual pieces for the staff (/login) and student (/student-login) sign-in pages. */

/** Floating sign-in error: slides/blur-fades in above the form (fixed, so nothing
 *  below moves), drains a thin timer bar, and leaves on its own after ~5s.
 *  Hover pauses the timer; × closes it early. CSS: `login-toast-*` in index.css. */
export function LoginToast({ message, leaving, onDismiss, onGone }: {
  message: string; leaving: boolean; onDismiss: () => void; onGone: () => void;
}) {
  return (
    // Mobile: pinned to the top of the screen. Desktop: floats just above the card
    // (absolute to the card's wrapper), so the form never moves either way.
    <div className="fixed top-4 left-1/2 -translate-x-1/2 lg:absolute lg:top-auto lg:bottom-full lg:mb-3 z-50 w-[min(92vw,380px)] pointer-events-none">
      <div
        role="alert"
        aria-live="assertive"
        className={`login-toast pointer-events-auto rounded-xl border border-[#F7D0DA] bg-white/95 px-3 pt-2.5 pb-2 shadow-[0_10px_28px_-14px_rgba(31,35,51,0.30)] ${leaving ? 'login-toast-out' : 'login-toast-in'}`}
        style={{ backdropFilter: 'blur(12px)' }}
        onAnimationEnd={(e) => { if (leaving && e.target === e.currentTarget) onGone(); }}
      >
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="login-toast-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFE4EA] text-[#E11D48]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="6" x2="12" y2="13" /><line x1="12" y1="18" x2="12" y2="18.01" /></svg>
          </span>
          <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-[#5B6180]">
            <span className="font-semibold text-[#1F2333]">Couldn’t sign you in.</span> {message}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#9AA0B8] hover:bg-[#F4F3FF] hover:text-[#4F46E5] transition-colors cursor-pointer"
            aria-label="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          </button>
        </div>
        {/* Timer: a thin rounded line inside the card's padding, aligned with the text */}
        <div aria-hidden="true" className="mt-2 ml-[34px] mr-[34px] h-[2px] overflow-hidden rounded-full bg-[#FBE4EA]">
          <div
            className="login-toast-timer h-full origin-left rounded-full"
            style={{ background: 'linear-gradient(90deg, #F43F5E, #C026D3)' }}
            onAnimationEnd={(e) => { e.stopPropagation(); onDismiss(); }}
          />
        </div>
      </div>
    </div>
  );
}
