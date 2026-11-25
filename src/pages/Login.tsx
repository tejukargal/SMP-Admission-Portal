import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PetalRing } from '../components/login/PetalRing';
import { LeafMark } from '../components/login/LeafMark';

const TAGLINES = ['Admissions', 'Fee collection', 'Cash & Bank', 'Certificates', 'Reports'];

const INK = '#3730A3';
const FIELD =
  'w-full rounded-xl border border-[#DCDDFB] bg-white px-3.5 py-2.5 text-[14px] text-[#1F2333] placeholder:text-[#A3A8BD] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30 focus:border-[#6366F1] transition-[box-shadow,border-color,background-color] duration-300';
// Soft rose tint on both fields after a failed sign-in; clears as soon as the user types.
const FIELD_INVALID = '!border-[#F5A3B7] !bg-[#FFF9FA] focus:!ring-[#F43F5E]/20 focus:!border-[#F43F5E]';
const LABEL = 'block text-[11px] font-medium uppercase tracking-[0.7px] text-[#5B6180] mb-1.5';

function friendlyError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'No connection to the server. Check your internet and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact the administrator.';
    default:
      return err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
  }
}

/** Cycles the taglines with the sidebar's blur-slide (`sb-word-in/out`). The slot
 *  eases to each word's measured width, so "One place for …" stays centred under
 *  the heading whatever the word length. */
function TaglineTicker() {
  const [idx, setIdx] = useState(0);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const measureRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % TAGLINES.length), 3000);
    return () => clearInterval(t);
  }, []);
  useLayoutEffect(() => {
    const measure = () => { if (measureRef.current) setWidth(Math.ceil(measureRef.current.getBoundingClientRect().width)); };
    measure();
    void document.fonts?.ready.then(measure); // re-measure once Outfit has loaded
  }, [idx]);
  const prev = (idx + TAGLINES.length - 1) % TAGLINES.length;
  return (
    <span
      className="relative inline-block h-[1.4em] overflow-y-clip align-[-0.32em] whitespace-nowrap transition-[width] duration-[650ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{ width }}
    >
      <span ref={measureRef} aria-hidden="true" className="invisible absolute left-0 top-0">{TAGLINES[idx]}</span>
      <span className="absolute inset-0 flex justify-center">
        <span key={`o${idx}`} className="sb-word-out">{TAGLINES[prev]}</span>
      </span>
      <span className="absolute inset-0 flex justify-center">
        <span key={`i${idx}`} className="sb-word-in bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, #6366F1, #C026D3)' }}>
          {TAGLINES[idx]}
        </span>
      </span>
    </span>
  );
}

/** Floating sign-in error: slides/blur-fades in above the form (fixed, so nothing
 *  below moves), drains a thin timer bar, and leaves on its own after ~5s.
 *  Hover pauses the timer; × closes it early. CSS: `login-toast-*` in index.css. */
