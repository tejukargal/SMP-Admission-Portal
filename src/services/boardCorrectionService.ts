import {
  arrayRemove, arrayUnion, collection, deleteField, doc, getDocFromServer, getDocsFromServer,
  orderBy, query, setDoc, updateDoc, writeBatch, limit as limitDocs,
  type DocumentData, type WriteBatch,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { loadXlsx } from '../utils/lazyLibs';
import { isValidDob } from './dataHealthService';
import { normCategory, normGender, parseDOB } from './importAddressService';

// Settings › Import › Board Corrections.
//
// Each Excel row is matched on its Temp Reg No. The student's Reg No becomes the
// Board Reg No, and Name (SSLC), Name (Aadhar), Father, Mother, DOB, Gender and
// Category are updated from the file. Everything else on the record stays as it is.
//
// regNumber is the student-portal identity and the link between a student's year
// records, fee records, files etc., so a Reg No change reaches every copy. Each
// student's writes and their undo data sit in one atomic batch. Fee amounts and
// receipt numbers are never written, and no studentNotifications are created
// (each one would send a push).

const RUNS = 'boardCorrectionRuns';
const ITEMS = 'items';
const MAX_BATCH_WRITES = 400;

const STATE_COLLECTIONS = ['studentNoticeState', 'studentCircularState', 'studentBriefingState', 'studentPushTokens'] as const;
const LINKED_COLLECTIONS = [
  'feeRecords', 'refunds', 'studentFiles', 'studentMessages', 'studentNotifications', 'notices', 'examResults',
  ...STATE_COLLECTIONS,
] as const;
type LinkedCollection = (typeof LINKED_COLLECTIONS)[number];

export const COLLECTION_LABEL: Record<string, string> = {
  students: 'Student records',
  feeRecords: 'Fee records',
  refunds: 'Refunds',
  studentFiles: 'Student files',
  studentMessages: 'Student messages',
  studentNotifications: 'Student notifications',
  notices: 'Notices',
  examResults: 'Exam results',
  studentNoticeState: 'Notice seen-state',
  studentCircularState: 'Circular seen-state',
  studentBriefingState: 'Briefing seen-state',
  studentPushTokens: 'Push tokens',
};

// ─── Workbook ────────────────────────────────────────────────────────────────

/** The only student fields this import writes (plus Reg No). */
export const BOARD_FIELDS = [
  { field: 'studentNameSSLC', label: 'Name (SSLC)', cols: ['Name (SSLC)', 'Name'] },
  { field: 'studentNameAadhar', label: 'Name (Aadhar)', cols: ['Name (Aadhar)', 'Name (Aadhaar)'] },
  { field: 'fatherName', label: 'Father Name', cols: ['Father Name'] },
  { field: 'motherName', label: 'Mother Name', cols: ['Mother Name'] },
  { field: 'dateOfBirth', label: 'DOB', cols: ['Date of Birth', 'DOB'] },
  { field: 'gender', label: 'Gender', cols: ['Gender'] },
  { field: 'category', label: 'Category', cols: ['Category'] },
] as const;
type BoardField = (typeof BOARD_FIELDS)[number]['field'];

export const REQUIRED_COLUMNS = ['Reg No', 'Temp Reg No', 'Name (SSLC)'];
const BOARD_REG_RE = /^\d{3}[A-Z]{2}\d{5}$/;
const PLACEHOLDER_REG_RE = /^\d{3}[A-Z]{2}$/;

/** Trim and collapse runs of whitespace; numeric cells lose a trailing ".0". */
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/\.0+$/, '');
const regKey = (v: unknown) => clean(v).toUpperCase();
/** "308CE" style placeholders are shared by many students and never identify one. */
const isIdentifyingReg = (reg: string) => !!reg && !PLACEHOLDER_REG_RE.test(reg);

export interface BoardRow {
  /** Excel row number, for messages. */
  rowNo: string;
  name: string;
  regNo: string;
  tempReg: string;
  academicYear: string;
  /** Valid, non-blank values only. A blank cell never overwrites data. */
  fields: Partial<Record<BoardField, string>>;
  /** Cells that were invalid and will be skipped. */
  warnings: string[];
}

