import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, browserLocalPersistence, type Auth } from 'firebase/auth';
import {
  initializeFirestore, getFirestore,
  persistentLocalCache, persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { firebaseConfig } from './firebase';

// A completely separate Firebase App instance for the student self-service
// portal, so its Auth session (custom-token, `student` claim) never touches
// the primary `auth`/`AuthContext` used by admin/staff sign-in — see
// StudentAuthContext.tsx and the "why a separate auth track" note in
// the student portal plan.
const STUDENT_APP_NAME = 'student-portal';

function getOrCreateApp(): FirebaseApp {
  const existing = getApps().find((a) => a.name === STUDENT_APP_NAME);
  return existing ?? initializeApp(firebaseConfig, STUDENT_APP_NAME);
}

export const studentApp = getOrCreateApp();

function getOrCreateAuth(): Auth {
  try {
    // Persistent (not session-only) so a student checking fee status on their
    // phone stays signed in between visits.
    return initializeAuth(studentApp, { persistence: browserLocalPersistence });
  } catch {
    return getAuth(studentApp);
  }
}

export const studentAuth = getOrCreateAuth();

function getOrCreateDb(): Firestore {
  try {
    return initializeFirestore(studentApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(studentApp);
  }
}

export const studentDb = getOrCreateDb();

export const studentFunctions: Functions = getFunctions(studentApp, 'asia-south1');