function LoginToast({ message, leaving, onDismiss, onGone }: {
  message: string; leaving: boolean; onDismiss: () => void; onGone: () => void;
}) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 lg:left-[77.5%] z-50 w-[min(92vw,380px)] pointer-events-none">
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

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  const dismissToast = () => setToastLeaving(true);


  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (toast) dismissToast();
    setInvalid(false);
    setLoading(true);
    try {
      await login(email, password);
      void navigate('/students');
    } catch (err: unknown) {
      setToast({ id: Date.now(), message: friendlyError(err) });
      setToastLeaving(false);
      setInvalid(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="font-wp fixed inset-0 overflow-auto bg-[#F7F7FD]">
      {toast && (
        <LoginToast
          key={toast.id}
          message={toast.message}
          leaving={toastLeaving}
          onDismiss={dismissToast}
          onGone={() => { setToast(null); setToastLeaving(false); }}
        />
      )}
      <div className="min-h-full flex flex-col lg:flex-row">
        {/* ── Brand panel ─────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden flex flex-col items-center justify-center px-6 pt-10 pb-6 lg:py-12 lg:w-[55%]"
          style={{ background: 'linear-gradient(150deg, #EEF0FF 0%, #F3EDFF 55%, #FBEEFB 100%)' }}
        >
          <div aria-hidden="true" className="login-drift absolute -top-24 -left-24 w-[26rem] h-[26rem] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.22), transparent 68%)' }} />
          <div aria-hidden="true" className="login-drift absolute -bottom-28 -right-20 w-[28rem] h-[28rem] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(217,70,239,0.18), transparent 68%)', animationDelay: '-7s' }} />

          {/* Desktop hero */}
          <div className="relative hidden lg:flex flex-col items-center text-center">
            <PetalRing size={260} glow>
              <LeafMark size={70} />
            </PetalRing>
            <h1 className="mt-8 text-[40px] leading-tight font-bold tracking-[0.02em]" style={{ color: INK }}>SMP Admissions</h1>
            <p className="mt-1 text-[15px] text-[#5B6180]">Sanjay Memorial Polytechnic, Sagar</p>
            <p className="mt-6 text-[15px] text-[#5B6180] font-medium">
              One place for <TaglineTicker />
            </p>
          </div>

          {/* Mobile hero */}
          <div className="relative flex lg:hidden flex-col items-center text-center">
            <PetalRing size={132} glow>
              <LeafMark size={36} />
            </PetalRing>
            <h1 className="mt-4 text-[24px] font-bold" style={{ color: INK }}>SMP Admissions</h1>
            <p className="text-[12.5px] text-[#5B6180]">Sanjay Memorial Polytechnic, Sagar</p>
          </div>
        </div>

        {/* ── Form panel ──────────────────────────────────────────────── */}
        <div className="flex-1 flex items-start lg:items-center justify-center px-5 py-8 lg:py-12 bg-white lg:bg-white">
          <div className="w-full max-w-[380px]" style={{ animation: 'modal-enter 0.35s ease-out' }}>
            <h2 className="text-[28px] font-bold text-[#1F2333]">Welcome back</h2>
            <p className="mt-1 text-[14px] text-[#5B6180]">Sign in with your staff or admin account to continue.</p>

            <form onSubmit={(e) => { void handleSubmit(e); }} className="mt-8 space-y-5">
              <div>
                <label htmlFor="login-email" className={LABEL}>Email</label>
                <input
                  id="login-email"
                  type="email"
                  className={`${FIELD} ${invalid ? FIELD_INVALID : ''}`}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setInvalid(false); }}
                  placeholder="admin@example.com"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="login-password" className={LABEL}>Password</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className={`${FIELD} pr-11 ${invalid ? FIELD_INVALID : ''}`}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setInvalid(false); }}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-[#8A8FA8] hover:text-[#4F46E5] cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-[15px] font-semibold text-white shadow-[0_8px_22px_rgba(99,102,241,0.32)] transition-[transform,box-shadow,filter] hover:brightness-110 hover:shadow-[0_10px_26px_rgba(168,85,247,0.38)] active:scale-[0.99] disabled:opacity-80 disabled:cursor-wait cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#A855F7]/40 focus:ring-offset-2"
                style={{ background: 'linear-gradient(90deg, #4F46E5 0%, #8B5CF6 55%, #C026D3 100%)' }}
              >
                {loading && (
                  <span className="rounded-full bg-white/90 p-[2px] inline-flex">
                    <PetalRing size={18} />
                  </span>
                )}
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="mt-8 flex items-center gap-3 text-[12px] text-[#8A8FA8]">
              <span className="h-px flex-1 bg-[#ECEBFA]" />
              Are you a student?
              <span className="h-px flex-1 bg-[#ECEBFA]" />
            </div>
            <Link
              to="/student-login"
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#DCDDFB] px-5 py-2.5 text-[14px] font-medium text-[#4F46E5] hover:bg-[#F4F3FF] transition-colors"
            >
              Student Login <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
