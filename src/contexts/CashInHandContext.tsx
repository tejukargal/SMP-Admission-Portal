import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { subscribeFeeRecordsSince } from '../services/feeRecordService';
import { subscribeCashDeposits, subscribeCashTrackingSettings, subscribeUpiCredits, DEFAULT_OVERDUE_DAYS } from '../services/cashDepositService';
import { buildDayLedger, cashInHandSummary, type CashSummary, type DayAccountRow } from '../utils/cashLedger';
import { todayIST } from '../utils/formatDates';
import type { CashDeposit, CashTrackingSettings, FeeRecord, UpiCredit } from '../types';

interface CashInHandValue {
  enabled: boolean;                       // admin session
  configured: boolean;                    // cut-off start date has been set
  settings: CashTrackingSettings | null;
  overdueDays: number;
  records: FeeRecord[];                   // receipts on/after the start date
  deposits: CashDeposit[];
  upiCredits: UpiCredit[];
  ledger: DayAccountRow[];
  summary: CashSummary;
  today: string;
  loading: boolean;
  error: string | null;
}

const EMPTY_SUMMARY = cashInHandSummary([], todayIST(), DEFAULT_OVERDUE_DAYS);

const CashInHandContext = createContext<CashInHandValue | null>(null);

/** One set of live listeners (settings, deposits, receipts since cut-off) shared by the
 *  header badge, Dashboard card, Collect Fee banner and the Cash Book page. Admin only. */
export function CashInHandProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const enabled = role === 'admin';

  const [settings, setSettings] = useState<CashTrackingSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [deposits, setDeposits] = useState<CashDeposit[]>([]);
  const [upiCredits, setUpiCredits] = useState<UpiCredit[]>([]);
  // Receipts tagged with the start date they were queried for, so a cut-off change
  // never shows the previous query's data.
  const [recState, setRecState] = useState<{ key: string | null; data: FeeRecord[] }>({ key: null, data: [] });
  const [error, setError] = useState<string | null>(null);
  // Re-evaluated every few minutes so "days held" / overdue roll over past midnight.
  const [today, setToday] = useState(todayIST);

  useEffect(() => {
    const id = setInterval(() => setToday(todayIST()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const unsubSettings = subscribeCashTrackingSettings(
      (s) => { setSettings(s); setSettingsLoaded(true); },
      (e) => { setError(e.message); setSettingsLoaded(true); },
    );
    const unsubDeposits = subscribeCashDeposits(setDeposits, (e) => setError(e.message));
    const unsubUpi = subscribeUpiCredits(setUpiCredits, (e) => setError(e.message));
    return () => { unsubSettings(); unsubDeposits(); unsubUpi(); };
  }, [enabled]);

  const startDate = settings?.startDate ?? null;

  useEffect(() => {
    if (!enabled || !startDate) return;
    return subscribeFeeRecordsSince(
      startDate,
      (data) => setRecState({ key: startDate, data }),
      (e) => { setError(e.message); setRecState({ key: startDate, data: [] }); },
    );
  }, [enabled, startDate]);

  const recordsLoaded = !startDate || recState.key === startDate;
  const records = useMemo(() => (recState.key === startDate ? recState.data : []), [recState, startDate]);

  const overdueDays = settings?.overdueDays ?? DEFAULT_OVERDUE_DAYS;
  const ledger = useMemo(
    () => (startDate ? buildDayLedger(records, deposits, startDate, upiCredits) : []),
    [records, deposits, startDate, upiCredits],
  );
  const summary = useMemo(
    () => (startDate ? cashInHandSummary(ledger, today, overdueDays) : EMPTY_SUMMARY),
    [ledger, today, overdueDays, startDate],
  );

  const value: CashInHandValue = {
    enabled,
    configured: !!startDate,
    settings,
    overdueDays,
    records,
    deposits,
    upiCredits,
    ledger,
    summary,
    today,
    loading: enabled && (!settingsLoaded || !recordsLoaded),
    error,
  };

  return <CashInHandContext.Provider value={value}>{children}</CashInHandContext.Provider>;
}

export function useCashInHand(): CashInHandValue {
  const ctx = useContext(CashInHandContext);
  if (!ctx) throw new Error('useCashInHand must be used inside CashInHandProvider');
  return ctx;
}
