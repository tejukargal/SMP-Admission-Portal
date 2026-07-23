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
  StudentNoticeState, StudentNotification, Circular, StudentCircularState,
} from '../types';
import { calcAllotted, calcRecordTotal, effectiveValues, type YearData } from '../utils/feeCalc';
import type { TCRecord } from './tcService';
import type { PCRecord } from './pcService';
import type { RefundRecord } from './refundService';

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

/** Total pending due across every academic year — drives the Fee History tab badge.
 *  Mirrors the per-year grouping/calculation FeeHistoryTab does for its full view. */
export async function fetchMyTotalDue(regNumber: string, allRecords: Student[]): Promise<number> {
  const records = await fetchMyFeeRecords(regNumber);
  const grouped = new Map<AcademicYear, FeeRecord[]>();
  for (const r of records) {
    const list = grouped.get(r.academicYear) ?? [];
    list.push(r);
    grouped.set(r.academicYear, list);
  }
  const yearData: YearData[] = await Promise.all(
    [...grouped.entries()].map(async ([ay, recs]) => {
      const first = recs[0];
      const structure = await fetchMyFeeStructure(ay, first.course, first.year, first.admType, first.admCat);
      const ownDocForYear = allRecords.find((s) => s.academicYear === ay);
      const override = ownDocForYear ? await fetchMyFeeOverride(ownDocForYear.id, ay) : null;
      return { academicYear: ay, records: recs, structure, override };
    }),
  );
  return yearData.reduce((sum, yd) => {
    const ev = effectiveValues(yd);
    if (!ev) return sum;
    const paid = yd.records.reduce((s, r) => s + calcRecordTotal(r), 0);
    const allotted = calcAllotted(ev.smp, ev.svk, ev.additional, yd.records);
    return sum + Math.max(0, allotted - paid);
  }, 0);
}

/** TC/PC history live as arrays on each year's student doc — read via the
 *  student-portal Firestore instance (`studentDb`) so the request carries the
 *  student's own auth token, not the admin app's. Collects across every
 *  enrollment-year doc sharing this reg number. */
export async function fetchMyTcRecords(regNumber: string): Promise<TCRecord[]> {
  const q = query(collection(studentDb, 'students'), where('regNumber', '==', regNumber));
  const snap = await getDocs(q);
  const all: TCRecord[] = [];
  for (const d of snap.docs) {
    const data = d.data() as { tcHistory?: TCRecord[] };
    all.push(...(data.tcHistory ?? []));
  }
  return all.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

export async function fetchMyPcRecords(regNumber: string): Promise<PCRecord[]> {
  const q = query(collection(studentDb, 'students'), where('regNumber', '==', regNumber));
  const snap = await getDocs(q);
  const all: PCRecord[] = [];
  for (const d of snap.docs) {
    const data = d.data() as { pcHistory?: PCRecord[] };
    all.push(...(data.pcHistory ?? []));
  }
  return all.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

const RECENT_CERTIFICATE_DAYS = 14;

/** True if a TC/PC was issued within the last two weeks — drives the Certificates tab badge. */
export async function fetchHasRecentCertificate(regNumber: string): Promise<boolean> {
  const [tcRecords, pcRecords] = await Promise.all([fetchMyTcRecords(regNumber), fetchMyPcRecords(regNumber)]);
  const cutoff = Date.now() - RECENT_CERTIFICATE_DAYS * 24 * 60 * 60 * 1000;
  const latest = [tcRecords[0]?.issuedAt, pcRecords[0]?.issuedAt].filter((d): d is string => !!d);
  return latest.some((issuedAt) => new Date(issuedAt).getTime() >= cutoff);
}

export async function fetchMyRefundRecords(regNumber: string): Promise<RefundRecord[]> {
  const q = query(collection(studentDb, 'refunds'), where('regNumber', '==', regNumber));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as RefundRecord))
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
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

/** Live-subscribes to the circulars list, newest first. Circulars are visible to
 *  ALL students — department is a display label/filter, not access control.
 *  Caller filters out archivedAt (unpublished) docs. */
export function subscribeToCirculars(onChange: (circulars: Circular[]) => void): () => void {
  const q = query(collection(studentDb, 'circulars'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Circular)));
  });
}

export async function fetchCircularSeenState(regNumber: string): Promise<StudentCircularState | null> {
  const snap = await getDoc(doc(studentDb, 'studentCircularState', regNumber));
  return snap.exists() ? (snap.data() as StudentCircularState) : null;
}

/** Marks the given circular ids as seen for this student — drives the unread badge only. */
export async function markCircularsSeen(regNumber: string, circularIds: string[], currentSeenIds: string[]): Promise<void> {
  const seenCircularIds = [...new Set([...currentSeenIds, ...circularIds])];
  await setDoc(doc(studentDb, 'studentCircularState', regNumber), {
    regNumber, seenCircularIds, updatedAt: new Date().toISOString(),
  });
}

/** Flips this student's own login-activity doc to offline — called right before signOut. */
export async function markStudentOffline(uid: string): Promise<void> {
  await updateDoc(doc(studentDb, 'studentLoginActivity', uid), {
    online: false,
    lastLogoutAt: new Date().toISOString(),
  });
}
