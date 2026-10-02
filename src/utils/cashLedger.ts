import type { CashAccount, CashDeposit, FeeRecord, PaymentMode, SplitPayment, UpiCredit } from '../types';
import { SMP_FEE_HEADS } from '../types';

// ── Cash-in-hand ledger ──────────────────────────────────────────────────────
// Pure functions shared by the Cash Book page, header badge, Dashboard card,
// Collect Fee banner and audit exports, so every surface shows the same numbers.
//
// Cash in hand is derived, never stored: for each (collection day, account) the
// cash collected comes from fee receipts, the cash deposited comes from
// cashDeposits.amountByDate, and pending = collected − deposited.

export const CASH_ACCOUNTS: Record<CashAccount, { short: string; bank: string; name: string; number: string; covers: string }> = {
  SBI: { short: 'SBI',  bank: 'State Bank of India', name: 'SBI Ppl',     number: '64049891981',    covers: 'SMP fees + Additional heads (Red Cross, Insurance, etc.)' },
  SVK: { short: 'SVK',  bank: 'Canara Bank',         name: 'SVK Mgt',     number: '19032200004180', covers: 'SVK management fee' },
};
export const ACCOUNT_ORDER: CashAccount[] = ['SBI', 'SVK'];

export interface CashUpi { cash: number; upi: number; }

/** Normalise a fee/deposit date (some records hold full ISO strings). */
export function dayKey(date: string): string {
  return (date ?? '').slice(0, 10);
}

function splitPortion(mode: PaymentMode | undefined, amount: number, split: SplitPayment | undefined): CashUpi {
  if (amount <= 0) return { cash: 0, upi: 0 };
  if (mode === 'UPI') return { cash: 0, upi: amount };
  if (mode === 'SPLIT') return { cash: split?.cash ?? 0, upi: split?.upi ?? 0 };
  return { cash: amount, upi: 0 }; // CASH (and legacy records with no mode)
}

/** Cash/UPI per bank account for one receipt.
 *  SVK portion → SVK account; SMP heads + every Additional head → SBI account. */
export function receiptAccountSplit(r: FeeRecord): Record<CashAccount, CashUpi> {
  const smpAmt = SMP_FEE_HEADS.reduce((s, { key }) => s + (r.smp?.[key] ?? 0), 0);
  const addAmt = (r.additionalPaid ?? []).reduce((s, h) => s + (h.amount ?? 0), 0);
  const smp = splitPortion(r.smpPaymentMode ?? r.paymentMode, smpAmt, r.smpSplit);
  const svk = splitPortion(r.svkPaymentMode ?? r.paymentMode, r.svk ?? 0, r.svkSplit);
  const add = splitPortion(r.additionalPaymentMode ?? r.paymentMode, addAmt, r.additionalSplit);
  return {
    SBI: { cash: smp.cash + add.cash, upi: smp.upi + add.upi },
    SVK: svk,
  };
}

/** Human receipt label for the part of a receipt that belongs to an account. */
export function receiptNumbersFor(r: FeeRecord, account: CashAccount): string {
  if (account === 'SVK') return r.svkReceiptNumber || '';
  return [r.receiptNumber && `SMP ${r.receiptNumber}`, r.additionalReceiptNumber && `Addl ${r.additionalReceiptNumber}`]
    .filter(Boolean).join(' / ');
}

export interface LedgerReceipt {
  record: FeeRecord;
  cash: number;
  upi: number;
  receiptNo: string;
}

export interface DayAccountRow {
  key: string;              // `${date}__${account}`
  date: string;             // collection day
  account: CashAccount;
  receipts: LedgerReceipt[];
  cashCollected: number;
  upiCredited: number;
  cashDeposited: number;    // Σ deposits.amountByDate[date] for this account
  pending: number;          // max(0, collected − deposited)
  excess: number;           // max(0, deposited − collected) → mismatch
  deposits: CashDeposit[];  // deposits that cover this day
  upiCredit: UpiCredit | null; // confirmed bank credit for this day's UPI (null → assumed same day)
  upiCreditDate: string;    // confirmed credit date, else the collection date
  upiMismatch: number;      // current UPI − confirmed amount (≠ 0 → receipts changed after confirming)
}

