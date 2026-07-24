import type { Student } from '../types';
import type { RefundPaymentType, RefundHeadLine } from '../services/refundService';

const COURSE_NAMES: Record<string, string> = {
  CE: 'Civil Engineering',
  ME: 'Mechanical Engineering',
  EC: 'Electronics & Communication Engineering',
  CS: 'Computer Science & Engineering',
  EE: 'Electrical & Electronics Engineering',
};

const PAYMENT_TYPE_LABELS: Record<RefundPaymentType, string> = {
  CHEQUE: 'Cheque',
  ACCOUNT_PAYEE_CHEQUE: 'Account Payee Cheque',
  NEFT: 'NEFT',
  CASH: 'Cash',
  UPI: 'UPI',
};

export interface SeatCancellationVoucherData {
  totalPaid: number;
  headBreakdown: RefundHeadLine[];
  refundAmount: number;
  paymentType: RefundPaymentType;
  referenceNumber: string;
  paymentDate: string;  // DD/MM/YYYY
  remarks: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDMY(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function fmtRupees(n: number): string {
  return n.toLocaleString('en-IN');
}

function buildVoucher(student: Student, data: SeatCancellationVoucherData): string {
  const name       = esc(student.studentNameSSLC.trim());
  const fatherName = esc(student.fatherName.trim());
  const courseFull = COURSE_NAMES[student.course] ?? esc(student.course);
  const prefix     = student.gender === 'GIRL' ? 'Kum.' : 'Sri.';
  const today      = fmtDMY(new Date().toISOString());

  const headRows = data.headBreakdown
    .map((h) => `
      <tr>
        <td>${esc(h.label)}</td>
        <td class="amt">₹ ${fmtRupees(h.amount)}</td>
      </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Seat Cancellation Fee Refund Voucher &#8211; ${name}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11.5pt;
    color: #000;
    background: #fff;
  }
  @media screen {
    html { background: #94a3b8; min-height: 100%; padding: 24px 0; }
    body { max-width: 720px; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.22); border-radius: 4px; padding: 20px; }
  }
  .page { min-height: calc(297mm - 16mm); display: flex; flex-direction: column; }

  /* ── Letter box (matches ANS letter minimal style) ── */
  .letter-box { border: 1.5pt solid #000; padding: 12pt 18pt 20pt; flex: 1; display: flex; flex-direction: column; }

  /* ── Header ── */
  .header { text-align: center; border-bottom: 1pt solid #000; padding-bottom: 8pt; margin-bottom: 8pt; }
  .college-name { font-size: 18pt; font-weight: bold; letter-spacing: 0.5pt; }
  .college-tagline { font-size: 8.5pt; margin: 3pt 0 2pt; }
  .college-instcode { font-size: 10pt; font-weight: bold; margin: 2pt 0; }
  .college-address { font-size: 10pt; font-weight: bold; margin: 2pt 0; }
  .college-contact { font-size: 10pt; font-weight: bold; }

  .body { flex: 1; padding-top: 10pt; display: flex; flex-direction: column; }
  .date-line { text-align: right; font-size: 11pt; margin-bottom: 10pt; }
  .title {
    text-align: center; font-size: 14pt; font-weight: bold; text-decoration: underline;
    letter-spacing: 1pt; margin-bottom: 14pt;
  }
  .subtitle { text-align: center; font-size: 10.5pt; margin-top: -8pt; margin-bottom: 16pt; color: #333; }

  .section-label {
    font-size: 10.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5pt;
    border-bottom: 1pt solid #000; padding-bottom: 2pt; margin-bottom: 6pt; margin-top: 14pt;
  }
  .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 18pt; font-size: 11pt; }
  .details-grid div span.lbl { font-weight: bold; }

  table.fee-table { width: 100%; border-collapse: collapse; margin-top: 4pt; font-size: 10.5pt; }
  table.fee-table th, table.fee-table td { border: 0.75pt solid #000; padding: 3pt 6pt; }
  table.fee-table th { background: #f0f0f0; text-align: left; }
  table.fee-table td.amt, table.fee-table th.amt { text-align: right; }
  table.fee-table tr.total-row td { font-weight: bold; background: #f7f7f7; }

  .refund-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 18pt; font-size: 11pt; margin-top: 4pt; }
  .refund-amount-line {
    margin-top: 10pt; font-size: 12.5pt; font-weight: bold; text-align: center;
    border: 1.25pt solid #000; padding: 6pt 0;
  }

  .ack-para { font-size: 10.5pt; line-height: 1.7; text-align: justify; margin-top: 16pt; }

  .sign-row { display: flex; justify-content: space-between; margin-top: 46pt; padding: 0 4pt; }
  .sign-block { text-align: center; width: 30%; }
  .sign-line { border-top: 1pt solid #000; margin-bottom: 4pt; padding-top: 3pt; font-size: 10pt; font-weight: bold; }
  .seal-watermark { width: 60pt; height: 60pt; margin: 8pt auto 0; opacity: 0.55; }

  .footer-note { margin-top: auto; padding-top: 20pt; font-size: 8.5pt; text-align: center; color: #333; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
<div class="letter-box">

  <!-- Header -->
  <div class="header">
    <div class="college-name">SANJAY MEMORIAL POLYTECHNIC</div>
    <div class="college-tagline">(Approved by A.I.C.T.E., New&#8209;Delhi, and running with Grant&#8209;in&#8209;aid of State Govt. of Karnataka)</div>
    <div class="college-instcode">[Inst. Code: 308]</div>
    <div class="college-address">Ikkeri Road, Sagar &#8211; 577 401, Shimoga Dist., Karnataka.</div>
    <div class="college-contact">Phone: 9449685992</div>
  </div>

  <!-- Body -->
  <div class="body">
    <div class="date-line">Date : ${today}</div>
    <div class="title">SEAT CANCELLATION &#8211; FEE REFUND VOUCHER</div>
    <div class="subtitle">For Accounts Department Record &amp; Audit Purposes</div>

    <div class="section-label">Student Details</div>
    <div class="details-grid">
      <div><span class="lbl">Name:</span> ${prefix} ${name}</div>
      <div><span class="lbl">Father's Name:</span> ${fatherName}</div>
      <div><span class="lbl">Course:</span> ${courseFull} (${esc(student.course)})</div>
      <div><span class="lbl">Year:</span> ${esc(student.year)}</div>
      <div><span class="lbl">Academic Year:</span> ${esc(student.academicYear)}</div>
      <div><span class="lbl">Register No.:</span> ${esc(student.regNumber || '—')}</div>
      <div><span class="lbl">Admission Category:</span> ${esc(student.admCat || '—')} (${esc(student.admType || '—')})</div>
      <div><span class="lbl">Status:</span> Seat Cancelled</div>
    </div>

    <div class="section-label">Fee Paid &#8211; Breakup</div>
    <table class="fee-table">
      <thead>
        <tr><th>Head</th><th class="amt">Amount</th></tr>
      </thead>
      <tbody>
        ${headRows || '<tr><td colspan="2" style="text-align:center;color:#666;">No fee records found</td></tr>'}
        <tr class="total-row">
          <td>Grand Total Fee Paid</td>
          <td class="amt">₹ ${fmtRupees(data.totalPaid)}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-label">Refund Details</div>
    <div class="refund-grid">
      <div><span class="lbl">Mode of Refund:</span> ${PAYMENT_TYPE_LABELS[data.paymentType]}</div>
      <div><span class="lbl">Reference / Cheque No.:</span> ${esc(data.referenceNumber || '—')}</div>
      <div><span class="lbl">Date of Refund:</span> ${esc(data.paymentDate)}</div>
      <div><span class="lbl">Remarks:</span> ${esc(data.remarks || '—')}</div>
    </div>
    <div class="refund-amount-line">Refund Amount &#8202;:&#8202; ₹ ${fmtRupees(data.refundAmount)}</div>

    <p class="ack-para">I, <strong>${name}</strong>, acknowledge that I have received the above refund amount of
      <strong>₹ ${fmtRupees(data.refundAmount)}</strong> towards the fee paid, following cancellation of my
      admission/seat at this institution, in full and final settlement, and confirm having no further
      claim against the institution in this regard.</p>

    <div class="sign-row">
      <div class="sign-block">
        <div class="sign-line">Student Signature</div>
        <svg class="seal-watermark" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="47" fill="none" stroke="#000" stroke-width="2.5"/>
        </svg>
      </div>
      <div class="sign-block">
        <div class="sign-line">Parent / Guardian Signature</div>
      </div>
      <div class="sign-block">
        <div class="sign-line">Principal</div>
      </div>
    </div>

    <div class="footer-note">This voucher is a manual record of fee refund issued for seat cancellation and is to be retained for audit and accounts verification.</div>
  </div>

</div>
</div>
<script>
  window.onload = function () {
    window.print();
    window.addEventListener('afterprint', function () { window.close(); });
  };
</script>
</body>
</html>`;
}

export function generateSeatCancellationRefundVoucher(student: Student, data: SeatCancellationVoucherData): void {
  const html = buildVoucher(student, data);
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
  } else {
    const a = document.createElement('a');
    a.href     = url;
    a.target   = '_blank';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
