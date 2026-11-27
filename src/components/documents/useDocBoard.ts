import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  DocOfflineError, docSummary, statusOf, todayLocal, updateDocEntries,
} from '../../services/studentDocumentService';
import type { DocEntry, DocHistoryAction, DocKey, DocRecord } from '../../types';
import { DOC_COPY_DEFAULT, REQUIRED_DOCS } from '../../types';

type EntryMap = Partial<Record<DocKey, DocEntry>>;
type KeyFlags = Partial<Record<DocKey, true>>;

interface Change { key: DocKey; next: DocEntry; action: DocHistoryAction }
interface Job {
  changes: Change[];
  undoMessage?: string;
  /** For undo: the entries we expect to find (conflict check). */
  seenOverride?: EntryMap;
  /** Return date, so the undo chip can offer the return slip. */
  slipDate?: string;
}

export interface BoardUndo {
  id: number;
  message: string;
  before: EntryMap;
  after: EntryMap;
  slipDate?: string;
}

export const LABEL = Object.fromEntries(REQUIRED_DOCS.map((d) => [d.key, d.label])) as Record<DocKey, string>;
const UNDO_MS = 6000;
export const BOARD_UNDO_MS = UNDO_MS;

/** Glide cards to their new column where the browser supports view transitions. */
function withTransition(update: () => void) {
  const d = document as Document & { startViewTransition?: (cb: () => void) => { skipTransition?: () => void } };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!d.startViewTransition || reduce) { update(); return; }
  d.startViewTransition(() => flushSync(update));
}

export const supportsGlide = typeof document !== 'undefined'
  && 'startViewTransition' in document
  && !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function keysOf(job: Job): DocKey[] { return job.changes.map((c) => c.key); }

function phrase(keys: DocKey[], what: string): string {
  return keys.length === 1 ? `${LABEL[keys[0]]} ${what}` : `${keys.length} documents ${what}`;
}

/**
 * Optimistic, serialised editing of one student's checklist.
 * - The board changes the moment the user acts; saves run in the background.
 * - One transaction at a time (they all touch the same Firestore document, and
 *   parallel transactions on one document just contend and retry).
 * - A queued single-document change is replaced by a newer one (latest click wins).
 */
