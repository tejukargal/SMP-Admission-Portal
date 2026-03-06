import type { Student } from '../types';

const COURSE_NAMES: Record<string, string> = {
  CE: 'CIVIL ENGINEERING',
  ME: 'MECHANICAL ENGINEERING',
  EC: 'ELECTRONICS & COMMUNICATION',
  CS: 'COMPUTER SCIENCE & ENGINEERING',
  EE: 'ELECTRICAL & ELECTRONICS ENGINEERING',
};

const YEAR_LABELS: Record<string, string> = {
  '1ST YEAR': '1st Year',
  '2ND YEAR': '2nd Year',
  '3RD YEAR': '3rd Year',
};

function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLetterPage(student: Student): string {
  const today = formatDate(new Date());
  const courseFull = COURSE_NAMES[student.course] ?? student.course;
  const yearLabel = YEAR_LABELS[student.year] ?? student.year;
  const address = esc((student.address ?? '').trim());
  const fatherName = esc(student.fatherName.trim());
  const studentName = esc(student.studentNameSSLC.trim());
  const regNo = esc(student.regNumber ?? '');

  return `<!DOCTYPE html>
<html lang="kn">
<head>
<meta charset="UTF-8">
<title>ANS Letter - ${studentName}</title>
<style>
  @page { size: A4; margin: 12mm 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    color: #000;
    background: #fff;
  }
  .kn {
    font-family: 'Nirmala UI', 'Noto Sans Kannada', 'Arial Unicode MS', Latha, sans-serif;
  }
  .mono {
    font-family: 'Courier New', Courier, monospace;
    font-size: 10pt;
  }

  /* ── Outer letter box ── */
  .letter-box {
    border: 1.5pt solid #000;
    padding: 12pt 18pt 50pt;
  }

  /* ── Header ── */
  .header {
    text-align: center;
    border-bottom: 1pt solid #000;
    padding-bottom: 8pt;
    margin-bottom: 8pt;
  }
  .college-name {
    font-size: 18pt;
    font-weight: bold;
    letter-spacing: 0.5pt;
  }
  .college-tagline {
    font-size: 8.5pt;
    margin: 3pt 0 2pt;
  }
  .college-address {
    font-size: 10pt;
    font-weight: bold;
    margin: 2pt 0;
  }
  .college-phone {
    font-size: 10pt;
    font-weight: bold;
  }

  /* ── Title row ── */
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 7pt 0 12pt;
    font-size: 10pt;
  }
  .letter-title {
    font-size: 12pt;
    font-weight: bold;
    text-decoration: underline;
  }

  /* ── To + Student details ── */
  .details-row {
    display: flex;
    gap: 10pt;
    margin-bottom: 18pt;
  }
  .to-block {
    flex: 1.1;
    line-height: 1.7;
  }
  .to-block .label { margin-bottom: 2pt; }
  .to-block .father { font-weight: bold; }
  .to-block .addr   { white-space: pre-wrap; margin-top: 2pt; }

  .student-block {
    flex: 1;
    line-height: 1.75;
  }

  /* ── Kannada body ── */
  .body-para {
    font-size: 12pt;
    line-height: 1.9;
    text-align: justify;
    margin-bottom: 8pt;
  }
  .body-para2 {
    font-size: 12pt;
    margin-bottom: 0;
  }

  /* ── Signatures ── */
  .sigs {
    display: flex;
    justify-content: space-between;
    margin-top: 50pt;
    font-size: 11pt;
  }

  /* ── Tear-off section ── */
  .tearoff {
    border: 1.5pt solid #000;
    margin-top: 14pt;
    padding: 12pt 18pt;
  }
  .tearoff-row {
    display: flex;
    gap: 18pt;
    align-items: flex-start;
  }
  .tearoff-to {
    white-space: nowrap;
    padding-top: 2pt;
  }
  .tearoff-name { font-weight: bold; }
  .tearoff-addr { white-space: pre-wrap; margin-top: 3pt; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

  <!-- ── Main letter box ── -->
  <div class="letter-box">

    <!-- Header -->
    <div class="header">
      <div class="college-name">SANJAY MEMORIAL POLYTECHNIC</div>
      <div class="college-tagline">(Approved by AICTE, New Delhi and running with Grant-In-Aid of State Govt. of Karnataka)</div>
      <div class="college-address">Ikkeri Road, Sagar - 577 401, Shivamogga Dist., Karnataka</div>
      <div class="college-phone">Phone : 9449685992</div>
    </div>

    <!-- Title row -->
    <div class="title-row">
      <span>INST CODE : 308</span>
      <span class="letter-title">Intimation Letter</span>
      <span>Date &nbsp;: ${today}</span>
    </div>

    <!-- To / Student Details -->
    <div class="details-row">
      <div class="to-block mono">
        <div class="label">To</div>
        <div class="father">${fatherName}</div>
        <div class="addr">${address}</div>
      </div>
      <div class="student-block mono">
        <div>Student Details :</div>
        <div>Name : ${studentName}</div>
        <div>Reg No.&nbsp;${regNo}</div>
        <div>Course : ${esc(courseFull)}</div>
        <div>${esc(yearLabel)}</div>
      </div>
    </div>

    <!-- Kannada body paragraph 1 -->
    <div class="body-para kn">
      ಮೇಲ್ಕಾಣಿಸಿದ ನಿಮ್ಮ ಮಗ / ಮಗಳಾದ ಇವರು ನಮ್ಮ ಪಾಲಿಟೆಕ್ನಿಕ್ನಲ್ಲಿ ವ್ಯಾಸಂಗ ಮಾಡುತ್ತಿದ್ದ ಇವನು / ಇವಳು ಸರಿಯಾಗಿ
      ಹಾಜರಾಗದೆ&nbsp;&nbsp;ಇರುವುದರಿಂದ ನಿಗದಿತ ಹಾಜರಾತಿ&nbsp;&nbsp;ಇರುವುದಿಲ್ಲ. ಅದ್ದರಿಂದ ತಾವುಗಳು ಖುದ್ದಾಗಿ&nbsp;&nbsp;ಕಾಲೇಜಿಗೆ&nbsp;&nbsp;ಬಂದು
      ಪ್ರಾಂಶುಪಾಲರನ್ನು ಭೇಟಿ ಮಾಡಿ ವಿವರಗಳನ್ನು ಪಡೆಯಲು ಸೂಚಿಸಿದೆ.
    </div>

    <!-- Kannada body paragraph 2 -->
    <div class="body-para2 kn">
      ನಿಗದಿತ ಹಾಜರಾತಿ ಇಲ್ಲದಿದ್ದಲ್ಲಿ ಪರೀಕ್ಷೆಗೆ ಅವಕಾಶ ನೀಡಲಾಗುವುದಿಲ್ಲ
    </div>

    <!-- Signatures -->
    <div class="sigs kn">
      <span>ವಿಭಾಗದ ಮುಖ್ಯಸ್ಥರು</span>
      <span>ಪ್ರಾಂಶುಪಾಲರು</span>
    </div>

  </div>

  <!-- ── Tear-off mailing section ── -->
  <div class="tearoff">
    <div class="tearoff-row mono">
      <div class="tearoff-to">To</div>
      <div>
        <div class="tearoff-name">${fatherName}</div>
        <div class="tearoff-addr">${address}</div>
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

export function generateAnsLetter(student: Student): void {
  const html = buildLetterPage(student);
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
  } else {
    // Popup blocked — fallback: navigate directly
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
