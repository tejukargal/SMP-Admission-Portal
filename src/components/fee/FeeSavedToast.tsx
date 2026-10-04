import { useEffect, useState } from 'react';
import type { FeeRecord } from '../../types';
import { SMP_FEE_HEADS } from '../../types';
import { generateSMPReceipt, generateSVKReceipt, generateAdditionalReceipt } from '../../utils/feeReceipts';

const VISIBLE_MS = 12_000;

/**
 * Confirmation shown after a fee is collected: the receipt numbers used and the
 * amount, with one-click receipt printing. Stays up while hovered.
 */
export function FeeSavedToast({ record, accent = '#0F8B8D', onClose }: {
  record: FeeRecord;
  accent?: string;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (hovered) return;
    const t = setTimeout(onClose, VISIBLE_MS);
    return () => clearTimeout(t);
  }, [hovered, onClose, record]);

  const smpTotal = SMP_FEE_HEADS.reduce((s, { key }) => s + (record.smp[key] ?? 0), 0);
  const addlTotal = record.additionalPaid.reduce((s, h) => s + h.amount, 0);
  const total = smpTotal + record.svk + addlTotal;

  const receipts = [
    record.receiptNumber && `SMP ${record.receiptNumber}`,
    record.svkReceiptNumber,
    record.additionalReceiptNumber && `Addl ${record.additionalReceiptNumber}`,
  ].filter(Boolean).join(' · ');

  const btn =
    'inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-colors hover:brightness-95';
  const btnStyle = { borderColor: `${accent}59`, color: `color-mix(in srgb, ${accent} 72%, #000)` };

  return (
    <div
      role="status"
      className="font-wp fixed bottom-5 right-5 z-[60] w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-white px-4 py-3 shadow-[0_8px_28px_rgba(18,20,26,0.14)]"
      style={{ borderColor: `${accent}40`, animation: 'content-enter 0.22s ease-out' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white"
          style={{ background: '#0FA968' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold text-[#262B35] truncate">
            Saved · ₹{total.toLocaleString('en-IN')}
          </p>
          <p className="text-[11.5px] text-[#5B6371] truncate" title={record.studentName}>{record.studentName}</p>
          {receipts && <p className="text-[11px] font-medium text-[#8A93A3] tabular-nums truncate">{receipts}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[#8A93A3] hover:bg-[#F2F4F7] cursor-pointer shrink-0"
          aria-label="Dismiss"
        >
          <svg width="9" height="9" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>
      {(smpTotal > 0 || record.svk > 0 || addlTotal > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[34px]">
          {smpTotal > 0 && <button type="button" className={btn} style={btnStyle} onClick={() => generateSMPReceipt(record)}>Print SMP</button>}
          {record.svk > 0 && <button type="button" className={btn} style={btnStyle} onClick={() => generateSVKReceipt(record)}>Print SVK</button>}
          {addlTotal > 0 && <button type="button" className={btn} style={btnStyle} onClick={() => generateAdditionalReceipt(record)}>Print Addl</button>}
        </div>
      )}
    </div>
  );
}
