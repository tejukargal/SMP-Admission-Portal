interface TabOnboardingProps {
  onDismiss: () => void;
}

/** Mobile coach mark pointing at the bottom tab bar — students were closing
 *  the app after Circulars without realizing Fee History, Certificates and
 *  Notices live behind the other tabs. Shown on every portal visit, kept
 *  compact and brief since it reappears often (StudentPortal.tsx auto-hides
 *  it after 3s). */
export function TabOnboarding({ onDismiss }: TabOnboardingProps) {
  return (
    <div className="md:hidden fixed inset-0 z-40 flex items-end justify-center pb-20 px-4 pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-sm bg-gray-900 text-white rounded-full shadow-2xl pl-4 pr-2 py-2 flex items-center gap-2"
        style={{ animation: 'toast-in 0.25s ease-out' }}
        role="dialog"
        aria-label="Tab bar tip"
      >
        <span className="text-base leading-none animate-bounce shrink-0">👇</span>
        <p className="flex-1 min-w-0 text-xs font-medium truncate">More below: Fees, Certificates, Notices</p>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-full bg-white text-gray-900 text-xs font-bold px-2.5 py-1 cursor-pointer hover:bg-gray-100 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
