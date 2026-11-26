import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStudentAuth } from '../contexts/StudentAuthContext';
import type { StudentLoginMode } from '../services/studentAuthService';
import { PetalRing } from '../components/login/PetalRing';
import { LeafMark } from '../components/login/LeafMark';
import { LoginToast } from '../components/login/LoginToast';
import { AuraBackdrop } from '../components/login/AuraBackdrop';
import { CARD, CARD_STYLE, FIELD, FIELD_INVALID, INK, LABEL, SECONDARY, SUBMIT, SUBMIT_STYLE } from '../components/login/loginStyles';

const DOB_RE = /^\d{2}\/\d{2}\/\d{4}$/;

export function StudentLogin() {
  const { login } = useStudentAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<StudentLoginMode>('reg');
  const [identifier, setIdentifier] = useState('');
  const [dob, setDob] = useState('');
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  const dismissToast = () => setToastLeaving(true);
  const showError = (message: string) => {
    setToast({ id: Date.now(), message });
    setToastLeaving(false);
    setInvalid(true);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (toast) dismissToast();
    setInvalid(false);
    if (!DOB_RE.test(dob)) {
      showError('Enter Date of Birth as DD/MM/YYYY.');
      return;
    }
    setLoading(true);
    try {
      await login(identifier.trim(), mode, dob);
      void navigate('/portal');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      showError(code === 'functions/resource-exhausted'
        ? 'Too many attempts. Please try again in 15 minutes.'
        : 'No matching record found. Please check your details.');
    } finally {
      setLoading(false);
    }
  }

  const idLabel = mode === 'reg' ? 'Register Number' : 'Mobile Number';

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
          <p className="mt-5 text-[15px] font-semibold bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg, #6366F1, #C026D3)' }}>
            Students Portal
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
            <h2 className="text-[24px] font-bold text-[#1F2333] lg:text-center">Students Portal</h2>
            <p className="mt-1 text-[13px] text-[#5B6180] lg:text-center">Sign in with your number and date of birth.</p>

            {/* Reg No / Mobile toggle */}
            <div className="mt-6 flex rounded-full border border-[#DCDDFB] bg-[#F7F7FD] p-1">
              {(['reg', 'mobile'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setIdentifier(''); setInvalid(false); }}
                  className={`flex-1 rounded-full py-1.5 text-[12px] font-semibold transition-colors cursor-pointer ${
                    mode === m ? 'text-white shadow-[0_4px_12px_rgba(99,102,241,0.30)]' : 'text-[#5B6180] hover:text-[#4F46E5]'
                  }`}
                  style={mode === m ? SUBMIT_STYLE : undefined}
                >
                  {m === 'reg' ? 'Register Number' : 'Mobile Number'}
                </button>
              ))}
            </div>

            <form onSubmit={(e) => { void handleSubmit(e); }} className="mt-4 space-y-4">
              <div>
                <label htmlFor="student-login-id" className={LABEL}>{idLabel}</label>
                <input
                  id="student-login-id"
                  type="text"
                  inputMode={mode === 'mobile' ? 'numeric' : 'text'}
                  className={`${FIELD} ${invalid ? FIELD_INVALID : ''}`}
                  style={mode === 'reg' ? { textTransform: 'uppercase' } : undefined}
                  value={identifier}
                  onChange={(e) => { setIdentifier(mode === 'reg' ? e.target.value.toUpperCase() : e.target.value); setInvalid(false); }}
                  placeholder={mode === 'reg' ? 'e.g. 123456' : 'e.g. 9876543210'}
                  required
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="student-login-dob" className={LABEL}>Date of Birth</label>
                <input
                  id="student-login-dob"
                  type="text"
                  inputMode="numeric"
                  className={`${FIELD} ${invalid ? FIELD_INVALID : ''}`}
                  value={dob}
                  onChange={(e) => {
                    // Mobile numeric keypads have no '/' key, so auto-insert the
                    // separators as digits are typed instead of requiring one.
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                    const formatted = digits.length > 4
                      ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
                      : digits.length > 2
                      ? `${digits.slice(0, 2)}/${digits.slice(2)}`
                      : digits;
                    setDob(formatted);
                    setInvalid(false);
                  }}
                  placeholder="DD/MM/YYYY"
                  maxLength={10}
                  required
                />
              </div>

              <button type="submit" disabled={loading} className={SUBMIT} style={SUBMIT_STYLE}>
                {loading && (
                  <span className="rounded-full bg-white/90 p-[2px] inline-flex">
                    <PetalRing size={18} />
                  </span>
                )}
                {loading ? 'Checking…' : 'View My Details'}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3 text-[12px] text-[#8A8FA8]">
              <span className="h-px flex-1 bg-[#ECEBFA]" />
              Staff or admin?
              <span className="h-px flex-1 bg-[#ECEBFA]" />
            </div>
            <Link to="/login" className={SECONDARY}>
              Staff / Admin Login <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
