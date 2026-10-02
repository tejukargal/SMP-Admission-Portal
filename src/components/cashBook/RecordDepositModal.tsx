import { useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { addCashDeposit, updateCashDeposit } from '../../services/cashDepositService';
import { CASH_ACCOUNTS, type DayAccountRow } from '../../utils/cashLedger';
import { formatIsoDate, todayIST } from '../../utils/formatDates';
import { BTN_GRAY, BTN_PRIMARY, fs } from '../feeReports/feeReportUi';
import type { CashAccount, CashDeposit, CashDepositMode } from '../../types';

const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
const MODES: CashDepositMode[] = ['Challan', 'CDM', 'Other'];
const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const LABEL = 'block text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#5B6371] mb-1';
const INPUT = 'w-full rounded-[10px] border border-[#CDE7E7] bg-white px-3 py-2 text-[13px] text-[#262B35] focus:outline-none focus:ring-2 focus:ring-[#0F8B8D]/30 focus:border-[#0F8B8D]';

type Props =
  | { mode: 'create'; account: CashAccount; days: DayAccountRow[]; existing?: undefined; onClose: () => void; onSaved: (msg: string) => void }
  | { mode: 'edit'; existing: CashDeposit; account?: undefined; days?: undefined; onClose: () => void; onSaved: (msg: string) => void };

/** Record a cash deposit for the ticked collection days, or edit the bank-side details
 *  (date, mode, reference, slip, remarks) of an existing deposit. Two steps: form → confirm. */
export function RecordDepositModal(props: Props) {
  const { user } = useAuth();
  const isEdit = props.mode === 'edit';
  const account: CashAccount = isEdit ? props.existing.account : props.account;
  const acc = CASH_ACCOUNTS[account];

  const amountByDate = useMemo<Record<string, number>>(() => {
    if (isEdit) return props.existing.amountByDate;
    return Object.fromEntries(props.days.map((d) => [d.date, d.pending]));
  }, [isEdit, props.existing, props.days]);
  const dates = Object.keys(amountByDate).sort();
  const amount = Object.values(amountByDate).reduce((s, n) => s + n, 0);
  const latestDay = dates[dates.length - 1] ?? '';
  const today = todayIST();

  const [depositDate, setDepositDate] = useState(isEdit ? props.existing.depositDate : today);
  const [depositMode, setDepositMode] = useState<CashDepositMode>(isEdit ? props.existing.depositMode : 'Challan');
  const [reference, setReference] = useState(isEdit ? props.existing.reference : '');
  const [remarks, setRemarks] = useState(isEdit ? props.existing.remarks : '');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [removeSlip, setRemoveSlip] = useState(false);
  const [showDenoms, setShowDenoms] = useState(!!props.existing?.denominations);
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(props.existing?.denominations ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const denomTotal = DENOMS.reduce((s, d) => s + d * (Number(counts[d]) || 0), 0);
  const denominations = showDenoms
    ? Object.fromEntries(DENOMS.filter((d) => (Number(counts[d]) || 0) > 0).map((d) => [String(d), Number(counts[d])]))
    : undefined;

  function validate(): string {
    if (dates.length === 0 || amount <= 0) return 'Select at least one collection day with pending cash.';
    if (!depositDate) return 'Enter the deposit date.';
    if (depositDate < latestDay) return `Deposit date cannot be before the last collection day (${formatIsoDate(latestDay)}).`;
    if (depositDate > today) return 'Deposit date cannot be in the future.';
    if (!reference.trim()) return 'Enter the challan / CDM / UTR reference number.';
    if (slipFile && slipFile.size > 5 * 1024 * 1024) return 'Slip file must be under 5 MB.';
    return '';
  }

  function next() {
    const msg = validate();
    setError(msg);
    if (!msg) setStep('confirm');
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await updateCashDeposit(
          props.existing,
          { depositDate, depositMode, reference: reference.trim(), remarks: remarks.trim(), denominations },
          { slipFile, removeSlip },
        );
        props.onSaved('Deposit updated.');
      } else {
        await addCashDeposit({
          account,
          depositDate,
          collectionDates: dates,
          amountByDate,
          amount,
          depositMode,
          reference: reference.trim(),
          denominations,
          remarks: remarks.trim(),
          createdBy: user.uid,
          createdByEmail: user.email ?? undefined,
        }, slipFile);
        props.onSaved(`${rupee(amount)} recorded as deposited to ${acc.name}. Cash in hand updated.`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save deposit.');
      setStep('form');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
      <div className="absolute inset-0 bg-black/40" onClick={() => { if (!saving) props.onClose(); }} aria-hidden="true" />
      <div className="font-wp relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden border border-[#CDE7E7]" style={{ animation: 'modal-enter 0.25s ease-out' }}>
        <div className="px-5 py-4 border-b border-[#CDE7E7] bg-[#F2FAFA]">
          <p className="text-[10px] font-medium uppercase tracking-[1px] text-[#8A93A3]">{isEdit ? 'Edit deposit' : 'Record cash deposit'}</p>
          <h3 className="mt-1 text-[16px] font-bold text-[#0B6567]">{acc.name} · {acc.bank}</h3>
          <p className="text-[11.5px] text-[#5B6371] tabular-nums">A/c {acc.number} — {acc.covers}</p>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4 text-[13px]">
          {/* Days covered */}
          <div className="rounded-xl border border-[#CDE7E7] overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-[#F2FAFA] text-[#0B6567]">
                <tr><th className="px-3 py-1.5 text-left font-semibold">Cash collected on</th><th className="px-3 py-1.5 text-right font-semibold">Amount</th></tr>
              </thead>
              <tbody>
                {dates.map((d) => (
                  <tr key={d} className="border-t border-[#EEF4F4]">
                    <td className="px-3 py-1.5">{formatIsoDate(d)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{rupee(amountByDate[d])}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#E6F4F4] text-[#0B6567] font-semibold">
                <tr><td className="px-3 py-1.5">Total to deposit</td><td className="px-3 py-1.5 text-right tabular-nums text-[14px]">{rupee(amount)}</td></tr>
              </tfoot>
            </table>
          </div>

          {step === 'form' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Deposit date *</label>
                  <input type="date" className={INPUT} value={depositDate} min={latestDay} max={today} onChange={(e) => setDepositDate(e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Deposited via</label>
                  <select className={`${fs} w-full !py-2 !text-[13px]`} value={depositMode} onChange={(e) => setDepositMode(e.target.value as CashDepositMode)}>
                    {MODES.map((m) => <option key={m} value={m}>{m === 'CDM' ? 'Cash Deposit Machine (CDM)' : m === 'Challan' ? 'Bank challan / pay-in slip' : 'Other'}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={LABEL}>Challan / CDM / UTR reference no. *</label>
                <input className={INPUT} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Challan 004512" />
              </div>
              <div>
                <label className={LABEL}>Deposit slip (photo / PDF, optional)</label>
                {isEdit && props.existing.slipUrl && !slipFile && !removeSlip ? (
                  <div className="flex items-center gap-3 text-[12px]">
                    <a href={props.existing.slipUrl} target="_blank" rel="noreferrer" className="text-[#0B6567] underline">View current slip</a>
                    <button type="button" className="text-[#A5173A] underline cursor-pointer" onClick={() => setRemoveSlip(true)}>Remove</button>
                    <label className="text-[#0B6567] underline cursor-pointer">
                      Replace<input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)} />
                    </label>
                  </div>
                ) : (
                  <input type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-[12px]" onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)} />
                )}
              </div>
              <div>
                <label className={LABEL}>Remarks</label>
                <input className={INPUT} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional — e.g. deposited by office attender" />
              </div>

              <div className="rounded-xl border border-[#CDE7E7]">
                <button type="button" className="w-full flex items-center justify-between px-3 py-2 text-[12px] font-medium text-[#0B6567] cursor-pointer" onClick={() => setShowDenoms((v) => !v)}>
                  <span>Denomination count (optional)</span>
                  <span>{showDenoms ? '−' : '+'}</span>
                </button>
                {showDenoms && (
                  <div className="px-3 pb-3">
                    <div className="grid grid-cols-3 gap-2">
                      {DENOMS.map((d) => (
                        <label key={d} className="flex items-center gap-1.5 text-[12px]">
                          <span className="w-10 text-right tabular-nums text-[#5B6371]">₹{d} ×</span>
                          <input inputMode="numeric" className={`${INPUT} !px-2 !py-1`} value={counts[d] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [d]: e.target.value.replace(/\D/g, '') }))} />
                        </label>
                      ))}
                    </div>
                    <p className={`mt-2 text-[12px] font-medium tabular-nums ${denomTotal === amount ? 'text-[#0A7A4B]' : 'text-[#9A5B00]'}`}>
                      Counted {rupee(denomTotal)} {denomTotal === amount ? '✓ matches' : `— differs by ${rupee(Math.abs(amount - denomTotal))}`}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-[#0F8B8D]/30 bg-[#0F8B8D]/[0.05] px-4 py-3 text-[13px] text-[#262B35] leading-relaxed">
              {isEdit ? 'Save changes to this deposit?' : <>Record that <b>{rupee(amount)}</b> cash collected on <b>{dates.map(formatIsoDate).join(', ')}</b> was deposited to <b>{acc.name} A/c {acc.number}</b></>}
              {' '}on <b>{formatIsoDate(depositDate)}</b> via {depositMode} (ref <b>{reference.trim()}</b>)?
              {!isEdit && <p className="mt-2 text-[12px] text-[#5B6371]">These days will be cleared from cash in hand. You can undo this later from the Deposits tab.</p>}
            </div>
          )}

          {error && <p className="rounded-lg bg-[#FFF1F3] border border-[#E11D48]/30 px-3 py-2 text-[12px] text-[#A5173A]">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-[#CDE7E7] bg-[#FAFCFC] flex justify-end gap-2">
          {step === 'form' ? (
            <>
              <button type="button" className={BTN_GRAY} onClick={props.onClose}>Cancel</button>
              <button type="button" className={BTN_PRIMARY} onClick={next}>Continue</button>
            </>
          ) : (
            <>
              <button type="button" className={BTN_GRAY} disabled={saving} onClick={() => setStep('form')}>Back</button>
              <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : isEdit ? 'Yes, save' : 'Yes, record deposit'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
