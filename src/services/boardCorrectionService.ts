import {
  arrayRemove, arrayUnion, collection, deleteField, doc, getDocFromServer, getDocsFromServer,
  orderBy, query, setDoc, updateDoc, writeBatch, limit as limitDocs,
  type DocumentData, type WriteBatch,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { loadXlsx } from '../utils/lazyLibs';
import { isValidDob, normName } from './dataHealthService';

// Settings › Import › Board Corrections.
//
// Replaces temporary Reg Nos with Board-allotted ones and applies corrected student
// details from the Board workbook. regNumber is the student-portal identity and the
// link between a student's year records, so a change must reach every copy and join.
//
//  • parseBoardWorkbook / scanBoardCorrections are read-only and read from the server.
//  • applyBoardCorrections re-scans first, then writes one student at a time: all of a
//    student's writes and their undo data sit in one atomic batch.
//  • Never written: fee amounts, receipt numbers, category, marks, mobiles, issued
//    certificate history, merit list snapshots, counters. No studentNotifications are
//    created, because each one would send a push.

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

/** Person fields this tool may write: Excel column → students field. */
const WRITABLE_FIELDS = [
  { col: 'Name (SSLC)', field: 'studentNameSSLC', sensitive: true },
  { col: 'Name (Aadhar)', field: 'studentNameAadhar', sensitive: true },
  { col: 'Father Name', field: 'fatherName', sensitive: true },
  { col: 'Mother Name', field: 'motherName', sensitive: true },
  { col: 'Date of Birth', field: 'dateOfBirth', sensitive: true },
  { col: 'Gender', field: 'gender', sensitive: true },
  { col: 'Caste', field: 'caste', sensitive: false },
  { col: 'Address', field: 'address', sensitive: false },
  { col: 'Town', field: 'town', sensitive: false },
  { col: 'Taluk', field: 'taluk', sensitive: false },
  { col: 'District', field: 'district', sensitive: false },
] as const;

/** Compared and reported, never written. */
const COMPARE_TEXT: { col: string; field: string }[] = [
  { col: 'Category', field: 'category' },
  { col: 'Religion', field: 'religion' },
  { col: 'Adm Type', field: 'admType' },
  { col: 'Adm Cat', field: 'admCat' },
  { col: 'Student Mobile', field: 'studentMobile' },
  { col: 'Father Mobile', field: 'fatherMobile' },
  { col: 'Merit No', field: 'meritNumber' },
  { col: 'Enrollment Date', field: 'enrollmentDate' },
  { col: 'Admission Status', field: 'admissionStatus' },
];
const COMPARE_NUMBER: { col: string; field: string }[] = [
  { col: 'SSLC Max', field: 'sslcMaxTotal' },
  { col: 'SSLC Obtained', field: 'sslcObtainedTotal' },
  { col: 'Maths Max', field: 'mathsMax' },
  { col: 'Maths Obtained', field: 'mathsObtained' },
  { col: 'Science Max', field: 'scienceMax' },
  { col: 'Science Obtained', field: 'scienceObtained' },
  { col: 'M+S Max', field: 'mathsScienceMaxTotal' },
  { col: 'M+S Obtained', field: 'mathsScienceObtainedTotal' },
  { col: 'PUC %', field: 'pucPercentage' },
  { col: 'ITI %', field: 'itiPercentage' },
  { col: 'Annual Income', field: 'annualIncome' },
];

const REQUIRED_COLUMNS = ['#', 'Name (SSLC)', 'Reg No', 'Temp Reg No', 'Course', 'Year', 'Academic Year'];
const BOARD_REG_RE = /^\d{3}[A-Z]{2}\d{5}$/;
const PLACEHOLDER_REG_RE = /^\d{3}[A-Z]{2}$/;
const VALID_GENDERS = ['BOY', 'GIRL'];

/** Trim and collapse runs of whitespace. */
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const regKey = (v: unknown) => clean(v).toUpperCase();
/** "308CE" style placeholders are shared by many students and never identify one. */
const isIdentifyingReg = (reg: string) => !!reg && !PLACEHOLDER_REG_RE.test(reg);

export interface BoardRow {
  rowNo: string;
  values: Record<string, string>;
}

/** A field can be logged more than once (a spaces fix and a Board correction), in either order. */
interface LogEntry { oldValues: Set<string>; newValues: Set<string> }

export interface ToVerifyRow {
  regNo: string;
  name: string;
  issue: string;
  current: string;
  board: string;
  action: string;
}

export interface BoardWorkbook {
  fileName: string;
  rows: BoardRow[];
  /** `${rowNo}|${column}` → logged change. The log's Reg No can be the old one, so # is the join key. */
  log: Map<string, LogEntry>;
  hasChangeLog: boolean;
  /** Temporary Reg No → Board Reg No, from the Reg No Mapping sheet. */
  mapping: Map<string, string>;
  hasMapping: boolean;
  toVerify: ToVerifyRow[];
}

/** The Change Log wraps values that have stray spaces in single quotes. */
const unquote = (v: string) => clean(v.replace(/^'/, '').replace(/'$/, ''));

export async function parseBoardWorkbook(data: ArrayBuffer, fileName: string): Promise<BoardWorkbook> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(data, { type: 'array' });

  // raw:false keeps every cell as its displayed text (leading zeros survive). A real
  // Excel date in the DOB column comes out in another format and fails validation.
  const sheet = (name: string) => {
    const ws = wb.Sheets[name];
    return ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false }) : null;
  };

  const students = sheet('Students');
  if (!students) throw new Error('This workbook has no "Students" sheet.');
  if (students.length === 0) throw new Error('The "Students" sheet is empty.');
  const missing = REQUIRED_COLUMNS.filter((c) => !(c in students[0]));
  if (missing.length > 0) throw new Error(`The "Students" sheet is missing column(s): ${missing.join(', ')}`);

  const rows: BoardRow[] = students.map((r) => {
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) values[k.trim()] = clean(v);
    values['Reg No'] = values['Reg No'].toUpperCase();
    values['Temp Reg No'] = values['Temp Reg No'].toUpperCase();
    return { rowNo: values['#'], values };
  });

  const logRows = sheet('Change Log');
  const log = new Map<string, LogEntry>();
  for (const r of logRows ?? []) {
    const key = `${clean(r['#'])}|${clean(r['Field'])}`;
    const entry = log.get(key) ?? { oldValues: new Set<string>(), newValues: new Set<string>() };
    entry.oldValues.add(unquote(String(r['Old Value'] ?? '')));
    entry.newValues.add(clean(r['New Value']));
    log.set(key, entry);
  }

  const mapRows = sheet('Reg No Mapping');
  const mapping = new Map<string, string>();
  for (const r of mapRows ?? []) {
    const temp = regKey(r['Temporary Reg No']);
    if (temp) mapping.set(temp, regKey(r['Board Reg No']));
  }

  const toVerify: ToVerifyRow[] = (sheet('To Verify') ?? []).map((r) => ({
    regNo: regKey(r['Reg No']),
    name: clean(r['Name']),
    issue: clean(r['Issue']),
    current: clean(r['Current Value (kept)']),
    board: clean(r['Board Value']),
    action: clean(r['Action']),
  }));

  return { fileName, rows, log, hasChangeLog: !!logRows, mapping, hasMapping: !!mapRows, toVerify };
}

