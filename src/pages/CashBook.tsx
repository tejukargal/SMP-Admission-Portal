import { Fragment, useEffect, useMemo, useState } from 'react';
import { useCashInHand } from '../contexts/CashInHandContext';
import { deleteCashDeposit, deleteUpiCredit, saveCashTrackingSettings, DEFAULT_OVERDUE_DAYS } from '../services/cashDepositService';
import { RecordDepositModal } from '../components/cashBook/RecordDepositModal';
import { UpiCreditModal } from '../components/cashBook/UpiCreditModal';
import { Modal } from '../components/common/Modal';
import { PageSpinner } from '../components/common/PageSpinner';
import {
  BTN_GRAY, BTN_GREEN, BTN_PRIMARY, BTN_RED, BTN_TEAL, TABLE_CARD, THEAD, TFOOT, fs, SegmentedToggle,
} from '../components/feeReports/feeReportUi';
import {
  ACCOUNT_ORDER, CASH_ACCOUNTS, buildCashBook, buildRemittanceSummary, daysBetween, depositMismatch,
  type AccountFilter, type DayAccountRow,
} from '../utils/cashLedger';
import { CASH_REPORTS, type CashReportKind } from '../utils/cashReports';
import { formatIsoDate, formatIsoDateTime } from '../utils/formatDates';
import type { CashAccount, CashDeposit } from '../types';

type Tab = 'hand' | 'deposits' | 'upi' | 'reports';
const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;

// ── Small building blocks ────────────────────────────────────────────────────

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'amber' | 'red' | 'green' | 'blue' | 'teal' }) {
  const c = {
    amber: { b: 'rgba(217,119,6,0.30)', bg: '#FFF8EB', ink: '#9A5B00' },
    red:   { b: 'rgba(225,29,72,0.30)', bg: '#FFF1F3', ink: '#A5173A' },
    green: { b: 'rgba(15,169,104,0.30)', bg: 'rgba(15,169,104,0.06)', ink: '#0A7A4B' },
    blue:  { b: 'rgba(29,78,216,0.22)', bg: '#F3F7FF', ink: '#1D4ED8' },
    teal:  { b: 'rgba(15,139,141,0.28)', bg: '#F2FAFA', ink: '#0B6567' },
  }[tone];
  return (
    <div className="rounded-[14px] border px-4 py-3 min-w-0" style={{ borderColor: c.b, background: c.bg }}>
      <p className="text-[10px] font-medium uppercase tracking-[0.8px]" style={{ color: c.ink }}>{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums leading-none" style={{ color: c.ink }}>{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-[#5B6371] truncate" title={sub}>{sub}</p>}
    </div>
  );
}

function receiptRange(row: DayAccountRow): string {
  const nos = row.receipts.filter((r) => r.cash > 0).map((r) => r.receiptNo).filter(Boolean);
  if (nos.length === 0) return '—';
  return nos.length === 1 ? nos[0] : `${nos[0]} … ${nos[nos.length - 1]}`;
}

// ── Setup / settings ─────────────────────────────────────────────────────────

