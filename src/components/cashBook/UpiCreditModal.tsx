import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { saveUpiCredits } from '../../services/cashDepositService';
import { CASH_ACCOUNTS, type DayAccountRow } from '../../utils/cashLedger';
import { formatIsoDate, todayIST } from '../../utils/formatDates';
import { BTN_GRAY, BTN_PRIMARY } from '../feeReports/feeReportUi';

const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const LABEL = 'block text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#5B6371] mb-1';
const INPUT = 'w-full rounded-[10px] border border-[#CDE7E7] bg-white px-3 py-2 text-[13px] text-[#262B35] focus:outline-none focus:ring-2 focus:ring-[#0F8B8D]/30 focus:border-[#0F8B8D]';

/** Set the bank credit date / UTR for one or more UPI collection days. When a single
 *  already-confirmed day is edited, its saved values pre-fill the form. */
export function UpiCreditModal({ rows, onClose, onSaved }: {
  rows: DayAccountRow[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { user } = useAuth();
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.account.localeCompare(b.account));
  const latest = sorted[sorted.length - 1]?.date ?? todayIST();
  const single = sorted.length === 1 ? sorted[0].upiCredit : null;
  const total = sorted.reduce((s, r) => s + r.upiCredited, 0);
  const today = todayIST();

  const [creditDate, setCreditDate] = useState(single?.creditDate ?? latest);
  const [reference, setReference] = useState(single?.reference ?? '');
  const [remarks, setRemarks] = useState(single?.remarks ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!user) return;
    if (!creditDate) { setError('Enter the credit date.'); return; }
    if (creditDate < latest) { setError(`Credit date cannot be before the collection day (${formatIsoDate(latest)}).`); return; }
    if (creditDate > today) { setError('Credit date cannot be in the future.'); return; }
    setSaving(true);
    setError('');
    try {
      await saveUpiCredits(
        sorted.map((r) => ({ account: r.account, collectionDate: r.date, amount: r.upiCredited, existing: r.upiCredit ?? undefined })),
        { creditDate, reference: reference.trim(), remarks: remarks.trim(), createdBy: user.uid, createdByEmail: user.email ?? undefined },
      );
      onSaved(`UPI ${rupee(total)} marked as credited on ${formatIsoDate(creditDate)}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
      <div className="absolute inset-0 bg-black/40" onClick={() => { if (!saving) onClose(); }} aria-hidden="true" />
      <div className="font-wp relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden border border-[#1D4ED8]/20" style={{ animation: 'modal-enter 0.25s ease-out' }}>
        <div className="px-5 py-4 border-b border-[#1D4ED8]/15 bg-[#F3F7FF]">
          <p className="text-[10px] font-medium uppercase tracking-[1px] text-[#8A93A3]">UPI bank credit</p>
          <h3 className="mt-1 text-[16px] font-bold text-[#1D4ED8]">Set credit date &amp; reference</h3>
          <p className="text-[11.5px] text-[#5B6371]">Use when the bank credited/settled UPI on a later day than it was collected.</p>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4 text-[13px]">
          <div className="rounded-xl border border-[#1D4ED8]/15 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-[#F3F7FF] text-[#1D4ED8]">
                <tr>
                  <th className="px-3 py-1.5 text-left font-semibold">UPI collected on</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Account</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.key} className="border-t border-[#EEF1F5]">
                    <td className="px-3 py-1.5">{formatIsoDate(r.date)}</td>
                    <td className="px-3 py-1.5">{CASH_ACCOUNTS[r.account].name} <span className="text-[#8A93A3]">{CASH_ACCOUNTS[r.account].number}</span></td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{rupee(r.upiCredited)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#EAF1FF] text-[#1D4ED8] font-semibold">
                <tr><td className="px-3 py-1.5" colSpan={2}>Total</td><td className="px-3 py-1.5 text-right tabular-nums">{rupee(total)}</td></tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Credited to bank on *</label>
              <input type="date" className={INPUT} value={creditDate} min={latest} max={today} onChange={(e) => setCreditDate(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>UTR / settlement ref</label>
              <input className={INPUT} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Remarks</label>
            <input className={INPUT} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional — e.g. weekend settlement" />
          </div>
          {error && <p className="rounded-lg bg-[#FFF1F3] border border-[#E11D48]/30 px-3 py-2 text-[12px] text-[#A5173A]">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-[#CDE7E7] bg-[#FAFCFC] flex justify-end gap-2">
          <button type="button" className={BTN_GRAY} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save credit date'}</button>
        </div>
      </div>
    </div>
  );
}
