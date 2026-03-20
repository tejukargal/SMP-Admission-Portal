import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { firebaseConfig, db } from '../config/firebase';
import type { StaffUser, UserRole, AcademicYear } from '../types';

export async function getUserRole(
  uid: string
): Promise<{ role: UserRole; active: boolean; defaultAcademicYear?: AcademicYear } | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    role: data.role as UserRole,
    active: data.active !== false,
    defaultAcademicYear: data.defaultAcademicYear as AcademicYear | undefined,
  };
}

export async function createOrUpdateUserDoc(
  uid: string,
  email: string,
  role: UserRole
): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    email,
    role,
    active: true,
    createdAt: new Date().toISOString(),
  });
}

export async function getStaffUsers(): Promise<StaffUser[]> {
  const q = query(collection(db, 'users'), where('role', '==', 'staff'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as StaffUser));
}

export async function createStaffUser(email: string, password: string): Promise<void> {
  // Use a secondary Firebase app instance so admin session is not disrupted
  const secondaryApp = initializeApp(firebaseConfig, `staff-create-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await firebaseSignOut(secondaryAuth);
    await setDoc(doc(db, 'users', uid), {
      email,
      role: 'staff' as UserRole,
      active: true,
      createdAt: new Date().toISOString(),
    });
  } finally {
    await deleteApp(secondaryApp);
  }
}

export async function deactivateStaffUser(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { active: false });
}

export async function reactivateStaffUser(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { active: true });
}

/** Set (or clear) the locked-in academic year for a staff account. */
export async function setStaffDefaultYear(
  uid: string,
  academicYear: AcademicYear | ''
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    defaultAcademicYear: academicYear || deleteField(),
  });
}
