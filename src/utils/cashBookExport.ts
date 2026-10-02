import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { CashAccount, CashDeposit } from '../types';
import { INSTITUTE_LOGO_B64 } from './instituteLogo';
import {
  ACCOUNT_ORDER, CASH_ACCOUNTS, buildCashBook, buildRemittanceSummary, depositMismatch, inr,
  type AccountFilter, type CashBook, type DayAccountRow,
} from './cashLedger';

// ── Cash & Bank audit reports (PDF + Excel) ──────────────────────────────────

export type CashReportKind = 'remittance-summary' | 'cash-book' | 'deposit-register' | 'receipt-detail' | 'upi-statement';

export const CASH_REPORTS: { kind: CashReportKind; title: string; blurb: string }[] = [
  { kind: 'remittance-summary', title: 'Fee Remittance Summary', blurb: 'Overall picture per collection day and account: cash collected → deposited (date/challan), UPI collected → credited (date/UTR), and anything still unremitted.' },
  { kind: 'cash-book',        title: 'Cash Book',               blurb: 'Date-wise opening cash, cash received, deposited to bank and closing cash in hand — per account and combined.' },
  { kind: 'deposit-register', title: 'Deposit Register',        blurb: 'Every bank deposit with challan/UTR reference, the collection days and receipt range it covers.' },
  { kind: 'receipt-detail',   title: 'Receipt-wise Detail',     blurb: 'Every receipt with its cash and UPI amounts, collection date and the deposit that cleared it (or PENDING).' },
  { kind: 'upi-statement',    title: 'UPI Credit Statement',    blurb: 'UPI collected per day and account with the date it was credited to the bank and UTR — tick against the bank statement.' },
];

export interface CashReportInput {
  ledger: DayAccountRow[];
  deposits: CashDeposit[];
  filter: AccountFilter;
  from: string;   // YYYY-MM-DD
  to: string;     // YYYY-MM-DD
  startDate: string;
}

const INSTITUTE = 'SANJAY MEMORIAL POLYTECHNIC, SAGAR';
const MARGIN = 10;
type Doc = jsPDF & { lastAutoTable: { finalY: number } };

function dmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

function accountsIn(filter: AccountFilter): CashAccount[] {
  return filter === 'ALL' ? ACCOUNT_ORDER : [filter];
}

function accountLine(filter: AccountFilter): string {
  return accountsIn(filter).map((a) => `${CASH_ACCOUNTS[a].name} (${CASH_ACCOUNTS[a].bank}) A/c ${CASH_ACCOUNTS[a].number}`).join('   |   ');
}

function fileStem(kind: CashReportKind, input: CashReportInput): string {
  const t = CASH_REPORTS.find((r) => r.kind === kind)!.title.replace(/\s+/g, '_');
  return `${t}_${input.filter}_${input.from}_to_${input.to}`;
}

function inRange(date: string, { from, to }: CashReportInput): boolean {
  return date >= from && date <= to;
}

function upiStatus(row: DayAccountRow): string {
  const ref = row.upiCredit?.reference ? ` (UTR ${row.upiCredit.reference})` : '';
  return `UPI credited ${dmy(row.upiCreditDate)}${ref}`;
}

function receiptStatus(row: DayAccountRow, cash: number, upi: number): string {
  return [cash > 0 ? depositStatus(row) : '', upi > 0 ? upiStatus(row) : ''].filter(Boolean).join(' | ');
}

function depositStatus(row: DayAccountRow): string {
  if (row.cashCollected <= 0) return 'UPI only';
  const refs = row.deposits.map((d) => `${dmy(d.depositDate)} / ${d.reference}`).join('; ');
  if (row.pending <= 0) return refs || 'Deposited';
  if (refs) return `PART PENDING Rs.${inr(row.pending)} (${refs})`;
  return 'PENDING';
}

// ── PDF scaffolding ──────────────────────────────────────────────────────────

