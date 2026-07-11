import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { studentAuth } from '../config/studentFirebase';
import { loginStudent, logoutStudent, type StudentLoginMode } from '../services/studentAuthService';
import { fetchStudentRecordsByRegNumber, fetchStudentRecordById } from '../services/studentPortalService';
import type { Student } from '../types';

interface StudentClaims {
  regNumber?: string;
  studentDocId?: string;
}

interface StudentAuthContextValue {
  /** True once a valid student custom-token session exists. */
  isStudentSession: boolean;
  /** The student's most recent enrollment-year record (for header/profile display). */
  student: Student | null;
  /** All enrollment-year records sharing this student's reg number (usually 1, sometimes more). */
  allRecords: Student[];
  regNumber: string | null;
  loading: boolean;
  login: (identifier: string, mode: StudentLoginMode, dob: string) => Promise<void>;
  logout: () => Promise<void>;
}

const StudentAuthContext = createContext<StudentAuthContextValue | null>(null);

function pickCurrent(records: Student[]): Student | null {
  if (records.length === 0) return null;
  return [...records].sort((a, b) => b.academicYear.localeCompare(a.academicYear))[0];
}

export function StudentAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [allRecords, setAllRecords] = useState<Student[]>([]);
  const [regNumber, setRegNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(studentAuth, (u) => {
      void resolveSession(u);
    });
    return unsubscribe;
  }, []);

  async function resolveSession(u: User | null) {
    if (!u) {
      setUser(null);
      setStudent(null);
      setAllRecords([]);
      setRegNumber(null);
      setLoading(false);
      return;
    }

    try {
      const tokenResult = await u.getIdTokenResult();
      const claims = tokenResult.claims as { student?: boolean } & StudentClaims;

      if (!claims.student) {
        // Not a student session (shouldn't happen — this auth instance only ever
        // receives studentLogin custom tokens) — treat as signed out.
        await logoutStudent();
        setUser(null);
        setStudent(null);
        setAllRecords([]);
        setRegNumber(null);
        setLoading(false);
        return;
      }

      if (claims.regNumber) {
        const records = await fetchStudentRecordsByRegNumber(claims.regNumber);
        setAllRecords(records);
        setStudent(pickCurrent(records));
        setRegNumber(claims.regNumber);
      } else if (claims.studentDocId) {
        const rec = await fetchStudentRecordById(claims.studentDocId);
        setAllRecords(rec ? [rec] : []);
        setStudent(rec);
        setRegNumber(rec?.regNumber?.trim() || null);
      }
      setUser(u);
    } catch (err) {
      console.error('StudentAuth: failed to resolve session, signing out.', err);
      await logoutStudent();
      setUser(null);
      setStudent(null);
      setAllRecords([]);
      setRegNumber(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(identifier: string, mode: StudentLoginMode, dob: string) {
    await loginStudent(identifier, mode, dob);
  }

  async function logout() {
    await logoutStudent();
  }

  return (
    <StudentAuthContext.Provider
      value={{ isStudentSession: !!user, student, allRecords, regNumber, loading, login, logout }}
    >
      {children}
    </StudentAuthContext.Provider>
  );
}

export function useStudentAuth() {
  const ctx = useContext(StudentAuthContext);
  if (!ctx) throw new Error('useStudentAuth must be used within StudentAuthProvider');
  return ctx;
}
