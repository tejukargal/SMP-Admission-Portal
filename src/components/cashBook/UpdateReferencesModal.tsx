import { useMemo, useState } from 'react';
import { updateDepositReferences } from '../../services/cashDepositService';
import { CASH_ACCOUNTS, referenceIsStandard, referenceWithAmounts, type DayAccountRow } from '../../utils/cashLedger';
import { formatIsoDate } from '../../utils/formatDates';
import { BTN_GRAY, BTN_PRIMARY } from '../feeReports/feeReportUi';
import type { CashDeposit } from '../../types';

const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;

interface Props {
  deposits: CashDeposit[];
  ledger: DayAccountRow[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}

/** One-off tidy-up for deposits recorded before the reference prefill carried amounts:
 *  previews old → new reference for each, and writes only the ticked rows on confirm. */
export function UpdateReferencesModal({ deposits, ledger, onClose, onSaved }: Props) {
  const { rows, skipped } = useMemo(() => {
    const out: { deposit: CashDeposit; reference: string }[] = [];
    let skip = 0;
    for (const d of [...deposits].sort((a, b) => a.depositDate.localeCompare(b.depositDate) || a.createdAt.localeCompare(b.createdAt))) {
      const next = referenceWithAmounts(d, ledger);
      if (next) out.push({ deposit: d, reference: next.reference });
      else if (!referenceIsStandard(d, ledger)) skip += 1;
    }
    return { rows: out, skipped: skip };
  }, [deposits, ledger]);

  const [ticked, setTicked] = useState<Set<string>>(() => new Set(rows.map((r) => r.deposit.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const chosen = rows.filter((r) => ticked.has(r.deposit.id));
  const allTicked = rows.length > 0 && chosen.length === rows.length;

  function toggle(id: string) {
    setTicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function apply() {
    setSaving(true);
    setError('');
    try {
      await updateDepositReferences(chosen.map((r) => ({ id: r.deposit.id, reference: r.reference })));
      onSaved(`${chosen.length} deposit reference${chosen.length === 1 ? '' : 's'} updated to the standard pre-fill.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update references.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
      <div className="absolute inset-0 bg-black/40" onClick={() => { if (!saving) onClose(); }} aria-hidden="true" />
      <div className="font-wp relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-[#CDE7E7]" style={{ animation: 'modal-enter 0.25s ease-out' }}>
        <div className="px-5 py-4 border-b border-[#CDE7E7] bg-[#F2FAFA]">
          <p className="text-[10px] font-medium uppercase tracking-[1px] text-[#8A93A3]">Cash deposits</p>
          <h3 className="mt-1 text-[16px] font-bold text-[#0B6567]">Update references to pre-fill</h3>
          <p className="text-[11.5px] text-[#5B6371]">
            Replaces each earlier deposit’s reference with the standard pre-fill, e.g. “SBI Challan - Aided Rs.12,500”.
            <b className="text-[#A5173A]"> Text typed before (including challan / UTR numbers) is overwritten and cannot be undone.</b> Untick any you want to keep as they are.
          </p>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 text-[12.5px]">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-[#8A93A3]">All deposit references already match the standard pre-fill — nothing to update.</p>
          ) : (
            <div className="rounded-xl border border-[#CDE7E7] overflow-hidden">
              <table className="w-full">
                <thead className="bg-[#F2FAFA] text-[#0B6567]">
                  <tr>
                    <th className="px-3 py-1.5 w-8"><input type="checkbox" checked={allTicked} onChange={() => setTicked(allTicked ? new Set() : new Set(rows.map((r) => r.deposit.id)))} /></th>
                    <th className="px-3 py-1.5 text-left font-semibold">Deposit</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Amount</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Current reference</th>
                    <th className="px-3 py-1.5 text-left font-semibold">New reference</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ deposit: d, reference }) => (
                    <tr key={d.id} className={`border-t border-[#EEF4F4] align-top ${ticked.has(d.id) ? '' : 'opacity-50'}`}>
                      <td className="px-3 py-1.5"><input type="checkbox" checked={ticked.has(d.id)} onChange={() => toggle(d.id)} /></td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{formatIsoDate(d.depositDate)}<div className="text-[10.5px] text-[#8A93A3]">{CASH_ACCOUNTS[d.account].name} · {d.depositMode}</div></td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{rupee(d.amount)}</td>
                      <td className="px-3 py-1.5 text-[#5B6371]">{d.reference || '—'}</td>
                      <td className="px-3 py-1.5 font-medium text-[#0B6567]">{reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {skipped > 0 && (
            <p className="mt-3 text-[11.5px] text-[#9A5B00]">
              {skipped} deposit{skipped === 1 ? '' : 's'} left out: the Aided / Unaided split could not be worked out from the receipts
              (e.g. days before the cash-tracking start date). Edit those by hand if needed.
            </p>
          )}
          {error && <p className="mt-3 rounded-lg bg-[#FFF1F3] border border-[#E11D48]/30 px-3 py-2 text-[12px] text-[#A5173A]">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-[#CDE7E7] bg-[#FAFCFC] flex justify-end gap-2">
          <button type="button" className={BTN_GRAY} disabled={saving} onClick={onClose}>Cancel</button>
          {rows.length > 0 && (
            <button type="button" className={BTN_PRIMARY} disabled={saving || chosen.length === 0} onClick={() => void apply()}>
              {saving ? 'Updating…' : `Update ${chosen.length} reference${chosen.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