function newDoc(title: string, input: CashReportInput, landscape = true): Doc {
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' }) as Doc;
  const W = doc.internal.pageSize.getWidth();
  try { doc.addImage(INSTITUTE_LOGO_B64, 'PNG', MARGIN, 7, 14, 14); } catch { /* logo optional */ }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(INSTITUTE, W / 2, 11, { align: 'center' });
  doc.setFontSize(10.5);
  doc.text(title, W / 2, 16.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text(`Period: ${dmy(input.from)} to ${dmy(input.to)}`, W / 2, 21, { align: 'center' });
  doc.text(accountLine(input.filter), W / 2, 25, { align: 'center' });
  doc.setDrawColor(190, 195, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 27.5, W - MARGIN, 27.5);
  doc.setTextColor(20, 20, 20);
  return doc;
}

const TABLE_BASE = {
  theme: 'grid' as const,
  margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 14 },
  styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.6, lineColor: [200, 205, 210] as [number, number, number], lineWidth: 0.15, textColor: [20, 20, 20] as [number, number, number] },
  headStyles: { fillColor: [11, 101, 103] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
  footStyles: { fillColor: [230, 244, 244] as [number, number, number], textColor: [11, 101, 103] as [number, number, number], fontStyle: 'bold' as const },
};

function sectionTitle(doc: Doc, text: string, y: number): number {
  const H = doc.internal.pageSize.getHeight();
  if (y > H - 30) { doc.addPage(); y = 16; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(text, MARGIN, y);
  doc.setFont('helvetica', 'normal');
  return y + 2.5;
}

function finish(doc: Doc, filename: string, note?: string): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : 40;
  if (note) {
    if (y > H - 40) { doc.addPage(); y = 20; }
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text(doc.splitTextToSize(note, W - 2 * MARGIN), MARGIN, y);
    y += 8;
    doc.setTextColor(20, 20, 20);
  }
  if (y > H - 30) { doc.addPage(); y = 25; }
  y += 14;
  doc.setFontSize(8);
  const cols = ['Prepared by (Accounts)', 'Verified by', 'Principal'];
  const step = (W - 2 * MARGIN) / cols.length;
  cols.forEach((c, i) => {
    const x = MARGIN + step * i + step / 2;
    doc.line(x - 25, y - 4, x + 25, y - 4);
    doc.text(c, x, y, { align: 'center' });
  });

  const generated = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated: ${generated}  ·  SMP Admissions — Cash & Bank`, MARGIN, H - 5);
    doc.text(`Page ${p} of ${pages}`, W - MARGIN, H - 5, { align: 'right' });
  }
  doc.save(`${filename}.pdf`);
}

// ── Cash Book ────────────────────────────────────────────────────────────────

function cashBooks(input: CashReportInput): { label: string; book: CashBook }[] {
  const list = accountsIn(input.filter).map((a) => ({
    label: `${CASH_ACCOUNTS[a].name} — ${CASH_ACCOUNTS[a].bank} A/c ${CASH_ACCOUNTS[a].number}`,
    book: buildCashBook(input.ledger, input.deposits, a, input.from, input.to),
  }));
  if (input.filter === 'ALL') list.push({ label: 'Combined (all accounts)', book: buildCashBook(input.ledger, input.deposits, 'ALL', input.from, input.to) });
  return list;
}

const CASH_BOOK_HEAD = ['Date', 'Opening Cash', 'Cash Received', 'Cash Receipts', 'Deposited to Bank', 'Deposit Ref (Challan/UTR)', 'Closing Cash in Hand', 'UPI Credited'];

function cashBookRows(book: CashBook): (string | number)[][] {
  return book.rows.map((r) => [
    dmy(r.date), inr(r.opening), r.received ? inr(r.received) : '-', r.receiptCount || '-',
    r.deposited ? inr(r.deposited) : '-', r.depositRefs.join(', ') || '-', inr(r.closing), r.upi ? inr(r.upi) : '-',
  ]);
}

function cashBookPdf(input: CashReportInput): void {
  const doc = newDoc('CASH BOOK — Cash Received & Bank Remittance', input);
  let y = 31;
  for (const { label, book } of cashBooks(input)) {
    y = sectionTitle(doc, label, y + 2);
    autoTable(doc, {
      ...TABLE_BASE,
      startY: y,
      head: [CASH_BOOK_HEAD],
      body: [
        ['Opening balance', inr(book.opening), '', '', '', '', inr(book.opening), ''],
        ...cashBookRows(book),
      ],
      foot: [['Total', '', inr(book.totalReceived), '', inr(book.totalDeposited), '', inr(book.closing), inr(book.totalUpi)]],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' }, 7: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  finish(doc, fileStem('cash-book', input),
    `Cash Received = cash portion of fee receipts (incl. cash part of split payments) on the collection date. Deposited = cash remitted to the bank on the deposit date. ` +
    `Closing Cash in Hand = Opening + Received - Deposited. UPI amounts are credited directly to the bank and are shown for reference only. Tracking started ${dmy(input.startDate)}.`);
}

function cashBookExcel(input: CashReportInput): void {
  const wb = XLSX.utils.book_new();
  for (const { label, book } of cashBooks(input)) {
    const aoa: (string | number)[][] = [
      [INSTITUTE], [`Cash Book — ${label}`], [`Period: ${dmy(input.from)} to ${dmy(input.to)}`], [],
      CASH_BOOK_HEAD,
      ['Opening balance', book.opening, '', '', '', '', book.opening, ''],
      ...book.rows.map((r) => [dmy(r.date), r.opening, r.received, r.receiptCount, r.deposited, r.depositRefs.join(', '), r.closing, r.upi]),
      ['Total', '', book.totalReceived, '', book.totalDeposited, '', book.closing, book.totalUpi],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [12, 14, 14, 12, 16, 34, 18, 14].map((wch) => ({ wch }));
    const name = label.startsWith('Combined') ? 'Combined' : label.split(' — ')[0];
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${fileStem('cash-book', input)}.xlsx`);
}

