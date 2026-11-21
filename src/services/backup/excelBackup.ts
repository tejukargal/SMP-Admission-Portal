import type ExcelJS from 'exceljs';
import { SMP_FEE_HEADS, type Student } from '../../types';
import { STUDENT_COLUMNS, formatColumnValue } from '../../utils/studentColumns';
import { BACKUP_COLLECTIONS, getSpec } from './registry';
import { isTaggedTimestamp } from './codec';
import type { BackupDoc, BackupFileV2 } from './exportBackup';

// A human-readable, all-year workbook built from the same in-memory backup.
// For reading, printing and safekeeping — restore always uses the JSON.

type Cell = string | number | boolean | null;
type Row = Cell[];

const MAX_CELL = 32_000; // Excel's hard limit is 32,767 characters

/** Never written to the spreadsheet: secrets in plain text are a liability. */
const EXCLUDED = new Set(['adminConfig']);

function cellValue(v: unknown): Cell {
  if (v === null || v === undefined || v === '') return null;
  if (isTaggedTimestamp(v)) return new Date(v.seconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length > MAX_CELL ? `${v.slice(0, MAX_CELL)}…` : v;
  if (Array.isArray(v) && v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))) {
    return cellValue(v.join(', '));
  }
  return cellValue(JSON.stringify(v));
}

/** Flattens nested maps to dotted keys (two levels); arrays stay as one cell. */
function flatten(obj: Record<string, unknown>, prefix = '', depth = 0, out: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !isTaggedTimestamp(v) && depth < 2) {
      flatten(v as Record<string, unknown>, key, depth + 1, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

function titleCase(key: string): string {
  return key
    .split('.')
    .map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()))
    .join(' › ');
}

const LEADING_KEYS = ['academicYear', 'id'];

function genericSheet(docs: BackupDoc[]): { header: string[]; rows: Row[] } {
  const flat = docs.map((d) => flatten(d));
  const keys = new Set<string>();
  for (const f of flat) for (const k of Object.keys(f)) keys.add(k);
  const ordered = [
    ...LEADING_KEYS.filter((k) => keys.has(k)),
    ...[...keys].filter((k) => !LEADING_KEYS.includes(k)).sort(),
  ];
  return {
    header: ordered.map((k) => (k === 'id' ? 'Doc ID' : titleCase(k))),
    rows: flat.map((f) => ordered.map((k) => cellValue(f[k]))),
  };
}

// ── Hand-laid sheets ─────────────────────────────────────────────────────────

const STUDENT_FIELDS = STUDENT_COLUMNS.filter((c) => c.key !== 'slNo' && c.key !== 'mobile' && c.key !== 'academicYear');

function byYearCourse(a: BackupDoc, b: BackupDoc): number {
  return String(a.academicYear ?? '').localeCompare(String(b.academicYear ?? ''))
    || String(a.course ?? '').localeCompare(String(b.course ?? ''))
    || String(a.year ?? '').localeCompare(String(b.year ?? ''))
    || String(a.regNumber ?? '').localeCompare(String(b.regNumber ?? ''));
}

