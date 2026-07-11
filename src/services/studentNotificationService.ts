// Admin-side writer for the `studentNotifications` collection — uses the
// primary `db` (admin/staff Firebase Auth session). Students read their own
// notifications via studentPortalService.ts (separate student Firestore instance).
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { StudentNotification } from '../types';

const COL = 'studentNotifications';

export async function createStudentNotification(
  data: Omit<StudentNotification, 'id' | 'createdAt' | 'seen'>,
): Promise<void> {
  await addDoc(collection(db, COL), { ...data, createdAt: new Date().toISOString(), seen: false });
}