// ── Deposit Register ─────────────────────────────────────────────────────────

interface DepositRow {
  d: CashDeposit;
  receipts: number;
  range: string;
  mismatch: number;
}

function depositRows(input: CashReportInput): DepositRow[] {
  return input.deposits
    .filter((d) => (input.filter === 'ALL' || d.account === input.filter) && inRange(d.depositDate, input))
    .sort((a, b) => a.depositDate.localeCompare(b.depositDate) || a.account.localeCompare(b.account))
    .map((d) => {
      const rows = input.ledger.filter((r) => r.account === d.account && d.collectionDates.includes(r.date));
      const nos = rows.flatMap((r) => r.receipts.filter((x) => x.cash > 0).map((x) => x.receiptNo)).filter(Boolean);
      nos.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return {
        d,
        receipts: nos.length,
        range: nos.length ? (nos.length === 1 ? nos[0] : `${nos[0]} … ${nos[nos.length - 1]}`) : '-',
        mismatch: depositMismatch(d, input.ledger, input.startDate),
      };
    });
}

const DEP_HEAD = ['Sl', 'Deposit Date', 'Account', 'Mode', 'Challan / UTR Ref', 'Collection Days Covered', 'Cash Receipts', 'Receipt Range', 'Amount', 'Check', 'Recorded By'];

function depositPdf(input: CashReportInput): void {
  const doc = newDoc('DEPOSIT REGISTER — Cash Remitted to Bank', input);
  const rows = depositRows(input);
  const total = rows.reduce((s, r) => s + r.d.amount, 0);
  autoTable(doc, {
    ...TABLE_BASE,
    startY: 31,
    head: [DEP_HEAD],
    body: rows.map((r, i) => [
      i + 1, dmy(r.d.depositDate), CASH_ACCOUNTS[r.d.account].name, r.d.depositMode, r.d.reference,
      r.d.collectionDates.map(dmy).join(', '), r.receipts, r.range, inr(r.d.amount),
      r.mismatch > 0 ? `MISMATCH Rs.${inr(r.mismatch)}` : 'OK', r.d.createdByEmail ?? '',
    ]),
    foot: [['', '', '', '', '', '', '', 'Total', inr(total), '', '']],
    columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 5: { cellWidth: 52 }, 6: { halign: 'center' }, 8: { halign: 'right', fontStyle: 'bold' } },
  });
  finish(doc, fileStem('deposit-register', input),
    'Check = OK when the receipts recorded for the covered days still total the amount deposited. MISMATCH means a receipt was edited or deleted after the deposit was recorded.');
}

function depositExcel(input: CashReportInput): void {
  const rows = depositRows(input);
  const aoa: (string | number)[][] = [
    [INSTITUTE], ['Deposit Register — Cash Remitted to Bank'], [`Period: ${dmy(input.from)} to ${dmy(input.to)}`], [],
    DEP_HEAD,
    ...rows.map((r, i) => [
      i + 1, dmy(r.d.depositDate), CASH_ACCOUNTS[r.d.account].name, r.d.depositMode, r.d.reference,
      r.d.collectionDates.map(dmy).join(', '), r.receipts, r.range, r.d.amount,
      r.mismatch > 0 ? `MISMATCH ${r.mismatch}` : 'OK', r.d.createdByEmail ?? '',
    ]),
    ['', '', '', '', '', '', '', 'Total', rows.reduce((s, r) => s + r.d.amount, 0), '', ''],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [5, 12, 12, 10, 20, 36, 10, 24, 12, 16, 24].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'Deposits');
  XLSX.writeFile(wb, `${fileStem('deposit-register', input)}.xlsx`);
}

