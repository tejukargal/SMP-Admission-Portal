import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { SeatCancelLetterRecord } from '../types';

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Append a Seat Cancellation letter print to the student document's seatCancelLetterHistory array. */
export async function saveSeatCancelLetterRecord(
  studentId: string,
  data: Omit<SeatCancelLetterRecord, 'id'>,
): Promise<SeatCancelLetterRecord> {
  const record: SeatCancelLetterRecord = { ...data, id: makeId() };
  await updateDoc(doc(db, 'students', studentId), {
    seatCancelLetterHistory: arrayUnion(record),
  });
  return record;
}

/** Permanently remove a single letter record (e.g. printed by mistake). */
export async function deleteSeatCancelLetterRecord(studentId: string, recordId: string): Promise<void> {
  const ref = doc(db, 'students', studentId);
  const snap = await getDoc(ref);
  const history = (snap.data() as { seatCancelLetterHistory?: SeatCancelLetterRecord[] } | undefined)?.seatCancelLetterHistory ?? [];
  await updateDoc(ref, { seatCancelLetterHistory: history.filter((r) => r.id !== recordId) });
}

/** Read Seat Cancellation letter history from the student document, sorted newest-first. */
export async function getSeatCancelLetterRecords(studentId: string): Promise<SeatCancelLetterRecord[]> {
  const snap = await getDoc(doc(db, 'students', studentId));
  const history = (snap.data() as { seatCancelLetterHistory?: SeatCancelLetterRecord[] } | undefined)?.seatCancelLetterHistory ?? [];
  return [...history].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}
