import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { studentAuth, studentFunctions } from '../config/studentFirebase';
import { markStudentOffline } from './studentPortalService';

export type StudentLoginMode = 'reg' | 'mobile';

interface StudentLoginResponse {
  token: string;
}

/** Verifies (reg no | mobile) + DOB via the studentLogin Cloud Function, then
 *  signs in on the secondary (student-only) Firebase Auth instance. */
export async function loginStudent(identifier: string, mode: StudentLoginMode, dob: string): Promise<void> {
  const fn = httpsCallable<{ identifier: string; mode: StudentLoginMode; dob: string }, StudentLoginResponse>(
    studentFunctions,
    'studentLogin',
  );
  const { data } = await fn({ identifier, mode, dob });
  await signInWithCustomToken(studentAuth, data.token);
}

export async function logoutStudent(): Promise<void> {
  const uid = studentAuth.currentUser?.uid;
  if (uid) {
    try { await markStudentOffline(uid); } catch { /* best-effort — don't block sign-out */ }
  }
  await signOut(studentAuth);
}