// ── Receipt-wise detail ──────────────────────────────────────────────────────

const RCPT_HEAD = ['Sl', 'Date', 'Account', 'Receipt No.', 'Student', 'Reg No.', 'Course / Year', 'Cash', 'UPI', 'Remitted to Bank (Date / Ref)'];

function receiptRows(input: CashReportInput) {
  const rows = input.ledger
    .filter((r) => (input.filter === 'ALL' || r.account === input.filter) && inRange(r.date, input));
  return rows.flatMap((row) => row.receipts.map((x) => ({ row, x })));
}

function receiptPdf(input: CashReportInput): void {
  const doc = newDoc('RECEIPT-WISE CASH & UPI DETAIL', input);
  const list = receiptRows(input);
  const cash = list.reduce((s, { x }) => s + x.cash, 0);
  const upi = list.reduce((s, { x }) => s + x.upi, 0);
  autoTable(doc, {
    ...TABLE_BASE,
    startY: 31,
    head: [RCPT_HEAD],
    body: list.map(({ row, x }, i) => [
      i + 1, dmy(row.date), CASH_ACCOUNTS[row.account].name, x.receiptNo || '-', x.record.studentName,
      x.record.regNumber || '-', `${x.record.course} / ${x.record.year}`,
      x.cash ? inr(x.cash) : '-', x.upi ? inr(x.upi) : '-', receiptStatus(row, x.cash, x.upi),
    ]),
    foot: [['', '', '', '', '', '', 'Total', inr(cash), inr(upi), '']],
    columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 4: { cellWidth: 46 }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { cellWidth: 72 } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 9 && String(data.cell.raw).includes('PENDING')) {
        data.cell.styles.textColor = [165, 23, 58];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  finish(doc, fileStem('receipt-detail', input));
}

function receiptExcel(input: CashReportInput): void {
  const list = receiptRows(input);
  const aoa: (string | number)[][] = [
    [INSTITUTE], ['Receipt-wise Cash & UPI Detail'], [`Period: ${dmy(input.from)} to ${dmy(input.to)}`], [],
    RCPT_HEAD,
    ...list.map(({ row, x }, i) => [
      i + 1, dmy(row.date), CASH_ACCOUNTS[row.account].name, x.receiptNo, x.record.studentName,
      x.record.regNumber, `${x.record.course} / ${x.record.year}`, x.cash, x.upi,
      receiptStatus(row, x.cash, x.upi),
    ]),
    ['', '', '', '', '', '', 'Total', list.reduce((s, { x }) => s + x.cash, 0), list.reduce((s, { x }) => s + x.upi, 0), ''],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [5, 12, 10, 22, 30, 14, 16, 10, 10, 44].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'Receipts');
  XLSX.writeFile(wb, `${fileStem('receipt-detail', input)}.xlsx`);
}

// ── UPI credit statement ─────────────────────────────────────────────────────

const UPI_HEAD = ['Sl', 'UPI Collected On', 'Account', 'UPI Receipts', 'Amount', 'Credited to Bank On', 'Days', 'UTR / Settlement Ref', 'Remarks', 'Tallied (tick)'];

function upiRows(input: CashReportInput) {
  return input.ledger
    .filter((r) => (input.filter === 'ALL' || r.account === input.filter) && inRange(r.date, input) && r.upiCredited > 0)
    .map((r) => ({
      r,
      n: r.receipts.filter((x) => x.upi > 0).length,
      lag: Math.max(0, Math.round((Date.parse(r.upiCreditDate) - Date.parse(r.date)) / 86_400_000)),
    }));
}

function upiPdf(input: CashReportInput): void {
  const doc = newDoc('UPI CREDIT STATEMENT — Direct Bank Credits', input);
  const rows = upiRows(input);
  const total = rows.reduce((s, x) => s + x.r.upiCredited, 0);
  autoTable(doc, {
    ...TABLE_BASE,
    startY: 31,
    head: [UPI_HEAD],
    body: rows.map(({ r, n, lag }, i) => [
      i + 1, dmy(r.date), `${CASH_ACCOUNTS[r.account].name} (${CASH_ACCOUNTS[r.account].number})`, n, inr(r.upiCredited),
      `${dmy(r.upiCreditDate)}${r.upiCredit ? '' : ' *'}`, lag || '-', r.upiCredit?.reference || '-', r.upiCredit?.remarks || '', '',
    ]),
    foot: [['', 'Total', '', rows.reduce((s, x) => s + x.n, 0), inr(total), '', '', '', '', '']],
    columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 3: { halign: 'center' }, 4: { halign: 'right', fontStyle: 'bold' }, 6: { halign: 'center' } },
  });
  finish(doc, fileStem('upi-statement', input),
    '* Credit date not separately recorded — assumed credited on the collection date. UPI payments go directly to the bank and are never part of cash in hand.');
}

function upiExcel(input: CashReportInput): void {
  const rows = upiRows(input);
  const aoa: (string | number)[][] = [
    [INSTITUTE], ['UPI Credit Statement'], [`Period: ${dmy(input.from)} to ${dmy(input.to)}`], [],
    [...UPI_HEAD.slice(0, -1), 'Credit Date Source'],
    ...rows.map(({ r, n, lag }, i) => [
      i + 1, dmy(r.date), `${CASH_ACCOUNTS[r.account].name} (${CASH_ACCOUNTS[r.account].number})`, n, r.upiCredited,
      dmy(r.upiCreditDate), lag, r.upiCredit?.reference ?? '', r.upiCredit?.remarks ?? '', r.upiCredit ? 'Recorded' : 'Assumed (collection date)',
    ]),
    ['', 'Total', '', rows.reduce((s, x) => s + x.n, 0), rows.reduce((s, x) => s + x.r.upiCredited, 0), '', '', '', '', ''],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [5, 14, 26, 12, 12, 16, 6, 22, 24, 22].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'UPI Credits');
  XLSX.writeFile(wb, `${fileStem('upi-statement', input)}.xlsx`);
}

// ── Fee remittance summary (cash + UPI) ──────────────────────────────────────

const REM_HEAD = [
  'Collected On', 'Account', 'Cash Collected', 'Cash Deposited', 'Deposit Date / Challan', 'Cash Pending',
  'UPI Collected', 'UPI Credited On / UTR', 'Total Collected', 'Total Remitted', 'Unremitted',
];

function remittancePdf(input: CashReportInput): void {
  const doc = newDoc('FEE REMITTANCE SUMMARY — Cash & UPI to Bank', input);
  const rows = buildRemittanceSummary(input.ledger, input.filter, input.from, input.to);
  const sum = (k: 'cashCollected' | 'cashDeposited' | 'cashPending' | 'upiCollected' | 'totalCollected' | 'totalRemitted' | 'unremitted') =>
    rows.reduce((s, r) => s + r[k], 0);

  // Per-account summary first
  const accs = accountsIn(input.filter);
  autoTable(doc, {
    ...TABLE_BASE,
    startY: 31,
    head: [['Account', 'Cash Collected', 'Cash Deposited', 'Cash in Hand', 'UPI Collected (credited)', 'Total Collected', 'Total Remitted', 'Remitted %']],
    body: accs.map((a) => {
      const rs = rows.filter((r) => r.account === a);
      const tc = rs.reduce((s, r) => s + r.totalCollected, 0);
      const tr = rs.reduce((s, r) => s + r.totalRemitted, 0);
      return [
        `${CASH_ACCOUNTS[a].name} — ${CASH_ACCOUNTS[a].bank} ${CASH_ACCOUNTS[a].number}`,
        inr(rs.reduce((s, r) => s + r.cashCollected, 0)), inr(rs.reduce((s, r) => s + Math.min(r.cashDeposited, r.cashCollected), 0)),
        inr(rs.reduce((s, r) => s + r.cashPending, 0)), inr(rs.reduce((s, r) => s + r.upiCollected, 0)),
        inr(tc), inr(tr), tc ? `${((tr / tc) * 100).toFixed(1)}%` : '-',
      ];
    }),
    foot: [['Total', inr(sum('cashCollected')), inr(rows.reduce((s, r) => s + Math.min(r.cashDeposited, r.cashCollected), 0)), inr(sum('cashPending')), inr(sum('upiCollected')),
      inr(sum('totalCollected')), inr(sum('totalRemitted')), sum('totalCollected') ? `${((sum('totalRemitted') / sum('totalCollected')) * 100).toFixed(1)}%` : '-']],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  });

  const y = sectionTitle(doc, 'Day-wise detail', doc.lastAutoTable.finalY + 7);
  autoTable(doc, {
    ...TABLE_BASE,
    startY: y,
    head: [REM_HEAD],
    body: rows.map((r) => [
      dmy(r.date), CASH_ACCOUNTS[r.account].name,
      r.cashCollected ? inr(r.cashCollected) : '-', r.cashDeposited ? inr(r.cashDeposited) : '-',
      r.cashDepositInfo ? r.cashDepositInfo.split('; ').map((x) => { const [d, ref] = x.split(' / '); return `${dmy(d)} / ${ref}`; }).join('; ') : (r.cashCollected ? 'NOT DEPOSITED' : '-'),
      r.cashPending ? inr(r.cashPending) : '-',
      r.upiCollected ? inr(r.upiCollected) : '-',
      r.upiCollected ? `${dmy(r.upiCreditDate)}${r.upiConfirmed ? '' : ' *'}${r.upiReference ? ` / ${r.upiReference}` : ''}` : '-',
      inr(r.totalCollected), inr(r.totalRemitted), r.unremitted ? inr(r.unremitted) : 'Nil',
    ]),
    foot: [['Total', '', inr(sum('cashCollected')), inr(sum('cashDeposited')), '', inr(sum('cashPending')), inr(sum('upiCollected')), '', inr(sum('totalCollected')), inr(sum('totalRemitted')), inr(sum('unremitted'))]],
    columnStyles: {
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { cellWidth: 44 }, 5: { halign: 'right' }, 6: { halign: 'right' },
      7: { cellWidth: 36 }, 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const raw = String(data.cell.raw);
      if ((data.column.index === 4 && raw === 'NOT DEPOSITED') || (data.column.index === 10 && raw !== 'Nil') || (data.column.index === 5 && raw !== '-')) {
        data.cell.styles.textColor = [165, 23, 58];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  finish(doc, fileStem('remittance-summary', input),
    'Total Remitted = cash deposited to bank (up to the cash collected) + UPI credited directly. Unremitted = cash still in hand. ' +
    '* UPI credit date not separately recorded — assumed credited on the collection date.');
}

function remittanceExcel(input: CashReportInput): void {
  const rows = buildRemittanceSummary(input.ledger, input.filter, input.from, input.to);
  const aoa: (string | number)[][] = [
    [INSTITUTE], ['Fee Remittance Summary — Cash & UPI to Bank'], [`Period: ${dmy(input.from)} to ${dmy(input.to)}`], [accountLine(input.filter)], [],
    [...REM_HEAD, 'UPI Credit Date Source'],
    ...rows.map((r) => [
      dmy(r.date), CASH_ACCOUNTS[r.account].name, r.cashCollected, r.cashDeposited,
      r.cashDepositInfo ? r.cashDepositInfo.split('; ').map((x) => { const [d, ref] = x.split(' / '); return `${dmy(d)} / ${ref}`; }).join('; ') : (r.cashCollected ? 'NOT DEPOSITED' : ''),
      r.cashPending, r.upiCollected,
      r.upiCollected ? `${dmy(r.upiCreditDate)}${r.upiReference ? ` / ${r.upiReference}` : ''}` : '',
      r.totalCollected, r.totalRemitted, r.unremitted,
      r.upiCollected ? (r.upiConfirmed ? 'Recorded' : 'Assumed (collection date)') : '',
    ]),
    ['Total', '', ...(['cashCollected', 'cashDeposited'] as const).map((k) => rows.reduce((s, r) => s + r[k], 0)), '',
      rows.reduce((s, r) => s + r.cashPending, 0), rows.reduce((s, r) => s + r.upiCollected, 0), '',
      rows.reduce((s, r) => s + r.totalCollected, 0), rows.reduce((s, r) => s + r.totalRemitted, 0), rows.reduce((s, r) => s + r.unremitted, 0), ''],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [12, 10, 13, 13, 30, 12, 12, 28, 14, 14, 12, 22].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'Remittance Summary');
  XLSX.writeFile(wb, `${fileStem('remittance-summary', input)}.xlsx`);
}

// ── Public entry point ───────────────────────────────────────────────────────

export function exportCashReport(kind: CashReportKind, format: 'pdf' | 'excel', input: CashReportInput): void {
  const fns: Record<CashReportKind, [(i: CashReportInput) => void, (i: CashReportInput) => void]> = {
    'remittance-summary': [remittancePdf, remittanceExcel],
    'cash-book':        [cashBookPdf, cashBookExcel],
    'deposit-register': [depositPdf, depositExcel],
    'receipt-detail':   [receiptPdf, receiptExcel],
    'upi-statement':    [upiPdf, upiExcel],
  };
  fns[kind][format === 'pdf' ? 0 : 1](input);
}
