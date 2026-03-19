import type { FeeRecord, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

// ── Number → Words (Indian system) ───────────────────────────────────────────

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function _cvt(n: number): string {
  if (n < 20)  return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + _cvt(n % 100) : '');
}

function numToWords(n: number): string {
  n = Math.round(n);
  if (n === 0) return 'Zero Rupees Only';
  let r = '';
  if (n >= 10_000_000) { r += _cvt(Math.floor(n / 10_000_000)) + ' Crore '; n %= 10_000_000; }
  if (n >= 100_000)    { r += _cvt(Math.floor(n / 100_000))    + ' Lakh ';  n %= 100_000; }
  if (n >= 1_000)      { r += _cvt(Math.floor(n / 1_000))      + ' Thousand '; n %= 1_000; }
  if (n > 0)           { r += _cvt(n); }
  return r.trim() + ' Rupees Only';
}

// ── SMP line items ────────────────────────────────────────────────────────────

const SMP_LINES: { label: string; key: SMPFeeHead | null }[] = [
  { label: 'Admission Fee',             key: 'adm'     },
  { label: 'Tution Fee',                key: 'tuition' },
  { label: 'Reading Room Fee',          key: 'rr'      },
  { label: 'Association Fee',           key: 'ass'     },
  { label: 'Sports Fee',                key: 'sports'  },
  { label: 'Magazine Fee',              key: 'mag'     },
  { label: 'Application Fee',           key: null      },
  { label: 'Identity Card Fee',         key: 'idCard'  },
  { label: 'Workshop / Laboratory Fee', key: 'lab'     },
  { label: 'Batterment Fee',            key: null      },
  { label: 'Library Fee',               key: 'lib'     },
  { label: 'Caution Deposit',           key: null      },
  { label: 'Other Deposit [Develop]',   key: 'dvp'     },
  { label: 'Examination Fee',           key: null      },
  { label: 'Miscellanious Fee',         key: 'fine'    },
  { label: 'Fee Balance',               key: null      },
  { label: 'S.W.F.',                    key: 'swf'     },
  { label: 'T.W.F.',                    key: 'twf'     },
  { label: 'N.S.S.',                    key: 'nss'     },
];

// ── SMP: one copy HTML fragment ───────────────────────────────────────────────