// ─── Scan ────────────────────────────────────────────────────────────────────

export type ChangeGroup = 'regno' | 'cleanup' | 'confirm' | 'unexpected';

export interface ChangeCell {
  /** Stable selection key: `${rowNo}|${field}`. */
  key: string;
  field: string;
  label: string;
  before: string;
  after: string;
  group: ChangeGroup;
  note?: string;
}

export interface BoardEntry {
  rowNo: string;
  name: string;
  course: string;
  year: string;
  newReg: string;
  tempReg: string;
  currentReg: string;
  primaryId: string;
  /** Every academic-year doc of this student, including the primary. */
  docIds: string[];
  cells: ChangeCell[];
  blockers: string[];
  /** Records still filed under the temporary number, by collection. */
  leftovers: Record<string, number>;
}

export interface CompareDiff { rowNo: string; name: string; regNo: string; label: string; record: string; excel: string }
export interface ReportRow { name: string; regNo: string; detail: string }

type RawDoc = { id: string; data: DocumentData };

/** Everything the scan read from the server, so a run's writes are built from it. */
export interface ScanData {
  students: RawDoc[];
  linked: Record<LinkedCollection, RawDoc[]>;
}

export interface BoardScan {
  scannedAt: string;
  entries: BoardEntry[];
  /** Rows that can't be matched at all, plus entries with blockers. */
  blocked: ReportRow[];
  compareDiffs: CompareDiff[];
  notInFile: ReportRow[];
  certificatesIssued: ReportRow[];
  possibleOtherRecords: ReportRow[];
  nonStandardRegs: ReportRow[];
  blankDob: ReportRow[];
  stillTemporary: number;
  leftoverTotals: Record<string, number>;
  data: ScanData;
}

