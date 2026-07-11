// Admin-side read access to the `studentLoginActivity` collection — written
// only by the studentLogin Cloud Function via the Admin SDK (see functions/src/index.ts).
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { StudentLoginActivity } from '../types';

export async function getStudentLoginActivity(): Promise<StudentLoginActivity[]> {
  const q = query(collection(db, 'studentLoginActivity'), orderBy('lastLoginAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudentLoginActivity));
}

/** Live-subscribes to login activity, most recent first. Returns an unsubscribe function. */
export function subscribeToStudentLoginActivity(onChange: (activity: StudentLoginActivity[]) => void): () => void {
  const q = query(collection(db, 'studentLoginActivity'), orderBy('lastLoginAt', 'desc'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudentLoginActivity)));
  });
}