function buildSMPCopy(record: FeeRecord, copyLabel: string): string {
  const date  = formatDate(record.date);
  const total = (SMP_FEE_HEADS as { key: SMPFeeHead }[]).reduce((s, { key }) => s + (record.smp[key] ?? 0), 0);
  const words = numToWords(total);

  const itemRows = SMP_LINES.map((line, i) => {
    const amt = line.key ? (record.smp[line.key] ?? 0) : 0;
    const amtCell = amt > 0 ? amt : '<span class="amt-dots">....</span>';
    return `<div class="fee-row">
        <div class="fc-part"><span class="rn">${i + 1}</span><span class="item-name">${line.label}</span><span class="dots"> ....</span></div>
        <div class="fc-amt">${amtCell}</div>
        <div class="fc-rem"></div>
      </div>`;
  }).join('');

  return `<div class="copy">
    <div class="copy-tag">${copyLabel}</div>

    <div class="hdr">
      <div class="inst">SANJAY&nbsp;&nbsp;MEMORIAL&nbsp;&nbsp;POLYTECHNIC</div>
      <div class="addr">Ikkeri Road,&nbsp;&nbsp;SAGAR &ndash; 577401</div>
      <div class="rbox-wrap"><span class="rbox">RECEIPT</span></div>
    </div>

    <div class="meta">
      <span class="meta-no">No.&nbsp;&nbsp;<span class="rno">${esc(record.receiptNumber || '\u2014')}</span></span>
      <span class="meta-date">Date<span class="date-dl">&nbsp;<span class="bval">${esc(date)}</span>&nbsp;</span></span>
    </div>

    <div class="field-row name-field">
      <span class="field-lbl">Name</span><span class="name-dl">&nbsp;<span class="bval">${esc(record.studentName)}</span>&nbsp;</span>
    </div>

    <div class="field-row class-field">
      <span class="cls-group"><span class="field-lbl">Class</span><span class="class-dl">&nbsp;<span class="bval">${esc(record.year)}</span>&nbsp;</span></span>
      <span class="cls-group"><span class="field-lbl">Section</span><span class="sec-dl">&nbsp;<span class="bval">${esc(record.course)}&nbsp;(${esc(record.admCat === 'SNQ' ? 'SNQ' : record.admType)})</span>&nbsp;</span></span>
    </div>

    <div class="fee-wrap">
      <div class="fee-head">
        <div class="fc-part">PARTICULARS</div>
        <div class="fc-amt">AMOUNT</div>
        <div class="fc-rem">REMARKS</div>
      </div>
      <div class="fee-body">
        ${itemRows}
        <div class="fee-row total-row">
          <div class="fc-part total-lbl">TOTAL Rs. &hellip;&hellip;</div>
          <div class="fc-amt total-val">${total > 0 ? total : ''}</div>
          <div class="fc-rem"></div>
        </div>
      </div>
    </div>

    <div class="words-row">
      <span class="field-lbl">Rupees (in words)</span><span class="words-dl">&nbsp;<span class="wval">${esc(words)}</span>&nbsp;</span>
    </div>
    <div class="words-row words-line2"><span class="words-ul">&nbsp;</span></div>

    <div class="sig-space"></div>
    <div class="sig">Receiving Clerk</div>
  </div>`;
}

// ── SMP Receipt: A4 landscape, 2 copies side by side ─────────────────────────