export type ScanStage = 'students' | 'linked' | 'analysing';

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

/** How many records are still filed under a temporary number. */
function countLeftovers(data: ScanData, tempReg: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!tempReg) return out;
  const add = (col: string, n: number) => { if (n > 0) out[col] = (out[col] ?? 0) + n; };

  add('feeRecords', data.linked.feeRecords.filter((d) => regKey(d.data.regNumber) === tempReg).length);
  add('refunds', data.linked.refunds.filter((d) => regKey(d.data.regNumber) === tempReg).length);
  add('studentFiles', data.linked.studentFiles.filter((d) => regKey(d.data.ownerKey) === tempReg || regKey(d.data.regNumber) === tempReg).length);
  add('studentMessages', data.linked.studentMessages.filter((d) => regKey(d.data.regNumber) === tempReg).length);
  add('studentNotifications', data.linked.studentNotifications.filter((d) => regKey(d.data.regNumber) === tempReg).length);
  add('examResults', data.linked.examResults.filter((d) => regKey(d.data.regNumber) === tempReg).length);
  add('notices', data.linked.notices.filter((d) => noticeTargets(d, tempReg)).length);
  for (const col of STATE_COLLECTIONS) add(col, data.linked[col].filter((d) => d.id === tempReg).length);
  return out;
}

function noticeTargets(d: RawDoc, reg: string): boolean {
  if (d.data.scope === 'regNumber' && regKey(d.data.scopeValue) === reg) return true;
  const targets = d.data.targetRegNumbers;
  return Array.isArray(targets) && targets.some((t) => regKey(t) === reg);
}

function historyLength(d: RawDoc, field: string): number {
  const v = d.data[field];
  return Array.isArray(v) ? v.length : 0;
}

/** Classifies one person-field difference. Live data decides; the log only explains it. */
function classifyCell(
  wb: BoardWorkbook,
  rowNo: string,
  spec: (typeof WRITABLE_FIELDS)[number],
  before: string,
  after: string,
): { group: ChangeGroup; note?: string } {
  // Only spaces differ: nothing a reader would see changes.
  if (clean(before) === after) return { group: 'cleanup', note: 'Extra spaces removed' };

  if (!wb.hasChangeLog) return { group: 'unexpected', note: 'No Change Log sheet to confirm this change' };
  const logged = wb.log.get(`${rowNo}|${spec.col}`);
  if (!logged) return { group: 'unexpected', note: 'Not in the Change Log: the record or the file changed after export' };
  if (!logged.newValues.has(after)) {
    return { group: 'unexpected', note: `Change Log expected "${[...logged.newValues].join('" or "')}"` };
  }
  if (!logged.oldValues.has(clean(before))) {
    return { group: 'unexpected', note: `Change Log expected the record to hold "${[...logged.oldValues].join('" or "')}"` };
  }
  return { group: spec.sensitive ? 'confirm' : 'cleanup' };
}

