import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, deleteField,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── TC issuance record ───────────────────────────────────────────────────────

export interface TCRecord {
  id: string;
  studentId: string;
  studentName: string;
  tcNumber: string;        // "0001/2025-26"
  dateOfAdmission: string; // "DD/MM/YYYY"
  dateOfLeaving: string;   // "DD/MM/YYYY"
  semester: string;        // "6th Semester"
  course: string;          // "ME"
  lastExam: string;
  result: string;
  isDuplicate: boolean;
  issuedAt: string;        // ISO timestamp
}

const COUNTERS = 'counters';

// ─── Counter helpers ──────────────────────────────────────────────────────────

/** Derive the academic year from an ISO date string (YYYY-MM-DD).
 *  April–March financial year convention:
 *  Apr 2025 – Mar 2026  →  "2025-26"
 *  Jan 2026 – Mar 2026  →  "2025-26"
 */
export function academicYearFromDate(dateISO: string): string {
  const d     = new Date(dateISO);
  const month = d.getMonth() + 1; // 1–12
  const year  = d.getFullYear();
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

/** Format a sequence number and academic year into a TC number string.
 *  e.g.  5, "2025-26"  →  "0005/2025-26"
 */
export function formatTcNumber(seq: number, academicYear: string): string {
  return `${String(seq).padStart(4, '0')}/${academicYear}`;
}

function counterDocId(academicYear: string): string {
  return `${academicYear}__tc`;
}

/** Returns the next available sequence for the given academic year (1-indexed). */
export async function getNextTcSequence(academicYear: string): Promise<number> {
  const ref  = doc(db, COUNTERS, counterDocId(academicYear));
  const snap = await getDoc(ref);
  const current = (snap.data() as { seq?: number } | undefined)?.seq ?? 0;
  return current + 1;
}

/** Persist the TC counter after a certificate has been issued.
 *  Only updates if seq is greater than the currently stored value.
 */
export async function saveTcCounter(academicYear: string, seq: number): Promise<void> {
  const ref  = doc(db, COUNTERS, counterDocId(academicYear));
  const snap = await getDoc(ref);
  const current = (snap.data() as { seq?: number } | undefined)?.seq ?? 0;
  if (seq > current) {
    await setDoc(ref, { seq, updatedAt: new Date().toISOString() });
  }
}

// ─── TC history stored on the student document ───────────────────────────────
// Stored as a `tcHistory` array field on the existing students/{studentId} doc.
// This uses the already-deployed students rules — no new Firestore rules needed.

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Append a TC issuance record to the student document's tcHistory array. */
export async function saveTcRecord(
  studentId: string,
  data: Omit<TCRecord, 'id'>,
): Promise<void> {
  const record: TCRecord = { ...data, id: makeId() };
  await updateDoc(doc(db, 'students', studentId), {
    tcHistory: arrayUnion(record),
  });
}

/** Remove all TC history from a student document and roll back the counter
 *  if the student held the most-recently-issued sequence for a given academic year.
 *  Pass the known history so we use in-memory data instead of a potentially-stale getDoc.
 */
export async function clearTcHistory(studentId: string, history: TCRecord[]): Promise<void> {
  await updateDoc(doc(db, 'students', studentId), { tcHistory: deleteField() });

  if (history.length === 0) return;

  // Find the min and max sequence numbers per academic year used by this student.
  const rangeByYear = new Map<string, { min: number; max: number }>();
  for (const record of history) {
    const match = /^(\d+)\/(.+)$/.exec(record.tcNumber);
    if (!match) continue;
    const seq = parseInt(match[1], 10);
    const yr  = match[2];
    const existing = rangeByYear.get(yr);
    if (!existing) {
      rangeByYear.set(yr, { min: seq, max: seq });
    } else {
      rangeByYear.set(yr, { min: Math.min(existing.min, seq), max: Math.max(existing.max, seq) });
    }
  }

  // For each year, if this student held the global high-water mark, roll the counter
  // back to minSeq - 1 so the next issue reuses their first TC number.
  for (const [yr, { min: minSeq, max: maxSeq }] of rangeByYear) {
    const ref     = doc(db, COUNTERS, counterDocId(yr));
    const cSnap   = await getDoc(ref);
    const current = (cSnap.data() as { seq?: number } | undefined)?.seq ?? 0;
    if (current === maxSeq) {
      await setDoc(ref, { seq: Math.max(0, minSeq - 1), updatedAt: new Date().toISOString() });
    }
  }
}

/** Read TC history from the student document, sorted newest-first. */
export async function getTcRecordsByStudent(studentId: string): Promise<TCRecord[]> {
  const snap    = await getDoc(doc(db, 'students', studentId));
  const history = (snap.data() as { tcHistory?: TCRecord[] } | undefined)?.tcHistory ?? [];
  return [...history].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}