function studentsSheet(docs: BackupDoc[]) {
  const header = [
    'Academic Year', ...STUDENT_FIELDS.map((c) => c.label),
    'Previous Reg No', 'Discontinued', 'Discontinued Date', 'Transfer Out Date',
    'TCs Issued', 'Latest TC No', 'PCs Issued', 'Doc ID',
  ];
  const rows = [...docs].sort(byYearCourse).map((d) => {
    const s = d as unknown as Student & Record<string, unknown>;
    const tc = (d.tcHistory as { tcNumber?: string }[] | undefined) ?? [];
    const pc = (d.pcHistory as unknown[] | undefined) ?? [];
    return [
      cellValue(d.academicYear),
      ...STUDENT_FIELDS.map((c) => {
        const v = formatColumnValue(c, s);
        return v === '—' ? null : v;
      }),
      cellValue(d.previousRegNumber), d.discontinued ? 'Yes' : null, cellValue(d.discontinuedDate),
      cellValue(d.transferOutDate), tc.length || null, cellValue(tc[tc.length - 1]?.tcNumber),
      pc.length || null, d.id,
    ];
  });
  return { header, rows };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function feeRecordsSheet(docs: BackupDoc[]) {
  const header = [
    'Academic Year', 'Date', 'Reg No', 'Name', 'Father Name', 'Course', 'Year', 'Adm Type', 'Adm Cat',
    'SMP Rpt', 'SVK Rpt', 'Addl Rpt', 'SMP Mode', 'SVK Mode', 'Addl Mode',
    ...SMP_FEE_HEADS.map((h) => h.label), 'SMP Total', 'SVK', 'Additional Heads', 'Additional Total',
    'Grand Total', 'Due Payment', 'Remarks', 'Doc ID',
  ];
  const sorted = [...docs].sort((a, b) =>
    String(a.academicYear ?? '').localeCompare(String(b.academicYear ?? ''))
    || String(a.date ?? '').localeCompare(String(b.date ?? '')));
  const rows = sorted.map((d) => {
    const smp = (d.smp as Record<string, unknown> | undefined) ?? {};
    const smpVals = SMP_FEE_HEADS.map((h) => num(smp[h.key]));
    const smpTotal = smpVals.reduce((a, b) => a + b, 0);
    const addl = (d.additionalPaid as { label?: string; amount?: number }[] | undefined) ?? [];
    const addlTotal = addl.reduce((a, h) => a + num(h.amount), 0);
    const svk = num(d.svk);
    return [
      cellValue(d.academicYear), cellValue(String(d.date ?? '').slice(0, 10)), cellValue(d.regNumber),
      cellValue(d.studentName), cellValue(d.fatherName), cellValue(d.course), cellValue(d.year),
      cellValue(d.admType), cellValue(d.admCat),
      cellValue(d.receiptNumber), cellValue(d.svkReceiptNumber), cellValue(d.additionalReceiptNumber),
      cellValue(d.smpPaymentMode ?? d.paymentMode), cellValue(d.svkPaymentMode), cellValue(d.additionalPaymentMode),
      ...smpVals.map((v) => v || null), smpTotal || null, svk || null,
      cellValue(addl.map((h) => `${h.label ?? ''}: ${num(h.amount)}`).join('; ')), addlTotal || null,
      smpTotal + svk + addlTotal, d.isDueFee ? 'Yes' : null, cellValue(d.remarks), d.id,
    ];
  });
  return { header, rows };
}

const CERT_HISTORIES: { field: string; type: string }[] = [
  { field: 'tcHistory', type: 'Transfer Certificate' },
  { field: 'tcEditHistory', type: 'TC Edit' },
  { field: 'pcHistory', type: 'Provisional Certificate' },
  { field: 'ansHistory', type: 'ANS Intimation Letter' },
  { field: 'seatCancelLetterHistory', type: 'Seat Cancellation Letter' },
];

function certificatesSheet(students: BackupDoc[]) {
  const entries: { base: Row; detail: Record<string, unknown> }[] = [];
  for (const s of [...students].sort(byYearCourse)) {
    for (const { field, type } of CERT_HISTORIES) {
      for (const rec of (s[field] as Record<string, unknown>[] | undefined) ?? []) {
        entries.push({
          base: [type, cellValue(s.academicYear), cellValue(s.regNumber), cellValue(s.studentNameSSLC), cellValue(s.course), cellValue(s.year)],
          detail: flatten(rec),
        });
      }
    }
  }
  const keys = [...new Set(entries.flatMap((e) => Object.keys(e.detail)))].sort();
  return {
    header: ['Certificate', 'Academic Year', 'Reg No', 'Name', 'Course', 'Year', ...keys.map(titleCase)],
    rows: entries.map((e) => [...e.base, ...keys.map((k) => cellValue(e.detail[k]))]),
  };
}

// ── Summary ──────────────────────────────────────────────────────────────────

function docYear(d: BackupDoc): string {
  if (typeof d.academicYear === 'string' && d.academicYear) return d.academicYear;
  const m = /^(\d{4}-\d{2})/.exec(d.id);
  return m ? m[1] : '';
}

function summarySheet(backup: BackupFileV2) {
  const years = new Set<string>();
  for (const docs of Object.values(backup.collections)) for (const d of docs) { const y = docYear(d); if (y) years.add(y); }
  const yearList = [...years].sort();
  const header = ['Group', 'Collection', 'Contents', 'Total', ...yearList, 'No Year'];
  const rows: Row[] = BACKUP_COLLECTIONS.map((spec) => {
    const docs = backup.collections[spec.name] ?? [];
    const per = new Map<string, number>();
    for (const d of docs) { const y = docYear(d); per.set(y, (per.get(y) ?? 0) + 1); }
    return [spec.group, spec.name, spec.label, docs.length, ...yearList.map((y) => per.get(y) ?? null), per.get('') ?? null];
  });
  return { header, rows, yearList };
}

// ── Workbook ────────────────────────────────────────────────────────────────

function addTable(wb: ExcelJS.Workbook, name: string, header: string[], rows: Row[]) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5A8A' } };
  if (header.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
  header.forEach((h, i) => {
    let w = h.length;
    for (let r = 0; r < Math.min(rows.length, 300); r++) w = Math.max(w, String(rows[r][i] ?? '').length);
    ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 8), 50);
  });
  return ws;
}

