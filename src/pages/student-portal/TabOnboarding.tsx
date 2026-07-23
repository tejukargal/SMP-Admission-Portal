interface TabOnboardingProps {
  onDismiss: () => void;
}

/** One-time mobile coach mark pointing at the bottom tab bar — students were
 *  closing the app after Circulars without realizing Fee History, Certificates
 *  and Notices live behind the other tabs. Shown once per student, then never again. */
export function TabOnboarding({ onDismiss }: TabOnboardingProps) {
  return (
    <div className="md:hidden fixed inset-0 z-40 flex items-end justify-center pb-20 px-4 pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-sm bg-gray-900 text-white rounded-2xl shadow-2xl p-4 flex items-start gap-3"
        style={{ animation: 'toast-in 0.25s ease-out' }}
        role="dialog"
        aria-label="Tab bar tip"
      >
        <span className="text-2xl leading-none animate-bounce shrink-0">👇</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">There's more down here!</p>
          <p className="text-xs text-gray-300 mt-0.5 leading-relaxed">
            Tap the icons below to check your Fee History, Certificates, Notices and more.
          </p>
          <button
            onClick={onDismiss}
            className="mt-2.5 rounded-full bg-white text-gray-900 text-xs font-bold px-3.5 py-1.5 cursor-pointer hover:bg-gray-100 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