export interface BoardWorkbook {
  fileName: string;
  rows: BoardRow[];
  /** Which update columns the file has, by field. */
  presentFields: BoardField[];
}

export async function parseBoardWorkbook(data: ArrayBuffer, fileName: string): Promise<BoardWorkbook> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'students') ?? wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws) throw new Error('This workbook has no sheets.');

  // raw:true so a real Excel date in the DOB column arrives as a serial number.
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
  if (raw.length === 0) throw new Error(`The "${sheetName}" sheet is empty.`);

  const keys = Object.keys(raw[0]);
  const findCol = (...aliases: string[]) => {
    const wanted = aliases.map((a) => a.toLowerCase());
    return keys.find((k) => wanted.includes(k.trim().toLowerCase()));
  };

  const colReg = findCol('Reg No', 'Board Reg No');
  const colTemp = findCol('Temp Reg No', 'Temporary Reg No');
  const colName = findCol('Name (SSLC)', 'Name');
  const missing = [!colReg && 'Reg No', !colTemp && 'Temp Reg No', !colName && 'Name (SSLC)'].filter(Boolean);
  if (missing.length > 0) throw new Error(`The "${sheetName}" sheet is missing column(s): ${missing.join(', ')}`);
  const colYear = findCol('Academic Year');
  const fieldCols = BOARD_FIELDS.map((f) => ({ ...f, col: findCol(...f.cols) }));

  const rows: BoardRow[] = [];
  raw.forEach((r, i) => {
    const name = regKey(r[colName!]);
    const regNo = regKey(r[colReg!]);
    const tempReg = regKey(r[colTemp!]);
    if (!name && !regNo && !tempReg) return;

    const fields: Partial<Record<BoardField, string>> = {};
    const warnings: string[] = [];
    for (const f of fieldCols) {
      if (!f.col) continue;
      const cell = r[f.col];
      if (f.field === 'dateOfBirth') {
        const dob = parseDOB(typeof cell === 'number' ? cell : clean(cell));
        if (!dob) continue;
        if (isValidDob(dob)) fields.dateOfBirth = dob;
        else warnings.push(`DOB "${dob}" is not a valid DD/MM/YYYY date`);
        continue;
      }
      const v = regKey(cell);
      if (!v) continue;
      if (f.field === 'gender') {
        const g = normGender(v);
        if (g) fields.gender = g; else warnings.push(`Gender "${v}" is not BOY or GIRL`);
      } else if (f.field === 'category') {
        const c = normCategory(v);
        if (c) fields.category = c; else warnings.push(`Category "${v}" is not SC/ST/C1/2A/2B/3A/3B/GM`);
      } else {
        fields[f.field] = v;
      }
    }

    rows.push({
      rowNo: String(i + 2),
      name,
      regNo,
      tempReg,
      academicYear: colYear ? clean(r[colYear]) : '',
      fields,
      warnings,
    });
  });

  if (rows.length === 0) throw new Error(`The "${sheetName}" sheet has no student rows.`);
  const presentFields = fieldCols.filter((f) => f.col).map((f) => f.field);
  return { fileName, rows, presentFields };
}

// ─── Scan ────────────────────────────────────────────────────────────────────

export interface FieldChange { field: string; label: string; before: string; after: string }

export type EntryStatus = 'update' | 'same' | 'skip';

export interface BoardEntry {
  rowNo: string;
  name: string;
  newReg: string;
  tempReg: string;
  /** Reg No the record holds now. */
  currentReg: string;
  primaryId: string;
  /** Every academic-year doc of this student, including the primary. */
  docIds: string[];
  /** Move the temp number to the Board number on the student and its linked records. */
  moveReg: boolean;
  changes: FieldChange[];
  warnings: string[];
  skipReason?: string;
  status: EntryStatus;
}

type RawDoc = { id: string; data: DocumentData };

/** Everything the scan read from the server, so a run's writes are built from it. */
export interface ScanData {
  students: RawDoc[];
  linked: Record<LinkedCollection, RawDoc[]>;
}

export interface BoardScan {
  scannedAt: string;
  entries: BoardEntry[];
  data: ScanData;
}

