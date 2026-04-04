import type { Student } from '../types';
import { INSTITUTE_LOGO_B64 } from './instituteLogo';

export const PC_COURSE_NAMES: Record<string, string> = {
  CE: 'Civil Engineering',
  ME: 'Mechanical Engineering',
  EC: 'Electronics &amp; Communication Engineering',
  CS: 'Computer Science &amp; Engineering',
  EE: 'Electrical &amp; Electronics Engineering',
};

export interface PCFormData {
  dateOfIssue: string;  // DD/MM/YYYY
  examPeriod: string;   // e.g. "MAY-2024"
  regNumber: string;
  resultClass: string;  // e.g. "FIRST CLASS"
  isDuplicate: boolean;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPC(student: Student, data: PCFormData): string {
  const name        = esc(student.studentNameSSLC.trim());
  const fatherName  = esc(student.fatherName.trim());
  const courseFull  = PC_COURSE_NAMES[student.course] ?? esc(student.course);
  const prefix      = student.gender === 'GIRL' ? 'Kum.' : 'Sri.';
  const pronoun     = student.gender === 'GIRL' ? 'her' : 'his';
  const examPeriod  = esc(data.examPeriod);
  const regNumber   = esc(data.regNumber);
  const resultClass = esc(data.resultClass.toUpperCase());
  const dateOfIssue = esc(data.dateOfIssue);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Provisional Certificate &#8211; ${name}</title>
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
    margin-bottom: 2pt;
  }
  .college-contact {
    font-size: 10.5pt;
  }
  .seal-header {
    position: absolute;
    right: 12pt;
    top: 18pt;
    width: 72pt;
    height: 72pt;
    object-fit: contain;
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
    margin-top: 10pt;
  }

  /* ── Body ── */
  .body {
    flex: 1;
    padding-top: 28pt;
    display: flex;
    flex-direction: column;
  }
  .date-line {
    text-align: right;
    font-style: italic;
    font-size: 12pt;
    margin-bottom: 24pt;
  }
  .pc-title {
    text-align: center;
    font-size: 14pt;
    font-style: italic;
    font-weight: bold;
    text-decoration: underline;
    letter-spacing: 1pt;
    margin-bottom: 26pt;
  }
  .para {
    font-style: italic;
    font-size: 12pt;
    line-height: 1.75;
    text-align: justify;
    text-indent: 40pt;
    margin-bottom: 26pt;
  }
  .principal {
    text-align: right;
    font-style: italic;
    font-size: 12pt;
    font-weight: bold;
    margin-top: 40pt;
  }
  .footer-note {
    margin-top: auto;
    padding-top: 24pt;
    font-size: 8.5pt;
    font-style: normal;
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

  ${data.isDuplicate ? '<div class="duplicate-banner">DUPLICATE COPY</div>' : ''}

  <!-- Body -->
  <div class="body">
    <div class="date-line">Date : ${dateOfIssue}</div>

    <div class="pc-title">PROVISIONAL CERTIFICATE</div>

    <p class="para">This is to certify that ${prefix} <strong>${name}</strong> S/o <strong>${fatherName}</strong>
      a student of this institution has passed Diploma in ${courseFull}
      conducted by the Board of Technical Examinations, Bangalore held during
      <strong>${examPeriod}</strong> with Register No.<strong>${regNumber}</strong>
      and has been placed <strong>${resultClass}</strong>.</p>

    <p class="para">During the period of ${pronoun} stay in the institution ${pronoun} character
      and conduct were satisfactory.</p>

    <div class="principal">PRINCIPAL</div>

    <div class="footer-note">Note : This Certificate is issued pending issue of original diploma certificate by the Board of Technical Examinations, Bangalore</div>
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

export function generateProvisionalCertificate(student: Student, data: PCFormData): void {
  const html = buildPC(student, data);
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