function sameNumber(a: unknown, b: string): boolean {
  const x = Number(String(a ?? '').replace(/[%,\s]/g, '')) || 0;
  const y = Number(b.replace(/[%,\s]/g, '')) || 0;
  return Math.abs(x - y) < 0.01;
}

export function analyseBoardWorkbook(wb: BoardWorkbook, data: ScanData): BoardScan {
  const entries: BoardEntry[] = [];
  const blocked: ReportRow[] = [];
  const compareDiffs: CompareDiff[] = [];
  const certificatesIssued: ReportRow[] = [];
  const possibleOtherRecords: ReportRow[] = [];
  const nonStandardRegs: ReportRow[] = [];
  const blankDob: ReportRow[] = [];
  const leftoverTotals: Record<string, number> = {};
  let stillTemporary = 0;

  const byReg = new Map<string, RawDoc[]>();
  for (const d of data.students) {
    const reg = regKey(d.data.regNumber);
    if (!isIdentifyingReg(reg)) continue;
    const list = byReg.get(reg);
    if (list) list.push(d); else byReg.set(reg, [d]);
  }

  const countOf = (column: string) => {
    const m = new Map<string, number>();
    for (const r of wb.rows) {
      const v = r.values[column];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  };
  const regCounts = countOf('Reg No');
  const tempCounts = countOf('Temp Reg No');
  const mappedTemps = new Set<string>();
  const matchedIds = new Set<string>();

  for (const row of wb.rows) {
    const v = row.values;
    const name = v['Name (SSLC)'];
    const newReg = v['Reg No'];
    const tempReg = v['Temp Reg No'];
    const blockers: string[] = [];

    // ── File checks ──
    if (!BOARD_REG_RE.test(newReg)) blockers.push(`Reg No "${newReg}" is not in Board format`);
    else if (newReg.slice(3, 5) !== v['Course']) blockers.push(`Reg No "${newReg}" doesn't match course ${v['Course']}`);
    if ((regCounts.get(newReg) ?? 0) > 1) blockers.push(`Reg No "${newReg}" appears more than once in the file`);
    if (tempReg && (tempCounts.get(tempReg) ?? 0) > 1) blockers.push(`Temp Reg No "${tempReg}" appears more than once in the file`);
    if (v['Date of Birth'] && !isValidDob(v['Date of Birth'])) blockers.push(`Date of Birth "${v['Date of Birth']}" is not a valid DD/MM/YYYY date`);
    if (v['Gender'] && !VALID_GENDERS.includes(v['Gender'])) blockers.push(`Gender "${v['Gender']}" is not BOY or GIRL`);
    if (tempReg && wb.hasMapping) {
      const mapped = wb.mapping.get(tempReg);
      if (mapped) mappedTemps.add(tempReg);
      if (!mapped) blockers.push(`Temp Reg No "${tempReg}" is not on the Reg No Mapping sheet`);
      else if (mapped !== newReg) blockers.push(`Mapping sheet says ${tempReg} → ${mapped}, Students sheet says ${newReg}`);
    }

    // ── Find this year's record: under the new number (already applied) or the old one ──
    const onNew = byReg.get(newReg) ?? [];
    const onTemp = tempReg ? byReg.get(tempReg) ?? [] : [];
    const inYear = (d: RawDoc) => d.data.academicYear === v['Academic Year'];
    const candidates = [...onNew.filter(inYear), ...onTemp.filter(inYear)];

    if (candidates.length === 0) {
      blocked.push({
        name,
        regNo: tempReg || newReg,
        detail: [`No ${v['Academic Year']} record found with Reg No ${[tempReg, newReg].filter(Boolean).join(' or ')}`, ...blockers].join('; '),
      });
      continue;
    }
    if (candidates.length > 1) {
      blocked.push({
        name,
        regNo: tempReg || newReg,
        detail: [`${candidates.length} ${v['Academic Year']} records hold this number: ${candidates.map((c) => regKey(c.data.regNumber)).join(', ')}`, ...blockers].join('; '),
      });
      for (const c of candidates) matchedIds.add(c.id);
      continue;
    }

    const primary = candidates[0];
    matchedIds.add(primary.id);
    const currentReg = regKey(primary.data.regNumber);
    const needsNewReg = !!tempReg && currentReg === tempReg;

    // The new number already on another student, before this one has it.
    if (needsNewReg && onNew.length > 0) {
      const holder = onNew[0].data;
      blockers.push(`Reg No ${newReg} already belongs to ${clean(holder.studentNameSSLC)} (${holder.academicYear})`);
    }

    // ── Same-person checks ──
    const logOldNames = wb.log.get(`${row.rowNo}|Name (SSLC)`)?.oldValues ?? new Set<string>();
    const wanted = normName(name);
    const recordName = normName(primary.data.studentNameSSLC);
    const nameOk = recordName === wanted
      || normName(primary.data.studentNameAadhar) === wanted
      || [...logOldNames].some((old) => normName(old) === recordName);
    if (!nameOk) blockers.push(`Name "${name}" doesn't match the record's "${clean(primary.data.studentNameSSLC)}"`);
    if (primary.data.course !== v['Course']) blockers.push(`Course is ${primary.data.course} on the record, ${v['Course']} in the file`);
    if (primary.data.year !== v['Year']) blockers.push(`Year is ${primary.data.year} on the record, ${v['Year']} in the file`);

    // ── All of this student's year records ──
    const group = new Map<string, RawDoc>();
    for (const d of [primary, ...onTemp, ...(needsNewReg ? [] : onNew)]) group.set(d.id, d);
    const docs = [...group.values()];

    // ── Person-field differences ──
    const cells: ChangeCell[] = [];
    const leftovers = countLeftovers(data, tempReg);
    const leftoverCount = Object.values(leftovers).reduce((a, b) => a + b, 0)
      + docs.filter((d) => regKey(d.data.regNumber) === tempReg).length - (needsNewReg ? 1 : 0);

    if (needsNewReg || (tempReg && leftoverCount > 0)) {
      cells.push({
        key: `${row.rowNo}|regNumber`,
        field: 'regNumber',
        label: 'Reg No',
        before: tempReg,
        after: newReg,
        group: 'regno',
        ...(needsNewReg ? {} : { note: `Student already moved; ${leftoverCount} record(s) still under the old number` }),
      });
    }

    for (const spec of WRITABLE_FIELDS) {
      const after = v[spec.col];
      if (!after) continue; // A blank Excel cell never overwrites data.
      const differing = docs.filter((d) => String(d.data[spec.field] ?? '') !== after);
      if (differing.length === 0) continue;

      const primaryValue = String(primary.data[spec.field] ?? '');
      if (primaryValue !== after) {
        cells.push({
          key: `${row.rowNo}|${spec.field}`,
          field: spec.field,
          label: spec.col,
          before: primaryValue,
          after,
          ...classifyCell(wb, row.rowNo, spec, primaryValue, after),
        });
      } else {
        // This year is right but an older record disagrees.
        const other = differing[0];
        const before = String(other.data[spec.field] ?? '');
        cells.push({
          key: `${row.rowNo}|${spec.field}`,
          field: spec.field,
          label: spec.col,
          before,
          after,
          ...(clean(before) === after
            ? { group: 'cleanup' as const, note: `${other.data.academicYear} record: extra spaces removed` }
            : { group: 'unexpected' as const, note: `Only the ${other.data.academicYear} record differs` }),
        });
      }
    }

    entries.push({
      rowNo: row.rowNo,
      name,
      course: v['Course'],
      year: v['Year'],
      newReg,
      tempReg,
      currentReg,
      primaryId: primary.id,
      docIds: docs.map((d) => d.id),
      cells,
      blockers,
      leftovers,
    });

    if (blockers.length > 0) blocked.push({ name, regNo: tempReg || newReg, detail: blockers.join('; ') });

    // ── Reports (never written) ──
    if (needsNewReg) stillTemporary++;
    for (const [col, n] of Object.entries(leftovers)) leftoverTotals[col] = (leftoverTotals[col] ?? 0) + n;

    for (const spec of COMPARE_TEXT) {
      const record = clean(primary.data[spec.field]);
      const excel = v[spec.col] ?? '';
      if (excel && record !== excel) compareDiffs.push({ rowNo: row.rowNo, name, regNo: newReg, label: spec.col, record, excel });
    }
    for (const spec of COMPARE_NUMBER) {
      const excel = v[spec.col] ?? '';
      if (excel && !sameNumber(primary.data[spec.field], excel)) {
        compareDiffs.push({ rowNo: row.rowNo, name, regNo: newReg, label: spec.col, record: clean(primary.data[spec.field]), excel });
      }
    }

    const identityChanges = cells.some((c) => c.field === 'regNumber' || c.field === 'studentNameSSLC' || c.field === 'fatherName');
    if (identityChanges) {
      const tc = docs.reduce((n, d) => n + historyLength(d, 'tcHistory'), 0);
      const pc = docs.reduce((n, d) => n + historyLength(d, 'pcHistory'), 0);
      if (tc + pc > 0) {
        certificatesIssued.push({ name, regNo: newReg, detail: `${tc} TC, ${pc} PC already issued with the old details. Check whether they need reissuing.` });
      }
    }

    if (!BOARD_REG_RE.test(newReg) || !newReg.startsWith('308')) {
      nonStandardRegs.push({ name, regNo: newReg, detail: 'Not in 308 format. Left as it is; confirm whether this is a transfer from another institution.' });
    }
    if (!v['Date of Birth'] && !primary.data.dateOfBirth) {
      blankDob.push({ name, regNo: newReg, detail: 'No Date of Birth. This student cannot log in to the portal until it is entered.' });
    }

    const groupIds = new Set(docs.map((d) => d.id));
    const aadhar = clean(primary.data.aadharNumber).replace(/\s/g, '');
    const personKey = (d: DocumentData) => [normName(d.studentNameSSLC), normName(d.fatherName), clean(d.dateOfBirth)].join('|');
    const thisPerson = personKey(primary.data);
    for (const other of data.students) {
      if (groupIds.has(other.id)) continue;
      const sameAadhar = /^\d{12}$/.test(aadhar) && clean(other.data.aadharNumber).replace(/\s/g, '') === aadhar;
      const samePerson = !!clean(primary.data.dateOfBirth) && personKey(other.data) === thisPerson;
      if (sameAadhar || samePerson) {
        possibleOtherRecords.push({
          name,
          regNo: newReg,
          detail: `${sameAadhar ? 'Same Aadhaar' : 'Same name, father and DOB'} as ${clean(other.data.studentNameSSLC)}, ${other.data.academicYear}, Reg No ${regKey(other.data.regNumber) || 'blank'}`,
        });
      }
    }
  }

  // ── Mapping rows that no student row claims ──
  if (wb.hasMapping) {
    for (const [temp, board] of wb.mapping) {
      if (!mappedTemps.has(temp)) {
        blocked.push({ name: '(Reg No Mapping sheet)', regNo: temp, detail: `Mapped to ${board}, but no row on the Students sheet has this Temp Reg No` });
      }
    }
  }

  // ── Confirmed students this file doesn't mention ──
  const years = new Set(wb.rows.map((r) => r.values['Academic Year']));
  const notInFile: ReportRow[] = data.students
    .filter((d) => years.has(d.data.academicYear)
      && d.data.admissionStatus === 'CONFIRMED'
      && d.data.admType !== 'EXTERNAL'
      && !matchedIds.has(d.id))
    .map((d) => ({
      name: clean(d.data.studentNameSSLC),
      regNo: regKey(d.data.regNumber),
      detail: `${d.data.course} ${d.data.year}, confirmed in ${d.data.academicYear} but not in this file. Left unchanged.`,
    }));

  return {
    scannedAt: new Date().toISOString(),
    entries,
    blocked,
    compareDiffs,
    notInFile,
    certificatesIssued,
    possibleOtherRecords,
    nonStandardRegs,
    blankDob,
    stillTemporary,
    leftoverTotals,
    data,
  };
}

/** Read-only. Always reads from the server, because the app's offline cache could be stale. */
export async function scanBoardCorrections(wb: BoardWorkbook, onStage?: (s: ScanStage) => void): Promise<BoardScan> {
  onStage?.('students');
  const students = await readCollection('students');
  onStage?.('linked');
  const loaded = await Promise.all(LINKED_COLLECTIONS.map((c) => readCollection(c)));
  const linked = Object.fromEntries(LINKED_COLLECTIONS.map((c, i) => [c, loaded[i]])) as Record<LinkedCollection, RawDoc[]>;
  onStage?.('analysing');
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

/** Builds every write for one student from the cells the user approved. */
export function buildStudentOps(entry: BoardEntry, approved: ReadonlySet<string>, data: ScanData, now: string): WriteOp[] {
  const ops: WriteOp[] = [];
  const push = (op: WriteOp | null) => { if (op) ops.push(op); };

  const moveReg = approved.has(`${entry.rowNo}|regNumber`) && !!entry.tempReg;
  const person: Record<string, string> = {};
  for (const c of entry.cells) {
    if (c.field !== 'regNumber' && approved.has(c.key)) person[c.field] = c.after;
  }
  const { tempReg, newReg } = entry;

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
      // The student already has state under the new number, e.g. an old session wrote
      // here after the move. The newer doc wins.
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
    // If a result already exists under the new id it stays put: results are never
    // deleted here, and the post-run check keeps reporting the old doc.
  }

  return ops;
}

/** Per-collection count of records a set of approved cells would touch. */
export function countPlannedRecords(entry: BoardEntry, approved: ReadonlySet<string>, data: ScanData): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const op of buildStudentOps(entry, approved, data, '')) counts[op.col] = (counts[op.col] ?? 0) + 1;
  return counts;
}

