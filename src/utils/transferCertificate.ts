import type { Student } from '../types';
import { INSTITUTE_LOGO_B64 } from './instituteLogo';

export const TC_COURSE_NAMES: Record<string, string> = {
  CE: 'Civil Engineering',
  ME: 'Mechanical Engineering',
  EC: 'Electronics & Communication Engineering',
  CS: 'Computer Science & Engineering',
  EE: 'Electrical & Electronics Engineering',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numToWords(n: number): string {
  if (n <= 0) return '';
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

function yearToWords(year: number): string {
  if (year >= 2000) {
    const rem = year - 2000;
    if (rem === 0) return 'Two Thousand';
    return `Two Thousand ${numToWords(rem)}`;
  }
  if (year >= 1900) {
    const rem = year - 1900;
    if (rem === 0) return 'Nineteen Hundred';
    if (rem < 10) return `Nineteen Hundred And ${ONES[rem]}`;
    return `Nineteen ${numToWords(rem)}`;
  }
  return String(year);
}

/** Convert "DD/MM/YYYY" → "DayWords-MonthName-YearWords" */
function dobToWords(dob: string): string {
  const parts = dob.split('/');
  if (parts.length !== 3) return '';
  const day   = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year  = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return '';
  return `${numToWords(day)}-${MONTH_NAMES[month - 1] ?? ''}-${yearToWords(year)}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface TCFormData {
  tcNumber: string;
  dateOfAdmission: string;  // DD/MM/YYYY
  dateOfLeaving: string;    // DD/MM/YYYY
  semester: string;         // e.g. "6th Semester"
  lastExam: string;         // e.g. "MAY 2024"
  result: string;           // e.g. "First Class"
  duesPaid: boolean;
  concession: boolean;
  character: string;
  isDuplicate: boolean;
}

function buildTC(student: Student, data: TCFormData): string {
  const name          = esc(student.studentNameSSLC.trim());
  const fatherName    = esc(student.fatherName.trim());
  const gender        = student.gender === 'GIRL' ? 'FEMALE' : 'MALE';
  const religion      = esc(student.religion);
  const dob           = esc(student.dateOfBirth);
  const dobWords      = dobToWords(student.dateOfBirth);
  const categoryCaste = esc(`${student.category} - ${student.caste.trim()}`);
  const admissionNo   = esc(student.meritNumber.trim());
  const regNo         = esc(student.regNumber.trim());
  const courseFull    = esc(TC_COURSE_NAMES[student.course] ?? student.course);

  const tcNo       = esc(data.tcNumber);
  const dateAdm    = esc(data.dateOfAdmission);
  const dateLeave  = esc(data.dateOfLeaving);
  const semester   = esc(data.semester);
  const lastExam   = esc(data.lastExam);
  const result     = esc(data.result);
  const duesPaid   = data.duesPaid   ? 'YES' : 'NO';
  const concession = data.concession ? 'YES' : 'NO';
  const character  = esc(data.character || 'SATISFACTORY');
  const isDuplicate = data.isDuplicate;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Transfer Certificate &#8211; ${name}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    color: #000;
    background: #fff;
  }
  .page {
    border: 1.5pt solid #000;
    min-height: calc(297mm - 20mm);
    display: flex;
    flex-direction: column;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: flex-start;
    gap: 8pt;
    padding: 10pt 14pt 8pt;
    border-bottom: 2pt solid #000;
  }
  .logo-col {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .header-logo {
    width: 68pt;
    height: 68pt;
    object-fit: contain;
  }
  .inst-code {
    font-size: 9.5pt;
    margin-top: 3pt;
  }
  .header-center {
    flex: 1;
    text-align: center;
    padding-top: 2pt;
  }
  .college-name {
    font-size: 20pt;
    font-weight: bold;
    letter-spacing: 0.5pt;
    margin-bottom: 3pt;
  }
  .college-tagline {
    font-size: 8.5pt;
    margin-bottom: 8pt;
  }
  .college-address {
    font-size: 10.5pt;
    font-weight: bold;
    margin-bottom: 1pt;
  }
  .college-phone {
    font-size: 10.5pt;
  }

  /* ── Duplicate banner ── */
  .duplicate-banner {
    text-align: center;
    font-size: 11pt;
    font-weight: bold;
    letter-spacing: 3pt;
    color: #b00;
    border: 1.5pt solid #b00;
    padding: 3pt 0;
    margin: 6pt 14pt 0;
  }

  /* ── Title section ── */
  .tc-title-wrap {
    padding: 7pt 14pt 5pt;
    border-bottom: 0.75pt solid #000;
  }
  .tc-title {
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    text-decoration: underline;
    letter-spacing: 2pt;
    text-transform: uppercase;
    margin-bottom: 5pt;
  }
  .tc-no {
    font-size: 10.5pt;
  }

  /* ── Table ── */
  .tc-table {
    width: 100%;
    border-collapse: collapse;
  }
  .tc-table td {
    border: 0.75pt solid #000;
    padding: 4.5pt 8pt;
    vertical-align: middle;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  /* Remove outer edges — .page border provides the outer rectangle */
  .tc-table tr:first-child td { border-top: none; }
  .tc-table td:first-child     { border-left: none; }
  .tc-table tr td:last-child   { border-right: none; }
  .tc-table tr:last-child td   { border-bottom: none; }
  .val { font-weight: bold; }

  /* ── Footer ── */
  .tc-footer {
    padding: 16pt 14pt 36pt;
    border-top: 0.75pt solid #000;
    flex: 1;
  }
  .footer-date {
    font-size: 10.5pt;
    margin-bottom: 28pt;
  }
  .footer-sigs {
    display: flex;
    justify-content: space-between;
  }
  .footer-sigs span {
    font-size: 10.5pt;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="logo-col">
      <img class="header-logo" src="${INSTITUTE_LOGO_B64}" alt="Institute Crest" />
      <div class="inst-code">pINST CODE : 308</div>
    </div>
    <div class="header-center">
      <div class="college-name">SANJAY MEMORIAL POLYTECHNIC</div>
      <div class="college-tagline">(Approved by AICTE, New Delhi and running with Grant-In-Aid of State Govt. of Karnataka)</div>
      <div class="college-address">Ikkeri Road, Sagar - 577 401, Shivamogga Dist., Karnataka</div>
      <div class="college-phone">Phone : 08183-226034, 8971774244</div>
    </div>
  </div>

  ${isDuplicate ? '<div class="duplicate-banner">DUPLICATE COPY</div>' : ''}

  <!-- Title -->
  <div class="tc-title-wrap">
    <div class="tc-title">Transfer Certificate</div>
    <div class="tc-no">TC No. ${tcNo}</div>
  </div>

  <!-- 18-field table (6-column grid) -->
  <table class="tc-table">
    <colgroup>
      <col style="width:16.67%"><col style="width:16.67%">
      <col style="width:16.67%"><col style="width:16.67%">
      <col style="width:16.67%"><col style="width:16.67%">
    </colgroup>
    <!-- 1. Name -->
    <tr>
      <td colspan="2">1. Name of the Student :</td>
      <td colspan="4" class="val">${name}</td>
    </tr>
    <!-- 2. Father -->
    <tr>
      <td colspan="2">2. Father Name :</td>
      <td colspan="4" class="val">${fatherName}</td>
    </tr>
    <!-- 3. Gender | Nationality | Religion -->
    <tr>
      <td colspan="2">3. Gender :&nbsp; <span class="val">${gender}</span></td>
      <td colspan="2">4. Nationality :&nbsp; <span class="val">INDIAN</span></td>
      <td colspan="2">5. Religion :&nbsp; <span class="val">${religion}</span></td>
    </tr>
    <!-- 4. DOB figures + words -->
    <tr>
      <td colspan="3">6. Date of Birth (In figures &amp; Words) :&nbsp; <span class="val">${dob}</span></td>
      <td colspan="3" class="val">${dobWords}</td>
    </tr>
    <!-- 5. Category & Caste -->
    <tr>
      <td colspan="6">7. Category &amp; Caste :&nbsp; <span class="val">${categoryCaste}</span></td>
    </tr>
    <!-- 6. Date of Admission | Date of Leaving -->
    <tr>
      <td colspan="3">8. Date of Admission :&nbsp; <span class="val">${dateAdm}</span></td>
      <td colspan="3">9. Date of Leaving :&nbsp; <span class="val">${dateLeave}</span></td>
    </tr>
    <!-- 7. Class at time of leaving | Admission Number -->
    <tr>
      <td colspan="4">10. Class studying at the time of leaving :&nbsp; <span class="val">${semester}</span></td>
      <td colspan="2">11. Admission Number :&nbsp; <span class="val">${admissionNo}</span></td>
    </tr>
    <!-- 8. Register Number | Course -->
    <tr>
      <td colspan="2">12. Register Number :&nbsp; <span class="val">${regNo}</span></td>
      <td colspan="4">13. Course :&nbsp; <span class="val">${courseFull}</span></td>
    </tr>
    <!-- 9. Last Exam | Result -->
    <tr>
      <td colspan="3">14. Last Exam taken :&nbsp; <span class="val">${lastExam}</span></td>
      <td colspan="3">15. Result :&nbsp; <span class="val">${result}</span></td>
    </tr>
    <!-- 10. Dues paid | Concession -->
    <tr>
      <td colspan="3">16. Whether the student has paid all<br>institution dues :&nbsp; <span class="val">${duesPaid}</span></td>
      <td colspan="3">17. Whether the student was in<br>receipt of any concession :&nbsp; <span class="val">${concession}</span></td>
    </tr>
    <!-- 11. Character -->
    <tr>
      <td colspan="6">18. Character of the student :&nbsp; <span class="val">${character}</span></td>
    </tr>
  </table>

  <!-- Footer -->
  <div class="tc-footer">
    <div class="footer-date">Date :&nbsp; ${dateLeave}</div>
    <div class="footer-sigs">
      <span>Verified by</span>
      <span>Head of the Institution</span>
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

export function generateTransferCertificate(student: Student, data: TCFormData): void {
  const html = buildTC(student, data);
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
