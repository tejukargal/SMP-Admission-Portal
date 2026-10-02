import { useNavigate } from 'react-router-dom';
import { useCashInHand } from '../../contexts/CashInHandContext';
import { ACCOUNT_ORDER, CASH_ACCOUNTS } from '../../utils/cashLedger';
import { formatIsoDate } from '../../utils/formatDates';

const rupee = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function tones(overdue: boolean, clear: boolean) {
  if (clear) return { border: 'rgba(15,169,104,0.30)', bg: 'rgba(15,169,104,0.06)', ink: '#0A7A4B', dot: '#0FA968' };
  return overdue
    ? { border: 'rgba(225,29,72,0.35)', bg: '#FFF1F3', ink: '#A5173A', dot: '#E11D48' }
    : { border: 'rgba(217,119,6,0.35)', bg: '#FFF8EB', ink: '#9A5B00', dot: '#D97706' };
}

/** Cash-in-hand reminder.
 *  - `banner`: single line for the top of Collect Fee (hidden when nothing is pending).
 *  - `card`:   Dashboard card with per-account breakdown (also shows the set-up prompt). */
export function CashInHandAlert({ variant }: { variant: 'banner' | 'card' }) {
  const { enabled, configured, summary, loading } = useCashInHand();
  const navigate = useNavigate();
  if (!enabled || loading) return null;

  const pending = summary.total > 0;
  const overdue = summary.isOverdue;
  const clear = !pending && summary.mismatchCount === 0;
  const t = tones(overdue, clear);
  const go = () => navigate('/cash-book');

  if (variant === 'banner') {
    if (!configured || (!pending && summary.mismatchCount === 0)) return null;
    const parts = ACCOUNT_ORDER
      .filter((a) => summary.byAccount[a].pending > 0)
      .map((a) => `${CASH_ACCOUNTS[a].short} ${rupee(summary.byAccount[a].pending)} since ${formatIsoDate(summary.byAccount[a].oldestDate!)}`);
    return (
      <div
        className="flex-shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border px-3.5 py-2 text-[12px]"
        style={{ borderColor: t.border, background: t.bg, color: t.ink }}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${overdue ? 'animate-pulse' : ''}`} style={{ background: t.dot }} />
        {pending ? (
          <span className="min-w-0">
            <span className="font-semibold">You hold {rupee(summary.total)} cash</span>
            <span className="opacity-80"> ({parts.join(' · ')})</span>
            <span className="font-medium"> — {overdue ? `held ${summary.daysHeld} days — overdue, deposit to bank now.` : 'deposit to bank.'}</span>
          </span>
        ) : (
          <span className="font-medium">All cash deposited.</span>
        )}
        {summary.mismatchCount > 0 && (
          <span className="rounded-full border border-[#E11D48]/40 bg-white px-2 py-[2px] text-[10.5px] font-semibold text-[#A5173A]">
            {summary.mismatchCount} deposit mismatch{summary.mismatchCount === 1 ? '' : 'es'}
          </span>
        )}
        <button
          type="button"
          onClick={go}
          className="ml-auto rounded-full border bg-white px-3 py-1 text-[11.5px] font-semibold cursor-pointer hover:shadow-sm transition-shadow"
          style={{ borderColor: t.border, color: t.ink }}
        >
          Record deposit →
        </button>
      </div>
    );
  }

  // ── Dashboard card ──
  return (
    <div className="rounded-[18px] border bg-white overflow-hidden" style={{ borderColor: t.border }}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ background: t.bg }}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${overdue ? 'animate-pulse' : ''}`} style={{ background: t.dot }} />
        <p className="text-[10.5px] font-medium uppercase tracking-[0.8px]" style={{ color: t.ink }}>Cash in Hand</p>
        {configured && (
          <p className="text-[20px] font-semibold tabular-nums leading-none ml-2" style={{ color: t.ink }}>{rupee(summary.total)}</p>
        )}
        {configured && pending && (
          <span className="text-[11.5px] font-medium" style={{ color: t.ink }}>
            {overdue ? `· Overdue — held ${summary.daysHeld} days` : summary.daysHeld > 0 ? `· held ${summary.daysHeld} day${summary.daysHeld === 1 ? '' : 's'}` : '· collected today'}
          </span>
        )}
        {configured && clear && <span className="text-[11.5px] font-medium" style={{ color: t.ink }}>· All cash deposited to bank</span>}
        <button
          type="button"
          onClick={go}
          className="ml-auto rounded-full border bg-white px-3 py-1 text-[11.5px] font-semibold cursor-pointer hover:shadow-sm transition-shadow"
          style={{ borderColor: t.border, color: t.ink }}
        >
          {configured ? (pending ? 'Record deposit →' : 'Open Cash Book →') : 'Set up cash tracking →'}
        </button>
      </div>

      {!configured ? (
        <p className="px-4 py-3 text-[12px] text-[#5B6371]">
          Track cash collected until it is deposited to the bank. Choose a start date in Cash &amp; Bank to begin.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#EEF1F5]">
          {ACCOUNT_ORDER.map((a) => {
            const s = summary.byAccount[a];
            const acc = CASH_ACCOUNTS[a];
            return (
              <div key={a} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[12px] font-semibold text-[#262B35]">{acc.name} <span className="font-normal text-[#8A93A3]">· {acc.bank} {acc.number}</span></p>
                </div>
                <div className="mt-1.5 flex items-baseline gap-4 text-[12px]">
                  <span>
                    <span className="text-[#8A93A3]">Cash pending </span>
                    <span className={`font-semibold tabular-nums ${s.pending > 0 ? 'text-[#9A5B00]' : 'text-[#0A7A4B]'}`}>{s.pending > 0 ? rupee(s.pending) : 'Nil'}</span>
                  </span>
                  {s.oldestDate && (
                    <span className="text-[#5B6371]">since {formatIsoDate(s.oldestDate)} ({s.pendingDays} day{s.pendingDays === 1 ? '' : 's'})</span>
                  )}
                </div>
                <p className="mt-1 text-[11.5px] text-[#5B6371]">
                  UPI credited directly today: <span className="font-medium tabular-nums text-[#1D4ED8]">{s.upiToday > 0 ? rupee(s.upiToday) : '—'}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}
      {configured && summary.mismatchCount > 0 && (
        <p className="px-4 py-2 text-[11.5px] font-medium text-[#A5173A] bg-[#FFF1F3] border-t border-[#E11D48]/20">
          {summary.mismatchCount} collection day{summary.mismatchCount === 1 ? '' : 's'} show more cash deposited than receipts now record (receipt edited/deleted after deposit). Review in Cash &amp; Bank → Deposits.
        </p>
      )}
    </div>
  );
}
