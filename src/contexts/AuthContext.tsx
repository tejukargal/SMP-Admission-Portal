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
import { auth } from '../config/firebase';
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

      // Fetch role from Firestore after auth resolves
      getUserRole(u.uid)
        .then(async (result) => {
          if (result === null) {
            // No user doc yet — this is the original admin user (backward compat).
            // Auto-create their admin doc.
            await createOrUpdateUserDoc(u.uid, u.email ?? '', 'admin');
            setUser(u);
            setRole('admin');
            setStaffDefaultYear(null);
          } else if (!result.active) {
            // Deactivated account — sign out immediately
            await signOut(auth);
            setUser(null);
            setRole(null);
            setStaffDefaultYear(null);
          } else {
            setUser(u);
            setRole(result.role);
            // Only staff can have a locked default year; admins always use global setting
            setStaffDefaultYear(result.role === 'staff' ? (result.defaultAcademicYear ?? null) : null);
          }
        })
        .catch(() => {
          // On Firestore error, fail safe: treat as admin to avoid locking out existing admin
          setUser(u);
          setRole('admin');
          setStaffDefaultYear(null);
        })
        .finally(() => {
          setLoading(false);
        });
    });
    return unsubscribe;
  }, []);

  async function login(email: string, password: string) {
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
