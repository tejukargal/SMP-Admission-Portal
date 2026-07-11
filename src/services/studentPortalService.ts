// Read-only Firestore access for the student self-service portal.
// Uses `studentDb` (bound to the secondary student-only Firebase app/auth
// instance) so every request carries the signed-in student's custom-token
// identity — see src/config/studentFirebase.ts and firestore.rules.
import {
  collection, query, where, getDocs, doc, getDoc, addDoc, onSnapshot, orderBy, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { studentDb } from '../config/studentFirebase';
import type {
  Student, FeeRecord, FeeStructure, StudentFeeOverride, ExamResult,
  Notice, StudentMessage, StudentMessageCategory, AcademicYear, Course,
  StudentNoticeState, StudentNotification,
} from '../types';

export async function fetchStudentRecordsByRegNumber(regNumber: string): Promise<Student[]> {
  const q = query(collection(studentDb, 'students'), where('regNumber', '==', regNumber));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Student));
}

export async function fetchStudentRecordById(studentDocId: string): Promise<Student | null> {
  const snap = await getDoc(doc(studentDb, 'students', studentDocId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Student) : null;
}

export async function fetchMyFeeRecords(regNumber: string): Promise<FeeRecord[]> {
  const q = query(collection(studentDb, 'feeRecords'), where('regNumber', '==', regNumber));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeRecord));
}

export async function fetchMyFeeStructure(
  academicYear: AcademicYear, course: Course, year: string, admType: string, admCat: string,
): Promise<FeeStructure | null> {
  const id = `${academicYear}__${course}__${year}__${admType}__${admCat}`;
  const snap = await getDoc(doc(studentDb, 'feeStructure', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as FeeStructure) : null;
}

export async function fetchMyFeeOverride(studentId: string, academicYear: AcademicYear): Promise<StudentFeeOverride | null> {
  const snap = await getDoc(doc(studentDb, 'feeOverrides', `${studentId}__${academicYear}`));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as StudentFeeOverride) : null;
}

export async function fetchMyExamResults(regNumber: string): Promise<ExamResult[]> {
  const q = query(collection(studentDb, 'examResults'), where('regNumber', '==', regNumber));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExamResult));
}

export async function fetchNotices(): Promise<Notice[]> {
  const q = query(collection(studentDb, 'notices'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notice));
}

/** Live-subscribes to the notices list, newest first. Returns an unsubscribe function. */
export function subscribeToNotices(onChange: (notices: Notice[]) => void): () => void {
  const q = query(collection(studentDb, 'notices'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notice)));
  });
}

export async function fetchMyMessages(regNumber: string): Promise<StudentMessage[]> {
  const q = query(collection(studentDb, 'studentMessages'), where('regNumber', '==', regNumber));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as StudentMessage))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function submitMyMessage(
  regNumber: string, studentName: string, category: StudentMessageCategory, message: string,
): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(collection(studentDb, 'studentMessages'), {
    regNumber, studentName, category, message,
    status: 'open', createdAt: now, updatedAt: now,
  });
}

export async function fetchNoticeSeenState(regNumber: string): Promise<StudentNoticeState | null> {
  const snap = await getDoc(doc(studentDb, 'studentNoticeState', regNumber));
  return snap.exists() ? (snap.data() as StudentNoticeState) : null;
}

/** Marks the given notice ids as seen for this student — drives the unread badge only; students cannot dismiss notices. */
export async function markNoticesSeen(regNumber: string, noticeIds: string[], currentSeenIds: string[]): Promise<void> {
  const seenNoticeIds = [...new Set([...currentSeenIds, ...noticeIds])];
  await setDoc(doc(studentDb, 'studentNoticeState', regNumber), {
    regNumber, seenNoticeIds, updatedAt: new Date().toISOString(),
  });
}

export async function fetchMyNotifications(regNumber: string): Promise<StudentNotification[]> {
  const q = query(collection(studentDb, 'studentNotifications'), where('regNumber', '==', regNumber));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as StudentNotification))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markNotificationsSeen(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(studentDb);
  const now = new Date().toISOString();
  for (const id of ids) {
    batch.update(doc(studentDb, 'studentNotifications', id), { seen: true, seenAt: now });
  }
  await batch.commit();
}

/** Flips this student's own login-activity doc to offline — called right before signOut. */
export async function markStudentOffline(uid: string): Promise<void> {
  await updateDoc(doc(studentDb, 'studentLoginActivity', uid), {
    online: false,
    lastLogoutAt: new Date().toISOString(),
  });
}
