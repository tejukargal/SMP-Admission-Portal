import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStudentAuth } from '../contexts/StudentAuthContext';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import type { StudentLoginMode } from '../services/studentAuthService';

const DOB_RE = /^\d{2}\/\d{2}\/\d{4}$/;

export function StudentLogin() {
  const { login } = useStudentAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<StudentLoginMode>('reg');
  const [identifier, setIdentifier] = useState('');
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!DOB_RE.test(dob)) {
      setError('Enter Date of Birth as DD/MM/YYYY.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(identifier.trim(), mode, dob);
      void navigate('/portal');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'functions/resource-exhausted') {
        setError('Too many attempts. Please try again in 15 minutes.');
      } else {
        setError('No matching record found. Please check your details.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="font-portal fixed inset-0 flex items-center justify-center p-4 bg-gray-50">
      <Link
        to="/login"
        className="absolute top-4 right-4 sm:top-6 sm:right-6 text-xs sm:text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 shadow-sm transition-colors"
      >
        Staff / Admin Login →
      </Link>

      <div className="relative bg-white rounded-3xl shadow-xl w-full max-w-sm p-8 border border-gray-200">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg bg-gray-900">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900 uppercase" style={{ letterSpacing: '0.18em' }}>SMP Admissions</h1>
          <p className="text-xl sm:text-2xl font-extrabold text-gray-500 mt-2 tracking-tight">Students Portal</p>
        </div>

        {/* Reg No / Mobile toggle */}
        <div className="flex rounded-full border border-gray-200 bg-gray-50 p-1 mb-4">
          {(['reg', 'mobile'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setIdentifier(''); setError(''); }}
              className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                mode === m ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {m === 'reg' ? 'Register Number' : 'Mobile Number'}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <Input
            label={mode === 'reg' ? 'Register Number' : 'Mobile Number'}
            type="text"
            tone="dark"
            value={identifier}
            onChange={(e) => setIdentifier(mode === 'reg' ? e.target.value.toUpperCase() : e.target.value)}
            placeholder={mode === 'reg' ? 'e.g. 123456' : 'e.g. 9876543210'}
            required
            autoComplete="off"
            style={{ borderRadius: '1rem', paddingTop: '0.7rem', paddingBottom: '0.7rem' }}
          />
          <Input
            label="Date of Birth"
            type="text"
            tone="dark"
            inputMode="numeric"
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
            }}
            placeholder="DD/MM/YYYY"
            maxLength={10}
            required
            style={{ borderRadius: '1rem', paddingTop: '0.7rem', paddingBottom: '0.7rem' }}
          />

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200 font-medium">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="dark"
            size="lg"
            loading={loading}
            className="w-full mt-2"
          >
            View My Details
          </Button>
        </form>
      </div>
    </div>
  );
}
