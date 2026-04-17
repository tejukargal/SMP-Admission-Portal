import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, authReady } from '../config/firebase';
import { getUserRole, createOrUpdateUserDoc } from '../services/userService';
import type { UserRole, AcademicYear } from '../types';

interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  /** The locked academic year assigned to this staff account. Null for admins or unset staff. */
  staffDefaultYear: AcademicYear | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [staffDefaultYear, setStaffDefaultYear] = useState<AcademicYear | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUser(null);
        setRole(null);
        setStaffDefaultYear(null);
        setLoading(false);
        return;
      }

      void resolveRole(u);
    });
    return unsubscribe;
  }, []);

  // Fetches the user's role from Firestore with retries to handle transient errors
  // (App Check token not yet ready, brief network blip, etc.).
  // Only fails closed (signs out) on permission errors or after all retries are exhausted.
  async function resolveRole(u: import('firebase/auth').User) {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await getUserRole(u.uid);

        if (result === null) {
          // No user doc yet — first-time admin, auto-create their doc.
          await createOrUpdateUserDoc(u.uid, u.email ?? '', 'admin');
          setUser(u);
          setRole('admin');
          setStaffDefaultYear(null);
        } else if (!result.active) {
          // Deactivated account — sign out immediately.
          await signOut(auth);
          setUser(null);
          setRole(null);
          setStaffDefaultYear(null);
        } else {
          setUser(u);
          setRole(result.role);
          setStaffDefaultYear(result.role === 'staff' ? (result.defaultAcademicYear ?? null) : null);
        }
        setLoading(false);
        return;
      } catch (err) {
        lastError = err;
        const code = (err as { code?: string })?.code ?? '';

        // Fail immediately on permission errors — never grant access.
        if (code === 'permission-denied' || code === 'unauthenticated') {
          break;
        }

        // For transient errors (network, App Check token not yet ready), wait then retry.
        if (attempt < maxAttempts - 1) {
          await new Promise<void>((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    // All retries exhausted or hard permission error — fail closed.
    console.error('Auth: could not resolve user role, signing out.', lastError);
    await signOut(auth);
    setUser(null);
    setRole(null);
    setStaffDefaultYear(null);
    setLoading(false);
  }

  async function login(email: string, password: string) {
    // Ensure session persistence is configured before signing in.
    await authReady;
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, role, staffDefaultYear, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
