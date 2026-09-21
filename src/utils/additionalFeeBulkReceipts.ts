import type { FeeRecord } from '../types';
import { formatDate, numToWords } from './feeReceipts';

// ── Local copies of feeReceipts.ts's tiny private helpers ────────────────────
// Duplicated (not imported) so this bulk-export feature never touches
// feeReceipts.ts — the existing single-receipt logic stays byte-for-byte
// unchanged.

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openHtml(html: string): void {
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// One printed entry: a record paired with the local serial number to print on
// its slip. The caller (the Additional Fee Receipts report/table) decides
// this — normally each row's position ("Sl") in the filtered report, zero-
// padded to 4 digits — so a partial print of rows 5, 12, 20 prints "0005",
// "0012", "0020", matching the report, not a fresh 0001/0002/0003 count of
// just what's selected. This never touches record.additionalReceiptNumber
// (the real database receipt number, unaffected and shown as-is elsewhere).
export interface AdditionalFeeReceiptEntry { record: FeeRecord; serial: string; }

// ── One compact copy (quarter-band height) ───────────────────────────────────
// Same field order and visual language as buildAdditionalCopy() in
// feeReceipts.ts (institute header, boxed title, dotted-underline fields,
// bordered fee table, dotted rupees-in-words line, signature) — scaled down
// to fit a quarter-page band. The fee table (.fee-wrap) stretches to fill
// whatever vertical space is left in the band, so a 1-2 item receipt still
// uses the full band instead of leaving a blank gap below the signature.

function buildCompactAdditionalCopy(record: FeeRecord, copyLabel: 'STUDENT COPY' | 'OFFICE COPY', serial: string): string {
  const date  = formatDate(record.date);
  const items = record.additionalPaid.filter((h) => h.amount > 0);
  const total = items.reduce((s, h) => s + h.amount, 0);
  const words = numToWords(total);

  const itemRows = items.map((h) => `<div class="fee-row">
        <div class="fc-part">${esc(h.label)}</div>
        <div class="fc-amt">${h.amount}</div>
      </div>`).join('');

  return `<div class="copy">
    <div class="copy-tag">${copyLabel}</div>

    <div class="hdr">
      <div class="inst">SANJAY&nbsp;MEMORIAL&nbsp;POLYTECHNIC</div>
      <div class="addr">Ikkeri Road,&nbsp;SAGAR &ndash; 577401</div>
      <div class="rbox-wrap"><span class="rbox">ADDITIONAL FEE RECEIPT</span></div>
    </div>

    <div class="meta">
      <span class="meta-no">No.&nbsp;<span class="rno">${esc(serial)}</span></span>
      <span class="meta-date">Date&nbsp;<span class="date-dl"><span class="bval">${esc(date)}</span></span></span>
    </div>

    <div class="field-row name-field">
      <span class="field-lbl">Name</span><span class="name-dl"><span class="bval">${esc(record.studentName)}</span></span>
    </div>

    <div class="field-row class-field">
      <span class="cls-group"><span class="field-lbl">Class</span><span class="class-dl"><span class="bval">${esc(record.year)}</span></span></span>
      <span class="cls-group"><span class="field-lbl">Sec</span><span class="sec-dl"><span class="bval">${esc(record.course)}&nbsp;(${esc(record.admCat === 'SNQ' ? 'SNQ' : record.admType)})</span></span></span>
    </div>

    <div class="fee-wrap">
      <div class="fee-head">
        <div class="fc-part">PARTICULARS</div>
        <div class="fc-amt">AMOUNT</div>
      </div>
      <div class="fee-body">
        ${itemRows}
        <div class="fee-row total-row">
          <div class="fc-part total-lbl">TOTAL</div>
          <div class="fc-amt total-val">${total > 0 ? total : ''}</div>
        </div>
      </div>
    </div>

    <div class="words-row">
      <span class="field-lbl">Rupees</span><span class="words-dl"><span class="wval">${esc(words)}</span></span>
    </div>

    <div class="sig-space"></div>
    <div class="sig">Receiving Clerk</div>
  </div>`;
}

// ── One A4 portrait page: up to 4 rows of Student|Office pairs ──────────────

function buildBulkPage(entries: AdditionalFeeReceiptEntry[]): string {
  const rowsHtml = entries
    .map(({ record, serial }) => `<div class="row">
      ${buildCompactAdditionalCopy(record, 'STUDENT COPY', serial)}
      ${buildCompactAdditionalCopy(record, 'OFFICE COPY', serial)}
    </div>`)
    .join('');

  // Pad with blank filler rows so every page keeps the same 4-row grid height,
  // even when the final chunk has fewer than 4 records.
  const fillerCount = Math.max(0, 4 - entries.length);
  const fillerHtml = Array.from({ length: fillerCount }, () => '<div class="row row-filler"></div>').join('');

  return `<div class="page"><div class="sheet">${rowsHtml}${fillerHtml}</div></div>`;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Prints Additional Fee receipts for many students at once, 4 students per A4
 * portrait sheet (Student Copy | Office Copy per row). Only records with a
 * non-zero additionalPaid amount are printed — callers should already filter
 * to paid records, but this is enforced here too as a safety net.
 *
 * Each entry's `serial` (the report's local numbering, e.g. its Sl No) is
 * printed as the slip's "No." as-is — this function does not invent its own
 * numbering, so the caller controls what "local serial" means.
 */
export function generateAdditionalFeeReceiptsBulk(entries: AdditionalFeeReceiptEntry[]): void {
  const paid = entries.filter(({ record }) => record.additionalPaid.some((h) => h.amount > 0));
  if (paid.length === 0) return;

  const pagesHtml = chunk(paid, 4).map(buildBulkPage).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Additional Fee Receipts (Bulk)</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 8pt; color: #000; background: #fff; }

  .page { width: 210mm; height: 297mm; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }

  .sheet { width: 210mm; height: 297mm; display: flex; flex-direction: column; }

  .row { flex: 1; display: flex; flex-direction: row; min-height: 0; }
  .row:not(:last-child) { border-bottom: 1pt dashed #999; }
  .row-filler { visibility: hidden; }

  .copy {
    width: 105mm;
    padding: 1.5mm 3mm;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    overflow: hidden;
  }
  .copy:first-child { border-right: 1pt dashed #999; }

  .copy-tag {
    font-size: 5pt; font-weight: bold; letter-spacing: 0.5pt; color: #666;
    text-align: center; text-transform: uppercase; font-family: Arial, sans-serif;
    border-bottom: 0.4pt solid #ccc; padding-bottom: 1pt; margin-bottom: 1.5pt;
    flex-shrink: 0;
  }

  .hdr { text-align: center; flex-shrink: 0; }
  .inst { font-size: 9pt; font-weight: bold; letter-spacing: 0.3pt; line-height: 1.1; }
  .addr { font-size: 6pt; margin-top: 0.5pt; }
  .rbox-wrap { margin-top: 1.5pt; }
  .rbox { display: inline-block; border: 1pt solid #000; padding: 0.5pt 6pt; font-size: 6.5pt; font-weight: bold; letter-spacing: 0.5pt; }

  .meta { display: flex; justify-content: space-between; align-items: baseline; font-size: 6.5pt; margin: 2pt 0 1pt; flex-shrink: 0; }
  .rno { font-size: 8.5pt; font-weight: bold; color: #006600; }

  .field-row { font-size: 6.5pt; flex-shrink: 0; display: flex; align-items: baseline; margin: 1pt 0; }
  .field-lbl { flex-shrink: 0; margin-right: 3pt; }
  .name-dl { flex: 1; border-bottom: 0.5pt dotted #444; padding: 0 2pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cls-group { flex: 1; display: flex; align-items: baseline; min-width: 0; }
  .cls-group:first-child { margin-right: 5pt; }
  .class-dl, .sec-dl { flex: 1; border-bottom: 0.5pt dotted #444; padding: 0 2pt; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bval { font-weight: bold; font-size: 7pt; }

  /* Grows to fill whatever vertical space is left in the band after the header,
     fields, words line and signature — so a 1-2 item receipt still uses the
     full band instead of leaving a blank gap below the signature. */
  .fee-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; margin-top: 2pt; overflow: hidden; }
  .fee-head { display: flex; flex-shrink: 0; border-top: 0.6pt solid #000; border-bottom: 0.6pt solid #000; }
  .fee-head .fc-part, .fee-head .fc-amt { font-weight: bold; font-size: 6pt; text-align: center; padding: 1pt 3pt; }
  .fee-body { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .fee-row { flex: 1; display: flex; align-items: stretch; min-height: 0; }
  .total-row { flex: 0 0 auto; border-top: 0.6pt solid #000; border-bottom: 0.6pt solid #000; margin-top: 0.5pt; padding: 1.5pt 0; }
  .fc-part { flex: 1; display: flex; align-items: center; border-right: 0.6pt solid #000; padding: 1pt 3pt; font-size: 6.5pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fc-amt { width: 32pt; flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; padding: 1pt 4pt; font-size: 7pt; }
  .total-lbl { justify-content: flex-end !important; font-weight: bold; }
  .total-val { font-weight: bold; }

  .words-row { font-size: 6pt; flex-shrink: 0; margin-top: 2pt; display: flex; align-items: baseline; gap: 3pt; }
  .words-dl { flex: 1; border-bottom: 0.5pt dotted #444; padding: 0 2pt; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wval { font-weight: bold; font-size: 6.5pt; }

  .sig-space { flex-shrink: 0; height: 16pt; }
  .sig { text-align: right; flex-shrink: 0; font-style: italic; font-weight: bold; font-size: 6.5pt; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
${pagesHtml}
<script>
  window.onload = function () {
    window.print();
    window.addEventListener('afterprint', function () { window.close(); });
  };
</script>
</body>
</html>`;

  openHtml(html);
}