export function generateSMPReceipt(record: FeeRecord): void {
  const studentCopy = buildSMPCopy(record, 'STUDENT COPY');
  const officeCopy  = buildSMPCopy(record, 'OFFICE COPY');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SMP Receipt \u2013 ${esc(record.studentName)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; padding: 0; width: 297mm; height: 210mm; }
  * { box-sizing: border-box; }

  body { font-family: 'Times New Roman', Times, serif; font-size: 9pt; color: #000; background: #fff; }

  /* ── Two-up sheet ── */
  .sheet { width: 297mm; height: 210mm; display: flex; flex-direction: row; }

  /* ── One copy: exactly half the page, full height ── */
  .copy {
    width: 148.5mm;
    height: 210mm;
    padding: 4mm 5.5mm 3mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .copy:first-child { border-right: 1.2pt dashed #999; }

  /* ── Copy label ── */
  .copy-tag {
    font-size: 6.5pt; font-weight: bold; letter-spacing: 1pt; color: #666;
    text-align: center; text-transform: uppercase; font-family: Arial, sans-serif;
    border-bottom: 0.4pt solid #ccc; padding-bottom: 1.5pt; margin-bottom: 2pt;
    flex-shrink: 0;
  }

  /* ── Header ── */
  .hdr { text-align: center; flex-shrink: 0; margin-bottom: 1pt; }
  .inst { font-size: 14.5pt; font-weight: bold; letter-spacing: 1pt; line-height: 1.2; }
  .addr { font-size: 8.5pt; margin-top: 1pt; letter-spacing: 0.3pt; }
  .rbox-wrap { margin-top: 2pt; }
  .rbox {
    display: inline-block;
    border: 2pt solid #000;
    padding: 1pt 18pt;
    font-size: 11.5pt;
    font-weight: bold;
    letter-spacing: 3pt;
  }

  /* ── No. / Date ── */
  .meta {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 9pt; margin: 3pt 0 1.5pt; flex-shrink: 0;
  }
  /* Receipt number: large, bold, red — matching the stamped "901" in the sample */
  .rno { font-size: 15pt; font-weight: bold; color: #bb0000; }

  /* ── Field rows: use full width, aligned with table below ── */
  .field-row { font-size: 9pt; flex-shrink: 0; display: flex; align-items: baseline; }
  .field-lbl { flex-shrink: 0; }
  .name-field { margin: 1.5pt 0; }
  .class-field { margin: 1.5pt 0 2.5pt; }

  /* Date underline */
  .date-dl {
    display: inline-block; border-bottom: 0.7pt dotted #444;
    min-width: 55pt; vertical-align: bottom; padding: 0 2pt;
  }
  /* Name: flex-1 so it fills to the right edge — aligns with table width */
  .name-dl {
    flex: 1; border-bottom: 0.7pt dotted #444;
    vertical-align: bottom; padding: 0 2pt;
  }
  /* Class & Section: each group is flex:1 so both halves are exactly equal width */
  .cls-group {
    flex: 1; display: flex; align-items: baseline; min-width: 0;
  }
  .class-dl, .sec-dl {
    flex: 1; border-bottom: 0.7pt dotted #444;
    padding: 0 2pt; min-width: 0;
  }

  /* Bold + slightly larger for key filled values */
  .bval { font-weight: bold; font-size: 10.5pt; }

  /* ── Fee table — fills ALL remaining vertical space ── */
  /* NO left/right outer border — only top (above header), bottom (below total),
     and internal column dividers, matching the original sample format */
  .fee-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  /* Column header row: top + bottom border, no left/right */
  .fee-head {
    display: flex;
    flex-shrink: 0;
    border-top: 0.8pt solid #000;
    border-bottom: 0.8pt solid #000;
  }
  .fee-head .fc-part,
  .fee-head .fc-amt,
  .fee-head .fc-rem {
    font-weight: bold;
    font-size: 8pt;
    text-align: center;
    justify-content: center;
    padding: 2.5pt 3pt;
  }

  /* Fee rows body — fills remaining space in fee-wrap */
  .fee-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* Each row: equal share — NO horizontal borders between items */
  .fee-row {
    flex: 1;
    display: flex;
    align-items: stretch;
    min-height: 0;
  }

  /* Total row: top border + bottom border, no left/right */
  .total-row {
    border-top: 0.8pt solid #000;
    border-bottom: 0.8pt solid #000;
  }

  /* ── Column cells ── */
  /* PARTICULARS: no left border (open left edge) */
  .fc-part {
    flex: 1;
    display: flex;
    align-items: center;
    border-right: 0.8pt solid #000;
    padding: 0 4pt;
    font-size: 8.5pt;
    overflow: hidden;
  }
  /* AMOUNT */
  .fc-amt {
    width: 46pt; flex-shrink: 0;
    display: flex; align-items: center; justify-content: flex-end;
    border-right: 0.8pt solid #000;
    padding: 0 3pt;
    font-size: 8.5pt;
  }
  /* REMARKS: no right border (open right edge) */
  .fc-rem {
    width: 48pt; flex-shrink: 0;
    display: flex; align-items: center;
    padding: 0 3pt;
    font-size: 8.5pt;
  }

  /* Within each PARTICULARS cell: # | name (flex, stretches) | dots (right) */
  .rn        { flex-shrink: 0; min-width: 14pt; font-size: 8.5pt; }
  .item-name { flex: 1; font-size: 8.5pt; }
  .dots      { flex-shrink: 0; color: #444; font-size: 8.5pt; margin-left: 2pt; }

  /* Total row */
  .total-lbl { justify-content: flex-end !important; font-weight: bold; font-size: 9pt; }
  .total-val { font-weight: bold; font-size: 9pt; }

  /* Dots shown in AMOUNT column when no fee is collected for that head */
  .amt-dots { color: #555; font-size: 8.5pt; }

  /* ── Rupees in words — also spans full width ── */
  .words-row { font-size: 9pt; flex-shrink: 0; margin-top: 3pt; display: flex; align-items: baseline; }
  .words-line2 { margin-top: 2pt; }
  .words-dl {
    flex: 1; border-bottom: 0.7pt dotted #444;
    padding: 0 2pt; vertical-align: bottom;
  }
  .words-ul {
    display: block; border-bottom: 0.7pt dotted #444;
    width: 100%; min-height: 9pt;
  }
  /* Words value: bold and slightly larger */
  .wval { font-weight: bold; font-size: 10.5pt; }

  /* ── Signature area ── */
  /* Blank space above the clerk label — room for handwritten signature */
  .sig-space { flex-shrink: 0; height: 20pt; }
  .sig {
    text-align: right; flex-shrink: 0;
    font-style: italic; font-weight: bold; font-size: 10pt;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="sheet">
  ${studentCopy}
  ${officeCopy}
</div>
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

// ── Additional Fee: one copy HTML fragment ────────────────────────────────────

function buildAdditionalCopy(record: FeeRecord, copyLabel: string): string {
  const date  = formatDate(record.date);
  const items = record.additionalPaid.filter((h) => h.amount > 0);
  const total = items.reduce((s, h) => s + h.amount, 0);
  const words = numToWords(total);

  const itemRows = items.map((h, i) => `<tr>
        <td class="col-part"><span class="rn">${i + 1}</span>${esc(h.label)}<span class="dots"> ....</span></td>
        <td class="col-amt">${h.amount}</td>
        <td class="col-rem"></td>
      </tr>`).join('');

  return `<div class="copy">
    <div class="copy-tag">${copyLabel}</div>

    <div class="hdr">
      <div class="inst">SANJAY&nbsp;&nbsp;MEMORIAL&nbsp;&nbsp;POLYTECHNIC</div>
      <div class="addr">Ikkeri Road,&nbsp;&nbsp;SAGAR &ndash; 577401</div>
      <div class="rbox-wrap"><span class="rbox">ADDITIONAL FEE RECEIPT</span></div>
    </div>

    <div class="meta">
      <span class="meta-no">No.&nbsp;&nbsp;<span class="rno">${esc(record.additionalReceiptNumber || '\u2014')}</span></span>
      <span class="meta-date">Date<span class="date-dl">&nbsp;<span class="bval">${esc(date)}</span>&nbsp;</span></span>
    </div>

    <div class="field-row name-field">
      <span class="field-lbl">Name</span><span class="name-dl">&nbsp;<span class="bval">${esc(record.studentName)}</span>&nbsp;</span>
    </div>

    <div class="field-row class-field">
      <span class="cls-group"><span class="field-lbl">Class</span><span class="class-dl">&nbsp;<span class="bval">${esc(record.year)}</span>&nbsp;</span></span>
      <span class="cls-group"><span class="field-lbl">Section</span><span class="sec-dl">&nbsp;<span class="bval">${esc(record.course)}&nbsp;(${esc(record.admCat === 'SNQ' ? 'SNQ' : record.admType)})</span>&nbsp;</span></span>
    </div>

    <table class="fee-table">
      <thead>
        <tr>
          <th class="col-part">PARTICULARS</th>
          <th class="col-amt">AMOUNT</th>
          <th class="col-rem">REMARKS</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td class="col-part total-lbl">TOTAL Rs. &hellip;&hellip;</td>
          <td class="col-amt total-val">${total > 0 ? total : ''}</td>
          <td class="col-rem"></td>
        </tr>
      </tfoot>
    </table>

    <div class="flex-spacer"></div>

    <div class="words-row">
      <span class="field-lbl">Rupees (in words)</span><span class="words-dl">&nbsp;<span class="wval">${esc(words)}</span>&nbsp;</span>
    </div>
    <div class="words-row words-line2"><span class="words-ul">&nbsp;</span></div>

    <div class="sig-space"></div>
    <div class="sig">Receiving Clerk</div>
  </div>`;
}

// ── Additional Fee Receipt: A4 landscape, 2 copies side by side ───────────────

export function generateAdditionalReceipt(record: FeeRecord): void {
  const studentCopy = buildAdditionalCopy(record, 'STUDENT COPY');
  const officeCopy  = buildAdditionalCopy(record, 'OFFICE COPY');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Additional Fee Receipt \u2013 ${esc(record.studentName)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; padding: 0; width: 297mm; height: 210mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 9pt; color: #000; background: #fff; }
  .sheet { width: 297mm; height: 210mm; display: flex; flex-direction: row; }
  .copy { width: 148.5mm; height: 210mm; padding: 4mm 5.5mm 3mm; display: flex; flex-direction: column; overflow: hidden; }
  .copy:first-child { border-right: 1.2pt dashed #999; }
  .copy-tag { font-size: 6.5pt; font-weight: bold; letter-spacing: 1pt; color: #666; text-align: center; text-transform: uppercase; font-family: Arial, sans-serif; border-bottom: 0.4pt solid #ccc; padding-bottom: 1.5pt; margin-bottom: 2pt; flex-shrink: 0; }
  .hdr { text-align: center; flex-shrink: 0; margin-bottom: 1pt; }
  .inst { font-size: 14.5pt; font-weight: bold; letter-spacing: 1pt; line-height: 1.2; }
  .addr { font-size: 8.5pt; margin-top: 1pt; letter-spacing: 0.3pt; }
  .rbox-wrap { margin-top: 2pt; }
  .rbox { display: inline-block; border: 2pt solid #000; padding: 1pt 10pt; font-size: 9.5pt; font-weight: bold; letter-spacing: 1.5pt; }
  .meta { display: flex; justify-content: space-between; align-items: baseline; font-size: 9pt; margin: 3pt 0 1.5pt; flex-shrink: 0; }
  .rno { font-size: 15pt; font-weight: bold; color: #006600; }
  .field-row { font-size: 9pt; flex-shrink: 0; display: flex; align-items: baseline; }
  .field-lbl { flex-shrink: 0; }
  .name-field { margin: 1.5pt 0; }
  .class-field { margin: 1.5pt 0 2.5pt; }
  .date-dl { display: inline-block; border-bottom: 0.7pt dotted #444; min-width: 55pt; vertical-align: bottom; padding: 0 2pt; }
  .name-dl { flex: 1; border-bottom: 0.7pt dotted #444; vertical-align: bottom; padding: 0 2pt; }
  .cls-group { flex: 1; display: flex; align-items: baseline; min-width: 0; }
  .class-dl, .sec-dl { flex: 1; border-bottom: 0.7pt dotted #444; padding: 0 2pt; min-width: 0; }
  .bval { font-weight: bold; font-size: 10.5pt; }

  /* ── Fee table — uses border-collapse so column borders are continuous ── */
  .fee-table { width: 100%; border-collapse: collapse; flex-shrink: 0; font-size: 8.5pt; margin-top: 2pt; }
  .fee-table thead tr { border-top: 0.8pt solid #000; border-bottom: 0.8pt solid #000; }
  .fee-table th { font-weight: bold; font-size: 8pt; text-align: center; padding: 2.5pt 3pt; }
  .fee-table td { padding: 3pt 4pt; vertical-align: middle; font-weight: normal; }
  .fee-table tfoot .total-row { border-top: 0.8pt solid #000; border-bottom: 0.8pt solid #000; }
  /* Column separators via border-left/right on the AMOUNT column — spans all rows */
  .col-amt { width: 46pt; text-align: right; border-left: 0.8pt solid #000; border-right: 0.8pt solid #000; }
  .col-rem { width: 48pt; }
  .col-part { /* flexible remaining width */ }
  .rn { display: inline-block; min-width: 14pt; }
  .dots { color: #444; }
  .total-lbl { text-align: right; font-weight: bold; font-size: 9pt; }
  .total-val { font-weight: bold; font-size: 9pt; text-align: right; }

  /* Push words/sig to bottom */
  .flex-spacer { flex: 1; }

  .words-row { font-size: 9pt; flex-shrink: 0; margin-top: 3pt; display: flex; align-items: baseline; }
  .words-line2 { margin-top: 2pt; }
  .words-dl { flex: 1; border-bottom: 0.7pt dotted #444; padding: 0 2pt; vertical-align: bottom; }
  .words-ul { display: block; border-bottom: 0.7pt dotted #444; width: 100%; min-height: 9pt; }
  .wval { font-weight: bold; font-size: 10.5pt; }
  .sig-space { flex-shrink: 0; height: 20pt; }
  .sig { text-align: right; flex-shrink: 0; font-style: italic; font-weight: bold; font-size: 10pt; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="sheet">
  ${studentCopy}
  ${officeCopy}
</div>
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

// ── SVK: one copy HTML fragment ───────────────────────────────────────────────

function buildSVKCopy(record: FeeRecord, copyLabel: string): string {
  const date     = formatDate(record.date);
  const svkTotal = record.svk;
  const words    = numToWords(svkTotal);

  return `<div class="copy">
    <div class="copy-tag">${copyLabel}</div>
    <div class="receipt-box">

      <div class="hdr">
        <div class="inst">ಸಂಜಯ ವಿದ್ಯಾ ಕೇಂದ್ರ (R.)</div>
        <div class="sub">ಇಕ್ಕೇರಿ ರಸ್ತೆ, ಸಾಗರ &ndash; 577401, ಶಿವಮೊಗ್ಗ ಜಿಲ್ಲೆ</div>
        <div class="sub">Regd.No.: 75/80-81</div>
        <div class="rbox-wrap"><span class="rbox">ರಸೀದಿ</span></div>
      </div>

      <div class="meta">
        <span>ನಂ.&nbsp;<span class="rno">${esc(record.svkReceiptNumber || '\u2014')}</span></span>
        <span>ದಿ.&nbsp;<span class="date-ul"><span class="bval">${esc(date)}</span></span></span>
      </div>

      <div class="body">
        <div class="bline">
          <span class="blbl">ಶ್ರೀ/ ಶ್ರೀಮತಿ</span><span class="bfill"><span class="bval">${esc(record.fatherName)}</span></span>
        </div>
        <div class="bline bline-end">
          <span class="bfill"><span class="bval">${esc(record.studentName)},&nbsp;${esc(record.year)}&nbsp;&ndash;&nbsp;${esc(record.course)}&nbsp;(${esc(record.admType)})</span></span><span class="bsfx">ಇವರಿಂದ</span>
        </div>
        <div class="bline">
          <span class="blbl">ರೂಪಾಯಿ</span><span class="bfill"><span class="bval">${esc(words)}</span></span><span class="bsfx">ಮಾತ್ರ</span>
        </div>
        <div class="bline bline-plain">ಸ್ವೀಕರಿಸಲಾಗಿದೆ.</div>
      </div>

      <div class="footer">
        <div class="ft-amt-box">
          <div class="ft-amt-label">ರೂ.</div>
          <div class="ft-amt-val">${svkTotal > 0 ? svkTotal : '&mdash;'}</div>
        </div>
        <div class="ft-sig">ಹಣ ಪಡೆದವರ ಸಹಿ</div>
      </div>

    </div>
  </div>`;
}

// ── SVK Receipt: A4 portrait, 2 copies stacked ───────────────────────────────

export function generateSVKReceipt(record: FeeRecord): void {
  const studentCopy = buildSVKCopy(record, 'STUDENT COPY');
  const officeCopy  = buildSVKCopy(record, 'OFFICE COPY');

  const html = `<!DOCTYPE html>
<html lang="kn">
<head>
<meta charset="UTF-8">
<title>SVK Receipt \u2013 ${esc(record.studentName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Kannada:wght@400;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Noto Sans Kannada', 'Tunga', 'Nirmala UI', sans-serif;
    font-size: 10pt; color: #000; background: #fff;
  }

  /* ── Sheet: two stacked copies ── */
  .sheet { width: 210mm; height: 297mm; display: flex; flex-direction: column; }

  /* Each copy is exactly half the A4 page */
  .copy {
    width: 210mm; height: 148.5mm;
    padding: 5mm 8mm 4mm;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .copy:first-child { border-bottom: 1.2pt dashed #999; }

  /* Copy label */
  .copy-tag {
    font-size: 6pt; font-weight: bold; letter-spacing: 1pt; color: #666;
    text-align: center; text-transform: uppercase; font-family: Arial, sans-serif;
    border-bottom: 0.4pt solid #ccc; padding-bottom: 1pt; margin-bottom: 2.5pt;
    flex-shrink: 0;
  }

  /* Single solid border — no decorations */
  .receipt-box {
    flex: 1;
    border: 1.5pt solid #111;
    padding: 6pt 12pt 8pt;
    display: flex; flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }

  /* ── Header ── */
  .hdr { text-align: center; flex-shrink: 0; }
  .inst { font-size: 14pt; font-weight: bold; line-height: 1.3; letter-spacing: 0.3pt; }
  .sub  { font-size: 8.5pt; margin-top: 2pt; line-height: 1.5; }
  .rbox-wrap { margin-top: 5pt; }
  .rbox {
    display: inline-block;
    background: #000; color: #fff;
    padding: 2pt 22pt;
    font-size: 11pt; font-weight: bold; letter-spacing: 2pt;
  }

  /* ── No. / Date ── */
  .meta {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 10pt; flex-shrink: 0;
    padding: 4pt 0;
  }
  .rno { font-size: 22pt; font-weight: bold; color: #bb0000; line-height: 1; }
  .date-ul {
    display: inline-block; border-bottom: 0.8pt dotted #555;
    min-width: 55pt; padding: 0 3pt; vertical-align: bottom;
  }
  .bval { font-weight: bold; font-size: 11pt; }

  /* ── Body text lines — flex:1 so it fills the middle and distributes evenly ── */
  .body {
    flex: 1;
    display: flex; flex-direction: column;
    justify-content: space-evenly;
    padding: 4pt 0 2pt;
  }

  .bline {
    display: flex; align-items: baseline;
    font-size: 11pt; line-height: 1.6;
  }
  .blbl  { flex-shrink: 0; white-space: nowrap; margin-right: 5pt; }
  .bsfx  { flex-shrink: 0; white-space: nowrap; margin-left: 5pt; }
  .bfill {
    flex: 1;
    border-bottom: 0.8pt dotted #555;
    padding: 0 3pt; min-width: 30pt;
  }
  .bline-end .bfill { margin-left: 0; }
  .bline-plain { font-size: 11pt; line-height: 1.6; }

  /* ── Footer: bordered amount box (left) + signature (right) ── */
  .footer {
    display: flex; justify-content: space-between; align-items: flex-end;
    flex-shrink: 0;
  }

  /* Bordered box for amount in figures */
  .ft-amt-box {
    display: flex; align-items: center; gap: 4pt;
    border: 1.2pt solid #111;
    padding: 3pt 10pt 3pt 8pt;
    min-width: 80pt;
  }
  .ft-amt-label { font-size: 10pt; font-weight: bold; flex-shrink: 0; }
  .ft-amt-val   { font-size: 13pt; font-weight: bold; min-width: 40pt; text-align: center; }

  .ft-sig {
    font-size: 10pt; font-weight: bold;
    border-top: 0.8pt solid #111; padding-top: 2pt;
    min-width: 100pt; text-align: center;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="sheet">
  ${studentCopy}
  ${officeCopy}
</div>
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