const SHEET_ORDER: [string, string][] = [
  ['feeStructure', 'Fee Structure'], ['feeOverrides', 'Fee Overrides'], ['fineSchedules', 'Fine Schedules'],
  ['examFeeRecords', 'Exam Fees'], ['refunds', 'Refunds'], ['studentDocuments', 'Document Checklist'],
  ['studentFiles', 'Student Files'], ['inquiries', 'Inquiries'], ['meritListSnapshots', 'Merit Snapshots'],
  ['examDutyCertificates', 'Exam Duty Certs'], ['examSettingCertificates', 'Setting & Conducting'],
  ['examDutyStaff', 'Exam Duty Staff'], ['examSubjects', 'Exam Subjects'], ['examResults', 'Exam Results'],
  ['cashDeposits', 'Cash Deposits'], ['upiCredits', 'UPI Credits'], ['denominationAbstracts', 'Denominations'],
  ['feeRemittances', 'Remittances'], ['wpFeeRemittances', 'WP Remittances'], ['smpBudgets', 'SMP Budgets'],
  ['wpFeeDistribution', 'WP Distribution'], ['receiptCounters', 'Receipt Counters'], ['counters', 'Counters'],
  ['circulars', 'Circulars'], ['notices', 'Notices'], ['studentMessages', 'Student Messages'],
  ['studentNotifications', 'Notifications'], ['boardCorrectionRuns', 'Board Corrections'],
  ['users', 'Staff Users'], ['settings', 'Settings'],
];

export async function buildBackupWorkbook(backup: BackupFileV2): Promise<Uint8Array> {
  const { default: ExcelJSLib } = await import('exceljs');
  const wb = new ExcelJSLib.Workbook();
  wb.creator = 'SMP Admissions';
  wb.created = new Date(backup.exportedAt);

  // Summary
  const sum = summarySheet(backup);
  const ws = wb.addWorksheet('Summary');
  ws.addRow(['SMP Admissions — Data Backup']).font = { bold: true, size: 14 };
  ws.addRow(['Scope', backup.scope === 'full' ? 'All academic years' : `Academic year ${backup.academicYear}`]);
  ws.addRow(['Exported at', new Date(backup.exportedAt).toLocaleString('en-IN')]);
  ws.addRow(['Exported by', backup.exportedBy || '—']);
  ws.addRow(['Note', 'Read-only copy for viewing. Restore always uses the .json backup. Admin config (API keys) is not written here.']);
  if (backup.readErrors.length) {
    ws.addRow(['WARNING', `Could not read: ${backup.readErrors.map((e) => e.name).join(', ')}`]).font = { bold: true, color: { argb: 'FFC00000' } };
  }
  ws.addRow([]);
  const headRow = ws.addRow(sum.header);
  headRow.font = { bold: true };
  for (const r of sum.rows) ws.addRow(r);
  ws.getColumn(1).width = 16; ws.getColumn(2).width = 24; ws.getColumn(3).width = 40;

  const c = backup.collections;
  if (c.students?.length) {
    const s = studentsSheet(c.students);
    addTable(wb, 'Students', s.header, s.rows);
    const cert = certificatesSheet(c.students);
    if (cert.rows.length) addTable(wb, 'Certificates & Letters', cert.header, cert.rows);
  }
  if (c.feeRecords?.length) {
    const f = feeRecordsSheet(c.feeRecords);
    addTable(wb, 'Fee Receipts', f.header, f.rows);
  }

  const used = new Set(['students', 'feeRecords', ...SHEET_ORDER.map(([n]) => n)]);
  const extra = BACKUP_COLLECTIONS.map((s) => s.name).filter((n) => !used.has(n));
  const order: [string, string][] = [...SHEET_ORDER, ...extra.map((n): [string, string] => [n, getSpec(n)?.label ?? n])];
  const names = new Set(wb.worksheets.map((w) => w.name));
  for (const [coll, label] of order) {
    if (EXCLUDED.has(coll)) continue;
    const docs = c[coll];
    if (!docs?.length) continue;
    const g = genericSheet([...docs].sort((a, b) => docYear(a).localeCompare(docYear(b)) || a.id.localeCompare(b.id)));
    let name = label.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    while (names.has(name)) name = `${name.slice(0, 28)}_${names.size}`;
    names.add(name);
    addTable(wb, name, g.header, g.rows);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
