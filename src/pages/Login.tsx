import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PetalRing } from '../components/login/PetalRing';
import { LeafMark } from '../components/login/LeafMark';
import { LoginToast } from '../components/login/LoginToast';
import { AuraBackdrop } from '../components/login/AuraBackdrop';
import { CARD, CARD_STYLE, FIELD, FIELD_INVALID, INK, LABEL, SECONDARY, SUBMIT, SUBMIT_STYLE } from '../components/login/loginStyles';

const TAGLINES = ['Admissions', 'Fee collection', 'Cash & Bank', 'Certificates', 'Reports'];

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
    <div className="font-wp fixed inset-0 overflow-auto">
      <AuraBackdrop />

      <div className="relative mx-auto min-h-full max-w-[1080px] flex flex-col lg:flex-row items-center justify-center lg:justify-between gap-6 lg:gap-12 px-5 pt-8 pb-10 lg:px-10 lg:py-10">
        {/* ── Hero ────────────────────────────────────────────────────── */}
        {/* Desktop */}
        <div className="hidden lg:flex flex-1 flex-col items-center text-center">
          <PetalRing size={240} glow>
            <LeafMark size={64} />
          </PetalRing>
          <h1 className="mt-7 text-[38px] leading-tight font-bold tracking-[0.02em]" style={{ color: INK }}>SMP Admissions</h1>
          <p className="mt-1 text-[15px] text-[#5B6180]">Sanjay Memorial Polytechnic, Sagar</p>
          <p className="mt-5 text-[15px] text-[#5B6180] font-medium">
            One place for <TaglineTicker />
          </p>
        </div>

        {/* Mobile */}
        <div className="flex lg:hidden flex-col items-center text-center">
          <PetalRing size={120} glow>
            <LeafMark size={32} />
          </PetalRing>
          <h1 className="mt-3 text-[22px] font-bold" style={{ color: INK }}>SMP Admissions</h1>
          <p className="text-[12.5px] text-[#5B6180]">Sanjay Memorial Polytechnic, Sagar</p>
        </div>

        {/* ── Login card ──────────────────────────────────────────────── */}
        <div className="relative w-full max-w-[360px] shrink-0">
          {toast && (
            <LoginToast
              key={toast.id}
              message={toast.message}
              leaving={toastLeaving}
              onDismiss={dismissToast}
              onGone={() => { setToast(null); setToastLeaving(false); }}
            />
          )}
          <div className={CARD} style={CARD_STYLE}>
            <p className="hidden lg:block mb-5 text-center text-[14px] font-semibold tracking-[0.02em]" style={{ color: INK }}>SMP Admissions</p>
            <h2 className="text-[24px] font-bold text-[#1F2333] lg:text-center">Welcome back</h2>
            <p className="mt-1 text-[13px] text-[#5B6180] lg:text-center">Sign in with your staff or admin account.</p>

            <form onSubmit={(e) => { void handleSubmit(e); }} className="mt-6 space-y-4">
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
                className={SUBMIT}
                style={SUBMIT_STYLE}
              >
                {loading && (
                  <span className="rounded-full bg-white/90 p-[2px] inline-flex">
                    <PetalRing size={18} />
                  </span>
                )}
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3 text-[12px] text-[#8A8FA8]">
              <span className="h-px flex-1 bg-[#ECEBFA]" />
              Are you a student?
              <span className="h-px flex-1 bg-[#ECEBFA]" />
            </div>
            <Link
              to="/student-login"
              className={SECONDARY}
            >
              Student Login <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
