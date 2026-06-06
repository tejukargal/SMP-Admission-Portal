import type { Student } from '../types';
import { INSTITUTE_LOGO_B64 } from './instituteLogo';

export const CCC_COURSE_NAMES: Record<string, string> = {
  CE: 'Civil Engineering',
  ME: 'Mechanical Engineering',
  EC: 'Electronics &amp; Communication Engineering',
  CS: 'Computer Science &amp; Engineering',
  EE: 'Electrical &amp; Electronics Engineering',
};

export interface CCCFormData {
  dateOfIssue: string;  // DD/MM/YYYY
  refNumber: string;    // e.g. "SMP/EXAM/2026-27/0001"
  examPeriod: string;   // e.g. "MAY-2021"
  regNumber: string;
  studyFrom: string;    // e.g. "2023-24"  — actual first-year enrollment year from DB
  studyTo: string;      // e.g. "2025-26"  — 3rd-year enrollment year
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Computes the "from" (start) academic year for the certificate body.
 * The student's academicYear is their 3rd-year enrollment year (the "to" year).
 * Regular students go back 2 years; lateral-entry students go back 1 year.
 * e.g. "2025-26" (regular) → "2023-24"
 */
export function computeFromYear(academicYear: string, admType?: string | null): string {
  const match = academicYear.match(/^(\d{4})-(\d{2})$/);
  if (!match) return academicYear;
  const yearsBack = admType === 'LATERAL' ? 1 : 2;
  const startY = parseInt(match[1], 10) - yearsBack;
  const endY   = parseInt(match[2], 10) - yearsBack;
  return `${startY}-${endY.toString().padStart(2, '0')}`;
}

function buildCCC(student: Student, data: CCCFormData): string {
  const name        = esc(student.studentNameSSLC.trim());
  const courseFull  = CCC_COURSE_NAMES[student.course] ?? esc(student.course);
  const prefix      = student.gender === 'GIRL' ? 'Kum.' : 'Sri.';
  const pronoun     = student.gender === 'GIRL' ? 'She' : 'He';
  const examPeriod  = esc(data.examPeriod);
  const regNumber   = esc(data.regNumber);
  const dateOfIssue = esc(data.dateOfIssue);
  const refNumber   = esc(data.refNumber);
  const startYear   = esc(data.studyFrom);
  const endYear     = esc(data.studyTo);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Course Completion Certificate &#8211; ${name}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    color: #000;
    background: #fff;
  }
  .page {
    min-height: calc(297mm - 16mm);
    display: flex;
    flex-direction: column;
  }

  /* ── Header ── */
  .header {
    position: relative;
    padding: 10pt 14pt 10pt;
    border-bottom: 4pt double #000;
  }
  .header-text {
    text-align: center;
  }
  .college-name {
    font-size: 22pt;
    font-weight: bold;
    letter-spacing: 0.8pt;
    margin-bottom: 3pt;
  }
  .college-tagline {
    font-size: 9pt;
    margin-bottom: 4pt;
  }
  .college-instcode {
    font-size: 13pt;
    font-weight: bold;
    margin-bottom: 3pt;
  }
  .college-address {
    font-size: 10.5pt;
    font-weight: bold;
    margin-bottom: 2pt;
  }
  .college-contact {
    font-size: 10.5pt;
    font-weight: bold;
  }
  .seal-header {
    position: absolute;
    right: 12pt;
    top: 30pt;
    width: 72pt;
    height: 72pt;
    object-fit: contain;
  }

  /* ── Body ── */
  .body {
    flex: 1;
    padding-top: 30pt;
    display: flex;
    flex-direction: column;
  }
  .ref-line {
    font-size: 11pt;
    font-weight: bold;
    margin-bottom: 28pt;
  }
  .ccc-title {
    text-align: center;
    font-size: 14pt;
    font-style: italic;
    font-weight: bold;
    text-decoration: underline;
    letter-spacing: 1pt;
    margin-bottom: 32pt;
  }
  .para {
    font-style: italic;
    font-size: 12pt;
    line-height: 2.1;
    text-align: justify;
    text-indent: 40pt;
    margin-bottom: 0;
  }
  .sign-block {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding-right: 20pt;
    margin-top: 60pt;
    margin-bottom: 6pt;
  }
  .place-date {
    font-size: 11pt;
    font-weight: bold;
    line-height: 1.8;
  }
  .principal-text {
    font-size: 12pt;
    font-weight: bold;
    text-align: center;
    min-width: 90pt;
  }
  .footer-bar {
    margin-top: auto;
    padding-top: 5pt;
    border-top: 1pt solid #000;
    text-align: center;
    font-size: 9pt;
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
    <div class="header-text">
      <div class="college-name">SANJAY MEMORIAL POLYTECHNIC</div>
      <div class="college-tagline">(Approved by A.I.C.T.E., New&#8209;Delhi, and running with Grant&#8209;in&#8209;aid of State Govt. of Karnataka)</div>
      <div class="college-instcode">[Inst. Code: 308]</div>
      <div class="college-address">Ikkeri Road, Sagar &#8211; 577 401, Shimoga Dist., Karnataka.</div>
      <div class="college-contact">Phone: 9449685992</div>
    </div>
    <img class="seal-header" src="${INSTITUTE_LOGO_B64}" alt="Institute Crest" />
  </div>

  <!-- Body -->
  <div class="body">
    <div class="ref-line">Ref: ${refNumber}</div>

    <div class="ccc-title">COURSE COMPLETION CERTIFICATE</div>

    <p class="para">This is to certify that ${prefix} <strong>${name}</strong> was a student of our
      institution studying in ${courseFull} from <strong>${startYear}</strong> to
      <strong>${endYear}</strong> and ${pronoun} has appeared for Sixth Semester Diploma
      Examination held during <strong>${examPeriod}</strong> with Register
      No.<strong>${regNumber}</strong>.</p>

    <div class="sign-block">
      <div class="place-date">
        <div>Place : Sagar</div>
        <div>Date : ${dateOfIssue}</div>
      </div>
      <div class="principal-text">PRINCIPAL</div>
    </div>

    <div class="footer-bar">Email : smp308ppl@gmail.com, Website : www.smpolytechnic.org</div>
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

export function generateCourseCompletionCertificate(student: Student, data: CCCFormData): void {
  const html = buildCCC(student, data);
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