async function readCollection(name: string): Promise<RawDoc[]> {
  const snap = await getDocsFromServer(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

/** Docs for one student's linked records, found by old number, new number or student doc id. */
function linkedDocs(col: LinkedCollection, data: ScanData, regs: string[], docIds: string[]): RawDoc[] {
  const regSet = new Set(regs.filter(Boolean));
  const idSet = new Set(docIds);
  return data.linked[col].filter((d) => {
    const reg = regKey(d.data.regNumber);
    if (regSet.has(reg)) return true;
    if (col === 'studentFiles' && regSet.has(regKey(d.data.ownerKey))) return true;
    if ((col === 'feeRecords' || col === 'refunds' || col === 'studentFiles') && idSet.has(String(d.data.studentId ?? ''))) return true;
    return false;
  });
}

function noticeTargets(d: RawDoc, reg: string): boolean {
  if (d.data.scope === 'regNumber' && regKey(d.data.scopeValue) === reg) return true;
  const targets = d.data.targetRegNumbers;
  return Array.isArray(targets) && targets.some((t) => regKey(t) === reg);
}

/** Linked records still filed under a temporary number (e.g. after an interrupted run). */
function hasLeftovers(data: ScanData, tempReg: string): boolean {
  if (!tempReg) return false;
  const byReg = (col: LinkedCollection) => data.linked[col].some((d) => regKey(d.data.regNumber) === tempReg);
  return byReg('feeRecords') || byReg('refunds') || byReg('studentMessages') || byReg('studentNotifications')
    || byReg('examResults')
    || data.linked.studentFiles.some((d) => regKey(d.data.ownerKey) === tempReg || regKey(d.data.regNumber) === tempReg)
    || data.linked.notices.some((d) => noticeTargets(d, tempReg))
    || STATE_COLLECTIONS.some((col) => data.linked[col].some((d) => d.id === tempReg));
}

export function analyseBoardWorkbook(wb: BoardWorkbook, data: ScanData): BoardScan {
  const byReg = new Map<string, RawDoc[]>();
  for (const d of data.students) {
    const reg = regKey(d.data.regNumber);
    if (!isIdentifyingReg(reg)) continue;
    const list = byReg.get(reg);
    if (list) list.push(d); else byReg.set(reg, [d]);
  }

  const countOf = (pick: (r: BoardRow) => string) => {
    const m = new Map<string, number>();
    for (const r of wb.rows) {
      const v = pick(r);
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  };
  const regCounts = countOf((r) => r.regNo);
  const tempCounts = countOf((r) => r.tempReg);

  const entries: BoardEntry[] = wb.rows.map((row) => {
    const { regNo: newReg, tempReg } = row;
    const base = {
      rowNo: row.rowNo, name: row.name, newReg, tempReg, currentReg: '', primaryId: '', docIds: [] as string[],
      moveReg: false, changes: [] as FieldChange[], warnings: row.warnings,
    };
    const skip = (reason: string): BoardEntry => ({ ...base, skipReason: reason, status: 'skip' });

    // ── File checks ──
    if (!newReg) return skip('Reg No is blank');
    if (!BOARD_REG_RE.test(newReg)) return skip(`Reg No "${newReg}" is not a Board Reg No (e.g. 308CE26001)`);
    if ((regCounts.get(newReg) ?? 0) > 1) return skip(`Reg No ${newReg} appears more than once in the file`);
    if (tempReg && (tempCounts.get(tempReg) ?? 0) > 1) return skip(`Temp Reg No ${tempReg} appears more than once in the file`);

    // ── Find the student: under the Temp Reg No, or already on the Board Reg No ──
    const onTemp = tempReg && tempReg !== newReg ? byReg.get(tempReg) ?? [] : [];
    const onNew = byReg.get(newReg) ?? [];
    if (onTemp.length > 0 && onNew.length > 0) {
      const holder = onNew[0].data;
      return skip(`Reg No ${newReg} already belongs to ${clean(holder.studentNameSSLC)} (${holder.academicYear})`);
    }
    const docs = onTemp.length > 0 ? onTemp : onNew;
    if (docs.length === 0) {
      return skip(`No student found with ${[tempReg && `Temp Reg No ${tempReg}`, `Reg No ${newReg}`].filter(Boolean).join(' or ')}`);
    }

    // One record per academic year, or the number is shared by different students.
    const years = new Map<string, number>();
    for (const d of docs) years.set(d.data.academicYear, (years.get(d.data.academicYear) ?? 0) + 1);
    const clash = [...years.entries()].find(([, n]) => n > 1);
    if (clash) return skip(`${clash[1]} records in ${clash[0]} hold Reg No ${regKey(docs[0].data.regNumber)}`);

    const sorted = [...docs].sort((a, b) => String(b.data.academicYear).localeCompare(String(a.data.academicYear)));
    const primary = sorted.find((d) => d.data.academicYear === row.academicYear) ?? sorted[0];
    if (primary.data.course && newReg.slice(3, 5) !== primary.data.course) {
      return skip(`Reg No ${newReg} is for ${newReg.slice(3, 5)}, but the student is in ${primary.data.course}`);
    }

    // ── Changes ──
    const currentReg = regKey(primary.data.regNumber);
    const needsNewReg = onTemp.length > 0;
    const moveReg = !!tempReg && tempReg !== newReg && (needsNewReg || hasLeftovers(data, tempReg));
    const changes: FieldChange[] = [];
    if (moveReg) {
      changes.push({ field: 'regNumber', label: 'Reg No', before: needsNewReg ? currentReg : `${tempReg} (linked records)`, after: newReg });
    }
    for (const f of BOARD_FIELDS) {
      const after = row.fields[f.field];
      if (!after) continue;
      const differing = sorted.find((d) => String(d.data[f.field] ?? '') !== after);
      if (!differing) continue;
      const primaryValue = String(primary.data[f.field] ?? '');
      const before = primaryValue !== after ? primaryValue : String(differing.data[f.field] ?? '');
      changes.push({ field: f.field, label: f.label, before, after });
    }

    return {
      ...base,
      currentReg,
      primaryId: primary.id,
      docIds: sorted.map((d) => d.id),
      moveReg,
      changes,
      status: changes.length > 0 ? 'update' : 'same',
    };
  });

  return { scannedAt: new Date().toISOString(), entries, data };
}

/** Read-only. Always reads from the server, because the app's offline cache could be stale. */
export async function scanBoardCorrections(wb: BoardWorkbook): Promise<BoardScan> {
  const [students, ...loaded] = await Promise.all([
    readCollection('students'),
    ...LINKED_COLLECTIONS.map((c) => readCollection(c)),
  ]);
  const linked = Object.fromEntries(LINKED_COLLECTIONS.map((c, i) => [c, loaded[i]])) as Record<LinkedCollection, RawDoc[]>;
  return analyseBoardWorkbook(wb, { students, linked });
}

// ─── Plan ────────────────────────────────────────────────────────────────────

/** One write, in a form that can be stored for undo. */
export type WriteOp =
  | { kind: 'update'; col: string; id: string; before: Record<string, unknown>; after: Record<string, unknown>; absent: string[] }
  | { kind: 'move'; col: string; fromId: string; toId: string; oldData: DocumentData; newData: DocumentData }
  | { kind: 'remove'; col: string; id: string; oldData: DocumentData }
  | { kind: 'replaceTarget'; col: string; id: string; from: string; to: string };

const writesFor = (op: WriteOp) => (op.kind === 'move' || op.kind === 'replaceTarget' ? 2 : 1);

function updateOp(col: string, d: RawDoc, fields: Record<string, unknown>): WriteOp | null {
  if (Object.keys(fields).length === 0) return null;
  const before: Record<string, unknown> = {};
  const absent: string[] = [];
  for (const k of Object.keys(fields)) {
    if (d.data[k] === undefined) absent.push(k);
    else before[k] = d.data[k];
  }
  return { kind: 'update', col, id: d.id, before, after: fields, absent };
}

/** Builds every write for one student. */
export function buildStudentOps(entry: BoardEntry, data: ScanData, now: string): WriteOp[] {
  const ops: WriteOp[] = [];
  const push = (op: WriteOp | null) => { if (op) ops.push(op); };

  const { tempReg, newReg, moveReg } = entry;
  const person: Record<string, string> = {};
  for (const c of entry.changes) {
    if (c.field !== 'regNumber') person[c.field] = c.after;
  }

  // ── students: every year record ──
  const docIds = new Set(entry.docIds);
  for (const d of data.students) {
    if (!docIds.has(d.id)) continue;
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(person)) {
      if (String(d.data[k] ?? '') !== v) fields[k] = v;
    }
    if (moveReg && regKey(d.data.regNumber) !== newReg) {
      fields.regNumber = newReg;
      fields.previousRegNumber = regKey(d.data.regNumber);
    }
    if (Object.keys(fields).length > 0) fields.updatedAt = now;
    push(updateOp('students', d, fields));
  }

  const regs = [tempReg, newReg];

  // ── feeRecords / refunds: identity copies only, never amounts or receipt numbers ──
  for (const col of ['feeRecords', 'refunds'] as const) {
    for (const d of linkedDocs(col, data, regs, entry.docIds)) {
      const fields: Record<string, unknown> = {};
      const reg = regKey(d.data.regNumber);
      if (moveReg && (reg === tempReg || reg === '')) fields.regNumber = newReg;
      if (person.studentNameSSLC && d.data.studentName !== person.studentNameSSLC) fields.studentName = person.studentNameSSLC;
      if (person.fatherName && d.data.fatherName !== person.fatherName) fields.fatherName = person.fatherName;
      if (col === 'feeRecords' && Object.keys(fields).length > 0) fields.updatedAt = now;
      push(updateOp(col, d, fields));
    }
  }

  // ── studentFiles: ownerKey keeps files showing across the student's years ──
  for (const d of linkedDocs('studentFiles', data, regs, entry.docIds)) {
    const fields: Record<string, unknown> = {};
    if (moveReg && regKey(d.data.ownerKey) === tempReg) fields.ownerKey = newReg;
    if (moveReg && regKey(d.data.regNumber) === tempReg) fields.regNumber = newReg;
    if (person.studentNameSSLC && d.data.studentName !== person.studentNameSSLC) fields.studentName = person.studentNameSSLC;
    push(updateOp('studentFiles', d, fields));
  }

  // ── studentMessages / studentNotifications ──
  for (const d of linkedDocs('studentMessages', data, regs, [])) {
    const fields: Record<string, unknown> = {};
    if (moveReg && regKey(d.data.regNumber) === tempReg) fields.regNumber = newReg;
    if (person.studentNameSSLC && d.data.studentName !== person.studentNameSSLC) fields.studentName = person.studentNameSSLC;
    push(updateOp('studentMessages', d, fields));
  }
  if (moveReg) {
    for (const d of linkedDocs('studentNotifications', data, [tempReg], [])) {
      push(updateOp('studentNotifications', d, { regNumber: newReg }));
    }
  }

  if (!moveReg) return ops;

  // ── notices: updatedAt is left alone so nothing re-flags as unread. A 'selected'
  // notice can target many students, so only this student's number is swapped. ──
  for (const d of data.linked.notices) {
    if (d.data.scope === 'regNumber' && regKey(d.data.scopeValue) === tempReg) {
      push(updateOp('notices', d, { scopeValue: newReg }));
    }
    const targets = d.data.targetRegNumbers;
    if (Array.isArray(targets) && targets.some((t) => regKey(t) === tempReg)) {
      ops.push({ kind: 'replaceTarget', col: 'notices', id: d.id, from: tempReg, to: newReg });
    }
  }

  // ── Docs whose id is the Reg No ──
  for (const col of STATE_COLLECTIONS) {
    const old = data.linked[col].find((d) => d.id === tempReg);
    if (!old) continue;
    if (data.linked[col].some((d) => d.id === newReg)) {
      // The student already has state under the new number. The newer doc wins.
      ops.push({ kind: 'remove', col, id: old.id, oldData: old.data });
    } else {
      const newData = { ...old.data };
      if (regKey(newData.regNumber) === tempReg) newData.regNumber = newReg;
      ops.push({ kind: 'move', col, fromId: old.id, toId: newReg, oldData: old.data, newData });
    }
  }

  // ── examResults: the doc id contains the Reg No. Student names stay as the Board's ledger printed them. ──
  for (const d of data.linked.examResults) {
    if (regKey(d.data.regNumber) !== tempReg) continue;
    const toId = d.id.replace(tempReg, newReg);
    if (toId === d.id) {
      push(updateOp('examResults', d, { regNumber: newReg }));
    } else if (!data.linked.examResults.some((x) => x.id === toId)) {
      ops.push({ kind: 'move', col: 'examResults', fromId: d.id, toId, oldData: d.data, newData: { ...d.data, regNumber: newReg } });
    }
    // If a result already exists under the new id it stays put: results are never deleted here.
  }

  return ops;
}

// ─── Apply ───────────────────────────────────────────────────────────────────

function addOpToBatch(batch: WriteBatch, op: WriteOp) {
  switch (op.kind) {
    case 'update':
      batch.update(doc(db, op.col, op.id), op.after);
      break;
    case 'move':
      batch.set(doc(db, op.col, op.toId), op.newData);
      batch.delete(doc(db, op.col, op.fromId));
      break;
    case 'remove':
      batch.delete(doc(db, op.col, op.id));
      break;
    case 'replaceTarget':
      batch.update(doc(db, op.col, op.id), { targetRegNumbers: arrayRemove(op.from) });
      batch.update(doc(db, op.col, op.id), { targetRegNumbers: arrayUnion(op.to) });
      break;
  }
}

export interface ApplySkip { rowNo: string; name: string; regNo: string; reason: string }

export interface ApplyResult {
  runId: string;
  studentsApplied: number;
  recordsWritten: number;
  skipped: ApplySkip[];
  /** Set when a batch failed: later students were not attempted. */
  error?: string;
}

export async function applyBoardCorrections(
  wb: BoardWorkbook,
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyResult> {
  if (!navigator.onLine) throw new Error('You appear to be offline. Connect to the internet before updating.');

  // Re-read from the server just before writing: this also fails loudly when the
  // connection is really down, where a batch would otherwise queue in the offline cache.
  const fresh = await scanBoardCorrections(wb);
  const now = new Date().toISOString();
  const skipped: ApplySkip[] = fresh.entries
    .filter((e) => e.status === 'skip')
    .map((e) => ({ rowNo: e.rowNo, name: e.name, regNo: e.tempReg || e.newReg, reason: e.skipReason ?? '' }));
  const plans = fresh.entries
    .filter((e) => e.status === 'update')
    .map((entry) => ({ entry, ops: buildStudentOps(entry, fresh.data, now) }))
    .filter((p) => p.ops.length > 0);

  const runRef = doc(collection(db, RUNS));
  const result: ApplyResult = { runId: runRef.id, studentsApplied: 0, recordsWritten: 0, skipped };
  if (plans.length === 0) return result;
  onProgress?.(0, plans.length);

  await setDoc(runRef, {
    createdAt: now,
    createdBy: auth.currentUser?.email ?? '',
    fileName: wb.fileName,
    kind: 'import',
    status: 'running',
    studentsPlanned: plans.length,
    studentsApplied: 0,
    recordsWritten: 0,
  });

  // Fill batches without ever splitting a student.
  const batches: (typeof plans)[] = [];
  let current: typeof plans = [];
  let currentWrites = 0;
  for (const plan of plans) {
    const writes = plan.ops.reduce((n, op) => n + writesFor(op), 1);
    if (current.length > 0 && currentWrites + writes > MAX_BATCH_WRITES) {
      batches.push(current);
      current = [];
      currentWrites = 0;
    }
    current.push(plan);
    currentWrites += writes;
  }
  if (current.length > 0) batches.push(current);

  try {
    for (const group of batches) {
      const batch = writeBatch(db);
      for (const { entry, ops } of group) {
        for (const op of ops) addOpToBatch(batch, op);
        batch.set(doc(db, RUNS, runRef.id, ITEMS, entry.primaryId), {
          rowNo: entry.rowNo,
          name: entry.name,
          oldReg: entry.currentReg,
          newReg: entry.newReg,
          ops,
          undone: false,
        });
      }
      await batch.commit();
      result.studentsApplied += group.length;
      result.recordsWritten += group.reduce((n, p) => n + p.ops.length, 0);
      onProgress?.(result.studentsApplied, plans.length);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'A batch failed to save.';
  }

  try {
    await updateDoc(runRef, {
      status: result.error ? 'partial' : 'done',
      studentsApplied: result.studentsApplied,
      recordsWritten: result.recordsWritten,
      finishedAt: new Date().toISOString(),
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (err) {
    // The students above are saved either way; don't let this hide that result.
    result.error ??= err instanceof Error ? err.message : 'Could not save the run status.';
  }
  return result;
}

// ─── Undo ────────────────────────────────────────────────────────────────────

export interface BoardRun {
  id: string;
  createdAt: string;
  createdBy: string;
  fileName: string;
  status: 'running' | 'done' | 'partial' | 'undone' | 'partly-undone';
  studentsPlanned: number;
  studentsApplied: number;
  recordsWritten: number;
  undoneAt?: string;
  error?: string;
}

export async function listBoardRuns(): Promise<BoardRun[]> {
  const snap = await getDocsFromServer(query(collection(db, RUNS), orderBy('createdAt', 'desc'), limitDocs(20)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BoardRun));
}

export interface UndoResult {
  studentsRestored: number;
  /** Values changed by someone after the run, so they were left as they are. */
  conflicts: string[];
  error?: string;
}

interface RunItem { name: string; oldReg: string; newReg: string; ops: WriteOp[]; undone?: boolean }

function isEqualValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Restores one student's item. Returns conflict messages; commits atomically. */
async function undoItem(runId: string, itemId: string, item: RunItem): Promise<string[]> {
  const conflicts: string[] = [];
  const batch = writeBatch(db);

  for (const op of [...item.ops].reverse()) {
    const where = `${item.name}, ${COLLECTION_LABEL[op.col] ?? op.col}`;
    if (op.kind === 'update') {
      const snap = await getDocFromServer(doc(db, op.col, op.id));
      if (!snap.exists()) {
        conflicts.push(`${where}: record no longer exists`);
        continue;
      }
      const current = snap.data();
      const restore: Record<string, unknown> = {};
      for (const [field, written] of Object.entries(op.after)) {
        if (!isEqualValue(current[field], written)) {
          // updatedAt moves on any later edit, which isn't a conflict worth reporting.
          if (field !== 'updatedAt') conflicts.push(`${where}: ${field} is now "${String(current[field] ?? '')}", left as is`);
          continue;
        }
        restore[field] = op.absent.includes(field) ? deleteField() : op.before[field];
      }
      if (Object.keys(restore).length > 0) batch.update(snap.ref, restore);
    } else if (op.kind === 'move') {
      const toRef = doc(db, op.col, op.toId);
      const toSnap = await getDocFromServer(toRef);
      // Keep anything the student's app added to the moved doc since the run.
      const restored: DocumentData = toSnap.exists() ? { ...toSnap.data() } : { ...op.oldData };
      if ('regNumber' in op.oldData) restored.regNumber = op.oldData.regNumber;
      batch.set(doc(db, op.col, op.fromId), restored);
      if (toSnap.exists()) batch.delete(toRef);
    } else if (op.kind === 'remove') {
      batch.set(doc(db, op.col, op.id), op.oldData);
    } else {
      const ref = doc(db, op.col, op.id);
      batch.update(ref, { targetRegNumbers: arrayRemove(op.to) });
      batch.update(ref, { targetRegNumbers: arrayUnion(op.from) });
    }
  }

  batch.update(doc(db, RUNS, runId, ITEMS, itemId), { undone: true, undoConflicts: conflicts });
  await batch.commit();
  return conflicts;
}

export async function undoBoardRun(
  runId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<UndoResult> {
  if (!navigator.onLine) throw new Error('You appear to be offline. Connect to the internet before undoing.');

  const snap = await getDocsFromServer(collection(db, RUNS, runId, ITEMS));
  const items = snap.docs.filter((d) => !(d.data() as RunItem).undone);
  const result: UndoResult = { studentsRestored: 0, conflicts: [] };

  try {
    for (const d of items) {
      const conflicts = await undoItem(runId, d.id, d.data() as RunItem);
      result.conflicts.push(...conflicts);
      result.studentsRestored++;
      onProgress?.(result.studentsRestored, items.length);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Undo stopped before finishing.';
  }

  try {
    await updateDoc(doc(db, RUNS, runId), {
      status: result.error ? 'partly-undone' : 'undone',
      ...(result.error ? {} : { undoneAt: new Date().toISOString() }),
    });
  } catch (err) {
    result.error ??= err instanceof Error ? err.message : 'Could not save the run status.';
  }
  return result;
}
