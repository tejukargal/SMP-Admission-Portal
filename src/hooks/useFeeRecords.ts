import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { FeeRecord, AcademicYear } from '../types';

export type FeeRecordsMode = 'by-year' | 'by-date';

// Derives the financial year date range (01-Apr to 31-Mar) from an academic year
// string like '2025-26'. Used to query fee records by payment date instead of
// academicYear field — so previous-year dues collected in the current financial
// year still appear in the current year's Fee Register.
function financialYearDateRange(academicYear: AcademicYear): { startDate: string; endDate: string } {
  const startYear = parseInt(academicYear.split('-')[0], 10);
  return {
    startDate: `${startYear}-04-01`,
    endDate:   `${startYear + 1}-03-31`,
  };
}

// ── Shared live store ────────────────────────────────────────────────────────
// One Firestore listener per "${academicYear}|${mode}", shared by every consumer
// (Fee Register, Collect Fee, Dashboard, Fee Reports …). When the last consumer
// goes away the listener is kept alive for IDLE_MS, so a collection made on the
// Dashboard is already in the store when you switch to the Fee Register — the
// page never opens on stale data.

const IDLE_MS = 10 * 60 * 1000;

interface Entry {
  records: FeeRecord[];
  loaded: boolean;
  error: string | null;
  unsub: Unsubscribe | null;
  subscribers: Set<() => void>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const store = new Map<string, Entry>();
const EMPTY: FeeRecord[] = [];

const keyOf = (academicYear: AcademicYear, mode: FeeRecordsMode) => `${academicYear}|${mode}`;

function notify(entry: Entry) {
  for (const fn of entry.subscribers) fn();
}

function listen(entry: Entry, academicYear: AcademicYear, mode: FeeRecordsMode) {
  const q = mode === 'by-date'
    ? (() => {
        const { startDate, endDate } = financialYearDateRange(academicYear);
        return query(
          collection(db, 'feeRecords'),
          where('date', '>=', startDate),
          where('date', '<=', endDate),
        );
      })()
    : query(collection(db, 'feeRecords'), where('academicYear', '==', academicYear));

  entry.unsub = onSnapshot(
    q,
    (snap) => {
      entry.records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeeRecord));
      entry.loaded = true;
      entry.error = null;
      notify(entry);
    },
    (err) => {
      entry.error = err.message;
      entry.loaded = true;
      notify(entry);
    },
  );
}

function getEntry(academicYear: AcademicYear, mode: FeeRecordsMode): Entry {
  const key = keyOf(academicYear, mode);
  let entry = store.get(key);
  if (!entry) {
    entry = { records: EMPTY, loaded: false, error: null, unsub: null, subscribers: new Set(), idleTimer: null };
    store.set(key, entry);
  }
  if (!entry.unsub) listen(entry, academicYear, mode);
  return entry;
}

/** Subscribe to the live fee records for a year/mode. `onChange` fires on every
 *  snapshot; read the current data with getFeeRecordsSnapshot(). */
export function subscribeFeeRecordsKey(
  academicYear: AcademicYear,
  mode: FeeRecordsMode,
  onChange: () => void,
): () => void {
  const entry = getEntry(academicYear, mode);
  if (entry.idleTimer) { clearTimeout(entry.idleTimer); entry.idleTimer = null; }
  entry.subscribers.add(onChange);
  return () => {
    entry.subscribers.delete(onChange);
    scheduleIdle(entry);
  };
}

/** Stops an unused listener after IDLE_MS. The last records are kept so a later
 *  mount renders instantly; the new listener's first snapshot replaces them. */
function scheduleIdle(entry: Entry) {
  if (entry.subscribers.size > 0 || entry.idleTimer) return;
  entry.idleTimer = setTimeout(() => {
    entry.idleTimer = null;
    if (entry.subscribers.size > 0) return;
    entry.unsub?.();
    entry.unsub = null;
  }, IDLE_MS);
}

/** Current store data for a year/mode (records + whether a snapshot has arrived). */
export function getFeeRecordsSnapshot(academicYear: AcademicYear, mode: FeeRecordsMode): { records: FeeRecord[]; loaded: boolean; error: string | null } {
  const entry = store.get(keyOf(academicYear, mode));
  return entry ? { records: entry.records, loaded: entry.loaded, error: entry.error } : { records: EMPTY, loaded: false, error: null };
}

/** Restart the listener for a key without dropping the data already shown. */
function resubscribe(academicYear: AcademicYear, mode: FeeRecordsMode) {
  const entry = store.get(keyOf(academicYear, mode));
  if (!entry) return;
  entry.unsub?.();
  entry.unsub = null;
  listen(entry, academicYear, mode);
}

export function useFeeRecords(
  academicYear: AcademicYear | null,
  options?: { mode?: FeeRecordsMode },
) {
  const mode = options?.mode ?? 'by-year';
  // Bumped on every store notification so the component re-reads the entry.
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!academicYear) return;
    return subscribeFeeRecordsKey(academicYear, mode, () => setVersion((v) => v + 1));
  }, [academicYear, mode]);

  if (!academicYear) {
    return { records: EMPTY, loading: false, error: null as string | null, refetch: () => {} };
  }

  // Ensure a listener exists even before the effect runs (first render), so the
  // persistent-cache snapshot starts as early as possible.
  const entry = getEntry(academicYear, mode);
  scheduleIdle(entry);
  return {
    records: entry.records,
    loading: !entry.loaded,
    error: entry.error,
    refetch: () => resubscribe(academicYear, mode),
  };
}