export const defaultApproved = (c: ChangeCell) => c.group === 'regno' || c.group === 'cleanup';

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

export interface ApplySkip { name: string; regNo: string; reason: string }

export interface ApplyResult {
  runId: string;
  studentsApplied: number;
  recordsWritten: number;
  skipped: ApplySkip[];
  /** Set when a batch failed: later students were not attempted. */
  error?: string;
}

/** Same cells with the same values means the reviewed picture is still true. */
function cellFingerprint(entry: BoardEntry, approved: ReadonlySet<string>): string {
  return entry.cells
    .filter((c) => approved.has(c.key))
    .map((c) => `${c.key}=${c.before}=>${c.after}`)
    .sort()
    .join('\n');
}

export async function applyBoardCorrections(
  wb: BoardWorkbook,
  reviewed: BoardScan,
  approved: ReadonlySet<string>,
  rowNos: ReadonlySet<string>,
  kind: 'pilot' | 'full',
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyResult> {
  if (!navigator.onLine) throw new Error('You appear to be offline. Connect to the internet before applying.');

  // Re-check on the server: this also fails loudly when the connection is really down,
  // where a batch commit would otherwise queue silently in the offline cache.
  const fresh = await scanBoardCorrections(wb);
  const reviewedByRow = new Map(reviewed.entries.map((e) => [e.rowNo, e]));
  const skipped: ApplySkip[] = [];
  const plans: { entry: BoardEntry; ops: WriteOp[] }[] = [];
  const now = new Date().toISOString();

  for (const entry of fresh.entries) {
    if (!rowNos.has(entry.rowNo)) continue;
    const label = { name: entry.name, regNo: entry.tempReg || entry.newReg };
    if (entry.blockers.length > 0) {
      skipped.push({ ...label, reason: entry.blockers.join('; ') });
      continue;
    }
    const before = reviewedByRow.get(entry.rowNo);
    if (!before || cellFingerprint(before, approved) !== cellFingerprint(entry, approved)) {
      skipped.push({ ...label, reason: 'This record changed since your review. Scan again and re-check it.' });
      continue;
    }
    const ops = buildStudentOps(entry, approved, fresh.data, now);
    if (ops.length > 0) plans.push({ entry, ops });
  }

  const runRef = doc(collection(db, RUNS));
  const result: ApplyResult = { runId: runRef.id, studentsApplied: 0, recordsWritten: 0, skipped };
  if (plans.length === 0) return result;

  await setDoc(runRef, {
    createdAt: now,
    createdBy: auth.currentUser?.email ?? '',
    fileName: wb.fileName,
    kind,
    status: 'running',
    studentsPlanned: plans.length,
    studentsApplied: 0,
    recordsWritten: 0,
  });

  // Fill batches without ever splitting a student.
  const batches: { entry: BoardEntry; ops: WriteOp[] }[][] = [];
  let current: { entry: BoardEntry; ops: WriteOp[] }[] = [];
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
          oldReg: entry.tempReg,
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
  kind: 'pilot' | 'full';
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

// ─── Before-state download ───────────────────────────────────────────────────

/** Downloads the before-state of everything this file could touch, as JSON + Excel. */
export async function downloadBeforeState(wb: BoardWorkbook, scan: BoardScan, approved: ReadonlySet<string>): Promise<void> {
  const stamp = scan.scannedAt.slice(0, 19).replace(/[:T]/g, '-');
  const entries = scan.entries.filter((e) => e.blockers.length === 0);
  const studentIds = new Set(entries.flatMap((e) => e.docIds));

  const linked: Record<string, RawDoc[]> = {};
  for (const col of LINKED_COLLECTIONS) {
    const seen = new Map<string, RawDoc>();
    for (const e of entries) {
      for (const d of linkedDocs(col, scan.data, [e.tempReg, e.newReg], e.docIds)) seen.set(d.id, d);
      if (col === 'notices' && e.tempReg) {
        for (const d of scan.data.linked.notices) if (noticeTargets(d, e.tempReg)) seen.set(d.id, d);
      }
      if ((STATE_COLLECTIONS as readonly string[]).includes(col)) {
        for (const d of scan.data.linked[col]) if (d.id === e.tempReg || d.id === e.newReg) seen.set(d.id, d);
      }
    }
    linked[col] = [...seen.values()];
  }

  const json = JSON.stringify({
    takenAt: scan.scannedAt,
    fileName: wb.fileName,
    students: scan.data.students.filter((d) => studentIds.has(d.id)),
    linked,
  }, null, 1);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `Board_Corrections_Before_${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const XLSX = await loadXlsx();
  const book = XLSX.utils.book_new();
  const sheets: [string, object[]][] = [
    ['Changes', scan.entries.flatMap((e) => e.cells.map((c) => ({
      'Row #': e.rowNo,
      Student: e.name,
      'Reg No': e.newReg,
      'Temp Reg No': e.tempReg,
      Field: c.label,
      Before: c.before,
      After: c.after,
      Group: GROUP_LABEL[c.group],
      Approved: approved.has(c.key) ? 'Yes' : 'No',
      Note: c.note ?? '',
    })))],
    ['Blocked', scan.blocked.map((r) => ({ Student: r.name, 'Reg No': r.regNo, Problem: r.detail }))],
    ['Compare Only', scan.compareDiffs.map((d) => ({
      'Row #': d.rowNo, Student: d.name, 'Reg No': d.regNo, Field: d.label, Record: d.record, Excel: d.excel,
    }))],
  ];
  for (const [name, rows] of sheets) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Result: 'None' }]), name);
  }
  XLSX.writeFile(book, `Board_Corrections_Before_${stamp}.xlsx`);
}

export const GROUP_LABEL: Record<ChangeGroup, string> = {
  regno: 'Reg No',
  cleanup: 'Clean-up',
  confirm: 'Needs confirmation',
  unexpected: 'Unexpected',
};