function SettingsForm({ initialStart, initialOverdue, onDone, firstRun }: {
  initialStart: string; initialOverdue: number; onDone?: () => void; firstRun?: boolean;
}) {
  const [startDate, setStartDate] = useState(initialStart);
  const [overdueDays, setOverdueDays] = useState(String(initialOverdue));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const od = Number(overdueDays);
    if (!startDate) { setError('Choose a start date.'); return; }
    if (!Number.isInteger(od) || od < 0 || od > 60) { setError('Overdue days must be a whole number between 0 and 60.'); return; }
    setSaving(true);
    setError('');
    try {
      await saveCashTrackingSettings({ startDate, overdueDays: od });
      onDone?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 text-[13px]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#5B6371] mb-1">Track cash from (cut-off date)</span>
          <input type="date" className="w-full rounded-[10px] border border-[#CDE7E7] px-3 py-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#5B6371] mb-1">Warn when cash is held more than (days)</span>
          <input inputMode="numeric" className="w-full rounded-[10px] border border-[#CDE7E7] px-3 py-2" value={overdueDays} onChange={(e) => setOverdueDays(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      <p className="text-[12px] text-[#5B6371]">
        Cash collected <b>before</b> the cut-off date is treated as already deposited. From this date on, every cash receipt stays in
        “cash in hand” until you record its bank deposit.{!firstRun && ' Changing the date re-computes everything; recorded deposits are kept.'}
      </p>
      {error && <p className="text-[12px] text-[#A5173A]">{error}</p>}
      <div className="flex justify-end gap-2">
        {!firstRun && <button type="button" className={BTN_GRAY} onClick={onDone}>Cancel</button>}
        <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : firstRun ? 'Start tracking' : 'Save'}</button>
      </div>
    </div>
  );
}

// ── Cash in Hand tab ─────────────────────────────────────────────────────────

function AccountPendingSection({ account, rows, today, overdueDays, onRecord }: {
  account: CashAccount;
  rows: DayAccountRow[];
  today: string;
  overdueDays: number;
  onRecord: (account: CashAccount, days: DayAccountRow[]) => void;
}) {
  const acc = CASH_ACCOUNTS[account];
  const pendingRows = rows.filter((r) => r.account === account && r.pending > 0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  // Selections for days that are no longer pending (e.g. just deposited) are ignored
  // because only pendingRows are matched against `selected`.
  const total = pendingRows.reduce((s, r) => s + r.pending, 0);
  const selRows = pendingRows.filter((r) => selected.has(r.key));
  const selTotal = selRows.reduce((s, r) => s + r.pending, 0);
  const allOn = pendingRows.length > 0 && selRows.length === pendingRows.length;

  const toggle = (key: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  return (
    <div className="rounded-2xl border border-[#CDE7E7] bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#CDE7E7] bg-[#F7FBFB]">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-[#0B6567]">{acc.name} <span className="font-normal text-[#5B6371]">· {acc.bank} · A/c {acc.number}</span></p>
          <p className="text-[11px] text-[#8A93A3]">{acc.covers}</p>
        </div>
        <span className={`ml-auto rounded-full border px-2.5 py-1 text-[12px] font-semibold tabular-nums ${total > 0 ? 'border-[#D97706]/40 bg-[#FFF8EB] text-[#9A5B00]' : 'border-[#0FA968]/35 bg-[#0FA968]/[0.06] text-[#0A7A4B]'}`}>
          {total > 0 ? `${rupee(total)} pending` : 'Nil — all deposited'}
        </span>
      </div>

      {pendingRows.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] text-[#5B6371]">No cash waiting to be deposited to this account.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className={THEAD}>
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(pendingRows.map((r) => r.key)))} aria-label="Select all days" /></th>
                  <th className="px-3 py-2 text-left font-semibold">Collected on</th>
                  <th className="px-3 py-2 text-center font-semibold">Cash receipts</th>
                  <th className="px-3 py-2 text-left font-semibold">Receipt range</th>
                  <th className="px-3 py-2 text-right font-semibold">Cash collected</th>
                  <th className="px-3 py-2 text-right font-semibold">Already deposited</th>
                  <th className="px-3 py-2 text-right font-semibold">Pending</th>
                  <th className="px-3 py-2 text-center font-semibold">Held</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((r) => {
                  const held = Math.max(0, daysBetween(r.date, today));
                  const late = held > overdueDays;
                  const cashReceipts = r.receipts.filter((x) => x.cash > 0);
                  return (
                    <Fragment key={r.key}>
                      <tr className={`border-t border-[#EEF4F4] ${selected.has(r.key) ? 'bg-[#0F8B8D]/[0.05]' : ''}`}>
                        <td className="px-3 py-2 text-center"><input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} aria-label={`Select ${r.date}`} /></td>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{formatIsoDate(r.date)}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{cashReceipts.length}</td>
                        <td className="px-3 py-2 text-[#5B6371] whitespace-nowrap">{receiptRange(r)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rupee(r.cashCollected)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#5B6371]">{r.cashDeposited ? rupee(r.cashDeposited) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#9A5B00]">{rupee(r.pending)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`rounded-full px-2 py-[2px] text-[10.5px] font-semibold ${late ? 'bg-[#FFF1F3] text-[#A5173A]' : 'bg-[#F3F5F8] text-[#5B6371]'}`}>
                            {held === 0 ? 'today' : `${held}d`}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="text-[11.5px] text-[#0B6567] underline cursor-pointer whitespace-nowrap" onClick={() => setExpanded(expanded === r.key ? null : r.key)}>
                            {expanded === r.key ? 'Hide' : 'Receipts'}
                          </button>
                        </td>
                      </tr>
                      {expanded === r.key && (
                        <tr className="bg-[#FAFCFC]">
                          <td />
                          <td colSpan={8} className="px-3 pb-3">
                            <table className="w-full text-[11.5px] mt-1">
                              <thead className="text-[#8A93A3]">
                                <tr><th className="text-left py-1 font-medium">Receipt</th><th className="text-left py-1 font-medium">Student</th><th className="text-left py-1 font-medium">Course / Year</th><th className="text-right py-1 font-medium">Cash</th><th className="text-right py-1 font-medium">UPI</th></tr>
                              </thead>
                              <tbody>
                                {r.receipts.map((x) => (
                                  <tr key={x.record.id} className="border-t border-[#EEF1F5]">
                                    <td className="py-1">{x.receiptNo || '—'}</td>
                                    <td className="py-1">{x.record.studentName}</td>
                                    <td className="py-1 text-[#5B6371]">{x.record.course} / {x.record.year}</td>
                                    <td className="py-1 text-right tabular-nums">{x.cash ? rupee(x.cash) : '—'}</td>
                                    <td className="py-1 text-right tabular-nums text-[#1D4ED8]">{x.upi ? rupee(x.upi) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-[#CDE7E7] bg-[#F7FBFB]">
            <span className="text-[12px] text-[#5B6371]">
              {selRows.length ? <>Selected <b>{selRows.length}</b> day{selRows.length === 1 ? '' : 's'} · <b className="tabular-nums text-[#262B35]">{rupee(selTotal)}</b></> : 'Tick the days whose cash you deposited.'}
            </span>
            <button type="button" className={`${BTN_PRIMARY} ml-auto`} disabled={!selRows.length} onClick={() => onRecord(account, selRows)}>
              Record deposit to {acc.short}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function UpiCredits({ ledger, today, onOpen }: { ledger: DayAccountRow[]; today: string; onOpen: () => void }) {
  const recent = useMemo(
    () => ledger.filter((r) => r.upiCredited > 0).sort((a, b) => b.date.localeCompare(a.date) || a.account.localeCompare(b.account)).slice(0, 10),
    [ledger],
  );

  return (
    <div className="rounded-2xl border border-[#1D4ED8]/20 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#1D4ED8]/15 bg-[#F3F7FF]">
        <div>
          <p className="text-[13.5px] font-semibold text-[#1D4ED8]">UPI — credited directly to bank</p>
          <p className="text-[11px] text-[#5B6371]">Assumed credited on the collection day unless you set a different credit date.</p>
        </div>
        <button type="button" className={`${BTN_GRAY} ml-auto`} onClick={onOpen}>Manage UPI credits →</button>
      </div>
      {recent.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-[#5B6371]">No UPI collections since tracking started.</p>
      ) : (
        <ul className="divide-y divide-[#EEF1F5] text-[12.5px]">
          {recent.map((r) => (
            <li key={r.key} className="px-4 py-2 flex flex-wrap gap-x-3">
              <span className="font-medium w-28">{formatIsoDate(r.date)}{r.date === today ? ' (today)' : ''}</span>
              <span className="text-[#5B6371]">
                <b className="tabular-nums text-[#1D4ED8]">{rupee(r.upiCredited)}</b> credited to {CASH_ACCOUNTS[r.account].name} ({CASH_ACCOUNTS[r.account].number})
                {' '}{r.upiCreditDate === r.date ? 'same day' : <>on <b>{formatIsoDate(r.upiCreditDate)}</b></>}
                {r.upiCredit?.reference && <> · UTR {r.upiCredit.reference}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── UPI credits tab ──────────────────────────────────────────────────────────

function UpiCreditsTab({ ledger, onSet, onReset }: {
  ledger: DayAccountRow[];
  onSet: (rows: DayAccountRow[]) => void;
  onReset: (row: DayAccountRow) => void;
}) {
  const [filter, setFilter] = useState<AccountFilter>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rows = useMemo(
    () => ledger
      .filter((r) => (r.upiCredited > 0 || r.upiCredit) && (filter === 'ALL' || r.account === filter))
      .sort((a, b) => b.date.localeCompare(a.date) || a.account.localeCompare(b.account)),
    [ledger, filter],
  );
  const selRows = rows.filter((r) => selected.has(r.key) && r.upiCredited > 0);
  const total = rows.reduce((s, r) => s + r.upiCredited, 0);
  const toggle = (key: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedToggle
          options={[{ value: 'ALL', label: 'All accounts' }, ...ACCOUNT_ORDER.map((a) => ({ value: a, label: CASH_ACCOUNTS[a].name }))]}
          value={filter}
          onChange={(v) => setFilter(v as AccountFilter)}
        />
        <span className="text-[12px] text-[#5B6371]">{rows.length} day{rows.length === 1 ? '' : 's'} · <b className="tabular-nums text-[#1D4ED8]">{rupee(total)}</b></span>
        <span className="ml-auto text-[12px] text-[#5B6371]">{selRows.length ? `${selRows.length} selected · ${rupee(selRows.reduce((s, r) => s + r.upiCredited, 0))}` : 'Tick days that were credited on a different date.'}</span>
        <button type="button" className={BTN_PRIMARY} disabled={!selRows.length} onClick={() => { onSet(selRows); setSelected(new Set()); }}>Set credit date</button>
      </div>
      <div className={TABLE_CARD}>
        <table className="w-full text-[12.5px]">
          <thead className={`${THEAD} sticky top-0 z-10`}>
            <tr>
              <th className="px-3 py-2 w-8" />
              <th className="px-3 py-2 text-left font-semibold">UPI collected on</th>
              <th className="px-3 py-2 text-left font-semibold">Account</th>
              <th className="px-3 py-2 text-center font-semibold">UPI receipts</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 text-left font-semibold">Credited to bank on</th>
              <th className="px-3 py-2 text-left font-semibold">UTR / Remarks</th>
              <th className="px-3 py-2 text-left font-semibold">Check</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-[#8A93A3]">No UPI collections since tracking started.</td></tr>
            )}
            {rows.map((r) => {
              const lag = daysBetween(r.date, r.upiCreditDate);
              return (
                <tr key={r.key} className={`border-t border-[#EEF4F4] ${selected.has(r.key) ? 'bg-[#1D4ED8]/[0.04]' : ''}`}>
                  <td className="px-3 py-2 text-center">
                    {r.upiCredited > 0 && <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} aria-label={`Select ${r.date}`} />}
                  </td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{formatIsoDate(r.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{CASH_ACCOUNTS[r.account].name}<div className="text-[10.5px] text-[#8A93A3]">{CASH_ACCOUNTS[r.account].number}</div></td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.receipts.filter((x) => x.upi > 0).length}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#1D4ED8]">{rupee(r.upiCredited)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatIsoDate(r.upiCreditDate)}
                    {r.upiCredit
                      ? <span className="ml-1.5 rounded-full bg-[#0FA968]/[0.08] border border-[#0FA968]/30 px-1.5 py-[1px] text-[10px] font-semibold text-[#0A7A4B]">{lag > 0 ? `+${lag}d · set` : 'set'}</span>
                      : <span className="ml-1.5 rounded-full bg-[#F3F5F8] px-1.5 py-[1px] text-[10px] font-medium text-[#8A93A3]">same day</span>}
                  </td>
                  <td className="px-3 py-2 text-[11.5px] text-[#5B6371]">
                    {r.upiCredit?.reference || '—'}{r.upiCredit?.remarks && <div>{r.upiCredit.remarks}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.upiMismatch !== 0
                      ? <span className="rounded-full bg-[#FFF1F3] border border-[#E11D48]/30 px-2 py-[2px] text-[10.5px] font-semibold text-[#A5173A]" title={`Credit date was set for ${rupee(r.upiCredit?.amount ?? 0)}; receipts now total ${rupee(r.upiCredited)}.`}>Mismatch {r.upiMismatch > 0 ? '+' : '−'}{rupee(Math.abs(r.upiMismatch))}</span>
                      : <span className="text-[10.5px] text-[#8A93A3]">—</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    {r.upiCredited > 0 && <button type="button" className={`${BTN_TEAL} !py-1 !text-[11px] mr-1.5`} onClick={() => onSet([r])}>{r.upiCredit ? 'Edit' : 'Set date'}</button>}
                    {r.upiCredit && <button type="button" className={`${BTN_RED} !py-1 !text-[11px]`} onClick={() => onReset(r)}>Reset</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Deposits tab ─────────────────────────────────────────────────────────────

function DepositsTab({ deposits, ledger, startDate, onEdit, onUndo }: {
  deposits: CashDeposit[]; ledger: DayAccountRow[]; startDate: string;
  onEdit: (d: CashDeposit) => void; onUndo: (d: CashDeposit) => void;
}) {
  const [filter, setFilter] = useState<AccountFilter>('ALL');
  const list = useMemo(
    () => deposits
      .filter((d) => filter === 'ALL' || d.account === filter)
      .sort((a, b) => b.depositDate.localeCompare(a.depositDate) || b.createdAt.localeCompare(a.createdAt)),
    [deposits, filter],
  );
  const total = list.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedToggle
          options={[{ value: 'ALL', label: 'All accounts' }, ...ACCOUNT_ORDER.map((a) => ({ value: a, label: CASH_ACCOUNTS[a].name }))]}
          value={filter}
          onChange={(v) => setFilter(v as AccountFilter)}
        />
        <span className="ml-auto text-[12px] text-[#5B6371]">{list.length} deposit{list.length === 1 ? '' : 's'} · <b className="tabular-nums text-[#262B35]">{rupee(total)}</b></span>
      </div>
      <div className={TABLE_CARD}>
        <table className="w-full text-[12.5px]">
          <thead className={`${THEAD} sticky top-0 z-10`}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Deposit date</th>
              <th className="px-3 py-2 text-left font-semibold">Account</th>
              <th className="px-3 py-2 text-left font-semibold">Mode / Reference</th>
              <th className="px-3 py-2 text-left font-semibold">Cash collected on</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 text-left font-semibold">Check</th>
              <th className="px-3 py-2 text-left font-semibold">Recorded</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[#8A93A3]">No deposits recorded yet.</td></tr>
            )}
            {list.map((d) => {
              const mismatch = depositMismatch(d, ledger, startDate);
              return (
                <tr key={d.id} className="border-t border-[#EEF4F4] align-top">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{formatIsoDate(d.depositDate)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{CASH_ACCOUNTS[d.account].name}<div className="text-[10.5px] text-[#8A93A3]">{CASH_ACCOUNTS[d.account].number}</div></td>
                  <td className="px-3 py-2">
                    <div>{d.depositMode} · <b>{d.reference}</b></div>
                    {d.remarks && <div className="text-[11px] text-[#5B6371]">{d.remarks}</div>}
                    {d.slipUrl && <a href={d.slipUrl} target="_blank" rel="noreferrer" className="text-[11px] text-[#0B6567] underline">View slip</a>}
                  </td>
                  <td className="px-3 py-2 text-[#5B6371]">{d.collectionDates.map(formatIsoDate).join(', ')}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{rupee(d.amount)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {mismatch > 0
                      ? <span className="rounded-full bg-[#FFF1F3] border border-[#E11D48]/30 px-2 py-[2px] text-[10.5px] font-semibold text-[#A5173A]" title="Receipts for these days were edited or deleted after this deposit was recorded, so they now total less than the amount deposited.">Mismatch {rupee(mismatch)}</span>
                      : <span className="rounded-full bg-[#0FA968]/[0.08] border border-[#0FA968]/30 px-2 py-[2px] text-[10.5px] font-semibold text-[#0A7A4B]">OK</span>}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-[#5B6371]">{formatIsoDateTime(d.createdAt)}{d.createdByEmail && <div>{d.createdByEmail}</div>}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <button type="button" className={`${BTN_TEAL} !py-1 !text-[11px] mr-1.5`} onClick={() => onEdit(d)}>Edit</button>
                    <button type="button" className={`${BTN_RED} !py-1 !text-[11px]`} onClick={() => onUndo(d)}>Undo</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Reports tab ──────────────────────────────────────────────────────────────

function ReportsTab({ ledger, deposits, startDate, today }: { ledger: DayAccountRow[]; deposits: CashDeposit[]; startDate: string; today: string }) {
  const [from, setFrom] = useState(() => (monthStart(today) < startDate ? startDate : monthStart(today)));
  const [to, setTo] = useState(today);
  const [filter, setFilter] = useState<AccountFilter>('ALL');
  const [busy, setBusy] = useState('');

  const book = useMemo(() => buildCashBook(ledger, deposits, filter, from, to), [ledger, deposits, filter, from, to]);
  const remit = useMemo(() => {
    const rows = buildRemittanceSummary(ledger, filter, from, to);
    const accs = filter === 'ALL' ? ACCOUNT_ORDER : [filter];
    const line = (list: typeof rows) => ({
      cash: list.reduce((s, r) => s + r.cashCollected, 0),
      cashDep: list.reduce((s, r) => s + Math.min(r.cashDeposited, r.cashCollected), 0),
      cashPending: list.reduce((s, r) => s + r.cashPending, 0),
      upi: list.reduce((s, r) => s + r.upiCollected, 0),
      upiLate: list.filter((r) => r.upiCollected > 0 && r.upiCreditDate > r.date).length,
      total: list.reduce((s, r) => s + r.totalCollected, 0),
      remitted: list.reduce((s, r) => s + r.totalRemitted, 0),
    });
    return { perAccount: accs.map((a) => ({ a, ...line(rows.filter((r) => r.account === a)) })), all: line(rows) };
  }, [ledger, filter, from, to]);
  const input = { ledger, deposits, filter, from, to, startDate };
  const valid = !!from && !!to && from <= to;

  function run(kind: CashReportKind, format: 'pdf' | 'excel') {
    const key = `${kind}-${format}`;
    setBusy(key);
    // Let the button paint its busy state before the (synchronous) export runs.
    // The exporter (with jsPDF/xlsx) is fetched on the first export click.
    setTimeout(() => {
      import('../utils/cashBookExport')
        .then(({ exportCashReport }) => exportCashReport(kind, format, input))
        .finally(() => setBusy(''));
    }, 30);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#CDE7E7] bg-white px-4 py-3">
        <span className="text-[11.5px] font-medium text-[#5B6371]">Period</span>
        <input type="date" className={fs} value={from} min={startDate} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-[#8A93A3]">to</span>
        <input type="date" className={fs} value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" className={BTN_GRAY} onClick={() => { setFrom(monthStart(today) < startDate ? startDate : monthStart(today)); setTo(today); }}>This month</button>
        <button type="button" className={BTN_GRAY} onClick={() => { setFrom(startDate); setTo(today); }}>Since start</button>
        <span className="w-px h-6 bg-[#CDE7E7] mx-1" />
        <SegmentedToggle
          options={[{ value: 'ALL', label: 'All accounts' }, ...ACCOUNT_ORDER.map((a) => ({ value: a, label: CASH_ACCOUNTS[a].name }))]}
          value={filter}
          onChange={(v) => setFilter(v as AccountFilter)}
        />
      </div>

      {!valid && <p className="text-[12px] text-[#A5173A]">Choose a valid date range.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CASH_REPORTS.map((r) => (
          <div key={r.kind} className="rounded-2xl border border-[#CDE7E7] bg-white px-4 py-3 flex flex-col">
            <p className="text-[14px] font-semibold text-[#0B6567]">{r.title}</p>
            <p className="mt-1 text-[12px] text-[#5B6371] flex-1">{r.blurb}</p>
            <div className="mt-3 flex gap-1.5">
              <button type="button" className={BTN_GRAY} disabled={!valid || !!busy} onClick={() => run(r.kind, 'pdf')}>{busy === `${r.kind}-pdf` ? 'Preparing…' : 'PDF'}</button>
              <button type="button" className={BTN_GREEN} disabled={!valid || !!busy} onClick={() => run(r.kind, 'excel')}>{busy === `${r.kind}-excel` ? 'Preparing…' : 'Excel'}</button>
            </div>
          </div>
        ))}
      </div>

      {valid && (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.6px] text-[#5B6371]">Fee remittance overview — {formatIsoDate(from)} to {formatIsoDate(to)}</p>
          <div className={TABLE_CARD}>
            <table className="w-full text-[12.5px]">
              <thead className={THEAD}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Account</th>
                  <th className="px-3 py-2 text-right font-semibold">Cash collected</th>
                  <th className="px-3 py-2 text-right font-semibold">Cash deposited</th>
                  <th className="px-3 py-2 text-right font-semibold">Cash in hand</th>
                  <th className="px-3 py-2 text-right font-semibold">UPI credited</th>
                  <th className="px-3 py-2 text-right font-semibold">Total collected</th>
                  <th className="px-3 py-2 text-right font-semibold">Total remitted</th>
                  <th className="px-3 py-2 text-right font-semibold">Remitted</th>
                </tr>
              </thead>
              <tbody>
                {remit.perAccount.map((x) => (
                  <tr key={x.a} className="border-t border-[#EEF4F4]">
                    <td className="px-3 py-2 whitespace-nowrap">{CASH_ACCOUNTS[x.a].name} <span className="text-[11px] text-[#8A93A3]">{CASH_ACCOUNTS[x.a].number}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(x.cash)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#0A7A4B]">{rupee(x.cashDep)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${x.cashPending ? 'text-[#9A5B00]' : 'text-[#0A7A4B]'}`}>{x.cashPending ? rupee(x.cashPending) : 'Nil'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1D4ED8]">{rupee(x.upi)}{x.upiLate > 0 && <div className="text-[10.5px] text-[#5B6371]">{x.upiLate} day(s) credited later</div>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(x.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{rupee(x.remitted)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{x.total ? `${((x.remitted / x.total) * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              {remit.perAccount.length > 1 && (
                <tfoot className={TFOOT}>
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(remit.all.cash)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(remit.all.cashDep)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{remit.all.cashPending ? rupee(remit.all.cashPending) : 'Nil'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(remit.all.upi)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(remit.all.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(remit.all.remitted)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{remit.all.total ? `${((remit.all.remitted / remit.all.total) * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {valid && (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.6px] text-[#5B6371]">Cash Book preview — {filter === 'ALL' ? 'all accounts combined' : CASH_ACCOUNTS[filter].name}</p>
          <div className={`${TABLE_CARD} max-h-[460px]`}>
            <table className="w-full text-[12.5px]">
              <thead className={`${THEAD} sticky top-0 z-10`}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-right font-semibold">Opening cash</th>
                  <th className="px-3 py-2 text-right font-semibold">Cash received</th>
                  <th className="px-3 py-2 text-right font-semibold">Deposited to bank</th>
                  <th className="px-3 py-2 text-left font-semibold">Deposit ref</th>
                  <th className="px-3 py-2 text-right font-semibold">Closing cash in hand</th>
                  <th className="px-3 py-2 text-right font-semibold">UPI credited</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[#EEF4F4] bg-[#FAFCFC] text-[#5B6371]">
                  <td className="px-3 py-1.5 italic">Opening balance</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{rupee(book.opening)}</td>
                  <td colSpan={3} />
                  <td className="px-3 py-1.5 text-right tabular-nums">{rupee(book.opening)}</td>
                  <td />
                </tr>
                {book.rows.map((r) => (
                  <tr key={r.date} className="border-t border-[#EEF4F4]">
                    <td className="px-3 py-1.5 whitespace-nowrap">{formatIsoDate(r.date)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[#5B6371]">{rupee(r.opening)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.received ? rupee(r.received) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[#0A7A4B]">{r.deposited ? rupee(r.deposited) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11.5px] text-[#5B6371]">{r.depositRefs.join(', ') || '—'}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${r.closing > 0 ? 'text-[#9A5B00]' : 'text-[#0A7A4B]'}`}>{rupee(r.closing)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[#1D4ED8]">{r.upi ? rupee(r.upi) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className={TFOOT}>
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{rupee(book.totalReceived)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rupee(book.totalDeposited)}</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{rupee(book.closing)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rupee(book.totalUpi)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function CashBook() {
  const { configured, settings, overdueDays, ledger, deposits, summary, today, loading, error } = useCashInHand();
  const [tab, setTab] = useState<Tab>('hand');
  const [showSettings, setShowSettings] = useState(false);
  const [recordFor, setRecordFor] = useState<{ account: CashAccount; days: DayAccountRow[] } | null>(null);
  const [editing, setEditing] = useState<CashDeposit | null>(null);
  const [undoing, setUndoing] = useState<CashDeposit | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [upiRows, setUpiRows] = useState<DayAccountRow[] | null>(null);
  const [resetting, setResetting] = useState<DayAccountRow | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const upiThisMonth = useMemo(
    () => ledger.filter((r) => r.date >= monthStart(today)).reduce((s, r) => s + r.upiCredited, 0),
    [ledger, today],
  );

  async function confirmUndo() {
    if (!undoing) return;
    setUndoBusy(true);
    try {
      await deleteCashDeposit(undoing);
      setToast({ msg: `Deposit ${undoing.reference} undone — ${rupee(undoing.amount)} is back in cash in hand.` });
      setUndoing(null);
    } catch (err: unknown) {
      setToast({ msg: err instanceof Error ? err.message : 'Failed to undo deposit.', error: true });
    } finally {
      setUndoBusy(false);
    }
  }

  async function confirmReset() {
    if (!resetting?.upiCredit) return;
    setResetBusy(true);
    try {
      await deleteUpiCredit(resetting.upiCredit.id);
      setToast({ msg: `UPI for ${formatIsoDate(resetting.date)} reset to "credited same day".` });
      setResetting(null);
    } catch (err: unknown) {
      setToast({ msg: err instanceof Error ? err.message : 'Failed to reset.', error: true });
    } finally {
      setResetBusy(false);
    }
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="font-wp space-y-4 pb-6" style={{ animation: 'page-enter 0.22s ease-out' }}>
      {/* Header */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">SMP Admissions · Fee Collection</p>
          <h2 className="mt-1.5 text-[22px] font-bold text-[#0B6567] leading-none tracking-[-0.3px]">Cash &amp; Bank</h2>
          {configured && settings && (
            <p className="mt-1.5 text-[11.5px] text-[#5B6371]">Tracking cash since {formatIsoDate(settings.startDate)} · overdue after {overdueDays} day{overdueDays === 1 ? '' : 's'}</p>
          )}
        </div>
        {configured && (
          <>
            <div className="ml-auto">
              <SegmentedToggle
                options={[{ value: 'hand', label: 'Cash in Hand' }, { value: 'deposits', label: 'Cash Deposits' }, { value: 'upi', label: 'UPI Credits' }, { value: 'reports', label: 'Audit Reports' }]}
                value={tab}
                onChange={(v) => setTab(v as Tab)}
              />
            </div>
            <button type="button" className={BTN_GRAY} onClick={() => setShowSettings(true)} title="Cash tracking settings">⚙ Settings</button>
          </>
        )}
      </div>

      {error && <p className="rounded-lg bg-[#FFF1F3] border border-[#E11D48]/30 px-3 py-2 text-[12px] text-[#A5173A]">{error}</p>}

      {!configured ? (
        <div className="max-w-2xl rounded-2xl border border-[#CDE7E7] bg-white px-5 py-4">
          <p className="text-[15px] font-semibold text-[#0B6567]">Start tracking cash in hand</p>
          <p className="mt-1 mb-4 text-[12.5px] text-[#5B6371]">
            Cash collected at the counter stays in hand until it is deposited to the bank. This page reminds you what is pending,
            lets you record each deposit with its challan number, and produces audit reports. UPI is credited directly to the bank and needs no action.
          </p>
          <SettingsForm initialStart={today} initialOverdue={DEFAULT_OVERDUE_DAYS} firstRun />
        </div>
      ) : (
        <>
          {tab === 'hand' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Tile label="Total cash in hand" value={summary.total ? rupee(summary.total) : 'Nil'}
                  tone={summary.total === 0 ? 'green' : summary.isOverdue ? 'red' : 'amber'}
                  sub={summary.oldestDate ? `Oldest from ${formatIsoDate(summary.oldestDate)} · ${summary.daysHeld} day${summary.daysHeld === 1 ? '' : 's'}${summary.isOverdue ? ' — OVERDUE' : ''}` : 'Everything deposited'} />
                {ACCOUNT_ORDER.map((a) => (
                  <Tile key={a} label={`${CASH_ACCOUNTS[a].name} cash pending`} value={summary.byAccount[a].pending ? rupee(summary.byAccount[a].pending) : 'Nil'}
                    tone={summary.byAccount[a].pending ? 'amber' : 'green'}
                    sub={summary.byAccount[a].oldestDate ? `${summary.byAccount[a].pendingDays} day(s) since ${formatIsoDate(summary.byAccount[a].oldestDate!)}` : `A/c ${CASH_ACCOUNTS[a].number}`} />
                ))}
                <Tile label="UPI credited this month" value={rupee(upiThisMonth)} tone="blue" sub="Directly to bank — no deposit needed" />
              </div>

              {summary.upiMismatchCount > 0 && (
                <p className="rounded-xl bg-[#FFF1F3] border border-[#E11D48]/30 px-4 py-2.5 text-[12.5px] text-[#A5173A]">
                  <b>{summary.upiMismatchCount} UPI day{summary.upiMismatchCount === 1 ? '' : 's'}</b> changed after the credit date was set (receipt added/edited/deleted).
                  {' '}<button type="button" className="underline font-semibold cursor-pointer" onClick={() => setTab('upi')}>Review UPI credits</button>
                </p>
              )}

              {summary.mismatchCount > 0 && (
                <p className="rounded-xl bg-[#FFF1F3] border border-[#E11D48]/30 px-4 py-2.5 text-[12.5px] text-[#A5173A]">
                  <b>{summary.mismatchCount} collection day{summary.mismatchCount === 1 ? '' : 's'}</b> now show less cash than was deposited — a receipt was edited or deleted after its deposit.
                  {' '}<button type="button" className="underline font-semibold cursor-pointer" onClick={() => setTab('deposits')}>Review deposits</button>
                </p>
              )}

              {ACCOUNT_ORDER.map((a) => (
                <AccountPendingSection key={a} account={a} rows={ledger} today={today} overdueDays={overdueDays}
                  onRecord={(account, days) => setRecordFor({ account, days })} />
              ))}

              <UpiCredits ledger={ledger} today={today} onOpen={() => setTab('upi')} />
            </div>
          )}

          {tab === 'deposits' && (
            <DepositsTab deposits={deposits} ledger={ledger} startDate={settings?.startDate ?? ''} onEdit={setEditing} onUndo={setUndoing} />
          )}

          {tab === 'upi' && (
            <UpiCreditsTab ledger={ledger} onSet={setUpiRows} onReset={setResetting} />
          )}

          {tab === 'reports' && settings && (
            <ReportsTab ledger={ledger} deposits={deposits} startDate={settings.startDate} today={today} />
          )}
        </>
      )}

      {showSettings && settings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSettings(false)} aria-hidden="true" />
          <div className="font-wp relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-[#CDE7E7] px-5 py-4" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <p className="mb-3 text-[15px] font-semibold text-[#0B6567]">Cash tracking settings</p>
            <SettingsForm initialStart={settings.startDate} initialOverdue={overdueDays} onDone={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      {recordFor && (
        <RecordDepositModal
          mode="create"
          account={recordFor.account}
          days={recordFor.days}
          onClose={() => setRecordFor(null)}
          onSaved={(msg) => { setRecordFor(null); setToast({ msg }); }}
        />
      )}

      {editing && (
        <RecordDepositModal
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setToast({ msg }); }}
        />
      )}

      {upiRows && (
        <UpiCreditModal
          rows={upiRows}
          onClose={() => setUpiRows(null)}
          onSaved={(msg) => { setUpiRows(null); setToast({ msg }); }}
        />
      )}

      <Modal
        open={!!resetting}
        title="Reset UPI credit date?"
        variant="danger"
        confirmLabel="Yes, reset"
        loading={resetBusy}
        onConfirm={() => void confirmReset()}
        onCancel={() => { if (!resetBusy) setResetting(null); }}
        message={resetting && (
          <p>
            The saved credit date{resetting.upiCredit?.reference ? ` and UTR ${resetting.upiCredit.reference}` : ''} for UPI collected on <b>{formatIsoDate(resetting.date)}</b> ({CASH_ACCOUNTS[resetting.account].name})
            will be removed, and it will be treated as credited on the collection day.
          </p>
        )}
      />

      <Modal
        open={!!undoing}
        title="Undo this deposit?"
        variant="danger"
        confirmLabel="Yes, undo"
        loading={undoBusy}
        onConfirm={() => void confirmUndo()}
        onCancel={() => { if (!undoBusy) setUndoing(null); }}
        message={undoing && (
          <p>
            The deposit of <b>{rupee(undoing.amount)}</b> to <b>{CASH_ACCOUNTS[undoing.account].name}</b> on <b>{formatIsoDate(undoing.depositDate)}</b> (ref {undoing.reference}) will be deleted,
            and cash collected on {undoing.collectionDates.map(formatIsoDate).join(', ')} will show as cash in hand again.
          </p>
        )}
      />

      {toast && (
        <div className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-[12.5px] shadow-lg ${toast.error ? 'bg-[#FFF1F3] border-[#E11D48]/30 text-[#A5173A]' : 'bg-white border-[#0FA968]/30 text-[#0A7A4B]'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