export function useDocBoard(studentId: string, docs: DocRecord | null) {
  const [overrides, setOverrides] = useState<EntryMap>({});
  const [busy, setBusy] = useState<KeyFlags>({});
  const [flash, setFlash] = useState<KeyFlags>({});
  const [errors, setErrors] = useState<Partial<Record<DocKey, string>>>({});
  const [offline, setOffline] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [undo, setUndo] = useState<BoardUndo | null>(null);

  const queue = useRef<Job[]>([]);
  const running = useRef<Job | null>(null);
  const lastSaved = useRef<EntryMap>({});
  const docsRef = useRef<DocRecord | null>(docs);
  /** Source of truth for errors (state mirrors it) — readable synchronously by whenIdle. */
  const errorsRef = useRef(errors);
  const idleWaiters = useRef<((hadError: boolean) => void)[]>([]);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashTimers = useRef<Partial<Record<DocKey, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    const goOnline = () => setOffline(false);
    window.addEventListener('online', goOnline);
    const timers = flashTimers.current;
    return () => {
      window.removeEventListener('online', goOnline);
      clearTimeout(undoTimer.current);
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // ── What the user sees: live snapshot + optimistic overrides ─────────────
  const view = useMemo<DocRecord | null>(() => {
    if (!docs) return null;
    const out = { ...docs };
    for (const { key } of REQUIRED_DOCS) {
      const ov = overrides[key];
      if (!ov) continue;
      if (busy[key] || (docs[key].updatedAt ?? '') < (ov.updatedAt ?? '')) out[key] = ov;
    }
    return out;
  }, [docs, overrides, busy]);

  const viewRef = useRef<DocRecord | null>(view);
  useLayoutEffect(() => {
    viewRef.current = view;
    docsRef.current = docs;
  });

  const writeErrors = useCallback((fn: (e: Partial<Record<DocKey, string>>) => void) => {
    const n = { ...errorsRef.current };
    fn(n);
    errorsRef.current = n;
    setErrors(n);
  }, []);

  /** Latest entry the server is known to hold (what a new change is based on). */
  const base = useCallback((key: DocKey): DocEntry | undefined => {
    const live = docsRef.current?.[key];
    const mine = lastSaved.current[key];
    if (mine && (!live || (live.updatedAt ?? '') < (mine.updatedAt ?? ''))) return mine;
    return live;
  }, []);

  const syncBusy = useCallback(() => {
    const flags: KeyFlags = {};
    for (const j of [...queue.current, ...(running.current ? [running.current] : [])]) {
      for (const k of keysOf(j)) flags[k] = true;
    }
    setBusy(flags);
  }, []);

  const pump = useCallback(async function pumpQueue(): Promise<void> {
    if (running.current) return;
    const job = queue.current.shift();
    if (!job) {
      const hadError = Object.values(errorsRef.current).some(Boolean);
      idleWaiters.current.splice(0).forEach((fn) => fn(hadError));
      return;
    }
    running.current = job;
    syncBusy();

    const keys = keysOf(job);
    const changes = job.changes.map((c) => ({ ...c, seen: job.seenOverride?.[c.key] ?? base(c.key)! }));
    try {
      const saved = await updateDocEntries(studentId, changes);
      Object.assign(lastSaved.current, saved);
      const stillQueued = new Set(queue.current.flatMap(keysOf));
      setOverrides((o) => {
        const n = { ...o };
        for (const k of keys) if (!stillQueued.has(k)) n[k] = saved[k];
        return n;
      });
      setOffline(false);
      setLastSavedAt(new Date().toISOString());
      setFlash((f) => { const n = { ...f }; for (const k of keys) n[k] = true; return n; });
      for (const k of keys) {
        clearTimeout(flashTimers.current[k]);
        flashTimers.current[k] = setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[k]; return n; }), 1600);
      }
      if (job.undoMessage) {
        clearTimeout(undoTimer.current);
        const id = Date.now();
        const before: EntryMap = {};
        for (const c of changes) before[c.key] = c.seen;
        setUndo({ id, message: job.undoMessage, before, after: saved, slipDate: job.slipDate });
        undoTimer.current = setTimeout(() => setUndo((u) => (u?.id === id ? null : u)), UNDO_MS);
      }
    } catch (err) {
      // Drop every queued change that builds on this one, and snap those cards back.
      const failed = new Set(keys);
      const dropped: Job[] = [];
      queue.current = queue.current.filter((j) => {
        const hit = keysOf(j).some((k) => failed.has(k));
        if (hit) dropped.push(j);
        return !hit;
      });
      const reset = new Set([...keys, ...dropped.flatMap(keysOf)]);
      setOverrides((o) => { const n = { ...o }; for (const k of reset) delete n[k]; return n; });
      if (err instanceof DocOfflineError) setOffline(true);
      const msg = err instanceof Error ? err.message : 'Could not save. Please try again.';
      writeErrors((n) => { for (const k of keys) n[k] = msg; });
    } finally {
      running.current = null;
      syncBusy();
      void pumpQueue();
    }
  }, [studentId, base, syncBusy, writeErrors]);

  const enqueue = useCallback((job: Job, glide = false) => {
    if (job.changes.length === 0) return;
    const keys = keysOf(job);
    if (keys.some((k) => errorsRef.current[k])) writeErrors((n) => { for (const k of keys) delete n[k]; });
    // An older Undo for these documents would only conflict now.
    if (!job.seenOverride) setUndo((u) => (u && keys.some((k) => k in u.after) ? null : u));
    // Only the board change itself rides the (deferred) glide transition.
    const apply = () => setOverrides((o) => { const n = { ...o }; for (const c of job.changes) n[c.key] = c.next; return n; });
    if (glide) withTransition(apply); else apply();

    // Latest click wins for a not-yet-started single-document change.
    if (keys.length === 1 && !job.seenOverride) {
      const i = queue.current.findIndex((j) => j.changes.length === 1 && j.changes[0].key === keys[0] && !j.seenOverride);
      if (i >= 0) { queue.current[i] = job; return; }
    }
    queue.current.push(job);
    syncBusy();
    void pump();
  }, [pump, syncBusy, writeErrors]);

  // ── Actions (stable; read the latest board through viewRef) ─────────────
  const entries = useCallback((keys: DocKey[], ok: (e: DocEntry) => boolean) => {
    const v = viewRef.current;
    if (!v) return [] as [DocKey, DocEntry][];
    return keys.map((k) => [k, v[k]] as [DocKey, DocEntry]).filter(([, e]) => ok(e));
  }, []);

  const actions = useMemo(() => ({
    receive(keys: DocKey[], date?: string) {
      const list = entries(keys, (e) => { const s = statusOf(e); return s === 'pending' || s === 'notRequired'; });
      enqueue({
        changes: list.map(([key, e]) => ({
          key, action: 'received' as const,
          next: {
            ...e, submitted: true, submittedOn: date || e.submittedOn || todayLocal(),
            returned: false, returnedOn: '', notRequired: false, copyType: e.copyType ?? DOC_COPY_DEFAULT[key],
          },
        })),
        undoMessage: phrase(list.map(([k]) => k), 'marked Received'),
      }, true);
    },
    markPending(keys: DocKey[]) {
      const list = entries(keys, (e) => statusOf(e) !== 'pending');
      enqueue({
        changes: list.map(([key, e]) => ({
          key, action: (statusOf(e) === 'notRequired' ? 'required' : 'pending') as DocHistoryAction,
          next: { ...e, submitted: false, submittedOn: '', returned: false, returnedOn: '', notRequired: false, copyType: undefined },
        })),
        undoMessage: phrase(list.map(([k]) => k), 'set to Pending'),
      }, true);
    },
    markNotRequired(keys: DocKey[]) {
      const list = entries(keys, (e) => statusOf(e) === 'pending');
      enqueue({
        changes: list.map(([key, e]) => ({
          key, action: 'notRequired' as const,
          next: { ...e, submitted: false, submittedOn: '', returned: false, returnedOn: '', notRequired: true, copyType: undefined },
        })),
        undoMessage: phrase(list.map(([k]) => k), 'marked Not required'),
      }, true);
    },
    returnDocs(keys: DocKey[], date: string, reason: string) {
      const list = entries(keys, (e) => statusOf(e) === 'received');
      enqueue({
        changes: list.map(([key, e]) => ({
          key, action: 'returned' as const,
          next: { ...e, returned: true, returnedOn: date, remarks: reason ? (e.remarks ? `${e.remarks} · ${reason}` : reason) : e.remarks },
        })),
        undoMessage: phrase(list.map(([k]) => k), 'returned'),
        slipDate: date,
      }, true);
    },
    backToCollege(keys: DocKey[]) {
      const list = entries(keys, (e) => statusOf(e) === 'returned');
      enqueue({
        changes: list.map(([key, e]) => ({ key, action: 'unreturned' as const, next: { ...e, returned: false, returnedOn: '' } })),
        undoMessage: list.length === 1 ? `${LABEL[list[0][0]]} is back with the college` : `${list.length} documents back with the college`,
      }, true);
    },
    setDate(key: DocKey, field: 'submittedOn' | 'returnedOn', date: string) {
      const e = viewRef.current?.[key];
      if (e && e[field] !== date) enqueue({ changes: [{ key, action: 'date', next: { ...e, [field]: date } }] });
    },
    setRemarks(key: DocKey, remarks: string) {
      const e = viewRef.current?.[key];
      if (e && (e.remarks ?? '') !== remarks) enqueue({ changes: [{ key, action: 'remarks', next: { ...e, remarks } }] });
    },
    toggleCopy(key: DocKey) {
      const e = viewRef.current?.[key];
      if (e) enqueue({ changes: [{ key, action: 'copyType', next: { ...e, copyType: e.copyType === 'copy' ? 'original' : 'copy' } }] });
    },
    dismissError(key: DocKey) {
      writeErrors((n) => { delete n[key]; });
    },
  }), [entries, enqueue, writeErrors]);

  const undoLast = useCallback(() => {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    setUndo(null);
    const keys = Object.keys(undo.before) as DocKey[];
    enqueue({
      changes: keys.map((key) => ({ key, action: 'undo' as const, next: undo.before[key]! })),
      seenOverride: undo.after,
    }, true);
  }, [undo, enqueue]);

  /** Resolves once every queued save has finished; `true` if a save failed. */
  const whenIdle = useCallback((): Promise<boolean> => {
    if (!running.current && queue.current.length === 0) {
      return Promise.resolve(Object.values(errorsRef.current).some(Boolean));
    }
    return new Promise((resolve) => { idleWaiters.current.push(resolve); });
  }, []);

  return {
    view,
    summary: view ? docSummary(view) : null,
    busy, flash, errors, offline, lastSavedAt,
    saving: Object.keys(busy).length > 0,
    undo, undoLast, actions, whenIdle,
  };
}

export type BoardActions = ReturnType<typeof useDocBoard>['actions'];
