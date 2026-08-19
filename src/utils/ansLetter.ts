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

export function buildAnsLetterHTML(student: Student): string {
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
  @page { size: A4; margin: 6mm 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    color: #000;
    background: #fff;
  }
  @media screen {
    html { background: #94a3b8; min-height: 100%; padding: 24px 0; }
    body { max-width: 680px; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.22); border-radius: 4px; padding: 20px; }
  }
  .kn {
    font-family: 'Nirmala UI', 'Noto Sans Kannada', 'Arial Unicode MS', Latha, sans-serif;
  }
  .mono {
    font-family: 'Courier New', Courier, monospace;
    font-size: 8pt;
  }

  /* ── Half-page wrapper: caps the letter box + tear-off slip together to
       the top half of an A4 page (≈148.5mm) so the bottom half stays blank
       for a second letter to be printed on the same sheet later. ── */
  .half-page {
    max-height: 142mm;
    overflow: hidden;
  }
  .letter-box {
    border: 1.5pt solid #000;
    padding: 8pt 14pt 10pt;
  }

  /* ── Header ── */
  .header {
    text-align: center;
    border-bottom: 1pt solid #000;
    padding-bottom: 5pt;
    margin-bottom: 5pt;
  }
  .college-name {
    font-size: 13pt;
    font-weight: bold;
    letter-spacing: 0.5pt;
  }
  .college-tagline {
    font-size: 7pt;
    margin: 2pt 0 1pt;
  }
  .college-address {
    font-size: 8pt;
    font-weight: bold;
    margin: 1pt 0;
  }
  .college-phone {
    font-size: 8pt;
    font-weight: bold;
  }

  /* ── Title row ── */
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 4pt 0 6pt;
    font-size: 8pt;
  }
  .letter-title {
    font-size: 10pt;
    font-weight: bold;
    text-decoration: underline;
  }

  /* ── To + Student details ── */
  .details-row {
    display: flex;
    gap: 10pt;
    margin-bottom: 8pt;
  }
  .to-block {
    flex: 1.1;
    line-height: 1.5;
  }
  .to-block .label { margin-bottom: 1pt; }
  .to-block .father { font-weight: bold; }
  .to-block .addr   { white-space: pre-wrap; margin-top: 1pt; }

  .student-block {
    flex: 1;
    line-height: 1.55;
  }

  /* ── Kannada body ── */
  .body-para {
    font-size: 10.5pt;
    line-height: 1.5;
    text-align: justify;
    margin-bottom: 6pt;
  }
  .body-para2 {
    font-size: 10.5pt;
    margin-bottom: 0;
  }

  /* ── Signatures ── */
  .sigs {
    display: flex;
    justify-content: space-between;
    margin-top: 34pt;
    font-size: 10pt;
  }

  /* ── Tear-off section: enlarged and bolder so it reads clearly as a
       stand-alone mailing slip once cut/folded off the letter. ── */
  .tearoff {
    border: 1.5pt solid #000;
    margin-top: 14pt;
    padding: 14pt 18pt;
  }
  .tearoff-row {
    display: flex;
    gap: 18pt;
    align-items: flex-start;
    font-size: 13pt;
    font-weight: bold;
  }
  .tearoff-to {
    white-space: nowrap;
    padding-top: 2pt;
  }
  .tearoff-name { font-weight: bold; }
  .tearoff-addr { white-space: pre-wrap; margin-top: 4pt; line-height: 1.45; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

  <div class="half-page">

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
      ಮೇಲ್ಕಾಣಿಸಿದ ನಿಮ್ಮ ಮಗ / ಮಗಳಾದ ಇವರು ನಮ್ಮ ಪಾಲಿಟೆಕ್ನಿಕ್ನಲ್ಲಿ ವ್ಯಾಸಂಗ ಮಾಡುತ್ತಿದ್ದು ಇವನು / ಇವಳು ತರಗತಿಗೆ ಸರಿಯಾಗಿ
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

  </div>

</body>
</html>`;
}

export function generateAnsLetter(student: Student): void {
  const base = buildAnsLetterHTML(student);
  const html = base.replace('</body>', `<script>
    window.onload = function () {
      window.print();
      window.addEventListener('afterprint', function () { window.close(); });
    };
  </script>\n</body>`);
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