/** One row per (collection day, account) from `startDate` onwards, sorted by date. */
export function buildDayLedger(
  records: FeeRecord[],
  deposits: CashDeposit[],
  startDate: string,
  upiCredits: UpiCredit[] = [],
): DayAccountRow[] {
  const map = new Map<string, DayAccountRow>();
  const get = (date: string, account: CashAccount): DayAccountRow => {
    const key = `${date}__${account}`;
    let row = map.get(key);
    if (!row) {
      row = {
        key, date, account, receipts: [], cashCollected: 0, upiCredited: 0, cashDeposited: 0, pending: 0, excess: 0, deposits: [],
        upiCredit: null, upiCreditDate: date, upiMismatch: 0,
      };
      map.set(key, row);
    }
    return row;
  };

  for (const r of records) {
    const date = dayKey(r.date);
    if (!date || date < startDate) continue;
    const split = receiptAccountSplit(r);
    for (const account of ACCOUNT_ORDER) {
      const { cash, upi } = split[account];
      if (cash <= 0 && upi <= 0) continue;
      const row = get(date, account);
      row.receipts.push({ record: r, cash, upi, receiptNo: receiptNumbersFor(r, account) });
      row.cashCollected += cash;
      row.upiCredited += upi;
    }
  }

  for (const d of deposits) {
    for (const [date, amt] of Object.entries(d.amountByDate ?? {})) {
      if (date < startDate) continue;
      const row = get(date, d.account);
      row.cashDeposited += amt;
      row.deposits.push(d);
    }
  }

  for (const u of upiCredits) {
    if (u.collectionDate < startDate) continue;
    const row = get(u.collectionDate, u.account);
    row.upiCredit = u;
    row.upiCreditDate = u.creditDate;
  }

  const rows = [...map.values()];
  for (const row of rows) {
    if (row.upiCredit) row.upiMismatch = row.upiCredited - row.upiCredit.amount;
    const diff = row.cashCollected - row.cashDeposited;
    row.pending = Math.max(0, diff);
    row.excess = Math.max(0, -diff);
    row.receipts.sort((a, b) => a.receiptNo.localeCompare(b.receiptNo, undefined, { numeric: true }));
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.account.localeCompare(b.account));
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface AccountCashSummary {
  pending: number;
  pendingDays: number;
  oldestDate: string | null;
  upiToday: number;
}

export interface CashSummary {
  byAccount: Record<CashAccount, AccountCashSummary>;
  total: number;
  oldestDate: string | null;
  daysHeld: number;          // days since the oldest pending collection day
  isOverdue: boolean;
  mismatchCount: number;     // (day, account) rows where deposited > collected
  upiMismatchCount: number;  // confirmed UPI days whose receipts changed afterwards
  upiDelayedDays: number;    // UPI days confirmed as credited after the collection day
}

export function cashInHandSummary(ledger: DayAccountRow[], today: string, overdueDays: number): CashSummary {
  const byAccount: Record<CashAccount, AccountCashSummary> = {
    SBI: { pending: 0, pendingDays: 0, oldestDate: null, upiToday: 0 },
    SVK: { pending: 0, pendingDays: 0, oldestDate: null, upiToday: 0 },
  };
  let mismatchCount = 0;
  let upiMismatchCount = 0;
  let upiDelayedDays = 0;
  for (const row of ledger) {
    if (row.upiMismatch !== 0) upiMismatchCount += 1;
    if (row.upiCreditDate > row.date) upiDelayedDays += 1;
    const acc = byAccount[row.account];
    if (row.pending > 0) {
      acc.pending += row.pending;
      acc.pendingDays += 1;
      if (!acc.oldestDate || row.date < acc.oldestDate) acc.oldestDate = row.date;
    }
    if (row.date === today) acc.upiToday += row.upiCredited;
    if (row.excess > 0) mismatchCount += 1;
  }
  const oldestDates = ACCOUNT_ORDER.map((a) => byAccount[a].oldestDate).filter((d): d is string => !!d).sort();
  const oldestDate = oldestDates[0] ?? null;
  const daysHeld = oldestDate ? Math.max(0, daysBetween(oldestDate, today)) : 0;
  return {
    byAccount,
    total: byAccount.SBI.pending + byAccount.SVK.pending,
    oldestDate,
    daysHeld,
    isOverdue: !!oldestDate && daysHeld > overdueDays,
    mismatchCount,
    upiMismatchCount,
    upiDelayedDays,
  };
}

/** Deposited − collected for a deposit's days, where the receipts now show less cash
 *  than was deposited (receipt edited/deleted after deposit). 0 when consistent. */
export function depositMismatch(deposit: CashDeposit, ledger: DayAccountRow[], startDate = ''): number {
  let excess = 0;
  for (const date of deposit.collectionDates) {
    if (date < startDate) continue; // before the cut-off — not tracked
    const row = ledger.find((r) => r.date === date && r.account === deposit.account);
    if (row) excess += row.excess;
    else excess += deposit.amountByDate[date] ?? 0;
  }
  return excess;
}

// ── Cash Book (running balance) ───────────────────────────────────────────────

export type AccountFilter = CashAccount | 'ALL';

export interface CashBookRow {
  date: string;
  opening: number;
  received: number;
  upi: number;
  deposited: number;
  closing: number;
  receiptCount: number;
  depositRefs: string[];
}

export interface CashBook {
  opening: number;
  rows: CashBookRow[];
  totalReceived: number;
  totalUpi: number;
  totalDeposited: number;
  closing: number;
}

function inFilter(account: CashAccount, filter: AccountFilter): boolean {
  return filter === 'ALL' || filter === account;
}

/** Date-wise cash book: cash in on the collection day, cash out on the deposit day. */
export function buildCashBook(
  ledger: DayAccountRow[],
  deposits: CashDeposit[],
  filter: AccountFilter,
  from: string,
  to: string,
): CashBook {
  const days = new Map<string, CashBookRow>();
  const day = (date: string): CashBookRow => {
    let row = days.get(date);
    if (!row) {
      row = { date, opening: 0, received: 0, upi: 0, deposited: 0, closing: 0, receiptCount: 0, depositRefs: [] };
      days.set(date, row);
    }
    return row;
  };
  let opening = 0;

  for (const r of ledger) {
    if (!inFilter(r.account, filter)) continue;
    if (r.date < from) { opening += r.cashCollected; continue; }
    if (r.date > to) continue;
    const row = day(r.date);
    row.received += r.cashCollected;
    row.upi += r.upiCredited;
    row.receiptCount += r.receipts.filter((x) => x.cash > 0).length;
  }
  for (const d of deposits) {
    if (!inFilter(d.account, filter)) continue;
    if (d.depositDate < from) { opening -= d.amount; continue; }
    if (d.depositDate > to) continue;
    const row = day(d.depositDate);
    row.deposited += d.amount;
    row.depositRefs.push(`${d.account}: ${d.reference}`);
  }

  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  let bal = opening;
  for (const row of rows) {
    row.opening = bal;
    bal += row.received - row.deposited;
    row.closing = bal;
  }
  return {
    opening,
    rows,
    totalReceived: rows.reduce((s, r) => s + r.received, 0),
    totalUpi: rows.reduce((s, r) => s + r.upi, 0),
    totalDeposited: rows.reduce((s, r) => s + r.deposited, 0),
    closing: bal,
  };
}

/** Deposit that covered a given (day, account), if any — for receipt-level reports. */
export function depositsFor(row: DayAccountRow): string {
  return row.deposits.map((d) => `${d.depositDate} (${d.reference})`).join(', ');
}

/** Pure-ASCII Indian grouping (jsPDF-safe), e.g. 641034 → "6,41,034". */
export function inr(n: number): string {
  const sign = n < 0 ? '-' : '';
  const s = Math.abs(Math.round(n)).toString();
  if (s.length <= 3) return sign + s;
  return sign + s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
}

// ── Fee remittance summary (cash + UPI per collection day) ───────────────────

export interface RemittanceSummaryRow {
  date: string;
  account: CashAccount;
  cashCollected: number;
  cashDeposited: number;
  cashPending: number;
  cashDepositInfo: string;   // "03-10-2026 / CH123; …"
  upiCollected: number;
  upiCreditDate: string;
  upiConfirmed: boolean;
  upiReference: string;
  totalCollected: number;
  totalRemitted: number;     // cash deposited (capped at collected) + UPI
  unremitted: number;        // cash still in hand
}

export function buildRemittanceSummary(ledger: DayAccountRow[], filter: AccountFilter, from: string, to: string): RemittanceSummaryRow[] {
  return ledger
    .filter((r) => (filter === 'ALL' || r.account === filter) && r.date >= from && r.date <= to)
    .map((r) => {
      const deposited = Math.min(r.cashDeposited, r.cashCollected);
      return {
        date: r.date,
        account: r.account,
        cashCollected: r.cashCollected,
        cashDeposited: r.cashDeposited,
        cashPending: r.pending,
        cashDepositInfo: r.deposits.map((d) => `${d.depositDate} / ${d.reference}`).join('; '),
        upiCollected: r.upiCredited,
        upiCreditDate: r.upiCreditDate,
        upiConfirmed: !!r.upiCredit,
        upiReference: r.upiCredit?.reference ?? '',
        totalCollected: r.cashCollected + r.upiCredited,
        totalRemitted: deposited + r.upiCredited,
        unremitted: r.pending,
      };
    });
}
